import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {EQUIPMENT, NODES, PICKUP, RULES, STRUCTURES} from '../src/content.mjs';
import {countItem} from '../src/inventory.mjs';
import {
  CAULDRON_COOK_RECIPES, CONTEXT_ACTIONS, DISMANTLE_HOLD_SECONDS, FIELD_BUILD_RECIPES,
  FIRE_COOK_RECIPES, WORKBENCH_BUILD_RECIPES, WORKBENCH_CRAFT_RECIPES,
} from '../src/contracts.mjs';
import {contextActionIds, contextRecipeIds, dismantleRule, gatherRate, selectTarget} from '../src/interactions.mjs';

// Guards, roamers and discovery XP have their own tests in progression.test.mjs.
function camp(seed=402){const w=new World(seed);const p=w.addPlayer('host','Jun');w.start();w.ambient=false;w.enemies=[];p.regions=['meadow','woods','graveyard','mire','crags','barrow'];return {w,p};}
function qty(container,itemId){return countItem(container,itemId);}
function setPack(w,p,counts){w.clearPack(p);for(const [itemId,count] of Object.entries(counts))assert.equal(w.stock(p.inventory,itemId,count),count);}
function act(w,p,cmd){p.cooldown=0;return w.action(p.id,cmd);}
function stand(p,node){p.x=node.x;p.z=node.z+1;}
function floorQty(w,itemId){return w.drops.filter(drop=>drop.stack.itemId===itemId).reduce((total,drop)=>total+drop.stack.quantity,0);}
function hold(w,rows,seconds,dt=RULES.tick){
  const list=Array.isArray(rows)?rows:[rows];
  let left=seconds;
  while(left>1e-8){
    const step=Math.min(dt,0.1,left);
    for(const row of list){
      const spams=row.spams||1;
      for(let i=0;i<spams;i++)w.input(row.p.id,{x:row.x||0,z:row.z||0,act:row.act!==false,attack:!!row.attack,target:row.target??null});
    }
    w.tick(step);
    left-=step;
  }
}
function one(w,p,target,extra={}){hold(w,[{p,target,...extra}],RULES.tick);}
function release(w,p,target){w.input(p.id,{x:0,z:0,act:false,attack:false,target});w.tick(RULES.tick);}
function sim(w,seconds){let left=seconds;while(left>1e-8){const dt=Math.min(RULES.tick,left);w.tick(dt);left-=dt;}}
function takePiles(w,p){
  for(let guard=0;guard<12&&w.drops.length;guard++){
    const drop=w.drops[0];
    p.x=drop.x;p.z=drop.z;p.goal=null;
    w.input(p.id,{x:0,z:0,act:false,attack:false,target:null});
    sim(w,PICKUP.flight+RULES.tick*2);
  }
}
function ready(node,w){return node.ready>w.time;}

test('live clock is 180/30/100',()=>{
  assert.equal(RULES.day,180);
  assert.equal(RULES.dusk,30);
  assert.equal(RULES.night,100);
  assert.equal(RULES.cycle,310);
  assert.equal(RULES.cycle, RULES.day+RULES.dusk+RULES.night);
});

