import test from 'node:test';
import assert from 'node:assert/strict';
import {World, makeMap} from '../src/engine.mjs?v=harvest-18';
import {NODES, RULES} from '../src/content.mjs?v=harvest-18';
import {CACHE_LAYOUT, INNER_RING, OUTER_RING, NODE_POOLS, isCache, regionAt} from '../src/progression.mjs?v=harvest-18';
import {
  TERRAIN, CELL, EXTENT, GRID_SIZE, HEARTH_CLEAR, DETAIL, worldShape, terrainAt, walkableAt, densityAt, patchAt,
  clearanceAt, landNear, generateNodes, groundColors, groundHex,
  areaAt,
} from '../src/worldgen.mjs?v=harvest-18';

const SEEDS = [402, 7, 90210, 3141592];
const N = GRID_SIZE;
const cellOf = (x, z) => Math.floor((z+EXTENT)/CELL)*N+Math.floor((x+EXTENT)/CELL);
function gridHash(grid){let h = 2166136261; for(let k = 0; k < grid.length; k++){h ^= grid[k]; h = Math.imul(h, 16777619);} return h>>>0;}
/** Cells a walker reaches from beside the Heartfire over walkable ground (4-neighbour flood). */
function reach(shape){
  const seen = new Uint8Array(N*N), queue = new Int32Array(N*N); let head = 0, tail = 0;
  const start = cellOf(0, 2); seen[start] = 1; queue[tail++] = start;
  while(head < tail){const k = queue[head++]; for(const n of [k-1, k+1, k-N, k+N]) if(!seen[n] && shape.grid[n] === TERRAIN.ground){seen[n] = 1; queue[tail++] = n;}}
  return seen;
}
function reachedNear(seen, x, z, radius = 1.9){
  for(let dz = -radius; dz <= radius; dz += CELL) for(let dx = -radius; dx <= radius; dx += CELL){if(dx*dx+dz*dz > radius*radius) continue; const k = cellOf(x+dx, z+dz); if(seen[k]) return true;}
  return false;
}

test('the hollow is bigger: radius 144-150, rings keep their proportions, the outer ring is a real walk', () => {
  assert.ok(RULES.radius >= 144 && RULES.radius <= 150, `radius ${RULES.radius}`);
  assert.ok(INNER_RING/RULES.radius > .2 && INNER_RING/RULES.radius < .3);
  assert.ok(OUTER_RING/RULES.radius > .55 && OUTER_RING/RULES.radius < .65);
  // The combat update makes walking 15% faster while keeping the Frontier map size.
  assert.ok(OUTER_RING/RULES.speed >= 18, 'the outer ring still takes at least 18 s of straight walking out');
  assert.ok(EXTENT >= RULES.radius && GRID_SIZE === Math.round(EXTENT*2/CELL));
  for(const seed of SEEDS){
    const shape = worldShape(seed);
    assert.equal(shape.radius, RULES.radius);
    let far = 0; for(let a = 0; a < 64; a++){const c = Math.cos(a/64*Math.PI*2), s = Math.sin(a/64*Math.PI*2); for(let r = 150; r > 0; r -= .5) if(walkableAt(seed, c*r, s*r)){far = Math.max(far, r); break;}}
    assert.ok(far > 118 && far < RULES.radius-4, `land reaches ${far}`);
  }
});

test('a seed always builds the same hollow; different seeds build different ones', () => {
  const first = gridHash(worldShape(402).grid), nodes = JSON.stringify(generateNodes(402));
  const features = JSON.stringify(worldShape(402).features);
  // Push the seed out of the shape cache and build it again from scratch.
  for(const seed of [11, 12, 13, 14, 15]) worldShape(seed);
  assert.equal(gridHash(worldShape(402).grid), first);
  assert.equal(JSON.stringify(worldShape(402).features), features);
  assert.equal(JSON.stringify(generateNodes(402)), nodes);
  assert.deepEqual(makeMap(402), makeMap(402));
  const hashes = new Set(SEEDS.map(seed => gridHash(worldShape(seed).grid)));
  assert.equal(hashes.size, SEEDS.length);
  // Not just noise: the outline itself moves (land at a fixed bearing ends somewhere else).
  const edges = SEEDS.map(seed => {let r = 0; while(r < 150 && walkableAt(seed, r, 0)) r += .5; return r;});
  assert.ok(new Set(edges).size >= 3, `edges ${edges}`);
});

