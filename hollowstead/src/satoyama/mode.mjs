// Satoyama: a farm to build and tend, and the wilds to fight in, kept apart (World option `satoyama`).
//
// Two places, one at a time for the whole party, like a delve (delve.mjs): while the party is out in the wilds
// the farm waits in `world.satoyama.farm` (its buildings, soil, loose drops, animals and what was cleared), and
// comes back as it was. Time keeps running for it: on the way home its crops catch up on the growing they
// missed, and its animals have every morning they missed (animals.mjs).
//   The farm   no waves, no hunters, nothing rises. Clear it, build on the grid, sow, raise animals.
//   The wilds  the dead walk there by day and more of them at night, each place its own (ROSTERS). What only the
//              wilds give: bamboo, iron sand, spring salt, and what the dead drop.
// Classes only (classes/mode.mjs): a wanderer chooses a class, never finds weapons, books or gear in loot.
// The torii at the farm's north edge leads out; the torii at the crossing leads home (NODES farmgate / homegate,
// landmark 'travel'). A party that falls in the wilds wakes on the farm.
//
// world.satoyama  {place:'farm'|'wilds', farm, day, morning, visits, spawnT}  (saved; guests get it without `farm`)
// Pure simulation: never engine.mjs, a renderer or the DOM.

import {NODES, dayOf, phaseAt, phaseOf, scheduleOf} from '../content.mjs?v=harvest-18';
import {eliteChance, enemyScale, maxHealth, pickWeighted} from '../progression.mjs?v=harvest-18';
import {isMagicAlly} from '../magic/registry.mjs?v=harvest-18';
import {growthRate} from '../homestead.mjs?v=harvest-18';
import {PLACES, ZONES, placeNodes, placeShape, placeZone} from './land.mjs?v=harvest-18';
import {animalsOf, morning, stepAnimals} from './animals.mjs?v=harvest-18';

export const SATOYAMA = Object.freeze({
  gather: 7,          // everyone standing must be this close to a torii to travel
  wipe: 4,            // seconds of a fallen party before it wakes on the farm
  charmWait: 14,      // ...or this long while someone still has a last-chance charm to spend
  safe: 11,           // nothing rises this close to the torii home
  every: Object.freeze([5, 8]), nightEvery: Object.freeze([3, 5]),
  near: 26,           // creatures counted against a place's cap round each wanderer
  spawn: Object.freeze([13, 19]),
  despawn: 44, leash: 15,
});
/** Who walks each place of the wilds (the crossing only after dark). */
export const ROSTERS = Object.freeze({
  sugimori: Object.freeze([['chochin', 1]]),
  chikurin: Object.freeze([['kasa', 3], ['chochin', 2]]),
  higan: Object.freeze([['jiangshi', 2], ['rokurokubi', 2], ['chochin', 1]]),
  onsen: Object.freeze([['yukionna', 2], ['daoshi', 1], ['kasa', 2]]),
});
/** How many may be about one wanderer at once, by day. Night brings half as many again. */
export const CAPS = Object.freeze({sugimori: 2, chikurin: 4, higan: 5, onsen: 6});
/** What a new wanderer brings to the farm: seeds of every day crop and a little food. */
export const START_KIT = Object.freeze({daikonseed: 6, soyseed: 4, seed: 4, rootseed: 4, wheatseed: 4, berry: 3});

export const isSatoyama = world => !!world?.satoyama;
export const placeOf = world => world?.satoyama?.place || null;
export const inWilds = world => placeOf(world) === 'wilds';

/** A new Satoyama world (World option `satoyama`): classed, on the farm, its clutter in place. */
export function setupSatoyama(world){
  world.satoyama = {place: 'farm', farm: null, day: 1, morning: 1, visits: 0, spawnT: 0};
  world.classed = true;
  world.nodes = placeNodes(world.seed, 'farm');
  world.tiles = {rev: 0, cells: {}};
  world.animals = [];
  world.radius = PLACES.farm.extent;
  // The first morning is already up: no fade in from a night that never was.
  world.time = 8;
}

/** Where wanderer number `i` stands when they arrive in the current place. */
export function arrival(world, i = 0){
  const s = placeShape(world.seed, placeOf(world) || 'farm'), a = i * 1.9 + .6;
  const x = s.spawn.x + Math.cos(a) * (i ? 1.2 : 0), z = s.spawn.z + Math.sin(a) * (i ? .9 : 0);
  return world.landNear(x, z, 4) || {x: s.spawn.x, z: s.spawn.z};
}

