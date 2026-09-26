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

export const INNER_RING=24, OUTER_RING=58;

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
  woods:['tree','tree','tree','tree','grass','mushroom','bush','rock'],
  graveyard:['grave','grave','ore','rock','tree','bones','mushroom','grass'],
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
  {type:'crate', count:30, min:9, max:94},
  {type:'ironchest', count:16, min:28, max:94},
  {type:'moonchest', count:9, min:56, max:94},
  {type:'reliquary', count:4, min:76, max:94},
]);
export const CACHE_TYPES = Object.freeze(CACHE_LAYOUT.map(entry=>entry.type));
export const isCache = type=>CACHE_TYPES.includes(type);
/** How many guardians wait beside each cache tier. */
export const CACHE_GUARDS = Object.freeze({crate:0, ironchest:1, moonchest:2, reliquary:3});

// ------------------------------------------------------------------ rarity
export const RARITIES = Object.freeze(['common','uncommon','rare','epic','legendary']);
export const RARITY_COLORS = Object.freeze({common:'#d8d2c2', uncommon:'#8fd3a0', rare:'#79b8ff', epic:'#c49bff', legendary:'#f2c14e'});
const ITEM_RARITY = Object.freeze({
  shard:'uncommon', bone:'common', spore:'common', ore:'uncommon', ember:'uncommon',
  elixir:'uncommon', heartstone:'epic', stew:'uncommon', bandage:'common',
  sword:'uncommon', torch:'common', recurve:'uncommon', bonebow:'rare', broadsword:'rare', crookstaff:'rare',
  flamberge:'epic', skullstaff:'epic', tome:'legendary', bonemail:'rare', shardplate:'epic', everlantern:'legendary',
  'cinder-staff':'rare', 'barrow-rattle':'rare', 'widows-needle':'rare', 'spirit-fan':'epic', 'mourning-bell':'epic',
});
export const rarityOf = itemId=>ITEM_RARITY[itemId]||'common';
export const rarityRank = itemId=>RARITIES.indexOf(rarityOf(itemId));

// ------------------------------------------------------------------ loot tables
// Each table: rolls of weighted entries. `n` is [min,max] quantity; `pick` picks one item
// from a rarity pool so new gear only needs a rarity to join the tables.
const POOLS = Object.freeze({
  uncommon:['recurve','sword','elixir','elixir','torch','bandage'],
  rare:['bonebow','broadsword','crookstaff','bonemail','cinder-staff','barrow-rattle','widows-needle'],
  epic:['flamberge','skullstaff','shardplate','heartstone','spirit-fan','mourning-bell'],
  legendary:['tome','everlantern'],
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
  crawler:{xp:6, rolls:[{chance:.05, entries:[['uncommon',1,1]]}]},
  wraith:{xp:10, rolls:[{chance:.08, entries:[['uncommon',1,4],['rare',1,1]]}]},
  brute:{xp:30, rolls:[{chance:.22, entries:[['uncommon',1,3],['rare',1,2],['epic',1,.3]]}]},
  bonewalker:{xp:16, rolls:[{chance:.12, entries:[['uncommon',1,3],['rare',1,1]]}]},
  bogling:{xp:12, rolls:[{chance:.1, entries:[['uncommon',1,3],['elixir',[1,1],2]]}]},
  golem:{xp:45, rolls:[{chance:.3, entries:[['rare',1,3],['epic',1,1]]}]},
  king:{xp:320, rolls:[{entries:[['epic',1,1]]},{entries:[['legendary',1,1]]},{count:[2,2], entries:[['heartstone',[1,1],1],['elixir',[2,3],2]]}]},
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
export function maxHealth(p){return 100+HP_PER_LEVEL*((p?.level||1)-1)+(p?.bonusHp||0);}
export function powerOf(p){return 1+POWER_PER_LEVEL*((p?.level||1)-1);}

// ------------------------------------------------------------------ gear
export const ARMOR_REDUCTION = Object.freeze({armor:.45, bonemail:.55, shardplate:.65});
export const LIGHT_ITEMS = Object.freeze(['torch','everlantern']);
export const EVERLANTERN_RADIUS_SCALE=1.45;

/** How each non-magic weapon attacks. Damage comes from EQUIPMENT[id].damage. */
export const WEAPON_STYLES = Object.freeze({
  fist:{style:'melee', damage:9, range:2, arc:0, cooldown:.65, stamina:7},
  spear:{style:'melee', range:3.3, arc:0, cooldown:.55, stamina:7},
  sword:{style:'melee', range:3.3, arc:0, cooldown:.55, stamina:7},
  broadsword:{style:'melee', range:3.2, arc:110, cooldown:.62, stamina:9},
  flamberge:{style:'melee', range:3.6, arc:160, cooldown:.7, stamina:11},
  recurve:{style:'arrow', range:13, speed:18, cooldown:.55, stamina:5, pierce:0},
  bonebow:{style:'arrow', range:15, speed:21, cooldown:.7, stamina:6, pierce:2},
  crookstaff:{style:'bolt', range:11, speed:12, cooldown:.9, stamina:9, splash:1.7},
  skullstaff:{style:'bolt', range:12, speed:12, cooldown:1, stamina:11, splash:2.3, slow:2},
  tome:{style:'nova', range:4.6, cooldown:1.5, stamina:18},
});
export function weaponStyle(itemId){return WEAPON_STYLES[itemId]||null;}

// ------------------------------------------------------------------ difficulty
export function enemyScale(day){return {hp:1+.16*(Math.max(1,day)-1), damage:1+.09*(Math.max(1,day)-1)};}
export function eliteChance(day, tier=0){return Math.min(.35, .03*(Math.max(1,day)-1)+tier*.06);}
export const ELITE = Object.freeze({hp:2.2, damage:1.4, luck:1, xp:2.5, scale:1.3});
export function waveSize(day, humans){return Math.min(18, 1+Math.floor(Math.max(1,day)*1.2)+Math.floor(Math.max(1,humans)/2));}
export const isBossNight = day=>day>0&&day%5===0;

/** Weighted night roster for a given day. */
export function nightRoster(day){
  const roster=[['crawler',6]];
  if(day>=2)roster.push(['wraith',3]);
  if(day>=3)roster.push(['brute',1+Math.min(3,Math.floor(day/4))]);
  if(day>=4)roster.push(['bonewalker',3]);
  if(day>=6)roster.push(['bogling',2]);
  if(day>=8)roster.push(['golem',1+Math.floor(day/10)]);
  return roster;
}
export function pickWeighted(rng, roster){
  const total=roster.reduce((sum,[,w])=>sum+w,0);let r=rng()*total;
  for(const [id,w] of roster){r-=w;if(r<=0)return id;}
  return roster[0][0];
}
export const ROAM = Object.freeze({interval:9, spawnMin:15, spawnMax:21, despawn:46, leash:14, aggro:10, cap:[0,3,5], chance:[0,.3,.55]});
