/**
 * One reusable mint slime resident: unique mutable geometries, shared toon/outline
 * materials, per-actor shadow material, and pose evaluation with no shared mutable
 * pose globals.
 */

import {
  BODY_BOUNDS_CENTER,
  BODY_BOUNDS_RADIUS,
  LATHE_SEGMENTS,
  blinkScale,
  comparisonTravelX,
  comparisonTravelYaw,
  createPoseState,
  deform,
  deformPositionArray,
  evaluatePose,
  getProfilePoints,
  idleSway,
  radius,
  WALK_CYCLE_SEC,
  mouthRestLocal,
} from './slime-pose.mjs';

/**
 * @typedef {object} SlimeActorOptions
 * @property {import('../../vendor/three/three.module.js').Object3D} [parent]
 * @property {boolean} [comparisonTravelEnabled]
 * @property {boolean} [selected]
 * @property {number} [x]
 * @property {number} [z]
 * @property {number} [yaw]
 * @property {number} [timeSec]
 * @property {number} [walkBlend]
 * @property {number} [walkPhase]
 * @property {string} [id]
 */

/**
 * @typedef {object} SharedSlimeResources
 * @property {number} refCount
 * @property {import('../../vendor/three/three.module.js').DataTexture} ramp
 * @property {import('../../vendor/three/three.module.js').MeshToonMaterial} animeMat
 * @property {import('../../vendor/three/three.module.js').MeshBasicMaterial} outlineMat
 * @property {import('../../vendor/three/three.module.js').CanvasTexture} shadowMap
 * @property {import('../../vendor/three/three.module.js').PlaneGeometry} shadowGeometry
 * @property {import('../../vendor/three/three.module.js').BufferGeometry} ringGeometry
 * @property {import('../../vendor/three/three.module.js').MeshBasicMaterial} ringMaterial
 */

/** @type {SharedSlimeResources | null} */
let shared = null;

function acquireShared(THREE) {
  if (!shared) {
    const ramp = new THREE.DataTexture(
      new Uint8Array([80, 80, 80, 255, 170, 170, 170, 255, 255, 255, 255, 255]),
      3,
      1,
      THREE.RGBAFormat,
    );
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
    const animeMat = new THREE.MeshToonMaterial({
      color: 0x8fe6c9,
      gradientMap: ramp,
      emissive: 0x285e4e,
      emissiveIntensity: .08,
    });
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0x33655b, side: THREE.BackSide });

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d');
    const fade = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
    fade.addColorStop(0, 'rgba(31,68,50,0.30)');
    fade.addColorStop(.55, 'rgba(31,68,50,0.13)');
    fade.addColorStop(1, 'rgba(31,68,50,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
    const shadowMap = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeometry = new THREE.PlaneGeometry(2.8, 2.6);

    const ringGeometry = new THREE.RingGeometry(0.95, 1.15, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x33655b,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    shared = {
      refCount: 0,
      ramp,
      animeMat,
      outlineMat,
      shadowMap,
      shadowGeometry,
      ringGeometry,
      ringMaterial,
    };
  }
  shared.refCount += 1;
  return shared;
}

function releaseShared() {
  if (!shared) return;
  shared.refCount -= 1;
  if (shared.refCount > 0) return;
  shared.ramp.dispose();
  shared.animeMat.dispose();
  shared.outlineMat.dispose();
  shared.shadowMap.dispose();
  shared.shadowGeometry.dispose();
  shared.ringGeometry.dispose();
  shared.ringMaterial.dispose();
  shared = null;
}

function skipRaycast(mesh) {
  mesh.raycast = function skipRaycastImpl() {};
}

function applyConservativeBodyBounds(THREE, geometry) {
  const center = new THREE.Vector3(BODY_BOUNDS_CENTER[0], BODY_BOUNDS_CENTER[1], BODY_BOUNDS_CENTER[2]);
  geometry.boundingSphere = new THREE.Sphere(center.clone(), BODY_BOUNDS_RADIUS);
  geometry.computeBoundingSphere = function computeBoundingSphere() {
    if (this.boundingSphere === null) {
      this.boundingSphere = new THREE.Sphere(center.clone(), BODY_BOUNDS_RADIUS);
    } else {
      this.boundingSphere.center.copy(center);
      this.boundingSphere.radius = BODY_BOUNDS_RADIUS;
    }
    return this;
  };
}

