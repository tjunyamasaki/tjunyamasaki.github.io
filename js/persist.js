const HOST_KEY = "lobby.host.v1";
const GUEST_KEY = "lobby.guest.v1";

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

export function saveHostSession({ roomCode, name, lobbyState, secret }) {
  if (!roomCode || !lobbyState) return;
  write(HOST_KEY, {
    roomCode,
    name,
    lobbyState,
    secret: secret || null,
    savedAt: Date.now(),
  });
}

export function loadHostSession() {
  const data = read(HOST_KEY);
  if (!data?.roomCode || !data?.lobbyState) return null;
  return data;
}

export function clearHostSession() {
  localStorage.removeItem(HOST_KEY);
}

export function saveGuestSession({ roomCode, name }) {
  if (!roomCode) return;
  write(GUEST_KEY, { roomCode, name, savedAt: Date.now() });
}

export function loadGuestSession() {
  const data = read(GUEST_KEY);
  if (!data?.roomCode) return null;
  return data;
}

export function clearGuestSession() {
  localStorage.removeItem(GUEST_KEY);
}

/** Hosts come back alone; old WebRTC peer ids are dead. */
export function lobbyStateForResume(saved, hostName) {
  const host = saved?.players?.host || {
    name: hostName || "Host",
    ready: false,
    isHost: true,
  };
  host.name = hostName || host.name;
  host.isHost = true;
  return {
    counter: saved?.counter ?? 0,
    players: { host },
  };
}

export function secretForResume(savedSecret) {
  if (!savedSecret) {
    return { phase: "lobby", deck: [], table: [], hands: { host: [] } };
  }
  return {
    phase: savedSecret.phase || "lobby",
    deck: savedSecret.deck || [],
    table: savedSecret.table || [],
    hands: { host: savedSecret.hands?.host || [] },
  };
}
