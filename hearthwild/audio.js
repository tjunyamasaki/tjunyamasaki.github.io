// Original quiet synthesized sound. Nothing downloads; playback requires opt-in.

export function gatherContactVoice(e) {
  if (!e || e.type !== 'gatherContact') return null;
  if (e.sound === 'thud' || e.style === 'till') return 'thud';
  if (e.sound === 'rustle' || e.style === 'plant') return 'rustle';
  if (e.sound === 'pull' || e.style === 'tug' || e.style === 'uproot') return 'pull';
  if (e.kind === 'wood') return 'wood';
  if (e.kind === 'stone') return 'stone';
  if (e.kind === 'copper') return 'copper';
  if (e.kind === 'earth') return 'earth';
  return 'leaf';
}

export function createAudio() {
  let context;
  let master;
  let enabled = false;
  let suspended = false;

  function initialize() {
    if (context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio unavailable');
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    for (const frequency of [130.81, 196, 261.63]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.value = 0.012;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
    }
  }

  async function setEnabled(value) {
    if (value) {
      initialize();
      if (!suspended) await context.resume();
    }
    enabled = value;
    if (master) master.gain.setTargetAtTime(enabled && !suspended ? 0.65 : 0, context.currentTime, 0.12);
    return enabled;
  }

  function pause(value) {
    suspended = value;
    if (!context) return;
    if (value) void context.suspend().catch(() => {});
    else if (enabled) void context.resume().catch(() => {});
    master.gain.setTargetAtTime(enabled && !suspended ? 0.65 : 0, context.currentTime, 0.1);
  }

  function note(frequency, delay = 0, length = 0.85, volume = 0.1, type = 'sine', endFrequency = null) {
    if (!enabled || !context || suspended) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (endFrequency != null) osc.frequency.exponentialRampToValueAtTime(Math.max(endFrequency, 1), start + length);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.018, length * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + length + 0.03);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  function earthThud() {
    note(98, 0, 0.16, 0.024, 'sine', 62);
    note(61.74, 0.012, 0.12, 0.014, 'triangle', 49);
  }

  function seedRustle() {
    [784, 932, 1047, 880].forEach((frequency, i) => {
      note(frequency, i * 0.016, 0.042, 0.01 + (i % 2) * 0.003, 'triangle');
    });
  }

  function rootPull(short = false) {
    const length = short ? 0.12 : 0.18;
    const volume = short ? 0.014 : 0.018;
    note(174.61, 0, length, volume, 'sine', 220);
    note(130.81, 0.02, length * 0.75, volume * 0.7, 'triangle', 164.81);
  }

  function event(e) {
    if (e.type === 'entered') note(392, 0, 1.1, 0.06);
    if (e.type === 'returned') [329.63, 392, 523.25].forEach((n, i) => note(n, i * 0.1, 0.9, 0.055));
    if (e.type === 'harvested') [349.23, 440].forEach((n, i) => note(n, i * 0.07, 0.45, 0.05));
    if (e.type === 'cleared') note(293.66, 0, 0.4, 0.04);
    if (e.type === 'placed') [392, 523.25].forEach((n, i) => note(n, i * 0.06, 0.4, 0.045));
    if (e.type === 'moved') note(349.23, 0, 0.35, 0.04);
    if (e.type === 'removed') [329.63, 261.63].forEach((n, i) => note(n, i * 0.07, 0.45, 0.04));
    if (e.type === 'queued') [261.63, 329.63].forEach((n, i) => note(n, i * 0.05, 0.35, 0.04));
    if (e.type === 'smelted') [392, 493.88].forEach((n, i) => note(n, i * 0.08, 0.5, 0.05));
    if (e.type === 'collected') [440, 523.25].forEach((n, i) => note(n, i * 0.07, 0.45, 0.05));
    if (e.type === 'crafted') [329.63, 392, 523.25].forEach((n, i) => note(n, i * 0.08, 0.55, 0.05));
    if (e.type === 'planted' || e.type === 'plantedTree') [349.23, 440].forEach((n, i) => note(n, i * 0.07, 0.4, 0.04));
    if (e.type === 'harvestedCrop') [392, 523.25].forEach((n, i) => note(n, i * 0.07, 0.5, 0.05));
    if (e.type === 'uprooted') note(293.66, 0, 0.35, 0.04);
    if (e.type === 'cropReady' || e.type === 'treeGrown') [440, 523.25, 659.25].forEach((n, i) => note(n, i * 0.08, 0.45, 0.045));
    if (e.type === 'gatherContact') {
      const voice = gatherContactVoice(e);
      if (voice === 'thud') earthThud();
      else if (voice === 'rustle') seedRustle();
      else if (voice === 'pull') rootPull(e.style === 'uproot');
      else if (voice === 'wood') note(196, 0, 0.07, 0.022);
      else if (voice === 'stone') note(311.13, 0, 0.05, 0.02);
      else if (voice === 'copper') note(369.99, 0, 0.06, 0.02);
      else if (voice === 'earth') note(174.61, 0, 0.08, 0.018);
      else note(262.0, 0, 0.09, 0.016);
    }
  }

  return { setEnabled, pause, event };
}
