// Driftacre — input, UI and the game loop.
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createPainter } from './sprites.js';
import { CROPS, CROP, BUILDINGS, BUILDING, STYLES, STYLE, xpForLevel } from './data.js';
import * as G from './state.js';

const { rt } = G;
const $ = id => document.getElementById(id);
const canvas = $('world');
let world;
try { world = createWorld(canvas); } catch (err) { $('error').hidden = false; throw err; }
const audio = createAudio();

let s = G.load();
const hadSave = !!s;
if (!s) s = G.newGame('peach');
let playing = false, resetting = false, hiddenAt = 0;
let tool = 'tend', placeId = null, combo = 0, comboT = 0, plantsDone = 0, lastPlayerSfx = 0, removeArm = null, poorToastAt = 0;
let sheet = null, sheetTab = 'building', sheetSig = '';
let iconCache = new Map();
const timers = { whale: 140 + Math.random() * 120, balloon: 50 + Math.random() * 50, star: 15 };

const ease = t => 1 - Math.pow(1 - t, 3);
const fmt = n => { n = Math.floor(n); if (n < 1000) return String(n); if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'k'; return (n / 1e6).toFixed(n < 1e7 ? 2 : 1).replace(/\.0+$/, '') + 'M'; };
const fmtTime = sec => { sec = Math.round(sec); if (sec < 60) return sec + 's'; if (sec < 3600) { const m = Math.floor(sec / 60), r = sec % 60; return m + 'm' + (r && m < 10 ? ' ' + r + 's' : ''); } const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h + 'h' + (m ? ' ' + m + 'm' : ''); };
const COIN = '<i class="ico coin"></i>', WISP = '<i class="ico wisp"></i>';

// ------------------------------------------------------------------ style
function applyStyle(id) {
  const st = STYLE[id] || STYLES[0];
  s.style = st.id;
  world.setStyle(st);
  iconCache = new Map();
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(st.ui)) root.setProperty('--' + k, v);
  root.setProperty('--font', st.font);
  document.body.dataset.style = st.id; document.body.dataset.overlay = st.overlay;
  document.body.classList.toggle('pixel', st.res === 1);
  document.querySelector('meta[name=theme-color]').content = st.sky.dayHor;
  document.body.style.background = st.sky.dayHor;
  updateSeedButton();
  if (sheet) renderSheet(true);
  renderTitleStyles();
}
function icon(name) {
  if (!iconCache.has(name)) {
    if (name === 'bld:pond') iconCache.set(name, world.painter.tileTex('pond').toDataURL());
    else iconCache.set(name, world.painter.icon(name));
  }
  return iconCache.get(name);
}
const stylePreview = new Map();
function previewFor(st) { if (!stylePreview.has(st.id)) stylePreview.set(st.id, createPainter(st).icon('crop:gourd:3', 64)); return stylePreview.get(st.id); }
function styleCardsHTML(cls) {
  return STYLES.map(st => `<button class="${cls} ${st.id === s.style ? 'on sel' : ''}" data-style="${st.id}" style="font-family:${st.font.replace(/"/g, "'")}">
    <div class="sw" style="background:linear-gradient(${st.sky.dayTop}, ${st.sky.dayHor} 70%, ${st.grass[0]} 70%)"><img src="${previewFor(st)}" alt="" style="image-rendering:${st.res === 1 ? 'pixelated' : 'auto'}"></div>
    <div class="nm">${st.name}</div>${cls.includes('card') ? `<div class="ds">${st.sub}</div>` : ''}</button>`).join('');
}
function renderTitleStyles() { $('title-styles').innerHTML = styleCardsHTML(''); }
$('title-styles').addEventListener('click', e => { const b = e.target.closest('[data-style]'); if (b) applyStyle(b.dataset.style); });

