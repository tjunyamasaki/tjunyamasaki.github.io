// Refinement: up to three modifiers on each weapon type and each body armour (progression REFINE, the
// table itself in refine-mods.mjs). They are rolled at a workbench with Dread ichor, which only
// creatures drop, or written there from a modifier book found as loot. This file rolls and writes them
// (host) and holds the hooks a fight reads them through:
//   refineHit     every blow a wanderer (or their summon) lands: Bane, Relentless, Vengeful, crits
//                 (Keen, Cruel), Thirsting, Culling, and the procs Arcing and Shattering
//   refinedStyle  a crafted weapon's attack style: Swift, Long (melee reach), Split (counts and extra shots)
//   splitMagic    Split on the magic weapons that shoot: copies the cast's new shot at the next foe
//   shotMods / shotHit / shotEnd / shotSteer
//                 a bow's or staff's arrows and bolts: Forking, Ricochet, Shrapnel, Returning, Seeking
//   refineSwing   a swung weapon's swing: Crescent (a cutting wave), Echoing, Aftershock
//   refineKill    a foe the wanderer slew: Volatile, Haunting
//   refineHurt / refineDodge / stepRefine
//                 body armour: Bulwark, Retribution, Vengeful, Slipstream, Stormskin, Second wind
// Honed lives in powerOf and Vital in maxHealth (progression.mjs), Tempered in World.wearEquipped,
// Fervent in useSkill, Fleet in World.speedFactor.
// Host-authoritative like every world rule; the UI reads refineView() only to draw the panel.
import {trinketHit} from './trinkets.mjs?v=harvest-18';
import {ENEMIES, EQUIPMENT, label} from './content.mjs?v=harvest-18';
import {equipmentSlotFor, inCraftRange} from './contracts.mjs?v=harvest-18';
import {DASH, NAMED, RARITIES, REFINE, armourStat, maxHealth, namedOf, powerOf, rarityOf, refineSlots, refineStat, weaponStyle} from './progression.mjs?v=harvest-18';
import {isMagicAlly, magicItems} from './magic/registry.mjs?v=harvest-18';
import {bookOf, isBook} from './refine-mods.mjs?v=harvest-18';

export const REFINE_CURRENCY = 'ichor';
const MELEE_STYLES = new Set(['melee', 'combo', 'lash', 'reap', 'nova']);
/** Weapons whose attacks are the engine's own arrows and bolts: what Forking, Ricochet and friends ride on. */
const ARROW_STYLES = new Set(['arrow', 'bolt']);
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
const BLOW_MODS = new Set(['keen', 'cruel', 'thirst', 'bane', 'arc', 'shatter', 'focus', 'cull']);
const SPLIT_LISTS = ['magicBolts', 'magicDarts'];
const SPLIT_REACH = 13;
/**
 * How the gameplay modifiers behave beyond their rolled number (refine-mods.mjs holds the numbers).
 */
export const REFINE_PLAY = Object.freeze({
  fork: Object.freeze({angle: .42, range: 7}),                   // two shots, this many radians either side, this far
  bounce: Object.freeze({reach: 7}),                             // Ricochet looks this far from the foe for the next
  shard: Object.freeze({share: .35, range: 4.5, speed: 15}),     // Shrapnel: each shard's share of the shot
  seek: Object.freeze({turn: 4.5}),                              // radians a second a Seeking shot turns
  wave: Object.freeze({speed: 13, range: 6.5, width: .55}),      // Crescent
  echo: Object.freeze({delay: .26, cone: 70}),                   // Echoing: a beat later; a single-target swing's echo cone
  quake: Object.freeze({every: 3, radius: 2.4, stun: .55, delay: .1}),
  arc: Object.freeze({share: .5, leaps: 2, reach: 5}),          // Arcing
  shatter: Object.freeze({radius: 2.2}),
  focus: Object.freeze({most: 5, hold: 2.5}),                    // Relentless: stacks and how long a gap breaks the run
  volatile: Object.freeze({radius: 2.6}),
  haunt: Object.freeze({speed: 9*1.15, turn: 6, range: 14, seek: 10}),
  retort: Object.freeze({share: .45, range: 6, speed: 14, cooldown: .8}),
  storm: Object.freeze({hit: 1.5, reach: 7}),
  slip: Object.freeze({width: 1.1}),
  wrath: Object.freeze({seconds: 2.5}),                          // Vengeful: how long the fury lasts
  rally: Object.freeze({below: 1/3, cooldown: 60}),
});

