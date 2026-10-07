// The Green Dragon General: a class built on the Green Dragon guandao (src/magic/guandao.mjs).
//
// One idea runs through the kit: the line. Cut again the same way, soon enough, and the haft runs out one
// more step (three steps, 3 to 6.3 units, harder each time); turn and it shortens. And the class adds the
// tip: what stands at the very edge of the crescent takes more. Every skill does one of these:
//   GROW the line   Dragon Lunge (a charge that counts as a cut held), Whirling Crescent (a full circle that
//                   steps the line up without breaking it), Mountain Stance (turn freely, every sweep steps up);
//   SET the tip     Reaping Hook drags everything in a wide arc out (or in) to the tip of your next sweep;
//   SPEND the line  Crescent Wave flies along the line, longer and harder for every step, and spends them;
//   REACH for it    Dragon's Roar stuns a cone; the Dragon Pearl hangs at the mark until a sweep reaches it.
// A turn: hold the line to full reach, Hook the swarm onto the tip, sweep, then send the Crescent Wave.
//
// Rules only (host). State on the wanderer (`p.ki` for Qi, `p.general`, `p.gdMods`), plain data. Looks:
// src/fx/general.mjs and the guandao's own painters for every sweep.
import {CRESCENT, DRAGON, GD_HOOKS, dragonRush, inCrescent, sweepAt, wakeDragon} from '../magic/guandao.mjs?v=harvest-18';
import {ownerPower} from '../magic/registry.mjs?v=harvest-18';
import {maxHealth} from '../progression.mjs?v=harvest-18';
import {stun} from '../arsenal.mjs?v=harvest-18';
import {registerClass} from './registry.mjs?v=harvest-18';
import {R, TAU, aim, bodyOf, bossy, dist, drag, fadeResource, gain, hostiles, hurt, mark, pct, pose, rankByLevel, round, segGap} from './kit.mjs?v=harvest-18';

const PACK = 'guandao';
export const GENERAL = Object.freeze({
  qiSweep: 4, qiStage: 2, qiParry: 5,
  tip: {w: 1.2, b: .25},
  ultLevel: 6,
});
const stateOf = p => (p.general && typeof p.general === 'object') ? p.general : (p.general = {});
const isGeneral = p => p?.classId === 'general';
/** The General's hit: one sweep at the first step, sharpened by Heavy Edge. Skills are multiples of it. */
export const sweepHit = (world, p) => CRESCENT.damage*ownerPower(world, p)*(1+.08*R(p, 'heavy-edge'));
const gainMult = p => 1+.2*R(p, 'dragon-blood');
const angleDelta = (a, b) => {let d = (a-b)%TAU; if(d > Math.PI) d -= TAU; if(d < -Math.PI) d += TAU; return d;};
/** Is the line still held (a cut recent enough to step up from)? */
const lineLive = (world, p) => Number.isFinite(p.gdAng) && world.time-(p.gdAt ?? -99) < CRESCENT.window+(p.gdMods?.window || 0);
const lineStage = (world, p) => lineLive(world, p) ? Math.min(3, p.gdStage || 0) : 0;
/** How far the next sweep along the line will reach. */
const nextReach = (world, p) => CRESCENT.reach[Math.min(3, lineLive(world, p) ? (p.gdStage || 0)+1 : 0)]+(p.gdMods?.reach || 0);
/** Step the line up along `ang`, as a held cut would. */
function stepLine(world, p, ang){
  p.gdStage = Math.min(3, lineLive(world, p) ? (p.gdStage || 0)+1 : 1);
  p.gdAng = round(ang); p.gdAt = round(world.time);
}
/** Enemy shots near a segment or in a cone are cut out of the air. */
function cutShots(world, test){
  const list = world.hostile; if(!list?.length) return 0;
  let n = 0;
  for(const shot of list) if(shot.kind !== 'blast' && shot.kind !== 'spore' && !shot.done && test(shot)){shot.done = true; n++;}
  if(n) world.hostile = list.filter(shot => !shot.done);
  return n;
}

