import { ITEM_META } from './items.mjs';
import { BUILD_CELL, STRUCTURE_CAP } from './tuning.mjs';

export { BUILD_CELL, STRUCTURE_CAP };

export const CATALOG = Object.freeze(['floor', 'path', 'workbench', 'furnace']);

export const BUILDINGS = Object.freeze({
  floor: Object.freeze({
    id: 'floor',
    label: 'Floor',
    layer: 'ground',
    size: Object.freeze({ w: 1, h: 1 }),
    cost: Object.freeze({ wood: 2 }),
    solid: false,
    traversable: true,
  }),
  path: Object.freeze({
    id: 'path',
    label: 'Path',
    layer: 'ground',
    size: Object.freeze({ w: 1, h: 1 }),
    cost: Object.freeze({ stone: 1 }),
    solid: false,
    traversable: true,
  }),
  workbench: Object.freeze({
    id: 'workbench',
    label: 'Workbench',
    layer: 'solid',
    size: Object.freeze({ w: 2, h: 1 }),
    cost: Object.freeze({ wood: 8, stone: 4 }),
    solid: true,
    traversable: false,
    station: true,
  }),
  furnace: Object.freeze({
    id: 'furnace',
    label: 'Furnace',
    layer: 'solid',
    size: Object.freeze({ w: 2, h: 1 }),
    cost: Object.freeze({ stone: 12, wood: 4 }),
    solid: true,
    traversable: false,
    station: true,
    requiresWorkbench: true,
  }),
});

export const LEGACY_BUILDINGS = Object.freeze({
  soil: Object.freeze({
    id: 'soil',
    label: 'Soil',
    layer: 'ground',
    size: Object.freeze({ w: 1, h: 1 }),
    cost: Object.freeze({}),
    solid: false,
    traversable: true,
  }),
});

export function buildingDef(kind) {
  return BUILDINGS[kind] || LEGACY_BUILDINGS[kind] || null;
}

export function normalizeRotation(rotation) {
  const value = Math.round(Number(rotation)) || 0;
  return ((value % 4) + 4) % 4;
}

export function snapBuildCell(x, z) {
  return {
    gx: Math.round(Number(x) / BUILD_CELL) * BUILD_CELL,
    gz: Math.round(Number(z) / BUILD_CELL) * BUILD_CELL,
  };
}

export function cellKey(gx, gz) {
  return `${gx},${gz}`;
}

function rotateOffset(dx, dz, rotation) {
  const r = normalizeRotation(rotation);
  if (r === 0) return { gx: dx, gz: dz };
  if (r === 1) return { gx: -dz, gz: dx };
  if (r === 2) return { gx: -dx, gz: -dz };
  return { gx: dz, gz: -dx };
}

export function footprintCells(kind, gx, gz, rotation) {
  const def = buildingDef(kind);
  if (!def) return [];
  const cells = [];
  for (let dx = 0; dx < def.size.w; dx++) {
    for (let dz = 0; dz < def.size.h; dz++) {
      const offset = rotateOffset(dx, dz, rotation);
      cells.push({ gx: gx + offset.gx, gz: gz + offset.gz });
    }
  }
  return cells;
}

export function footprintBounds(kind, gx, gz, rotation) {
  const cells = footprintCells(kind, gx, gz, rotation);
  const half = BUILD_CELL / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.gx - half);
    maxX = Math.max(maxX, cell.gx + half);
    minZ = Math.min(minZ, cell.gz - half);
    maxZ = Math.max(maxZ, cell.gz + half);
  }
  return { minX, maxX, minZ, maxZ };
}

export function footprintCenter(kind, gx, gz, rotation) {
  const bounds = footprintBounds(kind, gx, gz, rotation);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}

export function circleHitsAabb(x, z, radius, bounds) {
  const closestX = Math.min(bounds.maxX, Math.max(bounds.minX, x));
  const closestZ = Math.min(bounds.maxZ, Math.max(bounds.minZ, z));
  return Math.hypot(x - closestX, z - closestZ) < radius - 1e-6;
}

export function cloneCost(cost) {
  const paid = {};
  for (const [id, raw] of Object.entries(cost || {})) {
    const amount = Math.floor(Number(raw));
    if (!ITEM_META[id] || amount <= 0) continue;
    paid[id] = amount;
  }
  return paid;
}

