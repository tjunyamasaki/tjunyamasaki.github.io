import { advance, applyCommand, createState, resolveMoveInput, restoreState, snapPlayerPose } from './core/state.mjs';
import { generateWorld } from './world/generate.mjs';
import { rollSeedText } from './world/random.mjs';
import { approachPoint, buildNav, findPath, snapWalkable } from './world/navigation.mjs';
import { describeAction, resourceById } from './core/resources.mjs';
import { describePlacement, describeStructure, structureById } from './core/building.mjs';
import { canQueueSmelt, describeHandRecipes, describeStation, furnaceActivity } from './core/stations.mjs';
import { describePlantTree, gardenActivity, ownsHoe, plotHint } from './core/garden.mjs';
import { describeFieldDock, resolveFieldTarget } from './core/field.mjs';
import { findSoilPatch, occupancyPieces, quantizeSoilCoord, soilPatchAsStructure } from './world/soil.mjs';
import { BUILDINGS, CATALOG, buildingDef, formatCost, footprintBounds, footprintCenter, snapBuildCell } from './data/buildings.mjs';
import { CATEGORIES, formatLoot, ITEM_IDS, ITEM_META, TOOL_META } from './data/items.mjs';
import { AUTOSAVE_SECONDS, ZOOM_MAX } from './data/tuning.mjs';
import { viewMovement } from './render/camera.mjs';
import { createGatherFx } from './render/gathering.mjs';
import { getKeeperVariant, setKeeperVariant } from './render/keeper.js';
import { createWorld } from './render/scene.js';
import { createAudio } from './audio.js';
import { createGroundGesture } from './input/gestures.mjs';
import { createSaveStore, readPrefs, writePrefs } from './storage/saves.mjs';
import { renderStationPanel } from './ui/station.mjs';
import { renderHandRecipes, renderSeedStrip, seedStripKey } from './ui/garden.mjs';

const $ = id => document.getElementById(id);
const canvas = $('world');
const intro = $('intro');
const pauseDialog = $('pause');
const confirmNew = $('confirm-new');
const inventoryDialog = $('inventory');
const stationDialog = $('station');
const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
const actionKeys = ['KeyE', 'Space'];

let descriptor = generateWorld('hearthwild-review-a');
let nav = buildNav(descriptor);
let state = createState(descriptor, { name: '' });
let world;
try {
  world = createWorld(canvas, descriptor);
} catch (error) {
  $('loading').hidden = true;
  $('error').hidden = false;
  console.error('Hearthwild renderer unavailable', error);
  throw error;
}

const sound = createAudio();
const gatherFx = createGatherFx();
gatherFx.attach($('game'), canvas);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const keys = new Set();
let saveStore = null;
try {
  saveStore = createSaveStore(window.localStorage);
} catch (error) {
  console.warn('Hearthwild save storage unavailable', error);
}

const prefs = (() => {
  try {
    return readPrefs(window.localStorage, { gatherToggle: false, palette: 'moonlit', avatar: 'cloak' });
  } catch {
    return { gatherToggle: false, palette: 'moonlit', avatar: 'cloak' };
  }
})();
let soundOn = false;
let paused = false;
let failed = false;
let sessionLive = false;
let destination = null;
let route = [];
let selectedId = null;
let selectedStructureId = null;
let catalogOpen = false;
let tillAim = null;
let fieldMode = 'gather';
let selectedSeed = null;
let seedStripOpen = false;
let seedStripKeyValue = '';
let heldControl = null;
let preview = null;
let placementCache = { key: '', info: null };

function placementInfo() {
  if (!preview) return null;
  if (preview.kind === 'sapling') {
    const key = `sapling|${preview.gx}|${preview.gz}|${state.player.x.toFixed(1)}|${state.player.z.toFixed(1)}|${state.inventory.sapling}|${(state.structures || []).map(item => `${item.id}:${item.gx}:${item.gz}`).join(';')}|${(state.soilPatches || []).map(item => `${item.id}:${item.x}:${item.z}`).join(';')}|${(state.resources || []).map(item => `${item.id}:${item.phase}`).join(';')}`;
    if (placementCache.key === key) return placementCache.info;
    const info = describePlantTree(state, preview);
    placementCache = { key, info };
    return info;
  }
  const key = `${preview.kind}|${preview.gx}|${preview.gz}|${preview.rotation}|${preview.movingId || ''}|${state.player.x.toFixed(1)}|${state.player.z.toFixed(1)}|${state.inventory.wood}|${state.inventory.stone}|${state.discovery?.workbench}|${(state.structures || []).map(item => `${item.id}:${item.gx}:${item.gz}:${item.rotation}`).join(';')}|${(state.soilPatches || []).map(item => `${item.id}:${item.x}:${item.z}`).join(';')}|${(state.resources || []).map(item => `${item.id}:${item.phase}`).join(';')}`;
  if (placementCache.key === key) return placementCache.info;
  const info = describePlacement(state, preview);
  placementCache = { key, info };
  return info;
}
let gatherToggle = Boolean(prefs.gatherToggle);
let gatheringHeld = false;
let pendingTitleReplace = false;
let dirty = false;
let saveStatus = 'unsaved';
let lastSaveElapsed = -Infinity;
let harvestSaveAt = 0;
let time = 0;
let last = performance.now();
let leftover = 0;
let toastUntil = 0;
let zoom = 1;
let cameraDrag = null;
let cameraMode = 'walk';

function editingField(targetEl) {
  return targetEl instanceof HTMLElement && targetEl.closest('input, textarea, select, [contenteditable="true"]');
}

function selectedResource() {
  return selectedId ? resourceById(state, selectedId) : null;
}

function selectedStructure() {
  if (!selectedStructureId) return null;
  return structureById(state, selectedStructureId)
    || soilPatchAsStructure(findSoilPatch(state.soilPatches, selectedStructureId));
}

function liveSelectedStructure() {
  return selectedStructureId ? structureById(state, selectedStructureId) : null;
}

function fieldInput() {
  return {
    mode: fieldMode,
    selectedSeed,
    selectedResourceId: selectedId,
    selectedStructureId,
    tillAim,
  };
}

function fieldDock() {
  return describeFieldDock(state, fieldInput());
}

function closeSeedStrip() {
  seedStripOpen = false;
  seedStripKeyValue = '';
  $('seed-strip').hidden = true;
}

function refreshSeedStrip() {
  const strip = $('seed-strip');
  if (!seedStripOpen || fieldMode !== 'seeds' || preview) {
    strip.hidden = true;
    return;
  }
  const view = fieldDock();
  const key = seedStripKey(view);
  strip.hidden = false;
  if (key === seedStripKeyValue) return;
  seedStripKeyValue = key;
  renderSeedStrip(strip, view, species => selectSeed(species));
}

function cancelFieldWork(reason = 'switched') {
  heldControl = null;
  gatheringHeld = false;
  const stopped = applyCommand(state, { type: 'stopAction' });
  handleSimEvents(stopped.events);
  return reason;
}

function clearPendingMove() {
  destination = null;
  route = [];
}

