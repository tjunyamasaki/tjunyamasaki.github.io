import { createAudio } from '../src/audio/audio.mjs';
import { absorbFrameDelta, flushWholeMs } from '../src/core/clock-carry.mjs';
import { advanceActive } from '../src/core/active.mjs';
import { MICRO_PER_GLOW } from '../src/core/balance.mjs';
import { applyCommand } from '../src/core/commands.mjs';
import { createInitialState, cloneState } from '../src/core/state.mjs';
import { isValidFoodTarget } from '../src/core/selectors.mjs';
import { createPointerRouter } from '../src/input/pointer-router.mjs';
import { createScene } from '../src/scene/scene.mjs';

const THROW_TARGET = Object.freeze({ x: 4.5, z: 4 });

const root = document.getElementById('presentation-root');
const stage = root.querySelector('[data-stage]');
const errorEl = root.querySelector('[data-error]');
const readoutEl = root.querySelector('[data-readout]');
const orbitHint = root.querySelector('[data-orbit-hint]');
const reducedEl = root.querySelector('[data-reduced]');
const pausedEl = root.querySelector('[data-paused]');

function showError(error) {
  errorEl.hidden = false;
  errorEl.textContent =
    'The presentation harness could not load. ' +
    (error && error.message ? error.message : String(error));
}

function glow(state) {
  return (Number(state.glowMicro) || 0) / MICRO_PER_GLOW;
}

function formatFoods(state) {
  const foods = state.world?.foods ?? [];
  if (!foods.length) return 'none';
  return foods
    .map((food) => {
      const eater = food.claimedBy || food.stage === 'eating' ? food.claimedBy : null;
      const eat = eater ? ` eater=${eater}` : '';
      return `${food.id}:${food.stage}${eat}`;
    })
    .join(', ');
}

