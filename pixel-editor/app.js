import {
  clonePixels,
  colorToHex,
  createPixels,
  floodFill,
  getPixel,
  hexToColor,
  resizePixels,
  rgbCss,
  setPixel,
  usedColors,
  walkLine,
  averageRect,
} from "./pixels.js";
import {
  decodePixels,
  encodePixels,
  isProjectFile,
  isProjectPayload,
  PROJECT_APP,
  PROJECT_VERSION,
} from "./project.js";

const HANDLE = 12;
const MAX_CELL = 128;
const MAX_DIM = 1024;
const UNDO_CAP = 40;
const artOff = document.createElement("canvas");

const bgView = document.getElementById("bg-view");
const artView = document.getElementById("art-view");
const viewWrap = document.getElementById("view-wrap");
const imageList = document.getElementById("image-list");
const paletteEl = document.getElementById("palette");
const statusEl = document.getElementById("status");
const colorEl = document.getElementById("color");
const colorMeta = document.getElementById("color-meta");
const cellSizeEl = document.getElementById("cell-size");
const colsEl = document.getElementById("cols");
const rowsEl = document.getElementById("rows");
const gridXEl = document.getElementById("grid-x");
const gridYEl = document.getElementById("grid-y");
const zoomEl = document.getElementById("zoom");
const zoomVal = document.getElementById("zoom-val");
const inkEl = document.getElementById("ink");
const inkVal = document.getElementById("ink-val");

const state = {
  images: [],
  sel: 0,
  showBg: true,
  showArt: true,
  showGrid: true,
  zoom: 4,
  ink: 1,
  cell: 8,
  cols: 32,
  rows: 32,
  gridX: 0,
  gridY: 0,
  pixels: createPixels(32, 32),
  undo: [],
  tool: "pencil",
  color: [232, 228, 217, 255],
  hover: null,
};

let drawing = false;
let selecting = false;
let selectStart = null;
let selectEnd = null;
let pointerHeld = false;
let lastCell = null;
let strokeUndo = false;
let panning = false;
let panX = 0;
let panY = 0;
let movingGrid = false;
let resizingGrid = false;
let moveDX = 0;
let moveDY = 0;
let spacePan = false;

