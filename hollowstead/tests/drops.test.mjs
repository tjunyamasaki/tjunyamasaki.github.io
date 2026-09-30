import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {DROP_LIFETIME_SECONDS, SPILL_LIFETIME_SECONDS} from '../src/contracts.mjs';
import {dropGlow, dropLifetime} from '../src/drops.mjs';
import {RARITY_COLORS, rarityOf} from '../src/progression.mjs';

test('epic and legendary loot glows by rarity and lasts five minutes, preserving longer spills', () => {
  const w=new World(17); w.addPlayer('host'); w.start();
  for (const itemId of ['wood','sword','skullstaff','scythe']) {
    const valuable=['epic','legendary'].includes(rarityOf(itemId));
    w.dropNew(itemId,1,20,20); const drop=w.drops.at(-1);
    assert.equal(drop.until-w.time,valuable?300:DROP_LIFETIME_SECONDS);
    assert.equal(dropGlow(drop),valuable?RARITY_COLORS[rarityOf(itemId)]:null);
    assert.equal(dropLifetime(itemId,SPILL_LIFETIME_SECONDS),SPILL_LIFETIME_SECONDS);
  }
  assert.equal(rarityOf('skullstaff'),'epic');
  assert.equal(rarityOf('scythe'),'legendary');
  assert.equal(dropGlow(null),null);
  const saved=World.restore(structuredClone(w.snapshot()));
  assert.deepEqual(saved.drops.map(d=>d.until),w.drops.map(d=>d.until));
  const rareIds=w.drops.filter(d=>dropGlow(d)).map(d=>d.id);
  w.time=299; w.tick(.05);
  assert.ok(rareIds.every(id=>w.drops.some(d=>d.id===id)));
  w.time=300; w.tick(.05);
  assert.ok(rareIds.every(id=>!w.drops.some(d=>d.id===id)));
});
