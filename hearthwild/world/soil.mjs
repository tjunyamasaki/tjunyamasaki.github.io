import { footprintBounds } from '../data/buildings.mjs';
import {
  SOIL_CLIFF_MARGIN, SOIL_OUTLINE_RADIUS_MAX, SOIL_OUTLINE_RADIUS_MIN, SOIL_OUTLINE_VERTICES, SOIL_PATCH_CAP,
  SOIL_PATCH_SPACING, SOIL_SPAWN_RADIUS,
} from '../data/tuning.mjs';
import { distanceToEdges, isInside, pointInPolygon } from './boundary.mjs';
import { createRng, hashSeed, mixStream } from './random.mjs';

export const SOIL_SHAPE_VERSION = 1;
export const LEGACY_SOIL_PREFIX = 'soil-legacy-';

const TAU = Math.PI * 2;
const ANGLE_JITTER = 0.35;
const CELL_HALF = 0.5;

export function isLegacySoilPatchId(id) {
  return String(id || '').startsWith(LEGACY_SOIL_PREFIX);
}

export function isSoilPatchId(id) {
  const value = String(id || '');
  if (soilPatchIndex(value)) return true;
  return isLegacySoilPatchId(value) && value.length > LEGACY_SOIL_PREFIX.length;
}

export function legacySoilPatchId(structureId) {
  return `${LEGACY_SOIL_PREFIX}${String(structureId || '')}`;
}

export function newSoilPatchId(index) {
  return `soil-${index}`;
}

export function linkedSoilIds(soilId) {
  const id = String(soilId || '');
  if (!id) return [];
  if (id.startsWith(LEGACY_SOIL_PREFIX)) {
    const original = id.slice(LEGACY_SOIL_PREFIX.length);
    return original ? [id, original] : [id];
  }
  return [id, legacySoilPatchId(id)];
}

export function cropOnLinkedSoil(crops, soilId) {
  const ids = new Set(linkedSoilIds(soilId));
  if (!ids.size) return null;
  return (crops || []).find(crop => ids.has(crop.soilId)) || null;
}

export function findSoilPatch(patches, soilId) {
  const ids = new Set(linkedSoilIds(soilId));
  return (patches || []).find(patch => ids.has(patch.id)) || null;
}

export function canonicalSoilId(patches, soilId) {
  return findSoilPatch(patches, soilId)?.id || String(soilId || '');
}

export function quantizeSoilCoord(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function soilPatchShapeSeed(worldSeed, structureId) {
  return mixStream(hashSeed(worldSeed), String(structureId || ''));
}

export function copySoilPatch(patch) {
  return {
    id: String(patch?.id || ''),
    x: Number(patch?.x),
    z: Number(patch?.z),
    shapeSeed: Number(patch?.shapeSeed) >>> 0,
    shapeVersion: Number.isInteger(patch?.shapeVersion) ? patch.shapeVersion : SOIL_SHAPE_VERSION,
  };
}

export function soilPatchOutline(patch) {
  if (!patch) return [];
  const version = Number.isInteger(patch.shapeVersion) ? patch.shapeVersion : SOIL_SHAPE_VERSION;
  if (version !== SOIL_SHAPE_VERSION) return [];
  const cx = Number(patch.x);
  const cz = Number(patch.z);
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return [];
  const jitter = !isLegacySoilPatchId(patch.id);
  const rng = createRng(mixStream(Number(patch.shapeSeed) >>> 0, `soil-outline-v${SOIL_SHAPE_VERSION}`));
  const step = TAU / SOIL_OUTLINE_VERTICES;
  const span = SOIL_OUTLINE_RADIUS_MAX - SOIL_OUTLINE_RADIUS_MIN;
  const vertices = [];
  for (let i = 0; i < SOIL_OUTLINE_VERTICES; i++) {
    const base = i * step;
    const angle = jitter ? base + (rng() * 2 - 1) * step * ANGLE_JITTER : base;
    const radius = SOIL_OUTLINE_RADIUS_MIN + rng() * span;
    vertices.push({
      x: cx + Math.cos(angle) * radius,
      z: cz + Math.sin(angle) * radius,
    });
  }
  return vertices;
}

export function soilOutlineLocal(patch) {
  const cx = Number(patch?.x);
  const cz = Number(patch?.z);
  return soilPatchOutline(patch).map(vertex => ({ x: vertex.x - cx, z: vertex.z - cz }));
}

export function tillPreviewPatch(x, z, worldSeed, nextSoilId = 1) {
  const qx = quantizeSoilCoord(x);
  const qz = quantizeSoilCoord(z);
  const id = newSoilPatchId(nextSoilId);
  if (!Number.isFinite(qx) || !Number.isFinite(qz) || !soilPatchIndex(id)) return null;
  return {
    id,
    x: qx,
    z: qz,
    shapeSeed: soilPatchShapeSeed(worldSeed, id),
    shapeVersion: SOIL_SHAPE_VERSION,
  };
}

export function tillPreviewOutline(x, z, worldSeed, nextSoilId = 1) {
  const patch = tillPreviewPatch(x, z, worldSeed, nextSoilId);
  return patch ? soilPatchOutline(patch) : [];
}

export function outlineRadii(outline, patch) {
  const cx = Number(patch?.x);
  const cz = Number(patch?.z);
  return (outline || []).map(vertex => Math.hypot(vertex.x - cx, vertex.z - cz));
}

export function outlineSignedArea(outline) {
  let area = 0;
  for (let i = 0; i < (outline || []).length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

function orient(ax, az, bx, bz, cx, cz) {
  const value = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  if (value > 1e-12) return 1;
  if (value < -1e-12) return -1;
  return 0;
}

function segmentsCrossProper(a, b, c, d) {
  const o1 = orient(a.x, a.z, b.x, b.z, c.x, c.z);
  const o2 = orient(a.x, a.z, b.x, b.z, d.x, d.z);
  const o3 = orient(c.x, c.z, d.x, d.z, a.x, a.z);
  const o4 = orient(c.x, c.z, d.x, d.z, b.x, b.z);
  return o1 && o2 && o3 && o4 && o1 !== o2 && o3 !== o4;
}

export function outlineIsSimple(outline) {
  const n = outline?.length || 0;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const c = outline[j];
      const d = outline[(j + 1) % n];
      if (segmentsCrossProper(a, b, c, d)) return false;
    }
  }
  return true;
}

export function outlineAabb(outline) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const vertex of outline || []) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function aabbsOverlap(a, b) {
  return a.minX < b.maxX - 1e-9 && a.maxX > b.minX + 1e-9 && a.minZ < b.maxZ - 1e-9 && a.maxZ > b.minZ + 1e-9;
}

