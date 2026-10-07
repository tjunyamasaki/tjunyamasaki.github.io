// The Gashadokuro's Hand (a legendary, the signature spoil of the Gashadokuro, bosses.mjs): the great
// skeleton's own hand, hovering at your shoulder. Every attack it reaches out, grabs a foe and hurls it into
// the others: the thrown foe flies at the thickest knot of foes nearby, striking everything on its way, and
// lands with a crash that hurts all round (itself too). Great foes cannot be lifted: they take a heavy slap.
// Rhythm, hunger: every foe thrown feeds the hand; at HAND.hunger the next grab takes a fistful (the mark and
// every foe close beside it) and hurls them together.
// Skill, Bone Avalanche: the hand grows huge, scoops up every foe in a wide arc in front of you, packs them
// into a ball of bones and sends it rolling: it gathers up whatever it rolls over and bursts at the end.
// Grabs and the ball are world.magicSweeps entries (snapshotted; placed by ox/oz, hx/hz, bx/bz, never x/z, so no
// sprite is drawn for them); hunger lives on the wielder (`p.odkHunger`).
// A held foe is stunned (World.tickRoot keeps it still) while this module carries it. Drawing: src/fx/odokuro.mjs.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'odokuro';
export const HAND = Object.freeze({
  damage: 26, cooldown: .95, stamina: 11, reach: 6.5, grab: .2, flight: .5, toss: 8.5, arc: 2.6, squeeze: .5,
  path: .5, near: .95, crash: 2.1, crashShare: .8, hurled: 1, slap: 2.2, hunger: 3, fistful: 1.9, most: 5, alone: 2.2,
});
export const AVALANCHE = Object.freeze({radius: 7.5, arc: 170, gather: .45, speed: 11, len: 11, pick: 1.6, burst: 3.4, most: 14});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Gashadokuro’s Hand', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: HAND.damage, durability: 340, cooldown: HAND.cooldown, stamina: HAND.stamina,
    blurb: 'The great skeleton’s hand floats at your shoulder. It grabs a foe and hurls it into the others; every throw feeds it, and the hungry hand takes a fistful.',
  },
  mobs: [],
  sprites: {
    item: {src: 'assets/magic/odokuro/item.svg', icon: 'assets/magic/odokuro/icon.svg',
      size: [1.3, 1.95], anchor: [.5, .04], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

const hostiles = world => {
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.hp > 0 && !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
};
const bodyOf = e => e.type === 'king' || e.boss ? 1.3 : e.type === 'golem' || e.type === 'brute' ? 1 : .55;
/** Too heavy to lift: great bosses, the Hollow King, golems. */
const heavy = e => !!(e.boss || e.type === 'king' || e.type === 'golem' || e.type === 'briarmother' || e.type === 'unblinking' || e.type === 'gashadokuro');
const round = n => Math.round(n*1000)/1000;
function hurt(world, e, amount, ownerId){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId});
  e.lastHitBy = ownerId; if(e.home && !e.aggro) e.aggro = true;
}
const hold = (e, secs) => {e.stunned = Math.max(e.stunned || 0, secs); e.windup = 0; e.act = 0; e.vx = e.vz = 0;};

