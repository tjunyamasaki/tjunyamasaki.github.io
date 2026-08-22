import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  push,
  onValue,
  onChildAdded,
  update,
  remove,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { firebaseConfig } from "./config.js";

export const MAX_PLAYERS = 15;
export const ICE_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let app;
let db;

export function initFirebase() {
  if (db) return db;
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  return db;
}

export function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

export function randomRoomCode() {
  let code = "";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    code += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
  }
  return code;
}

export function roomRef(code, ...parts) {
  const path = ["rooms", code, ...parts].join("/");
  return ref(db, path);
}

export async function createRoom(hostId) {
  const code = randomRoomCode();
  await set(roomRef(code), {
    hostId,
    createdAt: Date.now(),
  });
  return code;
}

export async function roomExists(code) {
  const snap = await get(roomRef(code));
  return snap.exists();
}

export async function registerGuest(code, guestId, name) {
  await set(roomRef(code, "guests", guestId), {
    name,
    joinedAt: Date.now(),
  });
}

export function listenNewGuests(code, onGuest) {
  return onChildAdded(roomRef(code, "guests"), (snap) => {
    onGuest(snap.key, snap.val() || {});
  });
}

export async function writeOffer(code, guestId, offer) {
  await update(roomRef(code, "guests", guestId), {
    offer: { type: offer.type, sdp: offer.sdp },
  });
}

export async function writeAnswer(code, guestId, answer) {
  await update(roomRef(code, "guests", guestId), {
    answer: { type: answer.type, sdp: answer.sdp },
  });
}

export async function rejectGuest(code, guestId, reason) {
  await update(roomRef(code, "guests", guestId), { rejected: reason });
}

export function listenOffer(code, guestId, onOffer) {
  return onValue(roomRef(code, "guests", guestId, "offer"), (snap) => {
    const val = snap.val();
    if (val) onOffer(val);
  });
}

export function listenAnswer(code, guestId, onAnswer) {
  return onValue(roomRef(code, "guests", guestId, "answer"), (snap) => {
    const val = snap.val();
    if (val) onAnswer(val);
  });
}

export function listenRejected(code, guestId, onRejected) {
  return onValue(roomRef(code, "guests", guestId, "rejected"), (snap) => {
    const val = snap.val();
    if (val) onRejected(val);
  });
}

export async function pushIce(code, guestId, fromHost, candidate) {
  if (!candidate) return;
  const list = fromHost ? "iceHost" : "iceGuest";
  await push(roomRef(code, "guests", guestId, list), {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
  });
}

export function listenIce(code, guestId, fromHost, onCandidate) {
  const list = fromHost ? "iceHost" : "iceGuest";
  return onChildAdded(roomRef(code, "guests", guestId, list), (snap) => {
    onCandidate(snap.val());
  });
}

export async function deleteRoom(code) {
  await remove(roomRef(code));
}

export async function deleteGuest(code, guestId) {
  await remove(roomRef(code, "guests", guestId));
}

/** Queue ICE until setRemoteDescription has run. */
export function createIceBuffer(pc) {
  const pending = [];
  let ready = false;
  return {
    async markRemoteSet() {
      ready = true;
      for (const ice of pending) {
        await pc.addIceCandidate(ice);
      }
      pending.length = 0;
    },
    async add(ice) {
      if (!ice?.candidate) return;
      if (ready) await pc.addIceCandidate(ice);
      else pending.push(ice);
    },
  };
}
