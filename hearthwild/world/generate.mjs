import {
  APPROACH_PADDING, BERRY_COUNT, BERRY_RADIUS, CARROT_COUNT, COPPER_COUNT, COPPER_RADIUS, CROP_PICK_RADIUS,
  CROP_SOURCE_RADIUS, GENERATOR_VERSION, ISLAND_RADIUS, ISLAND_RADIUS_MAX, ISLAND_RADIUS_MIN, ISLAND_SHAPES,
  KEEPER_RADIUS, MEADOW_EXTENT, PEBBLE_RADIUS, POLYGON_SAMPLES, POTATO_COUNT, STONE_COUNT, STONE_RADIUS,
  TREE_COUNT, TREE_RADIUS, TWIG_RADIUS, WALK_MARGIN, WILD_CROP_ATTEMPTS,
} from '../data/tuning.mjs';
import { BLOCKING_KINDS } from '../data/harvest.mjs';
import { isInside, radiusAtAngle, vertexRadius } from './boundary.mjs';
import { buildNav, cellReachable, cellToWorld, continuousWalkable, nearestWalkableCell, reachableSet } from './navigation.mjs';
import { hashSeed, mixStream, normalizeSeed, streamRng } from './random.mjs';

const TAU = Math.PI * 2;
const SOLID_GAP = 0.12;

export const REVIEW_SEEDS = Object.freeze(['hearthwild-review-a', 'hearthwild-review-b', 'hearthwild-review-c']);

export function nodeLabel(node) {
  if (!node) return '';
  if (node.kind === 'tree') return node.variant === 'broadleaf' ? 'Broadleaf' : 'Conifer';
  if (node.kind === 'stone') return 'Stone';
  if (node.kind === 'copper') return 'Copper seam';
  if (node.kind === 'berry') return 'Berry bush';
  if (node.kind === 'carrot') return 'Carrot';
  if (node.kind === 'potato') return 'Potato';
  if (node.kind === 'twig') return 'Twig patch';
  if (node.kind === 'pebble') return 'Pebble patch';
  return node.kind;
}

export function gameplayView(descriptor) {
  return {
    generatorVersion: descriptor.generatorVersion,
    seed: descriptor.seed,
    seedHash: descriptor.seedHash,
    spawn: descriptor.spawn,
    walkMargin: descriptor.walkMargin,
    polygon: descriptor.boundary.polygon,
    nodes: descriptor.nodes.map(node => ({
      id: node.id,
      kind: node.kind,
      variant: node.variant || null,
      x: node.x,
      z: node.z,
      radius: node.radius,
      protected: node.protected,
      scale: node.scale,
    })),
    animals: descriptor.animals.map(animal => ({
      id: animal.id, kind: animal.kind, x: animal.x, z: animal.z,
    })),
    protectedCells: descriptor.protectedCells,
  };
}

function extentOf(polygon) {
  return polygon.reduce((max, vertex) => Math.max(max, vertexRadius(vertex)), 0);
}

function inMeadow(x, z, radius) {
  return Math.abs(x) <= MEADOW_EXTENT + radius && Math.abs(z) <= MEADOW_EXTENT + radius;
}

function inAccessCorridor(x, z, radius, extent) {
  const alongDiagonal = Math.min(Math.abs(z - x), Math.abs(z + x)) / Math.SQRT2;
  const r = Math.hypot(x, z);
  return alongDiagonal <= 1.25 + radius && r >= MEADOW_EXTENT - 0.2 && r <= extent * 0.78;
}

