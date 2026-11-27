import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { TILE_TYPES } from './tiles.mjs';
import { createGame, restoreGame, legalPlacements, placeTile, placeFollower, followerOptions, find, gid, remaining } from './game.mjs';
import { chooseMove } from './ai.mjs';
import { drawCard } from './art.js';
import { VIEWS } from './camera.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'tessera.save.v1';
const SETTINGS_KEY = 'tessera.settings.v1';
const COLORS = ['#e0453a', '#3d7fe6', '#f0c330', '#a05ee0', '#3b3f4a'];
const BOT_NAMES = ['Brann', 'Wren', 'Odile', 'Piet', 'Mabel', 'Ansel', 'Isolde', 'Corvin', 'Elske', 'Tamsin'];
const KIND_LABEL = { human: 'Person', easy: 'Easy bot', normal: 'Steady bot', hard: 'Cunning bot' };
const NOUN = { city: 'town', road: 'road', monastery: 'abbey', field: 'meadow' };
const VIEW_ORDER = ['tabletop', 'overhead', 'street', 'cinematic'];
const TIME_ORDER = ['day', 'golden', 'night', 'cycle'];
const TIME_LABEL = { day: 'Day', golden: 'Golden', night: 'Night', cycle: 'Cycle' };

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  drop(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } },
};

const settings = Object.assign({
  seats: [
    { name: 'You', color: COLORS[0], kind: 'human' },
    { name: 'Brann', color: COLORS[1], kind: 'normal' },
    { name: 'Wren', color: COLORS[2], kind: 'normal' },
  ],
  meadows: true, hints: true, pace: 0.55, time: 'day', sound: true, view: 'tabletop',
}, store.get(SETTINGS_KEY, {}));
const saveSettings = () => store.set(SETTINGS_KEY, settings);

const audio = createAudio();
let g = null;
let ui = 'title';
let pending = null;
let preferred = 0;
let byCell = new Map();
let options = [];
let shown = [];
let hovered = null;
let demoToken = 0;
// Online play: null at this screen, else { conn, state, round, noticeId, lost, code, name }.
let room = null;
let pumping = false;
const HOST_SAVE_KEY = 'tessera.host.v1';

const canvas = $('stage');
const world = createWorld(canvas, {
  onTap: (x, y) => tap(x, y),
  onHover: (x, y) => hover(x, y),
  onRightTap: () => { if (ui === 'place') rotate(1); },
});
window.tessera = { world, get game() { return g; }, get ui() { return ui; }, get room() { return room?.state || null; } };

// ------------------------------------------------------------------ helpers
const cellKey = (x, y) => `${x},${y}`;
const player = () => g.players[g.current];
const colors = () => g.players.map(p => p.color);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameTag = p => `<b style="color:${p.color}">${esc(p.name)}</b>`;

function regionsOf(root, tileList) {
  return tileList.map(t => ({
    tile: t,
    features: TILE_TYPES[g.tiles[t].type].features.map((_, f) => f).filter(f => find(g, gid(t, f)) === root),
  }));
}

