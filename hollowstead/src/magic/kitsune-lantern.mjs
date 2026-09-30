// The Nine-Tail Lantern wakes a kitsune. Its spirit tails hang behind the wielder; each volley peels foxfires off their tips
// (three, six, then nine; the ninth blooms into a spirit burst) and they hunt in staggered flight.
// The host consumes queued damage and burns; these shared magic lists already travel in world
// snapshots, so guests only need to draw their motion. All drawing lives in src/fx/kitsune.mjs.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'kitsune-lantern';
// Reuse the same nine tail slots so every volley spans the full fan symmetrically.
// FOXFIRE.tails stays nine: the separately triggered Kitsune Parade skill uses that count.
export const FOXFIRE_VOLLEYS = Object.freeze([
  Object.freeze([0, 4, 8]),
  Object.freeze([0, 2, 3, 5, 6, 8]),
  Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8]),
]);
/**
 * The spirit's colour, rolled each time the lantern is equipped (never the same twice running) and kept on
 * the wielder as `kitsuneLook` {hue, uid, on}, which travels to guests and saves.
 */
export const FOX_LOOKS = Object.freeze(['gold', 'red', 'violet']);
export const FOXFIRE = Object.freeze({
  tails: 9, damage: 7, cooldown: 1.6, range: 11, speed: 11.8, turn: 7.5,
  delay: .24, stagger: .055, castLife: .95, life: 2.8,
  burstRadius: 2, burstDamage: 10, burnDps: 2.5, burnSeconds: 1.6,
});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Nine-Tail Lantern', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: FOXFIRE.damage, durability: 180, cooldown: FOXFIRE.cooldown, stamina: 9,
    blurb: 'Wake a mischievous kitsune. Its tails loose three, six, then nine hunting foxfires; the ninth blooms into a spirit burst.',
  },
  mobs: [],
  sprites: {
    item: {src: 'assets/magic/kitsune-lantern/item.svg', icon: 'assets/magic/kitsune-lantern/icon.svg',
      size: [1.4, 1.8], anchor: [.5, .42],
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
  // Capture the equipped rank now; changing weapons while foxfires fly cannot change their damage.
  const power = ownerPower(world, player);
  // Player fields travel in both saved and network snapshots. Old players begin at three.
  const volley = Number.isInteger(player.kitsuneVolley) && player.kitsuneVolley >= 0
    ? player.kitsuneVolley % FOXFIRE_VOLLEYS.length : 0;
  const tailIndices = FOXFIRE_VOLLEYS[volley];
  const targets = hostiles(world).filter(e => Math.hypot(e.x-player.x, e.z-player.z) <= FOXFIRE.range)
    .sort((a, b) => targetScore(a, player, dx, dz)-targetScore(b, player, dx, dz)).slice(0, tailIndices.length);
  const cast = {id: world.nextId('foxcast'), packId: PACK, ownerId: player.id,
    x: player.x, z: player.z, dx, dz, age: 0, life: FOXFIRE.castLife,
    volleyCount: tailIndices.length, tailIndices: [...tailIndices]};
  (world.magicCasts ||= []).push(cast);
  for(let shotIndex = 0; shotIndex < tailIndices.length; shotIndex++){
    const tailIndex = tailIndices[shotIndex];
    const burst = tailIndices.length === FOXFIRE.tails && tailIndex === 8;
    const bolt = {id: world.nextId('foxfire'), packId: PACK, ownerId: player.id,
      x: player.x, z: player.z, orbitX: player.x, orbitZ: player.z, dx, dz,
      vx: dx*FOXFIRE.speed, vz: dz*FOXFIRE.speed, aim: Math.atan2(dz, dx),
      age: 0, life: FOXFIRE.life, delay: FOXFIRE.delay+shotIndex*FOXFIRE.stagger,
      tailIndex, burst, launched: false, traveled: 0, maxRange: FOXFIRE.range,
      power, damage: FOXFIRE.damage*power*(burst ? 2 : 1),
      targetId: targets.length ? targets[shotIndex % targets.length].id : null};
    orbit(bolt, player);
    (world.magicBolts ||= []).push(bolt);
  }
  world.wearEquipped(player, 'weapon', 1);
  player.dx = dx; player.dz = dz; player.rest = false;
  player.cooldown = FOXFIRE.cooldown;
  player.action = 'attack'; player.actionUntil = world.time+.72;
  // Only a successful basic cast advances the player's sequence; skills never call use().
  player.kitsuneVolley = (volley+1) % FOXFIRE_VOLLEYS.length;
  world.event('foxfire', player.x, player.z, '', {player: player.id});
  return cast;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  dress(world);
  ageVisuals(world, 'magicPuffs', dt);
  ageVisuals(world, 'magicCasts', dt);
  if(!world.magicBolts?.some(bolt => bolt.packId === PACK)) return;
  const foes = hostiles(world);
  for(let i = world.magicBolts.length-1; i >= 0; i--){
    const bolt = world.magicBolts[i];
    if(bolt.packId !== PACK) continue;
    const before = bolt.age;
    bolt.age += dt;
    let flight = dt;
    if(!bolt.launched){
      const owner = world.players?.find(p => p.id === bolt.ownerId);
      orbit(bolt, owner);
      if(bolt.age < bolt.delay) continue;
      bolt.launched = true;
      flight = Math.min(dt, bolt.age-bolt.delay);
      const target = seek(bolt, foes);
      const angle = target ? Math.atan2(target.z-bolt.z, target.x-bolt.x) : Math.atan2(bolt.dz, bolt.dx)+(bolt.tailIndex-4)*.12;
      bolt.aim = angle;
      bolt.vx = Math.cos(angle)*FOXFIRE.speed; bolt.vz = Math.sin(angle)*FOXFIRE.speed;
    }
    // Life is a failsafe; travel, not wall-clock age, defines the projectile's reach.
    flight = Math.min(flight, Math.max(0, bolt.life-Math.max(before, bolt.delay)));
    const target = seek(bolt, foes);
    if(target){
      const want = Math.atan2(target.z-bolt.z, target.x-bolt.x), have = Math.atan2(bolt.vz, bolt.vx);
      const delta = Math.atan2(Math.sin(want-have), Math.cos(want-have));
      bolt.aim = have+Math.max(-FOXFIRE.turn*flight, Math.min(FOXFIRE.turn*flight, delta));
      bolt.vx = Math.cos(bolt.aim)*FOXFIRE.speed; bolt.vz = Math.sin(bolt.aim)*FOXFIRE.speed;
    }
    const travel = Math.min(FOXFIRE.speed*flight, Math.max(0, bolt.maxRange-bolt.traveled));
    const x0 = bolt.x, z0 = bolt.z;
    const x1 = x0+bolt.vx/FOXFIRE.speed*travel, z1 = z0+bolt.vz/FOXFIRE.speed*travel;
    const hit = firstHit(foes, x0, z0, x1, z1);
    bolt.x = hit ? hit.x : x1; bolt.z = hit ? hit.z : z1;
    bolt.traveled += travel;
    const finished = hit || bolt.traveled >= bolt.maxRange-1e-6 || bolt.age >= bolt.life;
    if(!finished) continue;
    if(hit) harm(world, hit.enemy, bolt, bolt.damage);
    // The last tail detonates even at the end of its range, so a near miss still has teeth.
    if(bolt.burst ?? (bolt.tailIndex === 8)){
      for(const enemy of foes){
        if(enemy === hit?.enemy || !(enemy.hp > 0)) continue;
        if(Math.hypot(enemy.x-bolt.x, enemy.z-bolt.z) <= FOXFIRE.burstRadius){
          harm(world, enemy, bolt, FOXFIRE.burstDamage*bolt.power);
        }
      }
      world.event('foxburst', bolt.x, bolt.z, '', {player: bolt.ownerId});
    }
    puff(world, bolt, !!hit);
    world.magicBolts.splice(i, 1);
  }
}

/** Host: a fresh colour whenever the lantern is equipped; `on` goes false when it is put away. */
function dress(world){
  for(const p of world.players || []){
    const weapon = p.equipment?.weapon, look = p.kitsuneLook;
    if(weapon?.itemId === PACK){
      if(look?.on && look.uid === weapon.uid) continue;
      const choices = FOX_LOOKS.filter(hue => hue !== look?.hue);
      const roll = hashOf(`${p.id}|${weapon.uid}|${Math.round((world.time || 0)*1000)}`);
      p.kitsuneLook = {hue: choices[roll%choices.length], uid: weapon.uid, on: true};
    }else if(look?.on) p.kitsuneLook = {...look, on: false};
  }
}
function hashOf(text){
  let h = 2166136261;
  for(let i = 0; i < text.length; i++){h ^= text.charCodeAt(i); h = Math.imul(h, 16777619);}
  return (h >>> 0);
}

function ageVisuals(world, key, dt){
  const list = world[key];
  if(!Array.isArray(list)) return;
  for(let i = list.length-1; i >= 0; i--){
    const entry = list[i];
    if(entry.packId !== PACK) continue;
    entry.age += dt;
    if(key === 'magicCasts'){
      const owner = world.players?.find(p => p.id === entry.ownerId);
      if(owner){entry.x = owner.x; entry.z = owner.z;}
    }
    if(entry.age >= entry.life) list.splice(i, 1);
  }
}

/**
 * Before launch a foxfire gathers on a tail tip, which hangs behind the wielder: on the ground plane
 * that is a spot just behind their back, fanned sideways by tail. It launches from there.
 */
function orbit(bolt, owner){
  const x = owner?.x ?? bolt.orbitX, z = owner?.z ?? bolt.orbitZ;
  const side = owner && owner.dx < -.1 ? -1 : 1, fan = (bolt.tailIndex-4)/4;
  bolt.x = x-side*.35+fan*.9;
  bolt.z = z-.2;
  bolt.orbitX = x; bolt.orbitZ = z;
  bolt.aim = Math.atan2(bolt.dz, bolt.dx)+fan*.5;
  bolt.vx = Math.cos(bolt.aim)*FOXFIRE.speed; bolt.vz = Math.sin(bolt.aim)*FOXFIRE.speed;
}

function hostiles(world){
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.id != null && e.hp > 0 &&
    !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
}

function targetScore(enemy, origin, dx, dz){
  const x = enemy.x-origin.x, z = enemy.z-origin.z, distance = Math.hypot(x, z);
  return distance*(1.2-.2*(distance > 1e-6 ? (x*dx+z*dz)/distance : 1));
}

function seek(bolt, foes){
  const remaining = Math.max(0, bolt.maxRange-bolt.traveled);
  const current = foes.find(e => e.id === bolt.targetId && e.hp > 0 && Math.hypot(e.x-bolt.x, e.z-bolt.z) <= remaining+.8);
  if(current) return current;
  let best = null, score = Infinity;
  for(const enemy of foes){
    if(!(enemy.hp > 0) || Math.hypot(enemy.x-bolt.x, enemy.z-bolt.z) > Math.min(7, remaining+.8)) continue;
    const value = targetScore(enemy, bolt, bolt.vx/FOXFIRE.speed, bolt.vz/FOXFIRE.speed);
    if(value < score){best = enemy; score = value;}
  }
  bolt.targetId = best?.id ?? null;
  return best;
}

function firstHit(foes, x0, z0, x1, z1){
  const dx = x1-x0, dz = z1-z0, length2 = dx*dx+dz*dz;
  let best = null;
  for(const enemy of foes){
    if(!(enemy.hp > 0)) continue;
    const t = length2 > 1e-10 ? Math.max(0, Math.min(1, ((enemy.x-x0)*dx+(enemy.z-z0)*dz)/length2)) : 0;
    const x = x0+dx*t, z = z0+dz*t;
    const radius = enemy.type === 'king' ? 1.3 : enemy.type === 'golem' || enemy.type === 'brute' ? 1 : .65;
    if(Math.hypot(enemy.x-x, enemy.z-z) <= radius && (!best || t < best.t)) best = {enemy, t, x, z};
  }
  return best;
}

function harm(world, enemy, bolt, amount){
  // Queue only once. Setting both enemy.pendingHit and the queue can swallow a second tail's hit.
  // No knockback: magic weapons only hurt (progression KNOCKBACK_WEAPONS).
  (world.pendingHit ||= []).push({targetId: enemy.id, amount: Math.max(1, Math.round(amount)), ownerId: bolt.ownerId});
  (world.pendingBurn ||= []).push({targetId: enemy.id, dps: FOXFIRE.burnDps*bolt.power, remaining: FOXFIRE.burnSeconds});
  enemy.lastHitBy = bolt.ownerId;
  if(enemy.home && !enemy.aggro) enemy.aggro = true;
}

function puff(world, bolt, hit){
  // Skill rings and older snapshots lack the explicit basic-volley finisher flag.
  const burst = bolt.burst ?? (bolt.tailIndex === 8);
  (world.magicPuffs ||= []).push({id: world.nextId('foxpuff'), packId: PACK, ownerId: bolt.ownerId,
    x: bolt.x, z: bolt.z, age: 0, life: burst ? 1.1 : .5,
    tailIndex: bolt.tailIndex, radius: burst ? FOXFIRE.burstRadius : .75, burst, hit});
}