test('borders mix water, thicket and old fences; lakes lie inland; the Heartfire meadow is open', () => {
  for(const seed of SEEDS){
    const shape = worldShape(seed), counts = [0, 0, 0, 0, 0];
    for(let k = 0; k < shape.grid.length; k++) counts[shape.grid[k]]++;
    assert.ok(counts[TERRAIN.water] > 2000 && counts[TERRAIN.thicket] > 2000 && counts[TERRAIN.fence] > 100 && counts[TERRAIN.void] > 10000, `${seed} ${counts}`);
    assert.deepEqual([...new Set(shape.arcs.map(a => a.kind))].sort(), ['fence', 'thicket', 'water']);
    assert.ok(shape.lakes.length >= 8, 'lakes and ponds');
    for(let r = 0; r < HEARTH_CLEAR-1; r += 1.5) for(let a = 0; a < 24; a++){
      const x = Math.cos(a/24*Math.PI*2)*r, z = Math.sin(a/24*Math.PI*2)*r;
      assert.ok(walkableAt(seed, x, z), `hearth meadow ${seed} ${x},${z}`);
    }
    assert.equal(terrainAt(seed, 0, 0), TERRAIN.ground);
    assert.equal(terrainAt(seed, 500, 0), TERRAIN.void);
    assert.equal(walkableAt(seed, NaN, 0), false);
    assert.equal(walkableAt(seed, 0, -1e9), false);
  }
});

test('all walkable land, every node and every cache is reachable from the Heartfire; nothing grows in water', () => {
  for(const seed of SEEDS){
    const shape = worldShape(seed), seen = reach(shape);
    let land = 0, lost = 0;
    for(let k = 0; k < shape.grid.length; k++) if(shape.grid[k] === TERRAIN.ground){land++; if(!seen[k]) lost++;}
    assert.equal(lost, 0, `${seed}: ${lost} of ${land} walkable cells cut off`);
    const nodes = generateNodes(seed);
    nodes.forEach((n, i) => assert.equal(n.id, `n${i}`));
    for(const n of nodes){
      assert.equal(terrainAt(seed, n.x, n.z), TERRAIN.ground, `${n.type} at ${n.x},${n.z} is on ${terrainAt(seed, n.x, n.z)}`);
      assert.ok(reachedNear(seen, n.x, n.z), `${seed} ${n.type} ${n.id} unreachable`);
    }
  }
});

test('caches sit in their tier rings, in interesting places, spaced apart; better tiers farther out', () => {
  for(const seed of SEEDS){
    const nodes = generateNodes(seed), shape = worldShape(seed), mean = {};
    for(const {type, count, min, max} of CACHE_LAYOUT){
      const found = nodes.filter(n => n.type === type && !(n.x === 9 && n.z === 6));
      assert.equal(found.length, count, `${seed} ${type}`);
      for(const n of found){const r = Math.hypot(n.x, n.z); assert.ok(r >= min-.01 && r <= max+.01, `${type} at ${r}`); assert.ok(clearanceAt(seed, n.x, n.z) >= 1, `${type} hugs a wall`);}
      mean[type] = found.reduce((s, n) => s+Math.hypot(n.x, n.z), 0)/count;
      const gap = type === 'crate' ? 9 : 16;
      for(let i = 0; i < found.length; i++) for(let j = i+1; j < found.length; j++) assert.ok(Math.hypot(found[i].x-found[j].x, found[i].z-found[j].z) >= gap-.01);
    }
    assert.ok(mean.crate < mean.ironchest && mean.ironchest < mean.moonchest && mean.moonchest < mean.reliquary);
    // Most guarded caches were set on a chosen spot: a forest clearing, a lake shore, a fence end or a ring of stones.
    const guarded = nodes.filter(n => isCache(n.type) && n.type !== 'crate'), spotted = guarded.filter(n => shape.spots.some(s => s.x === n.x && s.z === n.z));
    assert.ok(spotted.length >= guarded.length*.6, `${spotted.length}/${guarded.length} on spots`);
    assert.ok(new Set(shape.spots.filter(s => spotted.some(n => n.x === s.x && n.z === s.z)).map(s => s.kind)).size >= 3);
  }
});

