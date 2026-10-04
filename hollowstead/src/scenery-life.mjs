// Ambient life: crows that scatter, frogs that plop, fireflies at dusk, bats at night, moths at the lamps.
// Presentation only and local to each client: no simulation, no network, nothing collides. The spots come
// from the seed (scenery-layout.mjs); what the critters do comes from the local clock and where wanderers
// stand. Pure (no THREE, no DOM) so both renderers share it and node can test it.
// Every frame fills pooled records (ground / air / glow) that the renderers read before the next update.

import {RULES, hollowTime, scheduleOf} from './content.mjs?v=harvest-18';

export const LIFE = Object.freeze({
  scare:4, crowAway:[18, 34], crowReturnClear:7, crowFlight:2.2, crowReturn:2.4, crowsDark:.5,
  frogScare:2.6, frogUnder:[10, 18], frogClear:3.5, ripple:.9,
  firefly:{start:176, full:196, hold:250, end:276}, batDark:.5, batPass:9, batPassChance:.55, batPassTime:4.2, mothDark:.22,
  moths:{hearth:5, fire:3, lantern:3, glimmer:3, player:2}, mothHeight:{hearth:2.2, fire:1.2, lantern:1.95, glimmer:1.9, player:1.45},
  caps:{crows:14, frogs:10, fireflies:48, bats:8, moths:20, ripples:8},
});

const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
/** Stable per-id number in [0,1). */
export function idHash(id){let h = 2166136261;for(let i = 0; i < id.length; i++){h ^= id.charCodeAt(i);h = Math.imul(h, 16777619);}return ((h ^ (h >>> 15)) >>> 0) / 4294967296;}
/** Stable number in [0,1) for two integers (no string building per frame). */
function numHash(a, b){let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);return ((h ^ (h >>> 16)) >>> 0) / 4294967296;}

/** 0..1 how many fireflies are out at this world time (dusk and the first half of the night). */
export function fireflyStrength(time, schedule = RULES){
  // Times are set on the standard clock; a longer day (the Vigil) stretches them to match.
  const f = LIFE.firefly, cycle = schedule.cycle || RULES.cycle, k = cycle / RULES.cycle, t = (((time % cycle) + cycle) % cycle) / k;
  if(t < f.start || t > f.end)return 0;
  if(t < f.full)return smooth((t - f.start) / (f.full - f.start));
  if(t > f.hold)return 1 - smooth((t - f.hold) / (f.end - f.hold));
  return 1;
}

/** Distance from (x, z) to the nearest wanderer in `near`. */
function nearest(near, x, z){let best = Infinity;for(let i = 0; i < near.length; i++){const d = Math.hypot(near[i].x - x, near[i].z - z);if(d < best)best = d;}return best;}

function inView(view, x, z, m = 1){return x > view.x0 - m && x < view.x1 + m && z > view.z0 - m && z < view.z1 + m;}

function pool(n){return Array.from({length:n}, () => ({cell:'', x:0, z:0, h:0, flip:false, s:1, a:1, flat:false, r:0, color:0}));}

export class AmbientLife {
  constructor(){
    this.crows = new Map();this.frogs = new Map();this.ripples = [];
    this.ground = pool(48);this.air = pool(64);this.glow = pool(96);this.nGround = 0;this.nAir = 0;this.nGlow = 0;
    this.near = [];this.visibleChunks = [];
  }
  reset(){this.crows.clear();this.frogs.clear();this.ripples.length = 0;this.nGround = this.nAir = this.nGlow = 0;}
  addGround(cell, x, z, h, flip, a = 1, flat = false){
    if(this.nGround >= this.ground.length)return null;
    const r = this.ground[this.nGround++];r.cell = cell;r.x = x;r.z = z;r.h = h;r.flip = flip;r.s = 1;r.a = a;r.flat = flat;return r;
  }
  addAir(cell, x, z, h, flip, a){
    if(this.nAir >= this.air.length)return null;
    const r = this.air[this.nAir++];r.cell = cell;r.x = x;r.z = z;r.h = h;r.flip = flip;r.s = 1;r.a = a;r.flat = false;return r;
  }
  addGlow(x, z, h, radius, a, color){
    if(this.nGlow >= this.glow.length || a < .01)return null;
    const r = this.glow[this.nGlow++];r.x = x;r.z = z;r.h = h;r.r = radius;r.a = a;r.color = color;return r;
  }

