import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {loadMagicModules} from '../src/magic/load.mjs?v=harvest-18';
import {CLASSES, CLASS_RULES, castBlock, learnBlock, pointsFree, pointsSpent} from '../src/classes/registry.mjs?v=harvest-18';
import {RONIN, cruxPoints} from '../src/classes/ronin.mjs?v=harvest-18';
import {IAI, hangingCuts} from '../src/magic/katana.mjs?v=harvest-18';

await loadMagicModules();

function setup(){
  const world = new World(77, {classes: true}), p = world.addPlayer('host', 'Jun');
  world.start();
  return {world, p};
}
const act = (world, cmd) => world.action('host', cmd);
const run = (world, secs) => {for(let t = 0; t < secs-1e-9; t += .05) world.tick(.05);};
function foe(world, x, z, hp = 5000){
  const e = world.spawnEnemy('crawler', x, z, {elite: false});
  e.hp = e.maxHp = hp; e.magicRootRemaining = 999;
  return e;
}

test('classes mode waits for a class, arms its weapon and opens the waves', () => {
  const {world, p} = setup();
  assert.equal(world.arena.classes, true);
  assert.equal(world.arena.phase, 'class');
  run(world, 1);
  assert.equal(world.arena.wave, 0, 'no wave before a class is chosen');
  assert.equal(act(world, {type: 'classPick', classId: 'nobody'}).ok, false);
  assert.equal(act(world, {type: 'classPick', classId: 'ronin'}).ok, true);
  assert.equal(p.classId, 'ronin');
  assert.equal(p.equipment.weapon.itemId, 'katana');
  run(world, .1);
  assert.equal(world.arena.wave, 1);
  assert.equal(world.arena.phase, 'countdown');
  assert.equal(act(world, {type: 'arenaPick', choice: 0}).ok, false, 'no weapon cards in the classes mode');
});

test('levels are talent points; tiers open with points spent in the branch', () => {
  const {world, p} = setup();
  act(world, {type: 'classPick', classId: 'ronin'});
  assert.equal(pointsFree(p), 1);
  assert.equal(learnBlock(p, 'tsubame'), 'tier');
  assert.equal(act(world, {type: 'classTalent', op: 'learn', node: 'kesagiri'}).ok, true);
  assert.deepEqual(p.classBar, ['kesagiri']);
  assert.equal(act(world, {type: 'classTalent', op: 'learn', node: 'keen-edge'}).ok, false, 'out of points');
  act(world, {type: 'classTest', op: 'level', n: 9});
  assert.equal(p.level, 10);
  assert.equal(pointsFree(p), 9);
  for(const id of ['kesagiri', 'kesagiri', 'keen-edge']) assert.equal(act(world, {type: 'classTalent', op: 'learn', node: id}).ok, true);
  assert.equal(act(world, {type: 'classTalent', op: 'learn', node: 'kesagiri'}).ok, false, 'maxed');
  assert.equal(pointsSpent(p, 'iai'), 4);
  assert.equal(act(world, {type: 'classTalent', op: 'learn', node: 'tsubame'}).ok, false, 'tier 2 needs six in Iai');
  for(const id of ['keen-edge', 'keen-edge']) act(world, {type: 'classTalent', op: 'learn', node: id});
  assert.equal(act(world, {type: 'classTalent', op: 'learn', node: 'tsubame'}).ok, true);
  assert.deepEqual(p.classBar, ['kesagiri', 'tsubame']);
  run(world, .05);
  assert.equal(p.kataMods.damage, 1.24);
  assert.equal(act(world, {type: 'classTalent', op: 'respec'}).ok, true);
  assert.equal(pointsFree(p), 10);
  assert.deepEqual(p.classBar, []);
  for(const def of Object.values(CLASSES)) for(const [id, node] of Object.entries(def.nodes)){
    assert.ok(node.tier >= 0 && node.tier < CLASS_RULES.tiers, `${id} tier`);
    if(node.req) assert.ok(def.nodes[node.req] && def.nodes[node.req].tier < node.tier, `${id} requires an earlier talent`);
    if(node.kind === 'skill') assert.ok(def.skills[id], `${id} has a skill`);
    assert.equal(typeof node.text(1), 'string');
  }
});

