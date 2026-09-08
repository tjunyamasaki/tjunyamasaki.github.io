/**
 * Primary/backup local checkpoints. Storage is injectable (MemoryStorage in
 * tests, localStorage in the browser). Only the two game keys are read or
 * written; unrelated origin keys are left alone.
 */

import { cloneState } from '../core/state.mjs';
import {
  serializeEnvelope as serializeValidatedEnvelope,
  validateSave,
} from '../core/validate.mjs';
import { reconcileAway } from './reconcile.mjs';

export const PRIMARY_KEY = 'cozy-slime-mvp:primary:v1';
export const BACKUP_KEY = 'cozy-slime-mvp:backup:v1';

export { serializeValidatedEnvelope as serializeEnvelope };

/**
 * @typedef {import('../core/validate.mjs').SaveEnvelope} SaveEnvelope
 * @typedef {import('../core/validate.mjs').ParseSaveResult} ParseSaveResult
 *
 * @typedef {object} StorageLike
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 *
 * @typedef {object} LoadBestOk
 * @property {true} ok
 * @property {SaveEnvelope} save
 * @property {'primary' | 'backup'} source
 * @property {string | null} primaryRaw
 * @property {string | null} backupRaw
 *
 * @typedef {object} LoadBestFail
 * @property {false} ok
 * @property {'EMPTY' | 'CORRUPT' | 'FUTURE_VERSION'} reason
 * @property {string | null} primaryRaw
 * @property {string | null} backupRaw
 *
 * @typedef {LoadBestOk | LoadBestFail} LoadBestResult
 *
 * @typedef {object} WriteCheckpointResult
 * @property {boolean} saved
 * @property {SaveEnvelope | null} envelope
 * @property {unknown} error
 * @property {unknown} backupError
 *
 * @typedef {object} ImportPreview
 * @property {number} population
 * @property {number} glowMicro
 * @property {number} savedWallMs
 * @property {string} savedAt
 */

/**
 * In-memory Storage-like map. Does not expose a full-origin wipe.
 *
 * @param {object} [options]
 * @param {boolean} [options.throwOnSet]
 * @param {Iterable<string>} [options.throwOnSetKeys]
 * @param {unknown} [options.throwOnGet]
 * @returns {StorageLike & { data: Map<string, string> }}
 */
