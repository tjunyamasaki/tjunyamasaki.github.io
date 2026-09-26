import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../src/engine.mjs';
import {waveSize} from '../src/progression.mjs';
import {RULES, phaseAt, dayAt, phaseRemaining} from '../src/content.mjs';
import {
  CLOCK_V2, NIGHT_WAVE_FRACTIONS, V1_PHASE, V2_PHASE, nightWaveOffsets, phaseProgress, remapPhaseTime,
} from '../src/contracts.mjs';
import {migrateV1Save} from '../src/serialization.mjs';
import {equippedLanternLit} from '../src/inventory.mjs';
import {
  HEARTH_LEVEL_STEP, LANTERN_FADE_SECONDS, PLAYER_LIGHT_RADIUS, brightnessAt, canInspect, collectLightSources, combinedStrength,
  entityBrightness, frameLighting, inSafeLight, labelOpacity, lightStrength, phaseDarkness, resolveLighting, spriteTint,
  structureLightRadius, warningVisible,
} from '../src/lighting.mjs';

const fixtureDir = new URL('./fixtures/', import.meta.url);
const loadFixture = name => JSON.parse(readFileSync(new URL(name, fixtureDir), 'utf8'));
function camp(){const w=new World(402);const p=w.addPlayer('host','Jun');w.start();w.ambient=false;w.enemies=[];p.regions=['meadow','woods','graveyard','mire','crags','barrow'];return {w,p};}
function brace(w){const hearth=w.buildings[0];hearth.hp=1e7;hearth.maxHp=1e7;hearth.fuel=100000;return hearth;}

test('T28 phaseAt, dayAt, and remaining agree on 180/210/310 and later days',()=>{
  assert.equal(RULES.day,180);
  assert.equal(RULES.dusk,30);
  assert.equal(RULES.night,100);
  assert.equal(RULES.cycle,310);
  assert.deepEqual({day:RULES.day,dusk:RULES.dusk,night:RULES.night,cycle:RULES.cycle},V2_PHASE);
  const marks=[
    [0,'day',180,0],
    [180,'dusk',30,0],
    [210,'night',100,0],
    [309,'night',1,0],
    [310,'day',180,1],
  ];
  for(let day=0;day<6;day++){
    for(const [offset,name,remain,extra] of marks){
      const time=day*RULES.cycle+offset;
      assert.equal(phaseAt(time),name,String(time));
      assert.equal(dayAt(time),day+1+extra,String(time));
      assert.equal(phaseRemaining(time),remain,String(time));
      const progress=phaseProgress(time,V2_PHASE);
      assert.equal(progress.name,name);
      assert.equal(progress.cycleIndex,day+extra);
      assert.ok(Math.abs(progress.duration-progress.elapsed-phaseRemaining(time))<1e-6,String(time));
    }
  }
  assert.equal(phaseAt(1550),'day');
  assert.equal(dayAt(1550),6);
  assert.equal(RULES.cycle*RULES.finalNight,1550);
});

