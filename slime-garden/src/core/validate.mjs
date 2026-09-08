/**
 * Save-envelope validation and reconstruction. Pure: no DOM, Three,
 * performance, wall clock, or randomness.
 *
 * Dispatcher: schema 1 + balance 1 → frozen legacy; schema 2 + balance 2 →
 * current v2 (world required). Greater schema or future balance > 2 is
 * FUTURE_VERSION. schema-v2.json junk is INVALID_STATE, not FUTURE.
 */

import {
  ARRIVAL_STYLE_ID,
  BALANCE_VERSION,
  BALANCE_VERSION_V2,
  BONUS_MAX_REMAINING_MS,
  FEED_COUNTER_CAP,
  GAME_ID,
  GEOM_EPS,
  HABITAT_ID_V2,
  INCOME_REMAINDER_MOD,
  LOGICAL_TIME_MAX_MS,
  MAX_ACTIVE_ROUTES,
  MAX_FOOD,
  MAX_GLOW_MICRO,
  NAME_MAX_LENGTH,
  POPULATION_CAP,
  SCHEMA_VERSION,
  SCHEMA_VERSION_V2,
  THROW_COOLDOWN_MS,
  TUTORIAL_STEPS,
  UPGRADE_IDS,
  UPGRADE_MAX_LEVEL,
  WORLD_CARRY_MAX_MS,
  WORLD_STEP_MS,
} from './balance.mjs';
import {
  getBerryCapacity,
  getBerryIntervalMs,
  getResidentCapacity,
} from './selectors.mjs';
import { cloneState, createInitialState } from './state.mjs';
import {
  isFinitePoint,
  isInArrivalCorridor,
  isValidFoodTarget,
  isValidResidentCenter,
  MIN_SEPARATION,
  pairDistance,
} from '../world/layout.mjs';
import {
  attachThrowCooldownAlias,
  attachWorld,
  cloneWorld,
  createWorld,
  preferredCooldownMs,
} from '../world/state.mjs';
import {
  isLogicalTime,
  isNonnegSafeInteger,
  isPlainObject,
  isSafeInteger,
  reconstructLegacyEnvelope,
  reconstructSettings,
  reconstructSlime,
} from './validate-legacy.mjs';

/** Maximum accepted save text length (64 KiB). */
export const SAVE_TEXT_MAX_LENGTH = 65536;

const MAX_PATH_POINTS = 128;

const TUTORIAL_STEP_SET = new Set(TUTORIAL_STEPS);

const ACTIVITIES = Object.freeze(
  /** @type {const} */ ([
    'idle',
    'wandering',
    'seekingFood',
    'eating',
    'arriving',
    'yielding',
  ]),
);

const FOOD_STAGES = Object.freeze(
  /** @type {const} */ (['flying', 'landed', 'claimed', 'eating']),
);

const ACTIVITIES_REQUIRING_ROUTE = Object.freeze(
  /** @type {const} */ (['wandering', 'seekingFood', 'arriving', 'yielding']),
);

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').SlimeState} SlimeState
 * @typedef {import('./state.mjs').TutorialStep} TutorialStep
 * @typedef {import('./state.mjs').WorldState} WorldState
 * @typedef {import('./state.mjs').WorldResident} WorldResident
 * @typedef {import('./state.mjs').FoodState} FoodState
 * @typedef {import('./state.mjs').RouteState} RouteState
 * @typedef {import('./validate-legacy.mjs').LegacyV1Envelope} LegacyV1Envelope
 * @typedef {import('./validate-legacy.mjs').Settings} Settings
 * @typedef {import('./validate-legacy.mjs').Quality} Quality
 *
 * @typedef {object} SaveEnvelope
 * @property {'cozy-slime-mvp'} gameId
 * @property {1 | 2} schemaVersion
 * @property {1 | 2} balanceVersion
 * @property {number} revision
 * @property {number} savedWallMs
 * @property {GameState} state
 * @property {Settings} settings
 *
 * @typedef {{ ok: true, kind: 'current', save: SaveEnvelope } | { ok: true, kind: 'legacy-v1', save: LegacyV1Envelope } | { ok: false, reason: 'INVALID_JSON' | 'TOO_LARGE' | 'INVALID_STATE' | 'FUTURE_VERSION' }} ParseSaveResult
 */

