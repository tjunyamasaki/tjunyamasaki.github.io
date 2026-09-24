import {RULES, ITEMS, EQUIPMENT, NODES, STRUCTURES, RECIPES, ENEMIES, CHARACTERS, phaseAt, dayAt, label} from './content.mjs';
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
    this.version=RULES.version;this.seed=seed;this.time=0;this.status='lobby';this.players=[];this.nodes=makeMap(seed);
    this.buildings=[this.structure('hearth',0,0)];this.enemies=[];this.drops=[];this.events=[];this.explored=[];
    this.idCounter=1;this.eventId=0;this.wave=0;this.nextSpawn=0;this.kills=0;this.bossSlain=false;this.bossSpawned=false;this.endless=false;this.wipe=0;
    this.stats={gathered:0,built:0,revives:0};this.inputs=new Map();this.rng=random(seed^0x1234);this.discoverTimer=0;
  }
  nextId(prefix){return prefix+(this.idCounter++);}
  structure(type,x,z){return {id:type==='hearth'?'heart':`b${this.idCounter++}`,type,x,z,hp:STRUCTURES[type].hp,maxHp:STRUCTURES[type].hp,fuel:type==='hearth'?150:type==='fire'?100:0,level:1,rotation:0,open:false,charges:3,growth:0,planted:false,store:{},cooldown:0};}
  addPlayer(id,name='Wanderer',character='ember'){
    if(typeof id!=='string'||id.length>64)return null;
    let p=this.players.find(p=>p.id===id);if(p){p.online=true;return p;}
    if(this.players.filter(p=>p.online).length>=RULES.maxPlayers)return null;
    if(this.players.length>=RULES.maxPlayers){const old=this.players.find(p=>!p.online);if(old){this.dropInventory(old);this.players=this.players.filter(p=>p!==old);}}
    p={id,name:String(name).replace(/[<>\x00-\x1f]/g,'').trim().slice(0,18)||'Wanderer',character:CHARACTERS.some(c=>c.id===character)?character:'ember',x:2+this.players.length*.8,z:1.8,dx:0,dz:1,hp:100,hunger:90,courage:100,stamina:100,inventory:{wood:3,stone:2,fiber:3,berry:3},equipment:{},cooldown:0,dash:0,dashCooldown:0,down:0,ghost:false,revive:0,charm:1,online:true,lantern:false,rest:false,action:'idle',actionUntil:0,notice:'',noticeAt:0,goal:null};
    this.players.push(p);return p;
  }
  leave(id){const p=this.player(id);if(p){p.online=false;p.goal=null;this.inputs.delete(id);}}
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
  loadCount(p){return Object.values(p.inventory).reduce((a,b)=>a+b,0);}
  give(p,key,count){const n=Math.min(count,Math.max(0,RULES.capacity-this.loadCount(p)));if(n)p.inventory[key]=(p.inventory[key]||0)+n;if(n<count)this.drop(key,count-n,p.x,p.z);return n;}
  drop(key,count,x,z){if(count>0)this.drops.push({id:this.nextId('d'),type:key,count,x,z,until:this.time+600});}
  dropInventory(p){for(const [key,n]of Object.entries(p.inventory))this.drop(key,n,p.x,p.z);p.inventory={};}
  nearby(p,type,range=4){return this.buildings.find(b=>(b.type===type||(type==='fire'&&['hearth','fire'].includes(b.type)))&&b.hp>0&&distance(p,b)<range&&(type!=='fire'||b.fuel>0));}
  stores(p){return this.buildings.filter(b=>b.type==='chest'&&distance(p,b)<5).map(b=>b.store);}
  available(p,key){return (p.inventory[key]||0)+this.stores(p).reduce((n,s)=>n+(s[key]||0),0);}
  canPay(p,cost){return Object.entries(cost).every(([k,n])=>this.available(p,k)>=n);}
  pay(p,cost){if(!this.canPay(p,cost))return false;for(const[k,n]of Object.entries(cost)){let left=n;for(const inv of [p.inventory,...this.stores(p)]){const take=Math.min(left,inv[k]||0);if(take){inv[k]-=take;if(!inv[k])delete inv[k];left-=take;}if(!left)break;}}return true;}
  recipeReason(p,key){const r=RECIPES[key];if(!r)return 'Unknown recipe';if(r.station&&!this.nearby(p,r.station,5))return r.station==='fire'?'Stand near a burning fire':`Stand near a ${label(r.station).toLowerCase()}`;if(!this.canPay(p,r.cost))return 'Gather the missing materials';if(r.kind==='tool'&&(p.equipment[key]||0)>EQUIPMENT[key].durability*.8)return 'Your equipment is still in good condition';return '';}
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
  action(id,cmd){
    const p=this.player(id);if(!p||!p.online||this.status!=='playing'||!cmd||typeof cmd!=='object')return;
    if(p.down||p.ghost){if(cmd.type==='interact'&&p.charm>0){p.charm--;this.revivePlayer(p);this.event('heal',p.x,p.z,'Last charm');}return;}
    if(p.cooldown>.05&&!['move','ping','lantern','dash'].includes(cmd.type))return;
    switch(cmd.type){
      case 'move':if(Number.isFinite(cmd.x)&&Number.isFinite(cmd.z)){p.goal={x:clamp(cmd.x,-41,41),z:clamp(cmd.z,-41,41),target:typeof cmd.target==='string'?cmd.target:null};p.rest=false;}break;
      case 'craft':{
        const r=RECIPES[cmd.recipe];if(!r||r.kind==='build')return;const reason=this.recipeReason(p,cmd.recipe);if(reason){this.tell(p,reason);return;}
        if(!this.pay(p,r.cost))return;
        if(r.kind==='tool'){p.equipment[cmd.recipe]=EQUIPMENT[cmd.recipe].durability;if(cmd.recipe==='torch')p.lantern=true;}
        else this.give(p,r.result||cmd.recipe,1);
        p.cooldown=.35;this.event('craft',p.x,p.z,label(r.result||cmd.recipe));break;
      }
      case 'build':{
        const x=Math.round(cmd.x*2)/2,z=Math.round(cmd.z*2)/2;const reason=this.canBuild(p,cmd.recipe,x,z);if(reason){this.tell(p,reason);return;}
        if(!this.pay(p,RECIPES[cmd.recipe].cost))return;const b=this.structure(cmd.recipe,x,z);b.rotation=cmd.rotation===1?1:0;this.buildings.push(b);this.stats.built++;p.cooldown=.4;this.event('build',x,z,STRUCTURES[b.type].name);break;
      }
      case 'use':{
        const item=ITEMS[cmd.item];if(!item||(!item.food&&!item.heal)||!p.inventory[cmd.item])return;
        if(p.hunger>=100&&item.food&&p.hp>=100){this.tell(p,'You are already full');return;}
        p.inventory[cmd.item]--;if(!p.inventory[cmd.item])delete p.inventory[cmd.item];p.hunger=clamp(p.hunger+(item.food||0),0,100);p.hp=clamp(p.hp+(item.heal||0),1,100);p.courage=clamp(p.courage+(item.courage||0),0,100);p.cooldown=.4;this.event('heal',p.x,p.z,item.food?'Delicious':'+35 health');break;
      }
      case 'eat':{const food=['stew','roast','pumpkin','berry','mushroom','meat'].find(k=>p.inventory[k]);if(food)this.action(id,{type:'use',item:food});else this.tell(p,'No food in your pack');break;}
      case 'interact':this.interact(p,cmd.target);break;
      case 'attack':this.attack(p);break;
      case 'dash':if(p.stamina>=28&&p.dashCooldown<=0){p.stamina-=28;p.dash=.24;p.dashCooldown=1.1;p.rest=false;this.event('dash',p.x,p.z);}break;
      case 'lantern':if(p.equipment.torch>0)p.lantern=!p.lantern;else this.tell(p,'Craft a hand lantern first');break;
      case 'deposit':{
        const b=this.buildings.find(b=>b.id===cmd.target&&b.type==='chest'&&distance(p,b)<4);if(!b)return;
        for(const[k,n]of Object.entries(p.inventory))if(!ITEMS[k]?.food&&!ITEMS[k]?.heal){b.store[k]=(b.store[k]||0)+n;delete p.inventory[k];}this.tell(p,'Materials stored — nearby crafting uses this chest');p.cooldown=.3;break;
      }
      case 'withdraw':{
        const b=this.buildings.find(b=>b.id===cmd.target&&b.type==='chest'&&distance(p,b)<4);if(!b||!ITEMS[cmd.item])return;
        const n=Math.min(10,b.store[cmd.item]||0,RULES.capacity-this.loadCount(p));if(n){b.store[cmd.item]-=n;this.give(p,cmd.item,n);}p.cooldown=.2;break;
      }
      case 'drop':if(ITEMS[cmd.item]&&p.inventory[cmd.item]){const n=Math.min(5,p.inventory[cmd.item]);p.inventory[cmd.item]-=n;this.drop(cmd.item,n,p.x+p.dx,p.z+p.dz);p.cooldown=.3;}break;
      case 'repair':{
        const b=this.buildings.find(b=>b.id===cmd.target&&distance(p,b)<4);if(!b||b.hp>=b.maxHp)return;if(!this.pay(p,{wood:1})){this.tell(p,'Need 1 wood');return;}b.hp=Math.min(b.maxHp,b.hp+90);p.cooldown=.4;this.event('heal',b.x,b.z,'Repaired');break;
      }
      case 'dismantle':{
        const b=this.buildings.find(b=>b.id===cmd.target&&b.type!=='hearth'&&distance(p,b)<4);if(!b)return;for(const[k,n]of Object.entries(RECIPES[b.type].cost))this.give(p,k,Math.ceil(n*.5));for(const[k,n]of Object.entries(b.store))this.drop(k,n,b.x,b.z);this.buildings=this.buildings.filter(x=>x!==b);p.cooldown=.5;break;
      }
      case 'upgrade':{
        const b=this.nearby(p,'hearth');if(!b)return;if(b.level>=3){this.tell(p,'The Heartfire is fully awakened');return;}
        const cost=this.upgradeCost();if(!this.pay(p,cost)){this.tell(p,'The Heartfire needs more offerings');return;}
        b.level++;b.maxHp+=300;b.hp=b.maxHp;b.fuel=Math.min(360,b.fuel+120);this.event('build',b.x,b.z,`Heartfire • level ${b.level}`);p.cooldown=.5;break;
      }
      case 'ping':this.event('ping',p.x,p.z,`${p.name}: ${['Here!','Need help!','Back to camp!'].includes(cmd.text)?cmd.text:'Here!'}`,{player:p.id});p.cooldown=.2;break;
    }
  }
  upgradeCost(){return this.buildings.find(b=>b.type==='hearth')?.level===1?{wood:10,stone:8,ember:4}:{wood:15,ore:6,ember:8};}
  target(p,id){
    const revive=this.players.find(q=>q.id!==p.id&&q.online&&q.down&&distance(p,q)<RULES.reach);if(revive)return {kind:'revive',entity:revive,label:'Revive teammate'};
    const candidates=[...this.drops.map(e=>({kind:'drop',entity:e,label:`Pick up ${label(e.type)}`})),...this.nodes.filter(n=>!n.ready).map(e=>({kind:'node',entity:e,label:e.type==='tree'?'Chop':e.type==='rock'||e.type==='ore'||e.type==='grave'?'Mine':'Gather'})),...this.buildings.map(e=>({kind:'building',entity:e,label:this.buildingLabel(e)}))].filter(t=>distance(p,t.entity)<RULES.reach);
    return candidates.find(t=>t.entity.id===id)||candidates.sort((a,b)=>distance(p,a.entity)-distance(p,b.entity))[0];
  }
  buildingLabel(b){return ({hearth:'Feed heartfire',fire:'Feed fire',bench:'Workbench',chest:'Open supplies',wall:'Repair wall',gate:b.open?'Close gate':'Open gate',trap:b.charges<3?'Rearm trap':'Briar trap',farm:b.planted?(b.growth>=100?'Harvest pumpkins':'Growing…'):'Plant seed',pot:'Cook a feast',lantern:'Soul lantern',bed:'Rest',ward:'Warding totem'})[b.type];}
  interact(p,target){
    const t=this.target(p,target);if(!t)return;
    const e=t.entity;
    if(t.kind==='revive'){e.revive+=.55;p.cooldown=.45;this.event('heal',e.x,e.z,'Helping…');if(e.revive>=3){this.revivePlayer(e);this.stats.revives++;}return;}
    if(t.kind==='drop'){const n=Math.min(e.count,RULES.capacity-this.loadCount(p));this.give(p,e.type,n);e.count-=n;if(e.count<=0)this.drops=this.drops.filter(d=>d!==e);p.cooldown=.2;return;}
    if(t.kind==='node'){
      const def=NODES[e.type],has=def.tool&&p.equipment[def.tool]>0;
      if(def.required&&!has){this.tell(p,`Craft a ${label(def.tool).toLowerCase()} first`);p.goal=null;return;}
      if(this.loadCount(p)>=RULES.capacity){this.tell(p,'Pack full — store or drop some supplies');p.goal=null;return;}
      e.hits-=has?2:1;if(has)p.equipment[def.tool]=Math.max(0,p.equipment[def.tool]-1);
      p.cooldown=has?.5:.8;p.stamina=Math.max(0,p.stamina-2);p.action='gather';p.actionUntil=this.time+.4;p.dx=(e.x-p.x)/Math.max(.1,distance(e,p));p.dz=(e.z-p.z)/Math.max(.1,distance(e,p));this.event('hit',e.x,e.z,'',{key:e.type});
      if(e.hits<=0){for(const[k,n]of Object.entries(def.loot)){this.give(p,k,n);this.stats.gathered+=n;}e.ready=this.time+def.regrow;this.event('loot',e.x,e.z,Object.entries(def.loot).map(([k,n])=>`+${n} ${label(k)}`).join(' · '));p.goal=null;if(e.type==='grave'&&this.rng()<.45)this.spawnEnemy('wraith',e.x+1,e.z+1);}
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
  attack(p){
    if(p.stamina<7){this.tell(p,'Catch your breath');return;}
    const weapon=p.equipment.sword>0?'sword':p.equipment.spear>0?'spear':null,range=weapon?3.3:2;
    const e=this.enemies.filter(e=>distance(e,p)<range).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    p.stamina-=7;p.cooldown=weapon?.55:.65;p.rest=false;p.action='attack';p.actionUntil=this.time+.32;this.event('swing',p.x,p.z);
    if(e){p.dx=(e.x-p.x)/Math.max(.1,distance(e,p));p.dz=(e.z-p.z)/Math.max(.1,distance(e,p));const damage=weapon?EQUIPMENT[weapon].damage:9;e.hp-=damage;e.x+=p.dx*.32;e.z+=p.dz*.32;this.event('damage',e.x,e.z,String(damage));if(weapon)p.equipment[weapon]=Math.max(0,p.equipment[weapon]-1);}
  }
  lit(p){return this.players.some(q=>q.online&&!q.down&&!q.ghost&&q.lantern&&q.equipment.torch>0&&distance(p,q)<4)||this.buildings.some(b=>STRUCTURES[b.type].light&&(b.type==='lantern'||b.fuel>0)&&distance(p,b)<STRUCTURES[b.type].light+(b.type==='hearth'?(b.level-1)*1.5:0));}
  obstacles(){return [...this.nodes.filter(n=>!n.ready&&NODES[n.type].radius>.3).map(n=>({...n,radius:NODES[n.type].radius})),...this.buildings.filter(b=>STRUCTURES[b.type].radius>0&&!(b.type==='gate'&&b.open)).map(b=>({...b,radius:STRUCTURES[b.type].radius}))];}
  move(p,dx,dz,dt,obstacles){
    const can=(x,z)=>Math.abs(x)<41&&Math.abs(z)<41&&!obstacles.some(o=>o.id!==p.id&&Math.hypot(o.x-x,o.z-z)<o.radius+.33);
    const x=p.x+dx*dt,z=p.z+dz*dt;
    if(can(x,z)){p.x=x;p.z=z;return true;}
    let moved=false;if(can(x,p.z)){p.x=x;moved=true;}if(can(p.x,z)){p.z=z;moved=true;}return moved;
  }
  hurt(p,amount){if(p.dash>0||p.down||p.ghost)return;if(p.equipment.armor>0){p.equipment.armor=Math.max(0,p.equipment.armor-amount);amount*=.55;}p.hp-=amount;p.rest=false;this.event('hurt',p.x,p.z,`−${Math.ceil(amount)}`,{player:p.id});if(p.hp<=0){p.hp=0;p.down=40;p.revive=0;p.goal=null;this.event('announce',p.x,p.z,`${p.name} needs a hand!`);}}
  revivePlayer(p){p.down=0;p.ghost=false;p.hp=50;p.courage=50;p.hunger=Math.max(35,p.hunger);p.revive=0;const h=this.buildings.find(b=>b.type==='hearth');if(h){p.x=h.x+2;p.z=h.z+2;}this.event('heal',p.x,p.z,'Back on your feet');}
  spawnEnemy(type,x,z){const def=ENEMIES[type],scale=1+(this.players.filter(p=>p.online).length-1)*.35;this.enemies.push({id:this.nextId('e'),type,x,z,hp:def.hp*scale,maxHp:def.hp*scale,cooldown:1,windup:0,slam:0,tx:x,tz:z,slowed:0});}
  spawnWave(){
    const day=dayAt(this.time),humans=this.players.filter(p=>p.online).length;this.wave++;
    const count=Math.min(11,2+day+Math.floor(humans/2));const h=this.buildings.find(b=>b.type==='hearth')||{x:0,z:0};
    for(let i=0;i<count;i++){const a=this.rng()*Math.PI*2,r=16+this.rng()*6;const type=day>=3&&i===0?'brute':day>=2&&i%3===0?'wraith':'crawler';this.spawnEnemy(type,clamp(h.x+Math.cos(a)*r,-38,38),clamp(h.z+Math.sin(a)*r,-38,38));}
    if(day>=RULES.finalNight&&!this.bossSpawned){this.bossSpawned=true;this.spawnEnemy('king',0,-19);this.event('announce',0,0,'The Hollow King has found your fire.');}
    else this.event('announce',0,0,`Night ${day} • the woods are waking`);
  }
  tick(dt=RULES.tick){
    if(this.status!=='playing')return;dt=clamp(dt,0,.1);const before=phaseAt(this.time),oldDay=dayAt(this.time);this.time+=dt;const phase=phaseAt(this.time);
    if(before!==phase){this.event('phase',0,0,phase==='day'?'Dawn. You made it.':phase==='dusk'?'Dusk is falling. Return to your fire.':'Keep the fire alive.');if(phase==='night'){this.spawnWave();this.nextSpawn=this.time+32;}if(phase==='day'){for(const p of this.players)if(p.down||p.ghost)this.revivePlayer(p);this.enemies=this.enemies.filter(e=>e.type==='king');}}
    if(dayAt(this.time)!==oldDay&&this.bossSlain&&!this.endless){this.status='victory';this.event('announce',0,0,'The curse is broken. Your fire still burns.');return;}
    if(phase==='night'&&this.time>=this.nextSpawn){if(this.enemies.length<22)this.spawnWave();this.nextSpawn=this.time+32;}
    for(const n of this.nodes)if(n.ready&&n.ready<this.time){n.ready=0;n.hits=NODES[n.type].hits;}
    const obstacles=this.obstacles();
    for(const p of this.players){
      if(!p.online)continue;p.cooldown=Math.max(0,p.cooldown-dt);p.dash=Math.max(0,p.dash-dt);p.dashCooldown=Math.max(0,p.dashCooldown-dt);
      if(p.ghost)continue;
      if(p.down){p.down-=dt;p.revive=Math.max(0,p.revive-dt*.12);if(p.down<=0){p.down=0;p.ghost=true;this.dropInventory(p);this.event('announce',p.x,p.z,`${p.name} will return at dawn`);}continue;}
      p.hunger=Math.max(0,p.hunger-dt*(p.rest?.45:.075));p.stamina=Math.min(100,p.stamina+dt*(p.rest?25:15));
      const light=phase!=='night'||this.lit(p);p.courage=clamp(p.courage+dt*(light?.6:-3),0,100);
      if(p.hunger<=0)this.hurtQuiet(p,dt*1.2);if(!light&&p.courage<20)this.hurtQuiet(p,dt*(p.courage<=0?6:2));
      if(p.lantern&&p.equipment.torch>0){p.equipment.torch=Math.max(0,p.equipment.torch-dt);if(!p.equipment.torch)p.lantern=false;}
      if(p.rest){if(phase==='night'||p.hunger<15)p.rest=false;else{p.hp=Math.min(100,p.hp+dt*3);p.courage=Math.min(100,p.courage+dt*4);}continue;}
      let input=this.inputs.get(p.id)||{x:0,z:0};if(this.time-input.at>.6)input={x:0,z:0};let x=input.x||0,z=input.z||0;
      if(p.goal){const goal=p.goal;const target=this.nodes.find(n=>n.id===goal.target)||this.buildings.find(b=>b.id===goal.target)||this.drops.find(d=>d.id===goal.target);const d=distance(p,goal),stop=target?2.05:.25;if(d>stop){x=(goal.x-p.x)/d;z=(goal.z-p.z)/d;}else{if(target&&p.cooldown<=0){this.interact(p,goal.target);if(!this.nodes.includes(target))p.goal=null;}else if(!target)p.goal=null;}}
      const moving=Math.hypot(x,z)>.08;if(moving){p.dx=x;p.dz=z;const speed=RULES.speed*(p.dash>0?3:1)*(p.hunger<=0?.65:1);const moved=this.move(p,x*speed,z*speed,dt,obstacles);if(!moved&&p.goal){this.move(p,-z*speed,x*speed,dt,obstacles);}p.action=p.dash>0?'dash':'walk';}
      else if(this.time>p.actionUntil)p.action='idle';
      if(p.cooldown<=0){if(input.attack)this.attack(p);else if(input.act)this.interact(p,input.target);}
    }
    for(const b of this.buildings){
      b.cooldown=Math.max(0,b.cooldown-dt);if(['hearth','fire'].includes(b.type))b.fuel=Math.max(0,b.fuel-dt*(phase==='day'?.18:1));
      if(b.type==='farm'&&b.planted)b.growth=Math.min(100,b.growth+dt*(phase==='day'?1:.35));
      if(b.type==='trap'&&b.charges>0&&b.cooldown<=0){const e=this.enemies.find(e=>distance(e,b)<1.1);if(e){e.hp-=65;e.slowed=3;b.charges--;b.cooldown=1;this.event('damage',e.x,e.z,'65');}}
      if(b.type==='ward'&&b.cooldown<=0){const e=this.enemies.find(e=>distance(e,b)<6);if(e){e.hp-=18;b.cooldown=2;this.event('bolt',e.x,e.z,'18',{sx:b.x,sz:b.z});}}
    }
    for(const e of this.enemies){
      if(e.hp<=0)continue;const def=ENEMIES[e.type];e.cooldown-=dt;e.slowed=Math.max(0,e.slowed-dt);
      const people=this.players.filter(p=>p.online&&!p.down&&!p.ghost).sort((a,b)=>distance(a,e)-distance(b,e));
      const h=this.buildings.find(b=>b.type==='hearth');const target=people[0]&&distance(people[0],e)<12?people[0]:h;if(!target)continue;
      if(e.windup>0){e.windup-=dt;if(e.windup<=0){for(const p of people)if(Math.hypot(p.x-e.tx,p.z-e.tz)<(e.type==='king'?4:1.9))this.hurt(p,def.damage);for(const b of this.buildings)if(Math.hypot(b.x-e.tx,b.z-e.tz)<(e.type==='king'?4:1.4))b.hp-=def.damage;this.event('impact',e.tx,e.tz,'');e.cooldown=def.period;}continue;}
      const d=distance(e,target);const barricade=this.buildings.find(b=>['wall','gate'].includes(b.type)&&!b.open&&distance(b,e)<1.65);
      if(barricade&&e.cooldown<=0){barricade.hp-=def.damage;e.cooldown=def.period;this.event('hit',barricade.x,barricade.z);continue;}
      if(d<def.range+.5&&e.cooldown<=0){e.tx=target.x;e.tz=target.z;e.windup=e.type==='king'?1.35:.6;continue;}
      if(d>def.range*.8){const speed=def.speed*(e.slowed>0?.3:1);const moved=this.move(e,(target.x-e.x)/d*speed,(target.z-e.z)/d*speed,dt,obstacles);if(!moved){const wall=this.buildings.filter(b=>b.type!=='trap'&&distance(b,e)<2).sort((a,b)=>distance(a,e)-distance(b,e))[0];if(wall&&e.cooldown<=0){wall.hp-=def.damage;e.cooldown=def.period;}else this.move(e,-(target.z-e.z)/d*speed,(target.x-e.x)/d*speed,dt,obstacles);}}
    }
    for(const e of this.enemies.filter(e=>e.hp<=0)){for(const[k,n]of Object.entries(ENEMIES[e.type].loot))this.drop(k,n,e.x+(this.rng()-.5),e.z+(this.rng()-.5));this.kills++;this.event('kill',e.x,e.z);if(e.type==='king'){this.bossSlain=true;this.event('announce',e.x,e.z,'The Hollow King falls. Hold on until dawn.');}}
    this.enemies=this.enemies.filter(e=>e.hp>0);
    for(const b of this.buildings.filter(b=>b.hp<=0)){for(const[k,n]of Object.entries(b.store))this.drop(k,n,b.x,b.z);this.event('break',b.x,b.z,`${STRUCTURES[b.type].name} destroyed`);if(b.type==='hearth')this.status='defeat';}
    this.buildings=this.buildings.filter(b=>b.hp>0);this.drops=this.drops.filter(d=>d.until>this.time&&d.count>0);
    const active=this.players.filter(p=>p.online);if(active.length&&active.every(p=>(p.down||p.ghost)&&!p.charm)){this.wipe+=dt;if(this.wipe>6)this.status='defeat';}else this.wipe=0;
    this.discoverTimer-=dt;if(this.discoverTimer<=0){this.discoverTimer=.5;const seen=new Set(this.explored);for(const p of active){const gx=Math.floor((p.x+42)/4),gz=Math.floor((p.z+42)/4);for(let x=gx-2;x<=gx+2;x++)for(let z=gz-2;z<=gz+2;z++)if(x>=0&&z>=0&&x<21&&z<21)seen.add(z*21+x);}this.explored=[...seen];}
  }
  hurtQuiet(p,amount){if(p.down||p.ghost)return;p.hp-=amount;if(p.hp<=0){p.hp=0;p.down=40;p.revive=0;this.event('announce',p.x,p.z,`${p.name} has fallen`);}}
  snapshot(){return {version:this.version,seed:this.seed,time:this.time,status:this.status,players:this.players,buildings:this.buildings,enemies:this.enemies,drops:this.drops,events:this.events,explored:this.explored,nodeChanges:this.nodes.filter(n=>n.ready||n.hits!==NODES[n.type].hits).map(n=>[n.id,n.hits,n.ready]),idCounter:this.idCounter,eventId:this.eventId,wave:this.wave,nextSpawn:this.nextSpawn,kills:this.kills,bossSlain:this.bossSlain,bossSpawned:this.bossSpawned,endless:this.endless,stats:this.stats};}
  static restore(data){
    if(!data||data.version!==RULES.version||!Array.isArray(data.players)||data.players.length>4||!Number.isFinite(data.time)||data.time<0||!Array.isArray(data.buildings)||data.buildings.length>500)throw new Error('This save is not a Hollowstead expedition.');
    const w=new World(data.seed);for(const key of ['time','status','players','buildings','enemies','drops','events','explored','idCounter','eventId','wave','nextSpawn','kills','bossSlain','bossSpawned','endless','stats'])if(data[key]!==undefined)w[key]=structuredClone(data[key]);
    for(const[id,hits,ready]of data.nodeChanges||[]){const n=w.nodes.find(n=>n.id===id);if(n){n.hits=hits;n.ready=ready;}}
    return w;
  }
}
