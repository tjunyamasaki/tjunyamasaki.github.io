// Small synthesized soundscape: nothing is downloaded. Wind and birdsong by
// day, crickets by night, and a voice for every thump, chime and bell.
export function createAudio() {
  let ctx = null, master = null, bed = null, enabled = false, night = 0;
  const PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // Wind: looping filtered noise, slowly swelling.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.2; }
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 520;
    bed = ctx.createGain();
    bed.gain.value = 0.05;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain); lfoGain.connect(bed.gain);
    src.connect(filter); filter.connect(bed); bed.connect(master);
    src.start(); lfo.start();
    setInterval(ambient, 900);
  }

  function env(node, start, attack, peak, decay) {
    node.gain.setValueAtTime(0.0001, start);
    node.gain.exponentialRampToValueAtTime(peak, start + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  }
  function tone(freq, { at = 0, type = 'sine', attack = 0.01, decay = 0.5, vol = 0.12, slide = 0, filter = 0 } = {}) {
    if (!enabled || !ctx) return;
    const start = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, start + attack + decay);
    env(g, start, attack, vol, decay);
    let out = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); out = f; }
    out.connect(g); g.connect(master);
    o.start(start); o.stop(start + attack + decay + 0.05);
  }
  function noise({ at = 0, decay = 0.25, vol = 0.2, freq = 400, q = 0.8 } = {}) {
    if (!enabled || !ctx) return;
    const start = ctx.currentTime + at;
    const len = Math.ceil(ctx.sampleRate * (decay + 0.05));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    env(g, start, 0.005, vol, decay);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(start);
  }

  function ambient() {
    if (!enabled || !ctx || Math.random() > 0.35) return;
    if (night < 0.5) {
      // A bird: two or three quick upward chirps.
      const base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone(base * (1 + Math.random() * 0.15), { at: i * 0.11, decay: 0.07, vol: 0.018, slide: 1.35, attack: 0.005 });
    } else {
      for (let i = 0; i < 6; i++) tone(4200, { at: i * 0.05, decay: 0.03, vol: 0.01, type: 'triangle' });
    }
  }

  const sfx = {
    hover() { tone(880, { decay: 0.05, vol: 0.02, type: 'triangle' }); },
    rotate() { noise({ decay: 0.06, vol: 0.06, freq: 2400, q: 3 }); tone(660, { decay: 0.06, vol: 0.03, type: 'triangle' }); },
    land() {
      noise({ decay: 0.22, vol: 0.35, freq: 180, q: 0.7 });
      tone(110, { decay: 0.25, vol: 0.2, slide: 0.6 });
      [0, 1, 2].forEach(i => tone(PENTA[4 + i * 2], { at: 0.35 + i * 0.09, decay: 0.6, vol: 0.035, type: 'triangle' }));
    },
    follower() { tone(520, { decay: 0.12, vol: 0.1, slide: 1.6, type: 'triangle' }); noise({ at: 0.08, decay: 0.06, vol: 0.12, freq: 900 }); },
    score(points, kind) {
      if (kind === 'monastery') {
        [1, 2.76, 5.4].forEach((m, i) => tone(196 * m, { decay: 2.6 - i * 0.6, vol: 0.08 / (i + 1), attack: 0.004 }));
        tone(196, { at: 0.9, decay: 2, vol: 0.05 });
      }
      const n = Math.min(8, 2 + Math.floor(points / 3));
      for (let i = 0; i < n; i++) tone(PENTA[(i * 2) % PENTA.length], { at: 0.12 + i * 0.075, decay: 0.5, vol: 0.06, type: 'triangle' });
      if (kind === 'city' && points >= 8) [392, 493.88, 587.33].forEach(f => tone(f, { at: 0.12 + n * 0.075, decay: 1.4, vol: 0.05, type: 'sawtooth', filter: 1600, attack: 0.04 }));
    },
    quiet() { tone(330, { decay: 0.4, vol: 0.04, type: 'triangle' }); },
    discard() { tone(300, { decay: 0.5, vol: 0.08, slide: 0.5, type: 'triangle' }); },
    turn() { tone(784, { decay: 0.25, vol: 0.04, type: 'triangle' }); tone(1046.5, { at: 0.08, decay: 0.3, vol: 0.035, type: 'triangle' }); },
    fanfare() {
      [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.16, decay: i === 5 ? 1.8 : 0.35, vol: 0.07, type: 'sawtooth', filter: 2200, attack: 0.02 }));
      [261.63, 329.63, 392].forEach(f => tone(f, { at: 0.8, decay: 2.2, vol: 0.05, type: 'triangle' }));
    },
  };

  return {
    ...sfx,
    get enabled() { return enabled; },
    async setEnabled(on) {
      init();
      if (!ctx) return false;
      enabled = on;
      if (on) await ctx.resume().catch(() => {});
      master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.15);
      return enabled;
    },
    setNight(n) {
      night = n;
      if (bed && ctx) bed.gain.setTargetAtTime(0.05 * (1 - n * 0.6), ctx.currentTime, 1);
    },
    suspend(off) { if (ctx) (off ? ctx.suspend() : enabled ? ctx.resume() : Promise.resolve()).catch(() => {}); },
  };
}
