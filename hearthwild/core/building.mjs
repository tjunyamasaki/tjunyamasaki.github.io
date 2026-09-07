import {
  BUILDINGS, CATALOG, buildingDef, cellKey, circleHitsAabb, cloneCost, copyStructure, emptyFurnaceState, footprintBounds,
  footprintCells, footprintCenter, formatCost, furnaceBusy, nextStructureIdValue, occupancyMaps, structureObstacles, structuresOverlapCircle,
} from '../data/buildings.mjs';
import { cropOnSoil } from '../data/crops.mjs';
import { earthHitsBounds, findSoilPatch, occupancyPieces, soilPatchAsStructure } from '../world/soil.mjs';
import { BUILD_RANGE, KEEPER_RADIUS, STRUCTURE_CAP, WALK_MARGIN } from '../data/tuning.mjs';
import { isInside } from '../world/boundary.mjs';
import { buildNav, findPath } from '../world/navigation.mjs';
import { canPay, missingCost, payCost, refundCost } from './inventory.mjs';
import { obstaclesFromResources, syncObstacles } from './resources.mjs';
import { workbenchWithinBuildRange } from './stations.mjs';

export {
  BUILDINGS, CATALOG, buildingDef, cloneCost, copyStructure, footprintBounds, footprintCells, footprintCenter, formatCost,
  furnaceBusy, nextStructureIdValue,
};

const HALF = 0.48;

export function structureById(state, id) {
  return (state.structures || []).find(item => item.id === id) || null;
}

function allocateStructureId(state) {
  const id = `s-${state.nextStructureId}`;
  state.nextStructureId += 1;
  return id;
}

function cellOnIsland(polygon, gx, gz, walkMargin) {
  if (!isInside(polygon, gx, gz, walkMargin)) return false;
  const corners = [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]];
  return corners.every(([dx, dz]) => isInside(polygon, gx + dx, gz + dz, 0));
}

function isCoverableResource(resource) {
  return resource.kind === 'tree' && resource.phase === 'stump' && !resource.protected;
}

function reasonText(reason, extra = {}) {
  if (reason === 'too-far') return 'Walk closer. Building reach is five paces.';
  if (reason === 'off-island') return 'Too close to the cliff.';
  if (reason === 'occupied-ground') return 'A floor, path or soil already uses this ground.';
  if (reason === 'occupied-solid') return 'Something already stands here.';
  if (reason === 'occupied-soil') return 'Soil and crops need open ground.';
  if (reason === 'has-crop') return 'Harvest or uproot this crop first.';
  if (reason === 'partial-support') return 'This piece needs a full floor, or none.';
  if (reason === 'blocked') return 'A resource is in the way.';
  if (reason === 'protected') return 'Protected supply cannot be covered.';
  if (reason === 'player') return 'Move the keeper off this spot.';
  if (reason === 'materials') return extra.missing ? `Need ${formatCost(extra.missing)} more.` : 'Need more materials.';
  if (reason === 'cap') return `The island can hold ${STRUCTURE_CAP} pieces.`;
  if (reason === 'blocked-home') return 'That would block the path home.';
  if (reason === 'has-dependent') return 'Move or dismantle the piece on this floor first.';
  if (reason === 'station-busy') return 'Empty the furnace first. Queued work and finished ingots stay with it.';
  if (reason === 'needs-workbench') return extra.discovered === false
    ? 'Place a workbench first.'
    : 'A workbench must be within five paces.';
  if (reason === 'missing-target') return 'That piece is gone.';
  if (reason === 'unknown-piece') return 'That piece cannot be placed yet.';
  if (reason === 'not-playing') return 'Enter the clearing first.';
  return 'This spot will not take that piece.';
}

function candidateObstacles(state, spec) {
  const structures = (state.structures || []).filter(item => item.id !== spec.movingId);
  const def = buildingDef(spec.kind);
  if (def?.solid) {
    structures.push({
      id: spec.movingId || 'preview',
      kind: spec.kind,
      gx: spec.gx,
      gz: spec.gz,
      rotation: spec.rotation,
      paidCost: {},
    });
  }
  return [...obstaclesFromResources(state.resources), ...structureObstacles(structures)];
}

function keepsClearingReachable(state, spec) {
  const def = buildingDef(spec.kind);
  if (!def?.solid) return true;
  const obstacles = candidateObstacles(state, spec);
  const nav = buildNav({
    boundary: { polygon: state.boundary },
    nodes: [],
    walkMargin: state.walkMargin ?? WALK_MARGIN,
  }, obstacles);
  if (!findPath(nav, state.player, state.clearing)) return false;
  return true;
}

