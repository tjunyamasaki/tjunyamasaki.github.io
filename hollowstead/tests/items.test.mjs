import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {World} from '../src/engine.mjs';
import {EQUIPMENT, ITEMS, NODES, PICKUP, RULES, phaseAt} from '../src/content.mjs';
import {
  CLOCK_V1, CLOCK_V2, EQUIPMENT_SLOTS, STACK_LIMIT, V1_PHASE, V2_PHASE,
  nextNightWaveTime, phaseProgress, remapPhaseTime,
} from '../src/contracts.mjs';
import {
  collectLocations, countItem, createRecovery, duplicateUids, itemSpriteKey, makeStack,
  planInsert, planMove, supplyLoad, wearStack,
} from '../src/inventory.mjs';
import {chunkSnapshot, joinSnapshot, migrateV1Save, planContinue, remapWorldClock} from '../src/serialization.mjs';

const fixtureDir = new URL('./fixtures/', import.meta.url);
const readFixture = name => readFileSync(new URL(name, fixtureDir), 'utf8');
const loadFixture = name => JSON.parse(readFixture(name));

function camp(){const w=new World(402);const p=w.addPlayer('host','Jun');w.start();return {w,p};}
function act(w,p,cmd){p.cooldown=0;return w.action(p.id,cmd);}
function hold(w,p,target,seconds,extra={}){
  let left=seconds;
  while(left>1e-8){
    const dt=Math.min(RULES.tick, left);
    w.input(p.id,{x:extra.x||0,z:extra.z||0,act:extra.act!==false,attack:!!extra.attack,target});
    w.tick(dt);
    left-=dt;
  }
}
function nearDurability(actual,expected){assert.ok(Math.abs(actual-expected)<1e-6,`${actual} vs ${expected}`);}
function sim(w,seconds){let left=seconds;while(left>1e-8){const dt=Math.min(RULES.tick,left);w.tick(dt);left-=dt;}}
function qty(container,itemId){return countItem(container,itemId);}
function owned(world){return duplicateUids(collectLocations(world));}
function stackOf(container,itemId){return container?.slots?.find(stack=>stack?.itemId===itemId);}
function setPack(w,p,counts){w.clearPack(p);for(const [itemId,count] of Object.entries(counts))assert.equal(w.stock(p.inventory,itemId,count),count);}
function itemIds(){return [...Object.keys(ITEMS), ...Object.keys(EQUIPMENT)];}
function v1Sum(world,itemId){
  let total=0;
  for(const player of world.players){
    total+=player.inventory[itemId]||0;
    if((player.equipment[itemId]||0)>0)total+=1;
  }
  for(const building of world.buildings)total+=building.store?.[itemId]||0;
  for(const drop of world.drops)if(drop.type===itemId)total+=drop.count;
  return total;
}
function v2Sum(world,itemId){
  return collectLocations(world).reduce((total,row)=>total+(row.stack.itemId===itemId?row.stack.quantity:0),0);
}
function durabilityRows(player){
  const rows=[];
  for(const slot of EQUIPMENT_SLOTS)if(player.equipment[slot])rows.push([player.equipment[slot].itemId, player.equipment[slot].durability]);
  for(const stack of player.inventory?.slots||[])if(stack?.durability!=null)rows.push([stack.itemId, stack.durability]);
  for(const stack of player.recovery?.slots||[])if(stack?.durability!=null)rows.push([stack.itemId, stack.durability]);
  return rows.sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]);
}
function v1Durability(player){
  return Object.entries(player.equipment).filter(([,durability])=>durability>0).map(([itemId,durability])=>[itemId,durability]).sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]);
}

test('T01 two axes keep independent identity through craft, move, equip, drop, pickup, and save',()=>{
  const {w,p}=camp();
  setPack(w,p,{wood:8,stone:8});
  const bench=w.structure('bench',p.x+1,p.z);w.buildings.push(bench);
  assert.equal(act(w,p,{type:'craft',recipe:'axe'}).ok,false);
  assert.equal(p.inventory.slots.some(stack=>stack?.itemId==='axe'),false);
  act(w,p,{type:'craft',recipe:'axe',stationId:bench.id});
  act(w,p,{type:'craft',recipe:'axe',stationId:bench.id});
  const axes=p.inventory.slots.filter(stack=>stack?.itemId==='axe');
  assert.equal(axes.length,2);
  assert.equal(p.equipment.chop,null);
  assert.equal(p.lantern,false);
  assert.notEqual(axes[0].uid,axes[1].uid);
  assert.equal(axes[0].durability,EQUIPMENT.axe.durability);
  assert.equal(axes[1].durability,EQUIPMENT.axe.durability);
  const wornUid=axes[0].uid, spareUid=axes[1].uid;
  act(w,p,{type:'equip',uid:wornUid});
  assert.equal(p.equipment.chop.uid,wornUid);
  assert.equal(p.inventory.slots.some(stack=>stack?.uid===wornUid),false);
  const tree=w.nodes.find(node=>node.type==='tree');
  p.x=tree.x;p.z=tree.z+1;
  act(w,p,{type:'interact',target:tree.id});
  assert.equal(tree.ready,0);
  assert.equal(p.equipment.chop.durability,EQUIPMENT.axe.durability);
  hold(w,p,tree.id,1);
  assert.equal(tree.ready>w.time,false);
  nearDurability(p.equipment.chop.durability,EQUIPMENT.axe.durability-1);
  assert.equal(stackOf(p.inventory,'axe').uid,spareUid);
  assert.equal(stackOf(p.inventory,'axe').durability,EQUIPMENT.axe.durability);
  const from=p.inventory.slots.findIndex(stack=>stack?.uid===spareUid);
  const to=p.inventory.slots.findIndex(stack=>stack==null);
  const moved=w.moveSlots(p,from,to,spareUid,1);
  assert.equal(moved.ok,true);
  assert.equal(p.inventory.slots[to].uid,spareUid);
  assert.equal(p.inventory.slots[to].durability,EQUIPMENT.axe.durability);
  act(w,p,{type:'drop',uid:wornUid,quantity:1});
  assert.equal(p.equipment.chop,null);
  const drop=w.drops.find(entry=>entry.stack.uid===wornUid);
  nearDurability(drop.stack.durability,EQUIPMENT.axe.durability-1);
  p.goal=null;
  sim(w,PICKUP.dropCooldown+PICKUP.dwell+PICKUP.flight+0.15);
  assert.equal(w.drops.some(entry=>entry.stack?.uid===wornUid),false);
  nearDurability(p.inventory.slots.find(stack=>stack?.uid===wornUid).durability,EQUIPMENT.axe.durability-1);
  const restored=World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  const again=restored.player('host');
  nearDurability(again.inventory.slots.find(stack=>stack?.uid===wornUid).durability,EQUIPMENT.axe.durability-1);
  assert.equal(again.inventory.slots.find(stack=>stack?.uid===spareUid).durability,EQUIPMENT.axe.durability);
  assert.equal(owned(restored).length,0);
});

