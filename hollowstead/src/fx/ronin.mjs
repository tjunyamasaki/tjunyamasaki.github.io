// The Kagekiri Ronin's skills, drawn (rules: src/classes/ronin.mjs). Every cut the class lays is an ordinary
// Kagekiri cut and is painted by src/fx/katana.mjs; this module adds what is new: the Shadow Step's ink
// streak, the Shadow Lure's threads, the Crux bursts where cuts cross, the Swift Sheath's ring, the Falling
// Blossom's petals, the echo, the returning swallow and the Thousand Petals. Same palette as the blade:
// sakura and steel over the ink outline. Rank (the blade's ★, which grows with the ronin's level) adds
// flourish the usual way (tier()).
import {TAU, clamp01, easeIn, easeOut, fade, hue, lerp, rnd, tier, INK} from './kit.mjs?v=harvest-18';
import {petal} from './katana.mjs?v=harvest-18';

const P = hue('katana');
const PETAL = '#f7b6c8', PETAL_D = '#d77898', SHADOW = '#3b2a52', SHADOW_L = '#8c74c8';
const Y = .85;

/** A painted stroke between two points: ink, colour, a hot core. */
function stroke(d, a, b, w, color, alpha, {y0 = Y, y1 = Y, core = P.core, glow = 0} = {}){
  if(!(alpha > .02)) return;
  const pts = [];
  for(let i = 0; i <= 8; i++){const t = i/8; pts.push([lerp(a[0], b[0], t), lerp(y0, y1, t), lerp(a[1], b[1], t)]);}
  if(glow > 0) d.path(pts, w*2.6, P.glow, glow*alpha, {glow: true, soft: true, taper: .9});
  d.path(pts, w*1.4+.05, INK, .8*alpha, {taper: .9});
  d.path(pts, w, color, alpha, {taper: .88});
  if(core) d.path(pts, w*.35, core, alpha, {taper: .85});
}
const petals = (d, x, z, n, age, life, seed, spread = 1.6, T = tier(1)) => {
  const k = age/life;
  for(let i = 0; i < n; i++){
    const a = rnd(seed, i)*TAU, sp = (.5+rnd(seed, i+9))*spread, tt = Math.min(age, life);
    const px = x+Math.cos(a)*sp*easeOut(tt/.5), pz = z+Math.sin(a)*sp*easeOut(tt/.5)*.7;
    const py = Y+.7*rnd(seed, i+3)*Math.sin(Math.PI*clamp01(tt/.4))-1*easeIn(k);
    petal(d, px, pz, Math.max(.12, py), .11+.04*rnd(seed, i+4)+(T.r >= 5 ? .02 : 0), tt*8+i, fade(k, 1.4), i%3 ? PETAL : PETAL_D);
  }
};

