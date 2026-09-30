// Weapon effects for both renderers. The renderer hands every new world event to `event()` and calls
// `build()` once a frame; build returns command lists (normal and additive glow), a camera shake,
// a screen flash, and short-lived lights for the night field. Nothing here touches the simulation.
import {Painter, seedOf} from './kit.mjs?v=harvest-18';
import {STARFALL_BEATS, STARFALL_EVENTS, paintConstellations, paintStarZone, paintStarfallCast} from './starfall.mjs?v=harvest-18';
import {SKILL_BEATS, SKILL_EVENTS, paintSkillCast} from './skills.mjs?v=harvest-18';
import {FLAIR_EVENTS, paintFrostZone, paintFrozen, paintMagicCast, paintProjectile, paintSunburn} from './flair.mjs?v=harvest-18';
import {KITSUNE_FX} from './kitsune.mjs?v=harvest-18';
import {PALLBEARER_FX} from './pallbearer.mjs?v=harvest-18';
import {GLOOM_FX} from './gloomgrasp.mjs?v=harvest-18';
import {GRIMOIRE_FX} from './grimoire.mjs?v=harvest-18';
import {REAPER_FX} from './reaper.mjs?v=harvest-18';
import {magicItems} from '../magic/registry.mjs?v=harvest-18';
import {rankOf} from '../progression.mjs?v=harvest-18';

/**
 * Weapons with their own painters (one module each, e.g. src/fx/kitsune.mjs). Each entry:
 *   id                 the weapon / magic pack id
 *   events, beats      painters keyed like EVENTS/BEATS below (merged in)
 *   look(owner)        extra fields for its events and beats (a rolled colour...), optional
 *   lists              {magicBolts: (d, entry, owner, ctx) => ..., ...}: world-list entries of this pack
 *   foes               (d, enemy, ctx): marks a weapon leaves on foes (the scythe's Doom), every frame, every foe
 *   skillCast          (d, cast, owner, age): replaces the generic skill-cast burst
 *   magicCast          (d, p, cast, age): replaces the generic cast flourish (false: none)
 *   rig                (d, world, p, anchor, motion, clock, time) => {origin?, keep?}: drawn around the
 *                      wielder while equipped, in a mesh of its own that sorts at `origin` (default: just
 *                      behind the body); `keep` is handed back to its list painters as ctx.rig(ownerId).
 * Starfall predates this and is wired in by hand below.
 */
export const WEAPON_FX = [KITSUNE_FX, PALLBEARER_FX, GLOOM_FX, GRIMOIRE_FX, REAPER_FX];
const FOE_FX = WEAPON_FX.filter(fx => fx.foes);
const FX_BY_ID = new Map(WEAPON_FX.map(fx => [fx.id, fx]));

const EVENTS = Object.assign({...FLAIR_EVENTS, ...STARFALL_EVENTS, ...SKILL_EVENTS}, ...WEAPON_FX.map(fx => fx.events || {}));
const BEATS = Object.assign({...SKILL_BEATS, ...STARFALL_BEATS}, ...WEAPON_FX.map(fx => fx.beats || {}));
/** Which weapon an event belongs to, for events that name the wielder but not the item. */
const EVENT_OWNER = new Map(WEAPON_FX.flatMap(fx => Object.keys(fx.events || {}).map(key => [key, fx])));
const MAX_LIVE = 110, MAX_HITS = 26;