function pointStrictlyInPolygon(outline, x, z) {
  if (!pointInPolygon(outline, x, z)) return false;
  return distanceToEdges(outline, x, z) > 1e-8;
}

export function polygonsOverlap(a, b) {
  if (!a?.length || !b?.length) return false;
  if (!aabbsOverlap(outlineAabb(a), outlineAabb(b))) return false;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsCrossProper(a0, a1, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  for (const vertex of a) {
    if (pointStrictlyInPolygon(b, vertex.x, vertex.z)) return true;
  }
  for (const vertex of b) {
    if (pointStrictlyInPolygon(a, vertex.x, vertex.z)) return true;
  }
  return false;
}

export function distanceToOutline(outline, x, z) {
  if (!outline?.length || !Number.isFinite(x) || !Number.isFinite(z)) return Infinity;
  if (pointInPolygon(outline, x, z)) return 0;
  return distanceToEdges(outline, x, z);
}

function leftoverSoilCoversRoot(item, x, z) {
  if (item?.kind !== 'soil') return false;
  const gx = Number.isFinite(item.gx) ? item.gx : Number(item.x);
  const gz = Number.isFinite(item.gz) ? item.gz : Number(item.z);
  const bounds = footprintBounds('soil', gx, gz, item.rotation || 0);
  return Number.isFinite(bounds.minX)
    && x >= bounds.minX - 1e-9 && x <= bounds.maxX + 1e-9
    && z >= bounds.minZ - 1e-9 && z <= bounds.maxZ + 1e-9;
}

export function earthHidesGrassRoot(x, z, earth) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  for (const item of earth || []) {
    if (!item) continue;
    if (item.kind && item.kind !== 'soil') continue;
    if (item.outline?.length) {
      if (pointInPolygon(item.outline, x, z)) return true;
      continue;
    }
    const outline = soilPatchOutline(item);
    if (outline.length) {
      if (pointInPolygon(outline, x, z)) return true;
      continue;
    }
    if (leftoverSoilCoversRoot(item, x, z)) return true;
  }
  return false;
}

export function decorativeGrassCover(grasses, earth) {
  return (grasses || []).map(item => ({
    x: Number(item?.x),
    z: Number(item?.z),
    hidden: earthHidesGrassRoot(Number(item?.x), Number(item?.z), earth),
  }));
}

export function polygonIntersectsCircle(outline, x, z, radius) {
  if (!outline?.length || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius)) return false;
  if (pointInPolygon(outline, x, z)) return true;
  return distanceToEdges(outline, x, z) <= radius + 1e-9;
}

