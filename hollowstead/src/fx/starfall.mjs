// Starfall scepter: every star falls from its own patch of sky along a curve (the host picks the
// start in arsenal.skyPath), marks its landing, and bursts in light. Rank decides the show:
// ★1 a plain star, a thin mark and a flash; ★2 a glowing comet tail and a lit mark; ★3 twin
// companion stars, a rune circle, light rays and a second shockwave; ★4 a braided prismatic tail,
// a pillar of light, thrown debris and a camera kick; ★5 shed sparkles, a constellation drawn
// between your last impacts, a three-ring prismatic shock and a screen flash.
// The Heavenfall skill reuses the same star at other scales and adds its constellation sigil.
import {INK, TAU, at, bump, clamp01, easeIn, easeOut, easeOut2, fade, hue, rnd, tier} from './kit.mjs?v=harvest-18';

const STAR = hue('starfall');
const CREAM = '#fbeab2';
const PRISM = ['#ffe48e', '#ff9ad6', '#b58cff', '#7fd6ff', '#9ff5c8'];
/** Saturated versions for painted (non-additive) strokes on pale ground. */
const PRISM_DEEP = ['#f2b43c', '#e8599e', '#8a5ce0', '#3aa6e0', '#3cc88a'];
const GOLD = '#f2b43c';

/** Point on a star's fall at u in [0, 1]: a quadratic curve from its patch of sky to the ground. */
export function starPoint(s, u){
  const x0 = s.x+(s.ox ?? 3), z0 = s.z+(s.oz ?? -1.5), y0 = s.oh ?? 9.5;
  const x1 = s.x, z1 = s.z, y1 = .45;
  // The curve bows sideways across the screen (world x), so every fall reads as an arc.
  const bend = s.bend ?? 1.5;
  const cx = (x0+x1)/2+bend*1.6, cz = (z0+z1)/2-.6, cy = (y0+y1)/2+y0*.2;
  const a = (1-u)*(1-u), b = 2*(1-u)*u, c = u*u;
  return [a*x0+b*cx+c*x1, a*y0+b*cy+c*y1, a*z0+b*cz+c*z1];
}
/** Falls accelerate: slow to appear, fast to land. */
const fall = t => .12*t+.88*t**1.8;

/** A falling star at progress t (0 in the sky, 1 on the ground). `scale` sizes everything. */
export function paintStar(d, s, t, rank, {scale = 1, seed = 0, clock = 0} = {}){
  if(t < 0 || t > 1) return;
  const T = tier(rank), u = fall(t), head = starPoint(s, u);
  if(!d.near(head[0], head[2], 8)) return;
  const appear = clamp01(t*6);
  // The tail: samples back along the curve. Longer, wider and more layered with rank.
  const span = (.2+.045*T.r)*Math.min(1, .35+u*1.4), n = 9+T.r*2, tail = [];
  for(let i = 0; i <= n; i++) tail.push(starPoint(s, Math.max(0, u-span*i/n)));
  if(T.r >= 2) d.path(tail, (.62+.1*T.r)*scale, STAR.glow, .42*T.bright*appear, {glow: true, soft: true, taper: .96});
  if(T.r >= 4){
    // Braided prismatic strands either side of the tail.
    for(const [side, color] of [[1, '#b58cff'], [-1, '#7fd6ff']]){
      const strand = tail.map((p, i) => {const w = Math.sin(i*.9+clock*14*side)*.16*scale*(i/n); return at(p[0], p[2], p[1], w*side, w*.4);});
      d.path(strand, .09*scale, color, .8*appear, {glow: true, taper: .9});
    }
  }
  d.path(tail, (.3+.02*T.r)*scale, CREAM, .92*appear, {taper: .97});
  d.path(tail.slice(0, Math.ceil(n*.6)), .1*scale, STAR.core, appear, {glow: true, taper: .9});
  if(T.r >= 5){
    for(let i = 2; i < tail.length; i += 2){
      const p = tail[i], k = i/tail.length, flick = .5+.5*Math.sin(clock*20+i*2.1);
      d.twinkle(p[0]+(rnd(seed, i)-.5)*.5*scale, p[2], p[1]+(rnd(seed, i+9)-.5)*.4, .12*scale*(1-k*.5), PRISM[i%PRISM.length], appear*flick*(1-k));
    }
  }
  // Companion stars circling the head.
  if(T.r >= 3){
    for(let k = 0; k < 2; k++){
      const a = clock*9+k*Math.PI+seed, r = .5*scale;
      const q = at(head[0], head[2], head[1], Math.cos(a)*r, Math.sin(a)*r*.7);
      d.twinkle(q[0], q[2], q[1], .15*scale, k ? '#b58cff' : '#fff3c4', appear*.95, clock*5);
    }
  }
  // The head: a cartoon star with an ink outline, in a halo.
  d.bloom(head[0], head[2], head[1], (.55+.1*T.r)*scale, T.r >= 2 ? STAR.glow : STAR.main, (.45+.06*T.r)*appear);
  d.star(head[0], head[2], head[1], .34*scale*T.size, '#fff1b8', appear, {spin: clock*4+seed, ink: .07*scale});
  d.star(head[0], head[2], head[1], .15*scale*T.size, '#ffffff', appear, {spin: clock*4+seed, glow: true});
  if(T.r >= 2) d.light(head[0], head[2], 2.2*scale);
}

