// Homestead presentation (homestead.mjs): joined ground tiles, fences and walls, gates that swing,
// and the build cursor. WebGL layer for renderer.mjs, plus a plain painter for canvas-renderer.mjs.
//
// Ground: each cell is a flat quad. Its texture is picked by which of the eight neighbours hold the
// same ground, so a patch of soil or a floor reads as one shape with a single inked rim and rounded
// outer corners (the same cut as Don't Starve turf or Stardew paths).
// Barriers: real boxes, not billboards, so a run going away from the camera reads as a wall seen
// from above and anything behind it is hidden by it. Every box gets a back-face "hull" one notch
// larger in ink colour, which gives the hand-inked outline the sprites have.
import * as THREE from '../../hushlight/vendor/three.module.min.js';
import {BARRIERS, CELL, CROPS, OBJECTS, barrierAt, barrierIndex, cellAt, centerOf, footCenter, objectSpot, gateAxis, groundLinks, keyOf, linksOf, objectScale, sizeOf, tileAt, TOOLS} from './homestead.mjs?v=harvest-18';

const H = CELL / 2; // half a cell: how far a barrier's run reaches toward each neighbour

const INK = '#2b2233';
const TEX = 192;
const FLOOR_Y = .014;
export const GROUND_LOOK = Object.freeze({
  soil: {fill: '#6b4836', rim: '#8c6248', edge: '#4a3127', flat: '#6b4836'},
  plank: {fill: '#9a6b47', rim: '#6b4330', edge: '#5f3a2a', flat: '#9a6b47'},
  flagstone: {fill: '#5b5666', rim: '#6c6679', edge: '#4a4656', flat: '#8f8a9e'},
  slabs: {fill: '#4f4a5c', rim: '#6c6679', edge: '#4f4a5c', flat: '#9b97ad'},
  boards: {fill: '#7b4b33', rim: '#4f2f22', edge: '#3a2420', flat: '#7b4b33'},
  roughplank: {fill: '#a08463', rim: '#6e5640', edge: '#4d3c2e', flat: '#a08463', rough: true},
  cobble: {fill: '#4f4a5c', rim: '#6c6679', edge: '#4f4a5c', flat: '#9b97ad'},
  fieldstone: {fill: '#5a4a40', rim: '#6b5a4e', edge: '#5a4a40', flat: '#a39b84', rough: true},
});
/** How many texture variants each ground has (picked per cell by a hash of its position). */
const VARIANTS = {soil: 3, plank: 4, flagstone: 4, slabs: 4, boards: 4, roughplank: 4, cobble: 4, fieldstone: 4};
/** Seam and outline weights for the newer floors: bold, so they read at play size like the sprites. */
const SEAM = TEX * .026, LINE = TEX * .022;
const WOOD = new THREE.Color('#8a5a3c'), WOOD_D = new THREE.Color('#6e4630'), WOOD_L = new THREE.Color('#a7744c');
const STAKE = new THREE.Color('#7d5238'), STONE = new THREE.Color('#9a95ab'), STONE_L = new THREE.Color('#b7b2c6');

