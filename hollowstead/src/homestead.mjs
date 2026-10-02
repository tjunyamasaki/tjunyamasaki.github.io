// Homestead: building and farming on a grid (host simulation, no DOM).
//
// The ground is cut into one-unit cells. A cell holds up to two layers:
//  - ground: tilled soil (crops grow in it) or a floor (planks, flagstones). Kept in world.tiles.
//  - a barrier: fence, palisade, stone wall or gate. These are ordinary World buildings (they keep
//    hit points, block walkers, and creatures claw at them) flagged `grid` with their cell (i, j).
// Neighbouring pieces join: barriers draw rails to the barriers beside them, floors and soil merge
// their borders (see homestead-render.mjs). Nothing here knows how anything looks.
//
// Every change goes through one command, {type:'tile', tool, cells:[[i,j],...], rotation}, so a
// drag that paints twenty fence posts is a single request and guests can use it like the host.
import {ITEMS, RULES, STRUCTURES, NODES} from './content.mjs?v=harvest-18';

export const CELL = 1;
export const MAX_CELLS = 48;
/** How far from the wanderer a cell may be worked outside the Homestead sandbox. */
export const WORK_RANGE = 6;

export const GROUNDS = Object.freeze({
  soil: {name: 'Tilled soil', cost: {}},
  plank: {name: 'Plank floor', cost: {wood: 1}},
  flagstone: {name: 'Flagstone floor', cost: {stone: 1}},
});

/** Building types placed on the grid. `wall` and `gate` keep their old ids, so creatures still go for them. */
export const BARRIERS = Object.freeze({
  fence: {name: 'Fence', cost: {wood: 1}, radius: .42},
  wall: {name: 'Palisade', cost: {wood: 2}, radius: .46},
  stonewall: {name: 'Stone wall', cost: {stone: 2}, radius: .48},
  gate: {name: 'Gate', cost: {wood: 3}, radius: .42, gate: true},
});
export const BARRIER_TYPES = Object.freeze(Object.keys(BARRIERS));

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
});
export const CROP_TYPES = Object.freeze(Object.keys(CROPS));
/** Growth (0..100) at which each of the four art frames starts. */
export const STAGES = Object.freeze([0, 25, 60, 100]);
export const NIGHT_RATE = .35;

/** Every tool the dock offers, by id. */
export const TOOLS = Object.freeze({
  till: {kind: 'ground', ground: 'soil', name: 'Till soil'},
  plank: {kind: 'ground', ground: 'plank', name: 'Plank floor'},
  flagstone: {kind: 'ground', ground: 'flagstone', name: 'Flagstone'},
  fence: {kind: 'barrier', type: 'fence', name: 'Fence'},
  wall: {kind: 'barrier', type: 'wall', name: 'Palisade'},
  stonewall: {kind: 'barrier', type: 'stonewall', name: 'Stone wall'},
  gate: {kind: 'barrier', type: 'gate', name: 'Gate'},
  ...Object.fromEntries(CROP_TYPES.map(id => [`plant:${id}`, {kind: 'plant', crop: id, name: `Plant ${CROPS[id].name.toLowerCase()}`}])),
  harvest: {kind: 'harvest', name: 'Harvest'},
  remove: {kind: 'remove', name: 'Remove'},
  use: {kind: 'use', name: 'Use'},
});

export const keyOf = (i, j) => `${i},${j}`;
export const cellAt = (x, z) => [Math.floor(x / CELL), Math.floor(z / CELL)];
export const centerOf = (i, j) => ({x: (i + .5) * CELL, z: (j + .5) * CELL});

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
  const light = phase === 'day' ? 1 : NIGHT_RATE;
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
const costOf = tool => tool.kind === 'ground' ? GROUNDS[tool.ground].cost : tool.kind === 'barrier' ? BARRIERS[tool.type].cost : tool.kind === 'plant' ? {[CROPS[tool.crop].seed]: 1} : {};

function blockedByThings(world, x, z, radius){
  if(world.buildings.some(b => !b.grid && b.hp > 0 && Math.hypot(b.x - x, b.z - z) < Math.max(.3, b.radius ?? STRUCTURES[b.type]?.radius ?? 0) + radius)) return 'Something is built here';
  if(world.nodes.some(n => !n.ready && (NODES[n.type]?.radius || 0) > .2 && Math.hypot(n.x - x, n.z - z) < NODES[n.type].radius + radius)) return 'Clear this spot first';
  return '';
}

/**
 * Why `tool` cannot be used on cell (i, j) right now: '' when it can, 'same' when it would
 * change nothing (painting over your own work stays quiet), otherwise a sentence for a toast.
 */
