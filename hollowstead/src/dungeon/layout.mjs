// A dungeon floor: carved by a variation (variants.mjs), then dressed here the same way for every
// variation. Deterministic from {seed, variant, depth}, so host and guests build the same floor
// from three numbers in the snapshot and nothing else. Cached: guests rebuild the world every frame.
//
// Layout fields (world units; one grid cell is one unit, the floor centred on the origin):
//   w, h, ox, oz        grid size and the world position of cell (0,0)'s corner (spec.x/z move the floor)
//   cells               Uint8Array of grid.mjs codes (ROCK, FLOOR, SOLID)
//   roomAt              Int16Array: the chamber index of each cell, -1 in passages and rock
//   rooms               [{id, kind, area, x, z, r, ci, cj, x0, z0, x1, z1, cells, order}]
//                       kind: start | lair | ambush | treasure | shrine | warden
//   start, exit         chamber indices: the camp and the Warden's chamber (where the stairs are)
//   caches              [{type, x, z, room}]  loot caches (they become world.nodes)
//   props               [{id, key, x, z, scale, light}]  set dressing and lights (presentation)
//   lights              [{x, z, radius}]  every torch and glowing prop
//   camp                {fire, bench, spawn:[{x,z}]}  the start chamber
//   portal              {x, z}  the stairs down, in the Warden's chamber
//   shrine              {x, z, room} or null
import {DIRS4, DIRS8, FLOOR, ROCK, SOLID, flood, keepLargest, mixSeed, random, roomy, shuffle, widen} from './grid.mjs?v=harvest-18';
import {VARIANT_IDS, isVariant, variantOf} from './variants.mjs?v=harvest-18';

const CACHE = new Map();
/** A chamber smaller than this is just a wide spot in a passage. */
const MIN_ROOM = 16;

/**
 * Which floor comes next in a run: the depth, a seed of its own, and a variation (a different one
 * from the floor above when there is a choice). `forced` pins the variation (a URL, an event).
 */
export function floorSpec(runSeed, depth, previous = null, forced = null){
  const seed = mixSeed(runSeed >>> 0, 'floor', depth);
  if(isVariant(forced)) return {seed, variant: forced, depth};
  const rng = random(mixSeed(runSeed >>> 0, 'variant', depth));
  const choices = VARIANT_IDS.length > 1 ? VARIANT_IDS.filter(id => id !== previous) : VARIANT_IDS;
  return {seed, variant: choices[Math.floor(rng()*choices.length)], depth};
}
export const floorKey = spec => `${spec.variant}:${spec.depth}:${spec.seed >>> 0}${spec.x || spec.z ? `@${spec.x || 0},${spec.z || 0}` : ''}`;

/** The floor for a spec (cached). */
export function buildFloor(spec){
  const key = floorKey(spec);
  let layout = CACHE.get(key);
  if(!layout){
    if(CACHE.size > 6) CACHE.clear();
    layout = generate(spec);
    CACHE.set(key, layout);
  }
  return layout;
}

