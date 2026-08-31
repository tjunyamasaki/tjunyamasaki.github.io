const MAX_ARCHIVE = 20;

function boardHasContent(game) {
  return Boolean(game?.roster?.length || game?.matches?.length);
}

export function createSessionStore(prefix) {
  const HOST_KEY = `${prefix}.host.v1`;
  const ARCHIVE_KEY = `${prefix}.host.archive.v1`;
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

  function readArchive() {
    const list = read(ARCHIVE_KEY);
    return Array.isArray(list) ? list.filter((entry) => entry?.roomCode && entry?.game) : [];
  }

  function writeArchive(list) {
    write(ARCHIVE_KEY, list.slice(0, MAX_ARCHIVE));
  }

  function seedArchiveFromCurrent() {
    if (readArchive().length) return;
    const current = loadHostSession();
    if (current && boardHasContent(current.game)) {
      writeArchive([current]);
    }
  }

  function upsertHostArchive(entry) {
    if (!entry?.roomCode || !entry?.game) return;
    if (!boardHasContent(entry.game)) {
      writeArchive(readArchive().filter((item) => item.roomCode !== entry.roomCode));
      return;
    }
    const next = readArchive().filter((item) => item.roomCode !== entry.roomCode);
    next.unshift({
      roomCode: entry.roomCode,
      name: entry.name || "",
      savedAt: entry.savedAt || Date.now(),
      game: entry.game,
    });
    writeArchive(next);
  }

  function saveHostSession({ roomCode, name, game }) {
    if (!roomCode || !game) return;
    const entry = { roomCode, name, game, savedAt: Date.now() };
    write(HOST_KEY, entry);
    upsertHostArchive(entry);
  }

  function loadHostSession() {
    const data = read(HOST_KEY);
    if (!data?.roomCode || !data?.game) return null;
    return data;
  }

  function listHostArchives() {
    seedArchiveFromCurrent();
    return readArchive();
  }

  function loadHostArchive(roomCode) {
    if (!roomCode) return null;
    return listHostArchives().find((entry) => entry.roomCode === roomCode) || null;
  }

  function removeHostArchive(roomCode) {
    if (!roomCode) return;
    writeArchive(readArchive().filter((entry) => entry.roomCode !== roomCode));
    const current = loadHostSession();
    if (current?.roomCode === roomCode) clearHostSession();
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
    listHostArchives,
    loadHostArchive,
    removeHostArchive,
    clearHostSession,
    saveGuestSession,
    loadGuestSession,
    clearGuestSession,
  };
}