export function outlineHitsSpawn(outline, spawn) {
  const origin = spawn || { x: 0, z: 0 };
  return polygonIntersectsCircle(outline, Number(origin.x) || 0, Number(origin.z) || 0, SOIL_SPAWN_RADIUS);
}

export function outlineFitsIsland(outline, polygon, margin = SOIL_CLIFF_MARGIN) {
  if (!outline?.length || !polygon?.length) return false;
  for (const vertex of outline) {
    if (!isInside(polygon, vertex.x, vertex.z, margin)) return false;
  }
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    for (let j = 0; j < polygon.length; j++) {
      if (segmentsCrossProper(a, b, polygon[j], polygon[(j + 1) % polygon.length])) return false;
    }
  }
  return true;
}

function pointStrictlyInAabb(point, bounds) {
  return point.x > bounds.minX + 1e-9
    && point.x < bounds.maxX - 1e-9
    && point.z > bounds.minZ + 1e-9
    && point.z < bounds.maxZ - 1e-9;
}

export function earthHitsBounds(patches, bounds) {
  if (!bounds || !Number.isFinite(bounds.minX)) return null;
  for (const patch of patches || []) {
    if (!patch) continue;
    if (outlineHitsAabb(soilPatchOutline(patch), bounds)) return patch;
  }
  return null;
}

export function outlineHitsAabb(outline, bounds) {
  if (!outline?.length || !bounds || !Number.isFinite(bounds.minX)) return false;
  if (!aabbsOverlap(outlineAabb(outline), bounds)) return false;
  const corners = [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ },
  ];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (pointStrictlyInAabb(a, bounds)) return true;
    for (let j = 0; j < 4; j++) {
      if (segmentsCrossProper(a, b, corners[j], corners[(j + 1) % 4])) return true;
    }
  }
  for (const corner of corners) {
    if (pointStrictlyInPolygon(outline, corner.x, corner.z)) return true;
  }
  return false;
}

function resourceReservesSoil(resource) {
  return Boolean(resource) && resource.phase !== 'removed';
}

export function soilWorldBlocked(outline, context = {}) {
  for (const structure of context.structures || []) {
    if (!structure) continue;
    const bounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
    if (outlineHitsAabb(outline, bounds)) return true;
  }
  for (const resource of context.resources || []) {
    if (!resourceReservesSoil(resource)) continue;
    const radius = Number(resource.radius);
    if (!Number.isFinite(radius)) continue;
    if (polygonIntersectsCircle(outline, Number(resource.x), Number(resource.z), radius)) return true;
  }
  return false;
}

export function resolveCropSoilOwner(crop, patches, soilStructureIds) {
  if (!crop || typeof crop.soilId !== 'string' || !crop.soilId) return null;
  const patch = findSoilPatch(patches, crop.soilId);
  if (patch) return patch.id;
  if (soilStructureIds && soilStructureIds.has(crop.soilId)) return crop.soilId;
  return null;
}

export function outlineFitsLegacyCell(outline, gx, gz) {
  const minX = gx - CELL_HALF;
  const maxX = gx + CELL_HALF;
  const minZ = gz - CELL_HALF;
  const maxZ = gz + CELL_HALF;
  for (const vertex of outline || []) {
    if (vertex.x < minX - 1e-9 || vertex.x > maxX + 1e-9) return false;
    if (vertex.z < minZ - 1e-9 || vertex.z > maxZ + 1e-9) return false;
  }
  return Boolean(outline?.length);
}

function assertFiniteOutline(outline, patch) {
  if (!outline || outline.length !== SOIL_OUTLINE_VERTICES) throw new Error('bad-soil');
  const radii = outlineRadii(outline, patch);
  for (let i = 0; i < outline.length; i++) {
    const vertex = outline[i];
    if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.z)) throw new Error('bad-soil');
    const radius = radii[i];
    if (!Number.isFinite(radius) || radius < SOIL_OUTLINE_RADIUS_MIN - 1e-9 || radius > SOIL_OUTLINE_RADIUS_MAX + 1e-9) {
      throw new Error('bad-soil');
    }
  }
  if (outlineSignedArea(outline) <= 0) throw new Error('bad-soil');
  if (!outlineIsSimple(outline)) throw new Error('bad-soil');
}

export function assertSoilPatchOutline(patch) {
  if (!patch || patch.shapeVersion !== SOIL_SHAPE_VERSION) throw new Error('bad-soil');
  const outline = soilPatchOutline(patch);
  assertFiniteOutline(outline, patch);
  if (isLegacySoilPatchId(patch.id) && !outlineFitsLegacyCell(outline, patch.x, patch.z)) {
    throw new Error('bad-soil');
  }
  return outline;
}

