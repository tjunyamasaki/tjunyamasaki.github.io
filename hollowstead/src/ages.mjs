// Dread Ages: on a Vigil, every 10 Dread (vigil.mjs) the hollow enters a new age and changes for good.
// Each age keeps everything the ones before it brought:
//   I    The Stirring    roaming packs follow an elder, and run one larger
//   II   The Bleeding    bleeding altars join the omens (omens.mjs): wake a Dread champion for Dread sigils
//   III  The Thorning    Dread thorns grow over the trails: they slow and scratch wanderers; an axe clears them
//   IV   The Hunt        dreadhounds, faster than any wanderer, run with the night and the roaming packs
//   V    The Deep Dread  two elders lead each pack, the thorns grow thick, hounds hunt by day too
// The night sky darkens toward red with each age (lighting.mjs reads ageLighting).
//
// world.saga.age  the age the party has been told about (an age is announced once, when it is reached)
// world.thorns    [{id, x, z}]  saved and sent to guests; their nodes are rebuilt from it, like omens
// Pure simulation: import only content/progression/worldgen/vigil. Never engine.mjs, a renderer or the DOM.

import {NODES} from './content.mjs?v=harvest-18';
import {INNER_RING, REGIONS} from './progression.mjs?v=harvest-18';
import {iceAt, worldShape} from './worldgen.mjs?v=harvest-18';
import {isVigil, sagaOf} from './vigil.mjs?v=harvest-18';
import {builtAt} from './homestead.mjs?v=harvest-18';

/** The ages, by the Dread that opens each. `line` is what the banner says the hollow now does. */
export const AGES = Object.freeze([
  Object.freeze({at: 0, numeral: '', name: 'The Quiet', line: 'The hollow watches.'}),
  Object.freeze({at: 10, numeral: 'I', name: 'The Stirring', line: 'Roaming packs now follow an elder.'}),
  Object.freeze({at: 20, numeral: 'II', name: 'The Bleeding', line: 'Bleeding altars rise among the omens. Wake their champions for Dread sigils.'}),
  Object.freeze({at: 30, numeral: 'III', name: 'The Thorning', line: 'Thorns creep over the trails. They slow and scratch whoever wades through; an axe clears them.'}),
  Object.freeze({at: 40, numeral: 'IV', name: 'The Hunt', line: 'Dreadhounds run with the night, faster than any wanderer.'}),
  Object.freeze({at: 50, numeral: 'V', name: 'The Deep Dread', line: 'Two elders lead each pack, the thorns grow thick and the hounds hunt by day.'}),
]);
/** Which age turns each rule on. */
export const AGE = Object.freeze({elderPacks: 1, altars: 2, thorns: 3, hounds: 4, deep: 5});

/**
 * Dread thorns. `target[age]` patches stand on the trails at most (0 below the Thorning); `seed` grow at once
 * when the age begins and `perDawn` more each dawn until the target. They grow only beyond the Meadow
 * (`ring` from the fire), `gap` apart, never within `clear` of a wanderer. Wading through one: walk at
 * `slow`, and a `scratch` of damage every `every` seconds (a dodge passes through untouched).
 */
export const THORNS = Object.freeze({target: Object.freeze([0, 0, 0, 16, 20, 30]), seed: 8, perDawn: 6, ring: INNER_RING, gap: 6, clear: 10,
  reach: 1.5, slow: .6, scratch: 3, every: .6});

/** Night tints per age: the dark creeps toward red (lighting.mjs, when tonight's moon brings none of its own). */
const AGE_LIGHT = Object.freeze([null,
  Object.freeze({tint: '#1e1a2e'}), Object.freeze({tint: '#241a30'}), Object.freeze({tint: '#281a2a', day: '#fbf5f3'}),
  Object.freeze({tint: '#2c1624', day: '#f7eeec'}), Object.freeze({tint: '#321320', day: '#f2e4e2'})]);

/** The age a Dread value falls in (0 to 5). */
export function ageAt(dread){
  let age = 0;
  for(let i = 1; i < AGES.length; i++) if((Number(dread) || 0) >= AGES[i].at) age = i;
  return age;
}
/** This world's age: only a Vigil has them. */
export function ageOf(world){
  if(!isVigil(world)) return 0;
  return ageAt(Math.floor(sagaOf(world).dread || 1));
}
/** True when `rule` (AGE.*) is in force. */
export const ageHas = (world, rule) => ageOf(world) >= rule;
/** HUD and title-screen summary: {age, numeral, name, line, next (Dread of the next age, or null)}. */
export function ageInfo(world){
  const age = ageOf(world), a = AGES[age];
  return {age, numeral: a.numeral, name: a.name, line: a.line, next: AGES[age+1]?.at ?? null};
}
/** Lighting hint for this age: {tint, day} or null (read by lighting.frameLighting on every frame). */
export function ageLighting(world){
  if(!world || world.arena || world.dungeon) return null;
  return AGE_LIGHT[ageOf(world)] || null;
}

// ------------------------------------------------------------------ the host, every tick