test('T16 field build list, exact targets, and first workbench progression',()=>{
  assert.deepEqual(contextRecipeIds({source:'field',tab:'build'}),[...FIELD_BUILD_RECIPES]);
  for(const id of ['pot','lantern','ward','axe','spear'])assert.equal(contextRecipeIds({source:'field',tab:'build'}).includes(id),false);
  assert.deepEqual(contextRecipeIds({source:'station',stationType:'bench',tab:'build'}),[...WORKBENCH_BUILD_RECIPES]);
  assert.deepEqual(contextRecipeIds({source:'station',stationType:'bench',tab:'craft'}),[...WORKBENCH_CRAFT_RECIPES]);
  assert.deepEqual(contextRecipeIds({source:'field',tab:'craft'}),[]);
  const candidates=[{id:'far',distance:3},{id:'b',distance:1},{id:'a',distance:1}];
  assert.equal(selectTarget(candidates,'missing'),null);
  assert.equal(selectTarget(candidates,'far').id,'far');
  assert.equal(selectTarget(candidates,undefined).id,'a');
  for(const type of Object.keys(STRUCTURES))assert.deepEqual(contextActionIds(type),[...(CONTEXT_ACTIONS[type]||[])]);
  for(const type of Object.keys(NODES))assert.deepEqual(contextActionIds(type),[...CONTEXT_ACTIONS[type]]);
  assert.equal(dismantleRule('hearth',false).ok,false);
  assert.equal(dismantleRule('chest',true).code,'chestInUse');
  assert.equal(dismantleRule('wall',false).hold,DISMANTLE_HOLD_SECONDS);
  assert.equal(gatherRate('tree',null),1);
  assert.equal(gatherRate('tree','axe'),2);
  assert.equal(gatherRate('ore',null),0);
  assert.equal(gatherRate('ore','pick'),1);

  const built=camp();
  setPack(built.w,built.p,{wood:20,stone:20,ore:4,ember:8});
  const nearby=built.w.structure('bench',built.p.x+1,built.p.z);built.w.buildings.push(nearby);
  const before=built.w.buildings.length;
  const wood=qty(built.p.inventory,'wood'), stone=qty(built.p.inventory,'stone');
  for(const recipe of ['pot','lantern','ward']){
    const denied=act(built.w,built.p,{type:'build',recipe,x:built.p.x+1.6,z:built.p.z+1.6,stationId:null});
    assert.equal(denied.code,'stationRequired',recipe);
  }
  assert.equal(built.w.buildings.length,before);
  assert.equal(qty(built.p.inventory,'wood'),wood);
  assert.equal(qty(built.p.inventory,'stone'),stone);
  const wall=act(built.w,built.p,{type:'build',recipe:'wall',x:built.p.x-1.6,z:built.p.z});
  assert.equal(wall.ok,true);
  assert.equal(built.w.buildings.filter(b=>b.type==='wall').length,1);
  const potSpot={x:built.p.x+1.6,z:built.p.z+1.6};
  assert.equal(act(built.w,built.p,{type:'build',recipe:'pot',x:potSpot.x,z:potSpot.z,stationId:'missing'}).ok,false);
  const wrong=built.w.buildings.find(b=>b.type==='wall');
  assert.equal(act(built.w,built.p,{type:'build',recipe:'pot',x:potSpot.x,z:potSpot.z,stationId:wrong.id}).ok,false);
  nearby.hp=0;
  assert.equal(act(built.w,built.p,{type:'build',recipe:'pot',x:potSpot.x,z:potSpot.z,stationId:nearby.id}).ok,false);
  nearby.hp=nearby.maxHp;
  nearby.x=built.p.x+5;nearby.z=built.p.z;
  assert.equal(act(built.w,built.p,{type:'build',recipe:'pot',x:potSpot.x,z:potSpot.z,stationId:nearby.id}).ok,false);
  assert.equal(built.w.buildings.some(b=>b.type==='pot'),false);
  nearby.x=built.p.x+1;nearby.z=built.p.z;
  assert.equal(act(built.w,built.p,{type:'build',recipe:'pot',x:potSpot.x,z:potSpot.z,stationId:nearby.id}).ok,true);
  assert.equal(built.w.buildings.filter(b=>b.type==='pot').length,1);

  const {w,p}=camp();
  const tree=w.nodes.find(node=>node.type==='tree');
  stand(p,tree);
  const startWood=qty(p.inventory,'wood');
  hold(w,[{p,target:tree.id}],3.9);
  assert.equal(ready(tree,w),false);
  assert.equal(floorQty(w,'wood'),0);
  assert.equal(qty(p.inventory,'wood'),startWood);
  hold(w,[{p,target:tree.id}],0.2);
  assert.equal(ready(tree,w),true);
  assert.equal(floorQty(w,'wood'),5);
  assert.equal(floorQty(w,'fiber'),1);
  assert.equal(qty(p.inventory,'wood'),startWood);
  takePiles(w,p);
  assert.equal(qty(p.inventory,'wood'),startWood+5);
  assert.equal(w.drops.length,0);
  const rock=w.nodes.find(node=>node.type==='rock');
  stand(p,rock);
  hold(w,[{p,target:rock.id}],4.5);
  assert.equal(floorQty(w,'stone'),5);
  takePiles(w,p);
  assert.equal(qty(p.inventory,'stone'),7);
  const placed=act(w,p,{type:'build',recipe:'bench',x:p.x+1.6,z:p.z});
  assert.equal(placed.ok,true);
  const bench=w.buildings.find(b=>b.type==='bench');
  assert.ok(bench);
  assert.equal(qty(p.inventory,'wood'),2);
  assert.equal(qty(p.inventory,'stone'),3);
  assert.equal(act(w,p,{type:'craft',recipe:'axe'}).code,'stationRequired');
  assert.equal(act(w,p,{type:'craft',recipe:'axe',stationId:bench.id}).ok,true);
  const axe=p.inventory.slots.find(stack=>stack?.itemId==='axe');
  assert.equal(act(w,p,{type:'equip',uid:axe.uid}).ok,true);
  assert.equal(p.equipment.chop.uid,axe.uid);
  assert.equal(act(w,p,{type:'craft',recipe:'pick',stationId:bench.id}).ok,false);
  assert.equal(w.stock(p.inventory,'wood',2),2);
  assert.equal(w.stock(p.inventory,'stone',2),2);
  assert.equal(act(w,p,{type:'craft',recipe:'pick',stationId:bench.id}).ok,true);
  const pick=p.inventory.slots.find(stack=>stack?.itemId==='pick');
  assert.equal(act(w,p,{type:'equip',uid:pick.uid}).ok,true);
  assert.equal(p.equipment.mine.itemId,'pick');
  bench.hp=0;w.tick();
  assert.equal(w.buildings.some(b=>b.id===bench.id),false);
  const woodLeft=qty(p.inventory,'wood'), stoneLeft=qty(p.inventory,'stone');
  assert.equal(act(w,p,{type:'craft',recipe:'axe',stationId:bench.id}).code,'stationRequired');
  assert.equal(qty(p.inventory,'wood'),woodLeft);
  assert.equal(qty(p.inventory,'stone'),stoneLeft);
});

