// Browser-independent simulation. Renderer, audio, and DOM must not import into this module.
import { ARRIVE_DISTANCE, GENERATOR_VERSION, MAX_CATCH_UP_TICKS, MOVE_SPEED, SCHEMA_VERSION, TICK_SECONDS } from '../data/tuning.mjs';
import { generateWorld } from '../world/generate.mjs';
import { resolveWalkPosition } from '../world/navigation.mjs';
import { copyStructure, nextStructureIdValue, placeStructure, moveStructure, removeStructure } from './building.mjs';
import { cloneEquipment, createInventory, grantStartingKit } from './inventory.mjs';
import { plantTree, tickGarden } from './garden.mjs';
import {
  copyCrop, nextCropIdValue, nextPlantedTreeIdValue,
} from '../data/crops.mjs';
import { beginAction, advanceAction, cancelAction } from './action.mjs';
import {
  copyResource, resourcesFromDescriptor, syncObstacles, tickRenewal,
} from './resources.mjs';
import { cancelBatch, collectOutput, craftRecipe, queueSmelt, tickStations } from './stations.mjs';
import { copyDiscovery, emptyDiscovery } from '../data/recipes.mjs';
import { copySoilPatch, nextSoilIdValue } from '../world/soil.mjs';

const DEFAULT_DESCRIPTOR = generateWorld('hearthwild-review-a');

function copyPose(player) {
  return { x: player.x, z: player.z, facing: player.facing, moving: player.moving };
}

export function snapPlayerPose(state) {
  state.playerPrev = copyPose(state.player);
}

export function displayPose(state, leftover = 0) {
  const prev = state.playerPrev || state.player;
  const curr = state.player;
  const alpha = Math.min(1, Math.max(0, leftover / TICK_SECONDS));
  const turn = Math.atan2(Math.sin(curr.facing - prev.facing), Math.cos(curr.facing - prev.facing));
  return {
    x: prev.x + (curr.x - prev.x) * alpha,
    z: prev.z + (curr.z - prev.z) * alpha,
    facing: prev.facing + turn * alpha,
    moving: prev.moving || curr.moving,
  };
}

function baseState(descriptor, options = {}) {
  const spawn = descriptor.spawn;
  const name = String(options.name || descriptor.name || '').trim().slice(0, 32);
  const state = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: descriptor.generatorVersion || GENERATOR_VERSION,
    seed: descriptor.seed,
    worldName: name,
    phase: 'intro',
    elapsed: 0,
    tick: 0,
    walkMargin: descriptor.walkMargin,
    boundary: descriptor.boundary.polygon.map(vertex => ({ x: vertex.x, z: vertex.z })),
    resources: resourcesFromDescriptor(descriptor),
    inventory: createInventory(),
    equipment: cloneEquipment({}),
    action: null,
    gatherSeq: 0,
    structures: [],
    nextStructureId: 1,
    soilPatches: [],
    nextSoilId: 1,
    crops: [],
    nextCropId: 1,
    nextPlantedTreeId: 1,
    harvestCount: 0,
    discovery: emptyDiscovery(),
    obstacles: [],
    clearing: { x: spawn.x, z: spawn.z, facing: spawn.facing || 0 },
    player: { x: spawn.x, z: spawn.z, facing: spawn.facing || 0, moving: false },
    playerPrev: { x: spawn.x, z: spawn.z, facing: spawn.facing || 0, moving: false },
  };
  syncObstacles(state);
  snapPlayerPose(state);
  return state;
}

export function createState(descriptor = DEFAULT_DESCRIPTOR, options = {}) {
  const state = baseState(descriptor, options);
  const kit = grantStartingKit();
  state.inventory = kit.inventory;
  state.equipment = kit.equipment;
  return state;
}

export function restoreState(descriptor, gameplay, options = {}) {
  const state = baseState(descriptor, { name: gameplay.worldName || options.name || '' });
  state.phase = 'playing';
  state.elapsed = Number(gameplay.elapsed) || 0;
  state.tick = Number(gameplay.tick) || 0;
  state.inventory = createInventory(gameplay.inventory);
  state.equipment = cloneEquipment(gameplay.equipment);
  state.resources = (gameplay.resources || resourcesFromDescriptor(descriptor)).map(copyResource);
  state.structures = (gameplay.structures || []).map(copyStructure);
  state.nextStructureId = nextStructureIdValue(state.structures, gameplay.nextStructureId);
  state.soilPatches = (gameplay.soilPatches || []).map(copySoilPatch);
  state.nextSoilId = nextSoilIdValue(state.soilPatches, gameplay.nextSoilId);
  state.crops = (gameplay.crops || []).map(copyCrop);
  state.nextCropId = nextCropIdValue(state.crops, gameplay.nextCropId);
  state.nextPlantedTreeId = nextPlantedTreeIdValue(state.resources, gameplay.nextPlantedTreeId);
  state.harvestCount = Number.isInteger(gameplay.harvestCount) && gameplay.harvestCount > 0 ? gameplay.harvestCount : 0;
  state.discovery = copyDiscovery(gameplay.discovery);
  state.action = null;
  const spawn = descriptor.spawn;
  state.player = {
    x: Number.isFinite(gameplay.player?.x) ? gameplay.player.x : spawn.x,
    z: Number.isFinite(gameplay.player?.z) ? gameplay.player.z : spawn.z,
    facing: Number.isFinite(gameplay.player?.facing) ? gameplay.player.facing : (spawn.facing || 0),
    moving: false,
  };
  syncObstacles(state);
  snapPlayerPose(state);
  return state;
}

