// Weapon refinement: up to three rolled modifiers on each weapon type (progression REFINE), bought at
// a workbench with Dread ichor, which only creatures drop. This file rolls them (host) and holds the
// few hooks a fight reads them through:
//   refineHit     every hit a wanderer (or their summon) lands: Bane, critical hits (Keen, Cruel), Thirsting
//   refinedStyle  a crafted weapon's attack style: Swift, Long (melee reach), Split (counts and extra shots)
//   splitMagic    Split on the magic weapons that shoot: copies the cast's new shot at the next foe
// Honed lives in powerOf (progression.mjs), Tempered in World.wearEquipped, Fervent in useSkill.
// Host-authoritative like every world rule; the UI reads refineView() only to draw the panel.
import {trinketHit} from './trinkets.mjs?v=harvest-18';
import {label} from './content.mjs?v=harvest-18';
import {equipmentSlotFor, inCraftRange} from './contracts.mjs?v=harvest-18';
import {RARITIES, REFINE, maxHealth, rarityOf, refineStat, weaponStyle} from './progression.mjs?v=harvest-18';
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';

export const REFINE_CURRENCY = 'ichor';
const MELEE_STYLES = new Set(['melee', 'combo', 'lash', 'reap', 'nova']);
/** What one more shot is called on each weapon that shoots. Only these roll Split. */
export const SHOTS = Object.freeze({
  recurve: ['arrow', 'arrows'], bonebow: ['arrow', 'arrows'], crookstaff: ['bolt', 'bolts'], skullstaff: ['bolt', 'bolts'],
  wisplantern: ['wisp', 'wisps'], crowtotem: ['crow', 'crows'], stormrod: ['leap', 'leaps'], starfall: ['star', 'stars'],
  jacklantern: ['sentry', 'sentries'],
  'cinder-staff': ['firebolt', 'firebolts'], plaguebeak: ['vial', 'vials'], 'kitsune-lantern': ['foxfire', 'foxfires'],
  'widows-needle': ['needle', 'needles'],
});
// The widow's needle keeps its own shot clock, so a faster swing would change nothing.
const NO_SWIFT = new Set(['widows-needle']);
// The censer hurts only through its freezing fog, which never lands a blow to crit, bane or drink from.
const NO_BLOWS = new Set(['censer']);
const BLOW_MODS = new Set(['keen', 'cruel', 'thirst', 'bane']);
const SPLIT_LISTS = ['magicBolts', 'magicDarts'];
const SPLIT_REACH = 13;

const dist = (a, b) => Math.hypot((a.x||0)-(b.x||0), (a.z||0)-(b.z||0));
export const isRefinable = itemId => equipmentSlotFor(itemId) === 'weapon';
/** 'shots' for weapons that shoot, 'melee' for the swung ones, '' for the rest. */
export function refineKind(itemId){
  if(Object.hasOwn(SHOTS, itemId)) return 'shots';
  return MELEE_STYLES.has(weaponStyle(itemId)?.style) ? 'melee' : '';
}
/** Can `key` roll on this weapon at rarity index `tier`, beside the modifiers `others`? */
export function modAllowed(key, itemId, tier, others = null){
  const mod = REFINE.mods[key];
  if(!mod || tier < (mod.min || 0)) return false;
  if(mod.only && mod.only !== refineKind(itemId)) return false;
  if(key === 'swift' && NO_SWIFT.has(itemId)) return false;
  if(BLOW_MODS.has(key) && NO_BLOWS.has(itemId)) return false;
  if(mod.needs && others && !others.includes(mod.needs)) return false;
  return true;
}
const tierOf = entry => Math.max(0, Math.min(RARITIES.length-1, entry?.tier|0));

