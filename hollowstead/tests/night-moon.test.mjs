import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {RULES, dayAt} from '../src/content.mjs';
import {NIGHT_CAP, REGIONS, regionAt, waveSize} from '../src/progression.mjs';
import {frameLighting} from '../src/lighting.mjs';
import {
  BLOOD, HUNT, MOON_LIGHT, MOON_RULES, MOONS, hearthReach, huntCap, huntRate, kingVisits, moonLighting, moonOf, nextMoon,
  nightStatus, sendHunters, stepNight, tonight, waveOffsets,
} from '../src/night.mjs';

const SEEDS = [1, 402, 7777, 123456, 0xdeadbeef, 2024];
const nightStart = day => RULES.cycle*(day-1)+RULES.day+RULES.dusk;
function camp(seed=402){const w=new World(seed);const p=w.addPlayer('host','Jun');w.start();w.ambient=false;w.enemies=[];p.regions=['meadow','woods','graveyard','mire','crags','barrow'];return {w,p};}
function brace(w){const hearth=w.buildings[0];hearth.hp=1e7;hearth.maxHp=1e7;hearth.fuel=100000;return hearth;}
function moons(seed, nights=200){const world={seed};return Array.from({length:nights}, (_, i) => moonOf(world, i+1));}
/** A walkable spot in the wanted ring tier (0 meadow, 1 middle ring, 2 outer ring). */
function spot(w, tier){
  for(let i=0;i<2000;i++){
    const a=i*2.39996, r=tier===0?4+(i%6):tier===1?32+(i%14):66+(i%20);
    const x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(Math.hypot(x,z)<RULES.radius-10&&REGIONS[regionAt(x,z)]?.tier===tier&&w.walkable(x,z))return {x,z};
  }
  throw new Error(`no tier ${tier} spot`);
}
/**
 * Runs tonight's hunter clock for `seconds` at a fixed time, taking every hunter away as it comes so
 * the cap never binds. Returns the groups and each creature's spawn point.
 */
function huntFor(w, seconds, dt=.05){
  const spawns=[];let groups=0;const seen=new Set();
  for(let t=0;t<seconds;t+=dt){
    stepNight(w, dt, 'night', 'night');
    let fresh=0;
    for(const e of w.enemies)if(e.hunt&&!seen.has(e.id)){seen.add(e.id);fresh++;spawns.push({x:e.x,z:e.z,type:e.type});}
    if(fresh){groups++;w.enemies=w.enemies.filter(e=>!e.hunt);}
  }
  return {groups, spawns};
}

test('the moon is fixed by the seed and the night, and lands near 60/30/10 new/waxing/blood over 200 nights', () => {
  const tally={waxing:0, new:0, blood:0, gilded:0, starrain:0};
  const sequences=SEEDS.map(seed=>moons(seed));
  for(const [i, seed] of SEEDS.entries()){
    assert.deepEqual(moons(seed), sequences[i], 'same seed, same moons');
    const w=new World(seed);
    for(let day=1;day<=40;day++)assert.equal(moonOf(w, day), sequences[i][day-1], `world ${seed} night ${day}`);
    for(const moon of sequences[i])tally[moon]++;
  }
  assert.ok(sequences.some((s, i) => i && s.join() !== sequences[0].join()), 'seeds give different skies');
  const total=SEEDS.length*200;
  const share=k=>tally[k]/total;
  // The rare moons (moons.mjs) take about one night in nine from the new and waxing ones.
  assert.ok(share('new')>.45&&share('new')<.62, `new ${share('new')}`);
  assert.ok(share('waxing')>.2&&share('waxing')<.34, `waxing ${share('waxing')}`);
  assert.ok(share('blood')>.06&&share('blood')<.14, `blood ${share('blood')}`);
  assert.ok(share('gilded')>.03&&share('gilded')<.09, `gilded ${share('gilded')}`);
  assert.ok(share('starrain')>.03&&share('starrain')<.09, `starrain ${share('starrain')}`);
  assert.deepEqual(Object.keys(MOONS).sort(), ['blood', 'gilded', 'new', 'starrain', 'waxing']);
});

