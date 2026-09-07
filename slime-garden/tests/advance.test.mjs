import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advance } from '../src/core/advance.mjs';
import {
  INCOME_REMAINDER_MOD,
  MAX_GLOW_MICRO,
  OFFLINE_CAP_MS,
  SLIME_NAMES,
} from '../src/core/balance.mjs';
import { getRateMicroPerSecond } from '../src/core/selectors.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');

/**
 * @param {object} [patch]
 */
function makeState(patch = {}) {
  const base = createInitialState();
  return {
    ...base,
    ...patch,
    upgrades: { ...base.upgrades, ...(patch.upgrades ?? {}) },
    slimes: patch.slimes ?? base.slimes.map((slime) => ({ ...slime })),
    tutorialCompleted: patch.tutorialCompleted
      ? [...patch.tutorialCompleted]
      : [...base.tutorialCompleted],
  };
}

/**
 * Feed-at-zero fixture: berries 5, 2× until 120_000, cooldown 4_000.
 * Built by patching; applyCommand does not exist yet.
 *
 * @param {object} [patch]
 */
function makeFedAtZero(patch = {}) {
  const base = createInitialState();
  return makeState({
    berries: 5,
    nextBerryAtMs: 15_000,
    nextFeedAllowedAtMs: 4_000,
    totalFeeds: 1,
    slimes: [
      {
        ...base.slimes[0],
        boostUntilMs: 120_000,
        feedCount: 1,
      },
    ],
    ...patch,
  });
}

/**
 * @param {number} count
 * @param {(index: number) => Partial<import('../src/core/state.mjs').SlimeState>} [perSlime]
 */
function makeSlimes(count, perSlime) {
  return Array.from({ length: count }, (_, index) => ({
    id: `slime-${index + 1}`,
    name: SLIME_NAMES[index],
    createdAtMs: 0,
    boostUntilMs: 0,
    feedCount: 0,
    homeSlot: index,
    ...(perSlime ? perSlime(index) : {}),
  }));
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}

/**
 * Seeded test-only RNG. Production advance stays nonrandom.
 * @param {number} seed
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Integer chunk sizes that sum to `total`.
 * @param {() => number} rng
 * @param {number} total
 * @param {number} parts
 */
function randomChunks(rng, total, parts) {
  const cuts = [];
  for (let i = 0; i < parts - 1; i += 1) {
    cuts.push(Math.floor(rng() * (total + 1)));
  }
  cuts.sort((a, b) => a - b);
  const chunks = [];
  let prev = 0;
  for (const cut of cuts) {
    chunks.push(cut - prev);
    prev = cut;
  }
  chunks.push(total - prev);
  return chunks;
}

/**
 * @param {import('../src/core/state.mjs').GameState} state
 * @param {number[]} chunks
 */
function advanceByChunks(state, chunks) {
  let current = state;
  for (const dt of chunks) {
    current = advance(current, dt).state;
  }
  return current;
}

describe('advance argument checks', () => {
  test('rejects non-object state, non-integer, negative, above cap, and NaN', () => {
    const fresh = createInitialState();
    assert.throws(() => advance(null, 0), TypeError);
    assert.throws(() => advance(undefined, 0), TypeError);
    assert.throws(() => advance(1, 0), TypeError);
    assert.throws(() => advance('state', 0), TypeError);
    assert.throws(() => advance([], 0), TypeError);
    assert.throws(() => advance(fresh, NaN), TypeError);
    assert.throws(() => advance(fresh, '1'), TypeError);
    assert.throws(() => advance(fresh, 1.5), RangeError);
    assert.throws(() => advance(fresh, -1), RangeError);
    assert.throws(() => advance(fresh, OFFLINE_CAP_MS + 1), RangeError);
    assert.throws(() => advance(fresh, Number.POSITIVE_INFINITY), RangeError);
    assert.doesNotThrow(() => advance(fresh, 0));
    assert.doesNotThrow(() => advance(fresh, OFFLINE_CAP_MS));
  });
});