const dist = (a, b) => Math.hypot((a.x||0)-(b.x||0), (a.z||0)-(b.z||0));
const isArmour = itemId => equipmentSlotFor(itemId) === 'body';
export const isRefinable = itemId => equipmentSlotFor(itemId) === 'weapon' || isArmour(itemId);
/** Every class a piece of gear belongs to, for the modifiers' `only` (refine-mods.mjs). */
export function gearKinds(itemId){
  const kinds = new Set();
  if(isArmour(itemId)){kinds.add('armour'); kinds.add('gear'); return kinds;}
  if(equipmentSlotFor(itemId) !== 'weapon') return kinds;
  kinds.add('weapon'); kinds.add('gear');
  if(Object.hasOwn(SHOTS, itemId)) kinds.add('shots');
  const style = weaponStyle(itemId)?.style;
  if(ARROW_STYLES.has(style)) kinds.add('arrows');
  if(MELEE_STYLES.has(style)) kinds.add('melee');
  return kinds;
}
/** 'shots' for weapons that shoot, 'melee' for the swung ones, 'armour', or '' for the rest. */
export function refineKind(itemId){
  const kinds = gearKinds(itemId);
  return kinds.has('armour') ? 'armour' : kinds.has('shots') ? 'shots' : kinds.has('melee') ? 'melee' : '';
}
/**
 * Can `key` go on this gear at rarity index `tier`, beside the modifiers `others`? `others` null skips
 * `needs`: a book writes Cruel or Shattering without Keen.
 */
export function modAllowed(key, itemId, tier, others = null){
  const mod = REFINE.mods[key];
  if(!mod || tier < (mod.min || 0)) return false;
  if(!gearKinds(itemId).has(mod.only || 'weapon')) return false;
  if(key === 'swift' && NO_SWIFT.has(itemId)) return false;
  if(BLOW_MODS.has(key) && NO_BLOWS.has(itemId)) return false;
  if(mod.needs && others && !others.includes(mod.needs)) return false;
  return true;
}
const tierOf = entry => Math.max(0, Math.min(RARITIES.length-1, entry?.tier|0));

/** One modifier line, e.g. "+30% critical chance" or "+1 arrow". */
export function modText(key, tier, itemId){
  const mod = REFINE.mods[key]; if(!mod) return '';
  const v = mod.values[tier] || 0, noun = SHOTS[itemId] || ['shot', 'shots'], own = mod.noun || ['', ''];
  return mod.text.replace('{v}', String(v)).replace('{shot}', v === 1 ? noun[0] : noun[1]).replace('{n}', v === 1 ? own[0] : own[1]);
}
/** What gear a modifier goes on, for books and the panel. */
export function modFits(key){
  return {weapon: 'any weapon', shots: 'weapons that shoot', arrows: 'bows and staves', melee: 'blades and other swung weapons', armour: 'body armour', gear: 'any weapon or body armour'}[REFINE.mods[key]?.only || 'weapon'] || '';
}
/** A wanderer's modifiers on a weapon type or armour: [{mod, tier}], at most refineSlots (four once a weapon is named). */
export function refinesOf(p, itemId){
  const list = p?.refine?.[itemId];
  return Array.isArray(list) ? list : [];
}
/** Short lines for tooltips: "Keen · +30% critical chance". */
export function refineLines(p, itemId){
  return refinesOf(p, itemId).map(entry => `${REFINE.mods[entry.mod]?.name || entry.mod} · ${modText(entry.mod, tierOf(entry), itemId)}`);
}
/** A book's lines for its tooltip: what it writes, at what strength, and what it fits. */
export function bookLines(itemId){
  const book = bookOf(itemId); if(!book) return [];
  const mod = REFINE.mods[book.mod];
  return [`Writes ${mod.name}: ${modText(book.mod, book.tier, '')}`, `Fits ${modFits(book.mod)} · inscribe it at a workbench (Refine)`];
}
/** Ichor to fill slot `slot` (0-based), or to reroll a filled one. */
export function refineCost(itemId, slot, reroll = false){
  const base = REFINE.cost[rarityOf(itemId)] || REFINE.cost.common;
  return {[REFINE_CURRENCY]: reroll ? base*REFINE.rerollCost : base*(slot+1)};
}
/** Weapon types a wanderer carries (in hand first, then the pack). */
export function carriedWeapons(p){
  return carriedGear(p).filter(itemId => !isArmour(itemId));
}
/** Weapon types and body armours a wanderer carries or wears (in hand first, then worn, then the pack), for the refine panel. */
export function carriedGear(p){
  const ids = [];
  const add = stack => {if(stack && isRefinable(stack.itemId) && !ids.includes(stack.itemId)) ids.push(stack.itemId);};
  add(p?.equipment?.weapon);
  for(const uid of p?.hotbar || []) add((p.inventory?.slots || []).find(stack => stack?.uid === uid));
  add(p?.equipment?.body);
  for(const stack of p?.inventory?.slots || []) add(stack);
  return ids;
}
/** Modifier books at hand (the pack and the chests a workbench can reach): [{id, count}]. */
export function carriedBooks(world, p){
  const counts = new Map();
  const scan = container => {for(const stack of container?.slots || []) if(stack && isBook(stack.itemId)) counts.set(stack.itemId, (counts.get(stack.itemId) || 0)+stack.quantity);};
  scan(p?.inventory);
  for(const store of world?.stores?.(p) || []) scan(store);
  return [...counts.entries()].map(([id, count]) => ({id, count}));
}

