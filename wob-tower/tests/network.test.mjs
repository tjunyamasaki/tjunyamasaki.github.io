import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from '../vendor/matter.min.js';
import {TowerGame} from '../game.mjs';
import {createNetwork} from '../network.mjs';
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

test('two endpoints share a frozen lobby, validate turns, start and rematch together',async()=>{
 const h=harness(),g=new TowerGame({Matter,mode:'online',seed:4});g.addPlayer('local','Host');let state,id,left=false;
 const opts={signaling:h.signal,PeerConnection:h.PC},host=createNetwork({...opts,game:g}),guest=createNetwork({...opts,onState:s=>state=s,onReady:x=>id=x,onLeave:()=>left=true});
 try{
  await host.create();await guest.join('ABCDE','Guest');await flush();assert.ok(id);assert.equal(state.phase,'lobby');assert.equal(state.players.length,2);
  guest.drop(0);await flush();assert.equal(g.blocks.length,0);
  host.start();await flush();assert.equal(state.phase,'aim');assert.equal(state.currentId,'local');
  guest.aim({x:90,angle:0});guest.drop(0);await flush();assert.equal(g.preview.x,0);assert.equal(g.blocks.length,0);
  g.drop('local');for(let i=0;i<240;i++)g.step();host.broadcast();await flush();assert.equal(state.currentId,id);
  guest.aim({x:10,angle:0});guest.drop(0);await flush();assert.equal(g.phase,'aim');
  guest.drop(1);await flush();assert.equal(g.phase,'settling');assert.equal(g.blocks[1].body.position.x,10);
  host.lobby();await flush();assert.equal(state.phase,'lobby');host.start();await flush();assert.equal(state.placed,0);assert.equal(state.round,2);
  await host.stop();await flush();assert.equal(left,true);
 }finally{await guest.stop();await host.stop();g.destroy();}
 for(const listeners of h.events.values())assert.equal(listeners.size,0);
});
test('new connections are rejected once a round has started',async()=>{
 const h=harness(),g=new TowerGame({Matter});g.addPlayer('local','Host');let error='';const opts={signaling:h.signal,PeerConnection:h.PC};const host=createNetwork({...opts,game:g}),guest=createNetwork({...opts,onStatus:t=>error=t});
 try{await host.create();host.start();await guest.join('ABCDE','Late');await flush();assert.match(error,/round has started/i);assert.equal(g.players.length,1);}finally{await guest.stop();await host.stop();g.destroy();}
});
