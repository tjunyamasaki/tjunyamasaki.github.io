/**
 * Application controller: locks, load/reconcile, visible clock, commands, save,
 * and the 3D habitat. Scene code never writes Glow or save keys.
 */

import { createAudio } from './audio/audio.mjs';
import { advance } from './core/advance.mjs';
import { OFFLINE_CAP_MS } from './core/balance.mjs';
import { absorbFrameDelta, flushWholeMs } from './core/clock-carry.mjs';
import { applyCommand } from './core/commands.mjs';
import {
  getCompanionEligibility,
  getRateMicroPerSecond,
} from './core/selectors.mjs';
import { cloneState, createInitialState } from './core/state.mjs';
import {
  createDefaultSettings,
  createFreshEnvelope,
} from './core/validate.mjs';
import { reconcileAway } from './persistence/reconcile.mjs';
import {
  importSave,
  loadBest,
  previewImport,
  resetGameKeys,
  serializeEnvelope,
  writeCheckpoint,
} from './persistence/save-store.mjs';
import {
  canPersist,
  reacquireWriter,
  requestWriter,
} from './persistence/tab-lock.mjs';
import {
  bindDom,
  effectiveReducedMotion,
} from './ui/dom.mjs';
import {
  formatExportDate,
  formatImportFailure,
  formatUpgradeLabel,
} from './ui/format.mjs';
import { bindSettings } from './ui/settings.mjs';

/**
 * @typedef {import('./core/state.mjs').GameState} GameState
 * @typedef {import('./core/state.mjs').SlimeId} SlimeId
 * @typedef {import('./core/commands.mjs').Command} Command
 * @typedef {import('./core/commands.mjs').GameEvent} GameEvent
 * @typedef {import('./core/validate.mjs').Settings} Settings
 * @typedef {import('./core/validate.mjs').SaveEnvelope} SaveEnvelope
 * @typedef {import('./persistence/tab-lock.mjs').WriterLockHandle} WriterLockHandle
 * @typedef {import('./persistence/tab-lock.mjs').WriterLockStatus} WriterLockStatus
 * @typedef {import('./persistence/reconcile.mjs').ReconcileSummary} ReconcileSummary
 */

const SETTLE_INTERVAL_MS = 100;
const DOM_INTERVAL_MS = 250;
const PERIODIC_SAVE_MS = 10_000;
const SLEEP_GAP_MS = 5_000;
const OFFLINE_SUMMARY_MS = 60_000;

const audio = createAudio();

/**
 * @typedef {object} App
 * @property {WriterLockHandle | null} writer
 * @property {WriterLockStatus | null} lockStatus
 * @property {Storage | null} storage
 * @property {'boot' | 'playable' | 'recovery' | 'blocked'} phase
 * @property {GameState | null} state
 * @property {Settings | null} settings
 * @property {number} revision
 * @property {SaveEnvelope | null} lastCheckpoint
 * @property {SlimeId | null} selectedSlimeId
 * @property {'saved' | 'unsaved' | 'session-only' | 'secondary-tab'} storageStatus
 * @property {boolean} quotaFailed
 * @property {string | null} notice
 * @property {string} actionStatus
 * @property {ReconcileSummary | null} offlineSummary
 * @property {string | null} primaryRaw
 * @property {string | null} backupRaw
 * @property {'CORRUPT' | 'FUTURE_VERSION' | null} recoveryReason
 * @property {boolean} sessionHidden
 * @property {boolean} looping
 * @property {number} rafId
 * @property {number | null} lastMonotonicMs
 * @property {number | null} lastWallMs
 * @property {number} carryMs
 * @property {number} lastSettlePerfMs
 * @property {number} lastDomPerfMs
 * @property {number} lastSavePerfMs
 * @property {boolean} companionWasReady
 * @property {{
 *   sync: Function,
 *   play: Function,
 *   select: Function,
 *   setOptions: Function,
 *   setVisible: Function,
 *   resize: Function,
 *   update: Function,
 *   render: Function,
 *   dispose: Function,
 * } | null} scene
 * @property {boolean} sceneFailed
 * @property {number | null} lastScenePerfMs
 */

