// Plaguebeak Cane ink animation. Presentation only: the host owns the vial's flight,
// the shatter and every miasma tick; this draws from replicated age and positions.
const PACK = 'plaguebeak';
const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => 1 - (1 - clamp(n)) ** 3;
const COLORS = Object.freeze({
  ink: '#24192f', bone: '#f1e6c8', boneShade: '#cdb48e', hat: '#3a2b4a', band: '#7a4f9e',
  lime: '#c8ff5c', miasma: '#8fd65a', bile: '#4fae5c', glass: '#dffff0', cork: '#9a6a45',
  brass: '#e0ab4a', glint: '#f6ffe0',
});

/** Height of the lobbed vial at flight fraction t: hand height down to the ground, plus an arc. */
export function vialHeight(e, t) {
  return 1.25 + (.3 - 1.25) * t + (e.arc || 1.6) * 4 * t * (1 - t);
}

/** Append bounded, renderer-neutral paths and return the entity budget used. */
export function appendPlagueEffects(world, frame, draw, limit = 48, theme = {}) {
  const c = {...COLORS, ...theme.magic?.plaguePalette};
  const {path, orb} = draw;
  const lead = frame.lead || 0;
  let used = 0;
  const each = (list, visit) => {
    for (let i = (list?.length || 0) - 1; i >= 0 && used < limit; i--) {
      const e = list[i];
      if (e?.packId !== PACK || !Number.isFinite(e.x) || !Number.isFinite(e.z)) continue;
      used++;
      visit(e, (e.age || 0) + lead);
    }
  };
  // Same billboard up vector as MagicMesh, so the silhouettes stay legible in 3D.
  const at = (x, z, y, u, v) => [x + u, y + v * .694, z - v * .72];
  const dot = (q, r, color, alpha) => orb(q[0], q[2], q[1], r, color, alpha);
  const inkShape = (pts, color, alpha = 1, width = .05) => {
    path(pts, 0, color, alpha, true);
    path([...pts, pts[0]], width, c.ink, alpha);
  };
  const ring = (x, z, r, color, alpha, width = .055) => {
    const pts = Array.from({length: 37}, (_, i) => {
      const a = i / 36 * TAU;
      return [x + Math.cos(a) * r, .075, z + Math.sin(a) * r];
    });
    path(pts, width + .07, c.ink, alpha);
    path(pts, width, color, alpha);
  };
  const diamond = (x, z, y, r, color, alpha = 1) => {
    inkShape([[0, r], [r * .45, 0], [0, -r], [-r * .45, 0]].map(([u, v]) => at(x, z, y, u, v)), color, alpha, .025);
  };
  // Every blob shares one ink pass, so overlapping puffs read as a single cartoon cloud.
  const cloud = (blobs, alpha) => {
    for (const b of blobs) orb(b.x, b.z, b.y, b.r + .055, c.ink, alpha);
    for (const b of blobs) orb(b.x, b.z, b.y, b.r, b.color || c.miasma, alpha);
    for (const b of blobs) orb(b.x - b.r * .28, b.z, b.y + b.r * .3, b.r * .34, c.lime, alpha * .55);
  };
  // A looming plague doctor: brimmed hat, bone mask, brass-ringed lenses, long curved beak.
  const mask = (x, z, y, size, alpha, tilt = 0, side = 1) => {
    const ca = Math.cos(tilt), sa = Math.sin(tilt);
    const p = (u, v) => { u *= side; return at(x, z, y, (u * ca - v * sa) * size, (u * sa + v * ca) * size); };
    const w = size * .14;
    inkShape([p(-.58, .42), p(.42, .46), p(.56, .02), p(.36, -.5), p(-.34, -.56), p(-.62, -.06)], c.bone, alpha, w);
    const beak = [p(.3, .28), p(.9, .02), p(1.42, -.78), p(.4, -.34)];
    path(beak, 0, c.bone, alpha, true);
    path([p(.4, -.34), p(1.42, -.78), p(.75, -.16)], 0, c.boneShade, alpha, true);
    path([...beak, beak[0]], w, c.ink, alpha);
    for (const s of [.2, .45, .7]) {
      const u = .52 + s * .72, v = .1 - s * .7;
      path([p(u - .05, v + .08), p(u + .04, v - .06)], size * .05, c.ink, alpha);
    }
    const strap = [p(.34, .32), p(.46, -.02), p(.4, -.38)];
    path(strap, size * .17, c.ink, alpha);
    path(strap, size * .08, c.brass, alpha);
    for (const [u, v, r] of [[-.3, .1, .19], [.1, .12, .22]]) {
      const q = p(u, v);
      dot(q, r * size + .03, c.ink, alpha);
      dot(q, r * size, c.brass, alpha);
      dot(q, r * size * .64, c.lime, alpha);
      dot(p(u - .06, v + .07), r * size * .2, c.glint, alpha);
    }
    inkShape([p(-.55, .56), p(-.44, 1.28), p(.36, 1.3), p(.46, .6)], c.hat, alpha, w);
    path([p(-.53, .64), p(-.51, .84), p(.43, .86), p(.45, .66)], 0, c.band, alpha, true);
    inkShape([p(-.1, .66), p(-.1, .84), p(.08, .84), p(.08, .66)], c.brass, alpha, w * .5);
    const brim = Array.from({length: 16}, (_, i) => {
      const a = i / 16 * TAU, cx = Math.cos(a);
      return p(-.05 + cx * 1.02, .52 + Math.sin(a) * .17 + cx * .07);
    });
    inkShape(brim, c.hat, alpha, w);
  };
  // A corked glass flask of glowing bile with a little skull label.
  const vial = (x, z, y, size, alpha, tilt) => {
    const ca = Math.cos(tilt), sa = Math.sin(tilt);
    const p = (u, v) => at(x, z, y, (u * ca - v * sa) * size, (u * sa + v * ca) * size);
    const w = size * .14;
    inkShape([p(-.17, .28), p(.17, .28), p(.17, .64), p(-.17, .64)], c.glass, alpha, w);
    inkShape(Array.from({length: 14}, (_, i) => {
      const a = i / 14 * TAU;
      return p(Math.cos(a) * .52, -.18 + Math.sin(a) * .52);
    }), c.glass, alpha, w);
    path(Array.from({length: 12}, (_, i) => {
      const a = i / 12 * TAU;
      return p(Math.cos(a) * .38, -.26 + Math.sin(a) * .36);
    }), 0, c.lime, alpha, true);
    inkShape([p(-.22, .6), p(.22, .6), p(.18, .9), p(-.18, .9)], c.cork, alpha, w);
    dot(p(0, -.24), .16 * size, c.bone, alpha);
    for (const u of [-.06, .06]) dot(p(u, -.22), .045 * size, c.ink, alpha);
    path([p(-.36, -.04), p(-.27, .14)], w * .8, c.glint, alpha * .9);
  };

  each(world.magicCasts, (e, age) => {
    const t = clamp(age / (e.life || .7));
    if (t >= 1) return;
    const fade = clamp((1 - t) / .45), grow = ease(age / .2);
    const dx = Number.isFinite(e.dx) ? e.dx : 0, dz = Number.isFinite(e.dz) ? e.dz : 1;
    ring(e.x, e.z, .5 + grow * .45, c.bile, fade * .8);
    // The beak coughs: a rolling puff of breath leaves the mask and curls upward.
    const blobs = [];
    for (let i = 0; i < 6; i++) {
      const s = clamp((age - i * .035) / .5);
      if (s <= 0 || s >= 1) continue;
      const d = .55 + ease(s) * 1.5, wobble = Math.sin(s * 5 + i * 1.7) * .22 * s;
      blobs.push({x: e.x + dx * d - dz * wobble, z: e.z + dz * d + dx * wobble,
        y: 1.45 + s * .55 + (i % 2) * .08, r: (.09 + ease(s) * .2) * (1 - s * .35),
        color: i % 2 ? c.bile : c.miasma});
    }
    cloud(blobs, fade);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + age * 2.2, r = .5 + grow * .5;
      diamond(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, .12 + Math.sin(age * 6 + i) * .05, .09 * grow, i % 2 ? c.brass : c.lime, fade);
    }
  });

  each(world.magicBolts, (e, age) => {
    const fly = age - (e.delay || 0), flight = e.flight || .6;
    if (fly < 0 || !Number.isFinite(e.x0) || !Number.isFinite(e.tx)) return;
    const pos = u => {
      const k = clamp(u / flight);
      return [e.x0 + (e.tx - e.x0) * k, vialHeight(e, k), e.z0 + (e.tz - e.z0) * k];
    };
    const [x, y, z] = pos(fly);
    // Dripping bile trails the spinning flask along its arc.
    for (let i = 1; i <= 5 && fly - i * .045 >= 0; i++) {
      const q = pos(fly - i * .045), r = .085 * (1 - i / 6), a = 1 - i / 7;
      dot(q, r + .035, c.ink, .85 * a);
      dot(q, r, i % 2 ? c.lime : c.miasma, .9 * a);
    }
    orb(x, z, y, .42, c.lime, .12);
    vial(x, z, y, .3 * ease(fly / .08), 1, -fly * (e.spin || 1) * 11);
  });

  each(world.magicPuffs, (e, age) => {
    const life = e.life || 2.6, R = e.radius || 2.3;
    if (age >= life) return;
    const grow = ease(age / .3), fade = clamp((life - age) / .7);
    // The shatter: a lime splash ring and glass shards in the first beat.
    if (age < .45) {
      const k = age / .45, out = ease(k);
      ring(e.x, e.z, .3 + out * R, c.lime, (1 - k) * .95, .07);
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + .3, r = .25 + out * 1.7, lift = .25 + Math.sin(k * Math.PI) * (.7 + (i % 3) * .2);
        diamond(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, lift, .13 * (1 - k * .6), i % 2 ? c.glass : c.lime, 1 - k);
      }
    }
    // A sickly ground stain, ringed by slow creeping toxic dashes.
    ring(e.x, e.z, R * (.35 + .65 * grow), c.bile, fade * .75, .05);
    for (let i = 0; i < 8; i++) {
      const a0 = i * TAU / 8 + age * .6;
      path(Array.from({length: 5}, (_, j) => {
        const a = a0 + j * .09;
        return [e.x + Math.cos(a) * R * .78 * grow, .08, e.z + Math.sin(a) * R * .78 * grow];
      }), .06, c.lime, fade * .7);
    }
    const every = e.every || .5, beat = (age % every) / every;
    if (age >= every) ring(e.x, e.z, R * (.85 + .15 * beat), c.lime, (1 - beat) ** 2 * .55 * fade, .04);
    // Billowing miasma: a slow churning ring of puffs around a taller heart.
    const blobs = [];
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 + age * .25 + Math.sin(age + i) * .08;
      const rr = R * (.5 + .14 * Math.sin(age * 1.7 + i * 2.1)) * grow;
      blobs.push({x: e.x + Math.cos(a) * rr, z: e.z + Math.sin(a) * rr,
        y: .32 + (i % 3) * .16 + Math.sin(age * 2.1 + i) * .07,
        r: (.42 + (i % 2) * .13) * grow * (1 + .08 * Math.sin(age * 3 + i * 1.3)),
        color: i % 2 ? c.bile : c.miasma});
    }
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + age * .4;
      blobs.push({x: e.x + Math.cos(a) * .45 * grow, z: e.z + Math.sin(a) * .45 * grow,
        y: .7 + Math.sin(age * 1.6 + i) * .1, r: .55 * grow, color: c.miasma});
    }
    cloud(blobs, fade * .92);
    for (let i = 0; i < 6; i++) {
      const rise = (age * .85 + i * .19) % 1, a = i * 2.4, rr = R * .18 * (1 + i % 3);
      const bx = e.x + Math.cos(a) * rr, bz = e.z + Math.sin(a) * rr, by = .5 + rise * 1.5;
      const br = .075 * (1 - rise * .4) * grow;
      orb(bx, bz, by, br + .03, c.ink, fade * (1 - rise));
      orb(bx, bz, by, br, c.lime, fade * (1 - rise));
    }
    // The doctor's ghost rises out of the fumes, nods once, and dissolves.
    const m = clamp((age - .12) / 1.5);
    if (m > 0 && m < 1) {
      mask(e.x, e.z, 1.35 + ease(m) * .75, .62 * (.8 + .2 * ease(m * 2)),
        Math.sin(m * Math.PI) ** .7 * fade, Math.sin(age * 2.4) * .09, e.side || 1);
    }
  });
  return used;
}
