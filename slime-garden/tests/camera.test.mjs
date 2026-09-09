import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BUTTON_ZOOM_DELTA_PX,
  CAMERA_DAMP,
  clampWheelDeltaY,
  createCameraRig,
  DISTANCE_MIN,
  fitFarmOverviewDistance,
  FOCUS_TARGET_Y,
  maxDistanceForAspect,
  normalizeWheelDeltaY,
  PHASE2_CAMERA_PITCH,
  PHASE2_CAMERA_YAW,
  PITCH_MAX,
  PITCH_MIN,
  TARGET_Y_OVERVIEW,
  WHEEL_DELTA_CLAMP_PX,
  WHEEL_LINE_PX,
  WHEEL_PAGE_PX,
  zoomFactorFromWheel,
} from '../src/scene/camera.mjs';
import { GATE_STAGING, HOME_SLOTS } from '../src/world/layout.mjs';

function freezeEconomy() {
  return Object.freeze({
    berries: 6,
    totalFeeds: 2,
    glowMicro: 40_000,
    foods: Object.freeze([]),
  });
}

function assertFiniteView(view, limits) {
  assert.equal(Number.isFinite(view.yaw), true, 'yaw finite');
  assert.equal(Number.isFinite(view.pitch), true, 'pitch finite');
  assert.equal(Number.isFinite(view.distance), true, 'distance finite');
  assert.equal(Number.isFinite(view.target.x), true, 'target.x finite');
  assert.equal(Number.isFinite(view.target.y), true, 'target.y finite');
  assert.equal(Number.isFinite(view.target.z), true, 'target.z finite');
  assert.ok(view.pitch >= PITCH_MIN - 1e-9 && view.pitch <= PITCH_MAX + 1e-9, 'pitch in range');
  assert.ok(view.distance >= limits.min - 1e-9, 'distance >= min');
  assert.ok(view.distance <= limits.max + 1e-6, 'distance <= max');
  assert.ok(view.distance === view.distance, 'distance not NaN');
}

function makeRig(extra = {}) {
  const rig = createCameraRig({ reducedMotion: true, ...extra });
  rig.resize(1280, 720);
  return rig;
}

