const { app, BrowserWindow, Menu, shell, ipcMain, dialog, protocol, session } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ElectronUpdater, setupIPCHandlers } = require('@capgo/electron-updater');

// ============================================================
//  MCP SDK / EXPRESS — БЕЗОПАСНЫЙ ИМПОРТ
//  Если пакет не установлен — приложение всё равно запустится,
//  просто MCP-режим будет недоступен.
// ============================================================
let Server, StdioServerTransport, StreamableHTTPServerTransport, express;
try {
    Server = require('@modelcontextprotocol/sdk/server/index.js').Server;
    StdioServerTransport = require('@modelcontextprotocol/sdk/server/stdio.js').StdioServerTransport;
    StreamableHTTPServerTransport = require('@modelcontextprotocol/sdk/server/streamableHttp.js').StreamableHTTPServerTransport;
} catch (e) {
    console.warn('[MCP] MCP SDK недоступен:', e.message);
}
try {
    express = require('express');
} catch (e) {
    console.warn('[MCP] express недоступен:', e.message);
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ LIVE-UPDATE
// ============================================================
const updater = new ElectronUpdater({
    appId: 'com.kontrbugtech.cad',
    autoUpdate: false,
});

// ============================================================
//  ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let mainWindow = null;

// MCP-состояние
let mcpToolsList = null;              // кэш инструментов от рендерера
let mcpCallMutex = Promise.resolve(); // сериализация tool calls (защита от гонок)
let mcpHttpServer = null;             // инстанс HTTP-сервера (для shutdown)

// ============================================================
//  НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ
// ============================================================
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

try {
    if (!fsSync.existsSync(path.dirname(settingsPath))) {
        fsSync.mkdirSync(path.dirname(settingsPath), { recursive: true });
    }
} catch (e) {
    console.warn('Could not create settings directory:', e.message);
}

function getSettings() {
    try {
        const data = fsSync.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

function saveSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    try {
        fsSync.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('[Settings] Failed to save:', e.message);
    }
}

function getIconPath() {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';

    if (isWindows) return path.join(__dirname, 'build/icon.ico');
    if (isMac) return path.join(__dirname, 'build/icon.icns');
    if (isLinux) return path.join(__dirname, 'build/icon.png');
    return undefined;
}

// ============================================================
//  IPC ОБРАБОТЧИКИ
// ============================================================
ipcMain.handle('add-model-to-library', async (event, { fileName, fileData, modelName, category, color, previewData }) => {
    try {
        const targetCategory = category || 'user';
        const modelsDir = path.join(__dirname, 'models', targetCategory);
        const iconsDir = path.join(modelsDir, 'icons');

        await fs.mkdir(modelsDir, { recursive: true });
        await fs.mkdir(iconsDir, { recursive: true });

        const ext = path.extname(fileName);
        const uniqueName = `${Date.now()}_${uuidv4()}${ext}`;
        const filePath = path.join(modelsDir, uniqueName);

        const buffer = Buffer.from(fileData);
        if (buffer.length === 0) throw new Error('Buffer is empty');

        await fs.writeFile(filePath, buffer);

        let iconRelativePath = '';
        if (previewData) {
            const base64Data = previewData.split(',')[1];
            const iconFileName = `${path.basename(uniqueName, ext)}.png`;
            const iconFullPath = path.join(iconsDir, iconFileName);
            await fs.writeFile(iconFullPath, Buffer.from(base64Data, 'base64'));
            iconRelativePath = `icons/${iconFileName}`;
        }

        const itemsPath = path.join(modelsDir, 'items.json');
        let items = [];
        try {
            const itemsContent = await fs.readFile(itemsPath, 'utf8');
            items = JSON.parse(itemsContent);
        } catch (e) {}

        const newItem = {
            id: `user_${Date.now()}`,
            name: modelName || fileName.replace(/\.[^/.]+$/, ''),
            type: 'stl_model',
            category: targetCategory,
            icon: iconRelativePath ? `models/${targetCategory}/${iconRelativePath}` : '',
            modelPath: `models/${targetCategory}/${uniqueName}`,
            color: color || '0x8BC34A',
            author: 'Пользователь'
        };
        items.push(newItem);

        await fs.writeFile(itemsPath, JSON.stringify(items, null, 2), 'utf8');

        const categoriesPath = path.join(__dirname, 'models', 'categories.json');
        let categories = [];
        try {
            categories = JSON.parse(await fs.readFile(categoriesPath, 'utf8'));
        } catch (e) {
            categories = [
                { id: 'all', name: 'Все', children: ['primitive', 'components', 'community', 'KontrBugTech'] },
                { id: 'primitive', name: 'Примитивы', path: 'models/primitive' },
                { id: 'components', name: 'Электронные компоненты', path: 'models/components' },
                { id: 'community', name: 'Сообщество', path: 'models/community' },
                { id: 'KontrBugTech', name: 'КонтрБагТех', path: 'models/kontrbugtech' }
            ];
        }

        if (!categories.some(c => c.id === 'user')) {
            categories.push({ id: 'user', name: 'Пользовательские', path: 'models/user' });
            const allCat = categories.find(c => c.id === 'all');
            if (allCat && allCat.children) allCat.children.push('user');
            await fs.writeFile(categoriesPath, JSON.stringify(categories, null, 2));
        }

        return { success: true, item: newItem };
    } catch (error) {
        console.error('ERROR in add-model-to-library:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: '3D Models', extensions: ['stl', 'obj', '3mf', 'ply', 'gltf', 'glb'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.on('focus-window', () => {
    if (mainWindow) {
        mainWindow.blur();
        mainWindow.hide();
        mainWindow.show();
        mainWindow.focus();
    }
});

// ============================================================
//  MCP: МОСТ МЕЖДУ HTTP-СЕРВЕРОМ И RENDERER-ПРОЦЕССОМ
// ============================================================

// Кэшируем список инструментов, приходящий от рендерера
ipcMain.on('mcp-tools-response', (event, tools) => {
    if (Array.isArray(tools)) {
        mcpToolsList = tools;
        console.log(`[MCP] Получен список инструментов: ${tools.length}`);
    } else {
        console.warn('[MCP] mcp-tools-response: некорректный формат', tools);
    }
});

/**
 * Вызов инструмента в renderer-процессе через IPC.
 * Сериализуем вызовы мьютексом, чтобы избежать коллизий при одновременных
 * запросах от нескольких клиентов (ответы приходят без requestId, поэтому
 * параллельные вызовы однозначно перепутались бы).
 */
async function callToolInRenderer(name, args) {
    // Захватываем мьютекс
    const prev = mcpCallMutex;
    let release;
    mcpCallMutex = new Promise(r => { release = r; });
    await prev;

    try {
        return await new Promise((resolve) => {
            if (!mainWindow || mainWindow.isDestroyed()) {
                resolve({
                    content: [{ type: 'text', text: 'Окно редактора недоступно' }],
                    isError: true
                });
                return;
            }

            const timeout = setTimeout(() => {
                ipcMain.removeListener('mcp-call-response', handler);
                resolve({
                    content: [{ type: 'text', text: 'Таймаут выполнения инструмента' }],
                    isError: true
                });
            }, 120000);

            const handler = (event, res) => {
                clearTimeout(timeout);
                if (res && res.error) {
                    resolve({ content: [{ type: 'text', text: String(res.error) }], isError: true });
                } else if (res && res.result) {
                    resolve(res.result);
                } else {
                    resolve({ content: [{ type: 'text', text: 'Пустой ответ от инструмента' }], isError: true });
                }
            };

            ipcMain.once('mcp-call-response', handler);
            mainWindow.webContents.send('mcp-call', { name, arguments: args });
        });
    } finally {
        release();
    }
}

/**
 * Ждём, пока рендерер пришлёт список инструментов. Таймаут — 15 сек.
 */
function waitForMcpToolsReady(timeoutMs = 15000) {
    if (mcpToolsList !== null) return Promise.resolve(mcpToolsList);

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            ipcMain.removeListener('mcp-tools-response', handler);
            console.warn('[MCP] Таймаут ожидания списка инструментов');
            resolve(null);
        }, timeoutMs);

        const handler = () => {
            clearTimeout(timeout);
            resolve(mcpToolsList);
        };
        ipcMain.once('mcp-tools-response', handler);
    });
}

