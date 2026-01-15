// ExtrudeManager.js - упрощенная версия с геометрической проверкой
class ExtrudeManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.figureManager = cadEditor.objectsManager.figureManager;

        // Для предпросмотра
        this.extrudePreviewGroup = null;
        this.previewMaterial = null;

        // Выделение
        this.selectedFigures = new Map(); // id -> figure
        this.basePlane = null;

        // Для стрелки
        this.extrudeArrow = null;
        this.isDraggingArrow = false;
        this.arrowStartHeight = 0;
        this.startMouseY = 0;

        // Для подсветки стрелки
        this.isArrowHovered = false;
        this.arrowNormalColor = 0x00FF00;
        this.arrowHoverColor = 0x00FF88;

        // Для подсветки фигур
        this.hoveredFigure = null;
        this.hoveredColor = 0xFFFF00;
        this.selectedColor = 0x0066FF;

        // Предотвращение двойного клика
        this.isProcessingClick = false;

        // Объединение фигур
        this.mergeConnectedFigures = false;
        this.mergeThreshold = 0.1;

        console.log("ExtrudeManager: создан (доработанная версия)");
    }

    // === ОСНОВНЫЕ МЕТОДЫ ===

    initialize() {
        console.log("ExtrudeManager: инициализация");
        if (!this.figureManager) {
            console.error("ExtrudeManager: FigureManager не найден!");
            return;
        }
        this.figureManager.collectAllFigures();
    }

    // Обработка клика по фигуре
    handleFigureClick(event) {
        console.log("=== handleFigureClick ===");

        if (this.isProcessingClick) {
            return false;
        }

        this.isProcessingClick = true;

        try {
            const allFigures = this.figureManager.getAllFigures();
            if (allFigures.length === 0) {
                console.log("Нет фигур для выбора");
                return false;
            }

            // Ищем фигуру с учетом ее собственной плоскости
            const figure = this.findFigureAtPoint(event, allFigures);
            if (!figure) {
                console.log("Не найдена фигура под курсором");
                return false;
            }

            console.log("Найдена фигура:", figure.id, "плоскость:", this.getFigurePlane(figure)?.uuid);

            this.toggleSelection(figure);
            this.updateExtrudePreview();
            this.updateExtrudeUI();
            this.createExtrudeDirectionIndicator();

            return true;
        } finally {
            setTimeout(() => {
                this.isProcessingClick = false;
            }, 50);
        }
    }

    isPlaneVisible(plane) {
        if (!plane) return false;

        // Проверяем стандартное свойство visible THREE.js
        if (!plane.visible) return false;

        // Проверяем пользовательские данные
        if (plane.userData && plane.userData.visible === false) {
            return false;
        }

        // Проверяем видимость всех родителей
        let parent = plane.parent;
        while (parent) {
            if (!parent.visible) return false;
            parent = parent.parent;
        }

        return true;
    }

    // Найти фигуру в точке
    findFigureAtPoint(event, figures) {
        const sorted = [...figures].sort((a, b) => {
            if (a.depth !== b.depth) return b.depth - a.depth;
            return a.area - b.area;
        });

        for (const figure of sorted) {
            if (!figure.outer || !figure.outer.points) continue;

            const figurePlane = this.getFigurePlane(figure);
            if (!figurePlane) continue;

            // Проверяем видимость плоскости
            if (!this.isPlaneVisible(figurePlane)) {
                continue; // Пропускаем фигуры на скрытых плоскостях
            }

            const point = this.getPointOnPlane(event, figurePlane);
            if (!point) continue;

            const localPoint = figurePlane.worldToLocal(point.clone());
            const localPoint2D = new THREE.Vector2(localPoint.x, localPoint.y);

            if (this.isPointInContour(localPoint2D, figure.outer.points)) {
                return figure;
            }
        }

        return null;
    }

    // Пересчитать базовую плоскость на основе выбранных фигур
    recalculateBasePlane() {
        if (this.selectedFigures.size === 0) {
            this.basePlane = null;
            return;
        }

        // Берем плоскость первой выбранной фигуры как эталон
        const firstFigure = this.selectedFigures.values().next().value;
        this.basePlane = this.getFigurePlane(firstFigure);

        console.log("Пересчитана базовая плоскость:", this.basePlane?.uuid);
    }

    // Переключить выделение фигуры
    toggleSelection(figure) {
        const figureId = figure.id;

        if (this.selectedFigures.has(figureId)) {
            this.selectedFigures.delete(figureId);
            this.unhighlightFigure(figure);

            // Если фигур не осталось, сбрасываем плоскость
            if (this.selectedFigures.size === 0) {
                this.basePlane = null;
            } else {
                // Иначе пересчитываем базовую плоскость из оставшихся фигур
                this.recalculateBasePlane();
            }
        } else {
            this.selectedFigures.set(figureId, figure);

            // ВСЕГДА обновляем базовую плоскость при добавлении новой фигуры
            const figurePlane = this.getFigurePlane(figure);

            if (!this.basePlane) {
                // Если базовая плоскость еще не установлена
                this.basePlane = figurePlane;
            } else {
                // Если уже есть фигуры, проверяем совместимость плоскостей
                if (!this.arePlanesCompatible(this.basePlane, figurePlane)) {
                    // Если плоскости несовместимы, показываем ошибку
                    this.editor.showStatus('Выбраны фигуры на разных плоскостях!', 'error');
                    this.selectedFigures.delete(figureId); // Отменяем выбор
                    return;
                }
            }

            this.highlightFigure(figure, this.selectedColor);
        }

        console.log("Выделено фигур:", this.selectedFigures.size, "Базовая плоскость:", this.basePlane?.uuid);
    }

    // Получить фигуры для вытягивания
    getFiguresForExtrusion() {
        const result = [];
        const processedFigures = new Set();

        console.log("=== getFiguresForExtrusion ===");
        console.log("Выделено фигур:", this.selectedFigures.size);

        // Если выбрано несколько фигур и включено объединение, проверяем соединение
        if (this.selectedFigures.size > 1 && this.mergeConnectedFigures) {
            const figuresArray = Array.from(this.selectedFigures.values());

            // Фильтруем фигуры на скрытых плоскостях
            const visibleFigures = figuresArray.filter(figure => {
                const plane = this.getFigurePlane(figure);
                return plane && this.isPlaneVisible(plane);
            });

            if (visibleFigures.length === 0) {
                console.log("Все выбранные фигуры на скрытых плоскостях");
                return result;
            }

            if (visibleFigures.length !== figuresArray.length) {
                this.editor.showStatus('Некоторые фигуры на скрытых плоскостях не учитываются', 'warning');
            }

            // Проверяем, все ли фигуры на одной плоскости
            const allSamePlane = this.areAllFiguresOnSamePlane(visibleFigures);
            if (!allSamePlane) {
                console.log("Фигуры на разных плоскостях, объединение невозможно");
                return this.getIndividualFigures(visibleFigures);
            }

            // Проверяем геометрическое соединение
            const connected = this.areFiguresGeometricallyConnected(visibleFigures);
            if (connected) {
                console.log("Фигуры геометрически соединены, создаем объединенную фигуру");
                const mergedFigure = this.createMergedFigureFromConnected(visibleFigures);
                if (mergedFigure) {
                    return [mergedFigure];
                }
            } else {
                console.log("Фигуры не соединены геометрически");
            }
        }

        // Возвращаем фигуры по отдельности
        return this.getIndividualFigures(Array.from(this.selectedFigures.values()));
    }

    // Получить фигуры по отдельности
    getIndividualFigures(figures) {
        const result = [];
        const processedFigures = new Set();

        for (const figure of figures) {
            if (processedFigures.has(figure.id)) continue;

            console.log(`Обрабатываем фигуру ${figure.id}: isHole=${figure.isHole}, depth=${figure.depth}`);

            // Собираем все отверстия этой фигуры (вложенность 1)
            const allHoles = this.getAllImmediateHoles(figure);
            console.log(`  Найдено отверстий вложенности 1: ${allHoles.length}`);

            // Создаем фигуру для вытягивания
            const extrusionFigure = {
                id: figure.id,
                outer: figure.outer,
                holes: allHoles,
                area: figure.area,
                isHole: figure.isHole,
                parentId: figure.parentId,
                childrenIds: figure.childrenIds,
                depth: figure.depth
            };

            result.push(extrusionFigure);
            processedFigures.add(figure.id);

            console.log(`  Добавлена фигура с ${allHoles.length} отверстиями`);
        }

        console.log("Итого фигур для вытягивания:", result.length);
        return result;
    }

    // Проверить, все ли фигуры на одной плоскости
    areAllFiguresOnSamePlane(figures) {
        if (figures.length < 2) return true;

        const firstPlane = this.getFigurePlane(figures[0]);
        if (!firstPlane) return false;

        for (let i = 1; i < figures.length; i++) {
            const plane = this.getFigurePlane(figures[i]);
            if (!plane || !this.arePlanesCompatible(firstPlane, plane)) {
                return false;
            }
        }

        return true;
    }

    // Проверить геометрическое соединение фигур
    areFiguresGeometricallyConnected(figures) {
        if (figures.length < 2) return true;

        // Создаем Bounding Box для каждой фигуры в локальных координатах базовой плоскости
        const boundingBoxes = figures.map(figure => {
            const points = this.getFigurePointsForBasePlane(figure);
            if (!points || points.length === 0) return null;

            const bbox = new THREE.Box2();
            points.forEach(point => {
                bbox.expandByPoint(new THREE.Vector2(point.x, point.y));
            });

            // Немного расширяем bbox для учёта погрешностей
            bbox.expandByScalar(this.mergeThreshold);

            return {
                figure,
                bbox,
                points
            };
        }).filter(item => item !== null);

        // Проверяем пересечение bounding box
        for (let i = 0; i < boundingBoxes.length; i++) {
            for (let j = i + 1; j < boundingBoxes.length; j++) {
                if (boundingBoxes[i].bbox.intersectsBox(boundingBoxes[j].bbox)) {
                    // Если bbox пересекаются, проверяем геометрическое соединение более точно
                    if (this.areTwoFiguresConnected(boundingBoxes[i], boundingBoxes[j])) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    // Проверить соединение двух фигур
    areTwoFiguresConnected(fig1, fig2) {
        // 1. Проверяем пересечение контуров
        if (this.doContoursIntersect(fig1.points, fig2.points)) {
            return true;
        }

        // 2. Проверяем, что одна фигура полностью внутри другой
        // (это тоже считается соединением для вложенных фигур)
        if (this.isContourInsideAnother(fig1.points, fig2.points) ||
            this.isContourInsideAnother(fig2.points, fig1.points)) {
            return true;
        }

        // 3. Проверяем близость вершин
        return this.areVerticesClose(fig1.points, fig2.points);
    }

    // Проверить пересечение контуров
    doContoursIntersect(points1, points2) {
        // Проверяем пересечение отрезков
        for (let i = 0; i < points1.length; i++) {
            const p1 = points1[i];
            const p2 = points1[(i + 1) % points1.length];

            for (let j = 0; j < points2.length; j++) {
                const p3 = points2[j];
                const p4 = points2[(j + 1) % points2.length];

                if (this.segmentsIntersect(p1, p2, p3, p4)) {
                    return true;
                }
            }
        }

        return false;
    }

    // Проверить, находится ли один контур внутри другого
    isContourInsideAnother(innerPoints, outerPoints) {
        // Проверяем несколько точек внутреннего контура
        for (const point of innerPoints) {
            if (!this.isPointInContour(point, outerPoints)) {
                return false;
            }
        }
        return true;
    }

    // Проверить близость вершин
    areVerticesClose(points1, points2) {
        const thresholdSq = this.mergeThreshold * this.mergeThreshold;

        for (const p1 of points1) {
            for (const p2 of points2) {
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < thresholdSq) {
                    return true;
                }
            }
        }

        return false;
    }

    // Проверить пересечение двух отрезков
    segmentsIntersect(p1, p2, p3, p4) {
        const d1 = this.direction(p3, p4, p1);
        const d2 = this.direction(p3, p4, p2);
        const d3 = this.direction(p1, p2, p3);
        const d4 = this.direction(p1, p2, p4);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        // Проверяем коллинеарные случаи
        if (d1 === 0 && this.onSegment(p3, p4, p1)) return true;
        if (d2 === 0 && this.onSegment(p3, p4, p2)) return true;
        if (d3 === 0 && this.onSegment(p1, p2, p3)) return true;
        if (d4 === 0 && this.onSegment(p1, p2, p4)) return true;

        return false;
    }

    // Проверить, лежит ли точка на отрезке
    onSegment(p1, p2, p) {
        return Math.min(p1.x, p2.x) <= p.x && p.x <= Math.max(p1.x, p2.x) &&
               Math.min(p1.y, p2.y) <= p.y && p.y <= Math.max(p1.y, p2.y);
    }

    // Определить направление
    direction(p1, p2, p3) {
        return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
    }

    // Создать объединенную фигуру из соединённых фигур
    createMergedFigureFromConnected(figures) {
        console.log("Создание объединенной фигуры из", figures.length, "фигур");

        // Находим все точки всех фигур
        const allPoints = [];
        const allHoles = [];

        for (const figure of figures) {
            const points = this.getFigurePointsForBasePlane(figure);
            allPoints.push(...points);

            // Добавляем отверстия этой фигуры
            const holes = this.getAllImmediateHoles(figure);
            allHoles.push(...holes);
        }

        if (allPoints.length === 0) {
            console.log("Нет точек для создания фигуры");
            return null;
        }

        // Создаем выпуклую оболочку из всех точек
        const convexHull = this.createConvexHull(allPoints);
        if (!convexHull || convexHull.length < 3) {
            console.log("Не удалось создать выпуклую оболочку");
            return null;
        }

        return {
            id: 'merged_' + Date.now(),
            outer: {
                points: convexHull,
                center: this.calculateContourCenter(convexHull),
                area: this.calculateSignedPolygonArea(convexHull)
            },
            holes: allHoles.map(hole => ({
                points: this.getContourPointsForBasePlane(hole),
                center: this.calculateContourCenter(this.getContourPointsForBasePlane(hole)),
                area: this.calculateSignedPolygonArea(this.getContourPointsForBasePlane(hole))
            })),
            area: this.calculateSignedPolygonArea(convexHull),
            isHole: false,
            parentId: null,
            childrenIds: [],
            depth: figures[0].depth,
            isMerged: true,
            sourceFigures: figures.map(f => f.id),
            geometricMerge: true
        };
    }

    // Создать выпуклую оболочку
    createConvexHull(points) {
        if (points.length < 3) return points;

        // Удаляем дубликаты
        const uniquePoints = [];
        const seen = new Set();

        for (const point of points) {
            const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniquePoints.push(point);
            }
        }

        if (uniquePoints.length < 3) return uniquePoints;

        // Находим самую левую нижнюю точку
        let startIndex = 0;
        for (let i = 1; i < uniquePoints.length; i++) {
            if (uniquePoints[i].y < uniquePoints[startIndex].y ||
                (uniquePoints[i].y === uniquePoints[startIndex].y &&
                 uniquePoints[i].x < uniquePoints[startIndex].x)) {
                startIndex = i;
            }
        }

        // Начинаем с самой левой нижней точки
        const hull = [];
        let current = startIndex;

        do {
            hull.push(uniquePoints[current]);

            let next = (current + 1) % uniquePoints.length;

            for (let i = 0; i < uniquePoints.length; i++) {
                if (i === current) continue;

                const cross = this.crossProduct(
                    uniquePoints[current],
                    uniquePoints[i],
                    uniquePoints[next]
                );

                if (cross > 0 ||
                    (cross === 0 &&
                     this.distanceSquared(uniquePoints[current], uniquePoints[i]) >
                     this.distanceSquared(uniquePoints[current], uniquePoints[next]))) {
                    next = i;
                }
            }

            current = next;
        } while (current !== startIndex);

        return hull;
    }

    // Вычислить квадрат расстояния
    distanceSquared(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return dx * dx + dy * dy;
    }

    // Векторное произведение
    crossProduct(p1, p2, p3) {
        return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    }

    // Вычислить центр контура
    calculateContourCenter(points) {
        if (points.length === 0) return new THREE.Vector2(0, 0);

        let sumX = 0;
        let sumY = 0;

        points.forEach(p => {
            sumX += p.x;
            sumY += p.y;
        });

        return new THREE.Vector2(sumX / points.length, sumY / points.length);
    }

    // Получить все непосредственные отверстия
    getAllImmediateHoles(figure) {
        const holes = [];

        if (figure.childrenIds && figure.childrenIds.length > 0) {
            for (const childId of figure.childrenIds) {
                const childFigure = this.figureManager.getFigureById(childId);
                if (childFigure) {
                    if ((!figure.isHole && childFigure.isHole) ||
                        (figure.isHole && !childFigure.isHole)) {
                        holes.push(childFigure.outer);
                        console.log(`    Добавлено отверстие: ${childId}, isHole=${childFigure.isHole}`);
                    }
                }
            }
        }

        return holes;
    }

    // === ПОДСВЕТКА ===

    highlightFigure(figure, color) {
        if (!figure || !figure.outer) return;

        if (figure.outer.element) {
            this.editor.objectsManager.safeSetElementColor(figure.outer.element, color);
        } else if (figure.outer.elements) {
            figure.outer.elements.forEach(element => {
                this.editor.objectsManager.safeSetElementColor(element, color);
            });
        }
    }

    unhighlightFigure(figure) {
        if (!figure || !figure.outer) return;

        // Не снимаем выделение с выбранных фигур
        if (this.selectedFigures.has(figure.id)) {
            return;
        }

        if (figure.outer.element) {
            this.editor.objectsManager.safeRestoreElementColor(figure.outer.element);
        } else if (figure.outer.elements) {
            figure.outer.elements.forEach(element => {
                this.editor.objectsManager.safeRestoreElementColor(element);
            });
        }
    }

    // Подсветка при наведении
    highlightFiguresOnHover(event) {
        // Всегда очищаем предыдущую подсветку при наведении
        if (this.hoveredFigure && !this.selectedFigures.has(this.hoveredFigure.id)) {
            this.unhighlightFigure(this.hoveredFigure);
            this.hoveredFigure = null;
        }

        // Если перетаскиваем стрелку - не подсвечиваем
        if (this.isDraggingArrow) {
            return;
        }

        const allFigures = this.figureManager.getAllFigures();
        const figure = this.findFigureAtPoint(event, allFigures);

        if (figure) {
            // Не подсвечиваем уже выбранные фигуры
            if (this.selectedFigures.has(figure.id)) {
                if (this.hoveredFigure) {
                    this.hoveredFigure = null;
                }
                document.body.style.cursor = 'default';
                return;
            }

            // Подсвечиваем новую фигуру
            this.hoveredFigure = figure;
            this.highlightFigure(figure, this.hoveredColor);
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }
    }

    // Очистить выделение
    clearSelection() {
        console.log("=== clearSelection ===");

        for (const figure of this.selectedFigures.values()) {
            this.unhighlightFigure(figure);
        }

        this.selectedFigures.clear();
        this.basePlane = null; // ВАЖНО: сбрасываем плоскость!

        if (this.hoveredFigure) {
            this.unhighlightFigure(this.hoveredFigure);
            this.hoveredFigure = null;
        }

        document.body.style.cursor = 'default';
    }

    // === ГЕОМЕТРИЧЕСКИЕ МЕТОДЫ ===

    getPointOnPlane(event, targetPlane = null) {
        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        // Если указана целевая плоскость, используем ее
        if (targetPlane) {
            const planeNormal = new THREE.Vector3(0, 0, 1);
            planeNormal.applyQuaternion(targetPlane.quaternion);
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(planeNormal, targetPlane.position);

            const intersection = new THREE.Vector3();
            if (this.editor.raycaster.ray.intersectPlane(plane, intersection)) {
                return intersection;
            }
        }

        // Если нет целевой плоскости, но есть basePlane, используем ее
        if (this.basePlane) {
            const planeNormal = new THREE.Vector3(0, 0, 1);
            planeNormal.applyQuaternion(this.basePlane.quaternion);
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(planeNormal, this.basePlane.position);

            const intersection = new THREE.Vector3();
            if (this.editor.raycaster.ray.intersectPlane(plane, intersection)) {
                return intersection;
            }
        }

        // В противном случае ищем любую плоскость
        const sketchPlanes = this.editor.sketchPlanes || [];
        const workPlanes = this.editor.workPlanes || [];
        const allPlanes = [...sketchPlanes, ...workPlanes];

        for (const plane of allPlanes) {
            const planeNormal = new THREE.Vector3(0, 0, 1);
            planeNormal.applyQuaternion(plane.quaternion);
            const planeObj = new THREE.Plane();
            planeObj.setFromNormalAndCoplanarPoint(planeNormal, plane.position);

            const intersection = new THREE.Vector3();
            if (this.editor.raycaster.ray.intersectPlane(planeObj, intersection)) {
                return intersection;
            }
        }

        return null;
    }

    isPointInContour(point, contourPoints) {
        if (contourPoints.length < 3) return false;

        let inside = false;
        const n = contourPoints.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = contourPoints[i].x;
            const yi = contourPoints[i].y;
            const xj = contourPoints[j].x;
            const yj = contourPoints[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
    }

    getFigurePlane(figure) {
        let element = null;

        if (figure.element) {
            element = figure.element;
        } else if (figure.outer && figure.outer.element) {
            element = figure.outer.element;
        } else if (figure.outer && figure.outer.elements && figure.outer.elements.length > 0) {
            element = figure.outer.elements[0];
        }

        if (element) {
            return this.findSketchPlaneForElement(element);
        }

        return null;
    }

    findSketchPlaneForElement(element) {
        if (!element) return null;

        let parent = element.parent;
        while (parent) {
            if (parent.userData &&
                (parent.userData.type === 'sketch_plane' ||
                 parent.userData.type === 'work_plane')) {
                return parent;
            }
            parent = parent.parent;
        }

        return this.editor.sketchPlanes.length > 0 ?
               this.editor.sketchPlanes[0] :
               this.editor.workPlanes.length > 0 ?
               this.editor.workPlanes[0] : null;
    }

    // Вычисление площади многоугольника со знаком
    calculateSignedPolygonArea(points) {
        if (points.length < 3) return 0;

        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return area / 2;
    }

    // Исправление ориентации контуров
    fixContourOrientation(points, shouldBeClockwise) {
        if (points.length < 3) return points;

        const area = this.calculateSignedPolygonArea(points);
        const isCurrentlyClockwise = area < 0;

        if (isCurrentlyClockwise !== shouldBeClockwise) {
            return [...points].reverse();
        }

        return points;
    }

    createExtrusionGeometryFromFigures(figures, height, direction) {
        if (figures.length === 0 || !this.basePlane) return null;

        // Проверка: должна быть базовая плоскость
        if (figures.length === 0 || !this.basePlane) {
            console.error("Нет базовой плоскости для создания геометрии!");
            return null;
        }

        // Проверка: все фигуры должны быть на совместимых плоскостях
        const allSamePlane = this.areAllFiguresOnSamePlane(figures);
        if (!allSamePlane) {
            console.error("Фигуры находятся на разных плоскостях!");
            return null;
        }

        const shapes = [];

        figures.forEach(figure => {
            console.log(`Создание фигуры: ${figure.id}, isHole: ${figure.isHole}, отверстий: ${figure.holes ? figure.holes.length : 0}`);

            const outerPoints = this.getFigurePointsForBasePlane(figure);
            if (outerPoints.length < 3) {
                console.log(`  Недостаточно точек: ${outerPoints.length}`);
                return;
            }

            let shouldBeClockwise = false;

            if (figure.isHole) {
                shouldBeClockwise = false;
            }

            const correctedOuterPoints = this.fixContourOrientation(outerPoints, shouldBeClockwise);

            try {
                const shape = new THREE.Shape(correctedOuterPoints.map(p => new THREE.Vector2(p.x, p.y)));

                if (figure.holes && figure.holes.length > 0) {
                    figure.holes.forEach((hole, index) => {
                        const holePoints = this.getContourPointsForBasePlane(hole);
                        if (holePoints.length >= 3) {
                            const correctedHolePoints = this.fixContourOrientation(holePoints, true);

                            try {
                                const holePath = new THREE.Path(correctedHolePoints.map(p => new THREE.Vector2(p.x, p.y)));
                                shape.holes.push(holePath);
                                console.log(`    Добавлено отверстие ${index}`);
                            } catch (error) {
                                console.error(`    Ошибка создания отверстия ${index}:`, error);
                            }
                        }
                    });
                }

                shapes.push(shape);
                console.log(`  Форма успешно создана`);
            } catch (error) {
                console.error(`  Ошибка создания формы для фигуры ${figure.id}:`, error);
            }
        });

        if (shapes.length === 0) {
            console.log("Нет фигур для создания геометрии");
            return null;
        }

        console.log(`Создано ${shapes.length} форм для выдавливания`);

        let extrudeDepth = height;
        const extrudeSettings = {
            depth: extrudeDepth,
            bevelEnabled: false,
            steps: 1
        };

        try {
            console.log("Создание ExtrudeGeometry...");
            const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);

            if (direction === 'negative') {
                geometry.translate(0, 0, -height);
            } else if (direction === 'both') {
                geometry.translate(0, 0, -height / 2);
            }

            console.log("Геометрия успешно создана, вершин:", geometry.attributes.position.count);
            return geometry;
        } catch (error) {
            console.error('Ошибка создания геометрии выдавливания:', error);
            return null;
        }
    }

    getFigurePointsForBasePlane(figure) {
        // ВСЕГДА получаем плоскость текущей фигуры
        const figurePlane = this.getFigurePlane(figure);
        if (!figurePlane) return figure.outer.points || [];

        // Если нет базовой плоскости или плоскости совместимы
        if (!this.basePlane || this.arePlanesCompatible(figurePlane, this.basePlane)) {
            return figure.outer.points || [];
        }

        // Если плоскости не совместимы, преобразуем точки
        return (figure.outer.points || []).map(point => {
            const localPoint3D = new THREE.Vector3(point.x, point.y, 0);
            const worldPoint = figurePlane.localToWorld(localPoint3D.clone());
            const baseLocalPoint = this.basePlane.worldToLocal(worldPoint.clone());
            return new THREE.Vector2(baseLocalPoint.x, baseLocalPoint.y);
        });
    }

    getContourPointsForBasePlane(contour) {
        return contour.points || [];
    }

    arePlanesCompatible(plane1, plane2) {
        if (!plane1 || !plane2) return false;

        const pos1 = plane1.position;
        const pos2 = plane2.position;
        const quat1 = plane1.quaternion;
        const quat2 = plane2.quaternion;

        const distance = pos1.distanceTo(pos2);
        const angle = quat1.angleTo(quat2);

        return distance < 0.001 && angle < 0.001;
    }

    // === СТРЕЛКА ВЫТЯГИВАНИЯ ===

    createExtrudeDirectionIndicator() {
        if (this.extrudeArrow) {
            if (this.extrudeArrow.parent) {
                this.extrudeArrow.parent.remove(this.extrudeArrow);
            }
            this.extrudeArrow = null;
        }

        const figures = this.getFiguresForExtrusion();
        if (!figures || figures.length === 0 || !this.basePlane) return;

        // Проверяем видимость базовой плоскости
        if (!this.isPlaneVisible(this.basePlane)) {
            console.log("Базовая плоскость скрыта, не создаем стрелку");
            return;
        }

        const direction = document.getElementById('extrudeDirection')?.value || 'positive';
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        // Инвертируем направление для negative
        if (direction === 'negative') {
            planeNormal.negate();
        }

        this.extrudeArrow = new THREE.Group();
        this.extrudeArrow.userData.isExtrudeArrow = true;
        this.extrudeArrow.userData.isDraggable = true;
        this.extrudeArrow.raycast = () => {};

        // Уменьшенные размеры стрелки
        const arrowLength = 15; // было 25
        const arrowHeadLength = 6; // было 8
        const arrowHeadWidth = 3; // было 4

        // Линия стрелки (теперь тоже перетаскиваемая)
        const lineGeometry = new THREE.CylinderGeometry(0.5, 0.5, arrowLength, 8);
        const lineMaterial = new THREE.MeshBasicMaterial({
            color: this.arrowNormalColor,
            transparent: true,
            opacity: 0.7
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.position.y = arrowLength / 2;
        line.userData.isArrowPart = true;
        line.userData.isDraggable = true; // Теперь линию тоже можно таскать
        line.userData.isArrowHandle = true;
        this.extrudeArrow.add(line);

        // Конус стрелки
        const coneGeometry = new THREE.ConeGeometry(arrowHeadWidth, arrowHeadLength, 8);
        const coneMaterial = new THREE.MeshBasicMaterial({
            color: this.arrowNormalColor,
            transparent: true,
            opacity: 0.9
        });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.y = arrowLength + arrowHeadLength / 2;
        cone.userData.isArrowPart = true;
        cone.userData.isArrowHandle = true;
        cone.userData.isDraggable = true;
        this.extrudeArrow.add(cone);

        // Добавляем подсветку при наведении
        const highlightMaterial = new THREE.MeshBasicMaterial({
            color: this.arrowHoverColor,
            transparent: true,
            opacity: 0.9
        });

        // Сохраняем оригинальные материалы для восстановления
        line.userData.originalMaterial = lineMaterial;
        cone.userData.originalMaterial = coneMaterial;
        line.userData.highlightMaterial = highlightMaterial.clone();
        cone.userData.highlightMaterial = highlightMaterial.clone();

        // Добавляем обработчики событий для подсветки
        this.setupArrowHoverEvents(line);
        this.setupArrowHoverEvents(cone);

        // Поворачиваем стрелку вдоль нормали плоскости
        const up = new THREE.Vector3(0, 1, 0);
        const rotationQuaternion = new THREE.Quaternion().setFromUnitVectors(
            up,
            planeNormal.clone().normalize()
        );
        this.extrudeArrow.quaternion.copy(rotationQuaternion);

        this.updateArrowPosition();

        this.editor.scene.add(this.extrudeArrow);
    }

    // Настройка событий наведения для элементов стрелки
    setupArrowHoverEvents(mesh) {
        mesh.userData.isHovered = false;

        // Используем собственные методы для обработки событий
        mesh.onPointerEnter = () => {
            if (!mesh.userData.isHovered && !this.isDraggingArrow) {
                mesh.userData.isHovered = true;
                this.highlightArrow(true);
                document.body.style.cursor = 'grab';
            }
        };

        mesh.onPointerLeave = () => {
            if (mesh.userData.isHovered && !this.isDraggingArrow) {
                mesh.userData.isHovered = false;
                this.highlightArrow(false);
                document.body.style.cursor = 'default';
            }
        };
    }

    // Подсветка стрелки
    highlightArrow(isHighlighted) {
        if (!this.extrudeArrow) return;

        this.extrudeArrow.traverse((child) => {
            if (child.userData && child.userData.isArrowPart) {
                if (isHighlighted) {
                    child.material = child.userData.highlightMaterial;
                } else {
                    child.material = child.userData.originalMaterial;
                }
            }
        });

        this.isArrowHovered = isHighlighted;
    }

    updateArrowPosition() {
        if (!this.extrudeArrow || !this.basePlane) return;

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';

        const figures = this.getFiguresForExtrusion();
        if (figures.length === 0) return;

        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        // Определяем базовое направление стрелки (всегда наружу от плоскости)
        let arrowDirection = planeNormal.clone();

        // Для направления "внутрь" разворачиваем стрелку
        if (direction === 'negative') {
            arrowDirection.negate();
        }

        // Обновляем ориентацию стрелки
        const up = new THREE.Vector3(0, 1, 0);
        const rotationQuaternion = new THREE.Quaternion().setFromUnitVectors(
            up,
            arrowDirection.clone().normalize()
        );
        this.extrudeArrow.quaternion.copy(rotationQuaternion);

        // Вычисляем центр выбранных фигур
        const center = new THREE.Vector3(0, 0, 0);
        let totalWeight = 0;

        figures.forEach(figure => {
            if (figure.outer && figure.outer.center) {
                const weight = figure.outer.area || 1;
                center.x += figure.outer.center.x * weight;
                center.y += figure.outer.center.y * weight;
                totalWeight += weight;
            }
        });

        if (totalWeight > 0) {
            center.x /= totalWeight;
            center.y /= totalWeight;
        }

        const worldCenter = this.basePlane.localToWorld(center.clone());
        const planePos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planePos);
        const offsetVector = new THREE.Vector3().subVectors(worldCenter, planePos);
        const basePos = planePos.clone().add(offsetVector);

        // Позиционируем начало стрелки на плоскости
        // При любом направлении начало стрелки должно быть на плоскости
        const arrowStartPos = basePos.clone();

        // Смещаем стрелку вдоль ее направления на половину ее длины
        // чтобы она начиналась на плоскости и указывала в правильном направлении
        let arrowLength = height; // Длина линии + конус

        if (direction === 'both') {
            arrowLength = height/2;
        }

        const arrowPos = arrowStartPos.clone().add(
            arrowDirection.clone().multiplyScalar(arrowLength)
        );

        this.extrudeArrow.position.copy(arrowPos);
        this.extrudeArrow.updateMatrixWorld(true);
    }



    handleArrowDragStart(event) {
        if (!this.extrudeArrow) return false;

        this.editor.updateMousePosition(event);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const draggableParts = [];
        if (this.extrudeArrow) {
            this.extrudeArrow.traverse((child) => {
                if (child.userData && (child.userData.isDraggable || child.userData.isArrowHandle)) {
                    draggableParts.push(child);
                }
            });
        }

        if (draggableParts.length === 0) return false;

        draggableParts.forEach(part => part.updateMatrixWorld(true));
        const intersects = this.editor.raycaster.intersectObjects(draggableParts, true);

        if (intersects.length > 0) {
            this.isDraggingArrow = true;
            this.startMouseY = event.clientY;
            this.arrowStartHeight = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
            document.body.style.cursor = 'grabbing';

            // Подсвечиваем стрелку при перетаскивании
         //   this.highlightArrow(true);

            this.bindGlobalDragHandlers();

            event.stopPropagation();
            event.preventDefault();
            return true;
        }

        return false;
    }

    handleArrowDrag(event) {
        if (!this.isDraggingArrow || !this.extrudeArrow || !this.basePlane) return;

        const deltaY = event.clientY - this.startMouseY;
        const sensitivity = 0.4;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';

        // Получаем нормаль плоскости
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        // Преобразуем движение мыши в изменение вдоль нормали плоскости
        // Для этого нужно спроецировать движение мыши на нормаль в экранных координатах

        // 1. Получаем позицию стрелки в экранных координатах
        const arrowWorldPos = this.extrudeArrow.position.clone();
        const arrowScreenPos = arrowWorldPos.clone().project(this.editor.camera);

        // 2. Создаем точку, смещенную по нормали плоскости
        const offsetPoint = arrowWorldPos.clone().add(planeNormal.clone().multiplyScalar(10));
        const offsetScreenPos = offsetPoint.clone().project(this.editor.camera);

        // 3. Вычисляем разницу в экранных координатах по Y
        const screenDelta = offsetScreenPos.y - arrowScreenPos.y;

        // 4. Определяем, в какую сторону на экране соответствует увеличение высоты
        let heightChange = -deltaY * sensitivity;

        // Если смещение по нормали дает уменьшение Y на экране, инвертируем
        if (screenDelta < 0) {
            heightChange = -heightChange;
        }

        // Корректируем для направления вытягивания
        if (direction === 'negative') {
            heightChange = -heightChange;
        }

        let newHeight = this.arrowStartHeight + heightChange;
        newHeight = Math.max(0.1, newHeight);
        newHeight = Math.round(newHeight * 10) / 10;

        const heightInput = document.getElementById('extrudeHeight');
        if (heightInput) {
            heightInput.value = newHeight;
            const inputEvent = new Event('input', { bubbles: true });
            heightInput.dispatchEvent(inputEvent);

            this.updateExtrudePreview();
            this.updateArrowPosition();
        }

        event.preventDefault();
    }




    handleArrowDragEnd() {
        this.isDraggingArrow = false;
        this.unbindGlobalDragHandlers();

        // Восстанавливаем нормальный вид стрелки
    //    this.highlightArrow(this.isArrowHovered);
        document.body.style.cursor = this.isArrowHovered ? 'grab' : 'default';

        this.updateExtrudePreview();
        this.updateArrowPosition();

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        this.editor.showStatus(`Высота установлена: ${height.toFixed(1)} мм`, 'info');
    }

    bindGlobalDragHandlers() {
        this.globalMouseMoveHandler = (e) => {
            if (this.isDraggingArrow) {
                this.handleArrowDrag(e);
            }
        };

        this.globalMouseUpHandler = (e) => {
            if (this.isDraggingArrow && e.button === 0) {
                this.handleArrowDragEnd();
            }
        };

        document.addEventListener('mousemove', this.globalMouseMoveHandler);
        document.addEventListener('mouseup', this.globalMouseUpHandler);
    }

    unbindGlobalDragHandlers() {
        if (this.globalMouseMoveHandler) {
            document.removeEventListener('mousemove', this.globalMouseMoveHandler);
            this.globalMouseMoveHandler = null;
        }

        if (this.globalMouseUpHandler) {
            document.removeEventListener('mouseup', this.globalMouseUpHandler);
            this.globalMouseUpHandler = null;
        }
    }

    // === ПРЕДПРОСМОТР ===

    updateExtrudePreview() {
        const figures = this.getFiguresForExtrusion();
        if (figures.length === 0) {
            this.removeExtrudePreview();
            return;
        }

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';

        if (this.extrudePreviewGroup && this.extrudePreviewGroup.children.length > 0) {
            const previewMesh = this.extrudePreviewGroup.children[0];
            const newGeometry = this.createExtrusionGeometryFromFigures(figures, height, direction);

            if (newGeometry) {
                previewMesh.geometry.dispose();
                previewMesh.geometry = newGeometry;
                this.updatePreviewPosition(previewMesh, height, direction);
            }
        } else {
            this.createNewExtrudePreview(figures, height, direction);
        }
    }

    createNewExtrudePreview(figures, height, direction) {
        this.removeExtrudePreview();

        const geometry = this.createExtrusionGeometryFromFigures(figures, height, direction);
        if (!geometry) return;

        if (!this.previewMaterial) {
            this.previewMaterial = new THREE.MeshPhongMaterial({
                color: 0x4CAF50,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
        }

        const previewMesh = new THREE.Mesh(geometry, this.previewMaterial);
        this.updatePreviewPosition(previewMesh, height, direction);

        this.extrudePreviewGroup = new THREE.Group();
        this.extrudePreviewGroup.add(previewMesh);
        this.editor.objectsGroup.add(this.extrudePreviewGroup);
    }

    updatePreviewPosition(mesh, height, direction) {
        if (!mesh || !this.basePlane) return;

        const planeWorldPos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planeWorldPos);

        mesh.position.copy(planeWorldPos);
        mesh.quaternion.copy(this.basePlane.quaternion);

        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        let offset = 0.1;
//        if (direction === 'negative') {
//            offset = -height + 0.1;
//        } else if (direction === 'both') {
//            offset = -height / 2 + 0.1;
//        }

        mesh.position.add(planeNormal.clone().multiplyScalar(offset));
    }

    removeExtrudePreview() {
        if (this.extrudePreviewGroup) {
            this.editor.objectsGroup.remove(this.extrudePreviewGroup);
            this.extrudePreviewGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.extrudePreviewGroup = null;
        }
    }

    // === UI ===

    showExtrudeUI() {
        const oldUI = document.getElementById('extrudeUI');
        if (oldUI) oldUI.remove();

        const selectedCount = this.selectedFigures.size;

        const container = document.createElement('div');
        container.id = 'extrudeUI';
        container.className = 'extrude-ui';
        container.innerHTML = `
            <div class="extrude-header">
                <h3><i class="fas fa-arrows-alt-v"></i> Вытягивание фигур</h3>
                <button id="cancelExtrude" class="btn-secondary">
                    <i class="fas fa-times"></i> Отмена
                </button>
            </div>
            <div class="extrude-controls">
                <div class="control-group">
                    <label>Высота (мм):</label>
                    <input type="number" id="extrudeHeight" value="10" step="0.1" min="0.1" style="width: 100px;">
                </div>
                <div class="control-group">
                    <label>Направление:</label>
                    <select id="extrudeDirection">
                        <option value="positive">Наружу</option>
                        <option value="negative">Внутрь</option>
                        <option value="both">В обе стороны</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>Операция:</label>
                    <select id="extrudeOperation">
                        <option value="new">Новый объект</option>
                        <option value="cut">Вырезать</option>
                        <option value="join">Объединить</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>

                        Автоматически объединять соединённые фигуры (экспериментальное)
                        <input type="checkbox" id="mergeFigures" ${this.mergeConnectedFigures ? 'checked' : ''}>
                    </label>
                </div>
                <div class="extrude-info">
                    <div id="selectedContourInfo">
                        ${selectedCount > 0 ? `Выбрано фигур: ${selectedCount}` : 'Кликните по фигуре для выбора'}
                    </div>
                    <div id="mergeStatus" style="font-size: 12px; color: #888; margin-top: 5px;"></div>
                </div>
                <button id="performExtrude" class="btn-primary" ${selectedCount > 0 ? '' : 'disabled'}>
                    <i class="fas fa-check"></i> Выполнить вытягивание
                </button>
            </div>
            <div class="extrude-hint">
                <i class="fas fa-info-circle"></i>
                <div>• Клик по фигуре: выделить/снять выделение</div>
                <div>• Соединённые фигуры будут объединены при вытягивании</div>
                <div>• Перетаскивайте стрелку для изменения высоты</div>
                <div>• Escape для отмены, Enter для подтверждения</div>
            </div>
        `;

        document.querySelector('.viewport-container').appendChild(container);

        container.querySelector('#cancelExtrude').addEventListener('click', () => {
            this.exitExtrudeMode()
        });

        container.querySelector('#performExtrude').addEventListener('click', () => {
            this.performExtrude();
        });

        const heightInput = container.querySelector('#extrudeHeight');
        heightInput.addEventListener('input', () => {
            this.updateExtrudePreview();
            this.updateArrowPosition();
        });

        const directionSelect = container.querySelector('#extrudeDirection');
        directionSelect.addEventListener('change', () => {
            this.updateExtrudePreview();
            this.updateArrowPosition();
        });

        const operationSelect = container.querySelector('#extrudeOperation');
        operationSelect.addEventListener('change', () => {
            this.currentOperation = operationSelect.value;
            this.updateExtrudeUI();
        });

        const mergeCheckbox = container.querySelector('#mergeFigures');
        mergeCheckbox.addEventListener('change', (e) => {
            this.mergeConnectedFigures = e.target.checked;
            this.updateExtrudePreview();
            this.updateExtrudeUI();
        });

        this.updateExtrudeUI();
    }

    updateExtrudeUI() {
        const selectedContourInfo = document.getElementById('selectedContourInfo');
        const mergeStatus = document.getElementById('mergeStatus');
        const performExtrudeBtn = document.getElementById('performExtrude');

        if (selectedContourInfo) {
            const count = this.selectedFigures.size;
            if (count > 0) {
                selectedContourInfo.textContent = `Выбрано фигур: ${count}`;
                selectedContourInfo.style.color = '#4CAF50';

                // Обновляем статус объединения
                if (mergeStatus && count > 1 && this.mergeConnectedFigures) {
                    const figuresArray = Array.from(this.selectedFigures.values());
                    const allSamePlane = this.areAllFiguresOnSamePlane(figuresArray);

                    if (!allSamePlane) {
                        mergeStatus.textContent = '✗ Фигуры на разных плоскостях';
                        mergeStatus.style.color = '#f44336';
                    } else {
                        const connected = this.areFiguresGeometricallyConnected(figuresArray);
                        if (connected) {
                            mergeStatus.textContent = '✓ Фигуры соединены и будут объединены';
                            mergeStatus.style.color = '#4CAF50';
                        } else {
                            mergeStatus.textContent = '✗ Фигуры не соединены';
                            mergeStatus.style.color = '#f44336';
                        }
                    }
                } else {
                    mergeStatus.textContent = '';
                }
            } else {
                selectedContourInfo.textContent = 'Кликните по фигуре для выбора';
                selectedContourInfo.style.color = '#888';
                if (mergeStatus) mergeStatus.textContent = '';
            }
        }

        if (performExtrudeBtn) {
            performExtrudeBtn.disabled = this.selectedFigures.size === 0;
        }
    }

    // === ВЫПОЛНЕНИЕ ВЫТЯГИВАНИЯ ===

    performExtrude() {
        const figures = this.getFiguresForExtrusion();
        if (figures.length === 0) {
            this.editor.showStatus('Выберите фигуру(ы) для вытягивания', 'error');
            return;
        }

        const height = parseFloat(document.getElementById('extrudeHeight')?.value) || 10;
        const direction = document.getElementById('extrudeDirection')?.value || 'positive';
        const operation = document.getElementById('extrudeOperation')?.value || 'new';

        if (isNaN(height)) {
            this.editor.showStatus('Введите корректную высоту', 'error');
            return;
        }

        if (!this.basePlane) {
            this.editor.showStatus('Не определена базовая плоскость', 'error');
            return;
        }

        const geometry = this.createExtrusionGeometryFromFigures(figures, height, direction);
        if (!geometry) {
            this.editor.showStatus('Не удалось создать геометрию выдавливания', 'error');
            return;
        }

        const mesh = this.createExtrusionMesh(geometry, height, direction, figures);
        if (!mesh) {
            this.editor.showStatus('Не удалось создать объект выдавливания', 'error');
            return;
        }

        const planeWorldPos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planeWorldPos);

        mesh.position.copy(planeWorldPos);
        mesh.quaternion.copy(this.basePlane.quaternion);

        const sourceFigureData = figures.map(figure => ({
            id: figure.id,
            elements: figure.outer.element ? [figure.outer.element] : figure.outer.elements,
            isMerged: figure.isMerged || false,
            sourceFigures: figure.sourceFigures || [figure.id]
        }));

        const historyData = {
            sourceFigures: sourceFigureData,
            sketchPlane: this.editor.projectManager.serializeObject(this.basePlane),
            height: height,
            direction: direction,
            operation: operation,
            merged: figures.some(f => f.isMerged)
        };

        switch (operation) {
            case 'new':
                this.handleNewOperation(mesh, historyData);
                break;
            case 'cut':
                this.handleCutOperation(mesh, historyData);
                break;
            case 'join':
                this.handleJoinOperation(mesh, historyData);
                break;
        }

        this.exitExtrudeMode()

        const mergedCount = figures.filter(f => f.isMerged).length;
        if (mergedCount > 0) {
            this.editor.showStatus(`Выполнено выдавливание (${height} мм) с объединением фигур`, 'success');
        } else {
            this.editor.showStatus(`Выполнено выдавливание (${height} мм)`, 'success');
        }
    }

    createExtrusionMesh(geometry, height, direction, sourceFigures) {
        if (!geometry) return null;

        const material = new THREE.MeshPhongMaterial({
            color: 0x4CAF50,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const isMerged = sourceFigures.some(f => f.isMerged);

        mesh.userData = {
            type: 'extrusion',
            sourceFigureIds: sourceFigures.flatMap(f => f.sourceFigures || [f.id]),
            height: height,
            direction: direction,
            operation: this.currentOperation,
            name: `Вытягивание (${height} мм)${isMerged ? ' [объединенное]' : ''}`,
            figureCount: sourceFigures.length,
            holeCount: sourceFigures.reduce((sum, fig) => sum + (fig.holes ? fig.holes.length : 0), 0),
            basePlaneId: this.basePlane?.uuid,
            createdAt: new Date().toISOString(),
            isMerged: isMerged,
            mergedFrom: isMerged ? sourceFigures.flatMap(f => f.sourceFigures || []) : null
        };

        return mesh;
    }

    handleNewOperation(mesh, historyData) {
        const finalPosition = mesh.position.clone();
        const finalScale = mesh.scale.clone();

        this.editor.objectsGroup.add(mesh);
        this.editor.objects.push(mesh);

        this.editor.selectObject(mesh);

        const serializedMesh = this.editor.projectManager.serializeObjectForHistory(mesh);
        serializedMesh.userData.finalPosition = finalPosition.toArray();
        serializedMesh.userData.finalScale = finalScale.toArray();

        this.editor.history.addAction({
            type: 'create',
            subtype: 'extrude',
            object: mesh.uuid,
            data: {
                ...historyData,
                objectData: serializedMesh,
                finalPosition: finalPosition.toArray(),
                finalScale: finalScale.toArray()
            }
        });
    }

    handleCutOperation(mesh, historyData) {
        const intersectingObjects = this.findIntersectingObjects(mesh);

        if (intersectingObjects.length === 0) {
            this.editor.showStatus('Нет пересекающихся объектов для вырезания', 'warning');
            this.handleNewOperation(mesh, historyData);
            return;
        }

        if (!this.editor.booleanOps) {
            this.editor.showStatus('Булевы операции не доступны', 'error');
            this.handleNewOperation(mesh, historyData);
            return;
        }

        const targetObjectsData = intersectingObjects.map(obj => {
            return this.editor.projectManager.serializeObjectForHistory(obj);
        });

        let operationSuccess = false;
        let booleanResult = null;

        intersectingObjects.forEach(targetObject => {
            try {
                const result = this.editor.booleanOps.subtract(targetObject, mesh);
                if (result && result.geometry && result.geometry.attributes.position.count > 0) {
                    booleanResult = result;
                    this.replaceObjectWithResult(targetObject, result, 'cut', {
                        sourceExtrude: historyData,
                        targetObjectData: targetObjectsData
                    });
                    operationSuccess = true;
                }
            } catch (error) {
                console.error('Ошибка вырезания:', error);
            }
        });

        if (!operationSuccess) {
            this.editor.showStatus('Не удалось выполнить вырезание', 'error');
            this.handleNewOperation(mesh, historyData);
        }
    }

    handleJoinOperation(mesh, historyData) {
        const intersectingObjects = this.findIntersectingObjects(mesh);

        if (intersectingObjects.length === 0) {
            this.editor.showStatus('Нет пересекающихся объектов для соединения', 'warning');
            this.handleNewOperation(mesh, historyData);
            return;
        }

        if (!this.editor.booleanOps) {
            this.editor.showStatus('Булевы операции не доступны', 'error');
            this.handleNewOperation(mesh, historyData);
            return;
        }

        const objectsData = intersectingObjects.map(obj => {
            return this.editor.projectManager.serializeObjectForHistory(obj);
        });
        const extrudeData = this.editor.projectManager.serializeObjectForHistory(mesh);

        try {
            const objectsToUnion = [...intersectingObjects, mesh];
            const result = this.editor.booleanOps.unionMultiple(objectsToUnion);

            if (result && result.geometry && result.geometry.attributes.position.count > 0) {
                this.replaceObjectsWithResult(objectsToUnion, result, 'join', {
                    sourceObjectsData: objectsData,
                    extrudeData: extrudeData,
                    sourceExtrude: historyData
                });
            } else {
                throw new Error('Результат объединения пуст');
            }
        } catch (error) {
            console.error('Ошибка соединения:', error);
            this.editor.showStatus('Не удалось выполнить соединение', 'error');
            this.handleNewOperation(mesh, historyData);
        }
    }

    findIntersectingObjects(mesh) {
        const intersectingObjects = [];
        const bbox1 = new THREE.Box3().setFromObject(mesh);

        this.editor.objects.forEach(obj => {
            if (obj === mesh || obj.userData.type === 'sketch_plane' ||
                obj.userData.type === 'work_plane' ||
                obj.userData.type === 'sketch_element') {
                return;
            }

            const bbox2 = new THREE.Box3().setFromObject(obj);
            if (bbox1.intersectsBox(bbox2)) {
                intersectingObjects.push(obj);
            }
        });

        return intersectingObjects;
    }

    replaceObjectWithResult(originalObject, result, operationType, historyContext) {
        const originalBox = new THREE.Box3().setFromObject(originalObject);
        const originalSize = new THREE.Vector3();
        originalBox.getSize(originalSize);

        const originalIndex = this.editor.objects.indexOf(originalObject);
        if (originalIndex > -1) {
            this.editor.objectsGroup.remove(originalObject);
            this.editor.objects.splice(originalIndex, 1);

            if (originalObject.geometry) originalObject.geometry.dispose();
            if (originalObject.material) originalObject.material.dispose();
        }

        result.userData = {
            ...result.userData,
            type: 'boolean_result',
            operation: operationType,
            originalObjects: [originalObject.uuid],
            createdAt: new Date().toISOString(),
            originalSize: originalSize.toArray(),
            originalPosition: originalObject.position.toArray()
        };

        this.editor.objectsGroup.add(result);
        this.editor.objects.push(result);

        this.editor.selectObject(result);

        this.editor.history.addAction({
            type: 'boolean',
            operation: 'subtract',
            result: result.uuid,
            sourceObjects: [originalObject.uuid],
            originalObjects: historyContext ? [{
                uuid: originalObject.uuid,
                data: historyContext.targetObjectData[0]
            }] : [],
            resultData: this.editor.projectManager.serializeObjectForHistory(result),
            context: historyContext?.sourceExtrude
        });
    }

    replaceObjectsWithResult(originalObjects, result, operationType, historyContext) {
        const originalData = originalObjects.map(obj => {
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);

            return {
                uuid: obj.uuid,
                position: obj.position.toArray(),
                size: size.toArray(),
                data: this.editor.projectManager.serializeObjectForHistory(obj)
            };
        });

        originalObjects.forEach(obj => {
            const index = this.editor.objects.indexOf(obj);
            if (index > -1) {
                this.editor.objectsGroup.remove(obj);
                this.editor.objects.splice(index, 1);

                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            }
        });

        result.userData = {
            ...result.userData,
            type: 'boolean_result',
            operation: operationType,
            originalObjects: originalObjects.map(o => o.uuid),
            createdAt: new Date().toISOString(),
            originalSizes: originalData.map(d => d.size),
            originalPositions: originalData.map(d => d.position)
        };

        this.editor.objectsGroup.add(result);
        this.editor.objects.push(result);

        this.editor.selectObject(result);

        this.editor.history.addAction({
            type: 'boolean',
            operation: 'union',
            result: result.uuid,
            sourceObjects: originalObjects.map(o => o.uuid),
            originalObjects: originalData.map(d => ({ uuid: d.uuid, data: d.data })),
            resultData: this.editor.projectManager.serializeObjectForHistory(result),
            context: historyContext?.sourceExtrude
        });
    }

    exitExtrudeMode() {
        this.editor.toolManager.setCurrentTool('select');
    }

    cancelExtrudeMode() {
        this.clearSelection();

        if (this.extrudeArrow) {
            this.editor.scene.remove(this.extrudeArrow);
            this.extrudeArrow = null;
        }

        this.removeExtrudePreview();

        const ui = document.getElementById('extrudeUI');
        if (ui) ui.remove();

        const allElements = this.editor.objectsManager.getAllSketchElements();
        allElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });

        this.editor.showStatus('Режим вытягивания завершен', 'info');
        document.body.style.cursor = 'default';
    }

    // === ПОДСВЕТКА ВСЕХ ФИГУР ===

    highlightExtrudableFigures() {
        const allElements = this.editor.objectsManager.getAllSketchElements();
        allElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });

        const figures = this.figureManager.collectAllFigures();
        figures.forEach(figure => {
            if (figure.outer && figure.outer.element) {
                this.editor.objectsManager.safeSetElementColor(figure.outer.element, 0x2196F3);
            } else if (figure.outer && figure.outer.elements) {
                figure.outer.elements.forEach(element => {
                    this.editor.objectsManager.safeSetElementColor(element, 0x2196F3);
                });
            }
        });

        if (figures.length === 0) {
            this.editor.showStatus('Нет замкнутых фигур для вытягивания', 'warning');
        }
    }
}