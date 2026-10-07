// The Shrine of Yomi: its yokai, regions, omens, boss, weapons and camp pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../src/engine.mjs';
import {ENEMIES, RULES} from '../src/content.mjs';
import {HAUNTS, LOOT_TABLES, RESIDENTS, ROAM, hauntRoster} from '../src/progression.mjs';
import {loadMagicModules} from '../src/magic/load.mjs?v=harvest-18';
import {ATTACKS, MOVES, telegraphOf} from '../src/mobs.mjs?v=harvest-18';
import {CHILL, ROUSE, YOKAI, YOKAI_ATTACKS} from '../src/yokai.mjs?v=harvest-18';
import {LAB} from '../src/lab.mjs?v=harvest-18';

await loadMagicModules();
const T = RULES.tick;
const THEME = JSON.parse(readFileSync(new URL('../themes/harvest/theme.json', import.meta.url)));
function camp(){
  const w = new World(402, {showcase: true}); const p = w.addPlayer('host', 'Jun'); w.start();
  w.ambient = false; w.enemies = []; w.nodes = []; p.x = 0; p.z = 0; p.dx = 1; p.dz = 0;
  return {w, p};
}
function run(w, seconds, each = null){
  for(let t = 0; t < seconds-1e-9; t += T){for(const p of w.players) if(p.online) w.input(p.id, {x: 0, z: 0}); each?.(); w.tick(T);}
}
const blasts = (w, style) => (w.hostile || []).filter(s => s.kind === 'blast' && (!style || s.style === style));
function foe(w, type, x, z, extra = {}){
  const e = w.spawnEnemy(type, x, z, {elite: false, ...extra}); e.hp = e.maxHp = 9999; e.cooldown = 0; return e;
}
const immortal = p => () => {p.hp = p.maxHp = 9999;};

// ------------------------------------------------------------------ the yokai
test('the Shrine of Yomi has four new yokai, each wired everywhere a creature needs to be', () => {
  assert.deepEqual([...YOKAI].sort(), ['daoshi', 'kasa', 'rokurokubi', 'yukionna']);
  for(const type of YOKAI){
    assert.ok(ENEMIES[type]?.name, type+' has stats');
    assert.ok(MOVES[type], type+' moves');
    for(const id of MOVES[type].attacks) assert.ok(ATTACKS[id], `${type} attack ${id}`);
    assert.ok(LOOT_TABLES[type]?.xp > 0, type+' has a loot table');
    assert.ok(ROAM.pack[type], type+' roams in packs');
    assert.ok(LAB.foes.includes(type), type+' is in the lab');
    assert.ok(HAUNTS.yomi.some(([id]) => id === type), type+' rises on a Yomi night');
    const sprite = THEME.sprites[type];
    assert.ok(sprite && sprite.columns === 4 && sprite.rows === 2 && sprite.clips.attack && sprite.clips.walk, type+' has a creature sheet');
  }
  // Each pattern is its own: no yokai shares an attack with an older creature.
  const yokaiAttacks = new Set(Object.keys(YOKAI_ATTACKS));
  for(const [type, move] of Object.entries(MOVES)) if(!YOKAI.includes(type)) for(const id of move.attacks) assert.ok(!yokaiAttacks.has(id), `${type} borrows ${id}`);
});

test('a Yomi night grows: the long-necked, the snow women and the priests come only as the threat rises', () => {
  const early = hauntRoster('yomi', 1).map(([id]) => id), late = hauntRoster('yomi', 8).map(([id]) => id);
  assert.ok(early.includes('kasa') && early.includes('chochin'));
  assert.ok(!early.includes('daoshi') && !early.includes('yukionna'));
  for(const id of ['rokurokubi', 'yukionna', 'daoshi']) assert.ok(late.includes(id), id);
  assert.deepEqual(hauntRoster('woods', 3).map(([id]) => id), RESIDENTS.woods, 'a place with no haunt list sends its residents');
  assert.deepEqual(ROAM.escort.daoshi[0], 'jiangshi', 'a fallen daoshi walks with his dead');
});

