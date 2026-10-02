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
import {BARRIERS, CROPS, barrierIndex, cellAt, centerOf, gateAxis, groundLinks, keyOf, linksOf, tileAt, TOOLS} from './homestead.mjs?v=harvest-18';

const INK = '#2b2233';
const TEX = 128;
const FLOOR_Y = .014;
export const GROUND_LOOK = Object.freeze({
  soil: {fill: '#6b4836', rim: '#8c6248', edge: '#4a3127', flat: '#6b4836'},
  plank: {fill: '#9a6b47', rim: '#6b4330', edge: '#5f3a2a', flat: '#9a6b47'},
  flagstone: {fill: '#5b5666', rim: '#6c6679', edge: '#4a4656', flat: '#8f8a9e'},
});
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
  const rows = 4, h = S / rows;
  for(let k = 0; k < rows; k++){
    const y = k * h;
    g.fillStyle = '#7d5640';g.fillRect(0, y + h * .12, S, h * .34);
    g.fillStyle = '#8f6549';g.fillRect(0, y + h * .14, S, h * .1);
    g.fillStyle = '#4b3126';g.fillRect(0, y + h * .62, S, h * .16);
  }
  const r = rng(91 + variant * 17);
  for(let n = 0; n < 34; n++){
    const x = r() * S, y = r() * S, s = 1 + r() * 2.4;
    g.fillStyle = r() < .5 ? 'rgba(40,26,22,.55)' : 'rgba(170,128,96,.45)';
    g.beginPath();g.ellipse(x, y, s * 1.3, s, 0, 0, Math.PI * 2);g.fill();
  }
}
function paintPlank(g, S, variant){
  const rows = 4, h = S / rows, tones = ['#9a6b47', '#8d603f', '#a3734c', '#93653f'];
  const joints = [[.3], [.72], [.12, .86], [.55]];
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
function paintFlagstone(g, S, variant){
  g.fillStyle = '#4d4a57';g.fillRect(0, 0, S, S);
  const r = rng(301 + variant * 13), tones = ['#8f8a9e', '#9a95aa', '#857f94', '#a29db2'];
  const cells = variant % 2 ? [[0, 0, .55, .5], [.55, 0, .45, .5], [0, .5, .4, .5], [.4, .5, .6, .5]] : [[0, 0, .45, .55], [.45, 0, .55, .55], [0, .55, .62, .45], [.62, .55, .38, .45]];
  for(const [cx, cy, cw, ch] of cells){
    const x = cx * S + 3, y = cy * S + 3, w = cw * S - 6, hh = ch * S - 6, rad = 7 + r() * 5;
    g.fillStyle = tones[Math.floor(r() * tones.length)];
    g.beginPath();g.roundRect(x + (r() - .5) * 2, y + (r() - .5) * 2, w, hh, rad);g.fill();
    g.fillStyle = 'rgba(255,255,255,.13)';g.beginPath();g.roundRect(x + 2, y + 2, w - 6, hh * .3, rad);g.fill();
    g.fillStyle = 'rgba(30,24,40,.18)';g.beginPath();g.roundRect(x + 4, y + hh * .72, w - 6, hh * .26, rad);g.fill();
    g.strokeStyle = 'rgba(43,34,51,.55)';g.lineWidth = 1.6;g.beginPath();g.roundRect(x, y, w, hh, rad);g.stroke();
  }
}
const PAINT = {soil: paintSoil, plank: paintPlank, flagstone: paintFlagstone};

function maskKey(m){return ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map(k => m[k] ? 1 : 0).join('');}
function groundCanvas(kind, m, variant){
  const S = TEX, c = document.createElement('canvas');c.width = c.height = S;
  const g = c.getContext('2d'), s = tileShape(S, m), L = GROUND_LOOK[kind];
  g.save();shapePath(g, s);g.clip();PAINT[kind](g, S, variant);
  // A rim just inside the open edges: a raised lip of earth, a skirting beam, a kerb of stone.
  g.lineWidth = S * (kind === 'soil' ? .1 : .085);g.strokeStyle = L.rim;
  g.globalAlpha = kind === 'soil' ? .9 : 1;
  const inner = {...s, x0: s.x0 + (m.w ? 0 : S * .045), x1: s.x1 - (m.e ? 0 : S * .045), y0: s.y0 + (m.n ? 0 : S * .045), y1: s.y1 - (m.s ? 0 : S * .045)};
  strokeOpen(g, S, inner, m, S * (kind === 'soil' ? .1 : .085), L.rim);
  g.globalAlpha = 1;
  g.restore();
  cutInner(g, S, s, m);
  strokeOpen(g, S, s, m, S * .045, INK);
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
    const [dx, dz] = STEP[dir], len = .5, mx = x + dx * len / 2, mz = z + dz * len / 2;
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
    stake(x + dx * .25, z + dz * .25);
    if(dir === 'e' || dir === 's')stake(x + dx * .5, z + dz * .5);
    else if(!linkedAt(b, dir))stake(x + dx * .5, z + dz * .5);
    if(dx)for(const y of [.32, .86])M.box(x + dx * .25, y, z + .115, .5, .07, .04, WOOD_D, {grain: 'x', ink: .018});
  }
}
let LINKS = null;
const linkedAt = (b, dir) => !!LINKS?.[dir];
function addStoneWall(M, x, z, reach){
  M.box(x, .5, z, .52, 1.0, .52, STONE);
  M.box(x, 1.04, z, .58, .09, .58, STONE_L, {ink: .022});
  for(const [dir, on] of Object.entries(reach)){
    if(!on)continue;
    const [dx, dz] = STEP[dir], mx = x + dx * .25, mz = z + dz * .25;
    if(dx){M.box(mx, .46, mz, .5, .92, .44, STONE, {grain: 'x'});M.box(mx, .95, mz, .5, .07, .5, STONE_L, {grain: 'x', ink: .02});}
    else{M.box(mx, .46, mz, .44, .92, .5, STONE, {grain: 'z'});M.box(mx, .95, mz, .5, .07, .5, STONE_L, {grain: 'z', ink: .02});}
  }
}

