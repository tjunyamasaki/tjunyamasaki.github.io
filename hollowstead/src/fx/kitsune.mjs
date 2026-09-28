// The Nine-Tail Lantern, drawn. Presentation only: the host owns the foxfires, their timing and hits
// (magic/kitsune-lantern.mjs). Everything is painted in the wielder's rolled colour (kit.FOX: gold,
// red or violet), with a dark of the same hue for ink, so the whole kitsune reads as one colour.
//
// The tails hang behind the wielder whenever the lantern is equipped. They are few and thick (three
// at ★1, up to five at ★5), sway, stream away from the way you run, whip when a volley goes, and
// their tips burn brighter as the three-six-nine rhythm builds toward the nine. During Kitsune
// Parade the spirit shows its true form: nine spectral tails.
//
// Rank buys flourish, as everywhere in src/fx: ★1 plain flames; ★2 glow and tip fire; ★3 fox-faced
// foxfires, embers and sigils; ★4 wisps, marks and afterimages; ★5 spirit fire running up the tails
// and the full show.
import {TAU, at, bump, clamp01, easeIn, easeOut, easeOut2, fade, foxLook, lerp, tier} from './kit.mjs?v=harvest-18';
import {rankOf as rankOfPlayer} from '../progression.mjs?v=harvest-18';

export const PACK = 'kitsune-lantern';
/** The kitsune's rank for a wielder (1 without one). */
export const foxRank = p => p && typeof p === 'object' ? rankOfPlayer(p, PACK) : 1;
const TAIL_STEPS = 10;
/** Tails shown at each rank. */
export const foxTailCount = rank => [3, 3, 4, 4, 5][Math.max(1, Math.min(5, rank|0))-1];
/** How bright the tail tips burn before each volley: three, six, then nine foxfires. */
const CHARGE = [.3, .6, 1];
const PARADE = 2.3;

// ------------------------------------------------------------------ shapes
/** Screen-space (u right, v up) direction of a world move. */
function screenDir(dx, dz){
  const u = dx, v = -dz*.72, l = Math.hypot(u, v) || 1;
  return [u/l, v/l];
}
/**
 * A filled strip along a centre line given in billboard space around (x, z, y). `from`/`to` pick a
 * stretch of it (0..1); `shift` slides it across toward its upper edge, `scale` narrows it.
 */
function strip(d, x, z, y, line, widths, color, alpha, {from = 0, to = 1, scale = 1, shift = 0, grow = 0, glow = false, soft = false} = {}){
  const n = line.length-1, i0 = Math.max(0, Math.floor(from*n)), i1 = Math.min(n, Math.ceil(to*n));
  if(i1-i0 < 1 || !(alpha > .004)) return;
  const left = [], right = [];
  for(let i = i0; i <= i1; i++){
    const [pu, pv] = line[Math.max(0, i-1)], [nu, nv] = line[Math.min(n, i+1)];
    let du = nu-pu, dv = nv-pv; const l = Math.hypot(du, dv) || 1; du /= l; dv /= l;
    const w = widths[i]*scale+grow, cu = line[i][0]-dv*widths[i]*shift, cv = line[i][1]+du*widths[i]*shift;
    left.push(at(x, z, y, cu-dv*w, cv+du*w));
    right.push(at(x, z, y, cu+dv*w, cv-du*w));
  }
  d.path([...left, ...right.reverse()], 0, color, alpha, {fill: 'ribbon', glow, soft});
}
/** A flame: round head, licking point behind it (away from `u, v`). Painted, so it stays saturated in daylight. */
function flame(d, x, z, y, r, u, v, color, alpha, {lick = 0, stretch = 2.4, glow = false} = {}){
  if(!(alpha > .004) || !(r > .004)) return;
  const nu = -v, nv = u, pts = [at(x, z, y, -u*r*stretch+nu*r*lick, -v*r*stretch+nv*r*lick)];
  for(let i = 0; i <= 8; i++){
    const a = -Math.PI/2+i/8*Math.PI, c = Math.cos(a), s = Math.sin(a);
    pts.push(at(x, z, y, (u*c+nu*s)*r, (v*c+nv*s)*r));
  }
  d.path(pts, 0, color, alpha, {fill: true, glow});
}
/**
 * A little fox face: ears up, slanted eyes. The head of a foxfire from ★3. With `mask`, the kitsune
 * mask itself: a pale face with markings in the colour, as the spirit shows it in bursts and pounces.
 */
