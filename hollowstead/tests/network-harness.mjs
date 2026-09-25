// Paired in-memory channels for production network protocol tests.
export function harness({mapMessage}={}){
 const rooms=new Map(),events=new Map(),pcs=new Map(),traffic=[];let serial=0;
 const key=(...parts)=>parts.join('/');
 const listen=(k,cb)=>{if(!events.has(k))events.set(k,new Set());events.get(k).add(cb);return()=>events.get(k).delete(cb);};
 const emit=(k,data)=>{for(const cb of events.get(k)||[])queueMicrotask(()=>cb(data));};
 class Channel{
  constructor(label){this.label=label;this.readyState='connecting';this.bufferedAmount=0;}
  send(data){if(this.readyState!=='open')throw Error('closed');let message;try{message=JSON.parse(data);}catch{queueMicrotask(()=>this.other.onmessage?.({data}));return;}traffic.push({channel:this,message});const mapped=mapMessage?.(message,this);if(mapped===null)return;const payload=mapped===undefined?data:JSON.stringify(mapped);queueMicrotask(()=>this.other.onmessage?.({data:payload}));}
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
 return {signal,PC,rooms,events,traffic,pcs};
}
export const flush=()=>new Promise(resolve=>setImmediate(resolve));
