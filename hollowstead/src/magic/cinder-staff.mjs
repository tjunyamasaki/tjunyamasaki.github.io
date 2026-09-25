/**
 * Cinder Staff. A crooked staff in the weapon socket. Use throws one firebolt.
 *
 * Damage functions: this pack does not call World.hurt or World.hurtQuiet.
 * Those injure players (armor, downed state, chest release). Firebolts never
 * damage players, and they never touch trees, nodes, or buildings, so a miss
 * cannot set the forest on fire.
 *
 * There is no engine method that damages a hostile. World.attack, briar traps,
 * and ward bolts write the mob directly, and impact and burn do the same:
 *   enemy.hp -= amount
 *   world.event('damage', x, z, String(amount))
 * when world.events is an array and world.eventId is finite. World.tick still
 * owns loot and removal when hp drops to 0. Call step on the host before that
 * sweep if the kill should resolve in the same tick.
 *
 * Durability: World.wearEquipped is tried first (one point per shot). wearStack
 * ignores an item itemDefinition does not know, so until cinder-staff is in
 * EQUIPMENT the point is spent on the socket stack. The socket clears at 0.
 *
 * Integrator: call use(world, player) instead of World.attack while this weapon
 * is equipped, and call step(world, dt) from the host tick. Projectile frames
 * point toward +x; aim them with atan2(bolt.vz, bolt.vx). Misses and hits leave
 * a short puff on world.magicPuffs. Cast poses sit on world.magicCasts. Burns
 * sit on world.magicBurns as { targetId, remaining, dps, tick }.
 * No pendingHit / pendingBurn: damage is applied here.
 */

const PACK = 'cinder-staff';
const SPEED = 9;
const MAX_RANGE = 8;
const HIT_RADIUS = 0.8;
const SPAWN_AHEAD = 0.55;
const BURN_DPS = 2;
const BURN_DURATION = 2;
const FRAME_COUNT = 4;
const FRAME_FPS = 12;
const CAST_LIFE = FRAME_COUNT / FRAME_FPS;

// src paths are relative to hollowstead/. Prefixed keys are the theme ids the
// renderer looks up (item id, cast, bolt, puff) so they do not collide with
// another pack's generic names.
const itemSprite = {
  src: 'assets/magic/cinder-staff/item.png',
  size: [1.1, 1.65],
  anchor: [0.5, 0.04],
  columns: 1,
  rows: 1,
  clips: { idle: { frames: [0], fps: 1 } },
};

const castSprite = {
  src: 'assets/magic/cinder-staff/cast.png',
  size: [1.45, 2.18],
  anchor: [0.5, 0.5],
  columns: 4,
  rows: 1,
  clips: {
    idle: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
    attack: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
  },
};

const projectileSprite = {
  src: 'assets/magic/cinder-staff/projectile.png',
  size: [0.95, 0.95],
  anchor: [0.5, 0.5],
  columns: 4,
  rows: 1,
  clips: {
    idle: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
    fly: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
  },
};

const impactSprite = {
  src: 'assets/magic/cinder-staff/impact.png',
  size: [1.2, 1.2],
  anchor: [0.5, 0.5],
  columns: 4,
  rows: 1,
  clips: {
    idle: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
    impact: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
  },
};

export const magicPack = {
  id: PACK,
  item: {
    id: PACK,
    name: 'Cinder Staff',
    kind: 'weapon',
    slot: 'weapon',
    damage: 8,
    durability: 90,
    cooldown: 0.9,
    icon: 'cinder-staff',
    blurb: 'A crooked staff. Its ember throws a firebolt that burns the first hostile it hits.',
  },
  mobs: [],
  sprites: {
    item: itemSprite,
    cast: castSprite,
    projectile: projectileSprite,
    impact: impactSprite,
    'cinder-staff': itemSprite,
    'cinder-staff-cast': castSprite,
    'cinder-staff-bolt': projectileSprite,
    'cinder-staff-impact': impactSprite,
  },
};

const DAMAGE = magicPack.item.damage;
const COOLDOWN = magicPack.item.cooldown;

export function use(world, player) {
  if (!world || !player || player.down || player.ghost) return null;
  if (player.cooldown > 0) return null;
  const weapon = player.equipment?.weapon;
  if (!weapon || weapon.itemId !== PACK || !(weapon.durability > 0)) return null;
  if (!spendShot(world, player)) return null;

  const face = aim(player);
  player.dx = face.x;
  player.dz = face.z;
  player.cooldown = COOLDOWN;
  player.rest = false;
  if (Number.isFinite(world.time)) {
    player.action = 'attack';
    player.actionUntil = world.time + CAST_LIFE;
  }

  const x = (Number(player.x) || 0) + face.x * SPAWN_AHEAD;
  const z = (Number(player.z) || 0) + face.z * SPAWN_AHEAD;
  const bolt = {
    id: mint(world, 'bolt'),
    ownerId: player.id,
    packId: PACK,
    x,
    z,
    vx: face.x * SPEED,
    vz: face.z * SPEED,
    age: 0,
    maxRange: MAX_RANGE,
    damage: DAMAGE,
    frame: 0,
    traveled: 0,
    sprite: 'cinder-staff-bolt',
    aim: Math.atan2(face.z, face.x),
  };
  if (!Array.isArray(world.magicBolts)) world.magicBolts = [];
  world.magicBolts.push(bolt);
  rememberCast(world, player, face);
  emit(world, 'bolt', x, z, '', { sx: player.x, sz: player.z });
  return bolt;
}

