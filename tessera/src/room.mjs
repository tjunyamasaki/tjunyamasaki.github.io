// Online table rules for js/starGameHost.js. The host's browser is
// authoritative: it keeps the seats, the game's seed and the action list, and
// checks every move with the rules engine. Because the engine is deterministic,
// clients only need the seed and the actions to rebuild the same kingdom.
import { createGame as createEngine, restoreGame as restoreEngine, placeTile, placeFollower, followerOptions } from './game.mjs';
import { chooseMove } from './ai.mjs';

export const HOST_ID = 'host';
export const MAX_SEATS = 5;
export const MAX_PLAYERS = MAX_SEATS;
export const COLORS = ['#e0453a', '#3d7fe6', '#f0c330', '#a05ee0', '#3b3f4a'];
export const BOT_LEVELS = ['easy', 'normal', 'hard'];
const BOT_NAMES = ['Brann', 'Wren', 'Odile', 'Piet', 'Mabel', 'Ansel', 'Isolde', 'Corvin', 'Elske', 'Tamsin'];
const MAX_NAME = 14;

// The engine holds Maps and Sets, so it lives beside the game, not inside it.
// The game itself stays plain JSON for snapshots and the host's save.
const engines = new WeakMap();

export const cleanName = (raw, fallback = 'Player') => String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || fallback;
const isBotSeat = seat => seat.kind !== 'human' || Boolean(seat.auto);

function freeColor(game) {
  return COLORS.find(c => !game.seats.some(s => s.color === c)) || COLORS[0];
}

function seatOf(game, pid) {
  return game.seats.findIndex(s => s.kind === 'human' && s.pid === pid);
}

export function createGame(hostName) {
  return {
    phase: 'lobby',
    players: { [HOST_ID]: { name: cleanName(hostName, 'Host'), connected: true, isHost: true } },
    seats: [{ kind: 'human', pid: HOST_ID, name: cleanName(hostName, 'Host'), color: COLORS[0] }],
    meadows: true,
    pace: 0.55,
    game: null, // { seed, meadows, players } once play begins
    actions: [],
    round: 0,
    notice: null,
    message: '',
  };
}

export function restoreGame(saved, hostName) {
  const game = { ...createGame(hostName), ...saved };
  for (const p of Object.values(game.players)) p.connected = false;
  if (game.players[HOST_ID]) game.players[HOST_ID].connected = true;
  return game;
}

/** The engine for the current game, rebuilt from the action list when needed. */
export function engineOf(game) {
  if (!game.game) return null;
  let e = engines.get(game);
  if (!e || e.seed !== game.game.seed || e.actions.length !== game.actions.length) {
    e = restoreEngine(game.game, game.actions);
    engines.set(game, e);
  }
  return e;
}

export function canAdmit(game, pid) {
  if (game.players[pid]) return true;
  return game.phase === 'lobby' && game.seats.length < MAX_SEATS;
}

export function addPlayer(game, pid, name) {
  if (!canAdmit(game, pid)) return false;
  const clean = cleanName(name, 'Guest');
  game.players[pid] = { name: clean, connected: true, isHost: false };
  if (seatOf(game, pid) < 0) game.seats.push({ kind: 'human', pid, name: clean, color: freeColor(game) });
  return true;
}

export function reconnectPlayer(game, pid, name) {
  const p = game.players[pid];
  if (!p) return;
  p.connected = true;
  if (name && game.phase === 'lobby') {
    p.name = cleanName(name, p.name);
    const i = seatOf(game, pid);
    if (i >= 0) game.seats[i].name = p.name;
  }
  // A returning player takes their seat back from the stand-in bot.
  const i = seatOf(game, pid);
  if (i >= 0) game.seats[i].auto = false;
}

export function setConnected(game, pid, connected) {
  const p = game.players[pid];
  if (!p) return;
  p.connected = connected;
  // Someone who leaves the lobby gives up their seat; mid-game it waits for them.
  if (!connected && game.phase === 'lobby' && pid !== HOST_ID) {
    const i = seatOf(game, pid);
    if (i >= 0) game.seats.splice(i, 1);
    delete game.players[pid];
  }
}

function enginePlayers(game) {
  return game.seats.map(s => ({
    name: s.name, color: s.color,
    kind: s.kind === 'human' ? 'human' : 'bot',
    level: s.kind === 'human' ? 'normal' : s.kind,
  }));
}

function botPause(game) {
  const e = engineOf(game);
  if (!e || e.phase === 'over') return {};
  if (!isBotSeat(game.seats[e.current])) return {};
  return { pause: 'bot', ms: Math.round(900 + game.pace * 1700) };
}

function fail(game, pid, text) {
  game.notice = { to: pid, text, id: (game.notice?.id || 0) + 1 };
  return {};
}

