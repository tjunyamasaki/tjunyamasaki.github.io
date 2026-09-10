/**
 * One scene berry per current food ID. Shared berry/leaf/shadow geometry.
 * Throw arcs and mouth attachment consume world snapshots; never grant Glow.
 *
 * Does not import world navigation.
 */

import { EAT_DURATION_MS } from '../core/balance.mjs';
import { hashUnit } from '../world/hash.mjs';
import { quadraticBezier } from './arrivals.mjs';

export const BERRY_GROUND_Y = 0.09;
export const THROW_ARC_HEIGHT_MIN = 1.5;
export const THROW_ARC_HEIGHT_MAX = 2.5;
export const BERRY_MESH_SCALE = 0.11;

/**
 * @param {import('../world/state.mjs').WorldState | null | undefined} world
 * @returns {number}
 */
export function worldClockMs(world) {
  if (!world) return 0;
  const time = Number(world.timeMs) || 0;
  const carry = Number(world.carryMs) || 0;
  return time + carry;
}

/**
 * @param {readonly { id: string }[] | null | undefined} previous
 * @param {readonly { id: string }[] | null | undefined} next
 * @returns {{ add: string[], remove: string[], keep: string[] }}
 */
export function diffFoodIds(previous, next) {
  const prev = new Set((previous || []).map((food) => food.id));
  const living = new Set((next || []).map((food) => food.id));
  /** @type {string[]} */
  const add = [];
  /** @type {string[]} */
  const remove = [];
  /** @type {string[]} */
  const keep = [];
  for (const id of living) {
    if (prev.has(id)) keep.push(id);
    else add.push(id);
  }
  for (const id of prev) {
    if (!living.has(id)) remove.push(id);
  }
  return { add, remove, keep };
}

/**
 * Arc height 1.5–2.5, stable per food id.
 * @param {string} foodId
 * @returns {number}
 */
export function throwArcHeight(foodId) {
  const u = hashUnit(String(foodId), 0, 'arc');
  return THROW_ARC_HEIGHT_MIN + u * (THROW_ARC_HEIGHT_MAX - THROW_ARC_HEIGHT_MIN);
}

/**
 * 0..1 along the world flight window. Duration comes from land/created times.
 *
 * @param {{ createdWorldMs?: number, landAtWorldMs?: number }} food
 * @param {number} worldMs
 * @returns {number}
 */
export function throwFlightT(food, worldMs) {
  const start = Number(food?.createdWorldMs);
  const land = Number(food?.landAtWorldMs);
  if (!Number.isFinite(start) || !Number.isFinite(land)) return 1;
  const span = land - start;
  if (!(span > 0)) return 1;
  const t = (Number(worldMs) - start) / span;
  if (!Number.isFinite(t)) return 1;
  return Math.max(0, Math.min(1, t));
}

/**
 * @param {{ eatUntilWorldMs?: number | null, stage?: string }} food
 * @param {number} worldMs
 * @param {number} [eatDurationMs]
 * @returns {number}
 */
export function eatProgress(food, worldMs, eatDurationMs = EAT_DURATION_MS) {
  if (!food || food.stage !== 'eating' || food.eatUntilWorldMs == null) return 0;
  const duration = eatDurationMs > 0 ? eatDurationMs : EAT_DURATION_MS;
  const start = Number(food.eatUntilWorldMs) - duration;
  const t = (Number(worldMs) - start) / duration;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(1, t));
}

/**
 * Duck-typed direction target. Three r180 `Object3D.getWorldDirection` calls
 * `target.set(x,y,z).normalize()` — a plain `{x,y,z}` throws
 * `target.set is not a function` on every throw.
 *
 * @returns {{
 *   x: number,
 *   y: number,
 *   z: number,
 *   set: (x: number, y: number, z: number) => object,
 *   normalize: () => object,
 * }}
 */
function directionTarget() {
  const target = {
    x: 0,
    y: 0,
    z: 0,
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
    normalize() {
      const len = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
      return this;
    },
  };
  return target;
}

/**
 * Camera-relative foreground toss origin. Reconstructs nothing — callers
 * pass this only for a freshly observed FOOD_THROWN.
 *
 * @param {{ position?: { x?: number, y?: number, z?: number }, getWorldDirection?: Function } | null | undefined} camera
 * @returns {{ x: number, y: number, z: number }}
 */
