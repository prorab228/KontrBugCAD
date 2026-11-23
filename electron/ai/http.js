'use strict';
/**
 * http.js — низкоуровневый HTTP(S): запросы, стриминг, SSE, ошибки.
 * Ничего не знает ни о провайдерах, ни об OpenAI-формате.
 */

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');
const { makeError } = require('./util');

const DEFAULT_TIMEOUT_MS = 180000;
const MAX_BODY_BYTES = 32 * 1024 * 1024;

/** Понятное описание сетевой/TLS-ошибки вместо голого кода. */
function describeNetworkError(err, host) {
    const code = err && (err.code || err.cause && err.cause.code);
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return `Не удалось найти хост ${host}. Проверьте интернет и DNS.`;
    }
    if (code === 'ECONNREFUSED') {
        return `Соединение с ${host} отклонено. Если это локальная модель — запущен ли сервер?`;
    }
    if (code === 'ETIMEDOUT' || /timeout/i.test(err && err.message || '')) {
        return `Таймаут при подключении к ${host}. Проверьте сеть или попробуйте позже.`;
    }
    if (code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || code === 'CERT_HAS_EXPIRED') {
        return `Проблема с сертификатом ${host} (${code}). Для GigaChat нужны российские корневые сертификаты — они в папке certs/.`;
    }
    return `Сеть: ${code || (err && err.message) || 'неизвестная ошибка'} (${host})`;
}

/**
 * HTTP(S)-запрос с таймаутом, распаковкой и кастомным CA.
 * Возвращает { status, headers, text } — без парсинга, чтобы вызывающий сам решал.
 */
function httpRequest(urlString, options = {}) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(urlString);
        } catch (_) {
            reject(makeError(`Некорректный адрес: ${urlString}`));
            return;
        }

        const isHttps = parsed.protocol === 'https:';
        if (!isHttps && parsed.protocol !== 'http:') {
            reject(makeError(`Поддерживаются только http/https: ${urlString}`));
            return;
        }

        const transport = isHttps ? https : http;
        const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        const headers = Object.assign({}, options.headers || {});
        headers['Accept-Encoding'] = 'identity';

        const payload = options.body === undefined || options.body === null
            ? null
            : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        if (payload !== null) headers['Content-Length'] = Buffer.byteLength(payload);

        const reqOptions = {
            method: options.method || 'POST',
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            headers,
            timeout: timeoutMs
        };
        if (isHttps) {
            if (options.ca) reqOptions.ca = options.ca;
            if (options.insecure) reqOptions.rejectUnauthorized = false;
        }

        const req = transport.request(reqOptions, (res) => {
            const chunks = [];
            let size = 0;

            res.on('data', (chunk) => {
                size += chunk.length;
                if (size > MAX_BODY_BYTES) {
                    req.destroy(makeError(`Ответ ${parsed.hostname} слишком большой (> ${MAX_BODY_BYTES} байт)`));
                    return;
                }
                chunks.push(chunk);
            });

            res.on('end', () => {
                let buffer = Buffer.concat(chunks);
                const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
                try {
                    if (encoding === 'gzip') buffer = zlib.gunzipSync(buffer);
                    else if (encoding === 'deflate') buffer = zlib.inflateSync(buffer);
                    else if (encoding === 'br') buffer = zlib.brotliDecompressSync(buffer);
                } catch (_) { /* сервер соврал про кодировку — отдаём как есть */ }
                resolve({ status: res.statusCode || 0, headers: res.headers, text: buffer.toString('utf8') });
            });
        });

        req.on('timeout', () => {
            req.destroy(makeError(`Таймаут ${Math.round(timeoutMs / 1000)} с при запросе к ${parsed.hostname}`));
        });
        req.on('error', (err) => reject(err instanceof Error ? err : makeError(String(err))));

        if (payload !== null) req.write(payload);
        req.end();
    });
}

