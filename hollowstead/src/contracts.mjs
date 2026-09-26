// Shared Hollowstead overhaul contract.
// Pure data and helpers. The simulation reaches this module through inventory.mjs and
// serialization.mjs. network.mjs imports the protocol id directly.
// The running clock is content.mjs 180/30/100. V1_PHASE is the old 150/30/80
// schedule, used only to migrate a saved campaign. Do not import World, the DOM,
// the network, or a renderer from here.

import {EQUIPMENT, ITEMS, RULES} from './content.mjs?v=harvest-16';
import {magicItems} from './magic/registry.mjs?v=harvest-16';

export const CONTRACT = 'hollowstead-contracts-1';

export const PROTOCOL_V1 = 'hollowstead-1';
export const PROTOCOL_V2 = 'hollowstead-2';

export const SAVE_KEYS = Object.freeze({
  profile: 'hollowstead.profile.v1',
  expeditionV1: 'hollowstead.expedition.v1',
  expeditionV2: 'hollowstead.expedition.v2',
});

export const SAVE_VERSION_V1 = 1;
export const SAVE_VERSION_V2 = 2;

/** localStorage document written by the current game. */
export const V1_SAVE_FIELDS = Object.freeze(['world', 'savedAt']);

export const SNAPSHOT_PURPOSES = Object.freeze(['network', 'save']);
export const SNAPSHOT_CHUNK_CHARS = 12000;
export const SNAPSHOT_MAX_CHUNKS = 100;
export const SEND_BUFFER_GUARD = 180000;
export const ACTION_RESULT_CACHE_LIMIT = 64;

/** Fields a guest command must not be trusted for. Actor identity comes from the connection. */
export const UNTRUSTED_COMMAND_FIELDS = Object.freeze([
  'playerId', 'ownerId', 'durability', 'output', 'price', 'lightRadius', 'elapsed', 'workSeconds',
]);

export const TRANSPORT_HEARTBEAT = Object.freeze({ping: 'ping', pong: 'pong'});
/** Gameplay commands removed by the overhaul. Transport ping/pong stay. */
export const REMOVED_GAMEPLAY_COMMANDS = Object.freeze(['eat', 'ping', 'deposit', 'withdraw']);

export const V1_PHASE = Object.freeze({day: 150, dusk: 30, night: 80, cycle: 260});
export const V2_PHASE = Object.freeze({day: 180, dusk: 30, night: 100, cycle: 310});
/** Saved campaigns written before the 310s clock. Continue remaps these once. New worlds use `v2`. */
export const CLOCK_V1 = 'v1';
export const CLOCK_V2 = 'v2';
/** Fractions of the night length. 0 / 0.4 / 0.8 of the v2 night are 0s / 40s / 80s. */
export const NIGHT_WAVE_FRACTIONS = Object.freeze([0, 0.4, 0.8]);
const PHASE_EDGE_EPSILON = 1e-8;

export const BACKPACK_SLOT_COUNT = 12;
export const STACK_LIMIT = 64;
/** Legacy v1 supply counter. A backpack is limited by its slots and stack size, not this number. */
export const SUPPLY_CAPACITY = RULES.capacity;
export const CHEST_SLOT_COUNT = 24;
export const DROP_LIFETIME_SECONDS = RULES.cycle;
export const CHEST_LEASE_SECONDS = 12;
export const CHEST_RENEW_SECONDS = 3;
export const DISMANTLE_HOLD_SECONDS = 0.8;

export const EQUIPMENT_SLOTS = Object.freeze(['chop', 'mine', 'weapon', 'body', 'light']);
export const EQUIPMENT_SLOT_ITEMS = Object.freeze({
  chop: Object.freeze(['axe']),
  mine: Object.freeze(['pick']),
  weapon: Object.freeze(['spear', 'sword', 'recurve', 'bonebow', 'broadsword', 'flamberge', 'crookstaff', 'skullstaff', 'tome',
    'fangs', 'soulchain', 'scythe', 'wisplantern', 'stormrod', 'starfall', 'crowtotem', 'jacklantern', 'wighthorn', 'censer']),
  body: Object.freeze(['armor', 'bonemail', 'shardplate']),
  light: Object.freeze(['torch', 'everlantern']),
});
/** v1 saves that contain both weapons equip the sword and keep the spear in the backpack. */
export const MIGRATION_PREFERRED_WEAPON = 'sword';