function sampleAnnulus(rng, inner, outer) {
  const angle = rng() * TAU;
  const radius = Math.sqrt(inner * inner + rng() * (outer * outer - inner * inner));
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function sampleBand(rng, polygon, inner, outer) {
  const angle = rng() * TAU;
  const rim = radiusAtAngle(polygon, angle);
  const hi = Math.min(outer, rim - (WALK_MARGIN + 1.2));
  const lo = Math.min(inner, hi * 0.92);
  if (!(hi > lo) || hi <= 0) return null;
  const radius = Math.sqrt(lo * lo + rng() * (hi * hi - lo * lo));
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function rotateXZ(x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c - z * s, z: x * s + z * c };
}

function clampIslandRadius(radius) {
  return Math.min(ISLAND_RADIUS_MAX, Math.max(ISLAND_RADIUS_MIN, radius));
}

function overlaps(x, z, radius, solids, ignoreId) {
  for (const solid of solids) {
    if (solid.id === ignoreId) continue;
    if (Math.hypot(solid.x - x, solid.z - z) < solid.radius + radius + SOLID_GAP) return true;
  }
  return false;
}

function fits(polygon, x, z, radius, solids, options = {}) {
  const extent = options.extent ?? extentOf(polygon);
  if (!isInside(polygon, x, z, WALK_MARGIN + radius + 0.35)) return false;
  if (!options.allowMeadow && inMeadow(x, z, radius)) return false;
  if (!options.allowCorridor && inAccessCorridor(x, z, radius, extent)) return false;
  if (overlaps(x, z, radius, solids, options.ignoreId)) return false;
  return true;
}

function countOf(nodes, kind) {
  return nodes.filter(node => node.kind === kind).length;
}

function nextId(nodes, kind) {
  let index = countOf(nodes, kind);
  let id = `${kind}-${index}`;
  const used = new Set(nodes.map(node => node.id));
  while (used.has(id)) {
    index += 1;
    id = `${kind}-${index}`;
  }
  return { id, index };
}

function makeNode(kind, x, z, radius, rng, extra = {}) {
  const { id, index } = extra.id ? { id: extra.id, index: extra.index || 0 } : nextId(extra.nodes || [], kind);
  const node = {
    id,
    kind,
    x,
    z,
    radius,
    pickRadius: kind === 'tree' ? 0.98 : radius + 0.4,
    protected: Boolean(extra.protected),
    scale: 0.86 + rng() * 0.42,
    rotation: rng() * TAU,
  };
  if (kind === 'tree') node.variant = extra.variant || (rng() < 0.52 ? 'conifer' : 'broadleaf');
  if (kind === 'stone' || kind === 'copper') {
    node.sx = 0.4 + rng() * 0.3;
    node.sy = 0.32 + rng() * 0.3;
    node.sz = 0.38 + rng() * 0.28;
    node.rx = rng();
    node.ry = rng();
    node.rz = rng();
    node.warm = index % 2 === 0;
  }
  return node;
}

function addNode(nodes, solids, node) {
  nodes.push(node);
  solids.push(node);
}

function makeCropNode(kind, x, z, hash, extra = {}) {
  const { id } = extra.id ? { id: extra.id } : nextId(extra.nodes || [], kind);
  const lookRng = streamRng(hash, `crop-look:${id}`);
  return {
    id,
    kind,
    x,
    z,
    radius: CROP_SOURCE_RADIUS,
    pickRadius: CROP_PICK_RADIUS,
    protected: Boolean(extra.protected),
    scale: 0.9 + lookRng() * 0.22,
    rotation: lookRng() * TAU,
  };
}

function cropObstacles(solids) {
  return (solids || [])
    .filter(item => BLOCKING_KINDS.includes(item.kind))
    .map(item => ({ id: item.id, x: item.x, z: item.z, radius: item.radius, kind: item.kind }));
}

function cropNav(polygon, solids) {
  return buildNav({
    boundary: { polygon },
    nodes: [],
    walkMargin: WALK_MARGIN,
  }, cropObstacles(solids));
}

function sortedCropCells(nav, reached, polygon, solids, extra = {}) {
  const cells = [];
  const extent = extra.extent ?? extentOf(polygon);
  for (const key of reached) {
    const comma = key.indexOf(',');
    const world = cellToWorld(nav, Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
    if (extra.nearLimit != null && Math.hypot(world.x, world.z) > extra.nearLimit) continue;
    if (!fits(polygon, world.x, world.z, CROP_SOURCE_RADIUS, solids, {
      extent,
      allowCorridor: Boolean(extra.allowCorridor),
    })) continue;
    if (extra.requireApproach && !approachReachable(nav, reached, { ...world, radius: CROP_SOURCE_RADIUS })) {
      continue;
    }
    cells.push(world);
  }
  cells.sort((a, b) => {
    const da = Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z);
    if (da) return da;
    if (a.x !== b.x) return a.x - b.x;
    return a.z - b.z;
  });
  return cells;
}

function placeCropFromScan(kind, hash, polygon, nodes, solids, extra = {}) {
  const nav = cropNav(polygon, solids);
  const reached = reachableSet(nav, extra.spawn || { x: 0, z: 0 });
  const cells = sortedCropCells(nav, reached, polygon, solids, extra);
  if (!cells.length) return false;
  const point = cells[0];
  addNode(nodes, solids, makeCropNode(kind, point.x, point.z, hash, { nodes, protected: extra.protected }));
  return true;
}

function tryPlaceCrop(rng, hash, polygon, nodes, solids, kind, extra = {}) {
  const extent = extra.extent ?? extentOf(polygon);
  const attempts = extra.attempts ?? WILD_CROP_ATTEMPTS;
  const nav = extra.requireApproach ? cropNav(polygon, solids) : null;
  const reached = nav ? reachableSet(nav, extra.spawn || { x: 0, z: 0 }) : null;
  for (let i = 0; i < attempts; i++) {
    let x;
    let z;
    if (extra.center) {
      const angle = rng() * TAU;
      const dist = (extra.spread ?? 1.2) * Math.sqrt(rng());
      x = extra.center.x + Math.cos(angle) * dist;
      z = extra.center.z + Math.sin(angle) * dist;
    } else if (extra.near) {
      const angle = rng() * TAU;
      const inner = MEADOW_EXTENT + 2.05;
      const outer = extra.nearLimit ?? 14;
      const ring = inner + rng() * Math.max(0.2, outer - inner);
      x = Math.cos(angle) * ring;
      z = Math.sin(angle) * ring;
    } else {
      const sample = sampleBand(rng, polygon, extra.inner ?? MEADOW_EXTENT + 2.5, extra.outer ?? extent * 0.78)
        || sampleAnnulus(rng, extra.inner ?? MEADOW_EXTENT + 2.5, extra.outer ?? extent * 0.78);
      x = sample.x;
      z = sample.z;
    }
    if (extra.nearLimit != null && Math.hypot(x, z) > extra.nearLimit) continue;
    if (!fits(polygon, x, z, CROP_SOURCE_RADIUS, solids, { extent, allowCorridor: Boolean(extra.allowCorridor) })) {
      continue;
    }
    if (nav && !approachReachable(nav, reached, { x, z, radius: CROP_SOURCE_RADIUS })) continue;
    addNode(nodes, solids, makeCropNode(kind, x, z, hash, { nodes, protected: extra.protected }));
    return true;
  }
  return false;
}

function placeOneCrop(rng, hash, polygon, nodes, solids, kind, extra = {}) {
  if (tryPlaceCrop(rng, hash, polygon, nodes, solids, kind, extra)) return true;
  return placeCropFromScan(kind, hash, polygon, nodes, solids, extra);
}

export function createCropPlan(hash) {
  const carrotRng = streamRng(hash, 'wild-carrot-v1');
  const potatoRng = streamRng(hash, 'wild-potato-v1');
  return {
    hash,
    carrotRng,
    potatoRng,
    carrotTarget: CARROT_COUNT[0] + Math.floor(carrotRng() * (CARROT_COUNT[1] - CARROT_COUNT[0] + 1)),
    potatoTarget: POTATO_COUNT[0] + Math.floor(potatoRng() * (POTATO_COUNT[1] - POTATO_COUNT[0] + 1)),
  };
}

function placeProtectedCrops(plan, polygon, nodes, solids) {
  for (const kind of ['carrot', 'potato']) {
    if (nodes.some(node => node.kind === kind && node.protected)) continue;
    const rng = kind === 'carrot' ? plan.carrotRng : plan.potatoRng;
    placeOneCrop(rng, plan.hash, polygon, nodes, solids, kind, {
      near: true,
      nearLimit: 14,
      protected: true,
      requireApproach: true,
    });
  }
}

function placeOptionalCrops(plan, polygon, nodes, solids) {
  const extent = extentOf(polygon);
  for (const kind of ['carrot', 'potato']) {
    const rng = kind === 'carrot' ? plan.carrotRng : plan.potatoRng;
    const target = kind === 'carrot' ? plan.carrotTarget : plan.potatoTarget;
    const minimum = kind === 'carrot' ? CARROT_COUNT[0] : POTATO_COUNT[0];
    let groupLeft = 0;
    let center = null;
    while (countOf(nodes, kind) < target) {
      if (groupLeft <= 0) {
        const left = target - countOf(nodes, kind);
        groupLeft = left === 1 ? 1 : (left >= 3 && rng() < 0.42 ? 3 : Math.min(2, left));
        center = null;
      }
      const extra = center
        ? { center, spread: 1.05 + rng() * 0.7, protected: false, extent }
        : { inner: MEADOW_EXTENT + 2.6, outer: extent * 0.78, protected: false, extent };
      if (!placeOneCrop(rng, plan.hash, polygon, nodes, solids, kind, extra)) break;
      const placed = nodes[nodes.length - 1];
      if (!center) center = { x: placed.x, z: placed.z };
      groupLeft -= 1;
    }
    while (countOf(nodes, kind) < minimum) {
      if (!placeCropFromScan(kind, plan.hash, polygon, nodes, solids, { protected: false, extent })) break;
    }
  }
}

function clusterCenters(rng, polygon, count, inner, outer) {
  const centers = [];
  for (let i = 0; i < count * 18 && centers.length < count; i++) {
    const point = sampleBand(rng, polygon, inner, outer) || sampleAnnulus(rng, inner, outer);
    if (!isInside(polygon, point.x, point.z, WALK_MARGIN + 2)) continue;
    if (inMeadow(point.x, point.z, 1.2)) continue;
    centers.push(point);
  }
  if (!centers.length) centers.push({ x: MEADOW_EXTENT + 4, z: 0 });
  return centers;
}

function placeAround(rng, polygon, nodes, solids, spec) {
  const extent = extentOf(polygon);
  const inner = spec.inner ?? MEADOW_EXTENT + 2.5;
  const outer = spec.outer ?? extent * 0.88;
  const maxAttempts = spec.target * 70;
  for (let attempt = 0; attempt < maxAttempts && countOf(nodes, spec.kind) < spec.target; attempt++) {
    let x;
    let z;
    if (spec.centers?.length && rng() < 0.78) {
      const center = spec.centers[Math.floor(rng() * spec.centers.length)];
      const angle = rng() * TAU;
      const radius = spec.spread * Math.sqrt(rng());
      x = center.x + Math.cos(angle) * radius;
      z = center.z + Math.sin(angle) * radius;
    } else {
      const sample = sampleBand(rng, polygon, inner, outer) || sampleAnnulus(rng, inner, outer);
      x = sample.x;
      z = sample.z;
    }
    if (!fits(polygon, x, z, spec.radius, solids, { extent })) continue;
    const extra = { nodes, protected: spec.protected, variant: spec.variantFn?.(rng) };
    addNode(nodes, solids, makeNode(spec.kind, x, z, spec.radius, rng, extra));
  }
}

function placeGuaranteed(rng, polygon, nodes, solids) {
  const specs = [
    { kind: 'tree', variant: 'conifer', angle: 0.22, r: 7.7, radius: TREE_RADIUS },
    { kind: 'tree', variant: 'broadleaf', angle: 1.78, r: 7.75, radius: TREE_RADIUS },
    { kind: 'tree', variant: 'conifer', angle: 3.36, r: 7.7, radius: TREE_RADIUS },
    { kind: 'tree', variant: 'broadleaf', angle: 4.92, r: 7.8, radius: TREE_RADIUS },
    { kind: 'stone', angle: 0.95, r: 8.2, radius: STONE_RADIUS, protected: true },
    { kind: 'stone', angle: 4.12, r: 8.15, radius: STONE_RADIUS, protected: true },
    { kind: 'copper', angle: 0.55, r: 11.1, radius: COPPER_RADIUS, protected: true },
    { kind: 'copper', angle: 2.12, r: 11.2, radius: COPPER_RADIUS, protected: true },
    { kind: 'copper', angle: 3.7, r: 11.05, radius: COPPER_RADIUS, protected: true },
    { kind: 'copper', angle: 5.28, r: 11.15, radius: COPPER_RADIUS, protected: true },
  ];
  for (const spec of specs) {
    let placed = false;
    for (const nudge of [0, 0.22, -0.22, 0.4, -0.4, 0.62, -0.62]) {
      const angle = spec.angle + nudge;
      const jitter = nudge === 0 ? 0.35 : 0.12;
      const x = Math.cos(angle) * spec.r + (rng() - 0.5) * jitter;
      const z = Math.sin(angle) * spec.r + (rng() - 0.5) * jitter;
      if (!fits(polygon, x, z, spec.radius, solids, { allowCorridor: false })) continue;
      addNode(nodes, solids, makeNode(spec.kind, x, z, spec.radius, rng, {
        nodes, variant: spec.variant, protected: spec.protected,
      }));
      placed = true;
      break;
    }
    if (placed) continue;
    const x = Math.cos(spec.angle) * spec.r;
    const z = Math.sin(spec.angle) * spec.r;
    if (!fits(polygon, x, z, spec.radius, solids, { allowCorridor: true })) continue;
    addNode(nodes, solids, makeNode(spec.kind, x, z, spec.radius, rng, {
      nodes, variant: spec.variant, protected: spec.protected,
    }));
  }
}

function ensureMinima(rng, polygon, nodes, solids, plan) {
  const extent = extentOf(polygon);
  const missing = [
    ['tree', plan.trees, TREE_RADIUS, { variantFn: value => (value() < 0.5 ? 'conifer' : 'broadleaf') }],
    ['stone', plan.stone, STONE_RADIUS, { protected: true }],
    ['copper', plan.copper, COPPER_RADIUS, { protected: true }],
    ['berry', plan.berry, BERRY_RADIUS, {}],
  ];
  for (const [kind, target, radius, extra] of missing) {
    let angle = rng() * TAU;
    let ring = MEADOW_EXTENT + 2.2;
    let guard = 0;
    while (countOf(nodes, kind) < target && guard < 480) {
      guard += 1;
      angle += 0.41 + rng() * 0.08;
      if (angle > TAU) {
        angle -= TAU;
        ring += 0.55;
        if (ring > extent * 0.86) ring = MEADOW_EXTENT + 2.2;
      }
      const x = Math.cos(angle) * ring;
      const z = Math.sin(angle) * ring;
      if (!fits(polygon, x, z, radius, solids, { extent })) continue;
      addNode(nodes, solids, makeNode(kind, x, z, radius, rng, { nodes, ...extra, variant: extra.variantFn?.(rng) }));
    }
  }
  if (!nodes.some(node => node.kind === 'tree' && node.variant === 'conifer')) {
    const tree = nodes.find(node => node.kind === 'tree');
    if (tree) tree.variant = 'conifer';
  }
  if (!nodes.some(node => node.kind === 'tree' && node.variant === 'broadleaf')) {
    const tree = nodes.find(node => node.kind === 'tree' && node.variant === 'conifer');
    if (tree) tree.variant = 'broadleaf';
  }
}

function ensureNearby(rng, polygon, nodes, solids, kind, needed, radius, extra = {}) {
  const limit = extra.limit ?? 14;
  const extent = extentOf(polygon);
  const nearCount = () => nodes.filter(node => node.kind === kind && Math.hypot(node.x, node.z) <= limit).length;
  let angle = rng() * TAU;
  let guard = 0;
  while (nearCount() < needed && guard < 260) {
    guard += 1;
    angle += 0.47 + rng() * 0.1;
    const ring = MEADOW_EXTENT + 2.1 + (guard % 8) * 0.38;
    const x = Math.cos(angle) * ring;
    const z = Math.sin(angle) * ring;
    if (Math.hypot(x, z) > limit) continue;
    const mover = nodes.find(node => node.kind === kind && Math.hypot(node.x, node.z) > limit);
    if (mover) {
      if (!fits(polygon, x, z, radius, solids, { extent, ignoreId: mover.id })) continue;
      mover.x = x;
      mover.z = z;
      if (extra.protected) mover.protected = true;
      continue;
    }
    if (!fits(polygon, x, z, radius, solids, { extent })) continue;
    addNode(nodes, solids, makeNode(kind, x, z, radius, rng, {
      nodes, protected: extra.protected, variant: extra.variantFn?.(rng),
    }));
  }
}

function placeGrasses(rng, polygon) {
  const grasses = [];
  const extent = extentOf(polygon);
  for (let n = 0; n < 220 && grasses.length < 72; n++) {
    const point = sampleBand(rng, polygon, 2.4, extent * 0.9) || sampleAnnulus(rng, 2.4, extent * 0.85);
    if (!isInside(polygon, point.x, point.z, 1.4)) continue;
    grasses.push({ x: point.x, z: point.z, tilt: (rng() - 0.5) * 0.9, height: 0.32 + rng() * 0.22 });
  }
  return grasses;
}

function placePaths(rng, polygon) {
  const paths = [];
  for (let i = 0; i < 28 && paths.length < 11; i++) {
    const angle = rng() * TAU;
    const radius = 1.1 + rng() * (MEADOW_EXTENT - 1.5);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (!isInside(polygon, x, z, 2)) continue;
    paths.push({
      x,
      z,
      sx: 0.24 + rng() * 0.12,
      sz: 0.18 + rng() * 0.1,
      rotY: rng() * TAU,
    });
  }
  return paths;
}

function placeFragments(rng, extent) {
  const fragments = [];
  for (let i = 0; i < 18; i++) {
    const angle = rng() * TAU;
    const radius = extent * (0.88 + rng() * 0.55);
    fragments.push({
      x: Math.cos(angle) * radius,
      y: -4 - rng() * 9,
      z: Math.sin(angle) * radius,
      sx: 0.35 + rng() * 0.7,
      sy: 0.45 + rng() * 0.8,
      sz: 0.4 + rng() * 0.55,
      rx: rng() * 3, ry: rng() * 3, rz: rng() * 3,
    });
  }
  return fragments;
}

function placeAnimals(rng, polygon, solids) {
  const animals = [];
  const kinds = [...Array(4).fill('rabbit'), ...Array(6).fill('bird')];
  const extent = extentOf(polygon);
  for (const kind of kinds) {
    for (let n = 0; n < 60; n++) {
      const inner = kind === 'rabbit' ? 1.6 : MEADOW_EXTENT;
      const outer = kind === 'rabbit' ? MEADOW_EXTENT + 8 : extent * 0.72;
      const point = sampleBand(rng, polygon, inner, outer) || sampleAnnulus(rng, inner, outer);
      if (!isInside(polygon, point.x, point.z, WALK_MARGIN + 0.45)) continue;
      if (solids.some(solid => Math.hypot(solid.x - point.x, solid.z - point.z) < solid.radius + 0.55)) continue;
      if (animals.some(animal => Math.hypot(animal.x - point.x, animal.z - point.z) < 1.15)) continue;
      animals.push({
        id: `${kind}-${animals.filter(animal => animal.kind === kind).length}`,
        kind,
        x: point.x,
        z: point.z,
        facing: rng() * TAU,
      });
      break;
    }
  }
  return animals;
}

function samplePolygon(count, radiusAt) {
  const polygon = [];
  for (let i = 0; i < count; i++) {
    const t = i / count * TAU;
    const radius = radiusAt(t);
    polygon.push({ x: Math.cos(t) * radius, z: Math.sin(t) * radius });
  }
  return polygon;
}

function rotatePolygon(polygon, yaw) {
  return polygon.map(point => rotateXZ(point.x, point.z, yaw));
}

function stadiumRadius(angle, straight, capR) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const absS = Math.abs(s);
  if (absS < 1e-8) return straight + capR;
  const rSide = capR / absS;
  if (Math.abs(rSide * c) <= straight) return rSide;
  const sx = (c < 0 ? -1 : 1) * straight;
  const b = -2 * c * sx;
  const disc = b * b - 4 * (straight * straight - capR * capR);
  return 0.5 * (-b + Math.sqrt(Math.max(0, disc)));
}

