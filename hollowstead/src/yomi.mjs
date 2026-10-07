// The Shrine of Yomi's other places (worldgen.mjs AREAS: only in a hollow of that land), each with one rule
// that changes how you move or fight there. areas.mjs calls stepYomi() every expedition tick; the World and
// mobs.mjs read the speed factors.
//
//   chikurin  The Bamboo Thicket. The stalks hide what stands among them: a creature in the thicket is veiled
//             (e.veiled, sent to guests) until a wanderer comes within VEIL.near of it. Veiled creatures are
//             drawn as a faint stir in the bamboo, and aimed attacks (arsenal.mjs aimTarget) never lock on to
//             them. The dead wait in there; you find them by walking into them.
//   higan     The Spider-lily Marsh. A black river runs through it, shallow enough to wade: whoever wades it,
//             wanderer or creature, moves at WADE.speed. Floating things (fliers, the snow woman, an umbrella
//             mid-skip) pass over it. Fight on the bank, or lure them in.
//   onsen     The Hot-spring Terrace. Sitting in a spring mends: a wanderer gains SPRING.heal health a second
//             (and frost thaws at once); a creature mends SPRING.mob of its health a second. Each pool's geyser
//             erupts on its own beat while anyone is near (telegraphed, it shoves everyone in it and scalds a
//             little: creatures too). Hold the water, or knock them out of it.
//
// The marsh also holds the Mound of the Starved, where the Gashadokuro sleeps (MOUND below, bosses.mjs).
// Pure simulation: import only content/progression/worldgen/blasts. Never engine.mjs, a renderer or the DOM.

import {REGIONS} from './progression.mjs?v=harvest-18';
import {hollowTime, phaseOf, scheduleOf} from './content.mjs?v=harvest-18';
import {areasOf, blackAt, springAt} from './worldgen.mjs?v=harvest-18';
import {addBlast} from './blasts.mjs?v=harvest-18';

export const VEIL = Object.freeze({near: 4.6});
export const WADE = Object.freeze({speed: .6});
export const SPRING = Object.freeze({heal: 5, mob: .035, geyser: [5.5, 7.5], fuse: 1.1, damage: 7, push: 2.4, near: 16});
/** Who floats over the black river. */
const FLOATS = new Set(['yukionna', 'wraith', 'chochin']);

const outside = world => !!(world?.arena || world?.dungeon || world?.showcase);

/** Walk-speed factor of a wanderer wading the black river (World.speedFactor). */
export function wadeSpeed(world, p){
  if(!p || outside(world) || !world?.seed) return 1;
  return blackAt(world.seed, p.x, p.z) ? WADE.speed : 1;
}
/** Run-speed factor of a creature wading it (mobs.mjs). Floaters and a kasa mid-skip are spared. */
export function mobWade(world, e, fly){
  if(fly || FLOATS.has(e?.type) || e?.hop || outside(world) || !world?.seed || !world.yomiAreas) return 1;
  return blackAt(world.seed, e.x, e.z) ? WADE.speed : 1;
}
/** True for a hostile the bamboo hides from wanderers (arsenal.mjs aimTarget skips it). */
export const veiled = e => !!e?.veiled;

