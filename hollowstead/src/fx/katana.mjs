// Kagekiri, drawn. Presentation only: the host owns the cuts, the set count and the skill
// (magic/katana.mjs). Painted in sakura and steel over the ink outline: a draw is a flash of white edged in
// pink, a hanging cut is a thin inked rift that breathes, and a snapped cut splits into two halves that slide
// apart with a burst of petals. The Hundred-Line Draw: the wielder bursts into ink and petals, every line
// is led by a dark streak (the swordsman too fast to see), and the petals gather back where they step out.
//
// Rank buys flourish, as everywhere in src/fx: ★1 plain cuts; ★2 a pink glow on every line; ★3 petals
// drift off hanging cuts and fly from every snap; ★4 glints at the ends of the cuts and a camera kick;
// ★5 the steel-blue second colour in the cuts and a screen flash on the skill's sheath.
import {TAU, at, clamp01, easeIn, easeOut, fade, hue, lerp, rnd, tier, INK} from './kit.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

export const PACK = 'katana';
const P = hue(PACK);
const PETAL = '#f7b6c8', PETAL_D = '#d77898';
/** Cuts hang about where a drawn blade passes: a little below the chest. */
const Y = .85;
const rankOfOwner = p => p && typeof p === 'object' ? rankOf(p, PACK) : 1;

// ------------------------------------------------------------------ shapes
/** A cherry petal, inked: a small teardrop with a notch, spinning in the picture plane. */
export function petal(d, x, z, y, r, spin, alpha, color = PETAL){
  if(!(alpha > .02)) return;
  const c = Math.cos(spin), s = Math.sin(spin), q = (u, v) => at(x, z, y, (u*c-v*s)*r, (u*s+v*c)*r);
  const pts = [q(0, 1), q(.6, .3), q(.48, -.55), q(0, -.28), q(-.48, -.55), q(-.6, .3), q(0, 1)];
  d.path(pts, r*.32, INK, alpha*.85);
  d.path(pts, 0, color, alpha, {fill: true});
}
/** Points along a cut from share `from` to `to`, at height y, shifted sideways by `off`. */
function along(c, from, to, n = 8, off = 0, y = Y){
  const dx = c.x1-c.x0, dz = c.z1-c.z0, l = Math.hypot(dx, dz) || 1, nx = -dz/l*off, nz = dx/l*off, pts = [];
  for(let i = 0; i <= n; i++){const t = lerp(from, to, i/n); pts.push([c.x0+dx*t+nx, y, c.z0+dz*t+nz]);}
  return pts;
}
/** One painted stroke of steel: ink, colour, a white core; a glow halo from ★2. */
function stroke(d, pts, w, T, alpha, {color = P.main, core = P.core, glow = 0} = {}){
  if(!(alpha > .02)) return;
  if(glow > 0 && T.glow) d.path(pts, w*2.8, P.glow, glow*alpha, {glow: true, soft: true, taper: .9});
  d.path(pts, w*1.35+.05, INK, .8*alpha, {taper: .92});
  d.path(pts, w, color, alpha, {taper: .9});
  d.path(pts, w*.36, core, alpha, {taper: .86});
}

