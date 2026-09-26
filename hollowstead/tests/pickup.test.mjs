import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World, createDropMotion, dropPresentation} from '../src/engine.mjs';
import {PICKUP, RULES} from '../src/content.mjs';
import {DROP_LIFETIME_SECONDS, STACK_LIMIT} from '../src/contracts.mjs';
import {collectLocations, countItem, duplicateUids} from '../src/inventory.mjs';

function camp(){const w=new World(402);const p=w.addPlayer('host','Jun');w.start();p.x=20;p.z=20;p.dx=1;p.dz=0;return {w,p};}
function qty(container,itemId){return countItem(container,itemId);}
function sim(w,seconds){let left=seconds;while(left>1e-8){const dt=Math.min(RULES.tick,left);w.tick(dt);left-=dt;}}
function owners(w,uid){return collectLocations(w).filter(row=>row.stack.uid===uid);}
function act(w,p,cmd){p.cooldown=0;return w.action(p.id,cmd);}

test('pickup distances are the measured body, dwell, flight, and drop cooldown',()=>{
  assert.equal(PICKUP.attract,1.15);
  assert.equal(PICKUP.touch,0.42);
  assert.equal(PICKUP.dwell,0.65);
  assert.equal(PICKUP.flight,0.28);
  assert.equal(PICKUP.dropCooldown,1.25);
  assert.equal(RULES.reach,2.8);
  assert.ok(PICKUP.touch>0.4&&PICKUP.touch<PICKUP.attract);
  assert.ok(PICKUP.attract<RULES.reach);
  const renderer=readFileSync(new URL('../src/renderer.mjs',import.meta.url),'utf8');
  const canvas=readFileSync(new URL('../src/canvas-renderer.mjs',import.meta.url),'utf8');
  assert.match(renderer,/createDropMotion/);
  assert.match(canvas,/createDropMotion/);
  assert.match(renderer,/dropMotion\.sample\([^)]*this\.clock/);
  assert.match(canvas,/dropMotion\.sample\([^)]*this\.clock/);
  assert.match(renderer,/shadow\.position\.set\(o\.x,\.018,o\.z\)/);
});

test('dwell then flight collects, and the same frame does not',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const stack=w.mintStack('wood',4);
  const drop=w.placeDrop(stack,p.x+0.8,p.z);
  const spot={x:drop.x,z:drop.z};
  assert.ok(0.8>PICKUP.touch&&0.8<PICKUP.attract);
  sim(w,0.4);
  assert.equal(qty(p.inventory,'wood'),0);
  assert.equal(drop.x,spot.x);
  assert.equal(drop.z,spot.z);
  assert.equal(drop.stack.quantity,4);
  assert.ok(drop.attract);
  assert.equal(drop.flight,undefined);
  sim(w,0.3);
  assert.equal(qty(p.inventory,'wood'),0);
  assert.equal(drop.flight.playerId,p.id);
  assert.equal(drop.x,spot.x);
  assert.equal(drop.z,spot.z);
  sim(w,PICKUP.flight+RULES.tick);
  assert.equal(qty(p.inventory,'wood'),4);
  assert.equal(w.drops.includes(drop),false);
  assert.equal(owners(w,stack.uid).length,1);
  assert.equal(duplicateUids(collectLocations(w)).length,0);
});

test('leaving attract cancels the dwell and keeps the pile on its spot',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const stack=w.mintStack('stone',3);
  const drop=w.placeDrop(stack,p.x+0.9,p.z);
  sim(w,0.4);
  assert.equal(drop.attract.playerId,p.id);
  const spot={x:drop.x,z:drop.z,quantity:drop.stack.quantity};
  p.x=drop.x+3;p.z=drop.z;
  sim(w,1);
  assert.equal(drop.attract,undefined);
  assert.equal(drop.flight,undefined);
  assert.equal(drop.x,spot.x);
  assert.equal(drop.z,spot.z);
  assert.equal(drop.stack.quantity,spot.quantity);
  assert.equal(qty(p.inventory,'stone'),0);
  p.x=drop.x+0.9;p.z=drop.z;
  sim(w,0.4);
  assert.equal(qty(p.inventory,'stone'),0);
  assert.equal(drop.flight,undefined);
  assert.equal(drop.stack.quantity,3);
  sim(w,PICKUP.dwell+PICKUP.flight+RULES.tick);
  assert.equal(qty(p.inventory,'stone'),3);
  assert.equal(owners(w,stack.uid).length,1);
});

