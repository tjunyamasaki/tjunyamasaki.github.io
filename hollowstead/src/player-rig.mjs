// Presentation only: the wanderer's held-tool rig. Gameplay never reads this file.
//
// While a wanderer holds a rigged tool (an axe or pick while gathering, a sword-like weapon in
// hand), the body is drawn from <character>-rig.svg (no front arm) and the front arm is drawn as
// two bones that reach for the tool's grip, so the tool always sits in the hand and the arm follows
// it. Each motion is a short list of keys: arm angle, reach, tool angle, body lean and body cell.
// Everything is posed facing right with x forward / y up, then mirrored and leaned as one piece.
//
// Angles: `arm` is measured from straight down, `tool` from straight up, both counter-clockwise
// positive. Facing right that means a larger `arm` swings the hand forward and up, a larger `tool`
// tips the tool head back over the shoulder. Art and measurements come from tools/art/rig.py.
import {RIG_DATA} from './rig-data.mjs?v=harvest-18';

/** Item id -> grip sprite and motion. Tools only show while gathering with them. */
export const RIG_GEAR = Object.freeze({
  axe: {grip: 'grip-axe', work: 'chop', tool: true},
  pick: {grip: 'grip-pick', work: 'mine', tool: true},
  sword: {grip: 'grip-sword', swing: 'slash'},
  broadsword: {grip: 'grip-broadsword', swing: 'cleave'},
  flamberge: {grip: 'grip-flamberge', swing: 'sunder'},
});

const F = RIG_DATA.frames;
const clamp = (n, lo=0, hi=1) => Math.max(lo, Math.min(hi, n));
const EASE = {
  lin: n => n,
  out: n => 1-(1-n)**3,                                    // fast start, soft landing
  in: n => n**3,                                           // gathers speed into a hit
  io: n => n < .5 ? 4*n*n*n : 1-(-2*n+2)**3/2,
  snap: n => 1-(1-n)**5,                                   // the blow itself
};

// The resting carry: hand low and forward, blade up and a little ahead (a ready guard).
const GUARD = {arm: .38, reach: .9, tool: -.42, lean: .02};
const GATHER_PERIOD = .45;     // engine.mjs stepHarvest: one hit every .45 s of work
const SWING_SECONDS = {slash: .5, cleave: .62, sunder: .66};
const BLEND = .11;             // seconds to ease from one motion into the next
const CONTACT = {slashA: .36, slashB: .37, cleave: .48, sunder: .44};   // when each cut lands (body squash)

