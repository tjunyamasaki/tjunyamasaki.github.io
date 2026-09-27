// Hostile behaviour: how every creature moves, finds a way round trees and walls, and attacks.
//
// Each creature type has a role (swarm, lunger, caster, lobber, bruiser, titan, boss) with its own
// movement (speed, acceleration, preferred distance) and attack pattern (a telegraphed shape that
// resolves when the wind-up ends). Small melee creatures come in numbers and hit lightly; big slow
// ones wind up longer and hit hard. Every blow is telegraphed on the ground so a timed dodge beats it.
//
// Pathing: a flow field (Dijkstra over a 0.5-unit grid) is rebuilt around each wanderer and the
// Heartfire a few times a second. Every creature chasing that target reads the same field, so a
// swarm of fifty costs one search, not fifty. Where the straight line is already the shortest path
// the creature steers straight at its prey; otherwise it follows the field round trunks and walls.
//
// World fields written here (all plain data so snapshots carry them):
//   enemy.vx/vz      velocity (units/s), also used by wanderers to lead their shots
//   enemy.atk        attack id while winding up or charging
//   enemy.wt         total wind-up of the current attack (telegraph fill)
//   enemy.ang        aim angle of cone and line attacks
//   enemy.tx/tz      telegraph centre (circle) or origin (cone, line, ring)
//   enemy.act        seconds left in an active charge
//   enemy.face       -1 / 1, which way the sprite looks
//   world.hostile    enemy projectiles and lobbed spores
import {ENEMIES, STRUCTURES} from './content.mjs?v=harvest-18';
import {ALLIES, ROAM} from './progression.mjs?v=harvest-18';
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';
import {landBlow, preyFor} from './arsenal.mjs?v=harvest-18';
import {cartTargets} from './cart.mjs?v=harvest-18';

/** Creatures chew through camp structures at half their bite, so a lone explorer's fire survives an early night. */
export const STRUCTURE_HIT = .5, HEARTH_HIT = .35;
/** How far a hunting creature (e.hunt, night.mjs) looks for prey. */
export const HUNT_RANGE = 40;
export const structureHit = b => b.type === 'hearth' ? HEARTH_HIT : STRUCTURE_HIT;

/**
 * Attack patterns. `shape` is what the ground telegraph draws. Times in seconds, lengths in units.
 * `trigger` is how close the creature must be to start the wind-up (added to the target's own radius).
 * `dmg` scales the creature's damage stat.
 */
export const ATTACKS = Object.freeze({
  bite:   {shape: 'circle', windup: .42, trigger: 1.35, reach: .95, radius: .95, lunge: .55, dmg: 1},
  swipe:  {shape: 'circle', windup: .5, trigger: 1.6, reach: 1.1, radius: 1.15, lunge: .3, dmg: .8},
  charge: {shape: 'line', windup: .62, trigger: 5.6, min: 2.2, length: 5.6, width: 1.15, speed: 15, dmg: 1},
  orb:    {shape: 'aim', windup: .55, trigger: 8.5, length: 2.6, width: .5, speed: 5.4, radius: .34, life: 3.4, dmg: 1},
  lob:    {shape: 'circle', windup: .45, trigger: 7.5, radius: 1.4, flight: 1.05, dmg: 1},
  slam:   {shape: 'cone', windup: 1.0, trigger: 2.6, radius: 3.1, arc: 110, push: 1.4, dmg: 1},
  quake:  {shape: 'ring', windup: 1.2, trigger: 2.7, radius: 3.4, push: 1.6, shards: 8, shardSpeed: 4.4, shardDmg: .35, dmg: 1},
  kingSlam:   {shape: 'ring', windup: 1.3, trigger: 3.6, radius: 4.3, push: 1.8, dmg: 1},
  kingNova:   {shape: 'ring', windup: .85, trigger: 12, radius: 1.8, shots: 18, speed: 4.6, life: 4.2, dmg: .45},
  kingSummon: {shape: 'ring', windup: .9, trigger: 14, radius: 2.4, summon: 5, dmg: 0},
});

/**
 * Movement per creature: top speed comes from ENEMIES[type].speed. `accel` is how quickly it reaches
 * it (heavy things are sluggish), `body` its radius for crowding, `keep` a preferred distance for
 * ranged creatures, `fly` passes over trees and walls, `flank` spreads a swarm round its prey,
 * `retreat` backs off for that share of the rest after a blow, to set up the next charge.
 */