test('walking away during the flight still grants that stack',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const stack=w.mintStack('wood',1);
  const drop=w.placeDrop(stack,p.x,p.z);
  sim(w,RULES.tick);
  assert.equal(drop.flight.playerId,p.id);
  p.x+=6;p.z+=4;
  sim(w,PICKUP.flight+RULES.tick);
  assert.equal(qty(p.inventory,'wood'),1);
  assert.equal(owners(w,stack.uid).length,1);
  assert.equal(w.drops.some(entry=>entry.stack?.uid===stack.uid),false);
});

test('touch collects without a dwell, still after the flight',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const stack=w.mintStack('fiber',2);
  const drop=w.placeDrop(stack,p.x,p.z);
  const spot={x:drop.x,z:drop.z};
  sim(w,RULES.tick);
  assert.equal(qty(p.inventory,'fiber'),0);
  assert.equal(drop.flight.playerId,p.id);
  assert.equal(drop.x,spot.x);
  assert.equal(drop.z,spot.z);
  sim(w,PICKUP.flight);
  assert.equal(qty(p.inventory,'fiber'),2);
  assert.equal(w.drops.some(entry=>entry.stack?.uid===stack.uid),false);
});

test('touch after walking back in is instant unless that player is on drop cooldown',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  w.stock(p.inventory,'berry',1);
  const berry=p.inventory.slots.find(slot=>slot?.itemId==='berry');
  act(w,p,{type:'drop',uid:berry.uid,quantity:1});
  const drop=w.drops.find(entry=>entry.stack.uid===berry.uid);
  p.x=drop.x;p.z=drop.z;
  sim(w,0.4);
  assert.equal(drop.flight,undefined);
  assert.equal(w.drops.includes(drop),true);
  assert.equal(qty(p.inventory,'berry'),0);
  const q=w.addPlayer('guest','Moss');
  w.clearPack(q);
  q.x=drop.x+3;q.z=drop.z;
  q.x=drop.x;q.z=drop.z;
  sim(w,PICKUP.flight+RULES.tick*2);
  assert.equal(qty(q.inventory,'berry'),1);
  assert.equal(qty(p.inventory,'berry'),0);
  assert.equal(owners(w,berry.uid).length,1);
});

test('two players cannot both receive one stack',()=>{
  const {w,p}=camp();
  const q=w.addPlayer('guest','Moss');
  w.clearPack(p);w.clearPack(q);
  const stack=w.mintStack('axe',1,40);
  const drop=w.placeDrop(stack,0,0);
  p.x=0;p.z=0;
  q.x=0.3;q.z=0;
  sim(w,RULES.tick);
  assert.equal(drop.flight.playerId,p.id);
  const snap=structuredClone(w.snapshot());
  assert.equal(owners(w,stack.uid).length,1);
  assert.equal(JSON.stringify(snap).split(`"${stack.uid}"`).length-1,1);
  sim(w,PICKUP.flight+RULES.tick);
  assert.equal(p.inventory.slots.some(slot=>slot?.uid===stack.uid),true);
  assert.equal(q.inventory.slots.some(slot=>slot?.uid===stack.uid),false);
  assert.equal(w.drops.some(entry=>entry.stack?.uid===stack.uid),false);
  assert.equal(owners(w,stack.uid).length,1);
  assert.equal(duplicateUids(collectLocations(w)).length,0);
});

test('dropper cooldown blocks only the dropper',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const kept=w.mintStack('wood',2);
  p.inventory.slots[0]=kept;
  act(w,p,{type:'drop',uid:kept.uid,quantity:2});
  const drop=w.drops.find(entry=>entry.stack.uid===kept.uid);
  assert.equal(drop.block.playerId,p.id);
  assert.equal(drop.x,p.x+1);
  assert.equal(drop.z,p.z);
  const spot={x:drop.x,z:drop.z};
  sim(w,1.1);
  assert.equal(qty(p.inventory,'wood'),0);
  assert.equal(drop.flight,undefined);
  assert.equal(drop.x,spot.x);
  assert.equal(drop.z,spot.z);
  const q=w.addPlayer('guest','Moss');
  w.clearPack(q);
  q.x=drop.x;q.z=drop.z;
  sim(w,PICKUP.flight+RULES.tick*2);
  assert.equal(q.inventory.slots.some(slot=>slot?.uid===kept.uid),true);
  assert.equal(qty(p.inventory,'wood'),0);
  assert.equal(owners(w,kept.uid).length,1);
});

