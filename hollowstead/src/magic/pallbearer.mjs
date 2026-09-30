// The Pallbearer's Flail: a little iron-bound coffin on a grave-chain. It is always out, dragging behind
// the wielder; each attack heaves it round, so it builds momentum (keep heaving and it whirls, stop and
// it winds down and scrapes along behind you). It hurts in proportion to how fast it moves: the coffin
// hardest, the outer chain less, walking pace not at all. A dodge whips it; a hard blow bangs the lid
// open and shocks the foes around. Last Rites (skill) whirls it to a scream, hurls it, and the chain
// drags the wielder in after it.
// Host only. The head lives on the wielder as `p.flail` (players replicate and save whole):
// {x, z, vx, vz, hx, hz, len, spin, hitAt, shockAt, rite}. src/fx/pallbearer.mjs draws it.
import {isMagicAlly, ownerPower} from './registry.mjs?v=harvest-18';
import {stun} from '../arsenal.mjs?v=harvest-18';

const PACK = 'pallbearer';
export const FLAIL = Object.freeze({
  damage: 10, cooldown: .7, stamina: 7,
  chain: 1.15, reach: .5, pay: 1.4,  // chain length at rest; extra at full speed; how fast it pays out or reels in
  heave: 6.5, top: 18, whip: 1.2, // speed each heave adds; the heave cap; a dodge can whip it past the cap by this much
  drag: .45, scrape: 3,           // drag once it flies (it keeps its momentum a good while); friction as it drags on the ground
  hurt: 6,                        // slowest it still hurts (walking pace drags it along harmlessly)
  head: .55, link: .18, inner: .35, chainShare: .6, // hit radii; the chain hurts only past 35% of its length, for less
  again: .4,                      // seconds before the same foe can be struck again
  hard: 11, shock: 1.5, shockShare: .45, shockEvery: .45, // a hard blow bangs the lid: a small shock around the coffin
  steps: 4,
});
/** Last Rites: whirl (wind), hurl (fly), slam, hold, then the chain yanks the wielder in (yank) and they land. */
export const RITE = Object.freeze({wind: .6, fly: .36, hold: .22, yank: .3, chain: 3.1, reach: 8, near: 4, slam: 2.8, land: 2.4, stun: .7});

export const magicPack = {
  id: PACK,
  item: {
    id: PACK, name: 'Pallbearer’s Flail', icon: PACK, kind: 'weapon', slot: 'weapon',
    damage: FLAIL.damage, durability: 200, cooldown: FLAIL.cooldown, stamina: FLAIL.stamina,
    blurb: 'A coffin on a grave-chain. Every heave swings it faster, and the faster it flies the harder it hits. Dodge to whip it round; keep it whirling.',
  },
  mobs: [],
  sprites: {
    item: {src: `assets/magic/${PACK}/item.svg`, icon: `assets/magic/${PACK}/icon.svg`,
      size: [1.4, 1.8], anchor: [.5, .42], columns: 1, rows: 1, clips: {idle: {frames: [0], fps: 1}}},
  },
};

const round = n => Math.round(n*100)/100;
const bodyOf = e => e.type === 'king' ? 1.2 : e.type === 'golem' || e.type === 'brute' ? .9 : .5;

