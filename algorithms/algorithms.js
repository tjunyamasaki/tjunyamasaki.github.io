// Generators advance the real data structures one operation at a time.
// Rendering and playback never decide which operation the algorithm performs.
export const SCENES = {
  sorting: {
    number: '01', label: 'Sorting', eyebrow: 'Order from chaos', color: '#ffc08d',
    hint: 'Tap the bars to reshuffle',
    algorithms: [
      { id: 'quick', name: 'Quick sort', subtitle: 'Divide. Partition. Repeat.', complexity: 'O(n log n) average', delay: 34, description: 'Pick a pivot. Move smaller values to one side and larger values to the other. Repeat until everything finds its place.' },
      { id: 'merge', name: 'Merge sort', subtitle: 'Small pieces. Perfect harmony.', complexity: 'O(n log n)', delay: 31, description: 'Split the array into tiny pieces, then weave sorted halves back together. The auxiliary buffer keeps each merge in order.' },
      { id: 'heap', name: 'Heap sort', subtitle: 'Raise the largest. Let it settle.', complexity: 'O(n log n)', delay: 25, description: 'Build a max heap, bring its largest value to the end, and repair the heap. Each extraction gives one more value its final home.' },
      { id: 'bubble', name: 'Bubble sort', subtitle: 'One small exchange at a time.', complexity: 'O(n²) average', delay: 8, description: 'Compare neighbors and exchange them when they are out of order. Larger values drift right, one small swap at a time.' },
      { id: 'insertion', name: 'Insertion sort', subtitle: 'A place for every piece.', complexity: 'O(n²) average', delay: 15, description: 'Take the next value and slide it left through the sorted prefix. A familiar rhythm: the same way you might arrange a hand of cards.' },
      { id: 'selection', name: 'Selection sort', subtitle: 'Find the smallest. Begin again.', complexity: 'O(n²)', delay: 10, description: 'Scan everything that remains, find its smallest value, and move it into place. One deliberate choice after another.' },
    ],
  },
  graphs: {
    number: '02', label: 'Graphs', eyebrow: 'Follow the connections', color: '#8ee4d2',
    hint: 'Tap a node to begin there',
    algorithms: [
      { id: 'bfs', name: 'Breadth-first search', subtitle: 'A ripple through the network.', complexity: 'O(V + E)', delay: 120, description: 'Visit the nearest neighbors first, then their neighbors. A queue carries the wave outward, one layer of connections at a time.' },
      { id: 'dfs', name: 'Depth-first search', subtitle: 'Follow a thread to its end.', complexity: 'O(V + E)', delay: 125, description: 'Follow one branch as far as it goes, then backtrack. The stack remembers the trail while every connection gets its turn.' },
      { id: 'prim', name: 'Prim’s algorithm', subtitle: 'One tree. The lightest connections.', complexity: 'O(E log E)', delay: 170, description: 'Grow a minimum spanning tree from one node. At every step, add the lightest edge that connects the tree to a new node.' },
      { id: 'kruskal', name: 'Kruskal’s algorithm', subtitle: 'A forest becoming a tree.', complexity: 'O(E log E)', delay: 130, description: 'Consider connections from lightest to heaviest. Join separate components and skip cycles until the whole network becomes one minimum spanning tree.' },
    ],
  },
  mazes: {
    number: '03', label: 'Mazes', eyebrow: 'Make a way through', color: '#c4dc9d',
    hint: 'Tap the maze to grow another',
    algorithms: [
      { id: 'backtracker', name: 'Recursive backtracker', subtitle: 'Wander. Carve. Find the way back.', complexity: 'O(V + E)', delay: 19, description: 'Carve into an unvisited cell, retreat at dead ends, and keep going. When the maze is complete, breadth-first search traces its one solution.' },
      { id: 'prim', name: 'Randomized Prim', subtitle: 'A maze growing from a seed.', complexity: 'O(V + E)', delay: 31, description: 'Choose a random wall on the growing frontier and carve into untouched space. Then watch breadth-first search find the way through.' },
      { id: 'kruskal', name: 'Randomized Kruskal', subtitle: 'Separate rooms. One connected world.', complexity: 'O(E α(V))', delay: 29, description: 'Shuffle the walls and remove only those joining separate regions. The forest of passages becomes a perfect maze, then reveals its solution.' },
    ],
  },
  routes: {
    number: '04', label: 'Routes', eyebrow: 'Find a way home', color: '#bcb7f6',
    hint: 'Tap land to move the destination',
    algorithms: [
      { id: 'astar', name: 'A* pathfinding', subtitle: 'A little intuition goes a long way.', complexity: 'O((V + E) log V)', delay: 34, description: 'Balance the cost so far with Manhattan distance to the goal. Sand costs 1, forest 3, and high ground 6; water is impassable.' },
      { id: 'dijkstra', name: 'Dijkstra’s algorithm', subtitle: 'Every possibility, in order of cost.', complexity: 'O((V + E) log V)', delay: 25, description: 'Explore the cheapest accumulated journey first. With terrain costs of 1, 3, and 6, the shortest-looking route may not be the least expensive.' },
      { id: 'greedy', name: 'Greedy best-first', subtitle: 'Eyes on the destination.', complexity: 'O((V + E) log V)', delay: 82, description: 'Always head toward the cell that looks closest to the goal. Often quick, sometimes costly: greedy search does not guarantee the cheapest route.' },
    ],
  },
};