function setFieldMode(mode, options = {}) {
  if (mode === 'hoe' && !ownsHoe(state)) {
    showToast(plotHint('needs-hoe'));
    return;
  }
  const changed = mode !== fieldMode;
  if (changed) {
    fieldMode = mode;
    clearPendingMove();
    cancelFieldWork('mode');
  }
  if (mode === 'seeds') {
    const openStrip = options.openStrip !== false;
    if (openStrip) {
      if (!changed) cancelFieldWork('strip');
      seedStripOpen = true;
      seedStripKeyValue = '';
    }
  } else {
    closeSeedStrip();
  }
  if (mode !== 'hoe') tillAim = null;
  refreshSeedStrip();
  refreshDocks();
  refreshMeta();
}

function selectSeed(species) {
  if (selectedSeed !== species) cancelFieldWork('seed');
  selectedSeed = species;
  closeSeedStrip();
  refreshDocks();
  refreshMeta();
}

function syncWorldStructures() {
  world.syncStructures(occupancyPieces(state));
}

function selectionMarker() {
  if (preview) {
    const kind = preview.kind === 'sapling' ? 'soil' : preview.kind;
    const center = footprintCenter(kind, preview.gx, preview.gz, preview.rotation);
    const bounds = footprintBounds(kind, preview.gx, preview.gz, preview.rotation);
    const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
    if (!Number.isFinite(center.x) || !Number.isFinite(center.z) || !Number.isFinite(radius)) return null;
    return { x: center.x, z: center.z, radius: Math.min(4, Math.max(0.3, radius)) };
  }
  const structure = selectedStructure();
  if (structure) {
    const center = Number.isFinite(structure.x) && Number.isFinite(structure.z)
      ? { x: structure.x, z: structure.z }
      : footprintCenter(structure.kind, structure.gx, structure.gz, structure.rotation);
    const bounds = footprintBounds(structure.kind, structure.gx, structure.gz, structure.rotation);
    const radius = structure.outline?.length
      ? 0.5
      : Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
    if (!Number.isFinite(center.x) || !Number.isFinite(center.z) || !Number.isFinite(radius)) return null;
    return { x: center.x, z: center.z, radius: Math.min(4, Math.max(0.3, radius)) };
  }
  if (fieldMode === 'hoe') {
    const target = resolveFieldTarget(state, fieldInput());
    if (Number.isFinite(target?.x) && Number.isFinite(target?.z)) {
      return { x: target.x, z: target.z, radius: 0.48, hideRing: true };
    }
  }
  return selectedResource();
}

function refreshBuildView() {
  if (!preview) {
    world.setBuildView({ active: catalogOpen, ghost: null, hideId: null });
    return;
  }
  const info = placementInfo();
  world.setBuildView({
    active: true,
    hideId: preview.movingId || null,
    ghost: {
      kind: preview.kind,
      gx: preview.gx,
      gz: preview.gz,
      rotation: preview.rotation,
      valid: Boolean(info?.ok),
    },
  });
}

function refreshDocks() {
  const previewing = Boolean(preview);
  const structure = !previewing && selectedStructure();
  const live = !previewing && liveSelectedStructure();
  const info = structure ? describeStructure(state, structure.id) : null;
  const soil = structure?.kind === 'soil';
  const station = Boolean(info?.canUse && !soil);
  const dock = !previewing ? fieldDock() : null;
  $('field-modes').hidden = previewing;
  $('field-mode-label').hidden = previewing;
  $('field-mode-gather').setAttribute('aria-pressed', String(fieldMode === 'gather'));
  $('field-mode-hoe').setAttribute('aria-pressed', String(fieldMode === 'hoe'));
  $('field-mode-hoe').setAttribute('aria-disabled', String(!ownsHoe(state)));
  $('field-mode-seeds').setAttribute('aria-pressed', String(fieldMode === 'seeds'));
  if (dock) $('field-mode-label').textContent = dock.modeLabel;
  refreshSeedStrip();
  $('inventory-open').hidden = previewing;
  $('build-open').hidden = previewing;
  $('gather').hidden = previewing || station;
  const secondary = dock?.secondary;
  $('field-secondary').hidden = previewing || !secondary;
  if (secondary) {
    $('field-secondary').textContent = secondary.verb;
    $('field-secondary').disabled = secondary.disabled;
  }
  $('structure-use').hidden = !station;
  $('structure-use').textContent = 'Use';
  $('structure-move').hidden = !live || soil;
  $('structure-remove').hidden = !live || soil;
  $('structure-move').disabled = Boolean(structure) && !info?.canMove;
  $('structure-remove').disabled = Boolean(structure) && !info?.canRemove;
  $('build-cancel').hidden = !previewing;
  $('build-rotate').hidden = !previewing || preview?.kind === 'sapling';
  $('build-confirm').hidden = !previewing;
  if (previewing) {
    const placement = placementInfo();
    $('build-confirm').disabled = !placement?.canConfirm;
  }
  world.setTillPreview?.(previewing || catalogOpen ? null : dock?.tillPreview || null);
}

function closeCatalog() {
  catalogOpen = false;
  $('build-catalog').hidden = true;
  if (!preview) world.setBuildView({ active: false, ghost: null, hideId: null });
}

function cancelPreview() {
  preview = null;
  placementCache = { key: '', info: null };
  refreshBuildView();
  refreshDocks();
}

function enterBuildMode() {
  closeSeedStrip();
  clearInput();
  destination = null;
  route = [];
}

function renderCatalog() {
  const list = $('build-catalog-list');
  list.replaceChildren();
  for (const kind of CATALOG) {
    const def = BUILDINGS[kind];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'build-piece';
    const owned = Object.entries(def.cost).map(([id, amount]) => `${state.inventory[id] || 0}/${amount} ${ITEM_META[id]?.short || id}`).join(' · ');
    const cell = snapBuildCell(state.player.x, state.player.z);
    const info = describePlacement(state, { kind, gx: cell.gx, gz: cell.gz, rotation: 0 });
    const extra = info.ok ? '' : ` · ${info.hint}`;
    button.innerHTML = `${def.label}<span class="cost">${formatCost(def.cost)} · bag ${owned}${extra}</span>`;
    button.addEventListener('click', () => choosePiece(kind));
    list.append(button);
  }
}

function openCatalog() {
  if (state.phase !== 'playing' || failed || intro.open || paused) return;
  if (inventoryDialog.open) closeInventory();
  cancelPreview();
  enterBuildMode();
  catalogOpen = true;
  renderCatalog();
  $('build-catalog').hidden = false;
  world.setBuildView({ active: true, ghost: null, hideId: null });
  refreshDocks();
  refreshMeta();
}

function choosePiece(kind) {
  closeCatalog();
  enterBuildMode();
  const cell = snapBuildCell(state.player.x, state.player.z);
  preview = { kind, gx: cell.gx, gz: cell.gz, rotation: 0, movingId: null };
  selectedId = null;
  selectedStructureId = null;
  refreshBuildView();
  refreshDocks();
  refreshMeta();
}

function confirmPreview() {
  if (!preview) return;
  const info = placementInfo();
  if (!info?.canConfirm) {
    showToast(info?.hint || 'This spot will not take that piece.');
    return;
  }
  const command = preview.movingId
    ? { type: 'move', id: preview.movingId, gx: preview.gx, gz: preview.gz, rotation: preview.rotation }
    : preview.kind === 'sapling'
      ? { type: 'plantTree', gx: preview.gx, gz: preview.gz }
      : { type: 'place', kind: preview.kind, gx: preview.gx, gz: preview.gz, rotation: preview.rotation };
  const result = applyCommand(state, command);
  handleSimEvents(result.events);
  if (!result.ok) {
    showToast(info.hint);
    refreshBuildView();
    refreshMeta();
    return;
  }
  if (preview.movingId) {
    selectedStructureId = preview.movingId;
    cancelPreview();
  } else {
    refreshBuildView();
  }
  refreshDocks();
  refreshMeta();
}