test('T02 merge, split, and swap conserve quantities and give every UID one owner',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const first=w.mintStack('wood',8), second=w.mintStack('wood',12), berries=w.mintStack('berry',4);
  p.inventory.slots[0]=first;p.inventory.slots[1]=second;p.inventory.slots[2]=berries;
  const merged=planMove({source:p.inventory,destination:p.inventory,sourceSlot:0,destinationSlot:1,uid:first.uid,quantity:8,mintUid:()=>w.nextItemUid(),destSupplyCapacity:120,sourceSupplyCapacity:120});
  assert.equal(merged.ok,true);
  p.inventory.slots=merged.sourceSlots;p.inventory.revision=merged.sourceRevision;
  assert.equal(qty(p.inventory,'wood'),20);
  assert.equal(p.inventory.slots[1].uid,second.uid);
  assert.equal(p.inventory.slots.some(stack=>stack?.uid===first.uid),false);
  const split=planMove({source:p.inventory,destination:p.inventory,sourceSlot:1,destinationSlot:0,uid:second.uid,quantity:7,mintUid:()=>w.nextItemUid(),destSupplyCapacity:120,sourceSupplyCapacity:120});
  assert.equal(split.ok,true);
  p.inventory.slots=split.sourceSlots;p.inventory.revision=split.sourceRevision;
  assert.equal(p.inventory.slots[1].quantity+p.inventory.slots[0].quantity,20);
  assert.equal(p.inventory.slots[1].uid,second.uid);
  assert.notEqual(p.inventory.slots[0].uid,second.uid);
  const woodSlot=p.inventory.slots.findIndex(stack=>stack?.itemId==='wood'&&stack.quantity===p.inventory.slots[1].quantity?stack.uid===second.uid:false);
  const berrySlot=p.inventory.slots.findIndex(stack=>stack?.uid===berries.uid);
  const woodUid=p.inventory.slots[1].uid;
  const swapped=planMove({source:p.inventory,destination:p.inventory,sourceSlot:1,destinationSlot:berrySlot,uid:woodUid,quantity:p.inventory.slots[1].quantity,mintUid:()=>w.nextItemUid(),destSupplyCapacity:120,sourceSupplyCapacity:120});
  assert.equal(swapped.ok,true);
  p.inventory.slots=swapped.sourceSlots;
  assert.equal(p.inventory.slots[berrySlot].uid,woodUid);
  assert.equal(p.inventory.slots[1].uid,berries.uid);
  assert.equal(qty(p.inventory,'wood')+qty(p.inventory,'berry'),24);
  assert.equal(owned(w).length,0);
  assert.equal(woodSlot===-1||woodSlot===1,true);
});

test('T03 rejected transfers leave both containers unchanged',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  assert.equal(w.stock(p.inventory,'wood',120),120);
  const chest=w.structure('chest',p.x+1,p.z);
  w.buildings.push(chest);
  assert.equal(w.stock(chest.store,'fiber',5),5);
  const beforePack=JSON.stringify(p.inventory.slots);
  const beforeChest=JSON.stringify(chest.store.slots);
  const empty=p.inventory.slots.findIndex(stack=>stack==null);
  const source=chest.store.slots.findIndex(stack=>stack?.itemId==='fiber');
  const blocked=w.moveBetween(chest.store,p.inventory,source,empty,chest.store.slots[source].uid,5,undefined,undefined,{destSupplyCapacity:120,sourceSupplyCapacity:null});
  assert.equal(blocked.ok,false);
  assert.equal(JSON.stringify(p.inventory.slots),beforePack);
  assert.equal(JSON.stringify(chest.store.slots),beforeChest);
  const stale=planMove({source:p.inventory,destination:p.inventory,sourceSlot:0,destinationSlot:1,uid:p.inventory.slots[0].uid,quantity:1,sourceRevision:p.inventory.revision+9,mintUid:()=>w.nextItemUid()});
  assert.equal(stale.code,'staleRevision');
  assert.equal(JSON.stringify(p.inventory.slots),beforePack);
  for(const quantity of [0,-1,1.5,65]){
    const bad=planMove({source:p.inventory,destination:p.inventory,sourceSlot:0,destinationSlot:empty,uid:p.inventory.slots[0].uid,quantity,mintUid:()=>w.nextItemUid()});
    assert.equal(bad.ok,false);
  }
  for(const sourceSlot of [-1,24,1.2]){
    const bad=planMove({source:p.inventory,destination:p.inventory,sourceSlot,destinationSlot:0,uid:p.inventory.slots[0].uid,quantity:1,mintUid:()=>w.nextItemUid()});
    assert.equal(bad.ok,false);
  }
  const proto=planMove({source:p.inventory,destination:p.inventory,sourceSlot:0,destinationSlot:empty,uid:'__proto__',quantity:1,mintUid:()=>w.nextItemUid()});
  assert.equal(proto.ok,false);
  assert.equal(makeStack('__proto__','wood',1).ok,false);
  assert.equal(makeStack('safe','__proto__',1).ok,false);
  assert.equal(makeStack('safe','constructor',1).ok,false);
  assert.equal(JSON.stringify(p.inventory.slots),beforePack);
  assert.equal(JSON.stringify(chest.store.slots),beforeChest);
  assert.equal(owned(w).length,0);
});