export function applyAction(game, pid, intent) {
  const action = intent?.action;
  const isHost = pid === HOST_ID;

  if (action === 'color') {
    const i = seatOf(game, pid);
    if (game.phase !== 'lobby' || i < 0) return {};
    const used = new Set(game.seats.map(s => s.color));
    let k = COLORS.indexOf(game.seats[i].color);
    for (let n = 0; n < COLORS.length; n++) { k = (k + 1) % COLORS.length; if (!used.has(COLORS[k])) break; }
    game.seats[i].color = COLORS[k];
    return {};
  }

  if (action === 'tile' || action === 'follower') {
    const e = engineOf(game);
    if (game.phase !== 'playing' || !e || e.phase === 'over') return fail(game, pid, 'The game is not running.');
    const seat = game.seats[e.current];
    if (seat.kind !== 'human' || seat.pid !== pid || seat.auto) return fail(game, pid, 'It is not your turn.');
    try {
      if (action === 'tile') {
        placeTile(e, Number(intent.x), Number(intent.y), Number(intent.rot));
      } else {
        const f = intent.f == null ? null : Number(intent.f);
        placeFollower(e, f);
      }
    } catch (err) {
      return fail(game, pid, err.message || String(err));
    }
    game.actions = e.actions.slice();
    if (e.phase === 'over') game.phase = 'over';
    return action === 'follower' ? botPause(game) : {};
  }

  // Everything below is the host's to decide.
  if (!isHost) return {};

  if (action === 'addBot' && game.phase === 'lobby') {
    if (game.seats.length >= MAX_SEATS) return {};
    const level = BOT_LEVELS.includes(intent.level) ? intent.level : 'normal';
    const name = BOT_NAMES.find(n => !game.seats.some(s => s.name === n)) || 'Bot';
    game.seats.push({ kind: level, name, color: freeColor(game) });
    return {};
  }
  if (action === 'botLevel' && game.phase === 'lobby') {
    const seat = game.seats[intent.seat];
    if (seat && seat.kind !== 'human' && BOT_LEVELS.includes(intent.level)) seat.kind = intent.level;
    return {};
  }
  if (action === 'removeSeat' && game.phase === 'lobby') {
    const seat = game.seats[intent.seat];
    if (!seat || seat.pid === HOST_ID) return {};
    game.seats.splice(intent.seat, 1);
    if (seat.kind === 'human') delete game.players[seat.pid];
    return { kick: seat.pid };
  }
  if (action === 'options' && game.phase === 'lobby') {
    if (typeof intent.meadows === 'boolean') game.meadows = intent.meadows;
    if (Number.isFinite(intent.pace)) game.pace = Math.min(1, Math.max(0, intent.pace));
    return {};
  }
  if (action === 'start' && game.phase === 'lobby') {
    if (game.seats.length < 2) return fail(game, pid, 'Seat at least two players or bots first.');
    const seed = Number.isInteger(intent.seed) ? intent.seed >>> 0 : (Math.random() * 2 ** 32) >>> 0;
    game.game = { seed, meadows: game.meadows, players: enginePlayers(game) };
    game.actions = [];
    game.round++;
    game.phase = 'playing';
    engines.delete(game);
    const e = engineOf(game);
    if (e.phase === 'over') game.phase = 'over';
    const next = botPause(game);
    // Give everyone a moment to watch the first tile land before a bot plays.
    if (next.pause) next.ms += 1500;
    return next;
  }
  if (action === 'auto' && game.phase === 'playing') {
    const seat = game.seats[intent.seat];
    if (!seat || seat.kind !== 'human' || seat.pid === HOST_ID) return {};
    if (intent.on && game.players[seat.pid]?.connected) return {};
    seat.auto = Boolean(intent.on);
    return botPause(game);
  }
  if (action === 'lobby' && (game.phase === 'over' || game.phase === 'playing')) {
    game.phase = 'lobby';
    game.game = null;
    game.actions = [];
    engines.delete(game);
    // Players who left during the game lose their seats now.
    game.seats = game.seats.filter(s => s.kind !== 'human' || game.players[s.pid]?.connected);
    for (const s of game.seats) delete s.auto;
    for (const [id, p] of Object.entries(game.players)) if (!p.connected && id !== HOST_ID) delete game.players[id];
    return {};
  }
  return {};
}

/** Host timer: a bot (or a stand-in for an absent player) takes its turn. */
export function afterPause(game, kind) {
  if (kind !== 'bot' || game.phase !== 'playing') return {};
  const e = engineOf(game);
  if (!e || e.phase === 'over') return {};
  const seat = game.seats[e.current];
  if (!isBotSeat(seat)) return {};
  const level = seat.kind === 'human' ? 'normal' : seat.kind;
  if (e.phase === 'tile') {
    const move = chooseMove(e, level);
    if (!move) return {};
    placeTile(e, move.x, move.y, move.rot);
    placeFollower(e, followerOptions(e).some(o => o.feature === move.feature) ? move.feature : null);
  } else if (e.phase === 'follower') {
    // A stand-in finishing an absent player's half-done turn keeps it simple.
    placeFollower(e, null);
  }
  game.actions = e.actions.slice();
  if (e.phase === 'over') game.phase = 'over';
  return botPause(game);
}

export function snapshotFor(game, pid) {
  const e = engineOf(game);
  return {
    phase: game.phase,
    you: pid,
    isHost: pid === HOST_ID,
    players: Object.fromEntries(Object.entries(game.players).map(([id, p]) => [id, { name: p.name, connected: p.connected, isHost: Boolean(p.isHost) }])),
    seats: game.seats.map(s => ({ ...s, connected: s.kind === 'human' ? Boolean(game.players[s.pid]?.connected) : true })),
    meadows: game.meadows,
    pace: game.pace,
    game: game.game,
    actions: game.actions,
    round: game.round,
    current: e ? e.current : -1,
    notice: game.notice && game.notice.to === pid ? game.notice : null,
  };
}
