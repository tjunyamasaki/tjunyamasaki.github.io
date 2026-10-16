import {GAMES,createJar,step,setAspect,setGravity,dropFood,hitBody,poke,fling,shake,skyAt,rollRarity,pickIndex,pickEvent,lifeStep,readMemory,arrive} from './sim.mjs';
import {drawCreature,drawGlow} from './creatures.js';
import * as S from './scene.js';
import {createAudio} from './audio.js';
import {createCapsule} from './capsule.js';

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const canvas=$('jar'), ctx=canvas.getContext('2d');
const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)'), reduced=()=>reducedQuery.matches;
const rng=Math.random;
const buzz=pattern=>{try{if(navigator.userActivation?.hasBeenActive!==false)navigator.vibrate?.(pattern);}catch{}};

// ── Memory ────────────────────────────────────────────────────────────────
const KEY='the-jar.v1';
const store={get(){try{return localStorage.getItem(KEY);}catch{return null;}},set(v){try{localStorage.setItem(KEY,v);}catch{}}};
const arrival=arrive(readMemory(store.get()),Date.now());
let memory=arrival.memory, saveTimer=0;
const saveNow=()=>store.set(JSON.stringify(memory));
const save=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,600);};
saveNow();
addEventListener('pagehide',saveNow);

// ── World ─────────────────────────────────────────────────────────────────
const jar=createJar({rng});
const scene=S.createScene(memory.seed);scene.rng=rng;
const byId=new Map(GAMES.map(g=>[g.id,g]));
const audio=createAudio();
const shiny=rng()<1/40?jar.bodies[Math.floor(rng()*jar.bodies.length)].id:null;
const LIFE_N=6;
const randomCells=()=>Uint8Array.from({length:LIFE_N*LIFE_N},()=>rng()<.38?1:0);
for(const b of jar.bodies){
  b.lookX=0;b.lookY=0;b.zT=rng()*2;
  if(b.id==='fodinha'){b.lives=3;b.lifeT=0;}
  if(b.id==='game-of-life'){b.cells=randomCells();b.prev=null;b.lifeT=0;}
}
const bodyById=id=>jar.bodies.find(b=>b.id===id);

// ?hour=22 previews another time of day; ?event=rain summons a surprise right away.
const params=new URLSearchParams(location.search), forcedHour=params.has('hour')?Number(params.get('hour')):NaN;
let forcedEvent=params.get('event');
let time=0, last=performance.now(), hourOffset=0, hourShown=0, nightFlag='', jarShake=0;
let nextEventAt=10+rng()*10, nextIdleAt=4+rng()*5;
const emotes=new Map(), names=new Map(), chats=[];
const tilt={x:0,y:1,key:0,sensor:null};
const grav={x:0,y:1};

function emote(id,emoji,dur=2.4){emotes.set(id,{emoji:String(emoji),t0:time,dur});}
function showName(id,dur=3){names.set(id,time+dur);}
for(const b of jar.bodies)showName(b.id,memory.visits<=3?6:3.5);

let toastTimer=0;
function toast(text,seconds=4.2){
  const el=$('toast');el.textContent=text;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),seconds*1000);
}
if(arrival.message)setTimeout(()=>toast(arrival.message,6),900);
if(memory.visits<=3){const hint=$('hint');hint.hidden=false;setTimeout(()=>{hint.hidden=true;},9500);}
if(shiny)setTimeout(()=>{toast(`✨ ${byId.get(shiny).name} is shiny today. Lucky you.`,5);},memory.visits===1?8000:7000);

// ── Layout ────────────────────────────────────────────────────────────────
const view={vw:0,vh:0,dpr:1};
const L={x:0,y:0,k:1,w:0};
function resize(){
  view.vw=innerWidth;view.vh=innerHeight;view.dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(view.vw*view.dpr);canvas.height=Math.round(view.vh*view.dpr);
  const top=Math.max(96,view.vh*.13), bottom=118, avail=Math.max(240,view.vh-top-bottom);
  let W=Math.min(view.vw-44,440), k=W/100, aspect=(avail/k-15)/100;
  if(aspect<1.15){aspect=1.15;k=avail/(115+15);W=k*100;}
  aspect=Math.min(aspect,1.55);
  setAspect(jar,aspect);
  const H=(jar.h+15)*k;
  L.k=k;L.w=W;L.x=(view.vw-W)/2;L.y=top+(avail-H)/2+12*k;
  S.layoutStars(scene,view.vw,view.vh);
}
addEventListener('resize',resize);
resize();
const toJar=(cx,cy)=>[(cx-L.x)/L.k,(cy-L.y)/L.k];