test('stackable supplies reach 64 and tools stay unstacked',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  assert.equal(makeStack('wood-64','wood',64).ok,true);
  assert.equal(makeStack('wood-65','wood',65).ok,false);
  assert.equal(makeStack('axe-2','axe',2).ok,false);
  assert.equal(w.stock(p.inventory,'wood',64),64);
  assert.equal(p.inventory.slots.filter(Boolean).length,1);
  assert.equal(w.stock(p.inventory,'wood',1),1);
  assert.equal(p.inventory.slots.filter(stack=>stack?.itemId==='wood').length,2);
});

test('T04 slot count limits the backpack, and worn gear uses no pack slot',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  assert.equal(p.inventory.slots.length,12);
  const full=p.inventory.slots.length*STACK_LIMIT;
  assert.equal(w.stock(p.inventory,'wood',full),full);
  assert.equal(w.stock(p.inventory,'stone',1),0);
  assert.equal(supplyLoad(p.inventory),full);
  assert.equal(p.inventory.slots.filter(Boolean).length,12);
  assert.ok(w.grantEquipped(p,'axe',70));
  assert.equal(supplyLoad(p.inventory),full);
  assert.equal(p.inventory.slots.length,12);
  assert.equal(p.equipment.chop.itemId,'axe');
  w.clearPack(p);
  for(let i=0;i<p.inventory.slots.length;i++)p.inventory.slots[i]=w.mintStack('spear',1,EQUIPMENT.spear.durability);
  assert.equal(w.stock(p.inventory,'fiber',1),0);
  assert.equal(qty(p.inventory,'fiber'),0);
  assert.equal(w.drops.some(drop=>drop.stack.itemId==='fiber'),false);
  assert.equal(w.give(p,'berry',1),0);
  assert.equal(w.drops.some(drop=>drop.stack.itemId==='berry'),true);
  assert.equal(qty(p.inventory,'berry'),0);
  assert.ok(w.grantEquipped(p,'pick',70));
  assert.equal(p.inventory.slots.filter(Boolean).length,12);
  assert.equal(p.inventory.slots.length,12);
  assert.equal(supplyLoad(p.inventory),0);
  assert.equal(owned(w).length,0);
});

test('T05 equip swap uses the source slot and unequip fails when the backpack is full',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const first=w.mintStack('axe',1,70), second=w.mintStack('axe',1,40);
  p.inventory.slots[0]=first;p.inventory.slots[1]=second;
  assert.equal(w.equip(p,first.uid).ok,true);
  assert.equal(p.equipment.chop.uid,first.uid);
  assert.equal(w.equip(p,second.uid).ok,true);
  assert.equal(p.equipment.chop.uid,second.uid);
  assert.equal(p.equipment.chop.durability,40);
  assert.equal(p.inventory.slots[1].uid,first.uid);
  assert.equal(p.inventory.slots[1].durability,70);
  for(let i=0;i<p.inventory.slots.length;i++)if(!p.inventory.slots[i])p.inventory.slots[i]=w.mintStack('pick',1,70);
  assert.equal(p.inventory.slots.every(Boolean),true);
  const before=p.equipment.chop.uid;
  const removed=w.unequip(p,'chop',before);
  assert.equal(removed.ok,false);
  assert.equal(removed.code,'inventoryFull');
  assert.equal(p.equipment.chop.uid,before);
  assert.equal(p.equipment.chop.durability,40);
  assert.equal(owned(w).length,0);
});

test('T06 only the equipped tool, weapon, and armor change the outcome',()=>{
  const chop=(where,seconds)=>{
    const {w,p}=camp();
    const tree=w.nodes.find(node=>node.type==='tree');
    p.x=tree.x;p.z=tree.z+1;
    if(where==='pack'){w.clearPack(p);p.inventory.slots[0]=w.mintStack('axe',1,70);}
    if(where==='worn')w.grantEquipped(p,'axe',70);
    hold(w,p,tree.id,seconds);
    const wood=w.drops.filter(drop=>drop.stack.itemId==='wood').reduce((total,drop)=>total+drop.stack.quantity,0);
    return {ready:tree.ready>w.time, hits:tree.hits, wood, durability:where==='worn'?p.equipment.chop?.durability:p.inventory.slots.find(stack=>stack?.itemId==='axe')?.durability};
  };
  assert.equal(chop(null,2).ready,false);
  assert.equal(chop(null,2).hits,NODES.tree.hits);
  assert.equal(chop('pack',2).ready,false);
  assert.equal(chop('pack',2).durability,70);
  assert.equal(chop('worn',1).ready,false);
  nearDurability(chop('worn',1).durability,69);
  assert.equal(chop('worn',2).ready,true);
  assert.equal(chop('worn',2).wood,5);
  assert.equal(chop('worn',2).hits,0);

  const {w,p}=camp();
  const ore=w.nodes.find(node=>node.type==='ore');
  p.x=ore.x;p.z=ore.z+1;
  p.inventory.slots[0]=w.mintStack('pick',1,70);
  hold(w,p,ore.id,1);
  assert.equal(ore.hits,NODES.ore.hits);
  assert.equal(ore.ready,0);
  assert.equal(p.inventory.slots[0].durability,70);

  const strike=(where)=>{
    const world=camp();
    world.w.spawnEnemy('crawler',world.p.x+1,world.p.z);
    if(where==='pack')world.p.inventory.slots[0]=world.w.mintStack('sword',1,160);
    if(where==='worn')world.w.grantEquipped(world.p,'sword',160);
    act(world.w,world.p,{type:'attack'});
    return {hp:world.w.enemies[0].hp, durability:where==='worn'?world.p.equipment.weapon.durability:world.p.inventory.slots.find(stack=>stack?.itemId==='sword')?.durability};
  };
  assert.equal(strike(null).hp,39);
  assert.equal(strike('pack').hp,39);
  assert.equal(strike('pack').durability,160);
  assert.equal(strike('worn').hp,48-EQUIPMENT.sword.damage);
  assert.equal(strike('worn').durability,159);

  const blow=(where)=>{
    const world=camp();
    if(where==='pack')world.p.inventory.slots[0]=world.w.mintStack('armor',1,110);
    if(where==='worn')world.w.grantEquipped(world.p,'armor',110);
    world.w.hurt(world.p,20);
    return {hp:world.p.hp, durability:where==='worn'?world.p.equipment.body.durability:world.p.inventory.slots.find(stack=>stack?.itemId==='armor')?.durability};
  };
  assert.equal(blow(null).hp,80);
  assert.equal(blow('pack').hp,80);
  assert.equal(blow('pack').durability,110);
  assert.equal(blow('worn').hp,89);
  assert.equal(blow('worn').durability,90);
});

