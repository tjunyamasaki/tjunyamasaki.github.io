// The Wightcaller horn, drawn. Presentation only: the host owns the knight's orders, charges and strikes
// (src/wightcaller.mjs); the Grave Knight himself is the theme's sprite. Around him this draws the horn's
// song: the three note runes over his head (the next one lit), the frozen track of every charge, the
// strike of each note, and a spectral bond back to the horn. Icy spectral blue, painted over ink.
//
// Rank ladder: ★1 runes, tracks, the three strikes; ★2 glow, the bond to the horn, frost puffs on the
// charge; ★3 sparks, stun stars on the Gravefall, a second ring; ★4 a sigil under the knight, debris,
// pillars, camera kick; ★5 gold on the Gravefall and the ghost riders, a flash when the Hunt lands.
import {INK, TAU, at, bump, clamp01, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {HORN} from '../wightcaller.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'wighthorn';
const P = hue(PACK);
const INKB = '#0c1a26', ICE = '#dff4ff', GOLD = '#ffd66a', STEEL = '#b9cfdc';
const rankOfOwner = p => p && typeof p === 'object' ? rankOf(p, PACK) : 1;

// ------------------------------------------------------------------ note runes
/** One note's rune, billboarded at (x, z, y): thrust ▲ spear, cleave ◠ crescent, gravefall ▼ hammer. */
function rune(d, x, z, y, note, s, color, alpha, glow = false){
  if(!(alpha > .02)) return;
  const q = (u, v) => at(x, z, y, u*s, v*s);
  const shapes = [
    [[q(0, .55), q(.3, -.1), q(.1, -.05), q(.1, -.5), q(-.1, -.5), q(-.1, -.05), q(-.3, -.1)]],
    [(() => {const o = [], i = []; for(let k = 0; k <= 10; k++){const a = Math.PI*(.1+.8*k/10); o.push(q(Math.cos(a)*.5, Math.sin(a)*.5-.2)); i.push(q(Math.cos(a)*.28, Math.sin(a)*.32-.2));} return [...o, ...i.reverse()];})()],
    [[q(-.42, .45), q(.42, .45), q(.42, .2), q(.12, .2), q(.12, -.1), q(.3, -.1), q(0, -.55), q(-.3, -.1), q(-.12, -.1), q(-.12, .2), q(-.42, .2)]],
  ];
  for(const pts of shapes[note] || shapes[0]){
    d.path([...pts, pts[0]], .07*s+.02, INKB, alpha);
    d.path(pts, 0, color, alpha, {fill: note === 1 ? 'ribbon' : true, glow});
  }
}

// ------------------------------------------------------------------ the rig: around the knight
function paintKnight(d, world, p, anchor, motion, clock, time){
  const k = (world.allies || []).find(a => a.owner === p.id && a.type === 'wight' && a.hp > 0);
  if(!k || !Number.isFinite(k.x)) return {};
  const T = tier(rankOfOwner(p)), o = k.order, x = k.x, z = k.z;
  // The bond back to the horn (★2).
  if(T.glow){
    const pts = [];
    for(let i = 0; i <= 12; i++){const t = i/12, sag = Math.sin(Math.PI*t)*.15; pts.push([lerp(anchor.x, x, t), .07+sag*0, lerp(anchor.z, z, t)+sag]);}
    d.path(pts, .05, P.glow, .35, {glow: true, soft: true});
    const q = (clock*.7)%1, m = pts[Math.round(q*12)];
    d.orb(m[0], m[2], .08, .07, P.core, .7*bump(q), {glow: true});
  }
  // Under him: a ring of frost, a sigil from ★4.
  d.ring(x, z, .7, .035, P.main, .6, {glow: false, ink: .03});
  if(T.glow) d.pool(x, z, 1, P.glow, .3);
  if(T.sigil) d.sigil(x, z, .95, P.main, .45, {spin: clock*.8, sides: 3, glow: false});
  // The charge: a frozen track from where he set off, frost kicked up behind him.
  if(o && o.phase === 'charge'){
    const sx = o.sx, sz = o.sz, span = Math.hypot(x-sx, z-sz);
    if(span > .3){
      const ux = (x-sx)/span, uz = (z-sz)/span, nx = -uz, nz = ux, w = .32;
      const track = [[sx+nx*w*.3, .06, sz+nz*w*.3], [x+nx*w, .06, z+nz*w], [x-nx*w, .06, z-nz*w], [sx-nx*w*.3, .06, sz-nz*w*.3]];
      d.path(track, 0, ICE, .8, {fill: true});
      d.path([[sx, .065, sz], [x, .065, z]], .1, P.main, 1, {taper: .6});
      if(T.glow) d.path([[sx, .9, sz], [x, .9, z]], .7, P.glow, .3, {glow: true, soft: true, taper: .9});
      for(let i = 0; i < 3; i++){
        const q = ((clock*5+i/3)%1), px = x-ux*q*1.4+nx*Math.sin(i*2.3)*.3, pz = z-uz*q*1.4+nz*Math.sin(i*2.3)*.3;
        d.orb(px, pz, .2+q*.5, .12+.2*q, ICE, .8*(1-q));
      }
      if(o.note === 2){
        // A leap: his target waits, ringed, and his arc crosses the sky.
        const tt = clamp01(1-Math.hypot(o.tx-x, o.tz-z)/Math.max(.5, Math.hypot(o.tx-sx, o.tz-sz)));
        d.mark(o.tx, o.tz, HORN.notes[2].r*(1.1-.4*tt), .06, P.main, .9, {halo: T.glow ? .4 : 0});
        d.stain(o.tx, o.tz, .8, INKB, .3+.3*tt);
      }
    }
  }
  // The song: the three note runes over his head, the next one lit and bobbing.
  // The runes float just over the sprite's helmet.
  const next = ((k.note ?? -1)+1)%3, y = 3.85, v0 = .05*Math.sin(clock*3);
  for(let i = 0; i < 3; i++){
    const u = (i-1)*.68, lit = i === next, bob = lit ? .08*Math.sin(clock*6) : 0;
    const q = at(x, z, y, u, v0+bob);
    rune(d, q[0], q[2], q[1], i, lit ? .58 : .32, lit ? (i === 2 && T.prism ? GOLD : P.core) : STEEL, lit ? 1 : .55, lit && T.glow);
    if(lit && T.glow) d.bloom(q[0], q[2], q[1], .3, P.glow, .5);
  }
  if(T.glow) d.light(x, z, 1.4);
  return {origin: {x, y: 0, z: z+.06}};
}

// ------------------------------------------------------------------ the horn and the strikes
/** A blow of the horn: rings of sound rolling out toward the knight. */
function blow(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.55;
  if(k >= 1) return;
  const face = Math.atan2((ev.kz ?? ev.z)-ev.z, (ev.kx ?? ev.x+1)-ev.x);
  for(let i = 0; i < 3; i++){
    const q = clamp01((age-i*.07)/.4);
    if(q <= 0 || q >= 1) continue;
    d.crescent(ev.x, ev.z, .9, .5+1.6*easeOut(q), face, 1.4, .16*(1-q), P.main, .9*fade(q), {glow: T.glow});
  }
  const top = at(ev.x, ev.z, 1.9+.5*easeOut(k), 0, 0);
  rune(d, top[0], top[2], top[1], ev.note || 0, .3, P.core, fade(k), T.glow);
}

function thrust(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.45, fx = ev.dx ?? 1, fz = ev.dz ?? 0, nx = -fz, nz = fx;
  if(k >= 1) return;
  const L = (ev.r || 1.5)+2.2, g = easeOut(clamp01(age/.1)), x0 = ev.x-fx*L*.45, z0 = ev.z-fz*L*.45, y = .95;
  const tip = [x0+fx*L*g, y, z0+fz*L*g], w = .5*(1-k*.5);
  const wedge = [[x0+nx*w, y, z0+nz*w], tip, [x0-nx*w, y, z0-nz*w]];
  d.path([...wedge, wedge[0]], .07, INKB, fade(k));
  d.path(wedge, 0, ICE, fade(k), {fill: true});
  d.path([[x0, y, z0], tip], .12, P.main, fade(k), {glow: T.glow});
  d.path([[x0+fx*L*.3, y+.05, z0+fz*L*.3], tip], .05, '#ffffff', fade(k), {taper: .3});
  if(T.glow) d.path([[x0, y, z0], tip], .5, P.glow, .4*fade(k), {glow: true, soft: true});
  d.shock(tip[0], tip[2], .3+1.1*easeOut(k), .09, P.main, fade(k), P.core);
  if(T.rays) d.sparks(tip[0], tip[2], y, T.sparks, age, P.core, 1, seed, {speed: 6, spread: .8, dir: Math.atan2(fz, fx), up: 1, life: .35});
}

function cleave(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.5, face = Math.atan2(ev.dz ?? 0, ev.dx ?? 1), r = ev.r || 2.3;
  if(k >= 1) return;
  const g = easeOut(age/.14);
  d.crescent(ev.x, ev.z, .6, r*1.02, face, 240*Math.PI/180, 1.15*(1-k*.4), INKB, .5*fade(k), {glow: false, grow: g});
  d.crescent(ev.x, ev.z, .61, r, face, 240*Math.PI/180, .8*(1-k*.4), ICE, fade(k), {glow: false, grow: g});
  d.crescent(ev.x, ev.z, .62, r*.98, face, 240*Math.PI/180, .35*(1-k*.4), P.main, fade(k), {glow: true, grow: g});
  if(T.rings > 1) d.ring(ev.x, ev.z, r*easeOut(k), .05, P.alt, .7*fade(k));
  if(T.rays) d.sparks(ev.x, ev.z, .7, T.sparks, age, P.core, 1, seed, {speed: 4, up: 2, gravity: 7, life: .4});
}

function gravefall(d, ev, age, seed){
  const T = tier(ev.rank), R = ev.r || 2.7, k = age/1, big = !!ev.hunt, gold = T.prism;
  if(k >= 1) return;
  if(age < .2){d.bloom(ev.x, ev.z, .8, R*.8, P.glow, .7*fade(age/.2)); d.bloom(ev.x, ev.z, .8, R*.35, gold ? GOLD : P.main, .4*fade(age/.2));}
  d.stain(ev.x, ev.z, R*.7, INKB, .5*fade(k, .7));
  for(let i = 0; i < T.rings+(big ? 1 : 0); i++){
    const q = clamp01((age-i*.07)/.55);
    if(q > 0 && q < 1) d.shock(ev.x, ev.z, R*(.3+.9*easeOut(q))*(big ? 1.2 : 1), .12, i === 1 && gold ? GOLD : P.main, fade(q), P.core);
  }
  // Frost cracks radiating out of the landing.
  d.groundRays(ev.x, ev.z, 9, .3, R*1.1*easeOut(age/.2), .09, INKB, .7*fade(k, .8), seed);
  d.groundRays(ev.x, ev.z, 9, .3, R*1.05*easeOut(age/.2), .045, ICE, .9*fade(k, .8), seed);
  d.debris(ev.x, ev.z, 5+(T.debris ? 5 : 0), age, STEEL, seed, {speed: 4, up: 5, size: .09, life: .6});
  // Stunned: little stars wheeling where it landed (★3).
  if(T.rays) for(let i = 0; i < 5; i++){const a = i/5*TAU+age*5; d.twinkle(ev.x+Math.cos(a)*.7, ev.z+Math.sin(a)*.35, 1.6, .12, gold ? GOLD : P.core, fade(k), age*6+i);}
  if(T.pillar && age < .5) d.beam(ev.x, ev.z, 0, 3.8*easeOut(age/.2), 1.1*(1-age/.5), P.glow, .45*fade(age/.5));
  d.light(ev.x, ev.z, 3*fade(k));
}

/** A ghost rider of the Wild Hunt: a pale rider with a lance and a streaming mane, drawn from its wave beat. */
function rider(d, b, t, clock, lead){
  const T = tier(b.rank), v = b.v || 16, x = b.x+b.dx*v*lead, z = b.z+b.dz*v*lead, fx = b.dx, fz = b.dz, nx = -fz, nz = fx;
  const k = clamp01((b.traveled || 0)/(b.len || 7.5)), a = Math.min(1, t/.12)*(1-Math.max(0, k-.85)/.15);
  if(!(a > .02)) return;
  // The mane of light streaming behind.
  const mane = [];
  for(let i = 0; i <= 6; i++){const q = i/6; mane.push([x-fx*q*2.6+nx*Math.sin(clock*9+q*5)*.15*q, 1.3+q*.25, z-fz*q*2.6+nz*Math.sin(clock*9+q*5)*.15*q]);}
  if(T.glow) d.path(mane, .9, P.glow, .4*a, {glow: true, soft: true, taper: .9});
  d.path(mane, .35, ICE, .9*a, {taper: .9});
  // The rider: a pale wedge of horse and rider, a lance couched forward.
  const body = [[x+fx*.6, 1.2, z+fz*.6], [x+nx*.45-fx*.5, 1, z+nz*.45-fz*.5], [x-fx*1.1, 1.6, z-fz*1.1], [x-nx*.45-fx*.5, 1, z-nz*.45-fz*.5]];
  d.path([...body, body[0]], .07, INKB, a);
  d.path(body, 0, T.prism ? '#f4f0e0' : ICE, a, {fill: true});
  const lance = [[x-fx*.3, 1.45, z-fz*.3], [x+fx*1.8, 1.3, z+fz*1.8]];
  d.path(lance, .1, INKB, a); d.path(lance, .05, T.prism ? GOLD : STEEL, a);
  d.orb(x-fx*.4, z-fz*.4, 1.75, .15, ICE, a);
  for(const s of [-1, 1]) d.orb(x-fx*.35+nx*s*.06, z-fz*.35+nz*s*.06, 1.77, .035, P.glow, a, {glow: true});
  for(let i = 0; i < 2; i++){const q = ((clock*6+i/2)%1); d.orb(x-fx*q*1.5, z-fz*q*1.5, .2, .15+.25*q, ICE, .7*(1-q)*a);}
  d.light(x, z, 2.2*a);
}

function huntCall(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.9;
  if(k >= 1) return;
  d.sigil(ev.x, ev.z, 3.2*easeOut(clamp01(age/.3)), P.main, .8*fade(k, 1.3), {spin: age*1.5, sides: 5, glow: T.glow});
  d.mark(ev.x, ev.z, 3.2, .06, P.glow, fade(k), {halo: T.glow ? .4 : 0});
}

function skillCast(d, cast, owner, age){
  const T = tier(rankOfOwner(owner)), k = age/.8;
  if(k >= 1) return;
  for(let i = 0; i < 3; i++){const q = clamp01((age-i*.1)/.6); if(q > 0 && q < 1) d.shock(cast.x, cast.z, .4+3*easeOut(q), .1, P.main, fade(q), P.core);}
  if(T.rays) d.sigil(cast.x, cast.z, 1.5, P.main, fade(k, 1.2)*easeOut(age/.1), {spin: age*3, sides: 5, glow: T.sigil});
}

const kick = (shake, flash = 0, base = 0) => ev => {const T = tier(ev.rank); return {shake: base+T.shake*shake, flash: T.flash*flash, color: P.core};};

export const HORN_EVENTS = {
  hornblow: {life: () => .55, paint(d, ev, age, seed){blow(d, ev, age, seed);}},
  knightstrike: {life: ev => (ev.note === 2 ? 1 : .5), paint(d, ev, age, seed){(ev.note === 2 ? gravefall : ev.note === 1 ? cleave : thrust)(d, ev, age, seed);},
    kick: ev => ev.note === 2 ? kick(ev.hunt ? 1.2 : .6, ev.hunt ? 1 : 0, ev.hunt ? .25 : .08)(ev) : null},
  'fx:wildhunt': {life: () => .9, paint(d, ev, age, seed){huntCall(d, ev, age, seed);}},
  'fx:ghostrider': {life: () => .01, paint(){}},
  'fx:huntfall': {life: () => 1, paint(d, ev, age, seed){gravefall(d, {...ev, hunt: 1, r: ev.r || 3.2}, age, seed);}, kick: kick(1, .8, .2)},
};

/** src/fx/index.mjs WEAPON_FX entry. */
export const HORN_FX = {
  id: PACK,
  events: HORN_EVENTS,
  beats: {ghostrider: {lasting(d, b, t, clock, lead){rider(d, b, t, clock, lead);}}},
  skillCast: (d, cast, owner, age) => skillCast(d, cast, owner, age),
  rig: (d, world, p, anchor, motion, clock, time) => paintKnight(d, world, p, anchor, motion, clock, time),
};
