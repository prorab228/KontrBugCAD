/**
 * Сколько даёт аналитический якобиан: hybrid (аналитика) vs numerical (FD).
 *
 * Запуск: node --no-warnings tests/solver/perf-jacobian.mjs
 * Не входит в npm run check (числа зависят от машины).
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
const C = await import('../../js/tools/sketch/constraints/SketchConstraint.js');
const { LineEntity } = await import('../../js/tools/sketch/entities/LineEntity.js');
const { PointEntity } = await import('../../js/tools/sketch/entities/PointEntity.js');
const { ArcEntity } = await import('../../js/tools/sketch/entities/ArcEntity.js');

const v3 = (x, y) => new THREE.Vector3(x, y, 0);
function rng(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/** Лесенка: все ограничения с аналитическими градиентами. */
function buildStair(N, jitter = 1.5, seed = 3) {
    const r = rng(seed);
    const lines = [];
    let x = 0, y = 0;
    for (let i = 0; i < N; i++) {
        let nx = x, ny = y;
        if (i % 2 === 0) nx = x + 10; else ny = y + 10;
        const j = () => (r() - 0.5) * 2 * jitter;
        lines.push({ line: new LineEntity({ start: v3(x + j(), y + j()), end: v3(nx + j(), ny + j()) }), horizontal: i % 2 === 0 });
        x = nx; y = ny;
    }
    const constraints = [];
    for (let i = 0; i < N - 1; i++) constraints.push(new C.CoincidentConstraint(lines[i].line, 'end', lines[i + 1].line, 'start'));
    for (const { line: l, horizontal } of lines) constraints.push(horizontal ? new C.HorizontalConstraint(l) : new C.VerticalConstraint(l));
    for (let i = 1; i < Math.min(4, N); i++) constraints.push(new C.DistanceConstraint(lines[i].line, 'length', 10));
    const anchor = new PointEntity({ x: 0, y: 0 });
    constraints.push(new C.CoincidentConstraint(lines[0].line, 'start', anchor, null));
    return { constraints, fixed: [anchor] };
}

/**
 * Цепочка линий с угловыми размерами: AngleConstraint.gradient() === null,
 * то есть аналитики нет ни при каком режиме — контрольный сценарий.
 */
function buildAngles(N, seed = 4) {
    const r = rng(seed);
    const lines = [];
    let angle = 0, x = 0, y = 0;
    for (let i = 0; i < N; i++) {
        angle += 0.35 + (r() - 0.5) * 0.2;
        const nx = x + Math.cos(angle) * 10, ny = y + Math.sin(angle) * 10;
        lines.push({ line: new LineEntity({ start: v3(x, y), end: v3(nx, ny) }), angle });
        x = nx; y = ny;
    }
    const constraints = [];
    for (let i = 0; i < N - 1; i++) constraints.push(new C.CoincidentConstraint(lines[i].line, 'end', lines[i + 1].line, 'start'));
    for (let i = 1; i < N; i++) constraints.push(new C.AngleConstraint(lines[i - 1].line, lines[i].line, 45));
    const anchor = new PointEntity({ x: 0, y: 0 });
    constraints.push(new C.CoincidentConstraint(lines[0].line, 'start', anchor, null));
    return { constraints, fixed: [anchor] };
}

/** Дуги с arc_angle (градиент тоже null). */
function buildArcs(N, seed = 5) {
    const r = rng(seed);
    const arcs = [];
    for (let i = 0; i < N; i++) {
        arcs.push(new ArcEntity({
            center: v3(i * 20, (r() - 0.5) * 4), radius: 10 + r(),
            startAngle: 0.1 + (r() - 0.5) * 0.3, endAngle: 1.5 + (r() - 0.5) * 0.3
        }));
    }
    const constraints = [];
    for (const a of arcs) constraints.push(new C.ArcAngleConstraint(a, Math.PI / 2));
    const anchor = new PointEntity({ x: 0, y: 0 });
    constraints.push(new C.CoincidentConstraint(arcs[0], 'center', anchor, null));
    return { constraints, fixed: [anchor] };
}

function measureOnce(build, mode, { maxIter = 100, alpha = 1 } = {}) {
    // одинаковый старт: сценарий собирается заново
    const s = build();
    const solver = new NewtonSolver({ IterationTimeOut: 0, jacobianMode: mode });
    let fd = 0;
    const origFd = NewtonSolver.prototype._computeFiniteDifference;
    NewtonSolver.prototype._computeFiniteDifference = function (...a) { fd++; return origFd.apply(this, a); };
    try {
        const t0 = performance.now();
        const res = solver.solveConstraintSet(s.constraints, s.fixed, maxIter, 1e-6, alpha);
        const ms = performance.now() - t0;
        return { ms, iter: res.iterUsed, res: res.maxResidual, fd };
    } finally {
        NewtonSolver.prototype._computeFiniteDifference = origFd;
    }
}

const median = (arr) => {
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
};

