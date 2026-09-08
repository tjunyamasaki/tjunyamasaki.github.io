/**
 * Authoritative world-state construction, clone, and roster sync.
 * Pure: no Three, DOM, wall-clock APIs, or randomness. Does not import
 * `core/state.mjs` (cloneState imports this module).
 */

import {
  findFreePosition,
  homePosition,
  isSeparatedFrom,
  isValidResidentCenter,
} from './layout.mjs';

/**
 * @typedef {`slime-${number}`} SlimeId
 * @typedef {object} SlimeState
 * @property {SlimeId} id
 * @property {string} name
 * @property {number} createdAtMs
 * @property {number} boostUntilMs
 * @property {number} feedCount
 * @property {number} homeSlot
 * @typedef {object} GameState
 * @property {number} simTimeMs
 * @property {number} glowMicro
 * @property {number} lifetimeGlowMicro
 * @property {number} incomeRemainder
 * @property {number} berries
 * @property {number | null} nextBerryAtMs
 * @property {number} nextFeedAllowedAtMs
 * @property {number} [nextThrowAllowedAtMs]
 * @property {number} totalFeeds
 * @property {{ shrub: number, pantry: number, bloom: number, beds: number }} upgrades
 * @property {SlimeState[]} slimes
 * @property {string[]} tutorialCompleted
 * @property {string} habitatId
 * @property {string} arrivalStyleId
 * @property {WorldState} [world]
 * @typedef {{ x: number, z: number }} PointXZ
 * @typedef {'idle' | 'wandering' | 'seekingFood' | 'eating' | 'arriving' | 'yielding'} Activity
 * @typedef {'flying' | 'landed' | 'claimed' | 'eating'} FoodStage
 *
 * @typedef {object} RouteState
 * @property {PointXZ[]} points
 * @property {number} length
 * @property {number} startedWorldMs
 * @property {number} cycleCount
 * @property {number} distanceAlong
 *
 * @typedef {object} WorldResident
 * @property {SlimeId} id
 * @property {PointXZ} position
 * @property {number} yaw
 * @property {Activity} activity
 * @property {RouteState | null} route
 * @property {string | null} targetFoodId
 * @property {number} nextDecisionWorldMs
 * @property {number} restUntilWorldMs
 * @property {number | null} blockedSinceWorldMs
 * @property {number} nextReplanWorldMs
 * @property {number} behaviorCounter
 *
 * @typedef {object} FoodState
 * @property {string} id
 * @property {PointXZ} target
 * @property {number} createdWorldMs
 * @property {number} landAtWorldMs
 * @property {FoodStage} stage
 * @property {string | null} claimedBy
 * @property {number | null} eatUntilWorldMs
 *
 * @typedef {object} WorldState
 * @property {number} timeMs
 * @property {number} carryMs
 * @property {number} nextFoodSequence
 * @property {FoodState[]} foods
 * @property {WorldResident[]} residents
 */

export const IDLE_DECISION_BASE_MS = 2000;
export const IDLE_DECISION_SLOT_STRIDE_MS = 250;

/**
 * @param {string} id
 * @returns {number}
 */
