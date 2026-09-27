import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {EQUIPMENT, NODES, RECIPES, RULES, nodeAwake, phaseAt} from '../src/content.mjs';
import {DISCOVER_XP, NODE_POOLS, regionAt} from '../src/progression.mjs';
import {EQUIPMENT_SLOT_ITEMS, WORKBENCH_CRAFT_RECIPES} from '../src/contracts.mjs';
import {countItem, equipmentSlotFor} from '../src/inventory.mjs';
import {PLAYER_LIGHT_RADIUS, frameLighting, playerLanternRadius} from '../src/lighting.mjs';
import {generateNodes} from '../src/worldgen.mjs';
import {
  CRAGS_LIGHTS, FRONTIER_LINES, GRAVELIGHT_RADIUS_SCALE, HAZARDS, NIGHT_FINDS, REGION_GEAR, REGION_TIPS,
  applyRegions, cragsCover, geared, hazardAt, nightGlow, regionDarkness, regionSpeed, regionStatus, regionUnlit,
} from '../src/regions.mjs';
import {effectLine} from '../src/ui/actions.mjs';

const T = RULES.tick;
const DAY = 20;                                   // well into the first day
const NIGHT = RULES.day + RULES.dusk + 30;        // the first night

/** A point with `clear` units of the same region all round it (and walkable, for walking tests). */
function spot(w, region, clear = 6){
  for(let r = 30; r < RULES.radius - clear - 3; r += 2) for(let a = 0; a < 360; a += 4){
    const x = Math.cos(a*Math.PI/180)*r, z = Math.sin(a*Math.PI/180)*r;
    let ok = regionAt(x, z) === region && w.walkable(x, z);
    for(let i = 0; ok && i < 16; i++){const b = i/16*Math.PI*2; for(const d of [clear/2, clear]){const px = x+Math.cos(b)*d, pz = z+Math.sin(b)*d; if(regionAt(px, pz) !== region || !w.walkable(px, pz)){ok = false; break;}}}
    if(ok) return {x, z};
  }
  throw new Error(`no clear ${region} spot`);
}
function camp({players = 1, time = DAY} = {}){
  const w = new World(402); const list = [];
  for(let i = 0; i < players; i++) list.push(w.addPlayer(i ? `guest${i}` : 'host', i ? `Mate${i}` : 'Jun'));
  w.start(); w.ambient = false; w.enemies = []; w.time = time; w.nextSpawn = Infinity;
  for(const p of list) p.regions = ['meadow', 'woods', 'graveyard', 'mire', 'crags', 'barrow'];
  return {w, p: list[0], q: list[1], list};
}
function put(p, at, dx = 0){p.x = at.x+dx; p.z = at.z; p.goal = null;}
function wear(w, p, itemId){const slot = equipmentSlotFor(itemId); p.equipment[slot] = null; return w.grantEquipped(p, itemId);}
function run(w, seconds, each = null){for(let t = 0; t < seconds-1e-9; t += T){for(const p of w.players) if(p.online) w.input(p.id, {x: 0, z: 0}); each?.(); w.tick(T);} }

// ------------------------------------------------------------------ contracts
test('each hazardous region names its gear, slot and recipe, and the gear fits its socket', () => {
  assert.deepEqual(Object.keys(REGION_GEAR).sort(), ['barrow', 'crags', 'mire']);
  for(const [region, gear] of Object.entries(REGION_GEAR)){
    assert.ok(EQUIPMENT[gear.itemId], gear.itemId);
    assert.ok(EQUIPMENT_SLOT_ITEMS[gear.slot].includes(gear.itemId), `${gear.itemId} fits ${gear.slot}`);
    assert.ok(RECIPES[gear.itemId]?.station === 'bench' && WORKBENCH_CRAFT_RECIPES.includes(gear.itemId), `${gear.itemId} is made at a bench`);
    assert.ok(REGION_TIPS[region].length > 10);
  }
  // Each outer region's answer comes from the ring before it; two of them only after dark.
  assert.ok(RECIPES.sporemask.cost.glowbloom > 0 && RECIPES.gravelight.cost.wispdust > 0 && RECIPES.barrowcloak.cost.bone > 0);
  assert.equal(NODES.glowsprout.loot.glowbloom > 0 && NODES.glowsprout.night, true);
  assert.equal(NODES.gravewisp.loot.wispdust > 0 && NODES.gravewisp.night, true);
  assert.ok(NODE_POOLS.woods.includes('glowsprout') && NODE_POOLS.graveyard.includes('gravewisp'));
  assert.deepEqual(CRAGS_LIGHTS, ['gravelight', 'everlantern']);
});

