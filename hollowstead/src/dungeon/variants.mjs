// Dungeon variations. Each one is a plain module that carves a floor its own way and brings its own
// look and residents; layout.mjs does everything else (rooms, the Warden, loot, lights, the camp).
//
// Adding a variation: create src/dungeon/<id>.mjs exporting a frozen object with the fields below,
// import it here and append it to VARIANTS. Nothing else needs to change: the title screen, the HUD,
// both renderers and the map all read these fields.
//
//   id, name, short, blurb      identity; `short` is the HUD label
//   palette                     floor, floorAlt, corridor, wallTop, wall, rim, accent,
//                               and floor tints for warden / treasure / camp / shrine chambers
//   darkness                    0..1 how dark an unlit spot is (the arena is 0, a moonless night 1)
//   torch {key, scale, radius}  the sprite that lights chambers, and its light radius
//   decor [{key, scale, where: 'wall'|'free', walk?, light?, weight}]  set dressing
//   roster(depth)               weighted [[creature, weight]] for ordinary chambers
//   warden(depth), escort(depth) the creature guarding the stairs, and who stands with it
//   carve(rng, {depth})         {grid, rooms}: grid from grid.mjs; rooms as rects {x0,z0,x1,z1}
//                               or cell lists {cells:[index]}. Must leave one connected floor.
import crypt from './crypt.mjs?v=harvest-18';
import caverns from './caverns.mjs?v=harvest-18';
import ossuary from './ossuary.mjs?v=harvest-18';

export const VARIANTS = Object.freeze([crypt, caverns, ossuary]);
export const VARIANT_IDS = Object.freeze(VARIANTS.map(v => v.id));
export const variantOf = id => VARIANTS.find(v => v.id === id) || VARIANTS[0];
export const isVariant = id => VARIANT_IDS.includes(id);