export const MOVES = Object.freeze({
  crawler:    {body: .52, accel: 16, flank: 55, attacks: ['bite']},
  bonewalker: {body: .5, accel: 10, flank: 30, retreat: .8, attacks: ['charge', 'swipe']},
  wraith:     {body: .45, accel: 6, fly: true, keep: 6, orbit: .8, attacks: ['orb']},
  bogling:    {body: .55, accel: 7, keep: 5, orbit: .4, attacks: ['lob']},
  brute:      {body: .8, accel: 4, flank: 10, attacks: ['slam']},
  golem:      {body: 1, accel: 3, attacks: ['quake']},
  king:       {body: 1.5, accel: 3, attacks: ['kingSlam', 'kingNova', 'kingSummon'], rotate: true},
});
const DEFAULT_MOVE = {body: .5, accel: 8, attacks: ['bite']};
export const moveOf = type => MOVES[type] || DEFAULT_MOVE;
export const bodyOf = e => moveOf(e?.type).body * (e?.elite ? 1.25 : 1) * (e?.minion ? .8 : 1);

const TAU = Math.PI*2;
const dist = (a, b) => Math.hypot((a.x||0)-(b.x||0), (a.z||0)-(b.z||0));
const angleDelta = (a, b) => {let d = (a-b)%TAU; if(d > Math.PI) d -= TAU; if(d < -Math.PI) d += TAU; return d;};
const alive = p => p && p.online && !p.down && !p.ghost && p.hp > 0;

// ------------------------------------------------------------------ flow fields
const FIELD_CELLS = 64, FIELD_SIZE = .5, FIELD_HALF = FIELD_CELLS*FIELD_SIZE/2;
const FIELD_CLEARANCE = .3, FIELD_REBUILD = .5, FIELD_DRIFT = 1.25;
const N2 = FIELD_CELLS*FIELD_CELLS;
const heapKey = new Float32Array(N2*8), heapVal = new Int32Array(N2*8);
const SQRT2 = Math.SQRT2;
const NEIGHBOURS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

function fieldsOf(world){
  if(!world.flowFields) Object.defineProperty(world, 'flowFields', {value: new Map(), writable: true, configurable: true, enumerable: false});
  return world.flowFields;
}

/** Marks every cell a walker's centre cannot occupy, then runs Dijkstra outward from the target. */
export function buildField(world, obstacles, tx, tz, reuse = null){
  const ox = Math.round(tx/FIELD_SIZE)*FIELD_SIZE - FIELD_HALF, oz = Math.round(tz/FIELD_SIZE)*FIELD_SIZE - FIELD_HALF;
  const blocked = reuse?.blocked || new Uint8Array(N2), distance = reuse?.distance || new Float32Array(N2);
  blocked.fill(0); distance.fill(Infinity);
  // Water, thickets, fences and the edge of the world (world.walkable, worldgen.mjs).
  for(let j = 0; j < FIELD_CELLS; j++) for(let i = 0; i < FIELD_CELLS; i++){
    const x = ox + (i+.5)*FIELD_SIZE, z = oz + (j+.5)*FIELD_SIZE;
    if(!world.walkable(x, z)) blocked[j*FIELD_CELLS+i] = 1;
  }
  const stamp = o => {
    const reach = o.radius + FIELD_CLEARANCE;
    const i0 = Math.max(0, Math.floor((o.x-reach-ox)/FIELD_SIZE)), i1 = Math.min(FIELD_CELLS-1, Math.floor((o.x+reach-ox)/FIELD_SIZE));
    const j0 = Math.max(0, Math.floor((o.z-reach-oz)/FIELD_SIZE)), j1 = Math.min(FIELD_CELLS-1, Math.floor((o.z+reach-oz)/FIELD_SIZE));
    for(let j = j0; j <= j1; j++) for(let i = i0; i <= i1; i++){
      const x = ox + (i+.5)*FIELD_SIZE, z = oz + (j+.5)*FIELD_SIZE;
      if(Math.hypot(x-o.x, z-o.z) < reach) blocked[j*FIELD_CELLS+i] = 1;
    }
  };
  const grid = obstacles?.grid;
  if(grid){
    const g0 = Math.floor(ox/4)-1, g1 = Math.floor((ox+FIELD_HALF*2)/4)+1, h0 = Math.floor(oz/4)-1, h1 = Math.floor((oz+FIELD_HALF*2)/4)+1;
    for(let gx = g0; gx <= g1; gx++) for(let gz = h0; gz <= h1; gz++){
      const bucket = grid.get((gx+2048)*4096+(gz+2048)); if(bucket) for(const o of bucket) stamp(o);
    }
  }
  for(const o of obstacles || []) stamp(o);
  // Seed at the target, or the nearest open cell when the target hugs a trunk.
  let si = Math.floor((tx-ox)/FIELD_SIZE), sj = Math.floor((tz-oz)/FIELD_SIZE);
  si = Math.max(0, Math.min(FIELD_CELLS-1, si)); sj = Math.max(0, Math.min(FIELD_CELLS-1, sj));
  let start = sj*FIELD_CELLS+si;
  if(blocked[start]){
    let best = -1, bestD = Infinity;
    for(let dj = -4; dj <= 4; dj++) for(let di = -4; di <= 4; di++){
      const i = si+di, j = sj+dj; if(i < 0 || j < 0 || i >= FIELD_CELLS || j >= FIELD_CELLS) continue;
      const k = j*FIELD_CELLS+i; if(blocked[k]) continue;
      const d = di*di+dj*dj; if(d < bestD){bestD = d; best = k;}
    }
    if(best < 0) return {ox, oz, blocked, distance, tx, tz, ok: false};
    start = best;
  }
  let size = 0;
  const push = (k, v) => {let i = size++; while(i > 0){const p = (i-1)>>1; if(heapKey[p] <= k) break; heapKey[i] = heapKey[p]; heapVal[i] = heapVal[p]; i = p;} heapKey[i] = k; heapVal[i] = v;};
  const pop = () => {
    const top = heapVal[0], k = heapKey[--size], v = heapVal[size]; let i = 0;
    while(true){let c = i*2+1; if(c >= size) break; if(c+1 < size && heapKey[c+1] < heapKey[c]) c++; if(heapKey[c] >= k) break; heapKey[i] = heapKey[c]; heapVal[i] = heapVal[c]; i = c;}
    heapKey[i] = k; heapVal[i] = v; return top;
  };
  distance[start] = 0; push(0, start);
  while(size > 0){
    const d = heapKey[0], k = pop();
    if(d > distance[k]) continue;
    const i = k % FIELD_CELLS, j = (k-i)/FIELD_CELLS;
    for(const [di, dj, cost] of NEIGHBOURS){
      const ni = i+di, nj = j+dj; if(ni < 0 || nj < 0 || ni >= FIELD_CELLS || nj >= FIELD_CELLS) continue;
      const nk = nj*FIELD_CELLS+ni; if(blocked[nk]) continue;
      // No cutting a corner past a trunk.
      if(di && dj && (blocked[j*FIELD_CELLS+ni] || blocked[nj*FIELD_CELLS+i])) continue;
      const nd = d+cost*FIELD_SIZE;
      if(nd < distance[nk]){distance[nk] = nd; if(size < heapKey.length) push(nd, nk);}
    }
  }
  return {ox, oz, blocked, distance, tx, tz, ok: true};
}

