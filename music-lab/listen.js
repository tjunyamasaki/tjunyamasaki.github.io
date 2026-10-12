// Audio to notes: pitch tracking (YIN) for melodies, onset detection for
// beatboxed drums, and microphone capture. Monophonic only: one note at a time.

const RATE = 16000; // analysis rate; plenty for voice and most instruments
const WIN = 512; // 32 ms analysis window
const HOP = 128; // 8 ms between frames
const MIN_HZ = 55;
const MAX_HZ = 1600;

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Box-filter and decimate to roughly RATE.
function downsample(x, sr) {
  const f = Math.max(1, Math.round(sr / RATE));
  const out = new Float32Array(Math.floor(x.length / f));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < f; k++) s += x[i * f + k];
    out[i] = s / f;
  }
  return { x: out, sr: sr / f };
}

// YIN: returns the period (in samples) and its aperiodicity (0 = perfectly periodic).
function yin(x, off, sr, d) {
  const tauMin = Math.floor(sr / MAX_HZ);
  const tauMax = Math.min(d.length - 1, Math.floor(sr / MIN_HZ));
  d[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < WIN; i++) {
      const v = x[off + i] - x[off + i + tau];
      s += v * v;
    }
    run += s;
    d[tau] = run ? (s * tau) / run : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < 0.15) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    tau = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (d[t] < d[tau]) tau = t;
  }
  let best = tau;
  if (tau > 1 && tau < tauMax) {
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const den = a - 2 * b + c;
    if (den > 0) best = tau + (a - c) / (2 * den);
  }
  return { tau: best, ap: d[tau] };
}

function rms(x, off, n) {
  let s = 0;
  for (let i = 0; i < n; i++) s += x[off + i] * x[off + i];
  return Math.sqrt(s / n);
}

function percentile(values, q) {
  if (!values.length) return 0;
  const v = Float32Array.from(values).sort();
  return v[Math.min(v.length - 1, Math.floor(q * v.length))];
}

const median = (a) => {
  const v = [...a].sort((p, q) => p - q);
  return v[Math.floor(v.length / 2)];
};

const tick = () => new Promise((r) => setTimeout(r, 0));

// Per-frame loudness and pitch, yielding to the page now and then.
async function frames(samples, sampleRate) {
  const { x, sr } = downsample(samples, sampleRate);
  const d = new Float32Array(Math.floor(sr / MIN_HZ) + 2);
  const span = WIN + d.length;
  const out = [];
  for (let off = 0, n = 0; off + span < x.length; off += HOP, n++) {
    const level = rms(x, off, WIN);
    const { tau, ap } = level > 1e-4 ? yin(x, off, sr, d) : { tau: 0, ap: 1 };
    const hz = tau ? sr / tau : 0;
    out.push({ t: (off + WIN / 2) / sr, level, midi: hz ? 69 + 12 * Math.log2(hz / 440) : null, ap });
    if (n % 400 === 399) await tick();
  }
  return { frames: out, dt: HOP / sr };
}

// Sudden rises in loudness mark the start of a note (so repeated notes split).
function onsets(fr, gate) {
  const on = new Uint8Array(fr.length);
  let last = -100;
  for (let i = 4; i < fr.length; i++) {
    const prev = Math.max(1e-4, Math.min(fr[i - 4].level, fr[i - 3].level, fr[i - 2].level));
    if (fr[i].level > gate && fr[i].level > prev * 2 && fr[i].level >= fr[i - 1].level && i - last > 8) {
      on[i] = 1;
      last = i;
    }
  }
  return on;
}

/**
 * Melody transcription. Returns notes as { t, d, p } in seconds and MIDI pitch,
 * with t relative to the start of `samples`.
 */
