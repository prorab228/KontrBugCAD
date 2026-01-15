/**
 * Рабочий детектор замкнутых контуров
 */
class OptimizedContourDetector {
    constructor() {
        this.segments = [];
        this.points = [];
        this.edges = [];
        this.contours = [];

        this.cacheValid = false;
        this.cachedContours = null;
        this.elementHash = "";

        // Настройки
        this.minContourArea = 0.1;
        this.intersectionEpsilon = 0.001;
        this.snapPrecision = 4;
    }

    // === ОСНОВНЫЕ МЕТОДЫ ===

    updateElements(elements) {
        const newHash = this.calculateElementsHash(elements);

        if (newHash === this.elementHash && this.cacheValid) {
            console.log("ContourDetector: используем кэш элементов");
            return;
        }

        this.elementHash = newHash;
        this.cacheValid = false;
        this.cachedContours = null;

        // Сброс данных
        this.segments = [];
        this.points = [];
        this.edges = [];
        this.contours = [];

        if (!elements || elements.length === 0) {
            console.log("ContourDetector: нет элементов для анализа");
            return;
        }

        // Создаем сегменты из всех элементов
        for (const element of elements) {
            if (!element || !element.userData) continue;

            const elementPoints = this.getElementPoints(element);
            if (elementPoints.length < 2) continue;

            // Для ВСЕХ элементов - разбиваем на сегменты
            const elementSegments = [];

            // Основные сегменты
            for (let i = 0; i < elementPoints.length - 1; i++) {
                const start = elementPoints[i];
                const end = elementPoints[i + 1];

                if (start.distanceTo(end) < this.intersectionEpsilon) continue;

                elementSegments.push({
                    element: element,
                    start: start.clone(),
                    end: end.clone(),
                    index: -1,
                    isClosed: (i === elementPoints.length - 2) && element.userData.isClosed,
                    elementType: element.userData.elementType
                });
            }

            // Для замкнутых контуров добавляем сегмент от последней к первой точке
            if (element.userData.isClosed && elementPoints.length > 2) {
                const start = elementPoints[elementPoints.length - 1];
                const end = elementPoints[0];

                if (start.distanceTo(end) > this.intersectionEpsilon) {
                    elementSegments.push({
                        element: element,
                        start: start.clone(),
                        end: end.clone(),
                        index: -1,
                        isClosed: true,
                        elementType: element.userData.elementType
                    });
                }
            }

            // Добавляем сегменты в общий массив
            elementSegments.forEach(seg => {
                seg.index = this.segments.length;
                this.segments.push(seg);
            });
        }

        console.log(`ContourDetector: создано ${this.segments.length} сегментов`);
    }

    findClosedContours() {
        console.log("ContourDetector: поиск замкнутых контуров...");

        // Проверяем кэш
        if (this.cacheValid && this.cachedContours) {
            console.log("ContourDetector: возвращаем кэшированные контуры");
            return this.cachedContours;
        }

        if (this.segments.length < 3) {
            console.log("Недостаточно сегментов для поиска контуров");
            return [];
        }

        // 1. Находим все точки пересечения
        this.findIntersections();

        // 2. Строим граф
        this.buildGraph();

        // 3. Ищем все возможные циклы
        this.findAllContours();

        // 4. Обрабатываем найденные контуры
        this.processFoundContours();

        // Кэшируем результаты
        this.cachedContours = this.contours;
        this.cacheValid = true;

        console.log(`ContourDetector: найдено ${this.contours.length} контуров`);

        return this.contours;
    }

    // === ПОИСК ПЕРЕСЕЧЕНИЙ ===

    findIntersections() {
        console.log("Поиск пересечений...");
        const intersectionPoints = new Map();

        // Для каждого сегмента собираем все точки пересечения
        for (let i = 0; i < this.segments.length; i++) {
            intersectionPoints.set(i, []);
        }

        // Проверяем все пары сегментов на пересечение
        for (let i = 0; i < this.segments.length; i++) {
            for (let j = i + 1; j < this.segments.length; j++) {
                const intersection = this.getLineIntersection(
                    this.segments[i].start, this.segments[i].end,
                    this.segments[j].start, this.segments[j].end
                );

                if (intersection) {
                    intersectionPoints.get(i).push({
                        point: intersection,
                        distance: this.getDistanceAlongSegment(intersection, this.segments[i])
                    });

                    intersectionPoints.get(j).push({
                        point: intersection,
                        distance: this.getDistanceAlongSegment(intersection, this.segments[j])
                    });
                }
            }
        }

        // Разбиваем сегменты в точках пересечения
        this.splitSegmentsAtIntersections(intersectionPoints);
    }