// ------------------------------------------------------------------ geometry helpers
const cellCode = (L, i, j) => i < 0 || j < 0 || i >= L.w || j >= L.h ? ROCK : L.cells[i + j*L.w];
export const worldX = (L, i) => L.ox + i + .5;
export const worldZ = (L, j) => L.oz + j + .5;
export function cellAt(L, x, z){const i = Math.floor(x - L.ox), j = Math.floor(z - L.oz); return {i, j, k: i >= 0 && j >= 0 && i < L.w && j < L.h ? i + j*L.w : -1};}
/** Chamber index under a world point, or -1 (passage, rock). */
export function roomAtPoint(L, x, z){const {k} = cellAt(L, x, z); return k < 0 ? -1 : L.roomAt[k];}
/** Walkers keep this far from rock and pillars (their own clearance, as round trunks). */
const MARGIN = .34;
/** True where a walker's centre may stand. */
export function walkableAt(L, x, z){
  const fx = x - L.ox, fz = z - L.oz, i = Math.floor(fx), j = Math.floor(fz);
  if(cellCode(L, i, j) !== FLOOR) return false;
  const u = fx - i, v = fz - j, m = MARGIN;
  const west = u < m, east = u > 1 - m, north = v < m, south = v > 1 - m;
  if(west && cellCode(L, i - 1, j) !== FLOOR) return false;
  if(east && cellCode(L, i + 1, j) !== FLOOR) return false;
  if(north && cellCode(L, i, j - 1) !== FLOOR) return false;
  if(south && cellCode(L, i, j + 1) !== FLOOR) return false;
  const corner = (di, dj, cu, cv) => cu*cu + cv*cv < m*m && cellCode(L, i + di, j + dj) !== FLOOR;
  if(corner(-1, -1, u, v) || corner(1, -1, 1 - u, v) || corner(-1, 1, u, 1 - v) || corner(1, 1, 1 - u, 1 - v)) return false;
  return true;
}
/** True when nothing but open floor (or a pillar, which does not hide a body) lies between two points. */
export function sightLine(L, x0, z0, x1, z1){
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d/.5);
  for(let s = 1; s < n; s++){
    const t = s/n, i = Math.floor(x0 + (x1 - x0)*t - L.ox), j = Math.floor(z0 + (z1 - z0)*t - L.oz);
    if(cellCode(L, i, j) === ROCK) return false;
  }
  return true;
}
/**
 * A long way round on a floor: breadth-first over whole cells (ignoring anything standing in the
 * chambers), then trimmed to the corners that matter. For walks the half-unit planner cannot
 * see the end of (pathing.mjs asks when its own search box runs out). Null when unreachable.
 */
export function routeCells(L, x0, z0, x1, z1){
  const from = walkableNear(L, x0, z0, 2), to = walkableNear(L, x1, z1, 3);
  if(!from || !to) return null;
  const s = cellAt(L, from.x, from.z).k, t = cellAt(L, to.x, to.z).k;
  if(s < 0 || t < 0) return null;
  const prev = new Int32Array(L.w*L.h).fill(-1), queue = new Int32Array(L.w*L.h);
  let head = 0, tail = 0; queue[tail++] = s; prev[s] = s;
  while(head < tail && prev[t] < 0){
    const k = queue[head++], i = k % L.w, j = (k - i)/L.w;
    for(const [di, dj] of DIRS4){
      const ni = i + di, nj = j + dj; if(ni < 0 || nj < 0 || ni >= L.w || nj >= L.h) continue;
      const nk = ni + nj*L.w; if(prev[nk] >= 0 || L.cells[nk] !== FLOOR) continue;
      prev[nk] = k; queue[tail++] = nk;
    }
  }
  if(prev[t] < 0) return null;
  const cells = [];
  for(let k = t; k !== s; k = prev[k]) cells.push(k);
  cells.reverse();
  const pts = cells.map(k => ({x: L.ox + k % L.w + .5, z: L.oz + Math.floor(k/L.w) + .5}));
  pts.push(to);
  // Keep a corner only when the straight line past it would clip a wall.
  const clear = (a, b) => {const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d/.25); for(let q = 1; q < n; q++) if(!walkableAt(L, a.x + (b.x - a.x)*q/n, a.z + (b.z - a.z)*q/n)) return false; return true;};
  const out = []; let at = from, i = 0;
  while(i < pts.length){
    let far = i;
    for(let k = Math.min(pts.length - 1, i + 24); k > i; k--) if(clear(at, pts[k])){far = k; break;}
    out.push(pts[far]); at = pts[far]; i = far + 1;
  }
  return out;
}
/** The nearest walkable point within maxR (the point itself when walkable), or null. */
export function walkableNear(L, x, z, maxR = 6){
  if(walkableAt(L, x, z)) return {x, z};
  const {i, j} = cellAt(L, x, z);
  let best = null, bestD = Infinity;
  const R = Math.ceil(maxR);
  for(let dj = -R; dj <= R; dj++) for(let di = -R; di <= R; di++){
    const cx = worldX(L, i + di), cz = worldZ(L, j + dj), d = Math.hypot(cx - x, cz - z);
    if(d < bestD && d <= maxR + .75 && walkableAt(L, cx, cz)){bestD = d; best = {x: cx, z: cz};}
  }
  return best;
}

