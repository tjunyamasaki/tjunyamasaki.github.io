// Homestead: building and farming on a grid (host simulation, no DOM).
//
// The ground is cut into cells CELL units wide (about a wanderer and a half). A cell holds up to two layers:
//  - ground: tilled soil (crops grow in it) or a floor (planks, flagstones). Kept in world.tiles.
//  - something standing on it: a barrier (fence, palisade, stone wall, gate: buildings flagged `grid`
//    with their cell i, j) or a camp object (workbench, chest, fire...: buildings with a `foot`
//    {i, j, w, h} of whole cells, drawn scaled to fit it). Both are ordinary World buildings, so they
//    keep hit points, block walkers, and creatures claw at walls.
// Neighbouring pieces join: barriers draw rails to the barriers beside them, floors and soil merge
// their borders (see homestead-render.mjs). Nothing here knows how anything looks.
//
// Every change goes through one command, {type:'tile', tool, cells:[[i,j],...], rotation, stationId}, so a
// drag that paints twenty fence posts is a single request and guests can use it like the host.
//
// Where it runs: the Vigil and the Homestead sandbox (gridWorld). There the Build menu offers the grid
// pieces (contracts.mjs GRID_*_BUILD_RECIPES) and every piece costs what its RECIPES entry says, per
// cell; the Homestead can switch that off (world.homestead.free). Ordinary expeditions keep the old
// free-placed walls and pumpkin patches.
import {ITEMS, RECIPES, RULES, STRUCTURES, NODES} from './content.mjs?v=harvest-18';
import {stationLabel} from './interactions.mjs?v=harvest-18';
import {hushReason} from './hush.mjs?v=harvest-18';
import {shelfCount, spillShelf} from './bookshelf.mjs?v=harvest-18';
import {landReason} from './shrinecamp.mjs?v=harvest-18';
import {hearthReason, kindleHearth, bankHearth} from './vigil.mjs?v=harvest-18';
import {houseBuilt, houseGone} from './satoyama/animals.mjs?v=harvest-18';

export const CELL = 1.5;
export const MAX_CELLS = 48;
/** How far from the wanderer a cell may be worked outside the Homestead sandbox. */
export const WORK_RANGE = 6;
/** Most buildings a world keeps (saves refuse more than 500: serialization.mjs). */
export const BUILDING_LIMIT = 450;

/** True where building and farming happen on the grid: the Vigil and the Homestead, never underground. */
export const gridWorld = world => !!world && !world.dungeon && !world.arena && (!!world.homestead || world.mode === 'vigil' || world.satoyama?.place === 'farm');

/** Ground kinds. `recipe`: the RECIPES entry that lays it (its cost is per cell). */
export const GROUNDS = Object.freeze({
  soil: {name: 'Tilled soil', recipe: 'till'},
  plank: {name: 'Plank floor', recipe: 'plank'},
  flagstone: {name: 'Flagstone floor', recipe: 'flagstone'},
  boards: {name: 'Broad boards', recipe: 'boards'},
  roughplank: {name: 'Rough planks', recipe: 'roughplank'},
  slabs: {name: 'Stone slabs', recipe: 'slabs'},
  cobble: {name: 'Cobblestone', recipe: 'cobble'},
  fieldstone: {name: 'Fieldstone path', recipe: 'fieldstone'},
});

/** Building types placed on the grid (costs: RECIPES by the same id). `wall` and `gate` keep their old ids. */
export const BARRIERS = Object.freeze({
  // Radii keep the gap between two neighbours narrower than a wanderer (body .33).
  fence: {name: 'Fence', radius: .62},
  wall: {name: 'Palisade', radius: .66},
  stonewall: {name: 'Stone wall', radius: .68},
  gate: {name: 'Gate', radius: .62, gate: true},
  // House walls: tall and solid; with a gate for a door they close a room (roomAt).
  timberwall: {name: 'Timber wall', radius: .7, room: true},
  masonwall: {name: 'Masonry wall', radius: .72, room: true},
});
export const BARRIER_TYPES = Object.freeze(Object.keys(BARRIERS));
/** What closes a room: the house walls, and gates as its doors. Fences, palisades and low walls do not. */
export const ROOM_WALLS = Object.freeze(['timberwall', 'masonwall', 'gate']);
/** Largest room, in cells: past this a space counts as outdoors. */
export const ROOM_MAX = 120;

/**
 * Camp objects on the grid: footprint in cells (w across, h deep) and `art`, how wide the drawing
 * itself is in world units (the sprite minus its transparent padding, measured from the theme art).
 * Each is drawn at the scale that makes its art fill its footprint (objectScale), like the props in
 * Don't Starve or Stardew sit in their tiles. Costs come from RECIPES.
 */