/**
 * Default settings. Sound stays off; reduced motion follows the OS.
 *
 * @returns {Settings}
 */
export function createDefaultSettings() {
  return {
    soundEnabled: false,
    reducedMotion: null,
    animationsPaused: false,
    quality: 'auto',
  };
}

/**
 * @param {Settings} settings
 * @returns {Settings}
 */
function copySettings(settings) {
  return {
    soundEnabled: settings.soundEnabled,
    reducedMotion: settings.reducedMotion,
    animationsPaused: settings.animationsPaused,
    quality: settings.quality,
  };
}

/**
 * Current v2 envelope around economic state. `createInitialState()` may still
 * be garden-prototype-v1 in memory; this constructor copies economic fields,
 * attaches/creates world, and writes habitat farm-v2 / schema 2.
 *
 * @param {object} [options]
 * @param {number} [options.nowWallMs]
 * @param {number} [options.revision]
 * @param {GameState} [options.state]
 * @param {Settings} [options.settings]
 * @returns {SaveEnvelope}
 */
export function createFreshEnvelope(options = {}) {
  const nowWallMs = options.nowWallMs ?? 0;
  const revision = options.revision ?? 0;
  const source = options.state ? cloneState(options.state) : createInitialState();
  return {
    gameId: GAME_ID,
    schemaVersion: SCHEMA_VERSION_V2,
    balanceVersion: BALANCE_VERSION_V2,
    revision,
    savedWallMs: nowWallMs,
    state: toCurrentState(source),
    settings: options.settings
      ? copySettings(options.settings)
      : createDefaultSettings(),
  };
}

/**
 * @param {GameState} state
 * @returns {GameState}
 */
function toCurrentState(state) {
  const next = cloneState(state);
  next.habitatId = HABITAT_ID_V2;
  if (!next.world) {
    attachWorld(next, createWorld(next.slimes));
  }
  return next;
}

/**
 * @param {SlimeState} slime
 * @returns {SlimeState}
 */