// ------------------------------------------------------------------ title / start
function startGame(fresh) {
  if (fresh) {
    const st = s.style;
    rt.helpers.length = 0; rt.reserved.clear();
    s = G.newGame(st);
    world.frameIsland();
  }
  playing = true;
  $('title').classList.add('out'); setTimeout(() => { $('title').hidden = true; }, 500);
  $('hud').hidden = false; $('dock').hidden = false;
  audio.unlock().then(() => { audio.setSfx(s.sound); audio.setMusic(s.music); });
  if (!fresh) catchUp((Date.now() - s.lastSeen) / 1000);
  world.cam.yawT = Math.round(world.cam.yaw / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
  world.frameIsland();
  updateSeedButton(); updateCoach(); G.save(s);
  canvas.focus({ preventScroll: true });
}
$('btn-new').addEventListener('click', () => { if (hadSave && !confirm('Start a brand new island? Your current island will be replaced.')) return; startGame(true); });
$('btn-continue').addEventListener('click', () => startGame(false));
if (hadSave) { $('btn-continue').hidden = false; $('btn-new').textContent = 'Start a new island'; }

function catchUp(secs) {
  if (secs < 45) return;
  const r = G.simulateAway(s, secs);
  const items = [`<li>Away for <b>${fmtTime(r.seconds)}</b></li>`];
  if (r.harvests > 0) items.push(`<li>Your Sproutlings gathered <b>${fmt(r.harvests)}</b> crops</li>`);
  if (r.coins > 0) items.push(`<li>${COIN} <b>+${fmt(r.coins)}</b> coins</li>`);
  if (r.wisps > 0) items.push(`<li>${WISP} <b>+${r.wisps}</b> wisps</li>`);
  if (r.levels > 0) items.push(`<li>You reached <b>level ${s.level}</b></li>`);
  if (r.land > 0) items.push(`<li><b>${r.land}</b> new land sprout${r.land > 1 ? 's' : ''} ready to plant</li>`);
  if (!G.helperCount(s)) items.push('<li>Your crops ripened and are waiting. Build a Sprout Hut and a Sproutling will harvest while you are gone.</li>');
  $('away-list').innerHTML = items.join('');
  $('away-title').textContent = r.harvests ? 'The island kept busy.' : 'The island kept growing.';
  $('away').showModal();
}
$('away-ok').addEventListener('click', () => $('away').close());

// ------------------------------------------------------------------ HUD
let hudSig = '';
function updateHud() {
  const need = G.nextLandNeed(s), ready = s.orders.some(o => o.wants.every(w => w.h >= w.q));
  const sig = [Math.floor(s.coins), s.wisps, s.level, s.xp, s.verd, s.landTokens, ready, tool].join('|');
  if (sig === hudSig) return; hudSig = sig;
  $('coins').textContent = fmt(s.coins); $('wisps').textContent = fmt(s.wisps); $('level').textContent = s.level;
  $('xpbar').style.width = Math.min(100, s.xp / xpForLevel(s.level) * 100) + '%';
  $('heart-ring').style.setProperty('--p', Math.min(100, s.verd / need * 100).toFixed(1));
  $('heart-sub').textContent = `${fmt(s.verd)} / ${fmt(need)}`;
  $('heart-label').textContent = s.landTokens ? 'Land ready!' : 'Island heart';
  $('heart').classList.toggle('ready', s.landTokens > 0);
  for (const id of ['land-count', 'land-badge']) { $(id).hidden = !s.landTokens; $(id).textContent = s.landTokens; }
  $('wish-badge').hidden = !ready;
  if (tool === 'land') updateModeHint();
}
function bump(id) { const el = $(id).parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function updateSeedButton() { const c = CROP[s.seed]; $('seed-ico').src = icon('crop:' + c.id + ':3'); $('seed-name').textContent = c.name.split(' ').pop(); }

function toast(msg, dur = 2600) { const t = $('toast'); t.innerHTML = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), dur); }
function banner(title, sub) { const b = $('banner'); b.innerHTML = `<h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}`; b.classList.add('show'); clearTimeout(banner.h); banner.h = setTimeout(() => b.classList.remove('show'), 2800); }

const COACH = [
  'Tap the <b>golden Sunwheat</b> to harvest it',
  'Tap empty ground to <b>plant</b> — or drag to plant a whole row',
  'Tap a <b>growing sprout</b> once to help it along',
  'Every harvest feeds the <b>island heart</b> up top',
  'A land sprout is ready! Tap <b>Land</b>, then a glowing edge',
];
function updateCoach() {
  const c = $('coach');
  const show = playing && s.tut < COACH.length && !sheet && !(s.tut === 4 && tool === 'land');
  c.hidden = !show; if (show) c.innerHTML = COACH[s.tut];
}
function advanceTut(from, to) { if (s.tut === from) { s.tut = to; updateCoach(); } }

