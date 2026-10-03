// Driftacre — every sprite is painted at runtime with canvas, then recolored and outlined per style.
// 24 art pixels = 1 world tile. "Bitmoss" paints at 1x and snaps to a 32-color palette; other styles paint at 4x.

const ENDESGA = ['#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466', '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'].map(hexRgb);

export function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function rgbHex([r, g, b]) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function rgbHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
export function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); }
export function adj(hex, dl, ds = 0) { const [h, s, l] = rgbHsl(hexRgb(hex)); return rgbHex(hslRgb([h, s + ds, l + dl])); }
function nearest(rgb, pal) {
  let best = pal[0], bd = 1e9;
  for (const p of pal) { const d = 0.3 * (p[0] - rgb[0]) ** 2 + 0.59 * (p[1] - rgb[1]) ** 2 + 0.11 * (p[2] - rgb[2]) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

// Per-style recoloring of sprite colors. kind: '' | 'glow' (lights, gems, magic) | 'raw' (skip)
const TINTS = {
  peach: hex => mix(hex, '#ffe2cf', 0.07),
  bitmoss: hex => { const [h, s, l] = rgbHsl(hexRgb(hex)); return rgbHex(nearest(hslRgb([h, s * 1.15, l]), ENDESGA)); },
  moonpetal: (hex, kind) => {
    let [h, s, l] = rgbHsl(hexRgb(hex));
    if (kind === 'glow') return rgbHex(hslRgb([h, Math.min(1, s * 1.2 + 0.1), Math.max(l, 0.66)]));
    let dh = ((255 - h + 540) % 360) - 180; h += dh * 0.2;
    return rgbHex(hslRgb([h, s * 0.85, l * 0.62 + 0.05]));
  },
  inkwash: (hex, kind) => {
    let [h, s, l] = rgbHsl(hexRgb(hex));
    const red = (h < 22 || h > 335) && s > 0.45;
    if (kind === 'glow' || red) { s *= 0.8; if (red) { h = 4; s = 0.62; l = Math.min(l, 0.5); } }
    else s *= 0.2;
    l = Math.min(0.95, Math.max(0.1, Math.round(l * 5) / 5 + 0.04));
    return mix(rgbHex(hslRgb([h, s, l])), '#efe6d2', 0.12);
  },
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function rng(seed) { let x = seed * 9301 + 49297; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

function makeG(ctx, T) {
  const C = (c, k) => (k === 'raw' ? c : T(c, k));
  const g = {
    ctx,
    circle(x, y, r, c, k) { ctx.fillStyle = C(c, k); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); },
    ell(x, y, rx, ry, c, k, rot = 0) { ctx.fillStyle = C(c, k); ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); ctx.fill(); },
    rect(x, y, w, h, c, k) { ctx.fillStyle = C(c, k); ctx.fillRect(x, y, w, h); },
    rrect(x, y, w, h, r, c, k) { ctx.fillStyle = C(c, k); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); },
    poly(pts, c, k) { ctx.fillStyle = C(c, k); ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); },
    line(x1, y1, x2, y2, w, c, k) { ctx.strokeStyle = C(c, k); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
    curve(x1, y1, cx, cy, x2, y2, w, c, k) { ctx.strokeStyle = C(c, k); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke(); },
    arc(x, y, r, a0, a1, w, c, k) { ctx.strokeStyle = C(c, k); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke(); },
    // a two-tone leaf from base (x,y), angle in degrees (0 = up, positive = right)
    leaf(x, y, len, wid, ang, c, k) {
      const a = ang * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), px = -dy, py = dx;
      const tx = x + dx * len, ty = y + dy * len, mx = x + dx * len * 0.5, my = y + dy * len * 0.5;
      ctx.fillStyle = C(adj(c, -0.07), k);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx + px * wid, my + py * wid, tx, ty); ctx.quadraticCurveTo(mx - px * wid, my - py * wid, x, y); ctx.fill();
      ctx.fillStyle = C(adj(c, 0.06), k);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx + px * wid, my + py * wid, tx, ty); ctx.closePath(); ctx.fill();
    },
    star(x, y, r1, r2, n, c, k, rot = -Math.PI / 2) {
      ctx.fillStyle = C(c, k); ctx.beginPath();
      for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    },
    // soft bush/blob from several circles with a light top
    bush(x, y, r, c, k) {
      g.circle(x - r * 0.55, y + r * 0.15, r * 0.7, adj(c, -0.06), k); g.circle(x + r * 0.55, y + r * 0.15, r * 0.7, adj(c, -0.06), k);
      g.circle(x, y - r * 0.2, r * 0.85, c, k); g.ell(x - r * 0.25, y - r * 0.55, r * 0.45, r * 0.28, adj(c, 0.1), k);
    },
  };
  return g;
}

// ------------------------------------------------------------------ crops
const CROP_H = { melon: 44, wishflower: 42 };
function mound(g, b, S) { g.ell(12, b - 0.6, 6.5, 2.4, S.soil[1], 'raw'); g.ell(11, b - 1.6, 3.6, 1.1, S.soil[2], 'raw'); }