test('T07 explicit food selection consumes that stack and bare eat chooses nothing',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const first=w.mintStack('berry',2), second=w.mintStack('berry',3), stew=w.mintStack('stew',1);
  p.inventory.slots[0]=first;p.inventory.slots[1]=second;p.inventory.slots[2]=stew;
  p.hunger=10;p.hp=90;
  const revision=p.inventory.revision;
  act(w,p,{type:'eat'});
  assert.equal(p.hunger,10);
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===second.uid).quantity,3);
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===stew.uid).quantity,1);
  act(w,p,{type:'use',uid:'missing-food',inventoryRevision:revision});
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===first.uid).quantity,2);
  act(w,p,{type:'use',uid:second.uid,inventoryRevision:revision});
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===second.uid).quantity,2);
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===first.uid).quantity,2);
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===stew.uid).quantity,1);
  assert.equal(p.hunger,22);
  act(w,p,{type:'use',uid:second.uid,inventoryRevision:revision});
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===second.uid).quantity,2);
  assert.equal(owned(w).length,0);
});

test('T08 moving the lit lantern turns it off and keeps its fuel',()=>{
  const {w,p}=camp();
  setPack(w,p,{wood:2,fiber:3});
  const bench=w.structure('bench',p.x+1,p.z);w.buildings.push(bench);
  assert.equal(act(w,p,{type:'craft',recipe:'torch'}).code,'stationRequired');
  assert.equal(qty(p.inventory,'wood'),2);
  act(w,p,{type:'craft',recipe:'torch',stationId:bench.id});
  assert.equal(p.lantern,false);
  assert.equal(p.equipment.light,null);
  const crafted=stackOf(p.inventory,'torch');
  assert.equal(crafted.durability,EQUIPMENT.torch.durability);
  act(w,p,{type:'lantern'});
  assert.equal(p.lantern,true);
  assert.equal(p.equipment.light.uid,crafted.uid);
  const spare=w.mintStack('torch',1,50);
  const open=p.inventory.slots.findIndex(stack=>stack==null);
  p.inventory.slots[open]=spare;
  act(w,p,{type:'equip',uid:spare.uid});
  assert.equal(p.lantern,false);
  assert.equal(p.equipment.light.uid,spare.uid);
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===crafted.uid).durability,EQUIPMENT.torch.durability);
  act(w,p,{type:'lantern'});
  assert.equal(p.lantern,true);
  act(w,p,{type:'drop',uid:spare.uid,quantity:1});
  assert.equal(p.lantern,false);
  assert.equal(p.equipment.light,null);
  const dropped=w.drops.find(drop=>drop.stack.uid===spare.uid);
  assert.equal(dropped.stack.durability,50);
  p.goal=null;
  sim(w,PICKUP.dropCooldown+PICKUP.dwell+PICKUP.flight+0.15);
  assert.equal(p.lantern,false);
  assert.equal(p.inventory.slots.find(stack=>stack?.uid===spare.uid).durability,50);

  const guest=w.addPlayer('guest');
  w.clearPack(guest);
  const fuel=p.inventory.slots.find(stack=>stack?.uid===spare.uid);
  act(w,p,{type:'equip',uid:spare.uid});
  act(w,p,{type:'lantern'});
  assert.equal(p.lantern,true);
  assert.equal(w.transferAll(p,spare.uid,guest.inventory,{supplyCapacity:120}),true);
  assert.equal(p.lantern,false);
  assert.equal(guest.lantern,false);
  assert.equal(guest.inventory.slots.find(stack=>stack?.uid===spare.uid).durability,fuel.durability);

  const chest=w.structure('chest',p.x+1,p.z);
  w.buildings.push(chest);
  w.grantEquipped(p,'torch',12.5);
  p.lantern=true;
  assert.equal(w.transferAll(p,p.equipment.light.uid,chest.store,{grow:true}),true);
  assert.equal(p.lantern,false);
  assert.equal(stackOf(chest.store,'torch').durability,12.5);
  const emptyTorch=wearStack(makeStack('spent-torch','torch',1,1).stack,1);
  assert.equal(emptyTorch.removed,false);
  assert.equal(emptyTorch.stack.durability,0);
  const broken=wearStack(makeStack('spent-axe','axe',1,1).stack,1);
  assert.equal(broken.stack,null);
  assert.equal(broken.removed,true);
  assert.equal(itemSpriteKey('torch'),'lantern');
  assert.equal(itemSpriteKey('ember'),'soul');
  assert.equal(owned(w).length,0);
});

