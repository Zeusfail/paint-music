/* export.js — offline WAV rendering (mixdown or separate stems) and MIDI file. */
window.PM = window.PM || {};
PM.exporter = (function () {
  const M = PM.model, S = M.state;
  const msg = function (k) { return PM.i18n ? PM.i18n.t(k) : k; };

  /* Which pages to render: the arrangement if it is on, otherwise the current page. */
  function pagesToRender() {
    return S.song.on ? M.songSteps().slice() : [S.page];
  }
  function usedColors(list) {
    const seen = {};
    list.forEach(function (p) {
      M.notes(p).forEach(function (n) { seen[n.color] = true; });
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function stamp() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function slug(s) {
    return String(s).toLowerCase()
      .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* --- WAV --- */
  function encodeWav(buffer) {
    const chans = buffer.numberOfChannels, len = buffer.length;
    const data = new ArrayBuffer(44 + len * chans * 2);
    const view = new DataView(data);
    const str = function (off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    view.setUint32(4, 36 + len * chans * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, chans, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * chans * 2, true);
    view.setUint16(32, chans * 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, len * chans * 2, true);
    const chanData = [];
    for (let c = 0; c < chans; c++) chanData.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < chans; c++) {
        const s = Math.max(-1, Math.min(1, chanData[c][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([data], { type: 'audio/wav' });
  }

  /* opts.colorFilter: keep only some voices (stem export) */
  function renderBuffer(opts, done, fail) {
    opts = opts || {};
    const spb = M.stepsPerBeat();
    const stepDur = 60 / S.bpm / spb;
    const C = M.cols();
    const list = pagesToRender();
    const total = list.length * C * stepDur + 2.5 + (S.delay.amount > 0 ? 3 : 0);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) { fail(msg('msg.offline')); return; }

    const octx = new OAC(2, Math.ceil(44100 * total), 44100);
    const eng = PM.audio.create(octx, { voiceParams: function (i) { return M.voice(i); } });
    eng.setVolume(S.volume);
    eng.setReverb(S.reverb);
    eng.setDelay({ amount: S.delay.amount, seconds: M.delaySeconds(), feedback: S.delay.feedback });
    const pitches = M.pitches();

    list.forEach(function (p, pi) {
      const t0 = pi * C * stepDur;
      M.playbackNotes(p).forEach(function (n) {
        if (n.row >= pitches.length) return;
        if (opts.colorFilter && !opts.colorFilter(n.color)) return;
        const sw = (n.start % 2 === 1) ? M.swingAmount() * stepDur : 0;
        eng.note(pitches[n.row], n.color, t0 + n.start * stepDur + sw, n.len * stepDur, n.vel, S.tune);
      });
      if (S.click && !opts.colorFilter) {
        for (let s = 0; s < C; s += spb) eng.click(t0 + s * stepDur, s % (spb * 4) === 0);
      }
    });

    octx.startRendering().then(done).catch(function (e) { fail(String(e)); });
  }

  function renderWav(onDone, onError) {
    renderBuffer({}, function (buf) {
      download(encodeWav(buf), 'painting-' + stamp() + '.wav');
      if (onDone) onDone();
    }, function (msg) { if (onError) onError(msg); });
  }

  /* One file per colour in use, rendered one after another. */
  function renderStems(onProgress, onDone, onError) {
    const colors = usedColors(pagesToRender());
    if (!colors.length) { if (onError) onError(msg('msg.emptyexport')); return; }
    const when = stamp();
    let i = 0;
    function next() {
      if (i >= colors.length) { if (onDone) onDone(colors.length); return; }
      const color = colors[i];
      const inst = PM.audio.instrument(M.voice(color).instrument || PM.audio.defaultInstrument(color));
      if (onProgress) onProgress(i + 1, colors.length, inst.name);
      renderBuffer({ colorFilter: function (c) { return c === color; } }, function (buf) {
        download(encodeWav(buf), 'painting-' + when + '-' + (i + 1) + '-' + slug(inst.name) + '.wav');
        i++;
        setTimeout(next, 400);        // space the downloads out
      }, function (msg) { if (onError) onError(msg); });
    }
    next();
  }

  /* --- MIDI (format 0) --- */
  function vlq(n) {
    const bytes = [n & 0x7F];
    n >>= 7;
    while (n > 0) { bytes.unshift((n & 0x7F) | 0x80); n >>= 7; }
    return bytes;
  }
  function pushStr(arr, s) { for (let i = 0; i < s.length; i++) arr.push(s.charCodeAt(i) & 127); }
  function push32(arr, n) { arr.push((n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255); }
  function meta(track, type, text) {
    track.push(0xFF, type);
    const bytes = [];
    pushStr(bytes, text);
    vlq(bytes.length).forEach(function (b) { track.push(b); });
    bytes.forEach(function (b) { track.push(b); });
  }

  function renderMidi() {
    const TPQ = 480;
    const spb = M.stepsPerBeat();
    const tps = TPQ / spb;
    const C = M.cols();
    const list = pagesToRender();
    const pitches = M.pitches();

    const events = [];
    const used = {};
    list.forEach(function (p, pi) {
      const t0 = pi * C * tps;
      events.push({ tick: t0, kind: 'marker', text: 'Page ' + (p + 1) });
      M.playbackNotes(p).forEach(function (n) {
        if (n.row >= pitches.length) return;
        const vp = M.voice(n.color);
        const inst = PM.audio.instrument(vp.instrument || PM.audio.defaultInstrument(n.color));
        const drum = inst.drumNote != null;
        /* a drum goes out on channel 10, with its General MIDI note */
        const ch = drum ? 9 : PM.audio.midiChannel(n.color);
        if (!drum) used[ch] = inst.gm;
        const midi = drum ? inst.drumNote : Math.max(0, Math.min(127,
          pitches[n.row] + (inst.octave || 0) * 12 + (vp.octave || 0) * 12));
        const sw = (n.start % 2 === 1) ? Math.round(M.swingAmount() * tps) : 0;
        const on = t0 + n.start * tps + sw;
        const vel = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
        events.push({ tick: on, kind: 'on', ch: ch, midi: midi, vel: vel });
        events.push({ tick: on + Math.max(1, n.len * tps - 4), kind: 'off', ch: ch, midi: midi, vel: 0 });
      });
    });
    const order = { marker: 0, off: 1, on: 2 };
    events.sort(function (a, b) { return a.tick - b.tick || order[a.kind] - order[b.kind]; });

    const track = [];
    track.push(0x00);
    meta(track, 0x03, 'Paint the Music');
    const us = Math.round(60000000 / S.bpm);
    track.push(0x00, 0xFF, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255);
    track.push(0x00, 0xFF, 0x58, 0x04, 0x04, 0x02, 24, 8);

    Object.keys(used).forEach(function (chStr) {
      const ch = parseInt(chStr, 10);
      track.push(0x00, 0xC0 | ch, used[chStr] & 127);
      /* Fine tuning is ±100 cents, far too fine for a semitone transpose.
         Set the pitch-bend range to 2 semitones via RPN, then apply it. */
      if (S.tune) {
        [[101, 0], [100, 0], [6, 2], [38, 0]].forEach(function (cc) {
          track.push(0x00, 0xB0 | ch, cc[0], cc[1]);
        });
        const bend = Math.max(0, Math.min(16383, 8192 + Math.round(S.tune / 200 * 8191)));
        track.push(0x00, 0xE0 | ch, bend & 127, (bend >> 7) & 127);
      }
    });

    let prev = 0;
    events.forEach(function (e) {
      vlq(e.tick - prev).forEach(function (b) { track.push(b); });
      prev = e.tick;
      if (e.kind === 'marker') meta(track, 0x06, e.text);
      else track.push((e.kind === 'on' ? 0x90 : 0x80) | e.ch, e.midi & 127, (e.vel || 0) & 127);
    });
    track.push(0x00, 0xFF, 0x2F, 0x00);

    const out = [];
    pushStr(out, 'MThd'); push32(out, 6);
    out.push(0, 0, 0, 1, (TPQ >> 8) & 255, TPQ & 255);
    pushStr(out, 'MTrk'); push32(out, track.length);
    track.forEach(function (b) { out.push(b); });
    download(new Blob([new Uint8Array(out)], { type: 'audio/midi' }), 'painting-' + stamp() + '.mid');
  }

  return {
    renderWav: renderWav, renderStems: renderStems, renderMidi: renderMidi,
    encodeWav: encodeWav, usedColors: usedColors, pagesToRender: pagesToRender
  };
})();
