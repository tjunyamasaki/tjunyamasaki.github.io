// How a dungeon floor looks: floor and wall colours per cell, wall heights, and the props. Shared by
// the WebGL renderer, the canvas renderer and the map so all three agree. Pure; no Three.js, no DOM.
import {FLOOR, ROCK, SOLID} from './grid.mjs?v=harvest-18';
import {variantOf} from './variants.mjs?v=harvest-18';
import {layoutOf} from './run.mjs?v=harvest-18';

/** Wall heights in world units. Walls on the near side of a chamber stay low so they never hide it. */
export const WALL = Object.freeze({high: 1.3, low: .34, pillar: 1.75, pillarWidth: .78});

const hash = (i, j, seed) => {let h = Math.imul(i|0, 374761393) + Math.imul(j|0, 668265263) + Math.imul(seed|0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0)/4294967296;};
const parse = hex => {const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];};
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v)*t);
const scale = (a, t) => a.map(v => v*t);

const code = (L, i, j) => i < 0 || j < 0 || i >= L.w || j >= L.h ? ROCK : L.cells[i + j*L.w];
/** True for rock or pillar cells that border open floor (the ones worth drawing). */
export function wallCell(L, i, j, reach = 2){
  if(code(L, i, j) === FLOOR) return false;
  for(let dj = -reach; dj <= reach; dj++) for(let di = -reach; di <= reach; di++) if(code(L, i + di, j + dj) === FLOOR) return true;
  return false;
}
/**
 * How tall a rock cell stands. Rock just south of open floor (between it and the camera) is a low
 * ledge; the rest stands full height. SOLID cells are pillars unless a prop stands there.
 */
export function wallHeight(L, i, j){
  const c = code(L, i, j);
  if(c === FLOOR) return 0;
  if(c === SOLID) return propCells(L).has(i + j*L.w) ? 0 : WALL.pillar;
  if(code(L, i, j - 1) === FLOOR || code(L, i, j - 2) === FLOOR || code(L, i - 1, j - 1) === FLOOR || code(L, i + 1, j - 1) === FLOOR) return WALL.low;
  return WALL.high;
}
const PROP_CELLS = new WeakMap();
/** Cells a prop stands on (drawn as the prop, not as a pillar). */
export function propCells(L){
  let set = PROP_CELLS.get(L);
  if(!set){set = new Set(L.props.map(p => Math.floor(p.x - L.ox) + Math.floor(p.z - L.oz)*L.w)); PROP_CELLS.set(L, set);}
  return set;
}

const TONES = new WeakMap();
/** Every cell's floor colour and wall-top colour, as hex strings (cached per floor). */
export function floorTones(L){
  let tones = TONES.get(L);
  if(tones) return tones;
  const v = variantOf(L.variant), pal = v.palette, seed = L.seed;
  const base = parse(pal.floor), alt = parse(pal.floorAlt), corridor = parse(pal.corridor), top = parse(pal.wallTop), rim = parse(pal.rim);
  const kindTint = {start: pal.camp, warden: pal.warden, treasure: pal.treasure, shrine: pal.shrine};
  const floor = new Array(L.w*L.h), wall = new Array(L.w*L.h);
  for(let j = 0; j < L.h; j++) for(let i = 0; i < L.w; i++){
    const k = i + j*L.w, c = L.cells[k], n = hash(i, j, seed);
    if(c !== ROCK){
      const room = L.roomAt[k], kind = room >= 0 ? L.rooms[room].kind : null;
      let col;
      if(room < 0) col = mix(corridor, base, n*.25);
      else if(v.id === 'caverns') col = mix(base, alt, (hash(i >> 1, j >> 1, seed)*.6 + n*.4));
      else if(v.id === 'ossuary') col = (i % 3 === 0 || j % 3 === 0) ? mix(alt, corridor, .35) : mix(base, alt, n*.35);
      else col = ((i >> 1) + (j >> 1)) % 2 ? mix(alt, base, n*.3) : mix(base, alt, n*.3);
      if(kindTint[kind]) col = mix(col, parse(kindTint[kind]), .38);
      // Floor meets wall: a little shade, so chambers read as sunk into the rock.
      let edge = 0;
      for(const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if(code(L, i + di, j + dj) === ROCK) edge++;
      floor[k] = toHex(scale(col, (1 - edge*.07)*(.95 + n*.08)));
    }
    if(c !== FLOOR){
      const bright = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => code(L, i + di, j + dj) === FLOOR);
      wall[k] = toHex(mix(scale(top, .92 + n*.14), rim, bright ? .18 : 0));
    }
  }
  tones = {floor, wall, face: pal.wall, faceDark: toHex(scale(parse(pal.wall), .62)), accent: pal.accent, void: toHex(scale(top, .55))};
  TONES.set(L, tones);
  return tones;
}

/** The floor's set dressing as renderer entities: {e:{id,x,z,scale}, key, kind:'prop'}. */
export function dungeonProps(world, theme){
  const L = layoutOf(world); if(!L) return [];
  const accent = variantOf(L.variant).palette.accent;
  // Fire glows warm (the renderer's own glow); anything else glows in the floor's accent colour.
  return L.props.filter(p => theme?.sprites?.[p.key]).map(p => ({e: {id: p.id, x: p.x, z: p.z, scale: p.scale, glow: p.light > 0, light: p.light, tint: p.key === 'fire' ? null : accent}, key: p.key, kind: 'prop'}));
}