function startSaplingPreview() {
  if (state.phase !== 'playing' || failed || intro.open) return;
  if ((state.inventory.sapling || 0) < 1) {
    showToast(plotHint('no-sapling'));
    return;
  }
  closeInventory();
  choosePiece('sapling');
}

function rotatePreview() {
  if (!preview) return;
  preview.rotation = (preview.rotation + 1) % 4;
  refreshBuildView();
  refreshDocks();
  refreshMeta();
}

function startMove() {
  const structure = selectedStructure();
  if (!structure) return;
  const info = describeStructure(state, structure.id);
  if (!info.canMove) {
    showToast(info.hint);
    return;
  }
  closeCatalog();
  enterBuildMode();
  preview = {
    kind: structure.kind,
    gx: structure.gx,
    gz: structure.gz,
    rotation: structure.rotation,
    movingId: structure.id,
  };
  refreshBuildView();
  refreshDocks();
  refreshMeta();
}

function dismantleSelected() {
  const structure = selectedStructure();
  if (!structure) return;
  const info = describeStructure(state, structure.id);
  if (!info.canRemove) {
    showToast(info.hint);
    return;
  }
  const result = applyCommand(state, { type: 'remove', id: structure.id });
  handleSimEvents(result.events);
  if (!result.ok) {
    showToast(info.hint);
    refreshMeta();
    return;
  }
  selectedStructureId = null;
  refreshDocks();
  refreshMeta();
}

function stationOpen() {
  return Boolean(stationDialog?.open);
}

function stationReasonText(reason) {
  if (reason === 'too-far') return 'Walk closer. Station reach is two paces, with a clear approach.';
  if (reason === 'blocked-access') return 'There is no clear approach to this station.';
  if (reason === 'queue-full') return 'The furnace can hold 10 unfinished batches.';
  if (reason === 'materials') return 'Need more materials in the bag.';
  if (reason === 'active-locked') return 'The batch already in the fire cannot be canceled.';
  if (reason === 'empty-output') return 'Nothing is waiting to collect.';
  if (reason === 'owned') return 'You already have that tool.';
  if (reason === 'needs-ingot') return 'Smelt a copper ingot first.';
  if (reason === 'needs-harvest') return 'Harvest a crop first.';
  if (reason === 'no-flower') return 'Only leftover moonflowers convert to fiber.';
  if (reason === 'station-busy') return 'Empty the furnace first.';
  return 'That cannot be done now.';
}

function refreshStationPanel() {
  if (!stationOpen()) return;
  const structure = selectedStructure();
  if (!structure) {
    closeStation();
    return;
  }
  const view = describeStation(state, structure.id, { checkAccess: true });
  $('station-title').textContent = view.title || 'Station';
  $('station-copy').textContent = view.pauseNote;
  renderStationPanel($('station-body'), view, {
    inventory: state.inventory,
    canQueue: (recipeId, count) => canQueueSmelt(state, { structureId: structure.id, recipeId, count }),
    queue: (recipeId, count) => runStationCommand({ type: 'queueSmelt', structureId: structure.id, recipeId, count }),
    cancelBatch: batchId => runStationCommand({ type: 'cancelBatch', structureId: structure.id, batchId }),
    collect: () => runStationCommand({ type: 'collectOutput', structureId: structure.id }),
    craft: recipeId => runStationCommand({ type: 'craft', structureId: structure.id, recipeId }),
  });
}

function runStationCommand(command) {
  const result = applyCommand(state, command);
  handleSimEvents(result.events);
  if (!result.ok) showToast(stationReasonText(result.reason));
  refreshStationPanel();
  refreshMeta();
}

function openStation() {
  if (state.phase !== 'playing' || failed || intro.open || preview) return;
  const structure = selectedStructure();
  const info = structure ? describeStructure(state, structure.id) : null;
  if (!info?.canUse) return;
  closeCatalog();
  if (inventoryDialog.open) inventoryDialog.close();
  cancelPreview();
  paused = true;
  clearInput();
  leftover = 0;
  last = performance.now();
  sound.pause(true);
  if (!stationDialog.open) stationDialog.showModal();
  refreshStationPanel();
  refreshMeta();
}

function closeStation(resume = true) {
  if (stationDialog.open) stationDialog.close();
  if (!resume) return;
  if (!pauseDialog.open && !confirmNew.open && !inventoryDialog.open && sessionLive) {
    paused = false;
    leftover = 0;
    last = performance.now();
    sound.pause(document.hidden);
    canvas.focus({ preventScroll: true });
  }
}

function persistPrefs() {
  writePrefs(window.localStorage, { gatherToggle, palette: world.palette, avatar: getKeeperVariant() });
}

function clearInput() {
  cameraDrag = null;
  keys.clear();
  destination = null;
  route = [];
  gatheringHeld = false;
  heldControl = null;
  const cancelled = applyCommand(state, { type: 'cancelInput' });
  world?.handleGatherEvents?.(cancelled.events, state);
  gesture?.clear();
}

function setPaused(value) {
  paused = value;
  if (value) {
    cancelPreview();
    closeCatalog();
    closeSeedStrip();
    if (stationOpen()) closeStation(false);
  }
  clearInput();
  leftover = 0;
  last = performance.now();
  sound.pause(value || document.hidden);
}

function showToast(message, duration = 4) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastUntil = time + duration;
}

function worldCaption() {
  const name = state.worldName || 'Unnamed island';
  return `${name} · Seed ${state.seed}`;
}

function saveStatusText() {
  if (!saveStore) return 'Saving unavailable';
  if (saveStatus === 'failed') return 'Couldn’t save';
  if (saveStatus === 'saved') return 'Saved';
  if (saveStatus === 'recovered') return 'Restored last good';
  return 'Unsaved';
}

function bagSummary() {
  const bag = state.inventory;
  return `Wood ${bag.wood} · Stone ${bag.stone} · Ore ${bag.copperOre} · Ingots ${bag.copperIngot} · Seeds ${(bag.carrotSeed || 0) + (bag.potatoSeed || 0)} · Saplings ${bag.sapling}`;
}

function refreshContinue() {
  const peek = saveStore?.peek();
  const available = Boolean(peek?.ok);
  $('continue').hidden = !available;
  $('continue-note').hidden = !available;
  if (available) {
    const name = peek.name || 'Unnamed island';
    $('continue').innerHTML = `Continue ${name} <span>↗</span>`;
    $('continue-note').textContent = peek.recovered
      ? `Last good island restored · Seed ${peek.seed}`
      : `Saved island · Seed ${peek.seed}`;
  }
}

