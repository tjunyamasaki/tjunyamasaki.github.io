import {World,clamp,distance,biome,EXPLORE_CELL,EXPLORE_SIZE} from './engine.mjs?v=harvest-18';
import {RARITIES,RARITY_COLORS,REGIONS,isCache,maxHealth,rarityOf,regionAt,xpToNext} from './progression.mjs?v=harvest-18';
import {RULES,ITEMS,EQUIPMENT,NODES,STRUCTURES,RECIPES,ENEMIES,CHARACTERS,LOOKS,label,phaseAt,dayAt,phaseOf,dayOf,hollowTime,scheduleOf,nodeAwake} from './content.mjs?v=harvest-18';
import {Renderer,loadTheme} from './renderer.mjs?v=harvest-18';
import {CanvasRenderer} from './canvas-renderer.mjs?v=harvest-18';
import {createNetwork} from './network.mjs?v=harvest-18';
import {Sound} from './audio.mjs?v=harvest-18';
import {SAVE_KEYS,planContinue} from './serialization.mjs?v=harvest-18';
import {vigilStatus} from './vigil.mjs?v=harvest-18';
import {OMENS} from './omens.mjs?v=harvest-18';
import {HEARTH_MAX} from './areas.mjs?v=harvest-18';
import {paintMapMarks} from './ui/hollow.mjs?v=harvest-18';
import {EQUIPMENT_SLOTS,itemSpriteKey,equipmentSlotFor,containerId} from './inventory.mjs?v=harvest-18';
import {createActionSession,createActionClient} from './transactions.mjs?v=harvest-18';
import {CHEST_RENEW_SECONDS,CHEST_SLOT_COUNT,DISMANTLE_HOLD_SECONDS,STORAGE_TYPES} from './contracts.mjs?v=harvest-18';
import {cartFacts} from './cart.mjs?v=harvest-18';
import {
  allowsCombat,allowsMovement,clusterFor,escapeStep,isHarvestAction,keyboardAction,
  keyboardPrimary,potionHotbar,resolveMode,showsLantern,usableLantern,
} from './ui/actions.mjs?v=harvest-18';
import {catalogMarkup,catalogModel,inCategory,pickRecipe} from './ui/catalog.mjs?v=harvest-18';
import {actionNeedsConfirm,actionNeedsCount,adjustQuantity,createInventoryPanel,itemActionClearsSelection,operationsFor,slotLabel,stackMaxDurability} from './ui/inventory.mjs?v=harvest-18';
import {salvageText} from './salvage.mjs?v=harvest-18';
import {loadMagicModules} from './magic/load.mjs?v=harvest-18';
import {installMagicSprites,isMagicAlly} from './magic/registry.mjs?v=harvest-18';
import {waveLeft} from './arena.mjs?v=harvest-18';
import {hotbarView,offerMarkup,rankStars,replaceMarkup} from './ui/arena.mjs?v=harvest-18';
import {DASH, MEND} from './progression.mjs?v=harvest-18';
import {conditionOf, masteryView, mendPlan} from './mastery.mjs?v=harvest-18';
import {clampShowcaseMobCount, clearShowcaseWorld, grantShowcaseItem, placeShowcase, removeShowcaseTarget, showcaseMarkup, showcasePlaceReason, showcaseSpawnName} from './showcase.mjs?v=harvest-18';
import {cachedSrc,loadImage} from './assets.mjs?v=harvest-18';
import {bindFeatureHud, frameFeatureHud, paintFeatureHud} from './ui/features.mjs?v=harvest-18';
import {revealsCache, trinketTip} from './ui/trinkets.mjs?v=harvest-18';
import {exploredGround} from './ui/worldmap.mjs?v=harvest-18';
import {createUpdateChecker} from './updates.mjs?v=harvest-18';
import {skillBlock, skillFor} from './skills.mjs?v=harvest-18';
import {labClear, labDps, labEquip, labLevel, labRank, labResetStats, labSpawn, labStrength, labToggle} from './lab.mjs?v=harvest-18';
import {arsenalMarkup, foesMarkup, labMeterMarkup, labStripMarkup} from './ui/lab.mjs?v=harvest-18';
import {REFINE_CURRENCY, carriedWeapons, refineLines, refineView, refinesOf} from './refine.mjs?v=harvest-18';
import {refineMarkup, refineTabs} from './ui/refine.mjs?v=harvest-18';
import {createHurtFx} from './hurt-fx.mjs?v=harvest-18';
import {CHARM} from './trinkets.mjs?v=harvest-18';
import {dungeonStatus, layoutOf} from './dungeon/run.mjs?v=harvest-18';
import {VARIANTS, isVariant} from './dungeon/variants.mjs?v=harvest-18';
import {floorTones} from './dungeon/art.mjs?v=harvest-18';
import {createHomesteadControls} from './ui/homestead.mjs?v=harvest-18';
import {CROPS, roomOfBuilding} from './homestead.mjs?v=harvest-18';

const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROFILE=SAVE_KEYS.profile;
const CONTEXT_BUTTONS=['context-0','context-1','context-2','context-3'];
let identity=crypto.randomUUID();
try{identity=sessionStorage.getItem('hollowstead.identity')||identity;sessionStorage.setItem('hollowstead.identity',identity);}catch{}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The connection service did not respond. Please try again.')),18000);})]);}finally{clearTimeout(timer);}}

let theme,renderer,sound,world,network=null,mode='front',localId='host',character='ember',room='',paused=false,remotePaused=false,hiddenPause=false,linkLost=false;
let sheet=null,category='all',selected=null,placement=null,maintenance=false,maintenanceTarget=null;
let homestead=null;
let showcaseCategory='materials',showcaseTool='',showcaseListOpen=false,showcaseMobCount=1,showcaseMarkupCache='',showcaseHistoryClosing=false,fullscreenNote='';
let lastNotice=0,lastEvent=0,lastEnd='',lastTime=0,acc=0,uiTime=0,networkTime=0,saveTime=0,pingTime=0,lastMode='normal';
let sheetMarkup='',tabsMarkup='',toastTimer,announceTimer,lastToast={text:'',at:0},dirty=true;
let stick={x:0,z:0},hold={act:false,attack:false},keys=new Set(),pointer=null,pointerStart=null,busy=false;
let connectionText='',saveText='';
let autoAttack=true,pickPending=null,arenaMarkup='',hotbarSig='',attackSig='',skillSig='',zoomBeforeArena=null;
/** Dungeons: the variation picked on the title screen ('' = a new one every floor). */
let dungeonPick='';
/** Weapon lab panel state (presentation only; the lab's rules live in lab.mjs). */
let labOpen='',labRankPick=3,labFoe='mix',labCount=10,labFormation='ahead',labSheetCache='',labBarCache='',labMeterCache='';
/** The arena is a swarm fight: start a little wider than the exploring camera. */
const ARENA_ZOOM=.8;
let localActions=null,localActionWorld=null,localClient=null;
let chestSession=null,chestOpening=false,chestToken=0,chestRenewAt=0,chestRenewing=false;
let catalog={source:'field',stationId:null,stationType:null,tab:'build'};
let catalogPending='',catalogPick='';
// The workbench's Refine panel (src/ui/refine.mjs): which bench, which weapon type, the slot being rolled.
let refining={stationId:null,itemId:null,pending:-1,fresh:-1};
let inventoryPanel=null,selection=null,qtyMode='all',chosenQty=1,pendingOp=null,actionPending=false;
let liveActions=[],holdKind=null,holdTarget=null,holdSource=null,dismantleStarted=0,ringFrame=0,captured=null;
const checkForUpdate=createUpdateChecker({canReload:()=>mode==='front'&&!busy&&!network&&!document.hidden});

