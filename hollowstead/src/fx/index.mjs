// Weapon effects for both renderers. The renderer hands every new world event to `event()` and calls
// `build()` once a frame; build returns command lists (normal and additive glow), a camera shake,
// a screen flash, and short-lived lights for the night field. Nothing here touches the simulation.
import {Painter, seedOf} from './kit.mjs?v=harvest-18';
import {STARFALL_BEATS, STARFALL_EVENTS, paintConstellations, paintStarZone, paintStarfallCast} from './starfall.mjs?v=harvest-18';
import {SKILL_BEATS, SKILL_EVENTS, paintSkillCast} from './skills.mjs?v=harvest-18';
import {FLAIR_EVENTS, paintFrostZone, paintFrozen, paintMagicCast, paintProjectile, paintSunburn} from './flair.mjs?v=harvest-18';
import {FOX_EVENTS, PACK as FOX, foxRank, paintFoxBolt, paintFoxCast, paintFoxPuff, paintFoxSkillCast, paintFoxTails} from './kitsune.mjs?v=harvest-18';
import {magicItems} from '../magic/registry.mjs?v=harvest-18';

const EVENTS = {...FLAIR_EVENTS, ...STARFALL_EVENTS, ...SKILL_EVENTS, ...FOX_EVENTS};
const BEATS = {...SKILL_BEATS, ...STARFALL_BEATS};
const MAX_LIVE = 110, MAX_HITS = 26;