// ------------------------------------------------------------------ generation
function generate(spec){
  const variant = variantOf(spec.variant), depth = Math.max(1, spec.depth|0);
  const rng = random(mixSeed(spec.seed >>> 0, variant.id, depth));
  let carved = null, rooms = [];
  for(let attempt = 0; attempt < 6; attempt++){
    carved = variant.carve(rng, {depth});
    keepLargest(carved.grid);
    widen(carved.grid);
    rooms = chambers(carved.grid, carved.rooms);
    if(rooms.length >= 4) break;
  }
  const g = carved.grid, w = g.w, h = g.h;
  // Centred on the origin, or on {x, z} when the floor is placed somewhere else (a door in the hollow).
  const L = {key: floorKey(spec), seed: spec.seed >>> 0, variant: variant.id, depth, w, h, ox: -w/2 + (spec.x || 0), oz: -h/2 + (spec.z || 0), cells: g.cells, roomAt: new Int16Array(w*h).fill(-1), rooms, caches: [], props: [], lights: []};
  rooms.forEach((room, index) => {room.id = index; for(const k of room.cells) L.roomAt[k] = index;});
  classify(L, g, rng);
  dress(L, g, rng, variant);
  // SOLID dressing may have closed a sliver somewhere: one last pass keeps a single connected floor.
  keepLargest(g); L.cells = g.cells;
  return L;
}

/** Chambers from the variation's rooms: floor cells only, each cell to one chamber, tiny ones dropped. */
function chambers(g, given){
  const taken = new Uint8Array(g.w*g.h), out = [];
  for(const room of given || []){
    const list = room.cells ? room.cells : rectCells(g, room);
    const cells = list.filter(k => k >= 0 && k < g.cells.length && g.cells[k] !== ROCK && !taken[k]);
    const floor = cells.filter(k => g.cells[k] === FLOOR).length;
    if(floor < MIN_ROOM) continue;
    for(const k of cells) taken[k] = 1;
    out.push(summarise(g, cells));
  }
  return out;
}
function rectCells(g, r){const out = []; for(let j = r.z0; j <= r.z1; j++) for(let i = r.x0; i <= r.x1; i++) if(i >= 0 && j >= 0 && i < g.w && j < g.h) out.push(i + j*g.w); return out;}
function summarise(g, cells){
  let sx = 0, sz = 0, n = 0, x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for(const k of cells){const i = k % g.w, j = (k - i)/g.w; if(g.cells[k] === FLOOR){sx += i; sz += j; n++;} x0 = Math.min(x0, i); z0 = Math.min(z0, j); x1 = Math.max(x1, i); z1 = Math.max(z1, j);}
  const mx = sx/n, mz = sz/n;
  // The centre is the open cell nearest the centroid, with room round it for a fire, a stair or a stone.
  let best = cells[0], bestD = Infinity;
  for(const loose of [2, 1, 0]){
    for(const k of cells){
      const i = k % g.w, j = (k - i)/g.w;
      if(g.cells[k] !== FLOOR || (loose && !roomy(g, i, j, loose))) continue;
      const d = (i - mx)**2 + (j - mz)**2; if(d < bestD){bestD = d; best = k;}
    }
    if(bestD < Infinity) break;
  }
  const ci = best % g.w, cj = (best - ci)/g.w;
  return {id: -1, kind: 'lair', area: n, ci, cj, x0, z0, x1, z1, cells: Int32Array.from(cells), r: Math.sqrt(n/Math.PI)};
}

