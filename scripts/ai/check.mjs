#!/usr/bin/env node
/**
 * check.mjs — тесты встроенного ИИ без сети и без Electron.
 *
 * Проверяем:
 *   • каталог провайдеров (уникальные id, обязательные поля, никаких моделей);
 *   • OpenAI-совместимый транспорт (заголовки, тело, нормализация ответа);
 *   • GigaChat-адаптер (OAuth, functions, mapping истории);
 *   • санитайзер JSON Schema для GigaChat;
 *   • подписи моделей, выбор по умолчанию, вывод адреса /models;
 *   • человеческие сообщения об ошибках.
 *
 * Запуск: npm run check:ai
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { humanizeModelId, scoreModelName, deriveModelsUrl } from '../../js/ai/AiClient.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const core = require('../../electron/ai/core.js');
const { sanitizeGigaChatSchema } = require('../../electron/ai/schema.js');

let passed = 0;
const failures = [];

async function check(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok  ${name}`);
    } catch (err) {
        failures.push({ name, message: err.message });
        console.log(`  FAIL ${name}\n       ${err.message}`);
    }
}

// --------------------------------------------------------------------------
//  Мок-сервер: OpenAI-совместимый API + GigaChat OAuth/chat
// --------------------------------------------------------------------------
const requests = [];

const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
        requests.push({ url: req.url, method: req.method, headers: req.headers, rawHeaders: req.rawHeaders, body });

        const send = (status, payload) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
        };

        if (req.url === '/v1/chat/completions') {
            if (req.headers.authorization !== 'Bearer test-key') {
                send(401, { error: { message: 'Incorrect API key provided' } });
                return;
            }
            send(200, {
                choices: [{
                    message: {
                        content: 'Привет!',
                        tool_calls: [{
                            id: 'call_1',
                            type: 'function',
                            function: { name: 'get_scene_state', arguments: '{"limit":5}' }
                        }]
                    },
                    finish_reason: 'tool_calls'
                }],
                usage: { total_tokens: 42 }
            });
            return;
        }

        if (req.url === '/oauth') {
            if (!req.headers.authorization) {
                send(400, { message: 'no auth' });
                return;
            }
            send(200, { access_token: 'gc-token', expires_at: Date.now() + 3600 * 1000 });
            return;
        }

        if (req.url === '/giga/chat') {
            if (req.headers.authorization !== 'Bearer gc-token') {
                send(401, { message: 'Unauthorized' });
                return;
            }
            send(200, {
                choices: [{
                    message: {
                        content: '',
                        function_call: { name: 'create_box', arguments: { width: 10 } }
                    }
                }]
            });
            return;
        }

        if (req.url === '/v1/models') {
            send(200, { data: [{ id: 'model-a' }, { id: 'model-b' }] });
            return;
        }

        if (req.url === '/v1/chat/stream') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.write('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n');
            res.write('data: {"choices":[{"delta":{"content":"При"}}]}\n\n');
            res.write('data: {"choices":[{"delta":{"content":"вет"}}]}\n\n');
            res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_9","function":{"name":"create_box","arguments":"{\\"w\\":"}}]}}]}\n\n');
            res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"10}"}}]},"finish_reason":"tool_calls"}]}\n\n');
            res.end('data: [DONE]\n\n');
            return;
        }

        if (req.url === '/giga/stream') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.write('data: {"choices":[{"delta":{"content":"Куб"}}]}\n\n');
            res.write('data: {"choices":[{"delta":{"function_call":{"name":"create_box","arguments":{"size":7}}}}]}\n\n');
            res.end('data: [DONE]\n\n');
            return;
        }

        send(404, { error: 'not found' });
    });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const openAIProvider = {
    id: 'deepseek', label: 'DeepSeek', adapter: 'openai', auth: 'bearer',
    baseUrl: `${base}/v1/chat/completions`, modelsUrl: `${base}/v1/models`
};

const gigaProvider = {
    id: 'gigachat', label: 'GigaChat', adapter: 'gigachat', auth: 'oauth',
    baseUrl: `${base}/giga/chat`,
    oauth: { url: `${base}/oauth`, scope: 'GIGACHAT_API_PERS' }
};

console.log('AI proxy checks');

// --------------------------------------------------------------------------
//  Каталог
// --------------------------------------------------------------------------
await check('каталог провайдеров валиден', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'js', 'ai', 'providers.json'), 'utf8');
    const catalog = JSON.parse(raw);
    assert.ok(Array.isArray(catalog.providers) && catalog.providers.length >= 5, 'мало провайдеров');

    const ids = new Set();
    for (const provider of catalog.providers) {
        assert.ok(provider.id, 'у провайдера нет id');
        assert.ok(!ids.has(provider.id), `дубликат id: ${provider.id}`);
        ids.add(provider.id);
        assert.ok(provider.label, `${provider.id}: нет label`);
        assert.ok(['openai', 'gigachat'].includes(provider.adapter), `${provider.id}: неизвестный adapter`);
        assert.ok(['both', 'proxy', 'direct'].includes(provider.transport), `${provider.id}: неизвестный transport`);
        assert.equal(typeof provider.baseUrl, 'string', `${provider.id}: baseUrl должен быть строкой`);

        // Каталог не должен знать о конкретных моделях: иначе каждая новая
        // модель требовала бы правок кода или каталога.
        for (const field of ['models', 'defaultModel', 'modelsUrl', 'modelLabels', 'supportsTools', 'cors', 'vision']) {
            assert.ok(!(field in provider), `${provider.id}: лишнее поле ${field}`);
        }
    }
    assert.ok(ids.has('gigachat') && ids.has('deepseek'), 'нет обязательных провайдеров');
});

await check('API КонтрCAD включён и работает по JWT', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'ai', 'providers.json'), 'utf8'));
    const provider = catalog.providers.find((item) => item.id === 'kontrcad');
    assert.ok(provider, 'нет записи kontrcad');
    assert.equal(provider.auth, 'bearer-jwt');
    assert.ok(!provider.comingSoon, 'kontrcad не должен быть «скоро»');
    assert.ok(!provider.hidden, 'kontrcad не должен быть скрыт');
    assert.match(provider.baseUrl, /\/api\/ai\/v1\/chat\/completions$/);
});

await check('подписи моделей генерируются из id', () => {
    assert.equal(humanizeModelId('deepseek-v4-pro'), 'DeepSeek V4 Pro');
    assert.equal(humanizeModelId('deepseek-flash'), 'DeepSeek Flash');
    assert.equal(humanizeModelId('qwen2.5-coder:7b'), 'Qwen2.5 Coder 7B');
    assert.equal(humanizeModelId('GigaChat-3-Ultra'), 'GigaChat 3 Ultra');
    assert.equal(humanizeModelId('vendor/model:free'), 'Model · free');
});

await check('выбор модели по умолчанию предпочитает сильные версии', () => {
    assert.ok(scoreModelName('GigaChat-3-Ultra') > scoreModelName('GigaChat-3-Pro'));
    assert.ok(scoreModelName('deepseek-v4-pro') > scoreModelName('deepseek-flash'));
    assert.ok(scoreModelName('gpt-4o') > scoreModelName('gpt-4o-mini'));
    assert.ok(scoreModelName('claude-opus-4') > scoreModelName('claude-haiku-3'));
});

await check('адрес списка моделей выводится из адреса чата', () => {
    assert.equal(deriveModelsUrl('https://api.deepseek.com/v1/chat/completions'), 'https://api.deepseek.com/v1/models');
    assert.equal(deriveModelsUrl('http://localhost:11434/v1/chat/completions'), 'http://localhost:11434/v1/models');
    assert.equal(deriveModelsUrl('https://gigachat.devices.sberbank.ru/api/v1/chat/completions'), 'https://gigachat.devices.sberbank.ru/api/v1/models');
});

// --------------------------------------------------------------------------
//  OpenAI-совместимый транспорт
// --------------------------------------------------------------------------
await check('chatOpenAI: заголовки, тело и нормализация ответа', async () => {
    requests.length = 0;
    const result = await core.chatOpenAI({
        provider: openAIProvider,
        model: 'test-model',
        messages: [{ role: 'user', content: 'куб 40 мм' }],
        system: 'system prompt',
        tools: [{ type: 'function', function: { name: 'create_box', description: 'box', parameters: { type: 'object', properties: {} } } }],
        apiKey: 'test-key',
        params: { temperature: 0.3 }
    });

    const sent = JSON.parse(requests[0].body);
    assert.equal(requests[0].headers.authorization, 'Bearer test-key');
    assert.equal(sent.model, 'test-model');
    assert.equal(sent.messages[0].role, 'system');
    assert.equal(sent.messages[0].content, 'system prompt');
    assert.equal(sent.messages[1].content, 'куб 40 мм');
    assert.equal(sent.tools.length, 1);
    assert.equal(sent.tool_choice, 'auto');
    assert.equal(sent.temperature, 0.3);

    assert.equal(result.content, 'Привет!');
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, 'get_scene_state');
    assert.deepEqual(result.toolCalls[0].args, { limit: 5 });
    assert.equal(result.usage.total_tokens, 42);
});

await check('chatOpenAI: понятная ошибка при неверном ключе', async () => {
    await assert.rejects(
        () => core.chatOpenAI({
            provider: openAIProvider, model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: 'wrong'
        }),
        (err) => {
            assert.match(err.message, /HTTP 401/);
            assert.match(err.message, /ключ/i);
            return true;
        }
    );
});

await check('chatOpenAI: без ключа — сразу ошибка, без сети', async () => {
    await assert.rejects(
        () => core.chatOpenAI({ provider: openAIProvider, model: 'm', messages: [] }),
        /Не задан ключ/
    );
});

await check('checkKey: GET /models возвращает количество моделей', async () => {
    const result = await core.checkKey({ provider: openAIProvider, apiKey: 'test-key' });
    assert.equal(result.ok, true);
    assert.match(result.detail, /2/);
});

await check('listModels: возвращает список моделей провайдера', async () => {
    const result = await core.listModels({ provider: openAIProvider, apiKey: 'test-key' });
    assert.deepEqual(result.models, ['model-a', 'model-b']);
});

await check('chatStream OpenAI: текст и tool_calls собираются из дельт', async () => {
    const provider = { ...openAIProvider, baseUrl: `${base}/v1/chat/stream` };
    const deltas = [];
    const result = await core.chatStream({
        provider,
        model: 'test-model',
        messages: [{ role: 'user', content: 'куб' }],
        apiKey: 'test-key',
        onDelta: (delta) => deltas.push(delta.text)
    });

    assert.deepEqual(deltas, ['При', 'вет']);
    assert.equal(result.content, 'Привет');
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, 'create_box');
    assert.deepEqual(result.toolCalls[0].args, { w: 10 });
});

await check('chatStream GigaChat: текст и function_call из дельт', async () => {
    core.clearTokenCache();
    const provider = { ...gigaProvider, baseUrl: `${base}/giga/stream` };
    const deltas = [];
    const result = await core.chatStream({
        provider,
        model: 'GigaChat-2-Max',
        messages: [{ role: 'user', content: 'куб' }],
        apiKey: 'gc-auth-key',
        onDelta: (delta) => deltas.push(delta.text)
    });

    assert.deepEqual(deltas, ['Куб']);
    assert.equal(result.content, 'Куб');
    assert.equal(result.toolCalls[0].name, 'create_box');
    assert.deepEqual(result.toolCalls[0].args, { size: 7 });
});

// --------------------------------------------------------------------------
//  GigaChat-адаптер
// --------------------------------------------------------------------------
await check('chatGigaChat: OAuth, functions и mapping истории', async () => {
    requests.length = 0;
    core.clearTokenCache();

    const result = await core.chatGigaChat({
        provider: gigaProvider,
        model: 'GigaChat-2-Max',
        system: 'sys',
        messages: [
            { role: 'user', content: 'сделай куб' },
            {
                role: 'assistant',
                content: '',
                tool_calls: [{ id: 'c1', type: 'function', function: { name: 'create_box', arguments: '{"width":10}' } }]
            },
            { role: 'tool', tool_call_id: 'c1', name: 'create_box', content: '{"text":"ok"}' }
        ],
        tools: [{ type: 'function', function: { name: 'create_box', description: 'box', parameters: { type: 'object', properties: {} } } }],
        apiKey: 'gc-auth-key'
    });

    const oauth = requests.find((r) => r.url === '/oauth');
    assert.ok(oauth, 'OAuth не вызван');
    assert.equal(oauth.headers.authorization, 'Basic gc-auth-key');
    assert.match(oauth.body, /scope=GIGACHAT_API_PERS/);
    assert.ok(oauth.rawHeaders.includes('RqUID'), 'OAuth без заголовка RqUID');

    const chat = requests.find((r) => r.url === '/giga/chat');
    const body = JSON.parse(chat.body);
    assert.equal(chat.headers.authorization, 'Bearer gc-token');
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[1].role, 'user');
    assert.equal(body.messages[2].function_call.name, 'create_box');
    assert.equal(body.messages[3].role, 'function');
    assert.equal(body.messages[3].name, 'create_box');
    assert.equal(body.functions.length, 1);
    assert.equal(body.function_call, 'auto');

    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, 'create_box');
    assert.deepEqual(result.toolCalls[0].args, { width: 10 });
});

await check('chatGigaChat: повтор при протухшем токене (401)', async () => {
    core.clearTokenCache();
    let calls = 0;
    const flaky = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            if (req.url === '/oauth') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ access_token: 'token-' + (++calls), expires_at: Date.now() + 3600 * 1000 }));
                return;
            }
            if (req.url === '/giga/chat') {
                if (calls < 2) {
                    res.writeHead(401);
                    res.end(JSON.stringify({ message: 'expired' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
                return;
            }
            res.writeHead(404);
            res.end('{}');
        });
    });
    await new Promise((resolve) => flaky.listen(0, '127.0.0.1', resolve));
    const port = flaky.address().port;

    const result = await core.chatGigaChat({
        provider: {
            id: 'gigachat', label: 'GigaChat', adapter: 'gigachat', auth: 'oauth',
            baseUrl: `http://127.0.0.1:${port}/giga/chat`,
            oauth: { url: `http://127.0.0.1:${port}/oauth`, scope: 'GIGACHAT_API_PERS' }
        },
        model: 'GigaChat-2-Max',
        messages: [{ role: 'user', content: 'привет' }],
        apiKey: 'retry-key'
    });

    assert.equal(result.content, 'ok');
    assert.equal(calls, 2);
    await new Promise((resolve) => flaky.close(resolve));
});

// --------------------------------------------------------------------------
//  Санитайзер схем
// --------------------------------------------------------------------------
await check('sanitizeGigaChatSchema: object без properties, oneOf, массив типов', () => {
    const input = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: true,
        properties: {
            hidden: { title: 'x' },
            choice: { oneOf: [{ type: 'object', properties: { a: { type: 'number' } } }, { type: 'string' }] },
            maybe: { type: ['number', 'null'] },
            list: { type: 'array', items: { properties: { id: { type: 'string' } } } }
        }
    };
    const before = JSON.stringify(input);
    const schema = sanitizeGigaChatSchema(input);

    assert.equal(JSON.stringify(input), before, 'исходная схема мутирована');
    assert.equal(schema.$schema, undefined);
    assert.equal(schema.additionalProperties, undefined);
    assert.equal(schema.properties.hidden.type, 'string');
    assert.equal(schema.properties.choice.type, 'object');
    assert.ok(schema.properties.choice.properties.a);
    assert.equal(schema.properties.maybe.type, 'number');
    assert.equal(schema.properties.list.items.type, 'object');
    assert.deepEqual(schema.properties.list.items.properties, { id: { type: 'string' } });
});

// --------------------------------------------------------------------------
//  Сетевые ошибки
// --------------------------------------------------------------------------
await check('сетевая ошибка описывается по-человечески', async () => {
    await assert.rejects(
        () => core.chatOpenAI({
            provider: { id: 'dead', label: 'Dead', adapter: 'openai', auth: 'none', baseUrl: 'http://127.0.0.1:1/v1/chat/completions' },
            model: 'm', messages: [{ role: 'user', content: 'hi' }]
        }),
        /Соединение с .* отклонено/
    );
});

// --------------------------------------------------------------------------
await new Promise((resolve) => server.close(resolve));
console.log(`\n${passed} проверок пройдено, провалов: ${failures.length}`);
if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure.name}: ${failure.message}`);
    process.exit(1);
}
