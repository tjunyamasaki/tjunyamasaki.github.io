// Satoyama's two places, the farm and the wilds: their walkable shape, ground colours, the nodes that
// start on them and the standing decoration. Deterministic from (seed, place) and cached, like worldgen.mjs:
// guests rebuild the world from snapshots every frame and walkable() runs inside every collision test.
// Pure: import only content/progression. Never engine.mjs, a renderer or the DOM.
//
// The farm   a valley clearing ringed by forest, cluttered with weeds, twigs, stones and stumps to clear
//            (Stardew-like), a few sakura and pines, rocks, a pond somewhere, and a path out north to the
//            torii that leads to the wilds. Nothing in the middle: the base is yours to make.
// The wilds  a cedar crossing (where the torii home stands) and three places beyond it, each with its own
//            dead and what only it gives: the Bamboo Thicket (bamboo), the Spider-lily Marsh (iron sand,
//            dark pools) and the Hot-spring Terrace (spring salt, steaming pools).
//
// Grid codes follow worldgen.mjs TERRAIN: 0 ground (walkable), 1 water, 2 wood (a forest wall), 4 void.

import {NODES} from '../content.mjs?v=harvest-18';
import {valueNoise} from '../progression.mjs?v=harvest-18';

export const LAND_CELL = .5;
/** The building grid's cell (homestead.mjs CELL), for the farmhouse's plot. */
const GRID_CELL = 1.5;
export const PLACES = Object.freeze({
  farm: Object.freeze({name: 'The Farm', extent: 40}),
  wilds: Object.freeze({name: 'The Wilds', extent: 84}),
});
/** Zones a wanderer can stand in (World.regionOf), named like progression.REGIONS. */
export const ZONES = Object.freeze({
  satofarm: {name: 'The Farm', tier: 0},
  sugimori: {name: 'The Cedar Crossing', tier: 1},
  chikurin: {name: 'The Bamboo Thicket', tier: 1},
  higan: {name: 'The Spider-lily Marsh', tier: 2},
  onsen: {name: 'The Hot-spring Terrace', tier: 3},
  hakaba: {name: 'The Nameless Graveyard', tier: 2},
});
const G = 0, W = 1, T = 2, V = 4;
/** Detail flags (as worldgen.mjs DETAIL): a worn trail, a hot spring, the marsh's black water. */
export const LAND_DETAIL = Object.freeze({trail: 2, black: 16, spring: 32});

function rngFor(seed){let a = seed >>> 0;return () => {a += 0x6D2B79F5;let t = a;t = Math.imul(t ^ t >>> 15, t | 1);t ^= t + Math.imul(t ^ t >>> 7, t | 61);return ((t ^ t >>> 14) >>> 0) / 4294967296;};}
const smooth = (a, b, v) => {const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);return t * t * (3 - 2 * t);};
const round2 = v => Math.round(v * 100) / 100;

const CACHE = new Map();
/** The shape of a place for a seed (cached; four at most). */
export function placeShape(seed, place){
  const key = `${seed >>> 0}|${place}`;
  let shape = CACHE.get(key);
  if(!shape){
    if(CACHE.size >= 4) CACHE.delete(CACHE.keys().next().value);
    shape = place === 'wilds' ? buildWilds(seed >>> 0) : buildFarm(seed >>> 0);
    CACHE.set(key, shape);
  }
  return shape;
}

