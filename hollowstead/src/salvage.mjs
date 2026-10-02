// Dismantling gear from the pack or a worn socket (the inventory's Dismantle button).
//   Crafted gear (anything with a workbench recipe) gives back half its materials, at least one of each.
//   Loot-only gear (Gravecraft weapons, trinkets, legendaries...) melts into Dread ichor by its rarity,
//   so spare finds feed refinement (refine.mjs) instead of cluttering the chest.
// Host-authoritative like every item rule; the UI reads salvageYield() only to label the button.
import {RECIPES, label} from './content.mjs?v=harvest-18';
import {itemDefinition} from './contracts.mjs?v=harvest-18';
import {rarityOf} from './progression.mjs?v=harvest-18';
import {REFINE_CURRENCY} from './refine.mjs?v=harvest-18';

export const SALVAGE = Object.freeze({
  /** Dread ichor for loot gear, by the item's rarity. A legendary pays for a first legendary refine. */
  ichor: Object.freeze({common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8}),
  /** Share of a crafted item's recipe returned. */
  refund: .5,
});

/** What dismantling `itemId` gives: [[itemId, count], ...], or null when it cannot be dismantled. */
export function salvageYield(itemId){
  const def = itemDefinition(itemId);
  if(def?.kind !== 'equipment') return null;
  const recipe = RECIPES[itemId];
  if(recipe && recipe.kind === 'tool' && !recipe.result){
    return Object.entries(recipe.cost).map(([id, n]) => [id, Math.max(1, Math.floor(n*SALVAGE.refund))]);
  }
  return [[REFINE_CURRENCY, SALVAGE.ichor[rarityOf(itemId)] || 1]];
}

/** Short text for the confirm button, e.g. "+5 Dread ichor" or "+1 Twisted wood, +2 Moon iron". */
export function salvageText(itemId){
  const out = salvageYield(itemId);
  return out ? out.map(([id, n]) => `+${n} ${label(id)}`).join(', ') : '';
}

/** Host: dismantle the stack `cmd.uid` the wanderer carries or wears. */
export function salvageItem(world, p, cmd){
  if(world.arena || world.showcase) return {ok: false, code: 'unsupported'};
  const loc = world.locate(p, cmd.uid);
  if(!loc || loc.kind === 'recovery') return {ok: false, code: 'notOwner'};
  if(!Number.isSafeInteger(cmd.inventoryRevision) || cmd.inventoryRevision !== p.inventory.revision) return {ok: false, code: 'staleRevision'};
  if(loc.kind === 'equipment' && cmd.equipmentRevision !== p.equipmentRevision) return {ok: false, code: 'staleRevision'};
  const itemId = loc.stack.itemId, out = salvageYield(itemId);
  if(!out) return {ok: false, code: 'rejected'};
  // A worn bag: the pack must fit in what is left without it.
  if(loc.kind === 'equipment' && loc.slot === 'bag' && world.bagRoom && !world.bagRoom(p, null)) return {ok: false, code: 'inventoryFull'};
  if(loc.kind === 'equipment'){
    if(loc.slot === 'light') p.lantern = false;
    p.equipment[loc.slot] = null; p.equipmentRevision++;
    if(loc.slot === 'bag') world.fitPack?.(p);
  }else{
    loc.container.slots[loc.slot] = null; loc.container.revision++;
  }
  for(const [id, n] of out) world.give(p, id, n);
  world.syncHotbar?.(p);
  world.assertItems?.();
  const loot = out.length === 1 && out[0][0] === REFINE_CURRENCY;
  world.event(loot ? 'salvage' : 'craft', p.x, p.z, `${label(itemId)} → ${salvageText(itemId)}`, {player: p.id, itemId, rarity: rarityOf(itemId)});
  return {ok: true, code: 'ok'};
}
