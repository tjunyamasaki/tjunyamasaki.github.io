/**
 * Visible-session millisecond carry. Frames may be fractional; the simulation
 * only consumes whole milliseconds. Pure: no DOM, Three, Date, or randomness.
 */

/**
 * Fold a monotonic frame delta into the leftover carry. Negative or non-finite
 * deltas contribute nothing so a glitchy clock cannot rewind simulation.
 *
 * @param {number} carryMs
 * @param {number} deltaMs
 * @returns {number}
 */
export function absorbFrameDelta(carryMs, deltaMs) {
  const carry = Number.isFinite(carryMs) ? carryMs : 0;
  const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  return carry + delta;
}

/**
 * Peel whole milliseconds off the carry for `advance`. The leftover stays in
 * `[0, 1)` under ordinary positive finite input.
 *
 * @param {number} carryMs
 * @returns {{ carryMs: number, elapsedMs: number }}
 */
export function flushWholeMs(carryMs) {
  if (!Number.isFinite(carryMs) || carryMs <= 0) {
    return { carryMs: 0, elapsedMs: 0 };
  }
  const elapsedMs = Math.floor(carryMs);
  return { carryMs: carryMs - elapsedMs, elapsedMs };
}