/** Where to throw a foe: the spot near it with the most other foes round it, or straight on along the aim. */
function aimThrow(foes, held, from, dx, dz){
  let best = null, score = 0;
  for(const c of foes){
    if(held.has(c.id) || Math.hypot(c.x-from.x, c.z-from.z) > HAND.toss || Math.hypot(c.x-from.x, c.z-from.z) < 1.4) continue;
    let n = 0; for(const o of foes) if(!held.has(o.id) && Math.hypot(o.x-c.x, o.z-c.z) < 2.2) n++;
    const s = n+.05*Math.hypot(c.x-from.x, c.z-from.z);
    if(s > score){score = s; best = c;}
  }
  // Nobody to throw it into: the hand slams it down just in front of where it was grabbed.
  return best ? {x: best.x, z: best.z} : {x: from.x+dx*HAND.alone, z: from.z+dz*HAND.alone};
}

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || !weapon || weapon.itemId !== PACK || !(weapon.durability > 0) ||
    player.down || player.ghost || player.online === false || player.cooldown > .05 ||
    !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const length = Math.hypot(player.dx || 0, player.dz || 0);
  const dx = length > 1e-6 ? player.dx/length : 0, dz = length > 1e-6 ? player.dz/length : 1;
  const power = ownerPower(world, player), foes = hostiles(world);
  let target = null, best = Infinity;
  for(const e of foes){
    const ex = e.x-player.x, ez = e.z-player.z, d = Math.hypot(ex, ez); if(d > HAND.reach+bodyOf(e)) continue;
    const s = d*(1.25-.25*(d > 1e-6 ? (ex*dx+ez*dz)/d : 1));
    if(s < best){best = s; target = e;}
  }
  const hunger = Math.max(0, Math.min(HAND.hunger, player.odkHunger | 0)), fistful = hunger >= HAND.hunger;
  const reach = target ? {x: target.x, z: target.z} : {x: player.x+dx*HAND.reach*.7, z: player.z+dz*HAND.reach*.7};
  const grab = {id: world.nextId('odk'), packId: PACK, ownerId: player.id, kind: 'grab', ox: round(player.x), oz: round(player.z),
    hx: round(reach.x), hz: round(reach.z), age: 0, life: HAND.grab+HAND.flight+.35, power, dmg: round(HAND.damage*power), fistful,
    ids: [], from: [], to: null, hits: [], slap: false, landed: false};
  if(target){
    if(heavy(target)){
      // Too heavy: a slap instead, the hand's whole weight behind it.
      grab.slap = true; grab.ids = [target.id];
    }else{
      const held = fistful ? foes.filter(e => !heavy(e) && Math.hypot(e.x-target.x, e.z-target.z) < HAND.fistful).sort((a, b) => Math.hypot(a.x-target.x, a.z-target.z)-Math.hypot(b.x-target.x, b.z-target.z)).slice(0, HAND.most) : [target];
      if(!held.includes(target)) held.unshift(target);
      for(const e of held){hold(e, HAND.grab+HAND.flight+.2); grab.ids.push(e.id); grab.from.push([round(e.x-target.x), round(e.z-target.z)]);}
      // The grip itself bites.
      hurt(world, target, grab.dmg*HAND.squeeze, player.id);
      const to = aimThrow(foes, new Set(grab.ids), target, dx, dz);
      grab.sx = round(target.x); grab.sz = round(target.z); grab.to = [round(to.x), round(to.z)];
      player.odkHunger = fistful ? 0 : hunger+1;
    }
  }
  (world.magicSweeps ||= []).push(grab);
  world.wearEquipped(player, 'weapon', 1);
  player.dx = dx; player.dz = dz; player.rest = false;
  player.cooldown = HAND.cooldown;
  player.action = 'attack'; player.actionUntil = (world.time || 0)+.45;
  world.event('odkgrab', player.x, player.z, '', {player: player.id, itemId: PACK, fistful, n: grab.ids.length});
  return grab;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  const list = world.magicSweeps;
  if(!list?.some(s => s.packId === PACK)) return;
  const foes = hostiles(world);
  for(let i = list.length-1; i >= 0; i--){
    const s = list[i];
    if(s.packId !== PACK) continue;
    s.age += dt;
    if(s.kind === 'ball') stepBall(world, s, foes, dt);
    else stepGrab(world, s, foes);
    if(s.age >= s.life) list.splice(i, 1);
  }
}

function stepGrab(world, s, foes){
  if(s.slap){
    if(!s.landed && s.age >= HAND.grab){
      s.landed = true;
      const e = foes.find(f => f.id === s.ids[0]);
      if(e){hurt(world, e, s.dmg*HAND.slap, s.ownerId); e.stunned = Math.max(e.stunned || 0, .35); e.windup = 0;}
      world.event('odkslap', s.hx, s.hz, '', {player: s.ownerId, itemId: PACK});
    }
    return;
  }
  if(!s.to || s.landed || s.age < HAND.grab) return;
  // In flight: the held foes ride an arc from where they were grabbed to where they are thrown.
  const k = Math.min(1, (s.age-HAND.grab)/HAND.flight), cx = s.sx+(s.to[0]-s.sx)*k, cz = s.sz+(s.to[1]-s.sz)*k;
  s.cx = round(cx); s.cz = round(cz); s.k = round(k);
  const held = new Set(s.ids);
  s.ids.forEach((id, j) => {
    const e = foes.find(f => f.id === id); if(!e) return;
    const [ox, oz] = s.from[j] || [0, 0], tight = 1-.5*k;
    e.x = round(cx+ox*tight); e.z = round(cz+oz*tight); e.vx = e.vz = 0; hold(e, .2);
  });
  // Whatever the flying foes pass through is struck, once.
  for(const e of foes){
    if(held.has(e.id) || s.hits.includes(e.id)) continue;
    if(Math.hypot(e.x-cx, e.z-cz) < HAND.near+bodyOf(e)*.5){s.hits.push(e.id); hurt(world, e, s.dmg*HAND.path, s.ownerId);}
  }
  if(k >= 1){
    s.landed = true;
    for(const e of foes) if(Math.hypot(e.x-cx, e.z-cz) < HAND.crash+bodyOf(e)*.5) hurt(world, e, s.dmg*(held.has(e.id) ? HAND.hurled : HAND.crashShare), s.ownerId);
    for(const id of s.ids){const e = foes.find(f => f.id === id); if(!e) continue; e.stunned = Math.max(e.stunned || 0, .3); settle(world, e);}
    world.event('odkcrash', round(cx), round(cz), '', {player: s.ownerId, itemId: PACK, radius: HAND.crash, n: s.ids.length});
  }
}