/** Heave: swing the coffin round toward the foe (the way it already spins, if it spins). */
export function use(world, player){
  const weapon = player?.equipment?.weapon;
  if(!world || weapon?.itemId !== PACK || !(weapon.durability > 0) || player.down || player.ghost || player.online === false ||
    player.cooldown > .05 || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  const f = ready(player);
  if(f.rite) return null;
  const l = Math.hypot(player.dx || 0, player.dz || 0), dx = l > 1e-6 ? player.dx/l : 0, dz = l > 1e-6 ? player.dz/l : 1;
  let ox = f.x-player.x, oz = f.z-player.z, r = Math.hypot(ox, oz);
  if(r < .3){ox = -dx; oz = -dz; r = 1;}
  const nx = ox/r, nz = oz/r, tx = -nz, tz = nx;
  const along = f.vx*tx+f.vz*tz;
  const spin = Math.abs(along) > 2.5 ? Math.sign(along) : (nx*dz-nz*dx >= 0 ? 1 : -1);
  // The heave snaps the chain taut and swings the coffin round: all of it goes into the spin.
  const L = Math.max(f.len || FLAIL.chain, Math.min(r, FLAIL.chain+FLAIL.reach));
  const speed = Math.min(FLAIL.top, Math.max(0, along*spin)+FLAIL.heave);
  f.x = player.x+nx*L; f.z = player.z+nz*L; f.len = L;
  f.vx = tx*spin*speed; f.vz = tz*spin*speed;
  f.spin = spin;
  world.wearEquipped(player, 'weapon', 1);
  player.dx = dx; player.dz = dz; player.rest = false;
  player.cooldown = FLAIL.cooldown;
  player.action = 'attack'; player.actionUntil = world.time+.3;
  world.event('coffinheave', player.x, player.z, '', {player: player.id, itemId: PACK, spin, speed: round(Math.min(speed, FLAIL.top))});
  return f;
}

export function step(world, dt){
  if(!(dt > 0) || !Number.isFinite(dt)) return;
  let foes = null;
  for(const p of world.players || []){
    const w = p.equipment?.weapon;
    if(w?.itemId !== PACK || !(w.durability > 0) || p.ghost || p.online === false){if(p.flail) p.flail = null; continue;}
    if(!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const f = ready(p);
    foes ||= hostiles(world);
    if(f.rite && !p.down) rite(world, p, f, dt, foes);
    else{f.rite = null; swing(world, p, f, dt, foes);}
    for(const id in f.hitAt) if(world.time-f.hitAt[id] > 1) delete f.hitAt[id];
  }
}

/** Last Rites (SKILL_CALLS.lastrites): the rite runs from here, in step(). */
export function beginRite(world, owner, b){
  const w = owner?.equipment?.weapon;
  if(w?.itemId !== PACK || !(w.durability > 0)) return null;
  const f = ready(owner);
  // Always a real throw: a foe right beside you still gets the coffin a few paces beyond it.
  let dx = (b.tx ?? owner.x)-owner.x, dz = (b.tz ?? owner.z)-owner.z, d = Math.hypot(dx, dz);
  if(d < 1e-3){dx = owner.dx || 0; dz = owner.dz || 1; d = Math.hypot(dx, dz) || 1;}
  const reach = Math.max(RITE.near, Math.min(RITE.reach, d));
  let tx = owner.x+dx/d*reach, tz = owner.z+dz/d*reach;
  const R = (world.radius || 60)-1.4, r = Math.hypot(tx, tz);
  if((world.arena || world.showcase) && r > R){tx *= R/r; tz *= R/r;}
  f.rite = {t: 0, phase: 'wind', tx: round(tx), tz: round(tz), line: b.line || 0, slam: b.slam || 0, drag: b.drag || 0, land: b.land || 0,
    fx: null, fz: null, hits: []};
  return {tx: f.rite.tx, tz: f.rite.tz};
}

function ready(p){
  if(p.flail && Number.isFinite(p.flail.x) && Number.isFinite(p.flail.z)) return p.flail;
  const l = Math.hypot(p.dx || 0, p.dz || 0), dx = l > 1e-6 ? p.dx/l : 0, dz = l > 1e-6 ? p.dz/l : 1;
  return (p.flail = {x: round(p.x-dx*1.2), z: round(p.z-dz*1.2), vx: 0, vz: 0, hx: p.x, hz: p.z, len: FLAIL.chain, spin: 1, hitAt: {}, shockAt: -9, rite: null});
}

/** Rope physics in a few substeps: the hand follows the wielder; the chain never stretches. */
function swing(world, p, f, dt, foes, length = null){
  const n = FLAIL.steps, h = dt/n, power = ownerPower(world, p);
  const hx0 = Number.isFinite(f.hx) ? f.hx : p.x, hz0 = Number.isFinite(f.hz) ? f.hz : p.z;
  // A teleport (respawn, a blink) snaps the chain instead of flinging the coffin across the map.
  if(Math.hypot(p.x-hx0, p.z-hz0) > 6){f.x = p.x-(p.dx || 0); f.z = p.z-(p.dz || 1); f.vx = 0; f.vz = 0; f.hx = p.x; f.hz = p.z; return;}
  const near = foes.filter(e => Math.hypot(e.x-p.x, e.z-p.z) < (length || FLAIL.chain+FLAIL.reach)+2);
  const cap = FLAIL.top*FLAIL.whip, hvx = (p.x-hx0)/dt, hvz = (p.z-hz0)/dt;
  for(let i = 1; i <= n; i++){
    const hx = hx0+(p.x-hx0)*i/n, hz = hz0+(p.z-hz0)*i/n;
    let speed = Math.hypot(f.vx, f.vz);
    // The chain pays out as it speeds up and reels in as it slows. A taut chain stays taut through the
    // change and keeps its speed (a sudden shortening would otherwise fling the coffin back at you).
    const want = length ?? FLAIL.chain+FLAIL.reach*Math.min(1, speed/FLAIL.top), len = f.len || FLAIL.chain;
    const L = f.len = len+Math.max(-FLAIL.pay*h, Math.min(FLAIL.pay*2*h, want-len));
    let ox = f.x-hx, oz = f.z-hz, r = Math.hypot(ox, oz);
    if(r > len-.05 && r > .01){f.x = hx+ox/r*L; f.z = hz+oz/r*L; r = L;}
    // Slow, it scrapes along the ground; once it flies (a heave or more) it keeps its momentum.
    const k = Math.exp(-(FLAIL.scrape+(FLAIL.drag-FLAIL.scrape)*Math.max(0, Math.min(1, (speed-2.5)/3.5)))*h);
    f.vx *= k; f.vz *= k;
    // Motion relative to the hand, split along the chain (n0) and across it.
    const n0x = r > .01 ? ox/r : 1, n0z = r > .01 ? oz/r : 0, rvx = f.vx-hvx, rvz = f.vz-hvz;
    const vr = rvx*n0x+rvz*n0z, vtx = rvx-n0x*vr, vtz = rvz-n0z*vr, vt = Math.hypot(vtx, vtz);
    f.x += f.vx*h; f.z += f.vz*h;
    ox = f.x-hx; oz = f.z-hz; r = Math.hypot(ox, oz);
    if(r > L){
      // Taut: back onto the chain's circle, the sideways speed turned onto the new tangent (so a whirl
      // keeps its speed), and any outward pull lost: the chain catches it. Walking and dodging drag it along.
      const nx = ox/r, nz = oz/r, side = vtx*-nz+vtz*nx >= 0 ? 1 : -1;
      f.x = hx+nx*L; f.z = hz+nz*L;
      const inward = Math.min(0, vr);
      f.vx = hvx-nz*side*vt+nx*inward; f.vz = hvz+nx*side*vt+nz*inward;
    }
    speed = Math.hypot(f.vx, f.vz);
    if(speed > cap){f.vx *= cap/speed; f.vz *= cap/speed;}
    if(!p.down && near.length) strike(world, p, f, near, hx, hz, power);
  }
  f.hx = p.x; f.hz = p.z;
  f.x = Math.round(f.x*1000)/1000; f.z = Math.round(f.z*1000)/1000;
}

function strike(world, p, f, foes, hx, hz, power){
  const speed = Math.hypot(f.vx, f.vz);
  if(speed < FLAIL.hurt) return;
  const cx = f.x-hx, cz = f.z-hz, L2 = cx*cx+cz*cz;
  for(const e of foes){
    if(!(e.hp > 0) || world.time-(f.hitAt[e.id] ?? -9) < FLAIL.again) continue;
    const body = bodyOf(e);
    let share = 0;
    if(Math.hypot(e.x-f.x, e.z-f.z) <= FLAIL.head+body*.8) share = 1;
    else if(L2 > .01){
      const t = Math.max(0, Math.min(1, ((e.x-hx)*cx+(e.z-hz)*cz)/L2));
      if(t >= FLAIL.inner && Math.hypot(e.x-(hx+cx*t), e.z-(hz+cz*t)) <= FLAIL.link+body*.8) share = FLAIL.chainShare*t;
    }
    if(!share) continue;
    f.hitAt[e.id] = world.time;
    const amount = FLAIL.damage*power*share*(.25+speed/12);
    harm(world, p, e, amount);
    const hard = share === 1 && speed >= FLAIL.hard;
    world.event('coffinhit', share === 1 ? f.x : e.x, share === 1 ? f.z : e.z, '', {player: p.id, itemId: PACK,
      speed: round(speed), hard: hard ? 1 : 0, chain: share === 1 ? 0 : 1, dx: round(f.vx/speed), dz: round(f.vz/speed)});
    if(hard && world.time-f.shockAt >= FLAIL.shockEvery){
      f.shockAt = world.time;
      for(const o of foes) if(o !== e && o.hp > 0 && Math.hypot(o.x-f.x, o.z-f.z) <= FLAIL.shock+bodyOf(o)*.5) harm(world, p, o, amount*FLAIL.shockShare);
      world.event('coffinshock', f.x, f.z, '', {player: p.id, itemId: PACK, r: FLAIL.shock});
    }
  }
}

/** Last Rites, step by step. `t` travels to guests with the rest of p.flail, so the fx know the phase. */
function rite(world, p, f, dt, foes){
  const R = f.rite, obstacles = world.frameObstacles || world.obstacles?.() || null;
  R.t += dt;
  if(R.phase === 'wind'){
    // Whirl up to a scream on a long chain; the ordinary contact hits land all around.
    swing(world, p, f, dt, foes, RITE.chain);
    const ox = f.x-p.x, oz = f.z-p.z, r = Math.hypot(ox, oz) || 1, tx = -oz/r, tz = ox/r;
    const want = FLAIL.top*(.6+.5*Math.min(1, R.t/RITE.wind)), along = (f.vx*tx+f.vz*tz)*f.spin;
    if(along < want){f.vx += tx*f.spin*(want-along); f.vz += tz*f.spin*(want-along);}
    if(R.t >= RITE.wind){
      R.phase = 'fly'; R.fx = round(f.x); R.fz = round(f.z); R.t0 = R.t;
      world.event('coffinthrow', f.x, f.z, '', {player: p.id, itemId: PACK, tx: R.tx, tz: R.tz});
    }
    return;
  }
  if(R.phase === 'fly'){
    const u = Math.min(1, (R.t-R.t0)/RITE.fly), x0 = f.x, z0 = f.z;
    f.x = R.fx+(R.tx-R.fx)*u; f.z = R.fz+(R.tz-R.fz)*u;
    f.vx = (f.x-x0)/dt; f.vz = (f.z-z0)/dt;
    for(const e of foes){
      if(R.hits.includes(e.id) || gap(e, x0, z0, f.x, f.z) > .5+bodyOf(e)*.8) continue;
      R.hits.push(e.id); harm(world, p, e, R.line);
    }
    f.hx = p.x; f.hz = p.z;
    if(u >= 1){
      R.phase = 'hold'; R.t0 = R.t; f.vx = 0; f.vz = 0;
      for(const e of foes){
        const d = Math.hypot(e.x-f.x, e.z-f.z);
        if(!(e.hp > 0) || d > RITE.slam+bodyOf(e)*.5) continue;
        harm(world, p, e, R.slam*(1-.3*Math.min(1, d/RITE.slam))); stun(e, RITE.stun);
      }
      world.event('coffinslam', f.x, f.z, '', {player: p.id, itemId: PACK, r: RITE.slam});
    }
    return;
  }
  if(R.phase === 'hold'){
    f.hx = p.x; f.hz = p.z;
    if(R.t-R.t0 >= RITE.hold){
      R.phase = 'yank'; R.t0 = R.t; R.hits = []; R.px = round(p.x); R.pz = round(p.z);
      R.speed = Math.max(8, Math.hypot(f.x-p.x, f.z-p.z)/RITE.yank);
      world.event('coffinyank', p.x, p.z, '', {player: p.id, itemId: PACK, tx: round(f.x), tz: round(f.z)});
    }
    return;
  }
  // yank: the chain hauls the wielder to the coffin, bowling through whatever is in the way.
  const x0 = p.x, z0 = p.z, d0 = Math.hypot(f.x-p.x, f.z-p.z);
  if(d0 > 1.05){
    const ux = (f.x-p.x)/d0, uz = (f.z-p.z)/d0, step = Math.min(R.speed*dt, d0-1);
    for(let i = 0; i < 3; i++) world.move(p, ux*step/dt, uz*step/dt, dt/3, obstacles);
    p.dx = ux; p.dz = uz;
  }
  p.iframes = Math.max(p.iframes || 0, .2); p.action = 'attack'; p.actionUntil = world.time+.2;
  for(const e of foes){
    if(R.hits.includes(e.id) || gap(e, x0, z0, p.x, p.z) > .9+bodyOf(e)*.5) continue;
    R.hits.push(e.id); harm(world, p, e, R.drag);
  }
  f.hx = p.x; f.hz = p.z;
  const d1 = Math.hypot(f.x-p.x, f.z-p.z), stuck = d0 > 1.05 && d0-d1 < R.speed*dt*.2;
  if(d1 <= 1.1 || stuck || R.t-R.t0 > RITE.yank+.25){
    // Land: rip the coffin out of the ground already whirling.
    for(const e of foes) if(e.hp > 0 && Math.hypot(e.x-p.x, e.z-p.z) <= RITE.land+bodyOf(e)*.5) harm(world, p, e, R.land);
    const ox = f.x-p.x, oz = f.z-p.z, r = Math.hypot(ox, oz) || 1, L = FLAIL.chain+FLAIL.reach;
    const at = Math.min(L, Math.max(1.2, r));
    f.x = p.x+ox/r*at; f.z = p.z+oz/r*at; f.len = at;
    f.vx = -oz/r*f.spin*FLAIL.top; f.vz = ox/r*f.spin*FLAIL.top;
    f.rite = null;
    world.event('coffinland', p.x, p.z, '', {player: p.id, itemId: PACK, r: RITE.land});
  }
}

function gap(e, x0, z0, x1, z1){
  const dx = x1-x0, dz = z1-z0, l2 = dx*dx+dz*dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((e.x-x0)*dx+(e.z-z0)*dz)/l2)) : 0;
  return Math.hypot(e.x-(x0+dx*t), e.z-(z0+dz*t));
}

function harm(world, p, e, amount){
  (world.pendingHit ||= []).push({targetId: e.id, amount: Math.max(1, Math.round(amount)), ownerId: p.id});
  if(e.home && !e.aggro) e.aggro = true;
}

function hostiles(world){
  const players = new Set((world.players || []).map(p => p.id));
  return (world.enemies || []).filter(e => e && e.id != null && e.hp > 0 &&
    !players.has(e.id) && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
}
