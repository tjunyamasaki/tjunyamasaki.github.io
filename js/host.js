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

const HOST_ID = "host";

export function createHost({ name, onState, onStatus, onPersist, initialState }) {
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

  function setStatus(text, error = false) {
    onStatus({ text, error });
  }

  function persist() {
    if (!roomCode) return;
    onPersist?.({ roomCode, name, lobbyState });
  }

  function broadcast() {
    onState({ ...lobbyState, players: { ...lobbyState.players } });
    persist();
    const payload = JSON.stringify({ type: "state", lobbyState });
    for (const session of connections.values()) {
      if (session.channel?.readyState === "open") {
        session.channel.send(payload);
      }
    }
  }

  function sendTo(channel, obj) {
    if (channel?.readyState === "open") {
      channel.send(JSON.stringify(obj));
    }
  }

  function applyIntent(peerId, intent) {
    const player = lobbyState.players[peerId];
    if (!player) return;
    if (intent.action === "ready") {
      player.ready = !player.ready;
    } else if (intent.action === "bump") {
      lobbyState.counter += 1;
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
      sendTo(channel, { type: "state", lobbyState });
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

  function hostIntent(action) {
    applyIntent(HOST_ID, { action });
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