export class WeaponFx {
  constructor(){
    this.painter = new Painter(); this.live = []; this.memory = new Map();
    // Body rigs (the kitsune's tails...): their own painter, each wielder's smoothed motion, and what
    // each rig kept for its list painters last frame.
    this.rigPainter = new Painter(); this.motion = new Map(); this.rigs = new Map();
    this.shake = 0; this.flash = 0; this.flashColor = '#fff3cf'; this.clock = 0;
  }
  reset(){this.live.length = 0; this.memory.clear(); this.motion.clear(); this.rigs.clear(); this.shake = 0; this.flash = 0;}
  /** A world event arrived. */
  event(ev, clock, world){
    const key = ev.type === 'fx' ? `fx:${ev.fx}` : ev.type;
    const spec = EVENTS[key];
    if(!spec || (spec.when && !spec.when(ev))) return;
    let record = ev;
    // A registered weapon's events carry their wielder's rank (and look, if it has one).
    const fx = FX_BY_ID.get(ev.itemId) || EVENT_OWNER.get(key);
    if(fx && world){
      const owner = world.player?.(ev.player);
      record = {...ev, rank: ev.rank ?? (owner ? rankOf(owner, fx.id) : 1), ...fx.look?.(owner)};
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
      // A registered weapon's beats also get the wielder's look and where the wielder stands (ox, oz).
      const fx = FX_BY_ID.get(beat.itemId), owner = fx ? players.get(beat.owner) : null;
      const b = owner ? {...beat, ox: owner.x, oz: owner.z, ...fx.look?.(owner)} : beat;
      const tt = (b.age || 0)+lead;
      if(tt < b.at){if(spec.pending) spec.pending(d, b, tt, clock, lead);}
      else if(spec.lasting && b.started && !b.done) spec.lasting(d, b, tt-b.at, clock, lead);
    }
    for(const shot of world.projectiles || []) paintProjectile(d, shot, lead, clock);
    const ctx = {lead, clock, time: frame?.time ?? world.time, world, rig: id => this.rigs.get(id), player: id => players.get(id)};
    for(const fx of WEAPON_FX) for(const [list, paint] of Object.entries(fx.lists || {})){
      for(const e of world[list] || []) if(e?.packId === fx.id) paint(d, e, players.get(e.ownerId), ctx);
    }
    for(const e of world.enemies || []){
      if(e.frostUntil) paintFrozen(d, e, frame?.time ?? world.time);
      if(e.sunburn) paintSunburn(d, e, clock);
      for(const fx of FOE_FX) fx.foes(d, e, ctx);
    }
    for(const p of world.players || []){
      if(!p.online) continue;
      const cast = p.skillCast, age = (frame?.time ?? world.time)-(cast?.at ?? -99);
      if(cast && age >= 0 && age < 1){
        const own = FX_BY_ID.get(cast.itemId)?.skillCast;
        if(cast.itemId === 'starfall') paintStarfallCast(d, cast, age, clock);
        else if(own) own(d, cast, p, age);
        else paintSkillCast(d, cast, age, clock);
      }
      const magic = p.magicCast, mine = FX_BY_ID.get(magic?.itemId);
      if(magic && Object.hasOwn(magicItems, magic.itemId)){
        const mAge = (frame?.time ?? world.time)-magic.at;
        if(!mine || mine.magicCast === undefined) paintMagicCast(d, p, magic, mAge, clock);
        else if(mine.magicCast) mine.magicCast(d, p, magic, mAge);
      }
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
   * The rig of the wielder's weapon (WEAPON_FX `rig`), painted around their rendered body `anchor`
   * {x, z, y}. Returns {normal, glow, groundNormal, groundGlow, origin}: the renderer draws normal and
   * glow in meshes of their own sorted at `origin`, and adds the ground lists to the frame. Null when
   * the weapon has no rig or is broken. Call once per wielder per frame, after build().
   */
  rig(world, p, anchor, clock, time){
    const weapon = p?.equipment?.weapon, fx = FX_BY_ID.get(weapon?.itemId);
    if(!p || p.online === false || p.ghost || !fx?.rig || !(weapon.durability > 0)){this.rigs.delete(p?.id); return null;}
    const m = this.motion.get(p.id) || {x: anchor.x, z: anchor.z, vx: 0, vz: 0, at: clock};
    const dt = Math.max(1e-3, clock-m.at);
    if(dt < .5){
      const k = Math.min(1, dt*8);
      m.vx += ((anchor.x-m.x)/dt-m.vx)*k; m.vz += ((anchor.z-m.z)/dt-m.vz)*k;
    }else{m.vx = 0; m.vz = 0;}
    m.x = anchor.x; m.z = anchor.z; m.at = clock; this.motion.set(p.id, m);
    const d = this.rigPainter;
    d.reset(anchor);
    const out = fx.rig(d, world, p, anchor, m, clock, time) || {};
    this.rigs.set(p.id, out.keep);
    return {normal: d.normal.slice(), groundNormal: d.groundNormal.slice(), glow: d.glow.slice(), groundGlow: d.groundGlow.slice(), lights: d.lights.slice(),
      origin: out.origin || {x: anchor.x, y: 0, z: anchor.z-.08}};
  }
}

/** Opacity for a loose item on the ground: it blinks in its last seconds, faster at the end. */
export function dropBlink(drop, time, clock){
  const left = (drop?.until ?? Infinity)-time;
  if(!(left < 10)) return 1;
  return .3+.7*(.5+.5*Math.cos(clock*(left < 3 ? 18 : 9)));
}
