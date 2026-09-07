import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, gatherContactVoice } from '../audio.js';

test('field contact voices map till/plant/harvest/uproot without doubling completion types', () => {
  assert.equal(gatherContactVoice({ type: 'gatherContact', style: 'till', kind: 'earth', sound: 'thud' }), 'thud');
  assert.equal(gatherContactVoice({ type: 'gatherContact', style: 'plant', kind: 'earth', sound: 'rustle' }), 'rustle');
  assert.equal(gatherContactVoice({ type: 'gatherContact', style: 'tug', kind: 'carrot', sound: 'pull' }), 'pull');
  assert.equal(gatherContactVoice({ type: 'gatherContact', style: 'uproot', kind: 'potato', sound: 'pull' }), 'pull');
  assert.equal(gatherContactVoice({ type: 'gatherContact', kind: 'wood' }), 'wood');
  assert.equal(gatherContactVoice({ type: 'gatherContact', kind: 'earth' }), 'earth');
  assert.equal(gatherContactVoice({ type: 'tilled' }), null);
  assert.equal(gatherContactVoice({ type: 'planted' }), null);
  assert.equal(gatherContactVoice({ type: 'harvestedCrop' }), null);
  assert.equal(gatherContactVoice({ type: 'uprooted' }), null);
});

test('muted or paused audio ignores field contact events without opening Web Audio', () => {
  const sound = createAudio();
  assert.doesNotThrow(() => {
    sound.event({ type: 'gatherContact', style: 'till', sound: 'thud', kind: 'earth' });
    sound.event({ type: 'gatherContact', style: 'plant', sound: 'rustle', kind: 'earth' });
    sound.event({ type: 'gatherContact', style: 'tug', sound: 'pull', kind: 'carrot' });
    sound.event({ type: 'gatherContact', style: 'uproot', sound: 'pull', kind: 'carrot' });
    sound.pause(true);
    sound.event({ type: 'gatherContact', style: 'till', sound: 'thud', kind: 'earth' });
    sound.event({ type: 'planted' });
    sound.event({ type: 'harvestedCrop' });
    sound.event({ type: 'uprooted' });
  });
});
