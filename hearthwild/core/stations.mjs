import {
  aabbDistance, buildingDef, cloneCost, distanceToAabb, emptyFurnaceState, footprintBounds,
  formatCost, furnaceBusy,
} from '../data/buildings.mjs';
import { formatActiveTime } from '../data/items.mjs';
import { RECIPES, recipeDef, recipesForStation, handRecipes } from '../data/recipes.mjs';
import { APPROACH_PADDING, BUILD_RANGE, KEEPER_RADIUS, SMELT_QUEUE_CAP, SMELT_SECONDS, STATION_RANGE, WALK_MARGIN } from '../data/tuning.mjs';
import { addItems, canPay, missingCost, payCost, refundCost, scaleCost } from './inventory.mjs';
import { buildNav, cellReachable, continuousWalkable, reachableSet } from '../world/navigation.mjs';

export { furnaceBusy, emptyFurnaceState };

function stationBounds(structure) {
  return footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
}

function stationApproachPoints(bounds) {
  const pad = KEEPER_RADIUS + APPROACH_PADDING;
  const xs = [bounds.minX, (bounds.minX + bounds.maxX) / 2, bounds.maxX];
  const zs = [bounds.minZ, (bounds.minZ + bounds.maxZ) / 2, bounds.maxZ];
  const points = [];
  for (const x of xs) {
    points.push({ x, z: bounds.minZ - pad });
    points.push({ x, z: bounds.maxZ + pad });
  }
  for (const z of zs) {
    points.push({ x: bounds.minX - pad, z });
    points.push({ x: bounds.maxX + pad, z });
  }
  return points;
}

export function inStationRange(player, structure) {
  const bounds = stationBounds(structure);
  if (!bounds || !player) return false;
  return distanceToAabb(player.x, player.z, bounds) <= STATION_RANGE + 1e-6;
}

export function workbenchWithinBuildRange(state, gx, gz, rotation, ignoreId = null) {
  const furnaceBounds = footprintBounds('furnace', gx, gz, rotation);
  for (const structure of state.structures || []) {
    if (structure.kind !== 'workbench' || structure.id === ignoreId) continue;
    const benchBounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
    if (aabbDistance(furnaceBounds, benchBounds) <= BUILD_RANGE + 1e-6) return true;
  }
  return false;
}

export function canReachStation(state, structure) {
  const bounds = stationBounds(structure);
  if (!inStationRange(state.player, structure)) return { ok: false, reason: 'too-far' };
  const nav = buildNav({
    boundary: { polygon: state.boundary },
    nodes: [],
    walkMargin: state.walkMargin ?? WALK_MARGIN,
  }, state.obstacles || []);
  const reached = reachableSet(nav, state.player);
  for (const point of stationApproachPoints(bounds)) {
    if (distanceToAabb(point.x, point.z, bounds) > STATION_RANGE + 1e-6) continue;
    if (!continuousWalkable(nav.polygon, nav.obstacles, point.x, point.z, nav.walkMargin)) continue;
    if (cellReachable(nav, reached, point.x, point.z)) return { ok: true };
  }
  return { ok: false, reason: 'blocked-access' };
}

export function validateStationUse(state, structureId, options = {}) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  const structure = (state.structures || []).find(item => item.id === structureId) || null;
  if (!structure) return { ok: false, reason: 'missing-target' };
  const def = buildingDef(structure.kind);
  if (!def?.station) return { ok: false, reason: 'not-station' };
  if (options.rangeOnly) {
    return inStationRange(state.player, structure)
      ? { ok: true, structure, def }
      : { ok: false, reason: 'too-far', structure, def };
  }
  const access = canReachStation(state, structure);
  if (!access.ok) return { ...access, structure, def };
  return { ok: true, structure, def };
}

