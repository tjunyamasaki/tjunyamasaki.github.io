// A plague doctor's cane. The beaked mask coughs up a vial of miasma that arcs onto
// the nearest foe, shatters, and leaves a lingering cloud that keeps sickening
// anything inside. Host-only simulation; these shared magic lists already travel
// in world snapshots, so guests only draw them (see plague-effects.mjs).
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'plaguebeak';
export const MIASMA = Object.freeze({
  damage: 16, cooldown: 1.25, range: 8.5, fallback: 5, delay: .14,
  radius: 2.3, cloudLife: 2.6, tickEvery: .5, tickDamage: 5, push: .35, castLife: .7,
});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Plaguebeak Cane', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: MIASMA.damage, durability: 170, cooldown: MIASMA.cooldown, stamina: 8,
    blurb: 'The beaked mask coughs up a vial of miasma. It shatters on the nearest foe and leaves a sickly cloud that keeps gnawing.',
  },
  mobs: [],
  sprites: {
    item: {src: `assets/magic/${PACK}/item.svg`, icon: `assets/magic/${PACK}/icon.svg`,
      size: [1.3, 1.95], anchor: [.5, .34],
      columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || !weapon || weapon.itemId !== PACK || !(weapon.durability > 0) ||
    player.down || player.ghost || player.online === false || player.cooldown > .05 ||
    !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;

  const length = Math.hypot(player.dx || 0, player.dz || 0);
  const dx = length > 1e-6 ? player.dx/length : 0, dz = length > 1e-6 ? player.dz/length : 1;
  const power = ownerPower(world, player);
  const target = hostiles(world).filter(e => Math.hypot(e.x-player.x, e.z-player.z) <= MIASMA.range)
    .sort((a, b) => score(a, player, dx, dz)-score(b, player, dx, dz))[0];
  let tx = target ? target.x : player.x+dx*MIASMA.fallback;
  let tz = target ? target.z : player.z+dz*MIASMA.fallback;
  const dist = Math.hypot(tx-player.x, tz-player.z);
  const fx = dist > 1e-6 ? (tx-player.x)/dist : dx, fz = dist > 1e-6 ? (tz-player.z)/dist : dz;
  if(dist > MIASMA.range){tx = player.x+fx*MIASMA.range; tz = player.z+fz*MIASMA.range;}
  const side = fx < -.1 ? -1 : 1;

  const cast = {id: world.nextId('plaguecast'), packId: PACK, ownerId: player.id,
    x: player.x, z: player.z, dx: fx, dz: fz, age: 0, life: MIASMA.castLife};
  (world.magicCasts ||= []).push(cast);
  (world.magicBolts ||= []).push({id: world.nextId('plaguevial'), packId: PACK, ownerId: player.id,
    x: player.x+fx*.5, z: player.z+fz*.5, x0: player.x+fx*.5, z0: player.z+fz*.5, tx, tz,
    age: 0, delay: MIASMA.delay, flight: .42+Math.min(dist, MIASMA.range)*.035,
    arc: 1.3+Math.min(dist, MIASMA.range)*.1, spin: side, side, power});
  // attackMagic() applies the item's cooldown, stamina and wear after this returns.
  player.dx = fx; player.dz = fz; player.rest = false;
  player.action = 'attack'; player.actionUntil = world.time+.6;
  world.event('plaguevial', player.x, player.z, '', {player: player.id});
  return cast;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  const casts = world.magicCasts;
  if(Array.isArray(casts)){
    for(let i = casts.length-1; i >= 0; i--){
      const cast = casts[i];
      if(cast.packId !== PACK) continue;
      cast.age += dt;
      const owner = world.players?.find(p => p.id === cast.ownerId);
      if(owner){cast.x = owner.x; cast.z = owner.z;}
      if(cast.age >= cast.life) casts.splice(i, 1);
    }
  }
  // Clouds first, so a vial that lands this step is not aged twice.
  const clouds = world.magicPuffs;
  if(Array.isArray(clouds)){
    for(let i = clouds.length-1; i >= 0; i--){
      const cloud = clouds[i];
      if(cloud.packId !== PACK) continue;
      cloud.age += dt;
      while(cloud.nextTick <= cloud.age && cloud.nextTick <= cloud.life+1e-9){
        for(const enemy of hostiles(world)){
          if(inside(enemy, cloud.x, cloud.z, cloud.radius)) harm(world, enemy, cloud.x, cloud.z, MIASMA.tickDamage*cloud.power, cloud.ownerId, 0);
        }
        cloud.nextTick += MIASMA.tickEvery;
      }
      if(cloud.age >= cloud.life) clouds.splice(i, 1);
    }
  }
  const vials = world.magicBolts;
  if(!Array.isArray(vials)) return;
  for(let i = vials.length-1; i >= 0; i--){
    const vial = vials[i];
    if(vial.packId !== PACK) continue;
    vial.age += dt;
    const t = Math.max(0, Math.min(1, (vial.age-vial.delay)/vial.flight));
    vial.x = vial.x0+(vial.tx-vial.x0)*t; vial.z = vial.z0+(vial.tz-vial.z0)*t;
    const land = vial.delay+vial.flight;
    if(vial.age < land) continue;
    vials.splice(i, 1);
    shatter(world, vial, vial.age-land);
  }
}

function shatter(world, vial, overshoot){
  for(const enemy of hostiles(world)){
    if(inside(enemy, vial.tx, vial.tz, MIASMA.radius)) harm(world, enemy, vial.tx, vial.tz, MIASMA.damage*vial.power, vial.ownerId, MIASMA.push);
  }
  (world.magicPuffs ||= []).push({id: world.nextId('miasma'), packId: PACK, ownerId: vial.ownerId,
    x: vial.tx, z: vial.tz, age: overshoot, life: MIASMA.cloudLife, radius: MIASMA.radius,
    every: MIASMA.tickEvery, nextTick: MIASMA.tickEvery, power: vial.power, side: vial.side});
  world.event('plaguebreak', vial.tx, vial.tz);
}

function hostiles(world){
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.id != null && e.hp > 0 &&
    !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
}

function inside(enemy, x, z, radius){
  const body = enemy.type === 'king' ? 1 : enemy.type === 'golem' || enemy.type === 'brute' ? .6 : .3;
  return Math.hypot(enemy.x-x, enemy.z-z) <= radius+body;
}

function score(enemy, origin, dx, dz){
  const x = enemy.x-origin.x, z = enemy.z-origin.z, distance = Math.hypot(x, z);
  return distance*(1.2-.2*(distance > 1e-6 ? (x*dx+z*dz)/distance : 1));
}

function harm(world, enemy, x, z, amount, ownerId, push){
  (world.pendingHit ||= []).push({targetId: enemy.id, amount: Math.max(1, Math.round(amount)), ownerId});
  const dx = enemy.x-x, dz = enemy.z-z, span = Math.hypot(dx, dz);
  if(push > 0 && span > 1e-6){
    const weight = enemy.type === 'king' || enemy.type === 'golem' ? .3 : 1;
    (world.pendingKnock ||= []).push({targetId: enemy.id, dx: dx/span*push*weight, dz: dz/span*push*weight});
  }
  if(enemy.home && !enemy.aggro) enemy.aggro = true;
}
