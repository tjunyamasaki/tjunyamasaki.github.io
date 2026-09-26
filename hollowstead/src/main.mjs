import {World,clamp,distance,biome,EXPLORE_CELL,EXPLORE_SIZE} from './engine.mjs?v=harvest-16';
import {RARITY_COLORS,REGIONS,isCache,maxHealth,rarityOf,regionAt,xpToNext} from './progression.mjs?v=harvest-16';
import {RULES,EQUIPMENT,NODES,STRUCTURES,RECIPES,CHARACTERS,label,phaseAt,dayAt,phaseRemaining} from './content.mjs?v=harvest-16';
import {Renderer,loadTheme} from './renderer.mjs?v=harvest-16';
import {CanvasRenderer} from './canvas-renderer.mjs?v=harvest-16';
import {createNetwork} from './network.mjs?v=harvest-16';
import {Sound} from './audio.mjs?v=harvest-16';
import {SAVE_KEYS,planContinue} from './serialization.mjs?v=harvest-16';
import {EQUIPMENT_SLOTS,itemSpriteKey,equipmentSlotFor,containerId} from './inventory.mjs?v=harvest-16';
import {createActionSession,createActionClient} from './transactions.mjs?v=harvest-16';
import {CHEST_RENEW_SECONDS,CHEST_SLOT_COUNT,DISMANTLE_HOLD_SECONDS} from './contracts.mjs?v=harvest-16';
import {
  allowsCombat,allowsMovement,clusterFor,effectLine,escapeStep,isHarvestAction,keyboardAction,
  keyboardPrimary,resolveMode,showsLantern,usableLantern,
} from './ui/actions.mjs?v=harvest-16';
import {catalogMarkup,catalogModel,inCategory} from './ui/catalog.mjs?v=harvest-16';
import {adjustQuantity,createInventoryPanel,itemActionClearsSelection,operationsFor,slotLabel,stackMaxDurability} from './ui/inventory.mjs?v=harvest-16';
import {loadMagicModules} from './magic/load.mjs?v=harvest-16';
import {installMagicSprites} from './magic/registry.mjs?v=harvest-16';
import {clampShowcaseMobCount, clearShowcaseWorld, grantShowcaseItem, placeShowcase, removeShowcaseTarget, showcaseMarkup, showcasePlaceReason, showcaseSpawnName} from './showcase.mjs?v=harvest-16';

const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROFILE=SAVE_KEYS.profile;
const CONTEXT_BUTTONS=['context-0','context-1','context-2','context-3'];
let identity=crypto.randomUUID();
try{identity=sessionStorage.getItem('hollowstead.identity')||identity;sessionStorage.setItem('hollowstead.identity',identity);}catch{}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The connection service did not respond. Please try again.')),18000);})]);}finally{clearTimeout(timer);}}

let theme,renderer,sound,world,network=null,mode='front',localId='host',character='ember',room='',paused=false,remotePaused=false,hiddenPause=false,linkLost=false;
let sheet=null,category='all',selected=null,placement=null,maintenance=false,maintenanceTarget=null;
let showcaseCategory='materials',showcaseTool='',showcaseListOpen=false,showcaseMobCount=1,showcaseMarkupCache='',showcaseHistoryClosing=false,fullscreenNote='';
let lastNotice=0,lastEvent=0,lastEnd='',lastTime=0,acc=0,uiTime=0,networkTime=0,saveTime=0,pingTime=0,lastMode='normal';
let sheetMarkup='',tabsMarkup='',toastTimer,announceTimer,lastToast={text:'',at:0},dirty=true;
let stick={x:0,z:0},hold={act:false,attack:false},keys=new Set(),pointer=null,pointerStart=null,busy=false;
let connectionText='',saveText='';
let localActions=null,localActionWorld=null,localClient=null;
let chestSession=null,chestOpening=false,chestToken=0,chestRenewAt=0,chestRenewing=false;
let catalog={source:'field',stationId:null,stationType:null,tab:'build'};
let catalogPending='';
let inventoryPanel=null,selection=null,qtyMode='all',chosenQty=1,dropDraft=null,actionPending=false;
let liveActions=[],holdKind=null,holdTarget=null,holdSource=null,dismantleStarted=0,ringFrame=0,captured=null;

