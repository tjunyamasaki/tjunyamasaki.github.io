import { CROP_CLEAR_SECONDS, CROP_HARVEST_SECONDS, WILD_CROP_RENEW } from './tuning.mjs';

export const HARVEST = Object.freeze({
  tree: Object.freeze({
    tool: 'axe',
    duration: Object.freeze({ stone: 2, copper: 1.2 }),
    yields: Object.freeze({ wood: 8, sapling: 1 }),
    result: 'stump',
    renew: 360,
    verb: 'Chop',
  }),
  stone: Object.freeze({
    tool: 'pick',
    duration: Object.freeze({ stone: 2, copper: 1.2 }),
    yields: Object.freeze({ stone: 6 }),
    result: 'depleted',
    renew: 180,
    verb: 'Quarry',
  }),
  copper: Object.freeze({
    tool: 'pick',
    duration: Object.freeze({ stone: 3, copper: 1.8 }),
    yields: Object.freeze({ copperOre: 3 }),
    result: 'depleted',
    renew: 240,
    verb: 'Mine',
  }),
  berry: Object.freeze({
    tool: null,
    duration: 0.6,
    yields: Object.freeze({ berry: 3 }),
    result: 'depleted',
    renew: 120,
    verb: 'Pick',
  }),
  carrot: Object.freeze({
    tool: null,
    duration: CROP_HARVEST_SECONDS,
    yields: Object.freeze({ carrot: 1, carrotSeed: 2, fiber: 1 }),
    result: 'depleted',
    renew: WILD_CROP_RENEW,
    verb: 'Harvest',
  }),
  potato: Object.freeze({
    tool: null,
    duration: CROP_HARVEST_SECONDS,
    yields: Object.freeze({ potato: 1, potatoSeed: 2, fiber: 1 }),
    result: 'depleted',
    renew: WILD_CROP_RENEW,
    verb: 'Harvest',
  }),
  twig: Object.freeze({
    tool: null,
    duration: 0.4,
    yields: Object.freeze({ wood: 1 }),
    result: 'depleted',
    renew: 60,
    verb: 'Gather',
  }),
  pebble: Object.freeze({
    tool: null,
    duration: 0.4,
    yields: Object.freeze({ stone: 1 }),
    result: 'depleted',
    renew: 60,
    verb: 'Gather',
  }),
});

export const CLEAR = Object.freeze({
  stump: Object.freeze({ duration: 0.5, verb: 'Clear stump' }),
  sapling: Object.freeze({ duration: 0.5, verb: 'Clear sapling' }),
  young: Object.freeze({ duration: 0.5, verb: 'Clear young tree' }),
  berry: Object.freeze({ duration: 0.8, verb: 'Clear bush' }),
  carrot: Object.freeze({ duration: CROP_CLEAR_SECONDS, verb: 'Clear plant' }),
  potato: Object.freeze({ duration: CROP_CLEAR_SECONDS, verb: 'Clear plant' }),
});

export const BLOCKING_KINDS = Object.freeze(['tree', 'stone', 'copper', 'berry']);
export const RESOURCE_KINDS = Object.freeze([
  'tree', 'stone', 'copper', 'berry', 'twig', 'pebble', 'carrot', 'potato',
]);
