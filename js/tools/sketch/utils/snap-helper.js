// snap-helper.js (полная версия)
/**
 * Система помощи при черчении с привязками и подсказками
 * Включает: точки, перпендикуляры, привязку к краям и контурам фигур
 */
class SnapHelper {
    constructor(sketchManager) {
        this.sketchManager = sketchManager;
        this.snapPoints = [];
        this.snapMarkers = [];
        this.currentSnapPoint = null;
        this.isHovering = false;
        this.snapTolerance = 15; // пикселей
        this.snapEnabled = true;
        this.edgeSnapEnabled = true;
        this.contourSnapEnabled = true;
        this.perpendicularSnapEnabled = true;

        // Цвета для разных типов точек привязки
        this.colors = {
            endpoint: 0xFF0000,     // Красный - конечные точки
            midpoint: 0x00FF00,     // Зеленый - середины
            center: 0x0000FF,       // Синий - центры
            intersection: 0xFFFF00, // Желтый - пересечения
            perpendicular: 0xFFA500, // Оранжевый - перпендикулярные углы
            edge: 0x00AAFF,         // Голубой - точки на краях фигур
            contour: 0xAA00FF,      // Пурпурный - точки на контурах
            parallel: 0xFF00FF,     // Розовый - параллельные линии
            tangent: 0x00FFFF,      // Бирюзовый - касательные
            none: 0x888888          // Серый - нет привязки
        };

        // Визуальные элементы
        this.angleIndicator = null;
        this.angleLabel = null;
        this.lastAngle = 0;
        this.hoverMarker = null;
        this.hoverTimeout = null;
        this.perpendicularGuide = null;
        this.edgeGuide = null;
        this.contourGuide = null;
        this.parallelGuide = null;
        this.snapLine = null;

        // Состояние привязок
        this.perpendicularActive = false;
        this.edgeActive = false;
        this.contourActive = false;
        this.parallelActive = false;
        this.currentPerpendicularSegment = null;
        this.currentEdgeSegment = null;
        this.currentContourSegment = null;
        this.currentParallelSegment = null;
        this.perpendicularToleranceDegrees = 3;
        this.edgeSnapTolerance = 2.0; // единицы в локальных координатах
        this.contourSnapTolerance = 2.0;

        // Производительность
        this.AngleIndicatorFPS = 5;
        this.AngleIndicatorFPSCounter = 0;

        // Кэширование
        this.cachedSegments = [];
        this.cachedEdges = [];
        this.cachedContours = [];
        this.cachedCircles = [];
        this.segmentsDirty = true;
        this.edgesDirty = true;
        this.contoursDirty = true;
        this.circlesDirty = true;
    }

    /**
     * Инициализация системы привязок
     */
    initialize() {
        this.clear();
    }

    /**
     * Обновление всех точек привязки на основе элементов скетча
     */
    updateSnapPoints() {
        this.clearSnapPoints();
        this.markAllDirty();

        if (!this.sketchManager.currentPlane || !this.sketchManager.elementManager.elements) {
            return;
        }

        const elements = this.sketchManager.elementManager.elements;

        // Собираем все типы точек привязки
        elements.forEach(element => {
            this.addElementSnapPoints(element);
        });

        this.addIntersectionPoints(elements);
        this.addEdgePoints(elements);
        this.addContourPoints();
        this.addCirclePoints(elements);
    }

    /**
     * Пометить все кэши как грязные
     */
    markAllDirty() {
        this.segmentsDirty = true;
        this.edgesDirty = true;
        this.contoursDirty = true;
        this.circlesDirty = true;
    }

    /**
     * Добавление точек привязки для элемента
     */
    addElementSnapPoints(element) {
        if (!element.mesh) return;

        const userData = element.mesh.userData;
        if (!userData.localPoints || userData.localPoints.length === 0) return;

        const plane = this.sketchManager.currentPlane;
        const points = userData.localPoints;

        // 1. Конечные точки для всех сегментов
        points.forEach((point, index) => {
            const worldPoint = plane.localToWorld(new THREE.Vector3(point.x, point.y, 0));
            this.snapPoints.push({
                point: worldPoint,
                type: 'endpoint',
                element: element,
                index: index,
                screenPos: this.worldToScreen(worldPoint)
            });
        });

        // 2. Средние точки для линий
        if (points.length >= 2) {
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const worldMid = plane.localToWorld(new THREE.Vector3(midX, midY, 0));

                this.snapPoints.push({
                    point: worldMid,
                    type: 'midpoint',
                    element: element,
                    segmentIndex: i,
                    screenPos: this.worldToScreen(worldMid)
                });
            }
        }

        // 3. Центр для окружности
        if (element.type === 'circle' && element.center) {
            this.snapPoints.push({
                point: element.center,
                type: 'center',
                element: element,
                screenPos: this.worldToScreen(element.center)
            });
        }

        // 4. Центр для многоугольника, овала, стадиона
        if ((element.type === 'polygon' || element.type === 'oval' || element.type === 'stadium')
            && element.center) {
            this.snapPoints.push({
                point: element.center,
                type: 'center',
                element: element,
                screenPos: this.worldToScreen(element.center)
            });
        }

