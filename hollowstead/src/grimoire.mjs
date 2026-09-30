// The Grimoire of Ash tears out its own burning pages. They circle the wielder, searing whatever they pass,
// and each attack flings them out like boomerangs: they cut on the way out and again on the way back.
// Every throw tears one more page, and so does every kill. At a full book (seven) the throw is a Chapter:
// the pages gather in a ring over the mark and ignite together, then the book burns back down to three.
// Final Chapter (skill, SKILL_CALLS.finalchapter): every page and more ring the mark as a spell circle,
// collapse into it, and fly home to a full book.
// Host only, stepped from stepArsenal (the grimoire is an arsenal weapon, WEAPON_STYLES.tome).
// Orbit state lives on the wielder as `p.grimoire` {n, spin, fed, burnAt, hitAt}; thrown pages live in
// world.magicBolts (snapshotted) with packId 'tome'. src/fx/grimoire.mjs draws both.
import {EQUIPMENT} from './content.mjs?v=harvest-18';
import {powerOf} from './progression.mjs?v=harvest-18';
import {isMagicAlly} from './magic/registry.mjs?v=harvest-18';

const PACK = 'tome';
export const PAGES = Object.freeze({
  min: 3, max: 7,                         // pages the book keeps; a full book throws a Chapter
  orbit: 1.3, spin: 3.1, touch: .5,       // orbit radius, radians per second, contact radius
  sear: .1, searEvery: .45,              // contact damage (share of a hit) and per-foe cooldown
  cut: .16,                               // each pass of a thrown page (out, then back)
  reach: 6.5, near: 3.5, fan: .2,         // how far a throw flies (clamped), radians between pages
  out: .36, back: .42, hang: .3, stagger: .045,
  chapter: 1.4, chapterRadius: 2.3, ring: 1.35, // the Chapter's burst (share of a hit), radius, ring of pages
  starve: 4, burnEvery: 1.6,              // no kill or throw for this long: pages burn away, one at a time
});

const round = n => Math.round(n*100)/100;
const bodyOf = e => e.type === 'king' ? 1.2 : e.type === 'golem' || e.type === 'brute' ? .9 : .5;
const hostiles = w => (w.enemies || []).filter(e => e.hp > 0 && !isMagicAlly(e) && Number.isFinite(e.x) && Number.isFinite(e.z));
const mine = (w, p) => (w.magicBolts || []).filter(b => b.packId === PACK && b.ownerId === p.id);

/** The wielder's book, created the first time it is needed. */
export function bookOf(p){
  if(p.grimoire && Number.isFinite(p.grimoire.n)) return p.grimoire;
  return (p.grimoire = {n: PAGES.min, spin: 0, fed: 0, burnAt: 0, hitAt: {}});
}

/** ARSENAL.grimoire: throw every orbiting page at the mark (World.attack has charged stamina and cooldown). */
export function grimoire(w, p, {style, damage, hostile}){
  const g = bookOf(p);
  const target = hostile.filter(e => Math.hypot(e.x-p.x, e.z-p.z) <= style.range+1).sort((a, b) => aimScore(a, p)-aimScore(b, p))[0];
  const l = Math.hypot(p.dx || 0, p.dz || 0) || 1, fx = target ? target.x-p.x : p.dx/l, fz = target ? target.z-p.z : p.dz/l;
  const aim = Math.atan2(fz, fx), dist = target ? Math.hypot(fx, fz) : PAGES.reach*.8;
  if(g.n < 1) g.n = 1; // an empty book still tears a page to throw
  const m = g.n, chapter = m >= PAGES.max && !mine(w, p).length;
  const L = Math.max(PAGES.near, Math.min(style.range || PAGES.reach, dist+1.1));
  const tx = p.x+Math.cos(aim)*L, tz = p.z+Math.sin(aim)*L;
  for(let i = 0; i < m; i++){
    const slot = g.spin+i*Math.PI*2/m, ox = p.x+Math.cos(slot)*PAGES.orbit, oz = p.z+Math.sin(slot)*PAGES.orbit;
    let ex, ez;
    if(chapter){
      const a = aim+i*Math.PI*2/m;
      ex = tx+Math.cos(a)*PAGES.ring; ez = tz+Math.sin(a)*PAGES.ring;
    }else{
      const a = aim+(i-(m-1)/2)*PAGES.fan;
      ex = p.x+Math.cos(a)*L; ez = p.z+Math.sin(a)*L;
    }
    (w.magicBolts ||= []).push({id: w.nextId('page'), packId: PACK, ownerId: p.id, x: round(ox), z: round(oz), ox: round(ox), oz: round(oz),
      ex: round(ex), ez: round(ez), cx: round(tx), cz: round(tz), age: 0, delay: round(chapter ? i*.02 : i*PAGES.stagger), phase: 0, t: 0,
      side: i%2 ? -1 : 1, idx: i, of: m, W: round(L*(chapter ? .12 : .2)), cut: damage*PAGES.cut, blast: chapter ? damage*PAGES.chapter : 0,
      chapter: chapter ? 1 : 0, burn: chapter ? 1 : 0, hits: []});
  }
  g.n = 0; g.fed = w.time; g.burnAt = 0;
  w.wearEquipped(p, 'weapon', 1);
  w.event(chapter ? 'ashchapterthrow' : 'ashthrow', p.x, p.z, '', {player: p.id, itemId: PACK, n: m});
}