test('T17 station lists: bench tools, fueled fire, and cauldron stew',()=>{
  const {w,p}=camp();
  const bench=w.structure('bench',p.x+1,p.z);
  const stash=w.structure('chest',p.x+1.2,p.z+0.4);
  w.buildings.push(bench,stash);
  w.clearPack(p);
  assert.equal(w.stock(stash.store,'wood',17),17);
  assert.equal(w.stock(stash.store,'stone',7),7);
  assert.equal(w.stock(stash.store,'fiber',14),14);
  assert.equal(w.stock(stash.store,'berry',1),1);
  assert.equal(w.stock(stash.store,'ore',5),5);
  assert.equal(w.stock(stash.store,'ember',2),2);
  for(const recipe of WORKBENCH_CRAFT_RECIPES.slice(0,7)){
    const before=JSON.stringify(p.inventory.slots);
    assert.equal(act(w,p,{type:'craft',recipe}).code,'stationRequired',recipe);
    assert.equal(JSON.stringify(p.inventory.slots),before,recipe);
    assert.equal(act(w,p,{type:'craft',recipe,stationId:bench.id}).ok,true,recipe);
    assert.equal(qty(p.inventory,recipe),1,recipe);
    const made=p.inventory.slots.find(stack=>stack?.itemId===recipe);
    assert.equal(w.transferAll(p,made.uid,stash.store),true,recipe);
  }
  bench.hp=0;
  const held=qty(p.inventory,'wood');
  assert.equal(act(w,p,{type:'craft',recipe:'axe',stationId:bench.id}).ok,false);
  assert.equal(qty(p.inventory,'wood'),held);

  const cook=camp();
  cook.p.x=2;cook.p.z=0;
  setPack(cook.w,cook.p,{pumpkin:4,meat:3,mushroom:4,berry:4});
  const heart=cook.w.buildings[0];
  heart.fuel=0;
  for(const recipe of FIRE_COOK_RECIPES)assert.equal(act(cook.w,cook.p,{type:'craft',recipe,stationId:heart.id}).code,'missingFuel',recipe);
  heart.fuel=80;
  for(const recipe of FIRE_COOK_RECIPES){
    assert.equal(act(cook.w,cook.p,{type:'craft',recipe}).code,'stationRequired');
    assert.equal(act(cook.w,cook.p,{type:'craft',recipe,stationId:heart.id}).ok,true);
  }
  const fire=cook.w.structure('fire',cook.p.x+1,cook.p.z);fire.fuel=0;cook.w.buildings.push(fire);
  setPack(cook.w,cook.p,{pumpkin:1,berry:2,meat:1});
  assert.equal(act(cook.w,cook.p,{type:'craft',recipe:'roast',stationId:fire.id}).code,'missingFuel');
  assert.equal(act(cook.w,cook.p,{type:'craft',recipe:'stew',stationId:fire.id}).ok,false);
  fire.fuel=20;
  assert.equal(act(cook.w,cook.p,{type:'craft',recipe:'stew',stationId:fire.id}).ok,false);
  const pot=cook.w.structure('pot',cook.p.x+1.2,cook.p.z+.6);pot.fuel=0;cook.w.buildings.push(pot);
  assert.equal(act(cook.w,cook.p,{type:'craft',recipe:'roast',stationId:pot.id}).ok,false);
  assert.equal(act(cook.w,cook.p,{type:'craft',recipe:'stew',stationId:pot.id}).ok,true);
  assert.equal(qty(cook.p.inventory,'stew'),1);
  assert.deepEqual(CAULDRON_COOK_RECIPES,['stew']);
  assert.deepEqual([...FIRE_COOK_RECIPES],contextRecipeIds({source:'station',stationType:'fire',tab:'craft'}));
  assert.deepEqual([...FIRE_COOK_RECIPES],contextRecipeIds({source:'station',stationType:'hearth',tab:'craft'}));
  assert.deepEqual(['stew'],contextRecipeIds({source:'station',stationType:'pot',tab:'craft'}));
});

