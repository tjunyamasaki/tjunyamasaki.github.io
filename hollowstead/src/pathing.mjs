// Single-walker pathing: A* over a 0.5-unit grid for anything that walks somewhere on its own.
//
//   steer()      where to head next toward a point: straight while the line is clear, otherwise along a
//                planned path round trunks, walls, water and the camp. Used by wanderers walking to what
//                they tapped, by ground allies, and by creatures the shared flow fields (mobs.mjs) do not
//                cover (going home, chasing a summon, or too far from their prey's field).
//   slideMove()  world.move, plus a glance off a corner: when the step is blocked outright it tries the
//                nearest open heading (±30°..±80°), keeping to one side so a walker rounds a trunk
//                instead of pressing into it.
//
// Plans live in a non-enumerable map on the world (never in a snapshot) keyed by walker id; the host
// alone runs them. Each tick has a small planning budget so a crowd cannot stall a frame.
const CELL = .5, SAMPLE = .25;
const MAX_EXPAND = 9000, MARGIN = 10, MAX_SPAN = 90;
const PULL = 14, HORIZON = 10, REPLAN = 2.5, LOS_EVERY = .2, TARGET_DRIFT = 1.5, BUDGET = 2;
const SQRT2 = Math.SQRT2;
const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

const MAX_CELLS = Math.ceil(MAX_SPAN/CELL+1)**2;
const SEEN = new Uint32Array(MAX_CELLS), STATE = new Uint8Array(MAX_CELLS), CLOSED = new Uint8Array(MAX_CELLS);
const G = new Float32Array(MAX_CELLS), F = new Float32Array(MAX_CELLS), PARENT = new Int32Array(MAX_CELLS), HEAP = new Int32Array(MAX_CELLS*4);
let generation = 0;
function nextGeneration(){
  if(++generation >= 0xffffffff){SEEN.fill(0); generation = 1;}
  return generation;
}

function pathsOf(world){
  if(!world.walkPaths) Object.defineProperty(world, 'walkPaths', {value: new Map(), writable: true, configurable: true, enumerable: false});
  if(world.pathTick !== world.time){
    Object.defineProperty(world, 'pathTick', {value: world.time, writable: true, configurable: true, enumerable: false});
    Object.defineProperty(world, 'pathBudget', {value: BUDGET, writable: true, configurable: true, enumerable: false});
    // Forget plans nobody asked about for a while (dead creatures, finished walks).
    if(world.walkPaths.size > 64 || (world.time*4|0)%40 === 0) for(const [key, entry] of world.walkPaths) if(world.time-entry.seen > 4) world.walkPaths.delete(key);
  }
  return world.walkPaths;
}

/** True when a walker can go in a straight line from (x0,z0) to (x1,z1) without touching anything solid. */
export function clearLine(world, obstacles, x0, z0, x1, z1, selfId = null){
  const d = Math.hypot(x1-x0, z1-z0), n = Math.ceil(d/SAMPLE);
  for(let k = 1; k <= n; k++){
    const t = k/n;
    if(world.blockedAt(x0+(x1-x0)*t, z0+(z1-z0)*t, obstacles, selfId)) return false;
  }
  return true;
}

/**
 * A* from (sx,sz) to anywhere within `stop` of (tx,tz). Returns {points:[{x,z}], complete}. When the
 * goal cannot be reached (inside a thicket, walled in) the path ends at the closest point it found.
 */
export function findPath(world, obstacles, sx, sz, tx, tz, {stop = .3, selfId = null, wide = true, radius = 0, expand = MAX_EXPAND} = {}){
  // A tight box first (cheap); if the way round leaves it, look again much wider.
  const near = searchPath(world, obstacles, sx, sz, tx, tz, stop, selfId, MARGIN, radius, expand);
  return near.complete || !wide ? near : searchPath(world, obstacles, sx, sz, tx, tz, stop, selfId, MARGIN*3, radius, expand);
}

