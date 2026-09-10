import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FENCE_CENTERLINE_X,
  FENCE_CENTERLINE_Z,
  FARM_INTERIOR_DEPTH,
  FARM_INTERIOR_WIDTH,
  GATE_INSIDE_WAYPOINT,
  GATE_OPENING_MAX_X,
  GATE_OPENING_MIN_X,
  GATE_OPENING_Z,
  GATE_STAGING,
  HOME_SLOTS,
  PROP_RADIUS,
  STATIC_PROPS,
  isInResidentDomain,
} from '../src/world/layout.mjs';
import {
  distantBushesAreOutside,
  distantBushPositions,
  dirtPathCenters,
  enabledPadCount,
  FARM_VISUAL,
  FENCE_FADE_OPACITY,
  FENCE_HEIGHT,
  fenceRailSegments,
  gatePostPositions,
  padIsEnabled,
} from '../src/scene/farm-geometry.mjs';

const THREE_SKIP_MESSAGE =
  'Three.js scene graph unavailable in this environment; pure layout assertions still ran.';

/** @type {typeof import('../vendor/three/three.module.js') | null} */
let THREE = null;
/** @type {typeof import('../src/scene/habitat-farm.mjs') | null} */
let farmMod = null;
/** @type {string | false} */
let threeSkip = THREE_SKIP_MESSAGE;

try {
  THREE = await import('../vendor/three/three.module.js');
  farmMod = await import('../src/scene/habitat-farm.mjs');
  const probe = new THREE.Group();
  if (probe && THREE.Mesh && farmMod.createFarmHabitat) threeSkip = false;
} catch (error) {
  THREE = null;
  farmMod = null;
  threeSkip = `${THREE_SKIP_MESSAGE} (${error && error.message ? error.message : error})`;
}

/**
 * @param {{ capacity?: number, shrubLevel?: number }} [options]
 */
function mount(options = {}) {
  if (!THREE || !farmMod) throw new Error(THREE_SKIP_MESSAGE);
  const scene = new THREE.Scene();
  const habitat = farmMod.createFarmHabitat(THREE, scene, options);
  return { scene, habitat };
}

/**
 * @param {{ group: { getObjectByName: Function } }} habitat
 * @param {string} prefix
 * @param {number} count
 */
function countVisible(habitat, prefix, count) {
  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const node = habitat.group.getObjectByName(`${prefix}${i}`);
    if (node && node.visible) n += 1;
  }
  return n;
}