test('T18 craft is all or nothing, and success creates a new item',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const uids=new Set();
  for(let i=0;i<p.inventory.slots.length;i++){const stack=w.mintStack('axe',1,70);p.inventory.slots[i]=stack;uids.add(stack.uid);}
  const chest=w.structure('chest',p.x+1,p.z);
  const bench=w.structure('bench',p.x+1.5,p.z+1.2);
  w.buildings.push(chest,bench);
  assert.equal(w.stock(chest.store,'wood',4),4);
  assert.equal(w.stock(chest.store,'stone',4),4);
  const before=JSON.stringify(chest.store);
  const blocked=act(w,p,{type:'craft',recipe:'axe',stationId:bench.id});
  assert.equal(blocked.code,'inventoryFull');
  assert.equal(JSON.stringify(chest.store),before);
  assert.equal(p.inventory.slots.filter(stack=>stack?.itemId==='axe').length,12);
  p.inventory.slots[0]=null;
  assert.equal(act(w,p,{type:'craft',recipe:'axe',stationId:bench.id}).ok,true);
  assert.equal(qty(chest.store,'wood'),2);
  assert.equal(qty(chest.store,'stone'),2);
  const created=p.inventory.slots.find(stack=>stack&&!uids.has(stack.uid));
  assert.equal(created.itemId,'axe');
  assert.equal(created.durability,70);
  assert.equal(p.equipment.chop,null);
  assert.equal(owned(w).length,0);
});

test('T25 a full pack can still finish a chop, and pickup leaves the exact remainder',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const full=p.inventory.slots.length*STACK_LIMIT;
  assert.equal(w.stock(p.inventory,'wood',full),full);
  const tree=w.nodes.find(node=>node.type==='tree');
  p.x=tree.x;p.z=tree.z+1;
  const hits=tree.hits;
  for(let i=0;i<12;i++)act(w,p,{type:'interact',target:tree.id});
  assert.equal(tree.hits,hits);
  assert.equal(tree.ready,0);
  assert.equal(w.drops.length,0);
  hold(w,p,tree.id,1);
  assert.equal(tree.hits,hits);
  assert.equal(w.drops.length,0);
  hold(w,p,tree.id,3);
  assert.ok(tree.ready>w.time);
  assert.equal(tree.hits,0);
  assert.equal(qty(p.inventory,'wood'),full);
  assert.equal(qty(p.inventory,'fiber'),0);
  assert.equal(w.drops.filter(drop=>drop.stack.itemId==='wood').reduce((total,drop)=>total+drop.stack.quantity,0),5);
  assert.equal(w.drops.filter(drop=>drop.stack.itemId==='fiber').reduce((total,drop)=>total+drop.stack.quantity,0),1);

  const other=camp();
  other.w.clearPack(other.p);
  const otherFull=other.p.inventory.slots.length*STACK_LIMIT;
  assert.equal(other.w.stock(other.p.inventory,'wood',otherFull-5),otherFull-5);
  const pile=other.w.mintStack('wood',12);
  const drop=other.w.placeDrop(pile,other.p.x,other.p.z);
  sim(other.w,PICKUP.flight+RULES.tick*2);
  assert.equal(qty(other.p.inventory,'wood'),otherFull);
  const left=other.w.drops.find(entry=>entry.stack.itemId==='wood');
  assert.equal(left.stack.quantity,7);
  assert.equal(qty(other.p.inventory,'wood')+left.stack.quantity,otherFull+7);
  assert.equal(owned(w).length,0);
  assert.equal(owned(other.w).length,0);
});