let toastTimer = 0;
function toast(text, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function feed(html, color) {
  const list = $('feed');
  const li = document.createElement('li');
  li.innerHTML = html;
  if (color) li.style.setProperty('--c', color);
  list.append(li);
  while (list.children.length > 5) list.firstElementChild.remove();
  setTimeout(() => li.classList.add('old'), 9000);
  setTimeout(() => li.remove(), 10000);
}

// ------------------------------------------------------------------ HUD
function renderPlayers() {
  const box = $('players');
  box.hidden = !g;
  if (!g) return;
  box.innerHTML = '';
  g.players.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'seat' + (i === g.current && g.phase !== 'over' ? ' current' : '');
    el.style.setProperty('--seat', p.color);
    const stock = Array.from({ length: 7 }, (_, k) => `<i class="${k < p.followers ? '' : 'out'}"></i>`).join('');
    const seat = room?.state?.seats?.[i];
    let tag = p.kind === 'human' ? '' : `<small>${KIND_LABEL[p.level]?.replace(' bot', '') || 'Bot'}</small>`;
    if (seat?.kind === 'human') {
      if (seat.auto) tag = '<small>away · bot plays</small>';
      else if (!seat.connected) tag = '<small class="away">away</small>';
      else if (seat.pid === room.state.you) tag = '<small>you</small>';
    }
    const botThinking = room ? ui === 'remote' && seat && (seat.kind !== 'human' || seat.auto) : ui === 'bot';
    const thinking = botThinking && i === g.current && g.phase !== 'over' ? '<span class="thinking"> · thinking…</span>' : '';
    el.innerHTML = `<span class="chip"></span><span class="name">${esc(p.name)}${tag}${thinking}</span><span class="score" data-seat="${i}">${shown[i] ?? p.score}</span><span class="stock" aria-label="${p.followers} followers left">${stock}</span>`;
    box.append(el);
  });
}
function bumpScore(i, points) {
  shown[i] = (shown[i] ?? 0) + points;
  const el = document.querySelector(`.score[data-seat="${i}"]`);
  if (!el) return;
  el.textContent = shown[i];
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function showCard(flip = false) {
  const card = $('card');
  if (!g || g.tile < 0) return;
  drawCard(card, g.tile, pending ? pending.rot : preferred);
  card.style.setProperty('--seat', player().color);
  if (flip) { card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip'); }
  $('left').textContent = remaining(g);
  $('tile-name').textContent = TILE_TYPES[g.tile].name;
}

function setBar({ who, hint, mode }) {
  const bar = $('turnbar');
  bar.hidden = false;
  bar.classList.toggle('bot', mode === 'bot');
  bar.style.setProperty('--seat', g ? player().color : 'var(--gold)');
  if (who != null) $('who').innerHTML = who;
  if (hint != null) $('hint').innerHTML = hint;
  $('rot-left').hidden = $('rot-right').hidden = mode !== 'place';
  $('confirm').hidden = mode !== 'place' && mode !== 'over';
  $('skip').hidden = mode !== 'follower' && mode !== 'over' && mode !== 'away' && mode !== 'lost';
  $('confirm').innerHTML = mode === 'over' ? 'Results <span>↗</span>' : 'Place <span>✓</span>';
  const overLabel = !room ? 'New game' : room.state?.isHost ? 'Back to the table' : 'Leave the table';
  $('skip').textContent = { over: overLabel, away: 'Let a bot play for now', lost: 'Rejoin' }[mode] || 'No follower';
  $('confirm').disabled = mode === 'place' && !pending;
  $('card').parentElement.hidden = mode === 'over';
  $('tile-name').hidden = mode === 'over';
}

// ------------------------------------------------------------------ turns
async function beginTurn() {
  if (g.phase === 'over') return finish();
  const p = player();
  pending = null;
  preferred = 0;
  hovered = null;
  byCell = new Map();
  if (room) {
    showCard(true);
    if (!myTurn()) return waitRemote();
    if (g.phase === 'follower') return followerStep();
  }
  for (const m of legalPlacements(g)) {
    const k = cellKey(m.x, m.y);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(m.rot);
  }
  if (!room) showCard(true);
  if (p.kind !== 'human' && !room) return botTurn();
  ui = 'place';
  renderPlayers();
  if (settings.hints) world.showSlots([...byCell.keys()].map(k => k.split(',').map(Number)), p.color);
  const humans = g.players.filter(q => q.kind === 'human').length;
  if (room) { toast('Your turn'); audio.turn(); }
  else if (humans > 1) { toast(`${p.name}, your turn`); audio.turn(); }
  setBar({ who: esc(p.name), hint: 'Tap a glowing spot to lay this tile.', mode: 'place' });
}

function rotsAt(x, y) { return byCell.get(cellKey(x, y)) || []; }

function hover(px, py) {
  if (ui !== 'place' || pending) return;
  const cell = px < 0 ? null : world.pickCell(px, py);
  const key = cell && cellKey(...cell);
  if (key === hovered) return;
  hovered = key;
  if (!cell) { world.hideGhost(); world.hotSlot(null, null); canvas.classList.remove('pointing'); return; }
  const rots = rotsAt(...cell);
  if (rots.length) {
    const rot = rots.includes(preferred) ? preferred : rots[0];
    world.setGhost(g.tile, cell[0], cell[1], rot, { valid: true });
    world.hotSlot(...cell);
    canvas.classList.add('pointing');
  } else {
    world.hideGhost();
    world.hotSlot(null, null);
    canvas.classList.remove('pointing');
  }
}

function lock(x, y, rot) {
  pending = { x, y, rot };
  preferred = rot;
  world.setGhost(g.tile, x, y, rot, { valid: true, locked: true });
  world.hotSlot(x, y);
  showCard();
  $('confirm').disabled = false;
  const many = rotsAt(x, y).length > 1;
  setBar({ hint: many ? 'Turn it with ↻ (or tap it again), then press <b>Place</b>.' : 'It fits only this way. Press <b>Place</b> to lay it.', mode: 'place' });
  audio.rotate();
}

function tap(px, py) {
  if (ui === 'place') {
    const cell = world.pickCell(px, py);
    if (!cell) return;
    const rots = rotsAt(...cell);
    if (!rots.length) {
      if (g.board.has(cellKey(...cell))) return;
      toast('The tile does not fit there.');
      return;
    }
    if (pending && pending.x === cell[0] && pending.y === cell[1]) rotate(1);
    else lock(cell[0], cell[1], rots.includes(preferred) ? preferred : rots[0]);
  } else if (ui === 'follower') {
    const o = world.pickOption(px, py, options, g.last);
    if (o) commitFollower(o.feature);
  }
}

function rotate(dir) {
  if (ui !== 'place') return;
  if (pending) {
    const rots = rotsAt(pending.x, pending.y);
    if (rots.length < 2) { toast('It only fits one way here.', 1400); return; }
    const i = rots.indexOf(pending.rot);
    lock(pending.x, pending.y, rots[(i + dir + rots.length) % rots.length]);
  } else {
    preferred = (preferred + dir + 4) % 4;
    showCard();
    hovered = null;
    audio.rotate();
  }
}

async function confirmTile() {
  if (ui !== 'place' || !pending) return;
  ui = 'anim';
  const { x, y, rot } = pending;
  world.hideSlots();
  world.hideGhost();
  canvas.classList.remove('pointing');
  setBar({ hint: 'The land settles…', mode: 'wait' });
  const laid = layTile(x, y, rot);
  // The tile is already on the local board, so the host's echo finds nothing new.
  if (room) room.conn?.send('tile', { x, y, rot });
  await laid;
  followerStep();
}

function followerStep() {
  options = followerOptions(g);
  if (!options.length) {
    if (player().followers === 0) feed(`${nameTag(player())} has no followers left.`, player().color);
    return commitFollower(null, true);
  }
  ui = 'follower';
  world.showOptions(options, g.last, player().color);
  const list = options.map((o, i) => `<b>${i + 1}</b> ${NOUN[o.type]}`).join(' · ');
  setBar({ hint: `Send a follower? Tap a glowing figure: ${list}`, mode: 'follower' });
}

async function layTile(x, y, rot) {
  const tile = placeTile(g, x, y, rot);
  world.lookAtTile(x, y);
  const landed = world.addTile(tile);
  setTimeout(() => audio.land(), 420);
  await landed;
}

/** Place (or skip) the follower. Players reach this only while choosing; turns call it internally. */
async function commitFollower(feature, internal = false, remote = false) {
  if (!internal && ui !== 'follower') return;
  ui = 'anim';
  world.hideOptions();
  const placer = g.current, tileIndex = g.last;
  const events = placeFollower(g, feature);
  if (room && !remote) room.conn?.send('follower', { f: feature });
  if (feature != null) {
    const all = [...g.tiles[tileIndex].followers, ...events.flatMap(e => e.followers || [])];
    const f = all.find(x => x.tile === tileIndex && x.feature === feature && x.player === placer);
    audio.follower();
    if (f) await world.addFollower(f, g.players[placer].color);
  }
  renderPlayers();
  await playEvents(events);
  save();
  if (g.phase === 'over') return finish();
  beginTurn();
}

async function botTurn() {
  ui = 'bot';
  renderPlayers();
  const p = player();
  setBar({ who: esc(p.name), hint: 'Thinking…', mode: 'bot' });
  await world.wait(0.25 + settings.pace * 0.6);
  const move = chooseMove(g, p.level);
  world.lookAtTile(move.x, move.y);
  world.setGhost(g.tile, move.x, move.y, (move.rot + 3) % 4, { valid: true, snap: true });
  await world.wait(0.15 + settings.pace * 0.4);
  world.setGhost(g.tile, move.x, move.y, move.rot, { valid: true, locked: true });
  pending = move;
  showCard();
  await world.wait(0.2 + settings.pace * 0.6);
  world.hideGhost();
  pending = null;
  setBar({ hint: move.feature != null ? 'Sending a follower…' : 'Laying a tile…', mode: 'bot' });
  await layTile(move.x, move.y, move.rot);
  if (move.feature != null) await world.wait(0.1 + settings.pace * 0.35);
  await commitFollower(move.feature, true);
}

async function playEvents(events) {
  const cols = colors();
  for (const e of events) {
    if (e.kind === 'discard') {
      const name = TILE_TYPES[e.type].name.toLowerCase();
      toast(e.back ? `No place for the ${name} yet — it goes back under the bag.` : `No place for the ${name} — it is set aside.`, 2600);
      audio.discard();
      await world.wait(0.8);
    } else if (e.kind === 'score') {
      const regions = regionsOf(e.root, e.tiles);
      const winners = e.winners.map(w => g.players[w]);
      const noun = NOUN[e.feature];
      if (e.final) {
        world.celebrate(e, regions, cols);
        winners.forEach(w => bumpScore(w.id, e.points));
        feed(`${winners.map(nameTag).join(' & ')} · ${e.feature === 'field' ? 'meadow' : `unfinished ${noun}`} · <b>+${e.points}</b>`, winners[0]?.color);
        audio.score(e.points, e.feature);
        await world.wait(0.55);
        continue;
      }
      const verb = e.feature === 'monastery' ? 'completed an abbey' : `finished a ${noun}`;
      const who = winners.map(nameTag).join(' & ');
      if (winners.length > 1) feed(`${who} share a ${noun} · <b>+${e.points}</b> each`, winners[0].color);
      else if (winners.length) feed(`${who} ${verb} · <b>+${e.points}</b>`, winners[0].color);
      else feed(`A${noun === 'abbey' ? 'n' : ''} ${noun} is finished, but no one claimed it.`);
      winners.length ? audio.score(e.points, e.feature) : audio.quiet();
      const done = world.celebrate(e, regions, cols);
      setTimeout(() => winners.forEach(w => bumpScore(w.id, e.points)), 500);
      await done;
      renderPlayers();
    }
  }
}

function finish() {
  ui = 'over';
  world.hideSlots(); world.hideGhost(); world.hideOptions();
  shown = g.players.map(p => p.score);
  renderPlayers();
  if (!room) store.drop(SAVE_KEY);
  $('again').textContent = !room ? 'Play again' : room.state?.isHost ? 'Back to the table' : 'Leave the table';
  const best = Math.max(...g.players.map(p => p.score));
  const champs = g.players.filter(p => p.score === best);
  const title = champs.length > 1 ? `A shared crown: ${champs.map(p => esc(p.name)).join(' & ')}` : `${esc(champs[0].name)} rules the kingdom!`;
  $('final-title').innerHTML = title;
  const rows = g.players.slice().sort((a, b) => b.score - a.score).map(p => `<tr class="${p.score === best ? 'winner' : ''}" style="--seat:${p.color}">
    <td><span class="who-cell"><span class="dot"></span>${esc(p.name)}</span></td>
    <td>${p.tally.city}</td><td>${p.tally.road}</td><td>${p.tally.monastery}</td><td>${p.tally.field}</td><td class="total">${p.score}</td></tr>`).join('');
  $('final-table').innerHTML = `<tr><th>Player</th><th>Towns</th><th>Roads</th><th>Abbeys</th><th>Meadows</th><th>Total</th></tr>${rows}`;
  setBar({ who: title, hint: 'Look around the kingdom you built together.', mode: 'over' });
  audio.fanfare();
  const b = world.bounds;
  for (let i = 0; i < 5; i++) setTimeout(() => world.burst((b.minX + b.maxX) / 2 + (Math.random() - 0.5) * 3, 1.2, (b.minZ + b.maxZ) / 2 + (Math.random() - 0.5) * 3, { n: 60, colors: champs.map(p => p.color).concat('#fff3c4', '#ffffff'), speed: 2, up: 2.2, gravity: 2.2, size: 0.03, life: 2.4, spread: 0.3 }), i * 350);
  setTimeout(() => { if (ui === 'over') $('final').showModal(); }, 1600);
}

// ------------------------------------------------------------------ setup
function save() {
  if (!g || g.phase === 'over' || room) return;
  store.set(SAVE_KEY, {
    options: { players: g.players.map(({ name, color, kind, level }) => ({ name, color, kind, level })), seed: g.seed, meadows: g.meadows, even: g.even },
    actions: g.actions,
  });
}

function seatKind(seat) { return seat.kind === 'human' ? 'human' : seat.kind; }
function renderSeats() {
  const box = $('seats');
  box.innerHTML = '';
  settings.seats.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'seat-row';
    row.style.setProperty('--seat', s.color);
    row.innerHTML = `<button class="swatch" aria-label="Change colour for seat ${i + 1}" title="Change colour"></button>
      <input value="${esc(s.name)}" maxlength="14" aria-label="Name for seat ${i + 1}">
      <select aria-label="Who plays seat ${i + 1}">${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}" ${seatKind(s) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="remove" aria-label="Remove seat ${i + 1}" ${settings.seats.length <= 2 ? 'disabled' : ''}>×</button>`;
    row.querySelector('.swatch').onclick = () => {
      const used = new Set(settings.seats.map(x => x.color));
      let k = COLORS.indexOf(s.color);
      for (let n = 0; n < COLORS.length; n++) { k = (k + 1) % COLORS.length; if (!used.has(COLORS[k])) break; }
      s.color = COLORS[k];
      renderSeats(); saveSettings();
    };
    row.querySelector('input').oninput = e => { s.name = e.target.value.trim() || `Player ${i + 1}`; saveSettings(); };
    row.querySelector('select').onchange = e => {
      s.kind = e.target.value;
      if (s.kind !== 'human' && /^(You|Player \d)$/.test(s.name)) s.name = BOT_NAMES.find(n => !settings.seats.some(x => x.name === n)) || s.name;
      renderSeats(); saveSettings();
    };
    row.querySelector('.remove').onclick = () => { settings.seats.splice(i, 1); renderSeats(); saveSettings(); };
    box.append(row);
  });
  $('add-seat').hidden = settings.seats.length >= 5;
}
$('add-seat').onclick = () => {
  if (settings.seats.length >= 5) return;
  const color = COLORS.find(c => !settings.seats.some(s => s.color === c));
  const name = BOT_NAMES.find(n => !settings.seats.some(s => s.name === n));
  settings.seats.push({ name, color, kind: 'normal' });
  renderSeats(); saveSettings();
};
$('opt-meadows').checked = settings.meadows;
$('opt-hints').checked = settings.hints;
$('opt-pace').value = String(settings.pace);
$('opt-meadows').onchange = e => { settings.meadows = e.target.checked; saveSettings(); };
$('opt-hints').onchange = e => { settings.hints = e.target.checked; saveSettings(); };
$('opt-pace').onchange = e => { settings.pace = Number(e.target.value); saveSettings(); };

