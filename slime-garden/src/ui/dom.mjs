/**
 * Game DOM: cache nodes, bind once, patch text/state. Never rebuild the tree
 * on a currency tick. Save strings go through textContent.
 */

import { TUTORIAL_STEPS, UPGRADE_IDS, UPGRADE_MAX_LEVEL } from '../core/balance.mjs';
import {
  getBerryCapacity,
  getCompanionEligibility,
  getNextUpgradeCostMicro,
  getResidentCapacity,
} from '../core/selectors.mjs';
import {
  formatAway,
  formatCostLabel,
  formatDuration,
  formatGlowAmount,
  formatImportFailure,
  formatNextUpgradeEffect,
  formatRate,
  formatSavedDate,
  formatShortfall,
  formatUpgradeLabel,
  formatWalletGlow,
} from './format.mjs';

/**
 * @typedef {import('../core/state.mjs').GameState} GameState
 * @typedef {import('../core/state.mjs').SlimeId} SlimeId
 * @typedef {import('../core/state.mjs').TutorialStep} TutorialStep
 * @typedef {import('../core/validate.mjs').Settings} Settings
 * @typedef {import('../persistence/save-store.mjs').ImportPreview} ImportPreview
 * @typedef {import('../persistence/reconcile.mjs').ReconcileSummary} ReconcileSummary
 *
 * @typedef {object} UiCallbacks
 * @property {(id: SlimeId) => void} onSelect
 * @property {() => void} onFeed
 * @property {(id: string) => void} onBuy
 * @property {() => void} onWelcome
 * @property {() => void} onTryAgain
 * @property {() => void} onDismissOffline
 * @property {() => void} onDismissNotice
 * @property {() => void} onRecoveryNew
 * @property {() => void} onRecoveryImport
 * @property {() => void} onRecoveryDownload
 * @property {() => void} onOpenSettings
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
 */

const TUTORIAL_COPY = Object.freeze({
  feed: 'Select your slime, then offer a berry.',
  berry: 'Berries grow back on their own. Watch the next-berry timer.',
  welcome: 'When the companion strip is ready, welcome a new slime.',
  upgrade: 'Spend Glow on an upgrade whenever you like.',
});

