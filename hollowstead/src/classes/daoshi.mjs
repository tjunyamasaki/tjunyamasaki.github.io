// The Hundred-Seal Daoshi: a class built on the Hundred Seals (src/magic/ofuda.mjs), a daoshi's sheaf of
// paper talismans.
//
// One idea runs through the kit: the seal. Talismans paste seals on foes; the third on one foe ignites
// them all, and the fire runs down the link to every other foe you have sealed nearby. The class adds the
// chain: a linked foe that held two seals or more catches fire itself, so one ignition can run through a
// whole web. Every skill does one of these:
//   PASTE seals     Talisman Fan (a fan of talismans, one foe each), Talisman Storm (every throw flicks two
//                   more), Warding Talisman (a ward that throws for you), Binding Circle (roots and seals);
//   SHAPE the web   Spirit Thread copies your most-sealed foe's seals onto everything round it;
//   SET IT ALIGHT   Release ignites every seal you have laid, at once.
// A turn: Binding Circle the pack, Spirit Thread the seals across it, then let one talisman start the chain.
//
// Rules only (host). State on the wanderer (`p.ki` for Ink, `p.daoshi`, `p.sealMods`), plain data. Looks:
// src/fx/daoshi.mjs and the sheaf's own painters for every talisman and seal.
import {SEAL, SEAL_HOOKS, grandSeal, ignitePin, pinsOf, sealFire, sealFoe, throwSeal} from '../magic/ofuda.mjs?v=harvest-18';
import {ownerPower} from '../magic/registry.mjs?v=harvest-18';
import {applyDot} from '../arsenal.mjs?v=harvest-18';
import {registerClass} from './registry.mjs?v=harvest-18';
import {R, aim, bodyOf, bossy, dist, fadeResource, gain, hostiles, mark, pct, pose, rankByLevel, round} from './kit.mjs?v=harvest-18';

const PACK = 'ofuda';
export const DAOSHI = Object.freeze({
  inkStick: 4, inkBurn: 2, inkBurnCap: 14,
  chainAt: 2,         // a linked foe holding this many seals catches fire itself
  chainDepth: 4,
  ultLevel: 6,
});
const stateOf = p => (p.daoshi && typeof p.daoshi === 'object') ? p.daoshi : (p.daoshi = {});
const isDaoshi = p => p?.classId === 'daoshi';
const playerOf = (world, id) => (world.players || []).find(q => q.id === id) || null;
const gainMult = p => 1+.25*R(p, 'ink-well');
/** The Daoshi's hit: one ignition's burst at the wanderer's power. Skills are multiples of it. */
export const burstHit = (world, p) => SEAL.burst*ownerPower(world, p);
const pinOf = (world, p, e) => pinsOf(world, p.id).find(q => q.targetId === e.id && !q.done) || null;

