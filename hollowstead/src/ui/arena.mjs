// Battle arena and weapon hotbar views. Pure: builds markup and labels from plain world data,
// never mutates the world. main.mjs owns the DOM and sends the picks.

import {RECIPES, label} from '../content.mjs?v=harvest-17';
import {magicItems} from '../magic/registry.mjs?v=harvest-17';
import {ARENA_GROWTH, rarityOf, weaponStyle} from '../progression.mjs?v=harvest-17';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

/** One line on how a weapon fights, for pick cards and the hotbar tooltip. */
const BLURBS = Object.freeze({
  spear: 'A long thrust at one foe. Reach keeps the swarm off you.',
  sword: 'Quick, heavy cuts at one foe.',
  recurve: 'Arrows fly at the nearest foe, leading it as it runs.',
  bonebow: 'Heavy arrows that punch through two more foes.',
  broadsword: 'A wide 110° cleave through everything in front.',
  crookstaff: 'Moonshard bolts that burst on impact.',
  flamberge: 'A huge 150° cleave with long reach.',
  skullstaff: 'A big bursting bolt that slows what it hits.',
  tome: 'A ring of fire around you. Made for swarms.',
});
export function weaponBlurb(itemId){
  return BLURBS[itemId] || weaponStyle(itemId)?.blurb || magicItems[itemId]?.blurb || RECIPES[itemId]?.desc || '';
}

/** Stars for a weapon rank (1-5). */
export function rankStars(rank){
  const n = Math.max(1, Math.min(ARENA_GROWTH.maxRank, rank|0));
  return '★'.repeat(n);
}

/** Hotbar model: three slots with their stacks, which is worn, and ranks for the arena. */
export function hotbarView(player){
  const worn = player?.equipment?.weapon || null;
  const stacks = [worn, ...(player?.inventory?.slots || [])].filter(Boolean);
  return (player?.hotbar || [null, null, null]).map((uid, index) => {
    const stack = uid ? stacks.find(s => s.uid === uid) || null : null;
    return {
      index, uid, itemId: stack?.itemId || null, name: stack ? label(stack.itemId) : '',
      active: !!(stack && worn && worn.uid === stack.uid),
      rank: stack ? (player?.ranks?.[stack.itemId] || 0) : 0,
      rarity: stack ? rarityOf(stack.itemId) : 'common',
    };
  });
}

/** Pick-card markup. `icon(itemId)` returns the item's <img>. */
export function offerMarkup(offers, icon){
  return (offers || []).map((offer, i) => {
    const rarity = rarityOf(offer.itemId);
    const badge = offer.owned ? `<span class="pick-badge rank">RANK UP ${rankStars(offer.rank)}</span>` : '<span class="pick-badge">NEW</span>';
    return `<button type="button" class="pick-card rarity-${rarity}" data-pick="${i}" aria-label="${escape(label(offer.itemId))}, ${rarity}${offer.owned ? `, rank up to ${offer.rank}` : ', new weapon'}">`
      + `${badge}<span class="pick-icon">${icon(offer.itemId)}</span><b>${escape(label(offer.itemId))}</b>`
      + `<small class="pick-rarity">${rarity.toUpperCase()}</small><span class="pick-blurb">${escape(weaponBlurb(offer.itemId))}</span></button>`;
  }).join('');
}

/** When the hotbar is full, which weapon gives way. */
export function replaceMarkup(slots, icon, itemId){
  return `<p>Your hotbar is full. Give up which weapon for the ${escape(label(itemId))}?</p><div class="replace-row">`
    + slots.map(slot => `<button type="button" class="replace-slot" data-replace="${slot.index}" aria-label="Replace ${escape(slot.name || 'empty slot')}">${slot.itemId ? icon(slot.itemId) : ''}<small>${escape(slot.name || 'Empty')}</small></button>`).join('')
    + `</div><div class="replace-tools"><button type="button" data-replace="back">Back</button><button type="button" data-replace="skip">Keep my weapons</button></div>`;
}
