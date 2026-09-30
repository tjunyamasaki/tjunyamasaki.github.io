// Daylight at the Heartfire. By day, any creature inside a burning fire's light burns until it dies:
// quickly for small things, slowly for big ones (the Hollow King lasts a good while). A creature the
// sun did most of the work on gives nothing: no loot, no experience, no weapon mastery.
// Host-authoritative; `e.sunburn` (1 while burning) and `e.sunDamage` travel with the enemy to guests.
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';
import {hearthReach} from './night.mjs?v=harvest-18';

/**
 * Burn per second: `flat` plus `share` of the creature's full health, so time to die tops out near
 * 1/share seconds (a briarling lasts about 3 s, a Gravekeeper about 12, the King about 18).
 * A damage number floats every `show` seconds.
 */
export const SUNBURN = Object.freeze({flat: 8, share: .05, show: .5});

/** Host, every tick outside the arena and the showcase. `phase` is the time of day now. */
export function stepSunburn(world, dt, phase){
  if(world.arena || world.showcase || !(dt > 0)) return;
  let hearth = null;
  for(const b of world.buildings) if(b.type === 'hearth' && b.hp > 0 && b.fuel > 0){hearth = b; break;}
  const day = phase === 'day' && !!hearth, reach = hearth ? hearthReach(hearth) : 0;
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

/** True when the sun dealt more of a dead creature's damage than everything else put together. */
export function sunTook(e){
  const sun = e?.sunDamage || 0;
  if(!(sun > 0)) return false;
  const total = Math.max(0, (e.maxHp || 0)-e.hp);
  return sun > total-sun;
}
