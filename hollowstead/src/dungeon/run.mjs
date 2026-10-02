// Dungeons: a crawl through freshly carved floors. Explore chambers, fight what lives in them, open
// their caches, slay the Warden to unseal the stairs, and go deeper. Every floor is new (layout.mjs,
// variants.mjs). Levels, loot, weapon mastery and refinement carry you; the floors get harder.
//
// The World owns the simulation; this module owns the floor rules. The run is plain data on
// `world.dungeon` (small, so it rides in every snapshot):
//   run, depth, seed, variant   which floor (the layout is rebuilt from these three on every peer)
//   forced                      a variation pinned for the whole run, or null
//   phase                       'explore' until the Warden falls, then 'open' (the stairs are open)
//   rooms[]                     per chamber: 0 asleep, 1 awake (its residents are out), 2 cleared
//   waves[]                     per chamber: ambush waves (or the Warden) still to come
//   seen[]                      chambers someone has stood in (the map)
//   portal                      0..1 how far the gathered party is through the descent
//   shrine, shrineT, blessing   the floor's shrine: used?, channel progress, what it gave
//   luck                        extra loot luck this floor (the Fortune shrine)
//   best, stats                 deepest floor reached; floors, chambers and caches this run
//   wear                        false: weapons do not wear down (a standalone run has no Heartfire)
//
// Built to live inside an expedition later: nothing here assumes the whole World is a dungeon except
// setupDungeon (which clears the map) and the entry and exit points (enterFloor, nextFloor).
import {ENEMIES} from '../content.mjs?v=harvest-18';
import {ELITE, enemyScale, enemyXp, maxHealth, pickWeighted} from '../progression.mjs?v=harvest-18';
import {isMagicAlly} from '../magic/registry.mjs?v=harvest-18';
import {mixSeed, random} from './grid.mjs?v=harvest-18';
import {buildFloor, floorSpec, roomAtPoint, walkableAt, walkableNear} from './layout.mjs?v=harvest-18';
import {isVariant, variantOf} from './variants.mjs?v=harvest-18';

export const DUNGEON = Object.freeze({
  wake: 11,           // a chamber's residents appear when a wanderer comes this close to its edge
  leash: 7,           // how far past its chamber a resident will follow
  sight: 13,          // a resting resident notices a wanderer it can see this close
  portalRadius: 2.6,  // stand this close to the stairs to join the descent
  descend: 2.2,       // seconds the whole party stands at the stairs before going down
  shrineRadius: 2.4,
  shrineHold: 1.4,
  campRadius: 4.5,    // the camp fire mends wanderers near it
  campHeal: 7,        // health per second at the camp fire
  maxAlive: 48,       // creatures out at once (phones)
  roomXp: 8,          // per depth, to wanderers in a chamber when it is cleared
  floorXp: 40,        // per depth, to everyone when the party goes down
  fury: 1.25,         // the Fury shrine's damage bonus, until the next stairs
  luckPerDepth: .1, maxLuck: 1.2, fortune: .8,
  wardenHp: 1.6,      // the Warden is an elder with this much more health again
  kingEvery: 5,       // the Hollow King guards every fifth floor
  playerLight: 6.2,   // every wanderer carries a little light down here
});
export const BLESSINGS = Object.freeze({
  mending: {name: 'Shrine of Mending', text: 'Every wanderer is mended, and the fallen rise'},
  fury: {name: 'Shrine of Fury', text: 'Your blows land harder until the next stairs'},
  fortune: {name: 'Shrine of Fortune', text: 'Richer finds on this floor'},
});
/** What a new wanderer brings down (standalone runs). */
export const KIT = Object.freeze({worn: ['spear', 'armor'], pack: [['recurve', 1], ['bandage', 2], ['elixir', 1]]});

