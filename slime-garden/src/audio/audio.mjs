/**
 * Optional quiet synthesized cues. Off by default. Created only after a user
 * gesture when sound is enabled. Missing AudioContext must never throw.
 */

/**
 * @typedef {object} AudioCues
 * @property {(enabled: boolean) => void} setEnabled
 * @property {() => void} unlock
 * @property {() => void} playFeed
 * @property {() => void} playUpgrade
 * @property {() => void} playWelcome
 * @property {() => void} dispose
 */

/**
 * @param {{
 *   AudioContext?: (new () => AudioContext),
 *   webkitAudioContext?: (new () => AudioContext),
 * }} [globals]
 * @returns {AudioCues}
 */
export function createAudio(globals = globalThis) {
  let enabled = false;
  /** @type {AudioContext | null} */
  let ctx = null;
  let failed = false;

  function Ctor() {
    return globals.AudioContext || globals.webkitAudioContext || null;
  }

  function getCtx() {
    if (failed || !enabled) return null;
    const AC = Ctor();
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
      } catch {
        failed = true;
        ctx = null;
      }
    }
    return ctx;
  }

  function unlock() {
    if (!enabled) return;
    try {
      const audio = getCtx();
      if (audio && audio.state === 'suspended' && typeof audio.resume === 'function') {
        const resumed = audio.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
    } catch {
      // Gameplay continues silently.
    }
  }

  /**
   * @param {{ freq: number, dur: number, type?: OscillatorType, gain?: number, slide?: number }} spec
   */
  function tone(spec) {
    if (!enabled) return;
    try {
      const audio = getCtx();
      if (!audio) return;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = spec.type || 'sine';
      const now = audio.currentTime;
      osc.frequency.setValueAtTime(spec.freq, now);
      if (spec.slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.slide), now + spec.dur);
      }
      const level = spec.gain ?? 0.03;
      gain.gain.setValueAtTime(level, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.dur);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now);
      osc.stop(now + spec.dur + 0.03);
    } catch {
      // Never surface audio failures.
    }
  }

  return {
    setEnabled(value) {
      enabled = !!value;
      if (!enabled && ctx && typeof ctx.suspend === 'function') {
        try {
          const paused = ctx.suspend();
          if (paused && typeof paused.catch === 'function') paused.catch(() => {});
        } catch {
          // ignore
        }
      }
    },
    unlock,
    playFeed() {
      tone({ freq: 640, dur: 0.08, type: 'sine', gain: 0.032, slide: 880 });
    },
    playUpgrade() {
      tone({ freq: 392, dur: 0.18, type: 'triangle', gain: 0.028, slide: 587 });
    },
    playWelcome() {
      tone({ freq: 349, dur: 0.28, type: 'sine', gain: 0.034, slide: 523 });
    },
    dispose() {
      enabled = false;
      if (ctx && typeof ctx.close === 'function') {
        try {
          const closed = ctx.close();
          if (closed && typeof closed.catch === 'function') closed.catch(() => {});
        } catch {
          // ignore
        }
      }
      ctx = null;
    },
  };
}