describe('fresh idle goldens', () => {
  test('15 seconds: 1_500_000 micro, berries 6→7, nextBerryAtMs 30_000', () => {
    const input = deepFreeze(createInitialState());
    const result = advance(input, 15_000);
    assert.equal(result.state.glowMicro, 1_500_000);
    assert.equal(result.state.lifetimeGlowMicro, 1_500_000);
    assert.equal(result.summary.glowEarnedMicro, 1_500_000);
    assert.equal(result.summary.berriesGained, 1);
    assert.equal(result.summary.elapsedMs, 15_000);
    assert.equal(result.state.berries, 7);
    assert.equal(result.state.nextBerryAtMs, 30_000);
    assert.equal(result.state.slimes.length, 1);
    assert.equal(result.state.totalFeeds, 0);
    assert.equal(result.state.slimes[0].feedCount, 0);
    assert.deepEqual(result.state.upgrades, {
      shrub: 0,
      pantry: 0,
      bloom: 0,
      beds: 0,
    });
    assert.equal(result.state.simTimeMs, 15_000);
    assert.equal(getRateMicroPerSecond(result.state), 100_000);
    assert.deepEqual(result.state.tutorialCompleted, ['berry']);
    assert.deepEqual(result.events, [
      { type: 'TUTORIAL_COMPLETED', step: 'berry', atMs: 15_000 },
    ]);
  });

  test('one hour: 360_000_000 micro, 12 berries, timer null, one resident, zero feeds', () => {
    const result = advance(deepFreeze(createInitialState()), 3_600_000);
    assert.equal(result.state.glowMicro, 360_000_000);
    assert.equal(result.state.lifetimeGlowMicro, 360_000_000);
    assert.equal(result.summary.glowEarnedMicro, 360_000_000);
    assert.equal(result.summary.berriesGained, 6);
    assert.equal(result.state.berries, 12);
    assert.equal(result.state.nextBerryAtMs, null);
    assert.equal(result.state.slimes.length, 1);
    assert.equal(result.state.totalFeeds, 0);
    assert.equal(result.state.simTimeMs, 3_600_000);
    assert.equal(result.events.length, 1);
    assert.deepEqual(result.events[0], {
      type: 'TUTORIAL_COMPLETED',
      step: 'berry',
      atMs: 15_000,
    });
  });
});

describe('fed-at-zero goldens', () => {
  test('feed-like fixture matches the patched feed-at-0 fields', () => {
    const fed = makeFedAtZero();
    assert.equal(fed.berries, 5);
    assert.equal(fed.slimes[0].boostUntilMs, 120_000);
    assert.equal(fed.nextFeedAllowedAtMs, 4_000);
    assert.equal(fed.totalFeeds, 1);
    assert.equal(fed.slimes[0].feedCount, 1);
    assert.equal(fed.nextBerryAtMs, 15_000);
    assert.equal(getRateMicroPerSecond(fed), 200_000);
  });

  test('advance 120_000: 24 Glow, full berries, rate at expiry is base', () => {
    const result = advance(deepFreeze(makeFedAtZero()), 120_000);
    assert.equal(result.state.glowMicro, 24_000_000);
    assert.equal(result.summary.glowEarnedMicro, 24_000_000);
    assert.equal(result.state.berries, 12);
    assert.equal(result.state.nextBerryAtMs, null);
    assert.equal(result.state.simTimeMs, 120_000);
    assert.equal(result.state.slimes[0].boostUntilMs, 120_000);
    assert.equal(
      getRateMicroPerSecond(result.state),
      100_000,
      'boostUntilMs > simTimeMs is false at equality',
    );
    assert.equal(result.state.totalFeeds, 1);
    assert.equal(result.state.slimes.length, 1);
  });

  test('after 120s, another 60s: cumulative 30_000_000 micro', () => {
    const first = advance(deepFreeze(makeFedAtZero()), 120_000);
    const second = advance(deepFreeze(first.state), 60_000);
    assert.equal(second.state.glowMicro, 30_000_000);
    assert.equal(second.summary.glowEarnedMicro, 6_000_000);
    assert.equal(second.state.berries, 12);
    assert.equal(second.state.nextBerryAtMs, null);
    assert.equal(getRateMicroPerSecond(second.state), 100_000);
  });

  test('one hour after feed-at-0: 372_000_000 micro (120×0.2 + 3480×0.1 Glow)', () => {
    const result = advance(deepFreeze(makeFedAtZero()), 3_600_000);
    assert.equal(result.state.glowMicro, 372_000_000);
    assert.equal(result.summary.glowEarnedMicro, 372_000_000);
    assert.equal(result.state.simTimeMs, 3_600_000);
    assert.equal(result.state.berries, 12);
    assert.equal(result.state.nextBerryAtMs, null);
    assert.equal(getRateMicroPerSecond(result.state), 100_000);
  });
});