function toPlayers(seats) {
  return seats.map(s => ({ name: s.name, color: s.color, kind: s.kind === 'human' ? 'human' : 'bot', level: s.kind === 'human' ? 'normal' : s.kind }));
}

async function startGame(fromSave) {
  demoToken++;
  $('setup').close();
  $('final').close();
  world.reset();
  if (fromSave) {
    try {
      g = restoreGame(fromSave.options, fromSave.actions);
    } catch (err) {
      console.warn('Saved game could not be restored', err);
      store.drop(SAVE_KEY);
      return showSetup();
    }
    rebuildWorld();
  } else {
    // Seats are dealt into a random turn order for every new game.
    const players = toPlayers(settings.seats);
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
    g = createGame({ players, meadows: settings.meadows, even: true });
    world.addTile(g.tiles[0], { animate: true, delay: 0.2 });
    save();
    announceOrder();
  }
  shown = g.players.map(p => p.score);
  world.rig.setView(settings.view === 'cinematic' ? 'tabletop' : settings.view);
  if (!fromSave) world.rig.focus(0, 0, innerWidth < innerHeight ? 9 : 5.5);
  updateViewLabel();
  renderPlayers();
  if (!fromSave) await world.wait(1);
  beginTurn();
}

/** Say who plays first and how many tiles everyone will lay. */
function announceOrder() {
  feed(`Turn order: ${g.players.map(nameTag).join(' → ')}`, g.players[0].color);
  if (g.even) {
    const each = Math.round(remaining(g) / g.players.length);
    feed(`${each} tiles each${g.setAside ? ` · ${g.setAside} left in the box so everyone gets the same number of turns` : ''}`);
  }
  toast(`${g.players[0].name} goes first`, 2600);
}

