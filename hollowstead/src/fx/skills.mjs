// How every weapon skill looks (Starfall's lives in starfall.mjs). Presentation only: each painter
// draws one beat from skill-book.mjs, either while it waits or lasts (BEATS, from world.beats) or
// when it fires (EVENTS, from its 'fx' event). Rank (tier) layers on the show: ★1 is the bare
// shape of the move, each rank adds glow, sparks, rays, sigils, debris and, at ★5, the extras.
import {INK, TAU, at, bump, clamp01, easeIn, easeInOut, easeOut, easeOut2, fade, hue, lerp, rnd, tier} from './kit.mjs?v=harvest-18';
import {paintImpact, paintMark, paintStar} from './starfall.mjs?v=harvest-18';

const facingOf = e => Math.atan2(e.dz || 0, e.dx || 1);
const PRISM = ['#ffe48e', '#ff9ad6', '#b58cff', '#7fd6ff', '#9ff5c8'];

/** Common blast: flash, shockwave(s), sparks, and rank extras, in a weapon's colours. */
function burst(d, x, z, r, age, rank, seed, h, {life = .5, y = .6, sparks = 1, ground = true, rays = true, shake = 0} = {}){
  const T = tier(rank), f = age/(life*.6);
  if(f < 1){
    d.bloom(x, z, y, r*(.5+.7*easeOut(age/.1)), h.core, (1-f)**2*.9);
    d.bloom(x, z, y*.8, r*1.3, h.glow, (1-f)**1.6*(.35+.05*T.r));
    d.light(x, z, r*2.2*(1-f));
  }
  if(ground) d.pool(x, z, r*1.05, h.glow, .45*fade(age/life));
  for(let k = 0; k < T.rings; k++){
    const tk = (age-k*.06)/(life*.8);
    if(tk > 0 && tk < 1) d.shock(x, z, .25+r*1.15*easeOut(tk), (.06+.02*T.r)*(1-tk)+.02, k ? (T.prism ? PRISM[k*2%5] : h.alt) : h.glow, fade(tk, 1.3), h.core);
  }
  if(sparks) d.sparks(x, z, y*.6, Math.round(T.sparks*sparks), age, h.main, 1, seed, {speed: 3+r*1.4, up: 3.5, life: .6});
  if(rays && T.rays && age < .28) d.rays(x, z, y+.2, 6+T.r*2, r*1.5, .1, h.core, 1-age/.28, seed);
  if(T.debris) d.debris(x, z, 3+T.r, age, INK, seed, {speed: 2+r, up: 4});
  if(T.prism) d.motes(x, z, 8, age, r*.8, PRISM[seed&3], .8*fade(age/(life*1.6)), seed);
  return T;
}
/** Kick for a blast event: camera shake and a flash at high ranks. */
const kickOf = (scale = 1, color) => ev => ({shake: tier(ev.rank).shake*scale, flash: tier(ev.rank).flash*scale*.8, color});
/** A thing flying in a lob from (sx, sz) to (x, z), for pumpkin bombs, vials and webs. */
function lob(b, tt, height = 3.2){
  const fly = b.fly || .4, t = 1-(b.at-tt)/fly;
  if(t < 0 || t > 1) return null;
  const x = lerp(b.sx ?? b.x, b.x, t), z = lerp(b.sz ?? b.z, b.z, t), y = .9+Math.sin(Math.PI*t)*height*(.6+.4*Math.min(1, Math.hypot(b.x-(b.sx ?? b.x), b.z-(b.sz ?? b.z))/6));
  return {x, z, y, t};
}
/** Spikes rising out of the ground along a line (thorns, bones, ice). */
function spikes(d, x, z, dx, dz, len, age, color, tip, seed, {count = 12, height = 1.1, life = 1, width = .34, side = .5} = {}){
  for(let i = 0; i < count; i++){
    const s = (i+.5)/count, delay = s*.18, k = (age-delay)/life;
    if(k <= 0 || k >= 1) continue;
    const off = (rnd(seed, i)-.5)*side*2, px = x+dx*len*s-dz*off, pz = z+dz*len*s+dx*off;
    const rise = k < .15 ? easeOut(k/.15) : k > .7 ? 1-easeIn((k-.7)/.3) : 1, hgt = height*(.6+rnd(seed, i+9)*.7)*rise, lean = (rnd(seed, i+4)-.5)*.5;
    d.path([at(px, pz, .05, -width*.5, 0), at(px, pz, .05, width*.5, 0), at(px, pz, .05, lean, hgt)], 0, color, 1, {fill: true});
    d.path([at(px, pz, .05, -width*.5, 0), at(px, pz, .05, lean, hgt), at(px, pz, .05, width*.5, 0)], .05, INK, 1);
    d.path([at(px, pz, .05, lean*.7, hgt*.55), at(px, pz, .05, lean, hgt)], .07, tip, .9*rise, {glow: true});
  }
}

