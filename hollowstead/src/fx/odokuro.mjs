// The Gashadokuro's Hand, drawn. Presentation only: the host owns the grabs, the throws and the ball
// (magic/odokuro.mjs). A great skeletal hand floats at the wielder's shoulder, ghost-fire in its knuckles
// burning brighter as its hunger grows (a fistful is coming); it reaches out on a rope of vertebrae, closes
// on its prey, carries it through the air and lets it fall with a crack of bone dust.
// Ranks: ★1 the plain hand; ★2 ghost-fire glow and a trail; ★3 bone splinters and sparks; ★4 a camera kick
// on the crash and a sigil; ★5 green-and-red ghost-fire and the most debris.
import {INK, TAU, at, bump, clamp01, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';
import {HAND} from '../magic/odokuro.mjs?v=harvest-18';

const PACK = 'odokuro';
const P = hue(PACK), BONE = '#e8dcc0', BONE_D = '#b9a986';
const rankOfOwner = p => p && typeof p === 'object' ? rankOf(p, PACK) : 1;

/**
 * A skeletal hand at (x, z, y), `s` its size, `face` 1 right / -1 left, `grip` 0 open .. 1 closed.
 * Drawn in billboard space: a palm, four fingers of three bones, a thumb.
 */
function hand(d, x, z, y, s, face, grip, fire, T, alpha = 1){
  const q = (u, v) => at(x, z, y, u*s*face, v*s);
  const bone = (a, b, w) => {d.path([a, b], w*s*1.35, INK, .9*alpha); d.path([a, b], w*s, BONE, alpha);};
  // The palm and wrist.
  d.path([q(-.32, -.3), q(.28, -.36), q(.36, .22), q(-.3, .26), q(-.32, -.3)], 0, INK, .9*alpha, {fill: true});
  d.path([q(-.26, -.24), q(.22, -.29), q(.29, .17), q(-.24, .2), q(-.26, -.24)], 0, BONE, alpha, {fill: true});
  // The long bones of the palm, so it reads as bone and not a glove.
  for(let i = 0; i < 4; i++) d.path([q(-.2+i*.15, -.2), q(-.22+i*.16, .18)], .035*s, BONE_D, alpha);
  bone(q(-.05, -.32), q(-.15, -.75), .2);
  // Fingers: curled by `grip`.
  for(let i = 0; i < 4; i++){
    const bx = -.24+i*.17, base = q(bx, .25);
    let a = Math.PI/2-.12+i*.08, px = bx, pv = .25;
    for(let j = 0; j < 3; j++){
      const L = [.34, .27, .21][j]*(i === 0 || i === 3 ? .9 : 1);
      a -= grip*1.05;
      const nx = px+Math.cos(a)*L, nv = pv+Math.sin(a)*L;
      bone(q(px, pv), q(nx, nv), .12-.02*j);
      px = nx; pv = nv;
    }
    void base;
  }
  // Thumb.
  const ta = Math.PI*.9-grip*.6;
  bone(q(-.3, -.05), q(-.3+Math.cos(ta)*.3, -.05+Math.sin(ta)*.3), .12);
  // Ghost-fire in the knuckles: hotter as hunger grows.
  if(fire > 0){
    for(let i = 0; i < 4; i++){const k = q(-.24+i*.17, .26); d.orb(k[0], k[2], k[1], .045*s*(1+fire), T.r >= 5 && i%2 ? P.alt : P.glow, alpha*Math.min(1, .4+fire*.3), {glow: T.r >= 2});}
    if(T.r >= 2) d.bloom(x, z, y, .5*s*(1+fire*.5), P.glow, .25*fire*alpha);
  }
}

/** The hand floating at the wielder's shoulder, bobbing; hidden while it is out grabbing. */
function paintRest(d, world, p, anchor, motion, clock, time){
  const T = tier(rankOfOwner(p)), face = p.dx < -.1 ? -1 : 1, out = (world.magicSweeps || []).some(s => s.packId === PACK && s.ownerId === p.id && s.kind === 'grab' && s.age < HAND.grab+HAND.flight+.2);
  const hunger = (p.odkHunger | 0)/HAND.hunger, x = anchor.x-face*.55, z = anchor.z-.15, y = anchor.y+1.55+Math.sin(clock*2.2)*.08;
  if(!out){
    hand(d, x, z, y, .9, -face, .25+.15*Math.sin(clock*1.7), .4+hunger*1.4, T);
    if(hunger >= 1) d.motes(x, z, 4, clock%1, .35, P.glow, .8, 41, {rise: 1, size: .07, y});
  }
  return {x, y, z};
}

function paintGrab(d, s, owner, ctx){
  const T = tier(rankOfOwner(owner)), age = (s.age || 0)+ctx.lead, rest = ctx.rig(s.ownerId) || {x: s.ox, y: 1.6, z: s.oz};
  const face = (s.hx ?? s.ox) < s.ox ? -1 : 1;
  let x, z, y, grip;
  if(age < HAND.grab){
    // Reaching out on a rope of vertebrae.
    const t = easeOut(age/HAND.grab); x = lerp(rest.x, s.hx, t); z = lerp(rest.z, s.hz, t); y = lerp(rest.y, 1.1, t); grip = .1;
  }else if(s.slap){
    const t = (age-HAND.grab)/.35; if(t > 1) return;
    x = s.hx; z = s.hz; y = 1.1+.6*bump(t); grip = .3;
  }else if(s.to){
    const t = clamp01((age-HAND.grab)/HAND.flight);
    x = lerp(s.sx, s.to[0], t); z = lerp(s.sz, s.to[1], t); y = 1.2+HAND.arc*bump(t); grip = 1;
    if(t >= 1){const back = clamp01((age-HAND.grab-HAND.flight)/.3); if(back >= 1) return; x = lerp(x, rest.x, back); z = lerp(z, rest.z, back); y = lerp(1.2, rest.y, back); grip = .2;}
  }else{const t = (age-HAND.grab)/.3; if(t > 1) return; x = s.hx; z = s.hz; y = 1.1; grip = .6;}
  if(!d.near(x, z, 4)) return;
  // The vertebrae from the shoulder.
  const n = 7;
  for(let i = 1; i < n; i++){const t = i/n, vx = lerp(rest.x, x, t), vz = lerp(rest.z, z, t), vy = lerp(rest.y, y, t)+.25*bump(t); d.orb(vx, vz, vy, .1, INK, .9); d.orb(vx, vz, vy, .075, BONE, 1);}
  if(T.r >= 2 && s.to) d.path([[s.sx, 1.2, s.sz], [x, y, z]], .3, P.glow, .25, {glow: true, soft: true, taper: .8});
  hand(d, x, z, y, s.fistful ? 1.5 : 1.2, face, grip, 1+(s.fistful ? 1 : 0), T);
}

function paintBall(d, s, owner, ctx){
  const T = tier(rankOfOwner(owner)), age = (s.age || 0)+ctx.lead;
  if(s.burst || !d.near(s.bx, s.bz, 3)) return;
  const roll = (s.traveled || 0)*1.7+age, r = .9+.06*Math.min(12, s.ids?.length || 0);
  d.orb(s.bx, s.bz, r, r*1.08, INK, .9); d.orb(s.bx, s.bz, r, r, BONE_D, 1);
  for(let i = 0; i < 9; i++){
    const a = i/9*TAU+roll, b = a+.9, rr = r*.7;
    d.path([at(s.bx, s.bz, r, Math.cos(a)*rr, Math.sin(a)*rr), at(s.bx, s.bz, r, Math.cos(b)*rr*.5, Math.sin(b)*rr*.5)], .12, BONE, 1);
  }
  d.orb(s.bx, s.bz, r+.2, .28, BONE, 1); d.orb(s.bx-.1, s.bz, r+.25, .06, INK, 1); d.orb(s.bx+.1, s.bz, r+.25, .06, INK, 1);
  if(T.r >= 2) d.pool(s.bx, s.bz, r*1.3, P.glow, .25);
  if(age > .45) d.debris(s.bx, s.bz, 3+T.r, (age*2)%1, '#8f8572', (s.id?.length || 7)*3, {speed: 2, up: 2, size: .07});
}

export const ODOKURO_EVENTS = {
  odkcrash: {life: () => .7, kick: ev => ({shake: .12+tier(ev.rank).shake*.6}), paint(d, ev, age, seed){
    const k = age/.7, T = tier(ev.rank), R = ev.radius || 2.1;
    d.stain(ev.x, ev.z, R, '#3a3230', .35*fade(k));
    d.shock(ev.x, ev.z, .4+R*easeOut(k/.5), .1, BONE, fade(k), '#ffffff');
    d.debris(ev.x, ev.z, 8+T.sparks, age, '#cbbd98', seed, {speed: 4, up: 4, size: .09});
    if(T.r >= 3) d.sparks(ev.x, ev.z, .4, T.sparks, age, P.glow, fade(k), seed, {speed: 4, up: 3});
    if(T.r >= 4) d.sigil(ev.x, ev.z, R*.7, P.glow, .6*fade(k), {spin: age*2, sides: 5, glow: false});
  }},
  odkslap: {life: () => .4, kick: () => ({shake: .12}), paint(d, ev, age){d.shock(ev.x, ev.z, .3+1.4*easeOut(age/.4), .08, BONE, fade(age/.4), '#ffffff');}},
  odkburst: {life: () => 1, kick: ev => ({shake: .3+tier(ev.rank).shake*.6, flash: tier(ev.rank).flash, color: '#f2ead6'}), paint(d, ev, age, seed){
    const k = age/1, T = tier(ev.rank), R = ev.radius || 3.4;
    d.stain(ev.x, ev.z, R*1.1, '#3a3230', .4*fade(k));
    d.shock(ev.x, ev.z, .5+R*1.2*easeOut(k/.5), .14, BONE, fade(k), '#ffffff');
    d.debris(ev.x, ev.z, 16+T.sparks, age, '#cbbd98', seed, {speed: 6, up: 6, size: .12});
    if(T.r >= 3) d.groundRays(ev.x, ev.z, 10, .5, R*1.3*easeOut(age/.3), .12, BONE, .7*fade(k), seed, 0);
    d.light(ev.x, ev.z, R*1.5*fade(k));
  }},
  'fx:avalanche': {life: () => .6, paint(d, ev, age){
    const k = age/.6, a0 = (ev.angle || 0)-1.48, a1 = (ev.angle || 0)+1.48, pts = [];
    for(let i = 0; i <= 20; i++){const a = lerp(a0, a1, Math.min(1, i/20/Math.max(.05, easeOut(k/.6)))); pts.push([ev.x+Math.cos(a)*6.5, .5, ev.z+Math.sin(a)*6.5]);}
    d.path(pts, .9, INK, .6*fade(k)); d.path(pts, .7, BONE, .8*fade(k));
  }},
};

export const ODOKURO_FX = {
  id: PACK,
  events: ODOKURO_EVENTS,
  lists: {magicSweeps: (d, s, owner, ctx) => s.kind === 'ball' ? paintBall(d, s, owner, ctx) : paintGrab(d, s, owner, ctx)},
  magicCast: false,
  rig: (d, world, p, anchor, motion, clock, time) => {const keep = paintRest(d, world, p, anchor, motion, clock, time); return {keep, origin: {x: keep.x, y: 0, z: keep.z-.3}};},
};
