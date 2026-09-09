/**
 * One 50 ms world step: gait progress, then wander/yield decisions.
 * Food landing, claims, and meals are P2-07/P2-08; empty foods stay a no-op.
 * Pure: no DOM, Three, wall-clock APIs, randomness, or scene.
 */

import { GEOM_EPS } from '../core/balance.mjs';
import {
  applyIdleDecisions,
  scheduleIdleWait,
} from './behavior.mjs';
import { gaitFraction, poseAlongPolyline } from './gait.mjs';
import { copyPoint } from './geom.mjs';
import { cloneWorld } from './state.mjs';

/**
 * @typedef {import('./state.mjs').GameState} GameState
 * @typedef {import('./state.mjs').WorldState} WorldState
 * @typedef {import('./state.mjs').WorldResident} WorldResident
 * @typedef {import('./state.mjs').RouteState} RouteState
 *
 * @typedef {object} MealCompletion
 * @property {string} foodId
 * @property {string} slimeId
 *
 * @typedef {object} WorldStepResult
 * @property {WorldState} world
 * @property {MealCompletion[]} meals
 * @property {object[]} events
 */

/**
 * @param {WorldResident} resident
 * @param {number} timeMs
 */
function completeTravel(resident, timeMs) {
  const route = resident.route;
  if (route && route.points.length > 0) {
    resident.position = copyPoint(route.points[route.points.length - 1]);
    const pose = poseAlongPolyline(route.points, route.length);
    resident.yaw = pose.yaw;
  }
  resident.route = null;
  resident.activity = 'idle';
  scheduleIdleWait(resident, timeMs);
}

/**
 * Advance one reserved route using the world gait clock.
 *
 * @param {WorldResident} resident
 * @param {number} timeMs
 */
export function progressResident(resident, timeMs) {
  const route = resident.route;
  if (route == null || !Array.isArray(route.points) || route.points.length < 2) {
    return;
  }
  const elapsed = timeMs - route.startedWorldMs;
  const fraction = gaitFraction(elapsed, route.cycleCount);
  if (fraction >= 1 - GEOM_EPS) {
    completeTravel(resident, timeMs);
    return;
  }
  const distance = fraction * route.length;
  route.distanceAlong = distance;
  const pose = poseAlongPolyline(route.points, distance);
  resident.position = pose.position;
  resident.yaw = pose.yaw;
}

/**
 * Precondition: the active wrapper has already added 50 to `world.timeMs`.
 * Never mutates `state`. Meals stay empty while `world.foods` is empty.
 *
 * @param {GameState} state
 * @returns {WorldStepResult}
 */
export function stepWorld(state) {
  const world = cloneWorld(state.world);
  const timeMs = world.timeMs;
  for (const resident of world.residents) {
    progressResident(resident, timeMs);
  }
  applyIdleDecisions(world);
  return {
    world,
    meals: [],
    events: [],
  };
}
