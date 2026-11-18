/**
 * Регрессионная сетка решателя ограничений эскиза (этап 0 аудита).
 *
 * Каждый сценарий — самостоятельная функция, которая:
 *   • строит эскиз из РЕАЛЬНЫХ сущностей (LineEntity, CircleEntity, ArcEntity,
 *     OvalEntity, PointEntity) и реальных ограничений из SketchConstraint.js;
 *   • запускает NewtonSolver;
 *   • возвращает набор проверок (ok/detail) и метрики для эталона.
 *
 * Запускается из scripts/check-solver.mjs (Node, без браузера, через
 * scripts/lib/bare-specifier-hooks.mjs). Результат — простой JSON, чтобы его
 * можно было сравнивать с test-artifacts/solver/baseline.json.
 *
 * ВАЖНО: сценарии детерминированы (фиксированный seed, фиксированный порядок
 * ограничений, отключённый wall-clock таймаут через IterationTimeOut: 1e9).
 */
import * as THREE from 'three';
import { NewtonSolver } from '../../js/tools/sketch/constraints/NewtonSolver.js';
import {
    HorizontalConstraint, VerticalConstraint, CoincidentConstraint, DistanceConstraint,
    FixedConstraint, CircleCircleTangentConstraint, PointOnCurveConstraint, ArcAngleConstraint,
    ParallelConstraint, PerpendicularConstraint, TwoPointDistanceConstraint, AngleConstraint,
    PointLineDistanceConstraint, PointOnLineConstraint, PointToMidpointConstraint,
    EqualityConstraint, TangentConstraint, SymmetryConstraint
} from '../../js/tools/sketch/constraints/SketchConstraint.js';
import { LineEntity } from '../../js/tools/sketch/entities/LineEntity.js';
import { CircleEntity } from '../../js/tools/sketch/entities/CircleEntity.js';
import { ArcEntity } from '../../js/tools/sketch/entities/ArcEntity.js';
import { OvalEntity } from '../../js/tools/sketch/entities/OvalEntity.js';
import { PointEntity } from '../../js/tools/sketch/entities/PointEntity.js';
import { SketchConstraintManager } from '../../js/tools/sketch/managers/SketchConstraintManager.js';
import { ConstraintAnalyzer } from '../../js/tools/sketch/constraints/ConstraintAnalyzer.js';

const NO_TIMEOUT = { IterationTimeOut: 1e9 };
const EPS = 1e-6;

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательное
// ─────────────────────────────────────────────────────────────────────────────

/** Детерминированный ГПСЧ (mulberry32). */
function rng(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const v3 = (x, y) => new THREE.Vector3(x, y, 0);
const line = (a, b) => new LineEntity({ start: v3(a[0], a[1]), end: v3(b[0], b[1]) });
const point = (x, y) => new PointEntity({ x, y });

/** Максимальная невязка «как в жизни» (по всем уравнениям). */
function maxResidual(constraints) {
    let m = 0;
    for (const c of constraints) {
        const n = typeof c.getEquationCount === 'function' ? c.getEquationCount() : 1;
        for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(c.error(i)));
    }
    return m;
}

const snapshot = (entities) => entities.map(e => ({ ...e.params }));

function maxParamDiff(a, b) {
    let d = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        for (const k of Object.keys(a[i])) d = Math.max(d, Math.abs((a[i][k] ?? 0) - (b[i][k] ?? 0)));
    }
    return d;
}

const lineLength = (l) => Math.hypot(l.params.endX - l.params.startX, l.params.endY - l.params.startY);

function unitDir(l) {
    const dx = l.params.endX - l.params.startX;
    const dy = l.params.endY - l.params.startY;
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
}

/** |cos| между направлениями линий (0 = перпендикуляр). */
function absCos(l1, l2) {
    const a = unitDir(l1), b = unitDir(l2);
    return Math.abs(a[0] * b[0] + a[1] * b[1]);
}

function solveScenario({ constraints, fixed = [], maxIter = 100, tolerance = 1e-6, alpha = 1, solverOptions = {} }) {
    const solver = new NewtonSolver({ ...NO_TIMEOUT, ...solverOptions });
    const t0 = performance.now();
    const result = solver.solveConstraintSet(constraints, fixed, maxIter, tolerance, alpha);
    const ms = performance.now() - t0;
    return { solver, result, ms };
}

// ─────────────────────────────────────────────────────────────────────────────
// Построители сценариев
// ─────────────────────────────────────────────────────────────────────────────

/** Прямоугольник 50×30 с дрожанием вершин; 4 линии, H/V, 4 совпадения, 2 размера. */
function buildRect({ jitter = 2, seed = 7, dims = true } = {}) {
    const r = rng(seed);
    const j = () => (r() - 0.5) * 2 * jitter;
    const a = v3(0 + j(), 0 + j());
    const b = v3(50 + j(), 0 + j());
    const c = v3(50 + j(), 30 + j());
    const d = v3(0 + j(), 30 + j());
    const l1 = new LineEntity({ start: a, end: b });
    const l2 = new LineEntity({ start: b.clone(), end: c });
    const l3 = new LineEntity({ start: c.clone(), end: d });
    const l4 = new LineEntity({ start: d.clone(), end: a.clone() });
    const constraints = [
        new HorizontalConstraint(l1), new HorizontalConstraint(l3),
        new VerticalConstraint(l2), new VerticalConstraint(l4),
        new CoincidentConstraint(l1, 'end', l2, 'start'),
        new CoincidentConstraint(l2, 'end', l3, 'start'),
        new CoincidentConstraint(l3, 'end', l4, 'start'),
        new CoincidentConstraint(l4, 'end', l1, 'start')
    ];
    if (dims) {
        constraints.push(new DistanceConstraint(l1, 'length', 50));
        constraints.push(new DistanceConstraint(l2, 'length', 30));
    }
    return { entities: [l1, l2, l3, l4], constraints, fixed: [] };
}

