const { contextBridge, ipcRenderer } = require('electron');
const { randomUUID } = require('crypto');
const { exposeUpdaterAPI } = require('@capgo/electron-updater/preload');

exposeUpdaterAPI();

/** Активные стримы: requestId → канал, чтобы кнопка «Стоп» могла их прервать */
const activeStreams = new Set();

contextBridge.exposeInMainWorld('electronAPI', {
    onMenuEvent: (callback) => ipcRenderer.on('menu-event', (event, ...args) => callback(...args)),
    addModelToLibrary: (data) => ipcRenderer.invoke('add-model-to-library', data),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    focusWindow: () => ipcRenderer.send('focus-window'),

    // MCP: callback должен ВЕРНУТЬ массив инструментов
    onMcpGetTools: (callback) => ipcRenderer.on('mcp-get-tools', () => {
        const tools = callback();
        ipcRenderer.send('mcp-tools-response', tools);
    }),
    onMcpCall: (callback) => ipcRenderer.on('mcp-call', async (event, req) => {
        const res = await callback(req);
        ipcRenderer.send('mcp-call-response', res);
    }),
    // ★ НОВОЕ: позволяет McpManager динамически обновлять список tools
    //    при активации новых групп через enable_tool_group
    sendMcpTools: (tools) => ipcRenderer.send('mcp-tools-response', tools),

    // ============================================================
    //  ИИ-прокси: ключи и вызовы моделей (main-процесс)
    //  Значения ключей наружу не отдаются — только «есть / нет».
    // ============================================================
    ai: {
        keys: () => ipcRenderer.invoke('ai:keys'),
        setKey: (providerId, key) => ipcRenderer.invoke('ai:key-set', { providerId, key }),
        deleteKey: (providerId) => ipcRenderer.invoke('ai:key-delete', { providerId }),
        testKey: (providerId, key, baseUrl) => ipcRenderer.invoke('ai:key-test', { providerId, key, baseUrl }),
        models: (providerId, baseUrl) => ipcRenderer.invoke('ai:models', { providerId, baseUrl }),
        chat: (payload) => ipcRenderer.invoke('ai:chat', payload),

        /**
         * Стриминг: main присылает куски текста в канал ai:stream:<requestId>,
         * последним сообщением — {type:'done'|'error'}. Резолвим промис только
         * по этому сообщению: так дельты гарантированно приходят раньше финала.
         */
        chatStream: (payload, onEvent) => {
            const requestId = randomUUID();
            const channel = `ai:stream:${requestId}`;
            let finished = false;

            const cleanup = () => {
                ipcRenderer.removeListener(channel, listener);
                activeStreams.delete(requestId);
            };

            const listener = (_event, message) => {
                if (finished) return;
                if (message && message.type === 'done') {
                    finished = true;
                    cleanup();
                    resolvePromise(message.result);
                    return;
                }
                if (message && message.type === 'error') {
                    finished = true;
                    cleanup();
                    rejectPromise(new Error(message.message || 'Ошибка стриминга'));
                    return;
                }
                try { onEvent(message); } catch (err) { console.error('[AI] onDelta упал:', err); }
            };

            let resolvePromise;
            let rejectPromise;
            const promise = new Promise((resolve, reject) => {
                resolvePromise = resolve;
                rejectPromise = reject;
            });

            const timeout = setTimeout(() => {
                if (finished) return;
                finished = true;
                try { ipcRenderer.send('ai:abort', requestId); } catch (_) { /* ignore */ }
                cleanup();
                rejectPromise(new Error('Превышено время ожидания ответа модели'));
            }, 10 * 60 * 1000);

            ipcRenderer.on(channel, listener);
            activeStreams.add(requestId);

            ipcRenderer.invoke('ai:chat-stream', { ...payload, requestId }).catch((err) => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                cleanup();
                rejectPromise(err);
            });

            return promise.finally(() => clearTimeout(timeout));
        },

        /** Прервать все активные стримы (кнопка «Стоп»). */
        abort: () => {
            for (const requestId of activeStreams) ipcRenderer.send('ai:abort', requestId);
        }
    }
});
