import {RULES} from './content.mjs';
export const PROTOCOL='hollowstead-1';
// Firebase exchanges connection offers only. All game state stays with the host.
export function createNetwork({getWorld,onFrame,onReady,onStatus,onPause,onLeave,signaling,identity,PeerConnection=globalThis.RTCPeerConnection}){
  let signal=signaling,code='',hosting=false,stopped=false,guest=null,unsubscribe=()=>{},timeout;
  const id=typeof identity==='string'&&/^[a-f0-9-]{36}$/.test(identity)?identity:crypto.randomUUID(),peers=new Map();let transfer=0;
  const status=(text,error=false)=>onStatus?.(text,error);
  const send=(ch,msg)=>{if(ch?.readyState!=='open'||ch.bufferedAmount>180000)return false;try{ch.send(JSON.stringify(msg));return true;}catch{return false;}};
  async function initialize(){signal??=await import('../../js/signaling.js');signal.initFirebase();}
  function sendFrame(ch){
    if(ch?.readyState!=='open'||ch.bufferedAmount>90000)return;
    const data=JSON.stringify(getWorld().snapshot()),part=++transfer,count=Math.ceil(data.length/12000);
    for(let i=0;i<count;i++)send(ch,{type:'chunk',part,i,count,data:data.slice(i*12000,(i+1)*12000)});
  }
  function closePeer(key){const p=peers.get(key);if(!p)return;peers.delete(key);p.unsubs.forEach(fn=>fn());clearTimeout(p.timer);p.pc.onconnectionstatechange=null;if(p.channel)p.channel.onclose=null;p.pc.close();if(p.ready)getWorld().leave(key);signal.deleteGuest(code,key).catch(()=>{});}
  async function host(){await initialize();if(stopped)return '';hosting=true;code=await signal.createRoom(`${PROTOCOL}:${id}`);if(stopped){await signal.deleteRoom(code);return '';}
    unsubscribe=signal.listenNewGuests(code,(key,info)=>attach(key,info).catch(()=>{closePeer(key);status('A wanderer could not connect. They can try again.',true);}));return code;
  }
  async function attach(key,info){
    if(stopped||peers.has(key)||info.offer||info.rejected)return;
    if(peers.size>=RULES.maxPlayers-1){await signal.rejectGuest(code,key,'This expedition is full (4 players).');return;}
    const pc=new PeerConnection(signal.ICE_CONFIG),ice=signal.createIceBuffer(pc),channel=pc.createDataChannel(PROTOCOL);
    const p={pc,channel,unsubs:[],ready:false,at:performance.now(),window:0,messages:0};peers.set(key,p);p.timer=setTimeout(()=>closePeer(key),25000);
    p.unsubs.push(signal.listenAnswer(code,key,async answer=>{try{if(!pc.currentRemoteDescription){await pc.setRemoteDescription(answer);await ice.markRemoteSet();}}catch{closePeer(key);}}));
    p.unsubs.push(signal.listenIce(code,key,false,c=>ice.add(c).catch(()=>{})));
    pc.onicecandidate=e=>{if(e.candidate)signal.pushIce(code,key,true,e.candidate).catch(()=>{});};
    pc.onconnectionstatechange=()=>{if(['closed','failed'].includes(pc.connectionState))closePeer(key);};channel.onclose=()=>closePeer(key);
    channel.onmessage=e=>{
      if(typeof e.data!=='string'||e.data.length>2000)return;let msg;try{msg=JSON.parse(e.data);}catch{return;}if(!msg||typeof msg!=='object')return;
      const now=performance.now();if(now-p.window>1000){p.window=now;p.messages=0;}if(++p.messages>65)return;p.at=now;
      if(msg.type==='hello'&&!p.ready){if(msg.protocol!==PROTOCOL){send(channel,{type:'error',text:'This room belongs to a different game.'});return;}
        const player=getWorld().addPlayer(key,info.name,msg.character);if(!player){closePeer(key);return;}p.ready=true;clearTimeout(p.timer);send(channel,{type:'welcome',protocol:PROTOCOL,id:key});sendFrame(channel);status(`${peers.size+1} wanderers connected`);
      }
      if(!p.ready)return;
      if(msg.type==='input')getWorld().input(key,msg.value);
      if(msg.type==='action')getWorld().action(key,msg.value);
      if(msg.type==='ping')send(channel,{type:'pong',at:msg.at});
    };
    await pc.setLocalDescription(await pc.createOffer());if(!stopped&&peers.has(key))await signal.writeOffer(code,key,pc.localDescription);
  }
  function fail(text){if(stopped)return;status(text,true);onLeave?.(text);void stop();}
  async function join(room,name,character){
    code=String(room).trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{5}$/.test(code))throw new Error('Enter the five-character camp code.');
    await initialize();if(!await signal.roomExists(code))throw new Error('Camp not found. Ask the host for a fresh code.');if(stopped)return;
    const pc=new PeerConnection(signal.ICE_CONFIG),ice=signal.createIceBuffer(pc);guest={pc,unsubs:[],last:performance.now(),chunks:null,paused:false};let handled=false;
    timeout=setTimeout(()=>fail('Connection timed out. Try another network or ask the host to reopen the camp.'),25000);
    pc.onicecandidate=e=>{if(e.candidate)signal.pushIce(code,id,false,e.candidate).catch(()=>{});};
    pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))fail('Connection lost. The host can save and reopen this expedition.');};
    pc.ondatachannel=e=>{
      if(e.channel.label!==PROTOCOL){fail('That code is for a different game.');return;}
      const ch=guest.channel=e.channel;ch.onopen=()=>send(ch,{type:'hello',protocol:PROTOCOL,character});ch.onclose=()=>fail('The host closed the camp. Ask them to reopen their saved expedition.');
      ch.onmessage=e=>{
        if(typeof e.data!=='string'||e.data.length>20000)return;let m;try{m=JSON.parse(e.data);}catch{return;}if(!m)return;guest.last=performance.now();
        if(m.type==='error'){fail(String(m.text));return;}
        if(m.type==='welcome'&&m.protocol===PROTOCOL){clearTimeout(timeout);guest.ready=true;onReady?.(m.id);status('Connected to camp');}
        if(!guest.ready)return;
        if(m.type==='chunk'&&Number.isInteger(m.count)&&m.count>0&&m.count<100&&Number.isInteger(m.i)&&m.i>=0&&m.i<m.count&&typeof m.data==='string'){
          if(guest.chunks?.part!==m.part)guest.chunks={part:m.part,count:m.count,pieces:new Array(m.count),received:0};const c=guest.chunks;if(c.count!==m.count)return;
          if(c.pieces[m.i]===undefined)c.received++;c.pieces[m.i]=m.data;
          if(c.received===c.count){try{onFrame?.(JSON.parse(c.pieces.join('')));}catch{fail('The expedition data could not be read. Rejoin the camp.');}guest.chunks=null;}
        }
        if(m.type==='paused'){guest.paused=m.value;onPause?.(m.value);status(m.value?'Host is away • expedition paused':'Connected to camp');}
        if(m.type==='pong')status(`${Math.max(0,Math.round(performance.now()-m.at))} ms`);
      };
    };
    guest.unsubs.push(signal.listenOffer(code,id,async offer=>{if(handled||stopped)return;handled=true;try{await pc.setRemoteDescription(offer);await ice.markRemoteSet();await pc.setLocalDescription(await pc.createAnswer());if(!stopped)await signal.writeAnswer(code,id,pc.localDescription);}catch{fail('Could not establish the camp connection.');}}));
    guest.unsubs.push(signal.listenIce(code,id,true,c=>ice.add(c).catch(()=>{})));guest.unsubs.push(signal.listenRejected(code,id,reason=>fail(String(reason))));
    await signal.registerGuest(code,id,String(name).slice(0,18),id);
  }
  function broadcast(){if(!hosting||stopped)return;const now=performance.now();for(const [key,p]of peers){if(!p.ready)continue;if(now-p.at>30000){closePeer(key);continue;}sendFrame(p.channel);}}
  function pause(value){for(const p of peers.values())send(p.channel,{type:'paused',value});}
  function ping(){if(!guest?.ready)return;if(performance.now()-guest.last>30000&&!guest.paused){fail('The host stopped responding. Try rejoining the camp.');return;}send(guest.channel,{type:'ping',at:performance.now()});}
  async function stop(){if(stopped)return;stopped=true;clearTimeout(timeout);unsubscribe();for(const key of [...peers.keys()])closePeer(key);if(guest){guest.unsubs.forEach(fn=>fn());guest.pc.onconnectionstatechange=null;if(guest.channel)guest.channel.onclose=null;guest.pc.close();}if(code)try{if(hosting)await signal.deleteRoom(code);else await signal.deleteGuest(code,id);}catch{/* Room cleanup is best effort when offline. */}}
  return {host,join,broadcast,pause,ping,stop,input:value=>send(guest?.channel,{type:'input',value}),action:value=>send(guest?.channel,{type:'action',value})};
}
