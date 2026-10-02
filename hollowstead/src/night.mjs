// Night: moon phases, the night's waves, and creatures that find wanderers in the dark.
// World.spawnWave()/armNextWave() delegate here and World.tick() calls stepNight() every tick.
// Pure simulation: import only content/progression/contracts. Never engine.mjs, lighting or the DOM.
// State lives on world.night (saved and sent with snapshots); create it lazily.
//
// Every night has a moon, fixed by the world seed and the night's number (moonOf):
//   waxing  the usual defence: the night's waves come for the Heartfire.
//   new     no raid: a darker night for exploring and night-only gathering.
//   blood   the Hollow King comes, with an extra, bigger wave.
// Day and night, creatures hunt wanderers outside the Heartfire's light at a random pace
// (stepHunters), twice as often at night, except someone resting by the Heartfire under a new moon.

import {RULES, STRUCTURES, dayAt, dayOf, hollowTime, scheduleOf} from './content.mjs?v=harvest-18';
import {isVigil, threatOf} from './vigil.mjs?v=harvest-18';
import {hushedAt} from './hush.mjs?v=harvest-18';
import {STARRAIN, stepMoon} from './moons.mjs?v=harvest-18';
import {NIGHT_CAP, REGIONS, RESIDENTS, nightRoster, pickWeighted, regionAt, waveSize} from './progression.mjs?v=harvest-18';
import {phaseProgress, remainingNightWaveOffsets} from './contracts.mjs?v=harvest-18';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** The region (or seeded area) under a point: the World knows its areas (worldgen.mjs areaAt); plain objects fall back to the rings. */
const zoneOf=(world,x,z)=>typeof world?.regionOf==='function'?world.regionOf(x,z):regionAt(x,z);

/** Moon phases. `id` is stored on world.night.moon. `detail` is the one-line meaning shown in the HUD. */
export const MOONS = Object.freeze({
  waxing: Object.freeze({id:'waxing', name:'Waxing moon', detail:'The night’s waves come for the fire. Hold it together.'}),
  new: Object.freeze({id:'new', name:'New moon', detail:'No raid tonight; hunters stalk the wilds. Gather what only grows in the dark.'}),
  blood: Object.freeze({id:'blood', name:'Blood moon', detail:'The Hollow King comes, with more waves than any night.'}),
  // Rare moons (moons.mjs).
  gilded: Object.freeze({id:'gilded', name:'Gilded moon', detail:'No raid. Golden creatures heavy with treasure run from you in the dark. Hunt them down.'}),
  starrain: Object.freeze({id:'starrain', name:'Star rain', detail:'Stars fall all night and leave pieces of themselves behind. Fewer waves, but watch the sky.'}),
});

/**
 * How the moon is chosen. Nights 1-2 are always waxing, so newcomers learn to defend the fire.
 * No blood moon before night 4 or twice in a row. The first comes between nights 4 and 8
 * (`firstChance` rises by `firstStep` a night, sure by `firstBy`); after that its chance grows by
 * `step` for every night without one and it is certain once `pity` nights have passed.
 * `newShare` is the chance of a new moon on any other night. Over 200 nights this lands near
 * 60% new (no raid), 30% waxing (waves) and 10% blood (tests/night-moon.test.mjs).
 */
export const MOON_RULES = Object.freeze({waxingUntil:2, bloodFrom:4, firstChance:.2, firstStep:.1, firstBy:8, step:.015, pity:13, newShare:.67, rareFrom:3, gilded:.065, starrain:.065});

/** Blood moon waves: one more than a waxing night, each `bloodSize` times bigger (the crowd still stops at NIGHT_CAP). */
export const BLOOD_WAVE_FRACTIONS = Object.freeze([0, .26, .52, .78]);
export const BLOOD = Object.freeze({size:1.35});

/**
 * Ambient hunters, by day and by night. `mean` is the average gap in seconds between groups for a
 * wanderer by region tier (meadow, middle ring, outer ring); each day shortens it (`perDay`, up to
 * `dayMax` times as often). At night they come `night` times as often. Near the fire they come
 * `home` times less often (and not at all on a new-moon night); under a blood moon they come
 * `blood` times as often out in the wilds. Groups spawn `near`-`far` from the
 * wanderer, preferably behind, and never within the Heartfire's light plus `fireGap`.
 * `cap` is how many may hunt one wanderer at once: base + perTier*tier + perDay*day, at most max.
 * Brutes and golems join a group only from night `heavyFrom[tier]`.
 * Hunters farther than `despawn` from every wanderer fade back into the dark.
 */
