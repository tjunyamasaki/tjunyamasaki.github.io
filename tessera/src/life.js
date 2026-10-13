// The living layer. Each placed tile grows its own little world: walled towns,
// abbeys, farms, forests. Everything static on a tile is merged into one mesh
// whose vertex shader animates the growth, so the board stays cheap to draw.
// Moving things (sheep, travellers, smoke, windmills) are pooled here too.
import * as T from '../vendor/three.module.min.js';
import { RES, TILE_TYPES, rotatePoint, classify } from './tiles.mjs';
import { createRng } from './rng.mjs';
import { shieldSpot } from './art.js';

export const TOP = 0.1;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- templates
function prepare(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
function prism() {
  // Gable roof: ridge runs along z, footprint 1×1, height 1.
  const p = [], a = [-0.5, 0], b = [0.5, 0], c = [0, 1];
  const tri = (p1, p2, p3) => p.push(...p1, ...p2, ...p3);
  const at = (q, z) => [q[0], q[1], z];
  tri(at(a, 0.5), at(b, 0.5), at(c, 0.5));
  tri(at(b, -0.5), at(a, -0.5), at(c, -0.5));
  tri(at(b, 0.5), at(b, -0.5), at(c, -0.5)); tri(at(b, 0.5), at(c, -0.5), at(c, 0.5));
  tri(at(a, -0.5), at(a, 0.5), at(c, 0.5)); tri(at(a, -0.5), at(c, 0.5), at(c, -0.5));
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
const TPL = {
  box: prepare(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  hex: prepare(new T.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0)),
  cyl: prepare(new T.CylinderGeometry(1, 1, 1, 9).translate(0, 0.5, 0)),
  taper: prepare(new T.CylinderGeometry(0.62, 1, 1, 8).translate(0, 0.5, 0)),
  cone: prepare(new T.ConeGeometry(1, 1, 7).translate(0, 0.5, 0)),
  cone4: prepare(new T.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0)),
  ico: prepare(new T.IcosahedronGeometry(1, 0)),
  blob: prepare(new T.IcosahedronGeometry(1, 1)),
  prism: prism(),
};

const tmpM = new T.Matrix4(), tmpN = new T.Matrix3(), tmpQ = new T.Quaternion(), tmpV = new T.Vector3(), tmpS = new T.Vector3();
const tmpE = new T.Euler();
const colorCache = new Map();
const color = hex => { if (!colorCache.has(hex)) colorCache.set(hex, new T.Color(hex)); return colorCache.get(hex); };

class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.piv = []; this.life = []; }
  /** Add a template, scaled and turned about its base; pivot is where it grows from. */
  add(name, o, hex, pivot, birth = 0, sway = 0, glow = 0, jitter = 0) {
    const g = TPL[name];
    tmpQ.setFromEuler(tmpE.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    tmpM.compose(tmpV.set(o.x, o.y || 0, o.z), tmpQ, tmpS.set(o.sx, o.sy ?? o.sx, o.sz ?? o.sx));
    tmpN.getNormalMatrix(tmpM);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    const c = color(hex);
    const k = 1 + jitter;
    const [px, py, pz] = pivot || [o.x, o.y || 0, o.z];
    const v = new T.Vector3(), n = new T.Vector3();
    for (let i = 0; i < P.length; i += 3) {
      v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(tmpM);
      n.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(tmpN).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
      this.piv.push(px, py, pz);
      this.life.push(birth, sway, glow);
    }
  }
  geometry(plain = false) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
    if (!plain) {
      g.setAttribute('aPivot', new T.Float32BufferAttribute(this.piv, 3));
      g.setAttribute('aLife', new T.Float32BufferAttribute(this.life, 3));
    }
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += 0.3;
    return g;
  }
}

// ------------------------------------------------------------------ shaders
export const lifeUniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uWind: { value: 1 } };
const VERTEX_HEAD = `#include <common>
attribute vec3 aPivot;
attribute vec3 aLife;
uniform float uTime;
uniform float uWind;
varying float vGlow;
float growBack(float k) { float c1 = 1.70158; float c3 = c1 + 1.0; float m = k - 1.0; return 1.0 + c3 * m * m * m + c1 * m * m; }`;
const VERTEX_GROW = `vec3 transformed = vec3(position);
float growK = clamp((uTime - aLife.x) / 0.8, 0.0, 1.0);
float growS = growK <= 0.0 ? 0.0 : growBack(growK);
transformed = aPivot + (transformed - aPivot) * growS;
float swayH = max(position.y - aPivot.y, 0.0);
float swayP = aPivot.x * 9.0 + aPivot.z * 7.0;
transformed.x += sin(uTime * 1.7 + swayP) * aLife.y * swayH * uWind;
transformed.z += cos(uTime * 1.3 + swayP * 1.3) * aLife.y * swayH * 0.6 * uWind;
vGlow = aLife.z;`;
function patch(shader, fragment) {
  shader.uniforms.uTime = lifeUniforms.uTime;
  shader.uniforms.uNight = lifeUniforms.uNight;
  shader.uniforms.uWind = lifeUniforms.uWind;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', VERTEX_HEAD).replace('#include <begin_vertex>', VERTEX_GROW);
  if (fragment) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * uNight * vec3(1.0, 0.6, 0.25) * 3.0;');
  }
}
export const lifeMaterial = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, flatShading: true });
lifeMaterial.onBeforeCompile = s => patch(s, true);
lifeMaterial.customProgramCacheKey = () => 'tessera-life';
const lifeDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
lifeDepth.onBeforeCompile = s => patch(s, false);
lifeDepth.customProgramCacheKey = () => 'tessera-life-depth';

