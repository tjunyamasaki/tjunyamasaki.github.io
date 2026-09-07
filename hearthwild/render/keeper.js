import {
  restPose,
} from './gathering.mjs';
import { KEEPER_ANIM, KEEPER_VARIANT_DEFAULT, normalizeKeeperVariant } from '../data/tuning.mjs';

const HAND_LANTERN = { x: 0.46, y: 0.57, z: 0.18 };
const BELT_LANTERN = { x: -0.28, y: 0.4, z: 0.12 };

let selectedVariant = KEEPER_VARIANT_DEFAULT;

export function getKeeperVariant() {
  return selectedVariant;
}

export function setKeeperVariant(value) {
  selectedVariant = normalizeKeeperVariant(value);
  return selectedVariant;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createKeeperRig(T, { mesh, geometries, registry, glow, trackGeo }) {
  const root = new T.Group();
  const body = new T.Group();
  root.add(body);

  const cloakOutfit = new T.Group();
  cloakOutfit.name = 'outfit-cloak';
  body.add(cloakOutfit);
  mesh(trackGeo(new T.ConeGeometry(0.3, 0.72, 7)), registry.meshMaterial(0xca987b), cloakOutfit, 0, 0.54, 0);
  mesh(geometries.stone, registry.meshMaterial(0xe9bd92), cloakOutfit, 0, 0.99, 0.015, 0.23, 0.25, 0.21);
  mesh(geometries.stone, registry.meshMaterial(0x283b44), cloakOutfit, 0, 0.99, 0.155, 0.16, 0.17, 0.095);
  const hood = mesh(geometries.cone, registry.meshMaterial(0xdba486), cloakOutfit, 0, 1.16, -0.06, 0.26, 0.29, 0.25);
  hood.rotation.x = -0.23;

  const brimOutfit = new T.Group();
  brimOutfit.name = 'outfit-brim';
  brimOutfit.visible = false;
  body.add(brimOutfit);
  mesh(geometries.cube, registry.meshMaterial(0x293740), brimOutfit, 0, 0.28, 0.02, 0.3, 0.34, 0.22);
  mesh(geometries.cube, registry.meshMaterial(0x3d7358), brimOutfit, 0, 0.58, 0.02, 0.46, 0.38, 0.3);
  mesh(geometries.cube, registry.meshMaterial(0x24503c), brimOutfit, 0, 0.72, 0.04, 0.36, 0.08, 0.26);
  mesh(geometries.cube, registry.meshMaterial(0x8a6a48), brimOutfit, 0.12, 0.56, 0.16, 0.06, 0.06, 0.04);
  mesh(geometries.cube, registry.meshMaterial(0x8a6a48), brimOutfit, -0.08, 0.5, 0.16, 0.05, 0.05, 0.035);
  const bedroll = mesh(geometries.cylinder, registry.meshMaterial(0x6a5340), brimOutfit, 0, 0.68, -0.2, 0.11, 0.34, 0.11);
  bedroll.rotation.z = Math.PI / 2;
  mesh(geometries.cube, registry.meshMaterial(0x715849), brimOutfit, -0.22, 0.42, 0.08, 0.16, 0.18, 0.12);
  const scarfTails = [-0.08, 0.05].map((x, i) => {
    const tail = mesh(geometries.cube, registry.meshMaterial(0xa33d68), brimOutfit, x, 0.78, 0.12, 0.07, 0.16 + i * 0.04, 0.04);
    tail.rotation.z = i ? 0.35 : -0.2;
    return tail;
  });
  const brimHead = new T.Group();
  brimHead.position.set(0, 0.9, 0.02);
  brimOutfit.add(brimHead);
  mesh(geometries.stone, registry.meshMaterial(0xe9bd92), brimHead, 0, 0.08, 0, 0.24, 0.26, 0.23);
  mesh(geometries.stone, registry.meshMaterial(0x283b44), brimHead, 0.055, 0.1, 0.16, 0.055, 0.06, 0.045);
  mesh(geometries.stone, registry.meshMaterial(0x283b44), brimHead, -0.055, 0.1, 0.16, 0.055, 0.06, 0.045);
  const hat = new T.Group();
  hat.position.set(0, 0.2, -0.02);
  brimHead.add(hat);
  mesh(geometries.cylinder, registry.meshMaterial(0x6a5340), hat, 0, 0.02, 0, 0.4, 0.035, 0.4);
  mesh(geometries.cylinder, registry.meshMaterial(0x8a6a48), hat, 0, 0.12, 0, 0.2, 0.16, 0.2);
  mesh(geometries.cylinder, registry.meshMaterial(0x5a8f6e), hat, 0, 0.05, 0, 0.21, 0.03, 0.21);
  mesh(geometries.cone, registry.meshMaterial(0x3d7358), hat, 0.14, 0.16, 0.08, 0.05, 0.1, 0.05);
  mesh(geometries.stone, registry.meshMaterial(0xa33d68), hat, 0.14, 0.2, 0.08, 0.04);

  const cloakFeet = [-1, 1].map(side => mesh(geometries.cube, registry.meshMaterial(0x293740), root, side * 0.12, 0.1, 0, 0.13, 0.18, 0.22));
  const brimFeet = [-1, 1].map(side => {
    const boot = mesh(geometries.cube, registry.meshMaterial(0x3a2e28), root, side * 0.16, 0.09, 0.02, 0.15, 0.16, 0.26);
    boot.visible = false;
    return boot;
  });
  const feet = cloakFeet;

  const cloakLimbMat = registry.meshMaterial(0xdca480);
  const brimLimbMat = registry.meshMaterial(0xffdf9c);
  const arms = [-1, 1].map(side => ({
    side,
    upper: mesh(geometries.cylinder, cloakLimbMat, root, 0, 0, 0, 0.085, 1, 0.085),
    fore: mesh(geometries.cylinder, cloakLimbMat, root, 0, 0, 0, 0.067, 1, 0.067),
    hand: mesh(geometries.stone, registry.meshMaterial(0xe9bd92), root, 0, 0, 0, 0.09, 0.095, 0.09),
  }));
  for (const arm of arms) arm.hand.name = arm.side === 1 ? 'hand-right' : 'hand-left';
  const toolGrip = new T.Group();
  root.add(toolGrip);
  const wood = registry.meshMaterial(0x6a5340);
  const band = registry.meshMaterial(0xe9bd92);
  const toolHeads = [];
  const axe = new T.Group(), pick = new T.Group(), hoe = new T.Group();
  axe.name = 'axe';
  pick.name = 'pick';
  hoe.name = 'hoe';
  toolGrip.add(axe, pick, hoe);
  const bladeShape = new T.Shape();
  bladeShape.moveTo(-0.10, -0.07); bladeShape.lineTo(0.09, -0.11);
  bladeShape.lineTo(0.35, -0.19); bladeShape.lineTo(0.36, 0.20);
  bladeShape.lineTo(0.07, 0.12); bladeShape.lineTo(-0.10, 0.08); bladeShape.closePath();
  const bladeGeo = trackGeo(new T.ExtrudeGeometry(bladeShape, { depth: 0.12, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.025, bevelThickness: 0.02 }));
  for (const tool of [axe, pick]) {
    mesh(geometries.cylinder, wood, tool, 0, 0.29, 0, 0.045, 0.95, 0.045);
    for (const y of [-0.1, -0.02, 0.06, 0.53]) mesh(geometries.cylinder, band, tool, 0, y, 0, 0.052, 0.035, 0.052);
    for (const copper of [false, true]) {
      const group = new T.Group(); tool.add(group);
      group.name = `${tool === axe ? 'axe' : 'pick'}-${copper ? 'copper' : 'stone'}-head`;
      group.rotation.y = -Math.PI / 2;
      const metal = registry.meshMaterial(copper ? 0xd3924a : 0x9ea38a, { roughness: 0.6, metalness: 0.25 });
      if (tool === axe) {
        mesh(bladeGeo, metal, group, 0, 0.65, -0.06);
      } else {
        mesh(geometries.cube, metal, group, 0, 0.68, 0, 0.42, 0.15, 0.16);
        for (const side of [-1, 1]) {
          const tip = mesh(geometries.cone, metal, group, side * 0.29, 0.61, 0, 0.085, 0.34, 0.085);
          tip.rotation.z = -side * 2.05;
        }
      }
      toolHeads.push({ group, copper });
    }
  }
  mesh(geometries.cylinder, wood, hoe, 0, 0.425, 0, 0.038, 0.85, 0.038);
  for (const y of [0.1, 0.28, 0.7]) mesh(geometries.cylinder, band, hoe, 0, y, 0, 0.046, 0.03, 0.046);
  const hoeHead = new T.Group();
  hoeHead.name = 'hoe-head';
  hoeHead.position.set(0, 0.82, 0);
  hoeHead.rotation.x = Math.PI / 2;
  hoe.add(hoeHead);
  const hoeMetal = registry.meshMaterial(0x4a4c48, { roughness: 0.55, metalness: 0.28 });
  const hoeShape = new T.Shape();
  hoeShape.moveTo(-0.11, 0);
  hoeShape.lineTo(0.11, 0);
  hoeShape.lineTo(0.125, 0.18);
  hoeShape.lineTo(-0.125, 0.18);
  hoeShape.closePath();
  const hoeBladeGeo = trackGeo(new T.ExtrudeGeometry(hoeShape, {
    depth: 0.04, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.012, bevelThickness: 0.01,
  }));
  mesh(hoeBladeGeo, hoeMetal, hoeHead, 0, 0, -0.02);
  const upAxis = new T.Vector3(0, 1, 0);
  const delta = new T.Vector3();
  function segment(object, a, b, width) {
    delta.subVectors(b, a);
    object.position.copy(a).add(b).multiplyScalar(0.5);
    object.scale.set(width, delta.length(), width);
    object.quaternion.setFromUnitVectors(upAxis, delta.normalize());
  }

  const lantern = new T.Group();
  lantern.position.set(HAND_LANTERN.x, HAND_LANTERN.y, HAND_LANTERN.z);
  body.add(lantern);
  mesh(geometries.cylinder, registry.meshMaterial(0x715849), lantern, 0, -0.16, 0, 0.14, 0.055, 0.14);
  mesh(geometries.cylinder, registry.meshMaterial(0x715849), lantern, 0, 0.16, 0, 0.14, 0.055, 0.14);
  mesh(geometries.cube, registry.meshMaterial(0xffdf9c, { emissive: 0xffcb83, emissiveIntensity: 2.5 }), lantern, 0, 0, 0, 0.15, 0.26, 0.15);
  glow(lantern, 0xffcb83, 0.85, 0, 0, 0, 0.32);
  const lamp = new T.PointLight(0xffcb83, 1.25, 5, 2);
  lantern.add(lamp);
  registry.registerLight(lamp);

  const ring = new T.Mesh(geometries.ring, registry.basicMaterial(0xffcb83, {
    transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.scale.setScalar(0.42);
  root.add(ring);

  let presentedYaw = 0;
  let walkMix = 0;
  let idleMix = 0;
  let shownVariant = KEEPER_VARIANT_DEFAULT;

  function showTool(pose) {
    const useAxe = pose.toolVisible && pose.tool === 'axe';
    const usePick = pose.toolVisible && pose.tool === 'pick';
    const useHoe = pose.toolVisible && pose.tool === 'hoe';
    axe.visible = useAxe;
    pick.visible = usePick;
    hoe.visible = useHoe;
    const copper = pose.tier === 'copper';
    toolHeads.forEach(head => { head.group.visible = head.copper === copper; });
  }

  function showOutfit(variant) {
    const brim = variant === 'brim';
    cloakOutfit.visible = !brim;
    brimOutfit.visible = brim;
    cloakFeet.forEach(foot => { foot.visible = !brim; });
    brimFeet.forEach(foot => { foot.visible = brim; });
    const limb = brim ? brimLimbMat : cloakLimbMat;
    for (const arm of arms) {
      arm.upper.material = limb;
      arm.fore.material = limb;
    }
    if (!brim) {
      body.rotation.z = 0;
      brimHead.rotation.set(0, 0, 0);
      hat.rotation.set(0, 0, 0);
    }
    shownVariant = variant;
  }

  function apply({ pose, gather, moving, reduced, time, dt, variant: requested }) {
    const variant = normalizeKeeperVariant(requested ?? selectedVariant);
    if (variant !== shownVariant) showOutfit(variant);
    const view = gather || restPose();
    const anim = KEEPER_ANIM[variant] || KEEPER_ANIM.cloak;
    const ease = 1 - Math.exp(-Math.max(dt, 0.016) * 14);
    const canLocomote = !view.active && !reduced;
    if (reduced) {
      walkMix = 0;
      idleMix = 0;
    } else {
      walkMix += ((moving && canLocomote ? 1 : 0) - walkMix) * ease;
      idleMix += ((!moving && canLocomote ? 1 : 0) - idleMix) * ease;
    }

    const cloakWalk = variant === 'cloak' && moving && !reduced && !view.active;
    const walkBob = variant === 'cloak'
      ? (cloakWalk ? Math.sin(time * 8) * 0.018 : 0)
      : Math.sin(time * anim.walkFreq) * anim.walkBob * walkMix;
    const stride = variant === 'cloak'
      ? (cloakWalk ? Math.sin(time * 8) * 0.045 : 0)
      : Math.sin(time * anim.walkFreq) * anim.walkStride * walkMix;
    const breath = variant === 'brim' ? Math.sin(time * 1.65) * anim.idleBreath * idleMix : 0;
    const sway = variant === 'brim' ? Math.sin(time * 0.72) * anim.idleSway * idleMix : 0;

    root.position.set(pose.x, 0, pose.z);
    const targetYaw = view.faceTarget && Number.isFinite(view.facingYaw) ? view.facingYaw : pose.facing;
    if (!Number.isFinite(presentedYaw)) presentedYaw = pose.facing;
    const turn = Math.atan2(Math.sin(targetYaw - presentedYaw), Math.cos(targetYaw - presentedYaw));
    presentedYaw += turn * (reduced ? 1 : ease);
    root.rotation.y = presentedYaw;

    body.position.y = walkBob + view.bodyDrop + breath;
    body.rotation.x = view.bodyLean + (variant === 'brim' ? anim.walkLean * walkMix : 0);
    body.rotation.y = view.bodyYaw + (variant === 'brim' ? Math.sin(time * anim.walkFreq) * anim.walkYaw * walkMix : 0);
    if (variant === 'brim') {
      body.rotation.z = sway + Math.sin(time * anim.walkFreq) * anim.walkRoll * walkMix;
    } else {
      body.rotation.z *= 1 - ease;
    }

    toolGrip.position.set(view.gripX, view.gripY, view.gripZ);
    toolGrip.rotation.set(view.toolRotX, view.toolRotY, view.toolRotZ);
    toolGrip.updateMatrix();
    const shoulderY = 0.77 + view.bodyDrop + (variant === 'brim' ? -0.05 + breath : 0);
    const shoulderX = variant === 'brim' ? 0.28 : 0.25;
    for (const arm of arms) {
      const shoulder = new T.Vector3(arm.side * shoulderX, shoulderY, variant === 'brim' ? 0.02 : 0.04);
      let hand;
      if (view.toolVisible) {
        const along = arm.side === 1 ? (view.gripNear ?? 0) : (view.gripFar ?? 0.2);
        hand = new T.Vector3(0, along, 0).applyMatrix4(toolGrip.matrix);
      } else if (view.active && (view.splitHands > 0.2 || view.style === 'plant' || view.style === 'tug' || view.style === 'uproot')) {
        hand = arm.side === 1
          ? new T.Vector3(view.gripX, view.gripY, view.gripZ)
          : new T.Vector3(view.supportX ?? -0.22, view.supportY ?? 0.44, view.supportZ ?? 0.12);
      } else if (view.active) {
        hand = new T.Vector3(arm.side * view.gripX, view.gripY, view.gripZ);
      } else if (variant === 'brim') {
        const swing = Math.sin(time * anim.walkFreq) * 0.16 * walkMix;
        const fidget = Math.sin(time * 2.15 + arm.side) * 0.045 * idleMix;
        hand = new T.Vector3(
          arm.side * (0.34 + fidget),
          0.46 + breath + Math.abs(swing) * 0.04,
          arm.side * swing + 0.06,
        );
      } else {
        hand = new T.Vector3(arm.side * 0.35, 0.44, arm.side === 1 ? 0.2 : -stride);
      }
      const elbow = shoulder.clone().lerp(hand, 0.5);
      elbow.x += arm.side * 0.15;
      elbow.y -= variant === 'brim' ? 0.14 : 0.12;
      segment(arm.upper, shoulder, elbow, 0.083);
      segment(arm.fore, elbow, hand, 0.065);
      arm.hand.position.copy(hand);
    }
    showTool(view);

    const belt = view.lanternBelt || 0;
    lantern.position.x += (lerp(HAND_LANTERN.x, BELT_LANTERN.x, belt) - lantern.position.x) * ease;
    lantern.position.y += (lerp(HAND_LANTERN.y, BELT_LANTERN.y, belt) - lantern.position.y) * ease;
    lantern.position.z += (lerp(HAND_LANTERN.z, BELT_LANTERN.z, belt) - lantern.position.z) * ease;
    lantern.rotation.z = view.active
      ? Math.sin(time * 2) * 0.03
      : Math.sin(time * (variant === 'brim' ? 2.35 : 3)) * (variant === 'brim' ? 0.1 : 0.08);

    if (variant === 'brim') {
      brimHead.rotation.x = Math.sin(time * 1.12) * anim.idleNod * idleMix;
      brimHead.rotation.z = Math.sin(time * 0.9) * 0.045 * idleMix;
      hat.rotation.z = Math.sin(time * 1.4) * 0.03 * idleMix;
      scarfTails.forEach((tail, i) => {
        tail.rotation.x = Math.sin(time * 2.4 + i) * (0.12 * idleMix + 0.18 * walkMix);
      });
      brimFeet.forEach((foot, i) => {
        const phase = time * anim.walkFreq + (i ? Math.PI : 0);
        const nextZ = view.active ? (i ? 0.14 : -0.09) : Math.sin(phase) * anim.walkStride * walkMix;
        foot.position.z += (nextZ - foot.position.z) * ease;
        const lift = view.active || reduced ? 0 : Math.max(0, Math.sin(phase + Math.PI * 0.5)) * anim.footLift * walkMix;
        foot.position.y += (0.09 + lift - foot.position.y) * ease;
      });
    } else {
      brimHead.rotation.set(0, 0, 0);
      hat.rotation.z = 0;
      cloakFeet.forEach((foot, i) => {
        const next = view.active ? (i ? 0.14 : -0.09) : (i ? -stride : stride);
        foot.position.z += (next - foot.position.z) * ease;
      });
    }
    ring.material.opacity = 0.15 + Math.sin(time * 2) * 0.035;
  }

  function reset() {
    presentedYaw = 0;
    walkMix = 0;
    idleMix = 0;
    body.position.y = 0;
    body.rotation.set(0, 0, 0);
    brimHead.rotation.set(0, 0, 0);
    hat.rotation.set(0, 0, 0);
    toolGrip.rotation.set(0, 0, 0);
    lantern.position.set(HAND_LANTERN.x, HAND_LANTERN.y, HAND_LANTERN.z);
    lantern.rotation.set(0, 0, 0);
    axe.visible = false;
    pick.visible = false;
    hoe.visible = false;
    cloakFeet.forEach(foot => { foot.position.z = 0; foot.position.y = 0.1; });
    brimFeet.forEach(foot => { foot.position.z = 0.02; foot.position.y = 0.09; });
    showOutfit(selectedVariant);
  }

  reset();
  return { root, body, feet, lantern, lamp, ring, apply, reset, showOutfit };
}
