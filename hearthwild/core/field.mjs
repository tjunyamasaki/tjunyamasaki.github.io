import { CROPS, cropDef, cropReady, cropRemainingText, isWildCrop } from '../data/crops.mjs';
import { ITEM_META } from '../data/items.mjs';
import { SOIL_TILL_RANGE } from '../data/tuning.mjs';
import { occupancyPieces, quantizeSoilCoord, tillPreviewOutline } from '../world/soil.mjs';
import { structureById } from './building.mjs';
import {
  cropBySoilId, hoeBrushPoint, inGardenRange, ownsHoe, plotHint, validateHarvestCrop, validatePlant,
  validateSmoothSoil, validateTill, validateUprootCrop,
} from './garden.mjs';
import { describeAction, resourceById } from './resources.mjs';

export const FIELD_MODES = Object.freeze(['gather', 'hoe', 'seeds']);
export const NO_SEEDS_HINT = 'Harvest wild carrots or potatoes to find seeds.';

export function isFieldMode(mode) {
  return FIELD_MODES.includes(mode);
}

export function soilStructures(state) {
  const seen = new Set();
  const list = [];
  for (const piece of occupancyPieces(state)) {
    if (piece?.kind !== 'soil' || seen.has(piece.id)) continue;
    seen.add(piece.id);
    list.push(piece);
  }
  return list;
}

export function soilStructureById(state, id) {
  if (!id) return null;
  const live = structureById(state, id);
  if (live?.kind === 'soil') return live;
  return soilStructures(state).find(item => item.id === id) || null;
}

export function describeSeedChoices(state, selectedSeed = null) {
  const selected = CROPS[selectedSeed] ? selectedSeed : null;
  const seeds = Object.values(CROPS).map(def => {
    const have = state.inventory[def.seed] || 0;
    return {
      species: def.id,
      seed: def.seed,
      label: ITEM_META[def.seed]?.label || def.label,
      have,
      selected: selected === def.id,
      duration: def.duration,
    };
  });
  const owned = seeds.some(seed => seed.have > 0);
  return {
    seeds,
    selectedSeed: selected,
    seedsOwned: owned,
    emptySeedsHint: owned ? '' : NO_SEEDS_HINT,
  };
}

function targetDistance(player, target) {
  if (!player || !target) return Infinity;
  if (target.category === 'resource' || target.kind === 'resource') {
    return Math.hypot(player.x - target.x, player.z - target.z);
  }
  if (target.outline?.length || target.kind === 'soil' || target.category === 'soil') {
    if (inGardenRange(player, target)) {
      return Math.hypot(player.x - (target.x ?? target.gx), player.z - (target.z ?? target.gz));
    }
    return Math.hypot(player.x - (target.x ?? target.gx ?? 0), player.z - (target.z ?? target.gz ?? 0));
  }
  return Math.hypot(player.x - target.x, player.z - target.z);
}