// ------------------------------------------------------------------ the tree
const NODES = {
  // ---- Qinglong · the Line
  'long-haft': {tree: 'line', tier: 0, col: 0, kind: 'passive', max: 3, name: 'Long Haft', glyph: '⟷',
    text: r => `Every sweep reaches ${(.3*r).toFixed(1)} further, at every step of the line.`},
  lunge: {tree: 'line', tier: 0, col: 2, kind: 'skill', max: 3, name: 'Dragon Lunge', glyph: '➹',
    text: r => `Charge ${(4.5+.5*r).toFixed(1)} along your aim, cutting all you pass (${(1+.2*r).toFixed(1)}× a sweep). It counts as a cut held: the line steps up.`},
  'heavy-edge': {tree: 'line', tier: 1, col: 0, kind: 'passive', max: 3, name: 'Heavy Edge', glyph: '◗',
    text: r => `Sweeps and skills hit ${pct(.08*r)} harder.`},
  'steady-hands': {tree: 'line', tier: 1, col: 2, kind: 'passive', max: 2, name: 'Steady Hands', glyph: '⊓',
    text: r => `The line waits ${(.8*r).toFixed(1)}s longer for its next cut and holds ${15*r}° wider.`},
  wave: {tree: 'line', tier: 2, col: 1, kind: 'skill', max: 3, req: 'lunge', name: 'Crescent Wave', glyph: '☽',
    text: r => `Loose the edge along the line: a crescent flies 6 + 2 per step, cutting everything (${(.8+.2*r).toFixed(1)}× a sweep, +50% per step), and the line is spent.`},
  'echo-edge': {tree: 'line', tier: 2, col: 2, kind: 'passive', max: 2, name: 'Echoing Edge', glyph: '≋',
    text: r => r >= 2 ? 'The edge echoes from the second step, and its echoes cut at 80%.' : 'The edge echoes from the second step of the line.'},
  unbroken: {tree: 'line', tier: 3, col: 0, kind: 'passive', max: 2, name: 'Unbroken Line', glyph: '━',
    text: r => `Sweeps at full reach hit ${pct(.15*r)} harder.`},
  'coiled-dragon': {tree: 'line', tier: 4, col: 1, kind: 'capstone', max: 1, req: 'wave', name: 'Coiled Dragon', glyph: '龍',
    text: () => 'Crescent Wave no longer spends the line.'},
  // ---- Shan · the Mountain
  stance: {tree: 'mountain', tier: 0, col: 0, kind: 'skill', max: 2, name: 'Mountain Stance', glyph: '⏶',
    text: r => `For ${4+2*r}s the line holds whichever way you turn, and every sweep steps it up.`},
  'iron-grip': {tree: 'mountain', tier: 0, col: 2, kind: 'passive', max: 2, name: 'Iron Grip', glyph: '⊠',
    text: r => `The tip is ${(.4*r).toFixed(1)} wider and bites ${pct(.1*r)} more.`},
  hook: {tree: 'mountain', tier: 1, col: 1, kind: 'skill', max: 3, name: 'Reaping Hook', glyph: '⤾',
    text: r => `The hook sweeps a wide arc before you and drags every foe in it to the tip of your next sweep, stunned ${(.6+.1*r).toFixed(1)}s. Great foes come half as far.`},
  deflect: {tree: 'mountain', tier: 1, col: 2, kind: 'passive', max: 3, name: 'Turned Arrows', glyph: '⤺',
    text: r => `Every shot your edge cuts down gives ${3*r} more Qi and heals ${r}% of your health.`},
  whirl: {tree: 'mountain', tier: 2, col: 0, kind: 'skill', max: 2, name: 'Whirling Crescent', glyph: '○',
    text: r => `A full circle at the line's next reach (${(1+.15*r).toFixed(2)}× its sweep). The line steps up and keeps its way.`},
  guardian: {tree: 'mountain', tier: 3, col: 1, kind: 'passive', max: 2, req: 'hook', name: 'Hooked Blade', glyph: '⟆',
    text: r => `Reaping Hook also cuts (${(.6*r).toFixed(1)}× a sweep) and stuns ${(.4*r).toFixed(1)}s longer.`},
  'mountain-heart': {tree: 'mountain', tier: 4, col: 0, kind: 'capstone', max: 1, req: 'stance', name: 'Heart of the Mountain', glyph: '◆',
    text: () => 'In Mountain Stance every sweep echoes.'},
  // ---- Long · the Dragon
  'dragon-blood': {tree: 'dragon', tier: 0, col: 0, kind: 'passive', max: 3, name: 'Dragon Blood', glyph: '∿',
    text: r => `Qi grows ${pct(.2*r)} faster.`},
  roar: {tree: 'dragon', tier: 0, col: 2, kind: 'skill', max: 3, name: "Dragon's Roar", glyph: '◬',
    text: r => `Roar down the line: everything in a wide cone to your next reach is stunned ${(.8+.2*r).toFixed(1)}s and cut (0.6× a sweep), and its shots fall.`},
  'jade-scales': {tree: 'dragon', tier: 1, col: 0, kind: 'passive', max: 2, name: 'Jade Scales', glyph: '❖',
    text: r => `A sweep at full reach that lands heals ${r}% of your health.`},
  pearl: {tree: 'dragon', tier: 2, col: 1, kind: 'skill', max: 2, req: 'roar', name: 'Dragon Pearl', glyph: '◉',
    text: r => `Throw the pearl to your mark: it hangs there 4s. When a sweep's crescent reaches it, it bursts round (${(1.5*(.8+.2*r)).toFixed(1)}× a sweep, +50% per step of the line) and stuns.`},
  patience: {tree: 'dragon', tier: 3, col: 0, kind: 'passive', max: 2, name: "Dragon's Patience", glyph: '⧗',
    text: r => `Green Dragon Unbound recharges ${5*r}s sooner and the dragon stays ${r}s longer.`},
  ascending: {tree: 'dragon', tier: 4, col: 1, kind: 'capstone', max: 1, req: 'pearl', name: 'Ascending Dragon', glyph: '⇑',
    text: () => 'A Crescent Wave loosed at full reach wakes the dragon in the blade for 1.5s.'},
};