export const HUNT = Object.freeze({
  mean:Object.freeze([34, 24, 16]), perDay:.1, dayMax:2.6, minMean:4, home:3, blood:1.25, night:2,
  near:14, far:20, fireGap:2, homeGap:4, crowd:30,
  cap:Object.freeze({base:2, perTier:1, perDay:1/3, max:9}), heavyFrom:Object.freeze([6, 6, 4]), despawn:44, sweep:.5,
});
/** Hunters that hit hard and walk slow: at most one a group, and only from night HUNT.heavyFrom[tier]. */
const HEAVY = new Set(['brute', 'golem']);
/** Mirrors lighting.HEARTH_LEVEL_STEP (lighting.mjs may not be imported from simulation code). */
const HEARTH_STEP = 1.5;

// ------------------------------------------------------------------ the moon

/** Stable per-seed uniform numbers in [0,1): one stream picks blood, the other new vs waxing. */
function roll(seed, n, salt){
  let h=((seed>>>0)^salt)>>>0;h=Math.imul(h^Math.imul(n|0,0x9e3779b1),0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;
  h=Math.imul(h^(n*0x27d4eb2d|0),0x165667b1);h^=h>>>15;return (h>>>0)/4294967296;
}
/** Per seed: moons[n] for night n (index 0 unused), and visits[n] = blood moons among nights 1..n. */
const SEQUENCES=new Map();
function sequence(seed, day){
  seed=seed>>>0;let s=SEQUENCES.get(seed);
  if(!s){if(SEQUENCES.size>8)SEQUENCES.clear();s={moons:['waxing'], visits:[0], last:0};SEQUENCES.set(seed,s);}
  const R=MOON_RULES;
  while(s.moons.length<=day){
    const n=s.moons.length,prev=s.moons[n-1];let moon='waxing';
    if(n>R.waxingUntil){
      let blood=0;
      if(n>=R.bloodFrom&&prev!=='blood'){
        if(!s.last)blood=n>=R.firstBy?1:R.firstChance+R.firstStep*(n-R.bloodFrom);
        else blood=n-s.last>=R.pity?1:R.step*(n-s.last-1);
      }
      moon=roll(seed,n,0x6d6f6f6e)<blood?'blood':roll(seed,n,0x2e6e6577)<R.newShare?'new':'waxing';
      // Now and then a rare moon takes the place of a new or waxing one (moons.mjs), never twice running.
      if(moon!=='blood'&&n>=R.rareFrom&&prev!=='gilded'&&prev!=='starrain'){const r=roll(seed,n,0x67696c64);if(r<R.gilded)moon='gilded';else if(r<R.gilded+R.starrain)moon='starrain';}
    }
    if(moon==='blood')s.last=n;
    s.moons.push(moon);s.visits.push(s.visits[n-1]+(moon==='blood'?1:0));
  }
  return s;
}
const nightDay=world=>Math.max(1,dayOf(world));

/** Moon over night `day` (defaults to tonight). Deterministic from the seed; the arena has none. */
export function moonOf(world, day=nightDay(world)){
  if(!world||world.arena)return 'waxing';
  day=Math.max(1,Math.floor(day)||1);
  const night=world.night;
  if(night&&night.day===day&&MOONS[night.moon])return night.moon;
  return sequence(world.seed||0, day).moons[day];
}

/** How many times the Hollow King has come by night `day`, counting tonight if it is a blood moon. Scales him (World.mobScale). */
export function kingVisits(world, day=nightDay(world)){
  if(!world||world.arena)return 0;
  day=Math.max(1,Math.floor(day)||1);
  const night=world.night;
  if(night&&night.day===day&&Number.isInteger(night.visit))return night.visit;
  return sequence(world.seed||0, day).visits[day];
}

/** First night at or after `from` with this moon (tests, tools and the showcase). */
export function nextMoon(world, moon, from=1, within=400){
  for(let day=Math.max(1,from);day<from+within;day++)if(moonOf(world, day)===moon)return day;
  return 0;
}

/** Tonight's record on world.night, rebuilt when the day turns. Sent to guests and saved. */
export function tonight(world){
  const day=nightDay(world);let night=world.night;
  if(!night||night.day!==day){
    const s=sequence(world.seed||0, day+1);
    night=world.night={day, moon:s.moons[day], next:s.moons[day+1], visit:s.visits[day], told:0, hunt:{}, sweep:0};
  }
  return night;
}

/** Colours of the dark, by moon. `ambient` scales the theme's ambientNight; `tint` replaces its nightTint. */
export const MOON_LIGHT = Object.freeze({
  new: Object.freeze({tint:'#0c0e1c', ambient:.55}),
  blood: Object.freeze({tint:'#5a1418', ambient:1.1}),
  gilded: Object.freeze({tint:'#4a3612', ambient:1.12}),
  starrain: Object.freeze({tint:'#16183a', ambient:.95}),
});
/**
 * Lighting hints for tonight, read by lighting.frameLighting on every frame (host and guests).
 * Return null for no change, or {tint:'#rrggbb', ambient:multiplier}. The first seconds of a day
 * still show the night that is ending, so the dawn fade keeps its colour.
 */
export function moonLighting(world){
  if(!world||world.arena)return null;
  const time=Math.max(0,hollowTime(world)-12);
  return MOON_LIGHT[moonOf(world, dayAt(time, scheduleOf(world)))]||null;
}

/** HUD summary for the local wanderer: {moon, name, detail, day, next, nextName, visit}. */
export function nightStatus(world){
  const day=nightDay(world),moon=moonOf(world, day),next=moonOf(world, day+1);
  return {moon, name:MOONS[moon]?.name||'', detail:MOONS[moon]?.detail||'', day, next, nextName:MOONS[next]?.name||'', visit:moon==='blood'?kingVisits(world, day):0};
}

// ------------------------------------------------------------------ waves

/** Called by World.tick() every tick outside the arena. `before`/`phase` are the phase names around this tick. */
export function stepNight(world, dt, before, phase){
  const night=tonight(world);
  // Tell everyone tonight's moon a few seconds into dusk, after the dusk call has been read.
  const clock=scheduleOf(world),now=hollowTime(world);
  if(phase==='dusk'&&night.told!==night.day&&(now%clock.cycle)-clock.day>=4.2){night.told=night.day;if(!world.showcase)world.event('announce',0,0,duskLine(night),{moon:night.moon});}
  if(before!==phase&&phase==='night'){if(!world.showcase)startNight(world, night);armNextWave(world);}
  if(phase==='night'&&now>=world.nextSpawn){if(!world.showcase&&night.moon!=='new'&&night.moon!=='gilded'&&world.invaders().length<NIGHT_CAP)spawnWave(world);armNextWave(world);}
  if(phase==='night')stepMoon(world, dt, night);
  stepHunters(world, dt, night, phase==='night');
}

function duskLine(night){
  if(night.moon==='blood')return night.visit>1?'A blood moon rises. The Hollow King is coming back.':'A blood moon rises. Something is coming for your fire.';
  if(night.moon==='new')return 'A new moon tonight. No raid, but the wilds grow dark.';
  if(night.moon==='gilded')return 'A gilded moon rises! Treasure runs loose in the dark tonight.';
  if(night.moon==='starrain')return 'The sky is restless. Stars will fall tonight.';
  return 'A waxing moon rises. The woods will come for the fire.';
}

function startNight(world, night){
  if(night.moon==='gilded'){world.event('announce',0,0,`Night ${night.day} • gilded moon. No raid: hunt the golden ones before dawn!`,{moon:'gilded'});return;}
  if(night.moon!=='new'){spawnWave(world);return;}
  world.event('announce',0,0,`Night ${night.day} • new moon. No raid; hunters stalk the wilds.`,{moon:'new'});
}

/** Wave start times into the night for a moon, in seconds. */
export function waveOffsets(moon, night=RULES.night){
  if(moon==='new'||moon==='gilded')return [];
  if(moon==='blood')return BLOOD_WAVE_FRACTIONS.map(f=>f*night);
  return remainingNightWaveOffsets(-1, night);
}

export function armNextWave(world){
  // world.nextSpawn is kept on the hollow's own clock (content.mjs hollowTime), which waits while the party is in a delve.
  const schedule=scheduleOf(world);
  const progress=phaseProgress(hollowTime(world), schedule);
  if(!progress||progress.name!=='night'){world.nextSpawn=0;return;}
  const moon=moonOf(world, progress.cycleIndex+1);
  const offset=moon==='waxing'?remainingNightWaveOffsets(progress.elapsed, schedule.night)[0]:waveOffsets(moon, schedule.night).find(o=>o>progress.elapsed+1e-8);
  world.nextSpawn=offset===undefined?progress.cycleIndex*schedule.cycle+schedule.cycle:progress.cycleIndex*schedule.cycle+progress.phaseStart+offset;
}

export function spawnWave(world){
  // `day` is the night's number (its moon); `threat` how hard it hits: the days survived on an expedition, the Dread on a Vigil.
  const day=dayOf(world),threat=isVigil(world)?Math.floor(threatOf(world)):day,humans=world.players.filter(p=>p.online).length;world.wave++;
  const moon=moonOf(world, day),blood=moon==='blood';
  let count=waveSize(threat, humans);const hearth=world.buildings.find(b=>b.type==='hearth')||{x:0,z:0};
  // A blood moon's waves are bigger, but never push the crowd past what a phone can carry.
  if(blood)count=Math.max(0,Math.min(Math.round(count*BLOOD.size),NIGHT_CAP-world.invaders().length));
  if(moon==='starrain')count=Math.max(1,Math.round(count*STARRAIN.waves));
  const roster=nightRoster(threat);
  // The night comes from one to three directions at once, each a loose pack, so the camp is swarmed rather than trickled.
  const groups=Math.min(3,1+Math.floor(count/8)),heading=[...Array(groups)].map(()=>world.rng()*Math.PI*2);
  for(let i=0;i<count;i++){const a=heading[i%groups]+(world.rng()-.5)*.7,r=16+world.rng()*6;const type=i===0&&threat>=3&&day%2===1?'brute':pickWeighted(world.rng, roster);const lim=RULES.radius-4;const x=clamp(hearth.x+Math.cos(a)*r,-lim,lim),z=clamp(hearth.z+Math.sin(a)*r,-lim,lim);const at=onLand(world,x,z,hearth);world.spawnEnemy(type,at.x,at.z);}
  if(blood&&world.bossNight!==day&&!world.enemies.some(e=>e.type==='king')){
    const visit=kingVisits(world, day);world.bossNight=day;world.bossSpawned=true;world.bossSlain=false;const at=onLand(world,hearth.x,hearth.z-19,hearth);world.spawnEnemy('king',at.x,at.z);
    world.event('announce',0,0,visit<=1?'Blood moon. The Hollow King has found your fire.':`Blood moon. The Hollow King returns, stronger. Night ${day}.`,{moon});
  }
  else world.event('announce',0,0,blood?`Night ${day} • the blood moon calls them all`:`Night ${day} • the woods are waking`,{moon});
}

/** A wave's spawn point pulled back toward the fire until it stands on walkable ground. */
function onLand(world, x, z, hearth){
  if(typeof world.walkable!=='function'||world.walkable(x,z))return {x,z};
  for(let k=1;k<=8;k++){const t=1-k/9,px=hearth.x+(x-hearth.x)*t,pz=hearth.z+(z-hearth.z)*t;if(world.walkable(px,pz))return {x:px,z:pz};}
  return {x:hearth.x,z:hearth.z};
}

// ------------------------------------------------------------------ hunters

/** Safe-light radius of the Heartfire at its level (as lighting.structureLightRadius, fuel aside). */
export function hearthReach(hearth){return hearth?(STRUCTURES.hearth.light||8)+Math.max(0,(Number(hearth.level)||1)-1)*HEARTH_STEP:0;}

/** Groups per second hunting this wanderer (0 when none may come). `dark`: it is night; the moon only matters then. */
export function huntRate(world, p, night=tonight(world), hearth=world.buildings.find(b=>b.type==='hearth'), dark=true){
  const day=isVigil(world)?Math.floor(threatOf(world)):night.day,tier=REGIONS[zoneOf(world,p.x,p.z)]?.tier??0,moon=dark?night.moon:'waxing';
  const home=!!hearth&&Math.hypot(p.x-hearth.x,p.z-hearth.z)<hearthReach(hearth)+HUNT.homeGap;
  if(home&&(moon==='new'||moon==='gilded'))return 0;
  // A hushing stone's song (hush.mjs): no hunter comes for a wanderer inside it. Raids still do.
  if(hushedAt(world,p.x,p.z))return 0;
  let mean=(HUNT.mean[tier]??HUNT.mean[HUNT.mean.length-1])/Math.min(HUNT.dayMax,1+HUNT.perDay*(day-1));
  if(home)mean*=HUNT.home;else if(moon==='blood')mean/=HUNT.blood;
  return (dark?HUNT.night:1)/Math.max(HUNT.minMean,mean);
}

/** Most hunters one wanderer draws at once. */
export function huntCap(day, tier){return Math.min(HUNT.cap.max, HUNT.cap.base+HUNT.cap.perTier*tier+Math.floor(HUNT.cap.perDay*day));}

/** A Poisson clock per wanderer: each tick spends rate*dt of a random budget; a group comes when it runs out. */
function stepHunters(world, dt, night, dark){
  if(world.showcase||!world.ambient)return;
  night.sweep=(night.sweep||0)+dt;
  if(night.sweep>=HUNT.sweep){night.sweep=0;sweepHunters(world);}
  let hearth=null;for(const b of world.buildings)if(b.type==='hearth'){hearth=b;break;}
  for(const p of world.players){
    if(!p.online||p.down||p.ghost)continue;
    let budget=night.hunt[p.id];
    if(!Number.isFinite(budget))budget=-Math.log(1-world.spawnRng());
    budget-=huntRate(world, p, night, hearth, dark)*dt;
    if(budget>0){night.hunt[p.id]=budget;continue;}
    night.hunt[p.id]=-Math.log(1-world.spawnRng());
    sendHunters(world, p, night, hearth);
  }
}

/** Hunters too far from every wanderer still standing give up and fade into the dark (so a fallen wanderer's hunters never march on the fire). Allocates only when one must go. */
function sweepHunters(world){
  let gone=false;
  for(const e of world.enemies)if(e.hunt&&!nearWanderer(world,e,HUNT.despawn)){gone=true;break;}
  if(gone)world.enemies=world.enemies.filter(e=>!e.hunt||nearWanderer(world,e,HUNT.despawn));
}
function nearWanderer(world, e, range){
  for(const p of world.players)if(p.online&&!p.ghost&&!p.down&&Math.hypot(p.x-e.x,p.z-e.z)<range)return true;
  return false;
}

/** One to three creatures from the wanderer's region, out of sight behind them. Returns how many came. */
export function sendHunters(world, p, night=tonight(world), hearth=world.buildings.find(b=>b.type==='hearth')){
  const day=isVigil(world)?Math.floor(threatOf(world)):night.day,region=zoneOf(world,p.x,p.z),tier=REGIONS[region]?.tier??0;
  let near=0;for(const e of world.enemies)if(e.hunt&&Math.hypot(e.x-p.x,e.z-p.z)<HUNT.crowd)near++;
  const room=Math.min(huntCap(day,tier)-near, NIGHT_CAP-world.invaders().length);if(room<=0)return 0;
  const rng=world.spawnRng,most=clamp(1+Math.floor(tier*.7+(day-1)/4),1,3),n=Math.min(room,1+Math.floor(rng()*most));
  const spot=huntSpot(world, p, hearth);if(!spot)return 0;
  let made=0,heavy=false;
  for(let k=0;k<n;k++){
    let type=hunterType(world, region, day);
    if(HEAVY.has(type)&&(heavy||day<(HUNT.heavyFrom[tier]??4)))type='crawler';
    heavy=heavy||HEAVY.has(type);
    const b=rng()*Math.PI*2,s=k?.9+rng()*1.3:0;let x=spot.x+Math.cos(b)*s,z=spot.z+Math.sin(b)*s;
    if(!world.walkable(x,z)){x=spot.x;z=spot.z;}
    const e=world.spawnEnemy(type,x,z,{tier:Math.max(0,tier-1)});if(!e)continue;
    e.hunt=true;made++;
  }
  return made;
}

/** Residents of the region, or the night's own roster where nothing lives (the meadow). */
function hunterType(world, region, day){
  const pool=RESIDENTS[region]||[];
  if(pool.length&&world.spawnRng()<.6)return pool[Math.floor(world.spawnRng()*pool.length)];
  // `day` here is the threat (vigil.mjs threatOf).
  return pickWeighted(world.spawnRng, nightRoster(day));
}

/** Where a group may appear: near-far from the wanderer, behind them first, on open walkable ground, in the dark. */
function huntSpot(world, p, hearth){
  const rng=world.spawnRng,facing=Math.atan2(p.dz||0,(p.dx||p.dz)?p.dx||0:1),fire=hearth?hearthReach(hearth)+HUNT.fireGap:0;
  const obstacles=typeof world.obstacles==='function'&&typeof world.blockedAt==='function'?world.obstacles():null;
  for(let tries=0;tries<14;tries++){
    const a=tries<8?facing+Math.PI+(rng()-.5)*2.4:rng()*Math.PI*2,r=HUNT.near+rng()*(HUNT.far-HUNT.near);
    const x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;
    if(!world.walkable(x,z))continue;
    if(hearth&&Math.hypot(x-hearth.x,z-hearth.z)<fire)continue;
    let close=false;for(const q of world.players)if(q.online&&!q.ghost&&Math.hypot(q.x-x,q.z-z)<HUNT.near-2){close=true;break;}
    if(close)continue;
    if(obstacles&&world.blockedAt(x,z,obstacles))continue;
    if(typeof world.lit==='function'&&world.lit({x,z}))continue;
    return {x,z};
  }
  return null;
}
