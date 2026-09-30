// The workbench's Refine panel: markup only. main.mjs builds the view with refineView() (src/refine.mjs)
// and sends {type: 'refine', stationId, itemId, slot} when a slot's button is tapped.
import {RARITIES, REFINE} from '../progression.mjs?v=harvest-18';
import {SHOTS, refineOdds} from '../refine.mjs?v=harvest-18';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[ch]);
const cap = word => word.charAt(0).toUpperCase()+word.slice(1);

/** Weapon chips for the sheet tabs: every weapon type the wanderer carries. */
export function refineTabs(weapons, active){
  return weapons.map(({itemId, name, count}) => `<button type="button" class="chip ${itemId === active ? 'active' : ''}" data-refine-weapon="${esc(itemId)}">${esc(name)}${count ? ` · ${count}/${REFINE.slots}` : ''}</button>`).join('');
}

/**
 * The panel. `view` is refineView(); `icons` holds ready <img> markup ({weapon, ichor});
 * `pending` is the slot being rolled (its button waits), `fresh` the slot that just changed.
 */
export function refineMarkup(view, {icons = {}, pending = -1, fresh = -1} = {}){
  if(!view) return `<p class="empty">Carry a weapon to refine it. Each can hold ${REFINE.slots} modifiers, rolled with Dread ichor.</p>`;
  const busy = pending >= 0;
  const price = n => `<span class="refine-price">${icons.ichor || ''}${n}</span>`;
  const rows = view.slots.map((slot, index) => {
    if(slot){
      return `<li class="refine-slot rarity-${slot.rarity}${index === fresh ? ' is-fresh' : ''}">`
        +`<span class="refine-gem" aria-hidden="true">◆</span>`
        +`<div class="refine-text"><b>${esc(slot.name)}</b><small>${cap(slot.rarity)}</small><p>${esc(slot.text)}</p></div>`
        +`<button type="button" data-refine-slot="${index}" ${busy || !view.reroll.ok ? 'disabled' : ''} aria-label="Reroll ${esc(slot.name)} for ${view.reroll.cost} ichor">${pending === index ? '…' : 'Reroll'}${price(view.reroll.cost)}</button></li>`;
    }
    if(view.fill?.slot === index){
      return `<li class="refine-slot is-open">`
        +`<span class="refine-gem" aria-hidden="true">◇</span>`
        +`<div class="refine-text"><b>Empty slot</b><p>Roll a random modifier and its rarity.</p></div>`
        +`<button type="button" class="primary" data-refine-slot="${index}" ${busy || !view.fill.ok ? 'disabled' : ''} aria-label="Refine for ${view.fill.cost} ichor">${pending === index ? '…' : 'Refine'}${price(view.fill.cost)}</button></li>`;
    }
    return `<li class="refine-slot is-locked"><span class="refine-gem" aria-hidden="true">◇</span><div class="refine-text"><b>Locked</b><p>Fill the slot above first.</p></div></li>`;
  }).join('');
  const odds = refineOdds().map((chance, tier) => `<span class="rarity-${RARITIES[tier]}">${cap(RARITIES[tier])} ${chance}%</span>`).join('');
  const shots = SHOTS[view.itemId];
  const special = view.kind === 'shots' ? `<b>Split</b> (+1 ${esc(shots[0])}, or +2 when legendary) rolls only epic or legendary.`
    : view.kind === 'melee' ? '<b>Long</b> (more reach) rolls only on blades and other swung weapons.' : '';
  return `<div class="refine">`
    +`<div class="refine-head">${icons.weapon || ''}<div><h3 class="refine-name rarity-${view.rarity}">${esc(view.name)}</h3><p>Modifiers belong to you, not the item: the next ${esc(view.name)} you carry keeps them.</p></div>`
    +`<span class="refine-purse" title="Dread ichor at hand (pack and nearby chests)">${icons.ichor || ''}<b>${view.have}</b></span></div>`
    +`<ol class="refine-slots">${rows}</ol>`
    +`<p class="refine-note">Rerolling replaces that modifier with a new roll, better or worse. ${special}</p>`
    +`<p class="refine-odds">${odds}</p>`
    +`<p class="refine-note">Dread ichor drops only from creatures: a little from briarlings, more from wraiths, bonewalkers and boglings, a handful from gravekeepers and golems, and a hoard from the Hollow King. Elders drop it more often.</p>`
    +`</div>`;
}