function boot() {
  const prefersReduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  reducedEl.checked = prefersReduced;

  let state = createInitialState();
  state.berries = 12;
  let glowBeforeMeal = glow(state);
  let glowAfterMeal = glowBeforeMeal;
  let lastStatus = 'Ready. Throw a berry onto the grass.';
  let clockCarry = 0;

  const audio = createAudio();
  audio.setEnabled(true);

  const scene = createScene(
    stage,
    {
      presentation: 'world',
      reducedMotion: prefersReduced,
      animationsPaused: false,
      quality: 'auto',
    },
    {
      onSelect(id) {
        scene.select(id);
        lastStatus = `Selected ${id}`;
      },
      onError(message) {
        showError(new Error(message));
      },
    },
  );

  const rig = scene.getCameraRig && scene.getCameraRig();
  if (!rig) {
    showError(new Error('World presentation camera is unavailable (WebGL?).'));
    return;
  }

  scene.sync(state);
  scene.select('slime-1');

  /** @type {'care' | 'orbit'} */
  let mode = 'care';
  let raf = 0;
  let previous = performance.now();
  let stopped = false;

  const router = createPointerRouter({
    getMode: () => mode,
    getTool: () => 'berry',
    pick: (clientX, clientY) => scene.pick(clientX, clientY),
    onIntent: (intent) => {
      if (!intent || intent.type !== 'WORLD_CLICK') return;
      const hit = intent.hit;
      if (hit && hit.kind === 'slime' && hit.slimeId) {
        scene.select(hit.slimeId);
        lastStatus = `Selected ${hit.slimeId}`;
        return;
      }
      if (hit && hit.kind === 'ground' && hit.point) {
        throwAt(hit.point);
      }
    },
    onCamera: (intent) => {
      rig.applyIntent(intent);
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
  });
  router.attach(stage);

  function commit(next, events, status) {
    state = next;
    scene.sync(state);
    if (events && events.length) {
      scene.play(events);
      for (const event of events) {
        if (event.type === 'FED') {
          glowAfterMeal = glow(state);
          audio.playFeed();
          lastStatus = `${event.slimeId} finished a meal (Glow from finishMeal, not FX).`;
        }
        if (event.type === 'FOOD_THROWN') {
          lastStatus = `Berry tossed (${event.foodId})`;
        }
        if (event.type === 'COMPANION_ADDED') {
          audio.playWelcome();
          lastStatus = `${event.slimeId} joined`;
        }
      }
    }
    if (status) lastStatus = status;
  }

  function throwAt(point) {
    if (!isValidFoodTarget(point)) {
      lastStatus = 'Toss onto open grass inside the fence';
      return;
    }
    const result = applyCommand(state, { type: 'THROW_FOOD', target: point });
    if (!result.ok) {
      lastStatus = `Throw rejected: ${result.reason}`;
      return;
    }
    glowBeforeMeal = glow(result.state);
    glowAfterMeal = glowBeforeMeal;
    commit(result.state, result.events, 'Berry tossed');
  }

  function petSelected() {
    const id = state.slimes[0]?.id || 'slime-1';
    const before = { glow: state.glowMicro, berries: state.berries };
    const result = scene.pet(id);
    audio.unlock();
    if (result && result.playSound) audio.playPet();
    lastStatus =
      result && result.ok
        ? `Pet ${id} · Glow ${before.glow === state.glowMicro ? 'unchanged' : 'CHANGED'} · berries ${state.berries}`
        : `Pet skipped (${result && result.reason}${result && result.message ? `: ${result.message}` : ''})`;
    if (state.glowMicro !== before.glow || state.berries !== before.berries) {
      lastStatus = 'ERROR: pet mutated economy';
    }
  }

  function seedArrival() {
    const next = cloneState(state);
    next.totalFeeds = Math.max(next.totalFeeds, 6);
    next.lifetimeGlowMicro = Math.max(next.lifetimeGlowMicro, 12 * MICRO_PER_GLOW);
    const stepped = advanceActive(next, 50);
    commit(
      stepped.state,
      stepped.events,
      stepped.summary.companionsAdded.length
        ? `Arrival: ${stepped.summary.companionsAdded.join(', ')}`
        : 'No new companion (already eligible or at cap)',
    );
  }

  function syncModeButtons() {
    root.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
    stage.dataset.mode = mode;
    orbitHint.hidden = mode !== 'orbit';
  }

  function writeReadout() {
    const foods = state.world?.foods ?? [];
    const eating = foods.find((food) => food.stage === 'eating');
    const pausedNote = pausedEl.checked
      ? 'Pause on · farm activity continues in the world clock'
      : 'Presentation live';
    readoutEl.textContent = [
      pausedNote,
      lastStatus,
      `foods ${formatFoods(state)}`,
      `eater ${eating?.claimedBy || 'none'}`,
      `Glow before meal ${glowBeforeMeal.toFixed(3)} · after ${glowAfterMeal.toFixed(3)} (core only)`,
      `wallet ${glow(state).toFixed(3)} Glow · berries ${state.berries} · residents ${state.slimes.length}`,
      `world ${state.world.timeMs}ms +${state.world.carryMs} carry · sim ${state.simTimeMs}ms`,
    ].join('\n');
  }

  root.querySelectorAll('button[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode === 'orbit' ? 'orbit' : 'care';
      router.notifyModeChange();
      syncModeButtons();
    });
  });
  root.querySelector('[data-throw]').addEventListener('click', () => {
    throwAt(THROW_TARGET);
  });
  root.querySelector('[data-pet]').addEventListener('click', () => {
    petSelected();
  });
  root.querySelector('[data-arrive]').addEventListener('click', () => {
    seedArrival();
  });
  reducedEl.addEventListener('change', () => {
    scene.setOptions({
      reducedMotion: reducedEl.checked,
      animationsPaused: pausedEl.checked,
      quality: 'auto',
    });
    rig.setReducedMotion(reducedEl.checked);
  });
  pausedEl.addEventListener('change', () => {
    scene.setOptions({
      reducedMotion: reducedEl.checked,
      animationsPaused: pausedEl.checked,
      quality: 'auto',
    });
  });

  syncModeButtons();

  function animate(now) {
    if (stopped) return;
    raf = requestAnimationFrame(animate);
    const dtMs = Math.min(50, Math.max(0, now - previous));
    previous = now;
    clockCarry = absorbFrameDelta(clockCarry, dtMs);
    const flushed = flushWholeMs(clockCarry);
    clockCarry = flushed.carryMs;
    let elapsed = flushed.elapsedMs;
    while (elapsed > 0) {
      const slice = Math.min(5000, elapsed);
      const advanced = advanceActive(state, slice);
      elapsed -= slice;
      commit(advanced.state, advanced.events);
    }
    scene.update(now, dtMs);
    scene.render();
    writeReadout();
  }
  raf = requestAnimationFrame(animate);

  window.addEventListener(
    'pagehide',
    () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      router.dispose();
      scene.dispose();
      audio.dispose();
    },
    { once: true },
  );
}

try {
  boot();
} catch (error) {
  showError(error);
  throw error;
}
