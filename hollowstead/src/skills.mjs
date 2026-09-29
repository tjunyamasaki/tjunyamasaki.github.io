// Weapon skills. Every weapon carries two moves: its auto attack (World.attack, arsenal.mjs and the
// magic packs) and a skill. A skill drains the whole stamina bar (at least SKILL.minStamina must be
// there; a fuller bar hits harder), recharges on its own timer, and is scripted in skill-book.mjs as
// a short list of timed "beats" on world.beats: blasts, cones, lines, travelling waves, lingering
// pulses, dashes, blinks, volleys and summons. Beats are plain data, so they travel in snapshots and
// guests can draw them; the host alone steps them and deals the damage through World.strike.
// Presentation lives in src/fx: every beat that fires raises an 'fx' event, and pending beats are
// drawn from their own age, with more flourish the higher the weapon's rank.
import {EQUIPMENT} from './content.mjs?v=harvest-18';
import {WEAPON_STYLES, keepsKnockback, maxHealth, powerOf, rankOf, refineStat} from './progression.mjs?v=harvest-18';
import {isMagicAlly, magicItems} from './magic/registry.mjs?v=harvest-18';
import {applyDot, knockFrom, stun} from './arsenal.mjs?v=harvest-18';
import {SKILL_BOOK, SKILL_CALLS} from './skill-book.mjs?v=harvest-18';

export const SKILL = Object.freeze({
  minStamina: 40,   // the bar must hold at least this much; the skill always drains all of it
  weakest: .7,      // damage share at minStamina; a full bar is 1
  lock: .35,        // brief pause before the auto attack resumes
  wear: 2,          // durability per skill outside the arena
  maxBeats: 160,    // bounded, whatever a script asks for
});

const TAU = Math.PI*2;
const clamp01 = n => Math.max(0, Math.min(1, n));
const dist = (a, b) => Math.hypot((a.x||0)-(b.x||0), (a.z||0)-(b.z||0));
const bossy = e => e.type === 'king' || e.type === 'golem';
/** Rough body radius of a hostile, so big ones are easier to catch with a line. */
const bodyOf = e => e.type === 'king' ? 1.2 : e.type === 'golem' || e.type === 'brute' ? .9 : .5;
export const hostiles = world => (world.enemies || []).filter(e => e && e.hp > 0 && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));

export function skillOf(itemId){return SKILL_BOOK[itemId] || null;}
/** What the skill button shows for the weapon in hand (fists have one too). */
export function skillFor(p){
  const weapon = p?.equipment?.weapon;
  const itemId = weapon && weapon.durability > 0 ? weapon.itemId : 'fist';
  const def = skillOf(itemId);
  return def ? {itemId, name: def.name, blurb: def.blurb, cooldown: def.cooldown} : null;
}
function baseDamage(itemId){
  if(Object.hasOwn(magicItems, itemId)) return magicItems[itemId].damage || 10;
  if(itemId === 'fist') return WEAPON_STYLES.fist.damage;
  return EQUIPMENT[itemId]?.damage || 10;
}
/** Damage share from the stamina the skill drains. */
export function skillStrength(stamina){
  return SKILL.weakest+(1-SKILL.weakest)*clamp01(((stamina||0)-SKILL.minStamina)/(100-SKILL.minStamina));
}
/** Why the skill cannot fire right now ('' when it can). */
export function skillBlock(world, p){
  if(!p || p.down || p.ghost || p.online === false) return 'unavailable';
  if(world?.arena?.freeSkills) return '';
  if(p.skillCd > 0) return 'cooldown';
  if((p.stamina||0) < SKILL.minStamina) return 'stamina';
  return '';
}

