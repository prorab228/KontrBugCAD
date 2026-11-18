/**
 * ESM-хук разрешения «голых» спецификаторов КонтрCAD для запуска модулей
 * редактора в Node без браузера (регрессионные тесты решателя).
 *
 * Карта повторяет importmap из test-artifacts/e2e/unit.html:
 *   three            → lib/three@0.185.1/build/three.module.js
 *   three/addons/*   → lib/three@0.185.1/examples/jsm/*
 *   core/…           → js/core/…
 *   generators/…     → js/generators/…
 *   tools/…          → js/tools/…
 *   utils/…          → js/utils/…
 *   lib/…            → lib/…
 *
 * Подключается через module.register() из scripts/check-solver.mjs.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const THREE_VERSION = 'three@0.185.1';

const PREFIXES = [
    ['core/', 'js/core/'],
    ['generators/', 'js/generators/'],
    ['tools/', 'js/tools/'],
    ['utils/', 'js/utils/'],
    ['lib/', 'lib/']
];

export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
        return {
            url: pathToFileURL(path.join(ROOT, 'lib', THREE_VERSION, 'build', 'three.module.js')).href,
            shortCircuit: true
        };
    }
    if (specifier.startsWith('three/addons/')) {
        return {
            url: pathToFileURL(path.join(ROOT, 'lib', THREE_VERSION, 'examples', 'jsm', specifier.slice('three/addons/'.length))).href,
            shortCircuit: true
        };
    }
    for (const [prefix, target] of PREFIXES) {
        if (specifier.startsWith(prefix)) {
            return {
                url: pathToFileURL(path.join(ROOT, target, specifier.slice(prefix.length))).href,
                shortCircuit: true
            };
        }
    }
    return nextResolve(specifier, context);
}
