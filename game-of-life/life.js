import {
  LIBRARY,
  TOUR,
  parseRle,
  encodeRle,
  bbox,
  normalize,
  rotateCw,
  flipH,
} from "./patterns.js";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const playBtn = document.getElementById("playPause");
const stepBtn = document.getElementById("step");
const clearBtn = document.getElementById("clear");
const randomBtn = document.getElementById("random");
const fitBtn = document.getElementById("fit");
const toolPaint = document.getElementById("toolPaint");
const toolPan = document.getElementById("toolPan");
const rleBtn = document.getElementById("rleBtn");
const shareBtn = document.getElementById("shareBtn");
const speedInput = document.getElementById("speed");
const speedValue = document.getElementById("speedValue");
const generationEl = document.getElementById("generation");
const populationEl = document.getElementById("population");
const deltaEl = document.getElementById("delta");
const hintEl = document.getElementById("hint");
const blurbEl = document.getElementById("blurb");
const patternList = document.getElementById("patternList");
const rleDialog = document.getElementById("rleDialog");
const rleText = document.getElementById("rleText");
const rleStatus = document.getElementById("rleStatus");
const tourKicker = document.getElementById("tourKicker");
const tourTitle = document.getElementById("tourTitle");
const tourBlurb = document.getElementById("tourBlurb");
const tourStart = document.getElementById("tourStart");
const tourBack = document.getElementById("tourBack");
const tourNext = document.getElementById("tourNext");
const tourSkip = document.getElementById("tourSkip");

const live = new Set();
const view = { x: -6, y: -6, scale: 16 };
let cssW = 800;
let cssH = 500;
let running = false;
let generation = 0;
let gensPerSec = Number(speedInput.value);
let lastTick = 0;
let panMode = false;
let painting = false;
let panning = false;
let paintAlive = true;
let lastPan = null;
let stamp = null;
let hover = null;
let tourIndex = -1;
let lastBirths = new Set();
let lastDeaths = new Set();

function key(x, y) {
  return x + "," + y;
}

function xy(k) {
  const i = k.indexOf(",");
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
}

function cellsFromLive() {
  const cells = [];
  for (const k of live) {
    const [x, y] = xy(k);
    cells.push({ x, y });
  }
  return cells;
}

function setLiveFromCells(cells, resetGen) {
  live.clear();
  for (const cell of cells) live.add(key(cell.x, cell.y));
  if (resetGen) {
    generation = 0;
    lastBirths = new Set();
    lastDeaths = new Set();
  }
  updateStats();
}

function stepLife() {
  const counts = new Map();
  for (const k of live) {
    const [x, y] = xy(k);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nk = key(x + dx, y + dy);
        counts.set(nk, (counts.get(nk) || 0) + 1);
      }
    }
  }
  const next = new Set();
  const births = new Set();
  for (const [k, n] of counts) {
    if (n === 3 || (n === 2 && live.has(k))) {
      next.add(k);
      if (!live.has(k)) births.add(k);
    }
  }
  const deaths = new Set();
  for (const k of live) {
    if (!next.has(k)) deaths.add(k);
  }
  live.clear();
  for (const k of next) live.add(k);
  lastBirths = births;
  lastDeaths = deaths;
  generation += 1;
  updateStats();
}

function updateStats() {
  generationEl.textContent = String(generation);
  populationEl.textContent = String(live.size);
  if (generation === 0) {
    deltaEl.textContent = "Step to see births and deaths";
  } else {
    deltaEl.textContent = `+${lastBirths.size} born · −${lastDeaths.size} died`;
  }
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  cssW = Math.max(1, rect.width);
  cssH = Math.max(1, rect.height);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function screenToWorld(sx, sy) {
  return {
    x: view.x + sx / view.scale,
    y: view.y + sy / view.scale,
  };
}

function cellFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
  return { x: Math.floor(world.x), y: Math.floor(world.y) };
}

function zoomAt(event, factor) {
  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const before = screenToWorld(sx, sy);
  view.scale = Math.min(48, Math.max(3, view.scale * factor));
  view.x = before.x - sx / view.scale;
  view.y = before.y - sy / view.scale;
}

function fitCells(cells, pad = 8) {
  const box = bbox(cells);
  if (!cells.length) {
    view.x = -6;
    view.y = -6;
    view.scale = 16;
    return;
  }
  const scale = Math.max(
    4,
    Math.min(32, Math.min(cssW / (box.w + pad * 2), cssH / (box.h + pad * 2)))
  );
  view.scale = scale;
  view.x = box.minX - (cssW / scale - box.w) / 2;
  view.y = box.minY - (cssH / scale - box.h) / 2;
}

