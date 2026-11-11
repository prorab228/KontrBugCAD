#!/usr/bin/env node
/**
 * Минимальный статический сервер для локальных прогонов и e2e-тестов.
 *
 * Зачем свой, а не `python -m http.server`:
 *   • отдаёт `Cache-Control: no-store`, поэтому правки в js/ сразу видны
 *     в браузере (иначе service worker + HTTP-кэш отдают старые модули);
 *   • корректные MIME-типы для .js / .mjs / .wasm / .json (иначе модули
 *     не грузятся или падает WebAssembly.instantiateStreaming);
 *   • не требует Python, живёт на node.
 *
 * Запуск:
 *   node scripts/dev-server.mjs            # порт 8100
 *   node scripts/dev-server.mjs --port=8200
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
        return [key, value];
    })
);
const PORT = Number(args.port || 8100);
const HOST = args.host || '127.0.0.1';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.stl': 'model/stl',
    '.3mf': 'application/octet-stream'
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Проксировать нечего: API-пути в тестах не нужны.
    if (url.pathname.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('no api in dev server');
        return;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = path.resolve(ROOT, '.' + pathname);

    // Защита от выхода за корень проекта.
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('not found: ' + pathname);
            return;
        }

        const headers = {
            'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store, must-revalidate',
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*'
        };

        if (req.method === 'HEAD') {
            res.writeHead(200, headers).end();
            return;
        }

        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`dev-server: http://${HOST}:${PORT}/  (root: ${ROOT})`);
});
