#!/usr/bin/env node
/**
 * Перенос модулей по раскладке (layout) с переписыванием импортов.
 *
 * Раскладка — JSON:
 *   { "moves": [ { "from": "js/utils/helpers/DimensionPen.js", "to": "js/ui/gizmo/DimensionPen.js" } ] }
 *
 * Что делает скрипт:
 *   1) переносит файлы через git mv (история сохраняется);
 *   2) у переехавших файлов пересчитывает относительные импорты;
 *   3) переводит алиасы (utils/…, core/…) на новые пути, если цель переехала;
 *   4) удаляет опустевшие каталоги;
 *   5) проверяет, что ссылок на старые пути не осталось.
 *
 * Повторный запуск безопасен: уже перенесённые файлы пропускаются,
 * переписанные импорты не меняются.
 *
 * Запуск:
 *   node scripts/move-modules.mjs --dry-run
 *   node scripts/move-modules.mjs
 *   node scripts/move-modules.mjs --layout=scripts/layouts/utils-to-layers.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

const layoutArg = process.argv.find(a => a.startsWith('--layout='));
const layoutPath = path.resolve(ROOT, layoutArg ? layoutArg.split('=')[1] : 'scripts/layouts/utils-to-layers.json');

const toPosix = (p) => p.replace(/\\/g, '/');

/** Алиасы из importmap (index.html и test-artifacts/e2e/unit.html). */
const ALIASES = [
    ['core/', 'js/core/'],
    ['utils/', 'js/utils/'],
    ['tools/', 'js/tools/'],
    ['generators/', 'js/generators/']
];

const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
const FILES = layout.moves.map(m => ({ from: m.from, to: m.to }));

if (FILES.length === 0) {
    console.error('❌ Пустая раскладка');
    process.exit(1);
}

const moveMap = new Map(FILES.map(({ from, to }) => [from, to]));
const reverseMap = new Map([...moveMap].map(([from, to]) => [to, from]));

function walk(dir, filter, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, filter, out);
        else if (filter(entry.name)) out.push(full);
    }
    return out;
}

// ---------- 1. Перенос файлов ----------
const movedLog = [];
for (const { from, to } of FILES) {
    const absFrom = path.join(ROOT, from);
    const absTo = path.join(ROOT, to);

    if (!fs.existsSync(absFrom) && fs.existsSync(absTo)) {
        movedLog.push(`уже перенесён: ${to}`);
        continue;
    }
    if (!fs.existsSync(absFrom)) {
        console.error(`❌ нет файла: ${from}`);
        process.exit(1);
    }

    movedLog.push(`${from} → ${to}`);
    if (DRY_RUN) continue;

    fs.mkdirSync(path.dirname(absTo), { recursive: true });
    try {
        execFileSync('git', ['mv', from, to], { cwd: ROOT, stdio: 'pipe' });
    } catch {
        fs.renameSync(absFrom, absTo);
    }
}

// ---------- 1b. Удаление опустевших каталогов ----------
const dirsToCheck = [...new Set(FILES.map(({ from }) => path.dirname(from)))].sort((a, b) => b.length - a.length);

for (const dir of dirsToCheck) {
    let abs = path.join(ROOT, dir);
    while (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.readdirSync(abs).length === 0) {
        movedLog.push(`удалён пустой каталог: ${toPosix(path.relative(ROOT, abs))}`);
        if (!DRY_RUN) fs.rmdirSync(abs);
        abs = path.dirname(abs);
    }
}

