// The workbench's Refine panel: markup only. main.mjs builds the view with refineView() (src/refine.mjs)
// and sends {type: 'refine', stationId, itemId, slot} when a slot's button is tapped, with `bookId`
// added when a modifier book is being written instead of rolled. Below the slots, a mastered weapon's
// ascension (ascendView, src/mastery.mjs) sends {type: 'ascendWeapon', stationId, itemId}.
import {NAMED, RARITIES, REFINE} from '../progression.mjs?v=harvest-18';
import {SHOTS, refineOdds} from '../refine.mjs?v=harvest-18';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[ch]);
const cap = word => word.charAt(0).toUpperCase()+word.slice(1);

/** Gear chips for the sheet tabs: every weapon type and body armour the wanderer carries (`max`: its slots, four once named). */
export function refineTabs(weapons, active){
  return weapons.map(({itemId, name, count, max = REFINE.slots, named = false}) => `<button type="button" class="chip ${itemId === active ? 'active' : ''}${named ? ' is-named' : ''}" data-refine-weapon="${esc(itemId)}">${esc(name)}${count ? ` · ${count}/${max}` : ''}</button>`).join('');
}

/** The ascension card: past ★5 a weapon climbs on, one ✦ at a time, for Dread sigils and ichor. */
function ascendMarkup(a, icons, pending){
  if(!a) return '';
  const pct = v => `${Math.round(v*1000)/10}%`;
  const price = (icon, n, have) => `<span class="refine-price${have < n ? ' is-short' : ''}">${icon || ''}${n}</span>`;
  const level = a.level > 0 ? `<b class="ascend-level">✦${a.level}</b> <small>+${pct(a.bonus)} damage</small>` : '<b class="ascend-level">✦0</b>';
  const bar = `<span class="ascend-bar" aria-hidden="true"><em style="width:${(a.progress*100).toFixed(1)}%"></em></span>`;
  const note = !a.mastered ? `Master it to ★★★★★, then every ${Math.round(a.to-a.from)} more mastery readies an ascension.`
    : a.ready ? `Ready. The next ascension adds +${pct(a.next-a.bonus)} damage (each a little less than the last, and never the last).`
    : `${Math.max(0, Math.ceil(a.to-a.points))} more mastery to the next ascension.`;
  return `<section class="ascend${a.ready ? ' is-ready' : ''}${a.mastered ? '' : ' is-locked'}">`
    +`<div class="ascend-head"><span class="ascend-star" aria-hidden="true">✦</span><div><h4>Ascension</h4><p>${level}</p></div>`
    +(a.mastered ? `<button type="button" class="primary" data-ascend="1" ${pending || !a.ok ? 'disabled' : ''} aria-label="Ascend for ${a.cost.sigil} Dread sigils and ${a.cost.ichor} ichor"${a.reason ? ` title="${esc(a.reason)}"` : ''}>${pending ? '…' : 'Ascend'}<span class="ascend-cost">${price(icons.sigil, a.cost.sigil, a.have.sigil)}${price(icons.ichor, a.cost.ichor, a.have.ichor)}</span></button>` : '')
    +`</div>${a.mastered ? bar : ''}<p class="refine-note">${esc(note)} Dread sigils are torn from great foes: the Hollow King, Mother Briar, The Unblinking and a bleeding altar’s champion.</p></section>`;
}

/** The books that fit this gear, each a toggle; the armed one is written by tapping a slot. */
function booksMarkup(view, bookIcon){
  const list = view.books.map(book => `<li><button type="button" class="refine-book rarity-${book.rarity}${book.id === view.armed ? ' is-armed' : ''}" data-refine-book="${esc(book.id)}" aria-pressed="${book.id === view.armed}">`
    +`${bookIcon(book.id)}<span class="refine-book-text"><b>${esc(book.name)}</b><small>${cap(book.rarity)}${book.count > 1 ? ` · ×${book.count}` : ''}</small>`
    +`<em>${esc(book.mod)} · ${esc(book.text)}</em></span></button></li>`).join('');
  const other = view.otherBooks > 0 ? ` ${view.otherBooks} ${view.otherBooks === 1 ? 'book' : 'books'} at hand fit other gear.` : '';
  const hint = view.armed ? 'Now tap the slot to write it in. Tap the book again to put it away.'
    : view.books.length ? 'Tap a book, then the slot to write it in: its modifier at the book’s own rarity, no ichor.' : '';
  return `<section class="refine-books"><h4>Modifier books</h4>`
    +(list ? `<ul>${list}</ul>` : `<p class="refine-note">No book for the ${esc(view.name)} at hand.${other}</p>`)
    +(list ? `<p class="refine-note">${hint}${other}</p>` : '')
    +`</section>`;
}

/**
 * The panel. `view` is refineView(); `icons` holds ready <img> markup ({weapon, ichor}) and
 * `bookIcon(id)` a book's; `pending` is the slot being rolled (its button waits), `fresh` the slot
 * that just changed.
 */