function currentBg() {
  return state.images[state.sel] || null;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function setStatus(text) {
  statusEl.textContent = text;
}

function gridStatus() {
  const bg = currentBg();
  const name = bg ? bg.name : "no reference";
  setStatus(
    name +
      " · " +
      state.cols +
      "×" +
      state.rows +
      " · cell " +
      state.cell +
      " · at " +
      state.gridX +
      "," +
      state.gridY
  );
}

function setTool(name) {
  state.tool = name;
  const ids = {
    pencil: "tool-pencil",
    trace: "tool-trace",
    area: "tool-area",
    eraser: "tool-eraser",
    fill: "tool-fill",
    eyedrop: "tool-eyedrop",
    move: "tool-move",
    pan: "tool-pan",
  };
  for (const [tool, id] of Object.entries(ids)) {
    document.getElementById(id).setAttribute("aria-pressed", String(tool === name));
  }
  refreshCursor();
}

function refreshCursor(e) {
  artView.classList.toggle("pan", state.tool === "pan" || spacePan);
  artView.classList.toggle("move", state.tool === "move" && !spacePan);
  artView.classList.toggle("area", state.tool === "area" && !spacePan);
  artView.classList.toggle("resize", Boolean(e && nearHandle(e)));
}

function setShowBg(on) {
  state.showBg = on;
  document.getElementById("show-bg").checked = on;
  paint();
}

function setShowArt(on) {
  state.showArt = on;
  document.getElementById("show-art").checked = on;
  paintArt();
}

function setColor(color) {
  showColor(color);
  renderPalette();
}

function pushUndo() {
  state.undo.push(clonePixels(state.pixels));
  if (state.undo.length > UNDO_CAP) state.undo.shift();
}

function undo() {
  if (!state.undo.length) return;
  state.pixels = state.undo.pop();
  state.cols = state.pixels.width;
  state.rows = state.pixels.height;
  syncFields();
  renderPalette();
  paint();
}

function stageMetrics() {
  const bg = currentBg();
  const gw = state.cols * state.cell;
  const gh = state.rows * state.cell;
  const minX = Math.min(0, state.gridX);
  const minY = Math.min(0, state.gridY);
  const maxX = Math.max(bg ? bg.width : 0, state.gridX + gw);
  const maxY = Math.max(bg ? bg.height : 0, state.gridY + gh);
  return {
    minX,
    minY,
    stageW: Math.max(1, maxX - minX),
    stageH: Math.max(1, maxY - minY),
    gw,
    gh,
  };
}

function clientToSource(e) {
  const rect = artView.getBoundingClientRect();
  const { minX, minY } = stageMetrics();
  const sx = ((e.clientX - rect.left) / rect.width) * (artView.width / state.zoom) + minX;
  const sy = ((e.clientY - rect.top) / rect.height) * (artView.height / state.zoom) + minY;
  return { sx, sy };
}

function sourceToCell(sx, sy) {
  return {
    ax: Math.floor((sx - state.gridX) / state.cell),
    ay: Math.floor((sy - state.gridY) / state.cell),
  };
}

function inArt(ax, ay) {
  return ax >= 0 && ay >= 0 && ax < state.cols && ay < state.rows;
}

function handleViewPos() {
  const { minX, minY } = stageMetrics();
  return {
    x: (state.gridX - minX + state.cols * state.cell) * state.zoom,
    y: (state.gridY - minY + state.rows * state.cell) * state.zoom,
  };
}

function nearHandle(e) {
  const rect = artView.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const cx = ((e.clientX - rect.left) / rect.width) * artView.width;
  const cy = ((e.clientY - rect.top) / rect.height) * artView.height;
  const h = handleViewPos();
  return Math.hypot(cx - h.x, cy - h.y) <= HANDLE;
}

function sampleBg(sx, sy) {
  const bg = currentBg();
  if (!bg) return null;
  const x = Math.floor(sx);
  const y = Math.floor(sy);
  if (x < 0 || y < 0 || x >= bg.width || y >= bg.height) return null;
  const i = (y * bg.width + x) * 4;
  const d = bg.data.data;
  if (d[i + 3] < 16) return null;
  return [d[i], d[i + 1], d[i + 2], 255];
}

function eyedropAt(sx, sy) {
  const { ax, ay } = sourceToCell(sx, sy);
  if (inArt(ax, ay)) {
    const p = getPixel(state.pixels, ax, ay);
    if (p[3] >= 16) {
      setColor(p);
      return;
    }
  }
  const bg = sampleBg(sx, sy);
  if (bg) setColor(bg);
}

function sampleCellColor(ax, ay) {
  const bg = currentBg();
  if (!bg) return null;
  const x0 = state.gridX + ax * state.cell;
  const y0 = state.gridY + ay * state.cell;
  return averageRect(bg.data, x0, y0, x0 + state.cell, y0 + state.cell);
}

function overlapCells(a, b) {
  const x0 = Math.max(0, Math.min(a.ax, b.ax));
  const x1 = Math.min(state.cols - 1, Math.max(a.ax, b.ax));
  const y0 = Math.max(0, Math.min(a.ay, b.ay));
  const y1 = Math.min(state.rows - 1, Math.max(a.ay, b.ay));
  if (x0 > x1 || y0 > y1) return null;
  return { x0, y0, x1, y1 };
}

function fillCellFromBg(ax, ay) {
  const sampled = sampleCellColor(ax, ay);
  setPixel(state.pixels, ax, ay, sampled || [0, 0, 0, 0]);
  if (sampled) showColor(sampled);
}

function traceArea(a, b) {
  if (!currentBg()) {
    setStatus("Load a reference first.");
    return;
  }
  const box = overlapCells(a, b);
  if (!box) return;
  pushUndo();
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) fillCellFromBg(x, y);
  }
  renderPalette();
  paint();
}

function showColor(color) {
  state.color = [color[0], color[1], color[2], color[3] ?? 255];
  const hex = colorToHex(state.color);
  colorEl.value = hex;
  colorMeta.textContent = hex;
}

function stampCell(ax, ay) {
  if (!inArt(ax, ay)) return false;
  if (!strokeUndo) {
    pushUndo();
    strokeUndo = true;
  }
  if (state.tool === "eraser") {
    setPixel(state.pixels, ax, ay, [0, 0, 0, 0]);
  } else if (state.tool === "trace") {
    fillCellFromBg(ax, ay);
  } else {
    setPixel(state.pixels, ax, ay, state.color);
  }
  return true;
}

