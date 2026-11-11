#!/usr/bin/env node
/**
 * Синтаксическая проверка всех ES-модулей js/ без запуска приложения.
 *
 * `node --check file.js` не работает для ESM в .js (парсит как CommonJS),
 * поэтому модули разбираются через vm.SourceTextModule.
 *
 * Запуск: npm run check:syntax
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_ROOT = path.join(ROOT, 'js');

function walk(dir) {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) result.push(...walk(full));
        else if (entry.name.endsWith('.js')) result.push(full);
    }
    return result;
}

const files = walk(JS_ROOT);
const failures = [];

for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const source = fs.readFileSync(file, 'utf8');
    try {
        // Конструктор только парсит: ничего не исполняет.
        new vm.SourceTextModule(source, { identifier: rel });
    } catch (error) {
        failures.push({ file: rel, message: error.message, line: error.lineNumber });
    }
}

if (failures.length > 0) {
    console.error(`❌ Синтаксические ошибки (${failures.length}):`);
    for (const failure of failures) {
        console.error(`   ${failure.file}${failure.line ? ':' + failure.line : ''} — ${failure.message}`);
    }
    process.exit(1);
}

console.log(`✅ Синтаксис в порядке: ${files.length} модулей.`);