export function refineMarkup(view, {icons = {}, bookIcon = () => '', pending = -1, fresh = -1, ascend = null, ascending = false} = {}){
  if(!view) return `<p class="empty">Carry a weapon or body armour to refine it. Each holds ${REFINE.slots} modifiers, rolled with Dread ichor or written from a modifier book.</p>`;
  const busy = pending >= 0, armed = !!view.armed;
  const price = n => `<span class="refine-price">${icons.ichor || ''}${n}</span>`;
  const rows = view.slots.map((slot, index) => {
    if(slot){
      const button = armed
        ? `<button type="button" class="primary" data-refine-slot="${index}" ${busy || !slot.write ? 'disabled' : ''} aria-label="Write the book over ${esc(slot.name)}">${pending === index ? '…' : 'Write here'}</button>`
        : `<button type="button" data-refine-slot="${index}" ${busy || !view.reroll.ok ? 'disabled' : ''} aria-label="Reroll ${esc(slot.name)} for ${view.reroll.cost} ichor">${pending === index ? '…' : 'Reroll'}${price(view.reroll.cost)}</button>`;
      return `<li class="refine-slot rarity-${slot.rarity}${index === fresh ? ' is-fresh' : ''}${armed && slot.write ? ' is-target' : ''}">`
        +`<span class="refine-gem" aria-hidden="true">◆</span>`
        +`<div class="refine-text"><b>${esc(slot.name)}</b><small>${cap(slot.rarity)}</small><p>${esc(slot.text)}</p></div>`
        +`${button}</li>`;
    }
    if(view.fill?.slot === index){
      const button = armed
        ? `<button type="button" class="primary" data-refine-slot="${index}" ${busy || !view.openWrite ? 'disabled' : ''} aria-label="Write the book here">${pending === index ? '…' : 'Write'}</button>`
        : `<button type="button" class="primary" data-refine-slot="${index}" ${busy || !view.fill.ok ? 'disabled' : ''} aria-label="Refine for ${view.fill.cost} ichor">${pending === index ? '…' : 'Refine'}${price(view.fill.cost)}</button>`;
      return `<li class="refine-slot is-open${armed && view.openWrite ? ' is-target' : ''}">`
        +`<span class="refine-gem" aria-hidden="true">◇</span>`
        +`<div class="refine-text"><b>Empty slot</b><p>${armed ? 'Write the book’s modifier here.' : 'Roll a random modifier and its rarity.'}</p></div>`
        +`${button}</li>`;
    }
    return `<li class="refine-slot is-locked"><span class="refine-gem" aria-hidden="true">◇</span><div class="refine-text"><b>Locked</b><p>Fill the slot above first.</p></div></li>`;
  }).join('');
  // Named weapons (src/mastery.mjs): the fourth slot waits for the weapon's name.
  const named = view.named || {};
  const nameRow = named.name || view.kind === 'armour' ? '' : `<li class="refine-slot is-locked is-name"><span class="refine-gem" aria-hidden="true">✧</span>`
    +`<div class="refine-text"><b>Named slot</b><p>Fell ${named.need || NAMED.elders} elders with it (the Hollow King counts for ${NAMED.king}, a great boss ${NAMED.boss}) and it earns a name and a fourth slot · ${Math.min(named.elders || 0, named.need || NAMED.elders)}/${named.need || NAMED.elders}</p>`
    +`<span class="name-bar" aria-hidden="true"><em style="width:${Math.min(100, (named.elders || 0)/(named.need || NAMED.elders)*100).toFixed(1)}%"></em></span></div></li>`;
  const odds = refineOdds().map((chance, tier) => `<span class="rarity-${RARITIES[tier]}">${cap(RARITIES[tier])} ${chance}%</span>`).join('');
  const shots = SHOTS[view.itemId];
  const special = view.kind === 'armour' ? 'Armour rolls its own modifiers: health, guard, speed, and armour that fights back.'
    : view.kind === 'shots' ? `<b>Split</b> (+1 ${esc(shots[0])}, or +2 when legendary) rolls only epic or legendary.`
    : view.kind === 'melee' ? '<b>Long</b> (more reach), <b>Crescent</b>, <b>Echoing</b> and <b>Aftershock</b> roll only on blades and other swung weapons.' : '';
  const needs = view.kind === 'armour' ? '' : ' Cruel and Shattering roll only beside Keen; a book writes them anywhere.';
  const owner = view.kind === 'armour' ? 'the next one you wear keeps them' : `the next ${esc(view.name)} you carry keeps them`;
  return `<div class="refine">`
    +`<div class="refine-head${named.name ? ' is-named' : ''}">${icons.weapon || ''}<div>`
    +(named.name ? `<h3 class="refine-name is-named">${esc(named.name)}</h3><p class="refine-title">${esc(view.name)} · ${esc(named.title || '')}</p>` : `<h3 class="refine-name rarity-${view.rarity}">${esc(view.name)}</h3>`)
    +`<p>Modifiers belong to you, not the item: ${owner}.</p></div>`
    +`<span class="refine-purse" title="Dread ichor at hand (pack and nearby chests)">${icons.ichor || ''}<b>${view.have}</b></span></div>`
    +`<ol class="refine-slots${armed ? ' is-writing' : ''}">${rows}${nameRow}</ol>`
    +booksMarkup(view, bookIcon)
    +ascendMarkup(ascend, icons, ascending)
    +`<p class="refine-note">Rerolling replaces that modifier with a new roll, better or worse. ${special}${needs}</p>`
    +`<p class="refine-odds">${odds}</p>`
    +`<p class="refine-note">Dread ichor drops only from creatures: a little from briarlings, more from wraiths, bonewalkers and boglings, a handful from gravekeepers and golems, and a hoard from the Hollow King. Elders drop it more often. Modifier books turn up like any loot: in caches, and now and then from creatures.</p>`
    +`</div>`;
}