/** Where the star will land: a mark that tightens as it nears. t is fall progress. */
export function paintMark(d, x, z, radius, t, rank, clock, {scale = 1, lite = false} = {}){
  if(!d.near(x, z, radius)) return;
  const T = tier(rank), show = clamp01(t*5)*(t < 1 ? 1 : 0);
  if(!(show > 0)) return;
  d.mark(x, z, radius, .05*scale, GOLD, .75*show, {halo: T.r >= 2 ? .35 : .15});
  d.ring(x, z, radius*(1-.85*easeIn(t))+.15, .06*scale, STAR.core, .8*show, {glow: true});
  if(T.r >= 2) d.pool(x, z, radius*(.5+.5*t), STAR.glow, (.1+.28*t)*show);
  if(T.r >= 3 && !lite) d.sigil(x, z, radius*.9, GOLD, .7*show, {spin: clock*.9, sides: 5, width: .055});
  if(T.r >= 4 && !lite) d.beam(x, z, .1, 5+t*5, .5*scale+t*.4, STAR.glow, .16*t*show);
  if(T.r >= 5 && !lite) d.mark(x, z, radius*1.14, .045, PRISM_DEEP[Math.floor(clock*6)%PRISM_DEEP.length], .8*show, {halo: .4});
}

/** The burst when a star lands. age in seconds. `small` is a shower star, `heart` the skill's big one. */
export function paintImpact(d, x, z, radius, age, rank, seed, {heart = false, small = false, scale = 1} = {}){
  if(!d.near(x, z, radius+4)) return;
  const T = tier(rank), R = radius;
  // White-hot flash, then the coloured bloom around it.
  const f = age/(heart ? .5 : .3);
  if(f < 1){
    const core = Math.min(heart ? 3.2 : small ? 1 : 2, R*(small ? .45 : .6))*(.6+.6*easeOut(age/.1));
    d.bloom(x, z, .7, core, STAR.core, (1-f)**2*(small ? .6 : .8));
    d.bloom(x, z, .5, R*(small ? .8 : 1.15), STAR.glow, (1-f)**1.5*(small ? .25 : .38));
    d.light(x, z, R*2.4*(1-f));
  }
  d.pool(x, z, R*1.1, STAR.glow, (small ? .3 : .5)*fade(age/(heart ? 1.2 : .6)));
  // Shockwaves: one at ★1, prismatic three at ★5.
  const rings = heart ? Math.max(2, T.rings) : small ? (T.prism ? 2 : 1) : T.rings;
  for(let k = 0; k < rings; k++){
    const tk = (age-k*.07)/(heart ? .6 : .42);
    if(tk <= 0 || tk >= 1) continue;
    const color = k === 0 ? STAR.glow : T.prism ? PRISM_DEEP[(k*2)%PRISM_DEEP.length] : STAR.alt;
    d.shock(x, z, .3+R*(heart ? 1.35 : 1.2)*easeOut(tk), ((small ? .05 : .08)+.02*T.r)*(1-tk)+.02, color, fade(tk, 1.3)*(small ? .7 : 1), k === 0 ? STAR.main : color);
  }
  // Scorch left behind, embers glowing in it.
  const linger = heart ? 2.2 : small ? .8 : 1.1;
  d.stain(x, z, R*.75, STAR.deep, .38*fade(age/linger, .8));
  if(T.r >= 2) d.pool(x, z, R*.45, '#ff9a3c', .3*fade(age/linger));
  d.sparks(x, z, .4, Math.round(T.sparks*(small ? .5 : 1))+(heart ? 12 : 0), age, STAR.main, 1, seed, {speed: 4+R*1.4, up: 4.5, life: .75});
  const rays = heart ? T.r >= 2 : small ? T.r >= 5 : T.rays;
  if(rays && age < .32){
    d.rays(x, z, .9, (small ? 5 : 7)+T.r*2+(heart ? 6 : 0), R*(heart ? 2.2 : small ? 1.2 : 1.8), (small ? .08 : .12)*scale, STAR.main, (1-age/.32)*(small ? .7 : 1), seed, seed*.1);
    if(!small) d.groundRays(x, z, 8+T.r, R*.3, R*1.1, .1, STAR.main, .6*(1-age/.32), seed+3);
  }
  if(T.rays && !small) d.motes(x, z, T.motes, age, R*.7, '#ffcf6a', .9*fade(age/linger), seed, {life: .9, rise: 1.6});
  if((T.pillar && !small) || heart){
    const k = age/(heart ? .7 : .45);
    if(k < 1){
      d.beam(x, z, 0, heart ? 18 : 13, (heart ? 1.8 : 1.1)*(1-k*.6)*scale, STAR.glow, .5*(1-k));
      d.beam(x, z, 0, heart ? 18 : 13, (heart ? .6 : .4)*(1-k), STAR.core, .85*(1-k));
    }
  }
  if(T.debris && !small) d.debris(x, z, 5+T.r+(heart ? 6 : 0), age, INK, seed, {speed: 3+R, up: 5});
  if(T.prism){
    // Sparkle rain settling around the crater.
    for(let i = 0; i < (small ? 5 : 12)+(heart ? 10 : 0); i++){
      const a = rnd(seed, i+70)*TAU, r = R*(.3+rnd(seed, i+71)*1.1), k = (age-rnd(seed, i+72)*.3)/1.1;
      if(k <= 0 || k >= 1) continue;
      d.twinkle(x+Math.cos(a)*r, z+Math.sin(a)*r, 2.2*(1-k)+.2, .13, PRISM[i%PRISM.length], bump(k), age*6+i);
    }
  }
}

