import { PianoAudio } from './audio.mjs';

const $ = selector => document.querySelector(selector);
const audio = new PianoAudio();
const keyboard = $('#keyboard');
const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const blackNotes = new Set([1, 3, 6, 8, 10]);
const shortcuts = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote'];
const shortcutLabels = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'"];
const wide = matchMedia('(min-width: 700px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const held = new Map();
const pointers = new Set();
const demoTimers = new Set();
const demoVoices = new Set();
let octave = 4;
let latchedSustain = false;
let spaceSustain = false;
let demoPlaying = false;
let demoGeneration = 0;
let lastInputTime = 0;
let ready = false;
let starting = false;
let saved = {};
try { saved = JSON.parse(localStorage.getItem('pocket-piano-settings') || '{}') || {}; } catch { /* Storage is optional. */ }
if (Number.isInteger(saved.octave) && saved.octave >= 2 && saved.octave <= 5) octave = saved.octave;
for (const id of ['room', 'volume']) {
  if (Number.isFinite(saved[id]) && saved[id] >= 0 && saved[id] <= 100) $(`#${id}`).value = saved[id];
}

function persist() {
  try {
    localStorage.setItem('pocket-piano-settings', JSON.stringify({ octave, room: Number($('#room').value), volume: Number($('#volume').value) }));
  } catch { /* Private browsing must not prevent playing. */ }
}

function noteName(midi) { return names[midi % 12] + (Math.floor(midi / 12) - 1); }
function root() { return (octave + 1) * 12; }

function buildKeyboard() {
  silence();
  const count = wide.matches ? 25 : 13;
  const whiteCount = wide.matches ? 15 : 8;
  keyboard.style.setProperty('--white-count', whiteCount);
  keyboard.replaceChildren();
  let whiteIndex = 0;
  for (let offset = 0; offset < count; offset++) {
    const midi = root() + offset;
    const black = blackNotes.has(midi % 12);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `key ${black ? 'black' : 'white'}`;
    button.dataset.note = midi;
    button.setAttribute('aria-label', noteName(midi).replace('♯', ' sharp '));
    button.setAttribute('aria-pressed', 'false');
    button.disabled = !ready;
    if (black) button.style.setProperty('--position', whiteIndex);
    else whiteIndex++;
    const label = document.createElement('span');
    label.className = 'key-label';
    label.textContent = names[midi % 12];
    if (midi % 12 === 0) {
      const number = document.createElement('small');
      number.textContent = Math.floor(midi / 12) - 1;
      label.append(number);
    }
    button.append(label);
    if (shortcutLabels[offset]) {
      const hint = document.createElement('span');
      hint.className = 'key-shortcut';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = shortcutLabels[offset];
      button.append(hint);
      button.setAttribute('aria-keyshortcuts', shortcutLabels[offset]);
    }
    keyboard.append(button);
  }
  $('#octave').textContent = octave;
  $('#range-label').textContent = `${noteName(root())} — ${noteName(root() + count - 1)}`;
  $('#octave-down').disabled = octave === 2;
  $('#octave-up').disabled = octave === 5;
}

async function startAudio() {
  if (starting) return;
  starting = true;
  $('#start').disabled = true;
  $('#start').textContent = 'Opening the piano…';
  $('#audio-status').textContent = '';
  try {
    await audio.start((done, total) => {
      $('#load-status').textContent = `Loading piano recordings · ${Math.round(done / total * 100)}%`;
    });
    ready = true;
    $('#wake').hidden = true;
    $('#playing-info').hidden = false;
    $('#status-light').classList.add('ready');
    keyboard.setAttribute('aria-busy', 'false');
    for (const key of keyboard.children) key.disabled = false;
    $('#demo').disabled = false;
    $('#audio-status').textContent = 'Ready when you are.';
    requestPaint();
  } catch (error) {
    $('#load-status').textContent = error.message;
    $('#start').textContent = 'Try again';
    $('#start').disabled = false;
  } finally {
    starting = false;
  }
}

function updateKeys() {
  const notes = new Set([...held.values()].map(item => item.midi));
  for (const key of keyboard.children) {
    const active = notes.has(Number(key.dataset.note));
    key.classList.toggle('active', active);
    key.setAttribute('aria-pressed', String(active));
  }
  $('#notes').textContent = notes.size ? [...notes].sort((a, b) => a - b).slice(0, 5).map(noteName).join(' · ') : 'Let it linger.';
}

function press(id, midi, velocity = 0.75, demo = false) {
  if (!ready || held.has(id)) return;
  if (!demo) {
    if (demoPlaying) stopDemo();
    audio.resume().catch(() => { $('#audio-status').textContent = 'Tap Start playing to resume the sound.'; showResume(); });
    $('#audio-status').textContent = '';
  }
  const voice = audio.noteOn(midi, velocity);
  if (!voice) return;
  held.set(id, { midi, voice });
  if (demo) demoVoices.add(voice);
  lastInputTime = performance.now();
  particles.push({ x: Math.max(.025, Math.min(.975, (midi - root() + .5) / (wide.matches ? 25 : 13))), born: lastInputTime, strength: velocity });
  if (particles.length > 40) particles.shift();
  updateKeys();
  requestPaint();
}

function release(id) {
  const item = held.get(id);
  if (!item) return;
  audio.noteOff(item.voice);
  held.delete(id);
  updateKeys();
}

function syncSustain() {
  const value = latchedSustain || spaceSustain;
  audio.setSustain(value);
  $('#sustain').setAttribute('aria-pressed', String(value));
}

function silence() {
  stopDemo();
  audio.stopAll();
  held.clear();
  pointers.clear();
  spaceSustain = false;
  syncSustain();
  updateKeys();
}

function showResume() {
  $('#wake').hidden = false;
  $('#playing-info').hidden = true;
  $('#start').disabled = false;
  $('#start').textContent = 'Start playing';
  $('#load-status').textContent = 'Tap to resume the piano.';
}

function changeOctave(delta) {
  const next = Math.max(2, Math.min(5, octave + delta));
  if (next === octave) return;
  octave = next;
  buildKeyboard();
  persist();
}

$('#start').addEventListener('click', startAudio);
$('#octave-down').addEventListener('click', () => changeOctave(-1));
$('#octave-up').addEventListener('click', () => changeOctave(1));
$('#sustain').addEventListener('click', () => { latchedSustain = !latchedSustain; syncSustain(); });
for (const id of ['room', 'volume']) {
  const input = $(`#${id}`);
  const apply = () => {
    input.style.setProperty('--fill', `${input.value}%`);
    if (id === 'room') audio.setRoom(Number(input.value) / 100);
    else audio.setVolume(Number(input.value) / 100);
  };
  input.addEventListener('input', apply);
  input.addEventListener('change', persist);
  apply();
}

function keyAtPoint(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('.key');
  return element && keyboard.contains(element) ? element : null;
}

function pointerVelocity(event, key) {
  // Fingers need no pressure sensor: lower on a key is a little louder.
  // Pressure-aware pens can still play with actual touch dynamics.
  if (event.pointerType === 'pen' && event.pressure > 0) return 0.3 + event.pressure * 0.65;
  const rect = key.getBoundingClientRect();
  const depth = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  return 0.58 + depth * 0.3;
}

keyboard.addEventListener('pointerdown', event => {
  if (!ready || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const key = keyAtPoint(event);
  if (!key) return;
  event.preventDefault();
  pointers.add(event.pointerId);
  keyboard.setPointerCapture(event.pointerId);
  press(`pointer:${event.pointerId}`, Number(key.dataset.note), pointerVelocity(event, key));
});

keyboard.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  event.preventDefault();
  const id = `pointer:${event.pointerId}`;
  const key = keyAtPoint(event);
  const midi = key ? Number(key.dataset.note) : null;
  if (held.get(id)?.midi === midi) return;
  release(id);
  if (key) press(id, midi, pointerVelocity(event, key));
});

