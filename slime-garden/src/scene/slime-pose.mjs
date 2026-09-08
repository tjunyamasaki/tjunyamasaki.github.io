/**
 * Exact approved slime pose math extracted from the original handoff.
 * Numeric literals match the source. Mutable pose fields live on a per-actor
 * state object so two residents never share sx/sy/sz/lean/wobble/lift/t/out.
 */

/** Ten CatmullRom profile controls: `[x, y, z]` in the original Vector3 order. */
export const PROFILE_CONTROL_POINTS = [
  [0, .022, 0],
  [.55, .026, 0],
  [.82, .055, 0],
  [.96, .16, 0],
  [.99, .31, 0],
  [.935, .56, 0],
  [.82, .82, 0],
  [.61, 1.08, 0],
  [.31, 1.27, 0],
  [0, 1.34, 0],
];

/** Passed to `CatmullRomCurve3.getPoints` (65 samples). */
export const PROFILE_GET_POINTS = 64;

/** Radial segments for `LatheGeometry(profilePoints, 80)`. */
export const LATHE_SEGMENTS = 80;

/** Rest height used by `deform` as `y/1.34`. */
export const PROFILE_HEIGHT = 1.34;

/** Undeformed mouth tube center from the original handoff (`y`, then surface + depth). */
export const MOUTH_REST_X = 0;
export const MOUTH_REST_Y = 0.468;
export const MOUTH_DEPTH = 0.018;

/**
 * Walking keys: `[phase, sy, lift, lean]`.
 * Cycle is 1.25s with smoothstep interpolation between keys.
 */
export const WALK_KEYS = [
  [0, .88, 0, -.09],
  [.17, .77, 0, -.15],
  [.29, 1.16, .06, .10],
  [.49, 1.06, .21, .16],
  [.68, .82, 0, .13],
  [.80, 1.05, 0, -.04],
  [1, .88, 0, -.09],
];

/** Walking cycle length in seconds. */
export const WALK_CYCLE_SEC = 1.25;

/** Conservative body bounding sphere (local), large enough for approved squash/stretch/lean. */
export const BODY_BOUNDS_CENTER = [0, 0.7, 0];
export const BODY_BOUNDS_RADIUS = 1.8;

/**
 * @typedef {object} SlimePoseState
 * @property {number} t elapsed pose time in seconds (idle clock, blink, ripple)
 * @property {number} walkBlend 0 idle … 1 walk
 * @property {number} walkPhase 0–1 position in the 1.25s walk cycle
 * @property {number} sx
 * @property {number} sy
 * @property {number} sz
 * @property {number} lean
 * @property {number} wobble
 * @property {number} lift
 * @property {{x:number,y:number,z:number}} out scratch output of `deform`
 * @property {number[]} poseSample `[sy, lift, lean]` from `samplePose`
 */

/**
 * Same formula as Three.MathUtils.lerp.
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @returns {number}
 */
export function lerp(x, y, t) {
  return (1 - t) * x + t * y;
}

/**
 * @param {{x:number,y:number,z:number}} [out]
 * @returns {SlimePoseState}
 */
export function createPoseState(out) {
  return {
    t: 0,
    walkBlend: 0,
    walkPhase: 0,
    sx: 1,
    sy: 1,
    sz: 1,
    lean: 0,
    wobble: 0,
    lift: 0,
    out: out || { x: 0, y: 0, z: 0 },
    poseSample: [1, 0, 0],
  };
}

/**
 * Build the lathe profile: CatmullRom controls → getPoints(64) → Vector2(max(0,x), y).
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @returns {import('../../vendor/three/three.module.js').Vector2[]}
 */
export function createProfilePoints(THREE) {
  const profile = new THREE.CatmullRomCurve3(
    PROFILE_CONTROL_POINTS.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  );
  return profile.getPoints(PROFILE_GET_POINTS).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
}

/** @type {object[] | null} */
let profilePointsCache = null;

/**
 * Shared immutable lathe profile (not actor geometry). Safe to reuse across residents.
 * @param {typeof import('../../vendor/three/three.module.js')} THREE
 * @returns {import('../../vendor/three/three.module.js').Vector2[]}
 */
export function getProfilePoints(THREE) {
  if (!profilePointsCache) profilePointsCache = createProfilePoints(THREE);
  return profilePointsCache;
}

/**
 * Rest-pose mouth attachment in actor-local space, before `deform`.
 * @param {{ x: number, y: number }[]} profilePoints
 * @returns {{ x: number, y: number, z: number }}
 */
export function mouthRestLocal(profilePoints) {
  const y = MOUTH_REST_Y;
  const x = MOUTH_REST_X;
  const r = radius(y, profilePoints);
  return {
    x,
    y,
    z: Math.sqrt(Math.max(0, r * r - x * x)) + MOUTH_DEPTH,
  };
}

