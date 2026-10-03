// Placing grid pieces (homestead.mjs) from the Build menu: the placement mode main.mjs runs when a grid
// recipe is picked. The piece follows the cell in front of you (or under the mouse); a tap on the ground
// pins it there, and the Place / Rotate / Cancel action buttons work it like any other placement. A drag
// across the ground paints every cell it passes (floors, soil, fences, walls), so a fence line is one
// stroke. Walls and floors stay in hand after placing; a camp object goes back to normal play.
import {CELL, TOOLS, cellLine, cellReason, sizeOf, rotates} from '../homestead.mjs?v=harvest-18';
import {dayOf, phaseOf} from '../content.mjs?v=harvest-18';
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


/** Icon for a grid recipe in the Build menu (camp objects use their sprites). */
export const gridGlyph = recipeId => GLYPHS[recipeId] || '';

/** Pieces a drag paints along its path; camp objects are placed one at a time. */
const paints = toolId => TOOLS[toolId] && TOOLS[toolId].kind !== 'object';

/**
 * The controller main.mjs drives while a grid recipe is in placement mode. It owns the tool in hand,
 * the cursor cell and the paint stroke, and sends one 'tile' command per batch of cells.
 */
export function createGridControls({getWorld, me, send, toast = () => {}, onPlaced = () => {}}){
  const state = {tool: '', stationId: null, rotation: 0, hover: null, pinned: null, stroke: null, queue: [], timer: 0};
  const world = () => getWorld();
  /** What 'same' means for the tool in hand: nothing left to take down, or that piece is already there. */
  const sameText = () => TOOLS[state.tool]?.kind === 'remove' ? 'Nothing to remove here' : 'Already built here';

  /** The cell a piece is anchored at (its north-west cell) when the pointer is at (x, z): a big piece centres on the pointer. */
  function anchor(x, z){
    const {w, h} = sizeOf(state.tool);
    return [Math.round(x / CELL - w / 2), Math.round(z / CELL - h / 2)];
  }
  function cursor(){
    if(state.pinned) return state.pinned;
    if(state.hover) return state.hover;
    const p = me();if(!p) return null;
    const {w, h} = sizeOf(state.tool), reach = CELL * (.9 + Math.max(w, h) * .5);
    const [i, j] = anchor(p.x + (p.dx || 0) * reach, p.z + (p.dz || 0) * reach);
    return {i, j};
  }
  function reasonAt(c){
    const w = world(), p = me();
    if(!w || !p || !c) return 'Nothing to build on';
    return cellReason(w, p, state.tool, c.i, c.j, {stationId: state.stationId});
  }
  /** What the renderer draws and the action buttons read: the tool, its cell, whether the cell takes it. */
  function view(){
    if(!state.tool || !world() || !me()) return null;
    const c = cursor(), why = reasonAt(c);
    return {tool: state.tool, cursor: c, valid: !why, reason: why === 'same' ? sameText() : why, rotation: state.rotation, rotates: rotates(state.tool)};
  }
  function start(toolId, stationId = null){
    state.tool = TOOLS[toolId] ? toolId : '';state.stationId = stationId;
    state.rotation = 0;state.pinned = null;state.stroke = null;state.queue.length = 0;
  }
  function stop(){start('');}
  function rotate(){
    if(!rotates(state.tool)) return false;
    state.rotation = (state.rotation + 1) % (state.tool === 'gate' ? 4 : 2);
    return true;
  }
  function flush(){
    clearTimeout(state.timer);state.timer = 0;
    if(!state.queue.length || !state.tool) {state.queue.length = 0;return;}
    const cells = state.queue.splice(0, 48);
    void send({type: 'tile', tool: state.tool, cells, rotation: state.rotation, stationId: state.stationId});
    if(state.queue.length) state.timer = setTimeout(flush, 45);
  }
  /** Cells a stroke passes over; cells that would refuse stay quiet. */
  function enqueue(cells){
    for(const [i, j] of cells){
      if(state.queue.some(([a, b]) => a === i && b === j)) continue;
      if(reasonAt({i, j})) continue;
      state.queue.push([i, j]);
    }
    if(!state.timer) state.timer = setTimeout(flush, 30);
  }
  /** The Place button: the piece goes where the cursor is. Resolves to the host's answer. */
  async function place(){
    const c = cursor(), why = reasonAt(c);
    if(why){toast(why === 'same' ? sameText() : why);return null;}
    const tool = state.tool;
    const result = await send({type: 'tile', tool, cells: [[c.i, c.j]], rotation: state.rotation, stationId: state.stationId});
    if(result?.ok){state.pinned = null;onPlaced(tool);}
    return result;
  }

  /** Pointer handlers for the world canvas while placing. They return true when they used the event. */
  function down(e, point){
    if(!state.tool || !point || e.button === 2) return false;
    const [i, j] = anchor(point.x, point.z);
    state.stroke = {id: e.pointerId, start: [i, j], last: [i, j], painted: false};
    return true;
  }
  function move(e, point){
    if(!state.tool) return false;
    if(e.pointerType === 'mouse' && !state.stroke){
      if(point){const [i, j] = anchor(point.x, point.z);state.hover = {i, j};}else state.hover = null;
      return false;
    }
    if(!state.stroke || e.pointerId !== state.stroke.id || !point) return false;
    const [i, j] = anchor(point.x, point.z), [li, lj] = state.stroke.last;
    if(i === li && j === lj) return true;
    if(paints(state.tool)){
      // The first step off the starting cell turns the press into a paint stroke, starting cell included.
      enqueue(state.stroke.painted ? cellLine([li, lj], [i, j]).slice(1) : cellLine(state.stroke.start, [i, j]));
      state.stroke.painted = true;
    }
    state.stroke.last = [i, j];state.pinned = {i, j};
    return true;
  }
  /** A tap pins the piece to the cell; the end of a stroke sends what is left of it. */
  function up(e){
    const stroke = state.stroke;
    if(!stroke || (e && e.pointerId !== stroke.id)) return false;
    state.stroke = null;
    if(stroke.painted){flush();state.pinned = null;}
    else state.pinned = {i: stroke.start[0], j: stroke.start[1]};
    return true;
  }
  function leave(){state.hover = null;}

  return {start, stop, rotate, place, view, down, move, up, leave, active: () => !!state.tool, tool: () => state.tool};
}