export function cameraThrowOrigin(camera) {
  const px = Number(camera?.position?.x);
  const py = Number(camera?.position?.y);
  const pz = Number(camera?.position?.z);
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
    return { x: 0, y: 1.7, z: 7 };
  }
  let fx = 0;
  let fy = -0.35;
  let fz = -1;
  if (typeof camera.getWorldDirection === 'function') {
    const dir = directionTarget();
    try {
      camera.getWorldDirection(dir);
    } catch {
      // Keep the default look vector; never let a throw arc crash the loop.
    }
    if (Number.isFinite(dir.x) && Number.isFinite(dir.z)) {
      fx = dir.x;
      fy = dir.y;
      fz = dir.z;
    }
  }
  return {
    x: px + fx * 2.2,
    y: Math.max(1.15, py * 0.32),
    z: pz + fz * 2.2,
  };
}

/**
 * Flying berry. Without a captured throw origin (reload / hidden / pause), sit
 * at the world target — do not invent a fake arc.
 *
 * @param {{
 *   food: { id?: string, target: { x: number, z: number }, createdWorldMs?: number, landAtWorldMs?: number },
 *   worldMs: number,
 *   throwOrigin?: { x: number, y: number, z: number } | null,
 *   reducedMotion?: boolean,
 * }} args
 * @returns {{ x: number, y: number, z: number }}
 */
export function flyingBerryPosition(args) {
  const target = args.food.target;
  const ground = { x: target.x, y: BERRY_GROUND_Y, z: target.z };
  if (args.reducedMotion || !args.throwOrigin) return ground;
  const t = throwFlightT(args.food, args.worldMs);
  if (t >= 1) return ground;
  const origin = args.throwOrigin;
  const height = throwArcHeight(args.food.id || '');
  const cx = (origin.x + ground.x) * 0.5;
  const cy = Math.max(origin.y, ground.y) + height;
  const cz = (origin.z + ground.z) * 0.5;
  return quadraticBezier(
    origin.x,
    origin.y,
    origin.z,
    cx,
    cy,
    cz,
    ground.x,
    ground.y,
    ground.z,
    t,
  );
}

/**
 * Ground target → actual deformed mouth over EAT_DURATION_MS (800).
 * `mouth` must be sampled each frame (getMouthWorldPosition). Never a fixed
 * global mouth coordinate.
 *
 * @param {{
 *   food: { target: { x: number, z: number }, eatUntilWorldMs?: number | null, stage?: string },
 *   worldMs: number,
 *   mouth?: { x: number, y: number, z: number } | null,
 *   reducedMotion?: boolean,
 *   eatDurationMs?: number,
 * }} args
 * @returns {{ x: number, y: number, z: number }}
 */
export function eatingBerryPosition(args) {
  const ground = {
    x: args.food.target.x,
    y: BERRY_GROUND_Y,
    z: args.food.target.z,
  };
  const mouth = args.mouth;
  if (!mouth) return ground;
  if (args.reducedMotion) return { x: mouth.x, y: mouth.y, z: mouth.z };
  const u = eatProgress(args.food, args.worldMs, args.eatDurationMs);
  return {
    x: ground.x + (mouth.x - ground.x) * u,
    y: ground.y + (mouth.y - ground.y) * u,
    z: ground.z + (mouth.z - ground.z) * u,
  };
}

/**
 * @param {{
 *   food: import('../world/state.mjs').FoodState,
 *   worldMs: number,
 *   throwOrigin?: { x: number, y: number, z: number } | null,
 *   mouth?: { x: number, y: number, z: number } | null,
 *   getMouth?: (slimeId: string | null) => { x: number, y: number, z: number } | null,
 *   reducedMotion?: boolean,
 * }} args
 * @returns {{ x: number, y: number, z: number }}
 */
export function visualFoodPosition(args) {
  const food = args.food;
  if (food.stage === 'eating') {
    const mouth =
      args.mouth ||
      (food.claimedBy && args.getMouth ? args.getMouth(food.claimedBy) : null);
    return eatingBerryPosition({
      food,
      worldMs: args.worldMs,
      mouth,
      reducedMotion: args.reducedMotion,
    });
  }
  if (food.stage === 'flying') {
    return flyingBerryPosition(args);
  }
  return {
    x: food.target.x,
    y: BERRY_GROUND_Y,
    z: food.target.z,
  };
}

/**
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @param {import('../../vendor/three/three.module.js').Object3D} object
 */
function skipRaycastTree(object) {
  object.traverse((node) => {
    if (node.isMesh) node.raycast = function skipRaycastImpl() {};
  });
}

/**
 * Shared berry / leaf / shadow. One mesh group per food id; extra IDs disposed.
 *
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @param {import('../../vendor/three/three.module.js').Object3D} parent
 */