function refreshMeta() {
  $('world-meta').textContent = worldCaption();
  $('bag-summary').textContent = bagSummary();
  const activity = furnaceActivity(state);
  $('station-activity').hidden = !activity;
  $('station-activity').textContent = activity;
  const garden = gardenActivity(state);
  $('garden-activity').hidden = !garden;
  $('garden-activity').textContent = garden;
  $('save-status').textContent = saveStatusText();
  $('save-status').classList.toggle('failed', saveStatus === 'failed');
  $('pause-save-status').textContent = saveStatus === 'failed'
    ? 'Could not write a save. The last good island is still kept in this browser.'
    : `${saveStatusText()}. Pause, harvests and ten seconds of walking also autosave.`;
  $('pause-seed').textContent = `${worldCaption()}. Gold rings mark protected supply. The rim is safe.`;
  $('gather-mode').setAttribute('aria-pressed', String(gatherToggle));
  $('gather-mode').innerHTML = `Gather <span>${gatherToggle ? 'tap' : 'hold'}</span>`;
  refreshDocks();
  if (preview) {
    const info = placementInfo();
    $('selection').hidden = false;
    $('selection').textContent = `${info?.title || 'Piece'} · ghost`;
    $('selection-detail').hidden = false;
    $('selection-detail').textContent = `${info?.detail || ''}. ${info?.hint || ''}`.trim();
    $('picked').hidden = false;
    $('picked').textContent = info?.ok ? info.title : (info?.hint || 'This spot will not take that piece.');
    $('action-progress').hidden = true;
    return;
  }
  const dock = fieldDock();
  const structure = selectedStructure();
  const station = structure && structure.kind !== 'soil';
  const progress = state.action ? Math.min(1, state.action.elapsed / state.action.duration) : 0;
  $('gather').textContent = dock.primary.verb;
  $('gather').disabled = dock.primary.disabled && !state.action;
  if (dock.secondary) {
    $('field-secondary').textContent = dock.secondary.verb;
    $('field-secondary').disabled = dock.secondary.disabled && state.action?.type !== 'uprootCrop' && state.action?.type !== 'smoothSoil';
  }
  if (station) {
    const info = describeStructure(state, structure.id);
    $('selection').hidden = false;
    $('selection').textContent = `Selected · ${info.title}`;
    $('selection-detail').hidden = false;
    $('selection-detail').textContent = `${info.detail}. ${info.hint}`;
    $('picked').hidden = false;
    $('picked').textContent = info.title;
    $('action-progress').hidden = !state.action;
    $('action-progress-fill').style.width = `${Math.round(progress * 100)}%`;
    return;
  }
  if (dock.selectionTitle) {
    $('selection').hidden = false;
    $('selection').textContent = dock.selectionTitle;
    $('selection-detail').hidden = false;
    $('selection-detail').textContent = dock.selectionDetail;
    $('picked').hidden = !dock.picked;
    if (dock.picked) $('picked').textContent = dock.picked;
  } else {
    $('selection').hidden = true;
    $('selection-detail').hidden = true;
    $('picked').hidden = true;
  }
  $('action-progress').hidden = !state.action;
  $('action-progress-fill').style.width = `${Math.round(progress * 100)}%`;
}

function placePickedLabel() {
  const label = $('picked');
  const marker = selectionMarker();
  if (!marker || paused || state.phase !== 'playing') {
    label.hidden = true;
    return;
  }
  const height = preview || selectedStructure()?.kind === 'workbench' || selectedStructure()?.kind === 'furnace'
    ? 1.15
    : (selectedStructure() ? 0.45 : (marker.hideRing ? 0.28 : 1.15));
  const point = world.project(marker.x, height, marker.z);
  if (!point.visible) {
    label.hidden = true;
    return;
  }
  label.hidden = false;
  label.style.left = `${point.x}px`;
  label.style.top = `${point.y}px`;
}

function rebuildNav() {
  nav = buildNav(descriptor, state.obstacles);
  if (!destination) {
    route = [];
    return;
  }
  const path = findPath(nav, state.player, destination);
  if (!path) {
    showToast('That path is no longer open.');
    destination = null;
    route = [];
    return;
  }
  route = path;
}

function relocateIfNeeded() {
  const safe = snapWalkable(nav, state.player.x, state.player.z);
  if (!safe) {
    state.player.x = state.clearing.x;
    state.player.z = state.clearing.z;
  } else {
    state.player.x = safe.x;
    state.player.z = safe.z;
  }
  state.player.moving = false;
  snapPlayerPose(state);
}

function handleSimEvents(events) {
  let navDirty = false;
  world.handleGatherEvents?.(events, state);
  for (const event of events || []) {
    if ((event.type === 'harvested' || event.type === 'cleared') && !motion.matches) {
      gatherFx.burst(state.player, resourceById(state, event.id), event.kind, event.type === 'cleared' ? 'clear' : 'complete');
    }
    if (event.type === 'uprooted' && !motion.matches) {
      const origin = Number.isFinite(event.x) && Number.isFinite(event.z)
        ? { x: event.x, z: event.z, radius: 0.38, kind: event.species }
        : null;
      gatherFx.burst(state.player, origin, event.species, 'uproot');
    }
    sound.event(event);
    if (event.type === 'harvested') {
      showToast(formatLoot(event.items) || 'Gathered.', 3);
      dirty = true;
      harvestSaveAt = time + 0.8;
    }
    if (event.type === 'cleared') {
      const refunded = Object.values(event.items || {}).some(value => value > 0);
      showToast(refunded ? formatLoot(event.items) : 'Cleared.', 2);
      dirty = true;
      harvestSaveAt = time + 0.8;
    }
    if (event.type === 'placed') {
      showToast(`Placed ${buildingDef(event.kind)?.label || 'piece'}.`, 2);
      dirty = true;
      harvestSaveAt = time + 0.5;
    }
    if (event.type === 'planted') {
      showToast('Planted.', 2);
      dirty = true;
      harvestSaveAt = time + 0.5;
    }
    if (event.type === 'tilled') {
      showToast('Tilled.', 2);
      dirty = true;
      harvestSaveAt = time + 0.5;
    }
    if (event.type === 'smoothed') {
      showToast('Smoothed.', 2);
      dirty = true;
      harvestSaveAt = time + 0.5;
    }
    if (event.type === 'plantedTree') {
      showToast('Sapling planted.', 2);
      dirty = true;
      harvestSaveAt = time + 0.5;
    }
    if (event.type === 'harvestedCrop') {
      showToast(formatLoot(event.items) || 'Harvested.', 3);
      dirty = true;
      harvestSaveAt = time + 0.8;
    }
    if (event.type === 'uprooted') {
      showToast(formatLoot(event.items) || 'Uprooted.', 2);
      dirty = true;
      harvestSaveAt = time + 0.5;
    }
    if (event.type === 'cropReady') {
      showToast('A crop is ready.', 3);
    }
    if (event.type === 'treeGrown') {
      showToast('A planted tree matured.', 3);
      dirty = true;
    }
    if (event.type === 'moved') {
      showToast('Moved.', 2);
      dirty = true;
      harvestSaveAt = time + 0.5;
    }
    if (event.type === 'removed') {
      const refunded = Object.values(event.cost || {}).some(value => value > 0);
      showToast(refunded ? `Returned ${formatCost(event.cost)}.` : 'Dismantled.', 3);
      dirty = true;
      harvestSaveAt = time + 0.5;
    }
    if (event.type === 'queued') {
      showToast(`Queued ${event.count} ${event.count === 1 ? 'ingot' : 'ingots'}.`, 2);
      dirty = true;
      harvestSaveAt = time + 0.4;
    }
    if (event.type === 'smelted') {
      showToast('An ingot finished at the furnace.', 3);
      dirty = true;
      harvestSaveAt = time + 0.4;
    }
    if (event.type === 'collected') {
      showToast(formatLoot(event.items) || 'Collected.', 3);
      dirty = true;
      harvestSaveAt = time + 0.4;
    }
    if (event.type === 'crafted') {
      if (event.equipment) showToast(`${TOOL_META[event.equipment]?.label || 'Tool'} is ready.`, 3);
      else showToast(formatLoot(event.items) || 'Crafted.', 3);
      dirty = true;
      harvestSaveAt = time + 0.4;
    }
    if (event.type === 'batchCancelled') {
      showToast(event.cost ? `Returned ${formatCost(event.cost)}.` : 'Canceled.', 2);
      dirty = true;
      harvestSaveAt = time + 0.4;
    }
    if (event.type === 'renewed' || event.type === 'obstaclesChanged' || event.type === 'harvested' || event.type === 'cleared' || event.type === 'placed' || event.type === 'moved' || event.type === 'removed' || event.type === 'planted' || event.type === 'plantedTree' || event.type === 'harvestedCrop' || event.type === 'uprooted' || event.type === 'tilled' || event.type === 'smoothed' || event.type === 'treeGrown' || event.type === 'cropGrew' || event.type === 'cropReady') {
      navDirty = true;
      dirty = true;
    }
    if (event.type === 'queued' || event.type === 'smelted' || event.type === 'collected' || event.type === 'crafted' || event.type === 'batchCancelled') {
      syncWorldStructures();
    }
  }
  if (navDirty) {
    placementCache = { key: '', info: null };
    rebuildNav();
    world.syncResources(state.resources);
    syncWorldStructures();
    if (selectedId && !resourceById(state, selectedId)) selectedId = null;
    if (selectedStructureId && !selectedStructure()) selectedStructureId = null;
    const resource = selectedResource();
    if (resource?.phase === 'removed') selectedId = null;
    refreshBuildView();
  }
}

