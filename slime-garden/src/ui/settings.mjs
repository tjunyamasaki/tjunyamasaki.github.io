/**
 * Settings dialog and the export / import / reset confirmations.
 * Persistence and command policy stay in the application controller.
 */

import { formatImportFailure, formatImportPreview } from './dom.mjs';

/**
 * @typedef {import('../core/validate.mjs').Settings} Settings
 * @typedef {import('../persistence/save-store.mjs').ImportPreview} ImportPreview
 *
 * @typedef {object} SettingsCallbacks
 * @property {() => Settings | null} getSettings
 * @property {(patch: Partial<Settings>) => void} applySettings
 * @property {() => void} onExport
 * @property {(file: File) => void} onImportFile
 * @property {() => void} onReset
 * @property {() => boolean} canMutate
 */

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
 * @param {Settings} settings
 * @returns {'os' | 'on' | 'off'}
 */
function reducedMotionValue(settings) {
  if (settings.reducedMotion === true) return 'on';
  if (settings.reducedMotion === false) return 'off';
  return 'os';
}

/**
 * @param {HTMLFormElement} form
 * @returns {Partial<Settings>}
 */
function readForm(form) {
  const sound = form.querySelector('#setting-sound');
  const pause = form.querySelector('#setting-pause');
  const motion = form.querySelector('input[name="reducedMotion"]:checked');
  const quality = form.querySelector('input[name="quality"]:checked');
  /** @type {Partial<Settings>} */
  const patch = {};
  if (sound instanceof HTMLInputElement) patch.soundEnabled = sound.checked;
  if (pause instanceof HTMLInputElement) patch.animationsPaused = pause.checked;
  if (motion instanceof HTMLInputElement) {
    if (motion.value === 'on') patch.reducedMotion = true;
    else if (motion.value === 'off') patch.reducedMotion = false;
    else patch.reducedMotion = null;
  }
  if (quality instanceof HTMLInputElement) {
    if (
      quality.value === 'auto' ||
      quality.value === 'high' ||
      quality.value === 'low'
    ) {
      patch.quality = quality.value;
    }
  }
  return patch;
}

/**
 * @param {SettingsCallbacks} callbacks
 */
export function bindSettings(callbacks) {
  const dialog = /** @type {HTMLDialogElement} */ (must('settings-dialog'));
  const form = /** @type {HTMLFormElement} */ (must('settings-form'));
  const importDialog = /** @type {HTMLDialogElement} */ (must('import-dialog'));
  const resetDialog = /** @type {HTMLDialogElement} */ (must('reset-dialog'));
  const fileInput = /** @type {HTMLInputElement} */ (must('import-file'));
  const feedback = must('settings-feedback');
  const importSummary = must('import-summary');
  const importConfirm = must('import-confirm');
  const exportBtn = must('settings-export');
  const importBtn = must('settings-import');
  const resetBtn = must('settings-reset');
  const resetExport = must('reset-export');
  const resetConfirm = must('reset-confirm');

  /** @type {Element | null} */
  let opener = null;
  /** @type {null | (() => void)} */
  let pendingImport = null;

  /**
   * @param {string} text
   */
  function setFeedback(text) {
    feedback.textContent = text;
  }

  /**
   * @param {Settings} settings
   */
  function syncForm(settings) {
    const sound = form.querySelector('#setting-sound');
    const pause = form.querySelector('#setting-pause');
    if (sound instanceof HTMLInputElement) sound.checked = settings.soundEnabled;
    if (pause instanceof HTMLInputElement) {
      pause.checked = settings.animationsPaused;
    }
    const motionValue = reducedMotionValue(settings);
    for (const input of form.querySelectorAll('input[name="reducedMotion"]')) {
      if (input instanceof HTMLInputElement) {
        input.checked = input.value === motionValue;
      }
    }
    for (const input of form.querySelectorAll('input[name="quality"]')) {
      if (input instanceof HTMLInputElement) {
        input.checked = input.value === settings.quality;
      }
    }
  }

  function applyFromForm() {
    if (!callbacks.canMutate()) return;
    callbacks.applySettings(readForm(form));
  }

  form.addEventListener('change', applyFromForm);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dialog.close();
  });

  dialog.addEventListener('close', () => {
    if (opener instanceof HTMLElement) opener.focus();
    opener = null;
  });

  exportBtn.addEventListener('click', () => {
    callbacks.onExport();
    setFeedback('Save file downloaded.');
  });

  importBtn.addEventListener('click', () => {
    setFeedback('');
    fileInput.value = '';
    fileInput.click();
  });

  resetBtn.addEventListener('click', () => {
    if (typeof resetDialog.showModal === 'function') resetDialog.showModal();
  });

  resetExport.addEventListener('click', () => {
    callbacks.onExport();
  });

  resetConfirm.addEventListener('click', () => {
    callbacks.onReset();
    resetDialog.close();
    dialog.close();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    callbacks.onImportFile(file);
  });

  importConfirm.addEventListener('click', () => {
    const commit = pendingImport;
    pendingImport = null;
    importDialog.close();
    if (commit) commit();
  });

  importDialog.addEventListener('close', () => {
    pendingImport = null;
  });

  return {
    /**
     * @param {HTMLElement | null} [from]
     */
    open(from) {
      const settings = callbacks.getSettings();
      if (settings) syncForm(settings);
      setFeedback('');
      opener = from ?? document.activeElement;
      const mutating = callbacks.canMutate();
      for (const control of form.querySelectorAll('input, button')) {
        if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLButtonElement)) {
          continue;
        }
        if (control.id === 'settings-close') continue;
        control.disabled = !mutating && control.id !== 'settings-export';
      }
      if (typeof dialog.showModal === 'function') dialog.showModal();
    },
    close() {
      if (dialog.open) dialog.close();
      if (importDialog.open) importDialog.close();
      if (resetDialog.open) resetDialog.close();
    },
    /**
     * @param {Settings} settings
     */
    syncForm,
    /**
     * @param {string} text
     */
    setFeedback,
    /**
     * @param {ImportPreview} preview
     * @param {() => void} onConfirm
     */
    askImportConfirm(preview, onConfirm) {
      importSummary.textContent = formatImportPreview(preview);
      pendingImport = onConfirm;
      if (typeof importDialog.showModal === 'function') importDialog.showModal();
    },
    /**
     * @param {string} reason
     */
    showImportFailure(reason) {
      setFeedback(formatImportFailure(reason));
      pendingImport = null;
      if (importDialog.open) importDialog.close();
    },
    pickFile() {
      fileInput.value = '';
      fileInput.click();
    },
  };
}
