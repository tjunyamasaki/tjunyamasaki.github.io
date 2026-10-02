// Omens: things that turn up somewhere in the hollow for a while, announced with a direction and
// marked on the map, so there is always a reason to go out and look. Each is a node you can use.
//   fallenstar    a star crashed to earth: its light wakes creatures round it; open it for star-iron and gear
//   soulrift      a tear in the dark: step close and it pours out three waves; close it for a reliquary's worth
//   mimic         a lonely chest: maybe treasure, maybe teeth (an elder that drops the treasure)
//   cauldron      a witch's cauldron left bubbling: one sip each, a blessing (or a hex) until dawn
//   goldpumpkin   a golden pumpkin: heartstones and epics, if you find it before it rots
//
// world.omens   [{id, kind, x, z, until, state, ...}]  saved and sent to guests; their nodes are rebuilt from it
// world.omenT   seconds until the next one may appear
// p.brew        {kind, until}  a cauldron's effect on a wanderer (until: hollow time)
// Pure simulation: import only content/progression/worldgen. Never engine.mjs, a renderer or the DOM.

import {hollowTime, scheduleOf} from './content.mjs?v=harvest-18';
import {REGIONS, rollLoot, pickWeighted} from './progression.mjs?v=harvest-18';
import {areasOf, clearanceAt, iceAt} from './worldgen.mjs?v=harvest-18';

export const OMENS = Object.freeze({
  fallenstar: Object.freeze({name: 'Fallen star', glyph: '✶', color: '#ffd27a', node: 'fallenstar', weight: 3,
    line: dir => `A star falls to the ${dir}.`}),
  soulrift: Object.freeze({name: 'Soul rift', glyph: '◎', color: '#c49bff', node: 'soulrift', weight: 2.5,
    line: dir => `A soul rift tears open to the ${dir}.`}),
  mimic: Object.freeze({name: 'Lonely chest', glyph: '▣', color: '#f2c14e', node: 'mimic', weight: 2,
    line: dir => `Somewhere to the ${dir}, a chest that was not there yesterday.`}),
  cauldron: Object.freeze({name: 'Witch’s cauldron', glyph: '♨', color: '#8fd3a0', node: 'witchcauldron', weight: 1.6,
    line: dir => `Smoke rises to the ${dir}: a witch has left her cauldron bubbling.`}),
  goldpumpkin: Object.freeze({name: 'Golden pumpkin', glyph: '●', color: '#f2a93b', node: 'goldpumpkin', weight: 1,
    line: dir => `Something gleams gold in the grass to the ${dir}.`}),
});
/** Pacing: one may appear every `every` seconds on average (first after `first`), at most `max` at once, lasting `life` days. */
export const OMEN = Object.freeze({first: 70, every: 150, max: 2, maxVigil: 3, life: 1.5, near: 20, ring: [30, 132],
  wake: 13, guards: [2, 4], riftWake: 8, riftWaves: 3, mimic: .45, brewDay: 1});
/** Cauldron brews: what a sip does until the next dawn. */
export const BREWS = Object.freeze({
  fury: Object.freeze({name: 'Fury', text: 'Your blows land a quarter harder until dawn', weight: 3}),
  swift: Object.freeze({name: 'Swiftness', text: 'Your feet are light until dawn', weight: 3}),
  vigor: Object.freeze({name: 'Vigor', text: 'Mended, and mending until dawn', weight: 2.5}),
  hex: Object.freeze({name: 'Hex', text: 'The brew was a trap. Something answers it', weight: 1.5}),
});
export const BREW_FURY = 1.25, BREW_SPEED = 1.18, BREW_REGEN = 2.5;

const NODE_KIND = Object.freeze(Object.fromEntries(Object.entries(OMENS).map(([kind, o]) => [o.node, kind])));
export const isOmenNode = type => Object.hasOwn(NODE_KIND, type);

/** Compass words for a point seen from the Heartfire (north is up the map: -z). */
export function direction(x, z){
  const a = Math.atan2(-z, x)*180/Math.PI, names = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
  return names[(Math.round(a/45)+8)%8];
}

/** Nodes for the live omens (World.restore and rebuildNodes append them after the hollow's own). */
export function omenNodes(world){
  return (world.omens || []).filter(o => !o.done && OMENS[o.kind]).map(o => ({id: o.id, type: OMENS[o.kind].node, x: o.x, z: o.z, hits: 1, ready: 0}));
}

