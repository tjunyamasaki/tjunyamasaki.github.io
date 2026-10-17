import { createScene } from './scene.js';
import { attachGestures } from './input.js';
import { startHost, startGuest } from './session.js';
import { pickTransport, normalizeCode, validCode, randomId } from './net.js';
import { h, icon, button, openSheet, closeSheet, initSheet, sheetOpen, stepper, segmented, toast, sfx, setMuted, buzz } from './ui.js';
import { faceName, DECK_PRESETS, STD_RANKS, BACKS, FELTS, MAX_PLAYERS, seatPoint, tableRadius, freeSpot, buildFaces } from './model.js';
import { cardURL, setFourColor, BACK_STYLES } from './faces.js';

// ------------------------------------------------------------------ storage

const store = {
  get(key, fallback = null) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* blocked */
    }
  },
};
const tabStore = {
  get(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* blocked */
    }
  },
};

const K = { name: 'card-table:name', prefs: 'card-table:prefs', host: 'card-table:host', guest: 'card-table:guest' };
const prefs = { fourColor: false, muted: false, faceMode: 'up', dealCount: 5, helpSeen: false, ...store.get(K.prefs, {}) };
const savePrefs = () => store.set(K.prefs, prefs);
setFourColor(prefs.fourColor);
setMuted(prefs.muted);