/** @type {App} */
const app = {
  writer: null,
  lockStatus: null,
  storage: null,
  phase: 'boot',
  state: null,
  settings: null,
  revision: 0,
  lastCheckpoint: null,
  selectedSlimeId: null,
  storageStatus: 'session-only',
  quotaFailed: false,
  notice: null,
  actionStatus: '',
  offlineSummary: null,
  primaryRaw: null,
  backupRaw: null,
  recoveryReason: null,
  sessionHidden: false,
  looping: false,
  rafId: 0,
  lastMonotonicMs: null,
  lastWallMs: null,
  carryMs: 0,
  lastSettlePerfMs: 0,
  lastDomPerfMs: 0,
  lastSavePerfMs: 0,
  companionWasReady: false,
  scene: null,
  sceneFailed: false,
  lastScenePerfMs: null,
};

const gameRoot = document.getElementById('game');
if (!gameRoot) {
  throw new Error('Missing game root (#game).');
}

const ui = bindDom(gameRoot, {
  onSelect: selectSlime,
  onFeed: feedSelected,
  onBuy: buyUpgrade,
  onWelcome: welcomeCompanion,
  onTryAgain: tryAgain,
  onDismissOffline: dismissOffline,
  onDismissNotice: dismissNotice,
  onRecoveryNew: startNewFromRecovery,
  onRecoveryImport: recoveryImport,
  onRecoveryDownload: downloadUnreadable,
  onOpenSettings: openSettings,
});

const settingsUi = bindSettings({
  getSettings: () => app.settings,
  applySettings: patchSettings,
  onExport: exportSave,
  onImportFile: handleImportFile,
  onReset: commitReset,
  canMutate: () => canMutateSettings(),
});

/**
 * @returns {import('./persistence/tab-lock.mjs').LockManagerLike | null}
 */
function getLocks() {
  try {
    const locks = globalThis.navigator?.locks;
    if (locks && typeof locks.request === 'function') {
      return /** @type {import('./persistence/tab-lock.mjs').LockManagerLike} */ (
        locks
      );
    }
  } catch {
    // Privacy modes can throw when reading navigator.locks.
  }
  return null;
}

/**
 * @returns {Storage | null}
 */
function getLocalStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;
    void storage.length;
    return storage;
  } catch {
    return null;
  }
}

/**
 * @param {Settings} settings
 * @returns {Settings}
 */
