import test from 'node:test';
import assert from 'node:assert/strict';
import {LOW_HEALTH, createHurtFx, dangerLevel, heartbeat, hurtFlash} from '../src/hurt-fx.mjs';

function overlay(){
  const els = {'.hurt-flash': {style: {opacity: '0'}}, '.hurt-danger': {style: {opacity: '0'}}};
  return {els, root: {querySelector: sel => els[sel]}};
}

test('a hit flashes the edges, harder for a bigger share of health', () => {
  assert.equal(hurtFlash(0, 100), 0);
  assert.ok(hurtFlash(2, 100) >= .4);
  assert.ok(hurtFlash(30, 100) > hurtFlash(5, 100));
  assert.equal(hurtFlash(500, 100), 1);
});

test('danger starts below the low-health line and is full when downed', () => {
  assert.equal(dangerLevel({hp: 100}, 100), 0);
  assert.equal(dangerLevel({hp: LOW_HEALTH * 100 + 1}, 100), 0);
  assert.ok(dangerLevel({hp: LOW_HEALTH * 100 - 1}, 100) > .3);
  assert.ok(dangerLevel({hp: 5}, 100) > dangerLevel({hp: 25}, 100));
  assert.equal(dangerLevel({hp: 0, down: true}, 100), 1);
  assert.equal(dangerLevel({hp: 0, ghost: true}, 100), 0);
  for(let t = 0; t < 3; t += .05){const b = heartbeat(t, .8); assert.ok(b >= 0 && b <= 1);}
});

test('the overlay flashes when health drops, not when it rises, and fades out', () => {
  const {els, root} = overlay(), fx = createHurtFx(root);
  fx.update({id: 'a', hp: 100}, 100, .016);
  assert.equal(els['.hurt-flash'].style.opacity, '0');
  fx.update({id: 'a', hp: 80}, 100, .016);
  assert.ok(Number(els['.hurt-flash'].style.opacity) > .5);
  for(let i = 0; i < 60; i++) fx.update({id: 'a', hp: 90}, 100, .016);
  assert.equal(els['.hurt-flash'].style.opacity, '0');
  fx.update({id: 'a', hp: 10}, 100, .016);
  assert.ok(Number(els['.hurt-danger'].style.opacity) > 0);
  fx.update(null, 1, .016);
  assert.equal(els['.hurt-danger'].style.opacity, '0');
});
