// Sleeping through the night: a bed inside a room (homestead.mjs roomAt), after dark. When every
// wanderer still standing is asleep in one, the night is skipped: the clock jumps to dawn and the
// sleepers wake rested, a little hungrier. p.sleep holds the bed's id; moving or getting up clears it.
import {hollowTime, scheduleOf, phaseOf} from './content.mjs?v=harvest-18';
import {roomOfBuilding} from './homestead.mjs?v=harvest-18';

export const SLEEP = Object.freeze({hunger: 18, heal: 45, wake: 6});

function asleep(world, p){
  if(!p.sleep) return false;
  const bed = world.buildings.find(b => b.id === p.sleep && b.hp > 0);
  // Satoyama's farmhouse (satoyama/mode.mjs) is a room of its own: its bed is inside.
  const house = bed?.type === 'minka';
  if(!bed || (!house && !roomOfBuilding(world, bed)) || Math.hypot(p.x - bed.x, p.z - bed.z) > (house ? 4.2 : 3.2)){p.sleep = null;return false;}
  return true;
}

/** Host, every tick on the surface. */
export function stepSleep(world){
  const awake = world.players.filter(p => p.online && !p.down && !p.ghost);
  if(!awake.some(p => p.sleep)) return;
  if(phaseOf(world) === 'day'){for(const p of awake) p.sleep = null;return;}
  for(const p of awake) p.action = p.sleep ? 'idle' : p.action;
  if(!awake.every(p => asleep(world, p))){
    for(const p of awake) if(p.sleep && world.time - (p.sleepNote || -99) > 8){p.sleepNote = world.time;world.tell(p, 'Waiting for everyone to sleep');}
    return;
  }
  const c = scheduleOf(world), t = hollowTime(world) % c.cycle;
  world.time += c.cycle - t + SLEEP.wake;
  for(const p of awake){
    p.sleep = null;p.hunger = Math.max(0, p.hunger - SLEEP.hunger);p.hp = Math.min(p.maxHp || 100, p.hp + SLEEP.heal);p.courage = 100;
  }
  world.event('announce', awake[0].x, awake[0].z, 'You sleep through the night. Dawn breaks over the homestead.');
  world.event('phase', 0, 0, 'Dawn.');
}