function cloneSettings(settings) {
  return {
    soundEnabled: settings.soundEnabled,
    reducedMotion: settings.reducedMotion,
    animationsPaused: settings.animationsPaused,
    quality: settings.quality,
  };
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isQuotaError(error) {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String(error.name) : '';
  const message = 'message' in error ? String(error.message) : '';
  return name === 'QuotaExceededError' || /quota/i.test(message);
}

/**
 * @param {GameState} state
 * @returns {SlimeId | null}
 */
function pickDefaultSelection(state) {
  const original = state.slimes.find((slime) => slime.id === 'slime-1');
  return original?.id ?? state.slimes[0]?.id ?? null;
}

/**
 * @returns {boolean}
 */
function canWrite() {
  return (
    canPersist(app.lockStatus) &&
    app.storage != null &&
    app.phase === 'playable'
  );
}

/** Held writer with storage — including recovery actions the player chose. */
function canMutateStorage() {
  return canPersist(app.lockStatus) && app.storage != null;
}

/**
 * @returns {boolean}
 */
function canCommand() {
  return (
    app.phase === 'playable' &&
    app.lockStatus !== 'blocked' &&
    app.state != null
  );
}

/**
 * @returns {boolean}
 */
function canMutateSettings() {
  return canCommand();
}

function sceneOptions() {
  const settings = app.settings ?? createDefaultSettings();
  return {
    reducedMotion: effectiveReducedMotion(settings),
    animationsPaused: settings.animationsPaused,
    quality: settings.quality,
  };
}

/**
 * @param {string} text
 * @param {boolean} ready
 */
function setSceneStatus(text, ready) {
  const node = document.getElementById('scene-status');
  if (!node) return;
  node.textContent = text;
  node.hidden = ready;
}

/**
 * @param {string} [message]
 */
function onSceneError(message) {
  app.sceneFailed = true;
  const detail = message ? ` ${message}` : '';
  setSceneStatus(
    `The 3D garden is unavailable.${detail} Feeding and saving still work.`,
    false,
  );
}

function disposeScene() {
  if (app.scene && typeof app.scene.dispose === 'function') {
    try {
      app.scene.dispose();
    } catch {
      // Renderer disposal must not break save/export.
    }
  }
  app.scene = null;
}

/**
 * @param {GameEvent[]} [events]
 * @param {{ resetPositions?: boolean }} [extra]
 */
function syncScene(events = [], extra = {}) {
  if (!app.scene || !app.state) return;
  app.scene.setOptions(sceneOptions());
  app.scene.sync(app.state, extra);
  app.scene.select(app.selectedSlimeId);
  if (events.length) app.scene.play(events);
}

/**
 * @param {ReconcileSummary | null | undefined} summary
 */
function syncAfterReconcile(summary) {
  const reset =
    !!summary && (summary.awayMs > SLEEP_GAP_MS || summary.creditedMs > SLEEP_GAP_MS);
  syncScene([], { resetPositions: reset });
}

/**
 * @param {number} perfNow
 * @param {number} dtMs
 */
function presentScene(perfNow, dtMs) {
  if (!app.scene) return;
  const show = !app.sessionHidden && app.phase !== 'recovery';
  app.scene.setVisible(show);
  if (!show) return;
  app.scene.update(perfNow, dtMs);
  app.scene.render();
}

async function mountScene() {
  if (app.scene || app.sceneFailed) return;
  if (app.phase === 'recovery') return;
  const host = document.getElementById('scene-host');
  if (!host) return;
  setSceneStatus('Loading garden…', false);
  try {
    const { createScene } = await import('./scene/scene.mjs');
    if (app.scene || app.phase === 'recovery' || app.sceneFailed) return;
    app.scene = createScene(host, sceneOptions(), {
      onSelect: selectSlime,
      onError: onSceneError,
    });
    if (app.sceneFailed) {
      disposeScene();
      return;
    }
    syncScene([], { resetPositions: true });
    setSceneStatus('', true);
    presentScene(performance.now(), 0);
  } catch (error) {
    const text = error && error.message ? String(error.message) : String(error);
    onSceneError(text);
  }
}

/**
 * @param {GameEvent[]} events
 */
function cuePresentationAudio(events) {
  if (app.sessionHidden || !events.length) return;
  const enabled = app.settings?.soundEnabled === true;
  audio.setEnabled(enabled);
  if (!enabled) return;
  audio.unlock();
  for (const event of events) {
    if (event.type === 'FED') audio.playFeed();
    else if (event.type === 'UPGRADE_BOUGHT') audio.playUpgrade();
    else if (event.type === 'COMPANION_ADDED') audio.playWelcome();
  }
}

/**
 * @returns {boolean}
 */
function canAdvance() {
  return canCommand() && !app.sessionHidden;
}

/**
 * @param {number} [nowWallMs]
 * @returns {SaveEnvelope | null}
 */
function memoryEnvelope(nowWallMs = Date.now()) {
  if (!app.state || !app.settings) return null;
  return createFreshEnvelope({
    nowWallMs,
    revision: app.revision,
    state: app.state,
    settings: app.settings,
  });
}

/**
 * @param {number} [nowWallMs]
 */
function touchMemoryCheckpoint(nowWallMs = Date.now()) {
  const envelope = memoryEnvelope(nowWallMs);
  if (envelope) app.lastCheckpoint = envelope;
}

/**
 * @param {number} wallNow
 * @param {number} [perfNow]
 */
function resetClockBaselines(wallNow, perfNow = performance.now()) {
  app.lastWallMs = wallNow;
  app.lastMonotonicMs = perfNow;
  app.carryMs = 0;
  app.lastSettlePerfMs = perfNow;
  app.lastDomPerfMs = perfNow;
  app.lastScenePerfMs = perfNow;
}

function stopLoop() {
  app.looping = false;
  if (app.rafId) {
    cancelAnimationFrame(app.rafId);
    app.rafId = 0;
  }
}

function startLoop() {
  if (app.looping || app.sessionHidden) return;
  app.looping = true;
  const now = performance.now();
  if (app.lastMonotonicMs == null) app.lastMonotonicMs = now;
  app.rafId = requestAnimationFrame(onFrame);
}

/**
 * @param {string} text
 * @param {{ live?: boolean }} [options]
 */
function setAction(text, options = {}) {
  app.actionStatus = text;
  if (options.live !== false) ui.announce(text);
}

function paint() {
  const settings = app.settings ?? createDefaultSettings();
  ui.update({
    state: app.state,
    settings,
    selectedSlimeId: app.selectedSlimeId,
    phase: app.phase === 'boot' ? 'playable' : app.phase,
    storageStatus: app.storageStatus,
    quotaFailed: app.quotaFailed,
    commandsEnabled: canCommand(),
    notice: app.notice,
    actionStatus: app.actionStatus,
    offlineSummary: app.offlineSummary,
    rateMicroPerSecond: app.state ? getRateMicroPerSecond(app.state) : 0,
    reducedMotion: effectiveReducedMotion(settings),
    animationsPaused: settings.animationsPaused,
  });
  if (app.scene) app.scene.setOptions(sceneOptions());
}

function saveNow() {
  touchMemoryCheckpoint();
  if (!canWrite() || !app.lastCheckpoint || !app.storage) {
    if (app.lockStatus === 'unsupported') app.storageStatus = 'session-only';
    else if (app.lockStatus === 'blocked') app.storageStatus = 'secondary-tab';
    else if (app.phase === 'playable' && app.lockStatus === 'held') {
      app.storageStatus = 'unsaved';
    }
    return;
  }
  const result = writeCheckpoint(app.storage, app.lastCheckpoint);
  if (result.saved && result.envelope) {
    app.revision = result.envelope.revision;
    app.lastCheckpoint = result.envelope;
    app.storageStatus = 'saved';
    app.quotaFailed = false;
  } else {
    app.storageStatus = 'unsaved';
    app.quotaFailed = isQuotaError(result.error);
  }
}

/**
 * @param {number} elapsedMs
 */
function advanceBy(elapsedMs) {
  if (!app.state || elapsedMs <= 0) return;
  let remaining = elapsedMs;
  /** @type {GameEvent[]} */
  const events = [];
  while (remaining > 0) {
    const chunk = Math.min(remaining, OFFLINE_CAP_MS);
    const result = advance(app.state, chunk);
    app.state = result.state;
    events.push(...result.events);
    remaining -= chunk;
  }
  handleEvents(events, { fromAdvance: true });
}

function flushCarryAdvance() {
  const flushed = flushWholeMs(app.carryMs);
  app.carryMs = flushed.carryMs;
  if (flushed.elapsedMs <= 0) return;
  advanceBy(flushed.elapsedMs);
}

/**
 * @param {number} wallNow
 */
function handleBackwardClock(wallNow) {
  app.notice = 'The clock moved backward. Nothing was lost.';
  ui.announce(app.notice);
  touchMemoryCheckpoint(wallNow);
  saveNow();
  resetClockBaselines(wallNow);
  paint();
}

/**
 * @param {ReconcileSummary} summary
 */
function maybeOfflineSummary(summary) {
  if (summary.clockWentBackward) {
    app.notice = 'The clock moved backward. Nothing was lost.';
    ui.announce(app.notice);
    return;
  }
  if (summary.awayMs >= OFFLINE_SUMMARY_MS) {
    app.offlineSummary = summary;
  }
}

/**
 * @param {ReconcileResultLike} result
 * @typedef {{ save: SaveEnvelope, summary: ReconcileSummary }} ReconcileResultLike
 */
function applyReconciled(result) {
  app.state = cloneState(result.save.state);
  app.settings = cloneSettings(result.save.settings);
  app.lastCheckpoint = {
    gameId: result.save.gameId,
    schemaVersion: result.save.schemaVersion,
    balanceVersion: result.save.balanceVersion,
    revision: result.save.revision,
    savedWallMs: result.save.savedWallMs,
    state: cloneState(result.save.state),
    settings: cloneSettings(result.save.settings),
  };
  app.revision = result.save.revision;
}

/**
 * Visible-session settle. Uses monotonic elapsed; large wall gaps go through
 * reconcileAway so a sleep is not also applied as a first-frame delta.
 *
 * @param {number} [perfNow]
 */
function settleNow(perfNow = performance.now()) {
  if (
    app.sessionHidden ||
    !app.state ||
    app.phase !== 'playable' ||
    app.lockStatus === 'blocked'
  ) {
    return;
  }

  const wallNow = Date.now();
  if (app.lastWallMs != null && wallNow < app.lastWallMs) {
    handleBackwardClock(wallNow);
    return;
  }

  const wallGap = app.lastWallMs == null ? 0 : wallNow - app.lastWallMs;
  const pendingMs =
    app.lastMonotonicMs == null
      ? app.carryMs
      : absorbFrameDelta(app.carryMs, perfNow - app.lastMonotonicMs);

  if (wallGap > SLEEP_GAP_MS || pendingMs > SLEEP_GAP_MS) {
    const checkpoint = app.lastCheckpoint ?? memoryEnvelope(app.lastWallMs ?? wallNow);
    if (checkpoint) {
      const result = reconcileAway(checkpoint, wallNow);
      applyReconciled(result);
      maybeOfflineSummary(result.summary);
      saveNow();
      syncAfterReconcile(result.summary);
    }
    resetClockBaselines(wallNow, perfNow);
    return;
  }

  if (app.lastMonotonicMs != null) {
    app.carryMs = absorbFrameDelta(app.carryMs, perfNow - app.lastMonotonicMs);
  }
  app.lastMonotonicMs = perfNow;
  app.lastWallMs = wallNow;
  flushCarryAdvance();
  touchMemoryCheckpoint(wallNow);
}

/**
 * @param {number} perfNow
 */
function onFrame(perfNow) {
  if (!app.looping) return;
  app.rafId = requestAnimationFrame(onFrame);
  const prevScene = app.lastScenePerfMs;
  const dtMs = prevScene == null ? 0 : Math.max(0, perfNow - prevScene);
  app.lastScenePerfMs = perfNow;

  if (!canAdvance()) {
    presentScene(perfNow, dtMs);
    return;
  }

  const wallNow = Date.now();
  if (app.lastWallMs != null && wallNow < app.lastWallMs) {
    handleBackwardClock(wallNow);
    presentScene(perfNow, dtMs);
    return;
  }
  const wallGap = app.lastWallMs == null ? 0 : wallNow - app.lastWallMs;
  if (wallGap > SLEEP_GAP_MS) {
    settleNow(perfNow);
    paint();
    app.lastDomPerfMs = perfNow;
    presentScene(perfNow, dtMs);
    return;
  }

  if (app.lastMonotonicMs != null) {
    app.carryMs = absorbFrameDelta(app.carryMs, perfNow - app.lastMonotonicMs);
  }
  app.lastMonotonicMs = perfNow;
  app.lastWallMs = wallNow;

  if (perfNow - app.lastSettlePerfMs >= SETTLE_INTERVAL_MS) {
    flushCarryAdvance();
    touchMemoryCheckpoint(wallNow);
    app.lastSettlePerfMs = perfNow;
  }

  if (perfNow - app.lastDomPerfMs >= DOM_INTERVAL_MS) {
    paint();
    app.lastDomPerfMs = perfNow;
  }

  if (canWrite() && perfNow - app.lastSavePerfMs >= PERIODIC_SAVE_MS) {
    flushCarryAdvance();
    touchMemoryCheckpoint(wallNow);
    saveNow();
    app.lastSavePerfMs = perfNow;
  }

  presentScene(perfNow, dtMs);
}

function handleHidden() {
  if (app.sessionHidden) {
    if (canWrite()) saveNow();
    return;
  }
  if (app.phase === 'playable' && app.state && app.lockStatus !== 'blocked') {
    settleNow();
    saveNow();
  }
  app.sessionHidden = true;
  if (app.scene) app.scene.setVisible(false);
  stopLoop();
}

function handleVisible() {
  if (!app.sessionHidden) return;
  app.sessionHidden = false;
  if (app.lockStatus === 'blocked') {
    paint();
    void mountScene();
    startLoop();
    return;
  }
  if (app.phase !== 'playable' || !app.state) {
    return;
  }
  const wallNow = Date.now();
  const checkpoint = app.lastCheckpoint ?? memoryEnvelope(wallNow);
  if (checkpoint) {
    const result = reconcileAway(checkpoint, wallNow);
    applyReconciled(result);
    maybeOfflineSummary(result.summary);
    saveNow();
    syncAfterReconcile(result.summary);
  }
  resetClockBaselines(wallNow);
  paint();
  startLoop();
}

function bindLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handleHidden();
    else handleVisible();
  });
  window.addEventListener('pagehide', () => handleHidden());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void restoreFromBfCache();
  });
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (motion && typeof motion.addEventListener === 'function') {
    motion.addEventListener('change', () => {
      if (app.settings?.reducedMotion == null) paint();
    });
  }
}