export function randomSource(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

class UnionFind {
  constructor(n) { this.parent = Array.from({ length: n }, (_, i) => i); this.rank = new Uint8Array(n); }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  join(a, b) {
    a = this.find(a); b = this.find(b);
    if (a === b) return false;
    if (this.rank[a] < this.rank[b]) [a, b] = [b, a];
    this.parent[b] = a;
    if (this.rank[a] === this.rank[b]) this.rank[a]++;
    return true;
  }
}

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    let i = a.length;
    a.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].score <= item.score) break;
      a[i] = a[parent]; i = parent;
    }
    a[i] = item;
  }
  pop() {
    const a = this.items, first = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].score < a[child].score) child++;
        if (last.score <= a[child].score) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
}

function signal(model, caption, at = -1, type = 'visit', delay = 1) {
  model.caption = caption;
  return { at, type, delay };
}

function compare(model, a, b) {
  model.hot = [a, b];
  model.stats.a++;
  return signal(model, `Compare ${model.values[a]} and ${model.values[b]}`, a, 'compare');
}

function exchange(model, a, b) {
  [model.values[a], model.values[b]] = [model.values[b], model.values[a]];
  model.hot = [a, b]; model.stats.b += 2;
  return signal(model, 'Two values trade places', b, 'swap');
}

function* quickSort(model, lo = 0, hi = model.values.length - 1) {
  if (lo > hi) return;
  if (lo === hi) { model.settled.add(lo); return; }
  model.range = [lo, hi];
  const mid = Math.floor((lo + hi) / 2);
  if (mid !== hi) yield exchange(model, mid, hi);
  const pivot = model.values[hi];
  model.pivot = pivot;
  let boundary = lo;
  for (let j = lo; j < hi; j++) {
    yield compare(model, j, hi);
    if (model.values[j] < pivot) {
      if (j !== boundary) yield exchange(model, j, boundary);
      boundary++;
    }
  }
  if (boundary !== hi) yield exchange(model, boundary, hi);
  model.settled.add(boundary);
  yield signal(model, `Pivot ${pivot} has found its home`, boundary, 'settle');
  yield* quickSort(model, lo, boundary - 1);
  yield* quickSort(model, boundary + 1, hi);
}