function copySlime(slime) {
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
 * @param {GameState} state
 * @returns {object}
 */
function serializeStateV1(state) {
  const cloned = cloneState(state);
  return {
    simTimeMs: cloned.simTimeMs,
    glowMicro: cloned.glowMicro,
    lifetimeGlowMicro: cloned.lifetimeGlowMicro,
    incomeRemainder: cloned.incomeRemainder,
    berries: cloned.berries,
    nextBerryAtMs: cloned.nextBerryAtMs,
    nextFeedAllowedAtMs: preferredCooldownMs(cloned),
    totalFeeds: cloned.totalFeeds,
    upgrades: {
      shrub: cloned.upgrades.shrub,
      pantry: cloned.upgrades.pantry,
      bloom: cloned.upgrades.bloom,
      beds: cloned.upgrades.beds,
    },
    slimes: cloned.slimes.map((slime) => copySlime(slime)),
    tutorialCompleted: [...cloned.tutorialCompleted],
    habitatId: cloned.habitatId,
    arrivalStyleId: cloned.arrivalStyleId,
  };
}

/**
 * Explicit v2 payload. Does not rely on JSON.stringify of non-enumerable
 * `state.world` / `nextThrowAllowedAtMs`. Omits `nextFeedAllowedAtMs`;
 * reconstruct aliases it from `nextThrowAllowedAtMs`.
 *
 * @param {GameState} state
 * @returns {object}
 */
function serializeStateV2(state) {
  const cloned = cloneState(state);
  const world = cloned.world ? cloneWorld(cloned.world) : createWorld(cloned.slimes);
  return {
    simTimeMs: cloned.simTimeMs,
    glowMicro: cloned.glowMicro,
    lifetimeGlowMicro: cloned.lifetimeGlowMicro,
    incomeRemainder: cloned.incomeRemainder,
    berries: cloned.berries,
    nextBerryAtMs: cloned.nextBerryAtMs,
    nextThrowAllowedAtMs: preferredCooldownMs(cloned),
    totalFeeds: cloned.totalFeeds,
    upgrades: {
      shrub: cloned.upgrades.shrub,
      pantry: cloned.upgrades.pantry,
      bloom: cloned.upgrades.bloom,
      beds: cloned.upgrades.beds,
    },
    slimes: cloned.slimes.map((slime) => copySlime(slime)),
    tutorialCompleted: [...cloned.tutorialCompleted],
    habitatId: HABITAT_ID_V2,
    arrivalStyleId: cloned.arrivalStyleId,
    world,
  };
}

/**
 * Compact JSON of known envelope fields only.
 *
 * @param {SaveEnvelope | LegacyV1Envelope} envelope
 * @returns {string}
 */
export function serializeEnvelope(envelope) {
  const schemaVersion = envelope.schemaVersion;
  const state =
    schemaVersion === SCHEMA_VERSION_V2
      ? serializeStateV2(envelope.state)
      : serializeStateV1(envelope.state);
  return JSON.stringify({
    gameId: envelope.gameId,
    schemaVersion: envelope.schemaVersion,
    balanceVersion: envelope.balanceVersion,
    revision: envelope.revision,
    savedWallMs: envelope.savedWallMs,
    settings: copySettings(envelope.settings),
    state,
  });
}

/**
 * @param {'INVALID_JSON' | 'TOO_LARGE' | 'INVALID_STATE' | 'FUTURE_VERSION'} reason
 * @returns {ParseSaveResult}
 */
function fail(reason) {
  return { ok: false, reason };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {unknown} raw
 * @returns {RouteState | null | undefined}
 * `undefined` means the field was invalid (reject). `null` is a valid route.
 */
function reconstructRoute(raw) {
  if (raw === null) return null;
  if (!isPlainObject(raw)) return undefined;
  if (!Array.isArray(raw.points) || raw.points.length > MAX_PATH_POINTS) {
    return undefined;
  }
  if (raw.points.length < 2) return undefined;
  /** @type {{ x: number, z: number }[]} */
  const points = [];
  for (const point of raw.points) {
    if (!isFinitePoint(point)) return undefined;
    points.push({ x: point.x, z: point.z });
  }
  if (!isFiniteNumber(raw.length) || raw.length < 0) return undefined;
  if (!isLogicalTime(raw.startedWorldMs)) return undefined;
  if (!isNonnegSafeInteger(raw.cycleCount)) return undefined;
  if (!isFiniteNumber(raw.distanceAlong) || raw.distanceAlong < 0) {
    return undefined;
  }
  if (raw.distanceAlong > raw.length + GEOM_EPS) return undefined;

  let sum = 0;
  for (let index = 1; index < points.length; index += 1) {
    sum += pairDistance(points[index - 1], points[index]);
  }
  const tolerance = GEOM_EPS * Math.max(1, points.length);
  if (Math.abs(raw.length - sum) > tolerance) return undefined;

  return {
    points,
    length: raw.length,
    startedWorldMs: raw.startedWorldMs,
    cycleCount: raw.cycleCount,
    distanceAlong: raw.distanceAlong,
  };
}

/**
 * @param {unknown} raw
 * @returns {FoodState | null}
 */
function reconstructFood(raw) {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== 'string') return null;
  if (!isFinitePoint(raw.target)) return null;
  if (!isNonnegSafeInteger(raw.createdWorldMs)) return null;
  if (raw.createdWorldMs > LOGICAL_TIME_MAX_MS) return null;
  if (!isNonnegSafeInteger(raw.landAtWorldMs)) return null;
  if (raw.landAtWorldMs > LOGICAL_TIME_MAX_MS) return null;
  if (typeof raw.stage !== 'string' || !FOOD_STAGES.includes(raw.stage)) {
    return null;
  }
  if (raw.claimedBy !== null && typeof raw.claimedBy !== 'string') return null;
  if (raw.eatUntilWorldMs !== null && !isLogicalTime(raw.eatUntilWorldMs)) {
    return null;
  }
  return {
    id: /** @type {FoodState['id']} */ (raw.id),
    target: { x: raw.target.x, z: raw.target.z },
    createdWorldMs: raw.createdWorldMs,
    landAtWorldMs: raw.landAtWorldMs,
    stage: /** @type {FoodState['stage']} */ (raw.stage),
    claimedBy: raw.claimedBy,
    eatUntilWorldMs: raw.eatUntilWorldMs,
  };
}

/**
 * @param {unknown} raw
 * @returns {WorldResident | null}
 */
function reconstructResident(raw) {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== 'string') return null;
  if (!isFinitePoint(raw.position)) return null;
  if (!isFiniteNumber(raw.yaw)) return null;
  if (typeof raw.activity !== 'string' || !ACTIVITIES.includes(raw.activity)) {
    return null;
  }
  const route = reconstructRoute(raw.route);
  if (route === undefined) return null;
  if (raw.targetFoodId !== null && typeof raw.targetFoodId !== 'string') {
    return null;
  }
  if (!isLogicalTime(raw.nextDecisionWorldMs)) return null;
  if (!isLogicalTime(raw.restUntilWorldMs)) return null;
  if (raw.blockedSinceWorldMs !== null && !isLogicalTime(raw.blockedSinceWorldMs)) {
    return null;
  }
  if (!isLogicalTime(raw.nextReplanWorldMs)) return null;
  if (!isNonnegSafeInteger(raw.behaviorCounter)) return null;

  return {
    id: /** @type {WorldResident['id']} */ (raw.id),
    position: { x: raw.position.x, z: raw.position.z },
    yaw: raw.yaw,
    activity: /** @type {WorldResident['activity']} */ (raw.activity),
    route,
    targetFoodId: raw.targetFoodId,
    nextDecisionWorldMs: raw.nextDecisionWorldMs,
    restUntilWorldMs: raw.restUntilWorldMs,
    blockedSinceWorldMs: raw.blockedSinceWorldMs,
    nextReplanWorldMs: raw.nextReplanWorldMs,
    behaviorCounter: raw.behaviorCounter,
  };
}