export function dependentsFor(state, structureId) {
  const target = structureById(state, structureId);
  if (!target) return [];
  const def = buildingDef(target.kind);
  if (!def || def.layer !== 'ground' || target.kind !== 'floor') return [];
  const cells = new Set(footprintCells(target.kind, target.gx, target.gz, target.rotation).map(cell => cellKey(cell.gx, cell.gz)));
  const { ground } = occupancyMaps(occupancyPieces(state), null);
  const dependents = [];
  for (const other of state.structures) {
    if (other.id === structureId) continue;
    const otherDef = buildingDef(other.kind);
    if (!otherDef?.solid) continue;
    const otherCells = footprintCells(other.kind, other.gx, other.gz, other.rotation);
    const shares = otherCells.some(cell => cells.has(cellKey(cell.gx, cell.gz)));
    if (!shares) continue;
    const supported = otherCells.every(cell => ground.get(cellKey(cell.gx, cell.gz))?.kind === 'floor');
    if (supported) dependents.push(other);
  }
  return dependents;
}

export function validatePlacement(state, spec) {
  if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  const def = buildingDef(spec.kind);
  if (!def || !CATALOG.includes(spec.kind)) return { ok: false, reason: 'unknown-piece' };
  const gx = Math.round(Number(spec.gx));
  const gz = Math.round(Number(spec.gz));
  const rotation = ((Math.round(Number(spec.rotation)) % 4) + 4) % 4;
  if (!Number.isFinite(gx) || !Number.isFinite(gz)) return { ok: false, reason: 'off-island' };
  const movingId = spec.movingId || null;
  if (movingId && !structureById(state, movingId)) return { ok: false, reason: 'missing-target' };
  if (!movingId && (state.structures?.length || 0) >= STRUCTURE_CAP) return { ok: false, reason: 'cap' };

  const cells = footprintCells(spec.kind, gx, gz, rotation);
  const player = state.player;
  for (const cell of cells) {
    if (Math.hypot(player.x - cell.gx, player.z - cell.gz) > BUILD_RANGE + 1e-6) {
      return { ok: false, reason: 'too-far' };
    }
  }

  const polygon = state.boundary;
  const walkMargin = state.walkMargin ?? WALK_MARGIN;
  for (const cell of cells) {
    if (!cellOnIsland(polygon, cell.gx, cell.gz, walkMargin)) return { ok: false, reason: 'off-island' };
  }

  const { ground, solid } = occupancyMaps(occupancyPieces(state), movingId);
  for (const cell of cells) {
    const key = cellKey(cell.gx, cell.gz);
    if (def.layer === 'ground' && ground.has(key)) return { ok: false, reason: 'occupied-ground' };
    if (def.layer === 'solid' && solid.has(key)) return { ok: false, reason: 'occupied-solid' };
    if (spec.kind === 'soil' && solid.has(key)) return { ok: false, reason: 'occupied-solid' };
    if (def.layer === 'solid' && ground.get(key)?.kind === 'soil') return { ok: false, reason: 'occupied-soil' };
  }

  if (def.solid) {
    let floors = 0;
    for (const cell of cells) {
      if (ground.get(cellKey(cell.gx, cell.gz))?.kind === 'floor') floors += 1;
    }
    if (floors > 0 && floors < cells.length) return { ok: false, reason: 'partial-support' };
  }

  const bounds = footprintBounds(spec.kind, gx, gz, rotation);
  const earth = earthHitsBounds(state.soilPatches, bounds);
  if (earth) {
    return { ok: false, reason: def.layer === 'solid' ? 'occupied-soil' : 'occupied-ground' };
  }

  for (const resource of state.resources || []) {
    if (!resource || resource.phase === 'removed') continue;
    if (!circleHitsAabb(resource.x, resource.z, resource.radius, bounds)) continue;
    if (isCoverableResource(resource)) continue;
    return { ok: false, reason: resource.protected ? 'protected' : 'blocked' };
  }

  if (def.solid && circleHitsAabb(player.x, player.z, KEEPER_RADIUS, bounds)) {
    return { ok: false, reason: 'player' };
  }

  if (!keepsClearingReachable(state, { kind: spec.kind, gx, gz, rotation, movingId })) {
    return { ok: false, reason: 'blocked-home' };
  }

  if (def.requiresWorkbench && !movingId) {
    if (!state.discovery?.workbench) return { ok: false, reason: 'needs-workbench', discovered: false };
    if (!workbenchWithinBuildRange(state, gx, gz, rotation, movingId)) {
      return { ok: false, reason: 'needs-workbench', discovered: true };
    }
  }

  if (!movingId && !canPay(state.inventory, def.cost)) {
    return { ok: false, reason: 'materials', missing: missingCost(state.inventory, def.cost) };
  }

  return { ok: true, gx, gz, rotation, def };
}

export function describePlacement(state, spec) {
  const def = buildingDef(spec.kind);
  const title = def?.label || 'Piece';
  const moving = Boolean(spec.movingId);
  const check = validatePlacement(state, spec);
  const paidText = formatCost(def?.cost);
  const costText = moving ? 'Moving · no extra cost' : (paidText === 'free' ? 'Confirm places this free plot' : `Confirm pays ${paidText}`);
  return {
    ok: check.ok,
    reason: check.reason || null,
    title,
    detail: costText,
    hint: check.ok
      ? (moving ? 'Confirm to move. Cancel leaves it where it is.' : 'Confirm to place. Ghosts spend nothing.')
      : reasonText(check.reason, check),
    canConfirm: check.ok,
    missing: check.missing || null,
  };
}

