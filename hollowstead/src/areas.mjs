// Areas: Frostmere, the Ashen Scar and the Briar Throne (worldgen.mjs places them from the seed).
// Their rules live here; the World calls stepAreas() every expedition tick and useLandmark() when a
// landmark node is used. Also the Heartfire's awakening ladder, which the areas' finds extend.
// Pure simulation: import only content/progression/worldgen/mobs/delve. Never a renderer or the DOM.
//
// world.lair   {state:'asleep'|'awake'|'slain', until, boss}  Mother Briar's throne (saved, sent to guests)
// p.gvx/gvz    a wanderer's slide on Frostmere's ice (engine.mjs, ICE below)
// p.ventT      seconds until the Ashen Scar next erupts under a wanderer

import {NODES, hollowTime, scheduleOf} from './content.mjs?v=harvest-18';
import {REGIONS} from './progression.mjs?v=harvest-18';
import {areasOf} from './worldgen.mjs?v=harvest-18';
import {addBlast} from './blasts.mjs?v=harvest-18';
import {tryDescend} from './delve.mjs?v=harvest-18';

/** The Heartfire's levels: 1-3 as ever, then 4 and 5 for what only the areas give (and, last, a heartstone). */
export const HEARTH_MAX = 5;
const HEARTH_COSTS = Object.freeze([
  null,
  Object.freeze({wood:10, stone:8, ember:4}),
  Object.freeze({wood:15, ore:6, ember:8}),
  Object.freeze({rime:6, emberglass:6, ore:6, ember:10}),
  Object.freeze({rime:10, emberglass:10, ember:14, heartstone:1}),
]);
/** What awakening the Heartfire from `level` to the next costs. */
export function hearthCost(level){return HEARTH_COSTS[Math.max(1, Math.min(HEARTH_COSTS.length-1, level|0))];}

/**
 * Frostmere's ice. `top` is walking speed on it (a little quicker: you glide); `grip` how fast your
 * slide turns toward where you push (per second), `drift` how fast it dies with nothing pushed,
 * `stop` how fast it bleeds away once you step off.
 */
export const ICE = Object.freeze({top:1.12, grip:2.4, drift:.55, stop:9});

/**
 * The Ashen Scar's vents: under every wanderer inside it, the ground splits and erupts every
 * `every[0]`-`every[1]` seconds, telegraphed for `fuse` seconds. It burns creatures too: lure them in.
 */
export const VENTS = Object.freeze({every:[2.2, 3.9], fuse:1.15, radius:1.55, damage:16, lead:.55, near:3.2});

/** Mother Briar's throne: she wakes when someone steps inside her wall, and comes back `respawn` days after she falls. */
export const LAIR = Object.freeze({respawn:3, wake:0, leash:3});

/** The lair record, made on first use. */
export function lairOf(world){
  if(!world.lair || typeof world.lair !== 'object') world.lair = {state: 'asleep', until: 0, boss: null};
  return world.lair;
}

/** Host, every expedition tick (after the night and the roamers). */
export function stepAreas(world, dt, phase){
  if(world.showcase || world.arena || world.dungeon || !world.ambient) return;
  const areas = areasOf(world.seed);
  const scar = areas.find(a => a.id === 'ashscar'), lair = areas.find(a => a.id === 'briarlair');
  for(const p of world.players){
    if(!p.online || p.down || p.ghost) continue;
    if(scar && world.regionOf(p.x, p.z) === 'ashscar') stepVents(world, p, dt);
    else p.ventT = 0;
  }
  if(lair) stepLair(world, lair, dt);
}

function stepVents(world, p, dt){
  if(!(p.ventT > 0)){p.ventT = VENTS.every[0]+world.spawnRng()*(VENTS.every[1]-VENTS.every[0]); return;}
  p.ventT -= dt;
  if(p.ventT > 0) return;
  // Under them, a little ahead of where they are heading, or close beside.
  const rng = world.spawnRng, a = rng()*Math.PI*2, r = rng()*VENTS.near;
  let x = p.x+(p.vx || 0)*VENTS.lead+Math.cos(a)*r*.6, z = p.z+(p.vz || 0)*VENTS.lead+Math.sin(a)*r*.6;
  if(!world.walkable(x, z)){x = p.x; z = p.z;}
  const {scale} = world.mobScale(REGIONS.ashscar.tier);
  addBlast(world, {style: 'vent', shape: 'circle', x, z, radius: VENTS.radius, fuse: VENTS.fuse, damage: Math.round(VENTS.damage*scale.damage), all: true});
}

function stepLair(world, area, dt){
  const L = lairOf(world), now = hollowTime(world);
  if(L.state === 'slain' && now >= L.until){L.state = 'asleep'; L.boss = null; world.event('announce', area.x, area.z, 'Thorns knit over the Briar Throne. Mother Briar sleeps again.');}
  const boss = L.boss ? world.enemies.find(e => e.id === L.boss && e.hp > 0) : null;
  if(L.state === 'awake' && !boss){L.state = 'asleep'; L.boss = null;}
  if(L.state !== 'asleep') return;
  const inside = world.players.some(p => p.online && !p.down && !p.ghost && Math.hypot(p.x-area.x, p.z-area.z) < area.r-LAIR.wake);
  if(!inside) return;
  const throne = world.nodes.find(n => n.type === 'briarthrone');
  const at = throne ? {x: throne.x+area.gx*1.9, z: throne.z+area.gz*1.9} : {x: area.x, z: area.z};
  const e = world.spawnEnemy('briarmother', at.x, at.z, {home: true, leash: area.r+LAIR.leash, tier: REGIONS.briarlair.tier, elite: false});
  if(!e) return;
  e.aggro = true; e.boss = true; e.home = {x: area.x, z: area.z};
  L.state = 'awake'; L.boss = e.id;
  world.event('bossrise', at.x, at.z, '', {boss: 'briarmother'});
  world.event('announce', at.x, at.z, 'The thorns part. Mother Briar wakes on her throne.');
}

/** A boss of the areas fell (called from World.tick). */
export function areaBossFell(world, e){
  if(e.type !== 'briarmother') return;
  const L = lairOf(world);
  L.state = 'slain'; L.boss = null; L.until = hollowTime(world)+LAIR.respawn*scheduleOf(world).cycle;
}

/** A landmark node was used (World.finishHarvest). */
export function useLandmark(world, node, p){
  if(!p) return;
  const kind = NODES[node.type]?.landmark;
  if(kind === 'delve') tryDescend(world, node, p);
}
