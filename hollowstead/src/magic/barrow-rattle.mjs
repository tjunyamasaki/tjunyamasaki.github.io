// Barrow Rattle — allied skeletons for one weapon pack.
//
// World functions this module actually calls:
//   world.nextId('sk')                         mint a summon id when the method exists
//   world.obstacles()                          passed through to movement
//   world.move(summon, vx, vz, dt, obstacles)  same slide-and-clamp path players use
//   world.wearEquipped(player, 'weapon', 1)    one durability point on a successful summon
//   world.event('swing', x, z)                 when the rattle is shaken
//   world.event('damage', x, z, amount)        after a skeleton connects
//
// Allied skeletons are not pushed into world.enemies. That list is hostile AI:
// World.tick walks it and hurts players and buildings. Summons live on
// world.magicSummons, created here if it is missing.
//
// Damage uses the same mutation as World.attack, briar traps, and wards:
//   enemy.hp -= amount, a 0.32 nudge, then world.event('damage', ...).
// World.tick still awards the kill, the loot, and the removal on its next pass.
// If the target has no numeric hp, the summon sets
//   summon.pendingHit = { targetId, amount }
// and does not subtract anything. Apply that once, then delete pendingHit.
// A summon that already landed a hit does not leave pendingHit set.
//
// World.tick never damages magicSummons. Lower summon.hp from the outside if a
// hostile should hurt one; step() removes it at 0 hp or at 24 seconds.
//
// use() does nothing when this owner already has 4 living skeletons, when the
// rattle is still on cooldown, or when the equipped rattle has no durability
// left. A successful summon spends one durability point and raises
// player.cooldown to at least 2.2 seconds. If the caller assigns cooldown
// after use() returns, keep 2.2 rather than the unarmed 0.55.
//
// Skeletons move at 3.5, a bit under the wanderer's 4.2. Farther than 3 from
// their owner, with no hostile in sight, they hurry back at 4.4.
//
// Sprite strips are four cells in a row, 128×192 each (512×192), the same
// frame size as themes/harvest actors. Feet sit near the bottom. summon.sprite
// is the current cell, skeleton-<anim>-<0-3>.png. facing is -1 toward -x and
// 1 toward +x.

const ROOT = 'assets/magic/barrow-rattle'
const CAP = 4
const COOLDOWN = 2.2
const LIFE = 24
const SKELETON_HP = 24
const SKELETON_DAMAGE = 6
const RANGE = 0.8
const SPEED = 3.5
const CATCHUP = 4.4
const SIGHT = 12
const FOLLOW = 1.15
const SWING = 0.44
const HIT_AT = 0.22
const PERIOD = 1.15
const FRAMES = 4
const FRAME = ['0', '1', '2', '3']

const readyAt = new WeakMap()

export const magicPack = {
  id: 'barrow-rattle',
  item: {
    id: 'barrow-rattle',
    name: 'Barrow Rattle',
    kind: 'weapon',
    slot: 'weapon',
    damage: 4,
    durability: 60,
    cooldown: COOLDOWN,
    blurb: 'A grave-bone rattle. Shake it and a skeleton climbs out of the barrow. Four will walk with you.',
  },
  mobs: [{
    id: 'skeleton',
    name: 'Skeleton',
    hp: SKELETON_HP,
    damage: SKELETON_DAMAGE,
    sprites: {
      idle: `${ROOT}/skeleton-idle.png`,
      walk: `${ROOT}/skeleton-walk.png`,
      attack: `${ROOT}/skeleton-attack.png`,
    },
  }],
  sprites: {
    item: `${ROOT}/item.png`,
    use: `${ROOT}/use.png`,
  },
}

function now(world){
  return typeof world.time === 'number' && Number.isFinite(world.time) ? world.time : 0
}

function distance(a, b){
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0))
}

function living(summon){
  if(!summon || typeof summon !== 'object') return false
  if(typeof summon.hp === 'number' && summon.hp <= 0) return false
  if((summon.age || 0) >= LIFE) return false
  return true
}

