import {
  cropDef, cropOnSoil, cropReady, cropStageIndex,
  CROP_CAP, isGrowingTree, nextCropIdValue, plantedTreeCount, plantedTreeIndex,
  PLAYER_TREE_CAP, SAPLING_GROW_SECONDS, treeGrowStage,
} from '../data/crops.mjs';
import { formatActiveTime } from '../data/items.mjs';
import {
  cellKey, circleHitsAabb, distanceToAabb, footprintBounds, formatCost, occupancyMaps, structureObstacles,
} from '../data/buildings.mjs';
import {
  BUILD_RANGE, CROP_CLEAR_SECONDS, CROP_HARVEST_SECONDS, CROP_PLANT_SECONDS, GARDEN_RANGE, HOE_BRUSH_AHEAD,
  SOIL_PATCH_CAP, SOIL_TILL_RANGE, SOIL_TILL_SECONDS, TREE_RADIUS, WALK_MARGIN,
} from '../data/tuning.mjs';
import { isInside } from '../world/boundary.mjs';
import { buildNav, findPath } from '../world/navigation.mjs';
import {
  canonicalSoilId, distanceToOutline, findSoilPatch, newSoilPatchId, occupancyPieces, quantizeSoilCoord,
  soilPatchAsStructure, soilPatchShapeSeed, validateNewSoilPatch,
} from '../world/soil.mjs';
import { addItems, canPay, missingCost, payCost } from './inventory.mjs';
import { cancelAction, copyResource, obstaclesFromResources, playerOverlapsResource, syncObstacles } from './resources.mjs';
import { structureById } from './building.mjs';

export { CROP_CAP, PLAYER_TREE_CAP, nextCropIdValue };

const HALF = 0.48;

function cellOnIsland(polygon, gx, gz, walkMargin) {
  if (!isInside(polygon, gx, gz, walkMargin)) return false;
  const corners = [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]];
  return corners.every(([dx, dz]) => isInside(polygon, gx + dx, gz + dz, 0));
}

export function cropBySoilId(state, soilId) {
  return cropOnSoil(state.crops, soilId);
}

export const FIELD_ACTIONS = Object.freeze(['till', 'plantCrop', 'harvestCrop', 'uprootCrop', 'smoothSoil']);

export function isFieldAction(type) {
  return FIELD_ACTIONS.includes(type);
}

export function ownsHoe(state) {
  return Boolean(state?.equipment?.hoe);
}

export function hoeBrushPoint(player, distance = HOE_BRUSH_AHEAD) {
  const facing = Number(player?.facing) || 0;
  return {
    x: quantizeSoilCoord((Number(player?.x) || 0) + Math.sin(facing) * distance),
    z: quantizeSoilCoord((Number(player?.z) || 0) + Math.cos(facing) * distance),
  };
}

export function inGardenRange(player, structure) {
  if (!player || !structure) return false;
  if (structure.outline?.length) {
    return distanceToOutline(structure.outline, player.x, player.z) <= GARDEN_RANGE + 1e-6;
  }
  const bounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
  return distanceToAabb(player.x, player.z, bounds) <= GARDEN_RANGE + 1e-6;
}