function profile(){try{return JSON.parse(localStorage.getItem(PROFILE)||'{}');}catch{return {};}}
function readStored(key){try{const raw=localStorage.getItem(key);if(!raw)return null;const data=JSON.parse(raw);return data&&typeof data==='object'?data:{invalid:true};}catch{return {invalid:true};}}
function continuePlan(){return planContinue({v2:readStored(SAVE_KEYS.expeditionV2),v1:readStored(SAVE_KEYS.expeditionV1)});}
function storeProfile(){try{localStorage.setItem(PROFILE,JSON.stringify({name:$('player-name').value,character,sound:sound.enabled}));}catch{}}
function showStatus(text,error=false){const el=$('front-status');if(el){el.textContent=text;el.style.color=error?'var(--red)':'var(--orange)';}connectionText=text;dirty=true;}
function toast(text){const now=performance.now();if(text&&text===lastToast.text&&now-lastToast.at<2500)return;lastToast={text,at:now};$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
function announce(text){$('announcement').textContent=text;$('announcement').classList.add('visible');clearTimeout(announceTimer);announceTimer=setTimeout(()=>$('announcement').classList.remove('visible'),4100);}
function icon(key){const spriteKey=itemSpriteKey(key)||(STRUCTURES[key]?key:null),src=spriteKey&&(theme.sprites[spriteKey]?.icon||theme.sprites[spriteKey]?.src);if(!src)return '';const rarity=STRUCTURES[key]&&!itemSpriteKey(key)?'common':rarityOf(key);return `<img class="item-icon rarity-${rarity}" src="${escapeHtml(src)}" alt="" draggable="false">`;}
function portrait(key){return `<span class="portrait" style="background-image:url('${theme.sprites[key]?.src||theme.sprites.ember.src}');background-size:${(theme.sprites[key]?.columns||1)*100}% ${(theme.sprites[key]?.rows||1)*100}%"></span>`;}
function me(){return world?.player(localId);}
function commandError(result){return result?.message||({chestInUse:'Chest in use',sessionExpired:'Chest access ended',wrongSession:'Chest access changed',outOfRange:'Move closer',inventoryFull:'No room for that',staleRevision:'Items changed. Try again.',notOwner:'That item is not available',unknownItem:'That item is no longer here',incompatibleSocket:'That item does not fit this equipment slot',pending:'Wait for the current action',timeout:'Action not confirmed. Check the current inventory before trying again.',disconnected:'Connection closed',worldChanged:'The expedition changed',rateLimited:'Please wait a moment',notReady:'Waiting for the camp',paused:'The host has paused the expedition',stationRequired:'That needs the right station',missingFuel:'The fire needs wood',invalidQuantity:'Choose a smaller amount'})[result?.code]||'That action is not available';}
function send(cmd,{quiet=false}={}){
  let promise;
  if(mode==='guest')promise=network?.action(cmd);
  else if(mode==='solo'||mode==='host'){
    if(localActionWorld!==world){
      localClient?.close('worldChanged');localActionWorld=world;
      localActions=createActionSession({getWorld:()=>world,actorId:localId});
      localClient=createActionClient({send:value=>{const reply=localActions.execute(value);localClient.acceptResult(reply);localClient.acceptFrame({worldId:world.networkId,transactionRevision:world.transactionRevision});}});
      localClient.start(localActions.sessionId);localClient.acceptFrame({worldId:world.networkId,transactionRevision:world.transactionRevision});
    }
    promise=localClient.request(cmd);
  }
  dirty=true;sound?.unlock();
  return (promise||Promise.resolve({ok:false,code:'notReady'})).then(result=>{dirty=true;if(!result?.ok&&!quiet&&!['cooldown','unavailable'].includes(result?.code))toast(commandError(result));return result;});
}
function releaseChestUI(){
  chestToken++;const old=chestSession;chestSession=null;chestRenewing=false;chestOpening=false;
  if(old)void send({type:'chestClose',chestId:old.chestId,sessionId:old.sessionId},{quiet:true});
}
function chestBuilding(){return chestSession?world?.buildings.find(b=>b.id===chestSession.chestId&&b.type==='chest'&&b.hp>0)||null:null;}
async function openChest(chestId){
  if(chestOpening||!chestId)return;
  if(chestSession?.chestId===chestId&&sheet==='chest')return;
  cancelPlacement();cancelMaintenance();endContextHold();
  if(sheet==='menu'&&mode==='solo')paused=false;
  if(chestSession)releaseChestUI();
  sheet='chest';$('sheet').hidden=false;$('sheet').dataset.sheet='chest';chestOpening=true;clearSelection();
  const token=chestToken;dirty=true;renderSheet();resetInput();
  void send({type:'setHarvestTarget',nodeId:'',mode:'cancel'},{quiet:true});
  const result=await send({type:'chestOpen',chestId},{quiet:true});
  chestOpening=false;
  if(token!==chestToken||sheet!=='chest'){if(result?.ok)void send({type:'chestClose',chestId,sessionId:result.sessionId},{quiet:true});return;}
  if(!result?.ok){toast(commandError(result));sheet='inventory';$('sheet').dataset.sheet='inventory';dirty=true;renderSheet();return;}
  chestSession={chestId,sessionId:result.sessionId};chestRenewAt=world.time+CHEST_RENEW_SECONDS;refresh();
}
function maintainChest(){
  if(!chestSession||sheet!=='chest')return;
  const lock=world.chestSessions.get(chestSession.chestId),p=me(),chest=chestBuilding();
  if(!chest||!p||distance(p,chest)>=RULES.reach||p.down||p.ghost||!lock||lock.sessionId!==chestSession.sessionId||lock.ownerId!==localId){
    const quiet=!!(p?.down||p?.ghost);closeSheet();if(!quiet)toast('Chest access ended');return;
  }
  if(world.time>=chestRenewAt&&!chestRenewing){
    chestRenewing=true;chestRenewAt=world.time+CHEST_RENEW_SECONDS;const current=chestSession;
    void send({type:'chestRenew',...current},{quiet:true}).then(result=>{
      chestRenewing=false;if(chestSession!==current||result?.ok)return;
      if(result.code==='paused'||result.code==='pending'||result.code==='rateLimited'){chestRenewAt=world.time;return;}
      closeSheet();toast(commandError(result));
    });
  }
}
function save(manual=false){if(world?.showcase){if(manual)toast('Showcase stays on this screen');return;}if(!['solo','host'].includes(mode)||!world||world.status==='lobby')return;try{localStorage.setItem(SAVE_KEYS.expeditionV2,JSON.stringify({world:world.snapshot({purpose:'save'}),savedAt:Date.now()}));saveText='Saved on this browser';if(manual)toast('Expedition saved');dirty=true;}catch{toast('Saving is unavailable in this browser. Keep this tab open.');}}
function syncSaveOption(){const plan=continuePlan(),visible=!!(plan.ok||plan.recoverable);$('continue').hidden=!visible;$('saved-option').hidden=!visible;}
function resetInput(){keys.clear();stick={x:0,z:0};hold={act:false,attack:false};pointer=null;const stickEl=$('stick');if(stickEl)stickEl.style.transform='';const player=world?.player(localId);if(player)world.input(localId,{x:0,z:0,act:false,attack:false});network?.input({x:0,z:0,act:false,attack:false});}
function endContextHold(){
  const kind=holdKind,target=holdTarget;holdKind=null;holdTarget=null;holdSource=null;dismantleStarted=0;hold.act=false;
  if(kind==='dismantle'&&target)void send({type:'dismantle',target,hold:false},{quiet:true});
}
function beginContextHold(action,source){
  if(!action?.enabled)return;
  endContextHold();
  holdKind=action.id;holdTarget=action.targetId||'';holdSource=source;selected=action.targetId||selected;
  if(isHarvestAction(action.id)||action.id==='pickup'||action.id==='revive'){
    hold.act=true;
    if(isHarvestAction(action.id))void send({type:'setHarvestTarget',nodeId:action.targetId,mode:'auto'},{quiet:true});
  }
  if(action.id==='dismantle'){
    dismantleStarted=performance.now();
    void send({type:'dismantle',target:action.targetId,hold:true},{quiet:true});
    const step=()=>{
      const button=[...document.querySelectorAll('#action-cluster .confirming')].find(el=>!el.classList.contains('is-off'));
      if(holdKind!=='dismantle'||!dismantleStarted){button?.style.setProperty('--hold','0');return;}
      button?.style.setProperty('--hold',String(Math.min(1,(performance.now()-dismantleStarted)/(DISMANTLE_HOLD_SECONDS*1000))));
      ringFrame=requestAnimationFrame(step);
    };
    cancelAnimationFrame(ringFrame);ringFrame=requestAnimationFrame(step);
  }
}
function currentMode(){
  const p=me();
  return resolveMode({
    ended:['victory','defeat'].includes(world?.status),
    disconnected:linkLost,
    paused:paused&&mode==='solo',
    down:!!p?.down,ghost:!!p?.ghost,panel:sheet,placement:!!placement,maintenance,
  });
}
function cancelPlacement(){placement=null;}
function cancelMaintenance(){maintenance=false;maintenanceTarget=null;endContextHold();}
function clearSelection(){selection=null;dropDraft=null;qtyMode='all';chosenQty=1;}
function refresh(){dirty=true;ui();}
function discardPanel(){inventoryPanel?.destroy();inventoryPanel=null;}
function prepareWorld(resume=false){
  if(resume){const plan=continuePlan();if(!plan.ok)throw new Error(plan.message);const resumed=World.fromSave(plan.save);if(plan.write==='v2')localStorage.setItem(SAVE_KEYS.expeditionV2,JSON.stringify(plan.save));world=resumed;world.resumeExpedition();const p=world.player('host');if(!p)throw new Error('This saved expedition is missing its host.');p.online=true;if(world.status!=='playing')world.status='playing';}
  else{world=new World();world.addPlayer('host',$('player-name').value,character);}
  localId='host';lastEvent=world.eventId;lastNotice=0;lastEnd='';selected=null;cancelPlacement();cancelMaintenance();clearSelection();resetInput();paused=false;remotePaused=false;linkLost=false;saveTime=0;dirty=true;
}
function enterGame(){
  $('front').hidden=true;$('game').hidden=false;$('end-screen').hidden=true;closeSheet();$('room-panel').hidden=true;document.body.classList.add('playing');
  linkLost=false;cancelPlacement();cancelMaintenance();
  if(world?.showcase){connectionText='Showcase';saveText='Not saved';showStatus('');}
  else if(mode==='solo'){connectionText='Expedition saved locally';saveText='Saved on this browser';showStatus('Expedition saved locally');}
  else{connectionText=connectionText||'Connected to camp';saveText=mode==='guest'?'Kept by the host':'Saved on this browser';}
  if(mode!=='guest'){world.start();save();}lastEnd='';showShowcase(!!world?.showcase);announce(world?.showcase?'An empty clearing. Spawn whatever you want to see.':dayAt(world.time)===1?'Welcome to the Hollow Harvest.':'The fire remembers you.');
}
async function goHome(){
  save();endContextHold();resetInput();inventoryPanel?.cancelDrag();await network?.stop();network=null;mode='front';room='';paused=false;remotePaused=false;linkLost=false;showcaseTool='';cancelPlacement();cancelMaintenance();clearSelection();closeSheet();showShowcase(false);$('game').hidden=true;$('end-screen').hidden=true;$('front').hidden=false;$('room-panel').hidden=true;$('home-panel').hidden=false;$('connection-banner').hidden=true;document.body.classList.remove('playing','boss');setBusy(false);showStatus('');syncSaveOption();demoWorld();
}
function demoWorld(){world=new World(20261031);world.addPlayer('host','Wanderer',character);world.players[0].x=2;world.players[0].z=2;world.buildings.push(world.structure('chest',-2.5,1),world.structure('bench',3,-1),world.structure('lantern',-4,-1));world.time=RULES.day+13;renderer.focus.set(0,0,0);lastEvent=0;renderer.lastEvent=0;}
function setBusy(value){busy=value;for(const id of ['host','join','solo','continue','showcase']){const el=$(id);if(el)el.disabled=value;}}
function makeNetwork(){return createNetwork({identity,getWorld:()=>world,onFrame:data=>{const previous=world.status;world=World.restore(data);dirty=true;if(mode==='guest'&&world.status==='playing'&&previous!=='playing'){if(previous==='lobby')enterGame();else{$('end-screen').hidden=true;lastEnd='';}}},onReady:id=>{localId=id;setBusy(false);showStatus('Connected. Waiting for the host.');$('home-panel').hidden=true;$('room-panel').hidden=false;$('launch').hidden=true;$('room-code').textContent=room;$('room-note').textContent='The host will start when everyone is ready.';},onStatus:showStatus,onPause:value=>{remotePaused=value;$('connection-banner').hidden=!value;$('connection-banner').textContent='Host is away • the expedition is paused';},onLeave:text=>{endContextHold();resetInput();cancelPlacement();cancelMaintenance();linkLost=true;paused=true;setBusy(false);if($('game').hidden){$('room-panel').hidden=true;$('home-panel').hidden=false;showStatus(text,true);}else{$('connection-banner').textContent=text;$('connection-banner').hidden=false;showStatus(text,true);openSheet('menu');}}});}
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
function showShowcase(open){
  const panel=$('showcase-panel');if(!panel)return;
  if(!open){
    panel.hidden=true;
    if(showcaseListOpen){
      showcaseListOpen=false;
      if(history.state?.hollowsteadShowcase){showcaseHistoryClosing=true;try{history.back();}catch{showcaseHistoryClosing=false;}}
    }
    return;
  }
  panel.hidden=false;paintShowcase();
}
function paintShowcase(){
  const panel=$('showcase-panel');if(!panel||panel.hidden||!world?.showcase)return;
  const html=showcaseMarkup({active:showcaseCategory,tool:showcaseTool,open:showcaseListOpen,icon,mobCount:showcaseMobCount});
  if(html===showcaseMarkupCache)return;
  showcaseMarkupCache=html;panel.innerHTML=html;
}
function openShowcaseList(){
  if(showcaseListOpen)return;
  showcaseListOpen=true;showcaseMarkupCache='';paintShowcase();
  try{history.pushState({hollowsteadShowcase:1},'');}catch{}
}
function closeShowcaseList(){
  if(!showcaseListOpen)return;
  showcaseListOpen=false;showcaseMarkupCache='';paintShowcase();
  if(history.state?.hollowsteadShowcase){showcaseHistoryClosing=true;try{history.back();}catch{showcaseHistoryClosing=false;}}
}
function onShowcasePop(){
  if(showcaseHistoryClosing){showcaseHistoryClosing=false;return;}
  if(!showcaseListOpen)return;
  showcaseListOpen=false;showcaseMarkupCache='';paintShowcase();
}
function startShowcase(){
  sound.unlock();storeProfile();
  world=new World((Math.random()*0xffffffff)>>>0,{showcase:true});
  world.addPlayer('host',$('player-name').value,character);
  mode='solo';room='';showcaseCategory='materials';showcaseTool='';showcaseListOpen=false;showcaseMobCount=1;showcaseMarkupCache='';
  cancelPlacement();cancelMaintenance();clearSelection();
  enterGame();
}
function armShowcase(kind,id){
  const p=me();if(!p)return;
  showcaseTool='';
  if(kind==='item'){
    cancelPlacement();
    const result=grantShowcaseItem(world,p,id);
    if(!result.ok){toast('That cannot be carried');showcaseMarkupCache='';paintShowcase();return;}
    toast(result.dropped?`${showcaseSpawnName(kind,id)} dropped at your feet`:`${showcaseSpawnName(kind,id)} added to the pack`);
    dirty=true;closeShowcaseList();return;
  }
  cancelMaintenance();endContextHold();
  placement={key:id,kind,showcase:true,count:kind==='mob'?showcaseMobCount:1,x:Math.round((p.x+p.dx*3)*2)/2,z:Math.round((p.z+p.dz*3)*2)/2,rotation:0,valid:false,anchored:false,pending:false,reason:'',stationId:null};
  selected=null;closeShowcaseList();refresh();
}
function commitShowcase(x,z){
  if(!placement?.showcase)return;
  const p=me();if(!p)return;
  const point={x,z};
  const reason=showcasePlaceReason(world,p,placement.kind,placement.key,point.x,point.z);
  placement.x=point.x;placement.z=point.z;placement.anchored=true;placement.valid=!reason;placement.reason=reason||'';
  if(reason){toast(reason);refresh();return;}
  const result=placeShowcase(world,p,placement.kind,placement.key,point.x,point.z,placement.count);
  if(!result.ok){toast(result.reason||'Cannot place that here');return;}
  const name=showcaseSpawnName(placement.kind,placement.key);
  toast(result.count>1?`${result.count} ${name} placed`:`${name} placed`);
  cancelPlacement();
  refresh();
}
async function copyInvite(){const url=new URL(location.href);url.search='';url.searchParams.set('camp',room);try{await navigator.clipboard.writeText(url.href);mode==='front'||$('game').hidden?showStatus('Invite link copied. Send it to your friends.'):toast('Invite link copied');}catch{const text=`Camp code: ${room}`;$('game').hidden?showStatus(text):toast(text);}}
function currentTarget(){const p=me();if(!p)return null;return world.target(p,selected)?.entity?world.target(p,selected):null;}
function contextFacts(p){
  const target=world.target(p,selected);if(!target)return null;
  const entity=target.entity;
  const base={kind:target.kind,id:entity.id,type:entity.type,wood:world.available(p,'wood'),stone:world.available(p,'stone'),seeds:world.available(p,'seed')};
  if(target.kind==='building'){
    const lock=world.chestSessions.get(entity.id);
    return {...base,hp:entity.hp,maxHp:entity.maxHp,fuel:entity.fuel||0,level:entity.level||1,open:!!entity.open,charges:entity.charges??0,planted:!!entity.planted,growth:entity.growth||0,resting:!!p.rest,phase:phaseAt(world.time),hunger:p.hunger,canAwaken:entity.type==='hearth'&&entity.level<3&&world.canPay(p,world.upgradeCost()),busy:!!(lock&&lock.ownerId!==localId)};
  }
  if(target.kind==='node'){const node=NODES[entity.type];return {...base,required:!!node?.required,toolReady:!(node?.tool)||world.hasTool(p,node.tool),toolLabel:node?.tool?label(node.tool).toLowerCase():''};}
  return base;
}
function openSheet(name){
  cancelPlacement();cancelMaintenance();endContextHold();hold.attack=false;
  if(name!=='chest'&&(chestSession||chestOpening))releaseChestUI();
  if(sheet==='menu'&&mode==='solo')paused=false;
  resetInput();void send({type:'setHarvestTarget',nodeId:'',mode:'cancel'},{quiet:true});
  sheet=name;$('sheet').hidden=false;$('sheet').dataset.sheet=name;
  if(name==='menu'&&mode==='solo')paused=true;
  dirty=true;renderSheet();
}
function closeSheet(){
  inventoryPanel?.cancelDrag();
  if(chestSession||chestOpening)releaseChestUI();
  if(sheet==='menu'&&mode==='solo')paused=false;
  sheet=null;$('sheet').hidden=true;clearSelection();dirty=true;
}
function openFieldBuild(){catalog={source:'field',stationId:null,stationType:null,tab:'build'};category='all';openSheet('catalog');}
function openStationCatalog(panel){catalog={source:'station',stationId:panel.stationId,stationType:panel.stationType,tab:panel.tab};category='all';openSheet('catalog');}
function toggleInventory(){if(sheet==='inventory'||sheet==='chest')closeSheet();else openSheet('inventory');}
function toggleFieldBuild(){if(sheet==='catalog'&&catalog.source==='field')closeSheet();else openFieldBuild();}
async function runAction(action){
  if(!action)return;
  if(!action.enabled){if(action.disabledReason)toast(action.disabledReason);return;}
  if(action.id==='cancel'){if(placement)cancelPlacement();else cancelMaintenance();dirty=true;return;}
  if(action.id==='place'){await confirmPlace();return;}
  if(action.id==='open'){await openChest(action.targetId);return;}
  if(action.panel){const result=await send(action.command);if(result?.ok)openStationCatalog(action.panel);return;}
  if(action.command)await send(action.command);
}
async function confirmPlace(){
  if(placement?.showcase){commitShowcase(placement.x,placement.z);return;}
  if(!placement||placement.pending)return;
  if(!placement.valid){toast(placement.reason||'Cannot place that here');return;}
  const pending=placement;pending.pending=true;refresh();
  const result=await send({type:'placeBuilding',recipeId:pending.key,x:pending.x,z:pending.z,rotation:pending.rotation||0,stationId:pending.stationId??null});
  if(placement!==pending)return;pending.pending=false;if(result?.ok)placement=null;refresh();
}
function placeRecipe(key){
  const p=me();if(!p)return;
  if(chestSession||chestOpening)releaseChestUI();
  if(sheet==='menu'&&mode==='solo')paused=false;
  sheet=null;$('sheet').hidden=true;clearSelection();cancelMaintenance();endContextHold();
  placement={key,x:Math.round((p.x+p.dx*3)*2)/2,z:Math.round((p.z+p.dz*3)*2)/2,rotation:0,valid:false,anchored:false,pending:false,reason:'',stationId:catalog.source==='station'?catalog.stationId:null};
  selected=null;refresh();
}
function stackByKey(p,key){
  if(!p||!key)return null;
  const split=key.indexOf(':'),where=key.slice(0,split),id=key.slice(split+1);
  if(where==='pack'){const slot=Number(id);return {where:'pack',slot,key,stack:p.inventory.slots[slot]||null};}
  if(where==='socket')return {where:'equipment',socket:id,slot:EQUIPMENT_SLOTS.indexOf(id),key,stack:p.equipment[id]||null};
  if(where==='recovery'){const slot=Number(id);return {where:'recovery',slot,key,stack:p.recovery?.slots?.[slot]||null};}
  if(where==='chest'){const slot=Number(id),chest=chestBuilding();return {where:'chest',slot,key,stack:chest?.store.slots[slot]||null};}
  if(where==='overflow'){const slot=Number(id),chest=chestBuilding();return {where:'overflow',slot,key,stack:chest?.overflow?.slots?.[slot]||null};}
  return null;
}
function locateUid(p,uid){
  if(!p||!uid)return null;
  const pack=p.inventory.slots.findIndex(slot=>slot?.uid===uid);
  if(pack>=0)return {where:'pack',slot:pack,key:`pack:${pack}`,stack:p.inventory.slots[pack]};
  for(const socket of EQUIPMENT_SLOTS)if(p.equipment[socket]?.uid===uid)return {where:'equipment',socket,slot:EQUIPMENT_SLOTS.indexOf(socket),key:`socket:${socket}`,stack:p.equipment[socket]};
  const chest=chestBuilding();
  if(chest){
    const index=chest.store.slots.findIndex(slot=>slot?.uid===uid);
    if(index>=0)return {where:'chest',slot:index,key:`chest:${index}`,stack:chest.store.slots[index]};
    const saved=chest.overflow?.slots?.findIndex(slot=>slot?.uid===uid)??-1;
    if(saved>=0)return {where:'overflow',slot:saved,key:`overflow:${saved}`,stack:chest.overflow.slots[saved]};
  }
  if(p.recovery){const index=p.recovery.slots.findIndex(slot=>slot?.uid===uid);if(index>=0)return {where:'recovery',slot:index,key:`recovery:${index}`,stack:p.recovery.slots[index]};}
  return null;
}
function chosenQuantity(stack){if(!stack)return 1;if(qtyMode==='all')return stack.quantity;return Math.min(stack.quantity,Math.max(1,chosenQty));}
function selectKey(key){dropDraft=null;const loc=stackByKey(me(),key);if(!loc?.stack)return;const same=selection?.uid===loc.stack.uid;selection={uid:loc.stack.uid,key:loc.key,where:loc.where};if(!same){qtyMode='all';chosenQty=loc.stack.quantity;}refresh();}
function containerInfo(p,loc){if(loc.where==='pack')return p.inventory;if(loc.where==='equipment')return {id:containerId('equipment',p.id),revision:p.equipmentRevision};if(loc.where==='recovery')return p.recovery;if(loc.where==='chest')return chestBuilding()?.store||null;if(loc.where==='overflow')return chestBuilding()?.overflow||null;return null;}
async function withPending(cmd){actionPending=true;refresh();const result=await send(cmd);actionPending=false;if(selection&&!locateUid(me(),selection.uid))clearSelection();refresh();return result;}
async function commitMove(from,to,quantity,{insert=false}={}){
  const p=me();if(!p||!from?.stack||!to||to.where==='recovery'||to.where==='overflow'||actionPending)return;
  const source=containerInfo(p,from),dest=containerInfo(p,to);if(!source||!dest)return;
  const chestSide=from.where==='chest'||to.where==='chest'||from.where==='overflow';
  const cmd={type:chestSide?'chestTransfer':'inventoryMove',sourceContainerId:source.id,sourceSlot:from.slot,destinationContainerId:dest.id,destinationSlot:insert?null:to.slot,uid:from.stack.uid,quantity,sourceRevision:source.revision,destinationRevision:dest.revision};
  if(chestSide){if(!chestSession)return;Object.assign(cmd,chestSession);}
  selection=null;dropDraft=null;
  await withPending(cmd);
}
async function onSlot(key,empty){
  if(actionPending)return;
  if(!selection){if(!empty)selectKey(key);return;}
  if(key===selection.key){clearSelection();refresh();return;}
  const from=locateUid(me(),selection.uid),to=stackByKey(me(),key);
  if(!from?.stack||!to)return;
  await commitMove(from,to,chosenQuantity(from.stack));
}
async function moveKeys(fromKey,toKey){
  const from=stackByKey(me(),fromKey),to=stackByKey(me(),toKey);
  if(!from?.stack||!to)return;
  const quantity=from.stack.uid===selection?.uid?chosenQuantity(from.stack):from.stack.quantity;
  await commitMove(from,to,quantity);
}
async function sortPack(){
  const p=me();if(!p||actionPending)return;
  await withPending({type:'packSort',inventoryRevision:p.inventory.revision});
}
async function organizeChest(op){
  const p=me(),chest=chestBuilding();if(!p||!chest||!chestSession||actionPending)return;
  if(op!=='store'&&op!=='sort')return;
  const type=op==='store'?'chestStoreAll':'chestSort';
  const cmd={type,chestId:chestSession.chestId,sessionId:chestSession.sessionId,destinationRevision:chest.store.revision};
  if(type==='chestStoreAll')cmd.inventoryRevision=p.inventory.revision;
  await withPending(cmd);
}
async function operate(op){
  const p=me();if(!p||actionPending)return;
  if(op==='cancel-drop'){dropDraft=null;refresh();return;}
  if(op==='confirm-drop'){
    const draft=dropDraft;if(!draft)return;
    dropDraft=null;selection=null;
    const cmd={type:'dropItem',uid:draft.uid,quantity:draft.quantity,inventoryRevision:p.inventory.revision};
    if(draft.where==='equipment')cmd.equipmentRevision=p.equipmentRevision;
    await withPending(cmd);return;
  }
  if(!selection)return;
  const loc=locateUid(p,selection.uid);if(!loc?.stack){clearSelection();dirty=true;return;}
  if(op==='drop'){
    const draft={uid:loc.stack.uid,quantity:chosenQuantity(loc.stack),where:loc.where,name:label(loc.stack.itemId)};
    clearSelection();dropDraft=draft;refresh();return;
  }
  const captured={uid:loc.stack.uid,socket:loc.socket,where:loc.where,quantity:chosenQuantity(loc.stack),itemId:loc.stack.itemId};
  if(itemActionClearsSelection(op)){selection=null;dropDraft=null;}
  if(op==='equip'){await withPending({type:'equipItem',uid:captured.uid,socket:equipmentSlotFor(captured.itemId),inventoryRevision:p.inventory.revision,equipmentRevision:p.equipmentRevision});return;}
  if(op==='unequip'){await withPending({type:'unequipItem',uid:captured.uid,socket:captured.socket,inventoryRevision:p.inventory.revision,equipmentRevision:p.equipmentRevision});return;}
  if(op==='eat'||op==='heal'){await withPending({type:'consumeItem',uid:captured.uid,inventoryRevision:p.inventory.revision});return;}
  if(op==='take'){await commitMove(loc,{where:'pack',slot:0,stack:null},captured.quantity,{insert:true});return;}
  if(op==='transfer'){
    const chest=chestBuilding();if(!chest||!chestSession)return;
    const dest=captured.where==='chest'||captured.where==='overflow'?{where:'pack',slot:0,stack:null}:{where:'chest',slot:0,stack:null};
    await commitMove(loc,dest,captured.quantity,{insert:true});
  }
}
function onQuantity(op){const loc=selection&&locateUid(me(),selection.uid);if(!loc?.stack)return;qtyMode=op==='inc'||op==='dec'?'set':op;chosenQty=adjustQuantity(loc.stack.quantity,chosenQuantity(loc.stack),op);refresh();}
function onShift(key){selectKey(key);if(!chestSession||!selection)return;qtyMode='all';const loc=locateUid(me(),selection.uid);if(loc)void operate('transfer');}
function activateSelection(){if(!selection||dropDraft)return;const loc=locateUid(me(),selection.uid);if(!loc?.stack)return;const ops=operationsFor({itemId:loc.stack.itemId,where:loc.where,chestOpen:!!chestSession});const preferred=['transfer','equip','eat','heal','take','unequip'].find(op=>ops.includes(op));if(preferred)void operate(preferred);}
function ensurePanel(){
  if(inventoryPanel?.root?.isConnected)return;
  discardPanel();
  inventoryPanel=createInventoryPanel($('sheet-content'),{onSlot:(key,empty)=>void onSlot(key,empty),onSelect:selectKey,onMove:(from,to)=>void moveKeys(from,to),onOperate:op=>void operate(op),onQuantity,onShift,onPackSort:()=>void sortPack(),onChestOrganize:op=>void organizeChest(op),onActivate:activateSelection,onDragChange(){endContextHold();hold.attack=false;stick={x:0,z:0};}});
  sheetMarkup='';
}
function makeCell(key,stack,kind,index,mark=''){
  const equipped=kind==='socket'&&!!stack;
  const name=stack?label(stack.itemId):mark;
  const maxDurability=stack?stackMaxDurability(stack.itemId):null;
  return {key,stack,mark,maxDurability,equipped,accept:kind!=='recovery',selected:!!(stack&&selection?.uid===stack.uid),iconHTML:stack?icon(stack.itemId):'',aria:slotLabel({empty:!stack,name,quantity:stack?.quantity||0,durability:stack?.durability??null,maxDurability,equipped,index,kind:kind==='socket'?'socket':kind})};
}
function inventoryView(p){
  const chest=chestBuilding();
  const sockets=EQUIPMENT_SLOTS.map(slot=>makeCell(`socket:${slot}`,p.equipment[slot], 'socket', 0, SOCKET_NAME[slot]));
  const slots=p.inventory.slots.map((stack,index)=>makeCell(`pack:${index}`,stack,'pack',index));
  const recovery=(p.recovery?.slots||[]).flatMap((stack,index)=>stack?[makeCell(`recovery:${index}`,stack,'recovery',index)]:[]);
  let chestView=null;
  if(sheet==='chest'){
    if(!chest)chestView={pending:true,slots:[],overflow:[],occupied:0,slotMax:CHEST_SLOT_COUNT};
    else{
      const slots=chest.store.slots.map((stack,index)=>makeCell(`chest:${index}`,stack,'chest',index));
      const overflow=(chest.overflow?.slots||[]).flatMap((stack,index)=>stack?[makeCell(`overflow:${index}`,stack,'overflow',index)]:[]);
      chestView={pending:chestOpening||actionPending,slots,overflow,occupied:chest.store.slots.filter(Boolean).length,slotMax:chest.store.slots.length};
    }
  }
  const loc=selection?locateUid(p,selection.uid):null;
  let detail=null;
  if(dropDraft)detail={name:dropDraft.name,meta:' ',chosen:dropDraft.quantity,maxQuantity:dropDraft.quantity,ops:[],dropConfirm:true,confirmText:`Drop ${dropDraft.quantity} ${dropDraft.name}?`};
  else if(loc?.stack){
    const where=loc.where;
    const ops=operationsFor({itemId:loc.stack.itemId,where,chestOpen:!!chestSession});
    const wear=stackMaxDurability(loc.stack.itemId)?`Condition ${Math.ceil(loc.stack.durability)} / ${stackMaxDurability(loc.stack.itemId)}`:'';
    detail={name:label(loc.stack.itemId),meta:[effectLine(loc.stack.itemId),wear].filter(Boolean).join(' · ')||' ',chosen:chosenQuantity(loc.stack),maxQuantity:loc.stack.quantity,ops,dropConfirm:false,confirmText:''};
  }
  const sprite=theme.sprites[p.character]||theme.sprites.ember;
  return {portraitHTML:`${portrait(p.character)}<small>${escapeHtml(p.name)}</small>`,occupied:p.inventory.slots.filter(Boolean).length,slotMax:p.inventory.slots.length,charm:!!p.charm,sockets,slots,recovery,chest:chestView,selection:detail,pending:actionPending||chestOpening,pendingText:chestOpening?'Opening chest…':actionPending?'Waiting for camp…':'',sprite};
}
const SOCKET_NAME={chop:'Chop',mine:'Mine',weapon:'Weapon',body:'Armor',light:'Light'};
function guideHTML(){
  const steps=[
    ['Gather before dusk','Move with the left stick, or tap the ground. Tap a tree or rock to walk over and harvest it. Hold the action until it falls. Wood and flint land on the ground. Stay beside a pile and it comes to you; step onto it and it is picked up at once. Walk away and it stays where it fell. Grass, berries, pumpkins, and mushrooms go into your pack.'],
    ['Build a workbench','Open Build and place a workbench. It does not need another station. Stand at it and press Craft to make an axe and a pick, then Equip them in Inventory. A tool in your pack does nothing until it is worn. Cauldrons, soul lanterns, and wards are on the workbench Build list.'],
    ['Keep the fire alive','Feed the Heartfire from its Feed button. Cook opens that fire’s recipes. Firelight restores courage; darkness drains it, then your health. A Light button appears when you carry a usable lantern. Soul lanterns never go out.'],
    ['Eat, farm, recover','Open Inventory, select the food, and press Eat. A burning fire cooks pumpkins, mushrooms, and meat. A cauldron cooks stew. Plant a farm with a seed, then harvest it when it is ready. Bedrolls heal by day and spend hunger.'],
    ['Tend the camp','Build lists only what you can place from where you opened it. Choose Maintain camp to repair a damaged structure or hold Dismantle. The Heartfire cannot be dismantled. A chest someone else has open cannot be dismantled either.'],
    ['Share a chest','One wanderer opens a chest at a time. Your pack has twelve slots. A chest has twenty-four. Store all moves what fits from your pack. Sort orders a chest or your pack and stacks matching piles. Choose a quantity, then Transfer, or tap the destination slot. Close the panel to let someone else in.'],
    ['Stand together','Hold Attack to use the weapon you have equipped. Dodge the glowing attack circles. Armor absorbs damage only while worn. Hold Revive beside a fallen friend for three seconds. Everyone has one last-chance charm. Fallen wanderers return at dawn if the camp survives.'],
    ['Explore for treasure','The hollow is vast. Beyond the meadow lie the Autumn Woods and the Graveyard; farther still the Hollow Mire, the Moonshard Crags and the Barrow Fields. Crates, iron-bound chests, moonlit coffers and hollow reliquaries hide out there: hold Open beside one. Better caches sit farther from camp, and guardians watch them. Caches refill after a few days.'],
    ['Grow stronger','Kills, caches, gathering and new regions give experience. Each level adds health and damage. Loot comes in five rarities: common, uncommon, rare, epic and legendary. Bows fire arrows at the nearest foe, staffs throw bursting bolts, broadswords cleave, and the Grimoire of Ash burns everything around you. Heartstones raise your health for good.'],
    ['Outlast the night','Every night is harder than the last, with more creatures and elder champions. The Hollow King returns every fifth night, stronger each time. Guard the Heartfire: losing it ends the expedition. How many nights can you survive?'],
  ];
  return `<p class="guide-intro">The woods are unkind.<br>Your friends don’t have to be.</p>${steps.map(([title,text],index)=>`<div class="guide-step"><b>0${index+1}</b><div><h3>${title}</h3><p>${text}</p></div></div>`).join('')}<div class="key-help"><span>WASD / arrows · Move</span><span>E · Context action</span><span>Space · Attack</span><span>Shift · Dodge</span><span>I · Inventory</span><span>B · Build</span><span>F · Lantern</span><span>M · Map</span><span>1–4 · More actions</span><span>Esc · Menu</span></div><p class="muted small">The host saves the expedition automatically. Continue it alone, or host the saved expedition to open a new camp. Keep the host’s tab open during co-op; switching away pauses everyone.</p>`;
}
function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
function isFullscreen(){return !!fullscreenElement();}
function syncFullscreenUi(){
  const button=$('front-fullscreen');
  if(button)button.textContent=isFullscreen()?'EXIT FULLSCREEN':'FULLSCREEN';
  const note=$('front-fullscreen-note');
  if(note){note.hidden=!fullscreenNote;note.textContent=fullscreenNote||'';}
  if(sheet==='menu'){sheetMarkup='';dirty=true;renderSheet();}
}
function onFullscreenChange(){if(isFullscreen())fullscreenNote='';syncFullscreenUi();renderer?.resize?.();}
async function toggleFullscreen(){
  const unavailable='This browser cannot enter fullscreen.';
  fullscreenNote='';
  try{
    if(isFullscreen()){
      const exit=document.exitFullscreen||document.webkitExitFullscreen||document.webkitCancelFullScreen;
      if(!exit)fullscreenNote=unavailable;else await exit.call(document);
    }else{
      const root=document.documentElement;
      const request=root.requestFullscreen||root.webkitRequestFullscreen||root.webkitRequestFullScreen;
      if(!request)fullscreenNote=unavailable;else await request.call(root);
    }
  }catch{fullscreenNote=unavailable;}
  if(isFullscreen())fullscreenNote='';
  syncFullscreenUi();renderer?.resize?.();
}
function menuHTML(){
  const camp=room?`Camp ${escapeHtml(room)}`:'Solo expedition';
  return `<div class="menu-row"><span>Camp</span><b>${camp}</b></div><div class="menu-row"><span>Connection</span><b>${escapeHtml(connectionText||'On this device')}</b></div><div class="menu-row"><span>Save</span><b>${escapeHtml(saveText||(mode==='guest'?'Kept by the host':'Not saved yet'))}</b></div><div class="menu-row"><span>Sound</span><button type="button" data-command="sound">${sound.enabled?'On':'Off'}</button></div><div class="menu-row"><span>Fullscreen</span><button type="button" data-command="fullscreen">${isFullscreen()?'Exit fullscreen':'Fullscreen'}</button></div>${fullscreenNote?`<p class="muted small">${escapeHtml(fullscreenNote)}</p>`:''}<div class="menu-row"><span>Camera distance</span><div><button type="button" data-command="zoom-out" aria-label="Zoom out">−</button><button type="button" data-command="zoom-in" aria-label="Zoom in">+</button></div></div><div class="menu-actions"><button type="button" class="primary" data-command="resume">Back to the woods</button>${room?'<button type="button" data-command="invite">Copy camp invite ↗</button>':''}${mode!=='guest'?'<button type="button" data-command="save">Save expedition</button>':''}<button type="button" data-command="guide">Read the field guide</button><button type="button" data-command="home">Save & return to title</button></div><p class="muted small" style="margin-top:18px">${mode==='guest'?'The host keeps the shared save. Your progress is part of their expedition.':'Progress is saved on this browser. The host must keep this tab open for friends to play.'}</p>`;
}
function replaceContent(html){
  const content=$('sheet-content');
  if(inventoryPanel?.root?.isConnected||content.dataset.kind!==sheet||html!==sheetMarkup){
    const scroll=content.scrollTop;
    discardPanel();
    content.innerHTML=html;
    content.dataset.kind=sheet;
    sheetMarkup=html;
    content.scrollTop=scroll;
  }
}
function setTabs(html){if(html!==tabsMarkup){$('sheet-tabs').innerHTML=html;tabsMarkup=html;}}
function renderSheet(){
  if(!sheet)return;
  const p=me();
  $('sheet-menu').hidden=sheet==='menu'||sheet==='guide';
  let title='',kicker='THE WANDERER’S COMPANION';
  if(sheet==='guide'){title='A field guide';kicker='FIELD NOTES';setTabs('');replaceContent(guideHTML());}
  else if(sheet==='menu'){title='By the fire';kicker=mode==='solo'?'EXPEDITION PAUSED':linkLost?'CONNECTION CLOSED':'THE EXPEDITION CONTINUES';setTabs('');replaceContent(menuHTML());}
  else if(sheet==='map'){
    title='The Hollow Harvest';kicker=`DAY ${dayAt(world.time)} · SHARED EXPLORATION`;setTabs('');
    const place=p?REGIONS[regionAt(p.x,p.z)]?.name:'';const found=p?.regions?.length||1;
    const swatch=(color,text)=>`<span class="swatch" style="background:${color}"></span>${text}`;
    replaceContent(`<canvas id="full-map" width="600" height="600" aria-label="Explored world map"></canvas><p class="map-legend">✦ Heartfire &nbsp; ● Wanderers &nbsp; ◆ Camp &nbsp; <span style="color:#e0776b">●</span> Guardians<br>${swatch(RARITY_COLORS.common,'Crate')} ${swatch(RARITY_COLORS.rare,'Iron-bound chest')} ${swatch(RARITY_COLORS.epic,'Moonlit coffer')} ${swatch(RARITY_COLORS.legendary,'Reliquary')}<br>${place?`You are in ${escapeHtml(place)}. `:''}Regions discovered: ${found} of 6.<br>Danger and treasure grow the farther you travel from the Heartfire.</p>`);
    drawMap($('full-map'),true);
  }else if(!p)return;
  else if(sheet==='catalog'){
    const model=catalogModel(catalog);
    title=model.title;kicker=model.kicker;
    const tab=catalog.source==='field'||catalog.tab==='build'?'build':'craft';
    const ids=model.recipeIds.filter(id=>inCategory(id,category,tab));
    const tabs=[...model.tabs.map(entry=>`<button type="button" class="chip ${catalog.tab===entry.id?'active':''}" data-tab="${entry.id}">${entry.label}</button>`),...model.categories.map(entry=>`<button type="button" class="chip ${category===entry.id?'active':''}" data-category="${entry.id}">${entry.label}</button>`)].join('');
    setTabs(tabs);
    const recipes=ids.map(id=>{
      const recipe=RECIPES[id],resultId=recipe.result||id;
      return {id,name:label(resultId),desc:recipe.desc,icon:icon(resultId),action:model.action,reason:world.recipeReason(p,id,catalog.stationId)||'',costs:Object.entries(recipe.cost).map(([itemId,need])=>({have:world.available(p,itemId),need,name:label(itemId),short:world.available(p,itemId)<need}))};
    });
    replaceContent(catalogMarkup({recipes,maintain:model.maintain,pendingId:catalogPending}));
  }else if(sheet==='inventory'||sheet==='chest'){
    title=sheet==='chest'?'Chest':'Inventory';
    kicker=sheet==='chest'?'YOUR PACK AND THIS CHEST':'WORN GEAR AND PACK';
    setTabs('');ensurePanel();inventoryPanel.update(inventoryView(p));
  }
  $('sheet-title').textContent=title;$('sheet-kicker').textContent=kicker;
}
function drawMap(canvas,full=false){
  if(!canvas)return;
  const ctx=canvas.getContext('2d'),size=canvas.width,R=RULES.radius,N=EXPLORE_SIZE,cell=EXPLORE_CELL;ctx.clearRect(0,0,size,size);ctx.fillStyle='#282733';ctx.fillRect(0,0,size,size);const explored=new Set(world.explored);
  const me_=world.player(localId)||world.players[0]||{x:0,z:0};
  // Full map shows the whole hollow; the minimap is a 34-unit window around you.
  const span=full?R*2+4:68,scale=size/span,cx=full?0:me_.x,cz=full?0:me_.z;
  const sx=x=>(x-cx)*scale+size/2,sz=z=>(z-cz)*scale+size/2,vis=(x,z)=>Math.abs(x-cx)<span/2+cell&&Math.abs(z-cz)<span/2+cell;
  for(const index of explored){const gx=index%N,gz=Math.floor(index/N),x=gx*cell-R,z=gz*cell-R;if(!vis(x,z))continue;ctx.fillStyle=theme.palette[biome(x+cell/2,z+cell/2)]||theme.palette.meadow;ctx.fillRect(sx(x),sz(z),cell*scale+.6,cell*scale+.6);}
  const known=e=>explored.has(Math.floor((e.z+R)/cell)*N+Math.floor((e.x+R)/cell));
  const cacheColor={crate:RARITY_COLORS.common,ironchest:RARITY_COLORS.rare,moonchest:RARITY_COLORS.epic,reliquary:RARITY_COLORS.legendary};
  for(const n of world.nodes){
    if(!known(n)||!vis(n.x,n.z))continue;
    if(isCache(n.type)){const x=sx(n.x),y=sz(n.z),r=full?4.5:5;ctx.globalAlpha=n.ready?.35:1;ctx.fillStyle=cacheColor[n.type];ctx.strokeStyle='#1e1624';ctx.lineWidth=1.5;ctx.fillRect(x-r,y-r*.7,r*2,r*1.4);ctx.strokeRect(x-r,y-r*.7,r*2,r*1.4);ctx.globalAlpha=1;continue;}
    if(!full||n.ready)continue;
    ctx.fillStyle=n.type==='tree'?'#374f48':['grave','ore','shardrock'].includes(n.type)?'#d2c5d7':n.type==='pumpkin'?'#e8ae72':'#c1b993';ctx.beginPath();ctx.arc(sx(n.x),sz(n.z),1.6,0,Math.PI*2);ctx.fill();
  }
  for(const e of world.enemies){if(!e.guardOf||!known(e)||!vis(e.x,e.z))continue;ctx.fillStyle='#e0776b';ctx.beginPath();ctx.arc(sx(e.x),sz(e.z),full?1.8:2.4,0,Math.PI*2);ctx.fill();}
  for(const b of world.buildings){if(b.type!=='hearth'&&!known(b))continue;let x=sx(b.x),y=sz(b.z);if(b.type==='hearth'&&!full){x=clamp(x,8,size-8);y=clamp(y,8,size-8);}else if(!vis(b.x,b.z))continue;ctx.fillStyle=b.type==='hearth'?'#ffdda0':'#c4b096';const r=b.type==='hearth'?6:4;ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();ctx.fill();}
  for(const q of world.players.filter(q=>q.online)){if(!vis(q.x,q.z))continue;ctx.fillStyle=CHARACTERS.find(c=>c.id===q.character)?.color||'#f4e3b2';ctx.strokeStyle='#27222e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(q.x),sz(q.z),q.id===localId?5:3.8,0,Math.PI*2);ctx.fill();ctx.stroke();}
  if(full){ctx.strokeStyle='#d8c29a44';ctx.lineWidth=1;ctx.beginPath();ctx.arc(sx(0),sz(0),R*scale,0,Math.PI*2);ctx.stroke();ctx.font='13px monospace';ctx.fillStyle='#e0caaa';ctx.textAlign='center';ctx.fillText('N',size/2,16);ctx.font='11px Georgia';ctx.fillText('HEARTFIRE',sx(0),sz(0)+18);}
}
function paintVital(key,value,name){const bar=$(`${key}-bar`);if(!bar)return;const amount=clamp(value,0,100);bar.style.width=`${amount}%`;const row=bar.closest('[role="progressbar"]');if(!row)return;const shown=String(Math.ceil(amount));row.setAttribute('aria-valuenow',shown);row.setAttribute('aria-label',`${name} ${shown}`);}
function paintClock(){
  const dayEnd=RULES.day/RULES.cycle*100,duskEnd=(RULES.day+RULES.dusk)/RULES.cycle*100,track=$('day-track');
  if(!track)return;const sig=`${dayEnd}|${duskEnd}`;
  if(track.dataset.stops!==sig){track.dataset.stops=sig;track.style.background=`linear-gradient(90deg,#d6bb7a 0 ${dayEnd}%,#c6855d ${dayEnd}% ${duskEnd}%,#666887 ${duskEnd}%)`;}
}
function paintAction(el,action,modeName){
  const sig=action?`${modeName}|${action.id}|${action.label}|${action.enabled?'1':'0'}|${action.disabledReason}|${action.icon}`:'off';
  if(el.dataset.sig===sig){if(action)el.dataset.mode=modeName;return;}
  el.dataset.sig=sig;
  if(!action){el.classList.add('is-off');el.tabIndex=-1;el.setAttribute('aria-hidden','true');el.removeAttribute('data-action');el.classList.remove('confirming','is-disabled');el.innerHTML='';el.style.removeProperty('--hold');return;}
  el.classList.remove('is-off');el.tabIndex=0;el.removeAttribute('aria-hidden');el.dataset.action=action.id;el.dataset.mode=modeName;
  el.classList.toggle('is-disabled',!action.enabled);el.classList.toggle('confirming',action.id==='dismantle');
  el.setAttribute('aria-label',action.enabled?action.label:`${action.label}. ${action.disabledReason}`);
  el.innerHTML=`<span>${action.icon}</span><small>${escapeHtml(action.label)}</small>`;
}
function paintCluster(modeName,p){
  const building=maintenance?world.buildings.find(entry=>entry.id===maintenanceTarget&&entry.hp>0):null;
  const actions=clusterFor(modeName,{
    context:p?contextFacts(p):null,
    placement:placement?{valid:!!placement.valid,pending:!!placement.pending,reason:placement.reason||''}:null,
    maintenance:{building:building?{id:building.id,type:building.type,hp:building.hp,maxHp:building.maxHp}:null,locked:!!(building&&world.chestSessions.get(building.id)&&world.chestSessions.get(building.id).ownerId!==localId),wood:p?world.available(p,'wood'):0,inRange:!!(p&&building&&distance(p,building)<RULES.reach)},
  });
  liveActions=actions;
  CONTEXT_BUTTONS.forEach((id,index)=>paintAction($(id),actions[index]||null,modeName));
  const combat=allowsCombat(modeName);
  for(const id of ['attack','dodge']){const el=$(id);el.classList.toggle('is-off',!combat);el.tabIndex=combat?0:-1;el.setAttribute('aria-hidden',combat?'false':'true');}
  const light=p&&showsLantern(modeName)?usableLantern(p):null;
  const lantern=$('lantern-button');
  lantern.classList.toggle('is-off',!light);lantern.tabIndex=light?0:-1;lantern.setAttribute('aria-hidden',light?'false':'true');
  if(light){lantern.classList.toggle('is-lit',light.lit);lantern.setAttribute('aria-label',`Lantern, ${light.lit?'lit':'unlit'}, fuel ${Math.ceil(light.fuel*100)} percent`);const circle=lantern.querySelector('circle');if(circle){const span=(94.2*light.fuel).toFixed(2);circle.setAttribute('stroke-dasharray',`${span} 94.2`);}}
  const weary=!p||p.dashCooldown>0||p.stamina<28||p.down||p.ghost;$('dodge').classList.toggle('is-disabled',!combat||weary);
  $('hotbar-inventory').classList.toggle('active',sheet==='inventory'||sheet==='chest');
  $('hotbar-build').classList.toggle('active',sheet==='catalog'&&catalog.source==='field');
}
function ui(){
  maintainChest();
  if($('room-panel')&&!$('room-panel').hidden){$('roster').innerHTML=world.players.filter(p=>p.online).map(p=>`<div class="roster-row">${portrait(p.character)}<span>${escapeHtml(p.name)}</span><small>${p.id==='host'?'HOST':'READY'}</small></div>`).join('')+Array.from({length:Math.max(0,4-world.players.filter(p=>p.online).length)},()=>'<div class="roster-row"><span class="party-dot" style="opacity:.3"></span><span class="muted small">Waiting for a wanderer…</span></div>').join('');}
  const p=me();
  if(!$('game').hidden&&p){
    paintVital('hp',p.hp/maxHealth(p)*100,'Health');$('level-number').textContent=String(p.level||1);$('xp-bar').style.width=`${clamp((p.xp||0)/xpToNext(p.level||1)*100,0,100)}%`;$('level-chip').setAttribute('aria-label',`Level ${p.level||1}, ${Math.round((p.xp||0)/xpToNext(p.level||1)*100)} percent to next`);$('region-name').textContent=(REGIONS[regionAt(p.x,p.z)]?.name||'').toUpperCase();paintVital('hunger',p.hunger,'Hunger');paintVital('courage',p.courage,'Courage');
    $('stamina-bar').style.width=`${p.stamina}%`;
    $('day-number').textContent=`DAY ${String(dayAt(world.time)).padStart(2,'0')}`;
    $('day-progress').style.left=`${(world.time%RULES.cycle)/RULES.cycle*100}%`;
    const seconds=Math.ceil(phaseRemaining(world.time));
    $('phase-time').textContent=`${phaseAt(world.time)==='day'?'DAYLIGHT':phaseAt(world.time).toUpperCase()} · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    paintClock();
    $('party').innerHTML=world.players.filter(q=>q.id!==localId).map(q=>`<div class="party-row"><span class="party-dot" style="background:${CHARACTERS.find(c=>c.id===q.character)?.color}"></span><b>${escapeHtml(q.name)}</b><span>${!q.online?'away':q.down?'needs help!':q.ghost?'returns at dawn':''}</span></div>`).join('');
    if(p.noticeAt&&p.noticeAt!==lastNotice){toast(p.notice);lastNotice=p.noticeAt;}
    for(const ev of world.events)if(ev.id>lastEvent){lastEvent=ev.id;if(world.time-ev.at<2){if(['announce','phase'].includes(ev.type))announce(ev.text);if(ev.type==='rare'&&distance(p,ev)<14)toast(`Found ${ev.text} · ${rarityOf(ev.itemId)}`);if(distance(p,ev)<20||ev.type==='phase')sound.play(ev.type);}}
    $('downed').hidden=!p.down&&!p.ghost;
    if(p.down||p.ghost){$('downed-text').textContent=p.charm?'Use your one last-chance charm, or let a teammate hold Revive beside you.':p.down?`A friend can hold Revive beside you. ${Math.ceil(p.down)} seconds until your supplies drop.`:'Your supplies are on the ground. You return at dawn if the camp survives.';$('use-charm').hidden=!p.charm;if(sheet)closeSheet();cancelPlacement();cancelMaintenance();inventoryPanel?.cancelDrag();}
    const boss=world.enemies.find(e=>e.type==='king');$('boss-bar').hidden=!boss;document.body.classList.toggle('boss',!!boss);if(boss)$('boss-bar').querySelector('em').style.width=`${boss.hp/boss.maxHp*100}%`;
    if(placement){
      if(placement.showcase){if(!placement.anchored){placement.x=Math.round((p.x+p.dx*3)*2)/2;placement.z=Math.round((p.z+p.dz*3)*2)/2;}const why=showcasePlaceReason(world,p,placement.kind,placement.key,placement.x,placement.z);placement.valid=!why;placement.reason=why||'';}
      else if(placement.stationId&&!world.buildings.some(b=>b.id===placement.stationId&&b.hp>0)){cancelPlacement();toast('That workbench is gone');}
      else{if(!placement.anchored){placement.x=Math.round((p.x+p.dx*3)*2)/2;placement.z=Math.round((p.z+p.dz*3)*2)/2;}const why=world.canBuild(p,placement.key,placement.x,placement.z,placement.stationId);placement.valid=!why;placement.reason=why||'';}
    }
    if(world?.showcase)paintShowcase();
    if(sheet==='catalog'&&catalog.source==='station'){const station=world.buildings.find(b=>b.id===catalog.stationId&&b.hp>0);if(!station||distance(p,station)>=5){closeSheet();toast('Station out of range');}}
    if(maintenance&&maintenanceTarget&&!world.buildings.some(b=>b.id===maintenanceTarget&&b.hp>0))maintenanceTarget=null;
    paintCluster(currentMode(),p);drawMap($('minimap'));
    if(['victory','defeat'].includes(world.status)&&lastEnd!==world.status){lastEnd=world.status;resetInput();endContextHold();cancelPlacement();cancelMaintenance();closeSheet();save();$('end-screen').hidden=false;const won=world.status==='victory';$('end-kicker').textContent=won?'THE CURSE IS BROKEN':'THE EXPEDITION ENDS';$('end-title').textContent=won?'Morning, at last.':'The last light.';$('end-text').textContent=won?'Five nights in the hollow. One fire kept alive. You made a home where nothing was meant to live.':world.buildings.some(b=>b.type==='hearth')?'The woods claimed every wanderer. A stronger camp and a friend’s helping hand can turn the next night.':'The Heartfire was destroyed. Walls, traps and a well-fed fire will help your next camp endure.';const top=Math.max(...world.players.map(q=>q.level||1));$('end-text').textContent+=world.best?.loot?` Best find: ${label(world.best.loot)}.`:'';$('end-stats').innerHTML=`<span><b>${Math.max(0,dayAt(world.time)-1)}</b>NIGHTS</span><span><b>${top}</b>LEVEL</span><span><b>${world.kills}</b>FOES</span>`;$('endless').hidden=!won||mode==='guest';$('new-expedition').hidden=mode==='guest';}
  }
  if(sheet&&dirty)renderSheet();
  dirty=false;
}
function aimEntity(){
  if(maintenance&&maintenanceTarget)return world.buildings.find(b=>b.id===maintenanceTarget)||null;
  return currentTarget()?.entity||null;
}
function setupControls(){
  $('characters').innerHTML=CHARACTERS.map(c=>`<button class="character" type="button" data-character="${c.id}" aria-label="${c.name}, ${c.detail}" aria-pressed="${c.id===character}">${portrait(c.id)}<small>${c.name}</small></button>`).join('');
  $('characters').onclick=e=>{const b=e.target.closest('[data-character]');if(!b)return;character=b.dataset.character;for(const el of $('characters').children)el.setAttribute('aria-pressed',el===b);if(mode==='front')world.players[0].character=character;storeProfile();};
  $('host').onclick=hostCamp;$('join').onclick=joinCamp;$('solo').onclick=()=>solo();$('showcase').onclick=()=>{if(!busy)startShowcase();};$('continue').onclick=()=>solo(true);$('launch').onclick=()=>{enterGame();network?.broadcast();};$('cancel-room').onclick=goHome;$('copy-room').onclick=copyInvite;$('front-guide').onclick=()=>openSheet('guide');
  $('front-sound').onclick=()=>{sound.enabled=!sound.enabled;$('front-sound').textContent=`SOUND ${sound.enabled?'ON':'OFF'}`;sound.unlock();storeProfile();};
  $('close-sheet').onclick=closeSheet;$('sheet-menu').onclick=()=>openSheet('menu');$('minimap-button').onclick=()=>sheet==='map'?closeSheet():openSheet('map');
  $('hotbar-inventory').onclick=toggleInventory;$('hotbar-build').onclick=toggleFieldBuild;$('use-charm').onclick=()=>send({type:'interact'});
  const cluster=$('action-cluster');
  cluster.addEventListener('pointerdown',event=>{
    const button=event.target.closest('button');if(!button||button.classList.contains('is-off'))return;
    event.preventDefault();try{button.setPointerCapture?.(event.pointerId);}catch{}sound?.unlock();
    if(button.id==='attack'){if(!allowsCombat(currentMode()))return;hold.attack=true;captured={pointerId:event.pointerId,kind:'attack'};void send({type:'attack'});return;}
    if(button.id==='dodge'){const actor=me();if(!actor||actor.dashCooldown>0||actor.stamina<28||actor.down||actor.ghost)return;void send({type:'dash'});return;}
    if(button.id==='lantern-button'){if(usableLantern(me()))void send({type:'lanternToggle'});return;}
    const action=liveActions.find(entry=>entry.id===button.dataset.action);
    captured={pointerId:event.pointerId,kind:'context',mode:button.dataset.mode,id:action?.id};
    if(!action)return;
    if(!action.enabled){toast(action.disabledReason);return;}
    if(action.activation==='hold')beginContextHold(action,'pointer');
    else void runAction(action);
  });
  const releasePointer=event=>{
    if(captured?.kind==='attack')hold.attack=false;
    if(captured?.kind==='context'&&holdSource==='pointer'&&(!event||event.pointerId===captured.pointerId))endContextHold();
    if(!event||event.pointerId===captured?.pointerId)captured=null;
  };
  cluster.addEventListener('pointerup',releasePointer);cluster.addEventListener('pointercancel',releasePointer);cluster.addEventListener('lostpointercapture',()=>releasePointer());
  const joystick=$('joystick');
  joystick.addEventListener('pointerdown',e=>{if(!allowsMovement(currentMode()))return;e.preventDefault();pointer=e.pointerId;try{joystick.setPointerCapture(pointer);}catch{}sound.unlock();moveStick(e);});
  joystick.addEventListener('pointermove',e=>{if(e.pointerId===pointer)moveStick(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(type,e=>{if(pointer===e.pointerId){pointer=null;stick={x:0,z:0};$('stick').style.transform='';}});
  function moveStick(e){const r=joystick.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,z=e.clientY-r.top-r.height/2,l=Math.hypot(x,z),scale=Math.min(1,42/Math.max(1,l));$('stick').style.transform=`translate(${x*scale}px,${z*scale}px)`;stick={x:clamp(x/42,-1,1),z:clamp(z/42,-1,1)};}
  $('world').addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
  $('world').addEventListener('pointerup',e=>{
    if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>12||!['solo','host','guest'].includes(mode)||$('game').hidden)return;
    const modeName=currentMode();if(!allowsMovement(modeName)&&modeName!=='normal')return;
    const point=renderer.worldPoint(e.clientX,e.clientY);if(!point)return;
    if(world?.showcase&&showcaseTool==='remove'){
      const picked=renderer.pick(e.clientX,e.clientY,world);
      if(picked&&removeShowcaseTarget(world,picked))toast('Removed');
      else toast('Nothing there to remove');
      dirty=true;return;
    }
    if(placement?.showcase){commitShowcase(Math.round(point.x*2)/2,Math.round(point.z*2)/2);return;}
    if(placement){placement.x=Math.round(point.x*2)/2;placement.z=Math.round(point.z*2)/2;placement.anchored=true;refresh();return;}
    const picked=renderer.pick(e.clientX,e.clientY,world);
    if(maintenance){maintenanceTarget=picked&&world.buildings.includes(picked)?picked.id:null;selected=maintenanceTarget;dirty=true;return;}
    if(modeName!=='normal')return;
    if(picked&&world.nodes.includes(picked)){selected=picked.id;void send({type:'setHarvestTarget',nodeId:picked.id,mode:'auto'});return;}
    if(picked&&world.drops.includes(picked)){selected=picked.id;void send({type:'move',x:picked.x,z:picked.z,target:picked.id});return;}
    if(picked&&world.enemies.includes(picked)){selected=picked.id;if(distance(me(),picked)<3.4)void send({type:'attack'});else void send({type:'move',x:picked.x,z:picked.z});return;}
    if(picked&&world.buildings.includes(picked)){selected=picked.id;if(distance(me(),picked)>=RULES.reach)void send({type:'move',x:picked.x,z:picked.z});refresh();return;}
    selected=null;void send({type:'move',x:point.x,z:point.z});
  });
  $('sheet-tabs').onclick=event=>{
    const tab=event.target.closest('[data-tab]');const chip=event.target.closest('[data-category]');
    if(tab){catalog={...catalog,tab:tab.dataset.tab};category='all';dirty=true;renderSheet();}
    if(chip){category=chip.dataset.category;dirty=true;renderSheet();}
  };
  $('sheet-content').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.recipe){
      if(catalogPending)return;
      const recipe=RECIPES[button.dataset.recipe];if(!recipe)return;
      if(recipe.kind==='build'){placeRecipe(button.dataset.recipe);return;}
      catalogPending=button.dataset.recipe;dirty=true;renderSheet();
      void send({type:'craftRecipe',recipeId:button.dataset.recipe,stationId:catalog.stationId}).finally(()=>{if(catalogPending===button.dataset.recipe)catalogPending='';dirty=true;});
      return;
    }
    const cmd=button.dataset.command;if(!cmd)return;
    if(cmd==='resume')closeSheet();if(cmd==='save')save(true);if(cmd==='home')void goHome();if(cmd==='invite')void copyInvite();if(cmd==='guide')openSheet('guide');
    if(cmd==='sound'){sound.enabled=!sound.enabled;sound.unlock();storeProfile();dirty=true;renderSheet();}
    if(cmd==='fullscreen')void toggleFullscreen();
    if(cmd==='zoom-in')renderer.setZoom(renderer.zoom+.15);if(cmd==='zoom-out')renderer.setZoom(renderer.zoom-.15);
    if(cmd==='maintain'){closeSheet();maintenance=true;maintenanceTarget=null;selected=null;dirty=true;}
  };
  $('new-expedition').onclick=()=>{if(mode==='host'){const people=world.players.filter(p=>p.online);world=new World();for(const p of people)world.addPlayer(p.id,p.name,p.character);world.start();lastEnd='';$('end-screen').hidden=true;network.broadcast();save();}else solo();};
  $('end-home').onclick=goHome;$('endless').onclick=()=>{world.status='playing';world.endless=true;world.bossSpawned=true;lastEnd='';$('end-screen').hidden=true;save();network?.broadcast();};
  window.addEventListener('keydown',event=>{
    if(['INPUT','TEXTAREA'].includes(event.target.tagName)||$('game').hidden||!$('end-screen').hidden)return;
    const key=event.key.toLowerCase();
    if([' ','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key))event.preventDefault();
    if(key==='escape'){
      const step=escapeStep({dragging:!!inventoryPanel?.dragging(),detailsOpen:!!((selection||dropDraft)&&(sheet==='inventory'||sheet==='chest')),panel:sheet,placing:!!placement||showcaseTool==='remove',maintaining:maintenance});
      if(step==='cancel-drag')inventoryPanel?.cancelDrag();
      else if(step==='close-details'){clearSelection();refresh();}
      else if(step==='close-panel')closeSheet();
      else if(showcaseListOpen)closeShowcaseList();
      else if(step==='cancel-placement'){cancelPlacement();showcaseTool='';showcaseMarkupCache='';dirty=true;}
      else if(step==='cancel-maintenance'){cancelMaintenance();dirty=true;}
      else openSheet('menu');
      return;
    }
    const named=keyboardAction(key);
    if((sheet==='inventory'||sheet==='chest')&&key.startsWith('arrow')){inventoryPanel?.focusStep(key);return;}
    if((sheet==='inventory'||sheet==='chest')&&key==='enter'){
      if(event.target?.closest?.('[data-op],[data-chest-op],[data-pack-op],[data-qty]'))return;
      event.preventDefault();inventoryPanel?.activateFocused();return;
    }
    keys.add(key);if(event.repeat)return;
    const modeName=currentMode();const actor=me();
    if(named==='inventory'){toggleInventory();return;}
    if(named==='build'){toggleFieldBuild();return;}
    if(named==='map'){sheet==='map'?closeSheet():openSheet('map');return;}
    if(named==='lantern'){if(showsLantern(modeName)&&usableLantern(actor))void send({type:'lanternToggle'});return;}
    if((modeName==='downed'||modeName==='ghost')&&actor?.charm&&(key==='e'||key==='enter')){void send({type:'interact'});return;}
    if((named==='confirm'||named==='primary')&&modeName==='placement'){void runAction(keyboardPrimary(liveActions,modeName));return;}
    if(named==='primary'&&(modeName==='normal'||modeName==='maintenance')){
      const primary=keyboardPrimary(liveActions,modeName);if(!primary)return;
      if(primary.activation==='hold'&&primary.enabled)beginContextHold(primary,'key');else void runAction(primary);return;
    }
    if(named==='attack'&&allowsCombat(modeName)){hold.attack=true;void send({type:'attack'});return;}
    if(named==='dodge'&&allowsCombat(modeName)){void send({type:'dash'});return;}
    if(named?.startsWith('action-')&&(modeName==='normal'||modeName==='placement'||modeName==='maintenance')){
      const action=liveActions[Number(named.slice(7))-1];if(!action)return;
      if(action.activation==='hold'&&action.enabled)beginContextHold(action,'key');else void runAction(action);
    }
  });
  window.addEventListener('keyup',event=>{const key=event.key.toLowerCase();keys.delete(key);if(key===' '||key==='shift')hold.attack=key===' '?false:hold.attack;if(key==='e'&&holdSource==='key')endContextHold();if(key===' ')hold.attack=false;});
  window.addEventListener('blur',()=>{endContextHold();hold.attack=false;resetInput();inventoryPanel?.cancelDrag();if(sheet==='chest')closeSheet();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){endContextHold();hold.attack=false;resetInput();inventoryPanel?.cancelDrag();if(sheet==='chest')closeSheet();}hiddenPause=document.hidden;if(mode==='host'){network?.pause(hiddenPause);if(hiddenPause)save();}if(mode==='solo'&&hiddenPause)save();});
  window.addEventListener('pagehide',()=>{endContextHold();save();void network?.stop();});
  window.addEventListener('resize',()=>inventoryPanel?.cancelDrag());
  window.addEventListener('orientationchange',()=>inventoryPanel?.cancelDrag());
  $('room-input').addEventListener('keydown',e=>{if(e.key==='Enter')joinCamp();});
  $('player-name').addEventListener('change',storeProfile);
}
function frame(now){
  const dt=Math.min(.08,(now-lastTime)/1000||.016);lastTime=now;uiTime+=dt;networkTime+=dt;saveTime+=dt;pingTime+=dt;
  const playing=['solo','host','guest'].includes(mode)&&!$('game').hidden&&!paused&&!remotePaused&&!hiddenPause;
  const modeName=playing?currentMode():'front';
  if(modeName!==lastMode){endContextHold();hold.attack=false;keys.delete(' ');keys.delete('e');keys.delete('shift');if(!allowsMovement(modeName)){stick={x:0,z:0};const el=$('stick');if(el)el.style.transform='';}lastMode=modeName;}
  const move=allowsMovement(modeName);
  const input={
    x:move?stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0):0,
    z:move?stick.z+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0):0,
    act:modeName==='normal'&&!!hold.act,
    attack:allowsCombat(modeName)&&(hold.attack||keys.has(' ')),
    target:selected,
  };
  if(mode==='host'||mode==='solo'){world.input(localId,input);if(playing){acc+=dt;let steps=0;while(acc>=RULES.tick&&steps++<4){world.tick();acc-=RULES.tick;}}else acc=0;localClient?.tick();}
  if(networkTime>.075){networkTime=0;if(mode==='guest'&&playing)network?.input(input);if(mode==='host')network?.broadcast();}
  if(saveTime>10){saveTime=0;save();}if(pingTime>3){pingTime=0;network?.ping();}
  if(uiTime>.18){uiTime=0;dirty=true;ui();}
  const target=!$('game').hidden?aimEntity():null;renderer.render(world,localId,dt,{target,placement,demo:$('game').hidden});requestAnimationFrame(frame);
}
async function init(){
  await loadMagicModules();
  theme=await loadTheme();installMagicSprites(theme);try{renderer=new Renderer($('world'),theme);}catch{renderer=new CanvasRenderer($('world'),theme);}await renderer.preload();sound=new Sound(theme);const prefs=profile();character=CHARACTERS.some(c=>c.id===prefs.character)?prefs.character:'ember';$('player-name').value=String(prefs.name||'Wanderer').slice(0,18);sound.enabled=prefs.sound!==false;$('front-sound').textContent=`SOUND ${sound.enabled?'ON':'OFF'}`;
  paintClock();demoWorld();setupControls();syncSaveOption();const params=new URLSearchParams(location.search);
  const code=params.has('showcase')?'':params.get('camp');if(code){$('room-input').value=code.toUpperCase().slice(0,5);showStatus('A place by the fire is waiting. Choose a name and join.');}
  const showcasePanel=$('showcase-panel');
  showcasePanel?.addEventListener('pointerdown',event=>event.stopPropagation());
  showcasePanel?.addEventListener('pointerup',event=>event.stopPropagation());
  showcasePanel?.addEventListener('click',event=>{
    event.stopPropagation();
    const cat=event.target.closest('[data-showcase-cat]');
    const count=event.target.closest('[data-showcase-count]');
    const spawn=event.target.closest('[data-showcase-spawn]');
    const tool=event.target.closest('[data-showcase-tool]');
    if(cat){showcaseCategory=cat.dataset.showcaseCat;showcaseMarkupCache='';paintShowcase();return;}
    if(count){showcaseMobCount=clampShowcaseMobCount(count.dataset.showcaseCount);showcaseMarkupCache='';paintShowcase();return;}
    if(tool?.dataset.showcaseTool==='open'){showcaseListOpen?closeShowcaseList():openShowcaseList();return;}
    if(tool?.dataset.showcaseTool==='close'){closeShowcaseList();return;}
    if(tool?.dataset.showcaseTool==='clear'){clearShowcaseWorld(world);cancelPlacement();showcaseTool='';if(sheet)closeSheet();toast('The clearing is empty');showcaseMarkupCache='';paintShowcase();return;}
    if(tool?.dataset.showcaseTool==='remove'){showcaseTool=showcaseTool==='remove'?'':'remove';if(showcaseTool)cancelPlacement();if(showcaseTool&&showcaseListOpen)closeShowcaseList();else{showcaseMarkupCache='';paintShowcase();}return;}
    if(spawn){const value=spawn.dataset.showcaseSpawn,split=value.indexOf(':');armShowcase(value.slice(0,split),value.slice(split+1));}
  });
  $('front-fullscreen')?.addEventListener('click',()=>void toggleFullscreen());
  document.addEventListener('fullscreenchange',onFullscreenChange);
  document.addEventListener('webkitfullscreenchange',onFullscreenChange);
  window.addEventListener('popstate',onShowcasePop);
  $('loading').hidden=true;$('front').hidden=false;requestAnimationFrame(frame);
  if(params.has('dev')||params.has('showcase'))window.__HOLLOWSTEAD__={get world(){return world;},get mode(){return mode;},get sheet(){return sheet;},get placement(){return placement;},get maintenance(){return maintenance;},get uiMode(){return currentMode();},get showcaseTool(){return showcaseTool;},renderer,send,solo,openSheet,save,startShowcase,setTime(t){world.time=t;},get network(){return network;}};
  if(params.has('showcase'))startShowcase();
}
init().catch(error=>{$('load-status').textContent=`The woods could not be loaded. ${error.message} Try reloading in a browser with WebGL enabled.`;$('loading').querySelector('p').textContent='The lantern went out.';console.error(error);});
