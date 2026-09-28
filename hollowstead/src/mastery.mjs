// Weapons on an expedition: mastery by use, and mending at the Heartfire.
//
// Mastery: a kill credits the killer's weapon in hand with points (progression MASTERY); crossing a
// step ranks that weapon type up, which is the same `p.ranks` the arena and the lab use, so damage,
// skill and effects all follow. `p.mastery` is the source of truth and `p.ranks` is rebuilt from it
// on load. The arena, the lab and the showcase never earn mastery.
//
// Mending: at the Heartfire, a soul ember gives the weapon in hand back part of its condition.
// Host-authoritative like every world rule; the UI reads mendPlan() only to draw the button.
import {label} from './content.mjs?v=harvest-18';
import {equipmentSlotFor, itemDefinition} from './inventory.mjs?v=harvest-18';
import {ARENA_GROWTH, MEND, masteryOf, masteryPoints} from './progression.mjs?v=harvest-18';

const stars = rank => '★'.repeat(Math.max(1, Math.min(ARENA_GROWTH.maxRank, rank|0)));
const expedition = world => !world?.arena && !world?.showcase;

/** A creature fell to `p`: teach the weapon in hand. */
export function creditKill(world, p, enemy){
  if(!expedition(world) || !p || p.growth === 'arena') return;
  const weapon = p.equipment?.weapon;
  if(!weapon || !(weapon.durability > 0) || equipmentSlotFor(weapon.itemId) !== 'weapon') return;
  const itemId = weapon.itemId, before = masteryOf(p, itemId);
  (p.mastery ||= {})[itemId] = before.points+masteryPoints(enemy);
  const after = masteryOf(p, itemId);
  if(after.rank <= before.rank) return;
  (p.ranks ||= {})[itemId] = after.rank;
  world.event('rankup', p.x, p.z, `${label(itemId)} ${stars(after.rank)}`, {player: p.id, itemId, rank: after.rank, mastery: true});
  world.tell(p, after.rank >= ARENA_GROWTH.maxRank ? `${label(itemId)} is fully mastered: ${stars(after.rank)}` : `${label(itemId)} mastery ${stars(after.rank)}: it hits harder and looks flashier`);
}

/** Rebuild expedition ranks from mastery (after a load, or when the steps were retuned). */
export function syncMastery(p){
  if(!p || p.growth === 'arena' || !p.mastery || typeof p.mastery !== 'object') return;
  const ranks = {};
  for(const [itemId, points] of Object.entries(p.mastery)){
    if(!(Number(points) > 0)){delete p.mastery[itemId]; continue;}
    const {rank} = masteryOf(p, itemId);
    if(rank > 1) ranks[itemId] = rank;
  }
  p.ranks = ranks;
}

/** Mastery of a weapon type for the HUD, or null where mastery does not apply. */
export function masteryView(world, p, itemId){
  if(!expedition(world) || !p || p.growth === 'arena' || !itemId || equipmentSlotFor(itemId) !== 'weapon') return null;
  return masteryOf(p, itemId);
}

/** The weapon in hand's condition as a share of its best (null when it does not wear). */
export function conditionOf(stack){
  const max = stack && itemDefinition(stack.itemId)?.maxDurability;
  return max > 0 && typeof stack.durability === 'number' ? Math.max(0, Math.min(1, stack.durability/max)) : null;
}

/**
 * What mending the weapon in hand would do. `canPay` says whether the cost is at hand (World.canPay).
 * {itemId, name, share (condition now), gain, boost (gain as a share), ok, reason}; itemId is null
 * when nothing needs mending.
 */
export function mendPlan(p, canPay){
  const weapon = p?.equipment?.weapon, def = weapon && itemDefinition(weapon.itemId);
  if(!weapon || !def?.maxDurability || equipmentSlotFor(weapon.itemId) !== 'weapon') return {itemId: null, ok: false, reason: 'Hold a weapon to mend it'};
  const max = def.maxDurability, missing = Math.max(0, max-weapon.durability);
  const name = label(weapon.itemId), share = weapon.durability/max;
  if(missing < 1) return {itemId: null, name, share, ok: false, reason: `${name} is in good shape`};
  const gain = Math.min(missing, Math.ceil(max*MEND.share)), boost = gain/max;
  if(!canPay) return {itemId: weapon.itemId, name, share, gain, boost, ok: false, reason: 'Needs 1 soul ember'};
  return {itemId: weapon.itemId, name, share, gain, boost, ok: true, reason: ''};
}

/** Host: mend the weapon in hand at the Heartfire `hearth`. */
export function mendWeapon(world, p, hearth){
  const plan = mendPlan(p, world.canPay(p, MEND.cost));
  if(!plan.ok){world.tell(p, plan.reason); return {ok: false, code: 'rejected'};}
  if(!world.pay(p, MEND.cost)){world.tell(p, 'Needs 1 soul ember'); return {ok: false, code: 'rejected'};}
  const weapon = p.equipment.weapon, max = itemDefinition(weapon.itemId).maxDurability;
  p.equipment.weapon = {...weapon, durability: Math.min(max, weapon.durability+plan.gain)};
  p.wearWarned = null;
  p.cooldown = .5;
  const share = Math.round(p.equipment.weapon.durability/max*100);
  world.event('heal', p.x, p.z, `${plan.name} mended · ${share}%`, {player: p.id});
  world.event('mend', p.x, p.z, '', {player: p.id, itemId: weapon.itemId, hx: hearth.x, hz: hearth.z});
  world.assertItems?.();
  return {ok: true, code: 'ok'};
}

/** After the weapon in hand wore down: a one-time hint when it gets low. */
export function warnWear(world, p, before, after){
  if(!expedition(world) || !after || before?.uid !== after.uid) return;
  const was = conditionOf(before), now = conditionOf(after);
  if(was == null || now == null || !(was > MEND.warnAt) || now > MEND.warnAt || p.wearWarned === after.uid) return;
  p.wearWarned = after.uid;
  world.tell(p, `${label(after.itemId)} is wearing thin. Mend it at the Heartfire with a soul ember`);
}