function profile(){try{return JSON.parse(localStorage.getItem(PROFILE)||'{}');}catch{return {};}}
function readStored(key){try{const raw=localStorage.getItem(key);if(!raw)return null;const data=JSON.parse(raw);return data&&typeof data==='object'?data:{invalid:true};}catch{return {invalid:true};}}
function continuePlan(){return planContinue({v2:readStored(SAVE_KEYS.expeditionV2),v1:readStored(SAVE_KEYS.expeditionV1)});}
/** The Vigil's own slot (SAVE_KEYS.vigil): read like an expedition save, never shared with one. */
function vigilPlan(){const doc=readStored(SAVE_KEYS.vigil);return doc?planContinue({v2:doc,v1:null}):{ok:false,code:'none',message:'No vigil is kept on this browser.'};}
function storeProfile(){try{localStorage.setItem(PROFILE,JSON.stringify({name:$('player-name').value,character,sound:sound.enabled,autoAttack}));}catch{}}
/** Title screen: one panel at a time on the right (modes, expedition, join, dungeons, vigil, waiting camp). */
const FRONT_PANELS=['home-panel','expedition-panel','join-panel','dungeon-panel','vigil-panel','room-panel'];
function showFrontPanel(id){for(const name of FRONT_PANELS){const el=$(name);if(el)el.hidden=name!==id;}}
function syncSoundButton(){const el=$('front-sound');if(!el)return;const on=!!sound?.enabled;el.classList.toggle('is-off',!on);el.setAttribute('aria-pressed',String(on));el.setAttribute('aria-label',on?'Sound on':'Sound off');el.title=on?'Sound on':'Sound off';}
/** Mode cards show the theme's own art (hearth, moon, stairs, blade…). */
function paintModeIcons(){for(const card of document.querySelectorAll('#front [data-icon]')){const key=card.dataset.icon,sprite=theme?.sprites?.[key],src=sprite&&(sprite.icon||sprite.src),slot=card.querySelector('.mode-icon');if(slot&&src&&!slot.firstChild)slot.innerHTML=`<img src="${escapeHtml(cachedSrc(src))}" alt="" draggable="false">`;}}
function showStatus(text,error=false){const el=$('front-status');if(el){el.textContent=text;el.style.color=error?'var(--red)':'var(--orange)';}connectionText=text;dirty=true;}
let achievementTimer=0,achievementUntil=0;
function toast(text){const now=performance.now();if(text&&now<achievementUntil){setTimeout(()=>toast(text),achievementUntil-now+60);return;}if(text&&text===lastToast.text&&now-lastToast.at<2500)return;lastToast={text,at:now};$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
/** A banner for something hard won (an omen fulfilled): bigger than an announcement, gold, and it lingers. */
function achievement(title,line,note=''){const el=$('achievement');el.replaceChildren();for(const [tag,text] of [['b',title],['span',line],['small',note]])if(text){const part=document.createElement(tag);part.textContent=text;el.append(part);}el.classList.add('visible');clearTimeout(achievementTimer);achievementUntil=performance.now()+5200;achievementTimer=setTimeout(()=>el.classList.remove('visible'),5200);}
function announce(text){$('announcement').textContent=text;$('announcement').classList.add('visible');clearTimeout(announceTimer);announceTimer=setTimeout(()=>$('announcement').classList.remove('visible'),4100);}
function icon(key){const spriteKey=itemSpriteKey(key)||(STRUCTURES[key]?key:null),src=spriteKey&&(theme.sprites[spriteKey]?.icon||theme.sprites[spriteKey]?.src);if(!src)return '';const rarity=STRUCTURES[key]&&!itemSpriteKey(key)?'common':rarityOf(key);return `<img class="item-icon rarity-${rarity}" src="${escapeHtml(cachedSrc(src))}" alt="" draggable="false">`;}
const portraitReady=new Map();
function portrait(key){
  const still=portraitReady.get(key);if(still)return `<span class="portrait portrait--still"><img src="${still}" alt="" draggable="false"></span>`;
  if(theme?.sprites?.[key])void portraitStill(key).then(src=>{if(src&&!portraitReady.has(key)){portraitReady.set(key,src);dirty=true;}});
  return `<span class="portrait" style="background-image:url('${cachedSrc(theme.sprites[key]?.src||theme.sprites.ember.src)}');background-size:${(theme.sprites[key]?.columns||1)*100}% ${(theme.sprites[key]?.rows||1)*100}%"></span>`;}
function me(){return world?.player(localId);}
const hurtFx=createHurtFx(typeof document!=='undefined'?document.getElementById('hurt-fx'):null,{reduceMotion:!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches});
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
function chestBuilding(){return chestSession?world?.buildings.find(b=>b.id===chestSession.chestId&&STORAGE_TYPES.includes(b.type)&&b.hp>0)||null:null;}
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
/** A standalone dungeon run (not a delve below an expedition, which keeps the hollow in world.surface and saves with it). */
function isRun(w){return !!(w?.dungeon&&!w.surface);}
function save(manual=false){if(world?.showcase||world?.arena||isRun(world)){if(manual)toast(world.dungeon?'Dungeon runs are not saved':world.arena?'Arena runs are not saved':world.homestead?'The homestead sandbox is not saved':'Showcase stays on this screen');return;}if(!['solo','host'].includes(mode)||!world||world.status==='lobby')return;
  // A Vigil writes only to its own slot; an expedition never touches it.
  const vigil=world.mode==='vigil',key=vigil?SAVE_KEYS.vigil:SAVE_KEYS.expeditionV2;
  try{localStorage.setItem(key,JSON.stringify({world:world.snapshot({purpose:'save'}),savedAt:Date.now()}));saveText=vigil?'Vigil kept on this browser':'Saved on this browser';if(manual)toast(vigil?'Vigil saved':'Expedition saved');dirty=true;}catch{toast('Saving is unavailable in this browser. Keep this tab open.');}}
function syncSaveOption(){const plan=continuePlan(),visible=!!(plan.ok||plan.recoverable);$('continue').hidden=!visible;$('saved-option').hidden=!visible;const badge=$('expedition-badge');if(badge)badge.hidden=!visible;$('solo').classList.toggle('primary',!visible);}
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
function clearSelection(){selection=null;pendingOp=null;qtyMode='all';chosenQty=1;}
function refresh(){dirty=true;ui();}
function discardPanel(){inventoryPanel?.destroy();inventoryPanel=null;}
function prepareWorld(resume=false,dungeon=null,vigil=null){
  if(vigil==='resume'){const plan=vigilPlan();if(!plan.ok)throw new Error(plan.message);const resumed=World.fromSave(plan.save);if(plan.write==='v2')localStorage.setItem(SAVE_KEYS.vigil,JSON.stringify(plan.save));world=resumed;world.mode='vigil';world.resumeExpedition();const p=world.player('host');if(!p)throw new Error('This vigil is missing its keeper.');p.online=true;if(world.status!=='playing')world.status='playing';}
  else if(vigil==='new'){if(readStored(SAVE_KEYS.vigil))throw new Error('A vigil is already kept on this browser. End it first to begin another.');world=new World(undefined,{mode:'vigil'});world.addPlayer('host',$('player-name').value,character);}
  else if(dungeon){world=new World((Math.random()*0xffffffff)>>>0,{dungeon});world.addPlayer('host',$('player-name').value,character);}
  else if(resume){const plan=continuePlan();if(!plan.ok)throw new Error(plan.message);const resumed=World.fromSave(plan.save);if(plan.write==='v2')localStorage.setItem(SAVE_KEYS.expeditionV2,JSON.stringify(plan.save));world=resumed;world.resumeExpedition();const p=world.player('host');if(!p)throw new Error('This saved expedition is missing its host.');p.online=true;if(world.status!=='playing')world.status='playing';}
  else{world=new World();world.addPlayer('host',$('player-name').value,character);}
  localId='host';lastEvent=world.eventId;lastNotice=0;lastEnd='';selected=null;cancelPlacement();cancelMaintenance();clearSelection();resetInput();paused=false;remotePaused=false;linkLost=false;saveTime=0;dirty=true;
}
function enterGame(){
  $('front').hidden=true;$('game').hidden=false;$('end-screen').hidden=true;closeSheet();$('room-panel').hidden=true;document.body.classList.add('playing');
  linkLost=false;cancelPlacement();cancelMaintenance();
  if(world?.homestead){connectionText='Homestead';saveText='The homestead sandbox is not saved';showStatus('');}
  else if(world?.showcase){connectionText='Showcase';saveText='Not saved';showStatus('');}
  else if(world?.arena){connectionText=world.arena.lab?'Weapon lab':'Battle arena';saveText=world.arena.lab?'The lab is not saved':'Arena runs are not saved';showStatus('');}
  else if(world?.dungeon){connectionText=mode==='solo'?'Dungeon run':connectionText||'Connected to camp';saveText='Dungeon runs are not saved';showStatus('');}
  else if(mode==='solo'){connectionText='Expedition saved locally';saveText='Saved on this browser';showStatus('Expedition saved locally');}
  else{connectionText=connectionText||'Connected to camp';saveText=mode==='guest'?'Kept by the host':'Saved on this browser';}
  if(mode!=='guest'){world.start();save();}lastEnd='';showShowcase(!!world?.showcase&&!world?.homestead);homestead?.show(!!world?.homestead);announce(world?.homestead?'The homestead. Pick a tool below, then tap or drag across the ground.':world?.dungeon?dungeonWelcome():world?.arena?.lab?'The weapon lab. Any weapon, any rank; spawn foes whenever you like.':world?.arena?'The arena. Choose your first weapon.':world?.showcase?'An empty clearing. Spawn whatever you want to see.':world?.mode==='vigil'?(dayOf(world)===1&&world.time<5?'The Vigil begins. One fire, one save, as long as you can keep it.':'The vigil goes on. The fire remembers you.'):dayOf(world)===1?'Welcome to the Hollow Harvest.':'The fire remembers you.');
  document.body.classList.toggle('arena',!!world?.arena);document.body.classList.toggle('lab',!!world?.arena?.lab);document.body.classList.toggle('dungeon',!!world?.dungeon);document.body.classList.toggle('homestead',!!world?.homestead);pickPending=null;arenaMarkup='';hotbarSig='';attackSig='';skillSig='';
  showLab(!!world?.arena?.lab);
}
async function goHome(){
  leaveArena();
  save();endContextHold();resetInput();inventoryPanel?.cancelDrag();await network?.stop();network=null;mode='front';room='';paused=false;remotePaused=false;linkLost=false;showcaseTool='';cancelPlacement();cancelMaintenance();clearSelection();closeSheet();showShowcase(false);homestead?.show(false);document.body.classList.remove('homestead');$('game').hidden=true;$('end-screen').hidden=true;$('front').hidden=false;showFrontPanel('home-panel');$('connection-banner').hidden=true;document.body.classList.remove('playing','boss');setBusy(false);showStatus('');syncSaveOption();syncVigilHint();demoWorld();
  void checkForUpdate();
}
function demoWorld(){world=new World(20261031);world.addPlayer('host','Wanderer',character);world.players[0].x=2;world.players[0].z=2;world.buildings.push(world.structure('chest',-2.5,1),world.structure('bench',3,-1),world.structure('lantern',-4,-1));world.time=RULES.day+13;renderer.focus.set(0,0,0);lastEvent=0;renderer.lastEvent=0;}
function setBusy(value){busy=value;for(const id of ['mode-expedition','mode-join','host','join','solo','continue','showcase','homestead','arena','lab','dungeon','dungeon-solo','dungeon-host','vigil','vigil-solo','vigil-host']){const el=$(id);if(el)el.disabled=value;}}
function makeNetwork(){return createNetwork({identity,getWorld:()=>world,onFrame:data=>{const previous=world.status,wasDeep=!!world.dungeon;world=World.restore(data);dirty=true;if(!!world.dungeon!==wasDeep&&!$('room-panel').hidden)roomLabels();if(mode==='guest'&&world.status==='playing'&&previous!=='playing'){if(previous==='lobby')enterGame();else{$('end-screen').hidden=true;lastEnd='';}}},onReady:id=>{localId=id;setBusy(false);showStatus('Connected. Waiting for the host.');showFrontPanel('room-panel');$('launch').hidden=true;$('room-code').textContent=room;$('room-note').textContent='The host will start when everyone is ready.';},onStatus:showStatus,onPause:value=>{remotePaused=value;$('connection-banner').hidden=!value;$('connection-banner').textContent='Host is away • the expedition is paused';},onLeave:text=>{endContextHold();resetInput();cancelPlacement();cancelMaintenance();linkLost=true;paused=true;setBusy(false);if($('game').hidden){$('room-panel').hidden=true;$('home-panel').hidden=false;showStatus(text,true);}else{$('connection-banner').textContent=text;$('connection-banner').hidden=false;showStatus(text,true);openSheet('menu');}}});}
async function hostCamp(dungeon=null,vigil=null){
  if(busy)return;if(dungeon&&(typeof dungeon!=='object'||(typeof Event!=='undefined'&&dungeon instanceof Event)))dungeon=null;if(typeof vigil!=='string')vigil=null;setBusy(true);sound.unlock();storeProfile();showStatus(dungeon?'Opening the dungeon doors…':vigil?'Lighting the vigil fire…':'Opening the camp…');
  try{prepareWorld(!dungeon&&!vigil&&$('host-save').checked,dungeon,vigil);world.status='lobby';mode='host';network=makeNetwork();room=await bounded(network.host());if(!room)return;showFrontPanel('room-panel');roomLabels();$('room-code').textContent=room;$('launch').hidden=false;$('room-note').textContent='Friends can also join after you start.';showStatus('Camp ready');dirty=true;setBusy(false);}
  catch(error){await network?.stop();network=null;mode='front';setBusy(false);showStatus(`Could not open the camp. ${error.message} Solo play is always available.`,true);}
}
/** The waiting-camp panel speaks of the woods or of the dungeon, whichever the host opened. */
function roomLabels(){const deep=!!world?.dungeon;$('launch').innerHTML=deep?'Descend <span>→</span>':'Enter the woods <span>→</span>';$('room-heading').textContent=deep?'Deeper together.':'Better together.';$('room-lede').textContent=deep?'Invite your friends, then take the stairs down.':'Invite your friends, then enter the woods.';}
async function joinCamp(){
  if(busy)return;setBusy(true);sound.unlock();storeProfile();room=$('room-input').value.trim().toUpperCase();showStatus('Following the lanterns…');
  try{world=new World();mode='guest';network=makeNetwork();await bounded(network.join(room,$('player-name').value,character));}catch(error){await network?.stop();network=null;mode='front';setBusy(false);showStatus(error.message,true);}
}
function solo(resume=false,vigil=null){sound.unlock();storeProfile();try{prepareWorld(resume,null,vigil);mode='solo';room='';enterGame();}catch(error){showStatus(error.message,true);}}
/** Title screen: the Vigil panel. A kept vigil shows its record; ending it takes two taps. */
let vigilConfirm=0;
function showVigilPanel(open){
  showFrontPanel(open?'vigil-panel':'home-panel');vigilConfirm=0;
  if(open)paintVigilPanel();
}
function paintVigilPanel(){
  const doc=readStored(SAVE_KEYS.vigil),plan=doc?vigilPlan():null,kept=!!doc;
  const del=$('vigil-delete');del.hidden=!kept;del.classList.toggle('confirming',vigilConfirm>0);del.textContent=vigilConfirm>0?'Tap again to end it forever':'End this vigil…';
  $('vigil-solo').innerHTML=kept?'Continue the vigil <span>→</span>':'Begin the vigil <span>→</span>';
  $('vigil-host').innerHTML=kept?'Keep it with friends <span>↗</span>':'Begin with friends <span>↗</span>';
  $('vigil-solo').disabled=$('vigil-host').disabled=busy||(kept&&!plan?.ok);
  if(!kept){$('vigil-save').innerHTML='';return;}
  if(!plan?.ok){$('vigil-save').innerHTML=`<b>This vigil could not be opened</b>${escapeHtml(plan?.message||'The save was kept on this browser.')}`;return;}
  const w=plan.save.world,clock=w.mode==='vigil'?{cycle:430}:{cycle:RULES.cycle},day=Math.floor((Math.max(0,(w.time||0)-(w.below||0)))/clock.cycle)+1;
  const host=(w.players||[]).find(q=>q.id==='host')||w.players?.[0],saga=w.saga||{},dread=Math.floor(saga.dread||1),bosses=(saga.king||0)+(saga.briar||0)+(saga.eye||0);
  const when=Number.isFinite(doc.savedAt)?new Date(doc.savedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
  $('vigil-save').innerHTML=`<b>${escapeHtml(host?.name||'Wanderer')}’s vigil</b>Kept on this browser${when?` · last ${escapeHtml(when)}`:''}${w.dungeon?' · resting in a delve':''}<div class="vigil-stats"><span><b>${day}</b>DAY</span><span><b>${dread}</b>DREAD</span><span><b>${host?.level||1}</b>LEVEL</span><span><b>${bosses}</b>BOSSES</span><span><b>${w.omensDone||0}</b>OMENS</span></div>`;
}
function deleteVigil(){
  if(!readStored(SAVE_KEYS.vigil))return;
  if(!vigilConfirm){vigilConfirm=setTimeout(()=>{vigilConfirm=0;paintVigilPanel();},4000);paintVigilPanel();return;}
  clearTimeout(vigilConfirm);vigilConfirm=0;
  try{localStorage.removeItem(SAVE_KEYS.vigil);}catch{}
  showStatus('The vigil is over. Its fire is out.');paintVigilPanel();syncVigilHint();
}
function syncVigilHint(){const doc=readStored(SAVE_KEYS.vigil),hint=$('vigil-hint');if(!hint)return;if(!doc){hint.textContent='Endless save';return;}const w=doc.world||{},day=Math.floor((Math.max(0,(w.time||0)-(w.below||0)))/430)+1;hint.textContent=`Day ${day} · dread ${Math.floor(w.saga?.dread||1)}`;}
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
/** Homestead: a calm clearing to build and farm on the grid (homestead.mjs). Free building, no creatures. Not saved. */
function startHomestead(){
  sound.unlock();storeProfile();
  world=new World((Math.random()*0xffffffff)>>>0,{showcase:true,homestead:true});
  const p=world.addPlayer('host',$('player-name').value,character);
  // Supplies for when free building is switched off in the options.
  for(const [id,n] of [['wood',40],['stone',40],['fiber',20],...Object.values(CROPS).map(c=>[c.seed,12])])world.give(p,id,n);
  mode='solo';room='';showcaseTool='';cancelPlacement();cancelMaintenance();clearSelection();
  enterGame();
}
/** Battle arena: solo waves in a small round clearing. Not saved. */
function startArena(){
  sound.unlock();storeProfile();
  world=new World((Math.random()*0xffffffff)>>>0,{arena:true});
  world.addPlayer('host',$('player-name').value,character);
  mode='solo';room='';cancelPlacement();cancelMaintenance();clearSelection();
  if(zoomBeforeArena==null){zoomBeforeArena=renderer.zoom;renderer.setZoom(ARENA_ZOOM);}
  enterGame();
}
/** Dungeons: a run through freshly carved floors, alone. Not saved. */
function startDungeon(variant=dungeonPick){
  sound.unlock();storeProfile();
  try{prepareWorld(false,{variant:isVariant(variant)?variant:null});mode='solo';room='';enterGame();}catch(error){showStatus(error.message,true);}
}
function dungeonWelcome(){const status=dungeonStatus(world);return status?`Floor ${status.depth} · ${status.name}. Find the Warden and take the stairs down.`:'';}
/** Title screen: the Dungeons panel, with a card for each variation. */
function showDungeonPanel(open){
  showFrontPanel(open?'dungeon-panel':'home-panel');
  if(!open)return;
  $('dungeon-floors').innerHTML=[{id:'',name:'Any depths',blurb:'A new variation on every floor.'},...VARIANTS].map(v=>`<button type="button" class="dungeon-floor" data-variant="${v.id}" aria-pressed="${dungeonPick===v.id}"><b>${escapeHtml(v.name)}</b><small>${escapeHtml(v.blurb)}</small></button>`).join('');
}
/** Weapon lab: the arena without rounds. Any weapon at any rank; foes on demand; a damage meter. */
function startLab(){
  sound.unlock();storeProfile();
  world=new World((Math.random()*0xffffffff)>>>0,{lab:true});
  const p=world.addPlayer('host',$('player-name').value,character);
  labEquip(world,p,'starfall',labRankPick);
  mode='solo';room='';cancelPlacement();cancelMaintenance();clearSelection();labOpen='arsenal';labSheetCache='';labBarCache='';
  if(zoomBeforeArena==null){zoomBeforeArena=renderer.zoom;renderer.setZoom(ARENA_ZOOM);}
  enterGame();
}
function showLab(open){
  const panel=$('lab-panel');if(!panel)return;
  panel.hidden=!open;if(!open){labOpen='';labSheetCache='';labBarCache='';labMeterCache='';return;}
  paintLab(true);
}
/** Lab strip, meter and the open panel. Rebuilt only when their markup changes, so taps are never lost. */
function paintLab(force=false){
  const panel=$('lab-panel');if(!panel||panel.hidden||!world?.arena?.lab)return;
  const p=me();if(!p)return;
  const strip=labStripMarkup({open:labOpen}),meter=labMeterMarkup(world);
  if(force||strip!==labBarCache){labBarCache=strip;$('lab-strip').innerHTML=strip;}
  if(force||meter!==labMeterCache){labMeterCache=meter;$('lab-meter').innerHTML=meter;}
  const sheetEl=$('lab-sheet');
  const html=labOpen==='arsenal'?arsenalMarkup(p,{rank:labRankPick,icon}):labOpen==='foes'?foesMarkup(world,{type:labFoe,count:labCount,formation:labFormation,autoAttack}):'';
  sheetEl.hidden=!html;
  if(html&&(force||html!==labSheetCache)){const scroll=sheetEl.scrollTop;labSheetCache=html;sheetEl.innerHTML=`<header><b>${labOpen==='arsenal'?'Arsenal':'Foes'}</b><button type="button" data-lab="panel:close" aria-label="Close">✕</button></header><div class="lab-body">${html}</div>`;sheetEl.scrollTop=scroll;}
}
function labCommand(value){
  const p=me();if(!p||!world?.arena?.lab)return;
  const [key,arg]=value.split(':');
  if(key==='panel'){labOpen=arg==='close'||labOpen===arg?'':arg;}
  else if(key==='equip'){labEquip(world,p,arg,labRankPick);skillSig='';hotbarSig='';attackSig='';}
  else if(key==='rank'){labRankPick=Number(arg)||1;labRank(world,p,labRankPick);skillSig='';hotbarSig='';toast(`Rank ${'★'.repeat(labRankPick)}`);}
  else if(key==='level'){labLevel(world,p,(p.level||1)+Number(arg));}
  else if(key==='strength'){labStrength(world,(world.arena.wave||1)+Number(arg));}
  else if(key==='foe')labFoe=arg;
  else if(key==='count')labCount=Number(arg)||1;
  else if(key==='formation')labFormation=arg;
  else if(key==='spawn'){const made=labSpawn(world,p,{type:labFoe,count:labCount,formation:labFormation});if(!made)toast('The lab is full · clear some foes');}
  else if(key==='clear'){labClear(world);toast('The lab is clear');}
  else if(key==='reset')labResetStats(world);
  else if(key==='toggle'){if(arg==='auto'){autoAttack=!autoAttack;storeProfile();}else labToggle(world,arg);}
  dirty=true;paintLab(true);
}
function leaveArena(){
  showLab(false);document.body.classList.remove('lab','dungeon');
  $('arena-pick').hidden=true;pickPending=null;arenaMarkup='';document.body.classList.remove('arena');
  if(zoomBeforeArena!=null){renderer.setZoom(zoomBeforeArena);zoomBeforeArena=null;}
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
    return {...base,hp:entity.hp,maxHp:entity.maxHp,fuel:entity.fuel||0,level:entity.level||1,open:!!entity.open,charges:entity.charges??0,planted:!!entity.planted,growth:entity.growth||0,resting:!!p.rest,sleeping:p.sleep===entity.id,inRoom:entity.type==='bed'&&!!world.tiles&&!!roomOfBuilding(world,entity),phase:phaseOf(world),hunger:p.hunger,delve:!!(world.surface&&entity.fixed),canAwaken:entity.type==='hearth'&&entity.level<HEARTH_MAX&&world.canPay(p,world.upgradeCost()),maxLevel:HEARTH_MAX,mend:entity.type==='hearth'?mendPlan(p,world.canPay(p,MEND.cost)):null,busy:!!(lock&&lock.ownerId!==localId),...(entity.type==='cart'?cartFacts(world,p,entity):{})};
  }
  if(target.kind==='crop')return {...base,i:entity.i,j:entity.j,crop:entity.crop};
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
function openFieldBuild(){catalog={source:'field',stationId:null,stationType:null,tab:'build'};category='all';catalogPick='';openSheet('catalog');}
function openStationCatalog(panel){catalog={source:'station',stationId:panel.stationId,stationType:panel.stationType,tab:panel.tab};category='all';catalogPick='';openSheet('catalog');}
function openRefine(stationId){const p=me();refining={stationId,itemId:p?.equipment?.weapon?.itemId||carriedWeapons(p)[0]||null,pending:-1,fresh:-1};openSheet('refine');}
/** Roll (or reroll) a slot of the weapon type shown in the Refine panel. */
async function refineSlot(slot){
  const p=me();if(!p||refining.pending>=0||!refining.itemId||!Number.isInteger(slot))return;
  const itemId=refining.itemId;refining.pending=slot;refining.fresh=-1;dirty=true;renderSheet();
  const result=await send({type:'refine',stationId:refining.stationId,itemId,slot});
  refining.pending=-1;if(result?.ok&&refining.itemId===itemId){refining.fresh=slot;setTimeout(()=>{if(refining.fresh===slot){refining.fresh=-1;dirty=true;}},1600);}dirty=true;renderSheet();
}
function toggleInventory(){if(sheet==='inventory'||sheet==='chest')closeSheet();else openSheet('inventory');}
function toggleFieldBuild(){if(world?.homestead&&homestead){if(sheet)closeSheet();homestead.openTab('camp');return;}if(sheet==='catalog'&&catalog.source==='field')closeSheet();else openFieldBuild();}
async function runAction(action){
  if(!action)return;
  if(!action.enabled){if(action.disabledReason)toast(action.disabledReason);return;}
  if(action.id==='cancel'){if(placement)cancelPlacement();else cancelMaintenance();dirty=true;return;}
  if(action.id==='place'){await confirmPlace();return;}
  if(action.id==='open'){await openChest(action.targetId);return;}
  if(action.panel){const result=await send(action.command);if(result?.ok){if(action.panel.sheet==='refine')openRefine(action.panel.stationId);else openStationCatalog(action.panel);}return;}
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
function selectKey(key){const loc=stackByKey(me(),key);if(!loc?.stack)return;const same=selection?.uid===loc.stack.uid;if(!same){pendingOp=null;qtyMode='all';chosenQty=loc.stack.quantity;}selection={uid:loc.stack.uid,key:loc.key,where:loc.where};refresh();}
function containerInfo(p,loc){if(loc.where==='pack')return p.inventory;if(loc.where==='equipment')return {id:containerId('equipment',p.id),revision:p.equipmentRevision};if(loc.where==='recovery')return p.recovery;if(loc.where==='chest')return chestBuilding()?.store||null;if(loc.where==='overflow')return chestBuilding()?.overflow||null;return null;}
async function withPending(cmd){actionPending=true;refresh();const result=await send(cmd);actionPending=false;if(selection&&!locateUid(me(),selection.uid))clearSelection();refresh();return result;}
async function commitMove(from,to,quantity,{insert=false}={}){
  const p=me();if(!p||!from?.stack||!to||to.where==='recovery'||to.where==='overflow'||actionPending)return;
  const source=containerInfo(p,from),dest=containerInfo(p,to);if(!source||!dest)return;
  const chestSide=from.where==='chest'||to.where==='chest'||from.where==='overflow';
  const cmd={type:chestSide?'chestTransfer':'inventoryMove',sourceContainerId:source.id,sourceSlot:from.slot,destinationContainerId:dest.id,destinationSlot:insert?null:to.slot,uid:from.stack.uid,quantity,sourceRevision:source.revision,destinationRevision:dest.revision};
  if(chestSide){if(!chestSession)return;Object.assign(cmd,chestSession);}
  selection=null;pendingOp=null;
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
  if(op!=='store'&&op!=='stack'&&op!=='sort')return;
  const type=op==='store'?'chestStoreAll':op==='stack'?'chestStack':'chestSort';
  const cmd={type,chestId:chestSession.chestId,sessionId:chestSession.sessionId,destinationRevision:chest.store.revision};
  if(type==='chestStoreAll'||type==='chestStack')cmd.inventoryRevision=p.inventory.revision;
  await withPending(cmd);
}
async function operate(op){
  const p=me();if(!p||actionPending)return;
  if(!selection)return;
  const loc=locateUid(p,selection.uid);if(!loc?.stack){clearSelection();dirty=true;return;}
  if(actionNeedsCount(op,loc.stack.quantity)&&pendingOp!==op){pendingOp=op;qtyMode='all';chosenQty=loc.stack.quantity;refresh();return;}
  if(actionNeedsConfirm(op)&&pendingOp!==op){pendingOp=op;refresh();return;}
  const captured={uid:loc.stack.uid,socket:loc.socket,where:loc.where,quantity:chosenQuantity(loc.stack),itemId:loc.stack.itemId};
  if(itemActionClearsSelection(op)){selection=null;pendingOp=null;}
  if(op==='drop'){
    const cmd={type:'dropItem',uid:captured.uid,quantity:captured.quantity,inventoryRevision:p.inventory.revision};
    if(captured.where==='equipment')cmd.equipmentRevision=p.equipmentRevision;
    await withPending(cmd);return;
  }
  if(op==='equip'){await withPending({type:'equipItem',uid:captured.uid,socket:equipmentSlotFor(captured.itemId),inventoryRevision:p.inventory.revision,equipmentRevision:p.equipmentRevision});return;}
  if(op==='unequip'){await withPending({type:'unequipItem',uid:captured.uid,socket:captured.socket,inventoryRevision:p.inventory.revision,equipmentRevision:p.equipmentRevision});return;}
  if(op==='dismantle'){
    const cmd={type:'dismantleItem',uid:captured.uid,inventoryRevision:p.inventory.revision};
    if(captured.where==='equipment')cmd.equipmentRevision=p.equipmentRevision;
    await withPending(cmd);return;
  }
  if(op==='eat'||op==='heal'){await withPending({type:'consumeItem',uid:captured.uid,inventoryRevision:p.inventory.revision});return;}
  if(op==='take'){await commitMove(loc,{where:'pack',slot:0,stack:null},captured.quantity,{insert:true});return;}
  if(op==='transfer'){
    const chest=chestBuilding();if(!chest||!chestSession)return;
    const dest=captured.where==='chest'||captured.where==='overflow'?{where:'pack',slot:0,stack:null}:{where:'chest',slot:0,stack:null};
    await commitMove(loc,dest,captured.quantity,{insert:true});
  }
}
function onQuantity(op){const loc=selection&&locateUid(me(),selection.uid);if(!loc?.stack||!pendingOp)return;qtyMode=op==='inc'||op==='dec'?'set':op;chosenQty=adjustQuantity(loc.stack.quantity,chosenQuantity(loc.stack),op);void operate(pendingOp);}
function onShift(key){selectKey(key);if(!chestSession||!selection)return;pendingOp=null;qtyMode='all';const loc=locateUid(me(),selection.uid);if(loc)void operate('transfer');}
function activateSelection(){if(!selection)return;if(pendingOp){void operate(pendingOp);return;}const loc=locateUid(me(),selection.uid);if(!loc?.stack)return;const ops=operationsFor({itemId:loc.stack.itemId,where:loc.where,chestOpen:!!chestSession});const preferred=['transfer','equip','eat','heal','take','unequip'].find(op=>ops.includes(op));if(preferred)void operate(preferred);}
function ensurePanel(){
  if(inventoryPanel?.root?.isConnected)return;
  discardPanel();
  inventoryPanel=createInventoryPanel($('sheet-content'),{onSlot:(key,empty)=>void onSlot(key,empty),onSelect:selectKey,onMove:(from,to)=>void moveKeys(from,to),onOperate:op=>void operate(op),onQuantity,onShift,onPackSort:()=>void sortPack(),onChestOrganize:op=>void organizeChest(op),onActivate:activateSelection,onDragChange(){endContextHold();hold.attack=false;stick={x:0,z:0};}});
  sheetMarkup='';
}
/** Hover text for an item: trinkets say what they do, weapons their mastery. */
function itemTip(stack){
  const p=me(),m=masteryView(world,p,stack.itemId),mods=refineLines(p,stack.itemId);
  if(m||mods.length)return [label(stack.itemId),m?weaponAbout('',m,null):'',...mods].filter(Boolean).join('\n');
  return trinketTip(stack.itemId,p);
}
/** The inventory's detail line for a selected stack: name, rarity and what it does. */
function itemInfo(stack){
  const tip=itemTip(stack),lines=tip?tip.split('\n'):[label(stack.itemId)],item=ITEMS[stack.itemId],eq=EQUIPMENT[stack.itemId];
  const facts=[];
  if(item?.food)facts.push(`+${item.food} hunger`);
  if(item?.heal)facts.push(`${item.heal>0?'+':''}${item.heal} health`);
  if(item?.courage)facts.push(`${item.courage>0?'+':''}${item.courage} courage`);
  if(eq?.damage)facts.push(`${eq.damage} damage`);
  const max=stackMaxDurability(stack.itemId);
  if(max&&typeof stack.durability==='number'&&max<999)facts.push(`condition ${Math.ceil(stack.durability)}/${max}`);
  const rarity=rarityOf(stack.itemId);
  lines.splice(1,0,[rarity[0].toUpperCase()+rarity.slice(1),...facts].join(' · '));
  return lines.join('\n');
}
function makeCell(key,stack,kind,index,mark=''){
  const equipped=kind==='socket'&&!!stack;
  const name=stack?label(stack.itemId):mark;
  const maxDurability=stack?stackMaxDurability(stack.itemId):null;
  return {key,stack,mark,maxDurability,equipped,accept:kind!=='recovery',selected:!!(stack&&selection?.uid===stack.uid),tip:stack?itemTip(stack):'',iconHTML:stack?icon(stack.itemId):'',aria:slotLabel({empty:!stack,name,quantity:stack?.quantity||0,durability:stack?.durability??null,maxDurability,equipped,index,kind:kind==='socket'?'socket':kind})};
}
function inventoryView(p){
  const chest=chestBuilding();
  // The second trinket socket shows locked until it opens (trinkets.mjs unlockCharm).
  const sockets=EQUIPMENT_SLOTS.map(slot=>slot==='charm'&&!p.charmOpen&&!p.equipment.charm?{...makeCell(`socket:${slot}`,null,'socket',0,'Locked'),locked:true,accept:false,aria:`Second trinket socket, locked. Opens at level ${CHARM.level}, or when a Warden or the Hollow King falls`}:makeCell(`socket:${slot}`,p.equipment[slot], 'socket', 0, SOCKET_NAME[slot]));
  const slots=p.inventory.slots.map((stack,index)=>makeCell(`pack:${index}`,stack,'pack',index));
  const recovery=(p.recovery?.slots||[]).flatMap((stack,index)=>stack?[makeCell(`recovery:${index}`,stack,'recovery',index)]:[]);
  let chestView=null;
  if(sheet==='chest'){
    if(!chest)chestView={pending:true,slots:[],overflow:[],occupied:0,slotMax:CHEST_SLOT_COUNT};
    else{
      const slots=chest.store.slots.map((stack,index)=>makeCell(`chest:${index}`,stack,'chest',index));
      const overflow=(chest.overflow?.slots||[]).flatMap((stack,index)=>stack?[makeCell(`overflow:${index}`,stack,'overflow',index)]:[]);
      chestView={pending:chestOpening||actionPending,slots,overflow,occupied:chest.store.slots.filter(Boolean).length,slotMax:chest.store.slots.length,name:chest.type==='cart'?'Cart':'Chest'};
    }
  }
  const loc=selection?locateUid(p,selection.uid):null;
  let detail=null;
  if(loc?.stack){
    const where=loc.where;
    const ops=operationsFor({itemId:loc.stack.itemId,where,chestOpen:!!chestSession});
    detail={name:label(loc.stack.itemId),chosen:chosenQuantity(loc.stack),maxQuantity:loc.stack.quantity,ops,pendingOp,confirmText:pendingOp==='dismantle'?salvageText(loc.stack.itemId):'',info:itemInfo(loc.stack)};
  }
  const sprite=theme.sprites[p.character]||theme.sprites.ember;
  return {portraitHTML:`${portrait(p.character)}<small>${escapeHtml(p.name)}</small>`,occupied:p.inventory.slots.filter(Boolean).length,slotMax:p.inventory.slots.length,charm:!!p.charm,sockets,slots,recovery,chest:chestView,selection:detail,pending:actionPending||chestOpening,pendingText:chestOpening?'Opening chest…':actionPending?'Waiting for camp…':'',sprite};
}
const SOCKET_NAME={chop:'Chop',mine:'Mine',weapon:'Weapon',body:'Armor',light:'Light',head:'Head',back:'Back',trinket:'Trinket',charm:'Trinket II',bag:'Bag'};
function guideHTML(){
  const steps=[
    ['Gather before dusk','Move with the left stick, or tap the ground. Tap a tree or rock to walk over and harvest it. Hold the action until it falls. Wood and flint land on the ground. Stay beside a pile and it comes to you; step onto it and it is picked up at once. Walk away and it stays where it fell. Grass, berries, pumpkins, and mushrooms go into your pack.'],
    ['Build a workbench','Open Build and place a workbench. It does not need another station. Stand at it and press Craft to make an axe and a pick, then Equip them in Inventory. A tool in your pack does nothing until it is worn. Cauldrons, soul lanterns, and wards are on the workbench Build list.'],
    ['Keep the fire alive','Feed the Heartfire from its Feed button. Cook opens that fire’s recipes. Firelight restores courage; darkness drains it, then your health. A Light button appears when you carry a usable lantern. Soul lanterns never go out.'],
    ['Eat, farm, recover','Open Inventory, select the food, and press Eat. A burning fire cooks pumpkins, mushrooms, and meat. A cauldron cooks stew. Plant a farm with a seed, then harvest it when it is ready. Bedrolls heal by day and spend hunger. By day the Heartfire’s light mends anyone standing in it a few seconds after their last wound, faster at each level.'],
    ['Tend the camp','Build lists only what you can place from where you opened it. Choose Maintain camp to repair a damaged structure or hold Dismantle. The Heartfire cannot be dismantled. A chest someone else has open cannot be dismantled either. A hushing stone, built at the workbench, sings the woods to sleep round it: no creature rises or comes hunting within 18 paces, so you can build in peace. Raids and moons still come. Two at most.'],
    ['Share a chest','One wanderer opens a chest at a time. Your pack has twelve slots; a bag worn in the bag socket adds more (a forager’s satchel six, a delver’s haversack twelve, both made at the workbench). A chest has twenty-four. Store all moves what fits from your pack. Stack fills piles the chest already holds. Sort orders a chest or your pack and stacks matching piles. Choose a quantity, then Transfer, or tap the destination slot. Close the panel to let someone else in.'],
    ['Stand together','Your weapon aims itself; hold Attack to swing. Keep three weapons on the hotbar and tap one to swap. Dodge stores two charges, and each one cools on its own: the next charge starts only after the previous one returns. Every creature marks its blow on the ground before it lands: step or Dodge out of it, or dodge just as it lands to slip through untouched. Armor absorbs damage only while worn. Hold Revive beside a fallen friend for three seconds. Everyone has one last-chance charm. Fallen wanderers return at dawn if the camp survives.'],
    ['Explore for treasure','The hollow is vast. Beyond the meadow lie the Autumn Woods and the Graveyard; farther still the Hollow Mire, the Moonshard Crags and the Barrow Fields. Crates, iron-bound chests, moonlit coffers and hollow reliquaries hide out there: hold Open beside one. Better caches sit farther from camp, and guardians watch them. Caches refill after a few days.'],
    ['Brave the frontier','The outer regions punish the unprepared, and every wanderer needs their own answer. The Hollow Mire’s spore fog drains courage, then health: wear a glowcap mask, made from blooms that sprout in the Autumn Woods only after dark. The Moonshard Crags are pitch dark even by day: only your own lit grave lantern, fed by wisp essence that drifts over the Graveyard at night, holds the dark back. The Barrow Fields’ grave-chill slows you: a bone-lined barrow cloak keeps it out. Masks and cloaks wear only inside their region.'],
    ['Grow stronger','Kills, caches, gathering and new regions give experience. Each level adds health and damage. Loot comes in five rarities: common, uncommon, rare, epic and legendary. Bows fire arrows at the nearest foe, staffs throw bursting bolts, broadswords cleave, and the Grimoire of Ash burns everything around you. Heartstones raise your health for good.'],
    ['Wear two trinkets','Trinkets are small relics that each bend one rule. Wear one in the trinket socket; the second socket opens at level 10, or when a Warden or the Hollow King falls while you stand. Some pairs resonate and do something new together: a trinket’s tooltip names its partners, and the chips under your health light up and name the pair. The Hollow mirror strengthens whatever you wear beside it.'],
    ['Refine your weapons','Creatures drop Dread ichor, and only creatures: briarlings now and then, wraiths, bonewalkers and boglings more often, gravekeepers, golems and the Hollow King by the handful. Stand at a workbench and press Refine: each weapon holds three modifiers, each rolled with a rarity from common to legendary, from sharper crits and faster swings to an extra arrow or star. Reroll any of them with more ichor. Like mastery, refinement is yours, not the item’s. Spare gear can be dismantled from Inventory: loot melts into ichor (more the rarer it is), crafted gear gives back half its materials.'],
    ['Outlast the night','Every night is harder than the last, with more creatures and elder champions. Guard the Heartfire: losing it ends the expedition (in the Vigil it is rekindled instead). How many nights can you survive?'],
    ['Go down into the dungeons','Dungeons on the title screen is a crawl of its own, alone or with up to three friends. Every floor is carved fresh: the Barrow Crypt, the Rootwarren and the Moonlit Ossuary each build theirs differently. Chambers wake as you come near; clear them, open their caches and find the Warden by the stairs. Slay it and the stairs open: the whole party stands in them to go down. Shrines bless you once a floor, the camp fire mends you and its workbench refines your weapons. Fallen friends rise when the Warden falls. Every fifth floor, the Hollow King waits. Weapons never wear down there, and a run is never saved: how deep can you go?'],
    ['Read the moon','Tap the moon beside the clock to see tonight’s moon and the next. Under a waxing moon the woods raid your fire in waves. A new moon brings no raid but a darker night: the time to gather what only grows in the dark. A rare blood moon brings the Hollow King, stronger each time he returns, and more waves than any other night. Whatever the moon, creatures stalk anyone who wanders far from the fire after dark, more often deeper in the hollow.'],
    ['The rare moons','Now and then a rare moon rises. Under a gilded moon there is no raid: golden creatures heavy with treasure appear out in the dark and run from you. Catch them before dawn. Under star rain the waves are smaller, but stars fall all night: each impact is marked on the ground first, hurts whatever stands under it, creatures too, and often leaves star-iron, embers or ichor behind.'],
    ['Seek the new places','Every hollow hides three places somewhere new. Frostmere is a frozen lake you slide across: you keep your speed and turn slowly, so plan your dodges; rime crystals stand round the ice. The Ashen Scar is a burnt crater pooled with lava, where the ground erupts under you every few seconds: lure creatures onto the vents, and mine emberglass. Rime and emberglass awaken the Heartfire to its fourth and fifth levels.'],
    ['Wake the great bosses','Mother Briar sleeps on the Briar Throne, a lair walled in thorn on the wild edge of the hollow with one gate facing home: step inside and she wakes. The Sunken Stair, somewhere in the outer regions, leads down a delve of five floors; The Unblinking waits on the last. The whole party gathers at the stair to go down, the hollow’s clock stops while you are below, and the camp fire on any floor takes everyone back up. Both bosses come back stronger, and the first time each falls it drops its own legendary weapon.'],
    ['Follow the omens','Omens are rare, about one every day and a half, and they are marked on your map, with an arrow on the minimap’s edge when they are far. A fallen star is sealed until its guardians, led by an elder, all fall. A soul rift pours out four waves before it seals, the last led by a great elder. A lonely chest might have teeth. A witch’s cauldron gives one sip each, a blessing or a hex until the dawn after next. A golden pumpkin holds a heartstone. Each one you complete is an Omen fulfilled: a hoard (often an epic, sometimes a legendary), experience for everyone near, and a tally kept for the hollow.'],
    ['Keep the Vigil','The Vigil on the title screen is one save kept for as long as you like, in a slot of its own that only its own Delete button clears. Days and nights run longer, and the hollow grows with you instead of the days: its Dread rises with your highest level, the best gear you have held and every boss you slay. A fallen fire is rekindled a level lower, a fallen party wakes by it, and your last-chance charm comes back each dawn.'],
  ];
  return `<p class="guide-intro">The woods are unkind.<br>Your friends don’t have to be.</p>${steps.map(([title,text],index)=>`<div class="guide-step"><b>${String(index+1).padStart(2,'0')}</b><div><h3>${title}</h3><p>${text}</p></div></div>`).join('')}<div class="key-help"><span>WASD / arrows · Move</span><span>E · Context action</span><span>Space · Attack</span><span>Shift · Dodge</span><span>R · Swap weapon</span><span>I · Inventory</span><span>B · Build</span><span>F · Lantern</span><span>M · Map</span><span>1–4 · More actions</span><span>Esc · Menu</span></div><p class="muted small">The host saves the expedition automatically. Continue it alone, or host the saved expedition to open a new camp. Keep the host’s tab open during co-op; switching away pauses everyone.</p>`;
}
function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
function isFullscreen(){return !!fullscreenElement();}
function syncFullscreenUi(){
  const button=$('front-fullscreen');
  if(button){const on=isFullscreen();button.classList.toggle('is-on',on);button.setAttribute('aria-label',on?'Exit fullscreen':'Fullscreen');button.title=on?'Exit fullscreen':'Fullscreen';}
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
  const camp=room?`Camp ${escapeHtml(room)}`:world?.dungeon?'Dungeon run':world?.arena?.lab?'Weapon lab':world?.arena?'Battle arena':world?.homestead?'Homestead':world?.showcase?'Showcase':'Solo expedition';
  const auto=world?.arena||world?.dungeon?`<div class="menu-row"><span>Auto-attack</span><button type="button" data-command="auto" aria-pressed="${autoAttack}">${autoAttack?'On':'Off'}</button></div>`:'';
  return `<div class="menu-row"><span>Camp</span><b>${camp}</b></div><div class="menu-row"><span>Connection</span><b>${escapeHtml(connectionText||'On this device')}</b></div><div class="menu-row"><span>Save</span><b>${escapeHtml(saveText||(mode==='guest'?'Kept by the host':'Not saved yet'))}</b></div><div class="menu-row"><span>Sound</span><button type="button" data-command="sound">${sound.enabled?'On':'Off'}</button></div>${auto}<div class="menu-row"><span>Fullscreen</span><button type="button" data-command="fullscreen">${isFullscreen()?'Exit fullscreen':'Fullscreen'}</button></div>${fullscreenNote?`<p class="muted small">${escapeHtml(fullscreenNote)}</p>`:''}<div class="menu-row"><span>Camera distance</span><div><button type="button" data-command="zoom-out" aria-label="Zoom out">−</button><button type="button" data-command="zoom-in" aria-label="Zoom in">+</button></div></div><div class="menu-actions"><button type="button" class="primary" data-command="resume">Back to the woods</button>${room?'<button type="button" data-command="invite">Copy camp invite ↗</button>':''}${mode!=='guest'&&!world?.arena&&!world?.dungeon&&!world?.showcase?'<button type="button" data-command="save">Save expedition</button>':''}<button type="button" data-command="guide">Read the field guide</button><button type="button" data-command="home">${world?.arena?'Leave the arena':world?.dungeon?'Leave the dungeon':'Save & return to title'}</button></div><p class="muted small" style="margin-top:18px">${mode==='guest'?'The host keeps the shared save. Your progress is part of their expedition.':'Progress is saved on this browser. The host must keep this tab open for friends to play.'}</p>`;
}
function replaceContent(html){
  const content=$('sheet-content');
  if(inventoryPanel?.root?.isConnected||content.dataset.kind!==sheet||html!==sheetMarkup){
    const scroll=content.scrollTop,same=content.dataset.kind===sheet,tiles=same?content.querySelector('.craft-tiles')?.scrollTop||0:0;
    discardPanel();
    content.innerHTML=html;
    content.dataset.kind=sheet;
    sheetMarkup=html;
    content.scrollTop=scroll;
    // The recipe tiles scroll on their own: keep their place when a pick or a craft repaints them.
    if(tiles){const box=content.querySelector('.craft-tiles');if(box)box.scrollTop=tiles;}
  }
}
function setTabs(html){if(html!==tabsMarkup){$('sheet-tabs').innerHTML=html;tabsMarkup=html;}}
function renderSheet(){
  if(!sheet)return;
  const p=me();
  let title='',kicker='THE WANDERER’S COMPANION';
  if(sheet==='guide'){title='A field guide';kicker='FIELD NOTES';setTabs('');replaceContent(guideHTML());}
  else if(sheet==='menu'){title=world?.arena||world?.dungeon?'Catch your breath':'By the fire';kicker=world?.arena?'ARENA PAUSED':world?.dungeon&&mode==='solo'?'THE DEEP WAITS':mode==='solo'?'EXPEDITION PAUSED':linkLost?'CONNECTION CLOSED':'THE EXPEDITION CONTINUES';setTabs('');replaceContent(menuHTML());}
  else if(sheet==='map'){
    const deep=dungeonStatus(world);
    title=deep?deep.name:world.arena?'The arena':'The Hollow Harvest';kicker=deep?`FLOOR ${deep.depth} · ${deep.cleared} OF ${deep.total} CHAMBERS CLEARED`:world.arena?`WAVE ${Math.max(1,world.arena.wave)} · ${waveLeft(world)} FOES LEFT`:`DAY ${dayOf(world)} · SHARED EXPLORATION`;setTabs('');
    const place=p?REGIONS[world.regionOf?world.regionOf(p.x,p.z):regionAt(p.x,p.z)]?.name:'';const found=p?.regions?.length||1;
    const swatch=(color,text)=>`<span class="swatch" style="background:${color}"></span>${text}`;
    if(deep)replaceContent(`<canvas id="full-map" width="600" height="600" aria-label="Dungeon floor map"></canvas><p class="map-legend">● Wanderers &nbsp; <span style="color:#f2c14e">▼</span> Stairs down &nbsp; <span style="color:#bfe0ff">✧</span> Shrine &nbsp; <span style="color:#e0776b">●</span> Warden<br>${swatch(RARITY_COLORS.common,'Crate')} ${swatch(RARITY_COLORS.rare,'Iron-bound chest')} ${swatch(RARITY_COLORS.epic,'Moonlit coffer')} ${swatch(RARITY_COLORS.legendary,'Reliquary')}<br>${escapeHtml(deep.objective)}. Deepest floor this run: ${deep.best}.</p>`);
    else if(world.arena)replaceContent(`<canvas id="full-map" width="600" height="600" aria-label="Arena map"></canvas><p class="map-legend">● You &nbsp; <span style="color:#e0776b">●</span> Creatures &nbsp; <span style="color:#f2c14e">●</span> The Hollow King</p>`);
    else replaceContent(`<canvas id="full-map" width="600" height="600" aria-label="Explored world map"></canvas><p class="map-legend">✦ Heartfire &nbsp; ● Wanderers &nbsp; ◆ Camp &nbsp; <span style="color:#e0776b">●</span> Guardians<br>${swatch(RARITY_COLORS.common,'Crate')} ${swatch(RARITY_COLORS.rare,'Iron-bound chest')} ${swatch(RARITY_COLORS.epic,'Moonlit coffer')} ${swatch(RARITY_COLORS.legendary,'Reliquary')}<br>${place?`You are in ${escapeHtml(place)}. `:''}Regions discovered: ${found} of 6.<br>Danger and treasure grow the farther you travel from the Heartfire.</p>`);
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
      return {id,name:label(resultId),desc:recipe.desc,icon:icon(resultId),action:model.action,reason:world.recipeReason(p,id,catalog.stationId)||'',costs:Object.entries(recipe.cost).map(([itemId,need])=>{const have=world.available(p,itemId,recipe.kind==='build');return {have,need,name:label(itemId),short:have<need,icon:icon(itemId)};})};
    });
    catalogPick=pickRecipe(recipes,catalogPick)?.id||'';
    replaceContent(catalogMarkup({recipes,maintain:model.maintain,pendingId:catalogPending,pickId:catalogPick}));
  }else if(sheet==='refine'){
    title='Refine';kicker='WORKBENCH · WEAPON MODIFIERS';
    const weapons=carriedWeapons(p);
    if(!weapons.includes(refining.itemId))refining.itemId=weapons[0]||null;
    setTabs(refineTabs(weapons.map(itemId=>({itemId,name:label(itemId),count:refinesOf(p,itemId).length})),refining.itemId));
    const view=refining.itemId?refineView(p,refining.itemId,{have:world.available(p,REFINE_CURRENCY),canPay:cost=>world.canPay(p,cost)}):null;
    replaceContent(refineMarkup(view,{icons:{weapon:view?icon(view.itemId):'',ichor:icon(REFINE_CURRENCY)},pending:refining.pending,fresh:refining.fresh}));
  }else if(sheet==='inventory'||sheet==='chest'){
    const cart=sheet==='chest'&&chestBuilding()?.type==='cart';
    title=sheet==='chest'?(cart?'Hand cart':'Chest'):'Inventory';
    kicker=sheet==='chest'?(cart?'YOUR PACK AND THIS CART':'YOUR PACK AND THIS CHEST'):'WORN GEAR AND PACK';
    setTabs('');ensurePanel();inventoryPanel.update(inventoryView(p));
  }
  $('sheet-title').textContent=title;$('sheet-kicker').textContent=kicker;
}
function drawMap(canvas,full=false){
  if(!canvas)return;
  const ctx=canvas.getContext('2d'),size=canvas.width,R=RULES.radius,N=EXPLORE_SIZE,cell=EXPLORE_CELL;ctx.clearRect(0,0,size,size);ctx.fillStyle='#282733';ctx.fillRect(0,0,size,size);
  if(world.dungeon){drawDungeonMap(ctx,size,full);return;}
  if(world.arena){
    // The arena map is the whole disc: where the swarm is thick, and where the champions are.
    const AR=world.radius,scale=size/(AR*2+2),sx=x=>x*scale+size/2,sz=z=>z*scale+size/2;
    ctx.fillStyle='#4f4757';ctx.beginPath();ctx.arc(size/2,size/2,(AR-1)*scale,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e0776b99';ctx.lineWidth=2;ctx.stroke();
    for(const e of world.enemies){if(!(e.hp>0)||isMagicAlly(e))continue;const big=['king','golem','brute'].includes(e.type);ctx.fillStyle=e.type==='king'?'#f2c14e':big?'#ff9a6b':'#e0776b';ctx.beginPath();ctx.arc(sx(e.x),sz(e.z),(big?3.6:2.2)*(full?2:1),0,Math.PI*2);ctx.fill();}
    for(const q of world.players.filter(q=>q.online)){ctx.fillStyle=CHARACTERS.find(c=>c.id===q.character)?.color||'#f4e3b2';ctx.strokeStyle='#27222e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(q.x),sz(q.z),(q.id===localId?4.5:3.5)*(full?2:1),0,Math.PI*2);ctx.fill();ctx.stroke();}
    return;
  }
  const explored=new Set(world.explored);
  const me_=world.player(localId)||world.players[0]||{x:0,z:0};
  // Full map shows the whole hollow; the minimap is a 34-unit window around you.
  const span=full?R*2+4:68,scale=size/span,cx=full?0:me_.x,cz=full?0:me_.z;
  const sx=x=>(x-cx)*scale+size/2,sz=z=>(z-cz)*scale+size/2,vis=(x,z)=>Math.abs(x-cx)<span/2+cell&&Math.abs(z-cz)<span/2+cell;
  const ground=exploredGround(world.seed,theme.palette,world.explored,N,cell);if(ground){ctx.imageSmoothingEnabled=true;ctx.drawImage(ground,sx(-R),sz(-R),N*cell*scale,N*cell*scale);}
  const known=e=>explored.has(Math.floor((e.z+R)/cell)*N+Math.floor((e.x+R)/cell));
  const cacheColor={crate:RARITY_COLORS.common,ironchest:RARITY_COLORS.rare,moonchest:RARITY_COLORS.epic,reliquary:RARITY_COLORS.legendary};
  for(const n of world.nodes){
    if(!(known(n)||revealsCache(me_,n,world))||!vis(n.x,n.z))continue;
    if(isCache(n.type)){const x=sx(n.x),y=sz(n.z),r=full?4.5:5;ctx.globalAlpha=n.ready?.35:1;ctx.fillStyle=cacheColor[n.type];ctx.strokeStyle='#1e1624';ctx.lineWidth=1.5;ctx.fillRect(x-r,y-r*.7,r*2,r*1.4);ctx.strokeRect(x-r,y-r*.7,r*2,r*1.4);ctx.globalAlpha=1;continue;}
    if(!full||n.ready||!nodeAwake(n,world))continue;
    ctx.fillStyle=n.type==='tree'?'#374f48':['grave','ore','shardrock'].includes(n.type)?'#d2c5d7':n.type==='pumpkin'?'#e8ae72':'#c1b993';ctx.beginPath();ctx.arc(sx(n.x),sz(n.z),1.6,0,Math.PI*2);ctx.fill();
  }
  paintMapMarks(ctx,world,{sx,sz,vis,known,full,me:me_,size,clock:performance.now()/1000});
  for(const e of world.enemies){if(!e.guardOf||!known(e)||!vis(e.x,e.z))continue;ctx.fillStyle='#e0776b';ctx.beginPath();ctx.arc(sx(e.x),sz(e.z),full?1.8:2.4,0,Math.PI*2);ctx.fill();}
  for(const b of world.buildings){if(b.type!=='hearth'&&!known(b))continue;let x=sx(b.x),y=sz(b.z);if(b.type==='hearth'&&!full){x=clamp(x,8,size-8);y=clamp(y,8,size-8);}else if(!vis(b.x,b.z))continue;ctx.fillStyle=b.type==='hearth'?'#ffdda0':'#c4b096';const r=b.type==='hearth'?6:4;ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();ctx.fill();}
  for(const q of world.players.filter(q=>q.online)){if(!vis(q.x,q.z))continue;ctx.fillStyle=CHARACTERS.find(c=>c.id===q.character)?.color||'#f4e3b2';ctx.strokeStyle='#27222e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(q.x),sz(q.z),q.id===localId?5:3.8,0,Math.PI*2);ctx.fill();ctx.stroke();}
  if(full){ctx.strokeStyle='#d8c29a44';ctx.lineWidth=1;ctx.beginPath();ctx.arc(sx(0),sz(0),R*scale,0,Math.PI*2);ctx.stroke();ctx.font='13px monospace';ctx.fillStyle='#e0caaa';ctx.textAlign='center';ctx.fillText('N',size/2,16);ctx.font='11px Georgia';ctx.fillText('HEARTFIRE',sx(0),sz(0)+18);}
}
/** A floor image, one pixel per cell (cached per floor). The map shows only what the party has walked near. */
let floorImage=null;
function floorCanvas(L){
  if(floorImage?.key===L.key)return floorImage.canvas;
  const canvas=document.createElement('canvas');canvas.width=L.w;canvas.height=L.h;const c=canvas.getContext('2d'),tones=floorTones(L),img=c.createImageData(L.w,L.h);
  for(let k=0;k<L.w*L.h;k++){const hex=L.cells[k]===1?tones.floor[k]:L.cells[k]===2?tones.wall[k]:null;if(!hex)continue;const n=parseInt(hex.slice(1),16);img.data[k*4]=(n>>16)&255;img.data[k*4+1]=(n>>8)&255;img.data[k*4+2]=n&255;img.data[k*4+3]=255;}
  c.putImageData(img,0,0);floorImage={key:L.key,canvas};return canvas;
}
function drawDungeonMap(ctx,size,full){
  const L=layoutOf(world);if(!L)return;const d=world.dungeon,me_=world.player(localId)||world.players[0]||{x:0,z:0};
  const span=full?Math.max(L.w,L.h)+6:44,scale=size/span,cx=full?0:me_.x,cz=full?0:me_.z;
  const sx=x=>(x-cx)*scale+size/2,sz=z=>(z-cz)*scale+size/2;
  ctx.fillStyle='#1c1922';ctx.fillRect(0,0,size,size);
  const image=floorCanvas(L),C=4,N=74,R=N*C/2,explored=new Set(world.explored);ctx.imageSmoothingEnabled=false;
  // The explored grid (4-unit cells) reveals the floor image piece by piece.
  for(const k of explored){const gx=k%N,gz=(k-gx)/N,x=gx*C-R,z=gz*C-R;const i=Math.max(0,Math.floor(x-L.ox)),j=Math.max(0,Math.floor(z-L.oz)),i1=Math.min(L.w,Math.floor(x+C-L.ox)),j1=Math.min(L.h,Math.floor(z+C-L.oz));if(i1<=i||j1<=j)continue;ctx.drawImage(image,i,j,i1-i,j1-j,sx(L.ox+i),sz(L.oz+j),(i1-i)*scale+.6,(j1-j)*scale+.6);}
  const seen=(x,z)=>explored.has(Math.floor((z+R)/C)*N+Math.floor((x+R)/C));
  const cacheColor={crate:RARITY_COLORS.common,ironchest:RARITY_COLORS.rare,moonchest:RARITY_COLORS.epic,reliquary:RARITY_COLORS.legendary};
  for(const n of world.nodes){if(!seen(n.x,n.z)&&!revealsCache(me_,n,world))continue;const x=sx(n.x),y=sz(n.z),r=full?4.5:4;ctx.globalAlpha=n.ready?.3:1;ctx.fillStyle=cacheColor[n.type]||'#d8d2c2';ctx.strokeStyle='#1e1624';ctx.lineWidth=1.5;ctx.fillRect(x-r,y-r*.7,r*2,r*1.4);ctx.strokeRect(x-r,y-r*.7,r*2,r*1.4);ctx.globalAlpha=1;}
  if(L.shrine&&seen(L.shrine.x,L.shrine.z)){ctx.fillStyle=d.shrine?'#6f7c91':'#bfe0ff';ctx.font=`${full?20:15}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✧',sx(L.shrine.x),sz(L.shrine.z));}
  if(seen(L.portal.x,L.portal.z)||d.phase==='open'){ctx.fillStyle=d.phase==='open'?'#f2c14e':'#8a7f8c';ctx.font=`${full?20:15}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('▼',sx(L.portal.x),sz(L.portal.z));}
  for(const e of world.enemies){if(!(e.hp>0)||isMagicAlly(e)||!e.warden)continue;ctx.fillStyle='#e0776b';ctx.beginPath();ctx.arc(sx(e.x),sz(e.z),full?6:4.5,0,Math.PI*2);ctx.fill();}
  if(!full)for(const e of world.enemies){if(!(e.hp>0)||isMagicAlly(e)||e.warden||distance(e,me_)>14)continue;ctx.fillStyle='#e0776b99';ctx.beginPath();ctx.arc(sx(e.x),sz(e.z),2.2,0,Math.PI*2);ctx.fill();}
  for(const q of world.players.filter(q=>q.online)){ctx.globalAlpha=q.ghost?.45:1;ctx.fillStyle=CHARACTERS.find(c=>c.id===q.character)?.color||'#f4e3b2';ctx.strokeStyle='#27222e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(q.x),sz(q.z),(q.id===localId?5:3.8)*(full?1.3:1),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.globalAlpha=1;}
}
/** The clock in a dungeon: the floor, the variation, and how much of the floor is cleared. */
function paintDungeonClock(){
  const s=dungeonStatus(world);if(!s)return;
  $('region-name').textContent=s.phase==='open'?'THE STAIRS ARE OPEN':`${s.short} · ${s.cleared}/${s.total}`;
  $('day-number').textContent=`FLOOR ${String(s.depth).padStart(2,'0')}`;
  const track=$('day-track');if(track.dataset.stops!=='dungeon'){track.dataset.stops='dungeon';track.style.background='linear-gradient(90deg,#4f4a6e,#9d8fd0 70%,#f2c14e)';}
  $('day-progress').style.left=`${clamp(s.phase==='open'?1:s.cleared/Math.max(1,s.total),0,1)*100}%`;
}
function paintVital(key,value,name){const bar=$(`${key}-bar`);if(!bar)return;const amount=clamp(value,0,100);bar.style.width=`${amount}%`;const row=bar.closest('[role="progressbar"]');if(!row)return;const shown=String(Math.ceil(amount));row.setAttribute('aria-valuenow',shown);row.setAttribute('aria-label',`${name} ${shown}`);}
function paintClock(){
  const clock=scheduleOf(world),dayEnd=clock.day/clock.cycle*100,duskEnd=(clock.day+clock.dusk)/clock.cycle*100,track=$('day-track');
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
  // Dungeons: the camp's bench refines and crafts, its fire cooks; nothing is built, fed or taken apart.
  const shown=world?.dungeon?actions.filter(action=>action&&!['build','repair','feed','dismantle'].includes(action.id)):actions;
  liveActions=shown;
  CONTEXT_BUTTONS.forEach((id,index)=>paintAction($(id),shown[index]||null,modeName));
  const combat=allowsCombat(modeName);
  for(const id of ['attack','dodge','skill']){const el=$(id);if(!el)continue;el.classList.toggle('is-off',!combat);el.tabIndex=combat?0:-1;el.setAttribute('aria-hidden',combat?'false':'true');}
  const light=p&&showsLantern(modeName)?usableLantern(p):null;
  const lantern=$('lantern-button');
  lantern.classList.toggle('is-off',!light);lantern.tabIndex=light?0:-1;lantern.setAttribute('aria-hidden',light?'false':'true');
  if(light){lantern.classList.toggle('is-lit',light.lit);lantern.setAttribute('aria-label',`Lantern, ${light.lit?'lit':'unlit'}, fuel ${Math.ceil(light.fuel*100)} percent`);const circle=lantern.querySelector('circle');if(circle){const span=(94.2*light.fuel).toFixed(2);circle.setAttribute('stroke-dasharray',`${span} 94.2`);}}
  const weary=!p||(p.dashCharges??0)<1||(!world.arena&&p.stamina<DASH.stamina)||p.down||p.ghost;$('dodge').classList.toggle('is-disabled',!combat||weary);
  $('hotbar-inventory').classList.toggle('active',sheet==='inventory'||sheet==='chest');
  $('hotbar-build').classList.toggle('active',sheet==='catalog'&&catalog.source==='field');
}
/** The potion shortcut always reflects the draughts currently carried in the pack. */
function paintPotion(p){
  // Pending is left out of the look on purpose: the button must not flicker or go dead while another action settles.
  const el=$('hotbar-potion'),view=potionHotbar(p,{mode:currentMode(),arena:!!world?.arena,pending:false});
  const low=p&&p.hp/maxHealth(p)<.35&&!!view.command;
  const sig=`${view.itemId}:${view.quantity}:${!!view.command}:${low}`;
  if(el.dataset.state===sig)return;el.dataset.state=sig;
  el.innerHTML=`${icon(view.itemId)}<b class="potion-count" aria-hidden="true">${view.quantity}</b><small>Potion</small>`;
  el.classList.toggle('is-disabled',!view.command);el.classList.toggle('is-low',low);
  el.setAttribute('aria-disabled',String(!view.command));
  el.setAttribute('aria-label',`Drink Vigor draught, ${view.quantity} potions available (H)`);
  el.title=view.quantity?'Drink Vigor draught (H) · Restore 60 health and 20 courage':'No potions · Craft Vigor draughts at a workbench';
}
/**
 * The potion answers on press (pointerdown), so it works while the other thumb steers.
 * A short guard keeps a spammed tap from drinking two; a stale pack (loot picked up mid-fight) retries once.
 */
let potionAt=0;
async function drinkPotion(){
  const now=performance.now();if(now-potionAt<450)return;
  const p=me(),view=potionHotbar(p,{mode:currentMode(),arena:!!world?.arena,pending:false});
  if(!view.command){if(!world?.arena&&!p?.down&&!p?.ghost)toast(view.quantity?'You cannot drink right now':'No potions · Brew Vigor draughts at a cauldron');return;}
  if(actionPending)return;
  potionAt=now;
  const result=await withPending(view.command);
  if(result?.code==='staleRevision'){const again=potionHotbar(me(),{mode:currentMode(),arena:!!world?.arena,pending:false});if(again.command)await withPending(again.command);}
}
/** Weapon icons, mastery, condition and refinements, repainted only when changed. */
function paintHotbar(p){
  const slots=hotbarView(p).map(slot=>({...slot,mastery:slot.itemId?masteryView(world,p,slot.itemId):null,condition:slot.stack&&!world.arena?conditionOf(slot.stack):null}));
  const refined=itemId=>refinesOf(p,itemId).map(entry=>`${entry.mod}${entry.tier}`).join(',');
  const sig=slots.map(slot=>`${slot.itemId||''}:${slot.active?1:0}:${slot.rank}:${slot.mastery?Math.floor(slot.mastery.progress*40):''}:${slot.condition==null?'':Math.ceil(slot.condition*40)}:${slot.itemId?refined(slot.itemId):''}`).join('|')+(world.arena?'a':'');
  if(sig===hotbarSig)return;hotbarSig=sig;
  document.querySelectorAll('#weapon-bar .weapon-slot').forEach((el,i)=>{
    const slot=slots[i];if(!slot)return;
    const m=slot.mastery,rank=m?m.rank:slot.rank;
    el.classList.toggle('active',slot.active);el.classList.toggle('empty',!slot.itemId);el.classList.toggle('mastered',!!m);
    el.classList.toggle('worn',slot.condition!=null&&slot.condition<=MEND.warnAt);el.classList.toggle('broken',slot.condition===0);
    el.innerHTML=slot.itemId?`${icon(slot.itemId)}`
      +(m&&m.to!=null?`<span class="mastery" aria-hidden="true"><em style="width:${(m.progress*100).toFixed(1)}%"></em></span>`:'')
      +((world.arena||m)&&rank>1?`<small class="rank">${rankStars(rank)}</small>`:'')
      +(slot.condition!=null?`<span class="wear" aria-hidden="true"><em style="width:${(slot.condition*100).toFixed(1)}%"></em></span>`:'')
      +(slot.condition===0?'<small class="broken-tag" aria-hidden="true">BROKEN</small>':'')
      +refineGems(p,slot.itemId)
      :'<span aria-hidden="true">+</span>';
    const about=slot.itemId?[weaponAbout(slot.name,m,slot.condition),...refineLines(p,slot.itemId)].filter(Boolean).join(' · '):'';
    el.setAttribute('aria-label',slot.itemId?`${slot.name}${slot.active?', in hand':''}${about?`. ${about}`:''}`:`Empty weapon slot ${i+1}`);
    el.setAttribute('aria-pressed',String(slot.active));el.title=slot.itemId?`${slot.name}${about?`\n${about}`:''}`:'Empty slot';
  });
}
/** One gem per refinement on a hotbar weapon, in its rarity's colour (src/refine.mjs). */
function refineGems(p,itemId){
  const list=refinesOf(p,itemId);if(!list.length)return '';
  return `<span class="refine-gems" aria-hidden="true">${list.map(entry=>`<i class="rarity-${RARITIES[entry.tier]||'common'}"></i>`).join('')}</span>`;
}
/** Mastery and condition in words, for titles and screen readers. */
function weaponAbout(name,m,condition){
  const parts=[];
  if(m)parts.push(m.to==null?`Mastery ${rankStars(m.rank)} (max)`:`Mastery ${rankStars(m.rank)} · ${Math.floor(m.points)} / ${m.to} to ${rankStars(m.rank+1)}`);
  if(condition===0)parts.push('Broken: mend it at the Heartfire');
  else if(condition!=null)parts.push(`Condition ${Math.ceil(condition*100)}%`);
  return parts.join(' · ');
}
/** The attack button shows what you are holding. */
function paintAttack(p){
  const weapon=p.equipment.weapon,sig=weapon?.itemId||'fist';
  if(sig===attackSig)return;attackSig=sig;
  $('attack').innerHTML=weapon?`${icon(weapon.itemId)}<small>Attack</small>`:'⚔<small>Attack</small>';
  $('attack').classList.toggle('armed',!!weapon);
}
function paintDodge(p){
  const el=$('dodge');if(!el||!p)return;
  const charges=clamp(p.dashCharges??DASH.charges,0,DASH.charges);
  const cooling=p.dashRecharge?.[0]||0;
  el.dataset.charges=String(charges);
  el.style.setProperty('--cd',String(charges>=DASH.charges||!(cooling>0)?0:clamp(cooling/DASH.recharge,0,1)));
  const count=el.querySelector('.dodge-count');if(count&&count.textContent!==String(charges))count.textContent=String(charges);
  const label=`Dodge, ${charges} of ${DASH.charges}`;
  if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
}
/** The skill button: the skill of the weapon in hand, its recharge ring, and whether the stamina is there. */
function paintSkill(p){
  const el=$('skill');if(!el||!p)return;
  const info=skillFor(p),block=skillBlock(world,p),sig=`${info?.itemId}|${info?.name}`;
  if(sig!==skillSig){
    skillSig=sig;
    el.innerHTML=`<span class="skill-glyph" aria-hidden="true">✦</span><small>${escapeHtml(info?.name||'Skill')}</small>`;
    el.setAttribute('aria-label',info?`Skill: ${info.name}. ${info.blurb}`:'Skill');el.title=info?`${info.name} (Q) · ${info.blurb}`:'';
  }
  const cd=block==='cooldown'?clamp((p.skillCd||0)/(p.skillMax||info?.cooldown||1),0,1):0;
  el.style.setProperty('--cd',cd.toFixed(3));el.style.setProperty('--fuel',clamp((p.stamina||0)/100,0,1).toFixed(3));
  el.classList.toggle('ready',!block);el.classList.toggle('weary',block==='stamina');el.classList.toggle('cooling',block==='cooldown');
}
function paintArenaClock(){
  const a=world.arena,left=waveLeft(world);
  if(a.lab){
    $('region-name').textContent=`WEAPON LAB · ${left} FOES`;$('day-number').textContent=`WAVE ${String(Math.max(1,a.wave)).padStart(2,'0')}`;
    const track=$('day-track');if(track.dataset.stops!=='lab'){track.dataset.stops='lab';track.style.background='linear-gradient(90deg,#6a4cc8,#f2c14e)';}
    $('day-progress').style.left=`${clamp(labDps(world)/Math.max(1,a.stats?.peak||1),0,1)*100}%`;
    return;
  }
  $('region-name').textContent=a.phase==='fight'?`${left} LEFT`:a.phase==='pick'?'CHOOSE A WEAPON':a.phase==='countdown'?`GET READY · ${Math.max(1,Math.ceil(a.timer))}`:'WAVE CLEARED';
  $('day-number').textContent=`WAVE ${String(Math.max(1,a.wave)).padStart(2,'0')}`;
  const track=$('day-track');if(track.dataset.stops!=='arena'){track.dataset.stops='arena';track.style.background='linear-gradient(90deg,#c6855d,#e0523f)';}
  const done=a.phase==='fight'&&a.total?1-left/a.total:a.phase==='countdown'?0:1;
  $('day-progress').style.left=`${clamp(done,0,1)*100}%`;
}
/** Between arena waves: three weapon cards, then (hotbar full) which weapon to give up. */
function paintArenaPick(p){
  const a=world.arena,panel=$('arena-pick');
  const offers=a&&a.phase==='pick'&&!p.down&&!p.ghost&&sheet!=='menu'&&sheet!=='guide'&&!['victory','defeat'].includes(world.status)?a.offers?.[localId]:null;
  if(!offers){if(!panel.hidden){panel.hidden=true;arenaMarkup='';pickPending=null;}return;}
  const slots=hotbarView(p);
  const sig=JSON.stringify(offers)+'|'+pickPending+'|'+slots.map(slot=>slot.itemId).join();
  if(sig===arenaMarkup&&!panel.hidden)return;arenaMarkup=sig;
  panel.hidden=false;
  $('arena-pick-kicker').textContent=a.wave?`WAVE ${a.wave} CLEARED · LEVEL ${p.level||1}`:'THE ARENA';
  $('arena-pick-title').textContent=a.wave?'Choose a weapon for the next wave':'Choose your first weapon';
  $('arena-offers').innerHTML=offerMarkup(offers,icon);
  const replace=$('arena-replace');
  if(pickPending!=null&&offers[pickPending]){replace.hidden=false;replace.innerHTML=replaceMarkup(slots,icon,offers[pickPending].itemId);$('arena-offers').classList.add('dim');}
  else{replace.hidden=true;replace.innerHTML='';$('arena-offers').classList.remove('dim');}
}
async function choosePick(index){
  const p=me(),offers=world?.arena?.offers?.[localId];if(!p||!offers?.[index])return;
  const full=hotbarView(p).every(slot=>slot.itemId);
  if(!offers[index].owned&&full){pickPending=index;arenaMarkup='';refresh();return;}
  pickPending=null;await send({type:'arenaPick',choice:index});arenaMarkup='';refresh();
}
function cycleWeapon(){
  const p=me();if(!p)return;const slots=hotbarView(p);const at=slots.findIndex(slot=>slot.active);
  for(let k=1;k<=slots.length;k++){const i=((at<0?-1:at)+k+slots.length)%slots.length;if(slots[i].itemId&&!slots[i].active){void send({type:'hotbar',slot:i},{quiet:true});return;}}
}
function ui(){
  maintainChest();
  if($('room-panel')&&!$('room-panel').hidden){$('roster').innerHTML=world.players.filter(p=>p.online).map(p=>`<div class="roster-row">${portrait(p.character)}<span>${escapeHtml(p.name)}</span><small>${p.id==='host'?'HOST':'READY'}</small></div>`).join('')+Array.from({length:Math.max(0,4-world.players.filter(p=>p.online).length)},()=>'<div class="roster-row"><span class="party-dot" style="opacity:.3"></span><span class="muted small">Waiting for a wanderer…</span></div>').join('');}
  const p=me();
  if(!$('game').hidden&&p){
    paintVital('hp',p.hp/maxHealth(p)*100,'Health');$('level-number').textContent=String(p.level||1);const xpPct=clamp((p.xp||0)/xpToNext(p.level||1)*100,0,100);$('xp-ring').style.setProperty('--xp',`${xpPct}%`);$('xp-ring').setAttribute('aria-valuenow',String(Math.round(xpPct)));$('level-chip').setAttribute('aria-label',`Open settings, level ${p.level||1}, ${Math.round(xpPct)} percent to next`);$('region-name').textContent=(REGIONS[world.regionOf?world.regionOf(p.x,p.z):regionAt(p.x,p.z)]?.name||'').toUpperCase();paintVital('hunger',p.hunger,'Hunger');paintVital('courage',p.courage,'Courage');
    $('stamina-bar').style.width=`${p.stamina}%`;
    if(world.arena||world.dungeon){const chip=$('dread-chip');if(chip)chip.hidden=true;}
    if(world.arena)paintArenaClock();
    else if(world.dungeon)paintDungeonClock();
    else{const clock=scheduleOf(world);$('day-number').textContent=`DAY ${String(dayOf(world)).padStart(2,'0')}`;const vs=vigilStatus(world),chip=$('dread-chip');if(chip){chip.hidden=!vs;if(vs){const text=`DREAD ${vs.dread}`;if(chip.textContent!==text)chip.textContent=text;}}
    $('day-progress').style.left=`${(hollowTime(world)%clock.cycle)/clock.cycle*100}%`;
    paintClock();}
    paintHotbar(p);paintPotion(p);paintAttack(p);paintArenaPick(p);paintFeatureHud(featureContext(p));
    $('party').innerHTML=world.players.filter(q=>q.id!==localId).map(q=>`<div class="party-row"><span class="party-dot" style="background:${CHARACTERS.find(c=>c.id===q.character)?.color}"></span><b>${escapeHtml(q.name)}</b><span>${!q.online?'away':q.down?'needs help!':q.ghost?(world.dungeon?'rises with the Warden':'returns at dawn'):''}</span></div>`).join('');
    if(p.noticeAt&&p.noticeAt!==lastNotice){toast(p.notice);lastNotice=p.noticeAt;}
    for(const ev of world.events)if(ev.id>lastEvent){lastEvent=ev.id;if(world.time-ev.at<2){if(['announce','phase'].includes(ev.type))announce(ev.text);if(ev.type==='dread')toast(ev.text);if(ev.type==='omenfulfilled')achievement('OMEN FULFILLED',OMENS[ev.kind]?.name||'',ev.count>1?`${ev.count} omens fulfilled in this hollow`:'The first omen of this hollow');if(ev.type==='rare'&&distance(p,ev)<14)toast(`Found ${ev.text} · ${rarityOf(ev.itemId)}`);if(distance(p,ev)<20||['phase','descend','ascend','bossrise','bossphase','omen','dread','rekindle','riftclose','omenfulfilled'].includes(ev.type))sound.play(ev.type,ev);}}
    $('downed').hidden=!p.down&&!p.ghost;
    if(p.down||p.ghost){$('downed-text').textContent=world.dungeon?(p.charm?'Use your one last-chance charm, or let a friend hold Revive beside you.':p.down?`A friend can hold Revive beside you. ${Math.ceil(p.down)} seconds.`:'You keep your pack. You rise when the Warden falls, or at the next stairs.'):world.arena&&world.players.filter(q=>q.online).length<2?'The swarm has you.':p.charm?'Use your one last-chance charm, or let a teammate hold Revive beside you.':p.down?`A friend can hold Revive beside you. ${Math.ceil(p.down)} seconds until your supplies drop.`:'Your supplies are on the ground. You return at dawn if the camp survives.';$('use-charm').hidden=!p.charm;if(sheet)closeSheet();cancelPlacement();cancelMaintenance();inventoryPanel?.cancelDrag();}
    const boss=world.enemies.find(e=>e.hp>0&&ENEMIES[e.type]?.boss&&distance(p,e)<32)||world.enemies.find(e=>e.type==='king'||(e.warden&&e.hp>0));$('boss-bar').hidden=!boss;document.body.classList.toggle('boss',!!boss);if(boss){$('boss-bar').querySelector('em').style.width=`${boss.hp/boss.maxHp*100}%`;const name=boss.type==='king'?'THE HOLLOW KING':ENEMIES[boss.type]?.boss?`${label(boss.type)}${boss.phase>1?` · ${'I'.repeat(boss.phase)}`:''}`.toUpperCase():`${label(boss.type)} WARDEN`.toUpperCase();const tag=$('boss-bar').querySelector('span');if(tag.textContent!==name)tag.textContent=name;}
    if(placement){
      if(placement.showcase){if(!placement.anchored){placement.x=Math.round((p.x+p.dx*3)*2)/2;placement.z=Math.round((p.z+p.dz*3)*2)/2;}const why=showcasePlaceReason(world,p,placement.kind,placement.key,placement.x,placement.z);placement.valid=!why;placement.reason=why||'';}
      else if(placement.stationId&&!world.buildings.some(b=>b.id===placement.stationId&&b.hp>0)){cancelPlacement();toast('That workbench is gone');}
      else{if(!placement.anchored){placement.x=Math.round((p.x+p.dx*3)*2)/2;placement.z=Math.round((p.z+p.dz*3)*2)/2;}const why=world.canBuild(p,placement.key,placement.x,placement.z,placement.stationId);placement.valid=!why;placement.reason=why||'';}
    }
    if(world?.showcase)paintShowcase();
    if(world?.homestead)homestead?.paint();
    if(world?.arena?.lab)paintLab();
    if(sheet==='catalog'&&catalog.source==='station'){const station=world.buildings.find(b=>b.id===catalog.stationId&&b.hp>0);if(!station||distance(p,station)>=5){closeSheet();toast('Station out of range');}}
    if(sheet==='refine'){const station=world.buildings.find(b=>b.id===refining.stationId&&b.hp>0);if(!station||distance(p,station)>=5){closeSheet();toast('Station out of range');}}
    if(maintenance&&maintenanceTarget&&!world.buildings.some(b=>b.id===maintenanceTarget&&b.hp>0))maintenanceTarget=null;
    paintCluster(currentMode(),p);drawMap($('minimap'));
    if(['victory','defeat'].includes(world.status)&&lastEnd!==world.status){lastEnd=world.status;resetInput();endContextHold();cancelPlacement();cancelMaintenance();closeSheet();save();$('end-screen').hidden=false;const won=world.status==='victory';if(world.dungeon){const top=Math.max(...world.players.map(q=>q.level||1)),d=world.dungeon;$('end-kicker').textContent='THE DEEP KEEPS ITS OWN';$('end-title').textContent=`Fallen on floor ${d.depth}.`;$('end-text').textContent=`${d.stats.floors?`You went down ${d.stats.floors} ${d.stats.floors===1?'flight':'flights'} of stairs`:'The first floor held you'}, cleared ${d.stats.rooms} ${d.stats.rooms===1?'chamber':'chambers'} and opened ${d.stats.caches} ${d.stats.caches===1?'cache':'caches'}. Every floor is carved anew; the next run starts at the top.${world.best?.loot?` Best find: ${label(world.best.loot)}.`:''}`;$('end-stats').innerHTML=`<span><b>${d.depth}</b>FLOOR</span><span><b>${top}</b>LEVEL</span><span><b>${world.kills}</b>FOES</span>`;$('endless').hidden=true;$('new-expedition').hidden=mode==='guest';$('new-expedition').innerHTML='Descend again <span>→</span>';}else if(world.arena){const top=Math.max(...world.players.map(q=>q.level||1)),a=world.arena;$('end-kicker').textContent='THE ARENA FALLS SILENT';$('end-title').textContent=`Fallen on wave ${Math.max(1,a.wave)}.`;$('end-text').textContent=a.best?`You cleared ${a.best} ${a.best===1?'wave':'waves'} and reached level ${top}. Every run starts over; the swarm grows every wave.`:'The first wave took you. Keep moving, and dodge through the glowing warnings.';$('end-stats').innerHTML=`<span><b>${a.best||0}</b>WAVES</span><span><b>${top}</b>LEVEL</span><span><b>${world.kills}</b>FOES</span>`;$('endless').hidden=true;$('new-expedition').hidden=false;$('new-expedition').innerHTML='Fight again <span>→</span>';}else{$('new-expedition').innerHTML='Another expedition →';$('end-kicker').textContent=won?'THE CURSE IS BROKEN':'THE EXPEDITION ENDS';$('end-title').textContent=won?'Morning, at last.':'The last light.';$('end-text').textContent=won?'Five nights in the hollow. One fire kept alive. You made a home where nothing was meant to live.':world.buildings.some(b=>b.type==='hearth')?'The woods claimed every wanderer. A stronger camp and a friend’s helping hand can turn the next night.':'The Heartfire was destroyed. Walls, traps and a well-fed fire will help your next camp endure.';const top=Math.max(...world.players.map(q=>q.level||1));$('end-text').textContent+=world.best?.loot?` Best find: ${label(world.best.loot)}.`:'';$('end-stats').innerHTML=`<span><b>${Math.max(0,dayOf(world)-1)}</b>NIGHTS</span><span><b>${top}</b>LEVEL</span><span><b>${world.kills}</b>FOES</span>`;$('endless').hidden=!won||mode==='guest';$('new-expedition').hidden=mode==='guest';}}
  }
  if(sheet&&dirty)renderSheet();
  dirty=false;
}
/** What the frontier HUD modules (ui/features.mjs) may read and do. */
function featureContext(p){return {world,me:p,localId,mode,send,toast,icon,theme,renderer,sheet,openSheet,closeSheet,refresh,openChest};}
function aimEntity(){
  if(maintenance&&maintenanceTarget)return world.buildings.find(b=>b.id===maintenanceTarget)||null;
  return currentTarget()?.entity||null;
}
/** Title screen wanderer: who (four) and which look (hooded, masked, witch). The id carries both: `moss-mask`. */
function baseOf(id){return CHARACTERS.find(c=>c.id===id)?.base||id;}
function lookOf(id){return CHARACTERS.find(c=>c.id===id)?.look||theme?.choices?.look?.default||'hood';}
function pickWanderer(base,look){
  const id=`${base}-${look}`;if(!CHARACTERS.some(c=>c.id===id))return;
  character=id;if(mode==='front'&&world?.players?.[0])world.players[0].character=character;storeProfile();paintWanderers();
}
/**
 * Portraits are small canvas stills cut from the same decoded sheet the game draws, not the whole sprite
 * sheet as a CSS background: they appear as soon as the sheet is in, every time.
 */
const portraitStills=new Map();
function portraitStill(key){
  const def=theme?.sprites?.[key]||theme?.sprites?.ember;if(!def)return Promise.resolve('');
  let pending=portraitStills.get(key);
  if(!pending){
    pending=loadImage(def.src).then(img=>{
      const cols=def.columns||1,rows=def.rows||1,fw=img.naturalWidth/cols,fh=img.naturalHeight/rows,scale=Math.min(1,180/fh);
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(fw*scale));canvas.height=Math.max(1,Math.round(fh*scale));
      canvas.getContext('2d').drawImage(img,0,0,fw,fh,0,0,canvas.width,canvas.height);return canvas.toDataURL();
    }).catch(()=>{portraitStills.delete(key);return '';});
    portraitStills.set(key,pending);
  }
  return pending;
}
function fillStill(img,key){img.dataset.key=key;void portraitStill(key).then(src=>{if(src&&img.dataset.key===key)img.src=src;});}
function paintWanderers(){
  const base=baseOf(character),look=lookOf(character),bases=CHARACTERS.filter(c=>!c.look);
  const who=$('characters'),how=$('looks');
  if(who.children.length!==bases.length)who.innerHTML=bases.map(c=>`<button class="character" type="button" data-character="${c.id}" aria-label="${c.name}, ${c.detail}"><img class="still" alt="" draggable="false"><small>${c.name}</small></button>`).join('');
  if(how.children.length!==LOOKS.length)how.innerHTML=LOOKS.map(l=>`<button class="look" type="button" data-look="${l.id}" aria-label="${l.name} look"><img class="still" alt="" draggable="false"><small>${l.name}</small></button>`).join('');
  for(const el of who.children){const on=el.dataset.character===base;el.setAttribute('aria-pressed',String(on));fillStill(el.querySelector('img'),`${el.dataset.character}-${look}`);}
  for(const el of how.children){const on=el.dataset.look===look;el.setAttribute('aria-pressed',String(on));fillStill(el.querySelector('img'),`${base}-${el.dataset.look}`);}
}
function setupControls(){
  paintWanderers();
  $('characters').onclick=e=>{const b=e.target.closest('[data-character]');if(!b)return;pickWanderer(b.dataset.character,lookOf(character));};
  $('looks').onclick=e=>{const b=e.target.closest('[data-look]');if(!b)return;pickWanderer(baseOf(character),b.dataset.look);};
  $('mode-expedition').onclick=()=>{if(!busy){syncSaveOption();showFrontPanel('expedition-panel');}};$('expedition-back').onclick=()=>showFrontPanel('home-panel');
  $('mode-join').onclick=()=>{if(!busy){showFrontPanel('join-panel');$('room-input').focus();}};$('join-back').onclick=()=>showFrontPanel('home-panel');
  $('host').onclick=()=>hostCamp();$('join').onclick=joinCamp;$('solo').onclick=()=>solo();$('showcase').onclick=()=>{if(!busy)startShowcase();};$('homestead').onclick=()=>{if(!busy)startHomestead();};$('arena').onclick=()=>{if(!busy)startArena();};$('lab').onclick=()=>{if(!busy)startLab();};$('dungeon').onclick=()=>{if(!busy)showDungeonPanel(true);};$('vigil').onclick=()=>{if(!busy)showVigilPanel(true);};$('vigil-back').onclick=()=>showVigilPanel(false);$('vigil-delete').onclick=deleteVigil;$('vigil-solo').onclick=()=>{if(busy)return;solo(false,readStored(SAVE_KEYS.vigil)?'resume':'new');};$('vigil-host').onclick=()=>{if(busy)return;hostCamp(null,readStored(SAVE_KEYS.vigil)?'resume':'new');};$('dungeon-back').onclick=()=>showDungeonPanel(false);$('dungeon-solo').onclick=()=>{if(!busy)startDungeon();};$('dungeon-host').onclick=()=>hostCamp({variant:isVariant(dungeonPick)?dungeonPick:null});$('dungeon-floors').onclick=e=>{const b=e.target.closest('[data-variant]');if(!b)return;dungeonPick=b.dataset.variant;for(const el of $('dungeon-floors').children)el.setAttribute('aria-pressed',String(el===b));};$('continue').onclick=()=>solo(true);$('launch').onclick=()=>{enterGame();network?.broadcast();};$('cancel-room').onclick=goHome;$('copy-room').onclick=copyInvite;$('front-guide').onclick=()=>openSheet('guide');
  $('front-sound').onclick=()=>{sound.enabled=!sound.enabled;syncSoundButton();sound.unlock();storeProfile();};
  $('close-sheet').onclick=closeSheet;$('level-chip').onclick=()=>{if($('game').hidden)return;sheet==='menu'?closeSheet():openSheet('menu');};$('minimap-button').onclick=()=>sheet==='map'?closeSheet():openSheet('map');
  // Pack, Build and Light answer on release over the same button (pointer events, so a held joystick does not swallow the tap).
  const tools=$('top-tools');let toolPress=null;
  tools.addEventListener('pointerdown',event=>{const button=event.target.closest('button');if(!button)return;event.preventDefault();event.stopPropagation();sound?.unlock();toolPress={id:event.pointerId,button};});
  tools.addEventListener('pointerup',event=>{
    const button=event.target.closest('button'),press=toolPress;toolPress=null;
    if(!button||!press||press.id!==event.pointerId||press.button!==button)return;event.preventDefault();event.stopPropagation();
    if(button.id==='hotbar-inventory')toggleInventory();
    else if(button.id==='hotbar-build')toggleFieldBuild();
    else if(button.id==='lantern-button'){if(usableLantern(me()))void send({type:'lanternToggle'});else toast('Carry a torch or lantern to light the way');}
  });
  tools.addEventListener('pointercancel',()=>{toolPress=null;});
  tools.addEventListener('click',event=>{if(event.detail===0){const button=event.target.closest('button');if(button?.id==='hotbar-inventory')toggleInventory();else if(button?.id==='hotbar-build')toggleFieldBuild();else if(button?.id==='lantern-button'&&usableLantern(me()))void send({type:'lanternToggle'});}});
  // Weapon slots answer on press, like the action buttons: a swap mid-fight must not wait for a click.
  $('weapon-bar').addEventListener('pointerdown',event=>{
    const button=event.target.closest('.weapon-slot');if(!button)return;event.preventDefault();event.stopPropagation();sound?.unlock();
    if(!allowsCombat(currentMode())&&currentMode()!=='inventory')return;
    const slot=Number(button.dataset.slot),view=hotbarView(me())[slot];
    if(!view?.itemId){toast(world?.arena?'Pick weapons between waves to fill this slot':'Carry another weapon to fill this slot');return;}
    if(!view.active)void send({type:'hotbar',slot});
  });
  $('arena-menu').addEventListener('click',event=>{event.stopPropagation();$('arena-pick').hidden=true;arenaMarkup='';openSheet('menu');});
  $('arena-pick').addEventListener('click',event=>{
    const card=event.target.closest('[data-pick]'),choice=event.target.closest('[data-replace]');
    if(card){void choosePick(Number(card.dataset.pick));return;}
    if(!choice)return;const value=choice.dataset.replace;
    if(value==='back'){pickPending=null;arenaMarkup='';refresh();return;}
    const index=pickPending;pickPending=null;arenaMarkup='';
    void send(value==='skip'?{type:'arenaPick',choice:-1}:{type:'arenaPick',choice:index,replace:Number(value)}).then(refresh);
  });$('use-charm').onclick=()=>send({type:'interact'});
  const cluster=$('action-cluster');
  cluster.addEventListener('pointerdown',event=>{
    const button=event.target.closest('button');if(!button||button.classList.contains('is-off'))return;
    event.preventDefault();try{button.setPointerCapture?.(event.pointerId);}catch{}sound?.unlock();
    if(button.id==='attack'){if(!allowsCombat(currentMode()))return;hold.attack=true;captured={pointerId:event.pointerId,kind:'attack'};void send({type:'attack'});return;}
    if(button.id==='skill'){if(!allowsCombat(currentMode()))return;void send({type:'skill'},{quiet:true});return;}
    if(button.id==='dodge'){const actor=me();if(!actor||(actor.dashCharges??0)<1||(!world.arena&&actor.stamina<DASH.stamina)||actor.down||actor.ghost)return;void send({type:'dash'},{quiet:true});return;}
    if(button.id==='hotbar-potion'){void drinkPotion();return;}
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
  $('world').addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};if(homestead?.holding()&&['solo','host','guest'].includes(mode)&&!$('game').hidden&&homestead.down(e,renderer.worldPoint(e.clientX,e.clientY))){try{$('world').setPointerCapture(e.pointerId);}catch{}e.preventDefault();}});
  $('world').addEventListener('pointermove',e=>{if(world?.homestead)homestead?.move(e,renderer.worldPoint(e.clientX,e.clientY));});
  $('world').addEventListener('pointerleave',()=>homestead?.leave());
  $('world').addEventListener('pointercancel',e=>homestead?.up(e));
  $('world').addEventListener('contextmenu',e=>{if(homestead?.holding()){e.preventDefault();homestead.setTool('');}});
  $('world').addEventListener('pointerup',e=>{
    if(homestead?.holding()){homestead.up(e);return;}
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
    if(modeName==='normal'&&homestead?.tap(point))return;
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
    const weapon=event.target.closest('[data-refine-weapon]');
    if(weapon){refining={...refining,itemId:weapon.dataset.refineWeapon,fresh:-1};dirty=true;renderSheet();return;}
    const tab=event.target.closest('[data-tab]');const chip=event.target.closest('[data-category]');
    if(tab){catalog={...catalog,tab:tab.dataset.tab};category='all';dirty=true;renderSheet();}
    if(chip){category=chip.dataset.category;dirty=true;renderSheet();}
  };
  $('sheet-content').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.refineSlot!=null){void refineSlot(Number(button.dataset.refineSlot));return;}
    if(button.dataset.pick){catalogPick=button.dataset.pick;dirty=true;renderSheet();return;}
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
    if(cmd==='auto'){autoAttack=!autoAttack;storeProfile();sheetMarkup='';dirty=true;renderSheet();}
    if(cmd==='fullscreen')void toggleFullscreen();
    if(cmd==='zoom-in')renderer.setZoom(renderer.zoom+.15);if(cmd==='zoom-out')renderer.setZoom(renderer.zoom-.15);
    if(cmd==='maintain'){closeSheet();maintenance=true;maintenanceTarget=null;selected=null;dirty=true;}
  };
  $('new-expedition').onclick=()=>{if(world?.dungeon){const pin=world.dungeon.forced;$('end-screen').hidden=true;lastEnd='';if(mode==='host'){const people=world.players.filter(p=>p.online);world=new World((Math.random()*0xffffffff)>>>0,{dungeon:{variant:pin}});for(const p of people)world.addPlayer(p.id,p.name,p.character);world.start();document.body.classList.add('dungeon');announce(dungeonWelcome());network.broadcast();}else startDungeon(pin||'');return;}if(world?.arena){$('end-screen').hidden=true;lastEnd='';if(world.arena.lab)startLab();else startArena();return;}if(mode==='host'){const people=world.players.filter(p=>p.online);world=new World();for(const p of people)world.addPlayer(p.id,p.name,p.character);world.start();lastEnd='';$('end-screen').hidden=true;network.broadcast();save();}else solo();};
  $('end-home').onclick=goHome;$('endless').onclick=()=>{world.status='playing';world.endless=true;world.bossSpawned=true;lastEnd='';$('end-screen').hidden=true;save();network?.broadcast();};
  window.addEventListener('keydown',event=>{
    if(['INPUT','TEXTAREA'].includes(event.target.tagName)||$('game').hidden||!$('end-screen').hidden)return;
    const key=event.key.toLowerCase();
    if([' ','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key))event.preventDefault();
    if(key==='escape'&&homestead?.holding()&&!sheet){homestead.setTool('');return;}
    if(key==='r'&&homestead?.holding()&&!event.repeat){homestead.rotate();return;}
    if(key==='escape'){
      const step=escapeStep({dragging:!!inventoryPanel?.dragging(),detailsOpen:!!(selection&&(sheet==='inventory'||sheet==='chest')),panel:sheet,placing:!!placement||showcaseTool==='remove',maintaining:maintenance});
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
    if(!$('arena-pick').hidden){
      if(named?.startsWith('action-')){const index=Number(named.slice(7))-1;if(pickPending!=null){if(index<3){const at=pickPending;pickPending=null;arenaMarkup='';void send({type:'arenaPick',choice:at,replace:index}).then(refresh);}}else void choosePick(index);}
      return;
    }
    if(named==='weapon-next'){event.preventDefault();cycleWeapon();return;}
    if(named==='potion'){event.preventDefault();void drinkPotion();return;}
    if(named==='inventory'){if(world?.arena)return;toggleInventory();return;}
    if(named==='build'){if(world?.arena||world?.dungeon)return;toggleFieldBuild();return;}
    if(named==='map'){sheet==='map'?closeSheet():openSheet('map');return;}
    if(named==='lantern'){if(showsLantern(modeName)&&usableLantern(actor))void send({type:'lanternToggle'});return;}
    if((modeName==='downed'||modeName==='ghost')&&actor?.charm&&(key==='e'||key==='enter')){void send({type:'interact'});return;}
    if((named==='confirm'||named==='primary')&&modeName==='placement'){void runAction(keyboardPrimary(liveActions,modeName));return;}
    if(named==='primary'&&(modeName==='normal'||modeName==='maintenance')){
      const primary=keyboardPrimary(liveActions,modeName);if(!primary)return;
      if(primary.activation==='hold'&&primary.enabled)beginContextHold(primary,'key');else void runAction(primary);return;
    }
    if(named==='attack'&&allowsCombat(modeName)){hold.attack=true;void send({type:'attack'});return;}
    if(named==='skill'&&allowsCombat(modeName)){void send({type:'skill'},{quiet:true});return;}
    if(world?.arena?.lab&&(key==='n'||key==='x')){labCommand(key==='n'?'spawn':'clear');return;}
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
/**
 * Arena auto-attack: swing whenever a hostile is within the weapon's reach. The expedition has no
 * auto-attack. It never interrupts a held Gather or Revive.
 */
function autoSwing(modeName){
  if(!(world?.arena||world?.dungeon)||!autoAttack||!allowsCombat(modeName)||hold.act||holdKind)return false;
  const p=me();if(!p||p.down||p.ghost||p.cooldown>.05)return false;
  const reach=world.weaponReach(p);
  return world.enemies.some(e=>e.hp>0&&!isMagicAlly(e)&&distance(e,p)<reach);
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
    attack:allowsCombat(modeName)&&(hold.attack||keys.has(' ')||autoSwing(modeName)),
    target:selected,
  };
  if(playing){paintDodge(me());paintSkill(me());}
  {const p=playing?me():null;hurtFx.update(p,p?maxHealth(p):1,dt);}
  if(mode==='host'||mode==='solo'){world.input(localId,input);if(playing){acc+=dt;let steps=0;while(acc>=RULES.tick&&steps++<4){world.tick();acc-=RULES.tick;}}else acc=0;localClient?.tick();}
  if(networkTime>.075){networkTime=0;if(mode==='guest'&&playing)network?.input(input);if(mode==='host')network?.broadcast();}
  if(saveTime>10){saveTime=0;save();}if(pingTime>3){pingTime=0;network?.ping();}
  if(uiTime>.18){uiTime=0;dirty=true;ui();}
  const target=!$('game').hidden?aimEntity():null;renderer.render(world,localId,dt,{target,placement,demo:$('game').hidden,homestead:!$('game').hidden&&world?.homestead?homestead?.view():null});if(playing)frameFeatureHud(featureContext(me()),dt);requestAnimationFrame(frame);
}
async function init(){
  if(await checkForUpdate())return;
  await loadMagicModules();
  theme=await loadTheme();installMagicSprites(theme);try{renderer=new Renderer($('world'),theme);}catch{renderer=new CanvasRenderer($('world'),theme);}await renderer.preload();sound=new Sound(theme);const prefs=profile();character=CHARACTERS.some(c=>c.id===prefs.character)?prefs.character:'ember';$('player-name').value=String(prefs.name||'Wanderer').slice(0,18);sound.enabled=prefs.sound!==false;autoAttack=prefs.autoAttack!==false;syncSoundButton();
  paintClock();demoWorld();setupControls();paintModeIcons();syncSoundButton();bindFeatureHud(featureContext(null));syncSaveOption();syncVigilHint();const params=new URLSearchParams(location.search);
  const code=params.has('showcase')||params.has('homestead')?'':params.get('camp');if(code){$('room-input').value=code.toUpperCase().slice(0,5);showFrontPanel('join-panel');showStatus('A place by the fire is waiting. Choose a name and join.');}
  homestead=createHomesteadControls({panel:$('homestead-panel'),getWorld:()=>world,me,send,toast,icon,onChange:tool=>{if(tool){cancelPlacement();cancelMaintenance();selected=null;}dirty=true;}});
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
  const labPanel=$('lab-panel');
  labPanel?.addEventListener('pointerdown',event=>event.stopPropagation());
  labPanel?.addEventListener('pointerup',event=>event.stopPropagation());
  labPanel?.addEventListener('click',event=>{event.stopPropagation();const button=event.target.closest('[data-lab]');if(button){sound?.unlock();labCommand(button.dataset.lab);}});
  $('front-fullscreen')?.addEventListener('click',()=>void toggleFullscreen());
  document.addEventListener('fullscreenchange',onFullscreenChange);
  document.addEventListener('webkitfullscreenchange',onFullscreenChange);
  window.addEventListener('popstate',onShowcasePop);
  window.addEventListener('pageshow',()=>void checkForUpdate());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkForUpdate();});
  setInterval(()=>void checkForUpdate(),60000);
  $('loading').hidden=true;$('front').hidden=false;requestAnimationFrame(frame);
  if(params.has('dev')||params.has('showcase')||params.has('homestead')||params.has('arena')||params.has('lab')||params.has('dungeon'))window.__HOLLOWSTEAD__={get world(){return world;},get mode(){return mode;},get sheet(){return sheet;},get placement(){return placement;},get maintenance(){return maintenance;},get uiMode(){return currentMode();},get showcaseTool(){return showcaseTool;},renderer,send,solo,openSheet,save,startShowcase,startArena,startLab,startDungeon,labCommand,setTime(t){world.time=t;},get network(){return network;}};
  if(params.has('showcase'))startShowcase();
  else if(params.has('homestead'))startHomestead();
  else if(params.has('lab'))startLab();
  else if(params.has('arena'))startArena();
  else if(params.has('dungeon'))startDungeon(params.get('dungeon')||'');
}
init().catch(error=>{$('load-status').textContent=`The woods could not be loaded. ${error.message} Try reloading in a browser with WebGL enabled.`;$('loading').querySelector('p').textContent='The lantern went out.';console.error(error);});
