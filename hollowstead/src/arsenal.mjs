// The Long Night arsenal: weapon behaviours beyond plain melee, arrows, bolts and the nova.
// Every function takes the World and mutates it the same way World.attack does:
// World.strike for hits (kill credit, knockback, aggro, floating numbers), World.event for
// presentation, and plain arrays on the world (allies, zones, projectiles) for anything that
// lives longer than one swing. Numbers come from WEAPON_STYLES in progression.mjs.
import {RULES} from './content.mjs?v=harvest-16';
import {ALLIES, maxHealth, powerOf} from './progression.mjs?v=harvest-16';
import {isMagicAlly} from './magic/registry.mjs?v=harvest-16';

const dist = (a, b) => Math.hypot((a.x||0)-(b.x||0), (a.z||0)-(b.z||0));
const hostiles = w => w.enemies.filter(e => !isMagicAlly(e) && e.hp > 0);
const bossy = e => e.type === 'king' || e.type === 'golem';
const facing = p => {const l = Math.hypot(p.dx||0, p.dz||0)||1; return {x: (p.dx||0)/l, z: (p.dz||0)/l};};
function clampToMap(o){const r = Math.hypot(o.x, o.z), R = RULES.radius-1.2; if(r > R){o.x *= R/r; o.z *= R/r;}}

/** Nearest hostile in range, preferring ones in front of the wanderer. */
export function aimTarget(w, p, range, from = p){
  const f = facing(p);
  let best = null, score = Infinity;
  for(const e of hostiles(w)){
    const d = dist(e, from); if(d > range) continue;
    const dot = d > .01 ? ((e.x-from.x)*f.x + (e.z-from.z)*f.z)/d : 1;
    const s = d * (dot > .2 ? 1 : 1.8);
    if(s < score){score = s; best = e;}
  }
  return best;
}

/** Damage over time owned by a wanderer. Refreshes rather than stacks. */
export function applyDot(e, dps, seconds, by, kind = 'bleed'){
  if(!(dps > 0) || !(seconds > 0)) return;
  if(e.dot && e.dot.dps*e.dot.remaining > dps*seconds) return;
  e.dot = {dps, remaining: seconds, by, kind};
}
export function stun(e, seconds){
  const s = bossy(e) ? seconds*.5 : seconds;
  e.stunned = Math.max(e.stunned||0, s); e.windup = 0;
}

// ------------------------------------------------------------------ melee
const combo = (w, p, {style, damage, weapon}) => {
  const target = aimTarget(w, p, style.range);
  if(!target) return;
  p.combo = w.time - (p.comboAt ?? -9) < style.window ? (p.combo||0)+1 : 1; p.comboAt = w.time;
  let amount = damage;
  if(p.combo >= style.every){
    p.combo = 0; amount *= style.rend;
    applyDot(target, damage*style.bleed, style.bleedSeconds, p.id);
    const d = Math.max(.1, dist(target, p)), step = Math.min(style.lunge, Math.max(0, d-1));
    p.x += (target.x-p.x)/d*step; p.z += (target.z-p.z)/d*step;
    w.event('rend', target.x, target.z, '', {dx: p.dx, dz: p.dz});
  }
  w.strike(p, target, amount, .2);
  w.wearEquipped(p, 'weapon', 1);
};

const lash = (w, p, {style, damage}) => {
  const f = facing(p); let hits = 0;
  for(const e of hostiles(w)){
    const rx = e.x-p.x, rz = e.z-p.z, along = rx*f.x + rz*f.z, side = Math.abs(rx*f.z - rz*f.x);
    if(along < -.3 || along > style.range || side > style.width) continue;
    w.strike(p, e, damage, 0); hits++;
    const d = Math.max(.1, dist(e, p)), pull = Math.min(style.pull*(bossy(e) ? .35 : 1), Math.max(0, d-1.3));
    e.x -= (e.x-p.x)/d*pull; e.z -= (e.z-p.z)/d*pull;
  }
  w.event('lash', p.x, p.z, '', {dx: f.x, dz: f.z, range: style.range});
  if(hits) w.wearEquipped(p, 'weapon', 1);
};

