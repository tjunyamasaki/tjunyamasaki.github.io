// One pointer state machine for touch, pen and mouse.
//   press  -> tap | long press | drag (object) | pan (empty table)
//   two fingers -> pinch zoom + pan
const LONG_MS = 420;

export function attachGestures(el, h) {
  const pts = new Map();
  let g = null;
  let pinch = null;

  const pos = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function finishDrag(cancel, p) {
    if (g?.state === 'drag') h.dragEnd(p?.x ?? g.x, p?.y ?? g.y, cancel);
    if (g?.state === 'held') h.heldCancel?.(g.info);
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0 && e.pointerType === 'mouse') return;
    el.setPointerCapture(e.pointerId);
    const p = pos(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      const info = h.down(p.x, p.y);
      g = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t: performance.now(), info, state: 'press', touch: e.pointerType !== 'mouse' };
      clearTimeout(g.timer);
      const mine = g;
      g.timer = setTimeout(() => {
        if (g !== mine || g.state !== 'press') return;
        const r = h.longPress(g.info, g.x, g.y);
        if (r === 'held') g.state = 'held';
        else if (r === 'done') g.state = 'done';
      }, LONG_MS);
    } else if (pts.size === 2 && g && g.state !== 'drag') {
      clearTimeout(g.timer);
      if (g.state === 'held') h.heldCancel?.(g.info);
      g.state = 'pinch';
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) {
      h.hover?.(pos(e));
      return;
    }
    const p = pos(e);
    pts.set(e.pointerId, p);
    if (!g) return;
    if (g.state === 'pinch') {
      if (pts.size < 2) return;
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (pinch.d > 0) h.zoom(d / pinch.d, mx, my);
      h.pan(pinch.mx, pinch.my, mx, my);
      pinch = { d, mx, my };
      return;
    }
    if (e.pointerId !== g.id) return;
    const px = g.x;
    const py = g.y;
    g.x = p.x;
    g.y = p.y;
    if (g.state === 'press' || g.state === 'held') {
      const slop = g.touch ? 9 : 5;
      if (Math.hypot(p.x - g.x0, p.y - g.y0) < slop) return;
      clearTimeout(g.timer);
      const held = g.state === 'held';
      if (h.dragStart(g.info, g.x0, g.y0, held)) {
        g.state = 'drag';
        h.dragMove(p.x, p.y);
      } else {
        g.state = 'pan';
        h.pan(g.x0, g.y0, p.x, p.y);
      }
      return;
    }
    if (g.state === 'drag') h.dragMove(p.x, p.y);
    else if (g.state === 'pan') h.pan(px, py, p.x, p.y);
  });

  const up = (e, cancel) => {
    if (!pts.has(e.pointerId)) return;
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.state === 'pinch') {
      if (pts.size === 0) g = null;
      return;
    }
    if (e.pointerId !== g.id) return;
    clearTimeout(g.timer);
    if (g.state === 'press' && !cancel) h.tap(g.info, p.x, p.y);
    else if (g.state === 'held' && !cancel) h.heldRelease?.(g.info, p.x, p.y);
    else finishDrag(cancel, p);
    g = null;
  };
  el.addEventListener('pointerup', (e) => up(e, false));
  el.addEventListener('pointercancel', (e) => up(e, true));
  el.addEventListener('lostpointercapture', (e) => {
    if (g && e.pointerId === g.id && pts.has(e.pointerId)) up(e, true);
  });

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = pos(e);
      h.zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
    },
    { passive: false },
  );
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    cancel() {
      if (!g) return;
      clearTimeout(g.timer);
      finishDrag(true);
      g = null;
    },
  };
}
