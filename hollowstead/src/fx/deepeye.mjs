// The Eye of the Deep, drawn: the eye hanging at the wielder's shoulder (a rig), its gaze as a beam that
// heats from violet to white, the leap of a hot gaze to the next foe, and Open the Abyss.
// Presentation only: the gaze lives on the wielder (magic/deepeye.mjs `p.gaze`, `p.abyss`).
// The eye opens in three stages with the heat (magic/deepeye.mjs stageOf): half-lidded at a Glance, wide at a
// Stare (the beam thickens and sparks where it passes through foes), lidless when Unblinking (a binding ring
// round the transfixed mark and a lesser beam to the next foe). A stared-at foe that dies ruptures.
// Rank ladder: ★1 the eye and a thin beam; ★2 a glow round the eye and a soft halo on the beam; ★3 motes
// boiling off the beam's end and a second beam strand; ★4 trailing tendrils, a sigil where it burns, a kick
// on a leap; ★5 the rose colour at full heat and a flash when the abyss folds.
import {INK, TAU, at, clamp01, easeOut, fade, hue, lerp, tier} from './kit.mjs?v=harvest-18';
import {ABYSS, GAZE} from '../magic/deepeye.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'deepeye';
const P = hue(PACK);
const SCLERA = '#efe6f4', VEIN = '#c46a8a', IRIS = '#7c3cff', FLESH = '#3a2440', LID = '#5a3a63';
/** How far the lids are open at each stage (Glance, Stare, Unblinking). */
const OPEN = [.38, .72, 1];

function blob(d, x, z, y, cu, cv, ru, rv, color, alpha, {glow = false, n = 12} = {}){
  const pts = [];
  for(let i = 0; i <= n; i++){const a = i/n*TAU; pts.push(at(x, z, y, cu+Math.cos(a)*ru, cv+Math.sin(a)*rv));}
  d.path(pts, 0, color, alpha, {fill: true, glow});
}
const mix = (a, b, t) => {const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), c = k => Math.round(lerp((pa >> k) & 255, (pb >> k) & 255, clamp01(t))); return '#'+((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0');};

/** The lids, drawn over the eye: `open` 1 shows the whole eye, lower values close them from above and below. */
function lids(d, e, open){
  if(open >= .99) return;
  const r = e.r+.02, cut = (side, depth) => {
    // A lid covers the eye beyond |v| = r*(1-depth); its edge sags toward the middle.
    const edge = r*(1-depth)*side, a0 = Math.asin(Math.max(-1, Math.min(1, edge/r))), pts = [];
    const from = side > 0 ? a0 : Math.PI+(-a0), to = side > 0 ? Math.PI-a0 : TAU+a0;
    for(let i = 0; i <= 14; i++){const a = from+(to-from)*i/14; pts.push(at(e.x, e.z, e.y, Math.cos(a)*r, Math.sin(a)*r));}
    const w = Math.cos(a0)*r;
    for(let i = 0; i <= 10; i++){const u = -w*side+2*w*side*i/10; pts.push(at(e.x, e.z, e.y, side > 0 ? -u : u, edge-side*r*.18*Math.sin(Math.PI*i/10)));}
    d.path(pts, 0, LID, 1, {fill: true});
    const rim = pts.slice(15);
    d.path(rim, .045, INK, 1);
  };
  cut(1, (1-open)*.62);
  cut(-1, (1-open)*.38);
}
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
  const stage = g ? (g.stage || 0) : 0;
  lids(d, e, p.abyss ? 1 : OPEN[stage]);
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
    // Staring: sparks burst off every foe the beam passes through on its way.
    if(stage >= 1){
      const ex = p.x, ez = p.z, vx = g.tx-ex, vz = g.tz-ez, l2 = vx*vx+vz*vz || 1;
      let n = 0;
      for(const f of world.enemies || []){
        if(n >= 8 || !(f.hp > 0) || f.id === g.targetId || f.id === g.second) continue;
        const t = ((f.x-ex)*vx+(f.z-ez)*vz)/l2;
        if(t <= 0 || t > 1) continue;
        const px = ex+vx*t, pz = ez+vz*t;
        if(Math.hypot(f.x-px, f.z-pz) > GAZE.width) continue;
        n++;
        d.orb(f.x, f.z, .7, .12+.1*heat, P.core, .85, {glow: true});
        d.sparks(f.x, f.z, .7, T.sparks > 6 ? 4 : 2, (clock*2.3+n*.37)%1, col, .8, 31+n, {speed: 3, up: 1.6, life: .5});
      }
    }
    // Unblinking: the mark is held in a ring of binding marks, and a lesser beam opens on the next foe.
    if(stage >= 2){
      d.mark(g.tx, g.tz, .78, .08, P.main, .9);
      for(let i = 0; i < 6; i++){const a2 = clock*1.6+i/6*TAU; d.orb(g.tx+Math.cos(a2)*.82, g.tz+Math.sin(a2)*.82*.7, .3, .07, i%2 ? P.core : P.main, .9, {glow: T.glow});}
      if(g.second && Number.isFinite(g.sx)){
        const b2 = [g.sx, .6, g.sz], w2 = w*.5;
        d.path([a, b2], w2+.05, INK, .3);
        d.path([a, b2], w2, P.main, .9*flick);
        if(T.glow) d.path([a, b2], w2*3, P.glow, .2, {glow: true, soft: true});
        d.orb(g.sx, g.sz, .6, .14, P.core, .8, {glow: true});
      }
    }
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
  // The eye opens a stage wider: a ring off the mark (a held ring at Unblinking).
  gazestage: {life: () => .5, kick: ev => ev.stage >= 2 && ev.rank >= 3 ? {shake: .12} : null, paint(d, ev, age, seed){
    const T = tier(ev.rank), t = age/.5, R = ev.stage >= 2 ? 1.6 : 1.1;
    d.ring(ev.x, ev.z, .3+R*easeOut(t), .1, ev.stage >= 2 && T.prism ? P.alt : P.main, fade(t), {glow: true});
    if(ev.stage >= 2) d.shock(ev.x, ev.z, .4+R*.8*easeOut(t), .08, P.main, fade(t), P.core);
    if(T.rays) d.sparks(ev.x, ev.z, .6, T.sparks, t, P.core, fade(t), seed, {speed: 4, up: 2});
  }},
  // A foe slain under the stare bursts with the dark it was made to see.
  gazerupture: {life: () => .55, kick: ev => ev.rank >= 4 ? {shake: .18} : null, paint(d, ev, age, seed){
    const T = tier(ev.rank), t = age/.55, R = (ev.r || GAZE.burst)*(.6+.4*(ev.heat || 0));
    d.stain(ev.x, ev.z, R*easeOut(t), P.deep, .55*fade(t));
    d.shock(ev.x, ev.z, R*easeOut(t), .14, P.main, fade(t), P.core);
    d.orb(ev.x, ev.z, .6, .5*(1-t), P.core, .9*fade(t), {glow: true});
    if(T.rays) d.groundRays(ev.x, ev.z, 8, .3, R, .07, P.glow, .5*fade(t), seed);
    d.sparks(ev.x, ev.z, .6, T.sparks, t, mix(P.main, P.core, ev.heat || 0), fade(t), seed, {speed: 5, up: 2.5});
    d.light(ev.x, ev.z, 2.5*(1-t));
  }},
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