// A player id is held by one tab at a time, so two tabs of the same browser
// can sit at the same table as different people.
const held = new Set();
async function claim(pid) {
  if (!pid) return null;
  if (held.has(pid)) return pid;
  if (!navigator.locks?.request) {
    held.add(pid);
    return pid;
  }
  return new Promise((resolve) => {
    navigator.locks
      .request(`card-table:${pid}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return undefined;
        }
        held.add(pid);
        resolve(pid);
        return new Promise(() => {});
      })
      .catch(() => resolve(pid));
  });
}
async function pidFor(code, saved) {
  for (const cand of [tabStore.get(`card-table:pid:${code}`), saved]) {
    if (cand && (await claim(cand))) return cand;
  }
  const fresh = randomId();
  await claim(fresh);
  return fresh;
}

// ------------------------------------------------------------------ state

const $ = (id) => document.getElementById(id);
const fill = (el, ...items) => el.replaceChildren(...items.flat().filter((x) => x != null && x !== false));
let transportKind = null;
const transportReady = pickTransport().then((k) => (transportKind = k));
let session = null;
let view = null;
let me = null;
let scene = null;
let gestures = null;
let selected = new Set();
let drag = null;
let sheetRefresh = null;
let lastDragSend = 0;
const seenLog = new Set();
let logPrimed = false;
const remoteDragAt = new Map();
const plates = new Map();
const labels = new Map();

// ------------------------------------------------------------------ home

function homeStatus(text, error = false) {
  const el = $('home-status');
  el.textContent = text || '';
  el.classList.toggle('error', !!error);
}

function requireName() {
  const name = $('name').value.replace(/\s+/g, ' ').trim().slice(0, 18);
  if (!name) {
    homeStatus('Pick a name first.', true);
    $('name').focus();
    return null;
  }
  store.set(K.name, name);
  return name;
}

function renderResume() {
  const box = $('resume');
  fill(box);
  const hs = store.get(K.host);
  const gs = store.get(K.guest);
  const fresh = (x, hours) => x && Date.now() - (x.at || 0) < hours * 3600e3;
  if (fresh(hs, 72)) {
    const players = hs.state?.order?.length || 1;
    box.append(
      h(
        'div',
        { class: 'resume-row' },
        h('div', {}, h('strong', {}, `Your table ${hs.code}`), h('small', {}, `${players} seat${players === 1 ? '' : 's'} · saved ${ago(hs.at)}`)),
        button('Resume', () => hostTable(hs), { cls: 'primary' }),
        h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'Forget this table', onClick: () => (store.del(K.host), renderResume()) }, icon('close', 18)),
      ),
    );
  }
  if (fresh(gs, 24)) {
    box.append(
      h(
        'div',
        { class: 'resume-row' },
        h('div', {}, h('strong', {}, `Table ${gs.code}`), h('small', {}, `joined ${ago(gs.at)}`)),
        button('Rejoin', () => joinTable(gs.code), { cls: 'primary' }),
        h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'Forget this table', onClick: () => (store.del(K.guest), renderResume()) }, icon('close', 18)),
      ),
    );
  }
  box.classList.toggle('hidden', !box.children.length);
}

function ago(at) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  return hr < 24 ? `${hr} h ago` : `${Math.round(hr / 24)} d ago`;
}

function setBusy(on) {
  for (const id of ['create', 'join']) $(id).disabled = on;
}

const events = {
  onView: (v) => handleView(v),
  onPrivate: (p) => peekSheet(p),
  onFx: (fx) => handleFx(fx),
  onError: (text) => toast(text, { kind: 'error' }),
  onStatus: (s) => setConn(s),
  onEnd: (reason) => leaveTable(reason),
  onSave: throttle(({ state, history }) => {
    if (!session?.isHost) return;
    store.set(K.host, { code: session.code, me, name: state.players[me]?.name, state, history: history.slice(-15), at: Date.now() });
  }, 700),
};

function throttle(fn, ms) {
  let t = 0;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (t) return;
    t = setTimeout(() => {
      t = 0;
      fn(...lastArgs);
    }, ms);
  };
}

async function hostTable(saved = null) {
  const name = requireName();
  if (!name) return;
  setBusy(true);
  homeStatus(saved ? 'Reopening your table…' : 'Opening a table…');
  try {
    await transportReady;
    me = saved?.me || randomId();
    await claim(me);
    session = await startHost({ kind: transportKind, me, name, saved, events: { ...events } });
    history.replaceState(null, '', `?table=${session.code}${session.kind === 'local' ? '&local' : ''}`);
    enterTable();
  } catch (e) {
    console.error(e);
    homeStatus(e.message || 'Could not open a table.', true);
  } finally {
    setBusy(false);
  }
}

async function joinTable(rawCode) {
  const name = requireName();
  if (!name) return;
  const code = normalizeCode(rawCode ?? $('code').value);
  if (!validCode(code)) {
    homeStatus('Table codes are 5 letters and numbers.', true);
    $('code').focus();
    return;
  }
  setBusy(true);
  homeStatus(`Joining ${code}…`);
  try {
    await transportReady;
    const saved = store.get(K.guest);
    me = await pidFor(code, saved?.code === code ? saved.me : null);
    tabStore.set(`card-table:pid:${code}`, me);
    session = await startGuest({ kind: transportKind, code, me, name, events: { ...events } });
    store.set(K.guest, { code, me, name, at: Date.now() });
    history.replaceState(null, '', `?join=${code}${session.kind === 'local' ? '&local' : ''}`);
    enterTable();
  } catch (e) {
    console.error(e);
    homeStatus(e.message || 'Could not join.', true);
  } finally {
    setBusy(false);
  }
}

function leaveTable(reason) {
  const s = session;
  session = null;
  if (s) {
    if (s.isHost) s.close();
    else if (reason == null) s.leave();
    else s.close();
  }
  if (!s?.isHost && reason == null) store.del(K.guest);
  closeSheet();
  gestures?.cancel();
  drag = null;
  view = null;
  inTable = false;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  selected.clear();
  $('table').classList.add('hidden');
  $('home').classList.remove('hidden');
  history.replaceState(null, '', location.pathname + (transportKind === 'local' && new URLSearchParams(location.search).has('local') ? '?local' : ''));
  renderResume();
  if (reason) homeStatus(reason, true);
  else homeStatus('');
}

// ------------------------------------------------------------------ table

function enterTable() {
  $('home').classList.add('hidden');
  $('table').classList.remove('hidden');
  homeStatus('');
  seenLog.clear();
  logPrimed = false;
  for (const el of [...plates.values(), ...labels.values()]) el.remove();
  plates.clear();
  labels.clear();
  if (!scene) {
    scene = createScene($('gl'), { onFrame: positionOverlays });
    gestures = attachGestures($('gl'), gestureHandlers);
  }
  scene.refit();
  inTable = true;
  keepAwake();
  setConn(session.isHost ? 'host' : 'online');
  if (view) {
    const v = view;
    view = null;
    handleView(v);
  }
  renderTopbar();
  if (!prefs.helpSeen) {
    prefs.helpSeen = true;
    savePrefs();
    setTimeout(helpSheet, 600);
  }
}

// Phones dim and drop the connection mid-game; keep the screen on at the table.
let wakeLock = null;
async function keepAwake() {
  try {
    if (inTable && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock?.request('screen');
      wakeLock?.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', keepAwake);

function act(op) {
  if (!session) return false;
  return session.dispatch(op);
}

function setConn(s) {
  const el = $('conn');
  el.className = `conn ${s}`;
  el.title = s === 'reconnecting' ? 'Reconnecting…' : s === 'host' ? 'You are hosting' : 'Connected';
  if (s === 'reconnecting') toast('Connection lost — reconnecting…', { kind: 'warn' });
}

function myHand() {
  return view?.players[me]?.hand || [];
}

function playerName(pid) {
  return pid === me ? 'You' : view?.players[pid]?.name || 'Someone';
}

function locIndex(v) {
  const m = new Map();
  if (!v) return m;
  for (const p of Object.values(v.piles)) for (const id of p.cards) m.set(id, `p:${p.id}`);
  for (const pl of Object.values(v.players)) for (const id of pl.hand) m.set(id, `h:${pl.id}`);
  return m;
}

let inTable = false;
function handleView(v) {
  const prev = view;
  view = v;
  if (!inTable) return;
  const hand = new Set(myHand());
  for (const id of [...selected]) if (!hand.has(id)) selected.delete(id);
  scene.setView(v, me);
  scene.setSelected(selected);
  if (drag && drag.ids.some((id) => !v.cards[id])) cancelDrag();
  playSounds(prev, v);
  logToasts(v);
  syncOverlays();
  renderHandBar();
  renderTopbar();
  renderTurn();
  sheetRefresh?.();
}

function playSounds(prev, v) {
  if (!prev) return;
  const a = locIndex(prev);
  const b = locIndex(v);
  let moved = 0;
  let born = 0;
  let flipped = 0;
  for (const [id, where] of b) {
    if (!a.has(id)) born++;
    else if (a.get(id) !== where) moved++;
    else if (prev.cards[id]?.up !== v.cards[id]?.up) flipped++;
  }
  if (born > 8) sfx.riffle();
  else if (moved) sfx.card();
  else if (flipped) sfx.flip();
}

function logToasts(v) {
  for (const e of v.log) {
    const key = `${e.n}|${e.who}|${e.text}`;
    if (seenLog.has(key)) continue;
    seenLog.add(key);
    if (!logPrimed) continue;
    const roll = /^(rolled|flipped a coin)/.test(e.text);
    if (e.who === me && !roll) continue;
    const pl = v.players[e.who];
    toast(`${e.who === me ? 'You' : pl?.name || 'Someone'} ${e.text}`, { color: pl?.color, ms: roll ? 4200 : 2600 });
  }
  logPrimed = true;
  if (seenLog.size > 400) {
    const keep = [...seenLog].slice(-200);
    seenLog.clear();
    keep.forEach((k) => seenLog.add(k));
  }
}

function handleFx(fx) {
  if (fx.type === 'drag') {
    if (fx.ids?.length && view) {
      scene.setRemoteDrag(fx.pid, { ids: fx.ids.filter((id) => view.cards[id]), x: fx.x, z: fx.z });
      remoteDragAt.set(fx.pid, Date.now());
    } else {
      scene.setRemoteDrag(fx.pid, null);
      remoteDragAt.delete(fx.pid);
    }
  } else if (fx.type === 'emote') {
    showEmote(fx.pid, fx.text);
  } else if (fx.type === 'toast') {
    toast(fx.text);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [pid, at] of remoteDragAt) {
    if (now - at > 2500) {
      remoteDragAt.delete(pid);
      scene?.setRemoteDrag(pid, null);
    }
  }
}, 1000);

// ------------------------------------------------------------------ overlays

function syncOverlays() {
  const layer = $('labels');
  const others = view.order.filter((pid) => pid !== me);
  for (const [pid, el] of plates) {
    if (!others.includes(pid)) {
      el.remove();
      plates.delete(pid);
    }
  }
  const online = new Set(view.online || view.order);
  const showScores = Object.values(view.players).some((p) => p.score);
  for (const pid of others) {
    const pl = view.players[pid];
    let el = plates.get(pid);
    if (!el) {
      el = h('button', { type: 'button', class: 'plate', onClick: () => onPlayerTap(pid) });
      plates.set(pid, el);
      layer.append(el);
    }
    el.style.setProperty('--c', pl.color);
    el.classList.toggle('turn', view.turn === pid);
    el.classList.toggle('offline', !online.has(pid));
    fill(
      el,
      h('i', { class: 'dot' }),
      h('span', { class: 'nm' }, pl.name),
      h('span', { class: 'cnt' }, icon('layers', 13), String(pl.hand.length)),
      showScores ? h('span', { class: 'sc' }, String(pl.score)) : null,
      pl.revealed ? icon('eye', 13) : null,
    );
  }
  for (const [id, el] of labels) {
    if (!view.piles[id]) {
      el.remove();
      labels.delete(id);
    }
  }
  for (const p of Object.values(view.piles)) {
    let el = labels.get(p.id);
    if (!el) {
      el = h('button', { type: 'button', class: 'pile-label', onClick: () => onPileTap(p.id, null) });
      labels.set(p.id, el);
      layer.append(el);
    }
    const n = p.cards.length;
    const show = p.name || n > 1 || !n;
    el.classList.toggle('hidden', !show);
    el.classList.toggle('empty', !n);
    fill(el, p.name ? h('span', { class: 'nm' }, p.name) : null, h('b', {}, String(n)));
  }
  positionOverlays();
}

function positionOverlays() {
  if (!view || !scene) return;
  const W = window.innerWidth;
  const top = view.turn ? 112 : 64;
  const bottom = scene.handTop - scene.handLift - 58;
  for (const [pid, el] of plates) {
    const s = scene.seatScreen(pid);
    if (!s) continue;
    const w = el.offsetWidth || 80;
    const x = Math.max(8 + w / 2, Math.min(W - 8 - w / 2, s.x));
    // sit just above that player's cards rather than on top of them
    const y = Math.max(top, Math.min(bottom, s.y - 26));
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }
  for (const [id, el] of labels) {
    const s = scene.pileScreen(id);
    if (!s) continue;
    // empty piles wear their name inside the outline
    if (el.classList.contains('empty')) el.style.transform = `translate(${s.x}px, ${s.midY}px) translate(-50%, -50%)`;
    else el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, 0)`;
  }
  const bar = $('hand-bar');
  // clear of a lifted (selected) card so its index stays readable
  bar.style.top = `${Math.round(scene.handTop - scene.handLift - 50)}px`;
}

function showEmote(pid, text) {
  const anchor = pid === me ? $('hand-bar') : plates.get(pid);
  if (!anchor) return;
  const b = h('div', { class: 'bubble' }, text);
  anchor.append(b);
  sfx.pop();
  setTimeout(() => b.remove(), 2600);
}

// ------------------------------------------------------------------ top + hand bars

function renderTopbar() {
  if (!session) return;
  const n = view?.order.length || 1;
  const online = view?.online?.length || 1;
  fill($('btn-room'), h('b', {}, session.code), h('span', {}, ` · ${online}/${n}`), icon('share', 15));
}

function renderTurn() {
  const el = $('turn-banner');
  if (!view?.turn || !view.players[view.turn]) {
    el.classList.add('hidden');
    return;
  }
  const pl = view.players[view.turn];
  const mine = view.turn === me;
  el.classList.remove('hidden');
  el.classList.toggle('mine', mine);
  el.style.setProperty('--c', pl.color);
  fill(el, h('i', { class: 'dot' }), h('span', {}, mine ? 'Your turn' : `${pl.name}’s turn`), h('button', { type: 'button', class: 'turn-next', onClick: () => act({ type: 'turn', step: 1 }) }, mine ? 'Done' : 'Next', icon('next', 15)));
}

function faceToggle() {
  const up = prefs.faceMode === 'up';
  return h(
    'button',
    {
      type: 'button',
      class: `pill ${up ? '' : 'down'}`,
      title: 'Cards you play land face up or face down',
      onClick: () => {
        prefs.faceMode = up ? 'down' : 'up';
        savePrefs();
        renderHandBar();
        toast(prefs.faceMode === 'up' ? 'Playing cards face up' : 'Playing cards face down');
      },
    },
    icon(up ? 'faceUp' : 'faceDown', 17),
    up ? 'Face up' : 'Face down',
  );
}

function renderHandBar() {
  const bar = $('hand-bar');
  if (!view) return;
  const pl = view.players[me];
  const n = selected.size;
  if (n) {
    bar.className = 'hand-bar selecting';
    fill(
      bar,
      h('span', { class: 'sel-count' }, `${n} selected`),
      faceToggle(),
      button('Play', playToSheet, { icon: 'next', cls: 'primary small' }),
      button('', () => giveSheet(), { icon: 'users', cls: 'small', title: 'Give to a player' }),
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Clear selection', onClick: clearSelection }, icon('close', 18)),
    );
    return;
  }
  bar.className = 'hand-bar';
  const count = pl?.hand.length || 0;
  fill(
    bar,
    h('span', { class: 'me-chip', style: { '--c': pl?.color || '#fff' } }, h('i', { class: 'dot' }), h('span', { class: 'nm' }, pl?.name || 'You'), h('span', { class: 'cnt' }, `${count}`), pl?.score ? h('span', { class: 'sc' }, `${pl.score} pts`) : null),
    h('span', { class: 'grow' }),
    faceToggle(),
    h('button', { type: 'button', class: 'icon-btn small', title: 'Sort hand', 'aria-label': 'Sort hand', disabled: count < 2 || null, onClick: sortHand }, icon('sort', 18)),
    h(
      'button',
      {
        type: 'button',
        class: `icon-btn small ${pl?.revealed ? 'on' : ''}`,
        title: pl?.revealed ? 'Hide your hand' : 'Show your hand to everyone',
        'aria-label': 'Show or hide your hand',
        onClick: () => act({ type: 'reveal', on: !pl?.revealed }),
      },
      icon(pl?.revealed ? 'eye' : 'eyeOff', 18),
    ),
  );
}

let sortBy = 'suit';
function sortHand() {
  act({ type: 'sortHand', by: sortBy });
  toast(sortBy === 'suit' ? 'Sorted by suit' : 'Sorted by rank');
  sortBy = sortBy === 'suit' ? 'rank' : 'suit';
}

function clearSelection() {
  selected.clear();
  scene.setSelected(selected);
  renderHandBar();
}

function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  scene.setSelected(selected);
  renderHandBar();
  buzz(5);
}

function selectedInOrder() {
  return myHand().filter((id) => selected.has(id));
}

// ------------------------------------------------------------------ gestures

const gestureHandlers = {
  down(px, py) {
    return scene.pick(px, py);
  },
  tap(hit, px, py) {
    if (hit.kind === 'hand') toggleSelect(hit.id);
    else if (hit.kind === 'pile') onPileTap(hit.pile, hit.spread ? hit.card : null);
    else if (hit.kind === 'player') onPlayerTap(hit.pid);
    else if (hit.kind === 'table' && selected.size) {
      const ids = selectedInOrder();
      act({ type: 'move', ids, to: { x: hit.x, z: hit.z, layout: ids.length > 1 ? 'row' : 'stack' }, face: prefs.faceMode });
      clearSelection();
    } else if (selected.size) clearSelection();
  },
  longPress(hit) {
    if (hit.kind === 'pile' && view.piles[hit.pile]) {
      buzz(18);
      startDrag({ kind: 'pile', pile: hit.pile, ids: [...view.piles[hit.pile].cards] }, null, null);
      return 'held';
    }
    if (hit.kind === 'player') {
      buzz(12);
      playerSheet(hit.pid);
      return 'done';
    }
    if (hit.kind === 'hand') {
      buzz(12);
      cardSheet(hit.id);
      return 'done';
    }
    return null;
  },
  heldRelease(hit) {
    cancelDrag();
    onPileTap(hit.pile, null, true);
  },
  heldCancel() {
    cancelDrag();
  },
  dragStart(hit, px, py, held) {
    if (held && drag?.kind === 'pile') return true;
    if (hit.kind === 'hand') {
      const ids = selected.has(hit.id) ? selectedInOrder() : [hit.id];
      return startDrag({ kind: 'cards', ids, fromHand: true, face: prefs.faceMode }, px, py);
    }
    if (hit.kind === 'pile') {
      const p = view.piles[hit.pile];
      if (!p || !hit.card) return false;
      const ids = p.layout === 'column' ? p.cards.slice(p.cards.indexOf(hit.card)) : [hit.card];
      return startDrag({ kind: 'cards', ids, fromPile: p.id, face: null, column: p.layout === 'column' }, px, py);
    }
    if (hit.kind === 'player') {
      const pl = view.players[hit.pid];
      if (!pl?.hand.length) return false;
      return startDrag({ kind: 'take', from: hit.pid, ids: [pl.hand[pl.hand.length - 1]] }, px, py);
    }
    return false;
  },
  dragMove(px, py) {
    if (!drag) return;
    drag.px = px;
    drag.py = py;
    scene.setDrag(drag);
    let target = scene.dropTarget(px, py, drag);
    if (drag.kind === 'take' && target?.kind !== 'hand') target = null;
    drag.target = target;
    scene.setDropHint(target);
    scene.setHandGap(target?.kind === 'hand' && drag.kind === 'cards' ? target.at : -1);
    for (const [pid, el] of plates) el.classList.toggle('target', target?.kind === 'player' && target.pid === pid);
    const now = performance.now();
    if (drag.kind !== 'take' && now - lastDragSend > 70) {
      lastDragSend = now;
      const t = scene.tablePoint(px, py);
      if (t && !(target?.kind === 'hand')) session?.drag(drag.ids, t.x, t.z);
    }
  },
  dragEnd(px, py, cancelled) {
    const d = drag;
    endDrag();
    if (!d || cancelled || !d.target) return;
    drop(d, d.target);
  },
  pan(x0, y0, x1, y1) {
    scene.pan(x0, y0, x1, y1);
    $('btn-recenter').classList.toggle('hidden', !scene.zoomed);
  },
  zoom(f, x, y) {
    scene.zoom(f, x, y);
    $('btn-recenter').classList.toggle('hidden', !scene.zoomed);
  },
};

function startDrag(d, px, py) {
  if (!d.ids.length) return false;
  drag = { ...d, px: px ?? 0, py: py ?? 0, target: null };
  if (px == null && d.kind === 'pile') {
    const p = view.piles[d.pile];
    const s = scene.pileScreen(d.pile);
    drag.px = s?.x ?? 0;
    drag.py = s ? (s.y + s.top) / 2 : 0;
    if (!p) return false;
  }
  scene.setDrag(drag);
  buzz(6);
  return true;
}

function endDrag() {
  if (drag && drag.kind !== 'take') session?.drag(null, 0, 0);
  drag = null;
  scene.setDrag(null);
  scene.setDropHint(null);
  scene.setHandGap(-1);
  for (const el of plates.values()) el.classList.remove('target');
}

function cancelDrag() {
  endDrag();
}

function drop(d, t) {
  if (d.kind === 'take') {
    act({ type: 'take', from: d.from });
    return;
  }
  if (d.kind === 'pile') {
    const p = view.piles[d.pile];
    if (!p) return;
    if (t.kind === 'pile') act({ type: 'merge', from: d.pile, to: t.pile });
    else if (t.kind === 'new') act({ type: 'movePile', pile: d.pile, x: t.x, z: t.z });
    else if (t.kind === 'hand') act({ type: 'move', ids: [...p.cards], to: { hand: me } });
    else if (t.kind === 'player') act({ type: 'move', ids: [...p.cards], to: { hand: t.pid } });
    return;
  }
  const ids = d.ids;
  if (t.kind === 'hand') {
    if (d.fromHand) {
      const rest = myHand().filter((id) => !ids.includes(id));
      rest.splice(t.at, 0, ...ids);
      act({ type: 'reorder', ids: rest });
    } else {
      act({ type: 'move', ids, to: { hand: me }, at: t.at });
    }
  } else if (t.kind === 'pile') {
    if (d.fromPile === t.pile && ids.length === view.piles[t.pile]?.cards.length) return;
    if (d.fromPile === t.pile && view.piles[t.pile].layout !== 'row' && view.piles[t.pile].layout !== 'grid') return;
    act({ type: 'move', ids, to: { pile: t.pile }, face: d.fromHand ? prefs.faceMode : 'match' });
  } else if (t.kind === 'player') {
    act({ type: 'move', ids, to: { hand: t.pid } });
  } else if (t.kind === 'new') {
    act({ type: 'move', ids, to: { x: t.x, z: t.z, layout: d.column ? 'column' : ids.length > 1 ? 'row' : 'stack' }, face: d.fromHand ? prefs.faceMode : 'keep' });
  }
  if (d.fromHand) clearSelection();
}

function onPileTap(pileId, cardId, viaHold = false) {
  if (!view?.piles[pileId]) return;
  if (selected.size && !viaHold) {
    act({ type: 'move', ids: selectedInOrder(), to: { pile: pileId }, face: prefs.faceMode });
    clearSelection();
    return;
  }
  pileSheet(pileId, cardId);
}

function onPlayerTap(pid) {
  if (selected.size) {
    act({ type: 'move', ids: selectedInOrder(), to: { hand: pid } });
    clearSelection();
    return;
  }
  playerSheet(pid);
}

// ------------------------------------------------------------------ sheets

function head(title, sub, extra) {
  return h('div', { class: 'sheet-head' }, h('div', { class: 'titles' }, h('h2', {}, title), sub ? h('p', {}, sub) : null), extra || null, h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'Close', onClick: closeSheet }, icon('close', 20)));
}

