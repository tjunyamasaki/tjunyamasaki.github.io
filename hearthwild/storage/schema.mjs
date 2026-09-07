import {
  CROP_CAP, LEGACY_SEED_RENEW, PLAYER_TREE_CAP, SAPLING_GROW_SECONDS, SCHEMA_VERSION, SMELT_QUEUE_CAP, SMELT_SECONDS,
  SOIL_PATCH_IMPORT_MAX, WILD_CROP_RENEW,
} from '../data/tuning.mjs';
import { ITEM_IDS, LEGACY_ITEM_MERGE } from '../data/items.mjs';
import { buildingDef, copyStructure, nextStructureIdValue } from '../data/buildings.mjs';
import { inferDiscovery, copyDiscovery, recipeDef } from '../data/recipes.mjs';
import {
  assertCropAllocator, copyCrop, CROP_SPECIES, cropDef, cropIndex, LEGACY_CROP_SPECIES, nextCropIdValue,
  nextPlantedTreeIdValue, plantedTreeCount, plantedTreeIndex, RESOURCE_PHASES,
} from '../data/crops.mjs';
import { RESOURCE_KINDS } from '../data/harvest.mjs';
import { copyResource } from '../core/resources.mjs';
import { cloneEquipment, createInventory } from '../core/inventory.mjs';
import {
  assertSoilAllocator, assertSoilPatches, copySoilPatch, detachConvertedSoil, isSoilPatchId, nextSoilIdValue,
  remapCropSoilIds, resolveCropSoilOwner, soilPatchesFromStructures,
} from '../world/soil.mjs';

function gardenDefaults(gameplay, resources = []) {
  const crops = Array.isArray(gameplay?.crops) ? gameplay.crops.map(copyCrop) : [];
  return {
    crops,
    nextCropId: nextCropIdValue(crops, Number.isInteger(gameplay?.nextCropId) ? gameplay.nextCropId : 1),
    nextPlantedTreeId: nextPlantedTreeIdValue(
      resources,
      Number.isInteger(gameplay?.nextPlantedTreeId) ? gameplay.nextPlantedTreeId : 1,
    ),
    harvestCount: Number.isInteger(gameplay?.harvestCount) && gameplay.harvestCount > 0 ? gameplay.harvestCount : 0,
  };
}

function mergeLegacyCount(inventory, from, to) {
  if (!inventory || !Object.prototype.hasOwnProperty.call(inventory, from)) return;
  const extra = Number(inventory[from]);
  if (extra === 0) {
    delete inventory[from];
    return;
  }
  if (!Number.isInteger(extra) || extra < 0 || extra > MAX_ITEM) throw new Error('bad-inventory');
  const current = Number(inventory[to]) || 0;
  if (!Number.isInteger(current) || current < 0 || current > MAX_ITEM) throw new Error('bad-inventory');
  const sum = current + extra;
  if (!Number.isInteger(sum) || sum > MAX_ITEM) throw new Error('bad-inventory');
  inventory[to] = sum;
  delete inventory[from];
}

function migrateInventoryItems(inventory) {
  const bag = inventory && typeof inventory === 'object' ? inventory : {};
  for (const [from, to] of LEGACY_ITEM_MERGE) mergeLegacyCount(bag, from, to);
  return bag;
}

function migrateCropRecord(crop) {
  if (!crop || typeof crop !== 'object') throw new Error('bad-crop');
  const mapped = LEGACY_CROP_SPECIES[crop.species];
  const species = mapped ? mapped.species : crop.species;
  const oldDuration = mapped ? mapped.oldDuration : cropDef(species)?.duration;
  const newDuration = mapped ? mapped.newDuration : cropDef(species)?.duration;
  if (!oldDuration || !newDuration || !cropDef(species)) throw new Error('bad-crop');
  const remaining = Number(crop.remaining);
  if (!Number.isFinite(remaining) || remaining < 0 || remaining > oldDuration + 1e-3) throw new Error('bad-timer');
  const fraction = Math.min(1, Math.max(0, remaining / oldDuration));
  return {
    ...crop,
    species,
    remaining: newDuration * fraction,
  };
}