function buildEllipse(rng) {
  const yaw = rng() * TAU;
  const major = 42 + rng() * 6;
  const minor = major * (0.58 + rng() * 0.12);
  return rotatePolygon(samplePolygon(POLYGON_SAMPLES, t => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return (major * minor) / Math.sqrt((minor * c) * (minor * c) + (major * s) * (major * s));
  }), yaw);
}

function buildBlob(rng) {
  const base = ISLAND_RADIUS + rng() * 4;
  const a2 = 4.8 + rng() * 3.2;
  const a3 = 2.4 + rng() * 2.4;
  const a5 = 1.1 + rng() * 1.6;
  const p2 = rng() * TAU;
  const p3 = rng() * TAU;
  const p5 = rng() * TAU;
  return samplePolygon(POLYGON_SAMPLES, t => clampIslandRadius(
    base + a2 * Math.cos(2 * t + p2) + a3 * Math.sin(3 * t + p3) + a5 * Math.cos(5 * t + p5),
  ));
}

function buildCapsule(rng) {
  const yaw = rng() * TAU;
  const capR = 24 + rng() * 4;
  const straight = 16 + rng() * 8;
  return rotatePolygon(samplePolygon(POLYGON_SAMPLES, t => stadiumRadius(t, straight, capR)), yaw);
}

