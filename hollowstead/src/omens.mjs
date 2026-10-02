// Omens: things that turn up somewhere in the hollow for a while, announced with a direction and
// marked on the map, so there is always a reason to go out and look. Each is a node you can use.
//   fallenstar    a star crashed to earth: its light wakes a guard round it, led by an elder; it opens only
//                 once they are all dead, for star-iron, an epic and a fair chance at a legendary
//   soulrift      a tear in the dark: step close and it pours out four waves, the last led by a great elder;
//                 seal it for a legendary
//   mimic         a lonely chest: maybe treasure, maybe teeth (a huge elder that drops a hoard)
//   cauldron      a witch's cauldron left bubbling: one sip each, a blessing (or a hex) until the dawn after next
//   goldpumpkin   a golden pumpkin: a heartstone and an epic, if you find it before it rots
// They are rare (about one every day and a half) and each one completed is announced as an Omen fulfilled.
//
// world.omens      [{id, kind, x, z, until, state, ...}]  saved and sent to guests; their nodes are rebuilt from it
// world.omenT      seconds until the next one may appear
// world.omensDone  how many omens this hollow has seen fulfilled
// p.brew           {kind, until}  a cauldron's effect on a wanderer (until: hollow time)
// Pure simulation: import only content/progression/worldgen. Never engine.mjs, a renderer or the DOM.

import {hollowTime, scheduleOf} from './content.mjs?v=harvest-18';
import {REGIONS, pickWeighted} from './progression.mjs?v=harvest-18';
import {areasOf, clearanceAt, iceAt} from './worldgen.mjs?v=harvest-18';

export const OMENS = Object.freeze({
  fallenstar: Object.freeze({name: 'Fallen star', glyph: '✶', color: '#ffd27a', node: 'fallenstar', weight: 3,
    line: dir => `A star falls to the ${dir}.`}),
  soulrift: Object.freeze({name: 'Soul rift', glyph: '◎', color: '#c49bff', node: 'soulrift', weight: 2.5,
    line: dir => `A soul rift tears open to the ${dir}.`}),
  mimic: Object.freeze({name: 'Lonely chest', glyph: '▣', color: '#f2c14e', node: 'mimic', weight: 2,
    line: dir => `Somewhere to the ${dir}, a chest that was not there yesterday.`}),
  cauldron: Object.freeze({name: 'Witch’s cauldron', glyph: '♨', color: '#8fd3a0', node: 'witchcauldron', weight: 1.6,
    line: dir => `Smoke rises to the ${dir}: a witch has left her cauldron bubbling.`}),
  goldpumpkin: Object.freeze({name: 'Golden pumpkin', glyph: '●', color: '#f2a93b', node: 'goldpumpkin', weight: 1,
    line: dir => `Something gleams gold in the grass to the ${dir}.`}),
});
/**
 * Pacing, in days (one day and night: scheduleOf(world).cycle): the first may come after `first`, then one
 * every `every` on average (jittered by ±`jitter`), at most `max` at once (`maxVigil` on a Vigil), each lasting `life`.
 * Fights: `guards` round a fallen star (+`guardsPer` for each more wanderer), `riftWaves` from a rift, all of
 * them `tierUp` tiers stronger than where they stand; the leaders are elders with `leaderHp` times the health.
 * Rewards: a loot table named after the omen (progression.mjs LOOT_TABLES) at luck .5 (1 in the outer rings),
 * and `xp` x (1 + region tier) for everyone within `share`.
 */
export const OMEN = Object.freeze({first: .7, every: 1.6, jitter: .3, max: 1, maxVigil: 2, life: 2, near: 20, ring: [30, 132],
  wake: 14, guards: 4, guardsPer: 2, tierUp: 1, leaderHp: 1.6, riftWake: 8, riftWaves: 4, mimic: .55, mimicHp: 2.2,
  xp: Object.freeze({fallenstar: 120, soulrift: 150, mimic: 100, goldpumpkin: 60}), share: 26});
/** Cauldron brews: what a sip does until the dawn after next. */
export const BREWS = Object.freeze({
  fury: Object.freeze({name: 'Fury', text: 'Your blows land 30% harder until the dawn after next', weight: 3}),
  swift: Object.freeze({name: 'Swiftness', text: 'Your feet are light until the dawn after next', weight: 3}),
  vigor: Object.freeze({name: 'Vigor', text: 'Mended, and mending until the dawn after next', weight: 2.5}),
  hex: Object.freeze({name: 'Hex', text: 'The brew was a trap. Something answers it', weight: 1}),
});
export const BREW_FURY = 1.3, BREW_SPEED = 1.2, BREW_REGEN = 3;