function inTillRange(player, x, z) {
  if (!player || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  return Math.hypot(player.x - x, player.z - z) <= SOIL_TILL_RANGE + 1e-6;
}

function soilContact(structure) {
  if (!structure) return { x: 0, z: 0 };
  if (Number.isFinite(structure.x) && Number.isFinite(structure.z)) return { x: structure.x, z: structure.z };
  return { x: Number(structure.gx) || 0, z: Number(structure.gz) || 0 };
}

function commandTargetId(command) {
  return command?.targetId || command?.soilId || command?.id || null;
}

function gardenReason(reason, extra = {}) {
  if (reason === 'too-far') return 'Walk closer to tend this plot.';
  if (reason === 'not-soil') return 'Plant on a soil plot.';
  if (reason === 'occupied-plot') return 'This plot already has a plant.';
  if (reason === 'empty-plot') return 'Nothing is growing here.';
  if (reason === 'immature') return 'It is still growing.';
  if (reason === 'materials' || reason === 'no-seed') {
    return extra.missing
      ? `Need ${formatCost(extra.missing)} more.`
      : 'Harvest wild carrots or potatoes to find seeds.';
  }
  if (reason === 'crop-cap') return `The island can tend ${CROP_CAP} crops.`;
  if (reason === 'tree-cap') return `The island can hold ${PLAYER_TREE_CAP} planted trees.`;
  if (reason === 'occupied-ground') return 'A floor, path or soil already uses this ground.';
  if (reason === 'occupied-solid') return 'Something already stands here.';
  if (reason === 'occupied-soil') return 'Soil and crops need open ground.';
  if (reason === 'blocked') return 'A resource is in the way.';
  if (reason === 'protected') return 'Protected supply cannot be covered.';
  if (reason === 'off-island') return 'Too close to the cliff.';
  if (reason === 'unknown-seed') return 'Those seeds cannot be planted yet.';
  if (reason === 'missing-target') return 'That plot is gone.';
  if (reason === 'not-playing') return 'Enter the clearing first.';
  if (reason === 'no-sapling') return 'Need a sapling in the bag.';
  if (reason === 'needs-hoe') return 'Craft a hoe from 5 wood and 2 stone first.';
  if (reason === 'soil-cap') return `The island can hold ${SOIL_PATCH_CAP} earth patches.`;
  if (reason === 'spawn') return 'Keep the clearing grass open.';
  if (reason === 'spacing' || reason === 'overlap' || reason === 'occupied') return 'Something already uses this ground.';
  if (reason === 'has-crop') return 'Harvest or uproot first.';
  return 'That cannot be planted here.';
}

function allocateCropId(state) {
  const id = `c-${state.nextCropId}`;
  state.nextCropId += 1;
  return id;
}

function allocatePlantedTreeId(state) {
  const id = `pt-${state.nextPlantedTreeId}`;
  state.nextPlantedTreeId += 1;
  return id;
}

function soilStructure(state, soilId) {
  const structure = structureById(state, soilId);
  if (structure?.kind === 'soil') return structure;
  return soilPatchAsStructure(findSoilPatch(state.soilPatches, soilId));
}

export function validatePlant(state, spec) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  const structure = soilStructure(state, spec.soilId || spec.targetId || spec.id);
  if (!structure) return { ok: false, reason: spec.soilId || spec.targetId || spec.id ? 'not-soil' : 'missing-target' };
  if (!inGardenRange(state.player, structure)) return { ok: false, reason: 'too-far', structure };
  const def = cropDef(spec.species);
  if (!def) return { ok: false, reason: 'unknown-seed' };
  if (cropBySoilId(state, structure.id)) return { ok: false, reason: 'occupied-plot', structure };
  if ((state.crops?.length || 0) >= CROP_CAP) return { ok: false, reason: 'crop-cap', structure };
  const cost = { [def.seed]: 1 };
  if (!canPay(state.inventory, cost)) {
    return { ok: false, reason: 'no-seed', missing: missingCost(state.inventory, cost), structure };
  }
  return { ok: true, structure, def, cost };
}

function resolveCropRecord(state, spec) {
  const id = commandTargetId(spec);
  const byId = (state.crops || []).find(item => item.id === id);
  if (byId) return byId;
  return cropBySoilId(state, id);
}

function tillContext(state) {
  return {
    boundary: state.boundary,
    structures: state.structures,
    resources: state.resources,
  };
}

export function validateTill(state, spec) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  if (!ownsHoe(state)) return { ok: false, reason: 'needs-hoe' };
  const x = quantizeSoilCoord(spec?.x);
  const z = quantizeSoilCoord(spec?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, reason: 'missing-target' };
  if (!inTillRange(state.player, x, z)) return { ok: false, reason: 'too-far' };
  const id = newSoilPatchId(state.nextSoilId);
  const check = validateNewSoilPatch(
    { id, x, z, shapeSeed: soilPatchShapeSeed(state.seed, id) },
    state.soilPatches,
    state.clearing,
    tillContext(state),
  );
  if (!check.ok) return check;
  return { ok: true, x, z, patch: check.patch, outline: check.outline, duration: SOIL_TILL_SECONDS };
}

export function validateHarvestCrop(state, spec) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  const crop = resolveCropRecord(state, spec);
  if (!crop) {
    const structure = soilStructure(state, commandTargetId(spec));
    if (!structure) return { ok: false, reason: commandTargetId(spec) ? 'empty-plot' : 'missing-target' };
    if (!inGardenRange(state.player, structure)) return { ok: false, reason: 'too-far', structure };
    return { ok: false, reason: 'empty-plot', structure };
  }
  const structure = soilStructure(state, crop.soilId);
  if (!structure) return { ok: false, reason: 'missing-target' };
  if (!inGardenRange(state.player, structure)) return { ok: false, reason: 'too-far', structure };
  if (!cropReady(crop)) return { ok: false, reason: 'immature', structure, crop };
  const def = cropDef(crop.species);
  if (!def) return { ok: false, reason: 'unknown-seed', structure, crop };
  return { ok: true, structure, crop, def };
}

