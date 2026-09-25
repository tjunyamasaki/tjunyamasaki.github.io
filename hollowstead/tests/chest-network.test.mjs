import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {phaseAt} from '../src/content.mjs';
import {createNetwork} from '../src/network.mjs';
import {harness,flush} from './network-harness.mjs';

test('N01/N03–N05 real protocol wrapper: two peers race for chest, move items, join late, disconnect and rejoin',async()=>{
  const h=harness(),w=new World(71);w.addPlayer('host');w.start();
  const chest=w.structure('chest',3,2);w.buildings.push(chest);
  const opts={signaling:h.signal,PeerConnection:h.PC},host=createNetwork({...opts,getWorld:()=>w}),guests=[];
  const join=async(identity)=>{
    const record={};record.net=createNetwork({...opts,identity,onReady:id=>record.id=id,onFrame:frame=>record.frame=World.restore(frame)});
    guests.push(record.net);await record.net.join('ABCDE','Friend','moss');await flush();return record;
  };
  try{
    await host.host();const a=await join(),b=await join();
    const openingA=a.net.action({type:'chestOpen',chestId:chest.id}),openingB=b.net.action({type:'chestOpen',chestId:chest.id});
    const [grant,busy]=await Promise.all([openingA,openingB]);assert.equal(grant.ok,true);assert.equal(busy.code,'chestInUse');
    const actor=a.frame.player(a.id),wood=actor.inventory.slots.find(s=>s?.itemId==='wood'),store=a.frame.buildings.find(c=>c.id===chest.id).store;
    const moved=await a.net.action({type:'chestTransfer',chestId:chest.id,sessionId:grant.sessionId,sourceContainerId:actor.inventory.id,sourceSlot:actor.inventory.slots.indexOf(wood),destinationContainerId:store.id,destinationSlot:null,uid:wood.uid,quantity:2,sourceRevision:actor.inventory.revision,destinationRevision:store.revision});
    assert.equal(moved.ok,true);assert.equal(w.count(w.player(a.id),'wood'),1);
    assert.equal(a.frame.count(a.frame.player(a.id),'wood'),1);
    const attempted=await b.net.action({type:'inventoryMove',playerId:a.id,sourceContainerId:actor.inventory.id,sourceSlot:0,destinationContainerId:b.frame.player(b.id).inventory.id,destinationSlot:20,uid:wood.uid,quantity:1,sourceRevision:actor.inventory.revision,destinationRevision:b.frame.player(b.id).inventory.revision});
    assert.equal(attempted.code,'notOwner');assert.equal(w.count(w.player(b.id),'wood'),3);
    w.grantEquipped(w.player(a.id),'spear',55);
    w.dropNew('stone',2,6,6);
    w.time=160;
    w.chestSessions.get(chest.id).expiresAt=w.time+12;
    const late=await join();
    assert.equal(late.frame.chestSessions.get(chest.id).ownerId,a.id);
    assert.equal(late.frame.player(a.id).equipment.weapon.itemId,'spear');
    assert.equal(late.frame.player(a.id).equipment.weapon.durability,55);
    assert.equal(late.frame.drops.some(drop=>drop.stack.itemId==='stone'&&drop.stack.quantity===2),true);
    assert.equal(late.frame.time,160);
    assert.equal(phaseAt(late.frame.time),'dusk');
    const wire=h.traffic.find(x=>x.message.type==='hello').channel;
    wire.send('{bad JSON');wire.send(JSON.stringify({type:'action',value:{requestId:'forged'}}));await flush();
    assert.equal(w.chestSessions.get(chest.id).ownerId,a.id);
    await a.net.stop();await flush();assert.equal(w.chestSessions.has(chest.id),false);
    assert.equal((await b.net.action({type:'chestOpen',chestId:chest.id})).ok,true);
    const back=await join(a.id);assert.equal(back.frame.count(back.frame.player(a.id),'wood'),1);
    assert.equal((await back.net.action({type:'chestOpen',chestId:chest.id})).code,'chestInUse');
    assert.equal(w.players.length,4);
  }finally{for(const g of guests)await g.stop();await host.stop();}
  for(const listeners of h.events.values())assert.equal(listeners.size,0);
});

test('N07/N08 transport heartbeat, host pause and explicit old inventory-path rejection remain operational',async()=>{
  const h=harness(),w=new World(8);w.addPlayer('host');w.start();
  const opts={signaling:h.signal,PeerConnection:h.PC},status=[];
  const host=createNetwork({...opts,getWorld:()=>w}),guest=createNetwork({...opts,onStatus:s=>status.push(s)});
  try{
    await host.host();await guest.join('ABCDE','Friend','moss');await flush();
    guest.ping();await flush();assert.ok(status.some(s=>/ms$/.test(s)));
    for(const type of ['eat','deposit','withdraw','equip','drop','recover'])assert.equal((await guest.action({type})).code,'unsupported',type);
    const before=w.events.length;assert.equal((await guest.action({type:'ping',text:'Here!'})).code,'unsupported');assert.equal(w.events.length,before);assert.equal(w.events.some(event=>event.type==='ping'),false);
    const guestPlayer=w.players.find(p=>p.id!=='host');const bench=w.structure('bench',guestPlayer.x+1,guestPlayer.z);w.buildings.push(bench);
    assert.equal((await guest.action({type:'craft',recipe:'axe'})).code,'stationRequired');assert.equal(w.player(guestPlayer.id).inventory.slots.some(stack=>stack?.itemId==='axe'),false);
    host.pause(true);await flush();assert.equal((await guest.action({type:'craft',recipe:'axe',stationId:bench.id})).code,'paused');
    host.pause(false);await flush();assert.equal((await guest.action({type:'craft',recipe:'axe',stationId:bench.id})).ok,true);
  }finally{await guest.stop();await host.stop();}
});

test('N08 old v1 and P1-v2 clients receive a refresh failure before playing',async()=>{
  for(const legacy of ['v1','p1']){
    const h=harness({mapMessage:m=>m.type==='hello'?{...m,protocol:legacy==='v1'?'hollowstead-1':m.protocol,transactions:undefined}:undefined});
    const w=new World(1);w.addPlayer('host');let message;
    const opts={signaling:h.signal,PeerConnection:h.PC},host=createNetwork({...opts,getWorld:()=>w}),guest=createNetwork({...opts,onLeave:m=>message=m});
    try{await host.host();await guest.join('ABCDE','Friend','moss');await flush();assert.match(message,/Refresh the page/);assert.equal(w.players.length,1);}
    finally{await guest.stop();await host.stop();}
  }
});
