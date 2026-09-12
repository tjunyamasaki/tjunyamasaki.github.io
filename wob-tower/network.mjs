import {RULES} from './game.mjs';
export const PROTOCOL='wob-tower-v1';
export function createNetwork({game,onState,onReady,onStatus,onLeave,signaling,PeerConnection=globalThis.RTCPeerConnection}){
  let signal=signaling,code='',host=false,stopped=false,guest=null,unsub=()=>{},watch=0;
  const id=crypto.randomUUID(),peers=new Map();
  const status=(text,error=false)=>onStatus?.(text,error);
  const send=(ch,data)=>{if(ch?.readyState!=='open'||ch.bufferedAmount>65536)return;try{ch.send(JSON.stringify(data));}catch{}};
  async function init(){signal??=await import('../js/signaling.js');signal.initFirebase();}
  function closePeer(key){const p=peers.get(key);if(!p)return;peers.delete(key);clearTimeout(p.timer);p.unsubs.forEach(f=>f());p.pc.onconnectionstatechange=null;p.control.onclose=null;p.pc.close();game.removePlayer(key);signal.deleteGuest(code,key).catch(()=>{});}
  function fail(message){if(stopped)return;status(message,true);onLeave?.();void stop();}
  function heartbeat(){clearInterval(watch);watch=setInterval(()=>{
    if(stopped)return;
    if(host){for(const [key,p] of peers)if(p.ready&&performance.now()-p.lastSeen>20000)closePeer(key);}
    else if(guest?.ready){if(performance.now()-guest.lastSeen>20000){fail('The host disconnected. Join a new room to play again.');return;}send(guest.control,{type:'ping'});}
  },2000);}
  async function create(){await init();host=true;game.phase='lobby';code=await signal.createRoom(`${PROTOCOL}:${id}`);if(stopped){await signal.deleteRoom(code);return '';}
    unsub=signal.listenNewGuests(code,(key,info)=>void attach(key,info).catch(()=>{closePeer(key);status('A player could not connect. Ask them to try again.',true);}));heartbeat();return code;
  }
  async function attach(key,info){
    if(stopped||peers.has(key)||info.offer||info.rejected)return;
    if(game.phase!=='lobby'||peers.size>=RULES.maxPlayers-1){await signal.rejectGuest(code,key,game.phase!=='lobby'?'This round has started. Join when the host returns to the room.':'The room is full.');return;}
    const pc=new PeerConnection(signal.ICE_CONFIG),ice=signal.createIceBuffer(pc),control=pc.createDataChannel(PROTOCOL),frames=pc.createDataChannel('tower-frames',{ordered:false,maxRetransmits:0});
    const peer={pc,control,frames,ready:false,unsubs:[],lastSeen:performance.now(),window:0,messages:0};peers.set(key,peer);peer.timer=setTimeout(()=>closePeer(key),25000);
    peer.unsubs.push(signal.listenAnswer(code,key,async answer=>{try{if(!pc.currentRemoteDescription){await pc.setRemoteDescription(answer);await ice.markRemoteSet();}}catch{closePeer(key);}}),signal.listenIce(code,key,false,c=>ice.add(c).catch(()=>{})));
    pc.onicecandidate=e=>{if(e.candidate)signal.pushIce(code,key,true,e.candidate).catch(()=>{});};
    pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))closePeer(key);};control.onclose=()=>closePeer(key);
    control.onmessage=e=>{
      if(typeof e.data!=='string'||e.data.length>1024)return;let m;try{m=JSON.parse(e.data);}catch{return;}if(!m||typeof m!=='object')return;
      const now=performance.now();if(now-peer.window>1000){peer.window=now;peer.messages=0;}if(++peer.messages>65)return;peer.lastSeen=now;
      if(m.type==='hello'&&m.protocol===PROTOCOL&&!peer.ready){if(!game.addPlayer(key,info.name)){send(control,{type:'error',message:'The round has already started.'});closePeer(key);return;}peer.ready=true;clearTimeout(peer.timer);send(control,{type:'welcome',id:key});send(control,game.snapshot());}
      if(!peer.ready)return;
      if(m.type==='aim')game.aim(key,m);
      if(m.type==='drop'&&m.turn===game.placed)game.drop(key);
      if(m.type==='ping')send(control,{type:'pong'});
    };
    await pc.setLocalDescription(await pc.createOffer());if(!stopped&&peers.has(key))await signal.writeOffer(code,key,pc.localDescription);
  }
  async function join(room,name){await init();code=room.trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{5}$/.test(code))throw new Error('Enter the five-character room code.');if(!await signal.roomExists(code))throw new Error('Room not found. Check the code with the host.');if(stopped)return;
    const pc=new PeerConnection(signal.ICE_CONFIG),ice=signal.createIceBuffer(pc);guest={pc,unsubs:[],lastSeen:performance.now()};guest.timer=setTimeout(()=>fail('Could not connect. Try another network or check the room code.'),25000);
    pc.onicecandidate=e=>{if(e.candidate)signal.pushIce(code,id,false,e.candidate).catch(()=>{});};pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))fail('The connection closed. Rejoin when the host returns to the room.');};
    pc.ondatachannel=e=>{const ch=e.channel;if(![PROTOCOL,'tower-frames'].includes(ch.label)){fail('This room is for a different game.');return;}
      if(ch.label===PROTOCOL){guest.control=ch;ch.onopen=()=>send(ch,{type:'hello',protocol:PROTOCOL});ch.onclose=()=>fail('The host left the room.');}
      ch.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(!m||typeof m!=='object')return;guest.lastSeen=performance.now();
        if(m.type==='welcome'){guest.ready=true;clearTimeout(guest.timer);onReady?.(m.id);status('Connected');heartbeat();}
        if(!guest.ready)return;
        if(m.type==='error'){fail(m.message);return;}
        if(m.type==='paused')status(m.value?'Host paused — hang tight':'Connected');
        if(typeof m.seq==='number')onState?.(m);
      };
    };
    let handled=false;guest.unsubs.push(signal.listenOffer(code,id,async offer=>{if(handled||stopped)return;handled=true;try{await pc.setRemoteDescription(offer);await ice.markRemoteSet();await pc.setLocalDescription(await pc.createAnswer());if(!stopped)await signal.writeAnswer(code,id,pc.localDescription);}catch{fail('Unable to establish a connection.');}}),signal.listenIce(code,id,true,c=>ice.add(c).catch(()=>{})),signal.listenRejected(code,id,message=>fail(String(message))));
    await signal.registerGuest(code,id,String(name).slice(0,18),id);
  }
  function broadcast(reliable=false){if(!host||stopped)return;const state=game.snapshot();for(const p of peers.values())if(p.ready)send(reliable?p.control:p.frames,state);}
  function start(){if(host&&game.phase==='lobby'){game.start();broadcast(true);}}
  function lobby(){if(host){game.lobby();broadcast(true);}}
  function aim(value){send(guest?.control,{type:'aim',...value});}
  function drop(turn){send(guest?.control,{type:'drop',turn});}
  function pause(value){for(const p of peers.values())if(p.ready)send(p.control,{type:'paused',value});}
  async function stop(){if(stopped)return;stopped=true;unsub();clearInterval(watch);for(const key of [...peers.keys()])closePeer(key);if(guest){clearTimeout(guest.timer);guest.unsubs.forEach(f=>f());guest.pc.onconnectionstatechange=null;if(guest.control)guest.control.onclose=null;guest.pc.close();}if(code){try{if(host)await signal.deleteRoom(code);else await signal.deleteGuest(code,id);}catch{}}}
  return{create,join,start,lobby,broadcast,aim,drop,pause,stop};
}