// Gate parts in the gate's own frame: the opening runs along x, leaves hinge on the posts.
const GATE_HALF = .44, LEAF = .4;
function gateFrame(M){
  for(const s of [-1, 1]){M.box(s * GATE_HALF, .52, 0, .16, 1.04, .16, WOOD_D);M.tip(s * GATE_HALF, 1.04, 0, .16, .12, WOOD_D);}
}
function gateLeaf(M, side){
  // Local frame: hinge at the origin, the leaf runs toward +x (side 1) or -x (side -1).
  const w = LEAF - .02;
  for(let k = 0; k < 3; k++){
    const cx = side * (.07 + k * (w - .1) / 2), h = .78 - Math.abs(k - 1) * .04;
    M.box(cx, .1 + h / 2, 0, .1, h, .05, WOOD, {grain: 'y', ink: .02});
  }
  for(const y of [.28, .72])M.box(side * w / 2, y, .035, w, .08, .045, WOOD_D, {grain: 'x', ink: .02});
  const m = new THREE.Matrix4().makeTranslation(side * w / 2, .5, .035).multiply(new THREE.Matrix4().makeRotationZ(side * -.86));
  M.box(0, 0, 0, .52, .07, .04, WOOD_L, {matrix: m, grain: 'x', ink: .018});
}