test('T19 placement rechecks, dismantle hold, and exact ids do not retarget',()=>{
  const {w,p}=camp();
  setPack(w,p,{wood:12,stone:8,ore:2});
  const count=w.buildings.length;
  assert.equal(act(w,p,{type:'build',recipe:'wall',x:0,z:0}).ok,false);
  assert.equal(act(w,p,{type:'build',recipe:'wall',x:p.x+6,z:p.z}).ok,false);
  assert.equal(w.buildings.length,count);
  assert.equal(qty(p.inventory,'wood'),12);
  const spot={x:p.x+1.6,z:p.z};
  assert.equal(act(w,p,{type:'build',recipe:'wall',x:spot.x,z:spot.z}).ok,true);
  assert.equal(qty(p.inventory,'wood'),9);
  assert.equal(act(w,p,{type:'build',recipe:'wall',x:spot.x,z:spot.z}).ok,false);

  const shared=camp();
  shared.w.clearPack(shared.p);
  const q=shared.w.addPlayer('guest');shared.w.clearPack(q);
  const chest=shared.w.structure('chest',shared.p.x+1,shared.p.z);shared.w.buildings.push(chest);
  assert.equal(shared.w.stock(chest.store,'wood',3),3);
  const opened=shared.w.action(q.id,{type:'chestOpen',requestId:'1',chestId:chest.id});
  assert.equal(opened.ok,true);
  const blocked=act(shared.w,shared.p,{type:'build',recipe:'wall',x:shared.p.x,z:shared.p.z+2.2});
  assert.equal(blocked.ok,false);
  assert.equal(qty(chest.store,'wood'),3);
  shared.w.action(q.id,{type:'chestClose',requestId:'2',chestId:chest.id,sessionId:opened.sessionId});
  const own=shared.w.action(shared.p.id,{type:'chestOpen',requestId:'3',chestId:chest.id});
  assert.equal(own.ok,true);
  assert.equal(act(shared.w,shared.p,{type:'build',recipe:'wall',x:shared.p.x,z:shared.p.z+2.2}).ok,true);
  assert.equal(qty(chest.store,'wood'),0);

  const station=camp();
  setPack(station.w,station.p,{stone:6,ore:1});
  const bench=station.w.structure('bench',station.p.x+1,station.p.z);station.w.buildings.push(bench);
  const materials=qty(station.p.inventory,'stone');
  bench.hp=0;
  assert.equal(act(station.w,station.p,{type:'build',recipe:'pot',x:station.p.x+1.6,z:station.p.z+1.6,stationId:bench.id}).ok,false);
  assert.equal(qty(station.p.inventory,'stone'),materials);
  assert.equal(station.w.buildings.some(b=>b.type==='pot'),false);

  const kept=camp();
  setPack(kept.w,kept.p,{wood:6});
  assert.equal(qty(kept.p.inventory,'wood'),6);

  const wreck=camp();
  const wall=wreck.w.structure('wall',wreck.p.x+1,wreck.p.z);wreck.w.buildings.push(wall);
  assert.equal(act(wreck.w,wreck.p,{type:'dismantle',target:wall.id,hold:true}).ok,true);
  for(let i=0;i<20;i++)assert.equal(act(wreck.w,wreck.p,{type:'dismantle',target:wall.id,hold:true}).ok,true);
  assert.ok(wreck.w.buildings.includes(wall));
  sim(wreck.w,0.7);
  assert.ok(wreck.w.buildings.includes(wall));
  sim(wreck.w,0.15);
  assert.equal(wreck.w.buildings.includes(wall),false);
  assert.equal(qty(wreck.p.inventory,'wood'),3+2);

  const cancel=camp();
  const brief=cancel.w.structure('wall',cancel.p.x+1,cancel.p.z);cancel.w.buildings.push(brief);
  act(cancel.w,cancel.p,{type:'dismantle',target:brief.id,hold:true});
  sim(cancel.w,0.4);
  assert.equal(act(cancel.w,cancel.p,{type:'dismantle',target:brief.id,hold:false}).ok,true);
  sim(cancel.w,1);
  assert.ok(cancel.w.buildings.includes(brief));
  assert.equal(qty(cancel.p.inventory,'wood'),3);

  const hearth=w.buildings.find(b=>b.type==='hearth');
  assert.equal(act(w,p,{type:'dismantle',target:hearth.id,hold:true}).ok,false);
  sim(w,2);
  assert.ok(w.buildings.some(b=>b.id===hearth.id));

  const locked=camp();
  const box=locked.w.structure('chest',locked.p.x+1,locked.p.z);locked.w.buildings.push(box);
  assert.equal(locked.w.stock(box.store,'torch',1),1);
  const other=locked.w.addPlayer('guest');
  const lease=locked.w.action(other.id,{type:'chestOpen',requestId:'4',chestId:box.id});
  assert.equal(lease.ok,true);
  assert.equal(act(locked.w,locked.p,{type:'dismantle',target:box.id,hold:true}).code,'chestInUse');
  assert.equal(act(locked.w,other,{type:'dismantle',target:box.id,hold:true}).code,'chestInUse');
  sim(locked.w,1);
  assert.ok(locked.w.buildings.includes(box));
  assert.equal(qty(box.store,'torch'),1);
  assert.equal(locked.w.drops.some(drop=>drop.stack.itemId==='torch'),false);

  const aim=camp();
  const tree=aim.w.nodes.find(node=>node.type==='tree');
  stand(aim.p,tree);
  const nearest=aim.w.target(aim.p);
  assert.equal(nearest.entity.id,tree.id);
  assert.equal(aim.w.target(aim.p,'missing-id'),null);
  assert.equal(act(aim.w,aim.p,{type:'interact',target:'missing-id'}).ok,false);
  assert.equal(aim.p.goal,null);
  assert.equal(tree.ready,0);
  assert.equal(tree.hits,NODES.tree.hits);
  setPack(aim.w,aim.p,{wood:10,stone:8,ember:4});
  const heart=aim.w.buildings.find(b=>b.type==='hearth');
  const level=heart.level, ember=qty(aim.p.inventory,'ember');
  assert.equal(act(aim.w,aim.p,{type:'upgrade',target:'missing-id'}).ok,false);
  assert.equal(heart.level,level);
  assert.equal(qty(aim.p.inventory,'ember'),ember);
  aim.w.dropNew('wood',1,aim.p.x,aim.p.z);
  const pile=aim.w.drops[0];
  one(aim.w,aim.p,'missing-drop');
  assert.equal(pile.stack.quantity,1);
  assert.ok(aim.w.drops.includes(pile));
});