function buildClover(rng) {
  const lobes = rng() < 0.45 ? 3 : 4;
  const yaw = rng() * TAU;
  const trough = 24.5 + rng() * 2.5;
  const peak = 43 + rng() * 6;
  const power = 1.25 + rng() * 0.55;
  return rotatePolygon(samplePolygon(POLYGON_SAMPLES, t => {
    const wave = Math.pow(0.5 + 0.5 * Math.cos(lobes * t), power);
    return trough + (peak - trough) * wave;
  }), yaw);
}

function buildJagged(rng) {
  const base = ISLAND_RADIUS + rng() * 3;
  const a2 = 3.2 + rng() * 2.4;
  const a4 = 2.0 + rng() * 1.8;
  const a7 = 1.3 + rng() * 1.3;
  const a8 = 0.7 + rng() * 1.0;
  const p2 = rng() * TAU;
  const p4 = rng() * TAU;
  const p7 = rng() * TAU;
  const p8 = rng() * TAU;
  const kinks = 0.9 + rng() * 1.1;
  const k = 6 + Math.floor(rng() * 3);
  const kOff = rng();
  return samplePolygon(POLYGON_SAMPLES, t => {
    const tri = 2 * Math.abs(((t / TAU * k + kOff) % 1) - 0.5) - 0.5;
    return clampIslandRadius(
      base
      + a2 * Math.cos(2 * t + p2)
      + a4 * Math.sin(4 * t + p4)
      + a7 * Math.cos(7 * t + p7)
      + a8 * Math.sin(8 * t + p8)
      + kinks * tri * 2,
    );
  });
}