/** Fire the skill of the weapon in hand. Host only. */
export function useSkill(world, p){
  const block = skillBlock(world, p);
  const weapon = p?.equipment?.weapon;
  const itemId = weapon && weapon.durability > 0 ? weapon.itemId : 'fist';
  const def = skillOf(itemId);
  if(!def || block === 'unavailable') return {ok: false, code: 'unavailable'};
  if(block === 'cooldown'){world.tell(p, `${def.name} is recharging`); return {ok: false, code: 'cooldown'};}
  if(block === 'stamina'){world.tell(p, 'Catch your breath'); return {ok: false, code: 'stamina'};}
  const free = !!world.arena?.freeSkills;
  const aim = world.aimProfile(p);
  world.autoAim(p, {reach: Math.max(def.reach || 0, aim.reach || 0), range: def.reach || aim.range, speed: aim.speed});
  const length = Math.hypot(p.dx || 0, p.dz || 0);
  if(length > 1e-6){p.dx /= length; p.dz /= length;} else {p.dx = 0; p.dz = 1;}
  const rank = rankOf(p, itemId);
  const cast = world.nextId('cast');
  const ctx = context(world, p, itemId, def, rank, free ? 1 : skillStrength(p.stamina), cast);
  def.cast(ctx);
  if(!free) p.stamina = 0;
  // Fervent (refine.mjs): a refined weapon's skill recharges sooner.
  const recharge = def.cooldown/(1+refineStat(p, 'fervent', itemId));
  p.skillCd = free ? 0 : recharge; p.skillMax = recharge;
  p.cooldown = Math.max(p.cooldown || 0, def.lock ?? SKILL.lock);
  p.rest = false; p.goal = null; p.action = 'attack'; p.actionUntil = world.time+(def.pose ?? .55); p.aimUntil = world.time+(def.pose ?? .55);
  // Replicated stamp: the held weapon strikes its skill pose and src/fx draws the cast flourish.
  p.skillCast = {itemId, at: world.time, x: p.x, z: p.z, dx: p.dx, dz: p.dz, rank, id: cast, tx: ctx.tx, tz: ctx.tz};
  world.event('skill', p.x, p.z, def.name, {player: p.id, itemId, rank, dx: p.dx, dz: p.dz, cast, tx: ctx.tx, tz: ctx.tz});
  if(itemId !== 'fist') world.wearEquipped(p, 'weapon', SKILL.wear);
  return {ok: true, code: 'ok'};
}

function context(world, p, itemId, def, rank, strength, cast){
  const D = baseDamage(itemId)*powerOf(p)*strength;
  const clampToArena = pt => {
    const R = (world.radius || 60)-1.4, r = Math.hypot(pt.x, pt.z);
    if((world.arena || world.showcase) && r > R){pt.x *= R/r; pt.z *= R/r;}
    return pt;
  };
  const ctx = {
    world, p, itemId, rank, strength, D, cast, x: p.x, z: p.z, dx: p.dx, dz: p.dz, tx: null, tz: null, rng: world.rng,
    /** Damage for a multiple of the weapon's hit, with level, rank and the stamina drained. */
    dmg: m => Math.round(D*m*10)/10,
    /** Living hostiles within range of a point, nearest first. */
    foes: (range, from = p) => hostiles(world).filter(e => dist(e, from) <= range).sort((a, b) => dist(a, from)-dist(b, from)),
    /** The skill's mark: the locked foe if in reach, else the nearest ahead, else a point in front. */
    target(range, fallback = range*.6){
      const locked = hostiles(world).find(e => e.id === p.lockId && dist(e, p) <= range);
      const enemy = locked || ctx.foes(range).sort((a, b) => score(a)-score(b))[0] || null;
      const at = clampToArena(enemy ? {x: enemy.x, z: enemy.z} : {x: p.x+p.dx*fallback, z: p.z+p.dz*fallback});
      ctx.tx = Math.round(at.x*100)/100; ctx.tz = Math.round(at.z*100)/100;
      return {x: at.x, z: at.z, enemy};
    },
    /** A random point in a disc (host rng: every guest sees the same). */
    scatter(x, z, radius){
      const a = world.rng()*TAU, r = radius*Math.sqrt(world.rng());
      const at = clampToArena({x: x+Math.cos(a)*r, z: z+Math.sin(a)*r});
      return [Math.round(at.x*100)/100, Math.round(at.z*100)/100];
    },
    /** Facing turned by `deg` degrees. */
    turn(deg){const a = Math.atan2(p.dz, p.dx)+deg*Math.PI/180; return [Math.cos(a), Math.sin(a)];},
    beat(at, spec){
      const list = (world.beats ||= []);
      if(list.length >= SKILL.maxBeats) return null;
      const b = {id: world.nextId('bt'), cast, owner: p.id, itemId, rank, age: 0, at, x: p.x, z: p.z, dx: p.dx, dz: p.dz, ...spec};
      list.push(b);
      return b;
    },
  };
  const score = e => {const d = dist(e, p); return d*(1.25-.25*(d > .01 ? ((e.x-p.x)*p.dx+(e.z-p.z)*p.dz)/d : 1));};
  return ctx;
}