test('item details describe the frontier gear and the night-only finds', () => {
  for(const id of ['sporemask', 'gravelight', 'barrowcloak', 'glowbloom', 'wispdust']) assert.equal(effectLine(id).endsWith(FRONTIER_LINES[id]), true, id);
  assert.match(effectLine('glowbloom'), /Night-only.*Autumn Woods/);
  assert.match(effectLine('wispdust'), /Night-only.*Graveyard/);
  assert.match(effectLine('sporemask'), /Mire/);
});

// ------------------------------------------------------------------ Hollow Mire
test('mire spore fog drains only the unmasked wanderer, and the mask wears only in the mire', () => {
  const {w, p, q} = camp({players: 2});
  const mire = spot(w, 'mire');
  put(p, mire); put(q, mire, 1);
  const mask = wear(w, q, 'sporemask');
  assert.ok(mask);
  run(w, 10);
  assert.ok(p.courage < 70, `unmasked courage ${p.courage.toFixed(1)}`);
  assert.ok(p.hp < 95, `unmasked health ${p.hp.toFixed(1)}`);
  assert.equal(q.courage, 100, 'the mask filters the fog');
  assert.equal(q.hp, 100);
  const worn = q.equipment.head.durability;
  assert.ok(Math.abs(worn - (EQUIPMENT.sporemask.durability - 10*HAZARDS.wear)) < .5, `mask wore ${EQUIPMENT.sporemask.durability-worn}`);
  // Out of the mire the mask does not wear at all.
  put(q, {x: 3, z: 3});
  run(w, 5);
  assert.equal(q.equipment.head.durability, worn);
});

test('a naked mire visit by day is survivable for roughly 40-60 seconds', () => {
  const {w, p} = camp();
  put(p, spot(w, 'mire'));
  let fell = null;
  run(w, 90, () => {if(fell == null && (p.down || p.hp <= 0)) fell = w.time - DAY;});
  assert.ok(fell != null, 'the fog eventually fells an unmasked wanderer');
  assert.ok(fell > 38 && fell < 62, `fell after ${fell?.toFixed(1)} s`);
});

// ------------------------------------------------------------------ Moonshard Crags
test('the crags are pitch dark by day for the viewer standing in them, and only for them', () => {
  const {w, p, q} = camp({players: 2});
  const crags = spot(w, 'crags', 8);
  put(p, crags); put(q, {x: 2, z: 2});
  assert.equal(phaseAt(w.time), 'day');
  assert.ok(regionDarkness(w, p) > .98, 'deep in the crags it is night-dark');
  assert.equal(regionDarkness(w, q), 0, 'at camp it is still day');
  assert.ok(frameLighting(w, null, p).darkness > .98);
  assert.equal(frameLighting(w, null, q).darkness, 0);
  assert.equal(frameLighting(w, null, null).darkness, 0, 'no viewer, no regional darkness');
});

test('the crags darkness ramps in over a few units at the border', () => {
  const {w} = camp();
  const deep = spot(w, 'crags', 8);
  // Walk from deep inside toward the camp until the region changes.
  const len = Math.hypot(deep.x, deep.z), ux = -deep.x/len, uz = -deep.z/len;
  let s = 0; while(regionAt(deep.x+ux*s, deep.z+uz*s) === 'crags') s += .25;
  const at = d => ({x: deep.x+ux*(s+d), z: deep.z+uz*(s+d)});
  const dark = d => regionDarkness(w, at(d));
  assert.ok(dark(-9) > .98, `inside ${dark(-9)}`);
  assert.ok(dark(9) < .02, `outside ${dark(9)}`);
  const edge = dark(0);
  assert.ok(edge > .15 && edge < .95, `at the border ${edge}`);
  assert.ok(dark(-2) >= edge - .05 && dark(2) <= edge + .05, 'darker inward, lighter outward');
  assert.ok(cragsCover(at(-9).x, at(-9).z) > .98);
});

