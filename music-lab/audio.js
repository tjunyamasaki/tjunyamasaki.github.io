// Every instrument is synthesized with Web Audio (oscillators, noise and
// Karplus-Strong strings), so the page ships no samples.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const INSTRUMENTS = {
  piano: { name: 'Piano', color: '#7aa2ff', send: 0.22, center: 62 },
  guitar: { name: 'Guitar', color: '#f4a259', send: 0.16, center: 55 },
  bass: { name: 'Bass', color: '#b48cff', send: 0.03, center: 40 },
  synth: { name: 'Synth', color: '#4fd1c5', send: 0.2, center: 67 },
  pad: { name: 'Pad', color: '#8be0a4', send: 0.45, center: 60 },
  bells: { name: 'Bells', color: '#f3d36b', send: 0.35, center: 74 },
  organ: { name: 'Organ', color: '#ff8a80', send: 0.18, center: 60 },
  drums: { name: 'Drums', color: '#f47fb4', send: 0.1, drums: true },
};

export const DRUMS = ['Kick', 'Snare', 'Clap', 'Hi-hat', 'Open hat', 'Low tom', 'High tom', 'Rim'];

const perCtx = new WeakMap();
function cache(ctx) {
  let c = perCtx.get(ctx);
  if (!c) perCtx.set(ctx, (c = {}));
  return c;
}

function noiseBuffer(ctx) {
  const c = cache(ctx);
  if (!c.noise) {
    const n = Math.floor(ctx.sampleRate * 2);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    c.noise = b;
  }
  return c.noise;
}

function impulse(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.6);
  const pre = Math.floor(sr * 0.012);
  const b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      // The tail gets darker as it decays, like a real room.
      const a = 0.85 - 0.7 * Math.min(1, t / 1.8);
      lp += a * (Math.random() * 2 - 1 - lp);
      const fadeIn = Math.min(1, (i - pre) / (sr * 0.008));
      d[i] = lp * Math.exp(-t * 2.7) * fadeIn;
    }
  }
  return b;
}

// Karplus-Strong plucked string, rendered once per pitch and sample rate.
const strings = new Map();
function stringBuffer(ctx, p) {
  const sr = ctx.sampleRate;
  const key = sr + ':' + p;
  let e = strings.get(key);
  if (e) return e;
  const f = mtof(p);
  const N = Math.max(4, Math.round(sr / f - 0.5));
  const len = Math.floor(sr * 2.6);
  const b = ctx.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  let prev = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    prev = prev * 0.35 + (Math.random() * 2 - 1) * 0.65;
    d[i] = prev;
    mean += prev;
  }
  mean /= N;
  for (let i = 0; i < N; i++) d[i] -= mean;
  const rho = Math.exp(-1 / (1.5 * f));
  d[N] = rho * 0.5 * d[0];
  for (let i = N + 1; i < len; i++) d[i] = rho * 0.5 * (d[i - N] + d[i - N - 1]);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const fade = Math.floor(sr * 0.4);
  for (let i = 0; i < len; i++) {
    d[i] *= 0.9 / (peak || 1);
    if (i > len - fade) d[i] *= (len - i) / fade;
  }
  // The averaging filter adds half a sample of delay; playbackRate corrects the tuning.
  e = { buffer: b, rate: f / (sr / (N + 0.5)) };
  strings.set(key, e);
  return e;
}

// A single sounding note. Instruments build their nodes into `out`; release()
// and kill() handle the end of the note uniformly.
class Voice {
  constructor(ctx, dest, t) {
    this.ctx = ctx;
    this.t = t;
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.srcs = [];
    this.rel = 0.05;
    this.natEnd = Infinity;
    this.endAt = Infinity;
    this.oneShot = false;
  }

  osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(this.t);
    this.srcs.push(o);
    return o;
  }

  noise() {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuffer(this.ctx);
    s.loop = true;
    s.start(this.t, Math.random() * 1.5);
    this.srcs.push(s);
    return s;
  }

  gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  release(r) {
    if (this.released) return;
    this.released = true;
    if (this.oneShot) return;
    r = Math.max(r, this.t + 0.01);
    const g = this.out.gain;
    g.cancelScheduledValues(r);
    g.setTargetAtTime(0, r, this.rel);
    this.halt(Math.min(this.natEnd, r + this.rel * 8));
  }

  halt(end) {
    if (this.halted) return;
    this.halted = true;
    this.endAt = end;
    for (const s of this.srcs) {
      try {
        s.stop(end);
      } catch {}
    }
    if (this.srcs[0]) {
      this.srcs[0].onended = () => {
        try {
          this.out.disconnect();
        } catch {}
      };
    }
  }

  kill(now) {
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0, now, 0.012);
    this.released = true;
    this.halt(now + 0.12);
    this.endAt = Math.min(this.endAt, now + 0.12);
  }
}