function convertWildRenewal(resource, elapsed) {
  if (!resource || resource.phase === 'removed' || resource.phase === 'ready') return;
  if (resource.phase !== 'depleted') return;
  if (!Number.isFinite(resource.readyAt)) throw new Error('bad-timer');
  const oldRemaining = resource.readyAt - elapsed;
  if (!Number.isFinite(oldRemaining)) throw new Error('bad-timer');
  if (oldRemaining > LEGACY_SEED_RENEW + 1) throw new Error('bad-timer');
  const fraction = Math.min(1, Math.max(0, oldRemaining / LEGACY_SEED_RENEW));
  resource.readyAt = elapsed + fraction * WILD_CROP_RENEW;
}

function migrateSeedSources(descriptor, gameplay) {
  const nodes = Array.isArray(descriptor?.nodes) ? descriptor.nodes : [];
  const resources = Array.isArray(gameplay?.resources) ? gameplay.resources : [];
  const elapsed = Number(gameplay?.elapsed) || 0;
  const records = new Map();
  for (const node of nodes) {
    if (node?.kind !== 'seed') continue;
    records.set(node.id, { id: node.id, node, resource: null, protected: Boolean(node.protected) });
  }
  for (const resource of resources) {
    if (resource?.kind !== 'seed') continue;
    const rec = records.get(resource.id) || {
      id: resource.id, node: null, resource: null, protected: Boolean(resource.protected),
    };
    rec.resource = resource;
    rec.protected = rec.protected || Boolean(resource.protected);
    records.set(resource.id, rec);
  }
  const list = [...records.values()];
  const protectedOnes = list.filter(item => item.protected).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const rest = list.filter(item => !item.protected).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  [...protectedOnes, ...rest].forEach((item, index) => {
    const kind = index % 2 === 0 ? 'carrot' : 'potato';
    if (item.node) item.node.kind = kind;
    if (item.resource) {
      item.resource.kind = kind;
      convertWildRenewal(item.resource, elapsed);
    }
  });
}