test('in the crags only your own lit grave lantern (or everlantern) counts as light for courage', () => {
  const {w, list} = camp({players: 4});
  const crags = spot(w, 'crags', 8);
  const [bare, torch, grave, ever] = list;
  list.forEach((p, i) => put(p, crags, i*.9));
  wear(w, torch, 'torch'); torch.lantern = true;
  wear(w, grave, 'gravelight'); grave.lantern = true;
  wear(w, ever, 'everlantern'); ever.lantern = true;
  // A campfire right there does not help either.
  const fire = w.structure('fire', crags.x, crags.z+2); w.buildings.push(fire);
  assert.equal(w.lit(bare), true, 'the fire and friends\' lamps would light them anywhere else');
  assert.equal(regionUnlit(w, bare), true);
  assert.equal(regionUnlit(w, torch), true);
  assert.equal(regionUnlit(w, grave), false);
  assert.equal(regionUnlit(w, ever), false);
  run(w, 10);
  assert.ok(bare.courage < 75 && torch.courage < 75, `${bare.courage} ${torch.courage}`);
  assert.equal(grave.courage, 100);
  assert.equal(ever.courage, 100);
  // The grave lantern burns fuel like a torch; the everlantern never does.
  assert.ok(grave.equipment.light.durability < EQUIPMENT.gravelight.durability - 9);
  assert.equal(ever.equipment.light.durability, EQUIPMENT.everlantern.durability);
  // Unlit, the grave lantern protects no one.
  grave.lantern = false;
  assert.equal(regionUnlit(w, grave), true);
  assert.equal(regionStatus(w, grave).state, 'unlit');
});

test('an unlit crags visit by day drains courage, then health, like an unlit night', () => {
  const {w, p} = camp();
  put(p, spot(w, 'crags', 8));
  run(w, 20);
  assert.ok(Math.abs(p.courage - (100 - 20*HAZARDS.crags.courage)) < 2, `courage ${p.courage}`);
  assert.equal(p.hp, 100, 'health holds while courage lasts');
  run(w, 10);
  assert.ok(p.hp < 100, 'then the dark bites');
});

test('the grave lantern throws a much wider pool than the hand lantern', () => {
  const {w, p, q} = camp({players: 2});
  wear(w, p, 'torch'); p.lantern = true;
  wear(w, q, 'gravelight'); q.lantern = true;
  assert.equal(playerLanternRadius(p), PLAYER_LIGHT_RADIUS);
  assert.ok(Math.abs(playerLanternRadius(q) - PLAYER_LIGHT_RADIUS*GRAVELIGHT_RADIUS_SCALE) < 1e-9);
  assert.ok(GRAVELIGHT_RADIUS_SCALE >= 1.4);
  // Fuel still fades it out at the very end.
  q.equipment.light.durability = 1;
  assert.ok(playerLanternRadius(q) < PLAYER_LIGHT_RADIUS);
});

// ------------------------------------------------------------------ Barrow Fields
test('barrow grave-chill slows only the uncloaked wanderer; the cloak wears only in the barrow', () => {
  const {w, p, q} = camp({players: 2});
  const barrow = spot(w, 'barrow', 9);
  w.nodes = w.nodes.filter(n => Math.hypot(n.x-barrow.x, n.z-barrow.z) > 14);
  put(p, barrow); put(q, {x: barrow.x, z: barrow.z+3});
  wear(w, q, 'barrowcloak');
  assert.equal(regionSpeed(w, p), HAZARDS.barrow.speed);
  assert.equal(regionSpeed(w, q), 1);
  assert.equal(w.speedFactor(p), HAZARDS.barrow.speed);
  // Walk both the same way for two seconds.
  const dir = {x: -Math.sign(barrow.x) || 1, z: 0};
  const start = {p: p.x, q: q.x};
  for(let t = 0; t < 2; t += T){w.input(p.id, dir); w.input(q.id, dir); w.tick(T);}
  const walkedP = Math.abs(p.x-start.p), walkedQ = Math.abs(q.x-start.q);
  assert.ok(walkedQ > 7, `cloaked walked ${walkedQ}`);
  assert.ok(Math.abs(walkedP/walkedQ - HAZARDS.barrow.speed) < .06, `ratio ${walkedP/walkedQ}`);
  // Stamina comes back more slowly.
  p.stamina = q.stamina = 20;
  run(w, 2);
  assert.ok(q.stamina - 20 > 1.6*(p.stamina - 20), `stamina ${p.stamina} vs ${q.stamina}`);
  assert.ok(p.stamina > 30, 'still recovers, just slower');
  const worn = q.equipment.back.durability;
  assert.ok(worn < EQUIPMENT.barrowcloak.durability - 3);
  put(q, {x: 3, z: 3}); run(w, 4);
  assert.equal(q.equipment.back.durability, worn, 'no wear outside the barrow');
  assert.equal(regionSpeed(w, q), 1);
  put(p, {x: 3, z: 3});
  assert.equal(regionSpeed(w, p), 1, 'the chill lifts outside the barrow');
});