function owned(world, ownerId){
  if(!Array.isArray(world.magicSummons)) return []
  return world.magicSummons.filter(summon => living(summon) && summon.ownerId === ownerId)
}

function isSkeleton(entity){
  if(!entity || typeof entity !== 'object') return false
  return entity.type === 'skeleton' || entity.kind === 'skeleton' || entity.mob === 'skeleton' || entity.name === 'Skeleton'
}

function hostiles(world){
  if(!Array.isArray(world.enemies)) return []
  const allies = new Set()
  if(Array.isArray(world.magicSummons)){
    for(const summon of world.magicSummons) if(summon && summon.id != null) allies.add(summon.id)
  }
  const found = []
  for(const enemy of world.enemies){
    if(!enemy || typeof enemy !== 'object') continue
    if(typeof enemy.hp === 'number' && enemy.hp <= 0) continue
    if(typeof enemy.x !== 'number' || typeof enemy.z !== 'number') continue
    if(isSkeleton(enemy) || enemy.ownerId || allies.has(enemy.id)) continue
    found.push(enemy)
  }
  return found
}

function nearest(list, from){
  let best = null
  let bestD = Infinity
  for(const entity of list){
    const d = distance(from, entity)
    if(d < bestD){ best = entity; bestD = d }
  }
  return best ? {entity: best, distance: bestD} : null
}

function framePath(anim, index){
  const slot = FRAME[index] || FRAME[0]
  return `${ROOT}/skeleton-${anim}-${slot}.png`
}

function paint(summon){
  const anim = summon.anim === 'walk' || summon.anim === 'attack' ? summon.anim : 'idle'
  summon.anim = anim
  let index = 0
  if(anim === 'attack'){
    const t = Math.max(0, Math.min(0.999, (summon.swingT || 0) / SWING))
    index = Math.floor(t * FRAMES)
  }else{
    const fps = anim === 'walk' ? 8 : 4
    index = Math.floor((summon.age || 0) * fps) % FRAMES
  }
  summon.sprite = framePath(anim, index)
}

function mintId(world){
  if(typeof world.nextId === 'function'){
    try{
      const id = world.nextId('sk')
      if(id != null && id !== '') return String(id)
    }catch{ /* fall through */ }
  }
  const n = Array.isArray(world.magicSummons) ? world.magicSummons.length + 1 : 1
  return `sk${n}`
}

function cooldownReady(world, ownerId){
  const table = readyAt.get(world)
  if(!table) return true
  const until = table.get(ownerId) || 0
  return now(world) + 1e-9 >= until
}

function armCooldown(world, ownerId){
  let table = readyAt.get(world)
  if(!table){ table = new Map(); readyAt.set(world, table) }
  table.set(ownerId, now(world) + COOLDOWN)
}

function spendDurability(world, player){
  const equipment = player.equipment
  if(!equipment || typeof equipment !== 'object') return
  const weapon = equipment.weapon
  if(!weapon || weapon.itemId !== 'barrow-rattle' || typeof weapon.durability !== 'number' || !(weapon.durability > 0)) return
  const before = weapon.durability
  let applied = false
  if(typeof world.wearEquipped === 'function'){
    try{
      world.wearEquipped(player, 'weapon', 1)
      const after = player.equipment && player.equipment.weapon
      if(!after || after.durability !== before) applied = true
    }catch{ applied = false }
  }
  if(applied) return
  const current = player.equipment && player.equipment.weapon
  if(!current || current.itemId !== 'barrow-rattle' || typeof current.durability !== 'number') return
  current.durability = before - 1
  if(current.durability <= 0){
    player.equipment.weapon = null
    if(typeof player.equipmentRevision === 'number') player.equipmentRevision++
  }
}

function emit(world, type, x, z, text){
  if(typeof world.event !== 'function' || !Array.isArray(world.events)) return
  try{ world.event(type, x, z, text == null ? '' : String(text)) }catch{ /* presentation only */ }
}

