// What every class module needs from the host sim (src/classes/ronin.mjs, general.mjs, daoshi.mjs): foes,
// hits through world.pendingHit (so kill credit, refinement and the lab meter work), aiming, a pose, and the
// class resource. The resource lives on the wanderer as `p.ki` whatever its name (Ki, Qi, Ink), with
// `p.kiAt` the last time it grew; it fades after a while without growing.
import {isMagicAlly} from '../magic/registry.mjs?v=harvest-18';
import {classOf, talentRank} from './registry.mjs?v=harvest-18';

export const TAU = Math.PI*2;
export const round = n => Math.round(n*100)/100;
export const R = (p, id) => talentRank(p, id);
export const pct = n => `${Math.round(n*100)}%`;

export const hostiles = world => {
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.hp > 0 && !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
};
export const bodyOf = e => e.type === 'king' || e.boss ? 1.3 : e.type === 'golem' || e.type === 'brute' ? 1 : .55;
export const bossy = e => e.type === 'king' || !!e.boss || e.type === 'golem';
export const dist = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
export function hurt(world, e, amount, ownerId){
  if(!(amount > 0)) return;
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId});
  e.lastHitBy = ownerId; if(e.home && !e.aggro) e.aggro = true;
}
/** Distance from a point to the segment (x0, z0)-(x1, z1). */
export function segGap(x, z, x0, z0, x1, z1){
  const sx = x1-x0, sz = z1-z0, l2 = sx*sx+sz*sz || 1e-9, t = Math.max(0, Math.min(1, ((x-x0)*sx+(z-z0)*sz)/l2));
  return Math.hypot(x-(x0+sx*t), z-(z0+sz*t));
}
/** Face the best foe within reach (or keep facing); the unit direction. */
export function aim(world, p, reach){
  world.autoAim?.(p, {reach, range: reach});
  const l = Math.hypot(p.dx || 0, p.dz || 0);
  if(l > 1e-6){p.dx /= l; p.dz /= l;} else {p.dx = 0; p.dz = 1;}
  return [p.dx, p.dz];
}
/** The locked foe within reach, else a point ahead: where a skill lands. */
export function mark(world, p, reach, ahead = reach*.5){
  const [dx, dz] = aim(world, p, reach);
  const locked = hostiles(world).find(e => e.id === p.lockId && dist(e, p) <= reach);
  let x = locked ? locked.x : p.x+dx*ahead, z = locked ? locked.z : p.z+dz*ahead;
  const lim = (world.radius || 60)-3, r = Math.hypot(x, z);
  if((world.arena || world.showcase) && r > lim){x *= lim/r; z *= lim/r;}
  return {x: round(x), z: round(z), foe: locked || null, dx, dz};
}
/** Strike a pose for `secs`; `itemId` stamps the cast so the held weapon swings (its rig/pose follows). */
export function pose(world, p, secs, itemId = null){
  p.rest = false; p.goal = null;
  p.action = 'attack'; p.actionUntil = world.time+secs; p.aimUntil = world.time+secs;
  p.cooldown = Math.max(p.cooldown || 0, Math.min(.3, secs));
  if(itemId) p.magicCast = {itemId, at: world.time, x: p.x, z: p.z, dx: p.dx, dz: p.dz};
}
/** Grow the class resource by n (scaled by `gainMult`), up to the class's max. */
export function gain(world, p, n, gainMult = 1){
  if(!(n > 0)) return;
  const max = classOf(p)?.resource?.max || 100;
  p.ki = Math.min(max, round((p.ki || 0)+n*gainMult));
  p.kiAt = world.time;
}
/** The resource fades once it has not grown for `idle` seconds. */
export function fadeResource(world, p, dt, idle = 5, rate = 6){
  if(!Number.isFinite(p.ki)) p.ki = 0;
  if(p.ki > 0 && world.time-(p.kiAt ?? -99) > idle) p.ki = Math.max(0, round(p.ki-rate*dt));
}
/** A weapon's rank (★, its flourish and a little damage) grows with the wanderer's level: ★1 to ★5. */
export const rankByLevel = (p, every = 6) => Math.min(5, 1+Math.floor(((p.level || 1)-1)/every));
/** Move a foe toward (tx, tz) at `speed`, through the same collision as walking. True once it arrives. */
export function drag(world, e, tx, tz, speed, dt, obstacles){
  const d = Math.hypot(tx-e.x, tz-e.z);
  if(d <= .12) return true;
  const go = Math.min(d, speed*dt);
  for(let k = 0; k < 3; k++) world.move(e, (tx-e.x)/Math.max(d, 1e-6)*go/dt, (tz-e.z)/Math.max(d, 1e-6)*go/dt, dt/3, obstacles);
  return Math.hypot(tx-e.x, tz-e.z) <= .12;
}
