import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainPosition, distanceToEdges, isInside, pickWalkTarget, pointInPolygon, vertexRadius } from '../world/boundary.mjs';
import { generateWorld } from '../world/generate.mjs';
import { WALK_MARGIN } from '../data/tuning.mjs';

const review = generateWorld('hearthwild-review-a');
const polygon = review.boundary.polygon;

test('seeded islands are irregular polygons, not a circular clamp', () => {
  const radii = polygon.map(vertexRadius);
  const min = Math.min(...radii);
  const max = Math.max(...radii);
  assert.ok(max - min > 2);
  assert.ok(min >= 22);
  assert.ok(max <= 52.05);
  assert.ok(max > 32);
  const clamped = [0, 1, 2, 3].map(k => {
    const angle = k * Math.PI / 4;
    const point = constrainPosition(polygon, Math.cos(angle) * 200, Math.sin(angle) * 200, WALK_MARGIN);
    return Math.hypot(point.x, point.z);
  });
  assert.ok(Math.max(...clamped) - Math.min(...clamped) > 0.15);
});

test('far points clamp to walkable ground in every direction', () => {
  for (let i = 0; i < 360; i += 3) {
    const angle = i * Math.PI / 180;
    const point = constrainPosition(polygon, Math.cos(angle) * 200, Math.sin(angle) * 200, WALK_MARGIN);
    assert.equal(isInside(polygon, point.x, point.z, WALK_MARGIN), true);
  }
});

test('spawn sits in the clearing and off-island picks are ignored', () => {
  const spawn = review.spawn;
  assert.equal(isInside(polygon, spawn.x, spawn.z, WALK_MARGIN), true);
  assert.equal(pickWalkTarget(polygon, 80, 80, WALK_MARGIN), null);
  const onLand = pickWalkTarget(polygon, 0.4, -0.2, WALK_MARGIN);
  assert.ok(onLand);
  assert.equal(isInside(polygon, onLand.x, onLand.z, WALK_MARGIN), true);
});

test('a rim click is clamped onto walkable ground', () => {
  const vertex = polygon[0];
  const picked = pickWalkTarget(polygon, vertex.x * 0.995, vertex.z * 0.995, WALK_MARGIN);
  assert.ok(picked);
  assert.equal(isInside(polygon, picked.x, picked.z, WALK_MARGIN), true);
});

test('keeper clearance uses edge distance, not only a radial inset', () => {
  const square = [
    { x: 10, z: -10 },
    { x: 10, z: 10 },
    { x: -10, z: 10 },
    { x: -10, z: -10 },
  ];
  assert.equal(pointInPolygon(square, 9.5, 0), true);
  assert.ok(distanceToEdges(square, 9.5, 0) < 0.6);
  assert.equal(isInside(square, 9.5, 0, WALK_MARGIN), false);
  const clamped = constrainPosition(square, 9.5, 0, WALK_MARGIN);
  assert.equal(isInside(square, clamped.x, clamped.z, WALK_MARGIN), true);
  assert.ok(distanceToEdges(square, clamped.x, clamped.z) >= WALK_MARGIN - 0.02);
});