// ------------------------------------------------------------------ the tree
const NODES = {
  // ---- Fu · the Paper
  'quick-hand': {tree: 'paper', tier: 0, col: 0, kind: 'passive', max: 3, name: 'Quick Hand', glyph: '≫',
    text: r => `Talismans fly ${pct(.06*r)} faster from the hand.`},
  fan: {tree: 'paper', tier: 0, col: 2, kind: 'skill', max: 3, name: 'Talisman Fan', glyph: '⋔',
    text: r => `Flick a fan of ${4+r} talismans, each at a different foe before you: a seal each.`},
  'sharp-paper': {tree: 'paper', tier: 1, col: 0, kind: 'passive', max: 3, name: 'Sharp Paper', glyph: '⟋',
    text: r => `Talismans cut ${pct(.15*r)} harder as they stick.`},
  'long-paper': {tree: 'paper', tier: 1, col: 2, kind: 'passive', max: 2, name: 'Long Paper', glyph: '▭',
    text: r => `Seals hold ${3*r}s longer and talismans reach ${(1.5*r).toFixed(1)} further.`},
  storm: {tree: 'paper', tier: 2, col: 1, kind: 'skill', max: 2, req: 'fan', name: 'Talisman Storm', glyph: '❃',
    text: r => `For ${(3+1.5*r).toFixed(1)}s every throw flicks two more talismans at other foes.`},
  'fourth-seal': {tree: 'paper', tier: 3, col: 0, kind: 'passive', max: 1, name: 'The Fourth Seal', glyph: '肆',
    text: () => 'Seals stack to four before they ignite, and every ignition burns 25% hotter.'},
  hundred: {tree: 'paper', tier: 4, col: 1, kind: 'capstone', max: 1, req: 'storm', name: 'A Hundred Seals', glyph: '百',
    text: () => 'Talisman Fan throws a second fan a moment after the first.'},
  // ---- Huo · the Fire
  'wide-burst': {tree: 'fire', tier: 0, col: 0, kind: 'passive', max: 3, name: 'Wide Burst', glyph: '✺',
    text: r => `Ignitions burn ${pct(.12*r)} hotter and ${(.3*r).toFixed(1)} wider.`},
  kai: {tree: 'fire', tier: 0, col: 2, kind: 'skill', max: 3, name: 'Release', glyph: '解',
    text: r => `Kai! Every seal you have laid ignites at once, hotter for every seal on its foe (${(.8+.2*r).toFixed(1)}× the usual).`},
  spread: {tree: 'fire', tier: 1, col: 1, kind: 'skill', max: 3, name: 'Spirit Thread', glyph: '⧖',
    text: r => `Threads run from your most-sealed foe to every foe within ${5+r}: each takes as many seals as it holds (never enough to ignite).`},
  'ink-well': {tree: 'fire', tier: 1, col: 2, kind: 'passive', max: 2, name: 'Ink Well', glyph: '◒',
    text: r => `Ink flows ${pct(.25*r)} faster.`},
  'long-link': {tree: 'fire', tier: 2, col: 0, kind: 'passive', max: 2, name: 'Long Link', glyph: '⟿',
    text: r => `The fire runs ${2*r} further down the links and carries ${pct(.1*r)} more.`},
  ember: {tree: 'fire', tier: 2, col: 2, kind: 'passive', max: 2, name: 'Embers', glyph: '♆',
    text: r => `What an ignition burns keeps burning: ${pct(.2*r)} of a burst over 3s.`},
  wildfire: {tree: 'fire', tier: 4, col: 1, kind: 'capstone', max: 1, req: 'spread', name: 'Wildfire', glyph: '火',
    text: () => 'Where the fire runs down a link it pastes a seal instead of burning one off.'},
  // ---- Shen · the Spirit
  ward: {tree: 'spirit', tier: 0, col: 0, kind: 'skill', max: 2, name: 'Warding Talisman', glyph: '門',
    text: r => `Raise a ward where you stand for ${6+2*r}s: it flicks a talisman at the nearest foe every moment.`},
  sticky: {tree: 'spirit', tier: 0, col: 2, kind: 'passive', max: 2, name: 'Clinging Paper', glyph: '⌇',
    text: r => `A sealed foe is slowed for ${r}s.`},
  binding: {tree: 'spirit', tier: 1, col: 1, kind: 'skill', max: 3, name: 'Binding Circle', glyph: '◎',
    text: r => `A seal circle at your mark: everything inside is rooted ${(1.5+.3*r).toFixed(1)}s and sealed.`},
  'ward-craft': {tree: 'spirit', tier: 2, col: 0, kind: 'passive', max: 2, req: 'ward', name: 'Ward Craft', glyph: '⌂',
    text: r => `Wards throw ${pct(.2*r)} faster and stand ${2*r}s longer.`},
  'deep-binding': {tree: 'spirit', tier: 2, col: 2, kind: 'passive', max: 2, req: 'binding', name: 'Deep Binding', glyph: '⊚',
    text: r => `Binding Circle roots ${(.5*r).toFixed(1)}s longer${r >= 2 ? ' and pastes two seals' : ''}.`},
  exorcism: {tree: 'spirit', tier: 4, col: 1, kind: 'capstone', max: 1, req: 'binding', name: 'Exorcism', glyph: '祓',
    text: () => 'Ignitions burn foes under 30% of their health twice as hard.'},
};