function persist(reason) {
  if (!saveStore || state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
  const result = saveStore.write(descriptor, state);
  if (result.ok) {
    dirty = false;
    lastSaveElapsed = state.elapsed;
    saveStatus = 'saved';
    refreshContinue();
  } else {
    saveStatus = 'failed';
    if (reason !== 'autosave') {
      showToast('Could not save. The last good island is still kept.');
    }
  }
  refreshMeta();
  return result;
}

function maybeAutosave() {
  if (!sessionLive || paused || state.phase !== 'playing' || !saveStore) return;
  if (harvestSaveAt && time >= harvestSaveAt) {
    harvestSaveAt = 0;
    persist('harvest');
    return;
  }
  if (state.elapsed - lastSaveElapsed >= AUTOSAVE_SECONDS) persist('autosave');
}

function renderInventory() {
  const body = $('inventory-body');
  body.replaceChildren();
  for (const category of CATEGORIES) {
    const section = document.createElement('section');
    section.className = 'inventory-category';
    const heading = document.createElement('h3');
    heading.textContent = category.label;
    section.append(heading);
    if (category.id === 'tools') {
      for (const [id, meta] of Object.entries(TOOL_META)) {
        const row = document.createElement('div');
        row.className = 'inventory-row';
        const name = document.createElement('span');
        name.textContent = meta.label;
        const value = document.createElement('span');
        value.className = 'inventory-count';
        value.textContent = state.equipment[id] ? 'Owned' : '—';
        row.append(name, value);
        section.append(row);
      }
    } else {
      for (const id of ITEM_IDS) {
        if (ITEM_META[id].category !== category.id) continue;
        if (id === 'moonflower' && !(state.inventory[id] > 0)) continue;
        const row = document.createElement('div');
        row.className = 'inventory-row';
        const name = document.createElement('span');
        name.textContent = ITEM_META[id].label;
        const value = document.createElement('span');
        value.className = 'inventory-count';
        value.textContent = String(state.inventory[id] || 0);
        row.append(name, value);
        if (id === 'sapling') {
          const plant = document.createElement('button');
          plant.type = 'button';
          plant.className = 'quiet inventory-plant';
          plant.textContent = 'Plant';
          plant.disabled = !(state.inventory.sapling > 0);
          plant.addEventListener('click', startSaplingPreview);
          row.append(plant);
        }
        section.append(row);
      }
    }
    body.append(section);
  }
  const recipes = describeHandRecipes(state);
  const garden = document.createElement('section');
  garden.className = 'inventory-category';
  const heading = document.createElement('h3');
  heading.textContent = 'Hand recipes';
  garden.append(heading);
  const copy = document.createElement('p');
  copy.className = 'small';
  copy.textContent = 'These use the bag immediately. No workbench or furnace. This panel pauses growth.';
  garden.append(copy);
  renderHandRecipes(garden, recipes, state.inventory, recipeId => {
    const result = applyCommand(state, { type: 'craft', recipeId });
    handleSimEvents(result.events);
    if (!result.ok) showToast(stationReasonText(result.reason));
    renderInventory();
    refreshMeta();
  });
  body.append(garden);
}

function openInventory() {
  if (state.phase !== 'playing' || failed || intro.open) return;
  cancelPreview();
  closeCatalog();
  closeStation(false);
  setPaused(true);
  renderInventory();
  if (!inventoryDialog.open) inventoryDialog.showModal();
  refreshMeta();
}

function closeInventory() {
  if (inventoryDialog.open) inventoryDialog.close();
  if (!pauseDialog.open && !confirmNew.open && !stationOpen() && sessionLive) {
    setPaused(false);
    canvas.focus({ preventScroll: true });
  }
}

function openPause() {
  if (state.phase === 'intro' || failed) return;
  if (inventoryDialog.open) closeInventory();
  closeStation(false);
  setPaused(true);
  persist('pause');
  refreshMeta();
  if (!pauseDialog.open) pauseDialog.showModal();
}

function closePause() {
  pauseDialog.close();
  if (!inventoryDialog.open && !confirmNew.open && !stationOpen()) setPaused(false);
  canvas.focus({ preventScroll: true });
}

function setPalette(value) {
  const palette = world.setPalette(value);
  document.documentElement.dataset.palette = palette;
  document.querySelector('meta[name="theme-color"]').content = palette === 'ember' ? '#100908' : '#080f20';
  $('palette').value = palette;
  $('pause-palette').value = palette;
  persistPrefs();
}

function setAvatar(value) {
  const avatar = setKeeperVariant(value);
  $('avatar').value = avatar;
  $('pause-avatar').value = avatar;
  persistPrefs();
}

function setZoom(value) {
  zoom = world.setZoom(value);
  $('zoom-fit').textContent = `${zoom.toFixed(1)}×`;
  $('zoom-out').disabled = zoom <= 1;
  $('zoom-in').disabled = zoom >= ZOOM_MAX;
}

function failure(message) {
  failed = true;
  cancelPreview();
  closeCatalog();
  clearInput();
  sound.pause(true);
  for (const dialog of [intro, pauseDialog, confirmNew, inventoryDialog, stationDialog]) dialog.close();
  closeCatalog();
  $('error-message').textContent = message;
  $('error').hidden = false;
  $('loading').hidden = true;
}

function mountWorld(nextDescriptor, nextState) {
  const palette = world.palette;
  const previousZoom = zoom;
  clearInput();
  selectedId = null;
  selectedStructureId = null;
  tillAim = null;
  catalogOpen = false;
  fieldMode = 'gather';
  selectedSeed = null;
  closeSeedStrip();
  heldControl = null;
  $('build-catalog').hidden = true;
  if (stationDialog.open) stationDialog.close();
  preview = null;
  leftover = 0;
  last = performance.now();
  descriptor = nextDescriptor;
  state = nextState;
  nav = buildNav(descriptor, state.obstacles);
  relocateIfNeeded();
  gatherFx.clear();
  world.dispose();
  world = createWorld(canvas, descriptor);
  world.syncResources(state.resources);
  syncWorldStructures();
  world.setBuildView({ active: false, ghost: null, hideId: null });
  world.resize();
  setPalette(palette);
  setZoom(previousZoom);
  refreshMeta();
}

function enterPlaying(options = {}) {
  sessionLive = true;
  paused = false;
  $('intro-cancel').hidden = true;
  $('hud').hidden = false;
  $('zoom-controls').hidden = false;
  $('action-dock').hidden = false;
  $('save-status').hidden = false;
  intro.close();
  canvas.focus({ preventScroll: true });
  clearInput();
  leftover = 0;
  last = performance.now();
  sound.pause(document.hidden);
  if (options.toast) showToast(options.toast, 5);
  refreshMeta();
}

function enterClearing() {
  const result = applyCommand(state, { type: 'enter' });
  if (!result.ok) return;
  handleSimEvents(result.events);
  dirty = true;
  enterPlaying({ toast: `Seed ${state.seed}. Stone tools are yours. Find wild carrots and potatoes for seeds.` });
  persist('enter');
}

function continueSaved() {
  if (!saveStore) {
    showToast('Saving is unavailable in this browser.');
    return;
  }
  const result = saveStore.read();
  if (!result.ok) {
    showToast('No readable island is saved here.');
    refreshContinue();
    return;
  }
  mountWorld(result.data.descriptor, restoreState(result.data.descriptor, result.data.gameplay));
  dirty = false;
  lastSaveElapsed = state.elapsed;
  saveStatus = result.recovered ? 'recovered' : 'saved';
  enterPlaying({
    toast: result.recovered
      ? `Restored the last good island · Seed ${state.seed}`
      : `Welcome back · Seed ${state.seed}`,
  });
}

function startFreshWorld() {
  const name = $('world-name').value.trim().slice(0, 32);
  let seed = $('world-seed').value.trim().slice(0, 64);
  if (!seed) {
    seed = rollSeedText();
    $('world-seed').value = seed;
  }
  pendingTitleReplace = false;
  const next = generateWorld(seed);
  mountWorld(next, createState(next, { name }));
  enterClearing();
}

function requestNewWorldFromTitle() {
  const peek = saveStore?.peek();
  if (peek?.ok) {
    pendingTitleReplace = true;
    $('confirm-new-copy').textContent = 'A saved island already exists. Starting a new one keeps that save until this new island writes successfully.';
    if (!confirmNew.open) confirmNew.showModal();
    return;
  }
  startFreshWorld();
}

function openNewWorldForm() {
  $('intro-cancel').hidden = !sessionLive;
  if (!intro.open) intro.showModal();
  $('world-name').focus();
}

function applyKeyboardTarget() {
  const resolved = resolveFieldTarget(state, fieldInput());
  if (!resolved) return;
  if (resolved.category === 'resource' && resolved.id !== selectedId) {
    cancelFieldWork('target');
    selectedId = resolved.id;
    selectedStructureId = null;
    tillAim = null;
  }
  if (resolved.category === 'soil' && resolved.id !== selectedStructureId) {
    cancelFieldWork('target');
    selectedStructureId = resolved.id;
    selectedId = null;
    tillAim = null;
  }
  if (resolved.category === 'ground') {
    tillAim = { x: resolved.x, z: resolved.z };
  }
}

function startControl(which, options = {}) {
  if (preview || catalogOpen) return;
  if (which === 'primary' && options.keyboard) applyKeyboardTarget();
  const dock = fieldDock();
  const control = which === 'secondary' ? dock.secondary : dock.primary;
  if (!control || control.disabled || !control.command) {
    if (control?.hint) showToast(control.hint);
    return;
  }
  const result = applyCommand(state, control.command);
  handleSimEvents(result.events);
  if (!result.ok) {
    showToast(plotHint(result.reason, result) || control.hint || 'That cannot be done now.');
  }
  refreshMeta();
}

function startGather(options = {}) {
  startControl('primary', options);
}

function stopGather() {
  gatheringHeld = false;
  heldControl = null;
  const result = applyCommand(state, { type: 'stopAction' });
  handleSimEvents(result.events);
  refreshMeta();
}

function maybeAutoGather() {
  if (fieldMode !== 'gather') return;
  if (preview || catalogOpen || !gatherToggle || paused || keys.size || route.length || state.action || gatheringHeld) return;
  const resource = selectedResource();
  if (!resource) return;
  const info = describeAction(state, resource.id);
  if (info.canStart) startGather();
}

$('help').addEventListener('click', openPause);
$('resume').addEventListener('click', closePause);
$('inventory-open').addEventListener('click', openInventory);
$('inventory-close').addEventListener('click', closeInventory);
$('build-open').addEventListener('click', openCatalog);
$('field-mode-gather').addEventListener('click', () => setFieldMode('gather'));
$('field-mode-hoe').addEventListener('click', () => setFieldMode('hoe'));
$('field-mode-seeds').addEventListener('click', () => setFieldMode('seeds', { openStrip: true }));
$('build-catalog-close').addEventListener('click', closeCatalog);
$('build-cancel').addEventListener('click', () => {
  cancelPreview();
  refreshMeta();
});
$('build-rotate').addEventListener('click', rotatePreview);
$('build-confirm').addEventListener('click', confirmPreview);
$('structure-move').addEventListener('click', startMove);
$('structure-remove').addEventListener('click', dismantleSelected);
$('structure-use').addEventListener('click', openStation);
$('station-close').addEventListener('click', () => closeStation());
stationDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeStation();
});
pauseDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closePause();
});
inventoryDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeInventory();
});
intro.addEventListener('cancel', event => event.preventDefault());
confirmNew.addEventListener('cancel', event => {
  event.preventDefault();
  pendingTitleReplace = false;
  confirmNew.close();
  if (!intro.open && sessionLive) closePause();
});

