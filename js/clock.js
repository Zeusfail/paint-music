/* clock.js — the scheduler's clock.
 *
 * A background tab has its setInterval throttled to 1 Hz by the browser, which
 * would cut playback short. A worker is not throttled, so we use one whenever
 * it starts, and keep a plain setInterval as a backup — the tick is idempotent,
 * so an extra call costs nothing. */
window.PM = window.PM || {};
PM.clock = (function () {
  const SRC =
    'var id=null;onmessage=function(e){' +
    'if(e.data.cmd==="start"){clearInterval(id);id=setInterval(function(){postMessage(0);},e.data.ms);}' +
    'else{clearInterval(id);id=null;}};';

  function create(cb, ms) {
    let worker = null, timer = null, url = null, alive = false;
    try {
      url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = function () { alive = true; cb(); };
      worker.onerror = function () { worker = null; };
    } catch (e) {
      worker = null;   // file:// is too restrictive: fall back to setInterval
    }
    return {
      start: function () {
        if (worker) worker.postMessage({ cmd: 'start', ms: ms });
        if (timer) clearInterval(timer);
        timer = setInterval(cb, ms);
      },
      stop: function () {
        if (worker) worker.postMessage({ cmd: 'stop' });
        if (timer) { clearInterval(timer); timer = null; }
      },
      dispose: function () {
        this.stop();
        if (worker) worker.terminate();
        if (url) URL.revokeObjectURL(url);
      },
      usesWorker: function () { return alive; }
    };
  }
  return { create: create };
})();