// ------------------------------------------------------------------ Homestead test tools (game menu)
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const SPEEDS = [1, 5, 20];
/** Rows for the menu sheet in the Homestead sandbox: switches, then one-shot test buttons. */
export function homesteadMenuHTML(h = {}){
  const row = (label, cmd, text, pressed) => `<div class="menu-row"><span>${esc(label)}</span><button type="button" data-command="hs:${cmd}"${pressed == null ? '' : ` aria-pressed="${!!pressed}"`}>${esc(text)}</button></div>`;
  return row('Free building', 'free', h.free ? 'On' : 'Off', h.free)
    + row('Hold daylight', 'day', h.day ? 'On' : 'Off', h.day)
    + row('Crop growth', 'speed', `×${h.speed || 1}`)
    + `<div class="menu-row"><span>Test</span><div class="menu-tests">${[['ripen', 'Ripen crops'], ['night', 'Skip to night'], ['bloom', 'Night bloom'], ['raid', 'Send a raid'], ['clear', 'Clear all']].map(([cmd, text]) => `<button type="button" data-command="hs:${cmd}">${esc(text)}</button>`).join('')}</div></div>`;
}
/** Run one menu tool. Returns true when the menu should close so you can watch it happen. */
export function homesteadOption(w, key, {me, toast = () => {}} = {}){
  const h = w?.homestead;if(!h) return false;
  if(key === 'free'){h.free = !h.free;toast(h.free ? 'Free building on' : 'Building costs materials');return false;}
  if(key === 'day'){h.day = !h.day;return false;}
  if(key === 'speed'){h.speed = SPEEDS[(SPEEDS.indexOf(h.speed || 1) + 1) % SPEEDS.length];return false;}
  if(key === 'ripen'){for(const tile of Object.values(w.tiles?.cells || {})) if(tile.crop) tile.growth = 100;toast('Everything is ripe');return true;}
  if(key === 'night'){h.day = false;if(phaseOf(w) !== 'night') w.time += toNight(w) + .5;toast('Night falls');return true;}
  if(key === 'bloom'){h.bloom = dayOf(w);if(phaseOf(w) === 'night') bloom(w);toast(phaseOf(w) === 'night' ? 'Rare flowers open nearby' : 'Rare flowers will open tonight');return true;}
  if(key === 'raid'){
    const p = me?.();if(!p) return false;
    const a = Math.random() * Math.PI * 2;
    for(const [type, k] of [['crawler', 0], ['crawler', 1], ['crawler', 2], ['brute', 3]]){
      const b = a + (k - 1.5) * .35, e = w.spawnEnemy(type, p.x + Math.cos(b) * 11, p.z + Math.sin(b) * 11, {elite: false});
      if(e) e.hunt = true;
    }
    h.day = false;toast('A raid is coming');return true;
  }
  if(key === 'clear'){w.buildings = w.buildings.filter(b => !b.grid && !b.foot);w.enemies = [];if(w.tiles){w.tiles.cells = {};w.tiles.rev++;}toast('The homestead is clear');return true;}
  return false;
}