export class WeaponFx {
  constructor(){
    this.painter = new Painter(); this.live = []; this.memory = new Map();
    // Kitsune tails: their own painter (each wielder's tails go to a mesh behind their sprite),
    // smoothed wielder motion, and where the tips were last frame (foxfires leave from there).
    this.tailPainter = new Painter(); this.motion = new Map(); this.tips = new Map();
    this.shake = 0; this.flash = 0; this.flashColor = '#fff3cf'; this.clock = 0;
  }
  reset(){this.live.length = 0; this.memory.clear(); this.motion.clear(); this.tips.clear(); this.shake = 0; this.flash = 0;}
  /** A world event arrived. */
  event(ev, clock, world){
    const key = ev.type === 'fx' ? `fx:${ev.fx}` : ev.type;
    const spec = EVENTS[key];
    if(!spec || (spec.when && !spec.when(ev))) return;
    let record = ev;
    // The kitsune's events are drawn in their wielder's colour and rank.
    if(world && (ev.itemId === FOX || ev.type === 'foxburst')){
      const owner = world.player?.(ev.player);
      record = {...ev, look: owner?.kitsuneLook?.hue, rank: ev.rank ?? foxRank(owner)};
    }
    if(spec.resolve){
      record = spec.resolve(record, world);
      if(!record) return;
      if(this.live.filter(fx => fx.key === 'damage').length >= MAX_HITS) return;
    }
    const life = spec.life(record);
    if(!(life > 0)) return;
    this.live.push({key, ev: record, t0: clock, life, spec, seed: seedOf(ev.id)});
    if(this.live.length > MAX_LIVE) this.live.splice(0, this.live.length-MAX_LIVE);
    const kick = spec.kick?.(record);
    if(kick){
      if(kick.shake > this.shake) this.shake = Math.min(1.2, kick.shake);
      if(kick.flash > .01){this.flash = Math.min(.6, Math.max(this.flash, kick.flash)); if(kick.color) this.flashColor = kick.color;}
    }
    spec.remember?.(this, record, clock);
  }
  /** Everything to draw this frame. `frame` is the MagicClock sample; `focus` the camera centre. */
  build(world, frame, clock, dt, focus){
    const d = this.painter, lead = frame?.lead || 0;
    d.reset(focus);
    this.clock = clock;
    for(const zone of world.zones || []){
      if(zone.kind === 'star') paintStarZone(d, zone, lead, clock);
      else if(zone.kind === 'frost') paintFrostZone(d, zone, lead, clock);
    }
    const players = new Map((world.players || []).map(p => [p.id, p]));
    for(const beat of world.beats || []){
      const spec = BEATS[beat.fx];
      if(!spec || !d.near(beat.x, beat.z, 6)) continue;
      // Kitsune beats need the wielder's colour, and where the wielder stands (the fox leaps from there).
      const owner = beat.itemId === FOX ? players.get(beat.owner) : null;
      const b = owner ? {...beat, look: owner.kitsuneLook?.hue, ox: owner.x, oz: owner.z} : beat;
      const tt = (b.age || 0)+lead;
      if(tt < b.at){if(spec.pending) spec.pending(d, b, tt, clock, lead);}
      else if(spec.lasting && b.started && !b.done) spec.lasting(d, b, tt-b.at, clock, lead);
    }
    for(const shot of world.projectiles || []) paintProjectile(d, shot, lead, clock);
    for(const e of world.magicCasts || []) if(e.packId === FOX) paintFoxCast(d, e, players.get(e.ownerId), lead);
    for(const b of world.magicBolts || []) if(b.packId === FOX && b.launched) paintFoxBolt(d, b, players.get(b.ownerId), this.tips.get(b.ownerId), lead, clock);
    for(const e of world.magicPuffs || []) if(e.packId === FOX){const owner = players.get(e.ownerId); paintFoxPuff(d, e, owner, foxRank(owner), lead);}
    for(const e of world.enemies || []){
      if(e.frostUntil) paintFrozen(d, e, frame?.time ?? world.time);
      if(e.sunburn) paintSunburn(d, e, clock);
    }
    for(const p of world.players || []){
      if(!p.online) continue;
      const cast = p.skillCast, age = (frame?.time ?? world.time)-(cast?.at ?? -99);
      if(cast && age >= 0 && age < 1){
        if(cast.itemId === 'starfall') paintStarfallCast(d, cast, age, clock);
        else if(cast.itemId === FOX) paintFoxSkillCast(d, cast, p, age);
        else paintSkillCast(d, cast, age, clock);
      }
      const magic = p.magicCast;
      if(magic && magic.itemId !== FOX && Object.hasOwn(magicItems, magic.itemId)) paintMagicCast(d, p, magic, (frame?.time ?? world.time)-magic.at, clock);
    }
    paintConstellations(d, this, clock);
    this.live = this.live.filter(fx => {
      const age = clock-fx.t0;
      if(age > fx.life || age < -.5) return false;
      if(d.near(fx.ev.x, fx.ev.z, 10)) fx.spec.paint(d, fx.ev, Math.max(0, age), fx.seed, this);
      return true;
    });
    this.shake = Math.max(0, this.shake-dt*2.4);
    this.flash = Math.max(0, this.flash-dt*2.6);
    return {normal: d.normal, glow: d.glow, groundNormal: d.groundNormal, groundGlow: d.groundGlow, lights: d.lights, shake: this.shake, flash: this.flash, flashColor: this.flashColor};
  }
  /**
   * A kitsune wielder's tails, painted around their rendered body `anchor` {x, z, y}. Returns the
   * lists to draw behind that body (normal, groundNormal) and the ones to add to the frame (glow,
   * groundGlow, lights), or null when they carry no working lantern. Call once per wielder per frame,
   * after build().
   */
  tails(world, p, anchor, clock, time){
    const weapon = p?.equipment?.weapon;
    if(!p || p.online === false || p.ghost || weapon?.itemId !== FOX || !(weapon.durability > 0)){this.tips.delete(p?.id); return null;}
    const m = this.motion.get(p.id) || {x: anchor.x, z: anchor.z, vx: 0, vz: 0, at: clock};
    const dt = Math.max(1e-3, clock-m.at);
    if(dt < .5){
      const k = Math.min(1, dt*8);
      m.vx += ((anchor.x-m.x)/dt-m.vx)*k; m.vz += ((anchor.z-m.z)/dt-m.vz)*k;
    }else{m.vx = 0; m.vz = 0;}
    m.x = anchor.x; m.z = anchor.z; m.at = clock; this.motion.set(p.id, m);
    const d = this.tailPainter;
    d.reset(anchor);
    this.tips.set(p.id, paintFoxTails(d, world, p, anchor, m, clock, time));
    return {normal: d.normal.slice(), groundNormal: d.groundNormal.slice(), glow: d.glow.slice(), groundGlow: d.groundGlow.slice(), lights: d.lights.slice()};
  }
}

/** Opacity for a loose item on the ground: it blinks in its last seconds, faster at the end. */
export function dropBlink(drop, time, clock){
  const left = (drop?.until ?? Infinity)-time;
  if(!(left < 10)) return 1;
  return .3+.7*(.5+.5*Math.cos(clock*(left < 3 ? 18 : 9)));
}
