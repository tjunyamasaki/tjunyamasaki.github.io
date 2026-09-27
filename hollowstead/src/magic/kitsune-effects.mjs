// Nine-Tail Lantern ink animation. These shapes are presentation only; the host
// owns the foxfires, their launch timing, collisions and ninth-tail burst.
const PACK = 'kitsune-lantern';
const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => 1 - (1 - clamp(n)) ** 3;
const COLORS = Object.freeze({
  ink: '#24192f', ivory: '#fff1d1', red: '#ff594c', mint: '#4ff1cd',
  violet: '#ae70ff', gold: '#ffd269', shadow: '#623b91',
});

/** Append bounded, renderer-neutral paths and return the entity budget used. */
export function appendKitsuneEffects(world, frame, draw, limit = 48, theme = {}) {
  const c = {...COLORS, ...theme.magic?.kitsunePalette};
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
  // Same billboard up vector as MagicMesh: the silhouettes stay legible in 3D.
  const at = (x, z, y, u, v) => [x + u, y + v * .694, z - v * .72];
  const inkShape = (pts, color, alpha = 1, width = .055) => {
    path(pts, 0, color, alpha, true);
    path([...pts, pts[0]], width, c.ink, alpha);
  };
  const ring = (x, z, radius, color, alpha, turn = 0) => {
    const pts = Array.from({length: 37}, (_, i) => {
      const a = i / 36 * TAU + turn;
      return [x + Math.cos(a) * radius, .075, z + Math.sin(a) * radius];
    });
    path(pts, .12, c.ink, alpha);
    path(pts, .055, color, alpha);
  };
  const diamond = (x, z, y, r, color, alpha = 1) => {
    inkShape([[0, r], [r * .45, 0], [0, -r], [-r * .45, 0]].map(([u, v]) => at(x, z, y, u, v)), color, alpha, .03);
  };
  const fox = (x, z, y, size, tint, alpha = 1, tilt = 0) => {
    const ca = Math.cos(tilt), sa = Math.sin(tilt);
    const p = (u, v) => at(x, z, y, (u * ca - v * sa) * size, (u * sa + v * ca) * size);
    // Separate convex ears and cheek shield work in both Canvas and the mesh fan.
    inkShape([p(-.82, .34), p(-.89, 1.32), p(-.08, .63)], tint, alpha, size * .15);
    inkShape([p(.08, .63), p(.89, 1.32), p(.82, .34)], tint, alpha, size * .15);
    inkShape([p(-.78, .48), p(0, .81), p(.78, .48), p(.68, -.12), p(0, -.89), p(-.68, -.12)], c.ivory, alpha, size * .17);
    path([p(-.62, .28), p(-.2, .04)], size * .19, c.red, alpha);
    path([p(.62, .28), p(.2, .04)], size * .19, c.red, alpha);
    path([p(-.58, .14), p(-.22, -.03)], size * .09, c.ink, alpha);
    path([p(.58, .14), p(.22, -.03)], size * .09, c.ink, alpha);
    path([p(-.12, -.36), p(.12, -.36), p(0, -.5)], 0, c.ink, alpha, true);
    path([p(0, .62), p(-.12, .44), p(0, .24), p(.12, .44)], 0, tint, alpha, true);
  };
  const ribbon = (centers, widths, color, alpha, tipColor) => {
    const left = [], right = [];
    for (let i = 0; i < centers.length; i++) {
      const prev = centers[Math.max(0, i - 1)], next = centers[Math.min(centers.length - 1, i + 1)];
      const dx = next[0] - prev[0], dy = (next[1] - prev[1]) * .694 - (next[2] - prev[2]) * .72;
      const span = Math.hypot(dx, dy) || 1;
      const u = -dy / span * widths[i], v = dx / span * widths[i];
      left.push([centers[i][0] + u, centers[i][1] + v * .694, centers[i][2] - v * .72]);
      right.push([centers[i][0] - u, centers[i][1] - v * .694, centers[i][2] + v * .72]);
    }
    const shape = [...left, ...right.slice().reverse()];
    path(shape, 0, color, alpha, 'ribbon');
    const tip = Math.floor(centers.length * .64);
    path([...left.slice(tip), ...right.slice(tip).reverse()], 0, tipColor, alpha, 'ribbon');
    path([...shape, shape[0]], .065, c.ink, alpha);
    path(centers.slice(2, -2), .035, c.ivory, alpha * .65);
  };

  each(world.magicCasts, (e, age) => {
    const t = clamp(age / (e.life || .95));
    if (t >= 1) return;
    const grow = ease(age / .22), fade = clamp((1 - t) / .4);
    const spread = .35 + grow * .65;
    // Nine individually curling tails, drawn outside-in with the tallest last.
    for (const i of [0, 8, 1, 7, 2, 6, 3, 5, 4]) {
      const angle = Math.PI / 2 + (i - 4) * .32 * spread;
      const length = (1.5 + (4 - Math.abs(i - 4)) * .14) * grow;
      const centers = [], widths = [];
      for (let j = 0; j <= 12; j++) {
        const s = j / 12, curl = Math.sin(s * 3.8 + age * 6 + i * .7) * .19 * s * s;
        const a = angle + curl;
        centers.push(at(e.x, e.z + .32, .9, Math.cos(a) * length * s, Math.sin(a) * length * s));
        widths.push((.035 + Math.sin(Math.PI * s) ** .8 * .17) * grow * (j === 12 ? 0 : 1));
      }
      ribbon(centers, widths, i % 2 ? c.violet : c.ivory, fade * .88, i % 2 ? c.red : c.mint);
    }
    ring(e.x, e.z, (.65 + grow * .3) * (1 + t * .2), c.red, fade * .7, age);
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9 + age * .8;
      diamond(e.x + Math.cos(a) * 1.02, e.z + Math.sin(a) * 1.02, .1, .1 * grow, i % 2 ? c.mint : c.gold, fade);
    }
  });

  each(world.magicBolts, (e, age) => {
    const last = e.tailIndex === 8, tint = last ? c.red : e.tailIndex % 2 ? c.violet : c.mint;
    const speed = Math.hypot(e.vx || 0, e.vz || 0) || 1;
    const extrapolate = e.launched ? Math.min(lead, Math.max(0, (e.maxRange - e.traveled) / speed)) : 0;
    const x = e.x + (e.vx || 0) * extrapolate, z = e.z + (e.vz || 0) * extrapolate;
    const y = 1.08 + Math.sin(age * 11 + e.tailIndex) * .08;
    const appear = ease(age / .12), size = (last ? .28 : .21) * appear;
    const dx = Number.isFinite(e.vx) ? e.vx / speed : (e.dx || 0);
    const dz = Number.isFinite(e.vz) ? e.vz / speed : (e.dz || 1);
    const flyAge = Math.max(0, age - (e.delay || 0));
    const tail = e.launched ? Math.min(1.6, flyAge * speed) : .42;
    const centers = [], widths = [];
    for (let i = 0; i <= 9; i++) {
      const t = i / 9, wiggle = Math.sin(age * 18 - t * 6 + e.tailIndex) * .14 * t;
      centers.push([x - dx * tail * t - dz * wiggle, y + Math.sin(t * 4 - age * 9) * .1 * t, z - dz * tail * t + dx * wiggle]);
      widths.push((1 - t) * (last ? .2 : .14) * appear);
    }
    // The narrow far end has the bright lick of a painted fox tail.
    ribbon(centers, widths, tint, .95, c.ivory);
    orb(x, z, y, size * 1.7, tint, .10);
    fox(x, z, y, size, tint, 1, Math.sin(age * 8 + e.tailIndex) * .14);
    if (last) diamond(x, z, y + .48, .10, c.gold, .9);
  });

  each(world.magicPuffs, (e, age) => {
    const t = clamp(age / (e.life || .5));
    if (t >= 1) return;
    const fade = (1 - t) ** 1.4, grow = ease(t), big = e.burst || e.tailIndex === 8;
    const tint = big ? c.red : e.tailIndex % 2 ? c.violet : c.mint;
    const radius = (e.radius || .75) * (.18 + grow * .82);
    ring(e.x, e.z, radius, tint, fade);
    if (big) {
      ring(e.x, e.z, radius * .78, c.gold, fade * .8);
      fox(e.x, e.z, 1.12 + t * .45, .52 * (1 + t * .3), c.red, fade, Math.sin(t * 5) * .08);
    }
    for (let i = 0; i < (big ? 9 : 5); i++) {
      const a = i * TAU / (big ? 9 : 5) + (e.tailIndex || 0) * .3;
      const x = e.x + Math.cos(a) * radius, z = e.z + Math.sin(a) * radius;
      const y = .45 + Math.sin(t * Math.PI) * (big ? .8 : .4);
      const streak = [[e.x + Math.cos(a) * radius * .63, y, e.z + Math.sin(a) * radius * .63], [x, y + .07, z]];
      path(streak, .12, c.ink, fade); path(streak, .055, i % 2 ? c.gold : tint, fade);
      diamond(x, z, y, (.12 + (big ? .1 : 0)) * (1 - t * .5), i % 2 ? c.ivory : tint, fade);
    }
  });
  return used;
}
