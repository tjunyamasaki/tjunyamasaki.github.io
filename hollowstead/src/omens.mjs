// Omens: things that turn up somewhere in the hollow for a while, announced with a direction and
// marked on the map, so there is always a reason to go out and look. Each is a node you can use.
//   fallenstar    a star crashed to earth: its light wakes a guard round it, led by an elder; it opens only
//                 once they are all dead, for star-iron, an epic and a fair chance at a legendary
//   soulrift      a tear in the dark: step close and it pours out four waves, the last led by a great elder;
//                 seal it for a legendary. Its creatures stay by the rift (they give up on a wanderer who runs
//                 far off), a wave only counts when it is slain, and a rift left alone (everyone fled or fell)
//                 falls quiet and must be fought again from the first wave
//   mimic         a lonely chest: maybe treasure, maybe teeth (a huge elder that drops a hoard)
//   cauldron      a witch's cauldron left bubbling: one sip each, a blessing (or a hex) until the dawn after next
//   goldpumpkin   a golden pumpkin: a heartstone and an epic, if you find it before it rots
//   altar         a bleeding altar (a Vigil from the Age of Bleeding, ages.mjs): hold to wake its Dread champion,
//                 a named great elder with an escort; slay it for Dread sigils (they ascend weapons), an epic and more
// The Shrine of Yomi (a land, worldgen.mjs LANDS.yomi) has three of its own, in that land only:
//   obon          a floating lantern by the water: light it and the Obon lanterns set out for the shrine, but only
//                 move while a wanderer walks beside them. Hungry ghosts rise to snuff them (they want the light,
//                 not you): every lantern that reaches the shrine sweetens the offering left there
//   hyakki        the Hyakki Yagyō, a night parade of a hundred demons, crosses the hollow edge to edge. It minds
//                 its own way unless you step close or strike it, and then everything near turns on you. Its
//                 herald carries a hoard: ambush the parade, or stand aside and let it pass
//   foxwedding    a fox wedding in a sunshower: bow to it (hold the action) and then keep still beside it, no blows
//                 and no dodging, until the bride has passed: the foxes bless you. Disturb it and they curse you
// They are rare (about one every day and a half) and each one completed is announced as an Omen fulfilled.
//
// world.omens      [{id, kind, x, z, until, state, ...}]  saved and sent to guests; their nodes are rebuilt from it
// world.omenT      seconds until the next one may appear
// world.omensDone  how many omens this hollow has seen fulfilled
// p.brew           {kind, until}  a cauldron's effect on a wanderer (until: hollow time)
// e.snuff          (a hungry ghost of the Obon procession) the omen it hunts; e.snuffX/e.snuffZ where the lanterns are
// e.parade         (a Hyakki Yagyō marcher) the omen it walks in; e.march where it is headed; e.provoked once it turns
// Pure simulation: import only content/progression/worldgen. Never engine.mjs, a renderer or the DOM.

