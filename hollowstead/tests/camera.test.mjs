import test from 'node:test';
import assert from 'node:assert/strict';
import {orthographicHalf} from '../src/camera.mjs';

test('portrait and tall desktop keep their camera distance; phone landscape moves closer', () => {
  assert.equal(orthographicHalf(390, 844), 12);
  assert.equal(orthographicHalf(360, 780), 12);
  assert.equal(orthographicHalf(1920, 1080), 13);
  assert.equal(orthographicHalf(2560, 1440), 13);
  const landscape = orthographicHalf(844, 390);
  const oldLandscape = 13;
  assert.ok(landscape < oldLandscape);
  assert.equal(landscape, 390 * 12 / 844);
  const pixelsPerUnit = 390 / (2 * landscape);
  const portraitPixels = 844 / (2 * 12);
  assert.ok(Math.abs(pixelsPerUnit - portraitPixels) < 0.01);
});
