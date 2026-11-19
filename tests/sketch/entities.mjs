/**
 * Characterization-тесты сущностей эскиза (этап 0 рефакторинга).
 *
 * Цель — зафиксировать текущее поведение перед выделением реестра типов и
 * единого загрузчика:
 *   • сериализация toData → fromData → toData для каждого типа сущности;
 *   • флаги анкоров отступа и их снап-точки;
 *   • выбор «значимых» вершин отступа (углы/скругления/концы);
 *   • жизненный цикл анкоров: создание, переезд за геометрией, удаление
 *     лишних, запуск solve при наличии ограничений.
 *
 * Запуск: node scripts/check-sketch.mjs
 */
import * as THREE from 'three';
import { LineEntity } from '../../js/tools/sketch/entities/LineEntity.js';
import { CircleEntity } from '../../js/tools/sketch/entities/CircleEntity.js';
import { ArcEntity } from '../../js/tools/sketch/entities/ArcEntity.js';
import { OvalEntity } from '../../js/tools/sketch/entities/OvalEntity.js';
import { PolylineEntity } from '../../js/tools/sketch/entities/PolylineEntity.js';
import { SplineEntity } from '../../js/tools/sketch/entities/SplineEntity.js';
import { PointEntity } from '../../js/tools/sketch/entities/PointEntity.js';
import { OffsetEntity } from '../../js/tools/sketch/entities/OffsetEntity.js';
import { createSketchEntityFromData, SKETCH_ENTITY_TYPES } from '../../js/tools/sketch/entities/SketchEntityRegistry.js';

const v3 = (x, y) => new THREE.Vector3(x, y, 0);
const pt = (x, y) => [+x.toFixed(2), +y.toFixed(2)];

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательное
// ─────────────────────────────────────────────────────────────────────────────

/** Фейковая полилиния для проверки выбора анкоров без Clipper. */
function fakePolyline(coords, closed) {
    return {
        isClosed: closed,
        getPoints: () => coords.map(([x, y]) => v3(x, y))
    };
}

function roundTrip(ent, Ctor, checks, label) {
    ent.userData.uuid = `${label}-uuid`;
    ent._pinned = true;
    const d1 = ent.toData();
    let back;
    try {
        back = Ctor.fromData(d1);
    } catch (e) {
        checks.push({ name: `${label}: fromData не падает`, ok: false, detail: String(e) });
        return;
    }
    const d2 = back.toData();
    checks.push({
        name: `${label}: params переживают round-trip`,
        ok: JSON.stringify(d1.params) === JSON.stringify(d2.params),
        detail: null
    });
    checks.push({
        name: `${label}: uuid переживает round-trip`,
        ok: d1.userData?.uuid === d2.userData?.uuid,
        detail: d2.userData?.uuid ?? null
    });
    checks.push({
        name: `${label}: pinned переживает round-trip`,
        ok: d1.pinned === d2.pinned,
        detail: null
    });
}

/** Мини-стенд менеджера/плоскости для ensureAnchors. */
function makeAnchorHarness() {
    const plane = { uuid: 'plane-1', add() {}, remove() {} };
    const manager = {
        entities: [],
        _loadingState: false,
        addEntity(entity) {
            if (!entity.plane) entity.attachToPlane(plane);
            this.entities.push(entity);
        },
        removeEntity(entity) {
            const idx = this.entities.indexOf(entity);
            if (idx !== -1) this.entities.splice(idx, 1);
        }
    };
    const constraintManager = {
        constraints: [],
        cleanupOrphanedConstraints() {},
        solve() { this.solveCount = (this.solveCount || 0) + 1; }
    };
    const sketchManager = {
        entityManager: manager,
        constraintManager,
        currentPlane: plane,
        sketchMode: 'drawing'
    };
    return { plane, manager, constraintManager, sketchManager };
}