// Attack and decay use setTargetAtTime so a release can cut in at any moment
// without a jump in level.
function adsr(param, t, a, peak, d, s) {
  param.setValueAtTime(0, t);
  param.setTargetAtTime(peak, t, a / 3);
  param.setTargetAtTime(peak * s, t + a, d / 3);
}

function hit(param, t, peak, tau, delay = 0) {
  param.setValueAtTime(peak, t);
  param.setTargetAtTime(0, t + delay, tau);
}

const DRUM_KIT = [
  // Kick
  (v, vel) => {
    const { t } = v;
    const o = v.osc('sine', 155);
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.13);
    const g = v.gain(0);
    hit(g.gain, t, vel * 1.15, 0.12, 0.04);
    o.connect(g).connect(v.out);
    const n = v.noise();
    const ng = v.gain(0);
    hit(ng.gain, t, 0.16 * vel, 0.004);
    n.connect(v.filter('highpass', 1800)).connect(ng).connect(v.out);
    v.natEnd = t + 0.75;
  },
  // Snare
  (v, vel) => {
    const { t } = v;
    const n = v.noise();
    const ng = v.gain(0);
    hit(ng.gain, t, 0.6 * vel, 0.055);
    n.connect(v.filter('highpass', 1300)).connect(v.filter('peaking', 4200, 1)).connect(ng).connect(v.out);
    const o = v.osc('triangle', 190);
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = v.gain(0);
    hit(og.gain, t, 0.55 * vel, 0.045);
    o.connect(og).connect(v.out);
    v.natEnd = t + 0.45;
  },
  // Clap
  (v, vel) => {
    const { t } = v;
    const n = v.noise();
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    for (let k = 0; k < 3; k++) {
      g.gain.setValueAtTime(1.5 * vel, t + k * 0.011);
      g.gain.setTargetAtTime(0.08, t + k * 0.011 + 0.001, 0.004);
    }
    g.gain.setValueAtTime(1.3 * vel, t + 0.034);
    g.gain.setTargetAtTime(0, t + 0.035, 0.075);
    n.connect(v.filter('bandpass', 1150, 1.1)).connect(g).connect(v.out);
    v.natEnd = t + 0.55;
  },
  // Closed hat
  (v, vel) => metal(v, vel, 0.022, 0.3),
  // Open hat
  (v, vel) => metal(v, vel, 0.16, 0.24),
  // Low tom
  (v, vel) => tom(v, vel, 98),
  // High tom
  (v, vel) => tom(v, vel, 150),
  // Rim
  (v, vel) => {
    const { t } = v;
    const o = v.osc('triangle', 1750);
    const og = v.gain(0);
    hit(og.gain, t, 0.5 * vel, 0.009);
    o.connect(og).connect(v.out);
    const n = v.noise();
    const ng = v.gain(0);
    hit(ng.gain, t, 0.35 * vel, 0.01);
    n.connect(v.filter('bandpass', 3400, 2)).connect(ng).connect(v.out);
    v.natEnd = t + 0.15;
  },
];

function metal(v, vel, tau, amount) {
  const { t } = v;
  const bp = v.filter('bandpass', 10000, 0.8);
  const g = v.gain(0);
  for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) v.osc('square', 40 * r).connect(bp);
  bp.connect(v.filter('highpass', 7000)).connect(g).connect(v.out);
  hit(g.gain, t, amount * vel, tau, 0.002);
  v.natEnd = t + tau * 9 + 0.05;
}