  /**
   * One frame. `view` {x0,z0,x1,z1} is the visible ground (with margins); `clock` the renderer's seconds;
   * `frame` from lighting.frameLighting. `reduced` trims counts for the Canvas2D fallback.
   */
  update(model, world, frame, clock, dt, view, reduced = false){
    this.nGround = this.nAir = this.nGlow = 0;
    if(!model?.env || !world || world.arena || world.dungeon)return;
    const near = this.near;near.length = 0;
    for(const p of world.players || [])if(p.online !== false && !p.ghost && !p.down)near.push(p);
    const darkness = frame?.darkness || 0, caps = LIFE.caps;
    const {cx0, cz0, cx1, cz1} = model.range(view.x0 - 6, view.z0 - 6, view.x1 + 6, view.z1 + 6);
    const chunks = this.visibleChunks;chunks.length = 0;
    for(let cz = cz0; cz <= cz1; cz++)for(let cx = cx0; cx <= cx1; cx++)chunks.push(model.chunk(cx, cz));
    // ---- crows
    let crows = 0;
    for(const c of chunks)for(const spot of c.crows){
      if(crows >= caps.crows || !inView(view, spot.x, spot.z, 3))continue;
      crows++;this.stepCrow(spot, clock, dt, darkness, near);
    }
    // ---- frogs and their ripples
    let frogs = 0;
    for(const c of chunks)for(const spot of c.frogs){
      if(frogs >= caps.frogs || !inView(view, spot.x, spot.z, 2))continue;
      frogs++;this.stepFrog(spot, clock, dt, near);
    }
    for(let i = this.ripples.length - 1; i >= 0; i--){
      const rp = this.ripples[i];rp.t += dt;
      if(rp.t >= LIFE.ripple){this.ripples.splice(i, 1);continue;}
      this.addGround(`ripple-${Math.min(2, Math.floor(rp.t / LIFE.ripple * 3))}`, rp.x, rp.z, 0, false, 1, true);
    }
    // ---- fireflies over meadow and woods patches
    const ff = fireflyStrength(hollowTime(world), scheduleOf(world)) * (world.showcase ? 0 : 1);
    if(ff > 0){
      let n = 0;const cap = reduced ? caps.fireflies / 2 : caps.fireflies;
      for(const c of chunks)for(const sw of c.swarms){
        if(!inView(view, sw.x, sw.z, 3))continue;
        const count = reduced ? Math.ceil(sw.n / 2) : sw.n;
        for(let i = 0; i < count && n < cap; i++, n++){
          const k = idHash(sw.id) * 50 + i * 7.31, sp = .22 + (k * .137 % 1) * .2;
          const x = sw.x + Math.sin(clock * sp + k) * 1.7 + Math.sin(clock * .9 * (1 + sp) + k * 2.3) * .45;
          const z = sw.z + Math.cos(clock * sp * .8 + k * 1.7) * 1.3 + Math.sin(clock * 1.1 + k) * .35;
          const h = .45 + .55 * (.5 + .5 * Math.sin(clock * .55 + k * 3.3)) + Math.sin(clock * 2.1 + k) * .06;
          const blink = Math.max(0, Math.sin(clock * (1.1 + sp * 2) + k * 5.1));
          const lit = ff * (.18 + .82 * blink * blink * blink);
          this.addGlow(x, z, h, .26 + .2 * blink, lit * (.5 + .5 * Math.max(darkness, .3)), 0);
        }
      }
    }
    // ---- bats at night around their roosts
    const bat = smooth((darkness - LIFE.batDark) / .3);
    if(bat > 0 && !world.showcase){
      let n = 0;const cap = reduced ? caps.bats / 2 : caps.bats;
      for(const c of chunks)for(const roost of c.roosts){
        if(!inView(view, roost.x, roost.z, 7))continue;
        for(let i = 0; i < roost.n && n < cap; i++, n++){
          const k = idHash(roost.id) * 40 + i * 3.7, w = 1.3 + (k * .31 % 1) * .9;
          const R = 2.6 + 1.4 * Math.sin(clock * .43 + k), th = clock * w * (i % 2 ? -1 : 1) + k;
          const x = roost.x + Math.cos(th) * R + Math.sin(clock * 3.3 + k) * .35;
          const z = roost.z + Math.sin(th) * R * .75 + Math.cos(clock * 2.7 + k) * .3;
          const h = 2.8 + .7 * Math.sin(clock * 2.2 + k) + .25 * Math.sin(clock * 7.3 + k);
          if(!inView(view, x, z, 1))continue;
          this.addAir(`bat-${Math.floor(clock * 13 + k * 4) % 4}`, x, z, h, false, bat);
        }
      }
      // Now and then a bat or two flits right across the view, wherever the wanderer is.
      const period = LIFE.batPass, w = Math.floor(clock / period), roll = numHash(w, world.seed | 0), t = clock - w * period;
      if(roll < LIFE.batPassChance && t < LIFE.batPassTime){
        const p = t / LIFE.batPassTime, dir = roll * 7 % 1 < .5 ? 1 : -1, span = view.x1 - view.x0 + 4, zRow = view.z0 + (view.z1 - view.z0) * (.2 + (roll * 13 % 1) * .45);
        for(let i = 0; i < 1 + (roll * 29 % 1 < .5 ? 1 : 0) && n < cap; i++, n++){
          const q = p - i * .07, x = dir > 0 ? view.x0 - 2 + span * q : view.x1 + 2 - span * q;
          const z = zRow + i * .9 + Math.sin(q * 19 + i * 2) * .7, h = 2.6 + Math.sin(q * 11 + i) * .5;
          if(q > 0 && q < 1)this.addAir(`bat-${Math.floor(clock * 14 + i * 2) % 4}`, x, z, h, false, bat);
        }
      }
    }
    // ---- moths around every lit source in view
    const moth = smooth((darkness - LIFE.mothDark) / .35);
    if(moth > 0){
      let n = 0;const cap = reduced ? caps.moths / 2 : caps.moths;
      for(const src of frame.sources || []){
        if(!inView(view, src.x, src.z, 2))continue;
        const count = Math.ceil((LIFE.moths[src.kind] || 2) / (reduced ? 2 : 1)), base = LIFE.mothHeight[src.kind] || 1.4;
        const ox = src.kind === 'lantern' ? .32 : 0, spread = src.kind === 'hearth' ? .75 : src.kind === 'fire' ? .3 : .1;
        for(let i = 0; i < count && n < cap; i++, n++){
          const k = idHash(String(src.id)) * 30 + i * 2.39, w = 2.4 + (k * .21 % 1) * 1.6;
          const th = clock * w * (i % 2 ? 1 : -1) + k, rr = .45 + spread + .3 * Math.sin(clock * 1.7 + k);
          const x = src.x + ox + Math.cos(th) * rr + Math.sin(clock * 9.1 + k) * .06;
          const z = src.z + Math.sin(th) * rr * .6;
          const h = base + .32 * Math.sin(clock * 2.9 + k) + Math.sin(clock * 11 + k) * .04;
          this.addAir(`moth-${Math.floor(clock * 17 + k * 5) % 3}`, x, z, h, Math.cos(th) < 0, moth);
          this.addGlow(x, z, h, .36, moth * .5, 1);
        }
      }
    }
  }

