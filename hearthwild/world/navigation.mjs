import { APPROACH_PADDING, KEEPER_RADIUS, NAV_CELL, WALK_MARGIN } from '../data/tuning.mjs';
import { constrainPosition, distanceToEdges, isInside } from './boundary.mjs';
import { BLOCKING_KINDS } from '../data/harvest.mjs';

const SQRT2 = Math.SQRT2;
const CARDINALS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STEPS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

function keyOf(ix, iz) {
  return `${ix},${iz}`;
}

function parseKey(key) {
  const comma = key.indexOf(',');
  return { ix: Number(key.slice(0, comma)), iz: Number(key.slice(comma + 1)) };
}

function isAabbObstacle(obstacle) {
  return obstacle && Number.isFinite(obstacle.minX) && Number.isFinite(obstacle.maxX)
    && Number.isFinite(obstacle.minZ) && Number.isFinite(obstacle.maxZ);
}

function copyObstacle(node) {
  const copy = {
    id: node.id,
    x: node.x,
    z: node.z,
    radius: node.radius,
    kind: node.kind,
  };
  if (isAabbObstacle(node)) {
    copy.shape = 'aabb';
    copy.minX = node.minX;
    copy.maxX = node.maxX;
    copy.minZ = node.minZ;
    copy.maxZ = node.maxZ;
  }
  return copy;
}

export function hitsObstacle(x, z, obstacle, keeperRadius = KEEPER_RADIUS) {
  if (isAabbObstacle(obstacle)) {
    const closestX = Math.min(obstacle.maxX, Math.max(obstacle.minX, x));
    const closestZ = Math.min(obstacle.maxZ, Math.max(obstacle.minZ, z));
    return Math.hypot(x - closestX, z - closestZ) < keeperRadius - 1e-6;
  }
  return Math.hypot(x - obstacle.x, z - obstacle.z) < (obstacle.radius || 0) + keeperRadius - 1e-6;
}

function separateFromObstacle(px, pz, obstacle, keeperRadius) {
  if (isAabbObstacle(obstacle)) {
    const closestX = Math.min(obstacle.maxX, Math.max(obstacle.minX, px));
    const closestZ = Math.min(obstacle.maxZ, Math.max(obstacle.minZ, pz));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-8) {
      const left = px - obstacle.minX;
      const right = obstacle.maxX - px;
      const down = pz - obstacle.minZ;
      const up = obstacle.maxZ - pz;
      const smallest = Math.min(left, right, down, up);
      if (smallest === left) return { x: obstacle.minX - keeperRadius, z: pz };
      if (smallest === right) return { x: obstacle.maxX + keeperRadius, z: pz };
      if (smallest === down) return { x: px, z: obstacle.minZ - keeperRadius };
      return { x: px, z: obstacle.maxZ + keeperRadius };
    }
    if (distance >= keeperRadius) return { x: px, z: pz };
    const scale = keeperRadius / distance;
    return { x: closestX + dx * scale, z: closestZ + dz * scale };
  }
  const dx = px - obstacle.x;
  const dz = pz - obstacle.z;
  const min = (obstacle.radius || 0) + keeperRadius;
  const distance = Math.hypot(dx, dz);
  if (distance >= min) return { x: px, z: pz };
  if (distance < 1e-8) return { x: obstacle.x + min, z: obstacle.z };
  const scale = min / distance;
  return { x: obstacle.x + dx * scale, z: obstacle.z + dz * scale };
}

function separateFromObstacles(x, z, obstacles, keeperRadius) {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 5; pass++) {
    for (const obstacle of obstacles) {
      const next = separateFromObstacle(px, pz, obstacle, keeperRadius);
      px = next.x;
      pz = next.z;
    }
  }
  return { x: px, z: pz };
}

