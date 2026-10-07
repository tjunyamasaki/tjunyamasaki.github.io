// The Hundred-Seal Daoshi's skills, drawn (rules: src/classes/daoshi.mjs). Every talisman and seal is the
// sheaf's own (src/fx/ofuda.mjs); this adds the Binding Circle's sigil, the Spirit Thread's threads, the
// ward standing where it was raised, the storm of slips round the wielder, and the flare where the fire
// jumps a link on its own (Chain Fire). Paper gold and vermilion script over the ink outline.
import {INK, TAU, at, bump, clamp01, easeOut, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {slip} from './ofuda.mjs?v=harvest-18';

const P = hue('ofuda'), SCRIPT = '#b8343a', PAPER = '#f6e7a6';

function paintBind(d, ev, age, seed){
  const T = tier(ev.rank), life = Math.max(.8, ev.hold || 1.5), k = age/life, R = ev.r || 2.8;
  if(k >= 1 || !d.near(ev.x, ev.z, R+2)) return;
  const grow = easeOut(age/.25), f = fade(clamp01((age-(life-.4))/.4));
  d.mark(ev.x, ev.z, R*grow, .09, P.main, f, {halo: .4});
  d.ring(ev.x, ev.z, R*.82*grow, .05, SCRIPT, .9*f, {glow: false});
  d.sigil(ev.x, ev.z, R*.7*grow, SCRIPT, .85*f, {spin: age*.8, sides: 8, glow: T.glow});
  // Slips stand round the rim like stakes.
  const n = 6+T.r;
  for(let i = 0; i < n; i++){const a = i/n*TAU+age*.3; slip(d, ev.x+Math.cos(a)*R*grow, ev.z+Math.sin(a)*R*grow, .55, 0, .38, f);}
}
function paintThread(d, ev, age, seed){
  const T = tier(ev.rank), k = age/.8;
  if(k >= 1) return;
  for(const [i, [tx, tz]] of (ev.threads || []).entries()){
    const t = easeOut(clamp01((age-i*.02)/.25)), x = lerp(ev.x, tx, t), z = lerp(ev.z, tz, t), pts = [];
    for(let j = 0; j <= 10; j++){const u = j/10; pts.push([lerp(ev.x, x, u), .9+.35*Math.sin(Math.PI*u), lerp(ev.z, z, u)]);}
    d.path(pts, .09, INK, .7*fade(k));
    d.path(pts, .045, SCRIPT, fade(k), {glow: T.glow});
    if(t >= .99) slip(d, tx, tz, 1.1+.3*bump(clamp01((age-.25)/.3)), age*10+i, .34, fade(k));
  }
  d.ring(ev.x, ev.z, .5+1.2*easeOut(k), .06, P.main, fade(k));
}
function paintChain(d, ev, age, seed){
  const k = age/.45;
  if(k >= 1) return;
  d.star(ev.x, ev.z, 1, .4+.4*easeOut(k), '#ffb44a', fade(k), {spin: age*6, points: 6, glow: true, ink: .06});
}
function paintKai(d, ev, age){
  const k = age/.6;
  if(k >= 1) return;
  d.shock(ev.x, ev.z, .4+2.6*easeOut(k), .1, '#ff7a3a', fade(k), P.core);
}
function paintWardRaise(d, ev, age, seed){
  const k = age/.6;
  if(k >= 1) return;
  d.shock(ev.x, ev.z, .3+1.6*easeOut(k), .07, P.main, fade(k), P.core);
  for(let i = 0; i < 6; i++){const a = rnd(seed, i)*TAU, t = easeOut(k); slip(d, ev.x+Math.cos(a)*1.4*(1-t), ev.z+Math.sin(a)*1.4*(1-t), .4+1.4*t, age*12+i, .3, fade(k));}
}
function paintStorm(d, ev, age){
  const k = age/.6;
  if(k < 1) d.shock(ev.x, ev.z, .4+2*easeOut(k), .07, SCRIPT, fade(k), PAPER);
}

export const DAOSHI_EVENTS = {
  daobind: {life: ev => Math.max(.8, ev.hold || 1.5), paint: paintBind, kick: () => ({shake: .12})},
  daothread: {life: () => .8, paint: paintThread},
  daochain: {life: () => .45, paint: paintChain, kick: ev => (ev.depth || 1) >= 2 ? {shake: .08} : null},
  daokai: {life: () => .6, paint: paintKai},
  daoward: {life: () => .6, paint: paintWardRaise},
  daostorm: {life: () => .6, paint: paintStorm},
  daofan: {life: () => .01, paint(){}},
  daowardthrow: {life: () => .01, paint(){}},
  daowardend: {life: () => .5, paint(d, ev, age){slip(d, ev.x, ev.z, 1.3+age, age*8, .5*(1-age/.5), 1-age/.5);}},
};

/** What the Daoshi keeps on the field: the ward standing where it was raised, and the storm round the wielder. */
function paintDaoshi(d, p, ctx){
  const s = p.daoshi;
  if(!s) return;
  const T = tier(p.ranks?.ofuda || 1), clock = ctx.clock, time = ctx.time;
  const w = s.ward;
  if(w && d.near(w.x, w.z, 3)){
    const a = Math.min(1, ((w.until || 0)-time)/.4, (time-(w.at || 0))/.3);
    if(a > 0){
      // A stake with a great talisman, its script glowing, a small sigil turning under it.
      d.path([[w.x, .05, w.z], [w.x, 1.5, w.z]], .14, INK, a);
      d.path([[w.x, .05, w.z], [w.x, 1.5, w.z]], .08, '#7a5a3a', a);
      slip(d, w.x, w.z, 1.65+.06*Math.sin(clock*2.4), Math.sin(clock*1.7)*.15, .62, a, .4+.3*Math.sin(clock*4));
      d.sigil(w.x, w.z, 1, SCRIPT, .6*a, {spin: clock*.9, sides: 5, glow: T.glow});
      if(T.glow) d.bloom(w.x, w.z, 1.6, .9, P.glow, .25*a);
      d.light(w.x, w.z, 2.2*a);
    }
  }
  if((s.stormUntil || 0) > time && d.near(p.x, p.z, 3)){
    const a = Math.min(1, (s.stormUntil-time)/.4), n = 5+Math.ceil(T.r/2);
    for(let i = 0; i < n; i++){
      const ang = clock*3.2+i/n*TAU, r = 1+.15*Math.sin(clock*5+i);
      slip(d, p.x+Math.cos(ang)*r, p.z+Math.sin(ang)*r*.7, .8+.5*Math.sin(clock*2+i), ang, .32, a, .5);
    }
  }
}

export const DAOSHI_FX = {id: 'daoshi', events: DAOSHI_EVENTS, player: paintDaoshi};
