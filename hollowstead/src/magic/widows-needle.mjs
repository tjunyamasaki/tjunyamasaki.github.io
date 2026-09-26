/**
 * Widow's Needle. Pale bone wrapped in grave-silk, worn in the weapon socket.
 *
 * Host integration (World.attackMagic / World.stepMagic):
 * - use(world, player) starts one silk dart. attackMagic sets player.cooldown
 *   before calling use(), so this module does not treat a positive player.cooldown
 *   as "still busy" — that would swallow the shot. The pack's own 1.7s gate is
 *   world.widowsNeedleReady[playerId], compared with world.time.
 * - step(world, dt) advances only entries with packId 'widows-needle'.
 *   A world with no such darts, roots, or casts is a no-op and creates nothing.
 * - Durability: one point per shot. World.wearEquipped is used when it spends
 *   the point; otherwise the socket stack is spent directly and cleared at 0.
 *   attackMagic also wears a point if use() left durability unchanged, so use()
 *   must change it (or clear the socket) to avoid a second point.
 *
 * Root lock — integrator, read this if movement still chases:
 *   While a hostile is pinned, step() writes on that mob:
 *     magicRootRemaining  seconds left, 0 when the pin ends
 *     magicRootX, magicRootZ  hold point
 *   and keeps { targetId, remaining, pinX, pinZ } on world.magicRoots.
 *   World.tickRoot already skips chasing while magicRootRemaining > 0, then
 *   subtracts dt from the field. step() writes the remaining time again from
 *   world.magicRoots, so that extra subtract does not shorten the 2.5s pin.
 *   If a later movement pass overwrites x/z or clears the field, skip the mob
 *   while magicRootRemaining > 0, or put x/z back to magicRootX/magicRootZ.
 *   Players are never rooted.
 *
 * Damage — this module does not call World.hurt (that injures players) and
 * does not subtract hp itself. Each packet is:
 *   pendingHit = { targetId, amount }
 * set on the hostile. World.consumeMagicPayloads reads that field and deletes
 * it. The same object is appended to world.pendingHit for a queue reader.
 * Apply only one of those two or the hit lands twice. Impact is 3 when the
 * dart pins. Two further 1-point packets (2 total) fall across the 2.5s root.
 * A miss still flies 7 units and fizzles. Players are never queued.
 *
 * Sprite src values are relative to hollowstead/ (assets/magic/widows-needle/).
 */

import { ownerPower } from './registry.mjs?v=harvest-16';

const PACK = 'widows-needle';
const RANGE = 9;
const CONE = 35 * Math.PI / 180;
const CONE_COS = Math.cos(CONE / 2);
const ROOT = 2.5;
// Balance (Long Night): a 26 point pin, then 12 more bleeding out across the root.
const IMPACT = 26;
const BLEED = 12;
const DART_SPEED = 20;
const FRAME_FPS = 12;
const FRAME_COUNT = 4;
const CAST_LIFE = FRAME_COUNT / FRAME_FPS;

const itemSprite = {
  src: 'assets/magic/widows-needle/item.png',
  size: [1.1, 1.65],
  anchor: [0.5, 0.04],
  columns: 1,
  rows: 1,
  clips: {
    idle: { frames: [0], fps: 1 },
    attack: { frames: [0], fps: 1 },
  },
};

const castSprite = {
  src: 'assets/magic/widows-needle/cast.png',
  size: [1.35, 2.02],
  anchor: [0.5, 0.08],
  columns: 4,
  rows: 1,
  clips: {
    idle: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
    attack: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
  },
};

const dartSprite = {
  src: 'assets/magic/widows-needle/dart.png',
  size: [1.05, 1.58],
  anchor: [0.5, 0.12],
  columns: 4,
  rows: 1,
  clips: {
    idle: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
    fly: { frames: [0, 1, 2, 3], fps: FRAME_FPS },
  },
};

const pinSprite = {
  // Web sits in the upper half of each 128×192 cell so a feet-anchored
  // billboard rests the pin on the victim's torso.
  src: 'assets/magic/widows-needle/pin.png',
  size: [1.15, 1.9],
  anchor: [0.5, 0.02],
  columns: 4,
  rows: 1,
  clips: {
    idle: { frames: [0, 1, 2, 3], fps: 8 },
    pin: { frames: [0, 1, 2, 3], fps: 8 },
  },
};