/** A falling star's zone (the auto attack): the star in flight and its mark. */
export function paintStarZone(d, zone, lead, clock){
  const t = clamp01(((zone.age || 0)+lead)/(zone.delay || .7));
  if(t >= 1) return;
  paintMark(d, zone.x, zone.z, zone.radius || 2.6, t, zone.rank || 1, clock);
  paintStar(d, zone, t, zone.rank || 1, {seed: zone.seq || 0, clock});
}

/** Your last few landings at ★5, joined into a constellation that fades. */
function remember(fx, ev, clock){
  if((ev.rank || 1) < 5) return;
  const key = ev.player || '?', list = fx.memory.get(key) || [];
  list.push({x: ev.x, z: ev.z, t: clock});
  while(list.length > 6) list.shift();
  fx.memory.set(key, list.filter(p => clock-p.t < 5));
}
export function paintConstellations(d, fx, clock){
  for(const list of fx.memory.values()){
    for(let i = 0; i < list.length; i++){
      const p = list[i], age = clock-p.t, a = fade(age/5, .8);
      if(!(a > .01)) continue;
      d.twinkle(p.x, p.z, .35, .16, '#fff3c4', a*(.7+.3*Math.sin(clock*5+i)), clock*2+i);
      const q = list[i+1];
      if(q){
        const grow = clamp01((clock-q.t)/.25), mx = p.x+(q.x-p.x)*grow, mz = p.z+(q.z-p.z)*grow;
        d.path([[p.x, .3, p.z], [mx, .3, mz]], .05, '#d9c8ff', a*.8, {glow: true});
        d.path([[p.x, .3, p.z], [mx, .3, mz]], .16, '#b58cff', a*.3, {glow: true, soft: true});
      }
    }
  }
}