function* mergeSort(model, lo = 0, hi = model.values.length - 1) {
  if (lo >= hi) return;
  const mid = (lo + hi) >> 1;
  yield* mergeSort(model, lo, mid);
  yield* mergeSort(model, mid + 1, hi);
  model.range = [lo, hi];
  const left = model.values.slice(lo, mid + 1), right = model.values.slice(mid + 1, hi + 1);
  model.buffer = [...left, ...right];
  let i = 0, j = 0, write = lo;
  while (i < left.length || j < right.length) {
    let takeLeft;
    if (i < left.length && j < right.length) {
      model.hot = []; model.bufferHot = [i, left.length + j]; model.stats.a++;
      yield signal(model, `Merge buffer: compare ${left[i]} and ${right[j]}`, write, 'compare');
      takeLeft = left[i] <= right[j];
    } else takeLeft = i < left.length;
    model.bufferHot = [takeLeft ? i : left.length + j];
    const value = takeLeft ? left[i++] : right[j++];
    model.values[write] = value; model.hot = [write]; model.stats.b++;
    yield signal(model, `Write ${value} back from the buffer`, write++, 'write');
  }
  model.buffer = []; model.bufferHot = [];
}

function* siftDown(model, size, root) {
  while (true) {
    let largest = root;
    const left = root * 2 + 1, right = left + 1;
    if (left < size) { yield compare(model, left, largest); if (model.values[left] > model.values[largest]) largest = left; }
    if (right < size) { yield compare(model, right, largest); if (model.values[right] > model.values[largest]) largest = right; }
    if (largest === root) break;
    yield exchange(model, root, largest);
    root = largest;
  }
}

function* heapSort(model) {
  const n = model.values.length;
  for (let i = (n >> 1) - 1; i >= 0; i--) yield* siftDown(model, n, i);
  for (let end = n - 1; end > 0; end--) {
    model.range = [0, end];
    yield exchange(model, 0, end);
    model.settled.add(end);
    yield* siftDown(model, end, 0);
  }
}

function* bubbleSort(model) {
  for (let end = model.values.length - 1; end > 0; end--) {
    let moved = false;
    model.range = [0, end];
    for (let j = 0; j < end; j++) {
      yield compare(model, j, j + 1);
      if (model.values[j] > model.values[j + 1]) { yield exchange(model, j, j + 1); moved = true; }
    }
    model.settled.add(end);
    if (!moved) break;
  }
}

function* insertionSort(model) {
  for (let i = 1; i < model.values.length; i++) {
    model.range = [0, i];
    for (let j = i; j > 0; j--) {
      yield compare(model, j - 1, j);
      if (model.values[j - 1] <= model.values[j]) break;
      yield exchange(model, j - 1, j);
    }
  }
}

function* selectionSort(model) {
  for (let i = 0; i < model.values.length - 1; i++) {
    let min = i;
    model.range = [i, model.values.length - 1];
    for (let j = i + 1; j < model.values.length; j++) {
      yield compare(model, min, j);
      if (model.values[j] < model.values[min]) min = j;
      model.pivot = model.values[min];
    }
    if (min !== i) yield exchange(model, i, min);
    model.settled.add(i);
  }
}

function* sorting(model, id) {
  yield* ({ quick: quickSort, merge: mergeSort, heap: heapSort, bubble: bubbleSort, insertion: insertionSort, selection: selectionSort })[id](model);
  model.range = null; model.pivot = -1; model.hot = []; model.buffer = [];
  for (let i = 0; i < model.values.length; i++) {
    model.settled.add(i);
    yield signal(model, 'Everything in its right place', i, 'settle', 0.6);
  }
  model.caption = 'Order, found. A new arrangement is on its way.';
}

