// Daylight at the Heartfire. By day, any creature inside a burning fire's light burns until it dies:
// quickly for small things, slowly for big ones (the Hollow King lasts a good while). A creature the
// sun did most of the work on gives nothing: no loot, no experience, no weapon mastery.
// The same light mends wanderers standing in it by day (HEARTH_MEND), once they are out of the fight.
// Host-authoritative; `e.sunburn` (1 while burning) and `e.sunDamage` travel with the enemy to guests.
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';
import {hearthReach} from './night.mjs?v=harvest-18';

/**
 * Burn per second: `flat` plus `share` of the creature's full health, so time to die tops out near
 * 1/share seconds (a briarling lasts about 3 s, a Gravekeeper about 12, the King about 18).
 * A damage number floats every `show` seconds.
 */
export const SUNBURN = Object.freeze({flat: 8, share: .05, show: .5});
/**
 * Mending by day inside the burning Heartfire's light: `rate` health a second plus `perLevel` for each
 * Heartfire level past the first, starting `calm` seconds after the wanderer was last hurt.
 * A level 1 fire mends a 100-health wanderer from half in about 20 s. A green number floats every `show` s.
 */
export const HEARTH_MEND = Object.freeze({rate: 2.5, perLevel: 1, calm: 3, show: 1.5});

/** Host, every tick outside the arena and the showcase. `phase` is the time of day now. */
export function stepSunburn(world, dt, phase){
  if(world.arena || world.showcase || !(dt > 0)) return;
  let hearth = null;
  for(const b of world.buildings) if(b.type === 'hearth' && b.hp > 0 && b.fuel > 0){hearth = b; break;}
  const day = phase === 'day' && !!hearth, reach = hearth ? hearthReach(hearth) : 0;
  if(day) mendAtHearth(world, dt, hearth, reach);
  for(const e of world.enemies){
    if(!(e.hp > 0) || isMagicAlly(e)) continue;
    if(!day || Math.hypot(e.x-hearth.x, e.z-hearth.z) >= reach){if(e.sunburn) e.sunburn = 0; continue;}
    const amount = Math.min(e.hp, (SUNBURN.flat+SUNBURN.share*(e.maxHp || e.hp))*dt);
    e.hp -= amount; e.sunDamage = (e.sunDamage || 0)+amount; e.sunburn = 1;
    e.sunShown = (e.sunShown || 0)+amount; e.sunClock = (e.sunClock || 0)+dt;
    if(e.sunClock >= SUNBURN.show || e.hp <= 0){
      world.event('damage', e.x, e.z, String(Math.max(1, Math.round(e.sunShown))), {sun: true});
      e.sunShown = 0; e.sunClock = 0;
    }
  }
}

function mendAtHearth(world, dt, hearth, reach){
  const rate = HEARTH_MEND.rate+HEARTH_MEND.perLevel*Math.max(0, (Number(hearth.level) || 1)-1);
  for(const p of world.players){
    if(!p.online || p.down || p.ghost || !(p.hp > 0)) continue;
    const max = p.maxHp || 100, hurt = world.damagedAt?.get(p.id);
    if(p.hp >= max || Math.hypot(p.x-hearth.x, p.z-hearth.z) >= reach || (hurt != null && world.time-hurt < HEARTH_MEND.calm) || p.mendAfter > world.time){p.mendShown = 0; p.mendClock = 0; continue;}
    const amount = Math.min(max-p.hp, rate*dt);
    p.hp += amount; p.mendShown = (p.mendShown || 0)+amount; p.mendClock = (p.mendClock || 0)+dt;
    if(p.mendClock >= HEARTH_MEND.show || p.hp >= max){
      if(p.mendShown >= .5) world.event('heal', p.x, p.z, `+${Math.round(p.mendShown)}`, {player: p.id, hearth: true});
      p.mendShown = 0; p.mendClock = 0;
    }
  }
}

/** True when the sun dealt more of a dead creature's damage than everything else put together. */
export function sunTook(e){
  const sun = e?.sunDamage || 0;
  if(!(sun > 0)) return false;
  const total = Math.max(0, (e.maxHp || 0)-e.hp);
  return sun > total-sun;
}
