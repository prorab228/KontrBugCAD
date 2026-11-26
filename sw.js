// ВАЖНО: имя кэша определяется APP_VERSION из config.js при установке SW.
// Единственное место, где версия задаётся руками, — config.js; сборка не нужна,
// поэтому веб-версия, выложенная простым копированием файлов, тоже обновляется.
// Значение ниже — только запасное, если config.js не удалось прочитать.
let CACHE_NAME = 'kontrcad-cache-0.9.89e';
let isHardReload = false; // Флаг для принудительного обхода HTTP-кэша

// Читаем версию из config.js с обходом HTTP-кэша.
async function resolveCacheName() {
    try {
        const url = new URL('config.js', self.registration.scope).toString();
        const response = await fetch(url, { cache: 'no-store' });
        const text = await response.text();
        const match = text.match(/APP_VERSION\s*:\s*['"]([^'"]+)['"]/);
        if (match && match[1]) return `kontrcad-cache-${match[1]}`;
    } catch (_) { /* нет сети или config.js недоступен — остаёмся на запасном имени */ }
    return null;
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const name = await resolveCacheName();
        if (name) CACHE_NAME = name;
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Чистим кэши прошлых версий, но только если версия определена —
        // иначе можно снести живой кэш, оставшись с запасным именем.
        if (CACHE_NAME !== 'kontrcad-cache-boot') {
            const names = await caches.keys();
            await Promise.all(names.map(name => (name === CACHE_NAME ? null : caches.delete(name))));
        }
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
    const data = event.data || {};

    // Синхронизация версии: страница сообщает актуальный APP_VERSION сразу после
    // старта, SW переключает имя кэша и сносит старые — без переустановки воркера.
    if (data.action === 'VERSION' && data.version) {
        const next = `kontrcad-cache-${data.version}`;
        if (next !== CACHE_NAME) {
            CACHE_NAME = next;
            event.waitUntil(
                caches.keys()
                    .then((names) => Promise.all(
                        names.map(name => (name === next ? null : caches.delete(name)))
                    ))
                    .catch(() => { /* не критично */ })
            );
        }
    }

    // Команда жесткого сброса
    if (data.action === 'HARD_RELOAD') {
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