// The action HUD of classed worlds (src/classes): every combat button (Attack, the ultimate, Dodge, Heal and
// up to eight class skills) sits on an imaginary grid in the bottom-right of the screen, like icons on a
// desktop. The player arranges it in the HUD editor (main.mjs): drag a button to any free cell (or onto
// another to swap), change its size, add or remove buttons. Pure: plain data in, plain data out.
//
// A layout is a list of tiles {id, c, r, size}: c counts columns from the right edge (0 = rightmost), r rows
// from the bottom (0 = lowest), so a layout keeps its feel on any screen. `size` is 's' (a small button in
// one cell), 'm' (one cell) or 'l' (a big button over 2x2 cells).

export const HUD_BUTTONS = Object.freeze({
  attack: {label: 'Attack', glyph: '⚔', required: true},
  ult: {label: 'Ultimate', glyph: '✦'},
  dodge: {label: 'Dodge', glyph: '↝'},
  heal: {label: 'Heal', glyph: '♥'},
  ...Object.fromEntries(Array.from({length: 8}, (_, i) => [`skill${i+1}`, {label: `Skill ${i+1}`, glyph: String(i+1), slot: i}])),
});
export const HUD_SIZES = Object.freeze({s: {label: 'S', span: 1, scale: .78}, m: {label: 'M', span: 1, scale: 1}, l: {label: 'L', span: 2, scale: 1}});
/**
 * Two rows of four, all one size: skills 4 and 2, Heal, Dodge above; skills 3 and 1, the ultimate, Attack
 * below (Attack in the corner under the thumb).
 */
export const DEFAULT_HUD = Object.freeze([
  {id: 'skill4', c: 3, r: 1, size: 'm'}, {id: 'skill2', c: 2, r: 1, size: 'm'}, {id: 'heal', c: 1, r: 1, size: 'm'}, {id: 'dodge', c: 0, r: 1, size: 'm'},
  {id: 'skill3', c: 3, r: 0, size: 'm'}, {id: 'skill1', c: 2, r: 0, size: 'm'}, {id: 'ult', c: 1, r: 0, size: 'm'}, {id: 'attack', c: 0, r: 0, size: 'm'},
].map(Object.freeze));

/**
 * The grid for a screen: cells scale with its height; it fills the bottom-right, clear of the top bar and of
 * the movement pad on the left (`padRight`, its right edge in px).
 */
export function hudGrid(vw, vh, {padRight = 160, top = 96, margin = 14} = {}){
  const cell = Math.round(Math.max(48, Math.min(76, vh*.16))), gap = Math.round(cell*.14), step = cell+gap;
  const rows = Math.max(2, Math.min(8, Math.floor((vh-top-margin+gap)/step)));
  const cols = Math.max(4, Math.min(10, Math.floor((vw-padRight-margin*2+gap)/step)));
  return {cols, rows, cell, gap, step};
}
const spanOf = t => HUD_SIZES[t.size]?.span || 1;
/** Every cell a tile covers, as "c,r". */
export const cellsOf = (t, c = t.c, r = t.r, span = spanOf(t)) => {
  const out = [];
  for(let i = 0; i < span; i++) for(let j = 0; j < span; j++) out.push(`${c+i},${r+j}`);
  return out;
};
const inside = (grid, c, r, span) => c >= 0 && r >= 0 && c+span <= grid.cols && r+span <= grid.rows;
function taken(tiles, except = null){
  const set = new Set();
  for(const t of tiles) if(t !== except && t.id !== except?.id) for(const k of cellsOf(t)) set.add(k);
  return set;
}
/** True when a tile of `span` fits at (c, r), ignoring `except`. */
export function fits(tiles, grid, c, r, span, except = null){
  if(!inside(grid, c, r, span)) return false;
  const busy = taken(tiles, except);
  return cellsOf({c, r}, c, r, span).every(k => !busy.has(k));
}
/** The free spot nearest the corner for a tile of `span`, or null. */
export function firstFree(tiles, grid, span = 1, except = null){
  const spots = [];
  for(let r = 0; r < grid.rows; r++) for(let c = 0; c < grid.cols; c++) spots.push([c, r]);
  spots.sort((a, b) => (a[0]+a[1])-(b[0]+b[1]) || a[1]-b[1]);
  return spots.find(([c, r]) => fits(tiles, grid, c, r, span, except)) || null;
}
const clean = list => (Array.isArray(list) ? list : [])
  .filter(t => t && Object.hasOwn(HUD_BUTTONS, t.id) && Number.isInteger(t.c) && Number.isInteger(t.r))
  .map(t => ({id: t.id, c: t.c, r: t.r, size: Object.hasOwn(HUD_SIZES, t.size) ? t.size : 'm'}));