export const magicPack = {
  id: PACK,
  item: {
    id: PACK,
    name: "Widow's Needle",
    icon: PACK,
    kind: 'weapon',
    slot: 'weapon',
    damage: IMPACT,
    durability: 140,
    cooldown: 1.0,
    stamina: 6,
    blurb: 'A pale bone needle wrapped in grave-silk. The dart pins the nearest foe ahead.',
  },
  mobs: [],
  sprites: {
    item: itemSprite,
    cast: castSprite,
    dart: dartSprite,
    pin: pinSprite,
    [PACK]: itemSprite,
    'widows-needle-cast': castSprite,
    'widows-needle-dart': dartSprite,
    'widows-needle-pin': pinSprite,
  },
};

const COOLDOWN = magicPack.item.cooldown;

export function use(world, player) {
  if (!world || !player || player.ghost || player.down > 0 || player.online === false) return null;
  if (!Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const weapon = player.equipment && player.equipment.weapon;
  if (!weapon || weapon.itemId !== PACK || !(weapon.durability > 0)) return null;
  if (!ready(world, player)) return null;
  if (!spendShot(world, player)) return null;

  const face = aim(player);
  player.dx = face.x;
  player.dz = face.z;
  player.cooldown = Math.max(Number(player.cooldown) || 0, COOLDOWN);
  player.rest = false;
  if (Number.isFinite(world.time)) {
    player.action = 'attack';
    player.actionUntil = world.time + CAST_LIFE;
  }
  markReady(world, player);

  const aimHit = closestInCone(world, player, face);
  const dart = {
    id: mint(world, 'dart'),
    packId: PACK,
    kind: 'dart',
    ownerId: player.id,
    power: ownerPower(world, player),
    x: player.x,
    z: player.z,
    originX: player.x,
    originZ: player.z,
    dx: face.x,
    dz: face.z,
    traveled: 0,
    range: RANGE,
    pinAt: aimHit ? aimHit.along : null,
    targetId: aimHit ? aimHit.mob.id : null,
    age: 0,
    frame: 0,
    sprite: 'widows-needle-dart',
    action: 'idle',
  };
  if (!Array.isArray(world.magicDarts)) world.magicDarts = [];
  world.magicDarts.push(dart);
  if (!Array.isArray(world.magicRoots)) world.magicRoots = [];
  rememberCast(world, player, face);
  return dart;
}

export function step(world, dt) {
  if (!world || typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;
  if (!hasOurs(world.magicDarts) && !hasOurs(world.magicRoots) && !hasOurs(world.magicCasts)) return;
  stepCasts(world, dt);
  stepDarts(world, dt);
  stepRoots(world, dt);
}

export function visuals(world) {
  if (!world) return [];
  const rows = [];
  for (const list of [world.magicDarts, world.magicCasts, world.magicRoots]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) if (entry && entry.packId === PACK) rows.push(entry);
  }
  return rows;
}

function hasOurs(list) {
  return Array.isArray(list) && list.some(entry => entry && entry.packId === PACK);
}

function ready(world, player) {
  const book = world.widowsNeedleReady;
  if (!book || typeof book !== 'object') return true;
  const at = book[player.id];
  if (!(at > 0)) return true;
  const now = Number.isFinite(world.time) ? world.time : 0;
  return now + 1e-9 >= at;
}

function markReady(world, player) {
  if (!world.widowsNeedleReady || typeof world.widowsNeedleReady !== 'object' || Array.isArray(world.widowsNeedleReady)) {
    world.widowsNeedleReady = Object.create(null);
  }
  const now = Number.isFinite(world.time) ? world.time : 0;
  world.widowsNeedleReady[player.id] = now + COOLDOWN;
}

function spendShot(world, player) {
  const before = player.equipment && player.equipment.weapon;
  if (!before || before.itemId !== PACK || !(before.durability > 0)) return false;
  const previous = before.durability;
  const revisionBefore = player.equipmentRevision;
  if (typeof world.wearEquipped === 'function') world.wearEquipped(player, 'weapon', 1);
  const after = player.equipment && player.equipment.weapon;
  if (!after || after.itemId !== PACK) {
    // wearEquipped already bumps the revision when it breaks the stack.
    if (Number.isInteger(revisionBefore) && player.equipmentRevision === revisionBefore) player.equipmentRevision += 1;
    return true;
  }
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
    packId: PACK,
    kind: 'cast',
    ownerId: player.id,
    x: player.x + face.x * 0.35,
    z: player.z + face.z * 0.35,
    dx: face.x,
    dz: face.z,
    age: 0,
    frame: 0,
    life: CAST_LIFE,
    sprite: 'widows-needle-cast',
    action: 'attack',
  });
}

