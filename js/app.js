/* app.js — interface, transport, scheduler. */
window.PM = window.PM || {};
PM.app = (function () {
  const M = PM.model, S = M.state, SC = PM.scales, A = PM.audio;
  const T = function (k, v) { return PM.i18n.t(k, v); };
  /* the instrument a palette slot actually plays */
  function instOf(slot) { return A.instrument(M.voice(slot).instrument || A.defaultInstrument(slot)); }
  function instName(inst) { return T('inst.' + inst.id) || inst.name; }
  function channelOf(slot) { return instOf(slot).drumNote != null ? 9 : A.midiChannel(slot); }
  const $ = function (id) { return document.getElementById(id); };

  let eng = null, actx = null, clock = null;
  let playing = false, raf = null;
  let step = 0, nextTime = 0, playPage = 0, songIdx = 0, queue = [];
  let taps = [];
  const heldRows = new Map();   // row -> dynamic, for live playing

  /* physical keys, low to high (independent of the keyboard layout) */
  const KEYMAP = [
    'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash',
    'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote',
    'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'
  ];

  /* ---------- audio ---------- */
  function engine() {
    if (!eng) {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      eng = PM.audio.create(actx, { voiceParams: function (i) { return M.voice(i); } });
      eng.setVolume(S.volume);
      eng.setReverb(S.reverb);
      syncDelay();
    }
    if (actx.state === 'suspended') actx.resume();
    return eng;
  }
  function syncDelay() {
    if (!eng) return;
    eng.setDelay({ amount: S.delay.amount, seconds: M.delaySeconds(), feedback: S.delay.feedback });
  }
  function stepDur() { return 60 / S.bpm / M.stepsPerBeat(); }
  function swingOffset(s) { return (s % 2 === 1) ? M.swingAmount() * stepDur() : 0; }
  function lookahead() { return document.hidden ? 2 : 0.15; }

  function previewNote(row, color, vel) {
    const e = engine();
    const p = M.pitches();
    if (row < p.length) e.note(p[row], color, actx.currentTime + 0.005, 0.3, (vel == null ? 1 : vel) * 0.9, S.tune);
  }

  /* ---------- transport ---------- */
  /* Web MIDI stamps with performance.now(), audio with actx.currentTime. */
  function audioToMidiTime(t) { return performance.now() + (t - actx.currentTime) * 1000; }
  function midiNoteOf(row, slot) {
    const inst = instOf(slot);
    if (inst.drumNote != null) return inst.drumNote;   // drums: fixed pitch
    const p = M.pitches();
    const vp = M.voice(slot);
    return Math.max(0, Math.min(127, p[row] + (inst.octave || 0) * 12 + (vp.octave || 0) * 12));
  }

  function scheduleStep(page, s, time) {
    const e = engine();
    const p = M.pitches();
    const d = stepDur();
    M.notesAtStep(page, s).forEach(function (n) {
      if (n.row >= p.length) return;
      const t = time + swingOffset(s);
      if (S.midi.local) e.note(p[n.row], n.color, t, n.len * d, n.vel, S.tune);
      if (S.midi.send) {
        const ch = channelOf(n.color);
        const note = midiNoteOf(n.row, n.color);
        const vel = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
        PM.midi.send([0x90 | ch, note, vel], audioToMidiTime(t));
        PM.midi.send([0x80 | ch, note, 0], audioToMidiTime(t + n.len * d));
      }
    });
    if (S.click && s % M.stepsPerBeat() === 0) {
      e.click(time, s % (M.stepsPerBeat() * 4) === 0);
    }
  }
  function tick() {
    if (!playing) return;
    const horizon = actx.currentTime + lookahead();
    while (nextTime < horizon) {
      scheduleStep(playPage, step, nextTime);
      queue.push({ step: step, time: nextTime, page: playPage, slot: songIdx });
      nextTime += stepDur();
      step++;
      if (S.song.on) {
        if (step >= M.cols()) {
          const order = M.songSteps();
          step = 0;
          songIdx = (songIdx + 1) % order.length;
          playPage = order[songIdx];
        }
      } else {
        const lr = M.loopRange();
        if (step >= lr.to) step = lr.from;
      }
    }
  }
  function frame() {
    if (!playing) return;
    const now = actx.currentTime;
    let cur = null;
    while (queue.length && queue[0].time <= now) cur = queue.shift();
    if (cur) {
      if (cur.page !== S.page) { S.page = cur.page; paintPages(); }
      if (S.song.on) paintSong(cur.slot);
      /* recording: held keys paint the column the playhead has reached */
      if (S.record && heldRows.size) {
        heldRows.forEach(function (vel, r) { M.paint(r, cur.step, S.color, vel, cur.page); });
        refreshActionBar();
      }
      PM.canvas.setPlayStep(cur.step);
    }
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (playing) return;
    engine();
    playing = true;
    queue = [];
    songIdx = 0;
    const order = M.songSteps();
    playPage = S.song.on ? order[0] : S.page;
    step = S.song.on ? 0 : M.loopRange().from;

    const t0 = actx.currentTime + 0.08;
    const beat = 60 / S.bpm;
    const countBeats = S.countIn * 4;
    for (let i = 0; i < countBeats; i++) eng.click(t0 + i * beat, i % 4 === 0);
    nextTime = t0 + countBeats * beat;

    if (!clock) clock = PM.clock.create(tick, 25);
    clock.start();
    tick();
    raf = requestAnimationFrame(frame);
    $('play').classList.add('on');
    $('play').innerHTML = pauseIcon();
    syncAria();
  }
  function stop() {
    playing = false;
    if (clock) clock.stop();
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    queue = [];
    heldRows.clear();
    if (S.midi.send) PM.midi.panic();      // never leave a note stuck on the external synth
    PM.canvas.setPlayStep(-1);
    paintSong(-1);
    $('play').classList.remove('on');
    $('play').innerHTML = playIcon();
    syncAria();
  }
  function toggle() { playing ? stop() : play(); }
  function rewind() {
    if (playing) { stop(); play(); } else PM.canvas.setPlayStep(-1);
  }

  const playIcon = function () { return '<svg viewBox="0 0 24 24"><path d="M8 5l12 7-12 7z"/></svg>'; };
  const pauseIcon = function () { return '<svg viewBox="0 0 24 24"><rect x="7" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'; };

  /* ---------- playable keyboard ---------- */
  function keyRow(code) {
    const i = KEYMAP.indexOf(code);
    return i < 0 ? -1 : i;
  }
  /* Live playing: the computer keyboard and the MIDI keyboard both come here. */
  function noteOn(r, vel) {
    if (r < 0 || r >= M.rows() || heldRows.has(r)) return;
    heldRows.set(r, vel);
    if (S.midi.local) previewNote(r, S.color, vel);
    if (S.midi.send) {
      PM.midi.send([0x90 | channelOf(S.color), midiNoteOf(r, S.color),
        Math.max(1, Math.round(vel * 127))]);
    }
    if (S.record && playing) {
      const c = PM.canvas.playStep();
      if (c >= 0) { M.paint(r, c, S.color, vel, playPage); PM.canvas.render(); }
    }
  }
  function noteOff(r) {
    if (!heldRows.has(r)) return;
    heldRows.delete(r);
    if (S.midi.send) PM.midi.send([0x80 | channelOf(S.color), midiNoteOf(r, S.color), 0]);
  }
  function keyDown(code) { noteOn(keyRow(code), 0.9); }
  function keyUp(code) { noteOff(keyRow(code)); }

  /* ---------- painting the interface ---------- */
  function paintPalette() {
    const host = $('palette');
    host.innerHTML = '';
    for (let i = 0; i < A.SLOTS; i++) {
      const b = document.createElement('button');
      b.className = 'swatch' + (S.color === i ? ' on' : '');
      b.style.background = A.slotColor(i);
      b.title = instName(instOf(i)) + (i < 9 ? ' (' + (i + 1) + ')' : '');
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', function () {
        S.color = i;
        if (S.tool !== 'select') S.tool = 'brush';
        paintPalette(); paintTools(); paintVoicePanel(); PM.canvas.render(); M.save();
      });
      host.appendChild(b);
    }
    $('voice-name').textContent = instName(instOf(S.color));
  }
  function paintVoicePanel() {
    const v = M.voice(S.color);
    const title = $('voice-title');
    title.textContent = instName(instOf(S.color));
    title.style.color = A.slotColor(S.color);
    $('v-instrument').value = M.voice(S.color).instrument || A.defaultInstrument(S.color);
    $('v-gain').value = v.gain;
    $('v-pan').value = v.pan;
    $('v-oct').textContent = (v.octave > 0 ? '+' : '') + v.octave;
    $('v-decay').value = v.decay;
    $('v-art-held').classList.toggle('on', v.articulation !== 'repeated');
    $('v-art-rep').classList.toggle('on', v.articulation === 'repeated');
    refreshNumbers();
  }
  function changeVoice(key, value) {
    M.voice(S.color)[key] = value;
    if (eng) eng.applyVoiceParams();
    paintVoicePanel();
    PM.canvas.render();
    M.save();
  }
  /* contextual bar of the Note tool */
  function paintNoteBar(n) {
    const has = !!n;
    $('note-info').textContent = has
      ? SC.noteLabel(M.pitches()[n.row]) + ' · ' + instName(instOf(n.color)) +
        ' · ' + T('note.at', { n: n.start })
      : T('note.none');
    $('note-len').value = has ? n.len : '';
    $('note-len').disabled = !has;
    ['note-x2', 'note-div2', 'note-del'].forEach(function (id) { $(id).disabled = !has; });
  }
  /* every action on a note restarts from the fresh copy the model returns */
  function withNote(fn) {
    const n = S.noteSel;
    if (!n) return;
    M.pushUndo();
    S.noteSel = fn(n) || null;
    paintNoteBar(S.noteSel);
    afterEdit();
  }

  function paintTools() {
    $('tool-brush').classList.toggle('on', S.tool === 'brush');
    $('tool-eraser').classList.toggle('on', S.tool === 'eraser');
    $('tool-select').classList.toggle('on', S.tool === 'select');
    $('tool-note').classList.toggle('on', S.tool === 'note');
    /* the two contextual bars never show together */
    $('notebar').hidden = S.tool !== 'note';
    $('selbar').hidden = S.tool === 'note' ||
      (S.tool !== 'select' && !M.normSel(S.selection));
    $('toggle-grid').classList.toggle('on', S.showGrid);
    [1, 2, 3].forEach(function (n) {
      $('brush-' + n).classList.toggle('on', S.brush === n);
    });
    $('undo').disabled = !M.canUndo();
    $('redo').disabled = !M.canRedo();
  }
  function paintPages() {
    const host = $('pages');
    host.innerHTML = '';
    for (let i = 0; i < M.PAGES; i++) {
      const b = document.createElement('button');
      b.className = 'page' + (S.page === i ? ' on' : '') + (M.isEmpty(i) ? '' : ' filled');
      b.textContent = String(i + 1);
      b.title = T(M.isEmpty(i) ? 'page.empty' : 'page.n', { n: i + 1 });
      b.addEventListener('click', function () {
        S.page = i;
        if (!playing) PM.canvas.setPlayStep(-1);
        paintPages(); PM.canvas.render(); M.save();
      });
      host.appendChild(b);
    }
  }
  function paintSong(activeSlot) {
    const host = $('song-row');
    host.innerHTML = '';
    S.song.steps.forEach(function (p, i) {
      const b = document.createElement('button');
      b.className = 'slot' + (activeSlot === i ? ' playing' : '');
      b.textContent = String(p + 1);
      b.title = T('song.link', { i: i + 1, p: p + 1 });
      b.addEventListener('click', function () {
        S.song.steps[i] = (S.song.steps[i] + 1) % M.PAGES;
        paintSong(); M.save();
      });
      host.appendChild(b);
    });
    $('song-on').classList.toggle('on', S.song.on);
  }
  function paintKeys() {
    const host = $('key-selector');
    host.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const b = document.createElement('button');
      const name = SC.pitchName(i);
      b.className = 'keybtn' + (name.indexOf('♯') > 0 ? ' black' : '') + (S.key === i ? ' on' : '');
      b.textContent = name;
      b.addEventListener('click', function () {
        S.key = i;
        paintKeys(); refreshValues(); PM.canvas.render(); M.save();
      });
      host.appendChild(b);
    }
  }
  function paintProjects() {
    const sel = $('proj-list');
    const names = PM.projects.list();
    const cur = sel.value;
    sel.innerHTML = '';
    if (!names.length) {
      const o = document.createElement('option');
      o.textContent = T('opt.none2');
      o.value = '';
      sel.appendChild(o);
    }
    names.forEach(function (n) {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      if (n === cur) o.selected = true;
      sel.appendChild(o);
    });
  }
  function paintMidiDevices() {
    const ready = PM.midi.ready();
    const d = ready ? PM.midi.devices() : { inputs: [], outputs: [] };
    const asOpts = function (arr) {
      return [{ id: '', label: T('opt.none2') }].concat(arr.map(function (x) {
        return { id: x.id, label: x.name };
      }));
    };
    fillSelect($('midi-in'), asOpts(d.inputs), S.midi.in);
    fillSelect($('midi-out'), asOpts(d.outputs), S.midi.out);
    PM.midi.setInput(S.midi.in);
    PM.midi.setOutput(S.midi.out);
    $('midi-in').disabled = !ready;
    $('midi-out').disabled = !ready;
    $('midi-send').disabled = !ready;
    $('midi-enable').classList.toggle('on', ready);
    $('midi-enable').textContent = T(ready ? 'btn.midion' : 'btn.enable');
    $('midi-note').textContent = ready
      ? T('midi.devices', { in: d.inputs.length, out: d.outputs.length })
      : (PM.midi.supported() ? '' : T('midi.needlocal'));
  }
  function fillSelect(el, items, value) {
    el.innerHTML = '';
    items.forEach(function (it) {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.label;
      if (String(it.id) === String(value)) o.selected = true;
      el.appendChild(o);
    });
  }

  function refreshActionBar() {
    const has = !!M.normSel(S.selection);
    $('selbar').hidden = S.tool === 'note' || (S.tool !== 'select' && !has);
    document.querySelectorAll('.sel-only').forEach(function (b) { b.disabled = !has; });
    $('sel-paste').disabled = !M.hasClipboard();
    $('loop-off').disabled = !S.loop.on;
    $('loop-off').classList.toggle('on', S.loop.on);
    $('play-keys').classList.toggle('on', S.playKeys);
    $('rec').classList.toggle('on', S.record);
    $('midi-send').classList.toggle('on', S.midi.send);
    $('midi-local').classList.toggle('on', S.midi.local);
  }
  function refreshValues() {
    const p = M.pitches();
    $('oct-val').textContent = (S.octaveShift > 0 ? '+' : '') + S.octaveShift;
    $('bpm-val').value = S.bpm;
    $('bpm').value = S.bpm;
    $('range-info').textContent = SC.noteLabel(p[0]) + ' – ' + SC.noteLabel(p[p.length - 1]);
    $('click').classList.toggle('on', S.click);
    $('preserve').classList.toggle('on', S.preservePitch);
    $('grid-info').textContent = T('grid.info', { cols: M.cols(), rows: M.rows() });
    $('zoom-val').textContent = Math.round(S.zoom * 100) + '%';
    $('vel-fixed').disabled = S.velocityMode !== 'fixed';
    $('vel-note').textContent = S.velocityMode === 'fixed' ? '' : T('vel.gesture');

    const sw = M.swingAvailable();
    $('swing').disabled = !sw;
    $('swing-note').textContent = sw ? '' : T('swing.na');

    const o = M.outOfFrame();
    $('oof').hidden = o.count === 0;
    if (o.count) $('oof-count').textContent = PM.i18n.plural(o.count, 'oof.count', 'oof.countp');
    refreshNumbers();
    refreshActionBar();
    syncAria();
  }
  function afterEdit() {
    paintTools(); paintPages(); paintSong(); refreshValues();
    PM.canvas.refresh();
    M.save();
  }
  /* after an undo or a restore, the settings may have changed too */
  function afterRestore() {
    syncAllControls();
    afterEdit();
  }

  /* ---------- restore points ---------- */
  function countCells() {
    let n = 0;
    S.pages.forEach(function (g) { n += Object.keys(g).length; });
    return n;
  }
  function deepState() { return JSON.parse(JSON.stringify(M.serialize())); }

  /* Always archive: the operation replaces or destroys the project. */
  function guard(label, fn) {
    PM.restore.snapshot(label);
    fn();
    paintRestore();
    showRestoreChip(label);
  }
  /* Archive only if the operation really lost notes (collisions while
     remapping, notes pushed out of frame, a cleared page…). */
  function guardLoss(label, fn) {
    const before = deepState();
    const cells = countCells();
    const oof = M.outOfFrame().count;
    fn();
    if (countCells() < cells || M.outOfFrame().count > oof) {
      PM.restore.snapshotData(label, before);
      paintRestore();
      showRestoreChip(label);
    }
  }
  let chipTimer = null;
  function showRestoreChip(label) {
    const chip = $('restore-chip');
    if (!chip) return;
    $('restore-chip-label').textContent = label;
    chip.hidden = false;
    if (chipTimer) clearTimeout(chipTimer);
    chipTimer = setTimeout(function () { chip.hidden = true; }, 25000);
  }
  function paintRestore() {
    const sel = $('restore-list');
    const items = PM.restore.list();
    sel.innerHTML = '';
    if (!items.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = T('opt.none2');
      sel.appendChild(o);
    }
    items.forEach(function (it) {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = PM.restore.describe(it);
      sel.appendChild(o);
    });
    $('restore-apply').disabled = !items.length;
    $('restore-clear').disabled = !items.length;
  }
  function applyRestore(id) {
    if (!id) return;
    if (!confirm(T('msg.restoreconfirm'))) return;
    /* archive the current state before stepping back, so it stays reachable */
    PM.restore.snapshot(T('r.before.restore'));
    if (PM.restore.restore(id)) {
      stop();
      afterRestore();
      paintRestore();
    }
  }
  function sendPrograms() {
    const list = [];
    for (let i = 0; i < A.SLOTS; i++) {
      const inst = instOf(i);
      if (inst.drumNote == null) list.push({ ch: A.midiChannel(i), gm: inst.gm });
    }
    PM.midi.programs(list);
  }

  /* ---------- actions on the selection ---------- */
  function withSelection(fn) {
    const sel = M.normSel(S.selection);
    if (!sel) return;
    M.pushUndo();
    fn(sel);
    afterEdit();
  }
  function harmOffset() {
    const v = $('harm-offset').value;
    const n = M.scaleLen();
    if (v === 'oct') return n;
    if (v === '-oct') return -n;
    return parseInt(v, 10);
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.theme === 'dark' ? 'dark' : 'light');
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', S.theme === 'dark' ? '#23211d' : '#fdf4e6');
    $('theme').classList.toggle('on', S.theme === 'dark');
    $('theme').title = T(S.theme === 'dark' ? 't.themelight' : 't.themedark');
    $('theme').setAttribute('aria-label', $('theme').title);
    PM.canvas.invalidateTheme();
  }

  /* ---------- language ---------- */
  function applyLang() {
    PM.i18n.setLang(S.lang);
    PM.i18n.apply();
    $('lang').textContent = T('lang.name');
    relabel();
  }
  /* Everything built by script has to be rebuilt when the language changes. */
  function relabel() {
    buildSelects();
    paintPalette(); paintPages(); paintSong(); paintProjects();
    paintMidiDevices(); paintRestore(); paintVoicePanel();
    paintNoteBar(S.noteSel);
    applyTheme();
    refreshValues();
    nameIconButtons();
    syncAria();
  }

  /* ---------- accessibility ----------
   * Buttons without text only carry a tooltip, which a screen reader does not
   * always announce. Turn it into a real accessible name. */
  function nameIconButtons() {
    document.querySelectorAll('button[title]').forEach(function (b) {
      if (!b.textContent.trim()) b.setAttribute('aria-label', b.title);
    });
  }
  const TOGGLES = ['tool-brush', 'tool-eraser', 'tool-select', 'tool-note', 'toggle-grid',
    'brush-1', 'brush-2', 'brush-3', 'preserve', 'click', 'play-keys', 'rec',
    'midi-send', 'midi-local', 'song-on', 'theme', 'loop-off',
    'v-art-held', 'v-art-rep'];
  function syncAria() {
    TOGGLES.forEach(function (id) {
      const b = $(id);
      if (b) b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
    });
    const p = $('play');
    if (p) p.setAttribute('aria-label', T(p.classList.contains('on') ? 'a.stop' : 'a.play'));
  }

  /* ---------- sliders: typed entry ----------
   * Every slider marked data-num gets a number field beside it. Typing in it
   * sets the slider and fires an "input" event, so all the logic already wired
   * up runs unchanged. */
  const numRefreshers = [];
  function attachNumbers() {
    document.querySelectorAll('input[type=range][data-num]').forEach(function (r) {
      if (r.dataset.numDone) return;
      const percent = r.dataset.num === 'percent';
      const box = document.createElement('input');
      box.type = 'number';
      box.className = 'numbox';
      box.title = r.title || '';
      const f = percent ? 100 : 1;
      box.min = Math.round(parseFloat(r.min) * f);
      box.max = Math.round(parseFloat(r.max) * f);
      box.step = percent ? Math.max(1, Math.round(parseFloat(r.step) * 100)) : r.step;

      const toBox = function () {
        box.value = percent ? Math.round(parseFloat(r.value) * 100) : r.value;
        box.disabled = r.disabled;
      };
      box.addEventListener('change', function () {
        let v = parseFloat(box.value);
        if (isNaN(v)) { toBox(); return; }
        v = v / f;
        v = Math.max(parseFloat(r.min), Math.min(parseFloat(r.max), v));
        r.value = v;
        r.dispatchEvent(new Event('input', { bubbles: true }));
        toBox();
      });
      /* Enter commits without waiting for the field to lose focus */
      box.addEventListener('keydown', function (e) { if (e.key === 'Enter') box.blur(); });
      r.addEventListener('input', toBox);
      r.insertAdjacentElement('afterend', box);
      r.dataset.numDone = '1';
      numRefreshers.push(toBox);
      toBox();
    });
  }
  function refreshNumbers() { numRefreshers.forEach(function (f) { f(); }); }

  /* tabbed inspector */
  function wireTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panes = document.querySelectorAll('.tabpane');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.toggle('on', x === t); });
        panes.forEach(function (p) { p.classList.toggle('on', p.dataset.pane === t.dataset.tab); });
      });
    });
  }

  function wire() {
    wireTabs();
    /* tools */
    $('tool-brush').addEventListener('click', function () { S.tool = 'brush'; paintTools(); PM.canvas.render(); });
    $('tool-eraser').addEventListener('click', function () { S.tool = 'eraser'; paintTools(); PM.canvas.render(); });
    $('tool-select').addEventListener('click', function () { S.tool = 'select'; paintTools(); PM.canvas.render(); });
    $('tool-note').addEventListener('click', function () { S.tool = 'note'; paintTools(); PM.canvas.render(); });

    /* Note tool */
    $('note-len').addEventListener('change', function () {
      const v = parseInt(this.value, 10);
      if (!isNaN(v)) withNote(function (n) { return M.setNoteLength(n, v); });
    });
    $('note-x2').addEventListener('click', function () {
      withNote(function (n) { return M.setNoteLength(n, n.len * 2); });
    });
    $('note-div2').addEventListener('click', function () {
      withNote(function (n) { return M.setNoteLength(n, Math.max(1, Math.floor(n.len / 2))); });
    });
    $('note-del').addEventListener('click', function () {
      withNote(function (n) { M.deleteNote(n); return null; });
    });

    /* rhythmic repeat */
    $('sel-repeat').addEventListener('click', function () {
      const t = Math.max(1, Math.min(64, parseInt($('rep-times').value, 10) || 1));
      withSelection(function (sel) { M.repeatRegion(sel, t); });
    });
    $('sel-fill').addEventListener('click', function () {
      withSelection(function (sel) { M.fillToEnd(sel); });
    });
    $('undo').addEventListener('click', function () { if (M.undo()) afterRestore(); });
    $('redo').addEventListener('click', function () { if (M.redo()) afterRestore(); });
    $('shuffle').addEventListener('click', function () {
      M.pushUndo(); M.randomize(S.color); afterEdit();
    });
    $('clear').addEventListener('click', function () {
      if (M.isEmpty() || confirm(T('msg.clearpage', { n: S.page + 1 }))) {
        guardLoss(T('r.before.clear', { n: S.page + 1 }), function () {
          M.pushUndo(); M.clearPage();
        });
        afterEdit();
      }
    });
    $('toggle-grid').addEventListener('click', function () { S.showGrid = !S.showGrid; paintTools(); PM.canvas.render(); });
    [1, 2, 3].forEach(function (n) {
      $('brush-' + n).addEventListener('click', function () { S.brush = n; paintTools(); PM.canvas.render(); });
    });

    /* selection */
    $('sel-all').addEventListener('click', function () {
      S.tool = 'select'; M.selectAll(); paintTools(); PM.canvas.render(); refreshActionBar();
    });
    $('sel-none').addEventListener('click', function () {
      M.clearSelection(); PM.canvas.render(); refreshActionBar();
    });
    $('sel-copy').addEventListener('click', function () {
      M.copyRegion(S.selection); refreshActionBar();
    });
    $('sel-cut').addEventListener('click', function () { withSelection(function (s) { M.cutRegion(s); }); });
    $('sel-del').addEventListener('click', function () { withSelection(function (s) { M.deleteRegion(s); }); });
    $('sel-paste').addEventListener('click', function () {
      const sel = M.normSel(S.selection), h = PM.canvas.hoverCell();
      const r = sel ? sel.r0 : (h ? h.r : 0), c = sel ? sel.c0 : (h ? h.c : 0);
      M.pushUndo(); M.pasteRegion(r, c); afterEdit();
    });
    $('sel-up').addEventListener('click', function () { withSelection(function (s) { M.moveRegion(s, 1, 0); }); });
    $('sel-down').addEventListener('click', function () { withSelection(function (s) { M.moveRegion(s, -1, 0); }); });
    $('sel-left').addEventListener('click', function () { withSelection(function (s) { M.moveRegion(s, 0, -1); }); });
    $('sel-right').addEventListener('click', function () { withSelection(function (s) { M.moveRegion(s, 0, 1); }); });
    $('sel-oct-up').addEventListener('click', function () { withSelection(function (s) { M.moveRegion(s, M.scaleLen(), 0); }); });
    $('sel-oct-down').addEventListener('click', function () { withSelection(function (s) { M.moveRegion(s, -M.scaleLen(), 0); }); });
    $('sel-x2').addEventListener('click', function () { withSelection(function (s) { M.stretchRegion(s, 2); }); });
    $('sel-div2').addEventListener('click', function () { withSelection(function (s) { M.stretchRegion(s, 0.5); }); });
    $('sel-harm').addEventListener('click', function () {
      M.pushUndo(); M.harmonize(S.selection, harmOffset()); afterEdit();
    });
    $('sel-human').addEventListener('click', function () {
      M.pushUndo(); M.humanize(S.selection); afterEdit();
    });
    $('sel-loop').addEventListener('click', function () {
      if (M.setLoopFromSelection()) { PM.canvas.render(); refreshActionBar(); M.save(); }
    });
    $('loop-off').addEventListener('click', function () {
      S.loop.on = false; PM.canvas.render(); refreshActionBar(); M.save();
    });

    /* playing: count-in, keyboard, recording */
    $('count-in').addEventListener('change', function () { S.countIn = parseInt(this.value, 10); M.save(); });
    $('play-keys').addEventListener('click', function () {
      S.playKeys = !S.playKeys;
      if (!S.playKeys) { S.record = false; heldRows.clear(); }
      refreshActionBar();
    });
    $('rec').addEventListener('click', function () {
      S.record = !S.record;
      if (S.record) {
        S.playKeys = true;
        M.pushUndo();
        PM.restore.snapshot(T('r.before.record')); paintRestore();
      }
      refreshActionBar();
    });

    /* projects */
    $('proj-save').addEventListener('click', function () {
      const sugg = $('proj-list').value || 'untitled';
      const name = prompt(T('msg.projname'), sugg);
      if (!name) return;
      if (PM.projects.exists(name) && !confirm(T('msg.projreplace', { name: name }))) return;
      if (!PM.projects.save(name)) { alert(T('msg.projsavefail')); return; }
      paintProjects();
      $('proj-list').value = name;
    });
    $('proj-load').addEventListener('click', function () {
      const name = $('proj-list').value;
      if (!name) return;
      if (!confirm(T('msg.projopen', { name: name }))) return;
      guard(T('r.before.open', { name: name }), function () {
        if (PM.projects.load(name)) { stop(); afterRestore(); }
      });
    });
    $('proj-del').addEventListener('click', function () {
      const name = $('proj-list').value;
      if (!name || !confirm(T('msg.projdelete', { name: name }))) return;
      /* archive the project itself, so deleting stays reversible */
      const keep = PM.projects.read(name);
      if (keep) PM.restore.snapshotData(T('r.deleted', { name: name }), keep);
      PM.projects.remove(name);
      paintProjects(); paintRestore();
    });
    $('proj-export').addEventListener('click', function () {
      PM.projects.download($('proj-list').value || 'painting');
    });
    $('proj-import-btn').addEventListener('click', function () { $('proj-import').click(); });
    $('proj-import').addEventListener('change', function () {
      const f = this.files && this.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = function () {
        try {
          PM.restore.snapshot(T('r.before.import'));
          const name = PM.projects.fromJSON(String(rd.result));
          stop(); afterRestore(); paintRestore();
          alert(T('msg.imported', { name: name }));
        } catch (err) {
          alert(T('msg.importfail', { msg: err.message }));
        }
      };
      rd.readAsText(f);
      this.value = '';
    });

    /* musical settings */
    $('scale').addEventListener('change', function () {
      const v = this.value;
      guardLoss(T('r.before.scale'), function () {
        M.pushUndo(); M.setScale(v);
      });
      afterEdit();
    });
    $('preserve').addEventListener('click', function () {
      S.preservePitch = !S.preservePitch; refreshValues(); M.save();
    });
    $('range').addEventListener('change', function () {
      const v = parseInt(this.value, 10);
      guardLoss(T('r.before.range'), function () { M.pushUndo(); S.octaves = v; });
      afterEdit();
    });
    $('oct-down').addEventListener('click', function () {
      S.octaveShift = Math.max(-3, S.octaveShift - 1); refreshValues(); M.save();
    });
    $('oct-up').addEventListener('click', function () {
      S.octaveShift = Math.min(3, S.octaveShift + 1); refreshValues(); M.save();
    });
    $('tune').addEventListener('input', function () { S.tune = parseInt(this.value, 10); refreshValues(); M.save(); });
    $('bars').addEventListener('change', function () {
      const v = parseInt(this.value, 10);
      guardLoss(T('r.before.length'), function () { M.pushUndo(); S.bars = v; });
      afterEdit();
    });
    $('quantize').addEventListener('change', function () {
      const v = this.value;
      guardLoss(T('r.before.division'), function () { M.pushUndo(); S.quantize = v; });
      afterEdit();
    });
    $('swing').addEventListener('change', function () { S.swing = parseFloat(this.value); M.save(); });
    $('chord-brush').addEventListener('change', function () { S.chordBrush = this.value; M.save(); });
    $('click').addEventListener('click', function () { S.click = !S.click; refreshValues(); M.save(); });
    $('reverb').addEventListener('input', function () {
      S.reverb = parseFloat(this.value);
      if (eng) eng.setReverb(S.reverb);
      M.save();
    });
    $('volume').addEventListener('input', function () {
      S.volume = parseFloat(this.value);
      if (eng) eng.setVolume(S.volume);
      M.save();
    });
    $('names').addEventListener('change', function () {
      S.names = this.value; SC.setNames(S.names); paintKeys(); refreshValues(); PM.canvas.render(); M.save();
    });
    $('note-mark').addEventListener('change', function () {
      S.noteMark = this.value; PM.canvas.render(); M.save();
    });
    $('theme').addEventListener('click', function () {
      S.theme = S.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      syncAria();
      M.save();
    });
    $('lang').addEventListener('click', function () {
      S.lang = S.lang === 'fr' ? 'en' : 'fr';
      applyLang();
      M.save();
    });

    /* ---------- drawing with the keyboard ----------
     * The canvas is focusable: arrow keys move a cursor, Enter places or
     * removes a note. Space stays play/stop, so it bubbles to the document. */
    const stage = $('stage');
    stage.addEventListener('pointerdown', function () {
      stage.focus({ preventScroll: true });
    });
    stage.addEventListener('keydown', function (e) {
      const R = M.rows(), C = M.cols();
      /* while a selection is active, the arrows belong to it */
      if (S.tool === 'select' && M.normSel(S.selection) && e.key.indexOf('Arrow') === 0) return;
      if (!S.caret) S.caret = { r: Math.floor(R / 2), c: 0 };
      let taken = true;
      if (e.key === 'ArrowUp') S.caret.r = Math.min(R - 1, S.caret.r + 1);
      else if (e.key === 'ArrowDown') S.caret.r = Math.max(0, S.caret.r - 1);
      else if (e.key === 'ArrowLeft') S.caret.c = Math.max(0, S.caret.c - 1);
      else if (e.key === 'ArrowRight') S.caret.c = Math.min(C - 1, S.caret.c + 1);
      else if (e.key === 'Enter') {
        M.pushUndo();
        if (M.cellColor(S.caret.r, S.caret.c) === S.color) {
          M.erase(S.caret.r, S.caret.c);
        } else {
          M.paint(S.caret.r, S.caret.c, S.color, 0.85);
          previewNote(S.caret.r, S.color, 0.85);
        }
        afterEdit();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        M.pushUndo();
        M.erase(S.caret.r, S.caret.c);
        afterEdit();
      } else {
        taken = false;
      }
      if (taken) {
        e.preventDefault();
        e.stopPropagation();
        PM.canvas.renderFast();
      }
    });
    $('vel-mode').addEventListener('change', function () { S.velocityMode = this.value; refreshValues(); M.save(); });
    $('vel-fixed').addEventListener('input', function () { S.velocity = parseFloat(this.value); refreshValues(); M.save(); });

    /* voice */
    $('v-gain').addEventListener('input', function () { changeVoice('gain', parseFloat(this.value)); });
    $('v-pan').addEventListener('input', function () { changeVoice('pan', parseFloat(this.value)); });
    $('v-decay').addEventListener('input', function () { changeVoice('decay', parseFloat(this.value)); });
    $('v-oct-down').addEventListener('click', function () { changeVoice('octave', Math.max(-2, M.voice(S.color).octave - 1)); });
    $('v-oct-up').addEventListener('click', function () { changeVoice('octave', Math.min(2, M.voice(S.color).octave + 1)); });
    $('v-art-held').addEventListener('click', function () { changeVoice('articulation', 'held'); });
    $('v-art-rep').addEventListener('click', function () { changeVoice('articulation', 'repeated'); });
    $('v-instrument').addEventListener('change', function () {
      M.pushUndo();
      changeVoice('instrument', this.value);
      paintPalette();
    });

    /* restore points */
    $('restore-apply').addEventListener('click', function () { applyRestore($('restore-list').value); });
    $('restore-clear').addEventListener('click', function () {
      if (!confirm(T('msg.restoreclear'))) return;
      PM.restore.clear();
      paintRestore();
    });
    $('restore-chip-go').addEventListener('click', function () {
      const l = PM.restore.latest();
      $('restore-chip').hidden = true;
      if (l) applyRestore(l.id);
    });
    $('restore-chip-hide').addEventListener('click', function () { $('restore-chip').hidden = true; });

    $('v-reset').addEventListener('click', function () {
      M.resetVoice(S.color);
      if (eng) eng.applyVoiceParams();
      paintVoicePanel(); PM.canvas.render(); M.save();
    });

    /* echo */
    $('delay-amount').addEventListener('input', function () {
      S.delay.amount = parseFloat(this.value); syncDelay(); M.save();
    });
    $('delay-time').addEventListener('change', function () { S.delay.time = this.value; syncDelay(); M.save(); });
    $('delay-fb').addEventListener('input', function () {
      S.delay.feedback = parseFloat(this.value); syncDelay(); M.save();
    });

    /* out of frame */
    $('oof-grow').addEventListener('click', function () {
      PM.restore.snapshot(T('r.before.grow')); paintRestore();
      M.pushUndo();
      const all = M.growToFit();
      $('bars').value = S.bars;
      $('range').value = S.octaves;
      afterEdit();
      if (!all) alert(T('msg.growpartial'));
    });
    $('oof-prune').addEventListener('click', function () {
      if (!confirm(T('msg.prune'))) return;
      guard(T('r.before.prune'), function () {
        M.pushUndo(); M.pruneOutOfFrame();
      });
      afterEdit();
    });

    /* zoom */
    $('zoom-in').addEventListener('click', function () { PM.canvas.zoomBy(1.4); refreshValues(); });
    $('zoom-out').addEventListener('click', function () { PM.canvas.zoomBy(1 / 1.4); refreshValues(); });
    $('zoom-fit').addEventListener('click', function () { PM.canvas.fit(); refreshValues(); });

    /* transport */
    $('play').addEventListener('click', toggle);
    $('rewind').addEventListener('click', rewind);
    $('bpm').addEventListener('input', function () {
      S.bpm = parseInt(this.value, 10); syncDelay(); refreshValues(); M.save();
    });
    $('bpm-val').addEventListener('change', function () {
      S.bpm = Math.max(40, Math.min(240, parseInt(this.value, 10) || 120));
      syncDelay(); refreshValues(); M.save();
    });
    $('tap').addEventListener('click', function () {
      const now = performance.now();
      taps = taps.filter(function (t) { return now - t < 2500; });
      taps.push(now);
      if (taps.length >= 2) {
        let sum = 0;
        for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
        S.bpm = Math.max(40, Math.min(240, Math.round(60000 / (sum / (taps.length - 1)))));
        syncDelay(); refreshValues(); M.save();
      }
    });
    $('dup-page').addEventListener('click', function () {
      const t = M.duplicatePage();
      if (t < 0) { alert(T('msg.nofreepage')); return; }
      S.page = t;
      afterEdit();
    });

    /* arrangement */
    $('song-on').addEventListener('click', function () { S.song.on = !S.song.on; paintSong(); M.save(); });
    $('song-add').addEventListener('click', function () {
      S.song.steps.push(S.page); paintSong(); M.save();
    });
    $('song-del').addEventListener('click', function () {
      if (S.song.steps.length > 1) S.song.steps.pop();
      paintSong(); M.save();
    });
    $('song-fill').addEventListener('click', function () { M.songFillNonEmpty(); paintSong(); M.save(); });

    /* MIDI */
    $('midi-enable').addEventListener('click', function () {
      PM.midi.enable(function (err) {
        if (err) { alert(err.message); return; }
        paintMidiDevices();
      });
    });
    $('midi-in').addEventListener('change', function () {
      S.midi.in = this.value; PM.midi.setInput(this.value); M.save();
    });
    $('midi-out').addEventListener('change', function () {
      S.midi.out = this.value; PM.midi.setOutput(this.value); M.save();
    });
    $('midi-send').addEventListener('click', function () {
      S.midi.send = !S.midi.send;
      if (S.midi.send) sendPrograms(); else PM.midi.panic();
      refreshActionBar(); M.save();
    });
    $('midi-local').addEventListener('click', function () {
      S.midi.local = !S.midi.local;
      refreshActionBar(); M.save();
    });

    $('export-stems').addEventListener('click', function () {
      const b = $('export-stems');
      b.disabled = true;
      PM.exporter.renderStems(
        function (i, n, name) { b.textContent = i + '/' + n + ' ' + name; },
        function (n) {
          b.disabled = false; b.textContent = T('btn.stems');
          alert(T('msg.stemsdone', { n: n }));
        },
        function (msg) {
          b.disabled = false; b.textContent = T('btn.stems');
          alert(T('msg.exportfail', { msg: msg }));
        });
    });
    $('export-wav').addEventListener('click', function () {
      const b = $('export-wav');
      b.disabled = true; b.textContent = T('msg.rendering');
      PM.exporter.renderWav(
        function () { b.disabled = false; b.textContent = 'WAV'; },
        function (msg) {
          b.disabled = false; b.textContent = 'WAV';
          alert(T('msg.exportfail', { msg: msg }));
        });
    });
    $('export-midi').addEventListener('click', function () { PM.exporter.renderMidi(); });

    document.addEventListener('visibilitychange', function () { if (playing) tick(); });

    /* ---------- keyboard ---------- */
    document.addEventListener('keydown', function (e) {
      const t = e.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;

      /* performance mode: letters become notes */
      if (S.playKeys && !e.ctrlKey && !e.metaKey && keyRow(e.code) >= 0) {
        e.preventDefault();
        if (!e.repeat) keyDown(e.code);
        return;
      }
      if (e.key === ' ') { e.preventDefault(); toggle(); return; }

      const sel = M.normSel(S.selection);
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey ? M.redo() : M.undo()) afterRestore();
          return;
        }
        if (key === 'a') { e.preventDefault(); S.tool = 'select'; M.selectAll(); paintTools(); PM.canvas.render(); refreshActionBar(); return; }
        if (key === 'c' && sel) { e.preventDefault(); M.copyRegion(sel); refreshActionBar(); return; }
        if (key === 'x' && sel) { e.preventDefault(); withSelection(function (s) { M.cutRegion(s); }); return; }
        if (key === 'v') {
          e.preventDefault();
          const h = PM.canvas.hoverCell();
          const r = sel ? sel.r0 : (h ? h.r : 0), c = sel ? sel.c0 : (h ? h.c : 0);
          M.pushUndo(); M.pasteRegion(r, c); afterEdit();
          return;
        }
        if (key === 'd' && sel) {
          e.preventDefault();
          M.copyRegion(sel);
          M.pushUndo();
          M.pasteRegion(sel.r0, sel.c1 + 1);
          afterEdit();
          return;
        }
        return;
      }

      if (e.key === 'Escape') { M.clearSelection(); PM.canvas.render(); refreshActionBar(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        withSelection(function (s) { M.deleteRegion(s); });
        return;
      }
      if (sel && e.key.indexOf('Arrow') === 0) {
        e.preventDefault();
        const oct = e.shiftKey ? M.scaleLen() : 1;
        if (e.key === 'ArrowUp') withSelection(function (s) { M.moveRegion(s, oct, 0); });
        if (e.key === 'ArrowDown') withSelection(function (s) { M.moveRegion(s, -oct, 0); });
        if (e.key === 'ArrowLeft') withSelection(function (s) { M.moveRegion(s, 0, -1); });
        if (e.key === 'ArrowRight') withSelection(function (s) { M.moveRegion(s, 0, 1); });
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        S.color = parseInt(e.key, 10) - 1;
        if (S.tool !== 'select') S.tool = 'brush';
        paintPalette(); paintTools(); paintVoicePanel(); PM.canvas.render();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'b') { S.tool = 'brush'; paintTools(); PM.canvas.render(); }
      if (k === 'e') { S.tool = 'eraser'; paintTools(); PM.canvas.render(); }
      if (k === 's') { S.tool = 'select'; paintTools(); PM.canvas.render(); }
      if (k === 'n') { S.tool = 'note'; paintTools(); PM.canvas.render(); }
      if (k === 'g') { S.showGrid = !S.showGrid; paintTools(); PM.canvas.render(); }
      if (k === '+' || k === '=') { PM.canvas.zoomBy(1.4); refreshValues(); }
      if (k === '-') { PM.canvas.zoomBy(1 / 1.4); refreshValues(); }
      if (k === '0') { PM.canvas.fit(); refreshValues(); }
      if (k === '[' || k === ']') {
        S.page = (S.page + (k === ']' ? 1 : M.PAGES - 1)) % M.PAGES;
        paintPages(); PM.canvas.render();
      }
    });
    document.addEventListener('keyup', function (e) {
      if (S.playKeys) keyUp(e.code);
    });
    window.addEventListener('blur', function () { heldRows.clear(); });
  }

  /* ---------- dropdowns ----------
   * Rebuilt on every language change, keeping the current values. */
  function buildSelects() {
    fillSelect($('scale'), SC.LIST.map(function (s) {
      return { id: s.id, label: T('scale.' + s.id) || s.label };
    }), S.scale);
    fillSelect($('range'), [1, 2, 3, 4].map(function (n) {
      return { id: n, label: PM.i18n.plural(n, 'opt.octave', 'opt.octaves') };
    }), S.octaves);
    fillSelect($('bars'), M.BARS_CHOICES.map(function (n) {
      return { id: n, label: PM.i18n.plural(n, 'opt.bar', 'opt.bars') };
    }), S.bars);
    fillSelect($('quantize'), ['1/4', '1/8', '1/8t', '1/16', '1/16t'].map(function (d) {
      return { id: d, label: T('div.' + d) };
    }), S.quantize);
    fillSelect($('swing'), [
      { id: 0, label: T('swing.0') }, { id: 0.15, label: T('swing.light') },
      { id: 0.25, label: T('swing.medium') }, { id: 0.35, label: T('swing.strong') }
    ], S.swing);
    fillSelect($('names'), [
      { id: 'letters', label: 'A B C' }, { id: 'solfege', label: 'Do Re Mi' }
    ], S.names);
    fillSelect($('vel-mode'), [
      { id: 'dynamic', label: T('vel.dynamic') }, { id: 'fixed', label: T('vel.fixed') }
    ], S.velocityMode);
    fillSelect($('delay-time'), [
      { id: '1/4', label: T('div.1/4') }, { id: '3/16', label: T('div.3/16') },
      { id: '1/8', label: T('div.1/8') }, { id: '1/8t', label: T('div.triplet') },
      { id: '1/16', label: T('div.1/16') }
    ], S.delay.time);
    fillSelect($('chord-brush'), ['none', 'tierce', 'triade', 'quinte', 'octave'].map(function (k) {
      return { id: k, label: T('brush.' + ({ none: 'none', tierce: 'third', triade: 'triad', quinte: 'fifth', octave: 'octave' })[k]) };
    }), S.chordBrush);
    fillSelect($('count-in'), [
      { id: 0, label: T('opt.none') }, { id: 1, label: T('opt.bar1') }, { id: 2, label: T('opt.bar2') }
    ], S.countIn);
    fillSelect($('note-mark'), ['none', 'number', 'initial'].map(function (k) {
      return { id: k, label: T('mark.' + k) };
    }), S.noteMark);
    const keep = $('harm-offset').value || '2';
    fillSelect($('harm-offset'), ['2', '-2', '4', '-4', 'oct', '-oct'].map(function (k) {
      return { id: k, label: T('harm.' + k) };
    }), keep);

    /* instrument library, grouped by family */
    const isel = $('v-instrument');
    const cur = isel.value;
    isel.innerHTML = '';
    A.families().forEach(function (fam) {
      const og = document.createElement('optgroup');
      og.label = T('family.' + fam) || fam;
      A.INSTRUMENTS.forEach(function (inst) {
        if (inst.family !== fam) return;
        const o = document.createElement('option');
        o.value = inst.id;
        o.textContent = instName(inst);
        og.appendChild(o);
      });
      isel.appendChild(og);
    });
    if (cur) isel.value = cur;
  }

  /* brings every control back in step with the state (after loading a project) */
  function syncAllControls() {
    SC.setNames(S.names);
    buildSelects();
    $('tune').value = S.tune;
    $('reverb').value = S.reverb;
    $('volume').value = S.volume;
    $('vel-fixed').value = S.velocity;
    $('delay-amount').value = S.delay.amount;
    $('delay-fb').value = S.delay.feedback;
    if (eng) {
      eng.setVolume(S.volume);
      eng.setReverb(S.reverb);
      eng.applyVoiceParams();
      syncDelay();
    }
    paintPalette(); paintKeys(); paintVoicePanel(); paintSong();
  }

  function init() {
    M.load();
    PM.i18n.setLang(S.lang);
    PM.i18n.apply();
    SC.setNames(S.names);
    buildSelects();
    $('lang').textContent = T('lang.name');
    $('tune').value = S.tune;
    $('reverb').value = S.reverb;
    $('volume').value = S.volume;
    $('vel-fixed').value = S.velocity;
    $('delay-amount').value = S.delay.amount;
    $('delay-fb').value = S.delay.feedback;
    $('play').innerHTML = playIcon();

    PM.canvas.init($('grid'), $('stage'), $('spacer'), {
      onPaintNote: previewNote,
      onEdit: function () { paintTools(); paintPages(); refreshValues(); },
      onSelect: refreshActionBar,
      onNoteSelect: paintNoteBar,
      onHover: function (midi) {
        $('hover-note').textContent = midi == null ? '' : SC.noteLabel(midi);
      },
      onZoom: refreshValues
    }, $('grid-bg'));

    /* incoming MIDI keyboard: same path as the computer keyboard */
    PM.midi.onNote(function (type, note, vel) {
      if (type === 'allOff') { heldRows.forEach(function (v, r) { noteOff(r); }); return; }
      const r = M.rowForMidi(note);
      if (type === 'on') noteOn(r, Math.max(0.2, vel));
      else noteOff(r);
    });
    PM.midi.onChange(paintMidiDevices);

    attachNumbers();
    applyTheme();
    paintNoteBar(null);
    paintPalette(); paintTools(); paintPages(); paintKeys(); paintVoicePanel();
    paintSong(); paintProjects(); paintMidiDevices(); paintRestore(); refreshValues();
    wire();
    nameIconButtons();
    syncAria();
    PM.canvas.refresh();

    /* Offline install: only over http(s). On file:// the browser refuses
       service workers — the app still runs, it just cannot be installed. */
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
  }

  return { init: init, play: play, stop: stop };
})();
document.addEventListener('DOMContentLoaded', PM.app.init);
