// Weapon effects toolkit: colours per weapon, how much show a rank buys, and the brushes every
// painter shares. Presentation only. Painters draw from replicated state (event ids, beat ages,
// the renderer clock); cosmetic randomness is hashed from ids so every screen shows the same spray.
// Output is the renderer-neutral command list of src/magic/effects.mjs: {kind:'orb'|'path', ...},
// plus `glow` (added as light by an additive mesh) and `soft` (feathered to nothing at the edges).

export const TAU = Math.PI*2;
export const clamp01 = n => n < 0 ? 0 : n > 1 ? 1 : n;
export const lerp = (a, b, t) => a+(b-a)*t;
export const easeOut = t => 1-(1-clamp01(t))**3;
export const easeOut2 = t => 1-(1-clamp01(t))**2;
export const easeIn = t => clamp01(t)**2;
export const easeInOut = t => {t = clamp01(t); return t < .5 ? 4*t*t*t : 1-(-2*t+2)**3/2;};
/** 0 → 1 → 0 over t in [0, 1]. */
export const bump = t => Math.sin(Math.PI*clamp01(t));
/** 1 at t=0 fading to 0 at t=1, with a curve. */
export const fade = (t, k = 1.6) => (1-clamp01(t))**k;

export function hash(n){
  let h = Math.imul((n|0)^0x9e3779b9, 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0)/4294967296;
}
export function seedOf(value){
  if(typeof value === 'number') return value|0;
  let h = 2166136261;
  for(const c of String(value ?? '')){h ^= c.charCodeAt(0); h = Math.imul(h, 16777619);}
  return h|0;
}
/** Stable pseudo-random in [0, 1) for particle `i` of effect `seed`. */
export const rnd = (seed, i) => hash(Math.imul(seed|0, 31)+Math.imul(i+1, 977));

// ------------------------------------------------------------------ colour per weapon
// core: hottest white-hot centre; main: the weapon's colour; glow: the halo; deep: shadows and
// ground scorch; alt: a second accent for high ranks.
const H = (core, main, glow, deep, alt = glow) => Object.freeze({core, main, glow, deep, alt});
export const HUES = Object.freeze({
  default: H('#fff6e4', '#f4c486', '#e89a4a', '#3a2a24'),
  fist: H('#fff6e4', '#f4c486', '#e89a4a', '#3a2a24', '#ffd8a0'),
  spear: H('#f4ffe2', '#a6e070', '#5fb03c', '#233a18', '#e9d27a'),
  sword: H('#ffffff', '#d4e6ff', '#8fb6ff', '#23304f', '#b9a4ff'),
  recurve: H('#fffbe8', '#ecd49a', '#c99a52', '#3c2e1c', '#9fe0a8'),
  bonebow: H('#fbfff6', '#e3f4ea', '#86dcc7', '#1c2e2a', '#c9b6ff'),
  broadsword: H('#fff8e6', '#ffd48a', '#ff9e3d', '#3e2412', '#ffe9b8'),
  crookstaff: H('#f0fbff', '#a6e2ff', '#63b0ff', '#1b2a44', '#d7c4ff'),
  flamberge: H('#fff4c8', '#ffa040', '#ff4a1c', '#3a140c', '#ffd24a'),
  skullstaff: H('#f0fff5', '#86ffb8', '#2fcf7a', '#10301f', '#c6ff6a'),
  tome: H('#fff2c9', '#ffb24a', '#ff5a1f', '#34120c', '#ffe07a'),
  fangs: H('#ffe8e8', '#ff6262', '#c3203c', '#34080e', '#ff9a6a'),
  soulchain: H('#f7ecff', '#c7a0ff', '#8a4dff', '#1f1033', '#7fe0ff'),
  scythe: H('#f2fff9', '#a4f2d4', '#3dba9a', '#0f2c26', '#ff6a6a'),
  wisplantern: H('#f2fffd', '#92f6ec', '#3ed8c8', '#10303a', '#d8fff0'),
  stormrod: H('#ffffff', '#c4ebff', '#6ab8ff', '#141f44', '#f4e27a'),
  starfall: H('#fffdf0', '#ffe48e', '#f4ab3a', '#241a44', '#b58cff'),
  crowtotem: H('#f3e9ff', '#a58ad8', '#5e3c96', '#120c1e', '#ff6a8a'),
  jacklantern: H('#fff2c4', '#ffa232', '#ff6a00', '#381a04', '#9fe05a'),
  wighthorn: H('#ecfcff', '#a4dcec', '#4aa2cc', '#0e1e2a', '#e9f2ff'),
  censer: H('#ffffff', '#dcf4ff', '#8fd2ff', '#16283a', '#b9f3ff'),
  gloomgrasp: H('#f5deff', '#b774ff', '#6a1fd0', '#10051c', '#ff5ad8'),
  plaguebeak: H('#f6ffd9', '#bdf262', '#6fb82a', '#18280a', '#e9ff8a'),
  'barrow-rattle': H('#f6fff8', '#dcf2e2', '#7fd6c4', '#1c2824', '#fff0c0'),
  'cinder-staff': H('#fff2cc', '#ffb24e', '#ff5a1a', '#2a1008', '#ffe08a'),
  'widows-needle': H('#fcf2ff', '#dcc2ea', '#b46ccc', '#1c1024', '#ff7aa8'),
  'spirit-fan': H('#f2fffb', '#aef2de', '#4fd0b0', '#10302a', '#fff0b8'),
  'mourning-bell': H('#fff8e2', '#ecc87e', '#bb8f56', '#281e10', '#7fd6c4'),
  pallbearer: H('#f5f7ff', '#b8c4ff', '#7f8cff', '#1a1838', '#ff8fd0'),
  'hollow-moon': H('#fffbea', '#b69cff', '#7d5cff', '#140a2e', '#7ff0ff'),
});
/**
 * The kitsune's colours: one is rolled each time the Nine-Tail Lantern is equipped (FOX_LOOKS in
 * magic/kitsune-lantern.mjs) and everything it makes is drawn in it. `fur` is the tails' body,
 * `ink` their outline (a dark of the same hue, so the whole look stays one colour).
 */
