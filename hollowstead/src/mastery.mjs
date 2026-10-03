// Weapons on an expedition: mastery by use, and mending at the Heartfire.
//
// Mastery: a kill credits the killer's weapon in hand with points (progression MASTERY); crossing a
// step ranks that weapon type up, which is the same `p.ranks` the arena and the lab use, so damage,
// skill and effects all follow. `p.mastery` is the source of truth and `p.ranks` is rebuilt from it
// on load. The arena, the lab and the showcase never earn mastery.
//
// Named weapons: elders felled with a weapon type in hand are counted too (progression NAMED); enough of
// them and it earns a name of its own (and a fourth refinement slot, refine.mjs). `p.named[itemId]`.
//
// Ascension: past ★5 the mastery points keep coming; every ASCEND.step more readies an ascension, paid
// for at a workbench with Dread sigils and ichor (ascendWeapon). Each one adds a little less damage than
// the last (powerOf), and there is always another. `p.ascend[itemId]`.
//
// Mending: at the Heartfire, a soul ember gives the weapon in hand back part of its condition.
// Host-authoritative like every world rule; the UI reads mendPlan() only to draw the button.
import {ENEMIES, label} from './content.mjs?v=harvest-18';
import {equipmentSlotFor, itemDefinition} from './inventory.mjs?v=harvest-18';
import {inCraftRange} from './contracts.mjs?v=harvest-18';
import {ARENA_GROWTH, MEND, NAMED, ascendCost, ascensionOf, masteryOf, masteryPoints, namedOf} from './progression.mjs?v=harvest-18';
import {carriedWeapons, refineKind} from './refine.mjs?v=harvest-18';

const stars = rank => '★'.repeat(Math.max(1, Math.min(ARENA_GROWTH.maxRank, rank|0)));
const expedition = world => !world?.arena && !world?.showcase;

/** A creature fell to `p`: teach the weapon in hand. */
export function creditKill(world, p, enemy){
  if(!expedition(world) || !p || p.growth === 'arena') return;
  const weapon = p.equipment?.weapon;
  if(!weapon || !(weapon.durability > 0) || equipmentSlotFor(weapon.itemId) !== 'weapon') return;
  const itemId = weapon.itemId, before = masteryOf(p, itemId), ready = ascensionOf(p, itemId).ready;
  (p.mastery ||= {})[itemId] = before.points+masteryPoints(enemy);
  creditElder(world, p, itemId, enemy);
  const after = masteryOf(p, itemId);
  if(after.rank <= before.rank){
    if(!ready && ascensionOf(p, itemId).ready) world.tell(p, `${weaponName(p, itemId)} is ready to ascend. Bring Dread sigils to a workbench`);
    return;
  }
  (p.ranks ||= {})[itemId] = after.rank;
  world.event('rankup', p.x, p.z, `${label(itemId)} ${stars(after.rank)}`, {player: p.id, itemId, rank: after.rank, mastery: true});
  world.tell(p, after.rank >= ARENA_GROWTH.maxRank ? `${label(itemId)} is fully mastered: ${stars(after.rank)}. It can ascend from here` : `${label(itemId)} mastery ${stars(after.rank)}: it hits harder and looks flashier`);
}

// ------------------------------------------------------------------ named weapons

/** How many elders a fallen creature counts for (0 for the rank and file). */
export function elderWorth(enemy){
  if(!enemy) return 0;
  if(enemy.type === 'king') return NAMED.king;
  if(ENEMIES[enemy.type]?.boss) return NAMED.boss;
  if(enemy.warden) return NAMED.warden;
  return enemy.elite ? 1 : 0;
}

const NAME_HEADS = Object.freeze(['Grave', 'Dusk', 'Hollow', 'Ember', 'Thorn', 'Moon', 'Ash', 'Bone', 'Wisp', 'Rime', 'Crow', 'Soul',
  'Night', 'Hush', 'Briar', 'Mourn', 'Gloam', 'Cinder', 'Barrow', 'Pale', 'Vesper', 'Wither', 'Candle', 'Raven']);
