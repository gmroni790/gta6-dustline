// Dustline audio: every sound is synthesized with the Web Audio API.
// No audio files, no network. Every method is safe to call before the
// audio context exists, while it is suspended, or when the browser blocks
// audio outright — it simply does nothing, and never throws or logs.
// The screenshot tool runs with no user gesture, so silence there is
// correct behavior.

import { clamp } from './utils.js';

// A slow desert loop: plucked triangle notes in A minor, one per step,
// with 0 steps as rests. Values are MIDI note numbers.
const MUSIC_PATTERN = [57, 0, 60, 64, 0, 67, 64, 60, 57, 0, 55, 57, 0, 60, 0, 0];
const MUSIC_STEP = 0.42; // seconds per pattern step
const DRONE_FREQ = 55; // A1, the low desert drone
const ENGINE_TOP_SPEED = 42; // units/s treated as full throttle

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudio(ctx) {
  const state = ctx.state;
  let actx = null;
  let master = null;
  let muted = !!(state && state.muted);
  let musicOn = false;
  let noiseBuf = null;

  // Engine hum: one sawtooth through a low-pass filter.
  let engineOsc = null;
  let engineFilter = null;
  let engineGain = null;

  // Police wail: a triangle wave wobbled by a slow LFO.
  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;

  // Music loop: a low drone plus a scheduled pluck pattern.
  let droneOsc = null;
  let droneGain = null;
  let musicTimer = null;
  let nextNoteTime = 0;
  let stepIndex = 0;

  // True only when sound can actually be heard.
  function ready() {
    return !!(actx && master && actx.state === 'running');
  }

  // Create the context on first call, resume it when suspended. Safe to
  // call any time; does nothing when audio is already running.
  function resume() {
    try {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = new AC();
        master = actx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(actx.destination);
      }
      if (actx.state === 'suspended') {
        const p = actx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) {
      actx = null;
      master = null;
    }
  }

  // One short synthesized note with a quick attack and an exponential tail.
  function tone(freq, at, dur, type, vol) {
    if (!ready()) return;
    try {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = type || 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(vol, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    } catch (e) { /* silence on failure */ }
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    try {
      const len = Math.floor(actx.sampleRate * 0.3);
      noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      noiseBuf = null;
    }
    return noiseBuf;
  }

  // Engine hum: pitch and volume follow the speed fraction (0 to 1).
  function setEngine(frac) {
    if (!ready()) return;
    try {
      if (!engineOsc) {
        engineOsc = actx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 45;
        engineFilter = actx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 250;
        engineGain = actx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const f = clamp(frac || 0, 0, 1);
      const t = actx.currentTime;
      engineOsc.frequency.setTargetAtTime(45 + f * 140, t, 0.08);
      engineFilter.frequency.setTargetAtTime(250 + f * 900, t, 0.08);
      engineGain.gain.setTargetAtTime(f <= 0.01 ? 0 : 0.025 + f * 0.06, t, 0.08);
    } catch (e) { /* silence on failure */ }
  }

  // Two-tone police wail, on or off.
  function siren(on) {
    if (on) {
      if (!ready() || sirenOsc) return;
      try {
        sirenOsc = actx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 750;
        sirenLfo = actx.createOscillator();
        sirenLfo.type = 'sine';
        sirenLfo.frequency.value = 0.7;
        const lfoGain = actx.createGain();
        lfoGain.gain.value = 220;
        sirenGain = actx.createGain();
        sirenGain.gain.value = 0.045;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      } catch (e) {
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
      }
    } else {
      if (!sirenOsc) return;
      try {
        sirenOsc.stop();
        sirenLfo.stop();
      } catch (e) { /* already stopped */ }
      try {
        sirenOsc.disconnect();
        sirenLfo.disconnect();
        sirenGain.disconnect();
      } catch (e) { /* already disconnected */ }
      sirenOsc = null;
      sirenLfo = null;
      sirenGain = null;
    }
  }

  // A short noise burst; pitch differs per weapon, fists get a soft thud.
  function shot(weapon) {
    if (!ready()) return;
    try {
      if (weapon === 'fists') {
        tone(90, actx.currentTime, 0.1, 'sine', 0.2);
        return;
      }
      const buf = getNoise();
      if (!buf) return;
      const isSmg = weapon === 'smg';
      const src = actx.createBufferSource();
      src.buffer = buf;
      const filter = actx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isSmg ? 900 : 1400;
      filter.Q.value = 0.8;
      const gain = actx.createGain();
      const t = actx.currentTime;
      const dur = isSmg ? 0.09 : 0.14;
      gain.gain.setValueAtTime(isSmg ? 0.22 : 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch (e) { /* silence on failure */ }
  }

  // A short pleasant two-note sound for pickups.
  function chime() {
    if (!ready()) return;
    const t = actx.currentTime;
    tone(659.25, t, 0.4, 'triangle', 0.16); // E5
    tone(880, t + 0.09, 0.5, 'triangle', 0.16); // A5
  }

  // A short mission-complete arpeggio.
  function jingle() {
    if (!ready()) return;
    const t = actx.currentTime;
    const notes = [440, 523.25, 659.25, 880]; // A4 C5 E5 A5
    notes.forEach((f, i) => tone(f, t + i * 0.11, 0.5, 'triangle', 0.16));
  }

  // Schedule pattern notes a little ahead of time so the loop has no gaps.
  function scheduleMusic() {
    if (!ready()) return;
    try {
      while (nextNoteTime < actx.currentTime + 0.3) {
        const midi = MUSIC_PATTERN[stepIndex % MUSIC_PATTERN.length];
        if (midi) tone(midiToFreq(midi), nextNoteTime, 0.4, 'triangle', 0.13);
        nextNoteTime += MUSIC_STEP;
        stepIndex += 1;
      }
    } catch (e) { /* silence on failure */ }
  }

  function startMusic() {
    if (!ready()) return;
    try {
      droneOsc = actx.createOscillator();
      droneOsc.type = 'sine';
      droneOsc.frequency.value = DRONE_FREQ;
      droneGain = actx.createGain();
      droneGain.gain.value = 0.05;
      droneOsc.connect(droneGain);
      droneGain.connect(master);
      droneOsc.start();
      nextNoteTime = actx.currentTime + 0.1;
      stepIndex = 0;
      musicTimer = setInterval(scheduleMusic, 120);
      musicOn = true;
    } catch (e) {
      // A half-started loop must not leave a drone humming behind.
      stopMusic();
    }
  }

  function stopMusic() {
    if (musicTimer !== null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    try {
      if (droneOsc) droneOsc.stop();
    } catch (e) { /* already stopped */ }
    try {
      if (droneOsc) droneOsc.disconnect();
      if (droneGain) droneGain.disconnect();
    } catch (e) { /* already disconnected */ }
    droneOsc = null;
    droneGain = null;
    musicOn = false;
  }

  // Start or stop the desert music loop; returns whether music is now on.
  function toggleMusic() {
    if (musicOn) {
      stopMusic();
      return false;
    }
    startMusic();
    return musicOn;
  }

  function setMuted(m) {
    muted = !!m;
    if (state) state.muted = muted;
    if (actx && master) {
      try {
        master.gain.setTargetAtTime(muted ? 0 : 0.9, actx.currentTime, 0.02);
      } catch (e) { /* ignore */ }
    }
  }

  function update() {
    // Keep the engine hum following the player's car, silent off the road
    // or off the playing screen. Another module may also call setEngine
    // directly; both calls agree, and the second one each frame is harmless.
    const p = ctx.player;
    if (state.mode === 'playing' && p && p.car) {
      setEngine(clamp((p.car.speed || 0) / ENGINE_TOP_SPEED, 0, 1));
    } else {
      setEngine(0);
    }
  }

  return { update, resume, setEngine, siren, shot, chime, jingle, toggleMusic, setMuted };
}