function drawCrop(g, id, stage, b, S) {
  if (stage === 0) { mound(g, b, S); g.ell(12, b - 2.6, 1.7, 1.2, '#f2dca2'); g.ell(11.5, b - 3, 0.6, 0.4, '#fff8e0'); return; }
  const LEAF = { sunwheat: '#9cbf4a', cotton: '#5fa04e', moonberry: '#2f8a6d', gourd: '#4f9a45', pepper: '#3e8f4a', dreamcap: '#8bbf8a', tulip: '#4f9a5a', melon: '#4c9a4a', wishflower: '#6aa84f', drakefruit: '#2f6b3f' }[id];
  if (stage === 1) {
    mound(g, b, S);
    if (id === 'dreamcap') { g.rect(11, b - 6, 2, 5, '#f3e6d0'); g.ell(12, b - 6, 3.5, 2.4, '#c9a8f0', 'glow'); return; }
    g.line(12, b - 1, 12, b - 8, 1.6, LEAF); g.leaf(12, b - 7, 6, 3, -55, LEAF); g.leaf(12, b - 7, 6, 3, 55, LEAF); return;
  }
  const P = stage === 3;
  switch (id) {
    case 'sunwheat': {
      g.leaf(7, b, 9, 2.5, -35, '#a8c24c'); g.leaf(17, b, 9, 2.5, 35, '#a8c24c');
      for (let k = 0; k < 5; k++) {
        const x0 = 4.5 + k * 3.7, lean = (k - 2) * 1.3, top = b - (P ? 21 : 13) - (k % 2) * 3;
        g.line(x0, b, x0 + lean, top + 4, 1.3, P ? '#cfa53b' : '#8fbf4a');
        if (P) { g.ell(x0 + lean, top, 2.3, 5.2, '#f4c84a', '', lean * 0.05); g.ell(x0 + lean - 0.8, top - 0.6, 0.9, 3.4, '#ffe993'); g.line(x0 + lean, top - 5, x0 + lean * 1.4, top - 8.5, 0.6, '#f4d77a'); }
        else g.ell(x0 + lean, top + 1, 1.5, 3.2, '#b6d65a');
      }
      if (P) g.star(19, b - 27, 2.4, 1, 4, '#fff6b0', 'glow');
      break;
    }
    case 'cotton': {
      g.bush(12, b - 5, P ? 7 : 5.5, '#5fa04e');
      g.line(12, b - 6, 7, b - (P ? 15 : 11), 1.4, '#4a7d3e'); g.line(12, b - 6, 17, b - (P ? 16 : 11), 1.4, '#4a7d3e'); g.line(12, b - 6, 12, b - (P ? 20 : 13), 1.4, '#4a7d3e');
      const puffs = P ? [[7, b - 15, 1], [17, b - 16, 1], [12, b - 21, 1.15]] : [[7, b - 11, 0.45], [17, b - 11, 0.45], [12, b - 13, 0.5]];
      for (const [x, y, s] of puffs) {
        if (!P) { g.circle(x, y, 2 * s + 0.4, '#a6d07a'); g.circle(x - 0.4, y - 0.4, 1.4 * s, '#f6f6ee'); continue; }
        g.circle(x - 2.4 * s, y + 0.6, 2.7 * s, '#d2dbf2'); g.circle(x + 2.4 * s, y + 0.6, 2.7 * s, '#d2dbf2');
        g.circle(x, y - 0.8, 3.4 * s, '#ffffff'); g.circle(x - 2.2 * s, y, 2.3 * s, '#ffffff'); g.circle(x + 2.2 * s, y, 2.3 * s, '#f6f8ff');
        g.ell(x - 1, y - 2, 1.4 * s, 0.9 * s, '#ffffff', 'glow');
      }
      break;
    }
    case 'moonberry': {
      g.bush(12, b - 8, P ? 9.5 : 7, '#2f7d6d');
      const n = P ? [[7, b - 9], [12, b - 13], [17, b - 8], [10, b - 5], [15, b - 4], [16, b - 13], [6, b - 14]] : [[9, b - 8], [15, b - 9], [12, b - 12]];
      for (const [x, y] of n) {
        if (P) { g.circle(x, y, 2.6, '#3e50c8', 'glow'); g.circle(x - 0.3, y - 0.3, 2, '#6c86ff', 'glow'); g.circle(x - 0.9, y - 1, 0.7, '#eef2ff', 'glow'); }
        else g.circle(x, y, 1.6, '#9fd08a');
      }
      break;
    }
    case 'gourd': {
      g.leaf(6, b - 1, 9, 4.2, -70, '#4f9a45'); g.leaf(18, b - 1, 9, 4.2, 70, '#4f9a45');
      const r = P ? 1 : 0.55, cy = b - 7 * r - 1;
      g.ell(12, cy, 9 * r, 7.2 * r, P ? '#c8611a' : '#5e9e3e');
      g.ell(12, cy, 6.8 * r, 7.2 * r, P ? '#f28c28' : '#79b84d'); g.ell(12, cy, 3 * r, 7 * r, P ? '#ff9f3a' : '#86c45a');
      g.ell(9 * r + 3, cy - 3.5 * r, 1.6 * r, 2.4 * r, P ? '#ffc070' : '#a6d77a');
      g.line(12, cy - 7 * r, 13.5, cy - 9.5 * r - 1, 1.8, '#7a5230');
      g.curve(14, cy - 8 * r, 18, cy - 13 * r, 16, cy - 10 * r, 0.9, '#6aa84f');
      if (P) { g.star(12, cy + 1, 3.2, 1.4, 5, '#fff3a0', 'glow'); g.circle(12, cy + 1, 1, '#ffffff', 'glow'); }
      break;
    }
    case 'pepper': {
      g.line(12, b, 12, b - 15, 1.6, '#3e7f42');
      g.leaf(12, b - 5, 7, 3, -60, '#3e8f4a'); g.leaf(12, b - 8, 7, 3, 60, '#3e8f4a'); g.leaf(12, b - 13, 6, 2.6, -40, '#4aa055'); g.leaf(12, b - 14, 6, 2.6, 35, '#4aa055');
      const peppers = P ? [[8, b - 12, -1], [16, b - 15, 1]] : [[9, b - 11, -1]];
      for (const [x, y, d] of peppers) {
        const s = P ? 1 : 0.6;
        if (P) g.poly([[x - d * 1, y - 1], [x + d * 6, y - 9], [x + d * 3.5, y - 1.5], [x + d * 2, y + 1]], '#ffb02e', 'glow');
        if (P) g.poly([[x, y], [x + d * 4, y - 6], [x + d * 2.4, y - 0.4]], '#fff07a', 'glow');
        g.ell(x, y + 4 * s, 2.6 * s, 5.4 * s, P ? '#e8434b' : '#69b04a', '', -d * 0.25);
        g.ell(x - 0.8 * d, y + 3 * s, 0.8 * s, 3 * s, P ? '#ff8a8a' : '#a6d77a', '', -d * 0.25);
        g.line(x, y - 1.4 * s, x + d * 0.6, y - 3, 1.2, '#3e7f42');
      }
      break;
    }
    case 'dreamcap': {
      const caps = P ? [[12, b, 13, 7.5], [5.5, b, 6, 4.2], [18.5, b, 8, 4.8]] : [[12, b, 8, 4.5], [6.5, b, 4, 2.6]];
      for (const [x, y0, hgt, r] of caps) {
        g.rrect(x - r * 0.32, y0 - hgt, r * 0.64, hgt, r * 0.25, '#f3e6d0'); g.rect(x + r * 0.05, y0 - hgt, r * 0.25, hgt, '#d8c6a8');
        const cy = y0 - hgt;
        g.ctx.save(); g.ctx.beginPath(); g.ctx.rect(x - r - 1, cy - r - 1, r * 2 + 2, r + 1.4); g.ctx.clip();
        g.ell(x, cy + 0.4, r, r * 0.95, P ? '#7438b8' : '#8a6fbf', 'glow'); g.ell(x - r * 0.12, cy, r * 0.88, r * 0.85, P ? '#a564e8' : '#b39ad8', 'glow');
        g.ctx.restore();
        g.ell(x, cy + 0.4, r * 0.95, r * 0.18, '#e8d6ff');
        if (P) { g.circle(x - r * 0.4, cy - r * 0.45, r * 0.18, '#ffd2f4', 'glow'); g.circle(x + r * 0.35, cy - r * 0.3, r * 0.14, '#ffd2f4', 'glow'); g.circle(x, cy - r * 0.75, r * 0.12, '#ffd2f4', 'glow'); }
      }
      break;
    }
    case 'tulip': {
      g.line(12, b, 12, b - (P ? 17 : 13), 1.5, '#4f9a5a');
      g.leaf(12, b - 1, 12, 3, -22, '#62b06a'); g.leaf(12, b - 1, 11, 3, 25, '#5aa462');
      const cy = b - (P ? 19 : 14);
      if (P) {
        g.poly([[12, cy + 4], [5, cy - 3], [7.5, cy - 8], [10.5, cy - 3]], '#2c98d8', 'glow');
        g.poly([[12, cy + 4], [19, cy - 3], [16.5, cy - 8], [13.5, cy - 3]], '#2c98d8', 'glow');
        g.poly([[12, cy + 4], [8.5, cy - 4], [12, cy - 11], [15.5, cy - 4]], '#5fe3f2', 'glow');
        g.poly([[12, cy + 3], [10, cy - 4], [12, cy - 9.5]], '#d8fbff', 'glow');
        g.star(18, cy - 9, 1.8, 0.7, 4, '#ffffff', 'glow');
      } else {
        g.ell(12, cy - 1, 2.6, 4, '#8ad9c4'); g.ell(11.3, cy - 2, 0.9, 2.4, '#c8f4ea');
      }
      break;
    }
    case 'melon': {
      g.leaf(6, b - 1, 9, 4, -75, '#4c9a4a'); g.leaf(18, b - 1, 9, 4, 75, '#4c9a4a'); g.leaf(12, b - 1, 7, 3.5, 0, '#5aa852');
      if (P) {
        const cy = b - 30;
        g.curve(12, b - 5, 6, b - 16, 12, cy + 8, 0.9, '#cfe8a8');
        g.ell(12, cy, 9, 8.4, '#3f8e3a'); g.ell(12, cy, 8, 8.2, '#7fd35a');
        for (const dx of [-5, 0, 5]) g.ell(12 + dx, cy, 1.1, 7.8 - Math.abs(dx) * 0.5, '#3f8e3a');
        g.ell(8.5, cy - 4, 2.4, 1.6, '#d6f7b0'); g.leaf(12, cy - 8, 4, 2, 40, '#4c9a4a');
        g.circle(18, cy - 9, 0.9, '#ffffff', 'glow');
      } else {
        g.ell(12, b - 4, 4.5, 3.8, '#3f8e3a'); g.ell(12, b - 4, 3.8, 3.6, '#8fd86a'); g.ell(10.8, b - 5.5, 1.2, 0.8, '#d6f7b0');
      }
      break;
    }
    case 'wishflower': {
      const top = b - (P ? 30 : 18);
      g.curve(12, b, 10, b - 14, 12, top + (P ? 6 : 2), 1.5, '#6aa84f');
      g.leaf(12, b - 1, 10, 3, -40, '#5d9b4c'); g.leaf(12, b - 1, 9, 3, 45, '#5d9b4c'); g.leaf(11, b - 9, 7, 2.4, -55, '#6fb15a');
      if (P) {
        g.circle(12, top, 8.6, '#e6dcff', 'glow'); g.circle(12, top - 0.6, 7.8, '#fffaf0', 'glow');
        for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2; g.circle(12 + Math.cos(an) * 6.4, top + Math.sin(an) * 6.4, 1.4, '#ffffff', 'glow'); }
        g.circle(12, top, 1.8, '#d9c38a'); g.ell(9.5, top - 3.5, 2, 1.3, '#ffffff', 'glow');
        g.star(20, top - 8, 2, 0.8, 4, '#fff4a8', 'glow'); g.star(4, top - 3, 1.5, 0.6, 4, '#fff4a8', 'glow');
      } else {
        for (let a = 0; a < 10; a++) { const an = a / 10 * Math.PI * 2; g.ell(12 + Math.cos(an) * 3, top + Math.sin(an) * 3, 2, 1.1, '#ffd23f', '', an); }
        g.circle(12, top, 1.8, '#f2a93b');
      }
      break;
    }
    case 'drakefruit': {
      for (const [a, l] of [[-70, 10], [-35, 11], [35, 11], [70, 10]]) g.leaf(12, b - 1, l, 2.6, a, '#2f6b3f');
      if (P) {
        const cy = b - 11;
        g.poly([[5, cy - 4], [1, cy - 10], [3, cy - 3], [0, cy - 4], [5, cy + 1]], '#c23b1d'); g.poly([[19, cy - 4], [23, cy - 10], [21, cy - 3], [24, cy - 4], [19, cy + 1]], '#c23b1d');
        g.ell(12, cy, 7.6, 9.6, '#c23b1d'); g.ell(11.4, cy - 0.3, 6.6, 9.1, '#ff6a2a');
        for (const [x, y] of [[9, cy - 3], [14, cy - 4], [11.5, cy + 2], [8, cy + 3], [15, cy + 2], [12, cy - 7]]) g.arc(x, y, 1.7, 0.2, Math.PI - 0.2, 0.9, '#ffb347', 'glow');
        g.poly([[9, cy - 8], [8, cy - 13], [11, cy - 9]], '#f5e6c8'); g.poly([[15, cy - 8], [16, cy - 13], [13, cy - 9]], '#f5e6c8');
        g.ell(8.8, cy - 4, 1.4, 2.4, '#ffb38a');
      } else {
        g.ell(12, b - 6, 4, 5, '#4f8f45'); g.ell(11.2, b - 7, 1.3, 2, '#86c45a'); g.poly([[10, b - 10], [9.5, b - 12.5], [11.5, b - 10.5]], '#e8e0b8');
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ buildings & decor (w, h, draw)
const BLD = {
  hut: [30, 40, (g, b) => {
    g.ell(15, b - 1, 12, 2.6, '#6e8f4a');
    g.ell(15, b - 10, 10.5, 10, '#d9ad7c'); g.ell(13.5, b - 11, 8.5, 9, '#f0c995');
    g.rrect(11.5, b - 12, 7, 11.5, 3.5, '#5b3a29'); g.rrect(12.5, b - 11, 5, 10.5, 2.5, '#7a4f35'); g.circle(16.3, b - 6, 0.7, '#ffd56b', 'glow');
    g.circle(7.5, b - 12, 2.2, '#5b3a29'); g.circle(7.5, b - 12, 1.5, '#ffe9a6', 'glow');
    const cy = b - 21;
    g.ell(15, cy, 14, 7.5, '#6b4430'); g.ell(15, cy - 1, 13, 6.4, '#9a6a45');
    for (let i = -2; i <= 2; i++) g.arc(15 + i * 4.6, cy - 1, 2.2, Math.PI * 1.1, Math.PI * 1.9, 0.9, '#bb8a5e');
    g.ell(15, cy + 5, 13, 1.6, '#6b4430');
    g.line(15, cy - 6, 16, cy - 10, 1.8, '#5b3a29'); g.leaf(16, cy - 9.5, 7, 3.2, 55, '#7cc25e'); g.leaf(15.5, cy - 9, 5, 2.6, -50, '#6aae52');
  }],
  drizzle: [26, 44, (g, b) => {
    g.ell(13, b - 1, 6, 1.8, '#6e8f4a'); g.rect(11.8, b - 22, 2.4, 22, '#8a5a3c'); g.rect(11.8, b - 22, 1, 22, '#a9764f');
    const cy = b - 28;
    g.circle(6, cy + 2, 5, '#c7d3ea'); g.circle(20, cy + 2, 5, '#c7d3ea'); g.circle(13, cy - 1, 7, '#ffffff'); g.circle(7, cy + 1, 4.5, '#f5f8ff'); g.circle(19, cy + 1, 4.5, '#f5f8ff');
    g.ell(13, cy + 4.5, 10.5, 2.5, '#b5c3e0'); g.ell(10.5, cy - 3.5, 3, 1.6, '#ffffff', 'glow');
    for (const [x, y] of [[8, cy + 9], [13, cy + 11], [18, cy + 8], [10.5, cy + 15], [16, cy + 15]]) g.ell(x, y, 0.9, 1.7, '#6db6ff', 'glow');
  }],
  hive: [26, 36, (g, b) => {
    g.rect(7, b - 8, 2, 8, '#6b4430'); g.rect(17, b - 8, 2, 8, '#6b4430'); g.rect(5, b - 9.5, 16, 2.4, '#8a5a3c');
    const rows = [[11, b - 12], [10, b - 16], [8.5, b - 20], [6.5, b - 23.5], [4, b - 26.5]];
    for (const [rx, y] of rows) { g.ell(13, y, rx, 2.6, '#b8862e'); g.ell(13, y - 0.7, rx - 0.5, 2.1, '#e8b54a'); g.ell(12, y - 1.3, rx * 0.5, 0.7, '#ffd97a'); }
    g.ell(13, b - 13, 2.4, 1.8, '#3e2731');
    for (const [x, y] of [[4, b - 25], [22, b - 20], [20, b - 30]]) { g.ell(x, y, 1.6, 1.2, '#ffd23f'); g.rect(x - 0.4, y - 1.2, 0.8, 2.4, '#2a2030'); g.ell(x - 0.4, y - 1.8, 1.1, 0.7, '#ffffff', 'glow'); }
  }],
  windmill: [30, 52, (g, b) => {
    g.poly([[7, b], [23, b], [19.5, b - 30], [10.5, b - 30]], '#c7a77e'); g.poly([[15, b], [23, b], [19.5, b - 30], [15, b - 30]], '#b08f68');
    for (let y = 6; y < 30; y += 6) g.line(8 + y * 0.12, b - y, 22 - y * 0.12, b - y, 0.7, '#9d7d58');
    g.rrect(12.5, b - 8, 5, 8, 2.5, '#5b3a29'); g.circle(15, b - 18, 2, '#5b3a29'); g.circle(15, b - 18, 1.4, '#ffe9a6', 'glow');
    g.poly([[8, b - 29], [22, b - 29], [15, b - 41]], '#c8504a'); g.poly([[15, b - 29], [22, b - 29], [15, b - 41]], '#a33c3a'); g.line(8, b - 29, 22, b - 29, 1.4, '#7d2e2c');
  }],
  windmillBlades: [36, 36, g => {
    for (let i = 0; i < 4; i++) {
      g.ctx.save(); g.ctx.translate(18, 18); g.ctx.rotate(i * Math.PI / 2 + 0.3);
      g.rect(-0.8, -17, 1.6, 15, '#6b4430'); g.rect(0.8, -16.5, 5, 12, '#f4ead7'); g.rect(0.8, -16.5, 5, 1, '#6b4430'); g.rect(0.8, -11, 5, 0.8, '#d8c9ad'); g.rect(0.8, -7, 5, 0.8, '#d8c9ad');
      g.ctx.restore();
    }
    g.circle(18, 18, 2.6, '#6b4430'); g.circle(18, 18, 1.3, '#d9b06a');
  }],
  well: [30, 40, (g, b) => {
    g.ell(15, b - 4, 11, 4.5, '#7d8191'); g.rect(4, b - 11, 22, 7, '#9ba0b0'); g.ell(15, b - 11, 11, 4, '#b6bccb'); g.ell(15, b - 11, 8, 2.6, '#3a6fb8', 'glow'); g.ell(13, b - 11.6, 3, 0.8, '#bfe6ff', 'glow');
    for (const [x, y] of [[7, b - 8], [13, b - 7], [19, b - 8], [10, b - 5.5], [16, b - 5.5]]) g.rrect(x - 2.2, y - 1, 4.4, 2, 0.6, '#868b9c');
    g.rect(5, b - 26, 2, 16, '#8a5a3c'); g.rect(23, b - 26, 2, 16, '#8a5a3c'); g.line(6, b - 21, 24, b - 21, 1.2, '#6b4430');
    g.poly([[2, b - 25], [28, b - 25], [15, b - 34]], '#3f8e6a'); g.poly([[15, b - 25], [28, b - 25], [15, b - 34]], '#2f6e52');
    g.line(15, b - 21, 15, b - 17, 0.7, '#d9c7a0'); g.rrect(12.6, b - 17.5, 4.8, 3.8, 0.8, '#a9764f');
    g.star(23, b - 15, 2, 0.8, 4, '#fff4a8', 'glow');
  }],
  lantern: [22, 44, (g, b) => {
    g.ell(11, b - 1, 5, 1.6, '#55606e'); g.rect(9.5, b - 30, 3, 30, '#3f3a52'); g.rect(9.5, b - 30, 1, 30, '#5b5574');
    g.arc(15, b - 30, 5, Math.PI, Math.PI * 1.9, 2, '#3f3a52');
    const cy = b - 22;
    g.line(19.5, b - 31, 19.5, cy - 5, 0.8, '#3f3a52');
    g.rrect(15.5, cy - 5, 8, 10, 2.5, '#3f3a52'); g.rrect(16.5, cy - 4, 6, 8, 2, '#fff3b0', 'glow');
    g.circle(19.5, cy, 2.6, '#ffffff', 'glow'); g.circle(20.6, cy - 0.8, 2.1, '#fff3b0', 'glow');
    g.poly([[15, cy - 5], [24, cy - 5], [19.5, cy - 8]], '#3f3a52');
  }],
  shrine: [30, 44, (g, b) => {
    g.rect(6, b - 26, 3, 26, '#c8392b'); g.rect(21, b - 26, 3, 26, '#c8392b'); g.rect(6, b - 26, 1, 26, '#e65b49'); g.rect(21, b - 26, 1, 26, '#e65b49');
    g.rect(4, b - 21, 22, 2.4, '#c8392b'); g.poly([[1, b - 29], [29, b - 29], [27, b - 25.6], [3, b - 25.6]], '#2e2430'); g.poly([[0, b - 30.5], [30, b - 30.5], [28, b - 28.5], [2, b - 28.5]], '#c8392b');
    g.star(15, b - 37, 5.5, 2.4, 5, '#ffd54a', 'glow'); g.star(15, b - 37, 3, 1.3, 5, '#fff6c8', 'glow');
    g.rect(5, b - 2, 5, 2, '#8c8f9a'); g.rect(20, b - 2, 5, 2, '#8c8f9a');
  }],
  flowers: [26, 20, (g, b) => {
    g.ell(13, b - 2.5, 11, 3.5, '#4f8f45'); g.ell(13, b - 3.5, 10, 2.8, '#66a855');
    const F = [[5, b - 6, '#ff8fb1'], [10, b - 9, '#ffd23f'], [15, b - 7, '#8fa8ff'], [20, b - 8, '#ff8fb1'], [12.5, b - 4.5, '#ffffff'], [18, b - 4.5, '#ffd23f'], [7.5, b - 3.5, '#c79bff']];
    for (const [x, y, c] of F) { g.line(x, b - 3, x, y, 0.8, '#3e7f42'); for (let a = 0; a < 5; a++) { const an = a / 5 * Math.PI * 2; g.circle(x + Math.cos(an) * 1.4, y + Math.sin(an) * 1.4, 1.2, c); } g.circle(x, y, 0.8, '#fff2a8'); }
  }],
  shrooms: [26, 18, (g, b) => {
    for (const [x, s] of [[5, 0.8], [11, 1.1], [17, 0.9], [22, 0.7]]) {
      g.rrect(x - 1.2 * s, b - 6 * s, 2.4 * s, 6 * s, s, '#f4ead7');
      g.ctx.save(); g.ctx.beginPath(); g.ctx.rect(x - 6, b - 13 * s, 12, 6.8 * s); g.ctx.clip(); g.ell(x, b - 6 * s, 4.4 * s, 4.4 * s, '#e0453a'); g.ctx.restore();
      g.circle(x - 1.6 * s, b - 8.4 * s, 0.8 * s, '#ffffff'); g.circle(x + 1.4 * s, b - 9 * s, 0.7 * s, '#ffffff'); g.circle(x, b - 10 * s, 0.6 * s, '#ffffff');
    }
  }],
  stonelamp: [20, 34, (g, b) => {
    g.rrect(4, b - 4, 12, 4, 1, '#7d8191'); g.rect(7.5, b - 14, 5, 10, '#9ba0b0'); g.rrect(3, b - 16, 14, 3, 1, '#868b9c');
    g.rrect(5, b - 24, 10, 8, 1, '#9ba0b0'); g.rrect(7, b - 22.5, 6, 5, 1, '#ffe08a', 'glow'); g.circle(10, b - 20, 1.6, '#ffffff', 'glow');
    g.poly([[1, b - 24], [19, b - 24], [14, b - 29], [6, b - 29]], '#7d8191'); g.circle(10, b - 30.5, 1.8, '#868b9c');
  }],
  bench: [28, 22, (g, b) => {
    g.rect(4, b - 7, 2, 7, '#6b4430'); g.rect(22, b - 7, 2, 7, '#6b4430');
    g.rrect(2, b - 9, 24, 3, 1, '#c08654'); g.rrect(2, b - 9, 24, 1.2, 0.6, '#dba06c');
    g.rect(4, b - 18, 2, 9, '#6b4430'); g.rect(22, b - 18, 2, 9, '#6b4430');
    g.rrect(2, b - 18, 24, 3, 1, '#c08654'); g.rrect(2, b - 14, 24, 2.6, 1, '#b07848');
    g.ell(9, b - 10.5, 3, 1.4, '#e8705a'); g.rect(17, b - 12, 4, 3, '#f4e3b0'); g.line(17, b - 12, 21, b - 9, 0.5, '#d9c38a');
  }],
  tree: [44, 62, (g, b) => {
    g.ell(22, b - 1, 10, 2.6, '#5a7d40');
    g.poly([[18, b], [26, b], [24.5, b - 22], [19.5, b - 22]], '#7a5230'); g.poly([[22, b], [26, b], [24.5, b - 22], [22, b - 22]], '#5f3f26');
    g.line(21, b - 20, 14, b - 30, 2.4, '#7a5230'); g.line(23, b - 20, 30, b - 32, 2.4, '#7a5230');
    const P = [[12, b - 33, 9], [32, b - 35, 9.5], [22, b - 43, 12], [14, b - 46, 8], [31, b - 47, 8.5], [22, b - 31, 8]];
    for (const [x, y, r] of P) g.circle(x, y + 1.5, r, '#d9779e');
    for (const [x, y, r] of P) g.circle(x - 0.6, y, r * 0.92, '#f6a5c0');
    for (const [x, y, r] of P) g.ell(x - r * 0.3, y - r * 0.4, r * 0.4, r * 0.25, '#ffd3e2');
    for (const [x, y] of [[9, b - 38], [27, b - 40], [20, b - 50], [35, b - 30], [16, b - 28]]) g.circle(x, y, 1, '#ffffff');
  }],
  arch: [34, 44, (g, b) => {
    g.arc(17, b - 18, 13, Math.PI, Math.PI * 2, 3, '#6b4430'); g.rect(3, b - 18, 3, 18, '#6b4430'); g.rect(28, b - 18, 3, 18, '#6b4430');
    for (let i = 0; i <= 10; i++) { const a = Math.PI + i / 10 * Math.PI, x = 17 + Math.cos(a) * 13, y = b - 18 + Math.sin(a) * 13; g.leaf(x, y, 4, 1.8, i * 18 - 90, '#4f9a45'); }
    for (const y of [4, 10, 16]) { g.leaf(4.5, b - y, 4, 1.8, -60, '#5aa852'); g.leaf(29.5, b - y, 4, 1.8, 60, '#5aa852'); }
    for (let i = 0; i <= 8; i++) { const a = Math.PI + (i + 0.5) / 9 * Math.PI, x = 17 + Math.cos(a) * 11, y = b - 18 + Math.sin(a) * 11 + 2; g.circle(x, y, 1.2, i % 2 ? '#ffe08a' : '#ffb3d9', 'glow'); }
    g.circle(17, b - 31, 2.4, '#ff8fb1'); g.circle(17, b - 31, 1, '#fff2a8');
  }],
  fountain: [34, 46, (g, b) => {
    g.ell(17, b - 4, 15, 4.6, '#7d8191'); g.rect(2, b - 10, 30, 6, '#9ba0b0'); g.ell(17, b - 10, 15, 4.2, '#b6bccb'); g.ell(17, b - 10, 12, 2.8, '#3a8fd0', 'glow');
    g.poly([[17, b - 40], [13, b - 14], [21, b - 14]], '#2c98d8', 'glow'); g.poly([[17, b - 40], [17, b - 14], [21, b - 14]], '#5fe3f2', 'glow');
    g.poly([[11, b - 26], [9, b - 12], [13.5, b - 12]], '#5fe3f2', 'glow'); g.poly([[23, b - 28], [20.5, b - 12], [25, b - 12]], '#2c98d8', 'glow');
    g.poly([[17, b - 38], [15.5, b - 20], [17, b - 18]], '#e8fdff', 'glow');
    for (const [x, y] of [[8, b - 30], [27, b - 34], [13, b - 42]]) g.star(x, y, 1.8, 0.7, 4, '#ffffff', 'glow');
  }],
};

// ------------------------------------------------------------------ creatures & sky things
const MISC = {
  helper0: [18, 20, (g, b) => sprout(g, b, 0)],
  helper1: [18, 20, (g, b) => sprout(g, b, 1)],
  whale: [80, 40, (g, b) => {
    const y = b - 20;
    g.poly([[66, y - 2], [79, y - 12], [76, y - 1], [79, y + 8], [66, y + 3]], '#7f92d6');
    g.ell(36, y, 31, 15, '#7f92d6'); g.ell(34, y + 4, 26, 10, '#e4ebfb'); g.ell(36, y - 3, 30, 11, '#9fb3ef');
    for (let x = 18; x < 50; x += 5) g.line(x, y + 6, x + 2, y + 13, 0.8, '#c3cdea');
    g.ell(26, y - 10, 9, 3, '#b8c8f6'); g.circle(16, y - 2, 2.2, '#2a2a4a'); g.circle(15.4, y - 2.8, 0.8, '#ffffff'); g.ell(13, y + 2, 2.4, 1.2, '#f5a3b8');
    g.leaf(34, y + 9, 9, 3.5, 160, '#7f92d6');
    g.star(30, y - 19, 2.4, 1, 4, '#ffffff', 'glow'); g.star(37, y - 16, 1.6, 0.6, 4, '#ffffff', 'glow');
  }],
  balloon: [22, 40, (g, b) => {
    g.ell(11, 11, 9, 10, '#e05a6a'); g.ell(11, 11, 4.5, 10, '#ffd8a8'); g.ell(11, 11, 1.8, 10, '#e05a6a'); g.ell(8, 6, 2, 3, '#ffffff', 'glow');
    g.line(5, 18, 8, b - 9, 0.6, '#6b4430'); g.line(17, 18, 14, b - 9, 0.6, '#6b4430');
    g.rrect(6, b - 9, 10, 8, 1, '#a9764f'); g.rect(6, b - 9, 10, 1.6, '#c99467'); g.rect(10.2, b - 9, 1.6, 8, '#e8434b');
  }],
  fly0: [12, 10, g => { g.ell(4, 4, 3.2, 3, '#ffb3d9'); g.ell(8, 4, 3.2, 3, '#ffb3d9'); g.ell(4.5, 7, 2, 1.8, '#ff8fc4'); g.ell(7.5, 7, 2, 1.8, '#ff8fc4'); g.rect(5.6, 2.5, 0.8, 6, '#3e2731'); }],
  fly1: [12, 10, g => { g.ell(4.8, 4.5, 1.6, 3, '#ffb3d9'); g.ell(7.2, 4.5, 1.6, 3, '#ffb3d9'); g.rect(5.6, 2.5, 0.8, 6, '#3e2731'); }],
};
function sprout(g, b, f) {
  const sq = f ? 0.8 : 0;
  g.ell(5.5 - sq, b - 1.2, 2.4, 1.4, '#c49a6c'); g.ell(12.5 + sq, b - 1.2, 2.4, 1.4, '#c49a6c');
  g.ell(9, b - 7 + sq * 0.6, 6.6 + sq * 0.4, 6 - sq * 0.4, '#f3dfb6'); g.ell(8.3, b - 7.6 + sq * 0.6, 5.6, 5.1, '#fff4dc');
  g.circle(6.6, b - 7.6, 0.95, '#2e2430'); g.circle(11, b - 7.6, 0.95, '#2e2430'); g.ell(5, b - 5.6, 1.3, 0.8, '#ffb0a8'); g.ell(12.6, b - 5.6, 1.3, 0.8, '#ffb0a8');
  g.line(9, b - 12.5, 9, b - 15, 1, '#5f9a45'); g.leaf(9, b - 14.5, 5, 2.4, -60 - sq * 10, '#7cc25e'); g.leaf(9, b - 14.5, 4.4, 2.2, 55 + sq * 10, '#6aae52');
}

// ------------------------------------------------------------------ painter
export function createPainter(style) {
  const T = TINTS[style.id] || (h => h);
  const res = style.res;
  const cache = new Map();

  function finish(src, w, h, opts = {}) {
    const ow = opts.noOutline ? 0 : style.outline.w;
    const pad = Math.ceil(ow) + 1;
    const out = canvas((w + pad * 2) * res, (h + pad * 2) * res);
    const ctx = out.getContext('2d');
    if (ow > 0) {
      const sil = canvas(out.width, out.height), sc = sil.getContext('2d');
      sc.drawImage(src, pad * res, pad * res); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = style.outline.color; sc.fillRect(0, 0, sil.width, sil.height);
      if (res === 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.drawImage(sil, dx, dy);
      else { const r = ow * res; for (let a = 0; a < 16; a++) ctx.drawImage(sil, Math.cos(a / 8 * Math.PI) * r, Math.sin(a / 8 * Math.PI) * r); }
    }
    ctx.drawImage(src, pad * res, pad * res);
    if (res === 1) crisp(out, style.id === 'bitmoss');
    return { canvas: out, w: w + pad * 2, h: h + pad * 2, pad };
  }
  function crisp(c, quant) {
    const ctx = c.getContext('2d'), img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
      d[i + 3] = 255;
      if (quant) { const n = nearest([d[i], d[i + 1], d[i + 2]], ENDESGA); d[i] = n[0]; d[i + 1] = n[1]; d[i + 2] = n[2]; }
    }
    ctx.putImageData(img, 0, 0);
  }
  function paint(w, h, fn, opts) {
    const src = canvas(w * res, h * res), ctx = src.getContext('2d');
    ctx.scale(res, res);
    fn(makeG(ctx, T), h - 1);
    if (opts?.golden) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      const gr = ctx.createLinearGradient(0, 0, src.width, src.height);
      gr.addColorStop(0, 'rgba(255,240,150,.75)'); gr.addColorStop(0.5, 'rgba(255,196,60,.55)'); gr.addColorStop(1, 'rgba(255,240,150,.75)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, src.width, src.height);
      ctx.globalCompositeOperation = 'source-over'; ctx.scale(res, res);
      const gg = makeG(ctx, T);
      gg.star(w * 0.25, h * 0.3, 2.4, 0.9, 4, '#ffffff', 'raw'); gg.star(w * 0.8, h * 0.55, 1.8, 0.7, 4, '#ffffff', 'raw');
    }
    return finish(src, w, h, opts);
  }

  function get(name) {
    if (cache.has(name)) return cache.get(name);
    let out;
    const [kind, a, b2, c2] = name.split(':');
    if (kind === 'crop') { const h = CROP_H[a] || 32; out = paint(24, h, (g, base) => drawCrop(g, a, +b2, base, style), { golden: c2 === 'g' }); }
    else if (kind === 'bld') { const [w, h, fn] = BLD[a]; out = paint(w, h, fn); }
    else if (kind === 'misc') { const [w, h, fn] = MISC[a]; out = paint(w, h, fn); }
    else if (kind === 'cloud') out = cloud(+a);
    cache.set(name, out);
    return out;
  }

  function cloud(v) {
    const w = 72, h = 34, r = rng(v * 7 + 3);
    const lowRes = res === 1 ? 1 : 2;
    const c = canvas(w * lowRes, h * lowRes), ctx = c.getContext('2d'); ctx.scale(lowRes, lowRes);
    const puffs = [];
    for (let i = 0; i < 7; i++) { const rr = 6 + r() * 5; puffs.push([16 + r() * 40, 15 + r() * 7 - (i % 3) * 2, rr]); }
    const blob = (dx, dy, k) => { for (const [x, y, rr] of puffs) { ctx.beginPath(); ctx.arc(x + dx, y + dy, rr * k, 0, 7); ctx.fill(); } ctx.beginPath(); ctx.ellipse(36 + dx, 25 + dy, 27 * k, 6 * k, 0, 0, 7); ctx.fill(); };
    ctx.fillStyle = style.cloudShade; blob(0, 2.5, 1);
    ctx.fillStyle = style.cloud; blob(-0.6, -0.4, 0.92);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; for (const [x, y, rr] of puffs.slice(0, 3)) { ctx.beginPath(); ctx.arc(x - rr * 0.3, y - rr * 0.35, rr * 0.4, 0, 7); ctx.fill(); }
    if (style.id === 'inkwash') {
      ctx.strokeStyle = 'rgba(29,26,23,.55)'; ctx.lineWidth = 0.9;
      for (const [x, y, rr] of puffs) { ctx.beginPath(); ctx.arc(x - 0.6, y - 0.5, rr * 0.92, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
    }
    if (res === 1) crisp(c, true);
    return { canvas: c, w, h, pad: 0 };
  }

  // flat textures for the island blocks
  function tileTex(kind, v = 0) {
    const name = 'tile:' + kind + ':' + v;
    if (cache.has(name)) return cache.get(name);
    const S = 24, c = canvas(S * res, (kind === 'side' ? 15 : S) * res), ctx = c.getContext('2d'); ctx.scale(res, res);
    const r = rng(v * 13 + kind.length * 31 + 5), [g0, g1, g2] = style.grass;
    const dot = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    if (kind === 'grass' || kind === 'soil' || kind === 'pond') {
      dot(0, 0, S, S, g0);
      for (let i = 0; i < 26; i++) dot(Math.floor(r() * S), Math.floor(r() * S), 1, 1, r() < 0.5 ? g1 : g2);
      for (let i = 0; i < 5; i++) { const x = 2 + Math.floor(r() * 19), y = 3 + Math.floor(r() * 18); dot(x, y, 1, 2, g1); dot(x + 1, y - 1, 1, 2, g2); dot(x + 2, y, 1, 2, g1); }
      if (kind === 'grass' && v === 3) for (let i = 0; i < 3; i++) { const x = 3 + r() * 17, y = 3 + r() * 17, col = ['#ffffff', '#ffd23f', '#ff9ec4'][i]; dot(x, y, 2, 2, T(col)); dot(x + 0.5, y + 0.5, 1, 1, T('#fff2a8')); }
      if (kind === 'soil') {
        const [s0, s1, s2] = style.soil;
        ctx.fillStyle = s0; ctx.beginPath(); ctx.roundRect(2, 2, 20, 20, 3); ctx.fill();
        for (let y = 4; y < 21; y += 4.5) { dot(3.5, y + 2.2, 17, 1.6, s1); dot(3.5, y + 0.8, 17, 1.2, s2); }
        for (let i = 0; i < 6; i++) dot(4 + r() * 16, 4 + r() * 16, 1, 1, s2);
      }
      if (kind === 'pond') {
        ctx.fillStyle = T('#3f88c5'); ctx.beginPath(); ctx.ellipse(12, 12, 10, 9.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = T('#5aa9e0'); ctx.beginPath(); ctx.ellipse(12, 12.5, 8.4, 7.8, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = T('#bfe6ff', 'glow'); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(10, 10, 3, 3.6, 5.2); ctx.stroke(); ctx.beginPath(); ctx.arc(15, 15, 2, 3.6, 5.4); ctx.stroke();
        ctx.fillStyle = T('#4f9a45'); ctx.beginPath(); ctx.arc(15.5, 9.5, 3, 0.4, Math.PI * 2 - 0.2); ctx.lineTo(15.5, 9.5); ctx.fill();
        ctx.fillStyle = T('#ff9ec4'); ctx.beginPath(); ctx.arc(15.5, 9.2, 1.3, 0, 7); ctx.fill();
        ctx.fillStyle = T('#4f9a45'); ctx.beginPath(); ctx.arc(8, 16, 2.2, 0, 7); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,.09)'; ctx.fillRect(0, 0, S, 1); ctx.fillRect(0, 0, 1, S);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, S - 1, S, 1); ctx.fillRect(S - 1, 0, 1, S);
    } else if (kind === 'side') {
      const [d0, d1] = style.side;
      const gr = ctx.createLinearGradient(0, 0, 0, 15); gr.addColorStop(0, d0); gr.addColorStop(1, d1);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, S, 15);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = adj(d1, -0.06); ctx.beginPath(); ctx.ellipse(r() * S, 6 + r() * 8, 1.4 + r(), 0.9, 0, 0, 7); ctx.fill(); }
      for (let i = 0; i < 4; i++) { ctx.fillStyle = adj(d0, 0.08); ctx.fillRect(r() * S, 5 + r() * 9, 1.5, 1); }
      ctx.fillStyle = g1; ctx.fillRect(0, 0, S, 3);
      for (let x = 0; x < S; x += 2) { const dh = 1 + Math.floor(r() * 3); ctx.fillRect(x, 3, 2, dh); }
      ctx.fillStyle = g0; ctx.fillRect(0, 0, S, 1.6);
    } else if (kind === 'vine') {
      for (let k = 0; k < 3; k++) {
        const x = 3 + k * 7 + r() * 3, len = 8 + r() * 14;
        ctx.strokeStyle = T('#3e7f42'); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 2, len / 2, x - 1, len); ctx.stroke();
        for (let y = 3; y < len; y += 3.5) { ctx.fillStyle = T(y % 7 < 3.5 ? '#5aa852' : '#4f9a45'); ctx.beginPath(); ctx.ellipse(x + (y % 7 < 3.5 ? 1.6 : -1.2), y, 1.7, 1, 0.5, 0, 7); ctx.fill(); }
        if (r() < 0.5) { ctx.fillStyle = T('#ff9ec4'); ctx.beginPath(); ctx.arc(x, len, 1.3, 0, 7); ctx.fill(); }
      }
    }
    if (res === 1) crisp(c, false);
    cache.set(name, c);
    return c;
  }

  function icon(name, size = 64) {
    const s = get(name), c = canvas(size, size), ctx = c.getContext('2d');
    const sc = Math.min(size / s.canvas.width, size / s.canvas.height) * 0.92;
    ctx.imageSmoothingEnabled = res !== 1;
    const w = s.canvas.width * sc, h = s.canvas.height * sc;
    ctx.drawImage(s.canvas, (size - w) / 2, size - h - size * 0.04, w, h);
    return c.toDataURL();
  }

  return { get, tileTex, icon, tint: T, style };
}
