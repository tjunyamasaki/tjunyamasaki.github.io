import {RULES, ITEMS, EQUIPMENT, NODES, STRUCTURES, RECIPES, ENEMIES, CHARACTERS, phaseAt, dayAt, label} from './content.mjs?v=harvest-5';
import {
  CLOCK_V1, DROP_LIFETIME_SECONDS, EQUIPMENT_SLOTS, SAVE_VERSION_V2, SUPPLY_CAPACITY,
  cloneContainer, cloneEquipment, cloneStack, collectLocations, countItem, createBackpack, createContainer,
  containerId, duplicateUids, emptyEquipment, equippedLanternLit, equipmentSlotFor, findStack, isMaterial,
  itemDefinition, makeStack, planConsume, planEquip, planInsert, planMove, planTake, planUnequip,
  supplyLoad, wearStack,
} from './inventory.mjs?v=harvest-5';
import {repairIdCounter, validateV2World} from './serialization.mjs?v=harvest-5';
import {INTENTS, inSupplyChestRange} from './contracts.mjs?v=harvest-5';
import {pruneChests, releaseChests} from './chests.mjs?v=harvest-5';
import {inventoryIntent} from './transactions.mjs?v=harvest-5';

export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function biome(x,z){return x>12&&z<10?'graveyard':z<-10||x<-16?'woods':'meadow';}
export function makeMap(seed){
  const rng=random(seed),nodes=[];
  const add=(type,x,z)=>nodes.push({id:`n${nodes.length}`,type,x,z,hits:NODES[type].hits,ready:0});
  // The first clearing guarantees every basic material within a short walk.
  for(const [t,x,z] of [['tree',-4,-3],['tree',-7,1],['rock',4,-3],['grass',-2,3],['grass',3,3],['bush',5,2],['pumpkin',-4,5],['rock',7,-1],['tree',-6,-6],['grass',1,5],['mushroom',-7,5]])add(t,x,z);
  for(let i=0;i<1100&&nodes.length<270;i++){
    const x=(rng()-.5)*78,z=(rng()-.5)*78;
    if(Math.hypot(x,z)<7||nodes.some(n=>Math.hypot(x-n.x,z-n.z)<2.3))continue;
    const b=biome(x,z),r=rng();
    const pool=b==='woods'?['tree','tree','tree','grass','mushroom','bush','rock']:b==='graveyard'?['grave','ore','grave','rock','tree','mushroom','grass']:['pumpkin','bush','grass','tree','rock','grass','pumpkin'];
    add(pool[Math.floor(r*pool.length)],x,z);
  }
  return nodes;
}
export class World {
  constructor(seed=(Math.random()*0xffffffff)>>>0){
    this.version=SAVE_VERSION_V2;this.clock=CLOCK_V1;this.seed=seed;this.time=0;this.status='lobby';this.players=[];this.nodes=makeMap(seed);
    this.buildings=[this.structure('hearth',0,0)];this.enemies=[];this.drops=[];this.events=[];this.explored=[];
    this.idCounter=1;this.eventId=0;this.wave=0;this.nextSpawn=0;this.kills=0;this.bossSlain=false;this.bossSpawned=false;this.endless=false;this.wipe=0;
    this.networkId=crypto.randomUUID();this.transactionRevision=0;this.chestSessions=new Map();
    this.stats={gathered:0,built:0,revives:0};this.inputs=new Map();this.rng=random(seed^0x1234);this.discoverTimer=0;
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
      ? createContainer(containerId('chest', id), 36)
      : createContainer(containerId('chest', id), 0);
    return {id,type,x,z,hp:STRUCTURES[type].hp,maxHp:STRUCTURES[type].hp,fuel:type==='hearth'?150:type==='fire'?100:0,level:1,rotation:0,open:false,charges:3,growth:0,planted:false,store,cooldown:0};
  }
  addPlayer(id,name='Wanderer',character='ember'){
    if(typeof id!=='string'||id.length>64)return null;
    let p=this.players.find(p=>p.id===id);if(p){p.online=true;return p;}
    if(this.players.filter(p=>p.online).length>=RULES.maxPlayers)return null;
    if(this.players.length>=RULES.maxPlayers){const old=this.players.find(p=>!p.online);if(old){this.spillPlayer(old);this.players=this.players.filter(p=>p!==old);}}
    p={id,name:String(name).replace(/[<>\x00-\x1f]/g,'').trim().slice(0,18)||'Wanderer',character:CHARACTERS.some(c=>c.id===character)?character:'ember',x:2+this.players.length*.8,z:1.8,dx:0,dz:1,hp:100,hunger:90,courage:100,stamina:100,inventory:createBackpack(id),equipment:emptyEquipment(),equipmentRevision:0,recovery:null,cooldown:0,dash:0,dashCooldown:0,down:0,ghost:false,revive:0,charm:1,online:true,lantern:false,rest:false,action:'idle',actionUntil:0,notice:'',noticeAt:0,goal:null};
    this.players.push(p);
    this.give(p,'wood',3);this.give(p,'stone',2);this.give(p,'fiber',3);this.give(p,'berry',3);
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
      const plan=planInsert(p.inventory, stack, {supplyCapacity:SUPPLY_CAPACITY, allowPartial:true, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()});
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
    const grow=this.buildings.some(building=>building.store===container);
    const capped=this.players.some(player=>player.inventory===container);
    let left=count,accepted=0;
    while(left>0){
      const quantity=Math.min(def.stackLimit, left);
      const stack=this.mintStack(itemId, quantity, def.kind==='equipment'?def.maxDurability:undefined);
      if(!stack)break;
      const plan=planInsert(container, stack, {supplyCapacity:capped?SUPPLY_CAPACITY:null, allowPartial:false, grow, acceptsItems:true, mintUid:()=>this.nextItemUid()});
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
    const plan=planInsert(clones[0], made.stack, {supplyCapacity:SUPPLY_CAPACITY, allowPartial:false, grow:false, acceptsItems:true, mintUid:()=>'preview-split'});
    return plan.ok?'':'Pack full — store or drop some supplies';
  }
  recipeReason(p,key){
    const recipe=RECIPES[key];
    if(!recipe)return 'Unknown recipe';
    if(recipe.station&&!this.nearby(p, recipe.station, 5))return recipe.station==='fire'?'Stand near a burning fire':`Stand near a ${label(recipe.station).toLowerCase()}`;
    if(!this.canPay(p, recipe.cost))return 'Gather the missing materials';
    if(recipe.kind!=='build'){
      const sources=[p.inventory, ...this.stores(p)];
      const clones=sources.map(cloneContainer);
      if(this.takeCost(clones, recipe.cost)){
        const outputId=recipe.result||key;
        const def=itemDefinition(outputId);
        const made=def&&makeStack('preview-output', outputId, 1, def.kind==='equipment'?def.maxDurability:undefined);
        const plan=made?.ok&&planInsert(clones[0], made.stack, {supplyCapacity:SUPPLY_CAPACITY, allowPartial:false, grow:false, acceptsItems:true, mintUid:()=>'preview-split'});
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
    const plan=planInsert(clones[0], made.stack, {supplyCapacity:SUPPLY_CAPACITY, allowPartial:false, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()});
    if(!plan.ok)return false;
    clones[0].slots=plan.slots;clones[0].revision=plan.revision;
    sources.forEach((live, index)=>{live.slots=clones[index].slots;live.revision=clones[index].revision;});
    return true;
  }
  canBuild(p,type,x,z){
    if(!RECIPES[type]||RECIPES[type].kind!=='build')return 'Unknown structure';
    if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>RULES.radius-2||Math.abs(z)>RULES.radius-2)return 'Outside the clearing';
    if(Math.hypot(x-p.x,z-p.z)>5.5)return 'Move closer to this spot';
    const radius=Math.max(.6,STRUCTURES[type].radius);
    if(this.buildings.length>=160)return 'The camp has reached its structure limit';
    if(this.players.some(q=>q.online&&!q.ghost&&Math.hypot(q.x-x,q.z-z)<radius+.4))return 'A wanderer is standing here';
    if(this.buildings.some(b=>Math.hypot(b.x-x,b.z-z)<Math.max(.65,STRUCTURES[b.type].radius)+radius+.1))return 'Too close to another structure';
    if(this.nodes.some(n=>!n.ready&&NODES[n.type].radius>.3&&Math.hypot(n.x-x,n.z-z)<NODES[n.type].radius+radius))return 'Clear these resources first';
    return this.recipeReason(p,type);
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
    const options={supplyCapacity:SUPPLY_CAPACITY, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()};
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
    if(loc.kind==='equipment'){
      if(cap!==loc.stack.quantity)return false;
      if(loc.slot==='light')p.lantern=false;
      const stack=loc.stack;p.equipment[loc.slot]=null;p.equipmentRevision++;
      this.placeDrop(stack, x, z);return true;
    }
    if(loc.kind!=='backpack'&&loc.kind!=='recovery')return false;
    if(cap===loc.stack.quantity){
      const stack=loc.stack;loc.container.slots[loc.slot]=null;loc.container.revision++;
      this.placeDrop(stack, x, z);
    }else{
      const piece=this.mintStack(loc.stack.itemId, cap, loc.stack.durability);
      if(!piece)return false;
      loc.stack.quantity-=cap;loc.container.revision++;
      this.placeDrop(piece, x, z);
    }
    if(loc.kind==='recovery')this.collapseRecovery(p);
    return true;
  }
  moveSlots(p,sourceSlot,destinationSlot,uid,quantity,sourceRevision,destinationRevision){
    const plan=planMove({
      source:p.inventory, destination:p.inventory, sourceSlot, destinationSlot, uid, quantity,
      sourceRevision, destinationRevision, mintUid:()=>this.nextItemUid(),
      destSupplyCapacity:SUPPLY_CAPACITY, sourceSupplyCapacity:SUPPLY_CAPACITY,
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
    if(p.cooldown>.05&&!['move','ping','lantern','dash'].includes(cmd.type))return {ok:false,code:'cooldown'};
    switch(cmd.type){
      case 'move':if(Number.isFinite(cmd.x)&&Number.isFinite(cmd.z)){p.goal={x:clamp(cmd.x,-41,41),z:clamp(cmd.z,-41,41),target:typeof cmd.target==='string'?cmd.target:null};p.rest=false;}break;
      case 'craft':{
        const recipe=RECIPES[cmd.recipe];if(!recipe||recipe.kind==='build')return;const reason=this.recipeReason(p, cmd.recipe);if(reason){this.tell(p, reason);return;}
        if(!this.commitCraft(p, cmd.recipe)){this.tell(p, 'Pack full — store or drop some supplies');return;}
        p.cooldown=.35;this.event('craft',p.x,p.z,label(recipe.result||cmd.recipe));break;
      }
      case 'build':{
        const x=Math.round(cmd.x*2)/2,z=Math.round(cmd.z*2)/2;const reason=this.canBuild(p, cmd.recipe, x, z);if(reason){this.tell(p, reason);return;}
        if(!this.pay(p, RECIPES[cmd.recipe].cost))return;const building=this.structure(cmd.recipe, x, z);building.rotation=cmd.rotation===1?1:0;this.buildings.push(building);this.stats.built++;p.cooldown=.4;this.event('build',x,z,STRUCTURES[building.type].name);break;
      }
      case 'use':{
        let stack=null;
        if(typeof cmd.uid==='string'){stack=p.inventory.slots.find(slot=>slot?.uid===cmd.uid)||null;if(!stack)return;}
        else if(typeof cmd.item==='string'&&itemDefinition(cmd.item))stack=p.inventory.slots.find(slot=>slot?.itemId===cmd.item)||null;
        if(!stack)return;
        const item=ITEMS[stack.itemId];if(!item||(!item.food&&!item.heal))return;
        if(p.hunger>=100&&item.food&&p.hp>=100){this.tell(p,'You are already full');return;}
        const consumed=planConsume({inventory:p.inventory, inventoryRevision:cmd.inventoryRevision, uid:stack.uid, quantity:1});
        if(!consumed.ok)return;
        p.inventory.slots=consumed.slots;p.inventory.revision=consumed.revision;
        p.hunger=clamp(p.hunger+(item.food||0),0,100);p.hp=clamp(p.hp+(item.heal||0),1,100);p.courage=clamp(p.courage+(item.courage||0),0,100);p.cooldown=.4;this.event('heal',p.x,p.z,item.food?'Delicious':'+35 health');break;
      }
      case 'eat':return {ok:false,code:'unsupported'};
      case 'interact':this.interact(p, cmd.target);break;
      case 'attack':this.attack(p);break;
      case 'dash':if(p.stamina>=28&&p.dashCooldown<=0){p.stamina-=28;p.dash=.24;p.dashCooldown=1.1;p.rest=false;this.event('dash',p.x,p.z);}break;
      case 'lantern':{
        const light=p.equipment.light;
        if(light?.itemId==='torch'&&light.durability>0){p.lantern=!p.lantern;break;}
        const index=p.inventory.slots.findIndex(slot=>slot?.itemId==='torch'&&slot.durability>0);
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
        let dropped=false;
        if(typeof cmd.uid==='string')dropped=this.dropOwned(p, cmd.uid, Number.isInteger(cmd.quantity)?cmd.quantity:undefined);
        else if(typeof cmd.item==='string'){const stack=p.inventory.slots.find(slot=>slot?.itemId===cmd.item);if(stack)dropped=this.dropOwned(p, stack.uid, undefined);}
        if(dropped)p.cooldown=.3;break;
      }
      case 'repair':{
        const building=this.buildings.find(b=>b.id===cmd.target&&distance(p,b)<4);if(!building||building.hp>=building.maxHp)return;if(!this.pay(p,{wood:1})){this.tell(p,'Need 1 wood');return;}building.hp=Math.min(building.maxHp, building.hp+90);p.cooldown=.4;this.event('heal',building.x,building.z,'Repaired');break;
      }
      case 'dismantle':{
        const building=this.buildings.find(b=>b.id===cmd.target&&b.type!=='hearth'&&distance(p,b)<4);if(!building)return;
        if(this.chestSessions.has(building.id))return {ok:false,code:'chestInUse'};
        for(const [itemId, count] of Object.entries(RECIPES[building.type].cost))this.give(p, itemId, Math.ceil(count*.5));
        this.dropContainer(building.store, building.x, building.z);this.buildings=this.buildings.filter(entry=>entry!==building);p.cooldown=.5;break;
      }
      case 'upgrade':{
        const building=this.nearby(p,'hearth');if(!building)return;if(building.level>=3){this.tell(p,'The Heartfire is fully awakened');return;}
        const cost=this.upgradeCost();if(!this.pay(p, cost)){this.tell(p,'The Heartfire needs more offerings');return;}
        building.level++;building.maxHp+=300;building.hp=building.maxHp;building.fuel=Math.min(360, building.fuel+120);this.event('build',building.x,building.z,`Heartfire • level ${building.level}`);p.cooldown=.5;break;
      }
      case 'ping':this.event('ping',p.x,p.z,`${p.name}: ${['Here!','Need help!','Back to camp!'].includes(cmd.text)?cmd.text:'Here!'}`,{player:p.id});p.cooldown=.2;break;
      default:return {ok:false,code:'unsupported'};
    }
    this.assertItems();
    return {ok:true,code:'ok'};
  }
  upgradeCost(){return this.buildings.find(b=>b.type==='hearth')?.level===1?{wood:10,stone:8,ember:4}:{wood:15,ore:6,ember:8};}
  target(p,id){
    const revive=this.players.find(q=>q.id!==p.id&&q.online&&q.down&&distance(p,q)<RULES.reach);if(revive)return {kind:'revive',entity:revive,label:'Revive teammate'};
    const candidates=[...this.drops.map(e=>({kind:'drop',entity:e,label:`Pick up ${label(e.stack.itemId)}`})),...this.nodes.filter(n=>!n.ready).map(e=>({kind:'node',entity:e,label:e.type==='tree'?'Chop':e.type==='rock'||e.type==='ore'||e.type==='grave'?'Mine':'Gather'})),...this.buildings.map(e=>({kind:'building',entity:e,label:this.buildingLabel(e)}))].filter(t=>distance(p,t.entity)<RULES.reach);
    return candidates.find(t=>t.entity.id===id)||candidates.sort((a,b)=>distance(p,a.entity)-distance(p,b.entity))[0];
  }
  buildingLabel(b){return ({hearth:'Feed heartfire',fire:'Feed fire',bench:'Workbench',chest:'Open supplies',wall:'Repair wall',gate:b.open?'Close gate':'Open gate',trap:b.charges<3?'Rearm trap':'Briar trap',farm:b.planted?(b.growth>=100?'Harvest pumpkins':'Growing…'):'Plant seed',pot:'Cook a feast',lantern:'Soul lantern',bed:'Rest',ward:'Warding totem'})[b.type];}
  interact(p,target){
    const t=this.target(p,target);if(!t)return;
    const e=t.entity;
    if(t.kind==='revive'){e.revive+=.55;p.cooldown=.45;this.event('heal',e.x,e.z,'Helping…');if(e.revive>=3){this.revivePlayer(e);this.stats.revives++;}return;}
    if(t.kind==='drop'){this.pickupDrop(p, e);p.cooldown=.2;return;}
    if(t.kind==='node'){
      const def=NODES[e.type],has=this.hasTool(p, def.tool);
      if(def.required&&!has){this.tell(p,`Craft a ${label(def.tool).toLowerCase()} first`);p.goal=null;return;}
      e.hits-=has?2:1;if(has)this.wearEquipped(p, equipmentSlotFor(def.tool), 1);
      p.cooldown=has?.5:.8;p.stamina=Math.max(0,p.stamina-2);p.action='gather';p.actionUntil=this.time+.4;p.dx=(e.x-p.x)/Math.max(.1,distance(e,p));p.dz=(e.z-p.z)/Math.max(.1,distance(e,p));this.event('hit',e.x,e.z,'',{key:e.type});
      if(e.hits<=0){for(const[itemId, count]of Object.entries(def.loot)){this.give(p, itemId, count);this.stats.gathered+=count;}e.ready=this.time+def.regrow;this.event('loot',e.x,e.z,Object.entries(def.loot).map(([itemId, count])=>`+${count} ${label(itemId)}`).join(' · '));p.goal=null;if(e.type==='grave'&&this.rng()<.45)this.spawnEnemy('wraith',e.x+1,e.z+1);}
      return;
    }
    if(t.kind==='building'){
      if(['fire','hearth'].includes(e.type)){if(e.fuel>320){this.tell(p,'The fire has plenty of fuel');return;}if(this.pay(p,{wood:1})){e.fuel=Math.min(360,e.fuel+55);this.event('craft',e.x,e.z,'+55 fuel');}else this.tell(p,'Feed the fire with wood');}
      if(e.type==='gate')e.open=!e.open;
      if(e.type==='wall')this.action(p.id,{type:'repair',target:e.id});
      if(e.type==='farm'){if(!e.planted){if(this.pay(p,{seed:1})){e.planted=true;e.growth=0;}else this.tell(p,'Need 1 pumpkin seed');}else if(e.growth>=100){this.give(p,'pumpkin',3);this.give(p,'seed',2);e.planted=false;e.growth=0;this.event('loot',e.x,e.z,'+3 pumpkins · +2 seeds');}}
      if(e.type==='trap'&&e.charges<3){if(this.pay(p,{stone:1})){e.charges=3;e.hp=e.maxHp;}else this.tell(p,'Need 1 flint to rearm');}
      if(e.type==='bed'){if(phaseAt(this.time)==='night')this.tell(p,'Too dangerous to sleep at night');else if(p.hunger<20)this.tell(p,'Eat before resting');else {p.rest=!p.rest;p.goal=null;}}
      p.cooldown=.45;
    }
  }
  pickupDrop(p,drop){
    const plan=planInsert(p.inventory, drop.stack, {supplyCapacity:SUPPLY_CAPACITY, allowPartial:true, grow:false, acceptsItems:true, mintUid:()=>this.nextItemUid()});
    if(!plan.ok||plan.accepted<=0){this.tell(p,'Pack full — store or drop some supplies');return false;}
    p.inventory.slots=plan.slots;p.inventory.revision=plan.revision;
    if(plan.remainder)drop.stack=plan.remainder;
    else this.drops=this.drops.filter(entry=>entry!==drop);
    this.assertItems();return true;
  }
  attack(p){
    if(p.stamina<7){this.tell(p,'Catch your breath');return;}
    const weapon=p.equipment.weapon,armed=!!(weapon&&weapon.durability>0&&equipmentSlotFor(weapon.itemId)==='weapon'),range=armed?3.3:2;
    const enemy=this.enemies.filter(entry=>distance(entry,p)<range).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    p.stamina-=7;p.cooldown=armed?.55:.65;p.rest=false;p.action='attack';p.actionUntil=this.time+.32;this.event('swing',p.x,p.z);
    if(enemy){p.dx=(enemy.x-p.x)/Math.max(.1,distance(enemy,p));p.dz=(enemy.z-p.z)/Math.max(.1,distance(enemy,p));const damage=armed?EQUIPMENT[weapon.itemId].damage:9;enemy.hp-=damage;enemy.x+=p.dx*.32;enemy.z+=p.dz*.32;this.event('damage',enemy.x,enemy.z,String(damage));if(armed)this.wearEquipped(p,'weapon',1);}
  }
  lit(p){return this.players.some(q=>equippedLanternLit(q)&&distance(p,q)<4)||this.buildings.some(b=>STRUCTURES[b.type].light&&(b.type==='lantern'||b.fuel>0)&&distance(p,b)<STRUCTURES[b.type].light+(b.type==='hearth'?(b.level-1)*1.5:0));}
  obstacles(){return [...this.nodes.filter(n=>!n.ready&&NODES[n.type].radius>.3).map(n=>({...n,radius:NODES[n.type].radius})),...this.buildings.filter(b=>STRUCTURES[b.type].radius>0&&!(b.type==='gate'&&b.open)).map(b=>({...b,radius:STRUCTURES[b.type].radius}))];}
  move(p,dx,dz,dt,obstacles){
    const can=(x,z)=>Math.abs(x)<41&&Math.abs(z)<41&&!obstacles.some(o=>o.id!==p.id&&Math.hypot(o.x-x,o.z-z)<o.radius+.33);
    const x=p.x+dx*dt,z=p.z+dz*dt;
    if(can(x,z)){p.x=x;p.z=z;return true;}
    let moved=false;if(can(x,p.z)){p.x=x;moved=true;}if(can(p.x,z)){p.z=z;moved=true;}return moved;
  }
  hurt(p,amount){if(p.dash>0||p.down||p.ghost)return;if(p.equipment.body?.itemId==='armor'&&p.equipment.body.durability>0){this.wearEquipped(p,'body',amount);amount*=.55;}p.hp-=amount;p.rest=false;this.event('hurt',p.x,p.z,`−${Math.ceil(amount)}`,{player:p.id});if(p.hp<=0){releaseChests(this,p.id);p.hp=0;p.down=40;p.revive=0;p.goal=null;this.event('announce',p.x,p.z,`${p.name} needs a hand!`);}}
  revivePlayer(p){p.down=0;p.ghost=false;p.hp=50;p.courage=50;p.hunger=Math.max(35,p.hunger);p.revive=0;const hearth=this.buildings.find(b=>b.type==='hearth');if(hearth){p.x=hearth.x+2;p.z=hearth.z+2;}this.event('heal',p.x,p.z,'Back on your feet');}
  spawnEnemy(type,x,z){const def=ENEMIES[type],scale=1+(this.players.filter(p=>p.online).length-1)*.35;this.enemies.push({id:this.nextId('e'),type,x,z,hp:def.hp*scale,maxHp:def.hp*scale,cooldown:1,windup:0,slam:0,tx:x,tz:z,slowed:0});}
  spawnWave(){
    const day=dayAt(this.time),humans=this.players.filter(p=>p.online).length;this.wave++;
    const count=Math.min(11,2+day+Math.floor(humans/2));const hearth=this.buildings.find(b=>b.type==='hearth')||{x:0,z:0};
    for(let i=0;i<count;i++){const a=this.rng()*Math.PI*2,r=16+this.rng()*6;const type=day>=3&&i===0?'brute':day>=2&&i%3===0?'wraith':'crawler';this.spawnEnemy(type,clamp(hearth.x+Math.cos(a)*r,-38,38),clamp(hearth.z+Math.sin(a)*r,-38,38));}
    if(day>=RULES.finalNight&&!this.bossSpawned){this.bossSpawned=true;this.spawnEnemy('king',0,-19);this.event('announce',0,0,'The Hollow King has found your fire.');}
    else this.event('announce',0,0,`Night ${day} • the woods are waking`);
  }
  tick(dt=RULES.tick){
    pruneChests(this);if(this.status!=='playing')return;dt=clamp(dt,0,.1);const before=phaseAt(this.time),oldDay=dayAt(this.time);this.time+=dt;const phase=phaseAt(this.time);
    if(before!==phase){this.event('phase',0,0,phase==='day'?'Dawn. You made it.':phase==='dusk'?'Dusk is falling. Return to your fire.':'Keep the fire alive.');if(phase==='night'){this.spawnWave();this.nextSpawn=this.time+32;}if(phase==='day'){for(const p of this.players)if(p.down||p.ghost)this.revivePlayer(p);this.enemies=this.enemies.filter(e=>e.type==='king');}}
    if(dayAt(this.time)!==oldDay&&this.bossSlain&&!this.endless){this.status='victory';this.event('announce',0,0,'The curse is broken. Your fire still burns.');return;}
    if(phase==='night'&&this.time>=this.nextSpawn){if(this.enemies.length<22)this.spawnWave();this.nextSpawn=this.time+32;}
    for(const n of this.nodes)if(n.ready&&n.ready<this.time){n.ready=0;n.hits=NODES[n.type].hits;}
    const obstacles=this.obstacles();
    for(const p of this.players){
      if(!p.online)continue;p.cooldown=Math.max(0,p.cooldown-dt);p.dash=Math.max(0,p.dash-dt);p.dashCooldown=Math.max(0,p.dashCooldown-dt);
      if(p.ghost)continue;
      if(p.down){p.down-=dt;p.revive=Math.max(0,p.revive-dt*.12);if(p.down<=0){p.down=0;p.ghost=true;this.dropContainer(p.inventory, p.x, p.z);p.inventory=createBackpack(p.id);this.event('announce',p.x,p.z,`${p.name} will return at dawn`);}continue;}
      p.hunger=Math.max(0,p.hunger-dt*(p.rest?.45:.075));p.stamina=Math.min(100,p.stamina+dt*(p.rest?25:15));
      const light=phase!=='night'||this.lit(p);p.courage=clamp(p.courage+dt*(light?.6:-3),0,100);
      if(p.hunger<=0)this.hurtQuiet(p,dt*1.2);if(!light&&p.courage<20)this.hurtQuiet(p,dt*(p.courage<=0?6:2));
      if(p.lantern&&p.equipment.light?.itemId==='torch'&&p.equipment.light.durability>0)this.wearEquipped(p,'light',dt);
      else if(p.lantern)p.lantern=false;
      if(p.rest){if(phase==='night'||p.hunger<15)p.rest=false;else{p.hp=Math.min(100,p.hp+dt*3);p.courage=Math.min(100,p.courage+dt*4);}continue;}
      let input=this.inputs.get(p.id)||{x:0,z:0};if(this.time-input.at>.6)input={x:0,z:0};let x=input.x||0,z=input.z||0;
      if(p.goal){const goal=p.goal;const goalTarget=this.nodes.find(n=>n.id===goal.target)||this.buildings.find(b=>b.id===goal.target)||this.drops.find(d=>d.id===goal.target);const d=distance(p,goal),stop=goalTarget?2.05:.25;if(d>stop){x=(goal.x-p.x)/d;z=(goal.z-p.z)/d;}else{if(goalTarget&&p.cooldown<=0){this.interact(p,goal.target);if(!this.nodes.includes(goalTarget))p.goal=null;}else if(!goalTarget)p.goal=null;}}
      const moving=Math.hypot(x,z)>.08;if(moving){p.dx=x;p.dz=z;const speed=RULES.speed*(p.dash>0?3:1)*(p.hunger<=0?.65:1);const moved=this.move(p,x*speed,z*speed,dt,obstacles);if(!moved&&p.goal){this.move(p,-z*speed,x*speed,dt,obstacles);}p.action=p.dash>0?'dash':'walk';}
      else if(this.time>p.actionUntil)p.action='idle';
      if(p.cooldown<=0){if(input.attack)this.attack(p);else if(input.act)this.interact(p,input.target);}
    }
    for(const b of this.buildings){
      b.cooldown=Math.max(0,b.cooldown-dt);if(['hearth','fire'].includes(b.type))b.fuel=Math.max(0,b.fuel-dt*(phase==='day'?.18:1));
      if(b.type==='farm'&&b.planted)b.growth=Math.min(100,b.growth+dt*(phase==='day'?1:.35));
      if(b.type==='trap'&&b.charges>0&&b.cooldown<=0){const enemy=this.enemies.find(enemy=>distance(enemy,b)<1.1);if(enemy){enemy.hp-=65;enemy.slowed=3;b.charges--;b.cooldown=1;this.event('damage',enemy.x,enemy.z,'65');}}
      if(b.type==='ward'&&b.cooldown<=0){const enemy=this.enemies.find(enemy=>distance(enemy,b)<6);if(enemy){enemy.hp-=18;b.cooldown=2;this.event('bolt',enemy.x,enemy.z,'18',{sx:b.x,sz:b.z});}}
    }
    for(const e of this.enemies){
      if(e.hp<=0)continue;const def=ENEMIES[e.type];e.cooldown-=dt;e.slowed=Math.max(0,e.slowed-dt);
      const people=this.players.filter(p=>p.online&&!p.down&&!p.ghost).sort((a,b)=>distance(a,e)-distance(b,e));
      const hearth=this.buildings.find(b=>b.type==='hearth');const target=people[0]&&distance(people[0],e)<12?people[0]:hearth;if(!target)continue;
      if(e.windup>0){e.windup-=dt;if(e.windup<=0){for(const person of people)if(Math.hypot(person.x-e.tx,person.z-e.tz)<(e.type==='king'?4:1.9))this.hurt(person,def.damage);for(const building of this.buildings)if(Math.hypot(building.x-e.tx,building.z-e.tz)<(e.type==='king'?4:1.4))building.hp-=def.damage;this.event('impact',e.tx,e.tz,'');e.cooldown=def.period;}continue;}
      const d=distance(e,target);const barricade=this.buildings.find(b=>['wall','gate'].includes(b.type)&&!b.open&&distance(b,e)<1.65);
      if(barricade&&e.cooldown<=0){barricade.hp-=def.damage;e.cooldown=def.period;this.event('hit',barricade.x,barricade.z);continue;}
      if(d<def.range+.5&&e.cooldown<=0){e.tx=target.x;e.tz=target.z;e.windup=e.type==='king'?1.35:.6;continue;}
      if(d>def.range*.8){const speed=def.speed*(e.slowed>0?.3:1);const moved=this.move(e,(target.x-e.x)/d*speed,(target.z-e.z)/d*speed,dt,obstacles);if(!moved){const wall=this.buildings.filter(b=>b.type!=='trap'&&distance(b,e)<2).sort((a,b)=>distance(a,e)-distance(b,e))[0];if(wall&&e.cooldown<=0){wall.hp-=def.damage;e.cooldown=def.period;}else this.move(e,-(target.z-e.z)/d*speed,(target.x-e.x)/d*speed,dt,obstacles);}}
    }
    for(const e of this.enemies.filter(e=>e.hp<=0)){for(const[itemId, count]of Object.entries(ENEMIES[e.type].loot))this.dropNew(itemId, count, e.x+(this.rng()-.5), e.z+(this.rng()-.5));this.kills++;this.event('kill',e.x,e.z);if(e.type==='king'){this.bossSlain=true;this.event('announce',e.x,e.z,'The Hollow King falls. Hold on until dawn.');}}
    this.enemies=this.enemies.filter(e=>e.hp>0);
    for(const building of this.buildings.filter(b=>b.hp<=0)){this.dropContainer(building.store, building.x, building.z);this.event('break',building.x,building.z,`${STRUCTURES[building.type].name} destroyed`);if(building.type==='hearth')this.status='defeat';}
    this.buildings=this.buildings.filter(b=>b.hp>0);this.drops=this.drops.filter(d=>d.until>this.time&&d.stack?.quantity>0);
    const active=this.players.filter(p=>p.online);if(active.length&&active.every(p=>(p.down||p.ghost)&&!p.charm)){this.wipe+=dt;if(this.wipe>6)this.status='defeat';}else this.wipe=0;
    this.discoverTimer-=dt;if(this.discoverTimer<=0){this.discoverTimer=.5;const seen=new Set(this.explored);for(const p of active){const gx=Math.floor((p.x+42)/4),gz=Math.floor((p.z+42)/4);for(let x=gx-2;x<=gx+2;x++)for(let z=gz-2;z<=gz+2;z++)if(x>=0&&z>=0&&x<21&&z<21)seen.add(z*21+x);}this.explored=[...seen];}
    pruneChests(this);this.assertItems();
  }
  hurtQuiet(p,amount){if(p.down||p.ghost)return;p.hp-=amount;if(p.hp<=0){releaseChests(this,p.id);p.hp=0;p.down=40;p.revive=0;this.event('announce',p.x,p.z,`${p.name} has fallen`);}}
  resumeExpedition(){
    releaseChests(this);this.networkId=crypto.randomUUID();this.transactionRevision=0;
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
    };
    if(purpose==='network'){pruneChests(this);data.chestBusy=[...this.chestSessions.values()].map(s=>({...s}));data.worldId=this.networkId;data.transactionRevision=this.transactionRevision;}
    return data;
  }
  static restore(data){
    if(!validateV2World(data).ok||data.clock!==CLOCK_V1)throw new Error('This save is not a Hollowstead expedition.');
    const world=new World(data.seed);
    for(const key of ['time','status','players','buildings','enemies','drops','events','explored','idCounter','eventId','wave','nextSpawn','kills','bossSlain','bossSpawned','endless','stats'])if(data[key]!==undefined)world[key]=structuredClone(data[key]);
    world.version=SAVE_VERSION_V2;world.clock=CLOCK_V1;
    for(const change of data.nodeChanges||[]){const node=world.nodes.find(entry=>entry.id===change.id);if(node){node.hits=change.hits;node.ready=change.ready;}}
    if(typeof data.worldId==='string')world.networkId=data.worldId;
    world.transactionRevision=data.transactionRevision||0;
    for(const session of data.chestBusy||[])world.chestSessions.set(session.chestId,{...session});
    repairIdCounter(world);world.assertItems();return world;
  }
  static fromSave(document){
    if(!document?.world)throw new Error('This save is not a Hollowstead expedition.');
    const {chestBusy,worldId,transactionRevision,...saved}=document.world;
    return World.restore(saved);
  }
}
