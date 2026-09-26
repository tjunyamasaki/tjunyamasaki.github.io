import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {createActionSession,createActionClient} from '../src/transactions.mjs';
import {createWriter} from '../src/transport.mjs';
import {SEND_BUFFER_GUARD,SNAPSHOT_CHUNK_CHARS,SNAPSHOT_MAX_CHUNKS} from '../src/contracts.mjs';

test('N02 duplicate requests apply once, cache eviction never permits replay, sessions bind to their actor and world',()=>{
  const w=new World(4),p=w.addPlayer('host'),q=w.addPlayer('guest');w.start();let now=0;
  const session=createActionSession({getWorld:()=>w,actorId:p.id,now:()=>now});
  const stack=p.inventory.slots.find(s=>s?.itemId==='wood');
  const cmd={type:'dropItem',requestId:session.sessionId+':1',worldId:w.networkId,uid:stack.uid,quantity:1,inventoryRevision:p.inventory.revision,playerId:q.id};
  const result=session.execute(cmd);assert.equal(result.ok,true);assert.equal(w.count(p,'wood'),2);assert.equal(w.count(q,'wood'),3);
  assert.deepEqual(session.execute({...cmd,quantity:3}),result);assert.equal(w.drops.length,1);
  for(let i=2;i<=70;i++){now+=60;session.execute({type:'move',x:3,z:2,worldId:w.networkId,requestId:session.sessionId+':'+i});}
  assert.equal(session.execute(cmd).code,'oldRequest');assert.equal(w.drops.length,1);
  const other=createActionSession({getWorld:()=>w,actorId:q.id});
  assert.equal(other.execute(cmd).code,'wrongSession');
  assert.equal(session.execute({type:'move',x:3,z:2,worldId:'previous-world',requestId:session.sessionId+':71'}).code,'worldChanged');
});

test('N09 malformed commands and excess transaction rate return bounded explicit results',()=>{
  const w=new World(2);w.addPlayer('host');w.start();
  const session=createActionSession({getWorld:()=>w,actorId:'host',now:()=>0});
  for(const cmd of [null,{},[],17,'bad',{requestId:'__proto__'},{requestId:session.sessionId+':9007199254740993'}]){
    assert.equal(session.execute(cmd).ok,false);
  }
  for(let i=1;i<=24;i++)assert.equal(session.execute({type:'move',x:2,z:2,worldId:w.networkId,requestId:session.sessionId+':'+i}).ok,true);
  assert.equal(session.execute({type:'move',x:2,z:2,worldId:w.networkId,requestId:session.sessionId+':25'}).code,'rateLimited');
});

test('N09 JSON object keys cannot coerce legacy recipe/type lookups or replace authoritative containers',()=>{
  const w=new World(2),p=w.addPlayer('host');w.start();
  const session=createActionSession({getWorld:()=>w,actorId:p.id});
  for(const [index,cmd] of [
    {type:{toString:null,valueOf:null}},
    {type:'craft',recipe:{toString:null,valueOf:null}},
    {type:'build',recipe:'wall',x:'1',z:3},
  ].entries()){
    assert.equal(session.execute({...cmd,worldId:w.networkId,requestId:session.sessionId+':'+(index+1)}).code,'invalidCommand');
  }
  const stack=p.inventory.slots.find(Boolean),before=JSON.stringify(p.inventory);
  const reply=session.execute({type:'inventoryMove',requestId:session.sessionId+':4',worldId:w.networkId,sourceContainerId:p.inventory.id,destinationContainerId:p.inventory.id,sourceSlot:0,destinationSlot:20,uid:'forged',quantity:1,sourceRevision:p.inventory.revision,destinationRevision:p.inventory.revision,source:{...p.inventory,slots:[{...stack,uid:'forged'}]}});
  assert.equal(reply.code,'unknownItem');assert.equal(JSON.stringify(p.inventory),before);
});

test('N06 result before snapshot remains pending; retry repeats the same request and disconnect settles it',async()=>{
  let now=0;const sent=[],completed=[];
  const client=createActionClient({send:cmd=>sent.push(cmd),now:()=>now,onResult:r=>completed.push(r)});
  client.start('connection');client.acceptFrame({worldId:'world',transactionRevision:2});
  const promise=client.request({type:'chestOpen',chestId:'b1'});
  now=1600;client.tick();assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);
  client.acceptResult({type:'actionResult',requestId:promise.requestId,ok:true,code:'ok',worldId:'world',worldRevision:3,affectedRevisions:{},sessionId:'chest'});
  assert.equal(completed.length,0);assert.equal(client.pendingCount,1);
  client.acceptFrame({worldId:'world',transactionRevision:2});assert.equal(completed.length,0);
  client.acceptFrame({worldId:'world',transactionRevision:3});assert.equal((await promise).sessionId,'chest');assert.equal(completed.length,1);
  const pending=client.request({type:'chestClose'});client.close();assert.equal((await pending).code,'disconnected');
});

test('new expedition snapshots invalidate pending actions instead of applying old receipts',async()=>{
  const client=createActionClient({send:()=>{}});client.start('connection');
  client.acceptFrame({worldId:'old',transactionRevision:20});const promise=client.request({type:'chestOpen',chestId:'b1'});
  client.acceptFrame({worldId:'new',transactionRevision:0});assert.equal((await promise).code,'worldChanged');
  client.acceptResult({type:'actionResult',requestId:promise.requestId,ok:true,code:'ok',worldId:'old',worldRevision:21,affectedRevisions:{}});
  assert.equal(client.pendingCount,0);
});

test('T34 large snapshots finish across backpressure, with prioritized receipts and no interleaved frames',()=>{
  const packets=[],errors=[],encoder=new TextEncoder();
  const channel={readyState:'open',bufferedAmount:0,send(data){this.bufferedAmount+=encoder.encode(data).length;assert.ok(this.bufferedAmount<=SEND_BUFFER_GUARD);packets.push(JSON.parse(data));}};
  const writer=createWriter(channel,{onError:error=>errors.push(error)});
  const original={data:'🌙'.repeat(120000),worldId:'world',transactionRevision:7};
  assert.equal(writer.snapshot(original),true);assert.equal(writer.pendingFrame,true);
  writer.send({type:'actionResult',requestId:'reply'});assert.equal(writer.snapshot({data:'newer'}),false);
  for(let i=0;i<20&&writer.pendingFrame;i++){channel.bufferedAmount=0;channel.onbufferedamountlow();}
  assert.equal(writer.pendingFrame,false);
  const chunks=packets.filter(p=>p.type==='chunk');
  assert.equal(chunks.length,chunks[0].count);assert.equal(new Set(chunks.map(c=>c.part)).size,1);
  assert.deepEqual(chunks.map(c=>c.i),Array.from({length:chunks.length},(_,i)=>i));
  assert.deepEqual(JSON.parse(chunks.map(c=>c.data).join('')),original);
  assert.ok(packets.findIndex(p=>p.type==='actionResult')<packets.length-1);
  assert.equal(writer.snapshot({data:'x'.repeat(SNAPSHOT_CHUNK_CHARS*SNAPSHOT_MAX_CHUNKS)}),false);
  assert.match(errors[0],/too large/);writer.close();
});