// ------------------------------------------------------------------ fire-once looks (events)
export const SKILL_EVENTS = {
  'fx:slam': {life: () => .9, kick: kickOf(1.2, '#ffe0b0'), paint(d, ev, age, seed){
    const h = hue(ev.itemId), T = burst(d, ev.x, ev.z, ev.r || 2.8, age, ev.rank, seed, h, {life: .7, y: .3});
    d.debris(ev.x, ev.z, 6+T.r, age, '#6b5a4a', seed+1, {speed: 3, up: 5});
    d.groundRays(ev.x, ev.z, 7, .4, (ev.r || 2.8)*1.1, .12, h.main, .7*fade(age/.5), seed);
  }},
  'fx:lance': {life: ev => ev.end ? .5 : .01, paint(d, ev, age, seed){
    if(!ev.end) return;
    const h = hue(ev.itemId), T = tier(ev.rank), k = age/.5, a = [ev.x0, 1, ev.z0], b = [ev.x, 1, ev.z];
    d.streak(a, b, (.9+.12*T.r)*(1-k), h.glow, .6*fade(k));
    d.streak(a, b, .22*(1-k), h.core, fade(k));
    if(T.r >= 3) for(let i = 0; i < 5; i++){const s = rnd(seed, i); d.twinkle(lerp(ev.x0, ev.x, s), lerp(ev.z0, ev.z, s), .8+rnd(seed, i+3)*.6, .12, h.alt, fade(k), age*6+i);}
    if(T.r >= 2) d.sparks(ev.x, ev.z, .8, T.sparks, age, h.main, 1, seed, {speed: 5, dir: Math.atan2(ev.dz, ev.dx), spread: 1.4, up: 2});
  }},
  'fx:thorns': {life: () => 1.3, kick: kickOf(.6), paint(d, ev, age, seed){
    const h = hue('spear'), T = tier(ev.rank);
    spikes(d, ev.x, ev.z, ev.dx, ev.dz, ev.len || 6, age, '#6f8f3a', h.alt, seed, {count: 10+T.r*2, height: 1+.1*T.r, life: 1.1});
    if(T.glow) d.path([[ev.x, .06, ev.z], [ev.x+ev.dx*(ev.len || 6), .06, ev.z+ev.dz*(ev.len || 6)]], 1.2, h.glow, .4*fade(age/1.2), {glow: true, soft: true});
    if(T.rays) d.motes(ev.x+ev.dx*(ev.len || 6)/2, ev.z+ev.dz*(ev.len || 6)/2, T.motes, age, (ev.len || 6)/2, h.alt, .8, seed);
  }},
  'fx:spin': {life: () => .45, paint(d, ev, age, seed){
    const h = hue(ev.itemId), T = tier(ev.rank), k = age/.45, r = (ev.r || 3.4)*.85, spin = (ev.v || 0)*2.1;
    const sweep = easeOut(age/.16);
    d.crescent(ev.x, ev.z, .55, r, spin+sweep*TAU, TAU*.9*Math.min(1, sweep+.1), .7+.08*T.r, h.glow, .75*fade(k), {glow: true});
    d.crescent(ev.x, ev.z, .56, r*.97, spin+sweep*TAU, TAU*.6, .22, '#ffffff', .9*fade(k), {light: true});
    if(T.r >= 3) d.sparks(ev.x, ev.z, .6, T.sparks, age, h.core, 1, seed, {speed: 6, up: 1.5, life: .4});
    if(T.r >= 4) d.shock(ev.x, ev.z, r*easeOut(k)*1.1, .06, h.alt, fade(k));
  }},
  'fx:moonwave': {life: ev => ev.end ? .6 : .01, paint(d, ev, age, seed){
    if(!ev.end) return;
    const h = hue('sword'), k = age/.6, f = Math.atan2(ev.dz, ev.dx);
    d.crescent(ev.x, ev.z, .7, 1.6*(1+k), f, 2.2, .6, h.glow, .8*fade(k), {glow: true});
    d.sparks(ev.x, ev.z, .8, tier(ev.rank).sparks, age, h.core, 1, seed, {speed: 4, dir: f, spread: 2, up: 2});
  }},
  'fx:smash': {life: () => 1.1, kick: kickOf(1.4, '#ffe0b0'), paint(d, ev, age, seed){
    const h = hue(ev.itemId), T = tier(ev.rank), f = facingOf(ev), r = ev.r || 5, k = age/.45;
    if(k < 1){
      d.crescent(ev.x, ev.z, .12, r*easeOut(k), f, (ev.arc || 160)*Math.PI/180, 1.2*(1-k)+.2, h.glow, .7*(1-k), {glow: true});
      d.crescent(ev.x, ev.z, .13, r*easeOut(k)*.96, f, (ev.arc || 160)*Math.PI/180, .25, h.core, 1-k, {light: true});
    }
    const cx = ev.x+Math.cos(f)*r*.35, cz = ev.z+Math.sin(f)*r*.35;
    burst(d, cx, cz, 1.6, age, ev.rank, seed, h, {life: .6, y: .4, sparks: 1.4});
    d.debris(cx, cz, 8+T.r*2, age, '#6b5a4a', seed+2, {speed: 4, up: 6, size: .14});
    d.stain(cx, cz, r*.5, h.deep, .35*fade(age/1.1));
    for(let i = 0; i < 5+T.r; i++){
      const a = f+(rnd(seed, i)-.5)*(ev.arc || 160)*Math.PI/180, l = r*(.6+rnd(seed, i+5)*.4);
      d.path([[cx, .07, cz], [cx+Math.cos(a)*l*.5, .07, cz+Math.sin(a)*l*.5], [ev.x+Math.cos(a)*l, .07, ev.z+Math.sin(a)*l]], .07, h.glow, .8*fade(age/1.1), {glow: true, taper: .8});
    }
  }},
  'fx:fissure': {life: ev => ev.end ? 1.2 : .01, kick: kickOf(.5), paint(d, ev, age, seed){
    if(!ev.end) return;
    const h = hue('broadsword'), len = Math.hypot(ev.x-ev.x0, ev.z-ev.z0), dx = (ev.x-ev.x0)/(len || 1), dz = (ev.z-ev.z0)/(len || 1);
    crack(d, ev.x0, ev.z0, dx, dz, len, 1, h, fade(age/1.2), seed, tier(ev.rank));
  }},
  'fx:eruption': {life: () => 1.1, kick: kickOf(1.2, '#ffb070'), paint(d, ev, age, seed){
    const h = hue('flamberge'), T = burst(d, ev.x, ev.z, ev.r || 4.4, age, ev.rank, seed, h, {life: .7, sparks: 1.6});
    fireTongues(d, ev.x, ev.z, (ev.r || 4.4)*.8, age, h, seed, 8+T.r*2, 1.1);
  }},
  'fx:cut': {life: () => .45, paint(d, ev, age, seed){
    const h = hue('fangs'), T = tier(ev.rank), k = age/.45, [fx, fz] = ev.from || [ev.x, ev.z];
    d.streak([fx, 1, fz], [ev.x, 1, ev.z], (.5+.08*T.r)*(1-k), h.glow, .7*fade(k));
    d.streak([fx, 1, fz], [ev.x, 1, ev.z], .12*(1-k), '#ffffff', fade(k));
    const a = Math.atan2(ev.dz || 0, ev.dx || 1)+((ev.v || 0)%2 ? .8 : -.8);
    const len = .9+.1*T.r;
    for(const s of [-1, 1]){
      const b = a+s*.5;
      d.path([at(ev.x, ev.z, 1, -Math.cos(b)*len, -Math.sin(b)*len), at(ev.x, ev.z, 1, Math.cos(b)*len, Math.sin(b)*len)], .16*(1-k), h.main, fade(k), {glow: true, taper: .3});
    }
    if(T.r >= 2) d.sparks(ev.x, ev.z, 1, T.sparks, age, h.main, 1, seed, {speed: 4, up: 2, life: .4});
    if(T.r >= 4) d.bloom(ev.x, ev.z, 1, .8, h.core, .7*fade(k*2));
  }},
  'fx:xslash': {life: () => .7, kick: kickOf(.8, '#ff9a9a'), paint(d, ev, age, seed){
    const h = hue('fangs'), T = tier(ev.rank), k = age/.7, r = (ev.r || 2.6)*easeOut(age/.12);
    for(const s of [-1, 1]){
      d.path([at(ev.x, ev.z, 1, -r*.9, -r*.9*s), at(ev.x, ev.z, 1, r*.9, r*.9*s)], .45*(1-k), h.glow, .6*fade(k), {glow: true, soft: true});
      d.path([at(ev.x, ev.z, 1, -r*.9, -r*.9*s), at(ev.x, ev.z, 1, r*.9, r*.9*s)], .12*(1-k), '#ffffff', fade(k), {glow: true});
    }
    burst(d, ev.x, ev.z, ev.r || 2.6, age, ev.rank, seed, h, {life: .5, y: 1});
    if(T.r >= 3) d.stain(ev.x, ev.z, 1.6, '#5a0c16', .3*fade(k, .6));
  }},
  'fx:chains': {life: () => .8, paint(d, ev, age, seed){
    const h = hue('soulchain'), T = tier(ev.rank), k = age/.8;
    for(const [i, [px, pz]] of (ev.pts || []).entries()){
      const pull = easeOut(age/.3), x = lerp(px, ev.x, pull*.8), z = lerp(pz, ev.z, pull*.8);
      const links = Math.max(3, Math.round(Math.hypot(x-ev.x, z-ev.z)/.45));
      const pts = [];
      for(let j = 0; j <= links; j++){const s = j/links, sag = Math.sin(s*Math.PI)*.35*(1-pull); pts.push([lerp(ev.x, x, s), .9-sag, lerp(ev.z, z, s)]);}
      d.path(pts, .14, INK, fade(k));
      d.path(pts, .07, h.main, fade(k), {glow: true});
      if(T.r >= 2) d.path(pts, .3, h.glow, .35*fade(k), {glow: true, soft: true});
      if(T.r >= 3) d.twinkle(x, z, .9, .14, h.alt, fade(k), age*5+i);
    }
    d.bloom(ev.x, ev.z, .9, 1.2, h.glow, .5*bump(k));
  }},
  'fx:soulburst': {life: () => 1, kick: kickOf(1.1, '#d9b8ff'), paint(d, ev, age, seed){
    const h = hue('soulchain'), T = burst(d, ev.x, ev.z, ev.r || 3, age, ev.rank, seed, h, {life: .7, y: .9, sparks: 1.3});
    for(let i = 0; i < 4+T.r; i++){
      const a = rnd(seed, i)*TAU, k = age/.9, r = (ev.r || 3)*easeOut(k);
      d.bloom(ev.x+Math.cos(a)*r, ev.z+Math.sin(a)*r, .9+k*2, .25, h.alt, fade(k));
    }
  }},
  'fx:volley': {life: () => .3, paint(d, ev, age, seed){muzzle(d, ev, age, seed, hue(ev.itemId));}},
  'fx:salvo': {life: () => .3, paint(d, ev, age, seed){muzzle(d, ev, age, seed, hue('crookstaff'));}},
  'fx:wisps': {life: () => .5, paint(d, ev, age, seed){
    const h = hue('wisplantern'), k = age/.5;
    d.shock(ev.x, ev.z, .4+2.4*easeOut(k), .06, h.glow, fade(k));
    d.bloom(ev.x, ev.z, 1.1, 1, h.core, .7*fade(k));
    d.motes(ev.x, ev.z, tier(ev.rank).motes+4, age, 1.2, h.main, 1, seed, {rise: 1.4});
  }},
  'fx:arrowrain': {life: () => .5, paint(d, ev, age, seed){
    const h = hue('recurve'), T = tier(ev.rank), k = age/.5;
    d.shock(ev.x, ev.z, .2+(ev.r || 1.3)*easeOut(k), .05, h.glow, fade(k));
    if(T.r >= 2) d.bloom(ev.x, ev.z, .3, .8, h.core, .6*fade(k*2));
    d.sparks(ev.x, ev.z, .2, 2+T.r, age, h.main, 1, seed, {speed: 2.5, up: 2.5, life: .35});
    d.path([[ev.x+.05, .05, ev.z], [ev.x-.18, .7, ev.z-.08]], .06, '#5a3a22', fade(k, .5));
  }},
  'fx:lanceshot': {life: ev => ev.end ? .7 : ev.start ? .35 : .01, kick: ev => ev.start ? kickOf(.9)(ev) : null, paint(d, ev, age, seed){
    const h = hue('bonebow'), T = tier(ev.rank);
    if(ev.start){
      const k = age/.35;
      d.bloom(ev.x, ev.z, 1, 1.4+.2*T.r, h.core, fade(k)); d.shock(ev.x, ev.z, .3+2*easeOut(k), .08, h.glow, fade(k));
      if(T.r >= 3) d.rays(ev.x, ev.z, 1, 10, 2.2, .1, h.core, fade(k), seed, Math.atan2(ev.dz, ev.dx));
      return;
    }
    const k = age/.7;
    d.streak([ev.x0, 1, ev.z0], [ev.x, 1, ev.z], (1.2+.15*T.r)*(1-k), h.glow, .5*fade(k), .2);
    d.streak([ev.x0, 1, ev.z0], [ev.x, 1, ev.z], .25*(1-k), '#ffffff', fade(k), .2);
  }},
  'fx:bonespikes': {life: () => 1.2, paint(d, ev, age, seed){
    const T = tier(ev.rank), h = hue('bonebow');
    spikes(d, ev.x, ev.z, ev.dx, ev.dz, ev.len || 16, age, '#efe8d2', h.glow, seed, {count: 12+T.r*3, height: .9+.1*T.r, life: 1, width: .3, side: .7});
  }},
  'fx:graveburst': {life: () => 1.1, kick: kickOf(1.1, '#b8ffd0'), paint(d, ev, age, seed){
    const h = hue('skullstaff'), T = burst(d, ev.x, ev.z, ev.r || 3.8, age, ev.rank, seed, h, {life: .8, y: 1, sparks: 1.5});
    for(let i = 0; i < 5+T.r*2; i++){
      const a = rnd(seed, i)*TAU, k = (age-rnd(seed, i+3)*.2)/.9, r = (ev.r || 3.8)*easeOut(k)*.9;
      if(k > 0 && k < 1) d.bloom(ev.x+Math.cos(a)*r, ev.z+Math.sin(a)*r, .6+k*2.4, .3*(1-k)+.1, h.main, fade(k));
    }
  }},
  'fx:skybolt': {life: () => .55, kick: kickOf(.7, '#dff4ff'), paint(d, ev, age, seed){
    const h = hue('stormrod'), T = tier(ev.rank), k = age/.55;
    const [tx, tz] = ev.pts?.[0] || [ev.x, ev.z];
    if(k < .6){
      const a = 1-k/.6;
      d.lightning([[tx+(rnd(seed, 1)-.5)*2, 14, tz-2], [tx+(rnd(seed, 2)-.5), 7, tz-.8], [tx, .2, tz]], .12+.02*T.r, h.glow, a, seed+Math.floor(age*30), {jag: 1.1, steps: 5});
      d.bloom(tx, tz, .5, 1.4+.2*T.r, h.core, a);
      d.light(tx, tz, 5*a);
    }
    for(let i = 1; i < (ev.pts || []).length; i++){
      const [ax, az] = ev.pts[i-1], [bx, bz] = ev.pts[i];
      d.lightning([[ax, .9, az], [bx, .9, bz]], .08, h.main, fade(k), seed+i*7+Math.floor(age*30), {jag: .6});
    }
    d.shock(tx, tz, .2+(ev.r || 1.4)*1.3*easeOut(k), .06, h.glow, fade(k));
    d.sparks(tx, tz, .3, T.sparks, age, h.core, 1, seed, {speed: 5, up: 3, life: .4});
    if(T.r >= 4) d.stain(tx, tz, .9, '#10142a', .4*fade(k, .5));
  }},
  'fx:flock': {life: ev => ev.end ? .6 : .01, paint(d, ev, age, seed){
    if(!ev.end) return;
    const h = hue('crowtotem'), k = age/.6;
    for(let i = 0; i < 6; i++){
      const a = rnd(seed, i)*TAU, v = 2+rnd(seed, i+2)*2;
      crow(d, ev.x+Math.cos(a)*v*age, ev.z+Math.sin(a)*v*age, 1.4+age*3, .35, a, h, fade(k), age*12+i);
    }
  }},
  'fx:murder': {life: () => .8, paint(d, ev, age, seed){
    const h = hue('crowtotem'), T = tier(ev.rank), k = age/.8;
    d.sigil(ev.x, ev.z, 1.5, h.main, fade(k), {spin: age*2, sides: 7});
    for(let i = 0; i < 8+T.r*2; i++){
      const a = rnd(seed, i)*TAU, r = .3+age*2.5*rnd(seed, i+1);
      feather(d, ev.x+Math.cos(a)*r, ev.z+Math.sin(a)*r, 1.4+age*1.5-age*age*2, a+age*4, fade(k));
    }
  }},
  'fx:pumpkin': {life: () => 1, kick: kickOf(.6, '#ffc070'), paint(d, ev, age, seed){
    const h = hue('jacklantern'), T = burst(d, ev.x, ev.z, ev.r || 1.9, age, ev.rank, seed, h, {life: .6, y: .5, sparks: 1.3});
    fireTongues(d, ev.x, ev.z, (ev.r || 1.9)*.6, age, h, seed, 6+T.r, .8);
    // Pumpkin shell pieces.
    d.debris(ev.x, ev.z, 5+T.r, age, '#e0741c', seed+5, {speed: 4, up: 6, size: .16});
  }},
  'fx:frostnova': {life: () => 1.3, kick: kickOf(1.1, '#e6f8ff'), paint(d, ev, age, seed){
    const h = hue('censer'), T = burst(d, ev.x, ev.z, ev.r || 5, age, ev.rank, seed, h, {life: .8, y: .6, sparks: 1.2});
    const k = age/1.3;
    for(let i = 0; i < 10+T.r*3; i++){
      const a = rnd(seed, i)*TAU, r = (ev.r || 5)*(.2+.8*rnd(seed, i+7))*easeOut(age/.3);
      crystal(d, ev.x+Math.cos(a)*r, ev.z+Math.sin(a)*r, .5+rnd(seed, i+3)*.6, h, fade(k, .7), a);
    }
    d.pool(ev.x, ev.z, ev.r || 5, '#bfe8ff', .25*fade(k));
    if(T.r >= 3) d.motes(ev.x, ev.z, T.motes+6, age, ev.r || 5, '#ffffff', .8, seed, {rise: .8, size: .06});
  }},
  'fx:shatter': {life: () => .8, kick: kickOf(.9, '#e6f8ff'), paint(d, ev, age, seed){
    const h = hue('censer'), T = tier(ev.rank);
    for(const [i, [x, z]] of (ev.pts || []).entries()){
      burst(d, x, z, 1.1, age, ev.rank, seed+i, h, {life: .45, y: .8, sparks: .8, ground: false});
      for(let j = 0; j < 6+T.r; j++){
        const a = rnd(seed+i, j)*TAU, v = 2+rnd(seed+i, j+1)*3, k = age/.7;
        if(k >= 1) continue;
        const px = x+Math.cos(a)*v*age, pz = z+Math.sin(a)*v*age, py = Math.max(.1, .9+3*age-9*age*age);
        crystal(d, px, pz, .35, h, fade(k), a+age*9, py);
      }
    }
  }},
  'fx:vial': {life: () => .9, kick: kickOf(.5), paint(d, ev, age, seed){
    const h = hue('plaguebeak'), T = burst(d, ev.x, ev.z, ev.r || 2.2, age, ev.rank, seed, h, {life: .55, y: .4, rays: false});
    for(let i = 0; i < 5+T.r; i++){
      const a = rnd(seed, i)*TAU, v = 2+rnd(seed, i+1)*2, k = age/.5;
      if(k < 1) d.path([at(ev.x+Math.cos(a)*v*age, ev.z+Math.sin(a)*v*age, .5+2*age-6*age*age, -.06, 0), at(ev.x+Math.cos(a)*v*age, ev.z+Math.sin(a)*v*age, .5+2*age-6*age*age, .06, .12)], .06, '#d9ffe8', fade(k), {glow: true});
    }
  }},
  'fx:boneburst': {life: () => 1.1, kick: kickOf(1), paint(d, ev, age, seed){
    const h = hue('barrow-rattle'), T = tier(ev.rank), r = ev.r || 3.6;
    burst(d, ev.x, ev.z, r, age, ev.rank, seed, h, {life: .6, y: .5});
    for(let i = 0; i < 12+T.r*3; i++){
      const a = i/(12+T.r*3)*TAU, rr = r*(.45+.5*rnd(seed, i));
      spikes(d, ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr, Math.cos(a), Math.sin(a), .01, age-rnd(seed, i+4)*.12, '#efe8d2', h.glow, seed+i, {count: 1, height: .9+rnd(seed, i+6)*.5, life: .9, width: .28, side: 0});
    }
  }},
  'fx:legion': {life: () => 1.2, paint(d, ev, age, seed){
    const h = hue('barrow-rattle'), T = tier(ev.rank);
    for(const [i, [x, z]] of (ev.pts || []).entries()){
      const k = age/1.2;
      d.pool(x, z, 1.1, h.glow, .6*fade(k));
      d.beam(x, z, 0, 3+T.r*.4, .8*(1-k), h.glow, .5*fade(k));
      d.debris(x, z, 5, age, '#4a3e32', seed+i, {speed: 2, up: 4});
      d.motes(x, z, 4+T.motes, age, .6, h.main, .9, seed+i, {rise: 2});
    }
  }},
  'fx:fireball': {life: () => .8, kick: kickOf(.45, '#ffc080'), paint(d, ev, age, seed){
    const h = hue('cinder-staff'), T = burst(d, ev.x, ev.z, ev.r || 1.6, age, ev.rank, seed, h, {life: .55, y: .4, sparks: 1.2});
    fireTongues(d, ev.x, ev.z, (ev.r || 1.6)*.55, age, h, seed, 6+T.r, .7);
    d.stain(ev.x, ev.z, (ev.r || 1.6)*.7, '#1e0a04', .35*fade(age/.8, .7));
  }},
  'fx:web': {life: () => 2.8, paint(d, ev, age, seed){
    const h = hue('widows-needle'), T = tier(ev.rank), r = (ev.r || 3.4)*easeOut(age/.18), k = age/2.8;
    const spokes = 8+T.r;
    for(let i = 0; i < spokes; i++){
      const a = i/spokes*TAU+seed*.01;
      d.path([[ev.x, .08, ev.z], [ev.x+Math.cos(a)*r, .08, ev.z+Math.sin(a)*r]], .04, h.core, .9*fade(k, .5), {glow: T.glow});
    }
    for(let ring = 1; ring <= 4; ring++){
      const pts = [];
      for(let i = 0; i <= spokes; i++){const a = i/spokes*TAU+seed*.01, rr = r*ring/4.3*(i%2 ? .96 : 1); pts.push([ev.x+Math.cos(a)*rr, .08, ev.z+Math.sin(a)*rr]);}
      d.path(pts, .035, h.main, .85*fade(k, .5), {glow: T.glow});
    }
    if(T.r >= 2) d.pool(ev.x, ev.z, r, h.glow, .18*fade(k));
    if(age < .5) burst(d, ev.x, ev.z, 1.6, age, ev.rank, seed, h, {life: .4, y: .5, ground: false});
  }},
  'fx:needles': {life: () => .6, paint(d, ev, age, seed){
    const h = hue('widows-needle'), T = tier(ev.rank);
    for(const [i, [x, z]] of (ev.pts || []).entries()){
      const k = (age-i*.04)/.5;
      if(k <= 0 || k >= 1) continue;
      const drop = Math.max(0, 1-k*4);
      d.path([[x+.3*drop, .9+4*drop, z-.2*drop], [x+.3*drop+.1, 1.8+4*drop, z-.2*drop-.1]], .07, '#f4e8ff', 1, {glow: true});
      if(drop === 0){d.bloom(x, z, .9, .6, h.core, fade((k-.25)/.75)); d.sparks(x, z, .8, 2+T.r, age-.12, h.main, 1, seed+i, {speed: 2, life: .3});}
    }
  }},
  'fx:gale': {life: () => 1, kick: kickOf(1.1, '#e6fff6'), paint(d, ev, age, seed){
    const h = hue('spirit-fan'), T = tier(ev.rank), r = ev.r || 6.2;
    for(let i = 0; i < 2+T.rings; i++){
      const k = (age-i*.08)/.6;
      if(k > 0 && k < 1) d.shock(ev.x, ev.z, .5+r*easeOut(k), .1*(1-k)+.03, i%2 ? h.alt : h.glow, fade(k));
    }
    wind(d, ev.x, ev.z, r*.6, age, h, seed, 8+T.r*2, 1, easeOut(age/.6)*r*.5);
  }},
  'fx:toll': {life: () => 1.2, kick: ev => ({shake: tier(ev.rank).shake*(.5+.35*(ev.v || 0)), flash: (ev.v || 0) === 2 ? tier(ev.rank).flash*1.2 : 0, color: '#fff0c8'}), paint(d, ev, age, seed){
    const h = hue('mourning-bell'), T = tier(ev.rank), r = ev.r || 5, big = (ev.v || 0) === 2;
    for(let i = 0; i < T.rings+1; i++){
      const k = (age-i*.07)/.55;
      if(k > 0 && k < 1) d.shock(ev.x, ev.z, .3+r*easeOut(k), (big ? .16 : .1)*(1-k)+.03, i ? h.alt : h.glow, fade(k));
    }
    bell(d, ev.x, ev.z, 3.2+.3*(ev.v || 0), .9+.2*(ev.v || 0), h, bump(age/1.2), Math.sin(age*14)*.3*fade(age/1.2));
    if(T.r >= 3) d.motes(ev.x, ev.z, T.motes, age, r*.7, h.alt, .9, seed);
    if(big && T.r >= 4) d.beam(ev.x, ev.z, 0, 10, 1.4*fade(age/.5), h.glow, .5*fade(age/.5));
  }},
};

