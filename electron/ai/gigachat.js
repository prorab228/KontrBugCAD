'use strict';
/**
 * gigachat.js — адаптер GigaChat: OAuth 2.0 + старый формат functions.
 *
 * Отличия от OpenAI-совместимых, которые он компенсирует:
 *   • токен живёт ~30 минут — кэшируем и обновляем по 401;
 *   • вместо tools — functions/function_call (один вызов за ответ);
 *   • строгая JSON Schema — упрощаем через schema.js;
 *   • российские сертификаты — передаются снаружи (ca).
 */

const crypto = require('crypto');
const { sanitizeGigaChatSchema } = require('./schema');
const { makeError, randomId, parseArgs, hashKey, deriveModelsUrl } = require('./util');
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

/** Кэш OAuth-токенов: hash(oauth|scope|key) → { token, expiresAt } */
const tokenCache = new Map();

async function getToken({ oauthUrl, scope, authKey, ca, insecure, timeoutMs, forceRefresh }) {
    if (!authKey) throw makeError('Не задан Authorization Key GigaChat');
    if (!oauthUrl) throw makeError('В каталоге не задан адрес OAuth GigaChat');

    const cacheKey = hashKey(`${oauthUrl}|${scope}|${authKey}`);
    const cached = tokenCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() < cached.expiresAt - 60000) return cached.token;

    const authorization = /^Basic\s/i.test(authKey) ? authKey : `Basic ${authKey}`;
    const body = new URLSearchParams({ scope: scope || 'GIGACHAT_API_PERS' }).toString();

    let res;
    try {
        res = await httpRequest(oauthUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
                RqUID: crypto.randomUUID(),
                Authorization: authorization
            },
            body,
            ca,
            insecure,
            timeoutMs: timeoutMs || 30000
        });
    } catch (err) {
        throw makeError(`GigaChat OAuth: ${describeNetworkError(err, oauthUrl)}`);
    }

    const data = readJson(res, 'GigaChat OAuth');
    if (!data.access_token) {
        throw makeError(`GigaChat OAuth не вернул access_token: ${String(res.text).slice(0, 300)}`, res.status, data);
    }

    let expiresAt = Number(data.expires_at) || 0;
    if (expiresAt && expiresAt < 1e12) expiresAt *= 1000; // секунды → миллисекунды
    if (!expiresAt) expiresAt = Date.now() + 30 * 60 * 1000;

    tokenCache.set(cacheKey, { token: data.access_token, expiresAt });
    return data.access_token;
}

function mapMessage(message) {
    if (!message || typeof message !== 'object') return { role: 'user', content: '' };

    if (message.role === 'tool') {
        return {
            role: 'function',
            name: message.name || 'tool',
            content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '')
        };
    }

    if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
        const call = message.tool_calls[0];
        return {
            role: 'assistant',
            content: typeof message.content === 'string' ? message.content : '',
            function_call: {
                name: call.function && call.function.name,
                arguments: parseArgs(call.function && call.function.arguments)
            }
        };
    }

    return {
        role: message.role || 'user',
        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '')
    };
}

function buildBody({ model, messages, system, tools, params }) {
    const list = [];
    if (system) list.push({ role: 'system', content: system });
    for (const message of messages || []) list.push(mapMessage(message));

    const body = { model, messages: list };

    const functions = [];
    for (const tool of tools || []) {
        const fn = tool && tool.function;
        if (!fn || !fn.name) continue;
        functions.push({
            name: fn.name,
            description: fn.description || fn.name,
            parameters: sanitizeGigaChatSchema(fn.parameters || { type: 'object', properties: {} })
        });
    }
    if (functions.length) {
        body.functions = functions;
        body.function_call = 'auto';
    }

    if (params && params.temperature !== undefined) body.temperature = params.temperature;
    if (params && params.max_tokens !== undefined) body.max_tokens = params.max_tokens;
    if (params && params.top_p !== undefined) body.top_p = params.top_p;

    // GigaChat не рассуждает без явного параметра, поэтому «низкую» глубину
    // ставим по умолчанию. Но только когда функции НЕ передаются: с functions
    // модель уходит в 40–90 секунд размышлений и перестаёт вызывать инструменты,
    // возвращая пустой ответ (проверено на живом API).
    if (!body.functions) {
        body.reasoning_effort = (params && params.reasoning_effort) || 'low';
    } else if (params && params.reasoning_effort) {
        body.reasoning_effort = params.reasoning_effort;
    }
    return body;
}

function normalizeAnswer(message, usage) {
    const result = {
        content: typeof message.content === 'string' ? message.content : '',
        reasoning: '',
        toolCalls: [],
        usage: usage || null
    };

    // GigaChat отдаёт «размышления» reasoning-моделей отдельным полем.
    const reasoning = message.reasoning_content !== undefined
        ? message.reasoning_content
        : message.reasoning;
    if (typeof reasoning === 'string') result.reasoning = reasoning;

    if (message.function_call && message.function_call.name) {
        result.toolCalls.push({
            id: randomId(),
            name: message.function_call.name,
            args: parseArgs(message.function_call.arguments)
        });
    }
    return result;
}

