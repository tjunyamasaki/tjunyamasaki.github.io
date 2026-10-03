// The hollow's own effects (not a weapon's): blasts on the ground before and as they go off (Ashen Scar
// vents, falling stars, Mother Briar's roots and thorns, The Unblinking's gaze and tendrils), the great
// bosses rising, omens marked by a beam of light you can see from afar, gilded creatures glittering, and
// the glow of lava at night; a Dread Age dawning, Dread champions, weapons earning names and ascending.
// Drawn by both renderers through WeaponFx (index.mjs). Presentation only.
import {INK, TAU, at, bump, clamp01, easeIn, easeOut, fade, rnd} from './kit.mjs?v=harvest-18';
import {ENEMIES} from '../content.mjs?v=harvest-18';
import {areasOf} from '../worldgen.mjs?v=harvest-18';
import {OMENS} from '../omens.mjs?v=harvest-18';
import {HUSH} from '../hush.mjs?v=harvest-18';

const STYLE = Object.freeze({
  vent:    {main: '#ff8a3a', core: '#ffe2a0', glow: '#ff5a1e', dark: '#3a1d14'},
  star:    {main: '#ffd27a', core: '#ffffff', glow: '#ffb14e', dark: '#2a2236'},
  root:    {main: '#7a5236', core: '#e8d9b8', glow: '#c23a3a', dark: '#2e1d16'},
  thorn:   {main: '#c23a3a', core: '#ffd6c8', glow: '#ff7a5c', dark: '#3a1418'},
  snare:   {main: '#6fae4c', core: '#e8ffd0', glow: '#9fdc6a', dark: '#1e2a16'},
  gaze:    {main: '#b45cff', core: '#fff4ff', glow: '#8a3dff', dark: '#120624'},
  tendril: {main: '#5a2a66', core: '#ff9ccf', glow: '#b45cff', dark: '#140a1c'},
  void:    {main: '#7c3cff', core: '#e6d0ff', glow: '#5a1fe0', dark: '#0c0618'},
});
const S = style => STYLE[style] || STYLE.vent;

/** Along a line blast: points every `step` units. */
function along(s, step = .9){
  const pts = [], n = Math.max(1, Math.round(s.len/step)), ca = Math.cos(s.ang), sa = Math.sin(s.ang);
  for(let i = 0; i <= n; i++){const t = i/n*s.len; pts.push([s.x+ca*t, s.z+sa*t]);}
  return pts;
}