test('T20 harvest duration ignores tick size and extra input messages',()=>{
  function run(dt,spams){
    const {w,p}=camp();
    const tree=w.nodes.find(node=>node.type==='tree');
    stand(p,tree);
    hold(w,[{p,target:tree.id,spams}],3.9,dt);
    assert.equal(ready(tree,w),false);
    assert.equal(w.drops.length,0);
    hold(w,[{p,target:tree.id,spams}],0.2,dt);
    assert.equal(ready(tree,w),true);
    assert.equal(floorQty(w,'wood'),5);
    assert.equal(floorQty(w,'fiber'),1);
    assert.equal(w.stats.gathered,6);
    return w.time;
  }
  const times=[run(0.05,1),run(0.1,1),run(0.02,1),run(RULES.tick,12)];
  for(const time of times)assert.ok(time>3.99&&time<4.25,time);
  const {w,p}=camp();
  const tree=w.nodes.find(node=>node.type==='tree');
  stand(p,tree);
  const stamp=w.time;
  w.input(p.id,{x:0,z:0,act:true,target:tree.id});
  w.tick(5);
  assert.ok(w.time-stamp<=0.1+1e-9);
  assert.equal(ready(tree,w),false);
  for(let i=0;i<40;i++)act(w,p,{type:'interact',target:tree.id});
  assert.equal(ready(tree,w),false);
  assert.equal(w.drops.length,0);
});

test('T21 release, movement, damage, attack, cancel, and tool loss reset unfinished work',()=>{
  const treeOf=()=>{const {w,p}=camp();const tree=w.nodes.find(node=>node.type==='tree');stand(p,tree);return {w,p,tree};};
  const released=treeOf();
  hold(released.w,[{p:released.p,target:released.tree.id}],2);
  release(released.w,released.p,released.tree.id);
  hold(released.w,[{p:released.p,target:released.tree.id}],2);
  assert.equal(ready(released.tree,released.w),false);
  hold(released.w,[{p:released.p,target:released.tree.id}],2.1);
  assert.equal(ready(released.tree,released.w),true);

  const moved=treeOf();
  hold(moved.w,[{p:moved.p,target:moved.tree.id}],2);
  one(moved.w,moved.p,moved.tree.id,{x:1});
  stand(moved.p,moved.tree);
  hold(moved.w,[{p:moved.p,target:moved.tree.id}],2.2);
  assert.equal(ready(moved.tree,moved.w),false);
  hold(moved.w,[{p:moved.p,target:moved.tree.id}],4);
  assert.equal(ready(moved.tree,moved.w),true);

  const hurt=treeOf();
  hold(hurt.w,[{p:hurt.p,target:hurt.tree.id}],2);
  hurt.w.hurt(hurt.p,10);
  assert.ok(hurt.p.hp>0&&hurt.p.hp<100);
  hold(hurt.w,[{p:hurt.p,target:hurt.tree.id}],2.2);
  assert.equal(ready(hurt.tree,hurt.w),false);

  const swung=treeOf();
  hold(swung.w,[{p:swung.p,target:swung.tree.id}],2);
  one(swung.w,swung.p,swung.tree.id,{attack:true});
  hold(swung.w,[{p:swung.p,target:swung.tree.id}],2.2);
  assert.equal(ready(swung.tree,swung.w),false);

  const auto=treeOf();
  assert.equal(act(auto.w,auto.p,{type:'interact',target:auto.tree.id}).ok,true);
  hold(auto.w,[{p:auto.p,target:null,act:false}],1);
  assert.equal(ready(auto.tree,auto.w),false);
  assert.equal(auto.w.action(auto.p.id,{type:'setHarvestTarget',requestId:'cancel',nodeId:'',mode:'cancel'}).ok,true);
  assert.equal(auto.p.goal,null);
  hold(auto.w,[{p:auto.p,target:null,act:false}],3.2);
  assert.equal(ready(auto.tree,auto.w),false);
  assert.equal(auto.w.drops.length,0);

  const hungry=treeOf();
  hungry.p.hunger=0;hungry.p.hp=100;
  hold(hungry.w,[{p:hungry.p,target:hungry.tree.id}],4);
  assert.equal(ready(hungry.tree,hungry.w),true);
  assert.ok(hungry.p.hp<100);
  assert.equal(hungry.p.down,0);

  const mined=camp();
  const ore=mined.w.nodes.find(node=>node.type==='ore');
  stand(mined.p,ore);
  mined.w.grantEquipped(mined.p,'pick',70);
  hold(mined.w,[{p:mined.p,target:ore.id}],1);
  assert.equal(ready(ore,mined.w),false);
  mined.p.equipment.mine=null;
  hold(mined.w,[{p:mined.p,target:ore.id}],3);
  assert.equal(ready(ore,mined.w),false);
  mined.w.grantEquipped(mined.p,'pick',70);
  hold(mined.w,[{p:mined.p,target:ore.id}],2.6);
  assert.equal(ready(ore,mined.w),false);
  hold(mined.w,[{p:mined.p,target:ore.id}],1);
  assert.equal(ready(ore,mined.w),true);

  const partial=treeOf();
  hold(partial.w,[{p:partial.p,target:partial.tree.id}],1);
  assert.equal(partial.p.action,'gather');
  const network=partial.w.snapshot({purpose:'network'});
  assert.equal(network.players.find(player=>player.id===partial.p.id).action,'gather');
  const save=partial.w.snapshot({purpose:'save'});
  assert.equal(save.harvestWork,undefined);
  assert.equal(save.chestBusy,undefined);
  assert.equal(save.players.find(player=>player.id===partial.p.id).action,'idle');
  assert.equal(save.nodeChanges.some(change=>change.id===partial.tree.id),false);
  const copy=World.fromSave({world:save,savedAt:1});
  const restored=copy.nodes.find(node=>node.id===partial.tree.id);
  assert.equal(restored.ready,0);
  assert.equal(restored.hits,NODES.tree.hits);
});

