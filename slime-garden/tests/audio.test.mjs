import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createAudio } from '../src/audio/audio.mjs';

describe('audio cues', () => {
  test('missing AudioContext never throws through play or unlock', () => {
    const audio = createAudio({});
    audio.setEnabled(true);
    assert.doesNotThrow(() => audio.unlock());
    assert.doesNotThrow(() => audio.playFeed());
    assert.doesNotThrow(() => audio.playUpgrade());
    assert.doesNotThrow(() => audio.playWelcome());
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
});