// Key: time (0..1), arm, reach (share of the arm's length), tool, body lean (+ forward), body cell,
// the easing into this key, and options: `back` the tool is swung behind the body (drawn under it),
// `len` the tool's foreshortened length (1 = side on, small = pointing at the camera), `flat` the hand
// travels in a straight line into this key (a level sweep) instead of an arc about the shoulder.
const K = (t, arm, reach, tool, lean, cell, ease='io', o={}) => ({t, arm, reach, tool, lean, cell, ease, back: !!o.back, len: o.len ?? 1, flat: !!o.flat});
const B = {back: true};
const TRACKS = {
  // Sword, forehand: hand up behind the head, blade down the back; over the top, cut level, ride low.
  slashA: [
    K(0, GUARD.arm, GUARD.reach, GUARD.tool, GUARD.lean, F.ready),
    K(.14, 3.2, .8, 2.2, -.1, F.ready, 'out', B),
    K(.2, 3.28, .82, 2.38, -.11, F.ready, 'lin', B),
    K(.27, 2.6, .9, 1.0, -.02, F.strike, 'in', B),
    K(.33, 1.6, 1, -.75, .1, F.strike, 'lin'),
    K(.39, .85, .98, -2.05, .15, F.strike, 'out'),
    K(.48, .6, .95, -2.45, .16, F.strike, 'out'),
    K(.84, .36, .9, -.28, .0, F.recover, 'io'),
    K(1, GUARD.arm, GUARD.reach, GUARD.tool, GUARD.lean, F.idle[0], 'io'),
  ],
  // Sword, backhand (the next cut in a quick chain): blade dropped behind the legs, swept up through the foe.
  slashB: [
    K(0, GUARD.arm, GUARD.reach, GUARD.tool, GUARD.lean, F.ready),
    K(.14, -.42, .9, 2.4, -.07, F.ready, 'out', B),
    K(.21, -.48, .9, 2.5, -.08, F.ready, 'lin', B),
    K(.28, .1, .98, 3.3, .02, F.strike, 'in', B),
    K(.34, .9, 1, 4.2, .1, F.strike, 'lin'),
    K(.41, 1.85, .97, 5.2, .07, F.strike, 'out'),
    K(.5, 2.3, .92, 5.6, .03, F.strike, 'out'),
    K(.84, .45, .9, GUARD.tool+Math.PI*2+.12, 0, F.recover, 'io'),
    K(1, GUARD.arm, GUARD.reach, GUARD.tool+Math.PI*2, GUARD.lean, F.idle[0], 'io'),
  ],
  // Broadsword: a wide level sweep all the way round. Drawn back behind the hip and held a beat, the
  // blade swings round in front (pointing at the camera half way, so short), through the foes and on
  // round the far side (pointing away, behind the body) before it is lifted back to the guard.
  cleave: [
    K(0, GUARD.arm, GUARD.reach, GUARD.tool, GUARD.lean, F.ready),
    K(.2, -1.3, .86, 1.5, -.16, F.ready, 'out', B),
    K(.32, -1.38, .88, 1.6, -.18, F.ready, 'lin', B),
    K(.4, -.6, .6, 1.0, -.06, F.strike, 'in', {back: true, len: .62, flat: true}),
    K(.45, .5, .55, .1, .08, F.strike, 'lin', {len: .2, flat: true}),
    K(.51, 1.3, .98, -1.5, .17, F.strike, 'lin', {flat: true}),
    K(.6, .75, .56, -.35, .2, F.strike, 'out', {back: true, len: .4, flat: true}),
    K(.84, .45, .88, -.3, .03, F.recover, 'io'),
    K(1, GUARD.arm, GUARD.reach, GUARD.tool, GUARD.lean, F.idle[0], 'io'),
  ],
  // Flamberge: raised straight overhead, brought down like a falling tree, held where it lands.
  sunder: [
    K(0, GUARD.arm, GUARD.reach, GUARD.tool, GUARD.lean, F.ready),
    K(.22, 3.15, .8, .75, -.1, F.raise, 'out', B),
    K(.32, 3.2, .82, .95, -.12, F.raise, 'lin', B),
    K(.38, 2.4, .92, -.5, .04, F.impact, 'in'),
    K(.44, 1.05, 1, -2.05, .22, F.impact, 'out'),
    K(.64, .97, .98, -1.97, .2, F.impact, 'lin'),
    K(.86, .45, .9, -.3, .02, F.recover, 'io'),
    K(1, GUARD.arm, GUARD.reach, GUARD.tool, GUARD.lean, F.idle[0], 'io'),
  ],
  // Chopping (loops; t = 0 is the hit): a level swing at the trunk. Wrench the bit free, draw the axe
  // back round behind the hip, hold, then swing it round in front (pointing at the camera half way).
  chop: [
    K(0, 1.35, 1, -1.5, .15, F.impact),
    K(.1, 1.3, .98, -1.42, .14, F.impact, 'out'),
    K(.2, 1.05, .86, -1.15, .08, F.raise, 'io', {flat: true}),
    K(.36, .05, .5, .15, -.03, F.raise, 'io', {back: true, len: .3, flat: true}),
    K(.52, -1.25, .84, 1.6, -.13, F.raise, 'out', {back: true, flat: true}),
    K(.64, -1.32, .86, 1.68, -.15, F.raise, 'lin', B),
    K(.82, -.35, .62, .95, -.02, F.raise, 'in', {back: true, len: .62, flat: true}),
    K(.91, .55, .58, .05, .08, F.impact, 'lin', {len: .22, flat: true}),
    K(1, 1.35, 1, -1.5, .15, F.impact, 'lin', {flat: true}),
  ],
  // Mining (loops; t = 0 is the hit): pick hoisted high over the head, then driven down into the stone
  // at the feet with a crouch, and it bounces once off the rock.
  mine: [
    K(0, .55, 1, -2.45, .25, F.impact),
    K(.07, .62, .98, -2.12, .23, F.impact, 'out'),
    K(.14, .57, 1, -2.36, .24, F.impact, 'io'),
    K(.42, 2.2, .9, -.25, .03, F.raise, 'io'),
    K(.64, 3.28, .95, 1.35, -.1, F.raise, 'out', B),
    K(.74, 3.32, .96, 1.45, -.11, F.raise, 'lin', B),
    K(.88, 2.0, .98, -.9, .1, F.impact, 'in'),
    K(1, .55, 1, -2.45, .25, F.impact, 'lin'),
  ],
};