test('after the cooldown the dropper uses the normal dwell',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const kept=w.mintStack('wood',2);
  p.inventory.slots[0]=kept;
  act(w,p,{type:'drop',uid:kept.uid,quantity:2});
  const drop=w.drops.find(entry=>entry.stack.uid===kept.uid);
  sim(w,1.1);
  assert.equal(w.drops.includes(drop),true);
  sim(w,PICKUP.dropCooldown+PICKUP.dwell+PICKUP.flight);
  assert.equal(qty(p.inventory,'wood'),2);
  assert.equal(owners(w,kept.uid).length,1);
});

test('a full pack does not delete a pile, and overflow keeps the remainder',()=>{
  const blocked=camp();
  blocked.w.clearPack(blocked.p);
  const blockedFull=blocked.p.inventory.slots.length*STACK_LIMIT;
  assert.equal(blocked.w.stock(blocked.p.inventory,'wood',blockedFull),blockedFull);
  const stuck=blocked.w.mintStack('wood',4);
  const pile=blocked.w.placeDrop(stuck,blocked.p.x,blocked.p.z);
  const spot={x:pile.x,z:pile.z};
  sim(blocked.w,1.5);
  assert.equal(qty(blocked.p.inventory,'wood'),blockedFull);
  assert.equal(pile.stack.uid,stuck.uid);
  assert.equal(pile.stack.quantity,4);
  assert.equal(pile.x,spot.x);
  assert.equal(pile.z,spot.z);
  assert.equal(pile.flight,undefined);
  assert.equal(owners(blocked.w,stuck.uid).length,1);

  const {w,p}=camp();
  w.clearPack(p);
  const full=p.inventory.slots.length*STACK_LIMIT;
  assert.equal(w.stock(p.inventory,'wood',full-5),full-5);
  const stack=w.mintStack('wood',12);
  const drop=w.placeDrop(stack,p.x,p.z);
  sim(w,PICKUP.flight+RULES.tick*2);
  assert.equal(qty(p.inventory,'wood'),full);
  const left=w.drops.find(entry=>entry.stack.itemId==='wood');
  assert.equal(left.stack.quantity,7);
  assert.equal(left.x,drop.x);
  assert.equal(left.z,drop.z);
  assert.equal(qty(p.inventory,'wood')+left.stack.quantity,full+7);
  assert.equal(duplicateUids(collectLocations(w)).length,0);
});

test('held Gather and an interact command do not scoop outside the radii',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const stack=w.mintStack('ore',2);
  const drop=w.placeDrop(stack,p.x+2,p.z);
  assert.ok(distance(p,drop)<RULES.reach);
  assert.ok(distance(p,drop)>PICKUP.attract);
  let left=2;
  while(left>1e-8){
    const dt=Math.min(RULES.tick,left);
    w.input(p.id,{x:0,z:0,act:true,attack:false,target:drop.id});
    w.tick(dt);
    left-=dt;
  }
  assert.equal(qty(p.inventory,'ore'),0);
  assert.equal(drop.stack.quantity,2);
  assert.equal(drop.flight,undefined);
  assert.equal(act(w,p,{type:'interact',target:drop.id}).ok,false);
  sim(w,0.5);
  assert.equal(qty(p.inventory,'ore'),0);
  assert.equal(w.drops.includes(drop),true);
});

