import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MICRO_PER_GLOW, THROW_COOLDOWN_MS } from '../src/core/balance.mjs';
import {
  applyPostMigrationProgression,
  migrateV1,
} from '../src/core/migrate.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';
import {
  createFreshEnvelope,
  serializeEnvelope,
  validateSave,
} from '../src/core/validate.mjs';
import { reconcileAway } from '../src/persistence/reconcile.mjs';
import { getResidentCapacity } from '../src/core/selectors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');
const fixturesDir = join(here, 'fixtures');

const HOUR_MS = 3_600_000;

/**
 * @param {string} name
 */
function readFixture(name) {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

/**
 * @param {string} name
 */
function parseLegacy(name) {
  const parsed = validateSave(readFixture(name));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.kind, 'legacy-v1');
  return parsed.save;
}

describe('migrateV1', () => {
  test('fresh v1 plus 1 hour earns 360 Glow and does not add a second resident', () => {
    const legacy = parseLegacy('v1-fresh.json');
    const now = legacy.savedWallMs + HOUR_MS;
    const result = migrateV1(legacy, now);
    assert.equal(result.summary.glowEarnedMicro, 360 * MICRO_PER_GLOW);
    assert.equal(result.summary.awayMs, HOUR_MS);
    assert.equal(result.save.schemaVersion, 2);
    assert.equal(result.save.balanceVersion, 2);
    assert.equal(result.save.state.habitatId, 'farm-v2');
    assert.equal(result.save.state.glowMicro, 360 * MICRO_PER_GLOW);
    assert.equal(result.save.state.slimes.length, 1);
    assert.equal(result.save.state.world.foods.length, 0);
    assert.equal(result.save.state.world.timeMs, 0);
    assert.equal(result.save.state.world.carryMs, 0);
    assert.deepEqual(result.save.state.world.residents[0].position, { x: 0, z: 2 });
    const parsed = validateSave(serializeEnvelope(result.save));
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.kind, 'current');
  });

  test('remaining 4000 feed cooldown clamps to throw remaining ≤ 1000', () => {
    const legacy = parseLegacy('v1-cooldown-in-progress.json');
    const result = migrateV1(legacy, legacy.savedWallMs);
    const remaining =
      result.save.state.nextThrowAllowedAtMs - result.save.state.simTimeMs;
    assert.ok(remaining <= THROW_COOLDOWN_MS);
    assert.equal(remaining, THROW_COOLDOWN_MS);
    assert.equal(result.save.state.nextFeedAllowedAtMs, result.save.state.nextThrowAllowedAtMs);
  });

  test('six residents and beds 4 stay six / capacity 6', () => {
    const legacy = parseLegacy('v1-six-resident-beds4.json');
    const result = migrateV1(legacy, legacy.savedWallMs);
    assert.equal(result.save.state.slimes.length, 6);
    assert.equal(result.save.state.upgrades.beds, 4);
    assert.equal(getResidentCapacity(result.save.state), 6);
    assert.equal(result.save.state.world.residents.length, 6);
  });

  test('Welcome-ready v1 one-hour absence earns 360 Glow then joins at simTime 3_600_000', () => {
    const fresh = parseLegacy('v1-fresh.json');
    const patched = {
      ...fresh,
      state: {
        ...fresh.state,
        totalFeeds: 6,
        lifetimeGlowMicro: 11_900_000,
        glowMicro: 0,
        incomeRemainder: 0,
        slimes: [{ ...fresh.state.slimes[0], feedCount: 6 }],
      },
    };
    const parsed = validateSave(serializeEnvelope(patched));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, 'legacy-v1');
    const now = parsed.save.savedWallMs + HOUR_MS;
    const result = migrateV1(parsed.save, now);
    assert.equal(result.summary.glowEarnedMicro, 360 * MICRO_PER_GLOW);
    assert.equal(result.save.state.glowMicro, 360 * MICRO_PER_GLOW);
    assert.equal(
      result.save.state.lifetimeGlowMicro,
      11_900_000 + 360 * MICRO_PER_GLOW,
    );
    assert.equal(result.save.state.simTimeMs, HOUR_MS);
    assert.equal(result.save.state.slimes.length, 2);
    assert.equal(result.save.state.slimes[1].id, 'slime-2');
    assert.equal(result.save.state.slimes[1].createdAtMs, HOUR_MS);
    assert.notEqual(result.save.state.slimes[1].createdAtMs, 1_000);
    assert.equal(result.save.state.world.timeMs, 0);
    assert.equal(result.save.state.world.carryMs, 0);
    assert.deepEqual(result.save.state.world.foods, []);
    assert.equal(result.save.state.world.residents.length, 2);
    assert.deepEqual(result.summary.companionsAdded, ['slime-2']);
    assert.equal(result.save.state.totalFeeds, 6);
  });

  test('byte-independent round-trip preserves ids, counters, and settings', () => {
    const parsed = validateSave(readFixture('v1-three-resident.json'));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    parsed.save.settings.soundEnabled = true;
    parsed.save.settings.quality = 'high';
    const ids = parsed.save.state.slimes.map((slime) => slime.id);
    const feeds = parsed.save.state.totalFeeds;
    const names = parsed.save.state.slimes.map((slime) => slime.name);
    const result = migrateV1(parsed.save, parsed.save.savedWallMs);
    const round = validateSave(serializeEnvelope(result.save));
    assert.equal(round.ok, true);
    if (!round.ok) return;
    assert.equal(round.kind, 'current');
    assert.deepEqual(
      round.save.state.slimes.map((slime) => slime.id),
      ids,
    );
    assert.deepEqual(
      round.save.state.slimes.map((slime) => slime.name),
      names,
    );
    assert.equal(round.save.state.totalFeeds, feeds);
    assert.equal(round.save.settings.soundEnabled, true);
    assert.equal(round.save.settings.quality, 'high');
    assert.equal(round.save.state.upgrades.beds, parsed.save.state.upgrades.beds);
  });

  test('applyPostMigrationProgression is identity for a fresh farm and joins a Welcome-ready state', () => {
    const state = createInitialState();
    const progressed = applyPostMigrationProgression(state);
    assert.equal(progressed.events.length, 0);
    assert.equal(progressed.state.slimes.length, 1);
    assert.notEqual(progressed.state, state);
    assert.equal(state.slimes.length, 1);

    const ready = cloneState(createInitialState());
    ready.totalFeeds = 6;
    ready.lifetimeGlowMicro = 12 * MICRO_PER_GLOW;
    ready.glowMicro = 12 * MICRO_PER_GLOW;
    ready.slimes[0].feedCount = 6;
    const joined = applyPostMigrationProgression(ready);
    assert.equal(joined.state.slimes.length, 2);
    assert.equal(joined.state.slimes[1].id, 'slime-2');
    assert.equal(joined.state.slimes[1].createdAtMs, 0);
    assert.equal(joined.state.world.residents.length, 2);
    assert.ok(joined.events.some((event) => event.type === 'COMPANION_ADDED'));
    assert.equal(ready.slimes.length, 1);
  });

  test('reconcileAway on a v1 checkpoint migrates once without double-credit', () => {
    const legacy = parseLegacy('v1-fresh.json');
    const now = legacy.savedWallMs + HOUR_MS;
    const first = reconcileAway(legacy, now);
    assert.equal(first.save.schemaVersion, 2);
    assert.equal(first.summary.glowEarnedMicro, 360 * MICRO_PER_GLOW);
    const second = reconcileAway(first.save, now);
    assert.equal(second.summary.glowEarnedMicro, 0);
    assert.equal(second.save.state.glowMicro, 360 * MICRO_PER_GLOW);
    assert.equal(second.save.state.slimes.length, 1);
  });
});

