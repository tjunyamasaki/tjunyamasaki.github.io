import test from 'node:test';
import assert from 'node:assert/strict';
import {World, makeMap, biome} from '../src/engine.mjs';
import {RULES, NODES, ENEMIES, EQUIPMENT} from '../src/content.mjs';
import {
  CACHE_LAYOUT, CACHE_TYPES, REGIONS, RESIDENTS, LOOT_TABLES, rollLoot, regionAt, tierAt, xpToNext, maxHealth,
  enemyScale, waveSize, nightRoster, isBossNight, rarityOf, WEAPON_STYLES,
} from '../src/progression.mjs';
import {countItem, itemDefinition, equipmentSlotFor} from '../src/inventory.mjs';

function camp(seed=402){const w=new World(seed);const p=w.addPlayer('host','Jun');w.start();w.ambient=false;w.enemies=[];return {w,p};}
function seeded(n=7){let s=n;return ()=>{s=(s*16807)%2147483647;return s/2147483647;};}
function hold(w,p,target,seconds){for(let t=0;t<seconds;t+=RULES.tick){w.input(p.id,{x:0,z:0,act:true,target});w.tick(RULES.tick);}}
function sim(w,seconds){for(let t=0;t<seconds;t+=RULES.tick)w.tick(RULES.tick);}
function arm(w,p,itemId){p.equipment[equipmentSlotFor(itemId)]=null;w.grantEquipped(p,itemId,EQUIPMENT[itemId].durability);}

test('the hollow is larger, ringed by six regions whose danger rises outward',()=>{
  assert.equal(RULES.radius,96);
  assert.equal(regionAt(0,0),'meadow');
  const seen=new Set();
  for(let x=-90;x<=90;x+=3)for(let z=-90;z<=90;z+=3)if(Math.hypot(x,z)<92)seen.add(regionAt(x,z));
  assert.deepEqual([...seen].sort(),Object.keys(REGIONS).sort());
  assert.equal(tierAt(0,0),0);
  assert.equal(tierAt(85,0)>=1,true);
  assert.equal(biome(40,-10),regionAt(40,-10));
});

test('every seed places all cache tiers, better ones farther out, and new materials by region',()=>{
  const nodes=makeMap(402);
  assert.deepEqual(makeMap(402),nodes);
  assert.notEqual(makeMap(402),makeMap(402));
  for(const {type,count,min} of CACHE_LAYOUT){
    const found=nodes.filter(n=>n.type===type&&!(n.x===9&&n.z===6));
    assert.equal(found.length,count,type);
    for(const n of found)assert.ok(Math.hypot(n.x,n.z)>=min-0.01,type);
  }
  for(const type of ['shardrock','bones','glowcap']){
    const found=nodes.filter(n=>n.type===type);
    assert.ok(found.length>10,type);
    for(const n of found)assert.ok(tierAt(n.x,n.z)>=1,type);
  }
  assert.ok(nodes.length>1000);
  assert.ok(nodes.every(n=>Math.hypot(n.x,n.z)<RULES.radius));
});

test('loot tables roll by rarity and luck raises rare finds',()=>{
  assert.equal(rarityOf('tome'),'legendary');
  assert.equal(rarityOf('flamberge'),'epic');
  assert.equal(rarityOf('wood'),'common');
  const rng=seeded(11);
  for(let i=0;i<60;i++){
    const reliquary=rollLoot('reliquary',rng);
    assert.ok(reliquary.some(r=>['epic','legendary'].includes(rarityOf(r.itemId))));
    const coffer=rollLoot('moonchest',rng);
    assert.ok(coffer.some(r=>['rare','epic','legendary'].includes(rarityOf(r.itemId))));
    for(const {itemId,count} of [...reliquary,...coffer,...rollLoot('crate',rng)]){
      assert.ok(count>0);
      if(!['cinder-staff','barrow-rattle','widows-needle','spirit-fan','mourning-bell'].includes(itemId))assert.ok(itemDefinition(itemId),itemId);
    }
  }
  const lucky=seeded(5),plain=seeded(5);let luckyRare=0,plainRare=0;
  for(let i=0;i<400;i++){luckyRare+=rollLoot('wraith',lucky,1).length;plainRare+=rollLoot('wraith',plain,0).length;}
  assert.ok(luckyRare>plainRare);
});

test('opening a cache takes a short hold, spills rolled loot, grants XP and refills later',()=>{
  const {w,p}=camp();
  const crate=w.nodes.find(n=>n.type==='crate');
  p.x=crate.x;p.z=crate.z+1;
  const drops=w.drops.length;
  hold(w,p,crate.id,NODES.crate.workSeconds+0.2);
  assert.ok(crate.ready>w.time);
  assert.ok(w.drops.length>drops);
  assert.ok(p.xp>0||p.level>1);
  const refill=crate.ready;
  sim(w,0.2);
  assert.equal(crate.ready,refill);
});

test('XP levels a wanderer: more health, more damage, full heal',()=>{
  const {w,p}=camp();
  assert.equal(p.level,1);assert.equal(maxHealth(p),100);
  p.hp=10;
  w.awardXp(p,xpToNext(1));
  assert.equal(p.level,2);assert.equal(p.maxHp,108);assert.equal(p.hp,108);
  w.awardXp(p,xpToNext(2)+xpToNext(3));
  assert.equal(p.level,4);
  const heart=w.mintStack('heartstone',1);p.inventory.slots[0]=heart;p.inventory.revision++;
  p.cooldown=0;w.action(p.id,{type:'use',uid:heart.uid,inventoryRevision:p.inventory.revision});
  assert.equal(p.maxHp,100+8*3+15);
  assert.equal(countItem(p.inventory,'heartstone'),0);
});

