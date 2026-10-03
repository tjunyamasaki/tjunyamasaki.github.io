// Frontier regions: the hazards of the outer ring and the gear that answers them.
// Every rule here is per wanderer: a mask on one head protects only that head.
// Pure simulation: import only content/progression/contracts/inventory. Never engine.mjs, lighting or the DOM.
//
// Nothing here is stored on the world: every effect is recomputed from a wanderer's position and
// their own worn gear, so guests (who rebuild the World from snapshots every frame) see exactly
// what the host applies. The one exception is `p.nightFinds`, the night-only resources a wanderer
// has already found (for the one-time discovery moment); it travels with the player.

import {NODES, label} from './content.mjs?v=harvest-18';
import {DISCOVER_XP, REGIONS, regionAt} from './progression.mjs?v=harvest-18';
import {countItem, equippedLanternLit} from './inventory.mjs?v=harvest-18';

/** Which worn item answers which region, and where it is worn. */
export const REGION_GEAR = Object.freeze({
  mire: Object.freeze({slot:'head', itemId:'sporemask', hazard:'Spore fog'}),
  crags: Object.freeze({slot:'light', itemId:'gravelight', hazard:'Pitch dark'}),
  barrow: Object.freeze({slot:'back', itemId:'barrowcloak', hazard:'Grave-chill'}),
});

/**
 * Tuning, per second. Mire: an unmasked visit is survivable for roughly 45 s by day, courage first.
 * Crags: exactly the unlit-night rule of World.tick (courage -3/s, then health -2/s below 20 courage
 * and -6/s at none), applied even by day and even beside a fire unless the wanderer carries their
 * own lit grave lantern. Barrow: slower walking and stamina that returns about half as fast.
 */
export const HAZARDS = Object.freeze({
  mire: Object.freeze({courage:4, health:.8, panic:1.5, dread:3, low:20}),
  crags: Object.freeze({courage:3, regain:.6, health:2, dread:6, low:20}),
  barrow: Object.freeze({speed:.7, stamina:7.5}),
  /** Durability a worn mask or cloak loses per second, only while inside its own region. */
  wear: 1,
  /** The Crags' darkness ramps in across this many units either side of the border. */
  ramp: 4,
});
/** The only lights that hold in the Crags. */
export const CRAGS_LIGHTS = Object.freeze(['gravelight', 'everlantern']);
/** The grave lantern's light radius over the hand lantern's (the everlantern's is 1.45 too, but it never burns out). */
export const GRAVELIGHT_RADIUS_SCALE = 1.45;

/** First-visit hints, one per region (shown once by the HUD). */
export const REGION_TIPS = Object.freeze({
  mire: 'The spore fog stings. A glowcap mask would filter it.',
  crags: 'Pitch dark, even by day. Only a lit grave lantern holds it back.',
  barrow: 'The grave-chill bites. A bone-lined barrow cloak would keep it out.',
});

/** Night-only resources: where they grow, what they make, and the line shown the first time one is found. */
export const NIGHT_FINDS = Object.freeze({
  glowbloom: Object.freeze({node:'glowsprout', region:'woods', makes:'sporemask', text:'First glowcap bloom! Four make a glowcap mask at the workbench.'}),
  wispdust: Object.freeze({node:'gravewisp', region:'graveyard', makes:'gravelight', text:'First wisp essence! Three, with moon iron and soul embers, make a grave lantern.'}),
});
/** Halo colours the renderers give night-only nodes so they read as glowing in the dark. */
export const NIGHT_GLOW = Object.freeze({glowsprout:'#8ff0d8', gravewisp:'#b8ceff', wildgloomcap:'#c9b2ef', wildstarlily:'#9ff0ff', wildmoonpetal:'#fff4c6', wildghostgourd:'#9ff0ff'});