/** Shadow Step: an ink comet along the dash, a burst where you leave and where you land. */
function paintStep(d, ev, age, seed){
  const T = tier(ev.rank);
  if(ev.start){
    const k = age/.5;
    if(k >= 1) return;
    for(let i = 0; i < 6; i++){
      const a = rnd(seed, i)*TAU, r = .3+.9*easeOut(k)*rnd(seed, i+5);
      d.orb(ev.x+Math.cos(a)*r, ev.z+Math.sin(a)*r*.7, .5+.6*rnd(seed, i+2)+.4*k, (.3+.2*rnd(seed, i+3))*(1-k*.7), INK, .5*fade(k, 1.4), {soft: true});
    }
    d.shock(ev.x, ev.z, .3+1.4*easeOut(k), .07, SHADOW_L, fade(k), P.core);
    return;
  }
  const k = age/.55;
  if(k >= 1 || !Number.isFinite(ev.x0)) return;
  const a = [ev.x0, ev.z0], b = [ev.x, ev.z];
  // The streak: wide dark ink thinning to a line, then a white flash running along it.
  stroke(d, a, b, .5*(1-easeOut(k)), SHADOW, fade(k, 1.2), {y0: Y+.2, y1: Y+.2, core: null});
  if(k < .4) stroke(d, a, b, .14*(1-k/.4), P.main, 1-k/.4, {glow: T.glow ? .6 : 0});
  if(T.r >= 3) petals(d, ev.x, ev.z, 3+T.r, age, .55, seed, 1.4, T);
  d.shock(ev.x, ev.z, .3+1.6*easeOut(k), .07, P.main, fade(k), P.core);
  d.light(ev.x, ev.z, 2.5);
}
/** Shadow Lure: dark threads shoot out to each foe, then reel it in to its cut. */
function paintLure(d, ev, age, seed){
  const T = tier(ev.rank), life = .7, k = age/life;
  if(k >= 1) return;
  for(const [i, [fx, fz, tx, tz]] of (ev.threads || []).entries()){
    if(!d.near(tx, tz, 8)) continue;
    // Out (0 to .12s), then reeled in with the foe (to .45s), then a fading knot on the cut.
    const out = easeOut(age/.12), reel = easeIn(clamp01((age-.12)/.3));
    const hx = lerp(fx, tx, reel), hz = lerp(fz, tz, reel);
    const ex = lerp(tx, hx, out), ez = lerp(tz, hz, out);
    const sag = .35*Math.sin(Math.PI*clamp01(age/.42));
    const pts = [];
    for(let j = 0; j <= 10; j++){const t = j/10; pts.push([lerp(tx, ex, t), Y-.1-sag*Math.sin(Math.PI*t)+rnd(seed, i*11+j)*.04, lerp(tz, ez, t)]);}
    if(age < .45){
      d.path(pts, .13, INK, .85*fade(k));
      d.path(pts, .06, SHADOW_L, fade(k), {glow: T.glow});
      d.orb(ex, ez, Y-.1, .12, SHADOW, .9*fade(k), {});
    }
    d.ring(tx, tz, .3+.4*easeOut(clamp01((age-.4)/.3)), .05, SHADOW_L, .8*fade(clamp01((age-.35)/.35)), {ink: .04});
  }
  d.shock(ev.x, ev.z, .4+2.5*easeOut(k), .06, SHADOW_L, .7*fade(k), P.core);
}
/** Crux: where two cuts crossed, an X flares and bursts into petals. */
function paintCrux(d, ev, age, seed){
  const T = tier(ev.rank), life = .7, k = age/life, r = ev.r || 1.3;
  if(k >= 1) return;
  for(const [i, [x, z]] of (ev.pts || []).entries()){
    if(!d.near(x, z, 4)) continue;
    const s = .45+.6*easeOut(age/.12), f = fade(k, 1.3), turn = rnd(seed, i)*.6;
    for(const a of [Math.PI/4+turn, -Math.PI/4+turn]){
      const ux = Math.cos(a)*s, uz = Math.sin(a)*s;
      stroke(d, [x-ux, z-uz], [x+ux, z+uz], .18*(1-k)+.03, P.main, f, {glow: T.glow ? .8 : 0, y0: Y+.1, y1: Y+.1});
    }
    d.shock(x, z, .3+r*easeOut(k), .08, P.glow, f, P.core);
    if(T.r >= 2) d.pool(x, z, r*.8, P.glow, .3*f);
    if(T.r >= 3) d.sparks(x, z, Y, 5+T.r, age, P.core, f, seed+i, {speed: 5, up: 2, gravity: 10, life: .4});
    petals(d, x, z, 2+Math.min(4, T.r), age, life, seed+i*13, 1.2, T);
    d.light(x, z, 2.2);
  }
}
/** Swift Sheath: the blade clicks home; a ring of Ki closes on the wielder. */
function paintSheath(d, ev, age, seed){
  const T = tier(ev.rank), life = .6, k = age/life, ki = Math.min(100, ev.ki || 0)/100;
  if(k >= 1 || !d.near(ev.x, ev.z, 5)) return;
  d.shock(ev.x, ev.z, (2.2+1.4*ki)*(1-easeOut(k))+.3, .09+.06*ki, P.main, fade(k), P.core);
  if(T.glow) d.ring(ev.x, ev.z, .9+ki, .06, P.glow, .5*fade(k), {soft: true});
  if(T.r >= 4) d.beam(ev.x, ev.z, .2, 2.2*easeOut(age/.15), .25*(1-k), P.glow, .5*fade(k));
  if(ki > .3) petals(d, ev.x, ev.z, Math.round(4+8*ki), age, life, seed, 2+ki, T);
}
/** Falling Blossom: petals spiral down onto the ring before its six sides are drawn. */
function paintBlossom(d, ev, age, seed){
  const T = tier(ev.rank), life = 1.1, k = age/life, r = ev.r || 2.6;
  if(k >= 1 || !d.near(ev.x, ev.z, r+3)) return;
  const n = 10+T.motes;
  for(let i = 0; i < n; i++){
    const a = (ev.turn || 0)+i/n*TAU+age*1.6, rr = r*(.4+.6*rnd(seed, i)), fall = clamp01(age/.8+rnd(seed, i+5)*.2);
    petal(d, ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr*.8, .15+1.8*(1-fall), .12, age*6+i, fade(k, 1.2), i%3 ? PETAL : PETAL_D);
  }
  d.mark(ev.x, ev.z, r*(.9+.1*easeOut(k)), .06, P.main, .7*fade(k));
  if(T.r >= 4) d.sigil(ev.x, ev.z, r*.7, P.glow, .5*fade(k), {sides: 6, spin: age*.6});
}
/** Shadow Echo: the wielder's shadow rises behind them for a moment. */
function paintEcho(d, ev, age, seed){
  const T = tier(ev.rank), life = .8, k = age/life;
  if(k >= 1) return;
  d.shock(ev.x, ev.z, .3+2*easeOut(k), .08, SHADOW_L, fade(k), '#e6dcff');
  for(let i = 0; i < 6; i++){
    const a = rnd(seed, i)*TAU, r = .4+.8*easeOut(k);
    d.orb(ev.x+Math.cos(a)*r, ev.z+Math.sin(a)*r*.7, .6+1.2*k*rnd(seed, i+3), .3*(1-k), SHADOW, .6*fade(k), {soft: true});
  }
  if(T.r >= 3) d.beam(ev.x, ev.z, .1, 2.4*easeOut(age/.2), .4*(1-k), SHADOW_L, .4*fade(k));
}
/** Swallow Return: a glint flies back along every cut it re-draws. */
function paintReturn(d, ev, age, seed){
  const T = tier(ev.rank), life = .4, k = age/life;
  if(k >= 1) return;
  for(const [i, [x0, z0, x1, z1]] of (ev.lines || []).entries()){
    const t = 1-easeOut(clamp01((age-i*.02)/.22));
    const x = lerp(x0, x1, t), z = lerp(z0, z1, t);
    if(!d.near(x, z, 4)) continue;
    d.twinkle(x, z, Y, .3, P.core, fade(k), age*9+i);
    if(T.r >= 3) d.sparks(x, z, Y, 3, age, P.main, fade(k), seed+i, {speed: 3, up: 1, gravity: 8, life: .25});
  }
}
/** Thousand Petals: a blade of petals from each closed cut to its foe. */
function paintPetals(d, ev, age, seed){
  const T = tier(ev.rank), life = .45, k = age/life;
  if(k >= 1) return;
  for(const [i, [x0, z0, x1, z1]] of (ev.lines || []).entries()){
    const t = easeOut(clamp01(age/.2)), x = lerp(x0, x1, t), z = lerp(z0, z1, t);
    if(!d.near(x, z, 4)) continue;
    stroke(d, [lerp(x0, x1, Math.max(0, t-.35)), lerp(z0, z1, Math.max(0, t-.35))], [x, z], .12, PETAL, fade(k), {core: '#ffffff', glow: T.glow ? .5 : 0});
    for(let j = 0; j < 3; j++) petal(d, x+(rnd(seed, i*5+j)-.5)*.5, z+(rnd(seed, i*5+j+2)-.5)*.4, Y+(rnd(seed, i*5+j+3)-.3)*.4, .11, age*10+j, fade(k), j%2 ? PETAL : PETAL_D);
  }
}
/** Crossing Cut: a brief cross-shaped glint where the X is drawn. */
function paintKesa(d, ev, age){
  const k = age/.3;
  if(k >= 1 || !d.near(ev.x, ev.z, 4)) return;
  d.twinkle(ev.x, ev.z, Y, .5*(1-k)+.15, P.core, fade(k), age*5);
}
/** A talent learned: a little ring of light round the wielder. */
function paintTalent(d, ev, age){
  const k = age/.8;
  if(k >= 1 || !d.near(ev.x, ev.z, 4)) return;
  d.shock(ev.x, ev.z, .4+1.2*easeOut(k), .06, '#f2c14e', fade(k), '#fff3cf');
  d.beam(ev.x, ev.z, .1, 1.8*easeOut(k), .2*(1-k), '#ffe48e', .4*fade(k));
}

