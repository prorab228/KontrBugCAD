'use strict';
/**
 * core.js — транспортный слой ИИ-прокси (без зависимостей от Electron).
 *
 * Единственный «универсальный» контракт — OpenAI Chat Completions:
 *   { model, messages, tools, tool_choice, … } → { content, toolCalls, usage }
 *
 * Здесь только OpenAI-совместимые провайдеры и диспетчеризация.
 * GigaChat живёт в отдельном адаптере ./gigachat.js, HTTP — в ./http.js.
 *
 * Модуль намеренно не требует electron: его можно тестировать обычным node.
 */

const { makeError, randomId, parseArgs, deriveModelsUrl } = require('./util');
const {
    httpRequest,
    httpRequestStream,
    readJson,
    readSSE,
    readAll,
    isEventStream,
    describeNetworkError,
    extractErrorDetail
} = require('./http');
const gigachat = require('./gigachat');

function authHeaders(provider, apiKey, origin) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (provider.auth === 'bearer' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
    else if (provider.auth === 'api-key' && apiKey) headers['api-key'] = apiKey;

    const extra = provider.extraHeaders || {};
    for (const [key, value] of Object.entries(extra)) {
        headers[key] = String(value).replace('{{origin}}', origin || 'https://www.kontrcad.ru');
    }
    return headers;
}

/** Тело запроса в формате OpenAI. */
function openAIBody({ model, messages, system, tools, params }) {
    const list = [];
    if (system) list.push({ role: 'system', content: system });
    for (const message of messages || []) list.push(message);

    const body = { model, messages: list, stream: false };
    if (Array.isArray(tools) && tools.length) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const allowed = [
        'temperature', 'top_p', 'max_tokens', 'max_completion_tokens',
        'presence_penalty', 'frequency_penalty', 'stop', 'seed'
    ];
    for (const key of allowed) {
        if (params && params[key] !== undefined) body[key] = params[key];
    }
    return body;
}

/** Приводит ответ OpenAI-совместимого API к внутреннему виду. */
function mapOpenAIResponse(data) {
    const choice = (data && data.choices && data.choices[0]) || {};
    const message = choice.message || {};

    let content = message.content;
    if (Array.isArray(content)) {
        content = content.map((part) => (typeof part === 'string' ? part : (part && part.text) || '')).join('');
    }
    if (typeof content !== 'string') content = '';

    const toolCalls = [];
    for (const call of message.tool_calls || []) {
        if (!call || !call.function || !call.function.name) continue;
        toolCalls.push({
            id: call.id || randomId(),
            name: call.function.name,
            args: parseArgs(call.function.arguments)
        });
    }
    // legacy function_call (некоторые провайдеры до сих пор так отвечают)
    if (message.function_call && message.function_call.name) {
        toolCalls.push({
            id: randomId(),
            name: message.function_call.name,
            args: parseArgs(message.function_call.arguments)
        });
    }

    return {
        content,
        toolCalls,
        usage: data.usage || null,
        finishReason: choice.finish_reason || null
    };
}

async function chatOpenAI({ provider, model, messages, system, tools, apiKey, params, origin, ca, insecure, timeoutMs }) {
    if (provider.auth !== 'none' && !apiKey) {
        throw makeError(`Не задан ключ для ${provider.label || provider.id}`);
    }
    if (!provider.baseUrl) {
        throw makeError(`Не задан адрес API для ${provider.label || provider.id}`);
    }

    const headers = authHeaders(provider, apiKey, origin);
    const body = openAIBody({ model, messages, system, tools, params });

    let res;
    try {
        res = await httpRequest(provider.baseUrl, { headers, body, ca, insecure, timeoutMs });
    } catch (err) {
        throw makeError(describeNetworkError(err, provider.baseUrl));
    }

    const data = readJson(res, provider.label || provider.id);
    return mapOpenAIResponse(data);
}

