#!/usr/bin/env node
/**
 * Приёмник артефактов e2e-тестов.
 *
 * Браузер не может писать файлы на диск, а Chrome блокирует серию
 * автоматических скачиваний. Тесты/страницы отправляют сюда результат:
 *
 *   await fetch('http://127.0.0.1:8201/demo.dxf', { method: 'POST', body: dxf });
 *
 * Файл появится в test-artifacts/e2e/out/demo.dxf. Запуск:
 *   node test-artifacts/e2e/save-server.mjs [--port=8201]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'out');
const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
        return [key, value];
    })
);
const PORT = Number(args.port || 8201);
const HOST = '127.0.0.1';

fs.mkdirSync(OUT_DIR, { recursive: true });

const server = http.createServer((req, res) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers).end();
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { ...headers, 'Content-Type': 'text/plain' }).end('POST only');
        return;
    }

    // Только имя файла: выход за пределы out/ невозможен.
    const name = path.basename(decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname));
    if (!name || name === '.' || name === '..') {
        res.writeHead(400, headers).end('bad name');
        return;
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
        const filePath = path.join(OUT_DIR, name);
        fs.writeFileSync(filePath, Buffer.concat(chunks));
        console.log(`saved ${name} (${fs.statSync(filePath).size} bytes)`);
        res.writeHead(200, { ...headers, 'Content-Type': 'text/plain' }).end('ok');
    });
});

server.listen(PORT, HOST, () => {
    console.log(`save-server: http://${HOST}:${PORT}/ → ${OUT_DIR}`);
});