export const OBJECTS = Object.freeze({
  bench: {w: 1, h: 1, art: 1.54},
  chest: {w: 1, h: 1, art: 1.05},
  bookshelf: {w: 1, h: 1, art: 1.1},
  // The Shrine of Yomi's (shrinecamp.mjs): the paper ward's rope spans two cells.
  toro: {w: 1, h: 1, art: .94},
  hokora: {w: 1, h: 1, art: 1.28},
  fudaward: {w: 2, h: 1, art: 1.95},
  fire: {w: 1, h: 1, art: 1.62},
  pot: {w: 1, h: 1, art: 1.56},
  lantern: {w: 1, h: 1, art: 1.02},
  bed: {w: 2, h: 1, art: 2.04},
  trap: {w: 1, h: 1, art: 1.56},
  ward: {w: 1, h: 1, art: .98},
  hushstone: {w: 1, h: 1, art: 1.49},
  // The Vigil's home (vigil.mjs): the big fire takes four cells.
  hearth: {w: 2, h: 2, art: 3.8},
  glimmer: {w: 1, h: 1, art: 1.22},
  // Satoyama's animal houses (satoyama/animals.mjs).
  coop: {w: 2, h: 2, art: 2.65},
  barn: {w: 3, h: 2, art: 4.35},
});
export const OBJECT_TYPES = Object.freeze(Object.keys(OBJECTS));
/** Art fills 88% of the footprint's width; small art grows a little, never past 1.12. */
export function objectScale(type){
  const o = OBJECTS[type];
  return o ? Math.min(1.12, o.w * CELL * .88 / o.art) : 1;
}

/**
 * Crops. `grow`: seconds from seed to ripe in daylight (night grows at NIGHT_RATE).
 * `regrow`: growth a perennial falls back to after a harvest instead of being used up.
 * Watering (later) only has to change growthRate().
 */
export const CROPS = Object.freeze({
  pumpkin: {name: 'Pumpkin', seed: 'seed', grow: 100, yield: {pumpkin: 2}, seeds: [1, 2]},
  moonroot: {name: 'Moonroot', seed: 'rootseed', grow: 60, yield: {moonroot: 2}, seeds: [1, 2], glow: '#bff3ff'},
  duskwheat: {name: 'Duskwheat', seed: 'wheatseed', grow: 80, yield: {wheat: 2, fiber: 2}, seeds: [1, 3]},
  bloodapple: {name: 'Bloodapple', seed: 'appleseed', grow: 140, yield: {bloodapple: 3}, seeds: [0, 1], regrow: 60},
  // Night crops: grow only after dark (a little at dusk), never by day. Seeds come from wild night blooms (nightbloom.mjs).
  gloomcap: {name: 'Gloomcap', seed: 'gloomspore', grow: 70, yield: {gloomcap: 3}, seeds: [1, 2], night: true, glow: '#c9b2ef'},
  starlily: {name: 'Starlily', seed: 'lilybulb', grow: 90, yield: {starlily: 2}, seeds: [1, 2], night: true, glow: '#9ff0ff'},
  // Rare: their seeds only come from the rare blooms on some common nights.
  moonpetal: {name: 'Moonpetal', seed: 'petalseed', grow: 150, yield: {moonpetal: 2}, seeds: [0, 1], night: true, rare: true, glow: '#fff4c6'},
  ghostgourd: {name: 'Ghostgourd', seed: 'gourdseed', grow: 160, yield: {ghostgourd: 1}, seeds: [1, 1], night: true, rare: true, glow: '#9ff0ff'},
  // Satoyama's: a quick root, and a bean bush that keeps giving.
  daikon: {name: 'Daikon', seed: 'daikonseed', grow: 70, yield: {daikon: 2}, seeds: [1, 2]},
  soybean: {name: 'Soybean', seed: 'soyseed', grow: 110, yield: {soybean: 3}, seeds: [0, 1], regrow: 55},
});
export const CROP_TYPES = Object.freeze(Object.keys(CROPS));
/** Growth (0..100) at which each of the four art frames starts. */
export const STAGES = Object.freeze([0, 25, 60, 100]);
export const NIGHT_RATE = .35;

