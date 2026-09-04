function sizeCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height, dpr };
}

function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

function isoPoint(x, y, z, tw, th) {
  return {
    x: (x - y) * (tw / 2),
    y: (x + y) * (th / 2) - z * th,
  };
}

function drawCube(ctx, ox, oy, x, y, z, tw, th) {
  const p = (ix, iy, iz) => {
    const q = isoPoint(ix, iy, iz, tw, th);
    return { x: ox + q.x, y: oy + q.y };
  };
  const t0 = p(x, y, z + 1);
  const t1 = p(x + 1, y, z + 1);
  const t2 = p(x + 1, y + 1, z + 1);
  const t3 = p(x, y + 1, z + 1);
  const b1 = p(x + 1, y, z);
  const b2 = p(x + 1, y + 1, z);
  const b3 = p(x, y + 1, z);

  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1;

  ctx.fillStyle = "#bdbdbd";
  ctx.beginPath();
  ctx.moveTo(t1.x, t1.y);
  ctx.lineTo(t2.x, t2.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.lineTo(b1.x, b1.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#7a7a7a";
  ctx.beginPath();
  ctx.moveTo(t3.x, t3.y);
  ctx.lineTo(t2.x, t2.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.lineTo(b3.x, b3.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f4f4f4";
  ctx.beginPath();
  ctx.moveTo(t0.x, t0.y);
  ctx.lineTo(t1.x, t1.y);
  ctx.lineTo(t2.x, t2.y);
  ctx.lineTo(t3.x, t3.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawIso(ctx, width, height, scene) {
  const voxels = scene.voxels || [];
  if (!voxels.length) return;
  const tw = Math.min(44, Math.max(22, Math.floor(Math.min(width, height) / 9)));
  const th = Math.round(tw * 0.5);
  const sorted = voxels.slice().sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of sorted) {
    const corners = [
      isoPoint(v.x, v.y, v.z, tw, th),
      isoPoint(v.x + 1, v.y, v.z, tw, th),
      isoPoint(v.x, v.y + 1, v.z, tw, th),
      isoPoint(v.x + 1, v.y + 1, v.z, tw, th),
      isoPoint(v.x, v.y, v.z + 1, tw, th),
      isoPoint(v.x + 1, v.y, v.z + 1, tw, th),
      isoPoint(v.x, v.y + 1, v.z + 1, tw, th),
      isoPoint(v.x + 1, v.y + 1, v.z + 1, tw, th),
    ];
    for (const c of corners) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
  }
  const ox = width / 2 - (minX + maxX) / 2;
  const oy = height / 2 - (minY + maxY) / 2;
  for (const v of sorted) drawCube(ctx, ox, oy, v.x, v.y, v.z, tw, th);
}

function drawFlash(ctx, width, height, scene) {
  ctx.fillStyle = "#f4f1ea";
  for (const dot of scene.dots || []) {
    ctx.beginPath();
    ctx.arc(dot.x * width, dot.y * height, (dot.r || 0.03) * Math.min(width, height), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrid(ctx, width, height, scene) {
  const cols = scene.cols || 3;
  const rows = scene.rows || 3;
  const lit = new Set(scene.lit || []);
  const gap = Math.max(10, Math.min(width, height) * 0.035);
  const pad = Math.max(8, Math.min(width, height) * 0.04);
  const maxW = (width - pad * 2 - gap * (cols - 1)) / cols;
  const maxH = (height - pad * 2 - gap * (rows - 1)) / rows;
  const cell = Math.min(maxW, maxH);
  const gridW = cols * cell + (cols - 1) * gap;
  const gridH = rows * cell + (rows - 1) * gap;
  const ox = (width - gridW) / 2;
  const oy = (height - gridH) / 2;
  const radius = Math.min(14, cell * 0.18);
  for (let i = 0; i < cols * rows; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = ox + c * (cell + gap);
    const y = oy + r * (cell + gap);
    ctx.fillStyle = lit.has(i) ? "#f4f1ea" : "rgba(244, 241, 234, 0.12)";
    ctx.strokeStyle = lit.has(i) ? "#ffffff" : "rgba(244, 241, 234, 0.35)";
    ctx.lineWidth = Math.max(2, cell * 0.04);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, cell, cell, radius);
    else ctx.rect(x, y, cell, cell);
    ctx.fill();
    ctx.stroke();
  }
}

function drawShapes(ctx, width, height, scene) {
  for (const item of scene.items || []) {
    const x = item.x * width;
    const y = item.y * height;
    const s = (item.s || 0.05) * Math.min(width, height);
    ctx.fillStyle = "#f4f1ea";
    if (item.kind === "square") {
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCrossing(ctx, width, height, scene, elapsed) {
  const lanes = scene.lanes || 4;
  const laneH = height / (lanes + 1);
  ctx.strokeStyle = "rgba(244, 241, 234, 0.12)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= lanes; i++) {
    const y = laneH * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  const size = Math.min(28, height * 0.08);
  const colors = ["#f4f1ea", "#f0c75e", "#7dd3fc"];
  for (const item of scene.items || []) {
    const t = (elapsed - item.delay) / item.duration;
    if (t < 0 || t > 1) continue;
    const x = -size + t * (width + size * 2);
    const y = laneH * (item.lane + 1);
    ctx.fillStyle = colors[item.kind % colors.length];
    ctx.beginPath();
    if (item.kind % 3 === 1) {
      ctx.moveTo(x, y - size * 0.55);
      ctx.lineTo(x + size * 0.55, y);
      ctx.lineTo(x, y + size * 0.55);
      ctx.lineTo(x - size * 0.55, y);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind % 3 === 2) {
      ctx.fillRect(x - size * 0.45, y - size * 0.45, size * 0.9, size * 0.9);
    } else {
      ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRain(ctx, width, height, scene, elapsed) {
  const w = Math.min(10, width * 0.018);
  const h = w * 2.4;
  ctx.fillStyle = "#9ecfff";
  for (const item of scene.items || []) {
    const t = (elapsed - item.delay) / item.duration;
    if (t < 0 || t > 1) continue;
    const x = item.x * width;
    const y = -h + t * (height + h * 2);
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paint(canvas, scene, elapsed) {
  const { ctx, width, height } = sizeCanvas(canvas);
  clear(ctx, width, height);
  if (!scene) return;
  if (scene.type === "iso") drawIso(ctx, width, height, scene);
  else if (scene.type === "flash") drawFlash(ctx, width, height, scene);
  else if (scene.type === "grid") drawGrid(ctx, width, height, scene);
  else if (scene.type === "shapes") drawShapes(ctx, width, height, scene);
  else if (scene.type === "crossing") drawCrossing(ctx, width, height, scene, elapsed);
  else if (scene.type === "rain") drawRain(ctx, width, height, scene, elapsed);
}

export function createStage(canvas) {
  let raf = 0;
  let startAt = 0;
  let scene = null;
  let roundId = "";
  let running = false;

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function blank() {
    stop();
    scene = null;
    const { ctx, width, height } = sizeCanvas(canvas);
    clear(ctx, width, height);
  }

  function tick(now) {
    if (!running) return;
    paint(canvas, scene, now - startAt);
    raf = requestAnimationFrame(tick);
  }

  function sync(state) {
    if (!state || state.phase !== "watch" || !state.scene) {
      if (roundId && state?.roundId !== roundId) roundId = "";
      if (state?.phase !== "watch") {
        roundId = state?.roundId ? `${state.roundId}:off` : "";
        blank();
      }
      return;
    }
    if (roundId === state.roundId && running) return;
    if (roundId === state.roundId && !running && ["iso", "flash", "grid", "shapes"].includes(state.scene.type)) {
      paint(canvas, state.scene, 0);
      return;
    }
    stop();
    roundId = state.roundId;
    scene = state.scene;
    startAt = performance.now();
    running = true;
    paint(canvas, scene, 0);
    if (scene.type === "crossing" || scene.type === "rain") {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
      requestAnimationFrame(() => {
        if (scene) paint(canvas, scene, 0);
      });
    }
  }

  window.addEventListener("resize", () => {
    if (!scene) return;
    if (roundId && !String(roundId).endsWith(":off")) {
      paint(canvas, scene, running ? performance.now() - startAt : 0);
    }
  });

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      if (!scene) return;
      if (roundId && !String(roundId).endsWith(":off")) {
        paint(canvas, scene, running ? performance.now() - startAt : 0);
      }
    }).observe(canvas);
  }

  return { sync, blank };
}