// ------------------------------------------------------------------ active skills
/** Talismans at up to n different foes in a cone before the wanderer (straight ahead when there are none). */
function fan(world, p, n){
  const [dx, dz] = aim(world, p, SEAL.range), face = Math.atan2(dz, dx), power = ownerPower(world, p)*(p.sealMods?.damage || 1);
  const foes = hostiles(world).filter(e => dist(e, p) <= SEAL.range+(p.sealMods?.range || 0))
    .map(e => ({e, off: Math.abs(Math.atan2(Math.sin(Math.atan2(e.z-p.z, e.x-p.x)-face), Math.cos(Math.atan2(e.z-p.z, e.x-p.x)-face)))}))
    .filter(f => f.off <= Math.PI/2.4).sort((a, b) => a.off*2+dist(a.e, p)*.1-(b.off*2+dist(b.e, p)*.1)).slice(0, n);
  for(let i = 0; i < n; i++){
    const spread = n > 1 ? (i/(n-1)-.5)*70*Math.PI/180 : 0, target = foes[i]?.e || null;
    throwSeal(world, p, face+spread, target?.id ?? null, power);
  }
  world.event('daofan', p.x, p.z, '', {player: p.id, itemId: PACK, angle: round(face), n});
}
const SKILLS = {
  fan: {name: 'Talisman Fan', glyph: '⋔', cost: 0, cooldown: () => 6, text: 'A fan of talismans, a seal on each foe.',
    cast(world, p, rank){
      fan(world, p, 4+rank);
      if(R(p, 'hundred')) stateOf(p).fanAt = round(world.time+.3);
      pose(world, p, .3, PACK);
      return true;
    }},
  storm: {name: 'Talisman Storm', glyph: '❃', cost: 30, cooldown: () => 18, text: 'For a while every throw flicks two more.',
    cast(world, p, rank){
      stateOf(p).stormUntil = round(world.time+3+1.5*rank);
      pose(world, p, .3);
      world.event('daostorm', p.x, p.z, '', {player: p.id, itemId: PACK, secs: 3+1.5*rank});
      return true;
    }},
  kai: {name: 'Release', glyph: '解', cost: 25, cooldown: () => 6, text: 'Ignite every seal you have laid.',
    cast(world, p, rank){
      if(!pinsOf(world, p.id).some(q => q.n > 0 && !q.done)) return 'No seals to release';
      const fired = sealFire(world, p, .8+.2*rank);
      pose(world, p, .35);
      world.event('fx', p.x, p.z, '', {fx: 'sealfire', itemId: PACK, player: p.id, points: fired.points});
      world.event('daokai', p.x, p.z, '', {player: p.id, itemId: PACK, n: fired.points.length});
      return true;
    }},
  spread: {name: 'Spirit Thread', glyph: '⧖', cost: 15, cooldown: () => 8, text: "Copy your most-sealed foe's seals onto the foes round it.",
    cast(world, p, rank){
      const foes = hostiles(world), pins = pinsOf(world, p.id).filter(q => q.n > 0 && !q.done);
      let best = null, bestN = 0;
      for(const pin of pins){
        const e = foes.find(f => f.id === pin.targetId);
        if(e && dist(e, p) <= 11 && (pin.n > bestN || (pin.n === bestN && best && dist(e, p) < dist(best, p)))){best = e; bestN = pin.n;}
      }
      if(!best) return 'Seal a foe first';
      const reach = 5+rank, threads = [], power = ownerPower(world, p);
      for(const e of foes){
        if(e === best || Math.hypot(e.x-best.x, e.z-best.z) > reach) continue;
        sealFoe(world, p, e, bestN, power);
        threads.push([round(e.x), round(e.z)]);
        if(threads.length >= 14) break;
      }
      pose(world, p, .35);
      world.event('daothread', round(best.x), round(best.z), '', {player: p.id, itemId: PACK, threads, n: bestN});
      return true;
    }},
  ward: {name: 'Warding Talisman', glyph: '門', cost: 25, cooldown: () => 16, text: 'A ward that throws talismans for you.',
    cast(world, p, rank){
      const secs = 6+2*rank+2*R(p, 'ward-craft');
      stateOf(p).ward = {x: round(p.x), z: round(p.z), until: round(world.time+secs), next: round(world.time+.4), at: round(world.time), secs};
      pose(world, p, .3);
      world.event('daoward', p.x, p.z, '', {player: p.id, itemId: PACK, secs});
      return true;
    }},
  binding: {name: 'Binding Circle', glyph: '◎', cost: 20, cooldown: () => 10, text: 'Root and seal everything in a circle at your mark.',
    cast(world, p, rank){
      const at = mark(world, p, 9, 4), r = 2.6+.2*rank, deep = R(p, 'deep-binding'), hold = 1.5+.3*rank+.5*deep, power = ownerPower(world, p);
      let n = 0;
      for(const e of hostiles(world)){
        if(Math.hypot(e.x-at.x, e.z-at.z) > r+bodyOf(e)*.4) continue;
        e.magicRootRemaining = Math.max(e.magicRootRemaining || 0, bossy(e) ? hold*.5 : hold); e.windup = 0;
        sealFoe(world, p, e, deep >= 2 ? 2 : 1, power); n++;
      }
      pose(world, p, .4);
      world.event('daobind', at.x, at.z, '', {player: p.id, itemId: PACK, r: round(r), hold: round(hold), n});
      return true;
    }},
};
const ULTIMATE = {name: 'Grand Seal', glyph: '✦', cost: 50, level: DAOSHI.ultLevel, cooldown: () => 30,
  text: 'Talismans fly to every foe around you, two seals each; then every seal you have laid ignites at once, nearest first.',
  cast(world, p){
    const sealed = grandSeal(world, p, 2, ownerPower(world, p));
    stateOf(p).fireAt = round(world.time+.9);
    pose(world, p, .9);
    p.skillCast = {itemId: PACK, at: world.time, x: p.x, z: p.z, dx: p.dx, dz: p.dz, rank: 5, id: world.nextId('cast')};
    world.event('fx', p.x, p.z, '', {fx: 'grandseal', itemId: PACK, player: p.id, marks: sealed.marks});
    return true;
  }};

