import {createPainter,skinCanvas,validSkin} from './skin.mjs';
import {World,RULES,radius,speed,center,totalMass,clamp,decodeFrame,foodAt} from './engine.mjs';
const $=id=>document.getElementById(id),canvas=$('arena'),ctx=canvas.getContext('2d',{alpha:false}),mini=$('minimap').getContext('2d');
const palette=['#80f3ce','#6bbdff','#b6a0ff','#ff92b3','#ffd178','#a4edf4'];
let world=null,network=null,mode='menu',selfId='local',hue=0,room='',frame=null,frameReceived=0,food=[],foodSeed=0,generations=[];
let width=innerWidth,height=innerHeight,dpr=1,now=performance.now(),last=now,accumulator=0,networkClock=0,foodClock=0,hudClock=0,pingClock=0,requestToken=0;
let pointer={x:width/2,y:height/2},input={x:0,y:0},keys=new Set(),touch=null,ejectHeld=false,menuOpen=false,busy=false,coarse=matchMedia('(pointer:coarse)').matches;
const camera={x:2100,y:2100,zoom:0.6};let snapCamera=true;
const rendered=new Map(),sprites=new Map();const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const skins=new Map();
function acceptSkin({id,skin}){if(validSkin(skin)){const existing=skins.get(id);if(existing?.value!==skin)skins.set(id,{value:skin,canvas:skinCanvas(skin)});}}
const painter=createPainter(skin=>{acceptSkin({id:selfId,skin});if(world?.players.has(selfId))world.players.get(selfId).skin=skin;if(mode==='host'||mode==='guest')network?.skin(skin);});
$('draw-cell').onclick=$('lobby-draw').onclick=()=>{resetInput();painter.open();};
function waiting(){return (world?.phase||frame?.phase)==='lobby';}
function showLobby(){menuOpen=false;$('menu').hidden=true;$('lobby').hidden=false;$('hud').hidden=true;$('death').hidden=true;$('menu-button').hidden=true;$('lobby-code').textContent=room;resetInput();}
function updateLobby(state){
  if(!waiting()||!state)return;
  const humans=state.players.filter(p=>!p.bot);$('lobby-count').textContent=`${humans.length} / 8`;
  $('lobby-players').replaceChildren(...humans.map(p=>{const li=document.createElement('li');const preview=document.createElement('canvas');preview.width=preview.height=64;preview.style.background=palette[p.hue];const picture=skins.get(p.id)?.canvas;if(picture)preview.getContext('2d').drawImage(picture,0,0);const name=document.createTextNode(p.name);const role=document.createElement('span');role.textContent=p.id==='local'?'Host':p.id===selfId?'You':'Connected';li.append(preview,name,role);return li;}));
  $('lobby-bots').value=String(state.players.filter(p=>p.bot).length);$('lobby-bots').disabled=mode!=='host';$('start-game').hidden=mode!=='host';$('lobby-hint').textContent=mode==='host'?'Invite your friends, then start when everyone is here.':'Waiting for the host to start…';
}
$('lobby-bots').onchange=()=>{if(mode==='host'){world.setBots($('lobby-bots').value);$('bots').value=$('lobby-bots').value;updateLobby(current());}};
$('start-game').onclick=()=>{if(mode==='host'){network.start();showGame();}};
$('lobby-leave').onclick=()=>$('leave').click();
$('lobby-copy').onclick=async()=>{await $('copy-room').onclick();$('lobby-copy').textContent=$('copy-room').textContent;setTimeout(()=>$('lobby-copy').textContent='Copy invite',2000);};
function setStatus(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function resize(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
window.addEventListener('resize',resize);resize();
try{$('name').value=localStorage.getItem('bloom-name')||'Wanderer';}catch{}
function makeSprite(color){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  let grad=g.createRadialGradient(128,128,66,128,128,128);grad.addColorStop(0,color+'2e');grad.addColorStop(.65,color+'10');grad.addColorStop(1,color+'00');g.fillStyle=grad;g.fillRect(0,0,256,256);
  grad=g.createRadialGradient(104,96,5,128,128,89);grad.addColorStop(0,color+'85');grad.addColorStop(.38,color+'45');grad.addColorStop(.8,color+'19');grad.addColorStop(1,color+'65');g.fillStyle=grad;g.beginPath();g.arc(128,128,88,0,Math.PI*2);g.fill();
  g.strokeStyle=color+'d9';g.lineWidth=1.5;g.stroke();g.beginPath();g.arc(128,128,82,Math.PI*1.08,Math.PI*1.77);g.strokeStyle='#ffffff70';g.lineWidth=2;g.stroke();
  g.beginPath();g.arc(105,101,17,0,Math.PI*2);grad=g.createRadialGradient(103,99,0,105,101,17);grad.addColorStop(0,'#ffffff25');grad.addColorStop(1,'#ffffff00');g.fillStyle=grad;g.fill();return c;
}
for(const color of palette)sprites.set(color,makeSprite(color));
const virusSprite=(()=>{const c=document.createElement('canvas');c.width=c.height=180;const g=c.getContext('2d');g.translate(90,90);const grad=g.createRadialGradient(-15,-20,0,0,0,75);grad.addColorStop(0,'#a7ffc52b');grad.addColorStop(.9,'#71d69630');grad.addColorStop(1,'#9beebd55');g.fillStyle=grad;g.strokeStyle='#8cf0af';g.lineWidth=1.5;g.beginPath();for(let i=0;i<64;i++){const a=i/64*Math.PI*2,r=i%2?65:75;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.fill();g.stroke();g.beginPath();g.arc(0,0,45,0,Math.PI*2);g.strokeStyle='#9efabe35';g.stroke();return c;})();
// The menu shows a running simulation; decorative cells use the same renderer.
const demo=new World(387291);demo.setBots(12);let di=0;for(const p of demo.players.values()){const a=di++*2.4;p.cells[0].x=2100+Math.cos(a)*650;p.cells[0].y=2100+Math.sin(a)*600;p.cells[0].m=70+di*15;}
function current(){if(mode==='guest')return frame;if(world)return {time:world.time,players:[...world.players.values()],viruses:world.viruses,ejected:world.ejected};return {time:demo.time,players:[...demo.players.values()],viruses:demo.viruses,ejected:demo.ejected};}
function getMe(state=current()){return state?.players.find(p=>p.id===selfId);}
function acceptFood(msg){foodSeed=msg.seed;generations=msg.generations;food=generations.map((n,i)=>foodAt(foodSeed,i,n));}
function resetInput(){keys.clear();touch=null;input={x:0,y:0};ejectHeld=false;$('joystick').hidden=true;if(world)world.input(selfId,input);network?.input(input);}
function showGame(){menuOpen=false;$('lobby').hidden=true;$('menu').hidden=true;$('hud').hidden=false;$('menu-button').hidden=false;$('death').hidden=true;document.body.classList.remove('playing-menu');snapCamera=true;resetInput();}
function updateRoom(){ $('room-bar').hidden=!room;$('room-code').textContent=room; }
function setBusy(value){busy=value;for(const id of ['play','host','join-toggle','draw-cell'])$(id).disabled=value;$('join-form').querySelector('button').disabled=value;}
async function begin(kind,code='') {
  if(busy)return;setBusy(true);setStatus(kind==='solo'?'':'Connecting…');const token=++requestToken;
  try{
    await network?.stop();network=null;world=null;frame=null;room='';mode='connecting';rendered.clear();skins.clear();acceptSkin({id:'local',skin:painter.value});
    const name=$('name').value.trim()||'Wanderer';try{localStorage.setItem('bloom-name',name);}catch{}
    if(kind!=='guest'){world=new World();if(kind==='host')world.phase='lobby';world.addPlayer('local',name,false,hue).skin=painter.value;world.setBots($('bots').value);selfId='local';}
    if(kind==='solo'){mode='solo';$('connection').textContent='SOLO';showGame();}
    else {
      // Solo remains completely usable if Firebase/CDN access is unavailable.
      const {createNetwork}=await import('./network.mjs');if(token!==requestToken)return;
      network=createNetwork({world,onFrame:msg=>{if(frame&&msg.seq<=frame.seq)return;frame=decodeFrame(msg);frameReceived=performance.now();for(const id of skins.keys())if(!msg.players.some(p=>p.id===id))skins.delete(id);if(msg.phase==='playing'&&!$('lobby').hidden)showGame();},onFood:acceptFood,onSkin:acceptSkin,onReady:id=>{selfId=id;acceptSkin({id,skin:painter.value});mode='guest';showLobby();setBusy(false);},onStatus:(text,error)=>{if(error||mode==='menu')setStatus(text,error);$('connection').textContent=text;},onLeave:()=>{$('lobby').hidden=true;$('paint-dialog').close();mode='menu';world=null;frame=null;menuOpen=false;resetInput();$('bots').disabled=false;$('menu').hidden=false;$('hud').hidden=true;$('death').hidden=true;$('menu-button').hidden=true;$('session-options').hidden=true;document.body.classList.remove('playing-menu');setBusy(false);}});
      if(kind==='host'){room=await network.host();if(token!==requestToken)return;mode='host';$('connection').textContent='HOSTING';showLobby();updateLobby(current());setStatus('Share the invitation so friends can join.');}
      else{room=code;await network.join(code,name,hue,painter.value);if(token!==requestToken)return;setStatus('Waiting for a direct connection…');}
    }
    updateRoom();
  }catch(error){await network?.stop();network=null;world=null;mode='menu';setStatus(`Could not connect: ${error.message||error}. Solo play is still available.`,true);}
  finally{if(kind!=='guest'||mode==='menu')setBusy(false);}
}
$('play').onclick=()=>{$('bots').disabled=false;begin('solo');};$('host').onclick=()=>begin('host');
$('join-toggle').onclick=()=>{$('join-form').hidden=!$('join-form').hidden;$('join-toggle').setAttribute('aria-expanded',String(!$('join-form').hidden));if(!$('join-form').hidden)$('code').focus();};
$('join-form').onsubmit=e=>{e.preventDefault();begin('guest',$('code').value.trim().toUpperCase());};
$('colors').onclick=e=>{const b=e.target.closest('[data-color]');if(!b)return;hue=Number(b.dataset.color);for(const c of $('colors').children)c.setAttribute('aria-pressed',String(c===b));};
$('bots').onchange=()=>{if(world&&mode!=='guest')world.setBots($('bots').value);};
function openMenu(){if(mode==='menu'||mode==='connecting'||waiting())return;menuOpen=true;resetInput();$('menu').hidden=false;$('death').hidden=true;$('session-options').hidden=false;$('bots').disabled=mode==='guest';document.body.classList.add('playing-menu');setStatus(mode==='solo'?'Solo game paused.':mode==='host'?'The arena continues while this menu is open. Bot changes apply immediately.':'The arena continues while this menu is open.');}
$('menu-button').onclick=openMenu;$('death-menu').onclick=openMenu;
$('resume').onclick=()=>{menuOpen=false;$('menu').hidden=true;resetInput();};
$('leave').onclick=async()=>{$('lobby').hidden=true;$('paint-dialog').close();++requestToken;mode='menu';world=null;frame=null;room='';menuOpen=false;resetInput();const old=network;network=null;void old?.stop();$('menu').hidden=false;$('hud').hidden=true;$('death').hidden=true;$('menu-button').hidden=true;$('session-options').hidden=true;$('bots').disabled=false;document.body.classList.remove('playing-menu');$('connection').textContent='SOLO / ONLINE';setStatus('');setBusy(false);updateRoom();};
function action(type){if(mode==='menu'||menuOpen||waiting()||$('paint-dialog').open)return;if(mode==='guest')network?.action(type);else world?.action(selfId,type);}
$('respawn').onclick=()=>action('respawn');$('split').onpointerdown=e=>{e.preventDefault();action('split');};
$('feed').onpointerdown=e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);ejectHeld=true;action('eject');};
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('feed').addEventListener(event,()=>ejectHeld=false);
$('copy-room').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',room);try{await navigator.clipboard.writeText(url.href);$('copy-room').textContent='Copied';setTimeout(()=>$('copy-room').textContent='Copy invite',2000);}catch{$('copy-room').textContent=room;}};
window.addEventListener('keydown',e=>{if($('paint-dialog').open||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.code==='Escape'){if(menuOpen)$('resume').click();else openMenu();return;}
  if(mode==='menu'||menuOpen||waiting()||$('paint-dialog').open)return;
  if(['Space','KeyW','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.code==='Space'&&!e.repeat)action('split');if(e.code==='KeyW')ejectHeld=true;
});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyW')ejectHeld=false;});window.addEventListener('blur',resetInput);
document.addEventListener('visibilitychange',()=>{resetInput();last=performance.now();accumulator=0;network?.pause(document.hidden);});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){pointer={x:e.clientX,y:e.clientY};return;}if(touch&&e.pointerId===touch.id){touch.x=e.clientX;touch.y=e.clientY;}});
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||mode==='menu'||menuOpen||touch)return;canvas.setPointerCapture(e.pointerId);touch={id:e.pointerId,ox:e.clientX,oy:e.clientY,x:e.clientX,y:e.clientY};$('joystick').hidden=false;$('joystick').style.left=e.clientX+'px';$('joystick').style.top=e.clientY+'px';});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(touch?.id===e.pointerId){touch=null;input={x:0,y:0};$('joystick').hidden=true;}});
function readInput(){if(mode==='menu'||menuOpen||waiting()||$('paint-dialog').open||!$('death').hidden){input={x:0,y:0};return;}
  let x=0,y=0;
  if(touch){x=(touch.x-touch.ox)/45;y=(touch.y-touch.oy)/45;const d=Math.max(1,Math.hypot(x,y));$('stick').style.transform=`translate(${x/d*36}px,${y/d*36}px)`;}
  else if(keys.has('ArrowUp')||keys.has('ArrowDown')||keys.has('ArrowLeft')||keys.has('ArrowRight')){x=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));y=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));}
  else if(!coarse){x=(pointer.x-width/2)/75;y=(pointer.y-height/2)/75;}
  const d=Math.max(1,Math.hypot(x,y));input={x:x/d,y:y/d};
}
function tick(){if(document.hidden)return;
  readInput();if(mode==='menu'){demo.step(1/60);return;}
  if(world&&!(mode==='solo'&&(menuOpen||$('paint-dialog').open))){world.input(selfId,input);if(ejectHeld)world.action(selfId,'eject');world.step(1/60);}
  networkClock++;foodClock++;pingClock++;
  if(networkClock>=2){networkClock=0;if(mode==='guest'){network?.input(input);if(ejectHeld)network?.action('eject');}}
  if(mode==='host'&&foodClock%4===0)network?.broadcast(foodClock%30<4);
  if(pingClock>=120){pingClock=0;network?.ping();}
}
function circle(x,y,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function draw(dt){const state=current();if(!state)return;
  const me=getMe(state),isDemo=mode==='menu';const activeFood=isDemo?demo.food:world?world.food:food;
  let target={x:2100,y:2100},zoom=coarse?.55:.64;
  if(me?.cells.length){target=center(me);const mass=totalMass(me);zoom=clamp((coarse?.9:1.12)*Math.pow(100/Math.max(100,mass),.18),.23,1.12);
    // Keep every fragment in view, including split launches.
    const extentX=Math.max(...me.cells.map(c=>Math.abs(c.x-target.x)+radius(c.m)))+140;
    const extentY=Math.max(...me.cells.map(c=>Math.abs(c.y-target.y)+radius(c.m)))+140;
    zoom=Math.min(zoom,width/(extentX*2),height/(extentY*2));
  }else if(!isDemo){target={x:camera.x,y:camera.y};zoom=camera.zoom;}
  if(isDemo){target.x=2050+Math.sin(now/40000)*100;target.y=2050;zoom=coarse?.48:.62;}
  const follow=1-Math.exp(-dt*7);if(snapCamera){camera.x=target.x;camera.y=target.y;camera.zoom=zoom;snapCamera=false;}else{camera.x+=(target.x-camera.x)*follow;camera.y+=(target.y-camera.y)*follow;camera.zoom+=(zoom-camera.zoom)*follow;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#080e19';ctx.fillRect(0,0,width,height);
  ctx.save();ctx.translate(width/2,height/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
  const left=camera.x-width/(2*camera.zoom),top=camera.y-height/(2*camera.zoom),right=camera.x+width/(2*camera.zoom),bottom=camera.y+height/(2*camera.zoom);
  const visible=(x,y,r)=>x+r>left&&x-r<right&&y+r>top&&y-r<bottom;
  ctx.fillStyle='#102032';for(let x=Math.max(0,Math.ceil(left/80)*80);x<Math.min(RULES.size,right);x+=80)for(let y=Math.max(0,Math.ceil(top/80)*80);y<Math.min(RULES.size,bottom);y+=80)ctx.fillRect(x,y,1.5/camera.zoom,1.5/camera.zoom);
  ctx.strokeStyle='#5c9ca14d';ctx.lineWidth=2/camera.zoom;ctx.strokeRect(0,0,RULES.size,RULES.size);
  // Batch pellet paths by hue; no per-pellet glow, gradients, or DOM.
  for(let color=0;color<6;color++){ctx.beginPath();for(const f of activeFood){if(f.hue!==color||!visible(f.x,f.y,8))continue;ctx.moveTo(f.x+3.3,f.y);ctx.arc(f.x,f.y,3.3,0,Math.PI*2);}ctx.fillStyle=palette[color]+'ab';ctx.fill();}
  for(const e of state.ejected){if(visible(e.x,e.y,20)){circle(e.x,e.y,radius(e.m),palette[e.hue]+'b0');}}
  const living=new Set();const cells=state.players.flatMap(p=>p.cells.map(c=>({c,p}))).sort((a,b)=>a.c.m-b.c.m);
  for(const {c,p} of cells){living.add(c.id);const r=radius(c.m),local=p.id===selfId;let x=c.x,y=c.y;
    if(mode==='guest'&&local){const since=clamp((now-frameReceived)/1000,0,.10);x+=(input.x*speed(c.m)+c.vx)*since;y+=(input.y*speed(c.m)+c.vy)*since;}
    let drawn=rendered.get(c.id);if(!drawn){drawn={x,y,r};rendered.set(c.id,drawn);}const smooth=1-Math.exp(-dt*(local?24:14));drawn.x+=(x-drawn.x)*smooth;drawn.y+=(y-drawn.y)*smooth;drawn.r+=(r-drawn.r)*smooth;
    x=drawn.x;y=drawn.y;const rr=drawn.r;if(!visible(x,y,rr*1.5))continue;
    const color=palette[p.hue]||palette[0],s=rr*256/88;ctx.drawImage(sprites.get(color),x-s/2,y-s/2,s,s);
    const picture=skins.get(p.id)?.canvas;if(picture){ctx.save();ctx.beginPath();ctx.arc(x,y,rr-1,0,Math.PI*2);ctx.clip();ctx.drawImage(picture,x-rr,y-rr,rr*2,rr*2);ctx.restore();}
    if(local){ctx.beginPath();ctx.arc(x,y,rr+4/camera.zoom,0,Math.PI*2);ctx.strokeStyle=color+'45';ctx.lineWidth=1/camera.zoom;ctx.stroke();}
    if(rr*camera.zoom>16){ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#effbff';ctx.font=`600 ${clamp(rr*.30,11/camera.zoom,24/camera.zoom)}px system-ui`;ctx.fillText(p.name,x,y-1,rr*1.6);
      if(rr*camera.zoom>35){ctx.fillStyle=color+'ce';ctx.font=`500 ${clamp(rr*.17,10/camera.zoom,15/camera.zoom)}px system-ui`;ctx.fillText(Math.floor(c.m),x,y+rr*.34);}
    }
  }
  for(const id of rendered.keys())if(!living.has(id))rendered.delete(id);
  // Viruses cover small cells, as in the traditional hiding mechanic.
  for(const v of state.viruses){const r=radius(v.m);if(visible(v.x,v.y,r*1.2))ctx.drawImage(virusSprite,v.x-r*1.2,v.y-r*1.2,r*2.4,r*2.4);}
  ctx.restore();
  hudClock+=dt;if(hudClock>.12){hudClock=0;updateHud(state,me);}
}
function updateHud(state,me){if(waiting()){updateLobby(state);return;}if(mode==='menu'||!me)return;
  const mass=totalMass(me),ranking=[...state.players].sort((a,b)=>totalMass(b)-totalMass(a));
  $('mass').textContent=Math.floor(mass).toLocaleString();$('cell-count').textContent=`${me.cells.length} cell${me.cells.length===1?'':'s'}`;$('rank').textContent=`#${ranking.findIndex(p=>p.id===selfId)+1}`;
  $('population').textContent=state.players.length;
  $('leaders').replaceChildren(...ranking.slice(0,7).map((p,i)=>{const row=document.createElement('li');if(p.id===selfId)row.className='me';const place=document.createElement('span');place.className='place';place.textContent=i+1;const dot=document.createElement('span');dot.className='dot';dot.style.background=palette[p.hue];const name=document.createElement('span');name.className='player-name';name.textContent=p.name+(p.bot?' · bot':'');const score=document.createElement('b');score.textContent=Math.floor(totalMass(p));row.append(place,dot,name,score);return row;}));
  const canSplit=me.cells.some(c=>c.m>=RULES.splitMass)&&me.cells.length<RULES.maxCells;$('split').disabled=!canSplit;$('feed').disabled=!me.cells.some(c=>c.m>=RULES.ejectMass);
  const merging=Math.max(0,...me.cells.map(c=>c.mergeAt-state.time));
  $('hint').textContent=merging>0?`Rejoin in ${Math.ceil(merging)}s` : mass<36?'Eat sparks to grow':coarse?'Drag to move · Tap Split to launch':'Mouse / arrows to move · Space to split';
  mini.clearRect(0,0,112,112);for(const p of state.players){if(!p.cells.length)continue;const pos=center(p);mini.fillStyle=p.id===selfId?'#e8fff5':palette[p.hue]+'66';mini.beginPath();mini.arc(pos.x/RULES.size*104+4,pos.y/RULES.size*104+4,p.id===selfId?3:1.5,0,Math.PI*2);mini.fill();}
  mini.strokeStyle='#bafce235';mini.strokeRect(clamp((camera.x-width/camera.zoom/2)/RULES.size*104+4,0,112),clamp((camera.y-height/camera.zoom/2)/RULES.size*104+4,0,112),Math.min(112,width/camera.zoom/RULES.size*104),Math.min(112,height/camera.zoom/RULES.size*104));
  if(!me.cells.length&&!menuOpen){$('death').hidden=false;$('death-stats').textContent=`Peak mass ${Math.floor(me.peak)} · ${me.kills} cells eliminated`;$('respawn').disabled=state.time-me.deadAt<1.5;resetInput();}else $('death').hidden=true;
}
function loop(time){now=time;const dt=Math.min((time-last)/1000,.1);last=time;
  accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps<6){tick();accumulator-=1/60;steps++;}draw(reduced?Math.max(dt,1/60):dt);requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('pagehide',()=>void network?.stop());
const invitation=new URLSearchParams(location.search).get('room');if(invitation){$('code').value=invitation.toUpperCase().slice(0,5);$('join-form').hidden=false;$('join-toggle').setAttribute('aria-expanded','true');setStatus('Choose your name, then join your friend’s arena.');}