/** Cached field for a target entity; rebuilt when it moves or the camp changes. */
function fieldFor(world, obstacles, target, sig){
  const fields = fieldsOf(world), key = target.id;
  let entry = fields.get(key);
  if(!entry || entry.sig !== sig || world.time-entry.at > FIELD_REBUILD+(target.type === 'hearth' ? 2.5 : 0) || Math.hypot(entry.field.tx-target.x, entry.field.tz-target.z) > FIELD_DRIFT){
    if(world.fieldBudget <= 0 && entry) return entry.field;
    world.fieldBudget--;
    entry = {field: buildField(world, obstacles, target.x, target.z, entry?.field), at: world.time, sig};
    fields.set(key, entry);
  }
  return entry.field;
}

/**
 * Where to head next on a field. Returns null to mean "walk straight at the target": outside the
 * field, unreachable, or already on a near-straight shortest path.
 */
export function fieldStep(field, x, z){
  if(!field?.ok) return null;
  const i = Math.floor((x-field.ox)/FIELD_SIZE), j = Math.floor((z-field.oz)/FIELD_SIZE);
  if(i < 1 || j < 1 || i >= FIELD_CELLS-1 || j >= FIELD_CELLS-1) return null;
  let k = j*FIELD_CELLS+i, d = field.distance[k];
  const straight = Math.hypot(field.tx-x, field.tz-z);
  if(Number.isFinite(d) && d <= straight*1.1+.8) return null;
  // Walk two steps down the field and aim at that cell: smoother than the next cell alone.
  let ci = i, cj = j, cur = Number.isFinite(d) ? d : Infinity, moved = false;
  for(let step = 0; step < 2; step++){
    let best = cur, bi = -1, bj = -1;
    for(const [di, dj] of NEIGHBOURS){
      const ni = ci+di, nj = cj+dj; if(ni < 0 || nj < 0 || ni >= FIELD_CELLS || nj >= FIELD_CELLS) continue;
      const nd = field.distance[nj*FIELD_CELLS+ni];
      if(nd < best){best = nd; bi = ni; bj = nj;}
    }
    if(bi < 0) break;
    ci = bi; cj = bj; cur = best; moved = true;
  }
  if(!moved) return null;
  const gx = field.ox+(ci+.5)*FIELD_SIZE, gz = field.oz+(cj+.5)*FIELD_SIZE, l = Math.hypot(gx-x, gz-z);
  if(l < 1e-4) return null;
  return {x: (gx-x)/l, z: (gz-z)/l, blocked: !Number.isFinite(d)};
}