/** A wanderer joins a Satoyama world for the first time: their seeds, and a place to stand. */
export function welcome(world, p, index){
  const at = arrival(world, index);p.x = at.x;p.z = at.z;
  if(p.satoyamaKit) return;
  p.satoyamaKit = true;
  for(const [itemId, n] of Object.entries(START_KIT)) world.give(p, itemId, n);
}

/** How hard the dead hit: by the place's tier, the party's level and the dark. */
export function satoyamaScale(world, tier = 1){
  const party = world.players.filter(p => p.online), level = party.length ? party.reduce((n, p) => n + (p.level || 1), 0) / party.length : 1;
  const night = phaseOf(world) === 'night', day = 1 + tier * 2.2 + (level - 1) * .45 + (night ? 1.5 : 0);
  return {scale: enemyScale(day), level: Math.round(day), elite: eliteChance(day, tier), boss: 1};
}

// ------------------------------------------------------------------ travel
/** Someone held the action at a torii (areas.mjs useLandmark): the party travels if it is gathered. */
export function travelGate(world, node, p){
  if(!isSatoyama(world)) return;
  const standing = world.players.filter(q => q.online && !q.down && !q.ghost);
  const near = standing.filter(q => Math.hypot(q.x - node.x, q.z - node.z) < SATOYAMA.gather);
  if(near.length < standing.length){world.tell(p, `Gather everyone at the torii first · ${near.length}/${standing.length}`);return;}
  travel(world, placeOf(world) === 'farm' ? 'wilds' : 'farm');
}

/** Move the whole party to `to` ('farm' or 'wilds'). */
export function travel(world, to){
  const s = world.satoyama;
  if(!s || s.place === to || !PLACES[to]) return false;
  world.chestSessions?.clear?.();world.harvestWork?.clear?.();world.dismantleHolds?.clear?.();
  for(const b of world.buildings) if(b.towedBy) b.towedBy = null;
  const allies = world.enemies.filter(e => isMagicAlly(e));
  if(to === 'wilds'){
    s.farm = {
      buildings: world.buildings, drops: world.drops, tiles: world.tiles, animals: animalsOf(world), gridRev: world.gridRev || 0,
      nodeChanges: world.nodes.filter(n => n.ready || n.hits !== NODES[n.type]?.hits).map(n => ({id: n.id, hits: n.hits, ready: n.ready})),
      leftAt: world.time,
    };
    world.buildings = [];world.drops = [];world.tiles = null;world.animals = [];
    world.nodes = placeNodes(world.seed, 'wilds');
    s.visits = (s.visits || 0) + 1;
  }else{
    const f = s.farm || {};
    world.buildings = f.buildings || [];world.drops = f.drops || [];world.tiles = f.tiles || {rev: 0, cells: {}};world.animals = f.animals || [];world.gridRev = (f.gridRev || 0) + 1;
    world.nodes = placeNodes(world.seed, 'farm');
    for(const change of f.nodeChanges || []){const n = world.nodes.find(q => q.id === change.id);if(n){n.hits = change.hits;n.ready = change.ready;}}
    growAway(world, f.leftAt ?? world.time, world.time);
    s.farm = null;
  }
  s.place = to;s.spawnT = 2;
  world.enemies = allies;world.hostile = [];world.projectiles = [];world.zones = [];
  world.radius = PLACES[to].extent;
  world.floorMemo = null;world.flowFields?.clear?.();
  world.players.forEach((p, i) => {const at = arrival(world, i);p.x = at.x;p.z = at.z;p.goal = null;p.vx = p.vz = 0;p.gvx = p.gvz = 0;p.rest = false;p.sleep = null;});
  world.event('travel', 0, 0, '', {to});
  world.event('announce', 0, 0, to === 'wilds' ? 'Through the torii and into the wilds. The dead walk here.' : 'Home through the torii. The farm is as you left it.');
  return true;
}

/** Crops keep growing while the party is away: the growing they missed, a few seconds at a time. */
export function growAway(world, from, to){
  const cells = world.tiles?.cells;if(!cells || !(to > from)) return;
  const tiles = Object.values(cells).filter(t => t.crop && t.growth < 100);if(!tiles.length) return;
  const sched = scheduleOf(world), step = 5;
  for(let t = from; t < to; t += step){
    const span = Math.min(step, to - t), phase = phaseAt(t + span / 2, sched);
    for(const tile of tiles) if(tile.growth < 100) tile.growth = Math.min(100, tile.growth + growthRate(world, tile, phase) * span);
  }
}

