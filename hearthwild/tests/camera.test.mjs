import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraState, viewMovement, DEFAULT_PITCH } from '../render/camera.mjs';
import { createGroundGesture } from '../input/gestures.mjs';

test('screen-relative movement follows orbit without changing speed', () => {
  const moved = viewMovement(1, 0, Math.PI / 2);
  assert.ok(Math.abs(moved.x) < 1e-9);
  assert.ok(Math.abs(moved.z + 1) < 1e-9);
  for (const yaw of [-3, -1, 0, 1, 3]) {
    const v = viewMovement(0.6, 0.8, yaw);
    assert.ok(Math.abs(Math.hypot(v.x, v.z) - 1) < 1e-9);
  }
});
test('orbit elevation is safe, pan is bounded, and reset restores Fit framing', () => {
  const camera = createCameraState();
  camera.orbit(800, 10000);
  assert.ok(camera.view.pitch < Math.PI / 2);
  camera.orbit(0, -10000);
  assert.ok(camera.view.pitch > 0);
  camera.pan(1e6, -1e6, 0.1);
  assert.ok(Math.abs(camera.view.panX) <= 26 && Math.abs(camera.view.panZ) <= 26);
  camera.reset();
  assert.deepEqual(camera.view, { yaw: 0, pitch: DEFAULT_PITCH, panX: 0, panZ: 0 });
});
test('pan limit can grow with a larger island', () => {
  const camera = createCameraState({ panLimit: 48 });
  camera.pan(1e6, 0, 0.1);
  assert.ok(Math.abs(camera.view.panX) <= 48);
  assert.ok(Math.abs(camera.view.panX) > 26);
});
test('two-finger pan is forwarded and never becomes a tap when fingers release', () => {
  const pans = [], taps = [];
  const g = createGroundGesture({ getZoom: () => 5, onZoom() {}, onGesture() {}, onPan: (x,y) => pans.push([x,y]), onTap: (...p) => taps.push(p) });
  g.down(1, 0, 0); g.down(2, 100, 0);
  g.move(1, 20, 10); g.move(2, 120, 10);
  g.up(1, 20, 10); g.up(2, 120, 10);
  assert.deepEqual(pans, [[10, 5], [10, 5]]);
  assert.equal(taps.length, 0);
});
