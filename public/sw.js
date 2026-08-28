// XĐX Mercado - Service Worker PWA
// Version: 1.0.0 - atualize CACHE_NAME ao fazer deploy novo
const CACHE_NAME = 'xdx-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png'
];

// Instalação - cacheia shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE)).catch(()=>{})
  );
});

// Ativação - limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch - Network First para API e navegação, Cache First para assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nunca cachear API, Supabase, Gemini, etc
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase') || url.hostname.includes('googleapis') || url.hostname.includes('openai')) {
    return;
  }

  // Para navegação (HTML): Network First
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Para assets: Cache First + update em background
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // atualiza em background
        event.waitUntil(fetch(req).then((res) => caches.open(CACHE_NAME).then((c) => c.put(req, res))).catch(()=>{}));
        return cached;
      }
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
