// The Reaper's scythe, drawn. Presentation only: the host owns Doom, the reaping and the souls
// (src/reaper.mjs). The shade of Death floats behind the wielder (a rig): a hooded robe with a tattered hem,
// a skull in the dark of the cowl, bony hands on a long snath whose hooked blade looms over the wielder, and
// the souls it has taken circling its hood as little comets. It grows with every soul. Each swing is its scythe sweeping round; Doom shows as tally hooks over a foe, and a foe
// that can be reaped has its soul already leaning out of it, eyes red.
//
// Rank ladder: ★1 the shade, the sweep, marks and souls; ★2 glowing eyes and souls, a halo under the
// shade, a lit edge on the sweep; ★3 tattered hem streamers, sparks, a blood moon on Last Harvest; ★4 a
// sigil under a full shade, an afterimage of the sweep, camera kick; ★5 blood-red eyes and blade edge at
// five souls, a flash on the great reap.
import {INK, TAU, at, bump, clamp01, easeIn, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {DOOM, doomOf, reapable} from '../reaper.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'scythe';
const P = hue(PACK);
const CLOAK = '#1f2e30', CLOAK_LIGHT = '#34494b', VOID = '#040808', BONE = '#ddd5c2', BLADE = '#e2faf2', BLOOD = '#ff3c4c', SOUL = '#e8fff8';
const INKD = '#0b1515', SLEEVE = '#26393b', STEEL = '#b4cbc5', STEEL_DARK = '#5f7874', WOOD = '#3d3036', WOOD_LIGHT = '#6a5560';
const rankOfOwner = p => p && typeof p === 'object' ? rankOf(p, PACK) : 1;

// ------------------------------------------------------------------ pieces
/** A soul: round head, a tail wavering off toward (tu, tv), two eyes. Painted; `red` for a doomed one. */
function soul(d, x, z, y, r, alpha, {tu = 0, tv = -1, phase = 0, red = false} = {}){
  if(!(alpha > .02) || !(r > .01)) return;
  const nu = -tv, nv = tu, body = [], ink = [];
  for(let i = 0; i <= 10; i++){
    const a = -Math.PI/2+i/10*Math.PI, c = Math.cos(a), s = Math.sin(a);
    body.push(at(x, z, y, (-tu*c+nu*s)*r, (-tv*c+nv*s)*r));
    ink.push(at(x, z, y, (-tu*c+nu*s)*(r+.035), (-tv*c+nv*s)*(r+.035)));
  }
  for(let k = 1; k <= 5; k++){
    const t = k/5, wob = Math.sin(phase*8+t*5)*r*.4*t, w = r*(1-t), L = r*2.6*t;
    body.push(at(x, z, y, tu*L+nu*wob-nu*w*.2, tv*L+nv*wob-nv*w*.2));
    ink.push(at(x, z, y, tu*(L+.04)+nu*wob-nu*w*.2, tv*(L+.04)+nv*wob-nv*w*.2));
  }
  d.path(ink, 0, INKD, alpha*.85, {fill: true});
  d.path(body, 0, SOUL, alpha, {fill: true});
  for(const s of [-1, 1]){const e = at(x, z, y, nu*s*r*.34-tu*r*.1, nv*s*r*.34-tv*r*.1+r*.08); d.orb(e[0], e[2], e[1], r*.16, red ? BLOOD : INKD, alpha);}
}

/** A strip between two matched edges, filled as a ribbon so a concave side stays clean. */
const ribbon = (left, right) => [...left, ...right.slice().reverse()];
/** A shape that is star-shaped round its centre `c`, filled as a fan from the centre. */
const blob = (c, ring) => [c, ...ring, ring[0]];

/**
 * The scythe blade, billboard space: it leaves the snath at `heel` heading along `dir` (radians), then
 * curls down to its point. Returns the thick back and the concave cutting edge, matched point for point.
 */
function bladeShape(heel, dir, len, width, turn){
  const back = [], edge = [], n = 16, step = len/n;
  let x = heel[0], y = heel[1], a = dir;
  for(let i = 0; i <= n; i++){
    const t = i/n, w = width*(1-t)**.7*(.82+.18*Math.min(1, t*6)), nx = -Math.sin(a), ny = Math.cos(a);
    back.push([x+nx*w*.32, y+ny*w*.32]); edge.push([x-nx*w*.68, y-ny*w*.68]);
    a -= turn*(.35+1.3*t*t)/n/.78; x += Math.cos(a)*step; y += Math.sin(a)*step;
  }
  return {back, edge};
}

/**
 * The shade of Death at (x, z), floating on y0, size `s`: a hooded robe that ripples and tatters, a skull in
 * the dark of the hood, bony hands on a long snath and a hooked blade looming forward over the wielder.
 * `raise` 0..1 lifts the scythe back over its head, `hide` 0..1 hides the scythe (while a sweep draws it),
 * `blood` turns its eyes and edge red.
 */
function shade(d, x, z, y0, s, {raise = 0, hide = 0, blood = 0, T = tier(1), clock = 0, seed = 0, side = 1, drift = 0} = {}){
  const q = (u, v) => at(x, z, y0, u*s*side, v*s), Q = ([u, v]) => q(u, v);
  const sway = t => drift*.16*t*t+Math.sin(clock*2.1+seed+t*2.4)*.035*t;
  // The robe: shoulders under the hood, a waist, a hem that flares and drifts behind the way you move.
  const backEdge = [], frontEdge = [], spine = [];
  for(let i = 0; i <= 9; i++){
    const t = i/9, v = lerp(1.52, .14, t), u = sway(t)-.03-.05*Math.sin(Math.PI*t)*t, hw = .13+.11*Math.min(1, t*5)**.6+.24*t**2.2-.02*Math.sin(Math.PI*t);
    spine.push([u, v]); backEdge.push([u-hw, v]); frontEdge.push([u+hw*.94, v]);
  }
  const hemB = backEdge[9], hemF = frontEdge[9];
  // Tattered hem: torn points hanging under it, each swaying on its own.
  const tatters = [];
  for(let i = 0; i < 6; i++){
    const a = i/6, b = (i+1)/6, m = (a+b)/2, drop = .13+.09*((i*7+3)%4)/3;
    const lu = lerp(hemB[0], hemF[0], a), ru = lerp(hemB[0], hemF[0], b), mu = lerp(hemB[0], hemF[0], m)-drift*.08+Math.sin(clock*3+i*1.7+seed)*.035;
    tatters.push([[lu, hemB[1]+.02], [ru, hemB[1]+.02], [mu, hemB[1]-drop]]);
  }
  for(const tri of tatters) d.path(tri.map(([u, v]) => q(u+(u-tri[2][0])*.18, v+(v === tri[2][1] ? -.04 : .02))), 0, INKD, 1, {fill: true});
  d.path(ribbon(backEdge.map(([u, v]) => q(u-.04, v+.02)), frontEdge.map(([u, v]) => q(u+.04, v+.02))), 0, INKD, 1, {fill: 'ribbon'});
  d.path(ribbon(backEdge.map(Q), frontEdge.map(Q)), 0, CLOAK, 1, {fill: 'ribbon'});
  for(const tri of tatters) d.path(tri.map(Q), 0, CLOAK, 1, {fill: true});
  // Light on the side it faces, and folds falling from the waist.
  d.path(ribbon(spine.map(([u, v], i) => q(u+.06+.04*i/9, v)), frontEdge.map(([u, v]) => q(u-.035, v))), 0, CLOAK_LIGHT, .8, {fill: 'ribbon'});
  for(const f of [-.13, .02]){
    const line = spine.slice(3).map(([u, v], i) => q(u+f*(1+i*.18)+Math.sin(clock*2+i+f*9)*.01, v));
    d.path(line, .03*s, INKD, .45, {taper: .6});
  }
  d.path([...backEdge.map(Q), ...frontEdge.slice().reverse().map(Q)], .025*s, P.glow, .45);
  // ★3: streamers torn off the hem, trailing away from the way you move.
  if(T.rays) for(let i = 0; i < 3; i++){
    const u0 = lerp(hemB[0], hemF[0], .2+i*.3), line = [];
    for(let k = 0; k <= 4; k++){const t = k/4; line.push(q(u0-drift*.5*t-.15*t+Math.sin(clock*4+i*2+t*3)*.08*t, hemB[1]-.05-t*.18+Math.sin(clock*3+i)*.05*t));}
    d.path(line, .07*s, CLOAK, .9, {taper: .9});
  }

  // The scythe: a long, slightly bowed snath, two grips, the blade hooked forward off its top.
  const ang = lerp(Math.PI/2+.13, Math.PI/2+.8, raise), base = [lerp(.4, .34, raise), lerp(.24, .5, raise)], len = 2.4;
  const dir = [Math.cos(ang), Math.sin(ang)], perp = [dir[1], -dir[0]];
  const shaftAt = (t, bow = .05) => [base[0]+dir[0]*len*t+perp[0]*Math.sin(Math.PI*t)*bow, base[1]+dir[1]*len*t+perp[1]*Math.sin(Math.PI*t)*bow];
  const shaft = []; for(let i = 0; i <= 8; i++) shaft.push(shaftAt(i/8));
  const handHi = shaftAt(.62), handLo = shaftAt(.4), alpha = 1-hide;
  const sleeve = (from, to, w0, w1, sag) => {
    const left = [], right = [];
    for(let i = 0; i <= 6; i++){
      const t = i/6, mx = (from[0]+to[0])/2, my = (from[1]+to[1])/2-sag;
      const px = (1-t)**2*from[0]+2*(1-t)*t*mx+t*t*to[0], py = (1-t)**2*from[1]+2*(1-t)*t*my+t*t*to[1];
      const tx = 2*(1-t)*(mx-from[0])+2*t*(to[0]-mx), ty = 2*(1-t)*(my-from[1])+2*t*(to[1]-my), l = Math.hypot(tx, ty) || 1, w = lerp(w0, w1, t*t);
      left.push([px-ty/l*w, py+tx/l*w]); right.push([px+ty/l*w, py-tx/l*w]);
    }
    d.path(ribbon(left.map(([u, v]) => q(u, v)), right.map(([u, v]) => q(u, v))), .05*s, INKD, 1);
    d.path(ribbon(left.map(Q), right.map(Q)), 0, SLEEVE, 1, {fill: 'ribbon'});
    d.path(left.slice(1).map(Q), .025*s, CLOAK_LIGHT, .9);
    d.path([Q(left[6]), Q(right[6])], .045*s, INKD, .9);
  };
  // The far arm reaches across the body to the high grip before the snath is drawn over it.
  sleeve([-.08, 1.36], [handHi[0]-.05, handHi[1]-.04], .07, .1, .02);
  if(hide < .98){
    const sp = shaft.map(Q);
    d.path(sp, .13*s, INKD, alpha);
    d.path(sp, .075*s, WOOD, alpha);
    d.path(shaft.slice(1, 8).map(([u, v]) => q(u-perp[0]*.012, v-perp[1]*.012)), .02*s, WOOD_LIGHT, alpha*.9);
    // The blade, mounted just under the snath's tip.
    const heel = shaftAt(.955, 0), turn = 1.45, bl = bladeShape(heel, ang-Math.PI/2+.12, 1.08, .24, turn);
    const outline = [...bl.back, ...bl.edge.slice().reverse()].map(Q);
    d.path([...outline, outline[0]], .07*s, INKD, alpha);
    d.path(ribbon(bl.back.map(Q), bl.edge.map(Q)), 0, STEEL, alpha, {fill: 'ribbon'});
    const bevel = bl.back.map(([u, v], i) => [lerp(u, bl.edge[i][0], .55), lerp(v, bl.edge[i][1], .55)]);
    d.path(ribbon(bevel.map(Q), bl.edge.map(Q)), 0, BLADE, alpha, {fill: 'ribbon'});
    d.path(bl.back.slice(0, 15).map(Q), .022*s, STEEL_DARK, alpha*.9);
    const red = blood > .5 && T.prism;
    d.path(bl.edge.slice(1).map(Q), .03*s, red ? BLOOD : P.main, alpha, {glow: T.glow, taper: .7});
    // Collar where the blade meets the snath, and the snath's capped end above it.
    const tip = shaftAt(1, 0), cap = q(...tip), collar = q(...heel);
    d.orb(collar[0], collar[2], collar[1], .07*s, INKD, alpha); d.orb(collar[0], collar[2], collar[1], .045*s, STEEL_DARK, alpha);
    d.orb(cap[0], cap[2], cap[1], .05*s, INKD, alpha); d.orb(cap[0], cap[2], cap[1], .03*s, BONE, alpha);
    // The lower grip, sticking out from the snath.
    const g0 = shaftAt(.4), g1 = [g0[0]+perp[0]*.17+dir[0]*.04, g0[1]+perp[1]*.17+dir[1]*.04];
    d.path([Q(g0), Q(g1)], .1*s, INKD, alpha); d.path([Q(g0), Q(g1)], .055*s, WOOD_LIGHT, alpha);
  }
  // The near arm, down to the lower grip, and both bony hands closed round the wood.
  sleeve([.17, 1.34], [handLo[0]+perp[0]*.12, handLo[1]+perp[1]*.12-.02], .08, .12, .1);
  for(const [h, k] of [[handHi, 0], [[handLo[0]+perp[0]*.15, handLo[1]+perp[1]*.15], 1]]){
    const c = Q(h);
    d.orb(c[0], c[2], c[1], .085*s, INKD, 1);
    d.orb(c[0], c[2], c[1], .062*s, BONE, 1);
    for(const f of [-.035, 0, .035]){
      const a = Q([h[0]+dir[0]*f-perp[0]*.05, h[1]+dir[1]*f-perp[1]*.05]), b = Q([h[0]+dir[0]*f+perp[0]*(k ? -.02 : .05), h[1]+dir[1]*f+perp[1]*(k ? -.02 : .05)]);
      d.path([a, b], .028*s, BONE, 1);
    }
  }

  // The hood: a deep cowl with a peak falling back, dark inside, a skull looking out of the dark.
  const hc = [-.01, 1.66], hood = [], ink = [];
  for(let i = 0; i < 20; i++){
    const a = -Math.PI/2+i/20*TAU, c = Math.cos(a), sn = Math.sin(a);
    const peak = Math.max(0, Math.cos(a-2.15))**6, r = 1+.32*peak, w = .25*(c < 0 ? 1.04 : 1), h = .27;
    hood.push([hc[0]+c*w*r-.04*peak, hc[1]+sn*h*r+(sn < -.3 ? .03 : 0)]);
  }
  for(const [u, v] of hood) ink.push(q(hc[0]+(u-hc[0])*1.14, hc[1]+(v-hc[1])*1.1));
  d.path(blob(q(...hc), ink), 0, INKD, 1, {fill: true});
  d.path(blob(q(...hc), hood.map(Q)), 0, CLOAK, 1, {fill: true});
  d.path(hood.slice(15, 20).concat(hood.slice(0, 3)).map(([u, v]) => q(u-.01, v)), .035*s, CLOAK_LIGHT, .9);
  const fc = [.07, 1.61], face = [];
  for(let i = 0; i < 14; i++){const a = i/14*TAU; face.push(q(fc[0]+Math.cos(a)*.15, fc[1]+Math.sin(a)*(Math.sin(a) > 0 ? .17 : .15)));}
  d.path(blob(q(...fc), face), 0, VOID, 1, {fill: true});
  // The skull: a pale dome, the jaw narrower, sockets and a nose in shadow, a row of teeth.
  const sc = [.095, 1.585], skull = [];
  for(let i = 0; i < 16; i++){const a = i/16*TAU, sn = Math.sin(a); skull.push(q(sc[0]+Math.cos(a)*.1*(sn < 0 ? .78 : 1), sc[1]+sn*(sn < 0 ? .11 : .1)));}
  d.path(blob(q(...sc), skull), 0, BONE, 1, {fill: true});
  const lid = []; for(let i = 0; i <= 8; i++){const a = Math.PI*(.05+.9*i/8); lid.push(q(sc[0]+Math.cos(a)*.115, sc[1]+.02+Math.sin(a)*.1));}
  d.path(lid, .05*s, VOID, .85);
  const eye = blood > .5 ? BLOOD : P.main, flick = .85+.15*Math.sin(clock*7+seed);
  for(const u of [-.04, .04]){
    const e = q(sc[0]+u, sc[1]+.005);
    d.orb(e[0], e[2], e[1], .034*s, VOID, 1);
    d.orb(e[0], e[2], e[1], .016*s, eye, flick);
    if(T.glow) d.bloom(e[0], e[2], e[1], .09*s, blood > .5 ? BLOOD : P.glow, .6*flick);
  }
  const nose = q(sc[0], sc[1]-.045); d.orb(nose[0], nose[2], nose[1], .012*s, VOID, .9);
  d.path([q(sc[0]-.045, sc[1]-.078), q(sc[0]+.045, sc[1]-.078)], .012*s, VOID, .7);
  for(const u of [-.022, 0, .022]) d.path([q(sc[0]+u, sc[1]-.064), q(sc[0]+u, sc[1]-.092)], .008*s, VOID, .7);
}

// ------------------------------------------------------------------ the rig: Death behind you
function paintShade(d, world, p, anchor, motion, clock, time){
  const T = tier(rankOfOwner(p)), r = p.reaper, souls = Math.min(DOOM.souls, r?.souls || 0);
  const side = p.dx < -.1 ? -1 : 1, seed = (String(p.id).charCodeAt(0) || 3)*.6;
  const castAge = p.magicCast?.itemId === PACK ? time-p.magicCast.at : 99;
  const skillAge = p.skillCast?.itemId === PACK ? time-p.skillCast.at : 99;
  const step = skillAge >= 0 && skillAge < 1.6 ? bump(skillAge/1.6) : 0;
  const s = (.95+.07*souls)*(1+.4*step), full = souls >= DOOM.souls;
  const x = anchor.x-side*(.8+.35*step), z = anchor.z-.45+.1*step, y = .3+.1*Math.sin(clock*1.8+seed);
  // The scythe is lifted for the swing, then the sweep draws it; it comes back after.
  const swing = castAge >= 0 && castAge < .5, raise = swing ? (castAge < .08 ? easeOut(castAge/.08) : 0) : skillAge < .75 ? easeOut(skillAge/.3) : 0;
  const hide = swing && castAge >= .08 ? 1-clamp01((castAge-.3)/.2) : skillAge >= .75 && skillAge < 1.1 ? 1 : 0;
  d.stain(x, z, .55*s, INKD, .35);
  if(T.glow) d.pool(x, z, .8*s, full && T.prism ? '#8a1020' : P.glow, .25+.05*souls);
  if(T.sigil && full) d.sigil(x, z, .9*s, P.main, .55, {spin: -clock, sides: 5, glow: T.prism});
  const fronts = [], backs = [];
  for(let i = 0; i < souls; i++){const a = clock*1.6+i*TAU/souls; (Math.sin(a) > 0 ? fronts : backs).push(a);}
  // Its souls circle the hood as little comets, tails trailing along the orbit; the ones behind it are
  // painted first and without glow (the glow layer draws over everything).
  const red = full && T.prism;
  const comet = (a, lit) => {
    const spot = b => [x+Math.cos(b)*.48*s, y+(1.72+Math.sin(b*2+seed)*.05)*s+Math.sin(b)*.07*s, z+Math.sin(b)*.22*s];
    const head = spot(a), tail = [];
    for(let k = 0; k <= 6; k++){const p = spot(a-k*.13); tail.push([p[0], p[1]+Math.sin(clock*6+k)*.012*k, p[2]]);}
    d.path(tail, .11*s, INKD, .5, {taper: 1});
    d.path(tail, .075*s, red ? '#ff9aa2' : SOUL, .85, {taper: 1, glow: T.glow && lit});
    d.orb(head[0], head[2], head[1], .065*s, INKD, .8);
    d.orb(head[0], head[2], head[1], .048*s, red ? '#ffd2d6' : SOUL, 1);
    if(T.glow && lit) d.bloom(head[0], head[2], head[1], .16*s, red ? BLOOD : P.glow, .5);
  };
  for(const a of backs) comet(a, false);
  shade(d, x, z, y, s, {raise, hide, blood: full ? 1 : 0, T, clock, seed, side, drift: Math.max(-1, Math.min(1, motion.vx*.25))*side});
  for(const a of fronts) comet(a, true);
  if(T.glow && souls) d.light(x, z, .8+.25*souls);
  return {origin: {x, y: 0, z}};
}

// ------------------------------------------------------------------ Doom on foes
/** Tally hooks over a doomed foe; a foe that can be reaped has its soul leaning out of it. */
function paintDoom(d, e, ctx){
  if(!e.doom || !(e.hp > 0) || !d.near(e.x, e.z)) return;
  const owner = ctx.player(e.doom.by);
  const n = doomOf(e, e.doom.by, ctx.time);
  if(!n) return;
  const T = tier(rankOfOwner(owner)), big = e.type === 'king' ? 1.2 : e.type === 'golem' || e.type === 'brute' ? .6 : 0;
  const top = 1.55+big, left = (DOOM.life-(ctx.time-e.doom.at))/DOOM.life, blink = left < .2 ? .5+.5*Math.sin(ctx.clock*18) : 1;
  for(let i = 0; i < n; i++){
    const u = (i-(n-1)/2)*.2, hook = [at(e.x, e.z, top, u-.05, .14), at(e.x, e.z, top, u+.05, .1), at(e.x, e.z, top, u+.07, 0), at(e.x, e.z, top, u+.02, -.12)];
    d.path(hook, .09, INKD, .9*blink);
    d.path(hook, .05, n >= DOOM.max ? P.alt : P.main, blink, {glow: T.glow});
  }
  if(reapable(e, e.doom.by, ctx.time)){
    const sway = Math.sin(ctx.clock*3+e.x)*.12, rise = .95+.1*Math.sin(ctx.clock*5);
    d.mark(e.x, e.z, .55+big*.4+.05*Math.sin(ctx.clock*8), .05, BLOOD, .9, {halo: T.glow ? .5 : 0});
    soul(d, e.x+sway, e.z+.05, rise+big*.5, .17, .95, {tu: -sway, tv: -1, phase: ctx.clock, red: true});
    if(T.glow) d.bloom(e.x+sway, e.z, rise+big*.5, .4, BLOOD, .35);
  }
}

// ------------------------------------------------------------------ the sweep, the reaping
/** The swing: Death's scythe sweeping the arc, blade leading, a painted wake behind it. */
function sweep(d, ev, age, seed, {r = ev.range || 3.9, arc = (ev.arc || 240)*Math.PI/180, dur = .2, life = .5, y = .6, big = false} = {}){
  const T = tier(ev.rank), k = age/life, face = Math.atan2(ev.dz || 0, ev.dx || 1), blood = (ev.souls || 0) >= DOOM.souls || ev.reaped > 0;
  if(k >= 1) return;
  const g = easeOut(age/dur), a0 = face-arc/2, head = a0+arc*g;
  d.crescent(ev.x, ev.z, y, r, face, arc, .9*(1-k*.4)*(big ? 1.4 : 1), CLOAK, .55*fade(k), {glow: false, grow: g});
  d.crescent(ev.x, ev.z, y+.01, r*.96, face, arc, .45*(1-k*.4)*(big ? 1.4 : 1), P.main, .85*fade(k), {glow: T.glow, grow: g});
  if(blood) d.crescent(ev.x, ev.z, y+.02, r*.99, face, arc, .15, BLOOD, fade(k), {glow: T.glow, grow: g});
  if(T.sigil) d.crescent(ev.x, ev.z, y, r*.8, face, arc, .3, P.glow, .35*fade(k), {glow: true, grow: clamp01(g-.15)});
  // The blade itself riding the head of the sweep.
  if(g < 1 || age < dur+.08){
    const hx = ev.x+Math.cos(head)*r*.92, hz = ev.z+Math.sin(head)*r*.92, tx = -Math.sin(head), tz = Math.cos(head);
    const L = (big ? 2 : 1.5), pts = [], inner = [];
    for(let i = 0; i <= 10; i++){
      const t = i/10, bend = Math.sin(t*Math.PI*.8)*.35*L, w = .18*L*Math.sin(Math.PI*Math.min(1, t*1.15))*(1-.5*t);
      const bx = hx-Math.cos(head)*t*L*.9-tx*bend, bz = hz-Math.sin(head)*t*L*.9-tz*bend;
      pts.push([bx+tx*w, y+.3, bz+tz*w]); inner.push([bx-tx*w*.3, y+.3, bz-tz*w*.3]);
    }
    const shape = [...pts, ...inner.reverse()];
    d.path([...shape, shape[0]], .08, INKD, 1);
    d.path(shape, 0, BLADE, 1, {fill: true});
    d.path(pts, .05, blood && T.prism ? BLOOD : P.main, 1, {glow: T.glow});
  }
  if(T.rays) d.sparks(ev.x+Math.cos(head)*r, ev.z+Math.sin(head)*r, y+.2, T.sparks>>1, age, P.core, 1, seed, {speed: 3, up: 1.5, gravity: 6, life: .35, dir: head+Math.PI/2, spread: 1.2});
}

/** A soul ripped out of a reaped foe, flying to the wielder, and a red cut across where it stood. */
function reaped(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.7;
  if(k >= 1) return;
  for(const s of [-1, 1]){
    const q = clamp01(age/.12), a = at(ev.x, ev.z, .9, -.45*s, .5), b = at(ev.x, ev.z, .9, .45*s, -.4);
    const m = [lerp(a[0], b[0], q), lerp(a[1], b[1], q), lerp(a[2], b[2], q)];
    d.path([a, m], .16*fade(k), INKD, .8);
    d.path([a, m], .09*fade(k), BLOOD, 1, {glow: T.glow});
  }
  d.mark(ev.x, ev.z, .4+.8*easeOut(k/.4), .06, BLOOD, fade(k), {halo: T.glow ? .5 : 0});
  const f = easeIn(clamp01((age-.08)/.5)), tx = ev.tx ?? ev.x, tz = ev.tz ?? ev.z;
  const x = lerp(ev.x, tx, f), z = lerp(ev.z, tz, f), y = 1+Math.sin(Math.PI*f)*1.2;
  const dx = tx-ev.x, dz = tz-ev.z, l = Math.hypot(dx, dz) || 1;
  if(f < 1) soul(d, x, z, y, .2*(1-.3*f), 1, {tu: -dx/l, tv: -.3, phase: age*3, red: f < .3});
  if(T.glow && f < 1) d.bloom(x, z, y, .5, P.glow, .5);
  if(T.rays) d.sparks(ev.x, ev.z, .9, T.sparks, age, BLOOD, 1, seed, {speed: 3.5, up: 3, gravity: 8, life: .5});
  if(T.debris) d.debris(ev.x, ev.z, 4, age, INKD, seed, {speed: 2.5, up: 3, size: .07, life: .5});
}

/** Last Harvest, the marking: a hook of light drops onto every foe in reach. */
function marked(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.6;
  if(k >= 1) return;
  d.shock(ev.x, ev.z, .5+(ev.r || 6)*easeOut(k), .08, P.main, fade(k), P.core);
  for(const [px, pz] of ev.pts || []){
    const drop = easeOut(clamp01(age/.25)), y = 3-1.4*drop;
    d.path([[px, y+.5, pz], [px, y, pz]], .12*fade(k), P.alt, fade(k), {glow: T.glow, taper: .5});
    d.mark(px, pz, .5*drop, .05, P.main, fade(k));
  }
}

/** Last Harvest, the great reap: a full circle of Death's scythe; every reaped soul comes home. */
function greatReap(d, ev, age, seed){
  const T = tier(ev.rank), R = ev.r || 6, k = age/1.2;
  if(k >= 1) return;
  sweep(d, {...ev, dx: 1, dz: 0, souls: DOOM.souls, reaped: (ev.pts || []).length}, age, seed, {r: R, arc: TAU, dur: .3, life: .75, y: .7, big: true});
  if(T.rays){const m = bump(age/1.2); d.bloom(ev.x, ev.z, 4.5, 1.6, BLOOD, .5*m); d.orb(ev.x, ev.z, 4.5, .8, '#ff8a7a', .85*m, {glow: true});}
  if(T.pillar && age < .5) d.shock(ev.x, ev.z, R*easeOut(age/.5), .12, BLOOD, fade(age/.5), P.core);
  for(const [i, [px, pz]] of (ev.pts || []).entries()) reaped(d, {...ev, x: px, z: pz, tx: ev.x, tz: ev.z}, Math.max(0, age-.12-i*.03), seed+i);
  d.light(ev.x, ev.z, 5*fade(k));
}

function skillCast(d, cast, owner, age){
  const T = tier(rankOfOwner(owner)), k = age/.8;
  if(k >= 1) return;
  d.stain(cast.x, cast.z, 1.6*easeOut(k/.3), INKD, .5*fade(k));
  if(T.rays) d.sigil(cast.x, cast.z, 1.6, P.main, fade(k, 1.2)*easeOut(age/.1), {spin: -age*3, sides: 5, glow: T.sigil});
}

const kick = (shake, flash = 0, base = 0) => ev => {const T = tier(ev.rank); return {shake: base+T.shake*shake, flash: T.flash*flash, color: BLOOD};};

export const REAPER_EVENTS = {
  reaperswing: {life: () => .5, paint(d, ev, age, seed){sweep(d, ev, age, seed);}, kick: ev => ev.reaped ? kick(.4, 0, .06)(ev) : null},
  soulreap: {life: () => .7, paint(d, ev, age, seed){reaped(d, ev, age, seed);}},
  'fx:deathmark': {life: () => .6, paint(d, ev, age, seed){marked(d, ev, age, seed);}},
  'fx:deathreap': {life: () => 1.2, paint(d, ev, age, seed){greatReap(d, ev, age, seed);}, kick: kick(1.2, 1, .22)},
};

/** src/fx/index.mjs WEAPON_FX entry. */
export const REAPER_FX = {
  id: PACK,
  events: REAPER_EVENTS,
  foes: (d, e, ctx) => paintDoom(d, e, ctx),
  skillCast: (d, cast, owner, age) => skillCast(d, cast, owner, age),
  rig: (d, world, p, anchor, motion, clock, time) => paintShade(d, world, p, anchor, motion, clock, time),
};