// ------------------------------------------------------------------ floating text
const floats = [];
function floatAt(where, html, cls = '', dur = 1150) {
  const el = document.createElement('div'); el.className = 'fl ' + cls; el.innerHTML = html;
  $('floats').append(el);
  floats.push({ el, where, t0: performance.now(), dur, dx: (Math.random() - 0.5) * 18 });
}
function updateFloats(now) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i], a = (now - f.t0) / f.dur;
    if (a >= 1) { f.el.remove(); floats.splice(i, 1); continue; }
    const p = typeof f.where === 'string' ? world.tileScreen(f.where, 1.1) : world.project(f.where);
    if (!p) { f.el.style.opacity = 0; continue; }
    const sc = a < 0.15 ? 0.5 + a / 0.15 * 0.6 : a < 0.3 ? 1.1 - (a - 0.15) / 0.15 * 0.1 : 1;
    f.el.style.transform = `translate(${p.x + f.dx}px, ${p.y - ease(a) * 50}px) translate(-50%, -50%) scale(${sc})`;
    f.el.style.opacity = a > 0.7 ? (1 - a) / 0.3 : 1;
  }
}

// ------------------------------------------------------------------ game events → feedback
function tileXZ(k) { const [i, j] = G.parse(k); return [i, j]; }
function handleEvents() {
  const evs = rt.events.splice(0);
  const now = performance.now();
  for (const e of evs) {
    switch (e.type) {
      case 'harvest': {
        const [i, j] = tileXZ(e.k), c = CROP[e.id];
        world.burst(i, 0.45, j, { n: e.golden ? 26 : 12, color: e.golden ? ['#ffe066', '#fff6c8', c.color] : [c.color, '#ffffff', c.color], speed: 2.2, up: 3.2, g: 8, life: 0.7, size: 0.17 });
        const mine = e.by === 'player';
        floatAt(e.k, `${COIN}+${fmt(e.coins)}${e.qty > 1 ? ' ×2' : ''}`, (e.golden ? 'gold big' : '') + (mine ? '' : ' small'));
        if (e.wisps) setTimeout(() => floatAt(e.k, `${WISP}+${e.wisps}`, 'gold'), 180);
        if (mine) { combo = comboT > 0 ? combo + 1 : 0; comboT = 0.9; audio.play.harvest(combo, e.golden); lastPlayerSfx = now; advanceTut(0, 1); }
        else if (now - lastPlayerSfx > 400 && Math.random() < 0.6) audio.play.harvest(Math.floor(Math.random() * 4), e.golden);
        if (e.golden && mine) { toast(`A <b>golden ${c.name}</b>! Five times the coins, plus a wisp.`); world.shake(0.08); }
        bump('coins');
        break;
      }
      case 'plant': {
        const [i, j] = tileXZ(e.k);
        world.burst(i, 0.05, j, { n: 7, color: [STYLE[s.style].soil[2], STYLE[s.style].soil[0]], speed: 1.2, up: 1.6, g: 7, life: 0.45, size: 0.12 });
        if (e.by === 'player') { audio.play.plant(); plantsDone++; if (plantsDone >= 3) advanceTut(1, 2); }
        break;
      }
      case 'tend': {
        const [i, j] = tileXZ(e.k);
        world.burst(i, 0.9, j, { n: 10, color: ['#8ccaff', '#ffffff', '#bfe6ff'], speed: 0.8, up: 0.5, g: 5, life: 0.6, size: 0.12 });
        if (e.by === 'player') { audio.play.tend(); advanceTut(2, 3); }
        break;
      }
      case 'ripe': { const [i, j] = tileXZ(e.k); world.burst(i, 0.6, j, { n: 5, color: '#ffffff', speed: 0.6, up: 1.2, g: 0.5, life: 0.8, size: 0.14 }); break; }
      case 'level': {
        audio.play.level();
        banner(`Level ${e.level}`, e.unlocks.length ? 'New: ' + e.unlocks.join(', ') : 'Your island grows cozier');
        world.burst(world.cam.tx, 1, world.cam.tz, { n: 60, color: ['#ffe066', '#ffffff', '#ff9ec4', '#9fd4ff'], speed: 5, up: 6, g: 5, life: 1.6, size: 0.2, spread: 3 });
        if (sheet) renderSheet(true);
        break;
      }
      case 'landToken':
        audio.play.sparkle();
        toast('The island heart bloomed! A <b>land sprout</b> is ready.');
        advanceTut(3, 4);
        if (tool === 'land') world.setGhosts(G.edgeSpots(s), true);
        break;
      case 'land': {
        const [i, j] = tileXZ(e.k);
        world.riseTile(e.k); audio.play.land(); world.shake(0.12);
        setTimeout(() => world.burst(i, 0.1, j, { n: 40, color: [...STYLE[s.style].grass, '#ffffff', STYLE[s.style].dirt], speed: 3, up: 3.5, g: 6, life: 1, size: 0.16, spread: 0.9 }), 900);
        if (e.gift?.coins) setTimeout(() => floatAt(e.k, `${COIN}+${e.gift.coins} buried treasure!`, 'gold'), 1000);
        if (e.gift?.wisps) setTimeout(() => floatAt(e.k, `${WISP}+1 a sleeping wisp!`, 'gold'), 1000);
        if (e.gift?.crop) setTimeout(() => floatAt(e.k, `A wild ${e.gift.crop}!`, ''), 1000);
        advanceTut(4, 5);
        if (tool === 'land') { world.setGhosts(G.edgeSpots(s), s.landTokens > 0); updateModeHint(); }
        break;
      }
      case 'build': { const [i, j] = tileXZ(e.k); audio.play.build(); world.burst(i, 0.1, j, { n: 22, color: ['#f2e6d0', '#ffffff', '#d9c7a8'], speed: 2.2, up: 2, g: 6, life: 0.8, size: 0.18, spread: 0.7 }); if (e.id === 'hut') toast('A <b>Sproutling</b> moved in! It will harvest, replant and tend for you.'); break; }
      case 'remove': { const [i, j] = tileXZ(e.k); audio.play.plant(); world.burst(i, 0.1, j, { n: 10, color: '#d9c7a8', speed: 1.5, up: 1.5, life: 0.5 }); if (e.refund?.coins) floatAt(e.k, `${COIN}+${fmt(e.refund.coins)}`); break; }
      case 'well': { const wk = Object.keys(s.tiles).find(k => s.tiles[k].b === 'well'); if (wk) floatAt(wk, `${COIN}+${fmt(e.amt)}`, 'small', 1400); break; }
      case 'orderReady': audio.play.sparkle(); toast(`${e.o.from}'s wish can be granted! Open <b>Wishes</b>.`); break;
      case 'newOrder': if (sheet === 'wishes') renderSheet(true); break;
    }
  }
}

