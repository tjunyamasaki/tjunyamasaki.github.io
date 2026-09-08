import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { absorbFrameDelta, flushWholeMs } from '../src/core/clock-carry.mjs';

const here = dirname(fileURLToPath(import.meta.url));

describe('clock carry', () => {
  test('144 frames of 1000/144 ms settle 1000 ms without dropping a second', () => {
    let carry = 0;
    let advanced = 0;
    const frame = 1000 / 144;
    for (let i = 0; i < 144; i += 1) {
      carry = absorbFrameDelta(carry, frame);
      const flushed = flushWholeMs(carry);
      carry = flushed.carryMs;
      advanced += flushed.elapsedMs;
    }
    assert.ok(
      advanced >= 999 && advanced <= 1000,
      `expected ~1000 ms, got ${advanced} with leftover ${carry}`,
    );
    assert.ok(carry >= 0 && carry < 1);
    assert.ok(Math.abs(advanced + carry - 1000) < 1e-9);
  });

  test('explicit settlement timestamp matches the summed integer flushes', () => {
    let carry = 0;
    let advanced = 0;
    const stamps = [];
    let t = 0;
    for (let i = 0; i < 144; i += 1) {
      t += 1000 / 144;
      stamps.push(t);
    }
    let prev = 0;
    for (const stamp of stamps) {
      carry = absorbFrameDelta(carry, stamp - prev);
      prev = stamp;
      const flushed = flushWholeMs(carry);
      carry = flushed.carryMs;
      advanced += flushed.elapsedMs;
    }
    const settled = Math.floor(stamps[stamps.length - 1]);
    assert.equal(advanced, settled);
  });

  test('negative, NaN, and zero deltas do not rewind or invent time', () => {
    assert.equal(absorbFrameDelta(0.4, -8), 0.4);
    assert.equal(absorbFrameDelta(0.4, Number.NaN), 0.4);
    assert.equal(flushWholeMs(-3).elapsedMs, 0);
    assert.equal(flushWholeMs(0).elapsedMs, 0);
    assert.equal(flushWholeMs(0.999).elapsedMs, 0);
    assert.equal(flushWholeMs(1).elapsedMs, 1);
  });
});

describe('clock-carry module isolation', () => {
  test('clock-carry.mjs does not import DOM, Three, Date, or randomness', () => {
    const source = readFileSync(join(here, '../src/core/clock-carry.mjs'), 'utf8');
    for (const pattern of [
      /\bdocument\b/,
      /\bwindow\b/,
      /\blocalStorage\b/,
      /from\s+['"][^'"]*three/i,
      /performance\s*\./,
      /\bDate\s*\./,
      /Math\s*\.\s*random/,
    ]) {
      assert.equal(pattern.test(source), false, String(pattern));
    }
  });
});