// ------------------------------------------------------------------ grid helpers
function makeGrid(extent){
  const N = Math.round(extent * 2 / LAND_CELL);
  return {extent, N, grid: new Uint8Array(N * N).fill(T), detail: new Uint8Array(N * N), zone: new Uint8Array(N * N)};
}
const cellIndex = (s, x, z) => {const i = Math.floor((x + s.extent) / LAND_CELL), j = Math.floor((z + s.extent) / LAND_CELL);return i < 0 || j < 0 || i >= s.N || j >= s.N ? -1 : j * s.N + i;};
const cellX = (s, k) => -s.extent + ((k % s.N) + .5) * LAND_CELL;
const cellZ = (s, k) => -s.extent + (((k / s.N) | 0) + .5) * LAND_CELL;
/** Visit every cell whose centre lies within `reach` of (x, z): fn(k, cx, cz, distance). */
function each(s, x, z, reach, fn){
  const i0 = Math.max(0, Math.floor((x - reach + s.extent) / LAND_CELL)), i1 = Math.min(s.N - 1, Math.floor((x + reach + s.extent) / LAND_CELL));
  const j0 = Math.max(0, Math.floor((z - reach + s.extent) / LAND_CELL)), j1 = Math.min(s.N - 1, Math.floor((z + reach + s.extent) / LAND_CELL));
  for(let j = j0; j <= j1; j++){const cz = -s.extent + (j + .5) * LAND_CELL;for(let i = i0; i <= i1; i++){const cx = -s.extent + (i + .5) * LAND_CELL;fn(j * s.N + i, cx, cz, Math.hypot(cx - x, cz - z));}}
}
/** Stamp a capsule round a segment. */
function capsule(s, x0, z0, x1, z1, radius, fn){
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1e-9;
  each(s, (x0 + x1) / 2, (z0 + z1) / 2, Math.sqrt(l2) / 2 + radius + 1, (k, x, z) => {
    let t = ((x - x0) * dx + (z - z0) * dz) / l2;t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x0 + dx * t - x, z0 + dz * t - z);
    if(d < radius) fn(k, d);
  });
}
/** A wobbly blob of `code` (a pond, a pool). */
function blob(s, cx, cz, rad, salt, fn){
  each(s, cx, cz, rad * 1.6, (k, x, z, d) => {
    const w = (valueNoise(x * .35 + salt, z * .35 - salt) - .5) * .5 + (valueNoise(x * .12 - salt, z * .12 + salt * 2) - .5) * .4;
    if(d / rad + w < 1) fn(k);
  });
}
/** Distance (in units) from each cell to the nearest non-ground cell: a 4-neighbour BFS, cheap and good enough. */
function clearance(s, source = code => code !== G){
  const {N, grid} = s, out = new Float32Array(N * N).fill(1e9), queue = new Int32Array(N * N);let head = 0, tail = 0;
  for(let k = 0; k < N * N; k++)if(source(grid[k])){out[k] = 0;queue[tail++] = k;}
  while(head < tail){
    const k = queue[head++], i = k % N, v = out[k] + LAND_CELL;
    if(i > 0 && out[k - 1] > v){out[k - 1] = v;queue[tail++] = k - 1;}
    if(i < N - 1 && out[k + 1] > v){out[k + 1] = v;queue[tail++] = k + 1;}
    if(k >= N && out[k - N] > v){out[k - N] = v;queue[tail++] = k - N;}
    if(k < N * N - N && out[k + N] > v){out[k + N] = v;queue[tail++] = k + N;}
  }
  return out;
}

/** Node placement with spacing: a bucket grid so a crowded map stays quick to fill. */
function nodeBook(s){
  const nodes = [], B = 3, buckets = new Map();
  const key = (x, z) => Math.floor(x / B) * 4096 + Math.floor(z / B);
  return {
    nodes,
    room(x, z, gap){
      const bi = Math.floor(x / B), bj = Math.floor(z / B);
      for(let a = -2; a <= 2; a++)for(let b = -2; b <= 2; b++){const list = buckets.get((bi + a) * 4096 + bj + b);if(list)for(const n of list)if(Math.hypot(n.x - x, n.z - z) < gap + n.gap)return false;}
      return true;
    },
    add(type, x, z, gap, extra = {}){
      const node = {id: `n${nodes.length}`, type, x: round2(x), z: round2(z), hits: NODES[type]?.hits ?? 1, ready: 0, ...extra};
      nodes.push(node);
      const k = key(x, z);let list = buckets.get(k);if(!list)buckets.set(k, list = []);list.push({x, z, gap});
      return node;
    },
  };
}