function graphData(random) {
  const nodes = Array.from({ length: 42 }, (_, i) => ({
    x: ((i % 7) + 0.5 + (random() - 0.5) * 0.65) / 7,
    y: (Math.floor(i / 7) + 0.5 + (random() - 0.5) * 0.62) / 6,
  }));
  const edges = [], keys = new Set();
  const distance = (a, b) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
  const add = (a, b) => {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (keys.has(key)) return;
    keys.add(key); edges.push({ a, b, weight: Math.max(1, Math.round(distance(a, b) * 100)), id: edges.length });
  };
  // A geometric spanning tree guarantees connectivity; nearby extra edges add cycles.
  const connected = new Set([0]);
  while (connected.size < nodes.length) {
    let best = [0, 0], shortest = Infinity;
    for (const a of connected) for (let b = 0; b < nodes.length; b++) {
      if (connected.has(b)) continue;
      const d = distance(a, b);
      if (d < shortest) { shortest = d; best = [a, b]; }
    }
    add(...best); connected.add(best[1]);
  }
  for (let a = 0; a < nodes.length; a++) {
    const nearby = nodes.map((_, b) => b).filter(b => b !== a).sort((b, c) => distance(a, b) - distance(a, c));
    for (const b of nearby.slice(0, 3)) if (random() > 0.16) add(a, b);
  }
  const adjacency = nodes.map(() => []);
  for (const edge of edges) {
    adjacency[edge.a].push({ to: edge.b, edge: edge.id, weight: edge.weight });
    adjacency[edge.b].push({ to: edge.a, edge: edge.id, weight: edge.weight });
  }
  return { nodes, edges, adjacency };
}

function* breadthFirst(model) {
  const seen = new Set([model.origin]), queue = [model.origin];
  model.depth[model.origin] = 0;
  model.frontier = queue.slice(); model.stats.b = 1;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    model.visited.add(node); model.activeNode = node;
    for (const next of model.adjacency[node]) {
      if (seen.has(next.to)) continue;
      seen.add(next.to); queue.push(next.to);
      model.depth[next.to] = model.depth[node] + 1;
      model.treeEdges.add(next.edge);
      model.edgeFrom.set(next.edge, node);
    }
    model.frontier = queue.slice(head + 1);
    model.stats.a = model.visited.size; model.stats.b = model.frontier.length;
    yield signal(model, `Layer ${model.depth[node]} · visit node ${String(node + 1).padStart(2, '0')}`, node);
  }
}

function* depthFirst(model, node = model.origin, depth = 0) {
  model.visited.add(node); model.depth[node] = depth;
  model.frontier.push(node); model.activeNode = node;
  model.stats.a = model.visited.size; model.stats.b = model.frontier.length;
  yield signal(model, `Follow node ${String(node + 1).padStart(2, '0')} · depth ${depth}`, node);
  for (const next of model.adjacency[node]) {
    if (model.visited.has(next.to)) continue;
    model.treeEdges.add(next.edge);
    model.edgeFrom.set(next.edge, node);
    yield* depthFirst(model, next.to, depth + 1);
    model.activeNode = node;
    yield signal(model, `Backtrack to node ${String(node + 1).padStart(2, '0')}`, node, 'backtrack');
  }
  model.frontier.pop(); model.stats.b = model.frontier.length;
}

function* primGraph(model) {
  const heap = new MinHeap();
  const addNode = node => {
    model.visited.add(node);
    for (const edge of model.adjacency[node]) if (!model.visited.has(edge.to)) heap.push({ ...edge, score: edge.weight, from: node });
  };
  addNode(model.origin); model.activeNode = model.origin; model.stats.a = 1;
  yield signal(model, 'A tree begins with one node', model.origin);
  while (heap.size && model.visited.size < model.nodes.length) {
    const next = heap.pop();
    if (model.visited.has(next.to)) continue;
    model.activeEdge = next.edge; model.treeEdges.add(next.edge);
    model.edgeFrom.set(next.edge, next.from);
    model.depth[next.to] = model.depth[next.from] + 1;
    model.stats.b += next.weight;
    addNode(next.to); model.activeNode = next.to; model.stats.a = model.visited.size;
    yield signal(model, `Lightest crossing edge · weight ${next.weight}`, next.to, 'connect');
  }
}

