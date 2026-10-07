// The Vigil: one save kept for the long haul. Days and nights run longer (content.mjs CLOCKS.vigil),
// and the hollow answers how strong the party has grown instead of how many days went by: its
// **Dread**. A lost Heartfire or a wiped party is a setback, never the end of the save.
// Every 10 Dread the hollow enters a new Dread Age (ages.mjs), and changes for good.
//
// Also kept here, for every expedition: the saga (`world.saga`), the record of what the party has
// done that the world remembers: bosses slain, the highest level and the best gear anyone has held.
// Pure simulation: import only content/progression. Never engine.mjs, a renderer or the DOM.
//
// world.mode   'vigil' on a Vigil world; absent on an ordinary expedition (and arena, lab, dungeon runs)
// world.saga   {king, briar, eye, peakLevel, peakGear, dread, falls, rekindled, hearth}  (saved and sent to guests)
//
// Home. A Vigil starts with no Heartfire: a Glimmerstone stands in the middle of the hollow instead. The
// Heartfire is a camp object built on the grid (homestead.mjs), anywhere, one at a time. A wanderer who
// chooses it as home (`p.home`, its id) wakes beside it; everyone else wakes in the middle. Night waves
// hunt the wanderers wherever they are (night.mjs); only a rare siege moon marches on the Heartfire.
// Taken down, the Heartfire's awakening is kept in `saga.hearth`, and a new one is lit at that level.
// A Homeward scroll (WARP) carries its reader to the Heartfire.

import {STRUCTURES, dayOf} from './content.mjs?v=harvest-18';
import {rarityRank} from './progression.mjs?v=harvest-18';

/**
 * How Dread is made. Each part only ever grows (peaks are kept), so dropping your gear before a night
 * does not soften it. A level is worth about half a day of the old clock, the best gear ever held about
 * a day and a quarter per rarity step, and each boss slain sends the hollow into a fury.
 *   dread = 1 + level*(peakLevel-1) + gear*peakGear + king*kings + boss*(briar+eye)
 */
export const VIGIL = Object.freeze({
  level: .45, gear: 1.25, king: 1, boss: 2.5, max: 60,
  /** A Heartfire that goes out is rekindled from its embers: this share of its health, one level lower. */
  rekindle: .4, rekindleFuel: 60,
  /** A wiped party wakes by the fire after this long (seconds of everyone down with no charm left). */
  wake: 6,
  /** How often the peaks are refreshed (seconds). */
  every: 1,
});

/**
 * The Homeward scroll: `cast` seconds standing still (within `still` of where you began, unhurt), then
 * you stand beside your Heartfire. Not underground, not in the arena.
 */
export const WARP = Object.freeze({cast: 1.6, still: .8});
/** Where wanderers without a home wake: the Glimmerstone in the middle of the hollow. */
export const CENTER = Object.freeze({x: 0, z: 0});

/** True on a Vigil world. */
export const isVigil = world => world?.mode === 'vigil';

/** The world's saga record, made on first use. Plain numbers only: it rides in snapshots and saves. */
export function sagaOf(world){
  if(!world) return {king: 0, briar: 0, eye: 0, peakLevel: 1, peakGear: 0, dread: 1, falls: 0, rekindled: 0};
  const s = world.saga && typeof world.saga === 'object' ? world.saga : (world.saga = {});
  for(const key of ['king', 'briar', 'eye', 'gasha', 'falls', 'rekindled', 'peakGear']) if(!Number.isFinite(s[key])) s[key] = 0;
  if(!Number.isFinite(s.peakLevel)) s.peakLevel = 1;
  if(!Number.isFinite(s.dread)) s.dread = 1;
  return s;
}

/** Best rarity a wanderer is holding right now: the weapons in hand and on the hotbar, and worn armour. */
export function gearRank(p){
  let best = 0;
  const consider = itemId => {if(itemId){const r = rarityRank(itemId); if(r > best) best = r;}};
  consider(p?.equipment?.weapon?.itemId);
  consider(p?.equipment?.body?.itemId);
  for(const entry of p?.hotbar || []) consider(typeof entry === 'string' ? entry : entry?.itemId);
  return best;
}