/** Final Chapter (SKILL_CALLS.finalchapter): pages ring the mark, hang while the circle burns, collapse, fly home. */
export function finalChapter(w, p, b){
  if(p?.equipment?.weapon?.itemId !== PACK) return null;
  const g = bookOf(p), n = b.n || 12, r = b.r || 3.2;
  for(const page of mine(w, p)) page.burn = 1; // pages still out burn away when they return
  for(let i = 0; i < n; i++){
    const slot = g.spin+i*Math.PI*2/n, a = i*Math.PI*2/n;
    const ox = p.x+Math.cos(slot)*PAGES.orbit, oz = p.z+Math.sin(slot)*PAGES.orbit;
    (w.magicBolts ||= []).push({id: w.nextId('page'), packId: PACK, ownerId: p.id, x: round(ox), z: round(oz), ox: round(ox), oz: round(oz),
      ex: round(b.x+Math.cos(a)*r), ez: round(b.z+Math.sin(a)*r), cx: round(b.x), cz: round(b.z), age: 0, delay: round(i*.01), phase: 0, t: 0,
      side: i%2 ? -1 : 1, idx: i, of: n, W: .6, cut: 0, blast: 0, circle: 1, hold: b.hold || 1, burn: i >= PAGES.max ? 1 : 0, hits: []});
  }
  g.n = 0; g.fed = w.time; g.burnAt = 0;
  return {r, n};
}