/**
 * What the refine panel shows for one weapon type or armour. `canPay(cost)`, `have` and `books`
 * (carriedBooks) come from the World; `armed` is the book picked to write.
 * {itemId, name, rarity, kind, have, slots: [{index, mod, tier, rarity, name, text, write} | null],
 *  fill, reroll, books: [{id, name, mod, rarity, text, count}], otherBooks, armed, openWrite}
 * `fill` is the next empty slot ({slot, cost, ok}) or null when all are rolled; `reroll` is the
 * cost and whether it is at hand. With a book armed, `write` says which slots it can go in.
 */
export function refineView(p, itemId, {have = 0, canPay = () => false, books = [], armed = null} = {}){
  const list = refinesOf(p, itemId), count = refineSlots(p, itemId), rec = namedOf(p, itemId);
  const open = list.length < count ? list.length : -1;
  const fitting = books.map(({id, count}) => ({id, count, book: bookOf(id)}))
    .filter(({book}) => book && modAllowed(book.mod, itemId, book.tier, null))
    .sort((a, b) => b.book.tier-a.book.tier || a.book.name.localeCompare(b.book.name));
  const pick = fitting.find(entry => entry.id === armed)?.book || null;
  // A book goes in any filled slot or the open one, unless its modifier is already in another slot.
  const writable = index => !!pick && (index < list.length || index === open)
    && !list.some((entry, at) => at !== index && entry?.mod === pick.mod);
  const slots = Array.from({length: count}, (_, index) => {
    const entry = list[index]; if(!entry || !REFINE.mods[entry.mod]) return null;
    const tier = tierOf(entry);
    return {index, mod: entry.mod, tier, rarity: RARITIES[tier], name: REFINE.mods[entry.mod].name, text: modText(entry.mod, tier, itemId), write: writable(index)};
  });
  const fillCost = open >= 0 ? refineCost(itemId, open) : null, rerollCost = refineCost(itemId, 0, true);
  return {
    itemId, name: label(itemId), rarity: rarityOf(itemId), kind: refineKind(itemId), have,
    slots,
    // Named weapons (mastery.mjs): the fourth slot opens once enough elders have fallen to it.
    named: {name: rec?.name || null, title: rec?.title || null, elders: Math.floor(rec?.elders || 0), need: NAMED.elders},
    fill: fillCost ? {slot: open, cost: fillCost[REFINE_CURRENCY], ok: !!canPay(fillCost)} : null,
    reroll: {cost: rerollCost[REFINE_CURRENCY], ok: !!canPay(rerollCost)},
    books: fitting.map(({id, count, book}) => ({id, count, name: book.name, mod: REFINE.mods[book.mod].name, rarity: book.rarity, text: modText(book.mod, book.tier, itemId)})),
    otherBooks: books.reduce((n, {id, count}) => n+(fitting.some(entry => entry.id === id) ? 0 : count), 0),
    armed: pick ? armed : null,
    openWrite: open >= 0 && writable(open),
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
      ? list.filter(entry => entry && Object.hasOwn(REFINE.mods, entry.mod) && Number.isInteger(entry.tier) && entry.tier >= 0 && entry.tier < RARITIES.length).slice(0, refineSlots(p, itemId))
      : [];
    if(clean.length) p.refine[itemId] = clean.map(entry => ({mod: entry.mod, tier: entry.tier}));
    else delete p.refine[itemId];
  }
}

/**
 * Host: {type: 'refine', stationId, itemId, slot, bookId?}. Slot n equal to the number already rolled
 * fills the next one; a filled slot is rerolled (it may come back as anything the others are not).
 * With a `bookId` the book's modifier is written into the slot at the book's rarity instead, for the
 * book alone: no ichor, and nothing random.
 */
