/**
 * Deterministic grid-assisted route planner and swept corridor reservations.
 * Pure: no Three, DOM, wall-clock APIs, randomness, scene, or world stepping.
 * Yielding / wander FSM / active gait clock are P2-06.
 */

import {
  GEOM_EPS,
  MAX_ACTIVE_ROUTES,
} from '../core/balance.mjs';
import {
  ARRIVAL_CORRIDOR_MAX_X,
  ARRIVAL_CORRIDOR_MIN_X,
  GATE_INSIDE_WAYPOINT,
  GATE_STAGING,
  MIN_SEPARATION,
  PROP_MOVEMENT_RADIUS,
  RESIDENT_MAX_X,
  RESIDENT_MAX_Z,
  RESIDENT_MIN_X,
  RESIDENT_MIN_Z,
  STATIC_PROPS,
  isFinitePoint,
  isInArrivalCorridor,
  isInResidentDomain,
  isValidResidentCenter,
  pairDistance,
} from './layout.mjs';
import {
  copyPoint,
  pointToSegmentDistance,
  polylineLength,
  polylinePolylineDistance,
  samePoint,
  segmentLength,
} from './geom.mjs';

/**
 * @typedef {{ x: number, z: number }} PointXZ
 * @typedef {{ points: PointXZ[], length: number }} RouteResult
 * @typedef {object} WorldResident
 * @property {string} id
 * @property {PointXZ} position
 * @property {{ points: PointXZ[], length: number } | null} route
 * @typedef {object} WorldState
 * @property {WorldResident[]} residents
 * @typedef {object} CorridorReservation
 * @property {string} residentId
 * @property {PointXZ[]} points
 * @typedef {object} PlanRouteArgs
 * @property {WorldState} world
 * @property {string} residentId
 * @property {PointXZ} destination
 * @property {boolean} [permitGate]
 * @typedef {object} PlanRouteDiag
 * @property {RouteResult | null} route
 * @property {string | null} reason
 */

export const GRID_SPACING = 0.75;
export const MAX_EXPANDED_NODES = 1024;
export const MAX_ROUTE_POINTS = 128;

const START_ID = -1;
const END_ID = -2;
const NEIGHBOR_MAX_DIST = GRID_SPACING * Math.SQRT2 + 1e-6;
const ATTACH_RADIUS = GRID_SPACING * Math.SQRT2 + GRID_SPACING;
const MAX_ATTACH = 16;

const PORTAL_Z = RESIDENT_MIN_Z;

/**
 * @typedef {{ x: number, z: number, index: number }} NavNode
 * @typedef {{ nodes: NavNode[], neighbors: number[][] }} NavGraph
 */

/**
 * @param {PointXZ} point
 * @param {boolean} permitGate
 * @returns {boolean}
 */