/** Per tick, from stepArsenal: orbit and sear, fly the thrown pages, feed and starve the book. */
export function stepGrimoire(w, dt){
  if(!(dt > 0)) return;
  let foes = null;
  for(const p of w.players || []){
    const weapon = p.equipment?.weapon;
    if(weapon?.itemId !== PACK || !(weapon.durability > 0) || p.ghost || p.online === false){if(p.grimoire) p.grimoire = null; continue;}
    if(!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const g = bookOf(p);
    foes ||= hostiles(w);
    g.spin = (g.spin+PAGES.spin*dt)%(Math.PI*200);
    // Sear: each orbiting page burns whatever it passes (a foe once per searEvery, however many pages touch it).
    if(g.n > 0 && !p.down) for(let i = 0; i < g.n; i++){
      const a = g.spin+i*Math.PI*2/g.n, x = p.x+Math.cos(a)*PAGES.orbit, z = p.z+Math.sin(a)*PAGES.orbit;
      for(const e of foes){
        if(!(e.hp > 0) || w.time-(g.hitAt[e.id] ?? -9) < PAGES.searEvery) continue;
        if(Math.hypot(e.x-x, e.z-z) > PAGES.touch+bodyOf(e)*.6) continue;
        g.hitAt[e.id] = w.time;
        hurt(w, p, e, strikeOf(p)*PAGES.sear);
      }
    }
    for(const id in g.hitAt) if(w.time-g.hitAt[id] > 2) delete g.hitAt[id];
    // Starve: long without a throw or a kill, the extra pages crumble to ash.
    if(g.n > PAGES.min && w.time-g.fed > PAGES.starve && !mine(w, p).length){
      if(!g.burnAt) g.burnAt = w.time+PAGES.burnEvery;
      else if(w.time >= g.burnAt){g.n--; g.burnAt = w.time+PAGES.burnEvery;}
    }
  }
  const list = w.magicBolts;
  if(!Array.isArray(list) || !list.some(b => b.packId === PACK)) return;
  foes ||= hostiles(w);
  for(let i = list.length-1; i >= 0; i--){
    const b = list[i];
    if(b.packId !== PACK) continue;
    b.age += dt;
    const p = w.player?.(b.ownerId);
    if(!p || p.grimoire == null){list.splice(i, 1); continue;}
    if(fly(w, p, b, dt, foes)) list.splice(i, 1);
  }
}

/**
 * Where a thrown page is `t` seconds into its current phase, with the wielder at (px, pz). Shared with
 * src/fx/grimoire.mjs, which calls it with t+lead so a page glides between 20 Hz snapshots.
 */
export function pageAt(b, t, px, pz){
  const dx = b.ex-b.ox, dz = b.ez-b.oz, L = Math.hypot(dx, dz) || 1, nx = -dz/L, nz = dx/L;
  if(b.phase === 0) return {x: b.ox, z: b.oz};
  if(b.phase === 1){
    const k = Math.min(1, t/PAGES.out), e = Math.sin(k*Math.PI/2), bulge = b.side*b.W*Math.sin(Math.PI*k);
    return {x: b.ox+dx*e+nx*bulge, z: b.oz+dz*e+nz*bulge};
  }
  if(b.phase === 2) return {x: b.ex, z: b.ez};
  if(b.phase === 3){const k = Math.min(1, t/.18); return {x: b.ex+(b.cx-b.ex)*k*k, z: b.ez+(b.cz-b.ez)*k*k};}
  const k = Math.min(1, t/PAGES.back), e = 1-Math.cos(k*Math.PI/2), bulge = -b.side*b.W*Math.sin(Math.PI*k);
  const sx = b.sx ?? b.ex, sz = b.sz ?? b.ez;
  return {x: sx+(px-sx)*e+nx*bulge, z: sz+(pz-sz)*e+nz*bulge};
}

/** Page flight: 0 waiting in orbit, 1 out, 2 hanging (Chapter, circle), 3 collapsing (circle), 4 back. True when home. */
function fly(w, p, b, dt, foes){
  const x0 = b.x, z0 = b.z;
  if(b.phase === 0){
    if(b.age < b.delay) return false;
    b.phase = 1; b.t = 0;
  }
  b.t += dt;
  const at = pageAt(b, b.t, p.x, p.z);
  b.x = round(at.x); b.z = round(at.z);
  if(b.phase === 1){
    cut(w, p, b, x0, z0, foes);
    if(b.t >= PAGES.out){b.phase = b.chapter || b.circle ? 2 : 4; b.t = 0; b.hits = []; b.sx = b.x; b.sz = b.z;}
    return false;
  }
  if(b.phase === 2){
    if(b.t < (b.circle ? b.hold : PAGES.hang)) return false;
    if(b.chapter && b.idx === 0) chapterBurst(w, p, b, foes);
    b.phase = b.circle ? 3 : 4; b.t = 0;
    return false;
  }
  if(b.phase === 3){
    if(b.t >= .18){b.phase = 4; b.t = 0; b.sx = b.x; b.sz = b.z;}
    return false;
  }
  cut(w, p, b, x0, z0, foes);
  if(b.t < PAGES.back) return false;
  const g = bookOf(p);
  // Home: back into the orbit. Chapter pages have burnt: the book keeps only its first few.
  const out = mine(w, p).length-1;
  if(!b.burn || g.n < PAGES.min) g.n = Math.min(PAGES.max, g.n+1);
  // The last page home tears a fresh one (every throw grows the book), unless it came back from a Chapter.
  if(out === 0 && !b.burn && !b.circle) g.n = Math.min(PAGES.max, g.n+1);
  if(out === 0 && b.circle) g.n = PAGES.max;
  return true;
}

function cut(w, p, b, x0, z0, foes){
  if(!(b.cut > 0) || p.down) return;
  for(const e of foes){
    if(!(e.hp > 0) || b.hits.includes(e.id) || gap(e, x0, z0, b.x, b.z) > .45+bodyOf(e)*.6) continue;
    b.hits.push(e.id);
    hurt(w, p, e, b.cut);
  }
}

function chapterBurst(w, p, b, foes){
  for(const e of foes){
    const d = Math.hypot(e.x-b.cx, e.z-b.cz);
    if(!(e.hp > 0) || d > PAGES.chapterRadius+bodyOf(e)*.5) continue;
    hurt(w, p, e, b.blast*(1-.3*Math.min(1, d/PAGES.chapterRadius)));
  }
  w.event('ashchapter', b.cx, b.cz, '', {player: p.id, itemId: PACK, r: PAGES.chapterRadius});
}

/** A hit through World.strike (kill credit, refinement, numbers). A kill tears a new page. */
function hurt(w, p, e, amount){
  w.strike(p, e, amount, 0);
  if(e.hp <= 0){
    const g = bookOf(p);
    g.fed = w.time; g.burnAt = 0;
    if(g.n+mine(w, p).length < PAGES.max){g.n++; w.event('pagetear', p.x, p.z, '', {player: p.id, itemId: PACK});}
  }
}

/** The weapon's plain hit for the wielder right now (orbit contact has no attack to take it from). */
const strikeOf = p => (EQUIPMENT[PACK]?.damage || 0)*powerOf(p);

function gap(e, x0, z0, x1, z1){
  const dx = x1-x0, dz = z1-z0, l2 = dx*dx+dz*dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((e.x-x0)*dx+(e.z-z0)*dz)/l2)) : 0;
  return Math.hypot(e.x-(x0+dx*t), e.z-(z0+dz*t));
}

function aimScore(e, p){
  const x = e.x-p.x, z = e.z-p.z, d = Math.hypot(x, z), l = Math.hypot(p.dx || 0, p.dz || 0) || 1;
  return d*(1.2-.2*(d > 1e-6 ? (x*p.dx+z*p.dz)/(d*l) : 1));
}
