import {TowerGame,RULES,COLORS,SHAPES,clamp} from './game.mjs';
import {TowerView,Sound} from './view.mjs';
const $=id=>document.getElementById(id),view=new TowerView($('scene')),sound=new Sound();
let game=null,network=null,state=null,mode='home',localMode='solo',selfId='local',roomCode='',busy=false,request=0;
let aim={x:0,angle:0},turnKey='',lastEvent=0,best=0,last=performance.now(),acc=0,netTime=0,hudTime=0,ghostTime=0,landingY=null,pendingDrop=0,drag=null,lastResult='',lastRoster='';
let lastAimSent=0,aimDirty=false;
let ghostBodies=[],ghost=null,ghostShape=-1,toastTimer=0;
try{$('name').value=localStorage.getItem('wob-name')||'Builder';best=Number(localStorage.getItem('wob-best'))||0;}catch{}
const demo={phase:'demo',blocks:[{id:1,shape:2,x:0,y:542,angle:0,color:1},{id:2,shape:1,x:4,y:493,angle:.04,color:0},{id:3,shape:3,x:-5,y:425,angle:-.07,color:4},{id:4,shape:2,x:4,y:372,angle:.07,color:3},{id:5,shape:4,x:7,y:323,angle:-.12,color:2},{id:6,shape:0,x:17,y:269,angle:.15,color:5}]};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function setBusy(value){busy=value;for(const id of ['play','host','join-toggle'])$(id).disabled=value;$('join-form').querySelector('button').disabled=value;}
function isMine(){return state?.phase==='aim'&&(mode==='solo'||mode==='pass'||state.currentId===selfId);}
function dialogOpen(){return ['help-dialog','menu-dialog','result-dialog'].some(id=>$(id).open);}
function myName(){return $('name').value.trim()||'Builder';}
function storeName(){try{localStorage.setItem('wob-name',myName());}catch{}}
function resetVisuals(){view.positions.clear();view.particles=[];ghostBodies=[];ghostShape=-1;ghost=null;lastResult='';turnKey='';lastRoster='';lastEvent=0;pendingDrop=0;landingY=null;}
function showHome(message='',error=false){mode='home';game?.destroy();game=null;state=null;roomCode='';resetVisuals();for(const id of ['room','hud','menu-open'])$(id).hidden=true;$('home').hidden=false;for(const d of document.querySelectorAll('dialog'))d.close();status(message,error);setBusy(false);}
async function leave(){++request;const old=network;network=null;showHome();void old?.stop();}
function showRoom(){$('home').hidden=true;$('room').hidden=false;$('hud').hidden=true;$('menu-open').hidden=true;$('room-code').textContent=roomCode;$('start').hidden=mode!=='host';$('room-hint').textContent=mode==='host'?'Everyone here? Let’s build.':'Waiting for the host to start.';for(const d of document.querySelectorAll('dialog'))d.close();}
function showPlay(){$('home').hidden=true;$('room').hidden=true;$('hud').hidden=false;$('menu-open').hidden=false;}
function accept(snapshot){
  if(state&&mode==='guest'&&snapshot.seq<=state.seq)return;
  state=snapshot;
  const key=`${state.round}/${state.placed}/${state.currentId}`;
  if(key!==turnKey){turnKey=key;aim={x:state.preview.x,angle:state.preview.angle};pendingDrop=0;ghostTime=1;}
  if(state.phase!=='aim')pendingDrop=0;
  if(state.phase==='lobby'){if($('room').hidden)showRoom();}
  else if(!$('room').hidden||!$('home').hidden)showPlay();
  if(state.event.id!==lastEvent){lastEvent=state.event.id;if(['land','placed','collapse'].includes(state.event.type)){sound.play(state.event.type,state.placed);if(state.event.type==='placed'){toast(state.event.perfect?'Lovely landing.':'Still standing!');const b=state.blocks.at(-1);if(b)view.burst(b.x,b.y,COLORS[b.color]);}if(navigator.vibrate&&isMine())navigator.vibrate(state.event.type==='collapse'?80:15);}}
  if(state.phase==='over'&&lastResult!==String(state.round)){lastResult=String(state.round);pendingDrop=0;setTimeout(()=>{if(state?.phase==='over')showResult();},900);}
}
async function begin(kind,code=''){
  if(busy)return;setBusy(true);status(kind==='solo'||kind==='pass'?'':'Connecting your room…');const token=++request;storeName();
  try{
    const old=network;network=null;void old?.stop();game?.destroy();game=null;state=null;resetVisuals();mode='connecting';
    if(kind==='solo'||kind==='pass'){
      mode=kind;game=new TowerGame({mode:kind});game.addPlayer('local',myName());selfId='local';if(kind==='pass')for(let i=1;i<Number($('pass-count').value);i++)game.addPlayer(`p${i}`,`Builder ${i+1}`);
      game.start();accept(game.snapshot());showPlay();setBusy(false);return;
    }
    if(kind==='host'){game=new TowerGame({mode:'online'});game.addPlayer('local',myName());selfId='local';}
    const {createNetwork}=await import('./network.mjs');if(token!==request)return;
    network=createNetwork({game,onState:s=>{if(token===request)accept(s);},onReady:id=>{if(token!==request)return;selfId=id;mode='guest';showRoom();setBusy(false);},onStatus:(text,error)=>{if(token!==request)return;if(error||mode==='connecting')status(text,error);if(text.startsWith('Host paused'))toast(text);},onLeave:()=>{if(token!==request)return;const message=$('status').textContent;showHome(message||'The host left the room.',true);}});
    if(kind==='host'){roomCode=await network.create();if(token!==request)return;mode='host';accept(game.snapshot());showRoom();setBusy(false);}
    else{roomCode=code;await network.join(code,myName());}
  }catch(error){const old=network;network=null;void old?.stop();showHome(error.message||'Could not connect. Please try again.',true);}
}
function setLocalMode(value){localMode=value;$('solo-mode').setAttribute('aria-pressed',String(value==='solo'));$('pass-mode').setAttribute('aria-pressed',String(value==='pass'));$('pass-options').hidden=value!=='pass';}
$('solo-mode').onclick=()=>setLocalMode('solo');$('pass-mode').onclick=()=>setLocalMode('pass');$('play').onclick=()=>begin(localMode);$('host').onclick=()=>begin('host');
$('join-toggle').onclick=()=>{$('join-form').hidden=!$('join-form').hidden;$('join-toggle').setAttribute('aria-expanded',String(!$('join-form').hidden));if(!$('join-form').hidden)$('room-input').focus();};
$('join-form').onsubmit=e=>{e.preventDefault();begin('guest',$('room-input').value.trim().toUpperCase());};
$('start').onclick=()=>{if(mode==='host'){network.start();accept(game.snapshot());}};
$('room-leave').onclick=$('quit').onclick=$('result-leave').onclick=leave;
$('help-open').onclick=()=>$('help-dialog').showModal();
$('menu-open').onclick=()=>{$('pause-note').textContent=mode==='host'||mode==='guest'?'The online round keeps going while this menu is open.':'Your tower is safe while you’re here.';$('menu-dialog').showModal();drag=null;};
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();
$('result-dialog').addEventListener('cancel',e=>e.preventDefault());
$('sound').onclick=()=>{try{const enabled=sound.enable();$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'Turn sound off':'Turn sound on');}catch{toast('Sound is unavailable in this browser.');}};
$('copy').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',roomCode);try{if(navigator.share&&matchMedia('(pointer:coarse)').matches)await navigator.share({title:'Build a Wobbly Tower with me',url:url.href});else await navigator.clipboard.writeText(url.href);$('copy').textContent='Ready to share';}catch{$('copy').textContent=`Code: ${roomCode}`;}setTimeout(()=>$('copy').textContent='Copy invite',2000);};
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),1500);}
function sendAim(force=false){if(!isMine())return;if(mode==='guest'){const now=performance.now();if(!force&&now-lastAimSent<60){aimDirty=true;return;}lastAimSent=now;aimDirty=false;network?.aim(aim);}else game.aim(game.currentId,aim);}
function move(x){if(!isMine()||pendingDrop||dialogOpen())return;aim.x=clamp(x,-190,190);$('position').value=String(aim.x);ghostTime=1;sendAim();}
function rotate(direction){if(!isMine()||pendingDrop||dialogOpen())return;aim.angle=clamp(aim.angle+direction*Math.PI/12,-Math.PI*4,Math.PI*4);sendAim();sound.play('rotate');ghostTime=1;}
function drop(){if(!isMine()||pendingDrop||dialogOpen())return;sendAim(true);if(mode==='guest'){network.drop(state.placed);pendingDrop=performance.now();}else{game.drop(game.currentId);accept(game.snapshot());}sound.play('drop');drag=null;}
$('position').oninput=e=>move(Number(e.target.value));$('rotate-left').onclick=()=>rotate(-1);$('rotate-right').onclick=()=>rotate(1);$('drop').onclick=drop;
$('scene').onpointerdown=e=>{if(!isMine()||dialogOpen())return;e.preventDefault();$('scene').setPointerCapture(e.pointerId);drag={id:e.pointerId,start:e.clientX,x:aim.x};};
$('scene').onpointermove=e=>{if(drag?.id===e.pointerId)move(drag.x+(e.clientX-drag.start)/view.scale);};
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('scene').addEventListener(event,e=>{if(drag?.id===e.pointerId)drag=null;});
window.addEventListener('keydown',e=>{if(dialogOpen()||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||!isMine())return;
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(e.code))e.preventDefault();if(e.code==='ArrowLeft')move(aim.x-6);if(e.code==='ArrowRight')move(aim.x+6);if(e.code==='KeyA')rotate(-1);if(e.code==='KeyD')rotate(1);if(e.code==='Space'&&!e.repeat)drop();
});
window.addEventListener('resize',()=>{view.resize();ghostTime=1;});window.addEventListener('blur',()=>drag=null);
document.addEventListener('visibilitychange',()=>{last=performance.now();acc=0;drag=null;network?.pause(document.hidden);});
window.addEventListener('pagehide',()=>void network?.stop());
function projection(){
  if(!state||state.phase!=='aim'){landingY=null;return;}const M=globalThis.Matter,p={...state.preview,...(isMine()?aim:{})};
  // Reconstruct only the collision outlines; guests never simulate a second world.
  const builder=game||{M,makeBody:TowerGame.prototype.makeBody};
  if(ghostBodies.length!==state.blocks.length+1){ghostBodies=[M.Bodies.rectangle(0,578,174,36,{isStatic:true}),...state.blocks.map(b=>builder.makeBody(b.shape,b.x,b.y,b.angle))];}
  state.blocks.forEach((b,i)=>{M.Body.setPosition(ghostBodies[i+1],{x:b.x,y:b.y});M.Body.setAngle(ghostBodies[i+1],b.angle);});
  if(ghostShape!==p.shape){ghost=builder.makeBody(p.shape,p.x,p.y,p.angle);ghostShape=p.shape;}
  M.Body.setAngle(ghost,p.angle);let y=p.y,previous=y,hit=false;
  for(let i=0;i<180&&y<690;i++){M.Body.setPosition(ghost,{x:p.x,y});if(M.Query.collides(ghost,ghostBodies).length){hit=true;break;}previous=y;y+=8;}
  if(!hit){landingY=null;return;}for(let i=0;i<6;i++){const mid=(previous+y)/2;M.Body.setPosition(ghost,{x:p.x,y:mid});if(M.Query.collides(ghost,ghostBodies).length)y=mid;else previous=mid;}landingY=previous;
}
function updateHud(){
  if(!state)return;
  if(state.phase==='lobby'){
    const signature=state.players.map(p=>p.id+p.name).join('|');if(signature!==lastRoster){lastRoster=signature;$('roster').replaceChildren(...state.players.map(p=>{const li=document.createElement('li'),mark=document.createElement('i'),name=document.createTextNode(p.name),role=document.createElement('small');mark.style.background=COLORS[p.color];role.textContent=p.id==='local'?'Host':p.id===selfId?'You':'Ready';li.append(mark,name,role);return li;}));$('room-count').textContent=`${state.players.length} / 6`;}
    return;
  }
  $('blocks').textContent=String(state.placed).padStart(2,'0');$('height').textContent=state.bestHeight.toFixed(1);$('best').textContent=best;
  const p=state.players.find(p=>p.id===state.currentId),mine=isMine(),settling=state.phase==='settling';$('turn-dot').style.background=COLORS[p?.color||0];
  $('turn-name').textContent=settling?'Hold your breath…':state.phase==='over'?'Down it goes.':mode==='solo'?'Your next little block':mine&&mode!=='pass'?'Your turn':`${p?.name||'Builder'}’s turn`;
  $('turn-detail').textContent=settling?'Let the tower find its feet.':mine?'A little left? A little right?':'Watch their next move.';
  $('timer').textContent=state.mode==='solo'||state.phase!=='aim'?'':`${Math.ceil(state.remaining)}s`;
  const active=mine&&!pendingDrop&&!dialogOpen();for(const id of ['position','rotate-left','rotate-right','drop'])$(id).disabled=!active;
  $('drop').firstChild.textContent=settling?'Settling… ':pendingDrop?'Dropping… ':mine?'Drop block ':'Their turn ';
  $('position').value=String(mine?aim.x:state.preview.x);$('shape-name').textContent=SHAPES[state.preview.shape].name;$('angle').textContent=`${Math.round((mine?aim.angle:state.preview.angle)*180/Math.PI)}°`;
  $('balance').style.width=`${Math.max(3,state.wobble*100)}%`;$('balance').style.background=state.wobble>.55?'#de6348':'#779f7a';
  $('control-hint').textContent=settling?'Hands off. It’s doing its best.':mine?'Drag to aim · Rotate to fit · Tap to drop':'Same tower. A different pair of hands.';
  if(state.mode==='solo'&&state.placed>best){best=state.placed;try{localStorage.setItem('wob-best',String(best));}catch{}}
}
function showResult(){
  const r=state.result,complete=r.reason==='complete';$('result-title').innerHTML=complete?'A towering<br><span>achievement.</span>':'Well, that<br><span>escalated.</span>';
  $('result-copy').textContent=complete?'Eighty blocks. One extraordinary balancing act.':state.mode==='solo'?'Every great tower has a little tumble. Ready to beat it?':`${r.loser} ${r.reason==='unstable'?'left the tower wobbling.':'brought the tower down.'} The other builders win this round.`;
  $('result-blocks').textContent=r.blocks;$('result-height').textContent=`${r.height.toFixed(1)} m`;$('again').hidden=mode==='guest';$('result-dialog').showModal();
}
$('again').onclick=()=>{$('result-dialog').close();resetVisuals();if(mode==='host'){network.lobby();accept(game.snapshot());showRoom();}else{game.start();accept(game.snapshot());showPlay();}};
function loop(now){const dt=Math.min((now-last)/1000,.1);last=now;
  if(!document.hidden){acc+=dt;let steps=0;while(acc>=1/60&&steps<6){if(game&&!(dialogOpen()&&(mode==='solo'||mode==='pass')&&game.phase!=='over'))game.step(1/60);acc-=1/60;steps++;}
    if(game)accept(game.snapshot());netTime+=dt;if(mode==='host'&&netTime>.05){network?.broadcast();netTime=0;}
    if(aimDirty&&isMine())sendAim();
    if(pendingDrop&&now-pendingDrop>2000)pendingDrop=0;
    ghostTime+=dt;if(ghostTime>.12&&state?.phase==='aim'){ghostTime=0;projection();}
    hudTime+=dt;if(hudTime>.1){hudTime=0;updateHud();}
    view.draw(state||demo,{dt,home:mode==='home'||mode==='connecting',localAim:isMine()?aim:null,landingY});
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
const code=new URLSearchParams(location.search).get('room');if(code){$('room-input').value=code.toUpperCase().slice(0,5);$('join-form').hidden=false;$('join-toggle').setAttribute('aria-expanded','true');status('Pick a builder name and join your friends.');}
