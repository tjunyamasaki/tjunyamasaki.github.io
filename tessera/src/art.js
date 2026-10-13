// Painted tile faces. Every pixel asks tiles.mjs what lies beneath it, so the
// artwork can never disagree with the rules about where a road or wall runs.
import { TILE_TYPES, classify } from './tiles.mjs';

const SIZE = 256;
const cache = new Map();

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

const C = {
  grassA: hex('#83b84f'), grassB: hex('#5d9a3a'), grassC: hex('#a3c962'),
  road: hex('#dcbc85'), roadEdge: hex('#a9875a'), rut: hex('#c4a26f'),
  stone: hex('#d9c49b'), stoneB: hex('#c4aa7f'), mortar: hex('#93795a'), wall: hex('#7b664e'),
  abbey: hex('#e8dfc6'), abbeyLine: hex('#c9b994'), plaza: hex('#d2b98d'),
  flowers: [hex('#fff4d6'), hex('#f6d24a'), hex('#e889b5'), hex('#b49cf0')],
};

function code(c) {
  if (c.kind === 'city') return 10 + c.index;
  if (c.kind === 'road') return 20 + c.index;
  if (c.kind === 'monastery') return 30;
  if (c.kind === 'junction') return 31;
  return 0;
}

function paint(type) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const codes = new Uint8Array(SIZE * SIZE);
  const edges = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const c = classify(type, (x + 0.5) / SIZE, (y + 0.5) / SIZE);
    codes[y * SIZE + x] = code(c);
    edges[y * SIZE + x] = c.edge || 0;
  }
  const at = (x, y) => codes[Math.min(SIZE - 1, Math.max(0, Math.round(y))) * SIZE + Math.min(SIZE - 1, Math.max(0, Math.round(x)))];
  const near = (x, y, r, test) => test(at(x + r, y)) || test(at(x - r, y)) || test(at(x, y + r)) || test(at(x, y - r))
    || test(at(x + r * 0.7, y + r * 0.7)) || test(at(x - r * 0.7, y - r * 0.7)) || test(at(x + r * 0.7, y - r * 0.7)) || test(at(x - r * 0.7, y + r * 0.7));
  const isCity = k => k >= 10 && k < 20;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x, k = codes[i], u = x / SIZE, v = y / SIZE;
      let col;
      if (isCity(k)) {
        // Cobbles in offset rows, with a darker wall line where the town meets the land.
        const cu = u * 20, row = Math.floor(v * 20), cv = v * 20;
        const off = row % 2 ? 0.5 : 0;
        const fx = (cu + off) % 1, fy = cv % 1;
        const mortar = fx < 0.1 || fy < 0.12;
        col = mix(C.stone, C.stoneB, hash(Math.floor(cu + off), row) * 0.8 + fbm(u * 6, v * 6) * 0.3);
        if (mortar) col = mix(col, C.mortar, 0.55);
        if (near(x, y, 3, n => !isCity(n))) col = C.wall;
        else if (near(x, y, 7, n => !isCity(n))) col = scale(col, 0.86);
      } else if (k >= 20 && k < 30) {
        const e = edges[i];
        col = mix(C.road, C.rut, fbm(u * 18, v * 18) * 0.6);
        if (Math.abs(e - 0.45) < 0.08) col = mix(col, C.rut, 0.7);
        if (e > 0.78) col = mix(col, C.roadEdge, (e - 0.78) / 0.22);
        if (hash(x, y) > 0.985) col = scale(col, 0.82);
      } else if (k === 30) {
        const g = (u * 14) % 1 < 0.06 || (v * 14) % 1 < 0.06;
        col = g ? C.abbeyLine : mix(C.abbey, C.abbeyLine, fbm(u * 9, v * 9) * 0.4);
        if (near(x, y, 2, n => n !== 30 && n < 20)) col = C.abbeyLine;
      } else if (k === 31) {
        const r = Math.hypot(u - 0.5, v - 0.5) * 60;
        col = mix(C.plaza, C.mortar, (r % 1) < 0.15 ? 0.5 : fbm(u * 20, v * 20) * 0.25);
      } else {
        const n = fbm(u * 5 + 3, v * 5 + 7);
        col = mix(C.grassB, C.grassA, n);
        col = mix(col, C.grassC, Math.max(0, fbm(u * 13, v * 13) - 0.55) * 1.4);
        if (hash(x * 3, y * 7) > 0.93) col = scale(col, 0.88);
        if (hash(x * 5 + 1, y * 3 + 2) > 0.9975) col = C.flowers[Math.floor(hash(x, y * 9) * 4)];
        if (near(x, y, 4, isCity)) col = scale(col, 0.78);
        else if (near(x, y, 3, n => n >= 20 && n < 30)) col = scale(col, 0.93);
      }
      const border = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      if (border < 2) col = scale(col, 0.84);
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  type.features.forEach(f => { if (f.type === 'city' && f.shield) drawShield(ctx, shieldSpot(type, f)); });
  return canvas;
}

/** A spot inside a shielded town, away from where its follower stands. */
export function shieldSpot(type, feature) {
  const [ax, ay] = feature.anchor;
  for (const [dx, dy] of [[0.17, 0.06], [-0.17, 0.06], [0, 0.16], [0, -0.14], [0.12, -0.12], [-0.12, -0.12]]) {
    const u = ax + dx, v = ay + dy;
    if (u < 0.12 || v < 0.12 || u > 0.88 || v > 0.88) continue;
    const c = classify(type, u, v);
    if (c.kind === 'city' && type.features.indexOf(feature) === c.index) return [u, v];
  }
  return [ax, Math.max(0.1, ay - 0.12)];
}

function drawShield(ctx, [u, v]) {
  const x = u * SIZE, y = v * SIZE, w = 22, h = 26;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, 0);
  ctx.quadraticCurveTo(w / 2, h / 2.2, 0, h / 2); ctx.quadraticCurveTo(-w / 2, h / 2.2, -w / 2, 0); ctx.closePath();
  ctx.fillStyle = '#2d55a8'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#f2d27a'; ctx.stroke();
  ctx.fillStyle = '#f2d27a';
  ctx.fillRect(-1.5, -h / 2 + 4, 3, h - 9); ctx.fillRect(-w / 2 + 4, -3, w - 8, 3);
  ctx.restore();
}

export function tileCanvas(typeIndex) {
  if (!cache.has(typeIndex)) cache.set(typeIndex, paint(TILE_TYPES[typeIndex]));
  return cache.get(typeIndex);
}

/** Draw a tile face, turned clockwise by rot, into a UI canvas. */
export function drawCard(target, typeIndex, rot = 0) {
  const ctx = target.getContext('2d');
  const s = target.width;
  ctx.clearRect(0, 0, s, s);
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(rot * Math.PI / 2);
  ctx.drawImage(tileCanvas(typeIndex), -s / 2, -s / 2, s, s);
  ctx.restore();
}

/** White-on-transparent mask of one feature, used to light up exactly that region. */
const masks = new Map();
export function featureMask(typeIndex, feature) {
  const k = typeIndex * 16 + feature;
  if (masks.has(k)) return masks.get(k);
  const type = TILE_TYPES[typeIndex];
  const n = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const on = type.labels[i] === feature;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = on ? 255 : 0;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  masks.set(k, canvas);
  return canvas;
}