/**
 * A saved layout made to fit this grid: unknown and doubled buttons dropped, every tile kept inside, overlaps
 * moved to the nearest free spot (shrunk if they must), Attack always present. Returns a new list.
 */
export function fitHud(list, grid){
  const seen = new Set(), out = [];
  for(const t of clean(list)){
    if(seen.has(t.id)) continue;
    seen.add(t.id);
    let span = spanOf(t);
    let c = Math.min(Math.max(0, t.c), grid.cols-span), r = Math.min(Math.max(0, t.r), grid.rows-span);
    if(!fits(out, grid, c, r, span)){
      const spot = firstFree(out, grid, span) || (span > 1 ? (t.size = 'm', span = 1, firstFree(out, grid, 1)) : null);
      if(!spot){if(HUD_BUTTONS[t.id].required) return fitHud(DEFAULT_HUD, grid); continue;}
      [c, r] = spot;
    }
    out.push({...t, c, r});
  }
  if(!out.some(t => t.id === 'attack')){
    const spot = firstFree(out, grid, 1);
    if(spot) out.push({id: 'attack', c: spot[0], r: spot[1], size: 'm'});
    else return fitHud(DEFAULT_HUD, grid);
  }
  return out;
}
/**
 * Drop tile `id` at (c, r). Onto a free spot it moves; onto another tile of its size the two swap; anything
 * else is refused (the list comes back unchanged). Returns a new list.
 */
export function moveTile(list, grid, id, c, r){
  const tiles = list.map(t => ({...t})), t = tiles.find(q => q.id === id);
  if(!t) return list;
  const span = spanOf(t);
  c = Math.min(Math.max(0, c), grid.cols-span); r = Math.min(Math.max(0, r), grid.rows-span);
  if(fits(tiles, grid, c, r, span, t)){t.c = c; t.r = r; return tiles;}
  const other = tiles.find(q => q !== t && cellsOf(q).includes(`${c},${r}`));
  if(other && spanOf(other) === span){
    const [oc, or] = [other.c, other.r];
    other.c = t.c; other.r = t.r; t.c = oc; t.r = or;
    return tiles;
  }
  return list;
}
/** Change a tile's size; growing keeps the tile over its own cell if it can, else takes the nearest spot with room. */
export function resizeTile(list, grid, id, size){
  if(!Object.hasOwn(HUD_SIZES, size)) return list;
  const tiles = list.map(t => ({...t})), t = tiles.find(q => q.id === id);
  if(!t) return list;
  const span = HUD_SIZES[size].span;
  // First every placement that still covers its own cell, then the free spot nearest to it.
  let spot = null;
  for(let dr = 0; dr < span && !spot; dr++) for(let dc = 0; dc < span && !spot; dc++) if(fits(tiles, grid, t.c-dc, t.r-dr, span, t)) spot = [t.c-dc, t.r-dr];
  if(!spot){
    let best = Infinity;
    for(let r = 0; r < grid.rows; r++) for(let c = 0; c < grid.cols; c++){
      const d = Math.abs(c-t.c)+Math.abs(r-t.r);
      if(d < best && fits(tiles, grid, c, r, span, t)){best = d; spot = [c, r];}
    }
  }
  if(!spot) return list;
  [t.c, t.r] = spot; t.size = size;
  return tiles;
}
export function addTile(list, grid, id){
  if(!Object.hasOwn(HUD_BUTTONS, id) || list.some(t => t.id === id)) return list;
  const spot = firstFree(list, grid, 1);
  return spot ? [...list.map(t => ({...t})), {id, c: spot[0], r: spot[1], size: 'm'}] : list;
}
export function removeTile(list, id){
  return HUD_BUTTONS[id]?.required ? list : list.filter(t => t.id !== id).map(t => ({...t}));
}
/** A tile's box in px from the HUD's bottom-right corner, and the visual button size inside it. */
export function tileBox(t, grid){
  const span = spanOf(t), box = span*grid.cell+(span-1)*grid.gap, size = Math.round(box*(HUD_SIZES[t.size]?.scale || 1)), inset = (box-size)/2;
  return {right: t.c*grid.step+inset, bottom: t.r*grid.step+inset, size, box};
}
/** How far left the HUD reaches along the bottom band of height `band` px (to keep the nearby actions clear of it). */
export function bottomReach(list, grid, band){
  let reach = 0;
  for(const t of list){const b = tileBox(t, grid); if(t.r*grid.step < band) reach = Math.max(reach, t.c*grid.step+b.box);}
  return reach;
}