/** Picks the camp, the Warden's chamber (far from the camp), the treasure, the shrine and the ambushes. */
function classify(L, g, rng){
  const {rooms} = L, key = r => r.ci + r.cj*g.w;
  for(const r of rooms){r.x = L.ox + r.ci + .5; r.z = L.oz + r.cj + .5;}
  const far = (dist, list) => list.reduce((a, b) => dist[key(b)] > dist[key(a)] ? b : a);
  const first = rooms[Math.floor(rng()*rooms.length)];
  const a = far(flood(g, [key(first)]), rooms);
  const fromA = flood(g, [key(a)]), maxA = Math.max(...rooms.map(r => fromA[key(r)]));
  // The Warden's chamber: among the farthest from the camp, the roomiest (a boss needs space).
  const exit = rooms.filter(r => fromA[key(r)] >= maxA*.72).sort((p, q) => q.area - p.area)[0];
  const fromExit = flood(g, [key(exit)]), maxE = Math.max(...rooms.map(r => fromExit[key(r)]));
  const start = rooms.filter(r => r !== exit && fromExit[key(r)] >= maxE*.72).sort((p, q) => Math.min(q.area, 180) - Math.min(p.area, 180))[0] || a;
  start.kind = 'start'; exit.kind = 'warden'; L.start = start.id; L.exit = exit.id;
  // The way through: follow the distance from the camp back from the stairs.
  const fromStart = flood(g, [key(start)]), path = new Set();
  let k = key(exit), guard = 0;
  while(fromStart[k] > 0 && guard++ < 100000){
    path.add(k);
    const i = k % g.w, j = (k - i)/g.w;
    let next = -1;
    for(const [di, dj] of DIRS4){const nk = (i + di) + (j + dj)*g.w; if(fromStart[nk] === fromStart[k] - 1){next = nk; break;}}
    if(next < 0) break; k = next;
  }
  path.add(key(start));
  const onPath = new Set([...path].map(c => L.roomAt[c]).filter(r => r >= 0));
  const detour = flood(g, [...path]);
  for(const r of rooms){r.order = fromStart[key(r)]; r.main = onPath.has(r.id); r.detour = Math.max(0, detour[key(r)]);}
  const free = () => rooms.filter(r => r.kind === 'lair');
  const side = () => free().filter(r => !r.main).sort((p, q) => q.detour - p.detour);
  const depth = L.depth;
  const treasure = side()[0] || free().sort((p, q) => q.order - p.order)[0];
  if(treasure) treasure.kind = 'treasure';
  if(depth >= 3 && rng() < .4){const more = side()[0]; if(more && more.area >= 30) more.kind = 'treasure';}
  if(rng() < .7){const pool = side().length ? side() : free().filter(r => r.area >= 40); const pick = pool[Math.floor(rng()*pool.length)]; if(pick) pick.kind = 'shrine';}
  if(depth >= 2){
    const along = free().filter(r => r.main && r.area >= 36).sort((p, q) => p.order - q.order);
    const count = depth >= 4 ? 2 : 1;
    for(let n = 0; n < count && along.length; n++) along.splice(Math.floor(along.length*(n ? .8 : .5)), 1)[0].kind = 'ambush';
  }
}

/** True when blocking cell k keeps its eight neighbours joined round it (so no passage is sealed). */
function safeToFill(g, k){
  const i = k % g.w, j = (k - i)/g.w, ring = [];
  for(const [di, dj] of DIRS8) if(g.cells[(i + di) + (j + dj)*g.w] === FLOOR) ring.push([di, dj]);
  if(!ring.length) return false;
  const seen = new Set([0]), queue = [0];
  while(queue.length){
    const [ai, aj] = ring[queue.pop()];
    ring.forEach(([bi, bj], n) => {if(!seen.has(n) && Math.abs(ai - bi) + Math.abs(aj - bj) === 1){seen.add(n); queue.push(n);}});
  }
  return seen.size === ring.length;
}

