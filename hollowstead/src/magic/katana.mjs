// Kagekiri, the shrine blade of Yomi (a legendary katana). Every attack is an iai draw: one straight cut,
// so fast it is only a line, that hits whatever stands on it. The cut does not close: it hangs in the air
// where it was drawn. Three draws make a set (the second and third fanned either side of your aim, then
// straight); on the third the blade goes back into its sheath, and every cut still hanging snaps shut,
// cutting whatever stands in it now. Lure foes through your cuts before the third draw.
// Skill, Hundred-Line Draw: you vanish. Long straight cuts flash across every foe around you, one after
// another; you step out where the last one ends, sheathe the blade, and every hanging cut snaps at once.
// Cuts are world.magicSweeps entries (snapshotted); the set count and the skill live on the wielder
// (`p.kataCount`, `p.kataSnapAt`, `p.kataDraw`, `p.vanish`), so guests and saves carry them. All drawing is
// src/fx/katana.mjs; the arm rig's draw-cut is TRACKS.iai in src/player-rig.mjs.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'katana';
export const IAI = Object.freeze({
  damage: 15, cooldown: .6, stamina: 7, reach: 3.7, start: .2, width: .8, turn: 14,
  hang: 3.6,          // seconds a cut hangs before it fades unsnapped
  snapDelay: .32,     // the sheath clicks this long after the third draw
  snap: .75,          // a snapping cut, as a share of the draw's damage
  maxCuts: 9, wearEvery: 2,
});
export const DRAW = Object.freeze({
  vanish: .26, every: .075, lines: 10, length: 7.5, radius: 8.5, width: .95, appear: .28, sheath: .42, maxPerFoe: 4,
});
/** Seconds from the skill's cast to the sheath (its pose, lock and vanish follow from it). */
export const DRAW_TOTAL = DRAW.vanish+(DRAW.lines-1)*DRAW.every+DRAW.appear+DRAW.sheath;

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Kagekiri', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: IAI.damage, durability: 320, cooldown: IAI.cooldown, stamina: IAI.stamina,
    blurb: 'The shrine blade of Yomi. Every draw is one straight cut that hangs in the air; the third draw sheathes it, and every hanging cut snaps shut on whatever stands in it.',
  },
  mobs: [],
  sprites: {
    item: {src: 'assets/magic/katana/item.svg', icon: 'assets/magic/katana/icon.svg',
      size: [1.1, 1.65], anchor: [.5, .04], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

const round = n => Math.round(n*100)/100;
const hostiles = world => {
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.hp > 0 && !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
};
const bodyOf = e => e.type === 'king' || e.boss ? 1.3 : e.type === 'golem' || e.type === 'brute' ? 1 : .55;
/** Distance from a foe to a segment. */
function gap(e, x0, z0, x1, z1){
  const sx = x1-x0, sz = z1-z0, l2 = sx*sx+sz*sz || 1e-9;
  const t = Math.max(0, Math.min(1, ((e.x-x0)*sx+(e.z-z0)*sz)/l2));
  return Math.hypot(e.x-(x0+sx*t), e.z-(z0+sz*t));
}
function hurt(world, e, amount, ownerId){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId});
  e.lastHitBy = ownerId; if(e.home && !e.aggro) e.aggro = true;
}
const armed = p => p?.equipment?.weapon?.itemId === PACK && p.equipment.weapon.durability > 0 && !p.down && !p.ghost && p.online !== false;
const cutsOf = (world, id) => (world.magicSweeps || []).filter(c => c.packId === PACK && c.ownerId === id && !c.snapped);

