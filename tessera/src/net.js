// Online play over WebRTC. Firebase only carries the handshake (room code,
// SDP, ICE); moves travel on data channels in a star around the host, whose
// browser runs src/room.mjs and is the single source of truth.
import { isFirebaseConfigured } from '../../js/config.js';
import { initFirebase } from '../../js/signaling.js';
import { createStarHost } from '../../js/starGameHost.js';
import { createGuest } from '../../js/guest.js';
import * as rules from './room.mjs';

const HOST_SAVE_KEY = 'tessera.host.v1';
const PID_KEY = 'tessera.pid.v1';

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  drop(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } },
};

function ready() {
  if (!isFirebaseConfigured()) throw new Error('Online play is not set up on this copy of the site.');
  initFirebase();
}

/** A stable id for this tab, so a reload rejoins the same seat (and two tabs are two players). */
function playerId() {
  let id = null;
  try { id = sessionStorage.getItem(PID_KEY); } catch { /* private mode */ }
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `p-${Math.random().toString(16).slice(2)}-${Date.now()}`;
    try { sessionStorage.setItem(PID_KEY, id); } catch { /* private mode */ }
  }
  return id;
}

export const savedHost = () => store.get(HOST_SAVE_KEY, null);
export const dropSavedHost = () => store.drop(HOST_SAVE_KEY);

/** Open a table. `resume` reopens the saved table under the same code. */
export async function host({ name, resume = false, onState, onStatus }) {
  ready();
  const saved = resume ? savedHost() : null;
  const star = createStarHost({
    name: rules.cleanName(name, 'Host'),
    rules,
    initialGame: saved?.game,
    onState,
    onStatus,
    onPersist: ({ roomCode, game }) => store.set(HOST_SAVE_KEY, { roomCode, game, at: Date.now() }),
  });
  const code = await star.start(saved?.roomCode);
  return {
    role: 'host',
    code,
    send: (action, extra) => star.hostIntent(action, extra),
    async leave() { await star.stop(); dropSavedHost(); },
  };
}

/** Sit at someone else's table. */
export async function join({ name, code, onState, onStatus }) {
  ready();
  const guest = createGuest({ name: rules.cleanName(name, 'Guest'), playerId: playerId(), onState, onStatus });
  await guest.join(code);
  return {
    role: 'guest',
    code: code.trim().toUpperCase(),
    send: (action, extra) => guest.sendIntent(action, extra),
    async leave() { await guest.stop(); },
  };
}