// ------------------------------------------------------------------ the skill: Heavenfall
function paintConstellationSigil(d, b, tt, clock){
  const pts = b.pts || [], T = tier(b.rank), draw = clamp01(tt/.35), gone = b.at-tt;
  const alpha = draw*(gone < .15 ? clamp01(gone/.15) : 1);
  if(!(alpha > 0)) return;
  // Lines light up as each point is traced; each node flares when its star lands.
  for(let i = 0; i < pts.length; i++){
    const [x, z, landAt] = pts[i], [nx, nz] = pts[(i+1)%pts.length], k = clamp01(draw*pts.length-i);
    if(k <= 0) continue;
    const landed = tt >= landAt, flare = landed ? fade((tt-landAt)/.5) : 0;
    d.path([[x, .1, z], [x+(nx-x)*k, .1, z+(nz-z)*k]], .06, landed ? STAR.core : '#cdb8ff', alpha*(landed ? .95 : .65), {glow: true});
    if(T.r >= 2) d.path([[x, .1, z], [x+(nx-x)*k, .1, z+(nz-z)*k]], .22, '#b58cff', alpha*.25, {glow: true, soft: true});
    d.twinkle(x, z, .25, .2+.25*flare, landed ? '#fff3c4' : '#d9c8ff', alpha, clock*3+i);
    // Spokes to the heart.
    if(T.r >= 3) d.path([[x, .09, z], [b.x, .09, b.z]], .03, '#b58cff', alpha*.35*k, {glow: true});
  }
  const R = b.r || 4.8;
  d.mark(b.x, b.z, R, .07, '#8a5ce0', alpha*.8, {halo: .4});
  d.sigil(b.x, b.z, R*.55, GOLD, alpha*.8, {spin: -clock*.7, sides: 5});
  if(T.r >= 4) d.sigil(b.x, b.z, R*1.08, '#3aa6e0', alpha*.55, {spin: clock*.4, sides: 7, width: .045});
  d.pool(b.x, b.z, R*.9, '#6a4cc8', .22*alpha);
}

export const STARFALL_BEATS = {
  meteor: {
    pending(d, b, tt, clock){
      const t = 1-(b.at-tt)/(b.fall || .55);
      if(t < 0) return;
      paintMark(d, b.x, b.z, b.r || 1.9, t, b.rank, clock, {scale: .85, lite: true});
      paintStar(d, b, t, b.rank, {scale: .8, seed: b.seq || 0, clock});
    },
  },
  heartstar: {
    pending(d, b, tt, clock){
      paintConstellationSigil(d, b, tt, clock);
      const t = 1-(b.at-tt)/(b.fall || 1.1);
      if(t < 0) return;
      paintMark(d, b.x, b.z, b.r || 4.8, t, b.rank, clock, {scale: 1.6});
      paintStar(d, b, t, Math.max(3, b.rank), {scale: 2.3, seed: 7, clock});
    },
  },
};

export const STARFALL_EVENTS = {
  starfall: {
    life: ev => .45+.18*(ev.rank || 1)+(ev.rank >= 5 ? .5 : 0),
    paint(d, ev, age, seed){paintImpact(d, ev.x, ev.z, ev.radius || 2.6, age, ev.rank || 1, seed);},
    kick: ev => ({shake: tier(ev.rank).shake*.7, flash: tier(ev.rank).flash*.6, color: '#ffe7a8'}),
    remember,
  },
  'fx:meteor': {
    life: ev => .5+.15*(ev.rank || 1),
    paint(d, ev, age, seed){paintImpact(d, ev.x, ev.z, ev.r || 1.9, age, ev.rank || 1, seed, {scale: .85, small: true});},
    kick: ev => ({shake: tier(ev.rank).shake*.3}),
  },
  'fx:heartstar': {
    life: () => 2.4,
    paint(d, ev, age, seed){paintImpact(d, ev.x, ev.z, ev.r || 4.8, age, ev.rank || 1, seed, {heart: true, scale: 1.6});},
    kick: ev => ({shake: .25+tier(ev.rank).shake, flash: .06+.04*(ev.rank || 1), color: '#ffe6a8'}),
  },
};

/** The scepter raised to the sky when Heavenfall is called. */
export function paintStarfallCast(d, cast, age, clock){
  const T = tier(cast.rank), k = age/.9;
  if(k >= 1) return;
  const x = cast.x+(cast.dx || 0)*.4, z = cast.z+(cast.dz || 0)*.4;
  d.beam(x, z, 1.6, 16, .5+.1*T.r, STAR.glow, .6*fade(k));
  d.beam(x, z, 1.6, 16, .16, STAR.core, .9*fade(k));
  d.bloom(x, z, 1.9, .9+.15*T.r, STAR.core, .9*fade(k));
  d.shock(cast.x, cast.z, .4+2.6*easeOut2(k), .07, '#b58cff', fade(k));
  for(let i = 0; i < 4+T.r*2; i++){
    const a = i/(4+T.r*2)*TAU+clock, r = .7+k*1.5;
    d.twinkle(x+Math.cos(a)*r, z+Math.sin(a)*r*.6, 1+k*2.5+Math.sin(i)*.3, .14, PRISM[i%PRISM.length], fade(k), clock*4);
  }
}
