// The Long Night rules: regions, rarity, loot tables, experience, weapon styles
// and the difficulty curve. Pure data and pure functions; no World, DOM or art.

// ------------------------------------------------------------------ regions
export const REGIONS = Object.freeze({
  meadow:{name:'The Meadow', tier:0},
  woods:{name:'Autumn Woods', tier:1},
  graveyard:{name:'The Graveyard', tier:1},
  mire:{name:'Hollow Mire', tier:2},
  crags:{name:'Moonshard Crags', tier:2},
  barrow:{name:'Barrow Fields', tier:2},
});

const hash=(x,z)=>{let h=Math.imul(x|0,374761393)+Math.imul(z|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const smooth=t=>t*t*(3-2*t);
export function valueNoise(x,z){
  const xi=Math.floor(x),zi=Math.floor(z),xf=smooth(x-xi),zf=smooth(z-zi);
  const a=hash(xi,zi),b=hash(xi+1,zi),c=hash(xi,zi+1),d=hash(xi+1,zi+1);
  return a+(b-a)*xf+(c-a)*zf+(a-b-c+d)*xf*zf;
}

export const INNER_RING=36, OUTER_RING=88;

/** Region name at a world position. Stable for every seed so terrain, minimap and spawns agree. */
export function regionAt(x,z){
  const r=Math.hypot(x,z)+(valueNoise(x*.055+11,z*.055-4)-.5)*16;
  if(r<INNER_RING)return 'meadow';
  let a=Math.atan2(z,x)*180/Math.PI+(valueNoise(x*.04-7,z*.04+3)-.5)*50;
  a=((a%360)+360)%360;
  if(r<OUTER_RING)return (a>=290||a<70)?'graveyard':'woods';
  if(a<120)return 'barrow';
  if(a<240)return 'mire';
  return 'crags';
}
export const tierAt=(x,z)=>REGIONS[regionAt(x,z)]?.tier??0;

export const NODE_POOLS = Object.freeze({
  meadow:['pumpkin','bush','grass','tree','rock','grass','pumpkin','mushroom'],
  woods:['tree','tree','tree','tree','grass','mushroom','bush','rock','glowsprout'],
  graveyard:['grave','grave','ore','rock','tree','bones','mushroom','grass','gravewisp','gravewisp'],
  mire:['glowcap','glowcap','glowcap','grass','grass','tree','bush','mushroom'],
  crags:['shardrock','shardrock','shardrock','rock','rock','ore','ore','grass'],
  barrow:['bones','bones','bones','grave','grave','ore','tree','rock'],
});

/** Creatures that live in a region by day and guard its caches. */
export const RESIDENTS = Object.freeze({
  meadow:[],
  woods:['crawler','crawler','wraith'],
  graveyard:['wraith','bonewalker','crawler'],
  mire:['bogling','bogling','crawler'],
  crags:['golem','bonewalker','wraith'],
  barrow:['bonewalker','bonewalker','brute'],
});

export const CACHE_LAYOUT = Object.freeze([
  {type:'crate', count:40, min:9, max:120},
  {type:'ironchest', count:18, min:44, max:132},
  {type:'moonchest', count:10, min:86, max:128},
  {type:'reliquary', count:5, min:108, max:138},
]);
export const CACHE_TYPES = Object.freeze(CACHE_LAYOUT.map(entry=>entry.type));
export const isCache = type=>CACHE_TYPES.includes(type);
/** How many guardians wait beside each cache tier. */
export const CACHE_GUARDS = Object.freeze({crate:0, ironchest:2, moonchest:3, reliquary:4});

// ------------------------------------------------------------------ rarity
export const RARITIES = Object.freeze(['common','uncommon','rare','epic','legendary']);
export const RARITY_COLORS = Object.freeze({common:'#d8d2c2', uncommon:'#8fd3a0', rare:'#79b8ff', epic:'#c49bff', legendary:'#f2c14e'});
const ITEM_RARITY = Object.freeze({
  shard:'uncommon', bone:'common', spore:'common', ore:'uncommon', ember:'uncommon',
  elixir:'uncommon', heartstone:'epic', stew:'uncommon', bandage:'common',
  sword:'uncommon', torch:'common', recurve:'uncommon', bonebow:'rare', broadsword:'rare', crookstaff:'rare',
  flamberge:'epic', skullstaff:'epic', tome:'legendary', bonemail:'rare', shardplate:'epic', everlantern:'legendary',
  'cinder-staff':'rare', 'barrow-rattle':'rare', 'widows-needle':'rare', 'spirit-fan':'epic', 'mourning-bell':'epic', 'kitsune-lantern':'epic', plaguebeak:'epic', gloomgrasp:'epic', pallbearer:'epic',
  fangs:'rare', wisplantern:'rare', crowtotem:'rare', soulchain:'epic', stormrod:'epic', jacklantern:'epic', censer:'epic',
  scythe:'legendary', starfall:'legendary', wighthorn:'legendary',
  // Trinkets (trinkets.mjs): six rare, four epic. Caches and elites drop them through the pools below.
  nightfang:'rare', emberheart:'rare', crowseye:'rare', harvestcharm:'rare', wispfeather:'rare', gravedust:'rare',
  frostanklet:'epic', boneward:'epic', moonlocket:'epic', thornknot:'epic',
  // Refinement currency: only creatures drop it (LOOT_TABLES below, REFINE).
  ichor:'uncommon',
});
export const rarityOf = itemId=>ITEM_RARITY[itemId]||'common';
export const rarityRank = itemId=>RARITIES.indexOf(rarityOf(itemId));

// ------------------------------------------------------------------ loot tables
// Each table: rolls of weighted entries. `n` is [min,max] quantity; `pick` picks one item
// from a rarity pool so new gear only needs a rarity to join the tables.
const POOLS = Object.freeze({
  uncommon:['recurve','sword','elixir','elixir','torch','bandage'],
  rare:['bonebow','broadsword','crookstaff','bonemail','cinder-staff','barrow-rattle','widows-needle','fangs','wisplantern','crowtotem','nightfang','emberheart','crowseye','harvestcharm','wispfeather','gravedust'],
  epic:['flamberge','skullstaff','shardplate','heartstone','spirit-fan','mourning-bell','soulchain','stormrod','jacklantern','censer','pallbearer','frostanklet','boneward','moonlocket','thornknot'],
  legendary:['tome','everlantern','scythe','starfall','wighthorn'],
});
export const LOOT_TABLES = Object.freeze({
  crate:{xp:12, rolls:[
    {count:[2,3], entries:[['wood',[2,4],3],['stone',[2,4],3],['fiber',[2,4],2],['berry',[2,3],2],['meat',[1,2],1],['bandage',[1,1],1],['seed',[1,3],1],['ore',[1,2],.6]]},
    {chance:.3, entries:[['uncommon',1,1]]},
  ]},
  ironchest:{xp:30, rolls:[
    {count:[2,3], entries:[['ore',[2,3],2],['bone',[2,4],2],['shard',[1,2],1],['ember',[1,3],1],['bandage',[1,2],1],['stew',[1,1],.4]]},
    {entries:[['uncommon',1,3],['rare',1,2]]},
  ]},
  moonchest:{xp:65, rolls:[
    {count:[2,3], entries:[['shard',[2,4],2],['ore',[2,4],2],['ember',[2,4],2],['elixir',[1,2],1],['bone',[2,4],1]]},
    {entries:[['rare',1,1]]},
    {chance:.45, entries:[['epic',1,1]]},
  ]},
  reliquary:{xp:130, rolls:[
    {count:[3,4], entries:[['shard',[3,5],2],['ember',[3,6],2],['elixir',[1,2],1],['ore',[3,5],1]]},
    {entries:[['epic',1,1]]},
    {chance:.5, entries:[['legendary',1,1]]},
  ]},
  // Hostiles: bonus drops on top of ENEMIES[type].loot. Elites add +1 luck.
  // Swarm creatures drop little each: there are many more of them.
  // Dread ichor (refinement) comes only from creatures: a little from the swarm, more from the big ones.
  crawler:{xp:4, rolls:[{chance:.3, entries:[['fiber',[1,2],3],['meat',[1,1],2]]},{chance:.025, entries:[['uncommon',1,1]]},{chance:.14, entries:[['ichor',[1,1],1]]}]},
  wraith:{xp:8, rolls:[{chance:.06, entries:[['uncommon',1,4],['rare',1,1]]},{chance:.35, entries:[['ichor',[1,1],1]]}]},
  brute:{xp:34, rolls:[{chance:.26, entries:[['uncommon',1,3],['rare',1,2],['epic',1,.3]]},{entries:[['ichor',[2,3],1]]}]},
  bonewalker:{xp:11, rolls:[{chance:.08, entries:[['uncommon',1,3],['rare',1,1]]},{chance:.35, entries:[['ichor',[1,1],1]]}]},
  bogling:{xp:10, rolls:[{chance:.08, entries:[['uncommon',1,3],['elixir',[1,1],2]]},{chance:.4, entries:[['ichor',[1,1],1]]}]},
  golem:{xp:52, rolls:[{chance:.34, entries:[['rare',1,3],['epic',1,1]]},{entries:[['ichor',[3,4],1]]}]},
  king:{xp:320, rolls:[{entries:[['epic',1,1]]},{entries:[['legendary',1,1]]},{count:[2,2], entries:[['heartstone',[1,1],1],['elixir',[2,3],2]]},{entries:[['ichor',[10,14],1]]}]},
});

function between(rng,[lo,hi]){return lo+Math.floor(rng()*(hi-lo+1));}
function weighted(rng,entries){
  const total=entries.reduce((sum,e)=>sum+e[2],0);let r=rng()*total;
  for(const e of entries){r-=e[2];if(r<=0)return e;}
  return entries[entries.length-1];
}
const upgrade={uncommon:'rare',rare:'epic',epic:'legendary',legendary:'legendary'};

/** Rolls a table. `luck` (0..) upgrades pooled rarities and raises roll chances. Returns merged [{itemId,count}]. */
export function rollLoot(tableId, rng, luck=0){
  const table=LOOT_TABLES[tableId];if(!table)return [];
  const out=new Map();
  const add=(itemId,count)=>{if(count>0)out.set(itemId,(out.get(itemId)||0)+count);};
  for(const roll of table.rolls){
    if(roll.chance!==undefined&&rng()>Math.min(1,roll.chance*(1+luck*.8)))continue;
    const times=roll.count?between(rng,roll.count):1;
    for(let i=0;i<times;i++){
      const [id,qty]=weighted(rng,roll.entries);
      if(POOLS[id]){
        let tier=id;if(luck>0&&rng()<.18*luck)tier=upgrade[tier];
        const pool=POOLS[tier];add(pool[Math.floor(rng()*pool.length)],1);
      }else add(id,Array.isArray(qty)?between(rng,qty):qty);
    }
  }
  return [...out.entries()].map(([itemId,count])=>({itemId,count}));
}

// ------------------------------------------------------------------ experience
export const MAX_LEVEL=40;
export const xpToNext = level=>Math.round(40*Math.pow(Math.max(1,level),1.45));
export const GATHER_XP=2, DISCOVER_XP=35, SHARE_RADIUS=26;
export const enemyXp = type=>LOOT_TABLES[type]?.xp??8;
export const HP_PER_LEVEL=8, POWER_PER_LEVEL=.04, HEARTSTONE_HP=15;
/** In the battle arena levels are the whole of your growth, so each one is worth more. */
export const ARENA_GROWTH=Object.freeze({hp:12, power:.06, rank:.22, maxRank:5});
export function maxHealth(p){return 100+(p?.growth==='arena'?ARENA_GROWTH.hp:HP_PER_LEVEL)*((p?.level||1)-1)+(p?.bonusHp||0);}
/**
 * Weapon rank, ★1 to ★5, kept in `p.ranks` by weapon type. The arena ranks a weapon up with cards,
 * the weapon lab sets it by hand, and on an expedition kills with a weapon raise it (MASTERY).
 * Rank adds damage (powerOf) and decides how much flourish an attack and its skill show:
 * ★1 is plain, ★5 is the full show (src/fx).
 */
export function rankOf(p, itemId=p?.equipment?.weapon?.itemId){
  const rank=Math.floor(Number(p?.ranks?.[itemId]))||1;
  return Math.max(1, Math.min(ARENA_GROWTH.maxRank, rank));
}
/**
 * Weapon mastery on an expedition. Every kill with a weapon in hand adds points to that weapon type
 * (tougher foes teach more: a point per 10 xp, at least 1, twice for elites); `steps[i]` is the total
 * that reaches rank i+1. Mastery belongs to the wanderer, so a broken weapon's rank carries over to
 * the next one of its kind. Here levels already add power, so each rank adds less than in the arena.
 */
export const MASTERY=Object.freeze({steps:Object.freeze([0, 25, 80, 180, 360]), rank:.08, perXp:10, elite:2, most:30});
/** Mastery points a kill is worth. */
export function masteryPoints(enemy){
  const base=Math.max(1, Math.min(MASTERY.most, Math.round(enemyXp(enemy?.type)/MASTERY.perXp)));
  return base*(enemy?.elite?MASTERY.elite:1);
}
/** Where a wanderer stands with a weapon type: points, rank, and progress toward the next rank (null at ★5). */
export function masteryOf(p, itemId){
  const points=Math.max(0, Number(p?.mastery?.[itemId])||0), steps=MASTERY.steps;
  let rank=1;
  for(let i=1;i<steps.length;i++)if(points>=steps[i])rank=i+1;
  const from=steps[rank-1], to=steps[rank]??null;
  return {points, rank, from, to, progress:to==null?1:Math.max(0, Math.min(1, (points-from)/(to-from)))};
}
/** Damage multiplier: level, and the rank of the weapon in hand (arena ranks count for more). */
export function powerOf(p){
  const arena=p?.growth==='arena';
  const level=1+(arena?ARENA_GROWTH.power:POWER_PER_LEVEL)*((p?.level||1)-1);
  const rank=p?.ranks?.[p?.equipment?.weapon?.itemId]||1;
  // `might`: a temporary multiplier other rules set on the wanderer (trinkets.mjs).
  const might=p?.might>0?p.might:1;
  // Honed: the weapon in hand's refinement (REFINE below).
  const honed=1+refineStat(p,'honed');
  return level*(1+(arena?ARENA_GROWTH.rank:MASTERY.rank)*(Math.min(ARENA_GROWTH.maxRank,rank)-1))*might*honed;
}
// ------------------------------------------------------------------ refinement
/**
 * Refinement: up to three modifiers on each weapon type, rolled at a workbench with Dread ichor,
 * which only creatures drop. Each modifier is rolled with a rarity (the loot rarities, `weights`
 * is the chance of each, common first) and the rarity picks its strength from `values`. `min` keeps
 * a modifier out of the lower rarities; `only` limits it to weapons that shoot ('shots') or swing
 * ('melee'); `needs` rolls it only beside another (Cruel beside Keen). `weight` favours a pick. Like mastery it belongs to the wanderer, kept in `p.refine[itemId]` as
 * [{mod, tier}], so a broken weapon's successor keeps it. src/refine.mjs rolls and applies them.
 * Filling slot n costs cost[weapon rarity] x n ichor; rerolling a slot costs twice the base.
 */
export const REFINE=Object.freeze({
  slots:3,
  weights:Object.freeze([46,28,16,8,2]),
  cost:Object.freeze({common:3, uncommon:4, rare:5, epic:6, legendary:8}),
  rerollCost:2,
  crit:1.5,        // a critical hit's multiplier before Cruel
  leechCap:3,      // most health one hit can give back (Thirsting)
  splitShare:.5,   // damage of each extra whole shot (Split)
  mods:Object.freeze({
    keen:{name:'Keen', text:'+{v}% critical chance', values:[5,8,12,18,30]},
    cruel:{name:'Cruel', text:'+{v}% critical damage', values:[25,35,50,70,100], needs:'keen'},
    honed:{name:'Honed', text:'+{v}% damage', values:[4,6,9,13,20]},
    swift:{name:'Swift', text:'{v}% faster attacks', values:[4,6,9,12,18]},
    fervent:{name:'Fervent', text:'Skill recharges {v}% faster', values:[6,9,12,16,24]},
    thirst:{name:'Thirsting', text:'{v}% of damage dealt heals you', values:[1.5,2,3,4,6]},
    bane:{name:'Bane', text:'+{v}% damage to elders and the Hollow King', values:[10,15,25,35,50]},
    tempered:{name:'Tempered', text:'{v}% less wear', values:[15,25,35,50,70]},
    reach:{name:'Long', text:'+{v}% reach', values:[8,12,16,22,30], only:'melee'},
    split:{name:'Split', text:'+{v} {shot}', values:[0,0,0,1,2], min:3, only:'shots', count:true, weight:3},
  }),
});
/**
 * A refinement stat of the weapon in hand (or `itemId`): percentages as fractions (Honed 20 → .2),
 * counts as counts (Split). 0 when unrefined or broken.
 */
export function refineStat(p, key, itemId){
  const weapon=p?.equipment?.weapon;
  const id=itemId===undefined?(weapon&&weapon.durability>0?weapon.itemId:null):itemId;
  const list=id&&p?.refine?.[id];
  if(!Array.isArray(list))return 0;
  const mod=REFINE.mods[key];if(!mod)return 0;
  let total=0;
  for(const entry of list)if(entry?.mod===key)total+=mod.values[Math.max(0,Math.min(4,entry.tier|0))]||0;
  return mod.count?total:total/100;
}

/** Mending at the Heartfire: what it costs and how much of a weapon's condition it gives back. */
export const MEND=Object.freeze({cost:Object.freeze({ember:1}), share:.5, warnAt:.25});

// ------------------------------------------------------------------ gear
export const ARMOR_REDUCTION = Object.freeze({armor:.45, bonemail:.55, shardplate:.65});
/**
 * Dodge: a 3.91-unit burst over .18s, invulnerable for .32s from the press. Two charges. Each spent
 * charge has its own 10s cooldown, and only one of those cooldowns runs at a time — the next charge
 * does not start cooling until the one ahead of it returns. Spending a charge never resets a cooldown
 * already running. Dodge, wait 5s, dodge again: one charge is back 5s later, and the second 10s after that.
 * A blow inside the i-frames is a perfect dodge: that charge comes back almost at once and some stamina returns.
 */
export const DASH = Object.freeze({distance:3.4*1.15, time:.18, iframes:.32, charges:2, recharge:10, stamina:22, perfectCooldown:.15, perfectStamina:12});
export const LIGHT_ITEMS = Object.freeze(['torch','everlantern','gravelight']);
export const EVERLANTERN_RADIUS_SCALE=1.45;

/** How each non-magic weapon attacks. Damage comes from EQUIPMENT[id].damage. */
/**
 * Attack styles. Uncommon and rare weapons were too strong: their base damage (content.mjs) is half
 * what it was and their cooldowns 30% longer than before.
 */
export const WEAPON_STYLES = Object.freeze({
  fist:{style:'melee', damage:9, range:2, arc:0, cooldown:.65, stamina:7},
  // crafted
  spear:{style:'melee', range:3.3, arc:0, cooldown:.55, stamina:7},
  sword:{style:'melee', range:3.3, arc:0, cooldown:.72, stamina:7},
  recurve:{style:'arrow', range:13, speed:18*1.15, cooldown:.78, stamina:6, pierce:0},
  bonebow:{style:'arrow', range:15, speed:21*1.15, cooldown:.98, stamina:7, pierce:2},
  broadsword:{style:'melee', range:3.2, arc:110, cooldown:.91, stamina:10},
  crookstaff:{style:'bolt', range:11, speed:12*1.15, cooldown:1.24, stamina:9, splash:1.7},
  // loot only
  flamberge:{style:'melee', range:3.6, arc:150, cooldown:.8, stamina:12},
  skullstaff:{style:'bolt', range:12, speed:12*1.15, cooldown:1.05, stamina:11, splash:2.3, slow:2},
  tome:{style:'nova', range:4.6, cooldown:1.5, stamina:18},
  fangs:{style:'combo', range:2.6, cooldown:.39, stamina:4, window:1.2, every:4, rend:2.5, bleed:.5, bleedSeconds:3, lunge:.8,
    blurb:'Twin daggers. Every fourth cut rends: a lunge, heavy damage and a bleed'},
  soulchain:{style:'lash', range:5.5, width:.85, pull:1.6, cooldown:.85, stamina:10,
    blurb:'Lashes everything in a long line and drags it toward you'},
  scythe:{style:'reap', range:3.9, arc:240, cooldown:.9, stamina:13, leech:.03, leechCap:3,
    blurb:'A huge reaping arc. Each foe struck heals you'},
  wisplantern:{style:'wisps', count:3, seek:11, range:14, speed:9*1.15, turn:7, cooldown:1.37, stamina:9,
    blurb:'Frees three homing wisps that seek separate foes'},
  stormrod:{style:'chain', range:9, jumps:3, jump:4.5, falloff:.75, shock:.25, cooldown:1.05, stamina:11,
    blurb:'Lightning that leaps to three more foes and jolts them'},
  starfall:{style:'meteor', range:12, delay:.7, radius:2.6, cooldown:1.6, stamina:16,
    blurb:'Calls a star down on the nearest foe. Huge blast'},
  crowtotem:{style:'crows', count:3, cap:6, sight:9, cooldown:2.08, stamina:10,
    blurb:'Calls three carrion crows that fly to your foes (up to six)'},
  jacklantern:{style:'sentry', cap:2, sight:8, cooldown:2.2, stamina:12,
    blurb:'Plants a pumpkin sentry that spits burning seeds (up to two)'},
  wighthorn:{style:'wight', mend:.35, sight:10, cooldown:3, stamina:16,
    blurb:'Raises a Grave Knight who taunts and cleaves. Blow again to mend him'},
  censer:{style:'frost', range:8, radius:2.6, life:4, freezeAfter:1.2, freeze:1.8, cooldown:2.3, stamina:14,
    blurb:'Swings out a freezing fog. Foes inside slow, then freeze solid'},
});
/** Summoned allies. Each blow deals the summoning weapon's damage (level-scaled); hp scales with level when `scales` is set. */
export const ALLIES = Object.freeze({
  crow:{name:'Carrion crow', hp:18, life:14, speed:7*1.15, sight:9, leash:16, range:.9, period:.75, follow:1.4, fly:true, scales:true},
  jack:{name:'Pumpkin sentry', hp:110, life:24, sight:8, leash:30, period:.8, shot:13*1.15, ranged:true, scales:true},
  wight:{name:'Grave Knight', hp:300, life:40, speed:3.2*1.15, sight:10, leash:18, range:1.9, arc:140, period:1.2, follow:1.6, taunt:7, guard:.7, scales:true},
});
export function weaponStyle(itemId){return WEAPON_STYLES[itemId]||null;}
/**
 * Weapons whose blows still knock foes back: bare hands, the plain single-target blades and the bows.
 * Area and magic weapons (cleaves, novas, bursts, stars, bells, fans, summons...) only hurt; pulls
 * (the soulchain, gathering skills) still pull. Covers auto attacks and skills.
 */
export const KNOCKBACK_WEAPONS = Object.freeze(['fist', 'spear', 'sword', 'fangs', 'recurve', 'bonebow']);
export const keepsKnockback = itemId=>KNOCKBACK_WEAPONS.includes(itemId||'fist');

// ------------------------------------------------------------------ difficulty
// Quantity over toughness: each day adds more creatures faster than it adds health to each one.
export function enemyScale(day){return {hp:1+.1*(Math.max(1,day)-1), damage:1+.07*(Math.max(1,day)-1)};}
export function eliteChance(day, tier=0){return Math.min(.18, .02*(Math.max(1,day)-1)+tier*.05);}
export const ELITE = Object.freeze({hp:1.8, damage:1.25, luck:1, xp:2.2, scale:1.3});
/** Creatures per night wave. Night 1 is three briarlings; the swarm grows by about two a day. */
export function waveSize(day, humans){return Math.min(40, 2+Math.floor(Math.max(1,day)*1.9)+(Math.max(1,humans)-1)*3);}
/** A new night wave waits while this many invaders still roam (keeps phones smooth). */
export const NIGHT_CAP = 48;
export const isBossNight = day=>day>0&&day%5===0;

/** Weighted night roster for a given day. */
export function nightRoster(day){
  const roster=[['crawler',9]];
  if(day>=2)roster.push(['wraith',2]);
  if(day>=3)roster.push(['bonewalker',3]);
  if(day>=4)roster.push(['brute',.6+Math.min(1.4,day/10)]);
  if(day>=6)roster.push(['bogling',2]);
  if(day>=8)roster.push(['golem',.5+Math.min(1,day/12)]);
  return roster;
}
export function pickWeighted(rng, roster){
  const total=roster.reduce((sum,[,w])=>sum+w,0);let r=rng()*total;
  for(const [id,w] of roster){r-=w;if(r<=0)return id;}
  return roster[0][0];
}
/** Residents roam in packs: `pack` is how many briarlings (or bonewalkers) turn up together. */
export const ROAM = Object.freeze({interval:9, spawnMin:15, spawnMax:21, despawn:46, leash:14, aggro:10, cap:[0,6,10], chance:[0,.3,.55], pack:{crawler:[2,4], bonewalker:[1,2]}});