function compareTargets(player, a, b) {
  const da = targetDistance(player, a);
  const db = targetDistance(player, b);
  if (Math.abs(da - db) > 1e-9) return da - db;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function gatherCandidates(state) {
  const list = [];
  for (const resource of state.resources || []) {
    if (!resource || resource.phase === 'removed') continue;
    const info = describeAction(state, resource.id);
    if (!info.canStart) continue;
    list.push({
      category: 'resource',
      id: resource.id,
      x: resource.x,
      z: resource.z,
    });
  }
  for (const structure of soilStructures(state)) {
    const crop = cropBySoilId(state, structure.id);
    if (!crop || !cropReady(crop) || !inGardenRange(state.player, structure)) continue;
    list.push({
      category: 'soil',
      id: structure.id,
      x: structure.x ?? structure.gx,
      z: structure.z ?? structure.gz,
      outline: structure.outline,
      kind: 'soil',
      gx: structure.gx,
      gz: structure.gz,
    });
  }
  list.sort((a, b) => compareTargets(state.player, a, b));
  return list;
}

function seedCandidates(state) {
  const list = [];
  for (const structure of soilStructures(state)) {
    if (cropBySoilId(state, structure.id) || !inGardenRange(state.player, structure)) continue;
    list.push({
      category: 'soil',
      id: structure.id,
      x: structure.x ?? structure.gx,
      z: structure.z ?? structure.gz,
      outline: structure.outline,
      kind: 'soil',
      gx: structure.gx,
      gz: structure.gz,
    });
  }
  list.sort((a, b) => compareTargets(state.player, a, b));
  return list;
}

function selectedGatherKeep(state, input) {
  const resource = resourceById(state, input.selectedResourceId);
  if (resource && resource.phase !== 'removed') {
    return { category: 'resource', id: resource.id, x: resource.x, z: resource.z };
  }
  const structure = soilStructureById(state, input.selectedStructureId);
  if (structure && cropBySoilId(state, structure.id)) {
    return {
      category: 'soil',
      id: structure.id,
      x: structure.x ?? structure.gx,
      z: structure.z ?? structure.gz,
      outline: structure.outline,
      kind: 'soil',
      gx: structure.gx,
      gz: structure.gz,
    };
  }
  return null;
}

function selectedSeedKeep(state, input) {
  const structure = soilStructureById(state, input.selectedStructureId);
  if (!structure || cropBySoilId(state, structure.id)) return null;
  return {
    category: 'soil',
    id: structure.id,
    x: structure.x ?? structure.gx,
    z: structure.z ?? structure.gz,
    outline: structure.outline,
    kind: 'soil',
    gx: structure.gx,
    gz: structure.gz,
  };
}

export function resolveFieldTarget(state, input = {}) {
  const mode = isFieldMode(input.mode) ? input.mode : 'gather';
  if (mode === 'hoe') {
    const aim = input.tillAim;
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) {
      return { category: 'ground', x: aim.x, z: aim.z, explicit: true };
    }
    const brush = hoeBrushPoint(state.player);
    return { category: 'ground', x: brush.x, z: brush.z, explicit: false };
  }
  if (mode === 'seeds') {
    return selectedSeedKeep(state, input) || seedCandidates(state)[0] || null;
  }
  return selectedGatherKeep(state, input) || gatherCandidates(state)[0] || null;
}

function activeVerb(action) {
  if (!action) return '';
  if (action.type === 'till') return 'Tilling';
  if (action.type === 'plantCrop') return 'Planting';
  if (action.type === 'harvestCrop') return 'Harvesting';
  if (action.type === 'uprootCrop') return 'Uprooting';
  if (action.type === 'smoothSoil') return 'Smoothing';
  if (action.type === 'clear') return 'Clearing';
  return 'Gathering';
}

function matchesAction(action, type, targetId) {
  if (!action || action.type !== type) return false;
  if (!targetId) return true;
  return action.targetId === targetId || action.soilId === targetId;
}

function control(verb, check, command, extra = {}) {
  if (check?.reason === 'too-far' && !extra.keepVerb) {
    return {
      verb: 'Walk closer',
      disabled: true,
      hint: plotHint('too-far'),
      reason: 'too-far',
      command: null,
      intendedVerb: verb,
    };
  }
  if (!check?.ok) {
    return {
      verb,
      disabled: true,
      hint: extra.hint || plotHint(check?.reason, check) || extra.fallbackHint || 'That cannot be done now.',
      reason: check?.reason || extra.reason || null,
      command: null,
      intendedVerb: verb,
    };
  }
  return {
    verb,
    disabled: false,
    hint: extra.okHint || extra.hint || '',
    reason: null,
    command,
    intendedVerb: verb,
  };
}

function plantVerb(species) {
  const def = cropDef(species);
  return def ? `Plant ${def.label.toLowerCase()}` : 'Plant';
}