function searchPath(world, obstacles, sx, sz, tx, tz, stop, selfId, margin, radius, expand){
  // A solid target (a hearth, a chest) is reached at its edge, never its centre.
  const reach = Math.max(stop, CELL*.75, radius > 0 ? radius+.33+CELL : 0);
  let x0 = Math.min(sx, tx)-margin, x1 = Math.max(sx, tx)+margin, z0 = Math.min(sz, tz)-margin, z1 = Math.max(sz, tz)+margin;
  if(x1-x0 > MAX_SPAN){const c = (sx+tx)/2; x0 = c-MAX_SPAN/2; x1 = c+MAX_SPAN/2;}
  if(z1-z0 > MAX_SPAN){const c = (sz+tz)/2; z0 = c-MAX_SPAN/2; z1 = c+MAX_SPAN/2;}
  const W = Math.ceil((x1-x0)/CELL), H = Math.ceil((z1-z0)/CELL);
  // Scratch arrays are shared between searches; a generation stamp marks what this search touched.
  const gen = nextGeneration();
  const cx = i => x0+(i+.5)*CELL, cz = j => z0+(j+.5)*CELL;
  // state: 0 unknown, 1 open, 2 solid (valid only where seen[k] === gen)
  const solid = k => {
    if(SEEN[k] !== gen){SEEN[k] = gen; G[k] = Infinity; PARENT[k] = -1; CLOSED[k] = 0; const i = k%W, j = (k-i)/W; STATE[k] = world.blockedAt(cx(i), cz(j), obstacles, selfId) ? 2 : 1;}
    return STATE[k] === 2;
  };
  const h = (i, j) => Math.max(0, Math.hypot(cx(i)-tx, cz(j)-tz)-reach);
  const si = Math.max(0, Math.min(W-1, Math.floor((sx-x0)/CELL))), sj = Math.max(0, Math.min(H-1, Math.floor((sz-z0)/CELL)));
  const start = sj*W+si;
  SEEN[start] = gen; STATE[start] = 1; G[start] = 0; PARENT[start] = -1; CLOSED[start] = 0; // the walker stands here, whatever the grid says
  // Binary heap of cell indices by F.
  let size = 0;
  const push = k => {let i = size++; while(i > 0){const p = (i-1)>>1; if(F[HEAP[p]] <= F[k]) break; HEAP[i] = HEAP[p]; i = p;} HEAP[i] = k;};
  const pop = () => {
    const top = HEAP[0], last = HEAP[--size];
    if(size){let i = 0; while(true){let c = i*2+1; if(c >= size) break; if(c+1 < size && F[HEAP[c+1]] < F[HEAP[c]]) c++; if(F[HEAP[c]] >= F[last]) break; HEAP[i] = HEAP[c]; i = c;} HEAP[i] = last;}
    return top;
  };
  F[start] = h(si, sj); push(start);
  let best = start, bestH = F[start], goal = -1, expanded = 0;
  while(size && expanded < expand){
    const k = pop(); if(CLOSED[k]) continue; CLOSED[k] = 1; expanded++;
    const i = k%W, j = (k-i)/W, hk = h(i, j);
    if(hk <= 0){goal = k; break;}
    if(hk < bestH){bestH = hk; best = k;}
    for(const [di, dj, cost] of STEPS){
      const ni = i+di, nj = j+dj; if(ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = nj*W+ni; if(solid(nk) || CLOSED[nk]) continue;
      // No cutting a corner past a trunk.
      if(di && dj && (solid(j*W+ni) || solid(nj*W+i))) continue;
      const ng = G[k]+cost*CELL;
      if(ng < G[nk] && size < HEAP.length){G[nk] = ng; PARENT[nk] = k; F[nk] = ng+h(ni, nj); push(nk);}
    }
  }
  const end = goal >= 0 ? goal : best;
  const cells = [];
  for(let k = end; k >= 0 && k !== start; k = PARENT[k]) cells.push(k);
  cells.reverse();
  const raw = cells.map(k => {const i = k%W; return {x: cx(i), z: cz((k-i)/W)};});
  // The final leg goes to the target itself when it is standable (a tapped spot, a wanderer).
  if(goal >= 0 && stop <= CELL && !world.blockedAt(tx, tz, obstacles, selfId)) raw.push({x: tx, z: tz});
  // String-pull: skip every corner the walker can see past.
  const points = [];
  let fx = sx, fz = sz, at = 0;
  while(at < raw.length){
    let far = at;
    for(let k = Math.min(raw.length-1, at+PULL); k > at; k--) if(clearLine(world, obstacles, fx, fz, raw[k].x, raw[k].z, selfId)){far = k; break;}
    points.push(raw[far]); fx = raw[far].x; fz = raw[far].z; at = far+1;
  }
  return {points, complete: goal >= 0};
}

/**
 * Heading toward (tx,tz) for `walker`: a unit {x, z}, or null once within `stop`. `done` is set when
 * the target cannot be reached and the walker stands at the closest point. `radius` is the target's
 * own footprint when it is solid. `lazy` (creatures) looks less often and searches a smaller box.
 */
export function steer(world, obstacles, walker, tx, tz, {stop = .3, key = walker.id, lazy = false, radius = 0} = {}){
  const paths = pathsOf(world);
  const dx = tx-walker.x, dz = tz-walker.z, d = Math.hypot(dx, dz);
  if(d <= stop){paths.delete(key); return null;}
  let entry = paths.get(key);
  if(!entry){entry = {seen: world.time, losAt: -1, los: true, path: null}; paths.set(key, entry);}
  entry.seen = world.time;
  const straight = {x: dx/d, z: dz/d};
  // Can the walker see the spot it must reach (the edge of `stop`, not the trunk it is chopping)?
  if(world.time-entry.losAt >= LOS_EVERY*(lazy ? 2 : 1) || Math.hypot(tx-(entry.tx ?? tx), tz-(entry.tz ?? tz)) > TARGET_DRIFT){
    entry.losAt = world.time; entry.tx = tx; entry.tz = tz;
    const edge = Math.max(0, d-Math.max(stop-.15, radius > 0 ? radius+.33+CELL*.5 : 0));
    // Creatures only look a stretch ahead: far off, they close in first and plan once it matters.
    const look = lazy ? Math.min(edge, HORIZON) : edge;
    entry.los = clearLine(world, obstacles, walker.x, walker.z, walker.x+straight.x*look, walker.z+straight.z*look, walker.id);
  }
  if(entry.los){entry.path = null; return straight;}
  const path = entry.path;
  // A dead end is not worth re-searching as often as a good path is worth refreshing.
  const stale = !path || world.time-path.at > REPLAN*(path.complete ? 1 : 2) || Math.hypot(path.tx-tx, path.tz-tz) > TARGET_DRIFT;
  if(stale){
    // Creatures share a small budget per tick; a wanderer's own walk always gets its plan.
    if(lazy && world.pathBudget <= 0) return path ? follow(world, obstacles, walker, path, straight) : straight;
    if(lazy) world.pathBudget--;
    const found = findPath(world, obstacles, walker.x, walker.z, tx, tz, {stop, selfId: walker.id, radius, expand: lazy ? MAX_EXPAND/3 : MAX_EXPAND});
    entry.path = {...found, at: world.time, tx, tz, i: 0};
  }
  return follow(world, obstacles, walker, entry.path, straight);
}

function follow(world, obstacles, walker, path, straight){
  const pts = path.points;
  if(!pts.length) return path.complete ? straight : {x: 0, z: 0, done: true};
  while(path.i < pts.length-1){
    const p = pts[path.i];
    if(Math.hypot(p.x-walker.x, p.z-walker.z) < .45) path.i++;
    else break;
  }
  const p = pts[path.i], d = Math.hypot(p.x-walker.x, p.z-walker.z);
  if(path.i === pts.length-1 && d < .3) return path.complete ? straight : {x: 0, z: 0, done: true};
  return {x: (p.x-walker.x)/Math.max(d, 1e-4), z: (p.z-walker.z)/Math.max(d, 1e-4)};
}

const GLANCE = [.52, 1.05, 1.4]; // ~30°, 60°, 80°
/**
 * world.move, plus rounding a corner: if the step makes (almost) no progress, try the nearest open
 * heading either side, remembering which side worked so the walker keeps circling the same way.
 */
export function slideMove(world, walker, vx, vz, dt, obstacles){
  const sx = walker.x, sz = walker.z;
  const moved = world.move(walker, vx, vz, dt, obstacles);
  const want = Math.hypot(vx, vz)*dt, got = Math.hypot(walker.x-sx, walker.z-sz);
  if(want < 1e-4 || got >= want*.55) return moved;
  const ax = walker.x, az = walker.z, side = walker.slide || 1;
  for(const a of GLANCE) for(const s of [side, -side]){
    const c = Math.cos(a*s), n = Math.sin(a*s), rx = vx*c-vz*n, rz = vx*n+vz*c;
    const nx = sx+rx*dt, nz = sz+rz*dt;
    if(!world.blockedAt(nx, nz, obstacles, walker.id)){
      walker.x = nx; walker.z = nz;
      Object.defineProperty(walker, 'slide', {value: s, writable: true, configurable: true, enumerable: false});
      return true;
    }
  }
  walker.x = ax; walker.z = az;
  return moved;
}
