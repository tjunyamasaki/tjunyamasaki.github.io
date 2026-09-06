import { createState, step, followers, nearbyShrine, constrainPosition, LEVEL } from './state.mjs';
import { directionToTarget } from './navigation.mjs';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createGroundGesture, bindHoldButton } from './gestures.mjs';

const $=id=>document.getElementById(id);
const canvas=$('world'), intro=$('intro'), pauseDialog=$('pause'), ending=$('ending');
let state=createState(), world;
try {world=createWorld(canvas);} catch(error) {
  $('loading').hidden=true;$('error').hidden=false;
  console.error('Hushlight renderer unavailable',error);
  throw error;
}
const sound=createAudio();
let soundOn=false, paused=false, failed=false, target=null, time=0, last=performance.now();
let endingAt=null, endingShown=false, toastUntil=0, lastMessage='', lastHud='', pointerKindle=false, lastActivity=0;
let zoom=1, palette='moonlit', gesture;
const keys=new Set();
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const moveKeys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'];
function clearInput(){keys.clear();pointerKindle=false;target=null;state.player.moving=false;gesture?.clear();}
function setPaused(value){paused=value;clearInput();sound.pause(value||document.hidden);last=performance.now();}
function showToast(message,duration=4){$('toast').textContent=message;$('toast').classList.add('show');toastUntil=time+duration;}
function openPause(){if(state.phase==='intro'||ending.open||failed)return;setPaused(true);pauseDialog.showModal();}
function closePause(){pauseDialog.close();setPaused(false);canvas.focus({preventScroll:true});}
$('help').addEventListener('click',openPause);
$('resume').addEventListener('click',closePause);
pauseDialog.addEventListener('cancel',e=>{e.preventDefault();closePause();});
intro.addEventListener('cancel',e=>e.preventDefault());
ending.addEventListener('cancel',e=>{e.preventDefault();stay();});
$('start').addEventListener('click',()=>{
  intro.close();state.phase='playing';$('hud').hidden=false;$('progress').hidden=false;
  $('zoom-controls').hidden=false;
  canvas.focus({preventScroll:true});clearInput();lastActivity=time;
  showToast('Walk near the golden lights. They will follow you.',6);
});
$('sound').addEventListener('click',async()=>{
  const button=$('sound');button.disabled=true;
  try {soundOn=await sound.setEnabled(!soundOn);button.setAttribute('aria-pressed',String(soundOn));button.innerHTML=`Sound <span>${soundOn?'on':'off'}</span>`;}
  catch(error){showToast('Sound is unavailable here. The garden is still yours.');console.warn('Audio unavailable',error);}
  finally {button.disabled=false;}
});
function stay(){ending.close();setPaused(false);lastHud='';canvas.focus({preventScroll:true});showToast('Stay as long as you like.',4);}
$('stay').addEventListener('click',stay);
function restart(){
  ending.close();state=createState(state.mode);state.phase='playing';time=0;endingAt=null;endingShown=false;lastHud='';lastMessage='';
  world.reset();setPaused(false);lastActivity=0;canvas.focus({preventScroll:true});showToast('A new night. The same little light.',4);
}
$('replay').addEventListener('click',restart);
$('new-night').addEventListener('click',restart);
function setPalette(value){
  palette=value==='ember'?'ember':'moonlit';world.setPalette(palette);
  document.documentElement.dataset.palette=palette;
  document.querySelector('meta[name="theme-color"]').content=palette==='ember'?'#100908':'#080f20';
  $('palette').value=palette;$('pause-palette').value=palette;
}
for(const id of ['palette','pause-palette'])$(id).addEventListener('change',e=>setPalette(e.target.value));
function selectMode(){
  state=createState($('mode').value);world.reset();lastHud='';
  const endless=state.mode==='endless';
  $('intro-description').textContent=endless?'Gather three lights. Offer them to the central altar. Let the garden keep you company, for as long as you like.':'Nine wandering lights. Three sleeping shrines. A quiet world waiting for you.';
  $('ritual-help').textContent=endless?'Bring three lights to the middle altar and hold to offer them. The lights return to the garden. Each offering sends lanterns into the sky.':'Stand beside a sleeping shrine. Hold Space, E, or the kindle button until it fills.';
}
$('mode').addEventListener('change',selectMode);
$('change-garden').addEventListener('click',()=>{
  pauseDialog.close();setPaused(false);time=0;endingAt=null;endingShown=false;lastMessage='';
  selectMode();$('hud').hidden=true;$('progress').hidden=true;$('zoom-controls').hidden=true;intro.showModal();
  setZoom(1);
});
function setZoom(value){
  zoom=world.setZoom(value);$('zoom-fit').textContent=`${zoom.toFixed(1)}×`;
  $('zoom-out').disabled=zoom<=1;$('zoom-in').disabled=zoom>=2.6;
}
$('zoom-out').addEventListener('click',()=>setZoom(zoom-.3));
$('zoom-in').addEventListener('click',()=>setZoom(zoom+.3));
$('zoom-fit').addEventListener('click',()=>setZoom(1));
setZoom(1);