/** The floor layout for the current state (cached in layout.mjs). */
export function layoutOf(world){
  const d = world?.dungeon; if(!d) return null;
  // Walkers ask thousands of times a tick: remember the floor on the world (never in a snapshot).
  const memo = world.floorMemo;
  if(memo && memo.seed === d.seed && memo.depth === d.depth && memo.variant === d.variant && memo.x === (d.x || 0) && memo.z === (d.z || 0)) return memo.floor;
  const floor = buildFloor({seed: d.seed, variant: d.variant, depth: d.depth, x: d.x || 0, z: d.z || 0});
  Object.defineProperty(world, 'floorMemo', {value: {seed: d.seed, depth: d.depth, variant: d.variant, x: d.x || 0, z: d.z || 0, floor}, writable: true, configurable: true, enumerable: false});
  return floor;
}
/** Loot caches as world nodes. Ids follow the layout order, so snapshots only carry what was opened. */
export function dungeonNodes(world){
  const L = layoutOf(world); if(!L) return [];
  return L.caches.map((c, i) => ({id: `n${i}`, type: c.type, x: c.x, z: c.z, hits: 1, ready: 0}));
}
/** Creature strength by depth (and a chamber's tier). */
export function dungeonScale(world, tier = 0){
  // A delve (delve.mjs) starts from the threat the party brought down; a standalone run from nothing.
  const d = world?.dungeon, depth = Math.max(1, d?.depth || 1), base = d?.base > 0 ? d.base + (depth - 1)*1.25 : 1 + (depth - 1)*1.6, step = base + tier*2, scale = enemyScale(step);
  if(d?.base > 0) return {scale, level: Math.round(step), elite: Math.min(.3, .02*step + tier*.05), boss: 1 + .25*Math.floor(step/6)};
  // The first two floors bite a little softer while the party finds its feet.
  if(depth < 3) scale.damage *= depth === 1 ? .8 : .9;
  return {scale, level: Math.round(step), elite: Math.min(.3, .025*(depth - 1) + tier*.05), boss: 1 + .3*Math.floor((depth - 1)/DUNGEON.kingEvery)};
}
/** Extra loot luck: deeper floors (and the Fortune shrine) find better things. */
export function dungeonLuck(world){
  const d = world?.dungeon; if(!d) return 0;
  return Math.min(DUNGEON.maxLuck, (d.depth - 1)*DUNGEON.luckPerDepth) + (d.luck || 0);
}

/**
 * Turns a fresh World into a dungeon run.
 *   runSeed   picks every floor            variant  pins one variation for the whole run
 *   depth     the first floor (an event might open a door straight onto the third)
 *   floors    how many floors before the way out (0: endless, the standalone mode)
 *   kit       true: every wanderer arrives with the starting kit; false: they bring their own gear
 *   wear      true: weapons wear down as on an expedition
 *   at {x,z}  where the floors lie in the world (the origin for a standalone run)
 */
export function setupDungeon(world, {runSeed = world.seed, depth = 1, variant = null, wear = false, kit = true, floors = 0, at = null} = {}){
  world.ambient = false; world.nodes = []; world.buildings = [];
  const spec = floorSpec(runSeed >>> 0, Math.max(1, depth|0), null, variant);
  world.dungeon = {v: 1, run: runSeed >>> 0, depth: spec.depth, seed: spec.seed, variant: spec.variant, forced: isVariant(variant) ? variant : null,
    x: Number.isFinite(at?.x) ? at.x : 0, z: Number.isFinite(at?.z) ? at.z : 0, first: spec.depth, floors: Math.max(0, floors|0), kit: kit !== false,
    phase: 'explore', rooms: [], waves: [], seen: [], portal: 0, ready: 0, shrine: 0, shrineT: 0, blessing: '', luck: 0, wear: !!wear,
    best: spec.depth, stats: {floors: 0, rooms: 0, caches: 0}, explore: 0};
  enterFloor(world);
  return world.dungeon;
}

/** Everything a new floor needs: its caches, its camp, clean ground, and the party at the fire. */
export function enterFloor(world){
  const d = world.dungeon, L = layoutOf(world);
  world.radius = Math.ceil(Math.hypot(Math.abs(L.ox) + L.w, Math.abs(L.oz) + L.h)) + 4;
  world.nodes = dungeonNodes(world);
  world.enemies = world.enemies.filter(e => isMagicAlly(e));
  world.drops = []; world.projectiles = []; world.hostile = []; world.zones = []; world.allies = []; world.explored = [];
  const fire = world.structure('fire', L.camp.fire.x, L.camp.fire.z), bench = world.structure('bench', L.camp.bench.x, L.camp.bench.z);
  for(const b of [fire, bench]){b.fixed = true; b.maxHp = b.hp = 9999;}
  fire.fuel = 330;
  world.buildings = [fire, bench];
  d.phase = 'explore'; d.portal = 0; d.shrine = 0; d.shrineT = 0; d.blessing = ''; d.luck = 0;
  d.rooms = L.rooms.map(r => r.kind === 'start' ? 2 : 0);
  d.waves = L.rooms.map(r => r.kind === 'ambush' ? 2 : r.kind === 'warden' ? 1 : 0);
  d.seen = [L.start];
  d.best = Math.max(d.best || 1, d.depth);
  let n = 0;
  for(const p of world.players){
    const spot = L.camp.spawn[n++ % L.camp.spawn.length];
    p.x = spot.x; p.z = spot.z; p.goal = null; p.rest = false; p.boon = 1;
    if(p.down || p.ghost){p.down = 0; p.ghost = false; p.revive = 0;}
    p.hp = maxHealth(p); p.hunger = 100; p.courage = 100;
  }
  for(const e of world.enemies){const spot = L.camp.spawn[n++ % L.camp.spawn.length]; e.x = spot.x; e.z = spot.z;}
  world.flowFields?.clear?.();
}