test('a kasa-obake skips at you: a zigzag of splashes, one a beat after the other, and it lands past you', () => {
  const {w, p} = camp();
  const e = foe(w, 'kasa', -4.5, 0);
  let laid = null;
  run(w, 1.2, () => {immortal(p)(); if(!laid && blasts(w, 'rain').length) laid = blasts(w, 'rain').map(s => ({...s}));});
  assert.ok(laid, 'it skipped');
  assert.equal(laid.length, YOKAI_ATTACKS.skip.hops);
  const fuses = laid.map(s => s.fuse).sort((a, b) => a-b);
  assert.ok(fuses[1]-fuses[0] > .25 && fuses[2]-fuses[1] > .25, 'each landing a beat after the last');
  const sides = laid.map(s => Math.sign(s.z)).filter(Boolean);
  assert.ok(new Set(sides).size === 2, 'the landings zigzag');
  assert.ok(laid.every(s => s.x > -4.5), 'every landing heads toward the prey');
  run(w, 1.2, immortal(p));
  assert.ok(e.x > -1.5, `it came down near or past you (${e.x.toFixed(2)})`);
  assert.ok(telegraphOf({...e, windup: .2, atk: 'skip', wt: .5, tx: e.x, tz: e.z}).shape === 'line');
});

test('a rokurokubi hangs back, then her neck crosses the ground and whips back aslant; an elder whips both ways', () => {
  for(const elite of [false, true]){
    const {w, p} = camp();
    const e = foe(w, 'rokurokubi', -8, 0, {elite});
    let laid = null;
    run(w, 3, () => {immortal(p)(); const n = blasts(w, 'neck'); if(!laid && n.length) laid = n.map(s => ({...s}));});
    assert.ok(laid, 'the neck shot out');
    assert.equal(laid.length, elite ? 3 : 2);
    const first = laid.reduce((a, b) => a.fuse < b.fuse ? a : b);
    assert.ok(first.len >= 10, 'it reaches across the screen');
    assert.ok(laid.filter(s => s !== first).every(s => s.fuse > first.fuse+.4 && Math.abs(s.ang-first.ang) > .3), 'the whip comes a beat later, aslant');
    assert.ok(Math.hypot(e.x-p.x, e.z-p.z) > 5, 'she keeps her distance');
  }
});

test("a yuki-onna's frost falls in two crosses and chills whoever it catches; a dodge through it stays warm", () => {
  const {w, p} = camp();
  foe(w, 'yukionna', -7, 0);
  let laid = null;
  run(w, 2.5, () => {immortal(p)(); const f = blasts(w, 'frost'); if(!laid && f.length) laid = f.map(s => ({...s}));});
  assert.ok(laid, 'she breathed frost');
  assert.equal(laid.length, 4);
  assert.ok(laid.every(s => s.chill > 0));
  const beats = [...new Set(laid.map(s => Math.round(s.fuse*10)))];
  assert.equal(beats.length, 2, 'two crosses, a beat apart');
  // Standing at the centre, the first cross catches you.
  run(w, 1.4, immortal(p));
  assert.ok(p.chill > w.time, 'chilled');
  const cold = w.speedFactor(p);
  p.chill = 0;
  assert.ok(Math.abs(cold/w.speedFactor(p)-CHILL.speed) < 1e-6, 'a chilled wanderer walks slower');
  // Inside a dodge's i-frames the frost passes through you.
  const {w: w2, p: p2} = camp();
  foe(w2, 'yukionna', -7, 0);
  run(w2, 4, () => {immortal(p2)(); p2.iframes = 1;});
  assert.ok(!(p2.chill > 0), 'a dodge through the frost stays warm');
});

test('a fallen daoshi pins three talismans, burns the triangle, then the seal inside; his bell rouses the dead', () => {
  const {w, p} = camp();
  const e = foe(w, 'daoshi', -7, 0);
  let laid = null;
  run(w, 2.5, () => {immortal(p)(); const o = blasts(w, 'ofuda'); if(!laid && o.length) laid = o.map(s => ({...s}));});
  assert.ok(laid, 'he sealed');
  assert.equal(laid.filter(s => s.shape === 'circle').length, 4, 'three talismans and the seal');
  assert.equal(laid.filter(s => s.shape === 'line').length, 3, 'the triangle between them');
  const core = laid.filter(s => s.shape === 'circle').reduce((a, b) => a.fuse > b.fuse ? a : b);
  assert.ok(Math.hypot(core.x-p.x, core.z-p.z) < .5 && core.fuse > 1.4, 'the seal goes off last, where you stood');
  // Next in his cycle: the bell. With no dead near, he raises one; it is roused.
  w.hostile = []; e.cooldown = 0;
  run(w, 4, immortal(p));
  const raised = w.enemies.filter(m => m.type === 'jiangshi' && m.raiser === e.id);
  assert.ok(raised.length >= 1 && raised.length <= ROUSE.most, `raised ${raised.length}`);
});

