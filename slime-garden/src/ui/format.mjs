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

/** Contextual HUD names for the four farm objects. */
export const HUD_OBJECT_LABELS = Object.freeze({
  shrub: 'Berry shrub',
  pantry: 'Pantry basket',
  bloom: 'Glow flowers',
  beds: 'Resting area',
});

/**
 * Concise player-facing HUD strings. Mechanics stay in core; this is copy only.
 */
export const HUD_COPY = Object.freeze({
  berryTossed: 'Berry tossed',
  foodLimit: 'Let them finish the berries on the grass',
  invalidTarget: 'Toss onto open grass inside the fence',
  noValidTarget: 'Choose another patch of grass',
  chooseSlime: 'Choose a slime',
  alreadyPetted: 'Already enjoying a pat',
  missingPad: 'A new friend needs a resting pad',
  fullColony: 'All ten friends are home',
  companionNeeds: 'Next friend needs care, Glow, and a resting pad.',
  companionReady: 'Care, Glow, and space are ready — a friend joins on their own.',
  unsaved: 'Progress is not saved · Export a copy',
  sessionOnly: 'Session-only',
  secondaryTab: 'This farm is active in another tab',
  saved: 'Saved',
  orbitHint: 'Drag to orbit · Two fingers to pan/zoom',
  backToCare: 'Back to care',
  cameraUnavailable:
    'Camera needs the 3D garden. Use Farm controls to toss berries.',
  offerNearNote: 'Another nearby slime may reach it first.',
  pauseNote: 'Pause scene motion; farm activity continues.',
  maxLevel: 'Max level',
  upgrade: 'Upgrade',
});

export const TUTORIAL_COPY = Object.freeze({
  feed: 'Tap the grass to toss a berry.',
  berry: 'Berries grow back on their own.',
  welcome: 'New friends join on their own when care, Glow, and a pad are ready.',
  upgrade: 'Tap a farm object, then Upgrade, to spend Glow.',
  throw: 'Tap open grass inside the fence to toss a berry.',
  pet: 'Choose Hand, then pet a slime.',
  camera: 'Use +/− or Orbit to look around the farm.',
});

export const ACTIVITY_COPY = Object.freeze({
  idle: 'Resting',
  wandering: 'Wandering',
  seekingFood: 'Heading to a berry',
  eating: 'Eating',
  arriving: 'Arriving',
  yielding: 'Waiting',
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

/**
 * @param {UpgradeId | string} id
 * @returns {string}
 */
export function formatHudObjectLabel(id) {
  return HUD_OBJECT_LABELS[/** @type {UpgradeId} */ (id)] ?? formatUpgradeLabel(id);
}

/**
 * Current → next effect for a contextual upgrade card.
 *
 * @param {GameState} state
 * @param {UpgradeId | string} id
 * @returns {string}
 */
export function formatUpgradeCardEffect(state, id) {
  const max = UPGRADE_MAX_LEVEL[/** @type {UpgradeId} */ (id)];
  if (max == null) return '';
  const level = state.upgrades[/** @type {UpgradeId} */ (id)];
  if (typeof level !== 'number' || level >= max) return HUD_COPY.maxLevel;
  switch (id) {
    case 'shrub':
      return `Berries grow every ${SHRUB_INTERVALS_MS[level] / 1000}s → ${SHRUB_INTERVALS_MS[level + 1] / 1000}s`;
    case 'pantry':
      return `Hold ${PANTRY_CAPACITIES[level]} → ${PANTRY_CAPACITIES[level + 1]} berries`;
    case 'bloom':
      return 'All friends make +25 percentage points more Glow';
    case 'beds':
      return `Room for ${BEDS_CAPACITIES[level]} → ${BEDS_CAPACITIES[level + 1]} friends`;
    default:
      return '';
  }
}

/**
 * @param {string} [activity]
 * @returns {string}
 */
export function formatActivity(activity) {
  if (activity && Object.prototype.hasOwnProperty.call(ACTIVITY_COPY, activity)) {
    return ACTIVITY_COPY[/** @type {keyof typeof ACTIVITY_COPY} */ (activity)];
  }
  return ACTIVITY_COPY.idle;
}

/**
 * @param {number} feedCount
 * @returns {string}
 */
export function formatMealCount(feedCount) {
  const n = typeof feedCount === 'number' && Number.isFinite(feedCount) ? feedCount : 0;
  if (n === 1) return '1 meal';
  return `${n} meals`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function formatSeekingStatus(name) {
  return `${name} is heading to a berry`;
}

/**
 * @param {string} name
 * @param {number} bonusMs
 * @returns {string}
 */
export function formatMealCompleteStatus(name, bonusMs) {
  return `${name} enjoyed a berry · Cozy bonus ${formatDuration(bonusMs)}`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function formatArrivalStatus(name) {
  return `${name} joined the farm`;
}

/**
 * @param {number} count
 * @returns {string}
 */
export function formatPendingFood(count) {
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, count) : 0;
  if (n === 0) return 'No berries on the grass';
  if (n === 1) return '1 berry on the grass';
  return `${n} berries on the grass`;
}

/**
 * Command reject copy. Timer reasons need live state for remaining ms.
 *
 * @param {string} reason
 * @param {GameState} [state]
 * @returns {string}
 */
export function formatThrowReject(reason, state) {
  switch (reason) {
    case 'NO_BERRIES': {
      const remaining =
        !state || state.nextBerryAtMs == null
          ? 0
          : state.nextBerryAtMs - state.simTimeMs;
      return `More berries in ${formatDuration(remaining)}`;
    }
    case 'THROW_COOLDOWN': {
      const until = state
        ? Number.isInteger(state.nextThrowAllowedAtMs)
          ? state.nextThrowAllowedAtMs
          : state.nextFeedAllowedAtMs
        : 0;
      const remaining = state ? until - state.simTimeMs : 0;
      return `Ready to toss in ${formatDuration(remaining)}`;
    }
    case 'FOOD_LIMIT':
      return HUD_COPY.foodLimit;
    case 'INVALID_TARGET':
      return HUD_COPY.invalidTarget;
    case 'NO_VALID_TARGET':
      return HUD_COPY.noValidTarget;
    default:
      return '';
  }
}