// ------------------------------------------------------------------ actions
function actionFor(k) {
  const t = s.tiles[k];
  if (!t || t.b) return null;
  if (t.crop) return t.crop.p >= 1 ? 'harvest' : (!t.crop.t ? 'tend' : null);
  return 'plant';
}
function doAction(act, k) {
  if (act === 'harvest') G.harvest(s, k, 'player');
  else if (act === 'tend') G.tend(s, k, 'player');
  else if (act === 'plant') {
    const r = G.plant(s, k, s.seed, 'player');
    if (r === 'poor' && performance.now() - poorToastAt > 1500) {
      poorToastAt = performance.now(); audio.play.nope();
      const cheap = CROPS.filter(c => c.lvl <= s.level && c.cost <= s.coins).pop();
      toast(`Not enough coins for ${CROP[s.seed].name} (${CROP[s.seed].cost}).` + (cheap ? ` Try ${cheap.name}.` : ' Harvest something first.'));
    }
  }
}
function tapTile(k) {
  const t = s.tiles[k];
  if (tool === 'tend') {
    if (t?.b) { const b = BUILDING[t.b]; toast(`<b>${b.name}</b> — ${b.desc}`, 3400); audio.play.tick(); }
    else if (t?.crop && t.crop.p < 1) { const c = CROP[t.crop.id]; const left = (1 - t.crop.p) / G.cropRate(s, k, G.isNight(s)); toast(`<b>${c.name}</b> ripe in about ${fmtTime(left)}${t.crop.t ? '' : ' — tap to tend'}`); }
    else if (!t && s.landTokens) toast('Tap <b>Land</b> to grow new ground here.');
  } else if (tool === 'place') {
    const r = G.build(s, k, placeId);
    const b = BUILDING[placeId];
    if (r === 'ok') { updateModeHint(); return; }
    audio.play.nope();
    toast({ occupied: 'That spot is busy — clear it first.', poor: `Not enough ${buildCostText(b.id, true)} for ${b.name}.`, max: `You have the most ${b.name}s an island can hold.`, nope: 'Build on your island tiles.', locked: `${b.name} unlocks at level ${b.lvl}.` }[r] || 'Can’t build there.');
  } else if (tool === 'land') {
    if (!s.landTokens) { audio.play.nope(); toast('No land sprouts yet. Harvests fill the island heart.'); return; }
    if (!G.placeLand(s, k)) { audio.play.nope(); toast('Land grows from the edge — tap a glowing spot.'); }
  } else if (tool === 'shovel') {
    if (!t) return;
    if (t.b && removeArm !== k) { removeArm = k; toast(`Tap again to remove the <b>${BUILDING[t.b].name}</b> (half refund).`); setTimeout(() => { if (removeArm === k) removeArm = null; }, 2500); return; }
    if (t.crop && t.crop.p >= 1 && removeArm !== k) { removeArm = k; toast('That crop is ripe! Tap again to clear it anyway.'); return; }
    removeArm = null;
    if (!G.removeAt(s, k)) toast('Nothing to clear here.');
  }
}
function buildCostText(id, short) {
  const c = G.buildCost(s, id);
  if (short) return c.wisps && s.wisps < c.wisps ? 'wisps' : 'coins';
  return [c.coins ? `${COIN}${fmt(c.coins)}` : '', c.wisps ? `${WISP}${c.wisps}` : ''].filter(Boolean).join(' ');
}