function foxFace(d, x, z, y, r, P, alpha, {tilt = 0, eyes = P.ink, glowEyes = false, mask = false} = {}){
  const ca = Math.cos(tilt), sa = Math.sin(tilt), p = (u, v) => at(x, z, y, (u*ca-v*sa)*r, (u*sa+v*ca)*r);
  for(const s of [-1, 1]){
    d.path([p(s*.35, .55), p(s*.95, 1.45), p(s*.95, .2)], 0, P.ink, alpha*.85, {fill: true});
    d.path([p(s*.42, .5), p(s*.86, 1.22), p(s*.86, .26)], 0, P.main, alpha, {fill: true});
    d.path([p(s*.6, .52), p(s*.82, .98), p(s*.82, .38)], 0, P.core, alpha*.8, {fill: true});
  }
  if(mask){
    const face = [p(0, .78), p(.78, .5), p(.72, -.1), p(.22, -.62), p(0, -.9), p(-.22, -.62), p(-.72, -.1), p(-.78, .5)];
    d.path([p(0, .06), ...face.map((q, i) => q), face[0]], 0, P.ink, alpha, {fill: true});
    const inner = [p(0, .68), p(.68, .44), p(.62, -.08), p(.18, -.55), p(0, -.8), p(-.18, -.55), p(-.62, -.08), p(-.68, .44)];
    d.path([p(0, .06), ...inner, inner[0]], 0, P.core, alpha, {fill: true});
    // Markings: a flame on the brow, streaks under the eyes, a dark nose.
    d.path([p(0, .62), p(.12, .38), p(0, .18), p(-.12, .38)], 0, P.main, alpha, {fill: true});
    for(const s of [-1, 1]) d.path([p(s*.62, .22), p(s*.36, .02), p(s*.5, -.2)], r*.1, P.main, alpha);
    d.path([p(-.1, -.66), p(.1, -.66), p(0, -.8)], 0, P.ink, alpha, {fill: true});
  }
  for(const s of [-1, 1]) d.path([p(s*.55, .12), p(s*.18, -.08)], r*.2, eyes, alpha, {glow: glowEyes});
}
/** A tongue of fire standing on the ground: wavering sides, a hot core. Shrinks rather than fades. */
function tongue(d, x, z, y, h, w, P, color, phase){
  if(!(h > .01)) return;
  const side = (k, s) => {const t = k/6, sway = Math.sin(phase*9+t*5)*w*.35*t; return at(x, z, y, s*w*(1-t)**.8+sway, h*t);};
  const shape = (scale, col, a) => {
    const pts = [at(x, z, y, 0, h*.05)];
    for(let k = 0; k <= 6; k++) pts.push(side(k, -scale));
    for(let k = 6; k >= 0; k--) pts.push(side(k, scale));
    d.path(pts, 0, col, a, {fill: true});
  };
  shape(1.25, P.ink, .8); shape(1, color, 1);
  const core = (k, s) => {const t = k/4; return at(x, z, y, s*w*.45*(1-t)+Math.sin(phase*9+t*4)*w*.2*t, h*.55*t);};
  d.path([at(x, z, y, 0, 0), core(0, -1), core(2, -1), core(4, 0), core(2, 1), core(0, 1)], 0, P.core, 1, {fill: true});
}