describe('exact bonus boundary', () => {
  test('119_999 ms still boosted; +1 ms lands on expiry with 24 Glow total', () => {
    const almost = advance(deepFreeze(makeFedAtZero()), 119_999);
    assert.equal(almost.state.simTimeMs, 119_999);
    assert.equal(getRateMicroPerSecond(almost.state), 200_000);
    assert.equal(almost.state.glowMicro, 23_999_800);

    const exact = advance(deepFreeze(almost.state), 1);
    assert.equal(exact.state.simTimeMs, 120_000);
    assert.equal(getRateMicroPerSecond(exact.state), 100_000);
    assert.equal(exact.state.glowMicro, 24_000_000);
    assert.equal(exact.summary.glowEarnedMicro, 200);

    const whole = advance(deepFreeze(makeFedAtZero()), 120_000);
    assert.equal(whole.state.glowMicro, 24_000_000);
    assert.equal(whole.state.glowMicro, exact.state.glowMicro);
  });
});

describe('full inventory', () => {
  test('12 berries and null timer: advance 50_000 grants only Glow', () => {
    const state = makeState({
      berries: 12,
      nextBerryAtMs: null,
    });
    const result = advance(deepFreeze(state), 50_000);
    assert.equal(result.state.berries, 12);
    assert.equal(result.state.nextBerryAtMs, null);
    assert.equal(result.summary.berriesGained, 0);
    assert.equal(result.state.glowMicro, 5_000_000);
    assert.equal(result.summary.glowEarnedMicro, 5_000_000);
    assert.deepEqual(result.events, []);
    assert.deepEqual(result.state.tutorialCompleted, []);
  });
});

describe('income remainder', () => {
  test('remainder 999 and 1 ms at 100_000 micro/s earns 100, remainder stays 999', () => {
    const state = makeState({
      incomeRemainder: 999,
      berries: 12,
      nextBerryAtMs: null,
    });
    const result = advance(deepFreeze(state), 1);
    assert.equal(result.state.glowMicro, 100);
    assert.equal(result.state.lifetimeGlowMicro, 100);
    assert.equal(result.state.incomeRemainder, 999);
    assert.equal(result.summary.glowEarnedMicro, 100);
  });

  test('chunk splits preserve remainder', () => {
    const state = makeState({
      incomeRemainder: 999,
      berries: 12,
      nextBerryAtMs: null,
    });
    const combined = advance(deepFreeze(state), 10);
    const split = advanceByChunks(deepFreeze(state), [3, 1, 6]);
    assert.equal(combined.state.incomeRemainder, 999);
    assert.equal(split.incomeRemainder, 999);
    assert.equal(combined.state.glowMicro, 1_000);
    assert.deepEqual(split, combined.state);
    assert.equal(combined.state.incomeRemainder < INCOME_REMAINDER_MOD, true);
  });
});

describe('counter cap', () => {
  test('lifetime at MAX, wallet slightly below: wallet caps, lifetime unchanged, remainder 0', () => {
    const room = 50;
    const state = makeState({
      glowMicro: MAX_GLOW_MICRO - room,
      lifetimeGlowMicro: MAX_GLOW_MICRO,
      incomeRemainder: 999,
      berries: 12,
      nextBerryAtMs: null,
    });
    const result = advance(deepFreeze(state), 1);
    assert.equal(result.state.glowMicro, MAX_GLOW_MICRO);
    assert.equal(result.state.lifetimeGlowMicro, MAX_GLOW_MICRO);
    assert.equal(result.state.incomeRemainder, 0);
    assert.equal(result.summary.glowEarnedMicro, room);
    assert.ok(result.state.glowMicro <= MAX_GLOW_MICRO);
    assert.ok(result.state.lifetimeGlowMicro <= MAX_GLOW_MICRO);

    const alreadyCapped = advance(deepFreeze(result.state), 1_000);
    assert.equal(alreadyCapped.state.glowMicro, MAX_GLOW_MICRO);
    assert.equal(alreadyCapped.state.lifetimeGlowMicro, MAX_GLOW_MICRO);
    assert.equal(alreadyCapped.state.incomeRemainder, 0);
    assert.equal(alreadyCapped.summary.glowEarnedMicro, 0);
  });

  test('wallet at cap still increases lifetime; remainder stays until both are capped', () => {
    const state = makeState({
      glowMicro: MAX_GLOW_MICRO,
      lifetimeGlowMicro: MAX_GLOW_MICRO - 10_000,
      incomeRemainder: 999,
      berries: 12,
      nextBerryAtMs: null,
    });
    const result = advance(deepFreeze(state), 1);
    assert.equal(result.state.glowMicro, MAX_GLOW_MICRO);
    assert.equal(result.state.lifetimeGlowMicro, MAX_GLOW_MICRO - 9_900);
    assert.equal(result.state.incomeRemainder, 999);
    assert.equal(result.summary.glowEarnedMicro, 0);
  });
});

