import test from 'node:test';
import assert from 'node:assert/strict';
import { HARVEST, CLEAR } from '../data/harvest.mjs';
import {
  TWO_STRIKE_MARKERS, ONE_REACH_MARKERS, TILL_MARKERS, PLANT_MARKERS, UPROOT_MARKERS, RESTORE_SECONDS, PARTICLE_CAP,
  burstCount, contactHeight, contactKind, contactMarkers, contactSound, crossedMarkers, createCueMemory, createGatherFx,
  facingTo, fxRecipe, gatherPose, idleHoePose, mixPose, motionStyle, nearContactPoint, restPose, toolForStyle,
} from '../render/gathering.mjs';

function assertBounded(pose, label = 'pose') {
  for (const [key, value] of Object.entries(pose)) {
    if (typeof value !== 'number') continue;
    assert.equal(Number.isFinite(value), true, `${label}.${key} finite`);
    assert.ok(Math.abs(value) < 8, `${label}.${key}=${value}`);
  }
  assert.ok(pose.armRotZ > -2 && pose.armRotZ < 1.2, `${label} arm`);
  assert.ok(pose.reactSquash >= 0 && pose.reactSquash <= 0.2, `${label} squash`);
}

const stoneKit = { stoneAxe: true, stonePick: true, copperAxe: false, copperPick: false };
const copperKit = { stoneAxe: true, stonePick: true, copperAxe: true, copperPick: true };

test('progress endpoints stay finite and rest is the idle arm pose', () => {
  const rest = restPose();
  assert.equal(rest.armRotZ, -0.7);
  assert.equal(rest.toolVisible, false);
  assertBounded(rest, 'rest');
  for (const style of ['chop', 'mine', 'reach', 'cut', 'pull', 'tug', 'till', 'rake', 'plant', 'uproot']) {
    for (const progress of [0, 0.42, 0.72, 0.92, 1]) {
      const pose = gatherPose({ progress, style, kind: 'tree', equipment: stoneKit });
      assertBounded(pose, `${style}@${progress}`);
    }
  }
});

test('tool and motion style follow the action, not a second hit counter', () => {
  assert.equal(motionStyle('tree', 'harvest'), 'chop');
  assert.equal(motionStyle('stone', 'harvest'), 'mine');
  assert.equal(motionStyle('copper', 'harvest'), 'mine');
  assert.equal(motionStyle('berry', 'harvest'), 'reach');
  assert.equal(motionStyle('carrot', 'harvest'), 'tug');
  assert.equal(motionStyle('potato', 'harvest'), 'tug');
  assert.equal(motionStyle('tree', 'clear'), 'cut');
  assert.equal(motionStyle('berry', 'clear'), 'pull');
  assert.deepEqual(toolForStyle('chop', copperKit), { tool: 'axe', tier: 'copper' });
  assert.deepEqual(toolForStyle('mine', copperKit), { tool: 'pick', tier: 'copper' });
  assert.deepEqual(toolForStyle('reach', stoneKit), { tool: null, tier: null });
  assert.deepEqual(toolForStyle('till', stoneKit), { tool: 'hoe', tier: 'basic' });
  assert.deepEqual(toolForStyle('rake', stoneKit), { tool: 'hoe', tier: 'basic' });
  assert.equal(motionStyle(null, 'till'), 'till');
  assert.equal(motionStyle(null, 'smoothSoil'), 'rake');
  assert.equal(motionStyle('carrot', 'plantCrop'), 'plant');
  assert.equal(motionStyle('potato', 'plantCrop'), 'plant');
  assert.equal(motionStyle('carrot', 'harvestCrop'), 'tug');
  assert.equal(motionStyle('potato', 'harvestCrop'), 'tug');
  assert.equal(motionStyle('carrot', 'uprootCrop'), 'uproot');
  assert.equal(motionStyle('potato', 'uprootCrop'), 'uproot');
  assert.deepEqual(toolForStyle('plant', stoneKit), { tool: null, tier: null });
  assert.deepEqual(toolForStyle('tug', stoneKit), { tool: null, tier: null });
  assert.deepEqual(toolForStyle('uproot', stoneKit), { tool: null, tier: null });
  assert.deepEqual(contactMarkers('plant'), PLANT_MARKERS);
  assert.deepEqual(contactMarkers('uproot'), UPROOT_MARKERS);
  assert.equal(contactSound('till'), 'thud');
  assert.equal(contactSound('plant'), 'rustle');
  assert.equal(contactSound('tug'), 'pull');
  assert.equal(contactSound('uproot'), 'pull');
  assert.equal(contactSound('chop'), null);
  assert.equal(contactSound('rake'), null);
  const chop = gatherPose({ progress: 0.5, style: 'chop', kind: 'tree', equipment: copperKit });
  assert.equal(chop.tool, 'axe');
  assert.equal(chop.tier, 'copper');
  assert.equal(chop.toolVisible, true);
  const reach = gatherPose({ progress: 0.5, style: 'reach', kind: 'berry', equipment: stoneKit });
  assert.equal(reach.toolVisible, false);
  assert.equal(reach.lanternBelt, 1);
});

