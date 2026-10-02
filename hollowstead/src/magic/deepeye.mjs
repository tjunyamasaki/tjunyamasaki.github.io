// The Eye of the Deep: torn from The Unblinking (bosses.mjs drops it). It floats at your shoulder and stares.
// Hold attack and its gaze locks onto one foe as a beam that burns hotter the longer it holds: plain at
// first, three times as hot at full heat. Change target and most of the heat is lost. When a foe dies in a
// hot gaze, the eye does not blink: the gaze leaps to the next foe nearby and keeps its heat.
// Skill, Open the Abyss: the eye swells and its beam sweeps a full circle round you, then the dark it opened
// folds shut on whatever stands close.
// The gaze lives on the wielder (`p.gaze`, `p.abyss`: players travel in snapshots); the beam is drawn by
// src/fx/deepeye.mjs from those fields.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'deepeye';
export const GAZE = Object.freeze({
  damage: 3, tick: .25, range: 10, heatRate: .3, mult: 2, hold: .7, decay: 1.4, keep: .3, jump: 6.5, jumpHeat: .4, cooldown: .45, wearEvery: 4,
});
export const ABYSS = Object.freeze({duration: 1.6, radius: 9.5, fold: 3.6});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Eye of the Deep', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: GAZE.damage, durability: 300, cooldown: GAZE.cooldown, stamina: 3,
    blurb: 'Torn from The Unblinking. Hold attack: its gaze burns one foe hotter and hotter, and when that foe dies the gaze leaps to the next without losing its heat.',
  },
  mobs: [],
  sprites: {
    item: {src: 'assets/magic/deepeye/item.svg', icon: 'assets/magic/deepeye/icon.svg',
      size: [1.2, 1.4], anchor: [.5, .4], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

const hostiles = world => {
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.hp > 0 && !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
};
const round = n => Math.round(n*100)/100;
function hurt(world, e, amount, ownerId){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId});
  e.lastHitBy = ownerId; if(e.home && !e.aggro) e.aggro = true;
}
function nearest(foes, x, z, range, dx = 0, dz = 0){
  let best = null, score = Infinity;
  for(const e of foes){
    const ex = e.x-x, ez = e.z-z, d = Math.hypot(ex, ez);
    if(d > range) continue;
    const s = d*(1.2-.2*(d > 1e-6 && (dx || dz) ? (ex*dx+ez*dz)/d : 1));
    if(s < score){score = s; best = e;}
  }
  return best;
}

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || !weapon || weapon.itemId !== PACK || !(weapon.durability > 0) || player.down || player.ghost || player.online === false ||
    player.cooldown > .05 || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const l = Math.hypot(player.dx || 0, player.dz || 0), dx = l > 1e-6 ? player.dx/l : 0, dz = l > 1e-6 ? player.dz/l : 1;
  const foes = hostiles(world), g = player.gaze;
  const held = g?.targetId ? foes.find(e => e.id === g.targetId && Math.hypot(e.x-player.x, e.z-player.z) <= GAZE.range+1) : null;
  const target = held || nearest(foes, player.x, player.z, GAZE.range, dx, dz);
  if(!target){player.cooldown = GAZE.cooldown; if(g) g.until = Math.min(g.until || 0, world.time); return null;}
  const power = ownerPower(world, player);
  if(held) g.until = world.time+GAZE.hold;
  else player.gaze = {targetId: target.id, heat: round((g?.heat || 0)*GAZE.keep), until: world.time+GAZE.hold, tick: 0, power, tx: round(target.x), tz: round(target.z), on: true, uses: g?.uses || 0};
  const gaze = player.gaze;
  gaze.power = power; gaze.on = true;
  gaze.uses = (gaze.uses || 0)+1;
  if(gaze.uses%GAZE.wearEvery === 0) world.wearEquipped(player, 'weapon', 1);
  const d = Math.max(.01, Math.hypot(target.x-player.x, target.z-player.z));
  player.dx = (target.x-player.x)/d; player.dz = (target.z-player.z)/d; player.rest = false;
  player.cooldown = GAZE.cooldown; player.aimUntil = world.time+.5;
  player.action = 'attack'; player.actionUntil = world.time+.3;
  if(!held) world.event('gaze', player.x, player.z, '', {player: player.id, tx: gaze.tx, tz: gaze.tz});
  return gaze;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  let foes = null;
  for(const p of world.players || []){
    if(p.gaze) stepGaze(world, p, dt, foes ||= hostiles(world));
    if(p.abyss) stepAbyss(world, p, dt, foes ||= hostiles(world));
  }
}