test('T29 a night has three wave opportunities, the boss every fifth night, and no victory screen',()=>{
  assert.deepEqual(NIGHT_WAVE_FRACTIONS,[0,0.4,0.8]);
  assert.deepEqual(nightWaveOffsets(RULES.night),[0,40,80]);
  const {w,p}=camp();
  brace(w);p.x=0;p.z=0;
  w.time=RULES.day+RULES.dusk-0.02;
  w.tick(0.05);
  assert.equal(phaseAt(w.time),'night');
  assert.equal(w.wave,1);
  assert.equal(w.enemies.length,waveSize(dayAt(w.time),1));
  const nightStart=RULES.day+RULES.dusk;
  const spawned=[w.time];
  while(w.time<RULES.cycle-0.05){
    const before=w.wave;
    w.tick(0.1);
    if(w.wave!==before)spawned.push(w.time);
  }
  assert.equal(w.wave,3);
  assert.equal(spawned.length,3);
  assert.ok(spawned[0]-nightStart<0.2);
  assert.ok(Math.abs(spawned[1]-nightStart-0.4*RULES.night)<0.2);
  assert.ok(Math.abs(spawned[2]-nightStart-0.8*RULES.night)<0.2);
  assert.ok(w.nextSpawn>=RULES.cycle);

  const capped=camp();
  brace(capped.w);
  capped.w.time=RULES.day+RULES.dusk-0.02;
  capped.w.tick(0.05);
  assert.equal(capped.w.wave,1);
  while(capped.w.enemies.length<22)capped.w.spawnEnemy('crawler',20,20);
  const held=capped.w.wave;
  capped.w.time=nightStart+0.4*RULES.night-0.02;
  capped.w.nextSpawn=nightStart+0.4*RULES.night;
  capped.w.tick(0.05);
  assert.equal(capped.w.wave,held);
  capped.w.enemies=capped.w.enemies.filter(enemy=>enemy.type==='king');
  capped.w.time=nightStart+0.8*RULES.night-0.02;
  capped.w.tick(0.05);
  assert.equal(capped.w.wave,held+1);
  const afterThird=capped.w.wave;
  capped.w.time=RULES.cycle-0.2;
  capped.w.tick(0.1);
  assert.equal(capped.w.wave,afterThird);

  const boss=camp();
  brace(boss.w);
  boss.w.time=RULES.cycle*4+RULES.day+RULES.dusk-0.02;
  boss.w.tick(0.05);
  assert.equal(boss.w.enemies.filter(enemy=>enemy.type==='king').length,1);
  assert.equal(boss.w.bossSpawned,true);
  boss.w.spawnWave();
  assert.equal(boss.w.enemies.filter(enemy=>enemy.type==='king').length,1);
  boss.w.enemies.find(enemy=>enemy.type==='king').hp=0;
  boss.w.tick();
  assert.equal(boss.w.bossSlain,true);
  boss.w.time=RULES.cycle*5-0.02;
  boss.w.tick();
  assert.equal(boss.w.status,'playing');
  boss.w.time=RULES.cycle*9+RULES.day+RULES.dusk-0.02;
  boss.w.tick(0.05);
  assert.equal(boss.w.enemies.filter(enemy=>enemy.type==='king').length,1);
  assert.equal(boss.w.bossNight,10);
});

test('T29 a migrated night does not replay its start or grow a fourth wave',()=>{
  const boundaries=loadFixture('v1-phase-boundaries.json');
  const start=boundaries.saves.find(save=>save.name==='cycle0-night-start');
  const opened=World.fromSave(migrateV1Save(start,{remapTime:true}).save);
  brace(opened);
  assert.equal(opened.clock,CLOCK_V2);
  assert.equal(opened.time,remapPhaseTime(180));
  assert.equal(opened.wave,1);
  assert.equal(opened.nextSpawn,250);
  let added=0;
  while(opened.time<310-0.05){
    const before=opened.wave;
    opened.tick(0.1);
    if(opened.wave!==before)added++;
  }
  assert.equal(added,2);
  assert.equal(opened.wave,3);

  const late=structuredClone(start);
  late.world.time=250;
  late.world.nextSpawn=282;
  const resumed=World.fromSave(migrateV1Save(late,{remapTime:true}).save);
  brace(resumed);
  const progress=phaseProgress(resumed.time,V2_PHASE);
  assert.equal(progress.name,'night');
  assert.ok(progress.elapsed>80);
  const frozen=resumed.wave;
  while(phaseAt(resumed.time)==='night')resumed.tick(0.1);
  assert.equal(resumed.wave,frozen);

  const finalNight=boundaries.saves.find(save=>save.name==='cycle4-night-start');
  const king=World.fromSave(migrateV1Save(finalNight,{remapTime:true}).save);
  brace(king);
  assert.equal(king.bossSpawned,true);
  assert.equal(king.enemies.filter(enemy=>enemy.type==='king').length,1);
  while(king.time<1550-0.05)king.tick(0.1);
  assert.equal(king.enemies.filter(enemy=>enemy.type==='king').length,1);
  assert.equal(king.bossSpawned,true);
});

