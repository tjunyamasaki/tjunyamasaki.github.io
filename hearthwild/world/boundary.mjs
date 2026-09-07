export function vertexRadius(vertex) {
  return Math.hypot(vertex.x, vertex.z);
}

export function radiusAtAngle(polygon, angle) {
  const n = polygon.length;
  if (!n) return 0;
  const tau = Math.PI * 2;
  let a = angle % tau;
  if (a < 0) a += tau;
  const t = a / tau * n;
  const i = Math.floor(t) % n;
  const f = t - Math.floor(t);
  const r0 = vertexRadius(polygon[i]);
  const r1 = vertexRadius(polygon[(i + 1) % n]);
  return r0 * (1 - f) + r1 * f;
}

export function radiusAt(polygon, x, z) {
  if (Math.abs(x) < 1e-12 && Math.abs(z) < 1e-12) return radiusAtAngle(polygon, 0);
  return radiusAtAngle(polygon, Math.atan2(z, x));
}

function cross(ax, az, bx, bz, px, pz) {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
}

export function pointInPolygon(polygon, x, z) {
  let winding = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a.z <= z) {
      if (b.z > z && cross(a.x, a.z, b.x, b.z, x, z) > 0) winding += 1;
    } else if (b.z <= z && cross(a.x, a.z, b.x, b.z, x, z) < 0) winding -= 1;
  }
  return winding !== 0;
}

function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  let t = length2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / length2 : 0;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

export function distanceToEdges(polygon, x, z) {
  let min = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    min = Math.min(min, distanceToSegment(x, z, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return min;
}

export function isInside(polygon, x, z, margin = 0) {
  if (!pointInPolygon(polygon, x, z)) return false;
  if (margin <= 0) return true;
  return distanceToEdges(polygon, x, z) >= margin - 1e-8;
}

function inwardNormal(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  let nx = -dz / length;
  let nz = dx / length;
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  if (nx * -mx + nz * -mz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x: nx, z: nz };
}

function closestOnPolygon(polygon, x, z) {
  let bestX = x;
  let bestZ = z;
  let bestDist = Infinity;
  let bestNx = 0;
  let bestNz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    let t = length2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / length2 : 0;
    t = Math.min(1, Math.max(0, t));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < bestDist) {
      bestDist = dist;
      bestX = px;
      bestZ = pz;
      const normal = inwardNormal(a, b);
      bestNx = normal.x;
      bestNz = normal.z;
    }
  }
  return { x: bestX, z: bestZ, nx: bestNx, nz: bestNz, dist: bestDist };
}

export function constrainPosition(polygon, x, z, margin = 0) {
  if (isInside(polygon, x, z, margin)) return { x, z };
  const hit = closestOnPolygon(polygon, x, z);
  const inset = { x: hit.x + hit.nx * margin, z: hit.z + hit.nz * margin };
  if (isInside(polygon, inset.x, inset.z, margin)) return inset;
  const radius = Math.hypot(x, z);
  if (radius < 1e-9) return { x: 0, z: 0 };
  const ux = x / radius;
  const uz = z / radius;
  let lo = 0;
  let hi = radius;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (isInside(polygon, ux * mid, uz * mid, margin)) lo = mid;
    else hi = mid;
  }
  while (lo > 0 && !isInside(polygon, ux * lo, uz * lo, margin)) lo *= 0.985;
  return { x: ux * lo, z: uz * lo };
}

export function pickWalkTarget(polygon, x, z, walkMargin) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (!pointInPolygon(polygon, x, z)) return null;
  return constrainPosition(polygon, x, z, walkMargin);
}

export function walkPolygon(polygon, walkMargin) {
  const n = polygon.length;
  return polygon.map((vertex, i) => {
    const prev = polygon[(i + n - 1) % n];
    const next = polygon[(i + 1) % n];
    const n0 = inwardNormal(prev, vertex);
    const n1 = inwardNormal(vertex, next);
    let nx = n0.x + n1.x;
    let nz = n0.z + n1.z;
    const length = Math.hypot(nx, nz);
    if (length < 1e-8) return constrainPosition(polygon, vertex.x, vertex.z, walkMargin);
    nx /= length;
    nz /= length;
    const inset = { x: vertex.x + nx * walkMargin, z: vertex.z + nz * walkMargin };
    if (isInside(polygon, inset.x, inset.z, walkMargin * 0.9)) return inset;
    return constrainPosition(polygon, vertex.x, vertex.z, walkMargin);
  });
}
