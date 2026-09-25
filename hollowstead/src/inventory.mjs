// Stack, container, and equipment primitives. No DOM, network, rendering, or World.

import {EQUIPMENT, ITEMS} from './content.mjs?v=harvest-15';
import {magicItems} from './magic/registry.mjs?v=harvest-15';
import {
  BACKPACK_SLOT_COUNT, CHEST_SLOT_COUNT, CLOCK_V1, CLOCK_V2, DROP_LIFETIME_SECONDS,
  EQUIPMENT_SLOTS, RESULT_CODES, SAVE_VERSION_V2, SUPPLY_CAPACITY, SUPPLY_ITEM_IDS,
  containerId, equipmentSlotFor, itemDefinition,
} from './contracts.mjs?v=harvest-15';

export {
  BACKPACK_SLOT_COUNT, CHEST_SLOT_COUNT, CLOCK_V1, CLOCK_V2, DROP_LIFETIME_SECONDS,
  EQUIPMENT_SLOTS, SAVE_VERSION_V2, SUPPLY_CAPACITY, SUPPLY_ITEM_IDS,
  containerId, equipmentSlotFor, itemDefinition,
};

const UID_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/;

function fail(code){return {ok:false, code, stack:null};}

export function validUid(uid){
  return typeof uid==='string'&&UID_PATTERN.test(uid)&&uid!=='__proto__'&&uid!=='constructor'&&uid!=='prototype';
}

export function makeStack(uid, itemId, quantity, durability){
  if(!validUid(uid))return fail(RESULT_CODES.unknownItem);
  const def=itemDefinition(itemId);
  if(!def)return fail(RESULT_CODES.unknownItem);
  if(!Number.isInteger(quantity)||quantity<=0||quantity>def.stackLimit)return fail(RESULT_CODES.invalidQuantity);
  const stack={uid, itemId, quantity};
  if(def.kind==='equipment'){
    if(typeof durability!=='number'||!Number.isFinite(durability)||durability<0||durability>def.maxDurability)return fail(RESULT_CODES.rejected);
    if(durability===0&&!def.retainsAtZeroDurability)return fail(RESULT_CODES.rejected);
    stack.durability=durability;
  }else if(durability!==undefined)return fail(RESULT_CODES.rejected);
  return {ok:true, code:RESULT_CODES.ok, stack};
}

export function validateStack(stack){
  if(!stack||typeof stack!=='object')return fail(RESULT_CODES.unknownItem);
  return makeStack(stack.uid, stack.itemId, stack.quantity, stack.durability);
}

export function cloneStack(stack){
  if(!stack)return null;
  const copy={uid:stack.uid, itemId:stack.itemId, quantity:stack.quantity};
  if(typeof stack.durability==='number')copy.durability=stack.durability;
  return copy;
}

export function cloneSlots(slots){return slots.map(cloneStack);}

export function cloneContainer(container){
  return {id:container.id, revision:container.revision, slots:cloneSlots(container.slots)};
}

export function createContainer(id, slotCount, revision=0){
  const count=Math.max(0, slotCount|0);
  return {id, revision, slots:Array.from({length:count}, ()=>null)};
}

export function createBackpack(ownerId){return createContainer(containerId('backpack', ownerId), BACKPACK_SLOT_COUNT);}
export function createChest(ownerId){return createContainer(containerId('chest', ownerId), CHEST_SLOT_COUNT);}
export function createRecovery(ownerId, slotCount){return createContainer(containerId('recovery', ownerId), Math.max(0, slotCount|0));}

export function emptyEquipment(){
  return {chop:null, mine:null, weapon:null, body:null, light:null};
}

export function cloneEquipment(equipment){
  const copy=emptyEquipment();
  for(const slot of EQUIPMENT_SLOTS)copy[slot]=cloneStack(equipment?.[slot]);
  return copy;
}

export function countItem(container, itemId){
  if(!container?.slots)return 0;
  let total=0;
  for(const stack of container.slots)if(stack?.itemId===itemId)total+=stack.quantity;
  return total;
}

