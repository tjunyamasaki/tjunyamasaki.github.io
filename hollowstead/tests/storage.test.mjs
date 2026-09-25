import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {createActionSession} from '../src/transactions.mjs';
import {CHEST_SLOT_COUNT} from '../src/contracts.mjs';
import {containerId, countItem, createContainer, createRecovery} from '../src/inventory.mjs';

function camp(){
  const w=new World(12), p=w.addPlayer('host'), q=w.addPlayer('guest');
  w.start();
  const chest=w.structure('chest', p.x+1, p.z);
  w.buildings.push(chest);
  return {w, p, q, chest};
}

function runner(w, actor){
  let clock=0, n=0;
  const session=createActionSession({getWorld:()=>w, actorId:actor.id, now:()=>clock});
  return {
    session,
    run(value){
      clock+=60; n+=1;
      return session.execute({...value, requestId:session.sessionId+':'+n, worldId:w.networkId});
    },
    replay(value, sequence){
      return session.execute({...value, requestId:session.sessionId+':'+sequence, worldId:w.networkId});
    },
  };
}

function qty(container, itemId){return countItem(container, itemId);}

test('a thirteenth distinct stack stays on the floor and a saved pack keeps only what does not fit twelve slots', ()=>{
  const {w, p}=camp();
  w.clearPack(p);
  const carried=['wood', 'stone', 'fiber', 'ore', 'ember', 'seed', 'berry', 'pumpkin', 'mushroom', 'meat', 'roast', 'stew'];
  for(const [index, itemId] of carried.entries())p.inventory.slots[index]=w.mintStack(itemId, 1);
  assert.equal(w.give(p, 'bandage', 1), 0);
  assert.equal(qty(p.inventory, 'bandage'), 0);
  assert.equal(p.inventory.slots.length, 12);
  assert.equal(w.drops.filter(drop=>drop.stack.itemId==='bandage').reduce((sum, drop)=>sum+drop.stack.quantity, 0), 1);
  assert.equal(Object.hasOwn(p, 'selection'), false);

  const fitted=structuredClone(w.snapshot({purpose:'save'}));
  const narrow=fitted.players.find(player=>player.id==='host');
  const seven=['wood', 'stone', 'fiber', 'ore', 'ember', 'seed', 'berry'];
  narrow.inventory.slots=seven.map((itemId, index)=>({uid:`fit${index}`, itemId, quantity:1}));
  const fittedWorld=World.restore(fitted);
  const fittedHost=fittedWorld.player('host');
  assert.equal(fittedHost.inventory.slots.length, 12);
  assert.equal(fittedHost.inventory.slots.filter(Boolean).length, 7);
  assert.equal(fittedHost.recovery, null);
  for(const itemId of seven)assert.equal(qty(fittedHost.inventory, itemId), 1, itemId);

  const saved=structuredClone(w.snapshot({purpose:'save'}));
  const record=saved.players.find(player=>player.id==='host');
  const ids=[...carried, 'bandage'];
  record.inventory.slots=ids.map((itemId, index)=>({uid:`legacy${index}`, itemId, quantity:1}));
  const restored=World.restore(saved);
  const host=restored.player('host');
  assert.equal(host.inventory.slots.length, 12);
  assert.equal(host.inventory.slots.filter(Boolean).length, 12);
  assert.equal(host.recovery.slots.filter(Boolean).length, 1);
  assert.equal(host.recovery.slots[0].itemId, 'bandage');
  for(const itemId of ids)assert.equal(qty(host.inventory, itemId)+qty(host.recovery, itemId), 1, itemId);
  const again=World.restore(structuredClone(restored.snapshot({purpose:'save'})));
  assert.equal(again.player('host').inventory.slots.map(stack=>stack?.uid).join(), host.inventory.slots.map(stack=>stack?.uid).join());
  assert.equal(again.player('host').recovery.slots[0].uid, host.recovery.slots[0].uid);
});

