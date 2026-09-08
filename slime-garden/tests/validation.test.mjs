import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { NAME_MAX_LENGTH } from '../src/core/balance.mjs';
import { createInitialState } from '../src/core/state.mjs';
import {
  SAVE_TEXT_MAX_LENGTH,
  createDefaultSettings,
  createFreshEnvelope,
  serializeEnvelope,
  validateSave,
} from '../src/core/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, '../src/core');
const fixturesDir = join(here, 'fixtures');

const validFixtureText = readFileSync(join(fixturesDir, 'valid-v1.json'), 'utf8');
const futureFixtureText = readFileSync(join(fixturesDir, 'schema-v2.json'), 'utf8');

/**
 * @param {object} [patch]
 */
function makeEnvelope(patch = {}) {
  const base = createFreshEnvelope({
    nowWallMs: 1_700_000_000_000,
    revision: 1,
  });
  const statePatch = patch.state ?? {};
  return {
    ...base,
    ...patch,
    settings: { ...base.settings, ...(patch.settings ?? {}) },
    state: {
      ...base.state,
      ...statePatch,
      upgrades: { ...base.state.upgrades, ...(statePatch.upgrades ?? {}) },
      slimes: statePatch.slimes
        ? statePatch.slimes.map((slime) => ({ ...slime }))
        : base.state.slimes.map((slime) => ({ ...slime })),
      tutorialCompleted: statePatch.tutorialCompleted
        ? [...statePatch.tutorialCompleted]
        : [...base.state.tutorialCompleted],
    },
  };
}

/**
 * @param {object} [patch]
 */
function envelopeText(patch = {}) {
  return JSON.stringify(makeEnvelope(patch));
}

describe('validateSave', () => {
  test('accepts a valid fresh envelope and the v1 fixture', () => {
    const fresh = createFreshEnvelope({ nowWallMs: 1_700_000_000_000, revision: 0 });
    const fromFresh = validateSave(serializeEnvelope(fresh));
    assert.equal(fromFresh.ok, true);
    if (fromFresh.ok) {
      assert.equal(fromFresh.save.gameId, 'cozy-slime-mvp');
      assert.equal(fromFresh.save.schemaVersion, 1);
      assert.equal(fromFresh.save.balanceVersion, 1);
      assert.equal(fromFresh.save.revision, 0);
      assert.equal(fromFresh.save.savedWallMs, 1_700_000_000_000);
      assert.deepEqual(fromFresh.save.settings, createDefaultSettings());
      assert.deepEqual(fromFresh.save.state, createInitialState());
    }

    const fromFixture = validateSave(validFixtureText);
    assert.equal(fromFixture.ok, true);
    if (fromFixture.ok) {
      assert.equal(fromFixture.save.revision, 1);
      assert.equal(fromFixture.save.state.slimes[0].id, 'slime-1');
      assert.equal(fromFixture.save.state.berries, 6);
      assert.equal(fromFixture.save.state.nextBerryAtMs, 15_000);
    }
  });

  test('strips extra enumerable fields from the reconstructed envelope', () => {
    const base = makeEnvelope();
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

  test('schemaVersion 2 is FUTURE_VERSION, not INVALID_STATE', () => {
    const fromFixture = validateSave(futureFixtureText);
    assert.equal(fromFixture.ok, false);
    assert.equal(fromFixture.reason, 'FUTURE_VERSION');

    const fromMinimal = validateSave(
      JSON.stringify({
        gameId: 'cozy-slime-mvp',
        schemaVersion: 2,
      }),
    );
    assert.equal(fromMinimal.reason, 'FUTURE_VERSION');
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
      validateSave(envelopeText({ balanceVersion: 2 })).reason,
      'INVALID_STATE',
    );
    assert.equal(
      validateSave(envelopeText({ settings: { ...createDefaultSettings(), quality: 'medium' } }))
        .reason,
      'INVALID_STATE',
    );
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
  });
});
