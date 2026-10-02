// The Eye of the Deep, drawn: the eye hanging at the wielder's shoulder (a rig), its gaze as a beam that
// heats from violet to white, the leap of a hot gaze to the next foe, and Open the Abyss.
// Presentation only: the gaze lives on the wielder (magic/deepeye.mjs `p.gaze`, `p.abyss`).
// Rank ladder: ★1 the eye and a thin beam; ★2 a glow round the eye and a soft halo on the beam; ★3 motes
// boiling off the beam's end and a second beam strand; ★4 trailing tendrils, a sigil where it burns, a kick
// on a leap; ★5 the rose colour at full heat and a flash when the abyss folds.
import {INK, TAU, at, clamp01, easeOut, fade, hue, lerp, tier} from './kit.mjs?v=harvest-18';
import {ABYSS} from '../magic/deepeye.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'deepeye';
const P = hue(PACK);
const SCLERA = '#efe6f4', VEIN = '#c46a8a', IRIS = '#7c3cff', FLESH = '#3a2440';

function blob(d, x, z, y, cu, cv, ru, rv, color, alpha, {glow = false, n = 12} = {}){
  const pts = [];
  for(let i = 0; i <= n; i++){const a = i/n*TAU; pts.push(at(x, z, y, cu+Math.cos(a)*ru, cv+Math.sin(a)*rv));}
  d.path(pts, 0, color, alpha, {fill: true, glow});
}
const mix = (a, b, t) => {const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), c = k => Math.round(lerp((pa >> k) & 255, (pb >> k) & 255, clamp01(t))); return '#'+((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0');};

/** Where the eye hangs and how big: shared by the rig and the beam. */
function eyeSpot(p, anchor, clock){
  const side = p.dx < -.1 ? 1 : -1, swell = p.abyss ? 1.8 : 1;
  return {x: anchor.x+side*.75, z: anchor.z-.05, y: anchor.y+2.45+.12*Math.sin(clock*1.7), r: .26*swell};
}

export function paintEyeRig(d, world, p, anchor, motion, clock, time){
  const T = tier(rankOf(p, PACK)), g = p.gaze, e = eyeSpot(p, anchor, clock), heat = g?.heat || 0, now = time ?? world.time, lead = Math.max(0, Math.min(.1, now-world.time));
  if(T.glow) d.bloom(e.x, e.z, e.y, e.r*(2.6+2*heat), P.glow, .2+.35*heat);
  // ★4 tendrils trailing beneath it.
  const tendrils = T.debris ? 4 : 2;
  for(let k = 0; k < tendrils; k++){
    const pts = [];
    for(let i = 0; i <= 10; i++){const t = i/10; pts.push(at(e.x, e.z, e.y, Math.sin(clock*2.2+k*1.7+t*3)*.12*t+(k-(tendrils-1)/2)*.09, -e.r-.55*t));}
    d.path(pts, .07, INK, .7, {taper: .9}); d.path(pts, .04, FLESH, 1, {taper: .9});
  }
  blob(d, e.x, e.z, e.y, 0, 0, e.r+.05, e.r+.05, INK, 1, {n: 20});
  blob(d, e.x, e.z, e.y, 0, 0, e.r, e.r, SCLERA, 1, {n: 20});
  for(let i = 0; i < 4; i++){const a = i/4*TAU+.4; d.path([at(e.x, e.z, e.y, Math.cos(a)*e.r*.95, Math.sin(a)*e.r*.95), at(e.x, e.z, e.y, Math.cos(a+.3)*e.r*.55, Math.sin(a+.3)*e.r*.5)], .025, VEIN, .7);}
  // The iris looks toward what it stares at (or ahead).
  let lx = p.dx || 0, lz = p.dz || 1;
  if(g?.on && Number.isFinite(g.tx)){const dx = g.tx-e.x, dz = g.tz-e.z, l = Math.hypot(dx, dz) || 1; lx = dx/l; lz = dz/l;}
  const iu = lx*e.r*.35, iv = -lz*e.r*.25;
  const iris = mix(IRIS, P.alt, T.prism ? heat : 0);
  blob(d, e.x, e.z, e.y, iu, iv, e.r*.5, e.r*.5, iris, 1, {n: 16});
  // A slit pupil that narrows as the gaze heats.
  blob(d, e.x, e.z, e.y, iu, iv, e.r*(.14-.08*heat), e.r*.4, INK, 1, {n: 12});
  blob(d, e.x, e.z, e.y, iu-e.r*.18, iv+e.r*.2, e.r*.09, e.r*.07, '#ffffff', .85, {n: 6});
  // The gaze: a beam from the eye to its mark, hotter and thicker with heat.
  if(g?.on && Number.isFinite(g.tx)){
    const a = at(e.x, e.z, e.y, iu, iv), b = [g.tx, .6, g.tz], col = mix(P.main, P.core, heat), w = .07+.16*heat;
    const flick = .85+.15*Math.sin(clock*40);
    d.path([a, b], w+.06, INK, .35);
    d.path([a, b], w, col, flick);
    if(T.glow) d.path([a, b], w*3.2, T.prism && heat > .8 ? P.alt : P.glow, .25+.3*heat, {glow: true, soft: true});
    if(T.rays){const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2+Math.sin(clock*9)*.15, (a[2]+b[2])/2]; d.path([a, mid, b], w*.35, P.core, .6*flick, {glow: true});}
    d.orb(g.tx, g.tz, .6, .18+.25*heat, P.core, .9, {glow: true});
    if(T.glow) d.pool(g.tx, g.tz, .5+.8*heat, col, .35+.3*heat);
    else d.orb(g.tx, g.tz, .05, .45+.6*heat, col, .4, {ground: true});
    if(T.sigil) d.sigil(g.tx, g.tz, .55+.4*heat, P.main, .5, {spin: clock*2, sides: 6, glow: false});
    if(T.rays) d.motes(g.tx, g.tz, 4+Math.round(heat*6), (clock*1.3)%1, .5, col, .8, 77, {rise: 1.6, size: .06});
    d.light(g.tx, g.tz, 1.5+2*heat);
  }
  // Open the Abyss: the swollen eye sweeps a great beam round.
  const ab = p.abyss;
  if(ab){
    const k = clamp01((ab.t+lead)/ABYSS.duration), ang = ab.a0+ab.dir*k*TAU, R = ABYSS.radius;
    const a = [anchor.x, .7, anchor.z], b = [anchor.x+Math.cos(ang)*R, .5, anchor.z+Math.sin(ang)*R];
    d.path([at(e.x, e.z, e.y, 0, 0), a], .2, P.core, .8, {glow: true});
    d.path([a, b], .5, INK, .3); d.path([a, b], .34, P.main, 1); d.path([a, b], .16, P.core, 1);
    d.path([a, b], 1.4, P.glow, .35, {glow: true, soft: true});
    // The swept dark behind the beam.
    const trail = [];
    for(let i = 0; i <= 24; i++){const t = i/24*k; trail.push([anchor.x+Math.cos(ab.a0+ab.dir*t*TAU)*R, .07, anchor.z+Math.sin(ab.a0+ab.dir*t*TAU)*R]);}
    if(trail.length > 1) d.path(trail, .12, P.main, .6, {glow: T.glow});
    d.stain(anchor.x, anchor.z, R*.95*k, P.deep, .25);
    d.light(b[0], b[2], 3);
  }
  return {x: e.x, y: 0, z: e.z+.1};
}

export const EYE_EVENTS = {
  gazejump: {life: () => .35, kick: ev => ev.rank >= 4 ? {shake: .15} : null, paint(d, ev, age, seed){
    const t = age/.35;
    d.lightning([[ev.x, .6, ev.z], [ev.tx ?? ev.x, .6, ev.tz ?? ev.z]], .1, P.main, (1-t), seed, {core: P.core});
  }},
  gaze: {life: () => .25, paint(d, ev, age){d.bloom(ev.x, ev.z, 1.9, .6*(1-age/.25), P.core, .6);}},
  abyss: {life: () => .6, kick: () => ({shake: .2}), paint(d, ev, age){const t = age/.6; d.ring(ev.x, ev.z, 1+t*4, .12, P.main, fade(t), {glow: true});}},
  abyssfold: {life: () => .7, kick: ev => ({shake: .5, flash: ev.rank >= 5 ? .26 : .08, color: '#e6d0ff'}), paint(d, ev, age, seed){
    const T = tier(ev.rank), t = age/.7, r = (ev.radius || 3.6)*(1-easeOut(t))+.2;
    d.stain(ev.x, ev.z, (ev.radius || 3.6), P.deep, .5*fade(t));
    d.shock(ev.x, ev.z, r, .2, P.main, fade(t), P.core);
    if(T.rays) d.groundRays(ev.x, ev.z, 10, .4, (ev.radius || 3.6), .08, P.glow, .6*fade(t), seed);
  }},
};

export const DEEPEYE_FX = {
  id: PACK,
  events: EYE_EVENTS,
  magicCast: false,
  rig: (d, world, p, anchor, motion, clock, time) => ({origin: paintEyeRig(d, world, p, anchor, motion, clock, time)}),
};

