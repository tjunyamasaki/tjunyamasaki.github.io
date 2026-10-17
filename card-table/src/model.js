// Rule-free table model.
//
// Every card lives in exactly one place: a pile on the table or a player's
// hand. Nothing here knows any game's rules; ops are physical actions
// (move, flip, shuffle, deal...). The host applies ops to the real state and
// sends each player a redacted view; guests apply the same ops to their view
// optimistically and are corrected by the host's next state.

export const PROTOCOL = 'card-table-1';
export const MAX_PLAYERS = 10;
export const CARD_W = 1;
export const CARD_H = 1.4;

export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUITS = ['S', 'H', 'D', 'C'];
export const STD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const COLOR_NAMES = { r: 'Red', y: 'Yellow', g: 'Green', b: 'Blue', w: 'Wild' };
const COLOR_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'R', 'D'];
const COLOR_VALUE_NAMES = { S: 'Skip', R: 'Reverse', D: '+2', W: 'Wild', F: 'Wild +4' };

export const PLAYER_COLORS = ['#f5b942', '#5ec2f2', '#f2706b', '#7ddc8a', '#c792f5', '#f29a5e', '#5ee0d0', '#f27ab8', '#b8c95e', '#9aa8ff'];
export const BACKS = ['navy', 'crimson', 'forest', 'onyx', 'plum', 'teal'];
export const FELTS = ['green', 'blue', 'wine', 'slate', 'sand'];