/** Put the whole current kingdom on the table at once (resume, late join, resync). */
function rebuildWorld() {
  world.reset();
  for (const t of g.tiles) world.addTile(t, { animate: false });
  for (const t of g.tiles) for (const f of t.followers) world.addFollower(f, g.players[f.player].color, { animate: false });
  for (const [root, info] of g.info) {
    if (info.type === 'city' && info.done) world.flagTown(regionsOf(root, [...info.tiles]), (info.winners || []).map(w => g.players[w].color));
  }
}

function showSetup() {
  ui = 'title';
  g = null;
  $('turnbar').hidden = true;
  renderPlayers();
  renderSeats();
  $('resume').hidden = !store.get(SAVE_KEY, null);
  const invited = renderOnlineSetup();
  $('setup').show();
  if (invited) requestAnimationFrame(() => { $('net-status').scrollIntoView({ block: 'end' }); if (!$('net-name').value) $('net-name').focus({ preventScroll: true }); });
  demo();
}

/** The title screen backdrop: a small kingdom laid by bots, rising tile by tile. */
async function demo() {
  const token = ++demoToken;
  world.reset();
  const d = createGame({ players: [0, 1, 2].map(i => ({ name: `d${i}`, color: COLORS[i], kind: 'bot', level: 'easy' })), seed: (Math.random() * 1e9) >>> 0 });
  const turns = matchMedia('(max-width: 680px)').matches ? 16 : 26;
  for (let i = 0; i < turns && d.phase !== 'over'; i++) {
    const m = chooseMove(d, 'easy');
    placeTile(d, m.x, m.y, m.rot);
    placeFollower(d, m.feature);
  }
  const b = d.tiles.reduce((acc, t) => ({ x: acc.x + t.x / d.tiles.length, z: acc.z + t.y / d.tiles.length }), { x: 0, z: 0 });
  world.rig.focus(b.x, b.z, 6.5);
  world.rig.setView('cinematic');
  world.rig.focus(b.x + (innerWidth > 680 ? -1.2 : 0), b.z, 6.5);
  updateViewLabel();
  d.tiles.forEach((t, i) => world.addTile(t, { animate: true, delay: 0.4 + i * 0.12 }));
  await world.wait(0.4 + d.tiles.length * 0.12 + 1.2);
  if (token !== demoToken) return;
  for (const t of d.tiles) for (const f of t.followers) world.addFollower(f, COLORS[f.player], { animate: true });
  for (const [root, info] of d.info) {
    if (info.type !== 'city' || !info.done) continue;
    const regions = [...info.tiles].map(t => ({ tile: t, features: TILE_TYPES[d.tiles[t].type].features.map((_, f) => f).filter(f => find(d, gid(t, f)) === root) }));
    world.flagTown(regions, (info.winners || []).map(w => COLORS[w]), 0.5);
  }
}

