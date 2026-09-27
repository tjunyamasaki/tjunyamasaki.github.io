import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/engine.mjs';
import {ENEMIES, FIRST_MOB, PICKUP, RULES, SPEED_SCALE} from '../src/content.mjs';
import {ALLIES, DASH, WEAPON_STYLES} from '../src/progression.mjs';
import {ATTACKS} from '../src/mobs.mjs?v=harvest-17';
import {countItem} from '../src/inventory.mjs';

const T = RULES.tick;
function camp(){
  const w = new World(402); const p = w.addPlayer('host', 'Jun'); w.start();
  w.ambient = false; w.enemies = []; p.x = 0; p.z = 0; p.dx = 1; p.dz = 0;
  return {w, p};
}
function sim(w, seconds, input = {x: 0, z: 0}){
  let left = seconds;
  while(left > 1e-8){
    const dt = Math.min(T, left);
    for(const p of w.players) if(p.online) w.input(p.id, input);
    w.tick(dt);
    left -= dt;
  }
}

test('dodge holds at most two charges and each spent charge returns after 10s', () => {
  const {w, p} = camp();
  assert.equal(DASH.charges, 2);
  assert.equal(DASH.recharge, 10);
  assert.equal(p.dashCharges, 2);
  w.input(p.id, {x: 1, z: 0});
  assert.equal(w.action(p.id, {type: 'dash'}).ok, true);
  assert.equal(p.dashCharges, 1);
  assert.equal(p.dashRecharge.length, 1);
  assert.ok(Math.abs(p.dashRecharge[0] - 10) < 1e-6);
  sim(w, 1);
  assert.equal(w.action(p.id, {type: 'dash'}).ok, true);
  assert.equal(p.dashCharges, 0);
  assert.equal(p.dashRecharge.length, 2);
  assert.equal(w.action(p.id, {type: 'dash'}).ok, false);
  sim(w, 8.9);
  assert.equal(p.dashCharges, 0);
  assert.equal(w.action(p.id, {type: 'dash'}).ok, false);
  sim(w, 0.2);
  assert.equal(p.dashCharges, 1);
  sim(w, 1);
  assert.equal(p.dashCharges, 2);
  assert.equal(p.dashRecharge.length, 0);
  w.action(p.id, {type: 'dash'});
  sim(w, 10);
  assert.equal(p.dashCharges, 2, 'charges do not stack above two');
});

test('hunger decays about 20% faster than the old 0.075 / 0.45 rates', () => {
  assert.equal(RULES.hunger, 0.075 * 1.2);
  assert.equal(RULES.hungerRest, 0.45 * 1.2);
  const {w, p} = camp();
  p.hunger = 100;
  sim(w, 1);
  assert.ok(Math.abs(p.hunger - (100 - RULES.hunger)) < 1e-6);
  const rest = camp();
  rest.p.hunger = 80;
  rest.p.rest = true;
  rest.w.buildings[0].fuel = 120;
  sim(rest.w, 1);
  assert.ok(Math.abs(rest.p.hunger - (80 - RULES.hungerRest)) < 1e-6);
});

test('global movement and projectile speeds are 15% faster; the first mob outruns the player', () => {
  assert.equal(SPEED_SCALE, 1.15);
  assert.equal(FIRST_MOB, 'crawler');
  assert.equal(RULES.speed, 4.2 * SPEED_SCALE);
  assert.equal(ENEMIES.wraith.speed, 2.7 * SPEED_SCALE);
  assert.equal(ENEMIES.brute.speed, 1.35 * SPEED_SCALE);
  assert.equal(ENEMIES.king.speed, 1.35 * SPEED_SCALE);
  assert.equal(ENEMIES.bonewalker.speed, 2.5 * SPEED_SCALE);
  assert.equal(ENEMIES.bogling.speed, 1.8 * SPEED_SCALE);
  assert.equal(ENEMIES.golem.speed, 1.05 * SPEED_SCALE);
  assert.equal(WEAPON_STYLES.recurve.speed, 18 * SPEED_SCALE);
  assert.equal(WEAPON_STYLES.bonebow.speed, 21 * SPEED_SCALE);
  assert.equal(WEAPON_STYLES.crookstaff.speed, 12 * SPEED_SCALE);
  assert.equal(WEAPON_STYLES.wisplantern.speed, 9 * SPEED_SCALE);
  assert.equal(ATTACKS.orb.speed, 5.4 * SPEED_SCALE);
  assert.equal(ATTACKS.charge.speed, 15 * SPEED_SCALE);
  assert.equal(ATTACKS.kingNova.speed, 4.6 * SPEED_SCALE);
  assert.equal(ALLIES.crow.speed, 7 * SPEED_SCALE);
  assert.equal(DASH.distance / DASH.time, (3.4 / 0.18) * SPEED_SCALE);
  const first = ENEMIES[FIRST_MOB];
  assert.ok(first.speed > RULES.speed * 1.10, 'briarling is clearly faster than the wanderer');
  assert.ok(first.speed < RULES.speed * 1.16, 'but not a huge gap');

  const {w, p} = camp();
  w.input(p.id, {x: 1, z: 0});
  const start = {x: p.x, z: p.z};
  w.tick(T);
  assert.ok(Math.abs(Math.hypot(p.x - start.x, p.z - start.z) - RULES.speed * T) < 1e-6);

  p.equipment.weapon = null;
  w.grantEquipped(p, 'recurve');
  p.cooldown = 0; p.stamina = 100;
  const mark = w.spawnEnemy('brute', 8, 0, {elite: false}); mark.hp = mark.maxHp = 1e5; mark.vx = 0; mark.vz = 0;
  w.attack(p);
  const shot = w.projectiles[0];
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vz) - WEAPON_STYLES.recurve.speed) < 1e-6);
});

test('a dropper cannot pick their pile up for 15s; anyone else can at once', () => {
  const {w, p} = camp();
  w.clearPack(p);
  const kept = w.mintStack('wood', 2);
  p.inventory.slots[0] = kept;
  w.action(p.id, {type: 'drop', uid: kept.uid, quantity: 2});
  const drop = w.drops.find(entry => entry.stack.uid === kept.uid);
  assert.equal(drop.block.playerId, p.id);
  assert.ok(Math.abs(drop.block.until - (w.time + 15)) < 1e-6);
  assert.equal(PICKUP.dropCooldown, 15);
  p.x = drop.x; p.z = drop.z;
  sim(w, 14.9);
  assert.equal(countItem(p.inventory, 'wood'), 0);
  assert.equal(w.drops.includes(drop), true);
  p.x = drop.x + 8; p.z = drop.z;
  const q = w.addPlayer('guest', 'Moss');
  w.clearPack(q);
  q.x = drop.x; q.z = drop.z;
  sim(w, PICKUP.flight + T * 2);
  assert.equal(countItem(q.inventory, 'wood'), 2);
  assert.equal(countItem(p.inventory, 'wood'), 0);

  const again = camp();
  again.w.clearPack(again.p);
  const pile = again.w.mintStack('stone', 1);
  again.p.inventory.slots[0] = pile;
  again.w.action(again.p.id, {type: 'drop', uid: pile.uid, quantity: 1});
  const loose = again.w.drops.find(entry => entry.stack.uid === pile.uid);
  again.p.x = loose.x; again.p.z = loose.z;
  sim(again.w, 15 + PICKUP.dwell + PICKUP.flight + T);
  assert.equal(countItem(again.p.inventory, 'stone'), 1);
});