/** Item detail lines (ui/actions.mjs effectLine) for the frontier gear and night finds. */
export const FRONTIER_LINES = Object.freeze({
  sporemask: 'Head · filters the Hollow Mire’s spore fog · wears only there',
  gravelight: 'Burns fuel · wide light · the only lamp that holds in the Moonshard Crags',
  barrowcloak: 'Back · keeps out the Barrow Fields’ grave-chill · wears only there',
  glowbloom: 'Night-only: found in the Autumn Woods after dark',
  wispdust: 'Night-only: drifts over the Graveyard after dark',
  rime: 'Mined from rime crystals in Frostmere · awakens the Heartfire past its third level',
  emberglass: 'Mined from vents in the Ashen Scar · awakens the Heartfire past its third level',
  satchel: 'Bag · six more pack slots while you wear it',
  haversack: 'Bag · twelve more pack slots while you wear it',
});

const LABELS = Object.freeze({
  mire: Object.freeze({worn:'Mask filtering spores', missing:'Needs a glowcap mask', carried:'Wear your glowcap mask'}),
  crags: Object.freeze({worn:'Grave lantern lit', missing:'Needs a lit grave lantern', carried:'Equip your grave lantern', unlit:'Light your lantern'}),
  barrow: Object.freeze({worn:'Cloak keeps the chill out', missing:'Needs a barrow cloak', carried:'Wear your barrow cloak'}),
});

/** The hazardous region (a REGION_GEAR key) at a position, or null. */
/** `world` (optional) lets a seeded area (worldgen.mjs areaAt) override the ring beneath it. */
export function hazardAt(x, z, world=null){const id=typeof world?.regionOf==='function'?world.regionOf(x, z):regionAt(x, z);return Object.hasOwn(REGION_GEAR, id)?id:null;}

/** True when wanderer `p`'s own gear answers region `id`: the worn mask or cloak, or their own lit grave lantern. */
export function geared(p, id){
  const gear=REGION_GEAR[id];if(!gear||!p?.equipment)return false;
  if(id==='crags')return CRAGS_LIGHTS.includes(p.equipment.light?.itemId)&&equippedLanternLit(p);
  const worn=p.equipment[gear.slot];
  return worn?.itemId===gear.itemId&&worn.durability>0;
}

/** True when `p` stands in the Crags without their own lit grave lantern: to them it is an unlit night. */
export function regionUnlit(world, p){return !!p&&!world?.arena&&!world?.dungeon&&!world?.showcase&&hazardAt(p.x, p.z, world)==='crags'&&!geared(p, 'crags');}

/** A night-only node's halo colour, or null for every other node. */
export function nightGlow(node){return NODES[node?.type]?.night?NIGHT_GLOW[node.type]||'#d4fff5':null;}

/** Called by World.tick() for each living wanderer outside the arena and showcase, every tick. */
export function applyRegions(world, p, dt, phase){
  noteFinds(world, p, dt);
  const id=hazardAt(p.x, p.z, world);
  if(!id)return;
  const gear=REGION_GEAR[id];
  if(geared(p, id)){
    // The mask and the cloak wear only inside their own region; the grave lantern burns fuel like any lamp (World.tick).
    if(gear.slot!=='light')world.wearEquipped(p, gear.slot, dt*HAZARDS.wear);
    return;
  }
  if(id==='mire'){
    const h=HAZARDS.mire;
    p.courage=Math.max(0, p.courage-dt*h.courage);p.rest=false;
    world.hurtQuiet(p, dt*(h.health+(p.courage<=0?h.dread:p.courage<h.low?h.panic:0)));
  }else if(id==='crags'){
    // World.tick already drained an unlit wanderer at night. Where it counted them lit (day, a fire,
    // a friend's lamp) undo that and apply the unlit-night rule instead.
    const h=HAZARDS.crags;p.rest=false;
    if(phase!=='night'||world.lit(p)){
      p.courage=Math.max(0, p.courage-dt*(h.courage+h.regain));
      if(p.courage<h.low)world.hurtQuiet(p, dt*(p.courage<=0?h.dread:h.health));
    }
  }else if(id==='barrow'){
    // Stamina comes back about half as fast (World.tick adds 15/s after this).
    p.stamina=Math.max(0, p.stamina-dt*HAZARDS.barrow.stamina);
  }
}

