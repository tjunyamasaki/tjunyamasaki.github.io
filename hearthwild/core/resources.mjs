import { BLOCKING_KINDS, CLEAR, HARVEST } from '../data/harvest.mjs';
import { isWildCrop } from '../data/crops.mjs';
import { formatActiveTime, formatYields } from '../data/items.mjs';
import { structureObstacles, structuresOverlapCircle } from '../data/buildings.mjs';
import { HARVEST_PADDING, KEEPER_RADIUS } from '../data/tuning.mjs';
import { addItems, ownedToolTier } from './inventory.mjs';

export function copyResource(node) {
  return {
    id: node.id,
    kind: node.kind,
    variant: node.variant || null,
    x: node.x,
    z: node.z,
    radius: node.radius,
    pickRadius: node.pickRadius || node.radius + 0.4,
    protected: Boolean(node.protected),
    planted: Boolean(node.planted),
    scale: node.scale,
    rotation: node.rotation || 0,
    sx: node.sx,
    sy: node.sy,
    sz: node.sz,
    rx: node.rx,
    ry: node.ry,
    rz: node.rz,
    warm: node.warm,
    phase: node.phase || 'ready',
    readyAt: node.phase === 'removed' ? null : (Number.isFinite(node.readyAt) ? node.readyAt : 0),
    growRemaining: node.planted && Number.isFinite(node.growRemaining) ? Number(node.growRemaining) : null,
  };
}

export function resourcesFromDescriptor(descriptor) {
  return (descriptor.nodes || []).map(node => copyResource(node));
}

export function resourceById(state, id) {
  return state.resources.find(resource => resource.id === id) || null;
}

export function isBlockingResource(resource) {
  if (!resource || resource.phase === 'removed') return false;
  if (resource.kind === 'tree') return resource.phase === 'ready';
  return BLOCKING_KINDS.includes(resource.kind);
}

export function obstaclesFromResources(resources) {
  return (resources || []).filter(isBlockingResource).map(resource => ({
    id: resource.id,
    x: resource.x,
    z: resource.z,
    radius: resource.radius,
    kind: resource.kind,
  }));
}

export function syncObstacles(state) {
  const next = [
    ...obstaclesFromResources(state.resources),
    ...structureObstacles(state.structures || []),
  ];
  const previous = state.obstacles || [];
  const changed = next.length !== previous.length
    || next.some((item, index) => {
      const prev = previous[index];
      return !prev
        || item.id !== prev.id
        || item.x !== prev.x
        || item.z !== prev.z
        || item.radius !== prev.radius
        || item.minX !== prev.minX
        || item.maxX !== prev.maxX
        || item.minZ !== prev.minZ
        || item.maxZ !== prev.maxZ;
    });
  state.obstacles = next;
  return changed;
}

export function harvestRange(resource) {
  return (resource?.radius || 0) + KEEPER_RADIUS + HARVEST_PADDING;
}

export function inHarvestRange(player, resource) {
  if (!player || !resource) return false;
  return Math.hypot(player.x - resource.x, player.z - resource.z) <= harvestRange(resource);
}

export function playerOverlapsResource(state, resource) {
  return Math.hypot(state.player.x - resource.x, state.player.z - resource.z)
    < resource.radius + KEEPER_RADIUS - 1e-6;
}

export function resourceLabel(resource) {
  if (!resource || resource.phase === 'removed') return '';
  if (resource.kind === 'tree' && resource.phase === 'stump') return 'Stump';
  if (resource.kind === 'tree' && resource.planted && resource.phase === 'seedling') return 'Sapling';
  if (resource.kind === 'tree' && resource.planted && resource.phase === 'young') return 'Young tree';
  if (resource.kind === 'tree') return resource.variant === 'broadleaf' ? 'Broadleaf' : 'Conifer';
  if (resource.kind === 'stone') return 'Stone';
  if (resource.kind === 'copper') return 'Copper seam';
  if (resource.kind === 'berry') return 'Berry bush';
  if (resource.kind === 'carrot') return 'Carrot';
  if (resource.kind === 'potato') return 'Potato';
  if (resource.kind === 'twig') return 'Twig patch';
  if (resource.kind === 'pebble') return 'Pebble patch';
  return resource.kind;
}

function harvestDuration(spec, equipment) {
  if (spec.tool) {
    const tier = ownedToolTier(equipment, spec.tool);
    if (!tier) return null;
    return spec.duration[tier];
  }
  return spec.duration;
}

function toolLabel(role, equipment) {
  const tier = ownedToolTier(equipment, role);
  if (role === 'axe') return tier === 'copper' ? 'Copper axe' : 'Stone axe';
  if (role === 'pick') return tier === 'copper' ? 'Copper pick' : 'Stone pick';
  return 'No tool';
}

