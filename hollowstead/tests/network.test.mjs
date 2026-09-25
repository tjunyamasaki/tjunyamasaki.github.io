import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../src/engine.mjs';
import {createNetwork,PROTOCOL} from '../src/network.mjs';
import {countItem} from '../src/inventory.mjs';
import {PROTOCOL_V2} from '../src/contracts.mjs';
// In-memory signaling/transport; live Firebase/NAT traversal needs a browser check.
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
test('host and guest exchange lobby, actions, chunked state, pause and cleanup',async()=>{
 const h=harness(),world=new World(37);world.addPlayer('host','Host');let id,frame,paused,left=false;const opts={signaling:h.signal,PeerConnection:h.PC};
 const host=createNetwork({...opts,getWorld:()=>world});const guest=createNetwork({...opts,onReady:x=>id=x,onFrame:f=>frame=f,onPause:p=>paused=p,onLeave:()=>left=true});
 try{
  await host.host();await guest.join('ABCDE','Guest','moss');await flush();assert.ok(id);assert.equal(frame.status,'lobby');assert.equal(frame.players.length,2);
  guest.action({type:'start'});await flush();assert.equal(world.status,'lobby');world.start();guest.input({x:100,z:0,id:'host'});await flush();assert.equal(world.inputs.get(id).x,1);assert.equal(world.inputs.has('host'),false);
  guest.action({type:'craft',recipe:'axe'});await flush();assert.equal(countItem(world.player(id).inventory,'axe')?world.player(id).inventory.slots.find(stack=>stack?.itemId==='axe').durability:0,70);assert.equal(world.player('host').equipment.chop,null);assert.equal(countItem(world.player('host').inventory,'axe'),0);
  for(let i=0;i<120;i++)world.buildings.push(world.structure('wall',20+i%10,20+Math.floor(i/10)));
  assert.ok(JSON.stringify(world.snapshot()).length>12000);host.broadcast();await flush();assert.equal(frame.buildings.length,121);assert.equal(frame.players.find(p=>p.id===id).inventory.slots.find(stack=>stack?.itemId==='axe').durability,70);const restored=World.restore(frame);assert.equal(restored.buildings.length,121);assert.equal(restored.player(id).inventory.slots.find(stack=>stack?.itemId==='axe').durability,70);
  host.pause(true);await flush();assert.equal(paused,true);host.pause(false);await flush();assert.equal(paused,false);await host.stop();await flush();assert.equal(left,true);assert.equal(h.rooms.size,0);
 }finally{await guest.stop();await host.stop();}for(const listeners of h.events.values())assert.equal(listeners.size,0);
});
test('late joins get the running world and the fifth player is rejected',async()=>{
 const h=harness(),world=new World(73);world.addPlayer('host');world.start();world.time=540;const opts={signaling:h.signal,PeerConnection:h.PC};const host=createNetwork({...opts,getWorld:()=>world}),guests=[];let late,rejected;
 try{await host.host();for(let i=0;i<4;i++){const g=createNetwork({...opts,onFrame:f=>late=f,onLeave:reason=>rejected=reason});guests.push(g);await g.join('ABCDE','Friend '+i,'vesper');await flush();}assert.equal(world.players.filter(p=>p.online).length,4);assert.equal(late.time,540);assert.match(rejected,/full/);}finally{for(const g of guests)await g.stop();await host.stop();}
});
test('a reconnect using the same tab identity keeps equipment and inventory',async()=>{
 const h=harness(),world=new World(1);world.addPlayer('host');world.start();const opts={signaling:h.signal,PeerConnection:h.PC},identity=crypto.randomUUID();const host=createNetwork({...opts,getWorld:()=>world});let guest=createNetwork({...opts,identity});
 try{await host.host();await guest.join('ABCDE','Friend','moss');await flush();world.stock(world.player(identity).inventory,'ember',9);world.grantEquipped(world.player(identity),'sword',120);await guest.stop();await flush();assert.equal(world.player(identity).online,false);guest=createNetwork({...opts,identity});await guest.join('ABCDE','Friend','moss');await flush();assert.equal(world.players.length,2);assert.equal(world.player(identity).equipment.weapon.itemId,'sword');assert.equal(world.player(identity).equipment.weapon.durability,120);assert.equal(countItem(world.player(identity).inventory,'ember'),9);}finally{await guest.stop();await host.stop();}
});
test('malformed and missing rooms fail promptly',async()=>{const h=harness(),g=createNetwork({signaling:h.signal,PeerConnection:h.PC});await assert.rejects(g.join('oops','Friend','ember'),/five-character/);await assert.rejects(g.join('ABCDE','Friend','ember'),/not found/);await g.stop();});
test('gameplay protocol is hollowstead-2 and still answers transport pings',()=>{assert.equal(PROTOCOL,PROTOCOL_V2);assert.equal(PROTOCOL,'hollowstead-2');const source=readFileSync(new URL('../src/network.mjs',import.meta.url),'utf8');assert.match(source,/Refresh the page to update/);assert.match(source,/type:'pong'/);});