describe('phase-2 camera rig', () => {
  test('defaults are phase-2 (pitch 0.72, not v1 0.65) and overview-fit the farm', () => {
    const rig = makeRig();
    const view = rig.getView();
    assert.equal(view.framing, 'overview');
    assert.equal(view.yaw, PHASE2_CAMERA_YAW);
    assert.equal(view.pitch, PHASE2_CAMERA_PITCH);
    assert.equal(view.target.x, 0);
    assert.equal(view.target.y, TARGET_Y_OVERVIEW);
    assert.equal(view.target.z, 0);
    const expected = fitFarmOverviewDistance(1280 / 720);
    assert.ok(Math.abs(view.distance - expected) < 1e-6);
    assert.ok(view.distance >= DISTANCE_MIN);
    assert.ok(GATE_STAGING.z === -12);
    assert.equal(HOME_SLOTS.length, 10);
    assert.equal(CAMERA_DAMP, 4);
  });

  test('wheel line vs page vs pixel; huge deltas clamp; distance stays in [min, max]', () => {
    const px100 = zoomFactorFromWheel(100, 0);
    const line3 = zoomFactorFromWheel(3, 1);
    const page1 = zoomFactorFromWheel(1, 2);
    const huge = zoomFactorFromWheel(1e9, 0);
    const clampedTick = zoomFactorFromWheel(WHEEL_DELTA_CLAMP_PX, 0);

    assert.equal(normalizeWheelDeltaY(3, 1), 3 * WHEEL_LINE_PX);
    assert.equal(normalizeWheelDeltaY(1, 2), WHEEL_PAGE_PX);
    assert.equal(normalizeWheelDeltaY(40, 0), 40);
    assert.ok(line3 !== px100, 'line units differ from raw pixels before clamp');
    assert.equal(page1, clampedTick);
    assert.equal(huge, clampedTick);
    assert.equal(clampWheelDeltaY(1e9), WHEEL_DELTA_CLAMP_PX);
    assert.equal(clampWheelDeltaY(-1e9), -WHEEL_DELTA_CLAMP_PX);

    const rig = makeRig();
    const start = rig.getView().distance;
    const limits = rig.getDistanceLimits();
    rig.zoom(1e9, 0);
    const afterOut = rig.getView().distance;
    assert.ok(Math.abs(afterOut - start * huge) < 1e-6);
    assertFiniteView(rig.getView(), limits);

    for (let i = 0; i < 80; i += 1) rig.zoom(1e6, 0);
    assertFiniteView(rig.getView(), rig.getDistanceLimits());
    assert.ok(rig.getView().distance <= rig.getDistanceLimits().max + 1e-6);

    for (let i = 0; i < 80; i += 1) rig.zoom(-1e6, 0);
    assertFiniteView(rig.getView(), rig.getDistanceLimits());
    assert.ok(rig.getView().distance >= DISTANCE_MIN - 1e-9);

    rig.zoom({ deltaY: 80, deltaMode: 0, ctrlKey: true });
    rig.zoom({ deltaY: 80, deltaMode: 0, metaKey: true });
    assert.equal(rig.getView().distance, rig.getView().distance);
  });

  test('buttons/keyboard zoom steps share the same clamp as a wheel tick', () => {
    const rig = makeRig();
    const start = rig.getView().distance;
    rig.zoom(1e9, 0);
    const fromHugeWheel = rig.getView().distance;
    rig.reset();
    assert.equal(rig.getView().framing, 'overview');
    rig.zoomStep(1);
    const fromButton = rig.getView().distance;
    assert.equal(fromHugeWheel, fromButton);
    assert.equal(
      zoomFactorFromWheel(1e9, 0),
      zoomFactorFromWheel(BUTTON_ZOOM_DELTA_PX, 0),
    );

    rig.reset();
    rig.zoom(-1e9, 0);
    const wheelIn = rig.getView().distance;
    rig.reset();
    rig.zoomStep(-1);
    assert.equal(rig.getView().distance, wheelIn);
    assert.ok(fromButton > start);
    assert.ok(wheelIn < start);
  });

  test('resize overview refits; custom orbit/zoom preserves yaw/distance; extreme aspects stay finite', () => {
    const rig = makeRig();
    rig.resize(1600, 900);
    const land = rig.getView().distance;
    assert.equal(rig.getView().framing, 'overview');
    rig.resize(360, 800);
    const port = rig.getView().distance;
    assert.equal(rig.getView().framing, 'overview');
    assert.notEqual(land, port);
    assert.ok(port >= land, 'portrait overview needs at least as much distance');

    rig.resize(1280, 720);
    rig.orbit(40, 12);
    rig.zoom(60, 0);
    const custom = rig.getView();
    assert.equal(custom.framing, 'custom');
    const yaw = custom.yaw;
    const dist = custom.distance;
    const pitch = custom.pitch;
    rig.resize(800, 600);
    const preserved = rig.getView();
    assert.equal(preserved.framing, 'custom');
    assert.ok(Math.abs(preserved.yaw - yaw) < 1e-12);
    assert.ok(Math.abs(preserved.pitch - pitch) < 1e-12);
    assert.ok(Math.abs(preserved.distance - dist) < 1e-9);

    for (const [w, h] of [
      [360, 800],
      [1600, 400],
      [200, 200],
    ]) {
      const extreme = createCameraRig({ reducedMotion: true });
      extreme.resize(w, h);
      assertFiniteView(extreme.getView(), extreme.getDistanceLimits());
      extreme.orbit(800, 800);
      extreme.zoom(1e7, 0);
      extreme.pan(400, -300);
      assertFiniteView(extreme.getView(), extreme.getDistanceLimits());
      extreme.resize(0, 100);
      extreme.resize(100, 0);
      extreme.resize(Number.NaN, 400);
      assertFiniteView(extreme.getView(), extreme.getDistanceLimits());
    }

    const naiveWidthScale = fitFarmOverviewDistance(16 / 9) * (16 / 9);
    assert.notEqual(fitFarmOverviewDistance(16 / 9), naiveWidthScale);
  });

  test('reset returns overview and frames farm+gate with finite fit ≥ min', () => {
    const rig = makeRig();
    rig.orbit(-90, 20);
    rig.zoom(-40, 0);
    rig.pan(80, 40);
    rig.focusResident({ x: 6, z: -3 });
    rig.reset();
    const view = rig.getView();
    assert.equal(view.framing, 'overview');
    assert.equal(view.yaw, PHASE2_CAMERA_YAW);
    assert.equal(view.pitch, PHASE2_CAMERA_PITCH);
    assert.equal(view.target.x, 0);
    assert.equal(view.target.y, TARGET_Y_OVERVIEW);
    assert.equal(view.target.z, 0);
    const fit = fitFarmOverviewDistance(1280 / 720);
    assert.ok(Math.abs(view.distance - fit) < 1e-6);
    assert.ok(view.distance >= DISTANCE_MIN);
    assert.equal(Number.isFinite(view.distance), true);
    assert.ok(maxDistanceForAspect(1280 / 720) >= 60);
    assert.ok(rig.getFarPlane() > maxDistanceForAspect(1280 / 720));
    assert.equal(Number.isFinite(rig.getFarPlane()), true);
  });

  test('focus sets custom target once; later update does not chase a moving point', () => {
    const rig = makeRig();
    const pos = { x: 6, z: -3 };
    rig.focusResident(pos);
    const first = rig.getView();
    assert.equal(first.framing, 'custom');
    assert.equal(first.target.x, 6);
    assert.equal(first.target.z, -3);
    assert.equal(first.target.y, FOCUS_TARGET_Y);
    pos.x = -6;
    pos.z = 2;
    rig.update(1);
    const second = rig.getView();
    assert.equal(second.target.x, 6);
    assert.equal(second.target.z, -3);
    assert.equal(second.target.y, FOCUS_TARGET_Y);
    rig.focusResident(pos);
    assert.equal(rig.getView().target.x, -6);
    assert.equal(rig.getView().target.z, 2);
  });

  test('camera traces do not mutate a frozen dummy economy object', () => {
    const economy = freezeEconomy();
    const rig = makeRig();
    rig.orbit(25, -8);
    rig.zoom(120, 1);
    rig.zoomStep(-1);
    rig.pan(-30, 18);
    rig.pinch({ scale: 1.15, dxCss: 4, dyCss: -3 });
    rig.focusResident({ x: -6, z: 2 });
    rig.resize(900, 500);
    rig.reset();
    rig.update(0.016);
    rig.applyIntent({ type: 'ORBIT', dxCss: 3, dyCss: 1 });
    const cam = {
      fov: 50,
      near: 1,
      far: 10,
      aspect: 1,
      position: {
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        },
      },
      lookAt() {},
      updateProjectionMatrix() {},
    };
    rig.applyTo(cam);
    assert.equal(economy.berries, 6);
    assert.equal(economy.totalFeeds, 2);
    assert.equal(cam.fov, 35);
    assert.equal(cam.near, 0.05);
    assert.equal(Number.isFinite(cam.far), true);
    assert.ok(cam.far > 0);
    assert.equal(Number.isFinite(cam.position.x), true);
  });

  test('reduced motion applies immediately; damping otherwise moves current toward desired', () => {
    const live = createCameraRig({ reducedMotion: false });
    live.resize(1280, 720);
    const yaw0 = live.getView().yaw;
    live.orbit(50, 0);
    assert.equal(live.getView().yaw, yaw0);
    live.update(0.05);
    assert.notEqual(live.getView().yaw, yaw0);
    live.setReducedMotion(true);
    live.orbit(-20, 0);
    const after = live.getView().yaw;
    live.update(0.05);
    assert.equal(live.getView().yaw, after);
  });

  test('pan target stays inside the resident rectangle; yaw does not snap a full turn', () => {
    const rig = makeRig();
    for (let i = 0; i < 40; i += 1) rig.pan(400, 400);
    const t = rig.getView().target;
    assert.ok(t.x <= 10.8 + 1e-9 && t.x >= -10.8 - 1e-9);
    assert.ok(t.z <= 8.8 + 1e-9 && t.z >= -8.8 - 1e-9);
    rig.orbit(20000, 0);
    const yaw = rig.getView().yaw;
    assert.equal(Number.isFinite(yaw), true);
    rig.reset();
    assert.equal(rig.getView().yaw, 0);
  });
});