export function validateUprootCrop(state, spec) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  const crop = resolveCropRecord(state, spec);
  if (!crop) {
    const structure = soilStructure(state, commandTargetId(spec));
    if (!structure) return { ok: false, reason: commandTargetId(spec) ? 'empty-plot' : 'missing-target' };
    if (!inGardenRange(state.player, structure)) return { ok: false, reason: 'too-far', structure };
    return { ok: false, reason: 'empty-plot', structure };
  }
  const structure = soilStructure(state, crop.soilId);
  if (!structure) return { ok: false, reason: 'missing-target' };
  if (!inGardenRange(state.player, structure)) return { ok: false, reason: 'too-far', structure };
  const def = cropDef(crop.species);
  if (!def) return { ok: false, reason: 'unknown-seed', structure, crop };
  return { ok: true, structure, crop, def };
}

export function validateSmoothSoil(state, spec) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  if (!ownsHoe(state)) return { ok: false, reason: 'needs-hoe' };
  const structure = soilStructure(state, commandTargetId(spec));
  if (!structure) return { ok: false, reason: 'missing-target' };
  if (!inGardenRange(state.player, structure)) return { ok: false, reason: 'too-far', structure };
  if (cropBySoilId(state, structure.id)) return { ok: false, reason: 'has-crop', structure };
  return { ok: true, structure };
}

function commitTill(state, action, events) {
  const check = validateTill(state, { x: action.x, z: action.z });
  if (!check.ok) return check;
  state.soilPatches.push(check.patch);
  state.nextSoilId += 1;
  events.push({ type: 'tilled', id: check.patch.id, x: check.patch.x, z: check.patch.z });
  return { ok: true, targetId: check.patch.id, species: null, x: check.patch.x, z: check.patch.z };
}

function commitPlantCrop(state, action, events) {
  const check = validatePlant(state, { targetId: action.targetId, species: action.species });
  if (!check.ok) return check;
  if (!payCost(state.inventory, check.cost)) return { ok: false, reason: 'no-seed' };
  const crop = {
    id: allocateCropId(state),
    soilId: canonicalSoilId(state.soilPatches, check.structure.id),
    species: check.def.id,
    remaining: check.def.duration,
  };
  state.crops.push(crop);
  const contact = soilContact(check.structure);
  events.push({ type: 'planted', id: crop.id, soilId: crop.soilId, species: crop.species });
  return { ok: true, targetId: crop.soilId, species: crop.species, x: contact.x, z: contact.z };
}

function commitHarvestCrop(state, action, events) {
  const check = validateHarvestCrop(state, { targetId: action.targetId });
  if (!check.ok) return check;
  const added = addItems(state.inventory, check.def.yields);
  state.crops = state.crops.filter(item => item.id !== check.crop.id);
  state.discovery.cropHarvest = true;
  state.harvestCount = (Number(state.harvestCount) || 0) + 1;
  const contact = soilContact(check.structure);
  events.push({
    type: 'harvestedCrop',
    id: check.crop.id,
    soilId: check.structure.id,
    species: check.crop.species,
    items: added,
  });
  return { ok: true, targetId: check.crop.id, species: check.crop.species, x: contact.x, z: contact.z };
}

function commitUprootCrop(state, action, events) {
  const check = validateUprootCrop(state, { targetId: action.targetId });
  if (!check.ok) return check;
  const added = addItems(state.inventory, { [check.def.seed]: 1 });
  state.crops = state.crops.filter(item => item.id !== check.crop.id);
  const contact = soilContact(check.structure);
  events.push({
    type: 'uprooted',
    id: check.crop.id,
    soilId: check.structure.id,
    species: check.crop.species,
    items: added,
    x: contact.x,
    z: contact.z,
  });
  return { ok: true, targetId: check.crop.id, species: check.crop.species, x: contact.x, z: contact.z };
}