// ------------------------------------------------------------------ the layer
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
      const variant = tile.g === 'soil' ? Math.floor(hash(i, j) * 3) : Math.floor(hash(i, j, 1) * 4);
      const {key: mk, mat} = this.groundMaterial(tile.g, m, variant);
      let b = buckets.get(mk);if(!b){b = {mat, pos: [], uv: []};buckets.set(mk, b);}
      const x0 = i, x1 = i + 1, z0 = j, z1 = j + 1, y = tile.g === 'soil' ? FLOOR_Y : FLOOR_Y + .004;
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
    const index = barrierIndex(world), wood = new Mesher(), stone = new Mesher(), shadow = [];
    for(const b of index.values()){
      if(b.type === 'gate')continue;
      const links = linksOf(b, index), reach = reachOf(b, links), {x, z} = centerOf(b.i, b.j);
      LINKS = links;
      if(b.type === 'fence')addFence(wood, x, z, reach, hash(b.i, b.j, 2));
      else if(b.type === 'wall')addPalisade(wood, b, x, z, reach);
      else if(b.type === 'stonewall')addStoneWall(stone, x, z, reach);
      shadowOf(shadow, x, z, reach, b.type === 'fence' ? .16 : .3);
    }
    for(const b of index.values()){if(b.type === 'gate'){const {x, z} = centerOf(b.i, b.j);shadowOf(shadow, x, z, gateAxis(b) === 'ew' ? {e: true, w: true} : {n: true, s: true}, .12);}}
    LINKS = null;
    for(const [M, mat] of [[wood, this.wood], [stone, this.stone]]){
      if(!M.pos.length)continue;
      const body = new THREE.Mesh(M.geometry(), mat), hull = new THREE.Mesh(M.hullGeometry(), this.ink);
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
      if(tool.type === 'fence')addFence(M, x, z, reach, .5);else if(tool.type === 'wall')addPalisade(M, fake, x, z, reach);else addStoneWall(M, x, z, reach);
      LINKS = null;g.add(new THREE.Mesh(M.geometry(), mat));
    }
    g.renderOrder = 3;this.group.add(g);this.ghost = g;
  }
  /** The cursor cell and a fading grid around it while a tool is out. */
  syncCursor(ui, clock){
    if(!this.gridMesh){
      const S = 512, c = document.createElement('canvas');c.width = c.height = S;const g = c.getContext('2d'), n = 9, cs = S / n;
      for(let k = 0; k <= n; k++){g.strokeStyle = 'rgba(246,234,210,.9)';g.lineWidth = 2;g.beginPath();g.moveTo(k * cs, 0);g.lineTo(k * cs, S);g.moveTo(0, k * cs);g.lineTo(S, k * cs);g.stroke();}
      g.globalCompositeOperation = 'destination-in';const grad = g.createRadialGradient(S / 2, S / 2, cs * .6, S / 2, S / 2, S / 2);grad.addColorStop(0, 'rgba(0,0,0,.5)');grad.addColorStop(1, 'rgba(0,0,0,0)');g.fillStyle = grad;g.fillRect(0, 0, S, S);
      const tex = new THREE.CanvasTexture(c);tex.colorSpace = THREE.SRGBColorSpace;
      this.gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false}));
      this.gridMesh.rotation.x = -Math.PI / 2;this.gridMesh.renderOrder = 1;this.group.add(this.gridMesh);
      const cc = document.createElement('canvas');cc.width = cc.height = 128;const q = cc.getContext('2d');
      q.lineWidth = 10;q.strokeStyle = INK;q.beginPath();q.roundRect(10, 10, 108, 108, 18);q.stroke();q.lineWidth = 5;q.strokeStyle = '#ffffff';q.stroke();
      q.fillStyle = 'rgba(255,255,255,.22)';q.fill();
      const ct = new THREE.CanvasTexture(cc);ct.colorSpace = THREE.SRGBColorSpace;
      this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.08), new THREE.MeshBasicMaterial({map: ct, transparent: true, depthWrite: false, depthTest: false}));
      this.cursor.rotation.x = -Math.PI / 2;this.cursor.renderOrder = 4;this.group.add(this.cursor);
    }
    const on = !!(ui?.tool && ui.cursor);
    this.gridMesh.visible = this.cursor.visible = on;
    if(!on)return;
    const {x, z} = centerOf(ui.cursor.i, ui.cursor.j);
    this.gridMesh.position.set(x, .03, z);
    const pulse = 1 + Math.sin(clock * 6) * .03;
    this.cursor.position.set(x, .05, z);this.cursor.scale.set(pulse, pulse, 1);
    const tool = TOOLS[ui.tool];
    this.cursor.material.color.set(!ui.valid ? '#ff8a7e' : tool?.kind === 'remove' ? '#ffb38a' : tool?.kind === 'harvest' || tool?.kind === 'plant' ? '#f6e3a0' : '#bfe8a6');
  }
  effect(ev){
    const color = ev.tool === 'remove' ? '#b9a48a' : ev.tool === 'harvest' ? '#f4d28a' : ev.tool === 'till' || ev.tool?.startsWith?.('plant') ? '#7a5642' : '#d8c7a6';
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
    this.syncGates(world, Math.min(dt, .05));this.syncGhost(world, ui);this.syncCursor(ui, clock);
    for(const ev of world.events)if(ev.id > this.lastEvent){if(ev.type === 'tile' && world.time - ev.at < 1)this.effect(ev);this.lastEvent = ev.id;}
    this.effects = this.effects.filter(e => {
      e.life += dt;e.vy -= 7 * dt;e.m.position.x += e.vx * dt;e.m.position.z += e.vz * dt;e.m.position.y = Math.max(.02, e.m.position.y + e.vy * dt);
      e.m.material.opacity = Math.max(0, 1 - e.life * 2.2);e.m.quaternion.copy(this.r.camera.quaternion);
      if(e.life > .45){this.group.remove(e.m);e.m.material.dispose();return false;}return true;
    });
  }
  dispose(){
    this.clearGround();this.clearBarriers();
    for(const g of this.gates.values())this.group.remove(g.root);this.gates.clear();
    this.groundKey = this.barrierKey = '';this.lastEvent = 0;
  }
}
const BARRIER_ORDER = Object.keys(BARRIERS);