function pickShape(hash) {
  return ISLAND_SHAPES[mixStream(hash, 'shape') % ISLAND_SHAPES.length];
}

function buildPolygon(rng, hash) {
  const shape = pickShape(hash);
  let polygon;
  if (shape === 'ellipse') polygon = buildEllipse(rng);
  else if (shape === 'capsule') polygon = buildCapsule(rng);
  else if (shape === 'clover') polygon = buildClover(rng);
  else if (shape === 'jagged') polygon = buildJagged(rng);
  else polygon = buildBlob(rng);
  return { shape, polygon };
}

function buildIsland(polygon, outlineRng, cosmeticRng) {
  const radii = polygon.map(vertexRadius);
  const mean = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  return {
    inner: polygon.map(point => [point.x * 0.935, -0.03, point.z * 0.935]),
    top: polygon.map(point => [point.x, -0.03, point.z]),
    cliff: polygon.map((point, i) => {
      const dip = Math.abs(radii[i] - mean) * 1.15 + outlineRng() * 0.08;
      return [point.x * 0.88, -4.2 - dip, point.z * 0.88];
    }),
    under: polygon.map((point, i) => {
      const dip = (i % 7) * 0.38 + cosmeticRng() * 0.12;
      return [point.x * 0.3, -14.4 - dip, point.z * 0.3];
    }),
    tip: [0, -20.4, 0],
  };
}

function placeSupplyPatches(rng, polygon, nodes, animals = []) {
  const extent = extentOf(polygon);
  const specs = [
    { kind: 'twig', protected: true, inner: MEADOW_EXTENT + 0.7, outer: MEADOW_EXTENT + 5.2, near: MEADOW_EXTENT + 6 },
    { kind: 'pebble', protected: true, inner: MEADOW_EXTENT + 0.7, outer: MEADOW_EXTENT + 5.2, near: MEADOW_EXTENT + 6 },
    { kind: 'twig', protected: false, inner: 12, outer: extent * 0.82, near: 0 },
    { kind: 'pebble', protected: false, inner: 12, outer: extent * 0.82, near: 0 },
  ];
  for (const spec of specs) {
    const radius = spec.kind === 'twig' ? TWIG_RADIUS : PEBBLE_RADIUS;
    let placed = false;
    for (let attempt = 0; attempt < 110 && !placed; attempt++) {
      const point = sampleBand(rng, polygon, spec.inner, spec.outer) || sampleAnnulus(rng, spec.inner, spec.outer);
      if (spec.near && Math.hypot(point.x, point.z) > spec.near) continue;
      if (!fits(polygon, point.x, point.z, radius, nodes, { extent })) continue;
      if (animals.some(animal => Math.hypot(animal.x - point.x, animal.z - point.z) < 0.9)) continue;
      nodes.push(makeNode(spec.kind, point.x, point.z, radius, rng, {
        nodes, protected: spec.protected,
      }));
      placed = true;
    }
    if (!placed && spec.protected) {
      let angle = rng() * Math.PI * 2;
      for (let guard = 0; guard < 240 && !placed; guard++) {
        angle += 0.37;
        const ring = MEADOW_EXTENT + 1.4 + (guard % 8) * 0.35;
        const x = Math.cos(angle) * ring;
        const z = Math.sin(angle) * ring;
        if (!fits(polygon, x, z, radius, nodes, { extent })) continue;
        nodes.push(makeNode(spec.kind, x, z, radius, rng, { nodes, protected: true }));
        placed = true;
      }
    }
  }
}