export function actionDuration(state, resource, action) {
  if (action === 'clear') {
    if (resource.kind === 'tree' && resource.phase === 'stump') return CLEAR.stump.duration;
    if (resource.kind === 'tree' && resource.planted && resource.phase === 'seedling') return CLEAR.sapling.duration;
    if (resource.kind === 'tree' && resource.planted && resource.phase === 'young') return CLEAR.young.duration;
    if (resource.kind === 'berry') return CLEAR.berry.duration;
    if (isWildCrop(resource.kind)) return CLEAR[resource.kind]?.duration ?? null;
    return null;
  }
  const spec = HARVEST[resource.kind];
  if (!spec) return null;
  return harvestDuration(spec, state.equipment);
}

export function canClear(resource) {
  if (!resource || resource.phase === 'removed' || resource.protected) return false;
  if (resource.kind === 'tree') {
    if (resource.phase === 'stump') return true;
    return Boolean(resource.planted && (resource.phase === 'seedling' || resource.phase === 'young'));
  }
  return resource.kind === 'berry' || isWildCrop(resource.kind);
}

export function validateAction(state, targetId, action) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  const resource = resourceById(state, targetId);
  if (!resource || resource.phase === 'removed') return { ok: false, reason: 'missing-target' };
  if (!inHarvestRange(state.player, resource)) return { ok: false, reason: 'too-far' };
  if (action === 'clear') {
    if (resource.protected) return { ok: false, reason: 'protected' };
    if (!canClear(resource)) return { ok: false, reason: 'cannot-clear' };
    return { ok: true, resource, action: 'clear', duration: actionDuration(state, resource, 'clear') };
  }
  const spec = HARVEST[resource.kind];
  if (!spec) return { ok: false, reason: 'unknown-resource' };
  if (resource.phase !== 'ready') return { ok: false, reason: 'not-ready' };
  if (spec.tool && !ownedToolTier(state.equipment, spec.tool)) {
    return { ok: false, reason: spec.tool === 'axe' ? 'needs-axe' : 'needs-pick' };
  }
  return { ok: true, resource, action: 'harvest', duration: harvestDuration(spec, state.equipment), spec };
}

export function describeAction(state, targetId) {
  const resource = resourceById(state, targetId);
  if (!resource || resource.phase === 'removed') {
    return { ok: false, reason: 'missing-target', title: '', detail: '', hint: '', canStart: false, action: null };
  }
  const title = resourceLabel(resource);
  const spec = HARVEST[resource.kind];
  const inRange = inHarvestRange(state.player, resource);
  const progress = state.action?.targetId === resource.id && state.action.duration
    ? Math.min(1, state.action.elapsed / state.action.duration)
    : 0;
  if (resource.phase === 'stump') {
    const duration = CLEAR.stump.duration;
    const reason = resource.protected ? 'protected' : (!inRange ? 'too-far' : null);
    return {
      ok: !reason,
      reason,
      title,
      detail: `${CLEAR.stump.verb} · free`,
      hint: reason === 'protected' ? 'Protected supply cannot be removed.' : (inRange ? 'Hold Gather or press E.' : 'Walk closer.'),
      canStart: !reason,
      action: 'clear',
      duration,
      progress,
      yields: {},
    };
  }
  if (resource.planted && (resource.phase === 'seedling' || resource.phase === 'young')) {
    const clearSpec = resource.phase === 'seedling' ? CLEAR.sapling : CLEAR.young;
    const reason = inRange ? null : 'too-far';
    return {
      ok: !reason,
      reason,
      title,
      detail: `${clearSpec.verb} · returns 1 sapling`,
      hint: inRange ? 'Hold Gather or press E to return the sapling.' : 'Walk closer.',
      canStart: !reason,
      action: 'clear',
      duration: clearSpec.duration,
      progress,
      yields: { sapling: 1 },
    };
  }
  if (resource.phase === 'depleted') {
    const wait = formatActiveTime((resource.readyAt || 0) - state.elapsed);
    const clearable = canClear(resource);
    if (clearable) {
      const reason = inRange ? null : 'too-far';
      const clearSpec = CLEAR[resource.kind];
      return {
        ok: !reason,
        reason,
        title,
        detail: `${clearSpec.verb} · free · resting ${wait}`,
        hint: inRange ? 'Hold Gather or press E to clear.' : 'Walk closer.',
        canStart: !reason,
        action: 'clear',
        duration: clearSpec.duration,
        progress,
        yields: {},
      };
    }
    return {
      ok: false,
      reason: 'not-ready',
      title,
      detail: spec
        ? `${isWildCrop(resource.kind) ? 'Regrows' : 'Resting'} · ${formatYields(spec.yields)}${resource.protected ? ' · protected' : ''}`
        : (isWildCrop(resource.kind) ? 'Regrows' : 'Resting'),
      hint: resource.protected
        ? `${isWildCrop(resource.kind) ? 'Regrows' : 'Ready'} in ${wait}. Protected supply cannot be removed.`
        : `${isWildCrop(resource.kind) ? 'Regrows' : 'Ready'} in ${wait}.`,
      canStart: false,
      action: null,
      duration: 0,
      progress: 0,
      yields: spec?.yields || {},
    };
  }
  if (!spec) {
    return { ok: false, reason: 'unknown-resource', title, detail: '', hint: '', canStart: false, action: null };
  }
  const duration = harvestDuration(spec, state.equipment);
  const tool = spec.tool ? toolLabel(spec.tool, state.equipment) : 'No tool';
  const missing = spec.tool && !ownedToolTier(state.equipment, spec.tool);
  const reason = missing ? (spec.tool === 'axe' ? 'needs-axe' : 'needs-pick') : (!inRange ? 'too-far' : null);
  return {
    ok: !reason,
    reason,
    title,
    detail: `${spec.verb} · ${formatYields(spec.yields)} · ${tool}${resource.protected ? ' · protected' : ''}`,
    hint: missing
      ? `Needs a ${spec.tool === 'axe' ? 'stone axe' : 'stone pick'}.`
      : resource.protected
        ? (inRange ? 'Hold Gather or press E. Protected supply cannot be removed.' : 'Walk closer. Protected supply cannot be removed.')
        : (inRange ? 'Hold Gather or press E.' : 'Walk closer.'),
    canStart: !reason,
    action: 'harvest',
    duration,
    progress,
    yields: spec.yields,
  };
}