test('bows fire arrows that travel and hit; bonebows pierce',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'recurve');
  const far=w.spawnEnemy('crawler',8,0,{elite:false});const hp=far.hp;
  w.attack(p);
  assert.equal(w.projectiles.length,1);
  sim(w,1);
  assert.ok(far.hp<hp);
  assert.equal(w.projectiles.length,0);
  w.enemies=[];arm(w,p,'bonebow');p.cooldown=0;p.stamina=100;
  const a=w.spawnEnemy('crawler',5,0,{elite:false}),b=w.spawnEnemy('crawler',8,0,{elite:false});
  const ha=a.hp,hb=b.hp;w.attack(p);sim(w,1);
  assert.ok(a.hp<ha&&b.hp<hb);
});

test('staff bolts burst on impact; broadswords cleave; the grimoire burns everything close',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'crookstaff');
  const a=w.spawnEnemy('crawler',6,0,{elite:false}),b=w.spawnEnemy('crawler',6.8,0.6,{elite:false});
  const ha=a.hp,hb=b.hp;w.attack(p);sim(w,1);
  assert.ok(a.hp<ha&&b.hp<hb);
  w.enemies=[];arm(w,p,'broadsword');p.cooldown=0;p.stamina=100;
  const c=w.spawnEnemy('crawler',1.5,0.6,{elite:false}),d=w.spawnEnemy('crawler',1.5,-0.6,{elite:false}),behind=w.spawnEnemy('crawler',-2,0,{elite:false});
  const hc=c.hp,hd=d.hp,hbehind=behind.hp;w.attack(p);
  assert.ok(c.hp<hc&&d.hp<hd);assert.equal(behind.hp,hbehind);
  w.enemies=[];arm(w,p,'tome');p.cooldown=0;p.stamina=100;
  const ring=[[3,0],[-3,0],[0,3]].map(([x,z])=>w.spawnEnemy('crawler',x,z,{elite:false}));
  const before=ring.map(e=>e.hp);w.attack(p);
  ring.forEach((e,i)=>assert.ok(e.hp<before[i]));
  for(const id of Object.keys(WEAPON_STYLES))if(id!=='fist')assert.equal(equipmentSlotFor(id),'weapon',id);
});

test('armour tiers absorb more damage',()=>{
  const {w,p}=camp();
  const taken=itemId=>{arm(w,p,itemId);p.hp=100;w.hurt(p,20);return 100-p.hp;};
  assert.equal(taken('armor'),11);
  assert.equal(taken('bonemail'),9);
  assert.equal(taken('shardplate'),7);
});

test('the curve starts gentle and hardens every day; the king returns every fifth night',()=>{
  assert.equal(waveSize(1,1),2);
  assert.ok(waveSize(5,1)>waveSize(2,1));
  assert.ok(enemyScale(6).hp>enemyScale(2).hp);
  assert.deepEqual(nightRoster(1).map(([id])=>id),['crawler']);
  assert.ok(nightRoster(8).some(([id])=>id==='golem'));
  assert.equal(isBossNight(5),true);assert.equal(isBossNight(6),false);assert.equal(isBossNight(10),true);
  const {w}=camp();
  w.time=RULES.cycle*6+10;
  const tough=w.spawnEnemy('crawler',10,10,{elite:false});
  assert.ok(tough.hp>ENEMIES.crawler.hp*1.9);
  const elite=w.spawnEnemy('crawler',10,12,{elite:true});
  assert.ok(elite.hp>tough.hp*2);assert.equal(elite.elite,true);
});

test('guards wait beside unopened caches, stay near home, and drop better loot',()=>{
  const {w,p}=camp();w.ambient=true;w.guardsDay=0;p.x=0;p.z=0;
  w.tick(RULES.tick);
  const guards=w.enemies.filter(e=>e.guardOf);
  assert.ok(guards.length>=16);
  for(const g of guards){const cache=w.nodes.find(n=>n.id===g.guardOf);assert.ok(cache&&Math.hypot(g.x-cache.x,g.z-cache.z)<3);}
  const g=guards[0];const home={...g.home};
  sim(w,5);
  assert.ok(Math.hypot(g.x-home.x,g.z-home.z)<3);
  const before=w.enemies.length;w.tick(RULES.tick);assert.equal(w.enemies.length,before);
});

test('residents roam near wanderers outside the meadow and discovery pays XP',()=>{
  const {w,p}=camp();w.ambient=true;w.guardsDay=1;
  const spot=[...Array(200)].map((_,i)=>({x:Math.cos(i)*80,z:Math.sin(i)*80})).find(s=>tierAt(s.x,s.z)===2);
  p.x=spot.x;p.z=spot.z;
  sim(w,60);
  assert.ok(p.regions.length>1);
  assert.ok(p.level>1||p.xp>0);
  const roamers=w.enemies.filter(e=>e.roamer);
  assert.ok(roamers.length>0);
  for(const e of roamers)assert.ok(RESIDENTS[regionAt(p.x,p.z)].includes(e.type)||tierAt(e.x,e.z)>=1);
  p.x=0;p.z=0;sim(w,ROAM_SECONDS);
  assert.equal(w.enemies.filter(e=>e.roamer).length,0);
});
const ROAM_SECONDS=10;

test('Long Night fields survive a save and a network frame',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'recurve');
  w.awardXp(p,xpToNext(1)+5);w.spawnEnemy('crawler',9,0);w.attack(p);
  const copy=World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  assert.equal(copy.players[0].level,2);
  assert.equal(copy.projectiles.length,1);
  assert.equal(copy.endless,true);
  const saved=World.restore(JSON.parse(JSON.stringify(w.snapshot({purpose:'save'}))));
  assert.equal(saved.players[0].maxHp,108);
});
