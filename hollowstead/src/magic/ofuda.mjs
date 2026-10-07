// The Hundred Seals (an epic sheaf of a daoshi's paper talismans, the Shrine of Yomi). Every attack flicks a
// talisman at a foe and pastes it on: a seal. Seals stack, up to three on one foe; the third ignites them all
// in a burst round it, and the fire runs down the link to every other foe you have sealed nearby (they take a
// share and lose a seal). Seals peel off after a while, and a sealed foe that dies passes its seals to the
// nearest foe. Spread seals for a chain, or stack one foe for the big burn.
// Skill, Grand Seal: a seal (two, at full strength) on every foe around you, then every seal you have laid
// ignites at once, nearest first, and the links light up between them.
// Talismans in flight are world.magicDarts entries; seals on foes are world.magicPins entries {targetId, n}
// (both snapshotted, so guests draw them; positions are px/pz, not x/z, so no sprite is drawn for them). Drawing: src/fx/ofuda.mjs.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'ofuda';
export const SEAL = Object.freeze({
  damage: 6, cooldown: .56, stamina: 6, range: 9, speed: 19, turn: 9, life: .9,
  stick: 6.5,         // seconds a seal holds before it peels off
  max: 3,             // the seal that ignites
  burst: 28, radius: 1.7, link: 6, linkShare: .45,
  pass: 5,            // a dying foe's seals leap to the nearest foe this close
  grand: 9, grandMax: 12, grandBurst: 1.35,
});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'The Hundred Seals', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: SEAL.damage, durability: 220, cooldown: SEAL.cooldown, stamina: SEAL.stamina,
    blurb: 'Flick talismans onto your foes. The third seal on one foe ignites them all, and the fire runs down the link to every other foe you have sealed nearby.',
  },
  mobs: [],
  sprites: {
    item: {src: 'assets/magic/ofuda/item.svg', icon: 'assets/magic/ofuda/icon.svg',
      size: [1.1, 1.65], anchor: [.5, .04], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

const hostiles = world => {
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.hp > 0 && !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
};
const bodyOf = e => e.type === 'king' || e.boss ? 1.3 : e.type === 'golem' || e.type === 'brute' ? 1 : .55;
const round = n => Math.round(n*1000)/1000;
function hurt(world, e, amount, ownerId){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId});
  e.lastHitBy = ownerId; if(e.home && !e.aggro) e.aggro = true;
}
const pinsOf = (world, ownerId) => (world.magicPins || []).filter(p => p.packId === PACK && p.ownerId === ownerId);
const pinOn = (world, ownerId, targetId) => (world.magicPins || []).find(p => p.packId === PACK && p.ownerId === ownerId && p.targetId === targetId);