// ------------------------------------------------------------------ small helpers
function hash(i, j, salt = 0){
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(salt | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(seed){let s = seed >>> 0 || 1;return () => {s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0;return (s >>> 8) / 16777216;};}

// ------------------------------------------------------------------ ground textures
/** Outline shape of a tile: rect bounds and per-corner radius, from its 8 neighbours. */
function tileShape(S, m){
  const p = S * .055, R = S * .2;
  const x0 = m.w ? 0 : p, x1 = m.e ? S : S - p, y0 = m.n ? 0 : p, y1 = m.s ? S : S - p;
  const r = {nw: !m.n && !m.w ? R : 0, ne: !m.n && !m.e ? R : 0, se: !m.s && !m.e ? R : 0, sw: !m.s && !m.w ? R : 0};
  return {p, x0, x1, y0, y1, r};
}
function shapePath(g, s){
  const {x0, x1, y0, y1, r} = s;
  g.beginPath();
  g.moveTo(x0 + r.nw, y0);g.lineTo(x1 - r.ne, y0);if(r.ne)g.arcTo(x1, y0, x1, y0 + r.ne, r.ne);
  g.lineTo(x1, y1 - r.se);if(r.se)g.arcTo(x1, y1, x1 - r.se, y1, r.se);
  g.lineTo(x0 + r.sw, y1);if(r.sw)g.arcTo(x0, y1, x0, y1 - r.sw, r.sw);
  g.lineTo(x0, y0 + r.nw);if(r.nw)g.arcTo(x0, y0, x0 + r.nw, y0, r.nw);
  g.closePath();
}
/** Inked outline along the open edges only; inner corners get a little concave arc. */
function strokeOpen(g, S, s, m, width, color){
  const {p, x0, x1, y0, y1, r} = s;
  g.save();g.strokeStyle = color;g.lineWidth = width;g.lineCap = 'round';g.beginPath();
  if(!m.n){g.moveTo(m.w ? 0 : x0 + r.nw, y0);g.lineTo(m.e ? S : x1 - r.ne, y0);}
  if(!m.s){g.moveTo(m.w ? 0 : x0 + r.sw, y1);g.lineTo(m.e ? S : x1 - r.se, y1);}
  if(!m.w){g.moveTo(x0, m.n ? 0 : y0 + r.nw);g.lineTo(x0, m.s ? S : y1 - r.sw);}
  if(!m.e){g.moveTo(x1, m.n ? 0 : y0 + r.ne);g.lineTo(x1, m.s ? S : y1 - r.se);}
  if(r.nw){g.moveTo(x0, y0 + r.nw);g.arcTo(x0, y0, x0 + r.nw, y0, r.nw);}
  if(r.ne){g.moveTo(x1 - r.ne, y0);g.arcTo(x1, y0, x1, y0 + r.ne, r.ne);}
  if(r.se){g.moveTo(x1, y1 - r.se);g.arcTo(x1, y1, x1 - r.se, y1, r.se);}
  if(r.sw){g.moveTo(x0 + r.sw, y1);g.arcTo(x0, y1, x0, y1 - r.sw, r.sw);}
  for(const [k, cx, cy, a0] of [['ne', S, 0, Math.PI / 2], ['nw', 0, 0, 0], ['se', S, S, Math.PI], ['sw', 0, S, -Math.PI / 2]]){
    const [a, b] = k === 'ne' ? ['n', 'e'] : k === 'nw' ? ['n', 'w'] : k === 'se' ? ['s', 'e'] : ['s', 'w'];
    if(m[a] && m[b] && !m[k]){g.moveTo(cx + p * Math.cos(a0), cy + p * Math.sin(a0));g.arc(cx, cy, p, a0, a0 + Math.PI / 2);}
  }
  g.stroke();g.restore();
}
/** Cut the notch out of inner corners (a neighbour pair joined, the diagonal not). */
function cutInner(g, S, s, m){
  g.save();g.globalCompositeOperation = 'destination-out';
  for(const [k, a, b, cx, cy] of [['ne', 'n', 'e', S, 0], ['nw', 'n', 'w', 0, 0], ['se', 's', 'e', S, S], ['sw', 's', 'w', 0, S]]){
    if(m[a] && m[b] && !m[k]){g.beginPath();g.arc(cx, cy, s.p, 0, Math.PI * 2);g.fill();}
  }
  g.restore();
}
function paintSoil(g, S, variant){
  const L = GROUND_LOOK.soil;
  g.fillStyle = L.fill;g.fillRect(0, 0, S, S);
  const rows = 6, h = S / rows;
  for(let k = 0; k < rows; k++){
    const y = k * h;
    g.fillStyle = '#7d5640';g.fillRect(0, y + h * .12, S, h * .34);
    g.fillStyle = '#8f6549';g.fillRect(0, y + h * .14, S, h * .1);
    g.fillStyle = '#4b3126';g.fillRect(0, y + h * .62, S, h * .16);
  }
  const r = rng(91 + variant * 17);
  for(let n = 0; n < 60; n++){
    const x = r() * S, y = r() * S, s = 1 + r() * 2.4;
    g.fillStyle = r() < .5 ? 'rgba(40,26,22,.55)' : 'rgba(170,128,96,.45)';
    g.beginPath();g.ellipse(x, y, s * 1.3, s, 0, 0, Math.PI * 2);g.fill();
  }
}
function paintPlank(g, S, variant){
  const rows = 6, h = S / rows, tones = ['#9a6b47', '#8d603f', '#a3734c', '#93653f', '#9f6f49', '#8a5d3d'];
  const joints = [[.3], [.72], [.12, .86], [.55], [.4, .94], [.18, .66]];
  for(let k = 0; k < rows; k++){
    const y = k * h, tone = tones[(k + variant) % tones.length];
    g.fillStyle = tone;g.fillRect(0, y, S, h);
    g.fillStyle = 'rgba(255,226,180,.14)';g.fillRect(0, y + 2, S, h * .18);
    g.strokeStyle = 'rgba(70,40,26,.28)';g.lineWidth = 1.2;
    const r = rng(7 + k * 31 + variant * 5);
    for(let q = 0; q < 3; q++){
      const gy = y + h * (.3 + q * .22) + (r() - .5) * 3;
      g.beginPath();g.moveTo(0, gy);for(let x = 0; x <= S; x += 16)g.lineTo(x, gy + Math.sin(x * .09 + q * 2 + k) * 1.4);g.stroke();
    }
    g.fillStyle = '#3e2620';g.fillRect(0, y + h - 2.5, S, 2.5);
    for(const t of joints[(k + variant) % joints.length]){
      const x = t * S;g.fillRect(x - 1.2, y, 2.4, h);
      g.fillStyle = '#c9a77d';for(const dy of [.3, .7]){g.beginPath();g.arc(x - 5, y + h * dy, 1.7, 0, 7);g.arc(x + 5, y + h * dy, 1.7, 0, 7);g.fill();}
      g.fillStyle = '#3e2620';
    }
  }
}
/** Broad boards: three wide boards running north-south, heavy seams, big nail heads and a knot or two. */
function paintBoards(g, S, variant){
  const n = 3, w = S / n, tones = ['#7b4b33', '#87553a', '#6f4330', '#80503a'];
  const ends = [[.62], [.24], [.8], [.44]];
  for(let k = 0; k < n; k++){
    const x = k * w, tone = tones[(k + variant) % tones.length];
    g.fillStyle = tone;g.fillRect(x, 0, w, S);
    g.fillStyle = 'rgba(255,214,170,.16)';g.fillRect(x + SEAM * .6, 0, w * .2, S);
    g.fillStyle = 'rgba(40,20,14,.18)';g.fillRect(x + w * .72, 0, w * .28, S);
    // Grain: a few long confident strokes, not hairlines.
    g.strokeStyle = 'rgba(52,28,20,.45)';g.lineWidth = 2.6;g.lineCap = 'round';
    const r = rng(41 + k * 13 + variant * 7);
    for(let q = 0; q < 2; q++){const gx = x + w * (.36 + q * .26) + (r() - .5) * 6;g.beginPath();g.moveTo(gx, 0);g.bezierCurveTo(gx + 6, S * .3, gx - 6, S * .65, gx + 2, S);g.stroke();}
    if(r() < .55){const kx = x + w * (.3 + r() * .4), ky = S * (.2 + r() * .6);g.fillStyle = '#5a3424';g.beginPath();g.ellipse(kx, ky, w * .12, w * .17, 0, 0, 7);g.fill();g.strokeStyle = INK;g.lineWidth = LINE * .8;g.stroke();g.fillStyle = 'rgba(255,214,170,.25)';g.beginPath();g.ellipse(kx - 2, ky - 3, w * .04, w * .06, 0, 0, 7);g.fill();}
    // Butt joint across the board, with a pair of nails either side.
    const jy = ends[(k + variant) % ends.length][0] * S;
    g.fillStyle = INK;g.fillRect(x, jy - SEAM / 2, w, SEAM);
    for(const dy of [-1, 1])for(const dx of [.28, .72]){g.fillStyle = INK;g.beginPath();g.arc(x + w * dx, jy + dy * SEAM * 2.2, 5.2, 0, 7);g.fill();g.fillStyle = '#d9c09a';g.beginPath();g.arc(x + w * dx - 1, jy + dy * SEAM * 2.2 - 1, 3, 0, 7);g.fill();}
    g.fillStyle = INK;g.fillRect(x + w - SEAM / 2, 0, SEAM, S);
    if(k === 0)g.fillRect(-SEAM / 2, 0, SEAM, S);
  }
}
/** Rough planks: weathered grey-brown boards of uneven width, chunky grain; the floor's edge is ragged. */
function paintRoughPlank(g, S, variant){
  const rows = [.36, .3, .34], tones = ['#a08463', '#93785a', '#ab8f6d', '#8a6f52'];
  let y = 0;
  for(let k = 0; k < rows.length; k++){
    const h = rows[k] * S, tone = tones[(k + variant) % tones.length], r = rng(77 + k * 19 + variant * 11);
    g.fillStyle = tone;g.fillRect(0, y, S, h);
    g.fillStyle = 'rgba(255,240,210,.18)';g.fillRect(0, y + SEAM * .5, S, h * .22);
    g.strokeStyle = 'rgba(60,44,32,.5)';g.lineWidth = 2.8;g.lineCap = 'round';
    for(let q = 0; q < 2; q++){const gy = y + h * (.45 + q * .25), x0 = r() * S * .3, x1 = S * (.55 + r() * .45);g.beginPath();g.moveTo(x0, gy);g.quadraticCurveTo((x0 + x1) / 2, gy + (r() - .5) * 8, x1, gy + (r() - .5) * 4);g.stroke();}
    if(r() < .5){const kx = S * (.2 + r() * .6), ky = y + h * .55;g.fillStyle = '#6e5640';g.beginPath();g.ellipse(kx, ky, 9, 6, 0, 0, 7);g.fill();g.strokeStyle = INK;g.lineWidth = LINE * .7;g.stroke();}
    g.fillStyle = INK;g.fillRect(0, y + h - SEAM / 2, S, SEAM);
    const jx = S * [.38, .7, .18, .58][(k + variant) % 4];g.fillRect(jx - SEAM / 2, y, SEAM, h);
    for(const nx of [jx - 9, jx + 9]){g.fillStyle = INK;g.beginPath();g.arc(nx, y + h / 2, 4.6, 0, 7);g.fill();g.fillStyle = '#d9c09a';g.beginPath();g.arc(nx - 1, y + h / 2 - 1, 2.4, 0, 7);g.fill();}
    g.fillStyle = INK;
    y += h;
  }
  g.fillStyle = INK;g.fillRect(0, -SEAM / 2, S, SEAM);
}
// ---- stone floors: chunky stones, a bold ink line round every one, lit from the top left.
const STONE_LINE = TEX * .032;          // ink round each stone: about 2 px on screen, like the sprites
const STONE_TONES = ['#a19cb3', '#928ea6', '#aca8bd', '#8a869d', '#9b97ad'];
/** One stone: fill, a light cap along its top, a shadow along its foot, then the ink line. */
function stone(g, path, tone, {x0, y0, x1, y1}){
  path();g.fillStyle = tone;g.fill();
  g.save();path();g.clip();
  const h = y1 - y0;
  g.fillStyle = 'rgba(255,255,255,.26)';g.fillRect(x0, y0, x1 - x0, h * .2);
  g.fillStyle = 'rgba(255,255,255,.12)';g.fillRect(x0, y0, (x1 - x0) * .14, h);
  g.fillStyle = 'rgba(28,20,40,.26)';g.fillRect(x0, y1 - h * .2, x1 - x0, h * .2);
  g.restore();
  path();g.strokeStyle = INK;g.lineWidth = STONE_LINE;g.lineJoin = 'round';g.stroke();
}
function roundedRect(g, x, y, w, h, r){return () => {g.beginPath();g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));};}
/** A bold crack: three strokes, never hairlines. */
function crack(g, x, y, s, r){
  g.beginPath();g.moveTo(x, y);g.lineTo(x + s * (.4 + r() * .3), y + s * (.2 + r() * .3));g.lineTo(x + s * (.8 + r() * .3), y + s * (.1 + r() * .2));
  g.strokeStyle = INK;g.lineWidth = STONE_LINE * .8;g.lineCap = 'round';g.lineJoin = 'round';g.stroke();
}
/** Flagstone (the original): small dressed stones in two courses, fine joints. */
function paintFlagstone(g, S, variant){
  g.fillStyle = '#4d4a57';g.fillRect(0, 0, S, S);
  const r = rng(301 + variant * 13), tones = ['#8f8a9e', '#9a95aa', '#857f94', '#a29db2'];
  const cells = variant % 2
    ? [[0, 0, .4, .36], [.4, 0, .34, .36], [.74, 0, .26, .36], [0, .36, .27, .32], [.27, .36, .45, .32], [.72, .36, .28, .32], [0, .68, .5, .32], [.5, .68, .5, .32]]
    : [[0, 0, .3, .34], [.3, 0, .42, .34], [.72, 0, .28, .34], [0, .34, .55, .33], [.55, .34, .45, .33], [0, .67, .36, .33], [.36, .67, .3, .33], [.66, .67, .34, .33]];
  for(const [cx, cy, cw, ch] of cells){
    const x = cx * S + 3, y = cy * S + 3, w = cw * S - 6, hh = ch * S - 6, rad = 7 + r() * 5;
    g.fillStyle = tones[Math.floor(r() * tones.length)];
    g.beginPath();g.roundRect(x + (r() - .5) * 2, y + (r() - .5) * 2, w, hh, rad);g.fill();
    g.fillStyle = 'rgba(255,255,255,.13)';g.beginPath();g.roundRect(x + 2, y + 2, w - 6, hh * .3, rad);g.fill();
    g.fillStyle = 'rgba(30,24,40,.18)';g.beginPath();g.roundRect(x + 4, y + hh * .72, w - 6, hh * .26, rad);g.fill();
    g.strokeStyle = 'rgba(43,34,51,.55)';g.lineWidth = 1.6;g.beginPath();g.roundRect(x, y, w, hh, rad);g.stroke();
  }
}
/**
 * Stone slabs: a few big cut slabs per tile, each inked, with the odd bold crack. Every tile edge is a
 * joint (half a gap on each side), so slabs never get sliced where two tiles meet.
 */