const NODE_KIND = Object.freeze(Object.fromEntries(Object.entries(OMENS).map(([kind, o]) => [o.node, kind])));
export const isOmenNode = type => Object.hasOwn(NODE_KIND, type);

/** Compass words for a point seen from the Heartfire (north is up the map: -z). */
export function direction(x, z){
  const a = Math.atan2(-z, x)*180/Math.PI, names = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
  return names[(Math.round(a/45)+8)%8];
}

/** Nodes for the live omens (World.restore and rebuildNodes append them after the hollow's own). */
export function omenNodes(world){
  return (world.omens || []).filter(o => !o.done && OMENS[o.kind]).map(o => ({id: o.id, type: OMENS[o.kind].node, x: o.x, z: o.z, hits: 1, ready: 0}));
}

/** Host, every expedition tick. */
export function stepOmens(world, dt){
  if(world.showcase || world.arena || world.dungeon || !world.ambient) return;
  const omens = world.omens ||= [], now = hollowTime(world), cycle = scheduleOf(world).cycle;
  // Expired or finished omens fade (a rift or a star whose fight is under way stays until it is done).
  for(const o of omens){
    if(!o.done && now > o.until && !engaged(world, o)){o.done = true; dropNode(world, o.id);}
  }
  world.omens = omens.filter(o => !o.done || now-(o.until || 0) < 5);
  for(const o of world.omens) if(!o.done) stepOmen(world, o, dt);
  for(const p of world.players) if(p.brew && now >= p.brew.until) endBrew(p);
  else if(p.brew?.kind === 'vigor' && p.online && !p.down && !p.ghost) p.hp = Math.min(p.maxHp || 100, p.hp+BREW_REGEN*dt);
  // Spawning.
  if(!Number.isFinite(world.omenT)) world.omenT = OMEN.first*cycle;
  world.omenT -= dt;
  if(world.omenT > 0) return;
  world.omenT = OMEN.every*cycle*(1-OMEN.jitter+world.spawnRng()*2*OMEN.jitter);
  const live = world.omens.filter(o => !o.done).length, max = world.mode === 'vigil' ? OMEN.maxVigil : OMEN.max;
  if(live >= max) return;
  spawnOmen(world, null, cycle);
}

/** Make an omen (a kind, or a weighted pick). Returns it, or null when no spot was found. */
export function spawnOmen(world, kind = null, cycle = scheduleOf(world).cycle){
  kind ||= pickWeighted(world.spawnRng, Object.entries(OMENS).map(([id, o]) => [id, o.weight]));
  const rng = world.spawnRng, lair = areasOf(world.seed).find(a => a.id === 'briarlair');
  for(let t = 0; t < 60; t++){
    const a = rng()*Math.PI*2, r = OMEN.ring[0]+Math.sqrt(rng())*(OMEN.ring[1]-OMEN.ring[0]), x = Math.cos(a)*r, z = Math.sin(a)*r;
    if(!world.walkable(x, z) || clearanceAt(world.seed, x, z) < 2.2 || iceAt(world.seed, x, z)) continue;
    if(lair && Math.hypot(x-lair.x, z-lair.z) < lair.r+lair.wall+4) continue;
    if(world.players.some(p => p.online && Math.hypot(p.x-x, p.z-z) < OMEN.near)) continue;
    if(world.nodes.some(n => Math.hypot(n.x-x, n.z-z) < 2.4)) continue;
    const o = {id: world.nextId('o'), kind, x: +x.toFixed(2), z: +z.toFixed(2), until: hollowTime(world)+OMEN.life*cycle, state: 'new', sipped: [], spawn: []};
    (world.omens ||= []).push(o);
    world.nodes.push(...omenNodes({omens: [o]}));
    world.event('omen', x, z, '', {kind});
    world.event('announce', x, z, OMENS[kind].line(direction(x, z)), {omen: kind});
    return o;
  }
  return null;
}

function dropNode(world, id){world.nodes = world.nodes.filter(n => n.id !== id);}
function finish(world, o){o.done = true; o.until = hollowTime(world); dropNode(world, o.id);}
const standing = world => world.players.filter(p => p.online && !p.down && !p.ghost);
const humans = world => Math.max(1, world.players.filter(p => p.online).length);
const tierAtOmen = (world, o) => REGIONS[world.regionOf(o.x, o.z)]?.tier ?? 1;
/** True while any of these creatures still stands. */
const anyAlive = (world, ids) => (ids || []).some(id => world.enemies.some(e => e.id === id && e.hp > 0));
/** A fight under way keeps its omen past its time. */
const engaged = (world, o) => (o.kind === 'soulrift' && o.state === 'open') || (o.kind === 'fallenstar' && o.state === 'guarded' && anyAlive(world, o.guards));