export async function detectMelody(samples, sampleRate) {
  const { frames: fr, dt } = await frames(samples, sampleRate);
  if (!fr.length) return [];
  const peak = percentile(fr.map((f) => f.level), 0.95);
  const gate = Math.max(0.006, peak * 0.1);
  const voiced = fr.map((f) => f.level > gate && f.ap < 0.3 && f.midi != null);
  // Median-filter the rounded pitch so vibrato and glitches don't split notes.
  const q = fr.map((f, i) => {
    const win = [];
    for (let k = i - 3; k <= i + 3; k++) if (k >= 0 && k < fr.length && voiced[k]) win.push(fr[k].midi);
    return voiced[i] && win.length >= 4 ? Math.round(median(win)) : null;
  });
  const on = onsets(fr, gate);

  const segs = [];
  let cur = null;
  for (let i = 0; i < fr.length; i++) {
    const p = q[i];
    if (p == null) {
      if (cur) cur.gap++;
      if (cur && cur.gap > 4) {
        segs.push(cur);
        cur = null;
      }
      continue;
    }
    if (!cur || cur.p !== p || on[i]) {
      if (cur) segs.push(cur);
      cur = { p, a: i, b: i, gap: 0, pitches: [] };
    }
    cur.b = i;
    cur.gap = 0;
    cur.pitches.push(fr[i].midi);
  }
  if (cur) segs.push(cur);

  const minFrames = Math.ceil(0.06 / dt);
  const notes = [];
  for (const s of segs) {
    if (s.b - s.a + 1 < minFrames) continue;
    const p = Math.round(median(s.pitches));
    const prev = notes[notes.length - 1];
    // Re-join a note that a short wobble split in two.
    if (prev && prev.p === p && fr[s.a].t - (prev.t + prev.d) < 0.05 && !on[s.a]) prev.d = fr[s.b].t + dt - prev.t;
    else notes.push({ t: fr[s.a].t - dt, d: (s.b - s.a + 1) * dt, p });
  }
  return notes;
}

/**
 * Beatbox / drum hits. Returns { t, kind } where kind is 'kick', 'snare' or 'hat',
 * judged by where the energy of each hit's first 50 ms sits.
 */
export async function detectHits(samples, sampleRate) {
  const { frames: fr } = await frames(samples, sampleRate);
  if (!fr.length) return [];
  const peak = percentile(fr.map((f) => f.level), 0.98);
  const gate = Math.max(0.01, peak * 0.15);
  const on = onsets(fr, gate);
  const hits = [];
  const win = Math.floor(sampleRate * 0.05);
  const aLow = 1 - Math.exp((-2 * Math.PI * 250) / sampleRate);
  const aHigh = 1 - Math.exp((-2 * Math.PI * 5000) / sampleRate);
  for (let i = 0; i < fr.length; i++) {
    if (!on[i]) continue;
    const t = Math.max(0, fr[i].t - 0.012);
    const start = Math.floor(t * sampleRate);
    // Share of the energy below 250 Hz (kick) and above 5 kHz (hat).
    let lo = 0;
    let hi = 0;
    let eLo = 0;
    let eHi = 0;
    let e = 0;
    for (let k = start; k < Math.min(samples.length, start + win); k++) {
      const v = samples[k];
      lo += aLow * (v - lo);
      hi += aHigh * (v - hi);
      e += v * v;
      eLo += lo * lo;
      eHi += (v - hi) * (v - hi);
    }
    const low = e ? eLo / e : 0;
    const high = e ? eHi / e : 0;
    hits.push({ t, kind: low > 0.4 ? 'kick' : high > 0.25 ? 'hat' : 'snare' });
  }
  return hits;
}

/**
 * Finds the beat in a list of note or hit starts ({ t, w } in seconds, with a
 * weight for how strongly each one marks the rhythm).
 *
 * The starts are smeared into a pulse train and autocorrelated; each tempo is
 * scored by how strongly its beat and the next few multiples repeat, nudged
 * toward everyday tempos. A least-squares fit to the beat and half-beat grid
 * then fine-tunes the tempo and finds where the beats fall.
 * Returns { bpm, phase } with phase the time of one beat, or null.
 */
