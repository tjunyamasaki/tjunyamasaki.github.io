// Rank flair for auto attacks. ★1 keeps each weapon's plain look (the renderers' own slashes,
// rings and sprites); from ★2 up these painters layer glow, sparks, rays and extras on top, in
// the weapon's colours. Presentation only.
import {INK, TAU, at, bump, clamp01, easeOut, easeOut2, fade, hue, rnd, tier} from './kit.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PRISM = ['#ffe48e', '#ff9ad6', '#b58cff', '#7fd6ff', '#9ff5c8'];
const ranked = ev => (ev.rank || 1) >= 2;

function sweep(d, ev, age, seed){
  const h = hue(ev.itemId), T = tier(ev.rank), f = Math.atan2(ev.dz || 0, ev.dx || 1);
  const arc = Math.min(TAU*.95, (ev.arc || 120)*Math.PI/180), r = (ev.range || 2.5)*.82, k = age/.32;
  const grow = easeOut(age/.1);
  d.crescent(ev.x, ev.z, .5, r, f-arc/2+arc*grow/2, arc*grow, (.35+.08*T.r)*(1-k*.6), h.glow, .7*fade(k), {glow: true});
  d.crescent(ev.x, ev.z, .52, r*.98, f-arc/2+arc*grow/2, arc*grow*.8, .12, h.core, fade(k), {light: true});
  if(T.r >= 3){
    const tipA = f-arc/2+arc*grow;
    d.sparks(ev.x+Math.cos(tipA)*r, ev.z+Math.sin(tipA)*r, .6, T.sparks, age, h.main, 1, seed, {speed: 3.5, up: 2, life: .4});
  }
  if(T.r >= 4){
    const echo = (age-.06)/.32;
    if(echo > 0 && echo < 1) d.crescent(ev.x, ev.z, .45, r*1.12, f-arc/2+arc*easeOut(echo*3)/2, arc*easeOut(echo*3), .2, h.alt, .55*fade(echo), {light: true});
    d.pool(ev.x+Math.cos(f)*r*.6, ev.z+Math.sin(f)*r*.6, r*.5, h.glow, .25*fade(k));
  }
  if(T.r >= 5) for(let i = 0; i < 5; i++){
    const a = f-arc/2+arc*(i+.5)/5;
    d.twinkle(ev.x+Math.cos(a)*r*1.05, ev.z+Math.sin(a)*r*1.05, .6+age*1.5, .1, PRISM[i], fade(k), age*8+i);
  }
}