test('Crossing Cut lays an X whose crossing bursts when the sheath snaps', () => {
  const {world, p} = setup();
  act(world, {type: 'classPick', classId: 'ronin'});
  act(world, {type: 'classTest', op: 'toggle', key: 'hold'});
  world.arena.phase = 'cleared'; world.arena.timer = 0;
  p.x = 0; p.z = 0; p.dx = 1; p.dz = 0;
  const e = foe(world, 2.4, 0);
  act(world, {type: 'classTalent', op: 'learn', node: 'kesagiri'});
  assert.equal(act(world, {type: 'classSkill', skill: 'kesagiri'}).ok, true);
  const cuts = hangingCuts(world, p);
  assert.equal(cuts.length, 2);
  assert.equal(cruxPoints(cuts).length, 1, 'the X crosses once');
  run(world, .1);
  const afterLay = e.hp;
  assert.ok(afterLay < 5000, 'both cuts strike as they are laid');
  assert.ok(p.ki > 0, 'Ki from a skill that lands');
  assert.equal(act(world, {type: 'classSkill', skill: 'kesagiri'}).ok, false, 'on cooldown');
  // Three draws: the third sheathes and snaps both skill cuts and the draws; the crux bursts.
  const events = [];
  for(let i = 0; i < 3; i++){p.cooldown = 0; world.attack(p); run(world, .05);}
  run(world, .6);
  for(const ev of world.events) events.push(ev.type);
  assert.ok(events.includes('katasnap'));
  assert.ok(events.includes('ronincrux'), 'a crossing bursts');
  assert.equal(hangingCuts(world, p).length, 0);
});

test('Shadow Lure drags foes onto a hanging cut; Swift Sheath snaps for the Ki it spends', () => {
  const {world, p} = setup();
  act(world, {type: 'classPick', classId: 'ronin'});
  act(world, {type: 'classTest', op: 'level', n: 20});
  act(world, {type: 'classTest', op: 'toggle', key: 'hold'});
  world.arena.phase = 'cleared'; world.arena.timer = 0;
  for(const id of ['kage-fumi', 'afterimage', 'afterimage', 'hikiyose', 'kesagiri', 'noto']) assert.equal(act(world, {type: 'classTalent', op: 'learn', node: id}).ok, true, id);
  assert.deepEqual(p.classBar, ['kage-fumi', 'hikiyose', 'kesagiri', 'noto']);
  p.x = 0; p.z = 0; p.dx = 1; p.dz = 0;
  const e = world.spawnEnemy('crawler', 0, 5, {elite: false}); e.hp = e.maxHp = 5000;
  act(world, {type: 'classSkill', skill: 'kesagiri'});
  run(world, .4);
  assert.equal(act(world, {type: 'classSkill', skill: 'hikiyose'}).code, 'resource', 'needs Ki');
  act(world, {type: 'classTest', op: 'ki'});
  assert.equal(act(world, {type: 'classSkill', skill: 'hikiyose'}).ok, true);
  run(world, .5);
  const gap = Math.min(...hangingCuts(world, p).map(cut => {
    const sx = cut.x1-cut.x0, sz = cut.z1-cut.z0, t = Math.max(0, Math.min(1, ((e.x-cut.x0)*sx+(e.z-cut.z0)*sz)/(sx*sx+sz*sz)));
    return Math.hypot(e.x-(cut.x0+sx*t), e.z-(cut.z0+sz*t));
  }));
  assert.ok(gap < .5, `lured onto a cut (${gap.toFixed(2)} away)`);
  assert.ok(e.magicRootRemaining > 0, 'and held there');
  const ki = p.ki, before = e.hp;
  run(world, .35);
  assert.equal(act(world, {type: 'classSkill', skill: 'noto'}).ok, true);
  assert.equal(p.ki, 0, 'all Ki spent');
  assert.ok(ki >= 15);
  run(world, .1);
  assert.ok(e.hp < before, 'the sheath snaps the cuts on it');
  // Shadow Step: through a foe, untouchable, the path hangs.
  const f = foe(world, 3, 0, 900);
  p.classGcd = 0; p.dx = 1; p.dz = 0; world.enemies = world.enemies.filter(x => x === f);
  assert.equal(act(world, {type: 'classSkill', skill: 'kage-fumi'}).ok, true);
  run(world, .4);
  assert.ok(p.x > 4, `dashed (${p.x.toFixed(2)})`);
  assert.ok(f.hp < 900, 'cut on the way');
  assert.ok(hangingCuts(world, p).some(c => c.tag === 'step'), 'the path hangs as a cut');
});

test('the ultimate waits for its level and Ki; skills cannot be cast without the class', () => {
  const {world, p} = setup();
  assert.equal(act(world, {type: 'skill'}).ok, false);
  act(world, {type: 'classPick', classId: 'ronin'});
  p.ki = 100;
  assert.equal(castBlock(world, p, 'ultimate'), 'locked');
  act(world, {type: 'classTest', op: 'level', n: RONIN.ultLevel-1});
  foe(world, 2, 0);
  assert.equal(act(world, {type: 'skill'}).ok, true);
  assert.equal(p.ki, 50);
  assert.ok(p.kataDraw, 'the Hundred-Line Draw has begun');
  run(world, 2.5);
  assert.equal(p.kataDraw, null);
  assert.ok(world.events.some(ev => ev.type === 'katasnap' && ev.skill));
  assert.ok(IAI.damage > 0);
});

