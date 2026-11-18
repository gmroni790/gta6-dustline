// All sound in Dustline is synthesized with WebAudio — no audio files.
// Every method is a safe no-op until init() runs on a user gesture,
// so calling sounds before the context exists never throws.

export function createAudio() {
  let ctx = null;        // AudioContext, created on first user gesture
  let master = null;     // master gain feeding the destination
  let noiseBuffer = null; // 1s of white noise, reused by every noise burst
  let engineNodes = null; // persistent engine oscillators + gain
  let sirenNodes = null;  // persistent siren oscillator + gain
  let musicTimer = null;  // interval id for the bass loop
  let musicStep = 0;      // current step of the bass pattern

  // One-shot oscillator tone that fades out over `dur` seconds.
  function playTone(freq, dur, type, gain, when) {
    if (!ctx) return;
    const start = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(gain || 0.15, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  // One-shot filtered noise burst that fades out over `dur` seconds.
  function playNoise(dur, filterFreq, gain, filterType) {
    if (!ctx) return;
    const start = ctx.currentTime;
    const src = ctx.createBufferSource();
    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    src.buffer = noiseBuffer;
    src.loop = true;
    filter.type = filterType || 'bandpass';
    filter.frequency.value = filterFreq || 1000;
    amp.gain.setValueAtTime(gain || 0.2, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  // One-shot tone sliding from freqA down/up to freqB over `dur` seconds.
  function playSlide(freqA, freqB, dur, type, gain) {
    if (!ctx) return;
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqA, start);
    osc.frequency.exponentialRampToValueAtTime(freqB, start + dur);
    amp.gain.setValueAtTime(gain || 0.15, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  const audio = {
    // Call from a user gesture (button click / key press). Creates the
    // context on first call, resumes it when the browser suspended it.
    init() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    },

    // Continuous engine drone. Two detuned oscillators through a lowpass;
    // pitch and loudness follow speed (v01 in [0,1]). Silent off the road.
    engine(v01, driving) {
      if (!ctx) return;
      if (!engineNodes) {
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const amp = ctx.createGain();
        oscA.type = 'sawtooth';
        oscA.frequency.value = 55;
        oscB.type = 'square';
        oscB.frequency.value = 110;
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        amp.gain.value = 0;
        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(amp);
        amp.connect(master);
        oscA.start();
        oscB.start();
        engineNodes = { oscA, oscB, amp };
      }
      const now = ctx.currentTime;
      const base = 50 + v01 * 160;
      engineNodes.oscA.frequency.setTargetAtTime(base, now, 0.05);
      engineNodes.oscB.frequency.setTargetAtTime(base * 2.01, now, 0.05);
      engineNodes.amp.gain.setTargetAtTime(driving ? 0.10 + v01 * 0.08 : 0, now, 0.08);
    },

    // Police siren: triangle wave wobbling between 700 and 950 Hz.
    siren(on) {
      if (!ctx) return;
      if (!sirenNodes) {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 825;
        lfo.type = 'square';
        lfo.frequency.value = 1.2;
        lfoGain.gain.value = 125;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        amp.gain.value = 0;
        osc.connect(amp);
        amp.connect(master);
        osc.start();
        lfo.start();
        sirenNodes = { amp };
      }
      sirenNodes.amp.gain.setTargetAtTime(on ? 0.06 : 0, ctx.currentTime, 0.1);
    },

    // Two-note car horn.
    honk() {
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const freq of [370, 440]) playTone(freq, 0.35, 'square', 0.08, now);
    },

    // Gunshot: a noise crack plus a low thump. SMG is shorter and higher.
    gunshot(kind) {
      if (!ctx) return;
      const isSmg = kind === 'smg';
      playNoise(isSmg ? 0.07 : 0.12, isSmg ? 1800 : 900, 0.35);
      playTone(60, 0.1, 'sine', 0.3);
    },

    // Melee hit: a low, muffled thud.
    punch() {
      playNoise(0.08, 400, 0.25, 'lowpass');
    },

    // Pickup chime: two rising notes.
    pickup() {
      if (!ctx) return;
      const now = ctx.currentTime;
      playTone(660, 0.09, 'sine', 0.15, now);
      playTone(880, 0.14, 'sine', 0.15, now + 0.09);
    },

    // Cash register: three rising notes.
    cash() {
      if (!ctx) return;
      const now = ctx.currentTime;
      [880, 1170, 1560].forEach((freq, i) => playTone(freq, 0.1, 'sine', 0.14, now + i * 0.08));
    },

    // Mission success: four-note ascending arpeggio.
    missionOk() {
      if (!ctx) return;
      const now = ctx.currentTime;
      [523, 659, 784, 1046].forEach((freq, i) => playTone(freq, 0.12, 'triangle', 0.16, now + i * 0.12));
    },

    // Mission failed: two descending notes.
    missionFail() {
      if (!ctx) return;
      const now = ctx.currentTime;
      playTone(392, 0.18, 'triangle', 0.16, now);
      playTone(262, 0.3, 'triangle', 0.16, now + 0.18);
    },

    // Busted: a slow descending slide.
    busted() {
      playSlide(600, 300, 0.8, 'triangle', 0.16);
    },

    // Wasted: a low, gritty descending slide.
    wasted() {
      playSlide(220, 110, 0.9, 'sawtooth', 0.12);
    },

    // Menu click: a short high blip.
    uiClick() {
      playTone(1200, 0.04, 'sine', 0.08);
    },

    // Looping background groove: an 8-step bass line with a hi-hat tick
    // on every odd step. Pass false to stop it.
    setMusic(on) {
      if (on) {
        if (musicTimer || !ctx) return;
        const bass = [55, 55, 65.41, 82.41, 55, 55, 65.41, 82.41];
        musicTimer = setInterval(() => {
          if (!ctx) return;
          const s = musicStep % 8;
          playTone(bass[s], 0.13, 'triangle', 0.12);
          if (s % 2 === 1) playNoise(0.03, 6000, 0.05, 'highpass');
          musicStep++;
        }, 140);
      } else if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };

  return audio;
}