test('trees and stone use two strikes; short forage uses one reach', () => {
  assert.deepEqual(contactMarkers('chop'), TWO_STRIKE_MARKERS);
  assert.deepEqual(contactMarkers('mine'), TWO_STRIKE_MARKERS);
  assert.deepEqual(contactMarkers('reach'), ONE_REACH_MARKERS);
  assert.deepEqual(contactMarkers('till'), TILL_MARKERS);
  assert.equal(TWO_STRIKE_MARKERS[1], 0.92);

  assert.equal(HARVEST.tree.duration.stone, 2);
  assert.equal(HARVEST.tree.duration.copper, 1.2);
  assert.equal(HARVEST.copper.duration.copper, 1.8);
  assert.equal(HARVEST.berry.duration, 0.6);
  assert.equal(HARVEST.twig.duration, 0.4);
  assert.equal(HARVEST.carrot.duration, 0.9);
  assert.equal(HARVEST.potato.duration, 0.9);
  assert.equal(CLEAR.carrot.duration, 0.6);
  assert.equal(CLEAR.stump.duration, 0.5);
});

test('reduced motion keeps a stable working pose without impact pulses', () => {
  const swinging = gatherPose({ progress: 0.92, style: 'chop', kind: 'tree', equipment: stoneKit, reduced: false });
  const still = gatherPose({ progress: 0.92, style: 'chop', kind: 'tree', equipment: stoneKit, reduced: true });
  assert.equal(still.toolVisible, true);
  assert.equal(still.impact, 0);
  assert.equal(still.reactSquash, 0);
  assert.notEqual(swinging.armRotZ, still.armRotZ);
  const later = gatherPose({ progress: 0.42, style: 'chop', kind: 'tree', equipment: stoneKit, reduced: true });
  assert.equal(later.armRotZ, still.armRotZ);
});

test('contact markers fire once per action instance and coalesce skipped frames', () => {
  const memory = createCueMemory();
  memory.start({ id: 1, targetId: 'tree-0', action: 'harvest' });
  const first = memory.step({
    action: { id: 1, type: 'harvest', targetId: 'tree-0', elapsed: 1.9, duration: 2 },
    kind: 'tree',
    equipment: stoneKit,
    dt: 1 / 30,
  });
  assert.equal(first.cues.length, 1);
  assert.equal(first.cues[0].coalesced, true);
  const again = memory.step({
    action: { id: 1, type: 'harvest', targetId: 'tree-0', elapsed: 1.95, duration: 2 },
    kind: 'tree',
    equipment: stoneKit,
    dt: 1 / 30,
  });
  assert.equal(again.cues.length, 0);
  memory.start({ id: 2, targetId: 'tree-0', action: 'harvest' });
  const restarted = memory.step({
    action: { id: 2, type: 'harvest', targetId: 'tree-0', elapsed: 1.0, duration: 2 },
    kind: 'tree',
    equipment: stoneKit,
    dt: 1 / 30,
  });
  assert.equal(restarted.cues.length, 1);
  assert.equal(restarted.cues[0].coalesced, false);
});

test('crossedMarkers lists every skipped marker but callers coalesce audio', () => {
  const skipped = crossedMarkers(0.1, 0.99, TWO_STRIKE_MARKERS);
  assert.deepEqual(skipped.markers, [0.42, 0.92]);
  assert.equal(skipped.coalesced, true);
  assert.deepEqual(crossedMarkers(0.4, 0.43, TWO_STRIKE_MARKERS).markers, [0.42]);
});

