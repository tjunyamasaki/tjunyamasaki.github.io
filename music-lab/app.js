import { DRUMS, INSTRUMENTS, renderSong } from './audio.js';
import { BEAT, Engine, STEPS_PER_BAR } from './engine.js';
import { icon } from './icons.js';
import { HI, LO, NOTE_NAMES, Roll, SCALES } from './roll.js';

const STORE = 'music-lab:project';
const PREFS = 'music-lab:prefs';
const MAX_BARS = 16;
// Note lengths in ticks (12 per beat). Triplet mode swaps in thirds of a beat.
const LENGTHS = {
  straight: [
    [3, '1/16'],
    [6, '1/8'],
    [12, '1/4'],
    [24, '1/2'],
    [48, '1'],
  ],
  triplet: [
    [2, '1/24'],
    [4, '1/12'],
    [8, '1/6'],
    [16, '1/3'],
  ],
};
// Physical key positions, so the layout works on any keyboard language.
const PIANO_KEYS = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];
const DRUM_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];

const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function makeTrack(inst, tracks = []) {
  const base = INSTRUMENTS[inst].name;
  const count = tracks.filter((t) => t.inst === inst).length;
  return { id: uid(), name: count ? `${base} ${count + 1}` : base, inst, vol: 0.8, mute: false, solo: false, notes: [] };
}

function demoProject() {
  const drums = makeTrack('drums');
  const piano = makeTrack('piano');
  const bass = makeTrack('bass');
  bass.vol = 0.75;
  const chords = [
    [60, 64, 67],
    [60, 64, 69],
    [60, 65, 69],
    [59, 62, 67],
  ];
  const roots = [36, 33, 41, 43];
  // Written in 16ths; a 16th is 3 ticks.
  const n = (s, l, p) => ({ s: s * 3, l: l * 3, p, v: 0.8 });
  for (let b = 0; b < 4; b++) {
    const o = b * 16;
    for (const [s, l] of [[0, 6], [6, 6], [12, 4]]) for (const p of chords[b]) piano.notes.push(n(o + s, l, p));
    for (const [s, l, up] of [[0, 6, 0], [6, 4, 0], [10, 2, 12], [12, 4, 0]]) bass.notes.push(n(o + s, l, roots[b] + up));
    for (const s of [0, 6, 10]) drums.notes.push(n(o + s, 1, 0));
    for (const s of [4, 12]) drums.notes.push(n(o + s, 1, 1));
    for (let s = 0; s < 16; s += 2) drums.notes.push(n(o + s, 1, s === 14 && b % 2 ? 4 : 3));
  }
  return { res: STEPS_PER_BAR, bpm: 96, bars: 4, key: 0, scale: 'major', tracks: [drums, piano, bass] };
}

function blankProject() {
  return { res: STEPS_PER_BAR, bpm: 110, bars: 4, key: 0, scale: 'major', tracks: [makeTrack('piano')] };
}

// Accept only well-formed data from storage or shared links.
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tracks)) return null;
  const num = (v, a, b, d) => (Number.isFinite(+v) ? clamp(+v, a, b) : d);
  const bars = Math.round(num(raw.bars, 1, MAX_BARS, 4));
  // Projects saved before triplet support counted 16 steps per bar.
  const k = raw.res === STEPS_PER_BAR ? 1 : STEPS_PER_BAR / 16;
  const tracks = raw.tracks
    .filter((t) => t && INSTRUMENTS[t.inst])
    .slice(0, 64)
    .map((t) => {
      const drums = INSTRUMENTS[t.inst].drums;
      return {
        id: typeof t.id === 'string' ? t.id.slice(0, 16) : uid(),
        name: String(t.name ?? INSTRUMENTS[t.inst].name).slice(0, 40),
        inst: t.inst,
        vol: num(t.vol, 0, 1, 0.8),
        mute: !!t.mute,
        solo: !!t.solo,
        notes: (Array.isArray(t.notes) ? t.notes : [])
          .map((n) => ({
            s: Math.round(num(n?.s * k, 0, MAX_BARS * STEPS_PER_BAR - 1, 0)),
            l: Math.round(num(n?.l * k, 1, MAX_BARS * STEPS_PER_BAR, 3)),
            p: Math.round(num(n?.p, drums ? 0 : LO, drums ? DRUMS.length - 1 : HI, drums ? 0 : 60)),
            v: num(n?.v, 0.05, 1, 0.8),
          }))
          .slice(0, 4000),
      };
    });
  return {
    res: STEPS_PER_BAR,
    bpm: Math.round(num(raw.bpm, 40, 240, 110)),
    bars,
    key: Math.round(num(raw.key, 0, 11, 0)),
    scale: SCALES[raw.scale] ? raw.scale : 'chromatic',
    tracks,
  };
}

