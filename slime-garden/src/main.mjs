/**
 * Application controller: locks, load/reconcile, visible clock, commands, save,
 * and the 3D habitat. Scene code never writes Glow or save keys.
 */

import { createAudio } from './audio/audio.mjs';
import { advanceActive } from './core/active.mjs';
import {
  MAX_WORLD_STEPS_PER_ADVANCE,
  WORLD_STEP_MS,
} from './core/balance.mjs';
import { absorbFrameDelta, flushWholeMs } from './core/clock-carry.mjs';
import { applyCommand, completeHint } from './core/commands.mjs';
import {
  getRateMicroPerSecond,
  resolveNearSelectedTarget,
} from './core/selectors.mjs';
import { cloneState, createInitialState } from './core/state.mjs';
import {
  createDefaultSettings,
  createFreshEnvelope,
} from './core/validate.mjs';
import { createPointerRouter } from './input/pointer-router.mjs';
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
  formatArrivalStatus,
  formatExportDate,
  formatImportFailure,
  formatMealCompleteStatus,
  formatThrowReject,
  formatUpgradeLabel,
  HUD_COPY,
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
const MAX_VISIBLE_ADVANCE_MS = MAX_WORLD_STEPS_PER_ADVANCE * WORLD_STEP_MS;

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
 *   pet?: Function,
 *   getCameraRig?: Function,
 *   pick?: Function,
 * } | null} scene
 * @property {ReturnType<typeof createPointerRouter> | null} pointerRouter
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
  scene: null,
  pointerRouter: null,
  sceneFailed: false,
  lastScenePerfMs: null,
};

const gameRoot = document.getElementById('game');
if (!gameRoot) {
  throw new Error('Missing game root (#game).');
}