  stepCrow(spot, clock, dt, darkness, near){
    let c = this.crows.get(spot.id);
    if(!c){
      // A perch first seen after dark stays empty until morning; one first seen near a wanderer waits a while.
      const k = idHash(spot.id), busy = darkness > LIFE.crowsDark || nearest(near, spot.x, spot.z) < LIFE.scare;
      c = {state:busy ? 'away' : 'perch', t:0, x:spot.x, z:spot.z, h:spot.y, dx:1, dz:0, until:busy ? clock + 1.5 + k * 5 : 0, k};this.crows.set(spot.id, c);
    }
    c.t += dt;
    const scare = LIFE.scare;
    if(c.state === 'perch' || c.state === 'return'){
      let threat = null, best = scare;
      for(let i = 0; i < near.length; i++){const p = near[i], d = Math.hypot(p.x - c.x, p.z - c.z);if(d < best){best = d;threat = p;}}
      if(threat || darkness > LIFE.crowsDark){
        // Scatter: away from the wanderer, each crow of a group on its own heading.
        let ax = threat ? c.x - threat.x : Math.cos(c.k * 6.28), az = threat ? c.z - threat.z : Math.sin(c.k * 6.28);
        const len = Math.hypot(ax, az) || 1, spread = (c.k - .5) * 1.4, ca = Math.cos(spread), sa = Math.sin(spread);
        ax /= len;az /= len;c.dx = ax * ca - az * sa;c.dz = ax * sa + az * ca;
        c.state = 'fly';c.t = 0;c.sx = c.x;c.sz = c.z;c.sh = c.h;
      }
    }
    if(c.state === 'perch'){
      // Idle: an occasional peck and a turn now and then.
      const cycle = 1.6 + c.k * 2.4, t = (clock + c.k * 9) % cycle, peck = t < .38 && (Math.floor((clock + c.k * 9) / cycle) % 3 !== 1);
      const face = Math.floor((clock + c.k * 31) / (6 + c.k * 5)) % 2 ? -spot.face : spot.face;
      this.addGround(`crow-sit-${peck ? 1 : 0}`, spot.x, spot.z, spot.y, face < 0, 1);
      return;
    }
    if(c.state === 'fly'){
      const t = c.t, go = 5.2 * t + 1.6 * t * t;
      c.x = c.sx + c.dx * go;c.z = c.sz + c.dz * go;c.h = c.sh + .35 + 2.4 * t + .9 * t * t;
      const a = 1 - smooth((t - LIFE.crowFlight * .55) / (LIFE.crowFlight * .45));
      this.addAir(`crow-fly-${Math.floor(clock * 12 + c.k * 4) % 4}`, c.x, c.z, c.h, c.dx < 0, a);
      if(t >= LIFE.crowFlight){const [lo, hi] = LIFE.crowAway;c.state = 'away';c.t = 0;c.until = clock + lo + c.k * (hi - lo);}
      return;
    }
    if(c.state === 'away'){
      if(clock < c.until || darkness > LIFE.crowsDark * .6)return;
      if(nearest(near, spot.x, spot.z) < LIFE.crowReturnClear){c.until = clock + 3;return;}
      const a = (c.k * 17 + clock * .1) * 6.28;c.dx = Math.cos(a);c.dz = Math.sin(a);c.state = 'return';c.t = 0;
    }
    if(c.state === 'return'){
      const p = Math.min(1, c.t / LIFE.crowReturn), q = (1 - p) * (1 - p);
      c.x = spot.x + c.dx * q * 10;c.z = spot.z + c.dz * q * 10;c.h = spot.y + q * 5;
      if(p >= 1){c.state = 'perch';c.t = 0;c.x = spot.x;c.z = spot.z;c.h = spot.y;return;}
      this.addAir(`crow-fly-${Math.floor(clock * (p > .8 ? 7 : 11) + c.k * 4) % 4}`, c.x, c.z, c.h, c.dx > 0, smooth(p / .35));
    }
  }

