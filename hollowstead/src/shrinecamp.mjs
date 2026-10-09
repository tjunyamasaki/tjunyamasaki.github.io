// Camp pieces only the Shrine of Yomi teaches (content.mjs RECIPES with `land: 'yomi'`), built at the workbench,
// on the grid or in the field. Anywhere else they are not in the list, and the World refuses them.
//
//   toro      Stone lantern. A wide, steady light that never needs wood (STRUCTURES light, fuelless): wider
//             than the soul lantern, so a ring of them holds the dark off a whole yard.
//   hokora    Wayside shrine. Leave an offering (OFFER.cost) and the kami favour everyone within OFFER.near:
//             BUFFS.kami, courage holds in the dark and wounds slowly mend. Once a day for each shrine
//             (b.offered: the hollow time it will take one again, saved with the building).
//   fudaward  Paper ward. Talismans on a rope between two bamboo poles: the restless dead (WARD.kinds, the
//             Shrine's yokai, the jiangshi, lantern wraiths) cannot come within WARD.near of it, and are shoved back out to
//             its edge. Every second it holds one back its paper burns (WARD.burn of its health); repair it
//             at the workbench's usual way. Bosses ignore it.
// Pure simulation: import only content/progression/buffs. Never engine.mjs, a renderer or the DOM.

import {RECIPES, STRUCTURES, hollowTime, scheduleOf} from './content.mjs?v=harvest-18';
import {giveBuff} from './buffs.mjs?v=harvest-18';

export const OFFER = Object.freeze({cost: Object.freeze({ember: 2}), near: 8});
export const WARD = Object.freeze({
  near: 5.5, shove: 16, burn: 3,
  kinds: Object.freeze(['chochin', 'kasa', 'rokurokubi', 'yukionna', 'jiangshi', 'wraith']),
});
const KINDS = new Set(WARD.kinds);

/** True when the recipe may be built in this world (a Yomi piece only in the Shrine of Yomi's land). */
export const landAllows = (world, recipeId) => !RECIPES[recipeId]?.land || RECIPES[recipeId].land === world?.land || (RECIPES[recipeId].land === 'yomi' && !!world?.satoyama);
/** The reason a land-bound recipe is refused here, or ''. */
export function landReason(world, recipeId){
  if(landAllows(world, recipeId)) return '';
  return RECIPES[recipeId].land === 'yomi' ? 'Only the Shrine of Yomi teaches this' : 'Not in this land';
}

/** Seconds before a shrine takes another offering (0 when it is ready). */
export function offerWait(world, b){
  return Math.max(0, (b?.offered || 0)-hollowTime(world));
}

/** Host: someone leaves an offering at a wayside shrine (World.performBuildingAction 'offer'). */
export function offerAt(world, p, b){
  if(b?.type !== 'hokora') return {ok: false, code: 'rejected'};
  if(offerWait(world, b) > 0){world.tell(p, 'The kami have had their offering today'); return {ok: false, code: 'rejected'};}
  if(!world.canPay(p, OFFER.cost)){world.tell(p, 'The kami ask for 2 soul embers'); return {ok: false, code: 'rejected'};}
  if(!world.pay(p, OFFER.cost)) return {ok: false, code: 'rejected'};
  b.offered = hollowTime(world)+scheduleOf(world).cycle;
  p.cooldown = .5;
  world.event('offering', b.x, b.z, '', {near: OFFER.near});
  for(const q of world.players){
    if(!q.online || q.down || q.ghost || Math.hypot(q.x-b.x, q.z-b.z) > OFFER.near) continue;
    giveBuff(world, q, 'kami');
  }
  world.assertItems?.();
  return {ok: true, code: 'ok'};
}

/** Host, every expedition tick: paper wards hold the restless dead back. */
export function stepWards(world, dt){
  const wards = world.buildings?.filter(b => b.type === 'fudaward' && b.hp > 0);
  if(!wards?.length) return;
  for(const b of wards){
    let held = 0;
    for(const e of world.enemies){
      if(!(e.hp > 0) || e.boss || !KINDS.has(e.type)) continue;
      const dx = e.x-b.x, dz = e.z-b.z, d = Math.hypot(dx, dz);
      if(d >= WARD.near) continue;
      held++;
      // Out toward the edge (a step past it, so its own stride does not carry it back in); straight out when it stands on the ward itself.
      const ux = d > 1e-3 ? dx/d : 1, uz = d > 1e-3 ? dz/d : 0, to = Math.min(WARD.near+.3, d+WARD.shove*dt);
      const x = b.x+ux*to, z = b.z+uz*to;
      if(world.walkable(x, z)){e.x = x; e.z = z;}
    }
    if(!held) continue;
    b.hp = Math.max(0, b.hp-WARD.burn*dt*Math.min(3, held));
    b.burnT = (b.burnT || 0)-dt;
    if(!(b.burnT > 0)){b.burnT = .6; world.event('fudaburn', b.x, b.z, '', {held, near: WARD.near});}
  }
}

/** Wards and shrines need no rule anywhere but the Shrine of Yomi, but they run wherever they stand. */
export function stepShrineCamp(world, dt){
  if(world.showcase || world.arena || world.dungeon) return;
  stepWards(world, dt);
}

/** Label for the context button (World.buildingLabel). */
export function shrineLabel(world, b){
  if(b.type === 'toro') return 'Stone lantern';
  if(b.type === 'fudaward') return `Paper ward · ${Math.ceil(100*b.hp/(b.maxHp || STRUCTURES.fudaward.hp))}%`;
  if(b.type === 'hokora') return offerWait(world, b) > 0 ? 'Wayside shrine · offered today' : 'Wayside shrine';
  return '';
}
