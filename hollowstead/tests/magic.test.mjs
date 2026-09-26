import test from 'node:test';
import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {World} from '../src/engine.mjs';
import {makeStack} from '../src/inventory.mjs';
import {loadMagicModules} from '../src/magic/load.mjs?v=harvest-16';
import {collectMagicSprites, magicItems, magicVisuals} from '../src/magic/registry.mjs?v=harvest-16';
import {BELL} from '../src/magic/mourning-bell.mjs?v=harvest-16';
import {MagicClock, heldWeaponPose} from '../src/magic/art.mjs?v=harvest-16';
import {buildMagicEffects, drawMagicCanvas, usesMagicEffects} from '../src/magic/effects.mjs?v=harvest-16';
import {clearShowcaseWorld} from '../src/showcase.mjs';

await loadMagicModules();

function setup(id='mourning-bell', durability=65){
  const world=new World(56,{showcase:true}),p=world.addPlayer('host','Jun');world.start();
  p.x=p.z=0;p.dx=1;p.dz=0;
  p.equipment.weapon=makeStack('wand1',id,1,durability).stack;
  return {world,p};
}
function foe(world,id,x,z=0,extra={}){
  const e={id,x,z,hp:100,maxHp:100,type:'crawler',...extra};world.enemies.push(e);return e;
}
function advance(world,dt){world.time+=dt;world.stepMagic(dt);}

test('Mourning Bell waits for its wave, hits each hostile once, and preserves allies',()=>{
  const {world,p}=setup();
  const near=foe(world,'near',1),edge=foe(world,'edge',5),outside=foe(world,'outside',5.2);
  const ally=foe(world,'bones',2,0,{ally:true,type:'skeleton'});
  const guest=world.addPlayer('guest','Friend');guest.x=2;guest.z=0;
  const accidentalPlayer=foe(world,'guest',2);
  world.attack(p);
  assert.equal(p.equipment.weapon.durability,64);
  assert.equal(p.magicCast.itemId,'mourning-bell');
  advance(world,BELL.delay-.01);
  assert.equal(near.hp,100);
  advance(world,.2);
  assert.equal(near.hp,91);assert.ok(near.x>1);assert.equal(edge.hp,100);
  for(let i=0;i<30;i++)advance(world,.05);
  assert.equal(near.hp,91);assert.equal(edge.hp,91);assert.equal(outside.hp,100);
  assert.equal(ally.hp,100);assert.equal(guest.hp,100);assert.equal(accidentalPlayer.hp,100);
  assert.equal(world.magicWaves.length,0);
  assert.equal(world.events.filter(e=>e.type==='bell').length,1);
});

test('bell cooldown, broken equipment, and large ticks cannot duplicate hits',()=>{
  const {world,p}=setup('mourning-bell',1);const target=foe(world,'enemy',3);
  world.attack(p);assert.equal(p.equipment.weapon,null);
  assert.equal(world.magicWaves.length,1);
  advance(world,2);assert.equal(target.hp,91);assert.equal(world.magicWaves.length,0);
  const second=setup();second.world.attack(second.p);second.world.attack(second.p);
  assert.equal(second.world.magicWaves.length,1);assert.equal(second.p.equipment.weapon.durability,64);
  second.p.cooldown=0;second.p.down=40;second.world.attack(second.p);
  assert.equal(second.world.magicWaves.length,1);
});

test('network/save round trips preserve travelling rings and their already-hit targets',()=>{
  const {world,p}=setup();const near=foe(world,'near',1),far=foe(world,'far',4);
  world.attack(p);advance(world,.5);assert.equal(near.hp,91);assert.equal(far.hp,100);
  const snapshot=JSON.parse(JSON.stringify(world.snapshot()));
  assert.deepEqual(snapshot.magicWaves[0].hitIds,['near']);
  const guest=World.restore(snapshot);
  assert.equal(guest.player('host').magicCast.at,p.magicCast.at);
  advance(guest,.6);
  assert.equal(guest.enemies.find(e=>e.id==='near').hp,91);
  assert.equal(guest.enemies.find(e=>e.id==='far').hp,91);
});

test('both renderers receive finite, bounded effects without mutating the host world',()=>{
  for(const id of Object.keys(magicItems)){
    const {world,p}=setup(id,magicItems[id].durability);foe(world,'target',2);
    world.attack(p);advance(world,.15);
    const before=JSON.stringify(world.snapshot());
    const commands=buildMagicEffects(world,{time:world.time+.025,lead:.025});
    assert.ok(commands.length>0,id);
    assert.ok(commands.length<500,id);
    for(const c of commands){
      assert.ok(c.alpha>0&&c.alpha<=1,id);
      for(const v of c.kind==='orb'?[c.center]:c.points)assert.equal(v.every(Number.isFinite),true,id);
    }
    // Exercise the Canvas command consumer with the same projection contract.
    const ctx=new Proxy({}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
    drawMagicCanvas(ctx,commands,(x,z,y)=>({x:x*40,y:z*28-y*28}));
    assert.equal(JSON.stringify(world.snapshot()),before,id);
    assert.equal(magicVisuals(world).filter(e=>!usesMagicEffects(e.entity)).every(e=>e.entity.type==='skeleton'),true,id);
    clearShowcaseWorld(world);
    assert.deepEqual(buildMagicEffects(world,{time:world.time,lead:0}),[],id);
  }
});

test('casting poses use replicated time, interpolate between snapshots, and settle',()=>{
  const {world,p}=setup();world.attack(p);
  const clock=new MagicClock();const first=clock.sample(world,10),mid=clock.sample(world,10.05),late=clock.sample(world,15);
  assert.equal(first.lead,0);assert.ok(Math.abs(mid.lead-.05)<1e-8);assert.equal(late.lead,.1);
  assert.notEqual(heldWeaponPose(p,first.time).rotation,heldWeaponPose(p,mid.time).rotation);
  assert.equal(heldWeaponPose(p,world.time+1).active,false);
  world.time+=.05;assert.equal(clock.sample(world,15.01).lead,0);
});

test('all five items and the skeleton atlas resolve to real transparent project assets',async()=>{
  assert.equal(Object.keys(magicItems).length,5);
  const sprites=collectMagicSprites();assert.equal(sprites.length,6);
  for(const [key,def] of sprites){
    const url=new URL(def.src);await access(url);
    const png=await readFile(url);assert.equal(png.toString('ascii',1,4),'PNG',key);assert.equal(png[25],6,key);
    assert.equal(png.readUInt32BE(16)%(def.columns||1),0,key);
    assert.equal(png.readUInt32BE(20)%(def.rows||1),0,key);
  }
});