/** Name endings by how a weapon fights (refine.mjs refineKind): swung, shooting, or anything stranger. */
const NAME_TAILS = Object.freeze({
  melee: Object.freeze(['bite', 'fang', 'edge', 'reaver', 'song', 'tooth', 'cleaver', 'sorrow', 'kiss', 'thirst']),
  shots: Object.freeze(['call', 'whisper', 'flight', 'sting', 'spite', 'hail', 'wing', 'shriek', 'needle', 'hymn']),
  other: Object.freeze(['heart', 'dirge', 'ward', 'tide', 'breath', 'omen', 'lament', 'hymn', 'vigil', 'chorus']),
});
/** What each kind of foe is called in a weapon's title. */
const FOES = Object.freeze({crawler: 'Briarlings', wraith: 'Wraiths', brute: 'Gravekeepers', bonewalker: 'Bonewalkers', bogling: 'Boglings',
  golem: 'Golems', dreadhound: 'Dreadhounds', king: 'the Hollow King', briarmother: 'Mother Briar', unblinking: 'the Unblinking'});

/** Count an elder (or a boss) toward a weapon type's name; name it when the count is reached. */
function creditElder(world, p, itemId, enemy){
  const worth = elderWorth(enemy);
  if(!worth) return;
  const rec = (p.named ||= {})[itemId] ||= {elders: 0, foes: {}};
  rec.elders = (rec.elders || 0)+worth;
  (rec.foes ||= {})[enemy.type] = (rec.foes[enemy.type] || 0)+worth;
  if(rec.name || rec.elders < NAMED.elders) return;
  nameWeapon(world, p, itemId, rec);
}

/** Give a weapon type its name: two halves from the hollow, and a title from the foes it fell most. */
export function nameWeapon(world, p, itemId, rec = (p.named ||= {})[itemId] ||= {elders: NAMED.elders, foes: {}}){
  const rng = world.rng, kind = refineKind(itemId) || 'other', tails = NAME_TAILS[kind] || NAME_TAILS.other;
  const taken = new Set(Object.values(p.named || {}).map(n => n?.name).filter(Boolean));
  let name = '';
  for(let t = 0; t < 12 && (!name || taken.has(name)); t++) name = NAME_HEADS[Math.floor(rng()*NAME_HEADS.length)]+tails[Math.floor(rng()*tails.length)];
  const [top] = Object.entries(rec.foes || {}).filter(([type]) => FOES[type]).sort((a, b) => b[1]-a[1] || (a[0] < b[0] ? -1 : 1));
  rec.name = name;
  rec.title = top ? `Bane of ${FOES[top[0]]}` : 'Elderbane';
  world.event('named', p.x, p.z, rec.name, {player: p.id, itemId, name: rec.name, title: rec.title});
  world.event('announce', p.x, p.z, `${p.name}'s ${label(itemId)} has earned a name: ${rec.name}, ${rec.title}. It can hold a fourth modifier now`);
  return rec;
}

/** A weapon type as its wanderer knows it: its name once it has one, else what it is. */
export function weaponName(p, itemId){
  const rec = namedOf(p, itemId);
  return rec?.name ? rec.name : label(itemId);
}

/** Named-weapon progress for the HUD and the refine panel: {elders, need, name, title, named}. */
export function namedView(p, itemId){
  const rec = namedOf(p, itemId);
  return {elders: Math.floor(rec?.elders || 0), need: NAMED.elders, name: rec?.name || null, title: rec?.title || null, named: !!rec?.name};
}

// ------------------------------------------------------------------ ascension

/**
 * What the workbench's ascension card shows for one weapon type. `canPay(cost)` and `have` ({sigil, ichor})
 * come from the World. {level, bonus, next (bonus after one more), mastered, progress, ready, cost, ok, reason}
 */
export function ascendView(p, itemId, {have = {}, canPay = () => false} = {}){
  const a = ascensionOf(p, itemId), cost = ascendCost(a.level);
  const next = ascensionOf({...p, ascend: {...(p?.ascend || {}), [itemId]: a.level+1}}, itemId).bonus;
  const reason = !a.mastered ? `Master it to ${stars(ARENA_GROWTH.maxRank)} first`
    : !a.ready ? `${Math.max(0, Math.ceil(a.to-a.points))} more mastery to the next ascension`
    : !canPay(cost) ? `Needs ${cost.sigil} Dread sigil${cost.sigil === 1 ? '' : 's'} and ${cost.ichor} ichor` : '';
  return {...a, next, cost, have: {sigil: have.sigil || 0, ichor: have.ichor || 0}, ok: !reason, reason};
}

