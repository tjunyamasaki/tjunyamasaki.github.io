// Moon-Maw: painted jawbone, a readable return ribbon, and three visible catch teeth.
// The same command lists feed both renderers. All movement comes from the host's crescent state.
import {at, TAU, INK, HUES, tier, easeOut, fade, bump, seedOf} from './kit.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

const PACK = 'moon-maw', P = HUES[PACK], BONE = '#f1dfb4', SHADE = '#b9b39a';
const rank = p => p ? rankOf(p, PACK) : 1;
const charge = p => Math.max(0, Math.min(3, (p?.moonMawTeeth || 0)|0));

/** A concave crescent needs ribbon triangulation, not a triangle fan across its open mouth. */
function jaw(d, x, z, y, r, spin, T, {hot = false, ghost = false} = {}){
  if(r < .01) return;
  const c = Math.cos(spin), s = Math.sin(spin);
  const q = (u, v) => at(x, z, y, (u*c-v*s)*r, (u*s+v*c)*r);
  const shape = (scale, color, alpha = 1) => {
    const outer = [], inner = [];
    for(let i = 0; i <= 26; i++){
      const a = .44+i/26*(TAU-.88);
      outer.push(q(Math.cos(a)*scale, Math.sin(a)*scale));
      inner.push(q((.29+Math.cos(a)*.66)*scale, Math.sin(a)*.66*scale));
    }
    d.path([...outer, ...inner.reverse()], 0, color, alpha, {fill: 'ribbon', glow: ghost});
  };
  if(ghost){shape(1, P.alt, .25); return;}
  if(T.glow) d.bloom(x, z, y, r*1.3, P.glow, hot ? .22 : .12);
  shape(1.08, INK); shape(1, SHADE); shape(.91, BONE);
  // Spirit enamel follows the back of the bone, away from the sharp ivory teeth.
  const rim = [];
  for(let i = 0; i <= 24; i++){const a = 1+i/24*(TAU-2); rim.push(q(Math.cos(a)*.84, Math.sin(a)*.84));}
  d.path(rim, r*.115, P.main, 1); d.path(rim, r*.038, P.core, 1);
  for(let i = 0; i < 5; i++){
    const a = 1.22+i/4*(TAU-2.44), u = .29+Math.cos(a)*.64, v = Math.sin(a)*.64;
    const du = -Math.sin(a)*.1, dv = Math.cos(a)*.1;
    const tip = [u-Math.cos(a)*.25, v-Math.sin(a)*.25];
    d.path([q(u-du, v-dv), q(...tip), q(u+du, v+dv), q(u-du, v-dv)], 0, INK, 1, {fill: true});
    d.path([q(u-du*.65, v-dv*.65), q(u+(tip[0]-u)*.76, v+(tip[1]-v)*.76), q(u+du*.65, v+dv*.65)], 0, BONE, 1, {fill: true});
  }
  // One slit eye on the broad side makes even the idle weapon look alive.
  const eye = q(-.6, .03);
  d.orb(eye[0], eye[2], eye[1], r*.2, INK);
  d.orb(eye[0], eye[2], eye[1], r*.14, hot ? P.alt : P.main);
  d.path([q(-.6, -.06), q(-.6, .12)], r*.06, INK);
  const glint = q(-.65, .085); d.orb(glint[0], glint[2], glint[1], r*.037, P.core);
  for(const sign of [-1, 1]) d.path([q(-.7, sign*.35), q(-.56, sign*.28), q(-.47, sign*.39)], r*.035, INK, .8);
}

function tooth(d, x, z, y, r, color, spin = 0){
  const c = Math.cos(spin), s = Math.sin(spin), q = (u, v) => at(x, z, y, (u*c-v*s)*r, (u*s+v*c)*r);
  d.path([q(-.55, .6), q(.5, .6), q(.3, -.2), q(0, -.95), q(-.4, -.15), q(-.55, .6)], 0, INK, 1, {fill: true});
  d.path([q(-.32, .4), q(.29, .4), q(.13, -.22), q(0, -.59), q(-.2, -.1)], 0, color, 1, {fill: true});
}

/** Short painted ribbons retain the actual curve even after the wielder changes direction. */
function ribbon(d, points, width, T, back){
  if(points.length < 2) return;
  const color = back ? P.main : SHADE;
  d.path(points, width*1.5, INK, .6, {taper: .95});
  d.path(points, width, color, .95, {taper: .95});
  if(T.glow) d.path(points, width*.4, P.core, .8, {taper: .98});
  if(T.r >= 5){
    const edge = points.map(([x, y, z], i) => [x, y+.12*Math.sin(i/points.length*Math.PI), z+.1]);
    d.path(edge, width*.35, P.alt, .9, {taper: .98});
  }
}