export function createMemoryStorage(options = {}) {
  /** @type {Map<string, string>} */
  const data = new Map();
  const throwOnSetKeys = new Set(options.throwOnSetKeys ?? []);

  return {
    data,
    getItem(key) {
      if (options.throwOnGet) {
        throw options.throwOnGet;
      }
      return data.has(key) ? /** @type {string} */ (data.get(key)) : null;
    },
    setItem(key, value) {
      if (options.throwOnSet === true || throwOnSetKeys.has(key)) {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      }
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

/**
 * @param {StorageLike} storage
 * @param {string} key
 * @returns {string | null}
 */
function safeGet(storage, key) {
  try {
    const value = storage.getItem(key);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | null} raw
 * @returns {ParseSaveResult | { ok: false, reason: 'MISSING' }}
 */
function parseRaw(raw) {
  if (raw === null) return { ok: false, reason: 'MISSING' };
  return validateSave(raw);
}

/**
 * Choose the better of two valid envelopes: greater revision, then savedWallMs.
 * Equal pairs prefer `primary`.
 *
 * @param {SaveEnvelope} primary
 * @param {SaveEnvelope} backup
 * @returns {'primary' | 'backup'}
 */
function preferSource(primary, backup) {
  if (backup.revision > primary.revision) return 'backup';
  if (primary.revision > backup.revision) return 'primary';
  if (backup.savedWallMs > primary.savedWallMs) return 'backup';
  return 'primary';
}

/**
 * Read both checkpoints. Does not write. EMPTY only when both keys are missing.
 *
 * @param {StorageLike} storage
 * @returns {LoadBestResult}
 */
export function loadBest(storage) {
  const primaryRaw = safeGet(storage, PRIMARY_KEY);
  const backupRaw = safeGet(storage, BACKUP_KEY);
  const primaryParsed = parseRaw(primaryRaw);
  const backupParsed = parseRaw(backupRaw);

  const primaryOk = primaryParsed.ok === true;
  const backupOk = backupParsed.ok === true;

  // A FUTURE primary must not be overwritten by an older valid backup.
  if (
    primaryRaw !== null &&
    !primaryParsed.ok &&
    primaryParsed.reason === 'FUTURE_VERSION'
  ) {
    return {
      ok: false,
      reason: 'FUTURE_VERSION',
      primaryRaw,
      backupRaw,
    };
  }

  if (primaryOk && backupOk) {
    const source = preferSource(primaryParsed.save, backupParsed.save);
    return {
      ok: true,
      save: source === 'primary' ? primaryParsed.save : backupParsed.save,
      source,
      primaryRaw,
      backupRaw,
    };
  }

  if (primaryOk) {
    return {
      ok: true,
      save: primaryParsed.save,
      source: 'primary',
      primaryRaw,
      backupRaw,
    };
  }

  if (backupOk) {
    return {
      ok: true,
      save: backupParsed.save,
      source: 'backup',
      primaryRaw,
      backupRaw,
    };
  }

  const backupFuture =
    !backupParsed.ok && backupParsed.reason === 'FUTURE_VERSION';
  if (backupFuture) {
    return {
      ok: false,
      reason: 'FUTURE_VERSION',
      primaryRaw,
      backupRaw,
    };
  }

  if (primaryRaw === null && backupRaw === null) {
    return {
      ok: false,
      reason: 'EMPTY',
      primaryRaw,
      backupRaw,
    };
  }

  return {
    ok: false,
    reason: 'CORRUPT',
    primaryRaw,
    backupRaw,
  };
}

/**
 * Highest persisted valid revision, or 0 when none.
 *
 * @param {StorageLike} storage
 * @returns {number}
 */
function knownRevision(storage) {
  let known = 0;
  const primaryParsed = parseRaw(safeGet(storage, PRIMARY_KEY));
  const backupParsed = parseRaw(safeGet(storage, BACKUP_KEY));
  if (primaryParsed.ok) {
    known = Math.max(known, primaryParsed.save.revision);
  }
  if (backupParsed.ok) {
    known = Math.max(known, backupParsed.save.revision);
  }
  return known;
}

/**
 * Copy the current valid primary onto backup unless backup already has a
 * strictly higher revision.
 *
 * @param {StorageLike} storage
 */
function promotePrimaryToBackup(storage) {
  const primaryRaw = safeGet(storage, PRIMARY_KEY);
  const primaryParsed = parseRaw(primaryRaw);
  if (!primaryParsed.ok || primaryRaw === null) {
    return;
  }
  const backupParsed = parseRaw(safeGet(storage, BACKUP_KEY));
  if (
    backupParsed.ok &&
    backupParsed.save.revision > primaryParsed.save.revision
  ) {
    return;
  }
  storage.setItem(BACKUP_KEY, primaryRaw);
}

/**
 * Validate, bump revision, rotate backup, write primary. `saved` is true only
 * when the primary `setItem` succeeds. Does not wipe keys on failure.
 *
 * Caller passes the current envelope; the installed primary uses
 * `revision = max(known, current) + 1`.
 *
 * @param {StorageLike} storage
 * @param {SaveEnvelope} envelope
 * @returns {WriteCheckpointResult}
 */
export function writeCheckpoint(storage, envelope) {
  /** @type {SaveEnvelope | null} */
  let installed = null;
  try {
    const currentRevision = Number.isSafeInteger(envelope.revision)
      ? envelope.revision
      : 0;
    const revision = Math.max(knownRevision(storage), currentRevision) + 1;
    installed = {
      gameId: envelope.gameId,
      schemaVersion: envelope.schemaVersion,
      balanceVersion: envelope.balanceVersion,
      revision,
      savedWallMs: envelope.savedWallMs,
      settings: {
        soundEnabled: envelope.settings.soundEnabled,
        reducedMotion: envelope.settings.reducedMotion,
        animationsPaused: envelope.settings.animationsPaused,
        quality: envelope.settings.quality,
      },
      state: cloneState(envelope.state),
    };
  } catch (error) {
    return { saved: false, envelope: null, error, backupError: null };
  }

  let text;
  try {
    text = serializeValidatedEnvelope(installed);
  } catch (error) {
    return { saved: false, envelope: installed, error, backupError: null };
  }

  const parsed = validateSave(text);
  if (!parsed.ok) {
    return {
      saved: false,
      envelope: installed,
      error: parsed.reason,
      backupError: null,
    };
  }

  /** @type {unknown} */
  let backupError = null;
  try {
    promotePrimaryToBackup(storage);
  } catch (error) {
    backupError = error;
  }

  try {
    storage.setItem(PRIMARY_KEY, text);
    return {
      saved: true,
      envelope: parsed.save,
      error: null,
      backupError,
    };
  } catch (error) {
    return {
      saved: false,
      envelope: parsed.save,
      error,
      backupError,
    };
  }
}

/**
 * Remove only this game's two keys.
 *
 * @param {StorageLike} storage
 */
export function resetGameKeys(storage) {
  try {
    storage.removeItem(PRIMARY_KEY);
  } catch {
    // Continue so the backup key is still removed.
  }
  try {
    storage.removeItem(BACKUP_KEY);
  } catch {
    // A failed remove still must not wipe other origin keys.
  }
}

/**
 * @param {number} savedWallMs
 * @returns {string}
 */
function savedAtLabel(savedWallMs) {
  try {
    return new Date(savedWallMs).toISOString();
  } catch {
    return String(savedWallMs);
  }
}

/**
 * Validate an import payload without writing.
 *
 * @param {unknown} text
 * @returns {{ ok: true, save: SaveEnvelope, preview: ImportPreview } | { ok: false, reason: 'INVALID_JSON' | 'TOO_LARGE' | 'INVALID_STATE' | 'FUTURE_VERSION' }}
 */
export function previewImport(text) {
  const parsed = validateSave(text);
  if (!parsed.ok) {
    return parsed;
  }
  return {
    ok: true,
    save: parsed.save,
    preview: {
      population: parsed.save.state.slimes.length,
      glowMicro: parsed.save.state.glowMicro,
      savedWallMs: parsed.save.savedWallMs,
      savedAt: savedAtLabel(parsed.save.savedWallMs),
    },
  };
}

/**
 * Replace stored checkpoints with a reconciled import. Invalid text leaves
 * storage unchanged.
 *
 * @param {StorageLike} storage
 * @param {unknown} text
 * @param {number} nowWallMs
 * @returns {{ ok: true, saved: boolean, envelope: SaveEnvelope | null, summary: import('./reconcile.mjs').ReconcileSummary, error: unknown, backupError: unknown } | { ok: false, reason: 'INVALID_JSON' | 'TOO_LARGE' | 'INVALID_STATE' | 'FUTURE_VERSION' }}
 */
export function importSave(storage, text, nowWallMs) {
  const parsed = validateSave(text);
  if (!parsed.ok) {
    return parsed;
  }
  const reconciled = reconcileAway(parsed.save, nowWallMs);
  const written = writeCheckpoint(storage, reconciled.save);
  return {
    ok: true,
    saved: written.saved,
    envelope: written.envelope,
    summary: reconciled.summary,
    error: written.error,
    backupError: written.backupError,
  };
}