/**
 * Запуск Streamable HTTP MCP-сервера на localhost.
 * Stateless-режим: сессия не сохраняется между запросами.
 */
function setupMcpHttpServer(port = 3100) {
    if (!express || !Server || !StreamableHTTPServerTransport) {
        console.warn('[MCP] Пропускаем запуск HTTP-сервера: нет необходимых модулей');
        return null;
    }

    const httpApp = express();
    httpApp.use(express.json({ limit: '10mb' }));

    // --- POST /mcp — основной маршрут ---
    httpApp.post('/mcp', async (req, res) => {
        try {
            const server = new Server(
                { name: 'kontrcad-mcp', version: '1.0.0' },
                { capabilities: { tools: {} } }
            );

            server.setRequestHandler('tools/list', async () => ({
                tools: mcpToolsList || [],
            }));

            server.setRequestHandler('tools/call', async (req) => {
                const { name, arguments: args } = req.params;
                return await callToolInRenderer(name, args);
            });

            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined, // ★ stateless
                enableJsonResponse: true,       // отвечаем JSON, а не SSE
            });

            res.on('close', () => {
                try { transport.close(); } catch (e) {}
            });

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (err) {
            console.error('[MCP] Ошибка обработки запроса:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal error' },
                    id: null,
                });
            }
        }
    });

    // --- GET / DELETE — в stateless-режиме не поддерживаются ---
    const methodNotAllowed = (req, res) => {
        res.status(405).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method Not Allowed' },
            id: null,
        });
    };
    httpApp.get('/mcp', methodNotAllowed);
    httpApp.delete('/mcp', methodNotAllowed);

    // ★ Биндимся на 127.0.0.1 — сервер доступен только с локальной машины
    mcpHttpServer = httpApp.listen(port, '127.0.0.1', () => {
        console.log(`[MCP] Streamable HTTP server: http://localhost:${port}/mcp`);
    });
    mcpHttpServer.on('error', (err) => {
        console.error('[MCP] Ошибка HTTP-сервера:', err.message);
    });

    return mcpHttpServer;
}