function recipeLock(state, recipe) {
  if (recipe.unlock === 'legacyMoonflower' && (state.inventory?.moonflower || 0) < 1) {
    return { locked: true, reason: 'no-flower', hint: 'Only leftover moonflowers convert to fiber.' };
  }
  if (recipe.unlock === 'cropHarvest' && !state.discovery?.cropHarvest) {
    return { locked: true, reason: 'needs-harvest', hint: 'Harvest a crop first.' };
  }
  if (recipe.unlock === 'copperIngot' && !state.discovery?.copperIngot) {
    return { locked: true, reason: 'needs-ingot', hint: 'Smelt a copper ingot first.' };
  }
  if (recipe.unlock === 'furnace' && !state.discovery?.furnace) {
    return { locked: true, reason: 'needs-furnace', hint: 'Place a furnace first.' };
  }
  if (recipe.unique && recipe.equipment && state.equipment?.[recipe.equipment]) {
    return { locked: true, reason: 'owned', hint: 'You already have that tool.', owned: true };
  }
  return { locked: false, reason: null, hint: '' };
}

export function describeRecipe(state, recipeId, accessOk = true) {
  const recipe = recipeDef(recipeId);
  if (!recipe) {
    return { ok: false, reason: 'unknown-recipe', title: '', detail: '', hint: '', canCraft: false };
  }
  const lock = recipeLock(state, recipe);
  const missing = missingCost(state.inventory, recipe.cost);
  const materials = canPay(state.inventory, recipe.cost);
  let reason = lock.reason;
  let hint = lock.hint;
  if (!reason && !accessOk) {
    reason = 'too-far';
    hint = 'Walk closer. Station reach is two paces, with a clear approach.';
  }
  if (!reason && !materials) {
    reason = 'materials';
    hint = `Need ${formatCost(missing)} more. Recipes use the bag.`;
  }
  return {
    id: recipe.id,
    title: recipe.label,
    detail: `${formatCost(recipe.cost)}${recipe.duration ? ` · ${recipe.duration}s` : ''}`,
    hint: hint || (recipe.station === 'hand'
      ? 'Crafts from the bag. No workbench or furnace required.'
      : (recipe.batchable ? 'Queue one or five if the whole batch fits and can be paid.' : 'Craft once. Stone tools stay yours.')),
    reason,
    locked: Boolean(lock.locked || !accessOk || !materials),
    owned: Boolean(lock.owned),
    canCraft: !lock.locked && accessOk && materials,
    batchable: Boolean(recipe.batchable),
    unique: Boolean(recipe.unique),
    cost: cloneCost(recipe.cost),
    missing,
  };
}

export function describeHandRecipes(state) {
  return handRecipes()
    .filter(recipe => recipe.unlock !== 'legacyMoonflower' || (state.inventory?.moonflower || 0) > 0)
    .map(recipe => describeRecipe(state, recipe.id, true));
}

export function describeStation(state, structureId, options = {}) {
  const check = validateStationUse(state, structureId, { rangeOnly: !options.checkAccess });
  const structure = check.structure;
  if (!structure) {
    return {
      ok: false,
      reason: check.reason || 'missing-target',
      title: '',
      detail: '',
      hint: 'That station is gone.',
      canCollect: false,
      recipes: [],
      queue: [],
      output: {},
      pauseNote: 'This panel pauses the island. Close it to resume smelting even if you walk away.',
    };
  }
  const def = check.def || buildingDef(structure.kind);
  const access = options.checkAccess ? check : (inStationRange(state.player, structure)
    ? { ok: true }
    : { ok: false, reason: 'too-far' });
  const accessOk = Boolean(access.ok);
  const recipes = recipesForStation(structure.kind).map(recipe => describeRecipe(state, recipe.id, accessOk));
  const queue = (structure.queue || []).map((batch, index) => {
    const recipe = recipeDef(batch.recipeId);
    return {
      id: batch.id,
      recipeId: batch.recipeId,
      label: recipe?.label || batch.recipeId,
      remaining: batch.remaining,
      active: index === 0,
      canCancel: accessOk && index > 0,
    };
  });
  const output = cloneCost(structure.output);
  const outputCount = Object.values(output).reduce((sum, value) => sum + value, 0);
  const hint = !accessOk
    ? (access.reason === 'blocked-access'
      ? 'There is no clear approach to this station.'
      : 'Walk closer. Station reach is two paces, with a clear approach.')
    : (structure.kind === 'furnace'
      ? 'Queue uses the bag immediately. Only waiting batches refund. Finished ingots stay here until collected.'
      : 'Copper upgrades are unique. Stone tools stay in the bag as owned.');
  return {
    ok: accessOk,
    reason: access.reason || null,
    title: def?.label || structure.kind,
    detail: structure.kind === 'furnace'
      ? (queue.length || outputCount
        ? `${queue.length ? `Smelting ${formatActiveTime(queue[0]?.remaining)} · ${Math.max(0, queue.length - 1)} waiting` : 'Idle'} · ${outputCount} ready`
        : 'Idle · empty')
      : 'Upgrade copper tools here.',
    hint,
    pauseNote: 'This panel pauses the island. Close it to resume smelting even if you walk away.',
    canCollect: accessOk && outputCount > 0,
    recipes,
    queue,
    output,
    structure,
  };
}