test('density breathes: thick forest, open meadow, rocky fields and empty heath, with clustered nodes and negative space', () => {
  for(const seed of SEEDS){
    const nodes = generateNodes(seed), patches = [0, 0, 0, 0], cells = new Map();
    let sum = 0, sq = 0, count = 0;
    for(let z = -130; z <= 130; z += 4) for(let x = -130; x <= 130; x += 4){
      if(!walkableAt(seed, x, z) || Math.hypot(x, z) < 34) continue;
      const d = densityAt(seed, x, z); assert.ok(d >= 0 && d <= 1); sum += d; sq += d*d; count++; patches[patchAt(seed, x, z)]++;
      cells.set(`${Math.floor(x/8)},${Math.floor(z/8)}`, 0);
    }
    const variance = sq/count-(sum/count)**2;
    assert.ok(variance > .04, `density variance ${variance.toFixed(3)}`);
    for(const share of patches) assert.ok(share/count > .05, `patch shares ${patches}`);
    for(const n of nodes){const key = `${Math.floor(n.x/8)},${Math.floor(n.z/8)}`; if(cells.has(key)) cells.set(key, cells.get(key)+1);}
    const per = [...cells.values()], avg = per.reduce((a, b) => a+b, 0)/per.length, sd = Math.sqrt(per.reduce((a, b) => a+(b-avg)**2, 0)/per.length);
    assert.ok(sd/avg > .7, `clustered: cv ${(sd/avg).toFixed(2)}`);
    assert.ok(per.filter(v => v === 0).length/per.length > .14, 'open ground with nothing on it');
    // Trees crowd the forest; where trees grow, rocks and ore gather on stony fields instead (the crags and
    // barrows have few trees, so their thickest patches are stone).
    const trees = nodes.filter(n => n.type === 'tree' && Math.hypot(n.x, n.z) > 20);
    assert.ok(trees.filter(n => densityAt(seed, n.x, n.z) >= .62).length > trees.length*.6);
    const stones = nodes.filter(n => ['rock', 'ore', 'shardrock'].includes(n.type) && Math.hypot(n.x, n.z) > 20 && ['meadow', 'woods', 'graveyard', 'mire'].includes(regionAt(n.x, n.z)));
    assert.ok(stones.filter(n => densityAt(seed, n.x, n.z) < .62).length > stones.length*.8);
    assert.ok(nodes.length > 1400 && nodes.length < 2600, `${nodes.length} nodes`);
  }
});

test('night-only finds cluster under trees in the woods and among graves in the graveyard', () => {
  for(const seed of SEEDS){
    const nodes = generateNodes(seed);
    for(const [night, host, least] of [['glowsprout', 'tree', 50], ['gravewisp', 'grave', 26]]){
      const found = nodes.filter(n => n.type === night);
      assert.ok(found.length >= least, `${seed} ${night} ${found.length}`);
      assert.ok(NODES[night].night);
      for(const n of found){
        // In (or at the ragged edge of) a region whose pool grows it.
        assert.ok([...Array(9).keys()].some(a => NODE_POOLS[regionAt(n.x+(a ? Math.cos(a*.785)*5 : 0), n.z+(a ? Math.sin(a*.785)*5 : 0))].includes(night)), `${night} strayed`);
        assert.ok(nodes.some(h => h.type === host && Math.hypot(h.x-n.x, h.z-n.z) < 4.2), `${night} far from any ${host}`);
      }
    }
  }
});