function tom(v, vel, f0) {
  const { t } = v;
  const o = v.osc('sine', f0 * 1.6);
  o.frequency.setValueAtTime(f0 * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(f0, t + 0.16);
  const g = v.gain(0);
  hit(g.gain, t, 0.9 * vel, 0.16, 0.01);
  o.connect(g).connect(v.out);
  const n = v.noise();
  const ng = v.gain(0);
  hit(ng.gain, t, 0.12 * vel, 0.02);
  n.connect(v.filter('bandpass', f0 * 4, 1)).connect(ng).connect(v.out);
  v.natEnd = t + 0.95;
}

const PLAY = {
  piano(v, p, vel) {
    const { t } = v;
    const f = mtof(p);
    const bright = Math.min(16000, f * (4 + vel * 10) + 600);
    const lp = v.filter('lowpass', bright, 0.4);
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.setTargetAtTime(Math.min(bright, f * 3 + 500), t + 0.02, 0.5);
    lp.connect(v.out);
    const mix = v.gain(0.2 * vel);
    mix.connect(lp);
    const len = 1.2 + 4 * Math.pow(2, -(p - 48) / 14);
    [1, 0.42, 0.24, 0.13, 0.08, 0.05].forEach((a, i) => {
      const n = i + 1;
      const fr = f * n * Math.sqrt(1 + 0.0003 * n * n);
      if (fr > 18000) return;
      const g = v.gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.003);
      g.gain.setTargetAtTime(a * 0.45, t + 0.003, 0.12);
      g.gain.setTargetAtTime(0, t + 0.25, len / (3 * (1 + i * 0.9)));
      g.connect(mix);
      v.osc('sine', fr).connect(g);
      if (i < 2) {
        const o = v.osc('sine', fr);
        o.detune.value = 2.5;
        o.connect(g);
      }
    });
    const hammer = v.gain(0);
    hit(hammer.gain, t, 0.25 * vel, 0.008);
    v.noise().connect(v.filter('bandpass', Math.min(f * 6, 9000), 1)).connect(hammer).connect(lp);
    v.rel = 0.09;
    v.natEnd = t + len * 1.6;
  },

  guitar(v, p, vel) {
    const { t, ctx } = v;
    const { buffer, rate } = stringBuffer(ctx, p);
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.playbackRate.value = rate;
    s.start(t);
    v.srcs.push(s);
    const body = v.filter('peaking', 180, 1);
    body.gain.value = 4;
    s.connect(body)
      .connect(v.filter('lowpass', 2500 + vel * 4000, 0.5))
      .connect(v.gain(0.5 * vel + 0.15))
      .connect(v.out);
    v.rel = 0.07;
    v.natEnd = t + buffer.duration / rate;
  },

  bass(v, p, vel) {
    const { t } = v;
    const f = mtof(p);
    const lp = v.filter('lowpass', 400, 5);
    lp.frequency.setValueAtTime(f * 2 + 300 + 1600 * vel, t);
    lp.frequency.setTargetAtTime(f * 1.5 + 140, t, 0.09);
    v.osc('sawtooth', f).connect(lp);
    v.osc('sine', f).connect(v.gain(0.8)).connect(lp);
    lp.connect(v.out);
    adsr(v.out.gain, t, 0.006, 0.18 * vel + 0.05, 0.35, 0.65);
    v.rel = 0.035;
  },

  synth(v, p, vel) {
    const { t } = v;
    const f = mtof(p);
    const lp = v.filter('lowpass', 2000, 3);
    lp.frequency.setValueAtTime(800 + 5000 * vel, t);
    lp.frequency.setTargetAtTime(1400 + f, t, 0.25);
    const a = v.osc('sawtooth', f);
    const b = v.osc('sawtooth', f);
    a.detune.value = -9;
    b.detune.value = 9;
    const vib = v.gain(0);
    vib.gain.setValueAtTime(0, t);
    vib.gain.setTargetAtTime(9, t + 0.25, 0.2);
    v.osc('sine', 5.2).connect(vib);
    vib.connect(a.detune);
    vib.connect(b.detune);
    a.connect(lp);
    b.connect(lp);
    v.osc('square', f / 2).connect(v.gain(0.35)).connect(lp);
    lp.connect(v.gain(0.65)).connect(v.out);
    adsr(v.out.gain, t, 0.012, 0.3 * vel + 0.05, 0.4, 0.7);
    v.rel = 0.08;
  },

  pad(v, p, vel) {
    const { t } = v;
    const f = mtof(p);
    const lp = v.filter('lowpass', 700 + f * 1.5, 0.8);
    const lfo = v.gain(250);
    v.osc('sine', 0.3).connect(lfo).connect(lp.frequency);
    const mix = v.gain(0.18);
    for (const d of [-14, -5, 5, 14]) {
      const o = v.osc('sawtooth', f);
      o.detune.value = d;
      o.connect(mix);
    }
    v.osc('triangle', f * 2).connect(v.gain(0.3)).connect(mix);
    mix.connect(lp).connect(v.out);
    adsr(v.out.gain, t, 0.45, 0.8 * vel + 0.1, 1.2, 0.8);
    v.rel = 0.35;
  },

  bells(v, p, vel) {
    const { t } = v;
    const f = mtof(p);
    const car = v.osc('sine', f);
    const mg = v.gain(0);
    mg.gain.setValueAtTime(f * (2.2 * vel + 0.4), t);
    mg.gain.setTargetAtTime(f * 0.15, t, 0.35);
    v.osc('sine', f * 3.5).connect(mg).connect(car.frequency);
    const dec = Math.max(0.6, 2.8 - (p - 60) * 0.04);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(0.24 * vel + 0.04, t, 0.001);
    g.gain.setTargetAtTime(0, t + 0.01, dec / 3);
    car.connect(g).connect(v.out);
    const sh = v.gain(0);
    sh.gain.setValueAtTime(0, t);
    sh.gain.setTargetAtTime(0.05 * vel, t, 0.001);
    sh.gain.setTargetAtTime(0, t + 0.01, dec / 6);
    v.osc('sine', f * 2.01).connect(sh).connect(v.out);
    v.rel = 0.35;
    v.natEnd = t + dec * 2.2;
  },

  organ(v, p, vel) {
    const { t } = v;
    const f = mtof(p);
    const mix = v.gain(0.16 * (0.6 + 0.4 * vel));
    for (const [h, a] of [[0.5, 0.45], [1, 1], [2, 0.6], [3, 0.3], [4, 0.28], [6, 0.12], [8, 0.08]]) {
      if (f * h < 16000) v.osc('sine', f * h).connect(v.gain(a)).connect(mix);
    }
    const trem = v.gain(0.85);
    v.osc('sine', 6.2).connect(v.gain(0.12)).connect(trem.gain);
    mix.connect(trem).connect(v.out);
    const click = v.gain(0);
    hit(click.gain, t, 0.08, 0.004);
    v.noise().connect(v.filter('highpass', 2000)).connect(click).connect(v.out);
    adsr(v.out.gain, t, 0.006, 1, 0.1, 1);
    v.rel = 0.03;
  },

  drums(v, p, vel) {
    v.oneShot = true;
    (DRUM_KIT[p] || DRUM_KIT[0])(v, vel);
  },
};