/** Host, every expedition tick. */
export function stepOmens(world, dt){
  if(world.showcase || world.arena || world.dungeon || !world.ambient) return;
  const omens = world.omens ||= [], now = hollowTime(world), cycle = scheduleOf(world).cycle;
  // Expired or finished omens fade (an engaged rift stays until it closes).
  for(const o of omens){
    if(!o.done && now > o.until && !(o.kind === 'soulrift' && o.state === 'open')){o.done = true; dropNode(world, o.id);}
  }
  world.omens = omens.filter(o => !o.done || now-(o.until || 0) < 5);
  for(const o of world.omens) if(!o.done) stepOmen(world, o, dt);
  for(const p of world.players) if(p.brew && now >= p.brew.until) endBrew(p);
  else if(p.brew?.kind === 'vigor' && p.online && !p.down && !p.ghost) p.hp = Math.min(p.maxHp || 100, p.hp+BREW_REGEN*dt);
  // Spawning.
  if(!Number.isFinite(world.omenT)) world.omenT = OMEN.first;
  world.omenT -= dt;
  if(world.omenT > 0) return;
  world.omenT = OMEN.every*(.6+world.spawnRng()*.8);
  const live = world.omens.filter(o => !o.done).length, max = world.mode === 'vigil' ? OMEN.maxVigil : OMEN.max;
  if(live >= max) return;
  spawnOmen(world, null, cycle);
}

/** Make an omen (a kind, or a weighted pick). Returns it, or null when no spot was found. */
export function spawnOmen(world, kind = null, cycle = scheduleOf(world).cycle){
  kind ||= pickWeighted(world.spawnRng, Object.entries(OMENS).map(([id, o]) => [id, o.weight]));
  const rng = world.spawnRng, lair = areasOf(world.seed).find(a => a.id === 'briarlair');
  for(let t = 0; t < 60; t++){
    const a = rng()*Math.PI*2, r = OMEN.ring[0]+Math.sqrt(rng())*(OMEN.ring[1]-OMEN.ring[0]), x = Math.cos(a)*r, z = Math.sin(a)*r;
    if(!world.walkable(x, z) || clearanceAt(world.seed, x, z) < 2.2 || iceAt(world.seed, x, z)) continue;
    if(lair && Math.hypot(x-lair.x, z-lair.z) < lair.r+lair.wall+4) continue;
    if(world.players.some(p => p.online && Math.hypot(p.x-x, p.z-z) < OMEN.near)) continue;
    if(world.nodes.some(n => Math.hypot(n.x-x, n.z-z) < 2.4)) continue;
    const o = {id: world.nextId('o'), kind, x: +x.toFixed(2), z: +z.toFixed(2), until: hollowTime(world)+OMEN.life*cycle, state: 'new', sipped: [], spawn: []};
    (world.omens ||= []).push(o);
    world.nodes.push(...omenNodes({omens: [o]}));
    world.event('omen', x, z, '', {kind});
    world.event('announce', x, z, OMENS[kind].line(direction(x, z)), {omen: kind});
    return o;
  }
  return null;
}

function dropNode(world, id){world.nodes = world.nodes.filter(n => n.id !== id);}
function finish(world, o){o.done = true; o.until = hollowTime(world); dropNode(world, o.id);}
const standing = world => world.players.filter(p => p.online && !p.down && !p.ghost);

function stepOmen(world, o, dt){
  const near = r => standing(world).some(p => Math.hypot(p.x-o.x, p.z-o.z) < r);
  const zone = world.regionOf(o.x, o.z), tier = REGIONS[zone]?.tier ?? 1;
  if(o.kind === 'fallenstar' && o.state === 'new' && near(OMEN.wake)){
    // Its light woke whatever lives nearby: they stand guard round it.
    o.state = 'guarded';
    const pool = tier >= 2 ? ['golem', 'wraith', 'bonewalker'] : ['wraith', 'bonewalker', 'crawler'];
    const n = OMEN.guards[0]+Math.floor(world.spawnRng()*(OMEN.guards[1]-OMEN.guards[0]+1));
    for(let i = 0; i < n; i++){const a = i/n*Math.PI*2, e = world.spawnEnemy(pool[i%pool.length], o.x+Math.cos(a)*3, o.z+Math.sin(a)*3, {home: true, leash: 12, tier: Math.max(1, tier)}); if(e) e.aggro = true;}
    world.event('announce', o.x, o.z, 'The star’s light woke something.');
  }
  if(o.kind === 'soulrift'){
    if(o.state === 'new' && near(OMEN.riftWake)){o.state = 'open'; o.wave = 0; o.spawn = []; riftWave(world, o, tier);}
    else if(o.state === 'open'){
      const alive = o.spawn.filter(id => world.enemies.some(e => e.id === id && e.hp > 0));
      o.spawn = alive;
      if(!alive.length){
        if(o.wave < OMEN.riftWaves) riftWave(world, o, tier);
        else{
          world.spillLoot(rollLoot('reliquary', world.lootRng, .3), o.x, o.z, null);
          for(const p of standing(world)) if(Math.hypot(p.x-o.x, p.z-o.z) < 26) world.awardXp(p, 90*(1+tier));
          world.event('riftclose', o.x, o.z, '', {});
          world.event('announce', o.x, o.z, 'The rift seals with a sigh. It leaves its treasure behind.');
          finish(world, o);
        }
      }
    }
  }
}