test('a chest stays at 24 slots, keeps older rows withdrawable, and rejects a deposit that does not fit', ()=>{
  const {w, p, chest}=camp();
  const saved=structuredClone(w.snapshot({purpose:'save'}));
  const box=saved.buildings.find(building=>building.id===chest.id);
  box.store.slots=Array.from({length:36}, (_, index)=>{
    if(index===2)return {uid:'keep-wood', itemId:'wood', quantity:4};
    if(index===20)return {uid:'kept-fiber', itemId:'fiber', quantity:2};
    if(index===30)return {uid:'extra-ember', itemId:'ember', quantity:3};
    return null;
  });
  const restored=World.restore(saved);
  const chestNow=restored.buildings.find(building=>building.id===chest.id);
  const player=restored.player('host');
  assert.equal(chestNow.store.slots.length, CHEST_SLOT_COUNT);
  assert.equal(CHEST_SLOT_COUNT, 24);
  assert.equal(chestNow.store.slots[1], null);
  assert.equal(chestNow.store.slots[2].uid, 'keep-wood');
  assert.equal(chestNow.store.slots[20].uid, 'kept-fiber');
  assert.equal(chestNow.overflow.slots.map(stack=>stack?.uid).filter(Boolean).join(), 'extra-ember');
  for(let i=0;i<chestNow.store.slots.length;i++)if(!chestNow.store.slots[i])chestNow.store.slots[i]=restored.mintStack('stone', 1);
  const before=JSON.stringify(chestNow.store.slots);
  const overflowBefore=JSON.stringify(chestNow.overflow.slots);
  assert.equal(restored.stock(chestNow.store, 'berry', 1), 0);
  assert.equal(JSON.stringify(chestNow.store.slots), before);
  assert.equal(JSON.stringify(chestNow.overflow.slots), overflowBefore);
  restored.clearPack(player);
  const actor=runner(restored, player);
  const opened=actor.run({type:'chestOpen', chestId:chestNow.id});
  assert.equal(opened.ok, true);
  const moved=actor.run({
    type:'chestTransfer', chestId:chestNow.id, sessionId:opened.sessionId,
    sourceContainerId:chestNow.overflow.id, destinationContainerId:player.inventory.id,
    sourceSlot:0, destinationSlot:null, uid:'extra-ember', quantity:3,
    sourceRevision:chestNow.overflow.revision, destinationRevision:player.inventory.revision,
  });
  assert.equal(moved.ok, true);
  assert.equal(player.inventory.slots.find(stack=>stack?.uid==='extra-ember').quantity, 3);
  assert.equal(chestNow.overflow, null);
  assert.equal(qty(chestNow.store, 'ember')+qty(player.inventory, 'ember'), 3);
  assert.equal(qty(chestNow.store, 'fiber'), 2);
});

test('store all moves whole stacks that fit and leaves the rest in the pack', ()=>{
  const {w, p, q, chest}=camp();
  w.clearPack(p); w.clearPack(q);
  for(let i=0;i<22;i++)chest.store.slots[i]=w.mintStack('stone', 20);
  chest.store.slots[22]=w.mintStack('stone', 19);
  const wood=w.mintStack('wood', 20), fiber=w.mintStack('fiber', 20);
  p.inventory.slots[0]=wood; p.inventory.slots[1]=fiber;
  q.inventory.slots[0]=w.mintStack('stone', 1);
  const guestBefore=JSON.stringify(q.inventory.slots);
  const actor=runner(w, p);
  const opened=actor.run({type:'chestOpen', chestId:chest.id});
  const packRevision=p.inventory.revision, chestRevision=chest.store.revision;
  const command={
    type:'chestStoreAll', chestId:chest.id, sessionId:opened.sessionId,
    inventoryRevision:packRevision, destinationRevision:chestRevision,
  };
  const stored=actor.run(command);
  assert.equal(stored.ok, true);
  assert.equal(p.notice, 'Stored what fit');
  assert.equal(qty(chest.store, 'wood'), 20);
  assert.equal(qty(p.inventory, 'wood'), 0);
  assert.equal(qty(p.inventory, 'fiber'), 20);
  assert.equal(qty(chest.store, 'fiber'), 0);
  assert.equal(qty(chest.store, 'stone'), 459);
  assert.equal(p.inventory.revision, packRevision+1);
  assert.equal(chest.store.revision, chestRevision+1);
  assert.equal(JSON.stringify(q.inventory.slots), guestBefore);
  actor.replay(command, 2);
  assert.equal(qty(chest.store, 'wood'), 20);
  assert.equal(qty(p.inventory, 'fiber'), 20);
  assert.equal(JSON.stringify(q.inventory.slots), guestBefore);
  const stale=actor.run({...command, inventoryRevision:packRevision, destinationRevision:chestRevision});
  assert.equal(stale.code, 'staleRevision');
  assert.equal(qty(p.inventory, 'fiber'), 20);
  const full=runner(w, q);
  const guestOpen=full.run({type:'chestOpen', chestId:chest.id});
  assert.equal(guestOpen.code, 'chestInUse');
  w.chestSessions.delete(chest.id);
  const guestSession=full.run({type:'chestOpen', chestId:chest.id});
  const guestPack=JSON.stringify(p.inventory.slots);
  const guestStore=full.run({
    type:'chestStoreAll', chestId:chest.id, sessionId:guestSession.sessionId,
    inventoryRevision:q.inventory.revision, destinationRevision:chest.store.revision,
  });
  assert.equal(guestStore.ok, true);
  assert.equal(JSON.stringify(p.inventory.slots), guestPack);
  assert.equal(qty(q.inventory, 'stone'), 0);
  assert.equal(qty(chest.store, 'stone'), 460);
});