let P = normalize(read(STORE)) || demoProject();
let selId = P.tracks[0]?.id ?? null;
const prefs = { metronome: false, lenIdx: 2, triplet: false, octave: 4, tool: 'draw', ...read(PREFS) };
delete prefs.len;
let customLen = null;
let clip = null;
let clipHidden = false;
let startStep = 0;
let recording = false;
let dirty = true;
const held = new Map();
const hist = { undo: [], redo: [], base: null };

const engine = new Engine(() => P);
engine.metronome = !!prefs.metronome;

const selTrack = () => P.tracks.find((t) => t.id === selId) || null;
const total = () => P.bars * STEPS_PER_BAR;
const isDrums = (tr) => !!INSTRUMENTS[tr?.inst]?.drums;

// History: snapshot before an edit, keep it only if the edit changed something.
function begin() {
  if (hist.base == null) hist.base = JSON.stringify(P);
}

function commit() {
  if (hist.base == null) return;
  const now = JSON.stringify(P);
  if (now !== hist.base) {
    hist.undo.push(hist.base);
    if (hist.undo.length > 200) hist.undo.shift();
    hist.redo = [];
  }
  hist.base = null;
  refresh();
}

function edit(fn) {
  begin();
  fn();
  commit();
}

function restore(json) {
  P = JSON.parse(json);
  roll.clearSel();
  if (!selTrack()) selId = P.tracks[0]?.id ?? null;
  refresh();
}

function undo() {
  if (!hist.undo.length) return;
  hist.redo.push(JSON.stringify(P));
  restore(hist.undo.pop());
}

function redo() {
  if (!hist.redo.length) return;
  hist.undo.push(JSON.stringify(P));
  restore(hist.redo.pop());
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => write(STORE, P), 300);
}

// Light update: audio routing, storage and canvases.
function touch() {
  engine.sync();
  save();
  dirty = true;
}

// Full update: rebuilds the DOM around the canvases too.
function refresh() {
  if (startStep >= total()) startStep = 0;
  touch();
  renderTransport();
  renderTracks();
  renderEditorHead();
  roll.layout();
}

/* ---------- Toast ---------- */

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------- Transport ---------- */

function play(countIn = false) {
  engine.start(startStep, countIn);
  renderTransport();
}

function stop() {
  if (recording) stopRecording();
  engine.stop();
  renderTransport();
  dirty = true;
}

function togglePlay() {
  if (engine.playing) stop();
  else play(false);
}

function toggleRecord() {
  if (recording) {
    stopRecording();
    return;
  }
  if (!selTrack()) {
    openPicker('add');
    return;
  }
  recording = true;
  begin();
  if (!engine.playing) play(true);
  renderTransport();
  renderTracks();
}

function stopRecording() {
  recording = false;
  for (const id of [...held.keys()]) liveUp(id);
  commit();
}

function seek(step) {
  startStep = step;
  if (engine.playing) engine.start(step, false);
  dirty = true;
}

function renderTransport() {
  const playing = engine.playing;
  const playBtn = $('play');
  playBtn.innerHTML = icon(playing ? 'stop' : 'play');
  playBtn.setAttribute('aria-label', playing ? 'Stop' : 'Play');
  playBtn.classList.toggle('on', playing);
  $('rec').classList.toggle('on', recording);
  $('rec').setAttribute('aria-pressed', recording);
  $('metro').setAttribute('aria-pressed', engine.metronome);
  $('bpmVal').textContent = P.bpm;
  $('barsVal').textContent = P.bars;
  $('barsDown').disabled = P.bars <= 1;
  $('barsUp').disabled = P.bars >= MAX_BARS;
  $('dup').disabled = P.bars * 2 > MAX_BARS;
  $('undo').disabled = !hist.undo.length;
  $('redo').disabled = !hist.redo.length;
  document.body.classList.toggle('recording', recording);
}