/** A thrown foe that came down in water or a thicket climbs back out onto the nearest ground. */
function settle(world, e){
  if(typeof world.walkable !== 'function' || world.walkable(e.x, e.z)) return;
  const land = world.landNear?.(e.x, e.z, 6); if(land){e.x = round(land.x); e.z = round(land.z);}
}

/** Skill: the hand scoops every foe in a wide arc into a ball of bones (SKILL_CALLS.avalanche). */
export function avalanche(world, owner, damage){
  const length = Math.hypot(owner.dx || 0, owner.dz || 0), dx = length > 1e-6 ? owner.dx/length : 0, dz = length > 1e-6 ? owner.dz/length : 1;
  const half = AVALANCHE.arc*Math.PI/360, ang = Math.atan2(dz, dx), foes = hostiles(world);
  const scooped = foes.filter(e => {
    const ex = e.x-owner.x, ez = e.z-owner.z, d = Math.hypot(ex, ez);
    if(d > AVALANCHE.radius || heavy(e)) return false;
    let a = Math.atan2(ez, ex)-ang; a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.abs(a) <= half;
  }).slice(0, AVALANCHE.most);
  const x = owner.x+dx*2, z = owner.z+dz*2;
  const ball = {id: world.nextId('odk'), packId: PACK, ownerId: owner.id, kind: 'ball', bx: round(x), bz: round(z), dx: round(dx), dz: round(dz),
    age: 0, life: AVALANCHE.gather+AVALANCHE.len/AVALANCHE.speed+.6, dmg: round(damage), ids: scooped.map(e => e.id), hits: [], traveled: 0, burst: false,
    from: scooped.map(e => [round(e.x), round(e.z)])};
  for(const e of scooped) hold(e, ball.life);
  (world.magicSweeps ||= []).push(ball);
  for(const e of scooped) hurt(world, e, damage*.4, owner.id);
  return {n: scooped.length, angle: round(ang)};
}

function stepBall(world, s, foes, dt){
  if(s.burst) return;
  const ids = new Set(s.ids);
  if(s.age < AVALANCHE.gather){
    // Scooping: every foe is dragged in to the ball.
    const k = s.age/AVALANCHE.gather;
    s.ids.forEach((id, j) => {const e = foes.find(f => f.id === id); if(!e) return; const [fx, fz] = s.from[j] || [e.x, e.z]; e.x = round(fx+(s.bx-fx)*k); e.z = round(fz+(s.bz-fz)*k); hold(e, .3);});
    return;
  }
  // Rolling: it gathers up whatever it rolls over (not the great), and carries them.
  const stepLen = Math.min(AVALANCHE.speed*dt, Math.max(0, AVALANCHE.len-s.traveled));
  s.bx = round(s.bx+s.dx*stepLen); s.bz = round(s.bz+s.dz*stepLen); s.traveled = round(s.traveled+stepLen);
  for(const e of foes){
    if(ids.has(e.id)) continue;
    if(Math.hypot(e.x-s.bx, e.z-s.bz) < AVALANCHE.pick+bodyOf(e)*.5){
      if(heavy(e)){if(!s.hits.includes(e.id)){s.hits.push(e.id); hurt(world, e, s.dmg*.6, s.ownerId);} continue;}
      if(s.ids.length < AVALANCHE.most+6){s.ids.push(e.id); ids.add(e.id); hurt(world, e, s.dmg*.4, s.ownerId);}
    }
  }
  s.ids.forEach((id, j) => {const e = foes.find(f => f.id === id); if(!e) return; const a = j*2.4+s.traveled*1.6, r = .35+.12*(j%3); e.x = round(s.bx+Math.cos(a)*r); e.z = round(s.bz+Math.sin(a)*r); hold(e, .3);});
  if(s.traveled >= AVALANCHE.len-1e-6 || !world.walkable?.(s.bx, s.bz)){
    s.burst = true;
    for(const e of foes) if(Math.hypot(e.x-s.bx, e.z-s.bz) < AVALANCHE.burst+bodyOf(e)*.5) hurt(world, e, s.dmg, s.ownerId);
    // The heap flies apart.
    s.ids.forEach((id, j) => {const e = foes.find(f => f.id === id); if(!e) return; const a = j*2.4, r = 1.2+(j%4)*.5; e.x = round(s.bx+Math.cos(a)*r); e.z = round(s.bz+Math.sin(a)*r); settle(world, e); e.stunned = .5;});
    world.event('odkburst', s.bx, s.bz, '', {player: s.ownerId, itemId: PACK, radius: AVALANCHE.burst, n: s.ids.length});
    s.life = s.age+.5;
  }
}
