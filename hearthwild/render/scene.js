// Adapted from hushlight/world.js: faceted island, keeper, orthographic follow camera, decorations.
import * as T from '../vendor/three.module.min.js';
import { displayPose } from '../core/state.mjs';
import { clampZoom } from '../input/gestures.mjs';
import { pickWalkTarget, walkPolygon, pointInPolygon, distanceToEdges } from '../world/boundary.mjs';
import { footprintBounds, footprintCells, footprintCenter } from '../data/buildings.mjs';
import { earthHidesGrassRoot } from '../world/soil.mjs';
import { createMaterialRegistry } from './materials.js';
import { createLiftedProduce, createResourceGroup, createStructureGroup, setResourceVisual, setSoilCrop } from './assets.js';
import { cropOnSoil, isWildCrop } from '../data/crops.mjs';
import { createKeeperRig } from './keeper.js';
import { createCameraState } from './camera.mjs';
import { paletteColor } from '../data/palettes.mjs';
import {
  FINISH_SECONDS, PARTICLE_CAP, burstCount, contactHeight, contactKind, createCueMemory,
  facingTo, idleHoePose, motionStyle, nearContactPoint,
} from './gathering.mjs';

const TAU = Math.PI * 2;
const FLOOR_SHORE = 0.935;

function area2XZ(a, b, c) {
  return (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
}

function pointInTriXZ(px, pz, a, b, c) {
  const c0 = (b[0] - a[0]) * (pz - a[2]) - (b[2] - a[2]) * (px - a[0]);
  const c1 = (c[0] - b[0]) * (pz - b[2]) - (c[2] - b[2]) * (px - b[0]);
  const c2 = (a[0] - c[0]) * (pz - c[2]) - (a[2] - c[2]) * (px - c[0]);
  return (c0 >= -1e-8 && c1 >= -1e-8 && c2 >= -1e-8) || (c0 <= 1e-8 && c1 <= 1e-8 && c2 <= 1e-8);
}

function triangulateXZ(ring) {
  const n = ring.length;
  if (n < 3) return [];
  const indices = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    indices.push(i);
    const a = ring[i];
    const b = ring[(i + 1) % n];
    sum += a[0] * b[2] - b[0] * a[2];
  }
  if (sum < 0) indices.reverse();
  const faces = [];
  let guard = 0;
  while (indices.length > 3 && guard < n * n) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const i0 = indices[(i + indices.length - 1) % indices.length];
      const i1 = indices[i];
      const i2 = indices[(i + 1) % indices.length];
      if (area2XZ(ring[i0], ring[i1], ring[i2]) <= 1e-8) continue;
      let occupied = false;
      for (const idx of indices) {
        if (idx === i0 || idx === i1 || idx === i2) continue;
        if (pointInTriXZ(ring[idx][0], ring[idx][2], ring[i0], ring[i1], ring[i2])) {
          occupied = true;
          break;
        }
      }
      if (occupied) continue;
      faces.push([ring[i0], ring[i1], ring[i2]]);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (indices.length === 3) faces.push([ring[indices[0]], ring[indices[1]], ring[indices[2]]]);
  return faces;
}

function createRng(seed = 27) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