/** Down the stairs: experience for the floor, then a new floor one deeper (or, on the last one, the way out). */
export function nextFloor(world){
  const d = world.dungeon;
  for(const p of world.players) if(p.online) world.awardXp(p, DUNGEON.floorXp*d.depth);
  d.stats.floors++;
  if(d.floors && d.depth - d.first + 1 >= d.floors){
    // A bounded dungeon (an expedition's door): its last stairs lead out. Whoever owns the run takes it from here.
    d.phase = 'complete'; d.portal = 0;
    world.event('announce', 0, 0, 'The deep is conquered');
    world.event('dungeonComplete', 0, 0, '', {depth: d.depth});
    return;
  }
  const spec = floorSpec(d.run, d.depth + 1, d.variant, d.forced);
  d.depth = spec.depth; d.seed = spec.seed; d.variant = spec.variant;
  enterFloor(world);
  const v = variantOf(d.variant);
  world.event('announce', 0, 0, `Floor ${d.depth} · ${v.name}`);
  world.event('descend', 0, 0, '', {depth: d.depth});
}

/** A wanderer joining a run (a new run, or a friend arriving mid-floor): the kit (when the run hands one out), and a place by the party. */
export function joinDungeon(world, p){
  if(world.dungeon.kit !== false){
    world.clearPack(p);
    for(const slot of Object.keys(p.equipment)) p.equipment[slot] = null;
    p.equipmentRevision++;
    for(const itemId of KIT.worn) world.grantEquipped(p, itemId);
    for(const [itemId, count] of KIT.pack) world.give(p, itemId, count);
    p.charm = 1;
  }
  p.hp = maxHealth(p); p.hunger = 100; p.courage = 100; p.stamina = 100; p.boon = 1;
  const L = layoutOf(world), friend = world.players.find(q => q !== p && q.online && !q.down && !q.ghost);
  const near = friend ? walkableNear(L, friend.x + 1.2, friend.z + .6, 3) : null;
  const spot = near || L.camp.spawn[(world.players.length - 1) % L.camp.spawn.length];
  p.x = spot.x; p.z = spot.z;
  world.syncHotbar(p);
}

