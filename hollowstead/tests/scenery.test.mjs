import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RULES} from '../src/content.mjs?v=harvest-18';
import {regionAt} from '../src/progression.mjs?v=harvest-18';
import {TERRAIN, generateNodes} from '../src/worldgen.mjs?v=harvest-18';
import {SCENERY_ATLAS} from '../src/scenery-atlas.mjs?v=harvest-18';
import {CHUNK, FLOWERS, PLAZA_CLEAR, PROPS, REGION_MIX, SceneryModel, chunkKey, expandFeatures, layoutChunk, propCovered, sceneryEnv, syntheticShape} from '../src/scenery-layout.mjs?v=harvest-18';
import {AmbientLife, LIFE, fireflyStrength} from '../src/scenery-life.mjs?v=harvest-18';

// Scenery is presentation only, so these tests pin the layout contract: same seed -> same props,
// region-appropriate kinds, a clear plaza, patches with open ground between them, and border pieces
// that line up with worldShape features. Node never imports src/scenery.mjs (it pulls in THREE).

const SEEDS = [402, 7, 123456];
/** Every chunk of a model that overlaps the hollow. */
function allChunks(model, radius = RULES.radius){
  const n = Math.ceil(radius / CHUNK) + 1, out = [];
  for(let cz = -n; cz < n; cz++)for(let cx = -n; cx < n; cx++)out.push(model.chunk(cx, cz));
  return out;
}
function modelFor(seed, shape = null){const m = new SceneryModel();m.reset(seed, null, shape);return m;}
const propsOf = chunks => chunks.flatMap(c => c.props);

// What may grow where: the region's common kinds (flowers resolve to one colour), plus its set pieces.
const SET_PIECES = {meadow:['scarecrow', 'fence-bit'], woods:['stump'], graveyard:['old-lantern', 'stump'], mire:[], crags:['standing-stone'], barrow:['standing-stone', 'stump']};
const ALLOWED = Object.fromEntries(Object.entries(REGION_MIX).map(([region, mix]) => [region, new Set([...mix.kinds.flatMap(([k]) => k === 'flower' ? FLOWERS : [k]), ...SET_PIECES[region]])]));
// Small companions placed next to a set piece (a cobweb on a stump, candles by a lantern) go wherever that piece stands.
const COMPANIONS = {cobweb:'stump', candles:'old-lantern'};
// Worldgen puts lakes in every region: shore kinds (lily pads off the bank, reeds and sedge on it) grow at any lake.
const SHORE = new Set(['lilypads', 'reeds-small', 'sedge']);
const companionOk = (p, props) => SHORE.has(p.kind) || COMPANIONS[p.kind] && props.some(q => q.kind === COMPANIONS[p.kind] && Math.abs(q.x - p.x) < .6 && Math.abs(q.z - p.z) < .3);

test('scenery placement is deterministic per seed and differs between seeds', () => {
  for(const seed of SEEDS){
    const a = modelFor(seed), b = modelFor(seed);
    for(const [cx, cz] of [[0, 0], [-1, 0], [1, -2], [2, 1], [-3, -3], [0, 3]])assert.deepEqual(a.chunk(cx, cz), b.chunk(cx, cz), `seed ${seed} chunk ${cx},${cz}`);
  }
  const a = propsOf(allChunks(modelFor(402))), b = propsOf(allChunks(modelFor(403)));
  assert.notDeepEqual(a.slice(0, 40).map(p => [p.kind, p.x]), b.slice(0, 40).map(p => [p.kind, p.x]));
  // A chunk laid out on its own equals the same chunk from a warm cache (seams never depend on build order).
  const env = sceneryEnv(402), warm = modelFor(402);allChunks(warm);
  assert.deepEqual(layoutChunk(env, 1, -1), warm.chunk(1, -1));
});