function stepGaze(world, p, dt, foes){
  const g = p.gaze, armed = p.equipment?.weapon?.itemId === PACK && p.equipment.weapon.durability > 0 && !p.down && !p.ghost && p.online !== false;
  if(!armed){p.gaze = null; return;}
  let target = g.targetId ? foes.find(e => e.id === g.targetId) : null;
  if(target && Math.hypot(target.x-p.x, target.z-p.z) > GAZE.range+1.5) target = null;
  if(!target && g.targetId){
    // The eye does not blink: from a hot gaze it leaps to the next foe near where the last one fell.
    const next = g.heat >= GAZE.jumpHeat ? nearest(foes.filter(e => Math.hypot(e.x-p.x, e.z-p.z) <= GAZE.range), g.tx, g.tz, GAZE.jump) : null;
    if(next){world.event('gazejump', g.tx, g.tz, '', {player: p.id, tx: round(next.x), tz: round(next.z), heat: g.heat}); g.targetId = next.id; target = next; g.until = Math.max(g.until, world.time+.35);}
    else g.targetId = null;
  }
  const active = target && world.time <= g.until;
  if(!active){
    g.on = false; g.heat = round(Math.max(0, g.heat-GAZE.decay*dt));
    if(g.heat <= 0 && world.time > g.until+.5){p.gaze = null;}
    return;
  }
  g.on = true; g.tx = round(target.x); g.tz = round(target.z);
  g.heat = round(Math.min(1, g.heat+GAZE.heatRate*dt));
  g.tick -= dt;
  while(g.tick <= 0){
    g.tick += GAZE.tick;
    hurt(world, target, GAZE.damage*(g.power || 1)*(1+GAZE.mult*g.heat), p.id);
  }
}

/** Open the Abyss (skill-book.mjs SKILL_CALLS.abyss). */
export function openAbyss(world, owner, b){
  const a0 = Math.atan2(owner.dz || 1, owner.dx || 0);
  owner.abyss = {at: world.time, t: 0, a0: round(a0), dir: (world.idCounter%2) ? 1 : -1, hit: [], dmg: b.dmg, fold: b.fold, swept: 0};
  world.event('abyss', owner.x, owner.z, '', {player: owner.id});
  return {radius: ABYSS.radius};
}
function stepAbyss(world, p, dt, foes){
  const a = p.abyss, before = a.swept;
  a.t += dt;
  const k = Math.min(1, a.t/ABYSS.duration);
  a.swept = round(k*Math.PI*2);
  for(const e of foes){
    if(a.hit.includes(e.id)) continue;
    const d = Math.hypot(e.x-p.x, e.z-p.z);
    if(d > ABYSS.radius) continue;
    let rel = (Math.atan2(e.z-p.z, e.x-p.x)-a.a0)*a.dir;
    rel = ((rel%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
    if(rel >= before-.15 && rel <= a.swept+.05){a.hit.push(e.id); hurt(world, e, a.dmg, p.id);}
  }
  if(k >= 1){
    for(const e of foes) if(Math.hypot(e.x-p.x, e.z-p.z) <= ABYSS.fold){hurt(world, e, a.fold, p.id); e.stunned = Math.max(e.stunned || 0, .8);}
    world.event('abyssfold', p.x, p.z, '', {player: p.id, radius: ABYSS.fold});
    p.abyss = null;
  }
}