// ------------------------------------------------------------------ the floor, every tick
const hostiles = world => world.enemies.filter(e => e.hp > 0 && !isMagicAlly(e));
const standing = world => world.players.filter(p => p.online && !p.down && !p.ghost);
function roomBox(L, room){return {x0: L.ox + room.x0, z0: L.oz + room.z0, x1: L.ox + room.x1 + 1, z1: L.oz + room.z1 + 1};}
function gapTo(box, p){return Math.hypot(Math.max(box.x0 - p.x, 0, p.x - box.x1), Math.max(box.z0 - p.z, 0, p.z - box.z1));}
/** A random open spot in a chamber, away from wanderers when it can be. */
function spotIn(world, L, room, away = 0){
  const rng = world.spawnRng, people = standing(world);
  let best = null, bestGap = -1;
  for(let tries = 0; tries < 24; tries++){
    const k = room.cells[Math.floor(rng()*room.cells.length)], i = k % L.w, j = (k - i)/L.w;
    const x = L.ox + i + .3 + rng()*.4, z = L.oz + j + .3 + rng()*.4;
    if(!walkableAt(L, x, z)) continue;
    const gap = Math.min(99, ...people.map(p => Math.hypot(p.x - x, p.z - z)));
    if(gap >= away) return {x, z};
    if(gap > bestGap){bestGap = gap; best = {x, z};}
  }
  return best || {x: room.x, z: room.z};
}
function people(world){return Math.max(1, world.players.filter(p => p.online).length);}
/** Pick a creature from the variation's roster, keeping the heaviest ones rare near the top. */
function rollType(world, roster, heavyLeft){
  for(let tries = 0; tries < 6; tries++){
    const type = pickWeighted(world.spawnRng, roster);
    if(!['brute', 'golem'].includes(type) || heavyLeft.n-- > 0) return type;
  }
  return roster[0][0];
}
function spawnIn(world, room, type, at, options){
  const e = world.spawnEnemy(type, at.x, at.z, options);
  if(e) e.room = room.id;
  return e;
}
/** A chamber's residents come out: they stand guard in it, and chase a little way past its door. */
function wakeRoom(world, L, room){
  const d = world.dungeon, v = variantOf(d.variant), depth = d.depth, humans = people(world);
  d.rooms[room.id] = 1;
  if(room.kind === 'ambush' || room.kind === 'warden' || room.kind === 'start') return;
  let count = Math.round((1 + room.area/45)*(1 + .08*(depth - 1))*(1 + .3*(humans - 1)));
  if(room.kind === 'treasure') count = 2 + Math.floor(depth/2) + (humans - 1);
  if(room.kind === 'shrine') count = Math.ceil(count*.6);
  count = Math.max(room.area < 30 ? 1 : 2, Math.min(room.area < 30 ? 3 : 10, count));
  const heavy = {n: depth >= 5 ? 2 : 1}, roster = v.roster(depth), tier = room.kind === 'treasure' ? 1 : 0;
  const leash = room.r + DUNGEON.leash;
  for(let n = 0; n < count && hostiles(world).length < DUNGEON.maxAlive; n++){
    const at = spotIn(world, L, room, 5);
    spawnIn(world, room, rollType(world, roster, heavy), at, {home: true, leash, tier, elite: room.kind === 'treasure' && n === 0 ? true : undefined});
  }
}
/** An ambush: creatures pour out of rifts in the chamber around the party. */
function ambushWave(world, L, room){
  const d = world.dungeon, v = variantOf(d.variant), depth = d.depth, humans = people(world);
  const count = Math.min(14, 3 + Math.ceil(depth*.8) + (humans - 1)*2), roster = v.roster(depth), heavy = {n: depth >= 4 ? 1 : 0};
  const packs = Math.max(2, Math.ceil(count/4));
  for(let pack = 0, made = 0; pack < packs; pack++){
    const at = spotIn(world, L, room, 4.5);
    world.event('portal', at.x, at.z, '', {radius: 1.6});
    for(let k = 0; k < Math.ceil(count/packs) && made < count; k++, made++){
      const b = world.spawnRng()*Math.PI*2, r = k ? .6 + world.spawnRng()*1.1 : 0;
      const spot = walkableNear(L, at.x + Math.cos(b)*r, at.z + Math.sin(b)*r, 2) || at;
      const e = spawnIn(world, room, rollType(world, roster, heavy), spot, {});
      if(e) e.hunt = true;
    }
  }
  d.waves[room.id]--;
}
/** The Warden and its escort rise by the stairs. Every fifth floor it is the Hollow King himself. */
function wakeWarden(world, L, room){
  const d = world.dungeon, v = variantOf(d.variant), depth = d.depth, humans = people(world);
  // A delve's last floor is guarded by its finale (bosses.mjs) instead of a Warden.
  const finale = d.finale && d.floors && depth - d.first + 1 >= d.floors ? d.finale : null;
  const king = !finale && depth % DUNGEON.kingEvery === 0, type = finale || (king ? 'king' : v.warden(depth));
  const at = walkableNear(L, room.x, room.z - 2.2, 3) || {x: room.x, z: room.z};
  world.event('portal', at.x, at.z, '', {radius: 2.6});
  // An elder from the third floor down; before that, a plain one with a Warden's stamina.
  const warden = spawnIn(world, room, type, at, {home: true, leash: room.r + 12, tier: depth >= 3 ? 1 : 0, elite: !king && depth >= 3});
  if(warden){
    warden.warden = true; warden.aggro = true;
    if(finale){warden.boss = true; warden.home = {x: room.x, z: room.z}; warden.leash = room.r + 6;}
    warden.hp = warden.maxHp = Math.round(warden.maxHp*(king || finale ? 1 : DUNGEON.wardenHp));
    // The first Wardens hit a little softer: the party is still finding its feet.
    if(depth < 3) warden.power = +(warden.power*.75).toFixed(3);
  }
  const escort = [...v.escort(depth)];
  for(let n = 0; n < Math.min(escort.length - (depth < 2 ? 1 : 0) + Math.floor(depth/3), 6) + (humans - 1); n++){
    const spot = spotIn(world, L, room, 3.5);
    spawnIn(world, room, escort[n % escort.length], spot, {home: true, leash: room.r + 10, tier: 1});
  }
  d.waves[room.id] = 0;
  if(finale) world.event('bossrise', at.x, at.z, '', {boss: finale});
  world.event('announce', at.x, at.z, finale ? `${ENEMIES[type]?.name || 'Something'} opens its eye.` : king ? 'The Hollow King waits by the stairs' : `The ${ENEMIES[type]?.name || 'Warden'} Warden rises`);
}

