import {ACTION_RESULT_CACHE_LIMIT, INTENTS} from './contracts.mjs?v=harvest-16';
import {containerId, planSortSlots} from './inventory.mjs?v=harvest-16';
import {chestIntent, moveItems} from './chests.mjs?v=harvest-16';

export const TRANSACTION_PROTOCOL=1;
const outcome=code=>({ok:code==='ok',code});
// Gameplay ping and automatic eat are not world actions. Legacy inventory
// packets stay excluded: their replacements require revisions.
const WORLD_ACTIONS=new Set(['move','craft','build','interact','attack','dash','lantern','repair','dismantle','upgrade']);
function validWorldAction(cmd){
  if(typeof cmd.type!=='string')return false;
  if(['move','build'].includes(cmd.type)&&(!Number.isFinite(cmd.x)||!Number.isFinite(cmd.z)))return false;
  if(['craft','build'].includes(cmd.type)&&typeof cmd.recipe!=='string')return false;
  if(['repair','dismantle'].includes(cmd.type)&&typeof cmd.target!=='string')return false;
  if(['interact','move'].includes(cmd.type)&&cmd.target!=null&&typeof cmd.target!=='string')return false;
  return true;
}

export function inventoryIntent(world,p,cmd){
  const contract=INTENTS[cmd.type];
  if(!contract||contract.required.some(key=>!Object.hasOwn(cmd,key)))return outcome('invalidCommand');
  if(cmd.type.startsWith('chest'))return chestIntent(world,p,cmd);
  if(cmd.type==='inventoryMove')return moveItems(world,p,cmd);
  if(cmd.type==='equipItem'||cmd.type==='unequipItem'){
    if(!Number.isSafeInteger(cmd.inventoryRevision)||!Number.isSafeInteger(cmd.equipmentRevision))return outcome('staleRevision');
    return cmd.type==='equipItem'?world.equip(p,cmd.uid,cmd.socket,cmd.inventoryRevision,cmd.equipmentRevision):world.unequip(p,cmd.socket,cmd.uid,cmd.inventoryRevision,cmd.equipmentRevision);
  }
  if(cmd.type==='consumeItem'){
    if(!Number.isSafeInteger(cmd.inventoryRevision)||cmd.inventoryRevision!==p.inventory.revision)return outcome('staleRevision');
    return world.action(p.id,{type:'use',uid:cmd.uid,inventoryRevision:cmd.inventoryRevision})||outcome('rejected');
  }
  if(cmd.type==='craftRecipe')return world.performCraft(p, cmd.recipeId, cmd.stationId);
  if(cmd.type==='placeBuilding')return world.performBuild(p, cmd.recipeId, cmd.x, cmd.z, cmd.stationId, cmd.rotation);
  if(cmd.type==='buildingAction')return world.performBuildingAction(p, cmd.targetId, cmd.actionId);
  if(cmd.type==='setHarvestTarget')return world.setHarvestTarget(p, cmd);
  if(cmd.type==='lanternToggle')return world.action(p.id,{type:'lantern',uid:cmd.uid})||outcome('rejected');
  if(cmd.type==='packSort'){
    if(!Number.isSafeInteger(cmd.inventoryRevision)||cmd.inventoryRevision!==p.inventory.revision)return outcome('staleRevision');
    const planned=planSortSlots(p.inventory.slots);
    if(!planned.changed)return outcome('ok');
    p.inventory.slots=planned.slots;
    p.inventory.revision=cmd.inventoryRevision+1;
    world.assertItems();
    return outcome('ok');
  }
  if(cmd.type==='dropItem'){
    const loc=world.locate(p,cmd.uid);
    if(!loc||loc.kind==='recovery')return outcome('notOwner');
    if(!Number.isSafeInteger(cmd.inventoryRevision)||cmd.inventoryRevision!==p.inventory.revision)return outcome('staleRevision');
    if(loc.kind==='equipment'&&cmd.equipmentRevision!==p.equipmentRevision)return outcome('staleRevision');
    if(!Number.isSafeInteger(cmd.quantity)||cmd.quantity<=0||cmd.quantity>loc.stack.quantity)return outcome('invalidQuantity');
    return outcome(world.dropOwned(p,cmd.uid,cmd.quantity)?'ok':'rejected');
  }
  return outcome('unsupported'); // P3 owns the remaining context/crafting intents.
}

export function revisions(world,actorId,chestId){
  const p=world.player(actorId), out={};
  if(p){
    out[p.inventory.id]=p.inventory.revision;
    out[containerId('equipment',p.id)]=p.equipmentRevision;
    if(p.recovery)out[p.recovery.id]=p.recovery.revision;
  }
  const chest=world.buildings.find(b=>b.id===chestId&&b.type==='chest');
  if(chest)out[chest.store.id]=chest.store.revision;
  return out;
}