/** Лесенка из N отрезков + закреплённый якорь в (0,0). */
function buildStair(N, { jitter = 1.5, seed = 3, step = 10 } = {}) {
    const r = rng(seed);
    const lines = [];
    let x = 0, y = 0;
    for (let i = 0; i < N; i++) {
        let nx = x, ny = y;
        if (i % 2 === 0) nx = x + step; else ny = y + step;
        const j = () => (r() - 0.5) * 2 * jitter;
        lines.push({ line: line([x + j(), y + j()], [nx + j(), ny + j()]), horizontal: i % 2 === 0 });
        x = nx; y = ny;
    }
    const constraints = [];
    for (let i = 0; i < N - 1; i++) {
        constraints.push(new CoincidentConstraint(lines[i].line, 'end', lines[i + 1].line, 'start'));
    }
    for (const { line: l, horizontal } of lines) {
        constraints.push(horizontal ? new HorizontalConstraint(l) : new VerticalConstraint(l));
    }
    for (let i = 1; i < Math.min(4, N); i++) {
        constraints.push(new DistanceConstraint(lines[i].line, 'length', step));
    }
    const anchor = point(0, 0);
    constraints.push(new CoincidentConstraint(lines[0].line, 'start', anchor, null));
    return { entities: [...lines.map(l => l.line), anchor], constraints, fixed: [anchor] };
}

/** Сетка cols×rows прямоугольников W×H, общие вершины сшиты coincident. */
function buildGrid({ cols = 3, rows = 3, W = 10, H = 8, jitter = 1.2, seed = 2 } = {}) {
    const r = rng(seed);
    const vertices = new Map();
    const getV = (i, j) => {
        const key = `${i}:${j}`;
        if (!vertices.has(key)) {
            const jx = (r() - 0.5) * 2 * jitter, jy = (r() - 0.5) * 2 * jitter;
            vertices.set(key, v3(i * W + jx, j * H + jy));
        }
        return vertices.get(key);
    };
    const lines = [];
    const constraints = [];
    const push = (p, q) => {
        const l = new LineEntity({ start: p.clone(), end: q.clone() });
        lines.push(l);
        return l;
    };
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const a = getV(i, j), b = getV(i + 1, j), c = getV(i + 1, j + 1), d = getV(i, j + 1);
            const bottom = push(a, b), right = push(b, c), top = push(c, d), left = push(d, a);
            constraints.push(new HorizontalConstraint(bottom), new HorizontalConstraint(top));
            constraints.push(new VerticalConstraint(left), new VerticalConstraint(right));
            constraints.push(new CoincidentConstraint(bottom, 'end', right, 'start'));
            constraints.push(new CoincidentConstraint(right, 'end', top, 'start'));
            constraints.push(new CoincidentConstraint(top, 'end', left, 'start'));
            constraints.push(new CoincidentConstraint(left, 'end', bottom, 'start'));
        }
    }
    // Сшивка соседних ячеек по общим сторонам:
    //   справа  — right(i,j).end == left(i+1,j).start
    //   сверху  — top(i,j).end   == bottom(i,j+1).start
    for (let i = 0; i < cols - 1; i++) {
        for (let j = 0; j < rows; j++) {
            const rightA = lines[(i * rows + j) * 4 + 1];
            const leftB = lines[((i + 1) * rows + j) * 4 + 3];
            constraints.push(new CoincidentConstraint(rightA, 'end', leftB, 'start'));
        }
    }
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows - 1; j++) {
            const topA = lines[(i * rows + j) * 4 + 2];
            const bottomB = lines[(i * rows + (j + 1)) * 4 + 0];
            constraints.push(new CoincidentConstraint(topA, 'end', bottomB, 'start'));
        }
    }
    constraints.push(new DistanceConstraint(lines[0], 'length', W));
    constraints.push(new DistanceConstraint(lines[1], 'length', H));
    return { entities: lines, constraints, fixed: [] };
}

/** Линия + две окружности: горизонталь, радиусы, внешнее касание, точка на окружности. */
function buildTangent() {
    const l1 = line([-50, 20], [50, 20]);
    const c1 = new CircleEntity({ center: v3(0, 0), radius: 20 });
    const c2 = new CircleEntity({ center: v3(45, 3), radius: 15 });
    const p1 = point(2, 5);
    const constraints = [
        new HorizontalConstraint(l1),
        new DistanceConstraint(c1, 'radius', 20),
        new DistanceConstraint(c2, 'radius', 15),
        new CircleCircleTangentConstraint(c1, c2, 'external'),
        new PointOnCurveConstraint(p1, null, c1)
    ];
    return { entities: [l1, c1, c2, p1], constraints, fixed: [] };
}

/** Дуга между двумя отрезками: углы стартуют «неправильными». */
function buildArcChain() {
    const l0 = line([0, 0], [20, 0]);
    const l1 = line([30.6, 10.4], [60, 10.2]);
    const arc = new ArcEntity({
        center: v3(20, 10), radius: 10,
        startAngle: -Math.PI / 2 + 0.35,
        endAngle: 0 - 0.25
    });
    const anchor = point(0, 0);
    const constraints = [
        new HorizontalConstraint(l0),
        new HorizontalConstraint(l1),
        new CoincidentConstraint(l0, 'start', anchor, null),
        new CoincidentConstraint(l0, 'end', arc, 'start'),
        new CoincidentConstraint(arc, 'end', l1, 'start'),
        new DistanceConstraint(arc, 'radius', 10),
        new ArcAngleConstraint(arc, Math.PI / 2)
    ];
    return { entities: [l0, l1, arc, anchor], constraints, fixed: [anchor], arc };
}

