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
