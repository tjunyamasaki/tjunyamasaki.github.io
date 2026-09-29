// Fantasy: a hungry crescent of jawbone that always comes back to its keeper.
// Auto verb: throw it through foes, then move to steer its biting return path.
// Rhythm: three catches light three teeth; the fourth throw spends them on a larger maw.
// Skill climax: feed the stored teeth to a giant maw; catch it for a crushing final bite.
// Look/palette: ink-edged ivory bone, turquoise spirit ribbons, violet at the highest rank.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'moon-maw';
export const MAW = Object.freeze({damage: 20, cooldown: 1.65, reach: 8.5, speed: 13,
  returnSpeed: 16, windup: .18, hang: .12, life: 3.8, radius: .38});

export const magicPack = {
  id: PACK,
  item: {id: PACK, name: 'Moon-Maw', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: MAW.damage, durability: 180, cooldown: MAW.cooldown, stamina: 9,
    blurb: 'A hungry bone boomerang. Move to steer its return through foes. Three catches charge a larger fourth throw; your skill feeds on the stored teeth.'},
  mobs: [],
  sprites: {item: {src: 'assets/magic/moon-maw/item.svg', icon: 'assets/magic/moon-maw/icon.svg',
    size: [1.5, 1.5], anchor: [.5, .5], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}}},
};

const teethOf = p => Math.max(0, Math.min(3, (p?.moonMawTeeth || 0)|0));
const awake = p => p && !p.down && !p.ghost && p.online !== false && Number.isFinite(p.x) && Number.isFinite(p.z);
function direction(x, z){
  const length = Math.hypot(x, z);
  return Number.isFinite(length) && length > 1e-6 ? [x/length, z/length] : [0, 1];
}

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || weapon?.itemId !== PACK || !(weapon.durability > 0) || !awake(player) || player.cooldown > .05) return null;
  // One real crescent, including while it returns. Failed attempts do not spend or advance anything.
  if(world.magicBolts?.some(b => b.packId === PACK && b.ownerId === player.id)) return null;
  const [dx, dz] = direction(player.dx || 0, player.dz || 0), teeth = teethOf(player), fed = teeth === 3;
  const bolt = launch(world, player, {dx, dz, teeth, fed, damage: MAW.damage*ownerPower(world, player)*(fed ? 1.6 : 1)});
  if(fed) player.moonMawTeeth = 0;
  player.dx = dx; player.dz = dz; player.rest = false;
  player.cooldown = MAW.cooldown; player.action = 'attack'; player.actionUntil = world.time+.5;
  world.wearEquipped(player, 'weapon', 1);
  return bolt;
}

/** The skill uses the same outbound / hang / return simulation as the ordinary throw. */
export function beginFeast(world, player, beat){
  // The skill system already accepted this cast and captured its damage before charging wear.
  // Its last durability point may auto-swap the weapon before this beat runs.
  if(!world || !awake(player)) return null;
  const teeth = teethOf(player), [dx, dz] = direction(beat.tx-player.x, beat.tz-player.z);
  // Recall an ordinary throw into the skill; never leave an invisible second weapon behind.
  const list = world.magicBolts || [];
  for(let i = list.length-1; i >= 0; i--) if(list[i].packId === PACK && list[i].ownerId === player.id) list.splice(i, 1);
  const bolt = launch(world, player, {dx, dz, teeth, fed: true, feast: true,
    damage: beat.bite*(1.6+teeth*.25), snapDamage: beat.snap*(1+teeth*.2)});
  player.moonMawTeeth = 0;
  return {teeth, r: bolt.snapRadius};
}

