import { DRUMS, INSTRUMENTS } from './audio.js';
import { STEPS_PER_BAR } from './engine.js';

export const HI = 96;
export const LO = 24;
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
export const SCALES = {
  chromatic: { name: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  pentatonic: { name: 'Pentatonic', steps: [0, 2, 4, 7, 9] },
  blues: { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAX_STEPS = 16 * STEPS_PER_BAR;

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Canvas piano roll. A transparent scroller with a spacer provides native
// scrolling; the canvas underneath draws only the visible window.
export class Roll {
  constructor(host, api) {
    this.host = host;
    this.api = api;
    this.canvas = document.createElement('canvas');
    this.scroller = document.createElement('div');
    this.scroller.className = 'roll-scroll';
    this.spacer = document.createElement('div');
    this.scroller.append(this.spacer);
    host.append(this.canvas, this.scroller);
    this.g = this.canvas.getContext('2d');
    this.zoom = 1;
    this.hover = null;
    this.drag = null;
    this.touch = null;
    this.pressed = new Set();
    this.scrollMemo = new Map();
    this.trackId = null;
    this.tool = 'draw';
    this.sel = new Set();
    this.range = null;

    const s = this.scroller;
    s.addEventListener('scroll', () => this.draw());
    s.addEventListener('pointerdown', (e) => this.down(e));
    s.addEventListener('pointermove', (e) => this.move(e));
    s.addEventListener('pointerup', (e) => this.up(e));
    s.addEventListener('pointercancel', (e) => this.cancel(e));
    s.addEventListener('pointerleave', () => {
      this.mouseStep = null;
      if (!this.drag) {
        this.hover = null;
        this.draw();
      }
    });
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    s.addEventListener('touchmove', (e) => this.drag && e.cancelable && e.preventDefault(), { passive: false });
    s.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    new ResizeObserver(() => this.layout()).observe(host);
  }

  get track() {
    return this.api.track();
  }

  get drums() {
    return !!INSTRUMENTS[this.track?.inst]?.drums;
  }

  get rows() {
    return this.drums ? DRUMS.length : HI - LO + 1;
  }

  get total() {
    return this.api.project().bars * STEPS_PER_BAR;
  }

  pitchOf(row) {
    return this.drums ? row : HI - row;
  }

  rowOf(p) {
    return this.drums ? p : HI - p;
  }

  // Called whenever the selected track or project length changes.
  layout() {
    const tr = this.track;
    if (this.trackId && this.trackId !== tr?.id) this.scrollMemo.set(this.trackId, this.scroller.scrollTop);
    const switched = this.trackId !== tr?.id;
    this.trackId = tr?.id ?? null;
    if (switched) this.clearSel();

    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.KW = this.drums ? (w < 520 ? 74 : 96) : w < 520 ? 42 : 54;
    this.RH = 26;
    const vw = this.scroller.clientWidth || w;
    const fit = (vw - this.KW) / this.total;
    this.sw = Math.max(this.coarse ? 32 : 22, fit) * this.zoom;
    this.rh = this.drums ? clamp((h - this.RH) / DRUMS.length, 40, 64) : this.coarse ? 30 : 24;
    this.spacer.style.width = this.KW + this.total * this.sw + 'px';
    this.spacer.style.height = this.RH + this.rows * this.rh + 'px';

    const dpr = window.devicePixelRatio || 1;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    if (switched && tr) {
      const memo = this.scrollMemo.get(tr.id);
      if (memo != null) this.scroller.scrollTop = memo;
      else this.centerOnTrack();
    }
    this.draw();
  }

  centerOnTrack() {
    const tr = this.track;
    if (!tr || this.drums) {
      this.scroller.scrollTop = 0;
      return;
    }
    const ps = tr.notes.map((n) => n.p);
    const mid = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : INSTRUMENTS[tr.inst].center;
    this.scroller.scrollTop = this.rowOf(Math.round(mid)) * this.rh - (this.scroller.clientHeight - this.RH) / 2;
  }

  // Scrolls just enough to bring a pitch played from the keyboard into view.
  reveal(p) {
    if (this.drums) return;
    const y = this.rowOf(p) * this.rh;
    const top = this.scroller.scrollTop;
    const view = this.scroller.clientHeight - this.RH;
    if (y < top || y + this.rh > top + view) this.scroller.scrollTop = y - view / 2;
  }

  scrollToStep(step) {
    this.scroller.scrollLeft = step * this.sw;
  }

  // Keeps the playhead in view by paging forward like a score.
  follow(pos) {
    if (pos == null || pos < 0 || this.drag) return;
    const x = pos * this.sw;
    const view = this.scroller.clientWidth - this.KW;
    const left = this.scroller.scrollLeft;
    if (x < left || x > left + view - 8) this.scroller.scrollLeft = Math.max(0, x - 8);
  }

  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.paint();
    });
  }

  paint() {
    const { g, KW, RH, sw, rh, w, h, dpr } = this;
    const tr = this.track;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d1016';
    g.fillRect(0, 0, w, h);
    if (!tr) return;
    const P = this.api.project();
    const total = this.total;
    const sx = this.scroller.scrollLeft;
    const sy = this.scroller.scrollTop;
    const color = INSTRUMENTS[tr.inst].color;
    const drums = this.drums;
    const scale = SCALES[P.scale] || SCALES.chromatic;
    const r0 = Math.max(0, Math.floor(sy / rh));
    const r1 = Math.min(this.rows - 1, Math.floor((sy + h - RH) / rh));
    const gridW = Math.min(w, KW + total * sw - sx);

    // Rows
    for (let r = r0; r <= r1; r++) {
      const y = RH + r * rh - sy;
      const p = this.pitchOf(r);
      let fill;
      if (drums) fill = r % 2 ? '#141820' : '#171b24';
      else {
        const pc = p % 12;
        const inScale = scale.steps.includes((pc - P.key + 12) % 12);
        if (P.scale === 'chromatic') fill = BLACK[pc] ? '#12151c' : '#171b24';
        else fill = inScale ? (pc === P.key ? '#1b2228' : '#181c25') : '#101318';
      }
      g.fillStyle = fill;
      g.fillRect(KW, y, gridW - KW, rh);
      if (drums || p % 12 === 0) {
        g.fillStyle = drums ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.07)';
        g.fillRect(KW, y + rh - 1, gridW - KW, 1);
      }
    }

    // Columns
    const c0 = Math.max(0, Math.floor(sx / sw));
    const c1 = Math.min(total, Math.ceil((sx + w - KW) / sw));
    for (let c = c0; c <= c1; c++) {
      const x = Math.round(KW + c * sw - sx);
      if (x < KW) continue;
      const bar = c % STEPS_PER_BAR === 0;
      const beat = c % 4 === 0;
      if (!bar && !beat && sw < 9) continue;
      g.fillStyle = bar ? 'rgba(255,255,255,0.13)' : beat ? 'rgba(255,255,255,0.065)' : 'rgba(255,255,255,0.025)';
      g.fillRect(x, RH, 1, h - RH);
    }

    g.save();
    g.beginPath();
    g.rect(KW, RH, w - KW, h - RH);
    g.clip();

    const pos = this.api.pos();
    const noteBox = (n) => {
      const x = KW + n.s * sw - sx;
      const y = RH + this.rowOf(n.p) * rh - sy;
      const nw = Math.min(n.l, total - n.s) * sw;
      return { x, y, nw };
    };
    const visible = ({ x, y, nw }) => x + nw >= KW && x <= w && y + rh >= RH && y <= h;

    // Other melodic tracks, faint, to help write harmonies.
    if (!drums) {
      for (const other of P.tracks) {
        if (other === tr || INSTRUMENTS[other.inst].drums) continue;
        g.fillStyle = INSTRUMENTS[other.inst].color;
        g.globalAlpha = 0.13;
        for (const n of other.notes) {
          if (n.s >= total) continue;
          const b = noteBox(n);
          if (!visible(b)) continue;
          roundRect(g, b.x + 1, b.y + 2, b.nw - 2, rh - 4, 3);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }

    // Hover preview
    const hv = this.hover;
    if (hv && !this.drag && hv.empty && this.tool === 'draw') {
      const l = drums ? 1 : Math.min(this.api.len(), total - hv.step);
      const x = KW + hv.step * sw - sx;
      const y = RH + hv.row * rh - sy;
      g.strokeStyle = color;
      g.globalAlpha = 0.5;
      g.lineWidth = 1;
      roundRect(g, x + 1.5, y + 1.5, l * sw - 3, rh - 3, 4);
      g.stroke();
      g.globalAlpha = 1;
    }

    // Selected time range
    if (this.range) {
      const x = KW + this.range.s0 * sw - sx;
      g.fillStyle = 'rgba(110,231,183,0.06)';
      g.fillRect(x, RH, (this.range.s1 - this.range.s0) * sw, h - RH);
    }

    // Notes
    const notes = [...tr.notes, ...this.api.live()];
    g.font = '600 10.5px ui-sans-serif, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const n of notes) {
      if (n.s >= total) continue;
      const b = noteBox(n);
      if (!visible(b)) continue;
      const playing = pos != null && pos >= n.s && pos < n.s + n.l;
      const pad = drums ? 3 : 1;
      g.fillStyle = color;
      g.globalAlpha = n.live ? 0.55 : 1;
      if (playing) {
        g.shadowColor = color;
        g.shadowBlur = 14;
      }
      roundRect(g, b.x + pad, b.y + pad, b.nw - pad * 2, rh - pad * 2, drums ? 6 : 4);
      g.fill();
      g.shadowBlur = 0;
      if (playing) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fill();
      }
      g.globalAlpha = 1;
      if (this.sel.has(n)) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        roundRect(g, b.x + pad + 1, b.y + pad + 1, b.nw - pad * 2 - 2, rh - pad * 2 - 2, drums ? 5 : 3);
        g.stroke();
      }
      if (!drums && b.nw > 16) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(b.x + b.nw - 6, b.y + 6, 2, rh - 12);
        if (b.nw > 34) {
          g.fillStyle = 'rgba(8,10,14,0.7)';
          g.fillText(NOTE_NAMES[n.p % 12] + (Math.floor(n.p / 12) - 1), b.x + 7, b.y + rh / 2 + 0.5);
        }
      }
    }

    // Marquee
    const mq = this.drag?.mode === 'marquee' && this.drag.rect;
    if (mq) {
      const x = KW + mq.x0 - sx;
      const y = RH + mq.y0 - sy;
      g.fillStyle = 'rgba(110,231,183,0.1)';
      g.fillRect(x, y, mq.x1 - mq.x0, mq.y1 - mq.y0);
      g.strokeStyle = 'rgba(110,231,183,0.8)';
      g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.strokeRect(x + 0.5, y + 0.5, mq.x1 - mq.x0 - 1, mq.y1 - mq.y0 - 1);
      g.setLineDash([]);
    }

    // Playhead / start marker
    const start = this.api.startStep();
    const head = pos != null && pos >= 0 ? pos : pos == null ? start : null;
    if (head != null) {
      const x = KW + head * sw - sx;
      g.fillStyle = pos != null ? '#6ee7b7' : 'rgba(110,231,183,0.45)';
      g.fillRect(Math.round(x) - 1, RH, 2, h - RH);
    }
    g.restore();

    // Ruler
    g.fillStyle = '#0f1218';
    g.fillRect(0, 0, w, RH);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, RH - 1, w, 1);
    if (this.range) {
      const x0 = Math.max(KW, KW + this.range.s0 * sw - sx);
      const x1 = KW + this.range.s1 * sw - sx;
      if (x1 > x0) {
        g.fillStyle = 'rgba(110,231,183,0.22)';
        roundRect(g, x0, 3, x1 - x0, RH - 6, 4);
        g.fill();
      }
    }
    g.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (let c = c0 - (c0 % 4); c < c1; c += 4) {
      const x = KW + c * sw - sx;
      if (x < KW - 1) continue;
      if (c % STEPS_PER_BAR === 0) {
        g.fillStyle = '#9aa3b2';
        g.fillText(String(c / STEPS_PER_BAR + 1), x + 5, RH / 2);
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(Math.round(x), 6, 1, RH - 6);
      } else if (sw * 4 > 14) {
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(Math.round(x), RH - 7, 1, 6);
      }
    }
    if (head != null) {
      const x = KW + head * sw - sx;
      if (x >= KW - 6) {
        g.fillStyle = '#6ee7b7';
        g.beginPath();
        g.moveTo(x - 5, RH - 9);
        g.lineTo(x + 5, RH - 9);
        g.lineTo(x, RH - 2);
        g.closePath();
        g.fill();
      }
    }

    // Keys
    g.save();
    g.beginPath();
    g.rect(0, RH, KW, h - RH);
    g.clip();
    const labels = this.api.keyLabels();
    for (let r = r0; r <= r1; r++) {
      const y = RH + r * rh - sy;
      const p = this.pitchOf(r);
      const down = this.pressed.has(p);
      if (drums) {
        g.fillStyle = down ? color : r % 2 ? '#161a22' : '#191e28';
        g.fillRect(0, y, KW, rh);
        g.fillStyle = down ? '#0d1016' : '#c8ceda';
        g.font = '500 12px ui-sans-serif, system-ui, sans-serif';
        g.fillText(DRUMS[r], 10, y + rh / 2);
        if (labels.has(p)) {
          g.fillStyle = down ? '#0d1016' : 'rgba(200,206,218,0.35)';
          g.font = '600 10px ui-sans-serif, system-ui, sans-serif';
          g.fillText(labels.get(p), KW - 18, y + rh / 2);
        }
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(0, y + rh - 1, KW, 1);
        continue;
      }
      const pc = p % 12;
      g.fillStyle = down && !BLACK[pc] ? color : '#e6e9ef';
      g.fillRect(0, y, KW, rh);
      if (BLACK[pc]) {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(KW * 0.62, y + rh / 2, KW * 0.38, 1);
        g.fillStyle = down ? color : '#1d212b';
        roundRect(g, 0, y + 1, KW * 0.62, rh - 2, 3);
        g.fill();
      } else if (pc === 0 || pc === 5) {
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(0, y + rh - 1, KW, 1);
      }
      const label = labels.get(p);
      if (pc === 0 || label) {
        g.font = '600 9.5px ui-sans-serif, system-ui, sans-serif';
        g.textAlign = 'right';
        if (pc === 0) {
          g.fillStyle = down ? '#0d1016' : '#6b7280';
          g.fillText('C' + (Math.floor(p / 12) - 1), KW - 5, y + rh / 2 + 0.5);
        } else if (label) {
          g.fillStyle = BLACK[pc] && !down ? 'rgba(230,233,239,0.45)' : 'rgba(29,33,43,0.4)';
          g.fillText(label, BLACK[pc] ? KW * 0.62 - 4 : KW - 5, y + rh / 2 + 0.5);
        }
        g.textAlign = 'left';
      }
    }
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(KW - 1, RH, 1, h - RH);
    g.fillStyle = '#0f1218';
    g.fillRect(0, 0, KW, RH);
  }


  local(e) {
    const r = this.scroller.getBoundingClientRect();
    const vx = e.clientX - r.left;
    const vy = e.clientY - r.top;
    return {
      vx,
      vy,
      x: vx + this.scroller.scrollLeft - this.KW,
      y: vy + this.scroller.scrollTop - this.RH,
    };
  }

  hit(L) {
    const tr = this.track;
    const row = Math.floor(L.y / this.rh);
    const p = this.pitchOf(row);
    for (let i = tr.notes.length - 1; i >= 0; i--) {
      const n = tr.notes[i];
      if (n.p !== p || n.s >= this.total) continue;
      const x0 = n.s * this.sw;
      const x1 = Math.min(n.s + n.l, this.total) * this.sw;
      if (L.x >= x0 && L.x < x1) {
        const grip = Math.min(10, (x1 - x0) * 0.35);
        return { n, edge: !this.drums && L.x > x1 - grip };
      }
    }
    return null;
  }

  cell(L) {
    const step = Math.floor(L.x / this.sw);
    const row = Math.floor(L.y / this.rh);
    if (step < 0 || step >= this.total || row < 0 || row >= this.rows) return null;
    return { step, row };
  }

  /* ---------- Selection ---------- */

  selected() {
    return (this.track?.notes || []).filter((n) => this.sel.has(n));
  }

  setSel(list, range = null) {
    this.sel = new Set(list);
    this.range = range;
    this.api.selChanged();
    this.draw();
  }

  clearSel() {
    if (!this.sel.size && !this.range) return;
    this.setSel([]);
  }

  selectAll() {
    this.setSel(this.track?.notes.filter((n) => n.s < this.total) || []);
  }

  // Where a selection starts and how far a repeat should jump: the dragged
  // ruler range if there is one, otherwise the notes rounded out to beats.
  span(list) {
    const r = this.range;
    if (r && list.every((n) => n.s >= r.s0 && n.s < r.s1)) return { s0: r.s0, len: r.s1 - r.s0 };
    const s0 = Math.floor(Math.min(...list.map((n) => n.s)) / 4) * 4;
    const end = Math.max(...list.map((n) => n.s + n.l));
    const unit = end - s0 > STEPS_PER_BAR ? STEPS_PER_BAR : 4;
    return { s0, len: Math.max(unit, Math.ceil((end - s0) / unit) * unit) };
  }

  copy() {
    const list = this.selected();
    if (!list.length) return null;
    const { s0, len } = this.span(list);
    return { drums: this.drums, len, notes: list.map((n) => ({ s: n.s - s0, l: n.l, p: n.p, v: n.v })) };
  }

  place(clip, at) {
    const tr = this.track;
    const added = clip.notes.map((n) => ({ ...n, s: n.s + at })).filter((n) => n.s < MAX_STEPS);
    if (!added.length) return added;
    this.api.ensureLength(Math.max(...added.map((n) => n.s + 1)));
    const taken = new Set(added.map((n) => n.s + ':' + n.p));
    tr.notes = tr.notes.filter((n) => !taken.has(n.s + ':' + n.p));
    tr.notes.push(...added);
    return added;
  }

  paste(clip, at) {
    if (!clip || !this.track || clip.drums !== this.drums) return false;
    this.api.begin();
    const added = this.place(clip, at);
    this.setSel(added, { s0: at, s1: at + clip.len });
    this.api.commit();
    this.showStep(at);
    return true;
  }

  duplicate() {
    const clip = this.copy();
    if (!clip) return false;
    const at = this.span(this.selected()).s0 + clip.len;
    if (at >= MAX_STEPS) return false;
    this.api.begin();
    const added = this.place(clip, at);
    this.setSel(added, { s0: at, s1: at + clip.len });
    this.api.commit();
    this.showStep(at);
    return true;
  }

  deleteSel() {
    if (!this.sel.size) return;
    this.api.begin();
    this.track.notes = this.track.notes.filter((n) => !this.sel.has(n));
    this.clearSel();
    this.api.commit();
  }

  nudge(ds, drow) {
    const list = this.selected();
    if (!list.length) return;
    const rows = list.map((n) => this.rowOf(n.p));
    ds = clamp(ds, -Math.min(...list.map((n) => n.s)), this.total - 1 - Math.max(...list.map((n) => n.s)));
    drow = clamp(drow, -Math.min(...rows), this.rows - 1 - Math.max(...rows));
    if (!ds && !drow) return;
    this.api.begin();
    for (const n of list) {
      n.s += ds;
      n.p = this.pitchOf(this.rowOf(n.p) + drow);
    }
    if (this.range) this.range = { s0: this.range.s0 + ds, s1: this.range.s1 + ds };
    if (drow) this.api.blip(list[0].p);
    this.api.commit();
  }

  showStep(step) {
    const x = step * this.sw;
    const left = this.scroller.scrollLeft;
    if (x < left || x > left + this.scroller.clientWidth - this.KW - 40) this.scroller.scrollLeft = Math.max(0, x - 40);
  }

  /* ---------- Pointer input ---------- */

  snapBeat(x) {
    return clamp(Math.round(x / this.sw / 4) * 4, 0, this.total);
  }

  seekAt(L) {
    this.clearSel();
    this.api.seek(clamp(Math.floor(L.x / this.sw / 4) * 4, 0, this.total - 4));
  }

  down(e) {
    if (!this.track) return;
    const L = this.local(e);
    if (L.vy < this.RH) {
      if (L.vx < this.KW) return;
      if (e.pointerType === 'touch') this.seekAt(L);
      else {
        const a = this.snapBeat(L.x);
        this.drag = { mode: 'range', a, L };
        this.scroller.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (L.vx < this.KW) {
      const row = Math.floor(L.y / this.rh);
      if (row < 0 || row >= this.rows) return;
      this.drag = { mode: 'keys', p: this.pitchOf(row), id: 'ptr' + e.pointerId };
      this.api.keyOn(this.drag.id, this.drag.p);
      if (e.pointerType !== 'touch') this.scroller.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 2) {
      const h = this.hit(L);
      if (h) {
        this.api.begin();
        this.track.notes.splice(this.track.notes.indexOf(h.n), 1);
        this.sel.delete(h.n);
        this.api.selChanged();
        this.api.commit();
      }
      return;
    }
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') {
      // Taps edit right away; a long press grabs notes (or draws a box) so a
      // normal swipe can still scroll the roll.
      clearTimeout(this.touch?.timer);
      this.touch = {
        L,
        cx: e.clientX,
        cy: e.clientY,
        timer: setTimeout(() => {
          if (!this.touch) return;
          navigator.vibrate?.(8);
          this.start(this.touch.L, e.pointerId, true, {});
        }, 320),
      };
      return;
    }
    this.start(L, e.pointerId, false, e);
  }

  start(L, pointerId, long, mods) {
    const c = this.cell(L);
    if (!c) return;
    const tr = this.track;
    const h = this.hit(L);
    const selecting = this.tool === 'select' || !!mods.shiftKey;
    const copy = !!(mods.altKey || mods.ctrlKey || mods.metaKey);
    this.api.begin();
    if (h && h.edge) {
      if (!this.sel.has(h.n)) this.clearSel();
      const items = this.sel.has(h.n) ? this.selected() : [h.n];
      this.drag = { mode: 'resize', n: h.n, ox: L.x, items: items.map((n) => ({ n, l: n.l })) };
    } else if (h && (this.sel.has(h.n) || selecting || !this.drums)) {
      const was = this.sel.has(h.n);
      if (!was) {
        if (selecting) this.setSel(mods.shiftKey ? [...this.selected(), h.n] : [h.n]);
        else this.clearSel();
      }
      const items = this.sel.has(h.n) ? this.selected() : [h.n];
      this.drag = {
        mode: 'move',
        n: h.n,
        items: items.map((n) => ({ n, s: n.s, p: n.p })),
        ox: L.x,
        oy: L.y,
        moved: long,
        copy,
        was,
        selecting,
        shift: !!mods.shiftKey,
        lastP: h.n.p,
        lead: Math.max(0, items.indexOf(h.n)),
      };
      this.api.blip(h.n.p);
    } else if (!h && selecting) {
      if (!mods.shiftKey) this.clearSel();
      this.drag = { mode: 'marquee', ox: L.x, oy: L.y, base: mods.shiftKey ? this.selected() : [], rect: null };
    } else if (this.drums) {
      this.clearSel();
      this.drag = { mode: 'paint', erase: !!h, seen: new Set() };
      this.paintAt(L);
    } else {
      this.clearSel();
      const n = { s: c.step, l: Math.min(this.api.len(), this.total - c.step), p: this.pitchOf(c.row), v: 0.8 };
      tr.notes.push(n);
      this.api.blip(n.p);
      this.api.change();
      this.drag = { mode: 'create', n, ox: L.x, dragged: long };
    }
    try {
      this.scroller.setPointerCapture(pointerId);
    } catch {}
    this.draw();
  }

  paintAt(L) {
    const c = this.cell(L);
    if (!c) return;
    const key = c.step + ':' + c.row;
    if (this.drag.seen.has(key)) return;
    this.drag.seen.add(key);
    const notes = this.track.notes;
    const i = notes.findIndex((n) => n.s === c.step && n.p === c.row);
    if (this.drag.erase) {
      if (i >= 0) notes.splice(i, 1);
    } else if (i < 0) {
      notes.push({ s: c.step, l: 1, p: c.row, v: 0.8 });
      this.api.blip(c.row);
    }
    this.api.change();
  }

  move(e) {
    const L = this.local(e);
    if (this.touch && !this.drag) {
      if (Math.hypot(e.clientX - this.touch.cx, e.clientY - this.touch.cy) > 8) {
        clearTimeout(this.touch.timer);
        this.touch = null;
      }
      return;
    }
    const d = this.drag;
    if (!d) {
      this.hoverAt(e, L);
      return;
    }
    const total = this.total;
    const { sw, rh } = this;
    if (d.mode === 'keys') {
      const row = clamp(Math.floor(L.y / rh), 0, this.rows - 1);
      const p = this.pitchOf(row);
      if (p !== d.p && e.pointerType !== 'touch') {
        this.api.keyOff(d.id);
        d.p = p;
        this.api.keyOn(d.id, p);
      }
    } else if (d.mode === 'range') {
      const b = this.snapBeat(L.x);
      if (b !== d.a) {
        const s0 = Math.min(d.a, b);
        const s1 = Math.max(d.a, b);
        this.setSel(this.track.notes.filter((n) => n.s >= s0 && n.s < s1), { s0, s1 });
      }
    } else if (d.mode === 'paint') {
      this.paintAt(L);
    } else if (d.mode === 'create') {
      if (Math.abs(L.x - d.ox) > 4) d.dragged = true;
      if (d.dragged) {
        d.n.l = clamp(Math.ceil(L.x / sw) - d.n.s, 1, total - d.n.s);
        this.api.change();
      }
    } else if (d.mode === 'resize') {
      const dl = Math.round((L.x - d.ox) / sw);
      for (const it of d.items) it.n.l = clamp(it.l + dl, 1, Math.max(1, total - it.n.s));
      this.api.change();
    } else if (d.mode === 'marquee') {
      const x0 = clamp(Math.min(d.ox, L.x), 0, total * sw);
      const x1 = clamp(Math.max(d.ox, L.x), 0, total * sw);
      const y0 = clamp(Math.min(d.oy, L.y), 0, this.rows * rh);
      const y1 = clamp(Math.max(d.oy, L.y), 0, this.rows * rh);
      d.rect = { x0, x1, y0, y1 };
      const hits = this.track.notes.filter((n) => {
        const r = this.rowOf(n.p);
        return n.s < total && n.s * sw < x1 && Math.min(n.s + n.l, total) * sw > x0 && r * rh < y1 && (r + 1) * rh > y0;
      });
      this.sel = new Set([...d.base, ...hits]);
      this.range = null;
      this.draw();
    } else if (d.mode === 'move') {
      if (!d.moved && Math.hypot(L.x - d.ox, L.y - d.oy) > 4) d.moved = true;
      if (!d.moved) return;
      if (d.copy) {
        // Alt/Ctrl-drag leaves the originals in place and drags copies.
        d.copy = false;
        for (const it of d.items) {
          it.n = { ...it.n };
          this.track.notes.push(it.n);
        }
        this.setSel(d.items.map((it) => it.n));
      }
      this.scroller.style.cursor = 'grabbing';
      const rows = d.items.map((it) => this.rowOf(it.p));
      const ds = clamp(Math.round((L.x - d.ox) / sw), -Math.min(...d.items.map((it) => it.s)), total - 1 - Math.max(...d.items.map((it) => it.s)));
      const drow = clamp(Math.floor(L.y / rh) - Math.floor(d.oy / rh), -Math.min(...rows), this.rows - 1 - Math.max(...rows));
      for (const it of d.items) {
        it.n.s = it.s + ds;
        it.n.p = this.pitchOf(this.rowOf(it.p) + drow);
      }
      const lead = d.items[d.lead];
      if (lead.n.p !== d.lastP) {
        d.lastP = lead.n.p;
        this.api.blip(lead.n.p);
      }
      if (this.range) this.range = null;
      this.api.change();
    }
  }

  hoverAt(e, L) {
    if (e.pointerType === 'touch' || !this.track) return;
    if (L.vy < this.RH) {
      this.mouseStep = null;
      this.scroller.style.cursor = L.vx < this.KW ? 'default' : 'pointer';
      if (this.hover) {
        this.hover = null;
        this.draw();
      }
      return;
    }
    const c = L.vx >= this.KW ? this.cell(L) : null;
    this.mouseStep = c ? c.step : null;
    const h = c && this.hit(L);
    const select = this.tool === 'select' || e.shiftKey;
    this.scroller.style.cursor = !c ? (L.vx < this.KW ? 'pointer' : 'default') : h ? (h.edge ? 'ew-resize' : 'grab') : select ? 'default' : 'crosshair';
    const next = c && !select ? { ...c, empty: !h } : null;
    if (JSON.stringify(next) !== JSON.stringify(this.hover)) {
      this.hover = next;
      this.draw();
    }
  }

  up(e) {
    if (this.touch && !this.drag) {
      clearTimeout(this.touch.timer);
      const L = this.touch.L;
      this.touch = null;
      this.tap(L);
      return;
    }
    clearTimeout(this.touch?.timer);
    this.touch = null;
    this.finish(e);
  }

  cancel(e) {
    clearTimeout(this.touch?.timer);
    this.touch = null;
    this.finish(e);
  }

  finish() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.mode === 'keys') {
      this.api.keyOff(d.id);
      return;
    }
    if (d.mode === 'range') {
      if (!this.range) this.seekAt(d.L);
      return;
    }
    const notes = this.track?.notes;
    if (d.mode === 'move' && !d.moved && notes) {
      if (d.selecting) {
        if (d.shift && d.was) {
          this.sel.delete(d.n);
          this.setSel([...this.sel]);
        } else if (d.was) this.setSel([d.n]);
      } else {
        notes.splice(notes.indexOf(d.n), 1);
        if (this.sel.delete(d.n)) this.api.selChanged();
      }
    }
    if (d.mode === 'marquee') this.api.selChanged();
    if ((d.mode === 'create' && d.dragged) || (d.mode === 'resize' && d.items.length === 1)) this.api.setLen(d.n.l);
    this.api.commit();
    this.draw();
  }

  tap(L) {
    const c = this.cell(L);
    if (!c) return;
    const notes = this.track.notes;
    const h = this.hit(L);
    if (this.tool === 'select') {
      if (!h) this.clearSel();
      else if (this.sel.has(h.n)) {
        this.sel.delete(h.n);
        this.setSel([...this.sel]);
      } else this.setSel([...this.selected(), h.n]);
      return;
    }
    this.api.begin();
    if (h) {
      notes.splice(notes.indexOf(h.n), 1);
      if (this.sel.delete(h.n)) this.api.selChanged();
    } else {
      this.clearSel();
      const n = { s: c.step, l: this.drums ? 1 : Math.min(this.api.len(), this.total - c.step), p: this.pitchOf(c.row), v: 0.8 };
      notes.push(n);
      this.api.blip(n.p);
    }
    this.api.commit();
  }

  wheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const L = this.local(e);
    const step = L.x / this.sw;
    this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.004), 1, 8);
    this.layout();
    this.scroller.scrollLeft = step * this.sw - (L.vx - this.KW);
  }
}
