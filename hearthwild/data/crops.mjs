import { formatActiveTime } from './items.mjs';
import {
  CARROT_SECONDS, CROP_CAP, CROP_SEED_PROGRESS, PLAYER_TREE_CAP, POTATO_SECONDS, SAPLING_GROW_SECONDS,
} from './tuning.mjs';
import { cropOnLinkedSoil } from '../world/soil.mjs';

export { CROP_CAP, PLAYER_TREE_CAP, SAPLING_GROW_SECONDS };

export const CROP_SPECIES = Object.freeze(['carrot', 'potato']);
export const CROP_STAGES = Object.freeze(['seed', 'little', 'mature']);
export const TREE_GROW_PHASES = Object.freeze(['seedling', 'young']);
export const TREE_PHASES = Object.freeze(['seedling', 'young', 'ready', 'stump', 'removed']);
export const RESOURCE_PHASES = Object.freeze(['ready', 'depleted', 'stump', 'removed', 'seedling', 'young']);
export const WILD_CROP_KINDS = Object.freeze(['carrot', 'potato']);

export const CROPS = Object.freeze({
  carrot: Object.freeze({
    id: 'carrot',
    label: 'Carrot',
    seed: 'carrotSeed',
    duration: CARROT_SECONDS,
    yields: Object.freeze({ carrot: 2, carrotSeed: 1 }),
  }),
  potato: Object.freeze({
    id: 'potato',
    label: 'Potato',
    seed: 'potatoSeed',
    duration: POTATO_SECONDS,
    yields: Object.freeze({ potato: 2, potatoSeed: 1 }),
  }),
});

export const LEGACY_CROP_SPECIES = Object.freeze({
  turnip: Object.freeze({ species: 'carrot', oldDuration: 90, newDuration: CARROT_SECONDS }),
  moonflower: Object.freeze({ species: 'potato', oldDuration: 150, newDuration: POTATO_SECONDS }),
});

export function isWildCrop(kind) {
  return kind === 'carrot' || kind === 'potato';
}

export function cropDef(species) {
  return CROPS[species] || null;
}

export function copyCrop(crop) {
  return {
    id: String(crop?.id || ''),
    soilId: String(crop?.soilId || ''),
    species: crop?.species,
    remaining: Number(crop.remaining),
  };
}

export function cropOnSoil(crops, soilId) {
  return cropOnLinkedSoil(crops, soilId);
}

export function cropIndex(id) {
  const match = /^c-(\d+)$/.exec(String(id || ''));
  return match ? Number(match[1]) : 0;
}

export function plantedTreeIndex(id) {
  const match = /^pt-(\d+)$/.exec(String(id || ''));
  return match ? Number(match[1]) : 0;
}

export function nextCropIdValue(crops, requested = 1) {
  const max = (crops || []).reduce((high, item) => Math.max(high, cropIndex(item.id)), 0);
  const start = Number.isInteger(requested) && requested > 0 ? requested : 1;
  return Math.max(start, max + 1);
}

export function assertCropAllocator(crops, nextCropId) {
  if (!Number.isInteger(nextCropId) || nextCropId < 1) throw new Error('bad-crop-id');
  if (nextCropId < nextCropIdValue(crops, 1)) throw new Error('bad-crop-id');
}

export function nextPlantedTreeIdValue(resources, requested = 1) {
  const max = (resources || []).reduce((high, item) => Math.max(high, plantedTreeIndex(item.id)), 0);
  const start = Number.isInteger(requested) && requested > 0 ? requested : 1;
  return Math.max(start, max + 1);
}

export function cropProgress(crop) {
  const def = cropDef(crop?.species);
  if (!def) return 0;
  const remaining = Math.max(0, Number(crop.remaining) || 0);
  const spent = def.duration - remaining;
  if (def.duration <= 0) return remaining <= 1e-9 ? 1 : 0;
  return Math.min(1, Math.max(0, spent / def.duration));
}

export function cropReady(crop) {
  return Boolean(crop) && (Number(crop.remaining) || 0) <= 1e-9;
}

export function cropStageId(crop) {
  if (!crop) return 'seed';
  if (cropReady(crop)) return 'mature';
  return cropProgress(crop) < CROP_SEED_PROGRESS ? 'seed' : 'little';
}

export function cropStageIndex(crop) {
  const id = cropStageId(crop);
  if (id === 'mature') return 2;
  if (id === 'little') return 1;
  return 0;
}

export function cropStageLabel(crop) {
  const id = cropStageId(crop);
  if (id === 'mature') return 'Ready';
  if (id === 'little') return 'Growing';
  const def = cropDef(crop?.species);
  return def ? `${def.label} planted` : 'Planted';
}

export function cropRemainingText(crop) {
  if (!crop) return '';
  if (cropReady(crop)) return 'Ready to harvest';
  if (cropStageId(crop) === 'seed') return cropStageLabel(crop);
  return `Growing · ${formatActiveTime(crop.remaining)} left`;
}

export function littleScale(progress) {
  const p = Math.min(1, Math.max(0, Number(progress) || 0));
  if (p < CROP_SEED_PROGRESS) return 0.25;
  if (p >= 1) return 1;
  const t = (p - CROP_SEED_PROGRESS) / (1 - CROP_SEED_PROGRESS);
  return 0.25 + 0.45 * t;
}

export function plantedTreeCount(resources) {
  return (resources || []).filter(item => item.planted && item.kind === 'tree' && item.phase !== 'removed').length;
}

export function isGrowingTree(resource) {
  return Boolean(resource?.planted && resource.kind === 'tree' && TREE_GROW_PHASES.includes(resource.phase));
}

export function treeGrowStage(resource) {
  if (!resource?.planted || resource.kind !== 'tree') return resource?.phase || 'ready';
  if (resource.phase === 'ready' || resource.phase === 'stump' || resource.phase === 'removed') return resource.phase;
  const remaining = Number(resource.growRemaining);
  if (Number.isFinite(remaining) && remaining > SAPLING_GROW_SECONDS * (2 / 3)) return 'seedling';
  return 'young';
}