/** Host, every expedition tick (areas.mjs stepAreas). */
export function stepYomi(world, dt){
  stepMound(world);
  const areas = areasOf(world.seed), grove = areas.find(a => a.id === 'chikurin'), terrace = areas.find(a => a.id === 'onsen');
  // Remember whether this hollow has the places at all, so the hot paths can skip it (not saved: derived).
  world.yomiAreas = !!(grove || terrace || areas.some(a => a.id === 'higan'));
  if(!world.yomiAreas) return;
  const people = world.players.filter(p => p.online && !p.down && !p.ghost);
  // The bamboo hides what stands in it.
  for(const e of world.enemies){
    if(!(e.hp > 0)) continue;
    const hidden = !!grove && world.regionOf(e.x, e.z) === 'chikurin' && !people.some(p => Math.hypot(p.x-e.x, p.z-e.z) < VEIL.near);
    if(hidden) e.veiled = true; else if(e.veiled) delete e.veiled;
  }
  if(!terrace) return;
  // The springs mend whoever sits in them.
  for(const p of people) if(springAt(world.seed, p.x, p.z)){
    if(p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp+SPRING.heal*dt);
    if(p.chill) p.chill = 0;
  }
  for(const e of world.enemies) if(e.hp > 0 && e.hp < e.maxHp && springAt(world.seed, e.x, e.z)) e.hp = Math.min(e.maxHp, e.hp+e.maxHp*SPRING.mob*dt);
  // Each pool's geyser keeps its own beat (from the clock and its place, so nothing needs saving).
  const {scale} = world.mobScale(REGIONS.onsen?.tier ?? 2);
  terrace.pools.forEach((pool, i) => {
    if(!people.some(p => Math.hypot(p.x-pool.x, p.z-pool.z) < SPRING.near)) return;
    const [lo, hi] = SPRING.geyser, period = lo+(hi-lo)*((i*.618+pool.r)%1), phase = (pool.x*.37+pool.z*.13)%period;
    const before = Math.floor((world.time-dt+phase)/period), now = Math.floor((world.time+phase)/period);
    if(now === before) return;
    addBlast(world, {style: 'steam', shape: 'circle', x: pool.x, z: pool.z, radius: pool.r+.7, fuse: SPRING.fuse, damage: Math.round(SPRING.damage*scale.damage), push: SPRING.push, all: true});
  });
}

// ------------------------------------------------------------------ the Mound of the Starved (bosses.mjs: the Gashadokuro)
/**
 * In the Spider-lily Marsh lies the Mound of the Starved (node `gashamound`, a landmark). Hold the action on it
 * at night and the Gashadokuro claws its way out of the bones; by day nothing answers. Once slain it sleeps for
 * `respawn` days. world.gasha {state: 'asleep'|'awake'|'slain', until, boss} is saved and sent to guests.
 */
export const MOUND = Object.freeze({respawn: 3, leash: 18, rise: 3.2});

/** The mound's record, made on first use. */
export function gashaOf(world){
  if(!world.gasha || typeof world.gasha !== 'object') world.gasha = {state: 'asleep', until: 0, boss: null};
  return world.gasha;
}

/** Host, every expedition tick: the mound sleeps again once its time is up, or if its skeleton is gone. */
export function stepMound(world){
  const G = world.gasha; if(!G) return;
  const now = hollowTime(world);
  if(G.state === 'slain' && now >= G.until){G.state = 'asleep'; G.boss = null;}
  if(G.state === 'awake' && !world.enemies.some(e => e.id === G.boss && e.hp > 0)){G.state = 'asleep'; G.boss = null;}
}

/** Someone held the action on the mound (areas.mjs useLandmark). */
export function wakeMound(world, node, p){
  const G = gashaOf(world);
  if(G.state === 'awake'){world.tell(p, 'The Gashadokuro is already awake'); return;}
  if(G.state === 'slain'){world.tell(p, 'The bones lie still. It will rise again in a few nights.'); return;}
  if(phaseOf(world) !== 'night'){world.tell(p, 'The bones only answer in the dark'); return;}
  const a = Math.atan2(p.z-node.z, p.x-node.x)+Math.PI, x = node.x+Math.cos(a)*MOUND.rise, z = node.z+Math.sin(a)*MOUND.rise;
  const e = world.spawnEnemy('gashadokuro', x, z, {home: true, leash: MOUND.leash, tier: REGIONS.higan?.tier ?? 2, elite: false});
  if(!e) return;
  e.aggro = true; e.boss = true; e.home = {x: node.x, z: node.z};
  G.state = 'awake'; G.boss = e.id;
  world.event('bossrise', e.x, e.z, '', {boss: 'gashadokuro'});
  world.event('announce', e.x, e.z, `${p.name} disturbs the Mound of the Starved. The Gashadokuro claws its way out of the bones.`);
}

/** The Gashadokuro fell (areas.mjs areaBossFell). */
export function gashaFell(world){
  const G = gashaOf(world);
  G.state = 'slain'; G.boss = null; G.until = hollowTime(world)+MOUND.respawn*scheduleOf(world).cycle;
}
