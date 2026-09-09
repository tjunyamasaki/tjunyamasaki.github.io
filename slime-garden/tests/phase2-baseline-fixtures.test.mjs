/**
 * P2-00: frozen v1 / future envelopes must validate as real old saves.
 * Construction uses only test-only constructors (createInitialState,
 * applyCommand, advanceEconomy, createFreshEnvelope / serializeEnvelope).
 * Does not change game behavior or add player-facing debug controls.
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advanceEconomy } from '../src/core/advance.mjs';
import { FEED_BERRY_COST, SLIME_NAMES } from '../src/core/balance.mjs';
import { applyCommand } from '../src/core/commands.mjs';
import {
  getCompanionEligibility,
  getNextUpgradeCostMicro,
} from '../src/core/selectors.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';
import {
  createDefaultSettings,
  serializeEnvelope,
  validateSave,
} from '../src/core/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

/** Frozen wall clock shared by the new v1 fixtures (same epoch as valid-v1.json). */
const V1_WALL_MS = 1_700_000_000_000;
const FUTURE_WALL_MS = 1_800_000_000_000;

const UPGRADE_BUY_ORDER = Object.freeze(
  /** @type {const} */ (['beds', 'shrub', 'pantry', 'bloom']),
);

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {number} elapsedMs
 */