export function patchCentersTooClose(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.z) - Number(b.z)) < SOIL_PATCH_SPACING - 1e-9;
}

export function soilPatchCount(patches) {
  return (patches || []).length;
}

export function soilPatchCapReached(patches) {
  return soilPatchCount(patches) >= SOIL_PATCH_CAP;
}

export function validateNewSoilPatch(spec, patches, spawn, context = {}) {
  if (soilPatchCapReached(patches)) return { ok: false, reason: 'soil-cap' };
  const id = String(spec?.id || '');
  if (!id || isLegacySoilPatchId(id) || !soilPatchIndex(id)) return { ok: false, reason: 'bad-soil-id' };
  const patch = {
    id,
    x: quantizeSoilCoord(spec.x),
    z: quantizeSoilCoord(spec.z),
    shapeSeed: Number(spec.shapeSeed) >>> 0,
    shapeVersion: SOIL_SHAPE_VERSION,
  };
  if (!Number.isFinite(patch.x) || !Number.isFinite(patch.z)) return { ok: false, reason: 'bad-soil' };
  const outline = soilPatchOutline(patch);
  try {
    assertFiniteOutline(outline, patch);
  } catch (error) {
    return { ok: false, reason: error.message || 'bad-soil' };
  }
  if (outlineHitsSpawn(outline, spawn)) return { ok: false, reason: 'spawn' };
  if (context.boundary && !outlineFitsIsland(outline, context.boundary, SOIL_CLIFF_MARGIN)) {
    return { ok: false, reason: 'off-island' };
  }
  if (soilWorldBlocked(outline, context)) return { ok: false, reason: 'occupied' };
  for (const other of patches || []) {
    if (!other || other.id === patch.id) continue;
    if (patchCentersTooClose(patch, other)) return { ok: false, reason: 'spacing' };
    if (polygonsOverlap(outline, soilPatchOutline(other))) return { ok: false, reason: 'overlap' };
  }
  return { ok: true, patch, outline };
}

export function assertSoilPatches(patches, spawn, context = {}) {
  const list = patches || [];
  const outlines = [];
  for (const patch of list) {
    if (!isSoilPatchId(patch?.id)) throw new Error('bad-soil');
    const outline = assertSoilPatchOutline(patch);
    const legacy = isLegacySoilPatchId(patch.id);
    if (outlineHitsSpawn(outline, spawn) && !legacy) throw new Error('bad-soil');
    if (!legacy) {
      if (context.boundary && !outlineFitsIsland(outline, context.boundary, SOIL_CLIFF_MARGIN)) {
        throw new Error('bad-soil');
      }
      if (soilWorldBlocked(outline, context)) throw new Error('bad-soil');
    }
    outlines.push({ patch, outline });
  }
  for (let i = 0; i < outlines.length; i++) {
    for (let j = i + 1; j < outlines.length; j++) {
      if (polygonsOverlap(outlines[i].outline, outlines[j].outline)) throw new Error('bad-soil');
    }
  }
  return outlines;
}

export function soilPatchAsStructure(patch) {
  if (!patch) return null;
  const outline = soilPatchOutline(patch);
  return {
    id: patch.id,
    kind: 'soil',
    gx: Math.round(Number(patch.x)),
    gz: Math.round(Number(patch.z)),
    rotation: 0,
    paidCost: {},
    x: Number(patch.x),
    z: Number(patch.z),
    shapeSeed: Number(patch.shapeSeed) >>> 0,
    shapeVersion: Number.isInteger(patch.shapeVersion) ? patch.shapeVersion : SOIL_SHAPE_VERSION,
    outline,
  };
}

export function occupancyPieces(state, ignoreId = null) {
  const pieces = [
    ...(state?.structures || []),
    ...(state?.soilPatches || []).map(soilPatchAsStructure).filter(Boolean),
  ];
  return ignoreId ? pieces.filter(item => item.id !== ignoreId) : pieces;
}

export function soilPatchIndex(id) {
  const match = /^soil-(\d+)$/.exec(String(id || ''));
  return match ? Number(match[1]) : 0;
}

export function nextSoilIdValue(patches, requested = 1) {
  const max = (patches || []).reduce((high, item) => Math.max(high, soilPatchIndex(item.id)), 0);
  const start = Number.isInteger(requested) && requested > 0 ? requested : 1;
  return Math.max(start, max + 1);
}