/**
 * @param {unknown} raw
 * @returns {WorldState | null}
 */
function reconstructWorld(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw instanceof Map) return null;
  if (!isLogicalTime(raw.timeMs)) return null;
  if (raw.timeMs % WORLD_STEP_MS !== 0) return null;
  if (!isNonnegSafeInteger(raw.carryMs) || raw.carryMs > WORLD_CARRY_MAX_MS) {
    return null;
  }
  if (!isSafeInteger(raw.nextFoodSequence) || raw.nextFoodSequence < 1) {
    return null;
  }
  if (!Array.isArray(raw.foods) || raw.foods.length > MAX_FOOD) return null;
  if (!Array.isArray(raw.residents)) return null;

  /** @type {FoodState[]} */
  const foods = [];
  for (const entry of raw.foods) {
    const food = reconstructFood(entry);
    if (food === null) return null;
    foods.push(food);
  }

  /** @type {WorldResident[]} */
  const residents = [];
  for (const entry of raw.residents) {
    const resident = reconstructResident(entry);
    if (resident === null) return null;
    residents.push(resident);
  }

  return {
    timeMs: raw.timeMs,
    carryMs: raw.carryMs,
    nextFoodSequence: raw.nextFoodSequence,
    foods,
    residents,
  };
}

/**
 * @param {unknown} raw
 * @returns {GameState | null}
 */
