// Lets the check-in page open when the gym wifi is down. Network first (so an update lands on
// the next reload), cached copy after 3 s. The whole app is one HTML file, so one cache entry.
const CACHE = 'asylum-checkin-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('./')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await Promise.race([
        fetch(e.request),
        new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3000)),
      ]);
      if (fresh.ok) await cache.put('./', fresh.clone());
      return fresh;
    } catch (err) {
      return (await cache.match('./')) || Response.error();
    }
  })());
});