function applyPaint(ax, ay, dragging) {
  if (!inArt(ax, ay)) return;
  if (state.tool === "eyedrop") return;
  if (state.tool === "trace" && !currentBg()) {
    if (!dragging) setStatus("Load a reference first.");
    return;
  }
  if (state.tool === "fill") {
    if (dragging) return;
    pushUndo();
    state.pixels = floodFill(state.pixels, ax, ay, state.color);
    renderPalette();
    return;
  }
  stampCell(ax, ay);
}

function paintStroke(ax, ay, dragging) {
  if (state.tool === "fill" || state.tool === "eyedrop") {
    applyPaint(ax, ay, dragging);
  } else if (!dragging || !lastCell) {
    applyPaint(ax, ay, dragging);
  } else {
    walkLine(lastCell.ax, lastCell.ay, ax, ay, (x, y) => applyPaint(x, y, true));
  }
  lastCell = { ax, ay };
  state.hover = inArt(ax, ay) ? { ax, ay } : null;
  paintArt();
}

function checker(ctx, w, h, size) {
  ctx.fillStyle = "#1a1e28";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2a2e38";
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      if (((x / size) + (y / size)) % 2 === 0) ctx.fillRect(x, y, size, size);
    }
  }
}

function paintBg() {
  const { minX, minY, stageW, stageH } = stageMetrics();
  const z = state.zoom;
  const w = Math.max(1, Math.round(stageW * z));
  const h = Math.max(1, Math.round(stageH * z));
  bgView.width = w;
  bgView.height = h;
  const ctx = bgView.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  checker(ctx, w, h, 12);
  const bg = currentBg();
  if (bg && state.showBg) {
    ctx.drawImage(bg.img, (0 - minX) * z, (0 - minY) * z, bg.width * z, bg.height * z);
  }
}

function paintArt() {
  const { minX, minY, stageW, stageH, gw, gh } = stageMetrics();
  const z = state.zoom;
  const w = Math.max(1, Math.round(stageW * z));
  const h = Math.max(1, Math.round(stageH * z));
  if (artView.width !== w) artView.width = w;
  if (artView.height !== h) artView.height = h;
  const ctx = artView.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);

  const gx = (state.gridX - minX) * z;
  const gy = (state.gridY - minY) * z;
  const gwz = gw * z;
  const ghz = gh * z;

  if (artOff.width !== state.pixels.width) artOff.width = state.pixels.width;
  if (artOff.height !== state.pixels.height) artOff.height = state.pixels.height;
  if (state.showArt) {
    artOff.getContext("2d").putImageData(new ImageData(state.pixels.data, state.pixels.width, state.pixels.height), 0, 0);
    ctx.save();
    ctx.globalAlpha = state.ink;
    ctx.drawImage(artOff, gx, gy, gwz, ghz);
    ctx.restore();
  }

  if (state.hover && inArt(state.hover.ax, state.hover.ay) && !selecting) {
    ctx.fillStyle = "rgba(212, 162, 74, 0.28)";
    ctx.fillRect(gx + state.hover.ax * state.cell * z, gy + state.hover.ay * state.cell * z, state.cell * z, state.cell * z);
  }

  if (selectStart && selectEnd) {
    const box = overlapCells(selectStart, selectEnd);
    if (box) {
      const rx = gx + box.x0 * state.cell * z;
      const ry = gy + box.y0 * state.cell * z;
      const rw = (box.x1 - box.x0 + 1) * state.cell * z;
      const rh = (box.y1 - box.y0 + 1) * state.cell * z;
      ctx.fillStyle = "rgba(212, 162, 74, 0.2)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "rgba(212, 162, 74, 0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
    }
  }

  ctx.strokeStyle = "rgba(232, 228, 217, 0.85)";
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + 0.5, gy + 0.5, gwz - 1, ghz - 1);

  if (state.showGrid && state.cell * z >= 4) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.beginPath();
    for (let x = 1; x < state.cols; x++) {
      const px = gx + x * state.cell * z + 0.5;
      ctx.moveTo(px, gy);
      ctx.lineTo(px, gy + ghz);
    }
    for (let y = 1; y < state.rows; y++) {
      const py = gy + y * state.cell * z + 0.5;
      ctx.moveTo(gx, py);
      ctx.lineTo(gx + gwz, py);
    }
    ctx.stroke();
  }

  const hx = gx + gwz;
  const hy = gy + ghz;
  ctx.fillStyle = "#12141a";
  ctx.fillRect(hx - 5, hy - 5, 10, 10);
  ctx.strokeStyle = "#e8e4d9";
  ctx.strokeRect(hx - 5.5, hy - 5.5, 11, 11);
}

