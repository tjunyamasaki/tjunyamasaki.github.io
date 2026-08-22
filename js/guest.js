import {
  ICE_CONFIG,
  deleteGuest,
  listenIce,
  listenOffer,
  listenRejected,
  pushIce,
  registerGuest,
  roomExists,
  writeAnswer,
  randomId,
  createIceBuffer,
} from "./signaling.js";

export function createGuest({ name, onState, onStatus }) {
  const guestId = randomId();
  let pc;
  let channel;
  let roomCode = "";
  let unsubs = [];
  let stopped = false;

  function setStatus(text, error = false) {
    onStatus({ text, error });
  }

  function send(obj) {
    if (channel?.readyState === "open") {
      channel.send(JSON.stringify(obj));
    }
  }

  function hostGone() {
    if (stopped) return;
    setStatus("host gone", true);
    teardownPc();
  }

  function teardownPc() {
    channel?.close();
    pc?.close();
    channel = null;
    pc = null;
  }

  async function join(code) {
    roomCode = code.trim().toUpperCase();
    setStatus("signaling");
    const exists = await roomExists(roomCode);
    if (!exists) {
      throw new Error("Room not found.");
    }

    pc = new RTCPeerConnection(ICE_CONFIG);
    const ice = createIceBuffer(pc);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        pushIce(roomCode, guestId, false, event.candidate);
      }
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "disconnected" || state === "failed" || state === "closed") {
        hostGone();
      }
    };
    pc.ondatachannel = (event) => {
      channel = event.channel;
      channel.onopen = () => {
        setStatus("connected");
        send({ type: "hello", name });
      };
      channel.onclose = () => hostGone();
      channel.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "state") {
          onState(msg.lobbyState);
        }
      };
    };

    let offerHandled = false;
    unsubs.push(
      listenOffer(roomCode, guestId, async (offer) => {
        if (offerHandled || stopped) return;
        offerHandled = true;
        setStatus("connecting");
        await pc.setRemoteDescription(offer);
        await ice.markRemoteSet();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await writeAnswer(roomCode, guestId, pc.localDescription);
      })
    );
    unsubs.push(
      listenIce(roomCode, guestId, true, async (candidate) => {
        try {
          await ice.add(candidate);
        } catch (err) {
          console.warn("guest addIceCandidate", err);
        }
      })
    );
    unsubs.push(
      listenRejected(roomCode, guestId, (reason) => {
        setStatus(typeof reason === "string" ? reason : "Join rejected", true);
        teardownPc();
      })
    );

    await registerGuest(roomCode, guestId, name);
    return guestId;
  }

  function sendIntent(action) {
    send({ type: "intent", action });
  }

  async function stop() {
    stopped = true;
    unsubs.forEach((u) => u());
    unsubs = [];
    teardownPc();
    if (roomCode) {
      try {
        await deleteGuest(roomCode, guestId);
      } catch (err) {
        console.warn("deleteGuest", err);
      }
    }
  }

  return { join, stop, sendIntent, guestId };
}