async function restoreFromBfCache() {
  stopLoop();
  app.sessionHidden = document.visibilityState === 'hidden';
  const handle = await reacquireWriter({
    previous: app.writer,
    locks: getLocks(),
  });
  await startWithWriter(handle);
}

/**
 * @param {Command} command
 */
function dispatch(command) {
  if (!canCommand() || !app.state) return;
  settleNow();
  const result = applyCommand(app.state, command);
  app.state = result.state;
  touchMemoryCheckpoint();
  if (result.ok) {
    handleEvents(result.events, { fromAdvance: false });
    saveNow();
    syncScene(result.events);
    cuePresentationAudio(result.events);
  }
  paint();
}

/**
 * @param {GameEvent[]} events
 * @param {{ fromAdvance: boolean }} origin
 */
function handleEvents(events, origin) {
  if (!app.state) return;
  for (const event of events) {
    if (event.type === 'FED') {
      const slime = app.state.slimes.find((entry) => entry.id === event.slimeId);
      const name = slime?.name ?? 'a slime';
      setAction(`Offered a berry to ${name}.`);
    } else if (event.type === 'UPGRADE_BOUGHT' && event.upgradeId) {
      setAction(
        `Bought ${formatUpgradeLabel(event.upgradeId)} (level ${event.level}).`,
      );
    } else if (event.type === 'COMPANION_ADDED') {
      const slime = app.state.slimes.find((entry) => entry.id === event.slimeId);
      const name = slime?.name ?? 'A companion';
      setAction(`${name} joined the garden.`);
    } else if (
      event.type === 'TUTORIAL_COMPLETED' &&
      event.step === 'berry' &&
      origin.fromAdvance
    ) {
      setAction('A berry grew back.');
    }
  }
  const ready = getCompanionEligibility(app.state).ready;
  if (ready && !app.companionWasReady) {
    setAction('A companion is ready');
  }
  app.companionWasReady = ready;
}

