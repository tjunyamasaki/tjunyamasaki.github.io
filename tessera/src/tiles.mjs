// Tile catalogue and geometry. Pure module: no DOM, so the rules engine and the
// tests can share exactly the shapes that the renderer paints.
//
// Local tile space: u runs west→east, v runs north→south, both 0..1.
// Sides are numbered clockwise: 0 N, 1 E, 2 S, 3 W.
// Each side carries three ports (clockwise along the side), so port p sits on
// side floor(p/3). Ports are what features connect through: a city side uses all
// three, a road side uses the middle one with meadow on either hand.

export const RES = 64;
export const SIDE_NAMES = ['north', 'east', 'south', 'west'];
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
const ROAD_HALF = 0.062;
const PORT_T = [1 / 6, 1 / 2, 5 / 6];

// Counts follow the classic 72-tile land; D is also the starting tile.
const DEFS = [
  { id: 'A', name: 'Wayside abbey', count: 2, monastery: true, roads: [[2]] },
  { id: 'B', name: 'Abbey', count: 4, monastery: true },
  { id: 'C', name: 'Grand citadel', count: 1, cities: [{ sides: [0, 1, 2, 3], shield: true }] },
  { id: 'D', name: 'Town gate road', count: 4, cities: [{ sides: [0] }], roads: [[1, 3]] },
  { id: 'E', name: 'Hill town', count: 5, cities: [{ sides: [0] }] },
  { id: 'F', name: 'Bridge town', count: 2, cities: [{ sides: [1, 3], shield: true }] },
  { id: 'G', name: 'Long town', count: 1, cities: [{ sides: [0, 2] }] },
  { id: 'H', name: 'Twin towns', count: 3, cities: [{ sides: [1] }, { sides: [3] }] },
  { id: 'I', name: 'Corner towns', count: 2, cities: [{ sides: [1] }, { sides: [2] }] },
  { id: 'J', name: 'Town & east bend', count: 3, cities: [{ sides: [0] }], roads: [[1, 2]] },
  { id: 'K', name: 'Town & west bend', count: 3, cities: [{ sides: [0] }], roads: [[2, 3]] },
  { id: 'L', name: 'Market crossroads', count: 3, cities: [{ sides: [0] }], roads: [[1], [2], [3]], junction: true },
  { id: 'M', name: 'Corner keep', count: 2, cities: [{ sides: [0, 3], shield: true }] },
  { id: 'N', name: 'Corner town', count: 3, cities: [{ sides: [0, 3] }] },
  { id: 'O', name: 'Corner keep & road', count: 2, cities: [{ sides: [0, 3], shield: true }], roads: [[1, 2]] },
  { id: 'P', name: 'Corner town & road', count: 3, cities: [{ sides: [0, 3] }], roads: [[1, 2]] },
  { id: 'Q', name: 'High citadel', count: 1, cities: [{ sides: [0, 1, 3], shield: true }] },
  { id: 'R', name: 'Three-walled town', count: 3, cities: [{ sides: [0, 1, 3] }] },
  { id: 'S', name: 'Citadel gate', count: 2, cities: [{ sides: [0, 1, 3], shield: true }], roads: [[2]] },
  { id: 'T', name: 'Town gate', count: 1, cities: [{ sides: [0, 1, 3] }], roads: [[2]] },
  { id: 'U', name: 'Straight road', count: 8, roads: [[0, 2]] },
  { id: 'V', name: 'Road bend', count: 9, roads: [[2, 3]] },
  { id: 'W', name: 'Three-way', count: 4, roads: [[1], [2], [3]], junction: true },
  { id: 'X', name: 'Crossroads', count: 1, roads: [[0], [1], [2], [3]], junction: true },
];

export const START_TILE = 'D';

const clamp01 = x => Math.min(1, Math.max(0, x));
export const sideDist = (s, u, v) => (s === 0 ? v : s === 1 ? 1 - u : s === 2 ? 1 - v : u);
export const sideT = (s, u, v) => (s === 0 ? u : s === 1 ? v : s === 2 ? 1 - u : 1 - v);
export function sidePoint(s, t, depth = 0) {
  if (s === 0) return [t, depth];
  if (s === 1) return [1 - depth, t];
  if (s === 2) return [1 - t, 1 - depth];
  return [depth, 1 - t];
}
const capDepth = (t, base, peak) => base + peak * Math.sin(Math.PI * clamp01(t));

function inCity(sides, u, v) {
  if (sides.length === 4) return true;
  if (sides.length === 1) {
    const s = sides[0];
    return sideDist(s, u, v) < capDepth(sideT(s, u, v), 0.05, 0.27);
  }
  if (sides.length === 3) {
    const m = [0, 1, 2, 3].find(s => !sides.includes(s));
    return sideDist(m, u, v) > capDepth(sideT(m, u, v), 0.06, 0.27);
  }
  const [a, b] = sides;
  if ((a + 2) % 4 === b) {
    const o1 = (a + 1) % 4, o2 = (a + 3) % 4;
    return sideDist(o1, u, v) > capDepth(sideT(o1, u, v), 0.05, 0.25)
      && sideDist(o2, u, v) > capDepth(sideT(o2, u, v), 0.05, 0.25);
  }
  const da = sideDist(a, u, v), db = sideDist(b, u, v);
  return da + db < 1 + 0.06 * (1 - (da - db) ** 2);
}