const reap = (w, p, {style, damage}) => {
  const f = facing(p); let hits = 0;
  for(const e of hostiles(w)){
    const d = dist(e, p); if(d >= style.range) continue;
    const dot = d < .6 ? 1 : ((e.x-p.x)*f.x + (e.z-p.z)*f.z)/d;
    if(dot < Math.cos(style.arc*Math.PI/360)) continue;
    w.strike(p, e, damage, .45); hits++;
  }
  w.event('cleave', p.x, p.z, '', {dx: f.x, dz: f.z, arc: style.arc, range: style.range});
  if(hits){
    const heal = Math.round(Math.min(hits, style.leechCap)*style.leech*maxHealth(p));
    const before = p.hp; p.hp = Math.min(maxHealth(p), p.hp+heal);
    if(p.hp > before) w.event('heal', p.x, p.z, `+${Math.round(p.hp-before)}`, {player: p.id});
    w.wearEquipped(p, 'weapon', 1);
  }
};

// ------------------------------------------------------------------ magic ranged
const wisps = (w, p, {style, damage}) => {
  const f = facing(p);
  const marks = hostiles(w).filter(e => dist(e, p) < style.seek).sort((a, b) => dist(a, p)-dist(b, p));
  for(let i = 0; i < style.count; i++){
    const target = marks.length ? marks[i % marks.length] : null;
    const spread = (i-(style.count-1)/2)*.65, a = Math.atan2(f.z, f.x)+spread;
    w.projectiles.push({id: w.nextId('pr'), kind: 'wisp', owner: p.id, x: p.x+Math.cos(a)*.6, z: p.z+Math.sin(a)*.6,
      vx: Math.cos(a)*style.speed, vz: Math.sin(a)*style.speed, damage, range: style.range, traveled: 0, pierce: 0,
      splash: 0, slow: 0, hit: [], age: 0, aim: a, homing: target?.id || null, turn: style.turn});
  }
  w.wearEquipped(p, 'weapon', 1);
};

const chain = (w, p, {style, damage}) => {
  let target = aimTarget(w, p, style.range);
  const points = [[p.x, p.z]];
  if(!target){const f = facing(p); points.push([p.x+f.x*style.range*.6, p.z+f.z*style.range*.6]); w.event('chain', p.x, p.z, '', {points}); w.wearEquipped(p, 'weapon', 1); return;}
  const hit = new Set(); let amount = damage;
  for(let jump = 0; target && jump <= style.jumps; jump++){
    hit.add(target.id); points.push([target.x, target.z]);
    w.strike(p, target, amount, .15);
    if(style.shock) target.stunned = Math.max(target.stunned||0, style.shock);
    amount *= style.falloff;
    const from = target;
    target = hostiles(w).filter(e => !hit.has(e.id) && dist(e, from) < style.jump).sort((a, b) => dist(a, from)-dist(b, from))[0];
  }
  w.event('chain', p.x, p.z, '', {points});
  w.wearEquipped(p, 'weapon', 1);
};

const meteor = (w, p, {style, damage}) => {
  const target = aimTarget(w, p, style.range), f = facing(p);
  const x = target ? target.x : p.x+f.x*6, z = target ? target.z : p.z+f.z*6;
  (w.zones ||= []).push({id: w.nextId('zn'), kind: 'star', owner: p.id, x, z, age: 0, delay: style.delay, radius: style.radius, damage});
  w.event('mark', x, z, '', {radius: style.radius});
  w.wearEquipped(p, 'weapon', 1);
};

// ------------------------------------------------------------------ summons
function summon(w, p, type, x, z, damage){
  const def = ALLIES[type], power = powerOf(p);
  const hp = Math.round(def.hp*(def.scales ? power : 1));
  const ally = {id: w.nextId('al'), type, owner: p.id, x, z, hp, maxHp: hp, damage, age: 0, life: def.life,
    cooldown: .3, facing: (p.dx||1) < 0 ? -1 : 1, anim: 'idle', swing: 0, spawn: 0};
  clampToMap(ally);
  (w.allies ||= []).push(ally);
  w.event('summon', ally.x, ally.z, '', {kind: type});
  return ally;
}
const mine = (w, p, type) => (w.allies||[]).filter(a => a.owner === p.id && a.type === type && a.hp > 0);

const crows = (w, p, {style, damage}) => {
  const flock = mine(w, p, 'crow');
  for(const crow of flock){crow.age = 0; crow.damage = damage;}
  const room = Math.max(0, style.cap-flock.length);
  for(let i = 0; i < Math.min(room, style.count); i++){
    const a = i/style.count*Math.PI*2;
    summon(w, p, 'crow', p.x+Math.cos(a)*.8, p.z+Math.sin(a)*.8, damage);
  }
  w.wearEquipped(p, 'weapon', 1);
};