async function chatStreamOpenAI(options) {
    const {
        provider, model, messages, system, tools, apiKey, params,
        origin, ca, insecure, timeoutMs, onDelta, onRequest
    } = options;

    if (provider.auth !== 'none' && !apiKey) {
        throw makeError(`Не задан ключ для ${provider.label || provider.id}`);
    }

    const body = openAIBody({ model, messages, system, tools, params });
    body.stream = true;

    let opened;
    try {
        opened = await httpRequestStream(provider.baseUrl, {
            headers: authHeaders(provider, apiKey, origin),
            body,
            ca,
            insecure,
            timeoutMs,
            onRequest
        });
    } catch (err) {
        throw makeError(describeNetworkError(err, provider.baseUrl));
    }

    const { status, headers, res } = opened;

    if (status < 200 || status >= 300) {
        const text = await readAll(res);
        let data = null;
        try { data = JSON.parse(text); } catch (_) { /* не JSON */ }
        const detail = extractErrorDetail(data, text);
        let message = `${provider.label || provider.id}: HTTP ${status}`;
        if (detail) message += ` — ${detail}`;
        if (status === 401 || status === 403) message += '. Проверьте ключ доступа.';
        if (status === 429) message += '. Слишком много запросов — подождите.';
        throw makeError(message, status, data !== null ? data : text);
    }

    // Провайдер проигнорировал stream:true и ответил обычным JSON.
    if (!isEventStream(headers)) {
        const text = await readAll(res);
        let data = null;
        try { data = JSON.parse(text); } catch (_) { /* ниже отдадим ошибку */ }
        if (!data) throw makeError(`${provider.label || provider.id}: ответ не JSON и не SSE`);
        const normalized = mapOpenAIResponse(data);
        if (normalized.content) onDelta({ type: 'text', text: normalized.content });
        return normalized;
    }

    let content = '';
    let finishReason = null;
    let usage = null;
    let streamError = null;
    const calls = new Map();

    await readSSE(res, (data) => {
        if (streamError) return;
        if (data.error) {
            streamError = makeError(String(data.error.message || data.error));
            return;
        }
        if (data.usage) usage = data.usage;

        const choice = data.choices && data.choices[0];
        if (!choice) return;
        const delta = choice.delta || {};

        if (typeof delta.content === 'string' && delta.content) {
            content += delta.content;
            onDelta({ type: 'text', text: delta.content });
        }

        for (const call of delta.tool_calls || []) {
            const index = call.index == null ? 0 : call.index;
            const current = calls.get(index) || { id: '', name: '', args: '' };
            if (call.id) current.id = call.id;
            if (call.function && call.function.name) current.name = current.name || call.function.name;
            if (call.function && call.function.arguments) current.args += call.function.arguments;
            calls.set(index, current);
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
    });

    if (streamError) throw streamError;

    const toolCalls = [...calls.values()]
        .filter((call) => call.name)
        .map((call) => ({ id: call.id || randomId(), name: call.name, args: parseArgs(call.args) }));

    return { content, toolCalls, usage, finishReason };
}

/** Один вызов модели с потоковой отдачей текста. Возвращает обычный нормализованный ответ. */
async function chatStream(options) {
    const provider = options.provider || {};
    if (provider.adapter === 'gigachat') return gigachat.chatStream(options);
    return chatStreamOpenAI(options);
}

/** Нестриминговый вызов GigaChat (оставлен ради единого API core). */
async function chatGigaChat(options) {
    return gigachat.chat(options);
}

/** Список моделей провайдера (GET /models или GigaChat /models). */
async function listModels(payload) {
    const { provider, apiKey, ca, insecure, origin, modelsUrl, timeoutMs } = payload;
    if (provider.adapter === 'gigachat') {
        return gigachat.listModels({ provider, apiKey, ca, insecure, modelsUrl, timeoutMs });
    }

    const url = modelsUrl || provider.modelsUrl || deriveModelsUrl(provider.baseUrl);
    if (!url) return { ok: false, detail: 'Провайдер не отдаёт список моделей' };

    const headers = authHeaders(provider, apiKey, origin);
    delete headers['Content-Type'];

    let res;
    try {
        res = await httpRequest(url, { method: 'GET', headers, ca, insecure, timeoutMs: timeoutMs || 20000 });
    } catch (err) {
        throw makeError(describeNetworkError(err, url));
    }

    const data = readJson(res, provider.label || provider.id);
    const list = Array.isArray(data.data) ? data.data
        : Array.isArray(data.models) ? data.models
            : Array.isArray(data) ? data : null;

    if (!list) return { ok: false, detail: 'Ответ без списка моделей' };

    const models = list
        .map((item) => (typeof item === 'string' ? item : (item.id || item.name)))
        .filter((name) => typeof name === 'string' && name.length > 0);

    return { ok: true, models, detail: `Моделей: ${models.length}` };
}

/**
 * Проверка ключа без расхода токенов (где возможно — GET /models).
 * Для GigaChat — только OAuth-рукопожатие.
 */
async function checkKey({ provider, apiKey, ca, insecure, origin, timeoutMs }) {
    if (provider.adapter === 'gigachat') {
        return gigachat.checkKey({ provider, apiKey, ca, insecure, timeoutMs });
    }

    if (provider.auth === 'none') return { ok: true, detail: 'Ключ не требуется' };

    const modelsUrl = provider.modelsUrl || deriveModelsUrl(provider.baseUrl);
    if (!modelsUrl) return { ok: true, detail: 'Проверка для этого провайдера недоступна' };

    const headers = authHeaders(provider, apiKey, origin);
    if (headers['Content-Type']) delete headers['Content-Type'];

    let res;
    try {
        res = await httpRequest(modelsUrl, {
            method: 'GET',
            headers,
            ca,
            insecure,
            timeoutMs: timeoutMs || 20000
        });
    } catch (err) {
        throw makeError(describeNetworkError(err, modelsUrl));
    }

    const data = readJson(res, provider.label || provider.id);
    const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : null);
    return {
        ok: true,
        detail: list ? `Ключ рабочий, доступно моделей: ${list.length}` : 'Ключ рабочий',
        models: list ? list.map((m) => m.id || m.name).filter(Boolean) : undefined
    };
}

function clearTokenCache() {
    gigachat.clearCache();
}

module.exports = {
    chatOpenAI,
    chatGigaChat,
    chatStream,
    listModels,
    checkKey,
    clearTokenCache
};