function setTool(t, id) {
  tool = t; placeId = id || null; removeArm = null;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === (t === 'place' ? 'build' : t)));
  world.setGhosts(t === 'land' ? G.edgeSpots(s) : null, s.landTokens > 0);
  world.setHover(null);
  updateModeHint(); updateCoach();
}
function updateModeHint() {
  const h = $('mode-hint');
  let txt = '';
  if (tool === 'place') { const b = BUILDING[placeId]; txt = `Placing <b>${b.name}</b> ${buildCostText(placeId)} — tap a tile`; }
  else if (tool === 'land') txt = s.landTokens ? `Tap a glowing edge to grow land · <b>${s.landTokens}</b> sprout${s.landTokens > 1 ? 's' : ''}` : 'No land sprouts yet — harvests fill the island heart';
  else if (tool === 'shovel') txt = 'Tap a tile to clear it';
  h.hidden = !txt; $('mode-text').innerHTML = txt;
}
$('mode-done').addEventListener('click', () => setTool('tend'));

// ------------------------------------------------------------------ sheets
function openSheet(name) { sheet = name; $('sheet').hidden = false; renderSheet(true); updateCoach(); audio.play.tick(); }
function closeSheet() { sheet = null; $('sheet').hidden = true; updateCoach(); }
$('sheet-close').addEventListener('click', closeSheet);
function renderSheet(force) {
  if (!sheet) return;
  const sig = [sheet, sheetTab, s.level, Math.floor(s.coins), s.wisps, s.seed, s.style, JSON.stringify(s.orders), JSON.stringify(s.owned)].join('|');
  if (!force && sig === sheetSig) return; sheetSig = sig;
  const body = $('sheet-body'), tabs = $('sheet-tabs');
  tabs.innerHTML = '';
  if (sheet === 'seeds') {
    $('sheet-title').textContent = 'Seeds';
    body.innerHTML = CROPS.map(c => {
      const locked = c.lvl > s.level, poor = s.coins < c.cost;
      return `<button class="card ${c.id === s.seed ? 'sel' : ''} ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}" data-seed="${c.id}">
        <img src="${icon('crop:' + c.id + ':3')}" alt=""><span class="nm">${c.name}</span>
        <span class="meta">${locked ? `Unlocks at level ${c.lvl}` : `<span class="price">${COIN}${fmt(c.cost)}</span><span>⏱ ${fmtTime(c.time)}</span><span>sells ${fmt(c.sell)}</span>`}</span>
        <span class="meta"></span>
        <span class="ds">${c.desc}</span></button>`;
    }).join('');
  } else if (sheet === 'build') {
    $('sheet-title').textContent = 'Build';
    tabs.innerHTML = `<button data-tab="building" class="${sheetTab === 'building' ? 'on' : ''}">Helpers & magic</button><button data-tab="decor" class="${sheetTab === 'decor' ? 'on' : ''}">Decor <small>(cozy: +${rt.cozy}%)</small></button>`;
    body.innerHTML = BUILDINGS.filter(b => b.kind === sheetTab).map(b => {
      const locked = b.lvl > s.level, c = G.buildCost(s, b.id), poor = s.coins < c.coins || s.wisps < c.wisps, own = s.owned[b.id] || 0, max = b.max && own >= b.max;
      return `<button class="card ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}" data-build="${b.id}">
        ${own ? `<span class="own">×${own}</span>` : ''}
        <img src="${icon('bld:' + b.id)}" alt=""><span class="nm">${b.name}</span>
        <span class="meta">${locked ? `Unlocks at level ${b.lvl}` : max ? 'Island is full of these' : `<span class="price">${buildCostText(b.id)}</span>`}</span><span></span>
        <span class="ds">${b.desc}</span></button>`;
    }).join('');
  } else if (sheet === 'wishes') {
    $('sheet-title').textContent = 'Wishes';
    body.innerHTML = s.orders.map(o => {
      const ready = o.wants.every(w => w.h >= w.q);
      return `<div class="wish ${ready ? 'ready' : ''}">
        <div class="who"><b>${o.from}</b><small>${o.line}.</small></div>
        <div class="wants">${o.wants.map(w => `<div class="want"><img src="${icon('crop:' + w.id + ':3')}" alt="${CROP[w.id].name}"><span>${Math.min(w.h, w.q)} / ${w.q}</span><span class="pb"><i style="width:${Math.min(100, w.h / w.q * 100)}%"></i></span></div>`).join('')}</div>
        <div class="rew">${COIN}${fmt(o.coins)} ${o.wisps ? `${WISP}${o.wisps}` : ''} <span>+${o.xp}xp</span></div>
        <button class="claim" data-claim="${o.id}" ${ready ? '' : 'disabled'}>${ready ? 'Grant wish' : 'Growing…'}</button>
        <button class="no" data-dismiss="${o.id}" aria-label="Decline wish">×</button></div>`;
    }).join('') + (s.orders.length < 3 ? `<p class="empty">Another traveler will drift by in about ${fmtTime(Math.max(5, s.orderTimer))}…</p>` : '') + '<p class="empty">Wishes count every harvest — yours and your Sproutlings’.</p>';
  } else if (sheet === 'style') {
    $('sheet-title').textContent = 'Art style';
    body.innerHTML = styleCardsHTML('card stylecard');
  }
}
$('sheet-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { sheetTab = b.dataset.tab; renderSheet(true); } });
$('sheet-body').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.seed) {
    const c = CROP[t.dataset.seed];
    if (c.lvl > s.level) { audio.play.nope(); toast(`${c.name} unlocks at level ${c.lvl}.`); return; }
    s.seed = c.id; updateSeedButton(); setTool('tend'); closeSheet(); audio.play.tick();
  } else if (t.dataset.build) {
    const b = BUILDING[t.dataset.build];
    if (b.lvl > s.level) { audio.play.nope(); toast(`${b.name} unlocks at level ${b.lvl}.`); return; }
    setTool('place', b.id); closeSheet(); audio.play.tick();
  } else if (t.dataset.claim) {
    const o = G.claimOrder(s, +t.dataset.claim);
    if (o) {
      audio.play.coin(); audio.play.sparkle();
      toast(`${o.from} is delighted! ${COIN}+${fmt(o.coins)}${o.wisps ? ` ${WISP}+${o.wisps}` : ''}`);
      world.burst(world.cam.tx, 1.5, world.cam.tz, { n: 40, color: ['#ffe066', '#ffffff', '#ff9ec4'], speed: 4, up: 5, g: 5, life: 1.4, size: 0.2, spread: 2 });
      bump('coins'); renderSheet(true);
    }
  } else if (t.dataset.dismiss) { G.dismissOrder(s, +t.dataset.dismiss); renderSheet(true); }
  else if (t.dataset.style) { applyStyle(t.dataset.style); audio.play.sparkle(); }
});

