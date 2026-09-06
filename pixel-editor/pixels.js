/** Tiny RGBA buffer helpers for the pixel editor. ImageData-shaped only. */

export function createPixels(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function clonePixels(src) {
  const out = createPixels(src.width, src.height);
  out.data.set(src.data);
  return out;
}

export function resizePixels(src, width, height) {
  const out = createPixels(width, height);
  const cw = Math.min(width, src.width);
  const ch = Math.min(height, src.height);
  for (let y = 0; y < ch; y++) {
    const si = y * src.width * 4;
    const di = y * width * 4;
    out.data.set(src.data.subarray(si, si + cw * 4), di);
  }
  return out;
}

function idx(px, x, y) {
  return (y * px.width + x) * 4;
}

export function getPixel(src, x, y) {
  if (x < 0 || y < 0 || x >= src.width || y >= src.height) return [0, 0, 0, 0];
  const i = idx(src, x, y);
  return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
}

export function setPixel(src, x, y, color) {
  if (x < 0 || y < 0 || x >= src.width || y >= src.height) return;
  const i = idx(src, x, y);
  src.data[i] = color[0];
  src.data[i + 1] = color[1];
  src.data[i + 2] = color[2];
  src.data[i + 3] = color[3] ?? 255;
}

export function floodFill(src, x, y, color) {
  const dst = clonePixels(src);
  if (x < 0 || y < 0 || x >= dst.width || y >= dst.height) return dst;
  const i0 = idx(dst, x, y);
  const tr = dst.data[i0];
  const tg = dst.data[i0 + 1];
  const tb = dst.data[i0 + 2];
  const ta = dst.data[i0 + 3];
  const cr = color[0];
  const cg = color[1];
  const cb = color[2];
  const ca = color[3] ?? 255;
  if (tr === cr && tg === cg && tb === cb && ta === ca) return dst;
  const stack = [x, y];
  while (stack.length) {
    const cy = stack.pop();
    const cx = stack.pop();
    if (cx < 0 || cy < 0 || cx >= dst.width || cy >= dst.height) continue;
    const i = idx(dst, cx, cy);
    if (dst.data[i] !== tr || dst.data[i + 1] !== tg || dst.data[i + 2] !== tb || dst.data[i + 3] !== ta) {
      continue;
    }
    dst.data[i] = cr;
    dst.data[i + 1] = cg;
    dst.data[i + 2] = cb;
    dst.data[i + 3] = ca;
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
  return dst;
}

export function usedColors(px, limit = 48) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < px.data.length; i += 4) {
    if (px.data[i + 3] < 16) continue;
    const key = (px.data[i] << 16) | (px.data[i + 1] << 8) | px.data[i + 2];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([px.data[i], px.data[i + 1], px.data[i + 2], 255]);
    if (out.length >= limit) break;
  }
  return out;
}

export function colorToHex(color) {
  return (
    "#" +
    color
      .slice(0, 3)
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToColor(hex) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return [232, 228, 217, 255];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}

export function rgbCss(rgb) {
  return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
}

export function isMagenta(r, g, b) {
  return r >= 200 && b >= 200 && g <= 90;
}

/** Average opaque pixels in [x0,x1)×[y0,y1). Skips magenta chroma. Null if empty. */
export function averageRect(imageData, x0, y0, x1, y1) {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;
  const xa = Math.max(0, Math.min(w, Math.floor(x0)));
  const ya = Math.max(0, Math.min(h, Math.floor(y0)));
  const xb = Math.max(0, Math.min(w, Math.ceil(x1)));
  const yb = Math.max(0, Math.min(h, Math.ceil(y1)));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 16) continue;
      if (isMagenta(data[i], data[i + 1], data[i + 2])) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (!n) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255];
}

export function walkLine(x0, y0, x1, y1, visit) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    visit(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