function riftWave(world, o, tier){
  o.wave++;
  const humans = Math.max(1, world.players.filter(p => p.online).length);
  const count = 3+o.wave*2+(humans-1)*2;
  const pools = [['crawler', 'crawler', 'wraith'], ['bonewalker', 'crawler', 'wraith', 'bogling'], ['brute', 'bonewalker', 'wraith', 'bogling', 'crawler']];
  const pool = pools[Math.min(pools.length-1, o.wave-1)];
  for(let i = 0; i < count; i++){
    const a = world.spawnRng()*Math.PI*2, r = 1+world.spawnRng()*2.4;
    const type = i === 0 && o.wave === OMEN.riftWaves ? (tier >= 2 ? 'golem' : 'brute') : pool[i%pool.length];
    const e = world.spawnEnemy(type, o.x+Math.cos(a)*r, o.z+Math.sin(a)*r, {tier: Math.max(1, tier), elite: i === 0 && o.wave === OMEN.riftWaves ? true : undefined});
    if(e){e.hunt = true; e.omen = o.id; o.spawn.push(e.id);}
  }
  world.event('portal', o.x, o.z, '', {radius: 2.4});
  world.event('announce', o.x, o.z, `The rift pours out wave ${o.wave} of ${OMEN.riftWaves}`);
}

/**
 * An omen node was used (World.finishHarvest). `ids` are everyone who helped, first finder first.
 * Returns true when it handled the node (it never regrows).
 */
export function useOmen(world, node, ids){
  const o = (world.omens || []).find(entry => entry.id === node.id && !entry.done); if(!o) return false;
  const finder = world.player(ids[0]);
  const zone = world.regionOf(o.x, o.z), tier = REGIONS[zone]?.tier ?? 1;
  if(o.kind === 'fallenstar'){
    world.spillLoot(rollLoot('fallenstar', world.lootRng, tier >= 2 ? .4 : 0), o.x, o.z, finder?.name);
    for(const id of ids) world.awardXp(world.player(id), 60*(1+tier));
    world.event('cache', o.x, o.z, '', {key: 'fallenstar'});
    finish(world, o); return true;
  }
  if(o.kind === 'mimic'){
    if(world.spawnRng() < OMEN.mimic){
      const e = world.spawnEnemy(tier >= 2 ? 'golem' : 'brute', o.x, o.z, {elite: true, tier: Math.max(1, tier)});
      if(e){e.mimic = true; e.aggro = true; e.hp = e.maxHp = Math.round(e.maxHp*1.3);}
      world.event('announce', o.x, o.z, 'The chest has teeth!');
      world.event('mimic', o.x, o.z, '', {});
    }else{
      world.spillLoot(rollLoot('moonchest', world.lootRng, .6), o.x, o.z, finder?.name);
      for(const id of ids) world.awardXp(world.player(id), 80);
      world.event('cache', o.x, o.z, '', {key: 'moonchest'});
    }
    finish(world, o); return true;
  }
  if(o.kind === 'goldpumpkin'){
    world.spillLoot(rollLoot('goldpumpkin', world.lootRng, .5), o.x, o.z, finder?.name);
    for(const id of ids) world.awardXp(world.player(id), 50);
    finish(world, o); return true;
  }
  if(o.kind === 'cauldron'){
    for(const id of ids){
      const p = world.player(id); if(!p || o.sipped.includes(id)) continue;
      o.sipped.push(id); brew(world, p, o);
    }
    if(o.sipped.length >= world.players.filter(p => p.online).length){world.event('announce', o.x, o.z, 'The cauldron bubbles dry.'); finish(world, o);}
    return true;
  }
  return false;
}

/** A mimic fell: it gives up what the chest held (World.tick, on any creature's death). */
export function omenKill(world, e){
  if(!e.mimic) return;
  world.spillLoot(rollLoot('moonchest', world.lootRng, 1), e.x, e.z, world.player(e.lastHitBy)?.name);
}

function brew(world, p, o){
  const kind = pickWeighted(world.spawnRng, Object.entries(BREWS).map(([id, b]) => [id, b.weight]));
  const cycle = scheduleOf(world).cycle, now = hollowTime(world), dawn = (Math.floor(now/cycle)+1)*cycle;
  if(kind === 'hex'){
    for(let i = 0; i < 6; i++){const a = i/6*Math.PI*2, e = world.spawnEnemy('crawler', p.x+Math.cos(a)*3, p.z+Math.sin(a)*3, {tier: 1}); if(e) e.hunt = true;}
  }else{
    endBrew(p);
    p.brew = {kind, until: Math.max(dawn, now+120)};
    if(kind === 'fury') p.boon = BREW_FURY;
    if(kind === 'vigor'){p.hp = p.maxHp || p.hp; p.courage = 100;}
  }
  world.event('brew', p.x, p.z, BREWS[kind].name, {player: p.id, kind});
  world.tell(p, `${BREWS[kind].name} · ${BREWS[kind].text}`);
}
function endBrew(p){if(p.brew?.kind === 'fury' && p.boon === BREW_FURY) p.boon = 1; p.brew = null;}

/** Walk-speed factor from a brew (World.speedFactor). */
export const brewSpeed = p => p?.brew?.kind === 'swift' ? BREW_SPEED : 1;

/** HUD line for a wanderer under a brew, or ''. */
export function brewLine(p){return p?.brew ? `${BREWS[p.brew.kind]?.name || ''} brew` : '';}