/**
 * An omen was completed: its hoard, experience for everyone close, and the moment marked for everyone
 * (`omenfulfilled`: a banner, a fanfare and a burst of gold). Counted on world.omensDone.
 */
function fulfil(world, o, {x = o.x, z = o.z, finder = null, loot = true} = {}){
  const tier = tierAtOmen(world, o), luck = tier >= 2 ? 1 : .5;
  if(loot && OMEN.xp[o.kind] != null) world.spillLoot(world.roll(o.kind, luck), x, z, finder?.name || null);
  const xp = (OMEN.xp[o.kind] || 0)*(1+tier);
  if(xp) for(const p of standing(world)) if(Math.hypot(p.x-x, p.z-z) < OMEN.share) world.awardXp(p, xp);
  world.omensDone = (world.omensDone || 0)+1;
  if(world.saga) world.saga.omens = (world.saga.omens || 0)+1;
  world.event('omenfulfilled', x, z, `Omen fulfilled · ${OMENS[o.kind].name}`, {kind: o.kind, count: world.omensDone});
}

/** Wakes a fallen star's guardians: an elder and its guard, stronger than the ground they stand on. */
function wakeGuardians(world, o, tier){
  o.state = 'guarded'; o.guards = [];
  const pool = tier >= 2 ? ['golem', 'wraith', 'bonewalker', 'brute'] : ['brute', 'wraith', 'bonewalker', 'bogling'];
  const n = OMEN.guards+OMEN.guardsPer*(humans(world)-1)+Math.max(0, tier-1), level = Math.max(1, tier)+OMEN.tierUp;
  for(let i = 0; i < n; i++){
    const lead = i === 0, a = i/n*Math.PI*2, r = lead ? 1.6 : 3.4;
    const e = world.spawnEnemy(lead ? (tier >= 2 ? 'golem' : 'brute') : pool[i%pool.length], o.x+Math.cos(a)*r, o.z+Math.sin(a)*r, {home: true, leash: 14, tier: level, elite: lead ? true : undefined});
    if(!e) continue;
    e.aggro = true; e.omen = o.id; o.guards.push(e.id);
    if(lead) e.hp = e.maxHp = Math.round(e.maxHp*OMEN.leaderHp);
  }
  world.event('announce', o.x, o.z, 'The star’s light woke its guardians. It will not open while they stand.');
}

function stepOmen(world, o, dt){
  const near = r => standing(world).some(p => Math.hypot(p.x-o.x, p.z-o.z) < r);
  const tier = tierAtOmen(world, o);
  if(o.kind === 'fallenstar'){
    if(o.state === 'new' && near(OMEN.wake)) wakeGuardians(world, o, tier);
    else if(o.state === 'guarded' && !o.freed && !anyAlive(world, o.guards)){
      o.freed = true; o.until = Math.max(o.until, hollowTime(world)+90);
      world.event('announce', o.x, o.z, 'The last guardian falls. The star is yours to open.');
    }
  }
  if(o.kind === 'soulrift'){
    if(o.state === 'new' && near(OMEN.riftWake)){o.state = 'open'; o.wave = 0; o.spawn = []; riftWave(world, o, tier);}
    else if(o.state === 'open'){
      const alive = o.spawn.filter(id => world.enemies.some(e => e.id === id && e.hp > 0));
      o.spawn = alive;
      if(!alive.length){
        if(o.wave < OMEN.riftWaves) riftWave(world, o, tier);
        else{
          world.event('riftclose', o.x, o.z, '', {});
          world.event('announce', o.x, o.z, 'The rift seals with a sigh. It leaves its treasure behind.');
          fulfil(world, o);
          finish(world, o);
        }
      }
    }
  }
}

function riftWave(world, o, tier){
  o.wave++;
  const last = o.wave === OMEN.riftWaves, level = Math.max(1, tier)+OMEN.tierUp;
  const count = 4+o.wave*2+(humans(world)-1)*3;
  const pools = [['crawler', 'crawler', 'wraith', 'bogling'], ['bonewalker', 'crawler', 'wraith', 'bogling'], ['brute', 'bonewalker', 'wraith', 'bogling', 'crawler'], ['brute', 'golem', 'bonewalker', 'wraith', 'bogling']];
  const pool = pools[Math.min(pools.length-1, o.wave-1)];
  for(let i = 0; i < count; i++){
    const a = world.spawnRng()*Math.PI*2, r = 1+world.spawnRng()*2.4;
    // Wave 3 brings an elder; the last wave a great elder and two more.
    const lead = last && i === 0, elder = (o.wave >= 3 && i === 0) || (last && i <= 2);
    const type = lead ? (tier >= 2 ? 'golem' : 'brute') : pool[i%pool.length];
    const e = world.spawnEnemy(type, o.x+Math.cos(a)*r, o.z+Math.sin(a)*r, {tier: level, elite: elder ? true : undefined});
    if(!e) continue;
    e.hunt = true; e.omen = o.id; o.spawn.push(e.id);
    if(lead) e.hp = e.maxHp = Math.round(e.maxHp*OMEN.leaderHp);
  }
  world.event('portal', o.x, o.z, '', {radius: 2.4});
  world.event('announce', o.x, o.z, last ? 'The rift pours out its last wave, and something huge with it' : `The rift pours out wave ${o.wave} of ${OMEN.riftWaves}`);
}

