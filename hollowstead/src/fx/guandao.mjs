// The Green Dragon guandao, drawn. Presentation only: the host owns the sweeps and their reach
// (magic/guandao.mjs). Jade crescents with an ink edge; the longer the line is held, the longer and
// brighter the crescent, scales along its edge from the second step, an echo at full reach. Three jade
// pips at the wielder's feet count the line; while the dragon is awake it coils round the wielder.
// Ranks: ★1 a plain crescent; ★2 glow and a trail of light; ★3 scales and sparks; ★4 sigil and camera kick
// on the echo; ★5 gold scales (the alt colour) and the most flourish.
import {INK, TAU, at, bump, clamp01, easeOut, fade, hue, rnd, tier} from './kit.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'guandao';
const P = hue(PACK);
const rankOfOwner = p => p && typeof p === 'object' ? rankOf(p, PACK) : 1;

/** One crescent: the arc of a sweep revealed from one end to the other, then fading. */
function paintCrescent(d, s, owner, lead){
  const T = tier(rankOfOwner(owner)), age = (s.age || 0)+lead-(s.delay || 0);
  if(age < 0){
    // An echo still to come: a ghost of the crescent where it will cut again.
    const k = clamp01(1+age/Math.max(.05, s.delay || .3));
    ribbon(d, s, 1, .55*k, P.glow, .18*k, {soft: true, glow: true});
    return;
  }
  const life = s.life || .42, k = age/life;
  if(k >= 1 || !d.near(s.ox, s.oz, s.r+2)) return;
  const reveal = easeOut(age/.14), stage = s.stage || 0, echo = !!s.echo, w = .32+.1*stage;
  const f = fade(k, 1.2), main = echo ? P.alt : P.main;
  if(T.r >= 2) ribbon(d, s, reveal, w*2.3, P.glow, .35*f, {glow: true, soft: true});
  ribbon(d, s, reveal, w*1.3, INK, .85*f);
  ribbon(d, s, reveal, w, main, f);
  ribbon(d, s, reveal, w*.38, P.core, f, {edge: .3});
  // Dragon scales along the edge from the second step (or the third rank).
  if(stage >= 2 || T.r >= 3){
    const n = 5+stage*2+T.r;
    for(let i = 0; i < n; i++){
      const t = (i+.5)/n; if(t > reveal) break;
      const a = arcAngle(s, t), rr = s.r-.05, x = s.ox+Math.cos(a)*rr, z = s.oz+Math.sin(a)*rr;
      d.orb(x, z, .5, .1+.02*stage, T.r >= 5 ? P.alt : P.core, f, {glow: T.r >= 2});
    }
  }
  if(T.r >= 3) d.sparks(s.ox+Math.cos(s.ang)*s.r*.8, s.oz+Math.sin(s.ang)*s.r*.8, .5, T.sparks, age, P.alt, f, (s.id?.length || 3)*7+stage, {speed: 3, up: 1.5, gravity: 6, life: .4});
  if(echo && T.r >= 4) d.sigil(s.ox+Math.cos(s.ang)*s.r*.6, s.oz+Math.sin(s.ang)*s.r*.6, .8, P.main, .7*f, {spin: age*3, sides: 6, glow: false});
  if(stage >= 3 || T.r >= 5) d.light(s.ox+Math.cos(s.ang)*s.r*.6, s.oz+Math.sin(s.ang)*s.r*.6, 1.4+stage*.4);
}
/** Angle along a sweep's arc at t (0..1), in the direction it swings. */
function arcAngle(s, t){const half = (s.arc || 150)*Math.PI/360, side = s.side || 1; return s.ang-side*half+side*2*half*t;}
/** The crescent as a tapered ribbon along the arc, from its start to `to`. */
function ribbon(d, s, to, width, color, alpha, {glow = false, soft = false, edge = 0} = {}){
  if(!(alpha > .004) || !(to > .02)) return;
  const n = 22, pts = [];
  for(let i = 0; i <= n; i++){
    const t = i/n*to, a = arcAngle(s, t), w = width*Math.sin(Math.PI*Math.min(1, t/Math.max(.05, to)))**.6, rr = s.r-width*.5+edge*width;
    pts.push([s.ox+Math.cos(a)*(rr+w*.5), .45+.25*bump(t), s.oz+Math.sin(a)*(rr+w*.5)]);
  }
  d.path(pts, width, color, alpha, {glow, soft, taper: .7});
}

