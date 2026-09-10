import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MAX_FOOD, MICRO_PER_GLOW } from '../src/core/balance.mjs';
import { createInitialState } from '../src/core/state.mjs';
import {
  effectiveReducedMotion,
  feedDisabledReason,
  nextTutorialStep,
  offlineSummaryText,
  offerNearDisabledReason,
  throwDisabledReason,
} from '../src/ui/dom.mjs';
import {
  formatCostLabel,
  formatDuration,
  formatGlowAmount,
  formatMealCompleteStatus,
  formatPendingFood,
  formatShortfall,
  formatThrowReject,
  formatUpgradeCardEffect,
  formatWalletGlow,
  HUD_COPY,
  TUTORIAL_COPY,
} from '../src/ui/format.mjs';
import {
  createHudControlState,
  createReticle,
  formatCompanionStatus,
  hudPressed,
  REGION_PRESETS,
  setHudMode,
  setHudTool,
  stepReticle,
} from '../src/ui/hud.mjs';
import { getCompanionEligibility } from '../src/core/selectors.mjs';

describe('throw / offer-near disabled copy', () => {
  test('distinct reasons for berries, cooldown, food limit, and no target', () => {
    const fresh = createInitialState();
    assert.equal(offerNearDisabledReason(fresh, null), HUD_COPY.chooseSlime);
    assert.equal(feedDisabledReason(fresh, null), HUD_COPY.chooseSlime);

    const empty = { ...fresh, berries: 0, nextBerryAtMs: 15_000, simTimeMs: 0 };
    assert.equal(throwDisabledReason(empty), 'More berries in 0:15');
    assert.equal(formatThrowReject('NO_BERRIES', empty), 'More berries in 0:15');

    const cooling = {
      ...fresh,
      berries: 5,
      nextFeedAllowedAtMs: 4_000,
      simTimeMs: 1,
    };
    assert.equal(throwDisabledReason(cooling), 'Ready to toss in 0:04');
    assert.equal(formatThrowReject('THROW_COOLDOWN', cooling), 'Ready to toss in 0:04');

    const throwCooling = {
      ...fresh,
      berries: 5,
      nextThrowAllowedAtMs: 1_000,
      simTimeMs: 0,
    };
    assert.equal(throwDisabledReason(throwCooling), 'Ready to toss in 0:01');

    const foods = Array.from({ length: MAX_FOOD }, (_, i) => ({
      id: `food-${i + 1}`,
      target: { x: 0, z: 0 },
      createdWorldMs: 0,
      landAtWorldMs: 600,
      stage: 'landed',
      claimedBy: null,
      eatUntilWorldMs: null,
    }));
    const limited = {
      ...fresh,
      world: { foods, residents: [], timeMs: 0, carryMs: 0, nextFoodSequence: 13 },
    };
    assert.equal(throwDisabledReason(limited), HUD_COPY.foodLimit);
    assert.equal(formatThrowReject('FOOD_LIMIT'), HUD_COPY.foodLimit);

    assert.equal(
      throwDisabledReason(fresh, { invalidTarget: true }),
      HUD_COPY.invalidTarget,
    );
    assert.equal(
      throwDisabledReason(fresh, { noValidTarget: true }),
      HUD_COPY.noValidTarget,
    );
    assert.equal(formatThrowReject('INVALID_TARGET'), HUD_COPY.invalidTarget);
    assert.equal(formatThrowReject('NO_VALID_TARGET'), HUD_COPY.noValidTarget);

    assert.equal(throwDisabledReason(fresh), null);
    assert.equal(offerNearDisabledReason(fresh, 'slime-1'), null);
    assert.equal(HUD_COPY.berryTossed, 'Berry tossed');
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

  test('formatShortfall uses exact remaining cost and stays empty when affordable', () => {
    assert.equal(formatShortfall(15 * MICRO_PER_GLOW, 0), 'Need 15 Glow more');
    assert.equal(formatShortfall(15 * MICRO_PER_GLOW, 15 * MICRO_PER_GLOW), '');
    assert.equal(formatShortfall(15 * MICRO_PER_GLOW, 14_999_999), 'Need 0.000001 Glow more');
  });

  test('duration ceils leftover milliseconds so Ready to toss never shows 0:00 early', () => {
    assert.equal(formatDuration(1), '0:01');
    assert.equal(formatDuration(1000), '0:01');
    assert.equal(formatDuration(0), '0:00');
  });
});

describe('upgrade and companion copy', () => {
  test('contextual upgrade card uses current → next, and Max level when done', () => {
    const fresh = createInitialState();
    assert.equal(
      formatUpgradeCardEffect(fresh, 'shrub'),
      'Berries grow every 15s → 12s',
    );
    assert.equal(
      formatUpgradeCardEffect(fresh, 'pantry'),
      'Hold 12 → 18 berries',
    );
    assert.equal(
      formatUpgradeCardEffect(fresh, 'bloom'),
      'All friends make +25 percentage points more Glow',
    );
    assert.equal(
      formatUpgradeCardEffect(fresh, 'beds'),
      'Room for 2 → 3 friends',
    );
    const maxed = {
      ...fresh,
      upgrades: { shrub: 3, pantry: 2, bloom: 5, beds: 8 },
    };
    assert.equal(formatUpgradeCardEffect(maxed, 'shrub'), HUD_COPY.maxLevel);
  });

  test('companion strip names pad shortfall and full colony', () => {
    const fresh = createInitialState();
    const eligibility = getCompanionEligibility(fresh);
    assert.equal(formatCompanionStatus(eligibility), HUD_COPY.companionNeeds);
    assert.equal(
      formatCompanionStatus({
        ...eligibility,
        feedsMet: true,
        glowMet: true,
        capacityMet: false,
        ready: false,
      }),
      HUD_COPY.missingPad,
    );
    assert.equal(
      formatCompanionStatus({
        ...eligibility,
        nextPopulation: null,
        ready: false,
      }),
      HUD_COPY.fullColony,
    );
  });

  test('meal and pending-food copy stay informational', () => {
    assert.equal(
      formatMealCompleteStatus('Slime 3', 120_000),
      'Slime 3 enjoyed a berry · Cozy bonus 2:00',
    );
    assert.equal(formatPendingFood(0), 'No berries on the grass');
    assert.equal(formatPendingFood(1), '1 berry on the grass');
    assert.equal(formatPendingFood(12), '12 berries on the grass');
  });
});

describe('tutorial copy is throw / pet / camera, not offer-and-welcome', () => {
  test('phase-2 hints never tell the player to offer a berry or welcome a slime', () => {
    for (const text of Object.values(TUTORIAL_COPY)) {
      assert.doesNotMatch(text, /offer a berry/i);
      assert.doesNotMatch(text, /welcome a new slime/i);
    }
    const fresh = createInitialState();
    assert.equal(nextTutorialStep(fresh), 'feed');
    assert.equal(TUTORIAL_COPY.feed, 'Tap the grass to toss a berry.');
  });
});

describe('mode and tool pressed-state helpers', () => {
  test('orbit cancels aim preview and restores the previous care tool', () => {
    let hud = createHudControlState();
    assert.deepEqual(hudPressed(hud), { berry: true, hand: false, orbit: false });
    hud = setHudTool(hud, 'hand');
    hud = { ...hud, aimPreview: true };
    assert.deepEqual(hudPressed(hud), { berry: false, hand: true, orbit: false });
    hud = setHudMode(hud, 'orbit');
    assert.equal(hud.mode, 'orbit');
    assert.equal(hud.aimPreview, false);
    assert.equal(hud.lastCareTool, 'hand');
    assert.deepEqual(hudPressed(hud), { berry: false, hand: false, orbit: true });
    hud = setHudMode(hud, 'care');
    assert.equal(hud.mode, 'care');
    assert.equal(hud.tool, 'hand');
    assert.deepEqual(hudPressed(hud), { berry: false, hand: true, orbit: false });
    hud = setHudTool(hud, 'berry');
    assert.equal(hud.mode, 'care');
    assert.deepEqual(hudPressed(hud), { berry: true, hand: false, orbit: false });
  });

  test('nine region presets and 0.5 reticle steps stay in bounds', () => {
    assert.equal(REGION_PRESETS.length, 9);
    const ids = new Set(REGION_PRESETS.map((entry) => entry.id));
    assert.equal(ids.size, 9);
    let reticle = createReticle();
    assert.equal(reticle.x, 0);
    assert.equal(reticle.z, 3.5);
    reticle = stepReticle(reticle, 1, 0);
    assert.equal(reticle.x, 0.5);
    reticle = stepReticle(reticle, 0, -1);
    assert.equal(reticle.z, 3);
    const north = stepReticle({ x: 0, z: 8.5 }, 0, 1);
    assert.equal(north.z, 8.5);
    const west = stepReticle({ x: -10.5, z: 0 }, -1, 0);
    assert.equal(west.x, -10.5);
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