// ------------------------------------------------------------------ active skills
const SKILLS = {
  lunge: {name: 'Dragon Lunge', glyph: '➹', cost: 0, cooldown: () => 7, text: 'Charge along your aim; the line steps up.',
    cast(world, p, rank){
      const [dx, dz] = aim(world, p, 7), s = stateOf(p);
      s.dash = {x0: round(p.x), z0: round(p.z), dx: round(dx), dz: round(dz), len: round(4.5+.5*rank), done: 0, dur: .22, dmg: round(sweepHit(world, p)*(1+.2*rank)), hit: []};
      p.iframes = Math.max(p.iframes || 0, .3);
      pose(world, p, .3, PACK);
      world.event('genlunge', p.x, p.z, '', {player: p.id, itemId: PACK, dx: round(dx), dz: round(dz), start: 1});
      return true;
    }},
  wave: {name: 'Crescent Wave', glyph: '☽', cost: 20, cooldown: () => 6, text: 'Loose the edge along the line; spends it.',
    cast(world, p, rank){
      const stage = lineStage(world, p);
      const [fx, fz] = aim(world, p, 6+2*stage);
      const ang = lineLive(world, p) ? p.gdAng : Math.atan2(fz, fx), ca = Math.cos(ang), sa = Math.sin(ang), len = 6+2*stage;
      const x0 = p.x, z0 = p.z, x1 = x0+ca*len, z1 = z0+sa*len, dmg = sweepHit(world, p)*(.8+.2*rank)*(1+.5*stage);
      let hits = 0;
      for(const e of hostiles(world)) if(segGap(e.x, e.z, x0, z0, x1, z1) < .9+bodyOf(e)*.6){hurt(world, e, dmg, p.id); hits++;}
      cutShots(world, shot => segGap(shot.x, shot.z, x0, z0, x1, z1) < 1.2);
      if(!R(p, 'coiled-dragon')){p.gdStage = 0; p.gdAt = -99;}
      if(stage >= 3 && R(p, 'ascending')) wakeDragon(world, p, 1.5);
      p.dx = ca; p.dz = sa;
      pose(world, p, .35, PACK);
      world.event('genwave', round(x0), round(z0), '', {player: p.id, itemId: PACK, angle: round(ang), len, stage, hits});
      return true;
    }},
  stance: {name: 'Mountain Stance', glyph: '⏶', cost: 25, cooldown: () => 16, text: 'For a while the line holds every way, and steps up each sweep.',
    cast(world, p, rank){
      stateOf(p).stanceUntil = round(world.time+4+2*rank);
      pose(world, p, .3);
      world.event('genstance', p.x, p.z, '', {player: p.id, itemId: PACK, secs: 4+2*rank});
      return true;
    }},
  hook: {name: 'Reaping Hook', glyph: '⤾', cost: 20, cooldown: () => 9, text: 'Drag a wide arc of foes to the tip of your next sweep.',
    cast(world, p, rank){
      const tipR = Math.max(1.6, nextReach(world, p)-.6), reach = tipR+2.2, [dx, dz] = aim(world, p, reach), face = Math.atan2(dz, dx);
      const foes = hostiles(world).filter(e => dist(e, p) <= reach+bodyOf(e)*.5 && dist(e, p) > .2 && Math.abs(angleDelta(Math.atan2(e.z-p.z, e.x-p.x), face)) <= 80*Math.PI/180)
        .sort((a, c) => dist(a, p)-dist(c, p)).slice(0, 14);
      if(!foes.length) return 'Nothing in reach of the hook';
      const s = stateOf(p), held = .6+.1*rank+.4*R(p, 'guardian'), D = sweepHit(world, p), threads = [];
      s.pulls = [];
      for(const e of foes){
        const a = Math.atan2(e.z-p.z, e.x-p.x), want = bossy(e) ? (dist(e, p)+tipR)/2 : tipR;
        let tx = p.x+Math.cos(a)*want, tz = p.z+Math.sin(a)*want;
        if(!world.walkable(tx, tz)){tx = e.x; tz = e.z;}
        stun(e, held+.3);
        if(R(p, 'guardian')) hurt(world, e, D*.6*R(p, 'guardian'), p.id);
        s.pulls.push({id: e.id, tx: round(tx), tz: round(tz), t: 0});
        threads.push([round(e.x), round(e.z), round(tx), round(tz)]);
      }
      // The hook keeps the line: what it drags in waits for the next sweep along the same way.
      if(lineLive(world, p)) p.gdAt = round(world.time);
      pose(world, p, .4, PACK);
      world.event('genhook', p.x, p.z, '', {player: p.id, itemId: PACK, threads, r: round(tipR), angle: round(face)});
      return true;
    }},
  whirl: {name: 'Whirling Crescent', glyph: '○', cost: 15, cooldown: () => 5, text: 'A full circle at the next reach; the line steps up.',
    cast(world, p, rank){
      const stage = Math.min(3, lineLive(world, p) ? (p.gdStage || 0)+1 : 1), ang = lineLive(world, p) ? p.gdAng : Math.atan2(p.dz || 1, p.dx || 0);
      sweepAt(world, p, {ang, stage, arc: 360, share: 1+.15*rank, keepAngle: true});
      pose(world, p, .35, PACK);
      return true;
    }},
  roar: {name: "Dragon's Roar", glyph: '◬', cost: 15, cooldown: () => 10, text: 'Stun a cone of foes and drop their shots.',
    cast(world, p, rank){
      const reach = nextReach(world, p)+1, [dx, dz] = aim(world, p, reach), face = Math.atan2(dz, dx), D = sweepHit(world, p);
      const inCone = (x, z, pad = 0) => Math.hypot(x-p.x, z-p.z) <= reach+pad && Math.abs(angleDelta(Math.atan2(z-p.z, x-p.x), face)) <= Math.PI/3;
      let hits = 0;
      for(const e of hostiles(world)) if(inCone(e.x, e.z, bodyOf(e)*.5)){stun(e, .8+.2*rank); hurt(world, e, D*.6, p.id); hits++;}
      const shots = cutShots(world, shot => inCone(shot.x, shot.z));
      pose(world, p, .4);
      world.event('genroar', p.x, p.z, '', {player: p.id, itemId: PACK, angle: round(face), r: round(reach), hits, shots});
      return true;
    }},
  pearl: {name: 'Dragon Pearl', glyph: '◉', cost: 25, cooldown: () => 12, text: 'A pearl hangs at your mark until a sweep reaches it.',
    cast(world, p, rank){
      const at = mark(world, p, 9, 5);
      stateOf(p).pearl = {x: at.x, z: at.z, until: round(world.time+4), rank, at: round(world.time), sx: round(p.x), sz: round(p.z)};
      pose(world, p, .35);
      world.event('genpearl', at.x, at.z, '', {player: p.id, itemId: PACK, sx: round(p.x), sz: round(p.z)});
      return true;
    }},
};
const ULTIMATE = {name: 'Green Dragon Unbound', glyph: '✦', cost: 50, level: GENERAL.ultLevel, cooldown: p => 30-5*R(p, 'patience'),
  text: 'The dragon wakes in the blade: every sweep at its longest, echoing twice. When it leaves, it rushes along your last cut through everything.',
  cast(world, p){
    const secs = DRAGON.secs+R(p, 'patience'), s = stateOf(p);
    wakeDragon(world, p, secs);
    s.rushAt = round(world.time+secs); s.rushDmg = round(sweepHit(world, p)*5.5);
    pose(world, p, .6);
    p.skillCast = {itemId: PACK, at: world.time, x: p.x, z: p.z, dx: p.dx, dz: p.dz, rank: 5, id: world.nextId('cast')};
    world.event('fx', p.x, p.z, '', {fx: 'dragonwake', itemId: PACK, player: p.id, secs});
    return true;
  }};

