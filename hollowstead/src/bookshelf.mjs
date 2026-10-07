// The bookshelf: a camp piece that keeps modifier books (refine-mods.mjs). Unlike a chest it has no
// slot grid and no stack limit: it is a plain tally, {bookId: count}, so a shelf holds every book the
// party ever finds. A workbench writes from any shelf within SHELF.reach of it, so nobody has to
// fetch a book off the shelf first (refine.mjs carriedBooks and refineWeapon).
//
// Host commands: {type: 'shelf', op: 'store', shelfId, bookId?} puts the pack's books (or one kind)
// on the shelf; {type: 'shelf', op: 'take', shelfId, bookId, count} takes some back into the pack.
// A shelf that is dismantled, removed or destroyed spills its books on the ground like a chest.
import {SPILL_LIFETIME_SECONDS, STACK_LIMIT, inReach} from './contracts.mjs?v=harvest-18';
import {planInsert} from './inventory.mjs?v=harvest-18';
import {bookOf, isBook} from './refine-mods.mjs?v=harvest-18';

export const SHELF = Object.freeze({
  type: 'bookshelf',
  /** A workbench reads every shelf this close to it. */
  reach: 12,
});

const isShelf = b => b?.type === SHELF.type && b.hp > 0;
/** A shelf's books as a clean tally: known book ids with whole positive counts only. */
export function shelfBooks(b){
  const out = {};
  if(!b?.books || typeof b.books !== 'object' || Array.isArray(b.books)) return out;
  for(const [id, n] of Object.entries(b.books)) if(isBook(id) && Number.isSafeInteger(n) && n > 0) out[id] = n;
  return out;
}
export const shelfCount = b => Object.values(shelfBooks(b)).reduce((sum, n) => sum+n, 0);
/** Living shelves within SHELF.reach of a point (a workbench), nearest first. */
export function shelvesNear(world, x, z, reach = SHELF.reach){
  return (world?.buildings || []).filter(b => isShelf(b) && Math.hypot(b.x-x, b.z-z) <= reach)
    .sort((a, b) => Math.hypot(a.x-x, a.z-z)-Math.hypot(b.x-x, b.z-z));
}
/** Takes one `bookId` from the shelves near (x, z). True when one was there. */
export function takeShelfBook(world, x, z, bookId){
  for(const b of shelvesNear(world, x, z)){
    const books = shelfBooks(b);
    if(!(books[bookId] > 0)) continue;
    books[bookId]--;
    if(!books[bookId]) delete books[bookId];
    b.books = books;
    return true;
  }
  return false;
}
/** A shelf's books as panel rows: [{id, name, rarity, tier, mod, count}], rarest first. */
export function shelfRows(b){
  return Object.entries(shelfBooks(b)).map(([id, count]) => ({id, count, ...bookOf(id)}))
    .sort((a, b) => b.tier-a.tier || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Host: the 'shelf' world action. */
export function shelfAction(world, p, cmd){
  const reject = (text, code = 'rejected') => {if(text) world.tell(p, text); return {ok: false, code};};
  const b = world.buildings.find(entry => entry.id === cmd?.shelfId && isShelf(entry));
  if(!b) return reject('', 'invalidCommand');
  if(!inReach(Math.hypot(p.x-b.x, p.z-b.z))) return reject('Stand at the bookshelf', 'outOfRange');
  if(cmd.op === 'store') return storeBooks(world, p, b, typeof cmd.bookId === 'string' ? cmd.bookId : null);
  if(cmd.op === 'take') return takeBooks(world, p, b, cmd.bookId, cmd.count);
  return reject('', 'invalidCommand');
}

/** Every modifier book in the pack (or only `only`) goes on the shelf. */
export function storeBooks(world, p, b, only = null){
  const books = shelfBooks(b);
  let moved = 0;
  p.inventory.slots = p.inventory.slots.map(stack => {
    if(!stack || !isBook(stack.itemId) || (only && stack.itemId !== only)) return stack;
    books[stack.itemId] = (books[stack.itemId] || 0)+stack.quantity;
    moved += stack.quantity;
    return null;
  });
  if(!moved){world.tell(p, only ? 'You carry no such book' : 'You carry no modifier books'); return {ok: false, code: 'rejected'};}
  p.inventory.revision++;
  b.books = books;
  world.event('loot', b.x, b.z, `${moved} ${moved === 1 ? 'book' : 'books'} shelved`);
  world.assertItems?.();
  return {ok: true, code: 'ok', moved};
}

/** `count` of `bookId` (all of them when not a positive whole number) back into the pack, as far as it has room. */
export function takeBooks(world, p, b, bookId, count){
  const books = shelfBooks(b), have = books[bookId] || 0;
  if(!isBook(bookId) || !have){world.tell(p, 'That book is not on the shelf'); return {ok: false, code: 'rejected'};}
  const want = Number.isSafeInteger(count) && count > 0 ? Math.min(count, have) : have;
  // Only what fits leaves the shelf: the rest stays put rather than spilling at the wanderer's feet.
  let got = 0;
  while(got < want){
    const stack = world.mintStack(bookId, Math.min(STACK_LIMIT, want-got));
    if(!stack) break;
    const plan = planInsert(p.inventory, stack, {supplyCapacity: null, allowPartial: true, grow: false, acceptsItems: true, mintUid: () => world.nextItemUid()});
    if(!plan.ok || !(plan.accepted > 0)) break;
    p.inventory.slots = plan.slots; p.inventory.revision = plan.revision;
    got += plan.accepted;
    if(plan.remainder) break;
  }
  if(!got){world.tell(p, 'Pack full — store or drop some supplies'); return {ok: false, code: 'inventoryFull'};}
  books[bookId] = have-got;
  if(!books[bookId]) delete books[bookId];
  b.books = books;
  if(got < want) world.tell(p, 'Your pack is full');
  world.assertItems?.();
  return {ok: true, code: 'ok', taken: got};
}

/** A shelf that is going away drops its books where it stood (they lie as long as a broken chest's). */
export function spillShelf(world, b){
  if(b?.type !== SHELF.type) return;
  for(const [id, count] of Object.entries(shelfBooks(b))){
    let left = count;
    while(left > 0){
      const n = Math.min(STACK_LIMIT, left), stack = world.mintStack(id, n);
      if(!stack) break;
      world.placeDrop(stack, b.x, b.z, SPILL_LIFETIME_SECONDS);
      left -= n;
    }
  }
  b.books = {};
}
