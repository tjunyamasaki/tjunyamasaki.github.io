// The Green Dragon guandao (an epic polearm of the Shrine of Yomi). Every attack is a wide crescent sweep
// in front of you, and the haft slides through your hands as you hold your line: cut again within a few
// seconds, aimed the same way (within HOLD degrees), and the reach grows, three steps from 3 to 6.3 units,
// hitting harder each step. Turn and it shortens back. At full reach the blade's edge echoes: the crescent
// cuts the ground again a beat later where it fell. The sweep also cuts enemy shots out of the air.
// Skill, Green Dragon Unbound: for a few seconds the dragon wakes in the blade, every sweep at its longest
// with two echoes; when it leaves, it rushes out along your last cut through everything in its way.
// Sweeps are world.magicSweeps entries (snapshotted; their centre is ox/oz, not x/z, so no sprite is drawn for them); the line state lives on the wielder (`p.gdStage`,
// `p.gdAng`, `p.gdAt`, `p.gdSide`, `p.gdDragon`), so guests and saves carry it. Drawing: src/fx/guandao.mjs.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'guandao';
export const CRESCENT = Object.freeze({
  damage: 13, cooldown: .82, stamina: 9, arc: 150, inner: .3,
  reach: Object.freeze([3, 4.1, 5.2, 6.3]), gain: Object.freeze([1, 1.15, 1.3, 1.5]),
  hold: 40,           // degrees: a cut aimed within this of the last keeps the line
  window: 2.4,        // seconds a line waits for its next cut
  echo: .34, echoShare: .6, life: .42,
});
export const DRAGON = Object.freeze({secs: 4.5, reach: 7.4, gain: 1.55, echoes: 2, rush: 12, width: 1.9});
const TAU = Math.PI*2;

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Green Dragon guandao', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: CRESCENT.damage, durability: 260, cooldown: CRESCENT.cooldown, stamina: CRESCENT.stamina,
    blurb: 'A crescent sweep whose reach grows while you hold your line: three cuts the same way and the haft runs out to twice its length, its edge echoing. Turn, and it shortens. It cuts arrows and orbs out of the air.',
  },
  mobs: [],
  sprites: {
    item: {src: 'assets/magic/guandao/item.svg', icon: 'assets/magic/guandao/icon.svg',
      size: [1.1, 1.65], anchor: [.5, .04], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

const hostiles = world => {
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.hp > 0 && !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
};
const bodyOf = e => e.type === 'king' || e.boss ? 1.3 : e.type === 'golem' || e.type === 'brute' ? 1 : .55;
const angleDelta = (a, b) => {let d = (a-b)%TAU; if(d > Math.PI) d -= TAU; if(d < -Math.PI) d += TAU; return d;};
const round = n => Math.round(n*1000)/1000;
function hurt(world, e, amount, ownerId){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId});
  e.lastHitBy = ownerId; if(e.home && !e.aggro) e.aggro = true;
}
/** True when (x, z) lies in the crescent of a sweep. */
function inCrescent(s, x, z, pad = 0){
  const dx = x-s.ox, dz = z-s.oz, d = Math.hypot(dx, dz);
  if(d > s.r+pad || d < CRESCENT.inner) return false;
  return Math.abs(angleDelta(Math.atan2(dz, dx), s.ang)) <= s.arc*Math.PI/360+pad/Math.max(1, d);
}
/** Cut whatever stands in the crescent now. Returns how many it struck. */
function cut(world, s, share = 1){
  let n = 0;
  for(const e of hostiles(world)) if(inCrescent(s, e.x, e.z, bodyOf(e)*.8)){hurt(world, e, s.dmg*share, s.ownerId); n++;}
  return n;
}
/** The edge cuts enemy shots out of the air (not ground blasts or lobbed spores). */
function parry(world, s){
  const list = world.hostile; if(!list?.length) return 0;
  let n = 0;
  for(const shot of list) if(shot.kind !== 'blast' && shot.kind !== 'spore' && !shot.done && inCrescent(s, shot.x, shot.z, .3)){shot.done = true; n++;}
  if(n) world.hostile = list.filter(shot => !shot.done);
  return n;
}

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || !weapon || weapon.itemId !== PACK || !(weapon.durability > 0) ||
    player.down || player.ghost || player.online === false || player.cooldown > .05 ||
    !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const length = Math.hypot(player.dx || 0, player.dz || 0);
  const dx = length > 1e-6 ? player.dx/length : 0, dz = length > 1e-6 ? player.dz/length : 1;
  const power = ownerPower(world, player), ang = Math.atan2(dz, dx), now = world.time || 0;
  // Holding the line: the same way again, soon enough, and the haft runs out one more step.
  const held = Number.isFinite(player.gdAng) && now-(player.gdAt ?? -99) < CRESCENT.window && Math.abs(angleDelta(ang, player.gdAng)) <= CRESCENT.hold*Math.PI/180;
  const stage = held ? Math.min(3, (player.gdStage || 0)+1) : 0;
  const dragon = player.gdDragon > now;
  const r = dragon ? DRAGON.reach : CRESCENT.reach[stage], gain = dragon ? DRAGON.gain : CRESCENT.gain[stage];
  const side = player.gdSide === 1 ? -1 : 1;
  const sweep = {id: world.nextId('gd'), packId: PACK, ownerId: player.id, ox: round(player.x), oz: round(player.z), ang: round(ang), arc: CRESCENT.arc,
    r, stage: dragon ? 4 : stage, side, age: 0, life: CRESCENT.life, delay: 0, dmg: round(CRESCENT.damage*gain*power)};
  (world.magicSweeps ||= []).push(sweep);
  cut(world, sweep);
  const parried = parry(world, sweep);
  // At full reach the edge echoes where it fell (twice while the dragon is awake).
  const echoes = dragon ? DRAGON.echoes : stage >= 3 ? 1 : 0;
  for(let k = 1; k <= echoes; k++) world.magicSweeps.push({...sweep, id: world.nextId('gd'), echo: k, delay: CRESCENT.echo*k, fired: false, side: -sweep.side*(k%2 ? 1 : -1)});
  player.gdStage = stage; player.gdAng = round(ang); player.gdAt = round(now); player.gdSide = side;
  world.wearEquipped(player, 'weapon', 1);
  player.dx = dx; player.dz = dz; player.rest = false;
  player.cooldown = CRESCENT.cooldown;
  player.action = 'attack'; player.actionUntil = now+.5;
  world.event('gdcut', player.x, player.z, '', {player: player.id, itemId: PACK, stage: sweep.stage, angle: sweep.ang, r, parried});
  return sweep;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  const list = world.magicSweeps;
  if(!list?.some(s => s.packId === PACK)) return;
  for(let i = list.length-1; i >= 0; i--){
    const s = list[i];
    if(s.packId !== PACK) continue;
    s.age += dt;
    if(s.delay > 0 && !s.fired && s.age >= s.delay){
      s.fired = true;
      cut(world, s, CRESCENT.echoShare);
      parry(world, s);
      world.event('gdecho', s.ox, s.oz, '', {player: s.ownerId, itemId: PACK, angle: s.ang, r: s.r});
    }
    if(s.age >= s.delay+s.life) list.splice(i, 1);
  }
}

