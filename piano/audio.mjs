// Sample playback is deliberately local: no audio library, CDN, or network
// requests are needed after the 21 small recordings have loaded.
const SAMPLE_NOTES = Array.from({ length: 21 }, (_, i) => 36 + i * 3);
const SAMPLE_NAMES = ['C', 'Ds', 'Fs', 'A'];
const MAX_VOICES = 48;

export class PianoAudio {
  constructor() {
    this.context = null;
    this.samples = new Map();
    this.voices = new Set();
    this.sustain = false;
    this.volume = 0.72;
    this.room = 0.28;
    this.ready = false;
    this.loading = null;
  }

  async start(onProgress = () => {}) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('This browser cannot play Web Audio. Try a current Safari, Chrome, or Firefox.');
    // Creating/resuming the context must happen inside the user's gesture.
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.buildGraph();
    }
    await this.context.resume();
    if (this.ready) return;
    if (!this.loading) {
      this.loading = this.loadSamples(onProgress).then(() => {
        this.ready = true;
      }).finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  buildGraph() {
    const ctx = this.context;
    this.input = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.roomImpulse();
    this.reverbTone = ctx.createBiquadFilter();
    this.reverbTone.type = 'lowpass';
    this.reverbTone.frequency.value = 4400;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 16;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 0.8;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.85;

    this.input.connect(this.dry);
    this.input.connect(this.reverb);
    this.reverb.connect(this.reverbTone);
    this.reverbTone.connect(this.wet);
    this.dry.connect(this.compressor);
    this.wet.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.setRoom(this.room);
  }

  roomImpulse() {
    const ctx = this.context;
    const length = Math.round(ctx.sampleRate * 2.2);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < length; i++) {
        const time = i / ctx.sampleRate;
        // A short pre-delay keeps the hammer attack clear; filtered noise
        // provides a diffuse stereo tail without metallic delay repeats.
        previous = previous * 0.52 + (Math.random() * 2 - 1) * 0.48;
        data[i] = time < 0.018 ? 0 : previous * Math.exp(-time * 3.5) * Math.min(1, (time - 0.018) * 90);
      }
    }
    return buffer;
  }

  async loadSamples(onProgress) {
    let loaded = this.samples.size;
    onProgress(loaded, SAMPLE_NOTES.length);
    const queue = SAMPLE_NOTES.filter(midi => !this.samples.has(midi));
    // Bound concurrent fetch/decode work on phones. Failed attempts can retry
    // while preserving recordings that already decoded successfully.
    const worker = async () => {
      while (queue.length) {
        const midi = queue.shift();
        const name = SAMPLE_NAMES[(midi % 12) / 3] + (Math.floor(midi / 12) - 1);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(new URL(`./samples/${name}.mp3`, import.meta.url), { signal: controller.signal });
          if (!response.ok) throw new Error(`Could not load ${name}.`);
          const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          this.samples.set(midi, buffer);
          onProgress(++loaded, SAMPLE_NOTES.length);
        } finally {
          clearTimeout(timeout);
        }
      }
    };
    const results = await Promise.allSettled(Array.from({ length: 4 }, worker));
    if (results.some(result => result.status === 'rejected')) {
      throw new Error('The piano could not finish loading. Check your connection and try again.');
    }
  }

  resume() {
    if (this.context?.state !== 'running') {
      return this.context?.resume() || Promise.resolve();
    }
    return Promise.resolve();
  }

  noteOn(midi, velocity = 0.75) {
    if (!this.ready || !Number.isFinite(midi)) return null;
    const ctx = this.context;
    const sampleNote = SAMPLE_NOTES.reduce((best, note) => Math.abs(note - midi) < Math.abs(best - midi) ? note : best);
    const source = ctx.createBufferSource();
    source.buffer = this.samples.get(sampleNote);
    source.playbackRate.value = 2 ** ((midi - sampleNote) / 12);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3300 + Math.max(0.15, Math.min(1, velocity)) * 8400;
    tone.Q.value = 0.3;
    const gain = ctx.createGain();
    const level = 0.17 + Math.max(0.1, Math.min(1, velocity)) ** 1.5 * 0.64;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.003);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.35, Math.min(0.35, (midi - 66) / 80));
    source.connect(tone);
    tone.connect(gain);
    gain.connect(pan);
    pan.connect(this.input);
    const voice = { source, gain, tone, pan, midi, level, held: true, released: false };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      tone.disconnect();
      gain.disconnect();
      pan.disconnect();
      this.voices.delete(voice);
    };
    // Reserve polyphony for fresh attacks, even if the pedal stays down.
    const sounding = [...this.voices].filter(item => !item.released);
    while (sounding.length > MAX_VOICES) this.release(sounding.shift(), 0.025);
    source.start();
    return voice;
  }

  noteOff(voice) {
    if (!voice || voice.released) return;
    voice.held = false;
    if (!this.sustain) this.release(voice);
  }

  release(voice, duration = 0.34) {
    if (!voice || voice.released) return;
    voice.released = true;
    const now = this.context.currentTime;
    const param = voice.gain.gain;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
    }
    param.setTargetAtTime(0, now, duration / 5);
    voice.source.stop(now + duration);
  }

  setSustain(value) {
    this.sustain = value;
    if (!value) for (const voice of this.voices) if (!voice.held) this.release(voice);
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.master?.gain.setTargetAtTime(this.volume * 0.8, this.context.currentTime, 0.015);
  }

  setRoom(value) {
    this.room = Math.max(0, Math.min(1, value));
    if (!this.context) return;
    this.dry.gain.setTargetAtTime(1 - this.room * 0.12, this.context.currentTime, 0.03);
    this.wet.gain.setTargetAtTime(this.room * 0.52, this.context.currentTime, 0.03);
  }

  stopAll() {
    for (const voice of this.voices) this.release(voice, 0.06);
  }
}
