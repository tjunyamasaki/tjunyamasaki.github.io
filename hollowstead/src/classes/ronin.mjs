// The Kagekiri Ronin: a class built on Kagekiri, the shrine blade of Yomi (src/magic/katana.mjs).
//
// One idea runs through the whole kit: the cut that hangs in the air. The basic attack is Kagekiri's iai
// draw (three draws make a set, the third sheathes and every hanging cut snaps shut on whatever stands in
// it). Every skill does one of four things to those cuts:
//   LAY them    Crossing Cut (an X), Shadow Step (your dash path), Falling Blossom (a closed hexagon),
//               Shadow Echo (each draw gets a twin across it), Afterimage (your dodge);
//   MOVE foes   Shadow Lure drags everything near onto your nearest cut and holds it there;
//   SNAP them   Swift Sheath snaps every cut now, harder for the Ki it spends; Swallow Return re-draws them;
//   FEED on it  Ki comes from draws that land and from snaps; crossings burst (Crux); petals, bleeds, haste.
// Where two cuts cross, the snap bursts there too (Crux): the X of a Crossing Cut, the corners of a Falling
// Blossom, an echoed draw, two draws made while you moved. The combos are spatial: lay lines where the foes
// will be, drag the foes onto the lines, then close them all at once.
//
// Rules only (host). Per-wanderer state lives on the player as plain data (`p.ki`, `p.ronin`, `p.kataMods`),
// so it replicates and saves like the rest of them. Looks: src/fx/ronin.mjs (and the katana's own painters
// for every cut). Tree and skill-bar rules: src/classes/registry.mjs.
import {DRAW_TOTAL, IAI, KATA_HOOKS, cutGap, hangingCuts, hundredLine, layCut, snapCuts} from '../magic/katana.mjs?v=harvest-18';
import {isMagicAlly, ownerPower} from '../magic/registry.mjs?v=harvest-18';
import {applyDot, stun} from '../arsenal.mjs?v=harvest-18';
import {registerClass, talentRank} from './registry.mjs?v=harvest-18';

const PACK = 'katana';
const TAU = Math.PI*2;
const round = n => Math.round(n*100)/100;

export const RONIN = Object.freeze({
  kiMax: 100,
  kiDraw: 5,          // a draw that lands
  kiSnapFoe: 2,       // each foe a snap cuts...
  kiSnapCap: 16,      // ...up to this much per snap
  kiIdle: 5,          // seconds without gaining Ki before it starts to fade
  kiDecay: 6,         // Ki lost per second once it fades
  crux: {dmg: .8, r: 1.3, max: 10, merge: .6, perFoe: 2},
  ultLevel: 6,
  rankEvery: 6,       // the blade's rank (★, its flourish and a little damage) grows every six levels
});

