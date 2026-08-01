/* ---------------------------------------------------------------------
   Bom Dia, 60! — offline support

   Keeps a copy of the app on the phone so it opens with no signal at all:
   Benagil caves, out at Sagres, the Douro valley, aeroplane mode.

   Strategy:
     - The app page: try the network first (so updates appear), but fall
       back to the saved copy after 3 seconds or if the network fails.
     - Fonts: saved copy first, since they never change.
     - Everything else (Apple Maps, Google Maps, tel: links): left alone
       so it behaves exactly as normal.

   To force every phone to re-download after a change, bump VERSION.
   --------------------------------------------------------------------- */

const VERSION = 'v1';
const CACHE = 'bomdia60-' + VERSION;
const PAGE = './index.html';
const CORE = ['./', './index.html'];

const NETWORK_TIMEOUT = 3000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .catch(() => { /* first load offline — nothing to save yet */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Try the network, but never leave him staring at a blank screen: if it
// hasn't answered in 3 seconds, serve the saved copy instead. A slow
// response that arrives later still refreshes the cache for next time.
function pageWithFallback(request) {
  return new Promise(resolve => {
    let settled = false;
    const finish = res => {
      if (!settled && res) { settled = true; resolve(res); }
    };

    const timer = setTimeout(() => {
      caches.match(PAGE).then(finish);
    }, NETWORK_TIMEOUT);

    fetch(request).then(res => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(PAGE, copy));
      }
      finish(res);
    }).catch(() => {
      clearTimeout(timer);
      caches.match(PAGE).then(hit => {
        finish(hit || new Response(
          '<h1>Offline</h1><p>Open the app once with a connection and it ' +
          'will work without one from then on.</p>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        ));
      });
    });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // The app page itself
  if (req.mode === 'navigate') {
    event.respondWith(pageWithFallback(req));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' ||
                 url.hostname === 'fonts.gstatic.com';

  // Leave map links and anything else untouched
  if (!sameOrigin && !isFont) return;

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        // Fonts come back "opaque" (type 0) — still worth saving
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => new Response('', { status: 504 }));
    })
  );
});
