/**
 * Pure display formatting for Glow, rates, costs, and timers.
 * No DOM. Integer micro-Glow and milliseconds in; strings out.
 */

import {
  BEDS_CAPACITIES,
  BLOOM_BONUS_PER_LEVEL,
  MAX_GLOW_MICRO,
  MICRO_PER_GLOW,
  PANTRY_CAPACITIES,
  SHRUB_INTERVALS_MS,
  UPGRADE_MAX_LEVEL,
} from '../core/balance.mjs';

/**
 * @typedef {import('../core/state.mjs').GameState} GameState
 * @typedef {import('../core/state.mjs').UpgradeId} UpgradeId
 */

/** Player-facing upgrade names. IDs and numbers still come from balance. */
export const UPGRADE_LABELS = Object.freeze({
  shrub: 'Berry shrub',
  pantry: 'Pantry basket',
  bloom: 'Glow bloom',
  beds: 'Resting pads',
});

/**
 * Trim trailing zeros from a decimal string while keeping at least one digit
 * after the point when the value is not an integer.
 *
 * @param {number} value
 * @param {number} maxDecimals
 * @returns {string}
 */
function formatDecimal(value, maxDecimals) {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  const text = value.toFixed(maxDecimals).replace(/0+$/, '').replace(/\.$/, '');
  return text.length > 0 ? text : '0';
}

/**
 * Compact Glow for amounts at or above 1,000 (not the wallet-cap “Max” path).
 *
 * @param {number} glow
 * @returns {string}
 */
function formatCompactGlow(glow) {
  const unit = glow >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = glow >= 1_000_000 ? 'M' : 'k';
  const scaled = glow / unit;
  const tenths = Math.floor(scaled * 10 + 1e-9);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  if (frac === 0) return `${whole}${suffix}`;
  return `${whole}.${frac}${suffix}`;
}

/**
 * Glow amount for progress, previews, and summaries. One decimal below 1,000
 * Glow; compact above. Does not substitute “Max”.
 *
 * @param {number} micro
 * @returns {string}
 */
export function formatGlowAmount(micro) {
  if (typeof micro !== 'number' || !Number.isFinite(micro)) return '0.0';
  const abs = Math.abs(micro);
  const sign = micro < 0 ? '-' : '';
  if (abs < 1000 * MICRO_PER_GLOW) {
    const tenths = Math.floor(abs / (MICRO_PER_GLOW / 10));
    return `${sign}${(tenths / 10).toFixed(1)}`;
  }
  return `${sign}${formatCompactGlow(abs / MICRO_PER_GLOW)}`;
}

/**
 * Spendable wallet Glow. At the storage cap this is “Max”.
 *
 * @param {number} micro
 * @param {number} [capMicro]
 * @returns {string}
 */
export function formatWalletGlow(micro, capMicro = MAX_GLOW_MICRO) {
  if (typeof micro === 'number' && Number.isFinite(micro) && micro >= capMicro) {
    return 'Max';
  }
  return formatGlowAmount(micro);
}

/**
 * Production rate such as `0.1/s` or `1.35/s`.
 *
 * @param {number} microPerSecond
 * @returns {string}
 */
export function formatRate(microPerSecond) {
  if (typeof microPerSecond !== 'number' || !Number.isFinite(microPerSecond)) {
    return '0/s';
  }
  const glow = microPerSecond / MICRO_PER_GLOW;
  return `${formatDecimal(glow, 4)}/s`;
}

/**
 * Exact purchase cost from micro-Glow. Whole Glow stays an integer string;
 * fractional Glow keeps every non-zero micro digit.
 *
 * @param {number} micro
 * @returns {string}
 */
export function formatCostMicro(micro) {
  if (typeof micro !== 'number' || !Number.isFinite(micro)) return '0';
  const sign = micro < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(micro));
  if (abs % MICRO_PER_GLOW === 0) {
    return `${sign}${abs / MICRO_PER_GLOW}`;
  }
  const whole = Math.trunc(abs / MICRO_PER_GLOW);
  const frac = abs % MICRO_PER_GLOW;
  const fracStr = String(frac).padStart(6, '0').replace(/0+$/, '');
  return `${sign}${whole}.${fracStr}`;
}

/**
 * Cost label including the unit, e.g. `15 Glow`.
 *
 * @param {number} micro
 * @returns {string}
 */
export function formatCostLabel(micro) {
  return `${formatCostMicro(micro)} Glow`;
}

/**
 * Remaining time as `m:ss`. Uses ceil so a disabled control never shows `0:00`
 * while a millisecond is still left.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Human absence length for the welcome-back note.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatAway(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Local calendar stamp for export filenames (`YYYY-MM-DD`).
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function formatExportDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Saved-at label for import preview and recovery copy.
 *
 * @param {number} savedWallMs
 * @returns {string}
 */
export function formatSavedDate(savedWallMs) {
  if (typeof savedWallMs !== 'number' || !Number.isFinite(savedWallMs)) {
    return 'unknown date';
  }
  const date = new Date(savedWallMs);
  if (Number.isNaN(date.getTime())) return 'unknown date';
  try {
    return date.toLocaleString();
  } catch {
    return date.toISOString();
  }
}

/**
 * Glow still needed to afford an exact micro cost.
 *
 * @param {number} costMicro
 * @param {number} walletMicro
 * @returns {string}
 */
export function formatShortfall(costMicro, walletMicro) {
  const need = Math.max(0, costMicro - walletMicro);
  if (need <= 0) return '';
  return `Need ${formatCostLabel(need)} more`;
}

/**
 * Next-level effect for an upgrade row, derived from balance tables.
 *
 * @param {GameState} state
 * @param {UpgradeId | string} id
 * @returns {string}
 */
export function formatNextUpgradeEffect(state, id) {
  const max = UPGRADE_MAX_LEVEL[/** @type {UpgradeId} */ (id)];
  if (max == null) return '';
  const level = state.upgrades[/** @type {UpgradeId} */ (id)];
  if (typeof level !== 'number' || level >= max) return 'Maxed';
  switch (id) {
    case 'shrub':
      return `Berries every ${SHRUB_INTERVALS_MS[level + 1] / 1000}s (restarts an incomplete timer)`;
    case 'pantry':
      return `Holds ${PANTRY_CAPACITIES[level + 1]} berries`;
    case 'bloom':
      return `+${BLOOM_BONUS_PER_LEVEL * 100}% Glow for every slime`;
    case 'beds':
      return `Room for ${BEDS_CAPACITIES[level + 1]} slimes`;
    default:
      return '';
  }
}

/**
 * @param {UpgradeId | string} id
 * @returns {string}
 */
export function formatUpgradeLabel(id) {
  return UPGRADE_LABELS[/** @type {UpgradeId} */ (id)] ?? String(id);
}

/**
 * User-facing text for a rejected import / parse.
 *
 * @param {string} reason
 * @returns {string}
 */
export function formatImportFailure(reason) {
  switch (reason) {
    case 'FUTURE_VERSION':
      return 'This save is from a newer version of the game. Your garden was not changed.';
    case 'TOO_LARGE':
      return 'This file is too large to be a valid save. Your garden was not changed.';
    case 'INVALID_JSON':
    case 'INVALID_STATE':
    default:
      return 'This file is not a valid save. Your garden was not changed.';
  }
}
