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

/* Bumped whenever a cached asset changes behind a filename that does
   not. The icons were recoloured in place, so without this an installed
   copy would keep serving the old blue ones from the previous cache —
   activate deletes every cache that is not this one. */
const CACHE = 'anvil-v3';
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
      /* One missing icon must not fail the whole install, so each is
         added on its own and allowed to fail quietly. cache:'reload' for
         the same reason as in fetch below: an install that populated
         itself out of the browser's HTTP cache would bake in whatever
         stale copy happened to be sitting there. */
      .then(cache => Promise.all(ASSETS.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      )))
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
    /* cache:'reload' is what makes this actually network-first. A plain
       fetch() here is still allowed to be answered out of the browser's
       own HTTP cache, and GitHub Pages serves the page with a ten-minute
       max-age — so "network-first" quietly meant "up to ten minutes
       stale, then stored in the service worker cache too". This forces a
       real revalidation against the server. Offline it simply rejects,
       which is the path that falls through to the cached copy below. */
    event.respondWith(
      fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
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