// ------------------------------------------------------------------ what a hit does
/**
 * One skill hit on one hostile. Returns true when it landed. Effects: dmg (with optional falloff by
 * distance), push (+ away from the centre, - pull toward it, or along the beat's direction), stun,
 * freeze, slow, root, a bleed or burn over time, and a heal per foe (leech).
 */
function hit(world, owner, e, b, cx, cz, obstacles, reach = b.r){
  if(!(e.hp > 0)) return false;
  const d = Math.hypot(e.x-cx, e.z-cz);
  if(b.dmg > 0){
    const fall = b.falloff && reach > 0 ? 1-b.falloff*Math.min(1, d/reach) : 1;
    world.strike(owner, e, b.dmg*fall, 0);
  }
  // Only the plain blades, bows and fists still knock back; every weapon may still pull (push < 0).
  if(b.push && (b.push < 0 || keepsKnockback(b.itemId))){
    if(b.pushDir === 'along'){knockFrom(world, e, e.x-(b.dx||0), e.z-(b.dz||0), b.push, obstacles);}
    else if(b.pushDir === 'side'){
      // Split the crowd: shove to whichever side of the line it stands on.
      const side = ((e.x-cx)*(b.dz||0)-(e.z-cz)*(b.dx||0)) >= 0 ? 1 : -1;
      knockFrom(world, e, e.x-(b.dz||0)*side, e.z+(b.dx||0)*side, b.push, obstacles);
    }
    else knockFrom(world, e, cx, cz, b.push, obstacles);
  }
  if(b.stun) stun(e, b.stun);
  if(b.freeze){stun(e, b.freeze); e.frostUntil = world.time+(bossy(e) ? b.freeze*.5 : b.freeze);}
  if(b.slow) e.slowed = Math.max(e.slowed || 0, b.slow);
  if(b.root) e.magicRootRemaining = Math.max(e.magicRootRemaining || 0, bossy(e) ? b.root*.5 : b.root);
  if(b.dot) applyDot(e, b.dot.dps, b.dot.s, owner.id, b.dot.kind || 'bleed');
  if(e.home && !e.aggro) e.aggro = true;
  return true;
}
function leech(world, owner, b, hits){
  if(!(b.leech > 0) || !hits) return;
  const heal = Math.round(Math.min(hits, b.leechCap || 3)*b.leech*maxHealth(owner));
  const before = owner.hp; owner.hp = Math.min(maxHealth(owner), owner.hp+heal);
  if(owner.hp > before) world.event('heal', owner.x, owner.z, `+${Math.round(owner.hp-before)}`, {player: owner.id});
}
/** The fx event for a beat that just fired: what src/fx needs to draw it, nothing more. */
function announce(world, b, x, z, extra = {}){
  if(b.quiet || !b.fx) return;
  const round = n => Number.isFinite(n) ? Math.round(n*100)/100 : undefined;
  world.event('fx', x, z, '', {fx: b.fx, itemId: b.itemId, rank: b.rank, player: b.owner, cast: b.cast,
    r: round(b.r), dx: round(b.dx), dz: round(b.dz), len: round(b.len), w: round(b.w), arc: b.arc, v: b.variant ?? b.seq ?? b.toll ?? b.ring ?? b.spin, ...extra});
}
function segmentGap(e, x0, z0, x1, z1){
  const sx = x1-x0, sz = z1-z0, len2 = sx*sx+sz*sz || 1e-9;
  const t = Math.max(0, Math.min(1, ((e.x-x0)*sx+(e.z-z0)*sz)/len2));
  return Math.hypot(e.x-(x0+sx*t), e.z-(z0+sz*t));
}
function snap(b, owner){
  const ahead = b.ahead || 0;
  b.x = owner.x+(b.dx||0)*ahead; b.z = owner.z+(b.dz||0)*ahead;
}

