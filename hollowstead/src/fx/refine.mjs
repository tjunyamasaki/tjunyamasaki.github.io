// Refinement effects (src/refine.mjs): the moments a modifier changes the fight. Unlike rank flair
// these always show, at every rank, because they are real blows a player has to read: the cutting
// wave, the phantom swing, the slam, lightning leaping, crits shattering, foes blowing up.
// Presentation only: every effect is a world event of type 'fx' (`fx: 'refine-…'`) or, for the
// Crescent wave, the projectile itself (kind 'wave', `painted`).
import {TAU, at, bump, clamp01, easeOut, easeOut2, fade, hue, rnd} from './kit.mjs?v=harvest-18';

const STORM = {core: '#ffffff', main: '#bfe8ff', glow: '#6fb6ff'};
const EMBER = {core: '#fff0c8', main: '#ffb04a', glow: '#ff6a1f', deep: '#c2410c'};
const GHOST = {core: '#f4ecff', main: '#c9b3ff', glow: '#8e6cff'};
const SHARD = {core: '#ffffff', main: '#d6f1ff', glow: '#79b8ff'};
const SPIRIT = {core: '#f2fff4', main: '#9ff5c8', glow: '#3fbf8a'};
const BLOOD = {core: '#ffe2dc', main: '#ff6b5c', glow: '#b3261e'};
const BONE = {core: '#fffaf0', main: '#efe6d2', glow: '#c9b28a'};

/** The Crescent's wave, every frame: a bright arc of the weapon's colour skimming forward. */
export function paintWave(d, s, lead, clock){
  const speed = Math.hypot(s.vx || 0, s.vz || 0) || 1, dx = (s.vx || 0)/speed, dz = (s.vz || 0)/speed;
  const x = s.x+dx*speed*Math.min(lead, .06), z = s.z+dz*speed*Math.min(lead, .06);
  if(!d.near(x, z)) return;
  const h = hue(s.itemId), k = clamp01((s.traveled || 0)/(s.range || 6)), grow = easeOut((s.age || 0)/.12);
  const arc = (s.arc || 100)*Math.PI/180, r = (.9+.5*k)*grow, f = Math.atan2(dz, dx), a = 1-k*k;
  // The arc sits ahead of its centre, so the centre trails behind the leading edge.
  const cx = x-dx*r*.85, cz = z-dz*r*.85;
  d.crescent(cx, cz, .7, r, f, arc, .55, h.glow, .55*a, {glow: true});
  d.crescent(cx, cz, .72, r, f, arc*.84, .16, '#ffffff', .95*a, {light: true});
  d.crescent(cx-dx*.35, cz-dz*.35, .7, r*.9, f, arc*.7, .12, h.main, .45*a, {glow: true});
  d.sparks(x, z, .7, 3, (s.age || 0)%.4, h.main, .8*a, Math.floor((s.age || 0)/.4)+(s.id || '').length, {speed: 2.5, up: 1.5, life: .4, dir: f+Math.PI, spread: 1.2});
  d.light(x, z, 1.4);
}

/** The phantom swing: the same arc again, pale and violet, sweeping the other way. */
function echo(d, ev, age){
  const f = Math.atan2(ev.dz || 0, ev.dx || 1), arc = Math.min(TAU*.95, (ev.arc || 70)*Math.PI/180), r = (ev.range || 2.5)*.86, k = age/.36, grow = easeOut(age/.12);
  d.crescent(ev.x, ev.z, .55, r, f+arc/2-arc*grow/2, arc*grow, .42*(1-k*.5), GHOST.glow, .55*fade(k), {glow: true});
  d.crescent(ev.x, ev.z, .57, r*.97, f+arc/2-arc*grow*.4, arc*grow*.8, .1, GHOST.core, .9*fade(k), {light: true});
  d.motes(ev.x+Math.cos(f)*r*.6, ev.z+Math.sin(f)*r*.6, 5, age, r*.5, GHOST.main, .8*fade(k), Math.floor(ev.x*13+ev.z*7), {rise: 1.2, size: .06, life: .5});
}