function reconstructCurrentState(raw) {
  if (!isPlainObject(raw)) return null;
  if (!isLogicalTime(raw.simTimeMs)) return null;
  if (!isNonnegSafeInteger(raw.glowMicro)) return null;
  if (!isNonnegSafeInteger(raw.lifetimeGlowMicro)) return null;
  if (!isNonnegSafeInteger(raw.incomeRemainder)) return null;
  if (!isNonnegSafeInteger(raw.berries)) return null;
  if (raw.nextBerryAtMs !== null && !isLogicalTime(raw.nextBerryAtMs)) {
    return null;
  }
  const throwAt =
    raw.nextThrowAllowedAtMs !== undefined
      ? raw.nextThrowAllowedAtMs
      : raw.nextFeedAllowedAtMs;
  if (!isLogicalTime(throwAt)) return null;
  if (!isNonnegSafeInteger(raw.totalFeeds)) return null;
  if (!isPlainObject(raw.upgrades)) return null;
  if (!Array.isArray(raw.slimes)) return null;
  if (!Array.isArray(raw.tutorialCompleted)) return null;
  if (raw.habitatId !== HABITAT_ID_V2) return null;
  if (raw.arrivalStyleId !== ARRIVAL_STYLE_ID) return null;

  /** @type {Record<string, number>} */
  const upgrades = {};
  for (const id of UPGRADE_IDS) {
    const level = raw.upgrades[id];
    if (!isNonnegSafeInteger(level)) return null;
    if (level > UPGRADE_MAX_LEVEL[id]) return null;
    upgrades[id] = level;
  }

  /** @type {SlimeState[]} */
  const slimes = [];
  for (const entry of raw.slimes) {
    const slime = reconstructSlime(entry);
    if (slime === null) return null;
    slimes.push(slime);
  }

  /** @type {TutorialStep[]} */
  const tutorialCompleted = [];
  const seenSteps = new Set();
  for (const step of raw.tutorialCompleted) {
    if (typeof step !== 'string' || !TUTORIAL_STEP_SET.has(step)) return null;
    if (seenSteps.has(step)) return null;
    seenSteps.add(step);
    tutorialCompleted.push(/** @type {TutorialStep} */ (step));
  }

  const world = reconstructWorld(raw.world);
  if (world === null) return null;

  const state = {
    simTimeMs: raw.simTimeMs,
    glowMicro: raw.glowMicro,
    lifetimeGlowMicro: raw.lifetimeGlowMicro,
    incomeRemainder: raw.incomeRemainder,
    berries: raw.berries,
    nextBerryAtMs: raw.nextBerryAtMs,
    nextFeedAllowedAtMs: throwAt,
    totalFeeds: raw.totalFeeds,
    upgrades: {
      shrub: upgrades.shrub,
      pantry: upgrades.pantry,
      bloom: upgrades.bloom,
      beds: upgrades.beds,
    },
    slimes,
    tutorialCompleted,
    habitatId: HABITAT_ID_V2,
    arrivalStyleId: ARRIVAL_STYLE_ID,
  };
  attachThrowCooldownAlias(state, throwAt);
  attachWorld(state, world);
  return state;
}

/**
 * @param {string} id
 * @returns {number | null}
 */
function foodNumericId(id) {
  if (typeof id !== 'string' || !id.startsWith('food-')) return null;
  const n = Number(id.slice('food-'.length));
  if (!Number.isSafeInteger(n) || n < 1) return null;
  if (id !== `food-${n}`) return null;
  return n;
}

/**
 * @param {GameState} state
 * @param {number} cooldownMaxMs
 * @returns {boolean}
 */
function economicInvariantsHold(state, cooldownMaxMs) {
  if (state.glowMicro > state.lifetimeGlowMicro) return false;
  if (state.lifetimeGlowMicro > MAX_GLOW_MICRO) return false;
  if (state.incomeRemainder >= INCOME_REMAINDER_MOD) return false;
  if (state.totalFeeds > FEED_COUNTER_CAP) return false;

  const population = state.slimes.length;
  if (population < 1 || population > POPULATION_CAP) return false;
  if (population > getResidentCapacity(state)) return false;

  let feedSum = 0;
  for (let index = 0; index < population; index += 1) {
    const slime = state.slimes[index];
    const n = index + 1;
    if (slime.id !== `slime-${n}`) return false;
    if (slime.homeSlot !== n - 1) return false;
    if (slime.homeSlot < 0 || slime.homeSlot > 9) return false;
    if (slime.name.length < 1 || slime.name.length > NAME_MAX_LENGTH) {
      return false;
    }
    if (slime.createdAtMs > state.simTimeMs) return false;
    if (slime.feedCount > FEED_COUNTER_CAP) return false;
    feedSum += slime.feedCount;
    const boostDelta = slime.boostUntilMs - state.simTimeMs;
    if (boostDelta > 0 && boostDelta > BONUS_MAX_REMAINING_MS) return false;
  }
  if (feedSum !== state.totalFeeds) return false;

  const capacity = getBerryCapacity(state);
  if (state.berries > capacity) return false;
  if (state.berries === capacity) {
    if (state.nextBerryAtMs !== null) return false;
  } else {
    const nextBerryAtMs = state.nextBerryAtMs;
    if (nextBerryAtMs === null) return false;
    if (nextBerryAtMs <= state.simTimeMs) return false;
    const intervalMs = getBerryIntervalMs(state);
    if (nextBerryAtMs > state.simTimeMs + intervalMs) return false;
  }

  const cooldownDelta = preferredCooldownMs(state) - state.simTimeMs;
  if (cooldownDelta > 0 && cooldownDelta > cooldownMaxMs) return false;

  return true;
}

