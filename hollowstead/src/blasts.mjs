// Blasts: a telegraphed patch of ground that goes off when its fuse runs out. Lives in world.hostile
// (kind 'blast'); mobs.mjs stepHostile counts the fuses down and detonates them. Kept in a module of its
// own so areas, moons, omens and bosses can all lay them without importing the creature rules.

/**
 * Blasts: a telegraphed patch of ground that goes off when its fuse runs out. Vents in the Ashen Scar,
 * falling stars, a boss's roots and gaze (areas.mjs, moons.mjs, bosses.mjs) all use one.
 *   shape   'circle' (radius) | 'ring' (radius, inner: the safe middle) | 'line' (from x,z along angle: length, width)
 *   all     it hurts creatures too (vents, falling stars); otherwise only wanderers, their allies and the camp
 *   style   what it looks like (src/fx/hollow.mjs), and the sound
 */
export function addBlast(world, {style = 'vent', shape = 'circle', x, z, radius = 1.5, inner = 0, angle = 0, length = 4, width = 1, fuse = 1, damage = 10, all = false, push = 0, owner = null, delay = 0, heavy = false, loot = null} = {}){
  if(!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const list = world.hostile ||= [];
  if(list.length > 260) return null;
  const blast = {id: world.nextId('h'), kind: 'blast', style, shape, x: +x.toFixed(2), z: +z.toFixed(2), r: radius, inner, ang: +angle.toFixed(3), len: length, w: width,
    fuse: fuse+delay, flight: fuse, wait: delay, dmg: damage, all: !!all, push, owner, heavy: !!heavy || fuse >= .9};
  if(loot) blast.loot = loot;
  list.push(blast);
  return blast;
}
