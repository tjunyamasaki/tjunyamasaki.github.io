// Driftacre — game state, economy and the Sproutling helpers. No rendering here.
import { CROP, CROPS, BUILDING, DAY_LENGTH, xpForLevel, landNeed, TRAVELERS, WISH_LINES } from './data.js';

export const SAVE_KEY = 'driftacre-save-v1';
export const key = (i, j) => i + ',' + j;
export const parse = k => k.split(',').map(Number);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Runtime-only data (never saved)
export const rt = {
  events: [], silent: false, aura: {}, cozy: 0, helpers: [], reserved: new Set(),
  rev: { land: 1 }, wellAcc: 0, wellTimer: 0,
};
const emit = e => { if (!rt.silent) rt.events.push(e); };

export function newGame(style = 'peach') {
  const s = {
    v: 1, coins: 12, wisps: 0, xp: 0, level: 1, verd: 0, landN: 0, landTokens: 0,
    tiles: {}, owned: {}, stats: { harvests: 0, golden: 0, crops: {} },
    orders: [], orderTimer: 30, nextOrder: 1, seed: 'sunwheat', style,
    sound: true, music: true, clock: 40, rain: 0, lastSeen: Date.now(), created: Date.now(), tut: 0,
  };
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) s.tiles[key(i, j)] = { soil: false, crop: null, b: null };
  // A few ripe-ish sprouts so the very first thing you do is harvest
  for (const [k, p] of [['-1,-1', 1], ['0,-1', 0.98], ['1,-1', 0.92], ['-1,0', 0.7]]) {
    s.tiles[k].soil = true; s.tiles[k].crop = { id: 'sunwheat', p, t: false, g: false };
  }
  s.orders.push({ id: 0, from: 'Pip the Cloudherd', line: 'is new around here too', wants: [{ id: 'sunwheat', q: 6, h: 0 }], coins: 20, xp: 4, wisps: 1 });
  refresh(s);
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !s.tiles) return null;
    refresh(s);
    return s;
  } catch { return null; }
}
export function save(s) {
  s.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

// ---------- derived values ----------
export function refresh(s) {
  rt.aura = {}; rt.cozy = 0;
  for (const k in s.tiles) {
    const b = s.tiles[k].b; if (!b) continue;
    const def = BUILDING[b];
    if (def.cozy) rt.cozy += def.cozy;
    if (def.radius) {
      const [i, j] = parse(k), r = def.radius;
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        if (!di && !dj) continue;
        const a = rt.aura[key(i + di, j + dj)] ||= {};
        if (b === 'drizzle') a.drizzle = true;
        if (b === 'hive') a.hive = true;
        if (b === 'lantern') a.lantern = true;
      }
    }
  }
  syncHelpers(s);
  rt.rev.land++;
}

export const dayPhase = s => s.clock / DAY_LENGTH;
export const isNight = s => { const p = dayPhase(s); return p > 0.63 && p < 0.95; };
export const cozyMult = () => 1 + rt.cozy * 0.01;
export const sellMult = s => 1 + 0.08 * (s.owned.windmill || 0);
export const shrineMult = s => 1 + 0.1 * (s.owned.shrine || 0);
export const tileCount = s => Object.keys(s.tiles).length;
export const helperCount = s => s.owned.hut || 0;
export const nextLandNeed = s => landNeed(s.landN + s.landTokens);
export const stageOf = p => p >= 1 ? 3 : p >= 0.45 ? 2 : p >= 0.12 ? 1 : 0;

export function cropRate(s, k, night) {
  const t = s.tiles[k], c = CROP[t.crop.id], a = rt.aura[k];
  let m = cozyMult();
  if (a?.drizzle) m *= 1.4;
  if (s.rain > 0) m *= 2;
  if (c.night) m *= (night || a?.lantern) ? c.night : (c.day || 1);
  return m / c.time;
}

export function buildCost(s, id) {
  const b = BUILDING[id], n = s.owned[id] || 0;
  return { coins: Math.round(b.cost * Math.pow(b.scale, n)), wisps: b.wisps ? Math.round(b.wisps * Math.pow(b.scale, n)) : 0 };
}

// ---------- actions ----------
export function plant(s, k, id, by = 'player') {
  const t = s.tiles[k], c = CROP[id];
  if (!t || t.b || t.crop) return 'occupied';
  if (c.lvl > s.level) return 'locked';
  if (s.coins < c.cost) return 'poor';
  s.coins -= c.cost;
  const wasSoil = t.soil;
  t.soil = true;
  t.crop = { id, p: 0, t: false, g: Math.random() < 0.03 };
  if (!wasSoil) rt.rev.land++;
  emit({ type: 'plant', k, id, by });
  return 'ok';
}

