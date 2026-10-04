// Serves the app shell from cache for fast launches from the home screen, and
// refreshes it in the background. API calls always go to the network.
const CACHE = 'menu-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // SPA navigations all resolve to index.html.
  const key = e.request.mode === 'navigate' ? '/index.html' : e.request

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(key).then(cached => {
        const network = fetch(e.request).then(res => {
          if (res.ok) cache.put(key, res.clone())
          return res
        })
        return cached || network
      })
    )
  )
})
