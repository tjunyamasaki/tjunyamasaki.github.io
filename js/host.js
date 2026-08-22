import {
  ICE_CONFIG,
  MAX_PLAYERS,
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
import { cardsPerPlayer, createDeck, deal, shuffle } from "./cards.js";

export const HOST_ID = "host";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createHost({
  name,
  onState,
  onStatus,
  onPersist,
  initialState,
  initialSecret,
}) {
  const connections = new Map();
  let roomCode = "";
  let unsubGuests = () => {};
  const guestUnsubs = new Map();
  let tearingDown = false;

  const lobbyState = initialState || {
    counter: 0,
    players: {
      [HOST_ID]: { name, ready: false, isHost: true, connected: true },
    },
  };
  if (lobbyState.players[HOST_ID]) {
    lobbyState.players[HOST_ID].name = name;
    lobbyState.players[HOST_ID].connected = true;
    lobbyState.players[HOST_ID].isHost = true;
  }

  let phase = initialSecret?.phase || "lobby";
  let deck = clone(initialSecret?.deck || []);
  let table = clone(initialSecret?.table || []);
  let hands = clone(initialSecret?.hands || { [HOST_ID]: [] });

  function setStatus(text, error = false) {
    onStatus({ text, error });
  }

  function persist() {
    if (!roomCode) return;
    onPersist?.({
      roomCode,
      name,
      lobbyState,
      secret: { phase, deck, table, hands },
    });
  }

  function snapshotFor(viewerId) {
    const handCounts = {};
    for (const id of Object.keys(lobbyState.players)) {
      handCounts[id] = (hands[id] || []).length;
    }
    return {
      phase,
      counter: lobbyState.counter,
      players: clone(lobbyState.players),
      table: clone(table),
      deckCount: deck.length,
      hand: clone(hands[viewerId] || []),
      handCounts,
      viewerId,
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

  function totalCardsInHands() {
    return Object.values(hands).reduce((sum, list) => sum + (list?.length || 0), 0);
  }

  function startDeal() {
    if (phase !== "lobby" && phase !== "ended") return;
    const ids = Object.keys(lobbyState.players);
    const count = cardsPerPlayer(ids.length);
    const dealt = deal(shuffle(createDeck()), ids, count);
    deck = dealt.deck;
    hands = dealt.hands;
    table = [];
    phase = "playing";
  }

  function playCard(peerId, cardId) {
    if (phase !== "playing") return;
    const hand = hands[peerId];
    if (!hand) return;
    const index = hand.findIndex((card) => card.id === cardId);
    if (index < 0) return;
    const [card] = hand.splice(index, 1);
    table.push({ ...card, playedBy: peerId });
    if (totalCardsInHands() === 0) phase = "ended";
  }

  function removeSeat(playerId) {
    if (playerId === HOST_ID) return;
    if (hands[playerId]) {
      deck.push(...hands[playerId]);
      delete hands[playerId];
    }
    delete lobbyState.players[playerId];
    for (const [guestId, session] of [...connections]) {
      if (session.playerId === playerId) closeGuestLink(guestId);
    }
  }

  function applyIntent(peerId, intent) {
    const player = lobbyState.players[peerId];
    if (!player && intent.action !== "leaveSeat") return;
    if (intent.action === "ready" && phase === "lobby") {
      player.ready = !player.ready;
    } else if (intent.action === "bump" && phase === "lobby") {
      lobbyState.counter += 1;
    } else if (intent.action === "start" && peerId === HOST_ID) {
      startDeal();
    } else if (intent.action === "playCard") {
      playCard(peerId, intent.cardId);
    } else if (intent.action === "leaveSeat" && peerId !== HOST_ID) {
      removeSeat(peerId);
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
      if (!hands[playerId]) hands[playerId] = [];
      return true;
    }

    if (Object.keys(lobbyState.players).length >= MAX_PLAYERS) {
      return false;
    }
    lobbyState.players[playerId] = {
      name: playerName || "Guest",
      ready: false,
      isHost: false,
      connected: true,
    };
    if (!hands[playerId]) hands[playerId] = [];
    return true;
  }

  async function attachGuest(guestId, info) {
    if (connections.has(guestId) || info.offer || info.rejected) return;

    const incomingId = info.playerId || guestId;
    const isReturn = Boolean(lobbyState.players[incomingId]);
    if (!isReturn && Object.keys(lobbyState.players).length >= MAX_PLAYERS) {
      await rejectGuest(roomCode, guestId, "Lobby is full (15 players).");
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