export function cancelAction(state, reason = 'cancelled') {
  if (!state.action) return [];
  state.action = null;
  return [{ type: 'actionCancelled', reason }];
}

export function beginAction(state, targetId, actionType) {
  if (actionType && actionType !== 'clear' && actionType !== 'harvest') {
    return { ok: false, reason: 'unknown-action', events: [] };
  }
  const wanted = actionType === 'clear' ? 'clear' : 'harvest';
  const check = validateAction(state, targetId, wanted);
  if (!check.ok) return { ok: false, reason: check.reason, events: [] };
  if (state.action && state.action.targetId === targetId && state.action.type === wanted) {
    return { ok: true, events: [] };
  }
  const events = cancelAction(state, 'switched');
  state.gatherSeq = (state.gatherSeq || 0) + 1;
  state.action = {
    id: state.gatherSeq,
    type: wanted,
    targetCategory: 'resource',
    targetId,
    elapsed: 0,
    duration: check.duration,
    x: check.resource.x,
    z: check.resource.z,
  };
  events.push({
    type: 'actionStarted',
    id: state.action.id,
    targetId,
    targetCategory: 'resource',
    action: wanted,
    x: check.resource.x,
    z: check.resource.z,
  });
  return { ok: true, events };
}

function completeHarvest(state, resource, events) {
  const spec = HARVEST[resource.kind];
  const added = addItems(state.inventory, spec.yields);
  resource.phase = spec.result;
  resource.readyAt = state.elapsed + spec.renew;
  events.push({ type: 'harvested', id: resource.id, kind: resource.kind, items: added });
  if (syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
}

function completeClear(state, resource, events) {
  const planted = Boolean(resource.planted);
  const refundYoung = planted && (resource.phase === 'seedling' || resource.phase === 'young');
  const added = refundYoung ? addItems(state.inventory, { sapling: 1 }) : {};
  if (planted) {
    state.resources = state.resources.filter(item => item.id !== resource.id);
  } else {
    resource.phase = 'removed';
    resource.readyAt = null;
  }
  events.push({ type: 'cleared', id: resource.id, kind: resource.kind, items: added });
  if (syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
}

export function advanceAction(state, dt, moving, events) {
  if (!state.action) return;
  if (moving) {
    events.push(...cancelAction(state, 'moved'));
    return;
  }
  const check = validateAction(state, state.action.targetId, state.action.type);
  if (!check.ok) {
    events.push(...cancelAction(state, check.reason));
    return;
  }
  state.action.elapsed += dt;
  if (state.action.elapsed + 1e-9 < state.action.duration) return;
  const resource = check.resource;
  const recheck = validateAction(state, resource.id, state.action.type);
  state.action = null;
  if (!recheck.ok) {
    events.push({ type: 'actionCancelled', reason: recheck.reason });
    return;
  }
  if (recheck.action === 'clear') completeClear(state, resource, events);
  else completeHarvest(state, resource, events);
}

export function tickRenewal(state, events) {
  let changed = false;
  for (const resource of state.resources) {
    if (resource.phase === 'removed' || resource.phase === 'ready') continue;
    if (resource.phase === 'seedling' || resource.phase === 'young') continue;
    if (resource.readyAt == null || state.elapsed + 1e-9 < resource.readyAt) continue;
    if (resource.kind === 'tree' && resource.phase === 'stump' && playerOverlapsResource(state, resource)) continue;
    if (structuresOverlapCircle(state.structures, resource.x, resource.z, resource.radius)) continue;
    resource.phase = 'ready';
    resource.readyAt = 0;
    events.push({ type: 'renewed', id: resource.id, kind: resource.kind });
    changed = true;
  }
  if (changed && syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
}

