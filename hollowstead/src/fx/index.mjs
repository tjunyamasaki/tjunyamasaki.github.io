// Weapon effects for both renderers. The renderer hands every new world event to `event()` and calls
// `build()` once a frame; build returns command lists (normal and additive glow), a camera shake,
// a screen flash, and short-lived lights for the night field. Nothing here touches the simulation.
import {Painter, seedOf} from './kit.mjs?v=harvest-18';
import {STARFALL_BEATS, STARFALL_EVENTS, paintConstellations, paintStarZone, paintStarfallCast} from './starfall.mjs?v=harvest-18';
import {SKILL_BEATS, SKILL_EVENTS, paintSkillCast} from './skills.mjs?v=harvest-18';
import {FLAIR_EVENTS, paintFrostZone, paintFrozen, paintMagicCast, paintProjectile} from './flair.mjs?v=harvest-18';
import {magicItems} from '../magic/registry.mjs?v=harvest-18';

const EVENTS = {...FLAIR_EVENTS, ...STARFALL_EVENTS, ...SKILL_EVENTS};
const BEATS = {...SKILL_BEATS, ...STARFALL_BEATS};
const MAX_LIVE = 110, MAX_HITS = 26;

export class WeaponFx {
  constructor(){
    this.painter = new Painter(); this.live = []; this.memory = new Map();
    this.shake = 0; this.flash = 0; this.flashColor = '#fff3cf'; this.clock = 0;
  }
  reset(){this.live.length = 0; this.memory.clear(); this.shake = 0; this.flash = 0;}
  /** A world event arrived. */
  event(ev, clock, world){
    const key = ev.type === 'fx' ? `fx:${ev.fx}` : ev.type;
    const spec = EVENTS[key];
    if(!spec || (spec.when && !spec.when(ev))) return;
    let record = ev;
    if(spec.resolve){
      record = spec.resolve(ev, world);
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
    for(const b of world.beats || []){
      const spec = BEATS[b.fx];
      if(!spec || !d.near(b.x, b.z, 6)) continue;
      const tt = (b.age || 0)+lead;
      if(tt < b.at){if(spec.pending) spec.pending(d, b, tt, clock, lead);}
      else if(spec.lasting && b.started && !b.done) spec.lasting(d, b, tt-b.at, clock, lead);
    }
    for(const shot of world.projectiles || []) paintProjectile(d, shot, lead, clock);
    for(const e of world.enemies || []) if(e.frostUntil) paintFrozen(d, e, frame?.time ?? world.time);
    for(const p of world.players || []){
      if(!p.online) continue;
      const cast = p.skillCast, age = (frame?.time ?? world.time)-(cast?.at ?? -99);
      if(cast && age >= 0 && age < 1){
        if(cast.itemId === 'starfall') paintStarfallCast(d, cast, age, clock);
        else paintSkillCast(d, cast, age, clock);
      }
      const magic = p.magicCast;
      if(magic && Object.hasOwn(magicItems, magic.itemId)) paintMagicCast(d, p, magic, (frame?.time ?? world.time)-magic.at, clock);
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
}
