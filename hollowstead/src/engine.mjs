import {RULES, PICKUP, ITEMS, EQUIPMENT, NODES, STRUCTURES, RECIPES, ENEMIES, CHARACTERS, phaseAt, dayAt, label} from './content.mjs?v=harvest-16';
import {
  CLOCK_V2, DROP_LIFETIME_SECONDS, EQUIPMENT_SLOTS, SAVE_VERSION_V2,
  cloneContainer, cloneEquipment, cloneStack, collectLocations, countItem, createBackpack, createChest, createContainer,
  containerId, duplicateUids, emptyEquipment, equipmentSlotFor, findStack, isMaterial,
  itemDefinition, makeStack, planConsume, planEquip, planInsert, planMove, planTake, planUnequip,
  supplyLoad, wearStack,
} from './inventory.mjs?v=harvest-16';
import {repairIdCounter, settleStorage, validateV2World} from './serialization.mjs?v=harvest-16';
import {DISMANTLE_HOLD_SECONDS, INTENTS, inCraftRange, inSupplyChestRange, phaseProgress, remainingNightWaveOffsets} from './contracts.mjs?v=harvest-16';
import {collectLightSources, inSafeLight} from './lighting.mjs?v=harvest-16';
import {pruneChests, releaseChests} from './chests.mjs?v=harvest-16';
import {inventoryIntent} from './transactions.mjs?v=harvest-16';
import {contextActionIds, gatherRate, harvestProfile, stationLabel, stationRule} from './interactions.mjs?v=harvest-16';
import {
  CACHE_GUARDS, CACHE_LAYOUT, DISCOVER_XP, ELITE, GATHER_XP, HEARTSTONE_HP, LIGHT_ITEMS, MAX_LEVEL, NODE_POOLS, REGIONS, RESIDENTS, ROAM, SHARE_RADIUS,
  ARMOR_REDUCTION, LOOT_TABLES, eliteChance, enemyScale, enemyXp, isBossNight, isCache, maxHealth, nightRoster, pickWeighted, powerOf, rarityRank, regionAt, rollLoot,
  tierAt, waveSize, weaponStyle, xpToNext,
} from './progression.mjs?v=harvest-16';
import {ARSENAL, landBlow, preyFor, stepArsenal} from './arsenal.mjs?v=harvest-16';
import {isMagicAlly, magicAttackProfile, magicModuleFor, magicModules, magicSnapshotFields, readPendingBurn, readPendingHit, readPendingKnock, restoreMagicFields} from './magic/registry.mjs?v=harvest-16';

export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot((a.x||0)-(b.x||0),(a.z||0)-(b.z||0));
/** Visual position only. Authoritative drop.x/drop.z stay on the floor. */
export function dropPresentation(drop, world){
  const homeX=drop?.x||0, homeZ=drop?.z||0;
  const actor=id=>typeof world?.player==='function'?world.player(id):world?.players?.find(q=>q.id===id);
  if(drop?.flight&&world){
    const p=actor(drop.flight.playerId);
    const duration=drop.flight.duration>0?drop.flight.duration:PICKUP.flight;
    const t=clamp((world.time-drop.flight.startedAt)/duration,0,1);
    const ease=t*t*(3-2*t);
    if(p)return {x:homeX+(p.x-homeX)*ease, z:homeZ+(p.z-homeZ)*ease, y:Math.sin(Math.PI*ease)*0.55, t:ease};
  }
  if(drop?.attract&&world){
    const p=actor(drop.attract.playerId);
    const dwell=drop.attract.dwell>0?drop.attract.dwell:PICKUP.dwell;
    const u=clamp((drop.attract.elapsed||0)/dwell,0,1);
    const pull=u*u*0.22;
    if(p)return {x:homeX+(p.x-homeX)*pull, z:homeZ+(p.z-homeZ)*pull, y:0, t:0};
  }
  return {x:homeX, z:homeZ, y:0, t:0};
}
/**
 * Render-clock flight. The first sample anchors to the simulation so a join
 * mid-flight does not start on the floor. Later samples keep that anchor, so a
 * snapshot with the same flight.startedAt cannot send the sprite back.
 * The shadow is not lifted; callers draw it at y = 0.
 */