function updateClock(pos) {
  const el = $('clock');
  if (pos != null && pos < 0) {
    el.textContent = String(Math.ceil(-pos / BEAT));
    el.classList.add('count');
    return;
  }
  el.classList.remove('count');
  const s = pos ?? startStep;
  el.textContent = `${Math.floor(s / STEPS_PER_BAR) + 1}.${Math.floor((s % STEPS_PER_BAR) / BEAT) + 1}`;
}

function setBars(n) {
  n = clamp(n, 1, MAX_BARS);
  if (n === P.bars) return;
  edit(() => (P.bars = n));
}

function duplicateLoop() {
  if (P.bars * 2 > MAX_BARS) return;
  const t = total();
  edit(() => {
    for (const tr of P.tracks) {
      tr.notes = tr.notes.filter((n) => n.s < t);
      tr.notes.push(...tr.notes.map((n) => ({ ...n, s: n.s + t })));
    }
    P.bars *= 2;
  });
  toast(`${P.bars} bars`);
}

function setupBpm() {
  const btn = $('bpm');
  let drag = null;
  btn.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, bpm: P.bpm, moved: false };
    btn.setPointerCapture(e.pointerId);
    begin();
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    P.bpm = clamp(Math.round(drag.bpm + dy / 2), 40, 240);
    $('bpmVal').textContent = P.bpm;
  });
  const end = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    commit();
    if (!moved) editBpm();
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      edit(() => (P.bpm = clamp(P.bpm + (e.deltaY < 0 ? 1 : -1), 40, 240)));
    },
    { passive: false },
  );
  btn.addEventListener('keydown', (e) => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    edit(() => (P.bpm = clamp(P.bpm + d * (e.shiftKey ? 10 : 1), 40, 240)));
  });
}

function editBpm() {
  const btn = $('bpm');
  const input = document.createElement('input');
  input.type = 'number';
  input.min = 40;
  input.max = 240;
  input.value = P.bpm;
  input.className = 'bpm-input';
  input.setAttribute('aria-label', 'Tempo');
  btn.hidden = true;
  btn.after(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (apply) => {
    if (done) return;
    done = true;
    const v = Math.round(+input.value);
    input.remove();
    btn.hidden = false;
    if (apply && Number.isFinite(v)) edit(() => (P.bpm = clamp(v, 40, 240)));
    else renderTransport();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

/* ---------- Tracks ---------- */

function renderTracks() {
  const list = $('trackList');
  list.innerHTML = '';
  for (const tr of P.tracks) {
    const meta = INSTRUMENTS[tr.inst];
    const row = document.createElement('div');
    row.className = 'track' + (tr.id === selId ? ' sel' : '') + (tr.mute ? ' muted' : '');
    row.style.setProperty('--c', meta.color);
    row.dataset.id = tr.id;
    row.innerHTML = `
      <div class="t-head">
        <button class="t-inst" type="button" title="Change instrument" aria-label="${meta.name}">${icon(tr.inst)}</button>
        <div class="t-main">
          <input class="t-name" type="text" maxlength="40" spellcheck="false" aria-label="Track name" />
          <input class="t-vol" type="range" min="0" max="1" step="0.01" aria-label="Volume" />
        </div>
        <button class="t-btn t-mute" type="button" title="Mute" aria-pressed="${tr.mute}">M</button>
        <button class="t-btn t-solo" type="button" title="Solo" aria-pressed="${tr.solo}">S</button>
        <button class="t-btn t-del" type="button" title="Delete track" aria-label="Delete track">${icon('trash')}</button>
      </div>
      <canvas class="t-ov" aria-hidden="true"></canvas>`;
    const name = row.querySelector('.t-name');
    name.value = tr.name;
    name.addEventListener('focus', () => select(tr.id));
    name.addEventListener('input', () => {
      begin();
      tr.name = name.value;
      save();
    });
    name.addEventListener('change', commit);
    name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
    const vol = row.querySelector('.t-vol');
    vol.value = tr.vol;
    vol.style.setProperty('--v', tr.vol * 100 + '%');
    vol.addEventListener('input', () => {
      begin();
      tr.vol = +vol.value;
      vol.style.setProperty('--v', tr.vol * 100 + '%');
      touch();
    });
    vol.addEventListener('change', commit);
    row.querySelector('.t-inst').addEventListener('click', () => {
      select(tr.id);
      openPicker('change');
    });
    row.querySelector('.t-mute').addEventListener('click', () => edit(() => (tr.mute = !tr.mute)));
    row.querySelector('.t-solo').addEventListener('click', () => edit(() => (tr.solo = !tr.solo)));
    row.querySelector('.t-del').addEventListener('click', () => removeTrack(tr.id));
    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input')) return;
      select(tr.id);
    });
    row.querySelector('.t-ov').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const bar = Math.floor(((e.clientX - r.left) / r.width) * P.bars);
      roll.scrollToStep(bar * STEPS_PER_BAR);
    });
    list.append(row);
  }
  document.body.classList.toggle('empty', !P.tracks.length);
  drawOverviews(engine.pos());
}

