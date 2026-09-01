import { createSessionStore } from "../js/sessionStore.js";

const store = createSessionStore("table-tennis");

export const getOrCreatePlayerId = store.getOrCreatePlayerId;
export const loadNickname = store.loadNickname;
export const saveNickname = store.saveNickname;
export const saveHostSession = store.saveHostSession;
export const loadHostSession = store.loadHostSession;
export const clearHostSession = store.clearHostSession;
export const saveGuestSession = store.saveGuestSession;
export const loadGuestSession = store.loadGuestSession;
export const clearGuestSession = store.clearGuestSession;

const EDITOR_KEY = "table-tennis.editor.v1";

export function saveEditorSession({ user, password }) {
  if (!user || !password) return;
  try {
    localStorage.setItem(
      EDITOR_KEY,
      JSON.stringify({ user, password, savedAt: Date.now() })
    );
  } catch (err) {
    console.warn("localStorage write failed", err);
  }
}

export function loadEditorSession() {
  try {
    const raw = localStorage.getItem(EDITOR_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.user || !data?.password) return null;
    return { user: String(data.user), password: String(data.password) };
  } catch {
    return null;
  }
}

export function clearEditorSession() {
  try {
    localStorage.removeItem(EDITOR_KEY);
  } catch {
    /* ignore */
  }
}
