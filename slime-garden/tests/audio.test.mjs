import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createAudio, FEED_CUE_MIN_INTERVAL_MS } from '../src/audio/audio.mjs';

describe('audio cues', () => {
  test('missing AudioContext never throws through play or unlock', () => {
    const audio = createAudio({});
    audio.setEnabled(true);
    assert.doesNotThrow(() => audio.unlock());
    assert.doesNotThrow(() => audio.playFeed());
    assert.doesNotThrow(() => audio.playUpgrade());
    assert.doesNotThrow(() => audio.playWelcome());
    assert.doesNotThrow(() => audio.playPet());
    assert.doesNotThrow(() => audio.dispose());
  });

  test('disabled cues do not construct a context', () => {
    let constructed = 0;
    class FakeContext {
      constructor() {
        constructed += 1;
        this.state = 'running';
        this.currentTime = 0;
        this.destination = {};
      }
      createOscillator() {
        throw new Error('should not run while disabled');
      }
      createGain() {
        throw new Error('should not run while disabled');
      }
    }
    const audio = createAudio({ AudioContext: FakeContext });
    audio.setEnabled(false);
    audio.playFeed();
    assert.equal(constructed, 0);
    audio.setEnabled(true);
    audio.playFeed();
    assert.equal(constructed, 1);
  });

  test('oscillator failures are swallowed', () => {
    class FakeContext {
      constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = {};
      }
      createOscillator() {
        throw new Error('no oscillator');
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
        };
      }
    }
    const audio = createAudio({ AudioContext: FakeContext });
    audio.setEnabled(true);
    assert.doesNotThrow(() => audio.playWelcome());
  });

  test('playFeed limiter allows at most one cue per 150 ms', () => {
    let tones = 0;
    class FakeContext {
      constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = {};
      }
      createOscillator() {
        tones += 1;
        return {
          type: 'sine',
          frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
        };
      }
    }
    const audio = createAudio({ AudioContext: FakeContext });
    audio.setEnabled(true);
    audio.playFeed(0);
    audio.playFeed(FEED_CUE_MIN_INTERVAL_MS - 1);
    audio.playFeed(FEED_CUE_MIN_INTERVAL_MS);
    assert.equal(tones, 2);
    assert.doesNotThrow(() => audio.playPet());
  });
});
