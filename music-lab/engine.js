import { audible, click, createMixer, noteOn } from './audio.js';

// Time is counted in ticks: 12 per beat divides evenly into 16ths (3 ticks)
// and triplets (4 ticks for 1/12, 2 for 1/24).
export const BEAT = 12;
export const STEPS_PER_BAR = 4 * BEAT;

// Look-ahead sequencer: a timer schedules the next few ticks on the audio
// clock, so timing stays tight even when the main thread is busy.
export class Engine {
  constructor(getProject) {
    this.get = getProject;
    this.ctx = null;
    this.mixer = null;
    this.playing = false;
    this.metronome = false;
    this.voices = new Set();
    this.marks = [];
    this.timer = 0;
  }

  audio() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.mixer = createMixer(this.ctx);
      this.sync();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  sync() {
    this.mixer?.sync(this.get().tracks);
  }

  get sd() {
    return 60 / this.get().bpm / BEAT;
  }

  get latency() {
    const c = this.ctx;
    return c ? (c.outputLatency || 0) + (c.baseLatency || 0) : 0;
  }

  start(step, countIn) {
    this.audio();
    this.stop();
    this.playing = true;
    this.step = step;
    this.count = countIn ? STEPS_PER_BAR : 0;
    this.next = this.ctx.currentTime + 0.08;
    this.marks = [];
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop() {
    if (!this.playing) return;
    clearInterval(this.timer);
    this.playing = false;
    const now = this.ctx.currentTime;
    for (const v of this.voices) v.kill(now);
    this.voices.clear();
    this.marks = [];
  }

  tick() {
    const ctx = this.ctx;
    const P = this.get();
    const total = P.bars * STEPS_PER_BAR;
    const now = ctx.currentTime;
    // Background tabs throttle timers to ~1s, so look further ahead there.
    const horizon = now + (document.hidden ? 1.2 : 0.12);
    if (this.next < now - 0.2) this.next = now + 0.02;
    while (this.next < horizon) {
      const sd = 60 / P.bpm / BEAT;
      const t = this.next;
      if (this.count > 0) {
        const k = STEPS_PER_BAR - this.count;
        if (k % BEAT === 0) click(ctx, this.mixer.master, t, k === 0);
        this.marks.push({ step: -this.count, time: t, sd });
        this.count--;
      } else {
        if (this.step >= total) this.step = 0;
        const s = this.step;
        if (this.metronome && s % BEAT === 0) click(ctx, this.mixer.master, t, s % STEPS_PER_BAR === 0);
        for (const tr of P.tracks) {
          if (!audible(tr, P.tracks)) continue;
          const bus = this.mixer.bus(tr.id);
          for (const n of tr.notes) {
            if (n.s !== s) continue;
            const v = noteOn(ctx, bus, tr.inst, n.p, t, n.v);
            v.release(t + Math.min(n.l, total - s) * sd);
            this.voices.add(v);
          }
        }
        this.marks.push({ step: s, time: t, sd });
        this.step++;
      }
      this.next += sd;
    }
    while (this.marks.length > 2 && this.marks[1].time < now - 0.5) this.marks.shift();
    for (const v of this.voices) if (v.endAt < now) this.voices.delete(v);
  }

  // Fractional step currently heard (negative during the count-in), or null.
  pos() {
    if (!this.playing || !this.marks.length) return null;
    const t = this.ctx.currentTime - this.latency;
    let m = this.marks[0];
    if (m.time > t) return m.step;
    for (const k of this.marks) {
      if (k.time <= t) m = k;
      else break;
    }
    return m.step + Math.min(0.999, (t - m.time) / m.sd);
  }

  live(track, pitch) {
    const ctx = this.audio();
    return noteOn(ctx, this.mixer.bus(track.id), track.inst, pitch, ctx.currentTime + 0.005, 0.85);
  }

  preview(inst, pitch, dur = 0.5) {
    const ctx = this.audio();
    const t = ctx.currentTime + 0.005;
    noteOn(ctx, this.mixer.master, inst, pitch, t, 0.8).release(t + dur);
  }
}