/**
 * v2 world structural/geometric invariants. Reject; do not repair or grant food.
 *
 * @param {GameState} state
 * @returns {boolean}
 */
function worldInvariantsHold(state) {
  const world = state.world;
  if (!world || world instanceof Map) return false;
  if (!Array.isArray(world.foods) || !Array.isArray(world.residents)) return false;
  if (world.foods.length > MAX_FOOD) return false;
  if (world.residents.length !== state.slimes.length) return false;

  const slimeIds = new Set(state.slimes.map((slime) => slime.id));
  const residentIds = new Set();
  /** @type {Map<string, WorldResident>} */
  const residentById = new Map();
  let routesWithPoints = 0;

  for (let index = 0; index < world.residents.length; index += 1) {
    const resident = world.residents[index];
    if (resident.id !== state.slimes[index].id) return false;
    if (residentIds.has(resident.id)) return false;
    if (!slimeIds.has(resident.id)) return false;
    residentIds.add(resident.id);
    residentById.set(resident.id, resident);

    const arriving = resident.activity === 'arriving';
    const positionOk =
      isValidResidentCenter(resident.position) ||
      (arriving && isInArrivalCorridor(resident.position));
    if (!positionOk) return false;

    if (
      ACTIVITIES_REQUIRING_ROUTE.includes(
        /** @type {(typeof ACTIVITIES_REQUIRING_ROUTE)[number]} */ (
          resident.activity
        ),
      )
    ) {
      if (resident.route == null || resident.route.points.length < 2) {
        return false;
      }
    }

    if (resident.route != null && resident.route.points.length > 0) {
      routesWithPoints += 1;
      if (resident.route.points.length > MAX_PATH_POINTS) return false;
    }
  }
  if (routesWithPoints > MAX_ACTIVE_ROUTES) return false;

  for (let i = 0; i < world.residents.length; i += 1) {
    for (let j = i + 1; j < world.residents.length; j += 1) {
      const distance = pairDistance(
        world.residents[i].position,
        world.residents[j].position,
      );
      if (distance < MIN_SEPARATION - GEOM_EPS) return false;
    }
  }

  const foodIds = new Set();
  /** @type {Map<string, FoodState>} */
  const foodById = new Map();
  for (const food of world.foods) {
    const n = foodNumericId(food.id);
    if (n === null || n >= world.nextFoodSequence) return false;
    if (foodIds.has(food.id)) return false;
    foodIds.add(food.id);
    foodById.set(food.id, food);
    if (!isValidFoodTarget(food.target)) return false;
    if (!(food.landAtWorldMs > food.createdWorldMs)) return false;

    if (food.stage === 'flying' || food.stage === 'landed') {
      if (food.claimedBy !== null) return false;
      if (food.eatUntilWorldMs !== null) return false;
    } else if (food.stage === 'claimed') {
      if (typeof food.claimedBy !== 'string') return false;
      if (food.eatUntilWorldMs !== null) return false;
    } else if (food.stage === 'eating') {
      if (typeof food.claimedBy !== 'string') return false;
      if (food.eatUntilWorldMs === null) return false;
    } else {
      return false;
    }

    if (food.claimedBy !== null && !residentById.has(food.claimedBy)) {
      return false;
    }
  }

  /** @type {Set<string>} */
  const claimedResidents = new Set();
  for (const food of world.foods) {
    if (food.claimedBy === null) continue;
    if (claimedResidents.has(food.claimedBy)) return false;
    claimedResidents.add(food.claimedBy);
    const resident = residentById.get(food.claimedBy);
    if (!resident || resident.targetFoodId !== food.id) return false;
  }

  for (const resident of world.residents) {
    if (resident.targetFoodId === null) continue;
    const food = foodById.get(resident.targetFoodId);
    if (!food || food.claimedBy !== resident.id) return false;
  }

  return true;
}