test('the starter clearing still has every basic material a short walk from the Heartfire', () => {
  for(const seed of SEEDS){
    const nodes = generateNodes(seed);
    for(const type of ['tree', 'rock', 'grass', 'bush', 'pumpkin', 'mushroom', 'crate']) assert.ok(nodes.some(n => n.type === type && Math.hypot(n.x, n.z) < 16), `${seed} ${type}`);
  }
});

test('border props line the edge for the scenery layer without piling up', () => {
  for(const seed of SEEDS){
    const {features} = worldShape(seed), kinds = {};
    for(const f of features){
      kinds[f.kind] = (kinds[f.kind] || 0)+1;
      assert.ok(['fence', 'thicket', 'reeds'].includes(f.kind));
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.z) && Number.isFinite(f.angle) && f.scale > 0);
      assert.ok(Math.hypot(f.x, f.z) < RULES.radius);
      const t = terrainAt(seed, f.x, f.z);
      assert.equal(t, f.kind === 'fence' ? TERRAIN.fence : f.kind === 'reeds' ? TERRAIN.water : TERRAIN.thicket);
    }
    assert.ok(kinds.fence > 20 && kinds.thicket > 100 && kinds.reeds > 40, JSON.stringify(kinds));
    assert.ok(features.length < 1600, `${features.length} props`);
    const reeds = features.filter(f => f.kind === 'reeds');
    for(let i = 0; i < reeds.length; i++) for(let j = i+1; j < reeds.length; j++) assert.ok(Math.hypot(reeds[i].x-reeds[j].x, reeds[i].z-reeds[j].z) >= 2);
    // Posts along a fence run share its heading, so they line up.
    const posts = features.filter(f => f.kind === 'fence');
    const aligned = posts.filter(p => posts.some(q => q !== p && Math.hypot(q.x-p.x, q.z-p.z) < 2.6 && Math.abs(q.angle-p.angle) < 1e-9));
    assert.ok(aligned.length > posts.length*.8);
  }
});

test('walkableAt is an O(1) lookup: a million calls stay fast', () => {
  worldShape(402);
  let hits = 0; const t0 = performance.now();
  for(let i = 0; i < 1e6; i++){const x = ((i*7919)%2960)/10-148, z = ((i*104729)%2960)/10-148; if(walkableAt(402, x, z)) hits++;}
  const ms = performance.now()-t0;
  assert.ok(hits > 2e5 && hits < 8e5);
  assert.ok(ms < 400, `${ms.toFixed(0)} ms for 1e6 lookups`);
});

test('the world keeps walkers on land: moves, shoves, dashes, spawns and builds', () => {
  const w = new World(402); const p = w.addPlayer('host', 'Jun'); w.start(); w.ambient = false; w.enemies = [];
  const shape = worldShape(402), lake = shape.lakes.slice().sort((a, b) => b.r-a.r)[0];
  assert.equal(w.walkable(lake.x, lake.z), false);
  assert.equal(w.walkable(0, 3), true);
  // Walk straight at the lake: the shore stops you.
  let x = lake.x, z = lake.z; for(let t = 0; t < 40 && !w.walkable(x, z); t += .25){x = lake.x+t; z = lake.z;}
  p.x = x+3; p.z = z;
  for(let i = 0; i < 80; i++){w.input(p.id, {x: -1, z: 0}); w.tick(RULES.tick);}
  assert.ok(w.walkable(p.x, p.z), 'still on land');
  // Shoved and dashing into the water: still on land.
  w.shove(p, -1, 0, 3); assert.ok(w.walkable(p.x, p.z));
  p.dashCooldown = 0; p.stamina = 100; w.input(p.id, {x: -1, z: 0}); w.dodge(p); for(let i = 0; i < 10; i++){w.input(p.id, {x: -1, z: 0}); w.tick(RULES.tick);}
  assert.ok(w.walkable(p.x, p.z), 'a dodge cannot carry you into the lake');
  // Something set down in the water (an old save, a magic pull) steps back out on its next move.
  p.x = lake.x; p.z = lake.z; w.move(p, 0, 0, RULES.tick, w.obstacles());
  assert.ok(w.walkable(p.x, p.z) || Math.hypot(p.x-lake.x, p.z-lake.z) < 1e-9 && lake.r > 7, 'rescued when land is near');
  // A creature asked to appear in the water appears on the bank instead.
  const bank = {x: x-1.5, z};
  const e = w.spawnEnemy('crawler', bank.x, bank.z); assert.ok(w.walkable(e.x, e.z));
  // Nothing is built on water, and a tap in the shallows walks you to the bank.
  p.x = x+2; p.z = z;
  assert.equal(w.canBuild(p, 'fire', x-.6, z), 'Outside the clearing');
  w.action(p.id, {type: 'move', x: x-.4, z});
  assert.ok(w.walkable(p.goal.x, p.goal.z));
  // Guards and roamers only ever stand on land.
  w.enemies = []; w.ambient = true; w.guardsDay = -1; w.maintainGuards();
  assert.ok(w.enemies.length > 40);
  for(const g of w.enemies) assert.ok(w.walkable(g.x, g.z), `${g.type} guard in ${terrainAt(402, g.x, g.z)}`);
});