export const LOCATION_KINDS = Object.freeze(['backpack', 'equipment', 'chest', 'drop', 'recovery', 'overflow']);
export const ITEM_STACK_FIELDS = Object.freeze(['uid', 'itemId', 'quantity']);
export const ITEM_STACK_OPTIONAL = Object.freeze(['durability']);
export const CONTAINER_FIELDS = Object.freeze(['id', 'revision', 'slots']);
export const PLAYER_INVENTORY_FIELDS = Object.freeze(['inventory', 'equipment', 'equipmentRevision']);

export const SUPPLY_ITEM_IDS = Object.freeze(Object.keys(ITEMS));

export const RANGES = Object.freeze({
  reach: RULES.reach,
  craft: 5,
  place: 5.5,
  inputExpiry: 0.6,
  lanternLight: 4,
});

export const CATALOG_SOURCES = Object.freeze(['field', 'station']);
export const CATALOG_TABS = Object.freeze(['craft', 'build']);
export const CATALOG_CONTEXT_FIELDS = Object.freeze(['source', 'stationId', 'tab', 'category']);
export const FIRE_STATION_TYPES = Object.freeze(['hearth', 'fire']);

export const FIELD_BUILD_RECIPES = Object.freeze(['fire', 'bench', 'chest', 'wall', 'gate', 'trap', 'farm', 'bed']);
export const WORKBENCH_BUILD_RECIPES = Object.freeze([...FIELD_BUILD_RECIPES, 'pot', 'lantern', 'ward']);
export const WORKBENCH_CRAFT_RECIPES = Object.freeze(['axe', 'pick', 'spear', 'torch', 'bandage', 'armor', 'sword', 'recurve', 'bonebow', 'broadsword', 'crookstaff', 'bonemail', 'shardplate', 'elixir']);
export const FIRE_COOK_RECIPES = Object.freeze(['roast', 'roastMeat', 'roastCaps']);
export const CAULDRON_COOK_RECIPES = Object.freeze(['stew']);

export const RECIPE_CONTEXTS = Object.freeze({
  fieldBuild: Object.freeze({source: 'field', stationType: null, tab: 'build', category: 'build', label: 'Build', recipes: FIELD_BUILD_RECIPES}),
  workbenchCraft: Object.freeze({source: 'station', stationType: 'bench', tab: 'craft', category: 'craft', label: 'Craft', recipes: WORKBENCH_CRAFT_RECIPES}),
  workbenchBuild: Object.freeze({source: 'station', stationType: 'bench', tab: 'build', category: 'build', label: 'Build', recipes: WORKBENCH_BUILD_RECIPES}),
  fireCook: Object.freeze({source: 'station', stationType: 'fire', tab: 'craft', category: 'cook', label: 'Cooking', recipes: FIRE_COOK_RECIPES}),
  cauldronCook: Object.freeze({source: 'station', stationType: 'pot', tab: 'craft', category: 'cook', label: 'Cooking', recipes: CAULDRON_COOK_RECIPES}),
});

export const ACTION_MODES = Object.freeze([
  'normal', 'inventory', 'catalog', 'chest', 'placement', 'maintenance', 'downed', 'ghost', 'paused', 'disconnected', 'end',
]);
/** Highest priority first. end/disconnected, then downed, then panels, then placement/maintenance, then normal. */
export const MODE_PRECEDENCE = Object.freeze([
  'end', 'disconnected', 'paused', 'downed', 'ghost', 'inventory', 'catalog', 'chest', 'placement', 'maintenance', 'normal',
]);

export const CONTEXT_ACTIONS = Object.freeze({
  hearth: Object.freeze(['feed', 'cook', 'awaken', 'repair']),
  fire: Object.freeze(['feed', 'cook', 'repair']),
  bench: Object.freeze(['craft', 'build', 'repair']),
  pot: Object.freeze(['cook', 'repair']),
  chest: Object.freeze(['open', 'repair']),
  wall: Object.freeze(['repair']),
  gate: Object.freeze(['toggle', 'repair']),
  trap: Object.freeze(['rearm', 'repair']),
  farm: Object.freeze(['plant', 'harvest']),
  bed: Object.freeze(['rest', 'repair']),
  lantern: Object.freeze(['repair']),
  ward: Object.freeze(['repair']),
  player: Object.freeze(['revive']),
  tree: Object.freeze(['chop']),
  rock: Object.freeze(['mine']),
  ore: Object.freeze(['mine']),
  grave: Object.freeze(['mine']),
  grass: Object.freeze(['gather']),
  bush: Object.freeze(['gather']),
  pumpkin: Object.freeze(['gather']),
  mushroom: Object.freeze(['gather']),
  shardrock: Object.freeze(['mine']),
  bones: Object.freeze(['gather']),
  glowcap: Object.freeze(['gather']),
  crate: Object.freeze(['unlock']),
  ironchest: Object.freeze(['unlock']),
  moonchest: Object.freeze(['unlock']),
  reliquary: Object.freeze(['unlock']),
  drop: Object.freeze([]),
});