function sample(track, t){
  let i = 1;
  while(i < track.length-1 && track[i].t < t) i++;
  const a = track[i-1], b = track[i], u = EASE[b.ease](clamp((t-a.t)/Math.max(1e-6, b.t-a.t)));
  const mix = key => a[key]+(b[key]-a[key])*u;
  let arm = mix('arm'), reach = mix('reach');
  if(b.flat){
    // Straight line between the two hand positions (in units of the arm's length).
    const ax = Math.sin(a.arm)*a.reach, ay = -Math.cos(a.arm)*a.reach, bx = Math.sin(b.arm)*b.reach, by = -Math.cos(b.arm)*b.reach;
    const x = ax+(bx-ax)*u, y = ay+(by-ay)*u;
    arm = Math.atan2(x, -y); reach = Math.hypot(x, y);
  }
  return {arm, reach, tool: mix('tool'), lean: mix('lean'), len: mix('len'), cell: u < .5 ? a.cell : b.cell, back: u < .5 ? a.back : b.back};
}

/** Two-bone reach from shoulder `s` toward hand `h`; the elbow bends back when low, forward when raised. */
export function solveArm(s, h, upper, fore){
  let dx = h.x-s.x, dy = h.y-s.y, d = Math.hypot(dx, dy) || 1e-6;
  const max = (upper+fore)*.999, min = Math.abs(upper-fore)+1e-3;
  const len = clamp(d, min, max); dx /= d; dy /= d;
  const bend = Math.acos(clamp((upper*upper+len*len-fore*fore)/(2*upper*len), -1, 1));
  const c = Math.cos(-bend), si = Math.sin(-bend);
  const elbow = {x: s.x+upper*(dx*c-dy*si), y: s.y+upper*(dx*si+dy*c)};
  const hand = {x: s.x+dx*len, y: s.y+dy*len};
  return {elbow, hand};
}
const boneAngle = (a, b) => Math.atan2(b.x-a.x, -(b.y-a.y));   // sprite hangs down; CCW from down

/**
 * Rig sprites for a character id. The id carries the look (`moss-mask`); a bare `moss` wears the
 * theme's chosen look, which renderer.mjs applyThemeChoices wrote into the base sprite's file name.
 */
export function rigKeys(character, theme={}){
  const [base, look] = String(character||'').split('-');
  const key = look ? `${base}-rig-${look}` : `${base}-rig`, arm = look ? `${base}-arm-${look}` : `${base}-arm`;
  const src = theme.sprites?.[key]?.src || '';
  const shape = look && look !== 'witch' ? look : (/-rig-(hood|mask)\.svg/.exec(src)?.[1] || (look ? 'witch' : 'hood'));
  return {key, arm, data: RIG_DATA.looks[shape] || RIG_DATA.looks.witch};
}