/** A fallen party wakes on the farm, a little worse for it. */
export function wakeHome(world){
  if(placeOf(world) !== 'farm') travel(world, 'farm');
  world.players.forEach((p, i) => {
    if(!p.online) return;
    const at = arrival(world, i);p.x = at.x;p.z = at.z;
    p.down = 0;p.ghost = false;p.revive = 0;p.hp = Math.round(maxHealth(p) / 2);p.hunger = Math.max(30, p.hunger || 0);
  });
  world.event('announce', 0, 0, 'You wake on the farm, aching. The wilds let you go this time.');
}

// ------------------------------------------------------------------ every tick
/** Host, every Satoyama tick (instead of the night, the omens and the roamers of an expedition). */
export function stepSatoyama(world, dt, before, phase, obstacles){
  const s = world.satoyama;if(!s) return;
  s.day = dayOf(world);
  for(const p of world.players){
    if(!p.online) continue;
    p.courage = 100;
    if(before !== phase && phase === 'day' && !(p.charm > 0)) p.charm = 1;
  }
  if(s.place === 'farm'){
    // Every morning the animals had (here or while away), once each.
    if(phase === 'day' && s.morning < s.day){for(let d = s.morning + 1; d <= s.day; d++)morning(world, d);s.morning = s.day;}
    stepAnimals(world, dt, obstacles, phase);
    return;
  }
  stepWilds(world, dt, phase);
}

function stepWilds(world, dt, phase){
  const s = world.satoyama, shape = placeShape(world.seed, 'wilds'), night = phase === 'night', rng = world.spawnRng;
  const people = world.players.filter(p => p.online && !p.down && !p.ghost);
  world.enemies = world.enemies.filter(e => isMagicAlly(e) || !e.roamer || people.some(p => Math.hypot(p.x - e.x, p.z - e.z) < SATOYAMA.despawn));
  s.spawnT = (s.spawnT || 0) - dt;
  if(s.spawnT > 0) return;
  const [lo, hi] = night ? SATOYAMA.nightEvery : SATOYAMA.every;s.spawnT = lo + rng() * (hi - lo);
  const gate = shape.gate;
  for(const p of people){
    const zone = placeZone(world.seed, 'wilds', p.x, p.z);
    if(zone === 'sugimori' && !night) continue;
    if(Math.hypot(p.x - gate.x, p.z - gate.z) < SATOYAMA.safe) continue;
    const roster = ROSTERS[zone];if(!roster) continue;
    const near = world.enemies.filter(e => !isMagicAlly(e) && Math.hypot(e.x - p.x, e.z - p.z) < SATOYAMA.near).length;
    if(near >= Math.round(CAPS[zone] * (night ? 1.5 : 1))) continue;
    for(let t = 0; t < 8; t++){
      const a = rng() * Math.PI * 2, r = SATOYAMA.spawn[0] + rng() * (SATOYAMA.spawn[1] - SATOYAMA.spawn[0]), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if(!world.walkable(x, z) || Math.hypot(x - gate.x, z - gate.z) < SATOYAMA.safe) continue;
      const there = placeZone(world.seed, 'wilds', x, z);
      if(there !== zone && !(night && there === 'sugimori')) continue;
      if(people.some(q => Math.hypot(q.x - x, q.z - z) < SATOYAMA.spawn[0] - 2)) continue;
      const tier = ZONES[zone].tier, n = 1 + Math.floor(rng() * Math.min(3, tier + 1));
      for(let k = 0; k < n; k++){
        const b = rng() * Math.PI * 2, d = k ? .8 + rng() * 1.2 : 0;
        world.spawnEnemy(pickWeighted(rng, roster), x + Math.cos(b) * d, z + Math.sin(b) * d, {home: true, roamer: true, tier, leash: SATOYAMA.leash});
      }
      break;
    }
  }
}

/** The phase line the clock announces (World.tick), in Satoyama's words. */
export function phaseLine(world, phase){
  if(phase === 'day') return 'Morning. The animals are up.';
  if(phase === 'dusk') return inWilds(world) ? 'Dusk. More of the dead will walk tonight.' : 'Dusk settles over the farm.';
  return inWilds(world) ? 'Night in the wilds. Stay close to the torii home.' : 'Night. The farm sleeps; nothing comes here.';
}

/** Guests never need the farm's stash. */
export function satoyamaForNetwork(world){
  const s = world.satoyama;if(!s) return undefined;
  const {farm, ...rest} = s;return rest;
}