function paintSlabs(g, S, variant){
  g.fillStyle = '#4f4a5c';g.fillRect(0, 0, S, S);
  const layouts = [
    [[0, 0, .55, .5], [.55, 0, .45, .5], [0, .5, .4, .5], [.4, .5, .6, .5]],
    [[0, 0, .4, .46], [.4, 0, .6, .46], [0, .46, .62, .54], [.62, .46, .38, .54]],
    [[0, 0, 1, .42], [0, .42, .48, .58], [.48, .42, .52, .58]],
    [[0, 0, .5, .58], [.5, 0, .5, .58], [0, .58, 1, .42]],
  ];
  const r = rng(301 + variant * 13), gap = S * .02;
  for(const [fx, fy, fw, fh] of layouts[variant % layouts.length]){
    const x = fx * S + gap, y = fy * S + gap, w = fw * S - gap * 2, h = fh * S - gap * 2;
    stone(g, roundedRect(g, x, y, w, h, S * .06), STONE_TONES[Math.floor(r() * STONE_TONES.length)], {x0: x, y0: y, x1: x + w, y1: y + h});
    if(r() < .4)crack(g, x + w * (.2 + r() * .3), y + h * (.25 + r() * .3), Math.min(w, h) * .5, r);
  }
}
/** Cobblestone: three rows of fat, squarish cobbles in a running bond; half cobbles close each row at the tile edge. */
function paintCobble(g, S, variant){
  g.fillStyle = '#4f4a5c';g.fillRect(0, 0, S, S);
  const rows = 3, h = S / rows, r = rng(500 + variant * 29), gap = S * .018;
  for(let k = 0; k < rows; k++){
    const odd = (k + variant) % 2 === 1, cuts = odd ? [0, 1 / 6, 1 / 2, 5 / 6, 1] : [0, 1 / 3, 2 / 3, 1];
    for(let q = 0; q < cuts.length - 1; q++){
      const jx = (r() - .5) * S * .015, jy = (r() - .5) * S * .015;
      const x = cuts[q] * S + gap + jx, y = k * h + gap + jy, w = (cuts[q + 1] - cuts[q]) * S - gap * 2, hh = h - gap * 2;
      stone(g, roundedRect(g, x, y, w, hh, Math.min(w, hh) * .38), STONE_TONES[Math.floor(r() * STONE_TONES.length)], {x0: x, y0: y, x1: x + w, y1: y + hh});
    }
  }
}
/** Fieldstone: rounded stones bedded in earth, the odd crack, and grass in the gaps. */
function paintFieldstone(g, S, variant){
  g.fillStyle = '#5a4a40';g.fillRect(0, 0, S, S);
  const r = rng(900 + variant * 37);
  g.fillStyle = 'rgba(40,28,22,.35)';for(let n = 0; n < 6; n++){g.beginPath();g.ellipse(r() * S, r() * S, S * .06, S * .035, r() * 3, 0, 7);g.fill();}
  // Layouts in tile fractions: centre x, centre y, radius. Kept inside the tile so a seam never cuts a stone.
  const layouts = [
    [[.27, .27, .22], [.73, .29, .2], [.28, .74, .2], [.72, .72, .22]],
    [[.32, .34, .29], [.78, .22, .16], [.76, .66, .2], [.27, .8, .16]],
    [[.24, .22, .18], [.66, .3, .24], [.3, .66, .22], [.76, .78, .17]],
    [[.5, .3, .26], [.22, .76, .19], [.72, .74, .21], [.14, .3, .12]],
  ];
  const tones = ['#b3ab93', '#a39b84', '#bdb59e', '#968f7a'];
  for(const [fx, fy, fr] of layouts[variant % layouts.length]){
    const cx = fx * S, cy = fy * S, R = fr * S, n = 9, rad = Array.from({length: n}, () => R * (.82 + r() * .24)), tilt = r() * Math.PI;
    const pts = rad.map((rr, k) => {const a = tilt + k / n * Math.PI * 2;return [cx + Math.cos(a) * rr * 1.08, cy + Math.sin(a) * rr * .9];});
    const path = () => {g.beginPath();for(let k = 0; k < n; k++){const a = pts[k], b = pts[(k + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];if(!k){const z = pts[n - 1];g.moveTo((z[0] + a[0]) / 2, (z[1] + a[1]) / 2);}g.quadraticCurveTo(a[0], a[1], m[0], m[1]);}g.closePath();};
    stone(g, path, tones[Math.floor(r() * tones.length)], {x0: cx - R * 1.2, y0: cy - R, x1: cx + R * 1.2, y1: cy + R});
    if(r() < .35)crack(g, cx - R * .4, cy - R * .1, R * .9, r);
  }
  // Grass in the gaps: two chunky blades with an ink edge.
  for(let t = 0; t < 2; t++){
    const x = S * (.5 + (r() - .5) * .2), y = S * (t ? .52 : .12 + r() * .1);
    g.beginPath();g.moveTo(x - 10, y + 6);g.quadraticCurveTo(x - 6, y - 8, x - 12, y - 16);g.quadraticCurveTo(x - 2, y - 6, x, y + 6);
    g.moveTo(x - 2, y + 6);g.quadraticCurveTo(x + 4, y - 10, x + 12, y - 14);g.quadraticCurveTo(x + 6, y - 2, x + 8, y + 6);
    g.fillStyle = '#7f9a5a';g.fill();g.strokeStyle = INK;g.lineWidth = STONE_LINE * .7;g.lineJoin = 'round';g.stroke();
  }
}
const PAINT = {soil: paintSoil, plank: paintPlank, flagstone: paintFlagstone, slabs: paintSlabs, boards: paintBoards, roughplank: paintRoughPlank, cobble: paintCobble, fieldstone: paintFieldstone};

/**
 * Ragged outline for the natural floors. Each open edge is pushed in by a wobbly amount; the wobble
 * is pinned to the same depth at both ends of every edge, so whatever variant a neighbour draws,
 * edges and corners always meet. Returns the polygon and, per segment, whether it lies on an open
 * edge (only those get the ink line).
 */
function roughShape(S, m, variant, kind){
  const plank = kind === 'roughplank', base = S * .07, amp = S * (plank ? .12 : .11), pin = base + amp * .5, ch = S * .12;
  const r = rng(1000 + variant * 97 + (plank ? 0 : 7));
  // Profile of one open edge, t in 0..1 along it: pinned to `pin` at both ends.
  const smooth = () => {const v = [0, ...Array.from({length: 5}, () => (r() - .5) * 2), 0];return t => {const f = t * 6, k = Math.min(5, Math.floor(f)), u = f - k, e = u * u * (3 - 2 * u);return pin + amp * .5 * (v[k] + (v[k + 1] - v[k]) * e);};};
  // Plank ends: each board stops at its own length, a square step per board row (rows as in paintRoughPlank).
  const ends = () => {const cut = [0, .36, .66, 1], off = cut.slice(1).map(() => (r() - .5) * 2);return t => {
    const k = Math.max(0, cut.findIndex(c => c > t) - 1), edge = Math.min(t, 1 - t), fade = Math.min(1, edge / .06);
    return pin + amp * .55 * off[Math.min(off.length - 1, k)] * fade;};};
  const gentle = () => {const f = smooth();return t => pin + (f(t) - pin) * .5;};
  const o = {n: !m.n, e: !m.e, s: !m.s, w: !m.w}, flat = () => 0;
  // Profiles are drawn for every side (so a variant always rolls the same numbers); a joined side lies flat on the border.
  const prof = {n: plank ? gentle() : smooth(), e: plank ? ends() : smooth(), s: plank ? gentle() : smooth(), w: plank ? ends() : smooth()};
  const d = {n: o.n ? prof.n : flat, e: o.e ? prof.e : flat, s: o.s ? prof.s : flat, w: o.w ? prof.w : flat};
  const NW = o.n && o.w ? [[pin, pin + ch], [pin + ch, pin]] : [[o.w ? pin : 0, o.n ? pin : 0]];
  const NE = o.n && o.e ? [[S - pin - ch, pin], [S - pin, pin + ch]] : [[S - (o.e ? pin : 0), o.n ? pin : 0]];
  const SE = o.s && o.e ? [[S - pin, S - pin - ch], [S - pin - ch, S - pin]] : [[S - (o.e ? pin : 0), S - (o.s ? pin : 0)]];
  const SW = o.s && o.w ? [[pin + ch, S - pin], [pin, S - pin - ch]] : [[o.w ? pin : 0, S - (o.s ? pin : 0)]];
  const pts = [], N = 28;
  // Each point carries whether the segment that starts at it lies on an open (inked) edge.
  const corner = (list, next) => list.forEach((p, k) => pts.push([p[0], p[1], k < list.length - 1 ? true : next]));
  const run = (from, to, at, open) => {for(let k = 1; k < N; k++){const v = from + (to - from) * k / N;pts.push([...at(v), open]);}};
  corner(NW, o.n);run(NW.at(-1)[0], NE[0][0], x => [x, d.n(x / S)], o.n);
  corner(NE, o.e);run(NE.at(-1)[1], SE[0][1], y => [S - d.e(y / S), y], o.e);
  corner(SE, o.s);run(SE.at(-1)[0], SW[0][0], x => [x, S - d.s(x / S)], o.s);
  corner(SW, o.w);run(SW.at(-1)[1], NW[0][1], y => [d.w(y / S), y], o.w);
  return {pts, pin};
}
function roughPath(g, shape){g.beginPath();shape.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y));g.closePath();}
function roughStroke(g, shape, width, color){
  const P = shape.pts;g.save();g.strokeStyle = color;g.lineWidth = width;g.lineCap = 'round';g.lineJoin = 'round';g.beginPath();
  for(let k = 0; k < P.length; k++){const a = P[k], b = P[(k + 1) % P.length];if(!a[2])continue;g.moveTo(a[0], a[1]);g.lineTo(b[0], b[1]);}
  g.stroke();g.restore();
}