function stepCasts(world, dt) {
  const casts = world.magicCasts;
  if (!Array.isArray(casts) || casts.length === 0) return;
  for (let i = casts.length - 1; i >= 0; i--) {
    const cast = casts[i];
    if (!cast || cast.packId !== PACK) continue;
    const owner = findPlayer(world, cast.ownerId);
    if (owner && Number.isFinite(owner.x) && Number.isFinite(owner.z)) {
      cast.x = owner.x + (cast.dx || 0) * 0.35;
      cast.z = owner.z + (cast.dz || 0) * 0.35;
    }
    cast.age += dt;
    cast.frame = Math.min(FRAME_COUNT - 1, Math.floor(cast.age * FRAME_FPS));
    if (cast.age >= cast.life) casts.splice(i, 1);
  }
}

function stepDarts(world, dt) {
  const darts = world.magicDarts;
  if (!Array.isArray(darts) || darts.length === 0) return;
  for (let i = darts.length - 1; i >= 0; i--) {
    const dart = darts[i];
    if (!dart || dart.packId !== PACK) continue;
    if (!flyDart(world, dart, dt)) darts.splice(i, 1);
  }
}

function flyDart(world, dart, dt) {
  const range = Number.isFinite(dart.range) ? dart.range : RANGE;
  const prev = Number.isFinite(dart.traveled) ? dart.traveled : 0;
  dart.age = (Number(dart.age) || 0) + dt;
  dart.frame = Math.floor(dart.age * FRAME_FPS) % FRAME_COUNT;
  dart.traveled = Math.min(range, prev + DART_SPEED * dt);
  const targetId = dart.targetId;
  const pinAt = Number.isFinite(dart.pinAt) ? dart.pinAt : null;
  if (targetId != null && pinAt != null && prev <= pinAt + 1e-8 && dart.traveled + 1e-8 >= pinAt) {
    dart.traveled = Math.min(dart.traveled, Math.max(0, pinAt));
    placeDart(dart);
    if (tryPin(world, dart)) return false;
    dart.targetId = null;
  }
  placeDart(dart);
  return dart.traveled < range - 1e-6;
}

function placeDart(dart) {
  dart.x = dart.originX + dart.dx * dart.traveled;
  dart.z = dart.originZ + dart.dz * dart.traveled;
}

function tryPin(world, dart) {
  const mob = findHostile(world, dart.targetId);
  if (!mob) return false;
  const killing = mob.hp <= IMPACT * (dart.power || 1);
  offer(world, mob, Math.round(IMPACT * (dart.power || 1)));
  if (killing) return true;
  if (!Array.isArray(world.magicRoots)) world.magicRoots = [];
  let root = world.magicRoots.find(entry => entry && entry.packId === PACK && entry.targetId === mob.id);
  if (!root) {
    root = {
      id: `${PACK}-pin:${mob.id}`,
      packId: PACK,
      kind: 'pin',
      targetId: mob.id,
      sprite: 'widows-needle-pin',
      action: 'idle',
      bleedSent: 0,
    };
    world.magicRoots.push(root);
  }
  root.age = 0;
  root.fresh = true;
  root.bleedSent = 0;
  root.power = dart.power || 1;
  root.remaining = ROOT;
  root.pinX = mob.x;
  root.pinZ = mob.z;
  root.x = mob.x;
  root.z = mob.z;
  root.frame = 0;
  hold(mob, root);
  return true;
}

function stepRoots(world, dt) {
  const roots = world.magicRoots;
  if (!Array.isArray(roots) || roots.length === 0) return;
  for (let i = roots.length - 1; i >= 0; i--) {
    const root = roots[i];
    if (!root || root.packId !== PACK) continue;
    if (!advanceRoot(world, root, dt)) roots.splice(i, 1);
  }
}

function advanceRoot(world, root, dt) {
  const mob = findHostile(world, root.targetId);
  if (!mob) {
    const corpse = findActor(world, root.targetId);
    if (corpse) release(corpse);
    return false;
  }
  if (root.fresh) {
    root.fresh = false;
    root.age = 0;
    root.remaining = ROOT;
    hold(mob, root);
    return true;
  }
  root.age = (Number(root.age) || 0) + dt;
  const elapsed = Math.min(ROOT, root.age);
  const due = root.age >= ROOT - 1e-8 ? BLEED : Math.floor(BLEED * (elapsed / ROOT) + 1e-9);
  const slice = due - (Number(root.bleedSent) || 0);
  root.bleedSent = due;
  if (slice > 0) offer(world, mob, slice * (root.power || 1));
  root.frame = Math.floor(root.age * 8) % FRAME_COUNT;
  if (root.age >= ROOT - 1e-8) {
    release(mob);
    return false;
  }
  root.remaining = ROOT - root.age;
  root.pinX = Number.isFinite(root.pinX) ? root.pinX : mob.x;
  root.pinZ = Number.isFinite(root.pinZ) ? root.pinZ : mob.z;
  hold(mob, root);
  return true;
}

