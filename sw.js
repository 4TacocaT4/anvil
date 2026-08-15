/* ============================================================
   Anvil service worker

   The point of this file is one thing: the gym has no signal.
   Anvil already keeps everything in localStorage and talks to no
   server, so the only reason opening it could ever fail is that the
   page itself has to come down the wire. This caches the page so it
   does not.

   The page is fetched network-first. A cache-first page would be
   faster by a few milliseconds and would also mean shipping a fix
   and having people keep running the old build until something
   evicted it, which is not a trade worth making for an app this
   small. Network-first means: fresh whenever there is signal,
   cached copy the moment there is not.

   index.html carries the whole app, so there is nothing here to
   coordinate — no chunks that must match, no version skew between
   files. The icons are the only other entries.
   ============================================================ */
'use strict';

const CACHE = 'anvil-v1';
const SHELL = './index.html';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      /* one missing icon must not fail the whole install, so each is
         added on its own and allowed to fail quietly */
      .then(cache => Promise.all(ASSETS.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  const wantsHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (wantsHTML) {
    event.respondWith(
      fetch(req)
        .then(res => {
          /* keep the last good copy of the page for the next time
             there is no signal */
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(SHELL, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(SHELL).then(hit => hit || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