// ============================================================
//  МЕНЮ
// ============================================================
function createMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
        {
            label: 'Файл',
            submenu: [
                { label: 'Новый проект', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu-event', 'new-project') },
                { label: 'Открыть проект', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu-event', 'open-project') },
                { label: 'Сохранить проект', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu-event', 'save-project') },
                { type: 'separator' },
                { label: 'Экспорт модели', click: () => mainWindow?.webContents.send('menu-event', 'export') },
                { type: 'separator' },
                isMac ? { label: 'Закрыть окно', role: 'close' } : { label: 'Выход', role: 'quit' }
            ]
        },
        {
            label: 'Правка',
            submenu: [
                { label: 'Отменить', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow?.webContents.send('menu-event', 'undo') },
                { label: 'Повторить', accelerator: 'CmdOrCtrl+Y', click: () => mainWindow?.webContents.send('menu-event', 'redo') },
                { type: 'separator' },
                { label: 'Копировать', accelerator: 'CmdOrCtrl+C', click: () => mainWindow?.webContents.send('menu-event', 'copy') },
                { label: 'Вставить', accelerator: 'CmdOrCtrl+V', click: () => mainWindow?.webContents.send('menu-event', 'paste') },
                { label: 'Удалить', accelerator: 'Delete', click: () => mainWindow?.webContents.send('menu-event', 'delete') },
                { type: 'separator' },
                { label: 'Выделить всё', accelerator: 'CmdOrCtrl+A', click: () => mainWindow?.webContents.send('menu-event', 'selectAll') },
                { label: 'Дублировать', accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('menu-event', 'duplicate') }
            ]
        },
        {
            label: 'Вид',
            submenu: [
                { label: 'Перезагрузить', role: 'reload' },
                { label: 'Полноэкранный режим', role: 'togglefullscreen' },
                { label: 'Инструменты разработчика', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'Увеличить', role: 'zoomIn' },
                { label: 'Уменьшить', role: 'zoomOut' },
                { label: 'Масштаб по умолчанию', role: 'resetZoom' },
                { type: 'separator' },
                {
                    id: 'useLegacy',
                    label: 'Использовать совместимый режим (Three.js r162)',
                    type: 'checkbox',
                    checked: false,
                    click: (menuItem) => {
                        const enabled = menuItem.checked;
                        saveSetting('useLegacy', enabled);
                        if (mainWindow) mainWindow.reload();
                    }
                }
            ]
        },
        {
            label: 'Справка',
            submenu: [
                {
                    label: 'Проверить обновления',
                    click: () => mainWindow?.webContents.send('menu-event', 'check-updates')
                },
                { type: 'separator' },
                { label: 'Гайд по редактору', click: async () => await shell.openExternal('https://3dtoday.ru/blogs/envalid/kratkii-gaid-po-moemu-3d-redaktoru-kontrbagcad') },
                { type: 'separator' },
                { label: 'О программе', click: () => mainWindow?.webContents.send('menu-event', 'about') }
            ]
        }
    ];

    if (isMac) {
        template.unshift({
            label: app.name,
            submenu: [
                { label: `О ${app.name}`, role: 'about' },
                { type: 'separator' },
                { label: 'Скрыть', role: 'hide' },
                { label: 'Скрыть остальные', role: 'hideOthers' },
                { label: 'Показать все', role: 'unhide' },
                { type: 'separator' },
                { label: 'Выйти', role: 'quit' }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    const item = menu.getMenuItemById('useLegacy');
    if (item) item.checked = !!getSettings().useLegacy;
    Menu.setApplicationMenu(menu);
}

// ============================================================
//  ОКНО
// ============================================================
function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.js');

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: getIconPath(),
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: fsSync.existsSync(preloadPath) ? preloadPath : undefined
        }
    });

    mainWindow.loadURL('app://local/index-desktop.html').then(() => {
        mainWindow.maximize();
        mainWindow.show();
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        mainWindow.focus();
    });

    // ★ Запрашиваем у рендерера список MCP-инструментов после загрузки
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('mcp-get-tools');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    createMenu();
}

// ============================================================
//  ПРОТОКОЛ APP
// ============================================================
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
]);