function paintBolt(d, b, owner, ctx){
  if(b.phase === 'windup') return; // Its anticipation is part of the shoulder rig.
  const T = tier(rank(owner)), lead = Math.min(ctx.lead, Math.max(0, b.life-b.age),
    b.phase === 'out' ? Math.max(0, b.reach-b.traveled)/b.speed : Infinity);
  let x = b.x+(b.vx || 0)*lead, z = b.z+(b.vz || 0)*lead;
  // Do not extrapolate through a catch or past the turnaround point.
  if(b.phase === 'back' && owner && Math.hypot(x-b.x, z-b.z) > Math.hypot(owner.x-b.x, owner.z-b.z)){x = owner.x; z = owner.z;}
  if(!d.near(x, z)) return;
  const age = b.age+lead, y = 1.08+Math.sin(age*7)*.08, spin = age*(b.phase === 'hang' ? 7 : 13)*b.side;
  const size = b.size*(b.phase === 'hang' ? 1+Math.sin((b.hangAge+lead)/b.hang*Math.PI)*.12 : 1);
  const head = ctx.rig(b.ownerId), launchAge = age-b.windup;
  if(head && launchAge < .12){const blend = 1-easeOut(launchAge/.12); x += (head.x-x)*blend; z += (head.z-z)*blend;}
  const track = [[x, y, z], ...(b.trail || []).slice().reverse().map(([px, pz]) => [px, y, pz])];
  ribbon(d, T.trail ? track : track.slice(0, 3), .15*b.size, T, b.phase === 'back');
  if(T.r >= 5 && b.phase !== 'hang'){
    const tail = track[Math.min(3, track.length-1)];
    jaw(d, tail[0], tail[2], tail[1], size*.72, spin-.5*b.side, T, {ghost: true});
  }
  if(b.phase === 'back' && owner){
    // A faint, non-damaging thread tells the player which direction moving will steer the return.
    const thread = [];
    for(let i = 0; i <= 20; i++){
      const t = i/20;
      thread.push([x+(owner.x-x)*t, .36+Math.sin(t*Math.PI)*.24, z+(owner.z-z)*t]);
    }
    d.path(thread, .025, P.main, .5);
  }
  jaw(d, x, z, y, size, spin, T, {hot: b.fed});
  if(T.r >= 3){
    for(let i = 0; i < (T.r >= 5 ? 3 : 2); i++){
      const a = spin*.6+i*TAU/3, rr = size*1.18;
      const tip = at(x, z, y, Math.cos(a)*rr, Math.sin(a)*rr);
      tooth(d, tip[0], tip[2], tip[1], .13, T.r >= 5 && i%2 ? P.alt : P.main, a+.5);
    }
  }
  if(b.phase === 'hang'){
    const k = Math.min(1, (b.hangAge+lead)/b.hang);
    d.mark(x, z, size*(1.3-.35*k), .06, P.main, .85, {halo: T.glow ? .15 : 0});
    if(T.sigil) d.sigil(x, z, size, P.main, .7, {spin: -spin*.1, sides: 3, glow: false});
    if(b.feast) for(let i = 0; i < 3; i++){
      const a = i/3*TAU+spin*.15;
      tooth(d, x+Math.cos(a)*size*1.25, z+Math.sin(a)*size*.6, 1.3+k*.5, .22, P.core, a);
    }
  }
  if(T.r >= 4) d.light(x, z, size*1.5);
}

function paintRig(d, world, p, anchor, motion, clock){
  const T = tier(rank(p)), n = charge(p), side = p.dx < -.1 ? -1 : 1;
  const b = (world.magicBolts || []).find(e => e.packId === PACK && e.ownerId === p.id);
  const wind = b?.phase === 'windup' ? Math.min(1, b.age/b.windup) : 0;
  const x = anchor.x+side*(.85-.24*wind)-Math.max(-.15, Math.min(.15, motion.vx*.025));
  const z = anchor.z-.13, y = anchor.y+1.2+Math.sin(clock*2.5)*.07+wind*.4;
  if(!b || b.phase === 'windup'){
    jaw(d, x, z, y, .62+wind*(b?.feast ? .65 : .18), -.25*side+Math.sin(clock*2)*.1-side*wind*1.1, T, {hot: n === 3 || b?.fed});
    if(wind && T.glow) d.bloom(x, z, y, .85*wind, P.glow, .15);
  }
  // Three empty sockets persist while the crescent is away; filled teeth count successful catches.
  for(let i = 0; i < 3; i++){
    const a = -1.1+i*.55, xx = anchor.x+Math.sin(a)*.65, zz = anchor.z-.17, yy = anchor.y+2.08+Math.cos(a)*.12;
    tooth(d, xx, zz, yy, .16, i < n ? n === 3 ? P.main : BONE : '#645769', Math.sin(clock*2+i)*.12);
    if(i < n && T.glow) d.bloom(xx, zz, yy, .18, P.glow, n === 3 ? .23 : .1);
  }
  return {origin: {x, y: 0, z}, keep: {x, z, y}};
}

