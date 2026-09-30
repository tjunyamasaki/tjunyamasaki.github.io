// The Hollow Moon: a little dead moon with a hollow face circles the wielder. Each attack throws it; it
// hangs over the mark as a gravity well, its mouth open, dragging foes in and grinding them, then it
// swallows (the crush) and drifts home, where it can be thrown again straight out of its return.
// Every throw waxes it one phase (new, crescent, half, full) and a kill inside the well waxes it once
// more; the full moon's well is wider, pulls harder and its crush stuns. Then it is new again.
// Eclipse (skill) sends it to the mark as a giant full moon that drags in everything around, goes
// black, and bursts in a supernova; it comes home full.
// Host only. The moon lives on the wielder as `p.hollowMoon` (players replicate and save whole):
// {state, t, x, z, phase, thrown, fx, fz, tx, tz, bx, bz, r, tick, held, waxed, waxAt, power, ...}.
// src/fx/hollow-moon.mjs draws it.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';
import {stun} from '../arsenal.mjs?v=harvest-18';

const PACK = 'hollow-moon';
export const MOON = Object.freeze({
  damage: 18, cooldown: 1.6, stamina: 10, range: 9, ahead: 5,
  orbit: 1.05, spin: 1.7,              // orbit radius round the wielder; radians per second
  fly: .3, hold: 1, back: .35,         // throw flight, well, and the drift home (seconds)
  land: 1.2, landShare: .6,            // foes right under it when it arrives take a thud
  every: .25, tickShare: .3,           // the well grinds whatever it holds
  core: .45, extra: .1, extraCap: 5,   // foes this close stop sliding; each extra foe caught adds 10% to the crush
});
/** The four phases, as thrown: well radius, pull (units a second at the rim), crush (hits), stun. */
export const PHASES = Object.freeze([
  Object.freeze({name: 'new', lit: .1, r: 2.1, pull: 3, crush: 1.5, stun: 0}),
  Object.freeze({name: 'crescent', lit: .32, r: 2.4, pull: 3.4, crush: 1.7, stun: 0}),
  Object.freeze({name: 'half', lit: .55, r: 2.7, pull: 3.8, crush: 1.9, stun: 0}),
  Object.freeze({name: 'full', lit: 1, r: 3.4, pull: 4.8, crush: 2.8, stun: .6}),
]);
/** Eclipse: rise to the mark, pull everything in, go dark, then the nova. */
export const ECLIPSE = Object.freeze({rise: .45, pull: 1.6, dark: .35, r: 6.5, drag: 6, every: .25, nova: 5.5, stun: 1, reach: 10});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Hollow Moon', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: MOON.damage, durability: 240, cooldown: MOON.cooldown, stamina: MOON.stamina,
    blurb: 'A dead moon circles you. Throw it and it hangs over your mark, dragging foes in and swallowing them. Each throw waxes it toward full; a full moon crushes and stuns.',
  },
  mobs: [],
  sprites: {
    item: {src: `assets/magic/${PACK}/item.svg`, icon: `assets/magic/${PACK}/icon.svg`,
      size: [1.4, 1.8], anchor: [.5, .42], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

const round = n => Math.round(n*100)/100;
const bodyOf = e => e.type === 'king' ? 1.2 : e.type === 'golem' || e.type === 'brute' ? .9 : .5;
const heft = e => e.type === 'king' || e.type === 'golem' ? .35 : e.type === 'brute' ? .7 : 1;
/** Where the moon circles, round (x, z) at `time`: shared by the host and the rig so a throw starts where it is drawn. */
export const orbitAngle = (p, time) => (time || 0)*MOON.spin+(String(p?.id ?? '').length*1.7);
export function orbitPoint(p, time, x = p.x, z = p.z){
  const a = orbitAngle(p, time);
  return {x: x+Math.cos(a)*MOON.orbit, z: z+Math.sin(a)*MOON.orbit*.8};
}

/** Throw: the moon leaves its orbit (or its way home) for the mark. */
export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || weapon?.itemId !== PACK || !(weapon.durability > 0) || player.down || player.ghost || player.online === false ||
    player.cooldown > .05 || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const m = ready(world, player);
  if(m.state !== 'orbit' && m.state !== 'back') return null;
  const l = Math.hypot(player.dx || 0, player.dz || 0), dx = l > 1e-6 ? player.dx/l : 0, dz = l > 1e-6 ? player.dz/l : 1;
  const lock = (world.enemies || []).find(e => e.id === player.lockId && e.hp > 0 && !isMagicAlly(e) &&
    Math.hypot(e.x-player.x, e.z-player.z) <= MOON.range+1);
  let tx = lock ? lock.x : player.x+dx*MOON.ahead, tz = lock ? lock.z : player.z+dz*MOON.ahead;
  [tx, tz] = inside(world, tx, tz);
  const phase = PHASES[m.phase] ? m.phase : 0;
  Object.assign(m, {state: 'fly', t: 0, thrown: phase, fx: round(m.x), fz: round(m.z), tx: round(tx), tz: round(tz),
    r: PHASES[phase].r, tick: 0, held: [], waxed: 0, power: round(ownerPower(world, player))});
  m.phase = (phase+1)%PHASES.length;
  world.wearEquipped(player, 'weapon', 1);
  player.dx = dx; player.dz = dz; player.rest = false;
  player.cooldown = MOON.cooldown;
  player.action = 'attack'; player.actionUntil = world.time+.35;
  world.event('lunarthrow', player.x, player.z, '', {player: player.id, itemId: PACK, phase, tx: m.tx, tz: m.tz});
  return m;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  let foes = null;
  for(const p of world.players || []){
    const w = p.equipment?.weapon;
    if(w?.itemId !== PACK || !(w.durability > 0) || p.ghost || p.online === false){if(p.hollowMoon) p.hollowMoon = null; continue;}
    if(!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const m = ready(world, p);
    m.t += dt;
    if(m.state === 'orbit'){const o = orbitPoint(p, world.time); m.x = round(o.x); m.z = round(o.z); continue;}
    foes ||= hostiles(world);
    if(m.state === 'eclipse') eclipse(world, p, m, dt, foes);
    else if(m.state === 'fly') fly(world, p, m, foes);
    else if(m.state === 'well') well(world, p, m, dt, foes);
    else if(m.state === 'back') home(world, p, m, foes);
    else m.state = 'orbit';
  }
}

/** Eclipse (SKILL_CALLS.eclipse): the rest runs from step(). */
export function beginEclipse(world, owner, b){
  const w = owner?.equipment?.weapon;
  if(w?.itemId !== PACK || !(w.durability > 0)) return null;
  const m = ready(world, owner);
  const [tx, tz] = inside(world, b.tx ?? owner.x, b.tz ?? owner.z);
  Object.assign(m, {state: 'eclipse', t: 0, fx: round(m.x), fz: round(m.z), tx: round(tx), tz: round(tz), r: ECLIPSE.r,
    tick: 0, held: [], nova: 0, ticks: b.tick || 0, blast: b.blast || 0});
  return {tx: m.tx, tz: m.tz, r: ECLIPSE.r};
}

function ready(world, p){
  const m = p.hollowMoon;
  if(m && typeof m === 'object' && Number.isFinite(m.x) && Number.isFinite(m.z) && m.state) return m;
  const o = orbitPoint(p, world.time);
  return (p.hollowMoon = {state: 'orbit', t: 0, x: round(o.x), z: round(o.z), phase: Number.isInteger(m?.phase) ? m.phase%PHASES.length : 0,
    thrown: 0, fx: 0, fz: 0, tx: 0, tz: 0, bx: 0, bz: 0, r: 0, tick: 0, held: [], waxed: 0, waxAt: -9, power: 1});
}

function fly(world, p, m, foes){
  const u = Math.min(1, m.t/MOON.fly);
  m.x = round(m.fx+(m.tx-m.fx)*u); m.z = round(m.fz+(m.tz-m.fz)*u);
  if(u < 1) return;
  m.state = 'well'; m.t = 0; m.tick = 0;
  for(const e of foes) if(Math.hypot(e.x-m.x, e.z-m.z) <= MOON.land+bodyOf(e)*.5) harm(world, p, e, MOON.damage*MOON.landShare*m.power);
}

function well(world, p, m, dt, foes){
  const P = PHASES[m.thrown] || PHASES[0];
  const caught = pull(world, m, foes, m.r, P.pull, dt);
  feed(world, m, foes);
  m.held = caught.map(e => e.id);
  m.tick += dt;
  while(m.tick >= MOON.every && m.t < MOON.hold){
    m.tick -= MOON.every;
    for(const e of caught) harm(world, p, e, MOON.damage*MOON.tickShare*m.power);
  }
  if(m.t < MOON.hold) return;
  // The crush: the mouth snaps shut on everything still in the well.
  const n = caught.length, boost = 1+MOON.extra*Math.min(MOON.extraCap, Math.max(0, n-1));
  for(const e of caught){
    harm(world, p, e, MOON.damage*P.crush*boost*m.power);
    if(P.stun) stun(e, P.stun);
  }
  world.event('lunarcrush', m.x, m.z, '', {player: p.id, itemId: PACK, phase: m.thrown, r: round(m.r), n});
  // `held` stays for one more step: foes the crush kills still feed the moon (see home()).
  m.state = 'back'; m.t = 0; m.bx = m.x; m.bz = m.z; m.high = 0;
}

/** A foe that dies in the well (or in its crush) feeds the moon: one extra phase per throw. */
function feed(world, m, foes){
  if(m.waxed || !m.held?.length || !m.held.some(id => !foes.some(e => e.id === id))) return;
  m.waxed = 1; m.waxAt = round(world.time);
  m.phase = Math.min(PHASES.length-1, m.phase+1);
}

function home(world, p, m, foes){
  if(m.held?.length){feed(world, m, foes); m.held = [];}
  const u = Math.min(1, m.t/MOON.back), o = orbitPoint(p, world.time), s = 1-(1-u)**2;
  m.x = round(m.bx+(o.x-m.bx)*s); m.z = round(m.bz+(o.z-m.bz)*s);
  if(u >= 1){m.state = 'orbit'; m.t = 0;}
}

function eclipse(world, p, m, dt, foes){
  const E = ECLIPSE, rise = m.t < E.rise, end = E.rise+E.pull+E.dark;
  if(rise){
    const u = Math.min(1, m.t/E.rise), s = 1-(1-u)**2;
    m.x = round(m.fx+(m.tx-m.fx)*s); m.z = round(m.fz+(m.tz-m.fz)*s);
    return;
  }
  m.x = m.tx; m.z = m.tz;
  const caught = pull(world, m, foes, E.r, E.drag, dt);
  m.held = caught.slice(0, 16).map(e => e.id);
  if(m.t < E.rise+E.pull){
    m.tick += dt;
    while(m.tick >= E.every){m.tick -= E.every; for(const e of caught) harm(world, p, e, m.ticks);}
  }
  if(m.t < end) return;
  // Supernova: everything near the moon, hardest at its heart.
  for(const e of foes){
    const d = Math.hypot(e.x-m.x, e.z-m.z);
    if(!(e.hp > 0) || d > E.nova+bodyOf(e)*.5) continue;
    harm(world, p, e, m.blast*(1-.3*Math.min(1, d/E.nova)));
    stun(e, E.stun);
  }
  world.event('lunarnova', m.x, m.z, '', {player: p.id, itemId: PACK, r: E.nova});
  // It comes home full.
  m.phase = PHASES.length-1; m.waxAt = round(world.time); m.waxed = 1;
  m.state = 'back'; m.t = 0; m.bx = m.x; m.bz = m.z; m.held = []; m.high = 1;
}

/** Drag every foe in the well toward its heart; returns those inside. */
function pull(world, m, foes, r, speed, dt){
  const obstacles = world.frameObstacles || world.obstacles?.() || null, inside = [];
  for(const e of foes){
    if(!(e.hp > 0)) continue;
    const dx = m.x-e.x, dz = m.z-e.z, d = Math.hypot(dx, dz);
    if(d > r+bodyOf(e)*.5) continue;
    inside.push(e);
    if(d <= MOON.core) continue;
    // Gravity: stronger toward the heart. Never past it.
    const v = speed*heft(e)*(.55+.45*(1-Math.min(1, d/r))), step = Math.min(v*dt, d-MOON.core);
    world.move(e, dx/d*step/dt, dz/d*step/dt, dt, obstacles);
    if(e.home && !e.aggro) e.aggro = true;
  }
  return inside;
}

/** Keep a mark inside the arena ring (arena and showcase have walls at their edge). */
function inside(world, x, z){
  const R = (world.radius || 60)-1.4, r = Math.hypot(x, z);
  return (world.arena || world.showcase) && r > R ? [x*R/r, z*R/r] : [x, z];
}

function harm(world, p, e, amount){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId: p.id});
  e.lastHitBy = p.id;
  if(e.home && !e.aggro) e.aggro = true;
}

function hostiles(world){
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.id != null && e.hp > 0 &&
    !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
}