// ------------------------------------------------------------------ telegraphs
/** What the ground warning shows for a creature winding up: shape, place, size, and how full it is. */
export function telegraphOf(e){
  if(!(e?.windup > 0) || !e.atk) return null;
  const spec = ATTACKS[e.atk]; if(!spec) return null;
  const scale = e.elite ? 1.15 : 1;
  const fill = Math.max(0, Math.min(1, 1-e.windup/Math.max(.05, e.wt || spec.windup)));
  const base = {shape: spec.shape, x: e.tx, z: e.tz, angle: e.ang || 0, fill, heavy: spec.windup >= .9};
  if(spec.shape === 'circle') return {...base, radius: spec.radius*scale};
  if(spec.shape === 'cone') return {...base, radius: spec.radius*scale, arc: spec.arc};
  if(spec.shape === 'ring') return {...base, radius: spec.radius*scale};
  if(spec.shape === 'line' || spec.shape === 'aim') return {...base, length: spec.length*scale, width: spec.width*scale};
  return null;
}

/** Hostile shots and lobbed spores, for renderers: {x, z, radius, kind, fill} (fill only for spores). */
export function hostileShots(world){
  return (world?.hostile || []).map(s => s.kind === 'spore'
    ? {kind: 'spore', x: s.x, z: s.z, radius: s.r, fill: Math.max(0, Math.min(1, 1-s.fuse/Math.max(.05, s.flight))), sx: s.sx, sz: s.sz}
    : {id: s.id, kind: s.kind, x: s.x, z: s.z, radius: s.r, vx: s.vx, vz: s.vz});
}

function inShape(e, spec, x, z, pad){
  const scale = e.elite ? 1.15 : 1;
  const dx = x-e.tx, dz = z-e.tz, d = Math.hypot(dx, dz);
  if(spec.shape === 'circle' || spec.shape === 'ring') return d < spec.radius*scale+pad;
  if(spec.shape === 'cone'){
    if(d >= spec.radius*scale+pad) return false;
    if(d < .8+pad) return true;
    return Math.abs(angleDelta(Math.atan2(dz, dx), e.ang)) <= spec.arc*Math.PI/360+pad/Math.max(1, d);
  }
  return false;
}

// ------------------------------------------------------------------ attacks
function wanderers(world){return world.players.filter(alive);}

function strikeArea(world, e, spec, amount, test){
  let struck = 0;
  for(const p of wanderers(world)) if(test(p.x, p.z, .3)){
    world.hurt(p, amount, e);
    if(spec.push && !(p.iframes > 0)) world.shove(p, p.x-e.x, p.z-e.z, spec.push);
    struck++;
  }
  for(const a of [...(world.allies || []), ...(world.magicSummons || [])]){
    if(a && a.hp > 0 && Number.isFinite(a.x) && test(a.x, a.z, .35)){a.hp -= amount*(ALLIES[a.type]?.guard ?? 1); world.event('hit', a.x, a.z);}
  }
  for(const b of world.buildings) if(b.hp > 0 && test(b.x, b.z, Math.max(.3, STRUCTURES[b.type]?.radius || .3))) b.hp -= amount*structureHit(b);
  return struck;
}

function begin(world, e, id, target){
  const spec = ATTACKS[id], def = ENEMIES[e.type];
  const aimX = target.x-e.x, aimZ = target.z-e.z;
  e.atk = id; e.ang = Math.atan2(aimZ, aimX); e.face = aimX < 0 ? -1 : 1;
  e.windup = e.wt = spec.windup*(e.elite ? 1.08 : 1);
  e.vx = e.vz = 0;
  if(spec.shape === 'circle' && spec.reach !== undefined){
    // Melee circles land just in front of the creature, toward where the prey stood.
    const d = Math.max(.01, Math.hypot(aimX, aimZ)), reach = Math.min(d, spec.reach + (target.radius || 0));
    e.tx = e.x+aimX/d*reach; e.tz = e.z+aimZ/d*reach;
  }else if(spec.shape === 'circle'){
    // Lobs lead a moving wanderer by the flight time, then commit.
    const lead = spec.flight || 0;
    e.tx = target.x+(target.vx || 0)*lead*.6; e.tz = target.z+(target.vz || 0)*lead*.6;
  }else{e.tx = e.x; e.tz = e.z;}
  if(!def) e.windup = 0;
}

