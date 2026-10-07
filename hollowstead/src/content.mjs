import {magicItems} from './magic/registry.mjs?v=harvest-18';
import {BOOKS} from './refine-mods.mjs?v=harvest-18';
// Simulation identifiers are deliberately independent of art, names and animations.
const DAY=180, DUSK=30, NIGHT=100;
export const SPEED_SCALE = 1.15;
export const FIRST_MOB = 'crawler';
export const RULES = Object.freeze({version:1, tick:1/20, radius:148, maxPlayers:4, day:DAY, dusk:DUSK, night:NIGHT, cycle:DAY+DUSK+NIGHT, capacity:120, reach:2.8, speed:4.2*SPEED_SCALE, hunger:.09, hungerRest:.54, finalNight:5});
/**
 * Loose floor piles. Measured in this world: movement clearance 0.33, structure
 * occupancy 0.4, character billboard 1.65 wide (art padding included), interact
 * reach 2.8, walk speed 4.83. Attract is about 3.5 body-clearances and well inside
 * reach, so standing beside a pile starts a dwell without scooping from chop range.
 * Touch matches the body. A full-speed walk crosses the attract diameter in about
 * half a second, so the dwell is long enough that passing by does not collect.
 */
export const PICKUP = Object.freeze({
  attract: 1.15,
  touch: 0.42,
  dwell: 0.65,
  flight: 0.28,
  dropCooldown: 15,
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
  // Frontier: night-only finds from the middle ring that open the outer regions.
  glowbloom:{name:'Glowcap bloom',icon:'glowbloom'},wispdust:{name:'Wisp essence',icon:'wispdust'},
  // Refinement: only creatures drop it. Spent at a workbench to roll weapon modifiers (refine.mjs).
  ichor:{name:'Dread ichor',icon:'ichor'},
  // Areas (worldgen.mjs): what only Frostmere and the Ashen Scar give. They awaken the Heartfire past its third level.
  rime:{name:'Rime shard',icon:'rime'},emberglass:{name:'Emberglass',icon:'emberglass'},
  // Torn from a great foe (the Hollow King, Mother Briar, The Unblinking, a Dread champion): ascends a mastered weapon (mastery.mjs ASCEND).
  sigil:{name:'Dread sigil',icon:'sigil'},
  // Homestead crops (homestead.mjs CROPS): what grows in tilled soil, and its seeds.
  moonroot:{name:'Moonroot',icon:'moonroot',food:14,heal:4,courage:10},bloodapple:{name:'Bloodapple',icon:'bloodapple',food:10,heal:8},
  wheat:{name:'Duskwheat sheaf',icon:'wheat'},
  rootseed:{name:'Moonroot seed',icon:'rootseed'},wheatseed:{name:'Duskwheat grain',icon:'wheatseed'},appleseed:{name:'Bloodapple seed',icon:'appleseed'},
  // Night crops (grow only after dark) and the rare night blooms (nightbloom.mjs).
  gloomcap:{name:'Gloomcap',icon:'gloomcap',food:8,courage:-4},starlily:{name:'Starlily',icon:'starlily'},
  moonpetal:{name:'Moonpetal',icon:'moonpetal'},ghostgourd:{name:'Ghostgourd',icon:'ghostgourd',food:22,heal:4},
  gloomspore:{name:'Gloomcap spores',icon:'gloomspore'},lilybulb:{name:'Starlily bulb',icon:'lilybulb'},
  petalseed:{name:'Moonpetal seed',icon:'petalseed'},gourdseed:{name:'Ghostgourd seed',icon:'gourdseed'},
  // Dishes that leave a blessing for a while (buffs.mjs), and the greater draught.
  moonbroth:{name:'Moonroot broth',icon:'moonbroth',food:25,heal:6,buff:'calm'},loaf:{name:'Duskwheat loaf',icon:'loaf',food:35,buff:'fed'},
  tonic:{name:'Bloodapple tonic',icon:'tonic',food:4,heal:4,buff:'fury'},tea:{name:'Starlily tea',icon:'tea',food:4,courage:10,buff:'swift'},
  gloomstew:{name:'Gloomcap stew',icon:'gloomstew',food:40,heal:10,buff:'warded'},gourdsoup:{name:'Ghostgourd soup',icon:'gourdsoup',food:50,heal:15,buff:'haunted'},
  greaterelixir:{name:'Greater vigor draught',icon:'greaterelixir',heal:120,courage:40},
  // The Vigil (vigil.mjs WARP): read it and you are carried home to your Heartfire.
  warpscroll:{name:'Homeward scroll',icon:'warpscroll',warp:true},
};
export const EQUIPMENT = {
  axe:{name:'Woodcutter’s axe',icon:'axe',durability:70},pick:{name:'Flint pick',icon:'pick',durability:70},
  spear:{name:'Briar spear',icon:'spear',durability:100,damage:15},sword:{name:'Moon blade',icon:'sword',durability:160,damage:10},
  armor:{name:'Bark armor',icon:'armor',durability:110},torch:{name:'Hand lantern',icon:'lantern',durability:180},
  recurve:{name:'Hunter’s recurve',icon:'recurve',durability:150,damage:8},
  bonebow:{name:'Barrow longbow',icon:'bonebow',durability:220,damage:8},
  broadsword:{name:'Knight’s broadsword',icon:'broadsword',durability:230,damage:8},
  flamberge:{name:'Ember flamberge',icon:'flamberge',durability:280,damage:25},
  crookstaff:{name:'Moonshard crook',icon:'crookstaff',durability:170,damage:10},
  skullstaff:{name:'Hollow skull staff',icon:'skullstaff',durability:220,damage:27},
  tome:{name:'Grimoire of Ash',icon:'tome',durability:260,damage:50},
  fangs:{name:'Hollow fangs',icon:'fangs',durability:260,damage:5},
  soulchain:{name:'Soulchain',icon:'soulchain',durability:240,damage:25},
  scythe:{name:'Reaper’s scythe',icon:'scythe',durability:300,damage:29},
  wisplantern:{name:'Wisp lantern',icon:'wisplantern',durability:180,damage:5},
  stormrod:{name:'Thunderhollow rod',icon:'stormrod',durability:200,damage:24},
  starfall:{name:'Starfall scepter',icon:'starfall',durability:220,damage:72},
  crowtotem:{name:'Carrion totem',icon:'crowtotem',durability:120,damage:4},
  jacklantern:{name:'Hollow Jack',icon:'jacklantern',durability:110,damage:18},
  wighthorn:{name:'Wightcaller horn',icon:'wighthorn',durability:90,damage:36},
  censer:{name:'Hoarfrost censer',icon:'censer',durability:160,damage:18},
  bonemail:{name:'Barrow bonemail',icon:'bonemail',durability:240},
  shardplate:{name:'Moonshard plate',icon:'shardplate',durability:360},
  everlantern:{name:'Everburning lantern',icon:'everlantern',durability:999},
  // Frontier gear: each outer region is safe only to the wanderer wearing its gear.
  sporemask:{name:'Glowcap mask',icon:'sporemask',durability:900},
  gravelight:{name:'Grave lantern',icon:'gravelight',durability:600},
  barrowcloak:{name:'Barrow cloak',icon:'barrowcloak',durability:900},
  // Bags: worn in the bag socket, they grow the pack (contracts.mjs BAG_SLOTS). They never wear out.
  satchel:{name:'Forager’s satchel',icon:'satchel',durability:999},
  haversack:{name:'Delver’s haversack',icon:'haversack',durability:999},
  // Trinkets: two sockets (the second opens later); they never wear out. Effects live in trinkets.mjs.
  frostanklet:{name:'Frost anklet',icon:'frostanklet',durability:100},
  nightfang:{name:'Night fang',icon:'nightfang',durability:100},
  emberheart:{name:'Ember heart',icon:'emberheart',durability:100},
  crowseye:{name:'Crow’s eye',icon:'crowseye',durability:100},
  harvestcharm:{name:'Harvest charm',icon:'harvestcharm',durability:100},
  boneward:{name:'Bone ward',icon:'boneward',durability:100},
  wispfeather:{name:'Wisp feather',icon:'wispfeather',durability:100},
  gravedust:{name:'Grave dust',icon:'gravedust',durability:100},
  moonlocket:{name:'Moon locket',icon:'moonlocket',durability:100},
  thornknot:{name:'Thorn knot',icon:'thornknot',durability:100},
  // Relics: made for two sockets (combos in trinkets.mjs RESONANCES).
  tinderpouch:{name:'Tinder pouch',icon:'tinderpouch',durability:100},
  crookedkey:{name:'Crooked key',icon:'crookedkey',durability:100},
  soulstitch:{name:'Soulstitch needle',icon:'soulstitch',durability:100},
  gutteringcandle:{name:'Guttering candle',icon:'gutteringcandle',durability:100},
  gravechalk:{name:'Grave chalk',icon:'gravechalk',durability:100},
  redthread:{name:'Red thread',icon:'redthread',durability:100},
  hellspur:{name:'Hellspur',icon:'hellspur',durability:100},
  mournersveil:{name:'Mourner’s veil',icon:'mournersveil',durability:100},
  thirteenthbell:{name:'Thirteenth bell',icon:'thirteenthbell',durability:100},
  hollowmirror:{name:'Hollow mirror',icon:'hollowmirror',durability:100},
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
  // `night`: only there after dark (see nodeAwake). Hidden, untargetable and not solid by day.
  glowsprout:{name:'Young glowcap',hits:1,workSeconds:1.4,handRate:1,output:'backpack',loot:{glowbloom:2},regrow:320,radius:0,night:true},
  gravewisp:{name:'Grave wisp',hits:1,workSeconds:1.6,handRate:1,output:'backpack',loot:{wispdust:1},regrow:360,radius:0,night:true},
  // Areas: Frostmere's crystals and the Ashen Scar's vents.
  rimecrystal:{name:'Rime crystal',hits:5,workSeconds:3.6,handRate:0,tool:'pick',toolRate:1,required:true,output:'floor',loot:{rime:2,shard:1},regrow:720,radius:.55},
  embervent:{name:'Emberglass vent',hits:5,workSeconds:3.6,handRate:0,tool:'pick',toolRate:1,required:true,output:'floor',loot:{emberglass:2,ember:1},regrow:720,radius:.55},
  // Landmarks: never harvested. `landmark` names what holding the action does (World.useLandmark).
  briarthrone:{name:'The Briar Throne',hits:1,workSeconds:99,handRate:0,output:'floor',loot:{},regrow:0,radius:1.1,landmark:'throne'},
  // Omens (omens.mjs): turn up somewhere for a while, never regrow.
  fallenstar:{name:'Fallen star',hits:1,workSeconds:2.2,handRate:1,output:'floor',loot:{},regrow:0,radius:.7,omen:true},
  soulrift:{name:'Soul rift',hits:1,workSeconds:99,handRate:0,output:'floor',loot:{},regrow:0,radius:0,omen:true},
  mimic:{name:'Lonely chest',hits:1,workSeconds:2.4,handRate:1,output:'floor',loot:{},regrow:0,radius:.5,omen:true},
  witchcauldron:{name:'Witch’s cauldron',hits:1,workSeconds:1.5,handRate:1,output:'floor',loot:{},regrow:0,radius:.55,omen:true},
  goldpumpkin:{name:'Golden pumpkin',hits:1,workSeconds:2,handRate:1,output:'floor',loot:{},regrow:0,radius:.35,omen:true},
  delve:{name:'The Sunken Stair',hits:1,workSeconds:1.2,handRate:1,output:'floor',loot:{},regrow:0,radius:.9,landmark:'delve'},
  // Night blooms (nightbloom.mjs): come up near camp on a common night, pulled up at dawn, never regrow.
  wildgloomcap:{name:'Wild gloomcaps',hits:1,workSeconds:1.4,handRate:1,output:'backpack',loot:{gloomcap:2,gloomspore:2},regrow:99999,radius:0,night:true},
  wildstarlily:{name:'Wild starlily',hits:1,workSeconds:1.4,handRate:1,output:'backpack',loot:{starlily:1,lilybulb:2},regrow:99999,radius:0,night:true},
  wildmoonpetal:{name:'Moonpetal bloom',hits:1,workSeconds:2,handRate:1,output:'backpack',loot:{moonpetal:1,petalseed:2},regrow:99999,radius:0,night:true},
  wildghostgourd:{name:'Ghostgourd',hits:1,workSeconds:2.2,handRate:1,output:'backpack',loot:{ghostgourd:1,gourdseed:2},regrow:99999,radius:.3,night:true},
  // Dread Ages (ages.mjs): thorns that grow over the trails on a Vigil. Not solid: they slow and scratch whoever wades through.
  thornpatch:{name:'Dread thorns',hits:2,workSeconds:1.6,handRate:.5,tool:'axe',toolRate:1.6,output:'backpack',loot:{fiber:3},regrow:99999,radius:0},
  // An omen of the later Dread Ages (omens.mjs): hold the action to wake its champion.
  dreadaltar:{name:'Bleeding altar',hits:1,workSeconds:2.4,handRate:1,output:'floor',loot:{},regrow:0,radius:.75,omen:true},
  // The Shrine of Yomi's omens (omens.mjs): light the Obon lanterns, bow to a fox wedding.
  obonlantern:{name:'Obon lantern',hits:1,workSeconds:1.6,handRate:1,output:'floor',loot:{},regrow:0,radius:.3,omen:true},
  foxwedding:{name:'Fox wedding',hits:1,workSeconds:1.4,handRate:1,output:'floor',loot:{},regrow:0,radius:.4,omen:true},
};
export const STRUCTURES = {
  hearth:{name:'Heartfire',hp:600,radius:1,light:8},fire:{name:'Campfire',hp:160,radius:.55,light:6},
  bench:{name:'Workbench',hp:180,radius:.65},chest:{name:'Supply chest',hp:180,radius:.65},
  wall:{name:'Palisade',hp:280,radius:.72},gate:{name:'Camp gate',hp:240,radius:.7},
  trap:{name:'Briar trap',hp:100,radius:0},farm:{name:'Pumpkin patch',hp:120,radius:0},
  pot:{name:'Cauldron',hp:160,radius:.55},lantern:{name:'Soul lantern',hp:140,radius:.3,light:6,fuelless:true},
  bed:{name:'Bedroll',hp:100,radius:0},ward:{name:'Warding totem',hp:200,radius:.55},hushstone:{name:'Hushing stone',hp:220,radius:.6},
  cart:{name:'Hand cart',hp:220,radius:.55},
  // Keeps modifier books (bookshelf.mjs): no slots, no stack limit; a workbench nearby writes straight from it.
  bookshelf:{name:'Bookshelf',hp:180,radius:.6},
  // A standing stone whose runes glow after dark. One stands in the middle of every Vigil, where the Heartfire used to be.
  // `fuelless`: its light never needs wood (like the soul lantern).
  glimmer:{name:'Glimmerstone',hp:300,radius:.45,light:5,fuelless:true},
  // Homestead barriers (homestead.mjs): only ever placed on the grid.
  fence:{name:'Fence',hp:120,radius:.42},stonewall:{name:'Stone wall',hp:420,radius:.48},
  timberwall:{name:'Timber wall',hp:360,radius:.7},masonwall:{name:'Masonry wall',hp:560,radius:.72},
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
  elixir:{kind:'cook',cost:{spore:2,berry:2},station:'pot',desc:'Restore 60 health and 20 courage.'},
  greaterelixir:{kind:'cook',cost:{moonpetal:1,bloodapple:1,spore:2},station:'pot',desc:'Restore 120 health and 40 courage. Brewed from a rare moonpetal.'},
  ward:{kind:'build',cost:{stone:5,ore:2,ember:4},station:'bench',desc:'A soul-powered defense. Damages nearby enemies.'},
  bookshelf:{kind:'build',cost:{wood:8,fiber:3},station:'bench',desc:'Keeps every modifier book you shelve, as many as you like. A workbench within 12 paces writes from it directly: no need to take a book down first.'},
  hushstone:{kind:'build',cost:{stone:8,ore:2,ember:3},station:'bench',desc:'No creature rises or comes hunting within 18 paces, so you can build in peace. Raids and moons still come. Two at most.'},
  roast:{kind:'cook',cost:{pumpkin:1},station:'fire',desc:'Cook a pumpkin into a restorative supper.'},
  roastMeat:{kind:'cook',result:'roast',cost:{meat:1},station:'fire',desc:'Cook a raw morsel safely.'},
  roastCaps:{kind:'cook',result:'roast',cost:{mushroom:2},station:'fire',desc:'Cook away the mushrooms’ unsettling effects.'},
  stew:{kind:'cook',cost:{pumpkin:1,berry:2,meat:1},station:'pot',desc:'A feast: +65 hunger, +35 health and +25 courage.'},
  // Homestead dishes (buffs.mjs): food that leaves a blessing behind.
  moonbroth:{kind:'cook',cost:{moonroot:2,berry:1},station:'pot',desc:'Calm for 4 minutes: courage holds in the dark.'},
  tonic:{kind:'cook',cost:{bloodapple:2,spore:1},station:'pot',desc:'Bloodrush for 3 minutes: blows land 25% harder.'},
  tea:{kind:'cook',cost:{starlily:2,berry:1},station:'pot',desc:'Light step for 3 minutes: 15% faster, breath returns sooner.'},
  gloomstew:{kind:'cook',cost:{gloomcap:3,meat:1},station:'pot',desc:'Gloomhide for 3 minutes: take 20% less harm.'},
  gourdsoup:{kind:'cook',cost:{ghostgourd:1,moonroot:1},station:'pot',desc:'Ghostly vigor for 5 minutes: +30 max health.'},
  loaf:{kind:'cook',cost:{wheat:3},station:'fire',desc:'Well fed for 5 minutes: hunger fades half as fast.'},
  sporemask:{kind:'tool',cost:{glowbloom:4,fiber:4,wood:1},station:'bench',desc:'Filters the Hollow Mire’s spore fog.'},
  gravelight:{kind:'tool',cost:{wispdust:3,ore:3,ember:2},station:'bench',desc:'A wisp-fed lantern bright enough for the Moonshard Crags.'},
  barrowcloak:{kind:'tool',cost:{bone:8,fiber:6,meat:2},station:'bench',desc:'Bone-lined warmth against the Barrow Fields’ grave-chill.'},
  cart:{kind:'build',cost:{wood:8,fiber:4,stone:2},desc:'A chest on wheels. Pull it along, open it anywhere.'},
  // The Vigil's home (vigil.mjs): built anywhere, one at a time. Taken down and rebuilt, it keeps its awakening.
  hearth:{kind:'build',cost:{wood:10,stone:10},desc:'Your home: light, mending by day, and a place to wake if you set it. Only one can burn; move it and it keeps its awakening.'},
  glimmer:{kind:'build',cost:{stone:4,ember:1},desc:'A standing stone whose runes glow after dark. Light that needs no wood.'},
  warpscroll:{kind:'item',cost:{fiber:2,wood:1,ember:1},station:'bench',desc:'Read it to be carried home to your Heartfire. Keep still: a blow breaks the spell.'},
  // Grid pieces (homestead.mjs): built a cell at a time on the Vigil and in the Homestead, never free-placed.
  // `grid` marks them; their cost is per cell. Floors and soil have no structure of their own.
  till:{kind:'build',grid:true,name:'Tilled soil',cost:{},desc:'Turn a cell of earth for sowing. Plant seeds in it from the action buttons.'},
  plank:{kind:'build',grid:true,name:'Plank floor',cost:{wood:1},desc:'Planks a cell at a time. Floors ringed by house walls make a room.'},
  roughplank:{kind:'build',grid:true,name:'Rough planks',cost:{wood:1},desc:'Planks with a ragged outer edge.'},
  boards:{kind:'build',grid:true,name:'Broad boards',cost:{wood:2},station:'bench',desc:'Wide, dark boards for a finer floor.'},
  fieldstone:{kind:'build',grid:true,name:'Fieldstone path',cost:{stone:1},desc:'Loose stones whose edge follows the path.'},
  flagstone:{kind:'build',grid:true,name:'Flagstone floor',cost:{stone:1},station:'bench',desc:'Fitted flagstones.'},
  cobble:{kind:'build',grid:true,name:'Cobblestone',cost:{stone:2},station:'bench',desc:'Rounded cobbles set close.'},
  slabs:{kind:'build',grid:true,name:'Stone slabs',cost:{stone:2},station:'bench',desc:'Big cut slabs.'},
  fence:{kind:'build',grid:true,cost:{wood:1,fiber:1},desc:'A low fence. Keeps nothing out for long, but joins into lines and pens.'},
  stonewall:{kind:'build',grid:true,cost:{stone:3},station:'bench',desc:'A low stone wall: sturdy, slow to break.'},
  timberwall:{kind:'build',grid:true,cost:{wood:4},station:'bench',desc:'A house wall. Ring a floor with house walls and a gate to make a room, and sleep the night away in it.'},
  masonwall:{kind:'build',grid:true,cost:{stone:5},station:'bench',desc:'The sturdiest house wall. Closes a room like timber does.'},
  satchel:{kind:'tool',cost:{fiber:8,wood:3},station:'bench',desc:'Wear it in the bag socket: six more pack slots.'},
  haversack:{kind:'tool',cost:{fiber:12,bone:6,shard:5,ember:4},station:'bench',desc:'Wear it in the bag socket: twelve more pack slots.'},
};
/**
 * Hostiles. Small melee creatures are weak and come in numbers; big slow ones wind up long and hit
 * hard. `range` is how far the main attack reaches, `period` the rest between attacks (jittered in
 * play). Movement and attack patterns live in mobs.mjs.
 */
export const ENEMIES = {
  crawler:{name:'Briarling',hp:24,speed:5.5,damage:12,range:1.35,period:1.3,loot:{}},
  wraith:{name:'Lantern wraith',hp:34,speed:2.7*SPEED_SCALE,damage:14,range:8.5,period:2.8,loot:{ember:1}},
  brute:{name:'Gravekeeper',hp:190,speed:1.35*SPEED_SCALE,damage:56,range:2.6,period:2.6,loot:{ore:2,ember:2,meat:2}},
  king:{name:'The Hollow King',hp:950,speed:1.35*SPEED_SCALE,damage:60,range:3.6,period:2.2,loot:{ember:15}},
  bonewalker:{name:'Bonewalker',hp:48,speed:2.5*SPEED_SCALE,damage:24,range:5.6,period:2.1,loot:{bone:1}},
  bogling:{name:'Bogling',hp:52,speed:1.8*SPEED_SCALE,damage:20,range:7.5,period:3,loot:{spore:1}},
  golem:{name:'Moonshard golem',hp:320,speed:1.05*SPEED_SCALE,damage:72,range:2.7,period:3,loot:{shard:2,stone:2}},
  // Dread Ages (ages.mjs): from the Age of the Hunt a Vigil's nights and roaming packs bring dreadhounds.
  dreadhound:{name:'Dreadhound',hp:40,speed:6.2,damage:16,range:4.6,period:1.7,loot:{bone:1}},
  // The Shrine of Yomi (a Vigil land): paper-lantern ghosts that hop in packs and lash with a long tongue,
  // and hopping corpses that leap at you arms first.
  chochin:{name:'Chōchin-obake',hp:22,speed:4.4,damage:12,range:1.9,period:1.35,loot:{fiber:1}},
  jiangshi:{name:'Jiangshi',hp:64,speed:2.9*SPEED_SCALE,damage:22,range:4.2,period:2.2,loot:{bone:1}},
  // Its yokai (yokai.mjs): umbrellas that skip at you, a woman whose neck crosses the ground, the snow woman's
  // frost, and a fallen priest who seals you in with talismans and rings up the dead.
  kasa:{name:'Kasa-obake',hp:30,speed:4.8,damage:13,range:6.2,period:1.75,loot:{fiber:1}},
  rokurokubi:{name:'Rokurokubi',hp:46,speed:2.6*SPEED_SCALE,damage:20,range:11,period:2.9,loot:{bone:1}},
  yukionna:{name:'Yuki-onna',hp:42,speed:2.3*SPEED_SCALE,damage:17,range:10,period:3.3,loot:{rime:1}},
  daoshi:{name:'Fallen daoshi',hp:78,speed:2.4*SPEED_SCALE,damage:21,range:10,period:3.1,loot:{ember:1}},
  // The great bosses (bosses.mjs): Mother Briar on her throne, The Unblinking at the bottom of a delve.
  briarmother:{name:'Mother Briar',hp:2400,speed:1.55*SPEED_SCALE,damage:58,range:4.2,period:2.1,boss:true,loot:{ember:12}},
  unblinking:{name:'The Unblinking',hp:2200,speed:1.1*SPEED_SCALE,damage:62,range:6,period:2,boss:true,loot:{ember:14}},
};
export const CHARACTERS = [
  {id:'ember',name:'Ember',detail:'The lost lantern keeper',color:'#f6a35d'},
  {id:'moss',name:'Moss',detail:'The midnight forager',color:'#94c8ae'},
  {id:'vesper',name:'Vesper',detail:'The moonlit wanderer',color:'#bea1e0'},
  {id:'cinder',name:'Cinder',detail:'The reluctant grave robber',color:'#de817b'},
];
/**
 * Looks every wanderer can wear (theme.json choices.look). The character id carries the look, `moss-mask`,
 * so saves and co-op friends see it with no new field; a bare `moss` wears the theme's default look.
 */
export const LOOKS = Object.freeze([{id:'hood',name:'Hooded'},{id:'mask',name:'Masked'},{id:'witch',name:'Witch'}]);
for(const base of CHARACTERS.slice()) for(const look of LOOKS) CHARACTERS.push({...base,id:`${base.id}-${look.id}`,base:base.id,look:look.id});
export const label = key => ITEMS[key]?.name || EQUIPMENT[key]?.name || magicItems[key]?.name || BOOKS[key]?.name || STRUCTURES[key]?.name || ENEMIES[key]?.name || key;
/**
 * Day and night schedules, in seconds. An expedition keeps the standard one. The Vigil (a single save
 * kept for the long haul, vigil.mjs) lets every part of the day run longer, so a day out exploring
 * and a night holding the fire each have room to breathe.
 */
export const CLOCKS = Object.freeze({
  standard: Object.freeze({day:DAY, dusk:DUSK, night:NIGHT, cycle:DAY+DUSK+NIGHT}),
  vigil: Object.freeze({day:250, dusk:40, night:140, cycle:430}),
});
/** The schedule a world keeps. */
export const scheduleOf = world => world?.mode==='vigil'?CLOCKS.vigil:CLOCKS.standard;
/**
 * The hollow's own clock: world time minus the time the party spent below in a delve (delve.mjs).
 * The hollow holds still while everyone is down there, so day, night and the moons wait for them.
 */
export const hollowTime = world => Math.max(0,(Number(world?.time)||0)-(Number(world?.below)||0));
export function phaseAt(time, schedule=CLOCKS.standard){const t=time%schedule.cycle;return t<schedule.day?'day':t<schedule.day+schedule.dusk?'dusk':'night';}
export function dayAt(time, schedule=CLOCKS.standard){return Math.floor(time/schedule.cycle)+1;}
/** Phase and day of a world (its schedule, its hollow clock). */
export const phaseOf = world => phaseAt(hollowTime(world), scheduleOf(world));
export const dayOf = world => dayAt(hollowTime(world), scheduleOf(world));
/** Night-only nodes (NODES[type].night) exist only while it is night. `when` is a world (preferred) or a standard-clock time. */
export function nodeAwake(node, when){if(!NODES[node?.type]?.night)return true;return (when&&typeof when==='object'?phaseOf(when):phaseAt(Number(when)||0))==='night';}
export function phaseRemaining(time, schedule=CLOCKS.standard){const t=time%schedule.cycle;return (t<schedule.day?schedule.day:t<schedule.day+schedule.dusk?schedule.day+schedule.dusk:schedule.cycle)-t;}

// Reject inherited property names at every data-driven lookup boundary.
for (const table of [ITEMS,EQUIPMENT,NODES,STRUCTURES,RECIPES,ENEMIES]) Object.setPrototypeOf(table,null);