const F = (core, main, glow, deep, alt, fur, ink) => Object.freeze({core, main, glow, deep, alt, fur, ink});
export const FOX = Object.freeze({
  gold: F('#fff6d2', '#ffbf2a', '#ffa114', '#c26f06', '#ffe27a', '#ffd04d', '#4a2604'),
  red: F('#ffe3d9', '#ff4a36', '#ff2a18', '#a8121a', '#ff9474', '#ff6a4f', '#3d080c'),
  violet: F('#f4e6ff', '#a65cff', '#8f3dff', '#5320b0', '#d4a6ff', '#b97cff', '#1e0b3c'),
});
/** A wielder's kitsune colours (from the player, or a look id); red until the host has rolled one. */
export const foxLook = who => FOX[typeof who === 'string' ? who : who?.kitsuneLook?.hue] || FOX.red;
/** Colours for an item; the kitsune's depend on the wielder's look. */
export const hue = (itemId, look) => itemId === 'kitsune-lantern' ? foxLook(look) : HUES[itemId] || HUES.default;
export const INK = '#2b2233';

/**
 * How much show a rank buys. ★1 is the weapon's plain move. Each rank adds a layer: glow and
 * trails (★2), sparks and rays and a second ring (★3), sigils, pillars, debris and a camera kick
 * (★4), and at ★5 prismatic rings, the most particles and a screen flash on the big moments.
 */
export function tier(rank){
  const r = Math.max(1, Math.min(5, (rank|0) || 1));
  return {
    r, glow: r >= 2, trail: r >= 2, rays: r >= 3, rings: r >= 5 ? 3 : r >= 3 ? 2 : 1,
    sigil: r >= 4, pillar: r >= 4, debris: r >= 4, prism: r >= 5,
    sparks: [3, 6, 10, 15, 22][r-1], motes: [0, 4, 7, 11, 16][r-1],
    shake: [0, 0, .1, .3, .55][r-1], flash: [0, 0, 0, .1, .26][r-1],
    size: 1+(r-1)*.07, bright: .65+r*.07,
  };
}

// ------------------------------------------------------------------ brushes
/** Billboard offset: u to the screen's right, v toward the screen's top, around (x, y, z). */
export const at = (x, z, y, u, v) => [x+u, y+v*.694, z-v*.72];

