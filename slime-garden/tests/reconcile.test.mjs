import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MICRO_PER_GLOW, OFFLINE_CAP_MS } from '../src/core/balance.mjs';
import { applyCommand } from '../src/core/commands.mjs';
import { createInitialState } from '../src/core/state.mjs';
import { createFreshEnvelope } from '../src/core/validate.mjs';
import { reconcileAway } from '../src/persistence/reconcile.mjs';
import {
  createMemoryStorage,
  writeCheckpoint,
} from '../src/persistence/save-store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const persistDir = join(here, '../src/persistence');

const HOUR_MS = 3_600_000;
const TEN_HOURS_MS = 10 * HOUR_MS;

/**
 * @param {unknown} value
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}

describe('reconcileAway', () => {
  test('repeated reload does not double-credit; +10s earns exactly 1 Glow', () => {
    const now = 2_000_000_000_000;
    const save = createFreshEnvelope({ nowWallMs: now - HOUR_MS, revision: 0 });
    const first = reconcileAway(save, now);
    assert.equal(first.summary.glowEarnedMicro, 360 * MICRO_PER_GLOW);
    assert.equal(first.summary.awayMs, HOUR_MS);
    assert.equal(first.summary.creditedMs, HOUR_MS);
    assert.equal(first.summary.capped, false);
    assert.equal(first.summary.clockWentBackward, false);
    assert.equal(first.save.revision, 0);
    assert.equal(first.save.savedWallMs, now);
    assert.equal(first.save.state.simTimeMs, HOUR_MS);
    assert.equal(first.save.state.berries, 12);
    assert.equal(first.save.state.nextBerryAtMs, null);

    const storage = createMemoryStorage();
    const installed = writeCheckpoint(storage, first.save);
    assert.equal(installed.saved, true);
    assert.ok(installed.envelope);

    const second = reconcileAway(installed.envelope, now);
    assert.equal(second.summary.glowEarnedMicro, 0);
    assert.equal(second.summary.berriesGained, 0);
    assert.equal(second.summary.awayMs, 0);
    assert.equal(second.save.state.glowMicro, 360 * MICRO_PER_GLOW);

    const plusTen = reconcileAway(second.save, now + 10_000);
    assert.equal(plusTen.summary.glowEarnedMicro, 1 * MICRO_PER_GLOW);
    assert.equal(plusTen.summary.awayMs, 10_000);
    assert.equal(plusTen.save.state.glowMicro, 361 * MICRO_PER_GLOW);
    assert.equal(plusTen.save.state.slimes.length, 1);
  });

  test('ten-hour absence credits eight hours, jumps sim time ten hours, stays at one resident', () => {
    const now = 2_000_000_000_000;
    const save = createFreshEnvelope({ nowWallMs: now - TEN_HOURS_MS, revision: 3 });
    const result = reconcileAway(save, now);
    assert.equal(result.summary.glowEarnedMicro, 2_880 * MICRO_PER_GLOW);
    assert.equal(result.summary.creditedMs, OFFLINE_CAP_MS);
    assert.equal(result.summary.awayMs, TEN_HOURS_MS);
    assert.equal(result.summary.capped, true);
    assert.equal(result.summary.clockWentBackward, false);
    assert.equal(result.save.state.simTimeMs, TEN_HOURS_MS);
    assert.notEqual(result.save.state.simTimeMs, OFFLINE_CAP_MS);
    assert.equal(result.save.state.berries, 12);
    assert.equal(result.save.state.nextBerryAtMs, null);
    assert.equal(result.save.state.slimes.length, 1);
    assert.equal(result.save.revision, 3);
    assert.equal(result.save.savedWallMs, now);
    assert.equal('events' in result, false);
  });

  test('backward clock grants nothing, rebases, then a later minute earns normally', () => {
    const now = 2_000_000_000_000;
    const state = createInitialState();
    state.glowMicro = 5 * MICRO_PER_GLOW;
    state.lifetimeGlowMicro = 5 * MICRO_PER_GLOW;
    const save = createFreshEnvelope({
      nowWallMs: now + 60_000,
      revision: 4,
      state,
    });
    const backward = reconcileAway(save, now);
    assert.equal(backward.summary.clockWentBackward, true);
    assert.equal(backward.summary.glowEarnedMicro, 0);
    assert.equal(backward.summary.awayMs, 0);
    assert.equal(backward.summary.creditedMs, 0);
    assert.equal(backward.summary.capped, false);
    assert.equal(backward.save.state.glowMicro, 5 * MICRO_PER_GLOW);
    assert.equal(backward.save.state.lifetimeGlowMicro, 5 * MICRO_PER_GLOW);
    assert.equal(backward.save.state.berries, 6);
    assert.equal(backward.save.state.simTimeMs, 0);
    assert.equal(backward.save.savedWallMs, now);
    assert.equal(backward.save.revision, 4);

    const later = reconcileAway(backward.save, now + 60_000);
    assert.equal(later.summary.clockWentBackward, false);
    assert.equal(later.summary.glowEarnedMicro, 6 * MICRO_PER_GLOW);
    assert.equal(later.save.state.glowMicro, 11 * MICRO_PER_GLOW);
    assert.equal(later.save.state.simTimeMs, 60_000);
  });

  test('feed-shaped 120s boost then 1h away earns 372 Glow at the actual expiry boundary', () => {
    const now = 2_000_000_000_000;
    const fed = applyCommand(createInitialState(), {
      type: 'FEED',
      slimeId: 'slime-1',
    });
    assert.equal(fed.ok, true);
    assert.equal(fed.state.slimes[0].boostUntilMs, 120_000);
    const save = createFreshEnvelope({
      nowWallMs: now - HOUR_MS,
      revision: 1,
      state: fed.state,
    });
    const result = reconcileAway(save, now);
    assert.equal(result.summary.glowEarnedMicro, 372 * MICRO_PER_GLOW);
    assert.equal(result.save.state.simTimeMs, HOUR_MS);
    assert.ok(result.save.state.slimes[0].boostUntilMs <= result.save.state.simTimeMs);
  });

  test('does not mutate a frozen input save', () => {
    const now = 2_000_000_000_000;
    const save = createFreshEnvelope({ nowWallMs: now - HOUR_MS, revision: 2 });
    const snapshot = structuredClone(save);
    deepFreeze(save);
    const result = reconcileAway(save, now);
    assert.deepEqual(save, snapshot);
    assert.equal(result.summary.glowEarnedMicro, 360 * MICRO_PER_GLOW);
    assert.notEqual(result.save, save);
    assert.equal(save.savedWallMs, now - HOUR_MS);
    assert.equal(save.state.glowMicro, 0);
  });
});

describe('reconcile module isolation', () => {
  test('reconcile.mjs does not import Date, DOM, Three, or randomness', () => {
    const source = readFileSync(join(persistDir, 'reconcile.mjs'), 'utf8');
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
        `reconcile.mjs must not contain ${pattern}`,
      );
    }
  });
});