export function tend(s, k, by = 'player') {
  const t = s.tiles[k];
  if (!t?.crop || t.crop.p >= 1 || t.crop.t) return false;
  t.crop.t = true;
  t.crop.p = Math.min(1, t.crop.p + 0.15);
  emit({ type: 'tend', k, by });
  if (t.crop.p >= 1) emit({ type: 'ripe', k });
  return true;
}

export function harvest(s, k, by = 'player') {
  const t = s.tiles[k];
  if (!t?.crop || t.crop.p < 1) return null;
  const c = CROP[t.crop.id], a = rt.aura[k] || {}, golden = t.crop.g;
  const qty = a.hive && Math.random() < 0.25 ? 2 : 1;
  const coins = Math.round(c.sell * sellMult(s) * (golden ? 5 : 1) * qty);
  const xp = Math.ceil(c.xp * qty * shrineMult(s) * (golden ? 3 : 1));
  const verd = Math.ceil(c.verd * qty * shrineMult(s));
  const wisps = (c.wisp || 0) * qty + (golden && by === 'player' ? 1 : 0);
  t.crop = null;
  s.coins += coins; s.wisps += wisps;
  s.stats.harvests += qty; s.stats.crops[c.id] = (s.stats.crops[c.id] || 0) + qty;
  if (golden) s.stats.golden++;
  for (const o of s.orders) for (const w of o.wants) if (w.id === c.id && w.h < w.q) { w.h = Math.min(w.q, w.h + qty); if (o.wants.every(x => x.h >= x.q)) emit({ type: 'orderReady', o }); }
  const ev = { type: 'harvest', k, id: c.id, coins, wisps, xp, qty, golden, by };
  emit(ev);
  gainXp(s, xp); gainVerd(s, verd);
  return ev;
}

function gainXp(s, xp) {
  s.xp += xp;
  while (s.xp >= xpForLevel(s.level)) {
    s.xp -= xpForLevel(s.level); s.level++;
    const unlocks = [...CROPS.filter(c => c.lvl === s.level).map(c => c.name), ...Object.values(BUILDING).filter(b => b.lvl === s.level).map(b => b.name)];
    emit({ type: 'level', level: s.level, unlocks });
  }
}
function gainVerd(s, v) {
  s.verd += v;
  while (s.verd >= nextLandNeed(s)) { s.verd -= nextLandNeed(s); s.landTokens++; emit({ type: 'landToken' }); }
}

export function build(s, k, id) {
  const t = s.tiles[k], b = BUILDING[id];
  if (!t) return 'nope';
  if (t.b || t.crop) return 'occupied';
  if (b.lvl > s.level) return 'locked';
  if (b.max && (s.owned[id] || 0) >= b.max) return 'max';
  const cost = buildCost(s, id);
  if (s.coins < cost.coins || s.wisps < cost.wisps) return 'poor';
  s.coins -= cost.coins; s.wisps -= cost.wisps;
  t.b = id; t.soil = false;
  s.owned[id] = (s.owned[id] || 0) + 1;
  refresh(s);
  emit({ type: 'build', k, id });
  return 'ok';
}

export function removeAt(s, k) {
  const t = s.tiles[k];
  if (!t) return null;
  if (t.b) {
    const id = t.b;
    s.owned[id]--;
    const cost = buildCost(s, id);
    const refund = { coins: Math.floor(cost.coins / 2), wisps: Math.floor(cost.wisps / 2) };
    s.coins += refund.coins; s.wisps += refund.wisps;
    t.b = null;
    refresh(s);
    emit({ type: 'remove', k, what: 'building', refund });
    return 'building';
  }
  if (t.crop) { t.crop = null; emit({ type: 'remove', k, what: 'crop' }); return 'crop'; }
  if (t.soil) { t.soil = false; rt.rev.land++; emit({ type: 'remove', k, what: 'soil' }); return 'soil'; }
  return null;
}

export function edgeSpots(s) {
  const out = new Set();
  for (const k in s.tiles) {
    const [i, j] = parse(k);
    for (const [di, dj] of N4) { const n = key(i + di, j + dj); if (!s.tiles[n]) out.add(n); }
  }
  return [...out];
}