// ------------------------------------------------------------------ what the blade's sweeps feed
GD_HOOKS.sweep.push((world, p, {sweep, hits, parried}) => {
  if(!isGeneral(p)) return;
  if(hits) gain(world, p, GENERAL.qiSweep+GENERAL.qiStage*Math.min(3, sweep.stage), gainMult(p));
  if(parried){
    const turned = R(p, 'deflect');
    gain(world, p, (GENERAL.qiParry+3*turned)*parried, gainMult(p));
    if(turned) p.hp = Math.min(maxHealth(p), p.hp+maxHealth(p)*.01*turned*parried);
  }
  const scales = R(p, 'jade-scales');
  if(scales && hits && sweep.stage >= 3) p.hp = Math.min(maxHealth(p), p.hp+maxHealth(p)*.01*scales);
  // The pearl bursts when a crescent reaches it.
  const s = stateOf(p), pearl = s.pearl;
  if(pearl && inCrescent(sweep, pearl.x, pearl.z, .6)){
    const stage = Math.min(3, sweep.stage), dmg = sweepHit(world, p)*1.5*(.8+.2*pearl.rank)*(1+.5*stage);
    let n = 0;
    for(const e of hostiles(world)) if(Math.hypot(e.x-pearl.x, e.z-pearl.z) < 2.5+bodyOf(e)*.4){hurt(world, e, dmg, p.id); stun(e, .5); n++;}
    s.pearl = null;
    world.event('genpearlburst', pearl.x, pearl.z, '', {player: p.id, itemId: PACK, r: 2.5, stage, hits: n});
  }
});

