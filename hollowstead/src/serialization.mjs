// v1 → v2 save migration and snapshot validation. Does not touch localStorage or World.
// Live Continue keeps clock `v1`: absolute time stays on the 150/30/80 cycle so the
// running simulation resumes in the same phase and fraction. remapTime is the 180/30/100
// conversion P5 must apply when that clock is enabled. Do not resume a clock `v2`
// document on the current 260s clock.

import {
  CLOCK_V1, CLOCK_V2, EQUIPMENT_SLOTS, SAVE_KEYS, SAVE_VERSION_V1, SAVE_VERSION_V2, SUPPLY_ITEM_IDS, V2_PHASE,
  legacyEquipmentPlan, nextNightWaveTime, phaseMigrationDelta, phaseProgress, remapPhaseTime,
} from './contracts.mjs?v=harvest-11';
import {
  BACKPACK_SLOT_COUNT, CHEST_SLOT_COUNT, collectLocations, cloneStack, createBackpack, createContainer, createRecovery,
  duplicateUids, emptyEquipment, itemDefinition, makeStack, planInsert, validateContainer,
  validateEquipment, validateStack, containerId,
} from './inventory.mjs?v=harvest-11';
import {STRUCTURES} from './content.mjs?v=harvest-11';

export {SAVE_KEYS, SAVE_VERSION_V1, SAVE_VERSION_V2, CLOCK_V1, CLOCK_V2};

const RECOVERABLE = 'This expedition could not be opened. The original save was kept on this browser.';

function fail(code, message=RECOVERABLE){
  return {ok:false, code, message, save:null, write:null, preserveV1:true};
}

function numericSuffix(id){
  const match=typeof id==='string'?/^([a-z]+)(\d+)$/.exec(id):null;
  return match?Number(match[2]):0;
}

export function repairIdCounter(world){
  let next=Number.isInteger(world.idCounter)&&world.idCounter>0?world.idCounter:1;
  const visit=id=>{next=Math.max(next, numericSuffix(id)+1);};
  for(const player of world.players||[]){
    visit(player.id);
    for(const row of collectLocations({players:[player]}))visit(row.uid);
  }
  for(const building of world.buildings||[]){
    visit(building.id);
    building.store?.slots?.forEach(stack=>{if(stack)visit(stack.uid);});
    building.overflow?.slots?.forEach(stack=>{if(stack)visit(stack.uid);});
  }
  for(const drop of world.drops||[]){visit(drop.id);if(drop.stack)visit(drop.stack.uid);}
  for(const enemy of world.enemies||[])visit(enemy.id);
  for(const node of world.nodeChanges||[])visit(node.id);
  world.idCounter=next;
  return world;
}

function settleBackpack(player, mint){
  const inventory=player?.inventory;
  if(!inventory?.slots||inventory.slots.length===BACKPACK_SLOT_COUNT)return false;
  const stacks=inventory.slots.filter(Boolean);
  const prior=(player.recovery?.slots||[]).filter(Boolean).map(cloneStack);
  const pack=createBackpack(player.id);
  const overflow=[];
  for(const stack of stacks){
    const plan=planInsert(pack, stack, {supplyCapacity:null, allowPartial:true, grow:false, acceptsItems:true, mintUid:mint});
    if(!plan.ok){overflow.push(cloneStack(stack));continue;}
    pack.slots=plan.slots;
    pack.revision=plan.revision;
    if(plan.remainder)overflow.push(plan.remainder);
  }
  pack.revision=Math.max(inventory.revision|0, pack.revision|0);
  player.inventory=pack;
  const kept=[...overflow, ...prior];
  if(kept.length){
    const recovery=createRecovery(player.id, kept.length);
    kept.forEach((stack, index)=>{recovery.slots[index]=stack;});
    recovery.revision=(player.recovery?.revision||0)+1;
    player.recovery=recovery;
  }else player.recovery=null;
  return true;
}

function settleChest(building){
  if(building?.type!=='chest'||!building.store?.slots)return false;
  const slots=building.store.slots;
  const overflow=building.overflow;
  const overflowId=containerId('overflow', building.id);
  const overflowOk=overflow==null||(overflow.id===overflowId&&Array.isArray(overflow.slots)&&overflow.slots.some(Boolean));
  if(slots.length===CHEST_SLOT_COUNT&&overflowOk)return false;
  const extras=[];
  if(slots.length>CHEST_SLOT_COUNT)extras.push(...slots.slice(CHEST_SLOT_COUNT).filter(Boolean).map(cloneStack));
  if(overflow?.slots)extras.push(...overflow.slots.filter(Boolean).map(cloneStack));
  const active=slots.slice(0, CHEST_SLOT_COUNT).map(cloneStack);
  while(active.length<CHEST_SLOT_COUNT)active.push(null);
  building.store.slots=active;
  if(extras.length){
    const next=createContainer(overflowId, extras.length);
    extras.forEach((stack, index)=>{next.slots[index]=stack;});
    next.revision=(overflow?.revision||0)+1;
    building.overflow=next;
  }else building.overflow=null;
  return true;
}

