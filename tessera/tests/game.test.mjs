import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPE_BY_ID, TILE_TYPES } from '../src/tiles.mjs';
import { createGame, placeTile, placeFollower, followerOptions, legalPlacements, restoreGame, majority, projectedFinal, FOLLOWERS } from '../src/game.mjs';
import { chooseMove } from '../src/ai.mjs';
import { createRng } from '../src/rng.mjs';

const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: '#fff' }));
const fieldOf = (id, n = 0) => TYPE_BY_ID[id].features.findIndex((f, i, all) => f.type === 'field' && all.slice(0, i).filter(x => x.type === 'field').length === n);
const featureOf = (id, type) => TYPE_BY_ID[id].features.findIndex(f => f.type === type);

function play(g, id, x, y, rot, feature = null) {
  g.tile = TYPE_BY_ID[id].index;
  placeTile(g, x, y, rot);
  return placeFollower(g, feature);
}

test('a closed two-tile town scores 4 and returns its follower', () => {
  const g = createGame({ players: players(2), seed: 1 });
  const events = play(g, 'E', 0, -1, 2, featureOf('E', 'city'));
  const score = events.find(e => e.kind === 'score');
  assert.equal(score.feature, 'city');
  assert.equal(score.points, 4);
  assert.deepEqual(score.winners, [0]);
  assert.equal(g.players[0].score, 4);
  assert.equal(g.players[0].followers, FOLLOWERS);
});

test('a road between two abbeys scores one point per tile', () => {
  const g = createGame({ players: players(2), seed: 2 });
  play(g, 'A', -1, 0, 3, featureOf('A', 'road'));
  play(g, 'V', 1, 0, 0);
  const events = play(g, 'A', 1, 1, 2);
  const road = events.find(e => e.kind === 'score' && e.feature === 'road');
  assert.equal(road.points, 4);
  assert.deepEqual(road.winners, [0]);
});

test('tiles that do not match are refused', () => {
  const g = createGame({ players: players(2), seed: 3 });
  g.tile = TYPE_BY_ID.B.index;
  assert.throws(() => placeTile(g, 0, -1, 0));
  assert.throws(() => placeTile(g, 5, 5, 0));
});

test('a follower cannot join a feature someone already holds', () => {
  const g = createGame({ players: players(2), seed: 4 });
  play(g, 'U', 1, 0, 1, featureOf('U', 'road'));
  g.tile = TYPE_BY_ID.U.index;
  placeTile(g, -1, 0, 1);
  assert.ok(!followerOptions(g).some(o => o.type === 'road'));
});

test('meadow followers earn 3 per finished town at the end', () => {
  const g = createGame({ players: players(2), seed: 5 });
  g.deck = [];
  const events = play(g, 'E', 0, -1, 2, fieldOf('E'));
  const field = events.find(e => e.kind === 'score' && e.feature === 'field');
  assert.equal(field.points, 3);
  assert.equal(g.phase, 'over');
  assert.equal(g.players[0].score, 3);
});

test('an unfinished abbey scores itself plus its neighbours at the end', () => {
  const g = createGame({ players: players(2), seed: 6 });
  play(g, 'B', 0, 1, 0, featureOf('B', 'monastery'));
  g.deck = [];
  const events = play(g, 'U', 1, 0, 1);
  const abbey = events.find(e => e.kind === 'score' && e.feature === 'monastery');
  // Itself, the starting tile above it and the road tile diagonally beside it.
  assert.equal(abbey.points, 3);
});

test('ties share the points', () => {
  assert.deepEqual(majority([{ player: 1 }, { player: 0 }]), [0, 1]);
  assert.deepEqual(majority([{ player: 1 }, { player: 0 }, { player: 1 }]), [1]);
  assert.deepEqual(majority([]), []);
});

function randomGame(seed, n = 3) {
  const g = createGame({ players: players(n), seed });
  const rng = createRng(seed ^ 0x55);
  while (g.phase !== 'over') {
    const moves = legalPlacements(g);
    assert.ok(moves.length > 0);
    const m = moves[Math.floor(rng() * moves.length)];
    placeTile(g, m.x, m.y, m.rot);
    const opts = followerOptions(g);
    placeFollower(g, rng() < 0.6 && opts.length ? opts[Math.floor(rng() * opts.length)].feature : null);
    for (const p of g.players) {
      const onBoard = g.tiles.reduce((k, t) => k + t.followers.filter(f => f.player === p.id).length, 0);
      assert.equal(p.followers + onBoard, FOLLOWERS);
    }
  }
  return g;
}

test('random games always finish with every tile used or discarded', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = randomGame(seed);
    assert.ok(g.tiles.length <= 72 && g.tiles.length > 60);
    assert.equal(g.deck.length, 0);
    for (const p of g.players) assert.ok(p.score >= 0);
  }
});

test('a saved game replays to the same kingdom and scores', () => {
  const g = randomGame(77, 4);
  const again = restoreGame({ players: players(4), seed: 77 }, g.actions);
  assert.deepEqual(again.players.map(p => p.score), g.players.map(p => p.score));
  assert.equal(again.tiles.length, g.tiles.length);
});

test('projected final points never go negative', () => {
  const g = randomGame(9);
  assert.ok(projectedFinal(g).every(v => v >= 0));
});

test('bots finish a whole game and beat random play', () => {
  let botWins = 0;
  for (let seed = 1; seed <= 2; seed++) {
    const g = createGame({ players: players(2), seed });
    const rng = createRng(seed);
    while (g.phase !== 'over') {
      if (g.current === 0) {
        const m = chooseMove(g, 'normal', rng);
        placeTile(g, m.x, m.y, m.rot);
        placeFollower(g, m.feature);
      } else {
        const moves = legalPlacements(g);
        const m = moves[Math.floor(rng() * moves.length)];
        placeTile(g, m.x, m.y, m.rot);
        const opts = followerOptions(g);
        placeFollower(g, opts.length && rng() < 0.5 ? opts[0].feature : null);
      }
    }
    if (g.players[0].score > g.players[1].score) botWins++;
  }
  assert.equal(botWins, 2);
});

test('every tile type can appear in a legal spot next to the start', () => {
  for (const t of TILE_TYPES) {
    const g = createGame({ players: players(2), seed: 1 });
    g.tile = t.index;
    assert.ok(legalPlacements(g).length > 0, t.id);
  }
});
