// Presentation-only gathering poses and contact cues. Never awards inventory.
import { ownedToolTier } from '../core/inventory.mjs';

export const RESTORE_SECONDS = 0.15;
export const FINISH_SECONDS = 0.22;
export const PARTICLE_CAP = 48;
export const TWO_STRIKE_MARKERS = Object.freeze([0.42, 0.92]);
export const ONE_REACH_MARKERS = Object.freeze([0.72]);
export const TILL_MARKERS = Object.freeze([0.70]);
export const PLANT_MARKERS = Object.freeze([0.40]);
export const UPROOT_MARKERS = Object.freeze([0.45]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

export function motionStyle(kind, action) {
  if (action === 'till') return 'till';
  if (action === 'smoothSoil') return 'rake';
  if (action === 'plantCrop') return 'plant';
  if (action === 'harvestCrop') return 'tug';
  if (action === 'uprootCrop') return 'uproot';
  if (action === 'clear') return kind === 'tree' ? 'cut' : 'pull';
  if (kind === 'tree') return 'chop';
  if (kind === 'stone' || kind === 'copper') return 'mine';
  if (kind === 'carrot' || kind === 'potato') return 'tug';
  return 'reach';
}

export function contactMarkers(style) {
  if (style === 'chop' || style === 'mine') return TWO_STRIKE_MARKERS;
  if (style === 'till' || style === 'rake') return TILL_MARKERS;
  if (style === 'plant') return PLANT_MARKERS;
  if (style === 'uproot') return UPROOT_MARKERS;
  return ONE_REACH_MARKERS;
}

export function contactSound(style) {
  if (style === 'till') return 'thud';
  if (style === 'plant') return 'rustle';
  if (style === 'tug' || style === 'uproot') return 'pull';
  return null;
}

export function toolForStyle(style, equipment) {
  if (style === 'chop' || style === 'cut') {
    return { tool: 'axe', tier: ownedToolTier(equipment, 'axe') || 'stone' };
  }
  if (style === 'mine') {
    return { tool: 'pick', tier: ownedToolTier(equipment, 'pick') || 'stone' };
  }
  if (style === 'till' || style === 'rake') {
    return { tool: 'hoe', tier: 'basic' };
  }
  return { tool: null, tier: null };
}

export function contactKind(kind, style) {
  if (style === 'chop' || style === 'cut' || kind === 'tree' || kind === 'twig') return 'wood';
  if (kind === 'copper') return 'copper';
  if (style === 'mine' || kind === 'stone' || kind === 'pebble') return 'stone';
  if (style === 'till' || style === 'rake' || style === 'plant' || kind === 'carrot' || kind === 'potato' || kind === 'earth' || style === 'tug') return 'earth';
  return 'leaf';
}

export function facingTo(player, target) {
  if (!player || !target) return 0;
  return Math.atan2(target.x - player.x, target.z - player.z);
}

export function nearContactPoint(player, resource, height = 0.7) {
  const dx = (resource?.x || 0) - (player?.x || 0);
  const dz = (resource?.z || 0) - (player?.z || 0);
  const dist = Math.hypot(dx, dz) || 1;
  const inset = Math.max(0.08, (resource?.radius || 0.4) * 0.88);
  return {
    x: resource.x - (dx / dist) * inset,
    y: height,
    z: resource.z - (dz / dist) * inset,
  };
}

export function restPose() {
  return {
    active: false,
    style: null,
    tool: null,
    tier: null,
    faceTarget: false,
    bodyLean: 0,
    bodyYaw: 0,
    bodyDrop: 0,
    gripX: 0.32,
    gripY: 0.63,
    gripZ: 0.24,
    toolRotX: 0.25,
    toolRotY: 0,
    toolRotZ: -0.2,
    armRotX: 0,
    armRotY: 0,
    armRotZ: -0.7,
    lanternBelt: 0,
    toolVisible: false,
    gripNear: 0,
    gripFar: 0.2,
    liftProduce: 0,
    hideStanding: 0,
    impact: 0,
    reactTilt: 0,
    reactSquash: 0,
    splitHands: 0,
    supportX: -0.22,
    supportY: 0.44,
    supportZ: 0.12,
    seedShow: 0,
    seedDrop: 0,
  };
}

export function mixPose(from, to, t) {
  const amount = clamp(t, 0, 1);
  const pose = restPose();
  for (const key of Object.keys(pose)) {
    const a = from?.[key];
    const b = to?.[key];
    if (typeof a === 'number' && typeof b === 'number') pose[key] = lerp(a, b, amount);
    else pose[key] = amount >= 1 ? b : a;
  }
  pose.active = amount < 1 && Boolean(from?.active);
  pose.toolVisible = amount < 0.85 ? Boolean(from?.toolVisible) : Boolean(to?.toolVisible);
  pose.tool = amount < 0.85 ? from?.tool : to?.tool;
  pose.tier = amount < 0.85 ? from?.tier : to?.tier;
  pose.style = amount < 1 ? from?.style : to?.style;
  pose.faceTarget = amount < 0.7 ? Boolean(from?.faceTarget) : Boolean(to?.faceTarget);
  return pose;
}

export function idleHoePose() {
  const pose = restPose();
  pose.tool = 'hoe';
  pose.tier = 'basic';
  pose.toolVisible = true;
  pose.lanternBelt = 1;
  pose.gripX = 0.24;
  pose.gripY = 0.56;
  pose.gripZ = 0.2;
  pose.toolRotX = 1.18;
  pose.toolRotZ = -0.16;
  pose.bodyLean = 0.04;
  pose.gripNear = 0.06;
  pose.gripFar = 0.4;
  return pose;
}

function applyHoeHold(pose) {
  pose.tool = 'hoe';
  pose.tier = 'basic';
  pose.toolVisible = true;
  pose.lanternBelt = 1;
  pose.gripNear = 0.06;
  pose.gripFar = 0.4;
}

function plantMotion(progress, reduced) {
  // plant xyz, support xyz, lean, drop, armX, armZ, seedShow, seedDrop
  const reach = [0.1, 0.11, 0.38, -0.18, 0.28, 0.14, 0.32, -0.14, 0.72, -1.16, 0, 0];
  if (reduced) return reach;
  return sampleKeys([
    [0, 0.18, 0.5, 0.2, -0.22, 0.44, 0.1, 0.08, -0.02, 0.28, -0.8, 0, 0],
    [0.25, 0.14, 0.24, 0.3, -0.2, 0.32, 0.16, 0.26, -0.11, 0.58, -1.05, 0.2, 0.06],
    [0.4, 0.1, 0.1, 0.38, -0.18, 0.28, 0.14, 0.32, -0.14, 0.72, -1.16, 1, 0.42],
    [0.65, 0.09, 0.11, 0.36, -0.17, 0.26, 0.14, 0.3, -0.13, 0.7, -1.1, 1, 1],
    [0.72, 0.09, 0.07, 0.34, -0.17, 0.26, 0.14, 0.31, -0.14, 0.74, -1.14, 1, 1],
    [0.78, 0.1, 0.17, 0.32, -0.18, 0.28, 0.15, 0.26, -0.11, 0.52, -0.98, 1, 1],
    [0.85, 0.09, 0.09, 0.33, -0.18, 0.27, 0.14, 0.28, -0.12, 0.66, -1.08, 1, 1],
    [1, 0.16, 0.48, 0.2, -0.22, 0.42, 0.1, 0.06, 0, 0.22, -0.75, 1, 1],
  ], progress);
}

function tugMotion(progress, reduced) {
  // grip xyz, support xyz, lean, drop, armX, armZ, liftProduce, hideStanding
  const grip = [0.08, 0.22, 0.36, -0.06, 0.24, 0.34, 0.28, -0.1, 0.62, -1.15, 0, 0];
  if (reduced) return grip;
  return sampleKeys([
    [0, 0.14, 0.52, 0.22, -0.14, 0.48, 0.16, 0.08, 0, 0.28, -0.78, 0, 0],
    [0.25, 0.1, 0.3, 0.34, -0.08, 0.32, 0.32, 0.22, -0.08, 0.5, -1.05, 0, 0.12],
    [0.4, 0.08, 0.21, 0.36, -0.06, 0.23, 0.34, 0.28, -0.1, 0.62, -1.15, 0.05, 0.55],
    [0.55, 0.08, 0.2, 0.36, -0.06, 0.22, 0.34, 0.3, -0.11, 0.68, -1.18, 0.15, 1],
    [0.66, 0.1, 0.42, 0.32, -0.08, 0.44, 0.3, 0.22, -0.07, 0.48, -1, 0.55, 1],
    [0.78, 0.12, 0.62, 0.28, -0.1, 0.6, 0.26, 0.14, -0.04, 0.38, -0.88, 1, 1],
    [0.9, 0.12, 0.58, 0.26, -0.1, 0.56, 0.24, 0.12, -0.03, 0.32, -0.82, 0.95, 1],
    [1, 0.14, 0.5, 0.22, -0.12, 0.48, 0.18, 0.08, -0.01, 0.24, -0.74, 0.55, 1],
  ], progress);
}

function uprootMotion(progress, reduced) {
  // Smaller pull/recover than harvest. liftProduce and hideStanding stay 0.
  const grip = [0.11, 0.32, 0.32, -0.1, 0.3, 0.26, 0.16, -0.06, 0.46, -0.98, 0, 0];
  if (reduced) return grip;
  return sampleKeys([
    [0, 0.14, 0.5, 0.22, -0.14, 0.46, 0.16, 0.06, 0, 0.24, -0.76, 0, 0],
    [0.22, 0.11, 0.34, 0.3, -0.1, 0.34, 0.26, 0.14, -0.05, 0.4, -0.94, 0, 0],
    [0.45, 0.1, 0.26, 0.33, -0.08, 0.28, 0.28, 0.18, -0.07, 0.5, -1.02, 0, 0],
    [0.62, 0.11, 0.36, 0.3, -0.1, 0.34, 0.24, 0.12, -0.04, 0.38, -0.9, 0, 0],
    [0.8, 0.13, 0.46, 0.24, -0.12, 0.42, 0.18, 0.07, -0.02, 0.28, -0.8, 0, 0],
    [1, 0.14, 0.5, 0.22, -0.14, 0.46, 0.16, 0.05, 0, 0.22, -0.74, 0, 0],
  ], progress);
}

function hoeMotion(progress, style, reduced) {
  const rake = style === 'rake';
  const ready = [0.24, 0.56, 0.2, 1.18, -0.16, 0.04, 0, 0, 0];
  if (reduced) return ready;
  const lift = rake
    ? [0.2, 0.7, 0.14, 0.72, -0.1, 0.06, -0.02, -0.02, 0]
    : [0.18, 0.96, 0.08, 0.28, -0.08, 0.1, -0.06, -0.03, 0];
  const drive = [0.12, 0.44, 0.34, 1.42, 0.02, 0.16, 0.05, -0.05, 0.35];
  const level = [0.16, 0.42, 0.28, 1.5, 0.02, 0.12, 0.03, -0.04, 0.35];
  const scrape = rake
    ? [0.14, 0.38, 0.16, 1.58, 0.05, 0.12, 0.04, -0.05, 0.45]
    : [0.1, 0.36, 0.18, 1.62, 0.08, 0.14, 0.04, -0.07, 1];
  const settle = rake
    ? [0.18, 0.46, 0.18, 1.38, 0.02, 0.08, 0.02, -0.03, 0.12]
    : [0.16, 0.42, 0.2, 1.48, 0.04, 0.1, 0.02, -0.03, 0.2];
  const keys = rake
    ? [[0, ...ready], [0.18, ...ready], [0.38, ...lift], [0.52, ...level], [0.7, ...scrape], [0.86, ...settle], [1, ...ready]]
    : [
      [0, ...ready], [0.25, ...ready], [0.45, ...lift], [0.58, ...drive],
      [0.7, ...scrape], [0.85, ...settle], [1, ...ready],
    ];
  return sampleKeys(keys, progress);
}

function strikeMotion(progress, markers, reduced) {
  if (reduced) return { raised: 0.55, struck: 0, impact: 0, stance: 1 };
  const stance = clamp(progress / 0.1, 0, 1);
  let raised = 0;
  let struck = 0;
  let impact = 0;
  for (const marker of markers) {
    const windup = marker - 0.26;
    const recover = marker + 0.07;
    if (progress < windup || progress > recover) continue;
    if (progress <= marker) {
      const t = clamp((progress - windup) / Math.max(1e-6, marker - windup), 0, 1);
      raised = Math.max(raised, t * t);
      if (t > 0.92) impact = Math.max(impact, (t - 0.92) / 0.08);
    } else {
      const t = clamp((progress - marker) / Math.max(1e-6, recover - marker), 0, 1);
      struck = Math.max(struck, 1 - t);
      impact = Math.max(impact, Math.max(0, 1 - t * 2.4));
      raised = Math.max(raised, (1 - t) * 0.2);
    }
  }
  return { raised, struck, impact, stance };
}

// Smooth, continuous anticipation → fast strike → follow-through → recovery.
// The contact frame is part of the arc, not a jump between two poses.
function sampleKeys(keys, phase) {
  let i = 1;
  while (i < keys.length - 1 && phase > keys[i][0]) i++;
  const [a, b] = [keys[i - 1], keys[i]];
  const t = clamp((phase - a[0]) / (b[0] - a[0]), 0, 1);
  const eased = t * t * (3 - 2 * t);
  return a.slice(1).map((value, k) => lerp(value, b[k + 1], eased));
}

export function gatherPose({ progress, style, kind, equipment, reduced = false }) {
  const amount = clamp(Number(progress) || 0, 0, 1);
  const markers = contactMarkers(style);
  const motion = strikeMotion(amount, markers, reduced);
  const { tool, tier } = toolForStyle(style, equipment);
  const pose = restPose();
  pose.active = true;
  pose.style = style;
  pose.tool = tool;
  pose.tier = tier;
  pose.faceTarget = true;
  pose.lanternBelt = 1;
  pose.toolVisible = Boolean(tool);
  pose.impact = reduced ? 0 : motion.impact;

  if (style === 'till' || style === 'rake') {
    applyHoeHold(pose);
    const values = hoeMotion(amount, style, reduced);
    [pose.gripX, pose.gripY, pose.gripZ, pose.toolRotX, pose.toolRotZ,
      pose.bodyLean, pose.bodyYaw, pose.bodyDrop, pose.impact] = values;
    pose.armRotX = pose.toolRotX * 0.22;
    pose.armRotZ = -0.55 + pose.toolRotZ;
    pose.reactTilt = reduced ? 0 : pose.impact * 0.04;
    pose.reactSquash = reduced ? 0 : pose.impact * 0.05;
    if (reduced) pose.impact = 0;
  } else if (tool) {
    const mining = style === 'mine';
    // grip xyz, tool pitch/roll, torso lean/twist/drop. The blade travels in +Z.
    const ready = [0.29, 0.62, 0.25, 0.2, -0.18, 0.02, 0, 0];
    const wind = mining
      ? [0.22, 1.08, 0.10, -0.85, -0.08, -0.12, -0.12, -0.01]
      : [0.46, 0.91, 0.08, -0.42, -0.7, -0.05, -0.32, -0.02];
    const strike = mining
      ? [0.08, 0.82, 0.25, 1.75, 0.05, 0.24, 0.06, -0.07]
      : [0.10, 0.69, 0.38, 1.30, 0.18, 0.14, 0.16, -0.03];
    const follow = mining
      ? [0.08, 0.78, 0.28, 1.85, 0.06, 0.28, 0.07, -0.08]
      : [0.04, 0.65, 0.42, 1.5, 0.3, 0.19, 0.22, -0.05];
    const phase = style === 'cut' ? amount / 0.86 : (amount >= 1 ? 1 : amount * 2 % 1);
    const values = reduced ? ready : sampleKeys([
      [0, ...ready], [0.55, ...wind], [0.84, ...strike], [0.92, ...follow], [1, ...ready],
    ], clamp(phase, 0, 1));
    [pose.gripX, pose.gripY, pose.gripZ, pose.toolRotX, pose.toolRotZ,
      pose.bodyLean, pose.bodyYaw, pose.bodyDrop] = values;
    pose.armRotX = pose.toolRotX * 0.35;
    pose.armRotZ = -0.7 + pose.toolRotZ;
    pose.reactTilt = reduced ? 0 : motion.impact * (mining ? 0.04 : 0.09);
    pose.reactSquash = reduced ? 0 : motion.impact * (mining ? 0.1 : 0.08);
  } else if (style === 'tug' || style === 'uproot') {
    pose.toolVisible = false;
    pose.tool = null;
    pose.tier = null;
    pose.splitHands = 1;
    pose.lanternBelt = 1;
    const values = style === 'uproot' ? uprootMotion(amount, reduced) : tugMotion(amount, reduced);
    [pose.gripX, pose.gripY, pose.gripZ, pose.supportX, pose.supportY, pose.supportZ,
      pose.bodyLean, pose.bodyDrop, pose.armRotX, pose.armRotZ, pose.liftProduce, pose.hideStanding] = values;
    pose.reactTilt = reduced ? 0 : motion.impact * (style === 'uproot' ? 0.03 : 0.05);
    pose.reactSquash = reduced ? 0 : motion.impact * (style === 'uproot' ? 0.02 : 0.04);
  } else if (style === 'plant') {
    pose.toolVisible = false;
    pose.tool = null;
    pose.tier = null;
    pose.splitHands = 1;
    pose.lanternBelt = 1;
    const values = plantMotion(amount, reduced);
    [pose.gripX, pose.gripY, pose.gripZ, pose.supportX, pose.supportY, pose.supportZ,
      pose.bodyLean, pose.bodyDrop, pose.armRotX, pose.armRotZ, pose.seedShow, pose.seedDrop] = values;
    pose.impact = 0;
    pose.reactTilt = 0;
    pose.reactSquash = 0;
  } else {
    const reach = reduced ? 0.55 : clamp((amount - 0.12) / 0.6, 0, 1);
    pose.toolVisible = false;
    pose.tool = null;
    pose.bodyLean = 0.16 + reach * 0.18;
    pose.gripX = 0.2;
    pose.gripY = 0.65 - reach * 0.3;
    pose.gripZ = 0.27 + reach * 0.32;
    pose.bodyDrop = -reach * 0.09;
    pose.armRotX = 0.35 + reach * 0.55;
    pose.armRotZ = -0.85 - reach * 0.55;
    pose.reactTilt = reduced ? 0 : motion.impact * 0.08;
    pose.reactSquash = reduced ? 0 : motion.impact * 0.055;
  }

  pose.armRotZ = clamp(pose.armRotZ, -1.8, 0.9);
  pose.armRotX = clamp(pose.armRotX, -1.4, 1.2);
  pose.bodyLean = clamp(pose.bodyLean, -0.2, 0.45);
  pose.reactTilt = clamp(pose.reactTilt, -0.12, 0.12);
  pose.reactSquash = clamp(pose.reactSquash, 0, 0.14);
  pose.liftProduce = clamp(pose.liftProduce, 0, 1);
  pose.hideStanding = clamp(pose.hideStanding, 0, 1);
  pose.splitHands = clamp(pose.splitHands, 0, 1);
  pose.seedShow = clamp(pose.seedShow, 0, 1);
  pose.seedDrop = clamp(pose.seedDrop, 0, 1);
  return pose;
}

export function crossedMarkers(prevProgress, nextProgress, markers) {
  const prev = Number(prevProgress) || 0;
  const next = Number(nextProgress) || 0;
  const hit = (markers || []).filter(marker => prev < marker && next >= marker);
  if (hit.length === 0) return { markers: [], coalesced: false };
  if (hit.length === 1) return { markers: hit, coalesced: false };
  return { markers: hit, coalesced: true };
}

export function burstCount(kind, eventType = 'contact') {
  if (eventType === 'complete') {
    if (kind === 'tree') return 8;
    if (kind === 'copper') return 7;
    if (kind === 'stone') return 6;
    return 4;
  }
  if (kind === 'copper' || kind === 'tree' || kind === 'stone') return 6;
  if (kind === 'carrot' || kind === 'potato') return eventType === 'complete' ? 6 : 5;
  return 4;
}

export function contactHeight(kind) {
  if (kind === 'tree') return 0.55;
  if (kind === 'stone' || kind === 'copper') return 0.30;
  if (kind === 'carrot' || kind === 'potato' || kind === 'earth') return 0.05;
  if (kind === 'berry') return 0.32;
  return 0.18;
}

export function createCueMemory() {
  let active = null;
  let prevProgress = 0;
  let restore = 1;
  let lastLive = restPose();
  let lastPose = restPose();

  function begin(id, signature) {
    active = { id, signature, fired: new Set() };
    prevProgress = 0;
    restore = 0;
  }

  return {
    start(event) {
      begin(event?.id ?? `${event?.targetId}:${event?.action}:${Date.now()}`, `${event?.action}:${event?.targetId}`);
    },
    cancel(reason = 'cancelled') {
      active = null;
      prevProgress = 0;
      if (reason === 'paused' || reason === 'hidden' || reason === 'replaced') {
        restore = 1;
        lastPose = restPose();
        lastLive = restPose();
      }
    },
    complete() {
      const leftover = [];
      if (active && active.fired.size === 0) {
        leftover.push({ type: 'gatherContact', coalesced: true });
      }
      active = null;
      prevProgress = 1;
      restore = 0;
      return leftover;
    },
    step({ action, kind, equipment, dt = 0, reduced = false, paused = false, idle = null }) {
      const cues = [];
      const rest = idle || restPose();
      if (paused) {
        if (!action) {
          restore = 1;
          lastPose = restPose();
          lastLive = restPose();
        }
        return { pose: lastPose, cues, restore };
      }
      if (!action) {
        restore = Math.min(1, restore + Math.max(0, dt) / RESTORE_SECONDS);
        lastPose = mixPose(lastLive, rest, restore);
        return { pose: lastPose, cues, restore };
      }
      const signature = `${action.type}:${action.targetId}`;
      if (!active || (action.id != null && active.id !== action.id) || (action.id == null && active.signature !== signature)) {
        begin(action.id ?? signature, signature);
      }
      restore = 0;
      const progress = action.duration > 0 ? clamp(action.elapsed / action.duration, 0, 1) : 1;
      const style = motionStyle(kind, action.type);
      const pose = gatherPose({ progress, style, kind, equipment, reduced });
      const markers = contactMarkers(style);
      const crossed = crossedMarkers(prevProgress, progress, markers);
      const fresh = [];
      for (const marker of crossed.markers) {
        if (active.fired.has(marker)) continue;
        active.fired.add(marker);
        fresh.push(marker);
      }
      if (fresh.length && !reduced && style !== 'rake') {
        const visual = style !== 'uproot';
        cues.push({
          type: 'gatherContact',
          kind: contactKind(kind, style),
          source: style === 'till' ? 'earth' : kind,
          style,
          sound: contactSound(style),
          fx: visual,
          x: Number.isFinite(action.x) ? action.x : null,
          z: Number.isFinite(action.z) ? action.z : null,
          coalesced: fresh.length > 1 || crossed.coalesced,
          count: visual ? (style === 'plant' ? 3 : style === 'till' ? 7 : burstCount(kind, 'contact')) : 0,
        });
      }
      prevProgress = progress;
      lastLive = pose;
      lastPose = pose;
      return { pose, cues, restore };
    },
    get activeId() {
      return active?.id ?? null;
    },
  };
}

// Resource colors match assets.js meshes. Overlay FX is pooled 2D, projected from
// world space, so scene.js can keep its small 3D chip burst unchanged.
export const FX_CAP = PARTICLE_CAP;

const FX_WOOD = Object.freeze([0x8a6a48, 0x6a5340, 0x5a4634]);
const FX_LEAF = Object.freeze([0x4c8a4a, 0x3d7358, 0x24503c, 0x4f8a4a]);
const FX_STONE = Object.freeze([0x8a8e92, 0x7a7e82, 0x6a6e72]);
const FX_COPPER = Object.freeze([0xe8b86a, 0xd3924a]);
const FX_BERRY = Object.freeze([0xa33d68, 0xc45a7a]);
const FX_EARTH = Object.freeze([0x5c5348, 0x4a4038, 0x3a2e28]);
const FX_GRASS = Object.freeze([0x6b7a4a, 0x5a8f6e]);
const FX_DRY_GRASS = Object.freeze([0xc4b06a, 0xa89858, 0x8a7840]);
const FX_CARROT = Object.freeze([0xe07030, 0xc45a22]);
const FX_POTATO = Object.freeze([0xc4a05a, 0xa88848]);
const FX_SPARK = Object.freeze([0xffcb83, 0xf1eadb]);
const FX_DUST = Object.freeze([0x9a9488, 0xb0a898]);
const FX_BUSH = Object.freeze([0x2e5a40, 0x3d7358]);

function pickColor(colors) {
  return colors[(Math.random() * colors.length) | 0];
}

function cssHex(value) {
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`;
}

export function fxRecipe(kind, eventType = 'contact') {
  const done = eventType === 'complete';
  const cleared = eventType === 'clear';
  if (eventType === 'till') {
    return [
      { shape: 'chip', colors: FX_EARTH, n: 7, lift: 0, spread: 0.08, out: 0.16, speed: 0.55 },
      { shape: 'fleck', colors: FX_DRY_GRASS, n: 3, lift: 0.03, spread: 0.06, out: 0.1, speed: 0.5 },
    ];
  }
  if (eventType === 'plant') {
    const potato = kind === 'potato';
    return [
      { shape: 'fleck', colors: potato ? FX_POTATO : [0xe8d4a0, 0xe07030], n: potato ? 2 : 3, lift: 0.02, spread: 0.05, out: 0.06 },
      { shape: 'chip', colors: FX_EARTH, n: 3, lift: 0, spread: 0.07, out: 0.22 },
    ];
  }
  if (eventType === 'uproot') {
    const potato = kind === 'potato';
    return [
      { shape: 'fleck', colors: potato ? FX_POTATO : [0xe8d4a0, 0xe07030], n: potato ? 2 : 3, lift: 0.08, spread: 0.05, out: 0.08 },
    ];
  }
  if (kind === 'tree') {
    if (cleared) {
      return [
        { shape: 'chip', colors: FX_WOOD, n: 4, lift: 0, spread: 0.14, out: 0.75 },
        { shape: 'puff', colors: FX_DUST, n: 1, lift: 0.04, spread: 0.08, out: 0 },
      ];
    }
    return [
      { shape: 'chip', colors: FX_WOOD, n: done ? 5 : 3, lift: 0, spread: 0.12, out: 0.9 },
      { shape: 'leaf', colors: FX_LEAF, n: done ? 7 : 4, lift: done ? 0.9 : 0.42, spread: done ? 0.44 : 0.22, out: 0.28 },
      { shape: 'puff', colors: [0x4c8a4a], n: done ? 2 : 1, lift: 0.08, spread: 0.1, out: 0.12 },
    ];
  }
  if (kind === 'stone') {
    return [
      { shape: 'chip', colors: FX_STONE, n: done ? 5 : 3, lift: 0, spread: 0.1, out: 1.15 },
      { shape: 'dust', colors: FX_DUST, n: done ? 3 : 2, lift: 0.02, spread: 0.16, out: 0.22 },
      { shape: 'spark', colors: FX_SPARK, n: done ? 3 : 2, lift: 0.05, spread: 0.07, out: 1.45 },
    ];
  }
  if (kind === 'copper') {
    return [
      { shape: 'chip', colors: FX_STONE, n: done ? 3 : 2, lift: 0, spread: 0.1, out: 1.05 },
      { shape: 'dust', colors: [0x8a6a48, 0x9a9488], n: 2, lift: 0.02, spread: 0.14, out: 0.2 },
      { shape: 'fleck', colors: FX_COPPER, n: done ? 5 : 3, lift: 0.06, spread: 0.08, out: 1.25 },
    ];
  }
  if (kind === 'berry') {
    return [
      { shape: 'petal', colors: FX_BERRY, n: done || cleared ? 4 : 2, lift: 0.08, spread: 0.16, out: 0.35 },
      { shape: 'leaf', colors: FX_BUSH, n: 2, lift: 0.1, spread: 0.14, out: 0.2 },
      { shape: 'puff', colors: [0x2e5a40], n: 1, lift: 0.04, spread: 0.08, out: 0 },
    ];
  }
  if (kind === 'carrot' || kind === 'potato') {
    const produce = kind === 'carrot' ? FX_CARROT : FX_POTATO;
    if (cleared) {
      return [
        { shape: 'chip', colors: FX_EARTH, n: 3, lift: 0, spread: 0.08, out: 0.35 },
        { shape: 'leaf', colors: FX_GRASS, n: 1, lift: 0.04, spread: 0.08, out: 0.12 },
      ];
    }
    return [
      { shape: 'chip', colors: FX_EARTH, n: done ? 6 : 5, lift: 0, spread: 0.1, out: 0.4 },
      { shape: 'leaf', colors: FX_LEAF, n: 2, lift: 0.08, spread: 0.1, out: 0.18 },
      { shape: 'fleck', colors: produce, n: done ? 2 : 0, lift: 0.1, spread: 0.08, out: 0.2 },
    ];
  }
  if (kind === 'twig') {
    return [
      { shape: 'chip', colors: FX_WOOD, n: done ? 3 : 2, lift: 0, spread: 0.12, out: 0.55 },
      { shape: 'puff', colors: FX_DUST, n: 1, lift: 0.02, spread: 0.08, out: 0 },
    ];
  }
  if (kind === 'pebble') {
    return [
      { shape: 'chip', colors: FX_STONE, n: done ? 3 : 2, lift: 0, spread: 0.1, out: 0.7 },
      { shape: 'dust', colors: FX_DUST, n: 2, lift: 0, spread: 0.12, out: 0.16 },
    ];
  }
  return [
    { shape: 'puff', colors: FX_LEAF, n: 2, lift: 0.05, spread: 0.1, out: 0.16 },
    { shape: 'sparkle', colors: FX_SPARK, n: 2, lift: 0.1, spread: 0.1, out: 0.1 },
  ];
}

function shapeMotion(shape) {
  if (shape === 'chip') return { life: 0.48, size: 0.055, gravity: 5.5, drag: 0.55, spin: 9, grow: 0, bounce: 1 };
  if (shape === 'leaf' || shape === 'petal') return { life: 0.84, size: shape === 'petal' ? 0.05 : 0.062, gravity: 1.3, drag: 2.3, spin: 3.2, grow: 0, flutter: 1 };
  if (shape === 'dust') return { life: 0.52, size: 0.1, gravity: 0.5, drag: 2.9, spin: 0, grow: 0.7 };
  if (shape === 'puff') return { life: 0.34, size: 0.12, gravity: 0.15, drag: 1.1, spin: 0, grow: 0.85 };
  if (shape === 'spark' || shape === 'fleck') return { life: shape === 'fleck' ? 0.32 : 0.22, size: 0.028, gravity: 1.5, drag: 0.35, spin: 11, grow: 0 };
  if (shape === 'sparkle') return { life: 0.5, size: 0.038, gravity: 0.22, drag: 1.5, spin: 4, grow: 0.25, pulse: 1 };
  return { life: 0.4, size: 0.05, gravity: 3, drag: 1, spin: 4, grow: 0 };
}

function shapeSpeed(shape) {
  if (shape === 'chip') return 0.85 + Math.random() * 0.85;
  if (shape === 'leaf' || shape === 'petal') return 0.22 + Math.random() * 0.5;
  if (shape === 'dust' || shape === 'puff') return 0.08 + Math.random() * 0.28;
  if (shape === 'spark' || shape === 'fleck') return 1.25 + Math.random() * 0.95;
  if (shape === 'sparkle') return 0.08 + Math.random() * 0.18;
  return 0.5;
}

export function createGatherFx() {
  const pool = [];
  let overlay = null;
  let source = null;
  let ctx = null;
  let dpr = 1;

  function acquire() {
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].life <= 0) return pool[i];
    }
    if (pool.length >= FX_CAP) {
      let oldest = pool[0];
      for (let i = 1; i < pool.length; i++) {
        if (pool[i].life < oldest.life) oldest = pool[i];
      }
      return oldest;
    }
    const particle = {
      life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      size: 0.05, spin: 0, spinV: 0, gravity: 4, drag: 1, grow: 0,
      flutter: 0, bounce: 0, pulse: 0, phase: 0, shape: 'chip', color: '#8a6a48',
    };
    pool.push(particle);
    return particle;
  }

  function spawn(origin, recipe, outward) {
    const motion = shapeMotion(recipe.shape);
    const speed = shapeSpeed(recipe.shape) * (recipe.speed || 1);
    const yaw = Math.random() * Math.PI * 2;
    const lift = 0.35 + Math.random() * 0.75;
    const particle = acquire();
    particle.shape = recipe.shape;
    particle.color = cssHex(pickColor(recipe.colors));
    particle.life = particle.max = motion.life * (0.86 + Math.random() * 0.28);
    particle.size = motion.size * (0.75 + Math.random() * 0.5);
    particle.gravity = motion.gravity;
    particle.drag = motion.drag;
    particle.grow = motion.grow || 0;
    particle.flutter = motion.flutter || 0;
    particle.bounce = motion.bounce || 0;
    particle.pulse = motion.pulse || 0;
    particle.phase = Math.random() * Math.PI * 2;
    particle.spin = Math.random() * Math.PI * 2;
    particle.spinV = (Math.random() - 0.5) * motion.spin;
    particle.x = origin.x + (Math.random() - 0.5) * recipe.spread;
    particle.y = Math.max(0.04, origin.y + recipe.lift + Math.random() * recipe.spread * 0.35);
    particle.z = origin.z + (Math.random() - 0.5) * recipe.spread;
    particle.vx = Math.cos(yaw) * speed * 0.55 + outward.x * recipe.out;
    particle.vy = lift * speed * (recipe.shape === 'puff' ? 0.25 : 1);
    particle.vz = Math.sin(yaw) * speed * 0.55 + outward.z * recipe.out;
  }

  function burst(player, resource, kind, eventType = 'contact', reduced = false) {
    if (reduced || !kind) return;
    const recipes = fxRecipe(kind, eventType);
    const height = contactHeight(kind);
    const origin = resource
      ? nearContactPoint(player, resource, height)
      : { x: player?.x || 0, y: height, z: player?.z || 0 };
    const dx = (resource?.x || origin.x) - (player?.x || origin.x);
    const dz = (resource?.z || origin.z) - (player?.z || origin.z);
    const dist = Math.hypot(dx, dz) || 1;
    const outward = { x: dx / dist, z: dz / dist };
    for (const recipe of recipes) {
      const want = Math.min(recipe.n, 8);
      for (let i = 0; i < want; i++) spawn(origin, recipe, outward);
    }
  }

  function attach(host, canvas) {
    if (overlay || !host || !canvas) return;
    source = canvas;
    overlay = document.createElement('canvas');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    host.insertBefore(overlay, canvas.nextSibling);
    ctx = overlay.getContext('2d');
    resize();
  }

  function resize() {
    if (!overlay || !source || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, source.clientWidth);
    const height = Math.max(1, source.clientHeight);
    overlay.width = Math.max(1, Math.floor(width * dpr));
    overlay.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clear() {
    for (const particle of pool) {
      particle.life = 0;
    }
    if (ctx && source) ctx.clearRect(0, 0, source.clientWidth, source.clientHeight);
  }

  function dispose() {
    clear();
    overlay?.remove();
    overlay = null;
    source = null;
    ctx = null;
  }

  function drawParticle(particle, sx, sy, px) {
    const t = particle.life / particle.max;
    const grow = 1 + particle.grow * (1 - t);
    const pulse = particle.pulse ? 0.75 + Math.sin(particle.phase) * 0.25 : 1;
    const haze = particle.shape === 'dust' || particle.shape === 'puff';
    const radius = Math.min(haze ? 18 : 14, Math.max(2.4, px * grow * pulse));
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(particle.spin);
    if (haze) ctx.globalAlpha = t * 0.3;
    else if (particle.shape === 'spark' || particle.shape === 'fleck' || particle.shape === 'sparkle') ctx.globalAlpha = t * 0.9;
    else ctx.globalAlpha = t * 0.84;
    ctx.fillStyle = particle.color;
    if (particle.shape === 'chip') {
      ctx.fillRect(-radius, -radius * 0.4, radius * 2, radius * 0.8);
    } else if (particle.shape === 'leaf' || particle.shape === 'petal') {
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (particle.shape === 'spark' || particle.shape === 'fleck' || particle.shape === 'sparkle') {
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius * 0.32, 0);
      ctx.lineTo(0, radius);
      ctx.lineTo(-radius * 0.32, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function step(dt, project, zoom = 1) {
    const slice = Math.min(Math.max(0, dt), 0.05);
    const paused = !(slice > 0);
    if (!paused) {
      for (const particle of pool) {
        if (particle.life <= 0) continue;
        particle.life -= slice;
        if (particle.life <= 0) {
          particle.life = 0;
          continue;
        }
        const drag = Math.max(0, 1 - particle.drag * slice);
        particle.vx *= drag;
        particle.vz *= drag;
        particle.vy -= particle.gravity * slice;
        if (particle.flutter) {
          particle.phase += slice * 7;
          particle.vx += Math.sin(particle.phase) * slice * 0.85;
          particle.vz += Math.cos(particle.phase * 0.8) * slice * 0.55;
        }
        if (particle.pulse) particle.phase += slice * 10;
        particle.x += particle.vx * slice;
        particle.y += particle.vy * slice;
        particle.z += particle.vz * slice;
        particle.spin += particle.spinV * slice;
        if (particle.y < 0.03 && particle.vy < 0) {
          particle.y = 0.03;
          if (particle.bounce > 0) {
            particle.vy *= -0.28;
            particle.bounce = 0;
          } else {
            particle.vy = 0;
            particle.vx *= 0.7;
            particle.vz *= 0.7;
          }
        }
      }
    }
    if (!ctx || !source) return;
    ctx.clearRect(0, 0, source.clientWidth, source.clientHeight);
    const unit = 4.6 + Math.max(1, zoom) * 1.2;
    for (const particle of pool) {
      if (particle.life <= 0 || !project) continue;
      const screen = project(particle.x, particle.y, particle.z);
      if (!screen?.visible) continue;
      drawParticle(particle, screen.x, screen.y, (particle.size / 0.05) * unit);
    }
  }

  function liveCount() {
    let n = 0;
    for (const particle of pool) if (particle.life > 0) n += 1;
    return n;
  }

  return {
    attach,
    resize,
    clear,
    dispose,
    burst,
    liveCount,
    step,
    ingest(cue, player, resource, reduced = false) {
      if (!cue || cue.type !== 'gatherContact' || cue.fx === false) return;
      const eventType = cue.style === 'cut' || cue.style === 'pull' ? 'clear'
        : cue.style === 'plant' ? 'plant'
        : cue.style === 'uproot' ? 'uproot'
        : cue.style === 'till' ? 'till'
        : 'contact';
      const target = resource || (Number.isFinite(cue.x) && Number.isFinite(cue.z)
        ? { x: cue.x, z: cue.z, radius: 0.45, kind: cue.source }
        : null);
      burst(player, target, cue.source || target?.kind, eventType, reduced);
    },
  };
}
