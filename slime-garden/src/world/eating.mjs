/**
 * Start eating in range and collect due meal intents. Glow / boost / FED
 * belong to the active wrapper (`finishMeal`), not this module.
 * Pure: no DOM, Three, wall-clock APIs, randomness, or scene.
 */

import { EAT_DURATION_MS } from '../core/balance.mjs';
import { scheduleIdleWait } from './behavior.mjs';
import { foodNumericId, isInEatingRange } from './food.mjs';
import { yawFromDirection } from './gait.mjs';

/**
 * @typedef {import('./state.mjs').WorldState} WorldState
 * @typedef {import('./state.mjs').WorldResident} WorldResident
 * @typedef {import('./state.mjs').FoodState} FoodState
 * @typedef {{ foodId: string, slimeId: string }} MealCompletion
 */

/**
 * @param {WorldResident} resident
 * @param {{ x: number, z: number }} food
 */
function faceFood(resident, food) {
  resident.yaw = yawFromDirection(
    food.x - resident.position.x,
    food.z - resident.position.z,
  );
}

/**
 * @param {WorldState} world
 * @param {string} id
 * @returns {WorldResident | null}
 */
function residentById(world, id) {
  return world.residents.find((resident) => resident.id === id) ?? null;
}

/**
 * Release an inconsistent eating/claimed pair without deleting the berry.
 *
 * @param {WorldState} world
 * @param {FoodState} food
 */
function releaseFailedEating(world, food) {
  const timeMs = world.timeMs;
  const resident =
    food.claimedBy != null ? residentById(world, food.claimedBy) : null;
  food.claimedBy = null;
  food.stage = 'landed';
  food.eatUntilWorldMs = null;
  if (!resident) return;
  if (resident.targetFoodId === food.id) {
    resident.targetFoodId = null;
  }
  resident.route = null;
  if (resident.activity === 'seekingFood' || resident.activity === 'eating') {
    resident.activity = 'idle';
    scheduleIdleWait(resident, timeMs);
  }
}

/**
 * Completion preconditions from plan 02 §5. Does not grant rewards.
 *
 * @param {WorldState} world
 * @param {FoodState} food
 * @returns {boolean}
 */
export function isMealConsistent(world, food) {
  if (!food || food.stage !== 'eating') return false;
  if (food.eatUntilWorldMs == null) return false;
  if (world.timeMs < food.eatUntilWorldMs) return false;
  if (typeof food.claimedBy !== 'string') return false;
  const stillThere = world.foods.some((entry) => entry.id === food.id);
  if (!stillThere) return false;
  const resident = residentById(world, food.claimedBy);
  if (!resident) return false;
  if (resident.targetFoodId !== food.id) return false;
  if (resident.activity !== 'eating') return false;
  return isInEatingRange(resident.position, food.target);
}

/**
 * Due eating meals from previous steps, oldest `food-n` first. Inconsistent
 * rows are released and omitted. Food records stay in `world.foods`.
 *
 * @param {WorldState} world
 * @returns {MealCompletion[]}
 */
export function collectDueMeals(world) {
  /** @type {MealCompletion[]} */
  const meals = [];
  const due = world.foods
    .filter(
      (food) =>
        food.stage === 'eating' &&
        food.eatUntilWorldMs != null &&
        world.timeMs >= food.eatUntilWorldMs,
    )
    .sort((a, b) => foodNumericId(a.id) - foodNumericId(b.id));

  for (const food of due) {
    if (!isMealConsistent(world, food) || food.claimedBy == null) {
      releaseFailedEating(world, food);
      continue;
    }
    meals.push({ foodId: food.id, slimeId: food.claimedBy });
  }
  return meals;
}

/**
 * Reciprocal claimants already in eating range stop walking and start the
 * 800 ms meal. Does not complete the meal or grant a boost.
 *
 * @param {WorldState} world
 * @param {number} atMs
 * @param {object[]} events
 */
export function startEatingInRange(world, atMs, events) {
  const foods = [...world.foods].sort(
    (a, b) => foodNumericId(a.id) - foodNumericId(b.id),
  );
  for (const food of foods) {
    if (food.claimedBy == null) continue;
    if (food.stage === 'flying' || food.stage === 'eating') continue;
    const resident = residentById(world, food.claimedBy);
    if (!resident || resident.targetFoodId !== food.id) continue;
    if (resident.activity === 'arriving' || resident.activity === 'eating') {
      continue;
    }
    if (!isInEatingRange(resident.position, food.target)) continue;
    resident.route = null;
    faceFood(resident, food.target);
    resident.activity = 'eating';
    resident.blockedSinceWorldMs = null;
    food.stage = 'eating';
    food.eatUntilWorldMs = world.timeMs + EAT_DURATION_MS;
    events.push({
      type: 'EATING_STARTED',
      foodId: food.id,
      slimeId: resident.id,
      atMs,
    });
  }
}
