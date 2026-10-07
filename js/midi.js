/* midi.js — Web MIDI: incoming keyboard, outgoing synth.
 *
 * The API is only served in a secure context: https or localhost. Opened from
 * file://, the page still works, just without MIDI — hence serve.cmd. */
window.PM = window.PM || {};
PM.midi = (function () {
  let access = null;
  let inputs = [], outputs = [];
  let inId = '', outId = '';
  let noteCb = null, changeCb = null;

  function msg(key, vars) {
    return PM.i18n ? PM.i18n.t(key, vars) : key;
  }
  function supported() {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }
  function secureOk() {
    return typeof window !== 'undefined' && window.isSecureContext !== false;
  }
  function ready() { return !!access; }

  function enable(cb) {
    if (!supported()) {
      cb(new Error(msg(secureOk() ? 'midi.unsupported' : 'midi.insecure')));
      return;
    }
    navigator.requestMIDIAccess({ sysex: false }).then(function (a) {
      access = a;
      a.onstatechange = function () { refresh(); if (changeCb) changeCb(); };
      refresh();
      cb(null);
    }).catch(function (err) {
      cb(new Error(msg('midi.denied', { msg: (err && err.message) ? err.message : String(err) })));
    });
  }

  function refresh() {
    if (!access) return;
    inputs = [];
    outputs = [];
    access.inputs.forEach(function (d) { inputs.push(d); });
    access.outputs.forEach(function (d) { outputs.push(d); });
    bindInput();
  }
  function devices() {
    return {
      inputs: inputs.map(function (d) { return { id: d.id, name: d.name || d.id }; }),
      outputs: outputs.map(function (d) { return { id: d.id, name: d.name || d.id }; })
    };
  }

  function findIn(id) {
    for (let i = 0; i < inputs.length; i++) if (inputs[i].id === id) return inputs[i];
    return null;
  }
  function findOut(id) {
    for (let i = 0; i < outputs.length; i++) if (outputs[i].id === id) return outputs[i];
    return null;
  }

  function handle(e) {
    if (!noteCb || !e.data) return;
    const st = e.data[0], cmd = st & 0xF0, d1 = e.data[1], d2 = e.data[2];
    if (cmd === 0x90 && d2 > 0) noteCb('on', d1, d2 / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteCb('off', d1, 0);
    else if (cmd === 0xB0 && d1 === 123) noteCb('allOff', 0, 0);
  }
  function bindInput() {
    inputs.forEach(function (d) { d.onmidimessage = null; });
    const dev = findIn(inId);
    if (dev) dev.onmidimessage = handle;
  }
  function setInput(id) { inId = id || ''; bindInput(); }
  function setOutput(id) { outId = id || ''; }
  function onNote(cb) { noteCb = cb; }
  function onChange(cb) { changeCb = cb; }

  /* data: array of bytes; timeMs: performance.now() clock, 0 means now */
  function send(data, timeMs) {
    const dev = findOut(outId);
    if (!dev) return false;
    try { dev.send(data, timeMs || 0); return true; }
    catch (e) { return false; }
  }
  /* list: [{ ch, gm }] — one program change per channel in use */
  function programs(list) {
    list.forEach(function (x) { send([0xC0 | (x.ch & 15), x.gm & 127]); });
  }
  function panic() {
    for (let ch = 0; ch < 16; ch++) {
      send([0xB0 | ch, 123, 0]);   // all notes off
      send([0xB0 | ch, 120, 0]);   // all sound off
    }
  }

  return {
    supported: supported, secureOk: secureOk, ready: ready, enable: enable,
    devices: devices, setInput: setInput, setOutput: setOutput,
    onNote: onNote, onChange: onChange, send: send, programs: programs, panic: panic
  };
})();
