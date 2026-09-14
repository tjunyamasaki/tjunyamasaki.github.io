import {createScene} from './visualization/scene.mjs';
import {C,ball,racketSetup} from './physics/engine.mjs';
import {add,mul,length,limit,clamp,rpm,rotate,unit} from './physics/math.mjs';
import {simulate,sample,align} from './simulation/timeline.mjs';
import {SPINS,SERVES,RETURNS,COMPARES,LESSONS,defaults,spinFor} from './simulation/presets.mjs';

const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={mode:'return',config:defaults(),spin:[280,-280,0],spinQ:[0,0,0,1],spinDisplayQ:[0,0,0,1],
  time:0,playing:!reduced,rate:.5,autoSlow:true,compare:'toss',timelines:[],baseline:null,
  preset:0,view:'arena',cinematic:!reduced,cinematicClose:false,lesson:null,
  overlays:{axis:true,components:false,ring:true,vectors:true,lens:true,ghosts:false,trails:true,baseline:true,readable:true,reduced}};
let scene,framePending=false,uiAt=0,lastNow=0,audioContext=null,sound=false,toastTimer,edited=false,modalWasPlaying=false;
const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';
const vec=a=>'('+a.map(n=>fmt(n,1)).join(', ')+')';
function toast(message){
  $('toast').textContent=message;$('toast').classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);
}
function current(){return state.mode==='spin'?{...ball([0,1.13,0],[0,0,0],state.spin),q:state.spinQ,displayQ:state.spinDisplayQ,t:state.time}:sample(state.timelines[0],state.time);}
function duration(){return Math.max(...state.timelines.map(t=>t.duration),1);}
function actualMode(){return state.mode==='compare'?COMPARES.find(p=>p.id===state.compare).mode:state.mode;}
function setCamera(view){
  state.view=view;$('camera').value=view;scene.setView(view);
  $('lens-label').hidden=state.mode==='spin'||view==='ball'||view==='contact'||!state.overlays.lens;
}
function updatePlay(){
  $('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'Pause':'Play');
  $('speed').textContent=state.rate+'×';
}
function rebuild(reset=true){
  if(state.mode==='spin'){state.timelines=[];state.baseline=null;scene.setTimelines([],null);updateReadout();return;}
  let timelines,ghost;
  if(state.mode==='compare'){
    const p=COMPARES.find(p=>p.id===state.compare);
    const base={...state.config,mode:p.mode};
    timelines=align(simulate({...base,...p.a}),simulate({...base,...p.b}));
    ghost=simulate({...base,...p.a},{noMagnus:true});
    const offset=timelines[0].impactTime-ghost.impactTime;
    if(offset>0){ghost={...ghost,states:[{...ghost.states[0],t:0},...ghost.states.map(s=>({...s,t:s.t+offset}))],duration:ghost.duration+offset};}
    $('label-a').textContent=p.labels[0];$('label-b').textContent=p.labels[1];
  }else{
    timelines=[simulate(state.config)];
    ghost=simulate(state.config,state.mode==='bounce'?{noSpin:true}:{noMagnus:true});
  }
  state.timelines=timelines;state.baseline=ghost;scene.setTimelines(timelines,ghost);
  if(reset)state.time=0;else state.time=clamp(state.time,0,duration());
  $('timeline').max=String(duration());
  $('duration-label').textContent=fmt(duration(),2)+' s';
  buildEvents();updateReadout();
}
function scheduleRebuild(){
  edited=true;state.cinematic=false;
  if(framePending)return;framePending=true;
  requestAnimationFrame(()=>{framePending=false;rebuild(false);
    const hit=state.timelines[0]?.impactTime;
    if(hit&&$('adjust-dialog').open)state.time=hit+.001;
    updateEditSummary();
  });
}
function buildEvents(){
  const used=new Set();
  $('event-markers').innerHTML='';
  state.timelines[0].events.filter(e=>e.kind!=='floor').forEach(e=>{
    if(used.has(e.kind)&&e.kind!=='bounce')return;
    if(e.kind==='bounce'&&used.has('two-bounces'))return;
    if(e.kind==='bounce'&&used.has('bounce'))used.add('two-bounces');
    used.add(e.kind);
    const b=document.createElement('button');
    b.textContent=({release:'↑',falling:'↓',racket:'◆',bounce:'·',net:'∣','net-hit':'×',launch:'↗'})[e.kind]||'·';
    b.style.left=(e.t/duration()*100)+'%';b.dataset.kind=e.kind;b.title=e.label;b.setAttribute('aria-label','Jump to '+e.label);
    b.onclick=()=>{state.time=e.t;state.playing=false;state.cinematic=false;updatePlay();updateReadout();};
    $('event-markers').append(b);
  });
}
function setMode(mode){
  state.mode=mode;state.time=0;state.cinematic=false;state.cinematicClose=false;state.preset=0;
  state.config=defaults(mode==='compare'?COMPARES.find(p=>p.id===state.compare).mode:mode);
  if(mode==='spin'){state.spin=[280,-280,0];state.spinQ=[0,0,0,1];state.spinDisplayQ=[0,0,0,1];}
  scene.setMode(mode);state.view=mode==='spin'?'ball':'arena';$('camera').value=state.view;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('spin-controls').hidden=mode!=='spin';$('timeline-wrap').hidden=mode==='spin';
  $('toss-handle-wrap').hidden=mode!=='serve';$('comparison-labels').hidden=mode!=='compare';
  $('lens-label').hidden=mode==='spin'||!state.overlays.lens;
  $('adjust').textContent=mode==='spin'?'Fine tune ↗':'Adjust ↗';
  $('step').disabled=false;
  renderPresets();setHeading();rebuild();updatePlay();
}
function setHeading(){
  const text={
    spin:['02 / THE SPIN LAB','One ball.<br><em>Any axis.</em>','Drag the ball to add spin · Drag space to orbit'],
    return:['01 / THE RETURN','Sidespin in.<br><em>Topspin out.</em>','Drag the racket to brush · Pinch to explore'],
    serve:['03 / THE SERVE','Make every<br><em>brush count.</em>','Drag the toss handle · Shape your stroke in Adjust'],
    bounce:['04 / THE BOUNCE','Same table.<br><em>Different story.</em>','Colored: spin · Dashed: no spin · Try the side view'],
    compare:['05 / SIDE BY SIDE','Change one thing.<br><em>See everything.</em>','A and B share the same clock · Impacts synchronized'],
  }[state.mode];
  $('chapter').textContent=text[0];$('headline').innerHTML=text[1];$('gesture-hint').textContent=text[2];
}
function renderPresets(){
  $('presets').innerHTML='';
  const items=state.mode==='spin'||state.mode==='bounce'?SPINS:state.mode==='serve'?SERVES:state.mode==='compare'?COMPARES:RETURNS;
  items.forEach((p,i)=>{
    const b=document.createElement('button');b.textContent=p.name;
    const active=state.mode==='compare'?state.compare===p.id:state.mode==='bounce'?state.config.incoming===p.id:state.mode==='spin'?state.preset===p.id:state.preset===i;
    b.setAttribute('aria-pressed',String(active));
    b.onclick=()=>{
      state.cinematic=false;state.preset=state.mode==='spin'?p.id:i;
      if(state.mode==='spin'){state.spin=p.w.slice();state.spinQ=[0,0,0,1];state.spinDisplayQ=[0,0,0,1];}
      else if(state.mode==='bounce')state.config.incoming=p.id;
      else if(state.mode==='compare'){state.compare=p.id;state.config=defaults(p.mode);}
      else Object.assign(state.config,p);
      state.time=0;state.playing=!reduced;renderPresets();rebuild();updatePlay();
    };$('presets').append(b);
  });
}
function addSpin(impulse){
  state.spin=limit(add(state.spin,impulse),1400);state.preset='custom';state.cinematic=false;renderPresets();updateReadout();
}
function strokeGesture(direction,speed){
  if(!['return','serve'].includes(state.mode))return;
  state.config.direction=direction;state.config.speed=speed;state.preset=-1;state.playing=false;
  scheduleRebuild();updatePlay();
}
scene=createScene($('world'),{onSpin:addSpin,onStroke:strokeGesture,onStrokeEnd:()=>{state.time=Math.max(0,(state.timelines[0]?.impactTime||0)-.2);state.playing=!reduced;renderPresets();updatePlay();},onContextLost:()=>{
  state.playing=false;updatePlay();$('error').hidden=false;
}});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.lesson=null;$('lesson-card').hidden=true;setMode(b.dataset.mode);});
document.querySelectorAll('[data-axis]').forEach(b=>b.onclick=()=>{
  const w=[0,0,0];w[Number(b.dataset.axis)]=Number(b.dataset.sign)*140;addSpin(w);
  toast('ω = ('+state.spin.map(n=>Math.round(n)).join(', ')+') rad/s');
});
$('play').onclick=()=>{state.playing=!state.playing;if(state.time>=duration())state.time=0;updatePlay();};
$('replay').onclick=()=>{
  if(state.mode==='spin'){state.spin=[0,0,0];state.spinQ=[0,0,0,1];state.spinDisplayQ=[0,0,0,1];state.preset='none';renderPresets();toast('Spin reset. Drag the ball to begin.');}
  state.time=0;state.playing=!reduced;updatePlay();updateReadout();
};
$('step').onclick=()=>{
  state.playing=false;state.cinematic=false;
  if(state.mode==='spin'){state.spinQ=rotate(state.spinQ,state.spin,C.dt);state.spinDisplayQ=rotate(state.spinDisplayQ,state.spin,C.dt,true);state.time+=C.dt;}
  else state.time=Math.min(duration(),state.time+C.dt);
  updatePlay();updateReadout();
};
$('speed').onclick=()=>{const rates=[1,.5,.25];state.rate=rates[(rates.indexOf(state.rate)+1)%rates.length];updatePlay();};
$('timeline').addEventListener('input',e=>{state.time=Number(e.target.value);state.playing=false;state.cinematic=false;updatePlay();updateReadout();});
$('camera').onchange=e=>{state.cinematic=false;setCamera(e.target.value);};
$('reset-view').onclick=()=>setCamera(state.mode==='spin'?'ball':'arena');
$('overlays').onclick=()=>{
  const on=!state.overlays.axis;state.overlays.axis=on;state.overlays.vectors=on;state.overlays.ring=on;
  $('overlays').setAttribute('aria-pressed',String(on));syncOverlayChecks();
};
function syncOverlayChecks(){
  document.querySelectorAll('[data-overlay]').forEach(input=>input.checked=state.overlays[input.dataset.overlay]);
}
document.querySelectorAll('[data-overlay]').forEach(input=>input.onchange=()=>{
  state.overlays[input.dataset.overlay]=input.checked;
  $('lens-label').hidden=state.mode==='spin'||state.view==='ball'||state.view==='contact'||!state.overlays.lens;
  $('display-note').textContent=state.overlays.readable?'Ball enlarged · Surface rotation slowed for clarity':'Ball enlarged · Real angular speed (may visually alias)';
});
$('magnus').onchange=e=>{state.config.magnus=e.target.checked;rebuild();};
$('auto-slow').onchange=e=>state.autoSlow=e.target.checked;
$('sound').onchange=async e=>{
  sound=e.target.checked;
  if(sound){try{audioContext||=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();}catch{sound=false;e.target.checked=false;toast('Sound is unavailable in this browser.');}}
};
function tapSound(kind){
  if(!sound||!audioContext||audioContext.state!=='running')return;
  const o=audioContext.createOscillator(),g=audioContext.createGain(),now=audioContext.currentTime;
  o.type='sine';o.frequency.setValueAtTime(kind==='racket'?900:650,now);o.frequency.exponentialRampToValueAtTime(180,now+.04);
  g.gain.setValueAtTime(.06,now);g.gain.exponentialRampToValueAtTime(.0001,now+.055);
  o.connect(g);g.connect(audioContext.destination);o.start(now);o.stop(now+.06);
}
function openDialog(id){
  modalWasPlaying=state.playing;state.playing=false;state.cinematic=false;updatePlay();
  $(id).showModal();
}
document.querySelectorAll('dialog').forEach(d=>{
  d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());
  d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right||e.clientY>r.bottom)d.close();}});
  d.addEventListener('close',()=>{
    if(d.id==='adjust-dialog'&&edited){
      state.time=Math.max(0,(state.timelines[0]?.impactTime||0)-.22);edited=false;setCamera(state.mode==='spin'?'ball':'arena');
    }
    state.playing=modalWasPlaying;updatePlay();
  });
});
$('settings').onclick=()=>openDialog('settings-dialog');
$('about').onclick=()=>openDialog('about-dialog');
$('lessons').onclick=()=>openDialog('lessons-dialog');
$('lesson-list').innerHTML=LESSONS.map((l,i)=>'<button data-lesson="'+i+'"><span>0'+(i+1)+'</span><b>'+l.title+'<small>'+l.mode.toUpperCase()+' · An experiment to try</small></b></button>').join('');
document.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>{
  const l=LESSONS[Number(b.dataset.lesson)];$('lessons-dialog').close();
  if(l.compare)state.compare=l.compare;setMode(l.mode);
  if(l.incoming){state.config.incoming=l.incoming;rebuild();}
  if(l.kind==='compose'){state.spin=[0,-320,0];state.overlays.components=true;syncOverlayChecks();}
  state.lesson=l;$('lesson-text').textContent=l.body;$('lesson-action').textContent=l.action+' ↗';$('lesson-card').hidden=false;
  state.playing=!reduced;updatePlay();
});
$('dismiss-lesson').onclick=()=>{$('lesson-card').hidden=true;state.lesson=null;};
$('lesson-action').onclick=()=>{
  const l=state.lesson;if(!l)return;
  if(l.kind==='compose')addSpin([240,0,0]);
  else if(l.kind==='adjust')$('adjust').click();
  else jumpImpact(l.kind==='bounce'?'bounce':'racket');
};
function jumpImpact(kind='racket'){
  const timeline=state.timelines[0],event=timeline?.events.find(e=>e.kind===kind)||timeline?.events.find(e=>e.contact);
  if(!event)return;
  state.time=Math.max(0,event.t-.1);state.rate=.25;state.playing=true;state.cinematic=false;
  setCamera(event.kind==='racket'?'contact':'side');updatePlay();updateReadout();
}
function range(id,label,value,min,max,step,unitText,help=''){
  return '<div class="control-row"><label class="control-label" for="control-'+id+'">'+label+'<output id="value-'+id+'">'+fmt(value,step<1?2:0)+' '+unitText+'</output></label><input id="control-'+id+'" data-control="'+id+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'" data-unit="'+unitText+'">'+(help?'<small>'+help+'</small>':'')+'</div>';
}
function renderAdjust(){
  const mode=actualMode(),c=state.config;
  $('adjust-title').textContent=state.mode==='spin'?'Build your own axis.':mode==='bounce'?'Set the launch.':'Shape the stroke.';
  if(state.mode==='spin'){
    $('adjust-content').innerHTML='<p class="small">Drag the ball to add spin freely, or tune its world-axis components here. Topspin is +X for travel toward +Z.</p>'+
      ['X · top / back','Y · sidespin','Z · corkscrew'].map((name,i)=>range('w'+i,name,state.spin[i],-1000,1000,10,'rad/s')).join('')+
      '<div id="edit-summary" class="vector-equation"></div>';
  }else{
    const spinSelect='<label class="control-select">Incoming spin<select id="incoming-select">'+SPINS.map(p=>'<option value="'+p.id+'" '+(c.incoming===p.id?'selected':'')+'>'+p.name+(p.id==='left'?' · CW above':p.id==='right'?' · CCW above':'')+'</option>').join('')+'</select></label>';
    let html=state.mode==='compare'?'<p class="small">Both scenarios share these settings. The selected comparison keeps its two contrasting values.</p>':'';
    if(mode!=='serve')html+=spinSelect;
    if(mode==='bounce'){
      html+=range('launchSpeed','Forward speed',c.launchSpeed,.5,8,.1,'m/s')+
        range('launchHeight','Launch height above floor',c.launchHeight,.85,2.2,.01,'m');
    }else{
      if(mode==='serve')html+=range('toss','Toss above contact point',c.toss,.16,2.5,.01,'m','The drop height changes downward speed, not spin by itself.')+
        range('contactHeight','Contact height above floor',c.contactHeight,.83,1.35,.01,'m')+
        range('offset','Horizontal toss offset',c.offset,-.5,.5,.01,'m');
      html+='<div class="gesture-editors"><div class="gesture-editor"><svg id="stroke-pad" class="gesture-pad" viewBox="0 0 120 120" tabindex="0" role="slider" aria-label="Stroke direction. Drag arrow tip; arrow keys adjust direction." aria-valuemin="0" aria-valuemax="360" aria-valuenow="'+c.direction+'"><defs><marker id="stroke-head" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="#c6a0ff"/></marker></defs><path class="pad-grid" d="M60 15V105M15 60H105"/><circle cx="60" cy="60" r="37" fill="none" stroke="#52705755"/><text x="48" y="13">UPWARD</text><text x="44" y="114">DOWNWARD</text><line id="stroke-line" class="stroke-line" x1="60" y1="60" x2="60" y2="23" marker-end="url(#stroke-head)"/><circle id="stroke-tip" cx="60" cy="23" r="5" fill="#c6a0ff"/><circle cx="60" cy="60" r="3" fill="#d9e8c6"/></svg><p>Brush direction<br>Drag the purple arrow</p></div><div class="gesture-editor"><svg id="contact-pad" class="gesture-pad" viewBox="0 0 120 120" tabindex="0" role="application" aria-label="Contact patch. Drag the orange dot or use arrow keys."><circle class="contact-ball" cx="60" cy="60" r="35"/><ellipse class="contact-guide" cx="60" cy="60" rx="16" ry="35"/><ellipse class="contact-guide" cx="60" cy="60" rx="35" ry="12"/><line x1="25" y1="60" x2="95" y2="60" stroke="#203c33" stroke-width="3"/><circle id="contact-dot" class="contact-marker" cx="60" cy="60" r="6"/><text x="29" y="113">RACKET-SIDE VIEW</text></svg><p>Contact on the ball<br>Drag the orange dot</p></div></div>';
      html+=range('speed','Racket speed',c.speed,.2,14,.1,'m/s')+
        range('brush','Brush ↔ hit through',c.brush,0,1,.01,'','Left: normal hit · Right: tangential brush')+
        range('angle','Face angle · open / closed',c.angle,-40,40,1,'°')+
        '<div id="edit-summary" class="vector-equation"></div>';
    }
    $('adjust-content').innerHTML=html;
    if($('incoming-select'))$('incoming-select').onchange=e=>{c.incoming=e.target.value;state.preset=-1;scheduleRebuild();renderPresets();};
    if($('stroke-pad'))wirePads();
    if(state.mode==='compare'){
      const p=COMPARES.find(x=>x.id===state.compare);
      for(const key of Object.keys(p.a)){const el=$('control-'+key);if(el){el.disabled=true;el.closest('.control-row').title='This value is set separately for A and B.';}}
      if(p.a.incoming&&$('incoming-select'))$('incoming-select').disabled=true;
    }
  }
  document.querySelectorAll('[data-control]').forEach(input=>input.addEventListener('input',()=>{
    const key=input.dataset.control,value=Number(input.value);
    if(state.mode==='spin')edited=true;
    if(key.startsWith('w')){state.spin[Number(key[1])]=value;state.preset='custom';updateEditSummary();updateReadout();}
    else{state.config[key]=value;state.preset=-1;scheduleRebuild();}
    $('value-'+key).textContent=fmt(value,Number(input.step)<1?2:0)+' '+input.dataset.unit;
    renderPresets();
  }));
  updatePads();updateEditSummary();
}
$('adjust').onclick=()=>{renderAdjust();edited=false;openDialog('adjust-dialog');};
function wirePad(element,apply,key){
  let active=false;
  const move=e=>{const r=element.getBoundingClientRect();apply(clamp((e.clientX-r.left)/r.width*2-1,-1,1),clamp(1-(e.clientY-r.top)/r.height*2,-1,1));updatePads();scheduleRebuild();};
  element.onpointerdown=e=>{active=true;element.setPointerCapture(e.pointerId);move(e);};
  element.onpointermove=e=>{if(active)move(e);};
  element.onpointerup=element.onpointercancel=()=>active=false;
  element.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();key(e.key);updatePads();scheduleRebuild();}};
}
function wirePads(){
  wirePad($('stroke-pad'),(x,y)=>{
    state.config.direction=(Math.atan2(y,x)*180/Math.PI+360)%360;
    const speed=clamp(Math.hypot(x,y)*12,.2,14);state.config.speed=speed;
    $('control-speed').value=speed;$('value-speed').textContent=fmt(speed)+' m/s';
  },key=>state.config.direction=(state.config.direction+(key==='ArrowRight'||key==='ArrowUp'?5:-5)+360)%360);
  wirePad($('contact-pad'),(x,y)=>{state.config.contactX=clamp(x*1.5,-1,1);state.config.contactY=clamp(y*1.5,-1,1);},
    key=>{const k=key==='ArrowLeft'||key==='ArrowRight'?'contactX':'contactY';state.config[k]=clamp(state.config[k]+(key==='ArrowRight'||key==='ArrowUp'?.05:-.05),-1,1);});
}
function updatePads(){
  const c=state.config,a=c.direction*Math.PI/180;
  if($('stroke-line')){
    const x=60+Math.cos(a)*37,y=60-Math.sin(a)*37;
    $('stroke-line').setAttribute('x2',x);$('stroke-line').setAttribute('y2',y);
    $('stroke-tip').setAttribute('cx',x);$('stroke-tip').setAttribute('cy',y);
    $('stroke-pad').setAttribute('aria-valuenow',Math.round(c.direction));
    $('contact-dot').setAttribute('cx',60+c.contactX*24);$('contact-dot').setAttribute('cy',60-c.contactY*24);
  }
}
function vectorGlyph(w,color='#e9ff78'){
  const n=unit(w),x=n[0]*.82+n[2]*.55,y=n[1]*.85-n[2]*.25;
  const dx=x*24,dy=-y*24,a=Math.atan2(dy,dx),tip=[30+dx,28+dy];
  if(length(w)<.001)return '<svg viewBox="0 0 60 57" aria-label="Zero vector"><circle cx="30" cy="28" r="4" fill="'+color+'"/></svg>';
  return '<svg viewBox="0 0 60 57" aria-label="Projected vector"><circle cx="30" cy="28" r="17" fill="none" stroke="#42604d"/><path d="M30 28L'+tip.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2.6"/><path d="M'+(tip[0]-7*Math.cos(a-.5))+' '+(tip[1]-7*Math.sin(a-.5))+'L'+tip.join(' ')+'L'+(tip[0]-7*Math.cos(a+.5))+' '+(tip[1]-7*Math.sin(a+.5))+'" fill="none" stroke="'+color+'" stroke-width="2.2"/></svg>';
}
function equation(a,d,b){
  return '<figure>'+vectorGlyph(a,'#7de3ed')+'<figcaption>incoming ω</figcaption></figure><strong>+</strong><figure>'+vectorGlyph(d,'#ff9a76')+'<figcaption>stroke Δω</figcaption></figure><strong>=</strong><figure>'+vectorGlyph(b)+'<figcaption>resulting ω</figcaption></figure>';
}
function updateEditSummary(){
  const el=$('edit-summary');if(!el)return;
  if(state.mode==='spin')el.innerHTML='<figure>'+vectorGlyph(state.spin)+'<figcaption>ω '+vec(state.spin)+' rad/s</figcaption></figure>';
  else {
    const hit=state.timelines[0]?.impact;
    if(hit)el.innerHTML=equation(hit.before.w,hit.deltaW,hit.after.w);
  }
}
let tossStart=null;
$('toss-handle').onpointerdown=e=>{tossStart={y:e.clientY,toss:state.config.toss};e.currentTarget.setPointerCapture(e.pointerId);state.playing=false;state.cinematic=false;updatePlay();};
$('toss-handle').onpointermove=e=>{
  if(!tossStart)return;
  state.config.toss=clamp(tossStart.toss+(tossStart.y-e.clientY)*.012,.16,2.5);
  $('toss-value').textContent=fmt(state.config.toss,2)+' m';scheduleRebuild();
};
$('toss-handle').onpointerup=$('toss-handle').onpointercancel=()=>{if(tossStart){tossStart=null;state.time=0;state.playing=!reduced;updatePlay();}};
$('toss-handle').onkeydown=e=>{
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();state.config.toss=clamp(state.config.toss+(e.key==='ArrowUp'?.1:-.1),.16,2.5);scheduleRebuild();}
};
function contactToInspect(){
  const t=state.timelines[0];if(!t)return null;
  if(actualMode()==='bounce')return t.events.find(e=>e.kind==='bounce')?.contact;
  return t.impact;
}
const vectors=[
  ['before','Incoming angular velocity ω','The ball arrives already rotating. This vector is retained unless the contact impulse changes it.','#7de3ed'],
  ['deltaW','Angular impulse Δω','The torque impulse adds this vector to the incoming angular velocity. Its direction follows r × J.','#ff9a76'],
  ['after','Resulting angular velocity ω','Incoming ω plus the stroke’s Δω gives one resultant axis. A tilted axis means mixed spin.','#e9ff78'],
  ['velocity','Racket velocity','The surface moves in this direction at contact. Its normal and tangential components have different jobs.','#c6a0ff'],
  ['surface','Ball surface velocity','This contact patch moves with the center velocity plus ω × r. Spin changes how fast the rubber sees the patch moving.','#7de3ed'],
  ['relative','Relative contact velocity','Racket velocity minus ball surface velocity. Its tangential part sets the friction direction.','#f0db9e'],
  ['tangentImpulse','Friction impulse','Friction on the ball follows the tangential relative velocity. It changes translation and spin together.','#ff9a76'],
  ['impulse','Total impulse','The normal rebound impulse and tangential friction impulse combine into the change in linear momentum.','#e9ff78'],
];
function showWhy(){
  const hit=contactToInspect(),s=current(),bounce=actualMode()==='bounce';
  $('why-title').textContent=state.mode==='spin'?'One vector. One rotation.':bounce?'Watch the bottom patch.':actualMode()==='serve'?'More fall. More possibility.':'Follow the friction.';
  $('why-text').textContent=state.mode==='spin'?'Each gesture adds to angular velocity. The axis is the direction of the sum, so mixed spin rotates continuously around one tilted axis.':
    bounce?'The table pushes upward and friction opposes slip at the bottom of the ball. Topspin can reduce forward slip; backspin increases it. Pure vertical sidespin has no rotational surface velocity at that bottom point.':
    actualMode()==='serve'?'A higher toss arrives with more downward velocity. Only the part of the relative motion tangent to the racket can drive friction and torque. The brush and face angle determine the outgoing spin.':
    'The racket meets a patch already moving because of translation and spin. Friction follows the tangential difference between the racket and that patch. Its torque adds a new vector to the incoming spin.';
  $('vector-equation').innerHTML=hit?equation(hit.before.w,hit.deltaW,hit.after.w):
    '<figure>'+vectorGlyph(state.spin)+'<figcaption>ω '+vec(state.spin)+' rad/s</figcaption></figure>';
  $('vector-inspector').innerHTML='';
  if(hit)vectors.forEach(([key,name,description,color])=>{
    const b=document.createElement('button');b.textContent=name;b.style.color=color;
    b.onclick=()=>{
      $('vector-inspector').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
      const value=key==='before'?hit.before.w:key==='after'?hit.after.w:hit[key];
      $('vector-description').textContent=description+' '+vec(value)+(key.includes('Impulse')||key==='impulse'?' N·s':key==='before'||key==='after'||key==='deltaW'?' rad/s':' m/s');
      $('vector-equation').innerHTML='<figure>'+vectorGlyph(value,color)+'<figcaption>'+name+'</figcaption></figure>';
    };$('vector-inspector').append(b);
  });
  $('inspect-impact').hidden=!hit;
  const setup=state.timelines[0]?.racket;
  const rows=[
    ['Current speed',fmt(length(s.v),2)+' m/s · '+fmt(length(s.v)*3.6,1)+' km/h'],
    ['Current spin',fmt(rpm(s.w),0)+' RPM · '+fmt(length(s.w),1)+' rad/s'],
    ['World ω (X, Y, Z)',vec(s.w)+' rad/s'],
    ['Toss above contact',fmt(state.config.toss,2)+' m'],
    ['Downward speed at racket',hit?fmt(Math.max(0,-hit.before.v[1]),2)+' m/s':'—'],
    ['Ideal descent · √(2gΔh)',actualMode()==='serve'?fmt(Math.sqrt(2*C.gravity*state.config.toss),2)+' m/s':'—'],
    ['Racket velocity',setup?vec(setup.velocity)+' m/s':'—'],
    ['Face pitch',fmt(state.config.angle,0)+'° + contact-patch tilt'],
    ['Relative contact velocity',hit?vec(hit.relative)+' m/s':'—'],
    ['Normal / tangent impulse',hit?fmt(length(hit.normalImpulse),4)+' / '+fmt(length(hit.tangentImpulse),4)+' N·s':'—'],
    ['Restitution / friction',bounce?C.tableRestitution+' / '+C.tableFriction:C.racketRestitution+' / '+C.racketFriction],
    ['Ball / inertia','2.7 g · 40 mm · ⅔mr²'],
  ];
  $('advanced').innerHTML=rows.map(([label,value])=>'<div><span>'+label+'</span><b>'+value+'</b></div>').join('');
  openDialog('why-dialog');
}
$('why').onclick=showWhy;
$('inspect-impact').onclick=()=>{$('why-dialog').close();jumpImpact(actualMode()==='bounce'?'bounce':'racket');};
function updateReadout(){
  const s=current(),t=state.timelines[0];
  $('rpm').textContent=Math.round(rpm(s.w)).toLocaleString('en-US');
  $('timeline').value=state.time;$('timeline').style.setProperty('--progress',state.time/duration()*100+'%');
  $('time-label').textContent=fmt(state.time,2)+' s';
  $('toss-value').textContent=fmt(state.config.toss,2)+' m';
  const e=t?.events.filter(e=>e.t<=state.time).at(-1);
  $('phase').textContent=state.mode==='spin'?length(state.spin)<1?'Give it a spin':'ONE AXIS · '+fmt(rpm(s.w),0)+' RPM':e?.label||'Ready';
  $('event-label').textContent=e?.label||'Drag time. See the moment.';
  const spinName=SPINS.find(p=>p.id===state.config.incoming)?.name||'Custom spin';
  if(state.mode==='spin'){
    $('scenario-label').textContent='ω = ('+state.spin.map(n=>Math.round(n)).join(', ')+') RAD/S';
    const components=state.spin.filter(n=>Math.abs(n)>2).length;
    $('insight').textContent=components>1?'The sum tilts the axis.':components?'A pure, single-axis spin.':'Start with a swipe.';
  }else if(state.mode==='serve'){
    $('scenario-label').textContent=(SERVES[state.preset]?.name||'CUSTOM SERVE').toUpperCase()+' · '+fmt(state.config.toss,2)+' M TOSS';
    $('insight').textContent=state.time<(t?.impactTime||0)?'Falling faster. Still no spin.':'The brush makes the difference.';
  }else if(state.mode==='bounce'){
    $('scenario-label').textContent=spinName.toUpperCase()+' / SAME LAUNCH';
    $('insight').textContent=state.config.incoming==='left'||state.config.incoming==='right'?'A curve in flight. Watch the bounce.':'Watch what friction changes.';
  }else if(state.mode==='compare'){
    $('scenario-label').textContent=COMPARES.find(p=>p.id===state.compare).name.toUpperCase();
    const b=sample(state.timelines[1],state.time);
    $('insight').textContent='A '+Math.round(rpm(s.w)).toLocaleString()+'  /  B '+Math.round(rpm(b.w)).toLocaleString()+' RPM';
  }else{
    $('scenario-label').textContent=(RETURNS[state.preset]?.name||'CUSTOM RETURN').toUpperCase();
    $('insight').textContent=state.time<(t?.impactTime||0)?'Incoming spin meets your stroke.':'One stroke. A new axis.';
  }
}
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min((now-lastNow)/1000||.016,.04);lastNow=now;
  if(document.hidden)return;
  const oldTime=state.time;
  if(state.playing&&!document.querySelector('dialog[open]')){
    let speed=state.rate;
    if(state.autoSlow&&state.mode!=='spin'){
      const near=state.timelines[0].events.some(e=>e.contact&&Math.abs(state.time-e.t)<.09);
      if(near)speed*=.22;
    }
    state.time+=dt*speed;
    if(state.mode==='spin'){
      state.spinQ=rotate(state.spinQ,state.spin,dt*speed);
      state.spinDisplayQ=rotate(state.spinDisplayQ,state.spin,dt*speed,true);
    }else{
      state.timelines[0].events.filter(e=>e.contact&&e.t>oldTime&&e.t<=state.time).forEach(e=>tapSound(e.kind));
      if(state.time>duration()+.45){
        state.time=0;
        if(state.cinematic){state.cinematic=false;setCamera('arena');toast('Your turn. Drag the racket, or try the Spin Lab.');}
      }
    }
  }
  if(state.cinematic&&state.mode==='return'){
    const hit=state.timelines[0].impactTime,close=state.time>hit-.13&&state.time<hit+.16;
    if(close!==state.cinematicClose){state.cinematicClose=close;setCamera(close?'contact':'arena');}
  }
  const states=state.mode==='spin'?[current()]:state.timelines.map(t=>sample(t,state.time));
  scene.update(states,state.time,dt,state.overlays);
  if(now-uiAt>90){uiAt=now;updateReadout();}
}
document.addEventListener('visibilitychange',()=>{lastNow=performance.now();});
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!['INPUT','BUTTON','SELECT','TEXTAREA'].includes(e.target.tagName)&&!document.querySelector('dialog[open]')){
    e.preventDefault();$('play').click();
  }
});
setHeading();renderPresets();scene.setMode('return');rebuild();updatePlay();
$('loading').hidden=true;
document.documentElement.dataset.spinLabReady='true';
// Read-only diagnostics for browser smoke checks; no external services or analytics.
window.spinLabSnapshot=()=>({mode:state.mode,time:state.time,spin:current().w,
  events:state.timelines.map(t=>t.events.map(e=>({kind:e.kind,t:e.t}))),canvas:{width:$('world').width,height:$('world').height}});
requestAnimationFrame(animate);
