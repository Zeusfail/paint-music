/* restore.js — restore points.
 *
 * Before anything a plain Ctrl+Z cannot put back — opening another project,
 * importing a file, deleting, clearing a page, shrinking the grid — a full
 * copy of the project is tucked away. Unlike the undo stack, it survives a
 * page reload. */
window.PM = window.PM || {};
PM.restore = (function () {
  const KEY = 'pm.restore';
  const MAX = 12;

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      /* quota exceeded: sacrifice half the oldest entries and try once more */
      try {
        localStorage.setItem(KEY, JSON.stringify(list.slice(0, Math.max(1, Math.floor(list.length / 2)))));
        return true;
      } catch (e2) { return false; }
    }
  }

  function newId() {
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7);
  }
  /* snapshotData: handy to archive a project right before erasing it */
  function snapshotData(label, data) {
    const list = read();
    list.unshift({ id: newId(), label: label || 'Change', time: new Date().toISOString(), data: data });
    while (list.length > MAX) list.pop();
    return write(list) ? list[0] : null;
  }
  function snapshot(label) { return snapshotData(label, PM.model.serialize()); }

  function list() {
    return read().map(function (x) { return { id: x.id, label: x.label, time: x.time }; });
  }
  function latest() {
    const l = list();
    return l.length ? l[0] : null;
  }
  function restore(id) {
    const found = read().filter(function (x) { return x.id === id; })[0];
    if (!found) return false;
    return PM.model.applyData(found.data);
  }
  function clear() {
    try { localStorage.removeItem(KEY); return true; } catch (e) { return false; }
  }
  /* "14:32 · Before importing a file · 3 min ago" */
  function describe(entry) {
    const d = new Date(entry.time);
    const p = function (n) { return String(n).padStart(2, '0'); };
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    const t = PM.i18n ? PM.i18n.t : function (k, v) { return k + JSON.stringify(v || {}); };
    const ago = mins < 1 ? t('r.now')
      : mins < 60 ? t('r.min', { n: mins })
        : t('r.hour', { n: Math.round(mins / 60) });
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ' · ' + entry.label + ' · ' + ago;
  }

  return {
    MAX: MAX, snapshot: snapshot, snapshotData: snapshotData,
    list: list, latest: latest, restore: restore, clear: clear, describe: describe
  };
})();
