/**
 * Phase-2 24×20 farm habitat. Positions and footprints come from
 * `world/layout.mjs` via `farm-geometry.mjs`. Live `/slime-garden/` still
 * mounts the circular `createHabitat` until P2-13.
 *
 * Does not create slimes, throw food, or write economic state. `setFoods`
 * parents one berry mesh per food ID into `foodsGroup` (P2-12).
 */

import {
  FARM_INTERIOR_DEPTH,
  FARM_INTERIOR_WIDTH,
  HOME_SLOTS,
  PROP_RADIUS,
  STATIC_PROPS,
} from '../world/layout.mjs';
import {
  bedsMarkerPosition,
  clampShrubLevel,
  decorativeFlowerPatches,
  decorativeGrassPatches,
  dirtPathCenters,
  distantBushPositions,
  DORMANT_PAD_RADIUS,
  enabledPadCount,
  FENCE_FADE_OPACITY,
  FENCE_HEIGHT,
  fenceCornerAndMidPosts,
  fenceRailSegments,
  gateLeafSpecs,
  gatePostPositions,
  PAD_RADIUS,
} from './farm-geometry.mjs';
import { createFoodPresentation } from './food.mjs';

export {
  FARM_VISUAL,
  FENCE_FADE_OPACITY,
  FENCE_HEIGHT,
  fenceRailSegments,
  gatePostPositions,
} from './farm-geometry.mjs';

const RAIL_Y_LOWER = 0.28;
const RAIL_Y_UPPER = 0.62;
const BERRY_LOCALS = Object.freeze([
  Object.freeze({ x: 0.12, y: 0.42, z: 0.08 }),
  Object.freeze({ x: -0.1, y: 0.38, z: -0.06 }),
  Object.freeze({ x: 0.04, y: 0.5, z: -0.12 }),
  Object.freeze({ x: -0.16, y: 0.34, z: 0.1 }),
  Object.freeze({ x: 0.18, y: 0.32, z: -0.04 }),
  Object.freeze({ x: 0.02, y: 0.46, z: 0.14 }),
]);

/**
 * @param {import('../../vendor/three/three.module.js').Object3D} object
 */
export function skipRaycast(object) {
  object.traverse((node) => {
    if (node.isMesh) {
      node.raycast = function skipRaycastImpl() {};
    }
  });
}

/**
 * @param {import('../../vendor/three/three.module.js').Object3D} object
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @returns {boolean}
 */
export function meshSkipsRaycast(object, THREE) {
  return Boolean(
    object &&
      object.isMesh &&
      typeof object.raycast === 'function' &&
      object.raycast !== THREE.Mesh.prototype.raycast,
  );
}

/**
 * Fog for the larger farm camera. Does not write v1 `setGameplayFog`.
 *
 * @param {{ near: number, far: number }} fog
 * @param {number} [distance]
 * @param {number} [farPlane]
 */
export function setFarmFog(fog, distance, farPlane) {
  if (!fog) return;
  const d = Number.isFinite(distance) && distance > 0 ? distance : 24;
  const far =
    Number.isFinite(farPlane) && farPlane > 0 ? farPlane : Math.max(70, d + 40, d * 3);
  fog.near = Math.max(18, Math.min(far * 0.42, d * 1.2));
  fog.far = far;
}

/**
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @returns {import('../../vendor/three/three.module.js').MeshStandardMaterial}
 */
function makeRailMaterial(THREE) {
  return new THREE.MeshStandardMaterial({
    color: 0x8a6a4a,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: 1,
  });
}

/**
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @param {import('../../vendor/three/three.module.js').Scene} scene
 * @param {{ capacity?: number, shrubLevel?: number }} [options]
 */