test('props grow the kinds of their region and keep the plaza clear', () => {
  for(const seed of SEEDS){
    const props = propsOf(allChunks(modelFor(seed)));
    assert.ok(props.length > 600, `seed ${seed}: a hollow gets decorated (${props.length})`);
    for(const p of props){
      assert.ok(PROPS[p.kind], `known kind ${p.kind}`);
      assert.ok(SCENERY_ATLAS.cells[p.kind], `atlas cell for ${p.kind}`);
      assert.ok(Math.hypot(p.x, p.z) >= PLAZA_CLEAR, `plaza clear: ${p.kind} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      assert.ok(Math.hypot(p.x, p.z) < RULES.radius, `inside the hollow: ${p.kind}`);
      const region = regionAt(p.x, p.z);
      assert.ok(ALLOWED[region].has(p.kind) || companionOk(p, props), `seed ${seed}: ${p.kind} does not grow in the ${region}`);
    }
    // Each region shows its signature props.
    const seen = {};for(const p of props)(seen[regionAt(p.x, p.z)] ??= new Set()).add(p.kind);
    for(const [region, kinds] of Object.entries({meadow:['tuft', 'clover'], woods:['fern', 'toadstool'], graveyard:['cross-wood', 'cross-stone'], mire:['puddle', 'reeds-small'], crags:['pebbles', 'crystals'], barrow:['bone-bits', 'tuft-dead']}))
      for(const k of kinds)assert.ok(seen[region]?.has(k), `seed ${seed}: ${region} has ${k}`);
    assert.ok(FLOWERS.filter(f => seen.meadow.has(f)).length >= 3, 'the meadow blooms in several colours');
  }
});

test('props gather in patches with open ground between them, never a uniform sprinkle', () => {
  for(const seed of SEEDS){
    const R = RULES.radius, props = propsOf(allChunks(modelFor(seed))).filter(p => {const r = Math.hypot(p.x, p.z);return r > 10 && r < R - 4;});
    const area = Math.PI * ((R - 4) ** 2 - 100), grid = new Map(), key = (x, z) => (Math.floor(x / 2) + 200) * 1000 + Math.floor(z / 2) + 200;
    for(const p of props){const k = key(p.x, p.z);let l = grid.get(k);if(!l)grid.set(k, l = []);l.push(p);}
    // Clark-Evans ratio: mean nearest-neighbour distance over what a random sprinkle of the same density gives.
    let sum = 0;
    for(const p of props){
      let best = Infinity;
      for(let r = 1; r < 8 && best > r * 2 - 2; r++)for(let i = -r; i <= r; i++)for(let j = -r; j <= r; j++){
        for(const q of grid.get(key(p.x + i * 2, p.z + j * 2)) || []){if(q === p)continue;const d = Math.hypot(q.x - p.x, q.z - p.z);if(d < best)best = d;}
      }
      sum += best;
    }
    const ratio = (sum / props.length) / (.5 / Math.sqrt(props.length / area));
    assert.ok(ratio < .85, `seed ${seed}: clustered (Clark-Evans ${ratio.toFixed(2)})`);
    // Negative space: plenty of 4x4 cells stay bare, and the whole map is not overwhelming.
    const occupied = new Set(props.map(p => `${Math.floor(p.x / 4)},${Math.floor(p.z / 4)}`));let cells = 0, empty = 0;
    for(let x = -R; x < R; x += 4)for(let z = -R; z < R; z += 4){const r = Math.hypot(x + 2, z + 2);if(r < 12 || r > R - 6)continue;cells++;if(!occupied.has(`${Math.floor(x / 4)},${Math.floor(z / 4)}`))empty++;}
    assert.ok(empty / cells > .35, `seed ${seed}: open ground between patches (${(empty / cells).toFixed(2)} bare)`);
    assert.ok(props.length / area < .14, `seed ${seed}: not overwhelming (${(props.length / area * 100).toFixed(1)} per 100 square units)`);
  }
});

test('props stay off nodes and caches and hide under structures', () => {
  const seed = 402, nodes = generateNodes(seed), props = propsOf(allChunks(modelFor(seed)));
  for(const p of props){
    if(PROPS[p.kind].flat)continue;
    for(const n of nodes)assert.ok(Math.hypot(n.x - p.x, n.z - p.z) > .75, `${p.kind} at ${p.x.toFixed(2)},${p.z.toFixed(2)} sits on node ${n.type}`);
  }
  const p = props[0];
  assert.equal(propCovered(p, [{type:'wall', x:p.x + .3, z:p.z}]), true);
  assert.equal(propCovered(p, [{type:'cart', x:p.x, z:p.z}]), false, 'carts roll over props');
  assert.equal(propCovered(p, [{type:'wall', x:p.x + 5, z:p.z}]), false);
});

test('border features expand into fences that line up, thickets and reeds', () => {
  const pieces = expandFeatures([{kind:'fence', x:10, z:-4, angle:.6, scale:1.5}, {kind:'thicket', x:3, z:3, angle:0, scale:1.2}, {kind:'reeds', x:-2, z:5, angle:1, scale:1}, {kind:'mystery', x:0, z:0}], [], 402);
  const posts = pieces.filter(p => p.kind === 'post-a' || p.kind === 'post-b'), stakes = pieces.filter(p => p.kind === 'stake'), rails = pieces.filter(p => p.kind === 'rail');
  assert.ok(posts.length >= 3, 'a 3-unit fence has several posts');
  assert.equal(stakes.length, posts.length - 1);
  assert.equal(rails.length, 2);
  const dx = Math.cos(.6), dz = Math.sin(.6);
  for(const p of [...posts, ...stakes]){
    assert.ok(Math.abs((p.x - 10) * dz - (p.z + 4) * dx) < 1e-6, 'posts and stakes stand on the fence line');
    assert.ok(Math.abs((p.x - 10) * dx + (p.z + 4) * dz) <= 1.5 + 1e-6, 'within the segment');
  }
  for(const r of rails){assert.ok(Math.abs(Math.hypot(r.x1 - r.x0, r.z1 - r.z0) - 3) < 1e-6, 'rails join the end posts');assert.ok(r.hi > r.lo);}
  assert.equal(pieces.filter(p => p.kind.startsWith('thicket-')).length, 1);
  assert.equal(pieces.filter(p => p.kind.startsWith('reeds-')).length, 1);
  assert.equal(pieces.find(p => p.kind.startsWith('thicket-')).s, 1.2);
  for(const p of pieces)assert.ok(SCENERY_ATLAS.cells[p.kind], `atlas cell for ${p.kind}`);
});

test('a synthetic border ring with a lake: reeds on the shore, lily pads on the water, nothing in the void', () => {
  const R = 146, shape = syntheticShape(402, R), model = modelFor(402, shape), chunks = allChunks(model, R);
  const pieces = chunks.flatMap(c => c.pieces), props = propsOf(chunks);
  assert.ok(shape.features.some(f => f.kind === 'fence') && shape.features.some(f => f.kind === 'thicket') && shape.features.some(f => f.kind === 'reeds'));
  // Every feature lands in exactly one chunk.
  const expanded = expandFeatures(shape.features, [], 402);
  assert.equal(pieces.length, expanded.length);
  for(const p of props){
    const t = shape.terrain(p.x, p.z);
    if(p.kind === 'lilypads')assert.equal(t, TERRAIN.water, 'lily pads float');
    else assert.equal(t, TERRAIN.ground, `${p.kind} grows on the ground`);
  }
  const lake = shape.lake, shore = props.filter(p => Math.abs(Math.hypot(p.x - lake.x, p.z - lake.z) - lake.r) < 1.5);
  assert.ok(shore.some(p => p.kind === 'lilypads'), 'lily pads by the shore');
  assert.ok(shore.some(p => p.kind === 'reeds-small' || p.kind === 'sedge'), 'reeds along the shore');
});

test('a dense border of thousands of features lays out quickly', () => {
  const R = 150, shape = syntheticShape(77, R, {dense:true});
  assert.ok(shape.features.length > 2500, `${shape.features.length} features`);
  const t0 = performance.now(), model = modelFor(77, shape), chunks = allChunks(model, R), ms = performance.now() - t0;
  const pieces = chunks.reduce((n, c) => n + c.pieces.length, 0);
  assert.ok(pieces > shape.features.length);
  assert.ok(ms < 2500, `whole-map layout took ${ms.toFixed(0)} ms`);
  assert.ok(model.chunks.has(chunkKey(0, 0)));
});

test('the atlas has every critter frame the ambient life draws, and the theme points at it', () => {
  for(const k of ['crow-sit-0', 'crow-sit-1', 'crow-fly-0', 'crow-fly-1', 'crow-fly-2', 'crow-fly-3', 'bat-0', 'bat-1', 'bat-2', 'bat-3', 'frog-0', 'frog-1', 'frog-2', 'frog-3', 'moth-0', 'moth-1', 'moth-2', 'ripple-0', 'ripple-1', 'ripple-2'])assert.ok(SCENERY_ATLAS.cells[k], k);
  for(const [k, [x, y, w, h]] of Object.entries(SCENERY_ATLAS.cells))assert.ok(x >= 0 && y >= 0 && x + w <= SCENERY_ATLAS.width && y + h <= SCENERY_ATLAS.height, `${k} inside the atlas`);
  const theme = JSON.parse(readFileSync(new URL('../themes/harvest/theme.json', import.meta.url), 'utf8'));
  const src = theme.sprites.scenery.src.split('?')[0];
  const svg = readFileSync(new URL('../themes/harvest/' + src, import.meta.url), 'utf8').slice(0, 300);
  assert.match(svg, new RegExp(`width="${SCENERY_ATLAS.width}" height="${SCENERY_ATLAS.height}"`));
});

// ---- ambient life (pure: the renderers only read its pooled records)
const VIEW = (x, z, w = 14) => ({x0:x - w, x1:x + w, z0:z - w * .6, z1:z + w * .6});
const FRAME = (darkness = 0, sources = []) => ({darkness, sources, lighting:{}});
function findSpot(model, list){for(const c of allChunks(model))for(const s of c[list])if(Math.hypot(s.x, s.z) > 14)return s;return null;}
const kinds = (records, n) => records.slice(0, n).map(r => r.cell);

test('fireflies come out at dusk and early night, never at noon', () => {
  assert.equal(fireflyStrength(60), 0);
  assert.equal(fireflyStrength(RULES.cycle * 3 + 100), 0);
  assert.ok(fireflyStrength(205) > .9);
  assert.ok(fireflyStrength(RULES.cycle + 205) > .9, 'every evening');
  assert.equal(fireflyStrength(300), 0, 'gone before dawn');
  const model = modelFor(402), life = new AmbientLife();let swarm = null;
  for(const c of allChunks(model))if(c.swarms.length){swarm = c.swarms[0];break;}
  assert.ok(swarm, 'the meadow and woods have firefly swarms');
  life.update(model, {players:[], time:205, seed:402, buildings:[]}, FRAME(.4), 10, .05, VIEW(swarm.x, swarm.z));
  assert.ok(life.nGlow > 0, 'glowing at dusk');
  life.update(model, {players:[], time:90, seed:402, buildings:[]}, FRAME(0), 10, .05, VIEW(swarm.x, swarm.z));
  assert.equal(life.nGlow, 0, 'none at noon');
});

test('crows scatter when a wanderer comes close and come back once the coast is clear', () => {
  const model = modelFor(402), life = new AmbientLife(), spot = findSpot(model, 'crows');
  assert.ok(spot, 'crows perch somewhere');
  const view = VIEW(spot.x, spot.z), me = {id:'p1', x:spot.x + 20, z:spot.z};
  const world = {players:[me], time:60, seed:402, buildings:[]};
  let clock = 0;const step = (n = 1, dt = .1) => {for(let i = 0; i < n; i++){clock += dt;life.update(model, world, FRAME(0), clock, dt, view);}};
  step();
  assert.ok(kinds(life.ground, life.nGround).some(c => c.startsWith('crow-sit')), 'perched');
  me.x = spot.x + LIFE.scare - 1;step();
  const crow = life.crows.get(spot.id);
  assert.equal(crow.state, 'fly');
  assert.ok(kinds(life.air, life.nAir).some(c => c.startsWith('crow-fly')), 'flapping away');
  assert.ok(crow.dx < 0, 'away from the wanderer (who stands to the east)');
  step(Math.ceil(LIFE.crowFlight / .1) + 2);
  assert.equal(crow.state, 'away');
  me.x = spot.x + 40;step(Math.ceil(LIFE.crowAway[1] / .5) + 2, .5);
  step(Math.ceil(LIFE.crowReturn / .1) + 3);
  assert.equal(crow.state, 'perch', 'back on its perch');
  // They stay away while someone lingers.
  life.reset();me.x = spot.x + 1;step();
  assert.notEqual(life.crows.get(spot.id).state, 'perch');
});

test('frogs hop into their puddle with a ripple when approached', () => {
  const model = modelFor(402), life = new AmbientLife(), spot = findSpot(model, 'frogs');
  assert.ok(spot, 'the mire has frogs');
  const view = VIEW(spot.x, spot.z), me = {id:'p1', x:spot.x + 20, z:spot.z}, world = {players:[me], time:60, seed:402, buildings:[]};
  let clock = 0;const step = (n = 1) => {for(let i = 0; i < n; i++){clock += .1;life.update(model, world, FRAME(0), clock, .1, view);}};
  step();
  assert.ok(kinds(life.ground, life.nGround).some(c => c.startsWith('frog-')));
  me.x = spot.x + 1;step();step(6);
  const frog = life.frogs.get(spot.id);
  assert.equal(frog.state, 'under');
  assert.ok(life.ripples.length > 0 || kinds(life.ground, life.nGround).some(c => c.startsWith('ripple')), 'a plop ripple');
  assert.ok(!life.ground.slice(0, life.nGround).some(r => r.cell.startsWith('frog-') && Math.hypot(r.x - spot.x, r.z - spot.z) < 1.5), 'hidden underwater');
});

test('bats fly only after dark and moths circle lit sources', () => {
  const model = modelFor(402), life = new AmbientLife();let roost = null;
  for(const c of allChunks(model))if(c.roosts.length){roost = c.roosts[0];break;}
  assert.ok(roost, 'bats roost somewhere');
  const world = {players:[], time:260, seed:402, buildings:[]}, view = VIEW(roost.x, roost.z, 16);
  life.update(model, world, FRAME(.9), 5, .05, view);
  assert.ok(kinds(life.air, life.nAir).some(c => c.startsWith('bat-')), 'bats at night');
  life.update(model, {...world, time:60}, FRAME(0), 5, .05, view);
  assert.ok(!kinds(life.air, life.nAir).some(c => c.startsWith('bat-')), 'no bats by day');
  const hearth = [{x:0, z:0, radius:8, kind:'hearth', id:'hearth'}];
  life.update(model, world, FRAME(.9, hearth), 5, .05, VIEW(0, 0));
  const moths = life.air.slice(0, life.nAir).filter(r => r.cell.startsWith('moth-'));
  assert.equal(moths.length, LIFE.moths.hearth);
  for(const m of moths)assert.ok(Math.hypot(m.x, m.z) < 2.5, 'moths hug the Heartfire');
  assert.ok(life.glow.slice(0, life.nGlow).some(g => g.color === 1), 'moths glow warm');
  life.update(model, world, FRAME(0, hearth), 5, .05, VIEW(0, 0));
  assert.equal(life.nAir, 0, 'no moths in daylight');
  // Pooled: the record arrays never grow, however many critters are in view.
  const pools = [life.ground.length, life.air.length, life.glow.length];
  for(let i = 0; i < 20; i++)life.update(model, world, FRAME(.9, hearth), 5 + i, .05, VIEW(0, 0, 60));
  assert.deepEqual([life.ground.length, life.air.length, life.glow.length], pools);
});