/**
 * @param {SlimeId} id
 */
function selectSlime(id) {
  if (!app.state) return;
  if (!app.state.slimes.some((slime) => slime.id === id)) return;
  app.selectedSlimeId = id;
  if (app.scene) app.scene.select(id);
  paint();
}

function feedSelected() {
  if (!app.selectedSlimeId) return;
  dispatch({ type: 'FEED', slimeId: app.selectedSlimeId });
}

/**
 * @param {string} upgradeId
 */
function buyUpgrade(upgradeId) {
  if (!app.state) return;
  if (
    upgradeId !== 'shrub' &&
    upgradeId !== 'pantry' &&
    upgradeId !== 'bloom' &&
    upgradeId !== 'beds'
  ) {
    return;
  }
  dispatch({
    type: 'BUY_UPGRADE',
    upgradeId,
    expectedLevel: app.state.upgrades[upgradeId],
  });
}

function welcomeCompanion() {
  if (!app.state) return;
  dispatch({
    type: 'WELCOME_COMPANION',
    expectedPopulation: app.state.slimes.length,
  });
}

function dismissOffline() {
  app.offlineSummary = null;
  paint();
}

function dismissNotice() {
  app.notice = null;
  paint();
}

function openSettings() {
  if (app.phase === 'blocked') return;
  settingsUi.open(document.getElementById('settings-open'));
}