export function estimateTempo(events, near = 110) {
  if (events.length < 4) return null;
  const R = 100;
  const n = Math.ceil((Math.max(...events.map((e) => e.t)) + 1) * R);
  const env = new Float32Array(n);
  const sig = 3;
  for (const e of events) {
    const c = e.t * R;
    for (let k = Math.max(0, Math.floor(c - 3 * sig)); k < Math.min(n, Math.ceil(c + 3 * sig)); k++) {
      env[k] += e.w * Math.exp(-((k - c) ** 2) / (2 * sig * sig));
    }
  }
  const maxLag = Math.min(n - 1, 520);
  const ac = new Float32Array(maxLag + 2);
  for (let L = 0; L <= maxLag; L++) {
    let s = 0;
    for (let i = 0; i + L < n; i++) s += env[i] * env[i + L];
    ac[L] = (s * n) / (n - L); // undo the shrinking overlap at long lags
  }
  const at = (L) => {
    if (L >= maxLag) return 0;
    const i = Math.floor(L);
    return (ac[i] + (ac[i + 1] - ac[i]) * (L - i)) / ac[0];
  };
  let best = null;
  for (let bpm = 50; bpm <= 200; bpm += 0.5) {
    const L = (60 * R) / bpm;
    let s = 0;
    for (let k = 1; k <= 4; k++) s += at(k * L) / k;
    s *= Math.exp(-0.5 * (Math.log2(bpm / near) / 0.9) ** 2);
    if (!best || s > best.s) best = { bpm, s };
  }
  if (!best || best.s <= 0) return null;

  let T = 60 / best.bpm;
  let phase = 0;
  let fit = -1;
  for (let ph = 0; ph < T; ph += 0.005) {
    let s = 0;
    for (const e of events) {
      const d = ((e.t - ph) / T - Math.round((e.t - ph) / T)) * T;
      s += e.w * Math.exp(-(d * d) / (2 * 0.035 * 0.035));
    }
    if (s > fit) {
      fit = s;
      phase = ph;
    }
  }
  // Refine: fit t = phase + k * T/2 to the starts that sit on the half-beat grid.
  for (let pass = 0; pass < 3; pass++) {
    const pts = [];
    for (const e of events) {
      const k = Math.round(((e.t - phase) / T) * 2);
      if (Math.abs(e.t - phase - (k * T) / 2) < 0.07) pts.push([k, e.t, e.w]);
    }
    if (pts.length < 4) break;
    let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
    for (const [k, t, w] of pts) {
      sw += w;
      sk += w * k;
      st += w * t;
      skk += w * k * k;
      skt += w * k * t;
    }
    const den = sw * skk - sk * sk;
    if (Math.abs(den) < 1e-9) break;
    const half = (sw * skt - sk * st) / den;
    if (!(half > 0.1 && half < 0.65)) break;
    T = half * 2;
    phase = (st - half * sk) / sw;
  }
  return { bpm: 60 / T, phase: ((phase % T) + T) % T };
}

/* ---------- Live pitch (for the listening indicator) ---------- */

export function livePitch(buf, sampleRate) {
  const { x, sr } = downsample(buf, sampleRate);
  const d = new Float32Array(Math.floor(sr / MIN_HZ) + 2);
  const off = Math.max(0, x.length - WIN - d.length - 1);
  if (x.length < WIN + d.length) return { level: 0, midi: null };
  const level = rms(x, off, WIN + d.length);
  if (level < 0.01) return { level, midi: null };
  const { tau, ap } = yin(x, off, sr, d);
  return { level, midi: ap < 0.3 && tau ? Math.round(69 + 12 * Math.log2(sr / tau / 440)) : null };
}

/* ---------- Microphone capture ---------- */

const WORKLET = `registerProcessor('ml-capture', class extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; this.t = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      if (this.n === 0) this.t = currentTime;
      this.buf.set(ch, this.n);
      this.n += ch.length;
      if (this.n + 128 > this.buf.length) {
        this.port.postMessage({ t: this.t, d: this.buf.slice(0, this.n) });
        this.n = 0;
      }
    }
    return true;
  }
});`;

const loaded = new WeakSet();

export class Capture {
  static async open(ctx) {
    const stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation keeps the backing track out of the recording.
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    if (!loaded.has(ctx)) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      loaded.add(ctx);
    }
    return new Capture(ctx, stream);
  }

  constructor(ctx, stream) {
    this.ctx = ctx;
    this.stream = stream;
    this.src = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.live = new Float32Array(this.analyser.fftSize);
    this.node = new AudioWorkletNode(ctx, 'ml-capture');
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.chunks = [];
    this.node.port.onmessage = (e) => this.chunks.push(e.data);
    this.src.connect(this.analyser);
    this.src.connect(this.node).connect(this.sink).connect(ctx.destination);
    const settings = stream.getAudioTracks()[0]?.getSettings?.() || {};
    this.inputLatency = typeof settings.latency === 'number' ? settings.latency : 0.015;
  }

  peek() {
    this.analyser.getFloatTimeDomainData(this.live);
    return livePitch(this.live, this.ctx.sampleRate);
  }

  // Everything captured so far as one buffer, with the audio-clock time of its first sample.
  take() {
    const n = this.chunks.reduce((s, c) => s + c.d.length, 0);
    const samples = new Float32Array(n);
    let o = 0;
    for (const c of this.chunks) {
      samples.set(c.d, o);
      o += c.d.length;
    }
    return { samples, sampleRate: this.ctx.sampleRate, t0: this.chunks[0]?.t ?? this.ctx.currentTime };
  }

  close() {
    this.node.port.onmessage = null;
    for (const n of [this.src, this.node, this.sink, this.analyser]) {
      try {
        n.disconnect();
      } catch {}
    }
    for (const t of this.stream.getTracks()) t.stop();
  }
}