export function step(world, dt) {
  if (!world || typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;
  // Missing lists stay missing. A world that has never cast is unchanged.
  // Puffs and casts already in the world age first, so a puff spawned by this
  // step keeps its first frame until the next tick.
  stepPuffs(world, dt);
  stepCasts(world, dt);
  stepBolts(world, dt);
  stepBurns(world, dt);
}

function stepBolts(world, dt) {
  const bolts = world.magicBolts;
  if (!Array.isArray(bolts) || bolts.length === 0) return;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const bolt = bolts[i];
    if (!bolt || bolt.packId !== PACK) continue;
    if (!flyBolt(world, bolt, dt)) bolts.splice(i, 1);
  }
}

function flyBolt(world, bolt, dt) {
  const speed = Math.hypot(bolt.vx, bolt.vz);
  if (!(speed > 0)) {
    spawnPuff(world, bolt.x, bolt.z, 2);
    return false;
  }
  const traveled = Number.isFinite(bolt.traveled) ? bolt.traveled : 0;
  const maxRange = Number.isFinite(bolt.maxRange) ? bolt.maxRange : MAX_RANGE;
  let travel = speed * dt;
  let reachedEnd = false;
  if (travel >= maxRange - traveled) {
    travel = Math.max(0, maxRange - traveled);
    reachedEnd = true;
  }
  const x0 = bolt.x;
  const z0 = bolt.z;
  const x1 = x0 + (bolt.vx / speed) * travel;
  const z1 = z0 + (bolt.vz / speed) * travel;
  bolt.age += travel / speed;
  bolt.traveled = traveled + travel;
  bolt.frame = frameAt(bolt.age);
  const hit = firstHostile(world, x0, z0, x1, z1);
  if (hit) {
    bolt.x = hit.x;
    bolt.z = hit.z;
    const amount = bolt.damage > 0 ? bolt.damage : DAMAGE;
    harmHostile(world, hit.enemy, amount);
    attachBurn(world, hit.enemy.id);
    spawnPuff(world, hit.x, hit.z, 0);
    return false;
  }
  bolt.x = x1;
  bolt.z = z1;
  if (reachedEnd || bolt.traveled >= maxRange - 1e-6) {
    spawnPuff(world, bolt.x, bolt.z, 2);
    return false;
  }
  return true;
}

function stepBurns(world, dt) {
  const burns = world.magicBurns;
  if (!Array.isArray(burns) || burns.length === 0) return;
  const players = playerIds(world);
  for (let i = burns.length - 1; i >= 0; i--) {
    const burn = burns[i];
    if (!burn || burn.packId !== PACK) continue;
    const enemy = findEnemy(world, burn.targetId);
    if (!enemy || !(enemy.hp > 0) || players.has(burn.targetId)) {
      burns.splice(i, 1);
      continue;
    }
    const slice = Math.min(Math.max(0, burn.remaining), dt);
    burn.tick += slice;
    burn.remaining -= slice;
    // 0.05 does not add up to 1 in binary, so a finished second can sit just under 1.
    while (burn.tick + 1e-8 >= 1 && enemy.hp > 0) {
      burn.tick -= 1;
      if (burn.tick < 1e-8) burn.tick = 0;
      harmHostile(world, enemy, burn.dps);
    }
    if (!(enemy.hp > 0) || burn.remaining <= 1e-6) burns.splice(i, 1);
  }
}

function stepPuffs(world, dt) {
  const puffs = world.magicPuffs;
  if (!Array.isArray(puffs) || puffs.length === 0) return;
  for (let i = puffs.length - 1; i >= 0; i--) {
    const puff = puffs[i];
    if (!puff || puff.packId !== PACK) continue;
    puff.age += dt;
    puff.frame = Math.min(FRAME_COUNT - 1, Math.floor(puff.age * FRAME_FPS));
    if (puff.age >= puff.life) puffs.splice(i, 1);
  }
}

function stepCasts(world, dt) {
  const casts = world.magicCasts;
  if (!Array.isArray(casts) || casts.length === 0) return;
  for (let i = casts.length - 1; i >= 0; i--) {
    const cast = casts[i];
    if (!cast || cast.packId !== PACK) continue;
    cast.age += dt;
    cast.frame = Math.min(FRAME_COUNT - 1, Math.floor(cast.age * FRAME_FPS));
    if (cast.age >= cast.life) casts.splice(i, 1);
  }
}

