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
import { OffsetEntity, offsetIconScaleForPx } from '../../js/tools/sketch/entities/OffsetEntity.js';
import { createSketchEntityFromData, SKETCH_ENTITY_TYPES } from '../../js/tools/sketch/entities/SketchEntityRegistry.js';
import { translateEntityData, rotateEntityData, transformEntityData, mirrorEntityData } from '../../js/tools/sketch/entities/SketchEntityOps.js';
import { createSketchEntitiesOnPlane, readSketchState, disposeSketchEntityMeshes } from '../../js/tools/sketch/managers/entities/SketchStateLoader.js';
import { SketchEntityManager } from '../../js/tools/sketch/managers/entities/SketchEntityManager.js';
import { SketchHistory } from '../../js/tools/sketch/managers/entities/SketchHistory.js';
import { SketchSession } from '../../js/tools/sketch/managers/SketchSession.js';
import { SketchExecutor } from '../../js/core/parametric/executors/SketchExecutor.js';
import { EntityStore } from '../../js/tools/sketch/managers/entities/EntityStore.js';
import { SketchPickingService } from '../../js/tools/sketch/managers/entities/SketchPickingService.js';
import { OffsetAnchorService } from '../../js/tools/sketch/managers/entities/OffsetAnchorService.js';
import { ConstraintStore } from '../../js/tools/sketch/managers/constraints/ConstraintStore.js';
import { ConstraintVisualizer } from '../../js/tools/sketch/managers/constraints/ConstraintVisualizer.js';
import { SketchConstraintManager } from '../../js/tools/sketch/managers/constraints/SketchConstraintManager.js';
import { ArraySketchToolBase, getEntitiesBounds } from '../../js/tools/sketch/sketch-tools/array-tool-base.js';
import { SketchArrow2D, arrowScaleForPx } from '../../js/tools/sketch/sketch-tools/helpers/sketch-arrow-helper.js';
import { FilletSketchTool } from '../../js/tools/sketch/sketch-tools/fillet-tool.js';
import { isOffsetConstraintData } from '../../js/mcp/helpers/sketchConstraints.js';
import { LinearArraySketchTool } from '../../js/tools/sketch/sketch-tools/linear-array-tool.js';
import { CircularArraySketchTool } from '../../js/tools/sketch/sketch-tools/circular-array-tool.js';
import { isSketchDebug, setSketchDebug } from '../../js/tools/sketch/utils/sketch-debug.js';
import { settings } from '../../js/core/settings.js';

const v3 = (x, y) => new THREE.Vector3(x, y, 0);
const pt = (x, y) => [+x.toFixed(2), +y.toFixed(2)];

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательное
// ─────────────────────────────────────────────────────────────────────────────

