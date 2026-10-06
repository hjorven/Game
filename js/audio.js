// js/audio.js — kleine WebAudio-Sounds (ohne externe Dateien)
'use strict';

const Sfx = {
  ctx: null,
  enabled: true,
  noiseBuf: null,

  init() {
    try { this.enabled = localStorage.getItem('ba_mute') !== '1'; } catch (e) { /* ok */ }
  },

  resume() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* egal */ }
  },

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('ba_mute', this.enabled ? '0' : '1'); } catch (e) { /* egal */ }
    if (this.enabled) { this.resume(); this.play('pickup'); }
    return this.enabled;
  },

  tone(freq, dur, type, vol, slideTo) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, vol, freq) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (!this.noiseBuf) {
      const len = c.sampleRate * 0.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t); src.stop(t + dur + 0.02);
  },

  play(name, opts) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'shot':
        if (opts && opts.weapon === 'shotgun') { this.noise(0.14, 0.07, 1400); this.tone(160, 0.08, 'square', 0.03, 70); }
        else if (opts && opts.weapon === 'sniper') { this.tone(700, 0.12, 'sawtooth', 0.05, 180); this.noise(0.08, 0.05, 3000); }
        else if (opts && opts.weapon === 'rocket') { this.noise(0.25, 0.06, 900); this.tone(120, 0.2, 'sawtooth', 0.04, 60); }
        else this.tone(420, 0.07, 'square', 0.04, 210);
        break;
      case 'hit':    this.tone(880, 0.06, 'square', 0.045, 660); break;
      case 'hurt':   this.tone(220, 0.12, 'sawtooth', 0.05, 110); break;
      case 'kill':   this.tone(660, 0.09, 'square', 0.05, 990); this.tone(990, 0.14, 'square', 0.04, 1320); break;
      case 'death':  this.tone(330, 0.5, 'sawtooth', 0.06, 60); break;
      case 'explode':this.noise(0.4, 0.09, 700); this.tone(90, 0.35, 'sawtooth', 0.06, 40); break;
      case 'pickup': this.tone(620, 0.08, 'square', 0.045); this.tone(930, 0.12, 'square', 0.04); break;
      case 'reload': this.noise(0.1, 0.04, 900); this.tone(240, 0.06, 'square', 0.03, 160); break;
      case 'reloadDone': this.tone(520, 0.09, 'square', 0.045); this.tone(780, 0.12, 'square', 0.04); break;
      case 'start':  this.tone(440, 0.1, 'square', 0.05); this.tone(660, 0.1, 'square', 0.05); this.tone(880, 0.16, 'square', 0.05); break;
      case 'end':    this.tone(880, 0.12, 'square', 0.05); this.tone(660, 0.12, 'square', 0.05); this.tone(440, 0.3, 'square', 0.05); break;
      case 'ui':     this.tone(520, 0.05, 'square', 0.035); break;
    }
  },
};