/** The wielder's line: three pips at the feet, lit one per step; the dragon coils round while awake. */
function paintLine(d, world, p, anchor, motion, clock, time){
  const T = tier(rankOfOwner(p)), stage = p.gdStage || 0, live = time-(p.gdAt ?? -99) < 2.4, x = anchor.x, z = anchor.z;
  if(live && stage > 0) for(let i = 0; i < 3; i++){
    const a = (p.gdAng || 0)+(i-1)*.45, on = i < stage, px = x+Math.cos(a)*.8, pz = z+Math.sin(a)*.8;
    d.orb(px, pz, .12, on ? .11 : .07, INK, .8, {ground: true});
    d.orb(px, pz, .13, on ? .08 : .045, on ? P.main : P.deep, 1, {glow: on && T.r >= 2});
  }
  const dragon = p.gdDragon > time ? clamp01((p.gdDragon-time)/.4)*clamp01(1-(p.gdDragon-time-4.1)/.4) : 0;
  if(dragon > 0){
    // The dragon's body spirals up round the wielder, its head at the top looking along the line.
    const pts = [], n = 28;
    for(let i = 0; i <= n; i++){const t = i/n, a = clock*2.4+t*TAU*1.6; pts.push([x+Math.cos(a)*(.9-.25*t), .2+t*2.1, z+Math.sin(a)*(.9-.25*t)*.7]);}
    d.path(pts, .3, INK, .8*dragon, {taper: .2});
    d.path(pts, .22, P.main, dragon, {taper: .2});
    d.path(pts, .08, P.alt, dragon, {taper: .3});
    const hx = pts[n][0], hy = pts[n][1], hz = pts[n][2];
    d.orb(hx, hz, hy, .26, INK, .9*dragon); d.orb(hx, hz, hy, .2, P.main, dragon); d.orb(hx+.08, hz, hy+.05, .05, P.alt, dragon, {glow: true});
    d.pool(x, z, 1.4, P.glow, .3*dragon);
    d.light(x, z, 2.4*dragon);
  }
  return {};
}

export const GUANDAO_EVENTS = {
  gdcut: {life: () => .3, kick: ev => (ev.stage || 0) >= 3 ? {shake: .08+tier(ev.rank).shake*.4} : null, paint(d, ev, age){
    if(ev.parried) d.ring(ev.x, ev.z, .8+age*6, .06, P.alt, fade(age/.3), {glow: true});
  }},
  gdecho: {life: () => .3, kick: ev => tier(ev.rank).r >= 4 ? {shake: .12} : null, paint(){}},
  'fx:dragonwake': {life: () => 1, kick: ev => ({shake: .15+tier(ev.rank).shake*.5, flash: tier(ev.rank).flash*.6, color: '#d8ffe8'}), paint(d, ev, age, seed){
    const k = age/1, T = tier(ev.rank);
    d.shock(ev.x, ev.z, .5+2.6*easeOut(k), .1, P.main, fade(k), P.core);
    d.pool(ev.x, ev.z, 2, P.glow, .4*fade(k));
    if(T.r >= 3) d.sigil(ev.x, ev.z, 1.6, P.main, fade(k, 1.2), {spin: age*3, sides: 8, glow: T.r >= 4});
    d.sparks(ev.x, ev.z, .8, 10+T.sparks, age, P.alt, fade(k), seed, {up: 5, speed: 3});
  }},
  'fx:dragonrush': {life: () => .9, kick: ev => ({shake: .25+tier(ev.rank).shake*.6, flash: tier(ev.rank).flash, color: '#d8ffe8'}), paint(d, ev, age, seed){
    const k = age/.9, T = tier(ev.rank), ca = Math.cos(ev.angle || 0), sa = Math.sin(ev.angle || 0), len = ev.len || 12, head = easeOut(k/.45)*len;
    const x0 = ev.x0 ?? ev.x, z0 = ev.z0 ?? ev.z, pts = [];
    // The dragon's body undulating along the line, its head racing ahead, its tail fading behind.
    for(let i = 0; i <= 26; i++){const t = i/26, u = head*t, wave = Math.sin(t*9-age*14)*.45*(1-t*.5); pts.push([x0+ca*u-sa*wave, .9+.3*Math.sin(t*6-age*10), z0+sa*u+ca*wave]);}
    const f = fade(Math.max(0, k-.45)/.55);
    d.path(pts, (ev.w || 1.9)*.7, P.glow, .35*f, {glow: true, soft: true, taper: .1});
    d.path(pts, .6, INK, .85*f, {taper: .2}); d.path(pts, .46, P.main, f, {taper: .2}); d.path(pts, .14, P.alt, f, {taper: .3});
    const h = pts[26];
    d.orb(h[0], h[2], h[1], .5, INK, .9*f); d.orb(h[0], h[2], h[1], .42, P.main, f); d.orb(h[0]+ca*.25, h[2]+sa*.25, h[1]+.1, .1, P.alt, f, {glow: true});
    if(T.r >= 3) d.groundRays(h[0], h[2], 8, .4, 1.8, .1, P.main, .6*f, seed, 0);
    d.light(h[0], h[2], 3*f);
  }},
};

export const GUANDAO_FX = {
  id: PACK,
  events: GUANDAO_EVENTS,
  lists: {magicSweeps: (d, s, owner, ctx) => paintCrescent(d, s, owner, ctx.lead)},
  rig: (d, world, p, anchor, motion, clock, time) => ({keep: paintLine(d, world, p, anchor, motion, clock, time)}),
};