/** Every grid tool, by id. The Build menu reaches them through their recipes (toolOfRecipe). */
export const TOOLS = Object.freeze({
  till: {kind: 'ground', ground: 'soil', name: 'Till soil'},
  plank: {kind: 'ground', ground: 'plank', name: 'Plank floor'},
  flagstone: {kind: 'ground', ground: 'flagstone', name: 'Flagstone'},
  boards: {kind: 'ground', ground: 'boards', name: 'Broad boards'},
  roughplank: {kind: 'ground', ground: 'roughplank', name: 'Rough planks'},
  slabs: {kind: 'ground', ground: 'slabs', name: 'Stone slabs'},
  cobble: {kind: 'ground', ground: 'cobble', name: 'Cobblestone'},
  fieldstone: {kind: 'ground', ground: 'fieldstone', name: 'Fieldstone'},
  fence: {kind: 'barrier', type: 'fence', name: 'Fence'},
  wall: {kind: 'barrier', type: 'wall', name: 'Palisade'},
  stonewall: {kind: 'barrier', type: 'stonewall', name: 'Stone wall'},
  gate: {kind: 'barrier', type: 'gate', name: 'Gate'},
  timberwall: {kind: 'barrier', type: 'timberwall', name: 'Timber wall'},
  masonwall: {kind: 'barrier', type: 'masonwall', name: 'Masonry wall'},
  ...Object.fromEntries(OBJECT_TYPES.map(id => [`obj:${id}`, {kind: 'object', type: id, name: STRUCTURES[id]?.name || id}])),
  ...Object.fromEntries(CROP_TYPES.map(id => [`plant:${id}`, {kind: 'plant', crop: id, name: `Plant ${CROPS[id].name.toLowerCase()}`}])),
  harvest: {kind: 'harvest', name: 'Harvest'},
  remove: {kind: 'remove', name: 'Remove'},
  // The Build menu's Remove tool: walls, gates, floors, soil and empty camp pieces, never a growing crop or a full chest,
  // so a careless drag cannot lose anything. Everything taken down gives back what it cost (refund).
  clear: {kind: 'remove', name: 'Remove', pieces: true},
  use: {kind: 'use', name: 'Use'},
});

/** The grid tool a Build-menu recipe places, or null for a piece that is still free-placed (the cart). */
export function toolOfRecipe(recipeId){
  if(!RECIPES[recipeId] || RECIPES[recipeId].kind !== 'build') return null;
  if(recipeId === 'till') return 'till';
  if(TOOLS[recipeId] && (TOOLS[recipeId].kind === 'ground' || TOOLS[recipeId].kind === 'barrier')) return recipeId;
  return OBJECTS[recipeId] ? `obj:${recipeId}` : null;
}
/** The RECIPES entry behind a tool: what it costs and where it may be built. */
export function recipeOfTool(toolId){
  const tool = TOOLS[toolId];
  if(!tool) return null;
  if(tool.kind === 'ground') return GROUNDS[tool.ground].recipe;
  if(tool.kind === 'barrier' || tool.kind === 'object') return tool.type;
  return null;
}
/** Pieces that turn with R or the Rotate button. */
export const rotates = toolId => TOOLS[toolId]?.kind === 'barrier';

export const keyOf = (i, j) => `${i},${j}`;
export const cellAt = (x, z) => [Math.floor(x / CELL), Math.floor(z / CELL)];
export const centerOf = (i, j) => ({x: (i + .5) * CELL, z: (j + .5) * CELL});
/** Footprint of a tool's piece: 1x1 for everything but camp objects. */
export const sizeOf = toolId => {const t = TOOLS[toolId];return t?.kind === 'object' ? {w: OBJECTS[t.type].w, h: OBJECTS[t.type].h} : {w: 1, h: 1};};
/** Where a footprint anchored at cell (i, j) puts its building: the middle of its cells. */
export const footCenter = (i, j, w, h) => ({x: (i + w / 2) * CELL, z: (j + h / 2) * CELL});
/**
 * Where a camp object's sprite stands: a little south of its footprint's middle. The art is drawn
 * from the front with its feet on its bottom edge, so this puts the body over the middle of its
 * tiles in the 3/4 view instead of hanging over the row behind.
 */
export const objectSpot = (i, j, w, h) => {const c = footCenter(i, j, w, h);return {x: c.x, z: c.z + h * CELL * .2};};
/** Camp object whose footprint covers cell (i, j), if any. */
export function objectAt(world, i, j){
  return world.buildings.find(b => b.foot && b.hp > 0 && i >= b.foot.i && i < b.foot.i + b.foot.w && j >= b.foot.j && j < b.foot.j + b.foot.h) || null;
}

/**
 * True when something is built on the cell under (x, z), or on the cells within `r` of it: a floor or soil,
 * a wall, or a camp object. Trees, rocks and the like never grow back there (World.tick), and nothing new
 * (omens, thorns, night blooms) comes up on it.
 */
