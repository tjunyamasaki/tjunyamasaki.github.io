// Builds committed v1 save fixtures from the live World snapshot shape.
// Synthetic camps only: fixed seeds, no localStorage and no private campaign.
// Re-run from the repo root: node hollowstead/tests/fixtures/generate-v1-fixtures.mjs

import {writeFileSync} from 'node:fs';
import {World} from '../../src/engine.mjs';
import {ITEMS, NODES, RULES, phaseAt} from '../../src/content.mjs';

const SAVED_AT_ORIGIN = 1760000000000;
const here = new URL('./', import.meta.url);

function savedAtFor(time){return SAVED_AT_ORIGIN+Math.round(time*1000);}
function write(name, data){writeFileSync(new URL(name, here), `${JSON.stringify(data, null, 2)}\n`);}
function saveDocument(world, time){return {savedAt:savedAtFor(time), world:world.snapshot()};}

function place(w, p, recipe){
  const offsets=[[1.5,0],[2,0.5],[-1.5,0.5],[0,1.5],[2.5,-0.5],[-2,1],[1.5,1.5],[3,1],[-2.5,-1],[3.5,0.5]];
  for(const [dx,dz] of offsets){
    const before=w.buildings.length;
    p.cooldown=0;
    w.action(p.id,{type:'build',recipe,x:p.x+dx,z:p.z+dz});
    if(w.buildings.length>before)return w.buildings[w.buildings.length-1];
  }
  throw new Error(`could not place ${recipe}: ${p.notice||'no legal spot'}`);
}

function craft(w, p, recipe){
  const before=p.noticeAt;
  p.cooldown=0;
  w.action(p.id,{type:'craft',recipe});
  if(p.noticeAt!==before)throw new Error(`craft ${recipe}: ${p.notice}`);
}

function normal(){
  const w=new World(402);
  const p=w.addPlayer('host','Jun','ember');
  w.start();
  w.time=335;
  craft(w,p,'axe');
  const tree=w.nodes.find(n=>n.type==='tree');
  p.x=tree.x;
  p.z=tree.z+1;
  for(let i=0;i<2;i++){p.cooldown=0;w.action(p.id,{type:'interact',target:tree.id});}
  if(!(tree.ready>w.time)||tree.hits>0)throw new Error('starter tree was not depleted');
  w.give(p,'stone',8);
  w.give(p,'wood',8);
  w.give(p,'fiber',6);
  craft(w,p,'pick');
  craft(w,p,'spear');
  craft(w,p,'torch');
  const rock=w.nodes.find(n=>n.type==='rock');
  p.x=rock.x;
  p.z=rock.z+1;
  p.cooldown=0;
  w.action(p.id,{type:'interact',target:rock.id});
  if(rock.hits!==NODES.rock.hits-2)throw new Error(`expected a partial rock, hits=${rock.hits}`);
  const chest=place(w,p,'chest');
  p.cooldown=0;
  w.action(p.id,{type:'deposit',target:chest.id});
  if(!chest.store.wood)throw new Error(`deposit failed: ${p.notice}`);
  w.give(p,'pumpkin',2);
  w.give(p,'mushroom',1);
  w.give(p,'roast',1);
  p.equipment.axe=54;
  p.equipment.pick=61;
  p.equipment.spear=88;
  p.equipment.torch=167.5;
  p.lantern=true;
  w.drop('stone',4,p.x+0.4,p.z+0.2);
  p.hp=76;
  p.hunger=64;
  p.courage=81;
  const load=Object.values(p.inventory).reduce((sum,n)=>sum+n,0);
  if(load<=0||load>=RULES.capacity)throw new Error(`ordinary pack should be under capacity, load=${load}`);
  if(p.equipment.sword)throw new Error('ordinary save should have one weapon');
  return saveDocument(w, w.time);
}

