/**
 * P2-13 live wiring: headless throw → eat loop and controller source contracts.
 * Does not import main.mjs (that module binds DOM on load).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { advanceActive } from '../src/core/active.mjs';
import { MICRO_PER_GLOW } from '../src/core/balance.mjs';
import { applyCommand, completeHint } from '../src/core/commands.mjs';
import { resolveNearSelectedTarget } from '../src/core/selectors.mjs';
import { cloneState, createInitialState } from '../src/core/state.mjs';
import {
  formatArrivalStatus,
  formatMealCompleteStatus,
  formatThrowReject,
  HUD_COPY,
} from '../src/ui/format.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '../src');

function readSrc(name) {
  return readFileSync(join(srcDir, name), 'utf8');
}

describe('P2-13 live controller source', () => {
  test('main uses advanceActive, world presentation, THROW_FOOD, and no instant feed/welcome', () => {
    const main = readSrc('main.mjs');
    assert.match(main, /from '\.\/core\/active\.mjs'/);
    assert.match(main, /advanceActive/);
    assert.equal(/from '\.\/core\/advance\.mjs'/.test(main), false);
    assert.match(main, /presentation:\s*'world'/);
    assert.match(main, /createPointerRouter/);
    assert.match(main, /completeHint/);
    assert.match(main, /setRendererAvailable\(false\)/);
    assert.match(main, /formatThrowReject/);
    assert.match(main, /formatMealCompleteStatus/);
    assert.match(main, /HUD_COPY\.berryTossed/);
    assert.match(main, /formatArrivalStatus/);
    assert.equal(/type:\s*'FEED'/.test(main), false);
    assert.equal(/WELCOME_COMPANION/.test(main), false);
    assert.equal(/A companion is ready/.test(main), false);
    assert.equal(/Offered a berry/.test(main), false);
    assert.equal(/companionWasReady/.test(main), false);
    assert.equal(/welcomeCompanion/.test(main), false);
    assert.equal(/feedSelected/.test(main), false);
  });

  test('HUD exposes selectObject for world object picks', () => {
    const dom = readSrc('ui/dom.mjs');
    assert.match(dom, /function selectObject\(id\)/);
    assert.match(dom, /selectObject,/);
  });
});

describe('P2-13 headless live loop', () => {
  test('throw → advanceActive meal → Glow up, then offer-near reject copy', () => {
    const fresh = createInitialState();
    const near = resolveNearSelectedTarget(fresh, 'slime-1');
    assert.ok(near);

    const thrown = applyCommand(fresh, {
      type: 'THROW_FOOD',
      target: { x: 1.1, z: 2 },
    });
    assert.equal(thrown.ok, true);
    assert.equal(thrown.state.berries, fresh.berries - 1);
    assert.ok(thrown.events.some((event) => event.type === 'FOOD_THROWN'));
    assert.equal(HUD_COPY.berryTossed, 'Berry tossed');

    const eaten = advanceActive(thrown.state, 1400);
    const fed = eaten.events.find((event) => event.type === 'FED');
    assert.ok(fed);
    assert.equal(eaten.state.totalFeeds, 1);
    assert.ok(eaten.state.glowMicro > thrown.state.glowMicro);
    assert.equal(
      formatMealCompleteStatus('Slime 1', 120_000),
      'Slime 1 enjoyed a berry · Cozy bonus 2:00',
    );
    assert.equal(formatArrivalStatus('Slime 2'), 'Slime 2 joined the farm');

    const empty = cloneState(eaten.state);
    empty.berries = 0;
    empty.nextBerryAtMs = empty.simTimeMs + 8_000;
    assert.equal(formatThrowReject('NO_BERRIES', empty), 'More berries in 0:08');
    assert.equal(formatThrowReject('NO_VALID_TARGET', empty), HUD_COPY.noValidTarget);
    assert.equal(formatThrowReject('INVALID_TARGET'), HUD_COPY.invalidTarget);

    const pet = completeHint(eaten.state, 'pet');
    const camera = completeHint(pet.state, 'camera');
    assert.ok(camera.state.tutorialCompleted.includes('pet'));
    assert.ok(camera.state.tutorialCompleted.includes('camera'));
    assert.equal(camera.state.glowMicro, eaten.state.glowMicro);
    assert.equal(camera.state.berries, eaten.state.berries);

    const rich = cloneState(camera.state);
    rich.glowMicro = 40 * MICRO_PER_GLOW;
    const bought = applyCommand(rich, {
      type: 'BUY_UPGRADE',
      upgradeId: 'beds',
      expectedLevel: rich.upgrades.beds,
    });
    assert.equal(bought.ok, true);
    assert.equal(bought.state.upgrades.beds, rich.upgrades.beds + 1);
  });
});