test('T22 two contributors speed one yield, and a disconnect cannot keep working',()=>{
  const {w,p}=camp();
  const q=w.addPlayer('guest');
  const tree=w.nodes.find(node=>node.type==='tree');
  stand(p,tree);q.x=tree.x+.2;q.z=tree.z+1;
  hold(w,[{p,target:tree.id},{p:q,target:tree.id}],1);
  assert.equal(ready(tree,w),false);
  w.leave(q.id);
  hold(w,[{p,target:tree.id}],1.2);
  assert.equal(ready(tree,w),false);
  assert.equal(w.drops.length,0);
  hold(w,[{p,target:tree.id}],1);
  assert.equal(ready(tree,w),true);
  assert.equal(floorQty(w,'wood'),5);
  assert.equal(floorQty(w,'fiber'),1);
  assert.equal(w.stats.gathered,6);

  const alone=camp();
  const other=alone.w.addPlayer('guest');
  const pine=alone.w.nodes.find(node=>node.type==='tree');
  stand(alone.p,pine);
  hold(alone.w,[{p:alone.p,target:pine.id}],1);
  alone.w.leave(alone.p.id);
  stand(other,pine);
  hold(alone.w,[{p:other,target:pine.id}],3.2);
  assert.equal(ready(pine,alone.w),false);
  hold(alone.w,[{p:other,target:pine.id}],0.9);
  assert.equal(ready(pine,alone.w),true);
  assert.equal(floorQty(alone.w,'wood'),5);

  const pair=camp();
  const mate=pair.w.addPlayer('guest');
  const both=pair.w.nodes.find(node=>node.type==='tree');
  stand(pair.p,both);mate.x=both.x-.2;mate.z=both.z+1;
  hold(pair.w,[{p:pair.p,target:both.id},{p:mate,target:both.id}],1);
  release(pair.w,mate,both.id);
  hold(pair.w,[{p:pair.p,target:both.id,act:true},{p:mate,target:both.id,act:false}],2.2);
  assert.equal(ready(both,pair.w),true);
  assert.equal(floorQty(pair.w,'wood'),5);
  release(pair.w,pair.p,null);
  release(pair.w,mate,null);
  const stopped=camp();
  const friend=stopped.w.addPlayer('guest');
  const oak=stopped.w.nodes.find(node=>node.type==='tree');
  stand(stopped.p,oak);friend.x=oak.x+.2;friend.z=oak.z+1;
  hold(stopped.w,[{p:stopped.p,target:oak.id},{p:friend,target:oak.id}],1);
  release(stopped.w,stopped.p,oak.id);
  release(stopped.w,friend,oak.id);
  hold(stopped.w,[{p:stopped.p,target:oak.id}],2.2);
  assert.equal(ready(oak,stopped.w),false);
});