window.addEventListener('keydown',e=>{
  if(e.code==='Escape' && !intro.open && !pauseDialog.open && !ending.open){e.preventDefault();openPause();return;}
  if(paused||state.phase==='intro'||failed||document.hidden)return;
  const isButton=e.target instanceof HTMLElement && e.target.closest('button,a');
  if(isButton && e.target!==$('kindle'))return;
  if(moveKeys.includes(e.code)||e.code==='Space'||e.code==='KeyE') {
    e.preventDefault();keys.add(e.code);lastActivity=time;
    if(moveKeys.includes(e.code))target=null;
    if(e.code==='Space'||e.code==='KeyE')target=null;
  }
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{
  clearInput();
  if(state.phase!=='intro'&&!pauseDialog.open&&!ending.open&&!failed)openPause();
});
document.addEventListener('visibilitychange',()=>{
  clearInput();last=performance.now();
  if(document.hidden){sound.pause(true);if(state.phase!=='intro'&&!pauseDialog.open&&!ending.open&&!failed)openPause();}
  else sound.pause(paused);
});
gesture=createGroundGesture({
  getZoom:()=>zoom,onZoom:setZoom,
  onGesture:()=>{target=null;keys.clear();pointerKindle=false;},
  onTap:(x,y)=>{
    const point=world.groundPoint(x,y);
    if(point){target={...constrainPosition(point.x,point.z,state.mode),active:true};lastActivity=time;}
  },
});
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0||paused||state.phase==='intro'||failed)return;
  canvas.setPointerCapture(e.pointerId);gesture.down(e.pointerId,e.clientX,e.clientY);
  canvas.focus({preventScroll:true});
});
canvas.addEventListener('pointermove',e=>gesture.move(e.pointerId,e.clientX,e.clientY));
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>gesture.up(e.pointerId,e.clientX,e.clientY,type!=='pointerup'));
canvas.addEventListener('wheel',e=>{
  if(paused||state.phase==='intro'||failed)return;e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.002));
},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const kindle=$('kindle');
bindHoldButton(kindle,{
  canHold:()=>!kindle.disabled&&!paused&&state.phase==='playing',
  onStart:()=>{clearInput();pointerKindle=true;lastActivity=time;},
  onStop:()=>{pointerKindle=false;},
});
// This element only ever kindles. Releasing a final hold must never activate replay.

