'use strict';
/**
 * util.js — общие мелочи, не зависящие от транспорта и провайдера.
 */

const crypto = require('crypto');

function makeError(message, status, body) {
    const err = new Error(message);
    if (status !== undefined) err.status = status;
    if (body !== undefined) err.body = body;
    return err;
}

function randomId() {
    return 'call_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

/** Аргументы инструмента приходят то объектом, то JSON-строкой. */
function parseArgs(value) {
    if (value == null || value === '') return {};
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return {};
}

function hashKey(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

/** Список моделей живёт по тому же пути, что и чат: .../chat/completions → .../models */
function deriveModelsUrl(baseUrl) {
    return String(baseUrl || '').replace(/\/chat\/completions\/?$/i, '/models');
}

module.exports = { makeError, randomId, parseArgs, hashKey, deriveModelsUrl };