export const RONIN_EVENTS = {
  roninstep: {life: ev => ev.start ? .5 : .55, paint: paintStep, kick: ev => ev.end && ev.hits ? {shake: .08+tier(ev.rank).shake*.3, flash: 0} : null},
  roninlure: {life: () => .7, paint: paintLure, kick: ev => ({shake: .05+tier(ev.rank).shake*.2, flash: 0})},
  ronincrux: {life: () => .7, paint: paintCrux, kick: ev => ({shake: .1+tier(ev.rank).shake*.5, flash: tier(ev.rank).flash*.6, color: '#ffe8ef'})},
  roninsheath: {life: () => .6, paint: paintSheath},
  roninblossom: {life: () => 1.1, paint: paintBlossom},
  roninecho: {life: () => .8, paint: paintEcho},
  roninreturn: {life: () => .4, paint: paintReturn},
  roninpetals: {life: () => .45, paint: paintPetals},
  roninkesa: {life: () => .3, paint: paintKesa},
  roninreturned: {life: () => .5, paint: (d, ev, age) => paintEcho(d, ev, age*1.6, 7)},
  talent: {life: () => .8, paint: paintTalent},
};

/** The Kagekiri Ronin's entry in src/fx/index.mjs WEAPON_FX: events only (its cuts are the katana's). */
export const RONIN_FX = {id: 'ronin', events: RONIN_EVENTS};