// ---------------------------------------------------------- raster helpers
const distCache = new Map();
/** Chamfer distance (in raster cells) from each cell to the nearest cell of another label. */
function edgeDistance(type) {
  if (distCache.has(type.index)) return distCache.get(type.index);
  const L = type.labels, d = new Float32Array(RES * RES).fill(1e9);
  const at = (x, y) => (x < 0 || y < 0 || x >= RES || y >= RES ? 1e9 : d[y * RES + x]);
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
    const i = y * RES + x, l = L[i];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx >= 0 && ny >= 0 && nx < RES && ny < RES && L[ny * RES + nx] !== l) { d[i] = 0.5; break; }
    }
  }
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
    const i = y * RES + x;
    d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.41, at(x + 1, y - 1) + 1.41);
  }
  for (let y = RES - 1; y >= 0; y--) for (let x = RES - 1; x >= 0; x--) {
    const i = y * RES + x;
    d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.41, at(x - 1, y + 1) + 1.41);
  }
  distCache.set(type.index, d);
  return d;
}
const cellUV = i => [((i % RES) + 0.5) / RES, (((i / RES) | 0) + 0.5) / RES];
const labelAtUV = (type, u, v) => type.labels[Math.min(RES - 1, Math.max(0, Math.floor(v * RES))) * RES + Math.min(RES - 1, Math.max(0, Math.floor(u * RES)))];

const WALLS = ['#f1e6cc', '#ead6ad', '#e2c9a0', '#f5eddc', '#dcb994', '#e9dcc0'];
const ROOFS = ['#b4513a', '#c2643e', '#9c4531', '#a95c3b', '#7a5548', '#8d4a3c', '#5f6f86'];
const LEAVES = ['#5c9a3b', '#4f8c36', '#6aa743', '#3f7a35', '#78ad49', '#8bb24a'];
const PINES = ['#2f6a3c', '#3a7542', '#2a5e3a'];
const CROPS = ['#e5c35a', '#d8b34b', '#9cc45a', '#b9cf63', '#a585cf', '#e0a94a'];
const FLOWERS = ['#fff3d1', '#f7d34a', '#ef8fb9', '#b9a2f2', '#f08b5b'];
const STONE = ['#b7a07c', '#ad9572', '#c2ab86'];

/**
 * Grow one tile. Returns the merged static mesh (local to the tile) and
 * descriptions of the moving life it brings, in tile-local coordinates.
 */