/** Pending blasts: what is coming, before it goes off. */
function paintPending(d, s, lead, clock){
  if(!d.near(s.x, s.z, (s.len || s.r || 2)+2)) return;
  if(s.fuse > s.flight) return;
  const c = S(s.style), k = clamp01(1-(s.fuse-lead)/Math.max(.05, s.flight)), seed = (s.id?.length || 3)*13+(Number(String(s.id).slice(1)) || 0);
  if(s.style === 'star'){
    // A star falling out of the sky onto its mark, trailing fire.
    const fall = easeIn(k), y = 14*(1-fall)+.4, ox = (1-fall)*-5, oz = (1-fall)*-3;
    const x = s.x+ox, z = s.z+oz;
    d.streak([x-ox*.12-1.2, y+2.2, z-oz*.12-.7], [x, y, z], .35, c.glow, .7);
    d.orb(x, z, y, .5, INK, .9);
    d.orb(x, z, y, .42, c.main, 1);
    d.orb(x, z, y, .22, c.core, 1, {glow: true});
    d.bloom(x, z, y, 1.4, c.glow, .5);
    d.pool(s.x, s.z, s.r*(.4+.6*k), c.glow, .25*k);
    d.light(s.x, s.z, 1.5+2*k);
    return;
  }
  if(s.style === 'vent'){
    // Cracks glow and widen, steam rises.
    for(let i = 0; i < 6; i++){
      const a = rnd(seed, i)*TAU, r = s.r*(.4+.6*k)*(.6+.4*rnd(seed, i+9));
      d.path([[s.x, .07, s.z], [s.x+Math.cos(a)*r*.5, .07, s.z+Math.sin(a)*r*.5+.1], [s.x+Math.cos(a)*r, .07, s.z+Math.sin(a)*r]], .08, c.main, .9*k);
    }
    d.pool(s.x, s.z, s.r*.7, c.glow, .45*k);
    if(k > .4) d.motes(s.x, s.z, 5, (clock*1.4)%1, s.r*.5, '#d8d0c8', .5*k, seed, {rise: 1.8, size: .1});
    d.light(s.x, s.z, 1+1.6*k);
    return;
  }
  if(s.style === 'gaze'){
    // The eye's gaze: a shimmering line that brightens toward the burn.
    const ca = Math.cos(s.ang), sa = Math.sin(s.ang), a = [s.x, .5, s.z], b = [s.x+ca*s.len, .5, s.z+sa*s.len];
    d.path([a, b], .05+.08*k, c.main, .4+.5*k, {glow: true});
    if(k > .6) d.path([a, b], s.w*.6*k, c.glow, .25, {glow: true, soft: true});
    return;
  }
  if(s.shape === 'line'){
    // Roots or thorns pushing up along the line, their tips breaking the soil.
    for(const [i, [x, z]] of along(s).entries()){
      const h = .15+.45*k*(.5+.5*rnd(seed, i));
      d.path([[x, .06, z], [x+.08, h, z]], .12, INK, .8*k); d.path([[x, .06, z], [x+.08, h, z]], .06, c.core, .9*k);
    }
    return;
  }
  if(s.style === 'tendril' || s.style === 'void'){
    d.stain(s.x, s.z, (s.shape === 'ring' ? s.r : s.r*.9)*k, c.dark, .35*k);
    if(s.shape !== 'ring') for(let i = 0; i < 4; i++){const a = clock*2+i/4*TAU, r = s.r*.6; d.orb(s.x+Math.cos(a)*r, s.z+Math.sin(a)*r, .2, .1*k, c.core, .8*k, {glow: true});}
    return;
  }
  if(s.style === 'snare' || s.style === 'thorn'){
    const n = s.shape === 'ring' ? 18 : 7, r0 = s.shape === 'ring' ? (s.inner+s.r)/2 : s.r*.6;
    for(let i = 0; i < n; i++){
      const a = i/n*TAU+rnd(seed, i)*.3, x = s.x+Math.cos(a)*r0, z = s.z+Math.sin(a)*r0, h = .1+.4*k;
      d.path([[x, .06, z], [x, h, z]], .1, INK, .7*k); d.path([[x, .06, z], [x, h, z]], .05, c.core, .9*k);
    }
  }
}