// ---------- 2. Переписывание импортов ----------
const IMPORT_RE = /((?:from\s*|import\s*\(\s*|import\s+)['"])([^'"]+)(['"])/g;

function resolveSpecifier(spec, importerPath) {
    if (spec.startsWith('.')) {
        // Приводим к пути относительно корня репозитория — карта переносов ключуется ими.
        const abs = path.resolve(ROOT, path.dirname(importerPath), spec);
        return toPosix(path.relative(ROOT, abs));
    }
    for (const [alias, base] of ALIASES) {
        if (spec.startsWith(alias)) return base + spec.slice(alias.length);
    }
    return null; // bare-импорт (three, config, lib/…)
}

function buildSpecifier(targetPath, importerNewPath, originalSpec) {
    // Предпочитаем алиас, если им уже пользовались и он всё ещё покрывает цель.
    for (const [alias, base] of ALIASES) {
        if (originalSpec.startsWith(alias) && targetPath.startsWith(base)) {
            return alias + targetPath.slice(base.length);
        }
    }
    if (!originalSpec.startsWith('.') && targetPath.startsWith('js/core/')) {
        return 'core/' + targetPath.slice('js/core/'.length);
    }

    let rel = toPosix(path.relative(path.dirname(importerNewPath), targetPath));
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}

const filesToRewrite = [
    ...walk(path.join(ROOT, 'js'), name => name.endsWith('.js')),
    path.join(ROOT, 'test-artifacts/e2e/unit.html')
].filter(p => fs.existsSync(p));

const rewriteLog = new Map();

for (const absFile of filesToRewrite) {
    const newRel = toPosix(path.relative(ROOT, absFile));
    const oldRel = reverseMap.get(newRel) || newRel;
    const absNew = path.join(ROOT, newRel);
    if (!fs.existsSync(absNew)) continue;

    const source = fs.readFileSync(absNew, 'utf8');
    const changed = [];

    const updated = source.replace(IMPORT_RE, (match, prefix, spec, quote) => {
        const resolvedOld = resolveSpecifier(spec, oldRel);
        if (!resolvedOld) return match;

        const targetMoved = moveMap.has(resolvedOld);
        const importerMoved = oldRel !== newRel;
        if (!targetMoved && !(importerMoved && spec.startsWith('.'))) return match;

        const mapped = moveMap.get(resolvedOld) || resolvedOld;
        const nextSpec = buildSpecifier(mapped, newRel, spec);
        if (nextSpec === spec) return match;

        changed.push(`${spec} → ${nextSpec}`);
        return `${prefix}${nextSpec}${quote}`;
    });

    if (changed.length === 0) continue;

    rewriteLog.set(newRel, changed);
    if (!DRY_RUN) fs.writeFileSync(absNew, updated, 'utf8');
}

// ---------- 3. Отчёт ----------
console.log(`\nРаскладка: ${toPosix(path.relative(ROOT, layoutPath))}`);
console.log(`\nПеренос (${movedLog.length}):`);
for (const line of movedLog) console.log('  ' + line);

const totalRewrites = [...rewriteLog.values()].reduce((n, c) => n + c.length, 0);
console.log(`\nПереписано импортов: ${totalRewrites} в ${rewriteLog.size} файлах`);
if (process.argv.includes('--verbose')) {
    for (const [file, changes] of rewriteLog) {
        console.log(`  ${file}`);
        for (const change of changes) console.log(`      ${change}`);
    }
}

if (DRY_RUN) {
    console.log('\n(dry-run: файлы не изменены)');
    process.exit(0);
}

// ---------- 4. Самопроверка: не осталось ли ссылок на старые пути ----------
const leftovers = [];
for (const absFile of walk(path.join(ROOT, 'js'), name => name.endsWith('.js'))) {
    const rel = toPosix(path.relative(ROOT, absFile));
    const source = fs.readFileSync(absFile, 'utf8');
    let match;
    const re = /(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
    while ((match = re.exec(source)) !== null) {
        const resolved = resolveSpecifier(match[1], rel);
        if (resolved && moveMap.has(resolved)) leftovers.push(`${rel}: ${match[1]}`);
    }
}

if (leftovers.length > 0) {
    console.error('\n❌ Остались ссылки на старые пути:');
    for (const line of leftovers) console.error('   ' + line);
    process.exit(1);
}

console.log('\n✅ Модули перенесены, ссылок на старые пути нет. Проверьте: npm run check');
