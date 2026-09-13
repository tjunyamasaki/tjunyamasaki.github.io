// A small, optional pentatonic instrument. No assets, network requests, or autoplay.
export class Sound {
  constructor() { this.enabled = false; this.context = null; this.lastNote = 0; }

  async toggle() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.master.gain.value = 0.035;
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2300;
      this.master.connect(filter); filter.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.enabled = !this.enabled;
    if (this.enabled) this.note(0.5, 'path');
    return this.enabled;
  }

  note(value, type) {
    if (!this.enabled || !this.context || this.context.state !== 'running' || document.hidden) return;
    const now = this.context.currentTime;
    if (now - this.lastNote < 0.065) return;
    this.lastNote = now;
    const scale = [0, 2, 4, 7, 9], step = Math.floor(Math.max(0, Math.min(1, value)) * 19);
    const midi = 45 + Math.floor(step / 5) * 12 + scale[step % 5];
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    oscillator.type = type === 'path' || type === 'settle' ? 'sine' : 'triangle';
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(type === 'compare' ? 0.3 : 0.65, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.29);
    oscillator.connect(envelope); envelope.connect(this.master); oscillator.start(now); oscillator.stop(now + 0.3);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
}