/** Фейковая полилиния для проверки выбора анкоров без Clipper. */
function fakePolyline(coords, closed) {
    return {
        isClosed: closed,
        userData: { uuid: `fake-${coords.length}-${closed ? 'c' : 'o'}`, originalColor: 0 },
        getPoints: () => coords.map(([x, y]) => v3(x, y)),
        toData: () => ({
            formatVersion: 2,
            type: 'polyline',
            points: coords.map(([x, y]) => [x, y]),
            closed,
            userData: { uuid: `fake-${coords.length}-${closed ? 'c' : 'o'}`, originalColor: 0 }
        })
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

/**
 * Стенд реального SketchEntityManager на THREE-плоскости.
 * Нужен для проверки applyState/OffsetAnchorService без браузера.
 */
function makeManagerHarness(plane) {
    const manager = new SketchEntityManager(null);
    const constraintManager = {
        constraints: [],
        loadConstraints() {},
        cleanupOrphanedConstraints() {},
        solve() { this.solveCount = (this.solveCount || 0) + 1; }
    };
    const sketchManager = {
        entityManager: manager,
        constraintManager,
        currentPlane: plane,
        sketchLinewidth: 0,
        sketchColor: 0x111111,
        editor: { updateSelectedInfo() {}, showStatus() {} }
    };
    manager.sketchManager = sketchManager;
    sketchManager.history = new SketchHistory(sketchManager);
    sketchManager.session = new SketchSession(sketchManager);
    return { manager, constraintManager, sketchManager };
}

/**
 * Подмена Clipper-геометрии отступа: rebuild() ищет исходники через
 * sketchManager.entityManager.entities и при их отсутствии оставляет
 * _cachedResults пустым — ровно как настоящий OffsetEntity.rebuild().
 * Если исходники на месте, строит замкнутый прямоугольник 40×30 со
 * смещением 5 (тот же набор из 4 анкоров, что даёт Clipper для parallel).
 */
function withFakeOffsetGeometry(rect, fn) {
    const original = OffsetEntity.prototype.rebuild;
    OffsetEntity.prototype.rebuild = function () {
        this._clearCachedResults(true);
        if (this.sourceEntities.length === 0) return;
        this._cachedResults = [fakePolyline(rect, true)];
        this._isRebuilt = true;
        this.ensureAnchors();
    };
    try {
        return fn();
    } finally {
        OffsetEntity.prototype.rebuild = original;
    }
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

    ['entity-paths', 'Пути сущностей для привязок', (checks) => {
        const line = new LineEntity({ start: v3(0, 0), end: v3(10, 5) });
        const linePaths = line.getPaths();
        checks.push({
            name: 'line: один прямой путь',
            ok: linePaths.length === 1 && linePaths[0].type === 'line' &&
                linePaths[0].start.x === 0 && linePaths[0].end.x === 10,
            detail: JSON.stringify(linePaths.map(p => p.type))
        });

        const circle = new CircleEntity({ center: v3(5, 5), radius: 3 });
        const circlePaths = circle.getPaths();
        checks.push({
            name: 'circle: один круг',
            ok: circlePaths.length === 1 && circlePaths[0].type === 'circle' && circlePaths[0].radius === 3,
            detail: JSON.stringify(circlePaths.map(p => p.type))
        });

        const arc = new ArcEntity({ center: v3(0, 0), radius: 4, startAngle: 0, endAngle: Math.PI });
        const arcPaths = arc.getPaths();
        checks.push({
            name: 'arc: одна дуга с углами',
            ok: arcPaths.length === 1 && arcPaths[0].type === 'arc' &&
                arcPaths[0].startAngle === 0 && arcPaths[0].endAngle === Math.PI,
            detail: JSON.stringify(arcPaths.map(p => p.type))
        });

        const poly = new PolylineEntity({ points: [v3(0, 0), v3(10, 0), v3(10, 5), v3(0, 5)], closed: true });
        const polyPaths = poly.getPaths();
        checks.push({
            name: 'замкнутая полилиния: сегменты + замыкание',
            ok: polyPaths.length === 4 && polyPaths.every(p => p.type === 'line'),
            detail: polyPaths.length
        });

        const spline = new SplineEntity({ controlPoints: [v3(0, 0), v3(5, 5), v3(10, 0)] });
        const splinePaths = spline.getPaths();
        checks.push({
            name: 'сплайн: отрезки по точкам',
            ok: splinePaths.length === spline.getPoints().length - 1 && splinePaths.every(p => p.type === 'line'),
            detail: splinePaths.length
        });

        const point = new PointEntity({ x: 1, y: 2 });
        const offset = new OffsetEntity({ sourceEntities: [], offsetDistance: 2 });
        checks.push({
            name: 'point/offset: путей нет (привязки через getSnapPoints)',
            ok: point.getPaths().length === 0 && offset.getPaths().length === 0,
            detail: `${point.getPaths().length}/${offset.getPaths().length}`
        });
    }],

    ['entity-dimension-specs', 'Размеры, которые умеет ставить сущность', (checks) => {
        const line = new LineEntity({ start: v3(0, 0), end: v3(3, 4) });
        checks.push({
            name: 'line: размер длины',
            ok: line.getDimensionSpec()?.dimensionKey === 'length' && line.getDimensionSpec()?.currentValue === 5,
            detail: JSON.stringify(line.getDimensionSpec())
        });

        const circle = new CircleEntity({ center: v3(0, 0), radius: 3 });
        checks.push({
            name: 'circle: диаметр, угол выноса выбирает инструмент',
            ok: circle.getDimensionSpec()?.dimensionKey === 'diameter' &&
                circle.getDimensionSpec()?.currentValue === 6 &&
                circle.getDimensionSpec()?.angle === null,
            detail: JSON.stringify(circle.getDimensionSpec())
        });

        const arc = new ArcEntity({ center: v3(0, 0), radius: 4, startAngle: 0, endAngle: Math.PI });
        checks.push({
            name: 'arc: радиус, вынос по середине дуги',
            ok: arc.getDimensionSpec()?.dimensionKey === 'radius' &&
                arc.getDimensionSpec()?.currentValue === 4 &&
                Math.abs(arc.getDimensionSpec()?.angle - Math.PI / 2) < 1e-9,
            detail: JSON.stringify(arc.getDimensionSpec())
        });

        const oval = new OvalEntity({ center: v3(0, 0), radiusX: 3, radiusY: 2 });
        checks.push({ name: 'oval: свой диалог осей', ok: oval.getDimensionSpec()?.custom === 'oval', detail: JSON.stringify(oval.getDimensionSpec()) });

        checks.push({
            name: 'point/offset: простого размера нет',
            ok: new PointEntity({ x: 0, y: 0 }).getDimensionSpec() === null &&
                new OffsetEntity({ sourceEntities: [], offsetDistance: 2 }).getDimensionSpec() === null,
            detail: null
        });
    }],

    ['fillet-direction-constraints', 'Fillet сохраняет H/V/параллель/перпендикуляр', (checks) => {
        const tool = Object.create(FilletSketchTool.prototype);
        const e1 = { type: 'line' };
        const e2 = { type: 'line' };
        const constraint = (type) => ({ type, getAffectedEntities: () => [e1, e2] });

        for (const type of ['horizontal', 'vertical', 'parallel', 'perpendicular', 'angle']) {
            checks.push({
                name: `${type} не удаляется`,
                ok: tool._isJointConstraint(constraint(type), e1, e2, 'end', 'start', null) === false,
                detail: type
            });
        }
        checks.push({
            name: 'coincident в узле по-прежнему удаляется',
            ok: tool._isJointConstraint(constraint('coincident'), e1, e2, 'end', 'start', null) === true,
            detail: 'coincident'
        });
    }],

    ['fillet-dimensions', 'Fillet пересчитывает размеры после обрезки', (checks) => {
        const tool = Object.create(FilletSketchTool.prototype);
        const line = { type: 'line', length: 10 };
        const distance = {
            type: 'distance', entity: line, dimensionKey: 'length', value: 20,
            error() { return line.length - this.value; },
            getAffectedEntities() { return [line]; }
        };
        const angle = {
            type: 'angle', targetAngle: 90,
            error() { return 10; },
            getAffectedEntities() { return [line]; }
        };
        const equality = {
            type: 'equality',
            getAffectedEntities() { return [line]; }
        };
        const removed = [];
        const updated = [];
        tool.sketchManager = {
            constraintManager: {
                constraints: [distance, angle, equality],
                removeConstraints(list) { removed.push(...list); },
                visualizer: { updateVisual(c) { updated.push(c); } }
            }
        };

        tool._reconcileDimensions(line, {});
        checks.push({ name: 'длина пересчитана по факту', ok: distance.value === 10, detail: distance.value });
        checks.push({ name: 'угол пересчитан по факту', ok: angle.targetAngle === 100, detail: angle.targetAngle });
        checks.push({ name: 'равенство удалено', ok: removed.length === 1 && removed[0] === equality, detail: removed.length });
        checks.push({ name: 'визуал изменённых размеров обновлён', ok: updated.includes(distance) && updated.includes(angle), detail: updated.length });
    }],

    ['origin-migration', 'SketchExecutor досоздаёт якорь до ограничений', (checks) => {
        const executor = Object.create(SketchExecutor.prototype);
        executor.editor = { sketchManager: {} };
        const plane = { uuid: 'plane-1', userData: {}, add() {}, remove() {} };
        const entities = [];

        const created = executor._ensureOriginEntity(plane, entities);
        checks.push({
            name: 'якорь создан со стабильным UUID',
            ok: !!created && created.userData.uuid === 'plane-1:origin' && created.userData.isOriginPoint === true && created._pinned === true,
            detail: created?.userData?.uuid
        });
        checks.push({ name: 'якорь добавлен в entities', ok: entities.length === 1 && entities[0] === created, detail: entities.length });

        const second = executor._ensureOriginEntity(plane, entities);
        checks.push({ name: 'повторно якорь не создаётся', ok: second === null && entities.length === 1, detail: entities.length });
    }],

    ['session-phases', 'Фазы жизненного цикла SketchSession', (checks) => {
        const calls = [];
        const plane = { userData: { entities: [], constraints: [] } };
        const entityManager = {
            entities: [],
            loadEntitiesPhase(data) { calls.push('entities'); this.entities = data.slice(); return data.map(() => ({})); },
            loadConstraintsPhase(data) { calls.push('constraints'); return data?.length ?? 0; },
            postProcessPhase() { calls.push('post'); },
            publishPhase() { calls.push('publish'); }
        };
        const constraintManager = {
            constraints: [],
            solve() { calls.push('solve'); }
        };
        const session = new SketchSession({
            currentPlane: plane,
            entityManager,
            constraintManager,
            addOriginPoint() { calls.push('origin'); }
        });

        const stats = session.load({ entitiesData: [{}, {}], constraintsData: [{}, {}, {}] });
        checks.push({
            name: 'порядок фаз: сущности → якорь → ограничения → производные → публикация',
            ok: JSON.stringify(calls) === JSON.stringify(['entities', 'origin', 'constraints', 'post', 'publish']),
            detail: calls.join(' → ')
        });
        checks.push({
            name: 'статистика загрузки',
            ok: stats.entities === 2 && stats.created === 2 && stats.constraints === 3 && stats.solved === false,
            detail: JSON.stringify(stats)
        });

        calls.length = 0;
        session.load({ entitiesData: [], constraintsData: [] }, { solve: 'once' });
        checks.push({
            name: 'solve: once — ровно один раз перед публикацией',
            ok: JSON.stringify(calls) === JSON.stringify(['entities', 'origin', 'constraints', 'post', 'solve', 'publish']),
            detail: calls.join(' → ')
        });

        // loadFromPlane читает состояние плоскости и идёт тем же циклом
        const lineData = { formatVersion: 2, type: 'line', userData: { uuid: 'l-1' } };
        plane.userData.entities = [{ toData: () => lineData }];
        plane.userData.constraints = [{ uuid: 'c-1' }];
        calls.length = 0;
        const fromPlane = session.loadFromPlane(plane);
        checks.push({
            name: 'loadFromPlane читает плоскость тем же циклом',
            ok: fromPlane.entities === 1 && fromPlane.constraints === 1,
            detail: JSON.stringify(fromPlane)
        });

        // display-режим: сущности на плоскости без живого менеджера
        const displayPlane = new THREE.Group();
        displayPlane.userData = { entities: [], constraints: [{ uuid: 'old-c' }] };
        let removedConstraints = 0;
        const displayManager = {
            currentPlane: displayPlane,
            entityManager: { entities: [] },
            constraintManager: { removeConstraint() { removedConstraints++; } }
        };
        const displaySession = new SketchSession(displayManager);
        const displayLine = new LineEntity({ start: v3(0, 0), end: v3(5, 0) });
        displayLine.userData.uuid = 'display-line';
        const displayEntities = displaySession.loadDisplayState(displayPlane, {
            entitiesData: [displayLine.toData()],
            constraintsData: [{ uuid: 'new-c' }]
        });
        checks.push({
            name: 'display: сущность создана на плоскости',
            ok: displayEntities.length === 1 &&
                displayPlane.userData.entities.length === 1 &&
                displayPlane.children.some(c => c.userData?.type === 'sketch_element'),
            detail: displayEntities.length
        });
        checks.push({
            name: 'display: ограничения заменены данными, старые сняты',
            ok: displayPlane.userData.constraints.length === 1 &&
                displayPlane.userData.constraints[0].uuid === 'new-c' &&
                removedConstraints === 1,
            detail: `${displayPlane.userData.constraints.length}/${removedConstraints}`
        });
        checks.push({
            name: 'display: статистика помечена display',
            ok: displaySession.lastStats?.display === true && displaySession.lastStats?.entities === 1,
            detail: JSON.stringify(displaySession.lastStats)
        });
    }],

    ['constraint-store', 'ConstraintStore: хранение и выделение', (checks) => {
        const calls = [];
        const entity1 = {};
        const entity2 = {};
        const manager = {
            visualizer: { highlight(_c, on) { calls.push(on ? 'highlight' : 'unhighlight'); } },
            _updateHighlightedEntities() { calls.push('update'); },
            _getConstraintEntities(c) { return c.entities || []; }
        };
        const store = new ConstraintStore(manager);
        const c1 = { uuid: 'c-1', entities: [entity1], toData: () => ({ uuid: 'c-1' }) };
        const c2 = { uuid: 'c-2', entities: [entity2], toData: () => ({ uuid: 'c-2' }) };

        store.add(c1);
        store.add(c2);
        checks.push({ name: 'add: массив и счётчик мутаций', ok: store.constraints.length === 2 && store.mutationSeq === 2, detail: `${store.constraints.length}/${store.mutationSeq}` });

        store.select(c1);
        checks.push({ name: 'select: выделение + визуал', ok: store.isSelected(c1) && calls.includes('highlight') && calls.includes('update'), detail: calls.join(',') });

        store.deselect(c1);
        checks.push({ name: 'deselect', ok: !store.isSelected(c1) && calls.includes('unhighlight'), detail: null });

        store.remove(c1);
        checks.push({ name: 'remove: остаётся одно ограничение', ok: store.constraints.length === 1 && store.constraints[0] === c2, detail: store.constraints.length });

        const saved = store.save();
        checks.push({ name: 'save: сериализация', ok: saved.length === 1 && saved[0].uuid === 'c-2', detail: JSON.stringify(saved) });
        checks.push({ name: 'getForEntities', ok: store.getForEntities([entity2]).length === 1 && store.getForEntities([entity1]).length === 0, detail: null });

        store.clear();
        checks.push({ name: 'clear: массив и выделение пусты', ok: store.constraints.length === 0 && store.selectedConstraints.size === 0, detail: null });
    }],

    ['visualizer-sync', 'ConstraintVisualizer.sync: дифф без полной очистки', (checks) => {
        const visualizer = Object.create(ConstraintVisualizer.prototype);
        visualizer.visualMap = new Map();
        visualizer.constraintManager = { constraints: [] };
        let updates = 0;
        let removals = 0;
        visualizer.updateVisual = function (constraint) {
            updates++;
            if (!this.visualMap.has(constraint)) this.visualMap.set(constraint, {});
        };
        visualizer.removeVisual = function (constraint) {
            removals++;
            this.visualMap.delete(constraint);
        };

        const c1 = { uuid: 'sync-1' };
        const c2 = { uuid: 'sync-2' };
        const c3 = { uuid: 'sync-3' };
        visualizer.visualMap.set(c1, {});
        visualizer.visualMap.set(c2, {});

        const stats = visualizer.sync([c1, c3]);
        checks.push({
            name: 'sync: удалён исчезнувший, создан новый, обновлён существующий',
            ok: stats.removed === 1 && stats.created === 1 && stats.updated === 1 && stats.visuals === 2,
            detail: JSON.stringify(stats)
        });
        checks.push({
            name: 'sync: в карте только актуальные ограничения',
            ok: visualizer.visualMap.has(c1) && visualizer.visualMap.has(c3) && !visualizer.visualMap.has(c2),
            detail: visualizer.visualMap.size
        });
        checks.push({
            name: 'sync: updateVisual вызван по одному разу на актуальное',
            ok: updates === 2 && removals === 1,
            detail: `${updates}/${removals}`
        });
    }],

    ['constraint-hide-all', 'hideAllVisuals: очистка всех групп и тусклости', (checks) => {
        const cm = Object.create(SketchConstraintManager.prototype);
        let cleared = 0;
        let selectionCleared = 0;
        const entity = { dimmed: null, setDimmed(v) { this.dimmed = v; } };
        cm.visualizer = { clearAll() { cleared++; } };
        cm.clearSelection = () => { selectionCleared++; };
        cm.sketchManager = { entityManager: { entities: [entity] } };

        cm.hideAllVisuals();
        checks.push({ name: 'clearAll вызван один раз', ok: cleared === 1, detail: cleared });
        checks.push({ name: 'выделение очищено', ok: selectionCleared === 1, detail: selectionCleared });
        checks.push({ name: 'тусклость снята', ok: entity.dimmed === false, detail: entity.dimmed });
    }],

    ['entity-store-picking', 'EntityStore и Picking', (checks) => {
        // ---------- EntityStore ----------
        let saved = 0;
        const selectedInfo = [];
        const fakeEntityManager = { saveState() { saved++; } };
        fakeEntityManager.sketchManager = {
            currentPlane: {},
            sketchLinewidth: 0,
            editor: { updateSelectedInfo(n) { selectedInfo.push(n); } },
            constraintManager: {
                additionManager: { autoConstrainNewEntities() {} },
                cleanupOrphanedConstraints() {}
            }
        };
        const store = new EntityStore(fakeEntityManager);
        const makeEntity = (uuid) => ({
            plane: {},
            userData: { uuid },
            highlighted: false,
            setPinned() {},
            highlight() { this.highlighted = true; },
            unhighlight() { this.highlighted = false; },
            detach() { this.detached = true; },
            getPoints() { return [v3(0, 0), v3(10, 0)]; }
        });
        const e1 = makeEntity('store-1');
        const e2 = makeEntity('store-2');
        store.addEntity(e1, false, false);
        store.addEntity(e2, false, false);
        checks.push({ name: 'store: addEntity', ok: store.entities.length === 2, detail: store.entities.length });

        store.selectEntity(e1);
        checks.push({ name: 'store: selectEntity + UUID', ok: store.selected.length === 1 && store.getSelectedUUIDs()[0] === 'store-1', detail: JSON.stringify(store.getSelectedUUIDs()) });

        store.restoreSelectionByUUID(['store-2']);
        checks.push({ name: 'store: restoreSelectionByUUID', ok: store.selected.length === 1 && store.selected[0] === e2, detail: store.selected.length });

        store.removeEntity(e1, true);
        checks.push({
            name: 'store: removeEntity удаляет и сохраняет',
            ok: store.entities.length === 1 && e1.detached === true && saved === 1,
            detail: `${store.entities.length}/${saved}`
        });
        store.releaseEntities();
        checks.push({ name: 'store: releaseEntities очищает оба массива', ok: store.entities.length === 0 && store.selected.length === 0, detail: null });

        // ---------- Picking ----------
        const line = new LineEntity({ start: v3(0, 0), end: v3(10, 0) });
        line.userData.uuid = 'pick-line';
        const anchorLine = new LineEntity({ start: v3(0, 0), end: v3(10, 0) });
        anchorLine.userData.uuid = 'pick-anchor';
        anchorLine.userData.isOffsetAnchor = true;
        const picking = new SketchPickingService({
            entities: [line, anchorLine],
            sketchManager: { editor: {} }
        });
        checks.push({
            name: 'picking: находит линию под точкой',
            ok: picking.getEntityAtPoint(v3(5, 0.05, 0)) === line,
            detail: picking.getEntityAtPoint(v3(5, 0.05, 0))?.userData?.uuid ?? null
        });
        checks.push({
            name: 'picking: пропускает анкоры отступа',
            ok: picking.getEntityAtPoint(v3(5, 0.05, 0)) !== anchorLine,
            detail: null
        });
        checks.push({
            name: 'picking: мимо геометрии — null',
            ok: picking.getEntityAtPoint(v3(5, 20, 0)) === null,
            detail: null
        });
    }],

    ['entity-ops', 'Геометрические операции над данными', (checks) => {
        const dataOf = (ent, type) => { const d = ent.toData(); d.userData.uuid = `ops-${type}`; return d; };
        const near = (a, b) => Math.abs(a - b) < 1e-6;

        const line = dataOf(new LineEntity({ start: v3(0, 0), end: v3(10, 0) }), 'line');
        translateEntityData(line, 2, 3);
        checks.push({
            name: 'translate: линия',
            ok: near(line.params.startX, 2) && near(line.params.startY, 3) && near(line.params.endX, 12) && near(line.params.endY, 3),
            detail: JSON.stringify(line.params)
        });

        const circle = dataOf(new CircleEntity({ center: v3(5, 5), radius: 2 }), 'circle');
        translateEntityData(circle, -1, 4);
        checks.push({ name: 'translate: окружность', ok: near(circle.params.centerX, 4) && near(circle.params.centerY, 9), detail: JSON.stringify(circle.params) });

        const poly = dataOf(new PolylineEntity({ points: [v3(0, 0), v3(4, 0), v3(4, 2)] }), 'polyline');
        translateEntityData(poly, 1, -1);
        checks.push({
            name: 'translate: полилиния',
            ok: JSON.stringify(poly.points) === JSON.stringify([[1, -1], [5, -1], [5, 1]]),
            detail: JSON.stringify(poly.points)
        });

        const spline = dataOf(new SplineEntity({ controlPoints: [v3(0, 0), v3(4, 4)] }), 'spline');
        translateEntityData(spline, 0, 2);
        checks.push({
            name: 'translate: сплайн',
            ok: JSON.stringify(spline.controlPoints) === JSON.stringify([[0, 2], [4, 6]]),
            detail: JSON.stringify(spline.controlPoints)
        });

        const rotLine = dataOf(new LineEntity({ start: v3(10, 0), end: v3(20, 0) }), 'rot-line');
        rotateEntityData(rotLine, Math.PI / 2, { x: 0, y: 0 });
        checks.push({
            name: 'rotate: линия вокруг начала координат',
            ok: near(rotLine.params.startX, 0) && near(rotLine.params.startY, 10) && near(rotLine.params.endX, 0) && near(rotLine.params.endY, 20),
            detail: JSON.stringify(rotLine.params)
        });

        const rotArc = dataOf(new ArcEntity({ center: v3(5, 0), radius: 2, startAngle: 0, endAngle: Math.PI / 2 }), 'rot-arc');
        rotateEntityData(rotArc, Math.PI / 2, { x: 0, y: 0 });
        checks.push({
            name: 'rotate: дуга — центр и углы',
            ok: near(rotArc.params.centerX, 0) && near(rotArc.params.centerY, 5) &&
                near(rotArc.params.startAngle, Math.PI / 2) && near(rotArc.params.endAngle, Math.PI),
            detail: JSON.stringify(rotArc.params)
        });

        const rotOval = dataOf(new OvalEntity({ center: v3(5, 0), radiusX: 3, radiusY: 1 }), 'rot-oval');
        rotateEntityData(rotOval, Math.PI / 2, { x: 0, y: 0 });
        checks.push({
            name: 'rotate: овал — центр, без смены rotation',
            ok: near(rotOval.params.centerX, 0) && near(rotOval.params.centerY, 5) && near(rotOval.params.rotation, 0),
            detail: JSON.stringify(rotOval.params)
        });

        const combo = dataOf(new LineEntity({ start: v3(10, 0), end: v3(10, 5) }), 'combo');
        transformEntityData(combo, {
            rotate: { angle: Math.PI / 2, center: { x: 0, y: 0 }, rotateShape: true },
            translate: { x: 1, y: 1 }
        });
        checks.push({
            name: 'transform: сначала поворот, затем сдвиг',
            ok: near(combo.params.startX, 1) && near(combo.params.startY, 11) && near(combo.params.endX, -4) && near(combo.params.endY, 11),
            detail: JSON.stringify(combo.params)
        });

        // зеркало: ось X (0,0)->(1,0) и ось Y (0,0)->(0,1)
        const xAxis = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
        const yAxis = { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } };

        const mL = dataOf(new LineEntity({ start: v3(0, 0), end: v3(10, 5) }), 'mirror-line');
        mirrorEntityData(mL, yAxis.start, yAxis.end);
        checks.push({
            name: 'mirror: линия относительно оси Y',
            ok: near(mL.params.startX, 0) && near(mL.params.startY, 0) && near(mL.params.endX, -10) && near(mL.params.endY, 5),
            detail: JSON.stringify(mL.params)
        });

        const mA = dataOf(new ArcEntity({ center: v3(5, 0), radius: 1, startAngle: 0, endAngle: Math.PI / 2 }), 'mirror-arc');
        mirrorEntityData(mA, yAxis.start, yAxis.end);
        checks.push({
            name: 'mirror: дуга — центр и инверсия обхода',
            ok: near(mA.params.centerX, -5) && near(mA.params.centerY, 0) &&
                near(mA.params.startAngle, Math.PI) && near(mA.params.endAngle, Math.PI / 2),
            detail: JSON.stringify(mA.params)
        });

        const mO = dataOf(new OvalEntity({ center: v3(5, 2), radiusX: 3, radiusY: 1, rotation: 0.3 }), 'mirror-oval');
        mirrorEntityData(mO, xAxis.start, xAxis.end);
        checks.push({
            name: 'mirror: овал сохраняет поворот с обратным знаком',
            ok: near(mO.params.centerX, 5) && near(mO.params.centerY, -2) && near(mO.params.rotation, -0.3),
            detail: JSON.stringify(mO.params)
        });

        const mP = dataOf(new PointEntity({ x: 3, y: 4 }), 'mirror-point');
        mirrorEntityData(mP, xAxis.start, xAxis.end);
        checks.push({ name: 'mirror: точка', ok: near(mP.params.x, 3) && near(mP.params.y, -4), detail: JSON.stringify(mP.params) });
    }],

    ['state-loader', 'Общая загрузка сущностей на плоскость', (checks) => {
        const plane = { uuid: 'loader-plane', add() {}, remove() {} };
        const anchorData = (uuid) => {
            const p = new PointEntity({ x: 1, y: 2 });
            p.userData.uuid = uuid;
            p.userData.isOffsetAnchor = true;
            p.userData.offsetUuid = 'off';
            return p.toData();
        };
        const line = new LineEntity({ start: v3(0, 0), end: v3(5, 0) });
        line.userData.uuid = 'line-1';
        const elements = [
            line.toData(),
            anchorData('anchor-1'),
            anchorData('anchor-1'),          // дубль по UUID
            { formatVersion: 2, type: 'nope' } // неизвестный тип
        ];

        const created = createSketchEntitiesOnPlane(elements, { plane, lineWidth: 3 });
        checks.push({ name: 'создано 2 сущности (линия + один анкор)', ok: created.length === 2, detail: created.map(e => e.type).join(',') });
        checks.push({ name: 'анкор не дублируется по UUID', ok: created.filter(e => e.userData?.isOffsetAnchor).length === 1, detail: null });
        checks.push({ name: 'толщина линии применяется', ok: created[0].linewidth === 3, detail: created[0].linewidth });
        checks.push({ name: 'все привязаны к плоскости', ok: created.every(e => e.plane === plane), detail: null });

        const skipped = createSketchEntitiesOnPlane([anchorData('anchor-1')], {
            plane,
            existingEntities: created
        });
        checks.push({ name: 'существующий анкор не создаётся повторно', ok: skipped.length === 0, detail: skipped.length });
    }],

    ['derived-offset-guard', 'Ограничения на производный offset отклоняются', (checks) => {
        const cm = Object.create(SketchConstraintManager.prototype);
        const offset = { type: 'offset' };
        const line = { type: 'line' };
        const anchor = { type: 'point', userData: { isOffsetAnchor: true } };
        cm._getConstraintEntities = (c) => c.entities || [];
        cm._log = () => {};
        cm.sketchManager = { addConstraints: true, editor: { showStatus() {} } };
        cm.isConstraintDuplicate = () => false;
        cm.solve = () => {};
        const added = [];
        cm._addSingleConstraint = (c) => added.push(c);

        checks.push({ name: 'offset определяется как производный', ok: cm._isDerivedOffsetConstraint({ entities: [line, offset] }) === true, detail: null });
        checks.push({ name: 'анкор отступа не считается производным', ok: cm._isDerivedOffsetConstraint({ entities: [anchor] }) === false, detail: null });

        cm.addConstraints([{ entities: [offset] }, { entities: [line] }], { checkConflicts: false, solve: false });
        checks.push({ name: 'ограничение на offset отфильтровано, обычное добавлено', ok: added.length === 1 && added[0].entities[0] === line, detail: added.length });
    }],

    ['offset-finalize-suppress', 'finalize подавляет saveState на всё время', (checks) => {
        const service = Object.create(OffsetAnchorService.prototype);
        const flags = [];
        const em = {
            _suppressSave: false,
            entities: [],
            removeEntity() {},
            sketchManager: { constraintManager: null }
        };
        const offset = {
            type: 'offset',
            rebuild() { flags.push(em._suppressSave); },
            ensureAnchors() {},
            _hasConstrainedAnchors() { return false; }
        };
        em.entities.push(offset);
        em.sketchManager = { constraintManager: null };
        service.entityManager = em;
        service.finalize();
        checks.push({ name: 'во время rebuild saveState подавлен', ok: flags[0] === true, detail: flags[0] });
        checks.push({ name: 'после finalize флаг снят', ok: em._suppressSave === false, detail: em._suppressSave });
    }],

    ['history-reentrancy', 'SketchHistory.saveState не рекурсирует', (checks) => {
        const history = Object.create(SketchHistory.prototype);
        history._saving = true;
        checks.push({ name: 'повторный вход возвращает false', ok: history.saveState() === false, detail: null });
        history._saving = false;
        history.sketchManager = { entityManager: null };
        checks.push({ name: 'обычный выход сбрасывает _saving', ok: history.saveState() === false && history._saving === false, detail: history._saving });
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

        // rebuild не удался / исходников ещё нет — геометрии нет, но живые
        // анкоры удалять нельзя: на них ссылаются ограничения.
        off._cachedResults = [];
        const kept = off.ensureAnchors();
        checks.push({
            name: 'без геометрии сохранённые анкоры не удаляются',
            ok: kept.length === 3 && manager.entities.filter(e => e.userData?.isOffsetAnchor).length === 3,
            detail: kept.length
        });
    }],

    ['state-io', 'Чтение и очистка состояния плоскости', (checks) => {
        // readSketchState: единый снимок плоскости для onModelRebuilt/входа.
        const plane = new THREE.Group();
        plane.userData.entities = [
            { userData: { uuid: 'e-1' }, toData: () => ({ formatVersion: 2, type: 'line', userData: { uuid: 'e-1' } }) }
        ];
        plane.userData.constraints = [
            { toData: () => ({ uuid: 'c-1', type: 'horizontal' }) },
            { uuid: 'c-2', type: 'vertical' }   // уже данные — не трогаем
        ];
        const state = readSketchState(plane);
        checks.push({ name: 'состояние: сущности сериализованы', ok: state.entitiesData.length === 1 && state.entitiesData[0].userData.uuid === 'e-1', detail: state.entitiesData.length });
        checks.push({ name: 'состояние: ограничения-данные сохраняются как есть', ok: state.constraintsData.length === 2 && state.constraintsData[1].uuid === 'c-2', detail: state.constraintsData.length });

        const empty = readSketchState({ userData: {} });
        checks.push({ name: 'состояние: пустая плоскость → пустые массивы', ok: empty.entitiesData.length === 0 && empty.constraintsData.length === 0, detail: null });

        // disposeSketchEntityMeshes: удаляет только sketch_element и чистит map.
        let geometryDisposed = false;
        let materialDisposed = false;
        let mapDisposed = false;
        const geometry = new THREE.BufferGeometry();
        geometry.dispose = () => { geometryDisposed = true; };
        const map = new THREE.Texture();
        map.dispose = () => { mapDisposed = true; };
        const material = new THREE.MeshBasicMaterial({ map });
        material.dispose = () => { materialDisposed = true; };

        const sketchMesh = new THREE.Mesh(geometry, material);
        sketchMesh.userData.type = 'sketch_element';
        const otherMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
        plane.add(sketchMesh, otherMesh);

        const removed = disposeSketchEntityMeshes(plane);
        checks.push({ name: 'очистка: удалён 1 sketch_element', ok: removed === 1 && !plane.children.includes(sketchMesh), detail: removed });
        checks.push({ name: 'очистка: посторонний меш остался', ok: plane.children.includes(otherMesh), detail: plane.children.length });
        checks.push({ name: 'очистка: geometry/material/material.map освобождены', ok: geometryDisposed && materialDisposed && mapDisposed, detail: `${geometryDisposed}/${materialDisposed}/${mapDisposed}` });
        checks.push({ name: 'очистка: без плоскости — 0', ok: disposeSketchEntityMeshes(null) === 0, detail: null });
    }],

    ['delta-epsilon', 'Дельта сохранения: допуск решателя', (checks) => {
        const plane = new THREE.Group();
        plane.uuid = 'plane-epsilon';
        plane.userData.type = 'sketch_plane';
        plane.userData.entities = [];
        const { manager, sketchManager } = makeManagerHarness(plane);

        const line = new LineEntity({ start: v3(0, 0), end: v3(10, 0) });
        line.userData.uuid = 'eps-line';
        const base = line.toData();

        const drift = JSON.parse(JSON.stringify(base));
        drift.params.endX += 5e-7;
        const small = manager.sketchManager.history._computeDelta([drift], [], [base], []);
        checks.push({
            name: 'дрейф 5e-7 не считается изменением',
            ok: small.elements.length === 0 && small.removedEntityUUIDs.length === 0,
            detail: small.elements.length
        });

        const moved = JSON.parse(JSON.stringify(base));
        moved.params.endX += 0.01;
        const big = manager.sketchManager.history._computeDelta([moved], [], [base], []);
        checks.push({ name: 'реальное изменение 0.01 мм попадает в дельту', ok: big.elements.length === 1, detail: big.elements.length });

        // Хеш исходников отступа не должен реагировать на дрейф решателя.
        manager.addEntity(line, false, false);
        const off = new OffsetEntity({ sourceEntities: [line], offsetDistance: 5, offsetMethod: 'parallel' });
        off.sketchManager = sketchManager;
        off.userData.uuid = 'eps-offset';
        const hash1 = off._computeHash();
        line.setParams({ endX: line.params.endX + 5e-7 }, true, false);
        const hash2 = off._computeHash();
        line.setParams({ endX: line.params.endX + 0.01 }, true, false);
        const hash3 = off._computeHash();
        checks.push({ name: 'sourceHash: дрейф 5e-7 не меняет хеш', ok: hash1 === hash2, detail: hash1 === hash2 });
        checks.push({ name: 'sourceHash: изменение 0.01 меняет хеш', ok: hash2 !== hash3, detail: hash2 !== hash3 });
    }],

    ['history-service', 'SketchHistory: полный дамп и дельта', (checks) => {
        const ops = [];
        const entities = [];
        const fakeEntity = (uuid, x) => ({
            userData: { uuid },
            toData: () => ({
                formatVersion: 2,
                type: 'line',
                params: { startX: x, startY: 0, endX: x + 10, endY: 0 },
                userData: { uuid }
            })
        });
        entities.push(fakeEntity('h-1', 0));

        const fakeSketchManager = {
            currentPlane: { uuid: 'plane-history', userData: {} },
            entityManager: { entities, _suppressSave: false, _loadingState: false },
            constraintManager: { saveConstraints: () => [] },
            editor: { parametricModel: { addOperation(op) { ops.push(op); } } }
        };
        const history = new SketchHistory(fakeSketchManager);

        checks.push({
            name: 'первое сохранение — полный дамп',
            ok: history.saveState() === true && ops.length === 1 &&
                ops[0].parameters.elements.length === 1 && !ops[0].parameters.removedEntityUUIDs,
            detail: ops.length
        });
        checks.push({ name: 'без изменений операция не пишется', ok: history.saveState() === false && ops.length === 1, detail: ops.length });

        entities.push(fakeEntity('h-2', 50));
        checks.push({
            name: 'новая сущность — delta.elements',
            ok: history.saveState() === true && ops.length === 2 &&
                ops[1].parameters.elements.length === 1 &&
                ops[1].parameters.elements[0].userData.uuid === 'h-2',
            detail: ops[1]?.parameters?.elements?.length ?? null
        });

        entities.splice(0, 1);
        checks.push({
            name: 'удалённая сущность — removedEntityUUIDs',
            ok: history.saveState() === true && ops.length === 3 &&
                JSON.stringify(ops[2].parameters.removedEntityUUIDs) === JSON.stringify(['h-1']),
            detail: JSON.stringify(ops[2]?.parameters?.removedEntityUUIDs ?? null)
        });
        checks.push({
            name: 'baseline обновлён после сохранения',
            ok: history.lastSavedState.entities.length === 1 &&
                history.lastSavedState.entities[0].userData.uuid === 'h-2',
            detail: history.lastSavedState.entities.length
        });

        fakeSketchManager.entityManager._suppressSave = true;
        const suppressed = history.saveState();
        fakeSketchManager.entityManager._suppressSave = false;
        checks.push({ name: 'suppressSave блокирует запись', ok: suppressed === false && ops.length === 3, detail: suppressed });
    }],

    ['mcp-offset-guard', 'MCP: ограничения на offset отклоняются по данным', (checks) => {
        const entities = new Map([
            ['off', { type: 'offset' }],
            ['line', { type: 'line' }],
            ['anchor', { type: 'point', userData: { isOffsetAnchor: true } }]
        ]);
        checks.push({ name: 'coincident на offset', ok: isOffsetConstraintData({ type: 'coincident', entity1UUID: 'line', entity2UUID: 'off' }, entities) === true, detail: null });
        checks.push({ name: 'coincident на анкор разрешён', ok: isOffsetConstraintData({ type: 'coincident', entity1UUID: 'line', entity2UUID: 'anchor' }, entities) === false, detail: null });
        checks.push({ name: 'distance на offset', ok: isOffsetConstraintData({ type: 'distance', entityUUID: 'off' }, entities) === true, detail: null });
    }],

    ['gizmo-scale', 'Стрелки move и значок offset держат экранный размер', (checks) => {
        checks.push({
            name: 'стрелка: масштаб обратно пропорционален px/мм',
            ok: Math.abs(arrowScaleForPx(10, 6, 60) - 1) < 1e-9 &&
                Math.abs(arrowScaleForPx(20, 6, 60) - 0.5) < 1e-9,
            detail: `${arrowScaleForPx(10, 6, 60)}/${arrowScaleForPx(20, 6, 60)}`
        });

        const arrow = new SketchArrow2D(null, 'x', 1, 6);
        arrow.setScale(2);
        checks.push({
            name: 'стрелка: scale и мировой хитбокс обновлены',
            ok: arrow.group.scale.x === 2 && arrow.worldSize === 12 && arrow.hitboxSize === 12,
            detail: `${arrow.group.scale.x}/${arrow.worldSize}/${arrow.hitboxSize}`
        });

        checks.push({
            name: 'offset: масштаб обратно пропорционален px/мм',
            ok: Math.abs(offsetIconScaleForPx(10, 2, 20) - 1) < 1e-9 &&
                Math.abs(offsetIconScaleForPx(20, 2, 20) - 0.5) < 1e-9,
            detail: `${offsetIconScaleForPx(10, 2, 20)}/${offsetIconScaleForPx(20, 2, 20)}`
        });
    }],

    ['array-tool-base', 'Общая база инструментов-массивов', (checks) => {
        const fake = (coords) => ({ getPoints: () => coords.map(([x, y]) => v3(x, y)) });
        const bounds = getEntitiesBounds([fake([[0, 0], [10, 2]]), fake([[-3, 5], [4, 7]])]);
        checks.push({
            name: 'габариты объединяют все сущности',
            ok: bounds?.minX === -3 && bounds?.maxX === 10 && bounds?.minY === 0 && bounds?.maxY === 7 &&
                bounds?.width === 13 && bounds?.height === 7,
            detail: JSON.stringify(bounds)
        });
        checks.push({ name: 'пустой набор → null', ok: getEntitiesBounds([]) === null, detail: null });
        checks.push({
            name: 'linear array наследует общую базу',
            ok: LinearArraySketchTool.prototype instanceof ArraySketchToolBase,
            detail: null
        });
        checks.push({
            name: 'circular array наследует общую базу',
            ok: CircularArraySketchTool.prototype instanceof ArraySketchToolBase,
            detail: null
        });
    }],

    ['sketch-debug', 'Отладочный флаг эскиза', (checks) => {
        const original = settings.get('sketch.debug');
        try {
            settings.set('sketch.debug', false);
            checks.push({ name: 'по умолчанию (настройка false) логи выключены', ok: isSketchDebug() === false, detail: isSketchDebug() });

            settings.set('sketch.debug', true);
            checks.push({ name: 'настройка sketch.debug включает логи', ok: isSketchDebug() === true, detail: isSketchDebug() });

            setSketchDebug(false);
            checks.push({ name: 'опция конструктора перекрывает настройку', ok: isSketchDebug() === false, detail: isSketchDebug() });

            setSketchDebug(null);
            checks.push({ name: 'сброс override возвращает настройку', ok: isSketchDebug() === true, detail: isSketchDebug() });
        } finally {
            setSketchDebug(null);
            settings.set('sketch.debug', original);
        }
    }],

    ['sketch-lifecycle-offset-anchors', 'Загрузка эскиза: вход → отступ → выход → вход', (checks) => {
        // Регрессия saveState/выхода: applyState создаёт offset раньше, чем
        // его исходники попадают в manager.entities, поэтому rebuild() не
        // находит контуры. Если после загрузки не пересобрать отступ,
        // ensureAnchors() видит 0 кандидатов и удаляет сохранённые анкоры.
        const rect = [[0, 0], [40, 0], [40, 30], [0, 30]];
        const offsetRect = [[-5, -5], [45, -5], [45, 35], [-5, 35]];
        const plane = new THREE.Group();
        plane.uuid = 'plane-lifecycle';
        plane.userData.type = 'sketch_plane';
        plane.userData.entities = [];

        withFakeOffsetGeometry(offsetRect, () => {
            const { manager, sketchManager } = makeManagerHarness(plane);
            const lines = [];
            rect.forEach((p, i) => {
                const next = rect[(i + 1) % rect.length];
                const line = new LineEntity({ start: v3(p[0], p[1]), end: v3(next[0], next[1]) });
                line.userData.uuid = `life-line-${i}`;
                manager.addEntity(line, false, false);
                lines.push(line);
            });
            const off = new OffsetEntity({ sourceEntities: lines, offsetDistance: 5, offsetMethod: 'parallel' });
            off.sketchManager = sketchManager;
            off.userData.uuid = 'life-offset';
            manager.addEntity(off, false, false);

            const savedData = manager.entities.map(e => e.toData());
            const savedAnchorUUIDs = manager.entities
                .filter(e => e.userData?.isOffsetAnchor)
                .map(e => e.userData.uuid);
            checks.push({
                name: 'жизненный цикл: до сохранения 4 анкора',
                ok: savedAnchorUUIDs.length === 4,
                detail: savedAnchorUUIDs.length
            });

            // Сиротский анкор от удалённого отступа: applyState его вычистит,
            // и baseline обязан отражать уже очищенное состояние.
            const ghost = new PointEntity({ x: 100, y: 100 });
            ghost.userData.uuid = 'ghost-anchor';
            ghost.userData.isOffsetAnchor = true;
            ghost.userData.offsetUuid = 'missing-offset';
            const dataWithGhost = [...savedData, ghost.toData()];

            // «выход → повторный вход»: данные грузятся в новый менеджер той же плоскости
            const cycle = (data) => {
                const { manager: m } = makeManagerHarness(plane);
                m.applyState(data, []);
                return {
                    manager: m,
                    count: m.entities.length,
                    anchors: m.entities.filter(e => e.userData?.isOffsetAnchor),
                    offset: m.entities.find(e => e.type === 'offset'),
                    planeAnchors: (plane.userData.entities || []).filter(e => e.userData?.isOffsetAnchor).length,
                    baseline: m.lastSavedState
                };
            };

            const first = cycle(dataWithGhost);
            checks.push({ name: 'жизненный цикл: после входа 9 сущностей', ok: first.count === 9, detail: first.count });
            checks.push({ name: 'жизненный цикл: после входа 4 анкора', ok: first.anchors.length === 4, detail: first.anchors.length });
            checks.push({
                name: 'жизненный цикл: UUID анкоров стабильны',
                ok: JSON.stringify(first.anchors.map(a => a.userData.uuid)) === JSON.stringify(savedAnchorUUIDs),
                detail: JSON.stringify(first.anchors.map(a => a.userData.uuid))
            });
            checks.push({
                name: 'жизненный цикл: offset пересобран после загрузки',
                ok: first.offset?._cachedResults?.length === 1,
                detail: first.offset?._cachedResults?.length ?? null
            });
            checks.push({ name: 'жизненный цикл: в плоскости 4 анкора', ok: first.planeAnchors === 4, detail: first.planeAnchors });
            checks.push({
                name: 'жизненный цикл: baseline — фактическое состояние (9)',
                ok: first.baseline?.entities?.length === 9,
                detail: first.baseline?.entities?.length ?? null
            });
            checks.push({
                name: 'жизненный цикл: сиротский анкор не попал в baseline',
                ok: !first.baseline?.entities?.some(d => d.userData?.uuid === 'ghost-anchor'),
                detail: null
            });
            checks.push({
                name: 'жизненный цикл: в baseline 4 анкора',
                ok: (first.baseline?.entities || []).filter(d => d.userData?.isOffsetAnchor).length === 4,
                detail: (first.baseline?.entities || []).filter(d => d.userData?.isOffsetAnchor).length
            });

            const second = cycle(first.manager.entities.map(e => e.toData()));
            checks.push({ name: 'жизненный цикл: повторный вход сохраняет 4 анкора', ok: second.anchors.length === 4, detail: second.anchors.length });
            checks.push({ name: 'жизненный цикл: повторный вход — 9 сущностей', ok: second.count === 9, detail: second.count });
        });
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
