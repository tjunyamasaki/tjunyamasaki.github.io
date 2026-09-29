// The Gloomgrasp Scepter: your shadow has hands. Each cast sends it crawling out under the nearest foes;
// a hand claws up out of a pool of dark, grabs whatever stands there and HOLDS it (rooted) for a while.
// Cast again while a foe is held and that same hand squeezes instead of a new one rising:
// grab (1) → squeeze (2) → CRUSH (3). The crush bursts in shadow shards that hurt the foes around and
// the hand lets go. So the rhythm is to keep your grip on the same foes, not to spray.
// Abyssal Grip (skill, SKILL_CALLS.gloomhands): hands rise under every foe near the mark already at grip
// two, a colossal hand rises in the middle, and when it clenches every hand crushes at once.
// Host only. Hands live in world.magicPuffs (snapshotted); src/fx/gloomgrasp.mjs draws them.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';

const PACK = 'gloomgrasp';
export const GRASP = Object.freeze({
  hands: 3, damage: 14, cooldown: 1.4, range: 8, fallback: 3.5, max: 8,
  stagger: .08, grabAt: .42,           // a new hand rises for grabAt seconds before it closes
  hold: 1.9, sink: .35,                // how long a grip lasts after its last squeeze; how long a hand takes to sink
  squeezeIn: .16,                      // a squeeze loosens the fingers for this long before it clenches
  grabRadius: .9, grip: [1, 1.6, 3.2], // damage multiplier of grab, squeeze, crush
  crushRadius: 1.8, crushShare: .5,    // the crush's shards hit the foes around for half
  castLife: .7,
});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Gloomgrasp Scepter', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: GRASP.damage, durability: 170, cooldown: GRASP.cooldown, stamina: 9,
    blurb: 'Your shadow has hands. They grab your foes and hold them; cast again to squeeze, and the third squeeze crushes.',
  },
  mobs: [],
  sprites: {
    item: {src: `assets/magic/${PACK}/item.svg`, icon: `assets/magic/${PACK}/icon.svg`,
      size: [1.3, 1.9], anchor: [.5, .36],
      columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || !weapon || weapon.itemId !== PACK || !(weapon.durability > 0) ||
    player.down || player.ghost || player.online === false || player.cooldown > .05 ||
    !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;

  const length = Math.hypot(player.dx || 0, player.dz || 0);
  const dx = length > 1e-6 ? player.dx/length : 0, dz = length > 1e-6 ? player.dz/length : 1;
  const power = ownerPower(world, player);
  const mine = (world.magicPuffs || []).filter(h => h.packId === PACK && h.ownerId === player.id);
  const holding = mine.filter(holds);
  // Every grip you hold squeezes; then up to `hands` new hands rise under foes not yet held.
  holding.forEach((hand, i) => {if(!(hand.squeezeAt > hand.age)) hand.squeezeAt = hand.age+GRASP.squeezeIn+i*.04;});
  const held = new Set(holding.map(h => h.targetId));
  const targets = hostiles(world).filter(e => !held.has(e.id) && Math.hypot(e.x-player.x, e.z-player.z) <= GRASP.range)
    .sort((a, b) => score(a, player, dx, dz)-score(b, player, dx, dz)).slice(0, GRASP.hands);

  let live = mine.length, fx = dx, fz = dz;
  targets.forEach((e, i) => {
    if(live >= GRASP.max) return;
    rise(world, player, e.x, e.z, e.id, i*GRASP.stagger, power); live++;
    if(i === 0){const l = Math.hypot(e.x-player.x, e.z-player.z); if(l > 1e-6){fx = (e.x-player.x)/l; fz = (e.z-player.z)/l;}}
  });
  // Nothing in reach: a hand still claws up in front of you (and grabs whatever walks in).
  if(!targets.length && !holding.length) rise(world, player, player.x+dx*GRASP.fallback, player.z+dz*GRASP.fallback, null, 0, power);

  const cast = {id: world.nextId('gloomcast'), packId: PACK, ownerId: player.id,
    x: player.x, z: player.z, dx: fx, dz: fz, age: 0, life: GRASP.castLife};
  (world.magicCasts ||= []).push(cast);
  // attackMagic() applies the item's cooldown, stamina and wear after this returns.
  player.dx = fx; player.dz = fz; player.rest = false;
  player.action = 'attack'; player.actionUntil = world.time+.6;
  world.event('gloomcast', player.x, player.z, '', {player: player.id, itemId: PACK});
  return cast;
}

/** A hand in the world list. `grip` 0 while rising; `mult` scales its damage (the skill's hands). */
function rise(world, owner, x, z, targetId, delay, power, extra = {}){
  const id = world.nextId('gloomhand');
  const hand = {id, packId: PACK, ownerId: owner.id,
    x: round(x), z: round(z), ox: round(owner.x), oz: round(owner.z), targetId,
    age: 0, delay, grabAt: GRASP.grabAt, grip: 0, holdUntil: 0, sinkAt: 0, squeezeAt: 0, clenchAt: 0, crushAt: 0,
    power, mult: 1, splash: true, side: x < owner.x ? -1 : 1, seed: [...String(id)].reduce((a, c) => a*31+c.charCodeAt(0) & 0xffff, 7), ...extra};
  (world.magicPuffs ||= []).push(hand);
  return hand;
}

export function step(world, dt){
  if(!world || !(dt > 0) || !Number.isFinite(dt)) return;
  const casts = world.magicCasts;
  if(Array.isArray(casts)){
    for(let i = casts.length-1; i >= 0; i--){
      const cast = casts[i];
      if(cast.packId !== PACK) continue;
      cast.age += dt;
      const owner = world.players?.find(p => p.id === cast.ownerId);
      if(owner){cast.x = owner.x; cast.z = owner.z;}
      if(cast.age >= cast.life) casts.splice(i, 1);
    }
  }
  const hands = world.magicPuffs;
  if(!Array.isArray(hands) || !hands.some(h => h.packId === PACK)) return;
  const foes = hostiles(world);
  for(let i = hands.length-1; i >= 0; i--){
    const h = hands[i];
    if(h.packId !== PACK) continue;
    h.age += dt;
    const t = h.age-h.delay;
    if(h.sinkAt > 0){if(h.age >= h.sinkAt+GRASP.sink) hands.splice(i, 1); continue;}
    const mark = h.targetId != null ? foes.find(e => e.id === h.targetId) : null;
    if(h.grip === 0){
      // Rising: the pool follows its mark until the fingers close.
      if(mark){h.x = round(mark.x); h.z = round(mark.z);}
      if(t >= h.grabAt) grab(world, h, foes);
      continue;
    }
    // Holding: lost the foe (dead, gone) or the grip ran out → sink.
    if(!mark || h.age >= h.holdUntil){h.sinkAt = h.age; continue;}
    h.x = round(mark.x); h.z = round(mark.z);
    if(h.squeezeAt > 0 && h.age >= h.squeezeAt){h.squeezeAt = 0; squeeze(world, h, mark, foes);}
    else if(h.crushAt > 0 && h.age >= h.crushAt){h.crushAt = 0; h.grip = 2; squeeze(world, h, mark, foes);}
  }
}

function grab(world, h, foes){
  const start = h.startGrip || 0;
  let best = null, bestD = Infinity;
  for(const e of foes){
    const d = Math.hypot(e.x-h.x, e.z-h.z);
    if(d > GRASP.grabRadius+bodyOf(e)) continue;
    // The hand closes on one foe (its mark if it is still there) and only brushes the rest.
    if(e.id === h.targetId){best = e; bestD = -1;} else if(d < bestD){best = e; bestD = d;}
  }
  if(!best){h.grip = 1; h.sinkAt = h.age; world.event('gloomgrab', h.x, h.z, '', {player: h.ownerId, itemId: PACK, grip: 0}); return;}
  h.targetId = best.id; h.x = round(best.x); h.z = round(best.z);
  h.grip = start+1; h.clenchAt = round(h.age);
  harm(world, h, best, GRASP.damage*GRASP.grip[h.grip-1]);
  (world.pendingRoot ||= []).push({targetId: best.id, remaining: GRASP.hold});
  h.holdUntil = h.age+GRASP.hold;
  world.event('gloomgrab', h.x, h.z, '', {player: h.ownerId, itemId: PACK, grip: h.grip});
}

function squeeze(world, h, e, foes){
  h.grip = Math.min(3, h.grip+1); h.clenchAt = round(h.age);
  harm(world, h, e, GRASP.damage*GRASP.grip[h.grip-1]);
  if(h.grip < 3){
    (world.pendingRoot ||= []).push({targetId: e.id, remaining: GRASP.hold});
    h.holdUntil = h.age+GRASP.hold;
    world.event('gloomsqueeze', h.x, h.z, '', {player: h.ownerId, itemId: PACK, grip: h.grip});
    return;
  }
  // Crush: shards of shadow burst out of the fist, then it lets go.
  if(h.splash) for(const o of foes){
    if(o === e || !(o.hp > 0) || Math.hypot(o.x-h.x, o.z-h.z) > GRASP.crushRadius+bodyOf(o)*.5) continue;
    harm(world, h, o, GRASP.damage*GRASP.grip[2]*GRASP.crushShare);
  }
  h.sinkAt = h.age+.3; h.holdUntil = h.sinkAt;
  world.event('gloomcrush', h.x, h.z, '', {player: h.ownerId, itemId: PACK, r: GRASP.crushRadius, skill: h.splash ? 0 : 1});
}

/**
 * Abyssal Grip (SKILL_CALLS.gloomhands): a hand under every foe near the mark, already at grip two, all
 * crushing at `crush` seconds (when the colossal hand clenches). Returns where they rose, for the fx.
 */
export function gripAll(world, owner, b){
  const w = owner?.equipment?.weapon;
  if(w?.itemId !== PACK || !(w.durability > 0)) return null;
  const power = ownerPower(world, owner)*(b.power || 1), r = b.r || 4.2;
  const foes = hostiles(world).filter(e => Math.hypot(e.x-b.x, e.z-b.z) <= r+bodyOf(e)*.5)
    .sort((a, c) => Math.hypot(a.x-b.x, a.z-b.z)-Math.hypot(c.x-b.x, c.z-b.z)).slice(0, b.n || 8);
  // Hands already holding these foes let go: the abyss takes over.
  const ids = new Set(foes.map(e => e.id));
  for(const h of world.magicPuffs || []) if(h.packId === PACK && h.ownerId === owner.id && ids.has(h.targetId) && !(h.sinkAt > 0)) h.sinkAt = h.age;
  const pts = [];
  foes.forEach((e, i) => {
    rise(world, owner, e.x, e.z, e.id, i*.05, power, {startGrip: 1, mult: b.mult || .5, splash: false, crushAt: (b.crush || 1.1)+i*.02, skill: 1});
    pts.push([round(e.x), round(e.z)]);
  });
  return {pts, hits: pts.length};
}

const holds = h => h.grip > 0 && !(h.sinkAt > 0);
const round = n => Math.round(n*100)/100;
const bodyOf = e => e.type === 'king' ? 1 : e.type === 'golem' || e.type === 'brute' ? .6 : .3;

function harm(world, h, e, amount){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount*h.power*(h.mult || 1))), ownerId: h.ownerId});
  if(e.home && !e.aggro) e.aggro = true;
}

function hostiles(world){
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.id != null && e.hp > 0 &&
    !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
}

function score(enemy, origin, dx, dz){
  const x = enemy.x-origin.x, z = enemy.z-origin.z, distance = Math.hypot(x, z);
  return distance*(1.2-.2*(distance > 1e-6 ? (x*dx+z*dz)/distance : 1));
}
