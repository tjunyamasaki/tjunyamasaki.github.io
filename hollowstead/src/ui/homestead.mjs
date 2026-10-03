// Homestead dock (the build & farm toolbar) and its pointer painting.
// Pick a tool, then tap or drag across the ground: every cell the finger or mouse passes is
// worked, so a fence line or a field of soil is one stroke. The tool stays in hand until you
// put it away (✕, Esc or a right click). With no tool out, tapping a gate opens it and tapping a
// ripe crop harvests it.
import {BARRIERS, CELL, CROPS, CROP_TYPES, GROUNDS, OBJECT_TYPES, TOOLS, barrierAt, cellAt, cellLine, cellReason, ripe, sizeOf, tileAt} from '../homestead.mjs?v=harvest-18';
import {STRUCTURES, dayOf, phaseOf} from '../content.mjs?v=harvest-18';
import {bloom, toNight} from '../nightbloom.mjs?v=harvest-18';

const ink = '#2b2233';
const svg = body => `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
export const GLYPHS = Object.freeze({
  till: svg('<path d="M7 27 L22 8" stroke-width="3.4"/><path d="M7 27 L22 8" stroke="#b88a62" stroke-width="1.6"/><path d="M18 6 L27 7 L26 13 Z" fill="#9aa0b4"/>'),
  plank: svg('<rect x="4" y="6" width="24" height="6" rx="1.5" fill="#a3734c"/><rect x="4" y="13" width="24" height="6" rx="1.5" fill="#8d603f"/><rect x="4" y="20" width="24" height="6" rx="1.5" fill="#9a6b47"/><path d="M14 6v6M22 13v6M10 20v6" stroke-width="1.6"/>'),
  flagstone: svg('<rect x="4" y="5" width="11" height="10" rx="3" fill="#9a95aa"/><rect x="17" y="5" width="11" height="10" rx="3" fill="#857f94"/><rect x="4" y="17" width="14" height="10" rx="3" fill="#8f8a9e"/><rect x="20" y="17" width="8" height="10" rx="3" fill="#a29db2"/>'),
  boards: svg('<rect x="4" y="4" width="8" height="24" rx="1.5" fill="#87553a"/><rect x="12" y="4" width="8" height="24" rx="1.5" fill="#7b4b33"/><rect x="20" y="4" width="8" height="24" rx="1.5" fill="#6f4330"/><path d="M4 17 H12 M12 11 H20 M20 21 H28" stroke-width="2"/><circle cx="8" cy="14" r="1.4" fill="#d9c09a" stroke="none"/><circle cx="16" cy="8" r="1.4" fill="#d9c09a" stroke="none"/><circle cx="24" cy="18" r="1.4" fill="#d9c09a" stroke="none"/>'),
  roughplank: svg('<path d="M6 5 H27 V12 H4 Z" fill="#ab8f6d"/><path d="M3 12 H25 V19 H7 Z" fill="#93785a"/><path d="M5 19 H29 V27 H2 Z" fill="#a08463"/><path d="M14 5v7 M19 12v7 M11 19v8" stroke-width="1.8"/>'),
  slabs: svg('<rect x="2" y="3" width="28" height="26" rx="3" fill="#4f4a5c" stroke="none"/><rect x="3.5" y="4.5" width="14" height="11" rx="2.5" fill="#a19cb3"/><rect x="18.5" y="4.5" width="10" height="11" rx="2.5" fill="#8a869d"/><rect x="3.5" y="16.5" width="10" height="11" rx="2.5" fill="#928ea6"/><rect x="14.5" y="16.5" width="14" height="11" rx="2.5" fill="#aca8bd"/><path d="M7 9 L10 11 L13 10" stroke-width="1.6"/>'),
  cobble: svg('<rect x="2" y="3" width="28" height="26" rx="4" fill="#3d3946" stroke="none"/><ellipse cx="9" cy="9" rx="6" ry="5" fill="#9b97ad"/><ellipse cx="22" cy="9" rx="6" ry="5" fill="#837f95"/><ellipse cx="15.5" cy="17" rx="6" ry="5" fill="#a5a1b6"/><ellipse cx="5" cy="17" rx="3.5" ry="5" fill="#8e8aa0"/><ellipse cx="27" cy="17" rx="3.5" ry="5" fill="#8e8aa0"/><ellipse cx="9" cy="25" rx="6" ry="4" fill="#8e8aa0"/><ellipse cx="22" cy="25" rx="6" ry="4" fill="#9b97ad"/>'),
  fieldstone: svg('<path d="M4 6 L14 4 L16 13 L6 15 Z" fill="#a8a08a"/><path d="M18 5 L28 8 L26 15 L17 14 Z" fill="#8d8672"/><path d="M5 18 L15 16 L17 27 L7 28 Z" fill="#9b947f"/><path d="M19 17 L27 18 L28 27 L20 26 Z" fill="#b1aa95"/>'),
  fence: svg('<path d="M3 13 H29 M3 21 H29" stroke-width="4.6"/><path d="M3 13 H29 M3 21 H29" stroke="#8a5a3c" stroke-width="2"/><path d="M9 28 V8 L11 5 L13 8 V28 Z M19 28 V8 L21 5 L23 8 V28 Z" fill="#6e4630"/>'),
  wall: svg('<path d="M4 28 V10 L6.5 5 L9 10 V28 Z M10 28 V8 L12.5 3 L15 8 V28 Z M16 28 V9 L18.5 4 L21 9 V28 Z M22 28 V10 L24.5 5 L27 10 V28 Z" fill="#7d5238"/><path d="M4 14 H27 M4 22 H27" stroke-width="1.6"/>'),
  stonewall: svg('<rect x="3" y="7" width="26" height="20" rx="2" fill="#9a95ab"/><path d="M3 14 H29 M3 21 H29 M11 7v7 M21 7v7 M16 14v7 M8 21v6 M24 21v6" stroke-width="1.8"/><rect x="2" y="4" width="28" height="4" rx="1.5" fill="#b7b2c6"/>'),
  timberwall: svg('<rect x="4" y="5" width="6.4" height="23" rx="1" fill="#9a6b47"/><rect x="10.4" y="5" width="6.4" height="23" rx="1" fill="#8a5a3c"/><rect x="16.8" y="5" width="6.4" height="23" rx="1" fill="#a3734c"/><rect x="23.2" y="5" width="5" height="23" rx="1" fill="#8a5a3c"/><rect x="2" y="3" width="28" height="4.5" rx="1.5" fill="#6e4630"/><path d="M4 18 H28" stroke="#c99a68" stroke-width="2.4"/>'),
  masonwall: svg('<rect x="3" y="7" width="26" height="21" rx="2" fill="#9a95ab"/><path d="M3 14 H29 M3 21 H29 M13 7v7 M22 14v7 M10 21v7 M20 21v7" stroke-width="2"/><rect x="2" y="3" width="28" height="5" rx="1.5" fill="#b7b2c6"/>'),
  gate: svg('<path d="M4 28 V6 M28 28 V6" stroke-width="4.6"/><path d="M4 28 V6 M28 28 V6" stroke="#6e4630" stroke-width="2"/><rect x="7" y="9" width="8.5" height="17" rx="1" fill="#8a5a3c"/><rect x="16.5" y="9" width="8.5" height="17" rx="1" fill="#8a5a3c"/><path d="M8 24 L15 11 M17.5 11 L24 24" stroke="#c99a68" stroke-width="1.6"/>'),
  harvest: svg('<path d="M9 26 L14 21" stroke-width="4.4"/><path d="M9 26 L14 21" stroke="#b88a62" stroke-width="2"/><path d="M13 22 C 6 14 12 4 22 5 C 16 8 14 14 17 19 Z" fill="#d6dbe8"/>'),
  remove: svg('<path d="M17 5 L13 19" stroke-width="3.6"/><path d="M17 5 L13 19" stroke="#b88a62" stroke-width="1.6"/><path d="M8 18 L18 21 L15 29 L5 26 Z" fill="#9aa0b4"/><path d="M14 4 H21" stroke-width="3"/>'),
  rotate: svg('<path d="M24 11 A9 9 0 1 0 25 20" fill="none" stroke-width="2.6"/><path d="M19 10 H25 V4" fill="none" stroke-width="2.6"/>'),
});

const FARM = ['till', ...CROP_TYPES.map(id => `plant:${id}`), 'harvest', 'remove'];
const FLOORS = ['plank', 'boards', 'roughplank', 'flagstone', 'slabs', 'cobble', 'fieldstone', 'remove'];
const WALLS = ['fence', 'wall', 'stonewall', 'timberwall', 'masonwall', 'gate', 'remove'];
const CAMP = [...OBJECT_TYPES.map(id => `obj:${id}`), 'remove'];
const TABS = [['farm', 'Farm', FARM], ['floors', 'Floors', FLOORS], ['walls', 'Walls', WALLS], ['camp', 'Camp', CAMP]];
const ROTATES = new Set(['fence', 'wall', 'stonewall', 'timberwall', 'masonwall', 'gate']);
const DRAGS = new Set(['till', ...FLOORS, 'fence', 'wall', 'stonewall', 'timberwall', 'masonwall', 'harvest', 'remove', ...CROP_TYPES.map(id => `plant:${id}`)]);
const HINT = {
  till: 'Drag to till a bed. Joined soil merges into one patch.',
  plank: 'Drag to lay planks.', flagstone: 'Drag to lay flagstones.', slabs: 'Drag to lay big stone slabs.', boards: 'Drag to lay broad boards.', cobble: 'Drag to lay cobbles.',
  roughplank: 'Drag to lay rough planks. Their outer edge is left ragged.', fieldstone: 'Drag to lay a fieldstone path. Its edge follows the stones.',
  fence: 'Drag to run a fence. Pieces join their neighbours.', wall: 'Drag a palisade line.', stonewall: 'Drag a stone wall.',
  timberwall: 'Drag a timber house wall. Ring a floor with house walls and a gate to make a room.',
  masonwall: 'Drag a masonry house wall. Ring a floor with house walls and a gate to make a room.',
  gate: 'Tap between two fence pieces. Tap a gate with no tool to open it.',
  harvest: 'Drag over ripe crops.', remove: 'Drag to pull up crops, floors and walls.',
};
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const nameOf = id => id.startsWith('plant:') ? CROPS[id.slice(6)].name : TOOLS[id]?.name || id;
const SHORT = {bench: 'Workbench', chest: 'Chest', fire: 'Campfire', pot: 'Cauldron', lantern: 'Lantern', bed: 'Bedroll', trap: 'Trap', ward: 'Ward', hushstone: 'Hush stone'};

export function homesteadMarkup({tab = 'farm', tool = '', rotation = 0, options = false, settings = {}, counts = {}, icon = () => ''} = {}){
  const [, , ids] = TABS.find(([id]) => id === tab) || TABS[0];
  const button = id => {
    const crop = id.startsWith('plant:') ? CROPS[id.slice(6)] : null, object = id.startsWith('obj:') ? id.slice(4) : '';
    const glyph = crop ? icon(crop.seed) : object ? icon(object) : GLYPHS[id] || '';
    const count = crop && !settings.free ? `<em>${counts[crop.seed] || 0}</em>` : '';
    return `<button type="button" class="hs-tool${id === 'remove' ? ' hs-remove' : ''}" data-hs-tool="${escapeHtml(id)}" aria-pressed="${id === tool}" title="${escapeHtml(nameOf(id))}">${glyph}${count}<small>${escapeHtml(crop ? crop.name : object ? SHORT[object] || nameOf(id) : nameOf(id))}</small></button>`;
  };
  const rotate = ROTATES.has(tool) ? `<button type="button" class="hs-chip" data-hs-rotate aria-label="Rotate (R)">${GLYPHS.rotate}<small>Rotate <kbd>R</kbd></small></button>` : '';
  const hint = tool ? `<p class="hs-hint"><b>${escapeHtml(nameOf(tool))}</b> ${escapeHtml(HINT[tool] || (tool.startsWith('plant:') ? 'Drag over tilled soil to sow.' : tool.startsWith('obj:') ? `Tap to place. Takes ${sizeOf(tool).w}×${sizeOf(tool).h} tile${sizeOf(tool).w * sizeOf(tool).h > 1 ? 's' : ''}; floors can run underneath.` : ''))}${ROTATES.has(tool) ? ` <span>${tool === 'gate' ? ['Faces south', 'Faces east', 'Faces north', 'Faces west'][rotation & 3] : rotation & 1 ? 'Runs north–south' : 'Runs east–west'}</span>` : ''}</p>` : '';
  const opt = (key, label, on) => `<button type="button" class="hs-opt" data-hs-option="${key}" aria-pressed="${!!on}">${escapeHtml(label)}</button>`;
  const panel = options ? `<div class="hs-options" role="dialog" aria-label="Homestead options">
    ${opt('free', 'Free building', settings.free)}${opt('day', 'Hold daylight', settings.day)}
    <div class="hs-speed" role="group" aria-label="Growth speed"><span>Growth</span>${[1, 5, 20].map(n => `<button type="button" class="hs-opt" data-hs-option="speed:${n}" aria-pressed="${settings.speed === n}">×${n}</button>`).join('')}</div>
    ${opt('ripen', 'Ripen everything', false)}${opt('night', 'Skip to night', false)}${opt('bloom', 'Night bloom tonight', false)}${opt('raid', 'Send a raid', false)}${opt('clear', 'Clear the homestead', false)}</div>` : '';
  return `<div class="hs-dock">${hint}<div class="hs-row">
    <div class="hs-tabs" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" data-hs-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join('')}</div>
    <div class="hs-tools" role="toolbar" aria-label="${escapeHtml((TABS.find(([id]) => id === tab) || TABS[0])[1])} tools">${ids.map(button).join('')}</div>
    <div class="hs-side">${rotate}${tool ? `<button type="button" class="hs-chip" data-hs-tool="" aria-label="Put the tool away (Esc)">✕<small>Done</small></button>` : `<button type="button" class="hs-chip" data-hs-options aria-expanded="${!!options}" aria-label="Homestead options">⚙<small>Options</small></button>`}</div>
  </div>${panel}</div>`;
}

/**
 * The controller main.mjs wires to the world canvas and the dock. It owns the tool in hand, the
 * cursor cell and the paint stroke, and sends one 'tile' command per batch of new cells.
 */
export function createHomesteadControls({panel, getWorld, me, send, toast, icon, onChange = () => {}}){
  const state = {tool: '', tab: 'farm', rotation: 0, hover: null, touched: null, stroke: null, queue: [], timer: 0, options: false, markup: ''};
  const world = () => getWorld();
  const active = () => !!world()?.homestead;

  /** The cell a piece is anchored at (its north-west cell) when the pointer is at (x, z): a big piece centres on the pointer. */
  function anchor(x, z){
    const {w, h} = sizeOf(state.tool);
    return [Math.round(x / CELL - w / 2), Math.round(z / CELL - h / 2)];
  }
  function cursor(){
    if(state.hover) return state.hover;
    if(state.touched) return state.touched;
    const p = me();if(!p) return null;
    const {w, h} = sizeOf(state.tool), reach = CELL * (.9 + Math.max(w, h) * .5);
    const [i, j] = anchor(p.x + (p.dx || 0) * reach, p.z + (p.dz || 0) * reach);
    return {i, j};
  }
  /** What the renderer draws: the tool, its cursor cell and whether the cell would take it. */
  function view(){
    const w = world(), p = me();
    if(!state.tool || !w || !p) return null;
    const c = cursor();
    const why = c ? cellReason(w, p, state.tool, c.i, c.j) : 'none';
    return {tool: state.tool, cursor: c, valid: !why || why === 'same', rotation: state.rotation};
  }
  function setTool(id){
    state.tool = id && TOOLS[id] ? (state.tool === id ? '' : id) : '';
    state.touched = null;state.stroke = null;
    if(state.tool && !ROTATES.has(state.tool)) state.rotation = 0;
    if(state.tool === 'gate') state.rotation &= 3;else state.rotation &= 1;
    state.options = false;paint(true);onChange(state.tool);
  }
  function rotate(){
    if(!ROTATES.has(state.tool)) return false;
    state.rotation = (state.rotation + 1) % (state.tool === 'gate' ? 4 : 2);
    paint(true);return true;
  }
  function flush(){
    clearTimeout(state.timer);state.timer = 0;
    if(!state.queue.length || !state.tool) {state.queue.length = 0;return;}
    const cells = state.queue.splice(0, 48), tool = state.tool;
    void send({type: 'tile', tool, cells, rotation: state.rotation});
    if(state.queue.length) state.timer = setTimeout(flush, 45);
  }
  /** Cells a stroke passes over. Only the first tap reports why a cell refuses; the rest of a drag stays quiet. */
  function enqueue(cells, quiet = false){
    const w = world(), p = me();if(!w || !p) return;
    for(const [i, j] of cells){
      if(state.queue.some(([a, b]) => a === i && b === j)) continue;
      const why = cellReason(w, p, state.tool, i, j);
      if(why === 'same' || (why && quiet)) continue;
      state.queue.push([i, j]);
    }
    if(!state.timer) state.timer = setTimeout(flush, 30);
  }

  /** Pointer handlers for the world canvas. They return true when they used the event. */
  function down(e, point){
    if(!active() || !state.tool || !point || e.button === 2) return false;
    const [i, j] = anchor(point.x, point.z);
    state.stroke = {id: e.pointerId, last: [i, j]};state.touched = {i, j};
    enqueue([[i, j]]);
    return true;
  }
  function move(e, point){
    if(!active()) return false;
    if(e.pointerType === 'mouse'){
      if(point){const [i, j] = anchor(point.x, point.z);state.hover = {i, j};}else state.hover = null;
    }
    if(!state.stroke || e.pointerId !== state.stroke.id || !point) return false;
    const [i, j] = anchor(point.x, point.z), [li, lj] = state.stroke.last;
    if(i === li && j === lj) return true;
    if(DRAGS.has(state.tool)) enqueue(cellLine([li, lj], [i, j]).slice(1), true);
    state.stroke.last = [i, j];state.touched = {i, j};
    return true;
  }
  function up(e){
    if(!state.stroke || (e && e.pointerId !== state.stroke.id)) return !!(active() && state.tool);
    state.stroke = null;flush();return true;
  }
  function leave(){state.hover = null;}
  /** No tool out: a tap on a gate opens or shuts it, on a ripe crop harvests it. */
  function tap(point){
    const w = world(), p = me();
    if(!w || !p || !point || !(w.tiles || w.buildings.some(b => b.grid))) return false;
    const [i, j] = cellAt(point.x, point.z), gate = barrierAt(w, i, j);
    if((gate?.type === 'gate') || ripe(tileAt(w, i, j))){
      if(cellReason(w, p, 'use', i, j)){return false;}
      void send({type: 'tile', tool: 'use', cells: [[i, j]]});return true;
    }
    return false;
  }

  function option(key){
    const w = world();if(!w?.homestead) return;
    const h = w.homestead;
    if(key === 'free') h.free = !h.free;
    else if(key === 'day') h.day = !h.day;
    else if(key.startsWith('speed:')) h.speed = Number(key.slice(6)) || 1;
    else if(key === 'ripen'){for(const tile of Object.values(w.tiles?.cells || {})) if(tile.crop) tile.growth = 100;toast('Everything is ripe');}
    else if(key === 'night'){h.day = false;if(phaseOf(w) !== 'night') w.time += toNight(w) + .5;toast('Night falls');}
    else if(key === 'bloom'){h.bloom = dayOf(w);if(phaseOf(w) === 'night') bloom(w);toast(phaseOf(w) === 'night' ? 'Rare flowers open nearby' : 'Rare flowers will open tonight');}
    else if(key === 'raid'){
      const p = me();if(!p) return;
      const a = Math.random() * Math.PI * 2;
      for(const [type, k] of [['crawler', 0], ['crawler', 1], ['crawler', 2], ['brute', 3]]){
        const b = a + (k - 1.5) * .35, e = w.spawnEnemy(type, p.x + Math.cos(b) * 11, p.z + Math.sin(b) * 11, {elite: false});
        if(e) e.hunt = true;
      }
      h.day = false;state.options = false;toast('A raid is coming');
    }
    else if(key === 'clear'){w.buildings = w.buildings.filter(b => !b.grid);w.enemies = [];if(w.tiles){w.tiles.cells = {};w.tiles.rev++;}toast('The homestead is clear');}
    paint(true);
  }
  function click(event){
    const t = event.target.closest('[data-hs-tool],[data-hs-tab],[data-hs-rotate],[data-hs-option],[data-hs-options]');
    if(!t) return;
    if(t.dataset.hsTab){state.tab = t.dataset.hsTab;state.options = false;paint(true);return;}
    if(t.hasAttribute('data-hs-rotate')){rotate();return;}
    if(t.hasAttribute('data-hs-options')){state.options = !state.options;paint(true);return;}
    if(t.dataset.hsOption){option(t.dataset.hsOption);return;}
    if(t.hasAttribute('data-hs-tool')) setTool(t.dataset.hsTool);
  }
  function paint(force = false){
    const w = world();
    if(!panel || panel.hidden || !w?.homestead) return;
    const p = me(), counts = {};
    if(p) for(const id of CROP_TYPES){const seed = CROPS[id].seed;counts[seed] = w.available(p, seed);}
    const html = homesteadMarkup({tab: state.tab, tool: state.tool, rotation: state.rotation, options: state.options, settings: w.homestead, counts, icon});
    if(!force && html === state.markup) return;
    state.markup = html;panel.innerHTML = html;
  }
  function show(open){
    if(!panel) return;
    panel.hidden = !open;
    if(!open){state.tool = '';state.stroke = null;state.hover = null;state.touched = null;state.options = false;state.queue.length = 0;state.markup = '';panel.innerHTML = '';return;}
    paint(true);
  }
  panel?.addEventListener('click', click);
  for(const type of ['pointerdown', 'pointerup']) panel?.addEventListener(type, event => event.stopPropagation());
  function openTab(tab){state.tab = TABS.some(([id]) => id === tab) ? tab : 'farm';state.options = false;paint(true);}
  return {state, view, setTool, rotate, down, move, up, leave, tap, paint, show, openTab, holding: () => !!state.tool};
}
export {BARRIERS, GROUNDS};