document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.tool;
  if (t === 'seeds' || t === 'build' || t === 'wishes') { if (sheet === t) closeSheet(); else openSheet(t); return; }
  closeSheet(); setTool(t === tool ? 'tend' : t); audio.play.tick();
}));
$('heart').addEventListener('click', () => { closeSheet(); setTool('land'); audio.play.tick(); });
$('btn-style').addEventListener('click', () => { if (sheet === 'style') closeSheet(); else openSheet('style'); });
$('rot-l').addEventListener('click', () => world.rotate(-1));
$('rot-r').addEventListener('click', () => world.rotate(1));
$('btn-menu').addEventListener('click', () => {
  $('opt-sound').checked = s.sound; $('opt-music').checked = s.music;
  $('stats').textContent = `Island: ${G.tileCount(s)} tiles · Harvests: ${fmt(s.stats.harvests)} · Golden crops: ${s.stats.golden} · Sproutlings: ${G.helperCount(s)} · Cozy: +${rt.cozy}%`;
  $('menu').showModal();
});
$('menu-close').addEventListener('click', () => $('menu').close());
$('opt-sound').addEventListener('change', e => { s.sound = e.target.checked; audio.setSfx(s.sound); });
$('opt-music').addEventListener('change', e => { s.music = e.target.checked; audio.setMusic(s.music); });
$('menu-reset').addEventListener('click', () => { if (!confirm('Start over? Your island, coins and progress will be gone for good.')) return; resetting = true; G.wipe(); location.reload(); });

