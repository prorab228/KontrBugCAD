#!/usr/bin/env node
/**
 * Точечная замена диапазонов строк по манифесту — для крупных вырезаний копипасты,
 * где литерал old_string в редакторе был бы нечитаемым.
 *
 * Манифест (JSON):
 * {
 *   "edits": [
 *     {
 *       "file": "js/foo.js",
 *       "startLine": 121,
 *       "endLine": 256,
 *       "expectStart": "уникальная подстрока строки startLine",  // защита от сдвига
 *       "expectEnd": "подстрока строки endLine",                 // опционально
 *       "text": "чем заменить диапазон (без завершающего \\n; '' — удалить)"
 *     }
 *   ]
 * }
 *
 * Замены в одном файле применяются снизу вверх, чтобы номера строк не сдвигались.
 * При несовпадении expect* скрипт падает и ничего не пишет.
 *
 * Запуск: node scripts/apply-edits.mjs scripts/edits.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = process.argv[2];
if (!manifestPath) {
    console.error('usage: node scripts/apply-edits.mjs <manifest.json>');
    process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const edits = manifest.edits || [];

const byFile = new Map();
for (const edit of edits) {
    if (!byFile.has(edit.file)) byFile.set(edit.file, []);
    byFile.get(edit.file).push(edit);
}

const errors = [];
const pending = [];

for (const [file, fileEdits] of byFile) {
    const abs = path.resolve(ROOT, file);
    const raw = fs.readFileSync(abs, 'utf8');
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r?\n/);

    for (const edit of fileEdits) {
        const startIdx = edit.startLine - 1;
        const endIdx = edit.endLine - 1;

        if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
            errors.push(`${file}: неверный диапазон ${edit.startLine}..${edit.endLine} (строк: ${lines.length})`);
            continue;
        }
        if (edit.expectStart && !lines[startIdx].includes(edit.expectStart)) {
            errors.push(`${file}:${edit.startLine} не найдено "${edit.expectStart}", там: "${lines[startIdx].trim()}"`);
            continue;
        }
        if (edit.expectEnd && !lines[endIdx].includes(edit.expectEnd)) {
            errors.push(`${file}:${edit.endLine} не найдено "${edit.expectEnd}", там: "${lines[endIdx].trim()}"`);
            continue;
        }
    }

    pending.push({ file, abs, edits: fileEdits, lines, eol });
}

if (errors.length > 0) {
    console.error('❌ Манифест не применён:');
    for (const err of errors) console.error('   ' + err);
    process.exit(1);
}

for (const item of pending) {
    let lines = item.lines;

    for (const edit of [...item.edits].sort((a, b) => b.startLine - a.startLine)) {
        const replacement = edit.text === '' ? [] : edit.text.split('\n');
        lines = [
            ...lines.slice(0, edit.startLine - 1),
            ...replacement,
            ...lines.slice(edit.endLine)
        ];
        console.log(`✂️  ${item.file}: ${edit.startLine}..${edit.endLine} → ${replacement.length} строк`);
    }

    fs.writeFileSync(item.abs, lines.join(item.eol), 'utf8');
}
