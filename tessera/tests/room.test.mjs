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

test('players move only on their own turn, and every move is checked', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 11 });
  assert.equal(g.phase, 'playing');
  const e = room.engineOf(g);
  const [m] = legalPlacements(e);
  room.applyAction(g, 'b', { action: 'tile', x: m.x, y: m.y, rot: m.rot });
  assert.equal(g.actions.length, 0);
  assert.equal(room.snapshotFor(g, 'b').notice.text, 'It is not your turn.');
  room.applyAction(g, HOST_ID, { action: 'tile', x: 99, y: 99, rot: 0 });
  assert.equal(g.actions.length, 0);
  room.applyAction(g, HOST_ID, { action: 'tile', x: m.x, y: m.y, rot: m.rot });
  assert.equal(g.actions.length, 1);
  room.applyAction(g, 'b', { action: 'follower', f: null });
  assert.equal(g.actions.length, 1, 'still the host’s turn');
  room.applyAction(g, HOST_ID, { action: 'follower', f: null });
  assert.equal(g.actions.length, 2);
  assert.equal(room.engineOf(g).current, 1);
});

test('snapshots carry enough to rebuild the same kingdom', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 3 });
  humanMove(g, HOST_ID);
  humanMove(g, 'b');
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
  const after = humanMove(g, HOST_ID);
  assert.equal(after.pause, 'bot');
  let next = room.afterPause(g, 'bot');
  assert.equal(next.pause, 'bot');
  next = room.afterPause(g, 'bot');
  assert.equal(next.pause, undefined, 'back to the person');
  assert.equal(g.actions.length, 6);
  assert.equal(room.engineOf(g).current, 0);
});

test('an absent player can be handed to a bot and takes the seat back on return', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 9 });
  humanMove(g, HOST_ID);
  assert.equal(room.applyAction(g, HOST_ID, { action: 'auto', seat: 1, on: true }).pause, undefined, 'not while they are here');
  room.setConnected(g, 'b', false);
  assert.equal(g.seats.length, 2, 'their seat waits for them mid-game');
  assert.equal(room.applyAction(g, HOST_ID, { action: 'auto', seat: 1, on: true }).pause, 'bot');
  room.afterPause(g, 'bot');
  assert.equal(g.actions.length, 4);
  room.reconnectPlayer(g, 'b', 'Bea');
  assert.equal(g.seats[1].auto, false);
});

test('a stand-in finishes a turn its player left half done', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 4 });
  humanMove(g, HOST_ID);
  const e = room.engineOf(g);
  const [m] = legalPlacements(e);
  room.applyAction(g, 'b', { action: 'tile', x: m.x, y: m.y, rot: m.rot });
  room.setConnected(g, 'b', false);
  room.applyAction(g, HOST_ID, { action: 'auto', seat: 1, on: true });
  room.afterPause(g, 'bot');
  assert.equal(g.actions.length, 4);
  assert.equal(g.actions[3].a, 'follower');
});

test('a full game between bots ends, and the table returns to the lobby', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'addBot', level: 'easy' });
  room.applyAction(g, HOST_ID, { action: 'start', seed: 21 });
  room.setConnected(g, 'b', false);
  g.seats[0].auto = true; // let the host's seat be played too, for the test
  room.applyAction(g, HOST_ID, { action: 'auto', seat: 1, on: true });
  let guard = 0;
  while (g.phase === 'playing' && guard++ < 200) room.afterPause(g, 'bot');
  assert.equal(g.phase, 'over');
  assert.equal(room.snapshotFor(g, HOST_ID).phase, 'over');
  room.applyAction(g, HOST_ID, { action: 'lobby' });
  assert.equal(g.phase, 'lobby');
  assert.deepEqual(g.seats.map(s => s.kind), ['human', 'easy'], 'the absent player gives up their seat');
  assert.equal(g.seats[0].auto, undefined);
});

test('a saved table restores with everyone but the host away', () => {
  const g = table('b');
  room.applyAction(g, HOST_ID, { action: 'start', seed: 2 });
  humanMove(g, HOST_ID);
  const saved = JSON.parse(JSON.stringify(g));
  const back = room.restoreGame(saved, 'Ana');
  assert.equal(back.players.b.connected, false);
  assert.equal(back.players[HOST_ID].connected, true);
  assert.equal(room.engineOf(back).current, 1);
  const e = room.engineOf(back);
  const [m] = legalPlacements(e);
  placeTile(e, m.x, m.y, m.rot);
  assert.ok(Array.isArray(followerOptions(e)));
});