/** A blast going off. */
function paintBurst(d, ev, age, seed){
  const c = S(ev.style), life = BURST_LIFE(ev), t = clamp01(age/life), f = fade(t, 1.3);
  if(ev.shape === 'line'){
    const ca = Math.cos(ev.angle || 0), sa = Math.sin(ev.angle || 0), len = ev.length || 4;
    if(ev.style === 'gaze'){
      const a = [ev.x, .55, ev.z], b = [ev.x+ca*len, .55, ev.z+sa*len];
      d.path([a, b], (ev.width || 1)*.55*f, c.main, .9*f); d.path([a, b], (ev.width || 1)*.25*f, c.core, f);
      d.path([a, b], (ev.width || 1)*1.6, c.glow, .35*f, {glow: true, soft: true});
      d.light(ev.x+ca*len/2, ev.z+sa*len/2, 3*f);
      return;
    }
    // Roots/thorns tearing up along the line.
    const n = Math.max(2, Math.round(len/.8));
    for(let i = 0; i <= n; i++){
      const u = i/n*len, x = ev.x+ca*u, z = ev.z+sa*u, h = (.6+.7*rnd(seed, i))*bump(Math.min(1, t*1.8)), side = (rnd(seed, i+40)-.5)*.5;
      const tip = [x-sa*side, h, z+ca*side];
      d.path([[x, .06, z], tip], .2, INK, .9*f, {taper: .9}); d.path([[x, .06, z], tip], .11, i%2 ? c.main : c.core, f, {taper: .9});
    }
    d.stain(ev.x+ca*len/2, ev.z+sa*len/2, len*.3, c.dark, .2*f);
    return;
  }
  const r = ev.radius || 1.5, inner = ev.inner || 0;
  if(ev.style === 'star'){
    d.stain(ev.x, ev.z, r*1.05, '#241c2c', .55*f);
    d.shock(ev.x, ev.z, r*(.5+.8*easeOut(t)), .22, c.main, f, c.core);
    d.bloom(ev.x, ez(ev), .8, r*1.6*(1-t), c.glow, .8*f);
    d.debris(ev.x, ev.z, 10, t, '#5a5068', seed);
    d.sparks(ev.x, ev.z, .5, 14, t, c.core, f, seed, {speed: 7, up: 5});
    d.light(ev.x, ev.z, r*2.2*f);
    return;
  }
  if(ev.style === 'vent'){
    // A column of fire and ash.
    const h = 3.2*bump(Math.min(1, t*1.4));
    d.path([[ev.x, .1, ev.z], [ev.x, h, ev.z]], r*.9*f, c.main, .85*f, {taper: .6});
    d.path([[ev.x, .1, ev.z], [ev.x, h*.8, ev.z]], r*.45*f, c.core, f, {taper: .6});
    d.bloom(ev.x, ev.z, 1.2, r*1.4, c.glow, .6*f);
    d.stain(ev.x, ev.z, r, '#2a1a14', .45*f);
    d.sparks(ev.x, ev.z, .6, 10, t, c.core, f, seed, {speed: 3, up: 7, gravity: 9});
    d.light(ev.x, ev.z, r*2*f);
    return;
  }
  if(ev.shape === 'ring' && inner > 0){
    const mid = (inner+r)/2, n = Math.round(mid*5);
    for(let i = 0; i < n; i++){
      const a = i/n*TAU+rnd(seed, i)*.2, rr = inner+(r-inner)*rnd(seed, i+70), x = ev.x+Math.cos(a)*rr, z = ev.z+Math.sin(a)*rr, h = (.5+.9*rnd(seed, i+20))*bump(Math.min(1, t*1.8));
      d.path([[x, .06, z], [x, h, z]], .18, INK, .8*f, {taper: .9}); d.path([[x, .06, z], [x, h, z]], .1, i%2 ? c.main : c.core, f, {taper: .9});
    }
    d.ring(ev.x, ev.z, r, .12, c.main, .7*f, {glow: true});
    d.ring(ev.x, ev.z, inner, .08, c.core, .5*f, {glow: true});
    return;
  }
  d.shock(ev.x, ev.z, r*(.4+.8*easeOut(t)), .16, c.main, f, c.core);
  for(let i = 0; i < 9; i++){
    const a = i/9*TAU+rnd(seed, i)*.4, rr = r*(.3+.6*rnd(seed, i+5)), h = (.4+.7*rnd(seed, i+9))*bump(Math.min(1, t*1.8));
    const x = ev.x+Math.cos(a)*rr, z = ev.z+Math.sin(a)*rr;
    d.path([[x, .06, z], [x, h, z]], .16, INK, .8*f, {taper: .9}); d.path([[x, .06, z], [x, h, z]], .09, c.core, f, {taper: .9});
  }
  d.pool(ev.x, ev.z, r, c.glow, .35*f);
}
const ez = ev => ev.z;
const BURST_LIFE = ev => ev.style === 'star' ? .8 : ev.style === 'vent' ? .7 : ev.style === 'gaze' ? .3 : .55;