test('T23 tool wear is time-based and a broken optional tool falls back to hands',()=>{
  const worn=camp();
  const tree=worn.w.nodes.find(node=>node.type==='tree');
  stand(worn.p,tree);
  worn.w.grantEquipped(worn.p,'axe',EQUIPMENT.axe.durability);
  hold(worn.w,[{p:worn.p,target:tree.id}],1);
  assert.equal(ready(tree,worn.w),false);
  assert.ok(Math.abs(worn.p.equipment.chop.durability-(EQUIPMENT.axe.durability-1))<1e-6);

  const packed=camp();
  const pine=packed.w.nodes.find(node=>node.type==='tree');
  stand(packed.p,pine);
  packed.w.clearPack(packed.p);
  packed.p.inventory.slots[0]=packed.w.mintStack('axe',1,70);
  hold(packed.w,[{p:packed.p,target:pine.id}],1);
  assert.equal(packed.p.inventory.slots[0].durability,70);
  assert.equal(ready(pine,packed.w),false);

  const bare=camp();
  const hand=bare.w.nodes.find(node=>node.type==='tree');
  stand(bare.p,hand);
  hold(bare.w,[{p:bare.p,target:hand.id}],1);
  assert.equal(bare.p.equipment.chop,null);
  assert.equal(ready(hand,bare.w),false);

  const ore=camp();
  const seam=ore.w.nodes.find(node=>node.type==='ore');
  stand(ore.p,seam);
  ore.w.grantEquipped(ore.p,'pick',1);
  hold(ore.w,[{p:ore.p,target:seam.id}],1);
  assert.equal(ore.p.equipment.mine,null);
  assert.equal(ready(seam,ore.w),false);
  hold(ore.w,[{p:ore.p,target:seam.id}],3);
  assert.equal(ready(seam,ore.w),false);
  assert.equal(floorQty(ore.w,'ore'),0);

  const fragile=camp();
  const short=fragile.w.nodes.find(node=>node.type==='ore');
  stand(fragile.p,short);
  fragile.w.grantEquipped(fragile.p,'pick',0.5);
  hold(fragile.w,[{p:fragile.p,target:short.id}],0.5);
  assert.equal(fragile.p.equipment.mine,null);
  assert.equal(ready(short,fragile.w),false);

  const snap=camp();
  const log=snap.w.nodes.find(node=>node.type==='tree');
  stand(snap.p,log);
  snap.w.grantEquipped(snap.p,'axe',1.5);
  hold(snap.w,[{p:snap.p,target:log.id}],1.5);
  assert.equal(snap.p.equipment.chop,null);
  assert.equal(ready(log,snap.w),false);
  assert.equal(snap.w.drops.length,0);
  hold(snap.w,[{p:snap.p,target:log.id}],0.9);
  assert.equal(ready(log,snap.w),false);
  hold(snap.w,[{p:snap.p,target:log.id}],0.2);
  assert.equal(ready(log,snap.w),true);
  assert.equal(floorQty(snap.w,'wood'),5);
});

test('T24 chopped and mined yields stay on the floor until a new pickup',()=>{
  const {w,p}=camp();
  w.clearPack(p);
  const tree=w.nodes.find(node=>node.type==='tree');
  stand(p,tree);
  hold(w,[{p,target:tree.id}],4);
  assert.equal(qty(p.inventory,'wood'),0);
  assert.equal(floorQty(w,'wood'),5);
  assert.equal(floorQty(w,'fiber'),1);
  const wood=w.drops.find(drop=>drop.stack.itemId==='wood');
  const spot={x:wood.x,z:wood.z,quantity:wood.stack.quantity};
  one(w,p,tree.id);
  assert.equal(qty(p.inventory,'wood'),0);
  assert.equal(wood.stack.quantity,spot.quantity);
  assert.equal(wood.x,spot.x);
  assert.equal(wood.z,spot.z);
  hold(w,[{p,target:tree.id}],0.4);
  assert.equal(qty(p.inventory,'wood'),0);
  assert.equal(w.drops.includes(wood),true);
  p.x=30;p.z=30;
  release(w,p,null);
  sim(w,1);
  assert.equal(w.drops.includes(wood),true);
  assert.equal(wood.x,spot.x);
  assert.equal(wood.z,spot.z);
  assert.equal(wood.stack.quantity,spot.quantity);
  assert.equal(qty(p.inventory,'wood'),0);
  assert.equal(floorQty(w,'fiber'),1);

  const rock=w.nodes.find(node=>node.type==='rock');
  stand(p,rock);
  const before=w.drops.length;
  hold(w,[{p,target:rock.id}],4.5);
  assert.equal(qty(p.inventory,'stone'),0);
  assert.equal(floorQty(w,'stone'),5);
  assert.equal(w.drops.length,before+1);

  const ore=w.nodes.find(node=>node.type==='ore');
  stand(p,ore);
  w.grantEquipped(p,'pick',70);
  hold(w,[{p,target:ore.id}],3.5);
  assert.equal(qty(p.inventory,'ore'),0);
  assert.equal(floorQty(w,'ore'),3);
  assert.equal(floorQty(w,'stone'),7);

  const grave=w.nodes.find(node=>node.type==='grave');
  assert.ok(grave);
  stand(p,grave);
  hold(w,[{p,target:grave.id}],3);
  assert.equal(qty(p.inventory,'ember'),0);
  assert.equal(floorQty(w,'ember'),3);

  const grass=w.nodes.find(node=>node.type==='grass'&&!(node.ready>w.time));
  stand(p,grass);
  w.clearPack(p);
  const full=p.inventory.slots.length*20;
  assert.equal(w.stock(p.inventory,'fiber',full),full);
  hold(w,[{p,target:grass.id}],0.9);
  assert.equal(qty(p.inventory,'fiber'),full);
  assert.equal(floorQty(w,'fiber'),1+4);
});

