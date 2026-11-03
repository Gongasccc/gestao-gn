// Service worker do Ninho.
// Estratégia: rede primeiro (para receber sempre a versão mais recente) e cache como reserva offline.
const CACHE = 'ninho-shell-v25';
const SHELL = ['./', 'index.html', 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Só ficheiros da própria app (o Firebase tem a sua própria cache offline).
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html'))),
  );
});

// Tocar numa notificação abre (ou foca) a app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const page = event.notification.data?.page;
      const open = list.find((c) => 'focus' in c);
      if (open) {
        if (page) open.postMessage({ type: 'navigate', page });
        return open.focus();
      }
      return self.clients.openWindow(page ? `./#${page}` : './');
    }),
  );
});