/**
 * An omen node was used (World.finishHarvest). `ids` are everyone who helped, first finder first.
 * Returns true when it handled the node (it never regrows).
 */
export function useOmen(world, node, ids){
  const o = (world.omens || []).find(entry => entry.id === node.id && !entry.done); if(!o) return false;
  const finder = world.player(ids[0]);
  const tier = tierAtOmen(world, o);
  if(o.kind === 'fallenstar'){
    // Sealed while its guardians stand.
    if(o.state === 'new') wakeGuardians(world, o, tier);
    if(anyAlive(world, o.guards)){
      if(finder) world.tell(finder, 'The star’s guardians still stand');
      return true;
    }
    world.event('cache', o.x, o.z, '', {key: 'fallenstar'});
    fulfil(world, o, {finder});
    finish(world, o); return true;
  }
  if(o.kind === 'mimic'){
    if(world.spawnRng() < OMEN.mimic){
      const e = world.spawnEnemy(tier >= 2 ? 'golem' : 'brute', o.x, o.z, {elite: true, tier: Math.max(1, tier)+OMEN.tierUp});
      if(e){e.mimic = true; e.omen = o.id; e.aggro = true; e.hp = e.maxHp = Math.round(e.maxHp*OMEN.mimicHp);}
      world.event('announce', o.x, o.z, 'The chest has teeth!');
      world.event('mimic', o.x, o.z, '', {});
    }else{
      world.spillLoot(world.roll('moonchest', 1), o.x, o.z, finder?.name);
      for(const id of ids) world.awardXp(world.player(id), 80);
      world.event('cache', o.x, o.z, '', {key: 'moonchest'});
    }
    finish(world, o); return true;
  }
  if(o.kind === 'goldpumpkin'){
    fulfil(world, o, {finder});
    finish(world, o); return true;
  }
  if(o.kind === 'cauldron'){
    for(const id of ids){
      const p = world.player(id); if(!p || o.sipped.includes(id)) continue;
      o.sipped.push(id); brew(world, p, o);
    }
    if(o.sipped.length >= world.players.filter(p => p.online).length){
      world.event('announce', o.x, o.z, 'The cauldron bubbles dry.');
      fulfil(world, o, {loot: false});
      finish(world, o);
    }
    return true;
  }
  return false;
}

/** A mimic fell: it gives up its hoard (World.tick, on any creature's death). */
export function omenKill(world, e){
  if(!e.mimic) return;
  const o = (world.omens || []).find(entry => entry.id === e.omen) || {x: e.x, z: e.z};
  fulfil(world, {...o, kind: 'mimic'}, {x: e.x, z: e.z, finder: world.player(e.lastHitBy)});
}

function brew(world, p, o){
  const kind = pickWeighted(world.spawnRng, Object.entries(BREWS).map(([id, b]) => [id, b.weight]));
  const cycle = scheduleOf(world).cycle, now = hollowTime(world), dawn = (Math.floor(now/cycle)+2)*cycle;
  if(kind === 'hex'){
    for(let i = 0; i < 6; i++){const a = i/6*Math.PI*2, e = world.spawnEnemy('crawler', p.x+Math.cos(a)*3, p.z+Math.sin(a)*3, {tier: 1}); if(e) e.hunt = true;}
  }else{
    endBrew(p);
    p.brew = {kind, until: Math.max(dawn, now+cycle)};
    if(kind === 'fury') p.boon = BREW_FURY;
    if(kind === 'vigor'){p.hp = p.maxHp || p.hp; p.courage = 100;}
  }
  world.event('brew', p.x, p.z, BREWS[kind].name, {player: p.id, kind});
  world.tell(p, `${BREWS[kind].name} · ${BREWS[kind].text}`);
}
function endBrew(p){if(p.brew?.kind === 'fury' && p.boon === BREW_FURY) p.boon = 1; p.brew = null;}

/** Walk-speed factor from a brew (World.speedFactor). */
export const brewSpeed = p => p?.brew?.kind === 'swift' ? BREW_SPEED : 1;

/** HUD line for a wanderer under a brew, or ''. */
export function brewLine(p){return p?.brew ? `${BREWS[p.brew.kind]?.name || ''} brew` : '';}
