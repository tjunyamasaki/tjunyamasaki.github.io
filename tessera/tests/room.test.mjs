import test from 'node:test';
import assert from 'node:assert/strict';
import * as room from '../src/room.mjs';
import { restoreGame, legalPlacements, followerOptions, placeTile } from '../src/game.mjs';

const { HOST_ID } = room;

function table(...guests) {
  const g = room.createGame('Ana');
  for (const id of guests) room.addPlayer(g, id, `Guest ${id}`);
  return g;
}

/** Play the first legal move for whoever's turn it is, as that player. */
function humanMove(g, pid) {
  const e = room.engineOf(g);
  const [m] = legalPlacements(e);
  room.applyAction(g, pid, { action: 'tile', x: m.x, y: m.y, rot: m.rot });
  return room.applyAction(g, pid, { action: 'follower', f: null });
}

test('guests take seats in the lobby and lose them when they leave it', () => {
  const g = table('b', 'c');
  assert.deepEqual(g.seats.map(s => s.pid), [HOST_ID, 'b', 'c']);
  assert.equal(new Set(g.seats.map(s => s.color)).size, 3);
  room.setConnected(g, 'c', false);
  assert.deepEqual(g.seats.map(s => s.pid), [HOST_ID, 'b']);
  assert.equal(g.players.c, undefined);
});

test('the table holds five seats and closes once the game starts', () => {
  const g = table('b', 'c', 'd', 'e');
  assert.equal(room.canAdmit(g, 'f'), false);
  room.applyAction(g, HOST_ID, { action: 'removeSeat', seat: 4 });
  assert.equal(room.canAdmit(g, 'f'), true);
  room.applyAction(g, HOST_ID, { action: 'start', seed: 7 });
  assert.equal(room.canAdmit(g, 'f'), false);
  assert.equal(room.canAdmit(g, 'b'), true, 'a seated player may come back');
});

test('only the host changes the table', () => {
  const g = table('b');
  room.applyAction(g, 'b', { action: 'addBot' });
  room.applyAction(g, 'b', { action: 'start' });
  assert.equal(g.seats.length, 2);
  assert.equal(g.phase, 'lobby');
  room.applyAction(g, HOST_ID, { action: 'addBot', level: 'hard' });
  assert.equal(g.seats[2].kind, 'hard');
});

const turnPid = g => g.seats[room.engineOf(g).current].pid;
const seatIndex = (g, pid) => g.seats.findIndex(s => s.pid === pid);
const otherPid = (g, pid) => g.seats.find(s => s.kind === 'human' && s.pid !== pid).pid;

test('players move only on their own turn, and every move is checked', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 11 });
  assert.equal(g.phase, 'playing');
  const me = turnPid(g), them = otherPid(g, me);
  const [m] = legalPlacements(room.engineOf(g));
  room.applyAction(g, them, { action: 'tile', x: m.x, y: m.y, rot: m.rot });
  assert.equal(g.actions.length, 0);
  assert.equal(room.snapshotFor(g, them).notice.text, 'It is not your turn.');
  room.applyAction(g, me, { action: 'tile', x: 99, y: 99, rot: 0 });
  assert.equal(g.actions.length, 0);
  room.applyAction(g, me, { action: 'tile', x: m.x, y: m.y, rot: m.rot });
  assert.equal(g.actions.length, 1);
  room.applyAction(g, them, { action: 'follower', f: null });
  assert.equal(g.actions.length, 1, 'still the same turn');
  room.applyAction(g, me, { action: 'follower', f: null });
  assert.equal(g.actions.length, 2);
  assert.equal(turnPid(g), them);
});

test('the turn order is shuffled when the game begins, and the seats follow it', () => {
  const orders = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const g = table('b', 'c');
    room.applyAction(g, HOST_ID, { action: 'addBot' });
    room.applyAction(g, HOST_ID, { action: 'start', seed });
    const order = g.seats.map(s => s.pid || s.name).join(',');
    orders.add(order);
    assert.deepEqual(g.game.players.map(p => p.name), g.seats.map(s => s.name), 'engine players follow the seats');
    assert.equal(g.game.even, true);
  }
  assert.ok(orders.size > 3, `only saw ${[...orders].join(' | ')}`);
});

test('snapshots carry enough to rebuild the same kingdom', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 3 });
  humanMove(g, turnPid(g));
  humanMove(g, turnPid(g));
  const snap = room.snapshotFor(g, 'b');
  const copy = restoreGame(snap.game, snap.actions);
  assert.deepEqual(copy.players.map(p => p.score), room.engineOf(g).players.map(p => p.score));
  assert.equal(copy.tile, room.engineOf(g).tile);
  assert.equal(snap.current, 0);
  assert.equal(JSON.parse(JSON.stringify(snap)).actions.length, 4, 'snapshots are plain JSON');
});