/** Fit legacy wide packs and grown chests without discarding stacks. Idempotent on the current shape. */
export function settleStorage(world){
  if(!world||typeof world!=='object')return false;
  const used=new Set();
  for(const row of collectLocations(world))if(row?.uid)used.add(row.uid);
  const mint=mintFactory(world, used);
  let changed=false;
  for(const player of world.players||[])if(settleBackpack(player, mint))changed=true;
  for(const building of world.buildings||[])if(settleChest(building))changed=true;
  return changed;
}

function mintFactory(world, used){
  let next=Number.isInteger(world.idCounter)&&world.idCounter>0?world.idCounter:1;
  return ()=>{
    let uid;
    do{uid=`i${next++}`;}while(used.has(uid));
    used.add(uid);
    world.idCounter=next;
    return uid;
  };
}

function shiftDeadlines(world, delta){
  for(const change of world.nodeChanges)if(Number.isFinite(change.ready)&&change.ready>0)change.ready+=delta;
  for(const drop of world.drops)if(Number.isFinite(drop.until))drop.until+=delta;
  for(const event of world.events||[])if(Number.isFinite(event.at))event.at+=delta;
}

export function remapWorldClock(world){
  if(!world||world.version!==SAVE_VERSION_V2)return {ok:false, code:'unsupported', world:null, remapped:false};
  if(world.clock===CLOCK_V2)return {ok:true, code:'ok', world, remapped:false};
  if(world.clock!==CLOCK_V1)return {ok:false, code:'clock', world:null, remapped:false};
  let copy;
  try{copy=structuredClone(world);}catch{return {ok:false, code:'corrupt', world:null, remapped:false};}
  const mapped=remapPhaseTime(copy.time);
  const delta=phaseMigrationDelta(copy.time);
  if(mapped==null||delta==null)return {ok:false, code:'time', world:null, remapped:false};
  copy.time=mapped;
  copy.clock=CLOCK_V2;
  shiftDeadlines(copy, delta);
  recomputeNightSpawn(copy);
  const valid=validateV2World(copy);
  if(!valid.ok)return {ok:false, code:valid.code||'corrupt', world:null, remapped:false};
  return {ok:true, code:'ok', world:copy, remapped:true};
}

function recomputeNightSpawn(world){
  const progress=phaseProgress(world.time, V2_PHASE);
  if(!progress||progress.name!=='night'){
    world.nextSpawn=0;
    return;
  }
  const next=nextNightWaveTime(world.time, V2_PHASE);
  world.nextSpawn=next==null?progress.cycleIndex*V2_PHASE.cycle+V2_PHASE.cycle:next;
}