function tile(label, ic, onClick, { disabled, primary, hint } = {}) {
  return h('button', { type: 'button', class: `tile${primary ? ' primary' : ''}`, disabled: disabled || null, onClick }, icon(ic, 22), h('span', {}, label), hint ? h('small', {}, hint) : null);
}

function section(title, ...children) {
  return h('section', { class: 'sec' }, title ? h('h3', {}, title) : null, ...children);
}

function sheet(build, opts = {}) {
  sheetRefresh = null;
  return openSheet(
    (el, close) => {
      const render = () => {
        const out = build(close);
        if (out === null) {
          close();
          return;
        }
        fill(el, ...[out].flat().filter(Boolean));
      };
      if (opts.live) sheetRefresh = render;
      render();
    },
    { tall: opts.tall, onClose: () => (sheetRefresh = null) },
  );
}

function pileSheet(pileId, cardId) {
  let drawN = 2;
  sheet(
    (close) => {
      const p = view?.piles[pileId];
      if (!p) return null;
      const n = p.cards.length;
      const top = n ? p.cards[n - 1] : null;
      const run = (op, keep = false) => {
        act(op);
        if (!keep) close();
      };
      const focus = cardId && p.cards.includes(cardId) ? cardId : null;
      const focusName = focus && view.cards[focus]?.up ? faceName(view.cards[focus].f) : 'this card';
      return [
        head(p.name || 'Pile', `${n} card${n === 1 ? '' : 's'}${top && view.cards[top].up ? ` · top: ${faceName(view.cards[top].f)}` : ''}`, h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'Rename pile', onClick: () => renameSheet(p) }, icon('pencil', 18))),
        focus
          ? section(
              `Tapped: ${focusName}`,
              h(
                'div',
                { class: 'tiles' },
                tile('Take', 'hand', () => run({ type: 'move', ids: [focus], to: { hand: me } })),
                tile('Flip', 'flip', () => run({ type: 'flip', ids: [focus] })),
                tile('To top', 'layers', () => run({ type: 'move', ids: [focus], to: { pile: p.id } })),
                tile('To bottom', 'layers', () => run({ type: 'move', ids: [focus], to: { pile: p.id }, at: 0 })),
              ),
            )
          : null,
        h(
          'div',
          { class: 'tiles big' },
          tile('Draw', 'hand', () => run({ type: 'move', ids: [top], to: { hand: me } }), { disabled: !n, primary: true }),
          tile('Flip top', 'flip', () => run({ type: 'flip', ids: [top] }), { disabled: !n }),
          tile('Shuffle', 'shuffle', () => run({ type: 'shuffle', pile: p.id }), { disabled: n < 2 }),
          tile('Deal…', 'deal', () => dealSheet(p.id), { disabled: !n }),
        ),
        n > 1
          ? h(
              'div',
              { class: 'inline-row' },
              h('span', {}, 'Draw several'),
              stepper(drawN, { min: 1, max: Math.max(1, n), onChange: (v) => (drawN = v) }),
              button('Draw', () => run({ type: 'move', ids: p.cards.slice(-drawN).reverse(), to: { hand: me } }), { cls: 'small' }),
            )
          : null,
        section(
          'Look & arrange',
          h(
            'div',
            { class: 'tiles' },
            tile('Peek top', 'eye', () => run({ type: 'peek', pile: p.id, count: Math.min(3, n) }), { disabled: !n, hint: 'only you' }),
            tile('Search', 'search', () => run({ type: 'peek', pile: p.id, count: 'all' }), { disabled: !n, hint: 'only you' }),
            tile('Turn over', 'flip', () => run({ type: 'flipPile', pile: p.id }), { disabled: !n }),
            tile('All up', 'faceUp', () => run({ type: 'setFace', pile: p.id, up: true }), { disabled: !n }),
            tile('All down', 'faceDown', () => run({ type: 'setFace', pile: p.id, up: false }), { disabled: !n }),
            tile('Cut', 'layers', () => run({ type: 'cut', pile: p.id }), { disabled: n < 4 }),
            tile('Split', 'deal', () => run({ type: 'splitPile', pile: p.id }), { disabled: n < 2 }),
            tile('Take all', 'hand', () => run({ type: 'move', ids: [...p.cards].reverse(), to: { hand: me } }), { disabled: !n }),
          ),
        ),
        section(
          'Layout',
          segmented(
            [
              { value: 'stack', label: 'Stack' },
              { value: 'messy', label: 'Loose' },
              { value: 'row', label: 'Row' },
              { value: 'column', label: 'Column' },
              { value: 'grid', label: 'Grid' },
            ],
            p.layout,
            (layout) => act({ type: 'pileSet', pile: p.id, layout }),
          ),
        ),
        h(
          'div',
          { class: 'foot' },
          h(
            'label',
            { class: 'check' },
            h('input', { type: 'checkbox', checked: p.keep || null, onChange: (e) => act({ type: 'pileSet', pile: p.id, keep: e.target.checked }) }),
            'Keep spot when empty',
          ),
          !n ? button('Remove', () => run({ type: 'removePile', pile: p.id }), { icon: 'trash', cls: 'small danger' }) : null,
        ),
      ];
    },
    { live: true },
  );
}