// ------------------------------------------------------------------ the farm
function buildFarm(seed){
  const s = makeGrid(PLACES.farm.extent), rng = rngFor(seed ^ 0xfa53), A = 29 + rng() * 3, B = 23 + rng() * 3, ox = rng() * 400, oz = rng() * 400;
  // The clearing: a rounded rectangle with a wobbly edge.
  for(let k = 0; k < s.N * s.N; k++){
    const x = cellX(s, k), z = cellZ(s, k), m = Math.pow(Math.pow(Math.abs(x) / A, 4) + Math.pow(Math.abs(z - 1) / B, 4), .25);
    const wob = (valueNoise(x * .09 + ox, z * .09 + oz) - .5) * .14 + (valueNoise(x * .3 - oz, z * .3 + ox) - .5) * .04;
    if(m + wob < 1) s.grid[k] = G;
  }
  // The way out: a path north to the torii.
  const gx = Math.round((rng() * 2 - 1) * 12 * 2) / 2, top = 1 - B, gate = {x: gx, z: top - 5.5};
  capsule(s, gx, top + 6, gx, top - 8, 1.9, k => {s.grid[k] = G;});
  capsule(s, gx, top + 4, gx, top - 6, .9, k => {s.detail[k] |= LAND_DETAIL.trail;});
  // A pond in one of the four corners.
  const corner = Math.floor(rng() * 4), px = (corner & 1 ? 1 : -1) * (A * .58 + rng() * 3), pz = 1 + (corner & 2 ? 1 : -1) * (B * .5 + rng() * 2), pr = 3.2 + rng() * 1.6;
  const pond = {x: round2(px), z: round2(pz), r: round2(pr)};
  blob(s, px, pz, pr, 7.3, k => {if(s.grid[k] === G) s.grid[k] = W;});
  // The farmhouse (mode.mjs builds it): three by three grid cells a little north of the middle; you arrive at its door.
  const near = {x: (rng() * 2 - 1) * 4, z: 4 + rng() * 4}, hi = Math.floor(near.x / GRID_CELL) - 1, hj = Math.floor((near.z - 1) / GRID_CELL) - 3;
  const home = {i: hi, j: hj, w: 3, h: 3, x: (hi + 1.5) * GRID_CELL, z: (hj + 1.5) * GRID_CELL};
  const spawn = {x: round2(home.x), z: round2((hj + 3) * GRID_CELL + 1.1)};
  s.zone.fill(0);
  const clear = clearance(s);
  const at = (x, z) => {const k = cellIndex(s, x, z);return k < 0 || s.grid[k] !== G ? 0 : clear[k];};
  const yard = (x, z, r) => x > hi * GRID_CELL - 2 - r && x < (hi + 3) * GRID_CELL + 2 + r && z > hj * GRID_CELL - 2 - r && z < (hj + 3) * GRID_CELL + 2 + r;
  const free = (x, z, r) => Math.hypot(x - spawn.x, z - spawn.z) > r + 3.5 && !yard(x, z, r) && !(Math.abs(x - gx) < 3.2 && z < top + 7) && Math.hypot(x - pond.x, z - pond.z) > pond.r + 1.6 + r;
  const book = nodeBook(s);
  // Trees: a thick band round the edge, a couple of groves inside.
  const groves = [0, 1, 2].slice(0, 1 + Math.floor(rng() * 2)).map(() => ({x: (rng() * 2 - 1) * A * .6, z: 1 + (rng() * 2 - 1) * B * .55, r: 3 + rng() * 3}));
  for(let t = 0; t < 1400; t++){
    const x = (rng() * 2 - 1) * (A + 2), z = 1 + (rng() * 2 - 1) * (B + 2), c = at(x, z);
    if(c < 1 || !free(x, z, 1)) continue;
    const edge = 1 - smooth(1.5, 6, c), grove = groves.some(g => Math.hypot(g.x - x, g.z - z) < g.r) ? .7 : 0;
    if(rng() > Math.max(edge * .8, grove) * .9) continue;
    if(!book.room(x, z, 1.25)) continue;
    book.add('tree', x, z, 1.25, {look: 'yomi-tree', regrow: 1e9});
  }
  // Rocks, and a stony corner.
  const stony = {x: (rng() * 2 - 1) * A * .55, z: 1 + (rng() * 2 - 1) * B * .5};
  for(let t = 0, n = 0; t < 600 && n < 16; t++){
    const near = t % 2 === 0, x = near ? stony.x + (rng() * 2 - 1) * 6 : (rng() * 2 - 1) * A, z = near ? stony.z + (rng() * 2 - 1) * 5 : 1 + (rng() * 2 - 1) * B;
    if(at(x, z) < 1.3 || !free(x, z, 1) || !book.room(x, z, 1.1)) continue;
    book.add('rock', x, z, 1.1, {look: 'yomi-rock', regrow: 1e9});n++;
  }
  for(let t = 0, n = 0; t < 400 && n < 10; t++){
    const x = (rng() * 2 - 1) * A * .9, z = 1 + (rng() * 2 - 1) * B * .9;
    if(at(x, z) < 1.2 || !free(x, z, .8) || !book.room(x, z, .9)) continue;
    book.add('stump', x, z, .9, {regrow: 1e9});n++;
  }
  // The clutter of an abandoned farm: weeds in drifts, twigs and stones.
  const drift = (x, z) => valueNoise(x * .13 + ox * .5, z * .13 - oz * .5);
  const clutter = [['weeds', 64, .55, .3], ['twigs', 30, .6, .25], ['pebbles', 30, .6, .25]];
  for(const [type, want, gap, bias] of clutter){
    for(let t = 0, n = 0; t < want * 30 && n < want; t++){
      const x = (rng() * 2 - 1) * A, z = 1 + (rng() * 2 - 1) * B;
      if(at(x, z) < .9 || !free(x, z, .4)) continue;
      if(rng() > bias + drift(x, z) * .9) continue;
      if(!book.room(x, z, gap)) continue;
      book.add(type, x, z, gap, {regrow: type === 'weeds' ? 900 : 1e9});n++;
    }
  }
  // Decoration: the forest wall beyond the edge, and a few things the old farm left behind.
  const props = [], prop = (key, x, z, extra = {}) => props.push({id: `fp${props.length}`, key, x: round2(x), z: round2(z), ...extra});
  const deco = nodeBook(s);
  for(let t = 0; t < 2600; t++){
    const x = (rng() * 2 - 1) * (s.extent - 1), z = (rng() * 2 - 1) * (s.extent - 1), k = cellIndex(s, x, z);
    if(k < 0 || s.grid[k] !== T) continue;
    // Only the first few rows of the forest are drawn: deeper in it is dark undergrowth.
    let near = false;each(s, x, z, 7, (q, a, b, d) => {if(!near && s.grid[q] === G)near = true;});
    if(!near || !deco.room(x, z, 2.1)) continue;
    const pick = rng();deco.add('tree', x, z, 2.1);
    prop(pick < .55 ? 'yomi-tree' : pick < .8 ? 'matsu' : 'bamboo', x, z, {scale: round2(.9 + rng() * .35)});
  }
  const lantern = {light: 2.6, tint: '#f4a64a', scale: 1.1};
  prop('toro', gx - 2.6, top - 1.2, lantern);prop('toro', gx + 2.6, top - 1.2, lantern);
  // A few keepsakes, chosen by the seed, set back near the edge where they will not be in the way.
  const keep = ['jizo-row', 'gorinto', 'hokora', 'ema', 'bonsho', 'jizo'];
  for(let i = keep.length - 1; i > 0; i--){const j = Math.floor(rng() * (i + 1));[keep[i], keep[j]] = [keep[j], keep[i]];}
  const spots = [];
  for(let t = 0; t < 800 && spots.length < 3 + Math.floor(rng() * 2); t++){
    const x = (rng() * 2 - 1) * A, z = 1 + (rng() * 2 - 1) * B, c = at(x, z);
    if(c < 1.2 || c > 3.2 || !free(x, z, 2) || spots.some(p => Math.hypot(p.x - x, p.z - z) < 12) || !deco.room(x, z, 1.5)) continue;
    spots.push({x, z});
  }
  spots.forEach((p, i) => {
    const kind = keep[i];deco.add('k', p.x, p.z, 2.5);
    if(kind === 'jizo-row')for(let a = -1; a <= 1; a++)prop('jizo', p.x + a * 1.1, p.z, {scale: .95});
    else if(kind === 'gorinto'){prop('gorinto', p.x - .7, p.z);prop('gorinto', p.x + .8, p.z + .3, {scale: .85});}
    else prop(kind, p.x, p.z);
  });
  // Pampas grass and shrubs along the edge, spider lilies by the pond.
  for(let t = 0, n = 0; t < 1200 && n < 46; t++){
    const x = (rng() * 2 - 1) * A, z = 1 + (rng() * 2 - 1) * B, c = at(x, z);
    if(c < .4 || c > 3 || !free(x, z, .2) || !deco.room(x, z, 1.1)) continue;
    deco.add('g', x, z, 1.1);prop(rng() < .7 ? 'yomi-grass' : 'yomi-shrub', x, z, {scale: round2(.85 + rng() * .3)});n++;
  }
  for(let t = 0, n = 0; t < 300 && n < 9; t++){
    const a = rng() * Math.PI * 2, r = pond.r + .8 + rng() * 2.2, x = pond.x + Math.cos(a) * r, z = pond.z + Math.sin(a) * r;
    if(at(x, z) < .3 || !deco.room(x, z, .9)) continue;
    deco.add('l', x, z, .9);prop('yomi-lilies', x, z, {scale: round2(.85 + rng() * .3)});n++;
  }
  book.add('farmgate', gate.x, gate.z, 1.5, {look: 'torii'});
  return finish(s, {place: 'farm', seed, spawn, gate, pond, home, nodes: book.nodes, props, areas: [{id: 'satofarm', x: 0, z: 1, r: Math.max(A, B)}]});
}

