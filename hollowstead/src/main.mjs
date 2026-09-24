import {World,clamp,distance,biome} from './engine.mjs';
import {RULES,ITEMS,EQUIPMENT,NODES,STRUCTURES,RECIPES,CHARACTERS,label,phaseAt,dayAt,phaseRemaining} from './content.mjs';
import {Renderer,loadTheme} from './renderer.mjs';
import {createNetwork} from './network.mjs';
import {Sound} from './audio.mjs';
const $=id=>document.getElementById(id),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SAVE='hollowstead.expedition.v1',PROFILE='hollowstead.profile.v1';
let identity=crypto.randomUUID();try{identity=sessionStorage.getItem('hollowstead.identity')||identity;sessionStorage.setItem('hollowstead.identity',identity);}catch{}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The connection service did not respond. Please try again.')),18000);})]);}finally{clearTimeout(timer);}}
let theme,renderer,sound,world,network=null,mode='front',localId='host',character='ember',room='',paused=false,remotePaused=false,hiddenPause=false;
let sheet=null,category='all',campTarget=null,selected=null,placement=null,lastNotice=0,lastEvent=0,lastStatus='',lastEnd='',lastTime=0,acc=0,uiTime=0,networkTime=0,saveTime=0,pingTime=0;
let toastTimer,announceTimer,dirty=true,stick={x:0,z:0},hold={act:false,attack:false},keys=new Set(),pointer=null,pointerStart=null,busy=false;
function profile(){try{return JSON.parse(localStorage.getItem(PROFILE)||'{}');}catch{return {};}}
function saved(){try{const data=JSON.parse(localStorage.getItem(SAVE)||'null');return data?.world?.version===RULES.version?data:null;}catch{return null;}}
function storeProfile(){try{localStorage.setItem(PROFILE,JSON.stringify({name:$('player-name').value,character,sound:sound.enabled}));}catch{}}
function showStatus(text,error=false){$('front-status').textContent=text;$('front-status').style.color=error?'var(--red)':'var(--orange)';lastStatus=text;$('network-status').textContent=text;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
function announce(text){$('announcement').textContent=text;$('announcement').classList.add('visible');clearTimeout(announceTimer);announceTimer=setTimeout(()=>$('announcement').classList.remove('visible'),4100);}
function icon(key){const src=theme.sprites[ITEMS[key]?.icon||EQUIPMENT[key]?.icon||key]?.src||theme.sprites.ember.src;return `<img class="item-icon" src="${escape(src)}" alt="" draggable="false">`;}
function portrait(key){return `<span class="portrait" style="background-image:url('${theme.sprites[key]?.src||theme.sprites.ember.src}')"></span>`;}
function me(){return world.player(localId);}
function send(cmd){if(mode==='guest')network?.action(cmd);else if(mode==='solo'||mode==='host')world.action(localId,cmd);dirty=true;sound.unlock();}
function save(manual=false){if(!['solo','host'].includes(mode)||!world||world.status==='lobby')return;try{localStorage.setItem(SAVE,JSON.stringify({world:world.snapshot(),savedAt:Date.now()}));if(manual)toast('Expedition saved');else if(mode==='solo')$('network-status').textContent='Expedition saved';}catch{toast('Saving is unavailable in this browser. Keep this tab open.');}}
function syncSaveOption(){const s=saved();$('continue').hidden=!s;$('saved-option').hidden=!s;}
function resetInput(){keys.clear();stick={x:0,z:0};hold={act:false,attack:false};pointer=null;$('stick').style.transform='';if(world?.player(localId))world.input(localId,{x:0,z:0,act:false,attack:false});network?.input({x:0,z:0,act:false,attack:false});}
function prepareWorld(resume=false){
  if(resume){const data=saved();if(!data)throw new Error('No saved expedition was found.');world=World.restore(data.world);for(const p of world.players){p.online=p.id==='host';p.goal=null;}const p=world.player('host');if(!p)throw new Error('This saved expedition is missing its host.');p.online=true;if(world.status!=='playing')world.status='playing';}
  else{world=new World();world.addPlayer('host',$('player-name').value,character);}
  localId='host';lastEvent=world.eventId;lastNotice=0;lastEnd='';selected=null;placement=null;resetInput();paused=false;remotePaused=false;saveTime=0;dirty=true;
}
function enterGame(){
  $('front').hidden=true;$('game').hidden=false;$('end-screen').hidden=true;closeSheet();$('room-panel').hidden=true;document.body.classList.add('playing');$('camp-code').textContent=room?`CAMP ${room}`:'SOLO CAMP';if(mode==='solo')showStatus('Expedition saved locally');
  if(mode!=='guest'){world.start();save();}lastEnd='';announce(dayAt(world.time)===1?'Welcome to the Hollow Harvest.':'The fire remembers you.');
}
async function goHome(){
  save();resetInput();await network?.stop();network=null;mode='front';room='';paused=false;remotePaused=false;placement=null;closeSheet();$('placement').hidden=true;$('game').hidden=true;$('end-screen').hidden=true;$('front').hidden=false;$('room-panel').hidden=true;$('home-panel').hidden=false;$('connection-banner').hidden=true;document.body.classList.remove('playing','boss');setBusy(false);showStatus('');syncSaveOption();demoWorld();
}
function demoWorld(){world=new World(20261031);world.addPlayer('host','Wanderer',character);world.players[0].x=2;world.players[0].z=2;world.buildings.push(world.structure('chest',-2.5,1),world.structure('bench',3,-1),world.structure('lantern',-4,-1));world.time=163;renderer.focus.set(0,0,0);lastEvent=0;renderer.lastEvent=0;}
function setBusy(value){busy=value;for(const id of ['host','join','solo','continue'])$(id).disabled=value;}
function makeNetwork(){return createNetwork({identity,getWorld:()=>world,onFrame:data=>{const previous=world.status;world=World.restore(data);dirty=true;if(mode==='guest'&&world.status==='playing'&&previous!=='playing'){if(previous==='lobby')enterGame();else{$('end-screen').hidden=true;lastEnd='';}}},onReady:id=>{localId=id;setBusy(false);showStatus('Connected. Waiting for the host.');$('home-panel').hidden=true;$('room-panel').hidden=false;$('launch').hidden=true;$('room-code').textContent=room;$('room-note').textContent='The host will start when everyone is ready.';},onStatus:showStatus,onPause:value=>{remotePaused=value;$('connection-banner').hidden=!value;$('connection-banner').textContent='Host is away • the expedition is paused';},onLeave:text=>{resetInput();paused=true;setBusy(false);if($('game').hidden){$('room-panel').hidden=true;$('home-panel').hidden=false;showStatus(text,true);}else{$('connection-banner').textContent=text;$('connection-banner').hidden=false;openSheet('menu');}}});}
async function hostCamp(){
  if(busy)return;setBusy(true);sound.unlock();storeProfile();showStatus('Opening the camp…');
  try{prepareWorld($('host-save').checked);world.status='lobby';mode='host';network=makeNetwork();room=await bounded(network.host());if(!room)return;$('home-panel').hidden=true;$('room-panel').hidden=false;$('room-code').textContent=room;$('launch').hidden=false;$('room-note').textContent='Friends can also join after you start.';showStatus('Camp ready');dirty=true;setBusy(false);}
  catch(error){await network?.stop();network=null;mode='front';setBusy(false);showStatus(`Could not open the camp. ${error.message} Solo play is always available.`,true);}
}
async function joinCamp(){
  if(busy)return;setBusy(true);sound.unlock();storeProfile();room=$('room-input').value.trim().toUpperCase();showStatus('Following the lanterns…');
  try{world=new World();mode='guest';network=makeNetwork();await bounded(network.join(room,$('player-name').value,character));}catch(error){await network?.stop();network=null;mode='front';setBusy(false);showStatus(error.message,true);}
}
function solo(resume=false){sound.unlock();storeProfile();try{prepareWorld(resume);mode='solo';room='';enterGame();}catch(error){showStatus(error.message,true);}}
async function copyInvite(){const url=new URL(location.href);url.search='';url.searchParams.set('camp',room);try{await navigator.clipboard.writeText(url.href);mode==='front'||$('game').hidden?showStatus('Invite link copied. Send it to your friends.'):toast('Invite link copied');}catch{const text=`Camp code: ${room}`;$('game').hidden?showStatus(text):toast(text);}}
function currentTarget(){const p=me();if(!p)return null;return world.target(p,selected)?.entity||null;}
function interact(){
  const p=me();if(!p)return;const t=world.target(p,selected);
  if(!p.down&&!p.ghost&&t?.kind==='building'&&['chest','bench','pot','hearth','fire'].includes(t.entity.type)){campTarget=t.entity.id;openSheet('camp');hold.act=false;return;}
  send({type:'interact',target:t?.entity.id});hold.act=true;
}
function costHTML(cost,p){return Object.entries(cost).map(([k,n])=>`<span class="${world.available(p,k)<n?'missing':''}">${world.available(p,k)}/${n} ${escape(label(k))}</span>`).join('');}
function openSheet(name){if(sheet==='menu'&&mode==='solo')paused=false;resetInput();sheet=name;category='all';$('sheet').hidden=false;if(name==='menu'&&mode==='solo')paused=true;dirty=true;renderSheet();}
function closeSheet(){if(sheet==='menu'&&mode==='solo')paused=false;sheet=null;$('sheet').hidden=true;dirty=true;}
function renderSheet(){
  if(!sheet)return;const p=me();let title='',kicker='THE WANDERER’S COMPANION',tabs='',html='';
  if(sheet==='guide'){
    title='A field guide';html=`<p class="guide-intro">The woods are unkind.<br>Your friends don’t have to be.</p>`+[
      ['Gather before dusk','Move with the left stick, or tap the ground. Tap a tree or rock to walk over and harvest it. Hold Gather to keep working. Craft an axe and pick first.'],
      ['Build a home','Use Build, tap an open spot near you, then confirm. A workbench unlocks advanced gear. A supply chest shares materials with anyone crafting within five paces.'],
      ['Keep the fire alive','Feed the Heartfire wood before night. Firelight restores courage; darkness drains it, then your health. Hand lanterns use fuel only while switched on. Soul lanterns never go out.'],
      ['Eat, farm, recover','Eat from your pack or the quick Eat button. A burning fire cooks pumpkins, mushrooms and meat. A cauldron makes stew. Plant farm plots with seeds; harvest and replant. Bedrolls heal by day at the cost of hunger.'],
      ['Stand together','Hold Attack near an enemy; your best weapon is used automatically. Dodge out of the glowing attack circles. Armor absorbs damage. Walls block raiders, traps need rearming, and totems attack automatically.'],
      ['Leave nobody behind','Hold Gather beside a fallen friend for three seconds to revive them. Everyone has one last-chance charm. Fallen wanderers return at dawn if the camp survives. Dropped supplies can be recovered.'],
      ['Break the curse','Survive five nights and defeat the Hollow King on night five. Guard the Heartfire: losing it ends the expedition. Upgrade it with soul embers from the eastern graveyard and night creatures. After victory, you can keep surviving.'],
      ['Make it back tomorrow','The host saves the expedition automatically. Continue it alone or use “Host my saved expedition” to open a new camp. Keep the host’s tab open during co-op; switching away pauses everyone. Join with the new code after a disconnect.']
    ].map(([h,t],i)=>`<div class="guide-step"><b>0${i+1}</b><div><h3>${h}</h3><p>${t}</p></div></div>`).join('');html+='<div class="key-help"><span>WASD / arrows · Move</span><span>E · Gather / interact</span><span>Space · Attack</span><span>Shift · Dodge</span><span>I / C / B · Pack / Craft / Build</span><span>Q / F · Eat / Light</span><span>M · Map</span><span>Esc · Menu</span></div>';
  }else if(sheet==='menu'){
    title='By the fire';kicker=mode==='solo'?'EXPEDITION PAUSED':paused?'CONNECTION CLOSED':'THE EXPEDITION CONTINUES';
    html=`<div class="menu-row"><span>Camp</span><b>${escape(room||'Solo expedition')}</b></div><div class="menu-row"><span>Sound</span><button data-command="sound">${sound.enabled?'On':'Off'}</button></div><div class="menu-row"><span>Camera distance</span><div><button data-command="zoom-out" aria-label="Zoom out">−</button><button data-command="zoom-in" aria-label="Zoom in">+</button></div></div><div class="menu-actions"><button class="primary" data-command="resume">Back to the woods</button>${room?'<button data-command="invite">Copy camp invite ↗</button>':''}${mode!=='guest'?'<button data-command="save">Save expedition</button>':''}<button data-command="guide">Read the field guide</button><button data-command="home">Save & return to title</button></div><p class="muted small" style="margin-top:18px">${mode==='guest'?'The host keeps the shared save. Your progress is part of their expedition.':'Progress is saved on this browser. The host must keep this tab open for friends to play.'}</p>`;
  }else if(sheet==='map'){
    title='The Hollow Harvest';kicker=`DAY ${dayAt(world.time)} · SHARED EXPLORATION`;html='<canvas id="full-map" width="600" height="600" aria-label="Explored world map"></canvas><p class="map-legend">✦ Heartfire &nbsp; ● Wanderers &nbsp; ◆ Camp structures<br>Amber · pumpkin meadows<br>Green · crooked woods<br>Violet · haunted graveyard<br>Dark areas are unexplored. Travel together to reveal them.</p><button class="wide" data-command="ping-home">Call everyone back to camp ⚑</button>';
  }else if(!p){return;}
  else if(sheet==='pack'){
    title='Your pack';kicker='TAKE ONLY WHAT YOU CAN CARRY';html=`<div class="pack-summary"><span>${world.loadCount(p)} / ${RULES.capacity} supplies</span><span>${world.stores(p).length?'Shared chest in reach':'No chest nearby'}</span></div><div class="pack-grid">`+Object.entries(p.inventory).filter(([,n])=>n>0).map(([k,n])=>`<div class="pack-slot">${icon(k)}<b>${n}</b><span>${escape(label(k))}</span><div class="slot-actions">${ITEMS[k]?.food||ITEMS[k]?.heal?`<button data-use="${k}">${ITEMS[k].food?'Eat':'Heal'}</button>`:''}<button data-drop="${k}">Drop ${Math.min(n,5)}</button></div></div>`).join('')+'</div>';
    if(!world.loadCount(p))html+='<p class="empty">An empty pack.<br>The woods have plenty to give.</p>';
    html+='<p class="section-label">EQUIPMENT · AUTOMATICALLY EQUIPPED</p>'+Object.entries(p.equipment).filter(([,n])=>n>0).map(([k,n])=>`<div class="equipment">${icon(k)}<span>${escape(label(k))}</span><progress max="${EQUIPMENT[k].durability}" value="${n}"></progress><small>${Math.ceil(n/EQUIPMENT[k].durability*100)}%</small></div>`).join('');
    if(!Object.values(p.equipment).some(n=>n>0))html+='<p class="muted small">Craft an axe, pick and spear. Equipment is used automatically and wears with use.</p>';
    html+=`<p class="section-label">LAST-CHANCE CHARM · ${p.charm?'AVAILABLE':'SPENT'}</p><p class="muted small">One self-revive per expedition. Teammates can revive you without spending it.</p>`;
  }else if(sheet==='craft'||sheet==='build'){
    const building=sheet==='build';title=building?'Make a home':'Make something useful';kicker=building?'A SMALL DEFIANCE AGAINST THE DARK':'CRAFTING & COOKING';
    const groups=building?[['all','All'],['camp','Camp'],['defense','Defense'],['food','Food']]:[['all','All'],['tool','Equipment'],['cook','Cooking'],['item','Care']];tabs=groups.map(([key,t])=>`<button class="chip ${category===key?'active':''}" data-category="${key}">${t}</button>`).join('');
    html=Object.entries(RECIPES).filter(([key,r])=>building?r.kind==='build'&&(category==='all'||(category==='defense'?['wall','gate','trap','ward'].includes(key):category==='food'?['farm','pot'].includes(key):['fire','bench','chest','lantern','bed'].includes(key))):r.kind!=='build'&&(category==='all'||r.kind===category)).map(([key,r])=>{
      const reason=world.recipeReason(p,key),result=r.result||key;return `<div class="recipe">${icon(result)}<div><h3>${escape(label(result))}</h3><p>${r.desc}</p><div class="cost">${costHTML(r.cost,p)}</div>${reason?`<div class="reason">${escape(reason)}</div>`:''}</div><button data-recipe="${key}" ${reason?'disabled':''}>${building?'Place ↗':r.kind==='cook'?'Cook':'Craft'}</button></div>`;
    }).join('');
  }else if(sheet==='camp'){
    const b=world.buildings.find(b=>b.id===campTarget);if(!b||distance(p,b)>4.8){title='Camp out of reach';html='<p class="empty">Move closer to use this structure.</p>';}
    else{
      title=STRUCTURES[b.type].name;kicker='TEND TO YOUR HOME';html=`<div class="camp-detail">Condition: ${Math.ceil(b.hp)} / ${b.maxHp}${['hearth','fire'].includes(b.type)?`<br>Fire fuel: ${Math.ceil(b.fuel)} seconds at night`:''}${b.type==='hearth'?`<br>Heartfire level ${b.level} / 3`:''}</div><div class="camp-actions">`;
      if(['hearth','fire'].includes(b.type))html+=`<button data-command="fuel">Feed 1 wood (+55 fuel)</button><button data-command="cooking">Cook food</button>`;
      if(b.type==='hearth'&&b.level<3)html+=`<button data-command="upgrade" ${!world.canPay(p,world.upgradeCost())?'disabled':''}>Awaken Heartfire</button>`;
      if(b.type==='bench')html+='<button data-command="crafting">Craft equipment</button><button data-command="building">Build advanced structures</button>';
      if(b.type==='pot')html+='<button data-command="cooking">Cook food</button>';
      if(b.hp<b.maxHp)html+='<button data-command="repair">Repair · 1 wood</button>';
      if(b.type==='chest')html+='<button data-command="deposit">Store all materials</button>';
      html+='</div>';
      if(b.type==='hearth'&&b.level<3)html+=`<p class="section-label">NEXT AWAKENING · +300 HEALTH & MORE LIGHT</p><div class="cost">${costHTML(world.upgradeCost(),p)}</div>`;
      if(b.type==='chest'){html+='<p class="muted small">Nearby crafting uses these supplies automatically. Tap to take up to 10.</p><div class="pack-grid" style="margin-top:16px">'+Object.entries(b.store).filter(([,n])=>n>0).map(([k,n])=>`<button class="pack-slot" data-withdraw="${k}">${icon(k)}<b>${n}</b><span>${escape(label(k))}</span></button>`).join('')+'</div>';if(!Object.values(b.store).some(n=>n))html+='<p class="empty">Ready for your first supplies.</p>';}
      if(b.type!=='hearth')html+='<p class="section-label">RECOVER MATERIALS</p><button data-command="dismantle">Dismantle for half the materials</button>';
    }
  }
  $('sheet-title').textContent=title;$('sheet-kicker').textContent=kicker;$('sheet-tabs').innerHTML=tabs;$('sheet-content').innerHTML=html;if(sheet==='map')drawMap($('full-map'),true);
}
function placeRecipe(key){const p=me();placement={key,x:Math.round((p.x+p.dx*3)*2)/2,z:Math.round((p.z+p.dz*3)*2)/2,rotation:0,valid:false,anchored:false};closeSheet();$('placement').hidden=false;$('placement-name').textContent=label(key);selected=null;dirty=true;}
function objective(){const p=me(),h=world.buildings.find(b=>b.type==='hearth');if(!p)return;
  let title='MAKE YOURSELF A HOME',text='Gather wood and flint. Craft an axe and pick.',sub='The Heartfire must survive all five nights.';
  if(p.equipment.axe&&p.equipment.pick){text='Build a workbench and a shared supply chest.';}
  if(world.buildings.some(b=>b.type==='bench')){text='Craft a spear. Plant a patch. Fortify your camp.';}
  if(phaseAt(world.time)==='dusk'){title='THE LIGHT IS FADING';text='Return to camp. Eat and feed the Heartfire.';sub='Bring a hand lantern if you need to go out.';}
  if(phaseAt(world.time)==='night'){title='STAY IN THE LIGHT';text='Defend the Heartfire. Watch for enemy attack circles.';sub=`Night ${dayAt(world.time)} of ${RULES.finalNight} · ${Math.ceil(h?.fuel||0)} fire fuel`;}
  if(phaseAt(world.time)==='day'&&dayAt(world.time)>1){title='A NEW DAY, A STRONGER CAMP';text=h?.level<3?'Find soul embers in the eastern graveyard. Awaken the Heartfire.':'Prepare moon blades and wards for the Hollow King.';sub='Repair defenses, rearm traps, grow food.';}
  if(world.bossSlain){title='ONE LAST DAWN';text='The king has fallen. Keep the Heartfire alive.';}
  if(p.hunger<25){title='YOUR STOMACH IS GROWLING';text='Eat from your pack. Cook at a burning fire.';}
  $('objective-kicker').textContent=title;$('objective-text').textContent=text;$('objective-sub').textContent=sub;
}
function drawMap(canvas,full=false){
  const ctx=canvas.getContext('2d'),size=canvas.width,scale=size/84;ctx.clearRect(0,0,size,size);ctx.fillStyle='#282733';ctx.fillRect(0,0,size,size);const explored=new Set(world.explored);
  for(let z=0;z<21;z++)for(let x=0;x<21;x++){if(!explored.has(z*21+x))continue;ctx.fillStyle=theme.palette[biome(x*4-40,z*4-40)];ctx.fillRect(x*4*scale,z*4*scale,4*scale+.5,4*scale+.5);}
  const known=e=>explored.has(Math.floor((e.z+42)/4)*21+Math.floor((e.x+42)/4));
  if(full)for(const n of world.nodes){if(!known(n)||n.ready)continue;ctx.fillStyle=n.type==='tree'?'#374f48':n.type==='grave'||n.type==='ore'?'#d2c5d7':n.type==='pumpkin'?'#e8ae72':'#c1b993';ctx.beginPath();ctx.arc((n.x+42)*scale,(n.z+42)*scale,2,0,Math.PI*2);ctx.fill();}
  for(const b of world.buildings){if(b.type!=='hearth'&&!known(b))continue;const x=(b.x+42)*scale,y=(b.z+42)*scale;ctx.fillStyle=b.type==='hearth'?'#ffdda0':'#c4b096';ctx.beginPath();ctx.moveTo(x,y-4);ctx.lineTo(x+4,y);ctx.lineTo(x,y+4);ctx.lineTo(x-4,y);ctx.closePath();ctx.fill();}
  for(const p of world.players.filter(p=>p.online)){ctx.fillStyle=CHARACTERS.find(c=>c.id===p.character)?.color||'#f4e3b2';ctx.strokeStyle='#27222e';ctx.lineWidth=2;ctx.beginPath();ctx.arc((p.x+42)*scale,(p.z+42)*scale,p.id===localId?4.8:3.5,0,Math.PI*2);ctx.fill();ctx.stroke();}
  if(full){ctx.font='13px monospace';ctx.fillStyle='#e0caaa';ctx.textAlign='center';ctx.fillText('N',size/2,20);ctx.font='12px Georgia';ctx.fillText('HEARTFIRE',size/2,size/2+23);}
}
function ui(){
  if($('room-panel').hidden===false){$('roster').innerHTML=world.players.filter(p=>p.online).map(p=>`<div class="roster-row">${portrait(p.character)}<span>${escape(p.name)}</span><small>${p.id==='host'?'HOST':'READY'}</small></div>`).join('')+Array.from({length:Math.max(0,4-world.players.filter(p=>p.online).length)},()=>'<div class="roster-row"><span class="party-dot" style="opacity:.3"></span><span class="muted small">Waiting for a wanderer…</span></div>').join('');}
  const p=me();if(!$('game').hidden&&p){
    for(const[key,v]of [['hp',p.hp],['hunger',p.hunger],['courage',p.courage]]){$(key+'-value').textContent=Math.ceil(v);$(key+'-bar').style.width=clamp(v,0,100)+'%';}
    $('stamina-bar').style.width=p.stamina+'%';$('day-number').textContent=`DAY ${String(dayAt(world.time)).padStart(2,'0')}`;$('day-progress').style.left=(world.time%RULES.cycle)/RULES.cycle*100+'%';const seconds=Math.ceil(phaseRemaining(world.time));$('phase-time').textContent=`${phaseAt(world.time)==='day'?'DAYLIGHT':phaseAt(world.time).toUpperCase()} · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    $('biome-name').textContent=({meadow:'PUMPKIN MEADOW',woods:'CROOKED WOODS',graveyard:'OLD GRAVEYARD'})[biome(p.x,p.z)];$('toggle-lantern').classList.toggle('active',p.lantern);$('dodge').disabled=p.dashCooldown>0||p.stamina<28||!!p.down||p.ghost;
    const t=world.target(p,selected),e=t?.entity;$('target-name').textContent=e?(t.kind==='node'?NODES[e.type].name:t.kind==='building'?STRUCTURES[e.type].name:t.kind==='revive'?e.name:label(e.type)).toUpperCase():'THE WOODS ARE WAITING';
    $('target-detail').textContent=t?.kind==='node'?`${Math.max(0,e.hits)} effort left · ${NODES[e.type].tool?(p.equipment[NODES[e.type].tool]>0?label(NODES[e.type].tool):NODES[e.type].required?'Requires a flint pick':'Faster with '+label(NODES[e.type].tool)):'Gather by hand'}`:t?.kind==='building'?`${Math.ceil(e.hp)} / ${e.maxHp} condition${e.fuel?` · ${Math.ceil(e.fuel)} fuel`:''}`:t?.kind==='revive'?'Hold Gather to help them up':t?.kind==='drop'?`${e.count} supplies`:'Tap to explore · hold to gather';
    $('action-label').textContent=p.down||p.ghost?'REVIVE':t?.kind==='revive'?'HELP':t?.kind==='building'?['chest','bench','pot','hearth','fire'].includes(e.type)?'OPEN':e.type==='farm'?(e.planted?'HARVEST':'PLANT'):'USE':t?.label.toUpperCase()||'GATHER';$('action-symbol').textContent=t?.kind==='node'&&NODES[e.type].tool?'⚒':t?.kind==='revive'?'♥':'✦';
    $('party').innerHTML=world.players.filter(q=>q.id!==localId).map(q=>`<div class="party-row"><span class="party-dot" style="background:${CHARACTERS.find(c=>c.id===q.character)?.color}"></span><b>${escape(q.name)}</b><span>${!q.online?'away':q.down?'needs help!':q.ghost?'returns at dawn':Math.ceil(q.hp)+' ♥'}</span></div>`).join('');
    if(p.noticeAt&&p.noticeAt!==lastNotice){toast(p.notice);lastNotice=p.noticeAt;}
    for(const ev of world.events)if(ev.id>lastEvent){lastEvent=ev.id;if(world.time-ev.at<2){if(['announce','phase','ping'].includes(ev.type))announce(ev.text);if(distance(p,ev)<20||ev.type==='phase')sound.play(ev.type);}}
    $('downed').hidden=!p.down&&!p.ghost;if(p.down||p.ghost){$('downed-text').textContent=p.charm?'Use your one last-chance charm, or let a teammate revive you.':p.down?`A friend can hold Gather beside you. ${Math.ceil(p.down)} seconds until your supplies drop.`:'Your supplies are on the ground. You return at dawn if the camp survives.';$('use-charm').hidden=!p.charm;}
    const boss=world.enemies.find(e=>e.type==='king');$('boss-bar').hidden=!boss;document.body.classList.toggle('boss',!!boss);if(boss)$('boss-bar').querySelector('em').style.width=boss.hp/boss.maxHp*100+'%';
    objective();drawMap($('minimap'));
    if(placement){if(!placement.anchored){placement.x=Math.round((p.x+p.dx*3)*2)/2;placement.z=Math.round((p.z+p.dz*3)*2)/2;}const why=world.canBuild(p,placement.key,placement.x,placement.z);placement.valid=!why;$('placement-hint').textContent=why||'Ready. Tap the ground to adjust.';$('confirm-build').disabled=!!why;}
    if(['victory','defeat'].includes(world.status)&&lastEnd!==world.status){lastEnd=world.status;resetInput();closeSheet();save();$('end-screen').hidden=false;const won=world.status==='victory';$('end-kicker').textContent=won?'THE CURSE IS BROKEN':'THE EXPEDITION ENDS';$('end-title').textContent=won?'Morning, at last.':'The last light.';$('end-text').textContent=won?'Five nights in the hollow. One fire kept alive. You made a home where nothing was meant to live.':world.buildings.some(b=>b.type==='hearth')?'The woods claimed every wanderer. A stronger camp and a friend’s helping hand can turn the next night.':'The Heartfire was destroyed. Walls, traps and a well-fed fire will help your next camp endure.';$('end-stats').innerHTML=`<span><b>${dayAt(world.time)}</b>DAYS</span><span><b>${world.kills}</b>FOES</span><span><b>${world.stats.built}</b>BUILT</span>`;$('endless').hidden=!won||mode==='guest';$('new-expedition').hidden=mode==='guest';}
  }
  if(sheet&&dirty){const scroll=$('sheet-content').scrollTop;renderSheet();$('sheet-content').scrollTop=scroll;}dirty=false;
}
function setupControls(){
  $('characters').innerHTML=CHARACTERS.map(c=>`<button class="character" data-character="${c.id}" aria-label="${c.name}, ${c.detail}" aria-pressed="${c.id===character}">${portrait(c.id)}<small>${c.name}</small></button>`).join('');
  $('characters').onclick=e=>{const b=e.target.closest('[data-character]');if(!b)return;character=b.dataset.character;for(const el of $('characters').children)el.setAttribute('aria-pressed',el===b);if(mode==='front')world.players[0].character=character;storeProfile();};
  $('host').onclick=hostCamp;$('join').onclick=joinCamp;$('solo').onclick=()=>solo();$('continue').onclick=()=>solo(true);$('launch').onclick=()=>{enterGame();network?.broadcast();};$('cancel-room').onclick=goHome;$('copy-room').onclick=copyInvite;$('front-guide').onclick=()=>openSheet('guide');
  $('front-sound').onclick=()=>{sound.enabled=!sound.enabled;$('front-sound').textContent=`SOUND ${sound.enabled?'ON':'OFF'}`;sound.unlock();storeProfile();};
  $('close-sheet').onclick=closeSheet;$('menu-button').onclick=()=>openSheet('menu');$('camp-button').onclick=()=>room?copyInvite():openSheet('menu');$('minimap-button').onclick=()=>openSheet('map');
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>sheet===b.dataset.panel?closeSheet():openSheet(b.dataset.panel));
  $('quick-eat').onclick=()=>send({type:'eat'});$('toggle-lantern').onclick=()=>send({type:'lantern'});$('ping').onclick=()=>send({type:'ping',text:'Here!'});$('dodge').onclick=()=>send({type:'dash'});$('use-charm').onclick=()=>send({type:'interact'});
  for(const id of ['interact','attack']){$(id).addEventListener('pointerdown',e=>{e.preventDefault();$(id).setPointerCapture(e.pointerId);if(id==='interact')interact();else{hold.attack=true;send({type:'attack'});}});for(const type of ['pointerup','pointercancel','lostpointercapture'])$(id).addEventListener(type,()=>{hold[id==='interact'?'act':'attack']=false;});}
  const joystick=$('joystick');joystick.addEventListener('pointerdown',e=>{e.preventDefault();pointer=e.pointerId;joystick.setPointerCapture(pointer);sound.unlock();moveStick(e);});joystick.addEventListener('pointermove',e=>{if(e.pointerId===pointer)moveStick(e);});for(const type of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(type,e=>{if(pointer===e.pointerId){pointer=null;stick={x:0,z:0};$('stick').style.transform='';}});
  function moveStick(e){const r=joystick.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,z=e.clientY-r.top-r.height/2,l=Math.hypot(x,z),scale=Math.min(1,42/Math.max(1,l));$('stick').style.transform=`translate(${x*scale}px,${z*scale}px)`;stick={x:clamp(x/42,-1,1),z:clamp(z/42,-1,1)};}
  $('world').addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});$('world').addEventListener('pointerup',e=>{
    if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>12||!['solo','host','guest'].includes(mode)||$('game').hidden||sheet)return;
    const point=renderer.worldPoint(e.clientX,e.clientY);if(!point)return;if(placement){placement.x=Math.round(point.x*2)/2;placement.z=Math.round(point.z*2)/2;placement.anchored=true;dirty=true;return;}
    const target=renderer.pick(e.clientX,e.clientY,world);selected=target?.id||null;if(world.enemies.includes(target)){send({type:'attack'});return;}send({type:'move',x:target?.x??point.x,z:target?.z??point.z,target:target?.id});
  });
  $('cancel-build').onclick=()=>{placement=null;$('placement').hidden=true;};$('confirm-build').onclick=()=>{if(!placement?.valid)return;send({type:'build',recipe:placement.key,x:placement.x,z:placement.z,rotation:placement.rotation});placement=null;$('placement').hidden=true;};
  $('sheet-tabs').onclick=e=>{const b=e.target.closest('[data-category]');if(b){category=b.dataset.category;dirty=true;renderSheet();}};
  $('sheet-content').onclick=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.recipe){const r=RECIPES[b.dataset.recipe];if(r.kind==='build')placeRecipe(b.dataset.recipe);else send({type:'craft',recipe:b.dataset.recipe});}
    if(b.dataset.use)send({type:'use',item:b.dataset.use});if(b.dataset.drop)send({type:'drop',item:b.dataset.drop});if(b.dataset.withdraw)send({type:'withdraw',target:campTarget,item:b.dataset.withdraw});
    const cmd=b.dataset.command;if(!cmd)return;
    if(cmd==='resume')closeSheet();if(cmd==='save')save(true);if(cmd==='home')void goHome();if(cmd==='invite')void copyInvite();if(cmd==='guide')openSheet('guide');
    if(cmd==='sound'){sound.enabled=!sound.enabled;sound.unlock();storeProfile();dirty=true;}
    if(cmd==='zoom-in')renderer.setZoom(renderer.zoom+.15);if(cmd==='zoom-out')renderer.setZoom(renderer.zoom-.15);
    if(cmd==='ping-home'){send({type:'ping',text:'Back to camp!'});closeSheet();}
    if(cmd==='fuel')send({type:'interact',target:campTarget});if(cmd==='upgrade')send({type:'upgrade'});if(cmd==='repair')send({type:'repair',target:campTarget});if(cmd==='deposit')send({type:'deposit',target:campTarget});
    if(cmd==='dismantle'){send({type:'dismantle',target:campTarget});closeSheet();}
    if(cmd==='cooking'){openSheet('craft');category='cook';dirty=true;renderSheet();}if(cmd==='crafting')openSheet('craft');if(cmd==='building')openSheet('build');
  };
  $('new-expedition').onclick=()=>{if(mode==='host'){const people=world.players.filter(p=>p.online);world=new World();for(const p of people)world.addPlayer(p.id,p.name,p.character);world.start();lastEnd='';$('end-screen').hidden=true;network.broadcast();save();}else solo();};$('end-home').onclick=goHome;$('endless').onclick=()=>{world.status='playing';world.endless=true;world.bossSpawned=true;lastEnd='';$('end-screen').hidden=true;save();network?.broadcast();};
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName)||$('game').hidden)return;const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key))e.preventDefault();keys.add(key);if(e.repeat)return;
    if(key==='escape'){if(placement){placement=null;$('placement').hidden=true;}else if(sheet)closeSheet();else openSheet('menu');return;}if(sheet)return;
    if(key==='e')interact();if(key===' ')send({type:'attack'});if(key==='shift')send({type:'dash'});if(key==='q')send({type:'eat'});if(key==='f')send({type:'lantern'});if(key==='g')send({type:'ping',text:'Here!'});const panels={i:'pack',c:'craft',b:'build',m:'map'};if(panels[key])openSheet(panels[key]);
  });window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key.toLowerCase()==='e')hold.act=false;});
  window.addEventListener('blur',resetInput);document.addEventListener('visibilitychange',()=>{resetInput();hiddenPause=document.hidden;if(mode==='host'){network?.pause(hiddenPause);if(hiddenPause)save();}if(mode==='solo'&&hiddenPause)save();});window.addEventListener('pagehide',()=>{save();void network?.stop();});
  $('room-input').addEventListener('keydown',e=>{if(e.key==='Enter')joinCamp();});$('player-name').addEventListener('change',storeProfile);
}
function frame(now){
  const dt=Math.min(.08,(now-lastTime)/1000||.016);lastTime=now;uiTime+=dt;networkTime+=dt;saveTime+=dt;pingTime+=dt;
  const playing=['solo','host','guest'].includes(mode)&&!$('game').hidden&&!paused&&!remotePaused&&!hiddenPause;
  const input={x:stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z:stick.z+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0),act:!sheet&&(hold.act||keys.has('e')),attack:!sheet&&(hold.attack||keys.has(' ')),target:selected};if(sheet||!playing){input.x=input.z=0;input.act=input.attack=false;}
  if(mode==='host'||mode==='solo'){world.input(localId,input);if(playing){acc+=dt;let steps=0;while(acc>=RULES.tick&&steps++<4){world.tick();acc-=RULES.tick;}}else acc=0;}
  if(networkTime>.075){networkTime=0;if(mode==='guest')network?.input(input);if(mode==='host')network?.broadcast();}
  if(saveTime>10){saveTime=0;save();}if(pingTime>3){pingTime=0;network?.ping();}
  if(uiTime>.18){uiTime=0;dirty=true;ui();}
  const target=!$('game').hidden?currentTarget():null;renderer.render(world,localId,dt,{target,placement,demo:$('game').hidden});requestAnimationFrame(frame);
}
async function init(){
  theme=await loadTheme();renderer=new Renderer($('world'),theme);await renderer.preload();sound=new Sound(theme);const prefs=profile();character=CHARACTERS.some(c=>c.id===prefs.character)?prefs.character:'ember';$('player-name').value=String(prefs.name||'Wanderer').slice(0,18);sound.enabled=prefs.sound!==false;$('front-sound').textContent=`SOUND ${sound.enabled?'ON':'OFF'}`;
  demoWorld();setupControls();syncSaveOption();const params=new URLSearchParams(location.search),code=params.get('camp');if(code){$('room-input').value=code.toUpperCase().slice(0,5);showStatus('A place by the fire is waiting. Choose a name and join.');}
  $('loading').hidden=true;$('front').hidden=false;requestAnimationFrame(frame);
  if(params.has('dev'))window.__HOLLOWSTEAD__={get world(){return world;},get mode(){return mode;},renderer,send,solo,openSheet,save,get placement(){return placement;},setTime(t){world.time=t;},get network(){return network;}};
}
init().catch(error=>{$('load-status').textContent=`The woods could not be loaded. ${error.message} Try reloading in a browser with WebGL enabled.`;$('loading').querySelector('p').textContent='The lantern went out.';console.error(error);});