// ------------------------------------------------------------------ the tails
/** Tail centre lines in billboard space from the root, with half-widths. */
function layTails(n, {side, clock, sway, drag, whip, spread, length, width, seed}){
  const tails = [];
  for(let i = 0; i < n; i++){
    // A bushy tail: it rises from the lower back, swells, then curls out to a fine tip.
    const s = n > 1 ? i/(n-1)*2-1 : 0, base = Math.PI/2-side*.15+s*spread, L = length*(1+.14*(1-Math.abs(s)));
    const curl = s*.28-side*.08, hook = -s*1.5, line = [], widths = [];
    let u = -side*.14+s*.1, v = .05;
    for(let k = 0; k <= TAIL_STEPS; k++){
      const t = k/TAIL_STEPS, fluff = 1+.09*Math.sin(t*17+clock*3.1+i*2.3)*t*(1-t)*4;
      line.push([u, v]);
      widths.push(width*Math.sin(Math.PI*(.1+.9*t))**.5*(1-.12*t)*fluff);
      const wave = Math.sin(clock*2.3+i*1.9+seed-t*2.7)*sway*(.35+t);
      // Outer tails bend out, then the last third hooks back in: the kitsune's flame-shaped curl.
      const ang = base+curl*t+hook*Math.max(0, t-.62)**2*2.2+wave+drag*t-side*whip*t*1.25;
      u += Math.cos(ang)*L/TAIL_STEPS; v += Math.sin(ang)*L/TAIL_STEPS;
    }
    tails.push({line, widths, s, i});
  }
  // Outer tails first, so the fan layers in toward its middle.
  return tails.sort((a, b) => Math.abs(b.s)-Math.abs(a.s));
}
function tipOf(tail){
  const n = tail.line.length-1, [u, v] = tail.line[n], [pu, pv] = tail.line[n-1], l = Math.hypot(u-pu, v-pv) || 1;
  return {u, v, du: (u-pu)/l, dv: (v-pv)/l};
}

/**
 * Paint one wielder's tails and the foxfires waiting on their tips. `anchor` is the rendered body
 * {x, z, y}; `motion` its smoothed velocity. Returns the world positions of the tips (for foxfires
 * leaving them) in slot order.
 */