function paint() {
  paintBg();
  paintArt();
  gridStatus();
}

function fitZoom() {
  const { stageW, stageH } = stageMetrics();
  const box = viewWrap.getBoundingClientRect();
  const pad = 32;
  const z = Math.max(
    1,
    Math.min(32, Math.floor(Math.min((box.width - pad) / stageW, (box.height - pad) / stageH)) || 1)
  );
  state.zoom = z;
  zoomEl.value = String(z);
  zoomVal.textContent = z + "×";
}

function coverImage() {
  const bg = currentBg();
  if (!bg) return;
  state.gridX = 0;
  state.gridY = 0;
  state.cell = clamp(Math.floor(Math.min(bg.width / state.cols, bg.height / state.rows)), 1, MAX_CELL);
  syncFields();
  paint();
}

function matchPixels() {
  const bg = currentBg();
  if (!bg) return;
  state.cell = 1;
  state.gridX = 0;
  state.gridY = 0;
  applySize(Math.min(MAX_DIM, bg.width), Math.min(MAX_DIM, bg.height), true);
  fitZoom();
  syncFields();
  paint();
}

function centerGrid() {
  const bg = currentBg();
  if (!bg) return;
  state.gridX = Math.round((bg.width - state.cols * state.cell) / 2);
  state.gridY = Math.round((bg.height - state.rows * state.cell) / 2);
  syncFields();
  paint();
}

function applySize(cols, rows, allowUndo) {
  cols = clamp(cols | 0, 1, MAX_DIM);
  rows = clamp(rows | 0, 1, MAX_DIM);
  if (cols === state.pixels.width && rows === state.pixels.height) {
    state.cols = cols;
    state.rows = rows;
    return;
  }
  if (allowUndo) pushUndo();
  state.pixels = resizePixels(state.pixels, cols, rows);
  state.cols = cols;
  state.rows = rows;
  renderPalette();
}

function syncFields() {
  const active = document.activeElement;
  const set = (el, val) => {
    if (active === el) return;
    el.value = String(val);
  };
  set(cellSizeEl, state.cell);
  set(colsEl, state.cols);
  set(rowsEl, state.rows);
  set(gridXEl, state.gridX);
  set(gridYEl, state.gridY);
  if (active !== colorEl) colorEl.value = colorToHex(state.color);
  colorMeta.textContent = colorToHex(state.color);
}

function renderImages() {
  imageList.replaceChildren();
  state.images.forEach((entry, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "name";
    btn.textContent = entry.name;
    btn.setAttribute("aria-pressed", String(state.sel === i));
    btn.addEventListener("click", () => {
      state.sel = i;
      renderImages();
      paint();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.title = "Remove";
    remove.textContent = "×";
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      state.images.splice(i, 1);
      if (state.sel === i) state.sel = Math.min(i, Math.max(0, state.images.length - 1));
      else if (state.sel > i) state.sel -= 1;
      renderImages();
      paint();
    });
    li.append(btn, remove);
    imageList.append(li);
  });
}

function renderPalette() {
  const colors = usedColors(state.pixels);
  paletteEl.replaceChildren();
  if (!colors.length) {
    const empty = document.createElement("p");
    empty.className = "swatch-meta";
    empty.textContent = "None yet.";
    paletteEl.append(empty);
    return;
  }
  colors.forEach((rgb) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = colorToHex(rgb);
    b.style.background = rgbCss(rgb);
    b.setAttribute(
      "aria-pressed",
      String(state.color[0] === rgb[0] && state.color[1] === rgb[1] && state.color[2] === rgb[2])
    );
    b.addEventListener("click", () => setColor(rgb));
    paletteEl.append(b);
  });
}

function rasterFromImage(img, name) {
  const c = document.createElement("canvas");
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return {
    name: name || "image",
    img: c,
    width,
    height,
    data: ctx.getImageData(0, 0, width, height),
  };
}

function loadFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(rasterFromImage(img, file.name || "image"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read " + file.name));
    };
    img.src = url;
  });
}

function loadFromDataUrl(name, dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(rasterFromImage(img, name));
    img.onerror = () => reject(new Error("Could not read " + name));
    img.src = dataUrl;
  });
}

function isImageFile(file) {
  return /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
}

async function addImageFiles(files) {
  const list = files.filter(isImageFile);
  if (!list.length) return;
  const startLen = state.images.length;
  for (const file of list) {
    try {
      state.images.push(await loadFromFile(file));
    } catch (err) {
      setStatus(err.message);
    }
  }
  if (!state.images.length) return;
  if (!startLen) {
    state.sel = 0;
    coverImage();
    fitZoom();
  }
  renderImages();
  paint();
}

function exportStem() {
  const bg = currentBg();
  return bg ? bg.name.replace(/\.[^.]+$/, "") : "pixel-art";
}

function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildProject() {
  return {
    app: PROJECT_APP,
    v: PROJECT_VERSION,
    cell: state.cell,
    cols: state.cols,
    rows: state.rows,
    gridX: state.gridX,
    gridY: state.gridY,
    color: colorToHex(state.color),
    sel: state.sel,
    pixels: encodePixels(state.pixels),
    backgrounds: state.images.map((entry) => ({
      name: entry.name,
      data: entry.img.toDataURL("image/png"),
    })),
  };
}

async function applyProject(data) {
  if (!isProjectPayload(data)) throw new Error("Not a pixel-editor project");
  const px = decodePixels(data.pixels);
  if (px.width > MAX_DIM || px.height > MAX_DIM) throw new Error("Project is larger than " + MAX_DIM + "px");
  state.cell = clamp(Number(data.cell) || 1, 1, MAX_CELL);
  state.gridX = Number(data.gridX) || 0;
  state.gridY = Number(data.gridY) || 0;
  state.pixels = px;
  state.cols = px.width;
  state.rows = px.height;
  state.undo = [];
  if (data.color) showColor(hexToColor(data.color));
  const bgs = Array.isArray(data.backgrounds) ? data.backgrounds : [];
  state.images = [];
  for (const bg of bgs) {
    if (!bg || !bg.data) continue;
    state.images.push(await loadFromDataUrl(bg.name || "image", bg.data));
  }
  state.sel = state.images.length ? clamp(Number(data.sel) || 0, 0, state.images.length - 1) : 0;
  syncFields();
  renderImages();
  renderPalette();
  fitZoom();
  paint();
}

function saveProject() {
  const filename = exportStem() + ".pixel.json";
  const blob = new Blob([JSON.stringify(buildProject())], { type: "application/json" });
  downloadBlob(filename, blob);
  setStatus("Saved " + filename);
}

async function openProjectFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Could not parse " + file.name);
  }
  await applyProject(data);
  setStatus("Opened " + file.name);
}

async function addDroppedFiles(files) {
  const list = [...files];
  const project = list.find(isProjectFile);
  if (project) {
    try {
      await openProjectFile(project);
    } catch (err) {
      setStatus(err.message || "Could not open project");
    }
    return;
  }
  await addImageFiles(list);
}

function exportPng() {
  const scale = clamp(Number(document.getElementById("export-scale").value) || 1, 1, 32);
  const c = document.createElement("canvas");
  c.width = state.pixels.width * scale;
  c.height = state.pixels.height * scale;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const off = document.createElement("canvas");
  off.width = state.pixels.width;
  off.height = state.pixels.height;
  off.getContext("2d").putImageData(new ImageData(state.pixels.data, state.pixels.width, state.pixels.height), 0, 0);
  ctx.drawImage(off, 0, 0, c.width, c.height);
  c.toBlob((blob) => {
    downloadBlob(exportStem() + "-pixels.png", blob);
  });
}

function clearPixels() {
  pushUndo();
  state.pixels = createPixels(state.cols, state.rows);
  renderPalette();
  paint();
}

