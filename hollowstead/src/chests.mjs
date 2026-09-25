// Authoritative chest leases and item moves. No browser, transport, or World import.
import {CHEST_LEASE_SECONDS, CHEST_GROWTH_SLOTS, EQUIPMENT_SLOTS, inReach} from './contracts.mjs?v=harvest-5';
import {cloneContainer, cloneStack, containerId, planInsert, planMove, SUPPLY_CAPACITY, validateEquipment} from './inventory.mjs?v=harvest-5';

const result=(code, extra={})=>({ok:code==='ok', code, ...extra});
const near=(a,b)=>inReach(Math.hypot(a.x-b.x,a.z-b.z));
const active=p=>!!(p?.online&&!p.down&&!p.ghost&&p.hp>0);

export function releaseChests(world, ownerId=null){
  for(const [id, session] of world.chestSessions){
    if(ownerId===null||session.ownerId===ownerId){
      world.chestSessions.delete(id);
      world.transactionRevision++;
    }
  }
}

export function pruneChests(world){
  for(const [id, session] of world.chestSessions){
    const chest=world.buildings.find(b=>b.id===id&&b.type==='chest'&&b.hp>0);
    const owner=world.player(session.ownerId);
    if(world.status!=='playing'||!chest||!active(owner)||!near(owner,chest)||session.expiresAt<=world.time){
      world.chestSessions.delete(id);
      world.transactionRevision++;
    }
  }
}

export function chestIntent(world, player, cmd){
  pruneChests(world);
  const chest=world.buildings.find(b=>b.id===cmd.chestId&&b.type==='chest'&&b.hp>0);
  const session=world.chestSessions.get(cmd.chestId);
  // Closing is legal while downed/out of range, and never releases somebody else's lock.
  if(cmd.type==='chestClose'){
    if(!session)return result('ok');
    if(session.ownerId!==player.id)return result('notOwner');
    if(cmd.sessionId!==session.sessionId)return result('wrongSession');
    world.chestSessions.delete(cmd.chestId);
    return result('ok');
  }
  if(!chest)return result('missingChest');
  if(!active(player)||world.status!=='playing')return result('unavailable');
  if(!near(player,chest))return result('outOfRange');
  if(cmd.type==='chestOpen'){
    if(session&&session.ownerId!==player.id)return result('chestInUse');
    if(session)return result('ok',{sessionId:session.sessionId});
    releaseChests(world,player.id);
    const grant={chestId:chest.id,ownerId:player.id,sessionId:crypto.randomUUID(),openedAt:world.time,expiresAt:world.time+CHEST_LEASE_SECONDS};
    world.chestSessions.set(chest.id,grant);
    player.goal=null;player.rest=false;player.action='idle';player.actionUntil=0;world.inputs.delete(player.id);
    return result('ok',{sessionId:grant.sessionId});
  }
  if(!session)return result('sessionExpired');
  if(session.ownerId!==player.id)return result('notOwner');
  if(session.sessionId!==cmd.sessionId)return result('wrongSession');
  if(cmd.type==='chestRenew'){
    session.expiresAt=world.time+CHEST_LEASE_SECONDS;
    return result('ok',{sessionId:session.sessionId});
  }
  if(cmd.type==='chestTransfer')return moveItems(world,player,cmd,chest);
  return result('unsupported');
}

function location(player,id,chest){
  if(id===player.inventory.id)return {container:player.inventory,kind:'backpack'};
  if(id===containerId('equipment',player.id)){
    return {kind:'equipment',container:{id,revision:player.equipmentRevision,slots:EQUIPMENT_SLOTS.map(slot=>cloneStack(player.equipment[slot]))}};
  }
  if(player.recovery&&id===player.recovery.id)return {container:player.recovery,kind:'recovery'};
  if(chest&&id===chest.store.id)return {container:chest.store,kind:'chest'};
  return null;
}

function commit(player,loc,slots,revision){
  if(loc.kind==='equipment'){
    const oldLight=player.equipment.light?.uid;
    EQUIPMENT_SLOTS.forEach((socket,index)=>{player.equipment[socket]=slots[index];});
    player.equipmentRevision=revision;
    if(oldLight!==player.equipment.light?.uid)player.lantern=false;
  }else{
    loc.container.slots=slots;
    loc.container.revision=revision;
  }
}