function reviveAll(world){
  const friend = standing(world)[0];
  for(const p of world.players){
    if(!p.online || !(p.down || p.ghost)) continue;
    world.revivePlayer(p);
    if(friend){const L = layoutOf(world), spot = walkableNear(L, friend.x + .9, friend.z + .9, 3); if(spot){p.x = spot.x; p.z = spot.z;}}
  }
}

/** Host, every tick of a dungeon floor. */
export function stepDungeon(world, dt){
  const d = world.dungeon, L = layoutOf(world); if(!d || !L || d.phase === 'complete') return;
  const everyone = world.players.filter(p => p.online), alive = standing(world);
  for(const p of everyone){p.hunger = 100; p.courage = 100;}
  for(const b of world.buildings) if(b.fixed){b.hp = b.maxHp; if(b.type === 'fire') b.fuel = 330;}
  const foes = hostiles(world), inRoom = new Map();
  for(const e of foes) if(Number.isInteger(e.room)) inRoom.set(e.room, (inRoom.get(e.room) || 0) + 1);

  // Chambers wake as the party nears them, and notice who walks in.
  const where = new Map();
  for(const p of alive){const r = roomAtPoint(L, p.x, p.z); where.set(p.id, r); if(r >= 0 && !d.seen.includes(r)) d.seen.push(r);}
  L.rooms.forEach((room, id) => {
    if(d.rooms[id] === 0 && foes.length < DUNGEON.maxAlive){
      const box = roomBox(L, room);
      // Newly woken: its residents are counted from the next tick.
      if(alive.some(p => gapTo(box, p) < DUNGEON.wake)){wakeRoom(world, L, room); return;}
    }
    if(d.rooms[id] !== 1) return;
    const inside = alive.some(p => where.get(p.id) === id);
    if(d.waves[id] > 0 && inside && !inRoom.get(id)){
      if(room.kind === 'warden') wakeWarden(world, L, room);
      else{if(d.waves[id] === 2) world.event('announce', room.x, room.z, 'Ambush!'); ambushWave(world, L, room);}
      return;
    }
    if(d.waves[id] === 0 && !inRoom.get(id) && (room.kind !== 'warden' || d.phase === 'open')){
      d.rooms[id] = 2; d.stats.rooms++;
      const reward = DUNGEON.roomXp*d.depth;
      for(const p of alive) if(where.get(p.id) === id || Math.hypot(p.x - room.x, p.z - room.z) < room.r + 6) world.awardXp(p, reward);
      if(room.kind !== 'warden') world.event('discover', room.x, room.z, 'Chamber cleared');
    }
  });

  // The camp fire mends anyone resting by it.
  const fire = world.buildings.find(b => b.fixed && b.type === 'fire');
  if(fire) for(const p of alive){
    if(Math.hypot(p.x - fire.x, p.z - fire.z) < DUNGEON.campRadius && p.hp < maxHealth(p)) p.hp = Math.min(maxHealth(p), p.hp + DUNGEON.campHeal*dt);
  }

  // The shrine: stand by it a moment and it answers the whole party, once a floor.
  if(L.shrine && !d.shrine){
    const near = alive.some(p => Math.hypot(p.x - L.shrine.x, p.z - L.shrine.z) < DUNGEON.shrineRadius);
    d.shrineT = near ? d.shrineT + dt/DUNGEON.shrineHold : Math.max(0, d.shrineT - dt);
    if(d.shrineT >= 1) bless(world, L);
  }

  // The stairs: once the Warden falls, everyone standing gathers there and the party goes down.
  if(d.phase === 'open'){
    const ready = alive.filter(p => Math.hypot(p.x - L.portal.x, p.z - L.portal.z) < DUNGEON.portalRadius).length;
    d.ready = ready;
    d.portal = alive.length && ready === alive.length ? d.portal + dt/DUNGEON.descend : Math.max(0, d.portal - dt*1.5);
    if(d.portal >= 1){nextFloor(world); return;}
  }

  // The map: what the party has walked near (4-unit cells on the World's explored grid).
  d.explore = (d.explore || 0) - dt;
  if(d.explore <= 0){
    d.explore = .5;
    const seen = new Set(world.explored), N = EXPLORE_N, C = 4, R = N*C/2;
    for(const p of alive){const gx = Math.floor((p.x + R)/C), gz = Math.floor((p.z + R)/C); for(let x = gx - 2; x <= gx + 2; x++) for(let z = gz - 2; z <= gz + 2; z++) if(x >= 0 && z >= 0 && x < N && z < N) seen.add(z*N + x);}
    world.explored = [...seen];
  }
}
/** The World's explored grid (engine.mjs EXPLORE_SIZE): 4-unit cells over the hollow's disc. */
export const EXPLORE_N = Math.ceil(148*2/4);

