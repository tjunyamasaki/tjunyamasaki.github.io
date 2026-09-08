// Planning experiment only. NOT the game implementation, spatial navigation,
// production oracle, a browser/offline test, or a human playtest.
// Run: node balance-lab.mjs. Writes balance-results.json beside this script.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const balance = {
  cap:10, berryIntervals:[15,12,10,8], berryCaps:[12,18,24],
  costs:{shrub:[15,60,180],pantry:[30,100],bloom:[20,70,220,650,1800],beds:[40,140,400,1000,1800,3000,5000,8000]},
  milestones:[
    [2,6,12],[3,24,90],[4,60,300],[5,120,900],[6,200,2200],
    [7,260,4000],[8,330,7000],[9,410,11000],[10,500,16000],
  ], throwCooldownSec:1, mealDelaySec:2, pendingLimit:12,
};
function run(policy, duration, throwEvery=1, visitEvery=0, visitLength=0){
  const s={t:0,glow:0,lifetime:0,berries:6,nextBerry:15,feeds:0,lastThrow:-100,
    levels:{shrub:0,pantry:0,bloom:0,beds:0},slimes:[{boostUntil:0,feeds:0}],pending:[]};
  const arrivals=[], purchases=[];let thrown=0;
  const active=t=>policy!=='never-interacts'&&(!visitEvery||t%visitEvery<visitLength);
  const join=()=>{let m=balance.milestones[s.slimes.length-1];while(m&&s.feeds>=m[1]&&s.lifetime>=m[2]*1e6&&s.slimes.length<2+s.levels.beds){s.slimes.push({boostUntil:0,feeds:0});arrivals.push({atSec:s.t,population:s.slimes.length,feeds:s.feeds,lifetimeGlow:s.lifetime/1e6});m=balance.milestones[s.slimes.length-1];}};
  const buy=id=>{const p=balance.costs[id][s.levels[id]];if(p===undefined||s.glow<p*1e6)return false;const full=s.berries===balance.berryCaps[s.levels.pantry];s.glow-=p*1e6;s.levels[id]++;if(id==='shrub'&&s.nextBerry!==null)s.nextBerry=s.t+balance.berryIntervals[s.levels.shrub];if(id==='pantry'&&full)s.nextBerry=s.t+balance.berryIntervals[s.levels.shrub];purchases.push({atSec:s.t,id,level:s.levels[id],priceGlow:p});join();return true;};
  let activeClock=0;
  for(let t=0;t<=duration;t++){
    s.t=t;
    if(t>0){
      const rate=s.slimes.reduce((n,x)=>n+100000*(1+.25*s.levels.bloom)*(x.boostUntil>t-1?2:1),0);
      s.glow+=rate;s.lifetime+=rate;
      if(s.nextBerry!==null&&s.nextBerry<=t){s.berries++;s.nextBerry=s.berries===balance.berryCaps[s.levels.pantry]?null:t+balance.berryIntervals[s.levels.shrub];}
    }
    join();
    if(active(t)){
      if(t>0&&active(t-1))activeClock++;
      const due=s.pending.filter(p=>p.due<=activeClock);s.pending=s.pending.filter(p=>p.due>activeClock);
      for(const p of due){const x=s.slimes[p.recipient];x.feeds++;s.feeds++;x.boostUntil=Math.min(t+300,Math.max(t,x.boostUntil)+120);}
      join();
      if(s.berries>0&&t-s.lastThrow>=Math.max(throwEvery,balance.throwCooldownSec)&&s.pending.length<balance.pendingLimit){
        const occupied=new Set(s.pending.map(p=>p.recipient));
        const candidates=s.slimes.map((x,i)=>({x,i})).filter(o=>!occupied.has(o.i)).sort((a,b)=>a.x.boostUntil-b.x.boostUntil||a.i-b.i);
        if(candidates.length){const full=s.nextBerry===null;s.berries--;if(full)s.nextBerry=t+balance.berryIntervals[s.levels.shrub];s.pending.push({recipient:candidates[0].i,due:activeClock+balance.mealDelaySec});s.lastThrow=t;thrown++;}
      }
      const next=balance.milestones[s.slimes.length-1];
      if(next&&s.feeds>=next[1]&&s.slimes.length>=2+s.levels.beds)buy('beds');
      else if(!buy('shrub')&&!buy('bloom'))buy('pantry');
    }
    assert(Number.isSafeInteger(s.glow)&&Number.isSafeInteger(s.lifetime));
    assert(s.berries>=0&&s.berries<=balance.berryCaps[s.levels.pantry]);
    assert(s.slimes.length<=10&&s.slimes.length<=2+s.levels.beds);
    assert(s.slimes.reduce((n,x)=>n+x.feeds,0)===s.feeds);
    assert(thrown===s.feeds+s.pending.length);
  }
  return {policy,durationSec:duration,throwEverySec:throwEvery,visitEverySec:visitEvery,visitLengthSec:visitLength,
    summary:{population:s.slimes.length,completedMeals:s.feeds,thrown,pending:s.pending.length,glow:s.glow/1e6,lifetimeGlow:s.lifetime/1e6,berries:s.berries,upgrades:s.levels},arrivals,purchases};
}
const results=[run('attentive',14400),run('leisurely',14400,10),run('short-visits',86400,1,1800,60),run('never-interacts',28800)];
const report={kind:'phase-2-design-estimate',timestepSec:1,balance,caveats:[
  'No spatial routes/collisions. Assumes a favorable near-slime throw and fixed 2-active-second throw-to-meal delay.',
  'Throws deliberately target the least-boosted available resident; real spatial allocation is nearest feasible.',
  'One-second economy crossings approximate millisecond production requirements.',
  'Short visits freeze pending meal delay outside visits but leave economy logically running. No actual checkpoint/cap/lock validation.',
  'Buying policy prioritizes needed beds after meal gate, otherwise shrub, Bloom, pantry. Not a recommended human click schedule.',
  'Meal/boost results are policy estimates, not proof that repeated feeding is enjoyable.'
],results};
writeFileSync(new URL('./balance-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log(JSON.stringify({policy:r.policy,summary:r.summary,arrivals:r.arrivals}));
