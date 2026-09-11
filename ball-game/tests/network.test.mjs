import test from 'node:test';
import assert from 'node:assert/strict';
import {createNetwork} from '../network.mjs';
import {World} from '../engine.mjs';
// In-memory signaling and data-channel pair exercise both production endpoints.
// Public Firebase and actual NAT traversal remain a device smoke-test requirement.
function harness(){
 const rooms=new Map(),events=new Map(),pcs=new Map();let serial=0;
 const key=(...parts)=>parts.join('/');
 const listen=(k,cb)=>{if(!events.has(k))events.set(k,new Set());events.get(k).add(cb);return()=>events.get(k).delete(cb);};
 const emit=(k,data)=>{for(const cb of events.get(k)||[])queueMicrotask(()=>cb(data));};
 class Channel{
  constructor(label){this.label=label;this.readyState='connecting';this.bufferedAmount=0;}
  send(data){if(this.readyState!=='open')throw Error('closed');queueMicrotask(()=>this.other.onmessage?.({data}));}
  close(){if(this.readyState==='closed')return;this.readyState='closed';this.onclose?.();if(this.other?.readyState!=='closed'){this.other.readyState='closed';this.other.onclose?.();}}
 }
 class PC{
  constructor(){this.id=String(++serial);pcs.set(this.id,this);this.channels=[];this.connectionState='new';}
  createDataChannel(label){const c=new Channel(label);this.channels.push(c);return c;}
  async createOffer(){return{type:'offer',sdp:this.id};}
  async createAnswer(){return{type:'answer',sdp:this.id};}
  async setLocalDescription(d){this.localDescription=d;}
  async setRemoteDescription(d){this.currentRemoteDescription=d;if(d.type==='answer'){const peer=pcs.get(d.sdp);for(const channel of this.channels){const other=new Channel(channel.label);channel.other=other;other.other=channel;peer.channels.push(other);peer.ondatachannel?.({channel:other});channel.readyState=other.readyState='open';queueMicrotask(()=>{channel.onopen?.();other.onopen?.();});}this.connectionState=peer.connectionState='connected';}}
  close(){if(this.connectionState==='closed')return;this.connectionState='closed';for(const c of this.channels)c.close();this.onconnectionstatechange?.();}
 }
 const signal={ICE_CONFIG:{},initFirebase(){},async createRoom(){rooms.set('ABCDE',{});return 'ABCDE';},async roomExists(code){return rooms.has(code);},listenNewGuests(code,cb){return listen(key(code,'new'),v=>cb(v.id,v.info));},async registerGuest(code,id,name){emit(key(code,'new'),{id,info:{name}});},listenAnswer(c,id,cb){return listen(key(c,id,'answer'),cb);},listenOffer(c,id,cb){return listen(key(c,id,'offer'),cb);},listenRejected(c,id,cb){return listen(key(c,id,'reject'),cb);},async writeOffer(c,id,d){emit(key(c,id,'offer'),d);},async writeAnswer(c,id,d){emit(key(c,id,'answer'),d);},async rejectGuest(c,id,d){emit(key(c,id,'reject'),d);},listenIce(){return()=>{};},async pushIce(){},createIceBuffer(){return{async add(){},async markRemoteSet(){}};},async deleteRoom(c){rooms.delete(c);},async deleteGuest(){}};
 return {signal,PC,rooms,events};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('two endpoints join, exchange host frames/food and validated input/actions, then clean up',async()=>{
 const h=harness(),w=new World(42);w.addPlayer('local','Host');let guestId,frame,food,left=false;
 const opts={signaling:h.signal,PeerConnection:h.PC};const host=createNetwork({...opts,world:w});const guest=createNetwork({...opts,onReady:id=>guestId=id,onFrame:f=>frame=f,onFood:f=>food=f,onLeave:()=>left=true});
 try{
 const code=await host.host();await guest.join(code,'Guest',2);await flush();assert.ok(guestId);assert.equal(w.players.size,2);assert.equal(frame.type,'frame');assert.equal(food.seed,42);
 guest.input({x:99,y:0});await flush();assert.deepEqual(w.players.get(guestId).input,{x:1,y:0});
 host.start();await flush();const p=w.players.get(guestId);p.cells[0].m=100;guest.action('split');await flush();assert.equal(p.cells.length,2);
 guest.action('setBots');await flush();assert.equal(w.players.size,2);
 w.step();host.broadcast(true);await flush();assert.equal(frame.players.find(p=>p.id===guestId).cells.length,2);assert.equal(food.generations.length,900);
 await host.stop();await flush();assert.equal(left,true);assert.equal(h.rooms.size,0);
 }finally{await guest.stop();await host.stop();}
 for(const listeners of h.events.values())assert.equal(listeners.size,0);
});
test('missing or malformed rooms fail without opening a peer connection',async()=>{
 const h=harness(),guest=createNetwork({signaling:h.signal,PeerConnection:h.PC});
 await assert.rejects(guest.join('bad','x',0),/five-character/);await assert.rejects(guest.join('ABCDE','x',0),/not found/);await guest.stop();
});
test('a guest cannot claim the host identity through an input packet',async()=>{
 const h=harness(),w=new World(42);w.addPlayer('local','Host');let id;const opts={signaling:h.signal,PeerConnection:h.PC};const host=createNetwork({...opts,world:w}),guest=createNetwork({...opts,onReady:x=>id=x,onFood(){},onFrame(){}});
 try{await host.host();await guest.join('ABCDE','Guest',0);await flush();guest.input({x:1,y:0,id:'local',playerId:'local'});await flush();assert.equal(w.players.get('local').input.x,0);assert.equal(w.players.get(id).input.x,1);}finally{await guest.stop();await host.stop();}
});

test('lobby stays frozen, publishes roster changes, and only host starts the match',async()=>{
 const h=harness(),w=new World(42);w.addPlayer('local','Host');w.setBots(4);let frame,id;
 const opts={signaling:h.signal,PeerConnection:h.PC};const host=createNetwork({...opts,world:w}),guest=createNetwork({...opts,onReady:x=>id=x,onFood(){},onFrame:x=>frame=x});
 try{
  await host.host();await guest.join('ABCDE','Guest',0);await flush();assert.equal(frame.phase,'lobby');assert.equal(frame.players.length,6);
  const before=JSON.stringify([...w.players.values()].map(p=>p.cells));for(let i=0;i<120;i++)w.step();assert.equal(w.time,0);assert.equal(JSON.stringify([...w.players.values()].map(p=>p.cells)),before);
  guest.action('start');guest.action('split');await flush();assert.equal(w.phase,'lobby');assert.equal(w.players.get(id).cells.length,1);
  const seq=frame.seq;w.setBots(8);host.broadcast();await flush();assert.equal(frame.players.length,10);assert.ok(frame.seq>seq);assert.equal(frame.time,0);
  host.start();await flush();assert.equal(frame.phase,'playing');w.step();assert.ok(w.time>0);
 }finally{await guest.stop();await host.stop();}
});
test('drawings reach the host, peers and late joiners without bloating realtime frames',async()=>{
 const h=harness(),w=new World(42);w.addPlayer('local','Host').skin='1'.repeat(4096);
 const opts={signaling:h.signal,PeerConnection:h.PC};let id;const received=new Map(),lateReceived=new Map(),hostReceived=new Map();
 const host=createNetwork({...opts,world:w,onSkin:x=>hostReceived.set(x.id,x.skin)});
 const guest=createNetwork({...opts,onReady:x=>id=x,onFrame(){},onFood(){},onSkin:x=>received.set(x.id,x.skin)});
 const late=createNetwork({...opts,onReady(){},onFrame(){},onFood(){},onSkin:x=>lateReceived.set(x.id,x.skin)});
 try{
  await host.host();await guest.join('ABCDE','Artist',0,'2'.repeat(4096));await flush();assert.equal(received.get('local'),'1'.repeat(4096));assert.equal(hostReceived.get(id),'2'.repeat(4096));
  guest.skin('3'.repeat(4096));await flush();assert.equal(w.players.get(id).skin,'3'.repeat(4096));
  await late.join('ABCDE','Late',0);await flush();assert.equal(lateReceived.get(id),'3'.repeat(4096));assert.equal(lateReceived.get('local'),'1'.repeat(4096));
  guest.skin('x'.repeat(4096));await flush();assert.equal(w.players.get(id).skin,'3'.repeat(4096));
  host.skin('4'.repeat(4096));await flush();assert.equal(received.get('local'),'4'.repeat(4096));assert.equal(lateReceived.get('local'),'4'.repeat(4096));
  assert.ok(w.snapshot().players.every(p=>!('skin' in p)));
 }finally{await late.stop();await guest.stop();await host.stop();}
});