function describeGatherPrimary(state, structure, resource) {
  if (resource) {
    const info = describeAction(state, resource.id);
    const working = state.action && state.action.targetId === resource.id;
    const idleVerb = info.action === 'clear'
      ? 'Clear'
      : (isWildCrop(resource.kind) && info.action === 'harvest' ? 'Harvest' : 'Gather');
    const verb = working ? activeVerb(state.action) : idleVerb;
    if (info.reason === 'too-far') {
      return control(idleVerb, { ok: false, reason: 'too-far' }, null);
    }
    return {
      verb,
      disabled: !info.canStart && !working,
      hint: info.hint,
      reason: info.reason || null,
      command: info.canStart
        ? { type: 'startAction', targetId: resource.id, action: info.action }
        : null,
      intendedVerb: idleVerb,
    };
  }
  if (structure) {
    const crop = cropBySoilId(state, structure.id);
    if (crop) {
      const check = validateHarvestCrop(state, { targetId: structure.id });
      const working = matchesAction(state.action, 'harvestCrop', structure.id);
      return control(working ? 'Harvesting' : 'Harvest', check, {
        type: 'startAction',
        action: 'harvestCrop',
        targetId: structure.id,
      }, {
        okHint: 'Hold Harvest or press E.',
        hint: check.reason === 'immature' ? cropRemainingText(crop) : undefined,
      });
    }
    return control('Gather', { ok: false, reason: 'empty-plot' }, null, {
      hint: 'Empty earth. Use Seeds to plant, or Hoe to smooth.',
    });
  }
  return control('Gather', { ok: false, reason: 'missing-target' }, null, {
    hint: 'Tap a tree, outcrop or plant first.',
  });
}

function describeHoePrimary(state, input) {
  const target = resolveFieldTarget(state, { ...input, mode: 'hoe' });
  const check = validateTill(state, target);
  const working = matchesAction(state.action, 'till');
  const range = Number.isFinite(target?.x) && Number.isFinite(target?.z)
    ? Math.hypot(state.player.x - target.x, state.player.z - target.z) <= SOIL_TILL_RANGE + 1e-6
    : false;
  if (!ownsHoe(state)) {
    return control('Till', { ok: false, reason: 'needs-hoe' }, null);
  }
  if (!range) {
    return control('Till', { ok: false, reason: 'too-far' }, null);
  }
  return control(working ? 'Tilling' : 'Till', check, {
    type: 'startAction',
    action: 'till',
    x: target.x,
    z: target.z,
  }, {
    okHint: target.explicit
      ? 'Hold Till or press E. Earth appears only when the action finishes.'
      : 'Tap grass to aim, or hold Till / E to work the ground ahead.',
  });
}

function describeSeedPrimary(state, input, structure) {
  const seeds = describeSeedChoices(state, input.selectedSeed);
  if (!seeds.selectedSeed) {
    return control('Plant', { ok: false, reason: 'missing-target' }, null, {
      hint: seeds.seedsOwned ? 'Choose carrot or potato seeds.' : NO_SEEDS_HINT,
    });
  }
  const verb = plantVerb(seeds.selectedSeed);
  if (!structure) {
    return control(verb, { ok: false, reason: 'not-soil' }, null, {
      hint: 'Tap empty earth to plant. Seeds do not act on grass.',
    });
  }
  const check = validatePlant(state, { targetId: structure.id, species: seeds.selectedSeed });
  const working = matchesAction(state.action, 'plantCrop', structure.id);
  return control(working ? 'Planting' : verb, check, {
    type: 'startAction',
    action: 'plantCrop',
    targetId: structure.id,
    species: seeds.selectedSeed,
  }, {
    okHint: `Hold ${verb} or press E.`,
    fallbackHint: NO_SEEDS_HINT,
  });
}

function describeSecondary(state, mode, structure) {
  if (!structure) return null;
  const crop = cropBySoilId(state, structure.id);
  if (mode !== 'hoe' && crop) {
    const check = validateUprootCrop(state, { targetId: structure.id });
    const working = matchesAction(state.action, 'uprootCrop', structure.id);
    return control(working ? 'Uprooting' : 'Uproot', check, {
      type: 'startAction',
      action: 'uprootCrop',
      targetId: structure.id,
    }, {
      keepVerb: true,
      okHint: 'Hold Uproot to return one seed. Soil stays.',
    });
  }
  if (mode === 'hoe' && !crop) {
    const check = validateSmoothSoil(state, { targetId: structure.id });
    const working = matchesAction(state.action, 'smoothSoil', structure.id);
    return control(working ? 'Smoothing' : 'Smooth earth', check, {
      type: 'startAction',
      action: 'smoothSoil',
      targetId: structure.id,
    }, {
      keepVerb: true,
      okHint: 'Hold Smooth earth to restore grass.',
    });
  }
  return null;
}