function fullStorage(){
  const w=new World(402);
  const host=w.addPlayer('host','Jun','ember');
  const guest=w.addPlayer('guest','Moss','moss');
  w.start();
  w.time=190;
  w.give(host,'wood',30);
  w.give(host,'stone',20);
  w.give(host,'fiber',20);
  w.give(host,'ore',8);
  w.give(host,'ember',4);
  const chest=place(w,host,'chest');
  const bench=place(w,host,'bench');
  host.x=bench.x+1;
  host.z=bench.z;
  for(const recipe of ['axe','pick','spear','torch','armor','sword'])craft(w,host,recipe);
  host.equipment.axe=48;
  host.equipment.pick=22;
  host.equipment.spear=36;
  host.equipment.sword=140;
  host.equipment.armor=77;
  host.equipment.torch=167.5;
  host.lantern=true;
  host.x=chest.x+1;
  host.z=chest.z;
  host.cooldown=0;
  w.action(host.id,{type:'deposit',target:chest.id});
  for(let i=0;i<5;i++){
    host.inventory={wood:RULES.capacity,berry:2};
    host.cooldown=0;
    const before=chest.store.wood||0;
    w.action(host.id,{type:'deposit',target:chest.id});
    if((chest.store.wood||0)!==before+RULES.capacity)throw new Error(`deposit failed: ${host.notice}`);
  }
  if(host.inventory.berry!==2)throw new Error('deposit moved food');
  for(const itemId of Object.keys(ITEMS))if(itemId!=='wood')chest.store[itemId]=80;
  host.inventory={};
  const grants=[['wood',40],['stone',30],['fiber',20],['berry',10],['ore',8],['ember',5],['seed',4],['pumpkin',3]];
  for(const [itemId,count] of grants){
    const stored=w.give(host,itemId,count);
    if(stored!==count)throw new Error(`give ${itemId} stored ${stored}`);
  }
  guest.inventory={};
  for(const itemId of Object.keys(ITEMS))guest.inventory[itemId]=100;
  const tree=w.nodes.find(n=>n.type==='tree');
  tree.hits=0;
  tree.ready=w.time+NODES.tree.regrow;
  const rock=w.nodes.find(n=>n.type==='rock');
  rock.hits=NODES.rock.hits-1;
  w.drop('stone',45,host.x+0.5,host.z);
  w.drop('bandage',21,host.x,host.z+0.5);
  host.hp=64;
  host.hunger=37;
  host.courage=22;
  if(!host.equipment.sword||!host.equipment.spear)throw new Error('full save needs both weapons');
  return saveDocument(w, w.time);
}

function boundary(time){
  const w=new World(402);
  const p=w.addPlayer('host','Jun','ember');
  w.start();
  w.time=time;
  const tree=w.nodes.find(n=>n.type==='tree');
  tree.hits=NODES.tree.hits-2;
  const rock=w.nodes.find(n=>n.type==='rock');
  rock.hits=0;
  rock.ready=time+NODES.rock.regrow;
  w.drop('berry',2,1,2);
  const phase=phaseAt(time);
  if(phase==='night'){
    w.spawnWave();
    w.nextSpawn=time+32;
  }
  p.hp=80;
  p.hunger=70;
  p.courage=60;
  return {name:boundaryName(time), time, phase, ...saveDocument(w, time)};
}

function boundaryName(time){
  const names={
    0:'cycle0-day-start',
    150:'cycle0-dusk-start',
    180:'cycle0-night-start',
    260:'cycle1-day-start',
    410:'cycle1-dusk-start',
    440:'cycle1-night-start',
    1220:'cycle4-night-start',
    1300:'cycle5-day-start',
  };
  const name=names[time];
  if(!name)throw new Error(`unexpected boundary ${time}`);
  return name;
}

const normalSave=normal();
const fullSave=fullStorage();
const boundaries=[0,150,180,260,410,440,1220,1300].map(boundary);
for(const save of [normalSave, fullSave, ...boundaries]){
  const restored=World.restore(JSON.parse(JSON.stringify(save.world)));
  if(JSON.stringify(restored.snapshot())!==JSON.stringify(save.world))throw new Error(`round-trip failed for ${save.world.time}`);
}
write('v1-normal.json', normalSave);
write('v1-full-storage.json', fullSave);
write('v1-phase-boundaries.json', {
  schedule:{day:150, dusk:30, night:80, cycle:260},
  saves:boundaries,
});
console.log(`wrote normal t=${normalSave.world.time}, full t=${fullSave.world.time}, boundaries=${boundaries.length}`);