export function supplyLoad(container){
  if(!container?.slots)return 0;
  let total=0;
  for(const stack of container.slots){
    if(!stack)continue;
    const def=itemDefinition(stack.itemId);
    total+=(def?.supplyUnits||0)*stack.quantity;
  }
  return total;
}

export function occupiedCount(container){
  if(!container?.slots)return 0;
  return container.slots.reduce((total, stack)=>total+(stack?1:0), 0);
}

export function findStack(container, uid){
  if(!container?.slots||typeof uid!=='string')return null;
  const slot=container.slots.findIndex(stack=>stack?.uid===uid);
  if(slot<0)return null;
  return {slot, stack:container.slots[slot]};
}

export function validateContainer(container, {exactSlots=null, minSlots=null, multipleOf=null, supplyCapacity=null}={}){
  if(!container||typeof container!=='object'||typeof container.id!=='string'||container.id.length===0||container.id.length>96)return {ok:false, code:'corrupt'};
  if(!Number.isSafeInteger(container.revision)||container.revision<0)return {ok:false, code:'corrupt'};
  if(!Array.isArray(container.slots))return {ok:false, code:'corrupt'};
  if(exactSlots!=null&&container.slots.length!==exactSlots)return {ok:false, code:'corrupt'};
  if(minSlots!=null&&container.slots.length<minSlots)return {ok:false, code:'corrupt'};
  if(multipleOf!=null&&container.slots.length%multipleOf!==0)return {ok:false, code:'corrupt'};
  const seen=new Set();
  for(const slot of container.slots){
    if(slot==null)continue;
    const valid=validateStack(slot);
    if(!valid.ok)return {ok:false, code:valid.code};
    if(seen.has(slot.uid))return {ok:false, code:'duplicate'};
    seen.add(slot.uid);
  }
  if(supplyCapacity!=null&&supplyLoad(container)>supplyCapacity)return {ok:false, code:'capacity'};
  return {ok:true};
}

export function validateEquipment(equipment){
  if(!equipment||typeof equipment!=='object')return {ok:false, code:'corrupt'};
  for(const key of Object.keys(equipment))if(!EQUIPMENT_SLOTS.includes(key))return {ok:false, code:'corrupt'};
  const seen=new Set();
  for(const slot of EQUIPMENT_SLOTS){
    if(!Object.hasOwn(equipment, slot))return {ok:false, code:'corrupt'};
    const stack=equipment[slot];
    if(stack==null)continue;
    const valid=validateStack(stack);
    if(!valid.ok)return {ok:false, code:valid.code};
    if(equipmentSlotFor(stack.itemId)!==slot)return {ok:false, code:RESULT_CODES.incompatibleSocket};
    if(seen.has(stack.uid))return {ok:false, code:'duplicate'};
    seen.add(stack.uid);
  }
  return {ok:true};
}

function placeInEmpty(slots, stack){
  const index=slots.findIndex(slot=>slot==null);
  if(index<0)return false;
  slots[index]=stack;
  return true;
}

/**
 * Insert one stack. Merges in slot order, then fills empty slots.
 * A whole stack that stays intact keeps its UID. Splits mint a new UID.
 * Merging consumes the incoming UID only once none of it remains as its own stack.
 * `allowPartial` leaves a remainder stack. Otherwise any shortfall fails with no commit.
 */
