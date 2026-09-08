import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  AUTO_P90_LIMIT_MS,
  AUTO_SAMPLE_WINDOW_MS,
  AUTO_SLOW_WINDOWS_TO_DROP,
  AUTO_WARMUP_MS,
  createAutoQualityGovernor,
  dprFor,
  frameIntervalStats,
  HIGH_DPR_CAP,
  LOW_DPR_CAP,
  percentile,
  tierFor,
} from '../src/scene/quality.mjs';

describe('quality helpers', () => {
  test('tier and DPR caps do not reduce geometry; they only cap pixels', () => {
    assert.equal(tierFor('auto'), 'high');
    assert.equal(tierFor('high'), 'high');
    assert.equal(tierFor('low'), 'low');
    assert.equal(dprFor('high', 3), HIGH_DPR_CAP);
    assert.equal(dprFor('auto', 2), HIGH_DPR_CAP);
    assert.equal(dprFor('low', 3), LOW_DPR_CAP);
    assert.equal(dprFor('low', 0.75), 0.75);
  });

  test('percentile and frame stats match linear interpolation', () => {
    assert.ok(Number.isNaN(percentile([], 0.5)));
    assert.equal(percentile([10], 0.9), 10);
    assert.equal(percentile([1, 2, 3, 4], 0), 1);
    assert.equal(percentile([1, 2, 3, 4], 1), 4);
    const stats = frameIntervalStats([16, 16, 17, 40]);
    assert.equal(stats.count, 4);
    assert.equal(stats.median, 16.5);
    assert.ok(stats.p95 > stats.p90);
  });

  test('auto governor starts high and drops after two slow windows', () => {
    const gov = createAutoQualityGovernor();
    let now = 0;
    assert.equal(gov.observe(now, 16), 'high');
    now = AUTO_WARMUP_MS;
    assert.equal(gov.warmed, false);
    assert.equal(gov.observe(now, 16), 'high');
    assert.equal(gov.warmed, true);

    for (let window = 0; window < AUTO_SLOW_WINDOWS_TO_DROP; window += 1) {
      const start = now;
      for (let i = 0; i < 25; i += 1) {
        now = start + 200 * (i + 1);
        gov.observe(now, AUTO_P90_LIMIT_MS + 8);
      }
      now = start + AUTO_SAMPLE_WINDOW_MS;
      const tier = gov.observe(now, AUTO_P90_LIMIT_MS + 8);
      if (window === 0) {
        assert.equal(tier, 'high');
        assert.equal(gov.dropped, false);
      } else {
        assert.equal(tier, 'low');
        assert.equal(gov.dropped, true);
      }
    }

    now += AUTO_SAMPLE_WINDOW_MS;
    for (let i = 0; i < 25; i += 1) {
      assert.equal(gov.observe(now + i * 16, 8), 'low');
    }
  });
});