function commitSmoothSoil(state, action, events) {
  const check = validateSmoothSoil(state, { targetId: action.targetId });
  if (!check.ok) return check;
  const contact = soilContact(check.structure);
  const patch = findSoilPatch(state.soilPatches, check.structure.id);
  if (patch) {
    state.soilPatches = state.soilPatches.filter(item => item.id !== patch.id);
  } else {
    state.structures = (state.structures || []).filter(item => item.id !== check.structure.id);
  }
  events.push({ type: 'smoothed', id: check.structure.id, x: contact.x, z: contact.z });
  if (syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
  return { ok: true, targetId: check.structure.id, species: null, x: contact.x, z: contact.z };
}

function resolveFieldAction(state, command) {
  const type = command?.action;
  if (type === 'till') {
    const check = validateTill(state, command);
    if (!check.ok) return check;
    return {
      ok: true,
      type,
      targetCategory: 'ground',
      targetId: null,
      species: null,
      x: check.x,
      z: check.z,
      duration: SOIL_TILL_SECONDS,
    };
  }
  if (type === 'plantCrop') {
    const check = validatePlant(state, command);
    if (!check.ok) return check;
    const contact = soilContact(check.structure);
    return {
      ok: true,
      type,
      targetCategory: 'soil',
      targetId: check.structure.id,
      soilId: check.structure.id,
      species: check.def.id,
      x: contact.x,
      z: contact.z,
      duration: CROP_PLANT_SECONDS,
    };
  }
  if (type === 'harvestCrop') {
    const check = validateHarvestCrop(state, command);
    if (!check.ok) return check;
    const contact = soilContact(check.structure);
    return {
      ok: true,
      type,
      targetCategory: 'crop',
      targetId: check.crop.id,
      soilId: check.structure.id,
      species: check.crop.species,
      x: contact.x,
      z: contact.z,
      duration: CROP_HARVEST_SECONDS,
    };
  }
  if (type === 'uprootCrop') {
    const check = validateUprootCrop(state, command);
    if (!check.ok) return check;
    const contact = soilContact(check.structure);
    return {
      ok: true,
      type,
      targetCategory: 'crop',
      targetId: check.crop.id,
      soilId: check.structure.id,
      species: check.crop.species,
      x: contact.x,
      z: contact.z,
      duration: CROP_CLEAR_SECONDS,
    };
  }
  if (type === 'smoothSoil') {
    const check = validateSmoothSoil(state, command);
    if (!check.ok) return check;
    const contact = soilContact(check.structure);
    return {
      ok: true,
      type,
      targetCategory: 'soil',
      targetId: check.structure.id,
      soilId: check.structure.id,
      species: null,
      x: contact.x,
      z: contact.z,
      duration: CROP_CLEAR_SECONDS,
    };
  }
  return { ok: false, reason: 'unknown-action' };
}

function requestedMatchesAction(action, command) {
  if (!action || action.type !== command?.action) return false;
  if (action.type === 'till') {
    return action.x === quantizeSoilCoord(command.x) && action.z === quantizeSoilCoord(command.z);
  }
  const id = commandTargetId(command);
  if (!id) return false;
  if (action.type === 'plantCrop') {
    return action.targetId === id && action.species === command.species;
  }
  return action.targetId === id || action.soilId === id;
}

export function beginFieldAction(state, command) {
  if (!isFieldAction(command?.action)) return { ok: false, reason: 'unknown-action', events: [] };
  if (requestedMatchesAction(state.action, command)) return { ok: true, events: [] };
  const events = cancelAction(state, 'switched');
  const resolved = resolveFieldAction(state, command);
  if (!resolved.ok) return { ok: false, reason: resolved.reason, events };
  state.gatherSeq = (state.gatherSeq || 0) + 1;
  state.action = {
    id: state.gatherSeq,
    type: resolved.type,
    targetCategory: resolved.targetCategory,
    targetId: resolved.targetId,
    soilId: resolved.soilId || null,
    species: resolved.species,
    x: resolved.x,
    z: resolved.z,
    elapsed: 0,
    duration: resolved.duration,
  };
  events.push({
    type: 'actionStarted',
    id: state.action.id,
    action: resolved.type,
    targetCategory: resolved.targetCategory,
    targetId: resolved.targetId,
    species: resolved.species,
    x: resolved.x,
    z: resolved.z,
  });
  return { ok: true, events };
}

function emitActionCompleted(events, action, result) {
  events.push({
    type: 'actionCompleted',
    id: action.id,
    action: action.type,
    targetCategory: action.targetCategory,
    targetId: result.targetId,
    species: result.species || null,
    x: result.x,
    z: result.z,
  });
}

function commitFieldAction(state, action, events) {
  if (action.type === 'till') return commitTill(state, action, events);
  if (action.type === 'plantCrop') return commitPlantCrop(state, action, events);
  if (action.type === 'harvestCrop') return commitHarvestCrop(state, action, events);
  if (action.type === 'uprootCrop') return commitUprootCrop(state, action, events);
  if (action.type === 'smoothSoil') return commitSmoothSoil(state, action, events);
  return { ok: false, reason: 'unknown-action' };
}

export function advanceFieldAction(state, dt, moving, events) {
  if (!state.action || !isFieldAction(state.action.type)) return;
  if (moving) {
    events.push(...cancelAction(state, 'moved'));
    return;
  }
  const live = resolveFieldAction(state, {
    action: state.action.type,
    targetId: state.action.targetId,
    soilId: state.action.soilId,
    species: state.action.species,
    x: state.action.x,
    z: state.action.z,
  });
  if (!live.ok) {
    events.push(...cancelAction(state, live.reason));
    return;
  }
  state.action.elapsed += dt;
  if (state.action.elapsed + 1e-9 < state.action.duration) return;
  const action = state.action;
  state.action = null;
  const result = commitFieldAction(state, action, events);
  if (!result.ok) {
    events.push({ type: 'actionCancelled', reason: result.reason });
    return;
  }
  emitActionCompleted(events, action, result);
}

function treeHitsStructure(x, z, radius, structures, ignoreId = null) {
  for (const structure of structures || []) {
    if (structure.id === ignoreId) continue;
    const bounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
    if (!bounds || !Number.isFinite(bounds.minX)) continue;
    if (circleHitsAabb(x, z, radius, bounds)) return structure;
  }
  return null;
}

function treeHitsResource(x, z, radius, resources, ignoreId = null) {
  for (const resource of resources || []) {
    if (!resource || resource.id === ignoreId || resource.phase === 'removed') continue;
    if (Math.hypot(resource.x - x, resource.z - z) < resource.radius + radius - 1e-6) return resource;
  }
  return null;
}

function canMatureTree(state, resource) {
  if (playerOverlapsResource(state, resource)) return false;
  if (treeHitsStructure(resource.x, resource.z, resource.radius, occupancyPieces(state))) return false;
  const extra = [{ id: resource.id, x: resource.x, z: resource.z, radius: resource.radius, kind: 'tree' }];
  const obstacles = [
    ...obstaclesFromResources((state.resources || []).filter(item => item.id !== resource.id)),
    ...structureObstacles(state.structures),
    ...extra,
  ];
  const nav = buildNav({
    boundary: { polygon: state.boundary },
    nodes: [],
    walkMargin: state.walkMargin ?? WALK_MARGIN,
  }, obstacles);
  return Boolean(findPath(nav, state.player, state.clearing));
}

export function validatePlantTree(state, spec) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  const gx = Math.round(Number(spec.gx));
  const gz = Math.round(Number(spec.gz));
  if (!Number.isFinite(gx) || !Number.isFinite(gz)) return { ok: false, reason: 'off-island' };
  if (Math.hypot(state.player.x - gx, state.player.z - gz) > BUILD_RANGE + 1e-6) {
    return { ok: false, reason: 'too-far' };
  }
  if (!cellOnIsland(state.boundary, gx, gz, state.walkMargin ?? WALK_MARGIN)) return { ok: false, reason: 'off-island' };
  if (plantedTreeCount(state.resources) >= PLAYER_TREE_CAP) return { ok: false, reason: 'tree-cap' };
  const pieces = occupancyPieces(state);
  const { ground, solid } = occupancyMaps(pieces, null);
  const key = cellKey(gx, gz);
  if (ground.has(key)) {
    return { ok: false, reason: ground.get(key).kind === 'soil' ? 'occupied-soil' : 'occupied-ground' };
  }
  if (solid.has(key)) return { ok: false, reason: 'occupied-solid' };
  const hitStructure = treeHitsStructure(gx, gz, TREE_RADIUS, pieces);
  if (hitStructure) return { ok: false, reason: hitStructure.kind === 'soil' ? 'occupied-soil' : 'occupied-solid' };
  const hitResource = treeHitsResource(gx, gz, TREE_RADIUS, state.resources);
  if (hitResource) return { ok: false, reason: hitResource.protected ? 'protected' : 'blocked' };
  if (!canPay(state.inventory, { sapling: 1 })) return { ok: false, reason: 'no-sapling', missing: { sapling: 1 } };
  return { ok: true, gx, gz };
}

