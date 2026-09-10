/**
 * Bind approved slime actors to authoritative WorldResident snapshots.
 * Visual walk phase comes from the world route clock (stride 1.0, 1250 ms,
 * travel 0.29–0.68). Blink/idle offsets stay per-id. Does not plan routes,
 * write Glow, or call actor.update() (that clock would fight the gait).
 */

import { GAIT_CYCLE_MS } from '../core/balance.mjs';
import { TRAVEL_PHASE_END, TRAVEL_PHASE_START } from '../world/gait.mjs';
import { hashIntInclusive, hashUnit } from '../world/hash.mjs';
import { idlePhaseOffsetSec } from './motion.mjs';

export { TRAVEL_PHASE_START, TRAVEL_PHASE_END };

/** Walk-blend time constant (~200 ms, matching actor.update damp rate 5). */
export const WALK_BLEND_RATE = 5;
export const WALK_BLEND_MS = 200;

const TRAVEL_ACTIVITIES = new Set([
  'wandering',
  'seekingFood',
  'arriving',
  'yielding',
]);

/**
 * @param {import('../world/state.mjs').WorldResident | null | undefined} resident
 * @returns {boolean}
 */
export function residentIsTraveling(resident) {
  if (!resident) return false;
  if (!TRAVEL_ACTIVITIES.has(resident.activity)) return false;
  const route = resident.route;
  return !!(route && Array.isArray(route.points) && route.points.length >= 2);
}

/**
 * 0..1 walk cycle phase from the same clock as `world/gait.mjs`.
 *
 * @param {{ startedWorldMs?: number, cycleCount?: number } | null | undefined} route
 * @param {number} worldTimeMs `world.timeMs` (not carry — matches progressResident)
 * @returns {number}
 */
export function visualWalkPhase(route, worldTimeMs) {
  if (!route) return 0;
  const started = Number(route.startedWorldMs);
  const elapsed = Number(worldTimeMs) - started;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  const cycles = Math.max(1, Number(route.cycleCount) || 1);
  const total = cycles * GAIT_CYCLE_MS;
  if (elapsed >= total) return TRAVEL_PHASE_END;
  const raw = elapsed / GAIT_CYCLE_MS;
  return raw - Math.floor(raw);
}

/**
 * Renderer-only look when activity is idle. Does not move XZ or interrupt eating.
 *
 * @param {string} id
 * @param {number} worldMs
 * @param {string} [activity]
 * @returns {number}
 */
export function idleLookYaw(id, worldMs, activity) {
  if (activity !== 'idle') return 0;
  const t = Number(worldMs);
  if (!Number.isFinite(t) || t < 0) return 0;
  const interval = hashIntInclusive(id, 0, 'look-int', 8000, 15000);
  const duration = hashIntInclusive(id, 0, 'look-dur', 800, 1500);
  const phase = ((t % interval) + interval) % interval;
  if (phase > duration) return 0;
  const amp = (hashUnit(id, 0, 'look-amp') - 0.5) * 0.8;
  return Math.sin((phase / duration) * Math.PI) * amp;
}

/**
 * @param {number} current
 * @param {number} target
 * @param {number} dtSec
 * @returns {number}
 */
export function dampWalkBlend(current, target, dtSec) {
  const dt = Math.max(0, Math.min(0.05, Number(dtSec) || 0));
  const cur = Number.isFinite(current) ? current : 0;
  const tgt = Number.isFinite(target) ? target : 0;
  if (dt <= 0) return cur;
  return cur + (tgt - cur) * (1 - Math.exp(-WALK_BLEND_RATE * dt));
}

/**
 * Per-actor walk blend / idle clocks so pose.t (blink) stays independent of gait.
 *
 * @returns {{
 *   forget: (id: string) => void,
 *   apply: (
 *     actor: {
 *       setWorldPose: (next: { x?: number, z?: number, yaw?: number }) => void,
 *       setPose: (next: { timeSec?: number, walkPhase?: number, walkBlend?: number, paused?: boolean }) => void,
 *     },
 *     resident: import('../world/state.mjs').WorldResident,
 *     ctx: {
 *       worldTimeMs: number,
 *       dtSec: number,
 *       paused: boolean,
 *       reducedMotion: boolean,
 *     },
 *   ) => { walkPhase: number, walkBlend: number, yaw: number },
 *   dispose: () => void,
 * }}
 */
export function createPoseBinder() {
  /** @type {Map<string, number>} */
  const blends = new Map();
  /** @type {Map<string, number>} */
  const times = new Map();

  /**
   * @param {string} id
   */
  function forget(id) {
    blends.delete(id);
    times.delete(id);
  }

  /**
   * @param {{ setWorldPose: Function, setPose: Function }} actor
   * @param {import('../world/state.mjs').WorldResident} resident
   * @param {{ worldTimeMs: number, dtSec: number, paused: boolean, reducedMotion: boolean }} ctx
   */
  function apply(actor, resident, ctx) {
    const id = resident.id;
    const paused = !!ctx.paused;
    const reduced = !!ctx.reducedMotion;
    const traveling = residentIsTraveling(resident);
    const worldTimeMs = Number(ctx.worldTimeMs) || 0;

    let timeSec = times.get(id);
    if (timeSec == null) timeSec = idlePhaseOffsetSec(id);
    if (!paused && !reduced) {
      timeSec += Math.max(0, Math.min(0.05, Number(ctx.dtSec) || 0));
    }
    times.set(id, timeSec);

    const targetBlend = traveling && !reduced ? 1 : 0;
    let walkBlend = blends.get(id) ?? 0;
    if (reduced) {
      walkBlend = 0;
    } else if (!paused) {
      walkBlend = dampWalkBlend(walkBlend, targetBlend, ctx.dtSec);
    }
    blends.set(id, walkBlend);

    const walkPhase =
      traveling && !reduced ? visualWalkPhase(resident.route, worldTimeMs) : 0;
    const look =
      reduced || paused ? 0 : idleLookYaw(id, worldTimeMs, resident.activity);
    const yaw = (Number(resident.yaw) || 0) + look;

    actor.setWorldPose({
      x: resident.position.x,
      z: resident.position.z,
      yaw,
    });
    actor.setPose({
      timeSec,
      walkPhase,
      walkBlend,
      paused: paused || reduced,
    });

    return { walkPhase, walkBlend, yaw };
  }

  function dispose() {
    blends.clear();
    times.clear();
  }

  return { forget, apply, dispose };
}