/** Paste `n` seals on a foe (refreshing its pin). Returns the pin. */
function seal(world, e, ownerId, n, power){
  let pin = pinOn(world, ownerId, e.id);
  if(!pin){pin = {id: world.nextId('seal'), packId: PACK, ownerId, targetId: e.id, px: round(e.x), pz: round(e.z), n: 0, age: 0, life: SEAL.stick, power}; (world.magicPins ||= []).push(pin);}
  pin.n = Math.min(SEAL.max, pin.n+n); pin.age = 0; pin.power = power;
  return pin;
}
/** A pin's seals ignite: a burst round its foe, and the fire runs down the link to the owner's other seals. */
function ignite(world, pin, foes, scale = 1, chain = true){
  const e = foes.find(f => f.id === pin.targetId), x = e?.x ?? pin.px, z = e?.z ?? pin.pz, amount = SEAL.burst*pin.power*scale;
  for(const f of foes) if(Math.hypot(f.x-x, f.z-z) < SEAL.radius+bodyOf(f)*.6) hurt(world, f, amount, pin.ownerId);
  pin.n = 0; pin.done = true;
  const links = [];
  if(chain) for(const other of pinsOf(world, pin.ownerId)){
    if(other === pin || other.done || !(other.n > 0)) continue;
    const f = foes.find(q => q.id === other.targetId); if(!f || Math.hypot(f.x-x, f.z-z) > SEAL.link) continue;
    hurt(world, f, amount*SEAL.linkShare, pin.ownerId);
    other.n--; if(other.n <= 0) other.done = true;
    links.push([round(f.x), round(f.z)]);
  }
  world.event('sealburn', round(x), round(z), '', {player: pin.ownerId, itemId: PACK, radius: SEAL.radius, links});
  return links.length;
}

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || !weapon || weapon.itemId !== PACK || !(weapon.durability > 0) ||
    player.down || player.ghost || player.online === false || player.cooldown > .05 ||
    !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const length = Math.hypot(player.dx || 0, player.dz || 0);
  const dx = length > 1e-6 ? player.dx/length : 0, dz = length > 1e-6 ? player.dz/length : 1;
  const power = ownerPower(world, player);
  // The foe you face, nearest first, within reach.
  let target = null, best = Infinity;
  for(const e of hostiles(world)){
    const ex = e.x-player.x, ez = e.z-player.z, d = Math.hypot(ex, ez); if(d > SEAL.range) continue;
    const s = d*(1.25-.25*(d > 1e-6 ? (ex*dx+ez*dz)/d : 1));
    if(s < best){best = s; target = e;}
  }
  const dart = {id: world.nextId('ofuda'), packId: PACK, ownerId: player.id, px: round(player.x+dx*.5), pz: round(player.z+dz*.5),
    vx: round(dx*SEAL.speed), vz: round(dz*SEAL.speed), dx: round(dx), dz: round(dz), aim: round(Math.atan2(dz, dx)), age: 0, life: SEAL.life, power, targetId: target?.id ?? null,
    spin: (player.ofudaSpin = ((player.ofudaSpin || 0)+1)%4)};
  (world.magicDarts ||= []).push(dart);
  world.wearEquipped(player, 'weapon', 1);
  player.dx = dx; player.dz = dz; player.rest = false;
  player.cooldown = SEAL.cooldown;
  player.action = 'attack'; player.actionUntil = (world.time || 0)+.35;
  world.event('ofudathrow', player.x, player.z, '', {player: player.id, itemId: PACK});
  return dart;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  const hasDarts = world.magicDarts?.some(d => d.packId === PACK), hasPins = world.magicPins?.some(p => p.packId === PACK);
  if(!hasDarts && !hasPins) return;
  const foes = hostiles(world);
  if(hasDarts){
    const darts = world.magicDarts;
    for(let i = darts.length-1; i >= 0; i--){
      const b = darts[i];
      if(b.packId !== PACK) continue;
      b.age += dt;
      const target = foes.find(e => e.id === b.targetId);
      if(target){
        const want = Math.atan2(target.z-b.pz, target.x-b.px), have = Math.atan2(b.vz, b.vx);
        const delta = Math.atan2(Math.sin(want-have), Math.cos(want-have)), a = have+Math.max(-SEAL.turn*dt, Math.min(SEAL.turn*dt, delta));
        b.vx = round(Math.cos(a)*SEAL.speed); b.vz = round(Math.sin(a)*SEAL.speed); b.aim = round(a);
      }
      // Swept so a fast talisman cannot pass through a foe between ticks.
      const x0 = b.px, z0 = b.pz, x1 = x0+b.vx*dt, z1 = z0+b.vz*dt, sx = x1-x0, sz = z1-z0, l2 = sx*sx+sz*sz || 1e-9;
      let hit = null, ht = 2;
      for(const e of foes){
        const t = Math.max(0, Math.min(1, ((e.x-x0)*sx+(e.z-z0)*sz)/l2));
        if(Math.hypot(e.x-(x0+sx*t), e.z-(z0+sz*t)) < bodyOf(e)+.15 && t < ht){hit = e; ht = t;}
      }
      b.px = round(hit ? x0+sx*ht : x1); b.pz = round(hit ? z0+sz*ht : z1);
      if(hit){
        hurt(world, hit, SEAL.damage*b.power, b.ownerId);
        const pin = seal(world, hit, b.ownerId, 1, b.power);
        world.event('sealstick', b.px, b.pz, '', {player: b.ownerId, itemId: PACK, n: pin.n});
        if(pin.n >= SEAL.max) ignite(world, pin, foes);
        darts.splice(i, 1);
      }else if(b.age >= b.life) darts.splice(i, 1);
    }
  }
  // Seals ride their foes, peel off in time, and leap to the nearest foe when theirs dies.
  const pins = world.magicPins;
  if(!pins) return;
  for(let i = pins.length-1; i >= 0; i--){
    const pin = pins[i];
    if(pin.packId !== PACK) continue;
    if(pin.done){pins.splice(i, 1); continue;}
    pin.age += dt;
    const e = foes.find(f => f.id === pin.targetId);
    if(!e){
      let near = null, nd = SEAL.pass;
      for(const f of foes){const d = Math.hypot(f.x-pin.px, f.z-pin.pz); if(d < nd && !pinOn(world, pin.ownerId, f.id)){nd = d; near = f;}}
      if(near && pin.n > 0){
        world.event('sealleap', pin.px, pin.pz, '', {player: pin.ownerId, itemId: PACK, tx: round(near.x), tz: round(near.z), n: pin.n});
        pin.targetId = near.id; pin.age = 0; pin.px = round(near.x); pin.pz = round(near.z);
        continue;
      }
      pins.splice(i, 1); continue;
    }
    pin.px = round(e.x); pin.pz = round(e.z);
    if(pin.age >= pin.life) pins.splice(i, 1);
  }
}

/** Skill: seals on every foe around (SKILL_CALLS.grandseal). Returns the marks for its event. */
export function grandSeal(world, owner, n, power){
  const foes = hostiles(world).filter(e => Math.hypot(e.x-owner.x, e.z-owner.z) < SEAL.grand)
    .sort((a, b) => Math.hypot(a.x-owner.x, a.z-owner.z)-Math.hypot(b.x-owner.x, b.z-owner.z)).slice(0, SEAL.grandMax);
  // Never ignite here: the fire comes on the next beat, all at once.
  for(const e of foes){const pin = seal(world, e, owner.id, n, power); pin.n = Math.min(SEAL.max-1, pin.n);}
  return {marks: foes.map(e => [round(e.x), round(e.z)])};
}
/** Skill climax: every seal the owner has laid ignites, nearest first (SKILL_CALLS.sealfire). */
export function sealFire(world, owner){
  const foes = hostiles(world), pins = pinsOf(world, owner.id).filter(p => p.n > 0)
    .sort((a, b) => Math.hypot(a.px-owner.x, a.pz-owner.z)-Math.hypot(b.px-owner.x, b.pz-owner.z));
  const points = pins.map(p => [round(p.px), round(p.pz)]);
  for(const pin of pins){const scale = SEAL.grandBurst*(.6+.2*pin.n); ignite(world, pin, foes, scale, false);}
  return {points};
}
