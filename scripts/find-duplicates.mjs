#!/usr/bin/env node
/**
 * Поиск дублирования в JS-модулях.
 *
 * Два режима:
 *   lines  — одинаковые последовательности нормализованных строк (copy-paste);
 *   tokens — одинаковая структура с точностью до имён переменных/чисел/строк.
 *
 * Запуск:
 *   node scripts/find-duplicates.mjs --mode=lines --min=10 --top=30
 *   node scripts/find-duplicates.mjs --mode=tokens --min=80 --top=30
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_ROOT = path.join(ROOT, 'js');

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
        return [key, value];
    })
);

const MODE = args.mode || 'lines';
const MIN = Number(args.min || (MODE === 'tokens' ? 80 : 10));
const TOP = Number(args.top || 30);
const MAX_PER_HASH = Number(args.maxPerHash || 20);

const toPosix = (p) => p.replace(/\\/g, '/');
const rel = (p) => toPosix(path.relative(ROOT, p));

function walk(dir) {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) result.push(...walk(full));
        else if (entry.name.endsWith('.js')) result.push(full);
    }
    return result;
}

/** Убирает комментарии, сохраняя строки и переводы строк. */
function stripComments(source) {
    let out = '';
    let quote = null;
    let inBlock = false;

    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        const next = source[i + 1];

        if (inBlock) {
            if (c === '*' && next === '/') { inBlock = false; i++; }
            else if (c === '\n') out += '\n';
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

const SKIP_LINE = /^(import|export)\s|^['"]use strict['"];?$|^[{}()[\];,]+$|^(else|try|finally)\s*\{?$/;
const KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
    'return', 'function', 'class', 'extends', 'new', 'delete', 'typeof', 'instanceof', 'in',
    'of', 'this', 'super', 'null', 'undefined', 'true', 'false', 'const', 'let', 'var',
    'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield', 'static', 'get', 'set',
    'import', 'export', 'from', 'as'
]);

function loadLines() {
    const result = [];
    for (const file of walk(JS_ROOT)) {
        const raw = stripComments(fs.readFileSync(file, 'utf8'));
        const lines = raw.split(/\r?\n/);
        const normalized = [];
        const numbers = [];

        lines.forEach((line, index) => {
            const text = line.trim().replace(/\s+/g, ' ');
            if (!text || SKIP_LINE.test(text)) return;
            normalized.push(text);
            numbers.push(index + 1);
        });

        if (normalized.length >= MIN) result.push({ file: rel(file), lines: normalized, numbers });
    }
    return result;
}

function loadTokens() {
    const result = [];
    const tokenRe = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[^\s]/g;

    for (const file of walk(JS_ROOT)) {
        const raw = stripComments(fs.readFileSync(file, 'utf8'));
        const tokens = [];
        const lineAt = [];
        let line = 1;
        let lastIndex = 0;
        let match;

        while ((match = tokenRe.exec(raw)) !== null) {
            line += (raw.slice(lastIndex, match.index).match(/\n/g) || []).length;
            lastIndex = match.index;

            let token = match[0];
            if (/^[A-Za-z_$]/.test(token)) {
                token = KEYWORDS.has(token) ? token : 'ID';
            } else if (/^\d/.test(token)) {
                token = 'NUM';
            } else if (/^["'`]/.test(token)) {
                token = 'STR';
            }

            tokens.push(token);
            lineAt.push(line);
        }

        if (tokens.length >= MIN) result.push({ file: rel(file), tokens, lineAt });
    }
    return result;
}

const units = MODE === 'tokens' ? loadTokens() : loadLines();
const keyOf = (unit, index) => {
    if (MODE === 'tokens') return unit.tokens.slice(index, index + MIN).join(' ');
    return unit.lines.slice(index, index + MIN).join('\n');
};
const unitLength = (unit) => (MODE === 'tokens' ? unit.tokens.length : unit.lines.length);
const unitEquals = (a, ai, b, bi) => {
    if (MODE === 'tokens') return a.tokens[ai] === b.tokens[bi];
    return a.lines[ai] === b.lines[bi];
};

const buckets = new Map();
for (const unit of units) {
    const length = unitLength(unit);
    for (let i = 0; i + MIN <= length; i++) {
        const key = keyOf(unit, i);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({ unit, index: i });
    }
}

const blocks = new Map();

for (const positions of buckets.values()) {
    if (positions.length < 2 || positions.length > MAX_PER_HASH) continue;

    const anchor = positions[0];
    for (let p = 1; p < positions.length; p++) {
        const other = positions[p];
        if (anchor.unit === other.unit && anchor.index === other.index) continue;

        const a = anchor.unit;
        const b = other.unit;
        const aLen = unitLength(a);
        const bLen = unitLength(b);

        let before = 0;
        while (
            anchor.index - before - 1 >= 0 &&
            other.index - before - 1 >= 0 &&
            unitEquals(a, anchor.index - before - 1, b, other.index - before - 1)
        ) before++;

        let after = 0;
        while (
            anchor.index + MIN + after < aLen &&
            other.index + MIN + after < bLen &&
            unitEquals(a, anchor.index + MIN + after, b, other.index + MIN + after)
        ) after++;

        if (before > 0) continue; // блок будет найден по более раннему окну

        const startA = anchor.index;
        const startB = other.index;
        const length = MIN + after;
        if (length < MIN) continue;

        const key = `${a.file}:${startA}:${b.file}:${startB}:${length}`;
        blocks.set(key, { a, b, startA, startB, length });
    }
}

const list = [...blocks.values()].map((block) => {
    const aLine = MODE === 'tokens' ? block.a.lineAt[block.startA] : block.a.numbers[block.startA];
    const bLine = MODE === 'tokens' ? block.b.lineAt[block.startB] : block.b.numbers[block.startB];
    return { ...block, aLine, bLine };
}).sort((x, y) => y.length - x.length).slice(0, TOP);

// Сводка: сколько уникальных строк/токенов реально попало в дубли.
const uniqueUnits = new Set();
const perFile = new Map();
let crossFile = 0;
let sameFile = 0;

for (const block of blocks.values()) {
    if (block.a.file !== block.b.file) crossFile++;
    else sameFile++;

    for (const { unit, start } of [{ unit: block.a, start: block.startA }, { unit: block.b, start: block.startB }]) {
        for (let i = start; i < start + block.length; i++) {
            uniqueUnits.add(`${unit.file}:${i}`);
            perFile.set(unit.file, (perFile.get(unit.file) || 0) + 1);
        }
    }
}

if (list.length === 0) {
    console.log(`Дубликатов не найдено (mode=${MODE}, min=${MIN}).`);
    process.exit(0);
}

const totalUnits = MODE === 'tokens'
    ? units.reduce((sum, unit) => sum + unit.tokens.length, 0)
    : walk(JS_ROOT).reduce((sum, file) => sum + fs.readFileSync(file, 'utf8').split(/\r?\n/).length, 0);
const unitName = MODE === 'tokens' ? 'токенов' : 'строк';

console.log(`Дубликаты: mode=${MODE}, min=${MIN}`);
console.log(`Блоков: ${blocks.size} (межфайловых ${crossFile}, внутри файла ${sameFile})`);
console.log(`Уникальных ${unitName} в дублях: ${uniqueUnits.size} из ${totalUnits} (${(uniqueUnits.size / totalUnits * 100).toFixed(1)}%)`);
console.log(`Показано: ${list.length}\n`);

const topFiles = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('Файлы с наибольшим дублированием:');
for (const [file, count] of topFiles) console.log(`  ${String(count).padStart(6)}  ${file}`);
console.log('');

for (const block of list) {
    const unit = MODE === 'tokens' ? 'токенов' : 'строк';
    console.log(`${String(block.length).padStart(4)} ${unit}`);
    console.log(`  ${block.a.file}:${block.aLine}`);
    console.log(`  ${block.b.file}:${block.bLine}`);
    console.log('');
}
