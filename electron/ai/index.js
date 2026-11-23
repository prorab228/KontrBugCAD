'use strict';
/**
 * index.js — регистрация ИИ-прокси в main-процессе Electron.
 *
 * Рендерер ходит сюда через IPC (preload.js → window.electronAPI.ai):
 *   ai:keys         — статус ключей (значения не отдаются)
 *   ai:key-set      — сохранить ключ (шифруется safeStorage)
 *   ai:key-delete   — удалить ключ
 *   ai:key-test     — проверить ключ
 *   ai:models       — список моделей провайдера (GET /models)
 *   ai:chat         — один вызов модели, нормализованный ответ
 *   ai:chat-stream  — то же со стримингом (события в ai:stream:<requestId>)
 *   ai:abort        — прервать стрим по requestId
 *
 * Никаких портов и CORS: мост идёт через IPC, поэтому чужая вкладка
 * не может воспользоваться ключами пользователя.
 */

const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const core = require('./core');
const { createKeyStore } = require('./keystore');
const { deriveModelsUrl } = require('./util');

const HANDLE_CHANNELS = [
    'ai:keys',
    'ai:key-set',
    'ai:key-delete',
    'ai:key-test',
    'ai:models',
    'ai:chat',
    'ai:chat-stream'
];

const MAX_PAYLOAD_BYTES = 24 * 1024 * 1024; // base64-картинки заметно увеличивают запрос
const MAX_MESSAGES = 500;

function readCatalog(baseDir) {
    // OTA-бандл может не содержать свежий каталог — тогда берём из установки.
    const candidates = [
        path.join(baseDir, 'js', 'ai', 'providers.json'),
        path.join(__dirname, '..', '..', 'js', 'ai', 'providers.json')
    ];
    for (const file of candidates) {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            const providers = Array.isArray(data.providers) ? data.providers : [];
            if (providers.length) return { providers };
        } catch (_) { /* пробуем следующий */ }
    }
    console.error('[AI] Каталог провайдеров не найден:', candidates.join(' | '));
    return { providers: [] };
}

function loadRussianCA(baseDir) {
    const names = ['russian_trusted_root_ca.crt', 'russian_trusted_sub_ca.crt'];
    // Сертификаты лежат рядом с main-модулем и не зависят от OTA-бандла
    const roots = [path.join(__dirname, 'certs'), baseDir, path.join(__dirname, '..', '..', 'certs')];
    const buffers = [];
    for (const name of names) {
        for (const root of roots) {
            try {
                buffers.push(fs.readFileSync(path.join(root, name)));
                break;
            } catch (_) { /* ищем в следующем корне */ }
        }
    }
    if (buffers.length !== names.length) {
        console.warn('[AI] Российские сертификаты найдены не полностью — GigaChat может не подключиться');
    }
    return buffers.length ? buffers : null;
}

function sanitizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages.slice(-MAX_MESSAGES).filter((message) => {
        return message && typeof message === 'object' && typeof message.role === 'string';
    });
}

function assertBaseUrl(url) {
    if (typeof url !== 'string' || !/^https?:\/\/[^\s]+$/i.test(url.trim())) {
        throw new Error('Укажите полный URL вида https://host/v1/chat/completions');
    }
    return url.trim();
}

