// The hushing stone: a carved stone that sings the woods to sleep round it, so a camp can be built in peace.
// Within HUSH.radius of a standing stone no roaming pack rises and no hunter comes for a wanderer
// (engine.mjs roam, night.mjs huntRate). Raids, the Hollow King, rare moons, omens, cache guards
// and great bosses are not stopped: they are events, not the woods' own wandering.
// Pure simulation: reads world.buildings only.

export const HUSH = Object.freeze({radius: 18, max: 2});

/** True when (x, z) lies inside a standing hushing stone's song. */
export function hushedAt(world, x, z){
  for(const b of world?.buildings || []){
    if(b.type === 'hushstone' && b.hp > 0 && Math.hypot(b.x-x, b.z-z) < HUSH.radius) return true;
  }
  return false;
}

/** Why another stone may not be built here, or ''. */
export function hushReason(world){
  const count = (world?.buildings || []).filter(b => b.type === 'hushstone').length;
  return count >= HUSH.max ? `Only ${HUSH.max} hushing stones can sing at once` : '';
}
