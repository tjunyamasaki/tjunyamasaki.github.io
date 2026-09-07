import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEPER_RADIUS, WALK_MARGIN } from '../data/tuning.mjs';
import { generateWorld } from '../world/generate.mjs';
import { approachPoint, buildNav, findPath, pathTouchesObstacle, resolveWalkPosition } from '../world/navigation.mjs';
import { isInside } from '../world/boundary.mjs';
import { applyCommand, createState, step } from '../core/state.mjs';
import { TICK_SECONDS } from '../data/tuning.mjs';

function squareIsland() {
  return [
    { x: 12, z: -12 },
    { x: 12, z: 12 },
    { x: -12, z: 12 },
    { x: -12, z: -12 },
  ];
}

test('A* walks around a clustered wall instead of cutting the corner', () => {
  const polygon = squareIsland();
  const nodes = [];
  for (let z = -2.5; z <= 2.5; z += 0.85) {
    nodes.push({ id: `wall-${z}`, kind: 'stone', x: 2.2, z, radius: 0.48 });
  }
  const nav = buildNav({ boundary: { polygon }, nodes, walkMargin: WALK_MARGIN });
  const path = findPath(nav, { x: 0, z: 0 }, { x: 6, z: 0 });
  assert.ok(path, 'expected a path around the cluster');
  assert.ok(path.some(point => Math.abs(point.z) > 2.2), 'path should detour off the blocked x-axis');
  for (const node of nodes) {
    assert.equal(pathTouchesObstacle(path, node), false);
  }
});

test('an enclosed solid target is unreachable and does not route through its center', () => {
  const polygon = squareIsland();
  const nodes = [
    { id: 'block-0', kind: 'tree', x: 4, z: 0.9, radius: 0.7 },
    { id: 'block-1', kind: 'tree', x: 4, z: -0.9, radius: 0.7 },
    { id: 'block-2', kind: 'tree', x: 3.1, z: 0, radius: 0.7 },
    { id: 'block-3', kind: 'tree', x: 4.9, z: 0, radius: 0.7 },
    { id: 'prize', kind: 'copper', x: 4, z: 0, radius: 0.35 },
  ];
  const nav = buildNav({ boundary: { polygon }, nodes, walkMargin: WALK_MARGIN });
  const prize = nodes[4];
  const path = findPath(nav, { x: 0, z: 0 }, prize);
  assert.equal(path, null);
  const approach = approachPoint(nav, { x: 0, z: 0 }, prize);
  assert.equal(approach, null);
});

test('selecting a solid uses a nearby approach, not the object center', () => {
  const world = generateWorld('hearthwild-review-a');
  const nav = buildNav(world);
  const tree = world.nodes.find(node => node.kind === 'tree');
  const approach = approachPoint(nav, world.spawn, tree);
  assert.ok(approach);
  assert.ok(Math.hypot(approach.x - tree.x, approach.z - tree.z) >= tree.radius + KEEPER_RADIUS - 0.05);
  const path = findPath(nav, world.spawn, approach);
  assert.ok(path);
  assert.equal(pathTouchesObstacle(path, tree), false);
});

test('walking into a tree slides around it instead of entering the trunk', () => {
  const world = generateWorld('hearthwild-review-a');
  const state = createState(world);
  applyCommand(state, { type: 'enter' });
  const tree = world.nodes.find(node => node.kind === 'tree');
  const dx = tree.x - state.player.x;
  const dz = tree.z - state.player.z;
  const length = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < 400; i++) {
    step(state, { x: dx / length, z: dz / length }, TICK_SECONDS);
  }
  assert.ok(Math.hypot(state.player.x - tree.x, state.player.z - tree.z) >= tree.radius + KEEPER_RADIUS - 0.04);
  assert.equal(isInside(state.boundary, state.player.x, state.player.z, state.walkMargin), true);
});

test('resolveWalkPosition keeps the keeper on the walkable rim', () => {
  const world = generateWorld('hearthwild-review-b');
  const next = resolveWalkPosition(world.boundary.polygon, world.nodes, 80, 0, 0, 0, world.walkMargin);
  assert.equal(isInside(world.boundary.polygon, next.x, next.z, world.walkMargin), true);
});

test('harvesting a tree opens its footprint until it safely regrows', () => {
  const world = generateWorld('hearthwild-review-a');
  const state = createState(world);
  applyCommand(state, { type: 'enter' });
  const tree = state.resources.find(node => node.kind === 'tree');
  const dist = tree.radius + KEEPER_RADIUS + 0.22;
  state.player.x = tree.x + dist;
  state.player.z = tree.z;
  applyCommand(state, { type: 'startAction', targetId: tree.id, action: 'harvest' });
  for (let i = 0; i < Math.ceil(2 / TICK_SECONDS) + 2; i++) step(state, {}, TICK_SECONDS);
  assert.equal(tree.phase, 'stump');
  const through = resolveWalkPosition(state.boundary, state.obstacles, tree.x, tree.z, tree.x + dist, tree.z, state.walkMargin);
  assert.ok(Math.hypot(through.x - tree.x, through.z - tree.z) < 0.2);
  const openNav = buildNav(world, state.obstacles);
  assert.ok(findPath(openNav, { x: 0, z: 0 }, { x: tree.x, z: tree.z }));
});