// ── Sensors ───────────────────────────────────────────────────────────────
function onOrient(e){
  if(e.gamma==null||e.beta==null)return;
  const r=Math.PI/180, a=((screen.orientation?.angle??window.orientation??0)||0)*r;
  const dx=Math.sin(clamp(e.gamma,-70,70)*r), dy=Math.sin(clamp(e.beta,-90,90)*r);
  const sx=dx*Math.cos(a)+dy*Math.sin(a), sy=-dx*Math.sin(a)+dy*Math.cos(a);
  tilt.sensor={x:sx*1.5,y:sy+.45};
}
let lastShakeAt=-9;
function onMotion(e){
  const a=e.accelerationIncludingGravity;if(!a)return;
  if(Math.hypot(a.x||0,a.y||0,a.z||0)>26&&time-lastShakeAt>1.4)doShake(.9);
}
function listenSensors(){addEventListener('deviceorientation',onOrient);addEventListener('devicemotion',onMotion);}
const needsPermission=typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function';
// Android sends tilt right away; iOS stays silent until asked, so only then offer the Tilt button.
listenSensors();
if(needsPermission&&matchMedia('(pointer: coarse)').matches)setTimeout(()=>{if(!tilt.sensor)$('tilt').hidden=false;},1500);
$('tilt').addEventListener('click',async()=>{
  try{
    const res=await DeviceOrientationEvent.requestPermission();
    try{await DeviceMotionEvent?.requestPermission?.();}catch{}
    if(res==='granted'){$('tilt').hidden=true;toast('Tilt your phone. Everyone slides. Shake it, too.');}
    else toast('No tilting then. The Shake button still works.');
  }catch{toast('Tilt is not available here. The Shake button still works.');}
});
addEventListener('keydown',e=>{
  if(e.target!==document.body&&e.target!==canvas)return;
  if(e.key==='ArrowLeft')tilt.key=-1;
  else if(e.key==='ArrowRight')tilt.key=1;
  else if(e.key===' '){e.preventDefault();doShake(1);}
});
addEventListener('keyup',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight')tilt.key=0;});

// ── Actions ───────────────────────────────────────────────────────────────
function doShake(strength=1){
  lastShakeAt=time;
  shake(jar,strength);jarShake=reduced()?0:1;
  audio.play('shake');buzz([30,40,30]);
  for(const p of scene.plants)if(p.kind!=='grass')S.burst(scene,p.x,jar.floor-p.h*.5,'leaf',2,{speed:25,g:14,life:2.4,size:1.3,color:rng()<.5?'#7cc77f':'#9be08f'});
  const picks=[...jar.bodies].sort(()=>rng()-.5).slice(0,4);
  picks.forEach((b,i)=>setTimeout(()=>emote(b.id,['😵','💫','😆','🙃'][i]),200+i*180));
  if(scene.butterfly){scene.butterfly.phase='out';scene.butterfly.ty=-30;}
  if(scene.snail)scene.snail.hat=1;
}

function pokeCritter(b){
  const g=byId.get(b.id), wasAsleep=b.mode==='sleep';
  poke(jar,b);memory.pokes[b.id]=(memory.pokes[b.id]||0)+1;save();
  audio.play('poke',b.index);buzz(12);showName(b.id);
  S.burst(scene,b.x,b.y-b.r,'heart',2,{angle:-Math.PI/2,speed:14,g:-6,life:1.1,size:1.4,color:'#ff7aa2',spread:6});
  if(wasAsleep)emote(b.id,'😪');
  else if(b.id==='count')emote(b.id,String(memory.pokes[b.id]));
  else if(b.id==='fodinha'&&rng()<.4&&b.lives>0){b.lives--;b.lifeT=0;emote(b.id,b.lives?'💔':'😵');S.burst(scene,b.x,b.y-b.r*1.4,'heart',4,{speed:16,g:30,life:.9,size:1,color:'#e63968'});}
  else if(b.id==='table-tennis'){b.vy-=40;emote(b.id,'🏓');}
  else if(rng()<.55)emote(b.id,g.emotes[Math.floor(rng()*g.emotes.length)]);
  openSheet(b);
}

function catchGolden(){
  const gf=scene.golden;scene.golden=null;
  memory.golden++;save();
  S.burst(scene,gf.x,gf.y,'spark',18,{speed:26,g:0,life:1.2,size:1.8,color:'#ffe08a'});
  audio.play('sparkle');buzz([15,30,15,30,40]);
  toast(memory.golden===1?'You caught a golden firefly! They only show up now and then.':`Golden firefly caught! That makes ${memory.golden}.`);
  for(const b of jar.bodies)if(b.mode!=='sleep'&&rng()<.5)emote(b.id,rng()<.5?'🤩':'✨');
}

const FINDS=['a tiny button','a very small key','half a crayon','a seed that hums','a marble with a galaxy in it','a note that says “hi”','a lost Presidente vote','a crumb from 2019'];
function tapEmpty(x,y,cx,cy){
  if(sheetFor){closeSheet();return;}
  const v=S.hitVisitor(scene,jar,x,y);
  if(v==='golden')return catchGolden();
  if(v==='butterfly'){const bf=scene.butterfly;bf.phase='out';bf.ty=-30;bf.tx=bf.x+(rng()-.5)*40;S.burst(scene,bf.x,bf.y,'spark',6,{speed:12,g:0,life:.8,color:'#fff'});audio.play('chime',2);return;}
  if(v==='snail'){scene.snail.hat=1.4;scene.snail.say=2.6;audio.play('chime',-3);buzz(10);return;}
  if(v&&v.startsWith('mushroom:')){
    const m=scene.mushrooms.splice(+v.split(':')[1],1)[0];
    S.burst(scene,m.x,jar.floor-m.size*1.6,'spore',14,{speed:16,g:-4,life:1.6,size:1.2,color:m.color});
    audio.play('pop');buzz(10);return;
  }
  const bx=jar.w*.74, tagX=bx-1.6, tagY=3.6;
  if(Math.hypot(x-tagX,y-tagY)<6){openList();return;}
  const cel=scene.cel;
  if(cel&&Math.hypot(cx-cel.x,cy-cel.y)<cel.r&&!(x>-3&&x<jar.w+3&&y>-12&&y<jar.h+3)){
    hourOffset+=6;audio.play('time');buzz(20);
    toast(cel.isSun?'☀️ → time flies in a jar.':'🌙 → time flies in a jar.',2.4);
    return;
  }
  if(x>0&&x<jar.w&&y>-7&&y<jar.floor){
    dropFood(jar,x,Math.max(y,1.5));audio.play('plop');buzz(8);
    S.burst(scene,x,Math.max(y,1.5),'ring',1,{speed:0,g:0,life:.5,size:2,color:'rgba(255,255,255,A)'});
    return;
  }
  if(x>0&&x<jar.w&&y>=jar.floor&&y<jar.h){
    S.burst(scene,x,jar.floor,'dirt',7,{angle:-Math.PI/2,speed:22,g:80,life:.8,size:1.2,color:'#6b4f3f',spread:3});
    audio.play('dirt');buzz(8);
    if(rng()<.08)toast(`You dug up ${FINDS[Math.floor(rng()*FINDS.length)]}.`);
    return;
  }
  if(x>-4&&x<jar.w+4&&y>-13&&y<jar.h+4){
    audio.play('glass');buzz([6,40,6]);
    for(const b of jar.bodies)if(b.mode!=='sleep'&&b.grounded&&rng()<.7){b.vy-=30+rng()*30;b.wobble=.8;}
    const awake=jar.bodies.filter(b=>b.mode!=='sleep');
    for(let i=0;i<Math.min(3,awake.length);i++)emote(awake[Math.floor(rng()*awake.length)].id,i?'❗':'👀',1.6);
    return;
  }
  if(scene.meteorShower>0&&y<0){
    memory.wishes++;save();audio.play('wish');buzz(20);
    toast(memory.wishes===1?'You made a wish on a shooting star. Don’t tell anyone.':`Wish number ${memory.wishes}, made. The stars are taking notes.`);
  }
}

// ── Events ────────────────────────────────────────────────────────────────
function runEvent(name,night){
  const awake=jar.bodies.filter(b=>b.mode!=='sleep'&&!b.held);
  switch(name){
    case 'chat':{
      if(awake.length<2)return;
      const a=awake[Math.floor(rng()*awake.length)], b=awake.filter(x=>x!==a)[Math.floor(rng()*(awake.length-1))];
      const ga=byId.get(a.id), gb=byId.get(b.id);
      a.face=Math.sign(b.x-a.x)||1;b.face=-a.face;
      chats.push({at:time,id:a.id,emoji:ga.emotes[Math.floor(rng()*ga.emotes.length)]},
        {at:time+1.4,id:b.id,emoji:gb.emotes[Math.floor(rng()*gb.emotes.length)]},
        {at:time+2.8,id:a.id,emoji:['😂','❤️','🤝','‼️','🤔','😮'][Math.floor(rng()*6)]});
      return;}
    case 'party':{
      const star=awake[0]?awake[Math.floor(rng()*awake.length)]:jar.bodies[0];
      toast(`🎉 It’s ${byId.get(star.id).name}’s birthday! (Probably.)`);
      emote(star.id,'🥳',4);audio.play('fanfare',3);buzz([20,30,20]);
      for(let i=0;i<5;i++)setTimeout(()=>S.burst(scene,10+rng()*80,-6,'confetti',14,{angle:Math.PI/2,speed:20,g:22,life:3.2,size:1.6,spread:30}),i*350);
      for(const b of awake){b.vy-=60+rng()*40;if(b!==star&&rng()<.6)setTimeout(()=>emote(b.id,'🎉'),400+rng()*900);}
      return;}
    case 'meteors':S.spawnVisitor(scene,jar,name,night);toast('Shooting stars! Tap the sky to make a wish.',5);return;
    case 'golden':if(S.spawnVisitor(scene,jar,name,night))audio.play('chime',7);return;
    case 'mushrooms':if(S.spawnVisitor(scene,jar,name,night))setTimeout(()=>audio.play('pop'),600);return;
    case 'rain':if(S.spawnVisitor(scene,jar,name,night))toast('A little rain cloud stopped by.',3);return;
    default:S.spawnVisitor(scene,jar,name,night);
  }
}

function handleSimEvents(events){
  let bumps=0;
  for(const e of events){
    const b=bodyById(e.id);
    if(e.type==='eat'){
      S.burst(scene,e.x,e.y,'heart',3,{angle:-Math.PI/2,speed:12,g:-5,life:1.2,size:1.2,color:'#ff7aa2',spread:3});
      audio.play('eat',b?.index||0);
      if(rng()<.6)emote(e.id,e.id==='bloom'?'😋':['😋','💖','🍪','✨'][Math.floor(rng()*4)],1.8);
    }else if(e.type==='bump'&&bumps++<2)audio.play('bump',Math.min(200,e.speed));
    else if(e.type==='hop'&&e.big&&e.id==='table-tennis')audio.play('boing');
    else if(e.type==='wake'&&rng()<.5)emote(e.id,'🥱',1.6);
  }
}

// ── Input ─────────────────────────────────────────────────────────────────
let pointer=null;
canvas.addEventListener('pointerdown',e=>{
  if(pointer)return;
  canvas.setPointerCapture?.(e.pointerId);
  const [x,y]=toJar(e.clientX,e.clientY), b=hitBody(jar,x,y,3);
  pointer={id:e.pointerId,sx:e.clientX,sy:e.clientY,cx:e.clientX,cy:e.clientY,x,y,t0:performance.now(),body:b,moved:false,hist:[[x,y,performance.now()]]};
  if(b){b.held=true;b.mode='idle';pointer.ox=b.x-x;pointer.oy=b.y-y;}
});
canvas.addEventListener('pointermove',e=>{
  if(!pointer||e.pointerId!==pointer.id)return;
  const [x,y]=toJar(e.clientX,e.clientY);
  pointer.x=x;pointer.y=y;pointer.cx=e.clientX;pointer.cy=e.clientY;
  if(Math.hypot(e.clientX-pointer.sx,e.clientY-pointer.sy)>8)pointer.moved=true;
  pointer.hist.push([x,y,performance.now()]);if(pointer.hist.length>6)pointer.hist.shift();
});
function release(e,cancel=false){
  if(!pointer||e.pointerId!==pointer.id)return;
  const p=pointer;pointer=null;
  const quick=performance.now()-p.t0<380;
  if(p.body){
    const b=p.body;b.held=false;
    if(cancel)return;
    if(!p.moved&&quick){pokeCritter(b);return;}
    const now=performance.now(), h=p.hist.filter(q=>now-q[2]<110), a=h[0]||p.hist[0], z=p.hist.at(-1), dt=Math.max(.016,(z[2]-a[2])/1000);
    const vx=(z[0]-a[0])/dt, vy=(z[1]-a[1])/dt;
    fling(b,vx,vy);
    const speed=Math.hypot(b.vx,b.vy);
    if(speed>120){audio.play('boing');buzz(15);emote(b.id,rng()<.5?'😆':'🫨',1.6);}
    return;
  }
  if(!cancel&&!p.moved)tapEmpty(p.x,p.y,p.cx,p.cy);
}
canvas.addEventListener('pointerup',e=>release(e));
canvas.addEventListener('pointercancel',e=>release(e,true));
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// ── UI ────────────────────────────────────────────────────────────────────
const portraits=new Map();
let sheetFor=null, sheetHide=0;
const sheet=$('sheet');
function openSheet(b){
  const g=byId.get(b.id), n=memory.pokes[b.id]||0;
  sheetFor=b.id;clearTimeout(sheetHide);
  sheet.style.setProperty('--c',g.color);
  $('sheet-tag').textContent=g.tag;$('sheet-name').textContent=g.name;$('sheet-bio').textContent=g.bio;$('sheet-blurb').textContent=g.blurb;
  $('sheet-stats').textContent=`Poked ${n} ${n===1?'time':'times'}${b.id===shiny?' · ✨ shiny today':''}${n>=25?' · best friends now':''}`;
  $('sheet-play').href=g.href;
  portraits.set($('portrait'),{game:g,body:b});
  sheet.hidden=false;requestAnimationFrame(()=>sheet.classList.add('open'));
}
function closeSheet(){
  if(!sheetFor)return;
  sheetFor=null;sheet.classList.remove('open');portraits.delete($('portrait'));
  sheetHide=setTimeout(()=>{sheet.hidden=true;},450);
}
$('sheet-close').addEventListener('click',closeSheet);
$('portrait').addEventListener('click',()=>{const b=bodyById(sheetFor);if(b){b.wobble=1;audio.play('poke',b.index+2);}});

const list=$('list');
for(const g of GAMES){
  const li=document.createElement('li'), a=document.createElement('a');
  a.href=g.href;a.style.setProperty('--c',g.color);
  a.innerHTML='<span class="dot" aria-hidden="true"></span><span class="nm"></span><span class="go" aria-hidden="true">→</span>';
  a.querySelector('.nm').textContent=g.name;
  const small=document.createElement('small');small.textContent=g.tag;a.querySelector('.nm').append(small);
  li.append(a);$('list-items').append(li);
}
function openList(){closeSheet();list.showModal();}
$('open-list').addEventListener('click',openList);
list.querySelector('[data-close]').addEventListener('click',()=>list.close());
list.addEventListener('click',e=>{if(e.target===list)list.close();});

const capsule=createCapsule({games:GAMES,rng,rollRarity,pickIndex,audio,buzz,reduced,
  setPortrait:g=>{const c=$('prize-portrait');if(g){c.style.setProperty('--c',g.color);portraits.set(c,{game:g,body:null});}else portraits.delete(c);},
  onSpin:(g,r)=>{memory.spins++;save();const b=bodyById(g.id);if(b){emote(b.id,r.stars>=3?'🤩':'👋',3);showName(b.id,4);}}});
$('open-capsule').addEventListener('click',()=>{closeSheet();capsule.open();});
$('shake').addEventListener('click',()=>doShake(1));
$('sound').addEventListener('click',async()=>{
  const btn=$('sound'), on=await audio.setEnabled(!audio.on);
  btn.setAttribute('aria-pressed',String(on));btn.setAttribute('aria-label',on?'Sound on':'Sound off');
  btn.querySelector('.state').textContent=on?'on':'off';
  if(on)audio.play('chime',0);
});

// ── Frame ─────────────────────────────────────────────────────────────────
function hoursNow(){
  const d=new Date(), base=Number.isFinite(forcedHour)?forcedHour:d.getHours()+d.getMinutes()/60+d.getSeconds()/3600;
  return base+hourShown;
}

function update(dt,night){
  // Gravity eases toward the phone's tilt (or arrow keys).
  const target=tilt.key?{x:tilt.key*1.3,y:1}:tilt.sensor||{x:0,y:1};
  grav.x+=(target.x-grav.x)*Math.min(1,dt*6);grav.y+=(target.y-grav.y)*Math.min(1,dt*6);
  setGravity(jar,grav.x,grav.y);
  if(pointer?.body){
    const b=pointer.body, tx=pointer.x+pointer.ox, ty=pointer.y+pointer.oy, k=Math.min(1,dt*22);
    const nx=b.x+(tx-b.x)*k, ny=b.y+(ty-b.y)*k;
    b.vx=(nx-b.x)/Math.max(dt,1e-3);b.vy=(ny-b.y)/Math.max(dt,1e-3);b.x=nx;b.y=ny;
  }
  handleSimEvents(step(jar,dt,{night}));
  for(const b of jar.bodies){
    if(b.lives!==undefined&&b.lives<3&&(b.lifeT+=dt)>5){b.lives++;b.lifeT=0;if(b.lives===3)emote(b.id,'❤️',1.4);}
    if(b.cells&&(b.lifeT+=dt)>.6){
      b.lifeT=0;
      const next=lifeStep(b.cells,LIFE_N), same=a=>a&&next.every((v,i)=>v===a[i]);
      // Reseed when the colony dies out or settles into a still life or blinker.
      const stale=!next.some(Boolean)||same(b.cells)||same(b.prev);
      b.prev=b.cells;b.cells=stale?randomCells():next;
    }
    if(b.mode==='sleep'&&(b.zT-=dt)<0){b.zT=1.3+rng()*.8;S.burst(scene,b.x+b.r*.5,b.y-b.r,'text',1,{text:'z',angle:-1.1,speed:5,g:-1.5,life:2,size:1.5,color:'rgba(255,255,255,.9)'});}
    let tx=null, ty=null;
    if(pointer&&pointer.body!==b){tx=pointer.x;ty=pointer.y;}
    else if(jar.food.length){let best=Infinity;for(const f of jar.food){const d=Math.hypot(f.x-b.x,f.y-b.y);if(d<best){best=d;tx=f.x;ty=f.y;}}}
    else if(scene.golden){tx=scene.golden.x;ty=scene.golden.y;}
    else if(scene.butterfly){tx=scene.butterfly.x;ty=scene.butterfly.y;}
    const lx=tx===null?b.face*.6:clamp((tx-b.x)/25,-1,1), ly=ty===null?0:clamp((ty-b.y)/25,-1,1);
    b.lookX+=(lx-b.lookX)*Math.min(1,dt*8);b.lookY+=(ly-b.lookY)*Math.min(1,dt*8);
  }
  while(chats.length&&chats[0].at<=time){const c=chats.shift();if(bodyById(c.id).mode!=='sleep')emote(c.id,c.emoji,1.8);}
  if(time>nextIdleAt){
    nextIdleAt=time+5+rng()*8;
    const awake=jar.bodies.filter(b=>b.mode!=='sleep'&&!emotes.has(b.id));
    if(awake.length){const b=awake[Math.floor(rng()*awake.length)], g=byId.get(b.id);emote(b.id,g.emotes[Math.floor(rng()*g.emotes.length)],2);}
  }
  if(forcedEvent&&time>1.5){runEvent(forcedEvent,night);forcedEvent=null;}
  if(time>nextEventAt){nextEventAt=time+18+rng()*28;runEvent(pickEvent(rng,night),night);}
  for(const [id,e] of emotes)if(time-e.t0>e.dur)emotes.delete(id);
  for(const [id,until] of names)if(time>until+.6)names.delete(id);
  S.updateScene(scene,jar,dt,time,night,{emote,toast});
  jarShake=Math.max(0,jarShake-dt*2.5);
  audio.ambient(time,night);
}

const HAT={hollowstead:.9,fodinha:.9,hushlight:1,presidente:.75};
function render(sky,hours,night){
  const {dpr}=view, k=L.k, rot=Math.atan2(-jar.gravity.x,jar.gravity.y);
  const ox=jarShake?Math.sin(time*70)*jarShake*4:0, oy=jarShake?Math.cos(time*55)*jarShake*2:0;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  S.drawBackdrop(ctx,scene,sky,view,time,hours,{x:L.x-2.6*k,y:L.y-12*k,w:L.w+5.2*k,h:(jar.h+14.6)*k});
  ctx.setTransform(dpr*k,0,0,dpr*k,dpr*(L.x+ox),dpr*(L.y+oy));
  S.drawJarBack(ctx,jar,night);
  ctx.save();S.innerPath(ctx,jar);ctx.clip();
  S.drawRays(ctx,jar,time,night);
  S.drawSoil(ctx,jar,scene,night);
  S.drawPlants(ctx,jar,scene,time,memory.growth,grav.x*.3);
  S.drawMushrooms(ctx,jar,scene,night);
  if(Math.abs(jar.gravity.x)<.45)for(const b of jar.bodies){
    const gap=jar.floor-(b.y+b.r), a=.24*clamp(1-gap/45,0,1);
    if(a<=0)continue;
    ctx.fillStyle=`rgba(40,30,30,${a})`;ctx.beginPath();ctx.ellipse(b.x,jar.floor+.2,b.r*(.85-clamp(gap/90,0,.4)),1.3,0,0,Math.PI*2);ctx.fill();
  }
  for(const f of jar.food){
    const pulse=1+Math.sin(time*6+f.x)*.08;
    ctx.fillStyle='#e9b872';ctx.beginPath();ctx.arc(f.x,f.y,1.3*pulse,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#8a5a3b';for(const [dx,dy] of [[-.4,-.3],[.45,.1],[-.1,.5]]){ctx.beginPath();ctx.arc(f.x+dx,f.y+dy,.22,0,Math.PI*2);ctx.fill();}
  }
  const order=[...jar.bodies].sort((a,b)=>(a.held-b.held)||(a.y-b.y));
  for(const b of order)drawCreature(ctx,b,byId.get(b.id),time,{rot,shiny:b.id===shiny});
  S.drawSnail(ctx,jar,scene,time);
  S.drawButterfly(ctx,scene,time);
  S.drawParticles(ctx,scene,false);
  if(night>0){ctx.fillStyle=`rgba(16,18,58,${night*.36})`;ctx.fillRect(-6,-14,jar.w+12,jar.h+20);}
  ctx.globalCompositeOperation='lighter';
  for(const b of jar.bodies)drawGlow(ctx,b,byId.get(b.id),time,night,rot);
  S.drawMushrooms(ctx,jar,scene,night,true);
  S.drawFireflies(ctx,jar,scene,time,night);
  S.drawParticles(ctx,scene,true);
  ctx.globalCompositeOperation='source-over';
  ctx.restore();
  S.drawJarFront(ctx,jar,time,night,'nine games');
  S.drawRainCloud(ctx,scene,time);
  for(const b of jar.bodies){
    const until=names.get(b.id);
    if(until!==undefined){const g=byId.get(b.id);S.drawNameTag(ctx,b.x,b.y+b.r+1.4,g.name,Math.min(1,(until+.6-time)/.6));}
  }
  for(const [id,e] of emotes){
    const b=bodyById(id), age=time-e.t0, pop=age<.25?.6+age/.25*.4+Math.sin(age/.25*Math.PI)*.15:1;
    S.drawBubble(ctx,b.x,b.y-b.r*(1.25+(HAT[id]||0)),e.emoji,3.2,Math.min(1,(e.dur-age)/.4),pop);
  }
}

function drawPortraits(){
  for(const [cv,{game,body}] of portraits){
    const css=cv.clientWidth||88, px=Math.round(css*view.dpr);
    if(cv.width!==px){cv.width=px;cv.height=px;}
    const c=cv.getContext('2d'), k=px/34;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,px,px);
    c.setTransform(k,0,0,k,px/2,px*.6);
    const g=game, src=body||{id:g.id,index:GAMES.indexOf(g),r:g.r,mode:'idle',wobble:0,squash:0,lives:3,cells:bodyById(g.id)?.cells,spin:time};
    const proxy={...src,x:0,y:0,squash:0,lookX:0,lookY:.2};
    drawCreature(c,proxy,g,time,{shiny:g.id===shiny});
    c.globalCompositeOperation='lighter';drawGlow(c,proxy,g,time,.4);c.globalCompositeOperation='source-over';
  }
}

function frame(now){
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;time+=dt;
  hourShown+=(hourOffset-hourShown)*Math.min(1,dt*2.2);
  const hours=hoursNow(), sky=skyAt(hours), night=sky.night, flag=night>.5?'1':'0';
  if(flag!==nightFlag){nightFlag=flag;document.body.dataset.night=flag;document.querySelector('meta[name="theme-color"]').content=sky.top;}
  update(dt,night);
  render(sky,hours,night);
  if(portraits.size)drawPortraits();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{last=performance.now();});
requestAnimationFrame(t=>{last=t;frame(t);});
