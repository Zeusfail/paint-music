/* audio.js — synthesis engine and instrument library.
 *
 * A "slot" is a colour of the palette, and the slot is what gets written into
 * the grid. The instrument it plays is chosen separately, so the sound can
 * change without touching the drawing.
 *
 * Signal chain: note -> slot bus (volume, pan)
 *            -> dry + reverb + echo -> compressor -> output. */
window.PM = window.PM || {};
PM.audio = (function () {

  const SLOTS = 16;
  const SLOT_COLORS = [
    '#2fb39a', '#ff7a59', '#9b8cff', '#ffb01f',
    '#4a7bff', '#ff6fb5', '#58c7f0', '#4a4540',
    '#f2a878', '#6ecb63', '#c678dd', '#1f7a8c',
    '#d94f70', '#b5651d', '#8e9aaf', '#ffe066'
  ];

  /* An instrument definition:
   *   partials  [frequency ratio, waveform, gain]
   *   mode      'decay' = percussive · 'hold' = sustained for the note length
   *   a/d/r     attack, decay, release (seconds)
   *   cut       base cutoff frequency
   *   fm        frequency modulation { ratio, index }
   *   vibrato   vibrato rate (Hz)
   *   vibratoDelay / vibratoDepth  how long before the vibrato settles in, and
   *             how wide — a player attacks straight, then brings it in
   *   filterEnv the filter opening during the attack { mul, time }: the bow
   *             stroke of a string, the bite of a brass
   *   tremolo   tremolo rate (Hz)
   *   noise     noise only · noiseMix: noise added to the partials
   *   pitchEnv  pitch drop { from, time } — for drum hits
   *   fixedPitch  forced pitch (drums: the row makes no difference)
   *   drumNote  General MIDI percussion note (channel 10 on export) */
  const INSTRUMENTS = [
      /* --- tuned percussion --- */
    { id: 'marimba', name: 'Marimba', family: 'tuned', gm: 12, mode: 'decay',
      partials: [[1, 'sine', 1], [4, 'sine', 0.16], [9, 'sine', 0.05]],
      a: 0.003, d: 0.42, r: 0.18, cut: 5200, gain: 0.9 },
    { id: 'vibra', name: 'Vibraphone', family: 'tuned', gm: 11, mode: 'decay',
      partials: [[1, 'sine', 1], [4, 'sine', 0.22], [10, 'sine', 0.06]],
      a: 0.004, d: 1.8, r: 0.5, cut: 5000, gain: 0.75, tremolo: 5 },
    { id: 'kalimba', name: 'Kalimba', family: 'tuned', gm: 108, mode: 'decay',
      partials: [[1, 'sine', 1], [3.2, 'sine', 0.3], [6.4, 'sine', 0.1]],
      a: 0.002, d: 0.6, r: 0.2, cut: 4200, gain: 0.8 },
    { id: 'musicbox', name: 'Music box', family: 'tuned', gm: 10, mode: 'decay',
      partials: [[1, 'sine', 0.7], [2, 'sine', 0.5], [5.4, 'sine', 0.18]],
      a: 0.002, d: 1.1, r: 0.35, cut: 7000, gain: 0.6, octave: 1 },
    { id: 'bell', name: 'Bell', family: 'tuned', gm: 14, mode: 'decay',
      fm: { ratio: 3.51, index: 420 }, partials: [[1, 'sine', 1]],
      a: 0.002, d: 2.2, r: 0.6, cut: 7000, gain: 0.55 },
    { id: 'glass', name: 'Glass', family: 'tuned', gm: 10, mode: 'decay', vibrato: 5.5,
      partials: [[1, 'sine', 1], [3, 'sine', 0.12], [5.1, 'sine', 0.06]],
      a: 0.005, d: 1.5, r: 0.4, cut: 6000, gain: 0.6 },

    /* --- plucked strings and keys --- */
    { id: 'pluck', name: 'Pluck', family: 'plucked', gm: 24, mode: 'decay',
      partials: [[1, 'triangle', 1], [2, 'sine', 0.3]],
      a: 0.002, d: 0.9, r: 0.2, cut: 3400, gain: 0.8 },
    { id: 'harp', name: 'Harp', family: 'plucked', gm: 46, mode: 'decay',
      partials: [[1, 'triangle', 0.9], [2, 'sine', 0.35], [3, 'sine', 0.12]],
      a: 0.003, d: 1.6, r: 0.4, cut: 4600, gain: 0.7 },
    { id: 'piano', name: 'Soft piano', family: 'plucked', gm: 0, mode: 'decay',
      partials: [[1, 'triangle', 0.9], [2, 'sine', 0.4], [3, 'sine', 0.14], [4, 'sine', 0.05]],
      a: 0.002, d: 1.4, r: 0.35, cut: 4000, gain: 0.78 },
    { id: 'organ', name: 'Organ', family: 'plucked', gm: 19, mode: 'hold',
      partials: [[1, 'sine', 0.8], [2, 'sine', 0.4], [3, 'sine', 0.25], [4, 'sine', 0.12]],
      a: 0.02, d: 0.1, r: 0.1, cut: 4200, gain: 0.5 },

    /* --- winds and bowed strings --- */
    { id: 'flute', name: 'Flute', family: 'wind', gm: 73, mode: 'hold',
      partials: [[1, 'sine', 1], [2, 'sine', 0.08]], noiseMix: 0.05,
      a: 0.09, d: 0.15, r: 0.22, cut: 3200, gain: 0.6,
      vibrato: 5, vibratoDelay: 0.3, vibratoDepth: 0.005 },
    { id: 'strings', name: 'Strings', family: 'wind', gm: 48, mode: 'hold',
      /* five slightly detuned desks: the beating between them is what gives
         an ensemble its thickness */
      partials: [[0.995, 'sawtooth', 0.32], [1, 'sawtooth', 0.36], [1.005, 'sawtooth', 0.32],
                 [2.004, 'sawtooth', 0.1], [3, 'sine', 0.04]],
      noiseMix: 0.012,
      a: 0.26, d: 0.35, r: 0.65, cut: 2000, gain: 0.4,
      filterEnv: { mul: 0.3, time: 0.5 },
      vibrato: 4.6, vibratoDelay: 0.45, vibratoDepth: 0.004 },
    { id: 'brass', name: 'Brass', family: 'wind', gm: 61, mode: 'hold',
      partials: [[1, 'sawtooth', 0.8], [1.003, 'sawtooth', 0.25], [2, 'sawtooth', 0.18]],
      a: 0.07, d: 0.25, r: 0.2, cut: 1900, gain: 0.5,
      filterEnv: { mul: 0.4, time: 0.13 },
      vibrato: 5.2, vibratoDelay: 0.5, vibratoDepth: 0.003 },
    { id: 'choir', name: 'Choir', family: 'wind', gm: 52, mode: 'hold',
      partials: [[0.997, 'sine', 0.4], [1, 'sine', 0.6], [1.008, 'sine', 0.4],
                 [2, 'sine', 0.2], [3, 'triangle', 0.07]],
      noiseMix: 0.02,
      a: 0.32, d: 0.4, r: 0.75, cut: 2400, gain: 0.42,
      filterEnv: { mul: 0.5, time: 0.6 },
      vibrato: 5, vibratoDelay: 0.6, vibratoDepth: 0.0035 },
    { id: 'pad', name: 'Pad', family: 'wind', gm: 89, mode: 'hold',
      partials: [[1, 'sawtooth', 0.6], [1.005, 'sawtooth', 0.5], [2, 'sine', 0.2]],
      a: 0.16, d: 0.3, r: 0.5, cut: 1500, gain: 0.5 },

    /* --- bass and leads --- */
    { id: 'bass', name: 'Bass', family: 'bass', gm: 38, mode: 'hold', octave: -1,
      partials: [[1, 'square', 0.7], [2, 'sine', 0.25]],
      a: 0.006, d: 0.2, r: 0.12, cut: 900, gain: 0.85 },
    { id: 'sub', name: 'Sub bass', family: 'bass', gm: 39, mode: 'hold', octave: -1,
      partials: [[1, 'sine', 1], [2, 'sine', 0.12]],
      a: 0.01, d: 0.2, r: 0.18, cut: 600, gain: 0.95 },
    { id: 'acid', name: 'Acid bass', family: 'bass', gm: 38, mode: 'decay', octave: -1,
      partials: [[1, 'sawtooth', 0.9]], q: 9,
      a: 0.004, d: 0.5, r: 0.15, cut: 700, gain: 0.7 },
    { id: 'lead', name: 'Lead', family: 'bass', gm: 81, mode: 'hold',
      partials: [[1, 'sawtooth', 0.8], [1.008, 'sawtooth', 0.6]],
      a: 0.01, d: 0.25, r: 0.14, cut: 2600, gain: 0.55 },
    { id: 'square', name: 'Square lead', family: 'bass', gm: 80, mode: 'hold',
      partials: [[1, 'square', 0.7], [2.01, 'square', 0.18]],
      a: 0.006, d: 0.2, r: 0.12, cut: 2400, gain: 0.5 },

    /* --- drums --- */
    { id: 'perc', name: 'Woodblock', family: 'drums', gm: 115, drumNote: 76, mode: 'decay',
      noise: true, partials: [], a: 0.001, d: 0.14, r: 0.06, cut: 2200, gain: 0.7, q: 6 },
    { id: 'kick', name: 'Kick', family: 'drums', gm: 118, drumNote: 36, mode: 'decay',
      partials: [[1, 'sine', 1]], fixedPitch: 45, pitchEnv: { from: 4.5, time: 0.07 },
      a: 0.001, d: 0.38, r: 0.08, cut: 2000, gain: 1 },
    { id: 'snare', name: 'Snare', family: 'drums', gm: 118, drumNote: 38, mode: 'decay',
      partials: [[1, 'triangle', 0.35]], fixedPitch: 62, noiseMix: 1,
      a: 0.001, d: 0.19, r: 0.06, cut: 3200, gain: 0.8, q: 1.2 },
    { id: 'hat', name: 'Hi-hat', family: 'drums', gm: 118, drumNote: 42, mode: 'decay',
      noise: true, partials: [], fixedPitch: 96,
      a: 0.001, d: 0.055, r: 0.03, cut: 9000, gain: 0.5, q: 2 },
    { id: 'clave', name: 'Clave', family: 'drums', gm: 115, drumNote: 75, mode: 'decay',
      partials: [[1, 'square', 0.6]], fixedPitch: 84,
      a: 0.001, d: 0.07, r: 0.03, cut: 6000, gain: 0.6 }
  ];

  const BY_ID = {};
  INSTRUMENTS.forEach(function (i) { BY_ID[i.id] = i; });

  /* Default sound for each slot. The first nine keep the original layout, so
     drawings made earlier still sound the same. */
  const DEFAULT_INSTRUMENTS = [
    'marimba', 'pluck', 'pad', 'bass', 'bell', 'lead', 'glass', 'perc', 'organ',
    'piano', 'musicbox', 'flute', 'strings', 'kick', 'snare', 'hat'
  ];

  function instrument(id) { return BY_ID[id] || INSTRUMENTS[0]; }
  function defaultInstrument(slot) { return DEFAULT_INSTRUMENTS[slot % SLOTS]; }
  function slotColor(slot) { return SLOT_COLORS[slot % SLOTS]; }
  function families() {
    const seen = [];
    INSTRUMENTS.forEach(function (i) { if (seen.indexOf(i.family) < 0) seen.push(i.family); });
    return seen;
  }
  /* MIDI channels: we skip 10 (index 9), reserved for percussion. */
  const MIDI_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  function midiChannel(slot) { return MIDI_CHANNELS[slot % MIDI_CHANNELS.length]; }

  function impulse(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function noiseBuffer(ctx) {
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* create(ctx, { voiceParams(slot) }) */
  function create(ctx, opts) {
    opts = opts || {};
    const getParams = opts.voiceParams || function () { return null; };

    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.2, 2.6);
    master.connect(comp);
    comp.connect(ctx.destination);
    dry.connect(master);
    wet.connect(verb);
    verb.connect(master);
    dry.gain.value = 1;
    wet.gain.value = 0.18;
    master.gain.value = 0.8;

    const delaySend = ctx.createGain();
    const delayNode = ctx.createDelay(2.5);
    const feedback = ctx.createGain();
    delaySend.gain.value = 0;
    delayNode.delayTime.value = 0.25;
    feedback.gain.value = 0.32;
    delaySend.connect(delayNode);
    delayNode.connect(feedback);
    feedback.connect(delayNode);
    delayNode.connect(master);
    delayNode.connect(wet);

    const buses = [];
    for (let i = 0; i < SLOTS; i++) {
      const g = ctx.createGain();
      let out = g, pan = null;
      if (ctx.createStereoPanner) {
        pan = ctx.createStereoPanner();
        g.connect(pan);
        out = pan;
      }
      out.connect(dry);
      out.connect(wet);
      out.connect(delaySend);
      buses.push({ gain: g, pan: pan });
    }

    const noise = noiseBuffer(ctx);

    function applyVoiceParams() {
      buses.forEach(function (b, i) {
        const p = getParams(i) || {};
        b.gain.gain.value = p.gain == null ? 1 : p.gain;
        if (b.pan) b.pan.pan.value = Math.max(-1, Math.min(1, p.pan || 0));
      });
    }
    applyVoiceParams();

    /* note(midi, slot, when, duration, dynamic, detune in cents) */
    function note(midi, slot, when, dur, vel, detune) {
      const p = getParams(slot) || {};
      const v = instrument(p.instrument || defaultInstrument(slot));
      const base = v.fixedPitch == null ? midi : v.fixedPitch;
      const m = base + (v.octave || 0) * 12 + (p.octave || 0) * 12;
      const freq = 440 * Math.pow(2, (m - 69) / 12);
      vel = vel == null ? 1 : Math.max(0.05, Math.min(1, vel));
      const peak = v.gain * vel * 0.3;
      const mul = p.decay == null ? 1 : p.decay;
      const dec = v.d * mul, rel = v.r * mul;

      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      const cutoff = Math.min(ctx.sampleRate / 2.2, (v.cut + freq * 2) * (0.5 + 0.7 * vel));
      /* filter envelope: the sound opens during the attack — this is what
         makes the bow stroke of a string or the bite of a brass. */
      if (v.filterEnv) {
        filt.frequency.setValueAtTime(Math.max(60, cutoff * v.filterEnv.mul), when);
        filt.frequency.exponentialRampToValueAtTime(cutoff, when + v.filterEnv.time);
      } else {
        filt.frequency.value = cutoff;
      }
      filt.Q.value = v.q || 0.7;
      g.connect(filt);
      filt.connect(buses[slot % buses.length].gain);

      const t = when;
      let end;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + v.a);
      if (v.mode === 'decay') {
        end = t + v.a + dec;
        g.gain.exponentialRampToValueAtTime(0.0001, end);
      } else {
        const sus = Math.max(peak * 0.72, 0.0001);
        g.gain.exponentialRampToValueAtTime(sus, t + v.a + dec);
        const off = t + Math.max(dur, v.a + 0.05);
        g.gain.setValueAtTime(sus, off);
        g.gain.exponentialRampToValueAtTime(0.0001, off + rel);
        end = off + rel;
      }
      const stop = end + 0.05;

      if (v.tremolo) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = v.tremolo;
        lg.gain.value = peak * 0.3;
        lfo.connect(lg);
        lg.connect(g.gain);
        lfo.start(t);
        lfo.stop(stop);
      }

      /* noise: on its own, or mixed into the partials (snare, flute breath) */
      if (v.noise || v.noiseMix) {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const ng = ctx.createGain();
        ng.gain.value = v.noise ? 1 : v.noiseMix;
        if (v.noise) {
          filt.frequency.value = freq * 2.2 * (0.6 + 0.5 * vel);
          filt.Q.value = v.q || 6;
        }
        src.connect(ng);
        ng.connect(g);
        src.start(t);
        src.stop(stop);
      }

      v.partials.forEach(function (pa) {
        const o = ctx.createOscillator();
        o.type = pa[1];
        o.frequency.setValueAtTime(freq * pa[0], t);
        /* pitch drop: what gives the kick drum its thump */
        if (v.pitchEnv) {
          o.frequency.setValueAtTime(freq * pa[0] * v.pitchEnv.from, t);
          o.frequency.exponentialRampToValueAtTime(freq * pa[0], t + v.pitchEnv.time);
        }
        if (detune) o.detune.value = detune;
        const pg = ctx.createGain();
        pg.gain.value = pa[2];
        o.connect(pg);
        pg.connect(g);
        if (v.fm) {
          const mod = ctx.createOscillator();
          mod.type = 'sine';
          mod.frequency.value = freq * v.fm.ratio;
          const mg = ctx.createGain();
          mg.gain.setValueAtTime(v.fm.index * vel, t);
          mg.gain.exponentialRampToValueAtTime(1, t + dec);
          mod.connect(mg);
          mg.connect(o.frequency);
          mod.start(t);
          mod.stop(stop);
        }
        if (v.vibrato) {
          const lfo = ctx.createOscillator();
          lfo.frequency.value = v.vibrato;
          const lg = ctx.createGain();
          const depth = freq * (v.vibratoDepth || 0.006);
          /* a player attacks straight, then brings the vibrato in */
          if (v.vibratoDelay) {
            lg.gain.setValueAtTime(0.0001, t);
            lg.gain.setValueAtTime(0.0001, t + v.vibratoDelay);
            lg.gain.linearRampToValueAtTime(depth, t + v.vibratoDelay + 0.45);
          } else {
            lg.gain.value = depth;
          }
          lfo.connect(lg);
          lg.connect(o.frequency);
          lfo.start(t);
          lfo.stop(stop);
        }
        o.start(t);
        o.stop(stop);
      });
      return end;
    }

    function click(when, accent) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = accent ? 1600 : 1050;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(accent ? 0.13 : 0.07, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
      o.connect(g);
      g.connect(master);
      o.start(when);
      o.stop(when + 0.06);
    }

    return {
      ctx: ctx, note: note, click: click, applyVoiceParams: applyVoiceParams,
      setVolume: function (v) { master.gain.value = v; },
      setReverb: function (v) { wet.gain.value = v; },
      setDelay: function (d) {
        delaySend.gain.value = d.amount || 0;
        if (d.seconds) delayNode.delayTime.value = Math.max(0.01, Math.min(2.4, d.seconds));
        if (d.feedback != null) feedback.gain.value = Math.max(0, Math.min(0.85, d.feedback));
      }
    };
  }

  return {
    SLOTS: SLOTS, SLOT_COLORS: SLOT_COLORS, INSTRUMENTS: INSTRUMENTS,
    instrument: instrument, defaultInstrument: defaultInstrument, slotColor: slotColor,
    families: families, midiChannel: midiChannel, create: create
  };
})();