export function continuousWalkable(polygon, obstacles, x, z, walkMargin = WALK_MARGIN, keeperRadius = KEEPER_RADIUS) {
  if (!isInside(polygon, x, z, walkMargin)) return false;
  for (const obstacle of obstacles) {
    if (hitsObstacle(x, z, obstacle, keeperRadius)) return false;
  }
  return true;
}

export function resolveWalkPosition(polygon, obstacles, x, z, fromX, fromZ, walkMargin = WALK_MARGIN, keeperRadius = KEEPER_RADIUS) {
  const tryPoint = (px, pz) => (
    continuousWalkable(polygon, obstacles, px, pz, walkMargin, keeperRadius) ? { x: px, z: pz } : null
  );
  if (tryPoint(x, z)) return { x, z };
  let separated = separateFromObstacles(x, z, obstacles, keeperRadius);
  separated = constrainPosition(polygon, separated.x, separated.z, walkMargin);
  separated = separateFromObstacles(separated.x, separated.z, obstacles, keeperRadius);
  const recovered = tryPoint(separated.x, separated.z);
  if (recovered) return recovered;

  const slideX = tryPoint(x, fromZ) || tryPoint(
    separateFromObstacles(x, fromZ, obstacles, keeperRadius).x,
    fromZ,
  );
  const slideZ = tryPoint(fromX, z) || tryPoint(
    fromX,
    separateFromObstacles(fromX, z, obstacles, keeperRadius).z,
  );
  const validX = slideX && continuousWalkable(polygon, obstacles, slideX.x, slideX.z, walkMargin, keeperRadius) ? slideX : null;
  const validZ = slideZ && continuousWalkable(polygon, obstacles, slideZ.x, slideZ.z, walkMargin, keeperRadius) ? slideZ : null;
  if (validX && validZ) {
    const scoreX = Math.abs(validX.x - fromX) + Math.abs(validX.z - fromZ);
    const scoreZ = Math.abs(validZ.x - fromX) + Math.abs(validZ.z - fromZ);
    return scoreX >= scoreZ ? validX : validZ;
  }
  return validX || validZ || { x: fromX, z: fromZ };
}

export function blockingNodes(nodes) {
  return (nodes || []).filter(node => {
    if (node.phase === 'removed' || node.phase === 'stump') return false;
    if (node.kind === 'tree' && node.phase && node.phase !== 'ready') return false;
    return BLOCKING_KINDS.includes(node.kind);
  }).map(node => ({ id: node.id, x: node.x, z: node.z, radius: node.radius, kind: node.kind }));
}

export function buildNav(descriptor, cellOrObstacles = NAV_CELL, maybeCell) {
  const polygon = descriptor.boundary.polygon;
  const liveObstacles = Array.isArray(cellOrObstacles) ? cellOrObstacles : null;
  const cell = liveObstacles ? (maybeCell ?? NAV_CELL) : (typeof cellOrObstacles === 'number' ? cellOrObstacles : NAV_CELL);
  const obstacles = liveObstacles
    ? liveObstacles.map(copyObstacle)
    : blockingNodes(descriptor.nodes);
  const walkMargin = descriptor.walkMargin ?? WALK_MARGIN;
  const extent = polygon.reduce((max, vertex) => Math.max(max, Math.abs(vertex.x), Math.abs(vertex.z)), 0) + 2;
  const boundR = polygon.reduce((max, vertex) => Math.max(max, Math.hypot(vertex.x, vertex.z)), 0) + walkMargin + cell;
  const boundR2 = boundR * boundR;
  const innerR = Math.max(0, distanceToEdges(polygon, 0, 0) - walkMargin);
  const innerR2 = innerR * innerR;
  const half = Math.ceil(extent / cell);
  const walkable = new Set();
  const probe = cell * 0.42;
  function openAt(x, z) {
    if (x * x + z * z <= innerR2) {
      for (const obstacle of obstacles) {
        if (hitsObstacle(x, z, obstacle)) return false;
      }
      return true;
    }
    return continuousWalkable(polygon, obstacles, x, z, walkMargin);
  }
  for (let ix = -half; ix <= half; ix++) {
    for (let iz = -half; iz <= half; iz++) {
      const x = ix * cell;
      const z = iz * cell;
      if (x * x + z * z > boundR2) continue;
      if (!openAt(x, z)) continue;
      if (openAt(x + probe, z) && openAt(x - probe, z) && openAt(x, z + probe) && openAt(x, z - probe)) {
        walkable.add(keyOf(ix, iz));
      }
    }
  }
  return { cell, half, walkable, polygon, obstacles, walkMargin };
}