// ------------------------------------------------------------------ shared helpers
const R = (p, id) => talentRank(p, id);
const stateOf = p => (p.ronin && typeof p.ronin === 'object') ? p.ronin : (p.ronin = {});
const isRonin = p => p?.classId === 'ronin';
const hostiles = world => {
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.hp > 0 && !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
};
const bodyOf = e => e.type === 'king' || e.boss ? 1.3 : e.type === 'golem' || e.type === 'brute' ? 1 : .55;
const bossy = e => e.type === 'king' || e.boss || e.type === 'golem';
function hurt(world, e, amount, ownerId){
  if(!(amount > 0)) return;
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId});
  e.lastHitBy = ownerId; if(e.home && !e.aggro) e.aggro = true;
}
/** The ronin's hit: Kagekiri's draw at the wanderer's power, sharpened by Keen Edge. Skills are multiples of it. */
export const roninHit = (world, p) => IAI.damage*ownerPower(world, p)*(1+.08*R(p, 'keen-edge'));
function gainKi(world, p, n){
  if(!(n > 0)) return;
  p.ki = Math.min(RONIN.kiMax, round((p.ki || 0)+n));
  stateOf(p).kiAt = world.time;
}
/** Face the best foe within reach (or keep facing), unit direction. */
function aim(world, p, reach){
  world.autoAim?.(p, {reach, range: reach});
  const l = Math.hypot(p.dx || 0, p.dz || 0);
  if(l > 1e-6){p.dx /= l; p.dz /= l;} else {p.dx = 0; p.dz = 1;}
  return [p.dx, p.dz];
}
/** Strike a drawing pose: the arm rig's iai draw follows the replicated cast stamp. */
function pose(world, p, secs, draw = true){
  p.rest = false; p.goal = null;
  p.action = 'attack'; p.actionUntil = world.time+secs; p.aimUntil = world.time+secs;
  p.cooldown = Math.max(p.cooldown || 0, Math.min(.3, secs));
  if(draw) p.magicCast = {itemId: PACK, at: world.time, x: p.x, z: p.z, dx: p.dx, dz: p.dz};
}
const mid = c => [(c.x0+c.x1)/2, (c.z0+c.z1)/2];
/** The point of cut `c` nearest to (x, z). */
function nearestOn(c, x, z){
  const sx = c.x1-c.x0, sz = c.z1-c.z0, l2 = sx*sx+sz*sz || 1e-9;
  const t = Math.max(.05, Math.min(.95, ((x-c.x0)*sx+(z-c.z0)*sz)/l2));
  return [c.x0+sx*t, c.z0+sz*t];
}
/** Where two cuts cross (a Crux), or null. A small overlap past the ends counts, so a closed shape's corners do. */
function crossing(a, b, slack = .05){
  const rx = a.x1-a.x0, rz = a.z1-a.z0, sx = b.x1-b.x0, sz = b.z1-b.z0, d = rx*sz-rz*sx;
  if(Math.abs(d) < 1e-6) return null;
  const qx = b.x0-a.x0, qz = b.z0-a.z0, t = (qx*sz-qz*sx)/d, u = (qx*rz-qz*rx)/d;
  if(t < -slack || t > 1+slack || u < -slack || u > 1+slack) return null;
  return [a.x0+rx*t, a.z0+rz*t];
}
export function cruxPoints(cuts){
  const pts = [];
  for(let i = 0; i < cuts.length && pts.length < RONIN.crux.max; i++) for(let j = i+1; j < cuts.length && pts.length < RONIN.crux.max; j++){
    const at = crossing(cuts[i], cuts[j]);
    if(at && !pts.some(([x, z]) => Math.hypot(x-at[0], z-at[1]) < RONIN.crux.merge)) pts.push([round(at[0]), round(at[1])]);
  }
  return pts;
}

