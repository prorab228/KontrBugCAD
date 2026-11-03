const CACHE_NAME = 'kontrcad-cache-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Проверяем, перезагрузились ли мы с параметром принудительного обновления ?v=
    // (в referrer будет ссылка страницы, откуда был запрос)
    const isForcedUpdate = event.request.referrer && event.request.referrer.includes('?v=');

    // Если это HTML, config.js ИЛИ принудительное обновление — всегда идем в сеть
    if (event.request.mode === 'navigate' || url.pathname.endsWith('config.js') || isForcedUpdate) {
        event.respondWith(
            // cache: 'reload' заставляет браузер обойти свой HTTP-кэш и скачать файл заново
            fetch(event.request, { cache: 'reload' })
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Для всего остального (картинки, шрифты, которые не менялись) — Cache First
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});

// Принудительная очистка
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'CLEAR_CACHE') {
        caches.keys().then((names) => {
            return Promise.all(names.map(name => caches.delete(name)));
        }).then(() => {
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({ action: 'CACHE_CLEARED' }));
            });
        });
    }
});