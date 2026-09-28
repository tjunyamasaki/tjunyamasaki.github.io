// Your shadow creeps out under nearby foes. A hand claws up from each pool of dark,
// closes on whatever stands there, crushes it and holds it fast before sinking back.
// Host-only simulation; these shared magic lists already travel in world snapshots,
// so guests only draw them (see shadow-effects.mjs).
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'gloomgrasp';
export const GRASP = Object.freeze({
  hands: 3, damage: 18, soloBonus: 1.5, cooldown: 1.4, range: 8, fallback: 4,
  stagger: .09, grabAt: .5, life: 1.55, grabRadius: .95, root: 1.2, castLife: .8,
});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Gloomgrasp Scepter', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: GRASP.damage, durability: 170, cooldown: GRASP.cooldown, stamina: 9,
    blurb: 'Your shadow spreads beneath your foes. Hands claw up from the dark, crush whatever they catch and hold it fast.',
  },
  mobs: [],
  sprites: {
    item: {src: `assets/magic/${PACK}/item.svg`, icon: `assets/magic/${PACK}/icon.svg`,
      size: [1.3, 1.9], anchor: [.5, .36],
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
  const targets = hostiles(world).filter(e => Math.hypot(e.x-player.x, e.z-player.z) <= GRASP.range)
    .sort((a, b) => score(a, player, dx, dz)-score(b, player, dx, dz)).slice(0, GRASP.hands);
  const spots = targets.length ? targets.map(e => ({x: e.x, z: e.z, id: e.id}))
    : [{x: player.x+dx*GRASP.fallback, z: player.z+dz*GRASP.fallback, id: null}];
  const solo = spots.length === 1;
  const first = spots[0], fl = Math.hypot(first.x-player.x, first.z-player.z);
  const fx = fl > 1e-6 ? (first.x-player.x)/fl : dx, fz = fl > 1e-6 ? (first.z-player.z)/fl : dz;

  const cast = {id: world.nextId('gloomcast'), packId: PACK, ownerId: player.id,
    x: player.x, z: player.z, dx: fx, dz: fz, age: 0, life: GRASP.castLife};
  (world.magicCasts ||= []).push(cast);
  spots.forEach((spot, i) => {
    (world.magicPuffs ||= []).push({id: world.nextId('gloomhand'), packId: PACK, ownerId: player.id,
      x: spot.x, z: spot.z, ox: player.x, oz: player.z, targetId: spot.id,
      age: 0, delay: i*GRASP.stagger, grabAt: GRASP.grabAt, life: GRASP.life, grabbed: false,
      power, solo, side: (spot.x < player.x ? -1 : 1)*(i === 1 ? -1 : 1), seed: i});
  });
  // attackMagic() applies the item's cooldown, stamina and wear after this returns.
  player.dx = fx; player.dz = fz; player.rest = false;
  player.action = 'attack'; player.actionUntil = world.time+.7;
  world.event('gloomcast', player.x, player.z, '', {player: player.id});
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
  const hands = world.magicPuffs;
  if(!Array.isArray(hands) || !hands.some(h => h.packId === PACK)) return;
  const foes = hostiles(world);
  for(let i = hands.length-1; i >= 0; i--){
    const hand = hands[i];
    if(hand.packId !== PACK) continue;
    hand.age += dt;
    if(!hand.grabbed){
      // The pool follows its mark until the fingers close.
      const mark = hand.targetId != null ? foes.find(e => e.id === hand.targetId) : null;
      if(mark){hand.x = mark.x; hand.z = mark.z;}
      if(hand.age-hand.delay >= hand.grabAt){
        hand.grabbed = true;
        let caught = 0;
        for(const enemy of foes){
          if(!inside(enemy, hand.x, hand.z, GRASP.grabRadius)) continue;
          (world.pendingHit ||= []).push({targetId: enemy.id,
            amount: Math.max(1, Math.round(GRASP.damage*hand.power*(hand.solo ? GRASP.soloBonus : 1))), ownerId: hand.ownerId});
          (world.pendingRoot ||= []).push({targetId: enemy.id, remaining: GRASP.root});
          if(enemy.home && !enemy.aggro) enemy.aggro = true;
          caught++;
        }
        hand.caught = caught;
        world.event('gloomgrab', hand.x, hand.z);
      }
    }
    if(hand.age >= hand.delay+hand.life) hands.splice(i, 1);
  }
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