/**
 * @param {GameState} state
 * @returns {boolean}
 */
function currentStateInvariantsHold(state) {
  if (state.habitatId !== HABITAT_ID_V2) return false;
  if (!economicInvariantsHold(state, THROW_COOLDOWN_MS)) return false;
  if (!worldInvariantsHold(state)) return false;
  return true;
}

/**
 * @param {Record<string, unknown>} parsed
 * @returns {SaveEnvelope | null}
 */
function reconstructCurrentEnvelope(parsed) {
  if (parsed.gameId !== GAME_ID) return null;
  if (parsed.schemaVersion !== SCHEMA_VERSION_V2) return null;
  if (parsed.balanceVersion !== BALANCE_VERSION_V2) return null;
  if (!isNonnegSafeInteger(parsed.revision)) return null;
  if (!isSafeInteger(parsed.savedWallMs)) return null;

  const settings = reconstructSettings(parsed.settings);
  if (settings === null) return null;

  const state = reconstructCurrentState(parsed.state);
  if (state === null) return null;
  if (!currentStateInvariantsHold(state)) return null;

  return {
    gameId: GAME_ID,
    schemaVersion: SCHEMA_VERSION_V2,
    balanceVersion: BALANCE_VERSION_V2,
    revision: parsed.revision,
    savedWallMs: parsed.savedWallMs,
    settings,
    state,
  };
}

/**
 * Schema/balance greater than the supported current envelope (2/2).
 *
 * @param {unknown} schemaVersion
 * @param {unknown} balanceVersion
 * @returns {boolean}
 */
function isFutureVersion(schemaVersion, balanceVersion) {
  if (
    typeof schemaVersion === 'number' &&
    Number.isInteger(schemaVersion) &&
    Number.isFinite(schemaVersion) &&
    schemaVersion > SCHEMA_VERSION_V2
  ) {
    return true;
  }
  if (
    typeof schemaVersion === 'number' &&
    Number.isInteger(schemaVersion) &&
    Number.isFinite(schemaVersion) &&
    schemaVersion >= SCHEMA_VERSION &&
    typeof balanceVersion === 'number' &&
    Number.isInteger(balanceVersion) &&
    Number.isFinite(balanceVersion) &&
    balanceVersion > BALANCE_VERSION_V2
  ) {
    return true;
  }
  return false;
}

/**
 * Parse and reconstruct. Extra enumerable fields are dropped.
 *
 * @param {unknown} text
 * @returns {ParseSaveResult}
 */
export function validateSave(text) {
  if (typeof text !== 'string' || text.length > SAVE_TEXT_MAX_LENGTH) {
    return fail('TOO_LARGE');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('INVALID_JSON');
  }

  if (!isPlainObject(parsed)) {
    return fail('INVALID_STATE');
  }

  if (parsed.gameId !== GAME_ID) return fail('INVALID_STATE');

  if (isFutureVersion(parsed.schemaVersion, parsed.balanceVersion)) {
    return fail('FUTURE_VERSION');
  }

  if (
    parsed.schemaVersion === SCHEMA_VERSION &&
    parsed.balanceVersion === BALANCE_VERSION
  ) {
    const save = reconstructLegacyEnvelope(parsed);
    if (save === null) return fail('INVALID_STATE');
    return { ok: true, kind: 'legacy-v1', save };
  }

  if (
    parsed.schemaVersion === SCHEMA_VERSION_V2 &&
    parsed.balanceVersion === BALANCE_VERSION_V2
  ) {
    const save = reconstructCurrentEnvelope(parsed);
    if (save === null) return fail('INVALID_STATE');
    return { ok: true, kind: 'current', save };
  }

  return fail('INVALID_STATE');
}