test('nights 1-2 are waxing; no blood moon before night 4 or twice running; one comes at least every MOON_RULES.pity nights', () => {
  for(let seed=0;seed<60;seed++){
    const sky=moons(seed*7919+13, 200);
    assert.equal(sky[0], 'waxing');assert.equal(sky[1], 'waxing');
    assert.ok(!sky.slice(0, MOON_RULES.bloodFrom-1).includes('blood'), `seed ${seed}: blood before night 4`);
    let last=0;
    for(let day=1;day<=sky.length;day++){
      if(sky[day-1]!=='blood')continue;
      if(day>1)assert.notEqual(sky[day-2], 'blood', `seed ${seed}: two blood moons at ${day}`);
      if(!last)assert.ok(day<=MOON_RULES.firstBy, `seed ${seed}: first blood moon on night ${day}`);
      else assert.ok(day-last<=MOON_RULES.pity, `seed ${seed}: ${day-last} nights between blood moons`);
      last=day;
    }
    assert.ok(sky.length-last<MOON_RULES.pity, `seed ${seed}: no blood moon since night ${last}`);
  }
});

test('the Hollow King comes on blood moons only, stronger each visit, with a bigger extra wave', () => {
  const {w,p}=camp();brace(w);p.x=0;p.z=3;
  const first=nextMoon(w, 'blood'), second=nextMoon(w, 'blood', first+1);
  assert.ok(first>=4&&second>first+1);
  for(let day=1;day<=second;day++){
    w.enemies=[];w.bossNight=0;
    w.time=nightStart(day)-.02;w.tick(.05);
    const kings=w.enemies.filter(e=>e.type==='king');
    assert.equal(kings.length, moonOf(w, day)==='blood'?1:0, `night ${day} (${moonOf(w, day)})`);
    assert.equal(kingVisits(w, day), day<first?0:day<second?1:2);
  }
  // His second coming is scaled up by World.mobScale's boss factor.
  assert.equal(w.mobScale().boss, 1.25);
  assert.equal(w.bossNight, second);

  const {w:b,p:q}=camp();brace(b);q.x=0;q.z=3;
  b.time=nightStart(first)-.02;b.tick(.05);
  const pack=b.enemies.filter(e=>e.type!=='king').length;
  assert.equal(pack, Math.min(Math.round(waveSize(first, 1)*BLOOD.size), NIGHT_CAP));
  assert.ok(pack>waveSize(first, 1));
  assert.ok(b.events.some(ev=>ev.type==='announce'&&/Hollow King/.test(ev.text)));
  let waves=b.wave;
  while(b.time<RULES.cycle*first-.1){b.enemies=b.enemies.filter(e=>e.type==='king');b.tick(.1);}
  waves=b.wave-waves+1;
  assert.equal(waves, waveOffsets('blood').length);
  assert.equal(waves, waveOffsets('waxing').length+1);
  assert.equal(b.enemies.filter(e=>e.type==='king').length, 1);
});

test('a new moon sends no waves at the fire, only an announcement', () => {
  const {w,p}=camp();brace(w);p.x=0;p.z=3;
  const day=nextMoon(w, 'new');assert.ok(day>=3);
  assert.deepEqual(waveOffsets('new'), []);
  w.time=nightStart(day)-5;w.tick(.05);
  const start=w.wave;
  while(w.time<RULES.cycle*day-.1)w.tick(.1);
  assert.equal(w.wave, start);
  assert.equal(w.enemies.length, 0);
  assert.equal(w.night.moon, 'new');
  assert.ok(w.events.some(ev=>ev.type==='announce'&&/new moon/i.test(ev.text)));
});