function renameSheet(p) {
  sheet((close) => {
    const input = h('input', { class: 'text', value: p.name || '', maxlength: 24, placeholder: 'Pile name', enterkeyhint: 'done' });
    const save = () => {
      act({ type: 'pileSet', pile: p.id, name: input.value });
      close();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    setTimeout(() => input.focus(), 250);
    return [
      head('Rename pile'),
      input,
      h('div', { class: 'quick' }, ...['Deck', 'Discard', 'Draw pile', 'Center', 'Tricks', 'Kitty', 'Melds', 'Bank'].map((nm) => h('button', { type: 'button', class: 'chip', onClick: () => ((input.value = nm), save()) }, nm))),
      button('Save', save, { cls: 'primary wide' }),
    ];
  });
}

function playerSheet(pid) {
  sheet(
    (close) => {
      const pl = view?.players[pid];
      if (!pl) return null;
      const online = (view.online || view.order).includes(pid);
      const isMe = pid === me;
      const i = view.order.indexOf(pid);
      const run = (op, keep = false) => {
        act(op);
        if (!keep) close();
      };
      return [
        head(isMe ? `${pl.name} (you)` : pl.name, `${pl.hand.length} card${pl.hand.length === 1 ? '' : 's'} in hand · ${pl.score} point${Math.abs(pl.score) === 1 ? '' : 's'}${online ? '' : ' · offline'}`),
        h(
          'div',
          { class: 'tiles big' },
          !isMe ? tile('Take random', 'hand', () => run({ type: 'take', from: pid }), { disabled: !pl.hand.length, primary: true }) : tile(pl.revealed ? 'Hide hand' : 'Show hand', pl.revealed ? 'eyeOff' : 'eye', () => run({ type: 'reveal', on: !pl.revealed })),
          tile(view.turn === pid ? 'Has the turn' : 'Give turn', 'star', () => run({ type: 'turn', pid }), { disabled: view.turn === pid }),
          isMe ? tile('Rename', 'pencil', () => nameSheet()) : null,
        ),
        section(
          'Score',
          h(
            'div',
            { class: 'score-row' },
            ...[-5, -1].map((d) => h('button', { type: 'button', class: 'chip', onClick: () => run({ type: 'score', pid, delta: d }, true) }, String(d))),
            h('output', { class: 'big-score' }, String(pl.score)),
            ...[1, 5, 10].map((d) => h('button', { type: 'button', class: 'chip', onClick: () => run({ type: 'score', pid, delta: d }, true) }, `+${d}`)),
          ),
        ),
        session.isHost
          ? section(
              'Seat',
              h(
                'div',
                { class: 'inline-row' },
                button('Move left', () => run({ type: 'seat', pid, dir: -1 }, true), { cls: 'small', disabled: i <= 0 }),
                button('Move right', () => run({ type: 'seat', pid, dir: 1 }, true), { cls: 'small', disabled: i >= view.order.length - 1 }),
                !isMe ? button('Remove', () => confirmSheet(`Remove ${pl.name}?`, 'Their hand goes back on the table, face down.', 'Remove', () => act({ type: 'kick', pid })), { cls: 'small danger', icon: 'door' }) : null,
              ),
            )
          : null,
      ];
    },
    { live: true },
  );
}

function confirmSheet(title, text, label, fn) {
  sheet((close) => [
    head(title),
    h('p', { class: 'muted' }, text),
    h(
      'div',
      { class: 'inline-row end' },
      button('Cancel', close, { cls: 'ghost' }),
      button(
        label,
        () => {
          close();
          fn();
        },
        { cls: 'danger' },
      ),
    ),
  ]);
}

function nameSheet() {
  sheet((close) => {
    const input = h('input', { class: 'text', value: view.players[me]?.name || '', maxlength: 18, enterkeyhint: 'done' });
    const save = () => {
      act({ type: 'rename', name: input.value });
      store.set(K.name, input.value.trim());
      close();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    setTimeout(() => input.focus(), 250);
    return [head('Your name'), input, button('Save', save, { cls: 'primary wide' })];
  });
}

function cardSheet(id) {
  const c = view.cards[id];
  if (!c) return;
  sheet((close) => {
    if (!myHand().includes(id)) return null;
    const run = (op) => {
      act(op);
      close();
    };
    return [
      head(faceName(c.f), 'In your hand'),
      h(
        'div',
        { class: 'tiles big' },
        tile('Play face up', 'faceUp', () => {
          selected = new Set([id]);
          close();
          playToSheet('up');
        }),
        tile('Play face down', 'faceDown', () => {
          selected = new Set([id]);
          close();
          playToSheet('down');
        }),
        tile('Give', 'users', () => {
          selected = new Set([id]);
          close();
          giveSheet();
        }),
        tile('Put on table', 'next', () => run({ type: 'move', ids: [id], to: frontOfMe(), face: prefs.faceMode })),
      ),
    ];
  });
}

function frontOfMe() {
  const p = seatPoint(view, me, tableRadius(view.order.length) * 0.5);
  const spot = freeSpot(view, p);
  return { x: spot.x, z: spot.z, layout: 'row' };
}

function playToSheet(forceFace) {
  if (!selected.size) return;
  let face = forceFace || prefs.faceMode;
  sheet((close) => {
    const ids = selectedInOrder();
    if (!ids.length) return null;
    const run = (to) => {
      act({ type: 'move', ids, to, face });
      clearSelection();
      close();
    };
    const piles = Object.values(view.piles).sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0));
    return [
      head(`Play ${ids.length === 1 ? 'a card' : `${ids.length} cards`}`, 'Pick where they go — or tap a pile on the table.'),
      segmented(
        [
          { value: 'up', label: 'Face up', icon: 'faceUp' },
          { value: 'down', label: 'Face down', icon: 'faceDown' },
        ],
        face,
        (v) => (face = v),
      ),
      h(
        'div',
        { class: 'list' },
        h('button', { type: 'button', class: 'list-item', onClick: () => run(frontOfMe()) }, icon('next', 20), h('span', {}, 'In front of me'), h('small', {}, 'new pile')),
        h('button', { type: 'button', class: 'list-item', onClick: () => run({ ...freeSpot(view, { x: 0, z: 0.9 }), layout: 'row' }) }, icon('plus', 20), h('span', {}, 'Middle of the table'), h('small', {}, 'new pile')),
        ...piles.map((p) => h('button', { type: 'button', class: 'list-item', onClick: () => run({ pile: p.id }) }, icon('layers', 20), h('span', {}, p.name || 'Pile'), h('small', {}, `${p.cards.length}`))),
      ),
    ];
  });
}