const sentry = (w, p, {style, damage}) => {
  const f = facing(p), jacks = mine(w, p, 'jack').sort((a, b) => b.age-a.age);
  while(jacks.length >= style.cap){const old = jacks.shift(); w.allies = w.allies.filter(a => a !== old); w.event('poof', old.x, old.z, '', {kind: 'jack'});}
  const spot = {x: p.x+f.x*1.3, z: p.z+f.z*1.3};
  summon(w, p, 'jack', spot.x, spot.z, damage);
  w.wearEquipped(p, 'weapon', 1);
};

const wight = (w, p, {style, damage}) => {
  const knight = mine(w, p, 'wight')[0];
  if(knight){
    knight.age = 0; knight.damage = damage; const heal = Math.round(knight.maxHp*style.mend);
    knight.hp = Math.min(knight.maxHp, knight.hp+heal); w.event('heal', knight.x, knight.z, `+${heal}`);
  }else{const f = facing(p); summon(w, p, 'wight', p.x+f.x*1.4, p.z+f.z*1.4, damage);}
  w.wearEquipped(p, 'weapon', 1);
};

// ------------------------------------------------------------------ crowd control
const frost = (w, p, {style, damage}) => {
  const target = aimTarget(w, p, style.range), f = facing(p);
  const x = target ? target.x : p.x+f.x*4, z = target ? target.z : p.z+f.z*4;
  (w.zones ||= []).push({id: w.nextId('zn'), kind: 'frost', owner: p.id, x, z, age: 0, life: style.life,
    radius: style.radius, dps: damage, freezeAfter: style.freezeAfter, freeze: style.freeze, exposed: {}, frozen: []});
  w.event('frost', x, z, '', {radius: style.radius});
  w.wearEquipped(p, 'weapon', 1);
};

export const ARSENAL = Object.freeze({combo, lash, reap, wisps, chain, meteor, crows, sentry, wight, frost});

// ------------------------------------------------------------------ per tick
/** Damage over time, stars, frost clouds, and the allies' own little lives. */
export function stepArsenal(w, dt, obstacles){
  const foes = hostiles(w);
  for(const e of foes){
    if(e.dot){const amount = Math.min(e.dot.remaining, dt)*e.dot.dps; e.hp -= amount; e.lastHitBy = e.dot.by || e.lastHitBy; e.dot.remaining -= dt; if(e.dot.remaining <= 0) delete e.dot;}
  }
  if(w.zones?.length){
    for(const zone of w.zones){
      zone.age += dt;
      const owner = w.player(zone.owner);
      if(zone.kind === 'star' && !zone.done && zone.age >= zone.delay){
        zone.done = true;
        for(const e of foes) if(e.hp > 0){const d = dist(e, zone); if(d < zone.radius) w.strike(owner, e, zone.damage*(1-.4*d/zone.radius), .7);}
        w.event('starfall', zone.x, zone.z, '', {radius: zone.radius});
      }
      if(zone.kind === 'frost'){
        for(const e of foes){
          if(e.hp <= 0 || dist(e, zone) > zone.radius) continue;
          e.hp -= zone.dps*dt; e.lastHitBy = zone.owner; e.slowed = Math.max(e.slowed||0, .4);
          zone.exposed[e.id] = (zone.exposed[e.id]||0)+dt;
          if(zone.exposed[e.id] >= zone.freezeAfter && !zone.frozen.includes(e.id)){zone.frozen.push(e.id); stun(e, zone.freeze); w.event('freeze', e.x, e.z, 'Frozen');}
        }
        if(zone.age >= zone.life) zone.done = true;
      }
    }
    w.zones = w.zones.filter(zone => !zone.done);
  }
  stepAllies(w, dt, obstacles, foes);
}