// ------------------------------------------------------------------ the tree
// Three branches: Iai (lay more and better cuts), Kage (move yourself and drag them), Sakura (the sheath:
// finishers and what a snap leaves behind). Tiers open every three points spent in a branch.
const pct = n => `${Math.round(n*100)}%`;
const NODES = {
  // ---- Iai · the Draw
  'keen-edge': {tree: 'iai', tier: 0, col: 0, kind: 'passive', max: 3, name: 'Keen Edge', glyph: '⟋',
    text: r => `Every cut you make (draws and skills) hits ${pct(.08*r)} harder.`},
  kesagiri: {tree: 'iai', tier: 0, col: 2, kind: 'skill', max: 3, name: 'Crossing Cut', glyph: '✕',
    text: r => `Two long cuts in an X before you, ${(.75+.25*r).toFixed(2)}× a draw each. They hang, and where they cross a snap bursts (Crux). ${(5+.5*r).toFixed(1)} long.`},
  'swift-draw': {tree: 'iai', tier: 1, col: 0, kind: 'passive', max: 3, name: 'Swift Draw', glyph: '⤳',
    text: r => `Draws recover ${pct(.06*r)} faster.`},
  lingering: {tree: 'iai', tier: 1, col: 2, kind: 'passive', max: 2, name: 'Lingering Edge', glyph: '≈',
    text: r => `Cuts hang ${(1.5*r).toFixed(1)}s longer, and you can keep ${2*r} more at once.`},
  tsubame: {tree: 'iai', tier: 2, col: 1, kind: 'skill', max: 3, req: 'kesagiri', name: 'Swallow Return', glyph: '↺',
    text: r => `The blade returns along every cut you have hanging near you: each strikes again (${(.55+.15*r).toFixed(2)}× a draw) and hangs anew.`},
  'long-reach': {tree: 'iai', tier: 2, col: 2, kind: 'passive', max: 2, name: 'Long Reach', glyph: '⟷',
    text: r => `Draws reach ${(.5*r).toFixed(1)} further.`},
  'ichi-no-tachi': {tree: 'iai', tier: 3, col: 0, kind: 'passive', max: 2, name: 'First Sword', glyph: '⚊',
    text: r => `The third draw of every set reaches ${(1.2*r).toFixed(1)} further and hits ${pct(.25*r)} harder.`},
  mugen: {tree: 'iai', tier: 4, col: 1, kind: 'capstone', max: 1, req: 'tsubame', name: 'Endless Line', glyph: '∞',
    text: () => 'Your cuts no longer fade on their own: they wait for the sheath. You can keep four more at once.'},
  // ---- Kage · the Shadow
  'kage-fumi': {tree: 'kage', tier: 0, col: 0, kind: 'skill', max: 3, name: 'Shadow Step', glyph: '➶',
    text: r => `Dash ${(5+.75*(r-1)).toFixed(1)} along your aim, untouchable, cutting all you pass (${(1+.2*r).toFixed(1)}× a draw). Your path stays behind as a hanging cut.`},
  afterimage: {tree: 'kage', tier: 0, col: 2, kind: 'passive', max: 2, name: 'Afterimage', glyph: '⇢',
    text: r => r >= 2 ? 'Your dodge leaves a hanging cut along its path, and the cut strikes as it is laid (0.6× a draw).' : 'Your dodge leaves a hanging cut along its path.'},
  hikiyose: {tree: 'kage', tier: 1, col: 1, kind: 'skill', max: 3, name: 'Shadow Lure', glyph: '⥂',
    text: r => `Shadow threads snatch every foe within ${(6.5+r).toFixed(1)} and drag each onto your nearest hanging cut (or before you), holding it there. Great foes come half as far.`},
  'razor-air': {tree: 'kage', tier: 1, col: 2, kind: 'passive', max: 3, name: 'Razor Air', glyph: '⁙',
    text: r => `Foes standing in your hanging cuts are cut for ${(.12*r).toFixed(2)}× a draw every half second.`},
  utsushi: {tree: 'kage', tier: 2, col: 0, kind: 'skill', max: 2, req: 'kage-fumi', name: 'Shadow Echo', glyph: '⧉',
    text: r => `For ${3+2*r}s your shadow draws with you: every draw lays a twin straight across it (0.6× a draw), so every draw makes a Crux.`},
  'quick-shadow': {tree: 'kage', tier: 2, col: 2, kind: 'passive', max: 2, name: 'Quick Shadow', glyph: '⧗',
    text: r => `Shadow Step and Shadow Lure recharge ${pct(.15*r)} faster.`},
  'kage-nui': {tree: 'kage', tier: 3, col: 1, kind: 'passive', max: 2, req: 'hikiyose', name: 'Shadow Stitch', glyph: '⌇',
    text: r => `Lured foes are held ${(.5*r).toFixed(1)}s longer and are cut as they land (${(.35*r).toFixed(2)}× a draw).`},
  yamigaeri: {tree: 'kage', tier: 4, col: 0, kind: 'capstone', max: 1, req: 'utsushi', name: 'Return from Darkness', glyph: '☾',
    text: () => 'A snap that closes five or more cuts at once makes Shadow Step ready again and leaves you untouchable for a moment.'},
  // ---- Sakura · the Sheath
  'sharp-sheath': {tree: 'sakura', tier: 0, col: 0, kind: 'passive', max: 3, name: 'Biting Sheath', glyph: '⌒',
    text: r => `Snapping cuts hit ${pct(.12*r)} harder.`},
  noto: {tree: 'sakura', tier: 0, col: 2, kind: 'skill', max: 3, name: 'Swift Sheath', glyph: '⏚',
    text: r => `Sheathe at once: every hanging cut snaps now, +${pct(.01*(.75+.25*r))} damage for each point of Ki, and all your Ki is spent (needs 15). Starts a new set.`},
  hanafubuki: {tree: 'sakura', tier: 1, col: 0, kind: 'passive', max: 2, name: 'Petal Wounds', glyph: '✿',
    text: r => `Every foe a snap cuts bleeds for ${(.2*r).toFixed(1)}× a draw each second, for 3s.`},
  'ki-bloom': {tree: 'sakura', tier: 1, col: 2, kind: 'passive', max: 2, name: 'Ki Bloom', glyph: '✺',
    text: r => `Snaps give ${r} more Ki for each foe they cut, and every Crux gives ${4*r} Ki.`},
  chirizakura: {tree: 'sakura', tier: 2, col: 1, kind: 'skill', max: 3, req: 'noto', name: 'Falling Blossom', glyph: '⬡',
    text: r => `Six cuts close a ring round your mark (${(.45+.15*r).toFixed(2)}× a draw each); all inside are slowed. Six corners: six Crux.`},
  'crux-bloom': {tree: 'sakura', tier: 2, col: 2, kind: 'passive', max: 2, name: 'Crux Bloom', glyph: '✣',
    text: r => `Crux bursts hit ${pct(.4*r)} harder and wider${r >= 2 ? ', and stun' : ''}.`},
  zanshin: {tree: 'sakura', tier: 3, col: 0, kind: 'passive', max: 2, name: 'Zanshin', glyph: '◌',
    text: r => `After a snap that cuts three or more foes, your draws are ${pct(.25*r)} faster for 3s.`},
  senbonzakura: {tree: 'sakura', tier: 4, col: 1, kind: 'capstone', max: 1, req: 'chirizakura', name: 'Thousand Petals', glyph: '❀',
    text: () => 'Every cut a snap closes looses a blade of petals at the nearest foe (0.5× a draw).'},
};