import {hollowTime, phaseOf, scheduleOf} from './content.mjs?v=harvest-18';
import {giveBuff} from './buffs.mjs?v=harvest-18';
import {REGIONS, pickWeighted} from './progression.mjs?v=harvest-18';
import {areasOf, clearanceAt, iceAt} from './worldgen.mjs?v=harvest-18';
import {AGE, ageOf} from './ages.mjs?v=harvest-18';
import {builtAt} from './homestead.mjs?v=harvest-18';

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
  // `age`: only on a Vigil that has reached this Dread Age (ages.mjs).
  altar: Object.freeze({name: 'Bleeding altar', glyph: '✠', color: '#e0465a', node: 'dreadaltar', weight: 2.2, age: AGE.altars,
    line: dir => `Something old and red stirs to the ${dir}: a bleeding altar.`}),
  // `land`: only in a hollow of that land. `night`: only appears at night. No `node`: nothing to use, it moves.
  obon: Object.freeze({name: 'Obon lanterns', glyph: '◈', color: '#ffb45a', node: 'obonlantern', weight: 2.2, land: 'yomi',
    line: dir => `To the ${dir}, a paper lantern waits by the water. The dead want to go home.`}),
  hyakki: Object.freeze({name: 'Hyakki Yagyō', glyph: '☗', color: '#e05a50', node: null, weight: 2, land: 'yomi', night: true,
    line: dir => `Drums to the ${dir}. The Hyakki Yagyō, the night parade of a hundred demons, is crossing the hollow.`}),
  foxwedding: Object.freeze({name: 'Fox wedding', glyph: '☂', color: '#ffc98a', node: 'foxwedding', weight: 1.8, land: 'yomi',
    line: dir => `Rain from a clear sky to the ${dir}: the foxes are holding a wedding.`}),
});
/** Omen kinds this world can see (an altar needs its Dread Age, a land's omens that land, a night omen the dark). */
export const omenKinds = world => Object.entries(OMENS).filter(([, o]) => (!o.age || ageOf(world) >= o.age) && (!o.land || world.land === o.land) && (!o.night || phaseOf(world) === 'night'));
/**
 * The Shrine of Yomi's omens. Obon: `lights` lanterns (+`lightsPer` a wanderer), walking `speed` while someone is within
 * `escort`, from `from` units out to the shrine's heart; every `every` seconds `ghosts` hungry ghosts (+1 a wanderer) rise
 * `rise` away and make for the lanterns, snuffing one each if they reach `bite`. Hyakki: `count` marchers (+`countPer`),
 * spaced `gap` apart, crossing a chord that passes `pass` from the Heartfire; one notices a wanderer within `notice`, and
 * turns everything within `spread` of it. Its herald has `heraldHp` times the health. Fox wedding: watch `watch` seconds
 * within `near`; its blessing is the Fox's blessing (buffs.mjs), a curse sets `curse` foxfire creatures on you.
 */
export const YOMI_OMEN = Object.freeze({
  obon: Object.freeze({lights: 7, lightsPer: 2, speed: 1.35, escort: 7, from: [38, 52], every: 8, ghosts: 3, rise: [10, 13], bite: 1.5, firstAfter: 3}),
  hyakki: Object.freeze({count: 12, countPer: 3, gap: 1.7, pass: [18, 50], edge: 104, notice: 3.5, spread: 9, heraldHp: 2.4, end: 4,
    pool: Object.freeze(['chochin', 'chochin', 'kasa', 'kasa', 'jiangshi', 'rokurokubi', 'yukionna'])}),
  foxwedding: Object.freeze({watch: 8, near: 6, curse: 5}),
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
  wake: 14, guards: 4, guardsPer: 2, tierUp: 1, leaderHp: 1.6, riftWake: 8, riftWaves: 4, riftLeash: 16, riftFar: 34, riftQuiet: 20, mimic: .55, mimicHp: 2.2,
  championHp: 2.6, escort: 3, escortPer: 1,
  xp: Object.freeze({fallenstar: 120, soulrift: 150, mimic: 100, goldpumpkin: 60, altar: 140, obon: 130, hyakki: 160, foxwedding: 90}), share: 26});
/** A Dread champion's name: one of these, and one of those. */
const CHAMPION_NAMES = Object.freeze(['Grisk', 'Morrow', 'Vael', 'Ossa', 'Thane', 'Krell', 'Ysolde', 'Murk', 'Corvin', 'Hesk', 'Brann', 'Sallow']);
const CHAMPION_TITLES = Object.freeze(['the Unburied', 'the Hungering', 'Who Drinks', 'the Red Tithe', 'of the Thorn', 'the Last Mourner', 'the Hollowed', 'the Bled']);
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
  // A lit Obon procession and the Hyakki Yagyō move: they are no node to use.
  return (world.omens || []).filter(o => !o.done && OMENS[o.kind]?.node && !o.lit).map(o => ({id: o.id, type: OMENS[o.kind].node, x: o.x, z: o.z, hits: 1, ready: 0}));
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