test('every talent at full rank: skills cast, the combos fire, nothing lingers', () => {
  const {world, p} = setup();
  act(world, {type: 'classPick', classId: 'ronin'});
  act(world, {type: 'classTest', op: 'level', n: 39});
  assert.equal(p.level, 40);
  act(world, {type: 'classTest', op: 'toggle', key: 'hold'});
  act(world, {type: 'classTest', op: 'toggle', key: 'god'});
  world.arena.phase = 'cleared'; world.arena.timer = 0;
  // Learn branch by branch in tier order until the points run out (40 points, more than 40 ranks on offer).
  const def = CLASSES.ronin, order = Object.entries(def.nodes).sort((a, b) => a[1].tier-b[1].tier);
  for(let pass = 0; pass < 4; pass++) for(const [id, node] of order) for(let r = 0; r < node.max; r++) act(world, {type: 'classTalent', op: 'learn', node: id});
  assert.equal(pointsFree(p), 0);
  assert.ok(pointsSpent(p) === 40);
  // Max the ones the combos below need, then fill the bar with the rest of the skills.
  p.talents = Object.fromEntries(Object.entries(def.nodes).map(([id, n]) => [id, n.max]));
  world.tick(.05);
  assert.equal(p.kataMods.maxCuts, 8);
  assert.ok(p.kataMods.hang > 60, 'Endless Line');
  p.x = 0; p.z = 0; p.dx = 1; p.dz = 0;
  const foes = Array.from({length: 8}, (_, i) => foe(world, Math.cos(i/8*Math.PI*2)*3+1, Math.sin(i/8*Math.PI*2)*3, 20000));
  act(world, {type: 'classTest', op: 'toggle', key: 'freeSkills'});
  const types = new Set();
  const run = (world, secs) => {for(let t = 0; t < secs-1e-9; t += .05){world.tick(.05); for(const ev of world.events) types.add(ev.type);}};
  const cast = id => {p.classGcd = 0; const r = act(world, {type: 'classSkill', skill: id}); run(world, .35); return r;};
  for(const id of ['utsushi', 'kesagiri', 'chirizakura', 'tsubame', 'hikiyose']) assert.equal(cast(id).ok, true, id);
  for(let i = 0; i < 3; i++){p.cooldown = 0; world.attack(p); run(world, .1);}
  assert.ok(hangingCuts(world, p).some(c => c.tag === 'echo'), 'Shadow Echo laid twins');
  run(world, .5);
  for(const id of ['kesagiri', 'chirizakura']) cast(id);
  assert.equal(cast('noto').ok, true);
  assert.equal(cast('kage-fumi').ok, true);
  p.dash = 0; world.dodge(p); run(world, .5);
  assert.ok(hangingCuts(world, p).some(c => c.tag === 'after'), 'Afterimage');
  run(world, 1.2);
  for(const type of ['roninecho', 'roninkesa', 'roninblossom', 'roninreturn', 'roninlure', 'roninsheath', 'ronincrux', 'roninpetals', 'roninreturned', 'roninstep'])
    assert.ok(types.has(type), `${type} fired`);
  assert.ok(foes.some(e => e.dot?.kind === 'bleed'), 'Petal Wounds');
  assert.ok(foes.every(e => e.hp < 20000), 'everything was cut');
  // The ultimate, then a clean slate.
  assert.equal(act(world, {type: 'skill'}).ok, true);
  run(world, 3);
  act(world, {type: 'classTest', op: 'clear'});
  run(world, .2);
  assert.equal(world.enemies.length, 0);
  assert.equal(p.ronin.step, null);
  assert.equal(p.ronin.pulls.length, 0);
  assert.ok(Number.isFinite(p.ki) && p.ki >= 0 && p.ki <= RONIN.kiMax);
  // Levelling down refunds the points.
  act(world, {type: 'classTest', op: 'level', n: -10});
  assert.equal(p.level, 30);
  assert.equal(pointsSpent(p), 0);
});

test('talent and skill commands only reach the class’s own talents', () => {
  const {world, p} = setup();
  act(world, {type: 'classPick', classId: 'ronin'});
  for(const id of ['toString', '__proto__', 'constructor', 'hasOwnProperty']){
    assert.equal(act(world, {type: 'classTalent', op: 'learn', node: id}).ok, false, id);
    assert.equal(act(world, {type: 'classSkill', skill: id}).ok, false, id);
  }
  assert.equal(pointsSpent(p), 0);
  assert.equal(pointsFree(p), 1);
});
