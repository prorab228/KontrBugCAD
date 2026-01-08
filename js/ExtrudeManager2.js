// ExtrudeManager.js - исправленная версия с правильной ориентацией для внутренних фигур
// ExtrudeManager.js - исправленная версия с правильной группировкой дуг
class FigureManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.allFigures = new Map(); // id -> Figure
        this.figureCacheTimestamp = 0;
        console.log("FigureManager: создан");
    }

    // Сбор всех фигур на чертеже
    collectAllFigures() {
        console.log("FigureManager: начинаем сбор фигур");
        const now = Date.now();
        if (this.allFigures.size > 0 && now - this.figureCacheTimestamp < 100) {
            console.log("FigureManager: используем кэш, фигур:", this.allFigures.size);
            return Array.from(this.allFigures.values());
        }

        const allElements = this.editor.objectsManager.getAllSketchElements();
        console.log("FigureManager: найдено элементов:", allElements.length);

        // Собираем элементы по группам (объединяем дуги в круги)
        const elementGroups = this.groupArcElements(allElements);
        console.log("FigureManager: сгруппировано элементов в группы:", elementGroups.length);

        // 1. Собираем простые замкнутые элементы и группы
        const simpleContours = this.collectSimpleContours(elementGroups);
        console.log("FigureManager: простых контуров:", simpleContours.length);

        // 2. Собираем контуры из линий (исключая элементы, уже вошедшие в простые контуры)
        const lineContours = this.collectLineContours(allElements, simpleContours);
        console.log("FigureManager: контуров из линий:", lineContours.length);

        // 3. Объединяем все контуры в фигуры
        const allContours = [...simpleContours, ...lineContours];
        console.log("FigureManager: всего контуров:", allContours.length);

        // 4. Создаем фигуры для каждого контура
        const figures = this.createFiguresFromContours(allContours);

        // 5. Устанавливаем связи parent-child
        this.buildFigureRelations(figures);

        // 6. Сохраняем в карту
        this.allFigures.clear();
        figures.forEach(figure => {
            this.allFigures.set(figure.id, figure);
        });

        this.figureCacheTimestamp = now;

        // Выводим отладочную информацию
        console.log("=== ДЕБАГ: ВСЕ ФИГУРЫ ===");
        figures.forEach((figure, index) => {
            console.log(`Фигура ${index}:`, {
                id: figure.id,
                area: figure.area,
                isHole: figure.isHole,
                parentId: figure.parentId,
                childrenIds: figure.childrenIds.length,
                holes: figure.holes ? figure.holes.length : 0,
                outerType: figure.outer.element ? 'single' : 'multi',
                outerIsClockwise: figure.outer.isClockwise,
                elementIds: figure.elementIds ? Array.from(figure.elementIds).slice(0, 3) : []
            });
        });
        console.log("=== КОНЕЦ ДЕБАГА ===");

        return figures;
    }

    // Группировка дуг в круги
    groupArcElements(allElements) {
        const groups = [];
        const processed = new Set();

        // Сначала находим все дуги и круги
        const arcsAndCircles = allElements.filter(el =>
            el.userData.elementType === 'arc' ||
            el.userData.elementType === 'circle' ||
            (el.userData.elementType === 'polyline' && this.isArcLike(el))
        );

        console.log(`Найдено дуг и кругов: ${arcsAndCircles.length}`);

        // Создаем группы дуг, которые образуют полные круги
        for (let i = 0; i < arcsAndCircles.length; i++) {
            if (processed.has(arcsAndCircles[i])) continue;

            const element = arcsAndCircles[i];
            const group = [element];
            processed.add(element);

            // Для кругов - создаем отдельную группу
            if (element.userData.elementType === 'circle') {
                const center = this.getArcCenter(element);
                const radius = this.getArcRadius(element);

                if (center && radius) {
                    groups.push({
                        type: 'circle',
                        elements: group,
                        center: center,
                        radius: radius,
                        isFullCircle: true
                    });
                }
                continue;
            }

            // Для дуг ищем другие дуги с тем же центром и радиусом
            const center1 = this.getArcCenter(element);
            const radius1 = this.getArcRadius(element);

            if (!center1 || radius1 === null) continue;

            for (let j = i + 1; j < arcsAndCircles.length; j++) {
                if (processed.has(arcsAndCircles[j])) continue;

                const otherElement = arcsAndCircles[j];
                const center2 = this.getArcCenter(otherElement);
                const radius2 = this.getArcRadius(otherElement);

                if (!center2 || radius2 === null) continue;

                // Проверяем, что дуги имеют одинаковый центр и радиус
                const distance = Math.sqrt(
                    Math.pow(center2.x - center1.x, 2) +
                    Math.pow(center2.y - center1.y, 2)
                );

                if (distance < 0.1 && Math.abs(radius2 - radius1) < 0.1) {
                    group.push(otherElement);
                    processed.add(otherElement);
                }
            }

            // Если нашли достаточно дуг для круга (минимум 2)
            if (group.length >= 2) {
                const isFullCircle = this.checkIfFullCircle(group);
                groups.push({
                    type: 'arc_group',
                    elements: group,
                    center: center1,
                    radius: radius1,
                    isFullCircle: isFullCircle
                });
                console.log(`Создана группа дуг: ${group.length} дуг, полный круг: ${isFullCircle}`);
            } else if (group.length === 1) {
                // Одиночная дуга - не создаем группу
                console.log(`Одиночная дуга, не создаем группу: ${group[0].userData.elementType}`);
            }
        }

        // Добавляем одиночные элементы, не вошедшие в группы (кроме дуг)
        allElements.forEach(el => {
            if (!processed.has(el) && el.userData.elementType !== 'arc') {
                groups.push({
                    type: 'single',
                    elements: [el]
                });
            }
        });

        console.log(`Всего создано групп: ${groups.length}`);
        return groups;
    }

    isArcLike(element) {
        if (!element.userData || !element.geometry) return false;

        // Проверяем, похожа ли полилиния на дугу
        const points = this.getElementPoints(element);
        if (points.length < 3) return false;

        // Для дуги обычно точки лежат на окружности
        // Упрощенная проверка - вычисляем расстояния до предполагаемого центра
        const center = this.calculateContourCenter(points);
        const distances = points.map(p => {
            const dx = p.x - center.x;
            const dy = p.y - center.y;
            return Math.sqrt(dx * dx + dy * dy);
        });

        // Если все расстояния примерно равны, это может быть дуга
        const avgDistance = distances.reduce((a, b) => a + b) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;

        return variance < 1.0; // Допустимая дисперсия
    }

    getArcCenter(element) {
        if (!element.userData) return null;

        if (element.userData.center) {
            return new THREE.Vector2(
                element.userData.center.x,
                element.userData.center.y
            );
        }

        // Для круга из userData
        if (element.userData.cx !== undefined && element.userData.cy !== undefined) {
            return new THREE.Vector2(element.userData.cx, element.userData.cy);
        }

        // Вычисляем центр из точек
        const points = this.getElementPoints(element);
        if (points.length >= 3) {
            return this.calculateContourCenter(points);
        }

        return null;
    }

    getArcRadius(element) {
        if (!element.userData) return null;

        if (element.userData.radius !== undefined) {
            return element.userData.radius;
        }

        if (element.userData.r !== undefined) {
            return element.userData.r;
        }

        if (element.userData.width && element.userData.height) {
            return Math.max(element.userData.width, element.userData.height) / 2;
        }

        // Пытаемся вычислить радиус из точек
        const points = this.getElementPoints(element);
        if (points.length >= 2) {
            const center = this.getArcCenter(element);
            if (center) {
                // Вычисляем среднее расстояние до центра
                let totalDistance = 0;
                let count = 0;
                for (const point of points) {
                    const dx = point.x - center.x;
                    const dy = point.y - center.y;
                    totalDistance += Math.sqrt(dx * dx + dy * dy);
                    count++;
                }
                return count > 0 ? totalDistance / count : null;
            }
        }

        return null;
    }

    checkIfFullCircle(arcs) {
        if (arcs.length === 0) return false;

        // Если есть хотя бы один полный круг
        for (const arc of arcs) {
            if (arc.userData.elementType === 'circle') {
                return true;
            }
        }

        // Для дуг - собираем все углы
        const angles = [];

        arcs.forEach(arc => {
            if (arc.userData.startAngle !== undefined && arc.userData.endAngle !== undefined) {
                angles.push({
                    start: arc.userData.startAngle,
                    end: arc.userData.endAngle
                });
            }
        });

        if (angles.length === 0) return false;

        // Проверяем, покрывают ли дуги полный круг (360 градусов)
        const coverage = new Array(360).fill(false);

        angles.forEach(angle => {
            let startDeg = Math.round(angle.start * 180 / Math.PI);
            let endDeg = Math.round(angle.end * 180 / Math.PI);

            // Нормализуем углы
            if (startDeg < 0) startDeg += 360;
            if (endDeg < 0) endDeg += 360;

            if (startDeg <= endDeg) {
                for (let i = startDeg; i <= endDeg; i++) {
                    coverage[i] = true;
                }
            } else {
                for (let i = startDeg; i < 360; i++) coverage[i] = true;
                for (let i = 0; i <= endDeg; i++) coverage[i] = true;
            }
        });

        // Проверяем, покрыты ли все градусы
        const coveredCount = coverage.filter(v => v).length;
        const isFull = coveredCount >= 350; // Допускаем небольшой зазор

        console.log(`Проверка полного круга: покрыто ${coveredCount}/360 градусов, полный: ${isFull}`);
        return isFull;
    }

    createFiguresFromContours(contours) {
        console.log("FigureManager: создаем фигуры из контуров");

        // Сортируем контуры по площади (от большей к меньшей)
        const sortedContours = [...contours].sort((a, b) => b.area - a.area);

        const figures = [];

        // Создаем фигуру для каждого контура
        sortedContours.forEach((contour, index) => {
            const figure = {
                id: `figure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                outer: contour,
                holes: [],
                area: contour.area,
                selected: false,
                parentId: null,
                childrenIds: [],
                isStandalone: true,
                canBeSelected: true,
                isHole: false,
                elementIds: new Set(),
                element: contour.element || (contour.elements ? contour.elements[0] : null)
            };

            // Собираем все ID элементов фигуры
            if (contour.element) {
                figure.elementIds.add(contour.element.uuid);
            } else if (contour.elements) {
                contour.elements.forEach(el => figure.elementIds.add(el.uuid));
            }

            figures.push(figure);
        });

        console.log("FigureManager: создано фигур:", figures.length);
        return figures;
    }

    buildFigureRelations(figures) {
        console.log("=== FigureManager: строим связи между фигурами ===");

        // Сортируем фигуры по площади (от большей к меньшей)
        const sortedFigures = [...figures].sort((a, b) => b.area - a.area);

        // Для каждой фигуры ищем, какие фигуры находятся внутри неё
        for (let i = 0; i < sortedFigures.length; i++) {
            const outerFigure = sortedFigures[i];

            // Пропускаем фигуры, которые уже являются отверстиями
            if (outerFigure.isHole) {
                console.log(`  Фигура ${outerFigure.id} уже является отверстием, пропускаем`);
                continue;
            }

            for (let j = i + 1; j < sortedFigures.length; j++) {
                const innerFigure = sortedFigures[j];

                // Пропускаем фигуры, которые уже являются отверстиями
                if (innerFigure.isHole) {
                    console.log(`  Фигура ${innerFigure.id} уже является отверстием, пропускаем`);
                    continue;
                }

                // Проверяем, находится ли внутренняя фигура полностью внутри внешней
                if (this.isFigureCompletelyInsideFigure(innerFigure, outerFigure)) {
                    console.log(`  Найдена вложенность: ${outerFigure.id} (площадь: ${outerFigure.area}) -> ${innerFigure.id} (площадь: ${innerFigure.area})`);

                    // Устанавливаем связь parent-child
                    outerFigure.childrenIds.push(innerFigure.id);
                    innerFigure.parentId = outerFigure.id;
                    innerFigure.isHole = true;

                    // Добавляем контур внутренней фигуры как отверстие во внешнюю фигуру
                    outerFigure.holes.push(innerFigure.outer);

                    console.log(`  Установлена связь: ${outerFigure.id} -> ${innerFigure.id} (теперь отверстие)`);
                }
            }

            // Если у фигуры есть отверстия, она не standalone
            if (outerFigure.childrenIds.length > 0) {
                outerFigure.isStandalone = false;
            }
        }

        console.log("FigureManager: связи построены");
    }

    isFigureCompletelyInsideFigure(innerFigure, outerFigure) {
        // Проверяем несколько точек внутренней фигуры, чтобы убедиться, что она полностью внутри
        const innerPoints = innerFigure.outer.points;
        const outerPoints = outerFigure.outer.points;

        if (!innerPoints || !outerPoints || innerPoints.length < 3 || outerPoints.length < 3) {
            console.log(`  Недостаточно точек для проверки вложенности`);
            return false;
        }

        // Проверяем все точки внутренней фигуры
        let allPointsInside = true;
        for (const point of innerPoints) {
            if (!this.isPointInsidePolygon(point, outerPoints)) {
                console.log(`  Точка (${point.x}, ${point.y}) внутренней фигуры ${innerFigure.id} НЕ находится внутри внешней фигуры ${outerFigure.id}`);
                allPointsInside = false;
                break;
            }
        }

        if (!allPointsInside) {
            return false;
        }

        // Также проверяем, что фигуры не пересекаются
        // Для этого проверяем, что ни одна точка внешней фигуры не находится внутри внутренней фигуры
        let anyOuterPointInside = false;
        for (const point of outerPoints) {
            if (this.isPointInsidePolygon(point, innerPoints)) {
                anyOuterPointInside = true;
                break;
            }
        }

        if (anyOuterPointInside) {
            console.log(`  Фигуры пересекаются: внешняя ${outerFigure.id} имеет точки внутри внутренней ${innerFigure.id}`);
            return false;
        }

        console.log(`  Все точки внутренней фигуры ${innerFigure.id} находятся внутри внешней фигуры ${outerFigure.id}`);
        return true;
    }

    isPointInsidePolygon(point, polygon) {
        if (!polygon || polygon.length < 3) return false;

        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }
        return inside;
    }

    collectSimpleContours(elementGroups) {
        const contours = [];

        elementGroups.forEach(group => {
            const elements = group.elements;

            if (elements.length === 1) {
                // Одиночный элемент
                const element = elements[0];
                if (this.isSketchElementClosed(element)) {
                    const points = this.getElementPoints(element);
                    const area = this.calculatePolygonArea(points);
                    const center = this.calculateContourCenter(points);

                    if (points.length >= 3 && Math.abs(area) > 0.001) {
                        const isClockwise = area < 0;

                        contours.push({
                            element: element,
                            points: points,
                            area: Math.abs(area),
                            center: center,
                            boundingBox: this.calculateBoundingBox(points),
                            type: 'simple',
                            isClockwise: isClockwise,
                            originalArea: area
                        });
                        console.log(`Создан контур для одиночного элемента: ${element.userData.elementType}, площадь: ${Math.abs(area)}`);
                    }
                }
            } else if (group.type === 'circle' || (group.type === 'arc_group' && group.isFullCircle)) {
                // Группа дуг, образующих полный круг, или отдельный круг
                console.log("Обработка группы как круга");

                // Создаем круг из центра и радиуса
                const center = group.center;
                const radius = group.radius;

                if (center && radius) {
                    // Генерируем точки для круга (32 точки для гладкости)
                    const points = [];
                    const segments = 32;
                    for (let i = 0; i < segments; i++) {
                        const angle = (i / segments) * Math.PI * 2;
                        points.push(new THREE.Vector2(
                            center.x + radius * Math.cos(angle),
                            center.y + radius * Math.sin(angle)
                        ));
                    }

                    const area = Math.PI * radius * radius;
                    const isClockwise = false; // Круги всегда против часовой стрелки

                    contours.push({
                        elements: elements,
                        points: points,
                        area: area,
                        center: center,
                        boundingBox: {
                            min: new THREE.Vector2(center.x - radius, center.y - radius),
                            max: new THREE.Vector2(center.x + radius, center.y + radius)
                        },
                        type: 'circle',
                        isClockwise: isClockwise,
                        isClosed: true
                    });
                    console.log(`Создан контур круга: центр (${center.x}, ${center.y}), радиус: ${radius}, площадь: ${area}`);
                }
            } else if (group.type === 'arc_group' && !group.isFullCircle) {
                // Группа дуг, не образующих полный круг - не создаем контур
                console.log(`Группа дуг не образует полный круг, пропускаем: ${elements.length} дуг`);
            }
        });

        return contours;
    }

    collectLineContours(allElements, simpleContours) {
        // Собираем ID элементов, уже вошедших в простые контуры
        const usedElementIds = new Set();
        simpleContours.forEach(contour => {
            if (contour.element) {
                usedElementIds.add(contour.element.uuid);
            } else if (contour.elements) {
                contour.elements.forEach(el => usedElementIds.add(el.uuid));
            }
        });

        // Фильтруем линии, исключая уже использованные элементы
        const lines = allElements.filter(element =>
            (element.userData.elementType === 'line' ||
            element.userData.elementType === 'polyline') &&
            !usedElementIds.has(element.uuid)
        );

        if (lines.length === 0) return [];

        const graphData = this.buildLineGraphs(lines);
        const rawContours = this.findClosedContoursInGraph(graphData);

        const contours = [];
        const processedLines = new Set();

        rawContours.forEach((rawContour, index) => {
            const contourElements = [];
            const edgeSet = new Set();

            for (let i = 0; i < rawContour.vertices.length; i++) {
                const v1 = rawContour.vertices[i];
                const v2 = rawContour.vertices[(i + 1) % rawContour.vertices.length];

                const edgeKey = `${Math.min(v1, v2)}-${Math.max(v1, v2)}`;
                if (!edgeSet.has(edgeKey)) {
                    edgeSet.add(edgeKey);

                    const matchingEdge = graphData.edges.find(([ev1, ev2]) =>
                        (ev1 === v1 && ev2 === v2) || (ev1 === v2 && ev2 === v1)
                    );

                    if (matchingEdge) {
                        const element = matchingEdge[2];
                        if (!processedLines.has(element)) {
                            contourElements.push(element);
                            processedLines.add(element);
                        }
                    }
                }
            }

            if (contourElements.length > 0) {
                const center = this.calculateContourCenter(rawContour.points);
                const area = this.calculatePolygonArea(rawContour.points);
                const isClockwise = area < 0;

                contours.push({
                    elements: contourElements,
                    points: rawContour.points,
                    area: Math.abs(area),
                    center: center,
                    boundingBox: this.calculateBoundingBox(rawContour.points),
                    type: 'line',
                    isClockwise: isClockwise,
                    isClosed: true,
                    contourId: `line_contour_${index}`,
                    originalArea: area
                });
            }
        });

        return contours;
    }

    buildLineGraphs(lines) {
        const vertices = new Map();
        const edges = [];

        lines.forEach(element => {
            const points = this.getElementPoints(element);
            if (points.length < 2) return;

            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];

                const key1 = `${p1.x.toFixed(4)},${p1.y.toFixed(4)}`;
                const key2 = `${p2.x.toFixed(4)},${p2.y.toFixed(4)}`;

                if (!vertices.has(key1)) vertices.set(key1, vertices.size);
                if (!vertices.has(key2)) vertices.set(key2, vertices.size);

                edges.push([
                    vertices.get(key1),
                    vertices.get(key2),
                    element
                ]);
            }
        });

        const graph = new Map();
        edges.forEach(([v1, v2, element]) => {
            if (!graph.has(v1)) graph.set(v1, []);
            if (!graph.has(v2)) graph.set(v2, []);

            graph.get(v1).push({ vertex: v2, element });
            graph.get(v2).push({ vertex: v1, element });
        });

        return {
            vertices: Array.from(vertices.keys()).map(key => {
                const [x, y] = key.split(',').map(Number);
                return new THREE.Vector2(x, y);
            }),
            graph: graph,
            edges: edges
        };
    }

    findClosedContoursInGraph(graphData) {
        const contours = [];
        const visitedEdges = new Set();
        const vertexCoords = graphData.vertices;
        const graph = graphData.graph;

        const findCycles = (startVertex, currentVertex, path, visitedVertices) => {
            if (path.length > 1 && currentVertex === startVertex) {
                if (path.length >= 3) {
                    const contourPoints = path.map(v => vertexCoords[v]);
                    const area = this.calculatePolygonArea(contourPoints);
                    if (Math.abs(area) > 0.001) {
                        const isClockwise = area < 0;
                        contours.push({
                            vertices: [...path],
                            points: contourPoints,
                            area: Math.abs(area),
                            isClockwise: isClockwise,
                            originalArea: area
                        });
                    }
                }
                return;
            }

            if (visitedVertices.has(currentVertex)) return;

            visitedVertices.add(currentVertex);

            const neighbors = graph.get(currentVertex) || [];
            for (const neighbor of neighbors) {
                const edgeKey = `${Math.min(currentVertex, neighbor.vertex)}-${Math.max(currentVertex, neighbor.vertex)}`;
                if (!visitedEdges.has(edgeKey)) {
                    visitedEdges.add(edgeKey);
                    path.push(neighbor.vertex);
                    findCycles(startVertex, neighbor.vertex, path, new Set([...visitedVertices]));
                    path.pop();
                    visitedEdges.delete(edgeKey);
                }
            }
        };

        for (let startVertex = 0; startVertex < vertexCoords.length; startVertex++) {
            findCycles(startVertex, startVertex, [startVertex], new Set());
        }

        const uniqueContours = [];
        const contourHashes = new Set();

        contours.forEach(contour => {
            const minIndex = Math.min(...contour.vertices);
            const startIdx = contour.vertices.indexOf(minIndex);
            const normalizedVertices = [
                ...contour.vertices.slice(startIdx),
                ...contour.vertices.slice(0, startIdx)
            ];

            const hash = normalizedVertices.join('-');
            if (!contourHashes.has(hash)) {
                contourHashes.add(hash);
                uniqueContours.push(contour);
            }
        });

        return uniqueContours;
    }

    getFigureById(id) {
        return this.allFigures.get(id);
    }

    getFiguresByElement(element) {
        const elementId = element.uuid;
        const result = [];

        console.log(`FigureManager: поиск фигур для элемента ${elementId}`);

        for (const figure of this.allFigures.values()) {
            if (figure.elementIds.has(elementId)) {
                console.log(`  Найдена фигура: ${figure.id} (isHole: ${figure.isHole}, площадь: ${figure.area})`);
                result.push(figure);
            }
        }

        // Сортируем по площади (от большей к меньшей)
        result.sort((a, b) => b.area - a.area);

        console.log(`FigureManager: всего найдено фигур: ${result.length}`);
        return result;
    }

    // Поиск фигуры по контуру отверстия
    findFigureByHoleContour(holeContour) {
        for (const figure of this.allFigures.values()) {
            if (figure.outer === holeContour) {
                return figure;
            }
        }
        return null;
    }

    isSketchElementClosed(element) {
        if (!element || !element.userData) return false;

        if (element.userData.isClosed !== undefined) {
            return element.userData.isClosed === true;
        }

        const type = element.userData.elementType;
        if (type === 'rectangle' || type === 'circle' ||
            type === 'polygon' || type === 'oval' ||
            type === 'stadium' || type === 'arc') {
            return true;
        }

        if (type === 'line') return false;

        if (type === 'polyline') {
            if (!element.geometry || !element.geometry.attributes.position) {
                return false;
            }

            const positions = element.geometry.attributes.position.array;
            if (positions.length < 6) return false;

            const count = positions.length / 3;
            if (count < 3) return false;

            const x1 = positions[0], y1 = positions[1];
            const lastIndex = positions.length - 3;
            const x2 = positions[lastIndex], y2 = positions[lastIndex + 1];

            const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            return distance < 0.5;
        }

        return false;
    }

    getElementPoints(element) {
        if (!element.userData) return [];

        if (element.userData.localPoints) {
            return element.userData.localPoints.map(p => new THREE.Vector2(p.x, p.y));
        }

        if (element.geometry && element.geometry.attributes.position) {
            const positions = element.geometry.attributes.position.array;
            const points = [];
            for (let i = 0; i < positions.length; i += 3) {
                points.push(new THREE.Vector2(positions[i], positions[i + 1]));
            }
            return points;
        }

        return [];
    }

    calculatePolygonArea(points) {
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return area / 2;
    }

    calculateContourCenter(points) {
        const center = new THREE.Vector2(0, 0);
        points.forEach(p => {
            center.x += p.x;
            center.y += p.y;
        });
        if (points.length > 0) {
            center.x /= points.length;
            center.y /= points.length;
        }
        return center;
    }

    calculateBoundingBox(points) {
        if (points.length === 0) {
            return { min: new THREE.Vector2(0, 0), max: new THREE.Vector2(0, 0) };
        }

        const min = new THREE.Vector2(Infinity, Infinity);
        const max = new THREE.Vector2(-Infinity, -Infinity);

        points.forEach(p => {
            min.x = Math.min(min.x, p.x);
            min.y = Math.min(min.y, p.y);
            max.x = Math.max(max.x, p.x);
            max.y = Math.max(max.y, p.y);
        });

        return { min, max };
    }
}

// Класс ExtrudeManager остается таким же, как в предыдущем ответе
// Не изменяем его, так как проблема в группировке дуг
class ExtrudeManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.figureManager = new FigureManager(cadEditor);

        this.extrudePreview = null;
        this.extrudePreviewGroup = null;
        this.dragging = false;
        this.startHeight = 0;
        this.startMouseY = 0;
        this.currentOperation = 'new';
        this.currentDirection = 'positive';

        this.previewMaterial = null;
        this.arrowHandle = null;
        this.lastIntersectPoint = null;

        this.basePlane = null;

        // Новая структура для хранения выделения
        this.selectedFigureIds = new Set(); // Set<figureId>
        this.excludedHoles = new Map(); // figureId -> Set<holeFigureId>

        // Для стрелки вытягивания
        this.extrudeArrow = null;
        this.isDraggingArrow = false;
        this.arrowStartPosition = null;
        this.arrowStartHeight = 0;

        // Для отслеживания подсветки при наведении
        this.hoveredFigure = null;

        // Флаг для предотвращения двойного клика
        this.isProcessingClick = false;

        console.log("ExtrudeManager: создан");
    }

    // === ОСНОВНЫЕ МЕТОДЫ ===

    initialize() {
        console.log("ExtrudeManager: инициализация");
        this.figureManager.collectAllFigures();
    }

    handleFigureClick(event) {
        console.log("=== НАЧАЛО handleFigureClick ===");

        if (this.isProcessingClick) {
            console.log("Предотвращаем двойной клик");
            return false;
        }

        this.isProcessingClick = true;

        try {
            this.editor.updateMousePosition(event);
            this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
            this.editor.raycaster.params.Line = { threshold: 5 };

            const allSketchElements = this.editor.objectsManager.getAllSketchElements();
            const intersects = this.editor.raycaster.intersectObjects(allSketchElements, false);

            if (intersects.length > 0) {
                const clickedElement = intersects[0].object;
                console.log("Кликнули элемент:", clickedElement.uuid, "тип:", clickedElement.userData.elementType);

                const figures = this.figureManager.getFiguresByElement(clickedElement);
                console.log("Найдено фигур, содержащих элемент:", figures.length);

                if (figures.length === 0) {
                    console.log("Фигуры не найдены");
                    return false;
                }

                let figureToSelect = figures[0];

                if (figures.length > 1) {
                    for (const figure of figures) {
                        if (figure.isHole) {
                            figureToSelect = figure;
                            console.log("Выбрана внутренняя фигура (отверстие):", figure.id);
                            break;
                        }
                    }
                }

                console.log("Выбрана фигура:", figureToSelect.id, "isHole:", figureToSelect.isHole, "площадь:", figureToSelect.area);

                this.toggleFigureSelection(figureToSelect);

                this.updateExtrudePreview();
                this.updateExtrudeUI();
                this.createExtrudeDirectionIndicator();

                return true;
            } else {
                console.log("Нет пересечений с элементами");
            }
        } finally {
            setTimeout(() => {
                this.isProcessingClick = false;
            }, 50);
        }

        console.log("=== КОНЕЦ handleFigureClick ===");
        return false;
    }

    toggleFigureSelection(figure) {
        console.log("=== toggleFigureSelection ===");
        console.log("Фигура:", figure.id, "isHole:", figure.isHole, "площадь:", figure.area);
        console.log("Текущее состояние выделения:", this.selectedFigureIds.has(figure.id) ? "выделена" : "не выделена");

        const figureId = figure.id;

        if (this.selectedFigureIds.has(figureId)) {
            console.log("Удаляем фигуру из выделения");
            this.removeFigureFromSelection(figure);
        } else {
            console.log("Добавляем фигуру в выделение");
            this.addFigureToSelection(figure);
        }
    }

    addFigureToSelection(figure) {
        console.log("=== addFigureToSelection ===");
        const figureId = figure.id;

        let isChildOfSelected = false;
        let parentFigureId = null;

        for (const selectedId of this.selectedFigureIds) {
            const selectedFigure = this.figureManager.getFigureById(selectedId);
            if (selectedFigure && selectedFigure.childrenIds.includes(figureId)) {
                isChildOfSelected = true;
                parentFigureId = selectedId;
                console.log("Найден родитель для отверстия:", parentFigureId);
                break;
            }
        }

        if (isChildOfSelected && parentFigureId) {
            console.log("Исключаем отверстие из родительской фигуры");
            this.toggleHoleExclusion(parentFigureId, figureId);
        } else {
            console.log("Добавляем фигуру в selectedFigureIds");
            this.selectedFigureIds.add(figureId);

            if (!this.basePlane) {
                this.basePlane = this.getFigurePlane(figure);
                console.log("Установлена базовая плоскость:", this.basePlane?.uuid);
            }

            console.log("Подсвечиваем фигуру");
            if (figure.isHole) {
                this.highlightFigure(figure, 0x4CAF50);
            } else {
                this.highlightFigure(figure, 0x0066FF);
            }
        }

        console.log("selectedFigureIds после добавления:", Array.from(this.selectedFigureIds));
    }

    removeFigureFromSelection(figure) {
        console.log("=== removeFigureFromSelection ===");
        const figureId = figure.id;

        console.log("Удаляем фигуру из selectedFigureIds");
        this.selectedFigureIds.delete(figureId);

        this.excludedHoles.delete(figureId);

        console.log("Восстанавливаем цвет фигуры");
        this.unhighlightFigure(figure);

        if (figure.childrenIds && figure.childrenIds.length > 0) {
            console.log("У фигуры есть отверстия, проверяем их");
            figure.childrenIds.forEach(childId => {
                const childFigure = this.figureManager.getFigureById(childId);
                if (childFigure && this.selectedFigureIds.has(childId)) {
                    console.log("Снимаем выделение с дочерней фигуры:", childId);
                    this.removeFigureFromSelection(childFigure);
                }
            });
        }

        if (this.selectedFigureIds.size === 0) {
            console.log("Нет выделенных фигур, сбрасываем базовую плоскость");
            this.basePlane = null;
        }

        console.log("selectedFigureIds после удаления:", Array.from(this.selectedFigureIds));
    }

    toggleHoleExclusion(parentFigureId, holeFigureId) {
        console.log("=== toggleHoleExclusion ===");
        console.log("Родитель:", parentFigureId, "Отверстие:", holeFigureId);

        if (!this.excludedHoles.has(parentFigureId)) {
            console.log("Создаем новый Set для исключенных отверстий");
            this.excludedHoles.set(parentFigureId, new Set());
        }

        const excludedSet = this.excludedHoles.get(parentFigureId);
        const holeFigure = this.figureManager.getFigureById(holeFigureId);

        if (!holeFigure) {
            console.log("Отверстие не найдено!");
            return;
        }

        if (excludedSet.has(holeFigureId)) {
            console.log("Включаем отверстие обратно");
            excludedSet.delete(holeFigureId);
            this.highlightHole(holeFigure, true);
        } else {
            console.log("Исключаем отверстие");
            excludedSet.add(holeFigureId);
            this.highlightHole(holeFigure, false);
        }

        console.log("Исключенные отверстия для родителя", parentFigureId, ":", Array.from(excludedSet));

        this.updateExtrudePreview();
    }

    getFiguresForExtrusion() {
        const result = [];

        console.log("=== getFiguresForExtrusion ===");
        console.log("Выделенные фигуры:", Array.from(this.selectedFigureIds));

        for (const figureId of this.selectedFigureIds) {
            const figure = this.figureManager.getFigureById(figureId);
            if (!figure) {
                console.log("Фигура не найдена:", figureId);
                continue;
            }

            if (figure.parentId && this.selectedFigureIds.has(figure.parentId)) {
                console.log("Пропускаем отверстие, так как родитель выделен:", figureId);
                continue;
            }

            const excludedHoles = this.excludedHoles.get(figureId) || new Set();
            console.log("Исключенные отверстия для фигуры", figureId, ":", Array.from(excludedHoles));

            const filteredHoles = figure.holes.filter(hole => {
                const holeFigure = this.figureManager.findFigureByHoleContour(hole);
                if (!holeFigure) {
                    console.warn("Не найдена фигура для отверстия");
                    return false;
                }

                const isExcluded = excludedHoles.has(holeFigure.id);
                console.log(`Отверстие: ${holeFigure.id}, исключено: ${isExcluded}`);
                return !isExcluded;
            });

            console.log("Фильтрованные отверстия:", filteredHoles.length);

            result.push({
                ...figure,
                holes: filteredHoles,
                id: figureId
            });
        }

        console.log("Итого фигур для вытягивания:", result.length);
        return result;
    }

    highlightFigure(figure, color) {
        console.log(`highlightFigure: фигура ${figure.id}, цвет ${color.toString(16)}`);

        if (figure.outer.element) {
            console.log(`  Подсвечиваем элемент ${figure.outer.element.uuid}`);
            this.editor.objectsManager.safeSetElementColor(figure.outer.element, color);
        } else if (figure.outer.elements) {
            figure.outer.elements.forEach(element => {
                console.log(`  Подсвечиваем элемент ${element.uuid} (из группы)`);
                this.editor.objectsManager.safeSetElementColor(element, color);
            });
        }

        if (figure.holes && figure.holes.length > 0) {
            console.log(`  Подсвечиваем ${figure.holes.length} отверстий`);
            figure.holes.forEach((hole, index) => {
                const holeFigure = this.figureManager.findFigureByHoleContour(hole);
                if (!holeFigure) {
                    console.warn(`  Не найдена фигура для отверстия ${index}`);
                    return;
                }

                const excludedSet = this.excludedHoles.get(figure.id) || new Set();
                const isExcluded = excludedSet.has(holeFigure.id);
                const holeColor = isExcluded ? 0x888888 : 0xFF9800;

                console.log(`  Отверстие ${index}: holeId=${holeFigure.id}, исключено=${isExcluded}, цвет=${holeColor.toString(16)}`);

                if (hole.element) {
                    this.editor.objectsManager.safeSetElementColor(hole.element, holeColor);
                } else if (hole.elements) {
                    hole.elements.forEach(element => {
                        this.editor.objectsManager.safeSetElementColor(element, holeColor);
                    });
                }
            });
        }
    }

    highlightHole(holeFigure, isIncluded) {
        const color = isIncluded ? 0xFF9800 : 0x888888;
        console.log(`highlightHole: отверстие ${holeFigure.id}, включено=${isIncluded}, цвет=${color.toString(16)}`);

        if (holeFigure.outer.element) {
            this.editor.objectsManager.safeSetElementColor(holeFigure.outer.element, color);
        } else if (holeFigure.outer.elements) {
            holeFigure.outer.elements.forEach(element => {
                this.editor.objectsManager.safeSetElementColor(element, color);
            });
        }
    }

    unhighlightFigure(figure) {
        console.log(`unhighlightFigure: фигура ${figure.id}`);

        if (figure.outer.element) {
            this.editor.objectsManager.safeRestoreElementColor(figure.outer.element);
        } else if (figure.outer.elements) {
            figure.outer.elements.forEach(element => {
                this.editor.objectsManager.safeRestoreElementColor(element);
            });
        }

        if (figure.holes && figure.holes.length > 0) {
            figure.holes.forEach(hole => {
                if (hole.element) {
                    this.editor.objectsManager.safeRestoreElementColor(hole.element);
                } else if (hole.elements) {
                    hole.elements.forEach(element => {
                        this.editor.objectsManager.safeRestoreElementColor(element);
                    });
                }
            });
        }
    }

    clearSelection() {
        console.log("=== clearSelection ===");

        for (const figureId of this.selectedFigureIds) {
            const figure = this.figureManager.getFigureById(figureId);
            if (figure) {
                this.unhighlightFigure(figure);
            }
        }

        this.selectedFigureIds.clear();
        this.excludedHoles.clear();
        this.basePlane = null;
        this.hoveredFigure = null;
    }

    getFigurePlane(figure) {
        let element = null;

        if (figure.outer.element) {
            element = figure.outer.element;
        } else if (figure.outer.elements && figure.outer.elements.length > 0) {
            element = figure.outer.elements[0];
        } else if (figure.element) {
            element = figure.element;
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

    highlightFiguresOnHover(event) {
        if (this.dragging || this.isDraggingArrow) return;

        this.editor.updateMousePosition(event);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const allSketchElements = this.editor.objectsManager.getAllSketchElements();
        const selectableElements = allSketchElements.filter(element =>
            this.figureManager.isSketchElementClosed(element) ||
            element.userData.elementType === 'line' ||
            element.userData.elementType === 'polyline'
        );

        if (this.hoveredFigure) {
            if (!this.selectedFigureIds.has(this.hoveredFigure.id)) {
                this.unhighlightFigure(this.hoveredFigure);
            }
            this.hoveredFigure = null;
        }

        const intersects = this.editor.raycaster.intersectObjects(selectableElements, false);

        if (intersects.length > 0) {
            const element = intersects[0].object;
            const figures = this.figureManager.getFiguresByElement(element);

            if (figures.length > 0) {
                const figure = figures[0];

                if (!this.selectedFigureIds.has(figure.id)) {
                    this.hoveredFigure = figure;
                    this.highlightFigure(figure, 0xFFFF00);
                    document.body.style.cursor = 'pointer';
                } else {
                    document.body.style.cursor = 'default';
                }
            } else {
                document.body.style.cursor = 'default';
            }
        } else {
            document.body.style.cursor = 'default';
        }
    }

    // Исправление ориентации контуров
    fixContourOrientation(points, shouldBeClockwise) {
        if (points.length < 3) return points;

        // Рассчитываем площадь со знаком
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        area /= 2;

        // Определяем текущее направление обхода
        const isCurrentlyClockwise = area < 0;

        // Если направление не совпадает с требуемым, разворачиваем массив
        if (isCurrentlyClockwise !== shouldBeClockwise) {
            console.log(`Исправляем направление обхода: было ${isCurrentlyClockwise ? 'по часовой' : 'против часовой'}, нужно ${shouldBeClockwise ? 'по часовой' : 'против часовой'}`);
            return [...points].reverse();
        }

        return points;
    }

    createExtrusionGeometryFromFigures(figures, height, direction) {
        if (figures.length === 0 || !this.basePlane) return null;

        const shapes = [];

        figures.forEach(figure => {
            console.log(`Создание фигуры для вытягивания: ${figure.id}, isHole: ${figure.isHole}, площадь: ${figure.area}`);

            // Получаем точки внешнего контура с учетом базовой плоскости
            const outerPoints = this.getFigurePointsForBasePlane(figure);
            if (outerPoints.length < 3) {
                console.log(`  Недостаточно точек для фигуры ${figure.id}: ${outerPoints.length}`);
                return;
            }

            // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Правильно определяем ориентацию
            // 1. Внешние фигуры (isHole: false) должны быть против часовой стрелки
            // 2. Отверстия (isHole: true), которые вытягиваются отдельно, должны быть инвертированы
            let shouldOuterBeClockwise = false; // По умолчанию внешние контуры против часовой стрелки

            if (figure.isHole) {
                // Внутренняя фигура (отверстие) при отдельном вытягивании должна быть инвертирована
                console.log(`  Внутренняя фигура ${figure.id} (отверстие) будет инвертирована для правильного вытягивания`);
                shouldOuterBeClockwise = false; // Инвертируем ориентацию
            }

            const correctedOuterPoints = this.fixContourOrientation(outerPoints, shouldOuterBeClockwise);

            // Проверяем ориентацию после исправления
            let area = 0;
            const n = correctedOuterPoints.length;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                area += correctedOuterPoints[i].x * correctedOuterPoints[j].y;
                area -= correctedOuterPoints[j].x * correctedOuterPoints[i].y;
            }
            area /= 2;
            console.log(`  Ориентация контура после исправления: площадь=${area}, ${area < 0 ? 'по часовой' : 'против часовой'}`);

            const shapePoints = correctedOuterPoints.map(p => new THREE.Vector2(p.x, p.y));
            const shape = new THREE.Shape(shapePoints);

            // Обрабатываем отверстия (только для внешних фигур, у которых isHole = false)
            if (!figure.isHole && figure.holes && figure.holes.length > 0) {
                console.log(`  Добавляем ${figure.holes.length} отверстий в фигуру ${figure.id}`);
                figure.holes.forEach((hole, index) => {
                    const holePoints = this.getContourPointsForBasePlane(hole);
                    if (holePoints.length >= 3) {
                        // Отверстия всегда должны быть по часовой стрелке
                        const correctedHolePoints = this.fixContourOrientation(holePoints, true);
                        const holePath = new THREE.Path(correctedHolePoints.map(p => new THREE.Vector2(p.x, p.y)));
                        shape.holes.push(holePath);
                        console.log(`    Добавлено отверстие ${index} с ${holePoints.length} точками`);
                    } else {
                        console.log(`    Отверстие ${index} имеет недостаточно точек: ${holePoints.length}`);
                    }
                });
            } else if (figure.isHole && figure.holes && figure.holes.length > 0) {
                console.log(`  Внутренняя фигура ${figure.id} (отверстие) имеет свои отверстия, что невозможно`);
            }

            shapes.push(shape);
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

            console.log("Геометрия успешно создана");
            return geometry;
        } catch (error) {
            console.error('Ошибка создания геометрии выдавливания:', error);
            return null;
        }
    }

    getFigurePointsForBasePlane(figure) {
        const figurePlane = this.getFigurePlane(figure);
        if (!figurePlane) return figure.outer.points || [];

        if (this.arePlanesCompatible(figurePlane, this.basePlane)) {
            return figure.outer.points || [];
        }

        return (figure.outer.points || []).map(point => {
            const localPoint3D = new THREE.Vector3(point.x, point.y, 0);
            const worldPoint = figurePlane.localToWorld(localPoint3D.clone());
            const baseLocalPoint = this.basePlane.worldToLocal(worldPoint.clone());
            return new THREE.Vector2(baseLocalPoint.x, baseLocalPoint.y);
        });
    }

    getContourPointsForBasePlane(contour) {
        const holeFigure = this.figureManager.findFigureByHoleContour(contour);
        const figurePlane = holeFigure ? this.getFigurePlane(holeFigure) : null;

        if (!figurePlane) return contour.points || [];

        if (this.arePlanesCompatible(figurePlane, this.basePlane)) {
            return contour.points || [];
        }

        return (contour.points || []).map(point => {
            const localPoint3D = new THREE.Vector3(point.x, point.y, 0);
            const worldPoint = figurePlane.localToWorld(localPoint3D.clone());
            const baseLocalPoint = this.basePlane.worldToLocal(worldPoint.clone());
            return new THREE.Vector2(baseLocalPoint.x, baseLocalPoint.y);
        });
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

    createExtrudeDirectionIndicator() {
        if (this.extrudeArrow) {
            if (this.extrudeArrow.parent) {
                this.extrudeArrow.parent.remove(this.extrudeArrow);
            }
            this.extrudeArrow = null;
        }

        const figures = this.getFiguresForExtrusion();
        if (!figures || figures.length === 0 || !this.basePlane) return;

        const figure = figures[0];
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        this.extrudeArrow = new THREE.Group();
        this.extrudeArrow.userData.isExtrudeArrow = true;
        this.extrudeArrow.userData.isDraggable = true;
        this.extrudeArrow.raycast = () => {};

        const arrowLength = 25;
        const arrowHeadLength = 8;
        const arrowHeadWidth = 4;

        const lineGeometry = new THREE.CylinderGeometry(0.8, 0.8, arrowLength, 8);
        const lineMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.9
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.position.y = arrowLength / 2;
        line.userData.isArrowPart = true;
        line.userData.isDraggable = false;
        line.raycast = () => {};
        this.extrudeArrow.add(line);

        const coneGeometry = new THREE.ConeGeometry(arrowHeadWidth, arrowHeadLength, 8);
        const coneMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.9
        });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.y = arrowLength + arrowHeadLength / 2;
        cone.userData.isArrowPart = true;
        cone.userData.isArrowHandle = true;
        cone.userData.isDraggable = true;
        this.extrudeArrow.add(cone);

        const handleGeometry = new THREE.SphereGeometry(arrowHeadWidth * 1.5, 8, 8);
        const handleMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF0000,
            transparent: true,
            opacity: 0.2,
            visible: true,
            depthTest: true,
            depthWrite: false
        });

        this.arrowHandle = new THREE.Mesh(handleGeometry, handleMaterial);
        this.arrowHandle.position.y = arrowLength + arrowHeadLength;
        this.arrowHandle.userData.isArrowHandle = true;
        this.arrowHandle.userData.isDraggable = true;
        this.extrudeArrow.add(this.arrowHandle);

        const up = new THREE.Vector3(0, 1, 0);
        const rotationQuaternion = new THREE.Quaternion().setFromUnitVectors(
            up,
            planeNormal.clone().normalize()
        );
        this.extrudeArrow.quaternion.copy(rotationQuaternion);

        this.updateArrowPosition();

        this.editor.scene.add(this.extrudeArrow);
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

        const figuresCenter = this.getFiguresCenter(figures);
        const worldCenter = this.basePlane.localToWorld(figuresCenter.clone());

        const planePos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planePos);
        const offsetVector = new THREE.Vector3().subVectors(worldCenter, planePos);

        const basePos = planePos.clone().add(offsetVector);
        let previewCenterOffset = 0;

        if (direction === 'positive') {
            previewCenterOffset = height / 2;
        } else if (direction === 'negative') {
            previewCenterOffset = -height / 2;
        } else if (direction === 'both') {
            previewCenterOffset = 0;
        }

        const arrowPos = basePos.clone().add(
            planeNormal.clone().multiplyScalar(previewCenterOffset + 2)
        );

        this.extrudeArrow.position.copy(arrowPos);
        this.extrudeArrow.updateMatrixWorld(true);
    }

    getFiguresCenter(figures) {
        const center = new THREE.Vector3(0, 0, 0);
        let totalWeight = 0;

        figures.forEach(figure => {
            const figCenter = figure.outer.center;
            const weight = figure.outer.area || 1;
            center.x += figCenter.x * weight;
            center.y += figCenter.y * weight;
            totalWeight += weight;
        });

        if (totalWeight > 0) {
            center.x /= totalWeight;
            center.y /= totalWeight;
        }

        return center;
    }

    handleArrowDragStart(event) {
        if (!this.extrudeArrow) return false;

        this.editor.updateMousePosition(event);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const draggableParts = [];
        if (this.extrudeArrow) {
            this.extrudeArrow.traverse((child) => {
                if (child.userData && child.userData.isDraggable) {
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

            this.bindGlobalDragHandlers();

            event.stopPropagation();
            event.preventDefault();
            return true;
        }

        return false;
    }

    handleArrowDrag(event) {
        if (!this.isDraggingArrow || !this.extrudeArrow || !this.basePlane) return;

        const figures = this.getFiguresForExtrusion();
        if (figures.length === 0) return;

        const deltaY = event.clientY - this.startMouseY;
        const sensitivity = 0.1;
        let heightChange = deltaY * sensitivity;

        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.basePlane.quaternion);
        planeNormal.normalize();

        const cameraPosition = this.editor.camera.position;
        const planeWorldPos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planeWorldPos);
        const cameraToPlane = new THREE.Vector3().subVectors(cameraPosition, planeWorldPos).normalize();
        const dot = cameraToPlane.dot(planeNormal);

        if (dot < 0) {
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
        document.body.style.cursor = 'default';

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
        if (direction === 'negative') {
            offset = -height + 0.1;
        } else if (direction === 'both') {
            offset = -height / 2 + 0.1;
        }

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

    showExtrudeUI() {
        const oldUI = document.getElementById('extrudeUI');
        if (oldUI) oldUI.remove();

        const figures = this.getFiguresForExtrusion();
        const selectedCount = this.selectedFigureIds.size;

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
                        <option value="positive">Наружу (по нормали)</option>
                        <option value="negative">Внутрь (против нормали)</option>
                        <option value="both">В обе стороны</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>Операция:</label>
                    <select id="extrudeOperation">
                        <option value="new">Новый объект</option>
                        <option value="cut">Вырезать из существующих</option>
                        <option value="join">Объединить с существующими</option>
                    </select>
                </div>
                <div class="extrude-info">
                    <div id="selectedContourInfo" style="font-size: 12px; margin: 10px 0;">
                        ${selectedCount > 0 ? this.getFigureInfoText() : 'Выберите фигуру(ы) для вытягивания'}
                    </div>
                    <div id="operationHint" style="font-size: 11px; color: #888; margin: 5px 0;">
                        ${selectedCount > 0 ? this.getOperationHint() : ''}
                    </div>
                </div>
                <button id="performExtrude" class="btn-primary" ${selectedCount > 0 ? '' : 'disabled'}>
                    <i class="fas fa-check"></i> ${this.getOperationButtonText()}
                </button>
            </div>
            <div class="extrude-hint">
                <i class="fas fa-info-circle"></i>
                <div>• Клик по фигуре: добавляет/удаляет фигуру из выбранных</div>
                <div>• Клик по отверстию выделенной фигуры: исключает/возвращает отверстие</div>
                <div>• Перетаскивайте стрелку для изменения высоты</div>
                <div>• Escape для отмены, Enter для подтверждения</div>
            </div>
        `;

        document.querySelector('.viewport-container').appendChild(container);

        container.querySelector('#cancelExtrude').addEventListener('click', () => {
            this.cancelExtrudeMode();
        });

        container.querySelector('#performExtrude').addEventListener('click', () => {
            this.performExtrude();
        });

        const heightInput = container.querySelector('#extrudeHeight');
        heightInput.addEventListener('input', (e) => {
            this.updateExtrudePreview();
            this.updateArrowPosition();

            const btn = document.querySelector('#performExtrude');
            if (btn && !btn.disabled) {
                const height = parseFloat(e.target.value) || 10;
                btn.innerHTML = `<i class="fas fa-check"></i> ${this.getOperationButtonText(height)}`;
            }
        });

        const directionSelect = container.querySelector('#extrudeDirection');
        directionSelect.addEventListener('change', () => {
            this.updateExtrudePreview();
            this.updateArrowPosition();
        });

        const operationSelect = container.querySelector('#extrudeOperation');
        operationSelect.addEventListener('change', () => {
            this.currentOperation = operationSelect.value;
            this.updateOperationHint();
            this.updateExtrudeUI();
        });
    }

    getFigureInfoText() {
        let text = `✓ Выбрано фигур: ${this.selectedFigureIds.size}`;

        let excludedHoleCount = 0;
        for (const [figureId, excludedSet] of this.excludedHoles) {
            excludedHoleCount += excludedSet.size;
        }

        if (excludedHoleCount > 0) {
            text += ` (исключено отверстий: ${excludedHoleCount})`;
        }

        if (this.basePlane) {
            const planeName = this.basePlane.userData?.name || 'основной плоскости';
            text += ` на ${planeName}`;
        }

        return text;
    }

    getOperationHint() {
        const operation = document.getElementById('extrudeOperation')?.value || 'new';
        const hints = {
            'new': 'Создаст новый объект на базовой плоскости',
            'cut': 'Вырежет из пересекающихся объектов на базовой плоскости',
            'join': 'Объединит с пересекающихся объектов на базовой плоскости'
        };
        return hints[operation] || '';
    }

    getOperationButtonText(height = null) {
        const operation = document.getElementById('extrudeOperation')?.value || 'new';
        const figureCount = this.selectedFigureIds.size;
        const heightStr = height ? `${height.toFixed(1)} мм` : '';

        const texts = {
            'new': `Создать ${figureCount > 1 ? `(${figureCount} фигур)` : ''} ${heightStr}`,
            'cut': `Вырезать ${figureCount > 1 ? `(${figureCount} фигур)` : ''} ${heightStr}`,
            'join': `Объединить ${figureCount > 1 ? `(${figureCount} фигур)` : ''} ${heightStr}`
        };

        return texts[operation] || 'Выполнить';
    }

    updateOperationHint() {
        const hintElement = document.getElementById('operationHint');
        if (hintElement) {
            hintElement.textContent = this.getOperationHint();
        }
    }

    updateExtrudeUI() {
        const selectedContourInfo = document.getElementById('selectedContourInfo');
        const performExtrudeBtn = document.getElementById('performExtrude');
        const operationHint = document.getElementById('operationHint');

        if (selectedContourInfo) {
            const figureCount = this.selectedFigureIds.size;
            if (figureCount > 0) {
                selectedContourInfo.textContent = this.getFigureInfoText();
                selectedContourInfo.style.color = '#4CAF50';
            } else {
                selectedContourInfo.textContent = 'Выберите фигуру(ы) для вытягивания';
                selectedContourInfo.style.color = '#888';
            }
        }

        if (operationHint) {
            operationHint.textContent = this.getOperationHint();
        }

        if (performExtrudeBtn) {
            const figureCount = this.selectedFigureIds.size;
            performExtrudeBtn.disabled = figureCount === 0;

            if (figureCount > 0) {
                const height = document.getElementById('extrudeHeight')?.value || 10;
                performExtrudeBtn.innerHTML = `<i class="fas fa-check"></i> ${this.getOperationButtonText(parseFloat(height))}`;
            }
        }
    }

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
            elements: figure.outer.element ? [figure.outer.element] : figure.outer.elements
        }));

        const historyData = {
            sourceFigures: sourceFigureData,
            sketchPlane: this.editor.projectManager.serializeObject(this.basePlane),
            height: height,
            direction: direction,
            operation: operation
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

        this.cancelExtrudeMode();
        this.editor.showStatus(`Выполнено выдавливание (${height} мм)`, 'success');
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

        mesh.userData = {
            type: 'extrusion',
            sourceFigureIds: sourceFigures.map(f => f.id),
            height: height,
            direction: direction,
            operation: this.currentOperation,
            name: `Вытягивание (${height} мм)`,
            figureCount: sourceFigures.length,
            holeCount: sourceFigures.reduce((sum, fig) => sum + (fig.holes ? fig.holes.length : 0), 0),
            basePlaneId: this.basePlane?.uuid,
            createdAt: new Date().toISOString()
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
                obj.userData.type === 'sketch_element' ||
                obj.userData.type === 'extrusion') {
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

    cancelExtrudeMode() {
        this.clearSelection();
        this.excludedHoles.clear();
        this.hoveredFigure = null;

        if (this.extrudeArrow) {
            if (this.extrudeArrow.parent) {
                this.extrudeArrow.parent.remove(this.extrudeArrow);
            }
            this.extrudeArrow = null;
            this.arrowHandle = null;
        }

        this.removeExtrudePreview();

        const ui = document.getElementById('extrudeUI');
        if (ui) ui.remove();

        const allSketchElements = this.editor.objectsManager.getAllSketchElements();
        allSketchElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });

        this.dragging = false;
        this.isDraggingArrow = false;
        this.basePlane = null;

        this.editor.showStatus('Режим выдавливания завершен', 'info');
    }

    highlightExtrudableFigures() {
        const allElements = this.editor.objectsManager.getAllSketchElements();
        allElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });

        const figures = this.figureManager.collectAllFigures();
        figures.forEach(figure => {
            if (figure.outer.element) {
                this.editor.objectsManager.safeSetElementColor(figure.outer.element, 0x2196F3);
            } else if (figure.outer.elements) {
                figure.outer.elements.forEach(element => {
                    this.editor.objectsManager.safeSetElementColor(element, 0x2196F3);
                });
            }

            figure.holes.forEach(hole => {
                if (hole.element) {
                    this.editor.objectsManager.safeSetElementColor(hole.element, 0xFF9800);
                } else if (hole.elements) {
                    hole.elements.forEach(element => {
                        this.editor.objectsManager.safeSetElementColor(element, 0xFF9800);
                    });
                }
            });
        });

        if (figures.length === 0) {
            this.editor.showStatus('Нет замкнутых фигур для вытягивания', 'warning');
        }
    }
}