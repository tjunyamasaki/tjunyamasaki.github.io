export const TICK_SECONDS = 1 / 30;
export const MAX_CATCH_UP_TICKS = 5;
export const MOVE_SPEED = 3.2;
export const KEEPER_RADIUS = 0.28;
export const RIM_MARGIN = 0.9;
export const ARRIVE_DISTANCE = 0.16;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 14;
export const WALK_MARGIN = KEEPER_RADIUS + RIM_MARGIN;
export const SCHEMA_VERSION = 6;
export const GENERATOR_VERSION = 'hearthwild-05';
export const POLYGON_SAMPLES = 48;
export const ISLAND_SHAPES = Object.freeze(['ellipse', 'blob', 'capsule', 'clover', 'jagged']);
export const ISLAND_RADIUS = 36;
export const ISLAND_RADIUS_MIN = 22;
export const ISLAND_RADIUS_MAX = 52;
export const NAV_CELL = 0.5;
export const BUILD_CELL = 1;
export const BUILD_RANGE = 5;
export const STATION_RANGE = 2;
export const SMELT_SECONDS = 8;
export const SMELT_QUEUE_CAP = 10;
export const STRUCTURE_CAP = 300;
export const CROP_CAP = 64;
export const SOIL_PATCH_CAP = 64;
export const SOIL_PATCH_IMPORT_MAX = 300;
export const PLAYER_TREE_CAP = 64;
export const CARROT_SECONDS = 90;
export const POTATO_SECONDS = 120;
export const LEGACY_TURNIP_SECONDS = 90;
export const LEGACY_MOONFLOWER_SECONDS = 150;
export const LEGACY_SEED_RENEW = 120;
export const WILD_CROP_RENEW = 180;
export const CROP_HARVEST_SECONDS = 0.9;
export const CROP_PLANT_SECONDS = 0.65;
export const CROP_CLEAR_SECONDS = 0.6;
export const SOIL_TILL_SECONDS = 0.9;
export const SOIL_TILL_RANGE = 1.25;
export const HOE_BRUSH_AHEAD = 0.85;
export const CROP_SEED_PROGRESS = 0.15;
export const SAPLING_GROW_SECONDS = 300;
export const MEADOW_EXTENT = 6;
export const TREE_RADIUS = 0.58;
export const STONE_RADIUS = 0.5;
export const COPPER_RADIUS = 0.48;
export const BERRY_RADIUS = 0.4;
export const CROP_SOURCE_RADIUS = 0.38;
export const CROP_PICK_RADIUS = 0.65;
export const TWIG_RADIUS = 0.34;
export const PEBBLE_RADIUS = 0.32;
export const APPROACH_PADDING = 0.22;
export const HARVEST_PADDING = 0.42;
export const GARDEN_RANGE = KEEPER_RADIUS + HARVEST_PADDING;
export const SOIL_OUTLINE_VERTICES = 16;
export const SOIL_OUTLINE_RADIUS_MIN = 0.42;
export const SOIL_OUTLINE_RADIUS_MAX = 0.50;
export const SOIL_PATCH_SPACING = 1.02;
export const SOIL_SPAWN_RADIUS = 1;
export const SOIL_CLIFF_MARGIN = 0.25;
export const AUTOSAVE_SECONDS = 10;
export const TREE_COUNT = Object.freeze([35, 50]);
export const STONE_COUNT = Object.freeze([12, 18]);
export const COPPER_COUNT = Object.freeze([8, 12]);
export const BERRY_COUNT = Object.freeze([10, 14]);
export const CARROT_COUNT = Object.freeze([6, 10]);
export const POTATO_COUNT = Object.freeze([6, 10]);
export const WILD_CROP_ATTEMPTS = 200;
export const KEEPER_VARIANT_DEFAULT = 'cloak';
export const KEEPER_VARIANTS = Object.freeze(['cloak', 'brim']);
export const KEEPER_ANIM = Object.freeze({
  cloak: Object.freeze({ walkFreq: 8, walkBob: 0.018, walkStride: 0.045 }),
  brim: Object.freeze({
    walkFreq: 6.15,
    walkBob: 0.044,
    walkStride: 0.09,
    walkLean: 0.08,
    walkRoll: 0.07,
    walkYaw: 0.09,
    footLift: 0.075,
    idleBreath: 0.022,
    idleSway: 0.08,
    idleNod: 0.1,
  }),
});

export function normalizeKeeperVariant(value) {
  return value === 'brim' ? 'brim' : KEEPER_VARIANT_DEFAULT;
}
