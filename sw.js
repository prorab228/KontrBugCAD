const CACHE_PREFIX = 'kontrcad-cache-';
let currentCacheName = null;

// Функция для получения версии из config.js
async function getAppVersion() {
    try {
        // cache: 'no-store' гарантирует, что мы скачаем свежий файл, а не старый из кэша
        const response = await fetch('./config.js', { cache: 'no-store' });
        const text = await response.text();
        // Ищем строку вида: APP_VERSION: '0.9.79'
        const match = text.match(/APP_VERSION\s*:\s*['"]([^'"]+)['"]/);
        return match ? match[1] : 'default';
    } catch (e) {
        console.error('SW: Не удалось получить версию', e);
        return 'offline-fallback';
    }
}

// Установка: создаем кэш на основе версии
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const version = await getAppVersion();
            currentCacheName = CACHE_PREFIX + version;
            const cache = await caches.open(currentCacheName);

            // Список файлов для первоначального кэша
            const urlsToCache = [
                './',
                './config.js',
                './manifest.json'
            ];

            // Добавляем HTML, если он есть (чтобы не упасть, если имя другое)
            if (await fetch('./index.html').then(r => r.ok).catch(() => false)) urlsToCache.push('./index.html');
            if (await fetch('./index-desktop.html').then(r => r.ok).catch(() => false)) urlsToCache.push('./index-desktop.html');

            // Кэшируем каждый файл отдельно, игнорируя ошибки (404)
            await Promise.allSettled(
                urlsToCache.map(url =>
                    cache.add(url).catch(err => console.warn(`SW: Не удалось закэшировать ${url}`, err))
                )
            );

            console.log('SW: Установка завершена (с возможными пропусками)');
            // НЕ вызываем skipWaiting() здесь
        })()
    );
});

// Активация: удаляем старый кэш
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.map((key) => {
                    if (key.startsWith(CACHE_PREFIX) && key !== currentCacheName) {
                        console.log('SW: Удаляем старый кэш:', key);
                        return caches.delete(key);
                    }
                })
            );
            await self.clients.claim();
        })()
    );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return; // Игнорируем сторонние запросы

    // Для HTML, навигации и config.js используем Network First (чтобы всегда проверять обновления)
    if (event.request.mode === 'navigate' ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('config.js')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(currentCacheName).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    } else {
        // Для JS, CSS, картинок используем Cache First (мгновенная загрузка)
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    const clone = response.clone();
                    caches.open(currentCacheName).then((cache) => cache.put(event.request, clone));
                    return response;
                });
            })
        );
    }
});

// Принудительная активация по команде от пользователя
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});