function* kruskalGraph(model) {
  const components = new UnionFind(model.nodes.length);
  for (const edge of [...model.edges].sort((a, b) => a.weight - b.weight || a.id - b.id)) {
    model.activeEdge = edge.id;
    if (!components.join(edge.a, edge.b)) {
      model.rejectedEdge = edge.id;
      yield signal(model, `Skip weight ${edge.weight} · it would make a cycle`, edge.b, 'reject', 0.5);
      model.rejectedEdge = -1;
      continue;
    }
    model.treeEdges.add(edge.id); model.visited.add(edge.a); model.visited.add(edge.b);
    model.activeNode = edge.b; model.stats.a = model.visited.size; model.stats.b += edge.weight;
    yield signal(model, `Join two components · weight ${edge.weight}`, edge.b, 'connect');
    if (model.treeEdges.size === model.nodes.length - 1) break;
  }
}

function* graph(model, id) {
  yield* ({ bfs: breadthFirst, dfs: depthFirst, prim: primGraph, kruskal: kruskalGraph })[id](model);
  model.activeEdge = -1; model.activeNode = -1;
  model.caption = model.isMst ? `One connected tree · total weight ${model.stats.b}` : 'Every node visited. Every connection considered.';
}

export function gridNeighbors(index, cols, rows) {
  const x = index % cols, y = Math.floor(index / cols), result = [];
  if (y > 0) result.push({ to: index - cols, direction: 0 });
  if (x < cols - 1) result.push({ to: index + 1, direction: 1 });
  if (y < rows - 1) result.push({ to: index + cols, direction: 2 });
  if (x > 0) result.push({ to: index - 1, direction: 3 });
  return result;
}

function carve(model, from, next) {
  model.cells[from].walls[next.direction] = false;
  model.cells[next.to].walls[(next.direction + 2) % 4] = false;
  model.cells[from].carved = true; model.cells[next.to].carved = true;
  model.activeCell = next.to; model.stats.a++;
}

function* backtrackerMaze(model, random) {
  const stack = [0]; model.cells[0].carved = true;
  while (stack.length) {
    const current = stack[stack.length - 1];
    const next = gridNeighbors(current, model.cols, model.rows).filter(n => !model.cells[n.to].carved);
    if (next.length) {
      const picked = next[Math.floor(random() * next.length)];
      carve(model, current, picked); stack.push(picked.to); model.walk = [...stack];
      yield signal(model, 'Carve a passage into the unknown', picked.to, 'carve');
    } else {
      stack.pop(); model.activeCell = stack.at(-1) ?? current; model.walk = [...stack];
      yield signal(model, 'A dead end. Retrace the thread.', current, 'backtrack', 0.5);
    }
  }
}

function* primMaze(model, random) {
  const frontier = [];
  const add = current => {
    for (const next of gridNeighbors(current, model.cols, model.rows)) if (!model.cells[next.to].carved) frontier.push({ from: current, ...next });
  };
  model.cells[0].carved = true; add(0);
  while (frontier.length) {
    const index = Math.floor(random() * frontier.length), edge = frontier[index];
    frontier[index] = frontier[frontier.length - 1]; frontier.pop();
    if (model.cells[edge.to].carved) continue;
    carve(model, edge.from, edge); add(edge.to);
    yield signal(model, 'Choose a wall on the growing frontier', edge.to, 'carve');
  }
}

function* kruskalMaze(model, random) {
  const edges = [], components = new UnionFind(model.cells.length);
  for (let from = 0; from < model.cells.length; from++) {
    for (const next of gridNeighbors(from, model.cols, model.rows)) if (next.to > from) edges.push({ from, ...next });
  }
  for (const edge of shuffle(edges, random)) {
    if (!components.join(edge.from, edge.to)) continue;
    carve(model, edge.from, edge);
    yield signal(model, 'Two rooms become one connected region', edge.to, 'carve');
  }
}

function reconstruct(parent, target) {
  const path = [];
  for (let node = target; node !== -1; node = parent[node]) path.push(node);
  return path.reverse();
}