describe('zero elapsed and immutability', () => {
  test('zero elapsed is a cloned no-op; frozen input is unchanged', () => {
    const input = deepFreeze(createInitialState());
    const snapshot = structuredClone(input);
    const result = advance(input, 0);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(result.state, snapshot);
    assert.notEqual(result.state, input);
    assert.notEqual(result.state.slimes, input.slimes);
    assert.notEqual(result.state.slimes[0], input.slimes[0]);
    assert.notEqual(result.state.upgrades, input.upgrades);
    assert.notEqual(result.state.tutorialCompleted, input.tutorialCompleted);
    assert.deepEqual(result.events, []);
    assert.deepEqual(result.summary, {
      elapsedMs: 0,
      glowEarnedMicro: 0,
      berriesGained: 0,
    });
  });

  test('positive elapsed does not mutate a frozen input', () => {
    const input = deepFreeze(makeFedAtZero());
    const snapshot = structuredClone(input);
    advance(input, 15_000);
    assert.deepEqual(input, snapshot);
  });

  test('cloneState copies nested upgrades, slimes, and tutorial arrays', () => {
    const original = makeState({ tutorialCompleted: ['feed'] });
    const cloned = cloneState(original);
    assert.notEqual(cloned, original);
    assert.notEqual(cloned.upgrades, original.upgrades);
    assert.notEqual(cloned.slimes, original.slimes);
    assert.notEqual(cloned.slimes[0], original.slimes[0]);
    assert.notEqual(cloned.tutorialCompleted, original.tutorialCompleted);
    cloned.upgrades.shrub = 3;
    cloned.slimes[0].feedCount = 9;
    cloned.tutorialCompleted.push('berry');
    assert.equal(original.upgrades.shrub, 0);
    assert.equal(original.slimes[0].feedCount, 0);
    assert.deepEqual(original.tutorialCompleted, ['feed']);
  });
});

describe('chunk equivalence', () => {
  test('advance(s, a+b).state equals sequential chunks for fixed partitions', () => {
    const cases = [
      { state: createInitialState(), elapsed: 15_000, chunks: [14_999, 1] },
      { state: createInitialState(), elapsed: 15_000, chunks: [0, 15_000] },
      { state: createInitialState(), elapsed: 15_000, chunks: [15_000, 0] },
      { state: createInitialState(), elapsed: 3_600_000, chunks: [1_000_000, 2_600_000] },
      { state: makeFedAtZero(), elapsed: 120_000, chunks: [119_999, 1] },
      { state: makeFedAtZero(), elapsed: 3_600_000, chunks: [120_000, 3_480_000] },
      {
        state: makeState({ incomeRemainder: 999, berries: 12, nextBerryAtMs: null }),
        elapsed: 7,
        chunks: [2, 3, 2],
      },
      {
        state: makeState({
          berries: 12,
          nextBerryAtMs: null,
          glowMicro: MAX_GLOW_MICRO - 5_000,
          lifetimeGlowMicro: MAX_GLOW_MICRO - 1_000,
        }),
        elapsed: 50,
        chunks: [10, 40],
      },
    ];
    for (const { state, elapsed, chunks } of cases) {
      const combined = advance(deepFreeze(state), elapsed).state;
      const split = advanceByChunks(deepFreeze(state), chunks);
      assert.deepEqual(split, combined, `chunks ${chunks.join('+')}`);
    }
  });

  test('seeded random partitions match a single advance', () => {
    const rng = mulberry32(20260907);
    const fixtures = [
      { state: createInitialState(), elapsed: 45_000 },
      { state: makeFedAtZero(), elapsed: 240_000 },
      {
        state: makeState({
          upgrades: { bloom: 2 },
          slimes: makeSlimes(3, (i) => ({ boostUntilMs: (i + 1) * 17_000 })),
        }),
        elapsed: 80_000,
      },
    ];
    for (const { state, elapsed } of fixtures) {
      const combined = advance(deepFreeze(state), elapsed).state;
      for (let n = 0; n < 8; n += 1) {
        const parts = 2 + Math.floor(rng() * 5);
        const chunks = randomChunks(rng, elapsed, parts);
        const split = advanceByChunks(deepFreeze(state), chunks);
        assert.deepEqual(
          split,
          combined,
          `seeded chunks ${chunks.join('+')} of ${elapsed}`,
        );
      }
    }
  });
});