// ------------------------------------------------------------------ cuts (world.magicSweeps)
export function paintCut(d, c, owner, ctx){
  const mx = (c.x0+c.x1)/2, mz = (c.z0+c.z1)/2;
  if(!d.near(mx, mz, 5)) return;
  const T = tier(rankOfOwner(owner)), age = (c.age || 0)+ctx.lead, clock = ctx.clock;
  if(c.snapped){paintSplit(d, c, T, age-(c.snapAge || 0)); return;}
  const draw = c.skill ? .07 : .055, grow = easeOut(age/draw), steel = T.prism && c.n%2 ? P.alt : P.main;
  // The draw: a flash of steel that lands in an instant, then thins to the cut.
  if(age < .32){
    const f = fade(age/.32, 1.3);
    stroke(d, along(c, 0, grow, 10), .07+.22*f, T, 1, {color: steel, glow: .5*f});
    // The Hundred-Line Draw: an ink comet runs ahead of each line, the swordsman too quick to see.
    if(c.skill && age < draw+.05){
      const head = along(c, Math.max(0, grow-.22), grow, 4, 0, Y+.15);
      d.path(head, .55, INK, .75*(1-clamp01((age-draw)/.05)), {taper: .95});
      d.path(head, .2, P.core, .9, {taper: .9});
    }
  }
  // Hanging: a thin inked rift that breathes; when the sheath is about to click, it trembles.
  const left = (c.life || 0)-age, hang = clamp01((age-.1)/.2)*clamp01(left/.5);
  if(!(hang > 0)) return;
  const primed = !!owner && ((owner.kataSnapAt || 0) > 0 || !!owner.kataDraw);
  const pulse = primed ? .7+.3*Math.sin(clock*26+(c.n || 0)) : .8+.2*Math.sin(clock*4.2+(c.n || 0)*1.7);
  const pts = along(c, 0, 1, 8, primed ? Math.sin(clock*40+(c.n || 0))*.02 : 0);
  if(T.glow) d.path(pts, primed ? .36 : .24, P.glow, (primed ? .4 : .2)*hang, {glow: true, soft: true, taper: .9});
  d.path(pts, .13, INK, .85*hang, {taper: .93});
  d.path(pts, .065, c.skill ? P.core : steel, hang*pulse, {taper: .9});
  // ★3: petals drift off the cut and flutter down.
  if(T.r >= 3) for(let i = 0; i < (T.r >= 5 ? 3 : 2); i++){
    const seed = (c.n || 0)*13+i*7, cyc = ((clock*.45+rnd(seed, 1))%1), t = .15+.7*rnd(seed, 2);
    const x = lerp(c.x0, c.x1, t)+Math.sin(clock*2+seed)*.25, z = lerp(c.z0, c.z1, t)+cyc*.25, y = Y-cyc*.75;
    petal(d, x, z, y, .1, clock*3+seed, hang*fade(cyc, 1.2));
  }
  // ★4: a glint rides each end of the cut.
  if(T.r >= 4){
    d.twinkle(c.x0, c.z0, Y, .16, P.core, .8*hang*pulse, clock*3);
    d.twinkle(c.x1, c.z1, Y, .2, P.core, .9*hang*pulse, -clock*3);
  }
}
/** A snapped cut: a flare along it, then two halves slide apart and thin away. */
function paintSplit(d, c, T, a){
  const u = clamp01(a/.5);
  if(u >= 1) return;
  if(u < .35){const f = 1-u/.35; if(T.glow) d.path(along(c, 0, 1, 8), .18+.22*f, P.glow, .45*f, {glow: true, soft: true, taper: .85}); stroke(d, along(c, 0, 1, 8), .14*f+.04, T, f);}
  const gapW = .24*easeOut(u), w = .1*(1-u)+.02, fadeA = fade(u, 1.1);
  for(const side of [-1, 1]){
    const pts = along(c, side < 0 ? 0 : .5, side < 0 ? .5 : 1, 5, side*gapW, Y-.25*easeIn(u));
    d.path(pts, w+.05, INK, .8*fadeA, {taper: .6});
    d.path(pts, w, P.main, fadeA, {taper: .6});
  }
}

// ------------------------------------------------------------------ events
/** The snap: every cut flares at once and throws its petals; the skill's is the biggest moment the blade has. */
function paintSnap(d, ev, age, seed){
  const T = tier(ev.rank), life = ev.skill ? .9 : .65, k = age/life;
  if(k >= 1) return;
  const lines = ev.lines || [];
  let cx = 0, cz = 0;
  for(const [x0, z0, x1, z1] of lines){cx += (x0+x1)/2; cz += (z0+z1)/2;}
  if(lines.length){cx /= lines.length; cz /= lines.length;}
  if(lines.length && d.near(cx, cz, 10)){
    for(let i = 0; i < lines.length; i++){
      const [x0, z0, x1, z1] = lines[i], mx = (x0+x1)/2, mz = (z0+z1)/2;
      // Petals burst from the middle of every cut (more at higher ranks), falling and spinning.
      const n = T.r >= 3 ? (ev.skill ? 5 : 3)+(T.r >= 5 ? 2 : 0) : 1;
      for(let j = 0; j < n; j++){
        const s = seed+i*31+j*7, a = rnd(s, 1)*TAU, sp = 1.2+2.2*rnd(s, 2), tt = Math.min(age, life);
        const x = mx+Math.cos(a)*sp*easeOut(tt/.5)*.9, z = mz+Math.sin(a)*sp*easeOut(tt/.5)*.6, y = Y+.6*rnd(s, 3)*Math.sin(Math.PI*clamp01(tt/.4))-1.1*easeIn(k);
        petal(d, x, z, Math.max(.12, y), .12+.05*rnd(s, 4), tt*8+j, fade(k, 1.4), j%3 ? PETAL : PETAL_D);
      }
      if(T.r >= 3) d.sparks(mx, mz, Y, ev.skill ? 6 : 4, age, P.core, fade(k), seed+i, {speed: 5, up: 1.5, gravity: 9, life: .45});
    }
    if(ev.skill){
      d.shock(cx, cz, .6+5*easeOut(k/.6), .1, P.glow, fade(k), P.core);
      if(T.r >= 4) d.ring(cx, cz, 2+4*easeOut(k), .08, P.main, fade(k));
    }
    d.light(cx, cz, ev.skill ? 6 : 3);
  }
}
/** Vanishing: a burst of ink smoke and petals where the wielder stood. */
function paintVanish(d, ev, age, seed){
  const T = tier(ev.rank), k = age/1.1;
  if(k >= 1 || !d.near(ev.x, ev.z, 4)) return;
  for(let i = 0; i < 7; i++){
    const a = rnd(seed, i)*TAU, r = .3+1.1*easeOut(k)*rnd(seed, i+9), s = (.35+.3*rnd(seed, i+3))*(1-k*.7);
    d.orb(ev.x+Math.cos(a)*r, ev.z+Math.sin(a)*r*.7, .5+.8*rnd(seed, i+5)+.6*k, s, INK, .55*fade(k, 1.4), {soft: true});
  }
  const n = 10+T.motes;
  for(let i = 0; i < n; i++){
    const a = rnd(seed, i+20)*TAU, sp = 1.5+2.5*rnd(seed, i+40), tt = Math.min(age, .9);
    const x = ev.x+Math.cos(a)*sp*easeOut(tt/.6), z = ev.z+Math.sin(a)*sp*easeOut(tt/.6)*.7;
    const y = 1+1.2*rnd(seed, i+60)*Math.sin(Math.PI*clamp01(tt/.5))-1.2*easeIn(k);
    petal(d, x, z, Math.max(.1, y), .13, tt*10+i, fade(k, 1.2), i%3 ? PETAL : PETAL_D);
  }
  d.shock(ev.x, ev.z, .4+2.2*easeOut(k/.5), .08, P.main, fade(k/.6), P.core);
  if(T.glow) d.pool(ev.x, ev.z, 1.8, P.glow, .35*fade(k));
}
/** Stepping out: the petals gather back into the wielder, a ring, a glint of the blade going home. */
function paintAppear(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.7;
  if(k >= 1 || !d.near(ev.x, ev.z, 4)) return;
  const n = 8+T.motes;
  for(let i = 0; i < n; i++){
    const a = rnd(seed, i)*TAU+age*3, r = 2.4*(1-easeOut(Math.min(1, age/.28)));
    if(r > .05) petal(d, ev.x+Math.cos(a)*r, ev.z+Math.sin(a)*r*.7, .9+Math.sin(a*2)*.3, .12, age*12+i, .9, i%2 ? PETAL : PETAL_D);
  }
  d.shock(ev.x, ev.z, .3+1.6*easeOut(k), .07, P.main, fade(k), P.core);
  if(T.r >= 2) d.beam(ev.x, ev.z, .2, 2.4*easeOut(age/.15), .25*(1-k), P.glow, .5*fade(k));
  if(T.r >= 4) d.twinkle(ev.x+(ev.dx || 0)*.6, ev.z+(ev.dz || 0)*.6, 1.4, .35*fade(k), P.core, fade(k), age*4);
}
/** The draw itself lands with a glint at the tip from ★2. */
function paintDraw(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.35;
  if(k >= 1 || T.r < 2 || !Number.isFinite(ev.x1) || !d.near(ev.x1, ev.z1, 3)) return;
  d.twinkle(ev.x1, ev.z1, Y, .28*(1-k)+(ev.n === 2 ? .12 : 0), P.core, fade(k), age*6);
  if(T.r >= 3) d.sparks(ev.x1, ev.z1, Y, ev.n === 2 ? 6 : 3, age, P.main, fade(k), seed, {speed: 4, up: 1, gravity: 8, life: .3});
}