/** Skill: the dragon wakes in the blade (SKILL_CALLS.dragonwake). */
export function wakeDragon(world, owner, secs = DRAGON.secs){
  owner.gdDragon = round((world.time || 0)+secs);
  owner.gdStage = 3; owner.gdAt = round(world.time || 0);
  if(!Number.isFinite(owner.gdAng)) owner.gdAng = round(Math.atan2(owner.dz || 1, owner.dx || 0));
  return {secs};
}
/** Skill climax: the dragon leaves the blade and rushes along the last cut (SKILL_CALLS.dragonrush). */
export function dragonRush(world, owner, damage){
  const ang = Number.isFinite(owner.gdAng) ? owner.gdAng : Math.atan2(owner.dz || 1, owner.dx || 0);
  const ca = Math.cos(ang), sa = Math.sin(ang), x0 = owner.x, z0 = owner.z;
  let n = 0;
  for(const e of hostiles(world)){
    const along = (e.x-x0)*ca+(e.z-z0)*sa, across = Math.abs(-(e.x-x0)*sa+(e.z-z0)*ca);
    if(along > -.5 && along < DRAGON.rush+bodyOf(e) && across < DRAGON.width/2+bodyOf(e)*.7){hurt(world, e, damage, owner.id); n++;}
  }
  owner.gdDragon = 0;
  return {x0: round(x0), z0: round(z0), angle: round(ang), len: DRAGON.rush, w: DRAGON.width, struck: n};
}