        // 5. Углы для прямоугольника
        if (element.type === 'rectangle' && element.points && element.points.length >= 4) {
            for (let i = 0; i < 4; i++) {
                const corner = element.points[i];
                this.snapPoints.push({
                    point: corner,
                    type: 'endpoint',
                    element: element,
                    isCorner: true,
                    cornerIndex: i,
                    screenPos: this.worldToScreen(corner)
                });
            }
        }
    }

    /**
     * Добавление точек пересечения между элементами
     */
    addIntersectionPoints(elements) {
        const lines = elements.filter(el =>
            el.type === 'line' ||
            el.type === 'rectangle' ||
            (el.type === 'polyline' && el.points && el.points.length >= 2)
        );

        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                const intersections = this.findLineIntersections(lines[i], lines[j]);
                intersections.forEach(intersection => {
                    this.snapPoints.push({
                        point: intersection,
                        type: 'intersection',
                        elements: [lines[i], lines[j]],
                        screenPos: this.worldToScreen(intersection)
                    });
                });
            }
        }
    }

    /**
     * Добавление точек на краях фигур
     */
    addEdgePoints(elements) {
        if (!this.sketchManager.currentPlane || !this.edgeSnapEnabled) return;

        const plane = this.sketchManager.currentPlane;
        const edges = this.getAllEdges();

        edges.forEach(edge => {
            // Разбиваем край на 5 равных частей
            const segments = 5;
            for (let i = 1; i < segments; i++) {
                const t = i / segments;
                const x = edge.start.x + t * (edge.end.x - edge.start.x);
                const y = edge.start.y + t * (edge.end.y - edge.start.y);

                const worldPoint = plane.localToWorld(new THREE.Vector3(x, y, 0));

                this.snapPoints.push({
                    point: worldPoint,
                    type: 'edge',
                    element: edge.element,
                    segment: edge,
                    t: t,
                    screenPos: this.worldToScreen(worldPoint)
                });
            }
        });
    }

    /**
     * Добавление точек на контурах
     */
    addContourPoints() {
        if (!this.sketchManager.currentPlane || !this.contourSnapEnabled) return;

        const plane = this.sketchManager.currentPlane;
        const contours = this.getAllContours();

        contours.forEach(contour => {
            // Разбиваем контур на 8 равных частей
            const segments = 8;
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const x = contour.start.x + t * (contour.end.x - contour.start.x);
                const y = contour.start.y + t * (contour.end.y - contour.start.y);

                const worldPoint = plane.localToWorld(new THREE.Vector3(x, y, 0));

                this.snapPoints.push({
                    point: worldPoint,
                    type: 'contour',
                    element: null,
                    contour: contour.contour,
                    t: t,
                    screenPos: this.worldToScreen(worldPoint)
                });
            }
        });
    }

    /**
     * Добавление точек на окружностях
     */
    addCirclePoints(elements) {
        if (!this.sketchManager.currentPlane) return;

        const plane = this.sketchManager.currentPlane;
        const circles = elements.filter(el => el.type === 'circle');

        circles.forEach(circle => {
            if (!circle.center || !circle.radius) return;

            const center = plane.worldToLocal(circle.center.clone());
            const radius = circle.radius;

            // Добавляем точки по окружности (каждые 45 градусов)
            for (let angle = 0; angle < 360; angle += 45) {
                const rad = THREE.MathUtils.degToRad(angle);
                const x = center.x + Math.cos(rad) * radius;
                const y = center.y + Math.sin(rad) * radius;

                const worldPoint = plane.localToWorld(new THREE.Vector3(x, y, 0));

                this.snapPoints.push({
                    point: worldPoint,
                    type: 'endpoint',
                    element: circle,
                    isCirclePoint: true,
                    angle: angle,
                    screenPos: this.worldToScreen(worldPoint)
                });
            }
        });
    }

    /**
     * Получение всех сегментов элементов
     */
    getAllSegments() {
        if (this.segmentsDirty || this.cachedSegments.length === 0) {
            this.cachedSegments = [];
            const elements = this.sketchManager.elementManager.elements || [];

            elements.forEach(element => {
                const elementSegments = this.getElementSegments(element);
                elementSegments.forEach(segment => {
                    segment.element = element;
                    segment.type = 'segment';
                    this.cachedSegments.push(segment);
                });
            });
            this.segmentsDirty = false;
        }
        return this.cachedSegments;
    }

    /**
     * Получение всех краев фигур
     */
    getAllEdges() {
        if (this.edgesDirty || this.cachedEdges.length === 0) {
            this.cachedEdges = [];
            const elements = this.sketchManager.elementManager.elements || [];

            elements.forEach(element => {
                if (element.type === 'rectangle' ||
                    element.type === 'polygon' ||
                    element.type === 'circle' ||
                    element.type === 'oval' ||
                    element.type === 'stadium') {

                    const elementSegments = this.getElementSegments(element);
                    elementSegments.forEach(segment => {
                        segment.element = element;
                        segment.type = 'edge';
                        this.cachedEdges.push(segment);
                    });
                }
            });
            this.edgesDirty = false;
        }
        return this.cachedEdges;
    }

    /**
     * Получение всех контуров
     */
    getAllContours() {
        if (this.contoursDirty || this.cachedContours.length === 0) {
            this.cachedContours = [];

            if (this.sketchManager.contourManager &&
                this.sketchManager.contourManager.contourDetector) {

                const contours = this.sketchManager.contourManager.contourDetector.contours || [];
                contours.forEach(contour => {
                    if (contour.points && contour.points.length >= 2) {
                        for (let i = 0; i < contour.points.length; i++) {
                            const start = contour.points[i];
                            const end = contour.points[(i + 1) % contour.points.length];

                            this.cachedContours.push({
                                start: new THREE.Vector3(start.x, start.y, 0),
                                end: new THREE.Vector3(end.x, end.y, 0),
                                element: null,
                                type: 'contour',
                                contour: contour
                            });
                        }
                    }
                });
            }
            this.contoursDirty = false;
        }
        return this.cachedContours;
    }

    /**
     * Получение сегментов элемента
     */
    getElementSegments(element) {
        const segments = [];

        if (element.type === 'line' && element.points && element.points.length === 2) {
            const localStart = this.sketchManager.currentPlane.worldToLocal(element.points[0].clone());
            const localEnd = this.sketchManager.currentPlane.worldToLocal(element.points[1].clone());

            segments.push({
                start: new THREE.Vector3(localStart.x, localStart.y, 0),
                end: new THREE.Vector3(localEnd.x, localEnd.y, 0)
            });
        } else if (element.type === 'rectangle' && element.points && element.points.length >= 4) {
            for (let i = 0; i < 4; i++) {
                const localStart = this.sketchManager.currentPlane.worldToLocal(element.points[i].clone());
                const localEnd = this.sketchManager.currentPlane.worldToLocal(element.points[(i + 1) % 4].clone());

                segments.push({
                    start: new THREE.Vector3(localStart.x, localStart.y, 0),
                    end: new THREE.Vector3(localEnd.x, localEnd.y, 0)
                });
            }
        } else if (element.type === 'polyline' && element.points && element.points.length >= 2) {
            for (let i = 0; i < element.points.length - 1; i++) {
                const localStart = this.sketchManager.currentPlane.worldToLocal(element.points[i].clone());
                const localEnd = this.sketchManager.currentPlane.worldToLocal(element.points[i + 1].clone());

                segments.push({
                    start: new THREE.Vector3(localStart.x, localStart.y, 0),
                    end: new THREE.Vector3(localEnd.x, localEnd.y, 0)
                });
            }
        } else if (element.type === 'polygon' && element.points && element.points.length >= 3) {
            for (let i = 0; i < element.points.length; i++) {
                const localStart = this.sketchManager.currentPlane.worldToLocal(element.points[i].clone());
                const localEnd = this.sketchManager.currentPlane.worldToLocal(element.points[(i + 1) % element.points.length].clone());

                segments.push({
                    start: new THREE.Vector3(localStart.x, localStart.y, 0),
                    end: new THREE.Vector3(localEnd.x, localEnd.y, 0)
                });
            }
        } else if (element.type === 'circle' && element.center && element.radius) {
            const center = this.sketchManager.currentPlane.worldToLocal(element.center.clone());
            const radius = element.radius;

            // Аппроксимируем окружность 32 сегментами
            const segmentsCount = 32;
            for (let i = 0; i < segmentsCount; i++) {
                const angle1 = (i / segmentsCount) * Math.PI * 2;
                const angle2 = ((i + 1) / segmentsCount) * Math.PI * 2;

                segments.push({
                    start: new THREE.Vector3(
                        center.x + Math.cos(angle1) * radius,
                        center.y + Math.sin(angle1) * radius,
                        0
                    ),
                    end: new THREE.Vector3(
                        center.x + Math.cos(angle2) * radius,
                        center.y + Math.sin(angle2) * radius,
                        0
                    ),
                    isArc: true
                });
            }
        }

        return segments;
    }

    /**
     * Поиск пересечений между двумя элементами-линиями
     */
    findLineIntersections(line1, line2) {
        const intersections = [];

        if (!line1.points || !line2.points) return intersections;

        const segments1 = this.getElementSegments(line1);
        const segments2 = this.getElementSegments(line2);

        for (const seg1 of segments1) {
            for (const seg2 of segments2) {
                const intersection = this.lineSegmentIntersection(seg1.start, seg1.end, seg2.start, seg2.end);
                if (intersection) {
                    intersections.push(intersection);
                }
            }
        }

        return intersections;
    }

    /**
     * Алгоритм нахождения пересечения двух отрезков
     */
    lineSegmentIntersection(p1, p2, p3, p4) {
        const v1 = new THREE.Vector2(p1.x, p1.y);
        const v2 = new THREE.Vector2(p2.x, p2.y);
        const v3 = new THREE.Vector2(p3.x, p3.y);
        const v4 = new THREE.Vector2(p4.x, p4.y);

        const denominator = (v4.y - v3.y) * (v2.x - v1.x) - (v4.x - v3.x) * (v2.y - v1.y);

        if (Math.abs(denominator) < 0.0001) return null;

        const ua = ((v4.x - v3.x) * (v1.y - v3.y) - (v4.y - v3.y) * (v1.x - v3.x)) / denominator;
        const ub = ((v2.x - v1.x) * (v1.y - v3.y) - (v2.y - v1.y) * (v1.x - v3.x)) / denominator;

        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return new THREE.Vector3(
                p1.x + ua * (p2.x - p1.x),
                p1.y + ua * (p2.y - p1.y),
                p1.z + ua * (p2.z - p1.z)
            );
        }

        return null;
    }

    /**
     * Главный обработчик движения мыши
     */
    handleMouseMove(event, currentPoint = null) {
        if (!this.snapEnabled || !this.sketchManager.currentPlane) return;

        const rect = this.sketchManager.editor.renderer.domElement.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        // Находим ближайшую точку привязки
        const snapPoint = this.findNearestSnapPoint(screenX, screenY);

        // Обновляем текущую точку привязки
        this.currentSnapPoint = snapPoint;

        // Проверяем динамические привязки (к краям, контурам, перпендикуляры)
        if (currentPoint) {
            this.checkDynamicSnaps(currentPoint);
        }

        // Управляем видимостью маркера
        if (snapPoint) {
            this.showHoverMarker(snapPoint);
            this.isHovering = true;

            // Показываем линию привязки
            if (currentPoint) {
                this.showSnapLine(currentPoint, snapPoint.point);
            }
        } else {
            this.hideHoverMarker();
            this.isHovering = false;
            this.hideSnapLine();
        }

        // Для инструментов линия и полилиния
        const currentTool = this.sketchManager.toolManager.currentTool;
        const currentToolName = this.sketchManager.toolManager.currentToolName;

        if ((currentToolName === 'line' || currentToolName === 'polyline') &&
            currentTool && currentTool.isDrawing && currentTool.tempElement &&
            currentTool.tempElement.start && currentPoint) {

            // Показываем угол наклона
            if (this.AngleIndicatorFPSCounter >= this.AngleIndicatorFPS) {
                this.showAngleIndicator(currentPoint);
                this.AngleIndicatorFPSCounter = 0;
            } else {
                this.AngleIndicatorFPSCounter += 1;
            }
        } else {
            this.hideAngleIndicator();
            this.hidePerpendicularGuide();
            this.hideEdgeGuide();
            this.hideContourGuide();
            this.hideParallelGuide();
        }
    }

    /**
     * Проверка динамических привязок
     */
    checkDynamicSnaps(currentPoint) {
        const plane = this.sketchManager.currentPlane;
        const localPoint = plane.worldToLocal(currentPoint.clone());

        // Сначала проверяем привязку к краям (высший приоритет)
        if (this.edgeSnapEnabled) {
            this.checkEdgeSnap(localPoint, plane);
            if (this.edgeActive) return; // Если привязались к краю, дальше не проверяем
        }

        // Затем проверяем привязку к контурам
        if (this.contourSnapEnabled) {
            this.checkContourSnap(localPoint, plane);
            if (this.contourActive) return;
        }

        // Затем перпендикулярные привязки (только для рисования линий)
        if (this.perpendicularSnapEnabled) {
            this.checkPerpendicularAlignment(localPoint, plane);
        }

        // Параллельные привязки
        this.checkParallelAlignment(localPoint, plane);
    }

    /**
     * Проверка привязки к краям фигур
     */
    checkEdgeSnap(localPoint, plane) {
        const edges = this.getAllEdges();
        let closestEdge = null;
        let closestDistance = Infinity;
        let closestPoint = null;

        for (const edge of edges) {
            const distanceInfo = this.distanceToSegment(localPoint, edge);

            if (distanceInfo.distance < closestDistance && distanceInfo.distance < this.edgeSnapTolerance) {
                closestDistance = distanceInfo.distance;
                closestEdge = edge;
                closestPoint = distanceInfo.point;
            }
        }

        if (closestEdge && closestDistance < this.edgeSnapTolerance) {
            this.edgeActive = true;
            this.currentEdgeSegment = closestEdge;
            const worldPoint = plane.localToWorld(closestPoint);
            this.showEdgeGuide(closestEdge, plane);
            this.adjustToolPoint(worldPoint);
        } else {
            this.edgeActive = false;
            this.currentEdgeSegment = null;
            this.hideEdgeGuide();
        }
    }

    /**
     * Проверка привязки к контурам
     */
    checkContourSnap(localPoint, plane) {
        const contours = this.getAllContours();
        let closestContour = null;
        let closestDistance = Infinity;
        let closestPoint = null;

        for (const contour of contours) {
            const distanceInfo = this.distanceToSegment(localPoint, contour);

            if (distanceInfo.distance < closestDistance && distanceInfo.distance < this.contourSnapTolerance) {
                closestDistance = distanceInfo.distance;
                closestContour = contour;
                closestPoint = distanceInfo.point;
            }
        }

        if (closestContour && closestDistance < this.contourSnapTolerance) {
            this.contourActive = true;
            this.currentContourSegment = closestContour;
            const worldPoint = plane.localToWorld(closestPoint);
            this.showContourGuide(closestContour, plane);
            this.adjustToolPoint(worldPoint);
        } else {
            this.contourActive = false;
            this.currentContourSegment = null;
            this.hideContourGuide();
        }
    }

    /**
     * Проверка перпендикулярного выравнивания
     */
    checkPerpendicularAlignment(localPoint, plane) {
        const currentTool = this.sketchManager.toolManager.currentTool;
        if (!currentTool || !currentTool.isDrawing || !currentTool.tempElement ||
            !currentTool.tempElement.start) {
            return;
        }

        const startPoint = plane.worldToLocal(currentTool.tempElement.start.clone());
        const currentVec = new THREE.Vector2(
            localPoint.x - startPoint.x,
            localPoint.y - startPoint.y
        );

        if (currentVec.length() < 0.1) {
            this.hidePerpendicularGuide();
            this.perpendicularActive = false;
            return;
        }

        const currentAngle = Math.atan2(currentVec.y, currentVec.x);
        const allSegments = this.getAllSegments();
        let bestSegment = null;
        let bestAngleDiff = Infinity;
        let bestPerpendicularAngle = 0;

        for (const segment of allSegments) {
            const segmentVec = new THREE.Vector2(
                segment.end.x - segment.start.x,
                segment.end.y - segment.start.y
            );

            if (segmentVec.length() < 0.1) continue;

            const segmentAngle = Math.atan2(segmentVec.y, segmentVec.x);
            const perpendicularAngle1 = segmentAngle + Math.PI / 2;
            const perpendicularAngle2 = segmentAngle - Math.PI / 2;

            const diff1 = this.normalizeAngle(currentAngle - perpendicularAngle1);
            const diff2 = this.normalizeAngle(currentAngle - perpendicularAngle2);
            const minDiff = Math.min(Math.abs(diff1), Math.abs(diff2));

            if (minDiff < bestAngleDiff) {
                bestAngleDiff = minDiff;
                bestSegment = segment;
                bestPerpendicularAngle = Math.abs(diff1) < Math.abs(diff2) ? perpendicularAngle1 : perpendicularAngle2;
            }
        }

        const toleranceRad = this.perpendicularToleranceDegrees * Math.PI / 180;
        if (bestSegment && bestAngleDiff < toleranceRad) {
            this.perpendicularActive = true;
            this.currentPerpendicularSegment = bestSegment;

            this.showPerpendicularGuide(startPoint, bestPerpendicularAngle);

            // Корректируем конечную точку
            const length = currentVec.length();
            const perpendicularVec = new THREE.Vector2(
                Math.cos(bestPerpendicularAngle) * length,
                Math.sin(bestPerpendicularAngle) * length
            );

            const correctedLocalEnd = new THREE.Vector3(
                startPoint.x + perpendicularVec.x,
                startPoint.y + perpendicularVec.y,
                0
            );

            const correctedWorldEnd = plane.localToWorld(correctedLocalEnd);
            this.adjustToolPoint(correctedWorldEnd);
        } else {
            this.hidePerpendicularGuide();
            this.perpendicularActive = false;
            this.currentPerpendicularSegment = null;
        }
    }

    /**
     * Проверка параллельного выравнивания
     */
    checkParallelAlignment(localPoint, plane) {
        const currentTool = this.sketchManager.toolManager.currentTool;
        if (!currentTool || !currentTool.isDrawing || !currentTool.tempElement ||
            !currentTool.tempElement.start) {
            return;
        }

        const startPoint = plane.worldToLocal(currentTool.tempElement.start.clone());
        const currentVec = new THREE.Vector2(
            localPoint.x - startPoint.x,
            localPoint.y - startPoint.y
        );

        if (currentVec.length() < 0.1) {
            this.hideParallelGuide();
            this.parallelActive = false;
            return;
        }

        const currentAngle = Math.atan2(currentVec.y, currentVec.x);
        const allSegments = this.getAllSegments();
        let bestSegment = null;
        let bestAngleDiff = Infinity;
        let bestParallelAngle = 0;

        for (const segment of allSegments) {
            const segmentVec = new THREE.Vector2(
                segment.end.x - segment.start.x,
                segment.end.y - segment.start.y
            );

            if (segmentVec.length() < 0.1) continue;

            const segmentAngle = Math.atan2(segmentVec.y, segmentVec.x);
            const diff = Math.abs(this.normalizeAngle(currentAngle - segmentAngle));

            if (diff < bestAngleDiff) {
                bestAngleDiff = diff;
                bestSegment = segment;
                bestParallelAngle = segmentAngle;
            }
        }

        const toleranceRad = this.perpendicularToleranceDegrees * Math.PI / 180;
        if (bestSegment && bestAngleDiff < toleranceRad) {
            this.parallelActive = true;
            this.currentParallelSegment = bestSegment;

            this.showParallelGuide(startPoint, bestParallelAngle);

            // Корректируем конечную точку
            const length = currentVec.length();
            const parallelVec = new THREE.Vector2(
                Math.cos(bestParallelAngle) * length,
                Math.sin(bestParallelAngle) * length
            );

            const correctedLocalEnd = new THREE.Vector3(
                startPoint.x + parallelVec.x,
                startPoint.y + parallelVec.y,
                0
            );

            const correctedWorldEnd = plane.localToWorld(correctedLocalEnd);
            this.adjustToolPoint(correctedWorldEnd);
        } else {
            this.hideParallelGuide();
            this.parallelActive = false;
            this.currentParallelSegment = null;
        }
    }

    /**
     * Корректировка точки в текущем инструменте
     */
    adjustToolPoint(worldPoint) {
        const currentTool = this.sketchManager.toolManager.currentTool;
        if (currentTool && currentTool.isDrawing && currentTool.tempElement) {
            currentTool.tempElement.end = worldPoint.clone();
            if (currentTool.tempElement.points && currentTool.tempElement.points.length > 1) {
                currentTool.tempElement.points[1] = worldPoint.clone();
            }

            if (currentTool.updateTempGeometry) {
                currentTool.updateTempGeometry();
            }

            if (currentTool.updateLineDimensions) {
                const startPoint = currentTool.tempElement.start;
                currentTool.updateLineDimensions(startPoint, worldPoint);
            }
        }
    }

    /**
     * Вычисление расстояния от точки до сегмента
     */
    distanceToSegment(point, segment) {
        const start = new THREE.Vector2(segment.start.x, segment.start.y);
        const end = new THREE.Vector2(segment.end.x, segment.end.y);
        const p = new THREE.Vector2(point.x, point.y);

        const l2 = start.distanceToSquared(end);
        if (l2 === 0) return { distance: p.distanceTo(start), point: segment.start, t: 0 };

        const t = Math.max(0, Math.min(1,
            ((p.x - start.x) * (end.x - start.x) + (p.y - start.y) * (end.y - start.y)) / l2
        ));

        const closestPoint = new THREE.Vector3(
            start.x + t * (end.x - start.x),
            start.y + t * (end.y - start.y),
            0
        );

        return {
            distance: Math.sqrt(p.distanceToSquared(new THREE.Vector2(closestPoint.x, closestPoint.y))),
            point: closestPoint,
            t: t
        };
    }

    /**
     * Нормализация угла в диапазон [-π, π]
     */
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    /**
     * Поиск ближайшей точки привязки к курсору
     */
    findNearestSnapPoint(screenX, screenY) {
        if (!this.snapEnabled || this.snapPoints.length === 0) return null;

        this.updateAllScreenPositions();

        let nearestPoint = null;
        let minDistance = Infinity;

        this.snapPoints.forEach(snapPoint => {
            if (!snapPoint.screenPos) return;

            const dx = snapPoint.screenPos.x - screenX;
            const dy = snapPoint.screenPos.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance && distance < this.snapTolerance) {
                minDistance = distance;
                nearestPoint = snapPoint;
            }
        });

        return nearestPoint;
    }

    /**
     * Пересчет всех экранных позиций точек привязки
     */
    updateAllScreenPositions() {
        if (!this.sketchManager.currentPlane || this.snapPoints.length === 0) return;

        this.snapPoints.forEach(snapPoint => {
            snapPoint.screenPos = this.worldToScreen(snapPoint.point);
        });
    }

    /**
     * Преобразование мировых координат в экранные
     */
    worldToScreen(worldPoint) {
        const vector = worldPoint.clone();
        const camera = this.sketchManager.editor.camera;
        vector.project(camera);

        const width = this.sketchManager.editor.renderer.domElement.clientWidth;
        const height = this.sketchManager.editor.renderer.domElement.clientHeight;

        return {
            x: (vector.x * 0.5 + 0.5) * width,
            y: (-vector.y * 0.5 + 0.5) * height
        };
    }

    /**
     * Создание маркера при наведении
     */
    createHoverMarker(snapPoint) {
        if (!this.sketchManager.currentPlane) return;

        const color = this.colors[snapPoint.type] || this.colors.none;
        const plane = this.sketchManager.currentPlane;
        const localPoint = plane.worldToLocal(snapPoint.point.clone());

        let geometry;
        let material;
        let marker;

        switch(snapPoint.type) {
            case 'edge':
                geometry = new THREE.CircleGeometry(0.3, 8);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Mesh(geometry, material);
                marker.userData.tooltip = 'Край фигуры';
                break;
            case 'contour':
                const shape = new THREE.Shape();
                shape.moveTo(0, 0.4);
                shape.lineTo(0.4, 0);
                shape.lineTo(0, -0.4);
                shape.lineTo(-0.4, 0);
                shape.lineTo(0, 0.4);
                geometry = new THREE.ShapeGeometry(shape);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Mesh(geometry, material);
                marker.userData.tooltip = 'Контур';
                break;
            case 'perpendicular':
                geometry = new THREE.ConeGeometry(0.4, 0.8, 3);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Mesh(geometry, material);
                marker.userData.tooltip = 'Перпендикуляр';
                break;
            default:
                const vertices = new Float32Array([
                    -0.4, -0.4, 0,
                     0.4, -0.4, 0,
                     0.4,  0.4, 0,
                    -0.4,  0.4, 0,
                    -0.4, -0.4, 0
                ]);
                geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                material = new THREE.LineBasicMaterial({
                    color: color,
                    linewidth: 2,
                    transparent: true,
                    opacity: 0.8
                });
                marker = new THREE.Line(geometry, material);
                break;
        }

        marker.position.set(localPoint.x, localPoint.y, 0.1);
        marker.userData.isHoverMarker = true;
        plane.add(marker);
        this.hoverMarker = marker;
    }

    /**
     * Обновление позиции маркера
     */
    updateHoverMarkerPosition(snapPoint) {
        if (!this.hoverMarker || !this.sketchManager.currentPlane) return;

        const plane = this.sketchManager.currentPlane;
        const localPoint = plane.worldToLocal(snapPoint.point.clone());

        this.hoverMarker.position.set(localPoint.x, localPoint.y, 0.1);

        const color = this.colors[snapPoint.type] || this.colors.none;

        if (this.hoverMarker.material && this.hoverMarker.material.color) {
            this.hoverMarker.material.color.set(color);
        }
    }

    /**
     * Скрытие маркера при наведении
     */
    hideHoverMarker() {
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }

        if (this.hoverMarker) {
            if (this.hoverMarker.parent) {
                this.hoverMarker.parent.remove(this.hoverMarker);
            }
            if (this.hoverMarker.geometry) this.hoverMarker.geometry.dispose();
            if (this.hoverMarker.material) this.hoverMarker.material.dispose();
            this.hoverMarker = null;
        }
    }

    /**
     * Показ линии привязки от курсора к точке привязки
     */
    showSnapLine(fromPoint, toPoint) {
        this.hideSnapLine();

        if (!this.sketchManager.currentPlane) return;

        const plane = this.sketchManager.currentPlane;
        const localFrom = plane.worldToLocal(fromPoint.clone());
        const localTo = plane.worldToLocal(toPoint.clone());

        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(localFrom.x, localFrom.y, 0.05),
            new THREE.Vector3(localTo.x, localTo.y, 0.05)
        ]);

        const material = new THREE.LineDashedMaterial({
            color: 0x00FFFF,
            linewidth: 1,
            dashSize: 0.3,
            gapSize: 0.3,
            transparent: true,
            opacity: 0.6
        });

        this.snapLine = new THREE.Line(geometry, material);
        this.snapLine.computeLineDistances();
        this.snapLine.userData.isSnapLine = true;
        plane.add(this.snapLine);
    }

    /**
     * Скрытие линии привязки
     */
    hideSnapLine() {
        if (this.snapLine) {
            if (this.snapLine.parent) {
                this.snapLine.parent.remove(this.snapLine);
            }
            if (this.snapLine.geometry) this.snapLine.geometry.dispose();
            if (this.snapLine.material) this.snapLine.material.dispose();
            this.snapLine = null;
        }
    }

    /**
     * Показ направляющей для перпендикулярных углов
     */
    showPerpendicularGuide(startPoint, angle) {
        this.hidePerpendicularGuide();

        const plane = this.sketchManager.currentPlane;
        const guideLength = 1000;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const guideStart = new THREE.Vector3(
            startPoint.x - cos * guideLength,
            startPoint.y - sin * guideLength,
            0.05
        );

        const guideEnd = new THREE.Vector3(
            startPoint.x + cos * guideLength,
            startPoint.y + sin * guideLength,
            0.05
        );

        const geometry = new THREE.BufferGeometry().setFromPoints([guideStart, guideEnd]);
        const material = new THREE.LineDashedMaterial({
            color: this.colors.perpendicular,
            linewidth: 1,
            dashSize: 0.3,
            gapSize: 0.3,
            transparent: true,
            opacity: 0.6
        });

        this.perpendicularGuide = new THREE.Line(geometry, material);
        this.perpendicularGuide.computeLineDistances();
        this.perpendicularGuide.userData.isPerpendicularGuide = true;
        plane.add(this.perpendicularGuide);
    }

    /**
     * Показ направляющей вдоль края фигуры
     */
    showEdgeGuide(edge, plane) {
        this.hideEdgeGuide();

        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(edge.start.x, edge.start.y, 0.05),
            new THREE.Vector3(edge.end.x, edge.end.y, 0.05)
        ]);

        const material = new THREE.LineDashedMaterial({
            color: this.colors.edge,
            linewidth: 2,
            dashSize: 0.2,
            gapSize: 0.1,
            transparent: true,
            opacity: 0.5
        });

        this.edgeGuide = new THREE.Line(geometry, material);
        this.edgeGuide.computeLineDistances();
        this.edgeGuide.userData.isEdgeGuide = true;
        plane.add(this.edgeGuide);
    }

    /**
     * Показ направляющей вдоль контура
     */
    showContourGuide(contour, plane) {
        this.hideContourGuide();

        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(contour.start.x, contour.start.y, 0.05),
            new THREE.Vector3(contour.end.x, contour.end.y, 0.05)
        ]);

        const material = new THREE.LineDashedMaterial({
            color: this.colors.contour,
            linewidth: 2,
            dashSize: 0.15,
            gapSize: 0.15,
            transparent: true,
            opacity: 0.4
        });

        this.contourGuide = new THREE.Line(geometry, material);
        this.contourGuide.computeLineDistances();
        this.contourGuide.userData.isContourGuide = true;
        plane.add(this.contourGuide);
    }

    /**
     * Показ направляющей для параллельных линий
     */
    showParallelGuide(startPoint, angle) {
        this.hideParallelGuide();

        const plane = this.sketchManager.currentPlane;
        const guideLength = 1000;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const guideStart = new THREE.Vector3(
            startPoint.x - cos * guideLength,
            startPoint.y - sin * guideLength,
            0.05
        );

        const guideEnd = new THREE.Vector3(
            startPoint.x + cos * guideLength,
            startPoint.y + sin * guideLength,
            0.05
        );

        const geometry = new THREE.BufferGeometry().setFromPoints([guideStart, guideEnd]);
        const material = new THREE.LineDashedMaterial({
            color: this.colors.parallel,
            linewidth: 1,
            dashSize: 0.2,
            gapSize: 0.4,
            transparent: true,
            opacity: 0.5
        });

        this.parallelGuide = new THREE.Line(geometry, material);
        this.parallelGuide.computeLineDistances();
        this.parallelGuide.userData.isParallelGuide = true;
        plane.add(this.parallelGuide);
    }

    /**
     * Скрытие всех направляющих
     */
    hidePerpendicularGuide() {
        this.removeGuide(this.perpendicularGuide);
        this.perpendicularGuide = null;
    }

    hideEdgeGuide() {
        this.removeGuide(this.edgeGuide);
        this.edgeGuide = null;
    }

    hideContourGuide() {
        this.removeGuide(this.contourGuide);
        this.contourGuide = null;
    }

    hideParallelGuide() {
        this.removeGuide(this.parallelGuide);
        this.parallelGuide = null;
    }

    removeGuide(guide) {
        if (guide) {
            if (guide.parent) {
                guide.parent.remove(guide);
            }
            if (guide.geometry) guide.geometry.dispose();
            if (guide.material) guide.material.dispose();
        }
    }

    /**
     * Показ индикатора угла
     */
    showAngleIndicator(currentPoint) {
        const tool = this.sketchManager.toolManager.currentTool;
        if (!tool || !tool.tempElement || !tool.tempElement.start || !this.sketchManager.currentPlane) return;

        const startPoint = tool.tempElement.start;
        let endPoint = currentPoint;

        if (this.currentSnapPoint) {
            endPoint = this.currentSnapPoint.point;
        }

        const plane = this.sketchManager.currentPlane;
        const localStart = plane.worldToLocal(startPoint.clone());
        const localEnd = plane.worldToLocal(endPoint.clone());

        const dx = localEnd.x - localStart.x;
        const dy = localEnd.y - localStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 1) {
            this.hideAngleIndicator();
            return;
        }

        let angleRad = Math.atan2(dy, dx);
        let degrees = THREE.MathUtils.radToDeg(angleRad);
        if (degrees < 0) degrees += 360;

        // Проверяем специальные углы
        let isPerpendicular = this.perpendicularActive;
        let isRightAngle = false;
        let isParallel = this.parallelActive;
        const tolerance = 1.0;

        // Проверяем стандартные углы
        if (Math.abs(degrees - 0) < tolerance || Math.abs(degrees - 360) < tolerance) {
            degrees = 0;
            isRightAngle = true;
        } else if (Math.abs(degrees - 90) < tolerance) {
            degrees = 90;
            isRightAngle = true;
        } else if (Math.abs(degrees - 180) < tolerance) {
            degrees = 180;
            isRightAngle = true;
        } else if (Math.abs(degrees - 270) < tolerance) {
            degrees = 270;
            isRightAngle = true;
        } else if (Math.abs(Math.abs(dy) - Math.abs(dx)) < 0.1 * Math.max(Math.abs(dx), Math.abs(dy))) {
            // Углы 45°, 135°, 225°, 315°
            if (Math.abs(degrees - 45) < tolerance) {
                degrees = 45;
                isRightAngle = true;
            } else if (Math.abs(degrees - 135) < tolerance) {
                degrees = 135;
                isRightAngle = true;
            } else if (Math.abs(degrees - 225) < tolerance) {
                degrees = 225;
                isRightAngle = true;
            } else if (Math.abs(degrees - 315) < tolerance) {
                degrees = 315;
                isRightAngle = true;
            }
        }

        if (Math.abs(degrees - this.lastAngle) > 0.5 ||
            isPerpendicular !== (this.lastIsPerpendicular || false) ||
            isParallel !== (this.lastIsParallel || false)) {

            this.lastAngle = degrees;
            this.lastIsPerpendicular = isPerpendicular;
            this.lastIsParallel = isParallel;

            this.hideAngleIndicator();
            this.createAngleIndicator(localStart, localEnd, degrees, isRightAngle, isPerpendicular, isParallel);
        }
    }

    /**
     * Создание индикатора угла
     */
    createAngleIndicator(localStart, localEnd, degrees, isRightAngle, isPerpendicular, isParallel) {
        if (!this.sketchManager.currentPlane) return;

        const plane = this.sketchManager.currentPlane;
        let color;

        if (isPerpendicular) {
            color = this.colors.perpendicular;
        } else if (isParallel) {
            color = this.colors.parallel;
        } else if (isRightAngle) {
            color = 0x00FF00;
        } else {
            color = 0x7777FF;
        }

        const dx = localEnd.x - localStart.x;
        const dy = localEnd.y - localStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const radius = Math.min(3, distance / 5);

        let angleRad = Math.atan2(dy, dx);
        if (angleRad < 0) angleRad += Math.PI * 2;

        const startAngle = 0;
        const endAngle = angleRad;
        const arcPoints = [];
        const segments = 16;

        for (let i = 0; i <= segments; i++) {
            const theta = startAngle + (i / segments) * endAngle;
            const x = localStart.x + Math.cos(theta) * radius;
            const y = localStart.y + Math.sin(theta) * radius;
            arcPoints.push(new THREE.Vector3(x, y, 0.05));
        }

        const arcGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const arcMaterial = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        this.angleIndicator = new THREE.Line(arcGeometry, arcMaterial);
        this.angleIndicator.userData.isAngleIndicator = true;
        this.createAngleLabel(localStart, angleRad, radius, degrees, isRightAngle, isPerpendicular, isParallel);
        plane.add(this.angleIndicator);
    }

    /**
     * Создание текстовой метки с углом
     */
    createAngleLabel(localStart, angleRad, radius, degrees, isRightAngle, isPerpendicular, isParallel) {
        if (!this.sketchManager.currentPlane) return;

        const plane = this.sketchManager.currentPlane;
        const labelRadius = radius * 1.5;
        let labelAngle = angleRad / 2;

        if (angleRad > Math.PI) {
            labelAngle = angleRad + (Math.PI * 2 - angleRad) / 2;
        }

        const labelX = localStart.x + Math.cos(labelAngle) * labelRadius;
        const labelY = localStart.y + Math.sin(labelAngle) * labelRadius;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 100;
        canvas.height = 30;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 14px Arial';

        if (isPerpendicular) {
            context.fillStyle = '#FFA500';
        } else if (isParallel) {
            context.fillStyle = '#FF00FF';
        } else if (isRightAngle) {
            context.fillStyle = '#00FF00';
        } else {
            context.fillStyle = '#7777FF';
        }

        context.textAlign = 'center';
        context.textBaseline = 'middle';

        let angleText;
        if (isPerpendicular) {
            angleText = `${Math.round(degrees)}° ⟂`;
        } else if (isParallel) {
            angleText = `${Math.round(degrees)}° ∥`;
        } else if (isRightAngle) {
            if (Math.abs(degrees - 0) < 0.1 || Math.abs(degrees - 360) < 0.1) {
                angleText = "0° →";
            } else if (Math.abs(degrees - 45) < 0.1) {
                angleText = "45°";
            } else if (Math.abs(degrees - 90) < 0.1) {
                angleText = "90° ↑";
            } else if (Math.abs(degrees - 135) < 0.1) {
                angleText = "135°";
            } else if (Math.abs(degrees - 180) < 0.1) {
                angleText = "180° ←";
            } else if (Math.abs(degrees - 225) < 0.1) {
                angleText = "225°";
            } else if (Math.abs(degrees - 270) < 0.1) {
                angleText = "270° ↓";
            } else if (Math.abs(degrees - 315) < 0.1) {
                angleText = "315°";
            } else {
                angleText = `${Math.round(degrees)}°`;
            }
        } else {
            angleText = `${degrees.toFixed(1)}°`;
        }

        context.fillText(angleText, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9
        });

        this.angleLabel = new THREE.Sprite(spriteMaterial);
        const localPos = new THREE.Vector3(labelX, labelY, 0.1);
        this.angleLabel.position.copy(localPos);
        this.angleLabel.scale.set(8, 2, 1);
        this.angleLabel.userData.isAngleLabel = true;
        plane.add(this.angleLabel);
    }

    /**
     * Скрытие индикатора угла
     */
    hideAngleIndicator() {
        if (this.angleIndicator) {
            this.removeGuide(this.angleIndicator);
            this.angleIndicator = null;
        }

        if (this.angleLabel) {
            this.removeGuide(this.angleLabel);
            this.angleLabel = null;
        }

        this.lastAngle = 0;
        this.lastIsPerpendicular = false;
        this.lastIsParallel = false;
    }

    /**
     * Получение точки с учетом привязок
     */
    getSnappedPoint(rawPoint, currentTool = null) {
        if (!this.snapEnabled) return rawPoint;

        // Приоритет привязок:
        // 1. Точки привязки (конечные, средние, центры, пересечения)
        if (this.currentSnapPoint) {
            return this.currentSnapPoint.point;
        }

        // 2. Динамические привязки (края, контуры, перпендикуляры, параллели)
        const dynamicStates = [
            {active: this.edgeActive, tool: currentTool},
            {active: this.contourActive, tool: currentTool},
            {active: this.perpendicularActive, tool: currentTool},
            {active: this.parallelActive, tool: currentTool}
        ];

        for (const state of dynamicStates) {
            if (state.active && state.tool && state.tool.tempElement && state.tool.tempElement.end) {
                return state.tool.tempElement.end;
            }
        }

        return rawPoint;
    }

    /**
     * Включение/выключение системы привязки
     */
    toggleSnap() {
        this.snapEnabled = !this.snapEnabled;

        if (!this.snapEnabled) {
            this.clearAllVisuals();
        }

        return this.snapEnabled;
    }

     showHoverMarker(snapPoint) {
        // Очищаем предыдущий таймаут
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }

        // Если маркер уже отображается, обновляем его позицию
        if (this.hoverMarker) {
            this.updateHoverMarkerPosition(snapPoint);
            return;
        }

        // Создаем новый маркер с небольшой задержкой (чтобы не мигало)
        this.hoverTimeout = setTimeout(() => {
            this.createHoverMarker(snapPoint);
        }, 5);
    }

    getCursorPosition(rawPoint) {
        if (!this.snapEnabled) return rawPoint;

        // Если есть активная точка привязки, возвращаем ее
        if (this.currentSnapPoint) {
            return this.currentSnapPoint.point;
        }

        // Если активна перпендикулярная привязка, возвращаем скорректированную точку
        if (this.perpendicularActive) {
            // Возвращаем точку, которая уже была скорректирована в tempElement
            const currentTool = this.sketchManager.toolManager.currentTool;
            if (currentTool && currentTool.tempElement && currentTool.tempElement.end) {
                return currentTool.tempElement.end;
            }
        }

        // Аналогично для других типов привязок (edge, contour, parallel)
        const dynamicStates = [
            {active: this.edgeActive, tool: this.sketchManager.toolManager.currentTool},
            {active: this.contourActive, tool: this.sketchManager.toolManager.currentTool},
            {active: this.perpendicularActive, tool: this.sketchManager.toolManager.currentTool},
            {active: this.parallelActive, tool: this.sketchManager.toolManager.currentTool}
        ];

        for (const state of dynamicStates) {
            if (state.active && state.tool && state.tool.tempElement && state.tool.tempElement.end) {
                return state.tool.tempElement.end;
            }
        }

        return rawPoint;
    }


    /**
     * Включение/выключение привязки к краям
     */
    toggleEdgeSnap() {
        this.edgeSnapEnabled = !this.edgeSnapEnabled;
        if (!this.edgeSnapEnabled) {
            this.edgeActive = false;
            this.hideEdgeGuide();
        }
        return this.edgeSnapEnabled;
    }

    /**
     * Включение/выключение привязки к контурам
     */
    toggleContourSnap() {
        this.contourSnapEnabled = !this.contourSnapEnabled;
        if (!this.contourSnapEnabled) {
            this.contourActive = false;
            this.hideContourGuide();
        }
        return this.contourSnapEnabled;
    }

    /**
     * Включение/выключение перпендикулярной привязки
     */
    togglePerpendicularSnap() {
        this.perpendicularSnapEnabled = !this.perpendicularSnapEnabled;
        if (!this.perpendicularSnapEnabled) {
            this.perpendicularActive = false;
            this.hidePerpendicularGuide();
        }
        return this.perpendicularSnapEnabled;
    }

    /**
     * Очистка всех точек привязки
     */
    clearSnapPoints() {
        this.snapPoints = [];
        this.hideHoverMarker();
        this.hideSnapLine();
        this.currentSnapPoint = null;
        this.isHovering = false;
    }

    /**
     * Очистка всех визуальных элементов
     */
    clearAllVisuals() {
        this.hideHoverMarker();
        this.hideSnapLine();
        this.hideAngleIndicator();
        this.hidePerpendicularGuide();
        this.hideEdgeGuide();
        this.hideContourGuide();
        this.hideParallelGuide();

        this.perpendicularActive = false;
        this.edgeActive = false;
        this.contourActive = false;
        this.parallelActive = false;

        this.currentPerpendicularSegment = null;
        this.currentEdgeSegment = null;
        this.currentContourSegment = null;
        this.currentParallelSegment = null;
    }

    /**
     * Очистка всех ресурсов
     */
    clear() {
        this.clearSnapPoints();
        this.clearAllVisuals();
        this.snapPoints = [];

        this.cachedSegments = [];
        this.cachedEdges = [];
        this.cachedContours = [];
        this.cachedCircles = [];
        this.markAllDirty();
    }
}