function dress(L, g, rng, variant){
  const {rooms} = L, depth = L.depth;
  let propId = 0;
  const toX = i => L.ox + i + .5, toZ = j => L.oz + j + .5;
  const prop = (key, i, j, scale, light = 0, extra = {}) => {
    const p = {id: `dp${propId++}`, key, x: toX(i), z: toZ(j), scale, light, ...extra};
    L.props.push(p); if(light > 0) L.lights.push({x: p.x, z: p.z, radius: light});
    return p;
  };
  const used = new Uint8Array(g.w*g.h);
  const block = k => {if(!safeToFill(g, k)) return false; g.cells[k] = SOLID; used[k] = 1; return true;};
  const code = (i, j) => i < 0 || j < 0 || i >= g.w || j >= g.h ? ROCK : g.cells[i + j*g.w];
  // Doorways: chamber cells touching floor that belongs elsewhere. Nothing is stood in them.
  const nearDoor = new Uint8Array(g.w*g.h);
  for(const room of rooms) for(const k of room.cells){
    const i = k % g.w, j = (k - i)/g.w;
    if(DIRS4.some(([di, dj]) => {const nk = (i + di) + (j + dj)*g.w; return code(i + di, j + dj) === FLOOR && L.roomAt[nk] !== room.id;})){
      for(let dj = -2; dj <= 2; dj++) for(let di = -2; di <= 2; di++){const ni = i + di, nj = j + dj; if(ni >= 0 && nj >= 0 && ni < g.w && nj < g.h) nearDoor[ni + nj*g.w] = 1;}
    }
  }
  // A cell against a straight stretch of wall on `side`: the wall and its neighbours along it are solid,
  // and everything else round it is open two cells deep, so a prop there never leaves a pocket or a
  // gap narrower than a walker's path (pathing plans on a half-unit grid).
  const againstWall = (i, j, [di, dj]) => {
    const ai = dj, aj = di, c = (a, b) => code(i + a, j + b);
    if(c(di, dj) === FLOOR || c(di + ai, dj + aj) === FLOOR || c(di - ai, dj - aj) === FLOOR) return false;
    for(const [a, b] of [[-di, -dj], [-2*di, -2*dj], [ai, aj], [-ai, -aj], [2*ai, 2*aj], [-2*ai, -2*aj], [ai - di, aj - dj], [-ai - di, -aj - dj]]) if(c(a, b) !== FLOOR) return false;
    return true;
  };
  const spaced = (list, i, j, gap) => list.every(([a, b]) => Math.abs(a - i) + Math.abs(b - j) >= gap);

  // Camp: a fire in the middle of the start chamber, a workbench beside it, places to wake up round it.
  const start = rooms[L.start], centreFree = (room, r) => {for(let dj = -r; dj <= r; dj++) for(let di = -r; di <= r; di++) used[(room.ci + di) + (room.cj + dj)*g.w] = 1;};
  centreFree(start, 2);
  const benchAt = [[3, 0], [-3, 0], [0, -3], [0, 3], [3, -2], [-3, 2]].map(([di, dj]) => [start.ci + di, start.cj + dj]).find(([i, j]) => code(i, j) === FLOOR && roomy(g, i, j, 1)) || [start.ci + 2, start.cj];
  L.camp = {fire: {x: start.x, z: start.z}, bench: {x: toX(benchAt[0]), z: toZ(benchAt[1])}, spawn: []};
  for(let n = 0; n < 8; n++){const a = n/8*Math.PI*2 + .4, x = start.x + Math.cos(a)*2.1, z = start.z + Math.sin(a)*2.1; if(walkableAt(L, x, z)) L.camp.spawn.push({x, z});}
  if(!L.camp.spawn.length) L.camp.spawn.push({x: start.x + 1.6, z: start.z});
  for(const [i, j] of [benchAt]) used[i + j*g.w] = 1;
  // The stairs down: the middle of the Warden's chamber, kept clear.
  const exit = rooms[L.exit]; centreFree(exit, 2);
  L.portal = {x: exit.x, z: exit.z};
  // A shrine: a runestone in the middle of its chamber, with room to stand round it.
  const shrineRoom = rooms.find(r => r.kind === 'shrine');
  L.shrine = null;
  if(shrineRoom){
    // The stone needs open floor two cells round it (pillars stand in some chambers).
    const k = roomy(g, shrineRoom.ci, shrineRoom.cj, 2) ? shrineRoom.ci + shrineRoom.cj*g.w
      : [...shrineRoom.cells].filter(c => {const i = c % g.w, j = (c - i)/g.w; return roomy(g, i, j, 2);}).sort((a, b) => Math.hypot(a % g.w - shrineRoom.ci, Math.floor(a/g.w) - shrineRoom.cj) - Math.hypot(b % g.w - shrineRoom.ci, Math.floor(b/g.w) - shrineRoom.cj))[0];
    if(k != null && block(k)){
      const i = k % g.w, j = (k - i)/g.w;
      for(let dj = -2; dj <= 2; dj++) for(let di = -2; di <= 2; di++) used[(i + di) + (j + dj)*g.w] = 1;
      L.shrine = {x: toX(i), z: toZ(j), room: shrineRoom.id}; prop('rock-rune', i, j, .55, 3, {shrine: true});
    }
    else shrineRoom.kind = 'lair';
  }

  // Loot caches.
  const tierFor = good => {
    if(good) return depth >= 5 ? (rng() < .5 ? 'reliquary' : 'moonchest') : depth >= 3 ? (rng() < .3 ? 'reliquary' : 'moonchest') : depth >= 2 ? 'moonchest' : 'ironchest';
    if(depth >= 4 && rng() < .1) return 'moonchest';
    return rng() < Math.min(.55, .16 + .07*depth) ? 'ironchest' : 'crate';
  };
  const cacheAt = (type, i, j, room) => {used[i + j*g.w] = 1; for(const [di, dj] of DIRS8) used[(i + di) + (j + dj)*g.w] = 1; L.caches.push({type, x: toX(i), z: toZ(j), room});};
  const wallSpot = room => {
    const spots = [];
    for(const k of room.cells){
      const i = k % g.w, j = (k - i)/g.w;
      if(g.cells[k] !== FLOOR || used[k] || nearDoor[k]) continue;
      if(DIRS4.some(side => againstWall(i, j, side))) spots.push([i, j]);
    }
    return spots.length ? spots[Math.floor(rng()*spots.length)] : null;
  };
  // Beyond the treasure chambers, a budget of lesser caches that grows slowly with depth.
  let budget = 3 + Math.min(4, Math.floor(depth/2));
  for(const room of shuffle(rng, rooms.slice())){
    if(room.kind === 'treasure'){
      const k = room.ci + room.cj*g.w;
      if(!used[k]) cacheAt(tierFor(true), room.ci, room.cj, room.id);
      if(room.area > 70){const spot = wallSpot(room); if(spot) cacheAt(tierFor(false), spot[0], spot[1], room.id);}
      continue;
    }
    if(room.kind === 'warden') continue;
    const chance = room.kind === 'start' ? (depth === 1 ? 1 : 0) : room.kind === 'ambush' ? .75 : .45;
    if(budget > 0 && rng() < chance){const spot = wallSpot(room); if(spot){cacheAt(room.kind === 'start' ? 'crate' : tierFor(false), spot[0], spot[1], room.id); budget--;}}
  }

  // Torches along the far (north) walls of every chamber, a few along long passages.
  const torch = variant.torch;
  for(const room of rooms){
    const spots = [], placed = [];
    for(const k of room.cells){const i = k % g.w, j = (k - i)/g.w; if(g.cells[k] === FLOOR && !used[k] && !nearDoor[k] && againstWall(i, j, [0, -1])) spots.push([i, j]);}
    shuffle(rng, spots);
    const want = Math.max(1, Math.min(4, Math.round(room.area/45)));
    for(const [i, j] of spots){
      if(placed.length >= want) break;
      if(!spaced(placed, i, j, 6) || !block(i + j*g.w)) continue;
      placed.push([i, j]); prop(torch.key, i, j, torch.scale, torch.radius, {torch: true});
    }
  }
  const passage = [];
  for(let j = 2; j < g.h - 2; j++) for(let i = 2; i < g.w - 2; i++){
    const k = i + j*g.w;
    if(g.cells[k] !== FLOOR || L.roomAt[k] >= 0 || used[k]) continue;
    if(againstWall(i, j, [0, -1]) && code(i, j + 2) === FLOOR && spaced(passage, i, j, 12)){
      if(block(k)){passage.push([i, j]); prop(torch.key, i, j, torch.scale*.9, torch.radius*.85, {torch: true});}
    }
  }

  // Set dressing: a few pieces per chamber, against the walls or loose on the floor.
  const weights = variant.decor.map(d => [d, d.weight || 1]), total = weights.reduce((s, [, w]) => s + w, 0);
  const pickDecor = () => {let r = rng()*total; for(const [d, w] of weights){r -= w; if(r <= 0) return d;} return weights[0][0];};
  for(const room of rooms){
    const count = Math.round(room.area/40) + (room.kind === 'treasure' ? 1 : 0), placed = [];
    for(let n = 0, tries = 0; n < count && tries < count*12; tries++){
      const d = pickDecor();
      const k = room.cells[Math.floor(rng()*room.cells.length)], i = k % g.w, j = (k - i)/g.w;
      if(g.cells[k] !== FLOOR || used[k] || nearDoor[k] || !spaced(placed, i, j, 3)) continue;
      if(Math.hypot(i - room.ci, j - room.cj) < 2.6) continue;
      if(d.where === 'wall' && !DIRS4.some(side => againstWall(i, j, side))) continue;
      if(d.where === 'free' && !roomy(g, i, j, d.walk ? 1 : 2)) continue;
      if(!d.walk && !block(k)) continue;
      used[k] = 1; placed.push([i, j]); n++;
      prop(d.key, i, j, d.scale*(.9 + rng()*.2), d.light || 0, d.walk ? {flat: true} : {});
    }
  }
}