function select(id) {
  if (id === selId) return;
  for (const hid of [...held.keys()]) liveUp(hid);
  selId = id;
  fitOctave();
  for (const row of $('trackList').children) row.classList.toggle('sel', row.dataset.id === id);
  renderEditorHead();
  roll.layout();
  dirty = true;
}

function addTrack(inst) {
  const tr = makeTrack(inst, P.tracks);
  edit(() => P.tracks.push(tr));
  select(tr.id);
  $('trackList').lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  engine.preview(inst, isDrums(tr) ? 0 : INSTRUMENTS[inst].center, 0.4);
}

function removeTrack(id) {
  const i = P.tracks.findIndex((t) => t.id === id);
  if (i < 0) return;
  edit(() => {
    P.tracks.splice(i, 1);
    if (selId === id) selId = (P.tracks[i] || P.tracks[i - 1])?.id ?? null;
  });
  toast('Track deleted · Ctrl+Z to undo');
}

function changeInstrument(inst) {
  const tr = selTrack();
  if (!tr || tr.inst === inst) return;
  edit(() => {
    // Drum rows and pitches don't map onto each other, so switching kind starts fresh.
    if (isDrums(tr) !== !!INSTRUMENTS[inst].drums) tr.notes = [];
    if (Object.values(INSTRUMENTS).some((m) => m.name === tr.name.replace(/ \d+$/, ''))) {
      tr.name = makeTrack(inst, P.tracks.filter((t) => t !== tr)).name;
    }
    tr.inst = inst;
  });
  fitOctave();
  renderOctave();
  roll.centerOnTrack();
  engine.preview(inst, isDrums(tr) ? 0 : INSTRUMENTS[inst].center, 0.4);
}

// Puts the computer keyboard in the instrument's natural register.
function fitOctave() {
  const tr = selTrack();
  if (!tr || isDrums(tr)) return;
  prefs.octave = clamp(Math.floor(INSTRUMENTS[tr.inst].center / 12) - 1, 1, 6);
}

function drawOverviews(pos) {
  const t = total();
  for (const row of $('trackList').children) {
    const tr = P.tracks.find((x) => x.id === row.dataset.id);
    const cv = row.querySelector('.t-ov');
    if (!tr || !cv) continue;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) continue;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let b = 1; b < P.bars; b++) g.fillRect(Math.round((b / P.bars) * w), 0, 1, h);
    const notes = tr.notes.filter((n) => n.s < t);
    const drums = isDrums(tr);
    let lo = drums ? 0 : Math.min(...notes.map((n) => n.p));
    let hi = drums ? DRUMS.length - 1 : Math.max(...notes.map((n) => n.p));
    if (hi - lo < 12) {
      const mid = (hi + lo) / 2;
      lo = mid - 6;
      hi = mid + 6;
    }
    const pad = 6;
    const nh = Math.max(2, Math.min(4, (h - pad * 2) / (hi - lo + 1)));
    g.fillStyle = INSTRUMENTS[tr.inst].color;
    g.globalAlpha = tr.mute ? 0.3 : 0.9;
    for (const n of notes) {
      const x = (n.s / t) * w;
      const nw = Math.max(1.5, (Math.min(n.l, t - n.s) / t) * w - 1);
      const y = drums ? pad + (n.p / (DRUMS.length - 1)) * (h - pad * 2 - nh) : pad + ((hi - n.p) / (hi - lo)) * (h - pad * 2 - nh);
      g.fillRect(x, y, nw, nh);
    }
    g.globalAlpha = 1;
    if (pos != null && pos >= 0) {
      g.fillStyle = '#6ee7b7';
      g.fillRect(Math.round((pos / t) * w), 0, 1.5, h);
    }
  }
}

/* ---------- Instrument picker ---------- */

