// The Grimoire of Ash, drawn. Presentation only: the host owns the pages, their flight and their hits
// (src/grimoire.mjs). Pages are painted like paper, not light: an ink edge, parchment, a scorched corner,
// a rune in ember red and a flame licking off the top. Fire stays saturated orange over ink; glow is
// only for halos and the Chapter's ignition.
//
// Rank ladder: ★1 pages, their flames and a painted orbit; ★2 glow and ember trails; ★3 runes that glow,
// embers and ash, a second ring on the Chapter; ★4 a sigil under a full book, afterimages of thrown pages,
// pillars and debris, camera kick; ★5 golden script trailing the pages, the most sparks and a flash on
// the Chapter and the collapse.
import {TAU, at, bump, clamp01, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {PAGES, pageAt} from '../grimoire.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'tome';
const P = hue(PACK);
const PARCH = '#f3e2bf', PARCH_SHADE = '#d9bc8a', SCORCH = '#5a2e1a', INKR = '#2b1a14', RUNE = '#c2361a', ASH = '#7a6e69';
const rankOfOwner = p => p && typeof p === 'object' ? rankOf(p, PACK) : 1;

// ------------------------------------------------------------------ a page
/** A flame standing on a point: round head, point licking up. Painted; shrinks rather than fades. */
function flame(d, x, z, y, r, color, alpha, lick = 0){
  if(!(r > .006) || !(alpha > .01)) return;
  const pts = [at(x, z, y, lick*r, r*2.4)];
  for(let i = 0; i <= 8; i++){const a = i/8*Math.PI; pts.push(at(x, z, y, Math.cos(a)*r, -Math.sin(a)*r));}
  d.path(pts, 0, color, alpha, {fill: true});
}
/**
 * One page at (x, z, y), billboarded. `tilt` turns it on screen, `flip` (-1..1) is how much of its face
 * shows as it turns over, `burn` sizes its flame, `lit` makes its rune glow.
 */
export function paintPage(d, x, z, y, {s = 1, tilt = 0, flip = 1, burn = .5, lit = 0, T = tier(1), clock = 0, seed = 0, alpha = 1} = {}){
  if(!(alpha > .02)) return;
  const w = .27*s*Math.max(.12, Math.abs(flip)), h = .34*s, c = Math.cos(tilt), sn = Math.sin(tilt);
  const q = (u, v) => at(x, z, y, u*c-v*sn, u*sn+v*c);
  const face = [q(-w, -h), q(w, -h), q(w, h*.8), q(w*.7, h), q(-w, h)];
  d.path([...face, face[0]], .07, INKR, alpha);
  d.path(face, 0, flip >= 0 ? PARCH : PARCH_SHADE, alpha, {fill: true});
  // A scorched, ragged bottom corner.
  d.path([q(w*.2, -h), q(w, -h), q(w, -h*.35), q(w*.62, -h*.62), q(w*.45, -h*.8)], 0, SCORCH, alpha*.9, {fill: true});
  // The rune: three strokes, glowing as the book fills.
  if(Math.abs(flip) > .35){
    const k = (seed%3)*.2;
    const strokes = [[[-.5, .45], [.4, .5]], [[-.1, .6], [-.2+k, -.35]], [[-.45, -.1], [.45, .05+k]]];
    for(const [[u0, v0], [u1, v1]] of strokes){
      const a = q(u0*w, v0*h), b = q(u1*w, v1*h);
      d.path([a, b], .055*s, RUNE, alpha);
      if(lit > .05 && T.rays) d.path([a, b], .12*s, P.glow, alpha*lit*.6, {glow: true, soft: true});
    }
  }
  // Fire licking off the top edge.
  if(burn > .02){
    const top = q(w*.2, h), fl = Math.sin(clock*14+seed)*.5, r = (.07+.1*burn)*s;
    flame(d, top[0], top[2], top[1]-r*.3, r*1.25, INKR, alpha*.7, fl);
    flame(d, top[0], top[2], top[1]-r*.3, r, P.glow, alpha, fl);
    flame(d, top[0], top[2], top[1]-r*.3, r*.55, P.alt, alpha, fl*.5);
    if(T.glow) d.bloom(top[0], top[2], top[1]+r, r*3, P.glow, .45*alpha*(.5+burn));
  }
}

// ------------------------------------------------------------------ the orbit (rig)
/** Equipped: the pages circling the wielder. Drawn from p.grimoire (spin carried on by the clock). */
function paintOrbit(d, world, p, anchor, motion, clock, time){
  const g = p.grimoire;
  if(!g || !(g.n > 0)) return {};
  const T = tier(rankOfOwner(p)), lead = Math.max(0, Math.min(.1, (time ?? world.time)-world.time));
  const full = g.n >= PAGES.max, fill = clamp01((g.n-PAGES.min)/(PAGES.max-PAGES.min));
  const spin = g.spin+PAGES.spin*lead, R = PAGES.orbit, x = anchor.x, z = anchor.z;
  const seed = (String(p.id).charCodeAt(0) || 5)|0;
  d.ring(x, z, R, .035, P.main, .45+.35*fill, {glow: false, ink: .03});
  if(T.glow) d.ring(x, z, R, .12+.06*fill, P.glow, .25+.35*fill, {soft: true});
  if(T.sigil && full) d.sigil(x, z, R*.8, P.main, .6+.2*Math.sin(clock*5), {spin: clock*1.5, sides: 7, glow: true});
  for(let i = 0; i < g.n; i++){
    const a = spin+i*TAU/g.n, px = x+Math.cos(a)*R, pz = z+Math.sin(a)*R, y = .9+.09*Math.sin(clock*3+i*1.7);
    // A wake of fire behind each page, then the page itself, fluttering as it turns.
    const wake = [];
    for(let k = 0; k <= 5; k++){const b = a-k*.09; wake.push([x+Math.cos(b)*R, y-.05, z+Math.sin(b)*R]);}
    d.path(wake, .1, P.main, .7, {taper: .9});
    if(T.trail) d.path(wake, .22, P.glow, .35+.25*fill, {glow: true, soft: true, taper: .9});
    paintPage(d, px, pz, y, {s: 1+.1*fill, tilt: Math.sin(clock*2+i)*.25, flip: Math.cos(a*1.5+clock*2+i), burn: .35+.65*fill+(full ? .2*Math.sin(clock*9+i) : 0),
      lit: full ? 1 : fill*.5, T, clock, seed: seed+i});
    if(T.rays && (full || i%2 === 0)) d.motes(px, pz, 2, clock+i*.3, .1, P.alt, .8, seed*7+i, {rise: .7, size: .045, life: .6, y});
  }
  if(full && T.glow) d.light(x, z, 1.6);
  return {};
}

// ------------------------------------------------------------------ thrown pages
function paintThrown(d, b, owner, ctx){
  if(!owner) return;
  const T = tier(rankOfOwner(owner)), lead = ctx.lead, clock = ctx.clock, seed = (b.idx || 0)*13+(b.of || 0);
  const t = (b.t || 0)+lead, pos = pageAt(b, t, owner.x, owner.z);
  if(!d.near(pos.x, pos.z)) return;
  // Still waiting in the orbit (it leaves on its delay): the rig has let go of it, so draw it here.
  if(b.phase === 0){paintPage(d, pos.x, pos.z, .9, {tilt: 0, flip: 1, burn: .8, lit: b.chapter ? 1 : 0, T, clock, seed}); return;}
  const flying = b.phase === 1 || b.phase === 4 || b.phase === 3;
  const y = b.phase === 2 ? 1.25+.08*Math.sin(clock*4+seed) : .95+.35*bump(clamp01(t/(b.phase === 1 ? PAGES.out : PAGES.back)));
  // Trail: where the page was a moment ago, as fire (a glow from ★2, afterimages from ★4).
  if(flying){
    const trail = [];
    for(let k = 0; k <= 5; k++){const q = pageAt(b, Math.max(0, t-k*.035), owner.x, owner.z); trail.push([q.x, y-.04*k, q.z]);}
    if(T.glow) d.path(trail, .38, P.glow, .5, {glow: true, soft: true, taper: .95});
    d.path(trail.slice(0, 5), .2, INKR, .55, {taper: .95});
    d.path(trail.slice(0, 5), .14, P.main, 1, {taper: .95});
    d.path(trail.slice(0, 3), .06, P.alt, 1, {taper: .9});
    if(T.prism) d.path(trail.slice(1), .04, P.alt, .9, {glow: true, taper: .8});
    if(T.sigil){const q = pageAt(b, Math.max(0, t-.07), owner.x, owner.z); paintPage(d, q.x, q.z, y, {tilt: -t*14, flip: Math.cos(t*20+seed), burn: .4, T, clock, seed, alpha: .35});}
  }
  const hanging = b.phase === 2, circle = !!b.circle;
  paintPage(d, pos.x, pos.z, y, {s: circle ? 1.25 : hanging ? 1.15 : 1, tilt: hanging ? Math.sin(clock*3+seed)*.15 : t*(b.side || 1)*14,
    flip: hanging ? 1 : Math.cos(t*18+seed), burn: hanging ? 1 : .8, lit: hanging || b.chapter ? 1 : 0, T, clock, seed});
  if(T.rays && flying) d.sparks(pos.x, pos.z, y, 2, (clock*1.9+seed*.1)%.4, P.alt, .9, seed, {speed: 2, up: 1, gravity: 5, life: .35, len: .05, width: .05});
  // A hanging Chapter ring: fire script running from page to page.
  if(hanging && b.chapter && !circle){
    const a0 = Math.atan2(b.ez-b.cz, b.ex-b.cx), a1 = a0+TAU/(b.of || 7), r = PAGES.ring, k = clamp01(t/PAGES.hang);
    const line = [];
    for(let j = 0; j <= 4; j++){const a = lerp(a0, a1, j/4*k); line.push([b.cx+Math.cos(a)*r, 1.25, b.cz+Math.sin(a)*r]);}
    d.path(line, .08, INKR, .8);
    d.path(line, .045, P.main, 1, {glow: T.glow});
    if(b.idx === 0){
      d.stain(b.cx, b.cz, PAGES.chapterRadius*.8*k, SCORCH, .35);
      d.mark(b.cx, b.cz, PAGES.chapterRadius*(1.1-.2*k), .05, P.main, .8*k, {halo: T.glow ? .4 : 0});
      d.light(b.cx, b.cz, 1.5+k);
    }
  }
}

// ------------------------------------------------------------------ events
function tongues(d, x, z, R, n, age, life, seed){
  for(let i = 0; i < n; i++){
    const a = i/n*TAU+rnd(seed, i)*.3, kk = (age-i*.015)/life;
    if(kk <= 0 || kk >= 1) continue;
    const rr = R*(.35+.6*easeOut(kk)), r = .16*(1-kk)*(1+.4*rnd(seed, i+5));
    const fx = x+Math.cos(a)*rr, fz = z+Math.sin(a)*rr;
    flame(d, fx, fz, .2, r*1.3, INKR, .7, Math.sin(age*12+i)*.4);
    flame(d, fx, fz, .2, r, i%2 ? P.glow : P.main, 1, Math.sin(age*12+i)*.4);
    flame(d, fx, fz, .2, r*.5, P.alt, 1);
  }
}

/** The Chapter ignites: the ring of pages bursts into a wheel of fire over the mark. */
function chapter(d, ev, age, seed){
  const T = tier(ev.rank), R = ev.r || PAGES.chapterRadius, k = age/1;
  if(age < .22){d.bloom(ev.x, ev.z, 1.1, R*.9, P.glow, .8*fade(age/.22)); d.bloom(ev.x, ev.z, 1.1, R*.4, P.alt, .5*fade(age/.22));}
  d.stain(ev.x, ev.z, R*.9, SCORCH, .45*fade(k, .7));
  for(let i = 0; i < T.rings; i++){
    const q = clamp01((age-i*.07)/.55);
    if(q > 0 && q < 1) d.shock(ev.x, ev.z, R*(.3+.9*easeOut(q)), .11, i === 1 ? P.alt : P.glow, fade(q), P.core);
  }
  tongues(d, ev.x, ev.z, R, 10+T.r*2, age, .7, seed);
  // Ash flakes drifting up.
  for(let i = 0; i < 8+T.r*2; i++){
    const a = rnd(seed, i+30)*TAU, r = R*Math.sqrt(rnd(seed, i+31)), q = clamp01((age-.1)/.9);
    if(q <= 0 || q >= 1) continue;
    const px = ev.x+Math.cos(a)*r+Math.sin(age*3+i)*.2, pz = ev.z+Math.sin(a)*r, py = .4+q*2.2;
    d.path([at(px, pz, py, -.04, 0), at(px, pz, py, .04, .03)], .06, ASH, fade(q, 1.2));
  }
  if(T.rays) d.sparks(ev.x, ev.z, 1, T.sparks, age, P.alt, 1, seed, {speed: 5, up: 4, gravity: 8, life: .6});
  if(T.sigil) d.sigil(ev.x, ev.z, R*.85, P.main, .8*fade(k, 1.3)*easeOut(age/.1), {spin: age*2, sides: 7, glow: T.prism});
  if(T.pillar && age < .5) d.beam(ev.x, ev.z, 0, 3.6*easeOut(age/.2), 1.1*(1-age/.5), P.glow, .45*fade(age/.5));
  if(T.debris) d.debris(ev.x, ev.z, 6, age, SCORCH, seed, {speed: 4, up: 5, size: .09, life: .7});
  d.light(ev.x, ev.z, 3*fade(k));
}

/** A kill tears a page out: a flash of paper and embers at the wielder. */
function tear(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.45;
  paintPage(d, ev.x+.2, ev.z, 1.1+.5*easeOut(k), {s: 1.2*(1-.4*k), tilt: age*6, flip: Math.cos(age*14), burn: 1, T, seed, alpha: fade(k, .8)});
  d.sparks(ev.x, ev.z, 1.1, 3+(T.sparks>>2), age, P.alt, 1, seed, {speed: 2.2, up: 2, gravity: 6, life: .4});
}

/** Final Chapter: the circle burning between the hanging pages, drawn every frame from its pulse beat. */
function circle(d, b, t, clock){
  const T = tier(b.rank), r = b.r || 3.2, k = clamp01(t/.25)*clamp01(((b.life || 1)+.2-t)/.2);
  if(!(k > 0)) return;
  d.stain(b.x, b.z, r, SCORCH, .35*k);
  d.mark(b.x, b.z, r, .08, P.glow, .9*k, {halo: T.glow ? .45 : 0});
  d.ring(b.x, b.z, r*.82, .04, P.main, .8*k, {glow: T.glow});
  // A twelve-point star of fire script across the circle.
  const n = 12, star = [];
  for(let i = 0; i <= n; i++){const a = (i*5%n)/n*TAU+clock*.2; star.push([b.x+Math.cos(a)*r*.98, .08, b.z+Math.sin(a)*r*.98]);}
  d.path(star, .09, INKR, .5*k);
  d.path(star, .045, P.main, .95*k, {glow: T.glow});
  tongues(d, b.x, b.z, r, 8+T.r, (clock*.8)%1*.7, .7, 3);
  if(T.rays) d.motes(b.x, b.z, T.motes, clock, r*.9, P.alt, .8*k, 17, {rise: 1.6, size: .07});
  if(T.sigil) d.sigil(b.x, b.z, r*.55, P.alt, .6*k, {spin: -clock, sides: 7, glow: T.prism});
  d.light(b.x, b.z, r*k);
}

/** The collapse: everything falls into the middle, then the fire goes up. */
function collapse(d, ev, age, seed){
  const T = tier(ev.rank), R = ev.r || 3.5, k = age/1.2;
  if(age < .3){d.bloom(ev.x, ev.z, 1, R*.8, P.glow, .85*fade(age/.3)); d.bloom(ev.x, ev.z, 1, R*.4, P.alt, .5*fade(age/.3));}
  d.stain(ev.x, ev.z, R*.8, SCORCH, .55*fade(k, .6));
  for(let i = 0; i < T.rings+1; i++){
    const q = clamp01((age-i*.08)/.6);
    if(q > 0 && q < 1) d.shock(ev.x, ev.z, R*(.25+.95*easeOut(q)), .13, i%2 ? P.alt : P.glow, fade(q), P.core);
  }
  tongues(d, ev.x, ev.z, R, 14+T.r*2, age, .85, seed);
  if(T.rays) d.groundRays(ev.x, ev.z, 12, .5, R*1.2*easeOut(age/.3), .1, P.main, fade(k/.6), seed);
  d.sparks(ev.x, ev.z, 1, 6+T.sparks, age, P.alt, 1, seed, {speed: 6, up: 5, gravity: 8, life: .7});
  if(T.pillar && age < .6) d.beam(ev.x, ev.z, 0, 5*easeOut(age/.25), 1.6*(1-age/.6), P.glow, .5*fade(age/.6));
  if(T.debris) d.debris(ev.x, ev.z, 8, age, SCORCH, seed, {speed: 5, up: 6, size: .11, life: .8});
  d.light(ev.x, ev.z, 4*fade(k));
}

function skillCast(d, cast, owner, age){
  const T = tier(rankOfOwner(owner)), k = age/.8;
  if(k >= 1) return;
  d.shock(cast.x, cast.z, .4+1.8*easeOut(k), .08, P.glow, fade(k), P.core);
  if(T.rays) d.sigil(cast.x, cast.z, 1.5, P.main, fade(k, 1.2)*easeOut(age/.1), {spin: age*3, sides: 7, glow: T.sigil});
}

const kick = (shake, flash = 0, base = 0) => ev => {const T = tier(ev.rank); return {shake: base+T.shake*shake, flash: T.flash*flash, color: P.alt};};

export const GRIMOIRE_EVENTS = {
  ashthrow: {life: () => .01, paint(){}},
  ashchapterthrow: {life: () => .01, paint(){}},
  ashchapter: {life: () => 1, paint(d, ev, age, seed){chapter(d, ev, age, seed);}, kick: kick(.8, .6, .1)},
  pagetear: {life: () => .45, paint(d, ev, age, seed){tear(d, ev, age, seed);}},
  'fx:ashcircle': {life: () => .01, paint(){}},
  'fx:ashcollapse': {life: () => 1.2, paint(d, ev, age, seed){collapse(d, ev, age, seed);}, kick: kick(1.2, 1, .25)},
};

/** src/fx/index.mjs WEAPON_FX entry. */
export const GRIMOIRE_FX = {
  id: PACK,
  events: GRIMOIRE_EVENTS,
  beats: {ashring: {lasting(d, b, t, clock){circle(d, b, t, clock);}}},
  lists: {magicBolts: (d, b, owner, ctx) => paintThrown(d, b, owner, ctx)},
  skillCast: (d, cast, owner, age) => skillCast(d, cast, owner, age),
  rig: (d, world, p, anchor, motion, clock, time) => paintOrbit(d, world, p, anchor, motion, clock, time),
};