// ------------------------------------------------------------------ beats that fire once
const ONCE = {
  blast(world, b, owner, obstacles){
    let hits = 0;
    for(const e of hostiles(world)){
      const d = Math.hypot(e.x-b.x, e.z-b.z);
      if(d > b.r+bodyOf(e)*.4 || (b.inner && d < b.inner)) continue;
      if(hit(world, owner, e, b, b.x, b.z, obstacles)) hits++;
      if(b.link){const linked = world.beats.find(x => x.id === b.link); if(linked) (linked.ids ||= []).push(e.id);}
    }
    leech(world, owner, b, hits);
    announce(world, b, b.x, b.z, {hits});
  },
  arc(world, b, owner, obstacles){
    const half = Math.cos(Math.min(360, b.arc || 360)*Math.PI/360);
    let hits = 0;
    for(const e of hostiles(world)){
      const d = Math.hypot(e.x-b.x, e.z-b.z);
      if(d > b.r+bodyOf(e)*.4) continue;
      if((b.arc || 360) < 360 && d > .6 && ((e.x-b.x)*b.dx+(e.z-b.z)*b.dz)/d < half) continue;
      if(hit(world, owner, e, b, b.x, b.z, obstacles)) hits++;
    }
    leech(world, owner, b, hits);
    announce(world, b, b.x, b.z, {hits});
  },
  line(world, b, owner, obstacles){
    const x1 = b.x+b.dx*b.len, z1 = b.z+b.dz*b.len;
    let hits = 0;
    for(const e of hostiles(world)){
      if(segmentGap(e, b.x, b.z, x1, z1) > b.w+bodyOf(e)*.5) continue;
      if(hit(world, owner, e, b, b.x, b.z, obstacles, b.len)) hits++;
    }
    leech(world, owner, b, hits);
    announce(world, b, b.x, b.z, {hits});
  },
  /** Engine projectiles: arrows, bolts, wisps. Homing ones share out the nearest foes. */
  shots(world, b, owner){
    const spec = b.proj || {}, n = Math.max(1, b.n || 1);
    const marks = spec.homing ? hostiles(world).filter(e => dist(e, owner) < (spec.range || 12)+2).sort((a, c) => dist(a, owner)-dist(c, owner)) : [];
    const base = Math.atan2(b.dz, b.dx), spread = (b.spread || 0)*Math.PI/180;
    for(let i = 0; i < n; i++){
      const a = spread >= TAU-1e-3 ? base+(i+(b.phase || 0))/n*TAU : base+(n > 1 ? (i/(n-1)-.5)*spread : 0);
      const mark = marks.length ? marks[((b.fan || 0)+i)%marks.length] : null;
      const speed = spec.speed || 18;
      world.projectiles.push({id: world.nextId('pr'), kind: spec.kind || 'arrow', owner: owner.id, x: owner.x+Math.cos(a)*.4, z: owner.z+Math.sin(a)*.4,
        vx: Math.cos(a)*speed, vz: Math.sin(a)*speed, damage: b.dmg, range: spec.range || 12, traveled: 0, pierce: spec.pierce || 0,
        splash: spec.splash || 0, slow: spec.slow || 0, hit: [], age: 0, aim: a, homing: mark?.id || null, turn: spec.turn || 0,
        rank: b.rank, itemId: b.itemId, skill: b.fx || 'volley'});
    }
    announce(world, b, owner.x, owner.z, {n});
  },
  summon(world, b, owner){
    const call = SKILL_CALLS.summon;
    if(call) call(world, b, owner);
    announce(world, b, owner.x, owner.z);
  },
  heal(world, b, owner){
    const before = owner.hp; owner.hp = Math.min(maxHealth(owner), owner.hp+maxHealth(owner)*(b.pct || .1));
    if(owner.hp > before) world.event('heal', owner.x, owner.z, `+${Math.round(owner.hp-before)}`, {player: owner.id});
    announce(world, b, owner.x, owner.z);
  },
  /** Lightning from the sky onto a foe (or a spot), leaping on to the next nearest. */
  bolt(world, b, owner, obstacles){
    const foes = hostiles(world);
    const mark = foes.find(e => e.id === b.targetId) || foes.filter(e => Math.hypot(e.x-b.x, e.z-b.z) < 2.5).sort((a, c) => Math.hypot(a.x-b.x, a.z-b.z)-Math.hypot(c.x-b.x, c.z-b.z))[0];
    if(mark){b.x = mark.x; b.z = mark.z;}
    const points = [[Math.round(b.x*100)/100, Math.round(b.z*100)/100]];
    let hits = 0; const struck = new Set();
    for(const e of foes){
      if(Math.hypot(e.x-b.x, e.z-b.z) > b.r+bodyOf(e)*.4) continue;
      if(hit(world, owner, e, b, b.x, b.z, obstacles)){hits++; struck.add(e.id);}
    }
    let from = mark || {x: b.x, z: b.z};
    for(let i = 0; i < (b.chain?.n || 0); i++){
      const next = foes.filter(e => e.hp > 0 && !struck.has(e.id) && dist(e, from) < (b.chain.jump || 4)).sort((a, c) => dist(a, from)-dist(c, from))[0];
      if(!next) break;
      struck.add(next.id); world.strike(owner, next, b.chain.dmg, 0); if(b.stun) stun(next, b.stun*.6);
      points.push([Math.round(next.x*100)/100, Math.round(next.z*100)/100]); from = next; hits++;
    }
    announce(world, b, b.x, b.z, {hits, pts: points});
  },
  call(world, b, owner, obstacles){
    const fn = SKILL_CALLS[b.fn];
    const extra = fn ? fn(world, b, owner, obstacles, {hit, hostiles, dist}) : null;
    announce(world, b, b.x, b.z, extra || {});
  },
};