test('a daoshi rings up the jiangshi already near him: they run faster and leap at once', () => {
  const {w, p} = camp();
  const e = foe(w, 'daoshi', -9, 0);
  e.pat = 1; // the bell is next
  const j = [foe(w, 'jiangshi', -11, 2), foe(w, 'jiangshi', -11, -2)];
  for(const m of j) m.cooldown = 5;
  run(w, 1.4, immortal(p));
  for(const m of j) assert.ok(m.rouse > w.time, 'roused');
  assert.ok(!w.enemies.some(m => m.raiser === e.id), 'enough dead were near: none raised');
});

// ------------------------------------------------------------------ the regions
import {areasOf, blackAt, springAt, setLand, generateNodes, YOMI_AREAS} from '../src/worldgen.mjs';
import {REGIONS, NODE_POOLS} from '../src/progression.mjs';
import {SPRING, VEIL, WADE, mobWade, stepYomi} from '../src/yomi.mjs?v=harvest-18';
import {aimTarget} from '../src/arsenal.mjs?v=harvest-18';
import {AREA_MIX, PROPS} from '../src/scenery-layout.mjs?v=harvest-18';
import {SCENERY_ATLAS} from '../src/scenery-atlas.mjs?v=harvest-18';

const SEED = 4242;
function yomiWorld(){
  const w = new World(SEED, {land: 'yomi'}); const p = w.addPlayer('host', 'Jun'); w.start();
  w.enemies = []; w.hostile = [];
  return {w, p, areas: areasOf(SEED)};
}
/** A walkable spot in an area, matching `test`. */
function spotIn(w, a, test = () => true){
  for(let r = 0; r < a.r; r += .5) for(let k = 0; k < 24; k++){const x = a.x+Math.cos(k/24*Math.PI*2)*r, z = a.z+Math.sin(k/24*Math.PI*2)*r; if(w.walkable(x, z) && w.regionOf(x, z) === a.id && test(x, z)) return {x, z};}
  return null;
}

test('a Yomi hollow lays a bamboo thicket, a spider-lily marsh and a hot-spring terrace; a plain hollow does not', () => {
  for(const seed of [1, 2, 3, 402, 777, 2024]){
    setLand(seed, 'yomi');
    const ids = areasOf(seed).map(a => a.id);
    for(const id of YOMI_AREAS) assert.ok(ids.includes(id), `${seed} lacks ${id}`);
    const all = areasOf(seed);
    for(const a of all) for(const b of all) if(a !== b) assert.ok(Math.hypot(a.x-b.x, a.z-b.z) > a.r+b.r, `${a.id} overlaps ${b.id} (${seed})`);
    setLand(seed, null);
    assert.ok(!areasOf(seed).some(a => YOMI_AREAS.includes(a.id)), 'a plain hollow keeps its old places');
  }
  for(const id of YOMI_AREAS){
    assert.ok(REGIONS[id]?.area && REGIONS[id].haunt, id);
    assert.ok(NODE_POOLS[id]?.length && RESIDENTS[id]?.length && HAUNTS[id]?.length && AREA_MIX[id], id);
    for(const [kind] of AREA_MIX[id].kinds) assert.ok(PROPS[kind] && SCENERY_ATLAS.cells[kind], `${id} decorates with ${kind}`);
  }
  setLand(SEED, 'yomi');
  const nodes = generateNodes(SEED), looks = new Set(nodes.map(n => n.look));
  for(const look of ['bamboo', 'yanagi']) assert.ok(looks.has(look) && THEME.sprites[look], look);
  assert.ok(!nodes.some(n => blackAt(SEED, n.x, n.z) || springAt(SEED, n.x, n.z)), 'nothing grows in the river or the springs');
});

test('the bamboo hides the dead until you are on them, and nothing aims at what it cannot see', () => {
  const {w, p, areas} = yomiWorld(), grove = areas.find(a => a.id === 'chikurin');
  const at = spotIn(w, grove);
  const e = w.spawnEnemy('kasa', at.x, at.z, {elite: false});
  p.x = at.x+VEIL.near+3; p.z = at.z; p.dx = -1; p.dz = 0;
  stepYomi(w, T);
  assert.equal(e.veiled, true);
  assert.equal(aimTarget(w, p, 20), null, 'a bow finds nothing to aim at');
  p.x = at.x+VEIL.near-1;
  stepYomi(w, T);
  assert.ok(!e.veiled, 'close enough, it is seen');
  assert.equal(aimTarget(w, p, 20), e);
});

