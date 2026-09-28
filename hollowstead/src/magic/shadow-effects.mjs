// Gloomgrasp Scepter ink animation. Presentation only: the host owns where each hand
// rises, when it closes and who it catches; this draws from replicated age and state.
const PACK = 'gloomgrasp';
const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => 1 - (1 - clamp(n)) ** 3;
const back = n => { n = clamp(n) - 1; return 1 + 2.7 * n ** 3 + 1.7 * n ** 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const COLORS = Object.freeze({
  ink: '#0f0a16', body: '#2a1e3d', deep: '#150f20', rim: '#8a5cff', glow: '#c9a6ff',
  eye: '#ff4fd8', white: '#f3e8ff', claw: '#e9defc',
});

/** Append bounded, renderer-neutral paths and return the entity budget used. */
export function appendShadowEffects(world, frame, draw, limit = 48, theme = {}) {
  const c = {...COLORS, ...theme.magic?.shadowPalette};
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
  // Shadow reads on dark ground through a heavy ink edge and a violet rim around a dark core.
  const limb = (pts, w, alpha, rim = c.rim) => {
    path(pts, w + .075, c.ink, alpha);
    path(pts, w + .035, rim, alpha);
    path(pts, w, c.body, alpha);
  };
  const shape = (pts, color, alpha, rim = c.rim, edge = .09) => {
    path([...pts, pts[0]], edge, c.ink, alpha);
    path(pts, 0, color, alpha, true);
    path([...pts, pts[0]], edge * .35, rim, alpha);
  };
  const ring = (x, z, r, color, alpha, width = .05) => {
    const pts = Array.from({length: 37}, (_, i) => {
      const a = i / 36 * TAU;
      return [x + Math.cos(a) * r, .075, z + Math.sin(a) * r];
    });
    path(pts, width + .07, c.ink, alpha);
    path(pts, width, color, alpha);
  };
  const diamond = (x, z, y, r, color, alpha = 1) => {
    shape([[0, r], [r * .45, 0], [0, -r], [-r * .45, 0]].map(([u, v]) => at(x, z, y, u, v)), color, alpha, c.rim, .045);
  };
  // A wobbling pool of dark. `front` keeps only the near half: drawn after a hand,
  // it covers the arm's base so the hand seems to push up out of the ground.
  const pool = (x, z, r, alpha, age, front = false) => {
    if (r <= .01) return;
    const pts = [];
    for (let i = 0; i <= (front ? 20 : 19); i++) {
      const a = i / 20 * TAU;
      if (front && Math.sin(a) < -1e-6) continue;
      const wobble = 1 + Math.sin(a * 5 + age * 4) * .06 + Math.sin(a * 3 - age * 2.6) * .04;
      pts.push([x + Math.cos(a) * r * wobble, .05, z + Math.sin(a) * r * wobble * .9]);
    }
    if (front) {
      path(pts, 0, c.deep, alpha, true);
      path(pts, .09, c.ink, alpha);
      path(pts, .035, c.rim, alpha * .9);
      return;
    }
    shape(pts, c.deep, alpha, c.rim, .1);
    ring(x, z, r * .55, c.body, alpha * .6, .03);
  };
  const hand = (x, z, rise, close, size, alpha, side, age, seed, eyeOpen, rim) => {
    const k = size * (.35 + .65 * clamp(rise));
    const p = (u, v) => at(x, z, 0, u * k * side, v * k);
    const H = .2 + .6 * rise;
    const lean = Math.sin(age * 3.1 + seed * 2) * .05 * (1 - close * .6);
    // Arm: a tapering ribbon that sways up out of the pool.
    const spine = Array.from({length: 9}, (_, j) => {
      const s = j / 8;
      return [lean * s + Math.sin(s * 3 + age * 4 + seed) * .04 * s, -.14 + (H + .14) * s, .17 - .06 * s];
    });
    const left = [], right = [];
    spine.forEach(([u, v, w], j) => {
      const a = spine[Math.max(0, j - 1)], b = spine[Math.min(spine.length - 1, j + 1)];
      const du = b[0] - a[0], dv = b[1] - a[1], span = Math.hypot(du, dv) || 1;
      left.push(p(u - dv / span * w, v + du / span * w));
      right.push(p(u + dv / span * w, v - du / span * w));
    });
    const arm = [...left, ...right.reverse()];
    path([...arm, arm[0]], .09, c.ink, alpha);
    path(arm, 0, c.body, alpha, 'ribbon');
    path([...arm, arm[0]], .03, rim, alpha);
    const squeeze = 1 - .12 * close;
    shape([[-.2, H - .02], [.2, H - .02], [.25, H + .18], [.19, H + .33], [-.19, H + .33], [-.25, H + .18]]
      .map(([u, v]) => p(lean + u * squeeze, v)), c.body, alpha, rim);
    // An eye opens in the palm while the hand reaches, and squeezes shut as it grabs.
    const open = eyeOpen * (1 - close);
    if (open > .05) {
      const lid = Array.from({length: 16}, (_, j) => {
        const s = j < 8 ? j / 7 : (15 - j) / 7, sign = j < 8 ? 1 : -1;
        return p(lean - .12 + .24 * s, H + .16 + sign * Math.sin(Math.PI * s) * .085 * open);
      });
      shape(lid, c.white, alpha, c.ink, .05);
      const iris = p(lean + Math.sin(age * 2.3 + seed) * .03, H + .16);
      orb(iris[0], iris[2], iris[1], .055 * k * Math.min(1, open * 1.4), c.eye, alpha);
      path([p(lean, H + .12 + .03 * (1 - open)), p(lean, H + .2 - .03 * (1 - open))], .025 * k, c.ink, alpha);
    }
    const twitch = (1 - close) * Math.sin(age * 26 + seed) * .08;
    // Thumb, then four long fingers: fanned open while rising, hooking shut on the grab.
    const thumb = [[lean - .22, H + .1]];
    let ta = lerp(-1.05, .7, close) + twitch;
    for (const [len, bend] of [[.16, 0], [.13, .6]]) {
      ta += close * bend;
      const [u, v] = thumb[thumb.length - 1];
      thumb.push([u + Math.sin(ta) * len, v + Math.cos(ta) * len]);
    }
    limb(thumb.map(([u, v]) => p(u, v)), .1 * k, alpha, rim);
    const bases = [-.16, -.055, .055, .16], fan = [-.42, -.13, .13, .4], lengths = [.86, 1.04, 1, .82];
    for (let f = 0; f < 4; f++) {
      const pts = [[lean + bases[f] * squeeze, H + .31]];
      let a = lerp(fan[f], .08 * (f - 1.5), close) + twitch * (f % 2 ? 1 : -1);
      for (const [len, bend] of [[.2, .95], [.16, 1.2], [.13, 1]]) {
        a += close * bend;
        const [u, v] = pts[pts.length - 1];
        pts.push([u + Math.sin(a) * len * lengths[f], v + Math.cos(a) * len * lengths[f]]);
      }
      limb(pts.map(([u, v]) => p(u, v)), .09 * k, alpha, rim);
      const [u, v] = pts[pts.length - 1], su = Math.sin(a), cv = Math.cos(a);
      shape([p(u + su * .11, v + cv * .11), p(u - cv * .045, v + su * .045), p(u + cv * .045, v - su * .045)], c.claw, alpha, c.ink, .035);
    }
    return p(lean + .06, H + .38);
  };

  each(world.magicCasts, (e, age) => {
    const t = clamp(age / (e.life || .8));
    if (t >= 1) return;
    const grow = ease(age / .18), fade = clamp((1 - t) / .4);
    // The caster's own shadow boils outward and sends tendrils curling up.
    pool(e.x, e.z, .55 + grow * .4, fade * .9, age);
    ring(e.x, e.z, .1 + grow * .95, c.rim, fade * .85);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 - age * 1.5;
      diamond(e.x + Math.cos(a) * 1.05, e.z + Math.sin(a) * 1.05, .1, .1 * grow, i % 2 ? c.eye : c.glow, fade);
    }
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + .4, height = Math.sin(t * Math.PI) * .9 * grow;
      limb(Array.from({length: 6}, (_, j) => {
        const s = j / 5, r = .7 - s * .25, turn = a + Math.sin(s * 3 + age * 6 + i) * .35 * s;
        return [e.x + Math.cos(turn) * r, .05 + s * height, e.z + Math.sin(turn) * r];
      }), .05, fade);
    }
  });

  each(world.magicPuffs, (e, age) => {
    const h = age - (e.delay || 0), life = e.life || 1.55, grabAt = e.grabAt || .5;
    if (h >= life) return;
    const size = e.solo ? 1.25 : 1, fade = clamp((life - h) / .2);
    // A creeping shadow crawls from the caster to the mark before anything rises.
    const arrive = (e.delay || 0) + .28, crawl = age < arrive ? 1 : clamp(1 - (age - arrive) / .4);
    if (crawl > 0 && Number.isFinite(e.ox) && Number.isFinite(e.oz)) {
      const head = ease(age / arrive), dx = e.x - e.ox, dz = e.z - e.oz, span = Math.hypot(dx, dz) || 1;
      const nx = -dz / span, nz = dx / span, start = Math.min(.6, span * .5) / span;
      const trail = Array.from({length: 10}, (_, j) => {
        const s = lerp(start, Math.max(start, head), j / 9), wiggle = Math.sin(s * 9 - age * 12 + e.seed) * .12 * (1 - s);
        return [e.ox + dx * s + nx * wiggle, .06, e.oz + dz * s + nz * wiggle];
      });
      limb(trail, .16, crawl * .85);
      const tip = trail[trail.length - 1];
      orb(tip[0], tip[2], .08, .16, c.rim, crawl * .8);
      orb(tip[0], tip[2], .08, .12, c.deep, crawl);
    }
    if (h < -.1) return;
    const R = .78 * size * ease((h + .1) / .25) * clamp((life - h) / .3);
    pool(e.x, e.z, R, fade, age);
    for (let i = 0; i < 4; i++) {
      const phase = (age * 1.1 + i * .27) % 1, a = i * 1.9 + e.seed;
      const wx = e.x + Math.cos(a) * R * .6, wz = e.z + Math.sin(a) * R * .5, wy = .1 + phase * 1.2, wr = .07 * (1 - phase) * clamp(R);
      orb(wx, wz, wy, wr + .025, c.rim, fade * (1 - phase) * .8);
      orb(wx, wz, wy, wr, c.deep, fade * (1 - phase));
    }
    const sink = clamp((h - (life - .38)) / .3);
    const rise = h < .08 ? 0 : back((h - .08) / .3) * (1 - ease(sink));
    const close = h < grabAt - .07 ? 0 : ease((h - (grabAt - .07)) / .12) * (1 - .05 * Math.sin(age * 30));
    const held = h > grabAt ? 1 - sink : 0;
    const squeezing = h > grabAt && h < grabAt + .3 && e.caught !== 0;
    let fist = null;
    if (rise > .02) {
      const x = e.x + Math.sin(age * 55) * .02 * held;
      fist = hand(x, e.z + .12, rise, close, size, fade, e.side || 1, age, e.seed || 0,
        clamp((h - .15) / .15), squeezing ? c.glow : c.rim);
    }
    pool(e.x, e.z, R, fade, age, true);
    // The grab: a violet shock ring, flung shadow shards and squeeze lines around the fist.
    if (h >= grabAt && h < grabAt + .35) {
      const q = (h - grabAt) / .35, out = ease(q);
      ring(e.x, e.z, .35 + out * 1.1, c.glow, (1 - q) * .9);
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 + .5, r = .3 + out * 1.3;
        diamond(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, .4 + Math.sin(q * Math.PI) * .6, .12 * (1 - q * .5), i % 2 ? c.body : c.rim, 1 - q);
      }
      if (fist) {
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5 + .3, cu = Math.cos(a), sv = Math.sin(a);
          const line = [[.62 - .16 * q, 0], [.4 - .1 * q, 0]].map(([r]) => [fist[0] + cu * r * size, fist[1] + sv * r * size * .694, fist[2] - sv * r * size * .72]);
          path(line, .1, c.ink, 1 - q);
          path(line, .045, i % 2 ? c.eye : c.glow, 1 - q);
        }
      }
    }
  });
  return used;
}