    getLineIntersection(p1, p2, p3, p4) {
        // Проверяем, не совпадают ли конечные точки
        if (p1.equals(p3) || p1.equals(p4) || p2.equals(p3) || p2.equals(p4)) {
            return null;
        }

        const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);

        if (Math.abs(denominator) < 0.0001) {
            return null; // Параллельны
        }

        const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denominator;
        const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denominator;

        if (ua >= -0.0001 && ua <= 1.0001 && ub >= -0.0001 && ub <= 1.0001) {
            const uaClamped = Math.max(0, Math.min(1, ua));
            return new THREE.Vector2(
                p1.x + uaClamped * (p2.x - p1.x),
                p1.y + uaClamped * (p2.y - p1.y)
            );
        }

        return null;
    }

    getDistanceAlongSegment(point, segment) {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            return (point.x - segment.start.x) / dx;
        } else {
            return (point.y - segment.start.y) / dy;
        }
    }

    splitSegmentsAtIntersections(intersectionPoints) {
        const newSegments = [];

        this.segments.forEach((segment, index) => {
            const intersections = intersectionPoints.get(index);

            if (!intersections || intersections.length === 0) {
                newSegments.push(segment);
                return;
            }

            // Сортируем точки пересечения по расстоянию от начала
            intersections.sort((a, b) => a.distance - b.distance);

            let currentPoint = segment.start.clone();
            const allPoints = [currentPoint.clone()];

            // Добавляем точки пересечения
            intersections.forEach(intersection => {
                if (currentPoint.distanceTo(intersection.point) > 0.001) {
                    allPoints.push(intersection.point.clone());
                    currentPoint = intersection.point.clone();
                }
            });

            // Добавляем конечную точку
            if (currentPoint.distanceTo(segment.end) > 0.001) {
                allPoints.push(segment.end.clone());
            }

            // Создаем новые сегменты
            for (let i = 0; i < allPoints.length - 1; i++) {
                newSegments.push({
                    element: segment.element,
                    start: allPoints[i],
                    end: allPoints[i + 1],
                    index: newSegments.length,
                    originalIndex: index,
                    elementType: segment.elementType,
                    isClosed: segment.isClosed
                });
            }
        });

        this.segments = newSegments;
        console.log(`После разбиения: ${this.segments.length} сегментов`);
    }

    // === ПОСТРОЕНИЕ ГРАФА ===

    buildGraph() {
        console.log("Построение графа...");

        const vertexMap = new Map();

        // Функция для получения ключа вершины
        const getVertexKey = (point) => {
            return `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
        };

        // Собираем все уникальные точки
        this.segments.forEach(segment => {
            const startKey = getVertexKey(segment.start);
            const endKey = getVertexKey(segment.end);

            if (!vertexMap.has(startKey)) {
                vertexMap.set(startKey, {
                    point: segment.start.clone(),
                    edges: []
                });
            }

            if (!vertexMap.has(endKey)) {
                vertexMap.set(endKey, {
                    point: segment.end.clone(),
                    edges: []
                });
            }

            const startVertex = vertexMap.get(startKey);
            const endVertex = vertexMap.get(endKey);

            // Добавляем ребра в обе стороны (неориентированный граф)
            startVertex.edges.push({
                to: endKey,
                segmentIndex: segment.index,
                segment: segment
            });

            endVertex.edges.push({
                to: startKey,
                segmentIndex: segment.index,
                segment: segment
            });
        });

        this.points = Array.from(vertexMap.values());
        console.log(`Граф построен: ${this.points.length} вершин`);
    }

    // === ПОИСК КОНТУРОВ ===

    /** Найти все контуры */
    findAllContours() {
        console.log("Поиск всех контуров...");

        if (!this.points || this.points.length === 0) {
            console.log("Нет вершин для поиска контуров");
            return;
        }

        // Создаем Map для быстрого поиска вершин по ключу
        const vertexMap = new Map();
        for (const vertex of this.points) {
            const key = this.getVertexKey(vertex.point);
            vertexMap.set(key, vertex);
        }

        const allCycles = [];
        const visitedEdges = new Set();

        // Для каждой вершины пытаемся найти циклы
        for (const startVertex of this.points) {
            const startKey = this.getVertexKey(startVertex.point);

            // Используем DFS для поиска циклов
            const cycles = this.findContoursDFS(startVertex, vertexMap, visitedEdges);

            // Добавляем найденные циклы
            cycles.forEach(cycle => {
                if (cycle.points && cycle.points.length > 0) {
                    allCycles.push(cycle);
                }
            });
        }

        console.log(`Найдено циклов: ${allCycles.length}`);
        this.contours = allCycles;
    }

    /** Поиск контуров с использованием DFS */
    findContoursDFS(startVertex, vertexMap, visitedEdges) {
        const cycles = [];

        if (startVertex.edges.length < 2) return cycles;

        const startKey = this.getVertexKey(startVertex.point);

        // Используем стек для DFS
        const stack = [];

        // Инициализируем DFS для каждого ребра из стартовой вершины
        for (const firstEdge of startVertex.edges) {
            const edgeKey = this.getEdgeKey(startVertex.point, firstEdge.to);

            // Пропускаем уже посещенные ребра
            if (visitedEdges.has(edgeKey)) continue;

            const nextVertex = vertexMap.get(firstEdge.to);
            if (!nextVertex) continue;

            stack.push({
                vertex: nextVertex,
                path: [startVertex, nextVertex],
                edgePath: [firstEdge.segmentIndex],
                visitedEdges: new Set([edgeKey]),
                startKey: startKey
            });
        }

        // Поиск в глубину
        while (stack.length > 0) {
            const current = stack.pop();
            const currentVertex = current.vertex;
            const currentPath = current.path;
            const currentEdgePath = current.edgePath;
            const currentVisitedEdges = current.visitedEdges;
            const currentKey = this.getVertexKey(currentVertex.point);

            // Если вернулись в начальную вершину
            if (currentKey === current.startKey && currentPath.length >= 3) {
                const contour = this.createContourFromPath(currentPath, currentEdgePath);
                if (contour && contour.area > this.minContourArea) {
                    cycles.push(contour);

                    // Добавляем все ребра цикла в visitedEdges
                    for (const edge of currentVisitedEdges) {
                        visitedEdges.add(edge);
                    }
                }
                continue;
            }

            // Перебираем все ребра из текущей вершины
            for (const edge of currentVertex.edges) {
                const edgeKey = this.getEdgeKey(currentVertex.point, edge.to);

                // Пропускаем уже посещенные ребра в этом пути
                if (currentVisitedEdges.has(edgeKey)) continue;

                // Пропускаем ребра, которые уже вошли в какие-то циклы
                if (visitedEdges.has(edgeKey)) continue;

                const nextVertex = vertexMap.get(edge.to);
                if (!nextVertex) continue;

                const nextKey = this.getVertexKey(nextVertex.point);

                // Если уже были в этой вершине (но это не начальная), пропускаем
                if (nextKey !== current.startKey) {
                    const alreadyInPath = currentPath.some(v =>
                        this.getVertexKey(v.point) === nextKey
                    );

                    if (alreadyInPath) continue;
                }

                // Продолжаем поиск
                const newVisitedEdges = new Set(currentVisitedEdges);
                newVisitedEdges.add(edgeKey);

                stack.push({
                    vertex: nextVertex,
                    path: [...currentPath, nextVertex],
                    edgePath: [...currentEdgePath, edge.segmentIndex],
                    visitedEdges: newVisitedEdges,
                    startKey: current.startKey
                });
            }
        }

        return cycles;
    }

    // === ОБРАБОТКА КОНТУРОВ ===

    processFoundContours() {
        const allCycles = this.contours;

        if (!allCycles || allCycles.length === 0) {
            this.contours = [];
            return;
        }

        // Фильтруем валидные контуры
        const validContours = allCycles.filter(contour =>
            contour.isValid &&
            contour.points &&
            contour.points.length >= 3 &&
            contour.area > this.minContourArea
        );

        if (validContours.length === 0) {
            this.contours = [];
            return;
        }

        // Удаление дубликатов
        const uniqueContours = new Map();
        for (const contour of validContours) {
            const hash = this.getContourHash(contour);
            if (!uniqueContours.has(hash)) {
                uniqueContours.set(hash, contour);
            }
        }

        const uniqueContoursArray = Array.from(uniqueContours.values());

        // Находим контуры, которые состоят только из круга (без линии)
        const circleOnlyContours = uniqueContoursArray.filter(contour => {
            const elementTypes = new Set(contour.elements.map(el => el.userData.elementType));
            return elementTypes.size === 1 && elementTypes.has('circle');
        });

        // Находим контуры, которые содержат и круг, и линию
        const mixedContours = uniqueContoursArray.filter(contour => {
            const elementTypes = new Set(contour.elements.map(el => el.userData.elementType));
            return elementTypes.has('circle') && elementTypes.has('line');
        });

        console.log(`Контуров только из круга: ${circleOnlyContours.length}`);
        console.log(`Контуров из круга и линии: ${mixedContours.length}`);

        // Если есть контуры, содержащие и круг, и линию, то удаляем контуры только из круга
        const finalContours = [];

        if (mixedContours.length > 0) {
            // Удаляем контуры только из круга (целый круг)
            console.log("Есть разрезанные контуры, удаляем целый круг");
            uniqueContoursArray.forEach(contour => {
                const elementTypes = new Set(contour.elements.map(el => el.userData.elementType));
                if (elementTypes.has('line')) {
                    finalContours.push(contour);
                }
            });
        } else {
            // Если нет смешанных контуров, сохраняем все
            finalContours.push(...uniqueContoursArray);
        }

        // Удаляем контуры, которые полностью содержат другие контуры (по элементам)
        const filteredContours = [];
        for (let i = 0; i < finalContours.length; i++) {
            const contourA = finalContours[i];
            let isRedundant = false;

            for (let j = 0; j < finalContours.length; j++) {
                if (i === j) continue;
                const contourB = finalContours[j];

                // Проверяем, содержит ли контур B все элементы контура A
                const elementsA = new Set(contourA.elements.map(e => e.uuid));
                const elementsB = new Set(contourB.elements.map(e => e.uuid));

                let containsAll = true;
                for (const elem of elementsA) {
                    if (!elementsB.has(elem)) {
                        containsAll = false;
                        break;
                    }
                }

                // Если контур B содержит все элементы контура A, но имеет другие элементы,
                // и при этом площадь B больше, то A - часть B
                if (containsAll && elementsB.size > elementsA.size && contourB.area > contourA.area) {
                    console.log(`Удаляем контур ${i} (площадь ${contourA.area}), так как он входит в контур ${j} (площадь ${contourB.area})`);
                    isRedundant = true;
                    break;
                }
            }

            if (!isRedundant) {
                filteredContours.push(contourA);
            }
        }

        this.contours = filteredContours;
        console.log(`Обработано контуров: ${this.contours.length}`);
    }

    // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

    createContourFromPath(path, edgePath) {
        if (path.length < 3) return null;

        // Собираем точки контура
        const points = path.map(vertex => vertex.point.clone());

        // Добавляем первую точку в конец для замыкания
        points.push(points[0].clone());

        // Рассчитываем площадь
        const area = this.calculatePolygonArea(points);
        if (Math.abs(area) < this.minContourArea) return null;

        // Определяем направление обхода
        const isClockwise = area < 0;

        // Корректируем направление (внешние контуры - против часовой стрелки)
        if (isClockwise) {
            points.reverse();
        }

        // Собираем элементы, участвующие в контуре
        const elements = new Set();
        edgePath.forEach(segmentIndex => {
            if (this.segments[segmentIndex]) {
                elements.add(this.segments[segmentIndex].element);
            }
        });

        return {
            elements: Array.from(elements),
            points: points.slice(0, -1),
            area: Math.abs(area),
            isClockwise: isClockwise,
            isValid: true
        };
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

    getElementPoints(element) {
        const points = [];

        if (element.userData.localPoints && element.userData.localPoints.length > 0) {
            for (const point of element.userData.localPoints) {
                points.push(new THREE.Vector2(point.x, point.y));
            }
        } else if (element.geometry && element.geometry.attributes.position) {
            const positions = element.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                points.push(new THREE.Vector2(positions[i], positions[i + 1]));
            }
        }

        return points;
    }

    getVertexKey(point) {
        return `${point.x.toFixed(this.snapPrecision)},${point.y.toFixed(this.snapPrecision)}`;
    }

    getEdgeKey(point1, point2Key) {
        const point1Key = this.getVertexKey(point1);
        return point1Key < point2Key ?
            `${point1Key}-${point2Key}` :
            `${point2Key}-${point1Key}`;
    }

    getContourHash(contour) {
        if (!contour.points || contour.points.length === 0) return '';

        // Рассчитываем площадь
        const area = Math.round(contour.area * 100) / 100;

        // Сортируем элементы по UUID
        const elementIds = contour.elements ?
            contour.elements.map(e => e.uuid).sort().join(',') : '';

        return `${area}|${elementIds}`;
    }

    calculateElementsHash(elements) {
        if (!elements || elements.length === 0) return "";

        const uuids = elements.map(el => el.uuid).sort().join('|');
        return uuids;
    }

    clear() {
        this.segments = [];
        this.points = [];
        this.edges = [];
        this.contours = [];
        this.cacheValid = false;
        this.cachedContours = null;
        this.elementHash = "";
    }
}