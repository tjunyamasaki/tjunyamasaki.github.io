// The Reaper's scythe, drawn. Presentation only: the host owns Doom, the reaping and the souls
// (src/reaper.mjs). The shade of Death stands behind the wielder (a rig): a hooded cloak, two eyes in the
// dark, bony hands on a great spectral scythe, and the souls it has taken burning round its hood. It grows
// with every soul. Each swing is its scythe sweeping round; Doom shows as tally hooks over a foe, and a foe
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
const INKD = '#0b1515';
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

/** A scythe blade: a crescent hooked off the top of a shaft at `tip`, curving toward `side`. Billboard space. */
function blade(q, tip, ang, side, len, width){
  const pts = [], back = [];
  for(let i = 0; i <= 12; i++){
    const t = i/12, a = ang+side*(Math.PI*.5+t*1.1), r = len*t, w = width*Math.sin(Math.PI*Math.min(1, t*1.1))*(1-t*.6);
    const cu = tip[0]+Math.cos(ang+side*Math.PI*.5)*r+Math.cos(a)*r*.25, cv = tip[1]+Math.sin(ang+side*Math.PI*.5)*r-t*t*len*.45;
    pts.push(q(cu, cv+w)); back.push(q(cu, cv-w*.3));
  }
  return [...pts, ...back.reverse()];
}

/**
 * The shade of Death at (x, z), standing on y0, size `s`. `raise` 0..1 lifts the scythe overhead,
 * `hide` 0..1 hides the scythe (while a sweep draws it), `blood` turns its eyes and edge red.
 */
function shade(d, x, z, y0, s, {raise = 0, hide = 0, blood = 0, T = tier(1), clock = 0, seed = 0, side = 1, drift = 0} = {}){
  const q = (u, v) => at(x, z, y0, u*s*side, v*s);
  // The cloak: hood, shoulders, a hem that ripples and tatters.
  const hem = [];
  for(let i = 0; i <= 8; i++){const t = i/8, u = -.5+t, v = (i%2 ? .12 : 0)+Math.sin(clock*3+i+seed)*.04; hem.push([u+drift*.12*(1-t), v]);}
  const outline = [[-.13, 1.95], [.12, 1.96], [.26, 1.72], [.38, 1.28], [.47, .45], ...hem.slice().reverse(), [-.47, .45], [-.38, 1.28], [-.26, 1.72]];
  const body = outline.map(([u, v]) => q(u, v)), inkBody = outline.map(([u, v]) => q(u*1.08, v*1.02-.02));
  d.path(inkBody, 0, INKD, 1, {fill: true});
  d.path(body, 0, CLOAK, 1, {fill: true});
  d.path([q(-.2, 1.8), q(-.3, 1.3), q(-.36, .5)], .05*s, CLOAK_LIGHT, 1);
  d.path([...body, body[0]], .03*s, P.glow, .7);
  // ★3: streamers torn off the hem, trailing away from the way you move.
  if(T.rays) for(let i = 0; i < 3; i++){
    const u0 = -.35+i*.33, line = [];
    for(let k = 0; k <= 4; k++){const t = k/4; line.push(q(u0-drift*.5*t+Math.sin(clock*4+i*2+t*3)*.08*t, .05-t*.1+t*.25));}
    d.path(line, .07*s, CLOAK, 1, {taper: .9});
  }
  // The hood's dark and the eyes in it.
  const hood = [];
  for(let i = 0; i <= 12; i++){const a = i/12*TAU; hood.push(q(Math.cos(a)*.13, 1.64+Math.sin(a)*.16));}
  d.path(hood, 0, VOID, 1, {fill: true});
  const eye = blood > .5 ? BLOOD : P.main;
  for(const u of [-.055, .055]){
    const e = q(u, 1.66);
    d.orb(e[0], e[2], e[1], .03*s, eye, 1);
    if(T.glow) d.bloom(e[0], e[2], e[1], .1*s, blood > .5 ? BLOOD : P.glow, .7);
  }
  // Bony hands on the shaft; the scythe raised or held low across the body.
  if(hide < .98){
    const a = lerp(1.15, 1.75, raise), base = [-.42+.2*raise, .3+.9*raise], len = 2.3;
    const top = [base[0]+Math.cos(a)*len, base[1]+Math.sin(a)*len];
    const shaft = [q(...base), q(...top)], alpha = 1-hide;
    d.path(shaft, .1*s, INKD, alpha);
    d.path(shaft, .055*s, BONE, alpha);
    const blade_ = blade(q, top, a, 1, .95, .16);
    d.path([...blade_, blade_[0]], .05, INKD, alpha);
    d.path(blade_, 0, BLADE, alpha, {fill: true});
    if(T.glow) d.path(blade_.slice(0, 13), .05*s, blood > .5 && T.prism ? BLOOD : P.main, alpha, {glow: true});
    for(const t of [.3, .55]){const h = q(lerp(base[0], top[0], t), lerp(base[1], top[1], t)); d.orb(h[0], h[2], h[1], .07*s, BONE, alpha); d.orb(h[0], h[2], h[1], .07*s+.02, INKD, alpha*.4);}
  }
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
  shade(d, x, z, y, s, {raise, hide, blood: full ? 1 : 0, T, clock, seed, side, drift: Math.max(-1, Math.min(1, motion.vx*.25))*side});
  // Its souls burning round the hood.
  for(let i = 0; i < souls; i++){
    const a = clock*1.6+i*TAU/souls, hx = x+Math.cos(a)*.45*s, hz = z+Math.sin(a)*.2*s, hy = y+1.75*s+Math.sin(a)*.1*s*.69;
    soul(d, hx, hz, hy, .075*s, 1, {tu: -Math.sin(a)*.8, tv: -.4, phase: clock+i, red: full && T.prism});
    if(T.glow) d.bloom(hx, hz, hy, .18*s, full && T.prism ? BLOOD : P.glow, .45);
  }
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
