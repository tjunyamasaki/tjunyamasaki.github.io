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
// world.saga   {king, briar, eye, peakLevel, peakGear, dread, falls, rekindled}  (saved and sent to guests)

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

/** True on a Vigil world. */
export const isVigil = world => world?.mode === 'vigil';

/** The world's saga record, made on first use. Plain numbers only: it rides in snapshots and saves. */
export function sagaOf(world){
  if(!world) return {king: 0, briar: 0, eye: 0, peakLevel: 1, peakGear: 0, dread: 1, falls: 0, rekindled: 0};
  const s = world.saga && typeof world.saga === 'object' ? world.saga : (world.saga = {});
  for(const key of ['king', 'briar', 'eye', 'falls', 'rekindled', 'peakGear']) if(!Number.isFinite(s[key])) s[key] = 0;
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
  const raw = 1 + v.level*Math.max(0, (s.peakLevel || 1) - 1) + v.gear*(s.peakGear || 0) + v.king*(s.king || 0) + v.boss*((s.briar || 0) + (s.eye || 0));
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
  const s = sagaOf(world), key = type === 'king' ? 'king' : type === 'briarmother' ? 'briar' : type === 'unblinking' ? 'eye' : null;
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
  hearth.level = Math.max(1, (hearth.level || 1) - 1);
  // Awakening adds 300 health a level (World.performUpgrade).
  hearth.maxHp = STRUCTURES.hearth.hp + 300*(hearth.level - 1);
  hearth.hp = Math.round(hearth.maxHp*VIGIL.rekindle);
  hearth.fuel = Math.max(hearth.fuel || 0, VIGIL.rekindleFuel);
  // The World sends the raiders off (it knows which creatures are summoned allies).
  s.falls = (s.falls || 0) + 1; s.rekindled = (s.rekindled || 0) + 1;
  world.event('rekindle', hearth.x, hearth.z, 'The Heartfire gutters… and catches again', {level: hearth.level});
  world.event('announce', hearth.x, hearth.z, 'The Heartfire went out, but its embers caught again. It burns weaker now.');
}

/** Everyone fell on a Vigil: they wake by the fire, the night's raiders gone. Packs stay where they fell. */
export function wakeAtFire(world){
  const s = sagaOf(world);
  for(const p of world.players){
    if(!p.online) continue;
    if(p.down || p.ghost) world.revivePlayer(p);
  }
  s.falls = (s.falls || 0) + 1;
  world.event('announce', 0, 0, 'The dark took you all… You wake by the Heartfire, aching but alive.');
}

/** HUD summary: {dread, level, gear, bosses} or null off a Vigil. */
export function vigilStatus(world){
  if(!isVigil(world)) return null;
  const s = sagaOf(world);
  return {dread: Math.floor(s.dread || 1), exact: s.dread || 1, level: s.peakLevel || 1, gear: s.peakGear || 0, kings: s.king || 0, briar: s.briar || 0, eye: s.eye || 0, falls: s.falls || 0};
}
