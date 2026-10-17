// Card faces and backs, painted on canvas. Indexes are oversized on purpose:
// on a phone a card on the table is ~50px wide and the corner must still read.
import { parseFace, SUIT_SYMBOL } from './model.js';

export const TEX_W = 240;
export const TEX_H = 336;

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Avenir Next", "Segoe UI", Roboto, system-ui, sans-serif';

const INK = { red: '#c4262e', black: '#1b1c22', blue: '#1d5fc0', green: '#17803a' };
const COLOR_DECK = { r: '#de3b3b', y: '#f2b81f', g: '#2fa553', b: '#2d6fd8', w: '#1b1b20' };

export const BACK_STYLES = {
  navy: { base: '#1c3264', deep: '#11203f', line: '#d6b366' },
  crimson: { base: '#8e1f2c', deep: '#5c111b', line: '#f2d49c' },
  forest: { base: '#1f5a3a', deep: '#123823', line: '#e6d6a0' },
  onyx: { base: '#25252c', deep: '#141418', line: '#c9a646' },
  plum: { base: '#55275f', deep: '#35163d', line: '#efc6f5' },
  teal: { base: '#0f6068', deep: '#083d42', line: '#bdf1e8' },
};

let fourColor = false;
const cache = new Map();

export function setFourColor(on) {
  if (fourColor === !!on) return false;
  fourColor = !!on;
  for (const key of [...cache.keys()]) if (!key.startsWith('back:')) cache.delete(key);
  return true;
}

function suitInk(suit) {
  if (fourColor && suit === 'D') return INK.blue;
  if (fourColor && suit === 'C') return INK.green;
  return suit === 'H' || suit === 'D' ? INK.red : INK.black;
}

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function paper(g, tint = '#fbf8f0') {
  g.fillStyle = tint;
  g.fillRect(0, 0, TEX_W, TEX_H);
  const grad = g.createLinearGradient(0, 0, TEX_W, TEX_H);
  grad.addColorStop(0, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0.04)');
  g.fillStyle = grad;
  g.fillRect(0, 0, TEX_W, TEX_H);
}

function text(g, str, x, y, size, color, font = SERIF, weight = 700, align = 'center') {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(str, x, y);
}

function fitText(g, str, x, y, size, maxW, color, font = SERIF, weight = 700) {
  g.font = `${weight} ${size}px ${font}`;
  const w = g.measureText(str).width;
  const s = w > maxW ? (size * maxW) / w : size;
  text(g, str, x, y, s, color, font, weight);
}

// Draw in the top-left corner, then again rotated for the bottom-right.
function corners(g, draw) {
  draw();
  g.save();
  g.translate(TEX_W, TEX_H);
  g.rotate(Math.PI);
  draw();
  g.restore();
}

const PIPS = {
  2: [[0.5, 0], [0.5, 1]],
  3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

function drawStd(g, p) {
  paper(g);
  const ink = suitInk(p.suit);
  const sym = SUIT_SYMBOL[p.suit];
  corners(g, () => {
    fitText(g, p.rank, 36, 44, p.rank === '10' ? 54 : 62, 62, ink, SERIF, 700);
    text(g, sym, 36, 100, 50, ink, SERIF, 400);
  });
  const left = 84;
  const right = TEX_W - 84;
  const top = 58;
  const bottom = TEX_H - 58;
  if (PIPS[p.rank]) {
    for (const [cx, cy] of PIPS[p.rank]) {
      const x = left + (right - left) * cx;
      const y = top + (bottom - top) * cy;
      g.save();
      g.translate(x, y);
      if (cy > 0.5) g.rotate(Math.PI);
      text(g, sym, 0, 0, 46, ink, SERIF, 400);
      g.restore();
    }
  } else if (p.rank === 'A') {
    text(g, sym, TEX_W / 2, TEX_H / 2 + 4, 132, ink, SERIF, 400);
  } else {
    const fx = 70;
    const fy = 40;
    const fw = TEX_W - 140;
    const fh = TEX_H - 80;
    g.save();
    roundRect(g, fx, fy, fw, fh, 10);
    g.fillStyle = p.red && !fourColor ? '#f8e4dc' : fourColor && p.suit === 'D' ? '#e1eaf8' : fourColor && p.suit === 'C' ? '#dff1e3' : p.red ? '#f8e4dc' : '#e6e7ef';
    g.fill();
    g.clip();
    g.strokeStyle = ink;
    g.globalAlpha = 0.08;
    g.lineWidth = 6;
    for (let k = -TEX_H; k < TEX_W + TEX_H; k += 18) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k - TEX_H, TEX_H);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = ink;
    g.lineWidth = 3;
    roundRect(g, fx, fy, fw, fh, 10);
    g.stroke();
    const crown = { K: '♚', Q: '♛', J: '♞' }[p.rank];
    text(g, crown, TEX_W / 2, TEX_H / 2 - 52, 60, ink, SERIF, 400);
    text(g, p.rank, TEX_W / 2, TEX_H / 2 + 22, 92, ink, SERIF, 700);
    text(g, sym, TEX_W / 2, TEX_H / 2 + 92, 40, ink, SERIF, 400);
  }
}

