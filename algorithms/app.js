import { SCENES, createExhibit } from './algorithms.js';
import { Renderer } from './renderer.js';
import { Sound } from './audio.js';

function init() {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas'), dialog = $('algorithm-dialog');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new Renderer(canvas, motionPreference.matches), sound = new Sound();
  const sceneIds = Object.keys(SCENES), speeds = [0.5, 1, 2, 4];
  const newSeed = () => {
    if (window.crypto?.getRandomValues) return window.crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296);
  };
  const settings = Object.fromEntries(sceneIds.map(key => [key, { id: SCENES[key].algorithms[0].id, seed: newSeed() }]));
  const initialHash = location.hash.slice(1).split('/');
  let scene = SCENES[initialHash[0]] ? initialHash[0] : 'sorting';
  if (SCENES[scene].algorithms.some(item => item.id === initialHash[1])) settings[scene].id = initialHash[1];
  let model, iterator, algorithm;
  let paused = motionPreference.matches, speed = 1, budget = 0, delay = 600, completionRemaining = 3200;
  let frameId = 0, lastFrame = 0, clock = 0, lastReadout = 0, settleUntil = 0, pointer = null, immersiveScroll = 0;

  function announce(message) { $('announcement').textContent = message; }
  function canPlay() { return !paused && !document.hidden && !dialog.open; }

  function updatePlayback() {
    const playing = canPlay(), complete = model?.done;
    $('play').querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
    $('play').setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    $('play').title = paused ? 'Play' : 'Pause';
    $('live-state').classList.toggle('is-paused', !playing);
    $('live-state').classList.toggle('is-done', !!complete);
    $('live-state').querySelector('span').textContent = dialog.open ? 'Browsing' : paused ? 'Paused' : complete ? 'Complete' : 'Playing';
    $('loop-note').textContent = paused ? 'Paused for a moment' : complete ? 'Another begins soon' : 'Always unfolding';
    settleUntil = performance.now() + 650;
  }

  function updateReadout() {
    $('metric-a').textContent = model.stats.a.toLocaleString();
    $('metric-b').textContent = model.stats.b.toLocaleString();
    $('narration').textContent = model.caption;
  }

  function updateSceneUI() {
    const meta = SCENES[scene];
    document.documentElement.style.setProperty('--scene-color', meta.color);
    $('scene-eyebrow').textContent = `${meta.number} / ${meta.eyebrow}`;
    $('algorithm-name').textContent = algorithm.name;
    $('algorithm-picker').setAttribute('aria-label', `${algorithm.name}. Choose an algorithm.`);
    $('algorithm-subtitle').textContent = algorithm.subtitle;
    $('algorithm-description').textContent = algorithm.description;
    $('complexity').textContent = algorithm.complexity;
    $('data-note').textContent = model.dataNote;
    $('metric-a-label').textContent = model.labels[0];
    $('metric-b-label').textContent = model.labels[1];
    const hint = scene === 'graphs' && model.id === 'kruskal' ? 'Tap the network to remix' : meta.hint;
    $('interaction-hint').replaceChildren(document.createTextNode(hint + ' '));
    const arrow = document.createElement('span'); arrow.textContent = '↗'; $('interaction-hint').append(arrow);
    canvas.setAttribute('aria-label', `${algorithm.name} visualization. ${hint}. Press Enter for new data, Space to pause, or left and right arrows to change scenes.`);
    for (const button of document.querySelectorAll('[data-scene]')) {
      const selected = button.dataset.scene === scene;
      button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected));
    }
    document.title = `${algorithm.name} — Kinetic`;
    history.replaceState(null, '', `#${scene}/${algorithm.id}`);
    updateReadout(); updatePlayback();
  }

  function rebuild({ fresh = false, resume = false, origin, target } = {}) {
    const state = settings[scene];
    if (fresh) { state.seed = newSeed(); delete state.cols; delete state.rows; delete state.origin; delete state.target; }
    if (origin !== undefined) state.origin = origin;
    if (target !== undefined) state.target = target;
    algorithm = SCENES[scene].algorithms.find(item => item.id === state.id);
    ({ model, iterator } = createExhibit({ scene, ...state, aspect: renderer.aspect }));
    if (model.cols) { state.cols = model.cols; state.rows = model.rows; }
    if (model.origin !== undefined) state.origin = model.origin;
    if (model.target !== undefined) state.target = model.target;
    budget = 0; delay = 650; completionRemaining = 3200;
    if (resume) paused = false;
    renderer.attach(model); renderer.dirty = true;
    updateSceneUI();
    const flash = $('scene-flash');
    flash.classList.remove('is-changing');
    // Restart the transition on deliberate scene/data changes.
    void flash.offsetWidth;
    flash.classList.add('is-changing');
  }

  function switchScene(next) {
    if (!SCENES[next] || next === scene) return;
    scene = next; rebuild({ resume: !motionPreference.matches });
    announce(`${SCENES[scene].label}. ${algorithm.name}. ${paused ? 'Press play to begin.' : 'Playing.'}`);
  }

  function remix() {
    rebuild({ fresh: true });
    announce(`New ${SCENES[scene].label.toLowerCase()} data. ${paused ? 'Paused.' : 'Playing.'}`);
  }

  function togglePlayback() {
    paused = !paused;
    if (!paused && model.done && motionPreference.matches) rebuild({ fresh: true });
    updatePlayback(); announce(paused ? 'Animation paused.' : 'Animation playing.');
  }

  function finish() {
    model.done = true;
    if (motionPreference.matches) paused = true;
    updateReadout(); updatePlayback();
    canvas.setAttribute('aria-label', `${algorithm.name} complete. ${model.caption} Press Enter to generate new data.`);
    announce(`${algorithm.name} complete. ${model.caption}`);
  }

  function frame(timestamp) {
    frameId = 0;
    if (document.hidden) return;
    const dt = lastFrame ? Math.min(timestamp - lastFrame, 64) : 16;
    lastFrame = timestamp;
    const playing = canPlay();
    if (playing) {
      clock += dt;
      if (model.done) {
        completionRemaining -= dt;
        if (completionRemaining <= 0) rebuild({ fresh: true });
      } else {
        budget += dt * speed;
        let steps = 0;
        while (budget >= delay && steps < 64 && !model.done) {
          budget -= delay; steps++;
          const next = iterator.next();
          if (next.done) { finish(); break; }
          delay = Math.max(1, algorithm.delay * (next.value.delay ?? 1));
          renderer.step(next.value);
          const at = next.value.at;
          const pitch = scene === 'sorting' ? (model.values[at] ?? 28) / model.values.length : scene === 'graphs' ? at / model.nodes.length : at / model.cells.length;
          sound.note(pitch, next.value.type);
        }
        if (steps === 64) budget = 0;
      }
    }
    if ((playing || renderer.dirty) && timestamp - lastReadout > 90) { updateReadout(); lastReadout = timestamp; }
    if (playing || renderer.dirty || timestamp < settleUntil) {
      renderer.draw(dt, clock); renderer.dirty = false;
    }
    frameId = requestAnimationFrame(frame);
  }

  function openAlgorithms() {
    const meta = SCENES[scene];
    $('dialog-category').textContent = `${meta.label.toUpperCase()} / ${meta.algorithms.length} ALGORITHMS`;
    $('algorithm-list').replaceChildren();
    for (const item of meta.algorithms) {
      const button = document.createElement('button'); button.className = 'algorithm-option';
      button.setAttribute('aria-pressed', String(item.id === model.id));
      const name = document.createElement('span'); name.className = 'option-name'; name.textContent = item.name;
      const caption = document.createElement('span'); caption.className = 'option-caption'; caption.textContent = item.subtitle;
      const indicator = document.createElement('span'); indicator.className = 'option-indicator'; indicator.setAttribute('aria-hidden', 'true');
      button.append(name, caption, indicator);
      button.addEventListener('click', () => {
        settings[scene].id = item.id; dialog.close(); rebuild();
        announce(`${item.name} selected. ${paused ? 'Press play to begin.' : 'Playing.'}`);
      });
      $('algorithm-list').append(button);
    }
    dialog.showModal(); updatePlayback();
    $('algorithm-list').querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  async function toggleSound() {
    $('sound').disabled = true;
    try {
      const enabled = await sound.toggle();
      $('sound').setAttribute('aria-pressed', String(enabled));
      $('sound').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
      $('sound').title = enabled ? 'Mute sound' : 'Enable sound';
      $('sound').querySelector('use').setAttribute('href', enabled ? '#i-sound' : '#i-muted');
      announce(enabled ? 'Sound enabled.' : 'Sound off.');
    } catch {
      announce('Sound is unavailable. The animation will keep playing.');
    } finally { $('sound').disabled = false; }
  }

  function toggleImmersive() {
    const enabled = !document.body.classList.contains('is-immersive');
    if (enabled) immersiveScroll = window.scrollY;
    document.body.classList.toggle('is-immersive', enabled);
    $('expand').setAttribute('aria-pressed', String(enabled));
    $('expand').setAttribute('aria-label', enabled ? 'Exit immersive view' : 'Enter immersive view');
    $('expand').title = enabled ? 'Exit immersive view' : 'Immersive view';
    $('expand').querySelector('use').setAttribute('href', enabled ? '#i-close' : '#i-expand');
    if (!enabled) window.scrollTo({ top: immersiveScroll, behavior: 'instant' });
    renderer.resize(); renderer.dirty = true;
    announce(enabled ? 'Immersive view. Press Escape to exit. Swipe the canvas to change scenes.' : 'Immersive view closed.');
  }

  $('play').addEventListener('click', togglePlayback);
  $('remix').addEventListener('click', remix);
  $('sound').addEventListener('click', toggleSound);
  $('expand').addEventListener('click', toggleImmersive);
  $('algorithm-picker').addEventListener('click', openAlgorithms);
  $('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { updatePlayback(); $('algorithm-picker').focus({ preventScroll: true }); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  for (const button of document.querySelectorAll('[data-scene]')) button.addEventListener('click', () => switchScene(button.dataset.scene));
  $('speed').addEventListener('click', () => {
    speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    $('speed').textContent = `${speed}×`;
    $('speed').setAttribute('aria-label', `Playback speed: ${speed} times. Click to change.`);
    announce(`Playback speed ${speed} times.`);
  });

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) { pointer = null; return; }
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; });
  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer = null;
    if (Math.abs(dx) > 65 && Math.abs(dy) < Math.abs(dx) * 0.6) {
      switchScene(sceneIds[(sceneIds.indexOf(scene) + (dx < 0 ? 1 : -1) + sceneIds.length) % sceneIds.length]);
      return;
    }
    if (Math.hypot(dx, dy) > 14) return;
    const rect = canvas.getBoundingClientRect(), hit = renderer.hit(event.clientX - rect.left, event.clientY - rect.top);
    if (hit < 0) return;
    if (scene === 'graphs' && model.id !== 'kruskal') {
      rebuild({ origin: hit }); announce(`Start node ${hit + 1}. ${paused ? 'Paused.' : 'Playing.'}`);
    } else if (scene === 'routes') {
      if (model.cells[hit].water) {
        model.caption = 'Choose a land tile for the destination.'; updateReadout(); announce(model.caption); return;
      }
      rebuild({ target: hit }); announce('Destination moved. Finding a new route.');
    } else remix();
  });

  canvas.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); if (event.key === ' ') togglePlayback(); else remix();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); switchScene(sceneIds[(sceneIds.indexOf(scene) + (event.key === 'ArrowRight' ? 1 : -1) + sceneIds.length) % sceneIds.length]);
    } else if (event.key.toLowerCase() === 'r') remix();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.open && document.body.classList.contains('is-immersive')) toggleImmersive();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frameId); frameId = 0; lastFrame = 0; }
    else if (!frameId) { renderer.dirty = true; frameId = requestAnimationFrame(frame); }
  });
  motionPreference.addEventListener('change', event => {
    renderer.reducedMotion = event.matches;
    if (event.matches) { paused = true; renderer.particles = []; renderer.rings = []; }
    renderer.dirty = true; updatePlayback();
  });
  window.addEventListener('hashchange', () => {
    const [nextScene, nextAlgorithm] = location.hash.slice(1).split('/');
    if (!SCENES[nextScene]) return;
    scene = nextScene;
    if (SCENES[scene].algorithms.some(item => item.id === nextAlgorithm)) settings[scene].id = nextAlgorithm;
    rebuild();
  });

  rebuild();
  if (paused) { model.caption = 'Ready when you are. Press play to begin.'; updateReadout(); }
  frameId = requestAnimationFrame(frame);
}

try { init(); }
catch (error) {
  document.getElementById('narration').textContent = 'The theater could not start. Try reloading in a current browser.';
  document.getElementById('announcement').textContent = 'The visualization could not start.';
  console.error('Kinetic could not start:', error);
}