export function planInsert(container, stack, options={}){
  const reject=(code)=>({ok:false, code, slots:null, revision:container?.revision??0, accepted:0, remainder:null, consumedUid:false});
  if(!container||!Array.isArray(container.slots)||!Number.isInteger(container.revision))return reject(RESULT_CODES.invalidSlot);
  if(options.acceptsItems===false)return reject(RESULT_CODES.rejected);
  const valid=validateStack(stack);
  if(!valid.ok)return reject(valid.code);
  if(container.slots.some(slot=>slot?.uid===stack.uid))return reject(RESULT_CODES.rejected);
  const def=itemDefinition(stack.itemId);
  const supplyCapacity=options.supplyCapacity==null?Infinity:options.supplyCapacity;
  const allowPartial=options.allowPartial===true;
  const mintUid=options.mintUid;
  const slots=cloneSlots(container.slots);
  let load=supplyLoad({slots});
  let remaining=stack.quantity;
  let placedOriginal=false;
  const supplyRoom=()=>def.supplyUnits<=0?Infinity:Math.floor((supplyCapacity-load)/def.supplyUnits);

  if(def.stackLimit>1){
    for(let i=0;i<slots.length&&remaining>0;i++){
      const dest=slots[i];
      if(!dest||dest.itemId!==stack.itemId||dest.quantity>=def.stackLimit)continue;
      const take=Math.min(def.stackLimit-dest.quantity, remaining, supplyRoom());
      if(take<=0)continue;
      dest.quantity+=take;
      remaining-=take;
      load+=take*def.supplyUnits;
    }
  }

  while(remaining>0){
    const room=Math.min(def.stackLimit, remaining, supplyRoom());
    if(room<=0)break;
    let uid;
    if(!placedOriginal)uid=stack.uid;
    else{
      if(typeof mintUid!=='function')return reject(RESULT_CODES.rejected);
      uid=mintUid();
      if(!validUid(uid)||uid===stack.uid||slots.some(slot=>slot?.uid===uid))return reject(RESULT_CODES.rejected);
    }
    const piece=makeStack(uid, stack.itemId, room, stack.durability);
    if(!piece.ok)return reject(piece.code);
    if(!placeInEmpty(slots, piece.stack))break;
    if(uid===stack.uid)placedOriginal=true;
    remaining-=room;
    load+=room*def.supplyUnits;
  }

  const accepted=stack.quantity-remaining;
  if(accepted<=0)return reject(RESULT_CODES.inventoryFull);
  if(remaining>0&&!allowPartial)return reject(RESULT_CODES.inventoryFull);
  let remainder=null;
  if(remaining>0){
    const uid=placedOriginal? (typeof mintUid==='function'?mintUid():null) : stack.uid;
    if(!validUid(uid))return reject(RESULT_CODES.rejected);
    const made=makeStack(uid, stack.itemId, remaining, stack.durability);
    if(!made.ok)return reject(made.code);
    remainder=made.stack;
  }
  return {
    ok:true, code:RESULT_CODES.ok, slots, revision:container.revision+1, accepted, remainder,
    consumedUid:remaining===0&&!placedOriginal,
  };
}

export function planTake(container, itemId, quantity){
  const slots=container?.slots?cloneSlots(container.slots):[];
  if(!itemDefinition(itemId)||!Number.isInteger(quantity)||quantity<=0)return {taken:0, slots};
  let left=quantity;
  for(let i=0;i<slots.length&&left>0;i++){
    const stack=slots[i];
    if(!stack||stack.itemId!==itemId)continue;
    const take=Math.min(left, stack.quantity);
    stack.quantity-=take;
    left-=take;
    if(stack.quantity<=0)slots[i]=null;
  }
  return {taken:quantity-left, slots};
}

function revisionMatches(expected, current){return expected===undefined||expected===current;}