export function placeLand(s, k) {
  if (s.landTokens < 1 || s.tiles[k]) return null;
  const [i, j] = parse(k);
  if (!N4.some(([di, dj]) => s.tiles[key(i + di, j + dj)])) return null;
  s.tiles[k] = { soil: false, crop: null, b: null };
  s.landTokens--; s.landN++;
  let gift = null;
  const r = Math.random();
  if (r < 0.22) { gift = { coins: Math.round(8 + s.level * 6 + s.landN * 2) }; s.coins += gift.coins; }
  else if (r < 0.3) { gift = { wisps: 1 }; s.wisps += 1; }
  else if (r < 0.42) {
    const options = CROPS.filter(c => c.lvl <= s.level);
    const c = pick(options);
    s.tiles[k].soil = true; s.tiles[k].crop = { id: c.id, p: 0.6, t: false, g: Math.random() < 0.15 };
    gift = { crop: c.name };
  }
  refresh(s);
  emit({ type: 'land', k, gift });
  return gift || {};
}

// ---------- wishes (orders) ----------
export function makeOrder(s) {
  const open = CROPS.filter(c => c.lvl <= s.level);
  const recent = open.slice(-3);
  const n = open.length > 2 && Math.random() < 0.55 ? 2 : 1;
  const chosen = [];
  while (chosen.length < n) { const c = pick(Math.random() < 0.7 ? recent : open); if (!chosen.includes(c)) chosen.push(c); }
  const size = 1 + tileCount(s) / 40;
  const wants = chosen.map(c => ({ id: c.id, q: Math.max(2, Math.round(rand(3, 8) * Math.sqrt(60 / c.time) * size)), h: 0 }));
  const value = wants.reduce((a, w) => a + w.q * CROP[w.id].sell, 0);
  const xpv = wants.reduce((a, w) => a + w.q * CROP[w.id].xp, 0);
  return {
    id: s.nextOrder++, from: pick(TRAVELERS), line: pick(WISH_LINES), wants,
    coins: Math.round(value * 1.6 + 10), xp: Math.round(xpv * 0.5 + 2),
    wisps: Math.random() < 0.35 ? (s.level >= 8 && Math.random() < 0.4 ? 2 : 1) : 0,
  };
}
export function claimOrder(s, id) {
  const i = s.orders.findIndex(o => o.id === id);
  if (i < 0) return null;
  const o = s.orders[i];
  if (!o.wants.every(w => w.h >= w.q)) return null;
  s.orders.splice(i, 1);
  s.coins += o.coins; s.wisps += o.wisps;
  gainXp(s, o.xp);
  if (s.orderTimer > 20) s.orderTimer = 20;
  return o;
}
export function dismissOrder(s, id) {
  const i = s.orders.findIndex(o => o.id === id);
  if (i >= 0) { s.orders.splice(i, 1); s.orderTimer = Math.max(s.orderTimer, 40); }
}

// ---------- simulation ----------
export function wellRate(s) { return (s.owned.well || 0) * (0.3 + tileCount(s) * 0.015); }

function growAll(s, dt, night) {
  for (const k in s.tiles) {
    const c = s.tiles[k].crop;
    if (!c || c.p >= 1) continue;
    c.p = Math.min(1, c.p + cropRate(s, k, night) * dt);
    if (c.p >= 1) emit({ type: 'ripe', k });
  }
}

export function update(s, dt) {
  s.clock = (s.clock + dt) % DAY_LENGTH;
  if (s.rain > 0) s.rain = Math.max(0, s.rain - dt);
  const night = isNight(s);
  growAll(s, dt, night);
  // wells
  const wr = wellRate(s);
  if (wr > 0) {
    rt.wellAcc += wr * dt; rt.wellTimer += dt;
    if (rt.wellTimer > 8 && rt.wellAcc >= 1) {
      const amt = Math.floor(rt.wellAcc); rt.wellAcc -= amt; rt.wellTimer = 0;
      s.coins += amt; emit({ type: 'well', amt });
    }
  }
  // wishes
  if (s.orders.length < 3) {
    s.orderTimer -= dt;
    if (s.orderTimer <= 0) { s.orders.push(makeOrder(s)); s.orderTimer = 50 + Math.random() * 40; emit({ type: 'newOrder' }); }
  }
  for (const h of rt.helpers) helperUpdate(s, h, dt);
}