function maskKey(m){return ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map(k => m[k] ? 1 : 0).join('');}
function groundCanvas(kind, m, variant){
  const S = TEX, c = document.createElement('canvas');c.width = c.height = S;
  const g = c.getContext('2d'), s = tileShape(S, m), L = GROUND_LOOK[kind];
  if(L.rough){
    const shape = roughShape(S, m, variant, kind);
    g.save();roughPath(g, shape);g.clip();PAINT[kind](g, S, variant);
    roughStroke(g, shape, S * .12, L.rim);
    g.restore();
    cutInner(g, S, {p: shape.pin}, m);
    roughStroke(g, shape, S * .05, INK);
    return c;
  }
  g.save();shapePath(g, s);g.clip();PAINT[kind](g, S, variant);
  // A rim just inside the open edges: a raised lip of earth, a skirting beam, a kerb of stone.
  g.lineWidth = S * (kind === 'soil' ? .1 : .085);g.strokeStyle = L.rim;
  g.globalAlpha = kind === 'soil' ? .9 : 1;
  const inner = {...s, x0: s.x0 + (m.w ? 0 : S * .045), x1: s.x1 - (m.e ? 0 : S * .045), y0: s.y0 + (m.n ? 0 : S * .045), y1: s.y1 - (m.s ? 0 : S * .045)};
  strokeOpen(g, S, inner, m, S * (kind === 'soil' ? .1 : .085), L.rim);
  g.globalAlpha = 1;
  g.restore();
  cutInner(g, S, s, m);
  strokeOpen(g, S, s, m, S * (kind === 'boards' || kind === 'cobble' || kind === 'slabs' ? .055 : .045), INK);
  return c;
}

// ------------------------------------------------------------------ barrier geometry
const SHADE = n => n.y > .5 ? 1.14 : n.y < -.5 ? .55 : n.z > .5 ? 1 : n.z < -.5 ? .7 : .84;
/** Collects boxes and pyramids into one coloured, textured geometry plus its inked hull. */
class Mesher {
  constructor(){this.pos = [];this.col = [];this.uv = [];this.hull = [];this.m = new THREE.Matrix4();this.v = new THREE.Vector3();this.n = new THREE.Vector3();this.nm = new THREE.Matrix3();}
  face(corners, normal, color, uvs, matrix){
    this.n.copy(normal).applyMatrix3(this.nm.getNormalMatrix(matrix)).normalize();
    const k = SHADE(this.n), c = color;
    const tri = idx => {for(const i of idx){this.v.copy(corners[i]).applyMatrix4(matrix);this.pos.push(this.v.x, this.v.y, this.v.z);this.col.push(c.r * k, c.g * k, c.b * k);this.uv.push(uvs[i][0], uvs[i][1]);}};
    if(corners.length === 4)tri([0, 1, 2, 0, 2, 3]);else tri([0, 1, 2]);
  }
  hullTri(corners, matrix){for(const v of corners){this.v.copy(v).applyMatrix4(matrix);this.hull.push(this.v.x, this.v.y, this.v.z);}}
  /** Box centred at (x, y, z) in `matrix` space; `grain` is the axis the wood grain runs along. */
  box(x, y, z, sx, sy, sz, color, {matrix = null, grain = 'y', ink = .028} = {}){
    const M = matrix || this.m.identity();
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const V = (a, b, c) => new THREE.Vector3(x + a * hx, y + b * hy, z + c * hz);
    const faces = [
      [[V(-1, -1, 1), V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1)], new THREE.Vector3(0, 0, 1)],
      [[V(1, -1, -1), V(-1, -1, -1), V(-1, 1, -1), V(1, 1, -1)], new THREE.Vector3(0, 0, -1)],
      [[V(1, -1, 1), V(1, -1, -1), V(1, 1, -1), V(1, 1, 1)], new THREE.Vector3(1, 0, 0)],
      [[V(-1, -1, -1), V(-1, -1, 1), V(-1, 1, 1), V(-1, 1, -1)], new THREE.Vector3(-1, 0, 0)],
      [[V(-1, 1, 1), V(1, 1, 1), V(1, 1, -1), V(-1, 1, -1)], new THREE.Vector3(0, 1, 0)],
      [[V(-1, -1, -1), V(1, -1, -1), V(1, -1, 1), V(-1, -1, 1)], new THREE.Vector3(0, -1, 0)],
    ];
    const axis = {x: 0, y: 1, z: 2}[grain];
    for(const [corners, normal] of faces){
      const along = [0, 1, 2].filter(a => Math.abs(normal.getComponent(a)) < .5);
      const vAxis = along.includes(axis) ? axis : along[1], uAxis = along.find(a => a !== vAxis);
      const uvs = corners.map(c => [c.getComponent(uAxis) * 1.3, c.getComponent(vAxis) * 1.3]);
      this.face(corners, normal, color, uvs, M);
    }
    const H = (a, b, c) => new THREE.Vector3(x + a * (hx + ink), y + b * (hy + ink), z + c * (hz + ink));
    for(const [a, b, c, d] of [
      [H(-1, -1, 1), H(1, -1, 1), H(1, 1, 1), H(-1, 1, 1)], [H(1, -1, -1), H(-1, -1, -1), H(-1, 1, -1), H(1, 1, -1)],
      [H(1, -1, 1), H(1, -1, -1), H(1, 1, -1), H(1, 1, 1)], [H(-1, -1, -1), H(-1, -1, 1), H(-1, 1, 1), H(-1, 1, -1)],
      [H(-1, 1, 1), H(1, 1, 1), H(1, 1, -1), H(-1, 1, -1)], [H(-1, -1, -1), H(1, -1, -1), H(1, -1, 1), H(-1, -1, 1)],
    ]){this.hullTri([a, b, c], M);this.hullTri([a, c, d], M);}
  }
  /** Four-sided point on top of a post: base square side `s` at height y, apex `h` above. */
  tip(x, y, z, s, h, color, {matrix = null, ink = .028} = {}){
    const M = matrix || this.m.identity(), q = s / 2;
    const apex = new THREE.Vector3(x, y + h, z), base = [[-q, q], [q, q], [q, -q], [-q, -q]].map(([a, c]) => new THREE.Vector3(x + a, y, z + c));
    for(let k = 0; k < 4; k++){
      const a = base[k], b = base[(k + 1) % 4], mid = a.clone().add(b).multiplyScalar(.5).sub(new THREE.Vector3(x, y, z));
      const normal = new THREE.Vector3(mid.x, q * q / h * 2, mid.z).normalize();
      this.face([a, b, apex], normal, color, [[0, 0], [.4, 0], [.2, .5]], M);
    }
    const e = ink, hb = [[-q - e, q + e], [q + e, q + e], [q + e, -q - e], [-q - e, -q - e]].map(([a, c]) => new THREE.Vector3(x + a, y - e, z + c)), ha = new THREE.Vector3(x, y + h + e * 1.6, z);
    for(let k = 0; k < 4; k++)this.hullTri([hb[k], hb[(k + 1) % 4], ha], M);
  }
  geometry(){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
  hullGeometry(){const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(this.hull, 3));return g;}
}

/** Directions a piece reaches toward: its links, or a short run along its rotation when it stands alone. */
export function reachOf(b, links){
  if(links.n || links.s || links.e || links.w)return links;
  return (b.rotation | 0) % 2 === 0 ? {n: false, s: false, e: true, w: true} : {n: true, s: true, e: false, w: false};
}
const STEP = {n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0]};