function* solveMaze(model) {
  model.phase = 'searching'; model.walk = [];
  yield signal(model, 'The maze is complete. Now, find the way.', 0, 'phase', 18);
  const queue = [0], seen = new Set([0]), parent = new Int32Array(model.cells.length).fill(-1);
  const goal = model.cells.length - 1;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]; model.activeCell = node; model.searchVisited.add(node);
    yield signal(model, 'Breadth-first search follows the corridors', node, 'search', 0.55);
    if (node === goal) break;
    for (const next of gridNeighbors(node, model.cols, model.rows)) {
      if (model.cells[node].walls[next.direction] || seen.has(next.to)) continue;
      seen.add(next.to); parent[next.to] = node; queue.push(next.to);
    }
  }
  model.phase = 'path';
  for (const node of reconstruct(parent, goal)) {
    model.path.push(node); model.stats.b = model.path.length - 1;
    yield signal(model, 'A golden thread, all the way through', node, 'path', 1.2);
  }
  model.caption = `One perfect maze. One solution. ${model.stats.b} steps.`;
}

function* maze(model, id, random) {
  yield* ({ backtracker: backtrackerMaze, prim: primMaze, kruskal: kruskalMaze })[id](model, random);
  yield* solveMaze(model);
}

function noiseField(random) {
  const size = 32, values = Array.from({ length: size * size }, random);
  const smooth = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(x - ix), ty = smooth(y - iy);
    const at = (a, b) => values[((b % size + size) % size) * size + (a % size + size) % size];
    const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
    const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

function terrainData(cols, rows, random) {
  const noise = noiseField(random), offset = random() * 20, phase = random() * 5;
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const x = i % cols, y = Math.floor(i / cols), u = x / (cols - 1), v = y / (rows - 1);
    const nx = (u - 0.5) * 2, ny = (v - 0.5) * 2;
    let height = 0.69 - 0.34 * (nx * nx + ny * ny) + 0.34 * (noise(u * 5 + offset, v * 5) - 0.5) + 0.12 * (noise(u * 12, v * 12 + offset) - 0.5);
    const river = Math.abs(ny - 0.3 * Math.sin(nx * 5 + phase));
    if (river < 0.085 && Math.abs(nx - 0.36) > 0.075 && Math.abs(nx + 0.4) > 0.075) height -= 0.35;
    if (!x || !y || x === cols - 1 || y === rows - 1) height = Math.min(height, 0.24);
    return { height, water: height < 0.32, cost: height > 0.61 ? 6 : height > 0.46 ? 3 : 1 };
  });
  const seen = new Set();
  let largest = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].water || seen.has(i)) continue;
    const component = [i]; seen.add(i);
    for (let head = 0; head < component.length; head++) {
      for (const next of gridNeighbors(component[head], cols, rows)) if (!cells[next.to].water && !seen.has(next.to)) { seen.add(next.to); component.push(next.to); }
    }
    if (component.length > largest.length) largest = component;
  }
  // The island normally guarantees land; this keeps even a degenerate field usable.
  if (!largest.length) {
    const center = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    cells[center] = { height: 0.4, water: false, cost: 1 }; largest = [center];
  }
  const origin = largest.reduce((a, b) => (a % cols) < (b % cols) ? a : b);
  const queue = [origin], reached = new Set([origin]);
  for (let head = 0; head < queue.length; head++) {
    for (const next of gridNeighbors(queue[head], cols, rows)) if (!cells[next.to].water && !reached.has(next.to)) { reached.add(next.to); queue.push(next.to); }
  }
  return { cells, origin, target: queue[queue.length - 1] };
}