test('cancel restores toward rest; pause snaps idle with no leftover swing', () => {
  const memory = createCueMemory();
  memory.start({ id: 3, targetId: 'stone-0', action: 'harvest' });
  memory.step({
    action: { id: 3, type: 'harvest', targetId: 'stone-0', elapsed: 1, duration: 2 },
    kind: 'stone',
    equipment: stoneKit,
    dt: 1 / 30,
  });
  memory.cancel('moved');
  const mid = memory.step({ action: null, kind: 'stone', equipment: stoneKit, dt: RESTORE_SECONDS / 2 });
  assert.equal(mid.pose.active, true);
  assert.ok(mid.restore > 0 && mid.restore < 1);
  const done = memory.step({ action: null, kind: 'stone', equipment: stoneKit, dt: RESTORE_SECONDS });
  assert.ok(done.restore >= 1);
  assert.equal(done.pose.toolVisible, false);
  assert.ok(Math.abs(done.pose.armRotZ + 0.7) < 0.02);

  memory.start({ id: 4, targetId: 'tree-1', action: 'harvest' });
  memory.step({
    action: { id: 4, type: 'harvest', targetId: 'tree-1', elapsed: 1, duration: 2 },
    kind: 'tree',
    equipment: stoneKit,
    dt: 1 / 30,
  });
  memory.cancel('paused');
  const paused = memory.step({
    action: null, kind: 'tree', equipment: stoneKit, dt: 0, paused: true,
  });
  assert.equal(paused.pose.toolVisible, false);
  assert.equal(paused.pose.active, false);
});

test('facing aims at the near side without stretching past the resource radius', () => {
  const player = { x: 0, z: 0 };
  const resource = { x: 3, z: 0, radius: 0.58 };
  assert.equal(facingTo(player, resource), Math.atan2(3, 0));
  const point = nearContactPoint(player, resource, 0.9);
  const distToCenter = Math.hypot(point.x - resource.x, point.z - resource.z);
  assert.ok(distToCenter <= resource.radius);
  assert.ok(point.x < resource.x);
  assert.ok(Number.isFinite(point.y));
});

test('mixPose and particle caps stay bounded', () => {
  const a = gatherPose({ progress: 0.92, style: 'mine', kind: 'copper', equipment: copperKit });
  const mixed = mixPose(a, restPose(), 0.5);
  assertBounded(mixed, 'mixed');
  assert.ok(PARTICLE_CAP <= 48);
  assert.equal(contactKind('copper', 'mine'), 'copper');
  assert.equal(burstCount('tree', 'complete'), 8);
  assert.ok(burstCount('berry', 'contact') <= 6);
});