function addFence(M, x, z, reach, seed){
  const h = .9 + seed * .08;
  M.box(x, h / 2, z, .2, h, .2, WOOD_D);
  M.tip(x, h, z, .2, .12, WOOD_D);
  for(const [dir, on] of Object.entries(reach)){
    if(!on)continue;
    const [dx, dz] = STEP[dir], len = H, mx = x + dx * len / 2, mz = z + dz * len / 2;
    for(const y of [.36, .7]){
      if(dx)M.box(mx, y, mz, len, .1, .08, WOOD, {grain: 'x'});
      else M.box(mx, y, mz, .11, .1, len, WOOD, {grain: 'z'});
    }
  }
}
function addPalisade(M, b, x, z, reach){
  const stake = (sx, sz) => {
    const h = 1.12 + hash(Math.round(sx * 4), Math.round(sz * 4), 3) * .26, tone = STAKE.clone().multiplyScalar(.9 + hash(Math.round(sx * 4), Math.round(sz * 4), 9) * .22);
    M.box(sx, h / 2, sz, .23, h, .23, tone);M.tip(sx, h, sz, .23, .22, tone);
  };
  stake(x, z);
  for(const [dir, on] of Object.entries(reach)){
    if(!on)continue;
    const [dx, dz] = STEP[dir];
    const n = Math.round(H / .25);
    for(let k = 1; k < n; k++)stake(x + dx * k * H / n, z + dz * k * H / n);
    // The stake on the cell edge belongs to one side only, so a run never doubles up.
    if(dir === 'e' || dir === 's' || !linkedAt(b, dir))stake(x + dx * H, z + dz * H);
    if(dx)for(const y of [.32, .86])M.box(x + dx * H / 2, y, z + .125, H, .07, .04, WOOD_D, {grain: 'x', ink: .018});
  }
}
let LINKS = null;
const linkedAt = (b, dir) => !!LINKS?.[dir];
function addStoneWall(M, x, z, reach){
  M.box(x, .5, z, .52, 1.0, .52, STONE);
  M.box(x, 1.04, z, .58, .09, .58, STONE_L, {ink: .022});
  for(const [dir, on] of Object.entries(reach)){
    if(!on)continue;
    const [dx, dz] = STEP[dir], mx = x + dx * H / 2, mz = z + dz * H / 2;
    if(dx){M.box(mx, .46, mz, H, .92, .44, STONE, {grain: 'x'});M.box(mx, .95, mz, H, .07, .5, STONE_L, {grain: 'x', ink: .02});}
    else{M.box(mx, .46, mz, .44, .92, H, STONE, {grain: 'z'});M.box(mx, .95, mz, .5, .07, H, STONE_L, {grain: 'z', ink: .02});}
  }
}

// Room walls (homestead.mjs ROOM_WALLS): about head height, so they close a room off. Runs are
// built from a few bold parts (planks, coursed blocks) whose own ink hulls draw the joints.
const ROOM_H = 1.72;
function addTimberWall(M, x, z, reach, seed){
  M.box(x, ROOM_H / 2, z, .3, ROOM_H, .3, WOOD_D);
  M.box(x, ROOM_H + .05, z, .36, .1, .36, WOOD_D, {ink: .022});
  for(const [dir, on] of Object.entries(reach)){
    if(!on)continue;
    const [dx, dz] = STEP[dir], n = 3, w = (H - .15) / n;
    for(let k = 0; k < n; k++){
      const d = .15 + w * (k + .5), px = x + dx * d, pz = z + dz * d, r = hash(Math.round(px * 8), Math.round(pz * 8), 5);
      const h = ROOM_H - .1 - r * .08, tone = WOOD.clone().multiplyScalar(.88 + r * .24);
      if(dx)M.box(px, h / 2, pz, w - .015, h, .2, tone, {ink: .02});else M.box(px, h / 2, pz, .2, h, w - .015, tone, {ink: .02});
    }
    const mx = x + dx * H / 2, mz = z + dz * H / 2;
    if(dx){M.box(mx, ROOM_H - .1, mz, H, .13, .27, WOOD_D, {grain: 'x', ink: .022});M.box(mx, .62, mz + .12, H, .1, .05, WOOD_L, {grain: 'x', ink: .018});}
    else{M.box(mx, ROOM_H - .1, mz, .27, .13, H, WOOD_D, {grain: 'z', ink: .022});M.box(mx + .12, .62, mz, .05, .1, H, WOOD_L, {grain: 'z', ink: .018});M.box(mx - .12, .62, mz, .05, .1, H, WOOD_L, {grain: 'z', ink: .018});}
  }
}
const STONE_D = new THREE.Color('#857f97');
function addMasonWall(M, x, z, reach){
  M.box(x, (ROOM_H - .1) / 2, z, .62, ROOM_H - .1, .62, STONE_D);
  M.box(x, ROOM_H - .04, z, .72, .14, .72, STONE_L, {ink: .022});
  for(const [dir, on] of Object.entries(reach)){
    if(!on)continue;
    const [dx, dz] = STEP[dir], rows = 3, rh = (ROOM_H - .14) / rows, start = .31, span = H - start;
    for(let row = 0; row < rows; row++){
      // Courses alternate a long and a short block so the joints never line up.
      const cuts = row % 2 ? [0, .58, 1] : [0, .36, 1];
      for(let k = 0; k < cuts.length - 1; k++){
        const a = start + span * cuts[k], b = start + span * cuts[k + 1], d = (a + b) / 2, len = b - a - .02;
        const px = x + dx * d, pz = z + dz * d, r = hash(Math.round(px * 8) + row * 31, Math.round(pz * 8), 7), tone = STONE.clone().multiplyScalar(.9 + r * .18);
        const y = rh * (row + .5), t = .5 - (row === rows - 1 ? .03 : 0);
        if(dx)M.box(px, y, pz, len, rh - .025, t, tone, {grain: 'x', ink: .02});else M.box(px, y, pz, t, rh - .025, len, tone, {grain: 'z', ink: .02});
      }
    }
    const mx = x + dx * (start + span / 2), mz = z + dz * (start + span / 2);
    if(dx)M.box(mx, ROOM_H - .07, mz, span, .1, .58, STONE_L, {grain: 'x', ink: .02});else M.box(mx, ROOM_H - .07, mz, .58, .1, span, STONE_L, {grain: 'z', ink: .02});
  }
}
const ROOM_KINDS = new Set(['timberwall', 'masonwall']);
/** One barrier's parts into its Mesher; `fake` stands in for a placed piece when drawing the ghost. */
function addBarrier(M, b, x, z, reach, seed){
  if(b.type === 'fence')addFence(M, x, z, reach, seed);
  else if(b.type === 'wall')addPalisade(M, b, x, z, reach);
  else if(b.type === 'stonewall')addStoneWall(M, x, z, reach);
  else if(b.type === 'timberwall')addTimberWall(M, x, z, reach, seed);
  else if(b.type === 'masonwall')addMasonWall(M, x, z, reach);
}
/**
 * Room walls stand taller than the wanderer, so the ones in front of the local player (toward the
 * camera, +z) thin out into an ordered dither while they are close: the room's inside stays readable.
 * Chains onto bindNight's onBeforeCompile; uPeek = (x, z, strength).
 */