function protectSupply(nodes) {
  const mark = (kind, needed) => {
    const list = nodes.filter(node => node.kind === kind);
    let count = list.filter(node => node.protected).length;
    if (count >= needed) return;
    list.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    for (const node of list) {
      if (node.protected) continue;
      node.protected = true;
      count += 1;
      if (count >= needed) break;
    }
  };
  mark('carrot', 1);
  mark('potato', 1);
  mark('stone', 2);
  mark('copper', 4);
  mark('twig', 1);
  mark('pebble', 1);
}

function assemble({ seed, hash, settings, polygon, shape, island, nodes, grasses, paths, fragments, animals, diagnostics }) {
  const maxRadius = extentOf(polygon);
  return {
    generatorVersion: GENERATOR_VERSION,
    seed,
    seedHash: hash,
    settings: { ...settings },
    spawn: { x: 0, z: 0, facing: 0 },
    boundary: { polygon, shape },
    walkMargin: WALK_MARGIN,
    fitHalf: maxRadius * 1.36,
    island,
    scenery: { grasses, paths, fragments },
    nodes,
    animals,
    protectedCells: nodes.filter(node => node.protected).map(node => ({
      id: node.id, x: Math.round(node.x), z: Math.round(node.z),
    })),
    diagnostics,
  };
}

function approachReachable(nav, reached, node) {
  const radius = node.radius + KEEPER_RADIUS + APPROACH_PADDING;
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * TAU;
    const x = node.x + Math.cos(angle) * radius;
    const z = node.z + Math.sin(angle) * radius;
    if (continuousWalkable(nav.polygon, nav.obstacles, x, z, nav.walkMargin) && cellReachable(nav, reached, x, z)) {
      return true;
    }
  }
  return false;
}

export function validateWorld(descriptor) {
  const reasons = [];
  const polygon = descriptor.boundary.polygon;
  const nodes = descriptor.nodes;
  const radii = polygon.map(vertexRadius);
  const minR = Math.min(...radii);
  const maxR = Math.max(...radii);
  if (polygon.length !== POLYGON_SAMPLES) reasons.push('polygon-count');
  if (minR < ISLAND_RADIUS_MIN - 0.05 || maxR > ISLAND_RADIUS_MAX + 0.05) reasons.push('radius-range');
  if (maxR < 32) reasons.push('scale');
  const counts = {
    tree: countOf(nodes, 'tree'),
    stone: countOf(nodes, 'stone'),
    copper: countOf(nodes, 'copper'),
    berry: countOf(nodes, 'berry'),
    carrot: countOf(nodes, 'carrot'),
    potato: countOf(nodes, 'potato'),
  };
  if (counts.tree < TREE_COUNT[0] || counts.tree > TREE_COUNT[1]) reasons.push('tree-count');
  if (counts.stone < STONE_COUNT[0] || counts.stone > STONE_COUNT[1]) reasons.push('stone-count');
  if (counts.copper < COPPER_COUNT[0] || counts.copper > COPPER_COUNT[1]) reasons.push('copper-count');
  if (counts.berry < BERRY_COUNT[0] || counts.berry > BERRY_COUNT[1]) reasons.push('berry-count');
  if (counts.carrot < CARROT_COUNT[0] || counts.carrot > CARROT_COUNT[1]) reasons.push('carrot-count');
  if (counts.potato < POTATO_COUNT[0] || counts.potato > POTATO_COUNT[1]) reasons.push('potato-count');
  if (!nodes.some(node => node.kind === 'tree' && node.variant === 'conifer')) reasons.push('missing-conifer');
  if (!nodes.some(node => node.kind === 'tree' && node.variant === 'broadleaf')) reasons.push('missing-broadleaf');
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) reasons.push('duplicate-id');
    ids.add(node.id);
    if (inMeadow(node.x, node.z, node.radius)) reasons.push('meadow-overlap');
    if (!isInside(polygon, node.x, node.z, 0.15)) reasons.push('node-outside');
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius - 0.02) reasons.push('overlap');
    }
  }
  if (reasons.length) return { ok: false, reasons: [...new Set(reasons)], counts };
  const nav = buildNav(descriptor);
  const reached = reachableSet(nav, descriptor.spawn);
  if (!nearestWalkableCell(nav, descriptor.spawn.x, descriptor.spawn.z)) reasons.push('spawn-blocked');
  let meadowTotal = 0;
  let meadowReached = 0;
  for (const key of nav.walkable) {
    const comma = key.indexOf(',');
    const world = cellToWorld(nav, Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
    if (Math.abs(world.x) <= MEADOW_EXTENT - 0.6 && Math.abs(world.z) <= MEADOW_EXTENT - 0.6) {
      meadowTotal += 1;
      if (reached.has(key)) meadowReached += 1;
    }
  }
  if (meadowTotal && meadowReached / meadowTotal < 0.9) reasons.push('meadow-unreachable');
  const near = (kind, limit) => nodes.filter(node => (
    node.kind === kind && Math.hypot(node.x, node.z) <= limit && approachReachable(nav, reached, node)
  ));
  if (near('tree', 14).length < 4) reasons.push('near-trees');
  if (near('stone', 14).length < 2) reasons.push('near-stone');
  if (near('carrot', 14).length < 1) reasons.push('near-carrot');
  if (near('potato', 14).length < 1) reasons.push('near-potato');
  if (nodes.filter(node => node.kind === 'carrot' && node.protected).length < 1) reasons.push('carrot-protect');
  if (nodes.filter(node => node.kind === 'potato' && node.protected).length < 1) reasons.push('potato-protect');
  if (nodes.filter(node => node.kind === 'copper' && approachReachable(nav, reached, node)).length < 4) {
    reasons.push('copper-access');
  }
  const protectedNear = (kind) => nodes.filter(node => (
    node.kind === kind && node.protected && Math.hypot(node.x, node.z) <= 14 && approachReachable(nav, reached, node)
  ));
  if (protectedNear('twig').length < 1) reasons.push('twig-supply');
  if (protectedNear('pebble').length < 1) reasons.push('pebble-supply');
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], counts };
}