function registerAiProxy({ app, safeStorage, getBaseDir }) {
    const baseDir = typeof getBaseDir === 'function' ? getBaseDir() : __dirname;
    const catalog = readCatalog(baseDir);
    const byId = new Map(catalog.providers.map((provider) => [provider.id, provider]));
    const keyStore = createKeyStore({
        dir: path.join(app.getPath('userData'), 'ai'),
        safeStorage
    });

    /** requestId → { request, aborted } — для кнопки «Стоп» */
    const activeStreams = new Map();

    let caCache;
    function russianCA() {
        if (caCache === undefined) caCache = loadRussianCA(baseDir);
        return caCache;
    }

    function getProvider(id) {
        const provider = byId.get(String(id || ''));
        if (!provider) throw new Error(`Неизвестный провайдер: ${id}`);
        if (provider.hidden === true) throw new Error(`Провайдер «${provider.label}» пока не подключён`);
        return provider;
    }

    /** Провайдер с учётом пользовательского URL (для «своего» API). */
    function resolveProvider(id, baseUrlOverride) {
        const provider = getProvider(id);
        if (provider.id !== 'custom') return provider;

        const baseUrl = assertBaseUrl(baseUrlOverride || provider.baseUrl);
        return { ...provider, baseUrl, modelsUrl: deriveModelsUrl(baseUrl), custom: true };
    }

    function assertPayload(payload) {
        if (!payload || typeof payload !== 'object') throw new Error('Некорректный запрос к ИИ');
        let size = 0;
        try {
            size = Buffer.byteLength(JSON.stringify(payload));
        } catch (_) {
            throw new Error('Запрос к ИИ не сериализуется');
        }
        if (size > MAX_PAYLOAD_BYTES) {
            throw new Error(`Запрос к ИИ слишком большой (${Math.round(size / 1024 / 1024)} МБ)`);
        }
    }

    function buildChatOptions(payload) {
        assertPayload(payload);

        const provider = resolveProvider(payload.providerId, payload.baseUrl);
        const apiKey = keyStore.get(provider.id);
        if (provider.auth !== 'none' && !apiKey) {
            throw new Error(`Не задан ключ ${provider.label}. Откройте настройки ИИ (⚙).`);
        }

        const model = String(payload.model || provider.defaultModel || '').trim();
        if (!model) throw new Error('Не выбрана модель');

        const messages = sanitizeMessages(payload.messages);
        if (!messages.length) throw new Error('Пустая история сообщений');

        const tools = Array.isArray(payload.tools) ? payload.tools.slice(0, 256) : [];
        const params = (payload.params && typeof payload.params === 'object') ? payload.params : {};
        const isLocal = /localhost|127\.0\.0\.1|\[::1\]/.test(provider.baseUrl || '');

        return {
            provider,
            model,
            messages,
            system: typeof payload.system === 'string' ? payload.system.slice(0, 20000) : '',
            tools,
            params,
            apiKey,
            ca: provider.useRussianCA ? russianCA() : null,
            insecure: provider.insecureTLS === true,
            origin: 'https://www.kontrcad.ru',
            timeoutMs: isLocal ? 600000 : undefined
        };
    }

    function logResult(provider, model, result, started) {
        console.log(
            `[AI] ${provider.id}/${model}: ${result.toolCalls.length} tool-call(s), ` +
            `${result.content.length} символов, ${Date.now() - started} мс`
        );
    }

    for (const channel of HANDLE_CHANNELS) {
        ipcMain.removeHandler(channel);
    }
    ipcMain.removeAllListeners('ai:abort');

    ipcMain.handle('ai:keys', () => keyStore.status());

    ipcMain.handle('ai:key-set', (_event, payload = {}) => {
        const provider = getProvider(payload.providerId);
        const value = typeof payload.key === 'string' ? payload.key.trim() : '';
        if (value.length < 8) throw new Error('Ключ слишком короткий');
        if (value.length > 4096) throw new Error('Ключ слишком длинный');
        keyStore.set(provider.id, value);
        return keyStore.status();
    });

    ipcMain.handle('ai:key-delete', (_event, payload = {}) => {
        const provider = getProvider(payload.providerId);
        keyStore.remove(provider.id);
        return keyStore.status();
    });

    ipcMain.handle('ai:key-test', async (_event, payload = {}) => {
        assertPayload(payload);
        const provider = resolveProvider(payload.providerId, payload.baseUrl);
        const apiKey = (typeof payload.key === 'string' && payload.key.trim())
            || keyStore.get(provider.id);
        if (provider.auth !== 'none' && !apiKey) throw new Error(`Сначала введите ключ ${provider.label}`);

        return core.checkKey({
            provider,
            apiKey,
            ca: provider.useRussianCA ? russianCA() : null,
            insecure: provider.insecureTLS === true,
            origin: 'https://www.kontrcad.ru'
        });
    });

    ipcMain.handle('ai:models', async (_event, payload = {}) => {
        assertPayload(payload);
        const provider = resolveProvider(payload.providerId, payload.baseUrl);
        const apiKey = keyStore.get(provider.id);
        if (provider.auth !== 'none' && !apiKey) {
            return { ok: false, detail: `Сначала введите ключ ${provider.label}` };
        }

        try {
            return await core.listModels({
                provider,
                apiKey,
                modelsUrl: deriveModelsUrl(provider.baseUrl),
                ca: provider.useRussianCA ? russianCA() : null,
                insecure: provider.insecureTLS === true,
                origin: 'https://www.kontrcad.ru'
            });
        } catch (err) {
            // Пустой список — нормальное состояние (нет сети, локальный сервер не запущен)
            return { ok: false, detail: err.message };
        }
    });

    ipcMain.handle('ai:chat', async (_event, payload = {}) => {
        const options = buildChatOptions(payload);
        const started = Date.now();
        try {
            const result = options.provider.adapter === 'gigachat'
                ? await core.chatGigaChat(options)
                : await core.chatOpenAI(options);
            logResult(options.provider, options.model, result, started);
            return result;
        } catch (err) {
            console.warn(`[AI] ${options.provider.id}/${options.model}: ошибка — ${err.message}`);
            throw err;
        }
    });

    ipcMain.handle('ai:chat-stream', async (event, payload = {}) => {
        const options = buildChatOptions(payload);

        const requestId = String(payload.requestId || '');
        const channel = `ai:stream:${requestId}`;
        const controller = { request: null, aborted: false };
        if (requestId) activeStreams.set(requestId, controller);

        const send = (message) => {
            if (event.sender.isDestroyed()) return;
            event.sender.send(channel, message);
        };

        const started = Date.now();
        // Работаем в фоне: результат и ошибки приходят в канал ПОСЛЕ всех дельт,
        // иначе ответ invoke может обогнать последние чанки стрима.
        (async () => {
            try {
                const result = await core.chatStream({
                    ...options,
                    onRequest: (request) => { controller.request = request; },
                    onDelta: (delta) => {
                        if (!controller.aborted) send(delta);
                    }
                });

                if (controller.aborted) throw new Error('⏹ Остановлено');
                logResult(options.provider, options.model, result, started);
                send({ type: 'done', result });
            } catch (err) {
                const message = controller.aborted ? '⏹ Остановлено' : err.message;
                if (!controller.aborted) {
                    console.warn(`[AI] ${options.provider.id}/${options.model}: стрим прерван — ${err.message}`);
                }
                send({ type: 'error', message });
            } finally {
                if (requestId) activeStreams.delete(requestId);
            }
        })();

        return { started: true, requestId };
    });

    ipcMain.on('ai:abort', (_event, requestId) => {
        const controller = activeStreams.get(String(requestId || ''));
        if (!controller) return;
        controller.aborted = true;
        try {
            if (controller.request) controller.request.destroy(new Error('aborted'));
        } catch (_) { /* соединение уже закрыто */ }
    });

    console.log(
        `[AI] Прокси готов: ${catalog.providers.length} провайдеров, ` +
        `ключи ${keyStore.status().secure ? 'зашифрованы' : 'без шифрования'}, ` +
        `CA Сбера: ${russianCA() ? 'есть' : 'нет'}`
    );

}

module.exports = { registerAiProxy };
