import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { NAME_MAX_LENGTH, SLIME_NAMES } from '../src/core/balance.mjs';
import { cloneState, createInitialState, syncWorldRoster } from '../src/core/state.mjs';
import {
  SAVE_TEXT_MAX_LENGTH,
  createDefaultSettings,
  createFreshEnvelope,
  serializeEnvelope,
  validateSave,
} from '../src/core/validate.mjs';
import { isValidFoodTarget } from '../src/world/layout.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');
const fixturesDir = join(here, 'fixtures');

const validFixtureText = readFileSync(join(fixturesDir, 'valid-v1.json'), 'utf8');
const invalidV2FixtureText = readFileSync(join(fixturesDir, 'schema-v2.json'), 'utf8');
const futureSchema3Text = readFileSync(join(fixturesDir, 'future-schema3.json'), 'utf8');

/**
 * @param {object} [patch]
 */
function makeEnvelope(patch = {}) {
  const base = createFreshEnvelope({
    nowWallMs: 1_700_000_000_000,
    revision: 1,
  });
  const statePatch = patch.state ?? {};
  const state = cloneState(base.state);
  const {
    upgrades: upgradePatch,
    slimes: slimePatch,
    tutorialCompleted: tutorialPatch,
    world: worldPatch,
    ...restState
  } = statePatch;
  Object.assign(state, restState);
  if (upgradePatch) {
    state.upgrades = { ...state.upgrades, ...upgradePatch };
  }
  if (slimePatch) {
    state.slimes = slimePatch.map((slime) => ({ ...slime }));
  }
  if (tutorialPatch) {
    state.tutorialCompleted = [...tutorialPatch];
  }
  if (worldPatch) {
    state.world = worldPatch;
  }
  const { state: _state, settings: settingsPatch, ...rest } = patch;
  return {
    ...base,
    ...rest,
    settings: { ...base.settings, ...(settingsPatch ?? {}) },
    state,
  };
}

/**
 * @param {object} [patch]
 */
function envelopeText(patch = {}) {
  return serializeEnvelope(makeEnvelope(patch));
}

/**
 * @param {(raw: Record<string, unknown>) => void} [mutate]
 */
function currentJson(mutate) {
  const raw = JSON.parse(
    serializeEnvelope(
      createFreshEnvelope({ nowWallMs: 1_700_000_000_000, revision: 1 }),
    ),
  );
  if (mutate) mutate(raw);
  return JSON.stringify(raw);
}

