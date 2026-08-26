import {
  ICE_CONFIG,
  createRoom,
  deleteRoom,
  listenAnswer,
  listenIce,
  listenNewGuests,
  pushIce,
  rejectGuest,
  writeOffer,
  createIceBuffer,
} from "./signaling.js";
import { getGame } from "./games.js";
import {
  resolvePreset,
  compositionKey,
} from "./gameSettings.js";
import {
  createTableState,
  ensurePlayers,
  snapshotTable,
  resetTable,
  moveAll,
  handZoneId,
  personalZoneId,
} from "./tableState.js";
import {
  DEFAULT_STAT_KEYS,
  emptyPlayerStats,
  ensurePlayerStats,
  setPlayerStatValue,
} from "./stats.js";

export const HOST_ID = "host";
const COLOR_COUNT = 15;
const ACTION_LOG_CAP = 200;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nextFreeColor(players, exceptId) {
  const used = new Set();
  for (const [id, player] of Object.entries(players)) {
    if (id !== exceptId && Number.isInteger(player.color)) used.add(player.color);
  }
  for (let i = 0; i < COLOR_COUNT; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

function ensureColors(players) {
  for (const id of Object.keys(players)) {
    if (!Number.isInteger(players[id].color)) {
      players[id].color = nextFreeColor(players, id);
    }
    ensurePlayerStats(players[id]);
  }
}

export function createHost({
  name,
  onState,
  onStatus,
  onPersist,
  initialState,
  initialSecret,
  gameId: requestedGameId,
}) {
  const connections = new Map();
  let roomCode = "";
  let unsubGuests = () => {};
  const guestUnsubs = new Map();
  let tearingDown = false;

  const lobbyState = initialState || {
    counter: 0,
    players: {
      [HOST_ID]: {
        name,
        ready: false,
        isHost: true,
        connected: true,
        color: 0,
        ...emptyPlayerStats(),
        stats: emptyPlayerStats(),
      },
    },
  };
  if (lobbyState.players[HOST_ID]) {
    lobbyState.players[HOST_ID].name = name;
    lobbyState.players[HOST_ID].connected = true;
    lobbyState.players[HOST_ID].isHost = true;
  }

  let phase = initialSecret?.phase || "lobby";
  let message = initialSecret?.message || "";
  const game = getGame(initialSecret?.gameId || requestedGameId);
  let settings = resolvePreset(game, initialSecret?.settings);
  const ts = createTableState(Object.keys(lobbyState.players), initialSecret, settings);
  let actionLog = Array.isArray(initialSecret?.actionLog)
    ? clone(initialSecret.actionLog)
    : [];
  let autoDecks =
    typeof game.decksForPlayers === "function"
      ? game.decksForPlayers(Object.keys(lobbyState.players).length)
      : null;
  if (autoDecks != null && settings.decks !== autoDecks) autoDecks = null;

  function setStatus(text, error = false) {
    onStatus({ text, error });
  }

  function persist() {
    if (!roomCode) return;
    onPersist?.({
      roomCode,
      name,
      lobbyState,
      secret: { phase, message, gameId: game.id, tableState: ts, settings, actionLog },
    });
  }

  function snapshotFor(viewerId) {
    ensurePlayers(ts, Object.keys(lobbyState.players), settings);
    ensureColors(lobbyState.players);
    const zones = snapshotTable(ts, viewerId, lobbyState.players);
    const snap = {
      phase,
      counter: lobbyState.counter,
      players: clone(lobbyState.players),
      table: zones.table,
      deckCount: zones.deckCount,
      hand: zones.hand,
      handCounts: zones.handCounts,
      shared: zones.shared,
      special: zones.special,
      personal: zones.personal,
      discard: zones.discard,
      discardCount: zones.discardCount,
      discardTop: zones.discardTop,
      playerOrder: zones.playerOrder,
      currentPlayerId: zones.currentPlayerId,
      inactiveIds: zones.inactiveIds,
      bustedIds: zones.bustedIds,
      canUndo: zones.canUndo,
      pot: zones.pot,
      viewerId,
      gameId: game.id,
      gameName: game.name,
      layout: game.layout || "table",
      settings: clone(settings),
      message,
    };
    if (viewerId === HOST_ID) snap.actionLog = clone(actionLog);
    return snap;
  }

  function broadcast() {
    onState(snapshotFor(HOST_ID));
    persist();
    for (const session of connections.values()) {
      if (session.channel?.readyState === "open" && session.playerId) {
        session.channel.send(
          JSON.stringify({
            type: "state",
            lobbyState: snapshotFor(session.playerId),
          })
        );
      }
    }
  }

  function sendTo(channel, obj) {
    if (channel?.readyState === "open") {
      channel.send(JSON.stringify(obj));
    }
  }

  function removeSeat(playerId) {
    if (playerId === HOST_ID) return;
    moveAll(ts, { role: "hand", owner: playerId }, { id: "stock" });
    moveAll(ts, { role: "personal", owner: playerId }, { id: "stock" });
    delete ts.zones[handZoneId(playerId)];
    delete ts.zones[personalZoneId(playerId)];
    ts.playerOrder = ts.playerOrder.filter((id) => id !== playerId);
    if (ts.turnIndex >= ts.playerOrder.length) ts.turnIndex = 0;
    delete lobbyState.players[playerId];
    for (const [guestId, session] of [...connections]) {
      if (session.playerId === playerId) closeGuestLink(guestId);
    }
    syncPresetDecks();
  }

  function syncPresetDecks() {
    if (phase !== "lobby" || typeof game.decksForPlayers !== "function") return;
    const count = Object.keys(lobbyState.players).length;
    const next = game.decksForPlayers(count);
    if (next === settings.decks) {
      autoDecks = next;
      return;
    }
    if (autoDecks != null && settings.decks !== autoDecks) return;
    settings = resolvePreset(game, { ...settings, decks: next });
    resetTable(ts, Object.keys(lobbyState.players), settings);
    autoDecks = next;
    message =
      next === 1
        ? "Using 1 deck (4 or fewer players)."
        : `Using ${next} decks (${count} players).`;
  }

  function summarizeIntent(intent) {
    const parts = [];
    for (const [key, value] of Object.entries(intent || {})) {
      if (key === "type" || key === "action") continue;
      if (value == null || value === "") continue;
      const text =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      parts.push(`${key}=${text}`);
    }
    const detail = parts.join(" ");
    return detail.length > 180 ? detail.slice(0, 177) + "…" : detail;
  }

  function logAction(peerId, intent, extra = {}) {
    const lastN = actionLog.length ? actionLog[actionLog.length - 1].n : 0;
    const cards = (ts.lastDrawn || []).filter(Boolean).join(", ");
    ts.lastDrawn = [];
    actionLog.push({
      n: lastN + 1,
      actor: lobbyState.players[peerId]?.name || peerId,
      action: intent?.action || "?",
      card: cards,
      detail: summarizeIntent(intent),
      error: extra.error || "",
      result: extra.error ? "" : extra.result || "",
    });
    if (actionLog.length > ACTION_LOG_CAP) {
      actionLog.splice(0, actionLog.length - ACTION_LOG_CAP);
    }
  }

  function applyIntent(peerId, intent) {
    ts.lastDrawn = [];
    const player = lobbyState.players[peerId];
    if (!player && intent.action !== "leaveSeat") return;
    let error = "";
    if (intent.action === "ready" && phase === "lobby") {
      player.ready = !player.ready;
    } else if (intent.action === "bump" && phase === "lobby") {
      lobbyState.counter += 1;
    } else if (intent.action === "leaveSeat" && peerId !== HOST_ID) {
      removeSeat(peerId);
    } else if (intent.action === "setColor") {
      const color = Number(intent.color);
      if (!Number.isInteger(color) || color < 0 || color >= COLOR_COUNT) return;
      const taken = Object.entries(lobbyState.players).some(
        ([id, other]) => id !== peerId && other.color === color
      );
      if (taken) {
        error = "That color is taken.";
        setStatus(error, true);
        logAction(peerId, intent, { error });
        broadcast();
        return;
      }
      player.color = color;
    } else if (intent.action === "setPlayerStat" && peerId === HOST_ID) {
      const key = DEFAULT_STAT_KEYS.includes(intent.stat) ? intent.stat : "points";
      const apply = (target) => {
        if (!target) return;
        ensurePlayerStats(target);
        if (intent.value !== undefined && intent.value !== null && intent.value !== "") {
          const value = Math.floor(Number(intent.value));
          if (!Number.isFinite(value)) return;
          setPlayerStatValue(target, key, value);
          return;
        }
        const delta = Number(intent.delta);
        if (!delta) return;
        setPlayerStatValue(target, key, (Number(target.stats[key]) || 0) + delta);
      };
      if (intent.playerId === "all") {
        for (const target of Object.values(lobbyState.players)) apply(target);
      } else {
        apply(lobbyState.players[intent.playerId]);
      }
    } else if (intent.action === "setSettings" && peerId === HOST_ID) {
      const next = resolvePreset(game, { ...settings, ...intent.settings });
      const rebuild = compositionKey(next) !== compositionKey(settings);
      settings = next;
      if (typeof game.decksForPlayers === "function") {
        autoDecks = game.decksForPlayers(Object.keys(lobbyState.players).length);
        if (settings.decks !== autoDecks) autoDecks = null;
      }
      if (rebuild) {
        resetTable(ts, Object.keys(lobbyState.players), settings);
        message = "Deck rebuilt from settings.";
      }
    } else if (game.applyAction) {
      const ctx = {
        ts,
        players: lobbyState.players,
        isHost: peerId === HOST_ID,
        HOST_ID,
        phase,
        message,
        settings,
      };
      const err = game.applyAction(ctx, peerId, intent);
      phase = ctx.phase;
      message = ctx.message;
      if (typeof err === "string") {
        error = err;
        setStatus(err, true);
      }
    }
    logAction(peerId, intent, { error, result: message });
    broadcast();
  }

  function closeGuestLink(guestId) {
    const session = connections.get(guestId);
    if (session) {
      try {
        session.channel?.close();
        session.pc.close();
      } catch {
        /* ignore */
      }
      connections.delete(guestId);
    }
    const stop = guestUnsubs.get(guestId);
    if (stop) {
      stop();
      guestUnsubs.delete(guestId);
    }
  }

  function onDisconnect(guestId) {
    if (tearingDown) return;
    const session = connections.get(guestId);
    const playerId = session?.playerId;
    closeGuestLink(guestId);
    if (playerId && lobbyState.players[playerId]) {
      lobbyState.players[playerId].connected = false;
      broadcast();
    }
  }

  function seatPlayer(playerId, playerName, guestId) {
    if (!playerId) playerId = guestId;
    const session = connections.get(guestId);
    if (session) session.playerId = playerId;

    for (const [otherId, other] of [...connections]) {
      if (otherId !== guestId && other.playerId === playerId) {
        closeGuestLink(otherId);
      }
    }

    const existing = lobbyState.players[playerId];
    if (existing) {
      existing.name = playerName || existing.name;
      existing.connected = true;
      if (!Number.isInteger(existing.color)) {
        existing.color = nextFreeColor(lobbyState.players, playerId);
      }
      ensurePlayerStats(existing);
      ensurePlayers(ts, Object.keys(lobbyState.players), settings);
      if (!ts.playerOrder.includes(playerId)) ts.playerOrder.push(playerId);
      return true;
    }

    if (Object.keys(lobbyState.players).length >= settings.maxPlayers) {
      return false;
    }
    lobbyState.players[playerId] = {
      name: playerName || "Guest",
      ready: false,
      isHost: false,
      connected: true,
      color: nextFreeColor(lobbyState.players, playerId),
      ...emptyPlayerStats(),
      stats: emptyPlayerStats(),
    };
    ensurePlayers(ts, Object.keys(lobbyState.players), settings);
    if (!ts.playerOrder.includes(playerId)) ts.playerOrder.push(playerId);
    syncPresetDecks();
    return true;
  }

  async function attachGuest(guestId, info) {
    if (connections.has(guestId) || info.offer || info.rejected) return;

    const incomingId = info.playerId || guestId;
    const isReturn = Boolean(lobbyState.players[incomingId]);
    if (!isReturn && Object.keys(lobbyState.players).length >= settings.maxPlayers) {
      await rejectGuest(
        roomCode,
        guestId,
        `Lobby is full (${settings.maxPlayers} players).`
      );
      return;
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);
    const ice = createIceBuffer(pc);
    const channel = pc.createDataChannel("lobby");
    connections.set(guestId, { pc, channel, playerId: incomingId });

    const unsubs = [];
    unsubs.push(
      listenAnswer(roomCode, guestId, async (answer) => {
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(answer);
          await ice.markRemoteSet();
        }
      })
    );
    unsubs.push(
      listenIce(roomCode, guestId, false, async (candidate) => {
        try {
          await ice.add(candidate);
        } catch (err) {
          console.warn("host addIceCandidate", err);
        }
      })
    );
    guestUnsubs.set(guestId, () => unsubs.forEach((u) => u()));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        pushIce(roomCode, guestId, true, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (tearingDown) return;
      const state = pc.connectionState;
      if (state === "disconnected" || state === "failed" || state === "closed") {
        onDisconnect(guestId);
      }
    };

    channel.onopen = () => {
      const ok = seatPlayer(incomingId, info.name || "Guest", guestId);
      if (!ok) {
        rejectGuest(roomCode, guestId, "Lobby is full (15 players).");
        closeGuestLink(guestId);
        return;
      }
      const playerId = connections.get(guestId)?.playerId || incomingId;
      sendTo(channel, { type: "state", lobbyState: snapshotFor(playerId) });
      broadcast();
      setStatus("connected");
    };

    channel.onclose = () => onDisconnect(guestId);

    channel.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const playerId = connections.get(guestId)?.playerId || incomingId;
      if (msg.type === "hello") {
        seatPlayer(msg.playerId || playerId, msg.name || info.name, guestId);
        broadcast();
      }
      if (msg.type === "intent") {
        applyIntent(playerId, msg);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await writeOffer(roomCode, guestId, pc.localDescription);
  }

  async function start(existingCode) {
    tearingDown = false;
    setStatus("signaling");
    roomCode = await createRoom(HOST_ID, existingCode);
    unsubGuests = listenNewGuests(roomCode, (guestId, info) => {
      attachGuest(guestId, info).catch((err) => {
        console.error(err);
        setStatus(String(err.message || err), true);
      });
    });
    setStatus("connected");
    broadcast();
    return roomCode;
  }

  function hostIntent(action, extra = {}) {
    applyIntent(HOST_ID, { action, ...extra });
  }

  async function stop() {
    tearingDown = true;
    persist();
    unsubGuests();
    for (const id of [...connections.keys()]) {
      closeGuestLink(id);
    }
    if (roomCode) {
      try {
        await deleteRoom(roomCode);
      } catch (err) {
        console.warn("deleteRoom", err);
      }
    }
  }

  return { start, stop, hostIntent, hostId: HOST_ID };
}