export function refineWeapon(world, p, cmd){
  const reject = (text, code = 'rejected') => {if(text) world.tell(p, text); return {ok: false, code};};
  if(world.arena || world.showcase) return reject('Gear is refined on an expedition', 'unavailable');
  const bench = world.buildings.find(b => b.id === cmd?.stationId && b.type === 'bench' && b.hp > 0);
  if(!bench || !inCraftRange(dist(p, bench))) return reject('Refine at a workbench', 'stationRequired');
  const itemId = cmd.itemId;
  if(typeof itemId !== 'string' || !isRefinable(itemId) || !carriedGear(p).includes(itemId)) return reject('Carry the weapon or armour you want to refine');
  const list = refinesOf(p, itemId), slot = cmd.slot;
  if(!Number.isInteger(slot) || slot < 0 || slot >= refineSlots(p, itemId) || slot > list.length) return reject('', 'invalidCommand');
  let rolled, book = null;
  if(cmd.bookId != null){
    book = bookOf(cmd.bookId);
    if(!book) return reject('', 'invalidCommand');
    if(!modAllowed(book.mod, itemId, book.tier, null)) return reject(`${book.name} does not fit the ${label(itemId)}`);
    if(list.some((entry, index) => index !== slot && entry?.mod === book.mod)) return reject(`${REFINE.mods[book.mod].name} is already on it`);
    if(!world.pay(p, {[cmd.bookId]: 1})) return reject(`Carry the ${book.name}`);
    rolled = {mod: book.mod, tier: book.tier};
  }else{
    const reroll = slot < list.length, cost = refineCost(itemId, slot, reroll);
    if(!world.pay(p, cost)) return reject(`Needs ${cost[REFINE_CURRENCY]} ${label(REFINE_CURRENCY).toLowerCase()}`);
    const taken = list.filter((_, index) => index !== slot).map(entry => entry.mod);
    rolled = rollModifier(world.rng, itemId, taken);
  }
  const next = list.slice(); next[slot] = rolled;
  (p.refine ||= {})[itemId] = next;
  const rarity = RARITIES[rolled.tier], name = REFINE.mods[rolled.mod].name, text = modText(rolled.mod, rolled.tier, itemId);
  world.event('refine', p.x, p.z, `${name} · ${text}`, {player: p.id, itemId, rarity, tier: rolled.tier, slot, bx: bench.x, bz: bench.z, ...(book ? {book: cmd.bookId} : {})});
  if(rolled.tier >= 3) world.event('announce', p.x, p.z, `${p.name}'s ${label(itemId)} is ${rarity}: ${name}, ${text}`);
  if(isArmour(itemId)) p.maxHp = maxHealth(p);
  world.assertItems?.();
  return {ok: true, code: 'ok'};
}

// ------------------------------------------------------------------ in a fight
function ownerOf(world, owner){
  if(owner && typeof owner === 'object') return owner;
  return typeof owner === 'string' ? world.player?.(owner) || null : null;
}
const live = world => world.enemies.filter(e => e.hp > 0 && !isMagicAlly(e) && Number.isFinite(e.x));
/** Elders, Wardens, the great bosses and the Hollow King: Bane's marks, and safe from Culling. */
const isBig = e => !!(e?.elite || e?.warden || e?.type === 'king' || ENEMIES[e?.type]?.boss);
const unCullable = e => !!(e?.warden || e?.type === 'king' || ENEMIES[e?.type]?.boss);
/** The weapon in hand's base damage times the wanderer's power (what armour and kill effects are worth). */
function weaponHit(p){
  const w = p?.equipment?.weapon, id = w && w.durability > 0 ? w.itemId : 'fist';
  return (EQUIPMENT[id]?.damage || magicItems[id]?.damage || weaponStyle(id)?.damage || weaponStyle('fist')?.damage || 9)*powerOf(p);
}
/**
 * A blow a refinement sends out on its own (lightning, a burst, an explosion). It lands like any
 * other blow, crits and all, but cannot set off another Arcing, Shattering or Volatile: no loops.
 */
function proc(world, fn){
  world.refineDepth = (world.refineDepth || 0)+1;
  try{fn();}finally{world.refineDepth--;}
}
const procAllowed = world => !(world.refineDepth > 0);
function fx(world, name, x, z, extra){world.event('fx', x, z, '', {fx: name, ...extra});}

/**
 * A hit by `owner` (a wanderer or their id) on `enemy`, before it lands. Returns the amount after
 * Bane, Relentless, Vengeful and a critical roll, heals the wanderer through Thirsting, cuts the foe
 * down through Culling, and may arc or shatter onto its neighbours. Unrefined wanderers pass straight
 * through without touching the random stream.
 */