test('T30 active lights match courage safety, including downed players and empty lanterns',()=>{
  const {w,p}=camp();
  w.time=RULES.day+RULES.dusk+20;
  w.nextSpawn=w.time+RULES.night;
  const hearth=w.buildings[0];
  hearth.fuel=80;hearth.level=1;
  p.x=7.9;p.z=0;
  assert.equal(w.lit(p),true);
  p.x=8;p.z=0;
  assert.equal(w.lit(p),false);
  hearth.level=2;
  assert.equal(structureLightRadius(hearth),8+HEARTH_LEVEL_STEP);
  p.x=8+HEARTH_LEVEL_STEP-0.05;
  assert.equal(w.lit(p),true);
  p.x=8+HEARTH_LEVEL_STEP+0.05;
  assert.equal(w.lit(p),false);
  hearth.fuel=0;
  p.x=1;p.z=0;
  assert.equal(w.lit(p),false);
  const fire=w.structure('fire',20,0);w.buildings.push(fire);fire.fuel=10;
  p.x=20;p.z=5.9;assert.equal(w.lit(p),true);
  p.z=6.05;assert.equal(w.lit(p),false);
  fire.fuel=0;p.z=0;assert.equal(w.lit(p),false);
  const lamp=w.structure('lantern',-20,0);w.buildings.push(lamp);lamp.fuel=0;
  p.x=-20;p.z=5.9;assert.equal(w.lit(p),true);
  p.z=6.05;assert.equal(w.lit(p),false);
  p.x=0;p.z=30;assert.equal(w.lit(p),false);
  w.grantEquipped(p,'torch',50);p.lantern=true;
  assert.equal(equippedLanternLit(p),true);
  assert.equal(w.lit(p),true);
  const q=w.addPlayer('guest');
  q.x=p.x+PLAYER_LIGHT_RADIUS-0.05;q.z=p.z;
  assert.equal(w.lit(q),true);
  q.x=p.x+PLAYER_LIGHT_RADIUS+0.05;
  assert.equal(w.lit(q),false);
  const fresh=collectLightSources(w).find(source=>source.kind==='player');
  assert.equal(fresh.radius, PLAYER_LIGHT_RADIUS);
  const samples=[];
  for(const fuel of [LANTERN_FADE_SECONDS, 3, 1, 0.25]){
    p.equipment.light.durability=fuel;
    const radius=collectLightSources(w).find(source=>source.kind==='player').radius;
    samples.push(radius);
    q.x=p.x+radius-0.02;
    assert.equal(w.lit(q), true, String(fuel));
    q.x=p.x+radius+0.02;
    assert.equal(w.lit(q), false, String(fuel));
  }
  assert.ok(samples[0]===PLAYER_LIGHT_RADIUS);
  assert.ok(samples[1]<samples[0]&&samples[2]<samples[1]&&samples[3]<samples[2]);
  assert.ok(samples[3]>0);
  const worn=p.equipment.light;
  p.equipment.light=null;
  p.inventory.slots[0]=worn;
  assert.equal(equippedLanternLit(p),false);
  assert.equal(w.lit(p),false);
  assert.equal(collectLightSources(w).some(source=>source.kind==='player'),false);
  p.inventory.slots[0]=null;
  p.equipment.light=worn;p.lantern=true;
  p.down=8;
  assert.equal(w.lit({x:p.x+1,z:p.z}),false);
  p.down=0;p.ghost=true;
  assert.equal(equippedLanternLit(p),false);
  p.ghost=false;p.online=false;
  assert.equal(equippedLanternLit(p),false);
  p.online=true;p.equipment.light.durability=0;
  assert.equal(equippedLanternLit(p),false);
  assert.equal(w.lit(p),false);
  const sources=collectLightSources(w);
  assert.equal(inSafeLight(sources, lamp.x, lamp.z+1), w.lit({x:lamp.x,z:lamp.z+1}));
  assert.equal(sources.some(source=>source.kind==='player'),false);
  assert.equal(sources.some(source=>source.kind==='hearth'),false);
  assert.equal(sources.some(source=>source.kind==='fire'),false);
  assert.equal(sources.find(source=>source.kind==='lantern').radius,6);
  const lighting=resolveLighting(null);
  assert.equal(lightStrength(8*0.8, 8, lighting),1);
  assert.ok(lightStrength(8, 8, lighting)>0);
  assert.equal(inSafeLight([{x:0,z:0,radius:8}], 8, 0),false);
  assert.equal(lightStrength(8*1.2, 8, lighting),0);
  assert.equal(combinedStrength([{x:0,z:0,radius:8},{x:3,z:0,radius:8}], 0, 0, lighting),1);
});

