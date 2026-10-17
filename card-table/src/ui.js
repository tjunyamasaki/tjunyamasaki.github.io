// Small DOM toolkit: element builder, icons, bottom sheets, toasts, sounds.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  log: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  sort: 'M3 6h18M6 12h12M10 18h4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  close: 'M6 6l12 12M18 6 6 18',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  faceUp: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 9l2 3-2 3-2-3z',
  faceDown: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5 8l14 8M5 16l14-8',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01M12 12h.01',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  hand: 'M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.9-2.5L4 15a1.5 1.5 0 0 1 2.4-1.8L7 14',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  gather: 'M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5',
  view: 'M2 8l10-5 10 5-10 5zM2 8v8l10 5 10-5V8',
  next: 'M5 12h14M13 6l6 6-6 6',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  deal: 'M4 6h7v10H4zM13 8h7v10h-7zM8 3v3M16 5v3',
  flip: 'M7 4h7a2 2 0 0 1 2 2v3M17 20h-7a2 2 0 0 1-2-2v-3M13 6l3 3 3-3M11 18l-3-3-3 3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  door: 'M14 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5M10 17l5-5-5-5M15 12H3',
  sound: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  mute: 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
};

export function icon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'ic';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name] || ''}"/></svg>`;
  return span;
}

export function button(label, onClick, { icon: ic, cls = '', title, disabled } = {}) {
  return h('button', { type: 'button', class: `btn ${cls}`, onClick, title, disabled: disabled || null }, ic ? icon(ic, 20) : null, label ? h('span', {}, label) : null);
}

// ---- bottom sheet
let sheetClose = null;
export function openSheet(build, { tall = false, onClose } = {}) {
  closeSheet();
  const sheet = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  const scrim = document.getElementById('scrim');
  body.replaceChildren();
  sheet.classList.toggle('tall', tall);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    sheet.classList.remove('open');
    scrim.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    if (sheetClose === close) sheetClose = null;
    onClose?.();
  };
  sheetClose = close;
  build(body, close);
  body.scrollTop = 0;
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    scrim.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
  });
  return close;
}

export function closeSheet() {
  sheetClose?.();
}

export function sheetOpen() {
  return !!sheetClose;
}

export function initSheet() {
  const scrim = document.getElementById('scrim');
  scrim.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    closeSheet();
  });
  // drag the grip down to dismiss
  const sheet = document.getElementById('sheet');
  const grip = sheet.querySelector('.sheet-grip');
  let y0 = null;
  grip.addEventListener('pointerdown', (e) => {
    y0 = e.clientY;
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', (e) => {
    if (y0 == null) return;
    const dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0;
    y0 = null;
    sheet.style.transform = '';
    if (dy > 60) closeSheet();
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });
}

export function stepper(value, { min = 1, max = 99, onChange }) {
  let v = value;
  const out = h('output', { class: 'step-value' }, String(v));
  const set = (n) => {
    v = Math.max(min, Math.min(max, n));
    out.textContent = String(v);
    onChange?.(v);
  };
  const el = h('div', { class: 'stepper' }, h('button', { type: 'button', class: 'step', onClick: () => set(v - 1), 'aria-label': 'Less' }, icon('minus', 18)), out, h('button', { type: 'button', class: 'step', onClick: () => set(v + 1), 'aria-label': 'More' }, icon('plus', 18)));
  el.get = () => v;
  el.set = set;
  return el;
}

export function segmented(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  let cur = value;
  const render = () => {
    el.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            class: `seg-btn${o.value === cur ? ' on' : ''}`,
            role: 'radio',
            'aria-checked': String(o.value === cur),
            onClick: () => {
              cur = o.value;
              render();
              onChange?.(cur);
            },
          },
          o.icon ? icon(o.icon, 18) : null,
          o.label,
        ),
      ),
    );
  };
  render();
  el.get = () => cur;
  return el;
}

// ---- toasts
export function toast(text, { kind = '', color, ms = 2600 } = {}) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: `toast ${kind}` }, color ? h('i', { class: 'dot', style: { background: color } }) : null, h('span', {}, text));
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---- sounds: tiny synthesized card noises, no audio files
let ac = null;
let muted = false;
export function setMuted(m) {
  muted = m;
}
export function isMuted() {
  return muted;
}
function ctx() {
  if (muted) return null;
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
function burst(a, at, dur, freq, gain) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.8;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(at);
}
export const sfx = {
  card() {
    const a = ctx();
    if (a) burst(a, a.currentTime, 0.07, 2600 + Math.random() * 800, 0.35);
  },
  flip() {
    const a = ctx();
    if (!a) return;
    burst(a, a.currentTime, 0.05, 3400, 0.25);
    burst(a, a.currentTime + 0.06, 0.06, 2200, 0.3);
  },
  riffle() {
    const a = ctx();
    if (!a) return;
    for (let i = 0; i < 18; i++) burst(a, a.currentTime + i * 0.022 + Math.random() * 0.01, 0.03, 3000 + Math.random() * 1500, 0.18);
  },
  pop() {
    const a = ctx();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.setValueAtTime(660, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(990, a.currentTime + 0.08);
    g.gain.setValueAtTime(0.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.18);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.2);
  },
};

export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