export function createWorld(canvas, descriptor) {
  const registry = createMaterialRegistry(T);
  const rand = createRng(27);
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-18, 18, 12, -12, 0.1, 280);
  camera.position.set(0, 44, 56);
  camera.lookAt(0, -2.8, 0);

  const hemi = new T.HemisphereLight(0xb7c9d6, 0x1c2418, 2.15);
  scene.add(hemi);
  registry.registerLight(hemi);
  const moonlight = new T.DirectionalLight(0xc8d4e0, 2.9);
  moonlight.position.set(-18, 34, 9);
  moonlight.castShadow = true;
  const span = descriptor.fitHalf + 2;
  Object.assign(moonlight.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: Math.max(110, span * 2.4) });
  moonlight.shadow.mapSize.set(1024, 1024);
  moonlight.shadow.normalBias = 0.04;
  scene.add(moonlight);
  registry.registerLight(moonlight);
  const rimLight = new T.DirectionalLight(0x8aa8b8, 1.25);
  rimLight.position.set(12, 7, -16);
  scene.add(rimLight);
  registry.registerLight(rimLight);

  const dropGeo = [];
  const dropMat = [];
  function trackGeo(geometry) {
    dropGeo.push(geometry);
    return geometry;
  }
  const geometries = {
    stone: trackGeo(new T.IcosahedronGeometry(1, 0)),
    crystal: trackGeo(new T.OctahedronGeometry(1, 0)),
    cone: trackGeo(new T.ConeGeometry(1, 1, 5)),
    cylinder: trackGeo(new T.CylinderGeometry(1, 1, 1, 7)),
    cube: trackGeo(new T.BoxGeometry(1, 1, 1)),
    ring: trackGeo(new T.RingGeometry(0.9, 1, 48)),
  };

  function mesh(geometry, material, parent, x, y, z, sx = 1, sy = sx, sz = sx) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  const terrain = new T.Group();
  scene.add(terrain);

  const positions = [];
  const colors = [];
  function face(a, b, c, color) {
    positions.push(...a, ...b, ...c);
    const shade = new T.Color(color);
    colors.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
  }

  const { top, cliff, under, tip } = descriptor.island;
  const count = top.length;
  const floorColor = 0x3e6b41;
  const rimBand = [0x4a7a48, 0x3a5a40, 0x6a8a58, 0x5a7a88];
  const sides = [0x3a322c, 0x4a4038, 0x2e2824, 0x453c36, 0x332c28];
  const shore = top.map(point => [point[0] * FLOOR_SHORE, point[1], point[2] * FLOOR_SHORE]);
  const floorTris = triangulateXZ(shore);
  if (floorTris.length >= Math.max(1, count - 2)) {
    for (const tri of floorTris) face(tri[0], tri[1], tri[2], floorColor);
  } else {
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      face([0, top[0][1], 0], shore[j], shore[i], floorColor);
    }
  }
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    face(shore[i], shore[j], top[i], rimBand[i % rimBand.length]);
    face(shore[j], top[j], top[i], rimBand[(i + 1) % rimBand.length]);
    face(top[i], top[j], cliff[i], sides[i % sides.length]);
    face(top[j], cliff[j], cliff[i], sides[(i + 2) % sides.length]);
    face(cliff[i], cliff[j], under[i], sides[(i + 1) % sides.length]);
    face(cliff[j], under[j], under[i], sides[(i + 3) % sides.length]);
    face(under[i], under[j], tip, sides[i % sides.length]);
  }

  const landGeo = trackGeo(new T.BufferGeometry());
  landGeo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  landGeo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  landGeo.computeVertexNormals();
  const land = new T.Mesh(landGeo, registry.meshMaterial(0xffffff, { vertexColors: true, roughness: 1, side: T.DoubleSide }));
  land.receiveShadow = true;
  land.castShadow = false;
  terrain.add(land);
  registry.registerVertexColors(landGeo);

  const walk = walkPolygon(descriptor.boundary.polygon, descriptor.walkMargin);
  const rimPoints = walk.map(p => new T.Vector3(p.x, 0.045, p.z));
  const rimLine = new T.LineLoop(trackGeo(new T.BufferGeometry().setFromPoints(rimPoints)), registry.lineMaterial(0x8eb4c4, { opacity: 0.72 }));
  terrain.add(rimLine);

  const pathMat = registry.meshMaterial(0x8a7048);
  for (const stone of descriptor.scenery?.paths || []) {
    const object = mesh(geometries.cylinder, pathMat, terrain, stone.x, 0.015, stone.z, stone.sx, 0.035, stone.sz);
    object.rotation.y = stone.rotY;
    object.castShadow = false;
  }

  const resources = [];
  for (const node of descriptor.nodes || []) {
    const group = createResourceGroup(T, node, mesh, geometries, registry);
    terrain.add(group);
    resources.push(group);
  }
  let pickables = (descriptor.nodes || []).map(node => ({ ...node, phase: 'ready' }));
  const structureViews = new Map();
  let structureRecords = [];
  let hideStructureId = null;

  const grassMat = registry.meshMaterial(0x4c8a4a);
  const grassViews = [];
  for (const item of descriptor.scenery?.grasses || []) {
    const clump = new T.Group();
    clump.position.set(item.x, 0, item.z);
    clump.userData.rootX = item.x;
    clump.userData.rootZ = item.z;
    terrain.add(clump);
    for (let j = 0; j < 3; j++) {
      const leaf = mesh(geometries.cone, grassMat, clump, j * 0.08, 0.16, 0, 0.05, item.height, 0.055);
      leaf.rotation.z = item.tilt * (j === 1 ? 1 : 0.6);
    }
    grassViews.push(clump);
  }

  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = 64;
  const context = texCanvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffff');
  gradient.addColorStop(0.13, '#ffffffe0');
  gradient.addColorStop(0.4, '#ffffff38');
  gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const glowTexture = new T.CanvasTexture(texCanvas);

  function glow(parent, color, size, x = 0, y = 0, z = 0, opacity = 0.7) {
    const sprite = new T.Sprite(registry.spriteMaterial(glowTexture, color, { opacity }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    parent.add(sprite);
    return sprite;
  }

  function ring(parent, color, radius, y, opacity = 0.5) {
    const object = new T.Mesh(geometries.ring, registry.basicMaterial(color, {
      transparent: true, opacity, side: T.DoubleSide, depthWrite: false,
    }));
    object.rotation.x = -Math.PI / 2;
    object.position.y = y;
    object.scale.setScalar(radius);
    parent.add(object);
    return object;
  }

  const keeperRig = createKeeperRig(T, { mesh, geometries, registry, glow, trackGeo });
  const keeper = keeperRig.root;
  terrain.add(keeper);
  const gatherMemory = createCueMemory();
  let lastReduced = false;
  const chips = [];
  for (let i = 0; i < PARTICLE_CAP; i++) {
    const mat = new T.MeshBasicMaterial({
      color: 0x8a6a48, transparent: true, opacity: 0, depthWrite: false,
    });
    dropMat.push(mat);
    const object = new T.Mesh(geometries.crystal, mat);
    object.visible = false;
    object.castShadow = false;
    object.receiveShadow = false;
    terrain.add(object);
    chips.push({ object, mat, vx: 0, vy: 0, vz: 0, life: 0, max: 0 });
  }
  const producePool = [];
  const seedHand = new T.Vector3();
  const plantSeeds = [];
  for (let i = 0; i < 3; i++) {
    const mat = new T.MeshStandardMaterial({ color: 0xe8d4a0, roughness: 0.85, metalness: 0 });
    dropMat.push(mat);
    const object = new T.Mesh(geometries.stone, mat);
    object.visible = false;
    object.castShadow = false;
    object.receiveShadow = false;
    terrain.add(object);
    plantSeeds.push({ object, mat, live: false });
  }

  function clearProduce() {
    for (const item of producePool) {
      item.live = false;
      item.group.visible = false;
    }
  }

  function concealSoilCrop(group) {
    const bySpecies = group?.userData.cropParts || {};
    for (const parts of Object.values(bySpecies)) {
      for (const part of Object.values(parts || {})) part.visible = false;
    }
  }

  function clearPlantSeeds() {
    for (const seed of plantSeeds) {
      seed.live = false;
      seed.object.visible = false;
    }
  }

  function showPlantSeeds(species, drop, show, origin, hand) {
    if (!(show > 0.04) || !origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) {
      clearPlantSeeds();
      return;
    }
    const potato = species === 'potato';
    const count = potato ? 2 : 3;
    const hex = potato ? 0xc4a05a : 0xe8d4a0;
    const fromX = Number.isFinite(hand?.x) ? hand.x : origin.x;
    const fromY = Number.isFinite(hand?.y) ? hand.y : 0.22;
    const fromZ = Number.isFinite(hand?.z) ? hand.z : origin.z;
    const amount = Math.min(1, Math.max(0, drop));
    for (let i = 0; i < plantSeeds.length; i++) {
      const seed = plantSeeds[i];
      if (i >= count) {
        seed.live = false;
        seed.object.visible = false;
        continue;
      }
      const yaw = i * 2.1 + 0.4;
      const destX = origin.x + Math.cos(yaw) * 0.035;
      const destZ = origin.z + Math.sin(yaw) * 0.035;
      seed.mat.color.setHex(paletteColor(hex, paletteName));
      seed.object.position.set(
        fromX + (destX - fromX) * amount,
        fromY + (0.028 - fromY) * amount,
        fromZ + (destZ - fromZ) * amount,
      );
      const size = potato && i === 0 ? 0.026 : 0.016;
      seed.object.scale.set(size, size * 0.7, size * 0.85);
      seed.object.visible = true;
      seed.live = true;
    }
  }

  function showLiftedProduce(kind, x, y, z) {
    let item = producePool.find(entry => !entry.live && entry.kind === kind)
      || producePool.find(entry => !entry.live);
    if (!item) {
      if (producePool.length >= 2) item = producePool[0];
      else {
        const group = createLiftedProduce(T, kind, mesh, geometries, registry);
        terrain.add(group);
        item = { group, kind, live: false };
        producePool.push(item);
      }
    }
    if (item.kind !== kind) {
      terrain.remove(item.group);
      item.group = createLiftedProduce(T, kind, mesh, geometries, registry);
      terrain.add(item.group);
      item.kind = kind;
    }
    item.live = true;
    item.group.visible = true;
    item.group.position.set(x, y, z);
  }

  function chipColor(kind) {
    let hex = 0x8a6a48;
    if (kind === 'copper') hex = 0xe8b86a;
    else if (kind === 'stone') hex = 0x7a7e82;
    else if (kind === 'leaf') hex = 0x4c8a4a;
    else if (kind === 'earth') hex = 0x5c5348;
    return paletteColor(hex, paletteName);
  }

  function burstChips(x, y, z, kind, count, reduced) {
    if (reduced) return;
    let spawned = 0;
    const want = Math.min(count, 8);
    for (const chip of chips) {
      if (spawned >= want) break;
      if (chip.life > 0) continue;
      chip.life = chip.max = kind === 'earth' ? 0.32 + spawned * 0.02 : 0.38 + spawned * 0.02;
      const spread = kind === 'earth' ? 0.7 : 1.4;
      chip.vx = (Math.random() - 0.5) * spread;
      chip.vy = 0.45 + Math.random() * (kind === 'earth' ? 0.45 : 0.9);
      chip.vz = (Math.random() - 0.5) * spread;
      chip.mat.color.setHex(chipColor(kind));
      chip.mat.opacity = 0.85;
      chip.object.visible = true;
      chip.object.position.set(x, y, z);
      chip.object.scale.setScalar(0.04 + Math.random() * 0.03);
      spawned += 1;
    }
  }

  function stepChips(dt, paused) {
    if (paused || dt <= 0) return;
    for (const chip of chips) {
      if (chip.life <= 0) continue;
      chip.life -= dt;
      if (chip.life <= 0) {
        chip.object.visible = false;
        chip.mat.opacity = 0;
        continue;
      }
      chip.vy -= 4.2 * dt;
      chip.object.position.x += chip.vx * dt;
      chip.object.position.y += chip.vy * dt;
      chip.object.position.z += chip.vz * dt;
      chip.mat.opacity = Math.max(0, chip.life / chip.max);
      chip.object.rotation.x += dt * 6;
    }
  }

  function clearChips() {
    for (const chip of chips) {
      chip.life = 0;
      chip.object.visible = false;
      chip.mat.opacity = 0;
    }
  }

  function resourceGroup(id) {
    return resources.find(item => item.userData.nodeId === id) || null;
  }

  function handleGatherEvents(events, state) {
    for (const event of events || []) {
      if (event.type === 'actionStarted') {
        if (event.targetCategory === 'resource' || event.action === 'harvest' || event.action === 'clear' || event.action === 'plantCrop' || event.action === 'harvestCrop' || event.action === 'uprootCrop' || event.action === 'smoothSoil' || event.action === 'till') {
          gatherMemory.start(event);
        }
      }
      if (event.type === 'actionCancelled') {
        gatherMemory.cancel(event.reason);
        clearChips();
        clearProduce();
        clearPlantSeeds();
      }
      if (event.type === 'harvested' || event.type === 'cleared') {
        gatherMemory.complete();
        const group = resourceGroup(event.id);
        const resource = (state?.resources || []).find(item => item.id === event.id);
        if (group && resource) {
          const point = nearContactPoint(state.player, resource, contactHeight(event.kind));
          burstChips(point.x, point.y, point.z, contactKind(event.kind, motionStyle(event.kind, event.type === 'cleared' ? 'clear' : 'harvest')), burstCount(event.kind, 'complete'), lastReduced);
          if (event.type === 'harvested' && event.kind === 'tree' && !lastReduced) {
            group.userData.holdMature = true;
            group.userData.finishT = 0;
          }
        }
      }
      if (event.type === 'planted' || (event.type === 'actionCompleted' && event.action === 'plantCrop')) {
        gatherMemory.complete();
        clearPlantSeeds();
      }
      if (event.type === 'harvestedCrop' || (event.type === 'actionCompleted' && event.action === 'harvestCrop')) {
        gatherMemory.complete();
        clearProduce();
      }
      if (event.type === 'uprooted' || (event.type === 'actionCompleted' && event.action === 'uprootCrop')) {
        gatherMemory.cancel('complete');
        clearProduce();
      }
      if (event.type === 'smoothed' || event.type === 'tilled' || (event.type === 'actionCompleted' && (event.action === 'smoothSoil' || event.action === 'till'))) {
        gatherMemory.cancel('complete');
      }
    }
  }

  const starPositions = [];
  const starColors = [];
  for (let i = 0; i < 520; i++) {
    const x = (rand() - 0.5) * 160;
    const y = rand() * 70 - 12;
    const z = -24 - rand() * 60;
    starPositions.push(x, y, z);
    const color = new T.Color(i % 4 ? 0xc8d4dc : 0xffcb83);
    starColors.push(color.r, color.g, color.b);
  }
  const starsGeo = trackGeo(new T.BufferGeometry());
  starsGeo.setAttribute('position', new T.Float32BufferAttribute(starPositions, 3));
  starsGeo.setAttribute('color', new T.Float32BufferAttribute(starColors, 3));
  const starMat = new T.PointsMaterial({
    size: 0.12, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false,
  });
  dropMat.push(starMat);
  const stars = new T.Points(starsGeo, starMat);
  scene.add(stars);
  registry.registerVertexColors(starsGeo);

  const moon = mesh(trackGeo(new T.SphereGeometry(2.1, 16, 12)), registry.basicMaterial(0xd0d8e0), scene, -28, 20, -42);
  moon.castShadow = false;
  glow(scene, 0xb8c8d4, 16, -28, 20, -42, 0.2);

  const satellites = [];
  const fragmentMat = registry.meshMaterial(0x2a3038);
  for (const item of descriptor.scenery?.fragments || []) {
    const object = mesh(geometries.stone, fragmentMat, scene, item.x, item.y, item.z, item.sx, item.sy, item.sz);
    object.rotation.set(item.rx, item.ry, item.rz);
    satellites.push({ object, y: object.position.y });
  }

  const motes = [];
  const moteSpread = Math.max(16, (descriptor.fitHalf || 16) * 0.42);
  for (let i = 0; i < 42; i++) {
    const angle = rand() * TAU;
    const radius = rand() * moteSpread;
    const object = glow(terrain, i % 3 ? 0x8eb4c4 : 0xffcb83, 0.14 + rand() * 0.14, Math.cos(angle) * radius, 0.35 + rand() * 2.4, Math.sin(angle) * radius, 0.5);
    motes.push({ object, x: object.position.x, y: object.position.y, z: object.position.z, phase: rand() * TAU });
  }

  const targetMarker = ring(terrain, 0xffcb83, 0.35, 0.025, 0);
  const selectMarker = ring(terrain, 0xffcb83, 0.55, 0.03, 0);
  const gridPoints = [];
  const gridExtent = Math.max(12, Math.ceil(descriptor.fitHalf || 16));
  for (let i = -gridExtent; i <= gridExtent; i++) {
    gridPoints.push(new T.Vector3(i, 0.02, -gridExtent), new T.Vector3(i, 0.02, gridExtent));
    gridPoints.push(new T.Vector3(-gridExtent, 0.02, i), new T.Vector3(gridExtent, 0.02, i));
  }
  const grid = new T.LineSegments(
    trackGeo(new T.BufferGeometry().setFromPoints(gridPoints)),
    registry.lineMaterial(0x8eb4c4, { opacity: 0.22 }),
  );
  grid.visible = false;
  grid.renderOrder = 1;
  terrain.add(grid);
  const ghostGeo = trackGeo(new T.BoxGeometry(1, 1, 1));
  const ghostValid = registry.basicMaterial(0xffcb83, { transparent: true, opacity: 0.38, depthWrite: false });
  const ghostInvalid = registry.basicMaterial(0x9ea38a, { transparent: true, opacity: 0.42, depthWrite: false });
  const ghostGroup = new T.Group();
  ghostGroup.visible = false;
  terrain.add(ghostGroup);
  const tillLineValid = registry.lineMaterial(0xffcb83, { opacity: 0.95 });
  const tillLineInvalid = registry.lineMaterial(0xc45a4a, { opacity: 0.92 });
  const tillPreviewGroup = new T.Group();
  tillPreviewGroup.visible = false;
  tillPreviewGroup.renderOrder = 3;
  terrain.add(tillPreviewGroup);
  const tillLine = new T.LineLoop(
    trackGeo(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0.03, 0)])),
    tillLineValid,
  );
  tillLine.frustumCulled = false;
  tillPreviewGroup.add(tillLine);
  const tillIcon = new T.Group();
  tillPreviewGroup.add(tillIcon);
  mesh(geometries.cylinder, registry.meshMaterial(0x8a6a48), tillIcon, 0, 0.16, 0, 0.016, 0.26, 0.016).castShadow = false;
  const tillBlade = mesh(geometries.cube, registry.meshMaterial(0x4a4e52), tillIcon, 0.03, 0.04, 0, 0.11, 0.035, 0.07);
  tillBlade.rotation.z = 0.35;
  tillBlade.castShadow = false;
  tillIcon.children[0].rotation.z = 0.22;
  const rejectIcon = new T.Group();
  tillPreviewGroup.add(rejectIcon);
  const rejectA = mesh(geometries.cube, registry.meshMaterial(0xc45a4a), rejectIcon, 0, 0.12, 0, 0.16, 0.035, 0.035);
  rejectA.rotation.set(0, 0.6, 0.55);
  rejectA.castShadow = false;
  const rejectB = mesh(geometries.cube, registry.meshMaterial(0xc45a4a), rejectIcon, 0, 0.12, 0, 0.16, 0.035, 0.035);
  rejectB.rotation.set(0, -0.6, -0.55);
  rejectB.castShadow = false;
  let tillPreviewKey = '';

  function setTillPreview(preview) {
    const outline = preview?.outline;
    if (!outline?.length || !Number.isFinite(preview.x) || !Number.isFinite(preview.z)) {
      tillPreviewGroup.visible = false;
      tillPreviewKey = '';
      return;
    }
    const valid = Boolean(preview.valid);
    const icon = preview.icon === 'reject' || !valid ? 'reject' : 'till';
    const key = `${valid ? 1 : 0}|${icon}|${outline.map(vertex => `${vertex.x.toFixed(2)},${vertex.z.toFixed(2)}`).join(';')}`;
    if (key !== tillPreviewKey) {
      const points = outline.map(vertex => new T.Vector3(vertex.x, 0.03, vertex.z));
      const geometry = new T.BufferGeometry().setFromPoints(points);
      const previous = tillLine.geometry;
      tillLine.geometry = geometry;
      if (previous && !dropGeo.includes(previous)) previous.dispose();
      tillPreviewKey = key;
    }
    tillLine.material = valid ? tillLineValid : tillLineInvalid;
    tillIcon.visible = icon === 'till';
    rejectIcon.visible = icon === 'reject';
    tillPreviewGroup.position.set(0, 0, 0);
    tillIcon.position.set(preview.x, 0, preview.z);
    rejectIcon.position.set(preview.x, 0, preview.z);
    tillPreviewGroup.visible = true;
  }
  const raycaster = new T.Raycaster();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const hit = new T.Vector3();
  let zoom = 1;
  const cameraControl = createCameraState({ panLimit: descriptor.fitHalf || 26 });
  const cameraFocus = new T.Vector3();
  let paletteName = 'moonlit';

  renderer.setClearColor(0x080f20);
  scene.fog = new T.FogExp2(0x080f20, 0.0045);

  function applyPalette(name) {
    paletteName = name === 'ember' ? 'ember' : 'moonlit';
    const colorspace = registry.setPalette(paletteName);
    renderer.setClearColor(colorspace.night);
    scene.fog.color.set(colorspace.night);
    return paletteName;
  }
  applyPalette('moonlit');

  function setZoom(value) {
    zoom = clampZoom(value);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    return zoom;
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    const fit = descriptor.fitHalf;
    const half = Math.max(fit, fit * 0.99 / aspect);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  }
  resize();

  function groundPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2(
      (clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1,
    ), camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return pickWalkTarget(descriptor.boundary.polygon, hit.x, hit.z, descriptor.walkMargin);
  }

  function update(state, time, dt, reduced, target, leftover = 0, selected = null, presentation = null) {
    lastReduced = Boolean(reduced);
    const animationTime = reduced ? 0 : time;
    const pose = displayPose(state, leftover);
    const follow = Math.min(1, (zoom - 1) * 0.9);
    const view = cameraControl.view;
    const close = Math.min(1, (zoom - 1) / 3);
    const desiredFocus = new T.Vector3(pose.x * follow + view.panX, -2.8 + close * 3.45, pose.z * follow + view.panZ);
    cameraFocus.lerp(desiredFocus, reduced ? 1 : 1 - Math.exp(-Math.max(dt, 0.016) * 7));
    camera.position.set(
      cameraFocus.x + Math.sin(view.yaw) * Math.cos(view.pitch) * 73,
      cameraFocus.y + Math.sin(view.pitch) * 73,
      cameraFocus.z + Math.cos(view.yaw) * Math.cos(view.pitch) * 73,
    );
    camera.lookAt(cameraFocus);
    camera.updateMatrixWorld();

    const resource = state.action ? (state.resources || []).find(item => item.id === state.action.targetId) : null;
    const holdHoe = Boolean(state.equipment?.hoe) && presentation?.mode === 'hoe';
    const gatherStep = gatherMemory.step({
      action: state.action ? { ...state.action, elapsed: Math.min(state.action.duration, state.action.elapsed + Math.max(0, leftover)) } : null,
      kind: resource?.kind || state.action?.species,
      equipment: state.equipment,
      dt,
      reduced,
      paused: dt <= 0 && !state.action,
      idle: holdHoe ? idleHoePose() : null,
    });
    const aim = Number.isFinite(state.action?.x) && Number.isFinite(state.action?.z)
      ? { x: state.action.x, z: state.action.z }
      : resource;
    if (gatherStep.pose.faceTarget && aim) {
      gatherStep.pose.facingYaw = facingTo(pose, aim);
    }
    keeperRig.apply({
      pose,
      gather: gatherStep.pose,
      moving: pose.moving && !state.action,
      reduced,
      time: animationTime,
      dt,
    });
    const contactNode = resource || (Number.isFinite(state.action?.x) && Number.isFinite(state.action?.z)
      ? { x: state.action.x, z: state.action.z, radius: 0.45, kind: state.action.species }
      : null);
    if (gatherStep.cues.length && contactNode && !reduced) {
      const height = gatherStep.pose.style === 'plant' || gatherStep.pose.style === 'till'
        ? 0.04
        : contactHeight(resource?.kind || state.action?.species);
      const point = nearContactPoint(pose, contactNode, height);
      for (const cue of gatherStep.cues) {
        if (cue.fx === false || !cue.count) continue;
        burstChips(point.x, point.y, point.z, cue.kind, cue.count, reduced);
      }
    }
    const planting = state.action?.type === 'plantCrop';
    if (planting && gatherStep.pose.seedShow > 0.04 && !reduced) {
      const hand = keeper.getObjectByName('hand-right');
      if (hand) hand.getWorldPosition(seedHand);
      showPlantSeeds(
        state.action.species,
        gatherStep.pose.seedDrop,
        gatherStep.pose.seedShow,
        { x: state.action.x, z: state.action.z },
        hand ? seedHand : null,
      );
    } else {
      clearPlantSeeds();
    }
    for (const item of producePool) item.live = false;
    const hideStanding = gatherStep.pose.hideStanding >= 0.35;
    for (const group of resources) {
      if (!isWildCrop(group.userData.kind) || group.userData.phase !== 'ready' || !group.userData.mature) continue;
      const hiding = Boolean(resource && resource.id === group.userData.nodeId && hideStanding);
      group.userData.mature.visible = !hiding;
    }
    const liftKind = resource && isWildCrop(resource.kind)
      ? resource.kind
      : (state.action?.type === 'harvestCrop' && isWildCrop(state.action.species) ? state.action.species : null);
    const liftX = resource?.x ?? state.action?.x;
    const liftZ = resource?.z ?? state.action?.z;
    if (liftKind && gatherStep.pose.liftProduce > 0.04 && !reduced && Number.isFinite(liftX) && Number.isFinite(liftZ)) {
      showLiftedProduce(
        liftKind,
        liftX,
        0.05 + gatherStep.pose.liftProduce * 0.42,
        liftZ,
      );
    }
    for (const item of producePool) {
      if (!item.live) item.group.visible = false;
    }
    stepChips(dt, dt <= 0);

    resources.forEach((item, i) => {
      const nearKeeper = Math.hypot(item.position.x - pose.x, item.position.z - pose.z) < 2.2;
      const cutaway = zoom >= 4 && nearKeeper;
      for (const leaf of item.userData.canopy || []) {
        leaf.object.material = cutaway ? leaf.faded : leaf.solid;
        leaf.object.castShadow = !cutaway;
      }
      const react = item.userData.react;
      const readyTree = item.userData.kind === 'tree' && item.userData.phase === 'ready';
      const sway = readyTree && !reduced ? Math.sin(animationTime * 0.6 + i) * 0.007 : 0;
      const pulse = state.action && resource && item.userData.nodeId === resource.id ? gatherStep.pose : null;
      const tilt = pulse ? pulse.reactTilt : 0;
      const squash = pulse ? pulse.reactSquash : 0;
      if (react) {
        react.rotation.z = sway + tilt;
        react.scale.set(1, 1 - squash, 1);
      } else if (item.userData.kind === 'tree') {
        item.rotation.z = sway;
      }
      if (item.userData.holdMature) {
        item.userData.finishT = (item.userData.finishT || 0) + Math.max(0, dt);
        const finish = Math.min(1, item.userData.finishT / FINISH_SECONDS);
        if (react) react.scale.setScalar(Math.max(0.2, 1 - 0.8 * finish));
        if (finish >= 1 || reduced) {
          item.userData.holdMature = false;
          item.userData.finishT = 0;
          if (react) {
            react.scale.set(1, 1, 1);
            react.rotation.z = 0;
          }
          setResourceVisual(item, 'stump');
        }
      }
    });
    satellites.forEach((item, i) => { item.object.position.y = item.y + Math.sin(animationTime * 0.35 + i) * 0.15; });
    motes.forEach(mote => {
      mote.object.position.set(
        mote.x + Math.sin(animationTime * 0.3 + mote.phase) * 0.4,
        mote.y + Math.sin(animationTime * 0.7 + mote.phase) * 0.3,
        mote.z,
      );
    });
    stars.material.opacity = 0.6 + Math.sin(animationTime * 0.3) * 0.1;
    targetMarker.material.opacity = target?.active ? 0.6 : 0;
    if (target) {
      targetMarker.position.x = target.x;
      targetMarker.position.z = target.z;
      targetMarker.scale.setScalar(0.3 + Math.sin(animationTime * 4) * 0.035);
    }
    selectMarker.material.opacity = selected && !selected.hideRing ? 0.55 : 0;
    if (selected && Number.isFinite(selected.x) && Number.isFinite(selected.z) && !selected.hideRing) {
      selectMarker.position.x = selected.x;
      selectMarker.position.z = selected.z;
      const markerScale = (Number.isFinite(selected.radius) ? selected.radius : 0.4) * 1.8 + Math.sin(animationTime * 3) * 0.04;
      if (Number.isFinite(markerScale)) selectMarker.scale.setScalar(Math.min(6, Math.max(0.2, markerScale)));
    }
    const harvestingCrop = state.action?.type === 'harvestCrop';
    for (const [id, group] of structureViews) {
      if (group.userData.kind !== 'soil') continue;
      const crop = cropOnSoil(state.crops, id);
      setSoilCrop(group, crop, reduced);
      const targeted = harvestingCrop && (state.action.soilId === id || crop?.id === state.action.targetId);
      if (targeted && hideStanding) concealSoilCrop(group);
    }
    renderer.render(scene, camera);
    return gatherStep.cues;
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2(
      (clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1,
    ), camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return { node: null, structure: null, ground: null };
    const x = hit.x;
    const z = hit.z;
    let best = null;
    let bestDist = Infinity;
    for (const node of pickables) {
      const dist = Math.hypot(node.x - x, node.z - z);
      const limit = node.pickRadius || node.radius + 0.4;
      if (dist <= limit && dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    }
    let bestSolid = null;
    let bestGround = null;
    let solidDist = Infinity;
    let groundDist = Infinity;
    for (const structure of structureRecords) {
      if (structure.id === hideStructureId) continue;
      const center = Number.isFinite(structure.x) && Number.isFinite(structure.z)
        ? { x: structure.x, z: structure.z }
        : footprintCenter(structure.kind, structure.gx, structure.gz, structure.rotation);
      if (structure.outline?.length) {
        const inside = pointInPolygon(structure.outline, x, z);
        const edge = distanceToEdges(structure.outline, x, z);
        if (!inside && edge > 0.12) continue;
      } else {
        const bounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
        if (!bounds) continue;
        const pad = structure.kind === 'workbench' || structure.kind === 'furnace' ? 0.12 : 0.1;
        if (x < bounds.minX - pad || x > bounds.maxX + pad || z < bounds.minZ - pad || z > bounds.maxZ + pad) continue;
      }
      const dist = Math.hypot(center.x - x, center.z - z);
      if (structure.kind === 'workbench' || structure.kind === 'furnace') {
        if (dist < solidDist) {
          bestSolid = structure;
          solidDist = dist;
        }
      } else if (dist < groundDist) {
        bestGround = structure;
        groundDist = dist;
      }
    }
    return {
      node: best,
      structure: best ? null : (bestSolid || bestGround),
      ground: pickWalkTarget(descriptor.boundary.polygon, x, z, descriptor.walkMargin),
      x,
      z,
    };
  }

  function project(x, y, z) {
    const vector = new T.Vector3(x, y, z).project(camera);
    return {
      visible: vector.z > -1 && vector.z < 1,
      x: (vector.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-vector.y * 0.5 + 0.5) * canvas.clientHeight,
    };
  }

  function syncResources(list) {
    const records = list || [];
    pickables = records.filter(node => node.phase !== 'removed');
    const byId = new Map(records.map(node => [node.id, node]));
    const have = new Map(resources.map(group => [group.userData.nodeId, group]));
    for (const record of records) {
      let group = have.get(record.id);
      if (!group) {
        group = createResourceGroup(T, record, mesh, geometries, registry);
        terrain.add(group);
        resources.push(group);
        have.set(record.id, group);
      }
      if (group.userData.holdMature && record.phase === 'stump') continue;
      setResourceVisual(group, record.phase || 'removed');
      const react = group.userData.react;
      if (react && !group.userData.holdMature && record.phase !== 'ready') {
        react.rotation.z = 0;
        react.scale.set(1, 1, 1);
      }
    }
    for (let i = resources.length - 1; i >= 0; i--) {
      const group = resources[i];
      if (byId.has(group.userData.nodeId)) continue;
      terrain.remove(group);
      resources.splice(i, 1);
    }
  }

  function layoutStructure(group, structure) {
    const center = footprintCenter(structure.kind, structure.gx, structure.gz, structure.rotation);
    const x = Number.isFinite(structure.x) ? structure.x : center.x;
    const z = Number.isFinite(structure.z) ? structure.z : center.z;
    group.position.set(x, 0, z);
    group.rotation.y = structure.outline?.length ? 0 : structure.rotation * Math.PI / 2;
    group.visible = structure.id !== hideStructureId;
    if (group.userData.hearthGlow) {
      const lit = (structure.queue || []).length > 0 || (structure.output?.copperIngot || 0) > 0;
      group.userData.hearthGlow.visible = lit;
      group.userData.hearthLit = lit;
    }
  }

  function syncGrassCover() {
    for (const clump of grassViews) {
      clump.visible = !earthHidesGrassRoot(clump.userData.rootX, clump.userData.rootZ, structureRecords);
    }
  }

  function syncStructures(list) {
    structureRecords = (list || []).map(item => ({ ...item }));
    const seen = new Set();
    for (const structure of structureRecords) {
      seen.add(structure.id);
      let group = structureViews.get(structure.id);
      if (!group) {
        group = createStructureGroup(T, structure, mesh, geometries, registry);
        terrain.add(group);
        structureViews.set(structure.id, group);
      }
      layoutStructure(group, structure);
    }
    for (const [id, group] of structureViews) {
      if (seen.has(id)) continue;
      for (const geometry of group.userData.disposables || []) geometry.dispose();
      terrain.remove(group);
      structureViews.delete(id);
    }
    syncGrassCover();
  }

  function setBuildView(view = {}) {
    grid.visible = Boolean(view.active);
    hideStructureId = view.hideId || null;
    for (const [id, group] of structureViews) {
      group.visible = id !== hideStructureId;
    }
    const ghostSpec = view.ghost;
    while (ghostGroup.children.length) ghostGroup.remove(ghostGroup.children[0]);
    if (!ghostSpec) {
      ghostGroup.visible = false;
      return;
    }
    const cells = ghostSpec.kind === 'sapling'
      ? [{ gx: ghostSpec.gx, gz: ghostSpec.gz }]
      : footprintCells(ghostSpec.kind, ghostSpec.gx, ghostSpec.gz, ghostSpec.rotation);
    const material = ghostSpec.valid ? ghostValid : ghostInvalid;
    for (const cell of cells) {
      if (!Number.isFinite(cell.gx) || !Number.isFinite(cell.gz)) continue;
      const cube = new T.Mesh(ghostGeo, material);
      cube.position.set(cell.gx, ghostSpec.kind === 'sapling' ? 0.28 : 0.12, cell.gz);
      cube.scale.set(ghostSpec.kind === 'sapling' ? 0.36 : 0.92, ghostSpec.kind === 'sapling' ? 0.5 : 0.14, ghostSpec.kind === 'sapling' ? 0.36 : 0.92);
      cube.castShadow = false;
      cube.receiveShadow = false;
      ghostGroup.add(cube);
    }
    ghostGroup.visible = ghostGroup.children.length > 0;
  }

  function dispose() {
    clearChips();
    clearProduce();
    clearPlantSeeds();
    gatherMemory.cancel('replaced');
    keeperRig.reset();
    if (tillLine.geometry && !dropGeo.includes(tillLine.geometry)) tillLine.geometry.dispose();
    for (const group of structureViews.values()) {
      for (const geometry of group.userData.disposables || []) geometry.dispose();
    }
    structureViews.clear();
    glowTexture.dispose();
    for (const geometry of dropGeo) geometry.dispose();
    for (const material of dropMat) material.dispose();
    registry.dispose();
    renderer.dispose();
  }

  return {
    orbit: (dx, dy) => cameraControl.orbit(dx, dy),
    pan: (dx, dy) => cameraControl.pan(dx, dy, (camera.top - camera.bottom) / zoom / Math.max(1, canvas.clientHeight)),
    resetCamera: () => cameraControl.reset(),
    centerCamera: () => cameraControl.center(),
    inspect(player, target) {
      cameraControl.center();
      if (target) cameraControl.view.yaw = facingTo(player, target) + 1.25;
      cameraControl.view.pitch = 0.55;
      return setZoom(9);
    },
    get cameraYaw() { return cameraControl.view.yaw; },
    update, resize, groundPoint, pick, project, dispose, setZoom, setPalette: applyPalette, syncResources, syncStructures, setBuildView, setTillPreview, handleGatherEvents,
    get zoom() { return zoom; }, get palette() { return paletteName; },
    get tillPreviewVisible() { return tillPreviewGroup.visible; },
  };
}