$('new-world-form').addEventListener('submit', event => {
  event.preventDefault();
  if (sessionLive) startFreshWorld();
  else requestNewWorldFromTitle();
});

$('continue').addEventListener('click', continueSaved);

$('intro-cancel').addEventListener('click', () => {
  intro.close();
  if (sessionLive) {
    if (pauseDialog.open) closePause();
    else {
      setPaused(false);
      canvas.focus({ preventScroll: true });
    }
  }
});

$('new-world').addEventListener('click', () => {
  pauseDialog.close();
  pendingTitleReplace = false;
  $('confirm-new-copy').textContent = 'Starting a new world replaces this walk. The saved island is replaced when the new one writes successfully.';
  confirmNew.showModal();
});

$('confirm-new-yes').addEventListener('click', () => {
  confirmNew.close();
  if (pendingTitleReplace || intro.open) {
    startFreshWorld();
    return;
  }
  setPaused(true);
  openNewWorldForm();
});

$('confirm-new-no').addEventListener('click', () => {
  pendingTitleReplace = false;
  confirmNew.close();
  if (intro.open) return;
  closePause();
});

$('save-now').addEventListener('click', () => {
  const result = persist('manual');
  if (result.ok) showToast('Island saved in this browser.', 3);
});

$('gather-mode').addEventListener('click', () => {
  gatherToggle = !gatherToggle;
  persistPrefs();
  if (!gatherToggle) stopGather();
  refreshMeta();
});