// ─────────────────────────────────────────────────────────────────────────────
// Сценарии
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIOS = [
    ['serialization-roundtrip', 'Сериализация сущностей', (checks) => {
        roundTrip(new LineEntity({ start: v3(1, 2), end: v3(7, 3) }), LineEntity, checks, 'line');
        roundTrip(new CircleEntity({ center: v3(5, 6), radius: 4 }), CircleEntity, checks, 'circle');
        roundTrip(new ArcEntity({ center: v3(1, 1), radius: 5, startAngle: 0.2, endAngle: 1.9 }), ArcEntity, checks, 'arc');
        roundTrip(new OvalEntity({ center: v3(2, 3), radiusX: 6, radiusY: 2, rotation: 0.4 }), OvalEntity, checks, 'oval');
        roundTrip(new PolylineEntity({ points: [v3(0, 0), v3(10, 0), v3(10, 5)], closed: false }), PolylineEntity, checks, 'polyline');
        roundTrip(new PolylineEntity({ points: [v3(0, 0), v3(10, 0), v3(10, 5), v3(0, 0)], closed: true }), PolylineEntity, checks, 'polyline-closed');
        roundTrip(new SplineEntity({ controlPoints: [v3(0, 0), v3(5, 5), v3(10, 0)] }), SplineEntity, checks, 'spline');
        roundTrip(new PointEntity({ x: 3, y: 4 }), PointEntity, checks, 'point');
    }],

    ['offset-serialization', 'Сериализация отступа', (checks) => {
        const off = new OffsetEntity({ sourceEntities: [], offsetDistance: 7, offsetMethod: 'parallel', doubleSided: true });
        off.userData.uuid = 'offset-uuid';
        const d1 = off.toData();
        const back = OffsetEntity.fromData(d1, null);
        const d2 = back.toData();
        checks.push({
            name: 'offset: params (distance/method/doubleSided)',
            ok: JSON.stringify(d1.params) === JSON.stringify(d2.params),
            detail: null
        });
        checks.push({ name: 'offset: uuid', ok: d1.userData.uuid === d2.userData.uuid, detail: null });
        checks.push({
            name: 'offset: sourceUUIDs',
            ok: JSON.stringify(d1.sourceUUIDs) === JSON.stringify(d2.sourceUUIDs),
            detail: null
        });
    }],

    ['point-anchor-flags', 'Флаги анкора точки', (checks) => {
        const anchor = new PointEntity({ x: 1, y: 2 });
        anchor.userData.uuid = 'anchor-uuid';
        anchor.userData.isOffsetAnchor = true;
        anchor.userData.offsetUuid = 'off-x';
        anchor.userData.vertexIndex = 2;
        const back = PointEntity.fromData(anchor.toData());
        checks.push({ name: 'anchor: isOffsetAnchor', ok: back.userData.isOffsetAnchor === true, detail: null });
        checks.push({ name: 'anchor: offsetUuid', ok: back.userData.offsetUuid === 'off-x', detail: null });
        checks.push({ name: 'anchor: vertexIndex', ok: back.userData.vertexIndex === 2, detail: null });
        checks.push({ name: 'anchor: нет снап-точек (их даёт контур)', ok: back.getSnapPoints().length === 0, detail: null });
        checks.push({ name: 'обычная точка: 1 снап-точка', ok: new PointEntity({ x: 0, y: 0 }).getSnapPoints().length === 1, detail: null });
    }],

    ['offset-anchor-candidates', 'Выбор вершин отступа', (checks) => {
        const candidates = (coords, closed) => {
            const off = new OffsetEntity({ sourceEntities: [], offsetDistance: 5, offsetMethod: 'parallel' });
            off._cachedResults = [fakePolyline(coords, closed)];
            return off.getAnchorCandidates().map(p => pt(p.x, p.y));
        };
        const rect = [[0, 0], [40, 0], [40, 30], [0, 30]];
        const closed = candidates(rect, true);
        const closedDup = candidates([...rect, [0, 0]], true);

        checks.push({
            name: 'замкнутый контур: все 4 угла (без дубля последней точки)',
            ok: JSON.stringify(closed) === JSON.stringify([[0, 0], [40, 0], [40, 30], [0, 30]]),
            detail: JSON.stringify(closed)
        });
        checks.push({
            name: 'замкнутый контур: дубль последней точки не создаёт лишних',
            ok: JSON.stringify(closedDup) === JSON.stringify(closed),
            detail: JSON.stringify(closedDup)
        });
        const open = candidates([[0, 0], [40, 0], [40, 30]], false);
        checks.push({
            name: 'открытый путь: концы + угол',
            ok: JSON.stringify(open) === JSON.stringify([[0, 0], [40, 0], [40, 30]]),
            detail: JSON.stringify(open)
        });

        // скруглённый угол: дуга из 8 сегментов, ждём «середину» дуги, но не каждую вершину
        const rounded = [[0, 0], [10, 0]];
        for (let i = 1; i <= 8; i++) {
            const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
            rounded.push([10 + 5 * Math.cos(a), 5 + 5 * Math.sin(a)]);
        }
        rounded.push([10, 10]);
        const roundCandidates = candidates(rounded, false);
        const arcAnchors = roundCandidates.filter(([x, y]) => x > 10 && y > 0 && y < 10);
        checks.push({
            name: 'скругление: вершины дуги не все, а «середина» (1–2 на угол)',
            ok: arcAnchors.length >= 1 && arcAnchors.length <= 2,
            detail: JSON.stringify(arcAnchors)
        });
    }],

    ['entity-registry', 'Реестр типов сущностей', (checks) => {
        const samples = {
            line: new LineEntity({ start: v3(0, 0), end: v3(5, 0) }),
            circle: new CircleEntity({ center: v3(0, 0), radius: 3 }),
            arc: new ArcEntity({ center: v3(0, 0), radius: 3 }),
            oval: new OvalEntity({ center: v3(0, 0), radiusX: 3, radiusY: 2 }),
            polyline: new PolylineEntity({ points: [v3(0, 0), v3(3, 0)] }),
            spline: new SplineEntity({ controlPoints: [v3(0, 0), v3(3, 3)] }),
            point: new PointEntity({ x: 1, y: 1 }),
            offset: new OffsetEntity({ sourceEntities: [], offsetDistance: 2 })
        };
        for (const [type, ent] of Object.entries(samples)) {
            ent.userData.uuid = `reg-${type}`;
            const created = createSketchEntityFromData(ent.toData(), { sketchManager: { name: 'sm' } });
            checks.push({
                name: `реестр создаёт ${type}`,
                ok: !!created && created.type === type && created.userData.uuid === `reg-${type}`,
                detail: created ? created.type : null
            });
            if (type === 'offset') {
                checks.push({
                    name: 'реестр передаёт sketchManager в offset',
                    ok: created?.sketchManager?.name === 'sm',
                    detail: created?.sketchManager?.name ?? null
                });
            }
        }
        checks.push({ name: 'реестр: неизвестный тип → null', ok: createSketchEntityFromData({ formatVersion: 2, type: 'nope' }) === null, detail: null });
        checks.push({ name: 'реестр: старый формат → null', ok: createSketchEntityFromData({ type: 'line' }) === null, detail: null });
        checks.push({ name: 'реестр знает все 8 типов', ok: SKETCH_ENTITY_TYPES.length === 8, detail: SKETCH_ENTITY_TYPES.join(',') });
    }],

    ['offset-anchors-lifecycle', 'Жизненный цикл анкоров', (checks) => {
        const { plane, manager, constraintManager, sketchManager } = makeAnchorHarness();
        const off = new OffsetEntity({ sourceEntities: [], offsetDistance: 5, offsetMethod: 'parallel' });
        off.sketchManager = sketchManager;
        off.plane = plane;
        off.userData.uuid = 'off-life';
        const rect = [[0, 0], [40, 0], [40, 30], [0, 30]];
        off._cachedResults = [fakePolyline(rect, true)];

        const first = off.ensureAnchors();
        checks.push({ name: 'создано 4 анкора', ok: first.length === 4, detail: first.length });
        checks.push({
            name: 'анкоры пришпилены и невидимы',
            ok: first.every(a => a._pinned && a.mesh && a.mesh.visible === false),
            detail: null
        });
        const uuids = first.map(a => a.userData.uuid);

        // геометрия уехала: те же объекты, новые позиции
        off._cachedResults = [fakePolyline(rect.map(([x, y]) => [x + 10, y + 5]), true)];
        const second = off.ensureAnchors();
        checks.push({
            name: 'при переезде сохраняются те же анкоры (UUID)',
            ok: JSON.stringify(second.map(a => a.userData.uuid)) === JSON.stringify(uuids),
            detail: null
        });
        checks.push({
            name: 'позиции анкоров обновились',
            ok: JSON.stringify(second.map(a => pt(a.params.x, a.params.y))) === JSON.stringify([[10, 5], [50, 5], [50, 35], [10, 35]]),
            detail: JSON.stringify(second.map(a => pt(a.params.x, a.params.y)))
        });

        // ограничение на анкоре → после переезда должен быть solve
        constraintManager.constraints.push({ getAffectedEntities: () => [second[0]] });
        off._cachedResults = [fakePolyline(rect.map(([x, y]) => [x + 20, y + 5]), true)];
        off.ensureAnchors();
        checks.push({ name: 'solve вызван после переезда привязанного анкора', ok: (constraintManager.solveCount || 0) >= 1, detail: constraintManager.solveCount || 0 });

        // контур стал треугольником: лишний анкор удаляется
        off._cachedResults = [fakePolyline([[0, 0], [10, 0], [5, 8]], true)];
        const third = off.ensureAnchors();
        checks.push({ name: 'лишние анкоры удаляются', ok: third.length === 3, detail: third.length });
        checks.push({ name: 'менеджер содержит только 3 анкора', ok: manager.entities.filter(e => e.userData?.isOffsetAnchor).length === 3, detail: manager.entities.length });
    }]
];

// ─────────────────────────────────────────────────────────────────────────────

export function runSketchEntities() {
    const scenarios = [];
    for (const [id, title, fn] of SCENARIOS) {
        const checks = [];
        let error = null;
        try {
            fn(checks);
        } catch (e) {
            error = String((e && e.stack) || e);
        }
        const ok = !error && checks.every(c => c.ok);
        scenarios.push({ id, title, ok, checks, error });
    }
    const all = scenarios.flatMap(s => s.checks);
    return {
        scenarios,
        summary: {
            total: scenarios.length,
            passed: scenarios.filter(s => s.ok).length,
            checks: all.length,
            failedChecks: all.filter(c => !c.ok).length + scenarios.filter(s => s.error).length
        }
    };
}