// ------------------------------------------------------------------ active skills
const SKILLS = {
  kesagiri: {name: 'Crossing Cut', glyph: '✕', cost: 0, cooldown: () => 7, text: 'Lay an X of two hanging cuts before you.',
    cast(world, p, rank){
      const [dx, dz] = aim(world, p, 6), D = roninHit(world, p);
      const L = 5+.5*rank, cx = p.x+dx*2.4, cz = p.z+dz*2.4, base = Math.atan2(dz, dx);
      let hits = 0;
      for(const [i, s] of [[0, -1], [1, 1]]){
        const a = base+s*Math.PI/4, ux = Math.cos(a)*L/2, uz = Math.sin(a)*L/2;
        hits += layCut(world, p, cx-ux, cz-uz, cx+ux, cz+uz, {damage: D*(.75+.25*rank), n: i, tag: 'kesa'})?.hits || 0;
      }
      if(hits) gainKi(world, p, 8);
      pose(world, p, .35);
      world.event('roninkesa', round(cx), round(cz), '', {player: p.id, itemId: PACK, dx: round(dx), dz: round(dz), len: L});
      return true;
    }},
  tsubame: {name: 'Swallow Return', glyph: '↺', cost: 25, cooldown: () => 8, text: 'Re-draw every hanging cut near you.',
    cast(world, p, rank){
      const near = hangingCuts(world, p).filter(c => {const [mx, mz] = mid(c); return Math.hypot(mx-p.x, mz-p.z) <= 8;}).slice(-12);
      if(!near.length) return 'No hanging cuts to return along';
      const D = roninHit(world, p), M = p.kataMods || {}, taken = new Map(), lines = [];
      for(const c of near){
        for(const e of hostiles(world)){
          if(cutGap(e, c) > IAI.width+bodyOf(e)*.5 || (taken.get(e.id) || 0) >= 3) continue;
          taken.set(e.id, (taken.get(e.id) || 0)+1); hurt(world, e, D*(.55+.15*rank), p.id);
        }
        const left = (c.life || 0)-(c.age || 0);
        c.age = 0; c.life = round(Math.max(left, IAI.hang+(M.hang || 0)));
        lines.push([c.x0, c.z0, c.x1, c.z1]);
      }
      pose(world, p, .4);
      world.event('roninreturn', p.x, p.z, '', {player: p.id, itemId: PACK, lines, hits: taken.size});
      return true;
    }},
  'kage-fumi': {name: 'Shadow Step', glyph: '➶', cost: 0, cooldown: p => round(7*(1-.15*R(p, 'quick-shadow'))), text: 'Dash through foes; the path hangs as a cut.',
    cast(world, p, rank){
      const [dx, dz] = aim(world, p, 7.5), s = stateOf(p);
      s.step = {x0: round(p.x), z0: round(p.z), dx: round(dx), dz: round(dz), len: round(5+.75*(rank-1)), done: 0, dur: .2, dmg: round(roninHit(world, p)*(1+.2*rank)), hit: []};
      p.iframes = Math.max(p.iframes || 0, .35); p.goal = null;
      pose(world, p, .3, false);
      world.event('roninstep', p.x, p.z, '', {player: p.id, itemId: PACK, dx: round(dx), dz: round(dz), start: 1});
      return true;
    }},
  hikiyose: {name: 'Shadow Lure', glyph: '⥂', cost: 20, cooldown: p => round(11*(1-.15*R(p, 'quick-shadow'))), text: 'Drag nearby foes onto your hanging cuts.',
    cast(world, p, rank){
      const reach = 6.5+rank, foes = hostiles(world).filter(e => Math.hypot(e.x-p.x, e.z-p.z) <= reach)
        .sort((a, c) => Math.hypot(a.x-p.x, a.z-p.z)-Math.hypot(c.x-p.x, c.z-p.z)).slice(0, 12);
      if(!foes.length) return 'Nothing near enough to lure';
      const cuts = hangingCuts(world, p), [dx, dz] = aim(world, p, reach), s = stateOf(p);
      const hold = 1.2+.5*R(p, 'kage-nui'), threads = [];
      s.pulls = [];
      foes.forEach((e, i) => {
        let tx, tz;
        if(cuts.length){
          let best = null, gapBest = Infinity;
          for(const c of cuts){const g = cutGap(e, c); if(g < gapBest){gapBest = g; best = c;}}
          [tx, tz] = nearestOn(best, e.x, e.z);
        }else{
          const a = Math.atan2(dz, dx)+((i%5)-2)*.35, r = 2.2+Math.floor(i/5)*.7;
          tx = p.x+Math.cos(a)*r; tz = p.z+Math.sin(a)*r;
        }
        if(bossy(e)){tx = (e.x+tx)/2; tz = (e.z+tz)/2;}
        if(!world.walkable(tx, tz)){const land = world.landNear?.(tx, tz, 3); if(land){tx = land.x; tz = land.z;} else {tx = e.x; tz = e.z;}}
        e.magicRootRemaining = Math.max(e.magicRootRemaining || 0, hold+.35);
        e.windup = 0;
        s.pulls.push({id: e.id, tx: round(tx), tz: round(tz), t: 0});
        threads.push([round(e.x), round(e.z), round(tx), round(tz)]);
      });
      pose(world, p, .45, false);
      world.event('roninlure', p.x, p.z, '', {player: p.id, itemId: PACK, threads});
      return true;
    }},
  utsushi: {name: 'Shadow Echo', glyph: '⧉', cost: 35, cooldown: () => 20, text: 'For a while every draw lays a twin across it.',
    cast(world, p, rank){
      stateOf(p).echoUntil = round(world.time+3+2*rank);
      pose(world, p, .3, false);
      world.event('roninecho', p.x, p.z, '', {player: p.id, itemId: PACK, secs: 3+2*rank});
      return true;
    }},
  noto: {name: 'Swift Sheath', glyph: '⏚', cost: 15, spendAll: true, cooldown: () => 5, text: 'Snap every hanging cut now; spends all Ki.',
    cast(world, p, rank){
      const cuts = hangingCuts(world, p);
      if(!cuts.length) return 'No cuts to sheathe';
      const ki = p.ki || 0, bonus = 1+ki*.01*(.75+.25*rank);
      pose(world, p, .3, false);
      world.event('roninsheath', p.x, p.z, '', {player: p.id, itemId: PACK, ki: Math.round(ki), n: cuts.length, dx: round(p.dx || 0), dz: round(p.dz || 1)});
      snapCuts(world, p, bonus);
      return true;
    }},
  chirizakura: {name: 'Falling Blossom', glyph: '⬡', cost: 20, cooldown: () => 10, text: 'Close a ring of six cuts round your mark.',
    cast(world, p, rank){
      const [dx, dz] = aim(world, p, 9), locked = hostiles(world).find(e => e.id === p.lockId && Math.hypot(e.x-p.x, e.z-p.z) <= 9);
      let x = locked ? locked.x : p.x+dx*4, z = locked ? locked.z : p.z+dz*4;
      const lim = (world.radius || 60)-3, rr = Math.hypot(x, z);
      if(world.arena && rr > lim){x *= lim/rr; z *= lim/rr;}
      const r = 2.6, turn = Math.atan2(dz, dx), D = roninHit(world, p), corners = [];
      for(let i = 0; i < 6; i++){const a = turn+i*TAU/6; corners.push([x+Math.cos(a)*r, z+Math.sin(a)*r]);}
      for(let i = 0; i < 6; i++){
        // Each side runs a little past its corners, so neighbouring sides cross there.
        const [ax, az] = corners[i], [bx, bz] = corners[(i+1)%6], ex = (bx-ax)*.12, ez = (bz-az)*.12;
        layCut(world, p, ax-ex, az-ez, bx+ex, bz+ez, {damage: D*(.45+.15*rank), n: i, tag: 'blossom', flash: i === 0});
      }
      for(const e of hostiles(world)) if(Math.hypot(e.x-x, e.z-z) <= r+.4) e.slowed = Math.max(e.slowed || 0, 2);
      pose(world, p, .4);
      world.event('roninblossom', round(x), round(z), '', {player: p.id, itemId: PACK, r, turn: round(turn)});
      return true;
    }},
};
const ULTIMATE = {name: 'Hundred-Line Draw', glyph: '✦', cost: 50, level: RONIN.ultLevel, cooldown: () => 30,
  text: 'You vanish. Ten long cuts flash across every foe around you; you step out and sheathe, and every cut snaps at once.',
  cast(world, p){
    const D = roninHit(world, p);
    if(!hundredLine(world, p, {cut: D*1.1, snap: D*2.6})) return 'Draw the blade first';
    p.rest = false; p.goal = null; p.action = 'attack'; p.actionUntil = world.time+DRAW_TOTAL; p.aimUntil = world.time+DRAW_TOTAL;
    p.cooldown = Math.max(p.cooldown || 0, DRAW_TOTAL+.1);
    p.skillCast = {itemId: PACK, at: world.time, x: p.x, z: p.z, dx: p.dx, dz: p.dz, rank: 5, id: world.nextId('cast')};
    return true;
  }};

