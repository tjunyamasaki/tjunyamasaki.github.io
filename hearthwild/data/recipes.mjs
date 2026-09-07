import { SMELT_SECONDS } from './tuning.mjs';

export const RECIPE_IDS = Object.freeze(['copperIngot', 'copperAxe', 'copperPick', 'hoe', 'fiber']);

export const RECIPES = Object.freeze({
  copperIngot: Object.freeze({
    id: 'copperIngot',
    label: 'Copper ingot',
    station: 'furnace',
    cost: Object.freeze({ copperOre: 2, wood: 1 }),
    output: Object.freeze({ copperIngot: 1 }),
    duration: SMELT_SECONDS,
    batchable: true,
    unique: false,
    unlock: 'furnace',
  }),
  copperAxe: Object.freeze({
    id: 'copperAxe',
    label: 'Copper axe',
    station: 'workbench',
    cost: Object.freeze({ wood: 3, copperIngot: 3 }),
    equipment: 'copperAxe',
    duration: 0,
    batchable: false,
    unique: true,
    unlock: 'copperIngot',
  }),
  copperPick: Object.freeze({
    id: 'copperPick',
    label: 'Copper pick',
    station: 'workbench',
    cost: Object.freeze({ wood: 3, copperIngot: 3 }),
    equipment: 'copperPick',
    duration: 0,
    batchable: false,
    unique: true,
    unlock: 'copperIngot',
  }),
  hoe: Object.freeze({
    id: 'hoe',
    label: 'Hoe',
    station: 'hand',
    cost: Object.freeze({ wood: 5, stone: 2 }),
    equipment: 'hoe',
    duration: 0,
    batchable: false,
    unique: true,
  }),
  fiber: Object.freeze({
    id: 'fiber',
    label: 'Fiber',
    station: 'hand',
    cost: Object.freeze({ moonflower: 1 }),
    output: Object.freeze({ fiber: 2 }),
    duration: 0,
    batchable: false,
    unique: false,
    unlock: 'legacyMoonflower',
  }),
});

export function recipeDef(id) {
  return RECIPES[id] || null;
}

export function recipesForStation(kind) {
  return RECIPE_IDS.map(id => RECIPES[id]).filter(recipe => recipe.station === kind);
}

export function handRecipes() {
  return recipesForStation('hand');
}

export function emptyDiscovery() {
  return { workbench: false, furnace: false, copperIngot: false, cropHarvest: false };
}

export function copyDiscovery(value) {
  return {
    workbench: Boolean(value?.workbench),
    furnace: Boolean(value?.furnace),
    copperIngot: Boolean(value?.copperIngot),
    cropHarvest: Boolean(value?.cropHarvest),
  };
}

export function inferDiscovery(structures, inventory = {}, equipment = {}) {
  return {
    workbench: (structures || []).some(item => item.kind === 'workbench'),
    furnace: (structures || []).some(item => item.kind === 'furnace'),
    copperIngot: (Number(inventory.copperIngot) || 0) > 0
      || Boolean(equipment?.copperAxe)
      || Boolean(equipment?.copperPick),
    cropHarvest: false,
  };
}