test('callers that create or consume items keep a single owner',()=>{
  const fed=camp();
  setPack(fed.w,fed.p,{wood:1});
  const fuel=fed.w.buildings[0].fuel;
  fed.p.x=1;fed.p.z=0;
  act(fed.w,fed.p,{type:'interact',target:'heart'});
  assert.ok(fed.w.buildings[0].fuel>fuel);
  assert.equal(qty(fed.p.inventory,'wood'),0);

  const risen=camp();
  setPack(risen.w,risen.p,{wood:10,stone:8,ember:4});
  const heart=risen.w.buildings.find(b=>b.type==='hearth');
  act(risen.w,risen.p,{type:'upgrade'});
  assert.equal(heart.level,1);
  assert.equal(qty(risen.p.inventory,'wood'),10);
  assert.equal(qty(risen.p.inventory,'ember'),4);
  act(risen.w,risen.p,{type:'upgrade',target:'no-such-fire'});
  assert.equal(heart.level,1);
  assert.equal(qty(risen.p.inventory,'wood'),10);
  act(risen.w,risen.p,{type:'upgrade',target:heart.id});
  assert.equal(heart.level,2);
  assert.equal(qty(risen.p.inventory,'wood'),0);
  assert.equal(qty(risen.p.inventory,'ember'),0);

  const fallen=camp();
  fallen.w.clearPack(fallen.p);
  assert.equal(fallen.w.stock(fallen.p.inventory,'berry',2),2);
  fallen.w.grantEquipped(fallen.p,'axe',40);
  fallen.p.down=0.01;
  fallen.w.tick();
  assert.equal(fallen.p.ghost,true);
  assert.equal(qty(fallen.p.inventory,'berry'),0);
  assert.equal(fallen.p.equipment.chop.durability,40);
  assert.equal(fallen.w.drops.filter(drop=>drop.stack.itemId==='berry').reduce((total,drop)=>total+drop.stack.quantity,0),2);
  assert.equal(fallen.w.drops.some(drop=>drop.stack.itemId==='axe'),false);

  const crowded=camp();
  const two=crowded.w.addPlayer('two');
  crowded.w.addPlayer('three');
  crowded.w.addPlayer('four');
  crowded.w.clearPack(two);
  assert.equal(crowded.w.stock(two.inventory,'stone',3),3);
  const sword=crowded.w.grantEquipped(two,'sword',50);
  const bandage=makeStack('band-1','bandage',2);
  two.recovery=createRecovery(two.id,1);
  two.recovery.slots[0]=bandage.stack;
  crowded.w.leave('two');
  assert.equal(crowded.w.addPlayer('five').id,'five');
  assert.equal(crowded.w.player('two'),undefined);
  assert.equal(crowded.w.drops.filter(drop=>drop.stack.itemId==='stone').reduce((total,drop)=>total+drop.stack.quantity,0),3);
  assert.equal(crowded.w.drops.find(drop=>drop.stack.uid===sword.uid).stack.durability,50);
  assert.equal(crowded.w.drops.find(drop=>drop.stack.uid==='band-1').stack.quantity,2);

  const smashed=camp();
  const chest=smashed.w.structure('chest',8,8);
  smashed.w.buildings.push(chest);
  assert.equal(smashed.w.stock(chest.store,'fiber',4),4);
  const axe=smashed.w.mintStack('axe',1,33);
  chest.store.slots[chest.store.slots.findIndex(slot=>slot==null)]=axe;
  chest.hp=0;
  smashed.w.tick();
  assert.equal(smashed.w.buildings.some(building=>building.id===chest.id),false);
  assert.equal(smashed.w.drops.filter(drop=>drop.stack.itemId==='fiber').reduce((total,drop)=>total+drop.stack.quantity,0),4);
  assert.equal(smashed.w.drops.find(drop=>drop.stack.uid===axe.uid).stack.durability,33);

  const taken=camp();
  taken.w.clearPack(taken.p);
  const box=taken.w.structure('chest',taken.p.x+1,taken.p.z);
  taken.w.buildings.push(box);
  assert.equal(taken.w.stock(box.store,'ore',2),2);
  assert.equal(act(taken.w,taken.p,{type:'dismantle',target:box.id,hold:true}).ok,true);
  assert.equal(taken.w.buildings.some(building=>building.id===box.id),true);
  assert.equal(qty(box.store,'ore'),2);
  hold(taken.w,taken.p,null,0.7,{act:false});
  assert.equal(taken.w.buildings.some(building=>building.id===box.id),true);
  hold(taken.w,taken.p,null,0.15,{act:false});
  assert.equal(taken.w.buildings.some(building=>building.id===box.id),false);
  assert.equal(qty(taken.p.inventory,'wood'),3);
  assert.equal(qty(taken.p.inventory,'fiber'),1);
  assert.equal(taken.w.drops.filter(drop=>drop.stack.itemId==='ore').reduce((total,drop)=>total+drop.stack.quantity,0),2);
  for(const world of [fed.w,risen.w,fallen.w,crowded.w,smashed.w,taken.w])assert.equal(owned(world).length,0);
});