export function createFarmHabitat(THREE, scene, options = {}) {
  /** @type {import('../../vendor/three/three.module.js').BufferGeometry[]} */
  const geometries = [];
  /** @type {import('../../vendor/three/three.module.js').Material[]} */
  const materials = [];
  /** @type {import('../../vendor/three/three.module.js').Object3D[]} */
  const roots = [];

  /**
   * @param {import('../../vendor/three/three.module.js').BufferGeometry} geometry
   */
  function trackGeom(geometry) {
    geometries.push(geometry);
    return geometry;
  }

  /**
   * @template {import('../../vendor/three/three.module.js').Material} T
   * @param {T} material
   * @returns {T}
   */
  function trackMat(material) {
    materials.push(material);
    return material;
  }

  const hemi = new THREE.HemisphereLight(0xf3ffff, 0x719c78, 2.4);
  scene.add(hemi);
  roots.push(hemi);

  const sun = new THREE.DirectionalLight(0xfff1ca, 3.1);
  sun.position.set(-8, 14, 10);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  if (sun.shadow) {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 42;
    sun.shadow.normalBias = 0.03;
    sun.shadow.camera.updateProjectionMatrix?.();
  }
  scene.add(sun);
  scene.add(sun.target);
  roots.push(sun, sun.target);

  const rim = new THREE.DirectionalLight(0xbffff2, 1.15);
  rim.position.set(6, 5, -8);
  scene.add(rim);
  roots.push(rim);

  const group = new THREE.Group();
  group.name = 'habitat-farm-v2';
  scene.add(group);
  roots.push(group);

  const meadowGeo = trackGeom(new THREE.PlaneGeometry(80, 72));
  const meadowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd5e2c4, roughness: 1 }),
  );
  const meadow = new THREE.Mesh(meadowGeo, meadowMat);
  meadow.name = 'farm-meadow';
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = -0.02;
  meadow.receiveShadow = true;
  meadow.userData.role = 'decor';
  group.add(meadow);
  skipRaycast(meadow);

  const floorGeo = trackGeom(new THREE.PlaneGeometry(FARM_INTERIOR_WIDTH, FARM_INTERIOR_DEPTH));
  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe2eacc, roughness: 1 }),
  );
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.name = 'farm-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.role = 'ground';
  group.add(floor);

  const pathGeo = trackGeom(new THREE.CircleGeometry(1, 20));
  const pathMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb08968, roughness: 1 }),
  );
  const pathGroup = new THREE.Group();
  pathGroup.name = 'farm-path';
  for (const step of dirtPathCenters()) {
    const disk = new THREE.Mesh(pathGeo, pathMat);
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(step.x, 0.006, step.z);
    disk.scale.set(step.radius, step.radius, 1);
    disk.receiveShadow = true;
    disk.userData.role = 'decor';
    pathGroup.add(disk);
  }
  group.add(pathGroup);
  skipRaycast(pathGroup);

  const padGeo = trackGeom(new THREE.CircleGeometry(PAD_RADIUS, 24));
  const padMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd2c48c, roughness: 1 }),
  );
  const padRingGeo = trackGeom(new THREE.RingGeometry(PAD_RADIUS * 0.78, PAD_RADIUS, 24));
  const padRingMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xa89468, roughness: 1 }),
  );
  const dormantGeo = trackGeom(
    new THREE.RingGeometry(DORMANT_PAD_RADIUS * 0.42, DORMANT_PAD_RADIUS, 20),
  );
  const dormantMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6e7864,
      roughness: 1,
      transparent: true,
      opacity: 0.92,
    }),
  );
  /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
  const pads = [];
  /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
  const padRings = [];
  /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
  const dormantMarks = [];
  for (let i = 0; i < HOME_SLOTS.length; i += 1) {
    const slot = HOME_SLOTS[i];
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.name = `farm-pad-${i}`;
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(slot.x, 0.008, slot.z);
    pad.receiveShadow = true;
    pad.userData.role = 'ground';
    pad.visible = false;
    group.add(pad);
    pads.push(pad);

    const ring = new THREE.Mesh(padRingGeo, padRingMat);
    ring.name = `farm-pad-ring-${i}`;
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(slot.x, 0.01, slot.z);
    ring.receiveShadow = true;
    ring.userData.role = 'ground';
    ring.visible = false;
    group.add(ring);
    padRings.push(ring);

    const mark = new THREE.Mesh(dormantGeo, dormantMat);
    mark.name = `farm-pad-dormant-${i}`;
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(slot.x, 0.009, slot.z);
    mark.userData.role = 'decor';
    mark.visible = false;
    group.add(mark);
    dormantMarks.push(mark);
    skipRaycast(mark);
  }

  const bedsAt = bedsMarkerPosition();
  const bedsGroup = new THREE.Group();
  bedsGroup.name = 'farm-beds-marker';
  bedsGroup.position.set(bedsAt.x, 0, bedsAt.z);
  const bedsPostGeo = trackGeom(new THREE.BoxGeometry(0.08, 0.52, 0.08));
  const bedsSignGeo = trackGeom(new THREE.BoxGeometry(0.4, 0.26, 0.04));
  const bedsMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.86 }),
  );
  const bedsAccentMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc9d9b4, roughness: 0.9 }),
  );
  const bedsPost = new THREE.Mesh(bedsPostGeo, bedsMat);
  bedsPost.position.y = 0.26;
  bedsPost.castShadow = true;
  const bedsSign = new THREE.Mesh(bedsSignGeo, bedsAccentMat);
  bedsSign.position.set(0.02, 0.48, 0.02);
  bedsSign.castShadow = true;
  bedsGroup.add(bedsPost, bedsSign);
  bedsGroup.traverse((node) => {
    if (node.isMesh) {
      node.userData.interactableId = 'beds';
      node.userData.upgradeId = 'beds';
      node.userData.role = 'prop';
    }
  });
  group.add(bedsGroup);

  const sideMaterials = {
    north: trackMat(makeRailMaterial(THREE)),
    east: trackMat(makeRailMaterial(THREE)),
    west: trackMat(makeRailMaterial(THREE)),
    south: trackMat(makeRailMaterial(THREE)),
  };
  const railGeo = trackGeom(new THREE.BoxGeometry(0.08, 0.08, 1));
  const fenceGroup = new THREE.Group();
  fenceGroup.name = 'farm-fence';

  /**
   * @param {string} id
   * @param {'north' | 'east' | 'west' | 'south'} side
   * @param {{ x: number, z: number }} from
   * @param {{ x: number, z: number }} to
   * @param {number} y
   */
  function addRail(id, side, from, to, y) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const mesh = new THREE.Mesh(railGeo, sideMaterials[side]);
    mesh.name = id;
    mesh.scale.set(1, 1, len);
    mesh.position.set((from.x + to.x) / 2, y, (from.z + to.z) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.role = 'solid';
    mesh.userData.fenceSide = side;
    fenceGroup.add(mesh);
  }

  for (const segment of fenceRailSegments()) {
    addRail(`farm-rail-${segment.id}-lower`, segment.side, segment.from, segment.to, RAIL_Y_LOWER);
    addRail(`farm-rail-${segment.id}-upper`, segment.side, segment.from, segment.to, RAIL_Y_UPPER);
  }

  const postGeo = trackGeom(new THREE.BoxGeometry(0.16, FENCE_HEIGHT, 0.16));
  const postMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6d5340, roughness: 0.88 }),
  );
  const postSeen = new Set();
  /**
   * @param {string} name
   * @param {number} x
   * @param {number} z
   */
  function addPost(name, x, z) {
    const key = `${x},${z}`;
    if (postSeen.has(key)) return;
    postSeen.add(key);
    const post = new THREE.Mesh(postGeo, postMat);
    post.name = name;
    post.position.set(x, FENCE_HEIGHT / 2, z);
    post.castShadow = true;
    post.receiveShadow = true;
    post.userData.role = 'solid';
    fenceGroup.add(post);
  }

  let cornerIndex = 0;
  for (const post of fenceCornerAndMidPosts()) {
    addPost(`farm-fence-post-${cornerIndex}`, post.x, post.z);
    cornerIndex += 1;
  }
  for (const post of gatePostPositions()) {
    addPost(`farm-gate-post-${post.id}`, post.x, post.z);
  }

  const leafGeo = trackGeom(new THREE.BoxGeometry(0.07, 0.72, 1.42));
  leafGeo.translate(0, 0, -0.71);
  const gateLeafGroup = new THREE.Group();
  gateLeafGroup.name = 'farm-gate-leaves';
  for (const spec of gateLeafSpecs()) {
    const leaf = new THREE.Mesh(leafGeo, sideMaterials.south);
    leaf.name = `farm-gate-leaf-${spec.id}`;
    leaf.position.set(spec.x, 0.4, spec.z);
    leaf.rotation.y = spec.yaw;
    leaf.castShadow = true;
    leaf.userData.role = 'solid';
    leaf.userData.fenceSide = 'south';
    gateLeafGroup.add(leaf);
  }
  fenceGroup.add(gateLeafGroup);
  group.add(fenceGroup);

  /**
   * @param {string} id
   * @param {number} x
   * @param {number} z
   * @param {(parent: import('../../vendor/three/three.module.js').Group) => void} build
   */
  function addProp(id, x, z, build) {
    const propGroup = new THREE.Group();
    propGroup.name = `farm-prop-${id}`;
    propGroup.position.set(x, 0, z);
    const footGeo = trackGeom(new THREE.CircleGeometry(PROP_RADIUS, 22));
    const footMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: id === 'bloom' ? 0xd7e8c4 : id === 'pantry' ? 0xcbb792 : 0xc5d4b4,
        roughness: 1,
      }),
    );
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.name = `farm-prop-foot-${id}`;
    foot.rotation.x = -Math.PI / 2;
    foot.position.y = 0.011;
    foot.receiveShadow = true;
    propGroup.add(foot);
    build(propGroup);
    propGroup.traverse((node) => {
      if (!node.isMesh) return;
      node.userData.interactableId = id;
      node.userData.upgradeId = id;
      node.userData.role = 'prop';
    });
    group.add(propGroup);
    return propGroup;
  }

  const leafMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5f8a62, roughness: 0.86 }),
  );
  const leafAGeo = trackGeom(new THREE.SphereGeometry(0.3, 12, 10));
  const leafBGeo = trackGeom(new THREE.SphereGeometry(0.22, 10, 8));
  const leafCGeo = trackGeom(new THREE.SphereGeometry(0.2, 10, 8));
  const berryGeo = trackGeom(new THREE.SphereGeometry(0.05, 8, 6));
  const berryMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc45c3e, roughness: 0.7 }),
  );
  /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
  const shrubBerries = [];
  /**
   * @param {string} id
   */
  function staticProp(id) {
    const found = STATIC_PROPS.find((prop) => prop.id === id);
    if (!found) throw new Error(`STATIC_PROPS missing ${id}`);
    return found;
  }

  const shrubSpec = staticProp('shrub');
  addProp('shrub', shrubSpec.x, shrubSpec.z, (parent) => {
    const a = new THREE.Mesh(leafAGeo, leafMat);
    a.position.set(0, 0.3, 0);
    const b = new THREE.Mesh(leafBGeo, leafMat);
    b.position.set(0.16, 0.22, 0.08);
    const c = new THREE.Mesh(leafCGeo, leafMat);
    c.position.set(-0.15, 0.2, -0.1);
    a.castShadow = b.castShadow = c.castShadow = true;
    parent.add(a, b, c);
    for (let i = 0; i < BERRY_LOCALS.length; i += 1) {
      const local = BERRY_LOCALS[i];
      const berry = new THREE.Mesh(berryGeo, berryMat);
      berry.name = `farm-shrub-berry-${i}`;
      berry.position.set(local.x, local.y, local.z);
      berry.visible = false;
      berry.castShadow = true;
      parent.add(berry);
      shrubBerries.push(berry);
    }
  });

  const crateMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb98a58, roughness: 0.84 }),
  );
  const crateGeo = trackGeom(new THREE.BoxGeometry(0.72, 0.46, 0.72));
  const crateLidGeo = trackGeom(new THREE.BoxGeometry(0.76, 0.06, 0.76));
  const pantrySpec = staticProp('pantry');
  addProp('pantry', pantrySpec.x, pantrySpec.z, (parent) => {
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.y = 0.23;
    crate.castShadow = true;
    crate.receiveShadow = true;
    const lid = new THREE.Mesh(crateLidGeo, crateMat);
    lid.position.set(0, 0.49, 0.04);
    lid.rotation.x = -0.18;
    lid.castShadow = true;
    parent.add(crate, lid);
  });

  const bloomPotMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.88 }),
  );
  const bloomStemMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6f8f5c, roughness: 0.86 }),
  );
  const bloomPetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8fe6c9,
      roughness: 0.55,
      emissive: 0x3a8f74,
      emissiveIntensity: 0.22,
    }),
  );
  const potGeo = trackGeom(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 12));
  const stemGeo = trackGeom(new THREE.CylinderGeometry(0.025, 0.03, 0.28, 6));
  const petalGeo = trackGeom(new THREE.SphereGeometry(0.09, 10, 8));
  const bloomSpec = staticProp('bloom');
  addProp('bloom', bloomSpec.x, bloomSpec.z, (parent) => {
    const pot = new THREE.Mesh(potGeo, bloomPotMat);
    pot.position.y = 0.1;
    pot.castShadow = true;
    const stems = [
      { x: 0, z: 0, y: 0.34 },
      { x: 0.12, z: 0.08, y: 0.3 },
      { x: -0.1, z: -0.06, y: 0.32 },
    ];
    parent.add(pot);
    for (const stem of stems) {
      const s = new THREE.Mesh(stemGeo, bloomStemMat);
      s.position.set(stem.x, stem.y, stem.z);
      const petal = new THREE.Mesh(petalGeo, bloomPetalMat);
      petal.position.set(stem.x, stem.y + 0.16, stem.z);
      petal.castShadow = true;
      parent.add(s, petal);
    }
  });

  const decorGroup = new THREE.Group();
  decorGroup.name = 'farm-decor';
  const grassPatches = decorativeGrassPatches();
  const grassGeo = trackGeom(new THREE.ConeGeometry(0.09, 0.13, 5));
  const grassMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7a9a68, roughness: 0.95 }),
  );
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassPatches.length);
  grass.name = 'farm-grass';
  grass.userData.role = 'decor';
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < grassPatches.length; i += 1) {
    const p = grassPatches[i];
    dummy.position.set(p.x, 0.065, p.z);
    dummy.rotation.set(0, (i * 0.7) % Math.PI, 0);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  decorGroup.add(grass);

  const flowerPatches = decorativeFlowerPatches();
  const flowerGeo = trackGeom(new THREE.SphereGeometry(0.045, 6, 5));
  const flowerMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe7c96a, roughness: 0.7 }),
  );
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerPatches.length);
  flowers.name = 'farm-flowers';
  flowers.userData.role = 'decor';
  for (let i = 0; i < flowerPatches.length; i += 1) {
    const p = flowerPatches[i];
    dummy.position.set(p.x, 0.07, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
  }
  flowers.instanceMatrix.needsUpdate = true;
  decorGroup.add(flowers);
  group.add(decorGroup);
  skipRaycast(decorGroup);

  const sceneryGroup = new THREE.Group();
  sceneryGroup.name = 'farm-scenery';
  const bushMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6d8a70, roughness: 0.92 }),
  );
  const bushAGeo = trackGeom(new THREE.SphereGeometry(0.85, 10, 8));
  const bushBGeo = trackGeom(new THREE.SphereGeometry(0.62, 8, 7));
  const rockGeo = trackGeom(new THREE.SphereGeometry(0.28, 6, 5));
  const rockMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x9aa398, roughness: 1 }),
  );
  let bushIndex = 0;
  for (const pos of distantBushPositions()) {
    const cluster = new THREE.Group();
    cluster.name = `farm-distant-bush-${bushIndex}`;
    cluster.position.set(pos.x, 0, pos.z);
    const a = new THREE.Mesh(bushAGeo, bushMat);
    a.position.set(0, 0.7, 0);
    a.scale.set(1, 0.85, 1);
    const b = new THREE.Mesh(bushBGeo, bushMat);
    b.position.set(0.55, 0.5, 0.2);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(-0.55, 0.12, 0.3);
    rock.scale.set(1.4, 0.55, 1.1);
    cluster.add(a, b, rock);
    sceneryGroup.add(cluster);
    bushIndex += 1;
  }
  group.add(sceneryGroup);
  skipRaycast(sceneryGroup);

  const foodsGroup = new THREE.Group();
  foodsGroup.name = 'farm-foods';
  group.add(foodsGroup);
  const foods = createFoodPresentation(THREE, foodsGroup);

  let capacityNow = enabledPadCount(options.capacity ?? 6);
  let shrubLevelNow = clampShrubLevel(options.shrubLevel ?? 0);

  /**
   * @param {number} capacity
   */
  function setCapacity(capacity) {
    capacityNow = enabledPadCount(capacity);
    for (let i = 0; i < pads.length; i += 1) {
      const on = i < capacityNow;
      pads[i].visible = on;
      padRings[i].visible = on;
      dormantMarks[i].visible = !on;
    }
  }

  /**
   * Cosmetic berry count only. Does not change timers or rebuild the farm.
   * @param {number} level
   */
  function setShrubLevel(level) {
    shrubLevelNow = clampShrubLevel(level);
    const show = shrubLevelNow * 2;
    for (let i = 0; i < shrubBerries.length; i += 1) {
      shrubBerries[i].visible = i < show;
    }
  }

  /**
   * Host one mesh per current food ID in `foodsGroup`. Extra IDs are removed.
   * Positions are updated by `foods.update` (scene) from world snapshots.
   * @param {readonly import('../world/state.mjs').FoodState[] | null | undefined} nextFoods
   */
  function setFoods(nextFoods) {
    foods.sync(nextFoods);
  }

  /**
   * Fade the near-side rails (visual only). Posts stay opaque.
   * @param {{ x?: number, z?: number } | null | undefined} cameraPosition
   */
  function updateFenceFade(cameraPosition) {
    if (!cameraPosition) return;
    const cx = Number(cameraPosition.x);
    const cz = Number(cameraPosition.z);
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) return;
    const ax = Math.abs(cx);
    const az = Math.abs(cz);
    const fadeEast = cx > 0.2 && ax >= az;
    const fadeWest = cx < -0.2 && ax >= az;
    const fadeNorth = cz > 0.2 && az >= ax;
    const fadeSouth = cz < -0.2 && az >= ax;
    sideMaterials.east.opacity = fadeEast ? FENCE_FADE_OPACITY : 1;
    sideMaterials.west.opacity = fadeWest ? FENCE_FADE_OPACITY : 1;
    sideMaterials.north.opacity = fadeNorth ? FENCE_FADE_OPACITY : 1;
    sideMaterials.south.opacity = fadeSouth ? FENCE_FADE_OPACITY : 1;
  }

  /**
   * @returns {import('../../vendor/three/three.module.js').Mesh[]}
   */
  function getPickMeshes() {
    /** @type {import('../../vendor/three/three.module.js').Mesh[]} */
    const list = [];
    group.traverse((node) => {
      if (!node.isMesh) return;
      if (meshSkipsRaycast(node, THREE)) return;
      list.push(node);
    });
    return list;
  }

  /**
   * Occlusion-aware pick: first unskipped mesh along the ray.
   * Solid fence/posts occlude ground. Decorative grass is skipRaycast.
   *
   * @param {import('../../vendor/three/three.module.js').Raycaster} raycaster
   * @returns {{
   *   kind: 'object',
   *   interactableId: string,
   *   upgradeId: string,
   *   distance: number,
   *   point: { x: number, y: number, z: number },
   * } | {
   *   kind: 'ground',
   *   point: { x: number, z: number },
   *   distance: number,
   *   valid: boolean,
   * } | { kind: 'none', occluder?: string, distance?: number }}
   */
  function pick(raycaster) {
    if (!raycaster) return { kind: 'none' };
    group.updateWorldMatrix(true, true);
    const hits = raycaster.intersectObject(group, true);
    for (const hit of hits) {
      const obj = hit.object;
      const id = obj.userData && obj.userData.interactableId;
      if (typeof id === 'string' && id) {
        return {
          kind: 'object',
          interactableId: id,
          upgradeId: id,
          distance: hit.distance,
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        };
      }
      if (obj.userData && obj.userData.role === 'ground') {
        return {
          kind: 'ground',
          point: { x: hit.point.x, z: hit.point.z },
          distance: hit.distance,
          valid: true,
        };
      }
      if (obj.userData && obj.userData.role === 'solid') {
        return { kind: 'none', occluder: 'solid', distance: hit.distance };
      }
    }
    return { kind: 'none' };
  }

  function dispose() {
    foods.dispose();
    for (const root of roots) root.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.length = 0;
    materials.length = 0;
    roots.length = 0;
    pads.length = 0;
    padRings.length = 0;
    dormantMarks.length = 0;
    shrubBerries.length = 0;
  }

  setCapacity(capacityNow);
  setShrubLevel(shrubLevelNow);

  return {
    group,
    sun,
    hemi,
    rim,
    foodsGroup,
    foods,
    setCapacity,
    setShrubLevel,
    setFoods,
    updateFenceFade,
    getPickMeshes,
    pick,
    getCapacity: () => capacityNow,
    getShrubLevel: () => shrubLevelNow,
    dispose,
  };
}

export { createFarmHabitat as createHabitatV2 };