// ------------------------------------------------------------------ online
// Every browser at an online table (the host's included) follows the host's
// action list: its own moves are laid at once and sent; everyone else's are
// replayed here, with the same animations, as they arrive.
const seatAt = i => room?.state?.seats?.[i];
function myTurn() {
  const seat = seatAt(g.current);
  return Boolean(seat && seat.kind === 'human' && !seat.auto && seat.pid === room.state.you);
}
const sameAction = (a, b) => a.a === b.a && (a.a === 'tile' ? a.x === b.x && a.y === b.y && a.rot === b.rot : (a.f ?? null) === (b.f ?? null));
const isPrefix = (a, b) => a.length <= b.length && a.every((x, i) => sameAction(x, b[i]));

function waitRemote() {
  if (room.lost) return showLost();
  ui = 'remote';
  world.hideSlots();
  world.hideGhost();
  renderPlayers();
  const seat = seatAt(g.current);
  const p = player();
  let hint, mode = 'bot';
  if (!seat || seat.kind !== 'human') hint = 'Thinking…';
  else if (seat.auto) hint = 'Away. A bot is playing for them.';
  else if (!seat.connected) {
    hint = 'has left the table. Waiting for them to come back…';
    if (room.state.isHost) { hint += ' Or let a bot play their turns.'; mode = 'away'; }
  } else hint = g.phase === 'follower' ? 'Deciding where to send a follower…' : 'Choosing where to lay this tile…';
  setBar({ who: esc(p.name), hint, mode });
  pump();
}

function showLost() {
  ui = 'lost';
  world.hideSlots(); world.hideGhost(); world.hideOptions();
  setBar({ who: 'Lost touch with the table', hint: 'The host’s connection dropped. Rejoin once they are back.', mode: 'lost' });
}

/** Replay the host's actions that this board has not seen yet, one at a time. */
async function pump() {
  if (!room || pumping || !g) return;
  pumping = true;
  try {
    while (room?.state && g && room.round === room.state.round && ui === 'remote') {
      const theirs = room.state.actions, mine = g.actions;
      if (mine.length >= theirs.length) {
        if (!isPrefix(theirs, mine)) resync();
        break;
      }
      if (!isPrefix(mine, theirs)) { resync(); break; }
      const a = theirs[mine.length];
      if (a.a === 'tile') {
        ui = 'anim';
        world.hideSlots(); world.hideGhost();
        await layTile(a.x, a.y, a.rot);
        renderPlayers();
        if (room && g.phase === 'follower') waitRemote();
      } else {
        await commitFollower(a.f ?? null, true, true);
      }
    }
  } catch (err) {
    console.warn('Tessera: could not follow the host, rebuilding the board', err);
    resync();
  } finally {
    pumping = false;
  }
}