export function growTile(tile, t0) {
  const type = TILE_TYPES[tile.type];
  const rng = createRng(tile.index * 7919 + tile.type * 104729 + tile.x * 31 + tile.y * 17 + 11);
  const r = (a = 0, b = 1) => a + (b - a) * rng();
  const pick = list => list[Math.floor(rng() * list.length)];
  const b = new Builder();
  const dist = edgeDistance(type);
  const agents = { sheep: [], walkers: [], chimneys: [], mills: [], flags: new Map(), lamps: [], fireflies: [] };
  const reserved = type.features.map(f => [f.anchor[0], f.anchor[1], f.type === 'field' ? 0.07 : 0.085]);
  const free = (u, v, extra = 0) => reserved.every(([a, c, rad]) => Math.hypot(u - a, v - c) > rad + extra);
  const L = (u, v) => [u - 0.5, v - 0.5];
  const when = (u, v, base) => t0 + base + Math.hypot(u - 0.5, v - 0.5) * 0.9 + r(0, 0.22);
  const flagSpot = (fi, x, y, z) => { if (!agents.flags.has(fi)) agents.flags.set(fi, []); agents.flags.get(fi).push([x, y, z]); };

  function house(u, v, w, d, h, ry, birth, opts = {}) {
    const [x, z] = L(u, v);
    const pivot = [x, 0, z];
    const wall = opts.wall || pick(WALLS), roof = opts.roof || pick(ROOFS);
    b.add('box', { x, z, sx: w, sy: h, sz: d, ry }, wall, pivot, birth, 0, 0, r(-0.05, 0.05));
    const roofH = Math.min(w, d) * r(0.55, 0.8);
    // The ridge runs along the longer side of the house.
    const across = w > d;
    b.add('prism', { x, y: h, z, sx: (across ? d : w) * 1.14, sy: roofH, sz: (across ? w : d) * 1.08, ry: ry + (across ? Math.PI / 2 : 0) }, roof, pivot, birth, 0, 0, r(-0.06, 0.06));
    // Windows on the long faces glow after dusk.
    const c = Math.cos(ry), s = Math.sin(ry);
    const face = (ox, oz, rot) => b.add('box', { x: x + ox * c + oz * s, y: h * 0.42, z: -ox * s + oz * c + z, sx: 0.011, sy: 0.014, sz: 0.004, ry: ry + rot }, '#3b2a1c', pivot, birth, 0, 1);
    if (opts.windows !== false) {
      face(-w * 0.22, d / 2 + 0.002, 0); face(w * 0.22, d / 2 + 0.002, 0);
      if (rng() < 0.6) face(w * 0.1, -d / 2 - 0.002, 0);
    }
    if (opts.chimney ?? rng() < 0.16) {
      const ox = w * 0.25, oz = 0;
      const cx = x + ox * c + oz * s, cz = -ox * s + oz * c + z;
      b.add('box', { x: cx, y: h + roofH * 0.35, z: cz, sx: 0.012, sy: roofH * 0.75, sz: 0.012, ry }, '#6f5a4b', pivot, birth);
      agents.chimneys.push([cx, h + roofH * 1.1, cz, birth + 0.8]);
    }
    return h + roofH;
  }
  function tree(u, v, birth, kind = rng() < 0.4 ? 'pine' : 'leaf', size = r(0.8, 1.25)) {
    const [x, z] = L(u, v);
    const p = [x, 0, z];
    if (kind === 'pine') {
      b.add('cyl', { x, z, sx: 0.006 * size, sy: 0.02 * size }, '#6b4a33', p, birth);
      b.add('cone', { x, y: 0.014 * size, z, sx: 0.032 * size, sy: 0.06 * size, ry: r(0, TAU) }, pick(PINES), p, birth, 0.5, 0, r(-0.08, 0.08));
      b.add('cone', { x, y: 0.042 * size, z, sx: 0.023 * size, sy: 0.05 * size, ry: r(0, TAU) }, pick(PINES), p, birth, 0.5, 0, r(-0.05, 0.1));
    } else {
      b.add('cyl', { x, z, sx: 0.006 * size, sy: 0.03 * size }, '#6e4b32', p, birth);
      b.add('blob', { x, y: 0.05 * size, z, sx: 0.032 * size, sy: 0.028 * size, sz: 0.032 * size, ry: r(0, TAU) }, pick(LEAVES), p, birth, 0.35, 0, r(-0.08, 0.08));
      if (rng() < 0.5) b.add('blob', { x: x + 0.012 * size, y: 0.068 * size, z: z - 0.006, sx: 0.02 * size, ry: r(0, TAU) }, pick(LEAVES), p, birth, 0.35, 0, r(0, 0.12));
    }
  }
  function flowers(u, v, birth, n = 5) {
    const col = pick(FLOWERS);
    for (let i = 0; i < n; i++) {
      const [x, z] = L(u + r(-0.03, 0.03), v + r(-0.03, 0.03));
      b.add('ico', { x, y: 0.004, z, sx: 0.0055 }, col, [x, 0, z], birth + i * 0.04, 0.8);
    }
  }
  function tuft(u, v, birth) {
    const [x, z] = L(u, v);
    b.add('cone', { x, z, sx: 0.008, sy: r(0.016, 0.028), ry: r(0, TAU) }, pick(['#4f8f35', '#6aa846', '#5a9a3b']), [x, 0, z], birth, 1.6);
  }

  // Candidate cells per feature, shuffled.
  const cells = type.features.map(() => []);
  for (let i = 0; i < RES * RES; i++) if (type.labels[i] >= 0) cells[type.labels[i]].push(i);
  for (const list of cells) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const spaced = (list, minD, test, max = Infinity) => {
    const out = [];
    for (const i of list) {
      if (out.length >= max) break;
      const [u, v] = cellUV(i);
      if (!test(i, u, v)) continue;
      if (out.every(([a, c]) => Math.hypot(a - u, c - v) >= minD)) out.push([u, v, i]);
    }
    return out;
  };

  type.features.forEach((f, fi) => {
    const list = cells[fi];
    if (f.type === 'city') {
      // Walls trace every edge where the town meets meadow, road or abbey.
      const boundary = list.filter(i => dist[i] < 1);
      const roofTone = rng() < 0.3 ? '#5f6f86' : null;
      for (const i of boundary) {
        if ((i * 2654435761 >>> 0) % 3 === 0) continue;
        const [u, v] = cellUV(i), [x, z] = L(u, v);
        b.add('hex', { x, z, sx: 0.021, sy: r(0.052, 0.064), ry: r(0, 1) }, pick(STONE), [x, 0, z], when(u, v, 0), 0, 0, r(-0.04, 0.04));
      }
      const towers = spaced(boundary, 0.24, (i, u, v) => free(u, v, 0.01) && u > 0.06 && u < 0.94 && v > 0.06 && v < 0.94, 3);
      for (const [u, v] of towers) {
        const [x, z] = L(u, v), h = r(0.12, 0.17), birth = when(u, v, 0.05);
        b.add('cyl', { x, z, sx: 0.033, sy: h }, pick(STONE), [x, 0, z], birth);
        b.add('hex', { x, y: h, z, sx: 0.038, sy: 0.012 }, '#9c8768', [x, 0, z], birth);
        b.add('cone', { x, y: h + 0.012, z, sx: 0.043, sy: 0.075 }, roofTone || pick(['#5f6f86', '#a24a35', '#6b5d78']), [x, 0, z], birth);
        flagSpot(fi, x, h + 0.087, z);
      }
      let keep = null;
      if (f.shield) {
        const [u, v] = shieldSpot(type, f), [x, z] = L(u, v), birth = when(u, v, 0.15);
        keep = [u, v];
        b.add('box', { x, z, sx: 0.085, sy: 0.12, sz: 0.085 }, '#d9c7a2', [x, 0, z], birth);
        b.add('box', { x, y: 0.12, z, sx: 0.095, sy: 0.016, sz: 0.095 }, '#a89070', [x, 0, z], birth);
        b.add('box', { x: x + 0.025, y: 0.12, z: z - 0.02, sx: 0.04, sy: 0.12, sz: 0.04 }, '#e3d3b1', [x, 0, z], birth);
        b.add('cone4', { x: x + 0.025, y: 0.24, z: z - 0.02, sx: 0.055, sy: 0.08 }, '#3e5aa5', [x, 0, z], birth);
        b.add('box', { x, y: 0.06, z: z + 0.043, sx: 0.016, sy: 0.022, sz: 0.004 }, '#3b2a1c', [x, 0, z], birth, 0, 1);
        flagSpot(fi, x + 0.025, 0.32, z - 0.02);
      }
      const homes = spaced(list, 0.078, (i, u, v) => dist[i] >= 2.6 && free(u, v) && (!keep || Math.hypot(u - keep[0], v - keep[1]) > 0.1), Math.round(f.area * 150) + 1);
      for (const [u, v, i] of homes) {
        const tall = Math.min(1, dist[i] / 12);
        const w = r(0.045, 0.07), d = r(0.04, 0.055), h = r(0.035, 0.05) * (1 + tall * 0.9);
        house(u, v, w, d, h, (rng() < 0.5 ? 0 : Math.PI / 2) + r(-0.18, 0.18), when(u, v, 0.12), { roof: roofTone && rng() < 0.6 ? roofTone : null });
      }
      if (!f.shield && f.area > 0.3 && rng() < 0.5) {
        // A market well where the streets meet.
        const spot = spaced(list, 0.1, (i, u, v) => dist[i] > 6 && free(u, v, 0.02), 1)[0];
        if (spot) {
          const [x, z] = L(spot[0], spot[1]);
          b.add('cyl', { x, z, sx: 0.022, sy: 0.018 }, '#a59072', [x, 0, z], when(spot[0], spot[1], 0.2));
          b.add('cyl', { x, y: 0.0185, z, sx: 0.016, sy: 0.001 }, '#4f88b3', [x, 0, z], when(spot[0], spot[1], 0.2));
        }
      }
    } else if (f.type === 'road') {
      const path = type.roadPaths[f.index];
      const route = path.filter(([u, v]) => { const l = labelAtUV(type, u, v); return l === fi || l < 0 || TILE_TYPES[tile.type].features[l]?.type === 'monastery'; });
      if (route.length > 2) agents.walkers.push({ route: route.map(([u, v]) => L(u, v)) });
      // Lanterns along the verge.
      for (let k = 2; k < path.length - 2; k += 5) {
        if (rng() < 0.45) continue;
        const [u0, v0] = path[k - 1], [u1, v1] = path[k + 1];
        const len = Math.hypot(u1 - u0, v1 - v0) || 1;
        const side = rng() < 0.5 ? 1 : -1;
        const u = path[k][0] - (v1 - v0) / len * 0.088 * side, v = path[k][1] + (u1 - u0) / len * 0.088 * side;
        const l = labelAtUV(type, u, v);
        if (l < 0 || type.features[l].type !== 'field' || !free(u, v)) continue;
        const [x, z] = L(u, v), birth = when(u, v, 0.2);
        b.add('box', { x, z, sx: 0.006, sy: 0.07, sz: 0.006 }, '#4b3a2c', [x, 0, z], birth);
        b.add('box', { x, y: 0.07, z, sx: 0.016, sy: 0.016, sz: 0.016 }, '#5a4636', [x, 0, z], birth, 0, 1);
        agents.lamps.push([x, 0.08, z]);
      }
      // A gatehouse where the road passes into a town.
      const gate = path.findIndex(([u, v]) => { const l = labelAtUV(type, u, v); return l >= 0 && type.features[l].type === 'city'; });
      if (gate > 0) {
        const [u, v] = path[gate], [pu, pv] = path[gate - 1];
        const len = Math.hypot(u - pu, v - pv) || 1, nx = -(v - pv) / len, nz = (u - pu) / len;
        const birth = when(u, v, 0.02);
        const [x, z] = L(u, v);
        for (const s of [-1, 1]) {
          const [tx, tz] = L(u + nx * 0.062 * s, v + nz * 0.062 * s);
          b.add('box', { x: tx, z: tz, sx: 0.04, sy: 0.12, sz: 0.04, ry: Math.atan2(nx, nz) }, '#c8b28b', [x, 0, z], birth);
        }
        b.add('box', { x, y: 0.085, z, sx: 0.16, sy: 0.04, sz: 0.04, ry: Math.atan2(nx, nz) + Math.PI / 2 }, '#bba57f', [x, 0, z], birth);
        b.add('prism', { x, y: 0.125, z, sx: 0.05, sy: 0.04, sz: 0.17, ry: Math.atan2(nx, nz) }, '#a24a35', [x, 0, z], birth);
      }
    } else if (f.type === 'monastery') {
      const birth = when(0.5, 0.42, 0.15);
      const p = [0, 0, -0.08];
      b.add('box', { x: -0.01, z: -0.09, sx: 0.19, sy: 0.085, sz: 0.085 }, '#efe6cf', p, birth);
      b.add('prism', { x: -0.01, y: 0.085, z: -0.09, sx: 0.1, sy: 0.06, sz: 0.205, ry: Math.PI / 2 }, '#6a5f7a', p, birth);
      b.add('cyl', { x: -0.105, z: -0.09, sx: 0.042, sy: 0.075 }, '#e6dcc2', p, birth);
      b.add('cone', { x: -0.105, y: 0.075, z: -0.09, sx: 0.046, sy: 0.05 }, '#6a5f7a', p, birth);
      b.add('box', { x: 0.1, z: -0.1, sx: 0.055, sy: 0.2, sz: 0.055 }, '#f3ecd9', p, birth);
      b.add('box', { x: 0.1, y: 0.15, z: -0.072, sx: 0.022, sy: 0.03, sz: 0.004 }, '#3b2a1c', p, birth, 0, 1);
      b.add('cone4', { x: 0.1, y: 0.2, z: -0.1, sx: 0.075, sy: 0.085 }, '#5a4f6c', p, birth);
      b.add('box', { x: 0.1, y: 0.285, z: -0.1, sx: 0.004, sy: 0.04, sz: 0.004 }, '#d8b25a', p, birth);
      b.add('box', { x: 0.1, y: 0.305, z: -0.1, sx: 0.022, sy: 0.004, sz: 0.004 }, '#d8b25a', p, birth);
      for (const dx of [-0.07, -0.03, 0.03]) b.add('box', { x: dx, y: 0.04, z: -0.046, sx: 0.012, sy: 0.022, sz: 0.004 }, '#3b2a1c', p, birth, 0, 1);
      // Cloister hedges and herb beds around the yard.
      for (const [hx, hz, sx, sz] of [[-0.135, 0.06, 0.016, 0.16], [0.135, 0.06, 0.016, 0.16], [-0.09, 0.14, 0.07, 0.016], [0.09, 0.14, 0.07, 0.016]]) {
        b.add('box', { x: hx, z: hz, sx, sy: 0.02, sz }, '#4e8a3a', [hx, 0, hz], birth + 0.25, 0.2);
      }
      for (let k = 0; k < 4; k++) {
        const hx = -0.1 + (k % 2) * 0.2, hz = 0.03 + Math.floor(k / 2) * 0.07;
        b.add('box', { x: hx, z: hz, sx: 0.035, sy: 0.006, sz: 0.04 }, pick(['#7a5a3c', '#8d6a45']), [hx, 0, hz], birth + 0.3);
        for (let j = 0; j < 3; j++) b.add('ico', { x: hx - 0.012 + j * 0.012, y: 0.009, z: hz, sx: 0.007 }, pick(FLOWERS), [hx, 0, hz], birth + 0.35, 0.6);
      }
      tree(0.36, 0.3, birth + 0.3, 'pine', 1.2);
      agents.walkers.push({ route: [[-0.15, -0.16], [-0.15, 0.17], [0.15, 0.17], [0.15, -0.16], [-0.15, -0.16]], monk: true });
    } else if (f.type === 'field') {
      const area = f.area;
      const open = list.filter(i => dist[i] >= 2);
      const roll = rng();
      const theme = area < 0.07 ? 'verge' : roll < 0.3 ? 'forest' : roll < 0.62 ? 'farm' : roll < 0.9 ? 'pasture' : 'orchard';
      for (const [u, v] of spaced(open, 0.05, (i, u, v) => free(u, v), Math.round(area * 30) + 2)) tuft(u, v, when(u, v, 0.3));
      if (theme === 'verge') {
        for (const [u, v] of spaced(open, 0.09, (i, u, v) => free(u, v) && dist[i] > 3, 2)) rng() < 0.5 ? tree(u, v, when(u, v, 0.3), 'leaf', 0.8) : flowers(u, v, when(u, v, 0.3), 4);
        return;
      }
      if (theme === 'forest') {
        for (const [u, v] of spaced(open, 0.058, (i, u, v) => free(u, v) && dist[i] > 2.5, Math.round(area * 70))) tree(u, v, when(u, v, 0.3));
      } else if (theme === 'orchard') {
        for (const [u, v] of spaced(open, 0.05, (i, u, v) => free(u, v) && dist[i] > 2.5 && Math.abs((u * 12) % 1 - 0.5) < 0.18 && Math.abs((v * 12) % 1 - 0.5) < 0.18, 40)) {
          tree(u, v, when(u, v, 0.3), 'leaf', 0.7);
          if (rng() < 0.5) { const [x, z] = L(u, v); b.add('ico', { x: x + 0.015, y: 0.04, z: z + 0.01, sx: 0.006 }, '#d9473a', [x, 0, z], when(u, v, 0.6)); }
        }
      } else if (theme === 'farm') {
        const centre = spaced(open, 1, (i, u, v) => dist[i] > 7 && free(u, v, 0.08), 1)[0];
        if (centre) {
          const [cu, cv] = centre, ang = (rng() < 0.5 ? 0 : Math.PI / 2) + r(-0.25, 0.25), crop = pick(CROPS);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          for (let row = -3; row <= 3; row++) {
            const ends = [-0.1, 0.1].map(t => [cu + ca * t - sa * row * 0.024, cv + sa * t + ca * row * 0.024]);
            const ok = ends.every(([u, v]) => labelAtUV(type, u, v) === fi && free(u, v)) && labelAtUV(type, (ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2) === fi;
            if (!ok) continue;
            const [x, z] = L((ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2);
            b.add('box', { x, z, sx: 0.2, sy: 0.016, sz: 0.013, ry: -ang }, crop, [x, 0, z], when(cu, cv, 0.35 + (row + 3) * 0.05), 1.4, 0, r(-0.06, 0.06));
          }
          const spot = spaced(open, 1, (i, u, v) => dist[i] > 4 && free(u, v, 0.03) && Math.hypot(u - cu, v - cv) > 0.15, 1)[0];
          if (spot) {
            const [u, v] = spot;
            if (rng() < 0.45) {
              const [x, z] = L(u, v), birth = when(u, v, 0.25), p = [x, 0, z];
              b.add('taper', { x, z, sx: 0.036, sy: 0.15 }, '#efe7d6', p, birth);
              b.add('cone', { x, y: 0.15, z, sx: 0.03, sy: 0.04 }, '#8d4a3c', p, birth);
              b.add('box', { x, y: 0.04, z: z + 0.031, sx: 0.012, sy: 0.02, sz: 0.004 }, '#3b2a1c', p, birth, 0, 1);
              agents.mills.push([x, 0.145, z, r(0, TAU), birth]);
            } else {
              house(u, v, 0.07, 0.05, 0.04, r(0, TAU), when(u, v, 0.25), { wall: pick(['#a4473a', '#b55a3e', '#efe2c5']), roof: '#5b4636' });
            }
          }
          for (const [u, v] of spaced(open, 0.05, (i, uu, vv) => dist[i] > 3 && free(uu, vv) && Math.hypot(uu - cu, vv - cv) > 0.13, 3)) {
            const [x, z] = L(u, v);
            b.add('cone', { x, z, sx: 0.02, sy: 0.03 }, '#e2bf55', [x, 0, z], when(u, v, 0.45));
          }
        }
        for (const [u, v] of spaced(open, 0.07, (i, u, v) => free(u, v) && dist[i] > 2 && rng() < 0.08, 4)) tree(u, v, when(u, v, 0.4), 'leaf');
      } else {
        for (const [u, v] of spaced(open, 0.12, (i, u, v) => free(u, v) && dist[i] > 3, 3)) tree(u, v, when(u, v, 0.35));
        const pasture = open.filter(i => { const [u, v] = cellUV(i); return free(u, v, -0.04); }).map(i => L(...cellUV(i)));
        const flock = Math.min(4, 1 + Math.round(area * 5));
        if (pasture.length > 20) for (let k = 0; k < flock; k++) agents.sheep.push(pasture);
      }
      for (const [u, v] of spaced(open, 0.1, (i, u, v) => free(u, v) && rng() < 0.15, Math.round(area * 8) + 1)) flowers(u, v, when(u, v, 0.4));
      for (const [u, v] of spaced(open, 0.15, (i, u, v) => free(u, v) && dist[i] > 3 && rng() < 0.05, 2)) {
        const [x, z] = L(u, v);
        b.add('ico', { x, y: 0.006, z, sx: 0.016, sy: 0.011, ry: r(0, TAU) }, '#9a9488', [x, 0, z], when(u, v, 0.2));
      }
      for (const i of open) if (rng() < 0.0035) agents.fireflies.push(L(...cellUV(i)));
    }
  });

  if (type.junction) {
    const birth = when(0.5, 0.5, 0.1), p = [0, 0, 0];
    if (rng() < 0.55) {
      b.add('cyl', { x: 0, z: 0, sx: 0.034, sy: 0.026 }, '#a59072', p, birth);
      b.add('cyl', { x: 0, y: 0.026, z: 0, sx: 0.026, sy: 0.001 }, '#3f6d8f', p, birth);
      for (const s of [-1, 1]) b.add('box', { x: s * 0.028, z: 0, sx: 0.005, sy: 0.07, sz: 0.005 }, '#5a4636', p, birth);
      b.add('prism', { x: 0, y: 0.07, z: 0, sx: 0.05, sy: 0.03, sz: 0.075, ry: Math.PI / 2 }, '#9c4531', p, birth);
    } else {
      b.add('box', { x: 0, z: 0, sx: 0.03, sy: 0.05, sz: 0.03 }, '#d7c8a6', p, birth);
      b.add('cone4', { x: 0, y: 0.05, z: 0, sx: 0.042, sy: 0.04 }, '#9c4531', p, birth);
      b.add('box', { x: 0, y: 0.105, z: 0, sx: 0.004, sy: 0.03, sz: 0.004 }, '#d8b25a', p, birth);
    }
  }

  const mesh = new T.Mesh(b.geometry(), lifeMaterial);
  mesh.customDepthMaterial = lifeDepth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  return { mesh, agents };
}

// ------------------------------------------------------------- moving life
function sheepGeometry() {
  const b = new Builder();
  b.add('blob', { x: 0, y: 0.018, z: 0, sx: 0.02, sy: 0.016, sz: 0.026 }, '#f4f1ea', null);
  b.add('box', { x: 0, y: 0.018, z: 0.026, sx: 0.013, sy: 0.014, sz: 0.014 }, '#3a3430', null);
  for (const [x, z] of [[-0.009, -0.012], [0.009, -0.012], [-0.009, 0.012], [0.009, 0.012]]) b.add('box', { x, z, sx: 0.004, sy: 0.012, sz: 0.004 }, '#3a3430', null);
  return b.geometry(true);
}
function walkerGeometry(head) {
  const b = new Builder();
  if (head) b.add('ico', { x: 0, y: 0.04, z: 0, sx: 0.0085 }, '#f0c9a0', null);
  else b.add('cone', { x: 0, z: 0, sx: 0.012, sy: 0.036 }, '#ffffff', null);
  return b.geometry(true);
}
function bladeGeometry() {
  const b = new Builder();
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    b.add('box', { x: 0, y: 0, z: 0, sx: 0.014, sy: 0.085, sz: 0.002, rz: -a }, '#f1e7d1', null);
  }
  b.add('box', { x: 0, y: 0, z: -0.004, sx: 0.01, sy: 0.01, sz: 0.012 }, '#5a4636', null);
  return b.geometry(true);
}

const CLOTHES = ['#b5483d', '#3f6fb5', '#d7a933', '#5f8d4e', '#7d5aa6', '#c97b3b', '#e9e1cf', '#556070'];

export function createLife(scene) {
  const plain = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const MAX_SHEEP = 220, MAX_WALKERS = 200, MAX_SMOKE = 160;
  const sheepMesh = new T.InstancedMesh(sheepGeometry(), plain, MAX_SHEEP);
  const bodyMesh = new T.InstancedMesh(walkerGeometry(false), plain, MAX_WALKERS);
  const headMesh = new T.InstancedMesh(walkerGeometry(true), plain, MAX_WALKERS);
  const smokeMat = new T.MeshLambertMaterial({ color: '#f4f2ee', emissive: '#55524c', transparent: true, opacity: 0.32, depthWrite: false });
  const smokeMesh = new T.InstancedMesh(new T.IcosahedronGeometry(1, 2), smokeMat, MAX_SMOKE);
  for (const m of [sheepMesh, bodyMesh, headMesh, smokeMesh]) {
    m.count = 0; m.castShadow = m !== smokeMesh; m.receiveShadow = false; m.frustumCulled = false;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(m);
  }
  bodyMesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(MAX_WALKERS * 3), 3);
  const bladeGeo = bladeGeometry();
  const bladeMat = new T.MeshStandardMaterial({ color: '#f3ead6', roughness: 0.8, flatShading: true });
  const fireflyGeo = new T.BufferGeometry();
  const fireflyPos = new Float32Array(600 * 3);
  fireflyGeo.setAttribute('position', new T.BufferAttribute(fireflyPos, 3));
  fireflyGeo.setDrawRange(0, 0);
  const fireflyMat = new T.PointsMaterial({ color: '#ffe38a', size: 0.035, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
  const fireflies = new T.Points(fireflyGeo, fireflyMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  const rng = createRng(4242);
  let sheep = [], walkers = [], chimneys = [], mills = [], puffs = [], flies = [];
  const dummy = new T.Object3D();
  const toWorld = (tile, [lx, lz]) => {
    const [u, v] = rotatePoint(lx + 0.5, lz + 0.5, tile.rot);
    return [tile.x + u - 0.5, tile.y + v - 0.5];
  };

  function add(tile, agents, group) {
    for (const spots of agents.sheep) {
      if (sheep.length >= MAX_SHEEP) break;
      const pts = spots.map(p => toWorld(tile, p));
      const s = pts[Math.floor(rng() * pts.length)];
      sheep.push({ pts, x: s[0], z: s[1], tx: s[0], tz: s[1], h: rng() * TAU, wait: rng() * 3, born: lifeUniforms.uTime.value + 1.2 + rng(), bob: rng() * TAU });
    }
    for (const { route, monk } of agents.walkers) {
      if (walkers.length >= MAX_WALKERS) break;
      const many = monk ? 2 : rng() < 0.75 ? 1 : 0;
      const pts = route.map(p => toWorld(tile, p));
      for (let k = 0; k < many; k++) {
        const i = walkers.length;
        const tint = color(monk ? '#6b4f3a' : CLOTHES[Math.floor(rng() * CLOTHES.length)]);
        bodyMesh.instanceColor.setXYZ(i, tint.r, tint.g, tint.b);
        walkers.push({ pts, s: rng() * (pts.length - 1), dir: rng() < 0.5 ? 1 : -1, speed: (monk ? 0.9 : 1.6) * (0.7 + rng() * 0.6), loop: !!monk, born: lifeUniforms.uTime.value + 1.4 + rng(), pause: 0 });
      }
      bodyMesh.instanceColor.needsUpdate = true;
    }
    for (const [x, y, z, born] of agents.chimneys) {
      const [wx, wz] = toWorld(tile, [x, z]);
      chimneys.push({ x: wx, y: TOP + y, z: wz, born, next: born + rng() * 2 });
    }
    for (const [x, y, z, ry, born] of agents.mills) {
      const blades = new T.Mesh(bladeGeo, bladeMat);
      const hub = new T.Group();
      hub.position.set(x, y, z);
      hub.rotation.y = ry;
      blades.position.set(0, 0, 0.032);
      hub.add(blades);
      hub.scale.setScalar(0.001);
      group.add(hub);
      mills.push({ hub, blades, born, speed: 0.9 + rng() * 0.8 });
    }
    for (const p of agents.fireflies) {
      if (flies.length >= 600) break;
      const [x, z] = toWorld(tile, p);
      flies.push({ x, z, ph: rng() * TAU, sp: 0.5 + rng() });
    }
  }

  function clear() {
    sheep = []; walkers = []; chimneys = []; puffs = [];
    for (const m of mills) m.hub.parent?.remove(m.hub);
    mills = []; flies = [];
    sheepMesh.count = bodyMesh.count = headMesh.count = smokeMesh.count = 0;
    fireflyGeo.setDrawRange(0, 0);
  }

  const grow = (t, born) => { const k = Math.min(1, Math.max(0, (t - born) / 0.6)); return k * k * (3 - 2 * k); };

  function update(dt, t) {
    // Sheep amble between grazing spots inside their own meadow.
    sheep.forEach((s, i) => {
      if (s.wait > 0) s.wait -= dt;
      else {
        const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
        if (d < 0.01) {
          const p = s.pts[Math.floor(rng() * s.pts.length)];
          if (Math.hypot(p[0] - s.x, p[1] - s.z) < 0.25) { s.tx = p[0]; s.tz = p[1]; }
          s.wait = 1 + rng() * 4;
        } else {
          const want = Math.atan2(dx, dz);
          let dh = want - s.h;
          while (dh > Math.PI) dh -= TAU;
          while (dh < -Math.PI) dh += TAU;
          s.h += dh * Math.min(1, dt * 5);
          const step = Math.min(d, dt * 0.06);
          s.x += dx / d * step; s.z += dz / d * step;
        }
      }
      const g = grow(t, s.born);
      const walking = s.wait <= 0;
      dummy.position.set(s.x, TOP + (walking ? Math.abs(Math.sin(t * 10 + s.bob)) * 0.004 : 0), s.z);
      dummy.rotation.set(walking ? 0 : Math.sin(t * 2 + s.bob) * 0.12 + 0.12, s.h, 0);
      dummy.scale.setScalar(Math.max(0.001, g));
      dummy.updateMatrix();
      sheepMesh.setMatrixAt(i, dummy.matrix);
    });
    sheepMesh.count = sheep.length;
    sheepMesh.instanceMatrix.needsUpdate = true;

    // Travellers walk the roads; monks pace their cloister.
    walkers.forEach((w, i) => {
      if (w.pause > 0) w.pause -= dt;
      else {
        const n = w.pts.length - 1;
        const a = w.pts[Math.floor(Math.min(n - 1, Math.max(0, w.s)))], b = w.pts[Math.min(n, Math.floor(Math.max(0, w.s)) + 1)];
        const segLen = Math.max(0.01, Math.hypot(b[0] - a[0], b[1] - a[1]));
        w.s += w.dir * dt * 0.045 * w.speed / segLen;
        if (w.s >= n) { if (w.loop) w.s -= n; else { w.s = n; w.dir = -1; w.pause = 0.5 + rng() * 2; } }
        if (w.s <= 0) { if (w.loop) w.s += n; else { w.s = 0; w.dir = 1; w.pause = 0.5 + rng() * 2; } }
      }
      const n = w.pts.length - 1, k = Math.min(n - 1, Math.floor(w.s)), f = w.s - k;
      const a = w.pts[k], b = w.pts[k + 1];
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      const g = grow(t, w.born), moving = w.pause <= 0;
      dummy.position.set(x, TOP + (moving ? Math.abs(Math.sin(t * 12 + i)) * 0.006 : 0), z);
      dummy.rotation.set(0, Math.atan2((b[0] - a[0]) * w.dir, (b[1] - a[1]) * w.dir), moving ? Math.sin(t * 12 + i) * 0.08 : 0);
      dummy.scale.setScalar(Math.max(0.001, g));
      dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);
      headMesh.setMatrixAt(i, dummy.matrix);
    });
    bodyMesh.count = headMesh.count = walkers.length;
    bodyMesh.instanceMatrix.needsUpdate = headMesh.instanceMatrix.needsUpdate = true;

    // Chimney smoke: a shared budget, so a big kingdom does not choke.
    const rate = Math.min(1, 30 / Math.max(1, chimneys.length));
    for (const c of chimneys) {
      if (t < c.next) continue;
      c.next = t + (1.2 + rng() * 2.2) / rate;
      if (t > c.born && puffs.length < MAX_SMOKE) puffs.push({ x: c.x, y: c.y, z: c.z, age: 0, life: 2.6 + rng() * 1.5, dx: (rng() - 0.5) * 0.02 + 0.02, dz: (rng() - 0.5) * 0.02 });
    }
    puffs = puffs.filter(p => (p.age += dt) < p.life);
    puffs.forEach((p, i) => {
      const k = p.age / p.life;
      dummy.position.set(p.x + p.dx * p.age, p.y + p.age * 0.07, p.z + p.dz * p.age);
      dummy.rotation.set(p.age, p.age * 0.7, 0);
      dummy.scale.setScalar(0.004 + Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.012 * (0.6 + k));
      dummy.updateMatrix();
      smokeMesh.setMatrixAt(i, dummy.matrix);
    });
    smokeMesh.count = puffs.length;
    smokeMesh.instanceMatrix.needsUpdate = true;

    for (const m of mills) {
      m.hub.scale.setScalar(Math.max(0.001, grow(t, m.born + 0.5)));
      m.blades.rotation.z -= dt * m.speed * lifeUniforms.uWind.value;
    }

    const night = lifeUniforms.uNight.value;
    fireflyMat.opacity = Math.max(0, night - 0.35) * 1.4;
    if (fireflyMat.opacity > 0) {
      flies.forEach((f, i) => {
        fireflyPos[i * 3] = f.x + Math.sin(t * 0.5 * f.sp + f.ph) * 0.06;
        fireflyPos[i * 3 + 1] = TOP + 0.05 + Math.sin(t * 1.3 * f.sp + f.ph * 2) * 0.03;
        fireflyPos[i * 3 + 2] = f.z + Math.cos(t * 0.4 * f.sp + f.ph) * 0.06;
      });
      fireflyGeo.attributes.position.needsUpdate = true;
      fireflyGeo.setDrawRange(0, flies.length);
    }
  }

  return { add, clear, update, get counts() { return { sheep: sheep.length, walkers: walkers.length, chimneys: chimneys.length }; } };
}