/** Host, every Vigil tick on the surface: announce a new age, grow the thorns, scratch whoever wades in. */
export function stepAges(world, dt, before, phase){
  if(!isVigil(world) || world.dungeon || world.arena || world.showcase) return;
  const s = sagaOf(world), age = ageOf(world);
  if(!Number.isInteger(s.age)) s.age = 0;
  if(age > s.age){
    s.age = age;
    const a = AGES[age];
    // The banner (main.mjs) carries the age's name and what it brings.
    world.event('dreadage', 0, 0, `Age ${a.numeral} · ${a.name}`, {age, name: a.name, line: a.line});
    if(age >= AGE.thorns) growThorns(world, THORNS.seed);
  }
  if(age >= AGE.thorns && before !== 'day' && phase === 'day') growThorns(world, THORNS.perDawn);
  if(world.thorns?.length) stepThorns(world, dt);
}

// ------------------------------------------------------------------ thorns

/** Nodes for the standing thorns (World.restore and rebuildNodes append them after the hollow's own). */
export function thornNodes(world){
  return (world.thorns || []).map(t => ({id: t.id, type: 'thornpatch', x: t.x, z: t.z, hits: NODES.thornpatch.hits, ready: 0}));
}

/** Grow up to `n` patches on the trails, never past this age's target. Returns how many grew. */
export function growThorns(world, n){
  const thorns = world.thorns ||= [];
  const target = THORNS.target[Math.min(THORNS.target.length-1, ageOf(world))] || 0;
  const want = Math.min(n, target-thorns.length);
  if(want <= 0) return 0;
  const trails = (worldShape(world.seed).trails || []).filter(t => t.length > 1);
  if(!trails.length) return 0;
  const rng = world.spawnRng, made = [];
  for(let tries = 0; tries < want*30 && made.length < want; tries++){
    const trail = trails[Math.floor(rng()*trails.length)], i = Math.floor(rng()*(trail.length-1)), t = rng();
    const [ax, az] = trail[i], [bx, bz] = trail[i+1], len = Math.hypot(bx-ax, bz-az) || 1, side = (rng()-.5)*1.2;
    const x = ax+(bx-ax)*t-(bz-az)/len*side, z = az+(bz-az)*t+(bx-ax)/len*side;
    if(Math.hypot(x, z) < THORNS.ring || !world.walkable(x, z) || iceAt(world.seed, x, z)) continue;
    if(!(REGIONS[world.regionOf(x, z)]?.tier >= 1)) continue;
    if(thorns.some(o => Math.hypot(o.x-x, o.z-z) < THORNS.gap)) continue;
    if(world.players.some(p => p.online && Math.hypot(p.x-x, p.z-z) < THORNS.clear)) continue;
    if(world.nodes.some(o => o.type !== 'grass' && Math.hypot(o.x-x, o.z-z) < 1.6)) continue;
    if(builtAt(world, x, z, .8)) continue;
    const thorn = {id: world.nextId('th'), x: +x.toFixed(2), z: +z.toFixed(2)};
    thorns.push(thorn); made.push(thorn);
  }
  world.nodes.push(...thornNodes({thorns: made}));
  return made.length;
}

/** The standing thorn patch a wanderer is wading through, or null. */
export function thornAt(world, x, z){
  for(const t of world.thorns || []) if(Math.abs(t.x-x) < THORNS.reach && Math.abs(t.z-z) < THORNS.reach && Math.hypot(t.x-x, t.z-z) < THORNS.reach) return t;
  return null;
}

/** Walk-speed factor from thorns underfoot (World.speedFactor). */
export function thornSpeed(world, p){
  if(!world?.thorns?.length || !p) return 1;
  return thornAt(world, p.x, p.z) ? THORNS.slow : 1;
}

function stepThorns(world, dt){
  // A cut patch is gone for good (its node never regrows: NODES.thornpatch.regrow is huge).
  const cut = new Set();
  for(const n of world.nodes) if(n.type === 'thornpatch' && n.ready > 0) cut.add(n.id);
  if(cut.size){
    world.nodes = world.nodes.filter(n => !cut.has(n.id));
    world.thorns = world.thorns.filter(t => !cut.has(t.id));
  }
  for(const p of world.players){
    if(!p.online || p.down || p.ghost || !(p.hp > 0)) continue;
    const t = thornAt(world, p.x, p.z);
    if(!t){p.thornT = 0; continue;}
    p.thornT = (p.thornT || 0)+dt;
    if(p.thornT < THORNS.every) continue;
    p.thornT = 0;
    // Mid-dodge you pass through untouched (and a dodge never counts as a perfect one on thorns).
    if(p.iframes > 0 || p.dash > 0) continue;
    world.hurt(p, THORNS.scratch);
    world.event('thorns', p.x, p.z, '', {player: p.id});
  }
}

// ------------------------------------------------------------------ packs and hounds

/** Roaming packs on a Vigil: how many elders lead them and how many more come (engine World.roam). */
export function packRule(world){
  const age = ageOf(world);
  return {elders: age >= AGE.deep ? 2 : age >= AGE.elderPacks ? 1 : 0, extra: age >= AGE.elderPacks ? 1 : 0,
    hounds: age >= AGE.hounds, houndsByDay: age >= AGE.deep};
}

/** True when this tick's day number (or phase) lets hounds run with the roaming packs. */
export function houndsRoam(world, phase){
  const rule = packRule(world);
  return rule.hounds && (phase !== 'day' || rule.houndsByDay);
}