function aim(player) {
  let x = Number(player.dx);
  let z = Number(player.dz);
  if (!Number.isFinite(x)) x = 0;
  if (!Number.isFinite(z)) z = 0;
  const len = Math.hypot(x, z);
  if (len < 1e-4) return { x: 0, z: 1 };
  return { x: x / len, z: z / len };
}

function spendShot(world, player) {
  const before = player.equipment?.weapon;
  if (!before || before.itemId !== PACK || !(before.durability > 0)) return false;
  const previous = before.durability;
  if (typeof world.wearEquipped === 'function') world.wearEquipped(player, 'weapon', 1);
  const after = player.equipment?.weapon;
  if (!after) return true;
  if (after.itemId !== PACK) return true;
  if (after.durability === previous) {
    after.durability = previous - 1;
    if (after.durability <= 0) {
      player.equipment.weapon = null;
      if (Number.isInteger(player.equipmentRevision)) player.equipmentRevision += 1;
    }
  }
  return true;
}

function rememberCast(world, player, face) {
  if (!Array.isArray(world.magicCasts)) world.magicCasts = [];
  world.magicCasts.push({
    id: mint(world, 'cast'),
    ownerId: player.id,
    packId: PACK,
    x: player.x,
    z: player.z,
    dx: face.x,
    dz: face.z,
    age: 0,
    frame: 0,
    life: CAST_LIFE,
    sprite: 'cinder-staff-cast',
    aim: Math.atan2(face.z, face.x),
    action: 'attack',
  });
}

function firstHostile(world, x0, z0, x1, z1) {
  if (!Array.isArray(world.enemies)) return null;
  const players = playerIds(world);
  let best = null;
  for (const enemy of world.enemies) {
    if (!enemy || enemy.id == null || !(enemy.hp > 0) || players.has(enemy.id)) continue;
    if (!Number.isFinite(enemy.x) || !Number.isFinite(enemy.z)) continue;
    const hit = closestOnSegment(enemy.x, enemy.z, x0, z0, x1, z1);
    if (hit.d > HIT_RADIUS) continue;
    if (!best || hit.t < best.t - 1e-9 || (Math.abs(hit.t - best.t) <= 1e-9 && hit.d < best.d)) {
      best = { enemy, t: hit.t, d: hit.d, x: hit.x, z: hit.z };
    }
  }
  return best;
}

function closestOnSegment(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 1e-10) t = ((px - x0) * dx + (pz - z0) * dz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const x = x0 + dx * t;
  const z = z0 + dz * t;
  return { t, x, z, d: Math.hypot(px - x, pz - z) };
}

function harmHostile(world, enemy, amount) {
  if (!enemy || !(enemy.hp > 0) || !(amount > 0)) return;
  enemy.hp -= amount;
  const shown = Math.round(amount);
  emit(world, 'damage', enemy.x, enemy.z, String(shown > 0 ? shown : amount));
}

function attachBurn(world, targetId) {
  if (targetId == null) return null;
  if (!Array.isArray(world.magicBurns)) world.magicBurns = [];
  const existing = world.magicBurns.find(burn => burn && burn.packId === PACK && burn.targetId === targetId);
  if (existing) {
    existing.remaining = BURN_DURATION;
    existing.dps = BURN_DPS;
    return existing;
  }
  const burn = { targetId, remaining: BURN_DURATION, dps: BURN_DPS, tick: 0, packId: PACK };
  world.magicBurns.push(burn);
  return burn;
}

function spawnPuff(world, x, z, startFrame) {
  if (!Array.isArray(world.magicPuffs)) world.magicPuffs = [];
  const life = .55;
  world.magicPuffs.push({
    id: mint(world, 'puff'),
    packId: PACK,
    x,
    z,
    age: startFrame / FRAME_FPS,
    frame: startFrame,
    life,
    sprite: 'cinder-staff-impact',
  });
  emit(world, 'impact', x, z, '');
}

function findEnemy(world, id) {
  if (!Array.isArray(world.enemies)) return null;
  return world.enemies.find(enemy => enemy && enemy.id === id) || null;
}

function playerIds(world) {
  const ids = new Set();
  if (Array.isArray(world.players)) {
    for (const player of world.players) if (player && player.id != null) ids.add(player.id);
  }
  return ids;
}

function frameAt(age) {
  const index = Math.floor(age * FRAME_FPS);
  return ((index % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
}

function mint(world, prefix) {
  if (typeof world.nextId === 'function') return world.nextId(prefix);
  world.magicSerial = (world.magicSerial || 0) + 1;
  return `${prefix}${world.magicSerial}`;
}

function emit(world, type, x, z, text, extra) {
  if (typeof world.event !== 'function' || !Array.isArray(world.events) || !Number.isFinite(world.eventId)) return;
  world.event(type, x, z, text, {...extra, magicPack: PACK});
}