export function builtAt(world, x, z, r = 0){
  if(!world) return false;
  const cells = world.tiles?.cells;
  const spots = r > 0 ? [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] : [[0, 0]];
  for(const [dx, dz] of spots){
    const [i, j] = cellAt(x + dx, z + dz);
    if(cells?.[keyOf(i, j)] || barrierAt(world, i, j) || objectAt(world, i, j)) return true;
  }
  return false;
}
/** Small wild things standing in a cell that was just built over (grass, mooncaps) wilt; they come back if it is cleared. */
function bury(world, i, j, w = 1, h = 1){
  for(const n of world.nodes || []){
    if(n.ready || NODES[n.type]?.omen || NODES[n.type]?.landmark) continue;
    const [a, b] = cellAt(n.x, n.z);
    if(a >= i && a < i + w && b >= j && b < j + h){n.ready = (world.time || 0) + 1;n.hits = 0;}
  }
}

/** The world's tile layer, made on first use. `rev` changes whenever any ground changes. */
export function tilesOf(world){
  if(!world.tiles || typeof world.tiles !== 'object' || !world.tiles.cells) world.tiles = {rev: 0, cells: {}};
  return world.tiles;
}
export function tileAt(world, i, j){
  return world.tiles?.cells?.[keyOf(i, j)] || null;
}

export function stageOf(growth){
  let stage = 0;
  for(let s = 0; s < STAGES.length; s++) if(growth >= STAGES[s]) stage = s;
  return stage;
}
export const ripe = tile => !!tile?.crop && tile.growth >= 100;

/** Barrier building standing in a cell, if any. */
export function barrierAt(world, i, j){
  return world.buildings.find(b => b.grid && b.i === i && b.j === j && b.hp > 0) || null;
}

/** Map "i,j" -> barrier, for joining many pieces at once (renderers). */
export function barrierIndex(world){
  const map = new Map();
  for(const b of world.buildings) if(b.grid && b.hp > 0) map.set(keyOf(b.i, b.j), b);
  return map;
}

export const gateAxis = b => (b.rotation | 0) % 2 === 0 ? 'ew' : 'ns';
const DIRS = Object.freeze({n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0]});
const axisOf = dir => dir === 'e' || dir === 'w' ? 'ew' : 'ns';

/**
 * Which sides of a barrier join a neighbour: {n, s, e, w}. A gate only joins along its own
 * axis, and only a neighbour on that axis joins a gate. A piece with no neighbour at all is a
 * short run along its rotation (the caller decides how to draw that).
 */
export function linksOf(b, index){
  const out = {n: false, s: false, e: false, w: false};
  for(const [dir, [di, dj]] of Object.entries(DIRS)){
    const other = index.get(keyOf(b.i + di, b.j + dj));
    if(!other) continue;
    if(b.type === 'gate' && gateAxis(b) !== axisOf(dir)) continue;
    if(other.type === 'gate' && gateAxis(other) !== axisOf(dir)) continue;
    out[dir] = true;
  }
  return out;
}

/** Ground links for autotiling: true where the neighbour holds the same ground. 8 neighbours. */
export function groundLinks(world, i, j, ground){
  const same = (di, dj) => tileAt(world, i + di, j + dj)?.g === ground;
  return {n: same(0, -1), s: same(0, 1), e: same(1, 0), w: same(-1, 0), ne: same(1, -1), nw: same(-1, -1), se: same(1, 1), sw: same(-1, 1)};
}

/** Growth per second for a tile. The one place watering, fertiliser or seasons will plug in. */
export function growthRate(world, tile, phase){
  const crop = CROPS[tile.crop];
  if(!crop) return 0;
  const light = crop.night ? (phase === 'night' ? 1 : phase === 'dusk' ? .4 : 0) : phase === 'day' ? 1 : NIGHT_RATE;
  return 100 / crop.grow * light * (world.homestead?.speed || 1);
}

/** Host, every tick. */
export function stepTiles(world, dt, phase){
  const cells = world.tiles?.cells;
  if(!cells) return;
  for(const tile of Object.values(cells)){
    if(!tile.crop || tile.growth >= 100) continue;
    tile.growth = Math.min(100, tile.growth + growthRate(world, tile, phase) * dt);
  }
}

const free = world => !!world.homestead?.free;
/** The Heartfire can be taken down (and rebuilt elsewhere) only on the Vigil. */
const hearthMoves = world => world.mode === 'vigil';
function costOf(toolId){
  const tool = TOOLS[toolId];
  if(tool?.kind === 'plant') return {[CROPS[tool.crop].seed]: 1};
  return RECIPES[recipeOfTool(toolId)]?.cost || {};
}
const recipeCost = recipeId => RECIPES[recipeId]?.cost || {};

function blockedByThings(world, x, z, radius){
  if(world.buildings.some(b => !b.grid && !b.foot && b.hp > 0 && Math.hypot(b.x - x, b.z - z) < Math.max(.3, b.radius ?? STRUCTURES[b.type]?.radius ?? 0) + radius)) return 'Something is built here';
  if(world.nodes.some(n => !n.ready && (NODES[n.type]?.radius || 0) > .2 && Math.hypot(n.x - x, n.z - z) < NODES[n.type].radius + radius)) return 'Clear this spot first';
  return '';
}