test('landNear finds the bank; clearance measures open ground', () => {
  // A lake no area has frozen or burnt away (worldgen.mjs areas).
  const shape = worldShape(402), lake = shape.lakes.find(l => !areaAt(402, l.x, l.z)) || shape.lakes[0];
  const near = landNear(402, lake.x, lake.z, 40);
  assert.ok(near && walkableAt(402, near.x, near.z));
  assert.equal(landNear(402, 1000, 1000, 5), null);
  const here = landNear(402, 3, 3); assert.deepEqual(here, {x: 3, z: 3});
  assert.equal(clearanceAt(402, lake.x, lake.z), 0);
  assert.ok(clearanceAt(402, 0, 0) > 20);
});

test('ground colours follow the walkable grid for both renderers and the map', () => {
  const palette = {meadow: '#7d735d', woods: '#565e55', graveyard: '#746977', mire: '#5c6a4e', crags: '#6c6679', barrow: '#655862', path: '#9c8968', water: '#3f5566', shore: '#6f7a6a', thicket: '#3c4a40', void: '#1f1d27'};
  const g = groundColors(402, palette), shape = worldShape(402);
  assert.equal(g, groundColors(402, palette), 'cached');
  assert.equal(g.size, GRID_SIZE); assert.equal(g.rgb.length, g.size*g.size*3);
  const code = {[TERRAIN.ground]: 1, [TERRAIN.fence]: 1, [TERRAIN.water]: 2, [TERRAIN.thicket]: 3, [TERRAIN.void]: 4};
  for(let k = 0; k < shape.grid.length; k += 97) assert.equal(g.land[k], code[shape.grid[k]]);
  const lake = shape.lakes.find(l => !areaAt(402, l.x, l.z)) || shape.lakes[0], water = groundHex(g, lake.x, lake.z), land = groundHex(g, 0, 20);
  assert.match(water, /^#[0-9a-f]{6}$/); assert.notEqual(water, land);
  const blue = h => parseInt(h.slice(5, 7), 16)-parseInt(h.slice(1, 3), 16);
  assert.ok(blue(water) > blue(land), 'water reads bluer than the meadow');
  assert.equal(groundHex(g, 900, 0), null);
  // Trails from the Heartfire towards the regions are worn into the ground.
  let worn = 0; for(let k = 0; k < shape.detail.length; k++) if(shape.detail[k] & DETAIL.trail) worn++;
  assert.ok(shape.trails.length >= 3 && worn > 1500);
});

test('generation is quick and cached', () => {
  const seed = 5150, t0 = performance.now();
  worldShape(seed); generateNodes(seed);
  const cold = performance.now()-t0, t1 = performance.now();
  for(let i = 0; i < 200; i++){worldShape(seed); walkableAt(seed, i, 0);}
  assert.ok(performance.now()-t1 < 20, 'cached lookups');
  // Generous: CI machines are slow and shared. Report the real figure in the log.
  console.log(`# worldgen seed ${seed}: shape+nodes ${cold.toFixed(0)} ms (shape ${worldShape(seed).stats.ms} ms)`);
  assert.ok(cold < 3000);
});
