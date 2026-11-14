// Версию меняем при выпуске нового JS: старый кэш удаляется в activate,
// и клиенты сразу получают свежие файлы без «Полного сброса».
const CACHE_NAME = 'kontrcad-cache-v12';
let isHardReload = false; // Флаг для принудительного обхода HTTP-кэша

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Чистим кэши прошлых версий
        const names = await caches.keys();
        await Promise.all(names.map(name => (name === CACHE_NAME ? null : caches.delete(name))));
        await clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // 1. ГЛАВНОЕ ИСПРАВЛЕНИЕ: Не трогаем API запросы!
    // Пропускаем их напрямую в сеть, чтобы список проектов всегда был актуальным
    if (url.pathname.includes('/api/')) {
        return;
    }

    // 2. РЕЖИМ ЖЕСТКОГО СБРОСА:
    // Если пользователь нажал "Сбросить" или вышло обновление, качаем всё заново
    if (isHardReload) {
        event.respondWith(
            // cache: 'reload' заставляет браузер игнорировать 7-дневный HTTP-кэш
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

    // 3. ДЛЯ HTML, CONFIG.JS И ФАЙЛОВ ПЕРЕВОДОВ: Network First (всегда проверяем обновления)
    //    Переводы правятся часто — держать их вечно в кэше нельзя.
    if (event.request.mode === 'navigate' ||
        url.pathname.endsWith('config.js') ||
        url.pathname.includes('/js/ui/languages/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 4. ДЛЯ ВСЕГО ОСТАЛЬНОГО (JS, CSS, картинки): Cache First (мгновенная загрузка)
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

// Обработка сообщений
self.addEventListener('message', (event) => {
    // Команда жесткого сброса
    if (event.data && event.data.action === 'HARD_RELOAD') {
        isHardReload = true;
        caches.keys().then((names) => {
            return Promise.all(names.map(name => caches.delete(name)));
        }).then(() => {
            // Отвечаем странице, что можно перезагружаться
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({ status: 'READY' });
            }
        });
    }
});