export function applyCommand(state, command) {
  if (!command || typeof command.type !== 'string') return { ok: false, reason: 'invalid-command' };
  if (command.type === 'enter') {
    if (state.phase !== 'intro') return { ok: false, reason: 'already-entered' };
    state.phase = 'playing';
    state.player.moving = false;
    state.action = null;
    snapPlayerPose(state);
    return { ok: true, events: [{ type: 'entered' }] };
  }
  if (command.type === 'cancelInput') {
    const events = cancelAction(state, 'input');
    state.player.moving = false;
    snapPlayerPose(state);
    return { ok: true, events };
  }
  if (command.type === 'stopAction') {
    return { ok: true, events: cancelAction(state, 'released') };
  }
  if (command.type === 'startAction') {
    return beginAction(state, command);
  }
  if (command.type === 'place') {
    const result = placeStructure(state, command);
    if (!result.ok) return result;
    const cancelled = cancelAction(state, 'build');
    result.events = [...cancelled, ...result.events];
    return result;
  }
  if (command.type === 'move') {
    const result = moveStructure(state, command);
    if (!result.ok) return result;
    const cancelled = cancelAction(state, 'build');
    result.events = [...cancelled, ...result.events];
    return result;
  }
  if (command.type === 'remove') {
    const result = removeStructure(state, command.id);
    if (!result.ok) return result;
    const cancelled = cancelAction(state, 'build');
    result.events = [...cancelled, ...result.events];
    return result;
  }
  if (command.type === 'queueSmelt') {
    return queueSmelt(state, command);
  }
  if (command.type === 'cancelBatch') {
    return cancelBatch(state, command);
  }
  if (command.type === 'collectOutput') {
    return collectOutput(state, command);
  }
  if (command.type === 'craft') {
    return craftRecipe(state, command);
  }
  if (command.type === 'plant' || command.type === 'harvestCrop' || command.type === 'uproot') {
    return { ok: false, reason: 'use-action', events: [] };
  }
  if (command.type === 'plantTree') {
    const result = plantTree(state, command);
    if (!result.ok) return result;
    const cancelled = cancelAction(state, 'plant');
    result.events = [...cancelled, ...result.events];
    return result;
  }
  if (command.type === 'returnToClearing') {
    if (state.phase !== 'playing') return { ok: false, reason: 'not-playing' };
    const events = cancelAction(state, 'returned');
    state.player.x = state.clearing.x;
    state.player.z = state.clearing.z;
    state.player.facing = state.clearing.facing;
    state.player.moving = false;
    snapPlayerPose(state);
    events.push({ type: 'returned' });
    return { ok: true, events };
  }
  return { ok: false, reason: 'unknown-command' };
}

export function resolveMoveInput(player, keys, target) {
  const pressed = keys instanceof Set ? keys : new Set(keys || []);
  let x = Number(pressed.has('KeyD') || pressed.has('ArrowRight')) - Number(pressed.has('KeyA') || pressed.has('ArrowLeft'));
  let z = Number(pressed.has('KeyS') || pressed.has('ArrowDown')) - Number(pressed.has('KeyW') || pressed.has('ArrowUp'));
  if (x || z) {
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    return { x, z, arrived: false };
  }
  if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < ARRIVE_DISTANCE) return { x: 0, z: 0, arrived: true };
    return { x: dx / distance, z: dz / distance, arrived: false };
  }
  return { x: 0, z: 0, arrived: false };
}

export function step(state, input = {}, seconds = TICK_SECONDS) {
  const events = [];
  if (state.phase === 'intro' || input.paused) {
    if (input.paused) events.push(...cancelAction(state, 'paused'));
    state.player.moving = false;
    snapPlayerPose(state);
    return events;
  }
  const dt = Math.min(TICK_SECONDS, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  if (dt <= 0) return events;
  snapPlayerPose(state);
  if (state.phase === 'playing') {
    state.elapsed += dt;
    state.tick += 1;
  }
  let dx = Number.isFinite(input.x) ? input.x : 0;
  let dz = Number.isFinite(input.z) ? input.z : 0;
  const length = Math.hypot(dx, dz);
  if (length > 1) { dx /= length; dz /= length; }
  const player = state.player;
  player.moving = Math.hypot(dx, dz) > 0.05;
  if (player.moving) {
    const next = resolveWalkPosition(
      state.boundary,
      state.obstacles || [],
      player.x + dx * MOVE_SPEED * dt,
      player.z + dz * MOVE_SPEED * dt,
      player.x,
      player.z,
      state.walkMargin,
    );
    player.x = next.x;
    player.z = next.z;
    player.facing = Math.atan2(dx, dz);
  }
  const preexistingCrops = new Set((state.crops || []).map(crop => crop.id));
  advanceAction(state, dt, player.moving, events);
  tickRenewal(state, events);
  tickStations(state, dt, events);
  tickGarden(state, dt, events, preexistingCrops);
  return events;
}

export function advance(state, input, seconds, leftover = 0) {
  if (state.phase !== 'playing' || input?.paused) {
    const events = input?.paused ? cancelAction(state, 'paused') : [];
    state.player.moving = false;
    snapPlayerPose(state);
    return { events, leftover: 0 };
  }
  const events = [];
  let accum = leftover + Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  let ticks = 0;
  while (accum >= TICK_SECONDS && ticks < MAX_CATCH_UP_TICKS) {
    events.push(...step(state, input, TICK_SECONDS));
    accum -= TICK_SECONDS;
    ticks += 1;
  }
  if (ticks === MAX_CATCH_UP_TICKS) accum = 0;
  return { events, leftover: accum };
}