export function validateV2World(data){
  if(!data||data.version!==SAVE_VERSION_V2||(data.clock!==CLOCK_V1&&data.clock!==CLOCK_V2))return {ok:false, code:'corrupt'};
  if(!Array.isArray(data.players)||data.players.length>4||!Number.isFinite(data.time)||data.time<0)return {ok:false, code:'corrupt'};
  if(!Array.isArray(data.buildings)||data.buildings.length>500||!Array.isArray(data.drops)||!Array.isArray(data.nodeChanges))return {ok:false, code:'corrupt'};
  const playerIds=new Set(),entityIds=new Set();
  for(const player of data.players){
    if(!player||typeof player.id!=='string'||player.id.length===0)return {ok:false, code:'corrupt'};
    if(playerIds.has(player.id)||player.inventory?.id!==containerId('backpack',player.id))return {ok:false,code:'duplicate-owner'};
    playerIds.add(player.id);
    const inventory=validateContainer(player.inventory, {exactSlots:BACKPACK_SLOT_COUNT});
    if(!inventory.ok)return inventory;
    const equipment=validateEquipment(player.equipment);
    if(!equipment.ok)return equipment;
    if(!Number.isInteger(player.equipmentRevision)||player.equipmentRevision<0)return {ok:false, code:'corrupt'};
    if(player.recovery!=null){
      if(player.recovery.id!==containerId('recovery',player.id))return {ok:false,code:'corrupt'};
      const recovery=validateContainer(player.recovery);
      if(!recovery.ok)return recovery;
    }
    if(typeof player.lantern!=='boolean')return {ok:false, code:'corrupt'};
  }
  for(const building of data.buildings){
    if(!building||!STRUCTURES[building.type]||typeof building.id!=='string'||entityIds.has(building.id)||building.store?.id!==containerId('chest',building.id))return {ok:false,code:'duplicate-owner'};
    entityIds.add(building.id);
    if(!building?.store||!Array.isArray(building.store.slots))return {ok:false, code:'corrupt'};
    const limits=building.type==='chest'?{exactSlots:CHEST_SLOT_COUNT}:{};
    const store=validateContainer(building.store, limits);
    if(!store.ok)return store;
    if(building.overflow!=null){
      if(building.type!=='chest'||building.overflow.id!==containerId('overflow', building.id))return {ok:false, code:'corrupt'};
      const overflow=validateContainer(building.overflow);
      if(!overflow.ok)return overflow;
      if(!building.overflow.slots.some(Boolean))return {ok:false, code:'corrupt'};
    }
  }
  for(const drop of data.drops){
    const stack=validateStack(drop?.stack);
    if(!stack.ok)return stack;
    if(typeof drop.id!=='string'||!Number.isFinite(drop.x)||!Number.isFinite(drop.z)||!Number.isFinite(drop.until))return {ok:false, code:'corrupt'};
    if(entityIds.has(drop.id))return {ok:false,code:'duplicate-owner'};
    entityIds.add(drop.id);
  }
  for(const change of data.nodeChanges){
    if(!change||typeof change.id!=='string'||!Number.isFinite(change.hits)||!Number.isFinite(change.ready))return {ok:false, code:'corrupt'};
  }
  if(duplicateUids(collectLocations(data)).length)return {ok:false, code:'duplicate'};
  if(data.worldId!=null&&(typeof data.worldId!=='string'||data.worldId.length>64))return {ok:false,code:'corrupt'};
  if(data.transactionRevision!=null&&(!Number.isSafeInteger(data.transactionRevision)||data.transactionRevision<0))return {ok:false,code:'corrupt'};
  if(data.chestBusy!=null){
    if(!Array.isArray(data.chestBusy)||data.chestBusy.length>4)return {ok:false,code:'corrupt'};
    const owners=new Set(),chests=new Set();
    for(const session of data.chestBusy){
      if(!session||!playerIds.has(session.ownerId)||owners.has(session.ownerId)||chests.has(session.chestId)||!data.buildings.some(b=>b.id===session.chestId&&b.type==='chest')||typeof session.sessionId!=='string'||session.sessionId.length>64||!Number.isFinite(session.openedAt)||!Number.isFinite(session.expiresAt))return {ok:false,code:'corrupt'};
      owners.add(session.ownerId);chests.add(session.chestId);
    }
  }
  return {ok:true};
}

export function validateV2Save(document){
  if(!document||typeof document!=='object'||!document.world)return {ok:false, code:'corrupt'};
  const world=validateV2World(document.world);
  if(!world.ok)return world;
  if(document.savedAt!=null&&!Number.isFinite(document.savedAt))return {ok:false, code:'corrupt'};
  return {ok:true, save:document};
}

function convertCounts(counts, {id, slotCount, supplyCapacity, grow, mint, allowEquipment=false}){
  if(!counts||typeof counts!=='object'||Array.isArray(counts))return {ok:false, code:'corrupt'};
  const known=[...SUPPLY_ITEM_IDS];
  if(allowEquipment){
    for(const itemId of ['axe','pick','spear','sword','armor','torch'])if(!known.includes(itemId))known.push(itemId);
  }
  for(const itemId of Object.keys(counts)){
    if(!known.includes(itemId)&&!itemDefinition(itemId))return {ok:false, code:'unknown-item', itemId, message:RECOVERABLE};
    if(!known.includes(itemId))known.push(itemId);
  }
  const container=slotCount===BACKPACK_SLOT_COUNT&&id.startsWith('backpack:')?createBackpack(id.slice('backpack:'.length)):createContainer(id, slotCount);
  const overflow=[];
  for(const itemId of known){
    if(!Object.hasOwn(counts, itemId))continue;
    const count=counts[itemId];
    const def=itemDefinition(itemId);
    if(!def)return {ok:false, code:'unknown-item', itemId, message:RECOVERABLE};
    if(!allowEquipment&&def.kind==='equipment')return {ok:false, code:'unknown-item', itemId, message:RECOVERABLE};
    if(!Number.isSafeInteger(count)||count<0)return {ok:false, code:'bad-count', itemId, message:RECOVERABLE};
    // v1 drop/withdraw left zero-valued entries behind in otherwise valid saves.
    if(count===0)continue;
    let left=count;
    while(left>0){
      const quantity=Math.min(def.stackLimit, left);
      const made=makeStack(mint(), itemId, quantity, def.kind==='equipment'?def.maxDurability:undefined);
      if(!made.ok)return {ok:false, code:made.code, itemId, message:RECOVERABLE};
      const plan=planInsert(container, made.stack, {
        supplyCapacity, allowPartial:true, grow, acceptsItems:true, mintUid:mint,
      });
      if(!plan.ok){
        overflow.push(made.stack);
        left-=quantity;
        continue;
      }
      container.slots=plan.slots;
      container.revision=plan.revision;
      const placed=plan.accepted+(plan.remainder?.quantity||0);
      if(placed!==quantity)return {ok:false, code:'corrupt', message:RECOVERABLE};
      if(plan.remainder)overflow.push(plan.remainder);
      left-=placed;
    }
  }
  return {ok:true, container, overflow};
}

