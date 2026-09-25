// Engine functions called: none.
// World has no public call that damages a hostile. World.hurt injures players,
// and World.wearEquipped ignores item ids that are not in content.mjs.
// use() therefore queues the hit and the knock for the host to apply:
//   pendingHit = { targetId, amount }   pushed onto world.pendingHit
//   pendingKnock = { targetId, dx, dz } pushed onto world.pendingKnock
// dx/dz are a world-unit push away from the caster (about 1.6). Players are never queued.
// step() only ages sweeps whose id starts with "spirit-fan:" and drops them at the end.

const ID = 'spirit-fan';
const DAMAGE = 5;
const DURABILITY = 80;
const COOLDOWN = 1.3;
const RANGE = 4.5;
const PUSH = 1.6;
const SWEEP_DURATION = 0.35;
const HALF_ARC = (110 * Math.PI / 180) / 2;
const CONE_COS = Math.cos(HALF_ARC);

export const magicPack = {
  id: ID,
  item: {
    id: ID,
    name: 'Spirit Fan',
    kind: 'weapon',
    slot: 'weapon',
    damage: DAMAGE,
    durability: DURABILITY,
    cooldown: COOLDOWN,
    blurb: 'A dried-leaf and bone fan. Its gust shoves the restless dead aside.',
  },
  mobs: [],
  sprites: {
    item: 'assets/magic/spirit-fan/item.png',
    // Four frames of one sweep, in order, across the 0.35s duration.
    // Each frame is 240×548 and transparent. Bottom center is the fan pivot,
    // placed on the caster. Image up is the cast direction: x = cos(facing),
    // z = sin(facing). The gust above the fan is translucent.
    sweep: [
      'assets/magic/spirit-fan/sweep-1.png',
      'assets/magic/spirit-fan/sweep-2.png',
      'assets/magic/spirit-fan/sweep-3.png',
      'assets/magic/spirit-fan/sweep-4.png',
    ],
  },
};

function unitFacing(player) {
  const x = Number(player.dx) || 0;
  const z = Number(player.dz) || 0;
  const len = Math.hypot(x, z);
  if (len < 1e-8) return {x: 0, z: 1};
  return {x: x / len, z: z / len};
}

function playerIds(world) {
  const ids = new Set();
  if (!Array.isArray(world.players)) return ids;
  for (const person of world.players) {
    if (person && person.id != null) ids.add(person.id);
  }
  return ids;
}

function hostiles(world) {
  if (!Array.isArray(world.enemies)) return [];
  const people = playerIds(world);
  const list = [];
  for (const mob of world.enemies) {
    if (!mob || mob.id == null || people.has(mob.id)) continue;
    if (typeof mob.hp === 'number' && !(mob.hp > 0)) continue;
    if (!Number.isFinite(mob.x) || !Number.isFinite(mob.z)) continue;
    list.push(mob);
  }
  return list;
}

// Knock vector of length PUSH, or null when the mob is outside the cone.
function knockFrom(caster, facing, mob) {
  const dx = mob.x - caster.x;
  const dz = mob.z - caster.z;
  const dist = Math.hypot(dx, dz);
  if (!Number.isFinite(dist) || dist > RANGE) return null;
  if (dist <= 1e-8) return {dx: facing.x * PUSH, dz: facing.z * PUSH};
  const dot = (dx * facing.x + dz * facing.z) / dist;
  if (dot + 1e-6 < CONE_COS) return null;
  return {dx: (dx / dist) * PUSH, dz: (dz / dist) * PUSH};
}

function queue(world, key, entry) {
  const current = world[key];
  if (Array.isArray(current)) current.push(entry);
  else if (current == null) world[key] = [entry];
  else world[key] = [current, entry];
}

function spendDurability(player) {
  const weapon = player.equipment.weapon;
  weapon.durability -= 1;
  if (weapon.durability > 0) return;
  player.equipment.weapon = null;
  if (Number.isInteger(player.equipmentRevision)) player.equipmentRevision += 1;
}

export function use(world, player) {
  if (!world || !player || player.ghost || player.down > 0 || player.online === false) return null;
  const weapon = player.equipment && player.equipment.weapon;
  if (!weapon || weapon.itemId !== ID || !(weapon.durability > 0)) return null;
  if (typeof player.cooldown === 'number' && player.cooldown > 0) return null;
  if (!Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;

  const facing = unitFacing(player);
  const seen = new Set();
  for (const mob of hostiles(world)) {
    if (seen.has(mob.id)) continue;
    const knock = knockFrom(player, facing, mob);
    if (!knock) continue;
    seen.add(mob.id);
    queue(world, 'pendingHit', {targetId: mob.id, amount: DAMAGE});
    queue(world, 'pendingKnock', {targetId: mob.id, dx: knock.dx, dz: knock.dz});
  }

  player.cooldown = COOLDOWN;
  player.rest = false;
  player.action = 'attack';
  player.actionUntil = (Number.isFinite(world.time) ? world.time : 0) + SWEEP_DURATION;
  spendDurability(player);

  const seq = Number.isInteger(world.spiritFanSeq) ? world.spiritFanSeq + 1 : 1;
  world.spiritFanSeq = seq;
  const sweep = {
    id: `${ID}:${seq}`,
    ownerId: player.id,
    x: player.x,
    z: player.z,
    // Radians, atan2(dz, dx). Same direction as player.dx / player.dz.
    facing: Math.atan2(facing.z, facing.x),
    age: 0,
    duration: SWEEP_DURATION,
  };
  if (!Array.isArray(world.magicSweeps)) world.magicSweeps = [];
  world.magicSweeps.push(sweep);
  return sweep;
}

export function step(world, dt) {
  const sweeps = world && world.magicSweeps;
  if (!Array.isArray(sweeps) || sweeps.length === 0) return;
  const advance = Number.isFinite(dt) && dt > 0 ? dt : 0;
  let removed = false;
  const kept = [];
  for (const sweep of sweeps) {
    if (!sweep || typeof sweep.id !== 'string' || !sweep.id.startsWith(`${ID}:`)) {
      kept.push(sweep);
      continue;
    }
    sweep.age = (Number(sweep.age) || 0) + advance;
    if (sweep.age < sweep.duration) kept.push(sweep);
    else removed = true;
  }
  if (removed) world.magicSweeps = kept;
}
