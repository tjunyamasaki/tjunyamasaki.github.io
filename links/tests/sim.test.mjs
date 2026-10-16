import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMES,createJar,createRng,step,setAspect,setGravity,dropFood,hitBody,poke,fling,shake,skyAt,mixHex,rollRarity,RARITIES,pickIndex,pickEvent,lifeStep,readMemory,arrive,formatAway} from '../sim.mjs';

const settle=(s,seconds=6,night=0)=>{const events=[];for(let t=0;t<seconds;t+=1/60)events.push(...step(s,1/60,{night}));return events;};
const inside=s=>s.bodies.every(b=>b.x>=b.r-1e-6&&b.x<=s.w-b.r+1e-6&&b.y>=b.r-1e-6&&b.y<=s.floor-b.r+1e-6);

test('every game gets one critter with a real link',()=>{
  const s=createJar({rng:createRng(3)});
  assert.equal(s.bodies.length,GAMES.length);
  assert.equal(new Set(GAMES.map(g=>g.href)).size,GAMES.length);
  for(const g of GAMES)assert.match(g.href,/^\/[a-z-]+\/$/);
});

test('critters stay inside the glass, even after huge, broken, or tilted steps',()=>{
  const s=createJar({rng:createRng(7)});
  settle(s);assert.ok(inside(s));
  step(s,500);step(s,NaN);step(s,-1);assert.ok(inside(s));
  shake(s,3);settle(s,2);assert.ok(inside(s));
  setGravity(s,1,0);settle(s,3);assert.ok(inside(s));
  assert.ok(s.bodies.filter(b=>b.x>s.w-b.r-12).length>=3,'tilting right slides critters right');
  setGravity(s,NaN,Infinity);assert.deepEqual(s.gravity,{x:0,y:1});
  fling(s.bodies[0],Infinity,NaN);step(s,1/60);assert.ok(s.bodies.every(b=>[b.x,b.y,b.vx,b.vy].every(Number.isFinite)));
});

test('resting critters do not sink into each other',()=>{
  const s=createJar({rng:createRng(11)});settle(s,8);
  for(let i=0;i<s.bodies.length;i++)for(let j=i+1;j<s.bodies.length;j++){
    const a=s.bodies[i], b=s.bodies[j];
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>(a.r+b.r)*.85,`${a.id} overlaps ${b.id}`);
  }
});

test('shrinking the jar keeps everyone inside',()=>{
  const s=createJar({aspect:1.9,rng:createRng(5)});settle(s,2);
  setAspect(s,1.1);assert.ok(inside(s));
  setAspect(s,'nope');assert.equal(s.h,150);
});

test('a dropped crumb gets eaten by someone awake',()=>{
  const s=createJar({rng:createRng(9)});settle(s,3);
  dropFood(s,50,5);
  const events=settle(s,12);
  assert.equal(s.food.length,0);
  assert.ok(events.some(e=>e.type==='eat'));
});

test('crumbs are capped and clamped',()=>{
  const s=createJar({rng:createRng(2)});
  for(let i=0;i<20;i++)dropFood(s,-50,Infinity);
  assert.equal(s.food.length,6);
  assert.ok(s.food.every(f=>f.x>=1.3&&f.y<=s.floor));
});

test('critters fall asleep at night, and poking wakes them',()=>{
  const s=createJar({rng:createRng(4)});
  const events=settle(s,40,1);
  assert.ok(events.some(e=>e.type==='sleep'));
  const sleeper=s.bodies.find(b=>b.mode==='sleep');
  assert.ok(sleeper);
  poke(s,sleeper);
  assert.equal(sleeper.mode,'idle');assert.equal(sleeper.pokes,1);
});

test('hit testing finds the nearest critter within its radius',()=>{
  const s=createJar({rng:createRng(1)});
  const b=s.bodies[2];
  assert.equal(hitBody(s,b.x+1,b.y),b);
  assert.equal(hitBody(s,-500,-500),null);
});

test('the sky follows the clock and tolerates nonsense',()=>{
  assert.equal(skyAt(2).night,1);assert.equal(skyAt(12).night,0);assert.equal(skyAt(12).phase,'day');
  assert.equal(skyAt(23.9).phase,'night');assert.equal(skyAt(-12).top,skyAt(12).top);
  assert.ok(skyAt(7.5).night>0&&skyAt(7.5).night<1);
  assert.equal(skyAt(NaN).night,1);
  assert.equal(mixHex('#000000','#ffffff',.5),'#808080');
});

test('rarity odds add up and are roughly right',()=>{
  assert.ok(Math.abs(RARITIES.reduce((s,r)=>s+r.chance,0)-1)<1e-9);
  const rng=createRng(42), counts={};
  for(let i=0;i<20000;i++){const r=rollRarity(rng).tier;counts[r]=(counts[r]||0)+1;}
  assert.ok(counts.legendary>400&&counts.legendary<800);
  assert.ok(counts.common>11000&&counts.common<13000);
  assert.equal(rollRarity(()=>.9999999).tier,'common');
});

test('surprise picks avoid repeats and respect the time of day',()=>{
  const rng=createRng(8);
  for(let i=0;i<200;i++){const p=pickIndex(rng,9,4);assert.ok(p!==4&&p>=0&&p<9);}
  assert.equal(pickIndex(rng,1,0),0);
  const day=new Set(), night=new Set();
  for(let i=0;i<500;i++){day.add(pickEvent(rng,0));night.add(pickEvent(rng,1));}
  assert.ok(!day.has('meteors')&&day.has('butterfly'));
  assert.ok(!night.has('butterfly')&&night.has('meteors'));
});

test('the life critter runs real Conway rules (a glider moves)',()=>{
  const n=6, g=new Uint8Array(n*n);
  for(const [x,y] of [[1,0],[2,1],[0,2],[1,2],[2,2]])g[y*n+x]=1;
  let c=g;for(let i=0;i<4;i++)c=lifeStep(c,n);
  const shifted=new Uint8Array(n*n);
  for(const [x,y] of [[1,0],[2,1],[0,2],[1,2],[2,2]])shifted[(y+1)*n+x+1]=1;
  assert.deepEqual(c,shifted);
});

test('memory survives junk and remembers visits',()=>{
  for(const raw of [null,'','{','[]','"x"','{"visits":-4,"pokes":"no","growth":9}']){
    const m=readMemory(raw,createRng(1));
    assert.equal(m.visits,0);assert.ok(m.seed>0);assert.equal(m.pokes.bloom,0);assert.ok(m.growth>=0&&m.growth<=1);
  }
  const first=arrive(readMemory(null,createRng(1)),1e12,createRng(1));
  assert.equal(first.memory.visits,1);assert.match(first.message,/Welcome/);
  const soon=arrive(first.memory,1e12+3e4,createRng(1));
  assert.equal(soon.message,null);
  const later=arrive(soon.memory,1e12+5*36e5,createRng(1));
  assert.match(later.message,/While you were gone \(5 hours\)/);
  assert.ok(later.memory.growth>soon.memory.growth);
  const restored=readMemory(JSON.stringify(later.memory));
  assert.deepEqual(restored,later.memory);
  assert.equal(formatAway(3*864e5),'3 days');assert.equal(formatAway(36e5),'an hour');
});
