// Шаг 5: когда именно умирает stdin в main-процессе.
import { spawn } from 'node:child_process';
import http from 'node:http';
import WebSocket from 'ws';

const EXE = process.env.KONTR_EXE || 'C:\\Program Files\\kontrbugcad\\КонтрCAD.exe';
const UD = process.env.KONTR_UD || 'test-artifacts\\userdata-inspect5';
const PORT = 9233;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(2) + 's';

const child = spawn(EXE, ['--mcp', `--inspect=${PORT}`, `--user-data-dir=${UD}`], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => {
    const s = d.toString();
    stderr += s;
    if (s.includes('[MCP]')) process.stdout.write(`[${ts()}] STDERR: ${s.trim()}\n`);
});
child.stdout.on('data', (d) => process.stdout.write(`[${ts()}] STDOUT: ${JSON.stringify(d.toString())}\n`));

const getJson = (path) =>
    new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
            let b = '';
            res.on('data', (d) => (b += d));
            res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });

let targets = null;
for (let i = 0; i < 80; i++) {
    try { targets = await getJson('/json/list'); if (targets.length) break; } catch {}
    await sleep(200);
}
if (!targets?.length) { console.log('нет CDP'); child.kill(); process.exit(1); }

const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let id = 0;
const pending = new Map();
ws.on('message', (m) => {
    const msg = JSON.parse(m.toString());
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const evaluate = (expression) =>
    new Promise((resolve) => {
        const myId = ++id;
        pending.set(myId, (msg) => resolve(msg.result?.exceptionDetails ? 'THROW' : msg.result?.result?.value));
        ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });

console.log(`[${ts()}] CDP подключён`);
let prev = '';
for (let i = 0; i < 40; i++) {
    const state = await evaluate(`(() => { const s = process.stdin; return JSON.stringify({
      destroyed: s.destroyed, readable: s.readable, ended: s.readableEnded,
      hasHandle: !!s._handle, listeners: s.listenerCount('data'), bytes: s.bytesRead
    }); })()`);
    if (state !== prev) {
        console.log(`[${ts()}] stdin: ${state}`);
        prev = state;
    }
    await sleep(250);
}

ws.close();
try { child.kill(); } catch {}