export function createFoodPresentation(THREE, parent) {
  const berryGeom = new THREE.SphereGeometry(1, 12, 10);
  const leafGeom = new THREE.SphereGeometry(0.45, 8, 6);
  const shadowGeom = new THREE.CircleGeometry(1.1, 16);
  const berryMat = new THREE.MeshStandardMaterial({
    color: 0xd45b6a,
    roughness: 0.72,
    metalness: 0.05,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x5f8a62,
    roughness: 0.86,
  });
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x1f4432,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  /**
   * @typedef {{ root: import('../../vendor/three/three.module.js').Group, berry: import('../../vendor/three/three.module.js').Mesh, leaf: import('../../vendor/three/three.module.js').Mesh, shadow: import('../../vendor/three/three.module.js').Mesh }} FoodEntry
   * @type {Map<string, FoodEntry>}
   */
  const entries = new Map();
  /** @type {Map<string, { x: number, y: number, z: number }>} */
  const lastPos = new Map();

  /**
   * @param {string} id
   * @returns {FoodEntry}
   */
  function makeEntry(id) {
    const root = new THREE.Group();
    root.name = `food-visual-${id}`;
    root.userData.foodId = id;
    root.userData.role = 'food';
    const berry = new THREE.Mesh(berryGeom, berryMat);
    berry.name = `food-berry-${id}`;
    berry.castShadow = true;
    berry.scale.setScalar(BERRY_MESH_SCALE);
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.name = `food-leaf-${id}`;
    leaf.position.set(0.07, 0.08, 0.02);
    leaf.scale.set(0.055, 0.02, 0.04);
    leaf.castShadow = true;
    const shadow = new THREE.Mesh(shadowGeom, shadowMat);
    shadow.name = `food-shadow-${id}`;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    shadow.scale.setScalar(0.18);
    root.add(berry, leaf, shadow);
    skipRaycastTree(root);
    parent.add(root);
    return { root, berry, leaf, shadow };
  }

  /**
   * Reconcile one mesh per current food ID. Extra IDs leave the graph.
   * @param {readonly import('../world/state.mjs').FoodState[] | null | undefined} foods
   */
  function sync(foods) {
    const list = Array.isArray(foods) ? foods : [];
    const living = new Set(list.map((food) => food.id));
    for (const [id, entry] of entries) {
      if (living.has(id)) continue;
      entry.root.removeFromParent();
      entries.delete(id);
      lastPos.delete(id);
    }
    for (const food of list) {
      if (entries.has(food.id)) continue;
      entries.set(food.id, makeEntry(food.id));
    }
  }

  /**
   * @param {{
   *   foods: readonly import('../world/state.mjs').FoodState[] | null | undefined,
   *   worldMs: number,
   *   throwOrigins?: Map<string, { x: number, y: number, z: number }>,
   *   getMouth?: (slimeId: string) => { x: number, y: number, z: number } | null,
   *   reducedMotion?: boolean,
   *   freezePositions?: boolean,
   * }} ctx
   */
  function update(ctx) {
    const list = Array.isArray(ctx.foods) ? ctx.foods : [];
    for (const food of list) {
      const entry = entries.get(food.id);
      if (!entry) continue;
      if (ctx.freezePositions && lastPos.has(food.id)) {
        const held = lastPos.get(food.id);
        if (held) entry.root.position.set(held.x, held.y, held.z);
        continue;
      }
      const pos = visualFoodPosition({
        food,
        worldMs: ctx.worldMs,
        throwOrigin: ctx.throwOrigins ? ctx.throwOrigins.get(food.id) : null,
        getMouth: ctx.getMouth,
        reducedMotion: ctx.reducedMotion,
      });
      entry.root.position.set(pos.x, pos.y, pos.z);
      lastPos.set(food.id, pos);
      const flying = food.stage === 'flying';
      const eating = food.stage === 'eating';
      entry.shadow.visible = !flying;
      const eatT = eating ? eatProgress(food, ctx.worldMs) : 0;
      const scale = eating ? BERRY_MESH_SCALE * (1 - eatT * 0.55) : BERRY_MESH_SCALE;
      entry.berry.scale.setScalar(Math.max(0.02, scale));
    }
  }

  /**
   * @param {string} id
   */
  function get(id) {
    return entries.get(id) ?? null;
  }

  function ids() {
    return [...entries.keys()];
  }

  function dispose() {
    for (const entry of entries.values()) entry.root.removeFromParent();
    entries.clear();
    lastPos.clear();
    berryGeom.dispose();
    leafGeom.dispose();
    shadowGeom.dispose();
    berryMat.dispose();
    leafMat.dispose();
    shadowMat.dispose();
  }

  return {
    sync,
    update,
    get,
    ids,
    dispose,
    group: parent,
  };
}