/** Dread from a saga record. */
export function dreadFrom(s){
  const v = VIGIL;
  const raw = 1 + v.level*Math.max(0, (s.peakLevel || 1) - 1) + v.gear*(s.peakGear || 0) + v.king*(s.king || 0) + v.boss*((s.briar || 0) + (s.eye || 0) + (s.gasha || 0));
  return Math.min(v.max, Math.round(raw*10)/10);
}

/**
 * How hard the hollow hits, as a "day" for the difficulty curve (progression.mjs enemyScale,
 * waveSize, nightRoster, the hunters in night.mjs). An ordinary expedition grows with the days;
 * a Vigil grows with its Dread.
 */
export function threatOf(world){
  if(isVigil(world)) return Math.max(1, sagaOf(world).dread || 1);
  return dayOf(world);
}

/** Host, every tick of an expedition (not the arena or a standalone dungeon run): keeps the peaks. */
export function stepSaga(world, dt){
  const s = sagaOf(world);
  if(isVigil(world) && !s.homed) settleHome(world);
  s.t = (s.t || 0) - dt;
  if(s.t > 0) return;
  s.t = VIGIL.every;
  for(const p of world.players){
    if(!p.online) continue;
    if((p.level || 1) > s.peakLevel) s.peakLevel = p.level || 1;
    const g = gearRank(p); if(g > s.peakGear) s.peakGear = g;
  }
  const before = Math.floor(s.dread || 1);
  s.dread = dreadFrom(s);
  if(isVigil(world) && Math.floor(s.dread) > before && before >= 1 && !world.showcase)
    world.event('dread', 0, 0, `The hollow stirs · Dread ${Math.floor(s.dread)}`, {dread: s.dread});
}

/** A boss fell: the saga remembers. Returns how many times this kind has now fallen. */
export function noteBossKill(world, type){
  const s = sagaOf(world), key = type === 'king' ? 'king' : type === 'briarmother' ? 'briar' : type === 'unblinking' ? 'eye' : type === 'gashadokuro' ? 'gasha' : null;
  if(!key) return 0;
  s[key] = (s[key] || 0) + 1;
  s.dread = dreadFrom(s);
  return s[key];
}

/**
 * The Heartfire went out on a Vigil. Instead of ending the save it is rekindled from its embers,
 * weaker and a level lower; whatever was clawing at it is sated and slinks off.
 */
export function rekindle(world, hearth){
  const s = sagaOf(world);
  // A siege that breaks the fire ends the siege. Its awakening is never lost; only its strength.
  hearth.maxHp = hearthHp(hearth.level);
  hearth.hp = Math.round(hearth.maxHp*VIGIL.rekindle);
  hearth.fuel = Math.max(hearth.fuel || 0, VIGIL.rekindleFuel);
  // The World sends the raiders off (it knows which creatures are summoned allies).
  s.falls = (s.falls || 0) + 1; s.rekindled = (s.rekindled || 0) + 1;
  world.event('rekindle', hearth.x, hearth.z, 'The Heartfire gutters… and catches again', {level: hearth.level});
  world.event('announce', hearth.x, hearth.z, 'The Heartfire went out, but its embers caught again. The siege is broken.');
}

/** Awakening adds 300 health a level (World.performUpgrade). */
const hearthHp = level => STRUCTURES.hearth.hp + 300*Math.max(0, (level || 1) - 1);