function legacyNodes(changes){
  if(changes==null)return {ok:true, records:[]};
  if(!Array.isArray(changes))return {ok:false, code:'corrupt'};
  const records=[];
  for(const change of changes){
    if(!Array.isArray(change)||change.length<3||typeof change[0]!=='string')return {ok:false, code:'corrupt'};
    const [id, hits, ready]=change;
    if(!Number.isFinite(hits)||!Number.isFinite(ready))return {ok:false, code:'corrupt'};
    if(ready>0)records.push({id, hits:0, ready});
  }
  return {ok:true, records};
}

export function migrateV1Save(document, options={}){
  const remapTime=options.remapTime===true;
  if(!document||typeof document!=='object'||!document.world||typeof document.world!=='object')return fail('corrupt');
  let world;
  try{world=structuredClone(document.world);}catch{return fail('corrupt');}
  if(world.version!==SAVE_VERSION_V1)return fail('unsupported');
  if(!Array.isArray(world.players)||world.players.length<1||world.players.length>4)return fail('corrupt');
  if(!Number.isFinite(world.time)||world.time<0||!Array.isArray(world.buildings)||world.buildings.length>500)return fail('corrupt');
  if(!Array.isArray(world.drops))return fail('corrupt');
  const used=new Set();
  const mint=mintFactory(world, used);

  for(const player of world.players){
    if(!player||typeof player.id!=='string'||!player.inventory||typeof player.inventory!=='object'||Array.isArray(player.inventory))return fail('corrupt');
    if(!player.equipment||typeof player.equipment!=='object'||Array.isArray(player.equipment))return fail('corrupt');
    const packed=convertCounts(player.inventory, {
      id:containerId('backpack', player.id), slotCount:BACKPACK_SLOT_COUNT, supplyCapacity:null, grow:false, mint, allowEquipment:false,
    });
    if(!packed.ok)return fail(packed.code, packed.message);
    const equipmentPlan=legacyEquipmentPlan(player.equipment);
    if(equipmentPlan.unknown.length)return fail('unknown-item');
    const equipment=emptyEquipment();
    for(const slot of EQUIPMENT_SLOTS){
      const spec=equipmentPlan.sockets[slot];
      if(!spec)continue;
      const made=makeStack(mint(), spec.itemId, 1, spec.durability);
      if(!made.ok)return fail(made.code);
      equipment[slot]=made.stack;
    }
    const backpack=packed.container;
    const overflow=[...packed.overflow];
    for(const extra of equipmentPlan.backpack){
      const made=makeStack(mint(), extra.itemId, 1, extra.durability);
      if(!made.ok)return fail(made.code);
      const plan=planInsert(backpack, made.stack, {supplyCapacity:null, allowPartial:false, grow:false, acceptsItems:true, mintUid:mint});
      if(!plan.ok)overflow.push(made.stack);
      else{backpack.slots=plan.slots;backpack.revision=plan.revision;}
    }
    let recovery=null;
    if(overflow.length){
      recovery=createRecovery(player.id, overflow.length);
      overflow.forEach((stack, index)=>{recovery.slots[index]=stack;});
      recovery.revision=1;
    }
    const light=equipment.light;
    player.lantern=player.lantern===true&&!!light&&light.durability>0&&!player.down&&!player.ghost;
    player.inventory=backpack;
    player.equipment=equipment;
    player.equipmentRevision=1;
    player.recovery=recovery;
    player.goal=null;
    player.rest=false;
    player.action='idle';
    player.actionUntil=0;
  }

  for(const building of world.buildings){
    const store=building.store&&typeof building.store==='object'&&!Array.isArray(building.store)?building.store:{};
    if(building.type==='chest'){
      const converted=convertCounts(store, {
        id:containerId('chest', building.id), slotCount:CHEST_SLOT_COUNT, supplyCapacity:null, grow:false, mint, allowEquipment:true,
      });
      if(!converted.ok)return fail(converted.code, converted.message);
      building.store=converted.container;
      if(converted.overflow.length){
        building.overflow=createContainer(containerId('overflow', building.id), converted.overflow.length);
        converted.overflow.forEach((stack, index)=>{building.overflow.slots[index]=stack;});
        building.overflow.revision=1;
      }else building.overflow=null;
    }else{
      if(Object.keys(store).length)return fail('unsupported');
      building.store=createContainer(containerId('chest', building.id), 0);
    }
  }

  const drops=[];
  let dropSerial=world.idCounter;
  for(const drop of world.drops){
    if(!drop||typeof drop!=='object')return fail('corrupt');
    const def=itemDefinition(drop.type);
    if(!def)return fail('unknown-item');
    if(!Number.isInteger(drop.count)||drop.count<=0||!Number.isFinite(drop.x)||!Number.isFinite(drop.z)||!Number.isFinite(drop.until))return fail('bad-count');
    let left=drop.count;
    while(left>0){
      const quantity=Math.min(def.stackLimit, left);
      const made=makeStack(mint(), drop.type, quantity, def.kind==='equipment'?def.maxDurability:undefined);
      if(!made.ok)return fail(made.code);
      drops.push({id:`d${dropSerial++}`, stack:made.stack, x:drop.x, z:drop.z, until:drop.until});
      left-=quantity;
    }
  }
  world.drops=drops;
  world.idCounter=Math.max(world.idCounter, dropSerial);

  const nodes=legacyNodes(world.nodeChanges);
  if(!nodes.ok)return fail(nodes.code);
  world.nodeChanges=nodes.records;
  world.clock=CLOCK_V1;
  world.version=SAVE_VERSION_V2;
  if(remapTime){
    const mapped=remapWorldClock(world);
    if(!mapped.ok||!mapped.remapped)return fail(mapped.code||'time');
    world=mapped.world;
  }
  repairIdCounter(world);
  const valid=validateV2World(world);
  if(!valid.ok)return fail(valid.code||'corrupt');
  return {ok:true, code:'ok', message:'', save:{world, savedAt:document.savedAt}, write:'v2', preserveV1:true};
}