function bindHoldButton(button, which) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (gatherToggle) {
      if (state.action && heldControl === which) stopGather();
      else {
        heldControl = which;
        startControl(which);
      }
      return;
    }
    gatheringHeld = true;
    heldControl = which;
    startControl(which);
  });
  button.addEventListener('pointerup', event => {
    if (gatherToggle) return;
    if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
    if (heldControl === which) stopGather();
  });
  button.addEventListener('pointercancel', () => {
    if (heldControl === which) stopGather();
  });
  button.addEventListener('lostpointercapture', () => {
    if (!gatherToggle && heldControl === which) stopGather();
  });
  button.addEventListener('click', event => event.preventDefault());
}

bindHoldButton($('gather'), 'primary');
bindHoldButton($('field-secondary'), 'secondary');

$('sound').addEventListener('click', async () => {
  const button = $('sound');
  button.disabled = true;
  try {
    soundOn = await sound.setEnabled(!soundOn);
    button.setAttribute('aria-pressed', String(soundOn));
    button.innerHTML = `Sound <span>${soundOn ? 'on' : 'off'}</span>`;
  } catch (error) {
    showToast('Sound is unavailable here. The island is still yours.');
    console.warn('Audio unavailable', error);
  } finally {
    button.disabled = false;
  }
});

$('return-clearing').addEventListener('click', () => {
  const result = applyCommand(state, { type: 'returnToClearing' });
  if (!result.ok) return;
  destination = null;
  route = [];
  leftover = 0;
  handleSimEvents(result.events);
  showToast('Back at the clearing.', 3);
});

for (const id of ['palette', 'pause-palette']) {
  $(id).addEventListener('change', event => setPalette(event.target.value));
}
for (const id of ['avatar', 'pause-avatar']) {
  $(id).addEventListener('change', event => setAvatar(event.target.value));
}

$('zoom-out').addEventListener('click', () => setZoom(zoom / 1.3));
$('zoom-in').addEventListener('click', () => setZoom(zoom * 1.3));
$('zoom-fit').addEventListener('click', () => { world.resetCamera(); setZoom(1); });
$('camera-inspect').addEventListener('click', () => setZoom(world.inspect(state.player, selectedResource())));
$('camera-toggle').addEventListener('click', () => {
  const panel = $('camera-options');
  panel.hidden = !panel.hidden;
  $('camera-toggle').setAttribute('aria-expanded', String(!panel.hidden));
});
$('camera-mode').addEventListener('change', event => {
  cameraMode = event.target.value;
  cameraDrag = null;
  clearInput();
});
for (const button of document.querySelectorAll('[data-orbit]')) button.addEventListener('click', () => {
  const [x, y] = button.dataset.orbit.split(',').map(Number);
  world.orbit(x, y);
});
for (const button of document.querySelectorAll('[data-pan]')) button.addEventListener('click', () => {
  const [x, y] = button.dataset.pan.split(',').map(Number);
  world.pan(x, y);
});
$('camera-center').addEventListener('click', () => world.centerCamera());
setZoom(1);
setAvatar(prefs.avatar || 'cloak');
if (prefs.palette) setPalette(prefs.palette);

window.addEventListener('keydown', event => {
  if (editingField(event.target)) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    if (preview) {
      cancelPreview();
      refreshMeta();
      return;
    }
    if (catalogOpen) {
      closeCatalog();
      refreshMeta();
      return;
    }
    if (seedStripOpen) {
      closeSeedStrip();
      refreshMeta();
      return;
    }
    if (state.action) {
      stopGather();
      return;
    }
    if (selectedId || selectedStructureId || tillAim) {
      selectedId = null;
      selectedStructureId = null;
      tillAim = null;
      refreshMeta();
      return;
    }
    if (stationOpen()) {
      closeStation();
      return;
    }
    if (inventoryDialog.open) {
      closeInventory();
      return;
    }
    if (confirmNew.open) {
      pendingTitleReplace = false;
      confirmNew.close();
      if (!intro.open && sessionLive) closePause();
      return;
    }
    if (!intro.open && !pauseDialog.open) openPause();
    return;
  }
  if (event.code === 'KeyI') {
    if (event.repeat || failed || state.phase === 'intro') return;
    event.preventDefault();
    if (inventoryDialog.open) closeInventory();
    else if (!paused) openInventory();
    return;
  }
  if (paused || state.phase === 'intro' || failed || document.hidden) return;
  if (event.target instanceof HTMLElement && event.target.closest('button, a')) return;
  if (event.code === 'KeyB') {
    if (event.repeat) return;
    event.preventDefault();
    if (catalogOpen) closeCatalog();
    else openCatalog();
    return;
  }
  if (event.code === 'KeyR') {
    event.preventDefault();
    rotatePreview();
    return;
  }
  if (event.code === 'Enter') {
    if (preview) {
      event.preventDefault();
      confirmPreview();
    }
    return;
  }
  if (event.code === 'Equal' || event.code === 'NumpadAdd') {
    event.preventDefault();
    setZoom(zoom * 1.2);
    return;
  }
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    event.preventDefault();
    setZoom(zoom / 1.2);
    return;
  }
  if (actionKeys.includes(event.code)) {
    event.preventDefault();
    if (event.repeat || preview || catalogOpen) return;
    const structure = selectedStructure();
    if (fieldMode === 'gather' && structure && structure.kind !== 'soil') {
      openStation();
      return;
    }
    if (gatherToggle) {
      if (state.action) stopGather();
      else startGather({ keyboard: true });
    } else {
      gatheringHeld = true;
      heldControl = 'primary';
      startGather({ keyboard: true });
    }
    return;
  }
  if (moveKeys.includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
    destination = null;
    route = [];
  }
});
window.addEventListener('keyup', event => {
  keys.delete(event.code);
  if (actionKeys.includes(event.code) && !gatherToggle) stopGather();
});
window.addEventListener('blur', () => {
  clearInput();
  leftover = 0;
  last = performance.now();
  if (state.phase !== 'intro' && !pauseDialog.open && !confirmNew.open && !inventoryDialog.open && !stationOpen() && !failed) openPause();
});
document.addEventListener('visibilitychange', () => {
  clearInput();
  leftover = 0;
  last = performance.now();
  if (document.hidden) {
    sound.pause(true);
    if (state.phase === 'playing') persist('visibility');
    if (state.phase !== 'intro' && !pauseDialog.open && !confirmNew.open && !inventoryDialog.open && !stationOpen() && !failed) openPause();
  } else sound.pause(paused);
});