export function paintFoxTails(d, world, p, anchor, motion, clock, time){
  const P = foxLook(p), rank = foxRank(p), T = tier(rank), side = p.dx < -.1 ? -1 : 1;
  const x = anchor.x, z = anchor.z, y = anchor.y+.62, seed = (String(p.id).charCodeAt(0) || 7)*.37;
  const castAge = p.magicCast?.itemId === PACK ? time-p.magicCast.at : 99;
  const skillAge = p.skillCast?.itemId === PACK ? time-p.skillCast.at : 99;
  const parade = skillAge >= 0 && skillAge < PARADE ? clamp01(skillAge/.25)*clamp01((PARADE-skillAge)/.45) : 0;
  const whip = castAge >= 0 && castAge < .55 ? Math.sin(castAge/.55*Math.PI) : 0;
  const stage = Number.isInteger(p.kitsuneVolley) ? p.kitsuneVolley%3 : 0;
  const charge = CHARGE[stage]*(1-whip*.7), speed = Math.hypot(motion.vx, motion.vz);
  // Running right swings the tails left (counter-clockwise), and the other way round.
  const n = foxTailCount(rank), drag = Math.max(-.75, Math.min(.75, motion.vx*.1));
  const opts = {side, clock, seed, drag, whip: .5*whip, sway: .17+.05*Math.min(1, speed/4),
    spread: .38+.08*n+.2*whip+.3*parade, length: 1.6*(1+.04*(rank-1))*(1+.1*whip+.12*parade), width: .27+.01*rank};
  const tails = layTails(n, opts);

  // The spirit's own glow pooled on the ground behind, stronger as the nine nears.
  if(T.r >= 2) d.pool(x-side*.2, z-.15, 1+.4*charge, P.glow, (.12+.18*charge)*(1+parade));
  // Afterimage while running (★4+): the fan a step behind, in light.
  if(T.r >= 4 && speed > 1.5){
    const ghost = layTails(n, {...opts, drag: opts.drag*1.6, clock: clock-.12});
    for(const tail of ghost) strip(d, x-motion.vx*.09, z-motion.vz*.09, y, tail.line, tail.widths, P.glow, .12*Math.min(1, speed/5), {glow: true, soft: true, scale: 1.2});
  }
  // Nine spectral tails during Kitsune Parade: the kitsune's true form.
  const spirit = parade > 0 ? layTails(9, {...opts, spread: 1.4, length: opts.length*1.28, width: opts.width*.72, clock: clock*1.3}) : null;
  if(spirit){
    for(const tail of spirit){
      strip(d, x, z, y, tail.line, tail.widths, P.main, .3*parade, {grow: .02});
      strip(d, x, z, y, tail.line, tail.widths, P.glow, .28*parade, {glow: true, soft: true, scale: 1.3});
      strip(d, x, z, y, tail.line, tail.widths, P.alt, .35*parade, {from: .78, scale: .7});
    }
  }
  for(const tail of tails){
    const {line, widths} = tail;
    strip(d, x, z, y, line, widths, P.ink, .92, {grow: .045});
    strip(d, x, z, y, line, widths, P.deep, 1);
    strip(d, x, z, y, line, widths, P.fur, 1, {scale: .8, shift: .18});
    strip(d, x, z, y, line, widths, P.alt, .5, {scale: .28, shift: .45, from: .08, to: .62});
    strip(d, x, z, y, line, widths, P.core, 1, {from: .8});
    // ★5: spirit fire running up the tail, root to tip.
    if(T.r >= 5){
      const run = (clock*.75+tail.i*.23)%1;
      strip(d, x, z, y, line, widths, P.alt, .45*bump(run*1.2), {from: Math.max(0, run-.14), to: Math.min(1, run+.08), scale: .6, glow: true});
    }
  }
  // Foxfire burning on the tips: bigger and hotter as the volley builds to nine.
  const tips = [];
  for(const tail of tails.slice().sort((a, b) => a.i-b.i)){
    const tip = tipOf(tail), wx = x+tip.u, wy = y+tip.v*.694, wz = z-tip.v*.72;
    tips.push({x: wx, y: wy, z: wz});
    const heat = (T.r >= 2 ? .55+.45*charge : stage === 2 ? .8 : 0)*(1+.4*whip)+parade*.4;
    if(heat <= 0) continue;
    const flick = 1+.18*Math.sin(clock*13+tail.i*2.1), r = (.1+.09*charge)*flick*(1+.25*parade);
    const fu = tip.du*.3, fv = .7+tip.dv*.3, l = Math.hypot(fu, fv) || 1;
    flame(d, wx, wz, wy+r*.4, r, -fu/l, -fv/l, P.main, .95*heat, {lick: Math.sin(clock*9+tail.i)*.6, stretch: 2.8});
    flame(d, wx, wz, wy+r*.35, r*.55, -fu/l, -fv/l, P.core, heat, {stretch: 2.2});
    d.bloom(wx, wz, wy+r, (.28+.3*charge)*(1+parade*.5), P.glow, .5*heat);
    if(T.r >= 3 || stage === 2) d.motes(wx, wz, 2+Math.round(3*charge), clock+tail.i*.37, .12, P.alt, .9*heat, (seed*100|0)+tail.i*7, {rise: .9, life: .7, size: .045, y: wy});
  }
  // During the Parade foxfires leave the nine spectral tails instead.
  const from = spirit && parade > .2 ? spirit.slice().sort((a, b) => a.i-b.i).map(tail => {
    const tip = tipOf(tail);
    return {x: x+tip.u, y: y+tip.v*.694, z: z-tip.v*.72};
  }) : tips;
  // Foxfires still waiting on the tips (they launch from here).
  for(const b of world.magicBolts || []){
    if(b.packId !== PACK || b.ownerId !== p.id || b.launched) continue;
    const tip = from[Math.round((b.tailIndex || 0)/8*(from.length-1))];
    if(!tip) continue;
    const grow = easeOut((b.age || 0)/.14), a = (b.tailIndex || 0)*2.4+clock*5, off = .16*grow;
    paintFoxfire(d, P, T, tip.x+Math.cos(a)*off, tip.z+Math.sin(a)*off*.3, tip.y+.18+Math.sin(a)*off*.6, 0, 0, clock, b.tailIndex || 0, {size: grow, big: !!b.burst, still: true});
  }
  return from;
}

