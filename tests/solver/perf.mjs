/**
 * Замеры производительности решателя (не входит в npm run check).
 *
 * Запуск: node --no-warnings tests/solver/perf.mjs
 * Печатает время solve и число итераций по размерам эскиза + время analyzeDOF.
 */
import { register } from 'node:module';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const ctx2d = new Proxy({}, { get: (t, p) => p === 'measureText' ? () => ({ width: 10 }) : () => {}, set: () => true });
const el = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {}, getContext: () => ctx2d, width: 0, height: 0, querySelector: () => null, getBoundingClientRect: () => ({ width: 10, height: 10, left: 0, top: 0 }) });
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 1600, innerHeight: 900, addEventListener() {}, getComputedStyle: () => ({}) };
globalThis.document = { createElement: el, body: el(), documentElement: el(), addEventListener() {}, querySelector: () => null, getElementById: () => null };
globalThis.getComputedStyle = () => ({});
register('../../scripts/lib/bare-specifier-hooks.mjs', import.meta.url);

const THREE = await import('three');
const { NewtonSolver } = await import('../../js/tools/sketch/constraints/NewtonSolver.js');
const { HorizontalConstraint, VerticalConstraint, CoincidentConstraint, DistanceConstraint } = await import('../../js/tools/sketch/constraints/SketchConstraint.js');
const { LineEntity } = await import('../../js/tools/sketch/entities/LineEntity.js');
const { PointEntity } = await import('../../js/tools/sketch/entities/PointEntity.js');

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const v3 = (x, y) => new THREE.Vector3(x, y, 0);

function buildStair(N, jitter = 1.5, seed = 3, step = 10) {
    const r = rng(seed);
    const lines = [];
    let x = 0, y = 0;
    for (let i = 0; i < N; i++) {
        let nx = x, ny = y;
        if (i % 2 === 0) nx = x + step; else ny = y + step;
        const j = () => (r() - 0.5) * 2 * jitter;
        lines.push({ line: new LineEntity({ start: v3(x + j(), y + j()), end: v3(nx + j(), ny + j()) }), horizontal: i % 2 === 0 });
        x = nx; y = ny;
    }
    const constraints = [];
    for (let i = 0; i < N - 1; i++) constraints.push(new CoincidentConstraint(lines[i].line, 'end', lines[i + 1].line, 'start'));
    for (const { line: l, horizontal } of lines) constraints.push(horizontal ? new HorizontalConstraint(l) : new VerticalConstraint(l));
    for (let i = 1; i < Math.min(4, N); i++) constraints.push(new DistanceConstraint(lines[i].line, 'length', step));
    const anchor = new PointEntity({ x: 0, y: 0 });
    constraints.push(new CoincidentConstraint(lines[0].line, 'start', anchor, null));
    return { entities: [...lines.map(l => l.line), anchor], constraints, fixed: [anchor] };
}

function timeSolve(N, { maxIter = 100, alpha = 1 } = {}) {
    const s = buildStair(N);
    const solver = new NewtonSolver({ IterationTimeOut: 0 });
    // прогрев
    const warm = buildStair(N);
    new NewtonSolver({ IterationTimeOut: 0 }).solveConstraintSet(warm.constraints, warm.fixed, maxIter, 1e-6, alpha);
    const t0 = performance.now();
    const r = solver.solveConstraintSet(s.constraints, s.fixed, maxIter, 1e-6, alpha);
    const ms = performance.now() - t0;
    return { N, nFree: 4 * N, ms: +ms.toFixed(1), iter: r.iterUsed, res: r.maxResidual, converged: r.converged };
}

console.log('solve (лесенка + якорь):');
for (const N of [20, 40, 80, 120, 160, 240, 320]) {
    const row = timeSolve(N);
    console.log(`  N=${String(row.N).padStart(3)}  nFree=${String(row.nFree).padStart(4)}  ${String(row.ms).padStart(7)} мс  iter=${String(row.iter).padStart(2)}  res=${row.res.toExponential(2)}  ${row.converged ? 'ok' : 'НЕ СОШЁЛСЯ'}`);
}

console.log('\nбольшие эскизы (nFree >= 2000):');
for (const N of [500, 600]) {
    const row = timeSolve(N, { maxIter: 50 });
    console.log(`  N=${String(row.N).padStart(3)}  nFree=${String(row.nFree).padStart(4)}  ${String(row.ms).padStart(7)} мс  iter=${String(row.iter).padStart(2)}  res=${row.res.toExponential(2)}  ${row.converged ? 'ok' : 'НЕ СОШЁЛСЯ'}`);
}

console.log('\nanalyzeDOF:');
for (const N of [40, 80, 160]) {
    const s = buildStair(N);
    const solver = new NewtonSolver({ IterationTimeOut: 0 });
    const t0 = performance.now();
    const a = solver.analyzeDOF(s.constraints, s.fixed);
    console.log(`  N=${String(N).padStart(3)}  nFree=${String(a.nFreeParams).padStart(4)}  ${(performance.now() - t0).toFixed(0).padStart(6)} мс  dof=${a.dof} rank=${a.rankJ} m=${a.m}`);
}