describe('farm visual layout matches world/layout.mjs', () => {
  test('FARM_VISUAL is the collision farm, not a second 24×20', () => {
    assert.equal(FARM_VISUAL.width, FARM_INTERIOR_WIDTH);
    assert.equal(FARM_VISUAL.depth, FARM_INTERIOR_DEPTH);
    assert.equal(FARM_VISUAL.fenceX, FENCE_CENTERLINE_X);
    assert.equal(FARM_VISUAL.fenceZ, FENCE_CENTERLINE_Z);
    assert.equal(FARM_INTERIOR_WIDTH, 24);
    assert.equal(FARM_INTERIOR_DEPTH, 20);
    assert.equal(FENCE_CENTERLINE_X, 12);
    assert.equal(FENCE_CENTERLINE_Z, 10);
    assert.equal(FARM_VISUAL.gateOpeningMinX, GATE_OPENING_MIN_X);
    assert.equal(FARM_VISUAL.gateOpeningMaxX, GATE_OPENING_MAX_X);
    assert.equal(FARM_VISUAL.gateOpeningZ, GATE_OPENING_Z);
    assert.equal(FARM_VISUAL.propRadius, PROP_RADIUS);
    assert.equal(PROP_RADIUS, 0.5);
  });

  test('fence rails use fence centerlines and omit the gate gap', () => {
    const segments = fenceRailSegments();
    assert.equal(segments.length, 5);
    const north = segments.find((s) => s.id === 'north');
    assert.deepEqual(north.from, { x: -FENCE_CENTERLINE_X, z: FENCE_CENTERLINE_Z });
    assert.deepEqual(north.to, { x: FENCE_CENTERLINE_X, z: FENCE_CENTERLINE_Z });

    const south = segments.filter((s) => s.side === 'south');
    assert.equal(south.length, 2);
    for (const seg of south) {
      const minX = Math.min(seg.from.x, seg.to.x);
      const maxX = Math.max(seg.from.x, seg.to.x);
      assert.ok(0 < minX - 1e-9 || 0 > maxX + 1e-9, 'gap x=0 is not a south rail');
      assert.equal(seg.from.z, GATE_OPENING_Z);
      assert.equal(seg.to.z, GATE_OPENING_Z);
    }
    const westGap = south.find((s) => s.id === 'south-west');
    assert.equal(westGap.to.x, GATE_OPENING_MIN_X);
    const eastGap = south.find((s) => s.id === 'south-east');
    assert.equal(eastGap.from.x, GATE_OPENING_MAX_X);
    assert.equal(GATE_OPENING_MIN_X, -1.8);
    assert.equal(GATE_OPENING_MAX_X, 1.8);
    assert.equal(GATE_OPENING_Z, -10);
  });

  test('gate posts sit on the gap edges', () => {
    const posts = gatePostPositions();
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[0], { id: 'west', x: GATE_OPENING_MIN_X, z: GATE_OPENING_Z });
    assert.deepEqual(posts[1], { id: 'east', x: GATE_OPENING_MAX_X, z: GATE_OPENING_Z });
  });

  test('HOME_SLOTS and STATIC_PROPS are the shared lists', () => {
    assert.equal(HOME_SLOTS.length, 10);
    assert.deepEqual(HOME_SLOTS[0], { x: 0, z: 2 });
    assert.deepEqual(HOME_SLOTS[9], { x: 6, z: -3 });
    assert.equal(STATIC_PROPS.length, 3);
    assert.deepEqual(
      STATIC_PROPS.map((p) => p.id),
      ['shrub', 'pantry', 'bloom'],
    );
    assert.deepEqual(STATIC_PROPS[0], { id: 'shrub', x: -10.8, z: -5.5, radius: 0.5 });
    assert.deepEqual(STATIC_PROPS[1], { id: 'pantry', x: -10.8, z: 5.5, radius: 0.5 });
    assert.deepEqual(STATIC_PROPS[2], { id: 'bloom', x: 10.8, z: -4.5, radius: 0.5 });
  });

  test('capacity 6 enables the first six pads; 10 enables all', () => {
    assert.equal(enabledPadCount(6), 6);
    assert.equal(enabledPadCount(10), 10);
    assert.equal(enabledPadCount(99), 10);
    for (let i = 0; i < 10; i += 1) {
      assert.equal(padIsEnabled(6, i), i < 6);
      assert.equal(padIsEnabled(10, i), true);
    }
  });

  test('dirt path starts at gate staging; bushes stay outside the fence', () => {
    assert.equal(dirtPathCenters()[0].x, GATE_STAGING.x);
    assert.equal(dirtPathCenters()[0].z, GATE_STAGING.z);
    assert.equal(distantBushesAreOutside(), true);
    for (const bush of distantBushPositions()) {
      assert.equal(isInResidentDomain(bush), false);
      assert.ok(
        Math.abs(bush.x) > FENCE_CENTERLINE_X || Math.abs(bush.z) > FENCE_CENTERLINE_Z,
      );
    }
  });

  test('fence height is in the 0.7–0.9 band', () => {
    assert.ok(FENCE_HEIGHT >= 0.7 && FENCE_HEIGHT <= 0.9);
    assert.equal(FENCE_FADE_OPACITY, 0.25);
  });
});