function strike(world, summon, target){
  const amount = SKELETON_DAMAGE
  if(typeof target.hp !== 'number'){
    summon.pendingHit = {targetId: target.id, amount}
    return
  }
  target.hp -= amount
  const dx = (typeof target.x === 'number' ? target.x : summon.x) - summon.x
  const dz = (typeof target.z === 'number' ? target.z : summon.z) - summon.z
  const span = Math.hypot(dx, dz) || 1
  if(typeof target.x === 'number') target.x += dx / span * 0.32
  if(typeof target.z === 'number') target.z += dz / span * 0.32
  emit(world, 'damage', target.x, target.z, amount)
  if(summon.pendingHit) delete summon.pendingHit
}

function ownerOf(world, summon){
  if(!Array.isArray(world.players)) return null
  return world.players.find(player => player && player.id === summon.ownerId && player.online !== false && !player.ghost) || null
}

function followPoint(owner, summon, list){
  const mates = list.filter(entry => entry && entry.ownerId === summon.ownerId && living(entry))
  const index = Math.max(0, mates.indexOf(summon))
  let fx = Number(owner.dx) || 0
  let fz = Number(owner.dz) || 0
  if(Math.hypot(fx, fz) < 0.05){ fx = 0; fz = 1 }
  const back = Math.atan2(fz, fx) + Math.PI
  const spread = (index - (mates.length - 1) / 2) * 0.6
  return {
    x: owner.x + Math.cos(back + spread) * FOLLOW,
    z: owner.z + Math.sin(back + spread) * FOLLOW,
  }
}

function separate(summon, list){
  let x = 0
  let z = 0
  for(const other of list){
    if(!other || other === summon || !living(other)) continue
    if(typeof other.x !== 'number' || typeof other.z !== 'number') continue
    const dx = summon.x - other.x
    const dz = summon.z - other.z
    const span = Math.hypot(dx, dz)
    if(span > 0 && span < 0.75){
      x += dx / span * (0.75 - span)
      z += dz / span * (0.75 - span)
    }
  }
  return {x, z}
}

function steer(world, summon, vx, vz, dt){
  if(typeof world.move === 'function'){
    let obstacles = []
    if(typeof world.obstacles === 'function'){
      try{ obstacles = world.obstacles() || [] }catch{ obstacles = [] }
    }
    if(world.move(summon, vx, vz, dt, obstacles)) return true
    return !!world.move(summon, -vz, vx, dt, obstacles)
  }
  summon.x += vx * dt
  summon.z += vz * dt
  if(summon.x > 41) summon.x = 41
  if(summon.x < -41) summon.x = -41
  if(summon.z > 41) summon.z = 41
  if(summon.z < -41) summon.z = -41
  return true
}

function face(summon, x){
  if(typeof x !== 'number' || Math.abs(x - summon.x) < 0.02) return
  summon.facing = x < summon.x ? -1 : 1
}

export function use(world, player){
  if(!world || typeof world !== 'object' || !player || typeof player !== 'object') return null
  if(player.down || player.ghost || player.online === false) return null
  if(typeof player.x !== 'number' || typeof player.z !== 'number') return null
  const weapon = player.equipment && player.equipment.weapon
  if(weapon && weapon.itemId === 'barrow-rattle' && typeof weapon.durability === 'number' && weapon.durability <= 0) return null
  const ownerId = player.id == null ? 'player' : player.id
  if(owned(world, ownerId).length >= CAP) return null
  if(!cooldownReady(world, ownerId)) return null

  let dx = Number(player.dx) || 0
  let dz = Number(player.dz) || 0
  if(Math.hypot(dx, dz) < 0.01){ dx = 0; dz = 1 }
  const span = Math.hypot(dx, dz)
  if(!Array.isArray(world.magicSummons)) world.magicSummons = []
  const summon = {
    id: mintId(world),
    ownerId,
    x: Math.max(-40, Math.min(40, player.x + dx / span * 0.95)),
    z: Math.max(-40, Math.min(40, player.z + dz / span * 0.95)),
    hp: SKELETON_HP,
    maxHp: SKELETON_HP,
    age: 0,
    facing: dx < 0 ? -1 : 1,
    anim: 'idle',
    sprite: framePath('idle', 0),
    type: 'skeleton',
    damage: SKELETON_DAMAGE,
    range: RANGE,
    swinging: false,
    swingT: 0,
    didHit: false,
    nextSwing: 0,
  }
  world.magicSummons.push(summon)
  armCooldown(world, ownerId)
  spendDurability(world, player)
  if(typeof player.cooldown === 'number') player.cooldown = Math.max(player.cooldown, COOLDOWN)
  else player.cooldown = COOLDOWN
  player.action = 'attack'
  if(typeof player.actionUntil === 'number' || typeof world.time === 'number') player.actionUntil = now(world) + 0.32
  player.rest = false
  emit(world, 'swing', player.x, player.z, '')
  return summon
}