/** One modifier line, e.g. "+30% critical chance" or "+1 arrow". */
export function modText(key, tier, itemId){
  const mod = REFINE.mods[key]; if(!mod) return '';
  const v = mod.values[tier] || 0, noun = SHOTS[itemId] || ['shot', 'shots'];
  return mod.text.replace('{v}', String(v)).replace('{shot}', v === 1 ? noun[0] : noun[1]);
}
/** A wanderer's modifiers on a weapon type: [{mod, tier}], at most REFINE.slots. */
export function refinesOf(p, itemId){
  const list = p?.refine?.[itemId];
  return Array.isArray(list) ? list : [];
}
/** Short lines for tooltips: "Keen (legendary): +30% critical chance". */
export function refineLines(p, itemId){
  return refinesOf(p, itemId).map(entry => `${REFINE.mods[entry.mod]?.name || entry.mod} · ${modText(entry.mod, tierOf(entry), itemId)}`);
}
/** Ichor to fill slot `slot` (0-based), or to reroll a filled one. */
export function refineCost(itemId, slot, reroll = false){
  const base = REFINE.cost[rarityOf(itemId)] || REFINE.cost.common;
  return {[REFINE_CURRENCY]: reroll ? base*REFINE.rerollCost : base*(slot+1)};
}
/** Weapon types a wanderer carries (in hand first, then the pack), for the refine panel. */
export function carriedWeapons(p){
  const ids = [];
  const add = stack => {if(stack && isRefinable(stack.itemId) && !ids.includes(stack.itemId)) ids.push(stack.itemId);};
  add(p?.equipment?.weapon);
  for(const uid of p?.hotbar || []) add((p.inventory?.slots || []).find(stack => stack?.uid === uid));
  for(const stack of p?.inventory?.slots || []) add(stack);
  return ids;
}

/**
 * What the refine panel shows for one weapon type. `canPay(cost)` and `have` come from the World.
 * {itemId, name, rarity, kind, have, slots: [{index, mod, tier, rarity, name, text} | null], fill, reroll}
 * `fill` is the next empty slot ({slot, cost, ok}) or null when all are rolled; `reroll` is the
 * cost and whether it is at hand.
 */
export function refineView(p, itemId, {have = 0, canPay = () => false} = {}){
  const list = refinesOf(p, itemId);
  const slots = Array.from({length: REFINE.slots}, (_, index) => {
    const entry = list[index]; if(!entry || !REFINE.mods[entry.mod]) return null;
    const tier = tierOf(entry);
    return {index, mod: entry.mod, tier, rarity: RARITIES[tier], name: REFINE.mods[entry.mod].name, text: modText(entry.mod, tier, itemId)};
  });
  const open = list.length < REFINE.slots ? list.length : -1;
  const fillCost = open >= 0 ? refineCost(itemId, open) : null, rerollCost = refineCost(itemId, 0, true);
  return {
    itemId, name: label(itemId), rarity: rarityOf(itemId), kind: refineKind(itemId), have,
    slots,
    fill: fillCost ? {slot: open, cost: fillCost[REFINE_CURRENCY], ok: !!canPay(fillCost)} : null,
    reroll: {cost: rerollCost[REFINE_CURRENCY], ok: !!canPay(rerollCost)},
  };
}
/** Odds of each rarity per roll, in percent (the panel's footnote). */
export function refineOdds(){
  const total = REFINE.weights.reduce((a, b) => a+b, 0);
  return REFINE.weights.map(w => Math.round(w/total*1000)/10);
}

/** Roll one modifier for `itemId`, never one of `taken`. */
export function rollModifier(rng, itemId, taken = []){
  const total = REFINE.weights.reduce((a, b) => a+b, 0);
  let r = rng()*total, tier = 0;
  for(; tier < REFINE.weights.length-1; tier++){r -= REFINE.weights[tier]; if(r < 0) break;}
  let pool = Object.keys(REFINE.mods).filter(key => !taken.includes(key) && modAllowed(key, itemId, tier, taken));
  if(!pool.length) pool = Object.keys(REFINE.mods).filter(key => !taken.includes(key) && modAllowed(key, itemId, RARITIES.length-1, taken));
  const weight = key => REFINE.mods[key].weight || 1;
  let pick = rng()*pool.reduce((sum, key) => sum+weight(key), 0), mod = pool[pool.length-1];
  for(const key of pool){pick -= weight(key); if(pick < 0){mod = key; break;}}
  return {mod, tier};
}

/** Keep only well-formed refinements (after a load). */
export function sanitizeRefine(p){
  if(!p) return;
  if(!p.refine || typeof p.refine !== 'object' || Array.isArray(p.refine)){delete p.refine; return;}
  for(const [itemId, list] of Object.entries(p.refine)){
    const clean = Array.isArray(list) && isRefinable(itemId)
      ? list.filter(entry => entry && Object.hasOwn(REFINE.mods, entry.mod) && Number.isInteger(entry.tier) && entry.tier >= 0 && entry.tier < RARITIES.length).slice(0, REFINE.slots)
      : [];
    if(clean.length) p.refine[itemId] = clean.map(entry => ({mod: entry.mod, tier: entry.tier}));
    else delete p.refine[itemId];
  }
}

/**
 * Host: {type: 'refine', stationId, itemId, slot}. Slot n equal to the number already rolled fills
 * the next one; a filled slot is rerolled (it may come back as anything the other two are not).
 */