const ui = bindDom(gameRoot, {
  onSelect: selectSlime,
  onFeed: offerNear,
  onOfferNear: offerNear,
  onBuy: buyUpgrade,
  onTryAgain: tryAgain,
  onDismissOffline: dismissOffline,
  onDismissNotice: dismissNotice,
  onRecoveryNew: startNewFromRecovery,
  onRecoveryImport: recoveryImport,
  onRecoveryDownload: downloadUnreadable,
  onOpenSettings: openSettings,
  onSetMode: onHudMode,
  onSetTool: onHudTool,
  onZoom: onZoom,
  onResetView: onResetView,
  onFocusSelected: onFocusSelected,
  onPet: petResident,
  onThrowPreset: onThrowPreset,
  onReticleThrow: throwAt,
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
  ui.setRendererAvailable(false);
  const detail = message ? ` ${message}` : '';
  setSceneStatus(
    `The 3D garden is unavailable.${detail} Tossing berries, upgrades, and export still work.`,
    false,
  );
}

function detachPointerRouter() {
  if (app.pointerRouter && typeof app.pointerRouter.dispose === 'function') {
    try {
      app.pointerRouter.dispose();
    } catch {
      // Gesture cleanup must not break save/export.
    }
  }
  app.pointerRouter = null;
}

function disposeScene() {
  detachPointerRouter();
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
 * @returns {ReturnType<import('./scene/camera.mjs').createCameraRig> | null}
 */
function cameraRig() {
  if (!app.scene || typeof app.scene.getCameraRig !== 'function') return null;
  try {
    return app.scene.getCameraRig() ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {'care' | 'orbit'} mode
 */
function applyPlaySurfaceMode(mode) {
  const canvas = document.querySelector('#scene-host canvas');
  if (canvas instanceof HTMLElement) {
    canvas.style.touchAction = mode === 'orbit' ? 'none' : 'pan-y';
  }
  app.pointerRouter?.notifyModeChange();
}

/**
 * @param {GameEvent[]} events
 * @returns {boolean}
 */
function eventsNeedImmediateSave(events) {
  return events.some(
    (event) =>
      event.type === 'FOOD_THROWN' ||
      event.type === 'FED' ||
      event.type === 'UPGRADE_BOUGHT' ||
      event.type === 'COMPANION_ADDED' ||
      event.type === 'TUTORIAL_COMPLETED',
  );
}

/**
 * Shared commit for commands and visible advance: install state, copy, scene,
 * durable save on cost/reward/tutorial checkpoints, audio, optional paint.
 *
 * @param {GameState} nextState
 * @param {GameEvent[]} events
 * @param {{ fromAdvance?: boolean, paintNow?: boolean, extra?: { resetPositions?: boolean } }} [options]
 */
function commitTransition(nextState, events, options = {}) {
  app.state = nextState;
  handleEvents(events, { fromAdvance: !!options.fromAdvance });
  syncScene(events, options.extra);
  if (eventsNeedImmediateSave(events)) saveNow();
  else if (!options.fromAdvance) touchMemoryCheckpoint();
  cuePresentationAudio(events);
  if (options.paintNow || events.length) paint();
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

/**
 * @param {unknown} intent
 */
function handleWorldClick(intent) {
  if (!intent || typeof intent !== 'object') return;
  const typed = /** @type {{ type?: string, hit?: object, tool?: string }} */ (intent);
  if (typed.type !== 'WORLD_CLICK') return;
  const hit = typed.hit;
  if (!hit || typeof hit !== 'object') return;
  const kind = /** @type {{ kind?: string }} */ (hit).kind;
  const tool = typed.tool === 'hand' ? 'hand' : 'berry';

  if (kind === 'object') {
    const id =
      /** @type {{ upgradeId?: string, interactableId?: string }} */ (hit)
        .upgradeId ||
      /** @type {{ interactableId?: string }} */ (hit).interactableId;
    if (typeof id === 'string' && id) ui.selectObject(id);
    return;
  }

  if (kind === 'slime') {
    const slimeId = /** @type {{ slimeId?: string }} */ (hit).slimeId;
    if (typeof slimeId !== 'string' || !slimeId) return;
    selectSlime(/** @type {SlimeId} */ (slimeId));
    if (tool === 'hand') petResident(/** @type {SlimeId} */ (slimeId));
    return;
  }

  if (kind === 'ground' && tool === 'berry') {
    const ground = /** @type {{ point?: { x: number, z: number }, valid?: boolean }} */ (
      hit
    );
    if (ground.valid === false) {
      reportCommandFailure('INVALID_TARGET');
      return;
    }
    throwAt(ground.point);
  }
}

function attachPointerRouter() {
  detachPointerRouter();
  const stage = document.getElementById('scene-stage');
  if (!stage || !app.scene) return;
  app.pointerRouter = createPointerRouter({
    getMode: () => (ui.getHudState().mode === 'orbit' ? 'orbit' : 'care'),
    getTool: () => (ui.getHudState().tool === 'hand' ? 'hand' : 'berry'),
    pick: (clientX, clientY) => {
      if (!app.scene || typeof app.scene.pick !== 'function') {
        return { kind: 'none' };
      }
      return app.scene.pick(clientX, clientY) || { kind: 'none' };
    },
    onIntent: handleWorldClick,
    onCamera: (intent) => {
      const rig = cameraRig();
      if (!rig) return;
      rig.applyIntent(intent);
      if (isRealCameraIntent(intent)) acknowledgeCameraHint();
    },
    isOverPlaySurface: (event) => {
      const rect = stage.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    },
    isHudHit: (event) => {
      const target = event && event.target;
      if (!(target instanceof Element)) return false;
      if (target.closest('#scene-host')) return false;
      return Boolean(target.closest('#orbit-hint, #scene-status'));
    },
    isPlaySurfaceFocused: () => {
      const active = document.activeElement;
      const play = document.getElementById('play-controls');
      return Boolean(active && play && play.contains(active));
    },
  });
  app.pointerRouter.attach(stage);
  applyPlaySurfaceMode(ui.getHudState().mode === 'orbit' ? 'orbit' : 'care');
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
    app.scene = createScene(
      host,
      { ...sceneOptions(), presentation: 'world' },
      {
        onSelect: selectSlime,
        onError: onSceneError,
      },
    );
    if (app.sceneFailed) {
      disposeScene();
      return;
    }
    ui.setRendererAvailable(true);
    attachPointerRouter();
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
 * Visible-session world+economy. Hidden/away time uses reconcileAway instead.
 *
 * @param {number} elapsedMs
 */
function advanceBy(elapsedMs) {
  if (!canAdvance() || !app.state || elapsedMs <= 0) return;
  let remaining = Math.floor(elapsedMs);
  if (remaining <= 0) return;
  /** @type {GameEvent[]} */
  const events = [];
  let state = app.state;
  while (remaining > 0) {
    const chunk = Math.min(remaining, MAX_VISIBLE_ADVANCE_MS);
    const result = advanceActive(state, chunk);
    state = result.state;
    events.push(...result.events);
    remaining -= chunk;
  }
  commitTransition(state, events, { fromAdvance: true, paintNow: false });
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

  flushCarryAdvance();

  if (perfNow - app.lastSettlePerfMs >= SETTLE_INTERVAL_MS) {
    touchMemoryCheckpoint(wallNow);
    app.lastSettlePerfMs = perfNow;
  }

  if (perfNow - app.lastDomPerfMs >= DOM_INTERVAL_MS) {
    paint();
    app.lastDomPerfMs = perfNow;
  }

  if (canWrite() && perfNow - app.lastSavePerfMs >= PERIODIC_SAVE_MS) {
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
  for (const id of ['settings-dialog', 'import-dialog', 'reset-dialog']) {
    const dialog = document.getElementById(id);
    if (!dialog) continue;
    dialog.addEventListener('toggle', () => {
      if ('open' in dialog && dialog.open) app.pointerRouter?.notifyDialogOpen();
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
 * @param {string} reason
 */
function reportCommandFailure(reason) {
  const copy = formatThrowReject(reason, app.state ?? undefined);
  if (copy) setAction(copy);
  paint();
}

/**
 * @param {Command} command
 */
function dispatch(command) {
  if (!canCommand() || !app.state) return;
  settleNow();
  if (!app.state) return;
  const result = applyCommand(app.state, command);
  if (!result.ok) {
    reportCommandFailure(result.reason);
    return;
  }
  commitTransition(result.state, result.events, {
    fromAdvance: false,
    paintNow: true,
  });
}

/**
 * @param {GameEvent[]} events
 * @param {{ fromAdvance: boolean }} origin
 */
function handleEvents(events, origin) {
  if (!app.state) return;
  /** @type {string[]} */
  const statuses = [];
  for (const event of events) {
    if (event.type === 'FOOD_THROWN') {
      statuses.push(HUD_COPY.berryTossed);
    } else if (event.type === 'FED') {
      const slime = app.state.slimes.find((entry) => entry.id === event.slimeId);
      const name = slime?.name ?? 'a slime';
      const until =
        typeof event.boostUntilMs === 'number'
          ? event.boostUntilMs
          : slime?.boostUntilMs ?? app.state.simTimeMs;
      statuses.push(formatMealCompleteStatus(name, until - app.state.simTimeMs));
    } else if (event.type === 'UPGRADE_BOUGHT' && event.upgradeId) {
      statuses.push(
        `Bought ${formatUpgradeLabel(event.upgradeId)} (level ${event.level}).`,
      );
    } else if (event.type === 'COMPANION_ADDED') {
      const slime = app.state.slimes.find((entry) => entry.id === event.slimeId);
      const name = slime?.name ?? 'A friend';
      statuses.push(formatArrivalStatus(name));
    } else if (
      event.type === 'TUTORIAL_COMPLETED' &&
      event.step === 'berry' &&
      origin.fromAdvance
    ) {
      statuses.push('A berry grew back.');
    }
  }
  if (statuses.length) setAction(statuses.join(' · '));
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

/**
 * @param {{ x: number, z: number } | null | undefined} point
 */
function throwAt(point) {
  if (!canCommand() || !app.state) return;
  if (
    !point ||
    typeof point.x !== 'number' ||
    typeof point.z !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.z)
  ) {
    reportCommandFailure('INVALID_TARGET');
    return;
  }
  dispatch({ type: 'THROW_FOOD', target: { x: point.x, z: point.z } });
}

function offerNear() {
  if (!canCommand() || !app.state) return;
  if (!app.selectedSlimeId) {
    reportCommandFailure('NO_VALID_TARGET');
    return;
  }
  const target = resolveNearSelectedTarget(app.state, app.selectedSlimeId);
  if (!target) {
    reportCommandFailure('NO_VALID_TARGET');
    return;
  }
  dispatch({ type: 'THROW_FOOD', target });
}

/**
 * @param {string} _id
 * @param {{ x: number, z: number }} point
 */
function onThrowPreset(_id, point) {
  throwAt(point);
}

/**
 * @param {SlimeId} slimeId
 */
function petResident(slimeId) {
  if (!canCommand() || !app.state) return;
  if (!app.state.slimes.some((slime) => slime.id === slimeId)) return;
  selectSlime(slimeId);
  if (app.scene && typeof app.scene.pet === 'function') {
    const result = app.scene.pet(slimeId);
    if (result && result.ok === false && result.reason === 'cooldown') {
      setAction(HUD_COPY.alreadyPetted);
      paint();
      return;
    }
    if (result && result.ok && result.playSound && app.settings?.soundEnabled) {
      audio.setEnabled(true);
      audio.unlock();
      audio.playPet();
    }
  }
  acknowledgeHint('pet');
}

/**
 * @param {'pet' | 'camera'} step
 */
function acknowledgeHint(step) {
  if (!canCommand() || !app.state) return;
  const result = completeHint(app.state, step);
  if (!result.events.length) return;
  commitTransition(result.state, result.events, {
    fromAdvance: false,
    paintNow: true,
  });
}

/**
 * @param {unknown} intent
 * @returns {boolean}
 */
function isRealCameraIntent(intent) {
  if (!intent || typeof intent !== 'object') return false;
  const type = /** @type {{ type?: string, factor?: number }} */ (intent).type;
  if (type === 'ZOOM') {
    const factor = /** @type {{ factor?: number }} */ (intent).factor;
    return factor != null && factor !== 1;
  }
  return type === 'ORBIT' || type === 'RESET_VIEW' || type === 'FOCUS_SELECTED';
}

function acknowledgeCameraHint() {
  acknowledgeHint('camera');
}

/**
 * @param {'care' | 'orbit'} mode
 */
function onHudMode(mode) {
  applyPlaySurfaceMode(mode === 'orbit' ? 'orbit' : 'care');
}

function onHudTool() {
  applyPlaySurfaceMode(ui.getHudState().mode === 'orbit' ? 'orbit' : 'care');
}

/**
 * @param {number} factor
 */
function onZoom(factor) {
  const rig = cameraRig();
  if (!rig) return;
  rig.zoomByFactor(factor);
  acknowledgeCameraHint();
}

function onResetView() {
  const rig = cameraRig();
  if (!rig) return;
  rig.reset();
  acknowledgeCameraHint();
}

function onFocusSelected() {
  const rig = cameraRig();
  if (!rig || !app.state || !app.selectedSlimeId) return;
  const resident = app.state.world?.residents?.find(
    (entry) => entry.id === app.selectedSlimeId,
  );
  const position = resident?.position;
  if (
    !position ||
    typeof position.x !== 'number' ||
    typeof position.z !== 'number' ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.z)
  ) {
    return;
  }
  rig.focusResident({ x: position.x, z: position.z });
  acknowledgeCameraHint();
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
  app.pointerRouter?.notifyDialogOpen();
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