const sideMid = s => sidePoint(s, 0.5, 0);

/** Polyline for a road feature, from its first side toward its second side (or the centre). */
export function roadPath(sides, steps = 16) {
  const a = sideMid(sides[0]);
  if (sides.length === 1) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([a[0] + (0.5 - a[0]) * t, a[1] + (0.5 - a[1]) * t]);
    }
    return pts;
  }
  const b = sideMid(sides[1]);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, m = 1 - t;
    pts.push([m * m * a[0] + 2 * m * t * 0.5 + t * t * b[0], m * m * a[1] + 2 * m * t * 0.5 + t * t * b[1]]);
  }
  return pts;
}

function distToPolyline(pts, u, v) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
    const t = len ? clamp01(((u - x1) * dx + (v - y1) * dy) / len) : 0;
    const ex = x1 + dx * t - u, ey = y1 + dy * t - v;
    best = Math.min(best, ex * ex + ey * ey);
  }
  return Math.sqrt(best);
}

/**
 * What lies at a point of a tile type's artwork: city/road (with index into
 * def.cities / def.roads), the abbey grounds, the junction square, or meadow.
 */
export function classify(def, u, v, paths = def.roadPaths) {
  const cities = def.cities || [];
  for (let i = 0; i < cities.length; i++) if (inCity(cities[i].sides, u, v)) return { kind: 'city', index: i };
  if (def.monastery && Math.abs(u - 0.5) < 0.17 && Math.abs(v - 0.5) < 0.17) return { kind: 'monastery', index: 0 };
  if (def.junction && (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.1 ** 2) return { kind: 'junction', index: 0 };
  const roads = def.roads || [];
  for (let i = 0; i < roads.length; i++) {
    const d = distToPolyline(paths[i], u, v);
    if (d < ROAD_HALF) return { kind: 'road', index: i, edge: d / ROAD_HALF };
  }
  return { kind: 'field', index: -1 };
}

const BLOCK = -2, OPEN = -1;

function deriveTile(def, typeIndex) {
  const cities = def.cities || [], roads = def.roads || [];
  const roadPaths = roads.map(sides => roadPath(sides));
  const base = { ...def, cities, roads, roadPaths };
  const features = [];
  cities.forEach((c, i) => features.push({ type: 'city', sides: c.sides.slice(), shield: !!c.shield, ports: [], index: i }));
  roads.forEach((r, i) => features.push({ type: 'road', sides: r.slice(), ports: [], index: i }));
  const monasteryFeature = def.monastery ? features.push({ type: 'monastery', sides: [], ports: [] }) - 1 : -1;
  const roadOffset = cities.length;

  const labels = new Int16Array(RES * RES);
  for (let y = 0; y < RES; y++) {
    for (let x = 0; x < RES; x++) {
      const c = classify(base, (x + 0.5) / RES, (y + 0.5) / RES, roadPaths);
      labels[y * RES + x] = c.kind === 'city' ? c.index
        : c.kind === 'road' ? roadOffset + c.index
          : c.kind === 'monastery' ? monasteryFeature
            : c.kind === 'junction' ? BLOCK : OPEN;
    }
  }

  // Meadows are whatever the cities and roads leave behind, split into
  // 4-connected regions so a road genuinely separates two fields.
  const comp = new Int32Array(RES * RES).fill(-1);
  let compCount = 0;
  const queue = new Int32Array(RES * RES);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== OPEN || comp[i] >= 0) continue;
    let head = 0, tail = 0;
    queue[tail++] = i; comp[i] = compCount;
    while (head < tail) {
      const p = queue[head++], x = p % RES, y = (p / RES) | 0;
      const near = [x > 0 ? p - 1 : -1, x < RES - 1 ? p + 1 : -1, y > 0 ? p - RES : -1, y < RES - 1 ? p + RES : -1];
      for (const n of near) if (n >= 0 && labels[n] === OPEN && comp[n] < 0) { comp[n] = compCount; queue[tail++] = n; }
    }
    compCount++;
  }

  const portFeature = new Array(12).fill(-1);
  const compFeature = new Map();
  for (let p = 0; p < 12; p++) {
    const s = Math.floor(p / 3);
    const [u, v] = sidePoint(s, PORT_T[p % 3], 1.5 / RES);
    const i = Math.min(RES - 1, Math.floor(v * RES)) * RES + Math.min(RES - 1, Math.floor(u * RES));
    if (labels[i] >= 0) portFeature[p] = labels[i];
    else if (labels[i] === OPEN) {
      const c = comp[i];
      if (!compFeature.has(c)) compFeature.set(c, features.push({ type: 'field', sides: [], ports: [], cities: [] }) - 1);
      portFeature[p] = compFeature.get(c);
    } else throw new Error(`Tile ${def.id}: port ${p} lands on a blocked square`);
  }
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === OPEN) labels[i] = compFeature.has(comp[i]) ? compFeature.get(comp[i]) : BLOCK;
  }
  portFeature.forEach((f, p) => features[f].ports.push(p));

  // Which towns each meadow touches, for end-of-game meadow scoring.
  for (let y = 0; y < RES; y++) {
    for (let x = 0; x < RES; x++) {
      const f = labels[y * RES + x];
      if (f < 0 || features[f].type !== 'field') continue;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= RES || ny >= RES) continue;
        const g = labels[ny * RES + nx];
        if (g >= 0 && features[g].type === 'city' && !features[f].cities.includes(g)) features[f].cities.push(g);
      }
    }
  }

  const edges = [0, 1, 2, 3].map(s => {
    const [a, b, c] = [portFeature[s * 3], portFeature[s * 3 + 1], portFeature[s * 3 + 2]];
    const mid = features[b].type;
    if (mid === 'city') {
      if (a !== b || c !== b) throw new Error(`Tile ${def.id}: city side ${s} is not whole`);
      return 'C';
    }
    if (features[a].type !== 'field' || features[c].type !== 'field') throw new Error(`Tile ${def.id}: side ${s} has a broken meadow`);
    if (mid === 'road') return 'R';
    if (mid === 'field') return 'F';
    throw new Error(`Tile ${def.id}: side ${s} middle is ${mid}`);
  });
  for (const f of features) {
    if (f.type === 'city' || f.type === 'road') {
      for (const s of f.sides) if (portFeature[s * 3 + 1] !== features.indexOf(f)) throw new Error(`Tile ${def.id}: ${f.type} misses side ${s}`);
    }
  }

  // Anchor: the point deepest inside each feature (chamfer distance), nudged
  // toward the feature's centroid so long roads anchor at their middle.
  const dist = new Float32Array(RES * RES);
  features.forEach((f, fi) => {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < labels.length; i++) {
      const inside = labels[i] === fi;
      dist[i] = inside ? 1e9 : 0;
      if (inside) { sx += i % RES; sy += (i / RES) | 0; n++; }
    }
    f.area = n / (RES * RES);
    // The abbey itself stands in the north of its grounds; its monk waits in the cloister yard.
    if (f.type === 'monastery') { f.anchor = [0.5, 0.63]; return; }
    const at = (x, y) => (x < 0 || y < 0 || x >= RES || y >= RES ? 0 : dist[y * RES + x]);
    for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
      const i = y * RES + x;
      if (dist[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.41, at(x + 1, y - 1) + 1.41);
    }
    for (let y = RES - 1; y >= 0; y--) for (let x = RES - 1; x >= 0; x--) {
      const i = y * RES + x;
      if (dist[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.41, at(x - 1, y + 1) + 1.41);
    }
    const cx = sx / n, cy = sy / n;
    let best = -Infinity, bx = 0, by = 0;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] !== fi) continue;
      const x = i % RES, y = (i / RES) | 0;
      const score = Math.min(dist[i], 9) - 0.12 * Math.hypot(x - cx, y - cy);
      if (score > best) { best = score; bx = x; by = y; }
    }
    f.anchor = [(bx + 0.5) / RES, (by + 0.5) / RES];
  });

  return {
    ...base, index: typeIndex, features, portFeature, edges, labels,
    monasteryFeature,
    shields: cities.filter(c => c.shield).length,
  };
}

export const TILE_TYPES = DEFS.map(deriveTile);
export const TYPE_BY_ID = Object.fromEntries(TILE_TYPES.map(t => [t.id, t]));

/** Edge letter ('C' | 'R' | 'F') a rotated tile shows on a world side. */
export const edgeAt = (type, rot, side) => type.edges[(side - rot + 4) % 4];
/** Local feature index behind a world port on a rotated tile. */
export const featureAtPort = (type, rot, port) => type.portFeature[(port - 3 * rot + 12) % 12];
/** Rotate a local point clockwise by rot quarter turns. */
export function rotatePoint(u, v, rot) {
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) [u, v] = [1 - v, u];
  return [u, v];
}
/** Label (feature index, or negative for none) at a local raster cell. */
export const labelAt = (type, x, y) => type.labels[y * RES + x];

/** The full shuffled-before bag of tile type indices, minus the starting tile. */
export function tileBag() {
  const bag = [];
  for (const t of TILE_TYPES) for (let i = 0; i < t.count - (t.id === START_TILE ? 1 : 0); i++) bag.push(t.index);
  return bag;
}