export function noteOn(ctx, dest, inst, pitch, t, vel = 0.8) {
  const v = new Voice(ctx, dest, t);
  (PLAY[inst] || PLAY.piano)(v, pitch, vel);
  if (v.oneShot) v.halt(v.natEnd);
  return v;
}

export function click(ctx, dest, t, accent) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 1760 : 1320;
  g.gain.setValueAtTime(0, t);
  g.gain.setTargetAtTime(accent ? 0.45 : 0.28, t, 0.001);
  g.gain.setTargetAtTime(0, t + 0.006, 0.015);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.12);
}

export const audible = (track, tracks) => (tracks.some((x) => x.solo) ? track.solo : !track.mute);

export function createMixer(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 10;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  verb.connect(wet).connect(master);
  const buses = new Map();

  return {
    master,
    bus: (id) => buses.get(id)?.vol || master,
    sync(tracks) {
      const ids = new Set();
      for (const tr of tracks) {
        ids.add(tr.id);
        const level = audible(tr, tracks) ? tr.vol * tr.vol : 0;
        let b = buses.get(tr.id);
        if (!b) {
          const vol = ctx.createGain();
          const send = ctx.createGain();
          vol.gain.value = level;
          vol.connect(master);
          vol.connect(send).connect(verb);
          buses.set(tr.id, (b = { vol, send }));
        } else {
          b.vol.gain.setTargetAtTime(level, ctx.currentTime, 0.015);
        }
        b.send.gain.value = INSTRUMENTS[tr.inst]?.send ?? 0.15;
      }
      for (const [id, b] of buses) {
        if (!ids.has(id)) {
          b.vol.disconnect();
          buses.delete(id);
        }
      }
    },
  };
}

export async function renderSong(P, sampleRate = 44100) {
  // Notes are in ticks: 12 per beat, 48 per bar (see engine.js).
  const sd = 60 / P.bpm / 12;
  const total = P.bars * 48;
  const lead = 0.02;
  const ctx = new OfflineAudioContext(2, Math.ceil((total * sd + 3.5) * sampleRate), sampleRate);
  const mx = createMixer(ctx);
  mx.sync(P.tracks);
  for (const tr of P.tracks) {
    if (!audible(tr, P.tracks)) continue;
    for (const n of tr.notes) {
      if (n.s >= total) continue;
      const t = lead + n.s * sd;
      noteOn(ctx, mx.bus(tr.id), tr.inst, n.p, t, n.v).release(t + Math.min(n.l, total - n.s) * sd);
    }
  }
  return toWav(await ctx.startRendering(), Math.ceil((total * sd + lead) * sampleRate));
}

function toWav(buf, minLength) {
  const ch = buf.numberOfChannels;
  const data = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let n = buf.length;
  while (n > minLength && data.every((d) => Math.abs(d[n - 1]) < 1e-4)) n--;
  const ab = new ArrayBuffer(44 + n * ch * 2);
  const dv = new DataView(ab);
  const str = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true);
  dv.setUint32(24, buf.sampleRate, true);
  dv.setUint32(28, buf.sampleRate * ch * 2, true);
  dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
