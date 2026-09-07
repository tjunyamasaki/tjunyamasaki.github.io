import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATOR_VERSION, ISLAND_RADIUS_MAX, ISLAND_RADIUS_MIN, ISLAND_SHAPES, WILD_CROP_ATTEMPTS } from '../data/tuning.mjs';
import { CROP_PICK_RADIUS, CROP_SOURCE_RADIUS } from '../data/tuning.mjs';
import { createCropPlan, gameplayView, generateWorld, REVIEW_SEEDS, validateWorld } from '../world/generate.mjs';
import { hashSeed } from '../world/random.mjs';
import { vertexRadius } from '../world/boundary.mjs';
import { blockingNodes } from '../world/navigation.mjs';

test('the same seed, settings and generator version recreate the gameplay descriptor', () => {
  const first = generateWorld('hearthwild-review-a');
  const second = generateWorld('hearthwild-review-a');
  assert.equal(first.generatorVersion, GENERATOR_VERSION);
  assert.equal(first.seed, 'hearthwild-review-a');
  assert.equal(first.seedHash, hashSeed('hearthwild-review-a'));
  assert.deepEqual(gameplayView(first), gameplayView(second));
  assert.deepEqual(first.boundary.polygon, second.boundary.polygon);
  assert.deepEqual(first.nodes.map(node => node.id), second.nodes.map(node => node.id));
});

test('review-a stays valid with a clear meadow and protected supply', () => {
  const world = generateWorld('hearthwild-review-a');
  const report = validateWorld(world);
  assert.equal(report.ok, true, report.reasons.join(', '));
  assert.ok(ISLAND_SHAPES.includes(world.boundary.shape));
  assert.ok(world.nodes.some(node => node.kind === 'tree' && Math.hypot(node.x, node.z) <= 14));
  assert.ok(world.nodes.some(node => node.kind === 'stone' && Math.hypot(node.x, node.z) <= 14));
  assert.ok(world.nodes.some(node => node.kind === 'twig' && node.protected));
  assert.ok(world.nodes.some(node => node.kind === 'pebble' && node.protected));
  assert.ok(world.animals.some(animal => animal.kind === 'rabbit'));
  const radii = world.boundary.polygon.map(vertexRadius);
  assert.ok(Math.min(...radii) >= ISLAND_RADIUS_MIN - 0.05);
  assert.ok(Math.max(...radii) > 32);
  assert.ok(Math.max(...radii) <= ISLAND_RADIUS_MAX + 0.05);
  assert.ok(world.nodes.every(node => Math.abs(node.x) > 6 || Math.abs(node.z) > 6));
});

test('reference seeds differ in silhouette, shape family, and resource layout', () => {
  const a = generateWorld(REVIEW_SEEDS[0]);
  const b = generateWorld(REVIEW_SEEDS[1]);
  const c = generateWorld(REVIEW_SEEDS[2]);
  assert.notDeepEqual(a.boundary.polygon, b.boundary.polygon);
  assert.notDeepEqual(a.nodes.map(node => [node.kind, node.x, node.z]), b.nodes.map(node => [node.kind, node.x, node.z]));
  assert.notEqual(a.seedHash, c.seedHash);
  assert.ok(ISLAND_SHAPES.includes(a.boundary.shape));
  assert.ok(ISLAND_SHAPES.includes(b.boundary.shape));
  assert.ok(ISLAND_SHAPES.includes(c.boundary.shape));
});

test('leading and trailing seed spaces normalize to the same world', () => {
  const trimmed = generateWorld('hearthwild-review-a');
  const padded = generateWorld('  hearthwild-review-a  ');
  assert.equal(padded.seed, 'hearthwild-review-a');
  assert.deepEqual(gameplayView(trimmed), gameplayView(padded));
});

test('one hundred sweep seeds stay valid, unique, unblocked, mixed-shape and supplied', () => {
  const shapes = new Set();
  for (let i = 0; i < 100; i++) {
    const seed = `hearthwild-sweep-${String(i).padStart(2, '0')}`;
    const world = generateWorld(seed);
    const report = validateWorld(world);
    assert.equal(report.ok, true, `${seed}: ${report.reasons.join(', ')}`);
    const ids = world.nodes.map(node => node.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.ok(world.animals.filter(animal => animal.kind === 'rabbit').length >= 1);
    assert.ok(world.animals.length <= 10);
    assert.equal(world.generatorVersion, GENERATOR_VERSION);
    assert.ok(ISLAND_SHAPES.includes(world.boundary.shape), `${seed} shape ${world.boundary.shape}`);
    shapes.add(world.boundary.shape);
    const radii = world.boundary.polygon.map(vertexRadius);
    assert.ok(Math.min(...radii) >= ISLAND_RADIUS_MIN - 0.05, seed);
    assert.ok(Math.max(...radii) > 32, seed);
  }
  assert.ok(shapes.size >= 3, `expected mixed shapes, got ${[...shapes].join(', ')}`);
});

test('review seeds keep protected reachable carrots and potatoes', () => {
  assert.equal(WILD_CROP_ATTEMPTS, 200);
  assert.equal(GENERATOR_VERSION, 'hearthwild-05');
  for (const seed of REVIEW_SEEDS) {
    const world = generateWorld(seed);
    const report = validateWorld(world);
    assert.equal(report.ok, true, `${seed}: ${report.reasons.join(', ')}`);
    const carrots = world.nodes.filter(node => node.kind === 'carrot');
    const potatoes = world.nodes.filter(node => node.kind === 'potato');
    assert.ok(carrots.length >= 6 && carrots.length <= 10, `${seed} carrots ${carrots.length}`);
    assert.ok(potatoes.length >= 6 && potatoes.length <= 10, `${seed} potatoes ${potatoes.length}`);
    assert.ok(carrots.every(node => node.radius === CROP_SOURCE_RADIUS && node.pickRadius === CROP_PICK_RADIUS));
    assert.ok(potatoes.every(node => node.radius === CROP_SOURCE_RADIUS && node.pickRadius === CROP_PICK_RADIUS));
    assert.ok(carrots.some(node => node.protected && Math.hypot(node.x, node.z) <= 14));
    assert.ok(potatoes.some(node => node.protected && Math.hypot(node.x, node.z) <= 14));
    assert.equal(blockingNodes(world.nodes).some(node => node.kind === 'carrot' || node.kind === 'potato'), false);
  }
});

test('wild crop streams repeat independently of a second generate', () => {
  const first = generateWorld('hearthwild-review-a');
  const second = generateWorld('hearthwild-review-a');
  const cropView = world => world.nodes
    .filter(node => node.kind === 'carrot' || node.kind === 'potato')
    .map(node => [node.id, node.kind, node.x, node.z, node.protected, node.radius, node.pickRadius, node.scale, node.rotation]);
  assert.deepEqual(cropView(first), cropView(second));
  const plan = createCropPlan(first.seedHash);
  const again = createCropPlan(first.seedHash);
  assert.equal(plan.carrotTarget, again.carrotTarget);
  assert.equal(plan.potatoTarget, again.potatoTarget);
  assert.ok(plan.carrotTarget >= 6 && plan.carrotTarget <= 10);
  assert.ok(plan.potatoTarget >= 6 && plan.potatoTarget <= 10);
});