function giveSheet() {
  if (!selected.size) return;
  sheet((close) => {
    const ids = selectedInOrder();
    if (!ids.length) return null;
    const others = view.order.filter((pid) => pid !== me);
    return [
      head(`Give ${ids.length === 1 ? 'a card' : `${ids.length} cards`}`, others.length ? 'They arrive face down in that hand.' : 'Nobody else is seated yet.'),
      h(
        'div',
        { class: 'list' },
        ...others.map((pid) =>
          h(
            'button',
            {
              type: 'button',
              class: 'list-item',
              onClick: () => {
                act({ type: 'move', ids, to: { hand: pid } });
                clearSelection();
                close();
              },
            },
            h('i', { class: 'dot', style: { background: view.players[pid].color } }),
            h('span', {}, view.players[pid].name),
            h('small', {}, `${view.players[pid].hand.length} cards`),
          ),
        ),
      ),
    ];
  });
}

function dealSheet(fromId) {
  const sources = Object.values(view.piles).filter((p) => p.cards.length);
  if (!sources.length) {
    toast('There are no cards on the table to deal.', { kind: 'error' });
    return;
  }
  let from = fromId && view.piles[fromId]?.cards.length ? fromId : (sources.find((p) => p.role === 'deck') || sources[0]).id;
  let count = prefs.dealCount;
  let all = false;
  let to = 'hands';
  const chosen = new Set(view.order);
  sheet((close) => {
    if (!view.piles[from]) return null;
    const counter = stepper(count, {
      min: 1,
      max: 60,
      onChange: (v) => {
        count = v;
        all = false;
        allBtn.classList.remove('on');
      },
    });
    const allBtn = h(
      'button',
      {
        type: 'button',
        class: `chip ${all ? 'on' : ''}`,
        onClick: () => {
          all = !all;
          allBtn.classList.toggle('on', all);
        },
      },
      'Deal all',
    );
    return [
      head('Deal', 'Round the table, starting on your left.'),
      sources.length > 1
        ? section(
            'From',
            segmented(
              sources.map((p) => ({ value: p.id, label: `${p.name || 'Pile'} (${p.cards.length})` })),
              from,
              (v) => (from = v),
            ),
          )
        : null,
      section('Cards each', h('div', { class: 'inline-row' }, counter, allBtn, ...[1, 3, 5, 7, 13].map((n) => h('button', { type: 'button', class: 'chip', onClick: () => counter.set(n) }, String(n))))),
      section(
        'To',
        segmented(
          [
            { value: 'hands', label: 'Hands', icon: 'hand' },
            { value: 'down', label: 'Table, down', icon: 'faceDown' },
            { value: 'up', label: 'Table, up', icon: 'faceUp' },
          ],
          to,
          (v) => (to = v),
        ),
      ),
      section(
        'Players',
        h(
          'div',
          { class: 'quick' },
          ...view.order.map((pid) => {
            const b = h(
              'button',
              {
                type: 'button',
                class: `chip ${chosen.has(pid) ? 'on' : ''}`,
                onClick: () => {
                  if (chosen.has(pid)) chosen.delete(pid);
                  else chosen.add(pid);
                  b.classList.toggle('on', chosen.has(pid));
                },
              },
              h('i', { class: 'dot', style: { background: view.players[pid].color } }),
              playerName(pid),
            );
            return b;
          }),
        ),
      ),
      button(
        'Deal',
        () => {
          prefs.dealCount = count;
          savePrefs();
          act({ type: 'deal', from, count: all ? 'all' : count, to: to === 'hands' ? 'hand' : 'table', face: to === 'up' ? 'up' : 'down', players: [...chosen] });
          close();
        },
        { cls: 'primary wide', icon: 'deal' },
      ),
    ];
  });
}