// ------------------------------------------------------------------ what the blade's draws and snaps feed
KATA_HOOKS.draw.push((world, p, {cut, hits}) => {
  if(!isRonin(p)) return;
  if(hits > 0) gainKi(world, p, RONIN.kiDraw);
  // Shadow Echo: a twin straight across the draw, through its middle.
  const s = stateOf(p);
  if((s.echoUntil || 0) > world.time && cut){
    const [mx, mz] = mid(cut), lx = cut.x1-cut.x0, lz = cut.z1-cut.z0, h = .5;
    layCut(world, p, mx+lz*h, mz-lx*h, mx-lz*h, mz+lx*h, {damage: roninHit(world, p)*.6, n: cut.n, tag: 'echo'});
  }
});
KATA_HOOKS.snap.push((world, p, {cuts, taken}) => {
  if(!isRonin(p)) return;
  const D = roninHit(world, p), byId = new Map(hostiles(world).map(e => [e.id, e]));
  // Crux: every crossing of two cuts that closed together bursts.
  const pts = cruxPoints(cuts), bloom = R(p, 'crux-bloom');
  if(pts.length){
    const r = RONIN.crux.r*(1+.2*bloom), dmg = D*RONIN.crux.dmg*(1+.4*bloom), count = new Map();
    for(const [x, z] of pts) for(const e of byId.values()){
      if(Math.hypot(e.x-x, e.z-z) > r+bodyOf(e)*.4 || (count.get(e.id) || 0) >= RONIN.crux.perFoe) continue;
      count.set(e.id, (count.get(e.id) || 0)+1); hurt(world, e, dmg, p.id);
      if(bloom >= 2) stun(e, .6);
    }
    gainKi(world, p, 4*R(p, 'ki-bloom')*pts.length);
    world.event('ronincrux', round(pts[0][0]), round(pts[0][1]), '', {player: p.id, itemId: PACK, pts, r: round(r), hits: count.size});
  }
  gainKi(world, p, Math.min(RONIN.kiSnapCap+4*R(p, 'ki-bloom'), (RONIN.kiSnapFoe+R(p, 'ki-bloom'))*taken.size));
  // Petal Wounds: what the snap cut bleeds.
  const wounds = R(p, 'hanafubuki');
  if(wounds) for(const id of taken.keys()){const e = byId.get(id); if(e) applyDot(e, round(D*.2*wounds), 3, p.id, 'bleed');}
  const s = stateOf(p);
  // Zanshin: a wide snap quickens the next draws.
  if(R(p, 'zanshin') && taken.size >= 3) s.hasteUntil = round(world.time+3);
  // Return from Darkness: a great snap readies the Shadow Step.
  if(R(p, 'yamigaeri') && cuts.length >= 5){
    if(p.classCd) delete p.classCd['kage-fumi'];
    p.iframes = Math.max(p.iframes || 0, .6);
    world.event('roninreturned', p.x, p.z, '', {player: p.id, itemId: PACK});
  }
  // Thousand Petals: a blade of petals from every closed cut at the nearest foe.
  if(R(p, 'senbonzakura')){
    const lines = [];
    for(const c of cuts.slice(-10)){
      const [mx, mz] = mid(c);
      let best = null, bestD = 7;
      for(const e of byId.values()){const d = Math.hypot(e.x-mx, e.z-mz); if(d < bestD){bestD = d; best = e;}}
      if(!best) continue;
      hurt(world, best, D*.5, p.id);
      lines.push([round(mx), round(mz), round(best.x), round(best.z)]);
    }
    if(lines.length) world.event('roninpetals', p.x, p.z, '', {player: p.id, itemId: PACK, lines});
  }
});

