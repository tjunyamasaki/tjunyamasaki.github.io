// The Hundred Seals, drawn. Presentation only: the host owns the talismans and the seals
// (magic/ofuda.mjs). A talisman is a yellow paper slip with a red brush stroke, spinning as it flies;
// seals stand fanned on the foe they hold, one, two, three, smouldering hotter the more there are; an
// ignition is a burst of fire with the brush sigil, and the fire runs down red-gold lines to the links.
// Ranks: ★1 plain slips; ★2 glow on the seals and a trail; ★3 sparks and the sigil; ★4 the links burn
// thicker and the camera kicks; ★5 gold-and-red prismatic fire and the most embers.
import {INK, TAU, at, bump, clamp01, easeOut, fade, hue, rnd, tier} from './kit.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'ofuda';
const P = hue(PACK), PAPER = '#f6e7a6', SCRIPT = '#b8343a';
const rankOfOwner = p => p && typeof p === 'object' ? rankOf(p, PACK) : 1;

/** One paper slip at (x, y, z), turned `spin` radians in the screen plane, `s` its size. */
export function slip(d, x, z, y, spin, s, alpha = 1, heat = 0){
  const c = Math.cos(spin), si = Math.sin(spin), q = (u, v) => at(x, z, y, (u*c-v*si)*s, (u*si+v*c)*s);
  const body = [q(-.22, .5), q(.22, .5), q(.22, -.5), q(-.22, -.5)];
  d.path([...body, body[0]], 0, INK, .9*alpha, {fill: true});
  const inner = [q(-.17, .45), q(.17, .45), q(.17, -.45), q(-.17, -.45)];
  d.path([...inner, inner[0]], 0, heat > .5 ? '#ffd27a' : PAPER, alpha, {fill: true});
  d.path([q(0, .32), q(.08, .1), q(-.06, -.08), q(.04, -.3)], s*.07, SCRIPT, alpha);
  if(heat > 0) d.path([q(-.17, -.45), q(.17, -.45), q(.17, -.45+.9*heat)], s*.06, '#ff7a3a', alpha*heat, {glow: true});
}

function paintDart(d, b, owner, lead){
  const T = tier(rankOfOwner(owner)), x = b.px+(b.vx || 0)*lead, z = b.pz+(b.vz || 0)*lead;
  if(!d.near(x, z)) return;
  const spin = (b.age+lead)*18+(b.spin || 0), speed = Math.hypot(b.vx || 0, b.vz || 0) || 1;
  if(T.r >= 2) d.path([[x, .9, z], [x-(b.vx || 0)/speed*1.1, .9, z-(b.vz || 0)/speed*1.1]], .18, P.glow, .45, {glow: true, soft: true, taper: .9});
  slip(d, x, z, .9, spin, .55);
}

function paintPin(d, pin, owner, ctx){
  const T = tier(rankOfOwner(owner)), e = ctx.world.enemies?.find(q => q.id === pin.targetId);
  const x = e?.x ?? pin.px, z = e?.z ?? pin.pz, n = pin.n || 0;
  if(!n || !d.near(x, z)) return;
  const heat = (n-1)/2, peel = clamp01((pin.age+ctx.lead-(pin.life-.8))/.8);
  for(let i = 0; i < n; i++){
    const off = (i-(n-1)/2)*.32, sway = Math.sin(ctx.clock*5+i*1.7+x)*.08;
    slip(d, x+off, z, 1.45+.08*i-.4*peel, off*.6+sway+peel*1.2, .48, 1-peel, heat);
  }
  if(T.r >= 2 && heat > 0) d.bloom(x, z, 1.5, .6+.4*heat, P.glow, .3*heat);
  if(heat >= 1) d.motes(x, z, 3, (ctx.clock+x*.1)%1, .4, '#ff9a4a', .8, (pin.id?.length || 5)*13, {rise: 1.2, size: .06, y: 1.4});
}