// Coarse catch-up for time spent away. Helpers harvest and replant; everything else grows.
export function simulateAway(s, seconds) {
  seconds = Math.min(seconds, 12 * 3600);
  const before = { coins: s.coins, wisps: s.wisps, level: s.level, harvests: s.stats.harvests, land: s.landTokens };
  rt.silent = true;
  const helpers = helperCount(s);
  const step = Math.max(2, seconds / 4000);
  let t = 0, cap = 0;
  while (t < seconds) {
    const dt = Math.min(step, seconds - t); t += dt;
    s.clock = (s.clock + dt) % DAY_LENGTH;
    if (s.rain > 0) s.rain = Math.max(0, s.rain - dt);
    growAll(s, dt, isNight(s));
    s.coins += wellRate(s) * dt;
    if (helpers) {
      cap = Math.min(cap + helpers * dt / 5, helpers * 3); // a little slower than live play
      if (cap >= 1) {
        for (const k in s.tiles) {
          if (cap < 1) break;
          const c = s.tiles[k].crop;
          if (c && c.p >= 1) { const id = c.id; harvest(s, k, 'helper'); plant(s, k, id, 'helper'); cap--; }
        }
      }
    }
    if (s.orders.length < 3) { s.orderTimer -= dt; if (s.orderTimer <= 0) { s.orders.push(makeOrder(s)); s.orderTimer = 60; } }
  }
  s.coins = Math.floor(s.coins);
  rt.silent = false;
  rt.rev.land++;
  return {
    seconds, coins: s.coins - before.coins, wisps: s.wisps - before.wisps, levels: s.level - before.level,
    harvests: s.stats.harvests - before.harvests, land: s.landTokens - before.land,
  };
}

// ---------- Sproutlings ----------
function hutKeys(s) { return Object.keys(s.tiles).filter(k => s.tiles[k].b === 'hut'); }
function syncHelpers(s) {
  const huts = hutKeys(s);
  while (rt.helpers.length > huts.length) { const h = rt.helpers.pop(); if (h.task) rt.reserved.delete(h.task.k); }
  rt.helpers.forEach((h, idx) => { h.home = huts[idx]; });
  while (rt.helpers.length < huts.length) {
    const home = huts[rt.helpers.length];
    const [i, j] = parse(home);
    rt.helpers.push({ x: i, z: j + 0.35, path: [], task: null, wait: 0, idle: Math.random(), face: 1, home, hop: Math.random() * 6, born: performance.now() });
  }
}

function bfs(s, start, test) {
  const prev = new Map([[start, null]]);
  const q = [start];
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    if (test(cur)) { const path = []; let c = cur; while (c !== start) { path.unshift(c); c = prev.get(c); } return { k: cur, path }; }
    const [i, j] = parse(cur);
    for (const [di, dj] of N4) {
      const n = key(i + di, j + dj);
      if (s.tiles[n] && !prev.has(n)) { prev.set(n, cur); q.push(n); }
    }
  }
  return null;
}

function helperUpdate(s, h, dt) {
  h.hop += dt;
  if (h.wait > 0) {
    h.wait -= dt;
    if (h.wait <= 0 && h.task) {
      const { type, k } = h.task;
      rt.reserved.delete(k); h.task = null;
      if (type === 'harvest') { const t = s.tiles[k]; const id = t?.crop?.id; if (harvest(s, k, 'helper')) plant(s, k, id, 'helper'); }
      else if (type === 'tend') tend(s, k, 'helper');
      h.wait = 0.5;
    }
    return;
  }
  if (h.path.length) {
    const [ti, tj] = parse(h.path[0]);
    const dx = ti - h.x, dz = tj - h.z, d = Math.hypot(dx, dz), sp = 1.5 * dt;
    if (d <= sp) { h.x = ti; h.z = tj; h.path.shift(); if (!h.path.length && h.task) h.wait = 0.6; }
    else { h.x += dx / d * sp; h.z += dz / d * sp; }
    h.dx = dx; h.dz = dz;
    // task vanished (player harvested it first)
    if (h.task && !taskValid(s, h.task)) { rt.reserved.delete(h.task.k); h.task = null; h.path.length = Math.min(h.path.length, 1); }
    return;
  }
  h.idle -= dt;
  if (h.idle > 0) return;
  const here = key(Math.round(h.x), Math.round(h.z));
  if (!s.tiles[here]) { const [i, j] = parse(h.home || '0,0'); h.x = i; h.z = j; return; }
  const found = bfs(s, here, k => !rt.reserved.has(k) && taskValid(s, { type: 'harvest', k }))
    || bfs(s, here, k => !rt.reserved.has(k) && taskValid(s, { type: 'tend', k }));
  if (found) {
    const type = s.tiles[found.k].crop.p >= 1 ? 'harvest' : 'tend';
    h.task = { type, k: found.k }; rt.reserved.add(found.k);
    h.path = found.path;
    if (!h.path.length) h.wait = 0.4;
  } else {
    // potter about near home
    const [i, j] = parse(here);
    const opts = N4.map(([di, dj]) => key(i + di, j + dj)).filter(n => s.tiles[n]);
    if (opts.length && Math.random() < 0.6) h.path = [pick(opts)];
    h.idle = 1.5 + Math.random() * 2.5;
  }
}
function taskValid(s, task) {
  const c = s.tiles[task.k]?.crop;
  if (!c) return false;
  return task.type === 'harvest' ? c.p >= 1 : (c.p < 0.85 && !c.t);
}
