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
  freshShoe,
  compositionKey,
} from "./gameSettings.js";
import {
  createTableState,
  ensurePlayers,
  snapshotTable,
  currentPlayerId,
} from "./tableState.js";

export const HOST_ID = "host";
const COLOR_COUNT = 15;

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
    if (!Number.isInteger(players[id].points)) players[id].points = 0;
    if (!Number.isInteger(players[id].lives)) players[id].lives = 0;
    if (!Number.isInteger(players[id].coins)) players[id].coins = 0;
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
      [HOST_ID]: { name, ready: false, isHost: true, connected: true, color: 0, points: 0, lives: 0, coins: 0 },
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
      secret: { phase, message, gameId: game.id, tableState: ts, settings },
    });
  }

  function snapshotFor(viewerId) {
    ensurePlayers(ts, Object.keys(lobbyState.players));
    ensureColors(lobbyState.players);
    const zones = snapshotTable(ts, viewerId, lobbyState.players);
    return {
      phase,
      counter: lobbyState.counter,
      players: clone(lobbyState.players),
      table: zones.shared,
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
      canUndo: zones.canUndo,
      pot: zones.pot,
      viewerId,
      gameId: game.id,
      gameName: game.name,
      usesZones: Boolean(game.usesZones),
      settings: clone(settings),
      message,
    };
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

  function startDeal() {
    if (phase !== "lobby" && phase !== "ended") return false;
    const ids = Object.keys(lobbyState.players);
    if (ids.length < settings.minPlayers) {
      setStatus(`Need at least ${settings.minPlayers} players.`, true);
      return false;
    }
    if (!game.beginRound) return false;
    const dealt = game.beginRound(ids, settings);
    ts.deck = dealt.deck;
    ts.hands = dealt.hands;
    ts.shared = [];
    ts.discard = [];
    ts.special = [];
    message = "";
    phase = "playing";
    return true;
  }

  function playCard(peerId, cardId) {
    if (phase !== "playing") return;
    if (peerId === HOST_ID && currentPlayerId(ts) !== HOST_ID) return;
    const hand = ts.hands[peerId];
    if (!hand) return;
    const index = hand.findIndex((card) => card.id === cardId);
    if (index < 0) return;
    const [card] = hand.splice(index, 1);
    ts.shared.push({ ...card, playedBy: peerId });
    const result = game.afterPlay({
      table: ts.shared,
      hands: ts.hands,
      playerIds: Object.keys(lobbyState.players),
      players: lobbyState.players,
      settings,
    });
    phase = result.phase || phase;
    message = result.message || "";
  }

  function removeSeat(playerId) {
    if (playerId === HOST_ID) return;
    if (ts.hands[playerId]) {
      ts.deck.push(...ts.hands[playerId]);
      delete ts.hands[playerId];
    }
    if (ts.personal[playerId]) {
      ts.deck.push(...ts.personal[playerId]);
      delete ts.personal[playerId];
    }
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
    ts.deck = freshShoe(settings);
    ts.discard = [];
    ts.shared = [];
    ts.special = [];
    for (const id of Object.keys(lobbyState.players)) {
      ts.hands[id] = [];
      ts.personal[id] = [];
    }
    ts.history = [];
    autoDecks = next;
    message =
      next === 1
        ? "Using 1 deck (4 or fewer players)."
        : `Using ${next} decks (${count} players).`;
  }

  function applyIntent(peerId, intent) {
    const player = lobbyState.players[peerId];
    if (!player && intent.action !== "leaveSeat") return;
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
        setStatus("That color is taken.", true);
        return;
      }
      player.color = color;
    } else if (intent.action === "setPlayerStat" && peerId === HOST_ID) {
      const key =
        intent.stat === "lives" ? "lives" : intent.stat === "coins" ? "coins" : "points";
      const cap = key === "coins" ? 999 : 99;
      const apply = (target) => {
        if (!target) return;
        if (intent.value !== undefined && intent.value !== null && intent.value !== "") {
          const value = Math.floor(Number(intent.value));
          if (!Number.isFinite(value)) return;
          target[key] = Math.max(0, Math.min(cap, value));
          return;
        }
        const delta = Number(intent.delta);
        if (!delta) return;
        target[key] = Math.max(0, Math.min(cap, (Number(target[key]) || 0) + delta));
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
        ts.deck = freshShoe(settings);
        ts.discard = [];
        ts.shared = [];
        ts.special = [];
        for (const id of Object.keys(lobbyState.players)) {
          ts.hands[id] = [];
          ts.personal[id] = [];
        }
        ts.history = [];
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
      if (typeof err === "string") setStatus(err, true);
    } else if (intent.action === "start" && peerId === HOST_ID) {
      if (!startDeal()) return;
    } else if (intent.action === "resetGame" && peerId === HOST_ID) {
      const ids = Object.keys(lobbyState.players);
      ts.deck = freshShoe(settings);
      ts.discard = [];
      ts.shared = [];
      ts.special = [];
      for (const id of ids) {
        ts.hands[id] = [];
        ts.personal[id] = [];
      }
      ts.playerOrder = ids.slice();
      ts.turnIndex = 0;
      ts.history = [];
      message = "";
      phase = "lobby";
    } else if (intent.action === "playCard") {
      playCard(peerId, intent.cardId);
    }
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
      if (!Number.isInteger(existing.points)) existing.points = 0;
      if (!Number.isInteger(existing.lives)) existing.lives = 0;
      if (!Number.isInteger(existing.coins)) existing.coins = 0;
      if (!ts.hands[playerId]) ts.hands[playerId] = [];
      if (!ts.personal[playerId]) ts.personal[playerId] = [];
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
      points: 0,
      lives: 0,
      coins: 0,
    };
    if (!ts.hands[playerId]) ts.hands[playerId] = [];
    if (!ts.personal[playerId]) ts.personal[playerId] = [];
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