let pickerMode = 'add';
function setupPicker() {
  const grid = $('pickerGrid');
  for (const [key, meta] of Object.entries(INSTRUMENTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.dataset.inst = key;
    b.style.setProperty('--c', meta.color);
    b.innerHTML = `<span class="pick-icon">${icon(key)}</span><span>${meta.name}</span>`;
    b.addEventListener('click', () => {
      $('picker').close();
      if (pickerMode === 'add') addTrack(key);
      else changeInstrument(key);
    });
    grid.append(b);
  }
  $('picker').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });
}

function openPicker(mode) {
  pickerMode = mode;
  const cur = mode === 'change' ? selTrack()?.inst : null;
  for (const b of $('pickerGrid').children) b.classList.toggle('current', b.dataset.inst === cur);
  $('picker').showModal();
}

/* ---------- Editor header ---------- */

function renderEditorHead() {
  renderSelbar();
  const tr = selTrack();
  const head = $('edHead');
  if (!tr) {
    head.innerHTML = '';
    return;
  }
  const meta = INSTRUMENTS[tr.inst];
  const drums = meta.drums;
  head.style.setProperty('--c', meta.color);
  head.innerHTML = `
    <button class="ed-inst" type="button" title="Change instrument">${icon(tr.inst)}<span></span>${icon('chevron')}</button>
    <div class="seg tools-seg" role="group" aria-label="Tool">
      <button type="button" data-tool="draw" title="Draw notes (B)" aria-label="Draw" aria-pressed="${roll.tool === 'draw'}">${icon('pencil')}</button>
      <button type="button" data-tool="select" title="Select notes (V) · or Shift-drag" aria-label="Select" aria-pressed="${roll.tool === 'select'}">${icon('cursor')}</button>
    </div>
    <div class="grid-pick">
      ${drums ? '' : `<div class="seg len-seg" role="group" aria-label="Note length"></div>`}
      <button type="button" class="trip" id="tripBtn" title="Triplets: divide each beat in 3" aria-label="Triplets" aria-pressed="${prefs.triplet}">${icon('triplet')}</button>
    </div>
    ${
      drums
        ? ''
        : `<div class="scale-pick">
        <select id="keySel" aria-label="Key">${NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>
        <select id="scaleSel" aria-label="Scale">${Object.entries(SCALES)
          .map(([k, s]) => `<option value="${k}">${s.name}</option>`)
          .join('')}</select>
      </div>`
    }
    <span class="grow"></span>
    ${drums ? '' : `<div class="octave" title="Computer keyboard octave (Z / X)"><button type="button" id="octDown" aria-label="Octave down">${icon('minus')}</button><span id="octVal"></span><button type="button" id="octUp" aria-label="Octave up">${icon('plus')}</button></div>`}
    <button class="ghost icon" id="clearTrack" type="button" title="Clear notes" aria-label="Clear notes">${icon('trash')}</button>`;
  head.querySelector('.ed-inst span').textContent = tr.name;
  head.querySelector('.ed-inst').addEventListener('click', () => openPicker('change'));
  head.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  head.querySelector('#clearTrack').addEventListener('click', () => {
    if (!tr.notes.length) return;
    edit(() => (tr.notes = []));
    toast('Cleared · Ctrl+Z to undo');
  });
  head.querySelector('#tripBtn').addEventListener('click', toggleTriplet);
  renderLengths();
  if (drums) return;
  const keySel = head.querySelector('#keySel');
  const scaleSel = head.querySelector('#scaleSel');
  keySel.value = P.key;
  scaleSel.value = P.scale;
  keySel.addEventListener('change', () => edit(() => (P.key = +keySel.value)));
  scaleSel.addEventListener('change', () => edit(() => (P.scale = scaleSel.value)));
  head.querySelector('#octDown').addEventListener('click', () => shiftOctave(-1));
  head.querySelector('#octUp').addEventListener('click', () => shiftOctave(1));
  renderOctave();
}

function setTool(tool) {
  roll.tool = prefs.tool = tool;
  write(PREFS, prefs);
  $('edHead')
    .querySelectorAll('[data-tool]')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === tool));
  roll.hover = null;
  roll.draw();
}

/* ---------- Selection, copy & paste ---------- */

function renderSelbar() {
  const n = roll.selected().length;
  const canPaste = !!clip && !!selTrack() && clip.drums === isDrums(selTrack());
  const show = n > 0 || (canPaste && !clipHidden);
  $('selbar').hidden = !show;
  if (!show) return;
  $('selCount').textContent = n ? String(n) : '';
  $('selCount').hidden = !n;
  for (const id of ['selCopy', 'selRepeat', 'selDelete']) $(id).hidden = !n;
  $('selPaste').hidden = !canPaste;
}