test('gear that breaks stops protecting, and gear in the pack does not count', () => {
  const {w, p} = camp();
  put(p, spot(w, 'mire'));
  w.stock(p.inventory, 'sporemask', 1);
  assert.equal(geared(p, 'mire'), false);
  assert.equal(regionStatus(w, p).state, 'carried');
  wear(w, p, 'sporemask');
  assert.equal(regionStatus(w, p).state, 'worn');
  p.equipment.head.durability = .1;
  run(w, 1);
  assert.equal(p.equipment.head, null, 'the mask crumbles');
  assert.equal(geared(p, 'mire'), false);
});

// ------------------------------------------------------------------ HUD status
test('region status is null when safe and describes the hazard per wanderer', () => {
  const {w, p, q} = camp({players: 2});
  put(p, {x: 3, z: 3});
  assert.equal(regionStatus(w, p), null);
  const mire = spot(w, 'mire');
  put(p, mire); put(q, mire, 1); wear(w, q, 'sporemask');
  const bare = regionStatus(w, p), masked = regionStatus(w, q);
  assert.equal(bare.region, 'mire'); assert.equal(bare.protected, false); assert.equal(bare.state, 'missing'); assert.equal(bare.itemId, 'sporemask');
  assert.equal(bare.hazard, 'Spore fog'); assert.equal(bare.tip, REGION_TIPS.mire); assert.match(bare.label, /mask/);
  assert.equal(masked.protected, true); assert.equal(masked.state, 'worn');
  p.down = 30; assert.equal(regionStatus(w, p), null, 'no hazard HUD while down');
});

test('the showcase and the arena have no region hazards', () => {
  const show = new World(402, {showcase: true}); const s = show.addPlayer('host', 'Jun'); show.start();
  const mire = spot(camp().w, 'mire');
  put(s, mire);
  assert.equal(regionStatus(show, s), null);
  assert.equal(regionSpeed(show, s), 1);
  assert.equal(regionDarkness(show, s), 0);
  const arena = new World(402, {arena: true}); const a = arena.addPlayer('host', 'Jun'); arena.start();
  put(a, mire);
  assert.equal(regionStatus(arena, a), null);
  assert.equal(arena.speedFactor(a), 1);
  assert.equal(regionDarkness(arena, a), 0);
});

// ------------------------------------------------------------------ night-only resources
test('glowsprouts and gravewisps grow in fair numbers where they belong', () => {
  for(const seed of [402, 20261031, 7]){
    const nodes = generateNodes(seed);
    const sprouts = nodes.filter(n => n.type === 'glowsprout'), wisps = nodes.filter(n => n.type === 'gravewisp');
    assert.ok(sprouts.length >= 10, `seed ${seed}: ${sprouts.length} glowsprouts`);
    assert.ok(wisps.length >= 12, `seed ${seed}: ${wisps.length} gravewisps`);
    const home = (list, region) => list.filter(n => regionAt(n.x, n.z) === region).length/list.length;
    assert.ok(home(sprouts, 'woods') > .9, 'glowsprouts grow in the Autumn Woods');
    assert.ok(home(wisps, 'graveyard') > .9, 'gravewisps drift over the Graveyard');
  }
  assert.equal(nightGlow({type: 'glowsprout'}), '#8ff0d8');
  assert.equal(nightGlow({type: 'tree'}), null);
});

test('night-only nodes are absent and unharvestable by day, and give their finds at night', () => {
  const {w, p} = camp();
  put(p, {x: 3, z: 3});
  const sprout = {id: 'sprout', type: 'glowsprout', x: 3, z: 4, hits: 1, ready: 0};
  const wisp = {id: 'wisp', type: 'gravewisp', x: 4, z: 4, hits: 1, ready: 0};
  w.nodes.push(sprout, wisp);
  const hold = (target, seconds) => {for(let t = 0; t < seconds; t += T){w.input(p.id, {x: 0, z: 0, act: true, target}); w.tick(T);}};
  assert.equal(nodeAwake(sprout, w.time), false);
  assert.equal(w.target(p)?.entity?.id === 'sprout', false, 'nothing to aim at by day');
  hold('sprout', 2.5);
  assert.equal(countItem(p.inventory, 'glowbloom'), 0, 'no harvest by day');
  assert.equal(w.action(p.id, {type: 'setHarvestTarget', requestId: 'r1', nodeId: 'sprout', mode: 'auto'}).ok, false);
  // After dark they are there.
  w.time = NIGHT; w.nextSpawn = Infinity;
  assert.equal(phaseAt(w.time), 'night');
  assert.equal(nodeAwake(sprout, w.time), true);
  hold('sprout', NODES.glowsprout.workSeconds + .5);
  assert.equal(countItem(p.inventory, 'glowbloom'), NODES.glowsprout.loot.glowbloom);
  assert.ok(sprout.ready > w.time, 'the sprout regrows later');
  hold('wisp', NODES.gravewisp.workSeconds + .5);
  assert.equal(countItem(p.inventory, 'wispdust'), NODES.gravewisp.loot.wispdust);
});

