import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../src/engine.mjs';
import {ITEMS,EQUIPMENT} from '../src/content.mjs';
import {createActionSession} from '../src/transactions.mjs';
import {collectLocations,duplicateUids,containerId,countItem,totalQuantity} from '../src/inventory.mjs';
import {CHEST_LEASE_SECONDS} from '../src/contracts.mjs';
import {migrateV1Save,validateV2World} from '../src/serialization.mjs';

function camp(){
  const w=new World(12),p=w.addPlayer('host'),q=w.addPlayer('guest');w.start();
  const chest=w.structure('chest',p.x+1,p.z);w.buildings.push(chest);
  let clock=0;const sessions=new Map(),seq=new Map();
  function command(actor,value){
    if(!sessions.has(actor.id))sessions.set(actor.id,createActionSession({getWorld:()=>w,actorId:actor.id,now:()=>clock}));
    const session=sessions.get(actor.id),n=(seq.get(actor.id)||0)+1;seq.set(actor.id,n);clock+=60;
    return session.execute({...value,requestId:session.sessionId+':'+n,worldId:w.networkId});
  }
  const open=actor=>command(actor,{type:'chestOpen',chestId:chest.id});
  function transfer(actor,sessionId,source,destination,uid,quantity=1,extra={}){
    return command(actor,{type:'chestTransfer',chestId:chest.id,sessionId,
      sourceContainerId:source.id,destinationContainerId:destination.id,
      sourceSlot:source.slots.findIndex(s=>s?.uid===uid),destinationSlot:null,
      uid,quantity,sourceRevision:source.revision,destinationRevision:destination.revision,...extra});
  }
  return {w,p,q,chest,command,open,transfer};
}
const eq=p=>({id:containerId('equipment',p.id),revision:p.equipmentRevision,slots:Object.values(p.equipment)});
const copy=c=>JSON.stringify(c);

test('review P1: valid v1 zero-count pack/chest entries migrate without changing the old save',()=>{
  const doc=JSON.parse(readFileSync(new URL('./fixtures/v1-normal.json',import.meta.url)));
  doc.world.players[0].inventory.berry=0;
  doc.world.buildings.find(b=>b.type==='chest').store.wood=0;
  const before=copy(doc),converted=migrateV1Save(doc);
  assert.equal(converted.ok,true);assert.equal(copy(doc),before);
  assert.equal(countItem(converted.save.world.players[0].inventory,'berry'),0);
  const world=World.fromSave(converted.save);world.tick();assert.equal(world.clock,'v1');
});

test('review P1: save validation rejects aliased containers and duplicate actors',()=>{
  const {w,p,q,chest}=camp();const data=structuredClone(w.snapshot());
  data.players[0].inventory.id=chest.store.id;assert.equal(validateV2World(data).ok,false);
  const other=structuredClone(w.snapshot());other.players[1].id=p.id;
  assert.equal(validateV2World(other).ok,false);
  assert.equal(q.inventory.id,'backpack:guest');
});

test('T09 one opener wins; reopening is idempotent and switching releases only the previous chest',()=>{
  const {w,p,q,chest,open,command}=camp();
  p.goal={x:20,z:20};w.input(p.id,{x:0,z:0,act:true});
  const first=open(p);assert.equal(first.ok,true);
  assert.equal(p.goal,null);assert.equal(w.inputs.has(p.id),false);
  assert.equal(open(q).code,'chestInUse');assert.equal(open(p).sessionId,first.sessionId);
  const second=w.structure('chest',p.x,p.z+1);w.buildings.push(second);
  assert.equal(command(p,{type:'chestOpen',chestId:second.id}).ok,true);
  assert.equal(w.chestSessions.has(chest.id),false);assert.equal(open(q).ok,true);
});

test('T10 every item transfers in both directions preserving UID and worn durability',()=>{
  const {w,p,chest,open,transfer}=camp(),session=open(p).sessionId;
  for(const itemId of [...Object.keys(ITEMS),...Object.keys(EQUIPMENT)]){
    w.clearPack(p);w.give(p,itemId,1);const stack=p.inventory.slots.find(Boolean),uid=stack.uid;
    if(EQUIPMENT[itemId])stack.durability=itemId==='torch'?0:3.25;
    assert.equal(transfer(p,session,p.inventory,chest.store,uid).ok,true,itemId);
    assert.equal(transfer(p,session,chest.store,p.inventory,uid).ok,true,itemId);
    const returned=p.inventory.slots.find(s=>s?.uid===uid);
    assert.equal(returned.itemId,itemId);
    if(EQUIPMENT[itemId])assert.equal(returned.durability,itemId==='torch'?0:3.25);
    assert.deepEqual(duplicateUids(collectLocations(w)),[]);
  }
});