export function refineWeapon(world, p, cmd){
  const reject = (text, code = 'rejected') => {if(text) world.tell(p, text); return {ok: false, code};};
  if(world.arena || world.showcase) return reject('Weapons are refined on an expedition', 'unavailable');
  const bench = world.buildings.find(b => b.id === cmd?.stationId && b.type === 'bench' && b.hp > 0);
  if(!bench || !inCraftRange(dist(p, bench))) return reject('Refine at a workbench', 'stationRequired');
  const itemId = cmd.itemId;
  if(typeof itemId !== 'string' || !isRefinable(itemId) || !carriedWeapons(p).includes(itemId)) return reject('Carry the weapon you want to refine');
  const list = refinesOf(p, itemId), slot = cmd.slot;
  if(!Number.isInteger(slot) || slot < 0 || slot >= REFINE.slots || slot > list.length) return reject('', 'invalidCommand');
  const reroll = slot < list.length, cost = refineCost(itemId, slot, reroll);
  if(!world.pay(p, cost)) return reject(`Needs ${cost[REFINE_CURRENCY]} ${label(REFINE_CURRENCY).toLowerCase()}`);
  const taken = list.filter((_, index) => index !== slot).map(entry => entry.mod);
  const rolled = rollModifier(world.rng, itemId, taken);
  const next = list.slice(); next[slot] = rolled;
  (p.refine ||= {})[itemId] = next;
  const rarity = RARITIES[rolled.tier], name = REFINE.mods[rolled.mod].name, text = modText(rolled.mod, rolled.tier, itemId);
  world.event('refine', p.x, p.z, `${name} · ${text}`, {player: p.id, itemId, rarity, tier: rolled.tier, slot, bx: bench.x, bz: bench.z});
  if(rolled.tier >= 3) world.event('announce', p.x, p.z, `${p.name}'s ${label(itemId)} is ${rarity}: ${name}, ${text}`);
  world.assertItems?.();
  return {ok: true, code: 'ok'};
}

// ------------------------------------------------------------------ in a fight
function ownerOf(world, owner){
  if(owner && typeof owner === 'object') return owner;
  return typeof owner === 'string' ? world.player?.(owner) || null : null;
}
/**
 * A hit by `owner` (a wanderer or their id) on `enemy`, before it lands. Returns the amount after
 * Bane and a critical roll, and heals the wanderer through Thirsting. Unrefined wanderers pass
 * straight through without touching the random stream.
 */
export function refineHit(world, owner, enemy, amount){
  const p = ownerOf(world, owner);
  if(!p || !(amount > 0)) return {amount, crit: false};
  // Trinkets (trinkets.mjs) have their say after the refinement: grave chalk, the bell, the tinder pouch.
  if(!p.refine){const t = trinketHit(world, p, enemy, amount, false); return {amount: t.amount, crit: t.crit};}
  let out = amount, crit = false;
  const bane = refineStat(p, 'bane');
  if(bane > 0 && (enemy?.elite || enemy?.type === 'king')) out *= 1+bane;
  const keen = refineStat(p, 'keen');
  if(keen > 0 && world.rng() < keen){crit = true; out *= REFINE.crit+refineStat(p, 'cruel');}
  const thirst = refineStat(p, 'thirst');
  const t = trinketHit(world, p, enemy, out, crit);
  out = t.amount; crit = t.crit;
  if(thirst > 0 && p.hp > 0 && !p.down && !p.ghost) p.hp = Math.min(maxHealth(p), p.hp+Math.min(REFINE.leechCap, out*thirst));
  return {amount: out, crit};
}

/** A crafted weapon's attack style with the wanderer's refinement folded in (a copy; `style` is frozen). */
export function refinedStyle(style, p, itemId){
  if(!style || !p?.refine?.[itemId] || !(p.equipment?.weapon?.durability > 0) || p.equipment.weapon.itemId !== itemId) return style;
  const out = {...style};
  const reach = refineStat(p, 'reach');
  if(reach > 0 && MELEE_STYLES.has(style.style) && style.range > 0) out.range = style.range*(1+reach);
  const swift = refineStat(p, 'swift');
  if(swift > 0 && style.cooldown > 0) out.cooldown = style.cooldown/(1+swift);
  const split = refineStat(p, 'split');
  if(split > 0){
    if(style.style === 'wisps' || style.style === 'crows') out.count = (style.count || 1)+split;
    if(style.style === 'crows' || style.style === 'sentry') out.cap = (style.cap || 1)+split;
    if(style.style === 'chain') out.jumps = (style.jumps || 0)+split;
    if(['arrow', 'bolt', 'meteor'].includes(style.style)) out.extra = split;   // World.attack and ARSENAL.meteor fire these
  }
  return out;
}
/** Living foes near `p`, nearest first, skipping `skip` ids: where extra shots go. */
export function splitMarks(world, p, skip = [], reach = SPLIT_REACH){
  return world.enemies.filter(e => e.hp > 0 && !isMagicAlly(e) && Number.isFinite(e.x) && !skip.includes(e.id) && dist(e, p) <= reach)
    .sort((a, b) => dist(a, p)-dist(b, p));
}

