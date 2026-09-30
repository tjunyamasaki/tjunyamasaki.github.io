// Dungeon grid toolkit: the cell map every variation carves, plus the searches the floor builder
// needs (flood fill, components, distances). Pure data, no World, DOM or art.
//
// A grid is {w, h, cells}: `cells` is a Uint8Array, one byte per 1x1-unit cell, row-major (i + j*w).
//   ROCK   solid rock, never walkable
//   FLOOR  open floor
//   SOLID  something standing on the floor (a pillar, a coffin, a torch): blocks walkers like rock
//          but is drawn by the room it stands in (layout.mjs), not as part of the wall

export const ROCK = 0, FLOOR = 1, SOLID = 2;
export const DIRS4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
export const DIRS8 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);

/** Seeded generator (mulberry32, the same one the World uses). */
export function random(seed){
  let a = seed >>> 0;
  return () => {a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0)/4294967296;};
}
/** Mixes numbers into one 32-bit seed: floor seeds from the run seed and the depth. */
export function mixSeed(...parts){
  let h = 0x811c9dc5;
  for(const part of parts){
    const text = String(part);
    for(let i = 0; i < text.length; i++){h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193);}
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  }
  return h >>> 0;
}
export const between = (rng, lo, hi) => lo + Math.floor(rng()*(hi - lo + 1));
export function shuffle(rng, list){
  for(let i = list.length - 1; i > 0; i--){const j = Math.floor(rng()*(i + 1)); [list[i], list[j]] = [list[j], list[i]];}
  return list;
}

export function makeGrid(w, h){return {w, h, cells: new Uint8Array(w*h)};}
export const inside = (g, i, j) => i >= 0 && j >= 0 && i < g.w && j < g.h;
export const at = (g, i, j) => inside(g, i, j) ? g.cells[i + j*g.w] : ROCK;
export const open = (g, i, j) => at(g, i, j) === FLOOR;
export function set(g, i, j, value){if(inside(g, i, j)) g.cells[i + j*g.w] = value;}
/** Carve open floor, keeping a one-cell rock rim round the whole map. */
export function carve(g, i, j){if(i > 0 && j > 0 && i < g.w - 1 && j < g.h - 1) g.cells[i + j*g.w] = FLOOR;}

export function carveRect(g, x0, z0, x1, z1){
  for(let j = Math.min(z0, z1); j <= Math.max(z0, z1); j++) for(let i = Math.min(x0, x1); i <= Math.max(x0, x1); i++) carve(g, i, j);
}
export function carveDisc(g, cx, cz, r){
  const r2 = r*r;
  for(let j = Math.floor(cz - r); j <= Math.ceil(cz + r); j++) for(let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++){
    const dx = i + .5 - cx, dz = j + .5 - cz;
    if(dx*dx + dz*dz <= r2) carve(g, i, j);
  }
}
/**
 * A corridor `width` cells wide between two cells: an L (horizontal then vertical, or the other way
 * round) so it reads as masonry. Returns the cells it opened, for dressing.
 */
export function carveCorridor(g, a, b, width, rng){
  const half = Math.floor((width - 1)/2), extra = width - 1 - half;
  const bend = rng() < .5 ? {i: b.i, j: a.j} : {i: a.i, j: b.j};
  const leg = (p, q) => {
    const di = Math.sign(q.i - p.i), dj = Math.sign(q.j - p.j), steps = Math.max(Math.abs(q.i - p.i), Math.abs(q.j - p.j));
    for(let s = 0; s <= steps; s++){
      const i = p.i + di*s, j = p.j + dj*s;
      if(di) carveRect(g, i, j - half, i, j + extra); else carveRect(g, i - half, j, i + extra, j);
    }
  };
  leg(a, bend); leg(bend, b);
  carveRect(g, bend.i - half, bend.j - half, bend.i + extra, bend.j + extra);
}
/** A winding tunnel from a to b: a biased walk that carves a disc at every step (caves). */
export function carveTunnel(g, a, b, radius, rng, wander = .45){
  let x = a.i + .5, z = a.j + .5, guard = 0;
  const tx = b.i + .5, tz = b.j + .5;
  let heading = Math.atan2(tz - z, tx - x);
  while(Math.hypot(tx - x, tz - z) > 1 && guard++ < 4000){
    const want = Math.atan2(tz - z, tx - x);
    let turn = ((want - heading + Math.PI*3) % (Math.PI*2)) - Math.PI;
    heading += turn*.35 + (rng() - .5)*wander*2;
    x += Math.cos(heading)*.7; z += Math.sin(heading)*.7;
    x = Math.max(2, Math.min(g.w - 3, x)); z = Math.max(2, Math.min(g.h - 3, z));
    carveDisc(g, x, z, radius*(.85 + rng()*.3));
  }
  carveDisc(g, tx, tz, radius);
}