export function step(world, dt){
  if(!world || typeof world !== 'object' || !Array.isArray(world.magicSummons) || world.magicSummons.length === 0) return
  if(typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return
  const list = world.magicSummons
  const enemies = hostiles(world)
  const alive = () => enemies.filter(enemy => !(typeof enemy.hp === 'number' && enemy.hp <= 0))
  for(let i = list.length - 1; i >= 0; i--){
    const summon = list[i]
    if(!summon || typeof summon !== 'object'){ list.splice(i, 1); continue }
    summon.age = (typeof summon.age === 'number' && Number.isFinite(summon.age) ? summon.age : 0) + dt
    if((typeof summon.hp === 'number' && summon.hp <= 0) || summon.age >= LIFE){
      list.splice(i, 1)
      continue
    }
    if(typeof summon.x !== 'number' || typeof summon.z !== 'number') continue
    if(summon.facing !== -1 && summon.facing !== 1) summon.facing = 1

    const hostile = nearest(alive(), summon)
    const owner = ownerOf(world, summon)
    if(summon.swinging){
      summon.anim = 'attack'
      summon.swingT = (summon.swingT || 0) + dt
      if(!summon.didHit && summon.swingT >= HIT_AT){
        summon.didHit = true
        const mark = nearest(alive(), summon)
        if(mark && mark.distance <= RANGE + 0.05) strike(world, summon, mark.entity)
      }
      if(summon.swingT >= SWING){
        summon.swinging = false
        summon.didHit = false
        summon.swingT = 0
        summon.nextSwing = summon.age + (PERIOD - SWING)
      }else if(hostile) face(summon, hostile.entity.x)
    }else if(hostile && hostile.distance <= SIGHT && hostile.distance <= RANGE && summon.age >= (summon.nextSwing || 0)){
      summon.swinging = true
      summon.swingT = 0
      summon.didHit = false
      summon.anim = 'attack'
      face(summon, hostile.entity.x)
    }else{
      let goal = null
      let speed = SPEED
      if(hostile && hostile.distance <= SIGHT){
        const span = hostile.distance || 1
        const ux = (hostile.entity.x - summon.x) / span
        const uz = (hostile.entity.z - summon.z) / span
        const hold = RANGE * 0.65
        goal = {x: hostile.entity.x - ux * hold, z: hostile.entity.z - uz * hold}
      }else if(owner && typeof owner.x === 'number' && typeof owner.z === 'number'){
        goal = followPoint(owner, summon, list)
        if(distance(summon, owner) > 3) speed = CATCHUP
      }
      if(!goal || distance(summon, goal) <= 0.35){
        summon.anim = 'idle'
      }else{
        const sep = separate(summon, list)
        let mx = goal.x - summon.x + sep.x
        let mz = goal.z - summon.z + sep.z
        const span = Math.hypot(mx, mz)
        if(span > 0.001){
          steer(world, summon, mx / span * speed, mz / span * speed, dt)
          face(summon, summon.x + mx)
          summon.anim = 'walk'
        }else summon.anim = 'idle'
      }
    }
    paint(summon)
  }
}