test('the black river slows whoever wades it; the floating pass over', () => {
  const {w, p, areas} = yomiWorld(), marsh = areas.find(a => a.id === 'higan');
  const wet = spotIn(w, marsh, (x, z) => blackAt(SEED, x, z)), dry = spotIn(w, marsh, (x, z) => !blackAt(SEED, x, z));
  assert.ok(wet && dry, 'the marsh has a river and banks');
  p.x = dry.x; p.z = dry.z; const onBank = w.speedFactor(p);
  p.x = wet.x; p.z = wet.z; const wading = w.speedFactor(p);
  assert.ok(Math.abs(wading/onBank-WADE.speed) < 1e-6);
  stepYomi(w, T);
  const corpse = {type: 'jiangshi', x: wet.x, z: wet.z}, snow = {type: 'yukionna', x: wet.x, z: wet.z};
  assert.equal(mobWade(w, corpse, false), WADE.speed);
  assert.equal(mobWade(w, snow, false), 1, 'the snow woman floats over it');
});

test('a hot spring mends whoever sits in it and thaws frost; its geyser shoves on its own beat', () => {
  const {w, p, areas} = yomiWorld(), terrace = areas.find(a => a.id === 'onsen');
  const pool = terrace.pools[0];
  assert.ok(springAt(SEED, pool.x, pool.z));
  p.x = pool.x; p.z = pool.z; p.hp = 40; p.chill = w.time+5;
  stepYomi(w, 1);
  assert.ok(Math.abs(p.hp-(40+SPRING.heal)) < 1e-6, 'mended');
  assert.ok(!(p.chill > w.time), 'thawed');
  const e = w.spawnEnemy('kasa', pool.x+.3, pool.z, {elite: false}); e.hp = 10;
  stepYomi(w, 1);
  assert.ok(e.hp > 10, 'creatures mend in it too');
  let steam = 0;
  for(let t = 0; t < SPRING.geyser[1]*2+1; t += T){w.time += T; stepYomi(w, T); steam = Math.max(steam, blasts(w, 'steam').length);}
  assert.ok(steam >= 1, 'a geyser went up');
  assert.ok(blasts(w, 'steam').every(s => s.all && s.push > 0));
});

// ------------------------------------------------------------------ the omens
import {OMENS, YOMI_OMEN, omenKinds, spawnOmen, useOmen} from '../src/omens.mjs?v=harvest-18';
import {NODES} from '../src/content.mjs';
import {CONTEXT_ACTIONS as NODE_ACTIONS} from '../src/contracts.mjs';
import {BUFF} from '../src/buffs.mjs?v=harvest-18';

function omenWorld(){
  const {w, p} = yomiWorld();
  w.ambient = true; w.omens = []; w.omenT = 9e9;
  return {w, p};
}
const tickOmens = (w, seconds, each = null) => {for(let t = 0; t < seconds-1e-9; t += T){each?.(); w.tick(T);}};

test("the Shrine of Yomi's three omens come only in that land, marked and kept like every other", () => {
  for(const kind of ['obon', 'hyakki', 'foxwedding']){
    assert.equal(OMENS[kind].land, 'yomi');
    assert.ok(LOOT_TABLES[kind]?.xp > 0, kind+' is worth the trip');
    if(OMENS[kind].node){assert.ok(NODES[OMENS[kind].node]?.omen && THEME.sprites[OMENS[kind].node] && NODE_ACTIONS[OMENS[kind].node]?.length, kind+' has a node, art and an action');}
  }
  const plain = new World(31, {mode: 'vigil'}), yomi = new World(SEED, {mode: 'vigil', land: 'yomi'});
  assert.ok(!omenKinds(plain).some(([id]) => OMENS[id].land), 'a plain hollow never sees them');
  assert.ok(omenKinds(yomi).some(([id]) => id === 'obon'));
  // Night only: the parade.
  yomi.time = 10; assert.ok(!omenKinds(yomi).some(([id]) => id === 'hyakki'), 'no parade by day');
  // Saved and restored with the world.
  const {w} = omenWorld();
  const o = spawnOmen(w, 'obon');
  assert.ok(o && o.to, 'an Obon lantern waits by the shrine');
  const back = World.restore(structuredClone(w.snapshot({purpose: 'save'})));
  assert.ok(back.omens.some(entry => entry.id === o.id) && back.nodes.some(n => n.id === o.id && n.type === 'obonlantern'));
});