test('tool arcs are continuous across impact and cycle boundaries, with distinct anticipation', () => {
  for (const style of ['chop', 'mine']) {
    const sample = progress => gatherPose({ progress, style, kind: style === 'mine' ? 'stone' : 'tree', equipment: stoneKit });
    for (const marker of [0.275, 0.42, 0.46, 0.5, 0.775, 0.92, 0.96]) {
      const before = sample(marker - 0.00001), after = sample(marker + 0.00001);
      for (const key of ['gripX', 'gripY', 'gripZ', 'toolRotX', 'toolRotZ', 'bodyYaw']) {
        assert.ok(Math.abs(before[key] - after[key]) < 0.003, `${style} ${key} jumps at ${marker}`);
      }
    }
    assert.ok(sample(0.275).gripY > sample(0.42).gripY);
    assert.ok(sample(0.42).toolRotX - sample(0.275).toolRotX > 1.5);
  }
  const tillAt = progress => gatherPose({ progress, style: 'till', equipment: stoneKit });
  for (const marker of [0.25, 0.45, 0.58, 0.7, 0.85]) {
    const before = tillAt(marker - 0.00001), after = tillAt(marker + 0.00001);
    for (const key of ['gripX', 'gripY', 'gripZ', 'toolRotX', 'toolRotZ']) {
      assert.ok(Math.abs(before[key] - after[key]) < 0.003, `till ${key} jumps at ${marker}`);
    }
  }
  assert.ok(tillAt(0.45).gripY > tillAt(0.7).gripY);
  const rakeAt = progress => gatherPose({ progress, style: 'rake', equipment: stoneKit });
  for (const marker of [0.18, 0.38, 0.52, 0.7, 0.86]) {
    const before = rakeAt(marker - 0.00001), after = rakeAt(marker + 0.00001);
    for (const key of ['gripX', 'gripY', 'gripZ', 'toolRotX', 'toolRotZ']) {
      assert.ok(Math.abs(before[key] - after[key]) < 0.003, `rake ${key} jumps at ${marker}`);
    }
  }
  assert.ok(rakeAt(0.38).gripY < tillAt(0.45).gripY);
  assert.ok(rakeAt(0.38).gripY > rakeAt(0.7).gripY);
  const plantAt = progress => gatherPose({ progress, style: 'plant', kind: 'carrot', equipment: stoneKit });
  for (const marker of [0.25, 0.4, 0.65, 0.72, 0.85]) {
    const before = plantAt(marker - 0.00001), after = plantAt(marker + 0.00001);
    for (const key of ['gripX', 'gripY', 'gripZ', 'supportX', 'supportY', 'bodyLean', 'bodyDrop']) {
      assert.ok(Math.abs(before[key] - after[key]) < 0.003, `plant ${key} jumps at ${marker}`);
    }
  }
  assert.ok(plantAt(0).gripY > plantAt(0.4).gripY);
  const tugAt = progress => gatherPose({ progress, style: 'tug', kind: 'carrot', equipment: stoneKit });
  for (const marker of [0.25, 0.4, 0.55, 0.78, 0.9]) {
    const before = tugAt(marker - 0.00001), after = tugAt(marker + 0.00001);
    for (const key of ['gripX', 'gripY', 'gripZ', 'supportY', 'bodyLean', 'liftProduce', 'hideStanding']) {
      assert.ok(Math.abs(before[key] - after[key]) < 0.003, `tug ${key} jumps at ${marker}`);
    }
  }
  assert.ok(tugAt(0.12).gripY > tugAt(0.4).gripY);
  assert.ok(tugAt(0.78).gripY > tugAt(0.4).gripY);
});

test('wild crop tug lifts produce and hides the standing plant', () => {
  const lifted = gatherPose({ progress: 0.78, style: 'tug', kind: 'carrot', equipment: stoneKit });
  assert.equal(lifted.toolVisible, false);
  assert.ok(lifted.liftProduce > 0.9);
  assert.ok(lifted.hideStanding > 0.9);
  const reduced = gatherPose({ progress: 0.78, style: 'tug', kind: 'potato', equipment: stoneKit, reduced: true });
  assert.equal(reduced.liftProduce, 0);
  assert.equal(reduced.hideStanding, 0);
  assert.equal(contactHeight('carrot'), 0.05);
  assert.equal(contactKind('potato', 'tug'), 'earth');
  assert.equal(burstCount('carrot', 'contact'), 5);
});

