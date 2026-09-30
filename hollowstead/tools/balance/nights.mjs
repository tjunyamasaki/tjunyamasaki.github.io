// Night balance harness: node tools/balance/nights.mjs [days] [seeds]
// Plays nights 1..days headless for three bots under each moon, and reports how many creatures came
// (waves at the fire, hunters around the bot), the damage the bot took, how often it went down,
// and what the Heartfire lost. Basic gear only: spear and torch, bark armor from night 3.
//   base   stands by the Heartfire and fights what reaches it.
//   woods  gathers in a small loop in the middle ring (Autumn Woods / Graveyard) all night.
//   outer  does the same in the outer ring.
// MOON=waxing|new|blood forces one moon and BOT=base|woods|outer one bot; by default every moon is played on every night
// (a blood moon before night 4 cannot happen in play and is skipped).
import {World} from '../../src/engine.mjs';
import {RULES} from '../../src/content.mjs';
import {REGIONS, maxHealth, regionAt} from '../../src/progression.mjs';
import {MOONS, tonight} from '../../src/night.mjs';

const DAYS = +(process.argv[2] || 7), SEEDS = +(process.argv[3] || 3), T = RULES.tick;
const MOON_LIST = process.env.MOON ? [process.env.MOON] : Object.keys(MOONS);
/** NOHUNT=1 takes every hunter away as it comes: the damage left is what the region's residents and the waves do. */
const NOHUNT = !!process.env.NOHUNT;
/** Where each bot spends the night: a spot in the wanted ring tier, found once per seed. */
function spotFor(seed, tier){
  if(tier === 0) return {x: 2.5, z: 1.5};
  for(let i = 0; i < 720; i++){
    const a = i*2.39996, r = tier === 1 ? 32+(i%12) : 66+(i%18);
    const x = Math.cos(a)*r, z = Math.sin(a)*r;
    if(Math.hypot(x, z) < RULES.radius-8 && REGIONS[regionAt(x, z)]?.tier === tier) return {x, z};
  }
  return {x: 0, z: tier === 1 ? 40 : 75};
}
function night(seed, day, moon, bot){
  const w = new World(seed); const p = w.addPlayer('host', 'Bot'); w.start();
  const hearth = w.buildings.find(b => b.type === 'hearth'); hearth.fuel = 1e5;
  p.level = 1+Math.floor((day-1)*.8); p.maxHp = maxHealth(p); p.hp = p.maxHp;
  // Durability above an item's maximum mints nothing, so gear starts full and is topped up every tick.
  w.grantEquipped(p, 'spear'); w.grantEquipped(p, 'torch'); p.lantern = true;
  if(day >= 3) w.grantEquipped(p, 'armor');
  if(!p.equipment.light || !p.equipment.weapon) throw new Error('the bot has no torch or spear');
  const home = spotFor(seed, bot === 'base' ? 0 : bot === 'woods' ? 1 : 2);
  p.x = home.x; p.z = home.z;
  w.time = RULES.cycle*(day-1)+RULES.day+RULES.dusk-1;
  const n = tonight(w); n.moon = moon; n.visit = moon === 'blood' ? Math.max(1, Math.floor(day/5)) : 0;
  let taken = 0, downs = 0; const hurt = w.hurt.bind(w);
  w.hurt = (q, amount, source) => {const before = q.hp; hurt(q, amount, source); taken += Math.max(0, before-q.hp);};
  const seen = new Set(); let waves = 0, hunters = 0, king = 0, hunterMax = 0, crowdMax = 0;
  const hearthStart = hearth.hp; let angle = 0;
  const end = RULES.cycle*day;
  while(w.time < end-T){
    const foe = w.enemies.filter(e => e.hp > 0 && !e.home).sort((a, b) => Math.hypot(a.x-p.x, a.z-p.z)-Math.hypot(b.x-p.x, b.z-p.z))[0];
    const d = foe ? Math.hypot(foe.x-p.x, foe.z-p.z) : 99;
    let x = 0, z = 0;
    if(bot !== 'base' && d > 3.2){
      // Gather: walk a slow loop of radius 5 round the spot.
      angle += T*.35; const gx = home.x+Math.cos(angle)*5-p.x, gz = home.z+Math.sin(angle)*5-p.z, l = Math.hypot(gx, gz);
      if(l > .4){x = gx/l; z = gz/l;}
    }else if(bot === 'base' && Math.hypot(p.x-home.x, p.z-home.z) > 2.5 && d > 3){const gx = home.x-p.x, gz = home.z-p.z, l = Math.hypot(gx, gz); x = gx/l; z = gz/l;}
    w.input(p.id, {x, z, attack: d < 3.4});
    w.tick(T);
    if(NOHUNT) w.enemies = w.enemies.filter(e => !e.hunt);
    for(const slot of ['weapon', 'light', 'body']) if(p.equipment[slot]) p.equipment[slot].durability = 100;
    p.lantern = true; p.hunger = 100;
    // A fall (to blows or to the dark) is counted, then the bot gets up where it stood watch.
    if(p.down || p.ghost){downs++; p.down = 0; p.ghost = false; p.hp = p.maxHp; p.courage = 100; p.x = home.x; p.z = home.z;}
    let hunting = 0;
    for(const e of w.enemies){
      if(e.hunt && e.hp > 0) hunting++;
      if(seen.has(e.id) || e.home) continue; seen.add(e.id);
      if(e.type === 'king') king++; else if(e.hunt) hunters++; else waves++;
    }
    hunterMax = Math.max(hunterMax, hunting); crowdMax = Math.max(crowdMax, w.enemies.length);
  }
  return {waves, hunters, king, hunterMax, crowdMax, taken: Math.round(taken), downs, hearth: Math.round(hearthStart-hearth.hp), level: p.level};
}
const BOTS = process.env.BOT ? [process.env.BOT] : ['base', 'woods', 'outer'];
const HEAD = ['moon', 'bot', 'day', 'waves', 'hunters', 'king', 'huntMax', 'crowdMax', 'hpLost', 'downs', 'fireLost'];
console.log(`nights 1-${DAYS}, ${SEEDS} seeds each (averages; *Max = most at once over all seeds)`);
console.log(HEAD.map((h, i) => i < 2 ? h.padEnd(7) : h.padStart(8)).join(''));
// Rows print as they finish, so a long run can be read (or cut short) along the way.
for(const moon of MOON_LIST) for(const bot of BOTS) for(let day = 1; day <= DAYS; day++){
  if(moon === 'blood' && day < 4) continue;
  const sum = {waves: 0, hunters: 0, king: 0, hunterMax: 0, crowdMax: 0, taken: 0, downs: 0, hearth: 0};
  for(let s = 0; s < SEEDS; s++){const r = night(1000+s*7919, day, moon, bot); for(const k of Object.keys(sum)) sum[k] += k.endsWith('Max') ? Math.max(0, r[k]-sum[k]) : r[k];}
  const avg = k => (sum[k]/(k.endsWith('Max') ? 1 : SEEDS)).toFixed(1);
  const r = {moon, bot, day, waves: avg('waves'), hunters: avg('hunters'), king: avg('king'), hunterMax: sum.hunterMax, crowdMax: sum.crowdMax, taken: avg('taken'), downs: avg('downs'), hearth: avg('hearth')};
  console.log([r.moon, r.bot].map(v => v.padEnd(7)).join('')+[r.day, r.waves, r.hunters, r.king, r.hunterMax, r.crowdMax, r.taken, r.downs, r.hearth].map(v => String(v).padStart(8)).join(''));
}