export const FLAIR_EVENTS = {
  slash: {life: () => .4, when: ranked, paint: sweep},
  cleave: {life: () => .45, when: ranked, paint: sweep},
  nova: {life: () => .8, when: ranked, kick: ev => ({shake: tier(ev.rank).shake*.4}), paint(d, ev, age, seed){
    const h = hue(ev.itemId), T = tier(ev.rank), r = ev.radius || 4.6, k = age/.5;
    if(k < 1){
      d.ring(ev.x, ev.z, .3+r*easeOut(k), (.7+.1*T.r)*(1-k), h.glow, .5*(1-k), {soft: true});
      d.ring(ev.x, ev.z, .3+r*easeOut(k), .1, h.core, 1-k);
    }
    if(T.r >= 3){
      for(let i = 0; i < 8+T.r*2; i++){
        const a = rnd(seed, i)*TAU, kk = (age-rnd(seed, i+1)*.1)/.5, rr = r*easeOut(kk);
        if(kk > 0 && kk < 1) d.path([at(ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr, .1, -.15, 0), at(ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr, .1, .15, 0), at(ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr, .1, 0, .9*bump(kk))], 0, i%2 ? h.main : h.alt, .9, {glow: true, fill: true});
      }
    }
    if(T.r >= 4) d.bloom(ev.x, ev.z, .8, 1.6, h.core, .7*fade(age/.25));
    if(T.r >= 2) d.motes(ev.x, ev.z, T.motes, age, r*.8, h.alt, .8*fade(age/.8), seed);
  }},
  burst: {life: () => .55, when: ranked, paint(d, ev, age, seed){
    const h = hue(ev.itemId), T = tier(ev.rank), r = ev.radius || 1.7, k = age/.4;
    if(k < 1){d.bloom(ev.x, ev.z, .8, r*(.6+.5*easeOut(age/.08)), h.core, .8*(1-k)**2); d.shock(ev.x, ev.z, .2+r*1.1*easeOut(k), .06, h.glow, 1-k);}
    if(T.r >= 3) d.sparks(ev.x, ev.z, .8, T.sparks, age, h.main, 1, seed, {speed: 4, up: 3, life: .45});
    if(T.r >= 4 && age < .22) d.rays(ev.x, ev.z, .9, 8, r*1.4, .08, h.core, 1-age/.22, seed);
    if(T.r >= 5) d.motes(ev.x, ev.z, 6, age, r*.7, PRISM[seed&3], .9, seed);
  }},
  chain: {life: () => .45, when: ranked, paint(d, ev, age, seed){
    const h = hue('stormrod'), T = tier(ev.rank), k = age/.45, pts = (ev.points || []).map(([x, z]) => [x, .9, z]);
    if(pts.length < 2) return;
    d.lightning(pts, .07+.015*T.r, h.glow, fade(k), seed+Math.floor(age*24), {jag: .5});
    if(T.r >= 3) for(let i = 1; i < pts.length; i++){d.bloom(pts[i][0], pts[i][2], .9, .7, h.core, fade(k)); d.sparks(pts[i][0], pts[i][2], .9, 3+T.r, age, h.main, 1, seed+i, {speed: 3, life: .35});}
    if(T.r >= 4){const [x, , z] = pts[pts.length-1]; d.lightning([[x+.4, 7, z-1], [x, .9, z]], .06, h.main, fade(k*1.4), seed+99+Math.floor(age*24), {jag: .8, steps: 4});}
  }},
  lash: {life: () => .5, when: ranked, paint(d, ev, age, seed){
    const h = hue('soulchain'), T = tier(ev.rank), k = age/.5, len = (ev.range || 5.5)*easeOut(age/.12);
    const pts = [];
    for(let i = 0; i <= 14; i++){const s = i/14; pts.push([ev.x+(ev.dx || 0)*len*s, .9+Math.sin(s*9-age*30)*.12*(1-k), ev.z+(ev.dz || 0)*len*s]);}
    d.path(pts, .3, h.glow, .5*fade(k), {glow: true, soft: true});
    d.path(pts, .06, h.core, fade(k), {glow: true});
    if(T.r >= 3) for(let i = 2; i < pts.length; i += 3) d.twinkle(pts[i][0], pts[i][2], pts[i][1], .1, h.alt, fade(k), age*6+i);
    if(T.r >= 4) d.bloom(pts[pts.length-1][0], pts[pts.length-1][2], .9, .9, h.main, .6*fade(k));
  }},
  rend: {life: () => .55, when: ranked, kick: ev => ({shake: tier(ev.rank).shake*.4}), paint(d, ev, age, seed){
    const h = hue('fangs'), T = tier(ev.rank), k = age/.55, r = .9+.12*T.r;
    for(const s of [-1, 1]){
      d.path([at(ev.x, ev.z, 1, -r, -r*s), at(ev.x, ev.z, 1, r, r*s)], .35*(1-k), h.glow, .6*fade(k), {glow: true, soft: true});
      d.path([at(ev.x, ev.z, 1, -r, -r*s), at(ev.x, ev.z, 1, r, r*s)], .09*(1-k), '#ffffff', fade(k), {glow: true});
    }
    if(T.r >= 3) d.sparks(ev.x, ev.z, 1, T.sparks, age, h.main, 1, seed, {speed: 3.5, up: 2.5, life: .45});
    if(T.r >= 4) d.shock(ev.x, ev.z, .3+1.4*easeOut(k), .06, h.alt, fade(k));
  }},
  frost: {life: () => .7, when: ranked, paint(d, ev, age, seed){
    const h = hue('censer'), T = tier(ev.rank), r = ev.radius || 2.6, k = age/.7;
    d.shock(ev.x, ev.z, .3+r*easeOut(k), .07, h.glow, fade(k), h.core);
    if(T.r >= 3) d.sparks(ev.x, ev.z, .5, T.sparks, age, '#ffffff', 1, seed, {speed: 3, up: 2, life: .5, gravity: 4});
    if(T.r >= 4) d.bloom(ev.x, ev.z, .6, r*.8, h.main, .4*fade(k));
  }},
  summon: {life: () => .8, when: ranked, paint(d, ev, age, seed){
    const h = hue(ev.itemId), T = tier(ev.rank), k = age/.8;
    d.sigil(ev.x, ev.z, 1.1, h.main, fade(k), {spin: age*3, sides: 5});
    if(T.r >= 3) d.motes(ev.x, ev.z, T.motes, age, .8, h.glow, .9, seed, {rise: 2});
    if(T.r >= 4) d.beam(ev.x, ev.z, 0, 4, .7*(1-k), h.glow, .45*fade(k));
  }},
  /** Hit sparks in the attacker's colours: resolved from the wielder when the event arrives. */
  damage: {life: () => .4, resolve(ev, world){
    if(!ev.by || !world?.player) return null;
    const p = world.player(ev.by), itemId = p?.equipment?.weapon?.itemId;
    if(!p || !itemId) return null;
    const rank = rankOf(p, itemId);
    return rank >= 2 ? {...ev, itemId, rank} : null;
  }, paint(d, ev, age, seed){
    const h = hue(ev.itemId), T = tier(ev.rank), k = age/.4;
    d.bloom(ev.x, ev.z, .9, .35+.07*T.r, h.core, .8*fade(k*1.6));
    d.sparks(ev.x, ev.z, .9, 2+T.r, age, h.main, 1, seed, {speed: 3, up: 2.2, life: .3, len: .05});
    if(T.r >= 4) d.shock(ev.x, ev.z, .2+.7*easeOut(k), .04, h.glow, fade(k));
  }},
};