function hold(mob, root) {
  mob.magicRootRemaining = root.remaining;
  mob.magicRootX = root.pinX;
  mob.magicRootZ = root.pinZ;
  mob.x = root.pinX;
  mob.z = root.pinZ;
  root.x = root.pinX;
  root.z = root.pinZ;
}

function release(mob) {
  mob.magicRootRemaining = 0;
  delete mob.magicRootX;
  delete mob.magicRootZ;
}

function offer(world, mob, amount) {
  if (!mob || mob.id == null || !(amount > 0)) return;
  if (playerIds(world).has(mob.id)) return;
  const prev = mob.pendingHit;
  let total = amount;
  if (typeof prev === 'number' && Number.isFinite(prev)) total += prev;
  else if (prev && typeof prev === 'object' && typeof prev.amount === 'number') total += prev.amount;
  const hit = { targetId: mob.id, amount: total };
  mob.pendingHit = hit;
  const queued = { targetId: mob.id, amount };
  const current = world.pendingHit;
  if (Array.isArray(current)) current.push(queued);
  else if (current == null) world.pendingHit = [queued];
  else world.pendingHit = [current, queued];
}

function closestInCone(world, player, face) {
  let best = null;
  for (const mob of hostiles(world)) {
    const dx = mob.x - player.x;
    const dz = mob.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (!Number.isFinite(dist) || dist > RANGE + 1e-6) continue;
    let along = 0;
    if (dist > 1e-6) {
      along = dx * face.x + dz * face.z;
      if (along / dist + 1e-6 < CONE_COS) continue;
      if (along < 0) continue;
    }
    const candidate = { mob, dist, along: Math.min(RANGE, Math.max(0, along)) };
    if (!best || candidate.dist < best.dist - 1e-6 || (Math.abs(candidate.dist - best.dist) <= 1e-6 && String(mob.id) < String(best.mob.id))) {
      best = candidate;
    }
  }
  return best;
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

function playerIds(world) {
  const ids = new Set();
  if (!Array.isArray(world.players)) return ids;
  for (const person of world.players) if (person && person.id != null) ids.add(person.id);
  return ids;
}

function isAlly(mob) {
  if (!mob || mob.hostile === true) return false;
  if (mob.ally || mob.friendly || mob.summon || mob.summoned || mob.summonedBy) return true;
  return mob.team === 'player' || mob.team === 'ally';
}

function hostiles(world) {
  const people = playerIds(world);
  const list = [];
  const seen = new Set();
  const sources = [];
  if (Array.isArray(world.enemies)) sources.push(world.enemies);
  if (Array.isArray(world.mobs)) sources.push(world.mobs);
  for (const source of sources) {
    for (const mob of source) {
      if (!mob || mob.id == null || seen.has(mob.id) || people.has(mob.id) || isAlly(mob)) continue;
      if (typeof mob.hp !== 'number' || !(mob.hp > 0)) continue;
      if (!Number.isFinite(mob.x) || !Number.isFinite(mob.z)) continue;
      seen.add(mob.id);
      list.push(mob);
    }
  }
  return list;
}

function findPlayer(world, id) {
  if (!Array.isArray(world.players)) return null;
  return world.players.find(person => person && person.id === id) || null;
}

function findActor(world, id) {
  if (id == null || playerIds(world).has(id)) return null;
  const sources = [];
  if (Array.isArray(world.enemies)) sources.push(world.enemies);
  if (Array.isArray(world.mobs)) sources.push(world.mobs);
  for (const source of sources) {
    const mob = source.find(entry => entry && entry.id === id);
    if (mob) return mob;
  }
  return null;
}

function findHostile(world, id) {
  const mob = findActor(world, id);
  if (!mob || isAlly(mob) || typeof mob.hp !== 'number' || !(mob.hp > 0)) return null;
  return mob;
}

function mint(world, kind) {
  world.widowsNeedleSeq = (Number.isInteger(world.widowsNeedleSeq) ? world.widowsNeedleSeq : 0) + 1;
  return `${PACK}:${kind}:${world.widowsNeedleSeq}`;
}