export function cellReason(world, p, toolId, i, j){
  const tool = TOOLS[toolId];
  if(!tool) return 'Unknown tool';
  if(!Number.isInteger(i) || !Number.isInteger(j)) return 'Outside the clearing';
  const {x, z} = centerOf(i, j);
  if(!world.walkable(x, z)) return 'Outside the clearing';
  if(!world.homestead && Math.hypot(x - p.x, z - p.z) > WORK_RANGE) return 'Move closer to this spot';
  const tile = tileAt(world, i, j), barrier = barrierAt(world, i, j);
  if(tool.kind === 'ground'){
    if(tile?.g === tool.ground) return 'same';
    if(tile?.crop) return 'Harvest or remove the crop first';
    if(tool.ground === 'soil' && barrier) return 'Something is built here';
    if(tool.ground === 'soil'){const why = blockedByThings(world, x, z, .3);if(why) return why;}
  }else if(tool.kind === 'barrier'){
    // Painting one barrier over another swaps it (a gate dropped into a fence line, a fence rebuilt in stone).
    if(barrier?.type === tool.type) return 'same';
    if(tile?.crop) return 'A crop is growing here';
    if(world.buildings.filter(b => b.grid).length >= 600) return 'The homestead has reached its limit';
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
    return barrier || tile ? '' : 'same';
  }else if(tool.kind === 'use'){
    if(barrier?.type === 'gate') return '';
    if(ripe(tile)) return '';
    return 'same';
  }
  if(!free(world) && !world.canPay(p, costOf(tool), true)){
    const [itemId] = Object.entries(costOf(tool)).find(([id, n]) => world.available(p, id, true) < n) || [];
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

function refund(world, p, cost){
  if(free(world)) return;
  for(const [itemId, count] of Object.entries(cost)) world.give(p, itemId, Math.ceil(count * .5));
}

/** Apply one tool to one cell. Assumes cellReason() said ''. */
function applyCell(world, p, toolId, i, j, rotation){
  const tool = TOOLS[toolId], tiles = tilesOf(world), key = keyOf(i, j), {x, z} = centerOf(i, j);
  const tile = tiles.cells[key] || null, barrier = barrierAt(world, i, j);
  if(!free(world) && !world.pay(p, costOf(tool), true)) return false;
  if(tool.kind === 'ground'){
    if(tile?.g && tile.g !== 'soil') refund(world, p, GROUNDS[tile.g].cost);
    tiles.cells[key] = {g: tool.ground, crop: null, growth: 0};
    tiles.rev++;
    world.event('tile', x, z, '', {tool: toolId});
  }else if(tool.kind === 'barrier'){
    if(barrier){refund(world, p, BARRIERS[barrier.type]?.cost || {});world.buildings = world.buildings.filter(b => b !== barrier);}
    const b = world.structure(tool.type, x, z);
    Object.assign(b, {grid: true, i, j, radius: BARRIERS[tool.type].radius, rotation: orient(world, tool.type, i, j, rotation | 0), open: false});
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
    if(barrier){
      refund(world, p, BARRIERS[barrier.type]?.cost || {});
      world.dropContainer?.(barrier.store, barrier.x, barrier.z);
      world.buildings = world.buildings.filter(b => b !== barrier);
    }else if(tile?.crop){
      if(!ripe(tile) && !free(world)) world.give(p, CROPS[tile.crop].seed, 1);
      else if(ripe(tile)) harvestTile(world, p, tile, i, j);
      tile.crop = null;tile.growth = 0;
    }else if(tile){
      refund(world, p, GROUNDS[tile.g].cost);
      delete tiles.cells[key];tiles.rev++;
    }
    world.event('tile', x, z, '', {tool: 'remove'});
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
    const why = cellReason(world, p, toolId, i, j);
    if(why){if(why !== 'same' && !refusal) refusal = why;continue;}
    if(applyCell(world, p, toolId, i, j, rotation)) done++;
  }
  if(done) world.assertItems?.();
  if(!done && refusal){world.tell(p, refusal);return {ok: false, code: 'rejected', reason: refusal};}
  return {ok: true, code: 'ok', done};
}

/** Ripe crops a wanderer can reach, as World.target() candidates. */
export function cropTargets(world, p){
  const cells = world.tiles?.cells;
  if(!cells) return [];
  const out = [];
  for(const [key, tile] of Object.entries(cells)){
    if(!ripe(tile)) continue;
    const [i, j] = key.split(',').map(Number), {x, z} = centerOf(i, j);
    if(Math.hypot(x - p.x, z - p.z) >= RULES.reach) continue;
    out.push({kind: 'crop', entity: {id: `crop:${key}`, i, j, x, z, type: `crop-${tile.crop}`, crop: tile.crop}, label: `Harvest ${CROPS[tile.crop].name.toLowerCase()}`});
  }
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