/** The Shrine of Yomi's heart (where the Obon lanterns go), or null outside that land. */
const shrineOf = world => areasOf(world.seed).find(a => a.id === 'yomi') || null;
/** A clear spot for an omen at (x, z): walkable, open, off the ice, away from wanderers, nodes and camps. */
function omenSpot(world, x, z){
  if(!world.walkable(x, z) || clearanceAt(world.seed, x, z) < 2.2 || iceAt(world.seed, x, z)) return false;
  const lair = areasOf(world.seed).find(a => a.id === 'briarlair');
  if(lair && Math.hypot(x-lair.x, z-lair.z) < lair.r+lair.wall+4) return false;
  if(world.players.some(p => p.online && Math.hypot(p.x-x, p.z-z) < OMEN.near)) return false;
  if(world.nodes.some(n => Math.hypot(n.x-x, n.z-z) < 2.4)) return false;
  return !(builtAt(world, x, z, 1.5) || world.buildings.some(b => b.type !== 'glimmer' && Math.hypot(b.x-x, b.z-z) < OMEN_CAMP));
}

/** How far an omen keeps from anything built (a camp can be anywhere on a Vigil). */
const OMEN_CAMP = 10;
/** Make an omen (a kind, or a weighted pick). Returns it, or null when no spot was found. */
export function spawnOmen(world, kind = null, cycle = scheduleOf(world).cycle){
  kind ||= pickWeighted(world.spawnRng, omenKinds(world).map(([id, o]) => [id, o.weight]));
  if(kind === 'hyakki') return spawnParade(world, cycle);
  const rng = world.spawnRng, lair = areasOf(world.seed).find(a => a.id === 'briarlair');
  // The Obon lanterns wait a walk away from the shrine they are bound for.
  if(kind === 'obon'){
    const shrine = shrineOf(world), O = YOMI_OMEN.obon; if(!shrine) return null;
    for(let t = 0; t < 80; t++){
      const a = rng()*Math.PI*2, r = O.from[0]+rng()*(O.from[1]-O.from[0]), x = shrine.x+Math.cos(a)*r, z = shrine.z+Math.sin(a)*r;
      if(Math.hypot(x, z) > OMEN.ring[1] || !omenSpot(world, x, z)) continue;
      return addOmen(world, {kind, x, z, cycle, extra: {to: [+shrine.x.toFixed(2), +shrine.z.toFixed(2)]}});
    }
    return null;
  }
  for(let t = 0; t < 60; t++){
    const a = rng()*Math.PI*2, r = OMEN.ring[0]+Math.sqrt(rng())*(OMEN.ring[1]-OMEN.ring[0]), x = Math.cos(a)*r, z = Math.sin(a)*r;
    if(!world.walkable(x, z) || clearanceAt(world.seed, x, z) < 2.2 || iceAt(world.seed, x, z)) continue;
    if(lair && Math.hypot(x-lair.x, z-lair.z) < lair.r+lair.wall+4) continue;
    if(world.players.some(p => p.online && Math.hypot(p.x-x, p.z-z) < OMEN.near)) continue;
    if(world.nodes.some(n => Math.hypot(n.x-x, n.z-z) < 2.4)) continue;
    // Never on someone's floors, fields or walls, nor close enough to a camp to fight in it.
    if(builtAt(world, x, z, 1.5) || world.buildings.some(b => b.type !== 'glimmer' && Math.hypot(b.x-x, b.z-z) < OMEN_CAMP)) continue;
    return addOmen(world, {kind, x, z, cycle});
  }
  return null;
}
function addOmen(world, {kind, x, z, cycle, extra = {}, life = OMEN.life*cycle}){
  const o = {id: world.nextId('o'), kind, x: +x.toFixed(2), z: +z.toFixed(2), until: hollowTime(world)+life, state: 'new', sipped: [], spawn: [], ...extra};
  (world.omens ||= []).push(o);
  world.nodes.push(...omenNodes({omens: [o]}));
  world.event('omen', x, z, '', {kind});
  world.event('announce', x, z, OMENS[kind].line(direction(x, z)), {omen: kind});
  return o;
}