export function furnaceActivity(state) {
  const furnaces = (state.structures || []).filter(item => item.kind === 'furnace');
  let queued = 0;
  let remaining = Infinity;
  let ready = 0;
  for (const furnace of furnaces) {
    const queue = furnace.queue || [];
    queued += queue.length;
    if (queue[0]) remaining = Math.min(remaining, queue[0].remaining);
    ready += furnace.output?.copperIngot || 0;
  }
  if (!queued && !ready) return '';
  const parts = [];
  if (queued) {
    parts.push(`smelting ${formatActiveTime(remaining)}${queued > 1 ? ` · ${queued - 1} waiting` : ''}`);
  }
  if (ready) parts.push(`${ready} ingot${ready === 1 ? '' : 's'} ready`);
  return `Furnace ${parts.join(' · ')}. Close a station panel to resume time.`;
}

function validateQueueRequest(state, structureId, recipeId, count) {
  const access = validateStationUse(state, structureId);
  if (!access.ok) return access;
  const recipe = recipeDef(recipeId);
  if (!recipe || !recipe.batchable || recipe.station !== access.structure.kind) {
    return { ok: false, reason: 'unknown-recipe' };
  }
  const lock = recipeLock(state, recipe);
  if (lock.locked) return { ok: false, reason: lock.reason };
  const amount = Math.floor(Number(count));
  if (amount !== 1 && amount !== 5) return { ok: false, reason: 'bad-count' };
  const furnace = access.structure;
  if (furnace.queue.length + amount > SMELT_QUEUE_CAP) return { ok: false, reason: 'queue-full' };
  const cost = scaleCost(recipe.cost, amount);
  if (!canPay(state.inventory, cost)) {
    return { ok: false, reason: 'materials', missing: missingCost(state.inventory, cost) };
  }
  return { ok: true, structure: furnace, recipe, amount, cost };
}

export function canQueueSmelt(state, spec) {
  return validateQueueRequest(state, spec.structureId || spec.id, spec.recipeId, spec.count).ok;
}

export function queueSmelt(state, spec) {
  const check = validateQueueRequest(state, spec.structureId || spec.id, spec.recipeId, spec.count);
  if (!check.ok) return { ok: false, reason: check.reason, events: [] };
  if (!payCost(state.inventory, check.cost)) return { ok: false, reason: 'materials', events: [] };
  const furnace = check.structure;
  const added = [];
  for (let i = 0; i < check.amount; i++) {
    const batch = {
      id: `b-${furnace.nextBatchId}`,
      recipeId: check.recipe.id,
      remaining: SMELT_SECONDS,
    };
    furnace.nextBatchId += 1;
    furnace.queue.push(batch);
    added.push(batch.id);
  }
  return {
    ok: true,
    events: [{ type: 'queued', id: furnace.id, recipeId: check.recipe.id, count: check.amount, cost: cloneCost(check.cost) }],
    batchIds: added,
  };
}

