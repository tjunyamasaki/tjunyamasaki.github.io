// Thornmother's Heart, drawn: the briar heart beating at the wielder's hand (a rig, there whenever it is
// equipped), the vines it throws (they whip out, lie on the ground in thorns and wither), the blooms where
// vines cross, and Heartbloom. Presentation only: the host owns vines and blooms (magic/thornheart.mjs).
// Rank ladder: ★1 the heart, plain vines and a burst of thorns; ★2 a warm glow, sap light along the vines;
// ★3 red buds on the vines, petals in the blooms, rays; ★4 a ring of thorns round the heart, a sigil under
// each bloom, debris and a kick; ★5 the green spring colour through it all and a flash on the heart bloom.
import {INK, TAU, at, bump, clamp01, easeOut, fade, hue, rnd, tier} from './kit.mjs?v=harvest-18';
import {VINE} from '../magic/thornheart.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'thornheart';
const P = hue(PACK);
const BARK = '#4a3326', BARK_L = '#7a5236', LEAF = '#4f7a3a', HEART = '#c23a3a', HEART_D = '#7e1f2a', THORN = '#e8d9b8';

function blob(d, x, z, y, cu, cv, ru, rv, color, alpha, {glow = false, n = 12} = {}){
  const pts = [];
  for(let i = 0; i <= n; i++){const a = i/n*TAU; pts.push(at(x, z, y, cu+Math.cos(a)*ru, cv+Math.sin(a)*rv));}
  d.path(pts, 0, color, alpha, {fill: true, glow});
}
/** A heart shape in billboard space: two lobes and a point. */
function heartShape(d, x, z, y, r, color, alpha, {glow = false} = {}){
  const pts = [];
  for(let i = 0; i <= 28; i++){
    const t = i/28*TAU, hx = 16*Math.sin(t)**3, hy = 13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);
    pts.push(at(x, z, y, hx/17*r, hy/17*r));
  }
  d.path(pts, 0, color, alpha, {fill: true, glow});
  return pts;
}

// ------------------------------------------------------------------ the rig
export function paintHeartRig(d, world, p, anchor, motion, clock, time){
  const T = tier(rankOf(p, PACK)), now = time ?? world.time, side = p.dx < -.1 ? -1 : 1;
  const since = now-(p.thornBeat ?? -9), jump = since < .45 ? fade(since/.45, 1.4) : 0;
  const beat = Math.max(0, Math.sin(clock*7)*Math.sin(clock*7) - .6)*.35;
  const x = anchor.x+side*.55, z = anchor.z+.05, y = anchor.y+1.15+.06*Math.sin(clock*2.3);
  const r = .3*(1+beat+.35*jump)*(1+.04*(T.r-1));
  if(T.glow) d.bloom(x, z, y, r*2.6, P.glow, .25+.35*jump);
  // ★4 a slow ring of thorns round it.
  if(T.sigil) for(let i = 0; i < 7; i++){
    const a = clock*.9+i/7*TAU, q = at(x, z, y, Math.cos(a)*r*2, Math.sin(a)*r*1.1), o = at(x, z, y, Math.cos(a)*r*2.5, Math.sin(a)*r*1.4);
    d.path([q, o], .05, INK, .7); d.path([q, o], .025, THORN, .9);
  }
  heartShape(d, x, z, y, r+.04, INK, 1);
  heartShape(d, x, z, y, r, HEART, 1);
  blob(d, x, z, y, -r*.28, r*.25, r*.18, r*.12, '#f08a7a', .8, {n: 8});
  // Briar wound round it.
  for(let k = 0; k < 2; k++){
    const pts = [];
    for(let i = 0; i <= 14; i++){const t = i/14, a = t*TAU*1.2+k*2.1+clock*.4; pts.push(at(x, z, y, Math.cos(a)*r*.95, (t-.5)*r*1.6+Math.sin(a)*r*.2));}
    d.path(pts, .06, INK, .8); d.path(pts, .035, k ? LEAF : BARK_L, 1);
  }
  if(T.prism) blob(d, x, z, y, 0, -r*.1, r*.22, r*.22, P.alt, .45+.4*jump, {glow: true, n: 10});
  if(jump > .05 && T.glow) d.bloom(x, z, y, r*1.5, P.core, .5*jump);
  return {x, y: 0, z: z+.08};
}