/**
 * @param {Partial<Settings>} patch
 */
function patchSettings(patch) {
  if (!canMutateSettings() || !app.settings) return;
  settleNow();
  app.settings = { ...app.settings, ...patch };
  audio.setEnabled(app.settings.soundEnabled === true);
  saveNow();
  paint();
}

function exportSave() {
  if (app.phase === 'playable' && app.state && app.lockStatus !== 'blocked') {
    settleNow();
    saveNow();
  } else {
    touchMemoryCheckpoint();
  }
  const envelope = app.lastCheckpoint ?? memoryEnvelope();
  if (!envelope) return;
  downloadJson(
    `cozy-slime-save-${formatExportDate()}.json`,
    serializeEnvelope(envelope),
  );
}

/**
 * @param {string} filename
 * @param {string} text
 */
function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {File} file
 */
function handleImportFile(file) {
  const reader = file.text();
  void reader
    .then((text) => {
      const previewed = previewImport(text);
      if (!previewed.ok) {
        showImportProblem(previewed.reason);
        return;
      }
      settingsUi.askImportConfirm(previewed.preview, () => {
        commitImport(text, previewed.save);
      });
    })
    .catch(() => {
      showImportProblem('INVALID_JSON');
    });
}

/**
 * @param {string} reason
 */
