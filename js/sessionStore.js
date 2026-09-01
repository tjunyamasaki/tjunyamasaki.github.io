export function createSessionStore(prefix) {
  const HOST_KEY = `${prefix}.host.v1`;
  const GUEST_KEY = `${prefix}.guest.v1`;
  const PLAYER_ID_KEY = `${prefix}.playerId.v1`;
  const NICK_KEY = `${prefix}.nickname`;

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

  function getOrCreatePlayerId() {
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

  function loadNickname() {
    try {
      return localStorage.getItem(NICK_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveNickname(name) {
    try {
      if (name) localStorage.setItem(NICK_KEY, name);
    } catch {
      /* ignore */
    }
  }

  function saveHostSession({ roomCode, name, game }) {
    if (!roomCode || !game) return;
    write(HOST_KEY, { roomCode, name, game, savedAt: Date.now() });
  }

  function loadHostSession() {
    const data = read(HOST_KEY);
    if (!data?.roomCode || !data?.game) return null;
    return data;
  }

  function clearHostSession() {
    localStorage.removeItem(HOST_KEY);
  }

  function saveGuestSession({ roomCode, name, playerId }) {
    if (!roomCode) return;
    write(GUEST_KEY, {
      roomCode,
      name,
      playerId: playerId || getOrCreatePlayerId(),
      savedAt: Date.now(),
    });
  }

  function loadGuestSession() {
    const data = read(GUEST_KEY);
    if (!data?.roomCode) return null;
    return data;
  }

  function clearGuestSession() {
    localStorage.removeItem(GUEST_KEY);
  }

  return {
    getOrCreatePlayerId,
    loadNickname,
    saveNickname,
    saveHostSession,
    loadHostSession,
    clearHostSession,
    saveGuestSession,
    loadGuestSession,
    clearGuestSession,
  };
}