export const OFUDA_EVENTS = {
  sealstick: {life: () => .25, paint(d, ev, age){d.ring(ev.x, ev.z, .3+age*3, .05, P.main, fade(age/.25), {glow: true, y: .9});}},
  sealburn: {life: () => .8, kick: ev => tier(ev.rank).r >= 4 ? {shake: .15} : null, paint(d, ev, age, seed){
    const k = age/.8, T = tier(ev.rank), R = ev.radius || 1.7;
    d.pool(ev.x, ev.z, R*1.1, P.glow, .45*fade(k));
    d.mark(ev.x, ev.z, R*easeOut(k/.4), .08, P.main, fade(k), {halo: .5});
    for(let i = 0; i < 7; i++){const a = i/7*TAU+seed, r = R*.6*easeOut(k/.5), h = .9*bump(Math.min(1, k*1.6)); d.path([[ev.x+Math.cos(a)*r, .1, ev.z+Math.sin(a)*r], [ev.x+Math.cos(a)*r, h, ev.z+Math.sin(a)*r]], .2, i%2 ? '#ff7a3a' : P.main, fade(k), {taper: .9});}
    if(T.r >= 3) d.sigil(ev.x, ev.z, R*.7, SCRIPT, .8*fade(k, 1.3), {spin: age*2, sides: 3, glow: false});
    // The fire runs down the link to every other seal it reached.
    for(const [lx, lz] of ev.links || []){
      const t = easeOut(k/.35), mx = ev.x+(lx-ev.x)*t, mz = ev.z+(lz-ev.z)*t;
      d.path([[ev.x, .9, ev.z], [mx, .9, mz]], T.r >= 4 ? .2 : .12, '#ff7a3a', fade(k), {glow: true});
      d.path([[ev.x, .9, ev.z], [mx, .9, mz]], .05, P.core, fade(k));
      if(t >= .99) d.bloom(lx, lz, .9, .7, P.glow, .6*fade(k));
    }
    d.sparks(ev.x, ev.z, .8, 6+T.sparks, age, T.r >= 5 ? P.alt : '#ffb44a', fade(k), seed, {up: 4, speed: 3.5});
    d.light(ev.x, ev.z, R*1.6*fade(k));
  }},
  sealleap: {life: () => .4, paint(d, ev, age){const t = easeOut(age/.4), x = ev.x+((ev.tx ?? ev.x)-ev.x)*t, z = ev.z+((ev.tz ?? ev.z)-ev.z)*t; slip(d, x, z, 1+1.4*bump(t), age*20, .45);}},
  'fx:grandseal': {life: () => .9, paint(d, ev, age){
    const k = age/.9;
    d.shock(ev.x, ev.z, .5+2.4*easeOut(k), .08, P.main, fade(k), P.core);
    for(const [mx, mz] of ev.marks || []){const t = easeOut(k/.5); slip(d, ev.x+(mx-ev.x)*t, ev.z+(mz-ev.z)*t, .9+1.2*bump(t), age*16+mx, .5, t < 1 ? 1 : fade((k-.5)*2));}
  }},
  'fx:sealfire': {life: () => 1, kick: ev => ({shake: .2+tier(ev.rank).shake*.6, flash: tier(ev.rank).flash, color: '#ffe2a0'}), paint(d, ev, age){
    const pts = ev.points || [], k = age/1;
    for(let i = 1; i < pts.length; i++) d.path([[pts[i-1][0], .9, pts[i-1][1]], [pts[i][0], .9, pts[i][1]]], .14, '#ff7a3a', fade(k), {glow: true});
  }},
};

/** Talismans circling the wielder's shoulders while the sheaf is in hand: three at ★1, five at ★5. */
function paintSheaf(d, world, p, anchor, motion, clock){
  const T = tier(rankOfOwner(p)), n = 2+Math.ceil(T.r/2), sealed = (world.magicPins || []).some(q => q.packId === PACK && q.ownerId === p.id && q.n >= 2);
  for(let i = 0; i < n; i++){
    const a = clock*1.3+i/n*TAU, x = anchor.x+Math.cos(a)*.7, z = anchor.z+Math.sin(a)*.35, y = anchor.y+1.35+.12*Math.sin(clock*2+i);
    slip(d, x, z, y, Math.sin(clock*3+i)*.4, .36, .95, sealed ? .6 : 0);
  }
  if(T.r >= 2 && sealed) d.bloom(anchor.x, anchor.z, anchor.y+1.3, .8, P.glow, .25);
  return {};
}

export const OFUDA_FX = {
  id: PACK,
  events: OFUDA_EVENTS,
  rig: (d, world, p, anchor, motion, clock) => ({keep: paintSheaf(d, world, p, anchor, motion, clock)}),
  lists: {
    magicDarts: (d, b, owner, ctx) => paintDart(d, b, owner, ctx.lead),
    magicPins: (d, pin, owner, ctx) => paintPin(d, pin, owner, ctx),
  },
};
