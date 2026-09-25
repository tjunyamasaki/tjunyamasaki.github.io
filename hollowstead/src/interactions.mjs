// Pure action and recipe capabilities. Describes what a context allows.
// Does not mutate a world, read the DOM, or decide that a UI click succeeded.
import {NODES, RECIPES, label} from './content.mjs?v=harvest-11';
import {
  CAULDRON_COOK_RECIPES, CONTEXT_ACTIONS, DISMANTLE_HOLD_SECONDS, FIELD_BUILD_RECIPES,
  FIRE_COOK_RECIPES, FIRE_STATION_TYPES, WORKBENCH_BUILD_RECIPES, WORKBENCH_CRAFT_RECIPES,
} from './contracts.mjs?v=harvest-11';

export function harvestProfile(nodeType){
  const node=NODES[nodeType];
  if(!node)return null;
  return {
    workSeconds:node.workSeconds,
    handRate:node.handRate||0,
    tool:node.tool||null,
    toolRate:node.toolRate||0,
    required:!!node.required,
    output:node.output,
    loot:node.loot,
    regrow:node.regrow,
  };
}

/** Equipped tool id, or null when that socket is empty. Forbidden nodes return 0 barehanded. */
export function gatherRate(nodeType, equippedToolId){
  const profile=harvestProfile(nodeType);
  if(!profile)return 0;
  if(profile.tool&&equippedToolId===profile.tool)return profile.toolRate;
  if(profile.required)return 0;
  return profile.handRate;
}

export function stationRule(recipeId){
  const recipe=RECIPES[recipeId];
  if(!recipe?.station)return null;
  return {
    station:recipe.station,
    needsFuel:recipe.station==='fire',
    accepts(type){
      if(recipe.station==='fire')return FIRE_STATION_TYPES.includes(type);
      return type===recipe.station;
    },
  };
}

export function contextRecipeIds({source, stationType, tab}){
  if(source==='field'&&tab==='build')return [...FIELD_BUILD_RECIPES];
  if(source==='station'&&stationType==='bench'&&tab==='craft')return [...WORKBENCH_CRAFT_RECIPES];
  if(source==='station'&&stationType==='bench'&&tab==='build')return [...WORKBENCH_BUILD_RECIPES];
  if(source==='station'&&(stationType==='fire'||stationType==='hearth')&&tab==='craft')return [...FIRE_COOK_RECIPES];
  if(source==='station'&&stationType==='pot'&&tab==='craft')return [...CAULDRON_COOK_RECIPES];
  return [];
}

export function contextActionIds(kind){
  return CONTEXT_ACTIONS[kind]?[...CONTEXT_ACTIONS[kind]]:[];
}

export function dismantleRule(type, locked){
  if(type==='hearth')return {ok:false, code:'rejected', hold:DISMANTLE_HOLD_SECONDS};
  if(locked)return {ok:false, code:'chestInUse', hold:DISMANTLE_HOLD_SECONDS};
  return {ok:true, code:'ok', hold:DISMANTLE_HOLD_SECONDS};
}

/**
 * candidates: {id, distance} already limited to legal targets.
 * An explicit id that is missing returns null. No id returns the nearest, then the lowest id.
 */
export function selectTarget(candidates, explicitId){
  if(!Array.isArray(candidates))return null;
  if(typeof explicitId==='string')return candidates.find(entry=>entry.id===explicitId)||null;
  return candidates.slice().sort((a,b)=>a.distance-b.distance||(a.id<b.id?-1:a.id>b.id?1:0))[0]||null;
}

export function stationLabel(recipeId){
  const rule=stationRule(recipeId);
  if(!rule)return '';
  if(rule.station==='fire')return 'Stand at a burning fire';
  if(rule.station==='pot')return 'Stand at a cauldron';
  return `Stand at a ${label(rule.station).toLowerCase()}`;
}