/** In-flight glow for arrows, bolts, wisps and seeds at ★2+, and for every skill volley. */
export function paintProjectile(d, s, lead, clock){
  const rank = s.rank || 1;
  if(rank < 2 && !s.skill) return;
  const speed = Math.hypot(s.vx || 0, s.vz || 0) || 1, dx = (s.vx || 0)/speed, dz = (s.vz || 0)/speed;
  const x = s.x+(s.vx || 0)*Math.min(lead, .06), z = s.z+(s.vz || 0)*Math.min(lead, .06);
  if(!d.near(x, z)) return;
  const h = hue(s.itemId), T = tier(Math.max(rank, s.skill ? 2 : 1)), len = Math.min((s.traveled || 0)+.2, .9+.25*T.r);
  d.streak([x-dx*len, .9, z-dz*len], [x, .9, z], .28+.06*T.r, h.glow, .55);
  d.streak([x-dx*len*.6, .9, z-dz*len*.6], [x, .9, z], .08, h.core, .9);
  d.bloom(x, z, .9, .3+.06*T.r, h.core, .6);
  if(T.r >= 4) d.twinkle(x-dx*len*.7, z-dz*len*.7, .9+Math.sin(clock*20+s.age*9)*.1, .1, h.alt, .8, clock*9);
  if(T.r >= 5) d.light(x, z, 1.5);
}

/** A magic weapon's cast at ★2+: a ring at the feet, a bloom at the hand, a sigil from ★3. */
export function paintMagicCast(d, p, cast, age, clock){
  const rank = rankOf(p, cast.itemId);
  if(rank < 2 || age > .55 || age < 0) return;
  const h = hue(cast.itemId), T = tier(rank), k = age/.55;
  const x = cast.x+(cast.dx || 0)*.5, z = cast.z+(cast.dz || 0)*.5;
  d.bloom(x, z, 1.2, .5+.08*T.r, h.core, .7*fade(k));
  d.shock(cast.x, cast.z, .3+1.1*easeOut2(k), .05, h.glow, fade(k));
  if(T.r >= 3) d.sigil(cast.x, cast.z, 1+.1*T.r, h.main, .8*fade(k), {spin: clock*2, sides: 5});
  if(T.r >= 4) d.sparks(x, z, 1.2, T.sparks, age, h.main, 1, Math.floor(cast.at*100), {speed: 3, up: 3, life: .4});
  if(T.r >= 5) d.motes(cast.x, cast.z, 8, age, .9, PRISM[Math.floor(cast.at*10)%5], .9, Math.floor(cast.at*100), {rise: 1.8});
}

/** A frost-cloud zone's glitter at ★2+ (the censer). */
export function paintFrostZone(d, zone, lead, clock){
  const rank = zone.rank || 1;
  if(rank < 2 || zone.kind !== 'frost' || !d.near(zone.x, zone.z)) return;
  const h = hue('censer'), T = tier(rank), life = clamp01(((zone.age || 0)+lead)*3)*clamp01(((zone.life || 4)-(zone.age || 0))*2);
  d.pool(zone.x, zone.z, zone.radius || 2.6, h.glow, .22*life);
  if(T.r >= 3) d.motes(zone.x, zone.z, T.motes, clock, zone.radius || 2.6, '#ffffff', .8*life, (zone.id || '').length+7, {rise: .8, size: .06, life: 1.4});
  if(T.r >= 4) d.ring(zone.x, zone.z, (zone.radius || 2.6)*(.9+.05*Math.sin(clock*3)), .05, h.core, .6*life);
}

/** Ice shells on foes frozen by Absolute Zero. */
export function paintFrozen(d, e, time){
  if(!(e.frostUntil > time) || !d.near(e.x, e.z)) return;
  const k = clamp01((e.frostUntil-time)/.4), h = hue('censer'), s = e.type === 'king' ? 1.8 : e.type === 'golem' || e.type === 'brute' ? 1.3 : .9;
  const pts = [at(e.x, e.z, .05, -.7*s, 0), at(e.x, e.z, .05, -.55*s, 1.3*s), at(e.x, e.z, .05, 0, 1.7*s), at(e.x, e.z, .05, .6*s, 1.2*s), at(e.x, e.z, .05, .7*s, 0)];
  d.path(pts, 0, '#cfeeff', .45*k, {fill: true});
  d.path([...pts, pts[0]], .05, '#8fd2ff', .9*k, {glow: true});
  d.path([at(e.x, e.z, .05, -.2*s, .3*s), at(e.x, e.z, .05, .1*s, 1.2*s)], .05, '#ffffff', .8*k, {glow: true});
  d.bloom(e.x, e.z, .8*s, .9*s, h.glow, .25*k);
}