// ------------------------------------------------------------------ foxfires
/**
 * One foxfire at (x, z, y) moving along (dx, dz). ★1 a plain flame with a short trail; ★2 glow and a
 * longer tail; ★3 a fox face and sparks; ★4 twin wisps; ★5 afterimages and light. `big` is the ninth.
 */
export function paintFoxfire(d, P, T, x, z, y, dx, dz, clock, index, {size = 1, big = false, flown = 1, still = false} = {}){
  const r = (big ? .26 : .17)*size*(1+.03*T.r);
  if(!(r > .01)) return;
  // A waiting foxfire burns like a candle, point up; a flying one leads with its head.
  const [u, v] = still ? [0, -1] : screenDir(dx, dz);
  // Trail.
  if(!still){
    const len = Math.min(flown, (big ? 1.2 : .7)+.18*T.r), pts = [];
    for(let i = 0; i <= 6; i++){
      const t = i/6, wig = Math.sin(clock*16-t*7+index)*.1*t;
      pts.push([x-dx*len*t-dz*wig, y+Math.sin(t*5-clock*10)*.05*t, z-dz*len*t+dx*wig]);
    }
    d.path(pts, r*1.5, P.main, .85, {taper: .95});
    if(T.r >= 2) d.path(pts, r*2.6, P.glow, .45, {glow: true, soft: true, taper: .9});
    if(T.r >= 5) for(let k = 1; k <= 2; k++) flame(d, x-dx*len*k*.45, z-dz*len*k*.45, y, r*(1-.25*k), u, v, P.glow, .28/k, {glow: true});
  }
  if(T.r >= 2 || big) d.bloom(x, z, y, r*(big ? 3.2 : 2.4), P.glow, .55);
  const lick = Math.sin(clock*15+index*1.3)*.5;
  flame(d, x, z, y, r*1.18, u, v, P.ink, .8, {lick, stretch: 2.5});
  flame(d, x, z, y, r, u, v, P.main, 1, {lick, stretch: 2.5});
  flame(d, x, z, y, r*.55, u, v, P.core, 1, {lick: lick*.5, stretch: 1.9});
  if(T.r >= 3 || big) foxFace(d, x, z, y+r*.05, r*.95, P, .95, {tilt: Math.sin(clock*7+index)*.12, eyes: big ? P.core : P.ink, glowEyes: big});
  if(T.r >= 3 && !still) d.sparks(x, z, y, 3, (clock*1.7+index*.13)%.5, P.alt, .9, index*17+3, {speed: 2.2, up: 1.2, gravity: 4, life: .5, len: .05, width: .05});
  if(T.r >= 4) for(let k = 0; k < 2; k++){
    const a = clock*9+k*Math.PI+index, wx = x+Math.cos(a)*r*2.2, wz = z+Math.sin(a)*r*1.1, wy = y+Math.sin(a)*r*1.2;
    d.orb(wx, wz, wy, r*.28, P.core, .95, {glow: true});
    d.bloom(wx, wz, wy, r*.7, P.glow, .5);
  }
  if(big) d.ring(x, z, r*2.3+.08*Math.sin(clock*12), .05, P.alt, .8, {y, glow: true});
  if(T.r >= 5 || big) d.light(x, z, big ? 2.2 : 1.3);
}