function copySel() {
  const c = roll.copy();
  if (!c) return false;
  clip = c;
  clipHidden = false;
  renderSelbar();
  toast(`Copied ${c.notes.length} note${c.notes.length === 1 ? '' : 's'}`);
  return true;
}

function pasteClip() {
  if (!clip || !selTrack()) return;
  if (clip.drums !== isDrums(selTrack())) {
    toast(clip.drums ? 'Paste drums into a drum track' : 'Paste notes into an instrument track');
    return;
  }
  const at = roll.mouseStep != null ? Math.floor(roll.mouseStep / BEAT) * BEAT : startStep;
  roll.paste(clip, at);
}

function ensureLength(steps) {
  if (steps > total()) P.bars = clamp(Math.ceil(steps / STEPS_PER_BAR), 1, MAX_BARS);
}

const lengths = () => LENGTHS[prefs.triplet ? 'triplet' : 'straight'];

function noteLen() {
  const list = lengths();
  return customLen ?? list[Math.min(prefs.lenIdx, list.length - 1)][0];
}

// Grid for placing notes: 16ths normally, thirds of a beat (or sixths for
// 1/24 notes) in triplet mode.
function snap() {
  if (!prefs.triplet) return 3;
  return noteLen() < 4 ? 2 : 4;
}

function renderLengths() {
  const seg = $('edHead').querySelector('.len-seg');
  $('tripBtn')?.setAttribute('aria-pressed', prefs.triplet);
  if (!seg) return;
  const cur = noteLen();
  seg.innerHTML = lengths()
    .map(([l, label], i) => `<button type="button" data-i="${i}" aria-pressed="${l === cur}">${label}</button>`)
    .join('');
  seg.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      prefs.lenIdx = +b.dataset.i;
      customLen = null;
      write(PREFS, prefs);
      renderLengths();
      roll.draw();
    }),
  );
}

function toggleTriplet() {
  prefs.triplet = !prefs.triplet;
  customLen = null;
  prefs.lenIdx = Math.min(prefs.lenIdx, lengths().length - 1);
  write(PREFS, prefs);
  renderLengths();
  roll.draw();
}

// A note drawn or resized by hand becomes the length for the next ones.
function setLen(l) {
  const i = lengths().findIndex(([x]) => x === l);
  if (i >= 0) {
    prefs.lenIdx = i;
    customLen = null;
    write(PREFS, prefs);
  } else customLen = l;
  renderLengths();
}

function renderOctave() {
  const el = $('octVal');
  if (el) el.textContent = 'C' + prefs.octave;
}

function shiftOctave(d) {
  prefs.octave = clamp(prefs.octave + d, 1, 6);
  write(PREFS, prefs);
  renderOctave();
  dirty = true;
}

/* ---------- Live playing & recording ---------- */

function keyLabels() {
  const map = new Map();
  if (matchMedia('(pointer: coarse)').matches) return map;
  const tr = selTrack();
  if (!tr) return map;
  if (isDrums(tr)) DRUM_KEYS.forEach((c, i) => map.set(i, c.slice(3)));
  else PIANO_KEYS.forEach((c, i) => map.set((prefs.octave + 1) * 12 + i, c === 'Semicolon' ? ';' : c.slice(3)));
  return map;
}

function liveDown(id, pitch) {
  if (held.has(id)) return;
  const tr = selTrack();
  if (!tr) return;
  const v = engine.live(tr, pitch);
  let rec = null;
  if (recording && engine.playing) {
    const pos = engine.pos();
    const g = snap();
    const s = pos == null ? -1 : Math.round(pos / g) * g;
    if (s >= 0) rec = { s: s % total(), t0: engine.ctx.currentTime };
  }
  held.set(id, { v, pitch, rec, track: tr.id });
  roll.pressed.add(pitch);
  if (id.startsWith('key:')) roll.reveal(pitch);
  dirty = true;
}