function draw() {
  ctx.fillStyle = "#0c0e12";
  ctx.fillRect(0, 0, cssW, cssH);

  const x0 = Math.floor(view.x);
  const y0 = Math.floor(view.y);
  const x1 = Math.ceil(view.x + cssW / view.scale);
  const y1 = Math.ceil(view.y + cssH / view.scale);

  if (view.scale >= 10) {
    ctx.strokeStyle = "#1a1e26";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      const px = (x - view.x) * view.scale + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, cssH);
    }
    for (let y = y0; y <= y1; y++) {
      const py = (y - view.y) * view.scale + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(cssW, py);
    }
    ctx.stroke();
  }

  const inset = view.scale >= 8 ? 1 : 0;
  const size = Math.max(1, view.scale - inset);

  function fillCell(x, y, color) {
    if (x < x0 - 1 || y < y0 - 1 || x > x1 || y > y1) return;
    ctx.fillStyle = color;
    ctx.fillRect((x - view.x) * view.scale + inset, (y - view.y) * view.scale + inset, size, size);
  }

  for (const k of lastDeaths) {
    const [x, y] = xy(k);
    fillCell(x, y, "#6b3030");
  }
  for (const k of live) {
    const [x, y] = xy(k);
    fillCell(x, y, lastBirths.has(k) ? "#8fdf7a" : "#c8e6a0");
  }

  if (stamp && hover) {
    ctx.globalAlpha = 0.45;
    for (const cell of stamp.cells) {
      fillCell(hover.x + cell.x, hover.y + cell.y, "#e8e4d9");
    }
    ctx.globalAlpha = 1;
  }
}

function setRunning(value) {
  running = value;
  playBtn.textContent = running ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", running ? "true" : "false");
  if (running) lastTick = performance.now();
}

function setPanMode(value) {
  panMode = value;
  toolPan.setAttribute("aria-pressed", panMode ? "true" : "false");
  if (panMode) {
    stamp = null;
    syncPatternButtons();
    toolPaint.setAttribute("aria-pressed", "false");
  } else {
    toolPaint.setAttribute("aria-pressed", stamp ? "false" : "true");
  }
  canvas.classList.toggle("pan", panMode);
  updateHint();
}

function updateHint() {
  if (panMode) {
    hintEl.textContent = "Drag to pan. Wheel zooms. Switch to Paint to draw cells.";
    return;
  }
  if (stamp) {
    hintEl.textContent = `Click to stamp ${stamp.name}. R rotates, F flips, Esc cancels. Right-drag pans.`;
    return;
  }
  hintEl.textContent =
    "Click or drag to paint. Shift erases. Right-drag or Pan to move. Wheel zooms. Pick a pattern to stamp (R/F).";
}

function selectStamp(item) {
  if (stamp && stamp.id === item.id) {
    stamp = null;
    toolPaint.setAttribute("aria-pressed", "true");
  } else {
    stamp = { id: item.id, name: item.name, blurb: item.blurb, cells: item.cells.map((c) => ({ ...c })) };
    panMode = false;
    toolPan.setAttribute("aria-pressed", "false");
    toolPaint.setAttribute("aria-pressed", "false");
    canvas.classList.remove("pan");
    blurbEl.textContent = item.blurb;
  }
  syncPatternButtons();
  updateHint();
}

function syncPatternButtons() {
  for (const btn of patternList.querySelectorAll(".pattern-btn")) {
    btn.setAttribute("aria-pressed", stamp && stamp.id === btn.dataset.id ? "true" : "false");
  }
}

function stampAt(cell) {
  if (!stamp) return;
  for (const c of stamp.cells) live.add(key(cell.x + c.x, cell.y + c.y));
  lastBirths = new Set();
  lastDeaths = new Set();
  updateStats();
}

function paintCell(cell) {
  const k = key(cell.x, cell.y);
  if (paintAlive) live.add(k);
  else live.delete(k);
  lastBirths = new Set();
  lastDeaths = new Set();
  updateStats();
}

function loop(now) {
  if (running) {
    const interval = 1000 / gensPerSec;
    while (now - lastTick >= interval) {
      stepLife();
      lastTick += interval;
      if (now - lastTick > interval * 5) {
        lastTick = now;
        break;
      }
    }
  }
  draw();
  requestAnimationFrame(loop);
}