export const KATANA_EVENTS = {
  katadraw: {life: () => .35, paint(d, ev, age, seed){paintDraw(d, ev, age, seed);}},
  katasnap: {life: ev => ev.skill ? .9 : .65, paint(d, ev, age, seed){paintSnap(d, ev, age, seed);},
    kick: ev => {const T = tier(ev.rank); return ev.skill ? {shake: .25+T.shake, flash: T.flash*1.1, color: '#ffe8ef'} : (ev.hits > 0 ? {shake: .06+T.shake*.4, flash: 0} : null);}},
  katavanish: {life: () => 1.1, paint(d, ev, age, seed){paintVanish(d, ev, age, seed);}, kick: ev => ({shake: .08+tier(ev.rank).shake*.3, flash: 0})},
  kataappear: {life: () => .7, paint(d, ev, age, seed){paintAppear(d, ev, age, seed);}},
  kataline: {life: () => .01, paint(){}},
};

/** ★3: a few petals drift down round whoever carries the blade. */
function paintPetals(d, world, p, anchor, motion, clock){
  const T = tier(rankOfOwner(p));
  if(T.r < 3 || p.vanish > (world?.time ?? 0)) return {};
  const n = T.r >= 5 ? 3 : 2;
  for(let i = 0; i < n; i++){
    const cyc = (clock*.32+i/n)%1, s = i*17+3;
    const x = anchor.x+Math.sin(clock*.9+s)*.7-(motion?.vx || 0)*cyc*.12, z = anchor.z+.25+Math.cos(clock*.7+s)*.3;
    petal(d, x, z, 2.2-2*cyc, .1, clock*2.5+s, .85*Math.sin(Math.PI*cyc));
  }
  return {};
}

/** Kagekiri's entry in src/fx/index.mjs WEAPON_FX. */
export const KATANA_FX = {
  id: PACK,
  events: KATANA_EVENTS,
  lists: {magicSweeps: (d, c, owner, ctx) => paintCut(d, c, owner, ctx)},
  // The vanishing burst is the skill's own cast flourish (katavanish); the draw needs no generic one.
  skillCast: () => {},
  magicCast: false,
  rig: (d, world, p, anchor, motion, clock) => ({keep: paintPetals(d, world, p, anchor, motion, clock)}),
};