export const HOLLOW_EVENTS = {
  blast: {life: BURST_LIFE, kick: ev => ev.style === 'star' ? {shake: .3} : ev.inner > 0 ? {shake: .25} : null, paint: paintBurst},
  bossrise: {life: () => 2.2, kick: () => ({shake: .9, flash: .18, color: '#ffd0c0'}), paint(d, ev, age, seed){
    const t = age/2.2, c = ev.boss === 'unblinking' ? STYLE.void : STYLE.thorn;
    d.stain(ev.x, ev.z, 6*easeOut(t*2), c.dark, .5*fade(t));
    for(let i = 0; i < 3; i++) d.ring(ev.x, ev.z, 2+i*2.4+easeOut(t)*6, .15, c.main, .8*fade(t), {glow: true});
    d.groundRays(ev.x, ev.z, 14, 1, 9*easeOut(t*1.5), .14, c.glow, .6*fade(t), seed);
    d.light(ev.x, ev.z, 8*fade(t));
  }},
  bossphase: {life: () => 1.4, kick: () => ({shake: .6, flash: .12, color: '#ffe0d0'}), paint(d, ev, age){
    const t = age/1.4, c = ev.boss === 'unblinking' ? STYLE.void : STYLE.thorn;
    d.shock(ev.x, ev.z, 1+8*easeOut(t), .3, c.main, fade(t), c.core);
  }},
  bossroar: {life: () => .6, paint(d, ev, age){const t = age/.6, c = ev.boss === 'unblinking' ? STYLE.gaze : STYLE.thorn; d.ring(ev.x, ev.z, 1.5+3*t, .1, c.glow, .6*fade(t), {glow: true});}},
  omen: {life: () => 3, paint(d, ev, age){const t = age/3, c = OMENS[ev.kind]?.color || '#ffd27a'; d.beam(ev.x, ev.z, 0, 18, 1.2*fade(t), c, .7*fade(t)); d.pool(ev.x, ev.z, 3, c, .5*fade(t));}},
  riftclose: {life: () => 1.2, kick: () => ({shake: .4}), paint(d, ev, age, seed){const t = age/1.2; d.shock(ev.x, ev.z, 3*(1-easeOut(t))+.2, .25, '#c49bff', fade(t), '#ffffff'); d.sparks(ev.x, ev.z, 1, 16, t, '#e6d0ff', fade(t), seed);}},
  omenfulfilled: {life: () => 2.6, kick: () => ({shake: .35, flash: .14, color: '#ffe7a8'}), paint(d, ev, age, seed){
    const t = age/2.6, c = OMENS[ev.kind]?.color || '#ffd27a';
    d.beam(ev.x, ev.z, 0, 24, 1.8*fade(t), '#ffd27a', .8*fade(t));
    for(let i = 0; i < 3; i++) d.ring(ev.x, ev.z, 1+i*1.6+easeOut(Math.min(1, t*1.6))*5, .14, i ? c : '#ffe7a8', .85*fade(t), {glow: true});
    d.sparks(ev.x, ev.z, 1.2, 26, t, '#ffe7a8', fade(t), seed, {up: 9, speed: 5});
    d.light(ev.x, ev.z, 9*fade(t));
  }},
  mimic: {life: () => .8, kick: () => ({shake: .35}), paint(d, ev, age){const t = age/.8; d.ring(ev.x, ev.z, 1+2*t, .14, '#f2c14e', fade(t), {glow: true});}},
  brew: {life: () => 1.4, paint(d, ev, age, seed){const t = age/1.4, c = ev.kind === 'hex' ? '#9a5cff' : ev.kind === 'fury' ? '#ff7a5c' : ev.kind === 'swift' ? '#8fd3ff' : '#8fd3a0'; d.motes(ev.x, ev.z, 14, t, 1.2, c, fade(t), seed, {rise: 2.2, size: .12}); d.ring(ev.x, ev.z, .8+t, .08, c, fade(t), {glow: true});}},
  gilded: {life: () => 1, paint(d, ev, age, seed){const t = age/1; d.sparks(ev.x, ev.z, .8, 12, t, '#ffe08a', fade(t), seed, {up: 4});}},
  gildfall: {life: () => 1.4, kick: () => ({shake: .15}), paint(d, ev, age, seed){const t = age/1.4; d.sparks(ev.x, ev.z, .8, 22, t, '#ffd25a', fade(t), seed, {speed: 6, up: 6}); d.bloom(ev.x, ev.z, .8, 2*(1-t), '#ffd25a', .6*fade(t));}},
  rekindle: {life: () => 2, kick: () => ({shake: .3, flash: .15, color: '#ffcf8a'}), paint(d, ev, age, seed){const t = age/2; d.beam(ev.x, ev.z, 0, 10, 1.4*fade(t), '#ffb14e', .6*fade(t)); d.sparks(ev.x, ev.z, .8, 20, t, '#ffe2a0', fade(t), seed, {up: 8});}},
  ascend: {life: () => 1.6, paint(d, ev, age){const t = age/1.6; d.beam(ev.x, ev.z, 0, 8, 1.6*fade(t), '#c49bff', .5*fade(t));}},
  // Dread Ages (ages.mjs): the whole sky flinches red, and a ring of it rolls out from the Heartfire.
  dreadage: {life: () => 3.2, kick: () => ({shake: .5, flash: .26, color: '#ff4a5e'}), paint(d, ev, age, seed){
    const t = age/3.2;
    d.stain(ev.x, ev.z, 10*easeOut(t*1.6), '#3a0e18', .45*fade(t));
    for(let i = 0; i < 4; i++) d.ring(ev.x, ev.z, 2+i*3+easeOut(t)*14, .18, i%2 ? '#ff4a5e' : '#7a1426', .7*fade(t), {glow: true});
    d.groundRays(ev.x, ev.z, 18, 1.5, 16*easeOut(t*1.3), .16, '#ff4a5e', .5*fade(t), seed);
  }},
  // Dread thorns bite: a few red flecks.
  thorns: {life: () => .45, paint(d, ev, age, seed){const t = age/.45; d.sparks(ev.x, ev.z, .5, 5, t, '#e0465a', fade(t), seed, {speed: 2.5, up: 1.5});}},
  // A weapon earns its name (mastery.mjs): a gold column, a crown of rings and a shower of sparks.
  named: {life: () => 2.4, kick: () => ({shake: .25, flash: .2, color: '#ffe7a8'}), paint(d, ev, age, seed){
    const t = age/2.4;
    d.beam(ev.x, ev.z, 0, 6*easeOut(age/.5), 1.4, '#f2c14e', .6*fade(t));
    d.beam(ev.x, ev.z, 0, 6.2*easeOut(age/.5), .3, '#fff6d8', .9*fade(t));
    for(let i = 0; i < 3; i++) d.ring(ev.x, ev.z, .6+i*.9+easeOut(Math.min(1, t*2))*2.6, .1, i ? '#f2c14e' : '#fff6d8', .9*fade(t), {glow: true});
    d.sparks(ev.x, ev.z, 1.2, 30, t, '#ffe7a8', fade(t), seed, {up: 8, speed: 4});
    d.light(ev.x, ev.z, 6*fade(t));
  }},
  // A weapon ascends (mastery.mjs): violet light climbs from the bench into the wielder.
  weaponascend: {life: () => 1.8, kick: () => ({shake: .15, flash: .12, color: '#d6c0ff'}), paint(d, ev, age, seed){
    const t = age/1.8;
    if(Number.isFinite(ev.bx)) d.pool(ev.bx, ev.bz, 1.4, '#b48cff', .45*fade(t));
    d.beam(ev.x, ev.z, 0, 4.5*easeOut(age/.4), 1.1, '#b48cff', .55*fade(t));
    d.beam(ev.x, ev.z, 0, 4.7*easeOut(age/.4), .22, '#f4ecff', .9*fade(t));
    d.ring(ev.x, ev.z, .5+2.4*easeOut(t), .1, '#d6c0ff', .9*fade(t), {glow: true});
    d.motes(ev.x, ev.z, 16, t, 1, '#e6d8ff', fade(t), seed, {rise: 3, size: .1});
    d.light(ev.x, ev.z, 4*fade(t));
  }},
};