// ------------------------------------------------------------------ every tick
/** Kagekiri's own numbers, retuned by the ronin's passives (read by src/magic/katana.mjs). */
export function kataMods(world, p){
  const haste = (stateOf(p).hasteUntil || 0) > world.time ? 1+.25*R(p, 'zanshin') : 1;
  return {
    damage: round(1+.08*R(p, 'keen-edge')),
    cooldown: round(1/((1+.06*R(p, 'swift-draw'))*haste)),
    hang: round(1.5*R(p, 'lingering')+(R(p, 'mugen') ? 60 : 0)),
    maxCuts: 2*R(p, 'lingering')+4*R(p, 'mugen'),
    reach: round(.5*R(p, 'long-reach')),
    third: round(1+.25*R(p, 'ichi-no-tachi')), thirdReach: round(1.2*R(p, 'ichi-no-tachi')),
    snap: round(1+.12*R(p, 'sharp-sheath')),
  };
}
function sync(world, p){
  const mods = kataMods(world, p);
  if(JSON.stringify(mods) !== JSON.stringify(p.kataMods)) p.kataMods = mods;
  (p.ranks ||= {})[PACK] = Math.min(5, 1+Math.floor(((p.level || 1)-1)/RONIN.rankEvery));
  if(!Number.isFinite(p.ki)) p.ki = 0;
}
function step(world, p, dt){
  sync(world, p);
  const s = stateOf(p), obstacles = world.frameObstacles || world.obstacles();
  // Ki fades when the blade rests.
  if(p.ki > 0 && world.time-(s.kiAt ?? -99) > RONIN.kiIdle) p.ki = Math.max(0, round(p.ki-RONIN.kiDecay*dt));
  if(s.step) stepShadow(world, p, s, dt, obstacles);
  if(s.pulls?.length) stepLure(world, p, s, dt, obstacles);
  // Razor Air: what stands in a hanging cut is cut, a little, every half second.
  const razor = R(p, 'razor-air');
  if(razor && world.time >= (s.razorAt || 0)){
    s.razorAt = round(world.time+.5);
    const cuts = hangingCuts(world, p);
    if(cuts.length){
      const D = roninHit(world, p);
      for(const e of hostiles(world)) if(cuts.some(c => cutGap(e, c) <= IAI.width+bodyOf(e)*.5)) hurt(world, e, D*.12*razor, p.id);
    }
  }
  // Afterimage: a dodge leaves its path hanging.
  const after = R(p, 'afterimage');
  if(p.dash > 0){if(after && !s.dodgeFrom) s.dodgeFrom = [round(p.x), round(p.z)];}
  else if(s.dodgeFrom){
    const [x0, z0] = s.dodgeFrom; s.dodgeFrom = null;
    if(after && Math.hypot(p.x-x0, p.z-z0) > .8) layCut(world, p, x0, z0, p.x, p.z, {damage: after >= 2 ? roninHit(world, p)*.6 : 0, tag: 'after'});
  }
  if(s.echoUntil && s.echoUntil <= world.time) s.echoUntil = 0;
  if(s.hasteUntil && s.hasteUntil <= world.time) s.hasteUntil = 0;
}
/** Shadow Step: the dash itself, a few substeps a tick; at the end its path is laid as a cut. */
function stepShadow(world, p, s, dt, obstacles){
  const st = s.step;
  if(p.down || p.ghost){s.step = null; return;}
  const speed = st.len/st.dur, len = Math.min(speed*dt, Math.max(0, st.len-st.done));
  const x0 = p.x, z0 = p.z;
  for(let i = 0; i < 3; i++) world.move(p, st.dx*len/dt, st.dz*len/dt, dt/3, obstacles);
  st.done = round(st.done+len);
  p.iframes = Math.max(p.iframes || 0, .2); p.action = 'attack'; p.actionUntil = world.time+.2;
  p.dx = st.dx; p.dz = st.dz; p.aimUntil = world.time+.3;
  for(const e of hostiles(world)){
    if(st.hit.includes(e.id)) continue;
    const sx = p.x-x0, sz = p.z-z0, l2 = sx*sx+sz*sz || 1e-9, t = Math.max(0, Math.min(1, ((e.x-x0)*sx+(e.z-z0)*sz)/l2));
    if(Math.hypot(e.x-(x0+sx*t), e.z-(z0+sz*t)) > IAI.width+bodyOf(e)*.5) continue;
    st.hit.push(e.id); hurt(world, e, st.dmg, p.id);
  }
  const stuck = Math.hypot(p.x-x0, p.z-z0) < len*.2;
  if(st.done >= st.len-1e-6 || stuck){
    s.step = null;
    if(st.hit.length) gainKi(world, p, 8);
    if(Math.hypot(p.x-st.x0, p.z-st.z0) > .6) layCut(world, p, st.x0, st.z0, p.x, p.z, {tag: 'step', flash: false});
    world.event('roninstep', p.x, p.z, '', {player: p.id, itemId: PACK, x0: st.x0, z0: st.z0, dx: st.dx, dz: st.dz, end: 1, hits: st.hit.length});
  }
}
/** Shadow Lure: the threads reel each foe in over a moment; Shadow Stitch cuts them as they land. */
function stepLure(world, p, s, dt, obstacles){
  const stitch = R(p, 'kage-nui');
  for(let i = s.pulls.length-1; i >= 0; i--){
    const pull = s.pulls[i], e = (world.enemies || []).find(q => q.id === pull.id && q.hp > 0);
    pull.t = round(pull.t+dt);
    if(!e){s.pulls.splice(i, 1); continue;}
    const d = Math.hypot(pull.tx-e.x, pull.tz-e.z), speed = 22;
    if(d > .12){
      const go = Math.min(d, speed*dt);
      for(let k = 0; k < 3; k++) world.move(e, (pull.tx-e.x)/Math.max(d, 1e-6)*go/dt, (pull.tz-e.z)/Math.max(d, 1e-6)*go/dt, dt/3, obstacles);
    }
    if(d <= .12 || pull.t >= .4){
      if(stitch) hurt(world, e, roninHit(world, p)*.35*stitch, p.id);
      s.pulls.splice(i, 1);
    }
  }
}