function stepAllies(w, dt, obstacles, foes){
  if(!w.allies?.length) return;
  for(const a of w.allies){
    const def = ALLIES[a.type]; if(!def){a.hp = 0; continue;}
    a.age += dt; a.spawn += dt; a.cooldown = Math.max(0, a.cooldown-dt); a.swing = Math.max(0, a.swing-dt);
    const owner = w.player(a.owner);
    if(!owner || a.age >= a.life){a.hp = 0; continue;}
    if(a.hp <= 0) continue;
    const reachable = foes.filter(e => e.hp > 0 && dist(e, a) < def.sight && dist(e, owner) < def.leash);
    const target = reachable.sort((x, y) => dist(x, a)-dist(y, a))[0];
    a.anim = a.swing > 0 ? 'attack' : 'idle';
    if(def.ranged){
      if(target && a.cooldown <= 0){
        const d = Math.max(.1, dist(target, a)), vx = (target.x-a.x)/d, vz = (target.z-a.z)/d;
        w.projectiles.push({id: w.nextId('pr'), kind: 'seed', owner: a.owner, x: a.x+vx*.5, z: a.z+vz*.5, vx: vx*def.shot, vz: vz*def.shot,
          damage: a.damage||0, range: def.sight+1, traveled: 0, pierce: 0, splash: 0, slow: 0, hit: [], age: 0, aim: Math.atan2(vz, vx)});
        a.cooldown = def.period; a.swing = .3; a.anim = 'attack'; a.facing = vx < 0 ? -1 : 1;
      }
      continue;
    }
    let goal = null, speed = def.speed;
    if(target){
      const d = dist(target, a);
      a.facing = target.x < a.x ? -1 : 1;
      if(d <= def.range && a.cooldown <= 0){
        a.cooldown = def.period; a.swing = .35; a.anim = 'attack';
        const struck = def.arc ? foes.filter(e => {const dd = dist(e, a); if(e.hp <= 0 || dd > def.range+.2) return false; if(dd < .5) return true; return ((e.x-a.x)*(target.x-a.x)+(e.z-a.z)*(target.z-a.z))/(dd*d) >= Math.cos(def.arc*Math.PI/360);}) : [target];
        for(const e of struck) allyStrike(w, a, e, a.damage||0);
      }else if(d > def.range*.8) goal = target;
    }else{
      const f = facing(owner), slot = w.allies.filter(o => o.owner === a.owner && o.type === a.type).indexOf(a);
      const angle = Math.atan2(-f.z, -f.x)+(slot-1)*.7+(def.fly ? Math.sin(w.time*1.7+slot)*.5 : 0);
      goal = {x: owner.x+Math.cos(angle)*def.follow, z: owner.z+Math.sin(angle)*def.follow};
      if(dist(a, owner) > 5) speed *= 1.6;
      if(dist(goal, a) < .3) goal = null;
    }
    if(dist(a, owner) > def.leash){a.x = owner.x+(a.x-owner.x)*.5; a.z = owner.z+(a.z-owner.z)*.5;}
    if(goal){
      const d = Math.max(.01, dist(goal, a)), vx = (goal.x-a.x)/d*speed, vz = (goal.z-a.z)/d*speed;
      if(def.fly){a.x += vx*dt; a.z += vz*dt; clampToMap(a);} else if(!w.move(a, vx, vz, dt, obstacles)) w.move(a, -vz, vx, dt, obstacles);
      if(Math.abs(vx) > .05) a.facing = vx < 0 ? -1 : 1;
      if(a.swing <= 0) a.anim = 'walk';
    }
  }
  for(const a of w.allies) if(a.hp <= 0) w.event('poof', a.x, a.z, '', {kind: a.type});
  w.allies = w.allies.filter(a => a.hp > 0);
}

function allyStrike(w, a, e, amount){
  const dealt = Math.max(1, Math.round(amount));
  e.hp -= dealt; e.lastHitBy = a.owner;
  const d = Math.max(.1, dist(e, a)), k = bossy(e) ? .08 : .2;
  e.x += (e.x-a.x)/d*k; e.z += (e.z-a.z)/d*k;
  if(e.home && !e.aggro) e.aggro = true;
  w.event('damage', e.x, e.z, String(dealt));
}

/** What a hostile hunts: a taunting knight close by, else the nearest wanderer or ally. */
export function preyFor(w, e, people, reach){
  const allies = [...(w.allies||[]), ...(w.magicSummons||[])].filter(a => a && a.hp > 0 && Number.isFinite(a.x));
  const taunt = allies.find(a => ALLIES[a.type]?.taunt && dist(a, e) < ALLIES[a.type].taunt);
  if(taunt) return taunt;
  let best = null, bestD = reach;
  for(const q of [...people, ...allies]){const d = dist(q, e); if(d < bestD){best = q; bestD = d;}}
  return best;
}

/** A hostile's blow lands: wanderers take it through armour; allies simply lose hp. */
export function landBlow(w, e, amount, radius){
  for(const a of [...(w.allies||[]), ...(w.magicSummons||[])]){
    if(a && a.hp > 0 && Math.hypot(a.x-e.tx, a.z-e.tz) < radius){a.hp -= amount*(ALLIES[a.type]?.guard ?? 1); w.event('hit', a.x, a.z);}
  }
}