function bless(world, L){
  const d = world.dungeon, rng = random(mixSeed(d.seed, 'shrine'));
  const kinds = Object.keys(BLESSINGS), hurt = world.players.some(p => p.online && (p.down || p.ghost || p.hp < maxHealth(p)*.5));
  const kind = hurt && rng() < .6 ? 'mending' : kinds[Math.floor(rng()*kinds.length)];
  d.shrine = 1; d.shrineT = 1; d.blessing = kind;
  if(kind === 'mending'){reviveAll(world); for(const p of world.players) if(p.online && !p.ghost) p.hp = maxHealth(p);}
  if(kind === 'fury') for(const p of world.players) p.boon = DUNGEON.fury;
  if(kind === 'fortune') d.luck = DUNGEON.fortune;
  world.event('announce', L.shrine.x, L.shrine.z, `${BLESSINGS[kind].name} · ${BLESSINGS[kind].text}`);
  world.event('levelup', L.shrine.x, L.shrine.z, BLESSINGS[kind].name);
}

/** Called for every creature that dies on a dungeon floor. */
export function dungeonKill(world, e){
  const d = world.dungeon; if(!d || isMagicAlly(e)) return;
  if(e.warden){
    d.phase = 'open';
    const L = layoutOf(world);
    reviveAll(world);
    world.event('announce', L.portal.x, L.portal.z, 'The Warden falls. The stairs down are open');
    world.event('portal', L.portal.x, L.portal.z, '', {radius: DUNGEON.portalRadius});
  }
}
/** Experience for a kill down here is the expedition's, plus a little per depth. */
export const dungeonXp = (world, e) => enemyXp(e.type)*(e.elite ? ELITE.xp : 1)*(1 + .08*((e.level || 1) - 1));

/**
 * What the HUD shows for this floor: {depth, name, short, objective, cleared, total, phase,
 * ready, party, portal, shrine}. Pure; reads the snapshot only.
 */
export function dungeonStatus(world){
  const d = world?.dungeon, L = layoutOf(world); if(!d || !L) return null;
  const v = variantOf(d.variant), total = L.rooms.filter(r => r.kind !== 'start').length;
  const cleared = L.rooms.filter((r, i) => r.kind !== 'start' && d.rooms[i] === 2).length;
  const party = world.players.filter(p => p.online && !p.down && !p.ghost).length;
  const warden = world.enemies.find(e => e.warden && e.hp > 0);
  const finale = d.finale && d.floors && d.depth - d.first + 1 >= d.floors;
  const king = !finale && d.depth % DUNGEON.kingEvery === 0;
  let objective = finale ? 'Find what waits at the bottom' : king ? 'Find the Hollow King' : 'Find the Warden';
  if(warden) objective = finale ? `Slay ${ENEMIES[warden.type]?.name || 'it'}` : king ? 'Slay the Hollow King' : `Slay the ${ENEMIES[warden.type]?.name || ''} Warden`;
  if(d.phase === 'open') objective = finale ? (party > 1 ? `Climb out together · ${d.ready || 0}/${party}` : 'Take the stairs back up') : party > 1 ? `Gather at the stairs · ${d.ready || 0}/${party}` : 'Take the stairs down';
  if(d.phase === 'complete') objective = 'The deep is conquered';
  return {depth: d.depth, name: v.name, short: v.short, objective, cleared, total, phase: d.phase, ready: d.ready || 0, party, portal: d.portal || 0,
    shrine: L.shrine ? {x: L.shrine.x, z: L.shrine.z, used: !!d.shrine, charge: d.shrineT || 0, blessing: d.blessing} : null, warden: warden || null, best: d.best, stats: d.stats};
}