/** Which rigged item the wanderer shows right now, or null (the old held-weapon pose then applies). */
export function rigItem(player){
  if(!player || player.down || player.ghost) return null;
  if(player.action === 'gather') return RIG_GEAR[player.gatherTool]?.tool ? player.gatherTool : null;
  const id = player.equipment?.weapon?.itemId;
  return id && RIG_GEAR[id] && !RIG_GEAR[id].tool && (player.equipment.weapon.durability ?? 1) > 0 ? id : null;
}

/**
 * One rig per renderer: keeps each wanderer's walk phase, swing chain and blend between motions.
 * `pose(player, time, clock, theme)` returns null when the wanderer holds nothing rigged, else
 * {key, frame, rotation, bob, scale:[sx, sy], parts:[{key, frame, x, y, rotation, side, len, tool, back}]}
 * where part x/y are world offsets from the body sprite's anchor in the picture plane (y up),
 * already mirrored and leaned. Draw parts in order right after the body, except a part marked
 * `back` (a tool swung behind the shoulders), which goes just behind the body.
 */
export class PlayerRig {
  constructor(){this.state = new Map();}
  forget(id){this.state.delete(id);}
  pose(player, time, clock, theme={}, ready=() => true){
    const item = rigItem(player), gear = item && RIG_GEAR[item];
    if(!gear) return null;
    const sprites = theme.sprites || {}, {key, arm: armKey, data} = rigKeys(player.character, theme);
    // Until the rig's sheets are decoded the old held pose stands in (ready() starts the load).
    if(![key, armKey, gear.grip].map(k => !!sprites[k] && ready(k)).every(Boolean)) return null;
    let st = this.state.get(player.id);
    if(!st){st = {mode: null, since: time, from: null, last: null, walk: 0, clock, castAt: null, variant: 'slashB', gatherAt: time}; this.state.set(player.id, st);}
    const dt = clamp(clock-st.clock, 0, .1); st.clock = clock;
    const side = player.dx < -.1 ? -1 : 1;

    // --- choose the motion
    let mode, target, extra = {squash: 0};
    const cast = player.magicCast, swing = gear.swing, castAge = cast?.itemId === item ? time-cast.at : Infinity;
    const skill = player.skillCast, skillAge = skill?.itemId === item ? time-skill.at : Infinity;
    if(gear.work){
      if(st.mode !== gear.work) st.gatherAt = time;
      mode = gear.work;
      const u = (((time-st.gatherAt)/GATHER_PERIOD) % 1+1) % 1;
      target = sample(TRACKS[mode], u);
      extra.squash = Math.max(0, 1-u/.12)*(u < .5 ? 1 : 0);
    }else if(skillAge >= 0 && skillAge < .8){
      // Skill (skills.mjs): blade raised and whirled once overhead.
      mode = 'skill';
      const u = skillAge/.8, rise = Math.sin(Math.PI*clamp(u*1.15)), spin = EASE.io(clamp(u/.6));
      target = {arm: GUARD.arm+(2.95-GUARD.arm)*rise, reach: .85+.1*rise, tool: GUARD.tool+Math.PI*2*spin, lean: -.06*rise, cell: rise > .3 ? F.raise : F.ready};
    }else if(castAge >= 0 && castAge < SWING_SECONDS[swing]){
      if(st.castAt !== cast.at){
        // A cut that follows the last one closely comes back the other way (sword only).
        const chained = st.castAt != null && cast.at-st.castAt < .95;
        st.variant = swing === 'slash' ? (chained && st.variant === 'slashA' ? 'slashB' : 'slashA') : swing;
        st.castAt = cast.at; st.from = st.last; st.since = time;
      }
      mode = 'swing:'+cast.at;
      const u = castAge/SWING_SECONDS[swing];
      target = sample(TRACKS[st.variant], u);
      const hit = CONTACT[st.variant];
      extra.squash = u > hit && u < hit+.14 ? 1-(u-hit)/.14 : 0;
    }else if(player.action === 'dash'){
      mode = 'dash';
      target = {arm: -.95, reach: .95, tool: 1.25, lean: 0, cell: F.dash, back: true};
    }else if(player.action === 'walk'){
      mode = 'walk';
      const speed = Math.hypot(player.vx||0, player.vz||0), cadence = 2.3*clamp(speed > .01 ? speed/4.2 : 1, .7, 1.25);
      st.walk = (st.walk+dt*cadence) % 1;
      const a = st.walk*Math.PI*2, c = Math.cos(a), s = Math.sin(a);
      // Near arm swings against the near leg; the blade follows the arm and trails a little behind it.
      target = {arm: GUARD.arm+.08-.26*c, reach: GUARD.reach, tool: GUARD.tool-.05+.16*c+.12*s, lean: .05+.012*Math.sin(2*a),
        cell: F.walk[Math.floor(st.walk*F.walk.length) % F.walk.length]};
    }else{
      mode = 'idle';
      const b = Math.sin(clock*2.4+(player.x||0));
      const cell = F.idle[[0, 0, 0, 1, 0, 0][Math.floor(clock*2) % 6]];
      target = {arm: GUARD.arm+.025*b, reach: GUARD.reach, tool: GUARD.tool+.035*Math.sin(clock*2.4+.7+(player.x||0)), lean: GUARD.lean+.008*b, cell};
    }
    if(mode !== st.mode && !mode.startsWith('swing:')){st.from = st.last; st.since = time;}
    st.mode = mode;

    // --- blend out of the previous motion
    let pose = target;
    if(st.from){
      const w = EASE.out(clamp((time-st.since)/BLEND));
      if(w >= 1) st.from = null;
      else{
        const f = st.from, tool = f.tool+Math.round((target.tool-f.tool)/(Math.PI*2))*Math.PI*2;
        pose = {arm: f.arm+(target.arm-f.arm)*w, reach: f.reach+(target.reach-f.reach)*w, tool: tool+(target.tool-tool)*w,
          lean: f.lean+(target.lean-f.lean)*w, len: (f.len ?? 1)+((target.len ?? 1)-(f.len ?? 1))*w, cell: target.cell, back: target.back};
      }
    }
    st.last = pose;
    return this.build(data, pose, side, key, armKey, gear.grip, extra.squash);
  }

