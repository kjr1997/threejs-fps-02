// Synthesized sound: every effect is built from oscillators and filtered noise at
// runtime. No audio files are shipped and nothing is fetched. The context is created
// on the first user gesture (pointer lock), so autoplay rules never block it.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(when, dur, { type = 'lowpass', freq = 1200, q = 0.8, gain = 0.5, sweepTo = 0 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, when);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), when + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  function tone(when, dur, { type = 'sine', freq = 440, sweepTo = 0, gain = 0.3 } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  const SHOTS = {
    pistol: { dur: 0.09, freq: 2400, gain: 0.55 },
    smg: { dur: 0.07, freq: 3000, gain: 0.45 },
    rifle: { dur: 0.12, freq: 1800, gain: 0.65 },
    shotgun: { dur: 0.2, freq: 1100, gain: 0.8 },
    dmr: { dur: 0.22, freq: 1500, gain: 0.75 },
  };

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (!ensure()) return;
      const s = SHOTS[kind] || SHOTS.rifle;
      const t = ctx.currentTime;
      noise(t, s.dur, { freq: s.freq, sweepTo: 220, gain: s.gain });
      tone(t, 0.06, { type: 'square', freq: 160, sweepTo: 60, gain: 0.25 });
    },
    dryFire() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.04, { type: 'square', freq: 900, gain: 0.12 });
    },
    reload() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.03, { type: 'square', freq: 1200, gain: 0.12 });
      tone(t + 0.18, 0.03, { type: 'square', freq: 900, gain: 0.12 });
      tone(t + 0.42, 0.05, { type: 'square', freq: 1400, gain: 0.15 });
    },
    hit() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.05, { type: 'sine', freq: 1900, gain: 0.2 });
    },
    kill() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.08, { type: 'sine', freq: 1320, gain: 0.22 });
      tone(t + 0.08, 0.12, { type: 'sine', freq: 1760, gain: 0.22 });
    },
    hurt() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.12, { type: 'sawtooth', freq: 140, sweepTo: 70, gain: 0.25 });
    },
    step() {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.05, { freq: 500, gain: 0.06 });
    },
    bounce() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.05, { type: 'sine', freq: 300, sweepTo: 180, gain: 0.12 });
    },
    explosion() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 1.1, { freq: 900, sweepTo: 60, gain: 0.9 });
      tone(t, 0.9, { type: 'sine', freq: 90, sweepTo: 30, gain: 0.6 });
    },
    beep(final) {
      if (!ensure()) return;
      tone(ctx.currentTime, final ? 0.16 : 0.07, { type: 'square', freq: final ? 1560 : 1180, gain: 0.16 });
    },
    plantTick() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.05, { type: 'square', freq: 2100, gain: 0.1 });
    },
    buy() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.07, { type: 'sine', freq: 1560, gain: 0.18 });
      tone(t + 0.07, 0.1, { type: 'sine', freq: 2090, gain: 0.18 });
    },
    denied() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.12, { type: 'square', freq: 220, gain: 0.18 });
    },
    roundWin() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [523, 659, 784].forEach((f, i) => tone(t + i * 0.11, 0.16, { type: 'triangle', freq: f, gain: 0.2 }));
    },
    roundLose() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [392, 330, 262].forEach((f, i) => tone(t + i * 0.13, 0.18, { type: 'triangle', freq: f, gain: 0.18 }));
    },
    flash() {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.25, { type: 'highpass', freq: 3000, gain: 0.35 });
    },
  };
}
