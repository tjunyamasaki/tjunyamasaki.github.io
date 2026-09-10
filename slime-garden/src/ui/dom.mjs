/**
 * Game DOM: cache nodes, bind once, patch text/state. Never rebuild the tree
 * on a currency tick. Save strings go through textContent.
 */

import { TUTORIAL_STEPS, UPGRADE_IDS, UPGRADE_MAX_LEVEL } from '../core/balance.mjs';
import {
  getBerryCapacity,
  getBerryIntervalMs,
  getCompanionEligibility,
  getNextUpgradeCostMicro,
  getResidentCapacity,
} from '../core/selectors.mjs';
import {
  formatAway,
  formatCostLabel,
  formatDuration,
  formatGlowAmount,
  formatHudObjectLabel,
  formatImportFailure,
  formatMealCount,
  formatPendingFood,
  formatRate,
  formatSavedDate,
  formatShortfall,
  formatUpgradeCardEffect,
  formatUpgradeLabel,
  formatWalletGlow,
  HUD_COPY,
  TUTORIAL_COPY,
} from './format.mjs';
import {
  createHudControlState,
  createReticle,
  feedDisabledReason,
  formatCompanionStatus,
  formatResidentActivity,
  formatReticle,
  hudPressed,
  offerNearDisabledReason,
  pendingFoodCount,
  REGION_PRESETS,
  berryRegenProgress,
  setHudMode,
  setHudTool,
  stepReticle,
  PET_FEEDBACK_COOLDOWN_MS,
} from './hud.mjs';

export { feedDisabledReason, offerNearDisabledReason } from './hud.mjs';
export { throwDisabledReason } from './hud.mjs';

/**
 * @typedef {import('../core/state.mjs').GameState} GameState
 * @typedef {import('../core/state.mjs').SlimeId} SlimeId
 * @typedef {import('../core/state.mjs').TutorialStep} TutorialStep
 * @typedef {import('../core/validate.mjs').Settings} Settings
 * @typedef {import('../persistence/save-store.mjs').ImportPreview} ImportPreview
 * @typedef {import('../persistence/reconcile.mjs').ReconcileSummary} ReconcileSummary
 * @typedef {import('./hud.mjs').HudControlState} HudControlState
 * @typedef {import('./hud.mjs').HudMode} HudMode
 * @typedef {import('./hud.mjs').HudTool} HudTool
 * @typedef {import('./hud.mjs').HudPanel} HudPanel
 *
 * @typedef {object} UiCallbacks
 * @property {(id: SlimeId) => void} [onSelect]
 * @property {() => void} [onFeed] compatibility alias; live main throws (does not FEED)
 * @property {(id: string) => void} [onBuy]
 * @property {() => void} [onWelcome] kept for compatibility; no primary Welcome control
 * @property {() => void} [onTryAgain]
 * @property {() => void} [onDismissOffline]
 * @property {() => void} [onDismissNotice]
 * @property {() => void} [onRecoveryNew]
 * @property {() => void} [onRecoveryImport]
 * @property {() => void} [onRecoveryDownload]
 * @property {() => void} [onOpenSettings]
 * @property {(mode: HudMode) => void} [onSetMode]
 * @property {(tool: HudTool) => void} [onSetTool]
 * @property {(factor: number) => void} [onZoom]
 * @property {() => void} [onResetView]
 * @property {() => void} [onFocusSelected]
 * @property {(id: SlimeId) => void} [onPet]
 * @property {() => void} [onOfferNear]
 * @property {(id: string, point: { x: number, z: number }) => void} [onThrowPreset]
 * @property {(point: { x: number, z: number }) => void} [onReticleThrow]
 * @property {(id: string) => void} [onSelectObject]
 * @property {() => void} [onOpenFarmUpgrades]
 *
 * @typedef {object} UiSnapshot
 * @property {GameState | null} state
 * @property {Settings | null} settings
 * @property {SlimeId | null} selectedSlimeId
 * @property {'playable' | 'recovery' | 'blocked'} phase
 * @property {'saved' | 'unsaved' | 'session-only' | 'secondary-tab'} storageStatus
 * @property {boolean} quotaFailed
 * @property {boolean} commandsEnabled
 * @property {string | null} notice
 * @property {string} actionStatus
 * @property {ReconcileSummary | null} offlineSummary
 * @property {number} rateMicroPerSecond
 * @property {boolean} reducedMotion
 * @property {boolean} animationsPaused
 * @property {HudMode} [mode]
 * @property {HudTool} [tool]
 * @property {string | null} [selectedObjectId]
 */