export const MIGRATIONS = Object.freeze({
  1: data => ({
    schemaVersion: 2,
    generatorVersion: data.generatorVersion,
    sequence: data.sequence,
    savedAt: data.savedAt,
    name: data.name,
    seed: data.seed,
    descriptor: data.descriptor,
    gameplay: {
      ...data.gameplay,
      structures: Array.isArray(data.gameplay?.structures) ? data.gameplay.structures.map(copyStructure) : [],
      nextStructureId: nextStructureIdValue(
        data.gameplay?.structures,
        Number.isInteger(data.gameplay?.nextStructureId) ? data.gameplay.nextStructureId : 1,
      ),
    },
  }),
  2: data => {
    const structures = Array.isArray(data.gameplay?.structures)
      ? data.gameplay.structures.map(copyStructure)
      : [];
    return {
      schemaVersion: 3,
      generatorVersion: data.generatorVersion,
      sequence: data.sequence,
      savedAt: data.savedAt,
      name: data.name,
      seed: data.seed,
      descriptor: data.descriptor,
      gameplay: {
        ...data.gameplay,
        structures,
        nextStructureId: nextStructureIdValue(
          structures,
          Number.isInteger(data.gameplay?.nextStructureId) ? data.gameplay.nextStructureId : 1,
        ),
        discovery: inferDiscovery(structures, data.gameplay?.inventory, data.gameplay?.equipment),
      },
    };
  },
  3: data => {
    const resources = Array.isArray(data.gameplay?.resources) ? data.gameplay.resources : [];
    const garden = gardenDefaults(data.gameplay, resources);
    return {
      schemaVersion: 4,
      generatorVersion: data.generatorVersion,
      sequence: data.sequence,
      savedAt: data.savedAt,
      name: data.name,
      seed: data.seed,
      descriptor: data.descriptor,
      gameplay: {
        ...data.gameplay,
        ...garden,
        discovery: copyDiscovery(data.gameplay?.discovery),
      },
    };
  },
  4: data => {
    const next = cloneJson(data);
    next.schemaVersion = 5;
    next.gameplay = next.gameplay || {};
    next.gameplay.inventory = migrateInventoryItems(next.gameplay.inventory || {});
    next.gameplay.crops = Array.isArray(next.gameplay.crops)
      ? next.gameplay.crops.map(migrateCropRecord)
      : [];
    migrateSeedSources(next.descriptor, next.gameplay);
    return next;
  },
  5: data => {
    const next = cloneJson(data);
    next.schemaVersion = 6;
    next.gameplay = next.gameplay || {};
    const worldSeed = next.seed || next.descriptor?.seed || '';
    const converted = soilPatchesFromStructures(
      next.gameplay.structures,
      worldSeed,
      Array.isArray(next.gameplay.soilPatches) ? next.gameplay.soilPatches : [],
    );
    next.gameplay.soilPatches = converted.patches;
    next.gameplay.crops = remapCropSoilIds(
      Array.isArray(next.gameplay.crops) ? next.gameplay.crops : [],
      converted.idMap,
    );
    detachConvertedSoil(next.gameplay, worldSeed);
    next.gameplay.nextSoilId = nextSoilIdValue(next.gameplay.soilPatches, next.gameplay.nextSoilId);
    next.gameplay.equipment = cloneEquipment({
      ...(next.gameplay.equipment || {}),
      hoe: false,
    });
    return next;
  },
});

const MAX_ITEM = 1_000_000_000;
const MAX_BYTES = 2_000_000;

export function applyMigrations(data, targetVersion = SCHEMA_VERSION, table = MIGRATIONS) {
  if (!data || typeof data !== 'object') throw new Error('invalid-save');
  if (!Number.isInteger(data.schemaVersion)) throw new Error('invalid-schema');
  if (data.schemaVersion > targetVersion) throw new Error('future-schema');
  let current = data;
  while (current.schemaVersion < targetVersion) {
    const migrate = table[current.schemaVersion];
    if (typeof migrate !== 'function') throw new Error('missing-migration');
    current = migrate(current);
    if (!current || current.schemaVersion <= data.schemaVersion) throw new Error('migration-stall');
  }
  return current;
}