// ------------------------------------------------------------------ waiting and lasting looks (beats)
export const SKILL_BEATS = {
  moonwave: {lasting(d, b, t, clock, lead){
    const h = hue('sword'), T = tier(b.rank), f = Math.atan2(b.dz, b.dx), x = b.x+b.dx*(b.v || 17)*lead, z = b.z+b.dz*(b.v || 17)*lead;
    d.crescent(x, z, .7, 1.6, f, 2.3, .75+.08*T.r, h.glow, .85, {glow: true});
    d.crescent(x, z, .72, 1.55, f, 1.6, .22, '#ffffff', 1, {light: true});
    if(T.r >= 2) d.streak([b.x0 ?? x, .7, b.z0 ?? z], [x, .7, z], 1.4, h.glow, .25, .95);
    if(T.r >= 3) for(let i = 0; i < 4; i++){const a = f+(rnd(i, Math.floor(clock*20))-.5)*2; d.twinkle(x+Math.cos(a)*1.4, z+Math.sin(a)*1.4, .8, .12, h.alt, .9, clock*8+i);}
    if(T.r >= 4) d.light(x, z, 2.5);
  }},
  fissure: {lasting(d, b, t, clock, lead){
    const h = hue('broadsword'), len = Math.min(b.len, (b.traveled || 0)+(b.v || 14)*lead);
    crack(d, b.x0 ?? b.x, b.z0 ?? b.z, b.dx, b.dz, len, 1, h, 1, 13, tier(b.rank));
    const x = (b.x0 ?? b.x)+b.dx*len, z = (b.z0 ?? b.z)+b.dz*len;
    d.bloom(x, z, .4, 1, h.glow, .7);
    d.debris(x, z, 3, (clock*3)%.4, '#6b5a4a', Math.floor(clock*3), {speed: 1.5, up: 4, life: .4});
  }},
  cyclone: {lasting(d, b, t, clock){
    const h = hue('flamberge'), T = tier(b.rank), k = clamp01(t/.25)*clamp01((b.life-t)/.2+.2);
    fireTornado(d, b.x, b.z, b.r || 3.3, t, clock, h, T, k);
    d.light(b.x, b.z, 5*k);
  }},
  graveorb: {lasting(d, b, t, clock, lead){
    const h = hue('skullstaff'), T = tier(b.rank), x = b.x+b.dx*(b.v || 3)*lead, z = b.z+b.dz*(b.v || 3)*lead, k = clamp01(t/.3);
    const beat = ((t-(b.every || .3)*Math.floor(t/(b.every || .3)))/(b.every || .3));
    d.pool(x, z, (b.r || 2.3), h.glow, .3*k);
    d.ring(x, z, (b.r || 2.3)*(.3+.7*easeOut(beat)), .08, h.main, fade(beat)*k);
    d.bloom(x, z, 1.3, 1.1+.15*T.r, h.glow, .55*k);
    skull(d, x, z, 1.3+Math.sin(clock*4)*.1, .55+.05*T.r, h, k);
    if(T.r >= 3) for(let i = 0; i < 6; i++){
      const a = clock*3+i/6*TAU, r = (b.r || 2.3)*.85;
      d.streak([x+Math.cos(a)*r, .8, z+Math.sin(a)*r], [x, 1.3, z], .12, h.main, .5*k, .3);
    }
    if(T.r >= 4) d.light(x, z, 3.5*k);
  }},
  miasma: {lasting(d, b, t, clock){
    const h = hue('plaguebeak'), T = tier(b.rank), k = clamp01(t/.3)*clamp01((b.life-t)/.5);
    for(let i = 0; i < 5+T.r; i++){
      const a = rnd(b.seq || 1, i)*TAU+clock*.4, rr = (b.r || 2)*(.2+.6*rnd(b.seq || 2, i+1));
      const x = b.x+Math.cos(a)*rr, z = b.z+Math.sin(a)*rr, s = .8+.4*Math.sin(clock*2+i);
      d.orb(x, z, .5+.2*Math.sin(clock+i), s, '#4a6a1c', .22*k, {soft: true});
      if(T.glow) d.bloom(x, z, .6, s*.7, h.glow, .18*k);
    }
    if(T.r >= 3) d.motes(b.x, b.z, T.motes, t, b.r || 2, h.main, .7*k, b.seq || 1, {rise: 1});
  }},
  tempest: {lasting(d, b, t, clock){
    const h = hue('spirit-fan'), T = tier(b.rank), k = clamp01(t/.25)*clamp01((b.life-t)/.25+.3);
    wind(d, b.x, b.z, b.r || 3.6, t, h, 3, 6+T.r*2, k, 0, clock);
    if(T.r >= 3) d.sigil(b.x, b.z, (b.r || 3.6)*.9, h.glow, .5*k, {spin: clock*3, sides: 5});
  }},
  arrowrain: {pending(d, b, tt){
    const k = 1-(b.at-tt)/.3;
    if(k < 0) return;
    const h = hue('recurve'), T = tier(b.rank), y = .3+8*(1-k), x = b.x+.6*(1-k), z = b.z-.25*(1-k);
    d.path([[x, y, z], [x+.35, y+1.2, z-.12]], .07, '#5a3a22', 1);
    d.path([[x, y, z], [x+.08, y+.3, z-.03]], .08, '#c9ccd8', 1);
    if(T.r >= 2) d.streak([x, y, z], [x+.6, y+2.2, z-.2], .25, h.glow, .6);
    d.ring(b.x, b.z, (b.r || 1.3)*(1-k*.6), .04, h.main, .6*k);
  }},
  skybolt: {pending(d, b, tt, clock){
    const k = 1-(b.at-tt)/.3;
    if(k < 0) return;
    const h = hue('stormrod');
    d.ring(b.x, b.z, (b.r || 1.4)*(1.2-k*.7), .05, h.glow, .8*k);
    if(tier(b.rank).r >= 3) d.lightning([[b.x-.5, .1, b.z], [b.x+.5, .1, b.z+.2]], .04, h.main, k*.8, Math.floor(clock*25), {jag: .4, steps: 3});
    d.bloom(b.x, b.z, 9, 1.4, '#3a4a7a', .5*k);
  }},
  pumpkin: {pending(d, b, tt, clock){
    const p = lob(b, tt); if(!p) return;
    const h = hue('jacklantern'), T = tier(b.rank);
    if(T.r >= 2) d.bloom(p.x, p.z, p.y, .7, h.glow, .5);
    pumpkinBall(d, p.x, p.z, p.y, .32, clock*8+(b.seq || 0));
    if(T.r >= 3) d.sparks(p.x, p.z, p.y, 3, (clock*2)%.3, h.main, .9, Math.floor(clock*6)+(b.seq || 0), {speed: 1.5, up: 1, life: .3});
    d.ring(b.x, b.z, (b.r || 1.9)*.6, .04, h.main, .6*p.t);
  }},
  vial: {pending(d, b, tt, clock){
    const p = lob(b, tt, 2.6); if(!p) return;
    const h = hue('plaguebeak');
    d.path([at(p.x, p.z, p.y, -.12, -.16), at(p.x, p.z, p.y, .12, -.16), at(p.x, p.z, p.y, .08, .12), at(p.x, p.z, p.y, -.08, .12)], 0, h.main, 1, {fill: true});
    d.path([at(p.x, p.z, p.y, -.12, -.16), at(p.x, p.z, p.y, .12, -.16), at(p.x, p.z, p.y, .08, .12), at(p.x, p.z, p.y, -.08, .12), at(p.x, p.z, p.y, -.12, -.16)], .04, INK, 1);
    if(tier(b.rank).glow) d.bloom(p.x, p.z, p.y, .5, h.glow, .6);
  }},
  web: {pending(d, b, tt, clock){
    const p = lob(b, tt, 2); if(!p) return;
    const h = hue('widows-needle');
    for(let i = 0; i < 6; i++){const a = i/6*TAU+clock*6; d.path([at(p.x, p.z, p.y, 0, 0), at(p.x, p.z, p.y, Math.cos(a)*.5, Math.sin(a)*.5)], .03, h.core, 1, {glow: true});}
    d.bloom(p.x, p.z, p.y, .5, h.glow, .5);
  }},
  fireball: {pending(d, b, tt, clock){
    const t = 1-(b.at-tt)/(b.fall || .45);
    if(t < 0) return;
    fireComet(d, b, t, tier(b.rank), clock);
  }},
  soulburst: {pending(d, b, tt, clock){
    const h = hue('soulchain'), k = clamp01((tt-.12)/.3), grow = (tt-.12)/(b.at-.12);
    if(k <= 0) return;
    d.sigil(b.x, b.z, (b.r || 3)*.7, h.main, .7*k, {spin: clock*2, sides: 5});
    d.bloom(b.x, b.z, .9, .5+grow*.8, h.glow, .6*k);
    d.orb(b.x, b.z, .9, .18+grow*.15, '#ffffff', k, {glow: true});
  }},
  lanceshot: {lasting(d, b, t, clock, lead){
    const h = hue('bonebow'), T = tier(b.rank), x = b.x+b.dx*(b.v || 30)*lead, z = b.z+b.dz*(b.v || 30)*lead;
    const x0 = b.x0 ?? x, z0 = b.z0 ?? z, back = Math.min(6, Math.hypot(x-x0, z-z0));
    const tail = [x-b.dx*back, 1, z-b.dz*back];
    d.streak(tail, [x, 1, z], .9+.12*T.r, h.glow, .55);
    d.streak(tail, [x, 1, z], .22, '#ffffff', .95);
    d.path([at(x, z, 1, 0, 0), [x-b.dx*.9+b.dz*.35, 1, z-b.dz*.9-b.dx*.35], [x+b.dx*.6, 1, z+b.dz*.6], [x-b.dx*.9-b.dz*.35, 1, z-b.dz*.9+b.dx*.35]], 0, '#f6fff9', 1, {fill: true, glow: true});
    d.bloom(x, z, 1, 1+.12*T.r, h.core, .7);
    if(T.r >= 3) d.sparks(x, z, 1, 4, (clock*4)%.25, h.alt, .9, Math.floor(clock*16), {speed: 2, up: 1, life: .25});
    d.light(x, z, 3);
  }},
  flock: {lasting(d, b, t, clock, lead){
    const h = hue('crowtotem'), T = tier(b.rank), x = b.x+b.dx*(b.v || 13)*lead, z = b.z+b.dz*(b.v || 13)*lead;
    const n = 6+T.r*2;
    for(let i = 0; i < n; i++){
      const u = (rnd(b.seq || 1, i)-.5)*2*(b.w || 1.5), back = rnd(b.seq || 2, i+3)*2.2;
      const px = x-b.dx*back-b.dz*u, pz = z-b.dz*back+b.dx*u;
      crow(d, px, pz, 1+rnd(b.seq || 3, i)*1.2+Math.sin(clock*9+i)*.15, .3+.1*rnd(4, i), 0, h, .95, clock*16+i*1.3);
    }
    if(T.r >= 2) d.streak([x-b.dx*3, 1.2, z-b.dz*3], [x, 1.2, z], 1.6, h.glow, .3);
    if(T.r >= 4) d.bloom(x, z, 1.2, 1.2, h.alt, .25);
  }},
  lance: {lasting(d, b, t, clock){
    const h = hue(b.itemId), T = tier(b.rank), x0 = b.x0 ?? b.x, z0 = b.z0 ?? b.z;
    d.streak([x0, 1, z0], [b.x, 1, b.z], .8+.12*T.r, h.glow, .6);
    d.streak([x0, 1, z0], [b.x, 1, b.z], .2, h.core, .95);
    if(T.r >= 3) d.bloom(b.x, b.z, 1, 1, h.core, .6);
  }},
};

