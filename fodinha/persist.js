const HOST_KEY = "fodinha.host.v1";
const GUEST_KEY = "fodinha.guest.v1";
const PLAYER_ID_KEY = "fodinha.playerId.v1";
const NICK_KEY = "fodinha.nickname";

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("localStorage write failed", err);
  }
}

export function getOrCreatePlayerId() {
  try {
    let id = sessionStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Math.random().toString(16).slice(2)}-${Date.now()}`;
      sessionStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return `p-${Date.now()}`;
  }
}

export function loadNickname() {
  try {
    return localStorage.getItem(NICK_KEY) || "";
  } catch {
    return "";
  }
}

export function saveNickname(name) {
  try {
    if (name) localStorage.setItem(NICK_KEY, name);
  } catch {
    /* ignore */
  }
}

export function saveHostSession({ roomCode, name, game }) {
  if (!roomCode || !game) return;
  write(HOST_KEY, { roomCode, name, game, savedAt: Date.now() });
}

export function loadHostSession() {
  const data = read(HOST_KEY);
  if (!data?.roomCode || !data?.game) return null;
  return data;
}

export function clearHostSession() {
  localStorage.removeItem(HOST_KEY);
}

export function saveGuestSession({ roomCode, name, playerId }) {
  if (!roomCode) return;
  write(GUEST_KEY, {
    roomCode,
    name,
    playerId: playerId || getOrCreatePlayerId(),
    savedAt: Date.now(),
  });
}

export function loadGuestSession() {
  const data = read(GUEST_KEY);
  if (!data?.roomCode) return null;
  return data;
}

export function clearGuestSession() {
  localStorage.removeItem(GUEST_KEY);
}