export function isNavCellWalkable(nav, ix, iz) {
  return nav.walkable.has(keyOf(ix, iz));
}

export function worldToCell(nav, x, z) {
  return { ix: Math.round(x / nav.cell), iz: Math.round(z / nav.cell) };
}

export function cellToWorld(nav, ix, iz) {
  return { x: ix * nav.cell, z: iz * nav.cell };
}

export function nearestWalkableCell(nav, x, z) {
  const start = worldToCell(nav, x, z);
  if (isNavCellWalkable(nav, start.ix, start.iz)) return start;
  let best = null;
  let bestDist = Infinity;
  for (const key of nav.walkable) {
    const cell = parseKey(key);
    const world = cellToWorld(nav, cell.ix, cell.iz);
    const dist = Math.hypot(world.x - x, world.z - z);
    if (dist < bestDist) {
      bestDist = dist;
      best = cell;
    }
  }
  return best;
}

export function snapWalkable(nav, x, z) {
  if (continuousWalkable(nav.polygon, nav.obstacles, x, z, nav.walkMargin)) return { x, z };
  const cell = nearestWalkableCell(nav, x, z);
  return cell ? cellToWorld(nav, cell.ix, cell.iz) : null;
}

function heuristic(a, b) {
  const dx = Math.abs(a.ix - b.ix);
  const dz = Math.abs(a.iz - b.iz);
  return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
}

function reconstruct(cameFrom, current) {
  const path = [current];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current);
    path.push(current);
  }
  path.reverse();
  return path;
}

function lineWalkable(nav, a, b) {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(2, Math.ceil(distance / (nav.cell * 0.4)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (!continuousWalkable(nav.polygon, nav.obstacles, x, z, nav.walkMargin)) return false;
  }
  return true;
}

function stringPull(nav, points) {
  if (points.length <= 2) return points;
  const pulled = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !lineWalkable(nav, points[i], points[j])) j -= 1;
    pulled.push(points[j]);
    i = j;
  }
  return pulled;
}