/** A launched foxfire from the world list, leaving its tail tip smoothly. */
export function paintFoxBolt(d, b, owner, tips, lead, clock){
  const P = foxLook(owner), T = tier(foxRank(owner));
  const speed = Math.hypot(b.vx || 0, b.vz || 0) || 1, dx = (b.vx || 0)/speed, dz = (b.vz || 0)/speed;
  const ahead = Math.min(lead, Math.max(0, ((b.maxRange || 11)-(b.traveled || 0))/speed));
  let x = b.x+(b.vx || 0)*ahead, z = b.z+(b.vz || 0)*ahead, y = 1+Math.sin((b.age || 0)*11+(b.tailIndex || 0))*.07;
  const flyAge = Math.max(0, (b.age || 0)+lead-(b.delay || 0));
  const tip = tips?.[Math.round((b.tailIndex || 0)/8*(tips.length-1))];
  if(tip && flyAge < .22){const w = easeOut2(flyAge/.22); x = lerp(tip.x, x, w); z = lerp(tip.z, z, w); y = lerp(tip.y+.18, y, w);}
  if(!d.near(x, z)) return;
  paintFoxfire(d, P, T, x, z, y, dx, dz, clock, b.tailIndex || 0, {big: !!b.burst, flown: (b.traveled || 0)+.2});
}

// ------------------------------------------------------------------ hits, bursts and casts
/** A foxfire landing: a flame pop; the ninth's spirit burst is the big one. */
export function paintFoxPuff(d, e, look, rank, lead){
  const P = foxLook(look), T = tier(rank), age = (e.age || 0)+lead, big = e.burst ?? (e.tailIndex === 8);
  const life = e.life || (big ? 1.1 : .5), k = age/life, seed = (e.tailIndex || 0)*31+Math.round(e.x*7);
  if(k >= 1 || !d.near(e.x, e.z)) return;
  if(!big){
    d.mark(e.x, e.z, .25+.55*easeOut(k/.6), .05, P.main, fade(k/.8), {halo: .4});
    for(let i = 0; i < 3; i++){
      const a = i/3*TAU+seed, rr = .25+.3*easeOut(k);
      flame(d, e.x+Math.cos(a)*rr, e.z+Math.sin(a)*rr*.5, .35+.5*easeOut(k), .11*(1-k), 0, -1, i ? P.main : P.core, 1, {stretch: 2.8});
    }
    d.sparks(e.x, e.z, .8, 4+T.r, age, P.alt, 1, seed, {speed: 2.6, up: 2.4, gravity: 7, life: .45, width: .06});
    if(T.r >= 2) d.bloom(e.x, e.z, .8, .5, P.glow, .6*fade(k));
    if(T.r >= 3) foxFace(d, e.x, e.z, .9+.7*easeOut(k), .17*fade(k, .8), P, 1);
    if(T.r >= 4) d.pool(e.x, e.z, .6, P.glow, .35*fade(k));
    return;
  }
  // The spirit burst: a ring of fire the size of the blast, tongues all round, the fox rising out of it.
  const R = e.radius || 2, grow = easeOut(k/.35);
  d.pool(e.x, e.z, R*1.1, P.glow, .5*fade(k));
  d.stain(e.x, e.z, R*.55, P.ink, .25*fade(k, .8));
  if(age < .3){d.bloom(e.x, e.z, .8, R*.9, P.core, .9*fade(age/.3)); d.bloom(e.x, e.z, .9, R*.6, P.glow, fade(age/.3));}
  d.mark(e.x, e.z, R*grow, .1, P.main, fade(k, 1.2), {halo: .5});
  d.shock(e.x, e.z, .3+R*1.35*easeOut(k/.5), .08, P.glow, fade(k/.55), P.core);
  if(T.r >= 3) d.sigil(e.x, e.z, R*.75, P.deep, .85*fade(k, 1.3)*easeOut(k/.15), {spin: age*1.5, sides: 9, glow: false});
  for(let i = 0; i < 9; i++){
    const a = i/9*TAU+seed*.1, kk = (age-i*.02)/(life*.8);
    if(kk <= 0 || kk >= 1) continue;
    const rr = R*.85*grow, fx = e.x+Math.cos(a)*rr, fz = e.z+Math.sin(a)*rr;
    const hgt = (.7+.25*Math.sin(age*14+i))*bump(Math.min(1, kk*1.3))**.7*(1-kk*.4);
    // (Stood a little above the ground layer, so outline and fill stay in one list.)
    tongue(d, fx, fz, .18, hgt, .28, P, i%2 ? P.main : P.fur, age+i);
  }
  const head = easeOut(k/.3);
  foxFace(d, e.x, e.z, 1.3+.9*easeOut(k), (.5+.3*head)*(1+.15*T.r/5)*fade(k, .9), P, Math.min(1, head*2), {tilt: Math.sin(age*6)*.08, eyes: P.ink, mask: true});
  d.sparks(e.x, e.z, .9, 10+T.sparks, age, P.alt, 1, seed, {speed: 4.5, up: 4, gravity: 8, life: .7});
  if(T.r >= 4 && age < .35) d.rays(e.x, e.z, 1, 10, R*1.2, .09, P.alt, 1-age/.35, seed, age);
  if(T.r >= 5) for(let i = 0; i < 6; i++){const a = i/6*TAU+age*2; d.twinkle(e.x+Math.cos(a)*R*grow, e.z+Math.sin(a)*R*grow*.6, .6+age, .16, P.core, fade(k), age*6+i);}
  d.light(e.x, e.z, R*1.6*fade(k));
}

