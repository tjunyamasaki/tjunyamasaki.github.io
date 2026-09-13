import { SCENES } from './algorithms.js';

const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const spectrum = (value, count, light = 68, alpha = 1) => `hsla(${18 + value / count * 267},68%,${light}%,${alpha})`;

function rounded(ctx, x, y, width, height, radius) {
  radius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius); ctx.closePath();
}

function circle(ctx, x, y, radius, fill) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, radius), 0, TAU); ctx.fillStyle = fill; ctx.fill();
}

export class Renderer {
  constructor(canvas, reducedMotion) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas is unavailable in this browser.');
    this.reducedMotion = reducedMotion; this.width = 1; this.height = 1;
    this.particles = []; this.rings = []; this.time = 0; this.model = null;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background = null; this.terrain = null; this.particles = []; this.rings = [];
    this.dirty = true;
    this.canvas.parentElement.classList.toggle('is-compact', this.height < 320);
  }

  bounds() {
    const wide = this.width >= 700, compact = this.height < 320, side = wide ? 48 : 21;
    const top = compact ? 82 : wide ? 132 : 120, bottom = compact ? 53 : wide ? 86 : 94;
    return { x: side, y: top, w: Math.max(30, this.width - side * 2), h: Math.max(50, this.height - top - bottom) };
  }

  get aspect() { const b = this.bounds(); return b.w / Math.max(50, b.h - 20); }

  attach(model) {
    this.model = model; this.particles = []; this.rings = []; this.background = null; this.terrain = null;
    this.heights = model.values?.map(v => this.reducedMotion ? v : v * 0.3) ?? [];
    this.nodeLevels = new Float32Array(model.nodes?.length ?? 0);
    this.edgeLevels = new Float32Array(model.edges?.length ?? 0);
    this.cellLevels = new Float32Array(model.cells?.length ?? 0);
    this.lastEvent = null;
  }

  makeBackground() {
    const layer = document.createElement('canvas'); layer.width = this.canvas.width; layer.height = this.canvas.height;
    const ctx = layer.getContext('2d'); ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = '#101919'; ctx.fillRect(0, 0, this.width, this.height);
    const b = this.bounds(), tint = { sorting: '#b88d5620', graphs: '#568b8025', mazes: '#79925122', routes: '#486d7b28' }[this.model.scene];
    const glow = ctx.createRadialGradient(this.width * 0.5, b.y + b.h * 0.65, 5, this.width * 0.5, b.y + b.h * 0.5, Math.max(this.width * 0.58, b.h));
    glow.addColorStop(0, tint); glow.addColorStop(1, '#10191900'); ctx.fillStyle = glow; ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#94b29a15';
    for (let x = 17; x < this.width; x += 25) for (let y = 14; y < this.height; y += 25) ctx.fillRect(x, y, 1, 1);
    ctx.strokeStyle = '#94b29a21'; ctx.lineWidth = 1;
    for (const x of [b.x - 6, b.x + b.w + 6]) for (const y of [b.y - 3, b.y + b.h + 8]) {
      ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
    }
    this.background = layer;
  }

  gridLayout(model = this.model) {
    const b = this.bounds(), h = b.h - (model.scene === 'routes' ? 17 : 0);
    const size = Math.min(b.w / model.cols, h / model.rows);
    return { x: b.x + (b.w - size * model.cols) / 2, y: b.y + (h - size * model.rows) / 2, size, w: size * model.cols, h: size * model.rows };
  }

  cellPoint(index, model = this.model) {
    const grid = this.gridLayout(model);
    return { x: grid.x + (index % model.cols + 0.5) * grid.size, y: grid.y + (Math.floor(index / model.cols) + 0.5) * grid.size };
  }

  nodePoint(index) {
    const b = this.bounds(), node = this.model.nodes[index], drift = this.reducedMotion ? 0 : 1;
    return { x: b.x + node.x * b.w + Math.sin(this.time * 0.00038 + index * 1.7) * 2.2 * drift, y: b.y + node.y * (b.h - 28) + Math.cos(this.time * 0.0003 + index * 2.1) * 2.2 * drift };
  }

  sortPoint(index) {
    const b = this.bounds(), n = this.model.values.length, value = this.heights[index] ?? this.model.values[index];
    return { x: b.x + (index + 0.5) / n * b.w, y: b.y + b.h * 0.87 - (0.055 + value / n * 0.78) * b.h };
  }

  step(event) {
    this.lastEvent = event;
    if (this.reducedMotion || event.at < 0) return;
    const model = this.model, point = model.scene === 'sorting' ? this.sortPoint(event.at) : model.scene === 'graphs' ? this.nodePoint(event.at) : this.cellPoint(event.at);
    const color = event.type === 'path' || event.type === 'settle' ? '#ffdaa0' : SCENES[model.scene].color;
    if (['visit', 'connect', 'phase', 'path'].includes(event.type) && this.rings.length < 18) this.rings.push({ ...point, life: 1, color });
    if (['compare', 'backtrack', 'search', 'reject'].includes(event.type)) return;
    const count = model.scene === 'sorting' ? 3 : 2;
    for (let i = 0; i < count && this.particles.length < 110; i++) {
      const angle = Math.random() * TAU, velocity = 7 + Math.random() * 19;
      this.particles.push({ ...point, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity - 10, life: 1, color, size: 0.7 + Math.random() });
    }
  }

  draw(dt, time) {
    if (!this.model) return;
    this.time = time;
    if (!this.background) this.makeBackground();
    const ctx = this.ctx;
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.setLineDash([]);
    ctx.drawImage(this.background, 0, 0, this.width, this.height);
    const ease = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 0.018);
    if (this.model.scene === 'sorting') this.drawSorting(ease);
    if (this.model.scene === 'graphs') this.drawGraph(ease);
    if (this.model.scene === 'mazes') this.drawMaze(ease);
    if (this.model.scene === 'routes') this.drawRoute(ease);
    this.drawParticles(dt);
  }

  drawSorting(ease) {
    const ctx = this.ctx, model = this.model, b = this.bounds(), n = model.values.length;
    const slot = b.w / n, width = Math.max(1.5, slot * 0.7), baseline = b.y + b.h * 0.87;
    ctx.strokeStyle = '#b3c5a815'; ctx.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) {
      const y = baseline - i * b.h * 0.25;
      ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); ctx.stroke();
    }
    if (model.range) {
      const left = b.x + model.range[0] * slot, width = (model.range[1] - model.range[0] + 1) * slot;
      ctx.fillStyle = '#e5e5ba07'; rounded(ctx, left - 2, b.y - 4, width + 4, b.h * 0.87 + 12, 4); ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      this.heights[i] = mix(this.heights[i], model.values[i], ease);
      const point = this.sortPoint(i), height = Math.max(2, baseline - point.y), hot = model.hot.includes(i), settled = model.settled.has(i);
      const gradient = ctx.createLinearGradient(0, point.y, 0, baseline);
      gradient.addColorStop(0, spectrum(this.heights[i], n, hot ? 86 : settled ? 75 : 66));
      gradient.addColorStop(1, spectrum(this.heights[i], n, hot ? 53 : 35, 0.8));
      ctx.fillStyle = gradient;
      if (hot && !this.reducedMotion) { ctx.shadowBlur = 13; ctx.shadowColor = spectrum(this.heights[i], n, 70, 0.5); }
      rounded(ctx, point.x - width / 2, point.y, width, height, Math.min(3, width / 2)); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = spectrum(this.heights[i], n, hot ? 95 : 83, 0.9); ctx.fillRect(point.x - width / 2, point.y, width, 1.3);
      const reflection = ctx.createLinearGradient(0, baseline + 3, 0, baseline + Math.min(22, height * 0.16));
      reflection.addColorStop(0, spectrum(this.heights[i], n, 60, 0.14)); reflection.addColorStop(1, spectrum(this.heights[i], n, 60, 0));
      ctx.fillStyle = reflection; ctx.fillRect(point.x - width / 2, baseline + 3, width, Math.min(22, height * 0.16));
      if (hot && width > 4) {
        ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#eee6ce'; ctx.fillText(model.values[i], point.x, point.y - 7);
      }
      if (model.values[i] === model.pivot) {
        circle(ctx, point.x, baseline + 8, 2, '#ffe4b2');
      }
    }
    // The crest of the array makes exchanges readable even at narrow phone widths.
    ctx.strokeStyle = '#f4dfbf25'; ctx.lineWidth = 0.7; ctx.beginPath();
    for (let i = 0; i < n; i++) { const p = this.sortPoint(i); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    ctx.stroke();
    if (model.hot.length === 2 && model.hot[0] !== model.hot[1]) {
      const a = this.sortPoint(model.hot[0]), c = this.sortPoint(model.hot[1]);
      const control = { x: (a.x + c.x) / 2, y: Math.max(b.y - 8, Math.min(a.y, c.y) - Math.min(35, Math.abs(a.x - c.x) * 0.2 + 9)) };
      ctx.strokeStyle = '#ffdbac4d'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(a.x, a.y - 4); ctx.quadraticCurveTo(control.x, control.y, c.x, c.y - 4); ctx.stroke();
      if (!this.reducedMotion) {
        const t = (this.time * 0.0017) % 1;
        circle(ctx, (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t * t * c.x, (1 - t) ** 2 * (a.y - 4) + 2 * (1 - t) * t * control.y + t * t * (c.y - 4), 1.7, '#ffeac9');
      }
    }
    if (model.buffer.length) {
      const y = baseline + 24, unit = Math.min(5, (b.w - 44) / model.buffer.length);
      ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#809084'; ctx.fillText('BUFFER', b.x, y + 3);
      model.buffer.forEach((value, i) => {
        const active = model.bufferHot?.includes(i);
        ctx.fillStyle = active ? '#fff0d3' : spectrum(value, n, 65, 0.65);
        ctx.fillRect(b.x + 38 + i * unit, y - (active ? 5 : 3), Math.max(1, unit - 1), active ? 10 : 6);
      });
    }
  }

  drawGraph(ease) {
    const ctx = this.ctx, model = this.model, b = this.bounds(), points = model.nodes.map((_, i) => this.nodePoint(i));
    for (const edge of model.edges) {
      const a = points[edge.a], z = points[edge.b], selected = model.treeEdges.has(edge.id), active = edge.id === model.activeEdge;
      this.edgeLevels[edge.id] = mix(this.edgeLevels[edge.id], selected ? 1 : 0, this.reducedMotion ? 1 : ease * 0.65);
      ctx.strokeStyle = '#58776d42'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke();
      const amount = this.edgeLevels[edge.id];
      if (amount > 0.01) {
        const reverse = model.edgeFrom?.get(edge.id) === edge.b, start = reverse ? z : a, end = reverse ? a : z;
        const gradient = ctx.createLinearGradient(start.x, start.y, end.x + 0.01, end.y);
        gradient.addColorStop(0, '#8cd6bc'); gradient.addColorStop(1, '#b6bce4');
        ctx.strokeStyle = gradient; ctx.globalAlpha = 0.45 + amount * 0.35; ctx.lineWidth = active ? 2 : 1.3;
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(mix(start.x, end.x, amount), mix(start.y, end.y, amount)); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (edge.id === model.rejectedEdge) {
        ctx.strokeStyle = '#e4a296'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (model.isMst && (this.width > 650 || selected || active)) {
        const x = (a.x + z.x) / 2, y = (a.y + z.y) / 2;
        ctx.fillStyle = '#15211f'; ctx.fillRect(x - 7, y - 5, 14, 10); ctx.fillStyle = selected ? '#b4d7bc' : '#647e70';
        ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText(edge.weight, x, y + 2.5);
      }
    }
    const frontier = new Set(model.frontier);
    for (let i = 0; i < points.length; i++) {
      const p = points[i], visited = model.visited.has(i), waiting = frontier.has(i), active = model.activeNode === i;
      const target = visited ? 1 : waiting ? 0.45 : 0;
      this.nodeLevels[i] = mix(this.nodeLevels[i], target, ease);
      const level = this.nodeLevels[i], baseRadius = clamp(b.w / 140, 3, 4.6), radius = baseRadius + level * 1.8 + (active ? 0.8 : 0);
      const hue = 145 + Math.min(model.depth[i], 20) * 4.8;
      if (level > 0.1) circle(ctx, p.x, p.y, radius * 2.8, `hsla(${hue},55%,65%,${level * 0.07})`);
      if (active && !this.reducedMotion) { ctx.shadowBlur = 17; ctx.shadowColor = '#a6e8c8'; }
      circle(ctx, p.x, p.y, radius, visited ? `hsl(${hue},48%,${58 + level * 20}%)` : waiting ? '#83b8b9' : '#34574b');
      ctx.shadowBlur = 0;
      circle(ctx, p.x - 0.7, p.y - 0.7, radius * 0.3, visited ? '#f2f3d8' : '#789889');
      if (i === model.origin && model.id !== 'kruskal') {
        ctx.strokeStyle = '#c5dfc5aa'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, radius + 4, 0, TAU); ctx.stroke();
      }
      if (visited || waiting || i === model.origin) {
        ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = active ? '#f3eacd' : '#8ca99b';
        ctx.fillText(String(i + 1).padStart(2, '0'), p.x, p.y + radius + 11);
      }
    }
    const y = b.y + b.h - 4;
    ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#688374';
    if (model.isMst) {
      ctx.fillText(`${model.treeEdges.size} / ${model.nodes.length - 1} TREE EDGES`, b.x, y + 3);
      ctx.textAlign = 'right'; ctx.fillText('EDGE LABELS = WEIGHTS', b.x + b.w, y + 3);
    } else {
      const label = model.id === 'dfs' ? 'STACK' : 'QUEUE', max = Math.max(1, Math.floor((b.w - 92) / 19));
      ctx.fillText(label, b.x, y + 3);
      const nodes = model.id === 'dfs' ? model.frontier.slice(-max) : model.frontier.slice(0, max);
      for (let i = 0; i < nodes.length; i++) {
        const x = b.x + 40 + i * 19;
        ctx.fillStyle = '#a5d5bc12'; rounded(ctx, x, y - 7, 15, 14, 3); ctx.fill();
        ctx.fillStyle = '#a4c8b4'; ctx.textAlign = 'center'; ctx.fillText(String(nodes[i] + 1).padStart(2, '0'), x + 7.5, y + 3);
      }
      if (model.frontier.length > max) { ctx.textAlign = 'left'; ctx.fillStyle = '#789f8b'; ctx.fillText(`+${model.frontier.length - max}`, b.x + 42 + max * 19, y + 3); }
      if (!nodes.length && model.done) { ctx.fillStyle = '#a4c8b4'; ctx.fillText('EMPTY · EXPLORATION COMPLETE', b.x + 40, y + 3); }
    }
  }

  drawMaze(ease) {
    const ctx = this.ctx, model = this.model, grid = this.gridLayout(), path = new Set(model.path), walk = new Set(model.walk);
    const { x: gx, y: gy, size } = grid;
    for (let i = 0; i < model.cells.length; i++) {
      const x = gx + (i % model.cols) * size, y = gy + Math.floor(i / model.cols) * size;
      const target = path.has(i) ? 1 : model.searchVisited.has(i) ? 0.7 : walk.has(i) ? 0.55 : model.cells[i].carved ? 0.3 : 0;
      this.cellLevels[i] = mix(this.cellLevels[i], target, ease);
      const light = this.cellLevels[i];
      ctx.fillStyle = path.has(i) ? `rgba(179,154,92,${0.13 + light * 0.22})` : model.searchVisited.has(i) ? `rgba(86,141,151,${0.1 + light * 0.38})` : `rgb(${18 + light * 50},${34 + light * 72},${31 + light * 50})`;
      ctx.fillRect(x, y, size + 0.5, size + 0.5);
      if (model.cells[i].carved && size > 7) { ctx.fillStyle = '#bbd4aa15'; ctx.fillRect(x + size / 2 - 0.5, y + size / 2 - 0.5, 1, 1); }
    }
    ctx.strokeStyle = '#708b684f'; ctx.lineWidth = clamp(size * 0.075, 0.6, 1.2); ctx.beginPath();
    for (let i = 0; i < model.cells.length; i++) {
      const x = gx + (i % model.cols) * size, y = gy + Math.floor(i / model.cols) * size, walls = model.cells[i].walls;
      if (walls[0]) { ctx.moveTo(x, y); ctx.lineTo(x + size, y); }
      if (walls[3]) { ctx.moveTo(x, y); ctx.lineTo(x, y + size); }
      if (i % model.cols === model.cols - 1 && walls[1]) { ctx.moveTo(x + size, y); ctx.lineTo(x + size, y + size); }
      if (Math.floor(i / model.cols) === model.rows - 1 && walls[2]) { ctx.moveTo(x, y + size); ctx.lineTo(x + size, y + size); }
    }
    ctx.stroke();
    if (model.walk.length > 1 && model.phase === 'carving') this.drawPath(model.walk, '#b7d9a277', Math.max(1, size * 0.12), false);
    if (model.path.length) this.drawPath(model.path, '#ffd69a', Math.max(1.5, size * 0.2), true);
    if (model.activeCell >= 0 && !model.done && model.phase !== 'path') {
      const p = this.cellPoint(model.activeCell);
      ctx.shadowBlur = this.reducedMotion ? 0 : 13; ctx.shadowColor = '#c7e3a9'; circle(ctx, p.x, p.y, Math.max(1.7, size * 0.26), '#def3bd'); ctx.shadowBlur = 0;
    }
    const start = this.cellPoint(0), goal = this.cellPoint(model.cells.length - 1);
    circle(ctx, start.x, start.y, Math.max(2, size * 0.22), '#b2e6d2');
    ctx.strokeStyle = '#f6d3a0'; ctx.lineWidth = 1.4; const r = Math.max(2, size * 0.22);
    ctx.strokeRect(goal.x - r, goal.y - r, r * 2, r * 2);
  }

  makeTerrain() {
    const layer = document.createElement('canvas'); layer.width = this.canvas.width; layer.height = this.canvas.height;
    const ctx = layer.getContext('2d'); ctx.scale(this.dpr, this.dpr);
    const model = this.model, grid = this.gridLayout(), { size } = grid;
    for (let i = 0; i < model.cells.length; i++) {
      const cell = model.cells[i], x = grid.x + i % model.cols * size, y = grid.y + Math.floor(i / model.cols) * size;
      const h = cell.height;
      ctx.fillStyle = cell.water ? `hsl(${191 + h * 8},${28 + h * 16}%,${11 + Math.max(0, h) * 15}%)` : cell.cost === 1 ? `hsl(74,20%,${29 + h * 18}%)` : cell.cost === 3 ? `hsl(${132 - h * 20},21%,${22 + h * 18}%)` : `hsl(88,13%,${29 + h * 27}%)`;
      ctx.fillRect(x, y, size + 0.3, size + 0.3);
      if (!cell.water) {
        ctx.fillStyle = '#d4dfb912'; ctx.fillRect(x + 0.7, y + 0.7, Math.max(1, size - 1.4), 0.6);
        ctx.fillStyle = '#081d1820'; ctx.fillRect(x, y + size - 0.5, size, 0.5);
        // Contour boundaries follow actual elevation bands, rather than decoration.
        if (i % model.cols < model.cols - 1 && Math.floor(h * 12) !== Math.floor(model.cells[i + 1].height * 12)) {
          ctx.strokeStyle = '#c7d5ae26'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x + size, y); ctx.lineTo(x + size, y + size); ctx.stroke();
        }
        if (i + model.cols < model.cells.length && Math.floor(h * 12) !== Math.floor(model.cells[i + model.cols].height * 12)) {
          ctx.strokeStyle = '#c7d5ae26'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y + size); ctx.lineTo(x + size, y + size); ctx.stroke();
        }
        if (cell.cost === 3 && size >= 7 && i % 3 === 0) {
          ctx.fillStyle = '#c4d1ad23'; ctx.beginPath(); ctx.moveTo(x + size * 0.5, y + size * 0.27); ctx.lineTo(x + size * 0.7, y + size * 0.65); ctx.lineTo(x + size * 0.3, y + size * 0.65); ctx.fill();
        }
      } else if (i % 11 === 0) {
        ctx.strokeStyle = '#92c5cf20'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + size * 0.2, y + size * 0.5); ctx.quadraticCurveTo(x + size * 0.5, y + size * 0.7, x + size * 0.8, y + size * 0.45); ctx.stroke();
      }
    }
    this.terrain = layer;
  }

  drawRoute(ease) {
    const ctx = this.ctx, model = this.model, grid = this.gridLayout(), { size } = grid;
    if (!this.terrain) this.makeTerrain();
    ctx.drawImage(this.terrain, 0, 0, this.width, this.height);
    for (let i = 0; i < model.cells.length; i++) {
      if (model.cells[i].water) continue;
      const visited = model.closed.has(i), waiting = model.open.has(i);
      this.cellLevels[i] = mix(this.cellLevels[i], visited ? 1 : waiting ? 0.5 : 0, ease);
      if (this.cellLevels[i] < 0.01) continue;
      const x = grid.x + i % model.cols * size, y = grid.y + Math.floor(i / model.cols) * size;
      ctx.fillStyle = visited ? `rgba(161,157,232,${this.cellLevels[i] * 0.39})` : `rgba(142,226,220,${this.cellLevels[i] * 0.8})`;
      ctx.fillRect(x + 0.6, y + 0.6, Math.max(1, size - 1.2), Math.max(1, size - 1.2));
      if (waiting) { ctx.strokeStyle = '#b5eddf66'; ctx.lineWidth = 0.65; ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1); }
    }
    if (model.path.length) this.drawPath(model.path, '#ffe0a3', Math.max(1.8, size * 0.25), true);
    if (model.activeCell >= 0 && model.phase !== 'path' && !model.done) {
      const p = this.cellPoint(model.activeCell); circle(ctx, p.x, p.y, Math.max(2, size * 0.35), '#e2dfff');
    }
    if (model.origin !== model.target) this.mapMarker(model.origin, 'START', '#b5e8ce', false);
    this.mapMarker(model.target, model.noPath ? 'NO ROUTE' : model.origin === model.target ? 'START / GOAL' : 'GOAL', '#ffcf9b', true);
    const y = grid.y + grid.h + 12;
    ctx.font = '7px monospace'; ctx.textAlign = 'left';
    const legends = [['#768957', 'SAND 1'], ['#4c6b49', 'FOREST 3'], ['#8b9979', 'HIGH 6']];
    let x = grid.x;
    for (const [color, text] of legends) {
      ctx.fillStyle = color; ctx.fillRect(x, y - 5, 5, 5); ctx.fillStyle = '#8ca18e'; ctx.fillText(text, x + 9, y); x += 66;
    }
  }

  mapMarker(index, label, color, diamond) {
    const ctx = this.ctx, p = this.cellPoint(index), grid = this.gridLayout(), radius = clamp(grid.size * 0.43, 3.5, 6.5);
    const pulse = this.reducedMotion ? 0 : (Math.sin(this.time * 0.003) + 1) * 2;
    circle(ctx, p.x, p.y, radius + 5 + (diamond ? pulse : 0), color + '18');
    ctx.shadowBlur = this.reducedMotion ? 0 : 12; ctx.shadowColor = color;
    if (diamond) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4); ctx.fillStyle = color; ctx.fillRect(-radius * 0.75, -radius * 0.75, radius * 1.5, radius * 1.5); ctx.restore(); }
    else circle(ctx, p.x, p.y, radius, color);
    ctx.shadowBlur = 0; circle(ctx, p.x, p.y, radius * 0.3, '#1b2a23');
    const labelY = p.y < grid.y + 20 ? p.y + 20 : p.y - 13;
    ctx.font = '7px monospace'; ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 8, x = clamp(p.x, grid.x + w / 2, grid.x + grid.w - w / 2);
    ctx.fillStyle = '#142320e8'; rounded(ctx, x - w / 2, labelY - 7, w, 11, 3); ctx.fill(); ctx.fillStyle = color; ctx.fillText(label, x, labelY + 1);
  }

  drawPath(path, color, width, glow) {
    if (path.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (glow && !this.reducedMotion) { ctx.shadowColor = '#ffcc81'; ctx.shadowBlur = 9; }
    ctx.beginPath();
    path.forEach((index, i) => { const p = this.cellPoint(index); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke(); ctx.shadowBlur = 0;
    if (glow) {
      const progress = this.model.done && !this.reducedMotion ? (this.time * 0.006) % (path.length - 1) : path.length - 1;
      const a = this.cellPoint(path[Math.floor(progress)]), b = this.cellPoint(path[Math.min(path.length - 1, Math.ceil(progress))]);
      const t = progress % 1, x = mix(a.x, b.x, t), y = mix(a.y, b.y, t);
      circle(ctx, x, y, width * 2.5, '#ffdb9f20'); circle(ctx, x, y, width * 0.8, '#fff4d1');
    }
  }

  drawParticles(dt) {
    const ctx = this.ctx, seconds = Math.min(dt, 50) / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= seconds * 1.7;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * seconds; p.y += p.vy * seconds;
      ctx.globalAlpha = p.life * 0.6; circle(ctx, p.x, p.y, p.size * p.life, p.color);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]; ring.life -= seconds * 1.7;
      if (ring.life <= 0) { this.rings.splice(i, 1); continue; }
      ctx.strokeStyle = ring.color; ctx.lineWidth = 0.6; ctx.globalAlpha = ring.life * 0.3;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, 3 + (1 - ring.life) * 17, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  hit(x, y) {
    const model = this.model, b = this.bounds();
    if (model.scene === 'graphs') {
      let nearest = -1, best = 29;
      model.nodes.forEach((_, i) => { const p = this.nodePoint(i), d = Math.hypot(x - p.x, y - p.y); if (d < best) { best = d; nearest = i; } });
      return nearest;
    }
    if (model.scene === 'sorting') return x >= b.x && x <= b.x + b.w && y >= b.y - 10 && y <= b.y + b.h + 10 ? 0 : -1;
    const grid = this.gridLayout(), col = Math.floor((x - grid.x) / grid.size), row = Math.floor((y - grid.y) / grid.size);
    return col >= 0 && col < model.cols && row >= 0 && row < model.rows ? row * model.cols + col : -1;
  }
}
