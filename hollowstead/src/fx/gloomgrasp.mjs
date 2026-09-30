// The Gloomgrasp Scepter, drawn. Presentation only: the host owns every hand, its grip and its hits
// (magic/gloomgrasp.mjs). The hands are painted like the kitsune's fire: an ink edge of the same hue,
// a saturated violet body, a light band and pale claws, so they read on pale ground and in the dark.
//
// Anticipation → release → impact → linger: your shadow crawls out along the ground, a pool opens, a
// hand claws up with an eye staring from its palm, the fingers snap shut; while it holds, runes on the
// palm show the grip (one, two, three). A squeeze loosens the fingers, then clenches harder; the third
// crushes, and the fist bursts open in shards. Equipped, your own shadow pools at your feet and a
// shadow hand idles behind you, flexing; it plunges into the ground when you cast.
//
// Rank ladder: ★1 hands, pools, grip runes, squeeze lines; ★2 glow, a shadow tether to every foe you
// hold; ★3 wisps rising from the pools, sparks, a second ring on the crush; ★4 a second hand behind you,
// sigils, debris, camera kick; ★5 magenta light running along the fingers, eyes in the pools, a flash.
import {TAU, at, bump, clamp01, easeIn, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {GRASP} from '../magic/gloomgrasp.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'gloomgrasp';
const P = hue(PACK);
const SKIN = '#7a3ce0', LIGHT = '#b98cff', INKH = '#1c0833', CLAW = '#f6ecff', SCLERA = '#fff2fb',
  POOL = '#1a0a2e', EDGE = '#9a5cff';
const rankOfOwner = p => p && typeof p === 'object' ? rankOf(p, PACK) : 1;

// ------------------------------------------------------------------ shapes
/** A filled strip along a centre line in billboard space around (x, z, y); `shift` slides it across. */
function strip(d, x, z, y, line, widths, color, alpha, {grow = 0, scale = 1, shift = 0, glow = false, soft = false} = {}){
  if(!(alpha > .004)) return;
  const n = line.length-1, left = [], right = [];
  for(let i = 0; i <= n; i++){
    const [pu, pv] = line[Math.max(0, i-1)], [nu, nv] = line[Math.min(n, i+1)];
    let du = nu-pu, dv = nv-pv; const l = Math.hypot(du, dv) || 1; du /= l; dv /= l;
    const w = widths[i]*scale+grow, cu = line[i][0]-dv*widths[i]*shift, cv = line[i][1]+du*widths[i]*shift;
    left.push(at(x, z, y, cu-dv*w, cv+du*w));
    right.push(at(x, z, y, cu+dv*w, cv-du*w));
  }
  d.path([...left, ...right.reverse()], 0, color, alpha, {fill: 'ribbon', glow, soft});
}

/** A wobbling pool of shadow on the ground. `lip` draws only its near rim, lifted, over an arm's base. */
function pool(d, x, z, r, alpha, clock, seed, T, {lip = false} = {}){
  if(!(r > .02) || !(alpha > .01)) return;
  const wob = a => 1+Math.sin(a*5+clock*3+seed)*.05+Math.sin(a*3-clock*2.2)*.04;
  if(lip){
    const outer = [], inner = [];
    for(let i = 0; i <= 14; i++){
      const a = i/14*Math.PI, w = wob(a);
      outer.push([x+Math.cos(a)*r*w, .17, z+Math.sin(a)*r*.62*w]);
      inner.push([x+Math.cos(a)*r*.9*w, .17, z+Math.sin(a)*r*.62*w*.55]);
    }
    d.path([...outer, ...inner.reverse()], 0, POOL, alpha, {fill: 'ribbon'});
    d.path(outer, .05, EDGE, alpha*.9);
    return;
  }
  const pts = [];
  for(let i = 0; i <= 16; i++){const a = i/16*TAU, w = wob(a); pts.push([x+Math.cos(a)*r*w, .05, z+Math.sin(a)*r*.62*w]);}
  if(T.glow) d.pool(x, z, r*1.5, P.glow, .35*alpha);
  d.path(pts, .1, INKH, alpha*.8);
  d.path(pts, 0, POOL, alpha, {fill: true});
  d.path(pts, .04, EDGE, alpha*.9);
  // A darker heart and a ripple crawling inward.
  const q = (clock*.9+seed*.13)%1;
  d.stain(x, z, r*.55, '#07020d', .6*alpha);
  d.ring(x, z, r*(1-q)*.85, .025, P.main, .5*alpha*bump(q), {glow: false, y: .06});
  if(T.r >= 5) for(let i = 0; i < 1; i++){
    const a = rnd(seed, i)*TAU, rr = r*.5*Math.sqrt(rnd(seed, i+3)), blink = bump(((clock*.5+rnd(seed, i+6))%1)*1.4);
    if(blink > .05) eye(d, x+Math.cos(a)*rr, z+Math.sin(a)*rr*.6, .08, .09, blink, alpha, clock+i);
  }
}

/** An almond eye facing the camera: pale white, magenta iris, a slit pupil. `open` 0..1. */
function eye(d, x, z, y, r, open, alpha, clock){
  if(!(open > .04) || !(alpha > .02)) return;
  const lid = [];
  for(let i = 0; i <= 8; i++){const s = i/8; lid.push(at(x, z, y, (s*2-1)*r*1.5, Math.sin(Math.PI*s)*r*open));}
  for(let i = 7; i >= 1; i--){const s = i/8; lid.push(at(x, z, y, (s*2-1)*r*1.5, -Math.sin(Math.PI*s)*r*open));}
  d.path([...lid, lid[0]], r*.4, INKH, alpha);
  d.path(lid, 0, SCLERA, alpha, {fill: true});
  const look = Math.sin(clock*1.7)*r*.35;
  d.orb(x+look, z, y, r*.62*Math.min(1, open*1.3), P.alt, alpha);
  d.path([at(x+look, z, y, 0, -r*.45*open), at(x+look, z, y, 0, r*.45*open)], r*.22, INKH, alpha);
}

/**
 * A shadow hand standing up out of the ground at (x, z). `rise` 0..1 lifts it out of its pool,
 * `close` 0..1 curls the fingers into a fist, `eyeOpen` opens the palm's eye, `grip` lights 0..3 runes.
 * `side` mirrors it. Returns the fist's top, in world space.
 */
export function paintHand(d, x, z, {s = 1, rise = 1, close = 0, eyeOpen = 0, grip = 0, side = 1, clock = 0, seed = 0, alpha = 1, T = tier(1), lean = 0, glowK = 0} = {}){
  if(!(rise > .02) || !(alpha > .02)) return [x, 0, z];
  const W = (.12+.5*rise-.2*close)*s, sway = Math.sin(clock*2.2+seed)*.06*s*(1-close*.7)+lean*s;
  const u = uu => uu*side;
  // The arm: a tapering ribbon swaying up out of the pool.
  const line = [], widths = [];
  for(let k = 0; k <= 8; k++){
    const t = k/8;
    line.push([u(sway*t+Math.sin(t*2.6+clock*2.4+seed)*.04*s*t), -.08*s+(W+.08*s)*t]);
    widths.push((.11-.025*t)*s);
  }
  if(T.glow && glowK > .02) strip(d, x, z, 0, line, widths, P.glow, .45*glowK, {scale: 1.9, glow: true, soft: true});
  strip(d, x, z, 0, line, widths, INKH, alpha, {grow: .045});
  strip(d, x, z, 0, line, widths, SKIN, alpha);
  strip(d, x, z, 0, line, widths, LIGHT, alpha*.9, {scale: .32, shift: -.5*side});
  const q = (uu, vv) => at(x, z, 0, u(uu*1.25)+u(sway), W+(vv-W)*1.25);
  // The palm (squeezed a little narrower as it closes).
  const nar = 1-.1*close;
  const palm = [[-.19, -.02], [.19, -.02], [.24, .14], [.2, .3], [-.2, .3], [-.24, .14]].map(([a, b]) => q(a*s*nar, W+b*s));
  d.path([...palm, palm[0]], .09, INKH, alpha);
  d.path(palm, 0, SKIN, alpha, {fill: true});
  d.path([q(-.14*s, W+.26*s), q(-.2*s, W+.13*s), q(-.14*s, W+.02*s)], .045*s, LIGHT, alpha*.8);
  // The eye in the palm: it stares while the hand reaches, and is squeezed shut by the fingers.
  const open = eyeOpen*(1-close);
  if(open > .04){const e = q(0, W+.15*s); eye(d, e[0], e[2], e[1], .085*s, open, alpha, clock+seed);}
  // Grip runes: one, two, three, lit in magenta.
  for(let i = 0; i < 3; i++){
    const c = q((i-1)*.1*s, W+.055*s), lit = i < grip, r = .036*s*(lit ? 1.15 : 1);
    const dia = [at(c[0], c[2], c[1], 0, r*1.3), at(c[0], c[2], c[1], r, 0), at(c[0], c[2], c[1], 0, -r*1.3), at(c[0], c[2], c[1], -r, 0)];
    d.path([...dia, dia[0]], .03, INKH, alpha);
    d.path(dia, 0, lit ? P.alt : '#2a1048', alpha, {fill: true});
    if(lit && T.glow) d.bloom(c[0], c[2], c[1], .12*s, P.alt, .5*alpha);
  }
  // Thumb, then four long fingers: fanned open while reaching, folded over the palm when shut.
  const twitch = (1-close)*Math.sin(clock*22+seed)*.07;
  const finger = (bu, bv, a0, segs, width, k) => {
    const pts = [[bu, bv]];
    let a = a0;
    segs.forEach(([len, bend], j) => {
      a += bend;
      const [pu, pv] = pts[pts.length-1], l = len*(1-.3*close*(j > 0 ? 1 : 0));
      pts.push([pu+Math.sin(a)*l, pv+Math.cos(a)*l]);
    });
    const world = pts.map(([a1, b1]) => q(a1, b1));
    d.path(world, width+.055, INKH, alpha);
    d.path(world, width, SKIN, alpha);
    d.path(world.slice(0, 3), width*.35, LIGHT, alpha*.85);
    if(T.prism){const run = (clock*1.3+k*.2)%1; d.path(world.slice(Math.floor(run*2), Math.floor(run*2)+2), width*.5, P.alt, alpha*.8*bump(run), {glow: true});}
    // A claw on the tip, along the last joint.
    const [tu, tv] = pts[pts.length-1], [pu, pv] = pts[pts.length-2], l = Math.hypot(tu-pu, tv-pv) || 1;
    const du = (tu-pu)/l, dv = (tv-pv)/l, c = .1*s;
    const claw = [q(tu+du*c, tv+dv*c), q(tu-dv*c*.4, tv+du*c*.4), q(tu+dv*c*.4, tv-du*c*.4)];
    d.path([...claw, claw[0]], .03, INKH, alpha);
    d.path(claw, 0, CLAW, alpha, {fill: true});
    return pts;
  };
  const ta = lerp(-1.15, -.25, close)+twitch;
  finger(-.22*s, W+.1*s, ta, [[.15*s, 0], [.12*s, .5*close+.2]], .085*s, 4);
  const bases = [-.15, -.05, .05, .15], fan = [-.5, -.17, .15, .48], lens = [.85, 1.05, 1, .8];
  for(let f = 0; f < 4; f++){
    const a0 = lerp(fan[f], (f-1.5)*.08, close)+twitch*(f%2 ? 1 : -1);
    finger(bases[f]*s*nar, W+.29*s, a0, [[.17*s*lens[f], 0], [.14*s*lens[f], .15+1.55*close], [.11*s*lens[f], .15+1.3*close]], (f === 3 ? .07 : .08)*s, f);
  }
  return q(0, W+.45*s*(1-.35*close));
}

// ------------------------------------------------------------------ hands in the world
/** One hand from world.magicPuffs: crawl, pool, rise, grab, hold and squeeze, crush, sink. */
function paintGrasp(d, h, owner, lead, clock){
  if(!d.near(h.x, h.z)) return;
  const T = tier(rankOfOwner(owner)), age = (h.age || 0)+lead, t = age-(h.delay || 0), seed = h.seed || 0;
  const s = (h.skill ? 1.05 : .95)*T.size;
  // The shadow crawling out from the caster to the mark.
  const arrive = (h.delay || 0)+.22, crawl = age < arrive ? 1 : fade((age-arrive)/.35);
  if(!h.skill && crawl > .02 && Number.isFinite(h.ox)){
    const dx = h.x-h.ox, dz = h.z-h.oz, span = Math.hypot(dx, dz) || 1, nx = -dz/span, nz = dx/span;
    const s0 = Math.min(.5, span*.4)/span, head = lerp(s0, 1, easeOut(age/arrive)), line = [], outer = [], inner = [];
    for(let j = 0; j <= 12; j++){
      const k = j/12, w = lerp(s0, head, k), wig = Math.sin(w*span*2.2-age*10+seed)*.14*(1-k*.4), half = .06+.12*k;
      const cx = h.ox+dx*w+nx*wig, cz = h.oz+dz*w+nz*wig;
      line.push([cx, .06, cz]); outer.push([cx+nx*half, .05, cz+nz*half]); inner.push([cx-nx*half, .05, cz-nz*half]);
    }
    d.path([...outer, ...inner.reverse()], 0, POOL, .9*crawl, {fill: 'ribbon'});
    d.path(line, .035, EDGE, .8*crawl, {taper: .2});
  }
  if(t < -.05) return;
  const sinking = h.sinkAt > 0 ? clamp01((age-h.sinkAt)/GRASP.sink) : 0;
  const R = .72*s*easeOut((t+.05)/.2)*(1-easeIn(sinking));
  const held = h.grip > 0 && !(h.sinkAt > 0) ? 1 : 0;
  pool(d, h.x, h.z, R, 1, clock, seed, T);
  if(T.rays) d.motes(h.x, h.z, 2+(T.r>>1), clock+seed, R*.6, P.main, .8, seed, {rise: 1.1, size: .06, life: .9, y: .1});
  // Rise with an overshoot, sink back down at the end.
  const u = clamp01((t-.04)/.3), back = 1+2.7*(u-1)**3+1.7*(u-1)**2;
  const rise = back*(1-easeOut(sinking));
  // Fingers: open while rising, snap shut on the grab; a squeeze loosens them first, a crush bursts them open.
  let close = h.grip > 0 ? 1 : clamp01((t-(h.grabAt-.1))/.1);
  if(h.squeezeAt > age){const k = 1-(h.squeezeAt-age)/GRASP.squeezeIn; close = 1-.5*easeOut(clamp01(k));}
  const since = h.clenchAt > 0 || h.grip > 0 ? age-(h.clenchAt || 0) : 99;
  if(h.grip >= 3) close = 1-easeOut(clamp01((since-.12)/.18));
  const punch = h.grip > 0 ? fade(since/.3)*(.1+.06*h.grip) : 0;
  const shake = held ? Math.sin(clock*48+seed)*.012*h.grip+Math.sin(age*70)*.04*punch : 0;
  paintHand(d, h.x+shake, h.z+.14, {s: s*(1+punch), rise, close, eyeOpen: clamp01((t-.1)/.12), grip: h.grip || 0, side: h.side || 1,
    clock, seed, T, alpha: 1, glowK: held ? .4+.2*h.grip : .3});
  pool(d, h.x, h.z, R, 1, clock, seed, T, {lip: true});
  if(T.glow && held && h.grip >= 2) d.light(h.x, h.z, .9+.3*h.grip);
}

/** ★2: a thread of your shadow running to every foe you hold, pulsing when it squeezes. */
function paintTether(d, h, owner, lead, clock){
  if(!owner || !(h.grip > 0) || h.sinkAt > 0 || h.skill) return;
  const T = tier(rankOfOwner(owner));
  if(!T.glow) return;
  const age = (h.age || 0)+lead, dx = h.x-owner.x, dz = h.z-owner.z, span = Math.hypot(dx, dz);
  if(span < .8) return;
  const nx = -dz/span, nz = dx/span, pts = [];
  for(let j = 0; j <= 10; j++){
    const k = j/10, wig = Math.sin(k*9-clock*4+(h.seed || 0))*.08*bump(k);
    pts.push([owner.x+dx*k+nx*wig, .06, owner.z+dz*k+nz*wig]);
  }
  d.path(pts, .08, POOL, .55, {taper: .3});
  d.path(pts, .025, P.main, .45);
  const since = age-(h.clenchAt || 0), k = clamp01(since/.3);
  if(since >= 0 && k < 1){const p = pts[Math.round(k*10)]; d.orb(p[0], p[2], .1, .12, P.alt, fade(k), {glow: true});}
}

/** The wielder's cast: their shadow surges out from under them. */
function paintCast(d, e, owner, lead){
  const T = tier(rankOfOwner(owner)), age = (e.age || 0)+lead, k = age/(e.life || GRASP.castLife);
  if(k >= 1 || !d.near(e.x, e.z)) return;
  d.stain(e.x, e.z, .5+.6*easeOut(k/.3), POOL, .7*fade(k));
  d.mark(e.x, e.z, .3+1.1*easeOut(k/.5), .05, P.main, fade(k), {halo: T.glow ? .4 : 0});
  if(T.rays) d.sigil(e.x, e.z, 1.05, P.main, .7*fade(k, 1.3)*easeOut(age/.1), {spin: -age*2.5, sides: 5, glow: T.sigil});
}

// ------------------------------------------------------------------ the rig: your shadow, your hand
/** Equipped: the wielder's shadow pools at their feet and a shadow hand flexes behind them. */
function paintRig(d, world, p, anchor, motion, clock, time){
  const T = tier(rankOfOwner(p)), side = p.dx < -.1 ? -1 : 1, seed = (String(p.id).charCodeAt(0) || 3)*.71;
  const x = anchor.x, z = anchor.z;
  const castAge = p.magicCast?.itemId === PACK ? time-p.magicCast.at : 99;
  const skillAge = p.skillCast?.itemId === PACK ? time-p.skillCast.at : 99;
  // The hand plunges into the ground as the cast goes, then claws back up.
  const plunge = castAge >= 0 && castAge < .7 ? (castAge < .12 ? easeOut(castAge/.12) : 1-easeOut((castAge-.12)/.55)) : 0;
  const reach = skillAge >= 0 && skillAge < 1.4 ? bump(skillAge/1.4) : 0;
  const held = (world.magicPuffs || []).filter(h => h.packId === PACK && h.ownerId === p.id && h.grip > 0 && !(h.sinkAt > 0)).length;
  const breathe = 1+.06*Math.sin(clock*1.6+seed);
  const r = (.62+.08*Math.min(3, held))*breathe*(1+.5*reach);
  d.stain(x, z, r*1.1, POOL, .55);
  d.ring(x, z, r*.85, .03, P.main, .5+.1*Math.min(3, held), {glow: T.glow, y: .06});
  const speed = Math.hypot(motion.vx, motion.vz), trail = Math.min(.35, speed*.06);
  const hands = T.r >= 4 ? [side, -side] : [side];
  hands.forEach((hs, i) => {
    const hx = x-hs*(.48+.1*i)-motion.vx*trail*.2, hz = z-.2-motion.vz*trail*.2;
    const flex = .3+.25*Math.sin(clock*1.7+seed+i*2);
    paintHand(d, hx, hz, {s: .5*(1+.4*reach), rise: (1-plunge)*(.85+.1*Math.sin(clock*1.3+i)), close: Math.max(0, flex-reach*.3), eyeOpen: T.glow ? .6+.4*reach : 0,
      grip: Math.min(3, held), side: -hs, clock, seed: seed+i*3, T, lean: -motion.vx*.05, glowK: .25+.4*reach});
  });
  return {origin: {x, y: 0, z: z-.25}};
}

// ------------------------------------------------------------------ grabs, squeezes and the crush
/** Squeeze lines round a fist, flung outward. */
function squeezeLines(d, x, z, y, n, k, len, color, seed){
  for(let i = 0; i < n; i++){
    const a = i/n*TAU+rnd(seed, i)*.4, r0 = .35+.35*easeOut(k), r1 = r0+len*(1-k*.5);
    const a0 = at(x, z, y, Math.cos(a)*r0, Math.sin(a)*r0), a1 = at(x, z, y, Math.cos(a)*r1, Math.sin(a)*r1);
    d.path([a0, a1], .1, INKH, fade(k));
    d.path([a0, a1], .045, color, fade(k), {taper: .5});
  }
}

function grabbed(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.45, y = .75;
  if(!ev.grip){d.debris(ev.x, ev.z, 4, age, POOL, seed, {speed: 2, up: 3, size: .07, life: .5}); return;}
  d.mark(ev.x, ev.z, .35+.6*easeOut(k), .05, P.main, fade(k), {halo: T.glow ? .4 : 0});
  squeezeLines(d, ev.x, ev.z+.14, y, 5, k, .25, P.core, seed);
  if(T.rays) d.sparks(ev.x, ev.z, y, T.sparks>>1, age, P.alt, 1, seed, {speed: 3, up: 2, gravity: 8, life: .4});
}

function squeezed(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.5, g = ev.grip || 2, y = .75;
  d.shock(ev.x, ev.z, .4+.9*easeOut(k), .07, P.main, fade(k), P.core);
  squeezeLines(d, ev.x, ev.z+.14, y, 6+g, k, .35, g >= 2 ? P.alt : P.core, seed);
  if(T.glow) d.bloom(ev.x, ev.z, y, .7, P.alt, .45*fade(k));
  if(T.rays) d.sparks(ev.x, ev.z, y, T.sparks, age, P.alt, 1, seed, {speed: 3.5, up: 2.5, gravity: 8, life: .45});
  if(T.debris) d.debris(ev.x, ev.z, 3, age, INKH, seed, {speed: 2.5, up: 3, size: .07, life: .5});
}

function crushed(d, ev, age, seed){
  const T = tier(ev.rank), R = ev.r || GRASP.crushRadius, k = age/.9, y = .75;
  if(age < .2){d.bloom(ev.x, ev.z, y, 1.3, P.alt, .8*fade(age/.2)); d.bloom(ev.x, ev.z, y, .7, P.core, fade(age/.2));}
  d.stain(ev.x, ev.z, R*.7, POOL, .6*fade(k, .8));
  for(let i = 0; i < T.rings; i++){
    const q = clamp01((age-i*.07)/.5);
    if(q > 0 && q < 1) d.shock(ev.x, ev.z, R*(.3+.8*easeOut(q)), .1, i === 1 ? P.alt : P.main, fade(q), P.core);
  }
  // Shards of shadow flung out of the fist: dark violet flakes with a pale edge.
  const n = 7+T.r*2;
  for(let i = 0; i < n; i++){
    const a = i/n*TAU+rnd(seed, i)*.5, v = 2.2+rnd(seed, i+9)*2.4, q = age/.6;
    if(q >= 1) continue;
    const px = ev.x+Math.cos(a)*v*age, pz = ev.z+Math.sin(a)*v*age*.8, py = Math.max(.1, y+2.4*age-7*age*age);
    const r = (.13+.08*rnd(seed, i+4))*(1-q*.4), spin = age*9+i;
    const pts = [0, 1, 2].map(j => at(px, pz, py, Math.cos(spin+j*2.1)*r, Math.sin(spin+j*2.1)*r*1.3));
    d.path([...pts, pts[0]], .04, INKH, fade(q, 2));
    d.path(pts, 0, i%3 ? SKIN : P.alt, fade(q, 2), {fill: true});
  }
  squeezeLines(d, ev.x, ev.z+.14, y, 8, clamp01(age/.4), .5, P.alt, seed);
  if(T.rays) d.groundRays(ev.x, ev.z, 8, .4, R*1.2*easeOut(age/.3), .08, P.main, fade(k/.6), seed);
  if(T.sigil) d.sigil(ev.x, ev.z, R*.8, P.alt, .8*fade(k, 1.3)*easeOut(age/.1), {spin: age*3, sides: 3, glow: T.prism});
  if(T.debris) d.debris(ev.x, ev.z, 5, age, INKH, seed+2, {speed: 3.5, up: 5, size: .09, life: .7});
  d.light(ev.x, ev.z, 2*fade(k));
}

// ------------------------------------------------------------------ Abyssal Grip (skill)
/** The flood: the shadow spreading wide under the mark as the hands come up. */
function flood(d, ev, age, clock){
  const T = tier(ev.rank), r = ev.r || 4.2, life = 1.6, k = age/life;
  if(k >= 1) return;
  const grow = easeOut(age/.35), a = Math.min(1, (life-age)/.4);
  d.stain(ev.x, ev.z, r*grow*1.05, POOL, .7*a);
  d.mark(ev.x, ev.z, r*grow, .07, P.main, .9*a, {halo: T.glow ? .4 : 0});
  if(T.rings > 1) d.ring(ev.x, ev.z, r*grow*.6, .04, P.alt, .6*a, {glow: T.glow});
  if(T.rays) d.motes(ev.x, ev.z, T.motes, age, r*.8, P.main, .8*a, 91, {rise: 1.4, size: .08});
  if(T.sigil) d.sigil(ev.x, ev.z, r*.75, P.main, .6*a*grow, {spin: -clock*.6, sides: 7, glow: T.prism});
}

/** The colossal hand rising out of the middle, fingers spread, its eye wide open, before it clenches. */
function colossus(d, b, tt, clock){
  const T = tier(b.rank), k = clamp01(tt/b.at), s = 2.3*T.size;
  const close = clamp01((tt-(b.at-.18))/.18)*.55;
  pool(d, b.x, b.z, 1.3*easeOut(k/.3), 1, clock, 13, T);
  paintHand(d, b.x, b.z+.2, {s, rise: easeOut(clamp01((tt-.1)/(b.at-.25))), close, eyeOpen: clamp01((tt-.35)/.25), grip: 3, side: 1, clock, seed: 5, T, glowK: .6});
  pool(d, b.x, b.z, 1.3*easeOut(k/.3), 1, clock, 13, T, {lip: true});
  d.light(b.x, b.z, 2+2*k);
}

/** The clench: the colossal fist slams shut, drags everything in, and sinks. */
function clench(d, ev, age, seed, clock){
  const T = tier(ev.rank), s = 2.3*T.size, k = age/1.1, R = ev.r || 4.2;
  const sink = easeIn(clamp01((age-.45)/.5)), punch = fade(age/.35)*.12;
  pool(d, ev.x, ev.z, 1.3*(1-sink), 1, clock, 13, T);
  paintHand(d, ev.x+Math.sin(age*60)*.05*punch*8, ev.z+.2, {s: s*(1+punch), rise: 1-sink, close: 1, grip: 3, side: 1, clock, seed: 5, T, glowK: .8*(1-sink)});
  pool(d, ev.x, ev.z, 1.3*(1-sink), 1, clock, 13, T, {lip: true});
  for(let i = 0; i < T.rings+1; i++){
    const q = clamp01((age-i*.08)/.6);
    if(q > 0 && q < 1) d.shock(ev.x, ev.z, R*(1.1-.8*easeOut(q)), .12, i%2 ? P.alt : P.main, fade(q), P.core);
  }
  squeezeLines(d, ev.x, ev.z+.2, 1.6, 10, clamp01(age/.45), 1, P.alt, seed);
  if(T.rays) d.groundRays(ev.x, ev.z, 12, R*.2, R*easeOut(age/.3), .1, P.main, fade(k/.6), seed);
  if(T.pillar && age < .5) d.beam(ev.x, ev.z, 0, 4*easeOut(age/.2), 1.2*(1-age/.5), P.alt, .4*fade(age/.5));
  if(T.debris) d.debris(ev.x, ev.z, 8, age, INKH, seed, {speed: 4, up: 6, size: .12, life: .8});
  d.light(ev.x, ev.z, 3.5*fade(k));
}

function skillCast(d, cast, owner, age){
  const T = tier(rankOfOwner(owner)), k = age/.8;
  if(k >= 1) return;
  d.stain(cast.x, cast.z, 1.4*easeOut(k/.3), POOL, .7*fade(k));
  d.shock(cast.x, cast.z, .4+2*easeOut(k), .08, P.main, fade(k), P.core);
  if(T.rays) d.sigil(cast.x, cast.z, 1.5, P.alt, fade(k, 1.2)*easeOut(age/.1), {spin: age*3, sides: 5, glow: T.sigil});
}

const kick = (shake, flash = 0, base = 0) => ev => {const T = tier(ev.rank); return {shake: base+T.shake*shake, flash: T.flash*flash, color: P.alt};};

export const GLOOM_EVENTS = {
  gloomcast: {life: () => .01, paint(){}},
  gloomgrab: {life: () => .45, paint(d, ev, age, seed){grabbed(d, ev, age, seed);}, kick: ev => ev.grip ? kick(.2)(ev) : null},
  gloomsqueeze: {life: () => .5, paint(d, ev, age, seed){squeezed(d, ev, age, seed);}, kick: kick(.35, 0, .04)},
  gloomcrush: {life: () => .9, paint(d, ev, age, seed){crushed(d, ev, age, seed);}, kick: ev => ev.skill ? null : kick(.7, .6, .12)(ev)},
  'fx:gloomflood': {life: () => 1.6, paint(d, ev, age, seed, fx){flood(d, ev, age, fx.clock);}},
  'fx:gloomfist': {life: () => 1.1, paint(d, ev, age, seed, fx){clench(d, ev, age, seed, fx.clock);}, kick: kick(1.2, 1, .25)},
};

/** src/fx/index.mjs WEAPON_FX entry. */
export const GLOOM_FX = {
  id: PACK,
  events: GLOOM_EVENTS,
  beats: {gloomfist: {pending(d, b, tt, clock){colossus(d, b, tt, clock);}}},
  lists: {
    magicCasts: (d, e, owner, ctx) => paintCast(d, e, owner, ctx.lead),
    magicPuffs: (d, h, owner, ctx) => {paintTether(d, h, owner, ctx.lead, ctx.clock); paintGrasp(d, h, owner, ctx.lead, ctx.clock);},
  },
  skillCast: (d, cast, owner, age) => skillCast(d, cast, owner, age),
  magicCast: false,
  rig: (d, world, p, anchor, motion, clock, time) => paintRig(d, world, p, anchor, motion, clock, time),
};