/** Овал: ширина/высота + привязка центра к закреплённой точке. */
function buildOval() {
    const oval = new OvalEntity({ center: v3(3, 4), radiusX: 20, radiusY: 10, rotation: 0.2 });
    const anchor = point(0, 0);
    const constraints = [
        new CoincidentConstraint(oval, 'center', anchor, null),
        new DistanceConstraint(oval, 'width', 20),
        new DistanceConstraint(oval, 'height', 10)
    ];
    return { entities: [oval, anchor], constraints, fixed: [anchor], oval };
}

// ─────────────────────────────────────────────────────────────────────────────
// Менеджер ограничений (для S3/S4) с заглушками вместо сцены
// ─────────────────────────────────────────────────────────────────────────────

function makeFakeSketchManager(entities) {
    const statuses = [];
    return {
        statuses,
        editor: {
            showStatus: (text, kind) => statuses.push({ text, kind }),
            cameraManager: { camera: null }
        },
        entityManager: {
            entities,
            selected: [],
            saved: 0,
            saveState() { this.saved++; },
            releaseEntities() {},
            resetToState() {}
        },
        addConstraints: true,
        sketchTool: { updateDOFIndicator() {} },
        showAdvancedDOF: false,
        currentPlane: null,
        constraintManager: null
    };
}

function makeConstraintManager(sketchManager) {
    // Конструктор настоящего менеджера создаёт ConstraintVisualizer (canvas/DOM),
    // поэтому собираем объект на прототипе и подставляем заглушку визуализатора.
    const cm = Object.create(SketchConstraintManager.prototype);
    cm.sketchManager = sketchManager;
    cm.constraints = [];
    cm.solver = new NewtonSolver({ ...NO_TIMEOUT });
    cm.visualizer = {
        updateVisual() {}, removeVisual() {}, highlight() {}, rebuildAll() {}, clearAll() {},
        hoveredDof: null, hideTooltip() {}
    };
    cm.selectedConstraints = new Set();
    cm._hasConflict = false;
    cm.analyzer = new ConstraintAnalyzer(cm.solver);
    cm.additionManager = {};
    sketchManager.constraintManager = cm;
    return cm;
}

// ─────────────────────────────────────────────────────────────────────────────
// Сценарии
// ─────────────────────────────────────────────────────────────────────────────

const C = (name, ok, detail) => ({ name, ok: !!ok, detail: detail === undefined ? null : detail });

