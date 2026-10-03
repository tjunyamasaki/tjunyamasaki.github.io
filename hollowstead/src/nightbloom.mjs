// Night blooms: on a common night (waxing or new moon; never a blood, gilded or star-rain night) wild
// night plants come up near the camp for the dark hours: gloomcaps and starlilies, the seeds of the
// night crops (homestead.mjs). On some of those nights something rarer opens too: a moonpetal or a
// ghostgourd, the only way to get their seeds. They are night-only nodes (NODES[type].night): gone
// by day and pulled up at dawn whether picked or not.
//
// world.wilds: [{id, type, x, z}] for tonight. Nodes are rebuilt from it (World.restore), like omens.
import {NODES, phaseOf, dayOf, hollowTime, scheduleOf} from './content.mjs?v=harvest-18';
import {moonOf} from './night.mjs?v=harvest-18';
import {cellAt, tileAt} from './homestead.mjs?v=harvest-18';

export const WILD = Object.freeze({
  wildgloomcap: Object.freeze({crop: 'gloomcap'}),
  wildstarlily: Object.freeze({crop: 'starlily'}),
  wildmoonpetal: Object.freeze({crop: 'moonpetal', rare: true, name: 'A moonpetal'}),
  wildghostgourd: Object.freeze({crop: 'ghostgourd', rare: true, name: 'A ghostgourd'}),
});
export const BLOOM = Object.freeze({
  moons: Object.freeze(['waxing', 'new']),
  plants: Object.freeze([2, 4]),   // common night plants each common night
  rare: .35,                       // chance a common night also brings one rare bloom
  ring: Object.freeze([5, 18]),    // how far from the camp (or the wanderer) they come up
});

/** Stable 0..1 roll per hollow, night and salt. */
function roll(seed, day, salt){
  let h = ((seed >>> 0) ^ Math.imul(day | 0, 0x9e3779b1) ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** What comes up on night `day`: {plants, rare} (rare: a WILD type or null). Nothing on an uncommon moon. */
export function bloomOf(world, day){
  if(!BLOOM.moons.includes(moonOf(world, day))) return {plants: 0, rare: null};
  const [lo, hi] = BLOOM.plants, plants = lo + Math.floor(roll(world.seed, day, 0x77) * (hi - lo + 1));
  const forced = world.homestead?.bloom === day;
  const rare = forced || roll(world.seed, day, 0x91) < BLOOM.rare ? (roll(world.seed, day, 0x13) < .5 ? 'wildmoonpetal' : 'wildghostgourd') : null;
  return {plants, rare};
}

export function wildNodes(world){
  return (world.wilds || []).filter(w => NODES[w.type]).map(w => ({id: w.id, type: w.type, x: w.x, z: w.z, hits: NODES[w.type].hits, ready: 0}));
}

function spot(world, r, anchor){
  for(let tries = 0; tries < 40; tries++){
    const a = r() * Math.PI * 2, d = BLOOM.ring[0] + r() * (BLOOM.ring[1] - BLOOM.ring[0]);
    const x = anchor.x + Math.cos(a) * d, z = anchor.z + Math.sin(a) * d;
    if(!world.walkable(x, z)) continue;
    const [i, j] = cellAt(x, z);if(tileAt(world, i, j)) continue;
    if(world.buildings.some(b => Math.hypot(b.x - x, b.z - z) < 2.2)) continue;
    if(world.nodes.some(n => Math.hypot(n.x - x, n.z - z) < 1.6)) continue;
    return {x, z};
  }
  return null;
}

/** Bring up tonight's plants. Safe to call again: it only adds what is missing. */
export function bloom(world, day = dayOf(world)){
  const {plants, rare} = bloomOf(world, day);
  world.wilds = (world.wilds || []).filter(w => w.day === day);
  if(world.wilds.length || (!plants && !rare)) return [];
  const hearth = world.buildings.find(b => b.type === 'hearth' && b.hp > 0);
  const anchor = hearth || world.players.find(p => p.online) || {x: 0, z: 0};
  let s = (Math.imul(world.seed >>> 0, 31) + day * 977) >>> 0;
  const r = () => {s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0;return (s >>> 8) / 16777216;};
  const types = Array.from({length: plants}, () => r() < .5 ? 'wildgloomcap' : 'wildstarlily');
  if(rare) types.push(rare);
  const made = [];
  for(const type of types){
    const at = spot(world, r, anchor);if(!at) continue;
    const w = {id: world.nextId('w'), type, x: at.x, z: at.z, day};
    world.wilds.push(w);made.push(w);
  }
  world.nodes.push(...wildNodes({wilds: made}));
  const special = made.find(w => WILD[w.type].rare);
  if(special) world.event('announce', special.x, special.z, `${WILD[special.type].name} opens in the dark tonight. Find it before dawn.`);
  return made;
}

function clear(world, ids){
  if(!ids.size) return;
  world.nodes = world.nodes.filter(n => !ids.has(n.id));
  world.wilds = (world.wilds || []).filter(w => !ids.has(w.id));
}

/** Host, every tick outside the arena and dungeons. `before`/`phase`: the phase last tick and now. */
export function stepBlooms(world, before, phase){
  if(world.arena || world.dungeon || (world.showcase && !world.homestead)) return;
  if(before !== 'night' && phase === 'night') bloom(world);
  if(!world.wilds?.length) return;
  // Pulled up at dawn; and a picked plant is gone for good (its node never regrows: NODES regrow is huge).
  if(phase === 'day'){clear(world, new Set(world.wilds.map(w => w.id)));return;}
  const picked = new Set();
  for(const n of world.nodes) if(WILD[n.type] && n.ready > 0) picked.add(n.id);
  clear(world, picked);
}

/** Seconds until the next night starts (Homestead: "Skip to night"). */
export function toNight(world){
  const c = scheduleOf(world), t = hollowTime(world) % c.cycle, start = c.day + c.dusk;
  return t < start ? start - t : c.cycle - t + start;
}
export {phaseOf};