/** Host: {type: 'ascendWeapon', stationId, itemId}. A ready, mastered weapon type ascends one level. */
export function ascendWeapon(world, p, cmd){
  const reject = (text, code = 'rejected') => {if(text) world.tell(p, text); return {ok: false, code};};
  if(world.arena || world.showcase) return reject('Weapons ascend on an expedition', 'unavailable');
  const bench = world.buildings.find(b => b.id === cmd?.stationId && b.type === 'bench' && b.hp > 0);
  if(!bench || !inCraftRange(Math.hypot(p.x-bench.x, p.z-bench.z))) return reject('Ascend at a workbench', 'stationRequired');
  const itemId = cmd.itemId;
  if(typeof itemId !== 'string' || equipmentSlotFor(itemId) !== 'weapon' || !carriedWeapons(p).includes(itemId)) return reject('Carry the weapon you want to ascend');
  const a = ascensionOf(p, itemId);
  if(!a.mastered) return reject(`Master ${label(itemId)} to ${stars(ARENA_GROWTH.maxRank)} first`);
  if(!a.ready) return reject(`${weaponName(p, itemId)} needs ${Math.ceil(a.to-a.points)} more mastery to ascend`);
  const cost = ascendCost(a.level);
  if(!world.pay(p, cost)) return reject(`Needs ${cost.sigil} Dread sigil${cost.sigil === 1 ? '' : 's'} and ${cost.ichor} ichor`);
  (p.ascend ||= {})[itemId] = a.level+1;
  const gain = Math.round((ascensionOf(p, itemId).bonus-a.bonus)*1000)/10;
  world.event('weaponascend', p.x, p.z, `${weaponName(p, itemId)} ✦${a.level+1}`, {player: p.id, itemId, level: a.level+1, bx: bench.x, bz: bench.z});
  world.tell(p, `${weaponName(p, itemId)} ascends to ✦${a.level+1}: +${gain}% damage`);
  if((a.level+1)%5 === 0) world.event('announce', p.x, p.z, `${p.name}'s ${weaponName(p, itemId)} ascends to ✦${a.level+1}`);
  world.assertItems?.();
  return {ok: true, code: 'ok'};
}

/** Rebuild expedition ranks from mastery (after a load, or when the steps were retuned). */
export function syncMastery(p){
  if(!p || p.growth === 'arena') return;
  // Keep only well-formed names and ascensions.
  if(p.named && (typeof p.named !== 'object' || Array.isArray(p.named))) delete p.named;
  for(const [itemId, rec] of Object.entries(p.named || {})){
    if(!rec || typeof rec !== 'object' || equipmentSlotFor(itemId) !== 'weapon'){delete p.named[itemId]; continue;}
    rec.elders = Math.max(0, Number(rec.elders) || 0);
    if(!rec.foes || typeof rec.foes !== 'object' || Array.isArray(rec.foes)) rec.foes = {};
    if(typeof rec.name !== 'string' || !rec.name){delete rec.name; delete rec.title;}
  }
  if(p.ascend && (typeof p.ascend !== 'object' || Array.isArray(p.ascend))) delete p.ascend;
  for(const [itemId, level] of Object.entries(p.ascend || {})) if(!(Number.isInteger(level) && level > 0) || equipmentSlotFor(itemId) !== 'weapon') delete p.ascend[itemId];
  if(!p.mastery || typeof p.mastery !== 'object') return;
  const ranks = {};
  for(const [itemId, points] of Object.entries(p.mastery)){
    if(!(Number(points) > 0)){delete p.mastery[itemId]; continue;}
    const {rank} = masteryOf(p, itemId);
    if(rank > 1) ranks[itemId] = rank;
  }
  p.ranks = ranks;
}

/** Mastery of a weapon type for the HUD, or null where mastery does not apply. Past ★5 it carries the ascension too. */
export function masteryView(world, p, itemId){
  if(!expedition(world) || !p || p.growth === 'arena' || !itemId || equipmentSlotFor(itemId) !== 'weapon') return null;
  return {...masteryOf(p, itemId), ascend: ascensionOf(p, itemId), named: namedView(p, itemId)};
}