describe('farm habitat meshes', () => {
  test('floor, pads, props, and gate match shared layout numbers', { skip: threeSkip }, () => {
    const { habitat } = mount();
    try {
      const floor = habitat.group.getObjectByName('farm-floor');
      assert.ok(floor);
      assert.equal(floor.geometry.parameters.width, FARM_INTERIOR_WIDTH);
      assert.equal(floor.geometry.parameters.height, FARM_INTERIOR_DEPTH);

      for (let i = 0; i < HOME_SLOTS.length; i += 1) {
        const pad = habitat.group.getObjectByName(`farm-pad-${i}`);
        assert.ok(pad, `pad ${i}`);
        assert.equal(pad.position.x, HOME_SLOTS[i].x);
        assert.equal(pad.position.z, HOME_SLOTS[i].z);
      }

      for (const prop of STATIC_PROPS) {
        const node = habitat.group.getObjectByName(`farm-prop-${prop.id}`);
        assert.ok(node, prop.id);
        assert.equal(node.position.x, prop.x);
        assert.equal(node.position.z, prop.z);
        const foot = habitat.group.getObjectByName(`farm-prop-foot-${prop.id}`);
        assert.equal(foot.geometry.parameters.radius, PROP_RADIUS);
      }

      const west = habitat.group.getObjectByName('farm-gate-post-west');
      const east = habitat.group.getObjectByName('farm-gate-post-east');
      assert.equal(west.position.x, GATE_OPENING_MIN_X);
      assert.equal(west.position.z, GATE_OPENING_Z);
      assert.equal(east.position.x, GATE_OPENING_MAX_X);
      assert.equal(east.position.z, GATE_OPENING_Z);
      assert.equal(west.geometry.parameters.height, FENCE_HEIGHT);
      assert.ok(habitat.group.getObjectByName('farm-gate-leaf-west'));
      assert.ok(habitat.group.getObjectByName('farm-gate-leaf-east'));
      assert.ok(!habitat.group.getObjectByName('farm-rail-south-center-lower'));
    } finally {
      habitat.dispose();
    }
  });

  test('capacity 6 shows six pads plus dormant marks; 10 enables all', { skip: threeSkip }, () => {
    const { habitat } = mount({ capacity: 6 });
    try {
      assert.equal(countVisible(habitat, 'farm-pad-', 10), 6);
      assert.equal(countVisible(habitat, 'farm-pad-dormant-', 10), 4);
      assert.equal(habitat.group.getObjectByName('farm-pad-0').visible, true);
      assert.equal(habitat.group.getObjectByName('farm-pad-5').visible, true);
      assert.equal(habitat.group.getObjectByName('farm-pad-6').visible, false);
      assert.equal(habitat.group.getObjectByName('farm-pad-dormant-6').visible, true);
      assert.ok(!habitat.group.getObjectByName('farm-lock'));

      habitat.setCapacity(10);
      assert.equal(countVisible(habitat, 'farm-pad-', 10), 10);
      assert.equal(countVisible(habitat, 'farm-pad-dormant-', 10), 0);
      for (let i = 0; i < 10; i += 1) {
        assert.equal(habitat.group.getObjectByName(`farm-pad-${i}`).visible, true);
        assert.equal(habitat.group.getObjectByName(`farm-pad-dormant-${i}`).visible, false);
      }
    } finally {
      habitat.dispose();
    }
  });

  test('decorative grass is skipRaycast and absent from the pick list', { skip: threeSkip }, () => {
    const { habitat } = mount();
    try {
      const grass = habitat.group.getObjectByName('farm-grass');
      const flowers = habitat.group.getObjectByName('farm-flowers');
      assert.ok(grass);
      assert.equal(farmMod.meshSkipsRaycast(grass, THREE), true);
      assert.equal(farmMod.meshSkipsRaycast(flowers, THREE), true);
      const picks = habitat.getPickMeshes();
      assert.ok(picks.every((mesh) => mesh.name !== 'farm-grass'));
      assert.ok(picks.every((mesh) => mesh.name !== 'farm-flowers'));
      assert.ok(picks.every((mesh) => mesh.userData.role !== 'decor'));
      assert.ok(picks.some((mesh) => mesh.name === 'farm-floor'));
    } finally {
      habitat.dispose();
    }
  });

  test('prop pick IDs are shrub / pantry / bloom / beds', { skip: threeSkip }, () => {
    const { habitat } = mount();
    try {
      for (const id of ['shrub', 'pantry', 'bloom']) {
        const foot = habitat.group.getObjectByName(`farm-prop-foot-${id}`);
        assert.equal(foot.userData.interactableId, id);
        assert.equal(foot.userData.upgradeId, id);
      }
      const beds = habitat.group.getObjectByName('farm-beds-marker');
      /** @type {string[]} */
      const ids = [];
      beds.traverse((node) => {
        if (node.isMesh && node.userData.interactableId) ids.push(node.userData.interactableId);
      });
      assert.ok(ids.length > 0);
      assert.ok(ids.every((id) => id === 'beds'));
    } finally {
      habitat.dispose();
    }
  });

  test('setCapacity / setShrubLevel keep the same habitat root', { skip: threeSkip }, () => {
    const { habitat } = mount({ capacity: 6, shrubLevel: 0 });
    try {
      const root = habitat.group;
      const foods = habitat.foodsGroup;
      habitat.setCapacity(10);
      habitat.setShrubLevel(3);
      habitat.setFoods([]);
      assert.equal(habitat.group, root);
      assert.equal(habitat.foodsGroup, foods);
      assert.equal(habitat.foodsGroup.parent, root);
      assert.equal(habitat.foodsGroup.children.length, 0);
      assert.equal(habitat.group.getObjectByName('farm-shrub-berry-0').visible, true);
      habitat.setShrubLevel(0);
      assert.equal(habitat.group, root);
      assert.equal(habitat.group.getObjectByName('farm-shrub-berry-0').visible, false);
    } finally {
      habitat.dispose();
    }
  });

  test('solid props occlude ground; gate gap does not', { skip: threeSkip }, () => {
    const { habitat } = mount({ capacity: 10 });
    try {
      const raycaster = new THREE.Raycaster();
      const shrub = STATIC_PROPS.find((p) => p.id === 'shrub');

      raycaster.set(new THREE.Vector3(shrub.x, 4, shrub.z), new THREE.Vector3(0, -1, 0));
      const shrubHit = habitat.pick(raycaster);
      assert.equal(shrubHit.kind, 'object');
      assert.equal(shrubHit.interactableId, 'shrub');

      raycaster.set(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, 0));
      const groundHit = habitat.pick(raycaster);
      assert.equal(groundHit.kind, 'ground');

      const through = new THREE.Vector3(1, -0.02, 0).normalize();
      raycaster.set(new THREE.Vector3(shrub.x - 0.85, 0.22, shrub.z), through);
      const occluded = habitat.pick(raycaster);
      assert.equal(occluded.kind, 'object');
      assert.equal(occluded.interactableId, 'shrub');

      const inward = new THREE.Vector3(0, -0.02, -1).normalize();
      raycaster.set(new THREE.Vector3(0, 0.4, 14), inward);
      const fenceHit = habitat.pick(raycaster);
      assert.equal(fenceHit.kind, 'none');
      assert.equal(fenceHit.occluder, 'solid');

      raycaster.set(new THREE.Vector3(0, 4, GATE_INSIDE_WAYPOINT.z), new THREE.Vector3(0, -1, 0));
      const gateHit = habitat.pick(raycaster);
      assert.equal(gateHit.kind, 'ground');

      habitat.updateFenceFade({ x: 0, z: 18 });
      assert.equal(
        habitat.group.getObjectByName('farm-rail-north-lower').material.opacity,
        FENCE_FADE_OPACITY,
      );
      assert.equal(
        habitat.group.getObjectByName('farm-rail-south-west-lower').material.opacity,
        1,
      );
    } finally {
      habitat.dispose();
    }
  });
});