// ------------------------------------------------------------------ the wilds
const WILD_AREAS = Object.freeze(['chikurin', 'higan', 'onsen', 'hakaba']);
const ZONE_CODE = Object.freeze({satofarm: 0, sugimori: 1, chikurin: 2, higan: 3, onsen: 4, hakaba: 5});
const ZONE_IDS = Object.freeze(Object.keys(ZONE_CODE));
function buildWilds(seed){
  const s = makeGrid(PLACES.wilds.extent), rng = rngFor(seed ^ 0x9a1d5), ox = rng() * 300, oz = rng() * 300;
  const hub = {id: 'sugimori', x: round2((rng() * 2 - 1) * 4), z: 50, r: 14};
  const slots = [{x: -50, z: 16}, {x: -24, z: -44}, {x: 28, z: -44}, {x: 52, z: 16}];
  const order = WILD_AREAS.slice();
  for(let i = order.length - 1; i > 0; i--){const j = Math.floor(rng() * (i + 1));[order[i], order[j]] = [order[j], order[i]];}
  const areas = [hub, ...order.map((id, i) => ({id, x: round2(slots[i].x + (rng() * 2 - 1) * 4), z: round2(slots[i].z + (rng() * 2 - 1) * 4), r: round2(19 + rng() * 3)}))];
  const inside = (a, x, z, pad = 0) => Math.hypot(x - a.x, z - a.z) + (valueNoise(x * .1 + a.x + ox, z * .1 - a.z + oz) - .5) * 6 < a.r + pad;
  for(let k = 0; k < s.N * s.N; k++){
    const x = cellX(s, k), z = cellZ(s, k);
    for(const a of areas)if(inside(a, x, z)){s.grid[k] = G;s.zone[k] = ZONE_CODE[a.id];break;}
  }
  // Trails: the crossing to each place, and round from one place to the next.
  const links = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4]];
  const trails = [];
  for(const [a, b] of links){
    const A = areas[a], Bz = areas[b], mx = (A.x + Bz.x) / 2 + (rng() * 2 - 1) * 6, mz = (A.z + Bz.z) / 2 + (rng() * 2 - 1) * 6;
    const pts = [[A.x, A.z], [mx, mz], [Bz.x, Bz.z]];trails.push(pts);
    for(let i = 0; i + 1 < pts.length; i++){
      capsule(s, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 2.6, k => {if(s.grid[k] !== G){s.grid[k] = G;s.zone[k] = ZONE_CODE.sugimori;}});
      capsule(s, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1.1, k => {s.detail[k] |= LAND_DETAIL.trail;});
    }
  }
  const byId = id => areas.find(a => a.id === id);
  // The marsh's black pools and the terrace's springs.
  const pools = [];
  const marsh = byId('higan'), terrace = byId('onsen');
  for(const [area, n, flag, rad] of [[marsh, 3, LAND_DETAIL.black, [2.6, 4]], [terrace, 4, LAND_DETAIL.spring, [1.8, 2.8]]]){
    for(let t = 0, made = 0; t < 120 && made < n; t++){
      const a = rng() * Math.PI * 2, off = (.2 + rng() * .5) * area.r, x = area.x + Math.cos(a) * off, z = area.z + Math.sin(a) * off, r = rad[0] + rng() * (rad[1] - rad[0]);
      if(pools.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 3)) continue;
      pools.push({x: round2(x), z: round2(z), r: round2(r), kind: flag === LAND_DETAIL.black ? 'black' : 'spring'});made++;
      blob(s, x, z, r, 11 + made, k => {if(s.grid[k] === G){s.grid[k] = W;s.detail[k] |= flag;}});
    }
  }
  const gate = {x: hub.x, z: hub.z + hub.r - 3};
  const spawn = {x: hub.x, z: hub.z + hub.r - 6.5};
  const clear = clearance(s);
  const at = (x, z) => {const k = cellIndex(s, x, z);return k < 0 || s.grid[k] !== G ? 0 : clear[k];};
  const zoneAt = (x, z) => {const k = cellIndex(s, x, z);return k < 0 ? null : ZONE_IDS[s.zone[k]];};
  const onTrail = (x, z) => {const k = cellIndex(s, x, z);return k >= 0 && (s.detail[k] & LAND_DETAIL.trail) !== 0;};
  const book = nodeBook(s);
  const scatter = (area, type, want, gap, minClear, extra = {}, tries = 40) => {
    for(let t = 0, n = 0; t < want * tries && n < want; t++){
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (area.r + 2), x = area.x + Math.cos(a) * r, z = area.z + Math.sin(a) * r;
      if(zoneAt(x, z) !== area.id || at(x, z) < minClear || onTrail(x, z) || Math.hypot(x - spawn.x, z - spawn.z) < 5 || Math.hypot(x - gate.x, z - gate.z) < 3) continue;
      if(!book.room(x, z, gap)) continue;
      book.add(type, x, z, gap, extra);n++;
    }
  };
  // The crossing: cedars and pines, rocks, dry grass.
  scatter(hub, 'tree', 22, 1.5, 1, {look: 'yomi-tree'});scatter(hub, 'rock', 8, 1.2, 1.2, {look: 'yomi-rock'});scatter(hub, 'weeds', 12, .8, .8);
  // The bamboo thicket: culms close together; a few stones.
  const grove = byId('chikurin');
  scatter(grove, 'bamboostand', 120, 1.05, .9, {look: 'bamboo'}, 25);scatter(grove, 'rock', 6, 1.2, 1.2, {look: 'yomi-rock'});scatter(grove, 'weeds', 10, .8, .8);
  // The marsh: willows, iron sand by the pools, dry reeds.
  scatter(marsh, 'tree', 14, 1.6, 1, {look: 'yanagi'});scatter(marsh, 'ironseam', 10, 1.4, 1.2);scatter(marsh, 'weeds', 16, .8, .7);
  // The terrace: pines, rocks, salt crusting round the springs.
  // The nameless graveyard: old graves that give up soul embers, ghost fires after dark, a few gnarled pines.
  const graves = byId('hakaba');
  scatter(graves, 'haka', 16, 1.3, 1.1);scatter(graves, 'hitodama', 10, 1.6, .8);scatter(graves, 'tree', 8, 1.8, 1, {look: 'matsu'});scatter(graves, 'weeds', 10, .8, .8);
  scatter(terrace, 'tree', 12, 1.6, 1, {look: 'matsu'});scatter(terrace, 'rock', 14, 1.2, 1.2, {look: 'yomi-rock'});scatter(terrace, 'saltcrust', 10, 1.2, 1);
  book.add('homegate', gate.x, gate.z, 1.5, {look: 'torii'});
  // Decoration: the forest wall, lilies in the marsh, stupas, jizo at the crossing, lanterns by the torii.
  const props = [], prop = (key, x, z, extra = {}) => props.push({id: `wp${props.length}`, key, x: round2(x), z: round2(z), ...extra});
  const deco = nodeBook(s);
  for(let t = 0; t < 9000; t++){
    const x = (rng() * 2 - 1) * (s.extent - 1), z = (rng() * 2 - 1) * (s.extent - 1), k = cellIndex(s, x, z);
    if(k < 0 || s.grid[k] !== T || !deco.room(x, z, 2.3)) continue;
    let zone = null;each(s, x, z, 6, (q, a, b, d) => {if(!zone && s.grid[q] === G)zone = ZONE_IDS[s.zone[q]];});
    if(!zone) continue;
    deco.add('t', x, z, 2.3);
    const pick = rng(), key = zone === 'chikurin' ? 'bamboo' : zone === 'higan' ? (pick < .6 ? 'yanagi' : 'matsu') : zone === 'onsen' ? (pick < .7 ? 'matsu' : 'yomi-tree') : zone === 'hakaba' ? (pick < .6 ? 'matsu' : 'yanagi') : (pick < .5 ? 'matsu' : 'yomi-tree');
    prop(key, x, z, {scale: round2(.9 + rng() * .35)});
  }
  const lantern = {light: 2.6, tint: '#f4a64a', scale: 1.1};
  prop('toro', gate.x - 2.6, gate.z - .8, lantern);prop('toro', gate.x + 2.6, gate.z - .8, lantern);
  for(let i = 0; i < 3; i++)prop('jizo', hub.x - 6 + i * 1.1, hub.z + 3.5, {scale: .95});
  const dress = (area, key, want, gap, minClear, maxClear = 99) => {
    for(let t = 0, n = 0; t < want * 40 && n < want; t++){
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * area.r, x = area.x + Math.cos(a) * r, z = area.z + Math.sin(a) * r, c = at(x, z);
      if(zoneAt(x, z) !== area.id || c < minClear || c > maxClear || onTrail(x, z) || !book.room(x, z, .5) || !deco.room(x, z, gap)) continue;
      deco.add('d', x, z, gap);prop(key, x, z, {scale: round2(.85 + rng() * .3)});n++;
    }
  };
  dress(marsh, 'yomi-lilies', 26, 1, .3, 3);dress(marsh, 'gorinto', 5, 2, 1.5);
  dress(graves, 'gorinto', 9, 2, 1);dress(graves, 'sotoba', 10, 1.6, .8);dress(graves, 'jizo', 4, 2.4, 1.2);dress(graves, 'yomi-lilies', 10, 1, .3);
  dress(terrace, 'yomi-shrub', 10, 1.4, .5, 3);dress(grove, 'yomi-grass', 12, 1.2, .5);
  dress(hub, 'yomi-grass', 16, 1.1, .4, 4);dress(hub, 'yomi-shrub', 8, 1.4, .5, 3);
  return finish(s, {place: 'wilds', seed, spawn, gate, nodes: book.nodes, props, areas, pools, trails});
}