export function planContinue(stored){
  const v2=stored?.v2??null;
  const v1=stored?.v1??null;
  if(v2?.invalid)return {ok:false, code:'corrupt-v2', message:RECOVERABLE, write:null, preserveV1:true, recoverable:!!(v1&&!v1.invalid)};
  if(v2){
    let world;
    try{world=structuredClone(v2.world);}catch{return {ok:false, code:'corrupt-v2', message:RECOVERABLE, write:null, preserveV1:true, recoverable:!!(v1&&!v1.invalid)};}
    const changed=settleStorage(world);
    const settled={...v2, world};
    const valid=validateV2Save(changed?settled:v2);
    if(valid.ok&&(changed?world.clock:v2.world.clock)===CLOCK_V1)return {ok:true, save:changed?settled:v2, write:changed?'v2':null, preserveV1:true, recoverable:false};
    if(valid.ok&&v2.world.clock===CLOCK_V2){
      return {ok:false, code:'clock', message:'This expedition was saved for a longer day and night that is not active yet. The original save was kept.', write:null, preserveV1:true, recoverable:true};
    }
    return {ok:false, code:'corrupt-v2', message:RECOVERABLE, write:null, preserveV1:true, recoverable:!!(v1&&!v1.invalid)};
  }
  if(!v1||v1.invalid)return {ok:false, code:'missing', message:'No saved expedition was found.', write:null, preserveV1:true, recoverable:false};
  const migrated=migrateV1Save(v1, {remapTime:false});
  if(!migrated.ok)return {ok:false, code:migrated.code, message:migrated.message, write:null, preserveV1:true, recoverable:true};
  return {ok:true, save:migrated.save, write:'v2', preserveV1:true, recoverable:false};
}

export function chunkSnapshot(json, size=12000){
  if(typeof json!=='string'||!Number.isInteger(size)||size<=0)return null;
  const parts=[];
  for(let i=0;i<json.length;i+=size)parts.push(json.slice(i, i+size));
  return parts;
}

export function joinSnapshot(parts){
  if(!Array.isArray(parts)||parts.some(part=>typeof part!=='string'))return null;
  try{return JSON.parse(parts.join(''));}catch{return null;}
}