test('the first bloom and the first wisp essence are a small discovery, once each', () => {
  const {w, p} = camp();
  put(p, {x: 3, z: 3});
  const xp = () => (p.level-1)*1000 + p.xp;
  const before = p.xp, level = p.level;
  w.stock(p.inventory, 'glowbloom', 2);
  run(w, 1);
  assert.deepEqual(p.nightFinds, ['glowbloom']);
  assert.equal(p.notice, NIGHT_FINDS.glowbloom.text);
  assert.ok(p.level > level || p.xp >= before + DISCOVER_XP, 'discovery experience');
  assert.ok(w.events.some(ev => ev.type === 'discover' && ev.player === p.id));
  const after = xp();
  w.stock(p.inventory, 'glowbloom', 2);
  run(w, 1);
  assert.equal(xp(), after, 'only the first one counts');
  w.stock(p.inventory, 'wispdust', 1);
  run(w, 1);
  assert.deepEqual(p.nightFinds, ['glowbloom', 'wispdust']);
});

test('the three frontier recipes craft at a workbench and the gear can be worn', () => {
  const {w, p} = camp();
  put(p, {x: 3, z: 3});
  const bench = w.structure('bench', p.x+1, p.z); w.buildings.push(bench);
  for(const itemId of ['sporemask', 'gravelight', 'barrowcloak']){
    w.clearPack(p);
    assert.equal(w.action(p.id, {type: 'craft', recipe: itemId, stationId: bench.id}).ok, false, `${itemId} needs materials`);
    for(const [id, n] of Object.entries(RECIPES[itemId].cost)) assert.equal(w.stock(p.inventory, id, n), n);
    p.cooldown = 0;
    assert.equal(w.action(p.id, {type: 'craft', recipe: itemId, stationId: bench.id}).ok, true, itemId);
    const stack = p.inventory.slots.find(s => s?.itemId === itemId);
    assert.ok(stack, `${itemId} in the pack`);
    p.cooldown = 0;
    const socket = Object.values(REGION_GEAR).find(g => g.itemId === itemId).slot;
    assert.equal(w.action(p.id, {type: 'equipItem', requestId: `eq-${itemId}`, uid: stack.uid, socket, inventoryRevision: p.inventory.revision, equipmentRevision: p.equipmentRevision}).ok, true, `equip ${itemId}`);
    assert.equal(p.equipment[equipmentSlotFor(itemId)]?.itemId, itemId, `${itemId} worn`);
  }
});

// ------------------------------------------------------------------ network
test('snapshot and restore keep the hazards per wanderer, for guests and loaded saves', () => {
  const {w, p, q} = camp({players: 2});
  const mire = spot(w, 'mire');
  put(p, mire); put(q, mire, 1); wear(w, q, 'sporemask');
  w.stock(p.inventory, 'glowbloom', 1); run(w, 1);
  // A guest rebuilds the world from the host's network snapshot every frame.
  const guest = World.restore(JSON.parse(JSON.stringify(w.snapshot())));
  const gp = guest.player(p.id), gq = guest.player(q.id);
  assert.deepEqual(regionStatus(guest, gp), regionStatus(w, p));
  assert.equal(regionStatus(guest, gq).state, 'worn');
  assert.equal(regionDarkness(guest, gp), regionDarkness(w, p));
  assert.deepEqual(gp.nightFinds, ['glowbloom']);
  // A loaded save keeps applying the same rules.
  const saved = World.restore(JSON.parse(JSON.stringify(w.snapshot({purpose: 'save'}))));
  saved.ambient = false; saved.nextSpawn = Infinity;
  const sp = saved.player(p.id), sq = saved.player(q.id);
  const c0 = sp.courage;
  run(saved, 3);
  assert.ok(sp.courage < c0 - 8, 'the fog still stings after a reload');
  assert.equal(sq.courage, 100);
  assert.deepEqual(sp.nightFinds, ['glowbloom']);
  // applyRegions only touches the wanderer it is given.
  const hp = sq.hp; applyRegions(saved, sp, 1, 'day'); assert.equal(sq.hp, hp);
  assert.equal(hazardAt(3, 3), null);
});
