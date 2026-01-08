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