const PERSIST_COPY = Object.freeze({
  saved: HUD_COPY.saved,
  unsaved: HUD_COPY.unsaved,
  'session-only': HUD_COPY.sessionOnly,
  'secondary-tab': HUD_COPY.secondaryTab,
});

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function must(id) {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`);
  }
  return node;
}

/**
 * @param {HTMLElement} node
 * @param {string} text
 */
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * @param {HTMLButtonElement} node
 * @param {boolean} disabled
 */
function setDisabled(node, disabled) {
  if (node.disabled !== disabled) node.disabled = disabled;
}

/**
 * @param {HTMLElement} node
 * @param {boolean} hidden
 */
function setHidden(node, hidden) {
  if (node.hidden !== hidden) node.hidden = hidden;
}

/**
 * @param {HTMLElement} node
 * @param {string} name
 * @param {string | null} value
 */
function setAttr(node, name, value) {
  const current = node.getAttribute(name);
  if (value == null) {
    if (current != null) node.removeAttribute(name);
    return;
  }
  if (current !== value) node.setAttribute(name, value);
}

/**
 * @param {GameState} state
 * @returns {TutorialStep | null}
 */
export function nextTutorialStep(state) {
  for (const step of TUTORIAL_STEPS) {
    if (!state.tutorialCompleted.includes(step)) return step;
  }
  return null;
}

/**
 * @param {Settings} settings
 * @returns {boolean}
 */
export function effectiveReducedMotion(settings) {
  if (settings.reducedMotion === true) return true;
  if (settings.reducedMotion === false) return false;
  return Boolean(
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
  );
}

/**
 * @param {ReconcileSummary} summary
 * @returns {string}
 */
export function offlineSummaryText(summary) {
  const lines = [
    `While away (${formatAway(summary.awayMs)}):`,
    `Glow gained: ${formatGlowAmount(summary.glowEarnedMicro)}`,
    `Berries gained: ${summary.berriesGained}`,
  ];
  if (summary.capped) {
    lines.push('Earnings stopped after 8 hours.');
  }
  return lines.join('\n');
}

/**
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.localName;
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/**
 * @param {HTMLElement} _root
 * @param {UiCallbacks} [callbacks]
 */
export function bindDom(_root, callbacks = {}) {
  const loading = must('loading');
  const errorRegion = must('error');
  const errorMessage = must('error-message');
  const recovery = must('recovery');
  const recoveryTitle = must('recovery-title');
  const recoveryBody = must('recovery-body');
  const recoveryDownload = /** @type {HTMLButtonElement} */ (
    must('recovery-download')
  );
  const play = must('play');
  const persistStatus = must('persist-status');
  const berriesValue = must('berries-value');
  const berryEta = must('berry-eta');
  const berryProgress = /** @type {HTMLProgressElement} */ (must('berry-progress'));
  const glowValue = must('glow-value');
  const rateValue = must('rate-value');
  const tabBanner = must('tab-banner');
  const notice = must('notice');
  const tutorialHint = must('tutorial-hint');
  const actionStatus = must('action-status');
  const liveRegion = must('live-region');
  const residentList = must('resident-list');
  const selectedName = must('selected-name');
  const selectedActivity = must('selected-activity');
  const selectedFeeds = must('selected-feeds');
  const selectedBonus = must('selected-bonus');
  const selectedPetStatus = must('selected-pet-status');
  const feedButton = /** @type {HTMLButtonElement} */ (must('feed-button'));
  const feedReason = must('feed-reason');
  const petButton = /** @type {HTMLButtonElement} */ (must('pet-button'));
  const focusSelectedPanel = /** @type {HTMLButtonElement} */ (
    must('focus-selected-panel')
  );
  const upgradeList = must('upgrade-list');
  const companionStatus = must('companion-status');
  const companionProgress = must('companion-progress');
  const pendingFood = must('pending-food');
  const pendingFoodKeyboard = must('pending-food-keyboard');
  const offlineSummary = must('offline-summary');
  const offlineSummaryBody = must('offline-summary-body');
  const settingsOpen = /** @type {HTMLButtonElement} */ (must('settings-open'));
  const playControls = must('play-controls');
  const sceneStage = must('scene-stage');
  const populationButton = /** @type {HTMLButtonElement} */ (
    must('population-button')
  );
  const populationValue = must('population-value');
  const berryToolSelect = /** @type {HTMLButtonElement} */ (
    must('berry-tool-select')
  );
  const toolBerry = /** @type {HTMLButtonElement} */ (must('tool-berry'));
  const toolHand = /** @type {HTMLButtonElement} */ (must('tool-hand'));
  const toolOrbit = /** @type {HTMLButtonElement} */ (must('tool-orbit'));
  const modeIndicator = must('mode-indicator');
  const cameraZoomIn = /** @type {HTMLButtonElement} */ (must('camera-zoom-in'));
  const cameraZoomOut = /** @type {HTMLButtonElement} */ (must('camera-zoom-out'));
  const cameraReset = /** @type {HTMLButtonElement} */ (must('camera-reset'));
  const cameraFocus = /** @type {HTMLButtonElement} */ (must('camera-focus'));
  const cameraUnavailable = must('camera-unavailable');
  const backToCare = /** @type {HTMLButtonElement} */ (must('back-to-care'));
  const orbitHint = must('orbit-hint');
  const farmUpgradesOpen = /** @type {HTMLButtonElement} */ (
    must('farm-upgrades-open')
  );
  const keyboardOpen = /** @type {HTMLButtonElement} */ (must('keyboard-open'));
  const contextPanel = must('context-panel');
  const contextDismiss = /** @type {HTMLButtonElement} */ (must('context-dismiss'));
  const contextResident = must('context-resident');
  const contextObject = must('context-object');
  const objectName = must('object-name');
  const objectLevel = must('object-level');
  const objectEffect = must('object-effect');
  const objectCost = must('object-cost');
  const objectShortfall = must('object-shortfall');
  const objectUpgrade = /** @type {HTMLButtonElement} */ (must('object-upgrade'));
  const rosterPanel = must('roster-panel');
  const rosterDismiss = /** @type {HTMLButtonElement} */ (must('roster-dismiss'));
  const upgradesPanel = must('upgrades-panel');
  const upgradesDismiss = /** @type {HTMLButtonElement} */ (
    must('upgrades-dismiss')
  );
  const keyboardPanel = must('keyboard-panel');
  const keyboardDismiss = /** @type {HTMLButtonElement} */ (
    must('keyboard-dismiss')
  );
  const regionPresets = must('region-presets');
  const reticleReadout = must('reticle-readout');
  const reticleThrow = /** @type {HTMLButtonElement} */ (must('reticle-throw'));

  /** @type {HudControlState} */
  let hud = createHudControlState();
  let rendererAvailable = true;
  let reticle = createReticle();
  /** @type {GameState | null} */
  let lastState = null;
  /** @type {UiSnapshot | null} */
  let lastSnap = null;
  /** @type {Map<string, number>} */
  const petUntil = new Map();

  feedButton.setAttribute('aria-describedby', 'feed-reason');

  /**
   * @param {HudMode} mode
   */
  function applyMode(mode) {
    hud = setHudMode(hud, mode);
    callbacks.onSetMode?.(mode);
    paintHudChrome();
  }

  /**
   * @param {HudTool} tool
   */
  function applyTool(tool) {
    hud = setHudTool(hud, tool);
    callbacks.onSetMode?.('care');
    callbacks.onSetTool?.(tool);
    paintHudChrome();
  }

  /**
   * @param {HudPanel} panel
   */
  function openPanel(panel) {
    hud = { ...hud, openPanel: panel };
    if (panel === 'upgrades') callbacks.onOpenFarmUpgrades?.();
    paintHudChrome();
  }

  function closeTopPanel() {
    if (
      hud.openPanel === 'roster' ||
      hud.openPanel === 'upgrades' ||
      hud.openPanel === 'keyboard' ||
      hud.openPanel === 'object' ||
      hud.openPanel === 'resident'
    ) {
      if (hud.openPanel === 'object') {
        hud = {
          ...hud,
          selectedObjectId: null,
          openPanel: hud.selectedSlimeId ? 'resident' : 'none',
        };
      } else {
        hud = {
          ...hud,
          openPanel: hud.selectedSlimeId ? 'resident' : 'none',
        };
      }
      paintHudChrome();
      return true;
    }
    return false;
  }

  function offerNear() {
    if (typeof callbacks.onOfferNear === 'function') {
      callbacks.onOfferNear();
      return;
    }
    callbacks.onFeed?.();
  }

  function focusSelected() {
    callbacks.onFocusSelected?.();
  }

  /**
   * @param {SlimeId} slimeId
   */
  function petSelected(slimeId) {
    const now = Date.now();
    const until = petUntil.get(slimeId) ?? 0;
    if (now < until) {
      setText(selectedPetStatus, HUD_COPY.alreadyPetted);
      return;
    }
    petUntil.set(slimeId, now + PET_FEEDBACK_COOLDOWN_MS);
    if (typeof callbacks.onPet === 'function') {
      callbacks.onPet(slimeId);
      setText(selectedPetStatus, '');
      return;
    }
    const slime = lastState?.slimes.find((entry) => entry.id === slimeId);
    setText(selectedPetStatus, slime ? `Patted ${slime.name}` : 'Patted');
  }

  feedButton.addEventListener('click', () => offerNear());
  petButton.addEventListener('click', () => {
    if (hud.selectedSlimeId) petSelected(hud.selectedSlimeId);
  });
  focusSelectedPanel.addEventListener('click', () => focusSelected());
  must('try-again').addEventListener('click', () => callbacks.onTryAgain?.());
  must('offline-summary-dismiss').addEventListener('click', () => {
    callbacks.onDismissOffline?.();
  });
  notice.addEventListener('click', () => callbacks.onDismissNotice?.());
  must('recovery-new').addEventListener('click', () => callbacks.onRecoveryNew?.());
  must('recovery-import').addEventListener('click', () => {
    callbacks.onRecoveryImport?.();
  });
  recoveryDownload.addEventListener('click', () => callbacks.onRecoveryDownload?.());
  settingsOpen.addEventListener('click', () => callbacks.onOpenSettings?.());

  berryToolSelect.addEventListener('click', () => applyTool('berry'));
  toolBerry.addEventListener('click', () => applyTool('berry'));
  toolHand.addEventListener('click', () => applyTool('hand'));
  toolOrbit.addEventListener('click', () => applyMode('orbit'));
  backToCare.addEventListener('click', () => applyMode('care'));
  cameraZoomIn.addEventListener('click', () => callbacks.onZoom?.(1.15));
  cameraZoomOut.addEventListener('click', () => callbacks.onZoom?.(1 / 1.15));
  cameraReset.addEventListener('click', () => callbacks.onResetView?.());
  cameraFocus.addEventListener('click', () => focusSelected());
  farmUpgradesOpen.addEventListener('click', () => openPanel('upgrades'));
  keyboardOpen.addEventListener('click', () => openPanel('keyboard'));
  populationButton.addEventListener('click', () => {
    if (hud.openPanel === 'roster') closeTopPanel();
    else openPanel('roster');
  });
  contextDismiss.addEventListener('click', () => closeTopPanel());
  rosterDismiss.addEventListener('click', () => closeTopPanel());
  upgradesDismiss.addEventListener('click', () => closeTopPanel());
  keyboardDismiss.addEventListener('click', () => closeTopPanel());
  objectUpgrade.addEventListener('click', () => {
    if (hud.selectedObjectId) callbacks.onBuy?.(hud.selectedObjectId);
  });
  reticleThrow.addEventListener('click', () => {
    callbacks.onReticleThrow?.({ x: reticle.x, z: reticle.z });
  });

  const skipLink = document.querySelector('.skip-link');
  if (skipLink instanceof HTMLAnchorElement) {
    skipLink.addEventListener('click', (event) => {
      const target = document.getElementById('play-controls');
      if (!(target instanceof HTMLElement)) return;
      event.preventDefault();
      target.focus();
    });
  }

  for (const preset of REGION_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.dataset.region = preset.id;
    setText(button, preset.label);
    button.addEventListener('click', () => {
      callbacks.onThrowPreset?.(preset.id, { x: preset.x, z: preset.z });
    });
    regionPresets.append(button);
  }

  /** @type {Map<string, { inspect: HTMLButtonElement, level: HTMLElement, effect: HTMLElement, cost: HTMLElement, shortfall: HTMLElement, buy: HTMLButtonElement }>} */
  const upgradeRows = new Map();
  for (const id of UPGRADE_IDS) {
    const row = document.createElement('li');
    row.className = 'upgrade-row';
    row.dataset.upgrade = id;

    const inspect = document.createElement('button');
    inspect.type = 'button';
    inspect.className = 'upgrade-inspect';
    setText(inspect, formatUpgradeLabel(id));
    inspect.addEventListener('click', () => selectObject(id));

    const level = document.createElement('p');
    level.className = 'upgrade-level';

    const effect = document.createElement('p');
    effect.className = 'upgrade-effect';

    const cost = document.createElement('p');
    cost.className = 'upgrade-cost';

    const shortfall = document.createElement('p');
    shortfall.className = 'reason';

    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'btn';
    setText(buy, HUD_COPY.upgrade);
    buy.addEventListener('click', () => callbacks.onBuy?.(id));

    row.append(inspect, level, effect, cost, shortfall, buy);
    upgradeList.append(row);
    upgradeRows.set(id, { inspect, level, effect, cost, shortfall, buy });
  }

  const companionFeeds = document.createElement('li');
  const companionGlow = document.createElement('li');
  const companionCapItem = document.createElement('li');
  const companionCap = document.createElement('button');
  companionCap.type = 'button';
  companionCap.className = 'companion-link';
  companionCapItem.append(companionCap);
  companionProgress.append(companionFeeds, companionGlow, companionCapItem);
  companionCap.addEventListener('click', () => selectObject('beds'));

  /**
   * @param {string} id
   */
  function selectObject(id) {
    hud = {
      ...hud,
      selectedObjectId: id,
      openPanel: 'object',
    };
    callbacks.onSelectObject?.(id);
    paintHudChrome();
    if (lastSnap) patchObjectCard(lastSnap);
  }

  /**
   * Reconcile resident buttons by slime id. Existing nodes keep their listeners
   * and keyboard focus.
   *
   * @param {GameState} state
   * @param {SlimeId | null} selectedId
   */
  function reconcileResidents(state, selectedId) {
    /** @type {Map<string, HTMLButtonElement>} */
    const existing = new Map();
    for (const child of residentList.children) {
      if (!(child instanceof HTMLButtonElement)) continue;
      existing.set(String(child.dataset.slimeId), child);
    }

    const keep = new Set();
    for (const slime of state.slimes) {
      keep.add(slime.id);
      let button = existing.get(slime.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'resident-btn';
        button.dataset.slimeId = slime.id;
        const nameEl = document.createElement('span');
        nameEl.className = 'resident-name';
        const stateEl = document.createElement('span');
        stateEl.className = 'resident-state';
        button.append(nameEl, stateEl);
        const slimeId = slime.id;
        button.addEventListener('click', () => {
          hud = {
            ...hud,
            selectedSlimeId: slimeId,
            selectedObjectId: null,
            openPanel: 'resident',
          };
          callbacks.onSelect?.(slimeId);
          paintHudChrome();
        });
        residentList.append(button);
      }

      const nameEl = button.querySelector('.resident-name');
      const stateEl = button.querySelector('.resident-state');
      if (nameEl instanceof HTMLElement) setText(nameEl, slime.name);
      const selected = slime.id === selectedId;
      if (stateEl instanceof HTMLElement) {
        setText(stateEl, formatResidentActivity(state, slime));
      }
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }

    for (const [id, button] of existing) {
      if (!keep.has(id)) button.remove();
    }
  }

  function paintHudChrome() {
    const pressed = hudPressed(hud);
    setAttr(toolBerry, 'aria-pressed', pressed.berry ? 'true' : 'false');
    setAttr(toolHand, 'aria-pressed', pressed.hand ? 'true' : 'false');
    setAttr(toolOrbit, 'aria-pressed', pressed.orbit ? 'true' : 'false');
    const modeLabel =
      hud.mode === 'orbit'
        ? 'Orbit'
        : hud.tool === 'hand'
          ? 'Care · Hand'
          : 'Care · Berry';
    setText(modeIndicator, modeLabel);
    setAttr(sceneStage, 'data-mode', hud.mode);
    setHidden(orbitHint, hud.mode !== 'orbit');
    setHidden(backToCare, hud.mode !== 'orbit');
    setText(orbitHint, HUD_COPY.orbitHint);
    setText(backToCare, HUD_COPY.backToCare);
    setText(reticleReadout, formatReticle(reticle));

    const camerasOff = !rendererAvailable;
    setDisabled(cameraZoomIn, camerasOff);
    setDisabled(cameraZoomOut, camerasOff);
    setDisabled(cameraReset, camerasOff);
    setDisabled(cameraFocus, camerasOff);
    setHidden(cameraUnavailable, !camerasOff);
    setText(cameraUnavailable, HUD_COPY.cameraUnavailable);

    const showResident = hud.openPanel === 'resident' && Boolean(hud.selectedSlimeId);
    const showObject = hud.openPanel === 'object' && Boolean(hud.selectedObjectId);
    setHidden(contextPanel, !showResident && !showObject);
    setHidden(contextResident, !showResident);
    setHidden(contextObject, !showObject);
    setHidden(rosterPanel, hud.openPanel !== 'roster');
    setHidden(upgradesPanel, hud.openPanel !== 'upgrades');
    const showKeyboard = hud.openPanel === 'keyboard' || !rendererAvailable;
    setHidden(keyboardPanel, !showKeyboard);
    setAttr(populationButton, 'aria-expanded', hud.openPanel === 'roster' ? 'true' : 'false');
  }

  /**
   * @param {UiSnapshot} snap
   */
  function patchObjectCard(snap) {
    if (!snap.state || !hud.selectedObjectId) return;
    const state = snap.state;
    const id = hud.selectedObjectId;
    if (
      id !== 'shrub' &&
      id !== 'pantry' &&
      id !== 'bloom' &&
      id !== 'beds'
    ) {
      return;
    }
    const level = state.upgrades[id];
    const max = UPGRADE_MAX_LEVEL[id];
    const costMicro = getNextUpgradeCostMicro(state, id);
    setText(objectName, formatHudObjectLabel(id));
    setText(objectLevel, `Level ${level}/${max}`);
    setText(objectEffect, formatUpgradeCardEffect(state, id));
    if (costMicro == null) {
      setText(objectCost, HUD_COPY.maxLevel);
      setText(objectShortfall, '');
      setDisabled(objectUpgrade, true);
      setText(objectUpgrade, HUD_COPY.maxLevel);
    } else {
      setText(objectCost, formatCostLabel(costMicro));
      setText(objectShortfall, formatShortfall(costMicro, state.glowMicro));
      const unaffordable = state.glowMicro < costMicro;
      setDisabled(objectUpgrade, !snap.commandsEnabled || unaffordable);
      setText(objectUpgrade, HUD_COPY.upgrade);
    }
  }

  /**
   * @param {UiSnapshot} snap
   */
  function update(snap) {
    lastSnap = snap;
    lastState = snap.state;
    document.documentElement.dataset.reducedMotion = snap.reducedMotion
      ? 'true'
      : 'false';
    document.documentElement.dataset.animPaused = snap.animationsPaused
      ? 'true'
      : 'false';
    if (snap.settings) {
      document.documentElement.dataset.quality = snap.settings.quality;
    }

    if (snap.mode === 'care' || snap.mode === 'orbit') {
      hud = { ...hud, mode: snap.mode };
    }
    if (snap.tool === 'berry' || snap.tool === 'hand') {
      hud = { ...hud, tool: snap.tool, lastCareTool: snap.tool };
    }
    if (snap.selectedObjectId !== undefined) {
      hud = { ...hud, selectedObjectId: snap.selectedObjectId };
    }

    if (snap.selectedSlimeId !== hud.selectedSlimeId) {
      hud = { ...hud, selectedSlimeId: snap.selectedSlimeId };
      if (
        snap.selectedSlimeId &&
        hud.openPanel !== 'object' &&
        hud.openPanel !== 'roster' &&
        hud.openPanel !== 'upgrades' &&
        hud.openPanel !== 'keyboard'
      ) {
        hud = { ...hud, openPanel: 'resident' };
      }
    }

    const persistText =
      snap.storageStatus === 'unsaved' && snap.quotaFailed
        ? `${HUD_COPY.unsaved}`
        : PERSIST_COPY[snap.storageStatus];
    setText(persistStatus, persistText);

    tabBanner.hidden = snap.phase !== 'blocked';
    setDisabled(settingsOpen, snap.phase === 'blocked');

    if (snap.notice) {
      notice.hidden = false;
      setText(notice, snap.notice);
    } else {
      notice.hidden = true;
      setText(notice, '');
    }

    setText(actionStatus, snap.actionStatus);

    if (snap.offlineSummary) {
      offlineSummary.hidden = false;
      setText(offlineSummaryBody, offlineSummaryText(snap.offlineSummary));
    } else {
      offlineSummary.hidden = true;
      setText(offlineSummaryBody, '');
    }

    if (!snap.state) {
      paintHudChrome();
      return;
    }
    const state = snap.state;

    if (
      hud.selectedSlimeId &&
      !state.slimes.some((slime) => slime.id === hud.selectedSlimeId)
    ) {
      hud = {
        ...hud,
        selectedSlimeId: snap.selectedSlimeId,
        openPanel:
          hud.openPanel === 'resident'
            ? snap.selectedSlimeId
              ? 'resident'
              : 'none'
            : hud.openPanel,
      };
    }

    const capacity = getBerryCapacity(state);
    setText(berriesValue, `${state.berries}/${capacity}`);
    if (state.berries >= capacity || state.nextBerryAtMs == null) {
      setText(berryEta, 'full');
      berryProgress.value = 100;
    } else {
      setText(
        berryEta,
        `next ${formatDuration(state.nextBerryAtMs - state.simTimeMs)}`,
      );
      berryProgress.value = Math.round(
        berryRegenProgress(state, getBerryIntervalMs(state)) * 100,
      );
    }
    setText(glowValue, formatWalletGlow(state.glowMicro));
    setText(rateValue, formatRate(snap.rateMicroPerSecond));

    const tutorial = nextTutorialStep(state);
    setText(tutorialHint, tutorial ? TUTORIAL_COPY[tutorial] ?? '' : '');

    const popCap = getResidentCapacity(state);
    setText(populationValue, `${state.slimes.length}/${popCap}`);
    setAttr(
      populationButton,
      'aria-label',
      `Friends ${state.slimes.length} of ${popCap}. Open roster.`,
    );

    reconcileResidents(state, hud.selectedSlimeId);

    const selected = state.slimes.find(
      (slime) => slime.id === hud.selectedSlimeId,
    );
    if (selected) {
      setText(selectedName, selected.name);
      setText(selectedActivity, formatResidentActivity(state, selected));
      setText(selectedFeeds, formatMealCount(selected.feedCount));
      const bonusMs = selected.boostUntilMs - state.simTimeMs;
      setText(
        selectedBonus,
        bonusMs > 0
          ? `Cozy bonus: 2× for ${formatDuration(bonusMs)}`
          : 'No cozy bonus',
      );
    } else {
      setText(selectedName, 'No slime selected');
      setText(selectedActivity, '');
      setText(selectedFeeds, '');
      setText(selectedBonus, '');
    }

    const reason = offerNearDisabledReason(state, hud.selectedSlimeId);
    const feedDisabled = !snap.commandsEnabled || reason != null;
    setDisabled(feedButton, feedDisabled);
    setText(feedReason, snap.commandsEnabled ? reason ?? '' : '');
    setDisabled(petButton, !snap.commandsEnabled || !selected);
    setDisabled(focusSelectedPanel, !rendererAvailable || !selected);
    setDisabled(reticleThrow, !snap.commandsEnabled);

    for (const id of UPGRADE_IDS) {
      const row = upgradeRows.get(id);
      if (!row) continue;
      const level = state.upgrades[id];
      const max = UPGRADE_MAX_LEVEL[id];
      const costMicro = getNextUpgradeCostMicro(state, id);
      setText(row.level, `Level ${level}/${max}`);
      setText(row.effect, formatUpgradeCardEffect(state, id));
      if (costMicro == null) {
        setText(row.cost, HUD_COPY.maxLevel);
        setText(row.shortfall, '');
        setDisabled(row.buy, true);
        setText(row.buy, HUD_COPY.maxLevel);
      } else {
        setText(row.cost, formatCostLabel(costMicro));
        setText(row.shortfall, formatShortfall(costMicro, state.glowMicro));
        const unaffordable = state.glowMicro < costMicro;
        setDisabled(row.buy, !snap.commandsEnabled || unaffordable);
        setText(row.buy, HUD_COPY.upgrade);
      }
    }

    patchObjectCard(snap);

    const companion = getCompanionEligibility(state);
    setText(companionStatus, formatCompanionStatus(companion));
    if (companion.nextPopulation == null) {
      companionProgress.hidden = true;
    } else {
      companionProgress.hidden = false;
      setText(
        companionFeeds,
        `Care ${state.totalFeeds} / ${companion.requiredFeeds}`,
      );
      setText(
        companionGlow,
        `Lifetime Glow ${formatGlowAmount(state.lifetimeGlowMicro)} / ${formatGlowAmount(companion.requiredLifetimeGlowMicro)}`,
      );
      setText(
        companionCap,
        companion.feedsMet && companion.glowMet && !companion.capacityMet
          ? HUD_COPY.missingPad
          : `Pads ${getResidentCapacity(state)} / ${companion.requiredCapacity}`,
      );
    }

    const foodCount = pendingFoodCount(state);
    const foodText = formatPendingFood(foodCount);
    setText(pendingFood, foodText);
    setText(pendingFoodKeyboard, foodText);

    paintHudChrome();
  }

  /**
   * @param {string} text
   */
  function announce(text) {
    if (!text) return;
    if (liveRegion.textContent === text) {
      liveRegion.textContent = '';
    }
    liveRegion.textContent = text;
  }

  /**
   * @param {object} options
   * @param {'CORRUPT' | 'FUTURE_VERSION'} options.reason
   * @param {boolean} options.hasRaw
   */
  function showRecovery(options) {
    loading.hidden = true;
    errorRegion.hidden = true;
    play.hidden = true;
    recovery.hidden = false;
    if (options.reason === 'FUTURE_VERSION') {
      setText(recoveryTitle, 'This save is from a newer version');
      setText(
        recoveryBody,
        'The stored garden was not overwritten. Start a new game, import an older save, or download the unreadable file.',
      );
    } else {
      setText(recoveryTitle, 'Could not read the saved garden');
      setText(
        recoveryBody,
        'The stored garden was not overwritten. Start a new game, import a save, or download the unreadable file.',
      );
    }
    recoveryDownload.hidden = !options.hasRaw;
  }

  function showPlay() {
    loading.hidden = true;
    errorRegion.hidden = true;
    recovery.hidden = true;
    play.hidden = false;
    paintHudChrome();
  }

  /**
   * @param {string} message
   */
  function showError(message) {
    loading.hidden = true;
    recovery.hidden = true;
    play.hidden = true;
    errorRegion.hidden = false;
    setText(errorMessage, message);
  }

  document.addEventListener('keydown', (event) => {
    if (play.hidden) return;
    if (isTypingTarget(event.target)) return;
    if (document.querySelector('dialog[open]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    const inPlay =
      active instanceof Node &&
      (play.contains(active) || active === document.body);
    if (!inPlay) return;

    if (event.key === 'Escape') {
      if (closeTopPanel()) {
        event.preventDefault();
        return;
      }
      if (hud.mode === 'orbit') {
        event.preventDefault();
        applyMode('care');
      }
      return;
    }

    const playFrameFocused =
      active === playControls ||
      active === sceneStage ||
      active === keyboardPanel ||
      (active instanceof Node &&
        (playControls.contains(active) || keyboardPanel.contains(active)));
    if (!playFrameFocused) return;

    if (event.key === '1') {
      event.preventDefault();
      applyTool('berry');
    } else if (event.key === '2') {
      event.preventDefault();
      applyTool('hand');
    } else if (event.key === 'o' || event.key === 'O') {
      event.preventDefault();
      applyMode(hud.mode === 'orbit' ? 'care' : 'orbit');
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      callbacks.onZoom?.(1.15);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      callbacks.onZoom?.(1 / 1.15);
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      callbacks.onResetView?.();
    } else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'Enter'
    ) {
      const reticleFocus =
        active === playControls ||
        active === sceneStage ||
        active === keyboardPanel ||
        active === reticleThrow;
      if (!reticleFocus) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        callbacks.onReticleThrow?.({ x: reticle.x, z: reticle.z });
        return;
      }
      event.preventDefault();
      const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const dz = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
      reticle = stepReticle(reticle, dx, dz);
      setText(reticleReadout, formatReticle(reticle));
    }
  });

  paintHudChrome();

  return {
    update,
    announce,
    showRecovery,
    showPlay,
    showError,
    /**
     * @param {string} text
     */
    setActionStatus(text) {
      setText(actionStatus, text);
    },
    /**
     * @param {boolean} available
     */
    setRendererAvailable(available) {
      rendererAvailable = Boolean(available);
      paintHudChrome();
      if (lastSnap) update(lastSnap);
    },
    getHudState() {
      return hud;
    },
    selectObject,
  };
}

/**
 * @param {ImportPreview} preview
 * @returns {string}
 */
export function formatImportPreview(preview) {
  const slimeWord = preview.population === 1 ? 'slime' : 'slimes';
  return `${preview.population} ${slimeWord} · ${formatGlowAmount(preview.glowMicro)} Glow · saved ${formatSavedDate(preview.savedWallMs)}`;
}

export { formatImportFailure };