// ------------------------------------------------------------------ every tick
export function gdMods(world, p){
  const s = stateOf(p), stance = (s.stanceUntil || 0) > world.time, grip = R(p, 'iron-grip'), echo = R(p, 'echo-edge');
  return {
    damage: round(1+.08*R(p, 'heavy-edge')), reach: round(.3*R(p, 'long-haft')),
    window: round(.8*R(p, 'steady-hands')), hold: 15*R(p, 'steady-hands'),
    echoAt: echo ? 2 : 3, echoShare: echo >= 2 ? .8 : .6, echoAll: stance && !!R(p, 'mountain-heart'), stance,
    tipW: round(GENERAL.tip.w+.4*grip), tipB: round(GENERAL.tip.b+.1*grip), top: round(1+.15*R(p, 'unbroken')),
  };
}
function sync(world, p){
  const mods = gdMods(world, p);
  if(JSON.stringify(mods) !== JSON.stringify(p.gdMods)) p.gdMods = mods;
  (p.ranks ||= {})[PACK] = rankByLevel(p);
}
function step(world, p, dt){
  sync(world, p);
  fadeResource(world, p, dt);
  const s = stateOf(p), obstacles = world.frameObstacles || world.obstacles();
  if(s.dash) stepLunge(world, p, s, dt, obstacles);
  if(s.pulls?.length) for(let i = s.pulls.length-1; i >= 0; i--){
    const pull = s.pulls[i], e = world.enemies.find(q => q.id === pull.id && q.hp > 0);
    pull.t = round(pull.t+dt);
    if(!e || drag(world, e, pull.tx, pull.tz, 20, dt, obstacles) || pull.t >= .4) s.pulls.splice(i, 1);
  }
  if(s.pearl && world.time >= s.pearl.until){world.event('genpearlfade', s.pearl.x, s.pearl.z, '', {player: p.id, itemId: PACK}); s.pearl = null;}
  if(s.stanceUntil && s.stanceUntil <= world.time) s.stanceUntil = 0;
  if(s.rushAt && world.time >= s.rushAt){
    const rush = dragonRush(world, p, s.rushDmg || sweepHit(world, p)*5.5);
    s.rushAt = 0;
    world.event('fx', p.x, p.z, '', {fx: 'dragonrush', itemId: PACK, player: p.id, ...rush});
  }
}
/** Dragon Lunge: the charge, a few substeps a tick; at its end the line steps up along it. */
function stepLunge(world, p, s, dt, obstacles){
  const st = s.dash;
  if(p.down || p.ghost){s.dash = null; return;}
  const speed = st.len/st.dur, len = Math.min(speed*dt, Math.max(0, st.len-st.done)), x0 = p.x, z0 = p.z;
  for(let i = 0; i < 3; i++) world.move(p, st.dx*len/dt, st.dz*len/dt, dt/3, obstacles);
  st.done = round(st.done+len);
  p.iframes = Math.max(p.iframes || 0, .2); p.action = 'attack'; p.actionUntil = world.time+.2;
  p.dx = st.dx; p.dz = st.dz; p.aimUntil = world.time+.3;
  for(const e of hostiles(world)){
    if(st.hit.includes(e.id) || segGap(e.x, e.z, x0, z0, p.x, p.z) > 1+bodyOf(e)*.5) continue;
    st.hit.push(e.id); hurt(world, e, st.dmg, p.id);
  }
  if(st.done >= st.len-1e-6 || Math.hypot(p.x-x0, p.z-z0) < len*.2){
    s.dash = null;
    stepLine(world, p, Math.atan2(st.dz, st.dx));
    if(st.hit.length) gain(world, p, 6, gainMult(p));
    world.event('genlunge', p.x, p.z, '', {player: p.id, itemId: PACK, x0: st.x0, z0: st.z0, dx: st.dx, dz: st.dz, end: 1, hits: st.hit.length, stage: p.gdStage});
  }
}

