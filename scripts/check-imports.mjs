#!/usr/bin/env node
/**
 * Проверка графа импортов JS-модулей.
 *
 * Зачем: в проекте накопились файлы, которые никто не импортирует
 * (старые версии инструментов, альтернативные реализации и т.п.).
 * Они попадают в сборку, путают поиск и создают ложные цели для рефакторинга.
 *
 * Скрипт:
 *   • строит граф статических и динамических import/export-from;
 *   • разрешает относительные пути и алиасы из importmap (core/, generators/, tools/, utils/);
 *   • считает точкой входа js/app.js и js/app-desktop.js;
 *   • падает с кодом 1, если есть недостижимые модули или неразрешённые локальные импорты;
 *   • предупреждает о байт-идентичных дублях.
 *
 * Запуск: npm run check:imports
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_ROOT = path.join(ROOT, 'js');

// Точки входа: index.html подключает один из этих файлов в зависимости от окружения.
const ENTRY_POINTS = ['js/app.js', 'js/app-desktop.js'];

// Алиасы из importmap в index.html.
const ALIASES = {
    'core/': 'js/core/',
    'generators/': 'js/generators/',
    'tools/': 'js/tools/',
    'utils/': 'js/utils/'
};

const toPosix = (p) => p.replace(/\\/g, '/');
const rel = (p) => toPosix(path.relative(ROOT, p));

/** Убирает комментарии, чтобы закомментированные import не считались зависимостями. */
function stripComments(source) {
    let out = '';
    let quote = null;
    let inBlock = false;

    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        const next = source[i + 1];

        if (inBlock) {
            if (c === '*' && next === '/') { inBlock = false; i++; }
            continue;
        }
        if (quote) {
            out += c;
            if (c === '\\') { out += source[++i] ?? ''; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
        if (c === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') i++;
            out += '\n';
            continue;
        }
        if (c === '/' && next === '*') { inBlock = true; i++; continue; }
        out += c;
    }

    return out;
}

function walk(dir) {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) result.push(...walk(full));
        else if (entry.name.endsWith('.js')) result.push(full);
    }
    return result;
}

// Импорты: `import x from '...'`, `export ... from '...'`, `import('...')`, `import '...'`.
const IMPORT_RE = /(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

const files = walk(JS_ROOT);
const fileSet = new Set(files.map(rel));
const incoming = new Map(files.map((f) => [rel(f), 0]));
const unresolved = [];

for (const file of files) {
    const from = rel(file);
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    let match;

    while ((match = IMPORT_RE.exec(source)) !== null) {
        const spec = match[1];
        let target = null;

        if (spec.startsWith('.')) {
            target = path.resolve(path.dirname(file), spec);
        } else {
            const prefix = spec.slice(0, spec.indexOf('/') + 1);
            if (ALIASES[prefix]) {
                target = path.resolve(ROOT, ALIASES[prefix] + spec.slice(prefix.length));
            }
        }

        if (!target) continue; // bare-импорт (three, config, …)

        const targetRel = rel(target);
        if (fileSet.has(targetRel)) {
            incoming.set(targetRel, incoming.get(targetRel) + 1);
        } else if (fs.existsSync(target)) {
            // Локальный файл вне js/ (например, ../config.js) — не наш модуль.
            continue;
        } else if (targetRel.startsWith('js/') && targetRel.endsWith('.js')) {
            unresolved.push({ from, spec, target: targetRel });
        }
    }
}

// Классические <script src="js/..."> в HTML — тоже точки входа.
for (const htmlName of ['index.html', 'index-legacy.html']) {
    const htmlPath = path.join(ROOT, htmlName);
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, 'utf8');
    const scriptRe = /<script[^>]+src=["']([^"']+)["']/g;
    let match;
    while ((match = scriptRe.exec(html)) !== null) {
        const src = match[1];
        if (!src.startsWith('js/')) continue;

        if (fileSet.has(src)) incoming.set(src, incoming.get(src) + 1);
        else unresolved.push({ from: htmlName, spec: src, target: src });
    }
}

for (const entry of ENTRY_POINTS) {
    if (fileSet.has(entry)) incoming.set(entry, Infinity);
    else unresolved.push({ from: '(entry points)', spec: entry, target: entry });
}

const dead = [...incoming.entries()]
    .filter(([, count]) => count === 0)
    .map(([file]) => file)
    .sort();

// Байт-идентичные дубли — частая причина «старая/новая копия».
const byHash = new Map();
for (const file of files) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(rel(file));
}
const duplicates = [...byHash.values()].filter((group) => group.length > 1);

let failed = false;

if (unresolved.length > 0) {
    failed = true;
    console.error(`\n❌ Неразрешённые локальные импорты (${unresolved.length}):`);
    for (const item of unresolved) {
        console.error(`   ${item.from} → ${item.spec}  (${item.target})`);
    }
}

if (dead.length > 0) {
    failed = true;
    const lines = dead.reduce((sum, file) => sum + fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/).length, 0);
    console.error(`\n❌ Недостижимые модули (${dead.length}, ~${lines} строк):`);
    for (const file of dead) console.error(`   ${file}`);
    console.error('\nУдали файл или добавь его в точку входа/импорт.');
}

if (duplicates.length > 0) {
    console.warn(`\n⚠️  Байт-идентичные дубли (${duplicates.length}):`);
    for (const group of duplicates) console.warn(`   ${group.join('  ==  ')}`);
}

if (!failed) {
    const total = files.length;
    console.log(`✅ Граф импортов в порядке: ${total} модулей, недостижимых нет.`);
}

process.exit(failed ? 1 : 0);