function drawThumb(cnv, cells) {
  const c = cnv.getContext("2d");
  const w = cnv.width;
  const h = cnv.height;
  c.fillStyle = "#0c0e12";
  c.fillRect(0, 0, w, h);
  const box = bbox(cells);
  if (!cells.length) return;
  const scale = Math.min((w - 6) / Math.max(box.w, 1), (h - 6) / Math.max(box.h, 1));
  const ox = (w - box.w * scale) / 2;
  const oy = (h - box.h * scale) / 2;
  c.fillStyle = "#c8e6a0";
  for (const cell of cells) {
    c.fillRect(ox + (cell.x - box.minX) * scale, oy + (cell.y - box.minY) * scale, Math.max(1, scale - 0.4), Math.max(1, scale - 0.4));
  }
}

function renderLibrary() {
  patternList.innerHTML = "";
  let group = "";
  for (const item of LIBRARY) {
    if (item.group !== group) {
      group = item.group;
      const label = document.createElement("p");
      label.className = "group-label";
      label.textContent = group;
      patternList.appendChild(label);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pattern-btn";
    btn.dataset.id = item.id;
    btn.setAttribute("aria-pressed", "false");
    const thumb = document.createElement("canvas");
    thumb.width = 84;
    thumb.height = 48;
    drawThumb(thumb, item.cells);
    const name = document.createElement("span");
    name.textContent = item.name;
    btn.append(thumb, name);
    btn.addEventListener("click", () => selectStamp(item));
    patternList.appendChild(btn);
  }
}

function loadRleOntoBoard(text, opts = {}) {
  const parsed = parseRle(text);
  if (!parsed.cells.length && !/!/.test(text)) {
    throw new Error("No live cells found. Need RLE with o/b/$/!");
  }
  const cells = normalize(parsed.cells);
  const cam = screenToWorld(cssW / 2, cssH / 2);
  const box = bbox(cells);
  const ox = Math.round(cam.x - box.w / 2);
  const oy = Math.round(cam.y - box.h / 2);
  if (opts.replace) live.clear();
  for (const cell of cells) live.add(key(cell.x + ox, cell.y + oy));
  generation = 0;
  lastBirths = new Set();
  lastDeaths = new Set();
  updateStats();
  if (opts.fit) fitCells(cellsFromLive(), opts.pad || 10);
  return parsed;
}

function applyTourStep(index) {
  tourIndex = index;
  const step = TOUR[index];
  setRunning(false);
  stamp = null;
  syncPatternButtons();
  setPanMode(false);
  live.clear();
  const parsed = parseRle(step.rle);
  setLiveFromCells(normalize(parsed.cells), true);
  fitCells(cellsFromLive(), step.pad || 10);
  blurbEl.textContent = step.blurb;
  tourKicker.textContent = `Step ${index + 1} / ${TOUR.length}`;
  tourTitle.textContent = step.title;
  tourBlurb.textContent = step.blurb;
  tourStart.classList.add("hidden");
  tourStart.textContent = "Start tour";
  tourBack.classList.toggle("hidden", index === 0);
  tourNext.classList.remove("hidden");
  tourNext.textContent = index === TOUR.length - 1 ? "Finish" : "Next";
  tourSkip.classList.remove("hidden");
  if (step.play) setRunning(true);
}

function closeTour() {
  tourIndex = -1;
  setRunning(false);
  tourKicker.textContent = "Cells to bits";
  tourTitle.textContent = "A 6-step tour";
  tourBlurb.textContent =
    "Still life → oscillator → glider → gun → eater → collision. Each step loads a pattern; Play or Step to watch.";
  tourStart.classList.remove("hidden");
  tourBack.classList.add("hidden");
  tourNext.classList.add("hidden");
  tourSkip.classList.add("hidden");
}

function tryLoadHash() {
  const raw = location.hash;
  if (!raw || !raw.startsWith("#rle=")) return false;
  try {
    const text = decodeURIComponent(raw.slice(5));
    live.clear();
    const parsed = parseRle(text);
    setLiveFromCells(normalize(parsed.cells), true);
    fitCells(cellsFromLive(), 12);
    return true;
  } catch {
    return false;
  }
}

playBtn.addEventListener("click", () => setRunning(!running));
stepBtn.addEventListener("click", () => {
  setRunning(false);
  stepLife();
});
clearBtn.addEventListener("click", () => {
  setRunning(false);
  live.clear();
  generation = 0;
  lastBirths = new Set();
  lastDeaths = new Set();
  updateStats();
});
randomBtn.addEventListener("click", () => {
  live.clear();
  const cx = Math.round(view.x + cssW / view.scale / 2);
  const cy = Math.round(view.y + cssH / view.scale / 2);
  for (let y = cy - 16; y < cy + 16; y++) {
    for (let x = cx - 24; x < cx + 24; x++) {
      if (Math.random() < 0.28) live.add(key(x, y));
    }
  }
  generation = 0;
  lastBirths = new Set();
  lastDeaths = new Set();
  updateStats();
});
fitBtn.addEventListener("click", () => fitCells(cellsFromLive(), 8));
toolPaint.addEventListener("click", () => {
  stamp = null;
  syncPatternButtons();
  setPanMode(false);
  toolPaint.setAttribute("aria-pressed", "true");
  updateHint();
});
toolPan.addEventListener("click", () => setPanMode(!panMode));
speedInput.addEventListener("input", () => {
  gensPerSec = Number(speedInput.value);
  speedValue.textContent = String(gensPerSec);
});

rleBtn.addEventListener("click", () => {
  rleText.value = encodeRle(cellsFromLive());
  rleStatus.textContent = "";
  rleDialog.showModal();
});
document.getElementById("rleLoad").addEventListener("click", () => {
  try {
    loadRleOntoBoard(rleText.value, { replace: true, fit: true, pad: 10 });
    rleStatus.textContent = `Loaded ${live.size} live cells.`;
  } catch (err) {
    rleStatus.textContent = err.message || "Could not parse RLE.";
  }
});
document.getElementById("rleCopy").addEventListener("click", async () => {
  rleText.value = encodeRle(cellsFromLive());
  try {
    await navigator.clipboard.writeText(rleText.value);
    rleStatus.textContent = "Copied RLE.";
  } catch {
    rleText.select();
    rleStatus.textContent = "Select and copy the text.";
  }
});
document.getElementById("rleClose").addEventListener("click", () => rleDialog.close());

shareBtn.addEventListener("click", async () => {
  const rle = encodeRle(cellsFromLive());
  const url = `${location.origin}${location.pathname}#rle=${encodeURIComponent(rle)}`;
  try {
    await navigator.clipboard.writeText(url);
    hintEl.textContent = "Share URL copied.";
  } catch {
    hintEl.textContent = url;
  }
});

tourStart.addEventListener("click", () => applyTourStep(0));
tourBack.addEventListener("click", () => {
  if (tourIndex > 0) applyTourStep(tourIndex - 1);
});
tourNext.addEventListener("click", () => {
  if (tourIndex < TOUR.length - 1) applyTourStep(tourIndex + 1);
  else closeTour();
});
tourSkip.addEventListener("click", closeTour);

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    zoomAt(event, event.deltaY < 0 ? 1.12 : 1 / 1.12);
  },
  { passive: false }
);

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  const cell = cellFromEvent(event);
  hover = cell;
  const wantPan = panMode || event.button === 1 || event.button === 2 || event.altKey;
  if (wantPan) {
    panning = true;
    lastPan = { x: event.clientX, y: event.clientY };
    return;
  }
  if (stamp && event.button === 0) {
    stampAt(cell);
    return;
  }
  if (event.button === 0) {
    painting = true;
    paintAlive = !event.shiftKey;
    paintCell(cell);
  }
});