const gesture = createGroundGesture({
  getZoom: () => zoom,
  onZoom: setZoom,
  onPan: (dx, dy) => world.pan(dx, dy),
  onSingleDrag: (dx, dy) => { if (cameraMode !== 'walk') world[cameraMode](dx, dy); },
  onGesture: () => {
    destination = null;
    route = [];
    keys.clear();
    gatheringHeld = false;
    heldControl = null;
    applyCommand(state, { type: 'cancelInput' });
  },
  onTap: (x, y) => {
    if (cameraMode !== 'walk') return;
    const picked = world.pick(x, y);
    if (catalogOpen) {
      closeCatalog();
      refreshMeta();
      return;
    }
    if (preview) {
      if (picked?.structure?.kind === 'soil' && !preview.movingId) {
        cancelPreview();
        selectedId = null;
        selectedStructureId = picked.structure.id;
        destination = null;
        route = [];
        refreshMeta();
        return;
      }
      if (!Number.isFinite(picked?.x) || !Number.isFinite(picked?.z)) return;
      const cell = snapBuildCell(picked.x, picked.z);
      preview.gx = cell.gx;
      preview.gz = cell.gz;
      refreshBuildView();
      refreshDocks();
      refreshMeta();
      return;
    }
    if (picked?.node) {
      if (selectedId !== picked.node.id || selectedStructureId || tillAim) cancelFieldWork('target');
      selectedId = picked.node.id;
      selectedStructureId = null;
      tillAim = null;
      refreshMeta();
      const dest = approachPoint(nav, state.player, picked.node);
      if (!dest) {
        showToast('That place is not reachable from here.');
        destination = null;
        route = [];
        return;
      }
      if (Math.hypot(dest.x - state.player.x, dest.z - state.player.z) < 0.2) {
        destination = dest;
        route = [];
        return;
      }
      const path = findPath(nav, state.player, dest);
      if (!path) {
        showToast('That place is not reachable from here.');
        destination = null;
        route = [];
        return;
      }
      route = path;
      destination = dest;
      return;
    }
    if (picked?.structure) {
      if (selectedStructureId !== picked.structure.id || selectedId || tillAim) cancelFieldWork('target');
      selectedId = null;
      selectedStructureId = picked.structure.id;
      tillAim = null;
      destination = null;
      route = [];
      refreshMeta();
      if (picked.structure.kind === 'soil') {
        const dest = approachPoint(nav, state.player, {
          x: Number.isFinite(picked.structure.x) ? picked.structure.x : picked.structure.gx,
          z: Number.isFinite(picked.structure.z) ? picked.structure.z : picked.structure.gz,
          radius: 0.5,
        });
        if (dest) {
          if (Math.hypot(dest.x - state.player.x, dest.z - state.player.z) >= 0.2) {
            const path = findPath(nav, state.player, dest);
            if (path) {
              route = path;
              destination = dest;
            }
          }
        }
      }
      return;
    }
    if (picked?.ground) {
      const nextAim = fieldMode === 'hoe'
        ? { x: quantizeSoilCoord(picked.ground.x), z: quantizeSoilCoord(picked.ground.z) }
        : null;
      if (selectedId || selectedStructureId || tillAim?.x !== nextAim?.x || tillAim?.z !== nextAim?.z) {
        cancelFieldWork('target');
      }
      selectedId = null;
      selectedStructureId = null;
      tillAim = nextAim;
      refreshMeta();
      const dest = snapWalkable(nav, picked.ground.x, picked.ground.z) || picked.ground;
      const path = findPath(nav, state.player, dest);
      if (!path) {
        showToast('That place is not reachable from here.');
        destination = null;
        route = [];
        return;
      }
      route = path;
      destination = dest;
    }
  },
});

canvas.addEventListener('pointerdown', event => {
  if (paused || state.phase === 'intro' || failed) return;
  if (event.button === 2 || event.button === 1 || (cameraMode !== 'walk' && event.pointerType !== 'touch')) {
    event.preventDefault();
    cameraDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, mode: event.button === 1 || event.shiftKey ? 'pan' : event.button === 2 ? 'orbit' : cameraMode };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  gesture.down(event.pointerId, event.clientX, event.clientY);
  canvas.focus({ preventScroll: true });
});
canvas.addEventListener('pointermove', event => {
  if (cameraDrag?.id === event.pointerId) {
    world[cameraDrag.mode](event.clientX - cameraDrag.x, event.clientY - cameraDrag.y);
    cameraDrag.x = event.clientX; cameraDrag.y = event.clientY;
  } else gesture.move(event.pointerId, event.clientX, event.clientY);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, event => {
    if (cameraDrag?.id === event.pointerId) { cameraDrag = null; return; }
    gesture.up(event.pointerId, event.clientX, event.clientY, type !== 'pointerup');
  });
}
canvas.addEventListener('wheel', event => {
  if (paused || state.phase === 'intro' || failed) return;
  event.preventDefault();
  setZoom(zoom * Math.exp(-event.deltaY * 0.002));
}, { passive: false });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  persist('contextlost');
  failure('The island lost its graphics connection. Try Continue after a refresh to keep your save.');
});
window.addEventListener('resize', () => {
  world.resize();
  gatherFx.resize();
});

function markerTarget() {
  if (destination) return { x: destination.x, z: destination.z, active: true };
  return null;
}

function frame(now) {
  if (failed) return;
  const dt = Math.max(0, (now - last) / 1000);
  last = now;
  try {
    if (!document.hidden) {
      if (!paused && state.phase === 'playing') {
        if (dt > 0.25) {
          leftover = 0;
          snapPlayerPose(state);
        }
        time += Math.min(dt, 0.25);
        if (keys.size) {
          route = [];
          destination = null;
        }
        const steer = !keys.size && route.length ? route[0] : null;
        const move = resolveMoveInput(state.player, keys, steer);
        if (keys.size) Object.assign(move, viewMovement(move.x, move.z, world.cameraYaw));
        if (move.arrived && route.length) {
          route.shift();
          if (!route.length) destination = null;
        }
        const stepped = advance(state, { x: move.x, z: move.z }, dt, leftover);
        leftover = stepped.leftover;
        handleSimEvents(stepped.events);
        maybeAutoGather();
        maybeAutosave();
        if (dirty && saveStatus === 'saved') saveStatus = 'unsaved';
      } else {
        leftover = 0;
      }
      if (time > toastUntil) $('toast').classList.remove('show');
      const cues = world.update(state, time, paused ? 0 : dt, motion.matches, markerTarget(), leftover, selectionMarker(), { mode: fieldMode }) || [];
      for (const cue of cues) {
        sound.event(cue);
        if (cue.type === 'gatherContact') {
          gatherFx.ingest(cue, state.player, state.action ? resourceById(state, state.action.targetId) : null, motion.matches);
        }
      }
      gatherFx.step(paused ? 0 : dt, (x, y, z) => world.project(x, y, z), world.zoom);
      placePickedLabel();
      if (!paused && state.phase === 'playing') refreshMeta();
    }
  } catch (error) {
    console.error('Hearthwild runtime error', error);
    failure('Something interrupted the island. Try again to start a fresh walk.');
    return;
  }
  requestAnimationFrame(frame);
}

world.update(state, 0, 0, motion.matches, null, 0, null);
$('loading').hidden = true;
refreshContinue();
refreshMeta();
intro.showModal();
requestAnimationFrame(frame);