function wait(state, elapsedMs) {
  if (elapsedMs <= 0) return state;
  const result = advanceEconomy(state, elapsedMs);
  return result.state;
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {number} targetMs
 */
function waitUntil(state, targetMs) {
  return wait(state, targetMs - state.simTimeMs);
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {import('../src/core/commands.mjs').Command} command
 */
function mustApply(state, command) {
  const result = applyCommand(state, command);
  if (!result.ok) {
    throw new Error(
      `${command.type} at simTimeMs=${state.simTimeMs} rejected: ${result.reason}`,
    );
  }
  return result.state;
}

/**
 * Legal v1 feed: wait out cooldown and berry regen, then FEED slime-1.
 *
 * @param {import('../src/core/state.mjs').GameState} state
 */
function feedWhenReady(state) {
  let next = state;
  if (next.simTimeMs < next.nextFeedAllowedAtMs) {
    next = waitUntil(next, next.nextFeedAllowedAtMs);
  }
  while (next.berries < FEED_BERRY_COST) {
    if (next.nextBerryAtMs == null) {
      throw new Error(
        `no berries and no regen at simTimeMs=${next.simTimeMs}`,
      );
    }
    if (next.nextBerryAtMs <= next.simTimeMs) {
      throw new Error(
        `berry timer ${next.nextBerryAtMs} did not grant a berry at ${next.simTimeMs}`,
      );
    }
    next = waitUntil(next, next.nextBerryAtMs);
  }
  return mustApply(next, { type: 'FEED', slimeId: 'slime-1' });
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {'beds' | 'shrub' | 'pantry' | 'bloom'} upgradeId
 */
function tryBuy(state, upgradeId) {
  const cost = getNextUpgradeCostMicro(state, upgradeId);
  if (cost == null || state.glowMicro < cost) return { state, bought: false };
  return {
    state: mustApply(state, {
      type: 'BUY_UPGRADE',
      upgradeId,
      expectedLevel: state.upgrades[upgradeId],
    }),
    bought: true,
  };
}

/**
 * Spend wallet on upgrades whenever affordable. Beds first so later companion
 * joins are not blocked by greedy Bloom purchases.
 *
 * @param {import('../src/core/state.mjs').GameState} state
 */
function buyAffordable(state) {
  let next = state;
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of UPGRADE_BUY_ORDER) {
      const result = tryBuy(next, id);
      if (result.bought) {
        next = result.state;
        changed = true;
        break;
      }
    }
  }
  return next;
}

/**
 * Construct the same resident `applyWelcome` used to push. Does not go through
 * the removed WELCOME command (P2-04 rejects it).
 *
 * @param {import('../src/core/state.mjs').GameState} state
 */
function tryWelcome(state) {
  if (!getCompanionEligibility(state).ready) return { state, welcomed: false };
  const next = cloneState(state);
  const n = next.slimes.length + 1;
  const t = next.simTimeMs;
  next.slimes.push({
    id: `slime-${n}`,
    name: SLIME_NAMES[n - 1],
    createdAtMs: t,
    boostUntilMs: 0,
    feedCount: 0,
    homeSlot: n - 1,
  });
  if (!next.tutorialCompleted.includes('welcome')) {
    next.tutorialCompleted.push('welcome');
  }
  return { state: next, welcomed: true };
}

/**
 * Play a legal v1 command/time sequence until `targetPopulation` residents
 * exist, then stop at that join instant (no extra feeds). Time waits use
 * `advanceEconomy` so rebuilds cannot auto-join mid-wait.
 *
 * @param {number} targetPopulation
 */
function playUntilPopulation(targetPopulation) {
  let state = createInitialState();
  let guard = 0;
  while (state.slimes.length < targetPopulation) {
    guard += 1;
    if (guard > 100_000) {
      throw new Error(
        `playUntilPopulation(${targetPopulation}) exceeded step budget at pop ${state.slimes.length}`,
      );
    }
    state = buyAffordable(state);
    if (state.slimes.length >= targetPopulation) {
      break;
    }
    const welcome = tryWelcome(state);
    if (welcome.welcomed) {
      state = welcome.state;
      continue;
    }
    state = feedWhenReady(state);
  }
  return state;
}

/**
 * @param {import('../src/core/validate.mjs').SaveEnvelope} envelope
 */
function prettyEnvelope(envelope) {
  return `${JSON.stringify(JSON.parse(serializeEnvelope(envelope)), null, 2)}\n`;
}

/**
 * @param {object} value
 */
function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function wrapV1Envelope(state, revision) {
  return {
    gameId: 'cozy-slime-mvp',
    schemaVersion: 1,
    balanceVersion: 1,
    revision,
    savedWallMs: V1_WALL_MS,
    settings: createDefaultSettings(),
    state,
  };
}

function buildFreshEnvelope() {
  return wrapV1Envelope(createInitialState(), 0);
}

function buildCooldownEnvelope() {
  const fed = mustApply(createInitialState(), {
    type: 'FEED',
    slimeId: 'slime-1',
  });
  return wrapV1Envelope(fed, 1);
}

function buildThreeResidentEnvelope() {
  return wrapV1Envelope(playUntilPopulation(3), 1);
}

function buildSixResidentBeds4Envelope() {
  return wrapV1Envelope(playUntilPopulation(6), 1);
}

function buildFutureSchema3() {
  return {
    gameId: 'cozy-slime-mvp',
    schemaVersion: 3,
    balanceVersion: 2,
    revision: 9,
    savedWallMs: FUTURE_WALL_MS,
    futureField: 'do-not-migrate',
    settings: {
      soundEnabled: true,
    },
    state: {
      simTimeMs: 0,
      newWalletUnit: 'nano',
    },
  };
}

const FIXTURE_FILES = Object.freeze({
  fresh: 'v1-fresh.json',
  three: 'v1-three-resident.json',
  six: 'v1-six-resident-beds4.json',
  cooldown: 'v1-cooldown-in-progress.json',
  future: 'future-schema3.json',
});

/**
 * @param {string} name
 */
function readFixture(name) {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

if (process.env.WRITE_P2_00_FIXTURES === '1') {
  writeFileSync(join(fixturesDir, FIXTURE_FILES.fresh), prettyEnvelope(buildFreshEnvelope()));
  writeFileSync(
    join(fixturesDir, FIXTURE_FILES.three),
    prettyEnvelope(buildThreeResidentEnvelope()),
  );
  writeFileSync(
    join(fixturesDir, FIXTURE_FILES.six),
    prettyEnvelope(buildSixResidentBeds4Envelope()),
  );
  writeFileSync(
    join(fixturesDir, FIXTURE_FILES.cooldown),
    prettyEnvelope(buildCooldownEnvelope()),
  );
  writeFileSync(join(fixturesDir, FIXTURE_FILES.future), prettyJson(buildFutureSchema3()));
}

describe('P2-00 frozen baseline fixtures', () => {
  test('kept historical fixtures still parse as before', () => {
    const v1 = validateSave(readFixture('valid-v1.json'));
    assert.equal(v1.ok, true);
    if (v1.ok) {
      assert.equal(v1.kind, 'legacy-v1');
      assert.equal(v1.save.schemaVersion, 1);
      assert.equal(v1.save.state.slimes.length, 1);
    }
    const v2 = validateSave(readFixture('schema-v2.json'));
    assert.equal(v2.ok, false);
    assert.equal(v2.reason, 'INVALID_STATE');
  });

  test('v1-fresh.json is a valid schema-1 fresh save', () => {
    const text = readFixture(FIXTURE_FILES.fresh);
    const parsed = validateSave(text);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.kind, 'legacy-v1');
    assert.equal(parsed.save.schemaVersion, 1);
    assert.equal(parsed.save.balanceVersion, 1);
    assert.equal(parsed.save.revision, 0);
    assert.equal(parsed.save.state.slimes.length, 1);
    assert.equal(parsed.save.state.slimes[0].id, 'slime-1');
    assert.equal(parsed.save.state.totalFeeds, 0);
    assert.equal(parsed.save.state.upgrades.beds, 0);
    assert.deepEqual(JSON.parse(text), JSON.parse(prettyEnvelope(buildFreshEnvelope())));
  });

  test('v1-three-resident.json is a legal progressed v1 save', () => {
    const text = readFixture(FIXTURE_FILES.three);
    const parsed = validateSave(text);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.kind, 'legacy-v1');
    assert.equal(parsed.save.schemaVersion, 1);
    assert.equal(parsed.save.state.slimes.length, 3);
    assert.equal(parsed.save.state.slimes[2].id, 'slime-3');
    assert.ok(parsed.save.state.upgrades.beds >= 1);
    assert.ok(parsed.save.state.totalFeeds >= 24);
    assert.deepEqual(
      JSON.parse(text),
      JSON.parse(prettyEnvelope(buildThreeResidentEnvelope())),
    );
  });

  test('v1-six-resident-beds4.json is a legal six-resident beds-4 v1 save', () => {
    const text = readFixture(FIXTURE_FILES.six);
    const parsed = validateSave(text);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.kind, 'legacy-v1');
    assert.equal(parsed.save.schemaVersion, 1);
    assert.equal(parsed.save.state.slimes.length, 6);
    assert.equal(parsed.save.state.upgrades.beds, 4);
    assert.ok(parsed.save.state.totalFeeds >= 200);
    assert.deepEqual(
      parsed.save.state.slimes.map((slime) => slime.homeSlot),
      [0, 1, 2, 3, 4, 5],
    );
    assert.deepEqual(
      JSON.parse(text),
      JSON.parse(prettyEnvelope(buildSixResidentBeds4Envelope())),
    );
  });

  test('v1-cooldown-in-progress.json has nextFeedAllowedAtMs > simTimeMs', () => {
    const text = readFixture(FIXTURE_FILES.cooldown);
    const parsed = validateSave(text);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.kind, 'legacy-v1');
    assert.equal(parsed.save.schemaVersion, 1);
    assert.ok(parsed.save.state.nextFeedAllowedAtMs > parsed.save.state.simTimeMs);
    assert.equal(parsed.save.state.totalFeeds, 1);
    assert.equal(parsed.save.state.berries, 5);
    assert.deepEqual(
      JSON.parse(text),
      JSON.parse(prettyEnvelope(buildCooldownEnvelope())),
    );
  });

  test('future-schema3.json is FUTURE_VERSION under current validateSave', () => {
    const text = readFixture(FIXTURE_FILES.future);
    const parsed = validateSave(text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.reason, 'FUTURE_VERSION');
    const raw = JSON.parse(text);
    assert.equal(raw.schemaVersion, 3);
    assert.deepEqual(raw, buildFutureSchema3());
  });
});