// ------------------------------------------------------------------ vines
/** Points along a vine: a gentle S, extended to `grow` of its length. */
function vinePoints(v, grow, y = .09){
  const dx = v.x1-v.x0, dz = v.z1-v.z0, l = Math.hypot(dx, dz) || 1, nx = -dz/l, nz = dx/l, n = Math.max(8, Math.round(l*3)), pts = [];
  const amp = .22, ph = (v.seed || 0)*.013;
  for(let i = 0; i <= n; i++){
    const t = i/n*grow, w = Math.sin(t*l*1.3+ph)*amp*Math.sin(Math.PI*Math.min(1, t/grow || 0));
    pts.push([v.x0+dx*t+nx*w, y, v.z0+dz*t+nz*w]);
  }
  return pts;
}
export function paintVine(d, v, owner, ctx){
  if(!d.near((v.x0+v.x1)/2, (v.z0+v.z1)/2, 8)) return;
  const T = tier(rankOf(owner, PACK)), age = (v.age || 0)+ctx.lead;
  if(age < 0){
    // A skill vine still to come: a faint line of disturbed earth.
    d.path(vinePoints(v, 1, .06), .12, BARK, .25);
    return;
  }
  const grow = easeOut(age/.18), wither = clamp01((v.life-age)/.4), width = (v.skill ? .2 : .17)*(.35+.65*wither);
  const pts = vinePoints(v, grow);
  d.path(pts, width+.09, INK, .85*wither);
  d.path(pts, width, BARK, wither);
  d.path(pts, width*.42, BARK_L, .9*wither);
  if(T.glow) d.path(pts, width*2.2, T.prism ? P.alt : P.glow, .14*wither*(.7+.3*Math.sin(ctx.clock*4+v.seed)), {glow: true, soft: true});
  // Thorns along it, and red buds from ★3.
  const n = pts.length;
  for(let i = 2; i < n-1; i += 2){
    const [x, , z] = pts[i], [x2, , z2] = pts[i-1], tx = x-x2, tz = z-z2, l = Math.hypot(tx, tz) || 1, s = i%4 ? 1 : -1;
    const tip = [x-tz/l*s*.28, .3, z+tx/l*s*.28];
    d.path([[x, .1, z], tip], .07, INK, .8*wither); d.path([[x, .1, z], tip], .035, THORN, wither);
    if(T.rays && i%6 === 0) d.orb(x, z, .16, .08*wither, HEART, wither);
  }
  // The lash: a bright crack running out along the vine as it is thrown.
  if(age < .3 && !v.skill){
    const head = pts[Math.min(n-1, Math.floor(grow*(n-1)))];
    d.orb(head[0], head[2], .35, .18*(1-age/.3), P.core, 1, {glow: true});
  }
}