export function cancelBatch(state, spec) {
  const access = validateStationUse(state, spec.structureId || spec.id);
  if (!access.ok) return { ok: false, reason: access.reason, events: [] };
  const furnace = access.structure;
  const index = (furnace.queue || []).findIndex(batch => batch.id === spec.batchId);
  if (index < 0) return { ok: false, reason: 'missing-batch', events: [] };
  if (index === 0) return { ok: false, reason: 'active-locked', events: [] };
  const batch = furnace.queue[index];
  const recipe = recipeDef(batch.recipeId);
  if (!recipe) return { ok: false, reason: 'unknown-recipe', events: [] };
  furnace.queue.splice(index, 1);
  const refund = cloneCost(recipe.cost);
  refundCost(state.inventory, refund);
  return {
    ok: true,
    events: [{ type: 'batchCancelled', id: furnace.id, batchId: batch.id, cost: refund }],
  };
}

export function collectOutput(state, spec) {
  const access = validateStationUse(state, spec.structureId || spec.id);
  if (!access.ok) return { ok: false, reason: access.reason, events: [] };
  const furnace = access.structure;
  const taken = cloneCost(furnace.output);
  if (!Object.values(taken).some(value => value > 0)) return { ok: false, reason: 'empty-output', events: [] };
  const added = addItems(state.inventory, taken);
  furnace.output = {};
  if ((added.copperIngot || 0) > 0) state.discovery.copperIngot = true;
  return {
    ok: true,
    events: [{ type: 'collected', id: furnace.id, items: added }],
  };
}

export function craftRecipe(state, spec) {
  const recipe = recipeDef(spec.recipeId);
  if (!recipe) return { ok: false, reason: 'unknown-recipe', events: [] };
  if (recipe.station === 'hand') {
    if (state.phase !== 'playing') return { ok: false, reason: 'not-playing', events: [] };
    const described = describeRecipe(state, recipe.id, true);
    if (!described.canCraft) return { ok: false, reason: described.reason || 'locked', events: [] };
    const cost = cloneCost(recipe.cost);
    if (!payCost(state.inventory, cost)) return { ok: false, reason: 'materials', events: [] };
    const added = addItems(state.inventory, recipe.output || {});
    if (recipe.equipment) state.equipment[recipe.equipment] = true;
    return {
      ok: true,
      events: [{ type: 'crafted', recipeId: recipe.id, cost, items: added, equipment: recipe.equipment || null }],
    };
  }
  const access = validateStationUse(state, spec.structureId || spec.id);
  if (!access.ok) return { ok: false, reason: access.reason, events: [] };
  if (recipe.batchable || recipe.station !== access.structure.kind) {
    return { ok: false, reason: 'unknown-recipe', events: [] };
  }
  const described = describeRecipe(state, recipe.id, true);
  if (!described.canCraft) return { ok: false, reason: described.reason || 'locked', events: [] };
  const cost = cloneCost(recipe.cost);
  if (!payCost(state.inventory, cost)) return { ok: false, reason: 'materials', events: [] };
  if (recipe.equipment) state.equipment[recipe.equipment] = true;
  return {
    ok: true,
    events: [{ type: 'crafted', id: access.structure.id, recipeId: recipe.id, cost, equipment: recipe.equipment || null }],
  };
}

export function tickStations(state, dt, events) {
  const seconds = Math.max(0, Number(dt) || 0);
  if (seconds <= 0) return;
  for (const structure of state.structures || []) {
    if (structure.kind !== 'furnace' || !structure.queue?.length) continue;
    const active = structure.queue[0];
    active.remaining -= seconds;
    if (active.remaining > 1e-9) continue;
    structure.queue.shift();
    const recipe = recipeDef(active.recipeId) || RECIPES.copperIngot;
    const added = addItems(structure.output, recipe.output);
    events.push({ type: 'smelted', id: structure.id, items: added });
  }
}
