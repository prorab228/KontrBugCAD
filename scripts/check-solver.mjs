#!/usr/bin/env node
/**
 * Регрессионный прогон решателя ограничений эскиза (этап 0 аудита).
 *
 * Запускает test-artifacts/solver/regression.mjs в Node без браузера:
 *   • ставит минимальные заглушки браузерных API (localStorage/DOM/canvas),
 *     нужные только на этапе импорта модулей js/;
 *   • регистрирует ESM-хук «голых» спецификаторов (three, core/, tools/…);
 *   • сравнивает метрики с эталоном test-artifacts/solver/baseline.json.
 *
 * Использование:
 *   node scripts/check-solver.mjs            # проверка (exit 1 при падении)
 *   node scripts/check-solver.mjs --update   # перезаписать эталон
 *   node scripts/check-solver.mjs --verbose  # подробности по каждому сценарию
 *   node scripts/check-solver.mjs --json     # машинный вывод
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowserStubs } from './lib/browser-stubs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tests', 'solver', 'baseline.json');
const argv = new Set(process.argv.slice(2));
const UPDATE = argv.has('--update');
const VERBOSE = argv.has('--verbose');
const JSON_OUT = argv.has('--json');

installBrowserStubs();

register('./lib/bare-specifier-hooks.mjs', import.meta.url);

// Менеджер ограничений в решателе пишет по 7–10 console.log на каждый solve —
// в регрессии это шум. Считаем и глушим.
const logged = { log: 0, warn: 0 };
const origLog = console.log;
const origWarn = console.warn;
console.log = () => { logged.log++; };
console.warn = () => { logged.warn++; };

const { runRegression } = await import('../tests/solver/regression.mjs');
const started = performance.now();
const report = runRegression();
const elapsed = performance.now() - started;

console.log = origLog;
console.warn = origWarn;

if (JSON_OUT) {
    origLog(JSON.stringify({ ...report, elapsed, logged }, null, 2));
    process.exit(report.summary.failed === 0 ? 0 : 1);
}

const fmt = (v) => {
    if (typeof v === 'number') {
        if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5)) return v.toExponential(2);
        return String(+v.toFixed(3));
    }
    return String(v);
};

origLog('');
origLog('══════ РЕГРЕССИЯ РЕШАТЕЛЯ ОГРАНИЧЕНИЙ ЭСКИЗА ══════');
origLog('');

const baseline = readBaseline();
const nextBaseline = { generatedAt: new Date().toISOString(), note: 'эталон метрик; обновлять осознанно: npm run check:solver -- --update', scenarios: {} };
const drifts = [];

for (const s of report.scenarios) {
    const passed = s.checks.filter(c => c.ok).length;
    const mark = s.ok ? '✅' : '❌';
    const metrics = Object.entries(s.metrics)
        .filter(([k]) => ['converged', 'residual', 'iter', 'dof', 'rank', 'm', 'nFree'].includes(k))
        .map(([k, v]) => `${k}=${fmt(v)}`).join(' ');
    origLog(`${mark} ${s.id.padEnd(18)} ${String(passed).padStart(2)}/${String(s.checks.length).padEnd(2)}  ${metrics}`);

    if (!s.ok || VERBOSE) {
        for (const c of s.checks) {
            if (!c.ok || VERBOSE) origLog(`     ${c.ok ? '·' : '✗'} ${c.name}${c.detail !== null ? ' — ' + fmt(c.detail) : ''}`);
        }
    }

    // сравнение с эталоном
    const base = baseline.scenarios?.[s.id];
    if (base) {
        const cur = s.metrics;
        for (const key of ['converged', 'consistent', 'redundant', 'partial', 'dof', 'rank', 'm', 'nFree']) {
            if (base[key] === undefined || cur[key] === undefined) continue;
            if (base[key] !== cur[key]) drifts.push(`${s.id}.${key}: ${fmt(base[key])} → ${fmt(cur[key])}`);
        }
        if (Number.isFinite(base.residual) && Number.isFinite(cur.residual)) {
            if (cur.residual > Math.max(1e-6, base.residual * 10)) {
                drifts.push(`${s.id}.residual: ${fmt(base.residual)} → ${fmt(cur.residual)}`);
            }
        }
        if (Number.isFinite(base.iter) && Number.isFinite(cur.iter)) {
            if (cur.iter > Math.max(base.iter + 3, Math.ceil(base.iter * 1.5))) {
                drifts.push(`${s.id}.iter: ${fmt(base.iter)} → ${fmt(cur.iter)}`);
            }
        }
    }
    nextBaseline.scenarios[s.id] = s.metrics;
}

origLog('');
const { total, passed, failed, checks, failedChecks } = report.summary;
origLog(`Итог: ${passed}/${total} сценариев, проверок ${checks - failedChecks}/${checks}, ${elapsed.toFixed(0)} мс`);
if (logged.log || logged.warn) origLog(`(подавлено логов решателя: ${logged.log} log, ${logged.warn} warn)`);

if (drifts.length) {
    origLog('');
    origLog(`⚠️  Отклонения от эталона (${drifts.length}):`);
    for (const d of drifts) origLog('   ' + d);
    origLog('   Если это ожидаемое улучшение — обновите эталон: npm run check:solver -- --update');
}

if (UPDATE) {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify(nextBaseline, null, 2) + '\n', 'utf8');
    origLog('');
    origLog(`💾 Эталон записан: ${path.relative(ROOT, BASELINE)}`);
}

if (!UPDATE && !fs.existsSync(BASELINE)) {
    origLog('');
    origLog('ℹ️  Эталона ещё нет — создайте: npm run check:solver -- --update');
}

origLog('');
process.exit(failed === 0 && drifts.length === 0 ? 0 : 1);

// ─────────────────────────────────────────────────────────────────────────────

function readBaseline() {
    try {
        return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    } catch {
        return { scenarios: {} };
    }
}