/**
 * Rest-surface radius at height `y` from the lathe profile (linear in each span).
 * Used for decal placement and for blink correction **before** `deform`.
 * @param {number} y
 * @param {{x:number,y:number}[]} profilePoints
 * @returns {number}
 */
export function radius(y, profilePoints) {
  let best = profilePoints[0].x;
  for (let i = 1; i < profilePoints.length; i++) {
    const a = profilePoints[i - 1], b = profilePoints[i];
    if (y >= a.y && y <= b.y) {
      return lerp(a.x, b.x, (y - a.y) / Math.max(.00001, b.y - a.y));
    }
    best = b.x;
  }
  return best;
}

/**
 * Sample the walk cycle. Writes `[sy, lift, lean]` into `out` and returns it.
 * Interpolation is smoothstep `f*f*(3-2*f)`.
 * @param {number} p phase in 0–1
 * @param {number[]} [out]
 * @returns {number[]}
 */
export function samplePose(p, out) {
  const dest = out || [0, 0, 0];
  const keys = WALK_KEYS;
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      let f = (p - a[0]) / (b[0] - a[0]);
      f = f * f * (3 - 2 * f);
      dest[0] = lerp(a[1], b[1], f);
      dest[1] = lerp(a[2], b[2], f);
      dest[2] = lerp(a[3], b[3], f);
      return dest;
    }
  }
  dest[0] = 1;
  dest[1] = 0;
  dest[2] = 0;
  return dest;
}

/**
 * Idle blink scale from pose time. Close when `t%4.9 > 4.65`, midpoint 4.775, min 0.065.
 * @param {number} t
 * @returns {number}
 */
export function blinkScale(t) {
  const blinkTime = t % 4.9;
  return blinkTime > 4.65 ? Math.max(.065, Math.abs((blinkTime - 4.775) / .125)) : 1;
}

/**
 * Fill sx, sy, sz, lean, wobble, lift from `t`, `walkPhase`, and `walkBlend`.
 * Idle breath `1+sin(t*2.1)*0.027`; wobble `.007+walkBlend*.018`.
 * @param {SlimePoseState} state
 * @returns {SlimePoseState}
 */
export function evaluatePose(state) {
  const t = state.t, walkBlend = state.walkBlend;
  const pose = samplePose(state.walkPhase, state.poseSample);
  const breath = 1 + Math.sin(t * 2.1) * .027;
  state.sy = lerp(breath, pose[0], walkBlend);
  state.sx = 1 / Math.sqrt(state.sy);
  state.sz = state.sx;
  state.lift = pose[1] * walkBlend;
  state.lean = lerp(Math.sin(t * .9) * .018, pose[2], walkBlend);
  state.wobble = .007 + walkBlend * .018;
  return state;
}

/**
 * Source `deform(x,y,z)` using actor-local scales / wobble / lean / t.
 * Writes into `state.out` and returns it.
 * @param {SlimePoseState} state
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{x:number,y:number,z:number}}
 */
export function deform(state, x, y, z) {
  const h = y / 1.34;
  const a = Math.atan2(z, x);
  const ripple = state.wobble * Math.sin(a * 3 + state.t * 9 - h * 5) * Math.sin(Math.PI * Math.min(1, h));
  const out = state.out;
  out.x = x * state.sx * (1 + ripple);
  out.y = y * state.sy;
  out.z = z * state.sz * (1 + ripple) + state.lean * h * h;
  return out;
}

/**
 * Mutate `target` in place from rest `base` xyz triples. No new arrays.
 * @param {SlimePoseState} state
 * @param {ArrayLike<number>} base
 * @param {Float32Array|number[]} target
 * @returns {Float32Array|number[]}
 */
export function deformPositionArray(state, base, target) {
  const out = state.out;
  for (let i = 0; i < base.length; i += 3) {
    deform(state, base[i], base[i + 1], base[i + 2]);
    target[i] = out.x;
    target[i + 1] = out.y;
    target[i + 2] = out.z;
  }
  return target;
}

/**
 * Idle sway used on the inner actor group: `sin(t*2.1)*0.012*(1-walkBlend)`.
 * @param {number} t
 * @param {number} walkBlend
 * @returns {number}
 */
export function idleSway(t, walkBlend) {
  return Math.sin(t * 2.1) * .012 * (1 - walkBlend);
}

/**
 * Showcase X travel: `sin(t*.55)*.62*walkBlend`.
 * @param {number} t
 * @param {number} walkBlend
 * @returns {number}
 */
export function comparisonTravelX(t, walkBlend) {
  return Math.sin(t * .55) * .62 * walkBlend;
}

/**
 * Showcase yaw added on top of world yaw: `.23+sin(t*.55+1)*.22*walkBlend`.
 * @param {number} t
 * @param {number} walkBlend
 * @returns {number}
 */
export function comparisonTravelYaw(t, walkBlend) {
  return .23 + Math.sin(t * .55 + 1) * .22 * walkBlend;
}