/**
 * Why `tool` cannot be used on cell (i, j) right now: '' when it can, 'same' when it would
 * change nothing (painting over your own work stays quiet), otherwise a sentence for a toast.
 */
export function cellReason(world, p, toolId, i, j, {stationId = null} = {}){
  const tool = TOOLS[toolId];
  if(!tool) return 'Unknown tool';
  if(!gridWorld(world)) return 'Build here with the Build menu';
  if(!Number.isInteger(i) || !Number.isInteger(j)) return 'Outside the clearing';
  const {x, z} = centerOf(i, j);
  if(!world.walkable(x, z)) return 'Outside the clearing';
  if(!world.homestead && Math.hypot(x - p.x, z - p.z) > WORK_RANGE) return 'Move closer to this spot';
  const tile = tileAt(world, i, j), barrier = barrierAt(world, i, j), object = tool.kind === 'object' ? null : objectAt(world, i, j);
  if(tool.kind === 'object'){
    const {w, h} = OBJECTS[tool.type];
    for(let a = 0; a < w; a++)for(let b = 0; b < h; b++){
      const ci = i + a, cj = j + b, c = centerOf(ci, cj), t = tileAt(world, ci, cj);
      if(!world.walkable(c.x, c.z)) return 'Outside the clearing';
      if(barrierAt(world, ci, cj)) return 'A wall is in the way';
      const other = objectAt(world, ci, cj);
      if(other) return other.type === tool.type && other.foot.i === i && other.foot.j === j ? 'same' : 'Something is built here';
      if(t?.g === 'soil') return 'Not on tilled soil';
    }
    const {x: fx, z: fz} = footCenter(i, j, w, h);
    if(world.players.some(q => q.online && !q.ghost && Math.abs(q.x - fx) < w * CELL / 2 + .2 && Math.abs(q.z - fz) < h * CELL / 2 + .2)) return 'A wanderer is standing here';
    const why = blockedByThings(world, fx, fz, Math.min(w, h) * CELL * .45);if(why) return why;
    if(tool.type === 'hushstone' && hushReason(world)) return hushReason(world);
    if(landReason(world, tool.type)) return landReason(world, tool.type);
    if(tool.type === 'hearth' && hearthReason(world)) return hearthReason(world);
    if(world.buildings.length >= BUILDING_LIMIT) return 'The camp has reached its structure limit';
  }else if(object && ['barrier', 'plant', 'harvest'].includes(tool.kind) || object && tool.ground === 'soil'){
    // Floors may run under furniture; soil, crops and walls may not.
    return tool.kind === 'harvest' ? 'same' : 'Something is built here';
  }else if(tool.kind === 'ground'){
    if(tile?.g === tool.ground) return 'same';
    if(tile?.crop) return 'Harvest or remove the crop first';
    if(tool.ground === 'soil' && barrier) return 'Something is built here';
    if(tool.ground === 'soil'){const why = blockedByThings(world, x, z, .3);if(why) return why;}
    else if(world.nodes.some(n => !n.ready && (NODES[n.type]?.radius || 0) > .2 && Math.hypot(n.x - x, n.z - z) < NODES[n.type].radius + .3)) return 'Clear this spot first';
  }else if(tool.kind === 'barrier'){
    // Painting one barrier over another swaps it (a gate dropped into a fence line, a fence rebuilt in stone).
    if(barrier?.type === tool.type) return 'same';
    if(tile?.crop) return 'A crop is growing here';
    if(!barrier && world.buildings.length >= BUILDING_LIMIT) return 'The camp has reached its structure limit';
    const radius = BARRIERS[tool.type].radius;
    if(!barrier && world.players.some(q => q.online && !q.ghost && Math.hypot(q.x - x, q.z - z) < radius + .3)) return 'A wanderer is standing here';
    const why = blockedByThings(world, x, z, radius);if(why) return why;
  }else if(tool.kind === 'plant'){
    if(tile?.g !== 'soil') return 'Till the soil first';
    if(tile.crop) return tile.crop === tool.crop ? 'same' : 'Something is already growing';
    if(barrier) return 'Something is built here';
  }else if(tool.kind === 'harvest'){
    if(!tile?.crop) return 'same';
    if(!ripe(tile)) return 'Not ripe yet';
    return '';
  }else if(tool.kind === 'remove'){
    if(object && !barrier){
      if(object.fixed || (object.type === 'hearth' && !hearthMoves(world))) return 'That stays';
      if(world.chestSessions?.has(object.id)) return 'Someone has it open';
      if(tool.pieces && [object.store, object.overflow].some(c => c?.slots?.some(Boolean))) return 'Empty it first';
      if(tool.pieces && shelfCount(object)) return 'Empty it first';
      return '';
    }
    if(tool.pieces && !barrier && tile?.crop) return 'Harvest the crop first';
    return barrier || tile ? '' : 'same';
  }else if(tool.kind === 'use'){
    if(barrier?.type === 'gate') return '';
    if(ripe(tile)) return '';
    return 'same';
  }
  if(free(world)) return '';
  // Workbench pieces: built from a catalog opened at a workbench, like the free-placed ones (World.stationBuilding).
  const recipeId = recipeOfTool(toolId);
  if(RECIPES[recipeId]?.station && !world.stationBuilding(p, recipeId, stationId, true)) return stationLabel(recipeId) || 'Build this at a workbench';
  const cost = costOf(toolId);
  if(!world.canPay(p, cost, true)){
    const [itemId] = Object.entries(cost).find(([id, n]) => world.available(p, id, true) < n) || [];
    return itemId ? `Needs ${ITEMS[itemId]?.name?.toLowerCase() || itemId}` : 'Gather the missing materials';
  }
  return '';
}

