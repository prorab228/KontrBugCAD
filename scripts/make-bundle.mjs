// scripts/make-bundle.mjs
// Собирает kontrcad-web-bundle.zip (+ .sha256) локально, БЕЗ изменения рабочего дерева.
//
// Зачем: build.js обфусцирует js/ прямо на месте — запускать его в репозитории нельзя,
// исходники превратятся в обфусцированный код. Скрипт делает копию во .bundle-build/,
// гоняет build.js там и кладёт готовые файлы в dist/.
//
// Запуск:  node scripts/make-bundle.mjs
// Стоимость: 0 минут Actions. Время: ~1–2 мин (обфускация 279 файлов).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staging = path.join(root, '.bundle-build');

const FILES = ['index.html', 'config.js', 'manifest.json'];
const DIRS = ['js', 'css', 'lib', 'models', 'fonts', 'images'];

// --- 1. чистая копия
console.log('🧹 Готовим staging:', path.relative(root, staging));
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

for (const f of FILES) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.error(`❌ Нет обязательного файла: ${f}`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(staging, f));
}
for (const d of DIRS) {
  const src = path.join(root, d);
  if (!fs.existsSync(src)) {
    if (d === 'images') continue; // необязательная
    console.error(`❌ Нет обязательной папки: ${d}`);
    process.exit(1);
  }
  fs.cpSync(src, path.join(staging, d), { recursive: true });
}

// --- 2. build.js в staging (cwd = staging, поэтому ./js и ./dist — там)
// require('archiver') и т.п. найдёт node_modules уровнем выше.
console.log('🔐 Обфускация + упаковка (build.js)...');
execFileSync(process.execPath, [path.join(root, 'build.js')], { cwd: staging, stdio: 'inherit' });

// --- 3. результат в dist/
const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });

const zipName = 'kontrcad-web-bundle.zip';
const srcZip = path.join(staging, 'dist', zipName);
const srcSha = `${srcZip}.sha256`;

if (!fs.existsSync(srcZip)) {
  console.error('❌ build.js не создал', zipName);
  process.exit(1);
}
const outZip = path.join(outDir, zipName);
fs.copyFileSync(srcZip, outZip);
if (fs.existsSync(srcSha)) fs.copyFileSync(srcSha, `${outZip}.sha256`);

const mb = (fs.statSync(outZip).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ Готово: ${path.relative(root, outZip)} (${mb} МБ)`);
if (fs.existsSync(`${outZip}.sha256`)) {
  console.log(`🔑 SHA-256: ${fs.readFileSync(`${outZip}.sha256`, 'utf8').trim()}`);
}
console.log('   Дальше — загрузить этот zip в Capgo (plugin.capgo.app).');