/** Breadth-first distances (in cells, 4-connected) over walkable floor from any of `starts`. -1 = unreached. */
export function flood(g, starts){
  const dist = new Int32Array(g.w*g.h).fill(-1), queue = new Int32Array(g.w*g.h);
  let head = 0, tail = 0;
  for(const k of starts) if(g.cells[k] === FLOOR && dist[k] < 0){dist[k] = 0; queue[tail++] = k;}
  while(head < tail){
    const k = queue[head++], i = k % g.w, j = (k - i)/g.w;
    for(const [di, dj] of DIRS4){
      const ni = i + di, nj = j + dj; if(!inside(g, ni, nj)) continue;
      const nk = ni + nj*g.w; if(g.cells[nk] !== FLOOR || dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1; queue[tail++] = nk;
    }
  }
  return dist;
}
/** Every cell of the largest 4-connected floor region stays; smaller pockets turn back to rock. */
export function keepLargest(g){
  const seen = new Int32Array(g.w*g.h).fill(-1);
  let best = -1, bestSize = 0, label = 0;
  for(let k = 0; k < g.cells.length; k++){
    if(g.cells[k] !== FLOOR || seen[k] >= 0) continue;
    const dist = flood(g, [k]); let size = 0;
    for(let q = 0; q < dist.length; q++) if(dist[q] >= 0){seen[q] = label; size++;}
    if(size > bestSize){bestSize = size; best = label;}
    label++;
  }
  for(let k = 0; k < g.cells.length; k++) if(g.cells[k] === FLOOR && seen[k] !== best) g.cells[k] = ROCK;
  return bestSize;
}
/** Floor neighbours among the 8 round a cell. */
export function floorAround(g, i, j){
  let n = 0;
  for(const [di, dj] of DIRS8) if(open(g, i + di, j + dj)) n++;
  return n;
}
/**
 * Cellular smoothing for caves: rock with most neighbours open becomes floor, floor almost walled
 * in becomes rock. `only` limits the rule ('open' only opens, 'close' only closes).
 */
export function smooth(g, passes = 1, only = null){
  for(let pass = 0; pass < passes; pass++){
    const next = g.cells.slice();
    for(let j = 1; j < g.h - 1; j++) for(let i = 1; i < g.w - 1; i++){
      const n = floorAround(g, i, j), k = i + j*g.w;
      if(g.cells[k] === ROCK && n >= 6 && only !== 'close') next[k] = FLOOR;
      else if(g.cells[k] === FLOOR && n <= 2 && only !== 'open') next[k] = ROCK;
    }
    g.cells = next;
  }
}
/**
 * Widens every one-cell squeeze (open floor with rock on both sides) by opening one side. Walkers
 * plan on a half-unit grid and keep a third of a unit from rock, so a one-cell gap is a trap for
 * them. Only ever opens rock, so nothing that was connected is cut off.
 */
export function widen(g, passes = 3){
  for(let pass = 0; pass < passes; pass++){
    let changed = false;
    for(let j = 1; j < g.h - 1; j++) for(let i = 1; i < g.w - 1; i++){
      if(g.cells[i + j*g.w] !== FLOOR) continue;
      for(const [di, dj] of [[1, 0], [0, 1]]){
        if(open(g, i + di, j + dj) || open(g, i - di, j - dj)) continue;
        // Open rock inside the rim if either side has some; otherwise a pillar gives way.
        const inner = sgn => {const x = i + sgn*di, z = j + sgn*dj; return x > 0 && z > 0 && x < g.w - 1 && z < g.h - 1;};
        const side = [1, -1].find(sgn => inner(sgn) && at(g, i + sgn*di, j + sgn*dj) === ROCK) ?? [1, -1].find(sgn => inner(sgn) && at(g, i + sgn*di, j + sgn*dj) === SOLID);
        if(side === undefined) continue;
        g.cells[(i + side*di) + (j + side*dj)*g.w] = FLOOR; changed = true;
      }
    }
    if(!changed) break;
  }
}
/** Open floor cells whose whole 3x3 block is open: safe spots to stand something in the middle of a room. */
export function roomy(g, i, j, r = 1){
  for(let dj = -r; dj <= r; dj++) for(let di = -r; di <= r; di++) if(!open(g, i + di, j + dj)) return false;
  return true;
}
