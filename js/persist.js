const HOST_KEY = "lobby.host.v1";
const GUEST_KEY = "lobby.guest.v1";
const PLAYER_ID_KEY = "lobby.playerId.v1";

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

export function lobbyStateForResume(saved, hostName) {
  const players = {};
  const source = saved?.players || {};
  for (const [id, player] of Object.entries(source)) {
    players[id] = {
      ...player,
      connected: id === "host",
    };
  }
  if (!players.host) {
    players.host = { name: hostName || "Host", ready: false, isHost: true, connected: true };
  }
  players.host.name = hostName || players.host.name;
  players.host.isHost = true;
  players.host.connected = true;
  return {
    counter: saved?.counter ?? 0,
    players,
  };
}

export function secretForResume(savedSecret) {
  if (!savedSecret) {
    return { phase: "lobby", gameId: "freeplay", message: "" };
  }
  return {
    phase: savedSecret.phase || "lobby",
    gameId: savedSecret.gameId || "freeplay",
    message: savedSecret.message || "",
    tableState: savedSecret.tableState || null,
    deck: savedSecret.deck,
    table: savedSecret.table,
    hands: savedSecret.hands,
  };
}