export const DECK_PRESETS = [
  { id: 'std52', name: 'Standard 52', blurb: 'Poker, Hearts, Rummy, Spades', cfg: { kind: 'std', ranks: STD_RANKS, copies: 1, jokers: 0 } },
  { id: 'std54', name: 'Standard + 2 jokers', blurb: 'Crazy Eights, Canasta-style', cfg: { kind: 'std', ranks: STD_RANKS, copies: 1, jokers: 2 } },
  { id: 'double', name: 'Double deck (108)', blurb: 'Canasta, Buraco, big tables', cfg: { kind: 'std', ranks: STD_RANKS, copies: 2, jokers: 4 } },
  { id: 'deck40', name: '40 cards (no 8, 9, 10)', blurb: 'Truco, Escoba, Fodinha', cfg: { kind: 'std', ranks: ['A', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K'], copies: 1, jokers: 0 } },
  { id: 'deck32', name: '32 cards (7 to A)', blurb: 'Belote, Skat, Piquet', cfg: { kind: 'std', ranks: ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'], copies: 1, jokers: 0 } },
  { id: 'deck24', name: '24 cards (9 to A)', blurb: 'Euchre, Schnapsen', cfg: { kind: 'std', ranks: ['9', '10', 'J', 'Q', 'K', 'A'], copies: 1, jokers: 0 } },
  { id: 'pinochle', name: 'Pinochle (48)', blurb: 'Two of each 9 to A', cfg: { kind: 'std', ranks: ['9', '10', 'J', 'Q', 'K', 'A'], copies: 2, jokers: 0 } },
  { id: 'colors', name: 'Color deck (108)', blurb: 'Uno-style: skips, reverses, wilds', cfg: { kind: 'colors' } },
  { id: 'num104', name: 'Numbers 1–104', blurb: '6 nimmt!, The Mind', cfg: { kind: 'numbers', from: 1, to: 104 } },
  { id: 'num100', name: 'Numbers 2–99', blurb: 'The Game, co-op climbing', cfg: { kind: 'numbers', from: 2, to: 99 } },
];

export class OpError extends Error {}
export class NeedsHost extends Error {}

// ---------------------------------------------------------------- faces

export function parseFace(f) {
  if (!f) return null;
  if (f[0] === 'X') return { kind: 'joker', red: f[1] === 'R' };
  if (f[0] === 'U') return { kind: 'colors', color: f[1], value: f.slice(2) };
  if (f[0] === 'N') return { kind: 'number', n: Number(f.slice(1)) };
  const suit = f.slice(-1);
  return { kind: 'std', rank: f.slice(0, -1), suit, red: suit === 'H' || suit === 'D' };
}

export function faceName(f) {
  const p = parseFace(f);
  if (!p) return 'a card';
  if (p.kind === 'joker') return p.red ? 'red Joker' : 'black Joker';
  if (p.kind === 'colors') {
    if (p.color === 'w') return COLOR_VALUE_NAMES[p.value];
    return `${COLOR_NAMES[p.color]} ${COLOR_VALUE_NAMES[p.value] || p.value}`;
  }
  if (p.kind === 'number') return String(p.n);
  return p.rank + SUIT_SYMBOL[p.suit];
}

const RANK_SORT = Object.fromEntries(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map((r, i) => [r, i]));
const SUIT_SORT = { S: 0, H: 1, C: 2, D: 3 };
const COLOR_SORT = { r: 0, y: 1, g: 2, b: 3, w: 4 };

function sortKey(f, by) {
  const p = parseFace(f);
  if (!p) return [9, 0, 0];
  if (p.kind === 'joker') return [8, p.red ? 1 : 0, 0];
  if (p.kind === 'number') return [1, p.n, 0];
  if (p.kind === 'colors') {
    const v = COLOR_VALUES.indexOf(p.value);
    const value = v < 0 ? 20 + (p.value === 'F' ? 1 : 0) : v;
    return by === 'rank' ? [2, value, COLOR_SORT[p.color]] : [2, COLOR_SORT[p.color], value];
  }
  const r = RANK_SORT[p.rank] ?? 0;
  return by === 'rank' ? [0, r, SUIT_SORT[p.suit]] : [0, SUIT_SORT[p.suit], r];
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function buildFaces(cfg) {
  const faces = [];
  if (cfg.kind === 'colors') {
    for (const c of ['r', 'y', 'g', 'b']) {
      for (const v of COLOR_VALUES) {
        faces.push(`U${c}${v}`);
        if (v !== '0') faces.push(`U${c}${v}`);
      }
    }
    for (let i = 0; i < 4; i++) faces.push('UwW', 'UwF');
    return faces;
  }
  if (cfg.kind === 'numbers') {
    const from = clampInt(cfg.from, 0, 999, 1);
    const to = clampInt(cfg.to, from, Math.min(from + 199, 999), 104);
    for (let n = from; n <= to; n++) faces.push(`N${n}`);
    return faces;
  }
  const ranks = (Array.isArray(cfg.ranks) ? cfg.ranks : STD_RANKS).filter((r) => STD_RANKS.includes(r));
  const copies = clampInt(cfg.copies, 1, 4, 1);
  const jokers = clampInt(cfg.jokers, 0, 8, 0);
  for (let c = 0; c < copies; c++) {
    for (const s of SUITS) for (const r of ranks) faces.push(r + s);
  }
  for (let j = 0; j < jokers; j++) faces.push(j % 2 ? 'XB' : 'XR');
  return faces;
}

// ---------------------------------------------------------------- geometry

export function tableRadius(n) {
  if (n <= 2) return 4.6;
  if (n <= 4) return 5.1;
  if (n <= 6) return 5.7;
  if (n <= 8) return 6.4;
  return 7;
}

export function seatAngle(i, n) {
  return Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, n);
}

export function seatPoint(s, pid, r) {
  const i = s.order.indexOf(pid);
  const a = seatAngle(Math.max(0, i), s.order.length);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

// ---------------------------------------------------------------- state

export function createState({ hostPid, hostName }) {
  const s = {
    v: 1,
    rev: 0,
    seq: 0,
    cards: {},
    piles: {},
    players: {},
    order: [],
    host: hostPid,
    turn: null,
    deck: DECK_PRESETS[0].cfg,
    style: { back: 'navy', felt: 'green' },
    log: [],
  };
  addPlayer(s, hostPid, hostName);
  return s;
}

export function addPlayer(s, pid, name) {
  if (s.players[pid]) {
    s.players[pid].name = cleanName(name) || s.players[pid].name;
    return s.players[pid];
  }
  if (s.order.length >= MAX_PLAYERS) throw new OpError('The table is full.');
  const used = new Set(Object.values(s.players).map((p) => p.color));
  const color = PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[s.order.length % PLAYER_COLORS.length];
  s.players[pid] = { id: pid, name: cleanName(name) || 'Player', hand: [], score: 0, revealed: false, color };
  s.order.push(pid);
  addLog(s, pid, 'sat down at the table');
  return s.players[pid];
}

export function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 18);
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function addLog(s, who, text) {
  s.log.push({ n: ++s.seq, at: Date.now(), who, text });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

export function locate(s) {
  const m = new Map();
  for (const p of Object.values(s.piles)) p.cards.forEach((id, i) => m.set(id, { pile: p, i }));
  for (const pl of Object.values(s.players)) pl.hand.forEach((id, i) => m.set(id, { hand: pl, i }));
  return m;
}

export function pileLabel(p) {
  return p?.name || 'a pile';
}

function newPile(s, { x = 0, z = 0, name = '', layout = 'stack', keep = false, owner = null, role = null }) {
  const r = tableRadius(s.order.length) - 1;
  const d = Math.hypot(x, z);
  if (d > r) { x *= r / d; z *= r / d; }
  const id = `p${++s.seq}`;
  s.piles[id] = { id, name: String(name).slice(0, 24), x: round2(x), z: round2(z), layout, keep, owner, role, cards: [] };
  return s.piles[id];
}

function round2(v) {
  return Math.round(Number(v) * 100) / 100 || 0;
}

function dropEmpty(s, except) {
  for (const p of Object.values(s.piles)) {
    if (!p.cards.length && !p.keep && p !== except) delete s.piles[p.id];
  }
}

function need(ctx) {
  if (!ctx.rng) throw new NeedsHost();
  return ctx.rng;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Shuffled cards get fresh ids so nobody can follow a card they once saw.
function reid(s, list, ctx) {
  return list.map((id) => {
    const nid = ctx.newCardId();
    s.cards[nid] = s.cards[id];
    delete s.cards[id];
    return nid;
  });
}

function publicNames(s, ids) {
  return ids.map((id) => faceName(s.cards[id]?.f)).join(', ');
}

function countText(n) {
  return n === 1 ? 'a card' : `${n} cards`;
}

function findRole(s, role) {
  return Object.values(s.piles).find((p) => p.role === role) || null;
}

export function freeSpot(s, near = { x: 0, z: 0 }) {
  const piles = Object.values(s.piles);
  for (let ring = 0; ring < 8; ring++) {
    const steps = ring === 0 ? 1 : ring * 6;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = near.x + Math.cos(a) * ring * 1.5;
      const z = near.z + Math.sin(a) * ring * 1.7;
      if (piles.every((p) => Math.abs(p.x - x) > 1.3 || Math.abs(p.z - z) > 1.7)) return { x, z };
    }
  }
  return { x: near.x, z: near.z };
}

// ---------------------------------------------------------------- ops

const OPS = {};

OPS.move = (s, op, me) => {
  const ids = [...new Set(Array.isArray(op.ids) ? op.ids : [])].filter((id) => typeof id === 'string');
  if (!ids.length) throw new OpError('Nothing to move.');
  const loc = locate(s);
  const from = ids.map((id) => {
    const l = loc.get(id);
    if (!l) throw new OpError('That card already moved.');
    if (l.hand && l.hand !== me) throw new OpError('Cards in another hand are private.');
    return l;
  });
  const to = op.to || {};
  let destPile = null;
  let destHand = null;
  if (to.pile) {
    destPile = s.piles[to.pile];
    if (!destPile) throw new OpError('That pile is gone.');
  } else if (to.hand) {
    destHand = s.players[to.hand];
    if (!destHand) throw new OpError('That player left.');
  } else if (Number.isFinite(to.x) && Number.isFinite(to.z)) {
    destPile = newPile(s, { x: to.x, z: to.z, layout: to.layout || 'stack' });
  } else {
    throw new OpError('Drop it somewhere.');
  }

  const fromHand = from.every((l) => l.hand);
  const fromPiles = [...new Set(from.filter((l) => l.pile).map((l) => l.pile))];
  const wasUp = ids.map((id) => s.cards[id].up);
  const wasPublic = from.every((l, i) => l.pile && wasUp[i]);

  const gone = new Set(ids);
  for (const p of fromPiles) p.cards = p.cards.filter((id) => !gone.has(id));
  if (from.some((l) => l.hand)) me.hand = me.hand.filter((id) => !gone.has(id));

  if (destHand) {
    for (const id of ids) s.cards[id].up = false;
    const at = clampInt(op.at, 0, destHand.hand.length, destHand.hand.length);
    destHand.hand.splice(at, 0, ...ids);
  } else {
    const top = destPile.cards.length ? s.cards[destPile.cards[destPile.cards.length - 1]] : null;
    const face = op.face || 'keep';
    ids.forEach((id, i) => {
      const c = s.cards[id];
      if (face === 'up') c.up = true;
      else if (face === 'down') c.up = false;
      else if (face === 'match') c.up = top ? top.up : from[i].hand ? true : c.up;
      else if (from[i].hand) c.up = false;
    });
    const at = clampInt(op.at, 0, destPile.cards.length, destPile.cards.length);
    destPile.cards.splice(at, 0, ...ids);
  }
  dropEmpty(s, destPile);

  // Log only what the table could see.
  const n = ids.length;
  const nowPublic = destPile && ids.every((id) => s.cards[id].up);
  const shown = nowPublic || wasPublic ? publicNames(s, ids) : countText(n);
  const srcName = fromPiles.length === 1 ? pileLabel(fromPiles[0]) : 'the table';
  if (destHand === me && fromHand) return { quiet: true };
  if (destHand === me) {
    addLog(s, me.id, wasPublic ? `took ${shown} from ${srcName}` : `drew ${countText(n)} from ${srcName}`);
  } else if (destHand) {
    addLog(s, me.id, `gave ${shown} to ${destHand.name}`);
  } else if (fromHand) {
    const where = destPile.name ? ` to ${destPile.name}` : '';
    addLog(s, me.id, nowPublic ? `played ${shown}${where}` : `played ${countText(n)} face down${where}`);
  } else if (fromPiles.length === 1 && fromPiles[0] === destPile) {
    return {};
  } else {
    addLog(s, me.id, `moved ${shown} from ${srcName} to ${destPile.name || 'the table'}`);
  }
  return {};
};

OPS.take = (s, op, me, ctx) => {
  const other = s.players[op.from];
  if (!other || other === me) throw new OpError('Pick another player.');
  if (!other.hand.length) throw new OpError(`${other.name} has no cards.`);
  const rng = need(ctx);
  const n = clampInt(op.count, 1, other.hand.length, 1);
  const picked = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rng() * other.hand.length);
    picked.push(other.hand.splice(k, 1)[0]);
  }
  for (const id of picked) s.cards[id].up = false;
  me.hand.push(...picked);
  addLog(s, me.id, `took ${countText(n)} at random from ${other.name}`);
};

OPS.flip = (s, op, me) => {
  const loc = locate(s);
  const ids = (Array.isArray(op.ids) ? op.ids : []).filter((id) => loc.get(id)?.pile);
  if (!ids.length) throw new OpError('Only table cards can be flipped.');
  for (const id of ids) s.cards[id].up = !s.cards[id].up;
  const up = ids.filter((id) => s.cards[id].up);
  if (up.length) addLog(s, me.id, `flipped ${publicNames(s, up)}`);
  else addLog(s, me.id, `turned ${countText(ids.length)} face down`);
};

OPS.flipPile = (s, op, me) => {
  const p = s.piles[op.pile];
  if (!p || !p.cards.length) throw new OpError('Nothing to flip.');
  p.cards.reverse();
  for (const id of p.cards) s.cards[id].up = !s.cards[id].up;
  addLog(s, me.id, `turned ${pileLabel(p)} over`);
};

OPS.setFace = (s, op, me) => {
  const p = s.piles[op.pile];
  if (!p || !p.cards.length) throw new OpError('Nothing to flip.');
  for (const id of p.cards) s.cards[id].up = !!op.up;
  addLog(s, me.id, `turned all of ${pileLabel(p)} face ${op.up ? 'up' : 'down'}`);
};

OPS.shuffle = (s, op, me, ctx) => {
  const p = s.piles[op.pile];
  if (!p || p.cards.length < 2) throw new OpError('Not enough cards to shuffle.');
  const rng = need(ctx);
  for (const id of p.cards) s.cards[id].up = false;
  p.cards = reid(s, shuffleInPlace(p.cards, rng), ctx);
  addLog(s, me.id, `shuffled ${pileLabel(p)}`);
};

OPS.cut = (s, op, me, ctx) => {
  const p = s.piles[op.pile];
  if (!p || p.cards.length < 4) throw new OpError('Not enough cards to cut.');
  const rng = need(ctx);
  const n = p.cards.length;
  const k = Math.floor(n * 0.25 + rng() * n * 0.5);
  p.cards = [...p.cards.slice(k), ...p.cards.slice(0, k)];
  addLog(s, me.id, `cut ${pileLabel(p)}`);
};

OPS.movePile = (s, op) => {
  const p = s.piles[op.pile];
  if (!p) throw new OpError('That pile is gone.');
  const r = tableRadius(s.order.length) - 1;
  let x = Number(op.x) || 0;
  let z = Number(op.z) || 0;
  const d = Math.hypot(x, z);
  if (d > r) { x *= r / d; z *= r / d; }
  p.x = round2(x);
  p.z = round2(z);
  return { quiet: true };
};

OPS.merge = (s, op, me) => {
  const a = s.piles[op.from];
  const b = s.piles[op.to];
  if (!a || !b || a === b) throw new OpError('Pick two different piles.');
  const n = a.cards.length;
  if (op.where === 'bottom') b.cards.unshift(...a.cards);
  else b.cards.push(...a.cards);
  a.cards = [];
  if (!a.keep) delete s.piles[a.id];
  addLog(s, me.id, `put ${countText(n)} from ${pileLabel(a)} ${op.where === 'bottom' ? 'under' : 'onto'} ${pileLabel(b)}`);
};

OPS.splitPile = (s, op, me) => {
  const p = s.piles[op.pile];
  if (!p || p.cards.length < 2) throw new OpError('Not enough cards.');
  const n = clampInt(op.count, 1, p.cards.length - 1, Math.floor(p.cards.length / 2));
  const spot = freeSpot(s, { x: p.x + 1.5, z: p.z });
  const q = newPile(s, { ...spot, layout: p.layout });
  q.cards = p.cards.splice(p.cards.length - n, n);
  addLog(s, me.id, `split ${countText(n)} off ${pileLabel(p)}`);
};

OPS.pileSet = (s, op, me) => {
  const p = s.piles[op.pile];
  if (!p) throw new OpError('That pile is gone.');
  if (typeof op.name === 'string') p.name = op.name.replace(/\s+/g, ' ').trim().slice(0, 24);
  if (['stack', 'messy', 'row', 'column', 'grid'].includes(op.layout)) p.layout = op.layout;
  if (typeof op.keep === 'boolean') p.keep = op.keep;
  return { quiet: true };
};

OPS.addPile = (s, op, me) => {
  const spot = Number.isFinite(op.x) && Number.isFinite(op.z) ? { x: op.x, z: op.z } : freeSpot(s);
  const p = newPile(s, { ...spot, name: op.name || 'Pile', layout: op.layout || 'stack', keep: true });
  addLog(s, me.id, `added ${pileLabel(p)}`);
  return { pile: p.id };
};

OPS.removePile = (s, op, me) => {
  const p = s.piles[op.pile];
  if (!p) throw new OpError('That pile is gone.');
  if (p.cards.length) throw new OpError('Empty it first.');
  delete s.piles[p.id];
  addLog(s, me.id, `removed ${pileLabel(p)}`);
};

function seatPile(s, pid) {
  const existing = Object.values(s.piles).find((p) => p.owner === pid && p.role === 'seat');
  if (existing) return existing;
  const pl = s.players[pid];
  const pt = seatPoint(s, pid, tableRadius(s.order.length) * 0.56);
  return newPile(s, { ...pt, name: pl.name, layout: 'row', owner: pid, role: 'seat' });
}

OPS.deal = (s, op, me) => {
  const src = s.piles[op.from];
  if (!src || !src.cards.length) throw new OpError('Nothing to deal.');
  const seats = s.order.filter((pid) => !Array.isArray(op.players) || op.players.includes(pid));
  if (!seats.length) throw new OpError('Pick who gets cards.');
  // Deal starts to the dealer's left, like at a real table.
  const start = Math.max(0, seats.indexOf(me.id) + 1);
  const ring = seats.slice(start).concat(seats.slice(0, start));
  const each = op.count === 'all' ? Infinity : clampInt(op.count, 1, 60, 1);
  let dealt = 0;
  let rounds = 0;
  outer: for (; rounds < each; rounds++) {
    for (const pid of ring) {
      if (!src.cards.length) break outer;
      const id = src.cards.pop();
      dealt++;
      if (op.to === 'table') {
        const p = seatPile(s, pid);
        s.cards[id].up = op.face === 'up';
        p.cards.push(id);
      } else {
        s.cards[id].up = false;
        s.players[pid].hand.push(id);
      }
    }
  }
  dropEmpty(s);
  const per = op.count === 'all' ? 'the rest of' : `${each} each from`;
  addLog(s, me.id, `dealt ${per} ${pileLabel(src)}${op.to === 'table' ? ' onto the table' : ''} (${dealt} cards)`);
};

OPS.sortHand = (s, op, me) => {
  const by = op.by === 'rank' ? 'rank' : 'suit';
  me.hand.sort((a, b) => compareKeys(sortKey(s.cards[a]?.f, by), sortKey(s.cards[b]?.f, by)));
  return { quiet: true };
};

OPS.reorder = (s, op, me) => {
  const ids = Array.isArray(op.ids) ? op.ids : [];
  if (ids.length !== me.hand.length || ids.some((id) => !me.hand.includes(id))) throw new OpError('Your hand changed.');
  me.hand = [...ids];
  return { quiet: true };
};

OPS.reveal = (s, op, me) => {
  me.revealed = !!op.on;
  addLog(s, me.id, me.revealed ? 'showed their hand to the table' : 'hid their hand');
};

OPS.gather = (s, op, me, ctx) => {
  const rng = need(ctx);
  let deck = findRole(s, 'deck');
  if (!deck) deck = newPile(s, { x: -0.95, z: 0, name: 'Deck', keep: true, role: 'deck' });
  const all = Object.keys(s.cards);
  for (const p of Object.values(s.piles)) {
    p.cards = [];
    if (!p.keep) delete s.piles[p.id];
  }
  for (const pl of Object.values(s.players)) {
    pl.hand = [];
    pl.revealed = false;
  }
  for (const id of all) s.cards[id].up = false;
  deck.cards = reid(s, shuffleInPlace(all, rng), ctx);
  addLog(s, me.id, 'gathered every card and shuffled');
};

OPS.newDeck = (s, op, me, ctx) => {
  const rng = need(ctx);
  const cfg = sanitizeDeck(op.cfg);
  const faces = buildFaces(cfg);
  if (!faces.length) throw new OpError('That deck has no cards.');
  s.cards = {};
  s.piles = {};
  for (const pl of Object.values(s.players)) {
    pl.hand = [];
    pl.revealed = false;
  }
  const deck = newPile(s, { x: -0.95, z: 0, name: 'Deck', keep: true, role: 'deck' });
  newPile(s, { x: 0.95, z: 0, name: 'Discard', keep: true, role: 'discard', layout: 'messy' });
  deck.cards = shuffleInPlace(faces, rng).map((f) => {
    const id = ctx.newCardId();
    s.cards[id] = { f, up: false };
    return id;
  });
  s.deck = cfg;
  addLog(s, me.id, `opened a new deck (${faces.length} cards)`);
};

function sanitizeDeck(cfg) {
  if (!cfg || typeof cfg !== 'object') return DECK_PRESETS[0].cfg;
  if (cfg.kind === 'colors') return { kind: 'colors' };
  if (cfg.kind === 'numbers') return { kind: 'numbers', from: clampInt(cfg.from, 0, 999, 1), to: clampInt(cfg.to, 0, 999, 104) };
  return {
    kind: 'std',
    ranks: STD_RANKS.filter((r) => (Array.isArray(cfg.ranks) ? cfg.ranks : STD_RANKS).includes(r)),
    copies: clampInt(cfg.copies, 1, 4, 1),
    jokers: clampInt(cfg.jokers, 0, 8, 0),
  };
}

OPS.score = (s, op, me) => {
  const pl = s.players[op.pid];
  if (!pl) throw new OpError('That player left.');
  const before = pl.score;
  if (Number.isFinite(op.set)) pl.score = clampInt(op.set, -99999, 99999, 0);
  else pl.score = clampInt(pl.score + (Number(op.delta) || 0), -99999, 99999, 0);
  const d = pl.score - before;
  addLog(s, me.id, `${d >= 0 ? 'gave' : 'took'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'} ${d >= 0 ? 'to' : 'from'} ${pl.id === me.id ? 'themself' : pl.name} (${pl.score})`);
};

OPS.resetScores = (s, op, me) => {
  for (const pl of Object.values(s.players)) pl.score = 0;
  addLog(s, me.id, 'reset all scores');
};

OPS.turn = (s, op, me) => {
  if (op.pid === null) {
    s.turn = null;
    addLog(s, me.id, 'cleared the turn marker');
    return;
  }
  let pid = op.pid;
  if (op.step) {
    const n = s.order.length;
    const i = s.order.indexOf(s.turn ?? me.id);
    pid = s.order[(((i + (op.step > 0 ? 1 : -1)) % n) + n) % n];
  }
  if (!s.players[pid]) throw new OpError('That player left.');
  s.turn = pid;
  addLog(s, me.id, pid === me.id ? 'took the turn' : `passed the turn to ${s.players[pid].name}`);
};

OPS.roll = (s, op, me, ctx) => {
  const rng = need(ctx);
  const sides = clampInt(op.sides, 2, 100, 6);
  const count = clampInt(op.count, 1, 6, 1);
  const values = Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
  const text = sides === 2 ? (values[0] === 1 ? 'heads' : 'tails') : `${values.join(' + ')}${count > 1 ? ` = ${values.reduce((a, b) => a + b, 0)}` : ''}`;
  addLog(s, me.id, sides === 2 ? `flipped a coin: ${text}` : `rolled ${count}d${sides}: ${text}`);
  return { noUndo: true };
};

OPS.peek = (s, op, me) => {
  const p = s.piles[op.pile];
  if (!p || !p.cards.length) throw new OpError('Nothing to look at.');
  const all = op.count === 'all';
  const n = all ? p.cards.length : clampInt(op.count, 1, p.cards.length, 1);
  const ids = op.from === 'bottom' ? p.cards.slice(0, n) : p.cards.slice(-n).reverse();
  if (ids.some((id) => s.cards[id].f == null)) throw new NeedsHost();
  addLog(s, me.id, all ? `searched through ${pileLabel(p)}` : `looked at the ${op.from === 'bottom' ? 'bottom' : 'top'} ${n === 1 ? 'card' : `${n} cards`} of ${pileLabel(p)}`);
  return {
    noUndo: true,
    private: { pile: p.id, title: all ? pileLabel(p) : `${op.from === 'bottom' ? 'Bottom' : 'Top'} of ${pileLabel(p)}`, cards: ids.map((id) => ({ id, f: s.cards[id].f, up: s.cards[id].up })) },
  };
};

OPS.style = (s, op) => {
  if (BACKS.includes(op.back)) s.style.back = op.back;
  if (FELTS.includes(op.felt)) s.style.felt = op.felt;
  return { quiet: true };
};

OPS.rename = (s, op, me) => {
  const name = cleanName(op.name);
  if (!name) throw new OpError('Pick a name.');
  const old = me.name;
  me.name = name;
  for (const p of Object.values(s.piles)) if (p.owner === me.id && p.name === old) p.name = name;
  addLog(s, me.id, `is now called ${name}`);
};

OPS.seat = (s, op, me, ctx) => {
  if (!ctx.isHost) throw new OpError('Only the host can move seats.');
  const i = s.order.indexOf(op.pid);
  const j = i + (op.dir > 0 ? 1 : -1);
  if (i < 0 || j < 0 || j >= s.order.length) return { quiet: true };
  [s.order[i], s.order[j]] = [s.order[j], s.order[i]];
  return { quiet: true };
};

function unseat(s, pid) {
  const pl = s.players[pid];
  if (pl.hand.length) {
    const pt = seatPoint(s, pid, tableRadius(s.order.length) * 0.56);
    const p = newPile(s, { ...pt, name: `${pl.name}'s hand` });
    for (const id of pl.hand) s.cards[id].up = false;
    p.cards = pl.hand;
  }
  for (const p of Object.values(s.piles)) if (p.owner === pid) p.owner = null;
  delete s.players[pid];
  s.order = s.order.filter((id) => id !== pid);
  if (s.turn === pid) s.turn = null;
}

OPS.kick = (s, op, me, ctx) => {
  if (!ctx.isHost) throw new OpError('Only the host can remove players.');
  const pl = s.players[op.pid];
  if (!pl || pl.id === s.host) throw new OpError('Pick a guest.');
  unseat(s, pl.id);
  addLog(s, me.id, `asked ${pl.name} to leave`);
};

OPS.leave = (s, op, me) => {
  if (me.id === s.host) throw new OpError('The host keeps the table.');
  unseat(s, me.id);
  addLog(s, me.id, 'left the table');
};

export const OPTIMISTIC = new Set(['move', 'flip', 'flipPile', 'setFace', 'movePile', 'merge', 'pileSet', 'sortHand', 'reorder', 'score', 'turn', 'style', 'deal', 'addPile', 'removePile']);

/**
 * Apply one op in place. ctx: { rng, newCardId, isHost }.
 * Without rng (guest prediction), ops that need chance throw NeedsHost.
 */
export function apply(s, op, actor, ctx = {}) {
  const fn = op && Object.hasOwn(OPS, op.type) ? OPS[op.type] : null;
  if (!fn) throw new OpError('Unknown action.');
  const me = s.players[actor];
  if (!me) throw new OpError('You are not seated.');
  const res = fn(s, op, me, ctx) || {};
  s.rev++;
  return res;
}

// ---------------------------------------------------------------- views

export function canSee(s, loc, card, viewer) {
  if (!loc) return false;
  if (loc.pile) return card.up;
  return loc.hand.id === viewer || loc.hand.revealed;
}

/** What one player is allowed to know. Hidden faces become null. */
export function viewFor(s, viewer) {
  const loc = locate(s);
  const cards = {};
  for (const [id, c] of Object.entries(s.cards)) {
    cards[id] = { f: canSee(s, loc.get(id), c, viewer) ? c.f : null, up: c.up };
  }
  return {
    ...structuredClone({ ...s, cards: undefined, log: undefined }),
    cards,
    log: s.log.slice(-40),
  };
}
