import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MICRO_PER_GLOW } from '../src/core/balance.mjs';
import { createInitialState } from '../src/core/state.mjs';
import {
  effectiveReducedMotion,
  feedDisabledReason,
  offlineSummaryText,
} from '../src/ui/dom.mjs';
import {
  formatCostLabel,
  formatDuration,
  formatGlowAmount,
  formatWalletGlow,
} from '../src/ui/format.mjs';

describe('feed disabled copy', () => {
  test('distinct reasons for no selection, empty basket, and cooldown', () => {
    const fresh = createInitialState();
    assert.equal(feedDisabledReason(fresh, null), 'Choose a slime');
    const empty = { ...fresh, berries: 0, nextBerryAtMs: 15_000, simTimeMs: 0 };
    assert.equal(feedDisabledReason(empty, 'slime-1'), 'More berries in 0:15');
    const cooling = {
      ...fresh,
      berries: 5,
      nextFeedAllowedAtMs: 4_000,
      simTimeMs: 1,
    };
    assert.match(feedDisabledReason(cooling, 'slime-1') ?? '', /^Ready in /);
    assert.equal(feedDisabledReason(fresh, 'slime-1'), null);
  });
});

describe('display rounding does not override costs', () => {
  test('wallet 14.999999 Glow floors to 14.9, not a rounded 15.0 that could look affordable', () => {
    const almost = 14_999_999;
    assert.equal(formatWalletGlow(almost), '14.9');
    assert.notEqual((almost / MICRO_PER_GLOW).toFixed(1), formatWalletGlow(almost));
    assert.equal(formatCostLabel(15 * MICRO_PER_GLOW), '15 Glow');
    assert.ok(almost < 15 * MICRO_PER_GLOW);
  });

  test('duration ceils leftover milliseconds so Ready in never shows 0:00 early', () => {
    assert.equal(formatDuration(1), '0:01');
    assert.equal(formatDuration(1000), '0:01');
    assert.equal(formatDuration(0), '0:00');
  });
});

describe('settings motion and offline copy', () => {
  test('effectiveReducedMotion honors explicit on/off over the OS query', () => {
    assert.equal(effectiveReducedMotion({ reducedMotion: true }), true);
    assert.equal(effectiveReducedMotion({ reducedMotion: false }), false);
  });

  test('offline summary names the eight-hour cap when credited time was capped', () => {
    const text = offlineSummaryText({
      awayMs: 10 * 3_600_000,
      creditedMs: 8 * 3_600_000,
      glowEarnedMicro: 2_880 * MICRO_PER_GLOW,
      berriesGained: 6,
      capped: true,
      clockWentBackward: false,
    });
    assert.match(text, /8 hours/);
    assert.ok(text.includes(formatGlowAmount(2_880 * MICRO_PER_GLOW)));
  });
});