test('theme lighting falls back and does not change safety radii',()=>{
  const lighting=resolveLighting(null);
  assert.equal(lighting.ambientNight,0.03);
  assert.equal(lighting.litBrightness,0.92);
  assert.equal(lighting.transitionSeconds,7);
  assert.equal(lighting.dawnSeconds,4);
  assert.equal(lighting.readableFraction,0.8);
  assert.equal(lighting.ambientFraction,1.2);
  const partial=resolveLighting({lighting:{ambientNight:0.08, nightTint:'nope'}});
  assert.equal(partial.ambientNight,0.08);
  assert.equal(partial.nightTint,'#191b2b');
  assert.equal(partial.transitionSeconds,7);
  const schedule={day:RULES.day,dusk:RULES.dusk,night:RULES.night,cycle:RULES.cycle};
  assert.equal(phaseDarkness(90, schedule, lighting),0);
  assert.ok(phaseDarkness(RULES.day, schedule, lighting)<0.02);
  assert.ok(phaseDarkness(RULES.day+RULES.dusk+lighting.transitionSeconds, schedule, lighting)>0.98);
  assert.ok(phaseDarkness(0, schedule, lighting)>0.98);
  assert.ok(phaseDarkness(lighting.dawnSeconds, schedule, lighting)<0.02);
  const {w,p}=camp();
  w.buildings[0].fuel=40;
  const wide=resolveLighting({lighting:{ambientFraction:2.4, readableFraction:0.2}});
  const sources=collectLightSources(w);
  assert.equal(sources[0].radius, structureLightRadius(w.buildings[0]));
  assert.equal(w.lit(p), inSafeLight(sources, p.x, p.z));
  const frame=frameLighting(w, {lighting:wide});
  const far=brightnessAt(frame.sources, 30, 30, 1, frame.lighting);
  assert.ok(far<0.05);
  assert.equal(canInspect(frame, 30, 30, p, RULES.reach), false);
  assert.equal(canInspect(frame, p.x+1, p.z, p, RULES.reach), true);
  assert.equal(labelOpacity(far, 1, frame.lighting), 0);
  assert.ok(labelOpacity(0.9, 1, frame.lighting)>0.9);
  assert.equal(warningVisible(frame, 30, 30, 1.9, p), false);
  assert.equal(warningVisible(frame, p.x+0.4, p.z, 1.9, p), true);
  const dayTint=spriteTint(0, 0, lighting);
  assert.equal(dayTint.r, 255);
  assert.equal(dayTint.b, 255);
  const cool=spriteTint(0, 1, lighting);
  assert.ok(cool.b>cool.r);
  const warm=spriteTint(1, 1, lighting);
  assert.ok(warm.r>warm.b);
  const self=entityBrightness(frame, 30, 30, {local:true});
  assert.ok(self>=frame.lighting.localSilhouette);
  assert.ok(self<0.2);
  const css=readFileSync(new URL('../style.css', import.meta.url),'utf8');
  assert.equal(css.includes('58%'), false);
  assert.equal(css.includes('69%'), false);
  const main=readFileSync(new URL('../src/main.mjs', import.meta.url),'utf8');
  assert.match(main, /RULES\.day\/RULES\.cycle/);
  assert.equal(main.includes('time=163'), false);
});