export function planMove({
  source, destination, sourceSlot, destinationSlot, uid, quantity,
  sourceRevision, destinationRevision, mintUid,
  destSupplyCapacity=null, sourceSupplyCapacity=null, destAccepts=true, sourceAccepts=true,
}={}){
  const reject=(code)=>({ok:false, code});
  if(!source?.slots||!destination?.slots)return reject(RESULT_CODES.invalidSlot);
  if(!revisionMatches(sourceRevision, source.revision)||!revisionMatches(destinationRevision, destination.revision))return reject(RESULT_CODES.staleRevision);
  if(!Number.isInteger(sourceSlot)||sourceSlot<0||sourceSlot>=source.slots.length)return reject(RESULT_CODES.invalidSlot);
  if(!Number.isInteger(destinationSlot)||destinationSlot<0||destinationSlot>=destination.slots.length)return reject(RESULT_CODES.invalidSlot);
  if(!destAccepts)return reject(RESULT_CODES.rejected);
  const same=source===destination||(source.id&&source.id===destination.id);
  const sourceSlots=cloneSlots(source.slots);
  const destSlots=same?sourceSlots:cloneSlots(destination.slots);
  const moving=sourceSlots[sourceSlot];
  if(!moving||moving.uid!==uid)return reject(RESULT_CODES.unknownItem);
  if(!Number.isInteger(quantity)||quantity<=0||quantity>moving.quantity)return reject(RESULT_CODES.invalidQuantity);
  if(same&&sourceSlot===destinationSlot){
    return {ok:true, code:RESULT_CODES.ok, sourceSlots, destSlots:sourceSlots, sourceRevision:source.revision, destRevision:destination.revision, same:true};
  }
  const occupant=destSlots[destinationSlot];
  const def=itemDefinition(moving.itemId);
  if(!occupant){
    if(quantity===moving.quantity){
      destSlots[destinationSlot]=moving;
      if(!(same&&sourceSlot===destinationSlot))sourceSlots[sourceSlot]=null;
    }else{
      if(typeof mintUid!=='function')return reject(RESULT_CODES.rejected);
      const piece=makeStack(mintUid(), moving.itemId, quantity, moving.durability);
      if(!piece.ok)return reject(piece.code);
      moving.quantity-=quantity;
      destSlots[destinationSlot]=piece.stack;
    }
  }else if(occupant.uid!==moving.uid&&occupant.itemId===moving.itemId&&def.stackLimit>1){
    const room=def.stackLimit-occupant.quantity;
    if(room<quantity)return reject(RESULT_CODES.inventoryFull);
    occupant.quantity+=quantity;
    moving.quantity-=quantity;
    if(moving.quantity<=0)sourceSlots[sourceSlot]=null;
  }else if(quantity===moving.quantity&&occupant.uid!==moving.uid){
    if(sourceAccepts===false)return reject(RESULT_CODES.rejected);
    const displaced=itemDefinition(occupant.itemId);
    if(!displaced||!def)return reject(RESULT_CODES.unknownItem);
    destSlots[destinationSlot]=moving;
    sourceSlots[sourceSlot]=occupant;
  }else return reject(RESULT_CODES.inventoryFull);
  if(destSupplyCapacity!=null&&supplyLoad({slots:destSlots})>destSupplyCapacity)return reject(RESULT_CODES.inventoryFull);
  if(!same&&sourceSupplyCapacity!=null&&supplyLoad({slots:sourceSlots})>sourceSupplyCapacity)return reject(RESULT_CODES.inventoryFull);
  const nextSource=source.revision+1;
  const nextDest=same?nextSource:destination.revision+1;
  return {ok:true, code:RESULT_CODES.ok, sourceSlots, destSlots, sourceRevision:nextSource, destRevision:nextDest, same};
}

export function planEquip({inventory, equipment, inventoryRevision, equipmentRevision, currentEquipmentRevision, uid, socket}={}){
  const reject=(code)=>({ok:false, code});
  if(!inventory?.slots||!equipment)return reject(RESULT_CODES.invalidSlot);
  if(inventoryRevision!==undefined&&inventory.revision!==inventoryRevision)return reject(RESULT_CODES.staleRevision);
  if(equipmentRevision!==undefined&&currentEquipmentRevision!==equipmentRevision)return reject(RESULT_CODES.staleRevision);
  const index=inventory.slots.findIndex(slot=>slot?.uid===uid);
  if(index<0)return reject(RESULT_CODES.unknownItem);
  const stack=inventory.slots[index];
  const natural=equipmentSlotFor(stack.itemId);
  const target=socket||natural;
  if(!natural||target!==natural||!EQUIPMENT_SLOTS.includes(target))return reject(RESULT_CODES.incompatibleSocket);
  const slots=cloneSlots(inventory.slots);
  const next=cloneEquipment(equipment);
  const displaced=next[target];
  slots[index]=displaced?cloneStack(displaced):null;
  next[target]=cloneStack(stack);
  return {
    ok:true, code:RESULT_CODES.ok, slots, equipment:next, socket:target,
    inventoryRevision:inventory.revision+1,
    equipmentRevision:(currentEquipmentRevision??0)+1,
    displacedUid:displaced?.uid||null,
  };
}