function relocateKind(descriptor, rng, kind, needed, nearLimit = Infinity) {
  const nav = buildNav(descriptor);
  const reached = reachableSet(nav, descriptor.spawn);
  const nodes = descriptor.nodes;
  const ok = nodes.filter(node => (
    node.kind === kind
    && Math.hypot(node.x, node.z) <= nearLimit
    && approachReachable(nav, reached, node)
  ));
  if (ok.length >= needed) return false;
  const candidates = [];
  for (const key of reached) {
    const comma = key.indexOf(',');
    const world = cellToWorld(nav, Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
    if (inMeadow(world.x, world.z, 0.4)) continue;
    if (Math.hypot(world.x, world.z) > nearLimit) continue;
    candidates.push(world);
  }
  let changed = false;
  const movers = nodes.filter(item => item.kind === kind && !ok.includes(item));
  for (const node of movers) {
    for (let i = 0; i < 60; i++) {
      const candidate = candidates[Math.floor(rng() * candidates.length)];
      if (!candidate) break;
      const angle = rng() * TAU;
      const offset = node.radius + KEEPER_RADIUS + APPROACH_PADDING;
      const x = candidate.x + Math.cos(angle) * offset;
      const z = candidate.z + Math.sin(angle) * offset;
      if (Math.hypot(x, z) > nearLimit) continue;
      if (!fits(descriptor.boundary.polygon, x, z, node.radius, nodes, { ignoreId: node.id })) continue;
      node.x = x;
      node.z = z;
      descriptor.diagnostics.repairs.push(`relocated ${node.id}`);
      changed = true;
      break;
    }
  }
  return changed;
}

function applyRepair(descriptor, rng, issues) {
  const reasons = new Set(issues.reasons);
  const nodes = descriptor.nodes;
  if (reasons.has('meadow-unreachable') || reasons.has('copper-access') || reasons.has('near-trees')) {
    const optional = nodes.filter(node => node.kind === 'tree' && !node.protected && Math.hypot(node.x, node.z) < 16);
    optional.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    if (optional.length > 8 && countOf(nodes, 'tree') > TREE_COUNT[0] + 1) {
      const remove = optional[Math.min(optional.length - 1, 2 + Math.floor(rng() * 3))];
      const index = nodes.findIndex(node => node.id === remove.id);
      if (index >= 0) {
        nodes.splice(index, 1);
        descriptor.diagnostics.repairs.push(`removed ${remove.id}`);
      }
    }
  }
  if (reasons.has('copper-access')) relocateKind(descriptor, rng, 'copper', 4);
  if (reasons.has('near-trees')) {
    ensureNearby(rng, descriptor.boundary.polygon, nodes, nodes, 'tree', 4, TREE_RADIUS, {
      variantFn: value => (value() < 0.5 ? 'conifer' : 'broadleaf'),
    });
  }
  if (reasons.has('near-stone')) {
    ensureNearby(rng, descriptor.boundary.polygon, nodes, nodes, 'stone', 2, STONE_RADIUS, { protected: true });
    relocateKind(descriptor, rng, 'stone', 2, 14);
  }
  if (reasons.has('near-carrot') || reasons.has('carrot-protect')) {
    const existing = nodes.find(node => node.kind === 'carrot');
    if (existing) {
      existing.protected = true;
      relocateKind(descriptor, rng, 'carrot', 1, 14);
    } else {
      placeOneCrop(rng, descriptor.seedHash, descriptor.boundary.polygon, nodes, nodes, 'carrot', {
        near: true, nearLimit: 14, protected: true, requireApproach: true,
      });
    }
  }
  if (reasons.has('near-potato') || reasons.has('potato-protect')) {
    const existing = nodes.find(node => node.kind === 'potato');
    if (existing) {
      existing.protected = true;
      relocateKind(descriptor, rng, 'potato', 1, 14);
    } else {
      placeOneCrop(rng, descriptor.seedHash, descriptor.boundary.polygon, nodes, nodes, 'potato', {
        near: true, nearLimit: 14, protected: true, requireApproach: true,
      });
    }
  }
  if (reasons.has('tree-count') || reasons.has('stone-count') || reasons.has('copper-count') || reasons.has('berry-count') || reasons.has('carrot-count') || reasons.has('potato-count')) {
    ensureMinima(rng, descriptor.boundary.polygon, nodes, nodes, {
      trees: TREE_COUNT[0], stone: STONE_COUNT[0], copper: COPPER_COUNT[0], berry: BERRY_COUNT[0],
    });
    const hash = descriptor.seedHash;
    if (reasons.has('carrot-count') || reasons.has('potato-count')) {
      const plan = createCropPlan(hash);
      placeOptionalCrops(plan, descriptor.boundary.polygon, nodes, nodes);
    }
    descriptor.diagnostics.repairs.push('filled-counts');
  }
  if (reasons.has('twig-supply') || reasons.has('pebble-supply')) {
    placeSupplyPatches(rng, descriptor.boundary.polygon, nodes, descriptor.animals || []);
    descriptor.diagnostics.repairs.push('supply-patches');
  }
  protectSupply(nodes);
  descriptor.protectedCells = nodes.filter(node => node.protected).map(node => ({
    id: node.id, x: Math.round(node.x), z: Math.round(node.z),
  }));
  return descriptor;
}

function safeLayout(previous, rng) {
  const polygon = previous.boundary.polygon;
  const nodes = [];
  const solids = [];
  const plan = createCropPlan(previous.seedHash);
  placeProtectedCrops(plan, polygon, nodes, solids);
  placeGuaranteed(rng, polygon, nodes, solids);
  ensureMinima(rng, polygon, nodes, solids, {
    trees: TREE_COUNT[0], stone: STONE_COUNT[0], copper: COPPER_COUNT[0], berry: BERRY_COUNT[0],
  });
  ensureNearby(rng, polygon, nodes, solids, 'tree', 4, TREE_RADIUS, {
    variantFn: value => (value() < 0.5 ? 'conifer' : 'broadleaf'),
  });
  ensureNearby(rng, polygon, nodes, solids, 'stone', 2, STONE_RADIUS, { protected: true });
  placeOptionalCrops(plan, polygon, nodes, solids);
  placeSupplyPatches(rng, polygon, nodes, previous.animals || []);
  protectSupply(nodes);
  previous.diagnostics.repairs.push('safe-layout');
  return assemble({
    seed: previous.seed,
    hash: previous.seedHash,
    settings: previous.settings,
    polygon,
    shape: previous.boundary.shape,
    island: previous.island,
    nodes,
    grasses: previous.scenery.grasses,
    paths: previous.scenery.paths,
    fragments: previous.scenery.fragments,
    animals: previous.animals,
    diagnostics: previous.diagnostics,
  });
}

function repairWorld(descriptor, rng) {
  let current = descriptor;
  for (let step = 0; step < 18; step++) {
    const issues = validateWorld(current);
    if (issues.ok) return current;
    if (step === 0) current.diagnostics.repairs.push(`first:${issues.reasons.join(',')}`);
    current = applyRepair(current, rng, issues);
  }
  if (validateWorld(current).ok) return current;
  const fallback = safeLayout(current, rng);
  return fallback;
}

export function generateWorld(seedText, settings = {}) {
  const seed = normalizeSeed(seedText);
  if (!seed) throw new Error('generateWorld requires a nonempty seed');
  const hash = hashSeed(seed);
  const outlineRng = streamRng(hash, 'outline');
  const resourceRng = streamRng(hash, 'resources');
  const floraRng = streamRng(hash, 'flora');
  const animalRng = streamRng(hash, 'animals');
  const cosmeticRng = streamRng(hash, 'cosmetics');
  const repairRng = streamRng(hash, 'repair');

  const built = buildPolygon(outlineRng, hash);
  const polygon = built.polygon;
  const shape = built.shape;
  const extent = extentOf(polygon);
  const island = buildIsland(polygon, outlineRng, cosmeticRng);
  const nodes = [];
  const solids = [];
  const diagnostics = { repairs: [] };

  const plan = {
    trees: TREE_COUNT[0] + Math.floor(floraRng() * (TREE_COUNT[1] - TREE_COUNT[0] + 1)),
    stone: STONE_COUNT[0] + Math.floor(resourceRng() * (STONE_COUNT[1] - STONE_COUNT[0] + 1)),
    copper: COPPER_COUNT[0] + Math.floor(resourceRng() * (COPPER_COUNT[1] - COPPER_COUNT[0] + 1)),
    berry: BERRY_COUNT[0] + Math.floor(floraRng() * (BERRY_COUNT[1] - BERRY_COUNT[0] + 1)),
  };

  const cropPlan = createCropPlan(hash);
  placeProtectedCrops(cropPlan, polygon, nodes, solids);
  placeGuaranteed(resourceRng, polygon, nodes, solids);
  const woodCenters = clusterCenters(floraRng, polygon, 4, extent * 0.42, extent * 0.82);
  const rockCenters = clusterCenters(resourceRng, polygon, 3, extent * 0.38, extent * 0.8);
  const gardenCenters = [
    ...clusterCenters(floraRng, polygon, 1, MEADOW_EXTENT + 2.4, 13),
    ...clusterCenters(floraRng, polygon, 2, extent * 0.4, extent * 0.72),
  ];
  placeAround(floraRng, polygon, nodes, solids, {
    kind: 'tree', target: plan.trees, radius: TREE_RADIUS, centers: woodCenters, spread: 5.4,
    inner: MEADOW_EXTENT + 2.5, outer: extent * 0.88, variantFn: rng => (rng() < 0.52 ? 'conifer' : 'broadleaf'),
  });
  placeAround(resourceRng, polygon, nodes, solids, {
    kind: 'stone', target: plan.stone, radius: STONE_RADIUS, centers: rockCenters, spread: 3.6,
    inner: MEADOW_EXTENT + 3, outer: extent * 0.86, protected: true,
  });
  placeAround(resourceRng, polygon, nodes, solids, {
    kind: 'copper', target: plan.copper, radius: COPPER_RADIUS, centers: rockCenters, spread: 3.8,
    inner: MEADOW_EXTENT + 4, outer: extent * 0.86, protected: true,
  });
  placeAround(floraRng, polygon, nodes, solids, {
    kind: 'berry', target: plan.berry, radius: BERRY_RADIUS, centers: gardenCenters, spread: 3.6,
    inner: MEADOW_EXTENT + 2.8, outer: extent * 0.8,
  });
  placeOptionalCrops(cropPlan, polygon, nodes, solids);
  ensureMinima(resourceRng, polygon, nodes, solids, plan);
  ensureNearby(resourceRng, polygon, nodes, solids, 'tree', 4, TREE_RADIUS, {
    variantFn: rng => (rng() < 0.52 ? 'conifer' : 'broadleaf'),
  });
  ensureNearby(resourceRng, polygon, nodes, solids, 'stone', 2, STONE_RADIUS, { protected: true });

  const descriptor = assemble({
    seed,
    hash,
    settings,
    polygon,
    shape,
    island,
    nodes,
    grasses: placeGrasses(floraRng, polygon),
    paths: placePaths(cosmeticRng, polygon),
    fragments: placeFragments(cosmeticRng, extent),
    animals: placeAnimals(animalRng, polygon, solids),
    diagnostics,
  });
  placeSupplyPatches(streamRng(hash, 'patches'), polygon, nodes, descriptor.animals);
  protectSupply(nodes);
  descriptor.protectedCells = nodes.filter(node => node.protected).map(node => ({
    id: node.id, x: Math.round(node.x), z: Math.round(node.z),
  }));
  return repairWorld(descriptor, repairRng);
}