function paintBite(d, e, owner, ctx){
  const k = (e.age+ctx.lead)/e.life;
  if(k >= 1 || !d.near(e.x, e.z)) return;
  const T = tier(rank(owner)), r = (e.fed ? .8 : .48)*(1-k), seed = seedOf(e.id);
  for(let i = 0; i < 3; i++){
    const a = i/3*TAU+seed, spread = .18+.35*easeOut(k);
    tooth(d, e.x+Math.cos(a)*spread, e.z+Math.sin(a)*spread*.5, .85+k*.5, r*.3, e.back ? P.main : BONE, a+k);
  }
  if(T.r >= 3) d.sparks(e.x, e.z, .8, T.r >= 5 ? 4 : 2, e.age+ctx.lead, e.back ? P.main : BONE, 1, seed,
    {speed: 2.6, up: 1.4, gravity: 6, life: .32, width: .04});
}

function paintCatch(d, ev, age){
  const k = age/.55, T = tier(ev.rank);
  if(k >= 1 || !d.near(ev.x, ev.z)) return;
  const ready = ev.teeth === 3;
  for(let i = 0; i < (ready ? 3 : 1); i++){
    const a = -1+i*.7;
    tooth(d, ev.x+Math.sin(a)*(.35+.5*easeOut(k)), ev.z, 1.4+.6*easeOut(k), .24*fade(k), ready ? P.main : BONE, a);
  }
  if(T.glow) d.mark(ev.x, ev.z, .4+.6*easeOut(k), .05, P.main, fade(k), {halo: .1});
}

/** Two opposing jawbones visibly close before the impact lingers as teeth and a cracked seal. */
function paintSnap(d, ev, age, seed){
  const k = age/1.1, T = tier(ev.rank), R = ev.r || 2.6;
  if(k >= 1 || !d.near(ev.x, ev.z)) return;
  const open = (1-easeOut(age/.18))*R*.35, shrink = fade(Math.max(0, age-.18)/.5);
  if(shrink > .01){
    jaw(d, ev.x-open, ev.z, 1.15, R*.62*shrink, 0, T, {hot: true});
    jaw(d, ev.x+open, ev.z, 1.15, R*.62*shrink, Math.PI, T, {hot: true});
  }
  d.mark(ev.x, ev.z, R*easeOut(age/.2), .1, P.main, fade(k), {halo: T.glow ? .2 : 0});
  if(T.r >= 3) d.mark(ev.x, ev.z, R*.8*easeOut(age/.3), .045, BONE, fade(k), {halo: 0});
  for(let i = 0; i < (T.r >= 5 ? 9 : 6); i++){
    const a = i/(T.r >= 5 ? 9 : 6)*TAU, rr = R*(.35+.7*easeOut(k));
    tooth(d, ev.x+Math.cos(a)*rr, ev.z+Math.sin(a)*rr, .25+Math.sin(k*Math.PI)*.8, .3*fade(k), T.r >= 5 && i%2 ? P.alt : BONE, a+age);
  }
  if(T.r >= 3) d.sparks(ev.x, ev.z, 1, Math.min(12, T.sparks), age, P.main, 1, seed, {speed: 4.4, up: 3, gravity: 8, life: .65});
  if(T.sigil){
    d.sigil(ev.x, ev.z, R*.78, P.deep, fade(k), {spin: .4, sides: 3, glow: false});
    d.debris(ev.x, ev.z, 5, age, SHADE, seed, {speed: 3, up: 3, gravity: 10, size: .09, life: .7});
  }
  if(T.r >= 5) d.ring(ev.x, ev.z, R*(.55+.65*easeOut(k)), .07, P.alt, fade(k), {glow: false});
  if(T.glow) d.light(ev.x, ev.z, R*fade(k));
}

export const MOON_MAW_FX = {
  id: PACK,
  magicCast: false,
  rig: paintRig,
  lists: {magicBolts: paintBolt, magicPuffs: paintBite},
  events: {
    mooncast: {life: () => .01, paint(){}},
    mooncatch: {life: () => .55, paint: paintCatch},
    moonsnap: {life: () => 1.1, paint: paintSnap,
      kick: ev => {const T = tier(ev.rank); return {shake: T.r >= 4 ? T.shake*.65 : 0, flash: T.r >= 5 ? .12 : 0, color: P.main};}},
    'fx:moonfeast': {life: () => .35, paint(d, ev, age){
      if(!d.near(ev.x, ev.z)) return;
      const T = tier(ev.rank), k = age/.35;
      d.mark(ev.x, ev.z, .4+1.1*easeOut(k), .07, P.main, fade(k), {halo: T.glow ? .15 : 0});
    }},
  },
  skillCast(d, cast, owner, age){
    if(age >= .5 || !d.near(cast.x, cast.z)) return;
    const T = tier(cast.rank), k = age/.5;
    for(let i = 0; i < 3; i++){
      const a = i/3*TAU+k*2, r = 1.2*(1-easeOut(k));
      tooth(d, cast.x+Math.cos(a)*r, cast.z+Math.sin(a)*r, 1+.4*bump(k), .25*fade(k), i < charge(owner) ? P.main : BONE, a);
    }
    if(T.sigil) d.sigil(cast.x, cast.z, 1.4, P.main, fade(k), {spin: -age*2, sides: 3, glow: false});
  },
};