function registerAppProtocol() {
    protocol.handle('app', async (request) => {
        const urlObj = new URL(request.url);
        let host = urlObj.host;
        let pathname = urlObj.pathname;

        if (host === 'local' || host === '-') host = '';

        let filePath = host ? `${host}${pathname}` : pathname;
        if (filePath.startsWith('/')) filePath = filePath.slice(1);

        const currentBundlePath = updater.getCurrentBundlePath();
        let baseDir = currentBundlePath ? path.dirname(currentBundlePath) : __dirname;

        // ★ Если в папке обновления нет index-файлов — полностью откатываемся на встроенную версию
        const hasIndex = fsSync.existsSync(path.join(baseDir, 'index-desktop.html')) ||
                         fsSync.existsSync(path.join(baseDir, 'index.html'));

        if (!hasIndex && baseDir !== __dirname) {
            console.warn(`[app://] Файлы не найдены в ${baseDir}. Переключение на встроенную версию: ${__dirname}`);
            baseDir = __dirname;
        }

        // ★ Умный выбор файла для «корня»
        if (filePath === '' || filePath === 'index.html' || filePath === 'index-desktop.html') {
            const settings = getSettings();
            const isLegacy = settings.useLegacy;

            const candidates = isLegacy
                ? ['index-desktop-legacy.html', 'index-legacy.html', 'index-desktop.html', 'index.html']
                : ['index-desktop.html', 'index.html', 'index-desktop-legacy.html'];

            let resolvedPath = null;
            for (const candidate of candidates) {
                if (fsSync.existsSync(path.join(baseDir, candidate))) {
                    resolvedPath = candidate;
                    break;
                }
            }

            if (resolvedPath) {
                filePath = resolvedPath;
            } else {
                console.warn(`[app://] Ни один index-файл не найден в ${baseDir}`);
            }
        }

        filePath = decodeURIComponent(filePath);

        // Защита от path traversal ДО склейки с baseDir
        const normalized = path.normalize(filePath);
        if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
            return new Response('Forbidden', { status: 403 });
        }

        let fullPath = path.join(baseDir, filePath);

        // ★ Per-file fallback: если файла нет в папке обновления — берём из установки.
        if (!fsSync.existsSync(fullPath) && baseDir !== __dirname) {
            const fallback = path.join(__dirname, filePath);
            if (fsSync.existsSync(fallback)) {
                console.log(`[app://] Fallback на установку: ${filePath}`);
                fullPath = fallback;
            }
        }

        // Финальная проверка, что путь остался внутри разрешённых директорий
        if (!fullPath.startsWith(baseDir) && !fullPath.startsWith(__dirname)) {
            return new Response('Forbidden', { status: 403 });
        }

        try {
            const data = await fs.readFile(fullPath);
            const ext = path.extname(fullPath);
            const contentType = {
                '.js': 'application/javascript', '.wasm': 'application/wasm', '.json': 'application/json',
                '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
                '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
                '.ico': 'image/x-icon', '.stl': 'model/stl', '.obj': 'model/obj',
                '.3mf': 'model/3mf', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary'
            }[ext] || 'application/octet-stream';

            return new Response(data, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cross-Origin-Resource-Policy': 'cross-origin',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } catch (err) {
            console.error(`[app://] 404 Not Found: ${fullPath}`);
            return new Response('Not Found', { status: 404 });
        }
    });
}

