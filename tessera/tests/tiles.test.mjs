import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE_TYPES, TYPE_BY_ID, tileBag, edgeAt, featureAtPort, rotatePoint, RES } from '../src/tiles.mjs';

test('the land holds 72 tiles: 71 in the bag plus the starting tile', () => {
  assert.equal(TILE_TYPES.reduce((n, t) => n + t.count, 0), 72);
  assert.equal(tileBag().length, 71);
});

test('edges follow the classic tiles', () => {
  const expected = { A: 'FFRF', B: 'FFFF', C: 'CCCC', D: 'CRFR', H: 'FCFC', I: 'FCCF', L: 'CRRR', P: 'CRRC', S: 'CCRC', U: 'RFRF', V: 'FFRR', X: 'RRRR' };
  for (const [id, edges] of Object.entries(expected)) assert.equal(TYPE_BY_ID[id].edges.join(''), edges, id);
});

test('meadows are split by roads and towns exactly as drawn', () => {
  const fields = id => TYPE_BY_ID[id].features.filter(f => f.type === 'field');
  assert.equal(fields('B').length, 1);
  assert.equal(fields('D').length, 2);
  assert.equal(fields('L').length, 3);
  assert.equal(fields('X').length, 4);
  assert.equal(fields('H').length, 1);
  assert.deepEqual(fields('H')[0].cities.sort(), [0, 1]);
  // The road-side meadow of a gate road touches the town; the far one does not.
  const [north, south] = fields('D');
  assert.deepEqual(north.cities, [0]);
  assert.deepEqual(south.cities, []);
});

test('every port belongs to exactly one feature and every anchor sits on its own feature', () => {
  for (const t of TILE_TYPES) {
    const owned = t.features.flatMap(f => f.ports).sort((a, b) => a - b);
    assert.deepEqual(owned, [...Array(12).keys()], t.id);
    t.features.forEach((f, fi) => {
      const x = Math.floor(f.anchor[0] * RES), y = Math.floor(f.anchor[1] * RES);
      assert.equal(t.labels[y * RES + x], fi, `${t.id} feature ${fi}`);
    });
  }
});

test('rotation turns sides and ports clockwise', () => {
  const d = TYPE_BY_ID.D;
  assert.equal(edgeAt(d, 1, 1), 'C');
  assert.equal(featureAtPort(d, 1, 4), featureAtPort(d, 0, 1));
  assert.deepEqual(rotatePoint(0.5, 0, 1), [1, 0.5]);
  assert.deepEqual(rotatePoint(0.5, 0, 4), [0.5, 0]);
});