function launch(world, player, spec){
  const feast = !!spec.feast, fed = !!spec.fed;
  const bolt = {id: world.nextId('moonmaw'), packId: PACK, ownerId: player.id,
    x: player.x, z: player.z, ox: player.x, oz: player.z, dx: spec.dx, dz: spec.dz,
    vx: 0, vz: 0, age: 0, life: feast ? 5 : MAW.life, phase: 'windup', traveled: 0, hangAge: 0,
    windup: feast ? .32 : MAW.windup, hang: feast ? .52 : MAW.hang,
    reach: feast ? 9.2 : MAW.reach, speed: feast ? 11 : MAW.speed,
    returnSpeed: feast ? 14 : MAW.returnSpeed, size: feast ? 1.8+spec.teeth*.16 : fed ? 1.3 : .82,
    radius: feast ? .9+spec.teeth*.1 : fed ? .62 : MAW.radius,
    side: player.moonMawSide === -1 ? -1 : 1, teeth: spec.teeth, fed, feast,
    damage: spec.damage, snapDamage: spec.snapDamage || 0, snapRadius: 2.6+spec.teeth*.28,
    outHits: [], backHits: [], trail: [[player.x, player.z]], trailAge: 0};
  player.moonMawSide = -bolt.side;
  (world.magicBolts ||= []).push(bolt);
  world.event('mooncast', bolt.x, bolt.z, '', {player: player.id, itemId: PACK, feast, fed});
  return bolt;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  const puffs = world.magicPuffs || [];
  for(let i = puffs.length-1; i >= 0; i--){
    if(puffs[i].packId !== PACK) continue;
    puffs[i].age += dt;
    if(puffs[i].age >= puffs[i].life) puffs.splice(i, 1);
  }
  const list = world.magicBolts || [];
  if(!list.some(b => b.packId === PACK)) return;
  const foes = hostiles(world);
  for(let i = list.length-1; i >= 0; i--){
    const b = list[i];
    if(b.packId !== PACK) continue;
    const owner = world.players?.find(p => p.id === b.ownerId);
    if(!awake(owner) || !Number.isFinite(b.x) || !Number.isFinite(b.z)){
      list.splice(i, 1); continue;
    }
    let remaining = Math.min(dt, Math.max(0, b.life-b.age)), caught = false;
    // Bounded substeps preserve the bend and sweep every segment, even after a long host frame.
    while(remaining > 1e-8 && !caught){
      const h = Math.min(1/40, remaining), x0 = b.x, z0 = b.z;
      remaining -= h; b.age += h;
      if(b.phase === 'windup'){
        b.x = b.ox = owner.x; b.z = b.oz = owner.z;
        if(b.age >= b.windup) b.phase = 'out';
        continue;
      }
      if(b.phase === 'hang'){
        b.vx = b.vz = 0; b.hangAge += h;
        if(b.hangAge >= b.hang) b.phase = 'back';
        continue;
      }
      const outbound = b.phase === 'out';
      if(outbound){
        b.traveled = Math.min(b.reach, b.traveled+b.speed*h);
        const bend = Math.sin(b.traveled/b.reach*Math.PI)*.5*b.side;
        b.x = b.ox+b.dx*b.traveled-b.dz*bend; b.z = b.oz+b.dz*b.traveled+b.dx*bend;
      }else{
        const distance = Math.hypot(owner.x-b.x, owner.z-b.z), travel = Math.min(distance, b.returnSpeed*h);
        const [dx, dz] = direction(owner.x-b.x, owner.z-b.z);
        b.x += dx*travel; b.z += dz*travel;
        caught = distance <= travel+.12;
      }
      b.vx = (b.x-x0)/h; b.vz = (b.z-z0)/h;
      const hitIds = outbound ? b.outHits : b.backHits;
      for(const e of foes){
        if(!(e.hp > 0) || hitIds.includes(e.id)) continue;
        const radius = b.radius+(e.type === 'king' ? 1.2 : ['golem', 'brute'].includes(e.type) ? .85 : .45);
        if(segmentDistance(e.x, e.z, x0, z0, b.x, b.z) > radius) continue;
        hitIds.push(e.id); harm(world, e, b.damage, b.ownerId);
        puff(world, e, b, !outbound);
      }
      b.trailAge += h;
      if(b.trailAge >= .04){
        b.trailAge = 0; b.trail.push([b.x, b.z]);
        if(b.trail.length > 12) b.trail.shift();
      }
      if(outbound && b.traveled >= b.reach){b.phase = 'hang'; b.vx = b.vz = 0;}
    }
    if(caught){
      if(b.feast){
        for(const e of foes) if(e.hp > 0 && Math.hypot(e.x-owner.x, e.z-owner.z) <= b.snapRadius) harm(world, e, b.snapDamage, b.ownerId);
        world.event('moonsnap', owner.x, owner.z, '', {player: owner.id, itemId: PACK, r: b.snapRadius, teeth: b.teeth});
      }else{
        // A committed throw finishes after a gear swap, but only its equipped keeper earns a tooth.
        if(owner.equipment?.weapon?.itemId === PACK) owner.moonMawTeeth = Math.min(3, teethOf(owner)+1);
        world.event('mooncatch', owner.x, owner.z, '', {player: owner.id, itemId: PACK, teeth: teethOf(owner), fed: b.fed});
      }
    }
    if(caught || b.age >= b.life-1e-8) list.splice(i, 1);
  }
}

function hostiles(world){
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.id != null && e.hp > 0 && !players.has(e.id) &&
    !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
}
function segmentDistance(x, z, x0, z0, x1, z1){
  const dx = x1-x0, dz = z1-z0, len = dx*dx+dz*dz;
  const t = len > 1e-10 ? Math.max(0, Math.min(1, ((x-x0)*dx+(z-z0)*dz)/len)) : 0;
  return Math.hypot(x-x0-dx*t, z-z0-dz*t);
}
function harm(world, enemy, amount, ownerId){
  (world.pendingHit ||= []).push({targetId: enemy.id, amount: Math.max(1, Math.round(amount)), ownerId});
  if(enemy.home && !enemy.aggro) enemy.aggro = true;
}
function puff(world, e, b, back){
  const list = world.magicPuffs ||= [];
  // Crowds still take every hit, but a wall of foes cannot multiply the cosmetic budget indefinitely.
  const owned = list.filter(p => p.packId === PACK && p.ownerId === b.ownerId);
  if(owned.length >= 14) list.splice(list.indexOf(owned[0]), 1);
  list.push({id: world.nextId('moonbite'), packId: PACK, ownerId: b.ownerId,
    x: e.x, z: e.z, age: 0, life: .36, back, fed: b.fed});
}