function liveUp(id) {
  const h = held.get(id);
  if (!h) return;
  held.delete(id);
  h.v.release(engine.ctx.currentTime);
  if (![...held.values()].some((x) => x.pitch === h.pitch)) roll.pressed.delete(h.pitch);
  const tr = P.tracks.find((t) => t.id === h.track);
  if (h.rec && tr) {
    const t = total();
    const g = snap();
    const l = isDrums(tr) ? g : clamp(Math.round((engine.ctx.currentTime - h.rec.t0) / engine.sd / g) * g, Math.min(g, t - h.rec.s), t - h.rec.s);
    tr.notes = tr.notes.filter((n) => !(n.s === h.rec.s && n.p === h.pitch));
    tr.notes.push({ s: h.rec.s, l, p: h.pitch, v: 0.8 });
    touch();
  }
  dirty = true;
}

function liveNotes() {
  const out = [];
  if (!recording || !engine.ctx) return out;
  const now = engine.ctx.currentTime;
  for (const h of held.values()) {
    if (!h.rec || h.track !== selId) continue;
    out.push({ s: h.rec.s, p: h.pitch, l: Math.max(1, (now - h.rec.t0) / engine.sd), live: true });
  }
  return out;
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, select, textarea, [contenteditable]');
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (typing || $('picker').open) return;
      const k = e.code;
      const act = {
        KeyZ: () => (e.shiftKey ? redo() : undo()),
        KeyY: redo,
        KeyC: copySel,
        KeyX: () => copySel() && roll.deleteSel(),
        KeyV: pasteClip,
        KeyD: () => roll.duplicate(),
        KeyA: () => roll.selectAll(),
      }[k];
      if (act) {
        e.preventDefault();
        act();
      }
      return;
    }
    if (typing || e.altKey || $('picker').open) return;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (arrows && roll.selected().length) {
      e.preventDefault();
      const [ds, dr] = arrows;
      roll.nudge(ds * (e.shiftKey ? STEPS_PER_BAR : snap()), dr * (e.shiftKey && !isDrums(selTrack()) ? 12 : 1));
      return;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (roll.selected().length) {
        e.preventDefault();
        roll.deleteSel();
      }
      return;
    }
    if (e.code === 'Escape') {
      roll.clearSel();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) togglePlay();
      return;
    }
    const tr = selTrack();
    const drums = isDrums(tr);
    const i = (drums ? DRUM_KEYS : PIANO_KEYS).indexOf(e.code);
    if (i >= 0 && tr) {
      e.preventDefault();
      if (!e.repeat) liveDown('key:' + e.code, drums ? i : (prefs.octave + 1) * 12 + i);
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyZ') shiftOctave(-1);
    else if (e.code === 'KeyX') shiftOctave(1);
    else if (e.code === 'KeyR') toggleRecord();
    else if (e.code === 'KeyM') toggleMetronome();
    else if (e.code === 'KeyV') setTool('select');
    else if (e.code === 'KeyB') setTool('draw');
  });
  window.addEventListener('keyup', (e) => liveUp('key:' + e.code));
  window.addEventListener('blur', () => {
    for (const id of [...held.keys()]) liveUp(id);
  });
}

function toggleMetronome() {
  engine.metronome = !engine.metronome;
  prefs.metronome = engine.metronome;
  write(PREFS, prefs);
  renderTransport();
}

/* ---------- Share & export ---------- */