// ============================================================
//  ЗАПУСК
// ============================================================
app.whenReady().then(async () => {
    // ФИКС CORS
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        if (details.url.startsWith('https://www.kontrcad.ru/api/') || details.url.startsWith('https://www.kontrcad.ru/editor')) {
            const headers = details.responseHeaders || {};

            let origin = details.initiator || 'app://local';
            if (origin === 'app://-' || origin === 'app://local/') {
                origin = 'app://local';
            }

            for (const key in headers) {
                if (key.toLowerCase().startsWith('access-control-')) {
                    delete headers[key];
                }
            }

            headers['Access-Control-Allow-Origin'] = [origin];
            headers['Access-Control-Allow-Credentials'] = ['true'];
            headers['Access-Control-Allow-Methods'] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
            // ★ Добавлены Cache-Control и Pragma — чтобы preflight не отваливался,
            //   если они где-то ещё используются в fetch.
            headers['Access-Control-Allow-Headers'] = [
                'Content-Type', 'Authorization', 'X-Requested-With', 'Accept',
                'Cache-Control', 'Pragma'
            ];

            callback({ responseHeaders: headers });
        } else {
            callback({ responseHeaders: details.responseHeaders });
        }
    });

    await updater.initialize();
    setupIPCHandlers(updater);

    // ============================================================
    //  MCP STDIO-режим (по флагу --mcp)
    // ============================================================
    if (process.argv.includes('--mcp')) {
        if (!Server || !StdioServerTransport) {
            console.error('[MCP] SDK не установлен. Выполните npm install @modelcontextprotocol/sdk');
            app.quit();
            return;
        }

        const server = new Server(
            { name: 'kontrcad', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        const mcpWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                preload: path.join(__dirname, 'preload.js')
            }
        });

        registerAppProtocol();
        mcpWindow.loadURL('app://local/index-desktop.html');

        mcpWindow.webContents.on('did-finish-load', () => {
            mcpWindow.webContents.send('mcp-get-tools');
        });

        let toolsList = [];

        ipcMain.once('mcp-tools-response', (event, tools) => {
            toolsList = tools;

            server.setRequestHandler('tools/list', async () => ({ tools: toolsList }));

            server.setRequestHandler('tools/call', async (req) => {
                return new Promise((resolve) => {
                    mcpWindow.webContents.send('mcp-call', req.params);

                    ipcMain.once('mcp-call-response', (e, res) => {
                        if (res.error) {
                            resolve({ content: [{ type: 'text', text: res.error }], isError: true });
                        } else {
                            resolve(res.result);
                        }
                    });
                });
            });

            const transport = new StdioServerTransport();
            server.connect(transport);
            console.error('[MCP] STDIO server started');
        });

        return;
    }

    // ============================================================
    //  ОБЫЧНЫЙ РЕЖИМ: окно + MCP HTTP
    // ============================================================
    registerAppProtocol();
    createWindow();

    if (typeof updater.setWindow === 'function') {
        updater.setWindow(mainWindow);
    }

    // ★ Запускаем MCP HTTP-сервер только после того, как рендерер
    //   пришлёт список инструментов (иначе первый tools/list вернёт пусто).
    waitForMcpToolsReady(15000).then(() => {
        setupMcpHttpServer(3100);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ★ Корректное завершение HTTP-сервера
app.on('before-quit', () => {
    if (mcpHttpServer) {
        try {
            mcpHttpServer.close();
            console.log('[MCP] HTTP-сервер остановлен');
        } catch (e) {
            console.error('[MCP] Ошибка остановки HTTP-сервера:', e.message);
        }
        mcpHttpServer = null;
    }
});