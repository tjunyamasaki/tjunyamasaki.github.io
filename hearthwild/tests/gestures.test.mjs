import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroundGesture, clampZoom } from '../input/gestures.mjs';
import { EMBER, MOONLIT, paletteColor } from '../data/palettes.mjs';

function harness() {
  let zoom = 1;
  const taps = [];
  let stops = 0;
  const gesture = createGroundGesture({
    getZoom: () => zoom,
    onZoom: value => { zoom = value; },
    onGesture: () => { stops += 1; },
    onTap: (x, y) => taps.push([x, y]),
  });
  return { gesture, taps, get zoom() { return zoom; }, get stops() { return stops; } };
}

test('single-finger taps move only on release, while drags and cancellation never move', () => {
  const h = harness();
  h.gesture.down(1, 20, 30);
  assert.equal(h.taps.length, 0);
  h.gesture.up(1, 23, 31);
  assert.deepEqual(h.taps, [[23, 31]]);
  h.gesture.down(2, 20, 30);
  h.gesture.move(2, 80, 80);
  h.gesture.up(2, 80, 80);
  h.gesture.down(3, 20, 30);
  h.gesture.up(3, 20, 30, true);
  assert.equal(h.taps.length, 1);
});

test('pinch doubles zoom and releasing either finger cannot trigger a tap', () => {
  const h = harness();
  h.gesture.down(1, 0, 0);
  h.gesture.down(2, 100, 0);
  h.gesture.move(2, 200, 0);
  assert.equal(h.zoom, 2);
  assert.equal(h.stops, 1);
  h.gesture.up(2, 200, 0);
  h.gesture.up(1, 0, 0);
  assert.equal(h.taps.length, 0);
  h.gesture.down(3, 25, 25);
  h.gesture.up(3, 25, 25);
  assert.equal(h.taps.length, 1);
});

test('zoom is bounded and interrupted gestures cannot leak into a new input', () => {
  const h = harness();
  h.gesture.down(1, 0, 0);
  h.gesture.down(2, 100, 0);
  h.gesture.move(2, 1000, 0);
  assert.equal(h.zoom, 10);
  h.gesture.move(2, 10, 0);
  assert.equal(h.zoom, 1);
  h.gesture.clear();
  h.gesture.up(1, 0, 0);
  assert.equal(h.taps.length, 0);
  assert.equal(clampZoom(NaN), 1);
  assert.equal(clampZoom(-4), 1);
  assert.equal(clampZoom(3), 3);
  assert.equal(clampZoom(30), 14);
});

test('ember colors explicitly remap night, terrain and lights; moonlit is recoverable', () => {
  assert.equal(paletteColor(MOONLIT.night, 'ember'), EMBER.night);
  assert.equal(paletteColor(MOONLIT.gold, 'ember'), EMBER.gold);
  assert.equal(paletteColor(0x30565b, 'ember'), 0x473225);
  assert.equal(paletteColor(0x30565b, 'moonlit'), 0x30565b);
  assert.equal(paletteColor(0x627774, 'ember'), 0x987055);
  assert.equal(paletteColor(0xd3924a, 'ember'), 0xffb45a);
  assert.equal(paletteColor(0xa33d68, 'ember'), 0xd94a63);
  assert.equal(paletteColor(0x3d7358, 'ember'), 0x7a3a28);
  assert.equal(paletteColor(0x6a5340, 'ember'), 0x8a4a2a);
});