function traceAll() {
  const bg = currentBg();
  if (!bg) {
    setStatus("Load a reference first.");
    return;
  }
  traceArea({ ax: 0, ay: 0 }, { ax: state.cols - 1, ay: state.rows - 1 });
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  artView.setPointerCapture(e.pointerId);
  pointerHeld = true;
  if (state.tool === "pan" || spacePan) {
    panning = true;
    panX = e.clientX;
    panY = e.clientY;
    return;
  }
  if (nearHandle(e)) {
    resizingGrid = true;
    return;
  }
  const { sx, sy } = clientToSource(e);
  if (state.tool === "move" || e.altKey) {
    movingGrid = true;
    moveDX = sx - state.gridX;
    moveDY = sy - state.gridY;
    return;
  }
  const { ax, ay } = sourceToCell(sx, sy);
  if (state.tool === "area") {
    if (!currentBg()) {
      setStatus("Load a reference first.");
      return;
    }
    selecting = true;
    selectStart = { ax, ay };
    selectEnd = { ax, ay };
    paintArt();
    return;
  }
  drawing = true;
  lastCell = null;
  strokeUndo = false;
  if (state.tool === "eyedrop") {
    eyedropAt(sx, sy);
    return;
  }
  paintStroke(ax, ay, false);
}

function onPointerMove(e) {
  refreshCursor(e);
  if (panning) {
    viewWrap.scrollLeft -= e.clientX - panX;
    viewWrap.scrollTop -= e.clientY - panY;
    panX = e.clientX;
    panY = e.clientY;
    return;
  }
  const { sx, sy } = clientToSource(e);
  if (resizingGrid) {
    const cx = (sx - state.gridX) / state.cols;
    const cy = (sy - state.gridY) / state.rows;
    state.cell = clamp(Math.round(Math.max(cx, cy)), 1, MAX_CELL);
    syncFields();
    paint();
    return;
  }
  if (movingGrid) {
    state.gridX = Math.round(sx - moveDX);
    state.gridY = Math.round(sy - moveDY);
    syncFields();
    paint();
    return;
  }
  const { ax, ay } = sourceToCell(sx, sy);
  if (selecting) {
    selectEnd = { ax, ay };
    paintArt();
    return;
  }
  const next = inArt(ax, ay) ? { ax, ay } : null;
  if (!drawing) {
    const same = state.hover && next && state.hover.ax === next.ax && state.hover.ay === next.ay;
    const bothEmpty = !state.hover && !next;
    if (!same && !bothEmpty) {
      state.hover = next;
      paintArt();
    }
    return;
  }
  if (state.tool === "eyedrop") {
    eyedropAt(sx, sy);
    return;
  }
  paintStroke(ax, ay, true);
}

function onPointerUp() {
  if (!pointerHeld) return;
  pointerHeld = false;
  if (selecting && selectStart && selectEnd) traceArea(selectStart, selectEnd);
  else if (drawing && (state.tool === "pencil" || state.tool === "eraser" || state.tool === "trace")) {
    renderPalette();
  }
  drawing = false;
  selecting = false;
  selectStart = null;
  selectEnd = null;
  panning = false;
  movingGrid = false;
  resizingGrid = false;
  lastCell = null;
  paintArt();
}

artView.addEventListener("pointerdown", onPointerDown);
artView.addEventListener("pointermove", onPointerMove);
artView.addEventListener("pointerup", onPointerUp);
artView.addEventListener("pointercancel", onPointerUp);
artView.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const { sx, sy } = clientToSource(e);
  eyedropAt(sx, sy);
});
artView.addEventListener("lostpointercapture", onPointerUp);
artView.addEventListener("pointerleave", () => {
  if (drawing || selecting || movingGrid || resizingGrid || panning) return;
  state.hover = null;
  paintArt();
});

document.getElementById("tool-pencil").addEventListener("click", () => setTool("pencil"));
document.getElementById("tool-trace").addEventListener("click", () => setTool("trace"));
document.getElementById("tool-area").addEventListener("click", () => setTool("area"));
document.getElementById("tool-eraser").addEventListener("click", () => setTool("eraser"));
document.getElementById("tool-fill").addEventListener("click", () => setTool("fill"));
document.getElementById("tool-eyedrop").addEventListener("click", () => setTool("eyedrop"));
document.getElementById("tool-move").addEventListener("click", () => setTool("move"));
document.getElementById("tool-pan").addEventListener("click", () => setTool("pan"));
document.getElementById("btn-undo").addEventListener("click", undo);
document.getElementById("btn-export").addEventListener("click", exportPng);
document.getElementById("btn-save-project").addEventListener("click", saveProject);
document.getElementById("btn-clear").addEventListener("click", clearPixels);
document.getElementById("btn-cover").addEventListener("click", coverImage);
document.getElementById("btn-match").addEventListener("click", matchPixels);
document.getElementById("btn-center").addEventListener("click", centerGrid);
document.getElementById("btn-trace-all").addEventListener("click", traceAll);