test('T08 review P1: lit lantern can be transferred after fuel ticks using the same socket ownership revision',()=>{
  const {w,p,chest,open,transfer}=camp();const light=w.grantEquipped(p,'torch',100);p.lantern=true;
  const view=eq(p),revision=p.equipmentRevision;for(let i=0;i<20;i++)w.tick();
  assert.equal(p.equipmentRevision,revision);const fuel=p.equipment.light.durability;
  const session=open(p).sessionId;
  assert.equal(transfer(p,session,view,chest.store,light.uid).ok,true);
  assert.equal(p.lantern,false);assert.equal(p.equipment.light,null);
  assert.equal(chest.store.slots.find(s=>s?.uid===light.uid).durability,fuel);
});

test('T11 forged owner/session, malformed and stale transfers leave both containers untouched',()=>{
  const {w,p,q,chest,open,transfer,command}=camp(),session=open(p).sessionId;
  const stack=p.inventory.slots.find(Boolean),before=copy([p.inventory,q.inventory,chest.store]);
  assert.equal(transfer(q,session,p.inventory,chest.store,stack.uid).code,'notOwner');
  assert.equal(transfer(p,'wrong',p.inventory,chest.store,stack.uid).code,'wrongSession');
  assert.equal(transfer(p,session,p.inventory,chest.store,stack.uid,1,{sourceRevision:-1}).code,'staleRevision');
  assert.equal(transfer(p,session,p.inventory,chest.store,stack.uid,0).code,'invalidQuantity');
  assert.equal(transfer(p,session,p.inventory,chest.store,stack.uid,.5).code,'invalidQuantity');
  assert.equal(transfer(p,session,p.inventory,chest.store,stack.uid,1,{destinationSlot:999999}).code,'invalidSlot');
  assert.equal(transfer(p,session,q.inventory,chest.store,q.inventory.slots.find(Boolean).uid).code,'notOwner');
  for(const type of ['deposit','withdraw'])assert.equal(command(p,{type,target:chest.id,item:'wood'}).code,'unsupported');
  assert.equal(copy([p.inventory,q.inventory,chest.store]),before);w.assertItems();
});

test('T12 close/expiry/range/downing/disconnect/removal/load all release chest sessions',()=>{
  for(const reason of ['close','expiry','range','down','quietDown','disconnect','removal','save','stop']){
    const {w,p,q,chest,open,command}=camp(),session=open(p).sessionId;
    if(reason==='close')assert.equal(command(p,{type:'chestClose',chestId:chest.id,sessionId:session}).ok,true);
    if(reason==='expiry')w.time+=CHEST_LEASE_SECONDS;
    if(reason==='range'){p.x+=10;}
    if(reason==='down')w.hurt(p,999);
    if(reason==='quietDown')w.hurtQuiet(p,999);
    if(reason==='disconnect')w.leave(p.id);
    if(reason==='removal')w.buildings=w.buildings.filter(b=>b!==chest);
    if(reason==='stop')w.status='defeat';
    if(reason==='removal'||reason==='stop')w.tick();
    if(reason==='save'){
      const network=World.restore(structuredClone(w.snapshot()));
      assert.equal(network.chestSessions.get(chest.id).sessionId,session);
      const saved=w.snapshot({purpose:'save'});assert.equal(saved.chestBusy,undefined);
      const resumed=World.fromSave({world:{...saved,chestBusy:w.snapshot().chestBusy}});
      assert.equal(resumed.chestSessions.size,0);continue;
    }
    if(reason==='expiry'||reason==='range'){
      const stack=p.inventory.slots.find(slot=>slot?.itemId==='wood'),before=stack.quantity;
      const denied=command(p,{type:'chestTransfer',chestId:chest.id,sessionId:session,sourceContainerId:p.inventory.id,destinationContainerId:chest.store.id,sourceSlot:p.inventory.slots.indexOf(stack),destinationSlot:null,uid:stack.uid,quantity:1,sourceRevision:p.inventory.revision,destinationRevision:chest.store.revision});
      assert.equal(denied.ok,false,reason);
      assert.equal(stack.quantity,before,reason);
      assert.equal(countItem(chest.store,'wood'),0,reason);
    }
    // Release is already true. snapshot() also prunes, so it must not be the only proof.
    assert.equal(w.chestSessions.size,0,reason);
    if(!['removal','stop'].includes(reason))assert.equal(open(q).ok,true,reason);
  }
});