// ------------------------------------------------------------------ what the talismans and the fire feed
SEAL_HOOKS.throw.push((world, p, {dart}) => {
  if(!isDaoshi(p) || !((stateOf(p).stormUntil || 0) > world.time)) return;
  // Talisman Storm: two more, at the next foes along.
  const others = hostiles(world).filter(e => e.id !== dart.targetId && dist(e, p) <= SEAL.range+(p.sealMods?.range || 0))
    .sort((a, b) => dist(a, p)-dist(b, p)).slice(0, 2);
  [-1, 1].forEach((side, i) => throwSeal(world, p, dart.aim+side*.35, others[i]?.id ?? null, dart.power));
});
SEAL_HOOKS.stick.push((world, ownerId) => {
  const p = playerOf(world, ownerId);
  if(isDaoshi(p)) gain(world, p, DAOSHI.inkStick, gainMult(p));
});
SEAL_HOOKS.ignite.push((world, ownerId, {struck, linked}) => {
  const p = playerOf(world, ownerId);
  if(!isDaoshi(p)) return;
  gain(world, p, Math.min(DAOSHI.inkBurnCap, DAOSHI.inkBurn*struck.length), gainMult(p));
  const ember = R(p, 'ember');
  if(ember){
    const dps = round(burstHit(world, p)*.2*ember/3);
    for(const id of new Set(struck)){const e = world.enemies.find(f => f.id === id); if(e) applyDot(e, dps, 3, p.id, 'burn');}
  }
  // The chain: a linked foe that still holds DAOSHI.chainAt-1 or more seals (it held chainAt) catches fire itself.
  const s = stateOf(p);
  if((s.depth || 0) >= DAOSHI.chainDepth) return;
  const next = linked.filter(pin => !pin.done && pin.n >= DAOSHI.chainAt-1+(p.sealMods?.wildfire ? 1 : 0));
  if(!next.length) return;
  s.depth = (s.depth || 0)+1;
  try{
    for(const pin of next.slice(0, 6)){
      world.event('daochain', pin.px, pin.pz, '', {player: p.id, itemId: PACK, depth: s.depth});
      ignitePin(world, pin, .8);
    }
  }finally{s.depth--;}
});