function* route(model, id) {
  const n = model.cells.length, parent = new Int32Array(n).fill(-1), heap = new MinHeap();
  const heuristic = node => Math.abs(node % model.cols - model.target % model.cols) + Math.abs(Math.floor(node / model.cols) - Math.floor(model.target / model.cols));
  model.distance[model.origin] = 0;
  heap.push({ node: model.origin, score: id === 'dijkstra' ? 0 : heuristic(model.origin) });
  model.open.add(model.origin);
  let found = false;
  while (heap.size) {
    const { node } = heap.pop();
    if (model.closed.has(node)) continue;
    model.open.delete(node); model.closed.add(node); model.activeCell = node;
    model.stats.a = model.closed.size;
    if (node === model.target) { found = true; break; }
    for (const next of gridNeighbors(node, model.cols, model.rows)) {
      if (model.cells[next.to].water || model.closed.has(next.to)) continue;
      const candidate = model.distance[node] + model.cells[next.to].cost;
      if (candidate >= model.distance[next.to]) continue;
      model.distance[next.to] = candidate; parent[next.to] = node;
      const score = id === 'greedy' ? heuristic(next.to) : candidate + (id === 'astar' ? heuristic(next.to) : 0);
      heap.push({ node: next.to, score }); model.open.add(next.to);
    }
    yield signal(model, id === 'greedy' ? 'Follow the pull of the destination' : `Explore the frontier · cost so far ${model.distance[node]}`, node, 'search');
  }
  if (!found) {
    model.caption = 'No land route. Try a destination on this island.'; model.noPath = true;
    yield signal(model, model.caption, model.target, 'blocked', 8);
    return;
  }
  model.phase = 'path'; model.stats.b = model.distance[model.target];
  yield signal(model, 'Destination reached. Trace the journey.', model.target, 'phase', 8);
  for (const node of reconstruct(parent, model.target)) {
    model.path.push(node);
    yield signal(model, 'A path through the possibilities', node, 'path', 1.6);
  }
  model.caption = `${id === 'greedy' ? 'Route found' : 'Least-cost route'} · ${model.path.length - 1} steps · cost ${model.stats.b}`;
}

export function createExhibit({ scene, id, seed, aspect = 1.5, cols, rows, origin, target }) {
  const random = randomSource(seed);
  const model = { scene, id, seed, stats: { a: 0, b: 0 }, caption: 'A new idea is taking shape.', done: false, phase: 'running' };
  let iterator;
  if (scene === 'sorting') {
    Object.assign(model, { values: shuffle(Array.from({ length: 56 }, (_, i) => i + 1), random), hot: [], settled: new Set(), range: null, pivot: -1, buffer: [], labels: ['comparisons', 'writes'], dataNote: '56 values · one sorted spectrum' });
    iterator = sorting(model, id);
  } else if (scene === 'graphs') {
    Object.assign(model, graphData(random), { origin: origin ?? 14, visited: new Set(), treeEdges: new Set(), edgeFrom: new Map(), activeNode: -1, activeEdge: -1, rejectedEdge: -1, frontier: [], depth: new Int16Array(42), isMst: id === 'prim' || id === 'kruskal' });
    model.labels = ['visited', model.isMst ? 'tree weight' : id === 'dfs' ? 'stack' : 'queued'];
    model.dataNote = `${model.nodes.length} nodes · ${model.edges.length} connections`;
    iterator = graph(model, id);
  } else {
    model.rows = rows ?? (scene === 'routes' ? 25 : 17);
    model.cols = cols ?? Math.max(13, Math.min(scene === 'routes' ? 71 : 49, Math.round(model.rows * aspect)));
    const n = model.rows * model.cols;
    if (scene === 'mazes') {
      Object.assign(model, { cells: Array.from({ length: n }, () => ({ walls: [true, true, true, true], carved: false })), walk: [], searchVisited: new Set(), activeCell: 0, path: [], labels: ['passages', 'path steps'], phase: 'carving' });
      model.dataNote = `${model.cols} × ${model.rows} cells · carve, then solve`;
      iterator = maze(model, id, random);
    } else {
      Object.assign(model, terrainData(model.cols, model.rows, random));
      if (Number.isInteger(target) && target >= 0 && target < n && !model.cells[target].water) model.target = target;
      Object.assign(model, { closed: new Set(), open: new Set(), distance: new Float64Array(n).fill(Infinity), activeCell: -1, path: [], labels: ['explored', 'path cost'] });
      model.stats.b = '—'; model.dataNote = 'Sand 1 · forest 3 · high ground 6';
      iterator = route(model, id);
    }
  }
  return { model, iterator };
}