export function slimeNumericId(id) {
  if (typeof id !== 'string' || !id.startsWith('slime-')) {
    return Number.MAX_SAFE_INTEGER;
  }
  const n = Number(id.slice('slime-'.length));
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * @param {PointXZ} point
 * @returns {PointXZ}
 */
function clonePoint(point) {
  return { x: point.x, z: point.z };
}

/**
 * @param {RouteState | null | undefined} route
 * @returns {RouteState | null}
 */
function cloneRoute(route) {
  if (route == null) return null;
  return {
    points: route.points.map((point) => clonePoint(point)),
    length: route.length,
    startedWorldMs: route.startedWorldMs,
    cycleCount: route.cycleCount,
    distanceAlong: route.distanceAlong,
  };
}

/**
 * @param {FoodState} food
 * @returns {FoodState}
 */
function cloneFood(food) {
  return {
    id: food.id,
    target: clonePoint(food.target),
    createdWorldMs: food.createdWorldMs,
    landAtWorldMs: food.landAtWorldMs,
    stage: food.stage,
    claimedBy: food.claimedBy,
    eatUntilWorldMs: food.eatUntilWorldMs,
  };
}

/**
 * @param {WorldResident} resident
 * @returns {WorldResident}
 */
function cloneResident(resident) {
  return {
    id: resident.id,
    position: clonePoint(resident.position),
    yaw: resident.yaw,
    activity: resident.activity,
    route: cloneRoute(resident.route),
    targetFoodId: resident.targetFoodId,
    nextDecisionWorldMs: resident.nextDecisionWorldMs,
    restUntilWorldMs: resident.restUntilWorldMs,
    blockedSinceWorldMs: resident.blockedSinceWorldMs,
    nextReplanWorldMs: resident.nextReplanWorldMs,
    behaviorCounter: resident.behaviorCounter,
  };
}

/**
 * @param {number} slot
 * @returns {number}
 */
export function decisionTimeForSlot(slot) {
  const index = Number.isInteger(slot) && slot >= 0 ? slot : 0;
  return IDLE_DECISION_BASE_MS + index * IDLE_DECISION_SLOT_STRIDE_MS;
}

/**
 * @param {SlimeState} slime
 * @param {PointXZ} [position]
 * @returns {WorldResident}
 */
export function createIdleResident(slime, position) {
  const home = homePosition(slime.homeSlot);
  const at = position
    ? clonePoint(position)
    : home
      ? home
      : { x: 0, z: 2 };
  return {
    id: slime.id,
    position: at,
    yaw: 0,
    activity: 'idle',
    route: null,
    targetFoodId: null,
    nextDecisionWorldMs: decisionTimeForSlot(slime.homeSlot),
    restUntilWorldMs: 0,
    blockedSinceWorldMs: null,
    nextReplanWorldMs: 0,
    behaviorCounter: 0,
  };
}

/**
 * @param {readonly SlimeState[]} slimes
 * @returns {SlimeState[]}
 */
function orderedSlimes(slimes) {
  return [...slimes].sort((a, b) => slimeNumericId(a.id) - slimeNumericId(b.id));
}

/**
 * Default world: empty foods, sequence 1, zero clock/carry, idle residents at
 * assigned home slots with staggered integer decision times (no RNG).
 *
 * @param {readonly SlimeState[]} slimes
 * @returns {WorldState}
 */
export function createWorld(slimes) {
  const residents = orderedSlimes(slimes).map((slime) => createIdleResident(slime));
  return {
    timeMs: 0,
    carryMs: 0,
    nextFoodSequence: 1,
    foods: [],
    residents,
  };
}

/**
 * Field-by-field world clone. Nested foods, residents, and route.points are new.
 *
 * @param {WorldState} world
 * @returns {WorldState}
 */
export function cloneWorld(world) {
  return {
    timeMs: world.timeMs,
    carryMs: world.carryMs,
    nextFoodSequence: world.nextFoodSequence,
    foods: world.foods.map((food) => cloneFood(food)),
    residents: world.residents.map((resident) => cloneResident(resident)),
  };
}

/**
 * @param {WorldState} world
 * @param {readonly SlimeState[]} slimes
 * @returns {WorldState}
 */
export function reconcileWorldResidents(world, slimes) {
  const ordered = orderedSlimes(slimes);
  /** @type {Map<string, WorldResident>} */
  const existing = new Map();
  for (const resident of world.residents) {
    existing.set(resident.id, resident);
  }

  /** @type {PointXZ[]} */
  const placed = [];
  /** @type {WorldResident[]} */
  const residents = [];

  for (const slime of ordered) {
    const prev = existing.get(slime.id);
    if (prev) {
      const cloned = cloneResident(prev);
      residents.push(cloned);
      placed.push(cloned.position);
      continue;
    }

    const home = homePosition(slime.homeSlot);
    let position = null;
    if (
      home &&
      isValidResidentCenter(home) &&
      isSeparatedFrom(home, placed)
    ) {
      position = home;
    } else {
      position = findFreePosition({ occupied: placed, reserved: [] });
    }
    const created = createIdleResident(slime, position ?? home ?? { x: 0, z: 2 });
    residents.push(created);
    placed.push(created.position);
  }

  return {
    timeMs: world.timeMs,
    carryMs: world.carryMs,
    nextFoodSequence: world.nextFoodSequence,
    foods: world.foods.map((food) => cloneFood(food)),
    residents,
  };
}

/**
 * @param {Pick<GameState, 'nextThrowAllowedAtMs' | 'nextFeedAllowedAtMs'>} state
 * @returns {number}
 */
export function preferredCooldownMs(state) {
  if (Number.isInteger(state.nextThrowAllowedAtMs)) {
    return state.nextThrowAllowedAtMs;
  }
  if (Number.isInteger(state.nextFeedAllowedAtMs)) {
    return state.nextFeedAllowedAtMs;
  }
  return 0;
}

/**
 * One clock, two names. `nextThrowAllowedAtMs` is a non-enumerable accessor of
 * `nextFeedAllowedAtMs` so FEED/validate keep working and JSON.stringify of a
 * GameState stays on the v1 enumerable shape until P2-03.
 *
 * @param {object} state
 * @param {number} cooldownMs
 */
export function attachThrowCooldownAlias(state, cooldownMs) {
  state.nextFeedAllowedAtMs = cooldownMs;
  Object.defineProperty(state, 'nextThrowAllowedAtMs', {
    configurable: true,
    enumerable: false,
    get() {
      return this.nextFeedAllowedAtMs;
    },
    set(value) {
      this.nextFeedAllowedAtMs = value;
    },
  });
}

/**
 * `world` is non-enumerable until P2-03 persists it. Property access still works.
 *
 * @param {object} state
 * @param {WorldState} world
 */
export function attachWorld(state, world) {
  Object.defineProperty(state, 'world', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: world,
  });
}