/** Twice a second: the first night-only resource of each kind in a wanderer's pack is a small discovery. */
function noteFinds(world, p, dt){
  if(world.showcase||Math.floor(world.time*2)===Math.floor((world.time-dt)*2))return;
  for(const itemId in NIGHT_FINDS){
    if(Array.isArray(p.nightFinds)&&p.nightFinds.includes(itemId))continue;
    if(!(countItem(p.inventory, itemId)>0))continue;
    if(!Array.isArray(p.nightFinds))p.nightFinds=[];
    p.nightFinds.push(itemId);
    world.awardXp(p, DISCOVER_XP);
    world.event('discover', p.x, p.z, label(itemId), {player:p.id});
    world.tell(p, NIGHT_FINDS[itemId].text);
  }
}

/** Walk speed multiplier from the region (grave-chill). */
export function regionSpeed(world, p){
  if(!p||world?.arena||world?.dungeon||world?.showcase)return 1;
  return hazardAt(p.x, p.z, world)==='barrow'&&!geared(p, 'barrow')?HAZARDS.barrow.speed:1;
}

// Offsets sampled around the viewer: the centre and two rings, so the darkness ramps in over
// HAZARDS.ramp units instead of switching at the (noisy) border.
const SAMPLES=(()=>{const out=[[0,0]];for(const r of [HAZARDS.ramp/2, HAZARDS.ramp])for(let i=0;i<8;i++){const a=(i+(r<HAZARDS.ramp?0:.5))/8*Math.PI*2;out.push([Math.cos(a)*r, Math.sin(a)*r]);}return out;})();
const smooth=t=>{const x=t<0?0:t>1?1:t;return x*x*(3-2*x);};
/** Fraction of the samples around x,z that lie in the Crags, eased: 0 well outside, 1 a couple of units in. */
export function cragsCover(x, z, world=null){
  let inside=0;for(const [dx, dz] of SAMPLES)if(hazardAt(x+dx, z+dz, world)==='crags')inside++;
  return smooth((inside/SAMPLES.length-.15)/.6);
}
// Per-frame cache: the viewer usually has not moved far since the last frame.
const lastDark={x:NaN, z:NaN, value:0};

/** Extra darkness 0..1 for the viewer's screen (the Crags by day). Read by lighting.frameLighting every frame. */
export function regionDarkness(world, viewer){
  if(!world||!viewer||world.arena||world.dungeon||world.showcase||!Number.isFinite(viewer.x)||!Number.isFinite(viewer.z))return 0;
  if(Math.abs(viewer.x-lastDark.x)<.08&&Math.abs(viewer.z-lastDark.z)<.08)return lastDark.value;
  lastDark.x=viewer.x;lastDark.z=viewer.z;lastDark.value=cragsCover(viewer.x, viewer.z, world);
  return lastDark.value;
}

/**
 * HUD summary for a wanderer: null when safe, else
 * {region, name, hazard, protected, state:'worn'|'missing'|'carried'|'unlit', itemId, slot, label, tip}.
 */
export function regionStatus(world, p){
  if(!world||!p||world.arena||world.dungeon||world.showcase||p.down||p.ghost)return null;
  const region=hazardAt(p.x, p.z, world);if(!region)return null;
  const gear=REGION_GEAR[region],safe=geared(p, region),worn=p.equipment?.[gear.slot];
  let state='worn';
  if(!safe){
    if(region==='crags'&&CRAGS_LIGHTS.includes(worn?.itemId)&&worn.durability>0)state='unlit';
    else if(countItem(p.inventory, gear.itemId)>0)state='carried';
    else state='missing';
  }
  return {region, name:REGIONS[region].name, hazard:gear.hazard, protected:safe, state, itemId:gear.itemId, slot:gear.slot, label:LABELS[region][state]||LABELS[region].missing, tip:REGION_TIPS[region]};
}
