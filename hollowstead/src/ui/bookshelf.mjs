// The bookshelf panel (src/bookshelf.mjs): markup only. main.mjs sends {type: 'shelf', op: 'take',
// shelfId, bookId, count} when a Take button is tapped and {type: 'shelf', op: 'store', shelfId} for
// Shelve all. Rows reuse the Refine panel's book styling.
import {REFINE} from '../refine-mods.mjs?v=harvest-18';
import {SHELF} from '../bookshelf.mjs?v=harvest-18';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[ch]);
const cap = word => word.charAt(0).toUpperCase()+word.slice(1);

/**
 * `rows`: shelfRows(); `packBooks`: modifier books in the pack; `bookIcon(id)`: icon markup;
 * `text(row)`: what the book writes; `pending`: the button waiting on the host ('store' or a book id).
 */
export function shelfMarkup({rows = [], packBooks = 0, bookIcon = () => '', text = () => '', pending = ''} = {}){
  const total = rows.reduce((n, row) => n+row.count, 0);
  const busy = !!pending;
  const store = `<button type="button" class="primary" data-shelf-store="1" ${busy || !packBooks ? 'disabled' : ''}>${pending === 'store' ? '…' : packBooks ? `Shelve ${packBooks} from your pack` : 'No books in your pack'}</button>`;
  const list = rows.map(row => `<li class="shelf-row"><div class="refine-book rarity-${row.rarity}">`
    +`${bookIcon(row.id)}<span class="refine-book-text"><b>${esc(row.name)}</b><small>${cap(row.rarity)} · ×${row.count}</small>`
    +`<em>${esc(REFINE.mods[row.mod]?.name || row.mod)} · ${esc(text(row))}</em></span></div>`
    +`<span class="shelf-take"><button type="button" data-shelf-take="${esc(row.id)}" data-count="1" ${busy ? 'disabled' : ''}>${pending === row.id ? '…' : 'Take 1'}</button>`
    +(row.count > 1 ? `<button type="button" data-shelf-take="${esc(row.id)}" data-count="0" ${busy ? 'disabled' : ''}>All</button>` : '')
    +`</span></li>`).join('');
  return `<div class="refine shelf">`
    +`<div class="shelf-head"><p>${total ? `${total} ${total === 1 ? 'book' : 'books'} on the shelf.` : 'The shelf is empty.'} No slots and no limit: shelve as many as you find.</p>${store}</div>`
    +(list ? `<section class="refine-books"><ul>${list}</ul></section>` : '')
    +`<p class="refine-note">A workbench within ${SHELF.reach} paces writes straight from this shelf: pick the book on its Refine panel and it comes off the shelf by itself. If the shelf is taken down or broken, its books fall to the ground.</p>`
    +`</div>`;
}