test('bots play on the host timer until a person is up', () => {
  const g = table();
  room.applyAction(g, HOST_ID, { action: 'addBot', level: 'easy' });
  room.applyAction(g, HOST_ID, { action: 'addBot', level: 'easy' });
  room.applyAction(g, HOST_ID, { action: 'start', seed: 5 });
  let guard = 0;
  while (turnPid(g) !== HOST_ID && guard++ < 5) room.afterPause(g, 'bot');
  assert.equal(turnPid(g), HOST_ID);
  const after = humanMove(g, HOST_ID);
  assert.equal(after.pause, 'bot');
  let next = room.afterPause(g, 'bot');
  assert.equal(next.pause, 'bot');
  next = room.afterPause(g, 'bot');
  assert.equal(next.pause, undefined, 'back to the person');
  assert.equal(turnPid(g), HOST_ID);
});

test('an absent player can be handed to a bot and takes the seat back on return', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 9 });
  if (turnPid(g) === 'b') humanMove(g, 'b');
  humanMove(g, HOST_ID);
  const seat = seatIndex(g, 'b');
  assert.equal(room.applyAction(g, HOST_ID, { action: 'auto', seat, on: true }).pause, undefined, 'not while they are here');
  room.setConnected(g, 'b', false);
  assert.equal(g.seats.length, 2, 'their seat waits for them mid-game');
  assert.equal(room.applyAction(g, HOST_ID, { action: 'auto', seat, on: true }).pause, 'bot');
  const before = g.actions.length;
  room.afterPause(g, 'bot');
  assert.equal(g.actions.length, before + 2);
  room.reconnectPlayer(g, 'b', 'Bea');
  assert.equal(g.seats[seat].auto, false);
});

test('a stand-in finishes a turn its player left half done', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 4 });
  if (turnPid(g) === HOST_ID) humanMove(g, HOST_ID);
  const [m] = legalPlacements(room.engineOf(g));
  room.applyAction(g, 'b', { action: 'tile', x: m.x, y: m.y, rot: m.rot });
  const before = g.actions.length;
  room.setConnected(g, 'b', false);
  room.applyAction(g, HOST_ID, { action: 'auto', seat: seatIndex(g, 'b'), on: true });
  room.afterPause(g, 'bot');
  assert.equal(g.actions.length, before + 1);
  assert.equal(g.actions.at(-1).a, 'follower');
});

test('a full game between bots ends with equal turns, and the table returns to the lobby', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'addBot', level: 'easy' });
  room.applyAction(g, HOST_ID, { action: 'start', seed: 21 });
  room.setConnected(g, 'b', false);
  g.seats[seatIndex(g, HOST_ID)].auto = true; // let the host's seat be played too, for the test
  room.applyAction(g, HOST_ID, { action: 'auto', seat: seatIndex(g, 'b'), on: true });
  let guard = 0;
  while (g.phase === 'playing' && guard++ < 200) room.afterPause(g, 'bot');
  assert.equal(g.phase, 'over');
  const laid = [0, 1, 2].map(p => room.engineOf(g).tiles.filter(t => t.player === p).length);
  assert.equal(new Set(laid).size, 1, `tiles laid: ${laid}`);
  assert.equal(room.snapshotFor(g, HOST_ID).phase, 'over');
  room.applyAction(g, HOST_ID, { action: 'lobby' });
  assert.equal(g.phase, 'lobby');
  assert.deepEqual(g.seats.map(s => s.kind).sort(), ['easy', 'human'], 'the absent player gives up their seat');
  assert.equal(g.seats.find(s => s.pid === HOST_ID).auto, undefined);
});

test('a saved table restores with everyone but the host away', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 2 });
  humanMove(g, turnPid(g));
  const saved = JSON.parse(JSON.stringify(g));
  const back = room.restoreGame(saved, 'Ana');
  assert.equal(back.players.b.connected, false);
  assert.equal(back.players[HOST_ID].connected, true);
  assert.equal(room.engineOf(back).current, 1);
  assert.equal(room.engineOf(back).even, true);
  const e = room.engineOf(back);
  const [m] = legalPlacements(e);
  placeTile(e, m.x, m.y, m.rot);
  assert.ok(Array.isArray(followerOptions(e)));
});