export function createDropMotion(){
  const flights=new Map(), dwells=new Map(), aims=new Map();
  const actor=(world,id)=>typeof world?.player==='function'?world.player(id):world?.players?.find(entry=>entry.id===id);
  const targetOf=(drop,world,bodyOf)=>{
    const id=drop.flight?.playerId||drop.attract?.playerId;
    const shown=typeof bodyOf==='function'?bodyOf(id):null;
    if(shown&&Number.isFinite(shown.x)&&Number.isFinite(shown.z))return {x:shown.x,z:shown.z};
    const body=actor(world,id);
    return body?{x:body.x,z:body.z}:null;
  };
  const aimAt=(key,target,dt)=>{
    if(!target)return null;
    if(!(dt>0)){const snap={x:target.x,z:target.z};aims.set(key,snap);return snap;}
    const prev=aims.get(key);
    if(!prev){const snap={x:target.x,z:target.z};aims.set(key,snap);return snap;}
    const k=Math.min(1,dt*22);
    const next={x:prev.x+(target.x-prev.x)*k,z:prev.z+(target.z-prev.z)*k};
    aims.set(key,next);
    return next;
  };
  function sample(drop,world,clock,dt=0,bodyOf=null){
    const homeX=drop?.x||0, homeZ=drop?.z||0, now=Number.isFinite(clock)?clock:0;
    if(drop?.flight&&world){
      dwells.delete(drop.id);
      const duration=drop.flight.duration>0?drop.flight.duration:PICKUP.flight;
      const simT=clamp((world.time-drop.flight.startedAt)/duration,0,1);
      const key=`${drop.id}:${drop.flight.startedAt}:${drop.flight.playerId}`;
      let state=flights.get(drop.id);
      if(!state||state.key!==key){
        state={key, originClock:now-simT*duration, homeX, homeZ};
        flights.set(drop.id,state);
        aims.delete(drop.id);
      }
      const t=clamp((now-state.originClock)/duration,0,1);
      const ease=t*t*(3-2*t);
      const body=aimAt(drop.id, targetOf(drop,world,bodyOf), dt);
      const y=Math.sin(Math.PI*ease)*0.55;
      if(!body)return {x:state.homeX, z:state.homeZ, y, t:ease};
      return {x:state.homeX+(body.x-state.homeX)*ease, z:state.homeZ+(body.z-state.homeZ)*ease, y, t:ease};
    }
    flights.delete(drop?.id);
    aims.delete(drop?.id);
    if(drop?.attract&&world){
      const dwell=drop.attract.dwell>0?drop.attract.dwell:PICKUP.dwell;
      const elapsed=drop.attract.elapsed||0;
      const simU=clamp(elapsed/dwell,0,1);
      let state=dwells.get(drop.id);
      const visual=state?Math.max(0, now-state.originClock):0;
      if(!state||state.playerId!==drop.attract.playerId||elapsed+0.05<visual){
        state={playerId:drop.attract.playerId, originClock:now-simU*dwell, homeX, homeZ};
        dwells.set(drop.id,state);
        aims.delete(`dwell:${drop.id}`);
      }
      const u=clamp((now-state.originClock)/dwell,0,1);
      const pull=u*u*0.22;
      const body=aimAt(`dwell:${drop.id}`, targetOf(drop,world,bodyOf), dt);
      if(!body)return {x:state.homeX, z:state.homeZ, y:0, t:0};
      return {x:state.homeX+(body.x-state.homeX)*pull, z:state.homeZ+(body.z-state.homeZ)*pull, y:0, t:0};
    }
    if(drop){dwells.delete(drop.id);aims.delete(`dwell:${drop.id}`);}
    return {x:homeX, z:homeZ, y:0, t:0};
  }
  function retain(ids){
    for(const id of [...flights.keys()])if(!ids.has(id)){flights.delete(id);aims.delete(id);}
    for(const id of [...dwells.keys()])if(!ids.has(id)){dwells.delete(id);aims.delete(`dwell:${id}`);}
  }
  return {sample, retain};
}
export function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function biome(x,z){return regionAt(x,z);}
/** Creatures chew through camp structures at half their bite, so a lone explorer's fire survives an early night. */
const STRUCTURE_HIT=.5, HEARTH_HIT=.35;
const structureHit=b=>b.type==='hearth'?HEARTH_HIT:STRUCTURE_HIT;
/** A fed Heartfire spits embers at anything clawing at it: enough for early nights, not for later ones. */
const HEARTH_FLARE={range:3,damage:14,period:1.5};
const rollXp=type=>LOOT_TABLES[NODES[type]?.table]?.xp||10;
/** Explored-map grid: 4-unit cells covering the whole disc. */
export const EXPLORE_CELL=4, EXPLORE_SIZE=Math.ceil(RULES.radius*2/4);
const MAP_CACHE=new Map();
/** Deterministic map for a seed. Cached: guests rebuild the world from snapshots every frame. */
export function makeMap(seed){
  if(!MAP_CACHE.has(seed)){
    if(MAP_CACHE.size>4)MAP_CACHE.clear();
    MAP_CACHE.set(seed, generateMap(seed));
  }
  return MAP_CACHE.get(seed).map(node=>({...node}));
}
function generateMap(seed){
  const rng=random(seed),nodes=[],R=RULES.radius-3,cell=4,grid=new Map();
  const key=(x,z)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
  const free=(x,z,gap)=>{const gx=Math.floor(x/cell),gz=Math.floor(z/cell);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const n of grid.get(`${gx+i},${gz+j}`)||[])if(Math.hypot(x-n.x,z-n.z)<gap)return false;return true;};
  const add=(type,x,z)=>{const node={id:`n${nodes.length}`,type,x,z,hits:NODES[type].hits,ready:0};nodes.push(node);const k=key(x,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(node);return node;};
  // The first clearing guarantees every basic material within a short walk.
  for(const [t,x,z] of [['tree',-4,-3],['tree',-7,1],['rock',4,-3],['grass',-2,3],['grass',3,3],['bush',5,2],['pumpkin',-4,5],['rock',7,-1],['tree',-6,-6],['grass',1,5],['mushroom',-7,5],['crate',9,6]])add(t,x,z);
  // Caches first so they keep their spacing; better tiers farther out.
  for(const {type,count,min,max} of CACHE_LAYOUT){
    let placed=0;
    for(let i=0;i<count*40&&placed<count;i++){
      const a=rng()*Math.PI*2,r=min+Math.sqrt(rng())*(Math.min(max,R)-min),x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(!free(x,z,type==='crate'?6:11))continue;
      add(type,x,z);placed++;
    }
  }
  for(let i=0;i<9000&&nodes.length<1150;i++){
    const x=(rng()-.5)*2*R,z=(rng()-.5)*2*R;
    if(Math.hypot(x,z)>R||Math.hypot(x,z)<7||!free(x,z,2.3))continue;
    const pool=NODE_POOLS[regionAt(x,z)]||NODE_POOLS.meadow;
    add(pool[Math.floor(rng()*pool.length)],x,z);
  }
  return nodes;
}
export class World {
  constructor(seed=(Math.random()*0xffffffff)>>>0, options={}){
    this.version=SAVE_VERSION_V2;this.clock=CLOCK_V2;this.seed=seed;this.time=0;this.status='lobby';this.players=[];
    this.showcase=options?.showcase===true;
    this.nodes=this.showcase?[]:makeMap(seed);
    this.buildings=this.showcase?[]:[this.structure('hearth',0,0)];this.enemies=[];this.drops=[];this.events=[];this.explored=[];
    this.idCounter=1;this.eventId=0;this.wave=0;this.nextSpawn=0;this.kills=0;this.bossSlain=false;this.bossSpawned=false;this.endless=true;this.wipe=0;this.bossNight=0;this.roamTimer=ROAM.interval;this.guardsDay=0;this.projectiles=[];this.allies=[];this.zones=[];this.best={day:1,level:1,loot:null,lootRank:-1};this.ambient=options?.ambient!==false;
    this.networkId=crypto.randomUUID();this.transactionRevision=0;this.chestSessions=new Map();
    this.harvestWork=new Map();this.reviveWork=new Map();this.activations=new Map();this.dismantleHolds=new Map();this.toolNoticeAt=new Map();this.damagedAt=new Map();this.pickupDwell=new Map();this.packNoticeAt=new Map();this.previewUid=1;
    this.stats={gathered:0,built:0,revives:0};this.inputs=new Map();this.rng=random(seed^0x1234);this.spawnRng=random(seed^0x5eed);this.lootRng=random(seed^0x100f);this.discoverTimer=0;
  }
  nextId(prefix){return prefix+(this.idCounter++);}
  nextItemUid(){return `i${this.idCounter++}`;}
  mintStack(itemId, quantity, durability){
    const made=makeStack(this.nextItemUid(), itemId, quantity, durability);
    return made.ok?made.stack:null;
  }
  assertItems(){
    const duplicates=duplicateUids(collectLocations(this));
    if(duplicates.length)throw new Error(`Duplicate item ${duplicates[0]}`);
  }
  structure(type,x,z){
    const id=type==='hearth'?'heart':`b${this.idCounter++}`;
    const store=type==='chest'
      ? createChest(id)
      : createContainer(containerId('chest', id), 0);
    return {id,type,x,z,hp:STRUCTURES[type].hp,maxHp:STRUCTURES[type].hp,fuel:type==='hearth'?150:type==='fire'?100:0,level:1,rotation:0,open:false,charges:3,growth:0,planted:false,store,cooldown:0};
  }
  addPlayer(id,name='Wanderer',character='ember'){
    if(typeof id!=='string'||id.length>64)return null;
    let p=this.players.find(p=>p.id===id);if(p){p.online=true;return p;}
    if(this.players.filter(p=>p.online).length>=RULES.maxPlayers)return null;
    if(this.players.length>=RULES.maxPlayers){const old=this.players.find(p=>!p.online);if(old){this.spillPlayer(old);this.players=this.players.filter(p=>p!==old);}}
    p={id,name:String(name).replace(/[<>\x00-\x1f]/g,'').trim().slice(0,18)||'Wanderer',character:CHARACTERS.some(c=>c.id===character)?character:'ember',x:2+this.players.length*.8,z:1.8,dx:0,dz:1,hp:100,hunger:90,courage:100,stamina:100,inventory:createBackpack(id),equipment:emptyEquipment(),equipmentRevision:0,recovery:null,cooldown:0,dash:0,dashCooldown:0,down:0,ghost:false,revive:0,charm:1,online:true,lantern:false,rest:false,action:'idle',actionUntil:0,notice:'',noticeAt:0,goal:null,level:1,xp:0,bonusHp:0,maxHp:100,regions:['meadow']};
    this.players.push(p);
    this.give(p,'wood',3);this.give(p,'stone',2);this.give(p,'fiber',3);this.give(p,'berry',3);
    if(this.showcase){
      p.hp=100;p.hunger=100;p.courage=100;
      p.inventory.slots=p.inventory.slots.map(()=>null);p.inventory.revision++;
    }
    return p;
  }
  leave(id){releaseChests(this,id);const p=this.player(id);if(p){p.online=false;p.goal=null;this.inputs.delete(id);}}
  player(id){return this.players.find(p=>p.id===id);}
  start(){if(this.status==='lobby')this.status='playing';}
  event(type,x,z,text='',extra={}){this.events.push({id:++this.eventId,type,x,z,text,at:this.time,...extra});if(this.events.length>25)this.events.shift();}
  tell(p,text){p.notice=text;p.noticeAt=++this.eventId;}
  input(id,value){
    const p=this.player(id);if(!p||!p.online||!value||typeof value!=='object')return;
    const x=Number(value.x),z=Number(value.z);if(!Number.isFinite(x)||!Number.isFinite(z))return;
    const l=Math.max(1,Math.hypot(x,z));this.inputs.set(id,{x:x/l,z:z/l,act:value.act===true,attack:value.attack===true,target:typeof value.target==='string'?value.target:null,at:this.time});
    if(Math.hypot(x,z)>.1){p.goal=null;p.rest=false;}
  }
  count(p,itemId){return countItem(p?.inventory, itemId);}
  loadCount(p){return supplyLoad(p?.inventory);}
  hasTool(p,toolId){
    if(!toolId)return false;
    const slot=equipmentSlotFor(toolId),stack=slot&&p.equipment?.[slot];
    return !!(stack&&stack.itemId===toolId&&stack.durability>0);
  }
  owns(p,itemId){
    if(this.count(p,itemId)>0)return true;
    return EQUIPMENT_SLOTS.some(slot=>p.equipment?.[slot]?.itemId===itemId);
  }
  locate(p,uid){
    const pack=findStack(p.inventory, uid);
    if(pack)return {kind:'backpack', container:p.inventory, slot:pack.slot, stack:pack.stack};
    for(const slot of EQUIPMENT_SLOTS)if(p.equipment[slot]?.uid===uid)return {kind:'equipment', slot, stack:p.equipment[slot]};
    if(p.recovery){const found=findStack(p.recovery, uid);if(found)return {kind:'recovery', container:p.recovery, slot:found.slot, stack:found.stack};}
    return null;
  }
  placeDrop(stack,x,z){
    const made=makeStack(stack.uid, stack.itemId, stack.quantity, stack.durability);
    if(!made.ok)return null;
    const drop={id:this.nextId('d'), stack:made.stack, x, z, until:this.time+DROP_LIFETIME_SECONDS};
    this.drops.push(drop);return drop;
  }
  dropNew(itemId,count,x,z){
    const def=itemDefinition(itemId);
    if(!def||!Number.isInteger(count)||count<=0)return;
    let left=count;
    while(left>0){
      const quantity=Math.min(def.stackLimit, left);
      const stack=this.mintStack(itemId, quantity, def.kind==='equipment'?def.maxDurability:undefined);
      if(!stack)return;
      this.placeDrop(stack, x, z);
      left-=quantity;
    }
  }
  dropContainer(container,x,z){
    if(!container?.slots)return;
    for(const stack of container.slots)if(stack)this.placeDrop(stack, x, z);
    for(let i=0;i<container.slots.length;i++)container.slots[i]=null;
    container.revision++;
  }
  spillPlayer(p){
    this.dropContainer(p.inventory, p.x, p.z);
    for(const slot of EQUIPMENT_SLOTS){
      if(!p.equipment[slot])continue;
      this.placeDrop(p.equipment[slot], p.x, p.z);
      p.equipment[slot]=null;
    }
    if(p.recovery)this.dropContainer(p.recovery, p.x, p.z);
    p.recovery=null;p.lantern=false;p.equipmentRevision++;p.inventory=createBackpack(p.id);
    this.assertItems();
  }
  give(p,itemId,count){
    const def=itemDefinition(itemId);
    if(!def||!Number.isInteger(count)||count<=0)return 0;
    let left=count,accepted=0;
    while(left>0){
      const quantity=Math.min(def.stackLimit, left);
      const stack=this.mintStack(itemId, quantity, def.kind==='equipment'?def.maxDurability:undefined);
      if(!stack)break;
      const plan=planInsert(p.inventory, stack, {supplyCapacity:null, allowPartial:true, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()});
      if(!plan.ok){
        this.placeDrop(stack, p.x, p.z);
        left-=quantity;
        if(left>0)this.dropNew(itemId, left, p.x, p.z);
        break;
      }
      p.inventory.slots=plan.slots;p.inventory.revision=plan.revision;
      accepted+=plan.accepted;left-=plan.accepted;
      if(plan.remainder){this.placeDrop(plan.remainder, p.x, p.z);left-=plan.remainder.quantity;}
    }
    this.assertItems();
    return accepted;
  }
  stock(container,itemId,count){
    const def=itemDefinition(itemId);
    if(!def||!Number.isInteger(count)||count<=0)return 0;
    let left=count,accepted=0;
    while(left>0){
      const quantity=Math.min(def.stackLimit, left);
      const stack=this.mintStack(itemId, quantity, def.kind==='equipment'?def.maxDurability:undefined);
      if(!stack)break;
      const plan=planInsert(container, stack, {supplyCapacity:null, allowPartial:false, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()});
      if(!plan.ok)break;
      container.slots=plan.slots;container.revision=plan.revision;
      accepted+=plan.accepted;left-=plan.accepted;
    }
    return accepted;
  }
  clearPack(p){p.inventory.slots=p.inventory.slots.map(()=>null);p.inventory.revision++;}
  grantEquipped(p,itemId,durability){
    const slot=equipmentSlotFor(itemId),def=itemDefinition(itemId);
    if(!slot||!def||p.equipment[slot])return null;
    const stack=this.mintStack(itemId, 1, durability==null?def.maxDurability:durability);
    if(!stack)return null;
    p.equipment[slot]=stack;p.equipmentRevision++;return stack;
  }
  wearEquipped(p,slot,amount){
    const current=p.equipment[slot];
    if(!current||!(amount>0))return;
    const worn=wearStack(current, amount);
    p.equipment[slot]=worn.stack;
    // Ownership revisions track socket changes, not continuously burning fuel.
    // Transfers always read current host durability rather than a client copy.
    if(worn.removed)p.equipmentRevision++;
    if(slot==='light'&&!(p.equipment.light?.durability>0))p.lantern=false;
  }
  collapseRecovery(p){if(p.recovery&&!p.recovery.slots.some(Boolean))p.recovery=null;}
  nearby(p,type,range=4){return this.buildings.find(b=>(b.type===type||(type==='fire'&&['hearth','fire'].includes(b.type)))&&b.hp>0&&distance(p,b)<range&&(type!=='fire'||b.fuel>0));}
  stores(p){pruneChests(this);return this.buildings.filter(b=>b.type==='chest'&&b.hp>0&&inSupplyChestRange(distance(p,b))&&(!this.chestSessions.has(b.id)||this.chestSessions.get(b.id).ownerId===p.id)).map(b=>b.store);}
  available(p,itemId){return this.count(p, itemId)+this.stores(p).reduce((total, store)=>total+countItem(store, itemId), 0);}
  canPay(p,cost){return Object.entries(cost).every(([itemId, need])=>Number.isInteger(need)&&this.available(p, itemId)>=need);}
  takeCost(clones,cost){
    for(const [itemId, need] of Object.entries(cost)){
      if(!itemDefinition(itemId)||!Number.isInteger(need)||need<=0)return false;
      let left=need;
      for(const clone of clones){
        if(left<=0)break;
        const taken=planTake(clone, itemId, left);
        if(!taken.taken)continue;
        clone.slots=taken.slots;clone.revision++;left-=taken.taken;
      }
      if(left>0)return false;
    }
    return true;
  }
  pay(p,cost){
    const sources=[p.inventory, ...this.stores(p)];
    const clones=sources.map(cloneContainer);
    if(!this.takeCost(clones, cost))return false;
    sources.forEach((live, index)=>{live.slots=clones[index].slots;live.revision=clones[index].revision;});
    return true;
  }
  outputReason(p,itemId){
    const def=itemDefinition(itemId);
    if(!def)return 'Unknown recipe';
    const clones=[p.inventory, ...this.stores(p)].map(cloneContainer);
    const made=makeStack('preview-output', itemId, 1, def.kind==='equipment'?def.maxDurability:undefined);
    if(!made.ok)return 'Unknown recipe';
    const plan=planInsert(clones[0], made.stack, {supplyCapacity:null, allowPartial:false, grow:false, acceptsItems:true, mintUid:()=>'preview-split'});
    return plan.ok?'':'Pack full — store or drop some supplies';
  }
  stationBuilding(p, recipeId, stationId){
    const spec=stationRule(recipeId);
    if(!spec)return true;
    if(typeof stationId!=='string'||!stationId)return null;
    const building=this.buildings.find(b=>b.id===stationId&&b.hp>0);
    if(!building||!spec.accepts(building.type)||!inCraftRange(distance(p,building)))return null;
    if(spec.needsFuel&&!(building.fuel>0))return 'fuel';
    return building;
  }
  recipeReason(p,key,stationId){
    const recipe=RECIPES[key];
    if(!recipe)return 'Unknown recipe';
    if(recipe.station){
      const station=this.stationBuilding(p, key, stationId);
      if(station==='fuel')return 'The fire needs wood';
      if(!station)return stationLabel(key);
    }
    if(!this.canPay(p, recipe.cost))return 'Gather the missing materials';
    if(recipe.kind!=='build'){
      const sources=[p.inventory, ...this.stores(p)];
      const clones=sources.map(cloneContainer);
      if(this.takeCost(clones, recipe.cost)){
        const outputId=recipe.result||key;
        const def=itemDefinition(outputId);
        const made=def&&makeStack('preview-output', outputId, 1, def.kind==='equipment'?def.maxDurability:undefined);
        const plan=made?.ok&&planInsert(clones[0], made.stack, {supplyCapacity:null, allowPartial:false, grow:false, acceptsItems:true, mintUid:()=>'preview-split'});
        if(!plan||!plan.ok)return 'Pack full — store or drop some supplies';
      }
    }
    return '';
  }
  commitCraft(p,recipeKey){
    const recipe=RECIPES[recipeKey];
    if(!recipe||recipe.kind==='build')return false;
    const sources=[p.inventory, ...this.stores(p)];
    const clones=sources.map(cloneContainer);
    if(!this.takeCost(clones, recipe.cost))return false;
    const outputId=recipe.result||recipeKey;
    const def=itemDefinition(outputId);
    const made=def&&makeStack(this.nextItemUid(), outputId, 1, def.kind==='equipment'?def.maxDurability:undefined);
    if(!made?.ok)return false;
    const plan=planInsert(clones[0], made.stack, {supplyCapacity:null, allowPartial:false, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()});
    if(!plan.ok)return false;
    clones[0].slots=plan.slots;clones[0].revision=plan.revision;
    sources.forEach((live, index)=>{live.slots=clones[index].slots;live.revision=clones[index].revision;});
    return true;
  }
  canBuild(p,type,x,z,stationId){
    if(!RECIPES[type]||RECIPES[type].kind!=='build')return 'Unknown structure';
    if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>RULES.radius-2||Math.abs(z)>RULES.radius-2)return 'Outside the clearing';
    if(Math.hypot(x-p.x,z-p.z)>5.5)return 'Move closer to this spot';
    const radius=Math.max(.6,STRUCTURES[type].radius);
    if(this.buildings.length>=160)return 'The camp has reached its structure limit';
    if(this.players.some(q=>q.online&&!q.ghost&&Math.hypot(q.x-x,q.z-z)<radius+.4))return 'A wanderer is standing here';
    if(this.buildings.some(b=>Math.hypot(b.x-x,b.z-z)<Math.max(.65,STRUCTURES[b.type].radius)+radius+.1))return 'Too close to another structure';
    if(this.nodes.some(n=>!n.ready&&NODES[n.type].radius>.3&&Math.hypot(n.x-x,n.z-z)<NODES[n.type].radius+radius))return 'Clear these resources first';
    if(RECIPES[type].station&&!this.stationBuilding(p, type, stationId))return 'Build this at a workbench';
    return this.recipeReason(p,type,stationId);
  }
  transferAll(p,uid,dest,{grow=false,supplyCapacity=null,accepts=true}={}){
    const loc=this.locate(p, uid);
    if(!loc)return false;
    const plan=planInsert(dest, cloneStack(loc.stack), {allowPartial:false, grow, supplyCapacity, acceptsItems:accepts, mintUid:()=>this.nextItemUid()});
    if(!plan.ok)return false;
    dest.slots=plan.slots;dest.revision=plan.revision;
    if(loc.kind==='equipment'){
      if(loc.slot==='light')p.lantern=false;
      p.equipment[loc.slot]=null;p.equipmentRevision++;
    }else{
      loc.container.slots[loc.slot]=null;loc.container.revision++;
      if(loc.kind==='recovery')this.collapseRecovery(p);
    }
    return true;
  }
  takeInto(p,source,stack,quantity){
    const index=source?.slots?.indexOf(stack)??-1;
    const qty=Math.min(quantity, stack?.quantity??0);
    if(index<0||!Number.isInteger(qty)||qty<=0)return 0;
    const options={supplyCapacity:null, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()};
    if(qty===stack.quantity){
      const whole=planInsert(p.inventory, cloneStack(stack), {...options, allowPartial:false});
      if(whole.ok){
        p.inventory.slots=whole.slots;p.inventory.revision=whole.revision;
        source.slots[index]=null;source.revision++;
        return whole.accepted;
      }
    }
    const moving=this.mintStack(stack.itemId, qty, stack.durability);
    if(!moving)return 0;
    const plan=planInsert(p.inventory, moving, {...options, allowPartial:true});
    if(!plan.ok||plan.accepted<=0)return 0;
    p.inventory.slots=plan.slots;p.inventory.revision=plan.revision;
    stack.quantity-=plan.accepted;
    if(stack.quantity<=0)source.slots[index]=null;
    source.revision++;
    return plan.accepted;
  }
  dropOwned(p,uid,quantity){
    const loc=this.locate(p, uid);
    if(!loc)return false;
    const cap=quantity==null?Math.min(5, loc.stack.quantity):quantity;
    if(!Number.isInteger(cap)||cap<=0||cap>loc.stack.quantity)return false;
    const x=p.x+p.dx,z=p.z+p.dz;
    const lay=stack=>{
      const drop=this.placeDrop(stack, x, z);
      if(drop)drop.block={playerId:p.id, until:this.time+PICKUP.dropCooldown};
      return !!drop;
    };
    if(loc.kind==='equipment'){
      if(cap!==loc.stack.quantity)return false;
      if(loc.slot==='light')p.lantern=false;
      const stack=loc.stack;p.equipment[loc.slot]=null;p.equipmentRevision++;
      return lay(stack);
    }
    if(loc.kind!=='backpack'&&loc.kind!=='recovery')return false;
    if(cap===loc.stack.quantity){
      const stack=loc.stack;loc.container.slots[loc.slot]=null;loc.container.revision++;
      if(!lay(stack))return false;
    }else{
      const piece=this.mintStack(loc.stack.itemId, cap, loc.stack.durability);
      if(!piece)return false;
      loc.stack.quantity-=cap;loc.container.revision++;
      if(!lay(piece))return false;
    }
    if(loc.kind==='recovery')this.collapseRecovery(p);
    return true;
  }
  moveSlots(p,sourceSlot,destinationSlot,uid,quantity,sourceRevision,destinationRevision){
    const plan=planMove({
      source:p.inventory, destination:p.inventory, sourceSlot, destinationSlot, uid, quantity,
      sourceRevision, destinationRevision, mintUid:()=>this.nextItemUid(),
      destSupplyCapacity:null, sourceSupplyCapacity:null,
    });
    if(!plan.ok)return plan;
    p.inventory.slots=plan.sourceSlots;p.inventory.revision=plan.sourceRevision;
    this.assertItems();return plan;
  }
  moveBetween(source,destination,sourceSlot,destinationSlot,uid,quantity,sourceRevision,destinationRevision,{destSupplyCapacity=null,sourceSupplyCapacity=null,destAccepts=true,sourceAccepts=true}={}){
    const plan=planMove({
      source, destination, sourceSlot, destinationSlot, uid, quantity, sourceRevision, destinationRevision,
      mintUid:()=>this.nextItemUid(), destSupplyCapacity, sourceSupplyCapacity, destAccepts, sourceAccepts,
    });
    if(!plan.ok)return plan;
    source.slots=plan.sourceSlots;source.revision=plan.sourceRevision;
    if(!plan.same){destination.slots=plan.destSlots;destination.revision=plan.destRevision;}
    this.assertItems();return plan;
  }
  equip(p,uid,socket,inventoryRevision,equipmentRevision){
    const plan=planEquip({
      inventory:p.inventory, equipment:p.equipment, inventoryRevision, equipmentRevision,
      currentEquipmentRevision:p.equipmentRevision, uid, socket,
    });
    if(!plan.ok)return plan;
    const previous=p.equipment.light?.uid;
    p.inventory.slots=plan.slots;p.inventory.revision=plan.inventoryRevision;
    p.equipment=plan.equipment;p.equipmentRevision=plan.equipmentRevision;
    if(plan.socket==='light'&&p.equipment.light?.uid!==previous)p.lantern=false;
    this.assertItems();return plan;
  }
  unequip(p,socket,uid,inventoryRevision,equipmentRevision){
    const plan=planUnequip({
      inventory:p.inventory, equipment:p.equipment, inventoryRevision, equipmentRevision,
      currentEquipmentRevision:p.equipmentRevision, uid, socket,
    });
    if(!plan.ok)return plan;
    if(plan.socket==='light')p.lantern=false;
    p.inventory.slots=plan.slots;p.inventory.revision=plan.inventoryRevision;
    p.equipment=plan.equipment;p.equipmentRevision=plan.equipmentRevision;
    this.assertItems();return plan;
  }
  action(id,cmd){
    const p=this.player(id);if(!p||!p.online||!cmd||typeof cmd!=='object'||Array.isArray(cmd))return {ok:false,code:'unavailable'};
    pruneChests(this);
    if(cmd.type==='chestClose')return inventoryIntent(this,p,cmd);
    if(this.status!=='playing')return {ok:false,code:'unavailable'};
    if(p.down||p.ghost){if(cmd.type==='interact'&&p.charm>0){p.charm--;this.revivePlayer(p);this.event('heal',p.x,p.z,'Last charm');return {ok:true,code:'ok'};}return {ok:false,code:'unavailable'};}
    if(Object.hasOwn(INTENTS,cmd.type))return inventoryIntent(this,p,cmd);
    if(p.cooldown>.05&&!['move','lantern','dash','dismantle'].includes(cmd.type))return {ok:false,code:'cooldown'};
    switch(cmd.type){
      case 'move':if(Number.isFinite(cmd.x)&&Number.isFinite(cmd.z)){p.goal={x:clamp(cmd.x,-RULES.radius+1,RULES.radius-1),z:clamp(cmd.z,-RULES.radius+1,RULES.radius-1),target:typeof cmd.target==='string'?cmd.target:null};p.rest=false;}break;
      case 'craft':return this.performCraft(p, cmd.recipe, cmd.stationId);
      case 'build':return this.performBuild(p, cmd.recipe, cmd.x, cmd.z, cmd.stationId, cmd.rotation);
      case 'use':{
        let stack=null;
        if(typeof cmd.uid==='string'){stack=p.inventory.slots.find(slot=>slot?.uid===cmd.uid)||null;if(!stack)return {ok:false,code:'unknownItem'};}
        if(!stack)return {ok:false,code:'unknownItem'};
        const item=ITEMS[stack.itemId];if(!item||(!item.food&&!item.heal&&!item.boost))return;
        const top=maxHealth(p);
        if(p.hunger>=100&&item.food&&p.hp>=top){this.tell(p,'You are already full');return;}
        const consumed=planConsume({inventory:p.inventory, inventoryRevision:cmd.inventoryRevision, uid:stack.uid, quantity:1});
        if(!consumed.ok)return;
        p.inventory.slots=consumed.slots;p.inventory.revision=consumed.revision;
        if(item.boost==='vigor'){p.bonusHp=(p.bonusHp||0)+HEARTSTONE_HP;p.maxHp=maxHealth(p);p.hp=p.maxHp;p.cooldown=.4;this.event('heal',p.x,p.z,`+${HEARTSTONE_HP} max health`);this.event('announce',p.x,p.z,`${p.name} absorbs a Heartstone`);break;}
        p.hunger=clamp(p.hunger+(item.food||0),0,100);p.hp=clamp(p.hp+(item.heal||0),1,maxHealth(p));p.courage=clamp(p.courage+(item.courage||0),0,100);p.cooldown=.4;this.event('heal',p.x,p.z,item.food?'Delicious':`+${item.heal} health`);break;
      }
      case 'eat':return {ok:false,code:'unsupported'};
      case 'interact':return this.interact(p, cmd.target)||{ok:false,code:'rejected'};
      case 'attack':this.attack(p);break;
      case 'dash':if(p.stamina>=28&&p.dashCooldown<=0){p.stamina-=28;p.dash=.24;p.dashCooldown=1.1;p.rest=false;this.event('dash',p.x,p.z);}break;
      case 'lantern':{
        const light=p.equipment.light;
        if(LIGHT_ITEMS.includes(light?.itemId)&&light.durability>0){p.lantern=!p.lantern;break;}
        const index=p.inventory.slots.findIndex(slot=>LIGHT_ITEMS.includes(slot?.itemId)&&slot.durability>0);
        if(index<0){this.tell(p,'Craft a hand lantern first');break;}
        const equipped=planEquip({inventory:p.inventory, equipment:p.equipment, currentEquipmentRevision:p.equipmentRevision, uid:p.inventory.slots[index].uid});
        if(!equipped.ok){this.tell(p,'Craft a hand lantern first');break;}
        p.inventory.slots=equipped.slots;p.inventory.revision=equipped.inventoryRevision;
        p.equipment=equipped.equipment;p.equipmentRevision=equipped.equipmentRevision;p.lantern=true;break;
      }
      case 'equip':{
        const equipped=this.equip(p, cmd.uid, cmd.socket, cmd.inventoryRevision, cmd.equipmentRevision);
        if(!equipped?.ok)this.tell(p, equipped?.code==='inventoryFull'?'Pack full — store or drop some supplies':'Cannot equip that');
        break;
      }
      case 'unequip':{
        const removed=this.unequip(p, cmd.socket, cmd.uid, cmd.inventoryRevision, cmd.equipmentRevision);
        if(!removed?.ok)this.tell(p, removed?.code==='inventoryFull'?'Pack full — store or drop some supplies':'Cannot unequip that');
        break;
      }
      case 'recover':{
        const stack=p.recovery?.slots?.find(slot=>slot?.uid===cmd.uid);
        if(!stack)return;
        if(!this.takeInto(p, p.recovery, stack, stack.quantity))this.tell(p,'Pack full — store or drop some supplies');
        this.collapseRecovery(p);break;
      }
      case 'drop':{
        const dropped=typeof cmd.uid==='string'&&this.dropOwned(p, cmd.uid, Number.isInteger(cmd.quantity)?cmd.quantity:undefined);
        if(dropped)p.cooldown=.3;break;
      }
      case 'repair':{
        const building=this.buildings.find(b=>b.id===cmd.target&&distance(p,b)<4);if(!building||building.hp>=building.maxHp)return;if(!this.pay(p,{wood:1})){this.tell(p,'Need 1 wood');return;}building.hp=Math.min(building.maxHp, building.hp+90);p.cooldown=.4;this.event('heal',building.x,building.z,'Repaired');break;
      }
      case 'dismantle':return this.beginDismantle(p, cmd.target, cmd.hold!==false);
      case 'upgrade':return this.performUpgrade(p, cmd.target);
      case 'ping':return {ok:false,code:'unsupported'};
      default:return {ok:false,code:'unsupported'};
    }
    this.assertItems();
    return {ok:true,code:'ok'};
  }
  upgradeCost(){return this.buildings.find(b=>b.type==='hearth')?.level===1?{wood:10,stone:8,ember:4}:{wood:15,ore:6,ember:8};}
  target(p,id){
    const inRange=entity=>distance(p,entity)<RULES.reach;
    const revive=this.players.find(q=>q.id!==p.id&&q.online&&q.down&&inRange(q));
    const candidates=[
      ...this.nodes.filter(n=>!(n.ready>this.time)&&inRange(n)).map(e=>({kind:'node',entity:e,label:e.type==='tree'?'Chop':['rock','ore','grave','shardrock'].includes(e.type)?'Mine':isCache(e.type)?'Open':'Gather'})),
      ...this.buildings.filter(b=>b.hp>0&&inRange(b)).map(e=>({kind:'building',entity:e,label:this.buildingLabel(e)})),
      ...(revive?[{kind:'revive',entity:revive,label:'Revive teammate'}]:[]),
    ];
    if(typeof id==='string')return candidates.find(t=>t.entity.id===id)||null;
    if(revive)return {kind:'revive',entity:revive,label:'Revive teammate'};
    return candidates.sort((a,b)=>distance(p,a.entity)-distance(p,b.entity)||(a.entity.id<b.entity.id?-1:1))[0]||null;
  }
  buildingLabel(b){return ({hearth:'Feed heartfire',fire:'Feed fire',bench:'Workbench',chest:'Open supplies',wall:'Repair wall',gate:b.open?'Close gate':'Open gate',trap:b.charges<3?'Rearm trap':'Briar trap',farm:b.planted?(b.growth>=100?'Harvest pumpkins':'Growing…'):'Plant seed',pot:'Cook a feast',lantern:'Soul lantern',bed:'Rest',ward:'Warding totem'})[b.type];}
  interact(p,target){
    const explicit=typeof target==='string'?target:null;
    const t=this.target(p, explicit);if(!t)return {ok:false,code:'rejected'};
    const e=t.entity;
    if(t.kind==='revive')return {ok:true,code:'ok'};
    if(t.kind==='drop')return {ok:false,code:'rejected'};
    if(t.kind==='node'){
      const started=this.setHarvestTarget(p, {mode:'auto', nodeId:e.id});
      return started.ok?started:{ok:false,code:'rejected'};
    }
    if(t.kind==='building'){
      if(['fire','hearth'].includes(e.type)){if(e.fuel>320){this.tell(p,'The fire has plenty of fuel');return {ok:false,code:'rejected'};}if(this.pay(p,{wood:1})){e.fuel=Math.min(360,e.fuel+55);this.event('craft',e.x,e.z,'+55 fuel');}else this.tell(p,'Feed the fire with wood');}
      if(e.type==='gate')e.open=!e.open;
      if(e.type==='wall')this.action(p.id,{type:'repair',target:e.id});
      if(e.type==='farm'){if(!e.planted){if(this.pay(p,{seed:1})){e.planted=true;e.growth=0;}else this.tell(p,'Need 1 pumpkin seed');}else if(e.growth>=100){this.give(p,'pumpkin',3);this.give(p,'seed',2);e.planted=false;e.growth=0;this.event('loot',e.x,e.z,'+3 pumpkins · +2 seeds');}}
      if(e.type==='trap'&&e.charges<3){if(this.pay(p,{stone:1})){e.charges=3;e.hp=e.maxHp;}else this.tell(p,'Need 1 flint to rearm');}
      if(e.type==='bed'){if(phaseAt(this.time)==='night')this.tell(p,'Too dangerous to sleep at night');else if(p.hunger<20)this.tell(p,'Eat before resting');else {p.rest=!p.rest;p.goal=null;}}
      p.cooldown=.45;
      return {ok:true,code:'ok'};
    }
    return {ok:false,code:'rejected'};
  }
  performCraft(p, recipeId, stationId){
    const recipe=RECIPES[recipeId];
    if(!recipe||recipe.kind==='build')return {ok:false,code:'rejected'};
    if(p.cooldown>.05)return {ok:false,code:'cooldown'};
    const station=recipe.station?this.stationBuilding(p, recipeId, stationId):true;
    if(station==='fuel'){this.tell(p,'The fire needs wood');return {ok:false,code:'missingFuel'};}
    if(!station){this.tell(p, stationLabel(recipeId));return {ok:false,code:'stationRequired'};}
    const reason=this.recipeReason(p, recipeId, stationId);
    if(reason){this.tell(p, reason);return {ok:false,code:reason.startsWith('Pack')?'inventoryFull':'rejected'};}
    if(!this.commitCraft(p, recipeId)){this.tell(p,'Pack full — store or drop some supplies');return {ok:false,code:'inventoryFull'};}
    p.cooldown=.35;this.event('craft',p.x,p.z,label(recipe.result||recipeId));this.assertItems();
    return {ok:true,code:'ok'};
  }
  performBuild(p, recipeId, x, z, stationId, rotation){
    if(p.cooldown>.05)return {ok:false,code:'cooldown'};
    const sx=Math.round(x*2)/2, sz=Math.round(z*2)/2;
    const reason=this.canBuild(p, recipeId, sx, sz, stationId);
    if(reason){this.tell(p, reason);return {ok:false,code:reason==='Build this at a workbench'?'stationRequired':'rejected'};}
    if(!this.pay(p, RECIPES[recipeId].cost))return {ok:false,code:'rejected'};
    const building=this.structure(recipeId, sx, sz);building.rotation=rotation===1?1:0;this.buildings.push(building);this.stats.built++;p.cooldown=.4;this.event('build',sx,sz,STRUCTURES[building.type].name);this.assertItems();
    return {ok:true,code:'ok'};
  }
  performUpgrade(p, targetId){
    const building=this.buildings.find(b=>b.id===targetId&&b.type==='hearth'&&b.hp>0&&distance(p,b)<4);
    if(!building){this.tell(p,'Stand at the Heartfire');return {ok:false,code:'rejected'};}
    if(building.level>=3){this.tell(p,'The Heartfire is fully awakened');return {ok:false,code:'rejected'};}
    const cost=this.upgradeCost();if(!this.pay(p, cost)){this.tell(p,'The Heartfire needs more offerings');return {ok:false,code:'rejected'};}
    building.level++;building.maxHp+=300;building.hp=building.maxHp;building.fuel=Math.min(360, building.fuel+120);this.event('build',building.x,building.z,`Heartfire • level ${building.level}`);p.cooldown=.5;this.assertItems();
    return {ok:true,code:'ok'};
  }
  performBuildingAction(p, targetId, actionId){
    if(actionId==='cancel'){this.dismantleHolds.delete(p.id);p.goal=null;return {ok:true,code:'ok'};}
    const building=this.buildings.find(b=>b.id===targetId&&b.hp>0);
    if(!building||distance(p,building)>=RULES.reach)return {ok:false,code:'outOfRange'};
    if(!contextActionIds(building.type).includes(actionId))return {ok:false,code:'rejected'};
    if(actionId==='dismantle')return this.beginDismantle(p, targetId, true);
    if(actionId==='repair')return this.action(p.id,{type:'repair',target:targetId});
    if(actionId==='awaken')return this.performUpgrade(p, targetId);
    if(actionId==='cook'||actionId==='craft'||actionId==='build'||actionId==='open')return {ok:true,code:'ok'};
    return this.interact(p, targetId);
  }
  beginDismantle(p, targetId, holding){
    if(!holding){this.dismantleHolds.delete(p.id);return {ok:true,code:'ok'};}
    const building=this.buildings.find(b=>b.id===targetId&&b.hp>0&&distance(p,b)<4);
    if(!building||building.type==='hearth')return {ok:false,code:'rejected'};
    if(this.chestSessions.has(building.id))return {ok:false,code:'chestInUse'};
    const current=this.dismantleHolds.get(p.id);
    if(!current||current.buildingId!==building.id)this.dismantleHolds.set(p.id,{buildingId:building.id,elapsed:0});
    return {ok:true,code:'ok'};
  }
  finishDismantle(p, building){
    if(!building||building.type==='hearth'||this.chestSessions.has(building.id))return;
    for(const [itemId, count] of Object.entries(RECIPES[building.type].cost))this.give(p, itemId, Math.ceil(count*.5));
    this.dropContainer(building.store, building.x, building.z);
    if(building.overflow)this.dropContainer(building.overflow, building.x, building.z);
    this.buildings=this.buildings.filter(entry=>entry!==building);
    p.cooldown=.5;
  }
  setHarvestTarget(p, cmd){
    if(cmd?.mode==='cancel'){p.goal=null;return {ok:true,code:'ok'};}
    if(cmd?.mode==='hold')return {ok:true,code:'ok'};
    if(cmd?.mode!=='auto'||typeof cmd.nodeId!=='string')return {ok:false,code:'rejected'};
    const node=this.nodes.find(n=>n.id===cmd.nodeId&&!(n.ready>this.time));
    if(!node)return {ok:false,code:'rejected'};
    const profile=harvestProfile(node.type);
    if(profile?.required&&!this.hasTool(p, profile.tool)){this.noteTool(p, node);p.goal=null;return {ok:false,code:'rejected'};}
    p.goal={x:node.x,z:node.z,target:node.id};p.rest=false;
    return {ok:true,code:'ok'};
  }
  noteTool(p, node){
    const last=this.toolNoticeAt.get(p.id)||-10;
    if(this.time-last<2)return;
    this.toolNoticeAt.set(p.id, this.time);
    this.tell(p, `Craft a ${label(NODES[node.type].tool).toLowerCase()} first`);
  }
  syncActivation(p, pressed){
    let state=this.activations.get(p.id);
    if(!state){state={held:false,consumed:false,seq:0};this.activations.set(p.id,state);}
    if(pressed&&!state.held){state.seq++;state.consumed=false;}
    if(!pressed)state.consumed=false;
    state.held=!!pressed;
    return state;
  }
  freshInput(p){
    const raw=this.inputs.get(p.id);
    if(!raw||!(this.time-raw.at<=.6))return {x:0,z:0,act:false,attack:false,target:null,at:0};
    return raw;
  }
  liveNode(id, p){
    const node=this.nodes.find(n=>n.id===id&&!(n.ready>this.time));
    if(!node||distance(p,node)>=RULES.reach)return null;
    return node;
  }
  harvestChoice(p, dt=RULES.tick){
    if(!p.online||p.down||p.ghost||p.hp<=0||p.rest||p.dash>0)return null;
    // Damage inside this step, including a hurt recorded just before the tick advanced time.
    const hurtAt=this.damagedAt.get(p.id);
    if(hurtAt!=null&&this.time-hurtAt<=dt+1e-9)return null;
    if(p.action==='attack'&&p.actionUntil>this.time)return null;
    const raw=this.freshInput(p);
    if(Math.hypot(raw.x||0, raw.z||0)>.08||raw.attack)return null;
    const pressed=raw.act===true;
    let node=null, mode=null;
    if(p.goal?.target){const aimed=this.liveNode(p.goal.target, p);if(aimed){node=aimed;mode='auto';}}
    if(pressed){
      const id=typeof raw.target==='string'?raw.target:null;
      if(id){
        const held=this.liveNode(id, p);
        if(!held){if(node&&node.id!==id){node=null;mode=null;}}
        else{node=held;mode=mode&&mode!=='hold'?'both':'hold';}
      }else{
        const near=this.nodes.filter(n=>!(n.ready>this.time)&&distance(p,n)<RULES.reach).sort((a,b)=>distance(p,a)-distance(p,b)||(a.id<b.id?-1:1))[0];
        if(near){node=near;mode=mode?'both':'hold';}
      }
    }
    if(!node)return null;
    const toolId=NODES[node.type].tool&&this.hasTool(p, NODES[node.type].tool)?NODES[node.type].tool:null;
    if(gatherRate(node.type, toolId)<=0){
      if(NODES[node.type].required)this.noteTool(p, node);
      if(p.goal?.target===node.id)p.goal=null;
      return null;
    }
    return {node, mode:mode||'auto'};
  }
  advanceChannels(dt){
    for(const p of this.players)this.syncActivation(p, this.freshInput(p).act===true);
    this.advanceHarvest(dt);this.advanceRevive(dt);this.advanceDismantle(dt);this.advancePickup(dt);
  }
  advanceHarvest(dt){
    const wanted=new Map();
    for(const p of this.players.slice().sort((a,b)=>a.id<b.id?-1:1)){
      const choice=this.harvestChoice(p, dt);if(!choice)continue;
      let bucket=wanted.get(choice.node.id);
      if(!bucket){bucket=new Map();wanted.set(choice.node.id, bucket);}
      bucket.set(p.id,{mode:choice.mode,startedAt:this.time});
    }
    for(const nodeId of [...new Set([...wanted.keys(), ...this.harvestWork.keys()])].sort()){
      const node=this.nodes.find(n=>n.id===nodeId), next=wanted.get(nodeId);
      if(!node||node.ready>this.time||!next||next.size===0){this.harvestWork.delete(nodeId);continue;}
      let work=this.harvestWork.get(nodeId);
      if(!work){work={elapsed:0,swing:0,contributors:new Map()};this.harvestWork.set(nodeId, work);}
      const previous=[...work.contributors.keys()];
      if(previous.length&&previous.every(id=>!next.has(id))){work.elapsed=0;work.swing=0;work.contributors.clear();}
      for(const id of [...work.contributors.keys()])if(!next.has(id))work.contributors.delete(id);
      for(const [id, meta] of next)if(!work.contributors.has(id))work.contributors.set(id,{...meta});
      if(work.contributors.size===0){this.harvestWork.delete(nodeId);continue;}
      this.stepHarvest(node, work, dt);
    }
  }
  stepHarvest(node, work, dt){
    const profile=harvestProfile(node.type);
    let left=dt;
    while(left>1e-8&&work.elapsed<profile.workSeconds-1e-9){
      const parts=[];
      for(const id of [...work.contributors.keys()].sort()){
        const p=this.player(id);
        const toolId=p&&NODES[node.type].tool&&this.hasTool(p, NODES[node.type].tool)?NODES[node.type].tool:null;
        const rate=p?gatherRate(node.type, toolId):0;
        if(!(rate>0)){work.contributors.delete(id);continue;}
        const slot=toolId?equipmentSlotFor(toolId):null;
        parts.push({p, rate, slot, durability:slot?p.equipment[slot].durability:Infinity});
      }
      if(!parts.length){this.harvestWork.delete(node.id);return;}
      const sum=parts.reduce((total,part)=>total+part.rate,0);
      let slice=Math.min(left, (profile.workSeconds-work.elapsed)/sum);
      for(const part of parts)if(part.slot)slice=Math.min(slice, part.durability);
      if(!(slice>0)){this.harvestWork.delete(node.id);return;}
      work.elapsed+=sum*slice;
      for(const part of parts){
        if(part.slot)this.wearEquipped(part.p, part.slot, part.durability-slice<=1e-8?part.durability:slice);
        part.p.stamina=Math.max(0, part.p.stamina-2*slice);
        part.p.action='gather';part.p.actionUntil=this.time+.3;
        const span=Math.max(.1, distance(part.p, node));
        part.p.dx=(node.x-part.p.x)/span;part.p.dz=(node.z-part.p.z)/span;
      }
      work.swing+=slice;
      if(work.swing>=.45){work.swing=0;this.event('hit', node.x, node.z, '', {key:node.type});}
      left-=slice;
      if(work.elapsed>=profile.workSeconds-1e-9){this.finishHarvest(node, work);return;}
    }
  }
  finishHarvest(node, work){
    const profile=harvestProfile(node.type);
    node.ready=this.time+profile.regrow;node.hits=0;
    const ids=[...work.contributors.keys()].sort((a,b)=>{
      const delta=work.contributors.get(a).startedAt-work.contributors.get(b).startedAt;
      return delta||(a<b?-1:a>b?1:0);
    });
    for(const id of work.contributors.keys()){
      const p=this.player(id);
      if(p?.goal?.target===node.id)p.goal=null;
      const state=this.activations.get(id);
      if(state?.held)state.consumed=true;
    }
    this.harvestWork.delete(node.id);
    const finder=this.player(ids[0]);
    if(NODES[node.type].table){
      const tier=tierAt(node.x,node.z);
      const rolls=rollLoot(NODES[node.type].table,this.lootRng,tier>=2?.5:0);
      this.spillLoot(rolls,node.x,node.z,finder?.name);
      for(const id of ids)this.awardXp(this.player(id),rollXp(node.type));
      this.event('impact',node.x,node.z,NODES[node.type].name);this.event('cache',node.x,node.z,'',{key:node.type});
      return;
    }
    for(const id of ids)this.awardXp(this.player(id),GATHER_XP);
    if(profile.output==='floor'){
      const entries=Object.entries(profile.loot);
      entries.forEach(([itemId, count], index)=>{
        const angle=(index+0.5)/entries.length*Math.PI*2;
        this.dropNew(itemId, count, node.x+Math.cos(angle)*0.55, node.z+Math.sin(angle)*0.55);
        this.stats.gathered+=count;
      });
      this.event('impact', node.x, node.z, NODES[node.type].name);
    }else{
      const recipient=this.player(ids[0]);
      for(const [itemId, count] of Object.entries(profile.loot)){
        const accepted=recipient?this.give(recipient, itemId, count):0;
        this.stats.gathered+=count;
        if(accepted>0)this.event('loot', recipient.x, recipient.z, `+${accepted} ${label(itemId)}`);
      }
    }
    if(node.type==='grave'&&this.rng()<.45)this.spawnEnemy('wraith', node.x+1, node.z+1, {home:true,roamer:true,leash:ROAM.leash});
  }
  advanceRevive(dt){
    const helpers=new Set();
    for(const p of this.players){
      if(!p.online||p.down||p.ghost||p.hp<=0||p.rest||p.dash>0)continue;
      const raw=this.freshInput(p);
      if(raw.act!==true||raw.attack||Math.hypot(raw.x||0, raw.z||0)>.08)continue;
      const id=typeof raw.target==='string'?raw.target:null;
      const target=id
        ?this.players.find(q=>q.id===id&&q.down&&q.id!==p.id&&distance(p,q)<RULES.reach)
        :this.players.filter(q=>q.id!==p.id&&q.online&&q.down&&distance(p,q)<RULES.reach).sort((a,b)=>distance(p,a)-distance(p,b)||(a.id<b.id?-1:1))[0];
      if(target)helpers.add(target.id);
    }
    for(const q of this.players){
      if(!q.down){this.reviveWork.delete(q.id);continue;}
      if(!helpers.has(q.id)){this.reviveWork.delete(q.id);q.revive=0;continue;}
      const channel=this.reviveWork.get(q.id)||{elapsed:0};
      channel.elapsed+=dt;q.revive=channel.elapsed;this.reviveWork.set(q.id, channel);
      if(channel.elapsed>=3-1e-9){this.revivePlayer(q);this.stats.revives++;this.reviveWork.delete(q.id);}
    }
  }
  advanceDismantle(dt){
    for(const [id, hold] of [...this.dismantleHolds]){
      const p=this.player(id);
      const building=this.buildings.find(b=>b.id===hold.buildingId&&b.hp>0);
      if(!p||!p.online||p.down||p.ghost||p.hp<=0||!building||building.type==='hearth'||distance(p,building)>=4||this.chestSessions.has(building.id)){
        this.dismantleHolds.delete(id);continue;
      }
      hold.elapsed+=dt;
      if(hold.elapsed+1e-9>=DISMANTLE_HOLD_SECONDS){this.finishDismantle(p, building);this.dismantleHolds.delete(id);}
    }
  }
  canSeekDrop(p, drop){
    if(!p?.online||p.down||p.ghost||!(p.hp>0)||!drop?.stack?.quantity||drop.flight)return false;
    if(drop.block&&drop.block.playerId===p.id&&this.time<drop.block.until)return false;
    return true;
  }
  acceptsDrop(p, drop){
    const plan=planInsert(p.inventory, drop.stack, {supplyCapacity:null, allowPartial:true, grow:false, acceptsItems:true, mintUid:()=>`view${this.previewUid++}`});
    return !!(plan.ok&&plan.accepted>0);
  }
  notePack(p){
    const last=this.packNoticeAt.get(p.id)||-10;
    if(this.time-last<2)return;
    this.packNoticeAt.set(p.id, this.time);
    this.tell(p,'Pack full — store or drop some supplies');
  }
  beginFlight(p, drop){
    if(!drop?.stack?.quantity||drop.flight)return false;
    if(!this.acceptsDrop(p, drop)){this.notePack(p);return false;}
    drop.flight={playerId:p.id, startedAt:this.time, duration:PICKUP.flight};
    delete drop.attract;
    this.pickupDwell.delete(drop.id);
    return true;
  }
  finishFlights(){
    for(const drop of [...this.drops]){
      if(!drop.flight)continue;
      const duration=drop.flight.duration>0?drop.flight.duration:PICKUP.flight;
      if(this.time-drop.flight.startedAt+1e-9<duration)continue;
      const p=this.player(drop.flight.playerId);
      if(!p){delete drop.flight;continue;}
      const plan=planInsert(p.inventory, drop.stack, {supplyCapacity:null, allowPartial:true, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()});
      if(!plan.ok||plan.accepted<=0){delete drop.flight;this.notePack(p);continue;}
      p.inventory.slots=plan.slots;p.inventory.revision=plan.revision;
      this.event('loot', p.x, p.z, `+${plan.accepted} ${label(drop.stack.itemId)}`);
      if(plan.remainder){drop.stack=plan.remainder;delete drop.flight;delete drop.attract;}
      else{this.drops=this.drops.filter(entry=>entry!==drop);this.pickupDwell.delete(drop.id);}
    }
  }
  // Host tick only. Guests never grant a pile; position comes from the host simulation.
  advancePickup(dt){
    this.finishFlights();
    const nearer=(a,b,drop)=>distance(a,drop)-distance(b,drop)||(a.id<b.id?-1:a.id>b.id?1:0);
    const live=new Set();
    for(const drop of this.drops){
      if(!drop.stack?.quantity)continue;
      live.add(drop.id);
      if(drop.block&&!(this.time<drop.block.until))delete drop.block;
      if(drop.flight){delete drop.attract;continue;}
      const seekers=this.players.filter(p=>this.canSeekDrop(p, drop)&&distance(p, drop)<PICKUP.attract&&this.acceptsDrop(p, drop));
      const touch=seekers.filter(p=>distance(p, drop)<PICKUP.touch).sort((a,b)=>nearer(a,b,drop));
      if(touch.some(p=>this.beginFlight(p, drop)))continue;
      let timers=this.pickupDwell.get(drop.id)||new Map();
      const inside=new Set();
      for(const p of seekers){
        if(distance(p, drop)<PICKUP.touch)continue;
        inside.add(p.id);
        timers.set(p.id, (timers.get(p.id)||0)+dt);
      }
      for(const id of [...timers.keys()])if(!inside.has(id))timers.delete(id);
      const ready=[...timers.entries()].filter(([,elapsed])=>elapsed+1e-9>=PICKUP.dwell).map(([id])=>this.player(id)).filter(Boolean).sort((a,b)=>nearer(a,b,drop));
      let flew=false;
      for(const p of ready){
        if(this.beginFlight(p, drop)){flew=true;break;}
        timers.delete(p.id);
      }
      if(flew)continue;
      if(timers.size){
        this.pickupDwell.set(drop.id, timers);
        const show=[...timers.entries()].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1))[0];
        drop.attract={playerId:show[0], elapsed:show[1], dwell:PICKUP.dwell};
      }else{
        this.pickupDwell.delete(drop.id);
        delete drop.attract;
      }
    }
    for(const id of [...this.pickupDwell.keys()])if(!live.has(id))this.pickupDwell.delete(id);
  }
  attack(p){
    const weapon=p.equipment.weapon;
    const magic=weapon&&weapon.durability>0?magicModuleFor(weapon.itemId):null;
    if(magic)return this.attackMagic(p, weapon, magic);
    const armed=!!(weapon&&weapon.durability>0&&equipmentSlotFor(weapon.itemId)==='weapon');
    const style=(armed&&weaponStyle(weapon.itemId))||weaponStyle('fist');
    const stamina=style.stamina??7;
    if(p.stamina<stamina){this.tell(p,'Catch your breath');return;}
    const hostile=this.enemies.filter(entry=>!isMagicAlly(entry)&&entry.hp>0);
    const range=style.range??style.sight??2;
    const target=hostile.filter(entry=>distance(entry,p)<range).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    const damage=(armed?EQUIPMENT[weapon.itemId].damage:style.damage)*powerOf(p);
    p.stamina-=stamina;p.cooldown=style.cooldown;p.rest=false;p.action='attack';p.actionUntil=this.time+.32;this.event('swing',p.x,p.z);
    if(target){const span=Math.max(.1,distance(target,p));p.dx=(target.x-p.x)/span;p.dz=(target.z-p.z)/span;}
    if(armed)p.magicCast={itemId:weapon.itemId,at:this.time,x:p.x,z:p.z,dx:p.dx,dz:p.dz};
    const special=ARSENAL[style.style];
    if(special){special(this,p,{style,damage,weapon,hostile});return;}
    if(style.style==='melee'){
      const hits=style.arc>0?hostile.filter(entry=>{const d=distance(entry,p);if(d>=range)return false;if(d<.6)return true;const dot=((entry.x-p.x)*p.dx+(entry.z-p.z)*p.dz)/d;return dot>=Math.cos(style.arc*Math.PI/360);}):(target?[target]:[]);
      for(const enemy of hits)this.strike(p, enemy, damage, .32);
      if(armed&&hits.length)this.wearEquipped(p,'weapon',1);
      if(style.arc>0)this.event('cleave',p.x,p.z,'',{dx:p.dx,dz:p.dz,arc:style.arc,range});
      return;
    }
    if(style.style==='nova'){
      const hits=hostile.filter(entry=>distance(entry,p)<style.range);
      for(const enemy of hits)this.strike(p, enemy, damage*(1-distance(enemy,p)/style.range*.35), .6);
      this.event('nova',p.x,p.z,'',{radius:style.range});
      this.wearEquipped(p,'weapon',1);
      return;
    }
    // arrows and bolts
    const len=Math.hypot(p.dx,p.dz)||1;
    this.projectiles.push({id:this.nextId('pr'),kind:style.style,owner:p.id,x:p.x+p.dx/len*.2,z:p.z+p.dz/len*.2,vx:p.dx/len*style.speed,vz:p.dz/len*style.speed,
      damage,range:style.range,traveled:0,pierce:style.pierce||0,splash:style.splash||0,slow:style.slow||0,hit:[],age:0,aim:Math.atan2(p.dz/len,p.dx/len)});
    this.wearEquipped(p,'weapon',1);
  }
  /** One hit from a wanderer. Knockback, floating number, credit for the kill. */
  strike(p, enemy, amount, push=.32){
    const dealt=Math.max(1,Math.round(amount));
    enemy.hp-=dealt;enemy.lastHitBy=p?.id||enemy.lastHitBy;
    if(p&&push>0){const span=Math.max(.1,distance(enemy,p));const k=enemy.type==='king'||enemy.type==='golem'?.3:1;enemy.x+=(enemy.x-p.x)/span*push*k;enemy.z+=(enemy.z-p.z)/span*push*k;}
    if(enemy.home&&!enemy.aggro)enemy.aggro=true;
    this.event('damage',enemy.x,enemy.z,String(dealt));
  }
  stepProjectiles(dt){
    if(!this.projectiles.length)return;
    const hostile=this.enemies.filter(e=>!isMagicAlly(e)&&e.hp>0);
    for(const shot of this.projectiles){
      if(shot.homing){const mark=hostile.find(e=>e.id===shot.homing&&e.hp>0)||hostile.filter(e=>!shot.hit.includes(e.id)&&Math.hypot(e.x-shot.x,e.z-shot.z)<6).sort((a,b)=>Math.hypot(a.x-shot.x,a.z-shot.z)-Math.hypot(b.x-shot.x,b.z-shot.z))[0];
        if(mark){shot.homing=mark.id;const want=Math.atan2(mark.z-shot.z,mark.x-shot.x),have=Math.atan2(shot.vz,shot.vx),speed=Math.hypot(shot.vx,shot.vz);let turn=((want-have+Math.PI*3)%(Math.PI*2))-Math.PI;turn=Math.max(-shot.turn*dt,Math.min(shot.turn*dt,turn));const a=have+turn;shot.vx=Math.cos(a)*speed;shot.vz=Math.sin(a)*speed;shot.aim=a;}}
      const step=Math.hypot(shot.vx,shot.vz)*dt,x0=shot.x,z0=shot.z;
      shot.x+=shot.vx*dt;shot.z+=shot.vz*dt;shot.traveled+=step;shot.age+=dt;
      // Swept test: a fast arrow cannot skip over a foe standing point-blank.
      const gap=enemy=>{const sx=shot.x-x0,sz=shot.z-z0,len2=sx*sx+sz*sz||1e-9,t=Math.max(0,Math.min(1,((enemy.x-x0)*sx+(enemy.z-z0)*sz)/len2));return Math.hypot(enemy.x-(x0+sx*t),enemy.z-(z0+sz*t));};
      const owner=this.player(shot.owner);
      for(const enemy of hostile){
        if(shot.done||shot.hit.includes(enemy.id))continue;
        const reach=enemy.type==='king'?1.3:enemy.type==='golem'||enemy.type==='brute'?1:.75;
        if(gap(enemy)>reach)continue;
        shot.hit.push(enemy.id);
        this.strike(owner, enemy, shot.damage, shot.kind==='bolt'?.3:.18);
        if(shot.slow)enemy.slowed=Math.max(enemy.slowed||0,shot.slow);
        if(shot.splash){for(const other of hostile)if(other!==enemy&&other.hp>0&&Math.hypot(other.x-shot.x,other.z-shot.z)<shot.splash)this.strike(owner, other, shot.damage*.55, .2);this.event('burst',shot.x,shot.z,'',{radius:shot.splash});shot.done=true;}
        else if(shot.hit.length>shot.pierce)shot.done=true;
      }
      if(!shot.done&&(shot.traveled>=shot.range||Math.hypot(shot.x,shot.z)>RULES.radius))shot.done=true;
    }
    this.projectiles=this.projectiles.filter(shot=>!shot.done);
  }
  attackMagic(p, weapon, magic){
    const profile=magicAttackProfile(weapon.itemId);
    const stamina=profile?.stamina??0;
    if(stamina>0&&p.stamina<stamina){this.tell(p,'Catch your breath');return;}
    if(p.cooldown>0.05)return;
    const before=this.magicSnapshot();
    const durabilityBefore=weapon.durability;
    const staminaBefore=p.stamina;
    const cooldownBefore=p.cooldown;
    p.rest=false;
    const result=magic.use(this, p);
    const worn=p.equipment.weapon;
    const acted=result!=null||p.cooldown!==cooldownBefore||p.action==='attack'||worn!==weapon||(worn&&worn.durability!==durabilityBefore);
    if(!acted)return;
    if(stamina>0&&p.stamina===staminaBefore)p.stamina=Math.max(0, p.stamina-stamina);
    if(worn&&worn.uid===weapon.uid&&worn.durability===durabilityBefore)this.wearEquipped(p,'weapon', profile?.durabilityCost??1);
    if(p.cooldown===cooldownBefore)p.cooldown=profile?.cooldown??0.55;
    if(p.action!=='attack'){p.action='attack';p.actionUntil=Math.max(p.actionUntil||0, this.time+.32);}
    // Replicated casting pose. Renderers interpolate this stamp, never combat.
    p.magicCast={itemId:weapon.itemId,at:this.time,x:p.x,z:p.z,dx:p.dx,dz:p.dz};
    this.event('swing',p.x,p.z);
    this.consumeMagicPayloads(before, RULES.tick);
  }
  magicSnapshot(){
    return new Map(this.enemies.filter(enemy=>!isMagicAlly(enemy)).map(enemy=>[enemy.id,{hp:enemy.hp,x:enemy.x,z:enemy.z,root:enemy.magicRootRemaining||0}]));
  }
  stepMagic(dt){
    if(!magicModules.length)return;
    const before=this.magicSnapshot();
    for(const mod of magicModules) mod.step(this, dt);
    this.consumeMagicPayloads(before, dt);
  }
  consumeMagicPayloads(before, dt){
    const obstacles=this.obstacles();
    this.consumeMagicQueues(dt, obstacles, before);
    this.consumeSummonHits(before);
    for(const enemy of this.enemies){
      if(isMagicAlly(enemy)){
        delete enemy.pendingHit;delete enemy.pendingBurn;delete enemy.pendingKnock;
        continue;
      }
      const prev=before.get(enemy.id);
      const hpDropped=!!(prev&&enemy.hp<prev.hp-1e-6);
      const moved=!!(prev&&Math.hypot(enemy.x-prev.x, enemy.z-prev.z)>1e-3);
      if(enemy.pendingHit!=null){
        const hit=readPendingHit(enemy);
        if(!hpDropped&&hit>0){enemy.hp-=hit;this.event('damage', enemy.x, enemy.z, String(Math.ceil(hit)));}
        delete enemy.pendingHit;
      }
      if(enemy.pendingKnock!=null){
        const knock=readPendingKnock(enemy);
        if(!moved&&knock)this.move(enemy, knock.dx/Math.max(dt, 0.05), knock.dz/Math.max(dt, 0.05), dt, obstacles);
        delete enemy.pendingKnock;
      }
      if(enemy.pendingBurn!=null){
        const burn=readPendingBurn(enemy);
        if(burn)enemy.burn=burn;
        delete enemy.pendingBurn;
      }
      if(enemy.burn&&enemy.burn.remaining>0){
        const amount=enemy.burn.dps*dt;
        if(amount>0)enemy.hp-=amount;
        enemy.burn.remaining-=dt;
        if(enemy.burn.remaining<=0)delete enemy.burn;
      }
    }
  }
  takeMagicQueue(key){
    const value=this[key];
    if(Array.isArray(value)){this[key]=[];return value;}
    if(value&&typeof value==='object'){this[key]=null;return [value];}
    return [];
  }
  consumeSummonHits(before){
    const summons=this.magicSummons;
    if(!Array.isArray(summons))return;
    for(const summon of summons){
      if(!summon?.pendingHit)continue;
      const hit=summon.pendingHit;
      delete summon.pendingHit;
      const enemy=this.enemies.find(entry=>entry.id===hit?.targetId);
      if(!enemy||isMagicAlly(enemy)||!(enemy.hp>0))continue;
      const prev=before.get(enemy.id);
      if(prev&&enemy.hp<prev.hp-1e-6)continue;
      const amount=Number(hit.amount??hit.damage??0);
      if(!(amount>0))continue;
      enemy.hp-=amount;
      this.event('damage', enemy.x, enemy.z, String(Math.ceil(amount)));
    }
  }
  consumeMagicQueues(dt, obstacles, before=new Map()){
    const hits=this.takeMagicQueue('pendingHit');
    const knocks=this.takeMagicQueue('pendingKnock');
    const burns=this.takeMagicQueue('pendingBurn');
    const roots=this.takeMagicQueue('pendingRoot');
    const step=Math.max(dt, 0.05);
    const covered=new Map();
    for(const enemy of this.enemies){
      if(isMagicAlly(enemy)||enemy.pendingHit==null)continue;
      const amount=readPendingHit(enemy);
      const prev=before.get(enemy.id);
      const already=!!(prev&&enemy.hp<prev.hp-1e-6);
      delete enemy.pendingHit;
      if(already){if(amount>0)covered.set(enemy.id, amount);continue;}
      if(!(amount>0)||!(enemy.hp>0))continue;
      const hp=enemy.hp;
      enemy.hp-=amount;
      if(enemy.hp<hp)this.event('damage', enemy.x, enemy.z, String(Math.ceil(amount)));
      covered.set(enemy.id, amount);
    }
    for(const hit of hits){
      const enemy=this.enemies.find(entry=>entry.id===hit?.targetId);
      if(!enemy||isMagicAlly(enemy)||!(enemy.hp>0))continue;
      const amount=Number(hit.amount??hit.damage??0);
      if(!(amount>0))continue;
      const owed=covered.get(enemy.id)||0;
      if(owed+1e-6>=amount){covered.set(enemy.id, owed-amount);continue;}
      const prev=enemy.hp;
      enemy.hp-=amount;
      if(enemy.hp<prev)this.event('damage', enemy.x, enemy.z, String(Math.ceil(amount)));
    }
    for(const knock of knocks){
      const enemy=this.enemies.find(entry=>entry.id===knock?.targetId);
      if(!enemy||isMagicAlly(enemy))continue;
      const dx=Number(knock.dx)||0, dz=Number(knock.dz)||0;
      if(!dx&&!dz)continue;
      this.move(enemy, dx/step, dz/step, step, obstacles);
    }
    for(const burn of burns){
      const enemy=this.enemies.find(entry=>entry.id===burn?.targetId);
      if(!enemy||isMagicAlly(enemy))continue;
      const spec=readPendingBurn({pendingBurn:burn});
      if(spec)enemy.burn=spec;
    }
    for(const root of roots){
      const enemy=this.enemies.find(entry=>entry.id===root?.targetId);
      if(!enemy||isMagicAlly(enemy))continue;
      const remaining=Number(root.remaining??root.seconds??root.duration);
      if(remaining>0)enemy.magicRootRemaining=Math.max(enemy.magicRootRemaining||0, remaining);
    }
  }
  tickRoot(enemy, dt){
    if(enemy.stunned>0){enemy.stunned=Math.max(0,enemy.stunned-dt);enemy.windup=0;return true;}
    if(!(enemy.magicRootRemaining>0))return false;
    enemy.magicRootRemaining=Math.max(0, enemy.magicRootRemaining-dt);
    if(Number.isFinite(enemy.magicRootX)&&Number.isFinite(enemy.magicRootZ)){enemy.x=enemy.magicRootX;enemy.z=enemy.magicRootZ;}
    return true;
  }
  lit(p){return inSafeLight(collectLightSources(this), p.x, p.z);}
  armNextWave(){
    const schedule={day:RULES.day, dusk:RULES.dusk, night:RULES.night, cycle:RULES.cycle};
    const progress=phaseProgress(this.time, schedule);
    if(!progress||progress.name!=='night'){this.nextSpawn=0;return;}
    const offset=remainingNightWaveOffsets(progress.elapsed, RULES.night)[0];
    this.nextSpawn=offset===undefined?progress.cycleIndex*schedule.cycle+schedule.cycle:progress.cycleIndex*schedule.cycle+progress.phaseStart+offset;
  }
  obstacles(){return [...this.nodes.filter(n=>!n.ready&&NODES[n.type].radius>.3).map(n=>({...n,radius:NODES[n.type].radius})),...this.buildings.filter(b=>STRUCTURES[b.type].radius>0&&!(b.type==='gate'&&b.open)).map(b=>({...b,radius:STRUCTURES[b.type].radius}))];}
  move(p,dx,dz,dt,obstacles){
    const R=RULES.radius-1;const can=(x,z)=>Math.hypot(x,z)<R&&!obstacles.some(o=>o.id!==p.id&&Math.hypot(o.x-x,o.z-z)<o.radius+.33);
    const x=p.x+dx*dt,z=p.z+dz*dt;
    // Something knocked or summoned inside a trunk may always walk back out.
    if(can(x,z)||(Math.hypot(x,z)<R&&!can(p.x,p.z))){p.x=x;p.z=z;return true;}
    let moved=false;if(can(x,p.z)){p.x=x;moved=true;}if(can(p.x,z)){p.z=z;moved=true;}return moved;
  }
  hurt(p,amount){if(this.showcase||p.dash>0||p.down||p.ghost)return;this.damagedAt.set(p.id,this.time);const armor=p.equipment.body;if(armor&&ARMOR_REDUCTION[armor.itemId]&&armor.durability>0){this.wearEquipped(p,'body',amount);amount*=1-ARMOR_REDUCTION[armor.itemId];}p.hp-=amount;p.rest=false;this.event('hurt',p.x,p.z,`−${Math.ceil(amount)}`,{player:p.id});if(p.hp<=0){releaseChests(this,p.id);p.hp=0;p.down=40;p.revive=0;p.goal=null;this.event('announce',p.x,p.z,`${p.name} needs a hand!`);}}
  revivePlayer(p){p.down=0;p.ghost=false;p.hp=Math.round(maxHealth(p)/2);p.courage=50;p.hunger=Math.max(35,p.hunger);p.revive=0;const hearth=this.buildings.find(b=>b.type==='hearth');if(hearth){p.x=hearth.x+2;p.z=hearth.z+2;}this.event('heal',p.x,p.z,'Back on your feet');}
  spawnEnemy(type,x,z,options={}){
    const def=ENEMIES[type];if(!def)return null;
    const day=dayAt(this.time),humans=Math.max(1,this.players.filter(p=>p.online).length);
    const scale=enemyScale(day+(options.tier||0)*2);
    const elite=options.elite??(!this.showcase&&type!=='king'&&this.spawnRng()<eliteChance(day, options.tier||0));
    const hp=Math.round(def.hp*scale.hp*(1+(humans-1)*.35)*(elite?ELITE.hp:1)*(type==='king'?1+.25*Math.max(0,Math.floor(day/5)-1):1));
    const enemy={id:this.nextId('e'),type,x,z,hp,maxHp:hp,cooldown:1,windup:0,slam:0,tx:x,tz:z,slowed:0,power:+(scale.damage*(elite?ELITE.damage:1)).toFixed(3),level:day+(options.tier||0)*2,elite:!!elite};
    if(options.home){enemy.home={x,z};enemy.leash=options.leash||ROAM.leash;enemy.guardOf=options.guardOf||null;enemy.roamer=!!options.roamer;}
    this.enemies.push(enemy);return enemy;
  }
  invaders(){return this.enemies.filter(e=>!e.home&&!isMagicAlly(e));}
  spawnWave(){
    const day=dayAt(this.time),humans=this.players.filter(p=>p.online).length;this.wave++;
    const count=waveSize(day, humans);const hearth=this.buildings.find(b=>b.type==='hearth')||{x:0,z:0};
    const roster=nightRoster(day);
    for(let i=0;i<count;i++){const a=this.rng()*Math.PI*2,r=16+this.rng()*6;const type=i===0&&day>=3&&day%2===1?'brute':pickWeighted(this.rng, roster);const lim=RULES.radius-4;this.spawnEnemy(type,clamp(hearth.x+Math.cos(a)*r,-lim,lim),clamp(hearth.z+Math.sin(a)*r,-lim,lim));}
    if(isBossNight(day)&&this.bossNight!==day&&!this.enemies.some(e=>e.type==='king')){this.bossNight=day;this.bossSpawned=true;this.bossSlain=false;this.spawnEnemy('king',hearth.x,hearth.z-19);this.event('announce',0,0,day===5?'The Hollow King has found your fire.':`The Hollow King returns, stronger. Night ${day}.`);}
    else this.event('announce',0,0,`Night ${day} • the woods are waking`);
  }
  /** Guardians beside unopened caches. Topped up each dawn, never while a wanderer watches. */
  maintainGuards(){
    if(this.showcase||!this.ambient)return;
    const day=dayAt(this.time);if(this.guardsDay===day)return;this.guardsDay=day;
    for(const node of this.nodes){
      const want=CACHE_GUARDS[node.type]||0;if(!want||node.ready)continue;
      const have=this.enemies.filter(e=>e.guardOf===node.id).length;
      if(have>=want||this.players.some(p=>p.online&&distance(p,node)<24))continue;
      const region=regionAt(node.x,node.z),tier=REGIONS[region].tier;const pool=RESIDENTS[region].length?RESIDENTS[region]:['crawler'];
      for(let i=have;i<want;i++){const a=this.spawnRng()*Math.PI*2;const type=node.type==='reliquary'&&i===0?(pool.includes('golem')?'golem':'brute'):pool[Math.floor(this.spawnRng()*pool.length)];
        this.spawnEnemy(type,node.x+Math.cos(a)*2.4,node.z+Math.sin(a)*2.4,{home:true,guardOf:node.id,tier,leash:10,elite:node.type==='reliquary'||(node.type==='moonchest'&&i===0)});}
    }
  }
  /** Region residents roam near wanderers who travel beyond the meadow, day or night. */
  roam(dt){
    if(this.showcase||!this.ambient)return;
    this.roamTimer-=dt;if(this.roamTimer>0)return;this.roamTimer=ROAM.interval;
    for(const p of this.players){
      if(!p.online||p.down||p.ghost)continue;
      const region=regionAt(p.x,p.z),tier=REGIONS[region].tier;if(!tier)continue;
      const near=this.enemies.filter(e=>e.roamer&&distance(e,p)<30).length;
      if(near>=ROAM.cap[tier]||this.spawnRng()>ROAM.chance[tier])continue;
      const pool=RESIDENTS[region];if(!pool.length)continue;
      for(let tries=0;tries<6;tries++){
        const a=this.spawnRng()*Math.PI*2,r=ROAM.spawnMin+this.spawnRng()*(ROAM.spawnMax-ROAM.spawnMin),x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;
        if(Math.hypot(x,z)>RULES.radius-3||tierAt(x,z)<1)continue;
        if(this.players.some(q=>q.online&&distance(q,{x,z})<ROAM.spawnMin-2))continue;
        this.spawnEnemy(pool[Math.floor(this.spawnRng()*pool.length)],x,z,{home:true,roamer:true,tier:tier-1,leash:ROAM.leash});break;
      }
    }
    this.enemies=this.enemies.filter(e=>!e.roamer||this.players.some(p=>p.online&&distance(p,e)<ROAM.despawn));
  }
  awardXp(p, amount, reason=''){
    if(!p||this.showcase||!(amount>0))return;
    p.level=p.level||1;p.xp=(p.xp||0)+Math.round(amount);
    let leveled=false;
    while(p.level<MAX_LEVEL&&p.xp>=xpToNext(p.level)){p.xp-=xpToNext(p.level);p.level++;leveled=true;}
    if(p.level>=MAX_LEVEL)p.xp=0;
    if(leveled){p.maxHp=maxHealth(p);p.hp=p.maxHp;p.courage=Math.max(p.courage,80);this.event('levelup',p.x,p.z,`Level ${p.level}`,{player:p.id});this.event('announce',p.x,p.z,`${p.name} reached level ${p.level}`);this.best.level=Math.max(this.best.level||1,p.level);}
  }
  shareXp(x,z,amount){for(const p of this.players)if(p.online&&!p.ghost&&Math.hypot(p.x-x,p.z-z)<SHARE_RADIUS)this.awardXp(p,amount);}
  /** Scatter rolled loot around a point, announcing anything rare or better. */
  spillLoot(rolls,x,z,finder){
    rolls.forEach(({itemId,count},index)=>{
      if(!itemDefinition(itemId))return;
      const a=(index+.5)/Math.max(1,rolls.length)*Math.PI*2+this.lootRng()*.5,r=.7+this.lootRng()*.5;
      this.dropNew(itemId,count,x+Math.cos(a)*r,z+Math.sin(a)*r);
      const rank=rarityRank(itemId);
      if(rank>=2){this.event('rare',x,z,label(itemId),{itemId,rank});if(rank>=3)this.event('announce',x,z,`${finder?`${finder} found `:''}${label(itemId)}!`);}
      if(rank>(this.best.lootRank??-1)){this.best.lootRank=rank;this.best.loot=itemId;}
    });
  }
  tick(dt=RULES.tick){
    pruneChests(this);if(this.status!=='playing')return;dt=clamp(dt,0,.1);const before=phaseAt(this.time),oldDay=dayAt(this.time);this.time+=dt;const phase=phaseAt(this.time);
    if(before!==phase){const survived=dayAt(this.time)-1;this.event('phase',0,0,phase==='day'?(survived>0?`Dawn. ${survived} ${survived===1?'night':'nights'} survived.`:'Dawn. You made it.'):phase==='dusk'?'Dusk is falling. Return to your fire.':'Keep the fire alive.');if(phase==='day')this.best.day=Math.max(this.best.day||1,dayAt(this.time));if(phase==='night'&&!this.showcase){this.spawnWave();this.armNextWave();}else if(phase==='night')this.armNextWave();if(phase==='day'){for(const p of this.players)if(p.down||p.ghost)this.revivePlayer(p);this.enemies=this.enemies.filter(e=>e.type==='king'||e.home||isMagicAlly(e));}}
    if(!this.showcase&&dayAt(this.time)!==oldDay&&this.bossSlain&&!this.endless){this.status='victory';this.event('announce',0,0,'The curse is broken. Your fire still burns.');return;}
    if(phase==='night'&&this.time>=this.nextSpawn){if(!this.showcase&&this.invaders().length<22)this.spawnWave();this.armNextWave();}
    this.maintainGuards();this.roam(dt);
    for(const n of this.nodes)if(n.ready&&n.ready<this.time){n.ready=0;n.hits=NODES[n.type].hits;}
    const obstacles=this.obstacles();
    for(const p of this.players){
      if(!p.online)continue;p.cooldown=Math.max(0,p.cooldown-dt);p.dash=Math.max(0,p.dash-dt);p.dashCooldown=Math.max(0,p.dashCooldown-dt);
      if(p.ghost)continue;
      if(p.down){p.down-=dt;if(p.down<=0){p.down=0;p.ghost=true;p.revive=0;this.reviveWork.delete(p.id);this.dropContainer(p.inventory, p.x, p.z);p.inventory=createBackpack(p.id);this.event('announce',p.x,p.z,`${p.name} will return at dawn`);}continue;}
      if(!this.showcase){
        p.hunger=Math.max(0,p.hunger-dt*(p.rest?.45:.075));
        const light=phase!=='night'||this.lit(p);p.courage=clamp(p.courage+dt*(light?.6:-3),0,100);
        if(p.hunger<=0)this.hurtQuiet(p,dt*1.2);if(!light&&p.courage<20)this.hurtQuiet(p,dt*(p.courage<=0?6:2));
      }
      p.stamina=Math.min(100,p.stamina+dt*(p.rest?25:15));
      if(p.lantern&&p.equipment.light?.itemId==='everlantern'&&p.equipment.light.durability>0){}
      else if(p.lantern&&p.equipment.light?.itemId==='torch'&&p.equipment.light.durability>0)this.wearEquipped(p,'light',dt);
      else if(p.lantern)p.lantern=false;
      if(p.rest){if(this.showcase||phase==='night'||p.hunger<15)p.rest=false;else{p.hp=Math.min(maxHealth(p),p.hp+dt*3);p.courage=Math.min(100,p.courage+dt*4);continue;}}
      let input=this.inputs.get(p.id)||{x:0,z:0};if(this.time-input.at>.6)input={x:0,z:0};let x=input.x||0,z=input.z||0;
      if(p.goal){
        const goal=p.goal;
        const node=this.nodes.find(n=>n.id===goal.target);
        const building=this.buildings.find(b=>b.id===goal.target);
        const drop=this.drops.find(d=>d.id===goal.target&&!d.flight);
        const goalTarget=node||building||drop;
        const d=distance(p,goal), stop=drop?PICKUP.touch*0.5:goalTarget?2.05:.25;
        if(d>stop){x=(goal.x-p.x)/d;z=(goal.z-p.z)/d;}
        else if(!goalTarget||(node&&node.ready>this.time))p.goal=null;
        else if(drop)p.goal=null;
        else if(!node&&p.cooldown<=0){this.interact(p,goal.target);p.goal=null;}
      }
      const moving=Math.hypot(x,z)>.08;if(moving){p.dx=x;p.dz=z;const speed=RULES.speed*(p.dash>0?3:1)*(p.hunger<=0?.65:1);const moved=this.move(p,x*speed,z*speed,dt,obstacles);if(!moved&&p.goal){this.move(p,-z*speed,x*speed,dt,obstacles);}p.action=p.dash>0?'dash':'walk';}
      else if(this.time>p.actionUntil)p.action='idle';
      if(p.cooldown<=0){if(input.attack)this.attack(p);else if(input.act){const aimed=this.target(p, typeof input.target==='string'?input.target:null);if(aimed?.kind==='building')this.interact(p, aimed.entity.id);}}
      if(this.showcase){p.hp=maxHealth(p);p.hunger=100;p.courage=100;p.down=0;p.ghost=false;}
    }
    this.stepMagic(dt);this.stepProjectiles(dt);stepArsenal(this, dt, obstacles);
    for(const b of this.buildings){
      b.cooldown=Math.max(0,b.cooldown-dt);if(b.type==='hearth'&&b.hp>0&&phase==='day'&&!this.showcase)b.hp=Math.min(b.maxHp,b.hp+dt*1.5);if(['hearth','fire'].includes(b.type))b.fuel=Math.max(0,b.fuel-dt*(phase==='day'?.18:1));
      if(b.type==='farm'&&b.planted)b.growth=Math.min(100,b.growth+dt*(phase==='day'?1:.35));
      if(b.type==='trap'&&b.charges>0&&b.cooldown<=0){const enemy=this.enemies.find(enemy=>!isMagicAlly(enemy)&&distance(enemy,b)<1.1);if(enemy){enemy.hp-=65;enemy.slowed=3;b.charges--;b.cooldown=1;this.event('damage',enemy.x,enemy.z,'65');}}
      if(b.type==='hearth'&&b.fuel>0&&b.cooldown<=0&&!this.showcase){const enemy=this.enemies.find(enemy=>!isMagicAlly(enemy)&&distance(enemy,b)<HEARTH_FLARE.range);if(enemy){enemy.hp-=HEARTH_FLARE.damage;b.cooldown=HEARTH_FLARE.period;this.event('bolt',enemy.x,enemy.z,String(HEARTH_FLARE.damage),{sx:b.x,sz:b.z});}}
      if(b.type==='ward'&&b.cooldown<=0){const enemy=this.enemies.find(enemy=>!isMagicAlly(enemy)&&distance(enemy,b)<6);if(enemy){enemy.hp-=18;b.cooldown=2;this.event('bolt',enemy.x,enemy.z,'18',{sx:b.x,sz:b.z});}}
    }
    for(const e of this.enemies){
      if(e.hp<=0)continue;
      if(isMagicAlly(e))continue;
      if(this.tickRoot(e, dt)){
        e.cooldown=Math.max(0, e.cooldown-dt);
        if(e.windup>0){
          const def=ENEMIES[e.type];
          e.windup-=dt;
          if(e.windup<=0&&def){
            const people=this.players.filter(p=>p.online&&!p.down&&!p.ghost);
            for(const person of people)if(Math.hypot(person.x-e.tx,person.z-e.tz)<(e.type==='king'?4:1.9))this.hurt(person,def.damage*(e.power||1));landBlow(this,e,def.damage*(e.power||1),e.type==='king'?4:1.9);
            for(const building of this.buildings)if(Math.hypot(building.x-e.tx,building.z-e.tz)<(e.type==='king'?4:1.4))building.hp-=def.damage*(e.power||1)*structureHit(building);
            this.event('impact',e.tx,e.tz,'');e.cooldown=def.period;
          }
        }
        continue;
      }
      const def=ENEMIES[e.type];if(!def)continue;e.cooldown-=dt;e.slowed=Math.max(0,e.slowed-dt);
      const people=this.players.filter(p=>p.online&&!p.down&&!p.ghost).sort((a,b)=>distance(a,e)-distance(b,e));
      const hearth=this.buildings.find(b=>b.type==='hearth');let target;
      if(e.home){
        const prey=[preyFor(this,e,people,e.aggro?ROAM.aggro+6:ROAM.aggro)].find(q=>q&&Math.hypot(q.x-e.home.x,q.z-e.home.z)<e.leash+8)||null;
        if(prey){e.aggro=true;target=prey;}
        else{e.aggro=false;if(Math.hypot(e.x-e.home.x,e.z-e.home.z)<1.2){if(e.hp<e.maxHp)e.hp=Math.min(e.maxHp,e.hp+dt*e.maxHp*.05);continue;}target={x:e.home.x,z:e.home.z,homing:true};}
      }else{const near=preyFor(this,e,people,12);target=near||hearth||(this.showcase?people[0]:null);}
      if(!target)continue;
      if(e.windup>0){e.windup-=dt;if(e.windup<=0){for(const person of people)if(Math.hypot(person.x-e.tx,person.z-e.tz)<(e.type==='king'?4:1.9))this.hurt(person,def.damage*(e.power||1));landBlow(this,e,def.damage*(e.power||1),e.type==='king'?4:1.9);for(const building of this.buildings)if(Math.hypot(building.x-e.tx,building.z-e.tz)<(e.type==='king'?4:1.4))building.hp-=def.damage*(e.power||1)*structureHit(building);this.event('impact',e.tx,e.tz,'');e.cooldown=def.period;}continue;}
      const d=distance(e,target);const barricade=!target.homing&&this.buildings.find(b=>['wall','gate'].includes(b.type)&&!b.open&&distance(b,e)<1.65);
      if(barricade&&e.cooldown<=0){barricade.hp-=def.damage*(e.power||1)*STRUCTURE_HIT;e.cooldown=def.period;this.event('hit',barricade.x,barricade.z);continue;}
      if(!target.homing&&d<def.range+.5&&e.cooldown<=0){e.tx=target.x;e.tz=target.z;e.windup=e.type==='king'?1.35:.6;continue;}
      if(d>def.range*.8){const speed=def.speed*(e.slowed>0?.3:1);const moved=this.move(e,(target.x-e.x)/d*speed,(target.z-e.z)/d*speed,dt,obstacles);if(!moved){const wall=this.buildings.filter(b=>b.type!=='trap'&&distance(b,e)<2).sort((a,b)=>distance(a,e)-distance(b,e))[0];if(wall&&!target.homing&&e.cooldown<=0){wall.hp-=def.damage*(e.power||1)*STRUCTURE_HIT;e.cooldown=def.period;}else this.move(e,-(target.z-e.z)/d*speed,(target.x-e.x)/d*speed,dt,obstacles);}}
    }
    for(const e of this.enemies.filter(e=>e.hp<=0)){const loot=ENEMIES[e.type]?.loot;if(loot)for(const[itemId, count]of Object.entries(loot))this.dropNew(itemId, count, e.x+(this.rng()-.5), e.z+(this.rng()-.5));if(!isMagicAlly(e)){this.kills++;if(!this.showcase){this.spillLoot(rollLoot(e.type,this.lootRng,(e.elite?ELITE.luck:0)+(e.guardOf?.5:0)),e.x,e.z,this.player(e.lastHitBy)?.name);this.shareXp(e.x,e.z,enemyXp(e.type)*(e.elite?ELITE.xp:1)*(1+.08*((e.level||1)-1)));}}this.event('kill',e.x,e.z);if(e.type==='king'){this.bossSlain=true;this.event('announce',e.x,e.z,'The Hollow King falls. His treasure spills across the grass.');}}
    this.enemies=this.enemies.filter(e=>e.hp>0);
    for(const building of this.buildings.filter(b=>b.hp<=0)){this.dropContainer(building.store, building.x, building.z);if(building.overflow)this.dropContainer(building.overflow, building.x, building.z);this.event('break',building.x,building.z,`${STRUCTURES[building.type].name} destroyed`);if(building.type==='hearth'&&!this.showcase)this.status='defeat';}
    this.buildings=this.buildings.filter(b=>b.hp>0);this.drops=this.drops.filter(d=>d.stack?.quantity>0&&(d.flight||d.until>this.time));
    const active=this.players.filter(p=>p.online);if(active.length&&active.every(p=>(p.down||p.ghost)&&!p.charm)){this.wipe+=dt;if(this.wipe>6)this.status='defeat';}else this.wipe=0;
    this.discoverTimer-=dt;if(this.discoverTimer<=0){this.discoverTimer=.5;const seen=new Set(this.explored),N=EXPLORE_SIZE,R=RULES.radius;for(const p of active){const gx=Math.floor((p.x+R)/EXPLORE_CELL),gz=Math.floor((p.z+R)/EXPLORE_CELL);for(let x=gx-2;x<=gx+2;x++)for(let z=gz-2;z<=gz+2;z++)if(x>=0&&z>=0&&x<N&&z<N)seen.add(z*N+x);
      if(!p.ghost&&!this.showcase){const region=regionAt(p.x,p.z);p.regions=Array.isArray(p.regions)?p.regions:['meadow'];if(!p.regions.includes(region)){p.regions.push(region);this.awardXp(p,DISCOVER_XP*(1+REGIONS[region].tier));this.event('discover',p.x,p.z,REGIONS[region].name,{player:p.id});this.tell(p,`Discovered ${REGIONS[region].name}`);}}}
      this.explored=[...seen];}
    if(this.status==='playing')this.advanceChannels(dt);
    pruneChests(this);this.assertItems();
  }
  hurtQuiet(p,amount){if(this.showcase||p.down||p.ghost)return;p.hp-=amount;if(p.hp<=0){releaseChests(this,p.id);p.hp=0;p.down=40;p.revive=0;p.goal=null;this.event('announce',p.x,p.z,`${p.name} has fallen`);}}
  resumeExpedition(){
    releaseChests(this);this.networkId=crypto.randomUUID();this.transactionRevision=0;
    this.harvestWork.clear();this.reviveWork.clear();this.activations.clear();this.dismantleHolds.clear();this.damagedAt.clear();this.pickupDwell.clear();this.packNoticeAt.clear();
    for(const p of this.players){p.online=p.id==='host';p.goal=null;p.rest=false;p.action='idle';p.actionUntil=0;}
    this.inputs.clear();
  }
  snapshot(options={}){
    const purpose=options.purpose==='save'?'save':'network';
    const players=purpose==='save'?this.players.map(p=>({
      ...p, inventory:cloneContainer(p.inventory), equipment:cloneEquipment(p.equipment),
      recovery:p.recovery?cloneContainer(p.recovery):null, goal:null, rest:false, action:'idle', actionUntil:0,
    })):this.players;
    const data={
      version:this.version, clock:this.clock, seed:this.seed, time:this.time, status:this.status, players, buildings:this.buildings,
      enemies:this.enemies, drops:this.drops, events:this.events, explored:this.explored,
      nodeChanges:this.nodes.filter(n=>n.ready||n.hits!==NODES[n.type].hits).map(n=>({id:n.id, hits:n.hits, ready:n.ready})),
      idCounter:this.idCounter, eventId:this.eventId, wave:this.wave, nextSpawn:this.nextSpawn, kills:this.kills,
      bossSlain:this.bossSlain, bossSpawned:this.bossSpawned, endless:this.endless, stats:this.stats,
      projectiles:this.projectiles, allies:this.allies, zones:this.zones, bossNight:this.bossNight, guardsDay:this.guardsDay, best:this.best, roamTimer:this.roamTimer,
      ...magicSnapshotFields(this),
    };
    if(purpose==='network'){pruneChests(this);data.chestBusy=[...this.chestSessions.values()].map(s=>({...s}));data.worldId=this.networkId;data.transactionRevision=this.transactionRevision;}
    return data;
  }
  static restore(data){
    if(data&&typeof data==='object')settleStorage(data);
    if(!validateV2World(data).ok||data.clock!==CLOCK_V2)throw new Error('This save is not a Hollowstead expedition.');
    const world=new World(data.seed);
    for(const key of ['time','status','players','buildings','enemies','drops','events','explored','idCounter','eventId','wave','nextSpawn','kills','bossSlain','bossSpawned','endless','stats','projectiles','allies','zones','bossNight','guardsDay','best','roamTimer'])if(data[key]!==undefined)world[key]=structuredClone(data[key]);
    world.endless=true;if(world.status==='victory')world.status='playing';
    for(const p of world.players){p.level=p.level||1;p.xp=p.xp||0;p.bonusHp=p.bonusHp||0;p.maxHp=maxHealth(p);if(!Array.isArray(p.regions))p.regions=['meadow'];}
    world.version=SAVE_VERSION_V2;world.clock=CLOCK_V2;
    for(const change of data.nodeChanges||[]){const node=world.nodes.find(entry=>entry.id===change.id);if(node){node.hits=change.hits;node.ready=change.ready;}}
    if(typeof data.worldId==='string')world.networkId=data.worldId;
    world.transactionRevision=data.transactionRevision||0;
    for(const session of data.chestBusy||[])world.chestSessions.set(session.chestId,{...session});
    restoreMagicFields(world, data);
    repairIdCounter(world);world.assertItems();return world;
  }
  static fromSave(document){
    if(!document?.world)throw new Error('This save is not a Hollowstead expedition.');
    const {chestBusy,worldId,transactionRevision,...saved}=document.world;
    return World.restore(saved);
  }
}