export const PLACEMENT_ACTIONS = Object.freeze(['place', 'cancel']);
export const MAINTENANCE_ACTIONS = Object.freeze(['repair', 'dismantle', 'cancel']);
export const ACTIVATION_MODES = Object.freeze(['tap', 'hold']);
export const ACTION_DESCRIPTOR_FIELDS = Object.freeze([
  'id', 'icon', 'label', 'enabled', 'disabledReason', 'activation', 'targetId', 'command',
]);
export const HARVEST_MODES = Object.freeze(['hold', 'auto', 'cancel']);

/**
 * Intent field names. `required` / `optional` are the agreed payload keys.
 * `stationId` is null for field placement. `uid` on lanternToggle is optional.
 * Drop position is chosen by the host; dropItem does not accept coordinates.
 */
export const INTENTS = Object.freeze({
  inventoryMove: intent('inventoryMove', ['requestId', 'sourceContainerId', 'sourceSlot', 'destinationContainerId', 'destinationSlot', 'uid', 'quantity', 'sourceRevision', 'destinationRevision']),
  consumeItem: intent('consumeItem', ['requestId', 'uid', 'inventoryRevision']),
  equipItem: intent('equipItem', ['requestId', 'uid', 'socket', 'inventoryRevision', 'equipmentRevision']),
  unequipItem: intent('unequipItem', ['requestId', 'uid', 'socket', 'inventoryRevision', 'equipmentRevision']),
  dropItem: intent('dropItem', ['requestId', 'uid', 'quantity', 'inventoryRevision'], ['equipmentRevision']),
  chestOpen: intent('chestOpen', ['requestId', 'chestId']),
  chestRenew: intent('chestRenew', ['requestId', 'chestId', 'sessionId']),
  chestClose: intent('chestClose', ['requestId', 'chestId', 'sessionId']),
  chestTransfer: intent('chestTransfer', ['requestId', 'chestId', 'sessionId', 'sourceContainerId', 'sourceSlot', 'destinationContainerId', 'destinationSlot', 'uid', 'quantity', 'sourceRevision', 'destinationRevision']),
  chestStoreAll: intent('chestStoreAll', ['requestId', 'chestId', 'sessionId', 'inventoryRevision', 'destinationRevision']),
  chestSort: intent('chestSort', ['requestId', 'chestId', 'sessionId', 'destinationRevision']),
  packSort: intent('packSort', ['requestId', 'inventoryRevision']),
  craftRecipe: intent('craftRecipe', ['requestId', 'recipeId', 'stationId']),
  placeBuilding: intent('placeBuilding', ['requestId', 'recipeId', 'x', 'z'], ['stationId']),
  buildingAction: intent('buildingAction', ['requestId', 'targetId', 'actionId']),
  lanternToggle: intent('lanternToggle', ['requestId'], ['uid']),
  setHarvestTarget: intent('setHarvestTarget', ['requestId', 'nodeId', 'mode']),
});

export const ACTION_RESULT_TYPE = 'actionResult';
export const ACTION_RESULT_FIELDS = Object.freeze(['type', 'requestId', 'ok', 'code', 'affectedRevisions']);
export const ACTION_RESULT_OPTIONAL = Object.freeze(['sessionId']);

export const RESULT_CODES = Object.freeze({
  ok: 'ok',
  rejected: 'rejected',
  staleRevision: 'staleRevision',
  notOwner: 'notOwner',
  outOfRange: 'outOfRange',
  chestInUse: 'chestInUse',
  sessionExpired: 'sessionExpired',
  wrongSession: 'wrongSession',
  inventoryFull: 'inventoryFull',
  invalidQuantity: 'invalidQuantity',
  invalidSlot: 'invalidSlot',
  unknownItem: 'unknownItem',
  incompatibleSocket: 'incompatibleSocket',
  stationRequired: 'stationRequired',
  missingFuel: 'missingFuel',
  rateLimited: 'rateLimited',
  protocolMismatch: 'protocolMismatch',
});

