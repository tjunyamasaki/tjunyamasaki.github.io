import {magicItems} from './magic/registry.mjs?v=harvest-16';
// Simulation identifiers are deliberately independent of art, names and animations.
const DAY=180, DUSK=30, NIGHT=100;
export const RULES = Object.freeze({version:1, tick:1/20, radius:96, maxPlayers:4, day:DAY, dusk:DUSK, night:NIGHT, cycle:DAY+DUSK+NIGHT, capacity:120, reach:2.8, speed:4.2, finalNight:5});
/**
 * Loose floor piles. Measured in this world: movement clearance 0.33, structure
 * occupancy 0.4, character billboard 1.65 wide (art padding included), interact
 * reach 2.8, walk speed 4.2. Attract is about 3.5 body-clearances and well inside
 * reach, so standing beside a pile starts a dwell without scooping from chop range.
 * Touch matches the body. A full-speed walk crosses the attract diameter in about
 * half a second, so the dwell is long enough that passing by does not collect.
 */
export const PICKUP = Object.freeze({
  attract: 1.15,
  touch: 0.42,
  dwell: 0.65,
  flight: 0.28,
  dropCooldown: 1.25,
});
export const ITEMS = {
  wood:{name:'Twisted wood',icon:'wood'},stone:{name:'Flint',icon:'stone'},fiber:{name:'Dry grass',icon:'grass'},
  ore:{name:'Moon iron',icon:'ore'},ember:{name:'Soul ember',icon:'soul'},seed:{name:'Pumpkin seed',icon:'seed'},
  berry:{name:'Nightberries',icon:'berry',food:12,heal:1},pumpkin:{name:'Pumpkin',icon:'pumpkin',food:20,heal:2},
  mushroom:{name:'Mushroom',icon:'mushroom',food:9,courage:-8},meat:{name:'Raw morsel',icon:'meat',food:12,heal:-4},
  roast:{name:'Roasted supper',icon:'roast',food:32,heal:12,courage:8},stew:{name:'Harvest stew',icon:'stew',food:65,heal:35,courage:25},
  bandage:{name:'Bandage',icon:'bandage',heal:35},
  shard:{name:'Moonshard',icon:'shard'},bone:{name:'Barrow bone',icon:'bone'},spore:{name:'Glowcap spore',icon:'spore'},
  elixir:{name:'Vigor draught',icon:'elixir',heal:60,courage:20},
  heartstone:{name:'Heartstone',icon:'heartstone',boost:'vigor'},
};
export const EQUIPMENT = {
  axe:{name:'Woodcutter’s axe',icon:'axe',durability:70},pick:{name:'Flint pick',icon:'pick',durability:70},
  spear:{name:'Briar spear',icon:'spear',durability:100,damage:16},sword:{name:'Moon blade',icon:'sword',durability:160,damage:20},
  armor:{name:'Bark armor',icon:'armor',durability:110},torch:{name:'Hand lantern',icon:'lantern',durability:180},
  recurve:{name:'Hunter’s recurve',icon:'recurve',durability:150,damage:15},
  bonebow:{name:'Barrow longbow',icon:'bonebow',durability:220,damage:16},
  broadsword:{name:'Knight’s broadsword',icon:'broadsword',durability:230,damage:16},
  flamberge:{name:'Ember flamberge',icon:'flamberge',durability:280,damage:25},
  crookstaff:{name:'Moonshard crook',icon:'crookstaff',durability:170,damage:19},
  skullstaff:{name:'Hollow skull staff',icon:'skullstaff',durability:220,damage:27},
  tome:{name:'Grimoire of Ash',icon:'tome',durability:260,damage:50},
  fangs:{name:'Hollow fangs',icon:'fangs',durability:260,damage:10},
  soulchain:{name:'Soulchain',icon:'soulchain',durability:240,damage:25},
  scythe:{name:'Reaper’s scythe',icon:'scythe',durability:300,damage:29},
  wisplantern:{name:'Wisp lantern',icon:'wisplantern',durability:180,damage:10},
  stormrod:{name:'Thunderhollow rod',icon:'stormrod',durability:200,damage:24},
  starfall:{name:'Starfall scepter',icon:'starfall',durability:220,damage:72},
  crowtotem:{name:'Carrion totem',icon:'crowtotem',durability:120,damage:8},
  jacklantern:{name:'Hollow Jack',icon:'jacklantern',durability:110,damage:18},
  wighthorn:{name:'Wightcaller horn',icon:'wighthorn',durability:90,damage:36},
  censer:{name:'Hoarfrost censer',icon:'censer',durability:160,damage:18},
  bonemail:{name:'Barrow bonemail',icon:'bonemail',durability:240},
  shardplate:{name:'Moonshard plate',icon:'shardplate',durability:360},
  everlantern:{name:'Everburning lantern',icon:'everlantern',durability:999},
};
export const NODES = {
  tree:{name:'Crooked pine',hits:4,workSeconds:4,handRate:1,tool:'axe',toolRate:2,output:'floor',loot:{wood:5,fiber:1},regrow:420,radius:.55},
  rock:{name:'Flint outcrop',hits:4,workSeconds:4.5,handRate:1,tool:'pick',toolRate:1.8,output:'floor',loot:{stone:5},regrow:520,radius:.65},
  grass:{name:'Dry grass',hits:1,workSeconds:0.9,handRate:1,output:'backpack',loot:{fiber:4},regrow:140,radius:0},
  bush:{name:'Nightberry bush',hits:2,workSeconds:1.6,handRate:1,output:'backpack',loot:{berry:3,seed:1},regrow:210,radius:.25},
  pumpkin:{name:'Wild pumpkin',hits:2,workSeconds:1.8,handRate:1,output:'backpack',loot:{pumpkin:2,seed:2},regrow:300,radius:.3},
  mushroom:{name:'Mooncap patch',hits:1,workSeconds:1,handRate:1,output:'backpack',loot:{mushroom:3},regrow:200,radius:0},
  ore:{name:'Moon iron seam',hits:6,workSeconds:3.5,handRate:0,tool:'pick',toolRate:1,required:true,output:'floor',loot:{ore:3,stone:2},regrow:600,radius:.6},
  grave:{name:'Restless grave',hits:4,workSeconds:3,handRate:0,tool:'pick',toolRate:1,required:true,output:'floor',loot:{ember:3,stone:2},regrow:600,radius:.5},
  shardrock:{name:'Moonshard spire',hits:5,workSeconds:4,handRate:0,tool:'pick',toolRate:1,required:true,output:'floor',loot:{shard:3,stone:1},regrow:700,radius:.6},
  bones:{name:'Barrow bone pile',hits:2,workSeconds:2,handRate:1,output:'floor',loot:{bone:3},regrow:420,radius:.3},
  glowcap:{name:'Giant glowcap',hits:2,workSeconds:2.2,handRate:1,output:'backpack',loot:{spore:2,mushroom:1},regrow:360,radius:.35},
  crate:{name:'Weathered crate',hits:1,workSeconds:1.2,handRate:1,output:'floor',loot:{},table:'crate',regrow:900,radius:.45},
  ironchest:{name:'Iron-bound chest',hits:1,workSeconds:1.8,handRate:1,output:'floor',loot:{},table:'ironchest',regrow:1400,radius:.5},
  moonchest:{name:'Moonlit coffer',hits:1,workSeconds:2.4,handRate:1,output:'floor',loot:{},table:'moonchest',regrow:2200,radius:.5},
  reliquary:{name:'Hollow reliquary',hits:1,workSeconds:3,handRate:1,output:'floor',loot:{},table:'reliquary',regrow:3400,radius:.6},
};
export const STRUCTURES = {
  hearth:{name:'Heartfire',hp:600,radius:1,light:8},fire:{name:'Campfire',hp:160,radius:.55,light:6},
  bench:{name:'Workbench',hp:180,radius:.65},chest:{name:'Supply chest',hp:180,radius:.65},
  wall:{name:'Palisade',hp:280,radius:.72},gate:{name:'Camp gate',hp:240,radius:.7},
  trap:{name:'Briar trap',hp:100,radius:0},farm:{name:'Pumpkin patch',hp:120,radius:0},
  pot:{name:'Cauldron',hp:160,radius:.55},lantern:{name:'Soul lantern',hp:140,radius:.3,light:6},
  bed:{name:'Bedroll',hp:100,radius:0},ward:{name:'Warding totem',hp:200,radius:.55},
};
export const RECIPES = {
  axe:{kind:'tool',cost:{wood:2,stone:2},station:'bench',desc:'Fell trees twice as quickly.'},
  pick:{kind:'tool',cost:{wood:2,stone:3},station:'bench',desc:'Mine flint, moon iron and haunted graves.'},
  spear:{kind:'tool',cost:{wood:3,stone:2,fiber:2},station:'bench',desc:'Reach and damage for defending the camp.'},
  torch:{kind:'tool',cost:{wood:2,fiber:3},station:'bench',desc:'A portable light. Toggle it to save 3 minutes of fuel.'},
  bandage:{kind:'item',cost:{fiber:4,berry:1},station:'bench',desc:'Restore 35 health. Use from your pack.'},
  armor:{kind:'tool',cost:{wood:5,fiber:5},station:'bench',desc:'Absorb 45% of damage until it breaks.'},
  sword:{kind:'tool',cost:{wood:3,ore:5,ember:2},station:'bench',desc:'A powerful weapon for the final nights.'},
  fire:{kind:'build',cost:{wood:4,stone:4},desc:'Light and courage. Feed it wood to keep it burning.'},
  bench:{kind:'build',cost:{wood:6,stone:4},desc:'Unlock armor, moon blades and advanced structures.'},
  chest:{kind:'build',cost:{wood:5,fiber:2},desc:'Share materials. Nearby recipes use its supplies.'},
  wall:{kind:'build',cost:{wood:3},desc:'Block raiders. Repair with wood between attacks.'},
  gate:{kind:'build',cost:{wood:4,fiber:1},desc:'Toggle a passage through your camp defenses.'},
  trap:{kind:'build',cost:{wood:2,stone:2,fiber:2},desc:'Three powerful hits. Rearm using flint.'},
  farm:{kind:'build',cost:{wood:2,seed:2},desc:'Plant a seed; harvest three pumpkins after 100 seconds.'},
  pot:{kind:'build',cost:{stone:6,ore:1},station:'bench',desc:'Turn pumpkin, berries and a morsel into harvest stew.'},
  lantern:{kind:'build',cost:{wood:3,ember:3},station:'bench',desc:'Permanent safe light without wood fuel.'},
  bed:{kind:'build',cost:{fiber:6,wood:2},desc:'Rest by day: trade hunger for health and courage.'},
  recurve:{kind:'tool',cost:{wood:4,fiber:4},station:'bench',desc:'A light bow. Arrows fly at the nearest foe.'},
  bonebow:{kind:'tool',cost:{bone:6,wood:3,fiber:3},station:'bench',desc:'Heavy arrows that pierce two foes.'},
  broadsword:{kind:'tool',cost:{ore:4,bone:3,wood:2},station:'bench',desc:'Wide cleaving swings. Hits every foe in front.'},
  crookstaff:{kind:'tool',cost:{shard:4,spore:2,wood:3},station:'bench',desc:'Moonshard bolts that burst on impact.'},
  bonemail:{kind:'tool',cost:{bone:8,fiber:4},station:'bench',desc:'Absorb 55% of damage until it breaks.'},
  shardplate:{kind:'tool',cost:{shard:8,ore:4,bone:4},station:'bench',desc:'Absorb 65% of damage until it breaks.'},
  elixir:{kind:'item',cost:{spore:2,berry:2},station:'bench',desc:'Restore 60 health and 20 courage.'},
  ward:{kind:'build',cost:{stone:5,ore:2,ember:4},station:'bench',desc:'A soul-powered defense. Damages nearby enemies.'},
  roast:{kind:'cook',cost:{pumpkin:1},station:'fire',desc:'Cook a pumpkin into a restorative supper.'},
  roastMeat:{kind:'cook',result:'roast',cost:{meat:1},station:'fire',desc:'Cook a raw morsel safely.'},
  roastCaps:{kind:'cook',result:'roast',cost:{mushroom:2},station:'fire',desc:'Cook away the mushrooms’ unsettling effects.'},
  stew:{kind:'cook',cost:{pumpkin:1,berry:2,meat:1},station:'pot',desc:'A feast: +65 hunger, +35 health and +25 courage.'},
};
export const ENEMIES = {
  crawler:{name:'Briarling',hp:48,speed:2,damage:9,range:1.1,period:1.3,loot:{fiber:2,meat:1}},
  wraith:{name:'Lantern wraith',hp:60,speed:2.6,damage:12,range:1.4,period:1.6,loot:{ember:2}},
  brute:{name:'Gravekeeper',hp:160,speed:1.4,damage:23,range:1.5,period:2,loot:{ore:2,ember:2,meat:2}},
  king:{name:'The Hollow King',hp:950,speed:1.3,damage:30,range:2,period:2.2,loot:{ember:15}},
  bonewalker:{name:'Bonewalker',hp:90,speed:2.5,damage:14,range:1.2,period:1.2,loot:{bone:2}},
  bogling:{name:'Bogling',hp:75,speed:1.8,damage:12,range:1.2,period:1.4,loot:{spore:1,fiber:1}},
  golem:{name:'Moonshard golem',hp:280,speed:1.2,damage:30,range:1.6,period:2.2,loot:{shard:2,stone:2}},
};
export const CHARACTERS = [
  {id:'ember',name:'Ember',detail:'The lost lantern keeper',color:'#f6a35d'},
  {id:'moss',name:'Moss',detail:'The midnight forager',color:'#94c8ae'},
  {id:'vesper',name:'Vesper',detail:'The moonlit wanderer',color:'#bea1e0'},
  {id:'cinder',name:'Cinder',detail:'The reluctant grave robber',color:'#de817b'},
];
export const label = key => ITEMS[key]?.name || EQUIPMENT[key]?.name || magicItems[key]?.name || STRUCTURES[key]?.name || ENEMIES[key]?.name || key;
export function phaseAt(time){const t=time%RULES.cycle;return t<RULES.day?'day':t<RULES.day+RULES.dusk?'dusk':'night';}
export function dayAt(time){return Math.floor(time/RULES.cycle)+1;}
export function phaseRemaining(time){const t=time%RULES.cycle;return (t<RULES.day?RULES.day:t<RULES.day+RULES.dusk?RULES.day+RULES.dusk:RULES.cycle)-t;}

// Reject inherited property names at every data-driven lookup boundary.
for (const table of [ITEMS,EQUIPMENT,NODES,STRUCTURES,RECIPES,ENEMIES]) Object.setPrototypeOf(table,null);