// ------------------------------------------------------------------ the draw
export function use(world, player){
  if(!world || !armed(player) || player.cooldown > .05 || player.vanish > world.time || player.kataDraw ||
    !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const l = Math.hypot(player.dx || 0, player.dz || 0), dx = l > 1e-6 ? player.dx/l : 0, dz = l > 1e-6 ? player.dz/l : 1;
  const n = Number.isInteger(player.kataCount) ? ((player.kataCount%3)+3)%3 : 0;
  // The set fans out: a little left, a little right, then straight down the middle.
  const a = Math.atan2(dz, dx)+[-1, 1, 0][n]*IAI.turn*Math.PI/180, ux = Math.cos(a), uz = Math.sin(a);
  const power = ownerPower(world, player);
  const x0 = round(player.x+ux*IAI.start), z0 = round(player.z+uz*IAI.start), x1 = round(player.x+ux*IAI.reach), z1 = round(player.z+uz*IAI.reach);
  let hits = 0;
  for(const e of hostiles(world)){
    if(gap(e, x0, z0, x1, z1) > IAI.width+bodyOf(e)*.5) continue;
    hurt(world, e, IAI.damage*power, player.id); hits++;
  }
  const cut = {id: world.nextId('kcut'), packId: PACK, ownerId: player.id, kind: 'cut', n, x0, z0, x1, z1, age: 0, life: IAI.hang, power: round(power)};
  const list = (world.magicSweeps ||= []);
  list.push(cut);
  // Only so many cuts hang at once: the oldest closes quietly.
  const mine = list.filter(c => c.packId === PACK && c.ownerId === player.id && !c.snapped);
  for(let i = 0; i < mine.length-IAI.maxCuts; i++) list.splice(list.indexOf(mine[i]), 1);
  player.kataCount = (n+1)%3;
  if(n === 2) player.kataSnapAt = round(world.time+IAI.snapDelay);
  player.kataUses = (player.kataUses || 0)+1;
  if(player.kataUses%IAI.wearEvery === 0) world.wearEquipped(player, 'weapon', 1);
  player.dx = dx; player.dz = dz; player.rest = false;
  player.cooldown = IAI.cooldown+(n === 2 ? .14 : 0);
  player.action = 'attack'; player.actionUntil = world.time+.5; player.aimUntil = world.time+.5;
  world.event('katadraw', player.x, player.z, '', {player: player.id, itemId: PACK, n, hits, x0, z0, x1, z1});
  return cut;
}

/** The sheath clicks: every cut the wielder has hanging snaps shut on whatever stands in it now. */
function snap(world, p, skill = null){
  const cuts = cutsOf(world, p.id);
  if(!cuts.length) return 0;
  const foes = hostiles(world), taken = new Map();
  let hits = 0;
  const lines = [];
  for(const c of cuts){
    const amount = skill ? (c.skill ? skill.snap : skill.snap*.6) : IAI.damage*IAI.snap*(c.power || ownerPower(world, p));
    for(const e of foes){
      if(gap(e, c.x0, c.z0, c.x1, c.z1) > (c.skill ? DRAW.width : IAI.width)+bodyOf(e)*.5) continue;
      const n = taken.get(e.id) || 0;
      if(skill && n >= DRAW.maxPerFoe) continue;
      taken.set(e.id, n+1); hurt(world, e, amount, p.id); hits++;
    }
    c.snapped = true; c.snapAge = round(c.age); c.life = round(c.age+.5);
    if(lines.length < 16) lines.push([c.x0, c.z0, c.x1, c.z1]);
  }
  world.event('katasnap', p.x, p.z, '', {player: p.id, itemId: PACK, lines, hits, skill: !!skill, foes: taken.size});
  return hits;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  const list = world.magicSweeps;
  if(Array.isArray(list)) for(let i = list.length-1; i >= 0; i--){
    const c = list[i];
    if(c.packId !== PACK) continue;
    c.age = round(c.age+dt);
    if(c.age >= c.life) list.splice(i, 1);
  }
  for(const p of world.players || []){
    if(p.kataDraw){
      if(!armed(p)){p.kataDraw = null; p.vanish = 0;}
      else stepDraw(world, p, dt);
    }
    if(p.kataSnapAt && world.time >= p.kataSnapAt){p.kataSnapAt = 0; if(armed(p)) snap(world, p);}
    else if(p.kataSnapAt && !armed(p)) p.kataSnapAt = 0;
  }
}

// ------------------------------------------------------------------ Hundred-Line Draw (skill-book.mjs SKILL_CALLS.hundredline)
export function hundredLine(world, owner, b){
  if(!armed(owner)) return null;
  owner.kataDraw = {t: 0, x: round(owner.x), z: round(owner.z), done: 0, n: DRAW.lines, cut: b.cut, snap: b.snap, hits: {}, ends: null, appeared: false};
  owner.vanish = round(world.time+DRAW.vanish+(DRAW.lines-1)*DRAW.every+DRAW.appear);
  owner.kataSnapAt = 0; owner.kataCount = 0; owner.goal = null;
  world.event('katavanish', owner.x, owner.z, '', {player: owner.id, itemId: PACK});
  return {lines: DRAW.lines};
}
function stepDraw(world, p, dt){
  const s = p.kataDraw;
  s.t = round(s.t+dt);
  while(s.done < s.n && s.t >= DRAW.vanish+s.done*DRAW.every){drawLine(world, p, s); s.done++;}
  if(!s.appeared && s.t >= DRAW.vanish+(s.n-1)*DRAW.every+DRAW.appear){s.appeared = true; appear(world, p, s);}
  if(s.t >= DRAW_TOTAL){p.kataDraw = null; snap(world, p, s);}
}
/** One long straight cut across a foe near where the wielder vanished (the least-cut foe first). */
function drawLine(world, p, s){
  const foes = hostiles(world).filter(e => Math.hypot(e.x-s.x, e.z-s.z) <= DRAW.radius)
    .sort((a, c) => ((s.hits[a.id] || 0)-(s.hits[c.id] || 0)) || (Math.hypot(a.x-s.x, a.z-s.z)-Math.hypot(c.x-s.x, c.z-s.z)));
  const target = foes[0] || null, rng = world.rng;
  // Through the foe at a fresh angle each time (no two cuts in a row look alike); with nobody near, across the spot.
  const a = (s.done*2.39996+rng()*.9)%(Math.PI*2), ux = Math.cos(a), uz = Math.sin(a), shift = (rng()-.5)*1.2;
  const cx = target ? target.x+uz*shift*.4 : s.x+(rng()-.5)*5, cz = target ? target.z-ux*shift*.4 : s.z+(rng()-.5)*5;
  const h = DRAW.length/2, x0 = round(cx-ux*h), z0 = round(cz-uz*h), x1 = round(cx+ux*h), z1 = round(cz+uz*h);
  for(const e of hostiles(world)){
    if(gap(e, x0, z0, x1, z1) > DRAW.width+bodyOf(e)*.5) continue;
    hurt(world, e, s.cut, p.id); s.hits[e.id] = (s.hits[e.id] || 0)+1;
  }
  (world.magicSweeps ||= []).push({id: world.nextId('kcut'), packId: PACK, ownerId: p.id, kind: 'cut', skill: true, n: s.done,
    x0, z0, x1, z1, age: 0, life: round(DRAW_TOTAL-s.t+1), power: 1});
  s.ends = [x1, z1, ux, uz];
  world.event('kataline', cx, cz, '', {player: p.id, itemId: PACK, n: s.done});
}
/** The wielder steps out where the last cut ends, facing back along it. */
function appear(world, p, s){
  if(s.ends){
    const [x, z, ux, uz] = s.ends, land = world.walkable(x, z) ? {x, z} : world.landNear?.(x, z, 3);
    if(land && Number.isFinite(land.x)){p.x = round(land.x); p.z = round(land.z);}
    p.dx = round(-ux); p.dz = round(-uz);
  }
  p.vanish = 0; p.goal = null;
  p.action = 'attack'; p.actionUntil = world.time+DRAW.sheath; p.aimUntil = world.time+DRAW.sheath;
  world.event('kataappear', p.x, p.z, '', {player: p.id, itemId: PACK, dx: p.dx, dz: p.dz});
}