test('T31 v1 migration preserves items without moving the live clock',()=>{
  const normalText=readFixture('v1-normal.json');
  const fullText=readFixture('v1-full-storage.json');
  const normal=JSON.parse(normalText);
  const full=JSON.parse(fullText);
  const boundaries=loadFixture('v1-phase-boundaries.json');
  for(const doc of [normal, full, ...boundaries.saves]){
    const before=JSON.stringify(doc);
    const kept=migrateV1Save(doc,{remapTime:false});
    const mapped=migrateV1Save(JSON.parse(before),{remapTime:true});
    assert.equal(JSON.stringify(doc),before);
    assert.equal(kept.ok,true);
    assert.equal(kept.write,'v2');
    assert.equal(kept.save.world.clock,CLOCK_V1);
    assert.equal(kept.save.world.time,doc.world.time);
    assert.equal(kept.save.world.nextSpawn,doc.world.nextSpawn);
    assert.equal(mapped.ok,true);
    assert.equal(mapped.save.world.clock,CLOCK_V2);
    assert.equal(mapped.save.world.time,remapPhaseTime(doc.world.time));
    const oldPhase=phaseProgress(doc.world.time,V1_PHASE);
    const newPhase=phaseProgress(mapped.save.world.time,V2_PHASE);
    assert.equal(newPhase.name,oldPhase.name);
    assert.equal(newPhase.cycleIndex,oldPhase.cycleIndex);
    assert.ok(Math.abs(newPhase.fraction-oldPhase.fraction)<1e-9);
    assert.throws(()=>World.restore(kept.save.world),/not a Hollowstead expedition/);
    const resumed=World.restore(mapped.save.world);
    assert.equal(resumed.clock,CLOCK_V2);
    assert.equal(resumed.time,mapped.save.world.time);
    assert.equal(phaseAt(resumed.time),newPhase.name);
    for(const itemId of itemIds())assert.equal(v2Sum(resumed,itemId),v1Sum(doc.world,itemId),itemId);
    assert.equal(owned(resumed).length,0);
    assert.equal(kept.save.world.nodeChanges.every(change=>change.ready>0&&change.hits===0),true);
    for(const change of doc.world.nodeChanges){
      if(!(change[2]>0))continue;
      const record=kept.save.world.nodeChanges.find(entry=>entry.id===change[0]);
      const shifted=mapped.save.world.nodeChanges.find(entry=>entry.id===change[0]);
      assert.equal(record.ready-kept.save.world.time,change[2]-doc.world.time);
      assert.ok(Math.abs((shifted.ready-mapped.save.world.time)-(change[2]-doc.world.time))<1e-6);
    }
    for(const drop of doc.world.drops){
      const same=(entry)=>entry.x===drop.x&&entry.z===drop.z&&entry.stack.itemId===drop.type;
      assert.equal(kept.save.world.drops.filter(same).reduce((total,entry)=>total+entry.stack.quantity,0),drop.count);
      assert.equal(kept.save.world.drops.filter(same).every(entry=>entry.until===drop.until),true);
      assert.ok(mapped.save.world.drops.filter(entry=>entry.x===drop.x&&entry.z===drop.z&&entry.stack.itemId===drop.type).every(entry=>Math.abs((entry.until-mapped.save.world.time)-(drop.until-doc.world.time))<1e-6));
    }
    const later=remapWorldClock(kept.save.world);
    assert.equal(later.remapped,true);
    assert.equal(later.world.time,mapped.save.world.time);
    assert.equal(later.world.nextSpawn,mapped.save.world.nextSpawn);
    assert.equal(remapWorldClock(later.world).remapped,false);
    assert.equal(remapWorldClock(later.world).world.time,later.world.time);
    if(newPhase.name==='night'){
      const wave=nextNightWaveTime(mapped.save.world.time,V2_PHASE);
      const expected=wave==null?newPhase.cycleIndex*V2_PHASE.cycle+V2_PHASE.cycle:wave;
      assert.equal(mapped.save.world.nextSpawn,expected);
    }else assert.equal(mapped.save.world.nextSpawn,0);
  }
  assert.equal(readFixture('v1-normal.json'),normalText);
  assert.equal(readFixture('v1-full-storage.json'),fullText);

  const keptNormal=migrateV1Save(normal,{remapTime:false});
  const continued=planContinue({v1:normal,v2:null});
  assert.equal(continued.ok,true);
  assert.equal(continued.write,'v2');
  assert.equal(continued.save.world.clock,CLOCK_V2);
  assert.equal(continued.save.world.time,remapPhaseTime(normal.world.time));
  const again=planContinue({v1:normal,v2:continued.save});
  assert.equal(again.ok,true);
  assert.equal(again.write,null);
  assert.equal(again.save.world.time,continued.save.world.time);
  assert.equal(again.save.world.nodeChanges.find(entry=>entry.id==='n0').ready,continued.save.world.nodeChanges.find(entry=>entry.id==='n0').ready);
  const resumed=World.fromSave(continued.save);
  const camper=resumed.player('host');
  assert.equal(camper.equipment.light.durability,167.5);
  assert.equal(camper.lantern,true);
  assert.equal(camper.equipment.weapon.itemId,'spear');
  assert.equal(camper.equipment.weapon.durability,88);
  assert.equal(camper.equipment.chop.durability,54);
  assert.equal(camper.recovery,null);
  assert.deepEqual(durabilityRows(camper),v1Durability(normal.world.players[0]));
  assert.equal(qty(resumed.buildings.find(building=>building.type==='chest').store,'wood'),2);
  assert.equal(resumed.nodes.find(node=>node.id==='n2').hits,NODES.rock.hits);
  const unmappedReady=keptNormal.save.world.nodeChanges.find(entry=>entry.id==='n0').ready;
  assert.equal(resumed.nodes.find(node=>node.id==='n0').ready,unmappedReady+(continued.save.world.time-normal.world.time));

  const fullWorld=World.fromSave(planContinue({v1:full,v2:null}).save);
  const [host,guest]=[fullWorld.player('host'),fullWorld.player('guest')];
  assert.equal(host.equipment.weapon.itemId,'sword');
  assert.equal(host.equipment.weapon.durability,140);
  assert.equal(host.inventory.slots.length,12);
  assert.equal(host.recovery,null);
  assert.equal(stackOf(host.inventory,'spear').durability,36);
  assert.equal(qty(host.inventory,'spear'),1);
  assert.equal(host.equipment.light.durability,167.5);
  assert.deepEqual(durabilityRows(host),v1Durability(full.world.players[0]));
  assert.equal(guest.inventory.slots.length,12);
  assert.equal(guest.inventory.slots.filter(Boolean).length,12);
  assert.ok(guest.recovery.slots.length>12);
  // The v1 fixture holds the original 13 supplies; Long Night materials came later.
  for(const itemId of Object.keys(ITEMS).slice(0,13)){
    const mine=qty(guest.inventory,itemId)+qty(guest.recovery,itemId);
    assert.equal(mine,100,itemId);
  }
  assert.equal(guest.recovery.slots.reduce((total,stack)=>total+(stack?1:0),0)>12,true);
  const chest=fullWorld.buildings.find(building=>building.type==='chest');
  assert.equal(chest.store.slots.length,24);
  assert.ok(chest.overflow.slots.some(Boolean));
  assert.equal(qty(chest.store,'berry')+qty(chest.overflow,'berry'),80);
  assert.equal(qty(chest.store,'bandage')+qty(chest.overflow,'bandage'),80);
  assert.equal(qty(chest.store,'wood')+qty(chest.overflow,'wood'),605);
  assert.equal(fullWorld.bossSpawned,full.world.bossSpawned);
  assert.equal(fullWorld.bossSlain,full.world.bossSlain);
  resumed.resumeExpedition();
  assert.equal(resumed.player('host').online,true);
  assert.equal(resumed.player('host').goal,null);
  assert.equal(resumed.player('host').rest,false);
});