test('the Obon lanterns walk only beside the living, lose a light to every ghost that reaches them, and pay out at the shrine', () => {
  const {w, p} = omenWorld();
  const o = spawnOmen(w, 'obon'), node = w.nodes.find(n => n.id === o.id);
  p.x = o.x+1; p.z = o.z; p.hp = p.maxHp = 1e6;
  useOmen(w, node, [p.id]);
  assert.ok(o.lit && o.lights === YOMI_OMEN.obon.lights && !w.nodes.some(n => n.id === o.id), 'lit: the procession sets out');
  const start = [o.x, o.z];
  // Alone, it waits.
  p.x = o.x+30; tickOmens(w, 2, () => {p.hp = p.maxHp;});
  assert.deepEqual([o.x, o.z], start, 'it waits for someone to walk beside it');
  // Beside it, it walks, and the ghosts come for the light, not for you.
  p.x = o.x; p.z = o.z;
  let ghosts = [];
  tickOmens(w, YOMI_OMEN.obon.firstAfter+.5, () => {p.x = o.x+1; p.z = o.z; p.hp = p.maxHp;});
  ghosts = w.enemies.filter(e => e.snuff === o.id);
  assert.ok(Math.hypot(o.x-start[0], o.z-start[1]) > 2, 'it walked');
  assert.ok(ghosts.length >= YOMI_OMEN.obon.ghosts, 'hungry ghosts rose');
  const before = o.lights;
  tickOmens(w, 12, () => {p.x = o.x+1; p.z = o.z; p.hp = p.maxHp;});
  assert.ok(o.lights < before || o.done, 'a ghost reached the lanterns');
  // Walk it home (keep the ghosts off).
  for(let i = 0; i < 4000 && !o.done; i++){w.enemies = w.enemies.filter(e => e.snuff !== o.id); p.x = o.x+1; p.z = o.z; p.hp = p.maxHp; w.tick(T);}
  assert.ok(o.done, 'the procession ended');
  assert.ok(Math.hypot(o.x-o.to[0], o.z-o.to[1]) < 1 || o.lights <= 0);
});

test('the Hyakki Yagyō keeps to its road until provoked, and its herald spills a hoard', () => {
  const {w, p} = omenWorld();
  const o = spawnOmen(w, 'hyakki');
  assert.ok(o, 'a parade set out');
  const marchers = w.enemies.filter(e => e.parade === o.id);
  assert.ok(marchers.length >= YOMI_OMEN.hyakki.count && marchers.filter(e => e.herald).length === 1);
  p.x = 0; p.z = 0; p.hp = p.maxHp = 1e6;
  const herald = marchers.find(e => e.herald), d0 = Math.hypot(herald.x-o.to[0], herald.z-o.to[1]);
  tickOmens(w, 3, () => {p.hp = p.maxHp;});
  assert.ok(Math.hypot(herald.x-o.to[0], herald.z-o.to[1]) < d0-2, 'it marches on');
  assert.ok(!marchers.some(e => e.provoked), 'nobody is near: nobody turns');
  // Step close: the marchers near you turn.
  p.x = herald.x+1; p.z = herald.z;
  tickOmens(w, T*2, () => {p.hp = p.maxHp;});
  assert.ok(herald.provoked && herald.raid, 'the herald turns on you');
  // The herald falls: a hoard, the omen fulfilled.
  const done = w.omensDone || 0, drops = w.drops.length;
  herald.hp = 0; herald.lastHitBy = p.id;
  tickOmens(w, T*2, () => {p.hp = p.maxHp;});
  assert.equal(w.omensDone, done+1);
  assert.ok(w.drops.length > drops, 'its hoard spilled');
});

test('a fox wedding blesses whoever keeps still beside it, and curses whoever strikes', () => {
  for(const rude of [false, true]){
    const {w, p} = omenWorld();
    const o = spawnOmen(w, 'foxwedding'), node = w.nodes.find(n => n.id === o.id);
    p.x = o.x+2; p.z = o.z; p.hp = p.maxHp = 1e6;
    useOmen(w, node, [p.id]);
    assert.equal(o.state, 'watching');
    tickOmens(w, 2, () => {p.x = o.x+2; p.z = o.z;});
    if(rude) p.aimUntil = w.time+.5;
    tickOmens(w, YOMI_OMEN.foxwedding.watch, () => {p.x = o.x+2; p.z = o.z; p.hp = p.maxHp;});
    assert.ok(o.done);
    if(rude){assert.ok(!p.buffs?.foxwed, 'no blessing for the rude'); assert.ok(w.enemies.some(e => e.hunt), 'foxfire comes for you');}
    else{assert.ok(p.buffs?.foxwed > w.time, 'blessed'); assert.ok(BUFF.foxwed > 1 && BUFF.foxward < 1);}
  }
});