function endPointer(event) {
  pointers.delete(event.pointerId);
  release(`pointer:${event.pointerId}`);
}
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) keyboard.addEventListener(eventName, endPointer);
keyboard.addEventListener('contextmenu', event => event.preventDefault());
keyboard.addEventListener('click', event => {
  // Screen readers and switch controls activate buttons without pointer events.
  const key = event.target.closest('.key');
  if (event.detail !== 0 || !key || !ready) return;
  const id = `assistive:${key.dataset.note}`;
  press(id, Number(key.dataset.note));
  setTimeout(() => release(id), 450);
});

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (event.code === 'Escape') { silence(); return; }
  const key = event.target.closest?.('.key');
  if (key && ['Space', 'Enter'].includes(event.code)) {
    event.preventDefault();
    if (!event.repeat) press(`focus:${event.code}`, Number(key.dataset.note));
    return;
  }
  if (event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
  if (['Space', 'Enter'].includes(event.code) && event.target.closest?.('button, a')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    spaceSustain = true;
    syncSustain();
    return;
  }
  if (event.code === 'KeyZ' || event.code === 'KeyX') {
    event.preventDefault();
    if (!event.repeat) changeOctave(event.code === 'KeyZ' ? -1 : 1);
    return;
  }
  const offset = shortcuts.indexOf(event.code);
  if (offset < 0 || offset >= (wide.matches ? 25 : 13)) return;
  event.preventDefault();
  if (!event.repeat) press(`keyboard:${event.code}`, root() + offset, 0.76);
});

document.addEventListener('keyup', event => {
  release(`keyboard:${event.code}`);
  release(`focus:${event.code}`);
  if (event.code === 'Space') { spaceSustain = false; syncSustain(); }
});

function later(callback, delay) {
  const timer = setTimeout(() => { demoTimers.delete(timer); callback(); }, delay);
  demoTimers.add(timer);
}