// ------------------------------------------------------------------ small shapes
function muzzle(d, ev, age, seed, h){
  const k = age/.3, f = Math.atan2(ev.dz || 0, ev.dx || 1), x = ev.x+Math.cos(f)*.6, z = ev.z+Math.sin(f)*.6;
  d.bloom(x, z, 1, .8+.1*tier(ev.rank).r, h.core, fade(k));
  d.sparks(x, z, 1, tier(ev.rank).sparks, age, h.main, 1, seed, {speed: 6, dir: f, spread: 1.2, up: 1, life: .3});
}
function crack(d, x, z, dx, dz, len, width, h, alpha, seed, T){
  const pts = [], n = Math.max(4, Math.round(len*2));
  for(let i = 0; i <= n; i++){const s = i/n, j = i && i < n ? (rnd(seed, i)-.5)*.6 : 0; pts.push([x+dx*len*s-dz*j, .07, z+dz*len*s+dx*j]);}
  d.path(pts, .3*width, '#1c120c', alpha*.9);
  d.path(pts, .12*width, h.glow, alpha, {glow: true});
  if(T.glow) d.path(pts, .9*width, h.glow, alpha*.35, {glow: true, soft: true});
  if(T.rays) for(let i = 1; i < n; i += 2){const p = pts[i], a = Math.atan2(dz, dx)+(rnd(seed, i+30) > .5 ? 1 : -1)*(.8+rnd(seed, i+31)*.6); d.path([p, [p[0]+Math.cos(a)*.5, .07, p[2]+Math.sin(a)*.5]], .06, h.glow, alpha*.8, {glow: true, taper: .9});}
}
function fireTongues(d, x, z, r, age, h, seed, n, life){
  for(let i = 0; i < n; i++){
    const a = rnd(seed, i+90)*TAU, k = (age-rnd(seed, i+91)*.15)/life;
    if(k <= 0 || k >= 1) continue;
    const rr = r*(.6+.4*rnd(seed, i+92)), px = x+Math.cos(a)*rr, pz = z+Math.sin(a)*rr, hgt = (.6+rnd(seed, i+93)*.9)*bump(k);
    const sway = Math.sin(age*14+i)*.12;
    d.path([at(px, pz, .1, -.2, 0), at(px, pz, .1, .2, 0), at(px, pz, .1, sway, hgt)], 0, i%3 ? h.glow : h.main, .9*bump(k), {fill: true});
    d.path([at(px, pz, .1, -.08, 0), at(px, pz, .1, .08, 0), at(px, pz, .1, sway*.7, hgt*.6)], 0, h.alt, .9*bump(k), {glow: true, fill: true});
  }
}
function fireTornado(d, x, z, r, t, clock, h, T, k){
  d.pool(x, z, r, h.glow, .35*k);
  const bands = 3+Math.min(3, T.r);
  for(let band = 0; band < bands; band++){
    const pts = [], lift = band/bands;
    for(let i = 0; i <= 26; i++){
      const s = i/26, a = clock*(9-band)+s*TAU*1.3+band*1.7, rr = r*(.35+.65*s)*(1-.25*lift);
      pts.push([x+Math.cos(a)*rr, .3+lift*2+s*.8, z+Math.sin(a)*rr]);
    }
    d.path(pts, .5-.06*band, band%2 ? h.main : h.glow, .55*k, {glow: true, soft: true, taper: .8});
    if(T.r >= 2) d.path(pts, .1, h.core, .7*k, {glow: true, taper: .9});
  }
  // Tongues of flame riding the whirl, painted so they stay orange on any ground.
  const tongues = 6+T.r*2;
  for(let i = 0; i < tongues; i++){
    const a = clock*8+i/tongues*TAU, rr = r*(.55+.4*((i%3)/2)), px = x+Math.cos(a)*rr, pz = z+Math.sin(a)*rr;
    const hgt = (.7+.5*Math.sin(clock*13+i*1.7)**2)*k, lean = -Math.sin(a)*.35;
    d.path([at(px, pz, .15, -.2, 0), at(px, pz, .15, .2, 0), at(px, pz, .15, lean, hgt)], 0, i%2 ? h.glow : h.main, .85*k, {fill: true});
    d.path([at(px, pz, .15, -.08, 0), at(px, pz, .15, .08, 0), at(px, pz, .15, lean*.7, hgt*.55)], 0, h.alt, .9*k, {glow: true, fill: true});
  }
  if(T.r >= 3) for(let i = 0; i < T.sparks; i++){
    const a = clock*7+i/T.sparks*TAU, rr = r*(.5+.5*((i*.37+clock)%1));
    d.bloom(x+Math.cos(a)*rr, z+Math.sin(a)*rr, .4+((clock*2+i*.3)%1)*2.4, .12, h.alt, .8*k);
  }
}
function wind(d, x, z, r, t, h, seed, n, alpha, push = 0, clock = t){
  for(let i = 0; i < n; i++){
    const pts = [], a0 = rnd(seed, i)*TAU+clock*(4+rnd(seed, i+1)*2), rr = r*(.4+.6*rnd(seed, i+2))+push, y = .3+rnd(seed, i+3)*1.4;
    for(let j = 0; j <= 8; j++){const a = a0+j*.14; pts.push([x+Math.cos(a)*rr, y+j*.02, z+Math.sin(a)*rr]);}
    d.path(pts, .12, i%3 ? h.main : h.core, .7*alpha, {glow: true, taper: .9});
  }
}
function crystal(d, x, z, size, h, alpha, spin, y = .05){
  const s = size;
  const pts = [at(x, z, y, 0, s*1.4), at(x, z, y, s*.35, s*.4), at(x, z, y, 0, 0), at(x, z, y, -s*.35, s*.4)];
  d.path(pts, 0, '#e8f8ff', alpha*.9, {fill: true});
  d.path([...pts, pts[0]], .04, '#5a8ab0', alpha);
  d.path([pts[0], pts[2]], .05, h.core, alpha, {glow: true});
}
function crow(d, x, z, y, s, a, h, alpha, flap){
  const w = Math.sin(flap)*.5;
  d.path([at(x, z, y, -s, s*w), at(x, z, y, -s*.3, 0), at(x, z, y, 0, s*.1), at(x, z, y, s*.3, 0), at(x, z, y, s, s*w)], .09, '#1a1024', alpha);
  d.bloom(x, z, y, s*.8, h.glow, .25*alpha);
}
function feather(d, x, z, y, spin, alpha){
  const c = Math.cos(spin)*.18, s = Math.sin(spin)*.18;
  d.path([at(x, z, y, -c, -s), at(x, z, y, c, s)], .08, '#1a1024', alpha, {taper: .8});
}
function skull(d, x, z, y, r, h, alpha){
  d.orb(x, z, y, r, '#e9fff2', alpha);
  d.path([at(x, z, y, -r*.55, -r*.3), at(x, z, y, r*.55, -r*.3), at(x, z, y, r*.4, -r*.95), at(x, z, y, -r*.4, -r*.95)], 0, '#e9fff2', alpha, {fill: true});
  d.orb(x-r*.35, z, y+r*.05, r*.26, INK, alpha);
  d.orb(x+r*.35, z, y+r*.05, r*.26, INK, alpha);
  d.orb(x-r*.35, z, y+r*.05, r*.12, h.main, alpha, {glow: true});
  d.orb(x+r*.35, z, y+r*.05, r*.12, h.main, alpha, {glow: true});
}
function pumpkinBall(d, x, z, y, r, spin){
  d.orb(x, z, y, r, '#f08a24', 1);
  d.path([at(x, z, y, -r*.2, -r*.9), at(x, z, y, -r*.2, r*.9)], .04, '#b85a10', 1);
  d.path([at(x, z, y, r*.25, -r*.9), at(x, z, y, r*.25, r*.9)], .04, '#b85a10', 1);
  d.path([at(x, z, y, 0, r), at(x, z, y, .06, r*1.35)], .07, '#4a7a22', 1);
  d.orb(x-r*.3, z, y+r*.15, r*.14, '#ffe07a', 1, {glow: true});
  d.orb(x+r*.3, z, y+r*.15, r*.14, '#ffe07a', 1, {glow: true});
}
function bell(d, x, z, y, s, h, alpha, swing){
  if(!(alpha > .01)) return;
  const p = (u, v) => at(x, z, y, (u*Math.cos(swing)-v*Math.sin(swing))*s, (u*Math.sin(swing)+v*Math.cos(swing))*s);
  // A bronze bell: rounded crown, waist, flared lip; ink edge; a clapper swinging under it.
  const half = [[0, .66], [.16, .64], [.28, .56], [.34, .42], [.36, .22], [.4, 0], [.48, -.24], [.62, -.44], [.72, -.56]];
  const outline = [...half.map(([u, v]) => p(u, v)), ...half.slice().reverse().map(([u, v]) => p(-u, v))];
  d.bloom(x, z, y-.3*s, s*1.1, h.glow, .35*alpha);
  d.path([p(0, .1), ...outline, outline[0]], 0, h.main, alpha*.95, {fill: true});
  d.path([...outline, outline[0]], .06, INK, alpha);
  d.path([p(-.3, .3), p(.3, .3)], .04, INK, alpha*.6);
  d.path([p(-.6, -.46), p(.6, -.46)], .05, h.glow, alpha, {glow: true});
  d.orb(...(() => {const q = p(Math.sin(swing*3)*.18, -.68); return [q[0], q[2], q[1]];})(), .09*s, INK, alpha);
  d.orb(x, z, y+.7*s, .06*s, INK, alpha);
}
function fireComet(d, b, t, T, clock){
  const h = hue('cinder-staff');
  // Reuse the star's fall curve for a fireball.
  const u = .12*t+.88*t**1.8;
  const p0 = [b.x+(b.ox ?? 2), b.oh ?? 7, b.z+(b.oz ?? -1)], p1 = [b.x, .4, b.z];
  const pos = s => [lerp(p0[0], p1[0], s)+Math.sin(s*Math.PI)*(b.bend || 0)*.4, lerp(p0[1], p1[1], s), lerp(p0[2], p1[2], s)];
  const head = pos(u), tail = [];
  for(let i = 0; i <= 8; i++) tail.push(pos(Math.max(0, u-.25*i/8)));
  d.path(tail, .7, h.glow, .5, {glow: true, soft: true, taper: .95});
  d.path(tail, .22, h.core, .9, {glow: true, taper: .95});
  d.orb(head[0], head[2], head[1], .28, '#ffcf6a', 1, {glow: true});
  d.bloom(head[0], head[2], head[1], .7, h.glow, .6);
  d.ring(b.x, b.z, (b.r || 1.6)*(1-t*.5), .04, h.main, .6*t);
  if(T.r >= 3) d.sparks(head[0], head[2], head[1], 3, (clock*3)%.25, h.alt, .9, Math.floor(clock*12)+(b.seq || 0), {speed: 1.2, up: 1, life: .25});
}

/** The flourish every skill cast shows at the wielder (Starfall has its own). */
export function paintSkillCast(d, cast, age, clock){
  const h = hue(cast.itemId), T = tier(cast.rank), k = age/.7;
  if(k >= 1) return;
  const x = cast.x, z = cast.z;
  d.shock(x, z, .4+1.8*easeOut2(k), .07, h.glow, fade(k), h.core);
  d.bloom(x+(cast.dx || 0)*.5, z+(cast.dz || 0)*.5, 1.3, .8+.12*T.r, h.core, .8*fade(k));
  if(T.r >= 2) d.pool(x, z, 1.6, h.glow, .4*fade(k));
  if(T.r >= 3) d.sigil(x, z, 1.5+.2*T.r, h.main, fade(k, 1.2), {spin: clock*2, sides: 5});
  if(T.r >= 4) d.beam(x, z, .2, 7, .7*(1-k), h.glow, .45*fade(k));
  if(T.r >= 5) for(let i = 0; i < 8; i++){const a = i/8*TAU+clock*2; d.twinkle(x+Math.cos(a)*1.4, z+Math.sin(a)*1.4, .6+k*1.8, .14, PRISM[i%5], fade(k), clock*3);}
}