// ------------------------------------------------------------------ beats that last
const LASTING = {
  /** A hitter travelling along the beat's direction; each foe is struck once. */
  wave(world, b, owner, dt, obstacles){
    const step = Math.min((b.v || 12)*dt, Math.max(0, b.len-(b.traveled || 0)));
    const x0 = b.x, z0 = b.z;
    b.x += b.dx*step; b.z += b.dz*step; b.traveled = (b.traveled || 0)+step;
    const hitIds = (b.hitIds ||= []);
    let hits = 0;
    for(const e of hostiles(world)){
      if(hitIds.includes(e.id) || segmentGap(e, x0, z0, b.x, b.z) > b.w+bodyOf(e)*.5) continue;
      hitIds.push(e.id);
      if(hit(world, owner, e, b, b.x, b.z, obstacles)) hits++;
    }
    leech(world, owner, b, hits);
    return b.traveled >= b.len-1e-6;
  },
  /** Repeating hits in a radius, fixed, following the owner or drifting with (vx, vz). */
  pulse(world, b, owner, dt, obstacles, t){
    if(b.follow) snap(b, owner);
    else if(b.v){
      const x = b.x+b.dx*b.v*dt, z = b.z+b.dz*b.v*dt;
      if(world.walkable(x, z)){b.x = x; b.z = z;}
    }
    b.next ??= 0;
    let ticks = 0;
    while(b.next <= t+1e-6 && b.next <= b.life+1e-6 && ticks++ < 4){
      let hits = 0;
      for(const e of hostiles(world)){
        if(Math.hypot(e.x-b.x, e.z-b.z) > b.r+bodyOf(e)*.4) continue;
        if(hit(world, owner, e, b, b.x, b.z, obstacles)) hits++;
      }
      leech(world, owner, b, hits);
      b.next += b.every || .25;
    }
    return t >= b.life;
  },
  /** The wielder surges forward, striking everything along the way once, untouchable while moving. */
  dash(world, b, owner, dt, obstacles){
    const speed = b.len/Math.max(.05, b.life);
    const step = Math.min(speed*dt, Math.max(0, b.len-(b.traveled || 0)));
    const x0 = owner.x, z0 = owner.z;
    for(let i = 0; i < 3; i++) world.move(owner, b.dx*step/dt, b.dz*step/dt, dt/3, obstacles);
    b.traveled = (b.traveled || 0)+step;
    owner.iframes = Math.max(owner.iframes || 0, .15); owner.action = 'attack'; owner.actionUntil = world.time+.2;
    b.x = owner.x; b.z = owner.z;
    const hitIds = (b.hitIds ||= []);
    let hits = 0;
    for(const e of hostiles(world)){
      if(hitIds.includes(e.id) || segmentGap(e, x0, z0, owner.x, owner.z) > b.w+bodyOf(e)*.5) continue;
      hitIds.push(e.id);
      if(hit(world, owner, e, b, owner.x, owner.z, obstacles)) hits++;
    }
    return b.traveled >= b.len-1e-6 || Math.hypot(owner.x-x0, owner.z-z0) < step*.2;
  },
  /** Blink from foe to foe, striking each once. */
  blink(world, b, owner, dt, obstacles, t){
    b.next ??= 0; b.done_ ??= 0;
    const ids = b.ids || [];
    while(b.next <= t+1e-6 && b.done_ < ids.length){
      const e = hostiles(world).find(q => q.id === ids[b.done_]);
      b.done_++; b.next += b.every || .09;
      if(!e) continue;
      const from = [Math.round(owner.x*100)/100, Math.round(owner.z*100)/100];
      const d = Math.max(.1, dist(e, owner)), ux = (e.x-owner.x)/d, uz = (e.z-owner.z)/d;
      const land = {x: e.x+ux*.9, z: e.z+uz*.9};
      if(world.walkable(land.x, land.z)){owner.x = land.x; owner.z = land.z;}
      owner.dx = -ux; owner.dz = -uz; owner.aimUntil = world.time+.3;
      owner.iframes = Math.max(owner.iframes || 0, .2); owner.action = 'attack'; owner.actionUntil = world.time+.2;
      hit(world, owner, e, b, e.x, e.z, obstacles);
      world.event('fx', e.x, e.z, '', {fx: b.fx, itemId: b.itemId, rank: b.rank, player: owner.id, cast: b.cast, from, v: b.done_,
        dx: Math.round(-ux*100)/100, dz: Math.round(-uz*100)/100});
    }
    return b.done_ >= ids.length;
  },
};