function dropNode(world, id){world.nodes = world.nodes.filter(n => n.id !== id);}
function finish(world, o){o.done = true; o.until = hollowTime(world); dropNode(world, o.id);}
const standing = world => world.players.filter(p => p.online && !p.down && !p.ghost);
const humans = world => Math.max(1, world.players.filter(p => p.online).length);
const tierAtOmen = (world, o) => REGIONS[world.regionOf(o.x, o.z)]?.tier ?? 1;
/** True while any of these creatures still stands. */
const anyAlive = (world, ids) => (ids || []).some(id => world.enemies.some(e => e.id === id && e.hp > 0));
/** A fight under way keeps its omen past its time. */
const engaged = (world, o) => (o.kind === 'soulrift' && o.state === 'open') || (o.kind === 'fallenstar' && o.state === 'guarded' && anyAlive(world, o.guards))
  || (o.kind === 'altar' && o.state === 'awake' && anyAlive(world, [o.champion]))
  || (o.kind === 'obon' && o.lit) || (o.kind === 'hyakki' && anyAlive(world, o.spawn)) || (o.kind === 'foxwedding' && o.state === 'watching');

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
  if(o.kind === 'obon'){stepObon(world, o, dt); return;}
  if(o.kind === 'hyakki'){stepParade(world, o, dt); return;}
  if(o.kind === 'foxwedding'){stepWedding(world, o, dt); return;}
  const near = r => standing(world).some(p => Math.hypot(p.x-o.x, p.z-o.z) < r);
  const tier = tierAtOmen(world, o);
  if(o.kind === 'fallenstar'){
    if(o.state === 'new' && near(OMEN.wake)) wakeGuardians(world, o, tier);
    else if(o.state === 'guarded' && !o.freed && !anyAlive(world, o.guards)){
      o.freed = true; o.until = Math.max(o.until, hollowTime(world)+90);
      world.event('announce', o.x, o.z, 'The last guardian falls. The star is yours to open.');
    }
  }
  if(o.kind === 'altar' && o.state === 'awake' && !anyAlive(world, [o.champion])){
    // Its champion wandered off and faded: the altar waits to be woken again.
    o.state = 'new'; o.champion = null; o.spawn = [];
  }
  if(o.kind === 'soulrift'){
    if(o.state === 'new' && near(OMEN.riftWake)){o.state = 'open'; o.wave = 0; o.spawn = []; o.alone = 0; riftWave(world, o, tier);}
    else if(o.state === 'open'){
      // Nobody standing near (fled, or fell): after a while the rift falls quiet and takes its creatures back.
      o.alone = near(OMEN.riftFar) ? 0 : (o.alone || 0)+dt;
      if(o.alone > OMEN.riftQuiet){quietRift(world, o); return;}
      // Struck down this tick but not yet cleared away: wait for the kill to be counted (riftKill).
      if(o.spawn.some(id => world.enemies.some(e => e.id === id && !(e.hp > 0)))) return;
      const alive = o.spawn.filter(id => world.enemies.some(e => e.id === id && e.hp > 0));
      o.spawn = alive;
      if(!alive.length){
        // A wave only counts when it was slain: creatures that vanished some other way never open the next one.
        if(o.waveSize != null && (o.slain || 0) < o.waveSize){quietRift(world, o); return;}
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

/** The rift closes its waves and waits: its creatures sink back in and the next fight starts from wave one. */
function quietRift(world, o){
  const ids = new Set(o.spawn || []);
  if(ids.size) world.enemies = world.enemies.filter(e => !ids.has(e.id));
  o.state = 'new'; o.wave = 0; o.spawn = []; o.slain = 0; o.waveSize = null; o.alone = 0;
  world.event('announce', o.x, o.z, 'The soul rift falls quiet. Its wave sinks back into the dark.');
}

/** A rift's creature died (World, before the dead are cleared). */
export function riftKill(world, e){
  const o = (world.omens || []).find(entry => entry.id === e.omen && entry.kind === 'soulrift' && !entry.done);
  if(o && (o.spawn || []).includes(e.id)) o.slain = (o.slain || 0)+1;
}

function riftWave(world, o, tier){
  o.wave++; o.slain = 0; o.waveSize = 0;
  const last = o.wave === OMEN.riftWaves, level = Math.max(1, tier)+OMEN.tierUp;
  const count = 4+o.wave*2+(humans(world)-1)*3;
  const pools = [['crawler', 'crawler', 'wraith', 'bogling'], ['bonewalker', 'crawler', 'wraith', 'bogling'], ['brute', 'bonewalker', 'wraith', 'bogling', 'crawler'], ['brute', 'golem', 'bonewalker', 'wraith', 'bogling']];
  const pool = pools[Math.min(pools.length-1, o.wave-1)];
  for(let i = 0; i < count; i++){
    const a = world.spawnRng()*Math.PI*2, r = 1+world.spawnRng()*2.4;
    // Wave 3 brings an elder; the last wave a great elder and two more.
    const lead = last && i === 0, elder = (o.wave >= 3 && i === 0) || (last && i <= 2);
    const type = lead ? (tier >= 2 ? 'golem' : 'brute') : pool[i%pool.length];
    // Bound to the rift: they chase a wanderer close by and walk back to it when you get far away (mobs.mjs home).
    const e = world.spawnEnemy(type, o.x+Math.cos(a)*r, o.z+Math.sin(a)*r, {tier: level, elite: elder ? true : undefined, home: true, leash: OMEN.riftLeash});
    if(!e) continue;
    e.aggro = true; e.omen = o.id; o.spawn.push(e.id); o.waveSize++;
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
  if(o.kind === 'altar'){
    if(o.state !== 'awake') wakeChampion(world, o, tier, finder);
    else if(finder) world.tell(finder, 'The altar has drunk. Its champion still stands');
    return true;
  }
  if(o.kind === 'obon'){lightObon(world, o, finder); return true;}
  if(o.kind === 'foxwedding'){
    if(o.state === 'new'){
      o.state = 'watching'; o.watch = 0; o.since = world.time; o.guests = ids.slice();
      world.event('announce', o.x, o.z, `${finder ? finder.name+' bows' : 'You bow'} to the wedding. Keep still and quiet until the bride has passed.`);
    }
    return true;
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

/**
 * A bleeding altar drinks: its Dread champion rises, a named great elder of the heavy kind that lives
 * there, with an escort (dreadhounds once they run, briarlings before). Slay it to fulfil the omen.
 */
function wakeChampion(world, o, tier, finder){
  const rng = world.spawnRng, level = Math.max(1, tier)+OMEN.tierUp+1;
  const e = world.spawnEnemy(tier >= 2 ? 'golem' : 'brute', o.x, o.z+1.6, {elite: true, home: true, leash: 16, tier: level});
  if(!e) return;
  e.hp = e.maxHp = Math.round(e.maxHp*OMEN.championHp);
  e.aggro = true; e.omen = o.id; e.champion = `${CHAMPION_NAMES[Math.floor(rng()*CHAMPION_NAMES.length)]} ${CHAMPION_TITLES[Math.floor(rng()*CHAMPION_TITLES.length)]}`;
  o.state = 'awake'; o.champion = e.id; o.spawn = [e.id];
  const escort = ageOf(world) >= AGE.hounds ? 'dreadhound' : 'crawler', n = OMEN.escort+OMEN.escortPer*(humans(world)-1);
  for(let i = 0; i < n; i++){
    const a = i/n*Math.PI*2, m = world.spawnEnemy(escort, o.x+Math.cos(a)*3, o.z+Math.sin(a)*3, {home: true, leash: 16, tier: level-1});
    if(m){m.aggro = true; m.omen = o.id; o.spawn.push(m.id);}
  }
  world.event('bossrise', e.x, e.z, '', {boss: 'champion'});
  world.event('announce', o.x, o.z, `${finder ? `${finder.name} wakes the altar. ` : ''}It drinks, and ${e.champion}, a Dread champion, rises`);
}

/** A mimic or a Dread champion fell: it gives up its hoard (World.tick, on any creature's death). */
export function omenKill(world, e){
  if(e.herald){heraldFell(world, e); return;}
  if(!e.mimic && !e.champion) return;
  const o = (world.omens || []).find(entry => entry.id === e.omen) || {x: e.x, z: e.z};
  if(e.champion){
    world.event('announce', e.x, e.z, `${e.champion} falls. The altar is dry`);
    fulfil(world, {...o, kind: 'altar'}, {x: e.x, z: e.z, finder: world.player(e.lastHitBy)});
    if(o.id) finish(world, o);
    return;
  }
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

// ------------------------------------------------------------------ the Shrine of Yomi's omens
/** The first lantern is lit: the procession sets out for the shrine. */
function lightObon(world, o, finder){
  if(o.lit) return;
  const O = YOMI_OMEN.obon;
  o.lit = true; o.state = 'walking'; o.lights = o.total = O.lights+O.lightsPer*(humans(world)-1); o.from = [o.x, o.z]; o.next = O.firstAfter; o.spawn = [];
  dropNode(world, o.id);
  world.event('obon', o.x, o.z, '', {lights: o.lights});
  world.event('announce', o.x, o.z, `${finder ? finder.name+' lights' : 'Someone lights'} the first lantern. The Obon lanterns set out for the shrine: walk beside them.`);
}

function stepObon(world, o, dt){
  if(!o.lit) return;
  const O = YOMI_OMEN.obon, people = standing(world), [tx, tz] = o.to, rng = world.spawnRng;
  // The dead only walk home with the living beside them.
  const escorted = people.some(p => Math.hypot(p.x-o.x, p.z-o.z) < O.escort);
  const left = Math.hypot(tx-o.x, tz-o.z);
  if(escorted && left > .5){const step = Math.min(left, O.speed*dt); o.x = +(o.x+(tx-o.x)/left*step).toFixed(2); o.z = +(o.z+(tz-o.z)/left*step).toFixed(2);}
  // Hungry ghosts rise for the light while the procession walks.
  o.spawn = (o.spawn || []).filter(id => world.enemies.some(e => e.id === id && e.hp > 0));
  if(escorted){
    o.next -= dt;
    if(o.next <= 0){
      o.next = O.every;
      const n = O.ghosts+humans(world)-1, base = rng()*Math.PI*2, tier = tierAtOmen(world, o)+OMEN.tierUp-1;
      for(let i = 0; i < n; i++){
        const a = base+(i-(n-1)/2)*.5, r = O.rise[0]+rng()*(O.rise[1]-O.rise[0]);
        const e = world.spawnEnemy(rng() < .65 ? 'chochin' : 'kasa', o.x+Math.cos(a)*r, o.z+Math.sin(a)*r, {tier, elite: false});
        if(e){e.snuff = o.id; e.snuffX = o.x; e.snuffZ = o.z; e.omen = o.id; o.spawn.push(e.id);}
      }
      world.event('announce', o.x, o.z, 'Hungry ghosts rise for the lanterns!');
    }
  }
  // Where the lanterns are, for the ghosts hunting them; one that reaches them snuffs a lantern and is sated (gone, no spoils).
  const sated = new Set();
  for(const e of world.enemies){
    if(e.snuff !== o.id || !(e.hp > 0)) continue;
    e.snuffX = o.x; e.snuffZ = o.z;
    if(Math.hypot(e.x-o.x, e.z-o.z) < O.bite){sated.add(e.id); o.lights--; world.event('snuff', o.x, o.z, '', {lights: o.lights});}
  }
  if(sated.size) world.enemies = world.enemies.filter(e => !sated.has(e.id));
  if(sated.size && o.lights <= 0){
    banishGhosts(world, o);
    world.event('announce', o.x, o.z, 'The last lantern goes out. The dead are lost in the dark.');
    finish(world, o); return;
  }
  if(sated.size) world.event('announce', o.x, o.z, `A lantern is snuffed. ${o.lights} still burn.`);
  if(left <= .5){
    // Home: an offering at the shrine, richer for every lantern that made it.
    const kept = o.lights/Math.max(1, o.total), luck = kept*1.6;
    banishGhosts(world, o);
    world.event('announce', o.x, o.z, `${o.lights} of ${o.total} lanterns reach the shrine. The dead are home, and leave their thanks.`);
    world.spillLoot(world.roll('obon', luck), o.x, o.z, null);
    fulfil(world, o, {loot: false});
    finish(world, o);
  }
}

/** The procession is over: its hungry ghosts fade with it. */
function banishGhosts(world, o){world.enemies = world.enemies.filter(e => e.snuff !== o.id);}

/** The Hyakki Yagyō: a parade along a chord across the hollow, led by its herald. */
function spawnParade(world, cycle){
  const H = YOMI_OMEN.hyakki, rng = world.spawnRng;
  for(let t = 0; t < 40; t++){
    const a = rng()*Math.PI*2, pass = H.pass[0]+rng()*(H.pass[1]-H.pass[0]), half = Math.sqrt(Math.max(0, H.edge*H.edge-pass*pass));
    const cx = Math.cos(a)*pass, cz = Math.sin(a)*pass, ux = -Math.sin(a), uz = Math.cos(a);
    let sx = cx-ux*half, sz = cz-uz*half, ex = cx+ux*half, ez = cz+uz*half;
    // Pull each end in until it stands on land.
    for(let k = 0; k < 30 && !world.walkable(sx, sz); k++){sx += ux*2; sz += uz*2;}
    for(let k = 0; k < 30 && !world.walkable(ex, ez); k++){ex -= ux*2; ez -= uz*2;}
    if(Math.hypot(ex-sx, ez-sz) < 60 || world.players.some(p => p.online && Math.hypot(p.x-sx, p.z-sz) < 20)) continue;
    const o = addOmen(world, {kind: 'hyakki', x: sx, z: sz, cycle, life: cycle*.5, extra: {to: [+ex.toFixed(2), +ez.toFixed(2)], spawn: []}});
    const n = H.count+H.countPer*(humans(world)-1), tier = Math.max(1, tierAtOmen(world, o))+OMEN.tierUp;
    for(let i = 0; i < n; i++){
      const herald = i === 0, row = Math.ceil(i/2), side = i === 0 ? 0 : (i%2 ? 1 : -1);
      const x = sx-ux*row*H.gap+uz*side*.9, z = sz-uz*row*H.gap-ux*side*.9;
      const type = herald ? 'daoshi' : H.pool[Math.floor(rng()*H.pool.length)];
      const e = world.spawnEnemy(type, x, z, {tier, elite: herald ? true : false});
      if(!e) continue;
      e.parade = o.id; e.march = {x: o.to[0]-ux*row*H.gap, z: o.to[1]-uz*row*H.gap}; e.omen = o.id; o.spawn.push(e.id);
      if(herald){e.herald = true; e.hp = e.maxHp = Math.round(e.maxHp*H.heraldHp); o.herald = e.id;}
    }
    return o;
  }
  return null;
}

/** Turn a marcher (and everything marching near it) on the wanderers. */
function provoke(world, o, e){
  const H = YOMI_OMEN.hyakki;
  let turned = 0;
  for(const m of world.enemies) if(m.parade === o.id && !m.provoked && m.hp > 0 && Math.hypot(m.x-e.x, m.z-e.z) < H.spread){m.provoked = true; m.raid = true; turned++;}
  if(turned) world.event('announce', e.x, e.z, turned > 3 ? 'The parade turns on you!' : 'Some of the parade breaks rank!');
}

function stepParade(world, o, dt){
  const H = YOMI_OMEN.hyakki, people = standing(world);
  const marchers = world.enemies.filter(e => e.parade === o.id && e.hp > 0);
  o.spawn = marchers.map(e => e.id);
  for(const e of marchers){
    if(e.provoked) continue;
    if(e.hp < e.maxHp || people.some(p => Math.hypot(p.x-e.x, p.z-e.z) < H.notice)) provoke(world, o, e);
  }
  // The map marks the head of the parade (its herald while it lives).
  const head = marchers.find(e => e.id === o.herald) || marchers[0];
  if(head){o.x = +head.x.toFixed(2); o.z = +head.z.toFixed(2);}
  // Those still marching walk on into the night at the far edge.
  const passed = new Set(marchers.filter(e => !e.provoked && Math.hypot(e.x-e.march.x, e.z-e.march.z) < H.end).map(e => e.id));
  if(passed.size) world.enemies = world.enemies.filter(e => !passed.has(e.id));
  if(marchers.length > passed.size) return;
  if(!o.fulfilled) world.event('announce', o.x, o.z, 'The Hyakki Yagyō passes into the dark.');
  finish(world, o);
}

/** The herald falls: the parade's hoard spills, and the omen is fulfilled. */
function heraldFell(world, e){
  const o = (world.omens || []).find(entry => entry.id === e.parade);
  world.event('announce', e.x, e.z, 'The herald of the Hyakki Yagyō falls. Its hoard spills across the road.');
  fulfil(world, {...(o || {x: e.x, z: e.z}), kind: 'hyakki'}, {x: e.x, z: e.z, finder: world.player(e.lastHitBy)});
  if(o) o.fulfilled = true;
}

/** The fox wedding: whoever bowed must keep still beside it until the bride has passed. */
function stepWedding(world, o, dt){
  if(o.state !== 'watching') return;
  const F = YOMI_OMEN.foxwedding;
  const guests = (o.guests || []).map(id => world.player(id)).filter(p => p && p.online && !p.down && !p.ghost);
  // A blow, a dodge or walking off breaks the spell.
  const rude = guests.find(p => p.aimUntil > o.since+.5 || p.dash > 0 || Math.hypot(p.x-o.x, p.z-o.z) > F.near);
  if(!guests.length || rude){curseWedding(world, o, rude || null); return;}
  o.watch += dt;
  if(o.watch < F.watch) return;
  for(const p of guests) giveBuff(world, p, 'foxwed');
  world.event('foxblessing', o.x, o.z, '', {blessed: guests.map(p => p.id)});
  world.event('announce', o.x, o.z, 'The bride passes, and the foxes bow back. Their blessing goes with you.');
  fulfil(world, o, {finder: guests[0]});
  finish(world, o);
}

function curseWedding(world, o, p){
  const F = YOMI_OMEN.foxwedding, rng = world.spawnRng, at = p || o;
  world.event('announce', o.x, o.z, `${p ? p.name+' disturbs' : 'Something disturbs'} the wedding. The foxes curse you, and foxfire comes for you.`);
  world.event('foxcurse', o.x, o.z, '', {});
  for(let i = 0; i < F.curse+humans(world)-1; i++){
    const a = i/F.curse*Math.PI*2+rng(), e = world.spawnEnemy(rng() < .5 ? 'kasa' : 'chochin', at.x+Math.cos(a)*5, at.z+Math.sin(a)*5, {tier: tierAtOmen(world, o)+OMEN.tierUp});
    if(e) e.hunt = true;
  }
  for(const q of (o.guests || []).map(id => world.player(id)).filter(Boolean)) q.chill = +(world.time+4).toFixed(2);
  finish(world, o);
}
