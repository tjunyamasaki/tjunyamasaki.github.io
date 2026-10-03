// Driftacre — tiny synthesized sound: a wandering music box plus soft garden sounds. No audio files.
const PENTA = [0, 2, 4, 7, 9];
const CHORDS = [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]]; // I vi IV V

export function createAudio() {
  let ctx = null, master, sfx, music, delay;
  let sfxOn = true, musicOn = true, timer = null, beat = 0, nextTime = 0, night = 0, melody = 7;
  const hz = n => 261.63 * Math.pow(2, n / 12);
  const scaleNote = i => { const o = Math.floor(i / 5); return PENTA[((i % 5) + 5) % 5] + o * 12; };

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    delay = ctx.createDelay(1); delay.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const wet = ctx.createGain(); wet.gain.value = 0.28;
    delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master); sfx.connect(delay);
    music = ctx.createGain(); music.gain.value = 0.0; music.connect(master); music.connect(delay);
    return true;
  }
  function tone(f, t, dur, type = 'sine', vol = 0.2, dest = sfx, attack = 0.006, glide) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf;
  function noise(t, dur, vol, freq, q = 0.7) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const ok = () => sfxOn && ctx && ctx.state === 'running';

  const play = {
    harvest(combo = 0, golden = false) {
      if (!ok()) return; const t = ctx.currentTime, n = scaleNote(5 + Math.min(combo, 14));
      tone(hz(n + 12), t, 0.5, 'triangle', 0.16); tone(hz(n + 24), t, 0.25, 'sine', 0.05);
      if (golden) [0, 4, 7, 12].forEach((d, i) => tone(hz(n + 24 + d), t + 0.06 * (i + 1), 0.5, 'sine', 0.08));
    },
    plant() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.12, 0.25, 700); tone(170, t, 0.15, 'sine', 0.18, sfx, 0.004, 90); },
    tend() { if (!ok()) return; const t = ctx.currentTime; tone(520, t, 0.22, 'sine', 0.14, sfx, 0.004, 980); tone(1300, t + 0.07, 0.15, 'sine', 0.04); },
    coin() { if (!ok()) return; const t = ctx.currentTime; tone(1568, t, 0.15, 'triangle', 0.08); tone(2093, t + 0.06, 0.3, 'triangle', 0.08); },
    build() { if (!ok()) return; const t = ctx.currentTime; [0, 1, 2].forEach(i => { noise(t + i * 0.09, 0.08, 0.3, 500); tone(140 - i * 15, t + i * 0.09, 0.12, 'square', 0.04); }); tone(hz(19), t + 0.3, 0.6, 'triangle', 0.1); },
    land() { if (!ok()) return; const t = ctx.currentTime; noise(t, 1.2, 0.35, 260); tone(65, t, 1.2, 'sine', 0.3, sfx, 0.05, 45); [0, 4, 7, 11, 14].forEach((d, i) => tone(hz(12 + d), t + 0.7 + i * 0.08, 0.9, 'sine', 0.08)); },
    level() { if (!ok()) return; const t = ctx.currentTime; [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => tone(hz(d + 12), t + i * 0.07, 0.9, 'triangle', 0.1)); },
    pop() { if (!ok()) return; const t = ctx.currentTime; tone(880, t, 0.12, 'sine', 0.15, sfx, 0.003, 1760); noise(t, 0.06, 0.15, 3000); },
    sparkle() { if (!ok()) return; const t = ctx.currentTime; [0, 7, 12, 16].forEach((d, i) => tone(hz(24 + d), t + i * 0.05, 0.6, 'sine', 0.06)); },
    whale() { if (!ok()) return; const t = ctx.currentTime; tone(220, t, 2.2, 'sine', 0.12, sfx, 0.4, 330); tone(165, t + 0.8, 2.4, 'sine', 0.1, sfx, 0.5, 247); },
    tick() { if (!ok()) return; tone(1200, ctx.currentTime, 0.04, 'square', 0.025); },
    nope() { if (!ok()) return; const t = ctx.currentTime; tone(220, t, 0.12, 'triangle', 0.1); tone(185, t + 0.09, 0.16, 'triangle', 0.1); },
  };

  function scheduler() {
    if (!ctx || !musicOn) return;
    const spb = night > 0.5 ? 0.62 : 0.5;
    while (nextTime < ctx.currentTime + 0.3) {
      const t = Math.max(nextTime, ctx.currentTime);
      const bar = Math.floor(beat / 8) % 4, ch = CHORDS[bar], base = night > 0.5 ? -12 : 0;
      if (beat % 8 === 0) ch.forEach((d, i) => tone(hz(base - 12 + d), t + i * 0.03, spb * 7, 'sine', 0.05, music, 0.25));
      if (beat % 2 === 0 || Math.random() < 0.35) {
        if (Math.random() < 0.72) {
          melody += Math.round((Math.random() - 0.5) * 3); melody = Math.max(3, Math.min(13, melody));
          const n = base + scaleNote(melody);
          tone(hz(n), t, 1.4, 'triangle', 0.07, music, 0.004); tone(hz(n + 12), t, 0.5, 'sine', 0.025, music, 0.004);
        }
      }
      nextTime = t + spb / 2; beat++;
    }
  }

  return {
    play,
    async unlock() { if (!ensure()) return; if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* ignore */ } } if (!timer) { nextTime = ctx.currentTime + 0.2; timer = setInterval(scheduler, 90); } this.setMusic(musicOn); },
    setSfx(v) { sfxOn = v; },
    setMusic(v) { musicOn = v; if (ctx) music.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, 0.4); },
    setNight(v) { night = v; },
    suspend(v) { if (!ctx) return; if (v) ctx.suspend(); else ctx.resume(); },
  };
}