/** The wielder's cast: a ring (★2), a nine-point sigil (★3); the nine-volley always shows. */
export function paintFoxCast(d, e, owner, lead){
  const P = foxLook(owner), T = tier(foxRank(owner)), age = (e.age || 0)+lead, k = age/(e.life || .95);
  if(k >= 1 || !d.near(e.x, e.z)) return;
  const nine = (e.volleyCount || 9) >= 9;
  if(T.r < 2 && !nine) return;
  d.shock(e.x, e.z, .4+(nine ? 2 : 1.2)*easeOut(k/.5), .06, nine ? P.glow : P.main, fade(k/.6), P.core);
  if(T.r >= 3 || nine) d.sigil(e.x, e.z, nine ? 1.5 : 1.1, P.main, .9*fade(k, 1.3)*easeOut(age/.12), {spin: age*2, sides: 9, glow: T.r >= 4});
  if(nine) d.pool(e.x, e.z, 1.8, P.glow, .4*fade(k));
}

/** The kick of the ninth's burst: a camera jolt from ★3, a flash at ★5. */
export const FOX_EVENTS = {
  foxburst: {life: () => .01, kick: ev => {const T = tier(ev.rank); return {shake: .12+T.shake*.6, flash: T.r >= 5 ? .14 : 0, color: foxLook(ev.look).core};}, paint(){}},
};

// ------------------------------------------------------------------ Kitsune Parade
/** One ring of nine foxfires pouring out: nine flame pillars wheeling out from the wielder. */
export function paintFoxRing(d, ev, age){
  const P = foxLook(ev.look), T = tier(ev.rank), k = age/.7;
  if(k >= 1) return;
  d.shock(ev.x, ev.z, .5+2.2*easeOut(k), .08, P.main, fade(k), P.core);
  for(let i = 0; i < 9; i++){
    const a = i/9*TAU+(ev.v ?? ev.ring ?? 0)*.35+age*2.5, rr = .6+1.6*easeOut(k), fx = ev.x+Math.cos(a)*rr, fz = ev.z+Math.sin(a)*rr;
    // Flames go by shrinking, not fading: a see-through fill over its ink would muddy the colour.
    tongue(d, fx, fz, .18, .75*bump(Math.min(1, k*1.2))**.7, .26, P, i%2 ? P.main : P.fur, age+i);
  }
  if(T.r >= 3) d.sigil(ev.x, ev.z, 1.4, P.main, fade(k, 1.2), {spin: age*4, sides: 9, glow: T.r >= 4});
  if(T.r >= 5) for(let i = 0; i < 9; i++){const a = i/9*TAU-age*3; d.twinkle(ev.x+Math.cos(a)*2, ev.z+Math.sin(a)*1.2, .5+k, .12, P.core, fade(k), age*6+i);}
}
/**
 * The fox spirit's pounce, before it lands: it rises off the wielder and leaps in an arc onto the
 * target, a great fox head with a body of flame and three tails streaming behind.
 */
