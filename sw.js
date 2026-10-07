/* sw.js — service worker: the app stays available offline once it has been
 * opened at least once over http.
 *
 * Strategy: answer straight from the cache, and fetch the fresh version in the
 * background for next time. The app stays instant while still updating itself
 * — which matters during development, when files change often.
 */
const CACHE = 'paint-the-music-v1';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/i18n.js',
  './js/scales.js',
  './js/audio.js',
  './js/clock.js',
  './js/model.js',
  './js/midi.js',
  './js/restore.js',
  './js/projects.js',
  './js/canvas.js',
  './js/export.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      /* one missing file must not fail the whole install */
      .then(function (c) {
        return Promise.all(SHELL.map(function (u) {
          return c.add(u).catch(function () { });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (n) {
          return n === CACHE ? null : caches.delete(n);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        const network = fetch(req).then(function (res) {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
