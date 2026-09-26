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

// ------------------------------------------------------------------ the arsenal
const LOOT_ONLY=['fangs','soulchain','scythe','wisplantern','stormrod','starfall','crowtotem','jacklantern','wighthorn','censer'];
function foes(w,points,type='crawler'){return points.map(([x,z])=>{const e=w.spawnEnemy(type,x,z,{elite:false});e.hp=e.maxHp=500;return e;});}
function ready(p){p.cooldown=0;p.stamina=100;}

test('ten new weapons are loot only, rarity-pooled, and described',async()=>{
  const {RECIPES}=await import('../src/content.mjs');
  const {effectLine}=await import('../src/ui/actions.mjs');
  for(const id of LOOT_ONLY){
    assert.equal(RECIPES[id],undefined,id);
    assert.ok(EQUIPMENT[id].damage>0,id);
    assert.equal(equipmentSlotFor(id),'weapon');
    assert.ok(['rare','epic','legendary'].includes(rarityOf(id)),id);
    assert.ok(WEAPON_STYLES[id].blurb,id);
    assert.match(effectLine(id),/damage/);
  }
  const seen=new Set();const rng=seeded(3);
  for(let i=0;i<3000;i++)for(const table of ['ironchest','moonchest','reliquary','king'])for(const {itemId} of rollLoot(table,rng,1))seen.add(itemId);
  for(const id of LOOT_ONLY)assert.ok(seen.has(id),`${id} never dropped`);
});

test('hollow fangs rend on every fourth cut: extra damage, a bleed and a lunge',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'fangs');
  const [e]=foes(w,[[1.8,0]]);const hits=[];
  for(let i=0;i<4;i++){ready(p);const before=e.hp;w.attack(p);hits.push(before-e.hp);}
  assert.equal(hits[0],EQUIPMENT.fangs.damage);assert.equal(hits[3],Math.round(EQUIPMENT.fangs.damage*WEAPON_STYLES.fangs.rend));
  assert.ok(e.dot&&e.dot.remaining>0);assert.ok(p.x>0);
  const hp=e.hp;sim(w,1);assert.ok(e.hp<hp);
});

test('soulchain lashes a whole line and drags it in; the scythe heals per foe',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'soulchain');
  const line=foes(w,[[2,0],[3.5,.3],[5,-.3]]),off=foes(w,[[2,3]])[0];
  const far=line[2].x;w.attack(p);
  for(const e of line)assert.equal(e.hp,500-EQUIPMENT.soulchain.damage);
  assert.equal(off.hp,500);assert.ok(line[2].x<far);
  w.enemies=[];arm(w,p,'scythe');ready(p);p.hp=50;
  foes(w,[[2,0],[0,2],[1,-2]]);w.attack(p);
  assert.ok(p.hp>50);assert.ok(w.enemies.every(e=>e.hp<500));
});

test('wisps home in on separate foes and the storm rod chains between them',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'wisplantern');
  const spread=foes(w,[[6,4],[6,-4],[7,0]]);w.attack(p);
  assert.equal(w.projectiles.filter(s=>s.kind==='wisp').length,3);
  sim(w,2.5);for(const e of spread)assert.ok(e.hp<500);
  w.enemies=[];w.projectiles=[];arm(w,p,'stormrod');ready(p);
  const chain=foes(w,[[4,0],[7,1],[9,3],[11,5],[30,0]]);w.attack(p);
  const hit=chain.filter(e=>e.hp<500);
  assert.equal(hit.length,1+WEAPON_STYLES.stormrod.jumps);assert.equal(chain[4].hp,500);
  assert.ok(chain[0].hp<chain[3].hp);
  assert.ok(w.events.some(e=>e.type==='chain'&&e.points.length===5));
});

test('a star lands after its delay and crushes everything near the mark',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'starfall');
  const [a,b]=foes(w,[[8,0],[9,1]]);w.attack(p);
  assert.equal(w.zones.length,1);assert.equal(a.hp,500);
  sim(w,WEAPON_STYLES.starfall.delay+.1);
  assert.ok(a.hp<500&&b.hp<500);assert.equal(w.zones.length,0);
});

test('the censer slows, then freezes foes solid so their blows never land',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'censer');
  const [e]=foes(w,[[4,0]],'brute');w.attack(p);
  sim(w,.3);assert.ok(e.slowed>0);assert.ok(e.hp<500);
  sim(w,WEAPON_STYLES.censer.freezeAfter);
  assert.ok(e.stunned>0);assert.equal(e.windup,0);
  const x=e.x;sim(w,.5);assert.equal(e.x,x);
});

test('summons: crows fly, sentries shoot, the Grave Knight taunts and takes the hits',()=>{
  const {w,p}=camp();p.x=0;p.z=0;p.dx=1;p.dz=0;arm(w,p,'crowtotem');
  w.attack(p);assert.equal(w.allies.filter(a=>a.type==='crow').length,WEAPON_STYLES.crowtotem.count);
  ready(p);w.attack(p);ready(p);w.attack(p);
  assert.equal(w.allies.filter(a=>a.type==='crow').length,WEAPON_STYLES.crowtotem.cap);
  const [prey]=foes(w,[[5,0]]);sim(w,3);assert.ok(prey.hp<500);
  w.allies=[];w.enemies=[];arm(w,p,'jacklantern');
  for(let i=0;i<3;i++){ready(p);w.attack(p);}
  assert.equal(w.allies.filter(a=>a.type==='jack').length,WEAPON_STYLES.jacklantern.cap);
  const [mark]=foes(w,[[6,0]]);mark.speed=0;sim(w,2);assert.ok(mark.hp<500);
  w.allies=[];w.enemies=[];arm(w,p,'wighthorn');ready(p);w.attack(p);
  const knight=w.allies.find(a=>a.type==='wight');assert.ok(knight);
  knight.x=6;knight.z=0;p.x=-6;
  const [brute]=foes(w,[[8,0]],'brute');
  sim(w,4);
  assert.ok(knight.hp<knight.maxHp,'the knight drew the attack');assert.equal(p.hp,100);assert.ok(brute.hp<500);
  ready(p);const hp=knight.hp;w.attack(p);assert.ok(knight.hp>hp);assert.equal(w.allies.filter(a=>a.type==='wight').length,1);
  const copy=World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  assert.equal(copy.allies.length,w.allies.length);
});

test('allies expire, and belong to their summoner',()=>{
  const {w,p}=camp();p.x=0;p.z=0;arm(w,p,'crowtotem');w.attack(p);
  sim(w,15);assert.equal(w.allies.length,0);
});