function shadowOf(out, x, z, reach, half){
  const y = .012, oz = .07;
  const quad = (x0, z0, x1, z1) => out.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
  quad(x - (reach.w ? .5 : half), z - half + oz, x + (reach.e ? .5 : half), z + half + oz);
  if(reach.n)quad(x - half, z - .5 + oz, x + half, z - half + oz);
  if(reach.s)quad(x - half, z + half + oz, x + half, z + .5 + oz);
}

// ------------------------------------------------------------------ canvas fallback
/** Flat painter for canvas-renderer.mjs: ground tiles, barriers as inked posts and rails, the cursor. */
export function paintHomesteadCanvas(r, c, world, frame, ui){
  const cells = world.tiles?.cells || {}, unit = r.scale;
  c.save();c.lineJoin = 'round';c.lineCap = 'round';
  for(const [key, tile] of Object.entries(cells)){
    const look = GROUND_LOOK[tile.g];if(!look)continue;
    const [i, j] = key.split(',').map(Number), a = r.screenPoint(i, j), b = r.screenPoint(i + 1, j + 1), m = groundLinks(world, i, j, tile.g);
    c.fillStyle = look.flat;c.fillRect(a.x - .5, a.y - .5, b.x - a.x + 1, b.y - a.y + 1);
    c.strokeStyle = INK;c.lineWidth = Math.max(1, unit * .04);c.beginPath();
    if(!m.n){c.moveTo(a.x, a.y);c.lineTo(b.x, a.y);}if(!m.s){c.moveTo(a.x, b.y);c.lineTo(b.x, b.y);}
    if(!m.w){c.moveTo(a.x, a.y);c.lineTo(a.x, b.y);}if(!m.e){c.moveTo(b.x, a.y);c.lineTo(b.x, b.y);}c.stroke();
  }
  const index = barrierIndex(world);
  const list = [...index.values()].sort((p, q) => p.j - q.j);
  for(const b of list){
    const {x, z} = centerOf(b.i, b.j), reach = b.type === 'gate' ? (gateAxis(b) === 'ew' ? {e: true, w: true} : {n: true, s: true}) : reachOf(b, linksOf(b, index));
    const tall = b.type === 'fence' ? .9 : b.type === 'gate' ? .95 : 1.15, col = b.type === 'stonewall' ? '#9a95ab' : '#8a5a3c';
    c.lineWidth = Math.max(2, unit * (b.type === 'fence' ? .09 : .3));
    for(const [dir, on] of Object.entries(reach)){
      if(!on)continue;
      const [dx, dz] = STEP[dir], e = r.screenPoint(x + dx * .5, z + dz * .5, tall * .6), s0 = r.screenPoint(x, z, tall * .6);
      if(b.type === 'gate' && b.open)continue;
      c.strokeStyle = INK;c.lineWidth += 3;c.beginPath();c.moveTo(s0.x, s0.y);c.lineTo(e.x, e.y);c.stroke();c.lineWidth -= 3;
      c.strokeStyle = col;c.beginPath();c.moveTo(s0.x, s0.y);c.lineTo(e.x, e.y);c.stroke();
    }
    const base = r.screenPoint(x, z, 0), top = r.screenPoint(x, z, tall);
    c.strokeStyle = INK;c.lineWidth = Math.max(3, unit * .2);c.beginPath();c.moveTo(base.x, base.y);c.lineTo(top.x, top.y);c.stroke();
    c.strokeStyle = col;c.lineWidth = Math.max(1.5, unit * .13);c.stroke();
  }
  if(ui?.tool && ui.cursor){
    const a = r.screenPoint(ui.cursor.i, ui.cursor.j), b = r.screenPoint(ui.cursor.i + 1, ui.cursor.j + 1);
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