// One lifetime per transport connection, independent of the bounded result cache.
export function createActionSession({getWorld,actorId,sessionId=crypto.randomUUID(),now=()=>performance.now(),isPaused=()=>false}){
  let highWater=0,windowStart=-Infinity,count=0;
  const cache=new Map();
  function execute(cmd){
    const world=getWorld();
    const response=(code,extra={})=>({
      type:'actionResult',requestId:typeof cmd?.requestId==='string'?cmd.requestId.slice(0,96):'',
      ok:code==='ok',code,worldId:world.networkId,worldRevision:world.transactionRevision,
      affectedRevisions:revisions(world,actorId,cmd?.chestId),...extra,
    });
    if(!cmd||typeof cmd!=='object'||Array.isArray(cmd)||typeof cmd.requestId!=='string')return response('invalidCommand');
    const prefix=sessionId+':',suffix=cmd.requestId.startsWith(prefix)?cmd.requestId.slice(prefix.length):'';
    if(!/^[1-9][0-9]{0,15}$/.test(suffix)||!Number.isSafeInteger(Number(suffix)))return response('wrongSession');
    const sequence=Number(suffix);
    if(cache.has(sequence))return structuredClone(cache.get(sequence));
    if(sequence<=highWater)return response('oldRequest');
    highWater=sequence;
    const time=now();
    if(time-windowStart>=1000){windowStart=time;count=0;}
    let reply;
    if(++count>24)reply=response('rateLimited');
    else if(cmd.worldId!==world.networkId)reply=response('worldChanged');
    else if(isPaused()&&cmd.type!=='chestClose')reply=response('paused');
    else if(!validWorldAction(cmd))reply=response('invalidCommand');
    else if(!WORLD_ACTIONS.has(cmd.type)&&!Object.hasOwn(INTENTS,cmd.type))reply=response('unsupported');
    else{
      const p=world.player(actorId),notice=p?.noticeAt;
      const result=world.action(actorId,cmd)||outcome('rejected');
      if(result.ok)world.transactionRevision++;
      reply=response(result.code||'rejected',{
        ok:result.ok===true,
        ...(result.sessionId?{sessionId:result.sessionId}:{}),
        ...(!result.ok&&p?.noticeAt!==notice?{message:p.notice}:{}),
      });
    }
    cache.set(sequence,reply);
    while(cache.size>ACTION_RESULT_CACHE_LIMIT)cache.delete(cache.keys().next().value);
    return structuredClone(reply);
  }
  return {sessionId,execute};
}

// Pending UI operations settle only after the acknowledged snapshot is installed.
export function createActionClient({send,now=()=>performance.now(),onResult=()=>{}}){
  let sessionId=null,sequence=0,frame=null;
  const pending=new Map();
  function settle(id,result){
    const entry=pending.get(id);if(!entry)return;
    pending.delete(id);entry.resolve(result);onResult(result);
  }
  function close(code='disconnected'){
    for(const id of [...pending.keys()])settle(id,{type:'actionResult',requestId:id,ok:false,code,affectedRevisions:{}});
    sessionId=null;sequence=0;frame=null;
  }
  function reconcile(){
    for(const [id,entry] of pending){
      const result=entry.result;if(!result)continue;
      if(frame?.worldId!==result.worldId){
        if(result.code==='worldChanged')settle(id,result);
        continue;
      }
      if(frame.worldRevision>=result.worldRevision)settle(id,result);
    }
  }
  function acceptFrame(data){
    if(frame&&frame.worldId!==data.worldId){
      for(const id of [...pending.keys()])settle(id,{type:'actionResult',requestId:id,ok:false,code:'worldChanged',affectedRevisions:{}});
    }
    frame={worldId:data.worldId,worldRevision:data.transactionRevision};
    reconcile();
  }
  function acceptResult(result){
    if(!result||result.type!=='actionResult'||!pending.has(result.requestId)||typeof result.ok!=='boolean'||typeof result.code!=='string'||!Number.isSafeInteger(result.worldRevision))return;
    pending.get(result.requestId).result=result;reconcile();
  }
  function request(value){
    if(!sessionId||!frame)return Promise.resolve({ok:false,code:'notReady'});
    if(pending.size>=8)return Promise.resolve({ok:false,code:'pending'});
    const requestId=sessionId+':'+(++sequence);
    const cmd={...value,requestId,worldId:frame.worldId};
    const promise=new Promise(resolve=>pending.set(requestId,{resolve,cmd,at:now(),sent:now(),result:null}));
    promise.requestId=requestId;
    send(cmd);
    return promise;
  }
  function tick(){
    const time=now();
    for(const [id,entry] of pending){
      if(time-entry.at>12000){settle(id,{type:'actionResult',requestId:id,ok:false,code:'timeout',affectedRevisions:{}});continue;}
      if(!entry.result&&time-entry.sent>=1500){entry.sent=time;send(entry.cmd);}
    }
  }
  return {
    request,acceptResult,acceptFrame,tick,close,
    start(id){close('sessionChanged');sessionId=id;},
    get pendingCount(){return pending.size;},
  };
}
