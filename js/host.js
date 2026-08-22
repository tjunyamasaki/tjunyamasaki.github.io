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
      [HOST_ID]: { name, ready: false, isHost: true },
    },
  };
  if (lobbyState.players[HOST_ID]) {
    lobbyState.players[HOST_ID].name = name;
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
    };
  }

  function broadcast() {
    onState(snapshotFor(HOST_ID));
    persist();
    for (const [guestId, session] of connections) {
      if (session.channel?.readyState === "open") {
        session.channel.send(
          JSON.stringify({ type: "state", lobbyState: snapshotFor(guestId) })
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

  function applyIntent(peerId, intent) {
    const player = lobbyState.players[peerId];
    if (!player) return;
    if (intent.action === "ready" && phase === "lobby") {
      player.ready = !player.ready;
    } else if (intent.action === "bump" && phase === "lobby") {
      lobbyState.counter += 1;
    } else if (intent.action === "start" && peerId === HOST_ID) {
      startDeal();
    } else if (intent.action === "playCard") {
      playCard(peerId, intent.cardId);
    }
    broadcast();
  }

  function dropGuest(guestId) {
    const session = connections.get(guestId);
    if (session) {
      session.channel?.close();
      session.pc.close();
      connections.delete(guestId);
    }
    const stop = guestUnsubs.get(guestId);
    if (stop) {
      stop();
      guestUnsubs.delete(guestId);
    }
    if (!tearingDown && lobbyState.players[guestId]) {
      delete lobbyState.players[guestId];
      if (hands[guestId]) {
        deck.push(...hands[guestId]);
        delete hands[guestId];
      }
      broadcast();
    }
  }

  async function attachGuest(guestId, info) {
    if (connections.has(guestId) || info.offer || info.rejected) return;

    if (connections.size + 1 >= MAX_PLAYERS) {
      await rejectGuest(roomCode, guestId, "Lobby is full (15 players).");
      return;
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);
    const ice = createIceBuffer(pc);
    const channel = pc.createDataChannel("lobby");
    connections.set(guestId, { pc, channel });

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
        dropGuest(guestId);
      }
    };

    channel.onopen = () => {
      const guestName = info.name || "Guest";
      lobbyState.players[guestId] = {
        name: guestName,
        ready: false,
        isHost: false,
      };
      if (!hands[guestId]) hands[guestId] = [];
      sendTo(channel, { type: "state", lobbyState: snapshotFor(guestId) });
      broadcast();
      setStatus("connected");
    };

    channel.onclose = () => {
      if (!tearingDown) dropGuest(guestId);
    };

    channel.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "hello" && msg.name) {
        if (lobbyState.players[guestId]) {
          lobbyState.players[guestId].name = msg.name;
          broadcast();
        }
      }
      if (msg.type === "intent") {
        applyIntent(guestId, msg);
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
      dropGuest(id);
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
