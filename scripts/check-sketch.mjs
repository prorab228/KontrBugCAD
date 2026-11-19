#!/usr/bin/env node
/**
 * Characterization-тесты сущностей эскиза (этап 0 рефакторинга).
 *
 * Запускает tests/sketch/entities.mjs в Node без браузера: ставит заглушки
 * DOM/localStorage, регистрирует ESM-хук «голых» спецификаторов и печатает
 * результат по сценариям.
 *
 * Использование:
 *   node scripts/check-sketch.mjs            # проверка, exit 1 при падении
 *   node scripts/check-sketch.mjs --verbose  # печатать все проверки
 */
import { register } from 'node:module';
import { installBrowserStubs } from './lib/browser-stubs.mjs';

const VERBOSE = new Set(process.argv.slice(2)).has('--verbose');

installBrowserStubs();
register('./lib/bare-specifier-hooks.mjs', import.meta.url);

// Сущности/менеджеры могут писать в консоль при создании — для теста это шум.
const origLog = console.log;
const origWarn = console.warn;
console.log = () => {};
console.warn = () => {};

const { runSketchEntities } = await import('../tests/sketch/entities.mjs');
const started = performance.now();
const report = runSketchEntities();
const elapsed = performance.now() - started;

console.log = origLog;
console.warn = origWarn;

origLog('');
origLog('══════ ТЕСТЫ СУЩНОСТЕЙ ЭСКИЗА ══════');
origLog('');

for (const s of report.scenarios) {
    const passed = s.checks.filter(c => c.ok).length;
    origLog(`${s.ok ? '✅' : '❌'} ${s.id.padEnd(24)} ${String(passed).padStart(2)}/${String(s.checks.length).padEnd(2)}  ${s.title}`);
    if (s.error) origLog(`     ✗ исключение: ${s.error}`);
    if (!s.ok || VERBOSE) {
        for (const c of s.checks) {
            if (!c.ok || VERBOSE) {
                origLog(`     ${c.ok ? '·' : '✗'} ${c.name}${c.detail !== null && c.detail !== undefined ? ' — ' + c.detail : ''}`);
            }
        }
    }
}

const { total, passed, checks, failedChecks } = report.summary;
origLog('');
origLog(`Итог: ${passed}/${total} сценариев, проверок ${checks - failedChecks}/${checks}, ${elapsed.toFixed(0)} мс`);
origLog('');

process.exit(failedChecks === 0 ? 0 : 1);
