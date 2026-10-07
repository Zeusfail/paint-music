/* canvas.js — drawing the grid, the pitch ruler, zooming and strokes.
 * The canvas is only as big as the visible frame; a spacer block gives the
 * container its scroll range, and we draw at an offset. */
window.PM = window.PM || {};
PM.canvas = (function () {
  const M = PM.model, S = M.state;
  const RULER = 46;        // width of the pitch ruler
  const MIN_ROW_H = 14;    // below this we scroll vertically instead
  /* With no ceiling, a 32-step grid stretches across the whole width of a big
     screen and the cells turn huge. So we cap them, and centre what is left. */
  const MAX_CELL_W = 46;
  const MAX_CELL_H = 40;
  const MAX_ZOOM = 10;

  let cv, ctx, stage, spacer;
  let W = 0, H = 0, scrollX = 0, scrollY = 0;
  let hover = null, playStep = -1;
  let drawing = false, erasing = false, last = null;
  let hooks = {};
  let lastPt = null, lastT = 0, smoothVel = 0.85;   // dynamic of the stroke in progress
  let selMode = null, selAnchor = null, moveLast = null;
  let noteMode = null, noteLast = null;   // outil Note : 'move' | 'left' | 'right'
  let bgCv = null, bgCtx = null;          // the decor layer, under the notes
  const pointers = new Map();             // fingers down, for pinch gestures
  let pinch = null;


  function init(canvasEl, stageEl, spacerEl, h, bgEl) {
    cv = canvasEl; stage = stageEl; spacer = spacerEl; hooks = h || {};
    ctx = cv.getContext('2d');
    bgCv = bgEl || null;
    bgCtx = bgCv ? bgCv.getContext('2d') : null;
    window.addEventListener('resize', resize);
    stage.addEventListener('scroll', function () {
      scrollX = stage.scrollLeft;
      scrollY = stage.scrollTop;
      render();
    });
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', function () { hover = null; notifyHover(); render(); });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('wheel', wheel, { passive: false });
    resize();
  }

  /* --- metrics --- */
  function baseCellW() { return Math.min(MAX_CELL_W, (W - RULER) / M.cols()); }
  function cellW() { return baseCellW() * S.zoom; }
  function cellH() { return Math.max(MIN_ROW_H, Math.min(MAX_CELL_H, H / M.rows())); }
  function gridW() { return cellW() * M.cols(); }
  function gridH() { return cellH() * M.rows(); }
  /* centring offset for when the grid is smaller than the frame */
  function offX() { return Math.max(0, (W - RULER - gridW()) / 2); }
  function offY() { return Math.max(0, (H - gridH()) / 2); }
  function contentW() {
    const w = RULER + gridW();
    return w <= W ? W : w;
  }
  function contentH() {
    const h = gridH();
    return h <= H ? H : h;
  }
  function colX(c) { return RULER + offX() + c * cellW() - scrollX; }
  function rowY(r) { return offY() + (M.rows() - 1 - r) * cellH() - scrollY; }
  function scrolling() { return contentW() > W; }
  /* Stuck to the grid while everything fits; pinned to the edge once it scrolls. */
  function rulerX() { return scrolling() ? 0 : Math.max(0, colX(0) - RULER); }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = Math.max(200, stage.clientWidth);
    H = Math.max(160, stage.clientHeight);
    [cv, bgCv].forEach(function (c) {
      if (!c) return;
      c.width = Math.floor(W * dpr);
      c.height = Math.floor(H * dpr);
      c.style.width = W + 'px';
      c.style.height = H + 'px';
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    syncSpacer();
    render();
  }
  function syncSpacer() {
    spacer.style.width = Math.ceil(contentW()) + 'px';
    spacer.style.height = Math.ceil(contentH()) + 'px';
    scrollX = stage.scrollLeft;
    scrollY = stage.scrollTop;
  }

  /* --- zoom --- */
  function setZoom(z, anchorX) {
    const old = S.zoom;
    S.zoom = Math.max(1, Math.min(MAX_ZOOM, z));
    if (S.zoom === old) return;
    const ax = anchorX == null ? (W - RULER) / 2 : anchorX - RULER;
    const col = (ax + scrollX) / (baseCellW() * old);          // colonne sous le curseur
    syncSpacer();
    stage.scrollLeft = col * cellW() - ax;
    scrollX = stage.scrollLeft;
    render();
    if (hooks.onZoom) hooks.onZoom();
  }
  function zoomBy(f, anchorX) { setZoom(S.zoom * f, anchorX); }
  function fit() { setZoom(1); }
  function wheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX);
    }
    /* otherwise: the container's own scrolling */
  }

  /* --- coordinates --- */
  function cellAt(x, y) {
    const cx = x + scrollX - RULER - offX();
    if (cx < 0) return null;
    return {
      c: Math.floor(cx / cellW()),
      r: M.rows() - 1 - Math.floor((y + scrollY - offY()) / cellH())
    };
  }

  /* --- dynamic ---
   * Stylus: the pressure. Mouse: the speed of the gesture (a stroke thrown
   * across comes out lighter), smoothed so it does not jump cell to cell. */
  function velocityFor(e) {
    if (S.velocityMode === 'fixed') return S.velocity;
    if (e.pointerType === 'pen' && e.pressure > 0) return 0.25 + 0.75 * e.pressure;
    const now = performance.now();
    if (lastPt) {
      const dx = e.offsetX - lastPt.x, dy = e.offsetY - lastPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = Math.max(1, now - lastT);
      const v = 1 - Math.min(1, (dist / dt) / 2.2) * 0.55;
      smoothVel = smoothVel * 0.6 + v * 0.4;
    }
    lastPt = { x: e.offsetX, y: e.offsetY };
    lastT = now;
    return Math.max(0.35, Math.min(1, smoothVel));
  }

  /* --- strokes --- */
  function paintAt(p, additive, vel) {
    const half = Math.floor((S.brush - 1) / 2);
    const offs = additive ? M.chordOffsets() : [0];
    let changed = false;
    for (let i = 0; i < S.brush; i++) {
      const base = p.r - half + i;
      for (let j = 0; j < offs.length; j++) {
        const r = base + offs[j];
        if (r < 0 || r >= M.rows()) continue;
        if (additive) {
          if (M.paint(r, p.c, S.color, vel)) {
            changed = true;
            if (hooks.onPaintNote) hooks.onPaintNote(r, S.color, vel);
          }
        } else if (M.erase(r, p.c)) {
          changed = true;
        }
      }
    }
    return changed;
  }
  function stroke(from, to, additive, vel) {
    const steps = Math.max(Math.abs(to.c - from.c), Math.abs(to.r - from.r));
    if (steps === 0) return paintAt(to, additive, vel);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      paintAt({
        c: Math.round(from.c + (to.c - from.c) * t),
        r: Math.round(from.r + (to.r - from.r) * t)
      }, additive, vel);
    }
  }
  /* --- touch: two fingers pinch to zoom and drag to scroll --- */
  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function startPinch() {
    const v = Array.from(pointers.values());
    if (v.length < 2) return;
    /* drop the stroke in progress: two fingers is no longer drawing */
    drawing = false; selMode = null; noteMode = null; last = null;
    pinch = {
      d: dist(v[0], v[1]),
      zoom: S.zoom,
      cx: (v[0].x + v[1].x) / 2,
      cy: (v[0].y + v[1].y) / 2,
      sx: stage.scrollLeft,
      sy: stage.scrollTop
    };
  }
  function movePinch() {
    const v = Array.from(pointers.values());
    if (!pinch || v.length < 2) return;
    const d = dist(v[0], v[1]);
    const cx = (v[0].x + v[1].x) / 2, cy = (v[0].y + v[1].y) / 2;
    if (pinch.d > 10) setZoom(pinch.zoom * (d / pinch.d), cx);
    stage.scrollTop = pinch.sy - (cy - pinch.cy);
    scrollY = stage.scrollTop;
    render();
  }

  function down(e) {
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size >= 2) { startPinch(); return; }
    const p = cellAt(e.offsetX, e.offsetY);
    if (!p) return;                       // a click inside the ruler
    cv.setPointerCapture(e.pointerId);

    /* Note tool: grab the note under the cursor. Near an edge it stretches,
       in the middle it moves. */
    if (S.tool === 'note' && e.button !== 2) {
      const n = M.noteAt(p.r, p.c);
      S.noteSel = n;
      if (!n) {
        noteMode = null;
        render();
        if (hooks.onNoteSelect) hooks.onNoteSelect(null);
        return;
      }
      const x0 = colX(n.start), x1 = colX(n.start + n.len);
      const grip = Math.min(10, cellW() / 3);
      noteMode = (e.offsetX >= x1 - grip) ? 'right'
        : (e.offsetX <= x0 + grip) ? 'left' : 'move';
      noteLast = p;
      M.pushUndo();
      render();
      if (hooks.onNoteSelect) hooks.onNoteSelect(n);
      return;
    }

    /* Select tool: dragging inside the selection moves it, elsewhere it draws a new one */
    if (S.tool === 'select' && e.button !== 2) {
      const sel = M.normSel(S.selection);
      if (sel && M.inSel(sel, p.r, p.c)) {
        selMode = 'move';
        moveLast = p;
        M.pushUndo();
      } else {
        selMode = 'new';
        selAnchor = p;
        S.selection = { r0: p.r, c0: p.c, r1: p.r, c1: p.c };
      }
      render();
      if (hooks.onSelect) hooks.onSelect();
      return;
    }

    drawing = true;
    erasing = S.tool === 'eraser' || e.button === 2 || e.altKey;
    lastPt = null;
    smoothVel = 0.85;
    M.pushUndo();
    paintAt(p, !erasing, velocityFor(e));
    last = p;
    render();
    if (hooks.onEdit) hooks.onEdit();
  }
  function move(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch) { movePinch(); return; }
    const p = cellAt(e.offsetX, e.offsetY);
    hover = p;
    notifyHover();

    if (noteMode && p && S.noteSel) {
      const n = S.noteSel;
      let fresh = n;
      if (noteMode === 'right') {
        fresh = M.setNoteLength(n, Math.max(1, p.c - n.start + 1));
      } else if (noteMode === 'left') {
        fresh = M.setNoteStart(n, p.c);
      } else {
        const dr = p.r - noteLast.r, dc = p.c - noteLast.c;
        if (dr || dc) fresh = M.moveNote(n, dr, dc);
        noteLast = p;
      }
      S.noteSel = fresh || n;
      renderFast();
      if (hooks.onNoteSelect) hooks.onNoteSelect(S.noteSel);
      return;
    }
    /* survol : le curseur annonce ce que fera le glisser */
    if (!noteMode && S.tool === 'note') {
      let c = 'default';
      if (p) {
        const n = M.noteAt(p.r, p.c);
        if (n) {
          const x0 = colX(n.start), x1 = colX(n.start + n.len);
          const grip = Math.min(10, cellW() / 3);
          c = (e.offsetX >= x1 - grip || e.offsetX <= x0 + grip) ? 'ew-resize' : 'move';
        }
      }
      cv.style.cursor = c;
    } else if (S.tool !== 'note') {
      cv.style.cursor = 'crosshair';
    }

    if (selMode === 'new' && p) {
      S.selection = { r0: selAnchor.r, c0: selAnchor.c, r1: p.r, c1: p.c };
      renderFast();
      if (hooks.onSelect) hooks.onSelect();
      return;
    }
    if (selMode === 'move' && p) {
      const dr = p.r - moveLast.r, dc = p.c - moveLast.c;
      if (dr || dc) {
        M.moveRegion(S.selection, dr, dc);
        moveLast = p;
        if (hooks.onEdit) hooks.onEdit();
      }
      renderFast();
      return;
    }

    if (drawing && p) {
      stroke(last, p, !erasing, velocityFor(e));
      last = p;
    }
    renderFast();
  }
  function up(e) {
    if (e && pointers.has(e.pointerId)) pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) {
      pinch = null;
      if (hooks.onZoom) hooks.onZoom();
      return;
    }
    if (noteMode) {
      noteMode = null;
      noteLast = null;
      M.save();
      if (hooks.onEdit) hooks.onEdit();
      if (hooks.onNoteSelect) hooks.onNoteSelect(S.noteSel);
      return;
    }
    if (selMode) {
      if (selMode === 'new') S.selection = M.normSel(S.selection);
      M.save();
      selMode = selAnchor = moveLast = null;
      render();
      if (hooks.onSelect) hooks.onSelect();
      return;
    }
    if (drawing) {
      drawing = false;
      last = null;
      lastPt = null;
      M.save();
      if (hooks.onEdit) hooks.onEdit();
    }
  }
  function notifyHover() {
    if (!hooks.onHover) return;
    const p = M.pitches();
    hooks.onHover(hover && hover.r >= 0 && hover.r < p.length ? p[hover.r] : null);
  }

  /* --- rendu --- */
  const rgbCache = {};
  function rgb(hex) {
    let c = rgbCache[hex];
    if (!c) {
      c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      rgbCache[hex] = c;
    }
    return c;
  }
  function rgba(hex, a) {
    const c = rgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  /* the note outline: the same hue, darkened — the sticker effect */
  function shade(hex, f) {
    const c = rgb(hex);
    return 'rgb(' + Math.round(c[0] * f) + ',' + Math.round(c[1] * f) + ',' + Math.round(c[2] * f) + ')';
  }

  /* Colours come from the CSS: switching theme is enough to repaint the canvas. */
  let TH = null;
  function theme() {
    if (TH) return TH;
    const cs = getComputedStyle(document.documentElement);
    const g = function (name, fallback) {
      const v = cs.getPropertyValue(name).trim();
      return v || fallback;
    };
    TH = {
      bg: g('--canvas-bg', '#fffdf8'),
      desk: g('--canvas-desk', '#f3e9d7'),
      line: g('--canvas-line', 'rgba(51,41,31,.07)'),
      beat: g('--canvas-beat', 'rgba(51,41,31,.13)'),
      bar: g('--canvas-bar', 'rgba(51,41,31,.28)'),
      tonic: g('--canvas-tonic', 'rgba(255,176,31,.11)'),
      ruler: g('--canvas-ruler', '#f7ebd9'),
      shadow: g('--canvas-shadow', 'rgba(51,41,31,.16)'),
      ink: g('--canvas-ink', '#33291f'),
      muted: g('--canvas-muted', '#a89783'),
      sel: g('--canvas-sel', '#ff6fa5'),
      play: g('--canvas-play', '#33291f')
    };
    return TH;
  }
  function invalidateTheme() { TH = null; render(); }
  /* prend le contexte en premier : les deux calques s'en servent */
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* Geometry shared by both layers. */
  function geom() {
    const C = M.cols(), R = M.rows();
    const cw = cellW(), chh = cellH();
    const ox = offX(), oy = offY();
    const gx = colX(0), gy = rowY(R - 1);
    return {
      C: C, R: R, cw: cw, chh: chh, spb: M.stepsPerBeat(),
      c0: Math.max(0, Math.floor((scrollX - ox) / cw)),
      c1: Math.min(C, Math.ceil((scrollX - ox + W - RULER) / cw) + 1),
      rTop: Math.max(0, Math.floor((scrollY - oy) / chh)),
      rBot: Math.min(R, Math.ceil((scrollY - oy + H) / chh) + 1),
      gx: gx, gy: gy, gw: C * cw, gh: R * chh,
      sheetX: gx - RULER, sheetW: RULER + C * cw, rad: 10, rx: rulerX()
    };
  }

  /* ---------- the decor layer ----------
   * Sheet, grid, ruler: everything that only moves on a scroll, a zoom or a
   * change of scale. Redrawing it on every mouse move was costing a lot for
   * nothing. */
  function renderStatic() {
    if (!bgCtx) return;
    const T = theme(), g = geom();
    const tonics = PM.scales.tonicRows(S.scale, S.octaves);
    const pitches = M.pitches();

    bgCtx.clearRect(0, 0, W, H);
    bgCtx.fillStyle = T.desk;
    bgCtx.fillRect(0, 0, W, H);

    bgCtx.fillStyle = T.shadow;
    roundRect(bgCtx, g.sheetX + 5, g.gy + 5, g.sheetW, g.gh, g.rad);
    bgCtx.fill();
    bgCtx.fillStyle = T.bg;
    roundRect(bgCtx, g.sheetX, g.gy, g.sheetW, g.gh, g.rad);
    bgCtx.fill();

    bgCtx.save();
    bgCtx.beginPath();
    roundRect(bgCtx, g.sheetX, g.gy, g.sheetW, g.gh, g.rad);
    bgCtx.clip();
    bgCtx.beginPath();
    bgCtx.rect(g.gx, g.gy, g.gw, g.gh);
    bgCtx.clip();

    /* the root-note bands: a coloured landmark rather than one more line */
    for (let r = g.rTop; r < g.rBot; r++) {
      if (tonics.indexOf(r) < 0) continue;
      bgCtx.fillStyle = T.tonic;
      bgCtx.fillRect(g.gx, rowY(r), g.gw, g.chh);
    }

    if (S.showGrid) {
      for (let c = g.c0; c <= g.c1; c++) {
        const bar = c % (g.spb * 4) === 0, beat = c % g.spb === 0;
        bgCtx.strokeStyle = bar ? T.bar : beat ? T.beat : T.line;
        bgCtx.lineWidth = bar ? 2 : 1;
        const x = Math.round(colX(c)) + .5;
        bgCtx.beginPath();
        bgCtx.moveTo(x, g.gy);
        bgCtx.lineTo(x, g.gy + g.gh);
        bgCtx.stroke();
      }
      for (let r = g.rTop; r <= g.rBot; r++) {
        bgCtx.strokeStyle = tonics.indexOf(r) >= 0 ? T.beat : T.line;
        bgCtx.lineWidth = 1;
        const y = Math.round(rowY(r) + g.chh) + .5;
        bgCtx.beginPath();
        bgCtx.moveTo(g.gx, y);
        bgCtx.lineTo(g.gx + g.gw, y);
        bgCtx.stroke();
      }
    }
    bgCtx.restore();

    /* the pitch ruler: inside the sheet, up against the grid */
    bgCtx.save();
    bgCtx.beginPath();
    roundRect(bgCtx, g.sheetX, g.gy, g.sheetW, g.gh, g.rad);
    bgCtx.clip();
    bgCtx.fillStyle = T.ruler;
    bgCtx.fillRect(g.rx, g.gy, RULER, g.gh);
    bgCtx.strokeStyle = T.ink;
    bgCtx.lineWidth = 2;
    bgCtx.beginPath();
    bgCtx.moveTo(g.rx + RULER - 1, g.gy);
    bgCtx.lineTo(g.rx + RULER - 1, g.gy + g.gh);
    bgCtx.stroke();

    bgCtx.textAlign = 'right';
    bgCtx.textBaseline = 'middle';
    const showAll = g.chh >= 11;
    for (let r = g.rTop; r < g.rBot; r++) {
      if (r >= pitches.length) continue;
      const isTonic = tonics.indexOf(r) >= 0;
      if (!showAll && !isTonic) continue;
      bgCtx.fillStyle = isTonic ? T.ink : T.muted;
      bgCtx.font = (isTonic ? '800 ' : '700 ') +
        Math.min(11, Math.max(8, g.chh * 0.62)) + 'px "Segoe UI", sans-serif';
      bgCtx.fillText(PM.scales.noteLabel(pitches[r]), g.rx + RULER - 7, rowY(r) + g.chh / 2);
    }
    bgCtx.restore();

    bgCtx.strokeStyle = T.ink;
    bgCtx.lineWidth = 2;
    roundRect(bgCtx, g.sheetX, g.gy, g.sheetW, g.gh, g.rad);
    bgCtx.stroke();
  }

  /* ---------- the live layer ----------
   * Notes, selection, playhead, hover: this is the only layer redrawn while
   * you are painting. */
  function renderDynamic() {
    if (!ctx) return;
    const T = theme(), g = geom();
    const C = g.C, R = g.R, cw = g.cw, chh = g.chh;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, g.sheetX, g.gy, g.sheetW, g.gh, g.rad);
    ctx.clip();
    /* never spill over the ruler, which lives on the layer below */
    ctx.beginPath();
    ctx.rect(g.rx + RULER, g.gy, g.gx + g.gw - (g.rx + RULER), g.gh);
    ctx.clip();

    if (playStep >= 0) {
      ctx.fillStyle = rgba(T.play.indexOf('#') === 0 ? T.play : '#33291f', 0.07);
      ctx.fillRect(colX(playStep), g.gy, cw, g.gh);
    }

    /* notes: opacity carries the dynamic, and the white ticks mark voices set
       to "repeated", which attack once per step. */
    const pad = Math.min(2.5, cw * 0.12, chh * 0.12);
    const marque = S.noteMark && S.noteMark !== 'none';
    M.notes().forEach(function (n) {
      if (n.start + n.len < g.c0 || n.start > g.c1 || n.row < g.rTop - 1 || n.row > g.rBot) return;
      const slotCol = PM.audio.slotColor(n.color);
      const x = colX(n.start) + pad, y = rowY(n.row) + pad;
      const w = n.len * cw - pad * 2, h = chh - pad * 2;
      const rd = Math.min(h / 2, 9);
      ctx.fillStyle = rgba(slotCol, 0.45 + 0.55 * n.vel);
      roundRect(ctx, x, y, w, h, rd);
      ctx.fill();
      if (h >= 9 && w >= 5) {
        ctx.strokeStyle = shade(slotCol, 0.62);
        ctx.lineWidth = Math.min(2, h / 7);
        roundRect(ctx, x, y, w, h, rd);
        ctx.stroke();
      }

      if (M.voice(n.color).articulation === 'repeated' && n.len > 1) {
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, x, y, w, h, rd);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,.65)';
        ctx.lineWidth = 1.5;
        for (let i = 1; i < n.len; i++) {
          const sx = colX(n.start + i);
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx, y + h);
          ctx.stroke();
        }
        ctx.restore();
      }

      /* a mark readable without colour: the voice number or the instrument initial */
      if (marque && h >= 11 && w >= 11) {
        const inst = PM.audio.instrument(M.voice(n.color).instrument ||
          PM.audio.defaultInstrument(n.color));
        const txt = S.noteMark === 'number'
          ? String(n.color + 1) : inst.name.charAt(0).toUpperCase();
        ctx.fillStyle = shade(slotCol, 0.45);
        ctx.font = '800 ' + Math.min(11, h * 0.7) + 'px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + 3, y + h / 2 + 0.5);
      }

      if (playStep >= n.start && playStep < n.start + n.len) {
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        roundRect(ctx, x, y, w, h, rd);
        ctx.fill();
      }
    });

    /* survol du pinceau */
    if (hover && !drawing && S.tool !== 'select' && S.tool !== 'note' &&
        hover.c >= 0 && hover.c < C && hover.r >= 0 && hover.r < R) {
      const half = Math.floor((S.brush - 1) / 2);
      ctx.strokeStyle = S.tool === 'eraser' ? 'rgba(200,60,60,.8)' : PM.audio.slotColor(S.color);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < S.brush; i++) {
        const r = hover.r - half + i;
        if (r < 0 || r >= R) continue;
        roundRect(ctx, colX(hover.c) + pad, rowY(r) + pad, cw - pad * 2, chh - pad * 2,
          Math.min(chh / 2, 6));
        ctx.stroke();
      }
    }

    /* curseur clavier */
    if (S.caret && document.activeElement === stage) {
      ctx.strokeStyle = T.sel;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      roundRect(ctx, colX(S.caret.c) + 1, rowY(S.caret.r) + 1, cw - 2, chh - 2, 5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* the loop region: everything outside it is dimmed */
    if (S.loop.on) {
      const lr = M.loopRange();
      ctx.fillStyle = rgba('#33291f', 0.08);
      if (lr.from > 0) ctx.fillRect(g.gx, g.gy, Math.max(0, colX(lr.from) - g.gx), g.gh);
      if (lr.to < C) ctx.fillRect(colX(lr.to), g.gy, g.gx + g.gw - colX(lr.to), g.gh);
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = 2;
      [lr.from, lr.to].forEach(function (c) {
        const x = colX(c);
        ctx.beginPath();
        ctx.moveTo(x, g.gy);
        ctx.lineTo(x, g.gy + g.gh);
        ctx.stroke();
      });
    }

    /* the grabbed note: a sharp outline and a handle at each end */
    if (S.tool === 'note' && S.noteSel) {
      const n = S.noteSel;
      const x = colX(n.start), y = rowY(n.row);
      const w = n.len * cw, h = chh;
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = 2.5;
      roundRect(ctx, x + 1, y + 1, w - 2, h - 2, Math.min(h / 2, 9));
      ctx.stroke();
      const pw = Math.min(6, cw / 3), ph = Math.max(6, h * 0.45);
      ctx.fillStyle = T.ink;
      roundRect(ctx, x + 1.5, y + (h - ph) / 2, pw, ph, 2);
      ctx.fill();
      roundRect(ctx, x + w - pw - 1.5, y + (h - ph) / 2, pw, ph, 2);
      ctx.fill();
    }

    /* selection */
    const sel = M.normSel(S.selection);
    if (sel) {
      const x = colX(sel.c0), y = rowY(sel.r1);
      const w = (sel.c1 - sel.c0 + 1) * cw, h = (sel.r1 - sel.r0 + 1) * chh;
      ctx.fillStyle = rgba(T.sel.indexOf('#') === 0 ? T.sel : '#ff6fa5', 0.14);
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = T.sel;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.restore();
    }

    if (playStep >= 0) {
      ctx.strokeStyle = T.play;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(colX(playStep), g.gy);
      ctx.lineTo(colX(playStep), g.gy + g.gh);
      ctx.stroke();
    }
    ctx.restore();

    /* ruler hover: on top, but translucent so the labels stay readable */
    if (hover && hover.r >= g.rTop && hover.r < g.rBot) {
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, g.sheetX, g.gy, g.sheetW, g.gh, g.rad);
      ctx.clip();
      ctx.fillStyle = rgba(T.sel.indexOf('#') === 0 ? T.sel : '#ff6fa5', 0.3);
      ctx.fillRect(g.rx, rowY(hover.r), RULER - 2, chh);
      ctx.restore();
    }
  }

  function render() { renderStatic(); renderDynamic(); }
  function renderFast() { renderDynamic(); }

  function setPlayStep(s) {
    if (s === playStep) return;
    playStep = s;
    /* follow the playhead when zoomed in */
    let defile = false;
    if (s >= 0 && contentW() > W) {
      const x = colX(s);
      if (x < RULER || x > W - cellW() * 2) {
        stage.scrollLeft = s * cellW() - (W - RULER) * 0.25;
        scrollX = stage.scrollLeft;
        defile = true;
      }
    }
    /* while playing only the live layer moves — unless the view has scrolled */
    if (defile) render(); else renderFast();
  }

  function refresh() { syncSpacer(); render(); }
  function hoverCell() { return hover; }
  function currentPlayStep() { return playStep; }

  return {
    init: init, render: render, renderFast: renderFast, refresh: refresh, resize: resize,
    setPlayStep: setPlayStep, playStep: currentPlayStep, cellAt: cellAt, hoverCell: hoverCell,
    setZoom: setZoom, zoomBy: zoomBy, fit: fit, invalidateTheme: invalidateTheme
  };
})();
