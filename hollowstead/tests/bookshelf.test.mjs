import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {createActionSession} from '../src/transactions.mjs';
import {STACK_LIMIT} from '../src/contracts.mjs';
import {countItem} from '../src/inventory.mjs';
import {bookId} from '../src/refine-mods.mjs';
import {carriedBooks} from '../src/refine.mjs';
import {SHELF, shelfBooks, shelfCount} from '../src/bookshelf.mjs';

function library(){
  const w = new World(21), p = w.addPlayer('host');
  w.start();
  const shelf = w.structure('bookshelf', p.x+1, p.z), bench = w.structure('bench', p.x-1, p.z);
  w.buildings.push(shelf, bench);
  return {w, p, shelf, bench};
}
function runner(w, actor){
  let clock = 0, n = 0;
  const session = createActionSession({getWorld: () => w, actorId: actor.id, now: () => clock});
  return value => {clock += 60; n += 1; return session.execute({...value, requestId: `${session.sessionId}:${n}`, worldId: w.networkId});};
}

test('a bookshelf keeps any number of books, past the stack limit and with no slots', () => {
  const {w, p, shelf} = library(), run = runner(w, p), keen = bookId('keen', 2);
  for(let i = 0; i < 3; i++){
    w.give(p, keen, STACK_LIMIT);
    assert.equal(run({type: 'buildingAction', targetId: shelf.id, actionId: 'shelve'}).ok, true);
  }
  assert.equal(shelfBooks(shelf)[keen], STACK_LIMIT*3);
  assert.equal(countItem(p.inventory, keen), 0);
  // Taking some down: one, then all that fit.
  assert.equal(run({type: 'shelf', op: 'take', shelfId: shelf.id, bookId: keen, count: 1}).ok, true);
  assert.equal(countItem(p.inventory, keen), 1);
  assert.equal(shelfBooks(shelf)[keen], STACK_LIMIT*3-1);
  assert.equal(run({type: 'shelf', op: 'store', shelfId: shelf.id}).ok, true);
  assert.equal(shelfCount(shelf), STACK_LIMIT*3);
});

test('taking books never spills them: only what fits in the pack leaves the shelf', () => {
  const {w, p, shelf} = library(), run = runner(w, p), honed = bookId('honed', 0);
  shelf.books = {[honed]: STACK_LIMIT*40};
  const drops = w.drops.length;
  assert.equal(run({type: 'shelf', op: 'take', shelfId: shelf.id, bookId: honed}).ok, true);
  const got = countItem(p.inventory, honed);
  assert.ok(got > 0 && got < STACK_LIMIT*40);
  assert.equal(shelfBooks(shelf)[honed], STACK_LIMIT*40-got);
  assert.equal(w.drops.length, drops);
});

test('the workbench writes a shelved book without anyone taking it down', () => {
  const {w, p, shelf, bench} = library(), run = runner(w, p), keen = bookId('keen', 4);
  shelf.books = {[keen]: 2};
  w.grantEquipped(p, 'sword');
  assert.deepEqual(carriedBooks(w, p, bench), [{id: keen, count: 2}]);
  assert.deepEqual(carriedBooks(w, p), []);
  const result = run({type: 'refine', stationId: bench.id, itemId: 'sword', slot: 0, bookId: keen});
  assert.equal(result.ok, true);
  assert.deepEqual(p.refine.sword, [{mod: 'keen', tier: 4}]);
  assert.equal(shelfBooks(shelf)[keen], 1);
  // Too far from the bench, the shelf is out of its reach.
  shelf.x = bench.x+SHELF.reach+1;
  assert.deepEqual(carriedBooks(w, p, bench), []);
});

test('a dismantled or broken shelf drops its books', () => {
  const {w, p, shelf} = library(), keen = bookId('keen', 1);
  shelf.books = {[keen]: STACK_LIMIT+5};
  w.finishDismantle(p, shelf);
  assert.equal(w.buildings.includes(shelf), false);
  const dropped = w.drops.filter(d => d.stack.itemId === keen).reduce((n, d) => n+d.stack.quantity, 0);
  assert.equal(dropped, STACK_LIMIT+5);
  const other = w.structure('bookshelf', p.x+2, p.z);
  other.books = {[keen]: 3};w.buildings.push(other);other.hp = 0;
  w.tick(.05);
  assert.equal(w.drops.filter(d => d.stack.itemId === keen).reduce((n, d) => n+d.stack.quantity, 0), STACK_LIMIT+8);
});

test('a shelved book survives a save and a reload', () => {
  const {w, shelf} = library(), keen = bookId('keen', 0);
  shelf.books = {[keen]: 99};
  const back = World.restore(JSON.parse(JSON.stringify(w.snapshot({purpose: 'save'}))));
  assert.equal(shelfBooks(back.buildings.find(b => b.id === shelf.id))[keen], 99);
});