test('snapshots do not duplicate a flying stack or resurrect a dwell',()=>{
  const flying=camp();
  flying.w.clearPack(flying.p);
  const stack=flying.w.mintStack('ember',2);
  const drop=flying.w.placeDrop(stack,flying.p.x,flying.p.z);
  sim(flying.w,RULES.tick);
  assert.equal(drop.flight.playerId,flying.p.id);
  assert.equal(qty(flying.p.inventory,'ember'),0);
  const frame=structuredClone(flying.w.snapshot());
  const guest=World.restore(frame);
  assert.equal(owners(guest,stack.uid).length,1);
  assert.equal(qty(guest.player('host').inventory,'ember'),0);
  assert.equal(guest.drops.some(entry=>entry.flight&&entry.stack.uid===stack.uid),true);
  sim(guest,PICKUP.flight+RULES.tick);
  assert.equal(qty(guest.player('host').inventory,'ember'),2);
  assert.equal(guest.drops.some(entry=>entry.stack?.uid===stack.uid),false);
  assert.equal(owners(guest,stack.uid).length,1);

  const dwelling=camp();
  dwelling.w.clearPack(dwelling.p);
  const pile=dwelling.w.mintStack('seed',2);
  const loose=dwelling.w.placeDrop(pile,dwelling.p.x+0.8,dwelling.p.z);
  const spot={x:loose.x,z:loose.z};
  sim(dwelling.w,0.45);
  const saved=World.restore(structuredClone(dwelling.w.snapshot()));
  const again=saved.player('host');
  assert.equal(qty(again.inventory,'seed'),0);
  assert.equal(saved.drops.find(entry=>entry.stack.uid===pile.uid).x,spot.x);
  sim(saved,0.3);
  assert.equal(qty(again.inventory,'seed'),0);
  const restored=saved.drops.find(entry=>entry.stack.uid===pile.uid);
  assert.equal(restored.x,spot.x);
  assert.equal(restored.z,spot.z);
  assert.equal(restored.stack.quantity,2);
  assert.equal(restored.flight,undefined);
});

test('the flight homes on the moving body and a cancelled dwell returns home',()=>{
  const {w,p}=camp();
  const drop={x:1,z:0,attract:{playerId:p.id,elapsed:PICKUP.dwell,dwell:PICKUP.dwell}};
  p.x=0;p.z=0;
  const eased=dropPresentation(drop,w);
  assert.ok(eased.x<1&&eased.x>0.7);
  assert.equal(drop.x,1);
  delete drop.attract;
  const home=dropPresentation(drop,w);
  assert.equal(home.x,1);
  assert.equal(home.z,0);
  assert.equal(home.y,0);
  drop.flight={playerId:p.id,startedAt:w.time-PICKUP.flight/2,duration:PICKUP.flight};
  p.x=3;p.z=0;
  const mid=dropPresentation(drop,w);
  assert.ok(Math.abs(mid.x-2)<1e-6);
  assert.ok(mid.y>0.5);
  p.x=5;
  const later=dropPresentation(drop,w);
  assert.ok(Math.abs(later.x-3)<1e-6);
});

test('flight sampling follows the render clock and a mid-flight snapshot keeps moving',()=>{
  const motion=createDropMotion();
  const drop={id:'d1',x:0,z:0,flight:{playerId:'host',startedAt:0,duration:PICKUP.flight}};
  const world={time:PICKUP.flight/2,player(){return {id:'host',x:4,z:0};}};
  const first=motion.sample(drop,world,PICKUP.flight/2,0);
  const second=motion.sample(drop,world,PICKUP.flight/2+0.02,0);
  assert.ok(second.t>first.t);
  assert.ok(second.x>first.x);
  assert.ok(second.y>0);
  const snap=structuredClone(drop);
  const third=motion.sample(snap,world,PICKUP.flight/2+0.04,0);
  assert.ok(third.x>second.x);
  assert.ok(third.x>0.2);
  delete snap.flight;
  const home=motion.sample(snap,world,PICKUP.flight/2+0.05,0);
  assert.equal(home.x,0);
  assert.equal(home.y,0);
});

test('floor piles vanish after one day and night cycle',()=>{
  const {w,p}=camp();
  w.ambient=false;w.enemies=[];
  const drop=w.placeDrop(w.mintStack('wood',1),p.x+8,p.z+8);
  assert.equal(DROP_LIFETIME_SECONDS,RULES.cycle);
  assert.equal(drop.until,w.time+RULES.cycle);
  const id=drop.id;
  sim(w,RULES.cycle-RULES.tick);
  assert.equal(w.drops.some(entry=>entry.id===id),true);
  sim(w,RULES.tick*2);
  assert.equal(w.drops.some(entry=>entry.id===id),false);
});

function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