function release(world, e, target){
  const spec = ATTACKS[e.atk], def = ENEMIES[e.type];
  const power = e.power || 1, amount = (def?.damage || 0)*power*(spec?.dmg ?? 1);
  const id = e.atk;
  e.windup = 0; e.cooldown = cadence(world, e, def);
  if(!spec){e.atk = ''; return;}
  world.event('impact', e.tx, e.tz, '', {mob: e.type});
  if(id === 'bite' || id === 'swipe'){
    const d = Math.max(.01, Math.hypot(e.tx-e.x, e.tz-e.z));
    world.move(e, (e.tx-e.x)/d*spec.lunge/.05, (e.tz-e.z)/d*spec.lunge/.05, .05, world.frameObstacles);
    strikeArea(world, e, spec, amount, (x, z, pad) => inShape(e, spec, x, z, pad));
    e.atk = ''; e.back = (moveOf(e.type).retreat || 0)*e.cooldown;
  }else if(id === 'charge'){
    e.act = spec.length/spec.speed; e.hitIds = [];
    world.event('charge', e.x, e.z, '', {dx: Math.cos(e.ang), dz: Math.sin(e.ang)});
  }else if(id === 'orb'){
    // A lone orb early on; a fan of three once the nights (or waves) run long, or from an elder.
    const shots = (e.level || 1) >= 6 || e.elite ? 3 : 1;
    for(let i = 0; i < shots; i++){
      const a = e.ang+(i-(shots-1)/2)*.32;
      fire(world, e, 'orb', a, spec.speed, spec.radius, amount, spec.life);
    }
    e.atk = '';
  }else if(id === 'lob'){
    (world.hostile ||= []).push({id: world.nextId('h'), kind: 'spore', x: e.tx, z: e.tz, sx: e.x, sz: e.z, r: spec.radius*(e.elite ? 1.15 : 1), dmg: amount, fuse: spec.flight, flight: spec.flight, owner: e.id});
    e.atk = '';
  }else if(id === 'slam' || id === 'quake' || id === 'kingSlam'){
    strikeArea(world, e, spec, amount, (x, z, pad) => inShape(e, spec, x, z, pad));
    if(spec.shards) for(let i = 0; i < spec.shards; i++) fire(world, e, 'shard', i/spec.shards*TAU+e.ang, spec.shardSpeed, .3, (def?.damage || 0)*power*spec.shardDmg, 3);
    world.event('quake', e.tx, e.tz, '', {radius: spec.radius, arc: spec.arc || 360, angle: e.ang});
    e.atk = '';
  }else if(id === 'kingNova'){
    for(let ring = 0; ring < 2; ring++) for(let i = 0; i < spec.shots; i++){
      const a = (i+ring*.5)/spec.shots*TAU;
      fire(world, e, 'orb', a, spec.speed*(ring ? .8 : 1), .36, amount, spec.life);
    }
    e.atk = '';
  }else if(id === 'kingSummon'){
    const minions = world.enemies.filter(m => m.minion && m.hp > 0).length;
    for(let i = 0; i < Math.min(spec.summon, 14-minions); i++){
      const a = i/spec.summon*TAU+e.ang;
      const m = world.spawnEnemy('crawler', e.x+Math.cos(a)*2.4, e.z+Math.sin(a)*2.4, {elite: false, minion: true});
      if(m) m.cooldown = .8+(world.mobRng || Math.random)()*.6;
    }
    world.event('summon', e.x, e.z, '', {kind: 'crawler', radius: 2.4});
    e.atk = '';
  }else e.atk = '';
}

function fire(world, e, kind, angle, speed, radius, damage, life){
  const list = world.hostile ||= [];
  if(list.length > 220) return;
  list.push({id: world.nextId('h'), kind, x: e.x+Math.cos(angle)*.7, z: e.z+Math.sin(angle)*.7, vx: Math.cos(angle)*speed, vz: Math.sin(angle)*speed, r: radius, dmg: damage, life, age: 0, owner: e.id});
}

/** Cooldown between attacks, jittered so a swarm does not strike in lockstep. */
function cadence(world, e, def){
  const base = def?.period || 1.5;
  return base*(.8+(world.mobRng||Math.random)()*.4);
}

/** Pick an attack this creature can start now against this target, or null. */
function chooseAttack(world, e, target, d, reach){
  const move = moveOf(e.type);
  if(move.rotate){
    // The Hollow King cycles his patterns, skipping one that cannot land from here.
    for(let tries = 0; tries < move.attacks.length; tries++){
      const id = move.attacks[(e.pat || 0) % move.attacks.length];
      e.pat = ((e.pat || 0)+1) % move.attacks.length;
      if(d <= ATTACKS[id].trigger+reach) return id;
    }
    return null;
  }
  for(const id of move.attacks){
    const spec = ATTACKS[id];
    if(d > spec.trigger+reach) continue;
    if(spec.min && d < spec.min+reach) continue;
    if(target.type === 'hearth' && (spec.shape === 'line' || spec.shape === 'aim')) continue;
    return id;
  }
  return null;
}

