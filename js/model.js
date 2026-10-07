/* model.js — the song state: grid, pages, voices, selection, arrangement.
 *
 * A cell is a single integer: the low 4 bits carry the colour, the next 5 the
 * dynamic (1..31). A cell saved before dynamics existed holds 0..8, so its
 * dynamic reads as 0, which we take to mean "full". */
window.PM = window.PM || {};
PM.model = (function () {
  const STORE = 'pm.paint.v1';
  const DIVISIONS = { '1/4': 1, '1/8': 2, '1/8t': 3, '1/16': 4, '1/16t': 6 };
  const PAGES = 4;
  const BARS_CHOICES = [1, 2, 4, 8];
  const MAX_OCTAVES = 4;
  const VEL_STEPS = 31;

  function defaultVoice(slot) {
    return {
      gain: 1, pan: 0, octave: 0, decay: 1, articulation: 'held',
      instrument: PM.audio.defaultInstrument(slot || 0)
    };
  }
  function defaultVoices() {
    const out = [];
    for (let i = 0; i < PM.audio.SLOTS; i++) out.push(defaultVoice(i));
    return out;
  }

  const state = {
    key: 0,
    scale: 'majorPenta',
    octaves: 3,
    baseOctave: 3,
    octaveShift: 0,
    tune: 0,
    bpm: 120,
    bars: 4,
    quantize: '1/8',
    swing: 0,
    click: false,
    reverb: 0.18,
    volume: 0.8,
    names: 'letters',
    page: 0,
    pages: [{}, {}, {}, {}],
    color: 0,
    brush: 1,
    tool: 'brush',
    showGrid: true,
    preservePitch: true,
    zoom: 1,
    velocityMode: 'dynamic',
    velocity: 1,
    voices: defaultVoices(),
    delay: { amount: 0, time: '1/8', feedback: 0.32 },
    /* editing */
    selection: null,                     // { r0, c0, r1, c1 }, never saved
    noteSel: null,                       // note grabbed with the Note tool, never saved
    loop: { on: false, from: 0, to: 0 },
    song: { on: false, steps: [0] },
    countIn: 0,                          // count-in bars
    chordBrush: 'none',
    playKeys: false,                     // playable keyboard
    record: false,
    /* MIDI */
    midi: { in: '', out: '', send: false, local: true },
    /* presentation */
    lang: (window.PM && PM.i18n) ? PM.i18n.detect() : 'en',   // 'en' | 'fr'
    theme: 'light',                      // 'light' | 'dark'
    noteMark: 'none',                    // mark on notes: 'none' | 'number' | 'initial'
    caret: null                          // keyboard cursor, never saved
  };

  let undoStack = [], redoStack = [], clipboard = null;

  /* --- cells --- */
  function pack(color, vel) {
    const n = Math.max(1, Math.min(VEL_STEPS, Math.round((vel == null ? 1 : vel) * VEL_STEPS)));
    return (color & 15) | (n << 4);
  }
  function colorOf(v) { return v & 15; }
  function velOf(v) {
    const n = (v >> 4) & 31;
    return n === 0 ? 1 : n / VEL_STEPS;
  }

  function stepsPerBeat() { return DIVISIONS[state.quantize] || 2; }
  function cols() { return state.bars * 4 * stepsPerBeat(); }
  function pitches() {
    return PM.scales.pitches(state.key, state.scale, state.octaves, state.baseOctave + state.octaveShift);
  }
  function rows() { return pitches().length; }
  function scaleLen() { return PM.scales.byId(state.scale).semis.length; }
  function page(i) { return state.pages[i == null ? state.page : i]; }
  function k(r, c) { return r + ':' + c; }
  function parseKey(key) {
    const i = key.indexOf(':');
    return [parseInt(key.slice(0, i), 10), parseInt(key.slice(i + 1), 10)];
  }
  function voice(i) { return state.voices[i] || defaultVoice(); }

  function swingAvailable() {
    const spb = stepsPerBeat();
    return spb === 2 || spb === 4;
  }
  function swingAmount() { return swingAvailable() ? state.swing : 0; }
  function delaySeconds() {
    const f = { '1/4': 1, '3/16': 0.75, '1/8': 0.5, '1/8t': 1 / 3, '1/16': 0.25 }[state.delay.time] || 0.5;
    return 60 / state.bpm * f;
  }

  function cell(r, c, p) { const v = page(p)[k(r, c)]; return v === undefined ? -1 : v; }
  function cellColor(r, c, p) { const v = cell(r, c, p); return v < 0 ? -1 : colorOf(v); }
  function cellVel(r, c, p) { const v = cell(r, c, p); return v < 0 ? 0 : velOf(v); }

  function paint(r, c, color, vel, p) {
    if (r < 0 || c < 0 || c >= cols() || r >= rows()) return false;
    const g = page(p);
    const v = pack(color, vel);
    if (g[k(r, c)] === v) return false;
    g[k(r, c)] = v;
    return true;
  }
  function erase(r, c, p) {
    const g = page(p);
    if (g[k(r, c)] === undefined) return false;
    delete g[k(r, c)];
    return true;
  }
  function clearPage(p) { state.pages[p == null ? state.page : p] = {}; }
  function isEmpty(p) { return Object.keys(page(p)).length === 0; }

  /* Chord brush: extra rows added under the stroke, in scale degrees. */
  function chordOffsets() {
    const n = scaleLen();
    return {
      none: [0], tierce: [0, 2], triade: [0, 2, 4], quinte: [0, 4], octave: [0, n]
    }[state.chordBrush] || [0];
  }

  /* --- changing scale --- */
  function nearestIndex(arr, value) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - value);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function remapRows(map) {
    state.pages = state.pages.map(function (g) {
      const out = {};
      Object.keys(g).forEach(function (key) {
        const rc = parseKey(key);
        const nr = map[rc[0]] === undefined ? rc[0] : map[rc[0]];
        const nk = k(nr, rc[1]);
        if (out[nk] === undefined) out[nk] = g[key];
      });
      return out;
    });
  }
  /* an incoming MIDI note lands on the nearest row, so it stays in the scale */
  function rowForMidi(m) { return nearestIndex(pitches(), m); }

  function setScale(id) {
    if (id === state.scale) return;
    const before = pitches();
    state.scale = id;
    if (!state.preservePitch) return;
    const after = pitches();
    remapRows(before.map(function (p) { return nearestIndex(after, p); }));
  }

  /* --- out of frame --- */
  function outOfFrame() {
    const R = rows(), C = cols();
    let count = 0, maxRow = -1, maxCol = -1;
    state.pages.forEach(function (g) {
      Object.keys(g).forEach(function (key) {
        const rc = parseKey(key);
        if (rc[0] >= R || rc[1] >= C) {
          count++;
          maxRow = Math.max(maxRow, rc[0]);
          maxCol = Math.max(maxCol, rc[1]);
        }
      });
    });
    return { count: count, maxRow: maxRow, maxCol: maxCol };
  }
  function growToFit() {
    const o = outOfFrame();
    if (!o.count) return true;
    const spb = stepsPerBeat();
    for (let i = 0; i < BARS_CHOICES.length; i++) {
      if (BARS_CHOICES[i] * 4 * spb > o.maxCol) { state.bars = Math.max(state.bars, BARS_CHOICES[i]); break; }
    }
    const n = scaleLen();
    for (let oct = state.octaves; oct <= MAX_OCTAVES; oct++) {
      if (oct * n + 1 > o.maxRow) { state.octaves = oct; break; }
    }
    return outOfFrame().count === 0;
  }
  function pruneOutOfFrame() {
    const R = rows(), C = cols();
    state.pages.forEach(function (g) {
      Object.keys(g).forEach(function (key) {
        const rc = parseKey(key);
        if (rc[0] >= R || rc[1] >= C) delete g[key];
      });
    });
  }

  /* --- pages --- */
  function duplicatePage(from) {
    const src = from == null ? state.page : from;
    let target = -1;
    for (let i = 0; i < PAGES; i++) {
      const j = (src + 1 + i) % PAGES;
      if (isEmpty(j)) { target = j; break; }
    }
    if (target < 0) return -1;
    state.pages[target] = JSON.parse(JSON.stringify(state.pages[src]));
    return target;
  }
  function copyPageTo(from, to) {
    state.pages[to] = JSON.parse(JSON.stringify(state.pages[from]));
  }

  /* ---------- a single note ----------
   * The grid only stores cells; these functions pretend there are "note"
   * objects, so one can be grabbed, stretched and moved. */
  function noteAt(r, c, p) {
    const list = notes(p);
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.row === r && c >= n.start && c < n.start + n.len) return n;
    }
    return null;
  }
  /* Stretch or shorten from the end. If another note blocks, stop there. */
  function setNoteLength(n, len, p) {
    const g = page(p);
    len = Math.max(1, Math.min(cols() - n.start, len));
    if (len < n.len) {
      for (let c = n.start + len; c < n.start + n.len; c++) delete g[k(n.row, c)];
    } else {
      const vel = n.vels[n.vels.length - 1];
      for (let c = n.start + n.len; c < n.start + len; c++) {
        const cur = g[k(n.row, c)];
        if (cur !== undefined && colorOf(cur) !== n.color) break;
        g[k(n.row, c)] = pack(n.color, vel);
      }
    }
    return noteAt(n.row, n.start, p);
  }
  /* Move the start while keeping the end: stretching from the left. */
  function setNoteStart(n, ns, p) {
    const g = page(p);
    const end = n.start + n.len - 1;
    ns = Math.max(0, Math.min(ns, end));
    if (ns > n.start) {
      for (let c = n.start; c < ns; c++) delete g[k(n.row, c)];
    } else {
      const vel = n.vels[0];
      for (let c = n.start - 1; c >= ns; c--) {
        const cur = g[k(n.row, c)];
        if (cur !== undefined && colorOf(cur) !== n.color) break;
        g[k(n.row, c)] = pack(n.color, vel);
      }
    }
    return noteAt(n.row, end, p);
  }
  function moveNote(n, dr, dc, p) {
    const g = page(p);
    const cells = [];
    for (let i = 0; i < n.len; i++) {
      cells.push(g[k(n.row, n.start + i)]);
      delete g[k(n.row, n.start + i)];
    }
    const nr = n.row + dr, ns = n.start + dc;
    if (nr < 0 || nr >= rows() || ns < 0 || ns + n.len > cols()) {
      for (let i = 0; i < n.len; i++) g[k(n.row, n.start + i)] = cells[i];
      return n;                                  // hors grille : on ne bouge pas
    }
    for (let i = 0; i < n.len; i++) g[k(nr, ns + i)] = cells[i];
    return noteAt(nr, ns, p);
  }
  function deleteNote(n, p) {
    const g = page(p);
    for (let i = 0; i < n.len; i++) delete g[k(n.row, n.start + i)];
  }

  /* ---------- rhythmic repeat ----------
   * Copies the region right after itself, as many times as asked: one bar of
   * drums becomes a four-bar pattern. */
  function repeatRegion(sel, times, p) {
    sel = normSel(sel);
    if (!sel || times < 1) return 0;
    const w = sel.c1 - sel.c0 + 1;
    const cells = regionCells(sel, p);
    const g = page(p), C = cols();
    let n = 0;
    for (let t = 1; t <= times; t++) {
      cells.forEach(function (x) {
        const c = x.c + t * w;
        if (c < C) { g[k(x.r, c)] = x.v; n++; }
      });
    }
    state.selection = { r0: sel.r0, r1: sel.r1, c0: sel.c0, c1: Math.min(C - 1, sel.c1 + times * w) };
    return n;
  }
  function fillToEnd(sel, p) {
    sel = normSel(sel);
    if (!sel) return 0;
    const w = sel.c1 - sel.c0 + 1;
    const reste = cols() - (sel.c1 + 1);
    return repeatRegion(sel, Math.max(0, Math.ceil(reste / w)), p);
  }

  /* ---------- selection and regions ---------- */
  function normSel(s) {
    if (!s) return null;
    return {
      r0: Math.min(s.r0, s.r1), r1: Math.max(s.r0, s.r1),
      c0: Math.min(s.c0, s.c1), c1: Math.max(s.c0, s.c1)
    };
  }
  function inSel(sel, r, c) {
    return sel && r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1;
  }
  function selectAll() {
    state.selection = { r0: 0, c0: 0, r1: rows() - 1, c1: cols() - 1 };
    return state.selection;
  }
  function clearSelection() { state.selection = null; }

  function regionCells(sel, p) {
    sel = normSel(sel);
    const g = page(p), out = [];
    Object.keys(g).forEach(function (key) {
      const rc = parseKey(key);
      if (inSel(sel, rc[0], rc[1])) out.push({ r: rc[0], c: rc[1], v: g[key] });
    });
    return out;
  }
  function deleteRegion(sel, p) {
    sel = normSel(sel);
    const g = page(p);
    let n = 0;
    Object.keys(g).forEach(function (key) {
      const rc = parseKey(key);
      if (inSel(sel, rc[0], rc[1])) { delete g[key]; n++; }
    });
    return n;
  }
  function copyRegion(sel, p) {
    sel = normSel(sel);
    if (!sel) return null;
    clipboard = {
      h: sel.r1 - sel.r0 + 1,
      w: sel.c1 - sel.c0 + 1,
      cells: regionCells(sel, p).map(function (x) {
        return { dr: x.r - sel.r0, dc: x.c - sel.c0, v: x.v };
      })
    };
    return clipboard;
  }
  function cutRegion(sel, p) {
    copyRegion(sel, p);
    deleteRegion(sel, p);
    return clipboard;
  }
  function hasClipboard() { return !!(clipboard && clipboard.cells.length); }
  function pasteRegion(r0, c0, p) {
    if (!hasClipboard()) return false;
    const g = page(p), R = rows(), C = cols();
    clipboard.cells.forEach(function (x) {
      const r = r0 + x.dr, c = c0 + x.dc;
      if (r >= 0 && r < R && c >= 0 && c < C) g[k(r, c)] = x.v;
    });
    state.selection = normSel({
      r0: r0, c0: c0,
      r1: Math.min(R - 1, r0 + clipboard.h - 1),
      c1: Math.min(C - 1, c0 + clipboard.w - 1)
    });
    return true;
  }
  /* Moving: lift first, write afterwards (the regions may overlap). */
  function moveRegion(sel, dr, dc, p) {
    sel = normSel(sel);
    if (!sel || (!dr && !dc)) return false;
    const cells = regionCells(sel, p);
    deleteRegion(sel, p);
    const g = page(p), R = rows(), C = cols();
    cells.forEach(function (x) {
      const r = x.r + dr, c = x.c + dc;
      if (r >= 0 && r < R && c >= 0 && c < C) g[k(r, c)] = x.v;
    });
    state.selection = {
      r0: sel.r0 + dr, r1: sel.r1 + dr,
      c0: sel.c0 + dc, c1: sel.c1 + dc
    };
    return true;
  }
  /* Stretching in time: 2 = twice as long, 0.5 = twice as short. */
  function stretchRegion(sel, factor, p) {
    sel = normSel(sel);
    if (!sel) return false;
    const cells = regionCells(sel, p);
    deleteRegion(sel, p);
    const g = page(p), C = cols();
    const wrote = {};
    cells.forEach(function (x) {
      const d = x.c - sel.c0;
      if (factor >= 2) {
        const n = Math.round(factor);
        for (let i = 0; i < n; i++) {
          const c = sel.c0 + d * n + i;
          if (c < C) wrote[k(x.r, c)] = x.v;
        }
      } else {
        const n = Math.round(1 / factor);
        if (d % n !== 0) return;              // on ne garde qu'un pas sur n
        const c = sel.c0 + Math.floor(d / n);
        wrote[k(x.r, c)] = x.v;
      }
    });
    Object.keys(wrote).forEach(function (key) { g[key] = wrote[key]; });
    const w = sel.c1 - sel.c0 + 1;
    const nw = factor >= 2 ? w * Math.round(factor) : Math.ceil(w / Math.round(1 / factor));
    state.selection = { r0: sel.r0, r1: sel.r1, c0: sel.c0, c1: Math.min(C - 1, sel.c0 + nw - 1) };
    return true;
  }

  /* --- musical helpers --- */
  function harmonize(sel, offsetRows, p) {
    const target = normSel(sel) || { r0: 0, c0: 0, r1: rows() - 1, c1: cols() - 1 };
    const g = page(p), R = rows();
    let n = 0;
    regionCells(target, p).forEach(function (x) {
      const r = x.r + offsetRows;
      if (r >= 0 && r < R && g[k(r, x.c)] === undefined) { g[k(r, x.c)] = x.v; n++; }
    });
    return n;
  }
  function humanize(sel, amount, p) {
    const target = normSel(sel) || { r0: 0, c0: 0, r1: rows() - 1, c1: cols() - 1 };
    const g = page(p);
    amount = amount == null ? 0.18 : amount;
    let n = 0;
    regionCells(target, p).forEach(function (x) {
      const v = velOf(x.v) + (Math.random() * 2 - 1) * amount;
      g[k(x.r, x.c)] = pack(colorOf(x.v), Math.max(0.15, Math.min(1, v)));
      n++;
    });
    return n;
  }

  /* --- loop and arrangement --- */
  function loopRange() {
    const C = cols();
    if (!state.loop.on) return { from: 0, to: C };
    const from = Math.max(0, Math.min(C - 1, state.loop.from));
    const to = Math.max(from + 1, Math.min(C, state.loop.to));
    return { from: from, to: to };
  }
  function setLoopFromSelection() {
    const s = normSel(state.selection);
    if (!s) return false;
    state.loop = { on: true, from: s.c0, to: s.c1 + 1 };
    return true;
  }
  function songSteps() {
    if (!state.song.on || !state.song.steps.length) return [state.page];
    return state.song.steps;
  }
  function songFillNonEmpty() {
    const list = [];
    for (let i = 0; i < PAGES; i++) if (!isEmpty(i)) list.push(i);
    state.song.steps = list.length ? list : [0];
    return state.song.steps;
  }

  /* --- notes --- */
  function notes(p) {
    const g = page(p), R = rows(), C = cols(), out = [];
    for (let r = 0; r < R; r++) {
      let c = 0;
      while (c < C) {
        const v = g[k(r, c)];
        if (v === undefined) { c++; continue; }
        const color = colorOf(v);
        const vels = [velOf(v)];
        let len = 1;
        while (c + len < C) {
          const nx = g[k(r, c + len)];
          if (nx === undefined || colorOf(nx) !== color) break;
          vels.push(velOf(nx));
          len++;
        }
        out.push({ row: r, start: c, len: len, color: color, vel: vels[0], vels: vels });
        c += len;
      }
    }
    return out;
  }
  function playbackNotes(p) {
    const out = [];
    notes(p).forEach(function (n) {
      if (voice(n.color).articulation === 'repeated' && n.len > 1) {
        n.vels.forEach(function (v, i) {
          out.push({ row: n.row, start: n.start + i, len: 1, color: n.color, vel: v });
        });
      } else {
        out.push(n);
      }
    });
    return out;
  }
  function notesAtStep(p, step) {
    return playbackNotes(p).filter(function (n) { return n.start === step; });
  }

  /* --- history ---
   * The snapshot carries the whole saveable state, not just the drawing, so
   * changing the range, the division or a voice becomes undoable again. */
  function snap() { return JSON.stringify(serialize()); }
  function restoreSnap(json) { applyData(JSON.parse(json)); }
  function pushUndo() {
    undoStack.push(snap());
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snap());
    restoreSnap(undoStack.pop());
    return true;
  }
  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snap());
    restoreSnap(redoStack.pop());
    return true;
  }
  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  /* --- random generation --- */
  function randomize(color, density) {
    const R = rows(), C = cols();
    density = density || 0.55;
    let r = Math.floor(R * 0.35) + Math.floor(Math.random() * Math.max(1, R * 0.3));
    let c = 0;
    while (c < C) {
      if (Math.random() < density) {
        const len = 1 + Math.floor(Math.random() * 3);
        const vel = 0.65 + Math.random() * 0.35;
        for (let i = 0; i < len && c + i < C; i++) paint(r, c + i, color, vel);
        c += len;
      } else {
        c += 1;
      }
      r += Math.round((Math.random() - 0.5) * 5);
      r = Math.max(0, Math.min(R - 1, r));
    }
  }

  /* --- persistence --- */
  const SAVED = ['key', 'scale', 'octaves', 'baseOctave', 'octaveShift', 'tune', 'bpm', 'bars', 'quantize',
    'swing', 'reverb', 'volume', 'names', 'pages', 'color', 'preservePitch', 'zoom',
    'velocityMode', 'velocity', 'voices', 'delay', 'loop', 'song', 'countIn', 'chordBrush', 'midi',
    'theme', 'noteMark', 'lang'];

  function serialize() {
    const d = {};
    SAVED.forEach(function (key) { d[key] = state[key]; });
    return d;
  }
  function applyData(d) {
    if (!d) return false;
    Object.keys(d).forEach(function (key) {
      if (SAVED.indexOf(key) >= 0 && d[key] !== undefined) state[key] = d[key];
    });
    if (!Array.isArray(state.pages) || state.pages.length !== PAGES) state.pages = [{}, {}, {}, {}];
    const def = defaultVoices();
    if (!Array.isArray(state.voices)) state.voices = def;
    state.voices = def.map(function (dv, i) {
      const got = state.voices[i] || {};
      Object.keys(dv).forEach(function (key) { if (got[key] === undefined) got[key] = dv[key]; });
      return got;
    });
    /* Blocks missing from the file are reset, otherwise we would inherit
       those of the project opened before. */
    if (!d.delay) state.delay = { amount: 0, time: '1/8', feedback: 0.32 };
    if (!d.loop) state.loop = { on: false, from: 0, to: 0 };
    if (d.song === undefined) {
      /* an old "chain" save: turn it into an arrangement */
      const chained = d.chain === true;
      state.song = { on: chained, steps: [0] };
      if (chained) songFillNonEmpty();
    } else if (!state.song || !Array.isArray(state.song.steps) || !state.song.steps.length) {
      state.song = { on: false, steps: [0] };
    }
    if (typeof d.countIn !== 'number') state.countIn = 0;
    if (!d.midi) state.midi = { in: '', out: '', send: false, local: true };
    if (d.theme !== 'dark' && d.theme !== 'light') state.theme = 'light';
    if (d.lang !== 'fr' && d.lang !== 'en') state.lang = 'en';
    if (!d.noteMark) state.noteMark = 'none';
    state.caret = null;
    if (typeof d.baseOctave !== 'number') state.baseOctave = 3;
    state.selection = null;
    state.noteSel = null;
    return true;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(serialize())); }
    catch (e) { /* stockage indisponible (file://) : on continue sans */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return false;
      return applyData(JSON.parse(raw));
    } catch (e) { return false; }
  }
  function resetVoice(i) { state.voices[i] = defaultVoice(); }

  return {
    state: state, PAGES: PAGES, DIVISIONS: DIVISIONS, BARS_CHOICES: BARS_CHOICES,
    MAX_OCTAVES: MAX_OCTAVES, VEL_STEPS: VEL_STEPS, STORE: STORE,
    pack: pack, colorOf: colorOf, velOf: velOf,
    stepsPerBeat: stepsPerBeat, cols: cols, rows: rows, pitches: pitches, voice: voice,
    scaleLen: scaleLen, chordOffsets: chordOffsets,
    swingAvailable: swingAvailable, swingAmount: swingAmount, delaySeconds: delaySeconds,
    cell: cell, cellColor: cellColor, cellVel: cellVel,
    paint: paint, erase: erase, clearPage: clearPage, isEmpty: isEmpty,
    setScale: setScale, remapRows: remapRows, nearestIndex: nearestIndex, rowForMidi: rowForMidi,
    outOfFrame: outOfFrame, growToFit: growToFit, pruneOutOfFrame: pruneOutOfFrame,
    duplicatePage: duplicatePage, copyPageTo: copyPageTo,
    noteAt: noteAt, setNoteLength: setNoteLength, setNoteStart: setNoteStart,
    moveNote: moveNote, deleteNote: deleteNote,
    repeatRegion: repeatRegion, fillToEnd: fillToEnd,
    normSel: normSel, inSel: inSel, selectAll: selectAll, clearSelection: clearSelection,
    regionCells: regionCells, deleteRegion: deleteRegion, copyRegion: copyRegion,
    cutRegion: cutRegion, pasteRegion: pasteRegion, hasClipboard: hasClipboard,
    moveRegion: moveRegion, stretchRegion: stretchRegion,
    harmonize: harmonize, humanize: humanize,
    loopRange: loopRange, setLoopFromSelection: setLoopFromSelection,
    songSteps: songSteps, songFillNonEmpty: songFillNonEmpty,
    notes: notes, playbackNotes: playbackNotes, notesAtStep: notesAtStep,
    pushUndo: pushUndo, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
    randomize: randomize, save: save, load: load, serialize: serialize, applyData: applyData,
    defaultVoice: defaultVoice, defaultVoices: defaultVoices, resetVoice: resetVoice
  };
})();