export function findPath(nav, from, to) {
  if (!nav || !from || !to) return null;
  const start = nearestWalkableCell(nav, from.x, from.z);
  const goal = nearestWalkableCell(nav, to.x, to.z);
  if (!start || !goal) return null;
  const startKey = keyOf(start.ix, start.iz);
  const goalKey = keyOf(goal.ix, goal.iz);
  const goalWorld = cellToWorld(nav, goal.ix, goal.iz);
  const destWalkable = continuousWalkable(nav.polygon, nav.obstacles, to.x, to.z, nav.walkMargin);
  if (!destWalkable && Math.hypot(goalWorld.x - to.x, goalWorld.z - to.z) > 1.25) return null;
  if (startKey === goalKey) {
    const points = [{ x: from.x, z: from.z }];
    if (continuousWalkable(nav.polygon, nav.obstacles, to.x, to.z, nav.walkMargin)) {
      points.push({ x: to.x, z: to.z });
    } else {
      const snapped = cellToWorld(nav, goal.ix, goal.iz);
      if (Math.hypot(snapped.x - from.x, snapped.z - from.z) > 1e-6) points.push(snapped);
    }
    return stringPull(nav, points);
  }

  const open = [startKey];
  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, heuristic(start, goal)]]);
  const closed = new Set();

  while (open.length) {
    let bestIndex = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const score = fScore.get(open[i]) ?? Infinity;
      if (score < bestF) {
        bestF = score;
        bestIndex = i;
      }
    }
    const current = open.splice(bestIndex, 1)[0];
    if (current === goalKey) {
      const cells = reconstruct(cameFrom, current);
      const points = cells.map(item => {
        const cell = parseKey(item);
        return cellToWorld(nav, cell.ix, cell.iz);
      });
      if (continuousWalkable(nav.polygon, nav.obstacles, to.x, to.z, nav.walkMargin)) {
        points.push({ x: to.x, z: to.z });
      }
      return stringPull(nav, points);
    }
    closed.add(current);
    const { ix, iz } = parseKey(current);
    for (const [dx, dz, cost] of STEPS) {
      if (dx && dz) {
        if (!isNavCellWalkable(nav, ix + dx, iz) || !isNavCellWalkable(nav, ix, iz + dz)) continue;
      }
      const nx = ix + dx;
      const nz = iz + dz;
      const nextKey = keyOf(nx, nz);
      if (!isNavCellWalkable(nav, nx, nz) || closed.has(nextKey)) continue;
      const tentative = (gScore.get(current) ?? Infinity) + cost;
      if (tentative >= (gScore.get(nextKey) ?? Infinity)) continue;
      cameFrom.set(nextKey, current);
      gScore.set(nextKey, tentative);
      fScore.set(nextKey, tentative + heuristic({ ix: nx, iz: nz }, goal));
      if (!open.includes(nextKey)) open.push(nextKey);
    }
  }
  return null;
}

export function reachableSet(nav, origin) {
  const start = nearestWalkableCell(nav, origin.x, origin.z);
  const reached = new Set();
  if (!start) return reached;
  const queue = [keyOf(start.ix, start.iz)];
  reached.add(queue[0]);
  for (let i = 0; i < queue.length; i++) {
    const { ix, iz } = parseKey(queue[i]);
    for (const [dx, dz] of [...CARDINALS, ...DIAGONALS]) {
      if (dx && dz && (!isNavCellWalkable(nav, ix + dx, iz) || !isNavCellWalkable(nav, ix, iz + dz))) continue;
      const next = keyOf(ix + dx, iz + dz);
      if (reached.has(next) || !isNavCellWalkable(nav, ix + dx, iz + dz)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}

export function cellReachable(nav, reached, x, z) {
  const cell = nearestWalkableCell(nav, x, z);
  return Boolean(cell && reached.has(keyOf(cell.ix, cell.iz)));
}

export function approachPoint(nav, player, node) {
  const radius = node.radius + KEEPER_RADIUS + APPROACH_PADDING;
  const distance = Math.hypot(player.x - node.x, player.z - node.z);
  if (distance <= radius + 0.08 && continuousWalkable(nav.polygon, nav.obstacles, player.x, player.z, nav.walkMargin)) {
    return { x: player.x, z: player.z };
  }
  const tau = Math.PI * 2;
  const base = Math.atan2(player.z - node.z, player.x - node.x);
  let best = null;
  let bestLength = Infinity;
  for (let i = 0; i < 16; i++) {
    const angle = base + i * tau / 16;
    const point = { x: node.x + Math.cos(angle) * radius, z: node.z + Math.sin(angle) * radius };
    if (!continuousWalkable(nav.polygon, nav.obstacles, point.x, point.z, nav.walkMargin)) continue;
    const path = findPath(nav, player, point);
    if (!path) continue;
    let length = 0;
    for (let step = 1; step < path.length; step++) {
      length += Math.hypot(path[step].x - path[step - 1].x, path[step].z - path[step - 1].z);
    }
    if (length < bestLength) {
      bestLength = length;
      best = point;
    }
  }
  return best;
}

export function pathTouchesObstacle(path, node, keeperRadius = KEEPER_RADIUS) {
  if (!path) return false;
  return path.some(point => hitsObstacle(point.x, point.z, node, keeperRadius - 0.05));
}