// ------------------------------------------------------------------ every tick
export function sealMods(world, p){
  const fourth = R(p, 'fourth-seal');
  return {
    damage: round(1+.15*R(p, 'sharp-paper')), cooldown: round(1/(1+.06*R(p, 'quick-hand'))),
    stick: 3*R(p, 'long-paper'), range: round(1.5*R(p, 'long-paper')),
    max: fourth ? 4 : 3, burst: round((1+.12*R(p, 'wide-burst'))*(fourth ? 1.25 : 1)), radius: round(.3*R(p, 'wide-burst')),
    link: 2*R(p, 'long-link'), linkShare: round(.1*R(p, 'long-link')),
    slow: R(p, 'sticky'), wildfire: !!R(p, 'wildfire'), execute: R(p, 'exorcism') ? .3 : 0,
  };
}
function sync(world, p){
  const mods = sealMods(world, p);
  if(JSON.stringify(mods) !== JSON.stringify(p.sealMods)) p.sealMods = mods;
  (p.ranks ||= {})[PACK] = rankByLevel(p);
}
function step(world, p, dt){
  sync(world, p);
  fadeResource(world, p, dt);
  const s = stateOf(p);
  s.depth = 0;
  if(s.fanAt && world.time >= s.fanAt){s.fanAt = 0; fan(world, p, 4+R(p, 'fan'));}
  if(s.fireAt && world.time >= s.fireAt){
    s.fireAt = 0;
    const fired = sealFire(world, p);
    world.event('fx', p.x, p.z, '', {fx: 'sealfire', itemId: PACK, player: p.id, points: fired.points});
  }
  const ward = s.ward;
  if(ward){
    if(world.time >= ward.until){s.ward = null; world.event('daowardend', ward.x, ward.z, '', {player: p.id, itemId: PACK});}
    else if(world.time >= ward.next){
      ward.next = round(world.time+Math.max(.4, .9*(1-.2*R(p, 'ward-craft'))));
      const reach = 8+(p.sealMods?.range || 0);
      // The least-sealed foe in reach, nearest first: the ward spreads its seals.
      const target = hostiles(world).filter(e => Math.hypot(e.x-ward.x, e.z-ward.z) <= reach)
        .sort((a, b) => ((pinOf(world, p, a)?.n || 0)-(pinOf(world, p, b)?.n || 0)) || (Math.hypot(a.x-ward.x, a.z-ward.z)-Math.hypot(b.x-ward.x, b.z-ward.z)))[0];
      if(target){
        throwSeal(world, p, Math.atan2(target.z-ward.z, target.x-ward.x), target.id, ownerPower(world, p)*(p.sealMods?.damage || 1), ward);
        world.event('daowardthrow', ward.x, ward.z, '', {player: p.id, itemId: PACK});
      }
    }
  }
  if(s.stormUntil && s.stormUntil <= world.time) s.stormUntil = 0;
}

export const DAOSHI_CLASS = registerClass({
  id: 'daoshi', name: 'Hundred-Seal Daoshi', weapon: PACK, role: 'Ranged · seals · chain fire',
  blurb: 'A Taoist exorcist of Yomi with a sheaf of paper talismans. Paste seals across the swarm, thread them from foe to foe, and let a single spark run through the whole web.',
  resource: {id: 'ink', name: 'Ink', max: 100, color: '#f0cf5a'},
  traits: [
    {name: 'Seals', text: 'Your attack flicks a talisman that pastes a seal. The third seal on one foe ignites them all in a burst, and the fire runs down the link to every other foe you have sealed nearby (taking a seal from each).'},
    {name: 'Chain Fire', text: `A linked foe that held ${DAOSHI.chainAt} seals or more catches fire itself, so one ignition can run through a whole web.`},
    {name: 'Ink', text: `Every seal that sticks (+${DAOSHI.inkStick}) and every foe the fire burns (+${DAOSHI.inkBurn}) gives Ink; skills spend it. It fades when you stop fighting.`},
  ],
  trees: [
    {id: 'paper', name: 'Fu', sub: 'the Paper', blurb: 'More talismans, faster, sharper, and a fourth seal.'},
    {id: 'fire', name: 'Huo', sub: 'the Fire', blurb: 'Hotter, wider, longer links: the web burns.'},
    {id: 'spirit', name: 'Shen', sub: 'the Spirit', blurb: 'Wards and circles: hold the swarm where the seals can reach.'},
  ],
  nodes: NODES, skills: SKILLS, ultimate: ULTIMATE,
  busy: () => false,
  sync, step,
  clear(world, p){p.daoshi = {}; p.sealMods = null; p.ki = 0;},
  view: (world, p) => ({storm: (p.daoshi?.stormUntil || 0) > world.time, ward: p.daoshi?.ward || null}),
});
