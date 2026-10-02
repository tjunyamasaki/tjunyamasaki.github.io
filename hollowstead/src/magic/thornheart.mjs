// Thornmother's Heart: Mother Briar's own heart, still beating (bosses.mjs drops it). Every attack throws a
// living vine from you to your foe: it lashes everything along it, then lies on the ground as a line of
// thorns that tears whatever crosses it. Where two of your vines cross, the ground blooms: a burst of
// thorns. Move between casts so your vines cross over the crowd. Up to five vines live at once.
// Skill, Heartbloom: ten vines burst out of you and a ring of vine closes round them; every crossing
// blooms, one after another, and then the heart itself blooms where you stand.
// The host owns the vines (world.magicSweeps) and blooms (world.magicPuffs); all drawing is src/fx/thornheart.mjs.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'thornheart';
export const VINE = Object.freeze({
  damage: 20, cooldown: 1.25, range: 9, width: .9, life: 4.2, contact: .3, tick: .5, slow: 1.1, max: 5,
  bloomRadius: 1.9, bloom: 2.4, bloomDelay: .22, bloomLife: .9, gap: 1,
});
export const HEARTBLOOM = Object.freeze({spokes: 10, spoke: 7, ring: 5, life: 4, heartRadius: 3.2, heartAt: 1.15});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Thornmother’s Heart', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: VINE.damage, durability: 320, cooldown: VINE.cooldown, stamina: 9,
    blurb: 'Mother Briar’s heart, still beating. Each attack throws a vine at your foe that lashes everything along it and lies there as thorns. Where your vines cross, the ground blooms.',
  },
  mobs: [],
  sprites: {
    item: {src: 'assets/magic/thornheart/item.svg', icon: 'assets/magic/thornheart/icon.svg',
      size: [1.3, 1.6], anchor: [.5, .4], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

const hostiles = world => {
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.hp > 0 && !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
};
const bodyR = e => ['king', 'briarmother', 'unblinking'].includes(e.type) ? 1.4 : e.type === 'golem' || e.type === 'brute' ? 1 : .6;
/** Distance from (x,z) to the segment. */
function toSegment(x, z, s){
  const dx = s.x1-s.x0, dz = s.z1-s.z0, l2 = dx*dx+dz*dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x-s.x0)*dx+(z-s.z0)*dz)/l2));
  return Math.hypot(s.x0+dx*t-x, s.z0+dz*t-z);
}
/** Where two segments cross, or null. */
export function crossing(a, b){
  const rx = a.x1-a.x0, rz = a.z1-a.z0, sx = b.x1-b.x0, sz = b.z1-b.z0, den = rx*sz-rz*sx;
  if(Math.abs(den) < 1e-6) return null;
  const qx = b.x0-a.x0, qz = b.z0-a.z0, t = (qx*sz-qz*sx)/den, u = (qx*rz-qz*rx)/den;
  if(t < .02 || t > .98 || u < .02 || u > .98) return null;
  return {x: a.x0+rx*t, z: a.z0+rz*t};
}
function hurt(world, e, amount, ownerId){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId});
  e.lastHitBy = ownerId; if(e.home && !e.aggro) e.aggro = true;
}
const vines = (world, ownerId) => (world.magicSweeps || []).filter(v => v.packId === PACK && v.ownerId === ownerId);