/** Gate on the grid: it turns to run between the barriers beside it when it can. */
function orient(world, type, i, j, rotation){
  if(type !== 'gate') return rotation & 1;
  const has = (di, dj) => !!barrierAt(world, i + di, j + dj);
  const ew = has(1, 0) || has(-1, 0), ns = has(0, 1) || has(0, -1);
  if(ew && !ns) return rotation === 2 ? 2 : 0;
  if(ns && !ew) return rotation === 3 ? 3 : 1;
  return rotation & 3;
}

function harvestTile(world, p, tile, i, j){
  const crop = CROPS[tile.crop];
  const {x, z} = centerOf(i, j);
  const got = [];
  for(const [itemId, count] of Object.entries(crop.yield)){world.give(p, itemId, count);got.push(`+${count} ${ITEMS[itemId]?.name || itemId}`);}
  const [lo, hi] = crop.seeds, seeds = lo + Math.floor((world.lootRng?.() ?? Math.random()) * (hi - lo + 1));
  if(seeds > 0) world.give(p, crop.seed, seeds);
  world.event('loot', x, z, got[0] || crop.name);
  world.event('tile', x, z, '', {tool: 'harvest', crop: tile.crop});
  if(crop.regrow){tile.growth = crop.regrow;}else{tile.crop = null;tile.growth = 0;}
  world.stats.harvested = (world.stats.harvested || 0) + 1;
}

/**
 * Taking a grid piece down (or building over it) gives back what it cost: all of it while it is whole,
 * less as it has been knocked about (a battered wall is not a free repair). `piece`: the building, if any.
 */
export function refund(world, p, cost, piece = null){
  if(free(world)) return '';
  const k = piece && piece.maxHp > 0 ? Math.max(0, Math.min(1, piece.hp / piece.maxHp)) : 1;
  const got = [];
  for(const [itemId, count] of Object.entries(cost)){const n = Math.round(count * k);if(n > 0){world.give(p, itemId, n);got.push(`+${n} ${ITEMS[itemId]?.name || itemId}`);}}
  return got.join(' · ');
}

