import test from 'node:test';
import assert from 'node:assert/strict';
import {World,RULES,radius,totalMass,foodAt,decodeFrame} from '../engine.mjs';
function arena(){const w=new World(123);w.food=[];w.viruses=[];w.think=()=>{};return w;}
function add(w,id,m,x=2100,y=2100){const p=w.addPlayer(id,id);Object.assign(p.cells[0],{x,y,m});return p;}
test('split conserves mass, launches, limits to 16, and merge has a cooldown',()=>{
 const w=arena(),p=add(w,'a',1024);w.input('a',{x:1,y:0});w.action('a','split');assert.equal(p.cells.length,2);assert.equal(totalMass(p),1024);assert.ok(p.cells[1].vx>0);
 for(let i=0;i<6;i++){w.time+=.3;w.action('a','split');}assert.equal(p.cells.length,16);assert.equal(totalMass(p),1024);
 for(const c of p.cells)Object.assign(c,{x:2100,y:2100,vx:0,vy:0});w.step();assert.equal(p.cells.length,16);
 w.time=100;for(const c of p.cells)Object.assign(c,{x:2100,y:2100,vx:0,vy:0});w.step();assert.equal(p.cells.length,1);
});
test('eat ratio and overlap gate consumption; equal size cannot eat',()=>{
 const w=arena(),a=add(w,'a',100),b=add(w,'b',100);w.step();assert.equal(b.cells.length,1);a.cells[0].m=200;b.cells[0].x=2400;w.step();assert.equal(b.cells.length,1);
 b.cells[0].x=a.cells[0].x;b.cells[0].y=a.cells[0].y;w.step();assert.equal(b.cells.length,0);assert.equal(a.kills,1);assert.ok(totalMass(a)>299);
});
test('small cells pass viruses; large cells burst with mass conserved plus virus',()=>{
 const w=arena(),p=add(w,'a',50);w.viruses=[{id:999,x:2100,y:2100,m:100,vx:0,vy:0,feeds:0}];w.step();assert.equal(p.cells.length,1);
 p.cells[0].m=200;w.step();assert.ok(p.cells.length>1);assert.ok(p.cells.length<=16);assert.ok(Math.abs(totalMass(p)-300)<1);
});
test('ejection costs 16, yields 12, rate limits and feeding a virus launches one after 7 feeds',()=>{
 const w=arena(),p=add(w,'a',200);w.input('a',{x:1,y:0});w.action('a','eject');assert.equal(totalMass(p),184);assert.equal(w.ejected[0].m,12);w.action('a','eject');assert.equal(w.ejected.length,1);
 w.viruses=Array.from({length:22},(_,i)=>({id:900+i,x:1000+i*100,y:1000,m:100,vx:0,vy:0,feeds:0}));
 w.ejected=Array.from({length:7},(_,i)=>({id:1000+i,x:1000,y:1000,m:12,vx:100,vy:0,born:0,owner:'a'}));w.step();assert.equal(w.viruses.length,23);assert.equal(w.viruses[0].feeds,0);assert.equal(w.viruses[0].m,100);assert.ok(w.viruses.at(-1).vx>0);
});
test('food consumption increments generation deterministically and bounds hold',()=>{
 const w=new World(789);w.think=()=>{};const p=w.addPlayer('a','A');Object.assign(p.cells[0],{x:w.food[0].x,y:w.food[0].y});w.step();assert.equal(w.generations[0],1);assert.deepEqual(w.food[0],foodAt(789,0,1));
 p.cells[0].x=-999;p.cells[0].y=99999;w.step();const c=p.cells[0];assert.ok(c.x>=radius(c.m));assert.ok(c.y<=RULES.size-radius(c.m));
});
test('invalid movement is ignored, normalized movement and stale inputs stop',()=>{
 const w=arena(),p=add(w,'a',25);w.input('a',{x:Infinity,y:1});assert.deepEqual(p.input,{x:0,y:0});w.input('a',{x:1e30,y:1e30});assert.ok(Math.hypot(p.input.x,p.input.y)<=1.00001);w.time=1;w.step();assert.deepEqual(p.input,{x:0,y:0});
});
test('bot counts, human capacity, death cooldown, and respawn',()=>{
 const w=arena();w.setBots(999);assert.equal([...w.players.values()].filter(p=>p.bot).length,16);w.setBots(4);assert.equal(w.players.size,4);w.setBots(0);assert.equal(w.players.size,0);
 for(let i=0;i<8;i++)assert.ok(w.addPlayer(String(i),'P'));assert.equal(w.addPlayer('extra','P'),null);
 const p=w.players.get('0');p.cells=[];p.deadAt=0;w.action('0','respawn');assert.equal(p.cells.length,0);w.time=2;w.action('0','respawn');assert.equal(p.cells.length,1);assert.equal(totalMass(p),25);
});
test('packed frames round trip and maximum population stays under a 64KB message',()=>{
 const w=new World(42);w.setBots(16);for(let i=0;i<8;i++)w.addPlayer(`p${i}`,'abcdefghijklmnopqr');
 for(const p of w.players.values()){p.cells=Array.from({length:16},()=>w.cell(w.position(),w.position(),100));}
 const snap=w.snapshot(),decoded=decodeFrame(snap);assert.equal(decoded.players.length,24);assert.equal(decoded.players[0].cells.length,16);assert.ok(Buffer.byteLength(JSON.stringify(snap))<64000);
});
test('a populated arena runs for a minute without invalid mass or coordinates',()=>{
 const w=new World(568);w.setBots(16);w.addPlayer('local','Player');
 for(let i=0;i<3600;i++)w.step();
 for(const p of w.players.values())for(const c of p.cells){assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.m));assert.ok(c.m>=10);assert.ok(p.cells.length<=16);}
});
test('launched equal-size fragments converge and reunite after cooldown',()=>{
 const w=arena(),p=add(w,'a',100);w.input('a',{x:1,y:0});w.action('a','split');
 for(let i=0;i<300;i++)w.step();assert.equal(p.cells.length,2);assert.ok(Math.abs(p.cells[0].x-p.cells[1].x)>30);
 for(let i=0;i<2400;i++)w.step();assert.equal(p.cells.length,1);
});
