// Reuses the site's Firebase room/offer/answer/ICE system, with a dedicated
// realtime transport instead of the turn-based card-game host.
import { RULES } from './engine.mjs';
import { validSkin } from './skin.mjs';
export const PROTOCOL='ball-game-v2';
export function createNetwork({world,onFrame,onFood,onReady,onStatus,onLeave,onSkin,signaling,PeerConnection=globalThis.RTCPeerConnection}) {
  let signal=signaling;
  async function initialize(){signal ??= await import('../js/signaling.js');signal.initFirebase();}
  const id=crypto.randomUUID();let code='',hosting=false,stopped=false,unsub=()=>{},timeout=0;
  const peers=new Map();let guest=null;
  const status=(text,error=false)=>onStatus?.(text,error);
  const send=(ch,msg)=>{if(ch?.readyState!=='open'||ch.bufferedAmount>65536)return false;try{ch.send(JSON.stringify(msg));return true;}catch{return false;}};
  function closePeer(key) {
    const peer=peers.get(key);if(!peer)return;peers.delete(key);
    peer.unsubs.forEach(fn=>fn());clearTimeout(peer.timer);peer.pc.onconnectionstatechange=null;
    if(peer.control)peer.control.onclose=null;peer.pc.close();
    if(hosting){world.players.delete(key);signal.deleteGuest(code,key).catch(()=>{});}
  }
  function fail(message){if(stopped)return;status(message,true);onLeave?.();void stop();}
  async function host() {
    await initialize();hosting=true;world.phase='lobby';code=await signal.createRoom(`${PROTOCOL}:${id}`);
    if(stopped){await signal.deleteRoom(code);return '';}
    unsub=signal.listenNewGuests(code,(key,info)=>{attach(key,info).catch(()=>{closePeer(key);status('A player could not connect. They can try joining again.',true);});});
    return code;
  }
  async function attach(key,info) {
    if(stopped||peers.has(key)||info.offer||info.rejected)return;
    if(peers.size>=RULES.maxHumans-1){await signal.rejectGuest(code,key,'This arena is full (8 players).');return;}
    const pc=new PeerConnection(signal.ICE_CONFIG),ice=signal.createIceBuffer(pc);
    const control=pc.createDataChannel(PROTOCOL),state=pc.createDataChannel('frames',{ordered:false,maxRetransmits:0});
    const peer={pc,control,state,unsubs:[],ready:false,lastMessage:0,windowStart:0,messages:0};peers.set(key,peer);
    peer.timer=setTimeout(()=>closePeer(key),25000);
    peer.unsubs.push(signal.listenAnswer(code,key,async answer=>{try{if(!pc.currentRemoteDescription){await pc.setRemoteDescription(answer);await ice.markRemoteSet();}}catch{closePeer(key);}}));
    peer.unsubs.push(signal.listenIce(code,key,false,c=>ice.add(c).catch(()=>{})));
    pc.onicecandidate=e=>{if(e.candidate)signal.pushIce(code,key,true,e.candidate).catch(()=>{});};
    pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))closePeer(key);};
    control.onclose=()=>closePeer(key);
    control.onmessage=e=>{
      if(typeof e.data!=='string'||e.data.length>4800)return;
      let msg;try{msg=JSON.parse(e.data);}catch{return;}if(!msg||typeof msg!=='object')return;
      const now=performance.now();if(now-peer.windowStart>1000){peer.windowStart=now;peer.messages=0;}if(++peer.messages>100)return;
      peer.lastMessage=now;
      if(msg.type==='hello'&&msg.protocol===PROTOCOL&&!peer.ready){
        const p=world.addPlayer(key,info.name,false,msg.hue);if(!p){closePeer(key);return;}peer.ready=true;clearTimeout(peer.timer);
        if(validSkin(msg.skin)){p.skin=msg.skin;onSkin?.({id:key,skin:p.skin});}
        send(control,{type:'welcome',protocol:PROTOCOL,id:key,seed:world.seed,generations:world.generations});
        for(const player of world.players.values())if(validSkin(player.skin))send(control,{type:'skin',id:player.id,skin:player.skin});
        if(p.skin)for(const [otherId,other] of peers)if(otherId!==key&&other.ready)send(other.control,{type:'skin',id:key,skin:p.skin});
        send(control,world.snapshot());status(`${peers.size+1} players connected`);
      }
      if(!peer.ready)return;
      if(msg.type==='skin'&&validSkin(msg.skin)){world.players.get(key).skin=msg.skin;onSkin?.({id:key,skin:msg.skin});for(const other of peers.values())if(other.ready)send(other.control,{type:'skin',id:key,skin:msg.skin});}
      if(msg.type==='input')world.input(key,msg);
      if(msg.type==='action'&&['split','eject','respawn'].includes(msg.action))world.action(key,msg.action);
      if(msg.type==='ping')send(control,{type:'pong',at:msg.at});
    };
    await pc.setLocalDescription(await pc.createOffer());if(!stopped&&peers.has(key))await signal.writeOffer(code,key,pc.localDescription);
  }
  async function join(room,name,hue,skin) {
    await initialize();code=room.trim().toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{5}$/.test(code))throw new Error('Enter a five-character room code.');
    if(!await signal.roomExists(code))throw new Error('Room not found. Ask the host for a new code.');
    if(stopped)return;
    const pc=new PeerConnection(signal.ICE_CONFIG),ice=signal.createIceBuffer(pc);guest={pc,unsubs:[]};
    timeout=setTimeout(()=>fail('Could not connect. Check the code or try another network.'),25000);
    let offerHandled=false;
    pc.onicecandidate=e=>{if(e.candidate)signal.pushIce(code,id,false,e.candidate).catch(()=>{});};
    pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))fail('Connection closed. Rejoin the arena to play again.');};
    pc.ondatachannel=e=>{
      const ch=e.channel;
      if(ch.label!==PROTOCOL&&ch.label!=='frames'){fail('This room belongs to a different game.');return;}
      if(ch.label===PROTOCOL){guest.control=ch;ch.onopen=()=>send(ch,{type:'hello',protocol:PROTOCOL,hue,skin:validSkin(skin)?skin:undefined});ch.onclose=()=>fail('The host left the arena.');}
      ch.onmessage=ev=>{let msg;try{msg=JSON.parse(ev.data);}catch{return;}if(!msg||typeof msg!=='object')return;
        if(msg.type==='welcome'&&msg.protocol===PROTOCOL){clearTimeout(timeout);guest.ready=true;guest.lastFrame=performance.now();onFood(msg);onReady(msg.id);status('Connected');}
        if(!guest.ready)return;
        if(msg.type==='frame'){guest.lastFrame=performance.now();onFrame(msg);}
        if(msg.type==='food')onFood(msg);
        if(msg.type==='skin'&&validSkin(msg.skin))onSkin?.({id:msg.id,skin:msg.skin});
        if(msg.type==='pong')status(`${Math.round(performance.now()-msg.at)} ms`);
        if(msg.type==='paused'){guest.pausedAt=msg.paused?performance.now():0;status(msg.paused?'Host switched tabs — arena paused':'Connected');}
      };
    };
    guest.unsubs.push(signal.listenOffer(code,id,async offer=>{if(offerHandled||stopped)return;offerHandled=true;try{await pc.setRemoteDescription(offer);await ice.markRemoteSet();await pc.setLocalDescription(await pc.createAnswer());if(!stopped)await signal.writeAnswer(code,id,pc.localDescription);}catch{fail('Unable to establish the connection.');}}));
    guest.unsubs.push(signal.listenIce(code,id,true,c=>ice.add(c).catch(()=>{})));
    guest.unsubs.push(signal.listenRejected(code,id,reason=>fail(String(reason))));
    await signal.registerGuest(code,id,String(name).slice(0,18),id);
  }
  function broadcast(food=false) {
    if(!hosting||stopped)return;const frame=world.snapshot();const now=performance.now();
    for(const [key,p] of peers){if(!p.ready)continue;if(now-p.lastMessage>15000){closePeer(key);continue;}send(p.state,frame);if(food)send(p.control,{type:'food',seed:world.seed,generations:world.generations});}
  }
  function start(){if(hosting&&!stopped){world.start();for(const p of peers.values())if(p.ready)send(p.control,world.snapshot());}}
  function skin(value){if(!validSkin(value))return;if(hosting){const p=world.players.get('local');p.skin=value;for(const peer of peers.values())if(peer.ready)send(peer.control,{type:'skin',id:p.id,skin:value});}else send(guest?.control,{type:'skin',skin:value});}
  function input(value){send(guest?.control,{type:'input',...value});}
  function action(action){send(guest?.control,{type:'action',action});}
  function ping(){if(guest?.ready){if(performance.now()-guest.lastFrame>15000 && (!guest.pausedAt || performance.now()-guest.pausedAt>120000)){fail('The host stopped responding. Rejoin to reconnect.');return;}send(guest.control,{type:'ping',at:performance.now()});}}
  function pause(paused){for(const p of peers.values())send(p.control,{type:'paused',paused});}
  async function stop(){if(stopped)return;stopped=true;clearTimeout(timeout);unsub();for(const key of [...peers.keys()])closePeer(key);
    if(guest){guest.unsubs.forEach(fn=>fn());guest.pc.onconnectionstatechange=null;if(guest.control)guest.control.onclose=null;guest.pc.close();}
    if(code){try{if(hosting)await signal.deleteRoom(code);else await signal.deleteGuest(code,id);}catch{/* Best-effort signaling cleanup. */}}
  }
  return {host,join,broadcast,start,skin,input,action,ping,pause,stop};
}