test('tonight\'s moon is announced at dusk, reaches guests through the snapshot, and colours the dark', () => {
  const {w}=camp();brace(w);
  const blood=nextMoon(w, 'blood'), dark=nextMoon(w, 'new');
  w.time=RULES.cycle*(blood-1)+RULES.day+1;w.tick(.05);
  w.time=RULES.cycle*(blood-1)+RULES.day+5;w.tick(.05);
  const call=w.events.filter(ev=>ev.type==='announce'&&ev.moon==='blood');
  assert.equal(call.length, 1);assert.match(call[0].text, /blood moon/i);
  w.tick(.05);assert.equal(w.events.filter(ev=>ev.type==='announce'&&ev.moon==='blood').length, 1, 'announced once');
  const guest=World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  assert.deepEqual({moon:guest.night.moon, day:guest.night.day}, {moon:'blood', day:blood});
  assert.equal(nightStatus(guest).moon, 'blood');
  assert.equal(nightStatus(guest).nextName, MOONS[moonOf(w, blood+1)].name);
  const saved=World.fromSave({world:JSON.parse(JSON.stringify(w.snapshot({purpose:'save'})))});
  assert.equal(saved.night.moon, 'blood');
  // Lighting: blood tints red, new is darker and cool, waxing keeps the theme's night.
  w.time=nightStart(blood)+30;
  assert.equal(moonLighting(w), MOON_LIGHT.blood);
  assert.equal(frameLighting(w, null).lighting.nightTint, MOON_LIGHT.blood.tint);
  w.time=nightStart(dark)+30;
  assert.ok(moonLighting(w).ambient<1);
  const plain=frameLighting({time:nightStart(1)+30, seed:w.seed, buildings:[], players:[]}, null).lighting;
  assert.ok(frameLighting(w, null).lighting.ambientNight<plain.ambientNight);
  w.time=nightStart(1)+30;
  assert.equal(moonLighting(w), null);
  // The dawn fade keeps the colour of the night that is ending.
  w.time=RULES.cycle*blood+4;
  assert.equal(moonLighting(w), MOON_LIGHT.blood);
});

test('hunters come for wanderers at a Poisson pace that rises with the day and the ring', () => {
  const {w,p}=camp();w.ambient=true;w.nextSpawn=1e12;
  const day=nextMoon(w, 'waxing', 3);w.time=nightStart(day)+20;
  const rates=[0, 1, 2].map(tier=>{const at=spot(w, tier);Object.assign(p, at);return huntRate(w, p);});
  assert.ok(rates[0]<rates[1]&&rates[1]<rates[2], `rates ${rates}`);
  const outer=spot(w, 2);Object.assign(p, outer);
  const late=nextMoon(w, 'waxing', day+4);
  const lateRate=(()=>{const t=w.time;w.time=nightStart(late)+20;tonight(w);const r=huntRate(w, p);w.time=t;tonight(w);return r;})();
  assert.ok(lateRate>rates[2], 'later nights hunt harder');
  // The observed rate matches the clock: 1500 simulated seconds in the woods.
  const woods=spot(w, 1);Object.assign(p, woods);
  const expected=huntRate(w, p)*1500;
  const {groups, spawns}=huntFor(w, 1500);
  assert.ok(Math.abs(groups-expected)<Math.max(6, expected*.25), `${groups} groups, expected ${expected.toFixed(1)}`);
  const hearth=w.buildings.find(b=>b.type==='hearth');
  for(const s of spawns){
    assert.ok(w.walkable(s.x, s.z), `unwalkable spawn ${s.x},${s.z}`);
    const d=Math.hypot(s.x-p.x, s.z-p.z);
    assert.ok(d>=HUNT.near-2.5&&d<=HUNT.far+2.5, `spawned ${d.toFixed(1)} away`);
    assert.ok(Math.hypot(s.x-hearth.x, s.z-hearth.z)>=hearthReach(hearth)+HUNT.fireGap-2.3);
  }
  assert.ok(spawns.length>=groups&&spawns.length<=groups*3);
});