// ------------------------------------------------------------------ blooms
export function paintBloom(d, b, owner, ctx){
  if(!d.near(b.x, b.z, 4)) return;
  const T = tier(rankOf(owner, PACK)), age = (b.age || 0)+ctx.lead, r = b.radius || VINE.bloomRadius;
  if(age < b.at){
    // A bud swelling where the vines cross.
    const k = clamp01(age/Math.max(.05, b.at));
    d.orb(b.x, b.z, .04, r*.6*k, HEART_D, .3*k, {ground: true});
    blob(d, b.x, b.z, .25+.15*k, 0, 0, .14+.12*k+.05, .14+.12*k+.05, INK, 1, {n: 10});
    blob(d, b.x, b.z, .25+.15*k, 0, 0, .14+.12*k, .14+.12*k, HEART, 1, {n: 10});
    if(T.glow) d.bloom(b.x, b.z, .35, .5+.5*k, P.glow, .3*k);
    if(b.heart) d.ring(b.x, b.z, r*k, .06, HEART, .6*k, {glow: T.glow});
    return;
  }
  const t = clamp01((age-b.at)/VINE.bloomLife), out = easeOut(t*2.2), f = fade(t, 1.2), spikes = b.heart ? 18 : 10;
  if(T.sigil) d.sigil(b.x, b.z, r*.9, HEART, .55*f, {spin: age*.8, sides: b.heart ? 7 : 5});
  d.orb(b.x, b.z, .04, r*.9, HEART_D, .3*f, {ground: true});
  for(let i = 0; i < spikes; i++){
    const a = i/spikes*TAU+rnd(b.id?.length || 3, i)*.4, len = r*(.6+.5*rnd(9, i))*out, h = (.6+.8*rnd(11, i))*(b.heart ? 1.6 : 1)*bump(Math.min(1, t*1.6));
    const base = [b.x+Math.cos(a)*len*.25, .08, b.z+Math.sin(a)*len*.25], tip = [b.x+Math.cos(a)*len, h, b.z+Math.sin(a)*len];
    d.path([base, tip], .16, INK, .9*f, {taper: .9}); d.path([base, tip], .09, i%3 ? BARK_L : THORN, f, {taper: .9});
  }
  if(T.rays) for(let i = 0; i < (b.heart ? 14 : 7); i++){
    const a = rnd(21, i)*TAU, rr = r*out*(.4+.7*rnd(22, i)), y = .3+1.2*t*rnd(23, i);
    blob(d, b.x+Math.cos(a)*rr, b.z+Math.sin(a)*rr, y, 0, 0, .09, .05, i%2 ? HEART : '#f3a0a0', f, {n: 6});
  }
  d.ring(b.x, b.z, r*out, .09, T.prism ? P.alt : HEART, .85*f, {glow: T.glow});
  if(T.glow) d.bloom(b.x, b.z, .4, r*(.6+.4*out), P.glow, .45*f);
  if(T.debris) d.debris(b.x, b.z, b.heart ? 12 : 6, t, BARK, (b.id?.length || 5)+7);
  d.light(b.x, b.z, r*1.6*f);
}

export const THORN_EVENTS = {
  thornbloom: {life: ev => ev.heart ? .7 : .4, kick: ev => ev.heart ? {shake: .4, flash: ev.rank >= 5 ? .22 : 0, color: '#ffd6c8'} : (ev.rank >= 4 ? {shake: .12} : null),
    paint(d, ev, age, seed){const T = tier(ev.rank), t = age/(ev.heart ? .7 : .4); d.shock(ev.x, ev.z, (ev.radius || 2)*(.4+.8*easeOut(t)), .12, HEART, .7*fade(t), P.core); if(T.sparks) d.sparks(ev.x, ev.z, .4, Math.min(10, T.sparks), t, '#ffb59a', .9, seed);}},
  vinelash: {life: () => .25, paint(d, ev, age){const t = age/.25; d.streak([ev.x, .9, ev.z], [ev.tx ?? ev.x, .5, ev.tz ?? ev.z], .12*(1-t), P.core, .6*(1-t));}},
  'fx:heartbloom': {life: () => 1.3, kick: ev => ({shake: .25}), paint(d, ev, age){
    const t = age/1.3, r = (ev.ring || 5)*easeOut(t*1.6);
    d.ring(ev.x, ev.z, r, .1, HEART, .8*fade(t), {glow: true});
    d.pool(ev.x, ev.z, r*.8, P.glow, .3*fade(t));
  }},
};

export const THORNHEART_FX = {
  id: PACK,
  events: THORN_EVENTS,
  magicCast: false,
  lists: {magicSweeps: paintVine, magicPuffs: paintBloom},
  rig: (d, world, p, anchor, motion, clock, time) => ({origin: paintHeartRig(d, world, p, anchor, motion, clock, time)}),
};
