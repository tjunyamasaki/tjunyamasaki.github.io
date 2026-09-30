// The ground marker under whatever you are aiming at (both renderers). Four short inked arcs around the
// target's footprint, sized to the target (a dropped berry gets a small one, the Heartfire a wide one),
// cream for things you can use and a soft red for creatures, breathing gently. Drawn with the same ink
// outline as the sprites so it belongs to the world instead of sitting on top of it.
import {ENEMIES} from './content.mjs?v=harvest-18';

export const MARKER_INK = '#2b2233';
const FRIENDLY = '#f3ead2';
const HOSTILE = '#ee8b77';
const ARCS = 4;
const SPAN = 38 * Math.PI / 180;        // each arc's length
const FILL_W = .085, INK_W = .17;       // world units
const MIN_R = .55, MAX_R = 2.1;

/** {radius, color, hostile} for a target entity; radius in world units. */
export function targetMarker(theme, target){
  if(!target) return null;
  const hostile = !target.stack && !!ENEMIES[target.type];
  const def = target.stack ? null : theme?.sprites?.[target.type];
  let radius = target.stack ? .6 : def ? def.size[0] * .4 : .9;
  if(hostile && target.elite) radius *= 1.3;
  radius = Math.min(MAX_R, Math.max(MIN_R, radius));
  return {radius, color: hostile ? HOSTILE : FRIENDLY, hostile};
}

/** A slow breath (scale around 1). */
export function markerPulse(clock = 0){
  return 1 + .055 * Math.sin(clock * 4);
}

/**
 * Paint the marker centred at (cx, cy) on a 2D context, `unit` pixels per world unit, radius `r` in world units.
 * The caller squashes the context vertically for the ground perspective (canvas renderer) or not (a texture).
 */
export function paintMarker(g, cx, cy, r, unit, color){
  g.save();
  g.lineCap = 'round';
  for(const [width, stroke] of [[INK_W, MARKER_INK], [FILL_W, color]]){
    g.lineWidth = Math.max(1, width * unit);
    g.strokeStyle = stroke;
    for(let i = 0; i < ARCS; i++){
      const mid = Math.PI / 4 + i * Math.PI / 2;
      g.beginPath();
      g.arc(cx, cy, r * unit, mid - SPAN / 2, mid + SPAN / 2);
      g.stroke();
    }
  }
  g.restore();
}

/** Canvas big enough to hold a marker of radius `r` at `unit` px per world unit (for a WebGL texture). */
export function markerCanvas(r, color, unit = 96){
  if(typeof document === 'undefined') return null;
  const half = Math.ceil((r + INK_W) * unit) + 2, c = document.createElement('canvas');
  c.width = c.height = half * 2;
  paintMarker(c.getContext('2d'), half, half, r, unit, color);
  return {canvas: c, size: c.width / unit};
}