// ------------------------------------------------------------------ sky visitors
function tickTimers(dt) {
  timers.whale -= dt; timers.balloon -= dt;
  if (timers.whale <= 0) { timers.whale = 300 + Math.random() * 240; world.spawnEvent('whale'); audio.play.whale(); toast('A <b>sky whale</b> drifts by. Tap it to hear it sing!', 3400); }
  if (timers.balloon <= 0) { timers.balloon = 110 + Math.random() * 90; world.spawnEvent('balloon'); }
  if (world.night > 0.6) { timers.star -= dt; if (timers.star <= 0) { timers.star = 16 + Math.random() * 26; world.spawnEvent('star'); } }
}
function tapEvent(o) {
  const u = o.userData, pos = o.position.clone();
  if (u.kind === 'whale') {
    if (u.tapped) return; u.tapped = true;
    s.rain = 45; audio.play.whale(); audio.play.sparkle();
    world.burst(pos.x, pos.y + 1, pos.z, { n: 40, color: ['#dff4ff', '#ffffff', '#c6b8ff'], speed: 4, up: 3, g: 1, life: 1.6, size: 0.35 });
    toast('The whale sings… a warm rain falls. <b>Everything grows twice as fast</b> for a while.', 3800);
  } else if (u.kind === 'balloon') {
    const coins = Math.round(10 + s.level * 9 + G.tileCount(s) * 1.5), w = Math.random() < 0.2 ? 1 : 0;
    s.coins += coins; s.wisps += w;
    world.removeEvent(o, true); audio.play.pop(); audio.play.coin();
    floatAt(pos, `${COIN}+${fmt(coins)}${w ? ` ${WISP}+1` : ''}`, 'gold big', 1500); bump('coins');
  } else if (u.kind === 'star') {
    s.wisps += 1; world.removeEvent(o, true); audio.play.sparkle();
    floatAt(pos, `${WISP}+1 a falling wish!`, 'gold big', 1600);
  }
}