/**
 * Create one resident. Body and outline of this actor share geometry. Pose buffers
 * are unique. Gradient/toon/outline materials are shared (not mutated per instance).
 *
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @param {SlimeActorOptions} [options]
 */
export function createSlimeActor(THREE, options = {}) {
  const resources = acquireShared(THREE);
  const profilePoints = getProfilePoints(THREE);
  const pose = createPoseState(new THREE.Vector3());
  pose.t = options.timeSec || 0;
  pose.walkBlend = options.walkBlend || 0;
  pose.walkPhase = options.walkPhase !== undefined ? options.walkPhase : (pose.t / WALK_CYCLE_SEC) % 1;

  let worldX = options.x || 0;
  let worldZ = options.z || 0;
  let worldYaw = options.yaw || 0;
  let comparisonTravelEnabled = options.comparisonTravelEnabled !== false;
  let selected = !!options.selected;
  let paused = false;
  let mode = 'idle';
  let disposed = false;
  const id = options.id || '';

  const worldRoot = new THREE.Group();
  worldRoot.name = id ? `slime-world-${id}` : 'slime-world';
  const actor = new THREE.Group();
  actor.name = id ? `slime-actor-${id}` : 'slime-actor';
  worldRoot.add(actor);

  const geometry = new THREE.LatheGeometry(profilePoints, LATHE_SEGMENTS);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  if (geometry.attributes.normal) geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  applyConservativeBodyBounds(THREE, geometry);
  const base = new Float32Array(geometry.attributes.position.array);
  const bodyAttr = geometry.attributes.position;
  const bodyArray = bodyAttr.array;

  const body = new THREE.Mesh(geometry, resources.animeMat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.slimeId = id;
  body.userData.role = 'slime-body';
  actor.add(body);

  const outline = new THREE.Mesh(geometry, resources.outlineMat);
  outline.scale.set(1.012, 1.008, 1.012);
  skipRaycast(outline);
  actor.add(outline);

  const faceParts = [];
  const faceGeometries = [];
  const faceMaterials = [];

  function decal(cx, cy, rx, ry, color, depth = .01) {
    const positions = [], idx = [];
    const segments = 48;
    for (let i = 0; i <= segments + 1; i++) {
      const a = (i - 1) / segments * Math.PI * 2;
      const x = i === 0 ? cx : cx + Math.cos(a) * rx;
      const y = i === 0 ? cy : cy + Math.sin(a) * ry;
      const r = radius(y, profilePoints);
      positions.push(x, y, Math.sqrt(Math.max(0, r * r - x * x)) + depth);
    }
    for (let i = 1; i <= segments; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    skipRaycast(m);
    actor.add(m);
    faceGeometries.push(g);
    faceMaterials.push(mat);
    const attr = g.attributes.position;
    const part = { m, base: new Float32Array(positions), cy, eye: false, attr, array: attr.array };
    faceParts.push(part);
    return part;
  }

  for (const s of [-1, 1]) {
    const eye = decal(s * .265, .655, .065, .115, 0x244e48, .014);
    eye.eye = true;
    const glint = decal(s * .265 - .017, .695, .018, .027, 0xf4fff5, .022);
    glint.eye = true;
    glint.cy = .655;
    decal(s * .47, .475, .095, .035, 0xefadac, .014);
  }

  const mouthPoints = [];
  for (let i = 0; i <= 20; i++) {
    const x = (i / 20 - .5) * .15, y = .468 - .035 * Math.sin(i / 20 * Math.PI);
    mouthPoints.push(new THREE.Vector3(x, y, Math.sqrt(radius(y, profilePoints) ** 2 - x * x) + .018));
  }
  const mouthGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouthPoints), 24, .009, 6, false);
  mouthGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2f6156 });
  const mouth = new THREE.Mesh(mouthGeometry, mouthMat);
  mouth.frustumCulled = false;
  skipRaycast(mouth);
  actor.add(mouth);
  faceGeometries.push(mouthGeometry);
  faceMaterials.push(mouthMat);
  const mouthAttr = mouthGeometry.attributes.position;
  faceParts.push({
    m: mouth,
    base: new Float32Array(mouthGeometry.attributes.position.array),
    eye: false,
    attr: mouthAttr,
    array: mouthAttr.array,
    cy: 0,
  });

  decal(-.32, 1.025, .07, .12, 0xecfff6, .015);
  decal(-.45, .91, .031, .05, 0xe6fff4, .015);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: resources.shadowMap,
    transparent: true,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(resources.shadowGeometry, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = .006;
  skipRaycast(contactShadow);
  worldRoot.add(contactShadow);

  const selectionRing = new THREE.Mesh(resources.ringGeometry, resources.ringMaterial);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = .01;
  selectionRing.visible = selected;
  skipRaycast(selectionRing);
  worldRoot.add(selectionRing);

  if (options.parent) options.parent.add(worldRoot);

  function applyPoseTransforms() {
    actor.position.y = pose.lift;
    actor.rotation.z = idleSway(pose.t, pose.walkBlend);
    if (comparisonTravelEnabled) {
      worldRoot.position.x = worldX + comparisonTravelX(pose.t, pose.walkBlend);
      worldRoot.rotation.y = worldYaw + comparisonTravelYaw(pose.t, pose.walkBlend);
    } else {
      worldRoot.position.x = worldX;
      worldRoot.rotation.y = worldYaw;
    }
    worldRoot.position.z = worldZ;
  }

  function deformFaces() {
    const blink = blinkScale(pose.t);
    const out = pose.out;
    for (let p = 0; p < faceParts.length; p++) {
      const part = faceParts[p];
      const baseP = part.base;
      const arr = part.array;
      for (let i = 0; i < baseP.length; i += 3) {
        const x = baseP[i];
        const y = part.eye ? part.cy + (baseP[i + 1] - part.cy) * blink : baseP[i + 1];
        let z = baseP[i + 2];
        if (part.eye) {
          const oldR = radius(baseP[i + 1], profilePoints);
          const newR = radius(y, profilePoints);
          z += Math.sqrt(Math.max(0, newR * newR - x * x)) - Math.sqrt(Math.max(0, oldR * oldR - x * x));
        }
        deform(pose, x, y, z);
        arr[i] = out.x;
        arr[i + 1] = out.y;
        arr[i + 2] = out.z;
      }
      part.attr.needsUpdate = true;
    }
  }

  function applyCurrentPose() {
    if (disposed) return;
    evaluatePose(pose);
    applyPoseTransforms();
    deformPositionArray(pose, base, bodyArray);
    bodyAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    deformFaces();
    contactShadow.scale.set(pose.sx * (1 + pose.lift * .4), pose.sz * (1 + pose.lift * .4), 1);
    shadowMat.opacity = 1 - pose.lift * 1.8;
  }

  /**
   * Snap to a deterministic pose. Omitted walkPhase uses `(timeSec/1.25)%1`.
   * @param {{ timeSec?: number, walkPhase?: number, walkBlend?: number, paused?: boolean }} next
   */
  function setPose(next) {
    if (disposed) return;
    if (next.timeSec !== undefined) pose.t = next.timeSec;
    if (next.walkBlend !== undefined) pose.walkBlend = next.walkBlend;
    if (next.walkPhase !== undefined) pose.walkPhase = next.walkPhase;
    else if (next.timeSec !== undefined) pose.walkPhase = (pose.t / WALK_CYCLE_SEC) % 1;
    if (next.paused !== undefined) paused = next.paused;
    applyCurrentPose();
  }

  /**
   * Advance like the original `animate` inner loop. Caps dt at 0.05s.
   * When `paused` is true, pose stays put (still reapplies current deformation).
   * @param {number} dt
   * @param {{ mode?: 'idle'|'walk', paused?: boolean }} [opts]
   */
  function update(dt, opts) {
    if (disposed) return;
    if (opts) {
      if (opts.mode !== undefined) mode = opts.mode;
      if (opts.paused !== undefined) paused = opts.paused;
    }
    const step = Math.min(.05, dt);
    if (!paused) {
      pose.t += step;
      pose.walkBlend = THREE.MathUtils.damp(pose.walkBlend, mode === 'walk' ? 1 : 0, 5, step);
      pose.walkPhase = (pose.t / WALK_CYCLE_SEC) % 1;
    }
    applyCurrentPose();
  }

  function setComparisonTravelEnabled(enabled) {
    comparisonTravelEnabled = !!enabled;
    applyPoseTransforms();
  }

  function setSelected(isSelected) {
    selected = !!isSelected;
    selectionRing.visible = selected;
  }

  /**
   * @param {{ x?: number, z?: number, yaw?: number }} next
   */
  function setWorldPose(next) {
    if (next.x !== undefined) worldX = next.x;
    if (next.z !== undefined) worldZ = next.z;
    if (next.yaw !== undefined) worldYaw = next.yaw;
    applyPoseTransforms();
  }

  function getPose() {
    return {
      timeSec: pose.t,
      walkPhase: pose.walkPhase,
      walkBlend: pose.walkBlend,
      sx: pose.sx,
      sy: pose.sy,
      sz: pose.sz,
      lean: pose.lean,
      wobble: pose.wobble,
      lift: pose.lift,
      paused,
      mode,
      comparisonTravelEnabled,
      selected,
      x: worldX,
      z: worldZ,
      yaw: worldYaw,
    };
  }

  function getBodyPositionArray() {
    return bodyArray;
  }

  /**
   * Copy current body positions into `target` (allocated by the caller).
   * @param {Float32Array} target
   * @returns {Float32Array}
   */
  function copyBodyPositions(target) {
    target.set(bodyArray);
    return target;
  }

  const mouthLocal = mouthRestLocal(profilePoints);

  /**
   * Deformed mouth attachment in world space. Caller owns `target`.
   * @param {import('../../vendor/three/three.module.js').Vector3} target
   */
  function getMouthWorldPosition(target) {
    deform(pose, mouthLocal.x, mouthLocal.y, mouthLocal.z);
    target.set(pose.out.x, pose.out.y, pose.out.z);
    actor.updateMatrixWorld(true);
    actor.localToWorld(target);
    return target;
  }

  /**
   * Face looks toward local +Z.
   * @param {import('../../vendor/three/three.module.js').Vector3} target
   */
  function getFaceForward(target) {
    worldRoot.updateMatrixWorld(true);
    target.set(0, 0, 1).transformDirection(worldRoot.matrixWorld);
    return target;
  }

  /**
   * Restrained squash using the existing walk compression key (phase 0.17).
   * Amount 0 leaves the current pose alone so blink/idle can continue.
   * @param {number} amount 0..1
   */
  function setFeedSquash(amount) {
    if (disposed) return;
    const a = Math.max(0, Math.min(1, amount));
    if (a <= 1e-4) return;
    pose.walkPhase = 0.17;
    pose.walkBlend = a * 0.48;
    applyCurrentPose();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    worldRoot.removeFromParent();
    geometry.dispose();
    for (let i = 0; i < faceGeometries.length; i++) faceGeometries[i].dispose();
    for (let i = 0; i < faceMaterials.length; i++) faceMaterials[i].dispose();
    shadowMat.dispose();
    releaseShared();
  }

  applyCurrentPose();

  return {
    id,
    worldRoot,
    actor,
    body,
    outline,
    contactShadow,
    selectionRing,
    setPose,
    update,
    setComparisonTravelEnabled,
    setSelected,
    setWorldPose,
    getPose,
    getBodyPositionArray,
    copyBodyPositions,
    getMouthWorldPosition,
    getFaceForward,
    setFeedSquash,
    dispose,
  };
}
