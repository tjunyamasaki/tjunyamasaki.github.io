import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENEMIES} from '../src/content.mjs';
import {markerPulse, targetMarker} from '../src/target-marker.mjs';

const theme = JSON.parse(readFileSync(new URL('../themes/harvest/theme.json', import.meta.url), 'utf8'));

test('the target marker fits the target: small for a drop, wide for the Heartfire, capped either way', () => {
  const drop = targetMarker(theme, {x: 0, z: 0, stack: {itemId: 'berry', quantity: 1}});
  const chest = targetMarker(theme, {type: 'chest'}), hearth = targetMarker(theme, {type: 'hearth'});
  assert.ok(drop.radius < chest.radius && chest.radius < hearth.radius);
  assert.ok(hearth.radius <= 2.1 && drop.radius >= .55);
  assert.equal(targetMarker(theme, null), null);
});

test('creatures get the hostile colour, elites a wider marker', () => {
  const type = Object.keys(ENEMIES).find(key => theme.sprites[key]);
  const foe = targetMarker(theme, {type}), elite = targetMarker(theme, {type, elite: true});
  assert.equal(foe.hostile, true);
  assert.notEqual(foe.color, targetMarker(theme, {type: 'chest'}).color);
  assert.ok(elite.radius >= foe.radius);
  for(let t = 0; t < 4; t += .1) assert.ok(Math.abs(markerPulse(t) - 1) < .06);
});
