import { ZOOM_MAX, ZOOM_MIN } from '../data/tuning.mjs';

export const clampZoom = zoom => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(zoom) ? zoom : ZOOM_MIN));

// A tap moves only on release. Once two fingers touch, neither may become a tap.
export function createGroundGesture({ onTap, onZoom, onGesture, getZoom, onPan = () => {}, onSingleDrag = () => {} }) {
  const pointers = new Map();
  let multi = false;
  let initialDistance = 0;
  let initialZoom = 1;
  let lastCenter = null;
  const center = () => { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  function down(id, x, y) {
    pointers.set(id, { x, y, startX: x, startY: y });
    if (pointers.size >= 2) {
      multi = true;
      onGesture();
      initialDistance = distance();
      initialZoom = getZoom();
      lastCenter = center();
    }
  }
  function move(id, x, y) {
    const pointer = pointers.get(id);
    if (!pointer) return;
    if (!multi && pointers.size === 1) onSingleDrag(x - pointer.x, y - pointer.y);
    pointer.x = x;
    pointer.y = y;
    if (pointers.size >= 2 && initialDistance > 0) {
      onZoom(clampZoom(initialZoom * distance() / initialDistance));
      const next = center();
      if (lastCenter) onPan(next.x - lastCenter.x, next.y - lastCenter.y);
      lastCenter = next;
    }
  }
  function up(id, x, y, cancel = false) {
    const pointer = pointers.get(id);
    if (!pointer) return;
    if (!cancel && !multi && pointers.size === 1 && Math.hypot(x - pointer.startX, y - pointer.startY) < 12) {
      onTap(x, y);
    }
    pointers.delete(id);
    if (pointers.size === 0) multi = false;
  }
  function clear() {
    pointers.clear();
    multi = false;
    lastCenter = null;
  }
  return { down, move, up, clear };
}