document.getElementById("show-bg").addEventListener("change", (e) => {
  setShowBg(e.target.checked);
});
document.getElementById("show-art").addEventListener("change", (e) => {
  setShowArt(e.target.checked);
});
document.getElementById("show-grid").addEventListener("change", (e) => {
  state.showGrid = e.target.checked;
  paintArt();
});
zoomEl.addEventListener("input", () => {
  state.zoom = Number(zoomEl.value);
  zoomVal.textContent = state.zoom + "×";
  paint();
});
inkEl.addEventListener("input", () => {
  state.ink = Number(inkEl.value) / 100;
  inkVal.textContent = inkEl.value + "%";
  paintArt();
});
colorEl.addEventListener("input", () => setColor(hexToColor(colorEl.value)));

function readCellSize() {
  state.cell = clamp(Number(cellSizeEl.value) || 1, 1, MAX_CELL);
  paint();
}
cellSizeEl.addEventListener("input", readCellSize);
cellSizeEl.addEventListener("change", () => {
  readCellSize();
  syncFields();
});
colsEl.addEventListener("change", () => {
  applySize(Number(colsEl.value) || 1, state.rows, true);
  syncFields();
  paint();
});
rowsEl.addEventListener("change", () => {
  applySize(state.cols, Number(rowsEl.value) || 1, true);
  syncFields();
  paint();
});
gridXEl.addEventListener("input", () => {
  state.gridX = Number(gridXEl.value) || 0;
  paint();
});
gridYEl.addEventListener("input", () => {
  state.gridY = Number(gridYEl.value) || 0;
  paint();
});

document.getElementById("file-images").addEventListener("change", async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  await addImageFiles(files);
});
document.getElementById("file-project").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    await openProjectFile(file);
  } catch (err) {
    setStatus(err.message || "Could not open project");
  }
});

function bindDrop(el) {
  el.addEventListener("dragover", (e) => e.preventDefault());
  el.addEventListener("drop", async (e) => {
    e.preventDefault();
    await addDroppedFiles([...(e.dataTransfer.files || [])]);
  });
}
bindDrop(viewWrap);
bindDrop(document.getElementById("drop-hint").closest(".rail"));

window.addEventListener("paste", async (e) => {
  const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((i) => i.type.startsWith("image/"));
  if (!item) return;
  const file = item.getAsFile();
  if (!file) return;
  await addImageFiles([file]);
});

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveProject();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
    e.preventDefault();
    document.getElementById("file-project").click();
    return;
  }
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if (e.code === "Space") {
    spacePan = true;
    e.preventDefault();
    refreshCursor();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  const tools = { b: "pencil", t: "trace", r: "area", e: "eraser", g: "fill", i: "eyedrop", m: "move", h: "pan" };
  if (tools[e.key.toLowerCase()]) {
    setTool(tools[e.key.toLowerCase()]);
    return;
  }
  if (e.key.toLowerCase() === "v") {
    setShowBg(!state.showBg);
    return;
  }
  if (e.key.toLowerCase() === "d") {
    setShowArt(!state.showArt);
    return;
  }
  if (e.key === "[" || e.key === "]") {
    state.cell = clamp(state.cell + (e.key === "]" ? 1 : -1), 1, MAX_CELL);
    syncFields();
    paint();
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (nudge[e.key]) {
    e.preventDefault();
    state.gridX += nudge[e.key][0];
    state.gridY += nudge[e.key][1];
    syncFields();
    paint();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spacePan = false;
    refreshCursor();
  }
});

viewWrap.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const next = clamp(state.zoom + (e.deltaY < 0 ? 1 : -1), 1, 32);
    state.zoom = next;
    zoomEl.value = String(next);
    zoomVal.textContent = next + "×";
    paint();
  },
  { passive: false }
);

renderPalette();
paint();