/** Before a magic cast: the ids already in the shot lists (null when Split does not apply). */
export function splitBefore(world, p){
  const itemId = p?.equipment?.weapon?.itemId;
  if(!Object.hasOwn(SHOTS, itemId) || !(refineStat(p, 'split') > 0)) return null;
  const ids = new Set();
  for(const name of SPLIT_LISTS) for(const entry of world[name] || []) if(entry?.id != null) ids.add(entry.id);
  return ids;
}
/**
 * After a magic cast: copy its first new shot once per point of Split, each at the next foe (the
 * same foe when there is only one), fanned and a beat later. A single shot's copies carry
 * REFINE.splitShare of its damage; a volley's (the kitsune) are one more whole foxfire each.
 */
export function splitMagic(world, p, before){
  if(!before) return;
  const n = refineStat(p, 'split');
  const fresh = [];
  for(const name of SPLIT_LISTS) for(const entry of world[name] || []) if(entry && entry.ownerId === p.id && !before.has(entry.id)) fresh.push([name, entry]);
  if(!fresh.length || !(n > 0)) return;
  const [name, first] = fresh[0];
  const share = fresh.length > 1 ? 1 : REFINE.splitShare;
  const marks = splitMarks(world, p, first.targetId != null ? [first.targetId] : []);
  const main = first.targetId != null ? world.enemies.find(e => e.id === first.targetId && e.hp > 0) : null;
  for(let i = 0; i < n; i++){
    const copy = structuredClone(first);
    copy.id = world.nextId('split');
    if(Number.isFinite(copy.damage)) copy.damage *= share;
    if(Number.isFinite(copy.power)) copy.power *= share;
    if(Number.isFinite(copy.delay)) copy.delay += .08*(i+1);
    aimCopy(copy, p, marks[i] || main || null, (i%2 ? -1 : 1)*.24*(1+(i>>1)));
    world[name].push(copy);
  }
}
/** Point a copied shot at `foe` (or turn it by `turn` radians when there is none). */
function aimCopy(copy, p, foe, turn){
  let ux, uz;
  if(foe){const d = Math.max(.05, dist(foe, p)); ux = (foe.x-p.x)/d; uz = (foe.z-p.z)/d;}
  else{
    const bx = Number.isFinite(copy.vx) ? copy.vx : copy.dx || 0, bz = Number.isFinite(copy.vz) ? copy.vz : copy.dz || 1;
    const a = Math.atan2(bz, bx)+turn; ux = Math.cos(a); uz = Math.sin(a);
  }
  if(Number.isFinite(copy.vx) && Number.isFinite(copy.vz)){const s = Math.hypot(copy.vx, copy.vz); copy.vx = ux*s; copy.vz = uz*s;}
  if(Number.isFinite(copy.dx) && Number.isFinite(copy.dz)){copy.dx = ux; copy.dz = uz;}
  if(Number.isFinite(copy.aim)) copy.aim = Math.atan2(uz, ux);
  // A shot spawned ahead of the caster keeps its lead along the new line.
  const ahead = Math.hypot((copy.x||0)-p.x, (copy.z||0)-p.z);
  if(ahead > .05 && !Number.isFinite(copy.orbitX)){copy.x = p.x+ux*ahead; copy.z = p.z+uz*ahead;}
  if(Number.isFinite(copy.x0) && Number.isFinite(copy.z0)){copy.x0 = copy.x; copy.z0 = copy.z;}
  if('targetId' in copy) copy.targetId = foe?.id ?? null;
  if('pinAt' in copy) copy.pinAt = foe ? dist(foe, p) : null;           // the widow's needle pins where it meets its mark
  if(Number.isFinite(copy.tx) && Number.isFinite(copy.tz)){                 // a lobbed vial lands on its mark
    const reach = Math.hypot(copy.tx-p.x, copy.tz-p.z);
    if(foe){copy.tx = foe.x; copy.tz = foe.z;}
    else{copy.tx = p.x+ux*reach; copy.tz = p.z+uz*reach;}
  }
}