test('T32 corrupt migration keeps the original, and overflow can be withdrawn',()=>{
  const normal=loadFixture('v1-normal.json');
  const broken=structuredClone(normal);
  broken.world.players[0].inventory.relic=2;
  const before=JSON.stringify(broken);
  const failed=migrateV1Save(broken);
  assert.equal(failed.ok,false);
  assert.equal(failed.write,null);
  assert.equal(failed.preserveV1,true);
  assert.equal(JSON.stringify(broken),before);
  const plan=planContinue({v1:broken,v2:null});
  assert.equal(plan.ok,false);
  assert.equal(plan.write,null);
  assert.equal(plan.recoverable,true);
  assert.match(plan.message,/original save was kept/);
  const blocked=planContinue({v2:{invalid:true},v1:normal});
  assert.equal(blocked.ok,false);
  assert.equal(blocked.write,null);
  assert.equal(blocked.recoverable,true);
  const continued=planContinue({v1:normal,v2:null});
  assert.equal(continued.ok,true);
  assert.equal(continued.write,'v2');
  assert.equal(continued.save.world.clock,CLOCK_V2);
  assert.equal(planContinue({v1:normal,v2:continued.save}).write,null);
  const remapped=migrateV1Save(normal,{remapTime:true});
  const future=planContinue({v2:remapped.save,v1:normal});
  assert.equal(future.ok,true);
  assert.equal(future.write,null);
  assert.equal(future.save.world.clock,CLOCK_V2);
  assert.equal(future.save.world.time,remapped.save.world.time);

  const full=loadFixture('v1-full-storage.json');
  const world=World.fromSave(planContinue({v1:full,v2:null}).save);
  const guest=world.player('guest');
  const probe=makeStack('probe-berry','berry',1);
  const recoverySlots=JSON.stringify(guest.recovery.slots);
  const rejected=planInsert(guest.recovery,probe.stack,{acceptsItems:false,allowPartial:false});
  assert.equal(rejected.ok,false);
  assert.equal(JSON.stringify(guest.recovery.slots),recoverySlots);
  const open=guest.inventory.slots.findIndex(stack=>stack);
  guest.inventory.slots[open]=null;
  const spare=guest.recovery.slots.find(Boolean);
  assert.ok(spare);
  const spareUid=spare.uid, spareQty=spare.quantity, spareId=spare.itemId;
  const spareTotal=qty(guest.inventory,spareId)+qty(guest.recovery,spareId);
  guest.cooldown=0;
  world.action(guest.id,{type:'recover',uid:spareUid});
  assert.equal(guest.recovery.slots.some(stack=>stack?.uid===spareUid),false);
  assert.equal(guest.inventory.slots.find(stack=>stack?.uid===spareUid).quantity,spareQty);
  assert.equal(qty(guest.inventory,spareId)+qty(guest.recovery,spareId),spareTotal);
  assert.notEqual(guest.recovery,null);
  assert.equal(owned(world).length,0);

  const {w,p}=camp();
  w.clearPack(p);
  const made=makeStack('rec-1','berry',1);
  p.recovery=createRecovery(p.id,1);
  p.recovery.slots[0]=made.stack;
  act(w,p,{type:'recover',uid:'rec-1'});
  assert.equal(p.recovery,null);
  assert.equal(p.inventory.slots.find(stack=>stack?.itemId==='berry').uid,'rec-1');
});

test('T33 save snapshots drop live activity and network snapshots keep it',()=>{
  const {w,p}=camp();
  p.goal={x:1,z:2,target:null};
  p.rest=true;
  p.action='walk';
  p.actionUntil=9;
  const network=w.snapshot({purpose:'network'});
  const saved=w.snapshot({purpose:'save'});
  assert.deepEqual(network.chestBusy,[]);
  assert.equal(saved.chestBusy,undefined);
  assert.equal(network.players[0].action,'walk');
  assert.deepEqual(network.players[0].goal,{x:1,z:2,target:null});
  assert.equal(saved.players[0].goal,null);
  assert.equal(saved.players[0].rest,false);
  assert.equal(saved.players[0].action,'idle');
  assert.equal(saved.players[0].actionUntil,0);
  assert.equal(network.clock,CLOCK_V2);
  assert.equal(saved.clock,CLOCK_V2);
  assert.equal(saved.time,network.time);
  assert.equal(RULES.day,180);
  assert.equal(RULES.dusk,30);
  assert.equal(RULES.night,100);
  assert.equal(RULES.cycle,310);
  assert.equal(w.clock,CLOCK_V2);
  const rock=w.nodes.find(node=>node.type==='rock');
  rock.hits=NODES.rock.hits-2;
  const copy=World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  assert.equal(copy.nodes.find(node=>node.id===rock.id).hits,NODES.rock.hits-2);
});

test('T34 chunked snapshots rebuild populated chests without truncation',()=>{
  const {w}=camp();
  const chest=w.structure('chest',2,2);
  w.buildings.push(chest);
  assert.equal(w.stock(chest.store,'wood',300),300);
  assert.equal(w.stock(chest.store,'berry',60),60);
  let n=0;
  while(JSON.stringify(w.snapshot()).length<=12000&&n<200){w.buildings.push(w.structure('wall',10+n%20,10+Math.floor(n/20)));n++;}
  const json=JSON.stringify(w.snapshot());
  assert.ok(json.length>12000);
  const parts=chunkSnapshot(json,12000);
  assert.ok(parts.length>1);
  assert.ok(parts.length<100);
  assert.ok(parts.every(part=>part.length<=12000));
  const joined=joinSnapshot(parts);
  assert.equal(JSON.stringify(joined),json);
  assert.equal(joinSnapshot(parts.slice(0,-1)),null);
  const restored=World.restore(joined);
  const saved=restored.buildings.find(building=>building.type==='chest');
  assert.equal(qty(saved.store,'wood'),300);
  assert.equal(qty(saved.store,'berry'),60);
  assert.equal(owned(restored).length,0);
});

test('frozen v1 fixture generator refuses to overwrite the committed saves',()=>{
  const before=readFixture('v1-normal.json');
  const run=spawnSync(process.execPath,['hollowstead/tests/fixtures/generate-v1-fixtures.mjs'],{cwd:fileURLToPath(new URL('../..',import.meta.url))});
  assert.equal(run.status,1);
  assert.match(run.stderr.toString(),/Refusing to overwrite frozen v1 fixtures/);
  assert.equal(readFixture('v1-normal.json'),before);
});

test('renderer icon lookup uses the item stack instead of a count dictionary',()=>{
  for(const file of ['renderer.mjs','canvas-renderer.mjs']){
    const source=readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
    assert.equal(source.includes('ITEMS[e.type]'),false,file);
    assert.equal(source.includes('equipment.torch'),false,file);
    assert.match(source,/itemSpriteKey/);
    assert.match(source,/equippedLanternLit/);
  }
});