async function chat(options) {
    const { provider, model, messages, system, tools, apiKey, params, ca, insecure, timeoutMs } = options;
    const oauth = provider.oauth || {};

    const run = async (forceRefresh) => {
        const token = await getToken({
            oauthUrl: oauth.url,
            scope: oauth.scope,
            authKey: apiKey,
            ca,
            insecure,
            timeoutMs: 30000,
            forceRefresh
        });

        const body = buildBody({ model, messages, system, tools, params });
        const res = await httpRequest(provider.baseUrl, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${token}`
            },
            body,
            ca,
            insecure,
            timeoutMs
        });
        return readJson(res, 'GigaChat');
    };

    let data;
    try {
        data = await run(false);
    } catch (err) {
        // Токен мог протухнуть раньше времени — один повтор с новым.
        if (err && err.status === 401) data = await run(true);
        else throw err;
    }

    const message = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!message) {
        const detail = extractErrorDetail(data, JSON.stringify(data));
        throw makeError(`GigaChat: пустой ответ${detail ? ' — ' + detail : ''}`);
    }

    return normalizeAnswer(message, data.usage);
}

async function chatStream(options) {
    const { provider, model, messages, system, tools, apiKey, params, ca, insecure, timeoutMs, onDelta, onRequest } = options;
    const oauth = provider.oauth || {};

    const token = await getToken({
        oauthUrl: oauth.url,
        scope: oauth.scope,
        authKey: apiKey,
        ca,
        insecure,
        timeoutMs: 30000
    });

    const body = buildBody({ model, messages, system, tools, params });
    body.stream = true;

    let opened;
    try {
        opened = await httpRequestStream(provider.baseUrl, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
                Authorization: `Bearer ${token}`
            },
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
        throw makeError(`GigaChat: HTTP ${status}${detail ? ' — ' + detail : ''}`, status);
    }

    // Провайдер проигнорировал stream:true — обычный JSON.
    if (!isEventStream(headers)) {
        const text = await readAll(res);
        const data = JSON.parse(text);
        const message = (data.choices && data.choices[0] && data.choices[0].message) || {};
        const result = normalizeAnswer(message, data.usage);
        if (result.reasoning) onDelta({ type: 'reasoning', text: result.reasoning });
        if (result.content) onDelta({ type: 'text', text: result.content });
        return result;
    }

    let content = '';
    let reasoning = '';
    let functionCall = null;

    await readSSE(res, (data) => {
        const choice = data.choices && data.choices[0];
        if (!choice) return;
        const delta = choice.delta || {};

        const reasoningDelta = delta.reasoning_content !== undefined
            ? delta.reasoning_content
            : delta.reasoning;
        if (typeof reasoningDelta === 'string' && reasoningDelta) {
            reasoning += reasoningDelta;
            onDelta({ type: 'reasoning', text: reasoningDelta });
        }

        if (typeof delta.content === 'string' && delta.content) {
            content += delta.content;
            onDelta({ type: 'text', text: delta.content });
        }

        if (delta.function_call) {
            functionCall = functionCall || { name: '', args: '' };
            if (delta.function_call.name) functionCall.name = delta.function_call.name;
            const args = delta.function_call.arguments;
            if (typeof args === 'string') functionCall.args += args;
            else if (args && typeof args === 'object') functionCall.args = JSON.stringify(args);
        }
    });

    const result = { content, reasoning, toolCalls: [], usage: null };
    if (functionCall && functionCall.name) {
        result.toolCalls.push({ id: randomId(), name: functionCall.name, args: parseArgs(functionCall.args) });
    }
    return result;
}

async function listModels({ provider, apiKey, ca, insecure, modelsUrl, timeoutMs }) {
    const url = modelsUrl || provider.modelsUrl || deriveModelsUrl(provider.baseUrl);
    if (!url) return { ok: false, detail: 'Провайдер не отдаёт список моделей' };

    const token = await getToken({
        oauthUrl: provider.oauth && provider.oauth.url,
        scope: provider.oauth && provider.oauth.scope,
        authKey: apiKey,
        ca,
        insecure,
        timeoutMs: 30000
    });

    let res;
    try {
        res = await httpRequest(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            ca,
            insecure,
            timeoutMs: timeoutMs || 20000
        });
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

/** Проверка ключа: только OAuth-рукопожатие, без расхода токенов. */
async function checkKey({ provider, apiKey, ca, insecure, timeoutMs }) {
    await getToken({
        oauthUrl: provider.oauth && provider.oauth.url,
        scope: provider.oauth && provider.oauth.scope,
        authKey: apiKey,
        ca,
        insecure,
        timeoutMs: timeoutMs || 30000,
        forceRefresh: true
    });
    return { ok: true, detail: 'OAuth-токен получен' };
}

function clearCache() {
    tokenCache.clear();
}

module.exports = {
    getToken,
    chat,
    chatStream,
    listModels,
    checkKey,
    clearCache
};
