const CACHE_NAME = 'kontrcad-cache-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Активируем новый SW сразу
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim()); // Берем контроль над вкладками
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // ГЛАВНОЕ ПРАВИЛО: Для config.js и HTML всегда идем в сеть (Network First)
    if (url.pathname.endsWith('config.js') || event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Обновляем кэш свежей версией
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request)) // Если нет сети, берем из кэша
        );
        return;
    }

    // Для всех остальных файлов (JS, CSS, картинки) — Cache First
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