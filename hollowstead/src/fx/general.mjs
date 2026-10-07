// The Green Dragon General's skills, drawn (rules: src/classes/general.mjs). Every sweep is the guandao's own
// crescent (src/fx/guandao.mjs); this adds the lunge's jade streak, the flying Crescent Wave, the hook's
// chains, the roar's cone, Mountain Stance at the feet and the Dragon Pearl hanging at its mark. Jade over
// the ink outline, gold for the dragon. Rank (the blade's ★, grown with level) adds flourish (tier()).
import {INK, TAU, at, bump, clamp01, easeIn, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';

const P = hue('guandao');
const Y = .7;
const ribbonArc = (x, z, r, a0, a1, y = Y, n = 22) => Array.from({length: n+1}, (_, i) => {const a = lerp(a0, a1, i/n); return [x+Math.cos(a)*r, y, z+Math.sin(a)*r];});

function paintLunge(d, ev, age, seed){
  const T = tier(ev.rank);
  if(ev.start){const k = age/.4; if(k < 1) d.shock(ev.x, ev.z, .3+1.4*easeOut(k), .08, P.main, fade(k), P.core); return;}
  const k = age/.55;
  if(k >= 1 || !Number.isFinite(ev.x0)) return;
  const pts = [[ev.x0, Y, ev.z0], [ev.x, Y, ev.z]], f = fade(k, 1.2);
  if(T.glow) d.path(pts, .9*(1-k), P.glow, .4*f, {glow: true, soft: true, taper: .3});
  d.path(pts, .5*(1-k)+.08, INK, .8*f, {taper: .5});
  d.path(pts, .36*(1-k)+.05, P.main, f, {taper: .5});
  d.path(pts, .1, P.core, f, {taper: .4});
  d.shock(ev.x, ev.z, .4+1.5*easeOut(k), .08, P.main, f, P.core);
  if(T.r >= 3) d.sparks(ev.x, ev.z, Y, T.sparks, age, P.alt, f, seed, {speed: 4, up: 2, life: .4});
  // Pips for the line it stepped up.
  for(let i = 0; i < (ev.stage || 0); i++) d.orb(ev.x-.3+i*.3, ev.z+.5, .15, .09, P.alt, f, {glow: true});
}
/** Crescent Wave: a crescent of jade racing out along the line, bigger for every step it spent. */
function paintWave(d, ev, age, seed){
  const T = tier(ev.rank), life = .55, k = age/life;
  if(k >= 1) return;
  const ca = Math.cos(ev.angle || 0), sa = Math.sin(ev.angle || 0), len = ev.len || 6, u = easeOut(Math.min(1, age/.32))*len;
  const x = ev.x+ca*u, z = ev.z+sa*u, w = 1.6+.45*(ev.stage || 0), f = fade(Math.max(0, k-.5)/.5);
  if(!d.near(x, z, w+3)) return;
  const pts = ribbonArc(x-ca*w*.6, z-sa*w*.6, w, (ev.angle || 0)-1.1, (ev.angle || 0)+1.1, Y+.1);
  if(T.glow) d.path(pts, .9, P.glow, .45*f, {glow: true, soft: true, taper: .8});
  d.path(pts, .5, INK, .85*f, {taper: .85});
  d.path(pts, .36, (ev.stage || 0) >= 3 ? P.alt : P.main, f, {taper: .85});
  d.path(pts, .12, P.core, f, {taper: .8});
  // The ground it ran over, scored.
  d.path([[ev.x, .07, ev.z], [x, .07, z]], .25, P.deep, .4*fade(k), {taper: .3});
  if(T.r >= 3) d.sparks(x, z, Y, 4+T.r, age, P.alt, f, seed, {speed: 3, up: 1.5, life: .3});
  d.light(x, z, 2+(ev.stage || 0)*.5);
}
/** Reaping Hook: chains reel each foe out (or in) to the tip; the tip's arc glows. */
function paintHook(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.7;
  if(k >= 1) return;
  const f = fade(k, 1.2);
  if(Number.isFinite(ev.angle)) d.path(ribbonArc(ev.x, ev.z, ev.r || 3, ev.angle-1.4, ev.angle+1.4, .08), .12, P.alt, .8*f, {glow: T.glow});
  for(const [i, [fx, fz, tx, tz]] of (ev.threads || []).entries()){
    const reel = easeIn(clamp01(age/.35)), hx = lerp(fx, tx, reel), hz = lerp(fz, tz, reel), out = easeOut(age/.1);
    const ex = lerp(ev.x, hx, out), ez = lerp(ev.z, hz, out), pts = [];
    for(let j = 0; j <= 8; j++){const t = j/8; pts.push([lerp(ev.x, ex, t), Y-.2*Math.sin(Math.PI*t)+rnd(seed, i*9+j)*.03, lerp(ev.z, ez, t)]);}
    if(age < .45){d.path(pts, .12, INK, .8*f); d.path(pts, .06, '#c8d6cf', f);}
    d.ring(tx, tz, .35, .05, P.main, .8*fade(clamp01((age-.3)/.4)), {ink: .03});
  }
}
function paintRoar(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.7;
  if(k >= 1) return;
  const r = (ev.r || 4)*easeOut(k/.5), a = ev.angle || 0, f = fade(k);
  for(let i = 0; i < 3; i++){
    const rr = r*(1-i*.18);
    if(rr > .3) d.path(ribbonArc(ev.x, ev.z, rr, a-Math.PI/3, a+Math.PI/3, .1+i*.05), .14-.03*i, i ? P.glow : P.main, f*(1-i*.25), {glow: i > 0});
  }
  if(T.r >= 3) d.rays(ev.x, ev.z, 1, 7, (ev.r || 4)*.7, .08, P.alt, .6*f, seed, a);
}
function paintStance(d, ev, age){
  const k = age/.8;
  if(k >= 1) return;
  d.shock(ev.x, ev.z, .5+2.2*easeOut(k), .1, P.main, fade(k), P.core);
  d.debris(ev.x, ev.z, 8, age, '#6b5a4a', 3, {speed: 3, up: 4});
}
/** The pearl leaves the hand on an arc toward its mark. */
function paintPearlThrow(d, ev, age){
  const t = clamp01(age/.3);
  if(t >= 1) return;
  const x = lerp(ev.sx ?? ev.x, ev.x, t), z = lerp(ev.sz ?? ev.z, ev.z, t), y = 1+1.6*bump(t);
  pearl(d, x, z, y, .3, 1, 0);
}
function pearl(d, x, z, y, r, alpha, clock, T = tier(1)){
  if(T.glow) d.orb(x, z, y, r*2.2, P.glow, .3*alpha, {glow: true, soft: true});
  d.orb(x, z, y, r*1.15, INK, .9*alpha);
  d.orb(x, z, y, r, '#e9fff3', alpha);
  d.orb(x-r*.25, z, y+r*.25, r*.35, '#ffffff', alpha, {glow: true});
  d.ring(x, z, r*1.5+.05*Math.sin(clock*5), .04, P.alt, .6*alpha, {y: y-r});
}
function paintPearlBurst(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.8, R = ev.r || 2.5;
  if(k >= 1) return;
  d.pool(ev.x, ev.z, R, P.glow, .45*fade(k));
  d.shock(ev.x, ev.z, .5+R*easeOut(k), .12, P.main, fade(k), P.core);
  if(T.r >= 2) d.shock(ev.x, ev.z, .3+R*.7*easeOut(k/.7), .06, P.alt, fade(k), P.core);
  d.sparks(ev.x, ev.z, 1.2, 10+T.sparks, age, P.alt, fade(k), seed, {speed: 5, up: 4});
  if(T.r >= 4) d.sigil(ev.x, ev.z, R*.8, P.alt, .7*fade(k), {spin: age*3, sides: 8});
  d.light(ev.x, ev.z, R*1.5);
}

export const GENERAL_EVENTS = {
  genlunge: {life: ev => ev.start ? .4 : .55, paint: paintLunge, kick: ev => ev.end && ev.hits ? {shake: .1+tier(ev.rank).shake*.3} : null},
  genwave: {life: () => .55, paint: paintWave, kick: ev => ({shake: .1+.05*(ev.stage || 0)+tier(ev.rank).shake*.3})},
  genhook: {life: () => .7, paint: paintHook, kick: () => ({shake: .08})},
  genroar: {life: () => .7, paint: paintRoar, kick: ev => ({shake: .15+tier(ev.rank).shake*.4, flash: tier(ev.rank).flash*.5, color: '#d8ffe8'})},
  genstance: {life: () => .8, paint: paintStance, kick: () => ({shake: .2})},
  genpearl: {life: () => .3, paint: paintPearlThrow},
  genpearlburst: {life: () => .8, paint: paintPearlBurst, kick: ev => ({shake: .25+tier(ev.rank).shake*.5, flash: tier(ev.rank).flash*.7, color: '#e9fff3'})},
  genpearlfade: {life: () => .4, paint(d, ev, age){pearl(d, ev.x, ev.z, 1.1, .3*(1-age/.4), 1-age/.4, age);}},
};

/** What the General keeps on the field: the pearl hanging at its mark, and Mountain Stance at the feet. */
function paintGeneral(d, p, ctx){
  const g = p.general;
  if(!g) return;
  const T = tier(p.ranks?.guandao || 1), clock = ctx.clock, time = ctx.time;
  if(g.pearl && d.near(g.pearl.x, g.pearl.z, 3) && time-(g.pearl.at || 0) > .28){
    const left = (g.pearl.until || 0)-time;
    pearl(d, g.pearl.x, g.pearl.z, 1.1+.12*Math.sin(clock*3), .3, Math.min(1, left/.4), clock, T);
  }
  if((g.stanceUntil || 0) > time && d.near(p.x, p.z, 3)){
    const left = g.stanceUntil-time, a = Math.min(1, left/.5);
    d.ring(p.x, p.z, 1.1, .08, P.main, .8*a, {ink: .05});
    for(let i = 0; i < 3; i++){
      const ang = clock*.8+i*TAU/3, x = p.x+Math.cos(ang)*1.1, z = p.z+Math.sin(ang)*1.1;
      d.path([at(x, z, .08, -.18, 0), at(x, z, .08, 0, .35), at(x, z, .08, .18, 0)], 0, P.deep, .9*a, {fill: true});
      d.path([at(x, z, .08, -.18, 0), at(x, z, .08, 0, .35), at(x, z, .08, .18, 0)], .04, P.main, a);
    }
  }
}

export const GENERAL_FX = {id: 'general', events: GENERAL_EVENTS, player: paintGeneral};
