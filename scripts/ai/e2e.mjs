#!/usr/bin/env node
/**
 * ai-e2e.mjs — проверка вкладки «ИИ» в живом Electron через CDP.
 *
 * Что делает:
 *   1. запускает приложение с --remote-debugging-port и отдельной папкой данных
 *      (test-artifacts/userdata), чтобы не трогать настройки пользователя;
 *   2. ждёт инициализацию редактора и ИИ-ассистента;
 *   3. открывает вкладку «ИИ», читает состояние провайдера/модели/ключа;
 *   4. снимает скриншот панели;
 *   5. с флагом --live берёт Authorization Key GigaChat из server.py,
 *      сохраняет его через IPC и отправляет реальное сообщение модели.
 *
 * Запуск:
 *   node scripts/ai-e2e.mjs            # UI-проверка + скриншот
 *   node scripts/ai-e2e.mjs --live     # + реальный запрос к GigaChat
 *   node scripts/ai-e2e.mjs --keep     # не закрывать приложение после теста
 *
 * Почему --no-sandbox: в средах с ограничениями (CI, песочница DSH) sandbox
 * Chromium не может выделить себе права и приложение падает на старте.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const electronPath = require('electron');

const ARGS = process.argv.slice(2);
const LIVE = ARGS.includes('--live');
const CAD = ARGS.includes('--cad');
const KEEP = ARGS.includes('--keep');
/** --real — работать с настоящим профилем пользователя (ключи останутся в приложении) */
const REAL_PROFILE = ARGS.includes('--real');
const DEBUG_PORT = 9222;
const OUT_DIR = path.join(ROOT, 'test-artifacts');
const USER_DATA = path.join(OUT_DIR, 'userdata');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.nextId = 0;
        this.pending = new Map();
    }

    async connect() {
        this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
        await new Promise((resolve, reject) => {
            this.ws.once('open', resolve);
            this.ws.once('error', reject);
        });
        this.ws.on('message', (raw) => {
            let message;
            try { message = JSON.parse(raw.toString()); } catch (_) { return; }
            const entry = this.pending.get(message.id);
            if (!entry) return;
            this.pending.delete(message.id);
            if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
            else entry.resolve(message.result);
        });
    }

    send(method, params = {}, timeoutMs = 200000) {
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP ${method}: таймаут ${timeoutMs} мс`));
            }, timeoutMs);
            this.pending.set(id, {
                resolve: (value) => { clearTimeout(timer); resolve(value); },
                reject: (err) => { clearTimeout(timer); reject(err); },
                method
            });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression, { awaitPromise = true } = {}) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise,
            returnByValue: true,
            userGesture: true
        });
        if (result.exceptionDetails) {
            const description = result.exceptionDetails.exception
                ? (result.exceptionDetails.exception.description || result.exceptionDetails.exception.value)
                : result.exceptionDetails.text;
            throw new Error(`JS: ${description}`);
        }
        return result.result ? result.result.value : undefined;
    }

    close() {
        try { this.ws.close(); } catch (_) { /* уже закрыт */ }
    }
}

async function waitFor(check, { timeoutMs = 90000, intervalMs = 500, label = 'условия' } = {}) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < timeoutMs) {
        try {
            const value = await check();
            if (value) return value;
        } catch (err) {
            lastError = err;
        }
        await sleep(intervalMs);
    }
    throw new Error(`Не дождались ${label} за ${Math.round(timeoutMs / 1000)} с` + (lastError ? `: ${lastError.message}` : ''));
}

async function listPages() {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    return await response.json();
}

/** Закрывает системные диалоги редактора («Загрузить последний проект?» и т.п.). */
async function dismissDialogs(cdp) {
    for (let attempt = 0; attempt < 6; attempt++) {
        const closed = await cdp.evaluate(`(() => {
            const dialogs = Array.from(document.querySelectorAll('.modal-overlay.custom-dialog'));
            for (const dialog of dialogs) {
                const cancel = dialog.querySelector('.modal-footer .btn-secondary')
                    || dialog.querySelector('.modal-footer button');
                if (cancel) cancel.click();
            }
            return dialogs.length;
        })()`);
        if (!closed) return;
        await sleep(400);
    }
}

function readGigaChatKey() {
    return (process.env.KC_GIGACHAT_KEY || '').trim();
}

function stopApp(child) {
    if (!child || child.killed) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        child.kill('SIGTERM');
    }
}

async function main() {
    fs.mkdirSync(USER_DATA, { recursive: true });

    // stdio: 'pipe' в песочнице запрещён (named pipes), поэтому лог пишем в файл.
    const logPath = path.join(OUT_DIR, 'app.log');
    fs.writeFileSync(logPath, '');
    const logFd = fs.openSync(logPath, 'a');

    const child = spawn(
        electronPath,
        ['.', '--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`],
        {
            cwd: ROOT,
            env: REAL_PROFILE
                ? { ...process.env }
                : { ...process.env, KC_USER_DATA: USER_DATA },
            stdio: ['ignore', logFd, logFd]
        }
    );

    let cdp = null;
    try {
        const target = await waitFor(async () => {
            const pages = await listPages();
            return pages.find((page) => page.type === 'page' && page.url.startsWith('app://') && page.webSocketDebuggerUrl);
        }, { label: 'страницы приложения (CDP)', timeoutMs: 90000 });

        cdp = new Cdp(target.webSocketDebuggerUrl);
        await cdp.connect();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        await waitFor(
            () => cdp.evaluate('!!(window.cadEditor && window.cadEditor.aiAssistant)'),
            { timeoutMs: 120000, label: 'инициализации CADEditor' }
        );

        await waitFor(
            () => cdp.evaluate('window.cadEditor.aiAssistant.client.providers.length > 0'),
            { timeoutMs: 30000, label: 'каталога провайдеров' }
        );

        await dismissDialogs(cdp);
        await sleep(500);

        const state = await cdp.evaluate(`(() => {
            const assistant = window.cadEditor.aiAssistant;
            return {
                env: window.__CAD_ENV__,
                desktop: assistant.client.isDesktop,
                providerId: assistant.providerId,
                modelId: assistant.modelId,
                modelLabel: document.getElementById('aiModelLabel').textContent,
                connected: assistant._connectedProviders().map(p => p.id),
                providers: assistant.client.availableProviders().map(p => p.id + (p.disabled ? '(disabled)' : '')),
                keySecure: assistant.client.keysInfo().secure,
                hasKey: assistant.client.hasKey(assistant.providerId),
                toolCount: window.cadEditor.mcpManager.tools.length
            };
        })()`);
        console.log('\n[state]', JSON.stringify(state, null, 2));

        await cdp.evaluate(`document.querySelector('.panel-tab[data-tab="ai"]').click()`);
        await sleep(700);

        const tabState = await cdp.evaluate(`(() => ({
            active: document.getElementById('aiContent').classList.contains('active'),
            height: Math.round(document.getElementById('aiContent').getBoundingClientRect().height),
            welcome: (document.querySelector('.ai-chat-welcome') || {}).innerText || ''
        }))()`);
        console.log('[tab]', JSON.stringify(tabState));
        if (!tabState.active) throw new Error('Вкладка «ИИ» не активировалась');
        if (tabState.height < 100) throw new Error('Панель «ИИ» не отрисовалась');

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const shotPath = path.join(OUT_DIR, 'ai-desktop.png');
        fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
        console.log('[screenshot]', shotPath);

        // ---- Меню моделей в композере ----
        await dismissDialogs(cdp);
        await cdp.evaluate(`document.getElementById('aiModelBtn').click()`);
        await sleep(300);
        const menuState = await cdp.evaluate(`(() => ({
            open: !!document.querySelector('.ai-model-menu'),
            items: document.querySelectorAll('.ai-model-menu__item').length,
            groups: Array.from(document.querySelectorAll('.ai-model-menu__group')).map(n => n.textContent)
        }))()`);
        console.log('[model menu]', JSON.stringify(menuState));
        const shotMenu = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT_DIR, 'ai-model-menu.png'), Buffer.from(shotMenu.data, 'base64'));
        await cdp.evaluate(`document.getElementById('aiModelBtn').click()`);
        await sleep(200);

        // Автовысота поля ввода: несколько строк должны растянуть композер
        const grow = await cdp.evaluate(`(() => {
            const input = document.getElementById('aiChatInput');
            const before = Math.round(input.getBoundingClientRect().height);
            input.value = Array(6).fill('строка').join('\\n');
            input.dispatchEvent(new Event('input'));
            const after = Math.round(input.getBoundingClientRect().height);
            input.value = '';
            input.dispatchEvent(new Event('input'));
            return { before, after };
        })()`);
        console.log('[composer grow]', JSON.stringify(grow));
        if (grow.after <= grow.before) throw new Error('Поле ввода не растёт вверх');

        // ---- Модалка настроек ИИ ----
        await cdp.evaluate(`window.cadEditor.aiAssistant.settingsModal.open('gigachat')`);
        await sleep(500);

        const settingsState = await cdp.evaluate(`(() => ({
            open: document.getElementById('aiSettingsModal').classList.contains('active'),
            providers: document.querySelectorAll('#aiSettingsProviderSelect option').length,
            models: document.querySelectorAll('#aiSettingsModels .ai-model-chip').length,
            urlVisible: getComputedStyle(document.getElementById('aiSettingsUrlSection')).display !== 'none',
            temperature: document.getElementById('aiSettingsTemperature').value,
            stream: document.getElementById('aiSettingsStream').checked
        }))()`);
        console.log('[settings]', JSON.stringify(settingsState));
        if (!settingsState.open) throw new Error('Модалка настроек ИИ не открылась');

        const shotSettings = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT_DIR, 'ai-settings.png'), Buffer.from(shotSettings.data, 'base64'));

        // «Свой URL» — проверяем, что поле появляется и сохраняется
        await cdp.evaluate(`(() => {
            const select = document.getElementById('aiSettingsProviderSelect');
            select.value = 'custom';
            select.dispatchEvent(new Event('change'));
        })()`);
        await sleep(300);
        const customState = await cdp.evaluate(`(() => ({
            urlVisible: getComputedStyle(document.getElementById('aiSettingsUrlSection')).display !== 'none',
            notes: document.getElementById('aiSettingsNotes').textContent
        }))()`);
        console.log('[settings custom]', JSON.stringify(customState));
        if (!customState.urlVisible) throw new Error('Для своего URL не показалось поле адреса');

        // «Скоро»: API КонтрCAD
        await cdp.evaluate(`(() => {
            const select = document.getElementById('aiSettingsProviderSelect');
            select.value = 'kontrcad';
            select.dispatchEvent(new Event('change'));
        })()`);
        await sleep(250);
        const soonState = await cdp.evaluate(`(() => ({
            notes: document.getElementById('aiSettingsNotes').textContent,
            modelsHidden: getComputedStyle(document.getElementById('aiSettingsModelsSection')).display === 'none',
            keyHidden: getComputedStyle(document.getElementById('aiSettingsKeySection')).display === 'none'
        }))()`);
        console.log('[settings soon]', JSON.stringify(soonState));
        if (!soonState.modelsHidden) throw new Error('Для «скоро» не спрятан блок моделей');

        const shotSoon = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT_DIR, 'ai-settings-soon.png'), Buffer.from(shotSoon.data, 'base64'));

        await cdp.evaluate(`document.getElementById('aiSettingsClose').click()`);
        await sleep(200);

        if (LIVE) {
            const key = readGigaChatKey();
            if (!key) throw new Error('Не задан ключ: запустите с переменной окружения KC_GIGACHAT_KEY');

            console.log('[live] сохраняю ключ GigaChat через IPC…');
            const saved = await cdp.evaluate(`window.electronAPI.ai.setKey('gigachat', ${JSON.stringify(key)})`);
            console.log('[live] статус ключей:', JSON.stringify(saved));

            // Ключ появился — подтягиваем список моделей и пересобираем композер.
            const connected = await cdp.evaluate(`(async () => {
                const ai = window.cadEditor.aiAssistant;
                await ai.client.refreshKeys();
                await ai._refreshModels();
                ai._syncModel();
                return { providerId: ai.providerId, modelId: ai.modelId, label: document.getElementById('aiModelLabel').textContent };
            })()`);
            console.log('[live] модель в композере:', JSON.stringify(connected));

            console.log('[live] отправляю сообщение модели…');
            await cdp.evaluate(`(() => {
                window.__streamStats = { pushes: 0, chars: 0 };
                const panel = window.cadEditor.aiAssistant.panel;
                const original = panel.startStreamMessage.bind(panel);
                panel.startStreamMessage = function () {
                    const handle = original();
                    const push = handle.push.bind(handle);
                    handle.push = (text) => {
                        window.__streamStats.pushes++;
                        window.__streamStats.chars += String(text).length;
                        push(text);
                    };
                    return handle;
                };
                return true;
            })()`);

            await cdp.evaluate(`window.__aiPending = window.cadEditor.aiAssistant.sendMessage('Ответь одним коротким предложением: что ты умеешь в CAD?')`, { awaitPromise: false });
            await sleep(700);
            const thinkingVisible = await cdp.evaluate(`!!document.querySelector('.ai-thinking')`);
            console.log('[live] индикатор «думает»:', thinkingVisible);
            await cdp.evaluate('window.__aiPending', { awaitPromise: true });

            const transcript = await cdp.evaluate(`window.cadEditor.aiAssistant.messages.map(m => ({
                role: m.role,
                content: (typeof m.content === 'string' ? m.content : '').slice(0, 300)
            }))`);
            console.log('[live] история:', JSON.stringify(transcript, null, 2));

            const streamStats = await cdp.evaluate('window.__streamStats');
            console.log('[live] стриминг:', JSON.stringify(streamStats));

            // Скриншот индикатора «думает» (показываем вручную, чтобы поймать кадр)
            await cdp.evaluate(`window.cadEditor.aiAssistant.panel.showThinking()`);
            await sleep(350);
            const shotThinking = await cdp.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(OUT_DIR, 'ai-thinking.png'), Buffer.from(shotThinking.data, 'base64'));
            await cdp.evaluate(`window.cadEditor.aiAssistant.panel.hideThinking()`);

            const errors = await cdp.evaluate(
                `Array.from(document.querySelectorAll('.ai-message-error')).map(n => n.textContent)`
            );
            if (errors.length) console.log('[live] ошибки в UI:', JSON.stringify(errors));

            const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
            const shotPath2 = path.join(OUT_DIR, 'ai-desktop-live.png');
            fs.writeFileSync(shotPath2, Buffer.from(shot2.data, 'base64'));
            console.log('[screenshot]', shotPath2);

            // Меню моделей уже с подключённым провайдером — для наглядных подписей
            await cdp.evaluate(`document.getElementById('aiModelBtn').click()`);
            await sleep(300);
            const shotMenu2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(OUT_DIR, 'ai-model-menu.png'), Buffer.from(shotMenu2.data, 'base64'));
            await cdp.evaluate(`document.getElementById('aiModelBtn').click()`);
            await sleep(150);
        }

        if (CAD) {
            const sceneBefore = await cdp.evaluate(
                `window.cadEditor.mcpManager.tools.find(t => t.name === 'get_scene_state').execute({})
                    .then(r => (r.content || []).map(c => c.text || '').join('\\n'))`
            );
            const opsBefore = await cdp.evaluate('window.cadEditor.parametricModel.operations.length');

            console.log('[cad] прошу модель создать куб…');
            await cdp.evaluate(
                `window.cadEditor.aiAssistant.sendMessage('Создай куб 40×40×40 мм в начале координат')`,
                { awaitPromise: true }
            );

            const opsAfter = await cdp.evaluate('window.cadEditor.parametricModel.operations.length');
            const sceneAfter = await cdp.evaluate(
                `window.cadEditor.mcpManager.tools.find(t => t.name === 'get_scene_state').execute({})
                    .then(r => (r.content || []).map(c => c.text || '').join('\\n'))`
            );
            console.log(`[cad] операций: ${opsBefore} → ${opsAfter}`);
            console.log('[cad] сцена до:', sceneBefore.slice(0, 400));
            console.log('[cad] сцена после:', sceneAfter.slice(0, 400));
            if (opsAfter <= opsBefore) throw new Error('Модель не создала ни одной операции');

            // Проверяем batch: несколько операций должны уложиться в пару вызовов
            const stepsBefore = await cdp.evaluate('window.cadEditor.aiAssistant.messages.length');
            console.log('[cad] добавляю два цилиндра, прошу batch…');
            await cdp.evaluate(
                `window.cadEditor.aiAssistant.sendMessage('Добавь по бокам куба два цилиндра Ø20 мм. Объедини операции в batch.')`,
                { awaitPromise: true }
            );
            const stepsAfter = await cdp.evaluate('window.cadEditor.aiAssistant.messages.length');
            const opsBatch = await cdp.evaluate('window.cadEditor.parametricModel.operations.length');
            console.log(`[cad] batch: операций ${opsAfter} → ${opsBatch}, сообщений в истории: ${stepsAfter - stepsBefore}`);

            const calls = await cdp.evaluate(`window.cadEditor.aiAssistant.messages
                .filter(m => m.tool_calls && m.tool_calls.length)
                .map(m => m.tool_calls.map(tc => tc.function.name + '(' + String(tc.function.arguments).slice(0, 90) + ')'))`);
            fs.writeFileSync(path.join(OUT_DIR, 'ai-calls.json'), JSON.stringify(calls, null, 1));
            console.log('[cad] вызовов всего:', calls.length, '| первые:', JSON.stringify(calls.slice(0, 6)));

            const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
            const shotPath3 = path.join(OUT_DIR, 'ai-desktop-cad.png');
            fs.writeFileSync(shotPath3, Buffer.from(shot3.data, 'base64'));
            console.log('[screenshot]', shotPath3);
        }

        console.log('\nOK: вкладка «ИИ» работает' + (LIVE ? ', живой вызов выполнен' : ''));
    } catch (err) {
        console.error('\nFAIL:', err.message);
        try {
            const log = fs.readFileSync(logPath, 'utf8').split('\n');
            console.error('Последние строки лога приложения:\n' + log.slice(-35).join('\n'));
        } catch (_) { /* лога нет */ }
        process.exitCode = 1;
    } finally {
        if (cdp) cdp.close();
        if (!KEEP) stopApp(child);
        try { fs.closeSync(logFd); } catch (_) { /* уже закрыт */ }
    }
}

main();