function finish(s, extra){
  const shape = {...extra, extent: s.extent, N: s.N, size: s.N, cell: LAND_CELL, grid: s.grid, detail: s.detail, zone: s.zone, ground: null};
  return shape;
}

// ------------------------------------------------------------------ queries
/** True where a walker's centre may stand. Hot path. */
export function placeWalkable(seed, place, x, z){
  const s = placeShape(seed, place), k = cellIndex(s, x, z);
  return k >= 0 && s.grid[k] === G;
}
/** The nearest walkable point within maxR, or null. */
export function placeLandNear(seed, place, x, z, maxR = 6){
  const s = placeShape(seed, place);
  if(!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if(placeWalkable(seed, place, x, z)) return {x, z};
  let best = null, bestD = Infinity;
  each(s, x, z, maxR, (k, cx, cz, d) => {if(s.grid[k] === G && d < bestD){bestD = d;best = {x: cx, z: cz};}});
  return best;
}
/** The zone under a point (ZONES id). */
export function placeZone(seed, place, x, z){
  if(place !== 'wilds') return 'satofarm';
  const s = placeShape(seed, place), k = cellIndex(s, x, z);
  return k < 0 ? 'sugimori' : ZONE_IDS[s.zone[k]] || 'sugimori';
}
/** Fresh copies of the nodes a place starts with. */
export function placeNodes(seed, place){return placeShape(seed, place).nodes.map(n => ({...n}));}
/** Standing decoration of a place: [{id, key, x, z, scale?, light?, tint?}] (presentation only). */
export function placeProps(seed, place){return placeShape(seed, place).props;}
/** The lit decoration (stone lanterns by the torii): light like a lantern, all night. */
export function placeLights(seed, place){return placeProps(seed, place).filter(p => p.light > 0).map(p => ({x: p.x, z: p.z, radius: p.light}));}

// ------------------------------------------------------------------ ground colours
const TONES = {satofarm: '#7d7a56', sugimori: '#6a6a50', chikurin: '#5f6b4a', higan: '#5c4b4e', onsen: '#857e74', hakaba: '#615a63', path: '#a08c66',
  water: '#3c5560', shore: '#6f7a62', thicket: '#323d31', void: '#1f1d27', blackwater: '#1f1c26', spring: '#8cc4bc'};
const toRGB = h => {const n = parseInt(String(h).replace('#', ''), 16);return Number.isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [128, 128, 128];};
/**
 * The colour of the ground, one texel per grid cell, in the shape renderers already read from
 * worldgen.groundColors: {size, extent, res, rgb, land} (land 1 ground, 2 water, 3 wood).
 */
export function placeGround(seed, place, palette = {}){
  const s = placeShape(seed, place);
  const key = Object.keys(TONES).map(k => palette[k] || '').join(',');
  if(s.ground && s.groundKey === key) return s.ground;
  const tone = {};for(const k of Object.keys(TONES))tone[k] = toRGB(palette[k] && k !== 'water' && k !== 'thicket' ? palette[k] : TONES[k]);
  const {N, grid, detail, zone} = s, rgb = new Uint8Array(N * N * 3), land = new Uint8Array(N * N), clear = clearance(s), toGround = clearance(s, code => code === G);
  const c = [0, 0, 0], mix = (t, col) => {c[0] += (col[0] - c[0]) * t;c[1] += (col[1] - c[1]) * t;c[2] += (col[2] - c[2]) * t;};
  const zoneTone = place === 'wilds' ? z => tone[ZONE_IDS[z]] || tone.sugimori : () => tone.satofarm;
  for(let k = 0; k < N * N; k++){
    const x = cellX(s, k), z = cellZ(s, k), code = grid[k], n1 = valueNoise(x * .08 + 3, z * .08 - 9), n2 = valueNoise(x * .35 - 5, z * .35 + 2);
    if(code === G){
      const base = zoneTone(zone[k]);c[0] = base[0];c[1] = base[1];c[2] = base[2];
      // Patches of lusher and drier grass, then worn trails, then the shore of a pond.
      mix(.18 * smooth(.55, .85, n1), [96, 112, 72]);mix(.14 * smooth(.6, .9, 1 - n1), tone.path);mix(.05 * n2, [40, 40, 30]);
      if(detail[k] & LAND_DETAIL.trail)mix(.55, tone.path);
      const toEdge = clear[k];if(toEdge < 1.4)mix(.25 * (1 - toEdge / 1.4), [70, 74, 54]);
      land[k] = 1;
    }else if(code === W){
      const black = detail[k] & LAND_DETAIL.black, spring = detail[k] & LAND_DETAIL.spring, edge = toGround[k];
      const col = black ? tone.blackwater : spring ? tone.spring : tone.water;c[0] = col[0];c[1] = col[1];c[2] = col[2];
      if(edge < 1.2)mix(.45 * (1 - edge / 1.2), spring ? [214, 226, 220] : black ? [92, 44, 56] : tone.shore);
      if(spring)mix(.25 * smooth(.5, .9, n2), [230, 240, 236]);
      if(black)mix(.15 * smooth(.6, .9, n2), [120, 40, 52]);
      land[k] = 2;
    }else{
      // The forest floor: dark, darker the deeper it goes.
      const edge = toGround[k], col = tone.thicket;c[0] = col[0];c[1] = col[1];c[2] = col[2];
      mix(.5 * smooth(1, 8, edge), tone.void);mix(.08 * n2, [20, 30, 20]);
      land[k] = 3;
    }
    rgb[k * 3] = c[0];rgb[k * 3 + 1] = c[1];rgb[k * 3 + 2] = c[2];
  }
  s.ground = {size: N, extent: s.extent, res: 1 / LAND_CELL, rgb, land};s.groundKey = key;
  return s.ground;
}