/** Throw away the local board and rebuild it from the host's record. */
function resync() {
  const s = room?.state;
  if (!s?.game) return;
  g = restoreGame(s.game, s.actions);
  world.hideSlots(); world.hideGhost(); world.hideOptions();
  rebuildWorld();
  shown = g.players.map(q => q.score);
  renderPlayers();
  ui = 'anim';
  setTimeout(beginTurn, 0);
}

async function startOnline(s) {
  demoToken++;
  for (const id of ['setup', 'lobby', 'final', 'menu']) if ($(id).open) $(id).close();
  world.reset();
  world.hideSlots(); world.hideGhost(); world.hideOptions();
  room.round = s.round;
  ui = 'anim';
  if (s.actions.length) {
    g = restoreGame(s.game, s.actions);
    rebuildWorld();
  } else {
    g = createGame(s.game);
    world.addTile(g.tiles[0], { animate: true, delay: 0.2 });
    announceOrder();
  }
  shown = g.players.map(p => p.score);
  world.rig.setView(settings.view === 'cinematic' ? 'tabletop' : settings.view);
  const last = g.tiles[g.last >= 0 ? g.last : 0];
  world.rig.focus(last.x, last.y, innerWidth < innerHeight ? 9 : 5.5);
  updateViewLabel();
  renderPlayers();
  if (settings.sound) toggleSound(true);
  if (!s.actions.length) await world.wait(1);
  if (room?.round === s.round && g) beginTurn();
}

function onNetState(s) {
  if (!room || !s) return;
  const before = room.state;
  room.state = s;
  room.lost = false;
  if (s.notice && s.notice.id !== room.noticeId) {
    room.noticeId = s.notice.id;
    toast(s.notice.text, 2800);
    // The host turned down a move this board already made: take the host's word.
    if (g && s.game && g.actions.length > s.actions.length) resync();
  }
  if (s.phase === 'lobby') {
    if (!s.isHost && !s.seats.some(x => x.pid === s.you)) {
      toast('The host gave your seat away.', 3200);
      leaveRoom().then(showSetup);
      return;
    }
    if (ui !== 'lobby') enterLobby();
    renderLobby();
    return;
  }
  if (!s.game) return;
  if (!g || room.round !== s.round) { startOnline(s); return; }
  renderPlayers();
  if (ui === 'remote') {
    // Refresh "away" notes and host buttons without disturbing a replay in progress.
    if (!pumping) waitRemote();
  } else if (ui === 'lost') beginTurn();
  else if (ui === 'place' && before && !myTurn()) resync();
}

function onNetStatus({ text, error }) {
  if (!room) return;
  if (text === 'host gone') {
    room.lost = true;
    if (ui === 'lobby') renderLobby();
    else if (g && ui !== 'over') showLost();
    else toast('Lost touch with the host.', 3000);
    return;
  }
  if (error) {
    if (!room.state) {
      // Turned away before sitting down (full table, game already running…).
      const r = room;
      room = null;
      r.conn?.leave().catch(() => {});
      if ($('lobby').open) $('lobby').close();
      showSetup();
      setNetStatus(text, true);
    } else toast(text, 3000);
  }
}

function enterLobby() {
  ui = 'lobby';
  g = null;
  for (const id of ['setup', 'final', 'menu']) if ($(id).open) $(id).close();
  $('turnbar').hidden = true;
  renderPlayers();
  if (!$('lobby').open) $('lobby').show();
  demo();
}