function finiteNumber(value) {
  return Number.isFinite(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function serializeSnapshot(descriptor, state, extra = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: descriptor.generatorVersion,
    sequence: extra.sequence || 1,
    savedAt: extra.savedAt || 0,
    name: state.worldName || '',
    seed: descriptor.seed,
    descriptor: cloneJson(descriptor),
    gameplay: {
      elapsed: state.elapsed,
      tick: state.tick,
      phase: 'playing',
      worldName: state.worldName || '',
      player: {
        x: state.player.x,
        z: state.player.z,
        facing: state.player.facing,
        moving: false,
      },
      inventory: createInventory(state.inventory),
      equipment: cloneEquipment(state.equipment),
      resources: state.resources.map(copyResource),
      structures: (state.structures || []).map(copyStructure),
      nextStructureId: nextStructureIdValue(state.structures, state.nextStructureId),
      soilPatches: (state.soilPatches || []).map(copySoilPatch),
      nextSoilId: nextSoilIdValue(state.soilPatches, state.nextSoilId),
      crops: (state.crops || []).map(copyCrop),
      nextCropId: nextCropIdValue(state.crops, state.nextCropId),
      nextPlantedTreeId: nextPlantedTreeIdValue(state.resources, state.nextPlantedTreeId),
      harvestCount: Number.isInteger(state.harvestCount) && state.harvestCount > 0 ? state.harvestCount : 0,
      discovery: copyDiscovery(state.discovery),
    },
  };
}

export function validateSnapshot(raw) {
  if (raw == null || typeof raw !== 'object') return { ok: false, reason: 'invalid-save' };
  let data;
  try {
    data = applyMigrations(raw);
    detachConvertedSoil(data.gameplay, data.seed || data.descriptor?.seed || '');
  } catch (error) {
    return { ok: false, reason: error.message || 'invalid-schema' };
  }
  if (!data.descriptor || typeof data.descriptor !== 'object') return { ok: false, reason: 'missing-descriptor' };
  if (!data.gameplay || typeof data.gameplay !== 'object') return { ok: false, reason: 'missing-gameplay' };
  const descriptor = data.descriptor;
  if (!descriptor.seed || !descriptor.generatorVersion) return { ok: false, reason: 'missing-seed' };
  if (!Array.isArray(descriptor.boundary?.polygon) || descriptor.boundary.polygon.length < 8) {
    return { ok: false, reason: 'missing-boundary' };
  }
  if (!Array.isArray(descriptor.nodes)) return { ok: false, reason: 'missing-nodes' };
  if (!descriptor.island || !Array.isArray(descriptor.island.top)) return { ok: false, reason: 'missing-island' };
  const gameplay = data.gameplay;
  if (!finiteNumber(gameplay.elapsed) || gameplay.elapsed < 0) return { ok: false, reason: 'bad-elapsed' };
  if (!finiteNumber(gameplay.player?.x) || !finiteNumber(gameplay.player?.z) || !finiteNumber(gameplay.player?.facing)) {
    return { ok: false, reason: 'bad-player' };
  }
  const inventory = gameplay.inventory || {};
  for (const id of ITEM_IDS) {
    const value = inventory[id];
    if (value == null) continue;
    if (!Number.isFinite(value) || value < 0 || value > MAX_ITEM || Math.floor(value) !== value) {
      return { ok: false, reason: 'bad-inventory' };
    }
  }
  if (!Array.isArray(gameplay.resources)) return { ok: false, reason: 'missing-resources' };
  const nodeIds = descriptor.nodes.map(node => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) return { ok: false, reason: 'duplicate-node' };
  const resourceIds = gameplay.resources.map(resource => resource.id);
  if (new Set(resourceIds).size !== resourceIds.length) return { ok: false, reason: 'duplicate-resource' };
  for (const nodeId of nodeIds) {
    if (!resourceIds.includes(nodeId)) return { ok: false, reason: 'resource-mismatch' };
  }
  const extraResources = gameplay.resources.filter(resource => !nodeIds.includes(resource.id));
  if (plantedTreeCount(extraResources) !== extraResources.length) return { ok: false, reason: 'resource-mismatch' };
  if (plantedTreeCount(gameplay.resources) > PLAYER_TREE_CAP) return { ok: false, reason: 'tree-cap' };
  for (const resource of gameplay.resources) {
    if (!finiteNumber(resource.x) || !finiteNumber(resource.z) || !finiteNumber(resource.radius)) {
      return { ok: false, reason: 'bad-resource' };
    }
    if (!RESOURCE_KINDS.includes(resource.kind)) return { ok: false, reason: 'unknown-resource' };
    const node = descriptor.nodes.find(item => item.id === resource.id);
    if (node && node.kind !== resource.kind) return { ok: false, reason: 'resource-mismatch' };
    if (resource.readyAt != null && !finiteNumber(resource.readyAt)) return { ok: false, reason: 'bad-timer' };
    if (!RESOURCE_PHASES.includes(resource.phase)) return { ok: false, reason: 'bad-phase' };
    if (resource.planted) {
      if (resource.kind !== 'tree' || resource.protected) return { ok: false, reason: 'bad-planted-tree' };
      if (!plantedTreeIndex(resource.id)) return { ok: false, reason: 'bad-planted-tree' };
      if (nodeIds.includes(resource.id)) return { ok: false, reason: 'id-collision' };
      if (resource.phase === 'seedling' || resource.phase === 'young') {
        if (!finiteNumber(resource.growRemaining) || resource.growRemaining < 0 || resource.growRemaining > SAPLING_GROW_SECONDS + 1e-3) {
          return { ok: false, reason: 'bad-timer' };
        }
      }
    } else if (resource.phase === 'seedling' || resource.phase === 'young') {
      return { ok: false, reason: 'bad-phase' };
    }
  }
  if (!Array.isArray(gameplay.structures)) return { ok: false, reason: 'missing-structures' };
  const structureIds = gameplay.structures.map(item => item.id);
  if (new Set(structureIds).size !== structureIds.length) return { ok: false, reason: 'duplicate-structure' };
  for (const structure of gameplay.structures) {
    if (!structure || typeof structure.id !== 'string' || !structure.id) return { ok: false, reason: 'bad-structure' };
    if (resourceIds.includes(structure.id)) return { ok: false, reason: 'id-collision' };
    if (!buildingDef(structure.kind)) return { ok: false, reason: 'unknown-structure' };
    if (!Number.isInteger(structure.gx) || !Number.isInteger(structure.gz)) return { ok: false, reason: 'bad-structure' };
    if (!Number.isInteger(structure.rotation) || structure.rotation < 0 || structure.rotation > 3) {
      return { ok: false, reason: 'bad-rotation' };
    }
    const paid = structure.paidCost || {};
    if (typeof paid !== 'object') return { ok: false, reason: 'bad-cost' };
    for (const [id, value] of Object.entries(paid)) {
      if (!ITEM_IDS.includes(id) || !Number.isInteger(value) || value < 0 || value > MAX_ITEM) {
        return { ok: false, reason: 'bad-cost' };
      }
    }
    if (structure.kind === 'furnace') {
      if (!Array.isArray(structure.queue) || structure.queue.length > SMELT_QUEUE_CAP) {
        return { ok: false, reason: 'bad-furnace' };
      }
      const batchIds = structure.queue.map(batch => batch?.id);
      if (new Set(batchIds).size !== batchIds.length) return { ok: false, reason: 'bad-furnace' };
      for (const batch of structure.queue) {
        if (!batch || typeof batch.id !== 'string' || !batch.id) return { ok: false, reason: 'bad-furnace' };
        const recipe = recipeDef(batch.recipeId);
        if (!recipe || recipe.station !== 'furnace' || !recipe.batchable) return { ok: false, reason: 'bad-furnace' };
        if (!Number.isFinite(batch.remaining) || batch.remaining <= 0 || batch.remaining > SMELT_SECONDS + 1e-3) {
          return { ok: false, reason: 'bad-furnace' };
        }
      }
      const output = structure.output || {};
      if (typeof output !== 'object') return { ok: false, reason: 'bad-furnace' };
      for (const [id, value] of Object.entries(output)) {
        if (!ITEM_IDS.includes(id) || !Number.isInteger(value) || value < 0 || value > MAX_ITEM) {
          return { ok: false, reason: 'bad-furnace' };
        }
      }
      if (!Number.isInteger(structure.nextBatchId) || structure.nextBatchId < 1) {
        return { ok: false, reason: 'bad-furnace' };
      }
    }
  }
  if (!Number.isInteger(gameplay.nextStructureId) || gameplay.nextStructureId < 1) {
    return { ok: false, reason: 'bad-structure-id' };
  }
  if (!Array.isArray(gameplay.soilPatches)) return { ok: false, reason: 'missing-soil' };
  if (gameplay.soilPatches.length > SOIL_PATCH_IMPORT_MAX) return { ok: false, reason: 'soil-cap' };
  const patchIds = gameplay.soilPatches.map(patch => patch?.id);
  if (new Set(patchIds).size !== patchIds.length) return { ok: false, reason: 'duplicate-soil' };
  for (const patch of gameplay.soilPatches) {
    if (!patch || typeof patch.id !== 'string' || !isSoilPatchId(patch.id)) return { ok: false, reason: 'bad-soil' };
    if (resourceIds.includes(patch.id) || structureIds.includes(patch.id)) return { ok: false, reason: 'id-collision' };
    if (!finiteNumber(patch.x) || !finiteNumber(patch.z)) return { ok: false, reason: 'bad-soil' };
    if (patch.shapeVersion !== 1) return { ok: false, reason: 'bad-soil' };
    if (!Number.isFinite(patch.shapeSeed)) return { ok: false, reason: 'bad-soil' };
  }
  try {
    assertSoilPatches(gameplay.soilPatches, descriptor.spawn || { x: 0, z: 0 }, {
      boundary: descriptor.boundary.polygon,
      structures: gameplay.structures,
      resources: gameplay.resources,
    });
    assertSoilAllocator(gameplay.soilPatches, gameplay.nextSoilId);
  } catch (error) {
    return { ok: false, reason: error.message || 'bad-soil' };
  }
  if (!Array.isArray(gameplay.crops)) return { ok: false, reason: 'missing-crops' };
  if (gameplay.crops.length > CROP_CAP) return { ok: false, reason: 'crop-cap' };
  const cropIds = gameplay.crops.map(crop => crop?.id);
  if (new Set(cropIds).size !== cropIds.length) return { ok: false, reason: 'duplicate-crop' };
  const soilStructureIds = new Set(
    gameplay.structures.filter(item => item.kind === 'soil').map(item => item.id),
  );
  const ownedSoils = new Set();
  for (const crop of gameplay.crops) {
    if (!crop || typeof crop.id !== 'string' || !cropIndex(crop.id)) return { ok: false, reason: 'bad-crop' };
    if (resourceIds.includes(crop.id) || structureIds.includes(crop.id) || patchIds.includes(crop.id)) {
      return { ok: false, reason: 'id-collision' };
    }
    if (!CROP_SPECIES.includes(crop.species) || !cropDef(crop.species)) return { ok: false, reason: 'bad-crop' };
    const duration = cropDef(crop.species).duration;
    if (!finiteNumber(crop.remaining) || crop.remaining < 0 || crop.remaining > duration + 1e-3) {
      return { ok: false, reason: 'bad-timer' };
    }
    const owner = resolveCropSoilOwner(crop, gameplay.soilPatches, soilStructureIds);
    if (!owner) return { ok: false, reason: 'orphan-crop' };
    if (ownedSoils.has(owner)) return { ok: false, reason: 'duplicate-crop' };
    ownedSoils.add(owner);
  }
  try {
    assertCropAllocator(gameplay.crops, gameplay.nextCropId);
  } catch (error) {
    return { ok: false, reason: error.message || 'bad-crop-id' };
  }
  if (!Number.isInteger(gameplay.nextPlantedTreeId) || gameplay.nextPlantedTreeId < 1) {
    return { ok: false, reason: 'bad-planted-tree' };
  }
  if (!Number.isInteger(gameplay.harvestCount) || gameplay.harvestCount < 0 || gameplay.harvestCount > MAX_ITEM) {
    return { ok: false, reason: 'bad-harvest-count' };
  }
  const discovery = gameplay.discovery;
  if (!discovery || typeof discovery !== 'object') return { ok: false, reason: 'bad-discovery' };
  for (const key of ['workbench', 'furnace', 'copperIngot', 'cropHarvest']) {
    if (typeof discovery[key] !== 'boolean') return { ok: false, reason: 'bad-discovery' };
  }
  return { ok: true, data };
}

export function parseSaveText(text) {
  if (typeof text !== 'string' || !text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_BYTES) return { ok: false, reason: 'too-large' };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  return validateSnapshot(raw);
}

export { SCHEMA_VERSION };