// ------------------------------------------------------------------ input
const pointers = new Map();
let gesture = null;
function hoverAt(x, y) {
  if (!playing) return;
  const k = world.pickTile(x, y, s, tool !== 'land'), t = s.tiles[k];
  if (tool === 'tend') world.setHover(t ? k : null, actionFor(k) ? '#ffffff' : '#ffffff');
  else if (tool === 'place') { const ok = t && !t.b && !t.crop; world.setHover(t ? k : null, ok ? '#9dffb0' : '#ff8a8a', BUILDING[placeId]?.flat ? null : 'bld:' + placeId); }
  else if (tool === 'land') { const ok = !t && G.edgeSpots(s).includes(k); world.setHover(ok ? k : null, s.landTokens ? '#9dffb0' : '#ffd38a'); }
  else if (tool === 'shovel') world.setHover(t ? k : null, '#ffb38a');
}
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!playing) return;
  audio.unlock();
  if (sheet && pointers.size === 1) { closeSheet(); gesture = { type: 'none' }; return; }
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return; }
  if (pointers.size > 2) return;
  if (e.button === 1 || e.button === 2) { gesture = { type: 'pan' }; return; }
  const ev = world.pickEvent(e.clientX, e.clientY);
  if (ev) { tapEvent(ev); gesture = { type: 'none' }; return; }
  const k = world.pickTile(e.clientX, e.clientY, s, tool !== 'land');
  if (tool === 'tend') {
    const act = actionFor(k);
    if (act) { gesture = { type: 'paint', act, last: k, x: e.clientX, y: e.clientY }; doAction(act, k); return; }
  }
  gesture = { type: 'tap', k, x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (!gesture) return;
  if (gesture.type === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (gesture.d > 0) world.zoom(gesture.d / d);
    world.pan(mx - gesture.mx, my - gesture.my);
    Object.assign(gesture, { d, mx, my });
  } else if (gesture.type === 'pan') world.pan(dx, dy);
  else if (gesture.type === 'tap') { if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 9) { gesture = { type: 'pan' }; world.pan(dx, dy); } }
  else if (gesture.type === 'paint') {
    // sample along the drag so fast swipes don't skip tiles
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 12));
    for (let i = 1; i <= steps; i++) {
      const x = e.clientX - dx + dx * i / steps, y = e.clientY - dy + dy * i / steps;
      const k = world.pickTile(x, y, s);
      if (k !== gesture.last) { gesture.last = k; if (actionFor(k) === gesture.act) doAction(gesture.act, k); }
    }
    if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY);
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (gesture?.type === 'tap' && pointers.size === 0) tapTile(gesture.k);
  if (pointers.size === 0) gesture = null;
  else if (gesture?.type === 'pinch') gesture = { type: 'pan' };
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pointers.size) world.setHover(null); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); world.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

const keys = new Set();
addEventListener('keydown', e => {
  if (e.target.closest?.('dialog') || !playing) return;
  keys.add(e.code);
  if (e.code === 'KeyQ') world.rotate(-1);
  if (e.code === 'KeyE') world.rotate(1);
  if (e.key === '+' || e.key === '=') world.zoom(0.85);
  if (e.key === '-' || e.key === '_') world.zoom(1.18);
  if (e.code === 'KeyB') { if (sheet === 'build') closeSheet(); else openSheet('build'); }
  if (e.code === 'KeyL') setTool(tool === 'land' ? 'tend' : 'land');
  if (e.code === 'KeyF') world.frameIsland();
  if (/^Digit[1-9]$/.test(e.code)) { const c = CROPS[+e.code.slice(5) - 1]; if (c && c.lvl <= s.level) { s.seed = c.id; updateSeedButton(); setTool('tend'); toast(`Seed: <b>${c.name}</b>`, 1200); } }
  if (e.code === 'Escape') { if (sheet) closeSheet(); else setTool('tend'); }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function keyPan(dt) {
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x -= 1;
  if (x || y) world.pan(x * 700 * dt, y * 700 * dt);
}

// ------------------------------------------------------------------ lifecycle
addEventListener('resize', () => world.resize());
document.addEventListener('visibilitychange', () => {
  if (resetting) return;
  if (document.hidden) { hiddenAt = Date.now(); if (playing) G.save(s); audio.suspend(true); }
  else {
    audio.suspend(false);
    if (playing && hiddenAt) catchUp((Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
  }
});
addEventListener('pagehide', () => { if (playing && !resetting) G.save(s); });
setInterval(() => { if (playing && !resetting && !document.hidden) G.save(s); }, 5000);

let last = performance.now(), sheetTick = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  if (playing) {
    G.update(s, dt);
    handleEvents();
    tickTimers(dt);
    comboT -= dt;
    keyPan(dt);
    updateHud();
    sheetTick += dt; if (sheetTick > 0.5) { sheetTick = 0; renderSheet(false); }
    audio.setNight(world.night);
  } else world.cam.yawT += dt * 0.06;
  world.update(s, dt);
  updateFloats(now);
  requestAnimationFrame(frame);
}

applyStyle(s.style);
world.frameIsland();
world.resize();
requestAnimationFrame(frame);
if (location.search.includes('debug')) window.__drift = { get s() { return s; }, G, world, setTool, applyStyle };