export function containerId(kind, ownerId){
  if(!LOCATION_KINDS.includes(kind)||typeof ownerId!=='string'||ownerId.length===0)return null;
  return `${kind}:${ownerId}`;
}

export function equipmentSlotFor(itemId){
  if(typeof itemId!=='string')return null;
  if(Object.hasOwn(magicItems, itemId))return 'weapon';
  for(const slot of EQUIPMENT_SLOTS)if(EQUIPMENT_SLOT_ITEMS[slot].includes(itemId))return slot;
  return null;
}

export function itemDefinition(itemId){
  if(typeof itemId!=='string'||itemId==='__proto__'||itemId==='constructor'||itemId==='prototype')return null;
  if(Object.hasOwn(magicItems, itemId)){
    const item=magicItems[itemId];
    return Object.freeze({
      itemId, kind:'equipment', stackLimit:1, supplyUnits:0, equipmentSlot:'weapon',
      maxDurability:item.durability, use:null, retainsAtZeroDurability:false,
    });
  }
  if(Object.hasOwn(EQUIPMENT, itemId)){
    return Object.freeze({
      itemId, kind:'equipment', stackLimit:1, supplyUnits:0, equipmentSlot:equipmentSlotFor(itemId),
      maxDurability:EQUIPMENT[itemId].durability, use:null,
      retainsAtZeroDurability:itemId==='torch'||itemId==='everlantern',
    });
  }
  if(Object.hasOwn(ITEMS, itemId)){
    const item=ITEMS[itemId];
    return Object.freeze({
      itemId, kind:'supply', stackLimit:STACK_LIMIT, supplyUnits:1, equipmentSlot:null, maxDurability:null,
      use:item.food?'eat':item.heal?'heal':item.boost?'heal':null,
      retainsAtZeroDurability:false,
    });
  }
  return null;
}

/** Positive v1 equipment kinds mapped onto sockets. Both weapons keep the sword equipped. */
export function legacyEquipmentPlan(equipment){
  const sockets={chop:null, mine:null, weapon:null, body:null, light:null};
  const backpack=[];
  const unknown=[];
  if(!equipment||typeof equipment!=='object')return {sockets, backpack, unknown};
  const kept=new Map();
  for(const [itemId, durability] of Object.entries(equipment)){
    if(!Object.hasOwn(EQUIPMENT, itemId)){unknown.push(itemId);continue;}
    if(typeof durability!=='number'||!Number.isFinite(durability)||durability<=0)continue;
    kept.set(itemId, Math.min(EQUIPMENT[itemId].durability, durability));
  }
  const put=(slot, itemId)=>{if(kept.has(itemId))sockets[slot]={itemId, durability:kept.get(itemId)};};
  put('chop', 'axe');
  put('mine', 'pick');
  put('body', 'armor');
  put('light', 'torch');
  if(kept.has('sword')){
    put('weapon', 'sword');
    if(kept.has('spear'))backpack.push({itemId:'spear', durability:kept.get('spear')});
  }else put('weapon', 'spear');
  return {sockets, backpack, unknown};
}

/** Split a positive integer count into stack-sized quantities. Invalid counts return null. */
export function splitStackQuantities(count, stackLimit=STACK_LIMIT){
  if(!Number.isInteger(count)||count<=0||!Number.isInteger(stackLimit)||stackLimit<=0)return null;
  const quantities=[];
  let remaining=count;
  while(remaining>0){
    const quantity=Math.min(stackLimit, remaining);
    quantities.push(quantity);
    remaining-=quantity;
  }
  return quantities;
}

export function isFiniteDistance(distance){
  return typeof distance==='number'&&Number.isFinite(distance)&&distance>=0;
}

/** Strict less-than, matching reach and station checks. */
export function inStrictRange(distance, limit){
  return isFiniteDistance(distance)&&typeof limit==='number'&&Number.isFinite(limit)&&distance<limit;
}

