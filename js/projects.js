/* projects.js — named projects kept in the browser, and .json files.
 * The list of names is held separately: we never scan localStorage. */
window.PM = window.PM || {};
PM.projects = (function () {
  const M = PM.model;
  const INDEX = 'pm.projects';
  const PREFIX = 'pm.proj.';
  const FORMAT = 'paint-the-music/1';

  function readIndex() {
    try {
      const raw = localStorage.getItem(INDEX);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function writeIndex(list) {
    try { localStorage.setItem(INDEX, JSON.stringify(list)); } catch (e) { /* ignored */ }
  }
  function list() { return readIndex().slice().sort(); }
  function exists(name) { return readIndex().indexOf(name) >= 0; }

  function save(name) {
    if (!name) return false;
    try {
      localStorage.setItem(PREFIX + name, JSON.stringify({
        format: FORMAT, name: name, saved: new Date().toISOString(), data: M.serialize()
      }));
      const idx = readIndex();
      if (idx.indexOf(name) < 0) { idx.push(name); writeIndex(idx); }
      return true;
    } catch (e) { return false; }
  }
  /* read-only: used to archive a project just before deleting it */
  function read(name) {
    try {
      const raw = localStorage.getItem(PREFIX + name);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d.data || d;
    } catch (e) { return null; }
  }
  function load(name) {
    const d = read(name);
    return d ? M.applyData(d) : false;
  }
  function remove(name) {
    try {
      localStorage.removeItem(PREFIX + name);
      writeIndex(readIndex().filter(function (n) { return n !== name; }));
      return true;
    } catch (e) { return false; }
  }

  /* --- files --- */
  function toJSON(name) {
    return JSON.stringify({
      format: FORMAT, name: name || 'untitled',
      saved: new Date().toISOString(), data: M.serialize()
    }, null, 1);
  }
  function fromJSON(text) {
    const d = JSON.parse(text);
    if (!d || !d.data) throw new Error(PM.i18n ? PM.i18n.t('msg.badfile') : 'file not recognised');
    M.applyData(d.data);
    return d.name || 'untitled';
  }
  function download(name) {
    const blob = new Blob([toJSON(name)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (name || 'painting').replace(/[^\w\-]+/g, '-') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  return {
    list: list, exists: exists, save: save, load: load, read: read, remove: remove,
    toJSON: toJSON, fromJSON: fromJSON, download: download, FORMAT: FORMAT
  };
})();