export function describeStructure(state, id) {
  const live = structureById(state, id);
  const structure = live || soilPatchAsStructure(findSoilPatch(state.soilPatches, id));
  if (!structure) {
    return {
      ok: false, reason: 'missing-target', title: '', detail: '', hint: '',
      canMove: false, canRemove: false, canUse: false,
    };
  }
  const def = buildingDef(structure.kind);
  const deps = dependentsFor(state, structure.id);
  const busy = furnaceBusy(structure);
  const crop = structure.kind === 'soil' ? cropOnSoil(state.crops, structure.id) : null;
  const relocatable = Boolean(live) && CATALOG.includes(live.kind);
  const blocked = deps.length > 0 || busy || Boolean(crop);
  const reason = deps.length ? 'has-dependent' : (busy ? 'station-busy' : (crop ? 'has-crop' : null));
  let hint = 'Move or dismantle. Refunds the original construction cost.';
  if (blocked) hint = reasonText(reason);
  else if (structure.kind === 'soil') {
    hint = 'Work this earth with Gather, Hoe, or Seeds. It cannot be moved from Build.';
  }
  else if (structure.kind === 'workbench') hint = 'Use to upgrade copper tools. Move or dismantle.';
  else if (structure.kind === 'furnace') hint = 'Use to smelt copper. Move or dismantle when empty.';
  return {
    ok: true,
    reason,
    title: def?.label || structure.kind,
    detail: structure.kind === 'soil' ? 'Free plot' : `Paid ${formatCost(structure.paidCost)}`,
    hint,
    canMove: relocatable && !blocked,
    canRemove: relocatable && !blocked,
    canUse: Boolean(def?.station),
    structure,
  };
}

export function placeStructure(state, spec) {
  const check = validatePlacement(state, spec);
  if (!check.ok) return { ok: false, reason: check.reason, events: [] };
  const paid = cloneCost(check.def.cost);
  if (!payCost(state.inventory, paid)) {
    return { ok: false, reason: 'materials', events: [] };
  }
  const structure = {
    id: allocateStructureId(state),
    kind: spec.kind,
    gx: check.gx,
    gz: check.gz,
    rotation: check.rotation,
    paidCost: paid,
  };
  if (structure.kind === 'furnace') Object.assign(structure, emptyFurnaceState());
  state.structures.push(structure);
  if (structure.kind === 'workbench') state.discovery.workbench = true;
  if (structure.kind === 'furnace') state.discovery.furnace = true;
  const events = [{ type: 'placed', id: structure.id, kind: structure.kind, cost: cloneCost(paid) }];
  if (syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
  return { ok: true, events, structure };
}

export function moveStructure(state, spec) {
  const current = structureById(state, spec.id);
  if (!current) return { ok: false, reason: 'missing-target', events: [] };
  const deps = dependentsFor(state, current.id);
  if (deps.length) return { ok: false, reason: 'has-dependent', events: [] };
  if (furnaceBusy(current)) return { ok: false, reason: 'station-busy', events: [] };
  if (current.kind === 'soil' && cropOnSoil(state.crops, current.id)) {
    return { ok: false, reason: 'has-crop', events: [] };
  }
  const check = validatePlacement(state, {
    kind: current.kind,
    gx: spec.gx,
    gz: spec.gz,
    rotation: spec.rotation,
    movingId: current.id,
  });
  if (!check.ok) return { ok: false, reason: check.reason, events: [] };
  current.gx = check.gx;
  current.gz = check.gz;
  current.rotation = check.rotation;
  const events = [{ type: 'moved', id: current.id, kind: current.kind }];
  if (syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
  return { ok: true, events, structure: current };
}

export function removeStructure(state, id) {
  const current = structureById(state, id);
  if (!current) return { ok: false, reason: 'missing-target', events: [] };
  const deps = dependentsFor(state, current.id);
  if (deps.length) return { ok: false, reason: 'has-dependent', events: [] };
  if (furnaceBusy(current)) return { ok: false, reason: 'station-busy', events: [] };
  if (current.kind === 'soil' && cropOnSoil(state.crops, current.id)) {
    return { ok: false, reason: 'has-crop', events: [] };
  }
  const refund = cloneCost(current.paidCost);
  refundCost(state.inventory, refund);
  state.structures = state.structures.filter(item => item.id !== id);
  const events = [{ type: 'removed', id: current.id, kind: current.kind, cost: refund }];
  if (syncObstacles(state)) events.push({ type: 'obstaclesChanged' });
  return { ok: true, events };
}

export function structuresCoverResource(state, resource) {
  return structuresOverlapCircle(state.structures, resource.x, resource.z, resource.radius);
}