export function describePlantTree(state, spec) {
  const check = validatePlantTree(state, spec);
  return {
    ok: check.ok,
    reason: check.reason || null,
    title: 'Sapling',
    detail: check.ok ? 'Confirm spends 1 sapling' : 'Ghosts spend nothing',
    hint: check.ok
      ? 'Confirm to plant. Young trees stay walkable until they mature.'
      : gardenReason(check.reason, check),
    canConfirm: check.ok,
    missing: check.missing || null,
    gx: check.gx,
    gz: check.gz,
  };
}

export function plantTree(state, spec) {
  const check = validatePlantTree(state, spec);
  if (!check.ok) return { ok: false, reason: check.reason, events: [] };
  if (!payCost(state.inventory, { sapling: 1 })) return { ok: false, reason: 'no-sapling', events: [] };
  const id = allocatePlantedTreeId(state);
  const index = plantedTreeIndex(id);
  const resource = copyResource({
    id,
    kind: 'tree',
    variant: index % 2 === 0 ? 'conifer' : 'broadleaf',
    x: check.gx,
    z: check.gz,
    radius: TREE_RADIUS,
    pickRadius: 0.98,
    protected: false,
    planted: true,
    scale: 0.92,
    rotation: (index * 2.399) % (Math.PI * 2),
    phase: 'seedling',
    growRemaining: SAPLING_GROW_SECONDS,
    readyAt: null,
  });
  state.resources.push(resource);
  const events = [{ type: 'plantedTree', id: resource.id, x: resource.x, z: resource.z }];
  if (syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
  return { ok: true, events, resource };
}

export function tickGarden(state, dt, events, preexistingIds = null) {
  const seconds = Math.max(0, Number(dt) || 0);
  if (seconds <= 0) return;
  for (const crop of state.crops || []) {
    if (preexistingIds && !preexistingIds.has(crop.id)) continue;
    if (crop.remaining <= 0) continue;
    const before = cropStageIndex(crop);
    crop.remaining = Math.max(0, crop.remaining - seconds);
    const after = cropStageIndex(crop);
    if (after !== before) events.push({ type: 'cropGrew', id: crop.id, soilId: crop.soilId, stage: after });
    if (crop.remaining <= 1e-9 && before !== 3) {
      crop.remaining = 0;
      events.push({ type: 'cropReady', id: crop.id, soilId: crop.soilId, species: crop.species });
    }
  }
  let changed = false;
  for (const resource of state.resources || []) {
    if (!resource.planted || resource.kind !== 'tree') continue;
    if (resource.phase !== 'seedling' && resource.phase !== 'young') continue;
    if ((resource.growRemaining || 0) > 0) {
      resource.growRemaining = Math.max(0, resource.growRemaining - seconds);
    }
    const nextStage = treeGrowStage(resource);
    if (nextStage !== resource.phase && (nextStage === 'seedling' || nextStage === 'young')) {
      resource.phase = nextStage;
      events.push({ type: 'treeGrew', id: resource.id, phase: resource.phase });
    }
    if (resource.growRemaining > 1e-9) continue;
    resource.growRemaining = 0;
    resource.phase = 'young';
    if (!canMatureTree(state, resource)) continue;
    resource.phase = 'ready';
    resource.readyAt = 0;
    events.push({ type: 'treeGrown', id: resource.id });
    changed = true;
  }
  if (changed && syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
}

export function gardenActivity(state) {
  const crops = state.crops || [];
  const young = (state.resources || []).filter(isGrowingTree);
  if (!crops.length && !young.length) return '';
  const ready = crops.filter(cropReady).length;
  const growing = crops.length - ready;
  const parts = [];
  if (ready) parts.push(`${ready} crop${ready === 1 ? '' : 's'} ready`);
  if (growing) {
    const soonest = Math.min(...crops.filter(crop => !cropReady(crop)).map(crop => crop.remaining));
    parts.push(`growing ${formatActiveTime(soonest)}`);
  }
  if (young.length) {
    const wait = Math.min(...young.map(item => item.growRemaining || 0));
    parts.push(`${young.length} sapling${young.length === 1 ? '' : 's'} ${formatActiveTime(wait)}`);
  }
  if (!parts.length) return '';
  return `Garden ${parts.join(' · ')}. Close Bag to resume growth.`;
}

export function plotHint(reason, extra) {
  return gardenReason(reason, extra);
}