function showImportProblem(reason) {
  settingsUi.showImportFailure(reason);
  const recoveryFeedback = document.getElementById('recovery-feedback');
  if (recoveryFeedback) recoveryFeedback.textContent = formatImportFailure(reason);
  ui.announce(formatImportFailure(reason));
}

/**
 * @param {string} text
 * @param {SaveEnvelope} parsed
 */
function commitImport(text, parsed) {
  if (app.lockStatus === 'blocked') return;
  const now = Date.now();
  if (canMutateStorage() && app.storage) {
    const result = importSave(app.storage, text, now);
    if (!result.ok) {
      showImportProblem(result.reason);
      return;
    }
    const save = result.envelope ?? reconcileAway(parsed, now).save;
    installPlayable(save, { persist: false });
    if (result.saved) {
      app.storageStatus = 'saved';
      app.quotaFailed = false;
      if (result.envelope) app.revision = result.envelope.revision;
    } else {
      app.storageStatus = 'unsaved';
      app.quotaFailed = isQuotaError(result.error);
    }
    maybeOfflineSummary(result.summary);
  } else {
    const reconciled = reconcileAway(parsed, now);
    installPlayable(reconciled.save, { persist: false });
    maybeOfflineSummary(reconciled.summary);
    app.storageStatus =
      app.lockStatus === 'unsupported' ? 'session-only' : 'unsaved';
  }
  setAction('Garden replaced from the imported save.');
  beginPlay();
}

function commitReset() {
  if (app.lockStatus === 'blocked') return;
  if (canMutateStorage() && app.storage) {
    resetGameKeys(app.storage);
  }
  app.recoveryReason = null;
  startFresh({ persist: canMutateStorage() });
  setAction('Garden reset.');
  beginPlay();
}

function startNewFromRecovery() {
  if (app.lockStatus === 'blocked') return;
  if (canMutateStorage() && app.storage) {
    resetGameKeys(app.storage);
  }
  app.recoveryReason = null;
  startFresh({ persist: canMutateStorage() });
  beginPlay();
}

function recoveryImport() {
  settingsUi.pickFile();
}

function downloadUnreadable() {
  const raw = app.primaryRaw ?? app.backupRaw;
  if (raw == null) return;
  downloadJson('cozy-slime-unreadable-save.json', raw);
}

async function tryAgain() {
  stopLoop();
  const handle = await requestWriter({ locks: getLocks() });
  await startWithWriter(handle);
}

/**
 * @param {SaveEnvelope} save
 * @param {{ persist: boolean }} options
 */
function installPlayable(save, options) {
  app.phase = 'playable';
  app.state = cloneState(save.state);
  app.settings = cloneSettings(save.settings);
  app.revision = save.revision;
  app.lastCheckpoint = {
    gameId: save.gameId,
    schemaVersion: save.schemaVersion,
    balanceVersion: save.balanceVersion,
    revision: save.revision,
    savedWallMs: save.savedWallMs,
    state: cloneState(save.state),
    settings: cloneSettings(save.settings),
  };
  app.selectedSlimeId = pickDefaultSelection(app.state);
  app.companionWasReady = getCompanionEligibility(app.state).ready;
  app.recoveryReason = null;
  if (options.persist) saveNow();
  if (app.scene) syncScene([], { resetPositions: true });
}

/**
 * @param {{ persist: boolean }} options
 */
function startFresh(options) {
  const now = Date.now();
  const envelope = createFreshEnvelope({ nowWallMs: now, revision: 0 });
  installPlayable(envelope, { persist: false });
  app.offlineSummary = null;
  if (app.lockStatus === 'unsupported') app.storageStatus = 'session-only';
  if (options.persist) saveNow();
}

