import {
  ICE_CONFIG,
  MAX_PLAYERS as SIGNAL_MAX,
  createRoom,
  deleteRoom,
  listenAnswer,
  listenIce,
  listenNewGuests,
  pushIce,
  rejectGuest,
  writeOffer,
  createIceBuffer,
} from "../js/signaling.js";
import {
  HOST_ID,
  MAX_PLAYERS,
  TRICK_PAUSE_MS,
  HAND_PAUSE_MS,
  createGame,
  restoreGame,
  addPlayer,
  reconnectPlayer,
  setConnected,
  canAdmit,
  applyAction,
  snapshotFor,
  resolveTrick,
  completeHand,
} from "./rules.js";

export { HOST_ID };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createFodinhaHost({
  name,
  onState,
  onStatus,
  onPersist,
  initialGame,
}) {
  const connections = new Map();
  let roomCode = "";
  let unsubGuests = () => {};
  const guestUnsubs = new Map();
  let tearingDown = false;
  let pauseTimer = 0;

  const game = initialGame
    ? restoreGame(initialGame, name)
    : createGame(name);
  if (game.players[HOST_ID]) {
    game.players[HOST_ID].name = name;
    game.players[HOST_ID].connected = true;
    game.players[HOST_ID].isHost = true;
  }

  function setStatus(text, error = false) {
    onStatus?.({ text, error });
  }

  function persist() {
    if (!roomCode) return;
    onPersist?.({ roomCode, name, game: clone(game) });
  }

  function sendTo(channel, obj) {
    if (channel?.readyState === "open") {
      channel.send(JSON.stringify(obj));
    }
  }

  function broadcast() {
    onState(snapshotFor(game, HOST_ID));
    persist();
    for (const session of connections.values()) {
      if (session.channel?.readyState === "open" && session.playerId) {
        sendTo(session.channel, {
          type: "state",
          lobbyState: snapshotFor(game, session.playerId),
        });
      }
    }
  }

  function clearPause() {
    if (pauseTimer) {
      clearTimeout(pauseTimer);
      pauseTimer = 0;
    }
  }

  function schedulePause(kind, ms) {
    clearPause();
    const wait = ms || (kind === "hand" ? HAND_PAUSE_MS : TRICK_PAUSE_MS);
    pauseTimer = setTimeout(() => {
      pauseTimer = 0;
      if (tearingDown) return;
      if (kind === "trick") resolveTrick(game);
      else if (kind === "hand") completeHand(game);
      broadcast();
      if (game.phase === "reveal") schedulePause("hand", HAND_PAUSE_MS);
    }, wait);
  }

  function applyIntent(peerId, intent) {
    const result = applyAction(game, peerId, intent);
    if (result?.error) {
      game.message = result.error;
      setStatus(result.error, true);
    }
    if (result?.pause) schedulePause(result.pause, result.ms);
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
    if (playerId && game.players[playerId] && playerId !== HOST_ID) {
      setConnected(game, playerId, false);
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

    if (game.players[playerId]) {
      reconnectPlayer(game, playerId, playerName);
      return true;
    }
    if (!canAdmit(game, playerId)) return false;
    return addPlayer(game, playerId, playerName || "Guest");
  }

  async function attachGuest(guestId, info) {
    if (connections.has(guestId) || info.offer || info.rejected) return;

    const incomingId = info.playerId || guestId;
    const isReturn = Boolean(game.players[incomingId]);
    if (!isReturn && !canAdmit(game, incomingId)) {
      const reason =
        game.phase !== "lobby"
          ? "Game already started."
          : `Table is full (${MAX_PLAYERS} players).`;
      await rejectGuest(roomCode, guestId, reason);
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
        rejectGuest(
          roomCode,
          guestId,
          `Table is full (${Math.min(MAX_PLAYERS, SIGNAL_MAX)} players).`
        );
        closeGuestLink(guestId);
        return;
      }
      const playerId = connections.get(guestId)?.playerId || incomingId;
      sendTo(channel, { type: "state", lobbyState: snapshotFor(game, playerId) });
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
    clearPause();
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