describe('segmented income at distinct expiries', () => {
  test('six residents with different boostUntilMs change rate at each expiry', () => {
    const expiries = [10_000, 20_000, 40_000, 80_000, 160_000, 320_000];
    const state = makeState({
      berries: 12,
      nextBerryAtMs: null,
      slimes: makeSlimes(6, (index) => ({
        boostUntilMs: expiries[index],
        feedCount: 1,
      })),
      totalFeeds: 6,
    });
    // Independent hand calc, bloom 0: 6×0.2 Glow/s stepping down at each expiry.
    // [0,10s) 1.2 Glow/s → 12 Glow
    // [10,20) 1.1 → 11
    // [20,40) 1.0 → 20
    // [40,80) 0.9 → 36
    // [80,160) 0.8 → 64
    // [160,320) 0.7 → 112
    // [320,400) 0.6 → 48
    // Total 303 Glow = 303_000_000 micro
    const expectedRates = [
      [0, 1_200_000],
      [10_000, 1_100_000],
      [20_000, 1_000_000],
      [40_000, 900_000],
      [80_000, 800_000],
      [160_000, 700_000],
      [320_000, 600_000],
    ];
    for (const [atMs, rate] of expectedRates) {
      assert.equal(
        getRateMicroPerSecond({ ...state, simTimeMs: atMs }),
        rate,
        `rate at ${atMs}`,
      );
    }
    const result = advance(deepFreeze(state), 400_000);
    assert.equal(result.state.glowMicro, 303_000_000);
    assert.equal(result.summary.glowEarnedMicro, 303_000_000);
    assert.equal(result.state.simTimeMs, 400_000);
    assert.equal(getRateMicroPerSecond(result.state), 600_000);
    for (let i = 0; i < expiries.length; i += 1) {
      assert.equal(result.state.slimes[i].boostUntilMs, expiries[i]);
    }
  });
});

describe('upgrade-aware berry growth', () => {
  test('uses current shrub interval and pantry capacity, not base constants', () => {
    const state = makeState({
      berries: 16,
      nextBerryAtMs: 12_000,
      upgrades: { shrub: 1, pantry: 1 },
    });
    const result = advance(deepFreeze(state), 12_000);
    assert.equal(result.state.berries, 17);
    assert.equal(result.state.nextBerryAtMs, 24_000);
    assert.equal(result.summary.berriesGained, 1);
    const fill = advance(
      deepFreeze(
        makeState({
          berries: 17,
          nextBerryAtMs: 12_000,
          upgrades: { shrub: 1, pantry: 1 },
        }),
      ),
      120_000,
    );
    assert.equal(fill.state.berries, 18);
    assert.equal(fill.state.nextBerryAtMs, null);
  });
});

describe('berry tutorial', () => {
  test('first regenerated berry emits berry tutorial once; a later advance does not', () => {
    const first = advance(deepFreeze(createInitialState()), 15_000);
    assert.deepEqual(first.state.tutorialCompleted, ['berry']);
    assert.deepEqual(first.events, [
      { type: 'TUTORIAL_COMPLETED', step: 'berry', atMs: 15_000 },
    ]);
    assert.equal(first.state.berries, 7);

    const second = advance(deepFreeze(first.state), 15_000);
    assert.deepEqual(second.state.tutorialCompleted, ['berry']);
    assert.deepEqual(second.events, []);
    assert.equal(second.state.berries, 8);
    assert.equal(second.state.nextBerryAtMs, 45_000);
  });
});

describe('safe integer intermediate', () => {
  test('six boosted bloom-5 for 8 hours: 77_760_000_000_000 before /1000', () => {
    const state = makeState({
      upgrades: { bloom: 5 },
      berries: 12,
      nextBerryAtMs: null,
      slimes: makeSlimes(6, () => ({ boostUntilMs: OFFLINE_CAP_MS })),
    });
    assert.equal(getRateMicroPerSecond(state), 2_700_000);
    const intermediate = 2_700_000 * OFFLINE_CAP_MS;
    assert.equal(intermediate, 77_760_000_000_000);
    assert.equal(intermediate < Number.MAX_SAFE_INTEGER, true);
    assert.equal(Number.isSafeInteger(intermediate), true);
    const result = advance(deepFreeze(state), OFFLINE_CAP_MS);
    assert.equal(result.summary.glowEarnedMicro, 77_760_000_000);
    assert.equal(result.state.glowMicro, 77_760_000_000);
    assert.equal(result.state.lifetimeGlowMicro, 77_760_000_000);
    assert.equal(result.state.incomeRemainder, 0);
    assert.equal(result.summary.elapsedMs, OFFLINE_CAP_MS);
  });
});

describe('core module isolation', () => {
  test('advance.mjs does not import DOM, Three, performance, Date, or randomness', () => {
    const source = readFileSync(join(coreDir, 'advance.mjs'), 'utf8');
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
        `advance.mjs must not contain ${pattern}`,
      );
    }
  });
});