export function assertSoilAllocator(patches, nextSoilId) {
  if (!Number.isInteger(nextSoilId) || nextSoilId < 1) throw new Error('bad-soil-id');
  if (nextSoilId < nextSoilIdValue(patches, 1)) throw new Error('bad-soil-id');
}

function patchById(patches, id) {
  return (patches || []).find(patch => patch.id === id) || null;
}

export function convertedSoilIdMap(structures, patches) {
  const idMap = new Map();
  for (const structure of structures || []) {
    if (!structure || structure.kind !== 'soil' || typeof structure.id !== 'string' || !structure.id) continue;
    const patchId = legacySoilPatchId(structure.id);
    if (!patchById(patches, patchId)) continue;
    idMap.set(structure.id, patchId);
  }
  return idMap;
}

export function assertConvertedSoilGeometry(structures, patches, worldSeed, idMap) {
  for (const [oldId, patchId] of idMap) {
    const structure = (structures || []).find(item => item.id === oldId);
    const patch = patchById(patches, patchId);
    if (!structure || !patch) throw new Error('bad-soil');
    if (!Number.isFinite(patch.x) || !Number.isFinite(patch.z)) throw new Error('bad-soil');
    if (patch.x !== quantizeSoilCoord(structure.gx) || patch.z !== quantizeSoilCoord(structure.gz)) {
      throw new Error('bad-soil');
    }
    if (patch.shapeVersion !== SOIL_SHAPE_VERSION) throw new Error('bad-soil');
    if (!Number.isFinite(patch.shapeSeed)) throw new Error('bad-soil');
    if ((Number(patch.shapeSeed) >>> 0) !== soilPatchShapeSeed(worldSeed, oldId)) throw new Error('bad-soil');
    const outline = assertSoilPatchOutline(patch);
    if (!outlineFitsLegacyCell(outline, structure.gx, structure.gz)) throw new Error('bad-soil');
  }
}

export function assertConvertedSoilLinks(patches, crops, remainingSoilIds, idMap) {
  const remaining = new Set(remainingSoilIds || []);
  for (const crop of crops || []) {
    if (!crop) throw new Error('bad-crop');
    if (idMap.has(crop.soilId)) throw new Error('orphan-crop');
    if (findSoilPatch(patches, crop.soilId)) continue;
    if (remaining.has(crop.soilId)) continue;
    throw new Error('orphan-crop');
  }
}

export function withoutConvertedSoilStructures(structures, idMap) {
  return (structures || []).filter(item => !(item && item.kind === 'soil' && idMap.has(item.id)));
}

export function detachConvertedSoil(gameplay, worldSeed) {
  if (!gameplay || typeof gameplay !== 'object') return gameplay;
  if (!Array.isArray(gameplay.structures) || !Array.isArray(gameplay.soilPatches)) return gameplay;
  const idMap = convertedSoilIdMap(gameplay.structures, gameplay.soilPatches);
  if (idMap.size) {
    if (!Array.isArray(gameplay.crops)) throw new Error('missing-crops');
    const crops = remapCropSoilIds(gameplay.crops, idMap);
    const remaining = withoutConvertedSoilStructures(gameplay.structures, idMap)
      .filter(item => item.kind === 'soil')
      .map(item => item.id);
    assertConvertedSoilGeometry(gameplay.structures, gameplay.soilPatches, worldSeed, idMap);
    assertConvertedSoilLinks(gameplay.soilPatches, crops, remaining, idMap);
    gameplay.crops = crops;
    gameplay.structures = withoutConvertedSoilStructures(gameplay.structures, idMap);
  }
  return gameplay;
}

export function soilPatchesFromStructures(structures, worldSeed, existing = []) {
  const patches = existing.map(copySoilPatch);
  const seen = new Set(patches.map(patch => patch.id));
  const idMap = new Map();
  for (const structure of structures || []) {
    if (!structure || structure.kind !== 'soil' || typeof structure.id !== 'string' || !structure.id) continue;
    const patchId = legacySoilPatchId(structure.id);
    idMap.set(structure.id, patchId);
    if (seen.has(patchId)) continue;
    patches.push(copySoilPatch({
      id: patchId,
      x: quantizeSoilCoord(structure.gx),
      z: quantizeSoilCoord(structure.gz),
      shapeSeed: soilPatchShapeSeed(worldSeed, structure.id),
      shapeVersion: SOIL_SHAPE_VERSION,
    }));
    seen.add(patchId);
  }
  return { patches, idMap };
}

export function remapCropSoilIds(crops, idMap) {
  return (crops || []).map(crop => {
    const mapped = idMap.get(crop.soilId);
    if (!mapped) return crop;
    return { ...crop, soilId: mapped };
  });
}