/** Apply one tool to one cell. Assumes cellReason() said ''. */
function applyCell(world, p, toolId, i, j, rotation){
  const tool = TOOLS[toolId], tiles = tilesOf(world), key = keyOf(i, j), {x, z} = centerOf(i, j);
  const tile = tiles.cells[key] || null, barrier = barrierAt(world, i, j), object = objectAt(world, i, j);
  if(!free(world) && !world.pay(p, costOf(toolId), true)) return false;
  if(tool.kind === 'object'){
    const {w, h} = OBJECTS[tool.type], c = objectSpot(i, j, w, h);
    const b = world.structure(tool.type, c.x, c.z);
    Object.assign(b, {foot: {i, j, w, h}, scale: objectScale(tool.type)});
    if(tool.type === 'hearth') kindleHearth(world, b);
    bury(world, i, j, w, h);
    world.buildings.push(b);world.stats.built++;
    houseBuilt(world, b);
    world.event('tile', c.x, c.z, '', {tool: toolId});world.event('build', c.x, c.z, STRUCTURES[tool.type]?.name || tool.type);
    return true;
  }
  if(tool.kind === 'ground'){
    if(tile?.g) refund(world, p, recipeCost(GROUNDS[tile.g].recipe));
    tiles.cells[key] = {g: tool.ground, crop: null, growth: 0};
    tiles.rev++;bury(world, i, j);
    world.event('tile', x, z, '', {tool: toolId});
  }else if(tool.kind === 'barrier'){
    if(barrier){refund(world, p, recipeCost(barrier.type), barrier);world.buildings = world.buildings.filter(b => b !== barrier);}
    world.gridRev = (world.gridRev || 0) + 1;
    const b = world.structure(tool.type, x, z);
    Object.assign(b, {grid: true, i, j, radius: BARRIERS[tool.type].radius, rotation: orient(world, tool.type, i, j, rotation | 0), open: false});
    bury(world, i, j);
    world.buildings.push(b);world.stats.built++;
    world.event('tile', x, z, '', {tool: toolId});
  }else if(tool.kind === 'plant'){
    tile.crop = tool.crop;tile.growth = 0;
    world.event('tile', x, z, '', {tool: toolId});
  }else if(tool.kind === 'harvest'){
    harvestTile(world, p, tile, i, j);
  }else if(tool.kind === 'use'){
    if(barrier?.type === 'gate'){barrier.open = !barrier.open;world.event('tile', x, z, '', {tool: barrier.open ? 'open' : 'close'});}
    else harvestTile(world, p, tile, i, j);
  }else if(tool.kind === 'remove'){
    let got = '';
    if(barrier || object){
      const gone = barrier || object;
      if(gone.type === 'hearth') bankHearth(world, gone);
      houseGone(world, gone);
      got = refund(world, p, recipeCost(gone.type), gone);
      world.dropContainer?.(gone.store, gone.x, gone.z);
      if(gone.overflow) world.dropContainer?.(gone.overflow, gone.x, gone.z);
      spillShelf(world, gone);
      world.buildings = world.buildings.filter(b => b !== gone);world.gridRev = (world.gridRev || 0) + 1;
    }else if(tile?.crop){
      if(!ripe(tile) && !free(world)) world.give(p, CROPS[tile.crop].seed, 1);
      else if(ripe(tile)) harvestTile(world, p, tile, i, j);
      tile.crop = null;tile.growth = 0;
    }else if(tile){
      got = refund(world, p, recipeCost(GROUNDS[tile.g].recipe));
      delete tiles.cells[key];tiles.rev++;
    }
    world.event('tile', x, z, '', {tool: 'remove'});
    if(got) world.event('loot', x, z, got);
  }
  return true;
}

/** The 'tile' world action. Cells are worked in order; the first refusal is reported. */
export function applyTiles(world, p, cmd){
  const toolId = String(cmd?.tool || '');
  if(!TOOLS[toolId] || !Array.isArray(cmd.cells)) return {ok: false, code: 'invalidCommand'};
  if(world.dungeon || world.arena) return {ok: false, code: 'unavailable'};
  const rotation = Number.isInteger(cmd.rotation) ? cmd.rotation & 3 : 0;
  let done = 0, refusal = '';
  const seen = new Set();
  for(const cell of cmd.cells.slice(0, MAX_CELLS)){
    const i = Array.isArray(cell) ? cell[0] : NaN, j = Array.isArray(cell) ? cell[1] : NaN;
    if(!Number.isInteger(i) || !Number.isInteger(j) || seen.has(keyOf(i, j))) continue;
    seen.add(keyOf(i, j));
    const why = cellReason(world, p, toolId, i, j, {stationId: typeof cmd.stationId === 'string' ? cmd.stationId : null});
    if(why){if(why !== 'same' && !refusal) refusal = why;continue;}
    if(applyCell(world, p, toolId, i, j, rotation)) done++;
  }
  if(done) world.assertItems?.();
  if(!done && refusal){world.tell(p, refusal);return {ok: false, code: 'rejected', reason: refusal};}
  return {ok: true, code: 'ok', done};
}

/**
 * The room around cell (i, j): every cell reachable from it without crossing a room wall (ROOM_WALLS)
 * must have a floor, and there must be at most ROOM_MAX of them. Returns {cells, size, key} or null
 * (outdoors, or a gap somewhere in the walls). Gates count as doors whether open or shut.
 */
const ROOM_MEMO = new WeakMap();
export function roomAt(world, i, j){
  const cells = world.tiles?.cells;
  if(!cells) return null;
  const walls = new Set();
  let n = 0;
  for(const b of world.buildings) if(b.grid && b.hp > 0){n++;if(ROOM_WALLS.includes(b.type)) walls.add(keyOf(b.i, b.j));}
  const stamp = `${world.tiles.rev}:${world.gridRev || 0}:${n}`;
  let memo = ROOM_MEMO.get(world);
  if(!memo || memo.stamp !== stamp){memo = {stamp, rooms: new Map()};ROOM_MEMO.set(world, memo);}
  const start = keyOf(i, j);
  if(memo.rooms.has(start)) return memo.rooms.get(start);
  let room = null;
  if(!walls.has(start) && cells[start]?.g && cells[start].g !== 'soil'){
    const seen = new Set([start]), queue = [[i, j]];let open = false;
    while(queue.length && !open){
      const [a, b] = queue.pop();
      for(const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
        const k = keyOf(a + da, b + db);
        if(seen.has(k) || walls.has(k)) continue;
        const t = cells[k];
        if(!t?.g || t.g === 'soil' || seen.size >= ROOM_MAX){open = true;break;}
        seen.add(k);queue.push([a + da, b + db]);
      }
    }
    if(!open){const list = [...seen].sort();room = {cells: list, size: list.length, key: list[0]};for(const k of list) memo.rooms.set(k, room);}
  }
  memo.rooms.set(start, room);
  return room;
}
/** The room a building (a bed) stands in, by any of its cells. */
export function roomOfBuilding(world, b){
  if(!b) return null;
  if(b.foot){for(let a = 0; a < b.foot.w; a++)for(let c = 0; c < b.foot.h; c++){const r = roomAt(world, b.foot.i + a, b.foot.j + c);if(r) return r;}return null;}
  const [i, j] = cellAt(b.x, b.z);return roomAt(world, i, j);
}