function validSockets(loc,slots){
  return loc.kind!=='equipment'||validateEquipment(Object.fromEntries(EQUIPMENT_SLOTS.map((slot,i)=>[slot,slots[i]]))).ok;
}

export function moveItems(world,player,cmd,chest=null){
  const source=location(player,cmd.sourceContainerId,chest);
  const dest=location(player,cmd.destinationContainerId,chest);
  if(!source||!dest)return result('notOwner');
  if(chest&&source.kind!=='chest'&&dest.kind!=='chest')return result('notOwner');
  if(dest.kind==='recovery')return result('notOwner');
  if(!Number.isSafeInteger(cmd.sourceRevision)||!Number.isSafeInteger(cmd.destinationRevision))return result('staleRevision');
  if(source.container.revision!==cmd.sourceRevision||dest.container.revision!==cmd.destinationRevision)return result('staleRevision');
  if(!Number.isInteger(cmd.sourceSlot)||cmd.sourceSlot<0||cmd.sourceSlot>=source.container.slots.length)return result('invalidSlot');
  const stack=source.container.slots[cmd.sourceSlot];
  if(!stack||stack.uid!==cmd.uid)return result('unknownItem');
  if(!Number.isSafeInteger(cmd.quantity)||cmd.quantity<=0||cmd.quantity>stack.quantity)return result('invalidQuantity');

  const counter=world.idCounter;
  let plan;
  if(cmd.destinationSlot===null){
    if(dest.kind==='equipment'||source.container.id===dest.container.id)return result('invalidSlot');
    const partial=cmd.quantity!==stack.quantity;
    const moving={...cloneStack(stack),quantity:cmd.quantity};
    if(partial)moving.uid=world.nextItemUid();
    const inserted=planInsert(dest.container,moving,{
      supplyCapacity:dest.kind==='backpack'?SUPPLY_CAPACITY:null,grow:dest.kind==='chest',
      allowPartial:false,mintUid:()=>world.nextItemUid(),
    });
    if(!inserted.ok){world.idCounter=counter;return result(inserted.code);}
    const sourceSlots=cloneContainer(source.container).slots;
    if(partial)sourceSlots[cmd.sourceSlot].quantity-=cmd.quantity;
    else sourceSlots[cmd.sourceSlot]=null;
    plan={ok:true,sourceSlots,destSlots:inserted.slots,sourceRevision:source.container.revision+1,destRevision:dest.container.revision+1,same:false};
  }else{
    plan=planMove({
      source:source.container,destination:dest.container,
      sourceSlot:cmd.sourceSlot,destinationSlot:cmd.destinationSlot,uid:cmd.uid,quantity:cmd.quantity,
      sourceRevision:cmd.sourceRevision,destinationRevision:cmd.destinationRevision,mintUid:()=>world.nextItemUid(),
      destSupplyCapacity:dest.kind==='backpack'?SUPPLY_CAPACITY:null,
      sourceSupplyCapacity:source.kind==='backpack'?SUPPLY_CAPACITY:null,
      sourceAccepts:source.kind!=='recovery',
    });
  }
  if(!plan.ok){world.idCounter=counter;return result(plan.code);}
  if(!validSockets(source,plan.sourceSlots)||!validSockets(dest,plan.destSlots)){
    world.idCounter=counter;return result('incompatibleSocket');
  }
  // Keep a spare row in a chest filled through an explicitly selected slot.
  if(dest.kind==='chest'&&plan.destSlots.every(Boolean)){
    if(plan.destSlots.length+CHEST_GROWTH_SLOTS>10000){world.idCounter=counter;return result('inventoryFull');}
    plan.destSlots.push(...Array(CHEST_GROWTH_SLOTS).fill(null));
  }
  commit(player,source,plan.sourceSlots,plan.sourceRevision);
  if(!plan.same)commit(player,dest,plan.destSlots,plan.destRevision);
  world.collapseRecovery(player);
  world.assertItems();
  return result('ok');
}