export function refineHit(world, owner, enemy, amount){
  const p = ownerOf(world, owner);
  if(!p || !(amount > 0)) return {amount, crit: false};
  // Trinkets (trinkets.mjs) have their say after the refinement: grave chalk, the bell, the tinder pouch.
  if(!p.refine){const t = trinketHit(world, p, enemy, amount, false); return {amount: t.amount, crit: t.crit};}
  let out = amount, crit = false;
  const bane = refineStat(p, 'bane');
  if(bane > 0 && isBig(enemy)) out *= 1+bane;
  const focus = refineStat(p, 'focus');
  if(focus > 0 && enemy?.id != null){
    const run = p.refineFocus, spec = REFINE_PLAY.focus;
    const n = run && run.id === enemy.id && run.until > world.time ? Math.min(spec.most+1, run.n+1) : 1;
    p.refineFocus = {id: enemy.id, n, until: world.time+spec.hold};
    out *= 1+focus*(n-1);
  }
  // Vengeful (armour): a moment of fury after being struck.
  if(p.wrathUntil > world.time){const wrath = armourStat(p, 'wrath'); if(wrath > 0) out *= 1+wrath;}
  const keen = refineStat(p, 'keen');
  if(keen > 0 && world.rng() < keen){crit = true; out *= REFINE.crit+refineStat(p, 'cruel');}
  const thirst = refineStat(p, 'thirst');
  const t = trinketHit(world, p, enemy, out, crit);
  out = t.amount; crit = t.crit;
  if(thirst > 0 && p.hp > 0 && !p.down && !p.ghost) p.hp = Math.min(maxHealth(p), p.hp+Math.min(REFINE.leechCap, out*thirst));
  if(!enemy || !(enemy.hp > 0)) return {amount: out, crit};
  // Culling: a foe this blow leaves under the line dies instead (an elder's line is half as high).
  const cull = refineStat(p, 'cull');
  if(cull > 0 && !unCullable(enemy) && enemy.maxHp > 0 && enemy.hp-out > 0 && enemy.hp-out < enemy.maxHp*cull*(enemy.elite ? .5 : 1)){
    out = enemy.hp+1;
    world.event('strike', enemy.x, enemy.z, 'Culled', {player: p.id, kind: 'refine'});
    fx(world, 'refine-cull', enemy.x, enemy.z, {player: p.id});
  }
  if(procAllowed(world)){
    const shatter = refineStat(p, 'shatter');
    if(crit && shatter > 0){
      const r = REFINE_PLAY.shatter.radius, burst = out*shatter;
      proc(world, () => {for(const e of live(world)) if(e !== enemy && dist(e, enemy) < r) world.strike(p, e, burst, 0);});
      fx(world, 'refine-shatter', enemy.x, enemy.z, {radius: r, player: p.id});
    }
    const arc = refineStat(p, 'arc');
    if(arc > 0 && world.rng() < arc){
      const spec = REFINE_PLAY.arc, jolt = out*spec.share, points = [[enemy.x, enemy.z]];
      let from = enemy;
      const struck = new Set([enemy.id]);
      proc(world, () => {
        for(let i = 0; i < spec.leaps; i++){
          const next = live(world).filter(e => !struck.has(e.id) && dist(e, from) < spec.reach).sort((a, b) => dist(a, from)-dist(b, from))[0];
          if(!next) break;
          struck.add(next.id); points.push([next.x, next.z]);
          world.strike(p, next, jolt, 0);
          from = next;
        }
      });
      if(points.length > 1) fx(world, 'refine-arc', enemy.x, enemy.z, {points, player: p.id});
    }
  }
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

// ------------------------------------------------------------------ arrows and bolts
/**
 * A bow's or staff's shot (World.projectiles, kind arrow or bolt) reads its owner's refinement the
 * first time it moves, once: {fork, ricochet, shrapnel, returning, seeking}, or null. Shots that a
 * modifier itself made (forks, shards, waves, spirits) are `child` and carry none, so nothing loops.
 */
export function shotMods(world, shot){
  if(shot.mods !== undefined) return shot.mods;
  shot.mods = null;
  if(shot.child || !ARROW_STYLES.has(weaponStyle(shot.itemId)?.style)) return null;
  const p = world.player?.(shot.owner);
  if(!p?.refine?.[shot.itemId]) return null;
  const mods = {};
  for(const key of ['fork', 'ricochet', 'shrapnel', 'returning', 'seeking']){const v = refineStat(p, key, shot.itemId); if(v > 0) mods[key] = v;}
  if(!Object.keys(mods).length) return null;
  if(mods.seeking){shot.damage *= 1+mods.seeking; if(!shot.homing) shot.homing = 'seek'; shot.turn = Math.max(shot.turn || 0, REFINE_PLAY.seek.turn);}
  if(mods.ricochet) shot.bounces = mods.ricochet;
  return shot.mods = mods;
}
/** A copy of `shot` heading `angle`, from (x, z): a fork or a shard. */
function offshoot(world, shot, x, z, angle, damage, range, speed = Math.hypot(shot.vx, shot.vz)){
  return {...shot, id: world.nextId('pr'), x, z, vx: Math.cos(angle)*speed, vz: Math.sin(angle)*speed, aim: angle, damage, range, traveled: 0,
    pierce: 0, splash: 0, hit: [...shot.hit], age: 0, homing: null, turn: 0, child: true, mods: null, bounces: 0, back: false, small: true};
}
/**
 * A refined shot has just struck `enemy`. Forking splits it in two (once); Ricochet turns it toward
 * the next foe. Returns true when the shot bounced and flies on.
 */
export function shotHit(world, shot, enemy){
  const mods = shot.mods; if(!mods || shot.back) return false;
  const heading = Math.atan2(shot.vz, shot.vx);
  if(mods.fork && !shot.forked){
    shot.forked = true;
    const spec = REFINE_PLAY.fork;
    for(const side of [-1, 1]) world.projectiles.push(offshoot(world, shot, enemy.x, enemy.z, heading+side*spec.angle, shot.damage*mods.fork, spec.range));
    fx(world, 'refine-fork', enemy.x, enemy.z, {player: shot.owner, angle: heading, itemId: shot.itemId});
  }
  if(shot.bounces > 0){
    const reach = REFINE_PLAY.bounce.reach;
    const next = live(world).filter(e => !shot.hit.includes(e.id) && dist(e, enemy) < reach).sort((a, b) => dist(a, enemy)-dist(b, enemy))[0];
    if(next){
      shot.bounces--;
      const d = Math.max(.05, dist(next, enemy)), speed = Math.hypot(shot.vx, shot.vz);
      shot.x = enemy.x; shot.z = enemy.z;
      shot.vx = (next.x-enemy.x)/d*speed; shot.vz = (next.z-enemy.z)/d*speed; shot.aim = Math.atan2(shot.vz, shot.vx);
      shot.traveled = 0; shot.range = reach+1; shot.pierce = shot.hit.length; shot.homing = next.id; shot.turn = Math.max(shot.turn || 0, 6);
      fx(world, 'refine-bounce', enemy.x, enemy.z, {player: shot.owner, tx: next.x, tz: next.z});
      return true;
    }
  }
  return false;
}
/** A refined shot has stopped (spent or out of range): Shrapnel bursts it, Returning turns it home. */
export function shotEnd(world, shot){
  const mods = shot.mods; if(!mods || shot.back) return;
  if(mods.shrapnel && !shot.burst){
    shot.burst = true;
    const spec = REFINE_PLAY.shard, n = Math.round(mods.shrapnel), turn = Math.atan2(shot.vz, shot.vx);
    for(let i = 0; i < n; i++) world.projectiles.push(offshoot(world, shot, shot.x, shot.z, turn+(i+.5)/n*Math.PI*2, shot.damage*spec.share, spec.range, spec.speed));
    fx(world, 'refine-shrapnel', shot.x, shot.z, {player: shot.owner, n});
  }
  if(mods.returning){
    shot.back = true; shot.done = false;
    shot.hit = []; shot.damage *= mods.returning; shot.pierce = 99; shot.traveled = 0; shot.range = 60; shot.homing = null;
  }
}
/** A returning shot steers for its owner and is caught when it gets there. */
export function shotSteer(world, shot){
  if(!shot.back) return;
  const p = world.player?.(shot.owner);
  if(!p || p.down || p.ghost){shot.done = true; return;}
  const d = dist(p, shot);
  if(d < .8){shot.done = true; return;}
  const speed = Math.max(10, Math.hypot(shot.vx, shot.vz));
  shot.vx = (p.x-shot.x)/d*speed; shot.vz = (p.z-shot.z)/d*speed; shot.aim = Math.atan2(shot.vz, shot.vx);
}

// ------------------------------------------------------------------ swings
/**
 * A swung weapon (melee, combo, lash, reap) has just swung: Crescent looses a wave, Echoing queues the
 * phantom swing, Aftershock counts to its slam. `range` is the swing's reach, `target` its foe if any.
 */
export function refineSwing(world, p, {style, damage, itemId, range, target}){
  if(!p?.refine?.[itemId] || !MELEE_STYLES.has(style?.style) || !(damage > 0)) return;
  const fx = p.dx || 0, fz = p.dz || 0, l = Math.hypot(fx, fz), dx = l ? fx/l : 0, dz = l ? fz/l : 1;
  const crescent = refineStat(p, 'crescent');
  if(crescent > 0){
    const spec = REFINE_PLAY.wave, a = Math.atan2(dz, dx);
    world.projectiles.push({id: world.nextId('pr'), kind: 'wave', owner: p.id, x: p.x+dx*.5, z: p.z+dz*.5, vx: dx*spec.speed, vz: dz*spec.speed,
      damage: damage*crescent, range: spec.range, traveled: 0, pierce: 99, splash: 0, slow: 0, hit: [], age: 0, aim: a, width: spec.width,
      arc: Math.max(70, Math.min(160, style.arc || 90)), rank: 1, itemId, child: true, mods: null, painted: true});
  }
  const queue = world.refineQueue ||= [];
  const echo = refineStat(p, 'echo');
  if(echo > 0) queue.push({kind: 'echo', at: world.time+REFINE_PLAY.echo.delay, owner: p.id, x: p.x, z: p.z, dx, dz,
    range: range || style.range || 3, arc: style.arc || 0, damage: damage*echo, itemId});
  const quake = refineStat(p, 'quake');
  if(quake > 0){
    const spec = REFINE_PLAY.quake;
    p.refineSwings = ((p.refineSwings || 0)+1)%spec.every;
    if(p.refineSwings === 0){
      const reach = Math.min(range || 2.5, target ? dist(target, p) : (range || 2.5)*.7);
      queue.push({kind: 'quake', at: world.time+spec.delay, owner: p.id, x: target ? target.x : p.x+dx*reach, z: target ? target.z : p.z+dz*reach, damage: damage*quake, itemId});
    }
  }
}
function fireEcho(world, p, e){
  const hostile = live(world), cone = (e.arc > 0 ? e.arc : REFINE_PLAY.echo.cone)*Math.PI/360;
  const inside = hostile.filter(foe => {
    const d = dist(foe, e); if(d >= e.range+.3) return false; if(d < .6) return true;
    return ((foe.x-e.x)*e.dx+(foe.z-e.z)*e.dz)/d >= Math.cos(cone);
  });
  // A single-target swing's phantom strikes one foe, the nearest in its cone.
  const hits = e.arc > 0 ? inside : inside.sort((a, b) => dist(a, e)-dist(b, e)).slice(0, 1);
  for(const foe of hits) world.strike(p, foe, e.damage, 0);
  fx(world, 'refine-echo', e.x, e.z, {dx: e.dx, dz: e.dz, arc: e.arc > 0 ? e.arc : REFINE_PLAY.echo.cone, range: e.range, player: p.id, itemId: e.itemId});
}
function fireQuake(world, p, e){
  const spec = REFINE_PLAY.quake;
  for(const foe of live(world)){
    if(dist(foe, e) >= spec.radius) continue;
    world.strike(p, foe, e.damage, 0);
    if(foe.hp > 0 && !unCullable(foe)){foe.stunned = Math.max(foe.stunned || 0, spec.stun); foe.windup = 0; foe.act = 0;}
  }
  world.event('quake', e.x, e.z, '', {radius: spec.radius, arc: 360, angle: 0, player: p.id});
  fx(world, 'refine-quake', e.x, e.z, {radius: spec.radius, player: p.id});
}

// ------------------------------------------------------------------ kills
/** `p` slew `enemy` (World.tick's death roll): Volatile blows it up, Haunting frees a spirit. */
export function refineKill(world, p, enemy){
  if(!p?.refine || !enemy) return;
  const volatile = refineStat(p, 'volatile');
  if(volatile > 0 && enemy.maxHp > 0 && procAllowed(world)){
    const r = REFINE_PLAY.volatile.radius, blast = enemy.maxHp*volatile;
    // Its blast can kill; those deaths are rolled next tick and may blow up in turn.
    proc(world, () => {for(const e of live(world)) if(e !== enemy && dist(e, enemy) < r) world.strike(p, e, blast, 0);});
    fx(world, 'refine-blast', enemy.x, enemy.z, {radius: r, player: p.id, big: isBig(enemy)});
  }
  const haunt = refineStat(p, 'haunt');
  if(haunt > 0){
    const spec = REFINE_PLAY.haunt;
    const mark = live(world).filter(e => e !== enemy && dist(e, enemy) < spec.seek).sort((a, b) => dist(a, enemy)-dist(b, enemy))[0];
    if(mark){
      const a = Math.atan2(mark.z-enemy.z, mark.x-enemy.x)+(world.rng()-.5)*1.6;
      world.projectiles.push({id: world.nextId('pr'), kind: 'wisp', owner: p.id, x: enemy.x, z: enemy.z, vx: Math.cos(a)*spec.speed, vz: Math.sin(a)*spec.speed,
        damage: weaponHit(p)*haunt, range: spec.range, traveled: 0, pierce: 0, splash: 0, slow: 0, hit: [], age: 0, aim: a, homing: mark.id, turn: spec.turn,
        rank: 1, itemId: p.equipment?.weapon?.itemId || 'fist', child: true, mods: null, haunt: true});
      fx(world, 'refine-haunt', enemy.x, enemy.z, {player: p.id});
    }
  }
}

// ------------------------------------------------------------------ body armour
/** `p` is about to take `amount` (after their armour): Bulwark, Retribution and Vengeful. Returns the amount. */
export function refineHurt(world, p, amount, source = null){
  if(!p?.refine || !(amount > 0)) return amount;
  const guard = armourStat(p, 'guard');
  if(guard > 0) amount *= 1-guard;
  if(armourStat(p, 'wrath') > 0){
    if(!(p.wrathUntil > world.time)) world.event('strike', p.x, p.z, 'Vengeance', {player: p.id, kind: 'refine'});
    p.wrathUntil = world.time+REFINE_PLAY.wrath.seconds;
  }
  const shards = armourStat(p, 'retort'), spec = REFINE_PLAY.retort;
  if(shards > 0 && !(p.retortReady > world.time)){
    p.retortReady = world.time+spec.cooldown;
    const n = Math.round(shards), turn = source && Number.isFinite(source.x) ? Math.atan2(source.z-p.z, source.x-p.x) : 0, body = p.equipment?.body?.itemId || 'armor';
    for(let i = 0; i < n; i++){
      const a = turn+i/n*Math.PI*2;
      world.projectiles.push({id: world.nextId('pr'), kind: 'bolt', owner: p.id, x: p.x+Math.cos(a)*.5, z: p.z+Math.sin(a)*.5, vx: Math.cos(a)*spec.speed, vz: Math.sin(a)*spec.speed,
        damage: weaponHit(p)*spec.share, range: spec.range, traveled: 0, pierce: 1, splash: 0, slow: 0, hit: [], age: 0, aim: a, rank: 1, itemId: body, child: true, mods: null, small: true});
    }
    fx(world, 'refine-retort', p.x, p.z, {n, player: p.id});
  }
  return amount;
}
/** `p` has just set off on a dodge (World.dash): Slipstream cuts every foe along the way. */
export function refineDodge(world, p){
  const slip = p?.refine ? armourStat(p, 'slip') : 0;
  if(!(slip > 0)) return;
  const len = DASH.distance, dx = p.ddx || 0, dz = p.ddz || 0, width = REFINE_PLAY.slip.width, hit = weaponHit(p)*slip;
  for(const e of live(world)){
    const t = Math.max(0, Math.min(len, (e.x-p.x)*dx+(e.z-p.z)*dz));
    if(Math.hypot(e.x-(p.x+dx*t), e.z-(p.z+dz*t)) < width) world.strike(p, e, hit, 0);
  }
  fx(world, 'refine-slip', p.x, p.z, {dx, dz, len, player: p.id});
}
/**
 * Every tick (World.tick): the queued phantom swings and slams, Stormskin's lightning, Second wind,
 * and the max health that Vital changes when armour goes on or comes off.
 */
export function stepRefine(world, dt){
  const queue = world.refineQueue;
  if(queue?.length){
    const due = queue.filter(e => e.at <= world.time);
    world.refineQueue = queue.filter(e => e.at > world.time);
    for(const e of due){
      const p = world.player?.(e.owner);
      if(!p || p.down || p.ghost) continue;
      if(e.kind === 'echo') fireEcho(world, p, e);
      else if(e.kind === 'quake') fireQuake(world, p, e);
    }
  }
  for(const p of world.players || []){
    if(!p.online || !p.refine) continue;
    const top = maxHealth(p);
    if(p.maxHp !== top){p.maxHp = top; if(p.hp > top) p.hp = top;}
    if(p.down || p.ghost || !(p.hp > 0)) continue;
    const storm = armourStat(p, 'storm');
    if(storm > 0){
      p.refineStorm = Math.min(storm, (p.refineStorm || 0)+dt);
      if(p.refineStorm >= storm){
        const spec = REFINE_PLAY.storm;
        const mark = live(world).filter(e => dist(e, p) < spec.reach).sort((a, b) => dist(a, p)-dist(b, p))[0];
        if(mark){
          p.refineStorm = 0;
          world.strike(p, mark, weaponHit(p)*spec.hit, 0);
          fx(world, 'refine-storm', mark.x, mark.z, {player: p.id});
        }
      }
    }else if(p.refineStorm) p.refineStorm = 0;
    const rally = armourStat(p, 'rally'), spec = REFINE_PLAY.rally;
    if(rally > 0 && p.hp < top*spec.below && !(p.rallyReady > world.time)){
      p.rallyReady = world.time+spec.cooldown;
      p.hp = Math.min(top, p.hp+rally);
      world.event('strike', p.x, p.z, `Second wind +${Math.round(rally)}`, {player: p.id, kind: 'refine'});
      fx(world, 'refine-rally', p.x, p.z, {player: p.id});
    }
  }
}