test('under a new moon the Heartfire keeps hunters away; on other nights they come less often at home', () => {
  const {w,p}=camp();w.ambient=true;w.nextSpawn=1e12;
  const hearth=w.buildings.find(b=>b.type==='hearth');
  const dark=nextMoon(w, 'new', 3);w.time=nightStart(dark)+10;
  p.x=hearth.x+2;p.z=hearth.z+1;
  assert.equal(huntRate(w, p), 0);
  assert.equal(huntFor(w, 600).groups, 0);
  // Just outside the fire's reach (+ a few steps) they find you again.
  const edge=hearthReach(hearth)+HUNT.homeGap+1;p.x=hearth.x+edge;p.z=hearth.z;
  assert.ok(huntRate(w, p)>0);
  const wax=nextMoon(w, 'waxing', 3);w.time=nightStart(wax)+10;tonight(w);
  p.x=hearth.x+2;p.z=hearth.z+1;const home=huntRate(w, p);
  p.x=hearth.x+edge;p.z=hearth.z;const away=huntRate(w, p);
  assert.ok(home>0&&home<away, `home ${home} away ${away}`);
  p.x=hearth.x+2;p.z=hearth.z+1;
  const {spawns}=huntFor(w, 900);
  assert.ok(spawns.length>0);
  for(const s of spawns){
    assert.ok(Math.hypot(s.x-hearth.x, s.z-hearth.z)>=hearthReach(hearth)+HUNT.fireGap-2.3, 'never inside the firelight');
    assert.ok(w.walkable(s.x, s.z));
  }
});

test('hunters are capped per wanderer and by NIGHT_CAP, and fade when far from everyone or at dawn', () => {
  const {w,p}=camp();w.ambient=true;w.nextSpawn=1e12;
  const day=nextMoon(w, 'waxing', 6);w.time=nightStart(day)+10;
  Object.assign(p, spot(w, 2));
  const cap=huntCap(day, 2);
  for(let i=0;i<40;i++)sendHunters(w, p);
  const hunters=()=>w.enemies.filter(e=>e.hunt);
  assert.equal(hunters().length, cap);
  assert.ok(cap<=HUNT.cap.max);
  for(const e of hunters())assert.ok(w.walkable(e.x, e.z));
  // The whole night shares NIGHT_CAP with the waves.
  w.enemies=[];while(w.enemies.length<NIGHT_CAP)w.spawnEnemy('crawler', 0, 3);
  assert.equal(sendHunters(w, p), 0);
  w.enemies=[];
  // Walk far away: they give up within a sweep.
  for(let i=0;i<3;i++)sendHunters(w, p);
  const before=hunters().length;assert.ok(before>0);
  const guard=w.spawnEnemy('crawler', p.x+30, p.z, {home:true});
  p.x=-p.x;p.z=-p.z;
  for(let i=0;i<Math.ceil(HUNT.sweep/.05)+1;i++)stepNight(w, .05, 'night', 'night');
  assert.equal(w.enemies.filter(e=>e.hunt&&Math.hypot(e.x-p.x, e.z-p.z)>HUNT.despawn).length, 0);
  assert.ok(w.enemies.includes(guard), 'residents stay');
  // Dawn clears whatever still hunts.
  w.ambient=false;for(let i=0;i<3;i++)sendHunters(w, p);assert.ok(hunters().length>0);
  w.time=RULES.cycle*day-.02;w.tick(.05);
  assert.equal(dayAt(w.time), day+1);
  assert.equal(hunters().length, 0);
});

test('the hunter clock keeps one record per night and ignores the showcase and the arena', () => {
  const {w,p}=camp();w.ambient=true;w.nextSpawn=1e12;
  const day=nextMoon(w, 'waxing', 2);w.time=nightStart(day)+10;Object.assign(p, spot(w, 1));
  const night=tonight(w);
  stepNight(w, .05, 'night', 'night');
  assert.ok(Number.isFinite(night.hunt[p.id]));
  assert.equal(w.night, night, 'one record per night');
  w.showcase=true;w.enemies=[];huntFor(w, 300);assert.equal(w.enemies.filter(e=>e.hunt).length, 0);
  assert.equal(moonOf({seed:1, arena:{wave:3}}, 9), 'waxing');
  assert.equal(moonLighting({seed:1, arena:{wave:3}, time:nightStart(9)}), null);
});
