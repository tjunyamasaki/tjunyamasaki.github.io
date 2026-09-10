/**
 * Isolated HUD playground. Mocked callbacks; does not load main.mjs.
 * Live /slime-garden/ still boots the current controller.
 */

import { getRateMicroPerSecond } from '../src/core/selectors.mjs';
import { createInitialState } from '../src/core/state.mjs';
import { createDefaultSettings } from '../src/core/validate.mjs';
import { bindDom, effectiveReducedMotion } from '../src/ui/dom.mjs';
import { HUD_COPY } from '../src/ui/format.mjs';

const gameRoot = document.getElementById('game');
if (!gameRoot) {
  throw new Error('Missing game root (#game).');
}

const settings = createDefaultSettings();
let state = createInitialState();
/** @type {import('../src/core/state.mjs').SlimeId | null} */
let selectedSlimeId = 'slime-1';
let actionStatus =
  'HUD preview · callbacks are mocked. Offer near logs onFeed fallback.';
let rendererOn = true;

/**
 * @param {string} text
 */
function note(text) {
  actionStatus = text;
  paint();
}

const ui = bindDom(gameRoot, {
  onSelect(id) {
    selectedSlimeId = id;
    note(`Selected ${id}`);
  },
  onFeed() {
    note('Offer near → onFeed fallback (live core still no-ops FEED until P2-13)');
  },
  onBuy(id) {
    note(`Upgrade ${id} (mocked; live onBuy still works on /slime-garden/)`);
  },
  onWelcome() {
    note('onWelcome called (no primary Welcome control)');
  },
  onTryAgain() {
    note('Try again');
  },
  onDismissOffline() {},
  onDismissNotice() {},
  onRecoveryNew() {},
  onRecoveryImport() {},
  onRecoveryDownload() {},
  onOpenSettings() {
    note('Settings opener (dialog is present; bindSettings is not wired here)');
  },
  onSetMode(mode) {
    note(`Mode ${mode}`);
  },
  onSetTool(tool) {
    note(`Tool ${tool} · equipping does not spend a berry`);
  },
  onZoom(factor) {
    note(`Zoom ×${factor}`);
  },
  onResetView() {
    note('Reset view');
  },
  onFocusSelected() {
    note(`Focus ${selectedSlimeId ?? 'none'}`);
  },
  onPet(id) {
    note(`Pet ${id} (not FEED)`);
  },
  onOfferNear() {
    note('Offer near selected (mocked THROW; not guaranteed delivery)');
  },
  onThrowPreset(id, point) {
    note(`Preset ${id} at ${point.x}, ${point.z}`);
  },
  onReticleThrow(point) {
    note(`Reticle toss at ${point.x}, ${point.z}`);
  },
  onSelectObject(id) {
    note(`Inspect ${id} (opening a card is free)`);
  },
  onOpenFarmUpgrades() {
    note('Farm upgrades list');
  },
});

function paint() {
  ui.update({
    state,
    settings,
    selectedSlimeId,
    phase: 'playable',
    storageStatus: 'session-only',
    quotaFailed: false,
    commandsEnabled: true,
    notice: null,
    actionStatus,
    offlineSummary: null,
    rateMicroPerSecond: getRateMicroPerSecond(state),
    reducedMotion: effectiveReducedMotion(settings),
    animationsPaused: settings.animationsPaused,
  });
}

const host = document.getElementById('scene-host');
if (host) {
  const placeholder = document.createElement('p');
  placeholder.className = 'scene-caption';
  placeholder.style.position = 'relative';
  placeholder.textContent =
    'No live scene in this preview. Tool belt, camera, roster, and Farm controls are interactive.';
  host.append(placeholder);
}

ui.showPlay();
ui.setRendererAvailable(rendererOn);
paint();
ui.announce(HUD_COPY.berryTossed);

const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'btn';
toggle.textContent = 'Toggle no-WebGL farm controls';
toggle.style.margin = '12px';
toggle.addEventListener('click', () => {
  rendererOn = !rendererOn;
  ui.setRendererAvailable(rendererOn);
  note(rendererOn ? 'Renderer available (camera on)' : 'No WebGL · camera disabled');
});
document.querySelector('.site-footer')?.prepend(toggle);
