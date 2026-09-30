// The Hollow Moon, drawn: the little dead moon circling its wielder (a rig, so it is there whenever the
// weapon is equipped), its throw, the gravity well it opens over the mark, the crush, and Eclipse.
// Presentation only: the host owns the moon's state and hits (magic/hollow-moon.mjs, `p.hollowMoon`).
// The moon shows its phase (new, crescent, half, full: the phase of the next throw) and a hollow face
// whose mouth opens while it pulls. Foes caught in the well hang on thin threads of its light.
// Rank ladder: ★1 the moon, a spiral well, a plain crush ring; ★2 moonglow, orbit and flight trails, a
// light shaft over the well, glowing arms; ★3 glowing eyes, dust spiralling in, a second crush ring,
// rays; ★4 two moonlets, a lunar sigil under the well, moon-rock debris, camera kick; ★5 a cyan corona,
// stars in the well, a screen flash on the full moon's crush.
import {INK, TAU, at, bump, clamp01, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {ECLIPSE, MOON, PHASES, orbitAngle} from '../magic/hollow-moon.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'hollow-moon';
const P = hue(PACK);
const LIT = '#f4edd6', LIT_SHADE = '#cdbf9f', DARK = '#3b3060', DARK_PIT = '#281f47', VOID = P.deep, ROCK = '#bdb09a';
/** Craters: longitude, latitude, size (of the moon's radius). They turn with the moon's spin. */
const CRATERS = [[.4, .35, .2], [-.5, -.1, .16], [1.3, -.45, .22], [2.3, .3, .18], [3.4, -.2, .24], [4.4, .5, .14], [5.3, -.5, .17]];
const R0 = .34;

// ------------------------------------------------------------------ the moon
/** A filled ellipse in billboard space around (x, z, y). */
function blob(d, x, z, y, cu, cv, ru, rv, color, alpha, {glow = false, n = 12} = {}){
  const pts = [];
  for(let i = 0; i <= n; i++){const a = i/n*TAU; pts.push(at(x, z, y, cu+Math.cos(a)*ru, cv+Math.sin(a)*rv));}
  d.path(pts, 0, color, alpha, {fill: true, glow});
}
/**
 * The moon at (x, z, y), radius r, `lit` of it lit (0 new ... 1 full, light from the screen's right).
 * `mouth` opens its hollow mouth (0..1), `dark` blacks it out for the eclipse, `spin` turns the craters.
 */
function paintMoonBody(d, x, z, y, r, lit, T, {spin = 0, mouth = 0, dark = 0, clock = 0, wax = 0} = {}){
  const show = 1-dark;
  if(T.glow && show > .05) d.bloom(x, z, y, r*(2.3+.6*lit), P.glow, (.22+.3*lit)*show+.25*wax);
  if(wax > .01) d.bloom(x, z, y, r*3.2, P.core, .35*wax);
  blob(d, x, z, y, 0, 0, r+.05, r+.05, INK, 1, {n: 20});
  blob(d, x, z, y, 0, 0, r, r, DARK, 1, {n: 20});
  // The lit part: between the right limb and the terminator (an ellipse that sweeps across as it waxes).
  const k = 1-2*clamp01(lit*show), n = 16;
  if(lit*show > .02){
    const limb = [], term = [];
    for(let i = 0; i <= n; i++){
      const f = -Math.PI/2+i/n*Math.PI, c = Math.cos(f)*r, s = Math.sin(f)*r;
      limb.push(at(x, z, y, c, s)); term.push(at(x, z, y, k*c, s));
    }
    d.path([...limb, ...term.reverse()], 0, LIT, 1, {fill: 'ribbon'});
    if(T.glow) d.path(limb, .035, P.core, .85, {glow: true});
  }
  // Craters, pale on the lit side and dark pits on the shadow side.
  for(const [lon, lat, size] of CRATERS){
    const a = lon+spin, depth = Math.cos(a);
    if(depth < .2) continue;
    const u = Math.sin(a)*Math.cos(lat)*r*.86, v = Math.sin(lat)*r*.86, rr = size*r;
    const litHere = lit*show > .02 && u > k*Math.sqrt(Math.max(0, r*r-v*v));
    blob(d, x, z, y, u, v, rr*depth, rr*.8, litHere ? LIT_SHADE : DARK_PIT, .9, {n: 10});
  }
  // The hollow face: two sunken eyes and a mouth that gapes while it pulls.
  for(const s of [-1, 1]){
    blob(d, x, z, y, s*r*.34, r*.2, r*.15, r*.2, INK, .92, {n: 10});
    if(T.rays || mouth > .3) blob(d, x, z, y, s*r*.34, r*.17, r*.055, r*.07, dark > .5 ? P.alt : P.main, .95, {glow: true, n: 8});
  }
  const mh = r*(.06+.3*clamp01(mouth));
  blob(d, x, z, y, 0, -r*.4, r*(.2+.12*mouth)+.02, mh+.02, INK, 1, {n: 14});
  blob(d, x, z, y, 0, -r*.4, r*(.2+.12*mouth), mh, VOID, 1, {n: 14});
  if(mouth > .2) d.bloom(...xzy(at(x, z, y, 0, -r*.4)), r*.35*mouth, P.main, .7*mouth);
  // ★4 two moonlets; ★5 a corona.
  if(T.pillar && show > .1) for(let i = 0; i < 2; i++){
    const a = clock*2.1+i*Math.PI, q = at(x, z, y, Math.cos(a)*r*1.75, Math.sin(a)*r*.55);
    blob(d, q[0], q[2], q[1], 0, 0, r*.2, r*.2, INK, 1, {n: 8});
    blob(d, q[0], q[2], q[1], 0, 0, r*.15, r*.15, i ? ROCK : LIT, 1, {n: 8});
  }
  if(T.prism || dark > .05){
    const ring = [];
    for(let i = 0; i <= 28; i++){const a = i/28*TAU; ring.push(at(x, z, y, Math.cos(a)*r*1.3, Math.sin(a)*r*1.3));}
    const a = Math.max(T.prism ? .5 : 0, dark);
    d.path(ring, .05+.1*dark, P.alt, a, {glow: true});
    if(dark > .05) d.path(ring, .22+.25*dark, P.core, .55*dark, {glow: true, soft: true});
  }
}
const xzy = p => [p[0], p[2], p[1]];

// ------------------------------------------------------------------ the well
/** The gravity well on the ground: a void, a rim and spiral arms turning in; `k` fades it in and out. */
function paintWell(d, x, z, r, k, T, clock, turn){
  if(!(k > .01)) return;
  d.stain(x, z, r*.62, VOID, .5*k);
  if(T.glow) d.pool(x, z, r*.95, P.glow, .28*k);
  d.mark(x, z, r*(1-.035*Math.sin(clock*7)), .055, P.main, .85*k, {halo: T.glow ? .4 : 0});
  if(T.sigil) d.sigil(x, z, r*.72, P.main, .6*k, {spin: -clock*1.2, sides: 8, glow: false});
  const arms = [2, 2, 3, 3, 4][T.r-1], n = 16;
  for(let i = 0; i < arms; i++){
    // Centre first, so the arm tapers out toward the rim.
    const pts = [];
    for(let j = 0; j <= n; j++){
      const s = 1-j/n, rr = .22+(r*.96-.22)*(1-s), a = i/arms*TAU-turn+s*2.8;
      pts.push([x+Math.cos(a)*rr, .07, z+Math.sin(a)*rr]);
    }
    d.path(pts, .15, INK, .45*k, {taper: .9});
    d.path(pts, .08, P.main, .95*k, {taper: .9});
    if(T.glow) d.path(pts, .24, P.glow, .35*k, {glow: true, soft: true, taper: .9});
  }
  // ★3 dust spiralling in; ★5 stars caught in the well.
  if(T.rays){
    const m = 4+T.r*2;
    for(let i = 0; i < m; i++){
      const s = (clock*.8+rnd(71, i))%1, a0 = rnd(72, i)*TAU-turn, dr = r*.95-.2;
      const p = q => {const rr = .2+dr*(1-q), a = a0+q*3; return [x+Math.cos(a)*rr, .22+.35*(1-q), z+Math.sin(a)*rr];};
      d.streak(p(Math.max(0, s-.08)), p(s), .07, i%3 ? P.main : P.alt, .8*bump(s)*k, .8);
    }
  }
  if(T.prism) for(let i = 0; i < 5; i++){
    const a = rnd(73, i)*TAU+clock*.6, rr = r*(.25+.6*rnd(74, i));
    d.twinkle(x+Math.cos(a)*rr, z+Math.sin(a)*rr, .25, .1, P.core, k*(.5+.5*Math.sin(clock*5+i*2)), clock+i);
  }
}
/** Thin threads of moonlight from each foe the well holds up to the moon. */
function threads(d, world, x, z, y, r, k, T){
  let n = 0;
  for(const e of world.enemies || []){
    if(!(e.hp > 0) || e.ally || e.summon || n >= 14) continue;
    if(Math.hypot(e.x-x, e.z-z) > r+.4) continue;
    n++;
    const a = [e.x, .55, e.z], b = [x, y-.2, z];
    d.path([a, b], .035, P.main, .55*k, {glow: T.glow});
    if(T.glow) d.orb(e.x, e.z, .55, .09, P.core, .7*k, {glow: true});
  }
}

// ------------------------------------------------------------------ the rig
/** Draw the moon on (or away from) its wielder. Returns the rig origin: the moon's spot on the ground. */
export function paintMoon(d, world, p, anchor, motion, clock, time){
  const m = p.hollowMoon, T = tier(rankOf(p, PACK)), now = time ?? world.time;
  const lead = Math.max(0, Math.min(.1, now-world.time));
  const a = orbitAngle(p, now), r0 = R0*(1+.03*(T.r-1));
  const ox = anchor.x+Math.cos(a)*MOON.orbit, oz = anchor.z+Math.sin(a)*MOON.orbit*.8, oy = anchor.y+1.45+.1*Math.sin(clock*2.2);
  const state = m?.state || 'orbit', t = (m?.t || 0)+lead;
  const shown = PHASES[m?.phase ?? 0] || PHASES[0], thrown = PHASES[m?.thrown ?? 0] || PHASES[0];
  const wax = m && now-(m.waxAt ?? -9) < .6 ? fade((now-m.waxAt)/.6) : 0;

  if(state === 'fly'){
    const u = clamp01(t/MOON.fly), s = easeOut(u);
    const x = lerp(m.fx, m.tx, s), z = lerp(m.fz, m.tz, s), y = lerp(oy, 1.3, u)+1.1*Math.sin(Math.PI*u);
    paintWell(d, m.tx, m.tz, m.r || thrown.r, .45*u, T, clock, clock*2);
    const back = Math.max(0, s-.35);
    const trail = [1, .75, .5, .25, 0].map(q => {const w = lerp(back, s, q); return [lerp(m.fx, m.tx, w), lerp(oy, 1.3, w)+1.1*Math.sin(Math.PI*w), lerp(m.fz, m.tz, w)];});
    d.path(trail, r0*1.4, LIT, .5, {taper: .9});
    if(T.trail) d.path(trail, r0*2.6, P.glow, .45, {glow: true, soft: true, taper: .9});
    paintMoonBody(d, x, z, y, r0*lerp(1+.25*thrown.lit, 1.55+.35*thrown.lit, u), thrown.lit, T, {spin: clock*6, clock, wax});
    return {x, y: 0, z};
  }
  if(state === 'well'){
    const x = m.tx, z = m.tz, y = 1.45+.08*Math.sin(clock*3), full = m.thrown === 3;
    const intro = easeOut(t/.2), gulp = clamp01((t-(MOON.hold-.18))/.18);
    const k = intro, R = r0*(1.55+.35*thrown.lit+(full ? .3 : 0));
    paintWell(d, x, z, m.r || thrown.r, k, T, clock, clock*(2+2*t));
    threads(d, world, x, z, y, m.r || thrown.r, k, T);
    if(T.trail) d.beam(x, z, 0, y, R*1.2, P.glow, .25*k);
    // It lands with a thud of its own.
    if(t < .35) d.shock(x, z, MOON.land*easeOut(t/.35), .08, P.main, fade(t/.35), P.core);
    paintMoonBody(d, x, z, y, R*(1+.12*gulp), thrown.lit, T, {spin: clock*(1.5+3*t), mouth: easeOut(t/.25)*(1+.4*gulp), clock, wax});
    if(T.glow) d.light(x, z, 1.6+m.r*.4);
    return {x, y: 0, z};
  }
  if(state === 'back'){
    const u = clamp01(t/MOON.back), s = 1-(1-u)**2;
    const x = lerp(m.bx, ox, s), z = lerp(m.bz, oz, s), y = lerp(m.high ? 2.9 : 1.45, oy, s)+.5*Math.sin(Math.PI*u);
    if(T.trail) d.streak([lerp(m.bx, ox, Math.max(0, s-.3)), y+.1, lerp(m.bz, oz, Math.max(0, s-.3))], [x, y, z], r0*1.6, P.glow, .4*(1-u));
    paintMoonBody(d, x, z, y, r0*(1+.25*shown.lit), shown.lit, T, {spin: clock*3, clock, wax});
    return {x, y: 0, z};
  }
  if(state === 'eclipse'){
    const E = ECLIPSE, rise = easeOut(t/E.rise), inPull = t-E.rise, q = clamp01((t-E.rise-E.pull)/E.dark);
    const x = lerp(m.fx, m.tx, rise), z = lerp(m.fz, m.tz, rise), y = lerp(oy, 2.9, rise)+.12*Math.sin(clock*2);
    const R = lerp(r0, 1.2, rise), k = clamp01(inPull/.3);
    // The land darkens under it as it drinks the light.
    d.stain(m.tx, m.tz, E.r*1.2, '#07040f', (.2*k+.25*q)*(inPull > 0 ? 1 : 0));
    if(inPull > 0){
      paintWell(d, m.tx, m.tz, E.r, k, {...T, glow: true, rays: true, r: Math.max(3, T.r)}, clock, clock*(2.5+3*clamp01(inPull/E.pull)));
      threads(d, world, m.tx, m.tz, y, E.r, k*(1-q*.5), T);
      d.beam(m.tx, m.tz, 0, y, 1.6, P.glow, .3*k*(1-q));
    }
    if(q > 0 && T.rays) d.rays(x, z, y, 12, R*2.6, .12, P.core, .7*q, 91, clock*.5);
    paintMoonBody(d, x, z, y, R, lerp(shown.lit, 1, rise), T, {spin: clock*1.2, mouth: k*(1-q), dark: q, clock, wax});
    d.light(x, z, 3*(1-q)+1);
    return {x: m.tx, y: 0, z: m.tz};
  }
  // Orbit: a pale ring of its path (★2), and the moon waxing toward its next throw.
  if(T.trail){
    const arc = [];
    for(let i = 0; i <= 12; i++){const b = a-i/12*1.6; arc.push([anchor.x+Math.cos(b)*MOON.orbit, oy-.02*i, anchor.z+Math.sin(b)*MOON.orbit*.8]);}
    d.path(arc, r0*1.1, P.glow, .3, {glow: true, soft: true, taper: .95});
  }
  if(wax > .01) d.ring(ox, oz, .5+.9*(1-wax), .05, P.core, wax, {y: oy});
  paintMoonBody(d, ox, oz, oy, r0*(1+.25*shown.lit), shown.lit, T, {spin: clock*.5, clock, wax});
  return {x: ox, y: 0, z: oz};
}

// ------------------------------------------------------------------ crush and nova
function crush(d, ev, age, seed){
  const T = tier(ev.rank), full = (ev.phase|0) === 3, R = ev.r || 2.4, life = full ? 1.1 : .75;
  if(age >= life) return;
  // The mouth snaps shut: a dark maw closing where the moon hung, the well sucked in after it.
  if(age < .14){
    const q = age/.14, h = R*.28*(1-easeOut(q));
    blob(d, ev.x, ev.z, 1.3, 0, -.1, R*.34+.04, h+.04, INK, 1);
    blob(d, ev.x, ev.z, 1.3, 0, -.1, R*.34, h, VOID, 1);
    d.ring(ev.x, ev.z, lerp(R, .3, easeOut(q)), .09, P.core, 1-q*.5);
  }
  d.stain(ev.x, ev.z, R*.5, VOID, .5*fade(age/life, .8));
  const q = clamp01((age-.1)/(life*.6));
  if(q > 0 && q < 1){
    d.shock(ev.x, ev.z, R*(.25+.95*easeOut(q)), full ? .16 : .11, P.main, fade(q), P.core);
    if(T.rings > 1) d.ring(ev.x, ev.z, R*(.15+.7*easeOut(q)), .06, full ? P.alt : P.core, fade(q)*.8);
    if(full || T.rings > 2) d.ring(ev.x, ev.z, R*(.1+1.25*easeOut(q)), .05, P.alt, .8*fade(q));
  }
  d.bloom(ev.x, ev.z, 1.3, R*.5*(full ? 1.4 : 1), P.core, fade(age/.3));
  if(T.glow) d.pool(ev.x, ev.z, R, P.glow, .45*fade(age/life));
  if(T.rays) d.groundRays(ev.x, ev.z, full ? 14 : 9, R*.25, R*1.15*easeOut(Math.min(1, age*5)), .08, P.main, .8*fade(age/life), seed);
  d.sparks(ev.x, ev.z, 1.1, T.sparks+(full ? 8 : 0), age, P.alt, 1, seed, {speed: 5, up: 3, life: .55});
  if(T.debris) d.debris(ev.x, ev.z, full ? 9 : 5, age, ROCK, seed, {speed: 4, up: 5, size: .1, life: .7});
  // The full moon's crush stuns: little stars wheel round the spot.
  if(full) for(let i = 0; i < 5; i++){
    const a = i/5*TAU+age*4, k = fade(age/life);
    d.star(ev.x+Math.cos(a)*R*.45, ev.z+Math.sin(a)*R*.3, .95, .13, P.core, k, {spin: age*6+i, ink: .03});
  }
  if(T.prism && full && age < .5) d.beam(ev.x, ev.z, 0, 4*easeOut(age/.2), .9*(1-age/.5), P.alt, .5*fade(age/.5));
  d.light(ev.x, ev.z, R*1.2*fade(age/life));
}

function nova(d, ev, age, seed){
  const T = tier(ev.rank), R = ev.r || ECLIPSE.nova, life = 1.6, k = age/life;
  if(k >= 1) return;
  const y = 2.9;
  if(age < .3){d.bloom(ev.x, ev.z, y, R*.4, P.core, .9*fade(age/.3)); d.bloom(ev.x, ev.z, y, R*.75, P.alt, .3*fade(age/.3));}
  // A painted burst of the moon's own colour at its heart: it reads on pale ground where light would wash out.
  if(age < .45){const q = age/.45; d.star(ev.x, ev.z, y, R*.55*easeOut(q/.4), P.main, fade(q), {spin: seed%3, points: 8, inner: .42, ink: .05}); d.star(ev.x, ev.z, y, R*.3*easeOut(q/.4), P.core, fade(q), {spin: seed%3+.2, points: 8, inner: .45});}
  d.stain(ev.x, ev.z, R*.7, VOID, .55*fade(k, .7));
  for(let i = 0; i < Math.max(2, T.rings); i++){
    const q = clamp01((age-i*.09)/.8);
    if(q > 0 && q < 1) d.shock(ev.x, ev.z, R*(.2+1*easeOut(q)), .16, [P.main, P.alt, P.core][i], fade(q), P.core);
  }
  d.groundRays(ev.x, ev.z, 16, R*.3, R*1.25*easeOut(Math.min(1, age*4)), .1, P.main, .9*fade(k), seed);
  // Shards of the moon rain out of the burst.
  d.sparks(ev.x, ev.z, y, 14+T.sparks, age, P.core, 1, seed, {speed: 7, up: 2, gravity: 9, life: 1, len: .12, width: .09});
  d.debris(ev.x, ev.z, 8+(T.debris ? 8 : 0), age, LIT, seed+5, {speed: 6, up: 7, size: .14, life: 1});
  if(T.rays) d.rays(ev.x, ev.z, y, 14, R*.9*easeOut(age/.2), .14, P.core, fade(age/.5), seed, age*.3);
  if(T.pillar && age < .7) d.beam(ev.x, ev.z, 0, 7*easeOut(age/.2), 2.2*(1-age/.7), P.glow, .6*fade(age/.7));
  if(T.prism) for(let i = 0; i < 8; i++){const a = i/8*TAU+age; d.twinkle(ev.x+Math.cos(a)*R*.8*easeOut(k*2), ev.z+Math.sin(a)*R*.5*easeOut(k*2), 1+age, .18, P.alt, fade(k), age*5+i);}
  d.light(ev.x, ev.z, R*1.6*fade(k));
}

/** Eclipse's call beat: the mark it is heading for, and the nova's reach tightening round it. */
function eclipseMark(d, ev, age){
  const T = tier(ev.rank), E = ECLIPSE, end = E.rise+E.pull+E.dark, k = age/end;
  if(k >= 1 || !Number.isFinite(ev.tx)) return;
  const grow = easeOut(age/.3);
  d.ring(ev.tx, ev.tz, E.nova*(1.25-.25*k), .05, INK, .5*grow, {glow: false});
  d.ring(ev.tx, ev.tz, E.nova*(1.25-.25*k), .035, k > .8 ? P.alt : P.main, .8*grow*(k > .8 ? .6+.4*Math.sin(age*40) : 1));
  if(T.rays) d.sigil(ev.tx, ev.tz, E.nova*.55, P.main, .5*grow*fade(k, .5), {spin: age*.8, sides: 8, glow: T.sigil});
}

/** Kicks: the crush jolts from ★3 (the full moon always), the nova always. */
export const MOON_EVENTS = {
  lunarthrow: {life: () => .01, paint(){}},
  lunarcrush: {life: ev => (ev.phase|0) === 3 ? 1.1 : .75, paint(d, ev, age, seed){crush(d, ev, age, seed);},
    kick: ev => {const T = tier(ev.rank), full = (ev.phase|0) === 3; return {shake: full ? .18+T.shake*.8 : T.shake*.5, flash: full ? T.flash : 0, color: P.core};}},
  'fx:eclipse': {life: () => ECLIPSE.rise+ECLIPSE.pull+ECLIPSE.dark+.05, paint(d, ev, age){eclipseMark(d, ev, age);}},
  lunarnova: {life: () => 1.6, paint(d, ev, age, seed){nova(d, ev, age, seed);},
    kick: ev => {const T = tier(ev.rank); return {shake: .35+T.shake, flash: .04+T.flash*.7, color: P.main};}},
};

/** Eclipse's cast at the wielder's feet (the moon does the rest). */
function paintEclipseCast(d, cast, age){
  const T = tier(cast.rank), k = age/.8;
  if(k >= 1) return;
  d.shock(cast.x, cast.z, .5+2*easeOut(k), .08, P.main, fade(k), P.core);
  if(T.rays) d.sigil(cast.x, cast.z, 1.5, P.main, fade(k, 1.2)*easeOut(age/.1), {spin: -age*3, sides: 8, glow: T.sigil});
}

/** src/fx/index.mjs WEAPON_FX entry. */
export const MOON_FX = {
  id: PACK,
  events: MOON_EVENTS,
  magicCast: false,
  skillCast: (d, cast, owner, age) => paintEclipseCast(d, cast, age),
  rig: (d, world, p, anchor, motion, clock, time) => ({origin: paintMoon(d, world, p, anchor, motion, clock, time)}),
};