/** Advance every pending and lasting beat. Also cools every wanderer's skill. Host only. */
export function stepSkills(world, dt, obstacles = null){
  if(!(dt > 0) || !Number.isFinite(dt)) return;
  for(const p of world.players || []) if(p.skillCd > 0) p.skillCd = Math.max(0, p.skillCd-dt);
  const list = world.beats;
  if(!Array.isArray(list) || !list.length) return;
  obstacles ||= world.frameObstacles || world.obstacles();
  const current = list.slice();
  for(const b of current){
    if(b.done) continue;
    b.age += dt;
    const owner = world.player(b.owner);
    if(!owner || !owner.online || owner.ghost){b.done = true; continue;}
    // A beat that tracks a foe glides after it until it fires (a star homing on its mark).
    if(b.track && b.age < b.at){
      const e = hostiles(world).find(q => q.id === b.track);
      if(e){const k = Math.min(1, dt*(b.trackRate || 3)); b.x += (e.x-b.x)*k; b.z += (e.z-b.z)*k;}
    }
    if(b.age < b.at) continue;
    const lasting = LASTING[b.kind];
    if(!lasting){
      if(b.follow) snap(b, owner);
      if(b.track){const e = hostiles(world).find(q => q.id === b.track); if(e){b.x = e.x; b.z = e.z;}}
      ONCE[b.kind]?.(world, b, owner, obstacles);
      b.done = true;
      continue;
    }
    if(!b.started){
      b.started = true;
      if(b.follow || b.snap) snap(b, owner);
      b.x0 = b.x; b.z0 = b.z;
      if(b.kind === 'wave' || b.kind === 'dash') announce(world, b, b.x, b.z, {start: 1});
      else if(b.kind === 'pulse') announce(world, b, b.x, b.z, {start: 1, life: b.life});
    }
    const t = b.age-b.at;
    const finished = lasting(world, b, owner, Math.min(dt, t+1e-6), obstacles, t);
    if(finished){
      b.done = true;
      if(b.end){
        const end = {...b.end, at: b.end.at || 0};
        const from = end.from === 'start' ? {x: b.x0, z: b.z0} : {x: b.x, z: b.z};
        (world.beats ||= []).push({id: world.nextId('bt'), cast: b.cast, owner: b.owner, itemId: b.itemId, rank: b.rank, age: 0,
          dx: b.dx, dz: b.dz, len: b.traveled, ...end, ...from});
      }
      if(b.kind === 'wave' || b.kind === 'dash') announce(world, b, b.x, b.z, {end: 1, x0: Math.round(b.x0*100)/100, z0: Math.round(b.z0*100)/100});
    }
  }
  world.beats = world.beats.filter(b => !b.done);
}