/** Highest a command reaches: ground-hugging shapes are drawn under the sprites. */
const GROUND = .16;
export class Painter {
  constructor(){this.normal = []; this.glow = []; this.groundNormal = []; this.groundGlow = []; this.focus = {x: 0, z: 0}; this.lights = [];}
  reset(focus){this.normal.length = 0; this.glow.length = 0; this.groundNormal.length = 0; this.groundGlow.length = 0; this.lights.length = 0; if(focus){this.focus.x = focus.x; this.focus.z = focus.z;}}
  list(glow, ground){return ground ? (glow ? this.groundGlow : this.groundNormal) : (glow ? this.glow : this.normal);}
  /** Worth drawing: near enough the camera to be on screen. */
  near(x, z, margin = 0){return Math.abs(x-this.focus.x) < 26+margin && Math.abs(z-this.focus.z) < 30+margin;}
  light(x, z, radius){if(radius > .3 && this.lights.length < 12) this.lights.push({x, z, radius, kind: 'fx'});}

  orb(x, z, y, r, color, alpha = 1, {glow = false, soft = false, ground = false} = {}){
    if(!(alpha > .004) || !(r > .004)) return;
    this.list(glow, ground && y <= GROUND).push({kind: 'orb', center: [x, y, z], radius: r, color, alpha: Math.min(1, alpha), ground, soft, glow});
  }
  path(points, width, color, alpha = 1, {glow = false, soft = false, fill = false, taper = 0} = {}){
    if(!(alpha > .004) || !points || points.length < 2) return;
    let low = true;
    for(const q of points) if(q[1] > GROUND){low = false; break;}
    this.list(glow, low).push({kind: 'path', points, width, color, alpha: Math.min(1, alpha), fill, soft, taper, glow});
  }
  /** A soft radial light in the air. */
  bloom(x, z, y, r, color, alpha = 1){this.orb(x, z, y, r, color, alpha, {glow: true, soft: true});}
  /** A soft light pooled on the ground. */
  pool(x, z, r, color, alpha = 1){this.orb(x, z, .05, r, color, alpha, {glow: true, soft: true, ground: true});}
  /** A dark stain on the ground (scorch, shadow). */
  stain(x, z, r, color, alpha = 1){this.orb(x, z, .04, r, color, alpha, {soft: true, ground: true});}
  circle(x, z, r, y = .07, steps = 0, from = 0, to = TAU){
    const n = steps || Math.max(16, Math.min(48, Math.round(r*10)));
    const pts = [];
    for(let i = 0; i <= n; i++){const a = from+(to-from)*i/n; pts.push([x+Math.cos(a)*r, y, z+Math.sin(a)*r]);}
    return pts;
  }
  /** A ring on the ground. */
  ring(x, z, r, width, color, alpha = 1, {glow = true, soft = false, y = .07, from = 0, to = TAU, ink = 0} = {}){
    if(!(r > .02)) return;
    const pts = this.circle(x, z, r, y, 0, from, to);
    if(ink > 0) this.path(pts, width+ink, INK, alpha*.45);
    this.path(pts, width, color, alpha, {glow, soft});
  }
  /** A painted ring: ink edge, a saturated colour stroke, and a soft glow over it. */
  mark(x, z, r, width, color, alpha = 1, {y = .07, halo = .35} = {}){
    if(!(r > .02) || !(alpha > .004)) return;
    const pts = this.circle(x, z, r, y);
    this.path(pts, width*2.2, INK, alpha*.35);
    this.path(pts, width, color, alpha);
    if(halo > 0) this.path(pts, width*3.2, color, alpha*halo, {glow: true, soft: true});
  }
  /** An expanding shockwave: bright leading edge and a softer wake. */
  shock(x, z, r, width, color, alpha = 1, core = '#ffffff'){
    if(!(r > .05) || !(alpha > .004)) return;
    // A painted band in the colour (it stays saturated on pale ground), a soft halo of light
    // around it, and a thin hot edge.
    const pts = this.circle(x, z, r, .07);
    this.path(pts, width*2.6, color, alpha*.4, {glow: true, soft: true});
    this.path(pts, width*1.3, color, alpha*.75);
    this.path(pts, width*.5, core, alpha*.85, {glow: true});
  }
  /** A filled star shape standing up toward the camera (fan from its centre). */
  star(x, z, y, r, color, alpha = 1, {spin = 0, points = 5, inner = .45, glow = false, ink = 0} = {}){
    const pts = [[x, y, z]];
    for(let i = 0; i <= points*2; i++){
      const a = spin+i*Math.PI/points-Math.PI/2, rr = i%2 ? r*inner : r;
      pts.push(at(x, z, y, Math.cos(a)*rr, -Math.sin(a)*rr));
    }
    this.path(pts, 0, color, alpha, {glow, fill: true});
    if(ink > 0) this.path(pts.slice(1), ink, INK, alpha);
  }
  /** A four-point twinkle. */
  twinkle(x, z, y, r, color, alpha = 1, spin = 0){
    this.star(x, z, y, r, color, alpha, {spin, points: 4, inner: .18, glow: true});
    this.bloom(x, z, y, r*.9, color, alpha*.45);
  }
  /** A vertical beam of light. */
  beam(x, z, y0, y1, width, color, alpha = 1){
    this.path([[x, y0, z], [x, y1, z]], width, color, alpha, {glow: true, soft: true});
  }
  /** Light rays from a centre, billboarded. */
  rays(x, z, y, n, len, width, color, alpha, seed = 0, spin = 0){
    for(let i = 0; i < n; i++){
      const a = spin+i/n*TAU+(rnd(seed, i)-.5)*.5, l = len*(.55+rnd(seed, i+40)*.6);
      this.path([at(x, z, y, 0, 0), at(x, z, y, Math.cos(a)*l, Math.sin(a)*l)], width, color, alpha, {glow: true, taper: .95});
    }
  }
  /** Rays flat on the ground, like a crater's splash marks. */
  groundRays(x, z, n, r0, r1, width, color, alpha, seed = 0, spin = 0){
    for(let i = 0; i < n; i++){
      const a = spin+i/n*TAU+(rnd(seed, i)-.5)*.4, l = r0+(r1-r0)*(.6+rnd(seed, i+17)*.4);
      this.path([[x+Math.cos(a)*r0, .08, z+Math.sin(a)*r0], [x+Math.cos(a)*l, .08, z+Math.sin(a)*l]], width, color, alpha, {glow: true, taper: .9});
    }
  }
  /** Ballistic sparks: streaks flung out and falling. t is seconds since the burst. */
  sparks(x, z, y, n, t, color, alpha, seed, {speed = 6, up = 3, gravity = 12, len = .06, width = .07, spread = TAU, dir = 0, life = .6} = {}){
    for(let i = 0; i < n; i++){
      const lifeI = life*(.55+rnd(seed, i+3)*.6), k = t/lifeI;
      if(k >= 1) continue;
      const a = dir+(spread >= TAU-.01 ? rnd(seed, i)*TAU : (rnd(seed, i)-.5)*spread);
      const v = speed*(.45+rnd(seed, i+9)*.8), vu = up*(.3+rnd(seed, i+21)*.9);
      const pos = s => [x+Math.cos(a)*v*s, Math.max(.05, y+vu*s-gravity*s*s*.5), z+Math.sin(a)*v*s];
      const s0 = Math.max(0, t-len), s1 = t;
      this.path([pos(s0), pos(s1)], width*(1-k*.5), color, alpha*fade(k, 1.2), {glow: true, taper: .7});
    }
  }
  /** Motes drifting up out of a spot. */
  motes(x, z, n, t, radius, color, alpha, seed, {rise = 1.4, size = .07, life = 1.1, y = .2} = {}){
    for(let i = 0; i < n; i++){
      const lifeI = life*(.6+rnd(seed, i+5)*.6), k = ((t/lifeI)+rnd(seed, i+11))%1;
      if(t > lifeI*1.6) continue;
      const a = rnd(seed, i)*TAU, r = radius*Math.sqrt(rnd(seed, i+2));
      const px = x+Math.cos(a)*r+Math.sin(t*3+i)*.08, pz = z+Math.sin(a)*r;
      this.bloom(px, pz, y+k*rise, size*(1.3-k*.6), color, alpha*bump(k));
    }
  }
  /** Dark chunks thrown up and landing: grounding weight under the light. */
  debris(x, z, n, t, color, seed, {speed = 4, up = 5, gravity = 16, size = .1, life = .75} = {}){
    for(let i = 0; i < n; i++){
      const k = t/life; if(k >= 1) continue;
      const a = rnd(seed, i+50)*TAU, v = speed*(.4+rnd(seed, i+51)*.8), vu = up*(.5+rnd(seed, i+52)*.7);
      const s = Math.min(t, life), px = x+Math.cos(a)*v*s, pz = z+Math.sin(a)*v*s, py = Math.max(.06, .2+vu*s-gravity*s*s*.5);
      const r = size*(.7+rnd(seed, i+53)*.8), spin = t*8+i;
      const pts = [0, 1, 2, 3].map(j => at(px, pz, py, Math.cos(spin+j*1.7)*r, Math.sin(spin+j*1.7)*r*.8));
      this.path(pts, 0, color, fade(k, 3), {fill: true});
    }
  }
  /** Jagged lightning between points [[x, y, z], ...]; `seed` changes its shape. */
  lightning(points, width, color, alpha, seed, {jag = .45, steps = 6, core = '#ffffff'} = {}){
    const bent = [];
    for(let i = 0; i < points.length-1; i++){
      const a = points[i], b = points[i+1];
      for(let k = 0; k < steps; k++){
        const t = k/steps, j = k ? jag : 0;
        bent.push([a[0]+(b[0]-a[0])*t+(rnd(seed, i*20+k)-.5)*j, a[1]+(b[1]-a[1])*t+(rnd(seed, i*20+k+7)-.5)*j*.6, a[2]+(b[2]-a[2])*t+(rnd(seed, i*20+k+13)-.5)*j]);
      }
    }
    bent.push(points[points.length-1]);
    this.path(bent, width*3, color, alpha*.55, {glow: true, soft: true});
    this.path(bent, width, core, alpha, {glow: true});
    return bent;
  }
  /** A crescent blade trail on the ground plane (y), sweeping `arc` radians around `facing`. */
  crescent(x, z, y, r, facing, arc, thick, color, alpha, {glow = true, light = false, grow = 1, steps = 22} = {}){
    const outer = [], inner = [];
    const a0 = facing-arc/2;
    for(let i = 0; i <= steps; i++){
      const t = i/steps, a = a0+arc*t*grow, w = thick*Math.sin(Math.PI*t)**.7;
      outer.push([x+Math.cos(a)*r, y, z+Math.sin(a)*r]);
      inner.push([x+Math.cos(a)*(r-w), y, z+Math.sin(a)*(r-w)]);
    }
    // `light`: the whole blade is added light (white-hot highlights). Otherwise the blade is painted
    // in its colour, with a glowing leading edge when `glow`.
    this.path([...outer, ...inner.slice().reverse()], 0, color, alpha*(light ? 1 : .85), {glow: light, fill: 'ribbon'});
    if(glow && !light){
      this.path(outer, thick*.9, color, alpha*.45, {glow: true, soft: true});
      this.path(outer, Math.max(.04, thick*.14), '#ffffff', alpha*.55, {glow: true, taper: .6});
    }
  }
  /** A rune circle: two rings, a star polygon, tick marks. */
  sigil(x, z, r, color, alpha, {spin = 0, sides = 5, y = .06, width = .05, glow = true} = {}){
    if(!(alpha > .004)) return;
    // Painted in the colour itself (so it stays saturated on pale ground) with an ink edge,
    // then lit by a soft additive halo when `glow`.
    const star = [];
    for(let i = 0; i <= sides; i++){const a = spin+(i*2%sides)/sides*TAU; star.push([x+Math.cos(a)*r*.8, y, z+Math.sin(a)*r*.8]);}
    const outer = this.circle(x, z, r, y), inner = this.circle(x, z, r*.82, y);
    for(const [pts, w] of [[outer, width], [inner, width*.7], [star, width*.8]]) this.path(pts, w*2.3, INK, alpha*.3);
    this.path(outer, width, color, alpha*.95);
    this.path(inner, width*.7, color, alpha*.8);
    this.path(star, width*.8, color, alpha*.85);
    for(let i = 0; i < sides*3; i++){
      const a = -spin*.6+i/(sides*3)*TAU;
      this.path([[x+Math.cos(a)*r*.86, y, z+Math.sin(a)*r*.86], [x+Math.cos(a)*r*.96, y, z+Math.sin(a)*r*.96]], width*.6, color, alpha*.7);
    }
    if(glow){this.path(outer, width*4, color, alpha*.3, {glow: true, soft: true}); this.path(star, width*3, color, alpha*.22, {glow: true, soft: true});}
  }
  /** A soft streak between two points in the air (comet tails, dash trails). */
  streak(a, b, width, color, alpha, taper = .9){this.path([a, b], width, color, alpha, {glow: true, soft: true, taper});}
}