function stopDemo() {
  demoGeneration++;
  for (const timer of demoTimers) clearTimeout(timer);
  demoTimers.clear();
  for (const [id] of held) if (id.startsWith('demo:')) held.delete(id);
  for (const voice of demoVoices) audio.release(voice, 0.18);
  demoVoices.clear();
  demoPlaying = false;
  $('#demo-icon').textContent = '▷';
  $('#demo-label').textContent = 'A little inspiration';
  $('#demo').setAttribute('aria-pressed', 'false');
  updateKeys();
}

$('#demo').addEventListener('click', async () => {
  if (!ready) return;
  if (demoPlaying) { stopDemo(); return; }
  silence();
  demoPlaying = true;
  const generation = ++demoGeneration;
  $('#demo-icon').textContent = '□';
  $('#demo-label').textContent = 'Your turn? Stop the tune';
  $('#demo').setAttribute('aria-pressed', 'true');
  try { await audio.resume(); } catch { stopDemo(); showResume(); return; }
  if (generation !== demoGeneration) return;
  $('#audio-status').textContent = 'Play any key to make it your own.';
  const base = root();
  // An original, deliberately unhurried miniature in C major.
  const phrases = [
    { bass: 0, melody: [4, 7, 12, 11, 7, 4] },
    { bass: -3, melody: [4, 9, 12, 11, 9, 7] },
    { bass: -7, melody: [5, 9, 12, 9, 7, 5] },
    { bass: -5, melody: [2, 7, 11, 9, 7, 2] },
    { bass: 0, melody: [4, 7, 12] }
  ];
  let beat = 0;
  let counter = 0;
  const schedule = (midi, at, duration, velocity) => {
    const id = `demo:${counter++}`;
    later(() => press(id, midi, velocity, true), at);
    later(() => release(id), at + duration);
  };
  for (const phrase of phrases) {
    schedule(Math.max(36, base - 12 + phrase.bass), beat * 440, 2150, 0.55);
    phrase.melody.forEach((offset, index) => schedule(base + offset, (beat + index) * 440, 650, index % 3 === 0 ? 0.75 : 0.6));
    beat += phrase.melody.length;
  }
  later(() => { stopDemo(); $('#audio-status').textContent = 'Now, something only you can play.'; }, beat * 440 + 1700);
});

// A quiet ribbon follows the actual sound; note glows follow the player's hands.
// Rendering sleeps when the sound fades, and respects reduced-motion settings.
const canvas = $('#visualizer');
const ctx = canvas.getContext('2d');
const particles = [];
const waveform = new Uint8Array(256);
let canvasWidth = 1;
let canvasHeight = 1;
let frame = null;

function requestPaint() {
  if (frame === null && !document.hidden) frame = requestAnimationFrame(paint);
}

function paint(now) {
  frame = null;
  if (!ctx) return;
  const w = canvasWidth;
  const h = canvasHeight;
  ctx.clearRect(0, 0, w, h);
  let energy = 0;
  if (audio.analyser) {
    audio.analyser.getByteTimeDomainData(waveform);
    energy = Math.sqrt(waveform.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / waveform.length);
  }
  const moving = !reducedMotion.matches;
  for (let line = 0; line < 4; line++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const envelope = Math.sin(x / w * Math.PI);
      const phase = moving ? now * .0004 : 0;
      const wave = Math.sin(x / w * Math.PI * 4.2 + phase + line * .7);
      const amplitude = 4 + energy * 95;
      const y = h * .76 + wave * amplitude * envelope + line * 3;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(183, 205, 151, ${.08 + line * .026 + energy * .5})`;
    ctx.lineWidth = .8;
    ctx.stroke();
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    const age = (now - particle.born) / 1800;
    if (age >= 1) { particles.splice(i, 1); continue; }
    const x = particle.x * w;
    const y = h - 5 - (moving ? age * 75 : 10);
    const radius = 16 + age * 25;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(210, 228, 169, ${.22 * (1 - age) * particle.strength})`);
    glow.addColorStop(1, 'rgba(210, 228, 169, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.beginPath();
    ctx.arc(x, y, 1.6 * (1 - age) + .3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(225, 232, 185, ${.6 * (1 - age)})`;
    ctx.fill();
  }
  if (moving && (held.size || particles.length || (now - lastInputTime < 4500 && energy > .001))) requestPaint();
}

new ResizeObserver(entries => {
  const { width, height } = entries[0].contentRect;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvasWidth = width;
  canvasHeight = height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestPaint();
}).observe($('#resonance'));

window.addEventListener('blur', silence);
window.addEventListener('pagehide', silence);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    silence();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  } else requestPaint();
});
wide.addEventListener('change', buildKeyboard);
reducedMotion.addEventListener('change', requestPaint);
buildKeyboard();
$('#notes').textContent = 'Just begin.';