function selectionCopy(mode, state, structure, resource, primary) {
  if (resource) {
    const info = describeAction(state, resource.id);
    return {
      title: `Selected · ${info.title}`,
      detail: `${info.detail}. ${primary.hint || info.hint}`,
      picked: info.title,
    };
  }
  if (structure) {
    const crop = cropBySoilId(state, structure.id);
    if (crop) {
      const def = cropDef(crop.species);
      const title = def?.label || crop.species;
      const remaining = cropRemainingText(crop);
      return {
        title: cropReady(crop) ? `Selected · ${title} · Ready to harvest` : `Selected · ${title}`,
        detail: `${remaining}. ${primary.hint || ''}`.trim(),
        picked: title,
      };
    }
    if (mode === 'hoe') {
      return {
        title: 'Selected · Empty earth',
        detail: primary.hint || 'Hold Smooth earth to restore grass, or till nearby grass.',
        picked: 'Empty earth',
      };
    }
    if (mode === 'seeds') {
      return {
        title: 'Selected · Empty earth',
        detail: primary.hint || 'Hold Plant when a seed is selected.',
        picked: 'Empty earth',
      };
    }
    return {
      title: 'Selected · Empty earth',
      detail: primary.hint || 'Use Seeds to plant, or Hoe to smooth.',
      picked: 'Empty earth',
    };
  }
  if (mode === 'hoe') {
    const verb = state.action?.type === 'till' ? 'Tilling' : (primary.verb || 'Till');
    return {
      title: state.action?.type === 'till' ? 'Tilling' : 'Hoe',
      detail: primary.hint,
      picked: verb,
    };
  }
  if (mode === 'seeds') {
    return {
      title: 'Seeds',
      detail: primary.hint,
      picked: '',
    };
  }
  return {
    title: '',
    detail: primary.hint,
    picked: '',
  };
}

export function describeTillPreview(state, input = {}) {
  const mode = isFieldMode(input.mode) ? input.mode : 'gather';
  if (mode !== 'hoe' || !ownsHoe(state) || state.phase !== 'playing') return null;
  const target = resolveFieldTarget(state, { ...input, mode: 'hoe' });
  const x = quantizeSoilCoord(target?.x);
  const z = quantizeSoilCoord(target?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const outline = tillPreviewOutline(x, z, state.seed, state.nextSoilId);
  if (outline.length < 3) return null;
  const check = validateTill(state, { x, z });
  return {
    x: check.x ?? x,
    z: check.z ?? z,
    outline: check.outline?.length ? check.outline : outline,
    valid: Boolean(check.ok),
    icon: check.ok ? 'till' : 'reject',
    reason: check.reason || null,
  };
}

export function describeFieldDock(state, input = {}) {
  const mode = isFieldMode(input.mode) ? input.mode : 'gather';
  const seeds = describeSeedChoices(state, input.selectedSeed);
  const resource = resourceById(state, input.selectedResourceId);
  const structure = soilStructureById(state, input.selectedStructureId);
  const hoeOwned = ownsHoe(state);
  let primary;
  if (mode === 'hoe') primary = describeHoePrimary(state, input);
  else if (mode === 'seeds') primary = describeSeedPrimary(state, input, structure);
  else primary = describeGatherPrimary(state, structure, resource && resource.phase !== 'removed' ? resource : null);
  const secondary = describeSecondary(state, mode, structure);
  const selection = selectionCopy(mode, state, structure, resource && resource.phase !== 'removed' ? resource : null, primary);
  const seedLabel = seeds.selectedSeed
    ? ITEM_META[CROPS[seeds.selectedSeed].seed]?.label || CROPS[seeds.selectedSeed].label
    : '';
  const modeLabel = mode === 'gather' ? 'Gather' : (mode === 'hoe' ? 'Hoe' : (seedLabel ? `Seeds · ${seedLabel}` : 'Seeds'));
  return {
    mode,
    modeLabel,
    hoeOwned,
    canSelectHoe: hoeOwned,
    ...seeds,
    primary,
    secondary,
    tillPreview: describeTillPreview(state, input),
    selectionTitle: selection.title,
    selectionDetail: selection.detail,
    picked: selection.picked,
  };
}