/** Why a Heartfire cannot be built here now, or ''. On the Vigil (and the Homestead) only one burns at a time. */
export function hearthReason(world){
  return world.buildings.some(b => b.type === 'hearth' && b.hp > 0) ? 'Only one Heartfire can burn' : '';
}
/** A new Heartfire (homestead.mjs) is lit at the awakening the last one reached. */
export function kindleHearth(world, b){
  if(!isVigil(world)) return;
  b.level = Math.max(1, sagaOf(world).hearth || 1);
  b.hp = b.maxHp = hearthHp(b.level);
}
/** A Heartfire taken down keeps its awakening for the next one. */
export function bankHearth(world, b){
  if(!isVigil(world) || !b) return;
  const s = sagaOf(world);
  s.hearth = Math.max(s.hearth || 1, b.level || 1);
}

/** The Heartfire a wanderer has made home, if it still burns. */
export function homeOf(world, p){
  if(!p?.home) return null;
  return world.buildings.find(b => b.type === 'hearth' && b.id === p.home && b.hp > 0) || null;
}
/** The Vigil's one Heartfire, if any. */
export const hearthOf = world => world.buildings.find(b => b.type === 'hearth' && b.hp > 0) || null;

/** Open ground near (x, z): the spot itself, else the nearest of a few around it. */
function openNear(world, x, z){
  const obstacles = typeof world.obstacles === 'function' && typeof world.blockedAt === 'function' ? world.obstacles() : null;
  for(const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [2, 2], [-2, 2]]){
    const px = x + dx*.9, pz = z + dz*.9;
    if(typeof world.walkable === 'function' && !world.walkable(px, pz)) continue;
    if(obstacles && world.blockedAt(px, pz, obstacles)) continue;
    return {x: px, z: pz};
  }
  return {x, z};
}
/** Just in front of a Heartfire (its sprite stands on the back of its cells). */
export const besideHearth = (world, hearth) => openNear(world, hearth.x + .3, hearth.z + 1.9);
/** Where a wanderer wakes on a Vigil: beside their home Heartfire, else by the Glimmerstone in the middle. */
export function wakeSpot(world, p){
  const home = homeOf(world, p);
  if(home) return besideHearth(world, home);
  const k = Math.max(0, world.players.indexOf(p));
  return openNear(world, CENTER.x + 1.6 + (k % 2)*.8, CENTER.z + 1.8 + Math.floor(k/2)*.8);
}

/**
 * Older Vigils began with the Heartfire in the middle, off the grid. It stays where it is (camps were
 * built round it), but it gets cells of its own so it can be taken down and moved like a new one,
 * and everyone who already lived by it keeps it as home.
 */
export function settleHome(world){
  if(!isVigil(world) || world.dungeon) return;
  const s = sagaOf(world);
  if(s.homed) return;
  s.homed = 1;
  const old = world.buildings.find(b => b.type === 'hearth' && !b.foot);
  if(!old) return;
  const i = Math.floor(old.x/1.5 - .5), j = Math.floor(old.z/1.5 - .5);
  old.foot = {i, j, w: 2, h: 2};
  if(!(old.scale > 0)) old.scale = 1;
  for(const p of world.players) if(!p.home) p.home = old.id;
}

/** Everyone fell on a Vigil: they wake at home (or in the middle), the night's raiders gone. Packs stay where they fell. */
export function wakeAtFire(world){
  const s = sagaOf(world);
  let home = false;
  for(const p of world.players){
    if(!p.online) continue;
    if(p.down || p.ghost){world.revivePlayer(p); home ||= !!homeOf(world, p);}
  }
  s.falls = (s.falls || 0) + 1;
  world.event('announce', 0, 0, home ? 'The dark took you all… You wake by the Heartfire, aching but alive.' : 'The dark took you all… You wake by the Glimmerstone, aching but alive.');
}

/** HUD summary: {dread, level, gear, bosses} or null off a Vigil. */
export function vigilStatus(world){
  if(!isVigil(world)) return null;
  const s = sagaOf(world);
  return {dread: Math.floor(s.dread || 1), exact: s.dread || 1, level: s.peakLevel || 1, gear: s.peakGear || 0, kings: s.king || 0, briar: s.briar || 0, eye: s.eye || 0, falls: s.falls || 0};
}
