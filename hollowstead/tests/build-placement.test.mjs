import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {countItem} from '../src/inventory.mjs';
import {createActionSession} from '../src/transactions.mjs';

function camp(){
  const w=new World(12,{showcase:true}),p=w.addPlayer('host');w.start();w.clearPack(p);
  p.x=0;p.z=0;w.nodes=[];w.buildings=[];
  const bench=w.structure('bench',0,2),chest=w.structure('chest',2,2),cart=w.structure('cart',-2,2);
  w.buildings.push(bench,chest,cart);
  let seq=0;
  const session=createActionSession({getWorld:()=>w,actorId:p.id});
  const send=cmd=>{p.cooldown=0;return session.execute({...cmd,requestId:`${session.sessionId}:${++seq}`,worldId:w.networkId});};
  const place=()=>send({type:'placeBuilding',recipeId:'pot',x:p.x+2,z:p.z,stationId:bench.id});
  return {w,p,bench,chest,cart,send,place};
}

test('workbench placement follows the player and spends distant chest/cart supplies once',()=>{
  const {w,p,bench,chest,cart,place}=camp();
  w.stock(p.inventory,'stone',2);w.stock(chest.store,'stone',4);w.stock(cart.store,'ore',1);
  assert.equal(w.recipeReason(p,'pot',bench.id),'');
  p.x=14;
  assert.equal(w.available(p,'stone'),2);
  assert.equal(w.available(p,'stone',true),6);
  assert.equal(w.canBuild(p,'pot',16,0,bench.id),'');
  const chestRevision=chest.store.revision,cartRevision=cart.store.revision;
  assert.equal(place().ok,true);
  assert.equal(w.buildings.filter(b=>b.type==='pot').length,1);
  assert.equal(countItem(p.inventory,'stone'),0);
  assert.equal(countItem(chest.store,'stone'),0);
  assert.equal(countItem(cart.store,'ore'),0);
  assert.ok(chest.store.revision>chestRevision);assert.ok(cart.store.revision>cartRevision);
  assert.equal(place().ok,false);
  assert.equal(w.buildings.filter(b=>b.type==='pot').length,1);
  w.assertItems();
});

test('remote construction respects another player holding a chest and charges nothing on failure',()=>{
  const {w,p,bench,chest,place}=camp(),q=w.addPlayer('guest');q.x=2;q.z=3;
  w.stock(chest.store,'stone',6);w.stock(chest.store,'ore',1);
  const opened=w.action(q.id,{type:'chestOpen',requestId:'open',chestId:chest.id});
  assert.equal(opened.ok,true);p.x=14;
  const before=structuredClone(chest.store);
  assert.equal(place().ok,false);assert.deepEqual(chest.store,before);
  assert.equal(w.buildings.some(b=>b.type==='pot'),false);
  w.action(q.id,{type:'chestClose',requestId:'close',chestId:chest.id,sessionId:opened.sessionId});
  assert.equal(w.canBuild(p,'pot',16,0,bench.id),'');
  assert.equal(place().ok,true);
});

test('repairs and item crafting retain their existing station and supply ranges',()=>{
  const {w,p,bench,chest,send}=camp();w.stock(chest.store,'wood',10);w.stock(chest.store,'stone',10);
  p.x=14;const wall=w.structure('wall',15,0);wall.hp=1;w.buildings.push(wall);
  send({type:'buildingAction',targetId:wall.id,actionId:'repair'});
  assert.equal(wall.hp,1);assert.equal(countItem(chest.store,'wood'),10);
  w.stock(p.inventory,'wood',1);
  send({type:'buildingAction',targetId:wall.id,actionId:'repair'});
  assert.equal(wall.hp,91);assert.equal(countItem(p.inventory,'wood'),0);
  assert.equal(countItem(chest.store,'wood'),10);
  assert.equal(send({type:'craftRecipe',recipeId:'axe',stationId:bench.id}).code,'stationRequired');
  const nearBench=w.structure('bench',14,2);w.buildings.push(nearBench);
  assert.equal(send({type:'craftRecipe',recipeId:'axe',stationId:nearBench.id}).ok,false);
  p.x=0;
  assert.equal(send({type:'buildingAction',targetId:wall.id,actionId:'repair'}).code,'outOfRange');
  assert.equal(wall.hp,91);
});

test('remote placement still validates the workbench, space, player reach and full cost',()=>{
  const {w,p,bench,chest,send,place}=camp();w.stock(chest.store,'stone',6);w.stock(chest.store,'ore',1);p.x=14;
  const before=structuredClone(chest.store);
  for(const stationId of [null,'missing',chest.id])assert.equal(send({type:'placeBuilding',recipeId:'pot',x:16,z:0,stationId}).code,'stationRequired');
  bench.hp=0;assert.equal(place().code,'stationRequired');bench.hp=bench.maxHp;
  assert.equal(send({type:'placeBuilding',recipeId:'pot',x:25,z:0,stationId:bench.id}).ok,false);
  assert.equal(send({type:'placeBuilding',recipeId:'pot',x:p.x,z:p.z,stationId:bench.id}).ok,false);
  assert.deepEqual(chest.store,before);
  w.buildings.push(w.structure('wall',16,0));assert.equal(place().ok,false);
  assert.deepEqual(chest.store,before);
});