async function encodeProject() {
  const json = JSON.stringify({ ...P, tracks: P.tracks.map(({ id, ...t }) => t) });
  let bytes = new TextEncoder().encode(json);
  let prefix = 'j';
  if (window.CompressionStream) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    prefix = 'z';
  }
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return prefix + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decodeProject(text) {
  const kind = text[0];
  const b64 = text.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (kind === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return normalize(JSON.parse(new TextDecoder().decode(bytes)));
}

async function share() {
  const url = `${location.origin}${location.pathname}#s=${await encodeProject()}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    window.prompt('Copy this link', url);
  }
}

async function exportWav() {
  const btn = $('export');
  if (btn.classList.contains('busy')) return;
  btn.classList.add('busy');
  try {
    const blob = await renderSong(P, engine.ctx?.sampleRate || 44100);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'music-lab.wav';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Saved music-lab.wav');
  } catch (err) {
    console.error(err);
    toast('Export failed');
  } finally {
    btn.classList.remove('busy');
  }
}

async function loadShared() {
  const m = location.hash.match(/^#s=([\w-]+)$/);
  if (!m) return;
  try {
    const shared = await decodeProject(m[1]);
    if (!shared) throw new Error('Invalid project');
    for (const tr of shared.tracks) tr.id = uid();
    edit(() => (P = shared));
    selId = P.tracks[0]?.id ?? null;
    refresh();
    toast('Shared track loaded');
  } catch (err) {
    console.error(err);
    toast('That link could not be opened');
  }
  window.history.replaceState(null, '', location.pathname);
}

/* ---------- Setup ---------- */

const roll = new Roll($('roll'), {
  track: selTrack,
  project: () => P,
  pos: () => engine.pos(),
  startStep: () => startStep,
  begin,
  commit,
  change: touch,
  blip: (p) => {
    const tr = selTrack();
    if (!tr) return;
    const v = engine.live(tr, p);
    v.release(engine.ctx.currentTime + (isDrums(tr) ? 0.05 : 0.3));
  },
  keyOn: liveDown,
  keyOff: liveUp,
  seek,
  len: noteLen,
  snap,
  setLen,
  live: liveNotes,
  keyLabels,
  selChanged: () => renderSelbar(),
  ensureLength,
});
roll.tool = prefs.tool === 'select' ? 'select' : 'draw';

function setupStatic() {
  $('back').innerHTML = icon('back');
  $('rec').innerHTML = icon('rec');
  $('metro').innerHTML = icon('metro');
  $('barsDown').innerHTML = icon('minus');
  $('barsUp').innerHTML = icon('plus');
  $('dup').innerHTML = icon('duplicate');
  $('undo').innerHTML = icon('undo');
  $('redo').innerHTML = icon('redo');
  $('share').innerHTML = icon('link');
  $('export').innerHTML = icon('download');
  $('new').innerHTML = icon('newfile');
  $('selCopy').innerHTML = icon('copy');
  $('selPaste').innerHTML = icon('paste');
  $('selRepeat').innerHTML = icon('repeat');
  $('selDelete').innerHTML = icon('trash');
  $('selClose').innerHTML = icon('close');
  $('selCopy').addEventListener('click', copySel);
  $('selPaste').addEventListener('click', pasteClip);
  $('selRepeat').addEventListener('click', () => roll.duplicate());
  $('selDelete').addEventListener('click', () => roll.deleteSel());
  $('selClose').addEventListener('click', () => {
    clipHidden = true;
    roll.clearSel();
    renderSelbar();
  });
  setupFullscreen();
  $('addTrack').insertAdjacentHTML('afterbegin', icon('plus'));
  $('emptyAdd').insertAdjacentHTML('afterbegin', icon('plus'));

  $('play').addEventListener('click', togglePlay);
  $('rec').addEventListener('click', toggleRecord);
  $('metro').addEventListener('click', toggleMetronome);
  $('barsDown').addEventListener('click', () => setBars(P.bars - 1));
  $('barsUp').addEventListener('click', () => setBars(P.bars + 1));
  $('dup').addEventListener('click', duplicateLoop);
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('share').addEventListener('click', share);
  $('export').addEventListener('click', exportWav);
  $('new').addEventListener('click', () => {
    stop();
    const fresh = blankProject();
    edit(() => (P = fresh));
    selId = P.tracks[0].id;
    startStep = 0;
    refresh();
    toast('New project · Ctrl+Z to undo');
  });
  $('addTrack').addEventListener('click', () => openPicker('add'));
  $('emptyAdd').addEventListener('click', () => openPicker('add'));
  setupBpm();
  setupPicker();
  setupKeyboard();
  new ResizeObserver(() => (dirty = true)).observe($('trackList'));
}

function setupFullscreen() {
  const btn = $('fs');
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    btn.hidden = true;
    return;
  }
  const current = () => document.fullscreenElement || document.webkitFullscreenElement;
  const render = () => {
    const on = !!current();
    btn.innerHTML = icon(on ? 'shrink' : 'expand');
    btn.title = on ? 'Exit fullscreen' : 'Fullscreen';
    btn.setAttribute('aria-label', btn.title);
  };
  btn.addEventListener('click', () => {
    if (current()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else request.call(root, { navigationUI: 'hide' })?.catch?.(() => {});
  });
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('webkitfullscreenchange', render);
  render();
}

let lastPos = null;
function frame() {
  requestAnimationFrame(frame);
  const pos = engine.pos();
  if (engine.playing || dirty || pos !== lastPos) {
    lastPos = pos;
    dirty = false;
    roll.follow(pos);
    roll.draw();
    drawOverviews(pos);
    updateClock(pos);
  }
}

setupStatic();
refresh();
hist.undo = [];
renderTransport();
loadShared();
requestAnimationFrame(frame);