function bindPeek(material, peek){
  const night = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    night(shader);shader.uniforms.uPeek = peek;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPeek;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{vec2 d=vNightWorld.xz-uPeek.xy;float ahead=smoothstep(-.35,.15,d.y)*(1.0-smoothstep(2.6,3.8,d.y));float side=1.0-smoothstep(1.7,2.9,abs(d.x));
float cut=uPeek.z*ahead*side*smoothstep(.3,.55,vNightWorld.y);
vec2 f=floor(gl_FragCoord.xy),h=floor(f*.5);float bayer=fract(dot(h,vec2(.5,h.y*.75)))*.25+fract(dot(f,vec2(.5,f.y*.75)));
if(cut*.78>bayer+.02)discard;}`);
  };
  material.customProgramCacheKey = () => 'hollowstead-night-peek';
}

// Gate parts in the gate's own frame: the opening runs along x, leaves hinge on the posts.
const GATE_HALF = H - .06, LEAF = GATE_HALF - .08;
function gateFrame(M){
  for(const s of [-1, 1]){M.box(s * GATE_HALF, .52, 0, .16, 1.04, .16, WOOD_D);M.tip(s * GATE_HALF, 1.04, 0, .16, .12, WOOD_D);}
}
function gateLeaf(M, side){
  // Local frame: hinge at the origin, the leaf runs toward +x (side 1) or -x (side -1).
  const w = LEAF - .02;
  const pickets = Math.max(3, Math.round(w / .14));
  for(let k = 0; k < pickets; k++){
    const cx = side * (.07 + k * (w - .12) / (pickets - 1)), h = .78 - Math.abs(k - (pickets - 1) / 2) * .025;
    M.box(cx, .1 + h / 2, 0, .1, h, .05, WOOD, {grain: 'y', ink: .02});
  }
  for(const y of [.28, .72])M.box(side * w / 2, y, .035, w, .08, .045, WOOD_D, {grain: 'x', ink: .02});
  const m = new THREE.Matrix4().makeTranslation(side * w / 2, .5, .035).multiply(new THREE.Matrix4().makeRotationZ(side * -Math.atan2(.44, w)));
  M.box(0, 0, 0, Math.hypot(w, .44) * .92, .07, .04, WOOD_L, {matrix: m, grain: 'x', ink: .018});
}

// ------------------------------------------------------------------ the layer
/** How visible a building's health bar is: full for a few seconds after its hp changes (a blow or a repair), then it fades out.
 *  `memo` is any object kept per building; a building first seen already damaged stays hidden until it is hit again. */
export const BAR_LINGER = 3.5, BAR_FADE = .6;
export function recentHit(memo, hp, clock){
  if(memo.hpSeen === undefined){memo.hpSeen = hp;memo.hpAt = -1e9;}
  if(hp !== memo.hpSeen){memo.hpSeen = hp;memo.hpAt = clock;}
  return Math.max(0, Math.min(1, 1 - (clock - memo.hpAt - BAR_LINGER) / BAR_FADE));
}
export class HomesteadLayer {
  constructor(renderer){
    this.r = renderer;this.scene = renderer.scene;
    this.group = new THREE.Group();this.group.name = 'homestead';this.scene.add(this.group);
    this.groundKey = '';this.groundMeshes = [];this.textures = new Map();this.materials = new Map();
    this.barrierKey = '';this.barrierMeshes = [];this.gates = new Map();this.effects = [];this.lastEvent = 0;
    this.cursor = null;this.ghost = null;this.ghostKey = '';this.gridMesh = null;
    this.ink = new THREE.MeshBasicMaterial({color: INK, side: THREE.BackSide});renderer.bindNight(this.ink);
    this.wood = new THREE.MeshBasicMaterial({vertexColors: true, map: this.grainTexture('wood')});renderer.bindNight(this.wood);
    this.stone = new THREE.MeshBasicMaterial({vertexColors: true, map: this.grainTexture('stone')});renderer.bindNight(this.stone);
    this.peek = {value: new THREE.Vector3(0, 0, 0)};
    const peeking = mat => {renderer.bindNight(mat);bindPeek(mat, this.peek);return mat;};
    this.roomWood = peeking(new THREE.MeshBasicMaterial({vertexColors: true, map: this.wood.map}));
    this.roomStone = peeking(new THREE.MeshBasicMaterial({vertexColors: true, map: this.stone.map}));
    this.roomInk = peeking(new THREE.MeshBasicMaterial({color: INK, side: THREE.BackSide}));
    this.shadowMat = new THREE.MeshBasicMaterial({color: '#241e2c', transparent: true, opacity: .2, depthWrite: false});
    this.ghostMats = {
      ok: new THREE.MeshBasicMaterial({color: '#c8e5a6', transparent: true, opacity: .55, depthWrite: false}),
      bad: new THREE.MeshBasicMaterial({color: '#dd7471', transparent: true, opacity: .55, depthWrite: false}),
    };
    const gateParts = (fn) => {const M = new Mesher();fn(M);return {geo: M.geometry(), hull: M.hullGeometry()};};
    this.gateGeo = {frame: gateParts(gateFrame), left: gateParts(M => gateLeaf(M, 1)), right: gateParts(M => gateLeaf(M, -1))};
  }
  /** Greyscale grain multiplied by the vertex colours: wood runs along v, stone is coursed blocks. */
  grainTexture(kind){
    const S = 64, c = document.createElement('canvas');c.width = c.height = S;const g = c.getContext('2d');
    g.fillStyle = '#e9e6e2';g.fillRect(0, 0, S, S);
    const r = rng(kind === 'wood' ? 5 : 11);
    if(kind === 'wood'){
      for(let k = 0; k < 9; k++){const x = r() * S;g.strokeStyle = `rgba(60,40,30,${.12 + r() * .16})`;g.lineWidth = .8 + r() * 1.4;g.beginPath();g.moveTo(x, 0);g.bezierCurveTo(x + (r() - .5) * 6, S * .3, x + (r() - .5) * 6, S * .7, x, S);g.stroke();}
      g.fillStyle = 'rgba(60,40,30,.25)';g.beginPath();g.ellipse(S * .62, S * .4, 2.2, 4, 0, 0, 7);g.fill();
    }else{
      g.fillStyle = '#cfcbd6';g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(43,34,51,.55)';g.lineWidth = 2;
      for(let row = 0; row < 3; row++){
        const y = row * S / 3;g.beginPath();g.moveTo(0, y);g.lineTo(S, y);g.stroke();
        for(let k = 0; k < 2; k++){const x = (k * S / 2 + (row % 2) * S / 4) % S;g.beginPath();g.moveTo(x, y);g.lineTo(x, y + S / 3);g.stroke();}
        g.fillStyle = 'rgba(255,255,255,.18)';g.fillRect(0, y + 2, S, 3);
      }
    }
    const t = new THREE.CanvasTexture(c);t.colorSpace = THREE.SRGBColorSpace;t.wrapS = t.wrapT = THREE.RepeatWrapping;t.anisotropy = 4;
    return t;
  }
  groundMaterial(kind, m, variant){
    const key = `${kind}:${maskKey(m)}:${variant}`;
    let mat = this.materials.get(key);
    if(!mat){
      const tex = new THREE.CanvasTexture(groundCanvas(kind, m, variant));tex.colorSpace = THREE.SRGBColorSpace;tex.anisotropy = 4;
      mat = new THREE.MeshBasicMaterial({map: tex, alphaTest: .5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2});
      this.r.bindNight(mat);this.materials.set(key, mat);
    }
    return {key, mat};
  }
  clearGround(){for(const m of this.groundMeshes){this.group.remove(m);m.geometry.dispose();}this.groundMeshes = [];}
  buildGround(world){
    this.clearGround();
    const cells = world.tiles?.cells;if(!cells)return;
    const buckets = new Map();
    for(const [key, tile] of Object.entries(cells)){
      if(!tile?.g || !GROUND_LOOK[tile.g])continue;
      const [i, j] = key.split(',').map(Number), m = groundLinks(world, i, j, tile.g);
      const variant = Math.floor(hash(i, j, tile.g === 'soil' ? 0 : 1) * (VARIANTS[tile.g] || 1));
      const {key: mk, mat} = this.groundMaterial(tile.g, m, variant);
      let b = buckets.get(mk);if(!b){b = {mat, pos: [], uv: []};buckets.set(mk, b);}
      const x0 = i * CELL, x1 = x0 + CELL, z0 = j * CELL, z1 = z0 + CELL, y = tile.g === 'soil' ? FLOOR_Y : FLOOR_Y + .004;
      b.pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
      b.uv.push(0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1);
    }
    for(const b of buckets.values()){
      const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      const mesh = new THREE.Mesh(g, b.mat);mesh.renderOrder = -1;this.group.add(mesh);this.groundMeshes.push(mesh);
    }
  }
  clearBarriers(){for(const m of this.barrierMeshes){this.group.remove(m);m.geometry.dispose();}this.barrierMeshes = [];}
  buildBarriers(world){
    this.clearBarriers();
    const index = barrierIndex(world), wood = new Mesher(), stone = new Mesher(), roomWood = new Mesher(), roomStone = new Mesher(), shadow = [];
    const into = {fence: wood, wall: wood, stonewall: stone, timberwall: roomWood, masonwall: roomStone};
    for(const b of index.values()){
      if(b.type === 'gate')continue;
      const links = linksOf(b, index), reach = reachOf(b, links), {x, z} = centerOf(b.i, b.j);
      LINKS = links;
      if(into[b.type])addBarrier(into[b.type], b, x, z, reach, hash(b.i, b.j, 2));
      shadowOf(shadow, x, z, reach, b.type === 'fence' ? .16 : ROOM_KINDS.has(b.type) ? .36 : .3);
    }
    for(const b of index.values()){if(b.type === 'gate'){const {x, z} = centerOf(b.i, b.j);shadowOf(shadow, x, z, gateAxis(b) === 'ew' ? {e: true, w: true} : {n: true, s: true}, .12);}}
    LINKS = null;
    for(const [M, mat, ink] of [[wood, this.wood, this.ink], [stone, this.stone, this.ink], [roomWood, this.roomWood, this.roomInk], [roomStone, this.roomStone, this.roomInk]]){
      if(!M.pos.length)continue;
      const body = new THREE.Mesh(M.geometry(), mat), hull = new THREE.Mesh(M.hullGeometry(), ink);
      this.group.add(body, hull);this.barrierMeshes.push(body, hull);
    }
    if(shadow.length){
      const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(shadow, 3));
      const mesh = new THREE.Mesh(g, this.shadowMat);mesh.renderOrder = -.5;this.group.add(mesh);this.barrierMeshes.push(mesh);
    }
  }
  gateGroup(){
    const G = this.gateGeo, part = (p) => {const g = new THREE.Group();g.add(new THREE.Mesh(p.geo, this.wood), new THREE.Mesh(p.hull, this.ink));return g;};
    const root = new THREE.Group(), left = new THREE.Group(), right = new THREE.Group();
    root.add(part(G.frame));left.add(part(G.left));right.add(part(G.right));
    left.position.x = -GATE_HALF + .08;right.position.x = GATE_HALF - .08;root.add(left, right);
    this.group.add(root);
    return {root, left, right, angle: 0};
  }
  syncGates(world, dt){
    const seen = new Set();
    for(const b of world.buildings){
      if(!b.grid || b.type !== 'gate' || b.hp <= 0)continue;
      seen.add(b.id);
      let g = this.gates.get(b.id);if(!g){g = this.gateGroup();this.gates.set(b.id, g);g.angle = b.open ? 1 : 0;}
      const {x, z} = centerOf(b.i, b.j), rot = b.rotation | 0;
      g.root.position.set(x, 0, z);g.root.rotation.y = rot % 2 ? Math.PI / 2 : 0;
      // Leaves swing to the side the gate faces (rotation 0/1 one way, 2/3 the other), with a small overshoot.
      const target = b.open ? 1 : 0;g.v = (g.v || 0) + ((target - g.angle) * 90 - (g.v || 0) * 11) * dt;g.angle += g.v * dt;
      const swing = (rot >= 2 ? -1 : 1) * (rot % 2 ? -1 : 1), a = g.angle * Math.PI * .47 * swing;
      g.left.rotation.y = -a;g.right.rotation.y = a;
    }
    for(const [id, g] of this.gates)if(!seen.has(id)){this.group.remove(g.root);this.gates.delete(id);}
  }
  /** Health bars over walls and gates that have taken blows, like the ones over camp objects (renderer.mjs). */
  syncHealth(world, clock){
    const bars = this.bars ||= new Map(), seen = new Set(), memo = this.hpMemo ||= new Map();
    for(const b of world.buildings){
      if(!b.grid || !(b.hp > 0))continue;
      let m = memo.get(b.id);if(!m){m = {};memo.set(b.id, m);}
      const show = recentHit(m, b.hp, clock);
      if(!(b.hp < b.maxHp) || show <= .02)continue;
      seen.add(b.id);
      let bar = bars.get(b.id);
      if(!bar){
        const back = new THREE.Sprite(new THREE.SpriteMaterial({color: 0x302834, depthWrite: false, depthTest: false})), fill = new THREE.Sprite(new THREE.SpriteMaterial({color: 0xd2c395, depthWrite: false, depthTest: false}));
        fill.center.set(0, .5);back.renderOrder = fill.renderOrder = 6;back.material.transparent = fill.material.transparent = true;this.group.add(back, fill);bar = {back, fill};bars.set(b.id, bar);
      }
      bar.back.material.opacity = bar.fill.material.opacity = show;
      const {x, z} = centerOf(b.i, b.j), y = ROOM_KINDS.has(b.type) ? 2.1 : 1.45, k = Math.max(0, b.hp / b.maxHp);
      bar.back.position.set(x, y, z);bar.back.scale.set(1.1, .09, 1);
      bar.fill.position.set(x - .51, y, z + .02);bar.fill.scale.set(1.02 * k, .05, 1);bar.fill.material.color.set(k < .35 ? 0xdf9383 : 0xd2c395);
    }
    for(const [id, bar] of bars)if(!seen.has(id)){this.group.remove(bar.back, bar.fill);bar.back.material.dispose();bar.fill.material.dispose();bars.delete(id);}
    if(memo.size > bars.size + 64){const live = new Set(world.buildings.map(b => b.id));for(const id of memo.keys())if(!live.has(id))memo.delete(id);}
  }
  /** Room walls near and in front of the local player dither away; eased so walking past doesn't pop. */
  syncPeek(world, dt){
    const p = this.r.localId && world.player?.(this.r.localId), v = this.peek.value;
    const want = p && !p.down && world.buildings.some(b => b.grid && ROOM_KINDS.has(b.type) && b.hp > 0 && b.z > p.z - .6 && b.z < p.z + 4 && Math.abs(b.x - p.x) < 3.2) ? 1 : 0;
    if(p){v.x = p.x;v.y = p.z;}
    v.z += (want - v.z) * Math.min(1, dt * 6);
  }
  /** Ghost of what the active tool would put under the cursor, joined to what is already there. */
  syncGhost(world, ui){
    const tool = ui && TOOLS[ui.tool];
    const want = tool?.kind === 'barrier' && ui.cursor ? `${tool.type}:${ui.cursor.i},${ui.cursor.j}:${ui.rotation}:${ui.valid}:${this.barrierKey}` : '';
    if(want === this.ghostKey)return;
    this.ghostKey = want;
    if(this.ghost){this.group.remove(this.ghost);this.ghost.traverse(o => {if(o.geometry && !Object.values(this.gateGeo).some(p => p.geo === o.geometry || p.hull === o.geometry))o.geometry.dispose();});this.ghost = null;}
    if(!want)return;
    const {i, j} = ui.cursor, {x, z} = centerOf(i, j), mat = ui.valid ? this.ghostMats.ok : this.ghostMats.bad;
    const index = barrierIndex(world), fake = {i, j, type: tool.type, rotation: ui.rotation | 0};
    let reach;
    if(tool.type === 'gate'){
      const has = (di, dj) => index.has(keyOf(i + di, j + dj)), ew = has(1, 0) || has(-1, 0), ns = has(0, 1) || has(0, -1);
      fake.rotation = ew && !ns ? 0 : ns && !ew ? 1 : fake.rotation;
    }else reach = reachOf(fake, linksOf(fake, index));
    const g = new THREE.Group();
    if(tool.type === 'gate'){
      const G = this.gateGeo;
      for(const p of [G.frame, G.left, G.right]){const m = new THREE.Mesh(p.geo, mat);if(p !== G.frame)m.position.x = p === G.left ? -GATE_HALF + .08 : GATE_HALF - .08;g.add(m);}
      g.rotation.y = fake.rotation % 2 ? Math.PI / 2 : 0;g.position.set(x, 0, z);
    }else{
      const M = new Mesher();LINKS = linksOf(fake, index);
      addBarrier(M, fake, x, z, reach, .5);
      LINKS = null;g.add(new THREE.Mesh(M.geometry(), mat));
    }
    g.renderOrder = 3;this.group.add(g);this.ghost = g;
  }
  /** A see-through copy of the camp object in hand, standing where it would go and at the size it will have. */
  syncObjectGhost(ui){
    const tool = ui && TOOLS[ui.tool], type = tool?.kind === 'object' && ui.cursor ? tool.type : '';
    if(this.objectGhost && this.objectGhost.userData.type !== type){this.group.remove(this.objectGhost);this.objectGhost.material.map?.dispose();this.objectGhost.material.dispose();this.objectGhost = null;}
    if(!type)return;
    const def = this.r.theme.sprites[type], base = this.r.textures.get(type);
    if(!def || !base)return;
    if(!this.objectGhost){
      const map = base.clone();map.needsUpdate = true;map.repeat.set(1 / (def.columns || 1), 1 / (def.rows || 1));map.offset.set(0, 1 - 1 / (def.rows || 1));
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map, transparent: true, depthWrite: false, opacity: .72}));
      sprite.center.set(...(def.anchor || [.5, 0]));sprite.renderOrder = 3;sprite.userData.type = type;
      this.group.add(sprite);this.objectGhost = sprite;
    }
    const {w, h} = OBJECTS[type], {x, z} = objectSpot(ui.cursor.i, ui.cursor.j, w, h), k = objectScale(type);
    this.objectGhost.position.set(x, 0, z);this.objectGhost.scale.set(def.size[0] * k, def.size[1] * k, 1);
    this.objectGhost.material.color.set(ui.valid ? '#e4f5d2' : '#ff9a8f');
  }
  /** The cursor cell and a fading grid around it while a tool is out. */
  syncCursor(ui, clock){
    if(!this.gridMesh){
      const S = 512, c = document.createElement('canvas');c.width = c.height = S;const g = c.getContext('2d'), n = 9, cs = S / n;
      for(let k = 0; k <= n; k++){g.strokeStyle = 'rgba(246,234,210,.9)';g.lineWidth = 2;g.beginPath();g.moveTo(k * cs, 0);g.lineTo(k * cs, S);g.moveTo(0, k * cs);g.lineTo(S, k * cs);g.stroke();}
      g.globalCompositeOperation = 'destination-in';const grad = g.createRadialGradient(S / 2, S / 2, cs * .6, S / 2, S / 2, S / 2);grad.addColorStop(0, 'rgba(0,0,0,.5)');grad.addColorStop(1, 'rgba(0,0,0,0)');g.fillStyle = grad;g.fillRect(0, 0, S, S);
      const tex = new THREE.CanvasTexture(c);tex.colorSpace = THREE.SRGBColorSpace;
      this.gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(9 * CELL, 9 * CELL), new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false}));
      this.gridMesh.rotation.x = -Math.PI / 2;this.gridMesh.renderOrder = 1;this.group.add(this.gridMesh);
      const cc = document.createElement('canvas');cc.width = cc.height = 128;const q = cc.getContext('2d');
      q.lineWidth = 10;q.strokeStyle = INK;q.beginPath();q.roundRect(10, 10, 108, 108, 18);q.stroke();q.lineWidth = 5;q.strokeStyle = '#ffffff';q.stroke();
      q.fillStyle = 'rgba(255,255,255,.22)';q.fill();
      const ct = new THREE.CanvasTexture(cc);ct.colorSpace = THREE.SRGBColorSpace;
      this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 1.04, CELL * 1.04), new THREE.MeshBasicMaterial({map: ct, transparent: true, depthWrite: false, depthTest: false}));
      this.cursor.rotation.x = -Math.PI / 2;this.cursor.renderOrder = 4;this.group.add(this.cursor);
    }
    const on = !!(ui?.tool && ui.cursor);
    this.gridMesh.visible = this.cursor.visible = on;
    if(!on)return;
    const {w, h} = sizeOf(ui.tool), {x, z} = footCenter(ui.cursor.i, ui.cursor.j, w, h);
    this.gridMesh.position.set(x, .03, z);
    const pulse = 1 + Math.sin(clock * 6) * .03;
    this.cursor.position.set(x, .05, z);this.cursor.scale.set(w * pulse, h * pulse, 1);
    const tool = TOOLS[ui.tool];
    this.cursor.material.color.set(!ui.valid ? '#ff8a7e' : tool?.kind === 'remove' ? '#ffb38a' : tool?.kind === 'harvest' || tool?.kind === 'plant' ? '#f6e3a0' : '#bfe8a6');
  }
  effect(ev){
    const color = ev.tool === 'chip:stone' ? '#a8a3b8' : ev.tool === 'chip:wood' ? '#a7744c' : ev.tool === 'remove' ? '#b9a48a' : ev.tool === 'harvest' ? '#f4d28a' : ev.tool === 'till' || ev.tool?.startsWith?.('plant') ? '#7a5642' : '#d8c7a6';
    for(let k = 0; k < 7; k++){
      const m = new THREE.Mesh(this.puffGeo ||= new THREE.PlaneGeometry(.14, .14), new THREE.MeshBasicMaterial({color, transparent: true, depthWrite: false}));
      const a = k / 7 * Math.PI * 2 + Math.random() * .5;
      m.position.set(ev.x + Math.cos(a) * .2, .15, ev.z + Math.sin(a) * .2);m.renderOrder = 5;this.group.add(m);
      this.effects.push({m, vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.1, vy: 1.6 + Math.random() * 1.2, life: 0});
    }
  }
  update(world, frame, dt, ui, clock){
    const groundKey = `${world.seed}:${world.tiles?.rev ?? -1}:${Object.keys(world.tiles?.cells || {}).length}`;
    if(groundKey !== this.groundKey){this.groundKey = groundKey;this.buildGround(world);}
    let n = 0, h = 0;
    for(const b of world.buildings)if(b.grid && b.hp > 0){n++;h = (h * 31 + (b.i * 7349 + b.j * 1931) * 4 + BARRIER_ORDER.indexOf(b.type) * 97 + (b.rotation | 0)) % 1000000007;}
    const barrierKey = `${world.seed}:${n}:${h}`;
    if(barrierKey !== this.barrierKey){this.barrierKey = barrierKey;this.buildBarriers(world);}
    this.syncPeek(world, dt);this.syncHealth(world, clock);this.syncGates(world, Math.min(dt, .05));this.syncGhost(world, ui);this.syncObjectGhost(ui);this.syncCursor(ui, clock);
    for(const ev of world.events)if(ev.id > this.lastEvent){
      if(world.time - ev.at < 1){
        if(ev.type === 'tile')this.effect(ev);
        // A blow on a wall knocks chips off it (mobs.mjs siege).
        else if(ev.type === 'hit'){const b = barrierAt(world, ...cellAt(ev.x, ev.z));if(b)this.effect({x: ev.x, z: ev.z, tool: b.type === 'stonewall' || b.type === 'masonwall' ? 'chip:stone' : 'chip:wood'});}
      }
      this.lastEvent = ev.id;
    }
    this.effects = this.effects.filter(e => {
      e.life += dt;e.vy -= 7 * dt;e.m.position.x += e.vx * dt;e.m.position.z += e.vz * dt;e.m.position.y = Math.max(.02, e.m.position.y + e.vy * dt);
      e.m.material.opacity = Math.max(0, 1 - e.life * 2.2);e.m.quaternion.copy(this.r.camera.quaternion);
      if(e.life > .45){this.group.remove(e.m);e.m.material.dispose();return false;}return true;
    });
  }
  dispose(){
    this.clearGround();this.clearBarriers();
    for(const bar of this.bars?.values() || []){this.group.remove(bar.back, bar.fill);}this.bars?.clear();
    for(const g of this.gates.values())this.group.remove(g.root);this.gates.clear();
    this.groundKey = this.barrierKey = '';this.lastEvent = 0;
  }
}
const BARRIER_ORDER = Object.keys(BARRIERS);

function shadowOf(out, x, z, reach, half){
  const y = .012, oz = .07;
  const quad = (x0, z0, x1, z1) => out.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
  quad(x - (reach.w ? H : half), z - half + oz, x + (reach.e ? H : half), z + half + oz);
  if(reach.n)quad(x - half, z - H + oz, x + half, z - half + oz);
  if(reach.s)quad(x - half, z + half + oz, x + half, z + H + oz);
}

// ------------------------------------------------------------------ canvas fallback
/** Flat painter for canvas-renderer.mjs: ground tiles, barriers as inked posts and rails, the cursor. */
export function paintHomesteadCanvas(r, c, world, frame, ui){
  const cells = world.tiles?.cells || {}, unit = r.scale;
  c.save();c.lineJoin = 'round';c.lineCap = 'round';
  for(const [key, tile] of Object.entries(cells)){
    const look = GROUND_LOOK[tile.g];if(!look)continue;
    const [i, j] = key.split(',').map(Number), a = r.screenPoint(i * CELL, j * CELL), b = r.screenPoint((i + 1) * CELL, (j + 1) * CELL), m = groundLinks(world, i, j, tile.g);
    c.fillStyle = look.flat;c.fillRect(a.x - .5, a.y - .5, b.x - a.x + 1, b.y - a.y + 1);
    c.strokeStyle = INK;c.lineWidth = Math.max(1, unit * .04);c.beginPath();
    if(!m.n){c.moveTo(a.x, a.y);c.lineTo(b.x, a.y);}if(!m.s){c.moveTo(a.x, b.y);c.lineTo(b.x, b.y);}
    if(!m.w){c.moveTo(a.x, a.y);c.lineTo(a.x, b.y);}if(!m.e){c.moveTo(b.x, a.y);c.lineTo(b.x, b.y);}c.stroke();
  }
  const index = barrierIndex(world);
  const list = [...index.values()].sort((p, q) => p.j - q.j);
  for(const b of list){
    const {x, z} = centerOf(b.i, b.j), reach = b.type === 'gate' ? (gateAxis(b) === 'ew' ? {e: true, w: true} : {n: true, s: true}) : reachOf(b, linksOf(b, index));
    const room = ROOM_KINDS.has(b.type), tall = b.type === 'fence' ? .9 : b.type === 'gate' ? .95 : room ? 1.7 : 1.15, col = b.type === 'stonewall' || b.type === 'masonwall' ? '#9a95ab' : '#8a5a3c';
    c.lineWidth = Math.max(2, unit * (b.type === 'fence' ? .09 : room ? .42 : .3));
    for(const [dir, on] of Object.entries(reach)){
      if(!on)continue;
      const [dx, dz] = STEP[dir], e = r.screenPoint(x + dx * H, z + dz * H, tall * .6), s0 = r.screenPoint(x, z, tall * .6);
      if(b.type === 'gate' && b.open)continue;
      c.strokeStyle = INK;c.lineWidth += 3;c.beginPath();c.moveTo(s0.x, s0.y);c.lineTo(e.x, e.y);c.stroke();c.lineWidth -= 3;
      c.strokeStyle = col;c.beginPath();c.moveTo(s0.x, s0.y);c.lineTo(e.x, e.y);c.stroke();
    }
    const base = r.screenPoint(x, z, 0), top = r.screenPoint(x, z, tall);
    c.strokeStyle = INK;c.lineWidth = Math.max(3, unit * .2);c.beginPath();c.moveTo(base.x, base.y);c.lineTo(top.x, top.y);c.stroke();
    c.strokeStyle = col;c.lineWidth = Math.max(1.5, unit * .13);c.stroke();
  }
  if(ui?.tool && ui.cursor){
    const {w, h} = sizeOf(ui.tool), a = r.screenPoint(ui.cursor.i * CELL, ui.cursor.j * CELL), b = r.screenPoint((ui.cursor.i + w) * CELL, (ui.cursor.j + h) * CELL);
    c.strokeStyle = ui.valid ? '#bfe8a6' : '#ff8a7e';c.lineWidth = 2.5;c.strokeRect(a.x + 2, a.y + 2, b.x - a.x - 4, b.y - a.y - 4);
  }
  c.restore();
}

/** Crops as entries for a renderer's sprite list. */
export function cropSprites(world, entities){
  return entities.map(e => ({e, key: `crop-${e.type}`, kind: 'crop'}));
}
export const cropGlow = type => CROPS[type]?.glow || null;
export {cellAt};
