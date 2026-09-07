import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, applyCommand, createState, displayPose, resolveMoveInput, step } from '../core/state.mjs';
import { isInside, vertexRadius } from '../world/boundary.mjs';
import { generateWorld } from '../world/generate.mjs';
import { GENERATOR_VERSION, MOVE_SPEED, TICK_SECONDS } from '../data/tuning.mjs';

function playing() {
  const state = createState();
  applyCommand(state, { type: 'enter' });
  return state;
}

test('intro freezes simulation until enter', () => {
  const state = createState();
  const original = structuredClone(state);
  step(state, { x: 1, z: 1 }, 1);
  assert.deepEqual(state, original);
  assert.equal(applyCommand(state, { type: 'returnToClearing' }).ok, false);
  assert.equal(applyCommand(state, { type: 'enter' }).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(applyCommand(state, { type: 'enter' }).reason, 'already-entered');
});

test('diagonal keyboard input is normalized', () => {
  const cardinal = playing();
  const diagonal = playing();
  step(cardinal, { x: 1 }, TICK_SECONDS);
  step(diagonal, { x: 1, z: 1 }, TICK_SECONDS);
  const cardinalDistance = Math.hypot(cardinal.player.x, cardinal.player.z);
  const diagonalDistance = Math.hypot(diagonal.player.x, diagonal.player.z);
  assert.ok(Math.abs(cardinalDistance - diagonalDistance) < 1e-9);
  const resolved = resolveMoveInput({ x: 0, z: 0 }, new Set(['KeyW', 'KeyD']), null);
  assert.ok(Math.abs(Math.hypot(resolved.x, resolved.z) - 1) < 1e-9);
});

test('fixed-step catch-up is capped and ignores huge deltas', () => {
  const state = playing();
  const first = advance(state, { x: 1 }, 10, 0);
  assert.equal(state.tick, 5);
  assert.ok(Math.abs(state.elapsed - 5 * TICK_SECONDS) < 1e-9);
  assert.equal(first.leftover, 0);
  assert.ok(state.player.x <= MOVE_SPEED * 5 * TICK_SECONDS + 1e-9);
  const x = state.player.x;
  const z = state.player.z;
  const frozen = advance(state, { x: 1, paused: true }, 4, 0.5);
  assert.equal(state.player.x, x);
  assert.equal(state.player.z, z);
  assert.equal(state.player.moving, false);
  assert.equal(frozen.leftover, 0);
});

test('non-finite input cannot teleport the keeper', () => {
  const state = playing();
  step(state, { x: Infinity, z: NaN }, Number.NaN);
  assert.ok(Number.isFinite(state.player.x));
  assert.ok(Number.isFinite(state.player.z));
  assert.equal(state.player.x, 0);
});

test('pause cancels motion and returnToClearing restores spawn', () => {
  const state = playing();
  for (let i = 0; i < 40; i++) step(state, { x: 1, z: 1 }, TICK_SECONDS);
  assert.ok(Math.hypot(state.player.x, state.player.z) > 1);
  const paused = structuredClone(state);
  step(state, { x: 1, paused: true }, TICK_SECONDS);
  assert.equal(state.player.x, paused.player.x);
  assert.equal(state.player.moving, false);
  const result = applyCommand(state, { type: 'returnToClearing' });
  assert.equal(result.ok, true);
  assert.equal(result.events[0].type, 'returned');
  assert.equal(state.player.x, state.clearing.x);
  assert.equal(state.player.z, state.clearing.z);
  assert.equal(state.player.moving, false);
});

test('click steering arrives and then stops', () => {
  const state = playing();
  const target = { x: 2, z: -1.5 };
  let arrived = false;
  for (let i = 0; i < 400; i++) {
    const move = resolveMoveInput(state.player, new Set(), target);
    if (move.arrived) { arrived = true; break; }
    step(state, move, TICK_SECONDS);
  }
  assert.equal(arrived, true);
  assert.ok(Math.hypot(state.player.x - target.x, state.player.z - target.z) < 0.2);
});

test('walking into the rim never leaves the walkable polygon', () => {
  for (let angle = 0; angle < 360; angle += 15) {
    const state = playing();
    const x = Math.cos(angle * Math.PI / 180);
    const z = Math.sin(angle * Math.PI / 180);
    for (let i = 0; i < 500; i++) step(state, { x, z }, TICK_SECONDS);
    assert.equal(isInside(state.boundary, state.player.x, state.player.z, state.walkMargin), true);
    assert.ok(Number.isFinite(state.player.x));
  }
});

test('render pose interpolates between ticks instead of snapping', () => {
  const state = playing();
  advance(state, { x: 1 }, TICK_SECONDS, 0);
  const start = state.playerPrev.x;
  const end = state.player.x;
  assert.ok(end > start);
  assert.equal(displayPose(state, 0).x, start);
  assert.ok(Math.abs(displayPose(state, TICK_SECONDS / 2).x - (start + end) / 2) < 1e-9);
  assert.ok(Math.abs(displayPose(state, TICK_SECONDS).x - end) < 1e-9);
});

test('unknown commands are rejected and seeded worlds carry resources', () => {
  const state = playing();
  assert.equal(applyCommand(state, { type: 'grantWood' }).ok, false);
  const world = generateWorld('hearthwild-review-a');
  assert.equal(world.generatorVersion, GENERATOR_VERSION);
  assert.ok(world.nodes.length >= 35);
  assert.ok(world.nodes.some(node => node.kind === 'copper'));
  assert.ok(world.boundary.polygon.map(vertexRadius).every(radius => radius > 19));
});