export const RONIN_CLASS = registerClass({
  id: 'ronin', name: 'Kagekiri Ronin', weapon: PACK, role: 'Melee · combo · control',
  blurb: 'A wandering swordsman of Yomi. Every draw leaves a cut hanging in the air; the ronin lays lines where the foes will be, drags them onto the lines, and closes them all with one click of the sheath.',
  resource: {id: 'ki', name: 'Ki', max: RONIN.kiMax, color: '#ff8fb3'},
  traits: [
    {name: 'Iai Draw', text: 'Your attack: three draws make a set. Each cut hangs in the air; the third draw sheathes the blade and every hanging cut snaps shut on whatever stands in it.'},
    {name: 'Crux', text: 'Where two of your cuts cross, a snap also bursts at the crossing.'},
    {name: 'Ki', text: `Draws that land (+${RONIN.kiDraw}) and snaps (+${RONIN.kiSnapFoe} a foe) build Ki; skills spend it. It fades when you stop fighting.`},
  ],
  trees: [
    {id: 'iai', name: 'Iai', sub: 'the Draw', blurb: 'Lay more cuts, longer and keener.'},
    {id: 'kage', name: 'Kage', sub: 'the Shadow', blurb: 'Move yourself, and drag them onto your lines.'},
    {id: 'sakura', name: 'Sakura', sub: 'the Sheath', blurb: 'Close the lines: finishers, and what a snap leaves behind.'},
  ],
  nodes: NODES, skills: SKILLS, ultimate: ULTIMATE,
  busy: (world, p) => !!p.kataDraw || p.vanish > world.time || !!p.ronin?.step,
  sync, step,
});