describe('native v2 reconcileAway', () => {
  test('freezes world time, carry, and foods while crediting economy', () => {
    const save = createFreshEnvelope({
      nowWallMs: 2_000_000_000_000 - HOUR_MS,
      revision: 1,
    });
    save.state.world.timeMs = 150;
    save.state.world.carryMs = 12;
    const result = reconcileAway(save, 2_000_000_000_000);
    assert.equal(result.summary.glowEarnedMicro, 360 * MICRO_PER_GLOW);
    assert.equal(result.save.state.world.timeMs, 150);
    assert.equal(result.save.state.world.carryMs, 12);
    assert.deepEqual(result.save.state.world.foods, []);
    assert.equal(result.save.schemaVersion, 2);
  });
});

describe('migrate module isolation', () => {
  test('migrate.mjs does not import DOM, Three, Date, or randomness', () => {
    const source = readFileSync(join(coreDir, 'migrate.mjs'), 'utf8');
    const forbidden = [
      /\bdocument\b/,
      /\bwindow\b/,
      /\blocalStorage\b/,
      /from\s+['"][^'"]*three/i,
      /performance\s*\./,
      /\bDate\s*\./,
      /Math\s*\.\s*random/,
    ];
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `migrate.mjs must not contain ${pattern}`,
      );
    }
    assert.equal(/advanceEconomy/.test(source), true);
    assert.equal(/import\s*\{\s*advance\s*\}/.test(source), false);
    assert.equal(/import\s*\{\s*advancePassive/.test(source), false);
  });
});
