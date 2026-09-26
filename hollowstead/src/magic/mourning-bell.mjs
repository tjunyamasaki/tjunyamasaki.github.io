import {isMagicAlly} from './registry.mjs?v=harvest-16';

export const BELL = Object.freeze({delay: .28, travel: .65, linger: .32, radius: 5, damage: 9, push: 1.2, cooldown: 2.4});
export const magicPack = {
  id: 'mourning-bell',
  item: {id: 'mourning-bell', name: 'Mourning Bell', kind: 'weapon', slot: 'weapon',
    icon: 'mourning-bell', durability: 65, damage: BELL.damage, cooldown: BELL.cooldown,
    blurb: 'Toll for the restless. A delayed spirit ring strikes and pushes nearby foes once.'},
  worldLists: ['magicWaves'],
  sprites: {item: 'assets/magic/gravecraft/mourning-bell.png'},
};

export function waveRadius(age){return Math.max(0,Math.min(1,(age-BELL.delay)/BELL.travel))*BELL.radius;}

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || !weapon || weapon.itemId !== magicPack.id || !(weapon.durability>0) ||
    player.down || player.ghost || player.online === false || player.cooldown>.05 ||
    !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const wave = {id: world.nextId('bell'), packId: magicPack.id, ownerId: player.id,
    x: player.x, z: player.z, age: 0, hitIds: [], radius: BELL.radius,
    life: BELL.delay+BELL.travel+BELL.linger};
  (world.magicWaves ||= []).push(wave);
  world.wearEquipped(player, 'weapon', 1);
  player.cooldown = BELL.cooldown;
  player.action = 'attack'; player.actionUntil = world.time+.6; player.rest = false;
  return wave;
}

export function step(world, dt){
  if(!Array.isArray(world?.magicWaves) || !(dt>0) || !Number.isFinite(dt)) return;
  const players = new Set((world.players||[]).map(p=>p.id));
  for(let i=world.magicWaves.length-1;i>=0;i--){
    const wave = world.magicWaves[i];
    if(wave.packId !== magicPack.id) continue;
    const before = wave.age;
    wave.age += dt;
    if(before<BELL.delay && wave.age>=BELL.delay) world.event('bell',wave.x,wave.z);
    if(wave.age>=BELL.delay && before<BELL.delay+BELL.travel){
      const outer = waveRadius(wave.age), inner = waveRadius(before);
      for(const enemy of world.enemies||[]){
        if(!enemy || !(enemy.hp>0) || players.has(enemy.id) || isMagicAlly(enemy) || wave.hitIds.includes(enemy.id)) continue;
        const dx=enemy.x-wave.x, dz=enemy.z-wave.z, span=Math.hypot(dx,dz);
        // Only the travelling front deals damage. The fading echoes are cosmetic.
        if(!Number.isFinite(span) || span>outer || (before>=BELL.delay && span<Math.max(0,inner-.3))) continue;
        wave.hitIds.push(enemy.id);
        (world.pendingHit ||= []).push({targetId: enemy.id, amount: BELL.damage});
        (world.pendingKnock ||= []).push({targetId: enemy.id, dx:(span?dx/span:1)*BELL.push, dz:(span?dz/span:0)*BELL.push});
      }
    }
    if(wave.age>=wave.life) world.magicWaves.splice(i,1);
  }
}