function deckSheet() {
  let pick = DECK_PRESETS.find((p) => JSON.stringify(p.cfg) === JSON.stringify(view.deck))?.id || 'std52';
  const custom = { kind: 'std', ranks: [...STD_RANKS], copies: 1, jokers: 0 };
  sheet(
    (close) => {
      const cfg = pick === 'custom' ? custom : DECK_PRESETS.find((p) => p.id === pick).cfg;
      const count = buildFaces(cfg).length;
      const rows = DECK_PRESETS.map((p) => {
        const faces = buildFaces(p.cfg);
        return h(
          'button',
          {
            type: 'button',
            class: `deck-row ${pick === p.id ? 'on' : ''}`,
            onClick: () => {
              pick = p.id;
              sheetRefresh?.();
            },
          },
          h('span', { class: 'thumbs' }, ...[faces[0], faces[Math.floor(faces.length / 2)], faces[faces.length - 1]].map((f) => h('img', { src: cardURL(f), alt: '' }))),
          h('span', { class: 'txt' }, h('b', {}, p.name), h('small', {}, p.blurb)),
          h('span', { class: 'n' }, String(faces.length)),
        );
      });
      const customBox =
        pick === 'custom'
          ? h(
              'div',
              { class: 'custom' },
              h(
                'div',
                { class: 'quick' },
                ...STD_RANKS.map((r) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      class: `chip ${custom.ranks.includes(r) ? 'on' : ''}`,
                      onClick: () => {
                        custom.ranks = custom.ranks.includes(r) ? custom.ranks.filter((x) => x !== r) : STD_RANKS.filter((x) => x === r || custom.ranks.includes(x));
                        sheetRefresh?.();
                      },
                    },
                    r,
                  ),
                ),
              ),
              h('div', { class: 'inline-row' }, h('span', {}, 'Copies'), stepper(custom.copies, { min: 1, max: 4, onChange: (v) => ((custom.copies = v), sheetRefresh?.()) }), h('span', {}, 'Jokers'), stepper(custom.jokers, { min: 0, max: 8, onChange: (v) => ((custom.jokers = v), sheetRefresh?.()) })),
            )
          : null;
      return [
        head('New deck', 'Clears every card from the table and all hands.'),
        h('div', { class: 'deck-list' }, ...rows, h('button', { type: 'button', class: `deck-row ${pick === 'custom' ? 'on' : ''}`, onClick: () => ((pick = 'custom'), sheetRefresh?.()) }, h('span', { class: 'thumbs' }, icon('pencil', 22)), h('span', { class: 'txt' }, h('b', {}, 'Custom'), h('small', {}, 'Pick ranks, copies and jokers')), h('span', { class: 'n' }, pick === 'custom' ? String(count) : ''))),
        customBox,
        button(
          `Use this deck (${count} cards)`,
          () => {
            act({ type: 'newDeck', cfg: structuredClone(cfg) });
            close();
          },
          { cls: 'primary wide', disabled: !count },
        ),
      ];
    },
    { tall: true, live: true },
  );
}