  build(data, pose, side, key, armKey, grip, squash=0){
    const [sx0, sy0] = data.shoulders[pose.cell] || data.shoulders[0];
    const sq = .045*squash, sx = 1+sq, sy = 1-sq;
    const s = {x: sx0*sx, y: sy0*sy};
    const r = (data.upper+data.fore)*clamp(pose.reach, .25, 1);
    const target = {x: s.x+Math.sin(pose.arm)*r, y: s.y-Math.cos(pose.arm)*r};
    const {elbow, hand} = solveArm(s, target, data.upper, data.fore);
    const upper = boneAngle(s, elbow), fore = boneAngle(elbow, hand);
    // Lean the whole figure about its feet (clockwise = forward when facing right), then mirror.
    const lean = -pose.lean, cl = Math.cos(lean), sl = Math.sin(lean);
    const place = p => {const x = p.x*cl-p.y*sl, y = p.x*sl+p.y*cl; return {x: x*side, y};};
    const turn = a => side*(a+lean);
    const S = place(s), E = place(elbow), H = place(hand);
    return {key, frame: pose.cell, rotation: side*lean, bob: 0, scale: [sx, sy], hand: H,
      parts: [
        {key: grip, frame: 0, x: H.x, y: H.y, rotation: turn(pose.tool), side, tool: true, back: !!pose.back, len: pose.len ?? 1},
        {key: armKey, frame: 0, x: S.x, y: S.y, rotation: turn(upper), side},
        {key: armKey, frame: 1, x: E.x, y: E.y, rotation: turn(fore), side},
      ]};
  }
}
