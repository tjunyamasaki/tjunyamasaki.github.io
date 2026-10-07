// The Eye of the Deep: torn from The Unblinking (bosses.mjs drops it). It floats at your shoulder and stares.
// Hold attack and its gaze locks onto one foe as a beam that burns hotter the longer it holds. The heat opens
// the eye in three stages:
//   Glance      the plain beam on one foe.
//   Stare       (GAZE.pierce heat) the beam pierces: it burns every foe standing between you and the mark.
//   Unblinking  (GAZE.unblink heat) the mark is transfixed, held where it stands, and a lesser gaze opens on
//               the next foe beside it.
// Lose the mark out of reach and most of the heat is lost; kill it and the heat stays. A foe that dies under a Stare or hotter ruptures, a burst of
// the dark it was made to see, and the gaze leaps to the next foe nearby keeping its heat.
// Skill, Open the Abyss: the eye swells and its beam sweeps a full circle round you, transfixing what it
// crosses; then the dark folds shut on whatever stands close, and the eye is left wide open (full heat).
// The gaze lives on the wielder (`p.gaze`, `p.abyss`: players travel in snapshots); the beams are drawn by
// src/fx/deepeye.mjs from those fields.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'deepeye';
export const GAZE = Object.freeze({
  damage: 3.5, tick: .25, range: 10, heatRate: .42, mult: 2.2, hold: .7, decay: 1.4, keep: .3, jump: 6.5, cooldown: .45, wearEvery: 4,
  // Stare: the beam burns every foe within `width` of its line, at `pierceShare` of a tick.
  pierce: .45, width: .75, pierceShare: .5,
  // Unblinking: the mark is held (`root` s, renewed every tick) and a lesser gaze burns the next foe at `lesser`.
  unblink: .95, root: .45, lesser: .5,
  // A foe slain under a Stare or hotter bursts: `rupture` ticks' worth (times the heat) to foes within `burst`.
  rupture: 3, burst: 2.2,
});
/** Open the Abyss: the swept are held `transfix` s; afterwards the eye stays wide open for `primed` s. */
export const ABYSS = Object.freeze({duration: 1.6, radius: 9.5, fold: 3.6, transfix: 1.4, primed: 3});
/** The eye's stage at a heat: 0 Glance, 1 Stare, 2 Unblinking. */
export const stageOf = heat => heat >= GAZE.unblink ? 2 : heat >= GAZE.pierce ? 1 : 0;

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Eye of the Deep', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: GAZE.damage, durability: 300, cooldown: GAZE.cooldown, stamina: 3,
    blurb: 'Torn from The Unblinking. Hold attack: its gaze burns one foe hotter and hotter and the eye opens wider. Staring, the beam burns everything in its line; unblinking, it holds its mark still and a second gaze opens. What dies under its stare bursts, and the gaze leaps on without losing its heat.',
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
function hold(world, e, seconds){(world.pendingRoot ||= []).push({targetId: e.id, remaining: seconds});}
/** Distance from (x, z) to the segment a→b, and how far along it (0..1). */
function alongSegment(x, z, ax, az, bx, bz){
  const vx = bx-ax, vz = bz-az, l2 = vx*vx+vz*vz || 1e-6, t = Math.max(0, Math.min(1, ((x-ax)*vx+(z-az)*vz)/l2));
  return {d: Math.hypot(x-(ax+vx*t), z-(az+vz*t)), t};
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
  else{
    // Open the Abyss leaves the eye wide open: the next mark is stared at with all of that heat.
    // Only a mark that slipped out of reach costs heat; a gaze with nothing to hold (its last foe fell) keeps it.
    const primed = g?.primed > world.time, kept = primed || !g?.targetId;
    player.gaze = {targetId: target.id, heat: round((g?.heat || 0)*(kept ? 1 : GAZE.keep)), until: world.time+GAZE.hold, tick: 0, power, tx: round(target.x), tz: round(target.z), on: true, uses: g?.uses || 0, stage: 0, second: null};
  }
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
  const found = g.targetId ? foes.find(e => e.id === g.targetId) : null;
  let target = found && Math.hypot(found.x-p.x, found.z-p.z) <= GAZE.range+1.5 ? found : null;
  if(!target && g.targetId){
    // Slain under a Stare or hotter (not merely out of sight): it bursts with the dark it was made to see.
    if(!found && g.heat >= GAZE.pierce) rupture(world, p, g, foes);
    // The eye does not blink: it leaps to the next foe near where the last one fell, heat and all.
    const next = nearest(foes.filter(e => e.hp > 0 && Math.hypot(e.x-p.x, e.z-p.z) <= GAZE.range), g.tx, g.tz, GAZE.jump);
    if(next){world.event('gazejump', g.tx, g.tz, '', {player: p.id, tx: round(next.x), tz: round(next.z), heat: g.heat}); g.targetId = next.id; target = next; g.until = Math.max(g.until, world.time+.35);}
    else g.targetId = null;
  }
  const active = target && world.time <= g.until;
  if(!active){
    g.on = false; g.second = null;
    if(!(g.primed > world.time)) g.heat = round(Math.max(0, g.heat-GAZE.decay*dt));
    g.stage = stageOf(g.heat);
    if(g.heat <= 0 && world.time > g.until+.5){p.gaze = null;}
    return;
  }
  g.on = true; g.tx = round(target.x); g.tz = round(target.z);
  g.heat = round(Math.min(1, g.heat+GAZE.heatRate*dt));
  const stage = stageOf(g.heat);
  if(stage > (g.stage || 0)) world.event('gazestage', target.x, target.z, '', {player: p.id, stage});
  g.stage = stage;
  // Unblinking: a lesser gaze on the foe nearest the mark (kept while it lives and stays in reach).
  if(stage >= 2){
    const kept = g.second ? foes.find(e => e.id === g.second && e !== target && e.hp > 0 && Math.hypot(e.x-p.x, e.z-p.z) <= GAZE.range) : null;
    const lesser = kept || nearest(foes.filter(e => e !== target && Math.hypot(e.x-p.x, e.z-p.z) <= GAZE.range), target.x, target.z, GAZE.jump);
    g.second = lesser ? lesser.id : null;
    if(lesser){g.sx = round(lesser.x); g.sz = round(lesser.z);}
  }else g.second = null;
  g.tick -= dt;
  while(g.tick <= 0){
    g.tick += GAZE.tick;
    const blow = GAZE.damage*(g.power || 1)*(1+GAZE.mult*g.heat);
    hurt(world, target, blow, p.id);
    if(stage >= 1){
      // Staring: everything in the beam's line between the eye and its mark burns too.
      for(const e of foes){
        if(e === target || e.id === g.second) continue;
        const on = alongSegment(e.x, e.z, p.x, p.z, target.x, target.z);
        if(on.t > 0 && on.d <= GAZE.width) hurt(world, e, blow*GAZE.pierceShare, p.id);
      }
    }
    if(stage >= 2){
      hold(world, target, GAZE.root);
      const second = g.second ? foes.find(e => e.id === g.second) : null;
      if(second) hurt(world, second, blow*GAZE.lesser, p.id);
    }
  }
}
/** A stared-at foe fell: the dark bursts where it stood, harder the hotter the gaze. */
function rupture(world, p, g, foes){
  const amount = GAZE.rupture*GAZE.damage*(g.power || 1)*(1+GAZE.mult*g.heat)*g.heat;
  for(const e of foes) if(e.hp > 0 && Math.hypot(e.x-g.tx, e.z-g.tz) <= GAZE.burst) hurt(world, e, amount, p.id);
  world.event('gazerupture', g.tx, g.tz, '', {player: p.id, r: GAZE.burst, heat: g.heat});
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
    if(rel >= before-.15 && rel <= a.swept+.05){a.hit.push(e.id); hurt(world, e, a.dmg, p.id); hold(world, e, ABYSS.transfix);}
  }
  if(k >= 1){
    for(const e of foes) if(Math.hypot(e.x-p.x, e.z-p.z) <= ABYSS.fold){hurt(world, e, a.fold, p.id); e.stunned = Math.max(e.stunned || 0, .8);}
    world.event('abyssfold', p.x, p.z, '', {player: p.id, radius: ABYSS.fold});
    p.abyss = null;
    // The eye is left wide open: Unblinking from the first moment of its next gaze.
    const g = p.gaze;
    if(g){g.heat = 1; g.primed = round(world.time+ABYSS.primed); g.until = Math.max(g.until || 0, world.time); g.stage = 2;}
    else p.gaze = {targetId: null, heat: 1, until: world.time, tick: 0, power: ownerPower(world, p), on: false, uses: 0, stage: 2, second: null, primed: round(world.time+ABYSS.primed)};
  }
}