test('T26 a grave rolls its wraith and gathered total once',()=>{
  const {w,p}=camp();
  const grave=w.nodes.find(node=>node.type==='grave');
  p.x=grave.x;p.z=grave.z+2.5;
  w.grantEquipped(p,'pick',70);
  let calls=0;const rng=w.rng;w.rng=()=>{calls++;return rng();};
  const before=w.stats.gathered;
  hold(w,[{p,target:grave.id}],3);
  assert.equal(ready(grave,w),true);
  assert.equal(calls,1);
  assert.equal(w.stats.gathered,before+5);
  assert.ok(w.enemies.filter(enemy=>enemy.type==='wraith').length<=1);
  const gathered=w.stats.gathered;
  w.enemies=[];
  sim(w,1);
  assert.equal(w.stats.gathered,gathered);
  assert.equal(calls,1);
  assert.equal(w.enemies.length,0);
  grave.ready=0;grave.hits=NODES.grave.hits;
  hold(w,[{p,target:grave.id}],3);
  assert.equal(calls,2);
  assert.equal(w.stats.gathered,gathered+5);
  assert.ok(w.enemies.length<=1);
  assert.equal(floorQty(w,'ember'),6);
});

test('T27 revive takes three real seconds and extra packets do not speed it up',()=>{
  const {w,p}=camp();
  const q=w.addPlayer('guest');
  p.x=q.x+1;p.z=q.z;
  q.hp=0;q.down=40;
  for(let i=0;i<6;i++)act(w,p,{type:'interact',target:q.id});
  assert.equal(q.down,40);
  assert.equal(w.stats.revives,0);
  hold(w,[{p,target:q.id,spams:30}],2.9);
  assert.ok(q.down>0);
  assert.equal(w.stats.revives,0);
  hold(w,[{p,target:q.id,spams:30}],0.15);
  assert.equal(q.down,0);
  assert.equal(q.hp,50);
  assert.equal(q.hunger>=35,true);
  assert.equal(w.stats.revives,1);
  const hearth=w.buildings.find(b=>b.type==='hearth');
  assert.equal(q.x,hearth.x+2);
  assert.equal(q.z,hearth.z+2);

  const pair=camp();
  const fallen=pair.w.addPlayer('guest'), helper=pair.w.addPlayer('third');
  fallen.hp=0;fallen.down=40;
  pair.p.x=fallen.x;pair.p.z=fallen.z+1;helper.x=fallen.x;helper.z=fallen.z-1;
  hold(pair.w,[{p:pair.p,target:fallen.id},{p:helper,target:fallen.id}],1.5);
  assert.ok(fallen.down>0);
  hold(pair.w,[{p:pair.p,target:fallen.id},{p:helper,target:fallen.id}],1.6);
  assert.equal(fallen.down,0);
  assert.equal(pair.w.stats.revives,1);

  const reset=camp();
  const down=reset.w.addPlayer('guest');
  down.hp=0;down.down=40;reset.p.x=down.x+1;reset.p.z=down.z;
  hold(reset.w,[{p:reset.p,target:down.id}],2);
  release(reset.w,reset.p,down.id);
  assert.equal(down.revive,0);
  hold(reset.w,[{p:reset.p,target:down.id}],2);
  assert.ok(down.down>0);
  hold(reset.w,[{p:reset.p,target:down.id}],1.1);
  assert.equal(down.down,0);

  const missed=camp();
  const friend=missed.w.addPlayer('guest');
  friend.hp=0;friend.down=40;missed.p.x=friend.x+1;missed.p.z=friend.z;
  hold(missed.w,[{p:missed.p,target:'somebody-else'}],3.2);
  assert.ok(friend.down>0);
  assert.equal(missed.w.stats.revives,0);

  const charm=camp();
  charm.w.hurt(charm.p,999);
  assert.ok(charm.p.down>0);
  act(charm.w,charm.p,{type:'interact'});
  assert.equal(charm.p.down,0);
  assert.equal(charm.p.charm,0);
  assert.equal(charm.p.hp,50);

  const dawn=camp();
  dawn.p.hp=0;dawn.p.down=10;
  dawn.w.time=RULES.cycle-.02;
  dawn.w.tick();
  assert.equal(dawn.p.down,0);
  assert.equal(dawn.p.hp,50);
  assert.equal(dawn.w.status,'playing');
});