test('renewal is explicit, owner-only, and a stale close cannot release a new session',()=>{
  const {w,p,q,chest,open,command}=camp();const session=open(p).sessionId;
  w.time+=8;
  assert.equal(command(q,{type:'chestRenew',chestId:chest.id,sessionId:session}).code,'notOwner');
  assert.equal(command(p,{type:'chestRenew',chestId:chest.id,sessionId:session}).ok,true);
  w.time+=8;assert.equal(open(q).code,'chestInUse');
  command(p,{type:'chestClose',chestId:chest.id,sessionId:session});
  const next=open(p).sessionId;assert.notEqual(session,next);
  assert.equal(command(p,{type:'chestClose',chestId:chest.id,sessionId:session}).code,'wrongSession');
  assert.equal(w.chestSessions.get(chest.id).sessionId,next);
});

test('T13–T14 locked chest excludes all other actors shared costs and transfer/craft cannot double spend',()=>{
  const {w,p,q,chest,open,command,transfer}=camp();w.clearPack(p);w.clearPack(q);w.stock(chest.store,'wood',3);w.stock(chest.store,'stone',2);
  const session=open(p).sessionId;
  const bench=w.structure('bench',p.x+.4,p.z+.8);w.buildings.push(bench);
  assert.equal(w.available(q,'wood'),0);assert.equal(w.canPay(q,{wood:1}),false);
  assert.equal(w.pay(q,{wood:1}),false);assert.equal(w.available(p,'wood'),3);
  assert.equal(command(q,{type:'craft',recipe:'axe',stationId:bench.id}).ok,false);
  assert.equal(countItem(chest.store,'wood'),3);
  const wood=chest.store.slots.find(s=>s?.itemId==='wood');
  const revision=chest.store.revision;assert.equal(command(p,{type:'craft',recipe:'axe',stationId:bench.id}).ok,true);
  assert.equal(transfer(p,session,chest.store,p.inventory,wood.uid,1,{sourceRevision:revision}).code,'staleRevision');
  assert.equal(countItem(p.inventory,'axe'),1);
  command(p,{type:'chestClose',chestId:chest.id,sessionId:session});
  assert.equal(w.available(q,'wood'),1);assert.equal(w.pay(q,{wood:1}),true);
  assert.equal(countItem(chest.store,'wood'),0);
});

test('locked supplies cannot fuel, repair, upgrade, plant or rearm through old interaction paths',()=>{
  const {w,p,q,chest,open,command}=camp();w.clearPack(q);
  for(const [id,count] of Object.entries({wood:30,stone:20,ember:10,seed:2}))w.stock(chest.store,id,count);
  open(p);const before=copy(chest.store);
  const fire=w.structure('fire',q.x+.2,q.z),wall=w.structure('wall',q.x+.3,q.z),farm=w.structure('farm',q.x+.4,q.z),trap=w.structure('trap',q.x+.5,q.z);
  fire.fuel=0;wall.hp=1;trap.charges=0;w.buildings.push(fire,wall,farm,trap);
  const heart=w.buildings.find(b=>b.type==='hearth');
  for(const cmd of [{type:'interact',target:fire.id},{type:'repair',target:wall.id},{type:'upgrade',target:heart.id},{type:'interact',target:farm.id},{type:'interact',target:trap.id}]){
    q.cooldown=0;command(q,cmd);
  }
  assert.equal(copy(chest.store),before);assert.equal(fire.fuel,0);assert.equal(wall.hp,1);assert.equal(farm.planted,false);assert.equal(trap.charges,0);assert.equal(heart.level,1);
});

