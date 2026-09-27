// Scenery layout: where every decoration, border prop and ambient critter spot sits, per seed and chunk.
// Pure and deterministic: imports only worldgen/progression/content (never THREE, a renderer or the DOM),
// so node tests can pin placement and every client decorates the same hollow the same way.
// Presentation only: nothing here feeds collision or simulation.

import {NODES, RULES, STRUCTURES} from './content.mjs?v=harvest-18';
import {isCache, regionAt, valueNoise} from './progression.mjs?v=harvest-18';
import {TERRAIN, densityAt, generateNodes, terrainAt, worldShape} from './worldgen.mjs?v=harvest-18';
import {SCENERY_ATLAS} from './scenery-atlas.mjs?v=harvest-18';

/** World units per chunk side. Each chunk is laid out (and on WebGL merged into one mesh) on its own. */
export const CHUNK = 24;
/** No decoration inside this radius of the Heartfire; it thickens back in over the next few units. */
export const PLAZA_CLEAR = 7.5;
const PLAZA_FADE = 4;
/** Candidate grid: one jittered candidate per cell, hashed on the global cell so chunks agree at seams. */
const CELL = 1.2, PER = CHUNK / CELL;

/**
 * Every decoration kind. `flat` lies on the ground (drawn top-down), otherwise it stands like a sprite.
 * `sway` is how far the top leans in the wind (world units). `big` props can hide a wanderer standing
 * behind them, so they thin out around the local one. Where crows perch comes from the art (SCENERY_ATLAS.perches).
 */
export const PROPS = Object.freeze({
  // meadow
  daisy:{sway:.06}, buttercup:{sway:.06}, bluebell:{sway:.06}, poppy:{sway:.06}, heather:{sway:.05},
  tuft:{sway:.07}, 'tuft-tall':{sway:.1}, clover:{flat:true}, stones:{},
  scarecrow:{sway:.015, big:true}, 'fence-bit':{big:true},
  // woods
  fern:{sway:.06}, 'fern-small':{sway:.05}, leaves:{flat:true}, 'leaves-red':{flat:true},
  toadstool:{}, stump:{big:true}, cobweb:{sway:.02},
  // graveyard
  'old-lantern':{big:true}, 'cross-wood':{}, 'cross-stone':{}, candles:{}, 'tuft-dead':{sway:.06},
  // mire
  puddle:{flat:true}, 'puddle-lily':{flat:true}, lilypads:{flat:true}, 'reeds-small':{sway:.08}, sedge:{sway:.07},
  // crags
  pebbles:{}, 'pebbles-b':{}, crystals:{},
  // barrow
  'bone-bits':{}, 'standing-stone':{big:true},
  // border (worldShape features)
  'post-a':{big:true}, 'post-b':{big:true}, stake:{big:true}, rail:{big:true},
  'thicket-a':{big:true, sway:.03}, 'thicket-b':{big:true, sway:.03}, 'thicket-c':{big:true, sway:.03},
  'reeds-a':{big:true, sway:.1}, 'reeds-b':{big:true, sway:.1},
});
export const FLOWERS = Object.freeze(['daisy', 'buttercup', 'bluebell', 'poppy', 'heather']);
/** Which common props grow in which region, weighted. `flower` resolves to one colour per drift. */
export const REGION_MIX = Object.freeze({
  meadow: {rate:.8, dense:.3, kinds:[['flower', 5], ['tuft', 3], ['tuft-tall', 1.1], ['clover', 1.5], ['stones', .7]]},
  woods: {rate:.7, dense:.6, kinds:[['fern', 4], ['fern-small', 2.4], ['leaves', 2], ['leaves-red', 1.4], ['toadstool', 1.3], ['cobweb', .3]]},
  graveyard: {rate:.5, dense:.2, kinds:[['tuft-dead', 3], ['cross-wood', 1], ['cross-stone', .75], ['candles', .8], ['cobweb', .45], ['stones', .8]]},
  mire: {rate:.6, dense:.4, kinds:[['puddle', 1.6], ['puddle-lily', 1.1], ['reeds-small', 2.4], ['sedge', 3]]},
  crags: {rate:.46, dense:.1, kinds:[['pebbles', 3], ['pebbles-b', 2], ['crystals', 1.1], ['tuft-dead', .7]]},
  barrow: {rate:.5, dense:.15, kinds:[['tuft-dead', 3], ['bone-bits', 1.6], ['stones', 1]]},
});
/** Rare set pieces per chunk: [kind, regions, chance per try, tries]. */
const LANDMARKS = Object.freeze([
  ['scarecrow', ['meadow'], .2, 1], ['fence-bit', ['meadow'], .4, 2], ['stump', ['woods'], .55, 3],
  ['old-lantern', ['graveyard'], .5, 3], ['standing-stone', ['barrow', 'crags'], .45, 2], ['stump', ['graveyard', 'barrow'], .2, 1],
]);
const CROW_REGIONS = new Set(['meadow', 'graveyard']);
const SWARM_REGIONS = new Set(['meadow', 'woods']);
const ROOST_CHANCE = Object.freeze({meadow:.12, woods:.45, graveyard:.5, mire:.3, crags:.35, barrow:.45});