/** The weapon in hand's condition as a share of its best (null when it does not wear). */
export function conditionOf(stack){
  const max = stack && itemDefinition(stack.itemId)?.maxDurability;
  return max > 0 && typeof stack.durability === 'number' ? Math.max(0, Math.min(1, stack.durability/max)) : null;
}

/** What can be mended: the weapon in hand and the body armour worn. */
const MENDABLE = Object.freeze({weapon: 'weapon', body: 'body'});
/**
 * What mending would do. It takes the more worn of the weapon in hand and the body armour worn (by share of
 * condition); press again for the other. `canPay` says whether the cost is at hand (World.canPay).
 * {itemId, slot, name, share (condition now), gain, boost (gain as a share), ok, reason}; itemId is null
 * when nothing needs mending.
 */
export function mendPlan(p, canPay){
  let pick = null, anyGear = false;
  for(const slot of Object.keys(MENDABLE)){
    const stack = p?.equipment?.[slot], def = stack && itemDefinition(stack.itemId);
    if(!stack || !def?.maxDurability || equipmentSlotFor(stack.itemId) !== slot) continue;
    anyGear = true;
    const max = def.maxDurability, missing = Math.max(0, max-stack.durability);
    if(missing < 1) continue;
    const share = stack.durability/max;
    if(!pick || share < pick.share) pick = {slot, stack, max, missing, share};
  }
  if(!pick){
    const worn = p?.equipment?.weapon || p?.equipment?.body;
    return anyGear ? {itemId: null, name: worn ? label(worn.itemId) : '', ok: false, reason: 'Your gear is in good shape'} : {itemId: null, ok: false, reason: 'Hold a weapon or wear armour to mend it'};
  }
  const {slot, stack, max, missing, share} = pick, name = label(stack.itemId);
  const gain = Math.min(missing, Math.ceil(max*MEND.share)), boost = gain/max;
  if(!canPay) return {itemId: stack.itemId, slot, name, share, gain, boost, ok: false, reason: 'Needs 1 soul ember'};
  return {itemId: stack.itemId, slot, name, share, gain, boost, ok: true, reason: ''};
}

/** Host: mend the weapon in hand or the armour worn (mendPlan picks) at the Heartfire `hearth`. */
export function mendWeapon(world, p, hearth){
  const plan = mendPlan(p, world.canPay(p, MEND.cost));
  if(!plan.ok){world.tell(p, plan.reason); return {ok: false, code: 'rejected'};}
  if(!world.pay(p, MEND.cost)){world.tell(p, 'Needs 1 soul ember'); return {ok: false, code: 'rejected'};}
  const slot = plan.slot || 'weapon', weapon = p.equipment[slot], max = itemDefinition(weapon.itemId).maxDurability;
  p.equipment[slot] = {...weapon, durability: Math.min(max, weapon.durability+plan.gain)};
  if(slot === 'body') p.armourWarned = null; else p.wearWarned = null;
  p.cooldown = .5;
  const share = Math.round(p.equipment[slot].durability/max*100);
  world.event('heal', p.x, p.z, `${plan.name} mended · ${share}%`, {player: p.id});
  world.event('mend', p.x, p.z, '', {player: p.id, itemId: weapon.itemId, hx: hearth.x, hz: hearth.z});
  world.assertItems?.();
  return {ok: true, code: 'ok'};
}

/** After the weapon in hand or the armour worn wore down: a one-time hint when it gets low, and word when it breaks. */
export function warnWear(world, p, before, after, slot = 'weapon'){
  if(!expedition(world) || !after || before?.uid !== after.uid) return;
  const was = conditionOf(before), now = conditionOf(after), field = slot === 'body' ? 'armourWarned' : 'wearWarned';
  if(was == null || now == null) return;
  if(slot === 'body' && was > 0 && now <= 0){world.tell(p, `${label(after.itemId)} is broken and guards nothing. Mend it at the Heartfire with a soul ember`); return;}
  if(!(was > MEND.warnAt) || now > MEND.warnAt || p[field] === after.uid) return;
  p[field] = after.uid;
  world.tell(p, `${label(after.itemId)} is wearing thin. Mend it at the Heartfire with a soul ember`);
}