export function isAllowedCenter(point, permitGate) {
  if (!isFinitePoint(point)) return false;
  if (isValidResidentCenter(point)) return true;
  return permitGate === true && isInArrivalCorridor(point);
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @param {boolean} permitGate
 * @returns {boolean}
 */
function segmentStaysAllowed(a, b, permitGate) {
  if (permitGate !== true) {
    return isInResidentDomain(a) && isInResidentDomain(b);
  }
  const aInterior = isInResidentDomain(a);
  const bInterior = isInResidentDomain(b);
  const aCorridor = isInArrivalCorridor(a);
  const bCorridor = isInArrivalCorridor(b);
  if (!aInterior && !aCorridor) return false;
  if (!bInterior && !bCorridor) return false;
  if (aInterior && bInterior) return true;
  if (aCorridor && bCorridor) return true;

  const dz = b.z - a.z;
  const dx = b.x - a.x;
  if (Math.abs(dz) <= GEOM_EPS) {
    return Math.abs(a.z - PORTAL_Z) <= GEOM_EPS;
  }
  const t = (PORTAL_Z - a.z) / dz;
  if (t < -GEOM_EPS || t > 1 + GEOM_EPS) return false;
  const tClamped = Math.max(0, Math.min(1, t));
  const xCross = a.x + tClamped * dx;
  return (
    xCross + GEOM_EPS >= ARRIVAL_CORRIDOR_MIN_X &&
    xCross - GEOM_EPS <= ARRIVAL_CORRIDOR_MAX_X
  );
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @returns {boolean}
 */
function segmentClearsProps(a, b) {
  for (const prop of STATIC_PROPS) {
    if (pointToSegmentDistance(prop, a, b) < PROP_MOVEMENT_RADIUS + GEOM_EPS) {
      return false;
    }
  }
  return true;
}

/**
 * Swept static clearance: domain (or permitted gate corridor) plus
 * movement-inflated prop disks. Not endpoint-only.
 *
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @param {boolean} [permitGate]
 * @returns {boolean}
 */
export function segmentClearsStatic(a, b, permitGate = false) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return false;
  if (!segmentStaysAllowed(a, b, permitGate)) return false;
  return segmentClearsProps(a, b);
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @returns {boolean}
 */
function isShortDiagonal(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return (
    dx > GEOM_EPS &&
    dz > GEOM_EPS &&
    dx <= GRID_SPACING + 1e-6 &&
    dz <= GRID_SPACING + 1e-6
  );
}

/**
 * Grid diagonal is legal only if both corresponding orthogonal corners are
 * statically clear. Applied only to short (≈0.75) diagonal neighbor links.
 *
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @param {boolean} permitGate
 * @returns {boolean}
 */
function orthogonalCornersClear(a, b, permitGate) {
  const orthoX = { x: b.x, z: a.z };
  const orthoZ = { x: a.x, z: b.z };
  if (!isAllowedCenter(orthoX, permitGate) || !isAllowedCenter(orthoZ, permitGate)) {
    return false;
  }
  return (
    segmentClearsStatic(a, orthoX, permitGate) &&
    segmentClearsStatic(a, orthoZ, permitGate) &&
    segmentClearsStatic(orthoX, b, permitGate) &&
    segmentClearsStatic(orthoZ, b, permitGate)
  );
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @param {boolean} permitGate
 * @returns {boolean}
 */
function staticLinkClear(a, b, permitGate) {
  if (!segmentClearsStatic(a, b, permitGate)) return false;
  if (isShortDiagonal(a, b) && !orthogonalCornersClear(a, b, permitGate)) {
    return false;
  }
  return true;
}

/**
 * @param {boolean} includeGate
 * @returns {NavGraph}
 */
function buildNavGraph(includeGate) {
  /** @type {{ x: number, z: number }[]} */
  const raw = [];

  /**
   * @param {PointXZ} point
   * @param {boolean} requireInterior
   */
  function add(point, requireInterior) {
    if (!isFinitePoint(point)) return;
    if (requireInterior) {
      if (!isValidResidentCenter(point)) return;
    } else if (!isInArrivalCorridor(point)) {
      return;
    }
    for (const existing of raw) {
      if (samePoint(existing, point)) return;
    }
    raw.push({ x: point.x, z: point.z });
  }

  const xSpan = RESIDENT_MAX_X - RESIDENT_MIN_X;
  const zSpan = RESIDENT_MAX_Z - RESIDENT_MIN_Z;
  const xCount = Math.floor(xSpan / GRID_SPACING + GEOM_EPS) + 1;
  const zCount = Math.floor(zSpan / GRID_SPACING + GEOM_EPS) + 1;
  for (let iz = 0; iz < zCount; iz += 1) {
    const z = RESIDENT_MIN_Z + iz * GRID_SPACING;
    if (z > RESIDENT_MAX_Z + GEOM_EPS) continue;
    for (let ix = 0; ix < xCount; ix += 1) {
      const x = RESIDENT_MIN_X + ix * GRID_SPACING;
      if (x > RESIDENT_MAX_X + GEOM_EPS) continue;
      add({ x, z }, true);
    }
  }
  add(GATE_INSIDE_WAYPOINT, true);
  add({ x: 0, z: RESIDENT_MIN_Z }, true);

  if (includeGate) {
    add(GATE_STAGING, false);
    const maxK = Math.ceil((PORTAL_Z - GATE_STAGING.z) / GRID_SPACING) + 1;
    for (let k = 1; k < maxK; k += 1) {
      const z = GATE_STAGING.z + k * GRID_SPACING;
      if (z >= PORTAL_Z - GEOM_EPS) break;
      add({ x: 0, z }, false);
    }
  }

  raw.sort((a, b) => a.z - b.z || a.x - b.x);
  /** @type {NavNode[]} */
  const nodes = raw.map((point, index) =>
    Object.freeze({ x: point.x, z: point.z, index }),
  );

  /** @type {number[][]} */
  const neighbors = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const dist = pairDistance(nodes[i], nodes[j]);
      if (dist > NEIGHBOR_MAX_DIST) continue;
      if (!staticLinkClear(nodes[i], nodes[j], includeGate)) continue;
      neighbors[i].push(j);
      neighbors[j].push(i);
    }
  }
  for (const list of neighbors) {
    list.sort((a, b) => a - b);
    Object.freeze(list);
  }
  return Object.freeze({
    nodes: Object.freeze(nodes),
    neighbors: Object.freeze(neighbors),
  });
}

const GRAPH_INTERIOR = buildNavGraph(false);
const GRAPH_GATE = buildNavGraph(true);

/**
 * @param {boolean} permitGate
 * @returns {NavGraph}
 */
function graphFor(permitGate) {
  return permitGate ? GRAPH_GATE : GRAPH_INTERIOR;
}

/**
 * Derived corridors from saved routes. At most MAX_ACTIVE_ROUTES movers.
 * Extra saved routes (corrupt/over-cap) are omitted and treated as
 * non-reservable by later plans.
 *
 * @param {WorldState} world
 * @returns {CorridorReservation[]}
 */
export function rebuildReservations(world) {
  /** @type {CorridorReservation[]} */
  const corridors = [];
  const residents = world?.residents;
  if (!Array.isArray(residents)) return corridors;
  for (const resident of residents) {
    if (corridors.length >= MAX_ACTIVE_ROUTES) break;
    const route = resident?.route;
    if (route == null || !Array.isArray(route.points) || route.points.length < 2) {
      continue;
    }
    corridors.push({
      residentId: resident.id,
      points: route.points.map((point) => copyPoint(point)),
    });
  }
  return corridors;
}

/**
 * @param {WorldState} world
 * @param {string} residentId
 * @returns {number}
 */
function otherMovingRouteCount(world, residentId) {
  let count = 0;
  for (const resident of world.residents) {
    if (resident.id === residentId) continue;
    if (resident.route != null && Array.isArray(resident.route.points) && resident.route.points.length >= 2) {
      count += 1;
    }
  }
  return count;
}

/**
 * @param {WorldState} world
 * @param {string} residentId
 * @returns {{ reservations: CorridorReservation[], stations: PointXZ[] }}
 */
function blockersFor(world, residentId) {
  const rebuilt = rebuildReservations(world);
  const reservedIds = new Set();
  /** @type {CorridorReservation[]} */
  const reservations = [];
  for (const corridor of rebuilt) {
    if (corridor.residentId === residentId) continue;
    reservations.push(corridor);
    reservedIds.add(corridor.residentId);
  }
  /** @type {PointXZ[]} */
  const stations = [];
  for (const resident of world.residents) {
    if (resident.id === residentId) continue;
    if (reservedIds.has(resident.id)) continue;
    stations.push(resident.position);
  }
  return { reservations, stations };
}

/**
 * True if `point` stays ≥ MIN_SEPARATION from every stationary other resident.
 * The requesting resident is ignored as a blocker.
 *
 * @param {PointXZ} point
 * @param {WorldState} world
 * @param {string} residentId
 * @returns {boolean}
 */
export function pointClearsStations(point, world, residentId) {
  if (!isFinitePoint(point)) return false;
  const { stations } = blockersFor(world, residentId);
  for (const station of stations) {
    if (pairDistance(point, station) < MIN_SEPARATION - GEOM_EPS) return false;
  }
  return true;
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @param {readonly PointXZ[]} stations
 * @returns {boolean}
 */
function segmentClearsStationary(a, b, stations) {
  for (const station of stations) {
    if (pointToSegmentDistance(station, a, b) < MIN_SEPARATION - GEOM_EPS) {
      return false;
    }
  }
  return true;
}

/**
 * Segment-to-segment corridor clearance, including crossing segments.
 *
 * @param {readonly PointXZ[]} pointsA
 * @param {readonly PointXZ[]} pointsB
 * @returns {boolean}
 */
export function corridorsClear(pointsA, pointsB) {
  if (!Array.isArray(pointsA) || !Array.isArray(pointsB)) return false;
  if (pointsA.length === 0 || pointsB.length === 0) return true;
  return polylinePolylineDistance(pointsA, pointsB) >= MIN_SEPARATION - GEOM_EPS;
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @param {readonly CorridorReservation[]} reservations
 * @returns {boolean}
 */
function segmentClearsReservations(a, b, reservations) {
  const candidate = [a, b];
  for (const corridor of reservations) {
    if (!corridorsClear(candidate, corridor.points)) return false;
  }
  return true;
}

/**
 * @param {PointXZ} a
 * @param {PointXZ} b
 * @param {{ permitGate: boolean, stations: readonly PointXZ[], reservations: readonly CorridorReservation[] }} ctx
 * @param {{ gridLink?: boolean }} [opts]
 * @returns {string | null}
 */
function segmentBlockReason(a, b, ctx, opts = {}) {
  if (!segmentClearsStatic(a, b, ctx.permitGate)) return 'static';
  if (opts.gridLink === true && isShortDiagonal(a, b) && !orthogonalCornersClear(a, b, ctx.permitGate)) {
    return 'static';
  }
  if (!segmentClearsStationary(a, b, ctx.stations)) return 'stationary';
  if (!segmentClearsReservations(a, b, ctx.reservations)) return 'reservation';
  return null;
}

/**
 * @param {readonly PointXZ[]} points
 * @param {{ permitGate: boolean, stations: readonly PointXZ[], reservations: readonly CorridorReservation[] }} ctx
 * @returns {string | null}
 */
function polylineBlockReason(points, ctx) {
  for (let index = 1; index < points.length; index += 1) {
    const reason = segmentBlockReason(points[index - 1], points[index], ctx);
    if (reason) return reason;
  }
  return null;
}

/**
 * @param {NavGraph} graph
 * @param {PointXZ} point
 * @param {{ permitGate: boolean, stations: readonly PointXZ[], reservations: readonly CorridorReservation[] }} ctx
 * @returns {{ index: number, cost: number }[]}
 */
function attachLinks(graph, point, ctx) {
  /** @type {{ index: number, dist: number }[]} */
  const scored = [];
  for (const node of graph.nodes) {
    scored.push({ index: node.index, dist: pairDistance(point, node) });
  }
  scored.sort((a, b) => a.dist - b.dist || a.index - b.index);
  /** @type {{ index: number, cost: number }[]} */
  const links = [];
  for (const item of scored) {
    if (item.dist > ATTACH_RADIUS && links.length > 0) break;
    if (item.dist > ATTACH_RADIUS * 2) break;
    if (links.length >= MAX_ATTACH) break;
    const node = graph.nodes[item.index];
    if (segmentBlockReason(point, node, ctx, { gridLink: true })) continue;
    links.push({ index: item.index, cost: item.dist });
  }
  return links;
}

/**
 * @param {PointXZ[]} points
 * @param {{ permitGate: boolean, stations: readonly PointXZ[], reservations: readonly CorridorReservation[] }} ctx
 * @returns {PointXZ[]}
 */
function smoothPath(points, ctx) {
  if (points.length <= 2) return points.map((point) => copyPoint(point));
  /** @type {PointXZ[]} */
  const smoothed = [copyPoint(points[0])];
  let i = 0;
  while (i < points.length - 1) {
    let best = i + 1;
    for (let j = points.length - 1; j > i + 1; j -= 1) {
      if (segmentBlockReason(points[i], points[j], ctx) == null) {
        best = j;
        break;
      }
    }
    smoothed.push(copyPoint(points[best]));
    i = best;
  }
  return smoothed;
}

/**
 * @param {NavGraph} graph
 * @param {PointXZ} start
 * @param {PointXZ} dest
 * @param {{ permitGate: boolean, stations: readonly PointXZ[], reservations: readonly CorridorReservation[] }} ctx
 * @returns {{ path: PointXZ[] | null, reason: string | null, expanded: number }}
 */
function searchPath(graph, start, dest, ctx) {
  const startLinks = attachLinks(graph, start, ctx);
  const endLinks = attachLinks(graph, dest, ctx);
  if (startLinks.length === 0 || endLinks.length === 0) {
    const probe = segmentBlockReason(start, dest, ctx);
    return { path: null, reason: probe ?? 'search-exhausted', expanded: 0 };
  }

  const endAttach = new Map();
  for (const link of endLinks) endAttach.set(link.index, link.cost);

  /** @type {Map<number, number>} */
  const gScore = new Map();
  /** @type {Map<number, number>} */
  const parent = new Map();
  gScore.set(START_ID, 0);

  /**
   * @param {number} id
   * @returns {number}
   */
  function heuristic(id) {
    if (id === END_ID) return 0;
    if (id === START_ID) return pairDistance(start, dest);
    return pairDistance(graph.nodes[id], dest);
  }

  /**
   * @param {number} id
   * @returns {number}
   */
  function sortIndex(id) {
    if (id === START_ID) return -1;
    if (id === END_ID) return graph.nodes.length;
    return id;
  }

  /**
   * @param {{ id: number, g: number, f: number }} a
   * @param {{ id: number, g: number, f: number }} b
   * @returns {boolean}
   */
  function better(a, b) {
    if (a.f !== b.f) return a.f < b.f;
    if (a.g !== b.g) return a.g < b.g;
    return sortIndex(a.id) < sortIndex(b.id);
  }

  /** @type {{ id: number, g: number, f: number }[]} */
  const open = [{ id: START_ID, g: 0, f: heuristic(START_ID) }];
  let expanded = 0;
  let sawReservation = false;
  let sawStationary = false;
  let sawStatic = false;
  let found = false;

  while (open.length > 0) {
    let bestAt = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (better(open[i], open[bestAt])) bestAt = i;
    }
    const [current] = open.splice(bestAt, 1);
    const known = gScore.get(current.id);
    if (known != null && current.g > known + GEOM_EPS) continue;
    if (current.id === END_ID) {
      found = true;
      break;
    }
    expanded += 1;
    if (expanded > MAX_EXPANDED_NODES) {
      return { path: null, reason: 'search-exhausted', expanded };
    }

    /**
     * @param {number} nextId
     * @param {number} cost
     * @param {string | null} block
     */
    function consider(nextId, cost, block) {
      if (block) {
        if (block === 'reservation') sawReservation = true;
        else if (block === 'stationary') sawStationary = true;
        else sawStatic = true;
        return;
      }
      const ng = current.g + cost;
      const prev = gScore.get(nextId);
      if (prev != null && ng >= prev - GEOM_EPS) return;
      gScore.set(nextId, ng);
      parent.set(nextId, current.id);
      open.push({ id: nextId, g: ng, f: ng + heuristic(nextId) });
    }

    if (current.id === START_ID) {
      for (const link of startLinks) {
        consider(link.index, link.cost, null);
      }
      continue;
    }

    const node = graph.nodes[current.id];
    for (const next of graph.neighbors[current.id]) {
      const other = graph.nodes[next];
      const block = segmentBlockReason(node, other, ctx, { gridLink: true });
      consider(next, segmentLength(node, other), block);
    }
    const endCost = endAttach.get(current.id);
    if (endCost != null) {
      consider(END_ID, endCost, segmentBlockReason(node, dest, ctx, { gridLink: true }));
    }
  }

  if (!found) {
    let reason = 'search-exhausted';
    if (sawReservation) reason = 'reservation';
    else if (sawStationary) reason = 'stationary';
    else if (sawStatic) reason = 'static';
    return { path: null, reason, expanded };
  }

  /** @type {number[]} */
  const ids = [];
  let cursor = END_ID;
  const guard = graph.nodes.length + 8;
  let hops = 0;
  while (cursor !== START_ID && hops < guard) {
    ids.push(cursor);
    const prev = parent.get(cursor);
    if (prev == null) {
      return { path: null, reason: 'search-exhausted', expanded };
    }
    cursor = prev;
    hops += 1;
  }
  ids.reverse();

  /** @type {PointXZ[]} */
  const points = [copyPoint(start)];
  for (const id of ids) {
    if (id === END_ID) continue;
    const node = graph.nodes[id];
    const last = points[points.length - 1];
    if (samePoint(last, node)) continue;
    if (samePoint(node, dest)) continue;
    points.push(copyPoint(node));
  }
  const tail = points[points.length - 1];
  if (!samePoint(tail, dest)) points.push(copyPoint(dest));
  return { path: points, reason: null, expanded };
}

/**
 * @param {unknown} destination
 * @param {boolean} permitGate
 * @returns {string | null}
 */
function destinationReason(destination, permitGate) {
  if (!isFinitePoint(destination)) return 'invalid-end';
  const inCorridor = isInArrivalCorridor(destination);
  if (!permitGate && inCorridor) return 'gate-denied';
  if (isAllowedCenter(destination, permitGate)) return null;
  if (isInResidentDomain(destination) || (permitGate && inCorridor)) {
    return 'static';
  }
  return 'invalid-end';
}

/**
 * @param {PlanRouteArgs} args
 * @returns {PlanRouteDiag}
 */
export function planRouteWithDiag(args) {
  const world = args?.world;
  const residentId = args?.residentId;
  const destination = args?.destination;
  const permitGate = args?.permitGate === true;

  if (!world || !Array.isArray(world.residents) || typeof residentId !== 'string') {
    return { route: null, reason: 'invalid-end' };
  }

  const resident = world.residents.find((entry) => entry.id === residentId);
  if (!resident || !isFinitePoint(resident.position)) {
    return { route: null, reason: 'invalid-end' };
  }

  const destReason = destinationReason(destination, permitGate);
  if (destReason) return { route: null, reason: destReason };

  const start = resident.position;
  if (!permitGate && isInArrivalCorridor(start)) {
    return { route: null, reason: 'gate-denied' };
  }
  if (!isAllowedCenter(start, permitGate)) {
    if (isInResidentDomain(start) || (permitGate && isInArrivalCorridor(start))) {
      return { route: null, reason: 'static' };
    }
    return { route: null, reason: 'invalid-end' };
  }

  if (samePoint(start, destination) || pairDistance(start, destination) <= GEOM_EPS) {
    return {
      route: { points: [copyPoint(start)], length: 0 },
      reason: null,
    };
  }

  if (otherMovingRouteCount(world, residentId) >= MAX_ACTIVE_ROUTES) {
    return { route: null, reason: 'capacity' };
  }

  const { reservations, stations } = blockersFor(world, residentId);
  const ctx = { permitGate, stations, reservations };

  const directBlock = segmentBlockReason(start, destination, ctx);
  if (directBlock == null) {
    const points = [copyPoint(start), copyPoint(destination)];
    return { route: { points, length: segmentLength(start, destination) }, reason: null };
  }

  const graph = graphFor(permitGate);
  const searched = searchPath(graph, start, destination, ctx);
  if (searched.path == null) {
    return { route: null, reason: searched.reason ?? 'search-exhausted' };
  }

  const smoothed = smoothPath(searched.path, ctx);
  if (smoothed.length > MAX_ROUTE_POINTS) {
    return { route: null, reason: 'search-exhausted' };
  }
  const leftover = polylineBlockReason(smoothed, ctx);
  if (leftover) return { route: null, reason: leftover };

  return {
    route: { points: smoothed, length: polylineLength(smoothed) },
    reason: null,
  };
}

/**
 * @param {PlanRouteArgs} args
 * @returns {RouteResult | null}
 */
export function planRoute(args) {
  return planRouteWithDiag(args).route;
}

/**
 * Development blocker diagnostic. Null when a route exists.
 *
 * @param {PlanRouteArgs} args
 * @returns {string | null}
 */
export function explainRouteBlock(args) {
  const { route, reason } = planRouteWithDiag(args);
  return route == null ? reason : null;
}