export function planUnequip({inventory, equipment, inventoryRevision, equipmentRevision, currentEquipmentRevision, uid, socket}={}){
  const reject=(code)=>({ok:false, code});
  if(!inventory?.slots||!equipment)return reject(RESULT_CODES.invalidSlot);
  if(inventoryRevision!==undefined&&inventory.revision!==inventoryRevision)return reject(RESULT_CODES.staleRevision);
  if(equipmentRevision!==undefined&&currentEquipmentRevision!==equipmentRevision)return reject(RESULT_CODES.staleRevision);
  const target=EQUIPMENT_SLOTS.includes(socket)?socket:EQUIPMENT_SLOTS.find(slot=>equipment[slot]?.uid===uid);
  if(!target||equipment[target]==null)return reject(RESULT_CODES.unknownItem);
  if(uid&&equipment[target].uid!==uid)return reject(RESULT_CODES.unknownItem);
  const index=inventory.slots.findIndex(slot=>slot==null);
  if(index<0)return reject(RESULT_CODES.inventoryFull);
  const slots=cloneSlots(inventory.slots);
  const next=cloneEquipment(equipment);
  slots[index]=cloneStack(next[target]);
  next[target]=null;
  return {
    ok:true, code:RESULT_CODES.ok, slots, equipment:next, socket:target,
    inventoryRevision:inventory.revision+1,
    equipmentRevision:(currentEquipmentRevision??0)+1,
  };
}

export function planConsume({inventory, inventoryRevision, uid, quantity=1}={}){
  const reject=(code)=>({ok:false, code});
  if(!inventory?.slots)return reject(RESULT_CODES.invalidSlot);
  if(inventoryRevision!==undefined&&inventory.revision!==inventoryRevision)return reject(RESULT_CODES.staleRevision);
  if(!Number.isInteger(quantity)||quantity<=0)return reject(RESULT_CODES.invalidQuantity);
  const index=inventory.slots.findIndex(slot=>slot?.uid===uid);
  if(index<0)return reject(RESULT_CODES.unknownItem);
  const slots=cloneSlots(inventory.slots);
  const stack=slots[index];
  if(stack.quantity<quantity)return reject(RESULT_CODES.invalidQuantity);
  const itemId=stack.itemId;
  stack.quantity-=quantity;
  if(stack.quantity<=0)slots[index]=null;
  return {ok:true, code:RESULT_CODES.ok, slots, revision:inventory.revision+1, itemId, quantity};
}

function sameStack(a, b){
  if(a===b)return true;
  if(!a||!b)return false;
  return a.uid===b.uid&&a.itemId===b.itemId&&a.quantity===b.quantity&&a.durability===b.durability;
}

export function sameSlots(a, b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
  for(let i=0;i<a.length;i++){
    if(!a[i]&&!b[i])continue;
    if(!sameStack(a[i], b[i]))return false;
  }
  return true;
}

function canCombine(stack){
  if(!stack||typeof stack.durability==='number')return false;
  const def=itemDefinition(stack.itemId);
  return !!(def&&def.kind!=='equipment'&&def.stackLimit>1);
}

/** Pour later stacks of the same item into earlier ones. Equipment and different ids stay apart. */
export function planStackSlots(slots){
  const next=cloneSlots(slots||[]);
  for(let i=0;i<next.length;i++){
    const dest=next[i];
    if(!canCombine(dest))continue;
    const limit=itemDefinition(dest.itemId).stackLimit;
    for(let j=i+1;j<next.length&&dest.quantity<limit;j++){
      const src=next[j];
      if(!src||src.itemId!==dest.itemId||!canCombine(src))continue;
      const take=Math.min(limit-dest.quantity, src.quantity);
      if(take<=0)continue;
      dest.quantity+=take;
      src.quantity-=take;
      if(src.quantity<=0)next[j]=null;
    }
  }
  return {slots:next, changed:!sameSlots(slots, next)};
}

