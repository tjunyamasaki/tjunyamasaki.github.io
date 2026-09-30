import test from 'node:test';
import assert from 'node:assert/strict';
import {RARITY_COLORS, rarityOf} from '../src/progression.mjs';
import {beaconPhase, beaconStrength, dropRim, dropSticker, lootBeacon} from '../src/drop-art.mjs';

test('dropped items get a cream rim when common and their rarity colour otherwise', () => {
  assert.equal(rarityOf('wood'), 'common');
  assert.equal(dropRim('wood'), '#f3ead2');
  for(const id of ['shard', 'skullstaff', 'scythe'])
    assert.equal(dropRim(id), RARITY_COLORS[rarityOf(id)], id);
});

test('only epic and legendary loot raise a beacon, legendary the taller one', () => {
  assert.equal(lootBeacon('wood'), null);
  assert.equal(lootBeacon('shard'), null);
  const epic = lootBeacon('skullstaff'), legendary = lootBeacon('scythe');
  assert.equal(epic.color, RARITY_COLORS.epic);
  assert.equal(legendary.color, RARITY_COLORS.legendary);
  assert.ok(legendary.height > epic.height && legendary.motes >= epic.motes);
});

test('the beacon stays clearly visible in daylight, brighter at night, and fades with the expiry blink', () => {
  for(let clock = 0; clock < 6; clock += .25){
    const day = beaconStrength(0, clock), night = beaconStrength(1, clock);
    assert.ok(day >= .5, `day ${day}`);
    assert.ok(night > day);
    assert.ok(beaconStrength(0, clock, 0, .3) < day);
  }
});

test('beacon ripple and motes stay in range', () => {
  const b = lootBeacon('scythe');
  for(let clock = 0; clock < 10; clock += .37){
    const {ripple, motes} = beaconPhase(b, clock, 3.2);
    assert.ok(ripple >= 0 && ripple < 1);
    assert.equal(motes.length, b.motes);
    for(const m of motes) assert.ok(m.t >= 0 && m.t < 1 && m.alpha >= 0 && m.alpha <= 1);
  }
});

test('without a DOM the sticker is simply not ready yet', () => {
  assert.equal(dropSticker({sprites: {}}, 'wood', 'wood'), null);
});
