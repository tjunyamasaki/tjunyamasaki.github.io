import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {loadMagicModules} from '../src/magic/load.mjs?v=harvest-18';
import {FOXFIRE, step, use} from '../src/magic/kitsune-lantern.mjs?v=harvest-18';
import {powerOf} from '../src/progression.mjs?v=harvest-18';
import {stepSkills, useSkill} from '../src/skills.mjs?v=harvest-18';

await loadMagicModules();
const PACK = 'kitsune-lantern';

function setup(){
  const world = new World(56, {arena: true});
  const p = world.addPlayer('host', 'Fox');
  world.start();
  p.x = p.z = 0; p.dx = 1; p.dz = 0;
  world.grantEquipped(p, PACK);
  return {world, p};
}

function cast(world, p){
  const before = world.magicBolts?.length || 0;
  p.cooldown = 0;
  world.attack(p);
  return world.magicBolts.slice(before);
}

test('basic volleys repeat three, six, nine; only the full volley has a burst finisher', () => {
  const {world, p} = setup();
  for(const count of [3, 6, 9, 3]){
    const bolts = cast(world, p), effect = world.magicCasts.at(-1);
    assert.equal(bolts.length, count);
    assert.equal(effect.volleyCount, count);
    assert.equal(bolts[0].tailIndex, 0);
    assert.equal(bolts.at(-1).tailIndex, 8, 'small volleys still span the full tail fan');
    assert.deepEqual(effect.tailIndices, bolts.map(b => b.tailIndex));
    assert.equal(bolts.filter(b => b.burst).length, count === 9 ? 1 : 0);
    assert.equal(bolts.at(-1).damage, FOXFIRE.damage*(count === 9 ? 2 : 1));
    const previousBursts = world.events.filter(e => e.type === 'foxburst').length;
    step(world, FOXFIRE.life+.1);
    assert.equal(world.magicBolts.length, 0, 'misses expire');
    assert.equal(world.events.filter(e => e.type === 'foxburst').length-previousBursts, count === 9 ? 1 : 0);
    assert.equal(world.magicPuffs.filter(e => e.burst).length, count === 9 ? 1 : 0);
  }
});

test('rejected basic casts leave the sequence unchanged', () => {
  const {world, p} = setup();
  cast(world, p);
  const rejected = [
    {cooldown: .8}, {down: 1}, {ghost: true}, {online: false}, {x: NaN},
  ];
  for(const overrides of rejected){
    const values = Object.fromEntries(Object.keys(overrides).map(key => [key, p[key]]));
    p.cooldown = 0;
    Object.assign(p, overrides);
    assert.equal(use(world, p), null);
    assert.equal(p.kitsuneVolley, 1);
    assert.equal(world.magicBolts.length, 3);
    Object.assign(p, values);
  }
  p.cooldown = 0;
  p.equipment.weapon.durability = 0;
  assert.equal(use(world, p), null);
  p.equipment.weapon.durability = 100;
  world.arena = null; p.stamina = 0;
  world.attack(p);
  assert.equal(p.kitsuneVolley, 1, 'the engine rejects insufficient stamina before use');
  assert.equal(world.magicBolts.length, 3);
});

test('players keep independent cycles and foxfire power remains captured at cast time', () => {
  const {world, p} = setup();
  const friend = world.addPlayer('friend', 'Other fox');
  world.grantEquipped(friend, PACK);
  p.level = 4; p.ranks[PACK] = 3;
  const power = powerOf(p), bolts = cast(world, p);
  p.level = 1; p.ranks[PACK] = 1;
  assert.ok(bolts.every(b => b.power === power && b.damage === FOXFIRE.damage*power));
  assert.equal(cast(world, p).length, 6);
  assert.equal(cast(world, friend).length, 3);
  assert.equal(p.kitsuneVolley, 2);
  assert.equal(friend.kitsuneVolley, 1);
});

test('save and network round trips resume the basic sequence and preserve in-flight burst flags', () => {
  const {world, p} = setup();
  cast(world, p); cast(world, p);
  for(const purpose of ['save', 'network']){
    const data = JSON.parse(JSON.stringify(world.snapshot({purpose})));
    const restored = purpose === 'save' ? World.fromSave({world: data}) : World.restore(data);
    const owner = restored.player(p.id);
    assert.equal(owner.kitsuneVolley, 2);
    assert.ok(restored.magicBolts.every(b => b.burst === false));
    assert.equal(cast(restored, owner).length, 9);
    assert.equal(cast(restored, owner).length, 3);
  }
  const old = JSON.parse(JSON.stringify(world.snapshot()));
  delete old.players[0].kitsuneVolley;
  const restored = World.restore(old);
  assert.equal(cast(restored, restored.player(p.id)).length, 3, 'older saves begin at three');
});

test('Kitsune Parade still emits three rings of nine without advancing the basic cycle', () => {
  const {world, p} = setup();
  cast(world, p);
  world.magicBolts = []; world.magicCasts = [];
  assert.equal(useSkill(world, p).ok, true);
  stepSkills(world, .9);
  assert.equal(world.magicBolts.length, 27);
  assert.equal(world.magicCasts.length, 3);
  assert.equal(world.magicBolts.filter(b => b.tailIndex === 8).length, 3);
  assert.equal(p.kitsuneVolley, 1);
  assert.equal(cast(world, p).length, 6);
  step(world, FOXFIRE.life+.1);
  assert.equal(world.events.filter(e => e.type === 'foxburst').length, 3, 'only the skill rings burst');
});