const smoothstep = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
/** Integer hash of four ints to [0,1). */
export function hash4(a, b, c, d){
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ Math.imul(d | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rngFor(seed){let a = seed >>> 0;return () => {a += 0x6D2B79F5;let t = a;t = Math.imul(t ^ t >>> 15, t | 1);t ^= t + Math.imul(t ^ t >>> 7, t | 61);return ((t ^ t >>> 14) >>> 0) / 4294967296;};}
export const chunkKey = (cx, cz) => (cx + 512) * 1024 + (cz + 512);
export const chunkOf = v => Math.floor(v / CHUNK);
/** The two dirt paths the ground mesh paints (renderer.terrain); trampled, so fewer props grow on them. */
export function onPath(x, z){return Math.abs(x + Math.sin(z * .16) * 3) < 1.8 || Math.abs(z - Math.sin(x * .17) * 4) < 1.6;}

/**
 * Everything the layout reads about one world, cached by the caller per seed.
 * `shape` overrides worldgen for presentation tests: {radius, features, terrain(x,z)}.
 */
export function sceneryEnv(seed, {nodes = null, shape = null} = {}){
  const base = shape || worldShape(seed);
  const radius = base.radius || RULES.radius;
  const terrain = shape?.terrain || ((x, z) => terrainAt(seed, x, z));
  const ox = (seed % 1013) * .37 + 3.1, oz = (seed % 877) * .29 - 7.7;
  // Blocked cells around nodes and caches: 0.5-unit grid over the whole map, O(1) lookups.
  const half = Math.ceil(radius + 8), res = 2, side = half * 2 * res, blocked = new Uint8Array(side * side);
  const mark = (x, z, r) => {
    const i0 = Math.max(0, Math.floor((x - r + half) * res)), i1 = Math.min(side - 1, Math.floor((x + r + half) * res));
    const j0 = Math.max(0, Math.floor((z - r + half) * res)), j1 = Math.min(side - 1, Math.floor((z + r + half) * res));
    // A cell is blocked when any part of it is within r (its nearest point), so no prop inside it can stand closer.
    for(let j = j0; j <= j1; j++)for(let i = i0; i <= i1; i++){const lx = i / res - half, lz = j / res - half, nx = Math.max(lx, Math.min(x, lx + 1 / res)), nz = Math.max(lz, Math.min(z, lz + 1 / res));if((nx - x) ** 2 + (nz - z) ** 2 < r * r)blocked[j * side + i] = 1;}
  };
  for(const n of nodes || generateNodes(seed)){const r = NODES[n.type]?.radius || 0;mark(n.x, n.z, isCache(n.type) ? 1.45 : Math.max(.8, r + .55));}
  const features = new Map();
  for(const f of base.features || []){
    if(!f || !Number.isFinite(f.x) || !Number.isFinite(f.z))continue;
    const k = chunkKey(chunkOf(f.x), chunkOf(f.z));let list = features.get(k);if(!list)features.set(k, list = []);list.push(f);
  }
  return {
    seed, radius, ox, oz, terrain,
    density: (x, z) => densityAt(seed, x, z),
    region: (x, z) => regionAt(x, z),
    patch: (x, z) => valueNoise(x * .2 + ox, z * .2 + oz) * .6 + valueNoise(x * .46 - oz, z * .46 + ox) * .4,
    theme: (x, z) => valueNoise(x * .16 - oz * .7, z * .16 + ox * .3),
    drift: (x, z) => valueNoise(x * .05 - ox, z * .05 + oz) * 2.3 + valueNoise(x * .019 + oz, z * .019 - ox) * 1.7,
    blocked: (x, z) => {const i = Math.floor((x + half) * res), j = Math.floor((z + half) * res);return i < 0 || j < 0 || i >= side || j >= side ? false : blocked[j * side + i] === 1;},
    featuresIn: (cx, cz) => features.get(chunkKey(cx, cz)) || [],
    featureCount: (base.features || []).length,
  };
}

function nearTerrain(env, x, z, code, reach){
  for(let k = 0; k < 6; k++){const a = k * Math.PI / 3;if(env.terrain(x + Math.cos(a) * reach, z + Math.sin(a) * reach) === code)return true;}
  return false;
}

function pickWeighted(list, r){
  let total = 0;for(const [, w] of list)total += w;
  let t = r * total;for(const [id, w] of list){t -= w;if(t <= 0)return id;}
  return list[list.length - 1][0];
}

/** Probability that a common prop grows at a candidate: patches with open ground between them. */
function growth(env, x, z, region){
  const mix = REGION_MIX[region] || REGION_MIX.meadow;
  const d = env.density(x, z), patch = env.patch(x, z);
  // Denser land grows larger, fuller patches; open heath keeps small ones.
  const threshold = .575 - mix.dense * (d - .5) * .1;
  let p = smoothstep((patch - threshold) / .13) * mix.rate * (1 - mix.dense * .5 + mix.dense * d);
  if(onPath(x, z))p *= .28;
  return p;
}

/** Common props are drawn a touch larger than their art; set pieces and border pieces as drawn. */
export const PROP_SCALE = 1;
function prop(kind, x, z, h, scale = PROP_SCALE){
  return {kind, x, z, s:(.86 + h * .28) * scale, flip:h * 7 % 1 < .5, tone:.9 + (h * 13 % 1) * .14};
}

/**
 * One chunk of decoration: common props in patches, a few set pieces, border pieces expanded from
 * worldShape features, and the spots where crows perch, frogs sit, fireflies swarm and bats roost.
 */
export function layoutChunk(env, cx, cz){
  const seed = env.seed, x0 = cx * CHUNK, z0 = cz * CHUNK;
  const out = {cx, cz, key:chunkKey(cx, cz), props:[], pieces:[], crows:[], frogs:[], swarms:[], roosts:[]};
  expandFeatures(env.featuresIn(cx, cz), out.pieces, seed);
  // Nearest point of the chunk to the centre: skip chunks wholly outside the hollow.
  const nx = Math.max(x0, Math.min(0, x0 + CHUNK)), nz = Math.max(z0, Math.min(0, z0 + CHUNK));
  if(Math.hypot(nx, nz) > env.radius + 2)return out;
  const clear2 = PLAZA_CLEAR * PLAZA_CLEAR;
  for(let j = 0; j < PER; j++)for(let i = 0; i < PER; i++){
    const gi = cx * PER + i, gj = cz * PER + j;
    const h1 = hash4(seed, gi, gj, 11), h2 = hash4(seed, gi, gj, 23), h3 = hash4(seed, gi, gj, 37);
    const x = (gi + .12 + .76 * h1) * CELL, z = (gj + .12 + .76 * h2) * CELL, r2 = x * x + z * z;
    if(r2 < clear2)continue;
    const t = env.terrain(x, z);
    if(t !== TERRAIN.ground){
      // Lily pads float just off the shore; nothing else grows off the land.
      if(t === TERRAIN.water && h3 < .3 && nearTerrain(env, x, z, TERRAIN.ground, 1.3)&&!env.blocked(x, z))out.props.push(prop('lilypads', x, z, hash4(seed, gi, gj, 41)));
      continue;
    }
    const region = env.region(x, z);
    const shore = region === 'mire' || h3 < .5 ? nearTerrain(env, x, z, TERRAIN.water, 1.1) : false;
    let p = shore ? .55 : growth(env, x, z, region);
    const r = Math.sqrt(r2);if(r < PLAZA_CLEAR + PLAZA_FADE)p *= (r - PLAZA_CLEAR) / PLAZA_FADE;
    if(h3 >= p)continue;
    if(env.blocked(x, z))continue;
    const h4 = hash4(seed, gi, gj, 53);
    // Each patch leans to one kind (a drift of ferns, a ring of toadstools), the rest mixed in.
    const kinds = (REGION_MIX[region] || REGION_MIX.meadow).kinds, h5 = hash4(seed, gi, gj, 59);
    let kind = shore ? (h4 < .7 ? 'reeds-small' : 'sedge') : h5 < .5 ? kinds[Math.floor(env.theme(x, z) * 2.2 * kinds.length) % kinds.length][0] : pickWeighted(kinds, h4);
    if(kind === 'flower'){const drift = env.drift(x, z);kind = FLOWERS[Math.floor((drift % 1) * FLOWERS.length) % FLOWERS.length];}
    out.props.push(prop(kind, x, z, hash4(seed, gi, gj, 67)));
  }
  landmarks(env, out, x0, z0);
  spots(env, out, x0, z0);
  return out;
}

function landmarks(env, out, x0, z0){
  const rng = rngFor(hash4(env.seed, out.cx, out.cz, 101) * 4294967296);
  for(const [kind, regions, chance, tries] of LANDMARKS){
    for(let n = 0; n < tries; n++){
      if(rng() >= chance){rng();rng();continue;}
      const x = x0 + 1 + rng() * (CHUNK - 2), z = z0 + 1 + rng() * (CHUNK - 2);
      if(Math.hypot(x, z) < PLAZA_CLEAR + 2.5||env.terrain(x, z) !== TERRAIN.ground||!regions.includes(env.region(x, z))||env.blocked(x, z))continue;
      if(onPath(x, z)&&kind !== 'fence-bit')continue;
      // Keep set pieces from standing inside a patch prop.
      if(out.props.some(p => Math.abs(p.x - x) < .9 && Math.abs(p.z - z) < .9 && !PROPS[p.kind].flat))continue;
      const piece = prop(kind, x, z, rng(), 1);piece.s = .92 + (piece.s - .86) * .5;piece.landmark = true;out.props.push(piece);
      if(kind === 'stump' && rng() < .35){const h = rng();if(!env.blocked(x + .55, z + .12))out.props.push(prop('cobweb', x + .55, z + .12, h));}
      if(kind === 'old-lantern' && rng() < .5){const cx = x + (rng() < .5 ? -.55 : .55), h = rng();if(!env.blocked(cx, z + .25))out.props.push(prop('candles', cx, z + .25, h));}
    }
  }
}

function spots(env, out, x0, z0){
  const seed = env.seed, rng = rngFor(hash4(seed, out.cx, out.cz, 211) * 4294967296);
  const id = (kind, i) => `${kind}${out.cx},${out.cz}:${i}`;
  const open = (x, z) => env.terrain(x, z) === TERRAIN.ground && !env.blocked(x, z) && Math.hypot(x, z) > PLAZA_CLEAR + 3;
  // Crows: on set pieces that make a perch, and in small groups on open ground.
  let crows = 0;
  for(const p of out.props){
    const perch = SCENERY_ATLAS.perches[p.kind];
    if(!perch || crows >= 3 || !CROW_REGIONS.has(env.region(p.x, p.z)) || rng() > .6)continue;
    out.crows.push({id:id('crow', crows), x:p.x + perch[0] * p.s * (p.flip ? -1 : 1), z:p.z + .02, y:perch[1] * p.s, face:rng() < .5 ? -1 : 1, group:crows});crows++;
  }
  if(rng() < .55){
    const x = x0 + 2 + rng() * (CHUNK - 4), z = z0 + 2 + rng() * (CHUNK - 4), n = 1 + Math.floor(rng() * 3);
    if(CROW_REGIONS.has(env.region(x, z)) && open(x, z))for(let i = 0; i < n && crows < 5; i++){
      const a = rng() * Math.PI * 2, d = i ? .5 + rng() * .7 : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if(open(px, pz)){out.crows.push({id:id('crow', crows), x:px, z:pz, y:0, face:rng() < .5 ? -1 : 1, group:9});crows++;}
    }
  }
  // Frogs sit at the edge of mire puddles.
  let frogs = 0;
  for(const p of out.props){
    if(frogs >= 3 || (p.kind !== 'puddle' && p.kind !== 'puddle-lily' && p.kind !== 'lilypads') || rng() > .5)continue;
    const a = rng() * Math.PI * 2, px = p.x + Math.cos(a) * .55 * p.s, pz = p.z + Math.sin(a) * .4 * p.s;
    out.frogs.push({id:id('frog', frogs), x:px, z:pz, px:p.x, pz:p.z, face:Math.cos(a) > 0 ? -1 : 1});frogs++;
  }
  // Firefly swarms hang over meadow and woods patches.
  const leafy = out.props.filter(p => !PROPS[p.kind].flat && SWARM_REGIONS.has(env.region(p.x, p.z)));
  for(let i = 0; i < 2 && leafy.length; i++){
    const p = leafy[Math.floor(rng() * leafy.length)];
    if(rng() < .75 && Math.hypot(p.x, p.z) > PLAZA_CLEAR + 1)out.swarms.push({id:id('swarm', i), x:p.x, z:p.z, n:5 + Math.floor(rng() * 4)});
  }
  // Bats circle a roost after dark.
  const bx = x0 + 3 + rng() * (CHUNK - 6), bz = z0 + 3 + rng() * (CHUNK - 6);
  if(env.terrain(bx, bz) === TERRAIN.ground && rng() < (ROOST_CHANCE[env.region(bx, bz)] || .2))out.roosts.push({id:id('roost', 0), x:bx, z:bz, n:1 + Math.floor(rng() * 2.2)});
}

/**
 * Border features from worldShape(seed).features, expanded into drawable pieces.
 * fence: a segment 2*scale long centred on (x,z), running along `angle` (radians): posts with stakes
 *   between, all lined up on that heading, and two rails joining the end posts.
 * thicket: one bramble clump, 3.2*scale wide. reeds: one clump of reeds and cattails, 1.3*scale wide.
 */
export function expandFeatures(features, pieces, seed){
  for(let n = 0; n < features.length; n++){
    const f = features[n], s = Number.isFinite(f.scale) && f.scale > 0 ? f.scale : 1;
    const h = hash4(seed, Math.round(f.x * 8), Math.round(f.z * 8), 5);
    if(f.kind === 'fence'){
      const a = Number.isFinite(f.angle) ? f.angle : 0, dx = Math.cos(a), dz = Math.sin(a), len = 2 * s;
      const posts = Math.max(2, Math.round(len / .9) + 1), step = len / (posts - 1);
      for(let i = 0; i < posts; i++){
        const t = -len / 2 + i * step, hh = hash4(seed, Math.round(f.x * 8), Math.round(f.z * 8), 20 + i);
        pieces.push({kind:hh < .5 ? 'post-a' : 'post-b', x:f.x + dx * t, z:f.z + dz * t, s:.92 + hh * .16, flip:hh * 5 % 1 < .5, tone:.88 + hh * .12, lean:(hh - .5) * .12});
        if(i < posts - 1){const m = t + step / 2;pieces.push({kind:'stake', x:f.x + dx * m, z:f.z + dz * m, s:.9 + (hh * 3 % 1) * .15, flip:hh * 9 % 1 < .5, tone:.86 + hh * .1, lean:(hh * 11 % 1 - .5) * .1});}
      }
      for(const [lo, hi] of [[.36, .52], [.78, .94]])pieces.push({kind:'rail', x0:f.x - dx * len / 2, z0:f.z - dz * len / 2, x1:f.x + dx * len / 2, z1:f.z + dz * len / 2, lo:lo * s ** .3, hi:hi * s ** .3, x:f.x, z:f.z, tone:.9 + h * .1});
    }else if(f.kind === 'thicket'){
      pieces.push({kind:h < .34 ? 'thicket-a' : h < .67 ? 'thicket-b' : 'thicket-c', x:f.x, z:f.z, s, flip:h * 7 % 1 < .5, tone:.84 + (h * 13 % 1) * .16});
    }else if(f.kind === 'reeds'){
      pieces.push({kind:h < .5 ? 'reeds-a' : 'reeds-b', x:f.x, z:f.z, s, flip:h * 7 % 1 < .5, tone:.9 + (h * 13 % 1) * .1});
    }
  }
  return pieces;
}

/** True when a structure stands on this prop: it is hidden until the structure is gone. Carts roll, so they never hide props. */
export function propCovered(p, buildings){
  for(const b of buildings){
    if(b.type === 'cart' || b.type === 'hearth')continue;
    const pad = Math.max(.9, (STRUCTURES[b.type]?.radius || 0) + .5);
    if(Math.abs(b.x - p.x) < pad && Math.abs(b.z - p.z) < pad)return true;
  }
  return false;
}

/** Chunk cache for one world. Both renderers and the ambient life read spots through it. */
export class SceneryModel {
  constructor(){this.env = null;this.seed = null;this.chunks = new Map();this.override = null;}
  reset(seed, world = null, override = this.override){
    this.override = override;this.seed = seed;this.chunks.clear();
    this.env = sceneryEnv(seed, {nodes:world?.nodes?.length ? world.nodes : null, shape:override});
  }
  chunk(cx, cz){
    const key = chunkKey(cx, cz);let c = this.chunks.get(key);
    if(!c){c = layoutChunk(this.env, cx, cz);this.chunks.set(key, c);}
    return c;
  }
  /** Chunk coordinates overlapping a world rectangle. */
  range(x0, z0, x1, z1){return {cx0:chunkOf(x0), cz0:chunkOf(z0), cx1:chunkOf(x1), cz1:chunkOf(z1)};}
}

/**
 * A synthetic border for presentation tests while worldgen is a plain disc: a ring of fence runs and
 * thicket clumps near the edge and a small lake ringed with reeds. `dense` stacks several thousand pieces.
 */
export function syntheticShape(seed, radius = RULES.radius, {dense = false, lake = {x:26, z:-18, r:6}} = {}){
  const rng = rngFor(seed ^ 0x51ce), features = [], R = radius;
  let a = 0;
  while(a < Math.PI * 2){
    const fence = rng() < .5, arc = (fence ? 30 + rng() * 26 : 36 + rng() * 40) / R, end = Math.min(Math.PI * 2, a + arc);
    if(fence){
      const rr = R - 2.4, step = 2 / rr;
      for(let t = a; t < end; t += step)features.push({kind:'fence', x:Math.cos(t + step / 2) * rr, z:Math.sin(t + step / 2) * rr, angle:t + step / 2 + Math.PI / 2, scale:1});
    }
    const rows = fence ? (dense ? 3 : 1) : (dense ? 6 : 3);
    for(let row = 0; row < rows; row++){
      const rr = R - (fence ? 1.2 : 3.2) + row * 1.35, step = (dense ? 1.1 : 1.6) / rr;
      for(let t = a + rng() * step; t < end; t += step * (.8 + rng() * .4)){const j = (rng() - .5) * .9;features.push({kind:'thicket', x:Math.cos(t) * (rr + j), z:Math.sin(t) * (rr + j), angle:t, scale:.8 + rng() * .45});}
    }
    a = end;
  }
  if(lake)for(let t = 0; t < Math.PI * 2; t += 1.25 / (lake.r + .5)){const j = rng() * .5;features.push({kind:'reeds', x:lake.x + Math.cos(t) * (lake.r + .35 + j), z:lake.z + Math.sin(t) * (lake.r + .35 + j), angle:t, scale:.8 + rng() * .4});}
  const terrain = (x, z) => Math.hypot(x, z) >= R - 1 ? TERRAIN.void : lake && Math.hypot(x - lake.x, z - lake.z) < lake.r ? TERRAIN.water : TERRAIN.ground;
  return {seed, radius:R, features, terrain, lake};
}