test('sort combines identical supplies, keeps damaged tools apart, and a guest cannot sort another pack', ()=>{
  const {w, p, q, chest}=camp();
  w.clearPack(p); w.clearPack(q);
  const worn=w.grantEquipped(p, 'pick', 50);
  const saved=w.mintStack('seed', 2);
  p.recovery=createRecovery(p.id, 1);
  p.recovery.slots[0]=saved;
  const loose=w.mintStack('ember', 2);
  const drop=w.placeDrop(loose, p.x+3, p.z);
  const firstAxe=w.mintStack('axe', 1, 10), secondAxe=w.mintStack('axe', 1, 40);
  const woodSmall=w.mintStack('wood', 4), woodLarge=w.mintStack('wood', 6);
  chest.store.slots[0]=woodSmall;
  chest.store.slots[1]=firstAxe;
  chest.store.slots[2]=woodLarge;
  chest.store.slots[3]=secondAxe;
  chest.overflow=createContainer(containerId('overflow', chest.id), 1);
  chest.overflow.slots[0]=w.mintStack('fiber', 5);
  const actor=runner(w, p);
  const opened=actor.run({type:'chestOpen', chestId:chest.id});
  const sortedRevision=chest.store.revision;
  const sorted=actor.run({type:'chestSort', chestId:chest.id, sessionId:opened.sessionId, destinationRevision:sortedRevision});
  assert.equal(sorted.ok, true);
  assert.equal(chest.store.revision, sortedRevision+1);
  assert.equal(chest.store.slots.filter(stack=>stack?.itemId==='axe').length, 2);
  assert.equal(qty(chest.store, 'wood'), 10);
  assert.equal(chest.store.slots.filter(stack=>stack?.itemId==='wood').length, 1);
  const rejectedStack=actor.run({type:'chestStack', chestId:chest.id, sessionId:opened.sessionId, destinationRevision:chest.store.revision});
  assert.equal(rejectedStack.code, 'unsupported');
  assert.equal(chest.store.revision, sortedRevision+1);
  assert.deepEqual(chest.store.slots.filter(Boolean).map(stack=>stack.uid), [firstAxe.uid, secondAxe.uid, woodSmall.uid]);
  assert.equal(chest.store.slots.find(stack=>stack?.uid===firstAxe.uid).durability, 10);
  assert.equal(chest.store.slots.find(stack=>stack?.uid===secondAxe.uid).durability, 40);
  const again=actor.run({type:'chestSort', chestId:chest.id, sessionId:opened.sessionId, destinationRevision:chest.store.revision});
  assert.equal(again.ok, true);
  assert.equal(chest.store.revision, sortedRevision+1);
  assert.equal(chest.overflow.slots[0].quantity, 5);
  assert.equal(p.equipment.mine.uid, worn.uid);
  assert.equal(p.recovery.slots[0].uid, saved.uid);
  assert.equal(drop.flight, undefined);
  assert.equal(drop.stack.quantity, 2);

  p.inventory.slots[0]=w.mintStack('stone', 1);
  p.inventory.slots[1]=w.mintStack('fiber', 1);
  q.inventory.slots[0]=w.mintStack('wood', 2);
  q.inventory.slots[1]=w.mintStack('fiber', 3);
  const hostBefore=JSON.stringify(p.inventory.slots);
  const guest=runner(w, q);
  const guestSort=guest.run({type:'packSort', inventoryRevision:q.inventory.revision, sourceContainerId:p.inventory.id});
  assert.equal(guestSort.ok, true);
  assert.equal(JSON.stringify(p.inventory.slots), hostBefore);
  assert.deepEqual(q.inventory.slots.filter(Boolean).map(stack=>stack.itemId), ['fiber', 'wood']);
  const host=runner(w, p);
  const packRevision=p.inventory.revision;
  const packSort=host.run({type:'packSort', inventoryRevision:packRevision});
  assert.equal(packSort.ok, true);
  assert.deepEqual(p.inventory.slots.filter(Boolean).map(stack=>stack.itemId), ['fiber', 'stone']);
  assert.equal(p.equipment.mine.uid, worn.uid);
  assert.equal(p.recovery.slots[0].uid, saved.uid);
  assert.equal(drop.stack.quantity, 2);
  assert.equal(drop.flight, undefined);
  const repeat=host.run({type:'packSort', inventoryRevision:p.inventory.revision});
  assert.equal(repeat.ok, true);
  assert.equal(p.inventory.revision, packRevision+1);
  const packWoodA=w.mintStack('wood', 3), packWoodB=w.mintStack('wood', 4);
  const packAxeA=w.mintStack('axe', 1, 11), packAxeB=w.mintStack('axe', 1, 22);
  w.clearPack(p);
  p.inventory.slots[0]=packWoodA;
  p.inventory.slots[1]=packAxeA;
  p.inventory.slots[2]=packWoodB;
  p.inventory.slots[3]=packAxeB;
  const combinedRevision=p.inventory.revision;
  const combined=host.run({type:'packSort', inventoryRevision:combinedRevision});
  assert.equal(combined.ok, true);
  assert.deepEqual(p.inventory.slots.filter(Boolean).map(stack=>[stack.uid, stack.quantity, stack.durability??null]), [
    [packAxeA.uid, 1, 11],
    [packAxeB.uid, 1, 22],
    [packWoodA.uid, 7, null],
  ]);
  assert.equal(p.equipment.mine.uid, worn.uid);
  assert.equal(p.recovery.slots[0].uid, saved.uid);
});
