// Canvas2D look of a dungeon floor, for browsers without WebGL: the same colours and wall heights as
// dungeon/three.mjs, painted cell by cell (floor first, then walls from the back row forward).
import {FLOOR, ROCK, SOLID} from './grid.mjs?v=harvest-18';
import {WALL, floorTones, wallCell, wallHeight} from './art.mjs?v=harvest-18';
import {layoutOf} from './run.mjs?v=harvest-18';
import {brightnessAt, shadeHex} from '../lighting.mjs?v=harvest-18';

export function paintDungeonCanvas(r, c, world, frame, clock, halfX, halfZ){
  const L = layoutOf(world); if(!L) return;
  const tones = floorTones(L), d = world.dungeon;
  const i0 = Math.max(0, Math.floor(r.focus.x - halfX - L.ox)), i1 = Math.min(L.w - 1, Math.ceil(r.focus.x + halfX - L.ox));
  const j0 = Math.max(0, Math.floor(r.focus.z - halfZ - L.oz)), j1 = Math.min(L.h - 1, Math.ceil(r.focus.z + halfZ + 3 - L.oz));
  const shade = (hex, x, z) => shadeHex(hex, brightnessAt(frame.sources, x, z, frame.darkness, frame.lighting), frame.darkness, frame.lighting);
  const poly = (pts, fill) => {c.fillStyle = fill; c.beginPath(); pts.forEach((p, n) => n ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fill();};
  for(let j = j0; j <= j1; j++) for(let i = i0; i <= i1; i++){
    const k = i + j*L.w; if(L.cells[k] === ROCK) continue;
    const x = L.ox + i, z = L.oz + j, a = r.screenPoint(x, z), b = r.screenPoint(x + 1, z + 1);
    c.fillStyle = shade(tones.floor[k], x + .5, z + .5); c.fillRect(a.x - .5, a.y - .5, b.x - a.x + 1, b.y - a.y + 1);
  }
  // The stairs and the shrine lie on the floor, under everything standing.
  const open = d.phase === 'open', pulse = .5 + .5*Math.sin(clock*3.2);
  const ring = (x, z, radius, stroke, width, alpha) => {const q = r.screenPoint(x, z); c.save(); c.globalAlpha = alpha; c.strokeStyle = stroke; c.lineWidth = width; c.beginPath(); c.ellipse(q.x, q.y, radius*r.scale, radius*r.scale*.72, 0, 0, Math.PI*2); c.stroke(); c.restore();};
  {const q = r.screenPoint(L.portal.x, L.portal.z); c.fillStyle = 'rgba(16,13,22,.88)'; c.beginPath(); c.ellipse(q.x, q.y, 1.75*r.scale, 1.75*r.scale*.72, 0, 0, Math.PI*2); c.fill();}
  ring(L.portal.x, L.portal.z, 2.02, tones.accent, Math.max(2, .3*r.scale), open ? .6 + .35*pulse : .2);
  if(open && d.portal > 0){const q = r.screenPoint(L.portal.x, L.portal.z); c.save(); c.strokeStyle = '#fff1c8'; c.lineWidth = Math.max(3, .28*r.scale); c.beginPath(); c.ellipse(q.x, q.y, 2.45*r.scale, 2.45*r.scale*.72, 0, -Math.PI/2, -Math.PI/2 + Math.PI*2*d.portal); c.stroke(); c.restore();}
  if(L.shrine) ring(L.shrine.x, L.shrine.z, 2, '#bfe0ff', Math.max(2, .16*r.scale), d.shrine ? .12 : .35 + .3*pulse + .3*(d.shrineT || 0));
  // Walls and pillars: back rows first, each with its top and the face the camera sees.
  for(let j = j0; j <= j1; j++) for(let i = i0; i <= i1; i++){
    const k = i + j*L.w; if(L.cells[k] === FLOOR || !wallCell(L, i, j)) continue;
    const h = wallHeight(L, i, j); if(!(h > 0)) continue;
    const inset = L.cells[k] === SOLID ? (1 - WALL.pillarWidth)/2 : 0;
    const x0 = L.ox + i + inset, x1 = L.ox + i + 1 - inset, z0 = L.oz + j + inset, z1 = L.oz + j + 1 - inset;
    const light = brightnessAt(frame.sources, x0 + .5, z1 + .3, frame.darkness, frame.lighting);
    const south = inset ? 0 : L.cells[k + L.w] === FLOOR || L.cells[k + L.w] === SOLID ? 0 : j + 1 < L.h ? wallHeight(L, i, j + 1) : 0;
    if(south < h) poly([r.screenPoint(x0, z1, h), r.screenPoint(x1, z1, h), r.screenPoint(x1, z1, south), r.screenPoint(x0, z1, south)], shadeHex(tones.face, light, frame.darkness, frame.lighting));
    poly([r.screenPoint(x0, z0, h), r.screenPoint(x1, z0, h), r.screenPoint(x1, z1, h), r.screenPoint(x0, z1, h)], shadeHex(tones.wall[k], light, frame.darkness, frame.lighting));
  }
}