test('cultivated harvest tug grips, pulls, then recovers without a hoe', () => {
  const hoeKit = { ...stoneKit, hoe: true };
  const approach = gatherPose({ progress: 0.12, style: 'tug', kind: 'carrot', equipment: hoeKit });
  const grip = gatherPose({ progress: 0.4, style: 'tug', kind: 'carrot', equipment: hoeKit });
  const pulling = gatherPose({ progress: 0.66, style: 'tug', kind: 'potato', equipment: hoeKit });
  const lifted = gatherPose({ progress: 0.84, style: 'tug', kind: 'carrot', equipment: hoeKit });
  const recover = gatherPose({ progress: 0.95, style: 'tug', kind: 'carrot', equipment: hoeKit });
  for (const pose of [approach, grip, pulling, lifted, recover]) {
    assert.equal(pose.toolVisible, false);
    assert.equal(pose.tool, null);
    assert.equal(pose.lanternBelt, 1);
    assert.equal(pose.splitHands, 1);
  }
  assert.ok(approach.liftProduce < 0.05);
  assert.ok(approach.hideStanding < 0.2);
  assert.ok(grip.gripY < approach.gripY);
  assert.ok(Math.abs(grip.gripY - grip.supportY) < 0.08);
  assert.ok(grip.hideStanding > 0.35 && grip.hideStanding < 0.9);
  assert.ok(pulling.liftProduce > grip.liftProduce);
  assert.ok(pulling.hideStanding > 0.9);
  assert.ok(pulling.gripY > grip.gripY);
  assert.ok(lifted.liftProduce > 0.9);
  assert.ok(lifted.hideStanding > 0.9);
  assert.ok(recover.hideStanding > 0.9);
  assert.ok(recover.liftProduce > 0.4);
  const mixed = mixPose(lifted, restPose(), 1);
  assert.equal(mixed.liftProduce, 0);
  assert.equal(mixed.hideStanding, 0);

  const memory = createCueMemory();
  const first = memory.step({
    action: { id: 13, type: 'harvestCrop', targetId: 'c-1', species: 'carrot', x: 2.1, z: -1.4, elapsed: 0.72, duration: 0.9 },
    kind: 'carrot',
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(first.cues.length, 1);
  assert.equal(first.cues[0].style, 'tug');
  assert.equal(first.cues[0].kind, 'earth');
  assert.equal(first.cues[0].sound, 'pull');
  assert.equal(first.cues[0].fx, true);
  assert.equal(first.cues[0].source, 'carrot');
  assert.equal(first.cues[0].x, 2.1);
  assert.equal(first.cues[0].z, -1.4);
  const again = memory.step({
    action: { id: 13, type: 'harvestCrop', targetId: 'c-1', species: 'carrot', x: 2.1, z: -1.4, elapsed: 0.8, duration: 0.9 },
    kind: 'carrot',
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(again.cues.length, 0);
  memory.cancel('moved');
  const restored = memory.step({ action: null, equipment: hoeKit, dt: RESTORE_SECONDS });
  assert.ok(restored.restore >= 1);
  assert.equal(restored.pose.liftProduce, 0);
  assert.equal(restored.pose.hideStanding, 0);
  assert.equal(restored.pose.toolVisible, false);
});

test('till and idle hoe keep the hoe visible; till contact fires once at 70%', () => {
  const hoeKit = { ...stoneKit, hoe: true };
  const idle = idleHoePose();
  assert.equal(idle.tool, 'hoe');
  assert.equal(idle.toolVisible, true);
  assert.equal(idle.active, false);
  assert.ok(idle.gripFar - idle.gripNear > 0.2);
  const swinging = gatherPose({ progress: 0.7, style: 'till', equipment: hoeKit, reduced: false });
  assert.equal(swinging.tool, 'hoe');
  assert.equal(swinging.toolVisible, true);
  assert.ok(swinging.impact > 0.5);
  const still = gatherPose({ progress: 0.7, style: 'till', equipment: hoeKit, reduced: true });
  assert.equal(still.toolVisible, true);
  assert.equal(still.impact, 0);
  const raised = gatherPose({ progress: 0.45, style: 'till', equipment: hoeKit });
  assert.ok(raised.gripY > swinging.gripY);
  assert.equal(contactKind(null, 'till'), 'earth');
  assert.equal(contactHeight('earth'), 0.05);
  assert.deepEqual(contactMarkers('till'), TILL_MARKERS);
  assert.equal(TILL_MARKERS[0], 0.7);

  const recipe = fxRecipe('earth', 'till');
  const chips = recipe.find(item => item.shape === 'chip');
  const flecks = recipe.find(item => item.shape === 'fleck');
  assert.ok(chips.n >= 6 && chips.n <= 8);
  assert.ok(flecks.n >= 1 && flecks.n <= 3);
  assert.deepEqual(chips.colors, [0x5c5348, 0x4a4038, 0x3a2e28]);
  assert.ok(flecks.colors.every(color => color !== chips.colors[0]));
  assert.ok((flecks.colors[0] >> 16 & 0xff) > (chips.colors[0] >> 16 & 0xff));

  const memory = createCueMemory();
  const stepped = memory.step({
    action: { id: 9, type: 'till', targetId: null, x: 1.25, z: -0.8, elapsed: 0.7, duration: 0.9 },
    kind: null,
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(stepped.pose.tool, 'hoe');
  assert.equal(stepped.cues.length, 1);
  assert.equal(stepped.cues[0].style, 'till');
  assert.equal(stepped.cues[0].kind, 'earth');
  assert.equal(stepped.cues[0].sound, 'thud');
  assert.equal(stepped.cues[0].fx, true);
  assert.equal(stepped.cues[0].source, 'earth');
  assert.equal(stepped.cues[0].x, 1.25);
  assert.equal(stepped.cues[0].z, -0.8);
  assert.ok(stepped.cues[0].count >= 6 && stepped.cues[0].count <= 8);
  const again = memory.step({
    action: { id: 9, type: 'till', targetId: null, x: 1.25, z: -0.8, elapsed: 0.8, duration: 0.9 },
    kind: null,
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(again.cues.length, 0);
  const quiet = createCueMemory().step({
    action: { id: 10, type: 'till', targetId: null, x: 1.25, z: -0.8, elapsed: 0.7, duration: 0.9 },
    kind: null,
    equipment: hoeKit,
    dt: 1 / 30,
    reduced: true,
  });
  assert.equal(quiet.cues.length, 0);
  assert.equal(quiet.pose.toolVisible, true);
  memory.cancel('moved');
  const held = memory.step({ action: null, equipment: hoeKit, dt: RESTORE_SECONDS, idle });
  assert.equal(held.pose.tool, 'hoe');
  assert.equal(held.pose.toolVisible, true);
});

test('till overlay burst stays on the shared particle cap', () => {
  const recipe = fxRecipe('earth', 'till');
  const want = recipe.reduce((sum, item) => sum + item.n, 0);
  assert.ok(want <= 11);
  const fx = createGatherFx();
  fx.burst({ x: 0, z: 0 }, { x: 1, z: 0, radius: 0.45 }, 'earth', 'till', false);
  assert.equal(fx.liveCount(), want);
  fx.burst({ x: 0, z: 0 }, { x: 1, z: 0, radius: 0.45 }, 'earth', 'till', true);
  assert.equal(fx.liveCount(), want);
  for (let i = 0; i < 12; i++) fx.burst({ x: 0, z: 0 }, { x: 1, z: 0, radius: 0.45 }, 'earth', 'till', false);
  assert.ok(fx.liveCount() <= PARTICLE_CAP);
  fx.clear();
  assert.equal(fx.liveCount(), 0);
});

test('plant pose kneels, hides the hoe, and releases cosmetic seeds until cancel', () => {
  const hoeKit = { ...stoneKit, hoe: true };
  const start = gatherPose({ progress: 0.05, style: 'plant', kind: 'carrot', equipment: hoeKit });
  const reach = gatherPose({ progress: 0.4, style: 'plant', kind: 'carrot', equipment: hoeKit });
  const pat = gatherPose({ progress: 0.72, style: 'plant', kind: 'carrot', equipment: hoeKit });
  const recover = gatherPose({ progress: 0.95, style: 'plant', kind: 'carrot', equipment: hoeKit });
  for (const pose of [start, reach, pat, recover]) {
    assert.equal(pose.toolVisible, false, 'no hoe in the planting hand');
    assert.equal(pose.tool, null);
    assert.equal(pose.lanternBelt, 1);
    assert.equal(pose.splitHands, 1);
  }
  assert.ok(reach.bodyDrop < start.bodyDrop);
  assert.ok(reach.bodyLean > 0.2);
  assert.ok(reach.gripY < 0.16 && reach.gripY < reach.supportY);
  assert.ok(reach.gripZ > reach.supportZ);
  assert.ok(reach.seedShow > 0.9);
  assert.ok(reach.seedDrop > 0.2 && reach.seedDrop < 0.8);
  assert.ok(pat.gripY < recover.gripY);
  assert.equal(pat.seedDrop, 1);
  const still = gatherPose({ progress: 0.4, style: 'plant', kind: 'potato', equipment: hoeKit, reduced: true });
  const later = gatherPose({ progress: 0.85, style: 'plant', kind: 'potato', equipment: hoeKit, reduced: true });
  assert.equal(still.seedShow, 0);
  assert.equal(still.toolVisible, false);
  assert.equal(still.gripY, later.gripY);
  const mixed = mixPose(reach, restPose(), 1);
  assert.equal(mixed.seedShow, 0);
  assert.equal(mixed.toolVisible, false);

  const recipe = fxRecipe('carrot', 'plant');
  const specks = recipe.find(item => item.shape === 'fleck');
  const chips = recipe.find(item => item.shape === 'chip');
  assert.ok(specks.n >= 2 && specks.n <= 3);
  assert.ok(chips.n <= 3);

  const memory = createCueMemory();
  const first = memory.step({
    action: { id: 12, type: 'plantCrop', targetId: 'soil-1', species: 'carrot', x: 1.2, z: -0.4, elapsed: 0.26, duration: 0.65 },
    kind: 'carrot',
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(first.cues.length, 1);
  assert.equal(first.cues[0].style, 'plant');
  assert.equal(first.cues[0].kind, 'earth');
  assert.equal(first.cues[0].sound, 'rustle');
  assert.equal(first.cues[0].fx, true);
  assert.equal(first.cues[0].count, 3);
  assert.equal(first.cues[0].x, 1.2);
  assert.equal(first.cues[0].z, -0.4);
  const again = memory.step({
    action: { id: 12, type: 'plantCrop', targetId: 'soil-1', species: 'carrot', x: 1.2, z: -0.4, elapsed: 0.4, duration: 0.65 },
    kind: 'carrot',
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(again.cues.length, 0);
  memory.cancel('moved');
  const restored = memory.step({ action: null, equipment: hoeKit, dt: RESTORE_SECONDS });
  assert.ok(restored.restore >= 1);
  assert.equal(restored.pose.seedShow, 0);
  assert.equal(restored.pose.toolVisible, false);
});

test('uproot is a smaller empty-hand pull with a seed-return cue and no produce lift', () => {
  const hoeKit = { ...stoneKit, hoe: true };
  const harvest = gatherPose({ progress: 0.78, style: 'tug', kind: 'carrot', equipment: hoeKit });
  const start = gatherPose({ progress: 0.08, style: 'uproot', kind: 'carrot', equipment: hoeKit });
  const pull = gatherPose({ progress: 0.45, style: 'uproot', kind: 'potato', equipment: hoeKit });
  const recover = gatherPose({ progress: 0.88, style: 'uproot', kind: 'carrot', equipment: hoeKit });
  for (const pose of [start, pull, recover]) {
    assert.equal(pose.toolVisible, false);
    assert.equal(pose.tool, null);
    assert.equal(pose.lanternBelt, 1);
    assert.equal(pose.splitHands, 1);
    assert.equal(pose.liftProduce, 0);
    assert.equal(pose.hideStanding, 0);
  }
  assert.ok(pull.gripY < start.gripY);
  assert.ok(recover.gripY > pull.gripY);
  assert.ok(harvest.liftProduce > 0.9);
  assert.ok(harvest.gripY > pull.gripY + 0.12);
  const still = gatherPose({ progress: 0.45, style: 'uproot', kind: 'carrot', equipment: hoeKit, reduced: true });
  const later = gatherPose({ progress: 0.88, style: 'uproot', kind: 'carrot', equipment: hoeKit, reduced: true });
  assert.equal(still.liftProduce, 0);
  assert.equal(still.toolVisible, false);
  assert.equal(still.gripY, later.gripY);
  for (const marker of [0.22, 0.45, 0.62, 0.8]) {
    const before = gatherPose({ progress: marker - 0.00001, style: 'uproot', kind: 'carrot', equipment: hoeKit });
    const after = gatherPose({ progress: marker + 0.00001, style: 'uproot', kind: 'carrot', equipment: hoeKit });
    for (const key of ['gripX', 'gripY', 'gripZ', 'supportY', 'bodyLean', 'liftProduce']) {
      assert.ok(Math.abs(before[key] - after[key]) < 0.003, `uproot ${key} jumps at ${marker}`);
    }
  }

  const recipe = fxRecipe('carrot', 'uproot');
  assert.equal(recipe.length, 1);
  assert.equal(recipe[0].shape, 'fleck');
  assert.ok(recipe[0].n >= 2 && recipe[0].n <= 3);
  const harvestDone = fxRecipe('carrot', 'complete');
  assert.ok(harvestDone.some(item => item.shape === 'chip' && item.n >= 4));
  assert.ok(harvestDone.some(item => item.shape === 'fleck' && item.n > 0));
  assert.ok(!recipe.some(item => item.shape === 'chip'));

  const memory = createCueMemory();
  const first = memory.step({
    action: { id: 14, type: 'uprootCrop', targetId: 'c-2', species: 'carrot', x: 1.5, z: -0.8, elapsed: 0.4, duration: 0.6 },
    kind: 'carrot',
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(first.pose.style, 'uproot');
  assert.equal(first.pose.liftProduce, 0);
  assert.equal(first.cues.length, 1);
  assert.equal(first.cues[0].style, 'uproot');
  assert.equal(first.cues[0].sound, 'pull');
  assert.equal(first.cues[0].fx, false);
  assert.equal(first.cues[0].count, 0);
  const again = memory.step({
    action: { id: 14, type: 'uprootCrop', targetId: 'c-2', species: 'carrot', x: 1.5, z: -0.8, elapsed: 0.55, duration: 0.6 },
    kind: 'carrot',
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(again.cues.length, 0);
  const quiet = createCueMemory().step({
    action: { id: 15, type: 'uprootCrop', targetId: 'c-2', species: 'carrot', x: 1.5, z: -0.8, elapsed: 0.4, duration: 0.6 },
    kind: 'carrot',
    equipment: hoeKit,
    dt: 1 / 30,
    reduced: true,
  });
  assert.equal(quiet.cues.length, 0);
  const fx = createGatherFx();
  fx.ingest(first.cues[0], { x: 0, z: 0 }, { x: 1.5, z: -0.8, radius: 0.38, kind: 'carrot' }, false);
  assert.equal(fx.liveCount(), 0);
  memory.cancel('moved');
  const restored = memory.step({ action: null, equipment: hoeKit, dt: RESTORE_SECONDS });
  assert.ok(restored.restore >= 1);
  assert.equal(restored.pose.liftProduce, 0);
  assert.equal(restored.pose.toolVisible, false);
});

test('smooth rake is a shorter hoe level than till and restores toward the idle hold', () => {
  const hoeKit = { ...stoneKit, hoe: true };
  const tillLift = gatherPose({ progress: 0.45, style: 'till', equipment: hoeKit });
  const rakeLift = gatherPose({ progress: 0.38, style: 'rake', equipment: hoeKit });
  const rakeLevel = gatherPose({ progress: 0.7, style: 'rake', equipment: hoeKit });
  const rakeRecover = gatherPose({ progress: 0.96, style: 'rake', equipment: hoeKit });
  for (const pose of [rakeLift, rakeLevel, rakeRecover]) {
    assert.equal(pose.tool, 'hoe');
    assert.equal(pose.toolVisible, true);
    assert.equal(pose.lanternBelt, 1);
  }
  assert.ok(rakeLift.gripY < tillLift.gripY);
  assert.ok(rakeLift.gripY > rakeLevel.gripY);
  const still = gatherPose({ progress: 0.7, style: 'rake', equipment: hoeKit, reduced: true });
  assert.equal(still.toolVisible, true);
  assert.equal(still.impact, 0);
  const memory = createCueMemory();
  const stepped = memory.step({
    action: { id: 14, type: 'smoothSoil', targetId: 'soil-1', x: 2, z: 1, elapsed: 0.42, duration: 0.6 },
    kind: null,
    equipment: hoeKit,
    dt: 1 / 30,
  });
  assert.equal(stepped.pose.style, 'rake');
  assert.equal(stepped.pose.tool, 'hoe');
  assert.equal(stepped.cues.length, 0);
  memory.cancel('moved');
  const held = memory.step({ action: null, equipment: hoeKit, dt: RESTORE_SECONDS, idle: idleHoePose() });
  assert.equal(held.pose.tool, 'hoe');
  assert.equal(held.pose.toolVisible, true);
});

test('field contact sounds fire once; pause and reduced motion stay silent', () => {
  const hoeKit = { ...stoneKit, hoe: true };
  const wild = createCueMemory().step({
    action: { id: 21, type: 'harvest', targetId: 'carrot-1', elapsed: 0.72, duration: 0.9 },
    kind: 'carrot',
    equipment: stoneKit,
    dt: 1 / 30,
  });
  assert.equal(wild.cues[0].style, 'tug');
  assert.equal(wild.cues[0].sound, 'pull');
  assert.equal(wild.cues[0].fx, true);
  const paused = createCueMemory().step({
    action: { id: 22, type: 'till', targetId: null, x: 1, z: 1, elapsed: 0.7, duration: 0.9 },
    kind: null,
    equipment: hoeKit,
    dt: 1 / 30,
    paused: true,
  });
  assert.equal(paused.cues.length, 0);
  const reducedPlant = createCueMemory().step({
    action: { id: 23, type: 'plantCrop', targetId: 'soil-1', species: 'carrot', x: 1, z: 1, elapsed: 0.3, duration: 0.65 },
    kind: 'carrot',
    equipment: hoeKit,
    dt: 1 / 30,
    reduced: true,
  });
  assert.equal(reducedPlant.cues.length, 0);
});