function peekSheet(result) {
  let pickId = null;
  sheet(
    (close) => {
      const p = view?.piles[result.pile];
      const cards = result.cards.filter((c) => p?.cards.includes(c.id));
      if (!p || !cards.length) return null;
      const run = (op) => {
        act(op);
        close();
      };
      return [
        head(result.title, `Only you can see these · ${cards.length} card${cards.length === 1 ? '' : 's'}${result.title.startsWith('Top') ? ', top first' : ''}`),
        h(
          'div',
          { class: 'peek-grid' },
          ...cards.map((c) =>
            h(
              'button',
              {
                type: 'button',
                class: `peek-card ${pickId === c.id ? 'on' : ''}`,
                onClick: () => {
                  pickId = pickId === c.id ? null : c.id;
                  sheetRefresh?.();
                },
              },
              h('img', { src: cardURL(c.f), alt: faceName(c.f) }),
            ),
          ),
        ),
        pickId
          ? h(
              'div',
              { class: 'tiles' },
              tile('Take', 'hand', () => run({ type: 'move', ids: [pickId], to: { hand: me } })),
              tile('To top', 'layers', () => run({ type: 'move', ids: [pickId], to: { pile: p.id } })),
              tile('To bottom', 'layers', () => run({ type: 'move', ids: [pickId], to: { pile: p.id }, at: 0 })),
              tile('Show it', 'flip', () => run({ type: 'move', ids: [pickId], to: { pile: p.id }, face: 'up' })),
            )
          : h('p', { class: 'muted center' }, 'Tap a card to take it or move it.'),
      ];
    },
    { tall: result.cards.length > 6, live: true },
  );
}

function logSheet() {
  sheet(
    () => [
      head('Table log', 'Everything that happened, newest first.'),
      h(
        'ol',
        { class: 'log' },
        ...[...(view?.log || [])].reverse().map((e) => {
          const pl = view.players[e.who];
          return h('li', {}, h('i', { class: 'dot', style: { background: pl?.color || '#888' } }), h('span', {}, h('b', {}, e.who === me ? 'You' : pl?.name || 'Someone'), ` ${e.text}`), h('time', {}, ago(e.at)));
        }),
      ),
    ],
    { tall: true, live: true },
  );
}

function inviteURL() {
  const u = new URL(location.href);
  u.search = `?join=${session.code}${session.kind === 'local' ? '&local' : ''}`;
  u.hash = '';
  return u.toString();
}

function shareSheet() {
  sheet((close) => {
    const url = inviteURL();
    return [
      head('Invite players', session.kind === 'local' ? 'Offline mode: other tabs of this browser can join.' : 'Anyone with the code can sit down.'),
      h('div', { class: 'big-code' }, session.code),
      h('p', { class: 'muted center' }, `Up to ${MAX_PLAYERS} players. Friends open this page and type the code, or use the link.`),
      h(
        'div',
        { class: 'inline-row center' },
        navigator.share
          ? button(
              'Share link',
              () => {
                navigator.share({ title: 'Card Table', text: `Join my card table — code ${session.code}`, url }).catch(() => {});
              },
              { cls: 'primary', icon: 'share' },
            )
          : null,
        button(
          'Copy link',
          async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast('Link copied');
            } catch {
              toast(url);
            }
            close();
          },
          { icon: 'layers' },
        ),
      ),
    ];
  });
}

function emoteSheet() {
  sheet((close) => [
    head('Say something', 'Pops up over your seat for everyone.'),
    h(
      'div',
      { class: 'quick emotes' },
      ...['👍', '👏', '😂', '😮', '🤔', '😬', '🔥', '🙏', 'Your turn!', 'Wait!', 'Good game', 'Uno!', 'Shuffle?', 'One sec'].map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            onClick: () => {
              session?.emote(t);
              close();
            },
          },
          t,
        ),
      ),
    ),
  ]);
}

function helpSheet() {
  const rows = [
    ['hand', 'Drag any card', 'From your hand, a pile or the table — drop it on a pile, a player, your hand or open felt.'],
    ['star', 'Tap your cards to select', 'Then tap a pile, a player, or the felt to play them there. Or press Play.'],
    ['layers', 'Tap a pile for actions', 'Draw, flip, shuffle, deal, peek, search, spread it out…'],
    ['next', 'Hold a pile to move it', 'Press and hold, then drag the whole stack somewhere else.'],
    ['users', 'Tap a player', 'Take a random card, give the turn, keep score.'],
    ['view', 'Pinch to zoom, drag felt to look around', 'Double check small cards up close. Recenter brings you back.'],
    ['undo', 'Undo anything', 'Misclick? Undo works for every player.'],
  ];
  sheet(() => [
    head('How the table works', 'No rules built in — play any game the way you would at a real table.'),
    h('ul', { class: 'help' }, ...rows.map(([ic, t, d]) => h('li', {}, icon(ic, 22), h('div', {}, h('b', {}, t), h('p', {}, d))))),
    button('Got it', closeSheet, { cls: 'primary wide' }),
  ], { tall: true });
}