function beginPlay() {
  app.phase = 'playable';
  ui.showPlay();
  settingsUi.close();
  const wallNow = Date.now();
  resetClockBaselines(wallNow);
  paint();
  void mountScene();
  if (document.visibilityState === 'hidden') {
    app.sessionHidden = true;
    if (app.scene) app.scene.setVisible(false);
    if (canWrite()) saveNow();
    stopLoop();
    return;
  }
  app.sessionHidden = false;
  startLoop();
}

function enterBlocked() {
  app.phase = 'blocked';
  app.lockStatus = 'blocked';
  app.storageStatus = 'secondary-tab';
  stopLoop();
  if (app.storage) {
    const loaded = loadBest(app.storage);
    if (loaded.ok) {
      app.state = cloneState(loaded.save.state);
      app.settings = cloneSettings(loaded.save.settings);
      app.revision = loaded.save.revision;
      app.lastCheckpoint = loaded.save;
      app.selectedSlimeId = pickDefaultSelection(app.state);
    } else {
      app.state = createInitialState();
      app.settings = createDefaultSettings();
      app.selectedSlimeId = 'slime-1';
    }
  } else {
    app.state = createInitialState();
    app.settings = createDefaultSettings();
    app.selectedSlimeId = 'slime-1';
  }
  ui.showPlay();
  paint();
  ui.announce('This game is active in another tab');
  void mountScene();
  app.sessionHidden = document.visibilityState === 'hidden';
  if (!app.sessionHidden) startLoop();
}

/**
 * @param {Extract<import('./persistence/save-store.mjs').LoadBestResult, { ok: false }>} loaded
 */
function enterRecovery(loaded) {
  app.phase = 'recovery';
  app.recoveryReason = loaded.reason === 'FUTURE_VERSION' ? 'FUTURE_VERSION' : 'CORRUPT';
  app.primaryRaw = loaded.primaryRaw;
  app.backupRaw = loaded.backupRaw;
  disposeScene();
  stopLoop();
  ui.showRecovery({
    reason: app.recoveryReason,
    hasRaw: loaded.primaryRaw != null || loaded.backupRaw != null,
  });
  ui.announce(
    app.recoveryReason === 'FUTURE_VERSION'
      ? 'This save is from a newer version'
      : 'Could not read the saved garden',
  );
}

function enterSessionPlay() {
  app.lockStatus = 'unsupported';
  app.storageStatus = 'session-only';
  if (app.storage) {
    const loaded = loadBest(app.storage);
    if (loaded.ok) {
      const now = Date.now();
      const reconciled = reconcileAway(loaded.save, now);
      installPlayable(reconciled.save, { persist: false });
      maybeOfflineSummary(reconciled.summary);
      beginPlay();
      return;
    }
    if (loaded.reason === 'CORRUPT' || loaded.reason === 'FUTURE_VERSION') {
      enterRecovery(loaded);
      return;
    }
  }
  startFresh({ persist: false });
  beginPlay();
}

function enterHeldPlay() {
  app.lockStatus = 'held';
  if (!app.storage) {
    app.storageStatus = 'unsaved';
    startFresh({ persist: false });
    beginPlay();
    return;
  }
  const loaded = loadBest(app.storage);
  if (!loaded.ok && loaded.reason === 'EMPTY') {
    startFresh({ persist: true });
    beginPlay();
    return;
  }
  if (!loaded.ok) {
    enterRecovery(loaded);
    return;
  }
  const now = Date.now();
  const reconciled = reconcileAway(loaded.save, now);
  installPlayable(reconciled.save, { persist: true });
  maybeOfflineSummary(reconciled.summary);
  beginPlay();
}

/**
 * @param {WriterLockHandle} handle
 */
async function startWithWriter(handle) {
  app.writer = handle;
  app.lockStatus = handle.status;
  if (handle.status === 'blocked') {
    enterBlocked();
    return;
  }
  if (handle.status === 'unsupported') {
    enterSessionPlay();
    return;
  }
  enterHeldPlay();
}

async function boot() {
  app.storage = getLocalStorage();
  bindLifecycle();
  const handle = await requestWriter({ locks: getLocks() });
  await startWithWriter(handle);
}

void boot().catch((error) => {
  console.error(error);
  const text = error && error.message ? String(error.message) : String(error);
  disposeScene();
  ui.showError(text);
});