export const GENERAL_CLASS = registerClass({
  id: 'general', name: 'Green Dragon General', weapon: PACK, role: 'Melee · reach · control',
  blurb: 'A general of Yomi with a dragon in his blade. Hold your line and the haft runs out to twice its length; drag the swarm onto the tip, then send the edge flying down the line.',
  resource: {id: 'qi', name: 'Qi', max: 100, color: '#4fd09a'},
  traits: [
    {name: 'Hold the Line', text: 'Your attack: a crescent sweep. Cut again the same way, soon enough, and the reach grows three steps (3 to 6.3), harder each time; turn and it shortens. At full reach the edge echoes. The edge cuts shots out of the air.'},
    {name: 'The Tip', text: `Foes at the very edge of a sweep (its outer ${GENERAL.tip.w} units) take ${pct(GENERAL.tip.b)} more.`},
    {name: 'Qi', text: `Sweeps that land build Qi (+${GENERAL.qiSweep}, +${GENERAL.qiStage} a step), and so does every shot you cut down; skills spend it. It fades when you stop fighting.`},
  ],
  trees: [
    {id: 'line', name: 'Qinglong', sub: 'the Line', blurb: 'Reach further, hold longer, and spend the line in one flying edge.'},
    {id: 'mountain', name: 'Shan', sub: 'the Mountain', blurb: 'Stand your ground: turn freely, hook the swarm onto your tip.'},
    {id: 'dragon', name: 'Long', sub: 'the Dragon', blurb: 'The dragon in the blade: roar, pearl, and its waking.'},
  ],
  nodes: NODES, skills: SKILLS, ultimate: ULTIMATE,
  busy: (world, p) => !!p.general?.dash,
  sync, step,
  clear(world, p){p.general = {}; p.gdMods = null; p.gdDragon = 0; p.ki = 0;},
  /** For the class painter (src/fx/general.mjs). */
  view: (world, p) => ({stance: (p.general?.stanceUntil || 0) > world.time, pearl: p.general?.pearl || null}),
});
