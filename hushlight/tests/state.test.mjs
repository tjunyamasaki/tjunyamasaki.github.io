import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,step,followers,nearbyShrine,constrainPosition,LEVEL,OBSTACLES,obstaclesFor} from '../state.mjs';
import {directionToTarget} from '../navigation.mjs';
const playing=()=>{const s=createState();s.phase='playing';return s;};
function collect(s,ids){for(const id of ids){Object.assign(s.player,{x:s.lights[id].x,z:s.lights[id].z});step(s,{},.016);}}
function beside(s,index){Object.assign(s.player,{x:s.shrines[index].x+1.2,z:s.shrines[index].z});}
function hold(s,n=150){const events=[];for(let i=0;i<n;i++)events.push(...step(s,{kindle:true},.02));return events;}
test('intro and pause freeze simulation',()=>{
  const s=createState(),original=structuredClone(s);step(s,{x:1,kindle:true},100);assert.deepEqual(s,original);
  s.phase='playing';const before=structuredClone(s);step(s,{paused:true,z:1},1);assert.deepEqual(s,before);
});
test('diagonal speed is normalized and frame deltas are bounded',()=>{
  const a=playing(),b=playing();step(a,{x:1},.05);step(b,{x:1,z:1},.05);
  assert.ok(Math.abs(Math.hypot(a.player.x,a.player.z-6.5)-Math.hypot(b.player.x,b.player.z-6.5))<1e-9);
  const s=playing();step(s,{x:1},500);assert.equal(s.elapsed,.05);assert.ok(s.player.x<=LEVEL.speed*.05);
  step(s,{x:Infinity},NaN);assert.ok(Number.isFinite(s.player.x));assert.equal(s.elapsed,.05);
});
test('outer rim clamps safely in every direction',()=>{
  for(let i=0;i<360;i+=3){const a=i*Math.PI/180,p=constrainPosition(Math.cos(a)*100,Math.sin(a)*100);assert.ok(Math.hypot(p.x,p.z)<=LEVEL.radius+1e-8);}
});
test('solid bases push the keeper out, including exact center',()=>{
  for(const o of OBSTACLES){const p=constrainPosition(o.x,o.z);assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>=o.radius+.24-1e-8);}
});
test('all collectible anchors are off solids and inside the rim',()=>{
  for(const [x,z] of LEVEL.lights){assert.ok(Math.hypot(x,z)<LEVEL.radius);for(const o of OBSTACLES)assert.ok(Math.hypot(x-o.x,z-o.z)>o.radius+.24);}
});
test('collection needs proximity, caps at three, and emits once',()=>{
  const s=playing();assert.deepEqual(step(s,{},0),[]);collect(s,[0,1,2,3]);assert.equal(followers(s).length,3);assert.equal(s.lights[3].status,'wild');
  Object.assign(s.player,{x:s.lights[0].x,z:s.lights[0].z});assert.equal(step(s,{},.02).length,0);
});
test('zero or two lights cannot kindle',()=>{
  const s=playing();beside(s,0);hold(s);assert.equal(s.lit,0);collect(s,[0,1]);beside(s,0);hold(s);assert.equal(s.shrines[0].charge,0);
});
test('release drains charge; movement or leaving range resets it',()=>{
  const s=playing();collect(s,[0,1,2]);beside(s,0);hold(s,30);const charged=s.shrines[0].charge;assert.ok(charged>0&&charged<1);
  step(s,{},.05);assert.ok(s.shrines[0].charge<charged);step(s,{x:.5,kindle:true},.02);assert.equal(s.shrines[0].charge,0);
  beside(s,0);hold(s,30);Object.assign(s.player,{x:0,z:5});step(s,{kindle:true},.02);assert.equal(s.shrines[0].charge,0);
});
test('kindling consumes exactly three lights and cannot repeat',()=>{
  const s=playing();collect(s,[0,1,2]);beside(s,0);const events=hold(s);
  assert.equal(events.filter(e=>e.type==='kindled').length,1);assert.equal(s.lit,1);assert.equal(followers(s).length,0);
  assert.equal(s.lights.filter(l=>l.status==='delivered').length,3);assert.equal(nearbyShrine(s),undefined);
  collect(s,[3,4,5]);beside(s,0);hold(s);assert.equal(s.lit,1);assert.equal(followers(s).length,3);
});
test('all six shrine orders finish once with nine delivered lights',()=>{
  for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
    const s=playing(),events=[];order.forEach((shrine,i)=>{collect(s,[i*3,i*3+1,i*3+2]);beside(s,shrine);events.push(...hold(s));});
    assert.equal(s.phase,'complete');assert.equal(s.lit,3);assert.equal(s.lights.filter(l=>l.status==='delivered').length,9);
    assert.equal(events.filter(e=>e.type==='completed').length,1);const completedAt=s.completedAt;
    assert.equal(hold(s).length,0);assert.equal(s.elapsed,completedAt);const x=s.player.x;step(s,{x:.5},.05);assert.notEqual(s.player.x,x);
  }
});
test('restart is independent and level definitions remain unchanged',()=>{
  const s=playing();collect(s,[0,1,2]);beside(s,0);hold(s);const fresh=createState();
  assert.equal(fresh.phase,'intro');assert.equal(fresh.lit,0);assert.equal(fresh.lights.filter(l=>l.status==='wild').length,9);
  assert.equal(fresh.shrines[0].charge,0);assert.equal(LEVEL.shrines[0].lit,undefined);
});
test('tap navigation reaches every light and shrine from every other objective',()=>{
  const points=[...LEVEL.lights.map(([x,z])=>({x,z})),...LEVEL.shrines.map(s=>({x:s.x+1.2,z:s.z}))];
  for(const from of points)for(const to of points){
    const s=playing();Object.assign(s.player,from);let reached=false;
    for(let i=0;i<1500;i++){
      const direction=directionToTarget(s.player,to);
      if(direction.arrived){reached=true;break;}step(s,direction,.02);
    }
    assert.ok(reached,`route ${JSON.stringify(from)} → ${JSON.stringify(to)} stuck at ${JSON.stringify(s.player)}`);
  }
});
test('endless offerings recycle a fixed pool and never enter the ending',()=>{
  const s=createState('endless');s.phase='playing';const events=[];
  for(let offering=0;offering<100;offering++){
    collect(s,[0,1,2]);beside(s,0);events.push(...hold(s));
    assert.equal(s.offerings,offering+1);assert.equal(s.lights.length,9);
    assert.equal(s.lights.filter(l=>l.status==='wild').length,9);
    assert.equal(s.shrines[0].lit,false);assert.equal(s.shrines[0].charge,0);
    assert.equal(s.phase,'playing');assert.equal(s.completedAt,null);
  }
  assert.equal(events.filter(e=>e.type==='offered').length,100);
  assert.equal(events.filter(e=>e.type==='completed').length,0);
  assert.ok(s.lastOfferingAt>0);assert.equal(s.lit,0);
});
test('endless altar cannot consume partial lights and pause freezes a charge',()=>{
  const s=createState('endless');s.phase='playing';collect(s,[0,1]);beside(s,0);hold(s);assert.equal(s.offerings,0);
  collect(s,[2]);beside(s,0);hold(s,30);const before=structuredClone(s);
  step(s,{kindle:true,paused:true},10);assert.deepEqual(s,before);
  Object.assign(s.player,{x:5,z:5});step(s,{kindle:true},.05);assert.equal(s.shrines[0].charge,0);
});
test('endless collision and tap routes match the central altar',()=>{
  assert.equal(obstaclesFor('endless').length,2);
  assert.deepEqual(constrainPosition(-5,0,'endless'),{x:-5,z:0});
  const p=constrainPosition(0,0,'endless');assert.ok(Math.hypot(p.x,p.z)>=.94);
  const points=[...LEVEL.lights.map(([x,z])=>({x,z})),{x:1.2,z:0},{x:-1.2,z:0}];
  for(const from of points)for(const to of points){
    const s=createState('endless');s.phase='playing';Object.assign(s.player,from);let reached=false;
    for(let i=0;i<1500;i++){const dir=directionToTarget(s.player,to,s.mode);if(dir.arrived){reached=true;break;}step(s,dir,.02);}
    assert.ok(reached,`endless route ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  }
});