  stepFrog(spot, clock, dt, near){
    let f = this.frogs.get(spot.id);
    if(!f){f = {state:'sit', t:0, x:spot.x, z:spot.z, fx:spot.x, fz:spot.z, face:spot.face, k:idHash(spot.id), next:clock + 2 + idHash(spot.id) * 6, until:0};this.frogs.set(spot.id, f);}
    f.t += dt;
    const threat = nearest(near, f.x, f.z) < LIFE.frogScare;
    if(f.state === 'sit'){
      if(threat){f.state = 'dive';f.t = 0;f.sx = f.x;f.sz = f.z;f.face = spot.px > f.x ? 1 : -1;}
      else if(clock > f.next){
        // A little hop about its puddle's edge.
        const a = (f.k * 13 + Math.floor(clock)) * 2.1, tx = spot.x + Math.cos(a) * .35, tz = spot.z + Math.sin(a) * .25;
        f.state = 'hop';f.t = 0;f.sx = f.x;f.sz = f.z;f.tx = tx;f.tz = tz;f.face = tx > f.x ? 1 : -1;
      }else{
        const puff = (clock + f.k * 7) % (2.2 + f.k * 2) < .5;
        this.addGround(`frog-${puff ? 1 : 0}`, f.x, f.z, 0, f.face < 0);
        return;
      }
    }
    if(f.state === 'hop' || f.state === 'dive'){
      const dur = f.state === 'dive' ? .42 : .34, p = Math.min(1, f.t / dur);
      const tx = f.state === 'dive' ? spot.px : f.tx, tz = f.state === 'dive' ? spot.pz : f.tz;
      f.x = f.sx + (tx - f.sx) * p;f.z = f.sz + (tz - f.sz) * p;
      const h = Math.sin(Math.PI * p) * (f.state === 'dive' ? .38 : .22);
      this.addGround(p < .12 ? 'frog-2' : 'frog-3', f.x, f.z, h, f.face < 0);
      if(p >= 1){
        if(f.state === 'dive'){
          f.state = 'under';f.t = 0;const [lo, hi] = LIFE.frogUnder;f.until = clock + lo + f.k * (hi - lo);
          if(this.ripples.length < LIFE.caps.ripples)this.ripples.push({x:spot.px, z:spot.pz, t:0});
        }else{f.state = 'sit';f.t = 0;f.next = clock + 3 + ((f.k * 7 + clock) % 1) * 6;}
      }
      return;
    }
    if(f.state === 'under'){
      if(clock < f.until)return;
      if(nearest(near, spot.x, spot.z) < LIFE.frogClear){f.until = clock + 2;return;}
      f.state = 'sit';f.t = 0;f.x = spot.x;f.z = spot.z;f.next = clock + 3;
      if(this.ripples.length < LIFE.caps.ripples)this.ripples.push({x:spot.x, z:spot.z, t:LIFE.ripple * .34});
    }
  }
}