// ------------------------------------------------------------------ the Gashadokuro
import {BOSS_ATTACKS, BOSS_LOOT, BOSS_MOVES, phaseOf as bossPhase} from '../src/bosses.mjs?v=harvest-18';
import {MOUND, gashaOf, wakeMound} from '../src/yomi.mjs?v=harvest-18';
import {magicItems} from '../src/magic/registry.mjs?v=harvest-18';
import {rarityOf} from '../src/progression.mjs';
import {CLOCKS} from '../src/content.mjs';

test('the Mound of the Starved lies in every Yomi marsh, and wakes the Gashadokuro only at night', () => {
  for(const seed of [1, 2, 402, 2024]){
    setLand(seed, 'yomi');
    const marsh = areasOf(seed).find(a => a.id === 'higan'), mound = generateNodes(seed).find(n => n.type === 'gashamound');
    assert.ok(mound && Math.hypot(mound.x-marsh.x, mound.z-marsh.z) < marsh.r, `${seed}: a mound in the marsh`);
  }
  assert.ok(THEME.sprites.gashamound && THEME.sprites.gashadokuro, 'drawn');
  assert.ok(NODES.gashamound.landmark === 'gasha' && NODE_ACTIONS.gashamound.includes('wake'));
  const {w, p} = yomiWorld(), mound = w.nodes.find(n => n.type === 'gashamound');
  p.x = mound.x+2; p.z = mound.z;
  w.time = 20; wakeMound(w, mound, p);
  assert.equal(gashaOf(w).state, 'asleep', 'by day nothing answers');
  w.time = CLOCKS.vigil.day+CLOCKS.vigil.dusk+10; w.mode = 'vigil';
  wakeMound(w, mound, p);
  const G = gashaOf(w), boss = w.enemies.find(e => e.type === 'gashadokuro');
  assert.equal(G.state, 'awake'); assert.ok(boss && boss.boss && G.boss === boss.id);
  // Saved and sent to guests.
  const back = World.restore(structuredClone(w.snapshot({purpose: 'save'})));
  assert.equal(back.gasha.state, 'awake');
});

test('the Gashadokuro fights in three phases, sinks and bursts up, and always drops its hand the first time', () => {
  assert.equal(BOSS_LOOT.gashadokuro.weapon, 'odokuro');
  assert.ok(magicItems.odokuro && rarityOf('odokuro') === 'legendary');
  for(const phase of BOSS_MOVES.gashadokuro.phases) for(const id of phase) assert.ok(BOSS_ATTACKS[id], id);
  const {w, p} = yomiWorld();
  w.ambient = false; w.time = 900;
  const boss = w.spawnEnemy('gashadokuro', p.x+6, p.z, {elite: false});
  boss.aggro = true; boss.home = {x: boss.x, z: boss.z}; boss.leash = 40; // as at its mound: dawn does not clear it
  const styles = new Set(), immortal = () => {p.hp = p.maxHp = 1e6;};
  // Phase by phase: watch what it lays on the ground.
  for(const left of [1, .5, .2]){
    boss.hp = boss.maxHp*left-1;
    for(let t = 0; t < 14; t += T){immortal(); w.tick(T); for(const s of w.hostile || []) styles.add(s.kind === 'blast' ? `${s.style}:${s.shape}` : s.kind);}
  }
  assert.ok(bossPhase(boss) === 3);
  assert.ok(styles.has('bone:circle') && styles.has('bone:line'), 'palm and fingers');
  assert.ok(styles.has('shard'), 'a spiral of skulls');
  assert.ok(styles.has('bone:ring'), 'it sank and burst up');
  // First kill: its hand, every time the first time.
  p.x = boss.x+30; p.z = boss.z; // out of reach, so nothing is picked up before we look
  boss.hp = 0; boss.lastHitBy = p.id;
  w.tick(T);
  assert.ok(w.drops.some(d => d.stack?.itemId === 'odokuro'), 'the Gashadokuro’s Hand');
  assert.ok(['sigil', 'ember', 'heartstone'].every(id => w.drops.some(d => d.stack?.itemId === id)), 'and a hoard');
});