/**
 * @param {SlimeState} slime
 * @returns {SlimeState}
 */
function cloneSlime(slime) {
  return {
    id: slime.id,
    name: slime.name,
    createdAtMs: slime.createdAtMs,
    boostUntilMs: slime.boostUntilMs,
    feedCount: slime.feedCount,
    homeSlot: slime.homeSlot,
  };
}

/**
 * Explicit GameState clone used by `cloneState` / `syncWorldRoster`.
 * Does not reconcile roster membership.
 *
 * @param {GameState} state
 * @param {WorldState} world
 * @returns {GameState}
 */
export function copyGameStateWithWorld(state, world) {
  const next = {
    simTimeMs: state.simTimeMs,
    glowMicro: state.glowMicro,
    lifetimeGlowMicro: state.lifetimeGlowMicro,
    incomeRemainder: state.incomeRemainder,
    berries: state.berries,
    nextBerryAtMs: state.nextBerryAtMs,
    nextFeedAllowedAtMs: preferredCooldownMs(state),
    totalFeeds: state.totalFeeds,
    upgrades: {
      shrub: state.upgrades.shrub,
      pantry: state.upgrades.pantry,
      bloom: state.upgrades.bloom,
      beds: state.upgrades.beds,
    },
    slimes: state.slimes.map((slime) => cloneSlime(slime)),
    tutorialCompleted: [...state.tutorialCompleted],
    habitatId: state.habitatId,
    arrivalStyleId: state.arrivalStyleId,
  };
  attachThrowCooldownAlias(next, preferredCooldownMs(state));
  attachWorld(next, world);
  return next;
}

/**
 * Clone GameState including world. Missing world is created from slimes.
 *
 * @param {GameState} state
 * @returns {GameState}
 */
export function cloneGameState(state) {
  const world = state.world
    ? cloneWorld(state.world)
    : createWorld(state.slimes);
  return copyGameStateWithWorld(state, world);
}

/**
 * Return a cloned GameState whose world.residents match state.slimes.
 * Surviving IDs keep positions; new IDs spawn at home or the next free point.
 *
 * @param {GameState} state
 * @returns {GameState}
 */
export function syncWorldRoster(state) {
  const next = cloneGameState(state);
  next.world = reconcileWorldResidents(next.world, next.slimes);
  return next;
}