canvas.addEventListener("pointermove", (event) => {
  const cell = cellFromEvent(event);
  hover = cell;
  if (panning && lastPan) {
    const dx = event.clientX - lastPan.x;
    const dy = event.clientY - lastPan.y;
    view.x -= dx / view.scale;
    view.y -= dy / view.scale;
    lastPan = { x: event.clientX, y: event.clientY };
    return;
  }
  if (painting) paintCell(cell);
});

function endPointer() {
  painting = false;
  panning = false;
  lastPan = null;
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerleave", () => {
  if (!painting && !panning) hover = null;
});

window.addEventListener("keydown", (event) => {
  const typing =
    event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
  if (typing) return;
  if (event.code === "Space") {
    event.preventDefault();
    setRunning(!running);
  } else if (event.key === "." || event.key === "ArrowRight") {
    event.preventDefault();
    setRunning(false);
    stepLife();
  } else if (event.key === "Escape") {
    stamp = null;
    syncPatternButtons();
    toolPaint.setAttribute("aria-pressed", panMode ? "false" : "true");
    updateHint();
  } else if ((event.key === "r" || event.key === "R") && stamp) {
    stamp.cells = rotateCw(stamp.cells);
  } else if ((event.key === "f" || event.key === "F") && stamp) {
    stamp.cells = flipH(stamp.cells);
  }
});

window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(canvas);

renderLibrary();
resize();
if (!tryLoadHash()) updateStats();
updateHint();
requestAnimationFrame(loop);