// Steer click movement around the few solid shrine bases. Decorations sit off paths.
function movement(){
  let x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  let z=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
  if(!x&&!z&&target?.active){
    const direction=directionToTarget(state.player,target,state.mode);
    if(direction.arrived){target=null;return {x:0,z:0};}
    x=direction.x;z=direction.z;
  }
  return {x,z};
}
function updateHud(){
  const count=followers(state).length,near=nearbyShrine(state),complete=state.phase==='complete';
  const endless=state.mode==='endless';
  const ready=!!near&&count===3&&!complete;
  const objective=complete?'Every little light found a home.':count<3?'Find three wandering lights.':endless?'Bring your lights to the middle altar.':near?`Awaken ${near.name.toLowerCase()}.`:'Bring your lights to a sleeping shrine.';
  const key=`${state.mode}/${count}/${state.lit}/${state.offerings}/${near?.id}/${complete}/${endingShown}`;
  if(key!==lastHud){
    lastHud=key;$('objective').textContent=objective;
    $('chapter').textContent=endless?'∞ — A FIRE TO COME HOME TO':complete?'04 — THE NIGHT IS ALIVE':`${String(state.lit+1).padStart(2,'0')} — ${['THE WANDERING LIGHTS','A WARMER CORNER','ONE LAST LITTLE LIGHT'][state.lit]}`;
    $('progress').setAttribute('aria-label',endless?'Lights offered at the central altar':'Shrines awakened');
    $('progress-label').textContent=endless?`${state.offerings*3} lights · ${state.offerings} offerings`:`${state.lit} / 3 awakened`;
    document.querySelector('.shrine-marks').hidden=endless;
    document.querySelectorAll('.shrine-marks i').forEach((mark,i)=>mark.classList.toggle('lit',!!state.shrines[i]?.lit));
    document.querySelectorAll('.carried i').forEach((mark,i)=>mark.classList.toggle('full',i<count));
    document.querySelector('.carried').setAttribute('aria-label',`${count} of 3 lights following`);
    $('carried-label').textContent=complete?'All nine lights at home':`${count} / 3 following`;
    kindle.hidden=complete;kindle.disabled=!ready;
    $('new-night').hidden=!(complete&&endingShown);
    $('kindle-label').textContent=ready?(endless?'Hold to offer':'Hold to kindle'):count===3?(endless?'Find the middle altar':'Find a sleeping shrine'):'Find three lights';
    kindle.setAttribute('aria-label',ready?'Hold to offer your three lights. Keyboard: hold Space or E.':'Gather three lights and approach the altar or a sleeping shrine.');
    if(ready&&lastMessage!==near.id){showToast('Stand still. Hold Space, E, or the kindle button.',5);lastMessage=near.id;}
  }
  kindle.style.setProperty('--charge',`${(near?.charge||0)*100}%`);
}
function failure(message){
  failed=true;clearInput();sound.pause(true);
  for(const d of [intro,pauseDialog,ending])d.close();
  $('error-message').textContent=message;$('error').hidden=false;$('loading').hidden=true;
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();failure('The garden lost its graphics connection. Try again to start a fresh night.');});
window.addEventListener('resize',()=>world.resize());
function frame(now){
  if(failed)return;
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
  try{
    if(!document.hidden){
      if(!paused){
        time+=dt;
        const move=movement();
        const events=step(state,{...move,kindle:pointerKindle||keys.has('Space')||keys.has('KeyE')},dt);
        for(const event of events){
          sound.event(event);lastActivity=time;
          if(event.type==='collected'){
            world.burst(state.player.x,state.player.z,7);
            if(event.carried===3)showToast(state.mode==='endless'?'Three lights. Bring them to the middle altar.':'Three lights, one little constellation. Find a shrine.',5);
          }
          if(event.type==='kindled'){
            world.burst(event.x,event.z,24);clearInput();
            showToast(['The fern remembers the sun.','The tide remembers the stars.','The moon remembers you.'][LEVEL.shrines.findIndex(s=>s.id===event.id)],5);
          }
          if(event.type==='completed')endingAt=time+6;
          if(event.type==='offered'){
            world.burst(event.x,event.z,24);clearInput();
            showToast(`${state.offerings*3} lights offered. The garden gives them back.`,5);
          }
        }
        if(endingAt!==null&&time>=endingAt&&!endingShown){
          endingShown=true;
          const seconds=Math.round(state.completedAt),minutes=Math.floor(seconds/60);
          $('elapsed').textContent=`Three shrines · Nine lights · ${minutes?`${minutes}m `:''}${seconds%60}s of quiet`;
          setPaused(true);ending.showModal();
        }
        if(state.phase==='playing'&&time-lastActivity>24){
          showToast(followers(state).length===3?(state.mode==='endless'?'The altar in the middle is waiting.':'Look for a sleeping crystal. Your lights belong there.'):'Follow the golden glimmers scattered around the garden.',6);lastActivity=time;
        }
      }
      updateHud();
      if(time>toastUntil)$('toast').classList.remove('show');
      world.update(state,time,paused?0:dt,motion.matches,target);
    }
  }catch(error){console.error('Hushlight runtime error',error);failure('Something interrupted the garden. Try again to start a fresh night.');return;}
  requestAnimationFrame(frame);
}
world.update(state,0,0,motion.matches,null);
$('loading').hidden=true;intro.showModal();
requestAnimationFrame(frame);