function renderLobby() {
  const s = room?.state;
  $('lobby-code').textContent = room?.code || '·····';
  $('lobby-link').hidden = !room?.code;
  const box = $('lobby-seats');
  box.innerHTML = '';
  if (!s) {
    $('lobby-status').textContent = room?.lost ? 'Could not reach the table.' : 'Knocking on the door…';
    $('lobby-host').hidden = true;
    $('lobby-start').hidden = true;
    $('lobby-rejoin').hidden = !room?.lost;
    return;
  }
  s.seats.forEach((seat, i) => {
    const row = document.createElement('div');
    row.className = 'seat-row';
    row.style.setProperty('--seat', seat.color);
    const mine = seat.kind === 'human' && seat.pid === s.you;
    const tag = seat.kind === 'human'
      ? `<span class="tag">${[seat.pid === 'host' ? 'Host' : 'Person', mine ? 'you' : '', seat.connected ? '' : 'away'].filter(Boolean).join(' · ')}</span>`
      : s.isHost
        ? `<select aria-label="Bot level for ${esc(seat.name)}">${['easy', 'normal', 'hard'].map(k => `<option value="${k}" ${seat.kind === k ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}</select>`
        : `<span class="tag">${KIND_LABEL[seat.kind]}</span>`;
    const removable = s.isHost && seat.pid !== 'host';
    row.innerHTML = `<button class="swatch" ${mine ? '' : 'disabled'} aria-label="${mine ? 'Change your colour' : `${esc(seat.name)}’s colour`}" title="${mine ? 'Change colour' : ''}"></button>
      <span class="seat-name">${esc(seat.name)}</span>${tag}
      <button class="remove" ${removable ? '' : 'hidden'} aria-label="Remove ${esc(seat.name)}">×</button>`;
    if (mine) row.querySelector('.swatch').onclick = () => room.conn?.send('color');
    const level = row.querySelector('select');
    if (level) level.onchange = e => room.conn?.send('botLevel', { seat: i, level: e.target.value });
    if (removable) row.querySelector('.remove').onclick = () => room.conn?.send('removeSeat', { seat: i });
    box.append(row);
  });
  $('lobby-host').hidden = !s.isHost;
  $('lobby-start').hidden = !s.isHost;
  $('lobby-start').disabled = s.seats.length < 2;
  $('lobby-add').disabled = s.seats.length >= 5;
  $('lobby-meadows').checked = s.meadows;
  $('lobby-pace').value = String(s.pace);
  $('lobby-rejoin').hidden = !room.lost;
  const people = s.seats.filter(x => x.kind === 'human').length;
  $('lobby-status').textContent = room.lost
    ? 'Lost touch with the host.'
    : s.isHost
      ? (s.seats.length < 2 ? 'Share the code, or add a bot, to fill a second seat.' : `${s.seats.length} seats · ${people} ${people === 1 ? 'person' : 'people'}. Begin when everyone is here.`)
      : `Waiting for the host to begin · ${s.meadows ? 'meadow farmers on' : 'no meadow farmers'}`;
}

function setNetStatus(text, error = false) {
  $('net-status').textContent = text || '';
  $('net-status').classList.toggle('bad', error);
}

function renderOnlineSetup() {
  const saved = store.get(HOST_SAVE_KEY, null);
  $('net-resume').hidden = !saved?.roomCode;
  if (saved?.roomCode) $('net-resume').textContent = `Reopen your table ${saved.roomCode}`;
  $('net-name').value = settings.netName || '';
  const code = new URLSearchParams(location.search).get('room');
  if (code && !$('net-code').value) {
    $('net-code').value = code.toUpperCase().slice(0, 5);
    setNetStatus(`You’re invited to table ${$('net-code').value}. Write your name and press Join.`);
  }
  return Boolean(code);
}

function netName() {
  const name = $('net-name').value.trim();
  if (!name) { setNetStatus('Write your name first.', true); $('net-name').focus(); return null; }
  settings.netName = name;
  saveSettings();
  return name;
}

async function loadNet() {
  try {
    return await import('./net.js');
  } catch (err) {
    console.warn('Tessera: online play unavailable', err);
    setNetStatus('Online play is not available on this copy of the site.', true);
    return null;
  }
}

async function openTable({ role, code, resume = false }) {
  const name = netName();
  if (!name) return;
  if (role === 'guest' && !/^[A-Z0-9]{5}$/.test(code)) { setNetStatus('Table codes are five letters and numbers.', true); return; }
  if (settings.sound) toggleSound(true);
  setNetStatus(role === 'host' ? 'Opening a table…' : 'Looking for the table…');
  const net = await loadNet();
  if (!net) return;
  const me = { conn: null, state: null, round: -1, noticeId: 0, lost: false, code: role === 'guest' ? code : '', name, role };
  room = me;
  try {
    const opts = { name, onState: s => { if (room === me) onNetState(s); }, onStatus: st => { if (room === me) onNetStatus(st); } };
    me.conn = role === 'host' ? await net.host({ ...opts, resume }) : await net.join({ ...opts, code });
  } catch (err) {
    if (room === me) room = null;
    setNetStatus(err.message || String(err), true);
    return;
  }
  if (room !== me) { me.conn.leave().catch(() => {}); return; }
  me.code = me.conn.code;
  setNetStatus('');
  const url = new URL(location.href);
  url.searchParams.set('room', me.code);
  history.replaceState(null, '', url);
  if (ui !== 'lobby' && !g) enterLobby();
  renderLobby();
}

async function leaveRoom() {
  const r = room;
  room = null;
  pumping = false;
  if (r?.conn) await r.conn.leave().catch(err => console.warn('leave', err));
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
  if ($('lobby').open) $('lobby').close();
}

async function rejoin() {
  if (!room || room.role !== 'guest' || room.rejoining) return;
  const old = room;
  old.rejoining = true;
  const keep = { g, round: old.round };
  await old.conn?.leave().catch(() => {});
  old.conn = null;
  room = null;
  $('net-name').value = old.name;
  await openTable({ role: 'guest', code: old.code });
  if (!room) {
    // Still no host: stay at the table so the player can try again.
    room = old;
    old.rejoining = false;
    toast($('net-status').textContent || 'Could not reach the table.', 3200);
    if (keep.g && ui !== 'over') showLost(); else renderLobby();
    return;
  }
  // Carry on from the same board; onNetState picks the game up from 'lost'
  // once the host answers, and the host's record decides what is missing.
  if (keep.g && !room.state) {
    g = keep.g;
    room.round = keep.round;
    ui = 'lost';
    setBar({ who: 'Rejoining…', hint: 'Catching up with the table.', mode: 'wait' });
  }
}

function playAgain() {
  if (!room) return showSetup();
  if (room.state?.isHost) room.conn?.send('lobby');
  else leaveRoom().then(showSetup);
}

$('net-host').onclick = () => openTable({ role: 'host' });
$('net-resume').onclick = () => openTable({ role: 'host', resume: true });
$('net-join').onclick = () => openTable({ role: 'guest', code: $('net-code').value.trim().toUpperCase() });
$('net-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('net-join').click(); });
$('net-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('lobby-add').onclick = () => room?.conn?.send('addBot', { level: $('lobby-level').value });
$('lobby-meadows').onchange = e => room?.conn?.send('options', { meadows: e.target.checked });
$('lobby-pace').onchange = e => room?.conn?.send('options', { pace: Number(e.target.value) });
$('lobby-start').onclick = () => room?.conn?.send('start');
$('lobby-rejoin').onclick = () => rejoin();
$('lobby-leave').onclick = async () => { await leaveRoom(); showSetup(); };
$('lobby-link').onclick = async () => {
  const link = `${location.origin}${location.pathname}?room=${room?.code}`;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Tessera', text: `Join my Tessera table: ${room?.code}`, url: link });
    else { await navigator.clipboard.writeText(link); toast('Invite link copied.'); }
  } catch { toast(link, 5000); }
};

// ------------------------------------------------------------------ controls
function updateViewLabel() {
  const v = world.rig.view;
  $('view-label').textContent = VIEWS[v]?.label || 'Free';
}
function cycleView() {
  const i = VIEW_ORDER.indexOf(world.rig.view);
  const next = VIEW_ORDER[(i + 1) % VIEW_ORDER.length];
  world.rig.setView(next);
  if (next === 'street' && g) {
    const t = g.tiles[g.last >= 0 ? g.last : 0];
    world.rig.focus(t.x, t.y);
  }
  if (ui !== 'title') { settings.view = next; saveSettings(); }
  updateViewLabel();
}
function cycleTime() {
  settings.time = TIME_ORDER[(TIME_ORDER.indexOf(settings.time) + 1) % TIME_ORDER.length];
  applyTime();
  saveSettings();
}
function applyTime() {
  world.setTime(settings.time);
  $('time-label').textContent = TIME_LABEL[settings.time];
  audio.setNight(settings.time === 'night' ? 1 : 0);
}
async function toggleSound(on = !audio.enabled) {
  settings.sound = on;
  saveSettings();
  await audio.setEnabled(on);
  $('sound').setAttribute('aria-pressed', String(on));
  $('sound').setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
}

$('view').onclick = cycleView;
$('turn-left').onclick = () => world.rig.turnBy(Math.PI / 4);
$('turn-right').onclick = () => world.rig.turnBy(-Math.PI / 4);
$('time').onclick = cycleTime;
$('sound').onclick = () => toggleSound();
$('rot-left').onclick = () => rotate(-1);
$('rot-right').onclick = () => rotate(1);
$('confirm').onclick = () => { if (ui === 'over') $('final').showModal(); else confirmTile(); };
$('skip').onclick = () => {
  if (ui === 'over') { $('final').close(); playAgain(); }
  else if (ui === 'follower') commitFollower(null);
  else if (ui === 'lost') rejoin();
  else if (ui === 'remote' && room?.state?.isHost) room.conn?.send('auto', { seat: g.current, on: true });
};
$('start').onclick = () => { if (settings.sound) toggleSound(true); startGame(null); };
$('resume').onclick = () => { if (settings.sound) toggleSound(true); startGame(store.get(SAVE_KEY, null)); };
$('menu-open').onclick = () => $('menu').showModal();
$('menu-close').onclick = () => $('menu').close();
$('menu-new').onclick = async () => { $('menu').close(); if (room) await leaveRoom(); showSetup(); };
$('admire').onclick = () => { $('final').close(); world.rig.setView('cinematic'); updateViewLabel(); };
$('again').onclick = () => { $('final').close(); playAgain(); };
$('menu-open').addEventListener('click', () => { $('menu-new').textContent = room ? 'Leave the table' : 'Start a new game'; });

addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (document.querySelector('dialog[open]:modal')) return;
  const k = e.key.toLowerCase();
  if (k === 'r') { rotate(e.shiftKey ? -1 : 1); e.preventDefault(); }
  else if (k === 'enter' || k === ' ') {
    if (ui === 'place' && pending) { confirmTile(); e.preventDefault(); }
    else if (ui === 'follower') { commitFollower(null); e.preventDefault(); }
  } else if (ui === 'follower' && /^[1-9]$/.test(k) && options[Number(k) - 1]) commitFollower(options[Number(k) - 1].feature);
  else if (k === 'v') cycleView();
  else if (k === 't') cycleTime();
  else if (k === 'm') toggleSound();
  else if (k === 'f' && g) { const t = g.tiles[g.last >= 0 ? g.last : 0]; world.rig.focus(t.x, t.y); }
  else if (k === 'escape') {
    if (ui === 'place' && pending) { pending = null; world.hideGhost(); hovered = null; setBar({ hint: 'Tap a glowing spot to lay this tile.', mode: 'place' }); }
    else if (ui !== 'title' && ui !== 'lobby') $('menu').showModal();
  }
});
world.onFrame(() => {
  const v = world.rig.view;
  if ($('view-label').dataset.v !== v) { $('view-label').dataset.v = v; updateViewLabel(); }
});
document.addEventListener('visibilitychange', () => audio.suspend(document.hidden));

// ------------------------------------------------------------------ boot
applyTime();
$('sound').setAttribute('aria-pressed', String(settings.sound));
$('loading').hidden = true;
const saved = store.get(SAVE_KEY, null);
showSetup();
if (saved) $('resume').hidden = false;