/**
 * Честный замер: оба режима прогреваются, затем 6 чередующихся прогонов
 * (h,n,n,h,h,n), берётся медиана — иначе второй режим получает тёплый JIT.
 */
function measureBoth(build, opts = {}) {
    measureOnce(build, 'hybrid', opts);
    measureOnce(build, 'numerical', opts);
    measureOnce(build, 'numerical', opts);
    measureOnce(build, 'hybrid', opts);

    const h = [], n = [];
    let iterH = 0, iterN = 0, fdH = 0, fdN = 0, resH = 0, resN = 0;
    for (const mode of ['hybrid', 'numerical', 'numerical', 'hybrid', 'hybrid', 'numerical']) {
        const r = measureOnce(build, mode, opts);
        if (mode === 'hybrid') {
            h.push(r.ms); iterH = r.iter; fdH = r.fd; resH = r.res;
        } else {
            n.push(r.ms); iterN = r.iter; fdN = r.fd; resN = r.res;
        }
    }
    return {
        hybrid: { ms: +median(h).toFixed(1), iter: iterH, res: resH, fd: fdH },
        numerical: { ms: +median(n).toFixed(1), iter: iterN, res: resN, fd: fdN }
    };
}

const rows = [];
for (const N of [20, 80, 160, 320, 500]) {
    const r = measureBoth(() => buildStair(N));
    rows.push({ scenario: `stair-${N}`, nFree: 4 * N, ...r, speedup: +(r.numerical.ms / r.hybrid.ms).toFixed(2) });
}
for (const N of [20, 60]) {
    const r = measureBoth(() => buildAngles(N));
    rows.push({ scenario: `angles-${N}`, nFree: 4 * N, ...r, speedup: +(r.numerical.ms / r.hybrid.ms).toFixed(2) });
}
for (const N of [20, 60]) {
    const r = measureBoth(() => buildArcs(N));
    rows.push({ scenario: `arcs-${N}`, nFree: 5 * N, ...r, speedup: +(r.numerical.ms / r.hybrid.ms).toFixed(2) });
}

console.log('сценарий      | nFree | hybrid (аналитика) | numerical (FD) | ускорение | FD-вызовов hybrid/numerical');
console.log('--------------|-------|--------------------|----------------|-----------|-------------------------------');
for (const r of rows) {
    console.log(
        r.scenario.padEnd(13) + ' | ' + String(r.nFree).padStart(5) + ' | ' +
        `${r.hybrid.ms} мс / ${r.hybrid.iter} итер.`.padEnd(18) + ' | ' +
        `${r.numerical.ms} мс / ${r.numerical.iter} итер.`.padEnd(14) + ' | ' +
        ('×' + r.speedup).padStart(9) + ' | ' +
        `${r.hybrid.fd} / ${r.numerical.fd}`
    );
}

// DOF-анализ: аналитический якобиан против численного (медиана из 5, чередуя)
console.log('\nanalyzeDOF (аналитика vs FD):');
for (const N of [80, 160]) {
    const s = buildStair(N);
    const run = (mode) => {
        const solver = new NewtonSolver({ IterationTimeOut: 0, jacobianMode: mode });
        solver.analyzeDOF(s.constraints, s.fixed); // прогрев
        const t0 = performance.now();
        solver.analyzeDOF(s.constraints, s.fixed);
        return performance.now() - t0;
    };
    const A = [], Nn = [];
    for (let i = 0; i < 5; i++) {
        A.push(run('hybrid'));
        Nn.push(run('numerical'));
    }
    const msA = median(A), msN = median(Nn);
    console.log(`  N=${N}: analytic ${msA.toFixed(1)} мс, FD ${msN.toFixed(1)} мс, ускорение ×${(msN / msA).toFixed(1)}`);
}

// Только построение якобиана для DOF: аналитика против построчного FD
// (jacobianMode: 'numerical'). Медиана из 5 прогонов.
console.log('\nякобиан для DOF: аналитический vs построчный FD (медиана 5):');
for (const N of [80, 160, 320]) {
    const s = buildStair(N);
    const solver = new NewtonSolver({ IterationTimeOut: 0 });
    const sys = solver._buildParameterSystem(s.constraints, s.fixed);
    const scale = solver._computeScaling(sys.paramValues, sys.freeParams);
    const oldT = [], newT = [];
    solver._buildAnalyticJacobian(s.constraints, sys, scale);
    for (let i = 0; i < 5; i++) {
        solver.jacobianMode = 'numerical';
        let t = performance.now();
        solver._buildAnalyticJacobian(s.constraints, sys, scale);
        oldT.push(performance.now() - t);
        solver.jacobianMode = 'hybrid';
        t = performance.now();
        solver._buildAnalyticJacobian(s.constraints, sys, scale);
        newT.push(performance.now() - t);
    }
    const o = median(oldT), n = median(newT);
    console.log(`  N=${N} (nFree=${sys.freeParams.length}): FD ${o.toFixed(1)} мс, аналитика ${n.toFixed(1)} мс, ×${(o / n).toFixed(1)}`);
}