// ------------------------------------------------------------------ hostile shots
export function stepHostile(world, dt){
  const list = world.hostile; if(!list?.length) return;
  const R = (world.radius || 96)+2;
  const people = wanderers(world);
  const guards = [...(world.allies || []), ...(world.magicSummons || [])].filter(a => a && a.hp > 0 && Number.isFinite(a.x));
  const carts = cartTargets(world);
  for(const s of list){
    if(s.kind === 'spore'){
      s.fuse -= dt;
      if(s.fuse <= 0){
        s.done = true;
        for(const p of people) if(Math.hypot(p.x-s.x, p.z-s.z) < s.r+.3) world.hurt(p, s.dmg, null);
        for(const a of guards) if(Math.hypot(a.x-s.x, a.z-s.z) < s.r+.35) a.hp -= s.dmg*(ALLIES[a.type]?.guard ?? 1);
        for(const c of carts) if(Math.hypot(c.x-s.x, c.z-s.z) < s.r+STRUCTURES.cart.radius) c.hp -= s.dmg*STRUCTURE_HIT;
        world.event('splat', s.x, s.z, '', {radius: s.r});
      }
      continue;
    }
    s.age += dt; s.x += s.vx*dt; s.z += s.vz*dt;
    if(s.age >= s.life || Math.hypot(s.x, s.z) > R){s.done = true; continue;}
    for(const p of people){
      if(Math.hypot(p.x-s.x, p.z-s.z) >= s.r+.32) continue;
      if(p.iframes > 0){world.hurt(p, s.dmg, null); continue;}
      world.hurt(p, s.dmg, null); s.done = true; world.event('hit', s.x, s.z); break;
    }
    if(s.done) continue;
    for(const a of guards) if(Math.hypot(a.x-s.x, a.z-s.z) < s.r+.4){a.hp -= s.dmg*(ALLIES[a.type]?.guard ?? 1); s.done = true; break;}
    if(s.done) continue;
    for(const c of carts) if(c.hp > 0 && Math.hypot(c.x-s.x, c.z-s.z) < s.r+STRUCTURES.cart.radius){c.hp -= s.dmg*STRUCTURE_HIT; s.done = true; world.event('hit', s.x, s.z); break;}
  }
  world.hostile = list.filter(s => !s.done);
}

// ------------------------------------------------------------------ the step
/**
 * One simulation step for every hostile. `obstacles` is World.obstacles(). The caller removes the
 * dead afterwards and hands out loot.
 */