/** Every frame: pending blasts, omen beacons, gilded glitter, boss glows, lava glow. */
export function paintHollow(d, world, lead, clock){
  for(const s of world.hostile || []) if(s.kind === 'blast') paintPending(d, s, lead, clock);
  // Omens: a pale column of light where each waits, so they can be spotted across the hollow.
  for(const o of world.omens || []){
    if(o.done) continue;
    const c = OMENS[o.kind]?.color || '#ffd27a';
    if(d.near(o.x, o.z, 30)){d.beam(o.x, o.z, 0, 12, .5+.1*Math.sin(clock*2+o.x), c, .28); d.pool(o.x, o.z, 1.6, c, .35); d.light(o.x, o.z, 2.6);}
    if(o.kind === 'soulrift' && d.near(o.x, o.z, 6)){
      // The tear itself: a turning wound of violet light.
      const open = o.state === 'open' ? 1.4 : 1;
      for(let i = 0; i < 3; i++){
        const pts = [];
        for(let j = 0; j <= 24; j++){const t = j/24, a = clock*(1.4+i*.3)+t*TAU*1.2+i*2.1, r = (.25+t*1.1)*open; pts.push(at(o.x, o.z, 1.3, Math.cos(a)*r, Math.sin(a)*r*1.4));}
        d.path(pts, .07, i ? '#7c3cff' : '#e6d0ff', .85, {glow: true, taper: .3});
      }
      d.bloom(o.x, o.z, 1.3, 1.6*open, '#8a3dff', .5);
    }
  }
  // Hushing stones (hush.mjs): a soft hum of light, and a faint line where their song ends.
  for(const b of world.buildings || []){
    if(b.type !== 'hushstone' || !(b.hp > 0) || !d.near(b.x, b.z, HUSH.radius+6)) continue;
    const breath = .5+.5*Math.sin(clock*1.3+b.x);
    d.ring(b.x, b.z, HUSH.radius, .07, '#9fd6c8', .1+.05*breath, {glow: true});
    d.pool(b.x, b.z, 1.4, '#9fd6c8', .22+.1*breath);
    d.motes(b.x, b.z, 3, (clock*.35+b.z*.1)%1, .8, '#cfeee6', .6, Number(String(b.id).slice(1)) || 3, {rise: 1.6, size: .06});
    d.light(b.x, b.z, 2.4);
  }
  for(const e of world.enemies || []){
    if(!(e.hp > 0) || !d.near(e.x, e.z, 4)) continue;
    if(e.gilded){d.motes(e.x, e.z, 4, (clock*.9+e.x*.1)%1, .7, '#ffe08a', .8, Number(String(e.id).slice(1)) || 1, {rise: 1.2, size: .07}); d.pool(e.x, e.z, 1.2, '#ffd25a', .3); d.light(e.x, e.z, 2.2);}
    // A bleeding altar's Dread champion (omens.mjs) walks in a slow red pulse.
    if(e.champion){const beat = .5+.5*Math.sin(clock*3+e.x); d.pool(e.x, e.z, 2.2, '#e0465a', .22+.1*beat); d.ring(e.x, e.z, 1.8+.25*beat, .08, '#ff4a5e', .45, {glow: true}); d.light(e.x, e.z, 2.6);}
    if(ENEMIES[e.type]?.boss){
      const c = e.type === 'unblinking' ? STYLE.void : STYLE.thorn, rage = (e.phase || 1)-1;
      d.pool(e.x, e.z, 3+rage, c.glow, .22+.1*rage);
      d.light(e.x, e.z, 4+rage);
      if(rage) d.ring(e.x, e.z, 2.6+.2*Math.sin(clock*4), .08, c.main, .3*rage, {glow: true});
    }
  }
  // Lava in the Ashen Scar glows through the night.
  if(!world.arena && !world.dungeon && !world.showcase){
    const scar = areasOf(world.seed).find(a => a.id === 'ashscar');
    if(scar && d.near(scar.x, scar.z, scar.r+6)) for(const p of scar.pools || []){d.light(p.x, p.z, p.r+1.8); d.pool(p.x, p.z, p.r+.3, '#ff5a1e', .1+.04*Math.sin(clock*1.3+p.x));}
  }
}