/** Seeds a wanderer carries, as crop ids, in CROPS order. */
export function carriedSeeds(world, p){
  return CROP_TYPES.filter(id => world.available(p, CROPS[id].seed, true) > 0);
}
/**
 * Soil a wanderer can reach, as World.target() candidates: ripe crops (Harvest), and empty soil while
 * they carry seeds (Plant). Growing crops are left alone so they never steal the target.
 */
export function cropTargets(world, p){
  const cells = world.tiles?.cells;
  if(!cells) return [];
  const out = [];
  let seeds = null;
  for(const [key, tile] of Object.entries(cells)){
    if(tile.g !== 'soil') continue;
    const empty = !tile.crop;
    if(!ripe(tile) && !empty) continue;
    const [i, j] = key.split(',').map(Number), {x, z} = centerOf(i, j);
    if(Math.hypot(x - p.x, z - p.z) >= RULES.reach) continue;
    if(empty){
      seeds ??= carriedSeeds(world, p);
      if(!seeds.length || barrierAt(world, i, j) || objectAt(world, i, j)) continue;
      out.push({kind: 'crop', entity: {id: `soil:${key}`, i, j, x, z, type: 'soil', crop: null}, label: 'Plant'});
    }else out.push({kind: 'crop', entity: {id: `crop:${key}`, i, j, x, z, type: `crop-${tile.crop}`, crop: tile.crop}, label: `Harvest ${CROPS[tile.crop].name.toLowerCase()}`});
  }
  return out;
}

/**
 * A chance at crop seeds from wild plants on the grid worlds (World node harvest): grain from dry grass,
 * moonroot from mooncaps, bloodapple from berry bushes. Pumpkin seeds already come with wild pumpkins
 * and berries; the night crops' seeds from the night blooms (nightbloom.mjs).
 */
export const WILD_SEEDS = Object.freeze({grass: {wheatseed: .35}, mushroom: {rootseed: .35}, bush: {appleseed: .2}});
export function wildSeeds(world, nodeType){
  if(!gridWorld(world) || !WILD_SEEDS[nodeType]) return {};
  const out = {};
  for(const [itemId, chance] of Object.entries(WILD_SEEDS[nodeType])) if((world.lootRng?.() ?? Math.random()) < chance) out[itemId] = 1;
  return out;
}

/** Crops as sprite entities for the renderers: one frame per growth stage. */
export function cropEntities(world){
  const cells = world.tiles?.cells;
  if(!cells) return [];
  const out = [];
  for(const [key, tile] of Object.entries(cells)){
    if(!tile.crop) continue;
    const [i, j] = key.split(',').map(Number), {x, z} = centerOf(i, j);
    out.push({id: key, x, z, type: tile.crop, frame: stageOf(tile.growth), ripe: ripe(tile), growth: tile.growth});
  }
  return out;
}

/** Start a Homestead sandbox world (World option `homestead`). */
export function setupHomestead(world){
  world.homestead = {free: true, speed: 1, day: true};
  tilesOf(world);
}

/** A 4-connected run of cells from a to b (inclusive), so a dragged fence never skips a corner. */
export function cellLine(a, b){
  const out = [[a[0], a[1]]];
  let [i, j] = a;
  const di = Math.sign(b[0] - i), dj = Math.sign(b[1] - j);
  const spanI = Math.abs(b[0] - a[0]) || 1, spanJ = Math.abs(b[1] - a[1]) || 1;
  while((i !== b[0] || j !== b[1]) && out.length < 200){
    const leftI = Math.abs(b[0] - i) / spanI, leftJ = Math.abs(b[1] - j) / spanJ;
    if(i !== b[0] && (leftI >= leftJ || j === b[1])) i += di;
    else j += dj;
    out.push([i, j]);
  }
  return out;
}