/** Lay a vine (and the blooms where it crosses the wielder's other vines). Returns it. */
export function layVine(world, owner, x0, z0, x1, z1, {power, damage, life = VINE.life, skill = false, lash = true, delay = 0} = {}){
  const vine = {id: world.nextId('vine'), packId: PACK, ownerId: owner.id, x0: +x0.toFixed(2), z0: +z0.toFixed(2), x1: +x1.toFixed(2), z1: +z1.toFixed(2),
    age: -delay, life, power, damage, hitAt: {}, skill, seed: (world.idCounter*7919)%1000};
  if(lash && !(delay > 0)) for(const e of hostiles(world)) if(toSegment(e.x, e.z, vine) < VINE.width/2+bodyR(e)*.5){hurt(world, e, damage, owner.id); e.slowed = Math.max(e.slowed || 0, VINE.slow); vine.hitAt[e.id] = 0;}
  const others = vines(world, owner.id);
  (world.magicSweeps ||= []).push(vine);
  if(!skill){
    // Where the new vine crosses an old one, the thorns bloom.
    const blooms = (world.magicPuffs || []).filter(p => p.packId === PACK && p.ownerId === owner.id);
    let n = 0;
    for(const old of others){
      const at = crossing(vine, old); if(!at) continue;
      if(blooms.some(b => Math.hypot(b.x-at.x, b.z-at.z) < VINE.gap)) continue;
      blooms.push(bloom(world, owner, at.x, at.z, {power, damage: damage*VINE.bloom, delay: VINE.bloomDelay+n*.08}));
      n++;
    }
    // Only so many vines live at once: the oldest withers.
    const mine = vines(world, owner.id).filter(v => !v.skill).sort((a, b) => b.age-a.age);
    for(let i = 0; mine.length-i > VINE.max; i++) mine[i].age = Math.max(mine[i].age, mine[i].life-.35);
  }
  return vine;
}
/** A bloom of thorns that goes off after `delay` seconds. */
export function bloom(world, owner, x, z, {power, damage, delay = VINE.bloomDelay, radius = VINE.bloomRadius, heart = false} = {}){
  const b = {id: world.nextId('bloom'), packId: PACK, ownerId: owner.id, x: +x.toFixed(2), z: +z.toFixed(2), age: 0, at: delay, life: delay+VINE.bloomLife, power, damage, radius, heart, boomed: false};
  (world.magicPuffs ||= []).push(b);
  return b;
}

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || !weapon || weapon.itemId !== PACK || !(weapon.durability > 0) || player.down || player.ghost || player.online === false ||
    player.cooldown > .05 || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const l = Math.hypot(player.dx || 0, player.dz || 0), dx = l > 1e-6 ? player.dx/l : 0, dz = l > 1e-6 ? player.dz/l : 1;
  const power = ownerPower(world, player);
  // The nearest foe ahead (auto-aim has already turned the wielder to it); the vine reaches a little past it.
  let target = null, best = Infinity;
  for(const e of hostiles(world)){
    const ex = e.x-player.x, ez = e.z-player.z, d = Math.hypot(ex, ez);
    if(d > VINE.range+bodyR(e)) continue;
    const score = d*(1.25-.25*(d > 1e-6 ? (ex*dx+ez*dz)/d : 1));
    if(score < best){best = score; target = e;}
  }
  let tx, tz;
  if(target){const d = Math.max(.01, Math.hypot(target.x-player.x, target.z-player.z)), reach = Math.min(VINE.range, d+1.6); tx = player.x+(target.x-player.x)/d*reach; tz = player.z+(target.z-player.z)/d*reach;}
  else{tx = player.x+dx*VINE.range*.75; tz = player.z+dz*VINE.range*.75;}
  const vine = layVine(world, player, player.x, player.z, tx, tz, {power, damage: VINE.damage*power});
  world.wearEquipped(player, 'weapon', 1);
  if(target){const d = Math.max(.01, Math.hypot(target.x-player.x, target.z-player.z)); player.dx = (target.x-player.x)/d; player.dz = (target.z-player.z)/d;}
  else{player.dx = dx; player.dz = dz;}
  player.rest = false; player.cooldown = VINE.cooldown;
  player.action = 'attack'; player.actionUntil = world.time+.55;
  // The heart beats with every throw (src/fx/thornheart.mjs makes it jump).
  player.thornBeat = world.time;
  world.event('vinelash', player.x, player.z, '', {player: player.id, tx: vine.x1, tz: vine.z1});
  return vine;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  const sweeps = world.magicSweeps, puffs = world.magicPuffs;
  if(!sweeps?.some(v => v.packId === PACK) && !puffs?.some(p => p.packId === PACK)) return;
  const foes = hostiles(world);
  if(sweeps) for(let i = sweeps.length-1; i >= 0; i--){
    const v = sweeps[i]; if(v.packId !== PACK) continue;
    const was = v.age; v.age += dt;
    if(was < 0 && v.age >= 0) for(const e of foes) if(toSegment(e.x, e.z, v) < VINE.width/2+bodyR(e)*.5){hurt(world, e, v.damage, v.ownerId); v.hitAt[e.id] = v.age;}
    if(v.age >= v.life){sweeps.splice(i, 1); continue;}
    if(v.age < 0) continue;
    // Thorns: whatever crosses a vine is torn and slowed, at most every VINE.tick.
    for(const e of foes){
      if(toSegment(e.x, e.z, v) > VINE.width/2+bodyR(e)*.45) continue;
      const last = v.hitAt[e.id];
      if(last !== undefined && v.age-last < VINE.tick) continue;
      v.hitAt[e.id] = v.age;
      hurt(world, e, v.damage*VINE.contact, v.ownerId);
      e.slowed = Math.max(e.slowed || 0, .6);
    }
  }
  if(puffs) for(let i = puffs.length-1; i >= 0; i--){
    const b = puffs[i]; if(b.packId !== PACK) continue;
    b.age += dt;
    if(!b.boomed && b.age >= b.at){
      b.boomed = true;
      for(const e of foes) if(Math.hypot(e.x-b.x, e.z-b.z) <= b.radius+bodyR(e)*.4) hurt(world, e, b.damage, b.ownerId);
      world.event('thornbloom', b.x, b.z, '', {player: b.ownerId, radius: b.radius, heart: !!b.heart});
    }
    if(b.age >= b.life) puffs.splice(i, 1);
  }
}

/** Heartbloom (skill-book.mjs SKILL_CALLS.heartbloom): spokes, a closing ring, a bloom at every crossing, then the heart. */
export function heartbloom(world, owner, b){
  const power = ownerPower(world, owner)*(b.power || 1), H = HEARTBLOOM, x = owner.x, z = owner.z, a0 = Math.atan2(owner.dz || 1, owner.dx || 0);
  const spokes = [], ring = [];
  for(let i = 0; i < H.spokes; i++){
    const a = a0+i/H.spokes*Math.PI*2;
    spokes.push(layVine(world, owner, x, z, x+Math.cos(a)*H.spoke, z+Math.sin(a)*H.spoke, {power, damage: b.vine || VINE.damage*power, life: H.life, skill: true}));
  }
  for(let i = 0; i < H.spokes; i++){
    const a = a0+(i+.5)/H.spokes*Math.PI*2, c = a0+(i+1.5)/H.spokes*Math.PI*2;
    ring.push(layVine(world, owner, x+Math.cos(a)*H.ring, z+Math.sin(a)*H.ring, x+Math.cos(c)*H.ring, z+Math.sin(c)*H.ring, {power, damage: b.vine || VINE.damage*power, life: H.life, skill: true, delay: .25}));
  }
  let n = 0;
  for(const s of spokes) for(const r of ring){const at = crossing(s, r); if(at) bloom(world, owner, at.x, at.z, {power, damage: b.bloom || VINE.damage*VINE.bloom*power, delay: .45+n++*.06});}
  bloom(world, owner, x, z, {power, damage: b.heart || VINE.damage*power*5, delay: H.heartAt, radius: H.heartRadius, heart: true});
  owner.thornBeat = world.time;
  return {n, ring: H.ring};
}