describe('validateSave', () => {
  test('accepts a valid fresh envelope and the v1 fixture', () => {
    const fresh = createFreshEnvelope({ nowWallMs: 1_700_000_000_000, revision: 0 });
    const fromFresh = validateSave(serializeEnvelope(fresh));
    assert.equal(fromFresh.ok, true);
    if (fromFresh.ok) {
      assert.equal(fromFresh.kind, 'current');
      assert.equal(fromFresh.save.gameId, 'cozy-slime-mvp');
      assert.equal(fromFresh.save.schemaVersion, 2);
      assert.equal(fromFresh.save.balanceVersion, 2);
      assert.equal(fromFresh.save.revision, 0);
      assert.equal(fromFresh.save.savedWallMs, 1_700_000_000_000);
      assert.deepEqual(fromFresh.save.settings, createDefaultSettings());
      assert.equal(fromFresh.save.state.habitatId, 'farm-v2');
      assert.ok(fromFresh.save.state.world);
      assert.deepEqual(fromFresh.save.state.world.foods, []);
      assert.equal(fromFresh.save.state.world.timeMs, 0);
      assert.equal(fromFresh.save.state.world.carryMs, 0);
      assert.equal(fromFresh.save.state.world.nextFoodSequence, 1);
      assert.equal(fromFresh.save.state.world.residents.length, 1);
      assert.deepEqual(fromFresh.save.state.world.residents[0].position, {
        x: 0,
        z: 2,
      });
      assert.equal(fromFresh.save.state.nextThrowAllowedAtMs, 0);
      assert.equal(fromFresh.save.state.nextFeedAllowedAtMs, 0);
      assert.equal(fromFresh.save.state.slimes[0].id, 'slime-1');
    }

    const fromFixture = validateSave(validFixtureText);
    assert.equal(fromFixture.ok, true);
    if (fromFixture.ok) {
      assert.equal(fromFixture.kind, 'legacy-v1');
      assert.equal(fromFixture.save.schemaVersion, 1);
      assert.equal(fromFixture.save.revision, 1);
      assert.equal(fromFixture.save.state.slimes[0].id, 'slime-1');
      assert.equal(fromFixture.save.state.berries, 6);
      assert.equal(fromFixture.save.state.nextBerryAtMs, 15_000);
      assert.equal(fromFixture.save.state.habitatId, 'garden-prototype-v1');
    }
  });

  test('strips extra enumerable fields from the reconstructed envelope', () => {
    const base = JSON.parse(serializeEnvelope(makeEnvelope()));
    const dirty = {
      ...base,
      extraTop: 'nope',
      settings: { ...base.settings, volume: 11 },
      state: {
        ...base.state,
        junk: true,
        upgrades: { ...base.state.upgrades, secret: 9 },
        slimes: [
          {
            ...base.state.slimes[0],
            meshId: 'do-not-keep',
          },
        ],
      },
    };
    const result = validateSave(JSON.stringify(dirty));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal('extraTop' in result.save, false);
    assert.equal('volume' in result.save.settings, false);
    assert.equal('junk' in result.save.state, false);
    assert.equal('secret' in result.save.state.upgrades, false);
    assert.equal('meshId' in result.save.state.slimes[0], false);
    assert.deepEqual(Object.keys(result.save.state.upgrades).sort(), [
      'beds',
      'bloom',
      'pantry',
      'shrub',
    ]);
  });

  test('rejects non-strings and text above 64 KiB as TOO_LARGE', () => {
    assert.equal(validateSave(null).reason, 'TOO_LARGE');
    assert.equal(validateSave(undefined).reason, 'TOO_LARGE');
    assert.equal(validateSave({}).reason, 'TOO_LARGE');
    assert.equal(validateSave('x'.repeat(SAVE_TEXT_MAX_LENGTH + 1)).reason, 'TOO_LARGE');
    assert.equal(validateSave('x'.repeat(SAVE_TEXT_MAX_LENGTH)).reason, 'INVALID_JSON');
  });

  test('rejects malformed JSON as INVALID_JSON', () => {
    assert.equal(validateSave('{').ok, false);
    assert.equal(validateSave('{').reason, 'INVALID_JSON');
    assert.equal(validateSave('not json').reason, 'INVALID_JSON');
    assert.equal(validateSave('').reason, 'INVALID_JSON');
  });

  test('schema-v2.json junk and bare schema-2 shells are INVALID_STATE, not FUTURE', () => {
    const fromFixture = validateSave(invalidV2FixtureText);
    assert.equal(fromFixture.ok, false);
    assert.equal(fromFixture.reason, 'INVALID_STATE');

    const fromMinimal = validateSave(
      JSON.stringify({
        gameId: 'cozy-slime-mvp',
        schemaVersion: 2,
      }),
    );
    assert.equal(fromMinimal.ok, false);
    assert.equal(fromMinimal.reason, 'INVALID_STATE');
  });

  test('future-schema3.json is FUTURE_VERSION', () => {
    const fromFixture = validateSave(futureSchema3Text);
    assert.equal(fromFixture.ok, false);
    assert.equal(fromFixture.reason, 'FUTURE_VERSION');
  });

  test('schema 2 with balance 3 is FUTURE_VERSION; schema 2 + balance 1 is INVALID_STATE', () => {
    assert.equal(
      validateSave(
        JSON.stringify({
          gameId: 'cozy-slime-mvp',
          schemaVersion: 2,
          balanceVersion: 3,
        }),
      ).reason,
      'FUTURE_VERSION',
    );
    assert.equal(
      validateSave(envelopeText({ balanceVersion: 1 })).reason,
      'INVALID_STATE',
    );
  });

  test('claimed v1 with 10 slimes or beds 8 is INVALID_STATE', () => {
    const ten = JSON.parse(validFixtureText);
    ten.state.slimes = Array.from({ length: 10 }, (_, index) => ({
      id: `slime-${index + 1}`,
      name: SLIME_NAMES[index],
      createdAtMs: 0,
      boostUntilMs: 0,
      feedCount: 0,
      homeSlot: index,
    }));
    assert.equal(validateSave(JSON.stringify(ten)).reason, 'INVALID_STATE');

    const beds8 = JSON.parse(validFixtureText);
    beds8.state.upgrades.beds = 8;
    assert.equal(validateSave(JSON.stringify(beds8)).reason, 'INVALID_STATE');
  });

  test('wallet greater than lifetime is INVALID_STATE', () => {
    const result = validateSave(
      envelopeText({
        state: { glowMicro: 10, lifetimeGlowMicro: 5 },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'INVALID_STATE');
  });

  test('bad berry timer is INVALID_STATE', () => {
    const fullWithTimer = validateSave(
      envelopeText({
        state: { berries: 12, nextBerryAtMs: 15_000 },
      }),
    );
    assert.equal(fullWithTimer.reason, 'INVALID_STATE');

    const notFullNull = validateSave(
      envelopeText({
        state: { berries: 6, nextBerryAtMs: null },
      }),
    );
    assert.equal(notFullNull.reason, 'INVALID_STATE');

    const dueNow = validateSave(
      envelopeText({
        state: { berries: 6, nextBerryAtMs: 0, simTimeMs: 0 },
      }),
    );
    assert.equal(dueNow.reason, 'INVALID_STATE');

    const tooFar = validateSave(
      envelopeText({
        state: { berries: 6, nextBerryAtMs: 15_001, simTimeMs: 0 },
      }),
    );
    assert.equal(tooFar.reason, 'INVALID_STATE');
  });

  test('duplicate slime ids are INVALID_STATE', () => {
    const result = validateSave(
      envelopeText({
        state: {
          upgrades: { beds: 1 },
          slimes: [
            {
              id: 'slime-1',
              name: 'Slime 1',
              createdAtMs: 0,
              boostUntilMs: 0,
              feedCount: 0,
              homeSlot: 0,
            },
            {
              id: 'slime-1',
              name: 'Slime 2',
              createdAtMs: 0,
              boostUntilMs: 0,
              feedCount: 0,
              homeSlot: 1,
            },
          ],
        },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'INVALID_STATE');
  });

  test('name longer than 32 characters is INVALID_STATE', () => {
    const okName = validateSave(
      envelopeText({
        state: {
          slimes: [
            {
              id: 'slime-1',
              name: 'n'.repeat(NAME_MAX_LENGTH),
              createdAtMs: 0,
              boostUntilMs: 0,
              feedCount: 0,
              homeSlot: 0,
            },
          ],
        },
      }),
    );
    assert.equal(okName.ok, true);

    const longName = validateSave(
      envelopeText({
        state: {
          slimes: [
            {
              id: 'slime-1',
              name: 'n'.repeat(NAME_MAX_LENGTH + 1),
              createdAtMs: 0,
              boostUntilMs: 0,
              feedCount: 0,
              homeSlot: 0,
            },
          ],
        },
      }),
    );
    assert.equal(longName.ok, false);
    assert.equal(longName.reason, 'INVALID_STATE');
  });

  test('rejects unknown gameId, non-v1 schema 0, and bad settings', () => {
    assert.equal(
      validateSave(envelopeText({ gameId: 'other-game' })).reason,
      'INVALID_STATE',
    );
    assert.equal(
      validateSave(envelopeText({ schemaVersion: 0 })).reason,
      'INVALID_STATE',
    );
    assert.equal(
      validateSave(envelopeText({ balanceVersion: 1 })).reason,
      'INVALID_STATE',
    );
    assert.equal(
      validateSave(envelopeText({ settings: { ...createDefaultSettings(), quality: 'medium' } }))
        .reason,
      'INVALID_STATE',
    );
  });

  test('malformed v2 world is INVALID_STATE and is not repaired', () => {
    const nanPos = currentJson((raw) => {
      raw.state.world.residents[0].position.x = Number.NaN;
    });
    assert.equal(validateSave(nanPos).reason, 'INVALID_STATE');

    const dupFood = currentJson((raw) => {
      const food = {
        id: 'food-1',
        target: { x: 0, z: 0 },
        createdWorldMs: 0,
        landAtWorldMs: 600,
        stage: 'landed',
        claimedBy: null,
        eatUntilWorldMs: null,
      };
      raw.state.world.foods = [food, { ...food }];
      raw.state.world.nextFoodSequence = 2;
    });
    assert.equal(validateSave(dupFood).reason, 'INVALID_STATE');

    const thirteen = currentJson((raw) => {
      raw.state.world.nextFoodSequence = 14;
      raw.state.world.foods = Array.from({ length: 13 }, (_, index) => ({
        id: `food-${index + 1}`,
        target: { x: 0, z: 0 },
        createdWorldMs: 0,
        landAtWorldMs: 600,
        stage: 'landed',
        claimedBy: null,
        eatUntilWorldMs: null,
      }));
    });
    assert.equal(validateSave(thirteen).reason, 'INVALID_STATE');

    const badClaim = currentJson((raw) => {
      raw.state.world.nextFoodSequence = 2;
      raw.state.world.foods = [
        {
          id: 'food-1',
          target: { x: 0, z: 0 },
          createdWorldMs: 0,
          landAtWorldMs: 600,
          stage: 'claimed',
          claimedBy: 'slime-99',
          eatUntilWorldMs: null,
        },
      ];
    });
    assert.equal(validateSave(badClaim).reason, 'INVALID_STATE');
  });

  test('ten-resident twelve-food long-path save stays within 64 KiB', () => {
    const state = createInitialState();
    state.upgrades.beds = 8;
    state.slimes = Array.from({ length: 10 }, (_, index) => ({
      id: `slime-${index + 1}`,
      name: SLIME_NAMES[index],
      createdAtMs: 0,
      boostUntilMs: 0,
      feedCount: 0,
      homeSlot: index,
    }));
    const synced = syncWorldRoster(state);
    const targets = [];
    for (let x = -8; x <= 8 && targets.length < 12; x += 1) {
      for (let z = -4; z <= 4 && targets.length < 12; z += 1) {
        const point = { x, z };
        if (isValidFoodTarget(point)) targets.push(point);
      }
    }
    assert.equal(targets.length, 12);
    synced.world.foods = targets.map((target, index) => ({
      id: `food-${index + 1}`,
      target,
      createdWorldMs: 0,
      landAtWorldMs: 600,
      stage: 'landed',
      claimedBy: null,
      eatUntilWorldMs: null,
    }));
    synced.world.nextFoodSequence = 13;
    const points = [];
    for (let i = 0; i < 128; i += 1) {
      points.push({ x: 0, z: 2 - i * 0.04 });
    }
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
      length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    }
    synced.world.residents[0].activity = 'wandering';
    synced.world.residents[0].route = {
      points,
      length,
      startedWorldMs: 0,
      cycleCount: 6,
      distanceAlong: 0,
    };
    const text = serializeEnvelope(
      createFreshEnvelope({
        nowWallMs: 1_700_000_000_000,
        revision: 1,
        state: synced,
      }),
    );
    assert.ok(text.length <= SAVE_TEXT_MAX_LENGTH, `serialized ${text.length} bytes`);
    const parsed = validateSave(text);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.kind, 'current');
      assert.equal(parsed.save.state.slimes.length, 10);
      assert.equal(parsed.save.state.world.foods.length, 12);
      assert.equal(parsed.save.state.world.residents[0].route.points.length, 128);
    }
  });
});

describe('validate module isolation', () => {
  test('validate.mjs does not import DOM, Three, performance, Date, or randomness', () => {
    const source = readFileSync(join(coreDir, 'validate.mjs'), 'utf8');
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
        `validate.mjs must not contain ${pattern}`,
      );
    }
    const legacySource = readFileSync(join(coreDir, 'validate-legacy.mjs'), 'utf8');
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(legacySource),
        false,
        `validate-legacy.mjs must not contain ${pattern}`,
      );
    }
  });
});
