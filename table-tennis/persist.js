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