export const REFINE_EVENTS = {
  'fx:refine-echo': {life: () => .4, paint: echo},
  'fx:refine-quake': {life: () => .7, kick: () => ({shake: .22}), paint(d, ev, age, seed){
    const r = ev.radius || 2.4, k = age/.55;
    d.shock(ev.x, ev.z, .3+r*easeOut2(k), .12, EMBER.glow, fade(k), EMBER.core);
    d.pool(ev.x, ev.z, r*.8, EMBER.deep, .35*fade(age/.7));
    if(age < .3) for(let i = 0; i < 7; i++){
      const a = rnd(seed, i)*TAU, rr = r*(.35+.55*rnd(seed, i+9)), kk = age/.3;
      d.path([at(ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr, .05, -.14, 0), at(ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr, .05, .14, 0), at(ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr, .05, 0, .7*bump(kk))], 0, i%2 ? '#8a6a4a' : '#5d4632', .95, {fill: true});
    }
    d.debris(ev.x, ev.z, 8, age, '#6b5440', seed, {speed: 3.5, up: 5, size: .1, life: .6});
  }},
  'fx:refine-arc': {life: () => .4, paint(d, ev, age, seed){
    const pts = (ev.points || []).map(([x, z]) => [x, .9, z]); if(pts.length < 2) return;
    const k = age/.4;
    d.lightning(pts, .11, STORM.glow, fade(k), seed+Math.floor(age*30), {jag: .55});
    d.lightning(pts, .04, STORM.core, fade(k), seed+7+Math.floor(age*30), {jag: .55});
    for(let i = 1; i < pts.length; i++){d.bloom(pts[i][0], pts[i][2], .9, .6, STORM.main, fade(k)); d.sparks(pts[i][0], pts[i][2], .9, 4, age, STORM.main, 1, seed+i, {speed: 3, life: .3});}
    d.light(pts[pts.length-1][0], pts[pts.length-1][2], 2);
  }},
  'fx:refine-shatter': {life: () => .5, kick: () => ({shake: .08}), paint(d, ev, age, seed){
    const r = ev.radius || 2.2, k = age/.4;
    if(age < .22) d.rays(ev.x, ev.z, .9, 9, r*1.1*easeOut(age/.12), .09, SHARD.core, 1-age/.22, seed);
    d.shock(ev.x, ev.z, .2+r*easeOut(k), .07, SHARD.glow, fade(k), SHARD.core);
    d.sparks(ev.x, ev.z, .9, 10, age, SHARD.main, 1, seed, {speed: 6, up: 2, life: .45, len: .12});
  }},
  'fx:refine-blast': {life: ev => ev.big ? .9 : .7, kick: ev => ({shake: ev.big ? .35 : .18, flash: ev.big ? .12 : 0, color: '#ffd9a0'}), paint(d, ev, age, seed){
    const r = ev.radius || 2.6, k = age/.55;
    if(k < 1) d.bloom(ev.x, ev.z, .8, r*(.5+.6*easeOut(age/.08)), EMBER.core, .9*(1-k)**2);
    d.shock(ev.x, ev.z, .3+r*1.15*easeOut(k), .12, EMBER.glow, fade(k), EMBER.core);
    d.pool(ev.x, ev.z, r, EMBER.deep, .4*fade(age/.8));
    d.sparks(ev.x, ev.z, .8, 14, age, EMBER.main, 1, seed, {speed: 6, up: 4, life: .55});
    d.debris(ev.x, ev.z, 6, age, '#3a2a22', seed+3, {speed: 4, up: 6, size: .09});
    d.light(ev.x, ev.z, 3);
  }},
  'fx:refine-cull': {life: () => .55, paint(d, ev, age){
    const k = age/.55, r = 1.1*easeOut(age/.1);
    for(const s of [-1, 1]){
      d.path([at(ev.x, ev.z, 1, -r, -r*s), at(ev.x, ev.z, 1, r, r*s)], .3*(1-k), BLOOD.glow, .7*fade(k), {glow: true, soft: true});
      d.path([at(ev.x, ev.z, 1, -r, -r*s), at(ev.x, ev.z, 1, r, r*s)], .08*(1-k), BLOOD.core, fade(k), {glow: true});
    }
  }},
  'fx:refine-fork': {life: () => .3, paint(d, ev, age, seed){
    const h = hue(ev.itemId), k = age/.3, f = ev.angle || 0;
    d.bloom(ev.x, ev.z, .9, .5, h.core, fade(k));
    for(const s of [-1, 1]) d.streak([ev.x, .9, ev.z], [ev.x+Math.cos(f+s*.42)*1.2*easeOut(k), .9, ev.z+Math.sin(f+s*.42)*1.2*easeOut(k)], .1, h.glow, .9*fade(k));
  }},
  'fx:refine-bounce': {life: () => .3, paint(d, ev, age, seed){
    const k = age/.3, f = Math.atan2((ev.tz ?? ev.z)-ev.z, (ev.tx ?? ev.x)-ev.x);
    d.bloom(ev.x, ev.z, .9, .45, '#fff3cf', fade(k));
    d.sparks(ev.x, ev.z, .9, 6, age, '#ffe48e', 1, seed, {speed: 5, up: 1.5, life: .25, dir: f, spread: 1.4});
  }},
  'fx:refine-shrapnel': {life: () => .35, paint(d, ev, age, seed){
    const k = age/.35;
    d.bloom(ev.x, ev.z, .9, .55, '#fff3cf', fade(k));
    d.shock(ev.x, ev.z, .2+1.2*easeOut(k), .05, '#ffd38a', fade(k));
  }},
  'fx:refine-haunt': {life: () => .8, paint(d, ev, age, seed){
    const k = age/.8;
    d.motes(ev.x, ev.z, 7, age, .7, SPIRIT.main, .9*fade(k), seed, {rise: 2.2, size: .08, life: .8});
    d.bloom(ev.x, ev.z, .6, .7, SPIRIT.glow, .6*fade(age/.3));
  }},
  'fx:refine-retort': {life: () => .45, paint(d, ev, age, seed){
    const k = age/.45;
    d.shock(ev.x, ev.z, .4+1.4*easeOut(k), .08, BONE.glow, fade(k), BONE.core);
    d.rays(ev.x, ev.z, .8, ev.n || 6, 1.2*easeOut(age/.15), .07, BONE.main, fade(k), seed);
  }},
  'fx:refine-storm': {life: () => .45, kick: () => ({shake: .1, flash: .05, color: '#d6ecff'}), paint(d, ev, age, seed){
    const k = age/.45, flick = seed+Math.floor(age*28);
    d.lightning([[ev.x+.5, 8, ev.z-1.2], [ev.x+.2, 4, ev.z-.4], [ev.x, .6, ev.z]], .14, STORM.glow, fade(k), flick, {jag: .8, steps: 5});
    d.lightning([[ev.x+.5, 8, ev.z-1.2], [ev.x+.2, 4, ev.z-.4], [ev.x, .6, ev.z]], .05, STORM.core, fade(k), flick+3, {jag: .8, steps: 5});
    d.shock(ev.x, ev.z, .2+1.3*easeOut(k), .06, STORM.main, fade(k));
    d.light(ev.x, ev.z, 2.5);
  }},
  'fx:refine-slip': {life: () => .4, paint(d, ev, age, seed){
    const k = age/.4, len = ev.len || 3.9, x1 = ev.x+(ev.dx || 0)*len, z1 = ev.z+(ev.dz || 0)*len;
    d.streak([ev.x, .8, ev.z], [x1, .8, z1], .5*(1-k), GHOST.glow, .6*fade(k), .6);
    d.streak([ev.x, .82, ev.z], [x1, .82, z1], .1, GHOST.core, fade(k), .8);
    for(let i = 0; i < 4; i++){
      const t = (i+.5)/4, x = ev.x+(ev.dx || 0)*len*t, z = ev.z+(ev.dz || 0)*len*t, s = i%2 ? 1 : -1;
      d.path([at(x, z, .9, -.5, -.5*s), at(x, z, .9, .5, .5*s)], .07, '#ffffff', .9*fade(k*1.3), {glow: true});
    }
  }},
  'fx:refine-rally': {life: () => 1, paint(d, ev, age, seed){
    const k = age/1;
    d.bloom(ev.x, ev.z, .9, 1.2, SPIRIT.glow, .6*fade(k));
    d.ring(ev.x, ev.z, .4+1.4*easeOut(k), .08, SPIRIT.main, fade(k));
    d.motes(ev.x, ev.z, 10, age, .9, SPIRIT.core, .9*fade(k), seed, {rise: 2.4});
  }},
};
