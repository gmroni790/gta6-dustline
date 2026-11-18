export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let eng = null, sir = null, musicTimer = null, step = 0;

  function tone(freq, dur, type, gain, when) {
    if (!ctx) return;
    const t = when ?? ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, filterFreq, gain, type) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type || 'bandpass'; f.frequency.value = filterFreq || 1000;
    g.gain.setValueAtTime(gain || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function slide(freqA, freqB, dur, type, gain) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freqA, t);
    o.frequency.exponentialRampToValueAtTime(freqB, t + dur);
    g.gain.setValueAtTime(gain || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const A = {
    init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    },

    engine(v01, driving) {
      if (!ctx) return;
      if (!eng) {
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
        const f = ctx.createBiquadFilter(), g = ctx.createGain();
        o1.type = 'sawtooth'; o1.frequency.value = 55;
        o2.type = 'square'; o2.frequency.value = 110;
        f.type = 'lowpass'; f.frequency.value = 400;
        g.gain.value = 0;
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
        o1.start(); o2.start();
        eng = { o1, o2, g };
      }
      const t = ctx.currentTime;
      eng.o1.frequency.setTargetAtTime(50 + v01 * 160, t, 0.05);
      eng.o2.frequency.setTargetAtTime((50 + v01 * 160) * 2.01, t, 0.05);
      eng.g.gain.setTargetAtTime(driving ? 0.10 + v01 * 0.08 : 0, t, 0.08);
    },

    siren(on) {
      if (!ctx) return;
      if (!sir) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = 825;
        lfo.type = 'square'; lfo.frequency.value = 1.2;
        lg.gain.value = 125;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.value = 0;
        o.connect(g); g.connect(master);
        o.start(); lfo.start();
        sir = { g };
      }
      sir.g.gain.setTargetAtTime(on ? 0.06 : 0, ctx.currentTime, 0.1);
    },

    honk() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [370, 440].forEach(f => tone(f, 0.35, 'square', 0.08, t));
    },

    gunshot(kind) {
      if (!ctx) return;
      const smg = kind === 'smg';
      noise(smg ? 0.07 : 0.12, smg ? 1800 : 900, 0.35);
      tone(60, 0.1, 'sine', 0.3);
    },

    punch() { noise(0.08, 400, 0.25, 'lowpass'); },
    pickup() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(660, 0.09, 'sine', 0.15, t);
      tone(880, 0.14, 'sine', 0.15, t + 0.09);
    },
    cash() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [880, 1170, 1560].forEach((f, i) => tone(f, 0.1, 'sine', 0.14, t + i * 0.08));
    },
    missionOk() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.16, t + i * 0.12));
    },
    missionFail() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(392, 0.18, 'triangle', 0.16, t);
      tone(262, 0.3, 'triangle', 0.16, t + 0.18);
    },
    busted() { slide(600, 300, 0.8, 'triangle', 0.16); },
    wasted() { slide(220, 110, 0.9, 'sawtooth', 0.12); },
    uiClick() { tone(1200, 0.04, 'sine', 0.08); },

    setMusic(on) {
      if (on) {
        if (musicTimer || !ctx) return;
        const bass = [55, 55, 65.41, 82.41, 55, 55, 65.41, 82.41];
        musicTimer = setInterval(() => {
          if (!ctx) return;
          const s = step % 8;
          tone(bass[s], 0.13, 'triangle', 0.12);
          if (s % 2 === 1) noise(0.03, 6000, 0.05, 'highpass');
          step++;
        }, 140);
      } else if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    }
  };
  return A;
}