function drawJoker(g, p) {
  paper(g);
  const ink = p.red ? INK.red : INK.black;
  corners(g, () => {
    'JOKER'.split('').forEach((ch, i) => text(g, ch, 30, 34 + i * 34, 30, ink, SERIF, 700));
  });
  text(g, '★', TEX_W / 2, TEX_H / 2 - 18, 130, ink, SERIF, 400);
  fitText(g, 'JOKER', TEX_W / 2, TEX_H / 2 + 76, 34, 120, ink, SERIF, 700);
}

function drawSkip(g, x, y, r, color) {
  g.strokeStyle = color;
  g.lineWidth = r * 0.28;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.moveTo(x - r * 0.7, y + r * 0.7);
  g.lineTo(x + r * 0.7, y - r * 0.7);
  g.stroke();
}

function drawReverse(g, x, y, r, color) {
  g.save();
  g.translate(x, y);
  g.rotate(-Math.PI / 4);
  g.fillStyle = color;
  for (const dir of [1, -1]) {
    g.save();
    g.translate(dir * r * 0.24, 0);
    g.scale(1, dir);
    g.fillRect(-r * 0.13, -r * 0.2, r * 0.26, r * 0.8);
    g.beginPath();
    g.moveTo(-r * 0.36, -r * 0.18);
    g.lineTo(r * 0.36, -r * 0.18);
    g.lineTo(0, -r * 0.72);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();
}

function quadrants(g, x, y, rx, ry) {
  const cols = [COLOR_DECK.r, COLOR_DECK.b, COLOR_DECK.y, COLOR_DECK.g];
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(x, y);
    g.ellipse(x, y, rx, ry, -0.5, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
    g.closePath();
    g.fillStyle = cols[i];
    g.fill();
  }
}

function colorSymbol(g, value, x, y, size, color) {
  if (value === 'S') return drawSkip(g, x, y, size * 0.38, color);
  if (value === 'R') return drawReverse(g, x, y, size * 0.55, color);
  const label = value === 'D' ? '+2' : value === 'F' ? '+4' : value === 'W' ? 'W' : value;
  text(g, label, x, y + size * 0.04, size, color, SANS, 900);
  return null;
}

function drawColors(g, p) {
  const base = COLOR_DECK[p.color];
  g.fillStyle = '#fdfdfd';
  g.fillRect(0, 0, TEX_W, TEX_H);
  roundRect(g, 12, 12, TEX_W - 24, TEX_H - 24, 18);
  g.fillStyle = base;
  g.fill();
  g.save();
  g.translate(TEX_W / 2, TEX_H / 2);
  g.beginPath();
  g.ellipse(0, 0, 88, 140, 0.5, 0, Math.PI * 2);
  g.fillStyle = '#fdfdfd';
  g.fill();
  g.restore();
  if (p.color === 'w') {
    quadrants(g, TEX_W / 2, TEX_H / 2, 76, 126);
    if (p.value === 'F') {
      text(g, '+4', TEX_W / 2 + 3, TEX_H / 2 + 5, 90, '#111', SANS, 900);
      text(g, '+4', TEX_W / 2, TEX_H / 2, 90, '#fff', SANS, 900);
    }
  } else {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowOffsetX = 4;
    g.shadowOffsetY = 4;
    colorSymbol(g, p.value, TEX_W / 2, TEX_H / 2, 128, base);
    g.restore();
  }
  corners(g, () => {
    if (p.color === 'w') {
      if (p.value === 'F') text(g, '+4', 44, 46, 40, '#fff', SANS, 900);
      else quadrants(g, 42, 46, 16, 24);
    } else {
      colorSymbol(g, p.value, 42, 46, 44, '#fff');
    }
  });
}

function drawNumber(g, p) {
  const hue = (p.n * 47) % 360;
  paper(g, '#f7f3ea');
  g.fillStyle = `hsl(${hue} 55% 46%)`;
  roundRect(g, 14, 14, TEX_W - 28, TEX_H - 28, 16);
  g.lineWidth = 6;
  g.strokeStyle = `hsl(${hue} 55% 46%)`;
  g.stroke();
  g.fillStyle = `hsl(${hue} 60% 92%)`;
  roundRect(g, 40, 80, TEX_W - 80, TEX_H - 160, 60);
  g.fill();
  fitText(g, String(p.n), TEX_W / 2, TEX_H / 2 + 4, 112, TEX_W - 96, `hsl(${hue} 60% 28%)`, SANS, 800);
  corners(g, () => fitText(g, String(p.n), 44, 44, 40, 56, `hsl(${hue} 55% 35%)`, SANS, 800));
}

export function faceCanvas(f) {
  const key = `face:${f}`;
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas();
  const g = c.getContext('2d');
  const p = parseFace(f);
  if (!p) paper(g);
  else if (p.kind === 'joker') drawJoker(g, p);
  else if (p.kind === 'colors') drawColors(g, p);
  else if (p.kind === 'number') drawNumber(g, p);
  else drawStd(g, p);
  cache.set(key, c);
  return c;
}

export function backCanvas(style) {
  const key = `back:${style}`;
  let c = cache.get(key);
  if (c) return c;
  const st = BACK_STYLES[style] || BACK_STYLES.navy;
  c = makeCanvas();
  const g = c.getContext('2d');
  g.fillStyle = '#f6f2e8';
  g.fillRect(0, 0, TEX_W, TEX_H);
  roundRect(g, 12, 12, TEX_W - 24, TEX_H - 24, 14);
  const grad = g.createRadialGradient(TEX_W / 2, TEX_H / 2, 20, TEX_W / 2, TEX_H / 2, TEX_H * 0.6);
  grad.addColorStop(0, st.base);
  grad.addColorStop(1, st.deep);
  g.fillStyle = grad;
  g.fill();
  g.save();
  roundRect(g, 22, 22, TEX_W - 44, TEX_H - 44, 10);
  g.clip();
  g.strokeStyle = st.line;
  g.globalAlpha = 0.28;
  g.lineWidth = 2;
  for (let k = -TEX_H; k < TEX_W + TEX_H; k += 16) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + TEX_H, TEX_H);
    g.moveTo(k, 0);
    g.lineTo(k - TEX_H, TEX_H);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = st.line;
  g.lineWidth = 3;
  roundRect(g, 22, 22, TEX_W - 44, TEX_H - 44, 10);
  g.stroke();
  g.save();
  g.translate(TEX_W / 2, TEX_H / 2);
  g.rotate(Math.PI / 4);
  g.fillStyle = st.deep;
  g.fillRect(-42, -42, 84, 84);
  g.strokeStyle = st.line;
  g.lineWidth = 3;
  g.strokeRect(-42, -42, 84, 84);
  g.strokeRect(-32, -32, 64, 64);
  g.restore();
  text(g, '♠♥', TEX_W / 2, TEX_H / 2 - 12, 26, st.line, SERIF, 400);
  text(g, '♣♦', TEX_W / 2, TEX_H / 2 + 14, 26, st.line, SERIF, 400);
  cache.set(key, c);
  return c;
}

const urls = new Map();
export function cardURL(f, back) {
  const key = f ? `f:${f}:${fourColor}` : `b:${back}`;
  let u = urls.get(key);
  if (!u) {
    u = (f ? faceCanvas(f) : backCanvas(back)).toDataURL('image/png');
    urls.set(key, u);
  }
  return u;
}
