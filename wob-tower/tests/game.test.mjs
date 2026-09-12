import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from '../vendor/matter.min.js';
import {TowerGame,RULES,SHAPES} from '../game.mjs';
const setup=(mode='solo')=>{const g=new TowerGame({Matter,mode,seed:19});g.addPlayer('a','A');if(mode!=='solo')g.addPlayer('b','B');return g;};
const advance=(g,seconds)=>{for(let i=0;i<seconds*60;i++)g.step();};
test('lobby is frozen; only the active builder can aim or drop',()=>{
 const g=setup('online');advance(g,2);assert.equal(g.time,0);assert.equal(g.drop('a'),false);g.start();assert.equal(g.aim('b',{x:100,angle:0}),false);assert.equal(g.drop('b'),false);assert.equal(g.aim('a',{x:999,angle:0}),true);assert.equal(g.preview.x,190);assert.equal(g.aim('a',{x:NaN,angle:0}),false);g.destroy();
});
test('a centered block lands on real physics, scores once, and hands over the turn',()=>{
 const g=setup('pass');g.start();g.drop('a');assert.equal(g.drop('a'),false);advance(g,3);assert.equal(g.placed,1);assert.equal(g.currentId,'b');assert.equal(g.phase,'aim');assert.ok(g.blocks[0].body.position.y<560);advance(g,2);assert.equal(g.placed,1);g.destroy();
});
test('missing the base loses the round without awarding the fallen block',()=>{
 const g=setup();g.start();g.aim('a',{x:190,angle:0});g.drop('a');advance(g,3);assert.equal(g.phase,'over');assert.equal(g.result.reason,'fell');assert.equal(g.result.loser,'A');assert.equal(g.placed,0);g.destroy();
});
test('all irregular shapes are compound rigid bodies that remain finite',()=>{
 const g=setup();g.start();for(let s=0;s<SHAPES.length;s++){const b=g.makeBody(s,0,-s*100,s*Math.PI/12);Matter.Composite.add(g.engine.world,b);}advance(g,2);for(const b of Matter.Composite.allBodies(g.engine.world)){assert.ok(Number.isFinite(b.position.x)&&Number.isFinite(b.angle));}g.destroy();
});
test('online turn timer releases the block; solo has no forced drop',()=>{
 const g=setup('online');g.start();advance(g,RULES.turnSeconds+.2);assert.equal(g.phase,'settling');assert.equal(g.blocks.length,1);g.destroy();const solo=setup();solo.start();advance(solo,60);assert.equal(solo.blocks.length,0);solo.destroy();
});
test('rematch resets physics and scores, rotates the starting builder, and retains roster',()=>{
 const g=setup('online');g.start();g.drop('a');advance(g,3);g.lobby();g.start();assert.equal(g.blocks.length,0);assert.equal(g.placed,0);assert.equal(g.currentId,'b');assert.equal(g.players.length,2);g.destroy();
});
test('departing active player is skipped without stalling the room',()=>{
 const g=setup('online');g.addPlayer('c','C');g.start();g.removePlayer('a');assert.equal(g.currentId,'b');g.drop('b');advance(g,3);assert.equal(g.currentId,'c');g.destroy();
});
test('snapshots are bounded and cannot mutate the player roster',()=>{
 const g=setup();g.start();for(let i=0;i<80;i++)g.blocks.push({id:i,shape:0,color:0,owner:'a',body:g.makeBody(0,0,-i*50)});const snap=g.snapshot();assert.ok(JSON.stringify(snap).length<20000);snap.players[0].name='changed';assert.equal(g.players[0].name,'A');g.destroy();
});