function extractErrorDetail(data, text) {
    if (data && typeof data === 'object') {
        const e = data.error;
        if (e && typeof e === 'object' && e.message) return String(e.message);
        if (typeof e === 'string') return e;
        if (data.message) return String(data.message);
        if (data.detail) return String(data.detail);
        if (data.status && data.message) return `${data.status}: ${data.message}`;
    }
    return String(text || '').replace(/\s+/g, ' ').slice(0, 300);
}

/** Разбирает JSON ответа и превращает HTTP-ошибки в человеческие сообщения. */
function readJson(res, label) {
    let data = null;
    if (res.text) {
        try { data = JSON.parse(res.text); } catch (_) { data = null; }
    }

    if (res.status >= 200 && res.status < 300) {
        if (data === null) {
            throw makeError(`${label}: сервер вернул не JSON: ${String(res.text || '').slice(0, 300)}`, res.status, res.text);
        }
        return data;
    }

    const detail = extractErrorDetail(data, res.text);
    let message = `${label}: HTTP ${res.status}`;
    if (detail) message += ` — ${detail}`;
    if (res.status === 401 || res.status === 403) message += '. Проверьте ключ доступа.';
    if (res.status === 402) message += '. Закончились средства на счёте провайдера.';
    if (res.status === 429) message += '. Слишком много запросов — подождите или смените модель.';
    throw makeError(message, res.status, data !== null ? data : res.text);
}

/** Открывает соединение и отдаёт поток ответа как есть (для SSE). */
function httpRequestStream(urlString, options = {}) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(urlString);
        } catch (_) {
            reject(makeError(`Некорректный адрес: ${urlString}`));
            return;
        }

        const isHttps = parsed.protocol === 'https:';
        const transport = isHttps ? https : http;
        const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

        const headers = Object.assign({}, options.headers || {});
        headers['Accept-Encoding'] = 'identity';

        const payload = options.body === undefined || options.body === null
            ? null
            : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        if (payload !== null) headers['Content-Length'] = Buffer.byteLength(payload);

        const reqOptions = {
            method: options.method || 'POST',
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            headers,
            timeout: timeoutMs
        };
        if (isHttps) {
            if (options.ca) reqOptions.ca = options.ca;
            if (options.insecure) reqOptions.rejectUnauthorized = false;
        }

        const req = transport.request(reqOptions, (res) => {
            resolve({ status: res.statusCode || 0, headers: res.headers, res, request: req });
        });
        if (typeof options.onRequest === 'function') options.onRequest(req);

        req.on('timeout', () => {
            req.destroy(makeError(`Таймаут ${Math.round(timeoutMs / 1000)} с при запросе к ${parsed.hostname}`));
        });
        req.on('error', (err) => reject(err instanceof Error ? err : makeError(String(err))));

        if (payload !== null) req.write(payload);
        req.end();
    });
}

/** Читает SSE-поток строками "data: {...}" и вызывает onEvent для каждого JSON. */
function readSSE(res, onEvent) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        let finished = false;

        const flush = () => {
            let index;
            while ((index = buffer.indexOf('\n')) >= 0) {
                const raw = buffer.slice(0, index).replace(/\r$/, '');
                buffer = buffer.slice(index + 1);
                if (!raw.startsWith('data:')) continue; // event:, id:, пустые строки — пропускаем
                const data = raw.slice(5).trim();
                if (!data || data === '[DONE]') continue;
                try {
                    onEvent(JSON.parse(data));
                } catch (_) { /* мусорная строка — пропускаем */ }
            }
        };

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            buffer += chunk;
            flush();
        });
        res.on('end', () => {
            if (finished) return;
            finished = true;
            flush();
            resolve();
        });
        res.on('error', (err) => {
            if (finished) return;
            finished = true;
            reject(err);
        });
        res.on('aborted', () => {
            if (finished) return;
            finished = true;
            resolve();
        });
    });
}

function readAll(res) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
    });
}

function isEventStream(headers) {
    return String(headers && headers['content-type'] || '').includes('text/event-stream');
}

module.exports = {
    DEFAULT_TIMEOUT_MS,
    describeNetworkError,
    httpRequest,
    httpRequestStream,
    extractErrorDetail,
    readJson,
    readSSE,
    readAll,
    isEventStream
};