export function inReach(distance){return inStrictRange(distance, RANGES.reach);}
export function inCraftRange(distance){return inStrictRange(distance, RANGES.craft);}
/** Nearby unlocked chests use the same radius as station crafting. */
export function inSupplyChestRange(distance){return inStrictRange(distance, RANGES.craft);}
/** Placement matches current canBuild: only distances greater than 5.5 are rejected. */
export function inPlaceRange(distance){return isFiniteDistance(distance)&&distance<=RANGES.place;}

export function phaseProgress(time, schedule=V1_PHASE){
  const cycle=schedule.cycle;
  if(!Number.isFinite(time)||time<0||!Number.isFinite(cycle)||cycle<=0)return null;
  let cycleIndex=Math.floor(time/cycle);
  let elapsed=time-cycleIndex*cycle;
  if(!(elapsed>=0))elapsed=0;
  if(cycle-elapsed<=PHASE_EDGE_EPSILON){cycleIndex+=1;elapsed=0;}
  else if(elapsed<=PHASE_EDGE_EPSILON)elapsed=0;
  else if(Math.abs(elapsed-schedule.day)<=PHASE_EDGE_EPSILON)elapsed=schedule.day;
  else if(Math.abs(elapsed-(schedule.day+schedule.dusk))<=PHASE_EDGE_EPSILON)elapsed=schedule.day+schedule.dusk;
  const duskEnd=schedule.day+schedule.dusk;
  let name, phaseStart, duration, into;
  if(elapsed<schedule.day){name='day';phaseStart=0;duration=schedule.day;into=elapsed;}
  else if(elapsed<duskEnd){name='dusk';phaseStart=schedule.day;duration=schedule.dusk;into=elapsed-schedule.day;}
  else{name='night';phaseStart=duskEnd;duration=schedule.night;into=elapsed-duskEnd;}
  return {cycleIndex, name, phaseStart, duration, elapsed:into, fraction:duration===0?0:into/duration, cycleElapsed:elapsed};
}

/** Preserve cycle index, phase, and fraction when moving from the 260s clock to the 310s clock. */
export function remapPhaseTime(oldTime, oldSchedule=V1_PHASE, newSchedule=V2_PHASE){
  const progress=phaseProgress(oldTime, oldSchedule);
  if(!progress)return null;
  const newStart=progress.name==='day'?0:progress.name==='dusk'?newSchedule.day:newSchedule.day+newSchedule.dusk;
  return progress.cycleIndex*newSchedule.cycle+newStart+progress.fraction*newSchedule[progress.name];
}

export function phaseMigrationDelta(oldTime, oldSchedule=V1_PHASE, newSchedule=V2_PHASE){
  const mapped=remapPhaseTime(oldTime, oldSchedule, newSchedule);
  return mapped==null?null:mapped-oldTime;
}

/** Absolute deadlines keep their remaining seconds by adding the phase-migration delta. */
export function shiftAbsoluteDeadline(oldTime, deadline, oldSchedule=V1_PHASE, newSchedule=V2_PHASE){
  const delta=phaseMigrationDelta(oldTime, oldSchedule, newSchedule);
  if(delta==null||!Number.isFinite(deadline))return null;
  return deadline+delta;
}

export function nightWaveOffsets(nightDuration){
  if(!Number.isFinite(nightDuration)||nightDuration<0)return [];
  return NIGHT_WAVE_FRACTIONS.map(fraction=>fraction*nightDuration);
}

/** Wave offsets still ahead of elapsed night time. The offset equal to elapsed is already reached. */
export function remainingNightWaveOffsets(elapsedNight, nightDuration){
  if(!Number.isFinite(elapsedNight))return [];
  return nightWaveOffsets(nightDuration).filter(offset=>offset>elapsedNight+PHASE_EDGE_EPSILON);
}

/** Absolute mapped time of the next untriggered v2 night wave, or null when none remain or it is not night. */
export function nextNightWaveTime(mappedTime, schedule=V2_PHASE){
  const progress=phaseProgress(mappedTime, schedule);
  if(!progress||progress.name!=='night')return null;
  const offset=remainingNightWaveOffsets(progress.elapsed, schedule.night)[0];
  if(offset===undefined)return null;
  return progress.cycleIndex*schedule.cycle+progress.phaseStart+offset;
}

function intent(type, required, optional=[]){
  return Object.freeze({type, required:Object.freeze(required), optional:Object.freeze(optional)});
}