/** Stack identical items, then group by item id with larger stacks first. Ties keep the earlier slot. */
export function planSortSlots(slots){
  const stacked=planStackSlots(slots);
  const entries=[];
  stacked.slots.forEach((stack, index)=>{if(stack)entries.push({stack, index});});
  entries.sort((a, b)=>{
    if(a.stack.itemId<b.stack.itemId)return -1;
    if(a.stack.itemId>b.stack.itemId)return 1;
    if(a.stack.quantity!==b.stack.quantity)return b.stack.quantity-a.stack.quantity;
    return a.index-b.index;
  });
  const next=Array.from({length:stacked.slots.length}, ()=>null);
  entries.forEach((entry, index)=>{next[index]=entry.stack;});
  return {slots:next, changed:!sameSlots(slots, next)};
}

export function wearStack(stack, amount){
  if(!stack)return {stack:null, removed:false};
  const def=itemDefinition(stack.itemId);
  if(!def||def.kind!=='equipment'||typeof amount!=='number'||!Number.isFinite(amount)||amount<0)return {stack:cloneStack(stack), removed:false};
  const durability=Math.max(0, Math.min(def.maxDurability, stack.durability-amount));
  if(durability<=0&&!def.retainsAtZeroDurability)return {stack:null, removed:true};
  return {stack:{...cloneStack(stack), durability}, removed:false};
}

export function applyTransaction(updates){
  if(!Array.isArray(updates))return false;
  for(const update of updates){
    if(update.container){
      update.container.slots=update.slots;
      update.container.revision=update.revision;
    }
    if(update.player&&update.equipment){
      for(const slot of EQUIPMENT_SLOTS)update.player.equipment[slot]=update.equipment[slot];
      if(update.equipmentRevision!=null)update.player.equipmentRevision=update.equipmentRevision;
    }
  }
  return true;
}

export function serializeContainer(container){return cloneContainer(container);}

export function equippedLanternLit(player){
  const light=player?.equipment?.light;
  return !!(player&&player.online&&!player.down&&!player.ghost&&player.lantern&&light?.itemId==='torch'&&typeof light.durability==='number'&&light.durability>0);
}

export function itemSpriteKey(itemId){
  if(!itemDefinition(itemId))return null;
  return ITEMS[itemId]?.icon||EQUIPMENT[itemId]?.icon||magicItems[itemId]?.icon||null;
}

export function collectLocations(world){
  const rows=[];
  const add=(stack, where)=>{if(stack)rows.push({uid:stack.uid, stack, ...where});};
  for(const player of world?.players||[]){
    player.inventory?.slots?.forEach((stack, slot)=>add(stack, {kind:'backpack', ownerId:player.id, slot}));
    for(const slot of EQUIPMENT_SLOTS)add(player.equipment?.[slot], {kind:'equipment', ownerId:player.id, slot});
    player.recovery?.slots?.forEach((stack, slot)=>add(stack, {kind:'recovery', ownerId:player.id, slot}));
  }
  for(const building of world?.buildings||[]){
    building.store?.slots?.forEach((stack, slot)=>add(stack, {kind:'chest', ownerId:building.id, slot}));
    building.overflow?.slots?.forEach((stack, slot)=>add(stack, {kind:'overflow', ownerId:building.id, slot}));
  }
  for(const drop of world?.drops||[])add(drop.stack, {kind:'drop', ownerId:drop.id, slot:null});
  return rows;
}

export function duplicateUids(rows){
  const seen=new Set();
  const duplicates=[];
  for(const row of rows){
    if(seen.has(row.uid))duplicates.push(row.uid);
    seen.add(row.uid);
  }
  return duplicates;
}

export function totalQuantity(world, itemId){
  return collectLocations(world).reduce((total, row)=>total+(row.stack.itemId===itemId?row.stack.quantity:0), 0);
}

export function isMaterial(itemId){
  const def=itemDefinition(itemId);
  return !!(def&&def.kind==='supply'&&!ITEMS[itemId]?.food&&!ITEMS[itemId]?.heal);
}