const PERSIST_COPY = Object.freeze({
  saved: 'Saved',
  unsaved: 'Unsaved',
  'session-only': 'Session-only',
  'secondary-tab': 'This game is active in another tab',
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
 * Distinct feed-disabled copy from the design spec.
 *
 * @param {GameState} state
 * @param {SlimeId | null} selectedId
 * @returns {string | null}
 */
export function feedDisabledReason(state, selectedId) {
  if (!selectedId) return 'Choose a slime';
  if (state.berries < 1) {
    const remaining =
      state.nextBerryAtMs == null ? 0 : state.nextBerryAtMs - state.simTimeMs;
    return `More berries in ${formatDuration(remaining)}`;
  }
  if (state.simTimeMs < state.nextFeedAllowedAtMs) {
    return `Ready in ${formatDuration(state.nextFeedAllowedAtMs - state.simTimeMs)}`;
  }
  return null;
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
 * @param {HTMLElement} _root
 * @param {UiCallbacks} callbacks
 */
export function bindDom(_root, callbacks) {
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
  const glowValue = must('glow-value');
  const rateValue = must('rate-value');
  const tabBanner = must('tab-banner');
  const notice = must('notice');
  const tutorialHint = must('tutorial-hint');
  const actionStatus = must('action-status');
  const liveRegion = must('live-region');
  const residentList = must('resident-list');
  const selectedName = must('selected-name');
  const selectedFeeds = must('selected-feeds');
  const selectedBonus = must('selected-bonus');
  const feedButton = /** @type {HTMLButtonElement} */ (must('feed-button'));
  const feedReason = must('feed-reason');
  const upgradeList = must('upgrade-list');
  const companionStatus = must('companion-status');
  const companionProgress = must('companion-progress');
  const welcomeButton = /** @type {HTMLButtonElement} */ (must('welcome-button'));
  const offlineSummary = must('offline-summary');
  const offlineSummaryBody = must('offline-summary-body');
  const settingsOpen = /** @type {HTMLButtonElement} */ (must('settings-open'));

  feedButton.setAttribute('aria-describedby', 'feed-reason');
  feedButton.addEventListener('click', () => callbacks.onFeed());
  welcomeButton.addEventListener('click', () => callbacks.onWelcome());
  must('try-again').addEventListener('click', () => callbacks.onTryAgain());
  must('offline-summary-dismiss').addEventListener('click', () => {
    callbacks.onDismissOffline();
  });
  notice.addEventListener('click', () => callbacks.onDismissNotice());
  must('recovery-new').addEventListener('click', () => callbacks.onRecoveryNew());
  must('recovery-import').addEventListener('click', () => {
    callbacks.onRecoveryImport();
  });
  recoveryDownload.addEventListener('click', () => callbacks.onRecoveryDownload());
  settingsOpen.addEventListener('click', () => callbacks.onOpenSettings());

  /** @type {Map<string, { level: HTMLElement, effect: HTMLElement, cost: HTMLElement, shortfall: HTMLElement, buy: HTMLButtonElement }>} */
  const upgradeRows = new Map();
  for (const id of UPGRADE_IDS) {
    const row = document.createElement('li');
    row.className = 'upgrade-row';
    row.dataset.upgrade = id;

    const name = document.createElement('p');
    name.className = 'upgrade-name';
    setText(name, formatUpgradeLabel(id));

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
    setText(buy, 'Buy');
    buy.addEventListener('click', () => callbacks.onBuy(id));

    row.append(name, level, effect, cost, shortfall, buy);
    upgradeList.append(row);
    upgradeRows.set(id, { level, effect, cost, shortfall, buy });
  }

  const companionFeeds = document.createElement('li');
  const companionGlow = document.createElement('li');
  const companionCap = document.createElement('li');
  companionProgress.append(companionFeeds, companionGlow, companionCap);

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
        button.addEventListener('click', () => callbacks.onSelect(slimeId));
        residentList.append(button);
      }

      const nameEl = button.querySelector('.resident-name');
      const stateEl = button.querySelector('.resident-state');
      if (nameEl instanceof HTMLElement) setText(nameEl, slime.name);
      const selected = slime.id === selectedId;
      if (stateEl instanceof HTMLElement) {
        setText(stateEl, selected ? 'selected' : '');
      }
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }

    for (const [id, button] of existing) {
      if (!keep.has(id)) button.remove();
    }
  }

  /**
   * @param {UiSnapshot} snap
   */
  function update(snap) {
    document.documentElement.dataset.reducedMotion = snap.reducedMotion
      ? 'true'
      : 'false';
    document.documentElement.dataset.animPaused = snap.animationsPaused
      ? 'true'
      : 'false';
    if (snap.settings) {
      document.documentElement.dataset.quality = snap.settings.quality;
    }

    const persistText =
      snap.storageStatus === 'unsaved' && snap.quotaFailed
        ? 'Unsaved (quota)'
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

    if (!snap.state) return;
    const state = snap.state;

    const capacity = getBerryCapacity(state);
    setText(berriesValue, `${state.berries}/${capacity}`);
    if (state.berries >= capacity || state.nextBerryAtMs == null) {
      setText(berryEta, 'full');
    } else {
      setText(
        berryEta,
        `next ${formatDuration(state.nextBerryAtMs - state.simTimeMs)}`,
      );
    }
    setText(glowValue, formatWalletGlow(state.glowMicro));
    setText(rateValue, formatRate(snap.rateMicroPerSecond));

    const tutorial = nextTutorialStep(state);
    setText(tutorialHint, tutorial ? TUTORIAL_COPY[tutorial] : '');

    reconcileResidents(state, snap.selectedSlimeId);

    const selected = state.slimes.find(
      (slime) => slime.id === snap.selectedSlimeId,
    );
    if (selected) {
      setText(selectedName, selected.name);
      setText(
        selectedFeeds,
        selected.feedCount === 1
          ? 'Fed 1 time'
          : `Fed ${selected.feedCount} times`,
      );
      const bonusMs = selected.boostUntilMs - state.simTimeMs;
      setText(
        selectedBonus,
        bonusMs > 0
          ? `Cozy bonus: 2× for ${formatDuration(bonusMs)}`
          : 'No cozy bonus',
      );
    } else {
      setText(selectedName, 'No slime selected');
      setText(selectedFeeds, '');
      setText(selectedBonus, '');
    }

    const reason = feedDisabledReason(state, snap.selectedSlimeId);
    const feedDisabled = !snap.commandsEnabled || reason != null;
    setDisabled(feedButton, feedDisabled);
    setText(feedReason, snap.commandsEnabled ? reason ?? '' : '');

    for (const id of UPGRADE_IDS) {
      const row = upgradeRows.get(id);
      if (!row) continue;
      const level = state.upgrades[id];
      const max = UPGRADE_MAX_LEVEL[id];
      const costMicro = getNextUpgradeCostMicro(state, id);
      setText(row.level, `Level ${level}/${max}`);
      setText(row.effect, formatNextUpgradeEffect(state, id));
      if (costMicro == null) {
        setText(row.cost, 'Maxed');
        setText(row.shortfall, '');
        setDisabled(row.buy, true);
        setText(row.buy, 'Maxed');
      } else {
        setText(row.cost, formatCostLabel(costMicro));
        setText(row.shortfall, formatShortfall(costMicro, state.glowMicro));
        const unaffordable = state.glowMicro < costMicro;
        setDisabled(row.buy, !snap.commandsEnabled || unaffordable);
        setText(row.buy, 'Buy');
      }
    }

    const companion = getCompanionEligibility(state);
    if (companion.nextPopulation == null) {
      setText(companionStatus, 'Your little colony is complete.');
      companionProgress.hidden = true;
      welcomeButton.hidden = true;
    } else {
      companionProgress.hidden = false;
      if (companion.ready) {
        setText(companionStatus, 'A companion is ready');
      } else if (companion.feedsMet && companion.glowMet && !companion.capacityMet) {
        setText(companionStatus, 'Ready when you add a resting pad');
      } else {
        setText(companionStatus, 'Next slime needs care, Glow, and space.');
      }
      setText(
        companionFeeds,
        `Feeds ${state.totalFeeds} / ${companion.requiredFeeds}`,
      );
      setText(
        companionGlow,
        `Lifetime Glow ${formatGlowAmount(state.lifetimeGlowMicro)} / ${formatGlowAmount(companion.requiredLifetimeGlowMicro)}`,
      );
      setText(
        companionCap,
        `Capacity ${getResidentCapacity(state)} / ${companion.requiredCapacity}`,
      );
      welcomeButton.hidden = !companion.ready;
      setDisabled(welcomeButton, !snap.commandsEnabled || !companion.ready);
    }
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