export function formatCost(cost) {
  const parts = Object.entries(cost || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${count} ${ITEM_META[id]?.short || id}`);
  return parts.join(' + ') || 'free';
}

export function aabbDistance(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(dx, dz);
}

export function distanceToAabb(x, z, bounds) {
  const closestX = Math.min(bounds.maxX, Math.max(bounds.minX, x));
  const closestZ = Math.min(bounds.maxZ, Math.max(bounds.minZ, z));
  return Math.hypot(x - closestX, z - closestZ);
}

export function copyQueue(queue) {
  return (queue || []).map(batch => ({
    id: String(batch.id || ''),
    recipeId: String(batch.recipeId || ''),
    remaining: Number(batch.remaining),
  }));
}

export function emptyFurnaceState() {
  return { queue: [], output: {}, nextBatchId: 1 };
}

export function copyFurnaceState(structure) {
  const next = Number(structure?.nextBatchId);
  const queue = copyQueue(structure?.queue);
  let nextBatchId = Number.isInteger(next) && next > 0 ? next : 1;
  for (const batch of queue) {
    const match = /^b-(\d+)$/.exec(batch.id);
    if (match) nextBatchId = Math.max(nextBatchId, Number(match[1]) + 1);
  }
  return {
    queue,
    output: cloneCost(structure?.output),
    nextBatchId,
  };
}

export function copyStructure(structure) {
  const copy = {
    id: String(structure.id || ''),
    kind: structure.kind,
    gx: Math.round(Number(structure.gx)),
    gz: Math.round(Number(structure.gz)),
    rotation: normalizeRotation(structure.rotation),
    paidCost: cloneCost(structure.paidCost),
  };
  if (copy.kind === 'furnace') {
    const furnace = copyFurnaceState(structure);
    copy.queue = furnace.queue;
    copy.output = furnace.output;
    copy.nextBatchId = furnace.nextBatchId;
  }
  return copy;
}

export function furnaceBusy(structure) {
  if (!structure || structure.kind !== 'furnace') return false;
  if ((structure.queue || []).length > 0) return true;
  return Object.values(structure.output || {}).some(value => value > 0);
}

export function occupancyMaps(structures, ignoreId = null) {
  const ground = new Map();
  const solid = new Map();
  for (const structure of structures || []) {
    if (structure.id === ignoreId) continue;
    const def = buildingDef(structure.kind);
    if (!def) continue;
    const map = def.layer === 'solid' ? solid : ground;
    for (const cell of footprintCells(structure.kind, structure.gx, structure.gz, structure.rotation)) {
      map.set(cellKey(cell.gx, cell.gz), structure);
    }
  }
  return { ground, solid };
}

export function structureObstacles(structures) {
  const list = [];
  for (const structure of structures || []) {
    const def = buildingDef(structure.kind);
    if (!def?.solid) continue;
    const bounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
    const center = footprintCenter(structure.kind, structure.gx, structure.gz, structure.rotation);
    const halfX = (bounds.maxX - bounds.minX) / 2;
    const halfZ = (bounds.maxZ - bounds.minZ) / 2;
    list.push({
      id: structure.id,
      kind: structure.kind,
      shape: 'aabb',
      x: center.x,
      z: center.z,
      minX: bounds.minX,
      maxX: bounds.maxX,
      minZ: bounds.minZ,
      maxZ: bounds.maxZ,
      radius: Math.hypot(halfX, halfZ),
    });
  }
  return list;
}

export function structuresOverlapCircle(structures, x, z, radius, ignoreId = null) {
  for (const structure of structures || []) {
    if (structure.id === ignoreId) continue;
    const bounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
    if (!bounds || !Number.isFinite(bounds.minX)) continue;
    if (circleHitsAabb(x, z, radius, bounds)) return true;
  }
  return false;
}

export function structureIndex(id) {
  const match = /^s-(\d+)$/.exec(String(id || ''));
  return match ? Number(match[1]) : 0;
}

export function nextStructureIdValue(structures, requested = 1) {
  const max = (structures || []).reduce((high, item) => Math.max(high, structureIndex(item.id)), 0);
  const start = Number.isInteger(requested) && requested > 0 ? requested : 1;
  return Math.max(start, max + 1);
}
