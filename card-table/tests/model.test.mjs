import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addPlayer, apply, viewFor, buildFaces, DECK_PRESETS, NeedsHost, OpError } from '../src/model.js';

let n = 0;
function seeded(seed = 7) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
const ctx = { rng: seeded(), newCardId: () => `c${++n}`, isHost: true };

function table() {
  const s = createState({ hostPid: 'h', hostName: 'Host' });
  addPlayer(s, 'g', 'Guest');
  apply(s, { type: 'newDeck', cfg: DECK_PRESETS[0].cfg }, 'h', ctx);
  return s;
}
const deckOf = (s) => Object.values(s.piles).find((p) => p.role === 'deck');
const discardOf = (s) => Object.values(s.piles).find((p) => p.role === 'discard');
const total = (s) => Object.values(s.piles).reduce((a, p) => a + p.cards.length, 0) + Object.values(s.players).reduce((a, p) => a + p.hand.length, 0);

test('deck presets build the right counts', () => {
  const counts = Object.fromEntries(DECK_PRESETS.map((p) => [p.id, buildFaces(p.cfg).length]));
  assert.deepEqual(counts, { std52: 52, std54: 54, double: 108, deck40: 40, deck32: 32, deck24: 24, pinochle: 48, colors: 108, num104: 104, num100: 98 });
});

test('dealing, drawing and playing keep every card in exactly one place', () => {
  const s = table();
  apply(s, { type: 'deal', from: deckOf(s).id, count: 5 }, 'h', ctx);
  assert.equal(s.players.h.hand.length, 5);
  assert.equal(s.players.g.hand.length, 5);
  assert.equal(deckOf(s).cards.length, 42);
  const card = s.players.g.hand[0];
  apply(s, { type: 'move', ids: [card], to: { pile: discardOf(s).id }, face: 'up' }, 'g', ctx);
  assert.equal(discardOf(s).cards.at(-1), card);
  assert.equal(s.cards[card].up, true);
  apply(s, { type: 'move', ids: [deckOf(s).cards.at(-1)], to: { hand: 'g' } }, 'g', ctx);
  assert.equal(s.players.g.hand.length, 5);
  assert.equal(total(s), 52);
  assert.match(s.log.at(-1).text, /drew a card from Deck/);
});

test('guests never see hidden faces and shuffling renames cards', () => {
  const s = table();
  apply(s, { type: 'deal', from: deckOf(s).id, count: 3 }, 'h', ctx);
  const v = viewFor(s, 'g');
  for (const id of s.players.h.hand) assert.equal(v.cards[id].f, null);
  for (const id of s.players.g.hand) assert.ok(v.cards[id].f);
  for (const id of deckOf(v).cards) assert.equal(v.cards[id].f, null);
  const before = [...deckOf(s).cards];
  apply(s, { type: 'shuffle', pile: deckOf(s).id }, 'h', ctx);
  assert.ok(deckOf(s).cards.every((id) => !before.includes(id)));
  assert.equal(total(s), 52);
});

test('a guest cannot pull a named card out of another hand, but can take one at random', () => {
  const s = table();
  apply(s, { type: 'deal', from: deckOf(s).id, count: 2 }, 'h', ctx);
  assert.throws(() => apply(s, { type: 'move', ids: [s.players.h.hand[0]], to: { hand: 'g' } }, 'g', ctx), OpError);
  apply(s, { type: 'take', from: 'h' }, 'g', ctx);
  assert.equal(s.players.g.hand.length, 3);
  assert.equal(s.players.h.hand.length, 1);
});

test('optimistic guests defer chance to the host', () => {
  const s = table();
  const v = viewFor(s, 'g');
  assert.throws(() => apply(v, { type: 'shuffle', pile: deckOf(v).id }, 'g', {}), NeedsHost);
  apply(v, { type: 'move', ids: [deckOf(v).cards.at(-1)], to: { x: 2, z: 1 } }, 'g', {});
  assert.equal(Object.keys(v.piles).length, 3);
});

test('auto piles vanish when emptied, kept piles stay', () => {
  const s = table();
  const top = deckOf(s).cards.at(-1);
  apply(s, { type: 'move', ids: [top], to: { x: 2, z: 0 } }, 'h', ctx);
  assert.equal(Object.keys(s.piles).length, 3);
  apply(s, { type: 'move', ids: [top], to: { hand: 'h' } }, 'h', ctx);
  assert.equal(Object.keys(s.piles).length, 2);
  apply(s, { type: 'deal', from: deckOf(s).id, count: 'all' }, 'h', ctx);
  assert.ok(deckOf(s));
  assert.equal(deckOf(s).cards.length, 0);
});

test('gather returns everything to a shuffled, face-down deck', () => {
  const s = table();
  apply(s, { type: 'deal', from: deckOf(s).id, count: 4, to: 'table', face: 'up' }, 'h', ctx);
  apply(s, { type: 'gather' }, 'g', ctx);
  assert.equal(deckOf(s).cards.length, 52);
  assert.ok(deckOf(s).cards.every((id) => !s.cards[id].up));
  assert.equal(Object.keys(s.piles).length, 2);
});

test('leaving puts the hand back on the table, nothing is lost', () => {
  const s = table();
  apply(s, { type: 'deal', from: deckOf(s).id, count: 7 }, 'h', ctx);
  apply(s, { type: 'leave' }, 'g', ctx);
  assert.equal(s.players.g, undefined);
  assert.equal(total(s), 52);
});