export function runRegression() {
    const scenarios = [];

    const def = (id, title, fn) => {
        const started = performance.now();
        let checks = [], metrics = {}, error = null;
        try {
            const out = fn() || {};
            checks = out.checks || [];
            metrics = out.metrics || {};
        } catch (e) {
            error = String((e && e.stack) || e);
            checks = [C('сценарий выполнился', false, error)];
        }
        scenarios.push({
            id, title,
            ok: checks.every(c => c.ok),
            checks, metrics,
            error,
            ms: +(performance.now() - started).toFixed(1)
        });
    };

    // 1. Прямоугольник: сходимость + геометрия.
    def('rect-50x30', 'Прямоугольник 50×30: H/V + coincident + 2 размера', () => {
        const { entities, constraints, fixed } = buildRect();
        const { result, ms } = solveScenario({ constraints, fixed });
        const [l1, l2, l3, l4] = entities;
        return {
            checks: [
                C('сошёлся', result.converged, result.maxResidual),
                C('невязка ≤ 1e-6', result.maxResidual <= EPS, result.maxResidual),
                C('сторона 50', Math.abs(lineLength(l1) - 50) <= EPS, lineLength(l1)),
                C('сторона 30', Math.abs(lineLength(l2) - 30) <= EPS, lineLength(l2)),
                C('угол 90°', absCos(l1, l2) <= EPS, absCos(l1, l2)),
                C('противоположные стороны параллельны', Math.abs(absCos(l1, l3) - 1) <= EPS && Math.abs(absCos(l2, l4) - 1) <= EPS,
                    `${absCos(l1, l3).toFixed(9)} / ${absCos(l2, l4).toFixed(9)}`)
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed, ms: +ms.toFixed(1) }
        };
    });

    // 2. Прямоугольник с закреплённой вершиной: DOF = 0.
    def('rect-anchored', 'Прямоугольник + закреплённая вершина: DOF = 0', () => {
        const { entities, constraints } = buildRect();
        const anchor = point(0, 0);
        constraints.push(new CoincidentConstraint(entities[0], 'start', anchor, null));
        const { result } = solveScenario({ constraints, fixed: [anchor] });
        const dof = new NewtonSolver({ ...NO_TIMEOUT }).analyzeDOF(constraints, [anchor]);
        return {
            checks: [
                C('сошёлся', result.converged, result.maxResidual),
                C('DOF = 0', dof.dof === 0, `dof=${dof.dof} rank=${dof.rankJ} m=${dof.m}`),
                C('система совместна', dof.consistent === true, dof.reason)
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed, dof: dof.dof, rank: dof.rankJ, m: dof.m }
        };
    });

    // 3–4. Лесенки разного размера.
    for (const N of [20, 80]) {
        def(`stair-${N}`, `Лесенка ${N} линий: H/V + coincident + размеры + якорь`, () => {
            const { constraints, fixed } = buildStair(N);
            const { result, ms } = solveScenario({ constraints, fixed });
            const nFree = new NewtonSolver({ ...NO_TIMEOUT })._buildParameterSystem(constraints, fixed).freeParams.length;
            return {
                checks: [
                    C('сошёлся', result.converged, result.maxResidual),
                    C('невязка ≤ 1e-6', result.maxResidual <= EPS, result.maxResidual),
                    C('итераций ≤ 60', result.iterUsed <= 60, result.iterUsed)
                ],
                metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed, nFree, ms: +ms.toFixed(1) }
            };
        });
    }

    // 5. Сетка 3×3.
    def('grid-3x3', 'Сетка 3×3 (36 линий), общие вершины', () => {
        const { entities, constraints, fixed } = buildGrid();
        const { result, ms } = solveScenario({ constraints, fixed });
        const W = 10, H = 8;
        // Стороны ячеек после ортогонализации могут слегка измениться (размеры
        // заданы только двум линиям), поэтому проверяем не абсолютные длины,
        // а замкнутость ячеек: противоположные стороны равны.
        let worstPair = 0, minLen = Infinity;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const bottom = entities[(i * 3 + j) * 4 + 0];
                const top = entities[(i * 3 + j) * 4 + 2];
                const left = entities[(i * 3 + j) * 4 + 3];
                const right = entities[(i * 3 + j) * 4 + 1];
                worstPair = Math.max(worstPair,
                    Math.abs(lineLength(bottom) - lineLength(top)),
                    Math.abs(lineLength(left) - lineLength(right)));
            }
        }
        for (const l of entities) minLen = Math.min(minLen, lineLength(l));
        return {
            checks: [
                C('сошёлся', result.converged, result.maxResidual),
                C('невязка ≤ 1e-6', result.maxResidual <= EPS, result.maxResidual),
                C('размерные стороны 10/8', Math.abs(lineLength(entities[0]) - W) <= EPS && Math.abs(lineLength(entities[1]) - H) <= EPS,
                    `${lineLength(entities[0]).toFixed(6)} / ${lineLength(entities[1]).toFixed(6)}`),
                C('ячейки замкнуты (противоположные стороны равны)', worstPair <= EPS, worstPair),
                C('нет вырожденных отрезков (≥ 5 мм)', minLen >= 5, minLen),
                C('итераций ≤ 40', result.iterUsed <= 40, result.iterUsed)
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed, nFree: solverFree(constraints, fixed), ms: +ms.toFixed(1) }
        };
    });

    // 6. Касание двух окружностей + точка на окружности.
    def('tangent-circles', 'Линия + 2 окружности: радиусы, касание, точка на кривой', () => {
        const { entities, constraints, fixed } = buildTangent();
        const { result } = solveScenario({ constraints, fixed });
        const [l1, c1, c2, p1] = entities;
        const dist = Math.hypot(c1.params.centerX - c2.params.centerX, c1.params.centerY - c2.params.centerY);
        const sum = c1.params.radius + c2.params.radius;
        const onCurve = Math.hypot(p1.params.x - c1.params.centerX, p1.params.y - c1.params.centerY) - c1.params.radius;
        return {
            checks: [
                C('сошёлся', result.converged, result.maxResidual),
                C('|c1c2| = r1+r2', Math.abs(dist - sum) <= EPS, `dist=${dist.toFixed(9)} sum=${sum.toFixed(9)}`),
                C('точка на окружности', Math.abs(onCurve) <= EPS, onCurve),
                C('радиусы не изменились', Math.abs(c1.params.radius - 20) <= EPS && Math.abs(c2.params.radius - 15) <= EPS)
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed }
        };
    });

    // 7. Дуга: углы — тоже DOF, развёртка не переворачивается.
    def('arc-chain', 'Дуга между отрезками: arc_angle, радиус, совпадения', () => {
        const { constraints, fixed, arc } = buildArcChain();
        const signBefore = Math.sign(arc.params.endAngle - arc.params.startAngle);
        const { result } = solveScenario({ constraints, fixed });
        const sweep = arc.params.endAngle - arc.params.startAngle;
        return {
            checks: [
                C('сошёлся', result.converged, result.maxResidual),
                C('развёртка = π/2', Math.abs(Math.abs(sweep) - Math.PI / 2) <= EPS, sweep),
                C('знак развёртки сохранён', Math.sign(sweep) === signBefore, `${signBefore} → ${Math.sign(sweep)}`),
                C('радиус = 10', Math.abs(arc.params.radius - 10) <= EPS, arc.params.radius)
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed }
        };
    });

    // 8. Овал: должен участвовать в решателе (S2).
    def('oval-dims', 'Овал: размеры width/height + привязка центра (S2)', () => {
        const { constraints, fixed, oval } = buildOval();
        const { result } = solveScenario({ constraints, fixed });
        return {
            checks: [
                C('сошёлся', result.converged, result.maxResidual),
                C('невязка ≤ 1e-6', result.maxResidual <= EPS, result.maxResidual),
                C('radiusX = 10 (width 20)', Math.abs(oval.params.radiusX - 10) <= EPS, oval.params.radiusX),
                C('radiusY = 5 (height 10)', Math.abs(oval.params.radiusY - 5) <= EPS, oval.params.radiusY),
                C('центр притянут к (0,0)', Math.abs(oval.params.centerX) <= EPS && Math.abs(oval.params.centerY) <= EPS,
                    `${oval.params.centerX.toFixed(6)}, ${oval.params.centerY.toFixed(6)}`)
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed }
        };
    });

    // 9. Избыточный размер (совместный): должен сойтись, DOF-анализ — redundant.
    def('redundant-dims', 'Избыточный размер: сходится, redundant = true', () => {
        const { entities, constraints, fixed } = buildRect();
        constraints.push(new DistanceConstraint(entities[0], 'length', 50));
        const { result } = solveScenario({ constraints, fixed });
        const dof = new NewtonSolver({ ...NO_TIMEOUT }).analyzeDOF(constraints, fixed);
        return {
            checks: [
                C('сошёлся', result.converged, result.maxResidual),
                C('consistent = true', dof.consistent === true, dof.reason),
                C('redundant = true', dof.redundant === true, dof.reason),
                C('лишних уравнений ровно 1', dof.m - dof.rankJ === 1, `m=${dof.m} rank=${dof.rankJ}`)
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed, dof: dof.dof, rank: dof.rankJ, m: dof.m }
        };
    });

    // 10. Противоречивые размеры: не сходится, неврзка = LS-компромисс, без дрейфа.
    def('conflict-dims', 'Противоречивые размеры: не сходится, геометрия стабильна', () => {
        const l = line([0, 0], [100, 0]);
        const constraints = [
            new HorizontalConstraint(l),
            new DistanceConstraint(l, 'length', 100),
            new DistanceConstraint(l, 'length', 120)
        ];
        const { result } = solveScenario({ constraints, fixed: [] });
        const snap = snapshot([l]);
        const second = solveScenario({ constraints, fixed: [] });
        const dof = new NewtonSolver({ ...NO_TIMEOUT }).analyzeDOF(constraints, []);
        return {
            checks: [
                C('converged = false', result.converged === false, result.converged),
                C('невязка — LS-компромисс (≈10 мм)', result.maxResidual > 9 && result.maxResidual < 11, result.maxResidual),
                C('analyzeDOF: consistent = false', dof.consistent === false, dof.reason),
                C('повторный solve не двигает геометрию', maxParamDiff(snap, snapshot([l])) <= EPS, maxParamDiff(snap, snapshot([l])))
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, iter: result.iterUsed, dof: dof.dof, rank: dof.rankJ, m: dof.m }
        };
    });

    // 11. Драг-цикл: 40 кадров по 5 итераций, затем полная доводка.
    //     Система недоопределена, поэтому абсолютные координаты зависят от пути —
    //     проверяем, что эскиз остался КОРРЕКТНЫМ (не «поплыл» и не выродился).
    def('drag-loop', 'Драг: 40 кадров (maxIter=5) + доводка, геометрия целая', () => {
        const { entities, constraints, fixed } = buildStair(20);
        const lines = entities.filter(e => e.type === 'line');
        const solver = new NewtonSolver({ ...NO_TIMEOUT });
        solver.solveConstraintSet(constraints, fixed, 100, 1e-9, 1);
        const times = [];
        let worst = 0;
        for (let i = 0; i < 40; i++) {
            const ent = lines[i % lines.length];
            ent.params.endX += 0.35 * Math.sin(i * 0.7);
            ent.params.endY += 0.35 * Math.cos(i * 0.7);
            const t = performance.now();
            const r = solver.solveConstraintSet(constraints, fixed, 5, 1e-4, 1);
            times.push(performance.now() - t);
            worst = Math.max(worst, r.maxResidual);
        }
        const final = solver.solveConstraintSet(constraints, fixed, 100, 1e-9, 1);
        let worstAlign = 0;
        for (const l of lines) {
            const dx = Math.abs(l.params.endX - l.params.startX);
            const dy = Math.abs(l.params.endY - l.params.startY);
            // осевой отрезок: одна из проекций ~0
            worstAlign = Math.max(worstAlign, Math.min(dx, dy));
        }
        const dimensioned = [lines[1], lines[2], lines[3]];
        const worstDimLen = Math.max(...dimensioned.map(l => Math.abs(lineLength(l) - 10)));
        const anchor = entities[entities.length - 1];
        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        return {
            checks: [
                C('после драга сошёлся', final.converged, final.maxResidual),
                C('невязка ≤ 1e-6', final.maxResidual <= EPS, final.maxResidual),
                C('размерные сегменты 10 ± 1e-6', worstDimLen <= EPS, worstDimLen),
                C('сегменты остались осевыми', worstAlign <= EPS, worstAlign),
                C('якорь на месте', Math.abs(anchor.params.x) <= EPS && Math.abs(anchor.params.y) <= EPS,
                    `${anchor.params.x}, ${anchor.params.y}`),
                C('невязка кадра ≤ 2e-3', worst <= 2e-3, worst),
                C('кадр < 30 мс', mean < 30, `${mean.toFixed(2)} мс`)
            ],
            metrics: { converged: final.converged, residual: final.maxResidual, iter: final.iterUsed, frameMs: +mean.toFixed(2) }
        };
    });

    // 12. Аналитический якобиан: gradient() обязан вызываться (S1).
    def('jacobian-analytic', 'Якобиан: аналитические градиенты против конечных разностей (S1)', () => {
        const { entities, constraints } = buildRect();
        const solver = new NewtonSolver({ ...NO_TIMEOUT });
        const sys = solver._buildParameterSystem(constraints, []);
        const nFree = sys.freeParams.length;
        const m = solver._countEquations(constraints);
        solver._ensureBufferSize(m, nFree);
        const sqrtW = solver._computeSqrtWeights(constraints);
        const scale = solver._computeScaling(sys.paramValues, sys.freeParams);
        solver._applyParamsToEntities(sys.paramValues, sys.paramToEntity, sys.entityParams, sys.fixedParams);

        const J1 = new Float64Array(m * nFree);
        const J2 = new Float64Array(m * nFree);
        let gradCalls = 0;
        const spied = [HorizontalConstraint, VerticalConstraint, CoincidentConstraint, DistanceConstraint];
        const originals = spied.map(K => K.prototype.gradient);
        spied.forEach(K => {
            K.prototype.gradient = function (...a) { gradCalls++; return originals[spied.indexOf(K)].apply(this, a); };
        });
        let fdCalls = 0;
        const origFD = NewtonSolver.prototype._computeFiniteDifference;
        NewtonSolver.prototype._computeFiniteDifference = function (...a) { fdCalls++; return origFD.apply(this, a); };

        try {
            solver.jacobianMode = 'hybrid';
            solver._computeJacobian(constraints, sqrtW, J1, scale, sys);
            const fdHybrid = fdCalls;
            fdCalls = 0;
            solver.jacobianMode = 'numerical';
            solver._computeJacobian(constraints, sqrtW, J2, scale, sys);
            solver.jacobianMode = 'hybrid';
            let maxJ = 0, maxDiff = 0;
            for (let i = 0; i < J1.length; i++) {
                maxJ = Math.max(maxJ, Math.abs(J2[i]));
                maxDiff = Math.max(maxDiff, Math.abs(J1[i] - J2[i]));
            }
            const rel = maxJ > 0 ? maxDiff / maxJ : 0;
            return {
                checks: [
                    C('gradient() вызывается', gradCalls > 0, gradCalls),
                    C('конечных разностей нет', fdHybrid === 0, fdHybrid),
                    C('аналитика совпадает с численной (≤1e-3)', rel <= 1e-3, rel)
                ],
                metrics: { gradientCalls: gradCalls, fdHybrid, jacRelDiff: rel, nFree, m }
            };
        } finally {
            spied.forEach((K, i) => { K.prototype.gradient = originals[i]; });
            NewtonSolver.prototype._computeFiniteDifference = origFD;
        }
    });

    // 13. Сверка аналитических градиентов с конечными разностями.
    //     На нескольких геометриях (seed), а не на одной: 17 типов дают Map,
    //     4 — заглушки null (для них эталон и есть FD).
    def('jacobian-sweep', 'Якобиан: сверка gradient() с FD на 10 геометриях', () => {
        const SEEDS = 10;
        const FD_ONLY = new Set(['angle', 'arc-angle', 'circle-tangent', 'symmetry']);

        const makeScene = (seed) => {
            const r = rng(2000 + seed);
            const R = (a, b) => a + (b - a) * r();
            const l1 = line([R(-20, 0), R(-10, 10)], [R(20, 40), R(0, 20)]);
            const l2 = line([R(-10, 10), R(15, 35)], [R(30, 60), R(20, 40)]);
            const axis = line([-30, 40], [70, 40]);
            const c1 = new CircleEntity({ center: v3(R(-15, 5), R(-10, 5)), radius: R(8, 16) });
            const c2 = new CircleEntity({ center: v3(R(45, 70), R(-20, -5)), radius: R(5, 12) });
            const arc = new ArcEntity({
                center: v3(R(-40, -25), R(0, 15)), radius: R(10, 18),
                startAngle: R(-2, -1), endAngle: R(0.5, 1.5)
            });
            const p1 = point(R(-5, 15), R(-5, 15));
            const p2 = point(R(20, 45), R(5, 30));
            return { l1, l2, axis, c1, c2, arc, p1, p2 };
        };

        const build = (s) => {
            // «Фиксация»: снимок делается до смещения, иначе норма недифференцируема
            // в нуле (grad = 0, а FD даст 1).
            const fixedLine = line([0, 0], [20, 5]);
            const fixed = new FixedConstraint(fixedLine);
            fixedLine.params.startX += 1.5;
            fixedLine.params.endY -= 2;

            return [
                ['horizontal', new HorizontalConstraint(s.l1)],
                ['vertical', new VerticalConstraint(s.l2)],
                ['parallel', new ParallelConstraint(s.l1, s.l2)],
                ['perpendicular', new PerpendicularConstraint(s.l1, s.l2)],
                ['coincident-line', new CoincidentConstraint(s.l1, 'end', s.l2, 'start')],
                ['coincident-circle', new CoincidentConstraint(s.c1, 'center', s.p1, null)],
                ['coincident-arc-end', new CoincidentConstraint(s.arc, 'end', s.l2, 'end')],
                ['distance-length', new DistanceConstraint(s.l1, 'length', 30)],
                ['distance-radius', new DistanceConstraint(s.c1, 'radius', 10)],
                ['two-point-distance', new TwoPointDistanceConstraint(s.l1, 'start', s.l2, 'end', 25)],
                ['angle', new AngleConstraint(s.l1, s.l2, 30)],
                ['point-line-distance', new PointLineDistanceConstraint(s.p1, null, s.l1, 5)],
                ['point-on-line', new PointOnLineConstraint(s.p1, null, s.l1)],
                ['point-to-midpoint', new PointToMidpointConstraint(s.p1, null, s.l1)],
                ['equality', new EqualityConstraint(s.l1, s.l2)],
                ['tangent', new TangentConstraint(s.l1, s.c1)],
                ['circle-tangent', new CircleCircleTangentConstraint(s.c1, s.c2, 'external')],
                ['symmetry', new SymmetryConstraint(s.l1, 'end', s.l2, 'start', s.axis)],
                ['point-on-curve', new PointOnCurveConstraint(s.p1, null, s.c1)],
                ['arc-angle', new ArcAngleConstraint(s.arc, Math.PI / 2)],
                ['fixed', fixed]
            ];
        };

        const stats = new Map();       // name → { worst, runs }
        const fdOnly = new Set();

        for (let seed = 0; seed < SEEDS; seed++) {
            for (const [name, constraint] of build(makeScene(seed))) {
                const cs = [constraint];
                const solver = new NewtonSolver({ ...NO_TIMEOUT });
                const sys = solver._buildParameterSystem(cs, []);
                const nFree = sys.freeParams.length;
                if (nFree === 0) continue;
                const m = solver._countEquations(cs);
                solver._ensureBufferSize(m, nFree);
                const sqrtW = solver._computeSqrtWeights(cs);
                const scale = solver._computeScaling(sys.paramValues, sys.freeParams);
                solver._applyParamsToEntities(sys.paramValues, sys.paramToEntity, sys.entityParams, sys.fixedParams);

                let analytic = false;
                const orig = constraint.gradient;
                if (typeof orig === 'function') {
                    constraint.gradient = function (...a) {
                        const r = orig.apply(this, a);
                        if (r instanceof Map) analytic = true;
                        return r;
                    };
                }
                const J1 = new Float64Array(m * nFree);
                const J2 = new Float64Array(m * nFree);
                solver.jacobianMode = 'hybrid';
                solver._computeJacobian(cs, sqrtW, J1, scale, sys);
                solver.jacobianMode = 'numerical';
                solver._computeJacobian(cs, sqrtW, J2, scale, sys);
                solver.jacobianMode = 'hybrid';
                if (orig) constraint.gradient = orig;

                if (!analytic) { fdOnly.add(name); continue; }

                let maxJ = 0, maxDiff = 0;
                for (let i = 0; i < J1.length; i++) {
                    maxJ = Math.max(maxJ, Math.abs(J1[i]), Math.abs(J2[i]));
                    maxDiff = Math.max(maxDiff, Math.abs(J1[i] - J2[i]));
                }
                const rel = maxJ > 0 ? maxDiff / maxJ : 0;
                const st = stats.get(name) || { worst: 0, runs: 0 };
                st.worst = Math.max(st.worst, rel);
                st.runs++;
                stats.set(name, st);
            }
        }

        const failures = [...stats.entries()]
            .filter(([, st]) => st.worst > 1e-3)
            .map(([name, st]) => `${name}: Δ=${st.worst.toExponential(2)}`);
        const unknownFdOnly = [...fdOnly].filter(n => !FD_ONLY.has(n));
        const worstAll = Math.max(0, ...[...stats.values()].map(s => s.worst));

        return {
            checks: [
                C('аналитических типов ≥ 17', stats.size >= 17, `${stats.size}: ${[...stats.keys()].join(', ')}`),
                C('каждый тип проверен на 10 геометриях', [...stats.values()].every(s => s.runs === SEEDS),
                    [...stats.entries()].filter(([, s]) => s.runs !== SEEDS).map(([n, s]) => `${n}:${s.runs}`).join(',') || 'ok'),
                C('аналитика сходится с FD (≤1e-3)', failures.length === 0, failures.join('; ') || `worst=${worstAll.toExponential(2)}`),
                C('без аналитики только известные 4 типа', unknownFdOnly.length === 0, [...fdOnly].join(', '))
            ],
            metrics: {
                analyticTypes: stats.size,
                seeds: SEEDS,
                worstRelDiff: worstAll,
                fdOnly: [...fdOnly].length
            }
        };
    });

    // 14. После solve() нельзя двигать геометрию вручную (S6).
    def('no-postpass', 'Нет пост-обработки coincident.apply() (S6)', () => {
        const { constraints, fixed } = buildRect();
        let calls = 0;
        const orig = CoincidentConstraint.prototype.apply;
        CoincidentConstraint.prototype.apply = function (...a) { calls++; return orig.apply(this, a); };
        try {
            solveScenario({ constraints, fixed });
        } finally {
            CoincidentConstraint.prototype.apply = orig;
        }
        return {
            checks: [C('apply() не вызывается из солвера', calls === 0, calls)],
            metrics: { applyCalls: calls }
        };
    });

    // 14. Вырожденная матрица должна сигналить, а не возвращать мусор (S8).
    def('singular-matrix', 'Вырожденная H: _solveLinearSystem возвращает null (S8)', () => {
        const solver = new NewtonSolver({ ...NO_TIMEOUT });
        const H = [new Float64Array(2), new Float64Array(2)];
        const dx = solver._solveLinearSystem(H, new Float64Array([1, 2]), 2);
        return {
            checks: [C('возвращает null', dx === null, dx === null ? 'null' : `[${Array.from(dx || [])}]`)],
            metrics: { returnedNull: dx === null }
        };
    });

    // 15. Отрицательный радиус не должен приниматься (S7).
    def('bounds-radius', 'Неотрицательный радиус: шаг в минус отбраковывается (S7)', () => {
        const circle = new CircleEntity({ center: v3(0, 0), radius: 10 });
        const constraints = [new DistanceConstraint(circle, 'radius', -5)];
        const { result } = solveScenario({ constraints, fixed: [] });
        return {
            checks: [
                C('не сошёлся (цель недостижима)', result.converged === false, result.converged),
                C('радиус > 0', circle.params.radius > 0, circle.params.radius)
            ],
            metrics: { converged: result.converged, residual: result.maxResidual, radius: circle.params.radius }
        };
    });

    // 16. Таймаут должен возвращать partial (S5).
    def('timeout-partial', 'Таймаут возвращает partial = true (S5)', () => {
        const { constraints, fixed } = buildStair(160);
        const solver = new NewtonSolver({ IterationTimeOut: 20 });
        const t0 = performance.now();
        const result = solver.solveConstraintSet(constraints, fixed, 200, 1e-6, 1);
        const ms = performance.now() - t0;
        return {
            checks: [
                C('partial = true', result.partial === true, result.partial),
                C('остановился быстро (<150 мс)', ms < 150, `${ms.toFixed(1)} мс`),
                C('итераций < 200', result.iterUsed < 200, result.iterUsed)
            ],
            metrics: { partial: result.partial, iter: result.iterUsed, ms: +ms.toFixed(1) }
        };
    });

    // 17. Конфликтное ограничение не добавляется, геометрия откатывается (S3).
    def('manager-conflict', 'Менеджер: конфликт откатывается (S3)', () => {
        const { entities, constraints } = buildRect();
        const sm = makeFakeSketchManager(entities);
        const cm = makeConstraintManager(sm);
        for (const c of constraints) cm._addSingleConstraint(c, false);
        cm.solve({});
        const before = snapshot(entities);
        const bad = new DistanceConstraint(entities[2], 'length', 999);
        cm.addConstraints([bad], { solve: true, checkConflicts: true, deepCheck: true, saveState: false });
        const after = snapshot(entities);
        return {
            checks: [
                C('ограничение не добавлено', !cm.constraints.includes(bad), cm.constraints.length),
                C('геометрия восстановлена', maxParamDiff(before, after) <= EPS, maxParamDiff(before, after)),
                C('показано предупреждение', sm.statuses.some(s => s.kind === 'warning'), sm.statuses.map(s => s.kind).join(','))
            ],
            metrics: { count: cm.constraints.length, restored: maxParamDiff(before, after) }
        };
    });

    // 18. Результат solve публикуется менеджером (S4).
    def('manager-report', 'Менеджер: публикует результат solve (S4)', () => {
        const l = line([0, 0], [100, 0]);
        const sm = makeFakeSketchManager([l]);
        const cm = makeConstraintManager(sm);
        cm._addSingleConstraint(new HorizontalConstraint(l), false);
        cm._addSingleConstraint(new DistanceConstraint(l, 'length', 100), false);
        cm._addSingleConstraint(new DistanceConstraint(l, 'length', 120), false);
        cm.solve({});
        const last = cm.lastSolve;
        return {
            checks: [
                C('lastSolve заполнен', !!last, last),
                C('converged = false', last && last.converged === false, last && last.converged),
                C('невязка ≈ 10 мм', last && Math.abs(last.maxResidual - 10) < 1, last && last.maxResidual),
                C('предупреждение показано', sm.statuses.some(s => s.kind === 'warning'), sm.statuses.map(s => s.kind).join(','))
            ],
            metrics: { converged: last ? last.converged : null, residual: last ? last.maxResidual : null }
        };
    });

    // 19. Детерминизм: два одинаковых прогона дают одинаковый результат.
    def('determinism', 'Детерминизм: два прогона совпадают', () => {
        const run = () => {
            const { constraints, fixed } = buildStair(40, { jitter: 1.5, seed: 11 });
            const { result } = solveScenario({ constraints, fixed });
            return result;
        };
        const a = run(), b = run();
        return {
            checks: [
                C('iterUsed совпадает', a.iterUsed === b.iterUsed, `${a.iterUsed} / ${b.iterUsed}`),
                C('maxResidual совпадает (1e-12)', Math.abs(a.maxResidual - b.maxResidual) <= 1e-12, `${a.maxResidual} / ${b.maxResidual}`),
                C('converged совпадает', a.converged === b.converged)
            ],
            metrics: { iter: a.iterUsed, residual: a.maxResidual }
        };
    });

    // 20. changedEntities: менеджер по нему обновляет только затронутый визуал (этап 3).
    def('changed-entities', 'changedEntities: список сдвинутых сущностей', () => {
        const { entities, constraints, fixed } = buildRect({ jitter: 2, seed: 5 });
        const solver = new NewtonSolver({ ...NO_TIMEOUT });
        const first = solver.solveConstraintSet(constraints, fixed, 100, 1e-6, 1);
        const second = solver.solveConstraintSet(constraints, fixed, 100, 1e-6, 1);
        const firstChanged = new Set(first.changedEntities || []);
        const secondChanged = new Set(second.changedEntities || []);
        const allMoved = entities.every(e => firstChanged.has(e));
        return {
            checks: [
                C('после первого solve сдвинуты все сущности', allMoved, `${firstChanged.size}/${entities.length}`),
                C('повторный solve ничего не сдвигает', secondChanged.size === 0, secondChanged.size),
                C('changedEntities — массив', Array.isArray(first.changedEntities))
            ],
            metrics: { changedFirst: firstChanged.size, changedSecond: secondChanged.size }
        };
    });

    const total = scenarios.length;
    const passed = scenarios.filter(s => s.ok).length;
    return {
        scenarios,
        summary: {
            total, passed, failed: total - passed,
            checks: scenarios.reduce((n, s) => n + s.checks.length, 0),
            failedChecks: scenarios.reduce((n, s) => n + s.checks.filter(c => !c.ok).length, 0)
        }
    };
}

function solverFree(constraints, fixed) {
    return new NewtonSolver({ ...NO_TIMEOUT })._buildParameterSystem(constraints, fixed).freeParams.length;
}