export function paintFoxLeap(d, b, tt, clock){
  const P = foxLook(b.look), leap = .6, k = 1-(b.at-tt)/leap;
  if(k < 0 || k > 1) return;
  const ox = b.ox ?? b.x, oz = b.oz ?? b.z, s = easeIn(k)*.35+k*.65;
  const x = lerp(ox, b.x, s), z = lerp(oz, b.z, s), y = 1.2+3.2*Math.sin(Math.PI*Math.min(1, s*1.05))-.4*s;
  // Where it will land.
  d.sigil(b.x, b.z, (b.r || 3.4)*(1.1-.2*k), P.main, .8*k, {spin: clock*2, sides: 9, glow: false});
  d.pool(b.x, b.z, (b.r || 3.4)*.8, P.glow, .35*k);
  // Body and tails: ribbons trailing back along the arc.
  const back = (t, lift = 0) => {const q = Math.max(0, s-t); return [lerp(ox, b.x, q), 1.2+3.2*Math.sin(Math.PI*Math.min(1, q*1.05))-.4*q+lift, lerp(oz, b.z, q)];};
  const body = [0, .05, .1, .15, .2].map(t => back(t));
  d.path(body, .9, P.glow, .5, {glow: true, soft: true, taper: .8});
  d.path(body, .55, P.main, .95, {taper: .85});
  for(let j = -1; j <= 1; j++){
    const tail = [.18, .26, .34, .42].map((t, i) => {const p = back(t, j*.25*i+Math.sin(clock*9+j*2+i)*.12); return p;});
    d.path(tail, .34, P.fur, .9, {taper: .9});
    d.path(tail.slice(2), .26, P.core, .9, {taper: .9});
  }
  d.bloom(x, z, y, 1.4, P.glow, .6);
  foxFace(d, x, z, y, .8, P, 1, {tilt: Math.sin(clock*6)*.1-.15, eyes: P.ink, mask: true});
  d.sparks(x, z, y, 8, (clock*1.3)%.6, P.alt, .9, 77, {speed: 3, up: 1, gravity: 4, life: .6});
  d.light(x, z, 2.5);
}
/** The spirit lands: the biggest burst the kitsune has, the fox head roaring up out of it. */
export function paintFoxPounce(d, ev, age, seed){
  const P = foxLook(ev.look), T = tier(ev.rank), R = ev.r || 3.4, life = 1.4, k = age/life;
  if(k >= 1) return;
  paintFoxPuff(d, {x: ev.x, z: ev.z, age, life, radius: R, burst: true, tailIndex: 8}, ev.look, ev.rank, 0);
  if(T.r >= 3) d.groundRays(ev.x, ev.z, 12, R*.4, R*1.3*easeOut(age/.3), .12, P.main, fade(k/.6), seed, 0);
  if(T.r >= 4) d.beam(ev.x, ev.z, 0, 6*easeOut(age/.2), 1.4*(1-k), P.glow, .5*fade(k));
}
/** The Parade's cast: a burst of the colour at the wielder's feet (the tails do the rest). */
export function paintFoxSkillCast(d, cast, look, age){
  const P = foxLook(look), T = tier(cast.rank), k = age/.8;
  if(k >= 1) return;
  d.shock(cast.x, cast.z, .5+2.4*easeOut(k), .09, P.main, fade(k), P.core);
  d.pool(cast.x, cast.z, 2.2, P.glow, .45*fade(k));
  if(T.r >= 3) d.sigil(cast.x, cast.z, 1.8, P.main, fade(k, 1.2)*easeOut(age/.1), {spin: age*3, sides: 9, glow: T.r >= 4});
}
