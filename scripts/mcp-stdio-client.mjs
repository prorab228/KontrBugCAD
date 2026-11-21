// Реальный MCP-клиент по STDIO — ровно как Claude Desktop: спавнит exe, шлёт JSON-RPC.
// Запуск: node scripts/mcp-stdio-client.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EXE = process.env.KONTR_EXE || 'C:\\Program Files\\kontrbugcad\\КонтрCAD.exe';
const UD = process.env.KONTR_UD || 'test-artifacts\\userdata-client';
const CALL = process.env.KONTR_CALL || '';
const TOOLS_TIMEOUT_MS = Number(process.env.KONTR_TOOLS_TIMEOUT_MS || 45000);

const t0 = Date.now();
const ts = () => `[+${((Date.now() - t0) / 1000).toFixed(2)}s]`;
const log = (...a) => console.log(ts(), ...a);

const stderrTail = [];
const extraArgs = (process.env.KONTR_EXTRA_ARGS || '').split(/\s+/).filter(Boolean);
const transport = new StdioClientTransport({
    command: EXE,
    args: ['--mcp', `--user-data-dir=${UD}`, ...extraArgs],
    stderr: 'pipe',
});

transport.stderr?.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        stderrTail.push(line);
        if (stderrTail.length > 400) stderrTail.shift();
    }
});

const client = new Client({ name: 'dsh-stdio-test', version: '1.0.0' }, { capabilities: {} });

log('connect() ->', EXE);
await client.connect(transport);
log('handshake OK, server =', JSON.stringify(client.getServerVersion()));

let tools = [];
const deadline = Date.now() + TOOLS_TIMEOUT_MS;
let attempt = 0;
while (Date.now() < deadline) {
    attempt++;
    const res = await client.listTools();
    tools = res.tools || [];
    log(`tools/list #${attempt}: ${tools.length}`);
    if (tools.length > 0) break;
    await new Promise((r) => setTimeout(r, 1500));
}

log('ИТОГО инструментов:', tools.length);
for (const t of tools) log('   •', t.name, '-', (t.description || '').slice(0, 70));

if (tools.length > 0) {
    // выбираем инструмент без обязательных параметров
    const pick =
        tools.find((t) => t.name === CALL) ||
        tools.find((t) => !(t.inputSchema?.required?.length)) ||
        tools[0];
    log('tools/call ->', pick.name);
    try {
        const r = await client.callTool({ name: pick.name, arguments: {} });
        const text = (r.content || [])
            .map((c) => (c.type === 'text' ? c.text : `<${c.type}>`))
            .join('\n');
        log('результат isError =', r.isError === true);
        log('--- начало ответа ---\n' + text.slice(0, 1200));
    } catch (e) {
        log('tools/call ОШИБКА:', e.message);
    }
}

log('закрываем соединение (stdin EOF) ...');
const tClose = Date.now();
await client.close();
log('закрыто за', Date.now() - tClose, 'мс');

console.log('\n=== STDERR (последние 15 строк) ===');
for (const line of stderrTail.slice(-15)) console.log(line);