function menuSheet() {
  sheet(
    (close) => {
      const run = (op) => {
        act(op);
        close();
      };
      const players = view.order.map((pid) => view.players[pid]);
      return [
        head('Table', `${session.code} · ${session.isHost ? 'you host this table' : `hosted by ${view.players[view.host]?.name || 'the host'}`}`),
        h(
          'div',
          { class: 'tiles big' },
          tile('Deal…', 'deal', () => dealSheet(), { primary: true }),
          tile('Gather all', 'gather', () => run({ type: 'gather' }), { hint: 'and shuffle' }),
          tile('New deck…', 'layers', deckSheet),
          tile('Add pile', 'plus', () => run({ type: 'addPile', name: `Pile ${Object.keys(view.piles).length + 1}` })),
        ),
        section(
          'Turns & dice',
          h(
            'div',
            { class: 'quick' },
            h('button', { type: 'button', class: 'chip', onClick: () => run({ type: 'turn', step: 1 }) }, view.turn ? 'Pass turn ▸' : 'Start turns'),
            view.turn ? h('button', { type: 'button', class: 'chip', onClick: () => run({ type: 'turn', pid: null }) }, 'Stop turns') : null,
            h('button', { type: 'button', class: 'chip', onClick: () => run({ type: 'roll', sides: 6, count: 1 }) }, '🎲 d6'),
            h('button', { type: 'button', class: 'chip', onClick: () => run({ type: 'roll', sides: 6, count: 2 }) }, '🎲 2d6'),
            h('button', { type: 'button', class: 'chip', onClick: () => run({ type: 'roll', sides: 20, count: 1 }) }, 'd20'),
            h('button', { type: 'button', class: 'chip', onClick: () => run({ type: 'roll', sides: 2, count: 1 }) }, '🪙 Coin'),
          ),
        ),
        section(
          'Scores',
          h(
            'div',
            { class: 'list' },
            ...players.map((pl) =>
              h(
                'div',
                { class: 'list-item static' },
                h('i', { class: 'dot', style: { background: pl.color } }),
                h('span', {}, pl.id === me ? `${pl.name} (you)` : pl.name),
                h('button', { type: 'button', class: 'mini', onClick: () => act({ type: 'score', pid: pl.id, delta: -1 }) }, '−'),
                h('b', { class: 'score' }, String(pl.score)),
                h('button', { type: 'button', class: 'mini', onClick: () => act({ type: 'score', pid: pl.id, delta: 1 }) }, '+'),
                h('button', { type: 'button', class: 'mini', onClick: () => playerSheet(pl.id), 'aria-label': 'More' }, '⋯'),
              ),
            ),
          ),
          h('button', { type: 'button', class: 'chip subtle', onClick: () => confirmSheet('Reset all scores?', 'Everyone goes back to 0.', 'Reset', () => act({ type: 'resetScores' })) }, 'Reset scores'),
        ),
        section(
          'Look',
          h(
            'div',
            { class: 'quick' },
            h(
              'button',
              {
                type: 'button',
                class: `chip ${scene.topView ? 'on' : ''}`,
                onClick: () => {
                  scene.setTopView(!scene.topView);
                  sheetRefresh?.();
                },
              },
              'Top-down view',
            ),
            h(
              'button',
              {
                type: 'button',
                class: `chip ${prefs.fourColor ? 'on' : ''}`,
                onClick: () => {
                  prefs.fourColor = !prefs.fourColor;
                  savePrefs();
                  setFourColor(prefs.fourColor);
                  scene.refreshFaces();
                  sheetRefresh?.();
                },
              },
              'Four-color suits',
            ),
            h(
              'button',
              {
                type: 'button',
                class: `chip ${prefs.muted ? '' : 'on'}`,
                onClick: () => {
                  prefs.muted = !prefs.muted;
                  savePrefs();
                  setMuted(prefs.muted);
                  sheetRefresh?.();
                },
              },
              'Sounds',
            ),
          ),
          h('div', { class: 'swatches' }, h('span', {}, 'Felt'), ...FELTS.map((f) => h('button', { type: 'button', class: `sw felt-${f} ${view.style.felt === f ? 'on' : ''}`, 'aria-label': `${f} felt`, onClick: () => act({ type: 'style', felt: f }) }))),
          h('div', { class: 'swatches' }, h('span', {}, 'Backs'), ...BACKS.map((b) => h('button', { type: 'button', class: `sw ${view.style.back === b ? 'on' : ''}`, style: { background: BACK_STYLES[b].base, borderColor: BACK_STYLES[b].line }, 'aria-label': `${b} card backs`, onClick: () => act({ type: 'style', back: b }) }))),
        ),
        h(
          'div',
          { class: 'foot' },
          button('How it works', helpSheet, { icon: 'help', cls: 'small ghost' }),
          button('Invite', shareSheet, { icon: 'share', cls: 'small ghost' }),
          button(
            session.isHost ? 'Close table' : 'Leave',
            () =>
              confirmSheet(
                session.isHost ? 'Close the table?' : 'Leave the table?',
                session.isHost ? 'Everyone is disconnected. You can resume it later from this device.' : 'Your hand goes back onto the table face down.',
                session.isHost ? 'Close' : 'Leave',
                () => leaveTable(),
              ),
            { icon: 'door', cls: 'small danger' },
          ),
        ),
      ];
    },
    { tall: true, live: true },
  );
}

// ------------------------------------------------------------------ wiring

function wire() {
  initSheet();
  $('name').value = store.get(K.name, '') || '';
  $('create').addEventListener('click', () => hostTable(null));
  $('join').addEventListener('click', () => joinTable());
  $('code').addEventListener('input', (e) => {
    e.target.value = normalizeCode(e.target.value).slice(0, 5);
  });
  $('code').addEventListener('keydown', (e) => e.key === 'Enter' && joinTable());
  $('name').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (validCode(normalizeCode($('code').value))) joinTable();
    else hostTable(null);
  });
  $('btn-menu').addEventListener('click', menuSheet);
  $('btn-room').addEventListener('click', shareSheet);
  $('btn-log').addEventListener('click', logSheet);
  $('btn-emote').addEventListener('click', emoteSheet);
  $('btn-undo').addEventListener('click', () => act({ type: 'undo' }));
  $('btn-recenter').addEventListener('click', () => {
    scene.resetView();
    $('btn-recenter').classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (!session || sheetOpen() || e.target.closest?.('input')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      act({ type: 'undo' });
    }
  });

  transportReady.then((k) => {
    $('mode-note').textContent = k === 'online' ? 'Friends join from any phone or computer with the table code.' : 'Offline mode: online play is not set up here, so tables open in this browser (other tabs can join).';
  });

  renderResume();
  const params = new URLSearchParams(location.search);
  const joinCode = normalizeCode(params.get('join'));
  const tableCode = normalizeCode(params.get('table'));
  if (validCode(joinCode)) {
    $('code').value = joinCode;
    if ($('name').value) joinTable(joinCode);
    else {
      homeStatus(`Pick a name to join table ${joinCode}.`);
      $('name').focus();
    }
  } else if (validCode(tableCode)) {
    const hs = store.get(K.host);
    if (hs?.code === tableCode && $('name').value) hostTable(hs);
  }
}

wire();

// handy from the console, and used by the browser tests
window.cardTable = {
  get scene() {
    return scene;
  },
  get view() {
    return view;
  },
  get me() {
    return me;
  },
  act,
};
