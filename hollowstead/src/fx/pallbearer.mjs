// The Pallbearer's Flail, drawn: the coffin on its chain (a rig, so it is there whenever the flail is
// equipped), its whirl, its blows, and Last Rites. The coffin's weight is the whole show: it scrapes
// and rattles at rest, lifts as it gathers speed, and leaves a ghostly whirl behind it.
// Rank ladder: ★1 the coffin, chain and a pale whirl smear; ★2 a glowing spirit whirl, dust where it
// scrapes, a lit impact; ★3 ghosts peel off the whirl, sparks and a ghost screams out of hard blows;
// ★4 afterimages of the coffin, sigils, debris, camera kick; ★5 the lid flies open at full whirl
// with a screaming soul streaming behind, pink souls in the whirl, a screen flash on the slam.
import {INK, TAU, at, bump, clamp01, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {FLAIL, RITE} from '../magic/pallbearer.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'pallbearer';
const P = hue(PACK);
const WOOD = '#5a3848', WOOD_LIGHT = '#7d5268', SIDE = '#34202b', IRON = '#8d89a6', IRON_LIGHT = '#cfcce2',
  BONE = '#efe6d2', HOLLOW = '#150c1a', GHOST = '#eef1ff', DUST = '#bfae9c';
/** The coffin's outline, head (chain end) at -u, foot at +u, w across. Convex, so it fills as a fan. */
const SHAPE = [[-.46, -.12], [-.22, -.25], [.46, -.15], [.46, .15], [-.22, .25], [-.46, .12]];

// ------------------------------------------------------------------ pieces
/** A coffin lying along (ax, az): top face at height y, its side showing below. */
function coffin(d, x, z, y, ax, az, {s = 1, alpha = 1, lid = 0, eyes = 0, T = tier(1), rattle = 0} = {}){
  const pt = (u, w, h, g = 0) => {
    const uu = u*s+Math.sign(u)*g, ww = w*s+Math.sign(w)*g;
    return [x+ax*uu-az*ww, h, z+az*uu+ax*ww];
  };
  const face = (h, g) => SHAPE.map(([u, w]) => pt(u, w, h, g));
  const low = y-.12*s;
  d.path(face(low, .045), 0, INK, alpha, {fill: true});
  d.path(face(low, 0), 0, SIDE, alpha, {fill: true});
  d.path(face(y, .04), 0, INK, alpha, {fill: true});
  // The lid: slides aside when it bangs open, showing the dark and the light inside.
  if(lid > .02){
    d.path(face(y, -.03), 0, HOLLOW, alpha, {fill: true});
    d.orb(x, z, y+.02, .2*s, P.main, alpha*.9*lid, {glow: true, soft: true});
    if(eyes > .05) for(const w of [-.07, .07]) d.orb(x+(-az*w)*s, z+(ax*w)*s, y+.03, .035*s, GHOST, alpha*eyes);
  }
  const lx = lid*.16, lw = lid*.1, top = (u, w, g = 0) => pt(u+lx, w+lw, y+.015+rattle, g);
  if(lid > .02) d.path(SHAPE.map(([u, w]) => top(u, w, .035)), 0, INK, alpha, {fill: true});
  d.path(SHAPE.map(([u, w]) => top(u, w)), 0, WOOD, alpha, {fill: true});
  d.path([top(-.4, -.08), top(-.2, -.2), top(.4, -.12)], .035*s, WOOD_LIGHT, alpha*.9);
  // Iron bands and a bone cross.
  for(const u of [-.3, .26]){
    const half = u < 0 ? .19 : .165;
    d.path([top(u, -half, .02), top(u, half, .02)], .1*s, INK, alpha);
    d.path([top(u, -half), top(u, half)], .06*s, IRON, alpha);
    d.orb(...xyz(top(u, 0)), .03*s, IRON_LIGHT, alpha);
  }
  d.path([top(-.16, 0), top(.16, 0)], .1*s, INK, alpha);
  d.path([top(-.02, -.08), top(-.02, .08)], .1*s, INK, alpha);
  d.path([top(-.16, 0), top(.16, 0)], .055*s, BONE, alpha);
  d.path([top(-.02, -.08), top(-.02, .08)], .055*s, BONE, alpha);
  // Spirit light leaking from the seams (★2+), stronger as it flies.
  if(T.glow && eyes > .05) d.path([...SHAPE.map(([u, w]) => top(u, w)), top(SHAPE[0][0], SHAPE[0][1])], .05*s, P.main, alpha*eyes*.6, {glow: true, soft: true});
}
const xyz = p => [p[0], p[2], p[1]];

/** A standing coffin, planted in the ground (Last Rites), lid swinging open. Billboarded. */
function planted(d, x, z, h, open, T, clock, alpha = 1){
  const tilt = -.22, c = Math.cos(tilt), sn = Math.sin(tilt);
  const pt = (w, v, g = 0, dx = 0) => {const ww = w+Math.sign(w)*g+dx, vv = v+(v > .45 ? g : -g*.4); return at(x, z, .05, ww*c-vv*sn, ww*sn+vv*c);};
  // Head up: shape u (-.46 head .. .46 foot) maps to v (h .. 0).
  const face = (g = 0, dx = 0) => SHAPE.map(([u, w]) => pt(w, (.46-u)/.92*h, g, dx));
  d.path(face(.05), 0, INK, alpha, {fill: true});
  d.path(face(0, .06), 0, SIDE, alpha, {fill: true});
  d.path(face(0), 0, HOLLOW, alpha, {fill: true});
  const mid = at(x, z, .05, -h*.5*sn, h*.5*c);
  d.orb(mid[0], mid[2], mid[1], .32, P.main, alpha*.7*open, {glow: true, soft: true});
  if(open > .2){
    d.orb(mid[0], mid[2], mid[1]+.1, .16, GHOST, alpha*open);
    for(const w of [-.06, .06]){const e = at(mid[0], mid[2], mid[1]+.14, w, 0); d.orb(e[0], e[2], e[1], .03, INK, alpha*open);}
  }
  // The lid, hinged on its left edge, swinging out.
  const swing = open*1.25;
  const lidPt = (w, v, g = 0) => {const ww = -.25+(w+.25)*Math.cos(swing), vv = v; return pt(ww-(w+.25)*Math.sin(swing)*.25, vv, g);};
  const lid = g => SHAPE.map(([u, w]) => lidPt(w, (.46-u)/.92*h, g));
  d.path(lid(.04), 0, INK, alpha, {fill: true});
  d.path(lid(0), 0, WOOD, alpha, {fill: true});
  const a = lidPt(-.02, h*.72), b = lidPt(-.02, h*.36), l = lidPt(-.1, h*.6), r = lidPt(.06, h*.6);
  d.path([a, b], .09, INK, alpha); d.path([l, r], .09, INK, alpha);
  d.path([a, b], .05, BONE, alpha); d.path([l, r], .05, BONE, alpha);
  if(T.glow) d.bloom(x, z, h*.5, .9, P.glow, .25*open*alpha);
}

/** A little ghost: round head, wavering tail trailing toward (tu, tv), eyes and (screaming) mouth. */
function ghost(d, x, z, y, r, alpha, {tu = 0, tv = -1, scream = 0, phase = 0, soul = false} = {}){
  if(!(alpha > .01) || !(r > .01)) return;
  const nu = -tv, nv = tu, pts = [], ink = [];
  for(let i = 0; i <= 10; i++){
    const a = -Math.PI/2+i/10*Math.PI, c = Math.cos(a), s = Math.sin(a);
    pts.push(at(x, z, y, (-tu*c+nu*s)*r, (-tv*c+nv*s)*r));
    ink.push(at(x, z, y, (-tu*c+nu*s)*(r+.035), (-tv*c+nv*s)*(r+.035)));
  }
  for(let k = 1; k <= 5; k++){
    const t = k/5, wob = Math.sin(phase*7+t*5)*r*.35*t, w = r*(1-t)*.95, L = r*2.4*t;
    const e = [tu*L+nu*wob, tv*L+nv*wob];
    pts.push(at(x, z, y, e[0]-nu*w*.2, e[1]-nv*w*.2));
    ink.push(at(x, z, y, e[0]-nu*w*.2+tu*.04, e[1]-nv*w*.2+tv*.04));
  }
  d.path(ink, 0, INK, alpha*.85, {fill: true});
  d.path(pts, 0, soul ? '#ffd2ec' : GHOST, alpha, {fill: true});
  d.orb(x+tu*r*.5, z-tv*r*.5*.72, y+tv*r*.5*.69, r*.55, soul ? P.alt : P.main, alpha*.45);
  for(const s of [-1, 1]){const e = at(x, z, y, nu*s*r*.36-tu*r*.12, nv*s*r*.36-tv*r*.12+r*.1); d.orb(e[0], e[2], e[1], r*.15, INK, alpha);}
  if(scream > .05){const m = at(x, z, y, -tu*r*.35, -tv*r*.35-r*.25); d.orb(m[0], m[2], m[1], r*.18*scream, INK, alpha);}
}

/** The whirl: a ribbon along the coffin's circle behind it. `span` radians, painted or glowing. */
function whirl(d, cx, cz, y, r, th, spin, span, width, color, alpha, {glow = false, soft = false, inset = 0} = {}){
  if(!(alpha > .01) || !(span > .05)) return;
  const n = 16, outer = [], inner = [];
  for(let i = 0; i <= n; i++){
    const t = i/n, a = th-spin*span*t, w = width*(1-t)**.8, rr = r-inset;
    outer.push([cx+Math.cos(a)*(rr+w), y-t*.08, cz+Math.sin(a)*(rr+w)]);
    inner.push([cx+Math.cos(a)*(rr-w), y-t*.08, cz+Math.sin(a)*(rr-w)]);
  }
  d.path([...outer, ...inner.reverse()], 0, color, alpha, {fill: 'ribbon', glow, soft});
}

/** The chain: hand to coffin, sagging when slack and lagging behind the swing. */
function chain(d, a, b, sag, lagX, lagZ, T, glowK){
  const n = 12, pts = [];
  const mx = (a[0]+b[0])/2+lagX, my = (a[1]+b[1])/2-sag, mz = (a[2]+b[2])/2+lagZ;
  for(let i = 0; i <= n; i++){
    const t = i/n, u = 1-t;
    pts.push([u*u*a[0]+2*u*t*mx+t*t*b[0], u*u*a[1]+2*u*t*my+t*t*b[1], u*u*a[2]+2*u*t*mz+t*t*b[2]]);
  }
  if(T.glow && glowK > .05) d.path(pts, .2, P.glow, .35*glowK, {glow: true, soft: true});
  d.path(pts, .1, INK, 1);
  d.path(pts, .055, IRON, 1);
  for(let i = 1; i < n; i += 2) d.orb(pts[i][0], pts[i][2], pts[i][1], .032, IRON_LIGHT, 1);
  return pts;
}

// ------------------------------------------------------------------ the rig
const SMOOTH = new Map();
/** Draw the flail on its wielder. Returns the rig origin (the coffin, so it sorts in front of or behind the body). */
export function paintFlail(d, world, p, anchor, motion, clock, time){
  const f = p.flail;
  if(!f || !Number.isFinite(f.x)) return null;
  const T = tier(rankOf(p, PACK)), lead = Math.max(0, Math.min(.1, (time ?? world.time)-world.time));
  const R = f.rite, phase = R?.phase;
  const seed = typeof p.id === 'string' ? p.id.length*7.3 : 1;
  // Where the coffin is: planted and flying coffins by their own path, the swing in polar form around
  // the wielder (radius smoothed, angle carried on by the spin) so it glides between 20 Hz updates.
  let x, z, y, ax, az, speed = Math.hypot(f.vx || 0, f.vz || 0), th = 0, r = 0, spin = f.spin || 1, rel = 0;
  const hand = [anchor.x, anchor.y+.62, anchor.z];
  if(phase === 'fly'){
    const u = clamp01((R.t-(R.t0 || 0)+lead)/RITE.fly);
    x = lerp(R.fx, R.tx, u); z = lerp(R.fz, R.tz, u); y = .6+1.5*Math.sin(Math.PI*u)-.4*u;
    const tumble = u*9*spin; ax = Math.cos(tumble); az = Math.sin(tumble); rel = speed;
  }else if(phase === 'hold' || phase === 'yank'){
    x = f.x; z = f.z; y = 0;
  }else{
    const ox = f.x-p.x, oz = f.z-p.z; r = Math.hypot(ox, oz);
    const w = r > .05 ? (ox*(f.vz || 0)-oz*(f.vx || 0))/(r*r) : 0;
    th = Math.atan2(oz, ox)+w*lead;
    const m = SMOOTH.get(p.id) || {r, at: clock};
    m.r += (r-m.r)*Math.min(1, Math.max(0, clock-m.at)*16); m.at = clock; SMOOTH.set(p.id, m);
    r = m.r; x = anchor.x+Math.cos(th)*r; z = anchor.z+Math.sin(th)*r;
    // How fast it swings round the wielder (walking drags it along without lifting it).
    rel = Math.hypot((f.vx || 0)-(motion?.vx || 0), (f.vz || 0)-(motion?.vz || 0));
    const lift = clamp01((rel-2.5)/9);
    const rattle = rel < 1.5 ? Math.max(0, Math.sin((clock*.9+seed)%3*Math.PI*1.4))*(((clock*.9+seed)%3) < .7 ? 1 : 0) : 0;
    y = .19+.5*lift+rattle*.06;
    ax = Math.cos(th); az = Math.sin(th);
    spin = w >= 0 ? 1 : -1;
  }
  const lift = clamp01((rel-2.5)/9);
  d.stain(x, z, .5*(1-Math.min(.5, y*.25)), INK, .28*(1-Math.min(.6, y*.3)));

  if(phase === 'hold' || phase === 'yank'){
    const k = clamp01((R.t-(R.t0 || 0)+lead)/.25);
    const open = phase === 'hold' ? easeOut(k) : 1;
    const top = at(x, z, .05, .2, .8);
    const taut = chain(d, hand, [top[0], top[1], top[2]], phase === 'hold' ? .25*(1-k) : 0, 0, 0, T, phase === 'yank' ? 1 : .4);
    if(phase === 'yank' && T.trail) for(let i = 0; i < 3; i++){
      const t = ((clock*3+i/3)%1), q = taut[Math.floor(t*(taut.length-1))];
      d.streak([q[0], q[1], q[2]], [lerp(q[0], hand[0], .25), lerp(q[1], hand[1], .25), lerp(q[2], hand[2], .25)], .08, P.core, .6*(1-t));
    }
    planted(d, x, z, 1.02, open, T, clock);
    if(T.rays) for(let i = 0; i < 2+T.r; i++){
      const a = ((clock*.8+i/(2+T.r))%1);
      ghost(d, x+Math.sin(i*2.4+clock)*.3, z, .6+a*1.8, .16*(1-a*.5), (1-a)*.8, {tu: 0, tv: -1, scream: .6, phase: clock+i, soul: T.prism && i%2 === 1});
    }
    return {x, y: 0, z};
  }

  // The whirl behind it, and what peels off it.
  const span = Math.min(2.4, rel*.16)*lift;
  if(phase !== 'fly' && span > .1){
    const cx = x-Math.cos(th)*r, cz = z-Math.sin(th)*r;
    whirl(d, cx, cz, y, r, th, spin, span, .26, T.glow ? P.main : '#dfe4ff', T.glow ? .75 : .4);
    if(T.glow) whirl(d, cx, cz, y, r, th, spin, span*1.1, .42, P.glow, .35*lift, {glow: true, soft: true});
    if(T.rays) whirl(d, cx, cz, y+.02, r, th, spin, span*.8, .05, P.core, .7*lift, {glow: true, inset: -.18});
    if(T.prism) whirl(d, cx, cz, y+.02, r, th, spin, span*.7, .09, P.alt, .6*lift, {inset: .2});
    if(T.sigil && rel > 11) for(const [back, a] of [[.35, .32], [.7, .16]]){
      const b = th-spin*back*Math.min(1, span);
      const px = cx+Math.cos(b)*r, pz = cz+Math.sin(b)*r;
      d.path(SHAPE.map(([u, w]) => [px+Math.cos(b)*u-Math.sin(b)*w, y, pz+Math.sin(b)*u+Math.cos(b)*w]), 0, P.main, a*lift, {fill: true});
    }
    if(T.rays && rel > 8) for(let i = 0; i < 3; i++){
      const a = (clock*1.4+i/3)%1, b = th-spin*(.3+a*1.2)*Math.min(1, span+.3);
      ghost(d, cx+Math.cos(b)*(r+.1+a*.4), cz+Math.sin(b)*(r+.1+a*.4), y+.1+a*.7, .13*(1-a*.4), (1-a)*.75*lift,
        {tu: Math.sin(b)*spin*.8, tv: -.6, scream: .4, phase: clock+i, soul: T.prism && i === 1});
    }
    if(T.prism && rel >= 14){
      // The lid is off: a soul streams out behind the coffin, screaming.
      const b = th-spin*.28;
      ghost(d, cx+Math.cos(b)*r, cz+Math.sin(b)*r, y+.34, .22, .9, {tu: Math.sin(th)*spin, tv: -.3, scream: 1, phase: clock*2, soul: false});
    }
  }
  // Dust where it scrapes (★2+).
  if(T.glow && phase !== 'fly' && rel > 1.5 && lift < .3) for(let i = 0; i < 3; i++){
    const a = (clock*2.2+i/3)%1;
    d.stain(x-ax*(.3+a*.5)+Math.sin(i*3.1)*.12, z-az*(.3+a*.5), .12+a*.2, DUST, .35*(1-a));
  }
  // The chain, from the hand to the coffin's head, then the coffin on top.
  const head = [x-ax*.57, y+.02, z-az*.57];
  const toward = Math.hypot(head[0]-anchor.x, head[2]-anchor.z) || 1;
  hand[0] += (head[0]-anchor.x)/toward*.26; hand[2] += (head[2]-anchor.z)/toward*.26;
  const len = Math.hypot(head[0]-hand[0], head[2]-hand[2]);
  const slack = phase === 'fly' ? 0 : Math.max(0, (f.len || FLAIL.chain)-.57-len);
  const lag = phase === 'fly' ? 0 : -spin*Math.min(.35, rel*.018);
  chain(d, hand, head, .08+slack*.5+(1-lift)*.12, -Math.sin(th)*lag, Math.cos(th)*lag, T, lift);
  const open = T.prism && rel >= 14 ? .7 : 0;
  const eyes = T.glow ? Math.max(lift*.8, open) : 0;
  coffin(d, x, z, y, ax, az, {T, lid: open, eyes, s: 1.25});
  if(T.glow && lift > .2) d.light(x, z, 1.2+lift);
  return {x, y: 0, z};
}

// ------------------------------------------------------------------ blows and Last Rites
function impact(d, ev, age, seed){
  const T = tier(ev.rank), hard = !!ev.hard, chainHit = !!ev.chain, k = age/.45, s = chainHit ? .6 : hard ? 1.25 : 1;
  const dir = Math.atan2(ev.dz || 0, ev.dx || 1);
  // A painted crunch: an ink-edged star of splinters with a pale heart.
  if(k < .5){
    const q = k/.5, r = (.35+.35*easeOut(q))*s*T.size;
    d.star(ev.x, ev.z, .55, r+.05, INK, fade(q, 1.2), {spin: seed%3, points: 6, inner: .4});
    d.star(ev.x, ev.z, .55, r, hard ? P.core : BONE, fade(q, 1.2), {spin: seed%3, points: 6, inner: .4});
  }
  if(T.glow) d.bloom(ev.x, ev.z, .55, .9*s, P.main, .5*fade(k));
  d.debris(ev.x, ev.z, 3+(hard ? 3 : 0), age, WOOD_LIGHT, seed, {speed: 3.5*s, up: 3, size: .07, life: .55});
  if(T.rays) d.sparks(ev.x, ev.z, .55, T.sparks*(hard ? 1 : .5)|0, age, P.core, 1, seed, {speed: 7*s, spread: 1.6, dir, life: .4});
  if(T.rays && hard && age < .8) ghost(d, ev.x, ev.z, .7+age*1.6, .2*(1-age*.5), fade(age/.8), {tu: 0, tv: -1, scream: 1, phase: age*3});
}

function shock(d, ev, age){
  const T = tier(ev.rank), k = age/.5;
  d.shock(ev.x, ev.z, (ev.r || FLAIL.shock)*easeOut(k), .1, P.main, fade(k), P.core);
  if(T.rings > 1) d.ring(ev.x, ev.z, (ev.r || FLAIL.shock)*.6*easeOut(k), .05, P.alt, fade(k)*.7);
}

function riteStart(d, ev, age, seed, clock){
  // The ground under the wielder and the grave waiting where the coffin will land.
  const T = tier(ev.rank), k = age/(RITE.wind+RITE.fly);
  if(k >= 1.1) return;
  const pull = easeOut(Math.min(1, age/.25));
  d.mark(ev.x, ev.z, 1.2*pull, .06, P.main, fade(k, 3));
  if(T.sigil) d.sigil(ev.x, ev.z, 1.6*pull, P.main, .6*fade(k, 3), {spin: age*(-5), sides: 4});
  if(Number.isFinite(ev.tx)){
    const tight = 1-.55*Math.min(1, k);
    d.ring(ev.tx, ev.tz, RITE.slam*tight, .05, INK, .6*Math.min(1, age*4), {glow: false});
    d.ring(ev.tx, ev.tz, RITE.slam*tight, .035, P.main, .8*Math.min(1, age*4));
    // A grave marker waits: a bone cross standing where it will fall.
    const hA = at(ev.tx, ev.tz, .05, 0, .55*pull), hB = at(ev.tx, ev.tz, .05, 0, 0);
    const cA = at(ev.tx, ev.tz, .05, -.16, .38*pull), cB = at(ev.tx, ev.tz, .05, .16, .38*pull);
    d.path([hA, hB], .13, INK, .8); d.path([cA, cB], .13, INK, .8);
    d.path([hA, hB], .07, BONE, .9); d.path([cA, cB], .07, BONE, .9);
  }
}

function slam(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.9, R = ev.r || RITE.slam;
  d.stain(ev.x, ev.z, 1.4*easeOut(Math.min(1, age*6)), '#1b1220', .55*fade(age/2.2, .6));
  d.groundRays(ev.x, ev.z, 7, .5, 1.9*easeOut(Math.min(1, age*5)), .06, INK, .7*fade(age/2, .8), seed);
  for(let i = 0; i < T.rings; i++){
    const q = clamp01((age-i*.08)/.55);
    if(q > 0 && q < 1) d.shock(ev.x, ev.z, R*(.35+.75*easeOut(q)), .12, i === 2 ? P.alt : P.main, fade(q), P.core);
  }
  d.debris(ev.x, ev.z, 6+(T.debris ? 6 : 0), age, '#5c4a52', seed, {speed: 5, up: 6, size: .12, life: .8});
  d.debris(ev.x, ev.z, 5, age, WOOD_LIGHT, seed+3, {speed: 4, up: 5, size: .08, life: .7});
  if(T.glow) d.pool(ev.x, ev.z, 2.4, P.glow, .45*fade(k));
  if(T.rays) d.rays(ev.x, ev.z, .8, 8, 2*easeOut(Math.min(1, age*4)), .1, P.main, .45*fade(k, 1.5), seed, age*.4);
  if(T.pillar && age < .5) d.beam(ev.x, ev.z, 0, 3.4*easeOut(age/.25), .45*(1-age/.5), P.main, .35*fade(age/.5));
  // The dead pour out of the grave.
  const n = 2+T.r;
  for(let i = 0; i < n; i++){
    const a = clamp01((age-.05*i)/1.1), ang = i/n*TAU+rnd(seed, i);
    if(a <= 0 || a >= 1) continue;
    const out = .3+1.1*easeOut(a);
    ghost(d, ev.x+Math.cos(ang)*out, ev.z+Math.sin(ang)*out*.8, .5+a*2.2, .3*(1-a*.3), fade(a, 1.3),
      {tu: -Math.cos(ang)*.4, tv: -1, scream: 1, phase: age*4+i, soul: T.prism && i%2 === 1});
  }
  d.light(ev.x, ev.z, 3.5*fade(k));
}

function land(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.55, R = ev.r || RITE.land;
  d.shock(ev.x, ev.z, R*easeOut(k), .12, P.main, fade(k), P.core);
  if(T.rings > 1) d.ring(ev.x, ev.z, R*.7*easeOut(k), .06, BONE, fade(k)*.8, {glow: false, ink: .03});
  d.debris(ev.x, ev.z, 5, age, DUST, seed, {speed: 4, up: 3, size: .09, life: .5});
  for(let i = 0; i < 8; i++){
    const a = i/8*TAU+seed%1, q = clamp01(age/.5);
    d.stain(ev.x+Math.cos(a)*R*.8*q, ev.z+Math.sin(a)*R*.8*q, .25+.2*q, DUST, .4*(1-q));
  }
  if(T.sparks > 3) d.sparks(ev.x, ev.z, .3, T.sparks, age, P.core, 1, seed, {speed: 8, up: 2});
}

/** Kicks scale with the tier: nothing at ★1–2 except the slam. */
const kick = (shake, flash = 0) => ev => {const T = tier(ev.rank); return {shake: T.shake*shake, flash: T.flash*flash, color: P.core};};

export const FLAIL_EVENTS = {
  coffinhit: {life: ev => ev.hard ? .9 : .5, paint(d, ev, age, seed){impact(d, ev, age, seed);},
    kick: ev => ev.hard ? {shake: tier(ev.rank).shake*.35} : null},
  coffinshock: {life: () => .5, paint(d, ev, age){shock(d, ev, age);}},
  coffinheave: {life: () => .01, paint(){}},
  'fx:lastrites': {life: () => RITE.wind+RITE.fly+.1, paint(d, ev, age, seed, fx){riteStart(d, ev, age, seed, fx.clock);}},
  coffinthrow: {life: () => .01, paint(){}},
  coffinslam: {life: () => 2.2, paint(d, ev, age, seed){slam(d, ev, age, seed);},
    kick: ev => {const T = tier(ev.rank); return {shake: .22+T.shake, flash: T.flash, color: P.main};}},
  coffinyank: {life: () => .01, paint(){}, kick: kick(.4)},
  coffinland: {life: () => .6, paint(d, ev, age, seed){land(d, ev, age, seed);}, kick: kick(.8, .5)},
};

/** src/fx/index.mjs WEAPON_FX entry. */
export const PALLBEARER_FX = {
  id: PACK,
  events: FLAIL_EVENTS,
  magicCast: false,
  rig: (d, world, p, anchor, motion, clock, time) => ({origin: paintFlail(d, world, p, anchor, motion, clock, time) || undefined}),
};