test('T15 dismantle cannot bypass a lease; destruction spills exactly once with durability intact',()=>{
  const {w,p,q,chest,open,command}=camp();w.stock(chest.store,'torch',1);chest.store.slots.find(Boolean).durability=12.3;
  const session=open(p).sessionId;
  const hearth=w.buildings.find(b=>b.type==='hearth');
  assert.equal(command(p,{type:'dismantle',target:hearth.id}).ok,false);
  assert.equal(w.buildings.some(b=>b.id===hearth.id),true);
  assert.equal(command(q,{type:'dismantle',target:chest.id}).code,'chestInUse');
  assert.equal(command(p,{type:'dismantle',target:chest.id}).code,'chestInUse');
  assert.equal(countItem(chest.store,'torch'),1);
  chest.hp=0;w.tick();assert.equal(w.chestSessions.size,0);
  assert.equal(w.drops.filter(d=>d.stack.itemId==='torch').length,1);
  assert.equal(w.drops.find(d=>d.stack.itemId==='torch').stack.durability,12.3);
  w.tick();assert.equal(w.drops.filter(d=>d.stack.itemId==='torch').length,1);
  assert.equal(command(p,{type:'chestTransfer',chestId:chest.id,sessionId:session}).ok,false);
});

test('full backpack transfer is atomic; splits, socket swaps and explicit last-cell growth preserve ownership',()=>{
  const {w,p,chest,open,transfer}=camp();const session=open(p).sessionId;
  w.clearPack(p);w.stock(p.inventory,'stone',120);w.stock(chest.store,'berry',2);
  const berry=chest.store.slots.find(Boolean),before=copy([p.inventory,chest.store]);
  assert.equal(transfer(p,session,chest.store,p.inventory,berry.uid).code,'inventoryFull');
  assert.equal(copy([p.inventory,chest.store]),before);
  w.clearPack(p);assert.equal(transfer(p,session,chest.store,p.inventory,berry.uid,1).ok,true);
  assert.equal(totalQuantity(w,'berry'),5); // guest's 3 plus the two stored berries
  const first=w.grantEquipped(p,'axe',7);w.stock(chest.store,'axe',1);
  const replacement=chest.store.slots.find(s=>s?.itemId==='axe');
  assert.equal(transfer(p,session,chest.store,eq(p),replacement.uid,1,{destinationSlot:0}).ok,true);
  assert.equal(p.equipment.chop.uid,replacement.uid);assert.equal(chest.store.slots.some(s=>s?.uid===first.uid&&s.durability===7),true);
  const beforeBad=copy([p.equipment,chest.store]);
  assert.equal(transfer(p,session,chest.store,eq(p),first.uid,1,{destinationSlot:1}).code,'incompatibleSocket');
  assert.equal(copy([p.equipment,chest.store]),beforeBad);
  const slots=chest.store.slots;for(let i=0;i<slots.length-1;i++)if(!slots[i])slots[i]=w.mintStack('wood',20);
  w.give(p,'spear',1);const spear=p.inventory.slots.find(s=>s?.itemId==='spear'),length=slots.length;
  assert.equal(transfer(p,session,p.inventory,chest.store,spear.uid,1,{destinationSlot:length-1}).ok,true);
  assert.equal(chest.store.slots.length,length+6);w.assertItems();
});

test('T11 withdrawItem is gone, so a locked chest cannot be emptied beside the session',()=>{
  const {w,p,q,chest,open}=camp();
  open(p);
  w.stock(chest.store,'wood',4);
  const before=countItem(chest.store,'wood');
  assert.equal(typeof w.withdrawItem,'undefined');
  assert.equal(w.action(q.id,{type:'withdraw',target:chest.id,item:'wood',limit:10}).code,'unsupported');
  assert.equal(countItem(chest.store,'wood'),before);
  assert.equal(w.chestSessions.get(chest.id).ownerId,p.id);
});

test('equipment and transfer actions ignore combat cooldown without resetting it',()=>{
  const {w,p,chest,open,command,transfer}=camp();p.cooldown=5;const session=open(p).sessionId;
  const item=p.inventory.slots.find(Boolean);assert.equal(transfer(p,session,p.inventory,chest.store,item.uid).ok,true);
  w.give(p,'axe',1);const axe=p.inventory.slots.find(s=>s?.itemId==='axe');
  assert.equal(command(p,{type:'equipItem',uid:axe.uid,socket:'chop',inventoryRevision:p.inventory.revision,equipmentRevision:p.equipmentRevision}).ok,true);
  assert.equal(p.cooldown,5);
});