export function stepMobs(world, dt, obstacles){
  world.frameObstacles = obstacles;
  world.fieldBudget = 3;
  const foes = world.enemies.filter(e => e.hp > 0 && !isMagicAlly(e));
  const people = wanderers(world);
  // Carts are hunted exactly like wanderers (cart.mjs).
  const carts = world.arena ? [] : cartTargets(world), prey = carts.length ? people.concat(carts) : people, quarry = prey;
  const hearth = world.buildings.find(b => b.type === 'hearth' && b.hp > 0);
  const sig = obstacles.length+':'+(obstacles.nodes?.length || 0);
  // Crowd hash: who is near whom, for spacing a swarm out.
  const crowd = new Map(), CELL = 2;
  const ck = (x, z) => (Math.floor(x/CELL)+4096)*8192+(Math.floor(z/CELL)+4096);
  for(const e of foes){const k = ck(e.x, e.z); let b = crowd.get(k); if(!b){b = []; crowd.set(k, b);} b.push(e);}

  for(const e of foes){
    const def = ENEMIES[e.type]; if(!def) continue;
    const move = moveOf(e.type);
    e.cooldown = (e.cooldown || 0)-dt; e.slowed = Math.max(0, (e.slowed || 0)-dt);
    const sx = e.x, sz = e.z;

    // Frozen, stunned or pinned: a wind-up already begun still lands (unless a stun cancelled it).
    if(world.tickRoot(e, dt)){
      e.vx = e.vz = 0; e.act = 0;
      if(e.windup > 0){e.windup -= dt; if(e.windup <= 0) release(world, e, e);}
      continue;
    }

    // An active charge carries the creature along its line, hurting whoever it runs through.
    if(e.act > 0){
      const spec = ATTACKS[e.atk] || ATTACKS.charge, step = Math.min(e.act, dt);
      const vx = Math.cos(e.ang)*spec.speed, vz = Math.sin(e.ang)*spec.speed;
      const moved = world.move(e, vx, vz, step, obstacles);
      e.act -= dt; e.vx = vx; e.vz = vz;
      const amount = def.damage*(e.power || 1)*(spec.dmg ?? 1);
      for(const p of people){
        if(e.hitIds?.includes(p.id) || Math.hypot(p.x-e.x, p.z-e.z) >= bodyOf(e)+.45) continue;
        (e.hitIds ||= []).push(p.id); world.hurt(p, amount, e);
        if(!(p.iframes > 0)) world.shove(p, Math.cos(e.ang+Math.PI/2*(e.flank < 0 ? -1 : 1)), Math.sin(e.ang+Math.PI/2*(e.flank < 0 ? -1 : 1)), .9);
      }
      for(const c of carts) if(!e.hitIds?.includes(c.id) && Math.hypot(c.x-e.x, c.z-e.z) < bodyOf(e)+.45+STRUCTURES.cart.radius){(e.hitIds ||= []).push(c.id); c.hp -= amount*STRUCTURE_HIT; world.event('hit', c.x, c.z);}
      landBlow(world, {...e, tx: e.x, tz: e.z}, amount*.5, bodyOf(e)+.4);
      if(!moved || e.act <= 0){e.act = 0; e.atk = ''; e.hitIds = null; e.vx *= .2; e.vz *= .2; e.cooldown = Math.max(e.cooldown, cadence(world, e, def)*.9); e.back = (moveOf(e.type).retreat || 0)*e.cooldown*.6;}
      continue;
    }

    // Choose prey.
    let target = null;
    if(e.home){
      const prey = [preyFor(world, e, quarry, e.aggro ? ROAM.aggro+6 : ROAM.aggro)].find(q => q && Math.hypot(q.x-e.home.x, q.z-e.home.z) < e.leash+8) || null;
      if(prey){e.aggro = true; target = prey;}
      else{
        e.aggro = false;
        if(Math.hypot(e.x-e.home.x, e.z-e.home.z) < 1.2){
          if(e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp+dt*e.maxHp*.05);
          e.vx = e.vz = 0; if(e.windup > 0){e.windup = 0; e.atk = '';} continue;
        }
        target = {x: e.home.x, z: e.home.z, homing: true, id: 'home:'+e.id};
      }
    }else if(world.arena){
      target = preyFor(world, e, people, 999);
    }else{
      // `hunt`: creatures sent after wanderers in the dark (night.mjs) look much farther for prey.
      const near = preyFor(world, e, prey, e.hunt ? HUNT_RANGE : 12);
      target = near || hearth || (world.showcase ? people[0] : null);
    }
    if(!target){e.vx = e.vz = 0; continue;}
    const reach = target.type === 'hearth' ? 1.1 : target.type === 'cart' ? .35 : 0;
    const d = dist(e, target);
    e.face = target.x < e.x ? -1 : 1;

    // Winding up: stand still and let the telegraph fill.
    if(e.windup > 0){
      e.windup -= dt; e.vx *= .5; e.vz *= .5;
      if(e.windup <= 0) release(world, e, target);
      continue;
    }

    // Start an attack when one is in reach and rested.
    if(!target.homing && e.cooldown <= 0){
      const id = chooseAttack(world, e, target, d, reach);
      if(id){begin(world, e, id, target); continue;}
    }

    // Where do we want to be?
    let wantX = target.x, wantZ = target.z, stop = .9+reach;
    if(e.back > 0) e.back -= dt;
    if(!target.homing){
      if(e.back > 0 && d < 5){
        // Hit and run: open the distance again before the next lunge.
        const rx = (e.x-target.x)/Math.max(.01, d), rz = (e.z-target.z)/Math.max(.01, d), side = (e.flank || 1) > 0 ? 1 : -1;
        wantX = e.x+rx*3-rz*side; wantZ = e.z+rz*3+rx*side; stop = 0;
      }else if(move.keep){
        // Casters hold their distance and circle.
        const away = d < move.keep-1.2, close = d < move.keep+1.5;
        const rx = (e.x-target.x)/Math.max(.01, d), rz = (e.z-target.z)/Math.max(.01, d);
        const orbit = ((e.flank || 1) > 0 ? 1 : -1)*2*(move.orbit || .5);
        if(away){wantX = e.x+rx*3-rz*orbit*.5; wantZ = e.z+rz*3+rx*orbit*.5; stop = 0;}
        else if(close){wantX = e.x-rz*orbit+rx*.3; wantZ = e.z+rx*orbit+rz*.3; stop = 0;}
      }else if(move.flank && d < 6.5 && d > 1.2){
        // Swarmers fan out round their prey instead of queueing behind one another.
        const a = Math.atan2(e.z-target.z, e.x-target.x)+(e.flank || 0)*move.flank*Math.PI/180*Math.min(1, (d-1)/4);
        const ring = Math.max(.8, Math.min(d-.6, 1.2+reach));
        wantX = target.x+Math.cos(a)*ring; wantZ = target.z+Math.sin(a)*ring;
      }
      const spec = ATTACKS[move.attacks[0]];
      stop = Math.max(stop, Math.min(spec.trigger*.8, 1.1)+reach);
    }
    let dirX = 0, dirZ = 0;
    const toX = wantX-e.x, toZ = wantZ-e.z, toD = Math.hypot(toX, toZ);
    if(d > stop && toD > .05){
      dirX = toX/toD; dirZ = toZ/toD;
      // Round trunks and walls: follow the target's flow field when the straight line is blocked.
      if(!move.fly && d > 1.2){
        const anchor = target.homing ? null : (people.includes(target) || target.type === 'hearth' || target.type === 'cart' ? target : null);
        if(anchor){
          const step = fieldStep(fieldFor(world, obstacles, anchor, sig), e.x, e.z);
          if(step){dirX = step.x; dirZ = step.z;}
        }
      }
      if(e.detour > 0){
        e.detour -= dt;
        const s = (e.flank || 1) > 0 ? 1 : -1, c = Math.cos(1.1*s), n = Math.sin(1.1*s);
        const rx = dirX*c-dirZ*n, rz = dirX*n+dirZ*c; dirX = rx; dirZ = rz;
      }
    }else if(move.keep && d <= stop){dirX = 0; dirZ = 0;}

    // Spacing: push away from crowding neighbours and out of the wanderer.
    let pushX = 0, pushZ = 0;
    const me = bodyOf(e), gx = Math.floor(e.x/CELL), gz = Math.floor(e.z/CELL);
    for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){
      const bucket = crowd.get((gx+i+4096)*8192+(gz+j+4096)); if(!bucket) continue;
      for(const o of bucket){
        if(o === e || (!!moveOf(o.type).fly) !== (!!move.fly)) continue;
        const ox = e.x-o.x, oz = e.z-o.z, od = Math.hypot(ox, oz), gap = (me+bodyOf(o))*.95;
        if(od >= gap) continue;
        if(od < 1e-3){pushX += (e.flank || .5); pushZ += .3; continue;}
        const w = (gap-od)/gap; pushX += ox/od*w; pushZ += oz/od*w;
      }
    }
    for(const p of people){
      const ox = e.x-p.x, oz = e.z-p.z, od = Math.hypot(ox, oz), gap = me+.34;
      if(od < gap && od > 1e-3){const w = (gap-od)/gap; pushX += ox/od*w*2; pushZ += oz/od*w*2;}
    }

    const top = def.speed*(e.slowed > 0 ? .35 : 1)*(e.minion ? 1.1 : 1);
    const wantVX = dirX*top+pushX*3, wantVZ = dirZ*top+pushZ*3;
    const k = Math.min(1, move.accel*dt/Math.max(.5, top));
    e.vx = (e.vx || 0)+(wantVX-(e.vx || 0))*Math.min(1, k*2);
    e.vz = (e.vz || 0)+(wantVZ-(e.vz || 0))*Math.min(1, k*2);
    const speed = Math.hypot(e.vx, e.vz);
    if(speed < .02){e.vx = e.vz = 0; continue;}

    if(move.fly){
      e.x += e.vx*dt; e.z += e.vz*dt;
      const r = Math.hypot(e.x, e.z), R = (world.radius || 96)-1.2; if(r > R){e.x *= R/r; e.z *= R/r;}
    }else{
      const moved = world.move(e, e.vx, e.vz, dt, obstacles);
      const progress = Math.hypot(e.x-sx, e.z-sz);
      if(!moved || progress < speed*dt*.25){
        e.stuck = (e.stuck || 0)+dt;
        // Walls and gates in the way get clawed when there is no way round.
        const wall = !target.homing && world.buildings.find(b => ['wall', 'gate'].includes(b.type) && !b.open && b.hp > 0 && dist(b, e) < 1.8);
        if(wall && e.cooldown <= 0){wall.hp -= def.damage*(e.power || 1)*STRUCTURE_HIT; e.cooldown = def.period; world.event('hit', wall.x, wall.z); e.stuck = 0;}
        else if(e.stuck > .7){e.detour = .6; e.stuck = 0;}
      }else e.stuck = Math.max(0, (e.stuck || 0)-dt);
      e.vx = (e.x-sx)/dt; e.vz = (e.z-sz)/dt;
    }
  }
  stepHostile(world, dt);
  world.frameObstacles = null;
}
