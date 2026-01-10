/**
 * Упрощенный детектор замкнутых контуров
 */
class ContourDetector {
    constructor() {
        this.segments = [];
        this.points = [];
        this.edges = [];
        this.contours = [];
    }

    // Обновление элементов для анализа
    updateElements(elements) {
        this.segments = [];
        this.points = [];
        this.edges = [];
        this.contours = [];

        // Создаем упрощенное представление всех сегментов
        elements.forEach(element => {
            if (!element || !element.userData) return;

            // Получаем точки элемента
            const elementPoints = this.getElementPoints(element);
            if (elementPoints.length < 2) return;

            // Для линий и полилиний - разбиваем на сегменты
            for (let i = 0; i < elementPoints.length - 1; i++) {
                const start = elementPoints[i];
                const end = elementPoints[i + 1];

                // Проверяем, что сегмент имеет ненулевую длину
                if (start.distanceTo(end) < 0.001) continue;

                this.segments.push({
                    element: element,
                    start: start.clone(),
                    end: end.clone(),
                    index: this.segments.length
                });
            }
        });

        console.log(`ContourDetector: найдено ${this.segments.length} сегментов`);
    }

    // Получение точек элемента
    getElementPoints(element) {
        const points = [];

        if (element.userData.localPoints && element.userData.localPoints.length > 0) {
            // Используем локальные точки из userData
            element.userData.localPoints.forEach(point => {
                points.push(new THREE.Vector2(point.x, point.y));
            });
        } else if (element.geometry && element.geometry.attributes.position) {
            // Извлекаем точки из геометрии
            const positions = element.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                points.push(new THREE.Vector2(positions[i], positions[i + 1]));
            }
        }

        return points;
    }

    // Поиск всех замкнутых контуров
    findClosedContours() {
        console.log("ContourDetector: поиск замкнутых контуров...");

        if (this.segments.length < 3) {
            console.log("Недостаточно сегментов для поиска контуров");
            return [];
        }

        // 1. Находим все точки пересечения
        this.findIntersections();

        // 2. Строим граф
        this.buildGraph();

        // 3. Ищем циклы
        this.findCycles();

        console.log(`ContourDetector: найдено ${this.contours.length} контуров`);
        return this.contours;
    }

    // Поиск пересечений между сегментами
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

    // Проверка пересечения двух отрезков
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

        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return new THREE.Vector2(
                p1.x + ua * (p2.x - p1.x),
                p1.y + ua * (p2.y - p1.y)
            );
        }

        return null;
    }

    // Расстояние вдоль сегмента (параметрическое)
    getDistanceAlongSegment(point, segment) {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            return (point.x - segment.start.x) / dx;
        } else {
            return (point.y - segment.start.y) / dy;
        }
    }

    // Разбиение сегментов в точках пересечения
    splitSegmentsAtIntersections(intersectionPoints) {
        const newSegments = [];

        this.segments.forEach((segment, index) => {
            const intersections = intersectionPoints.get(index);

            if (intersections.length === 0) {
                // Нет пересечений - оставляем как есть
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
                    originalIndex: index
                });
            }
        });

        this.segments = newSegments;
        console.log(`После разбиения: ${this.segments.length} сегментов`);
    }

    // Построение графа
    buildGraph() {
        console.log("Построение графа...");

        // Создаем карту вершин
        const vertexMap = new Map();

        // Функция для получения ключа вершины
        const getVertexKey = (point) => {
            return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
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
                segmentIndex: segment.index
            });

            endVertex.edges.push({
                to: startKey,
                segmentIndex: segment.index
            });
        });

        this.points = Array.from(vertexMap.values());
        console.log(`Граф построен: ${this.points.length} вершин`);
    }

    // Поиск циклов в графе
    findCycles() {
        console.log("Поиск циклов...");
        this.contours = [];

        if (this.points.length < 3) return;

        const visitedEdges = new Set();

        // Для каждой вершины пытаемся найти цикл
        for (const vertex of this.points) {
            const cycles = this.findCyclesFromVertex(vertex, visitedEdges);
            this.contours.push(...cycles);
        }

        // Удаляем дубликаты
        this.removeDuplicateContours();
    }

    // Поиск циклов, начиная с заданной вершины
    findCyclesFromVertex(startVertex, visitedEdges) {
        const cycles = [];
        const stack = [];

        const dfs = (currentVertex, prevVertex, path, edgePath) => {
            // Если вернулись в начальную вершину
            if (path.length > 2 && currentVertex === startVertex) {
                // Проверяем, что цикл не слишком мал
                if (path.length >= 3) {
                    const contour = this.createContourFromPath(path, edgePath);
                    if (contour && contour.area > 0.01) {
                        cycles.push(contour);
                    }
                }
                return;
            }

            // Если уже были в этой вершине (но это не начальная)
            if (path.includes(currentVertex) && currentVertex !== startVertex) {
                return;
            }

            // Добавляем текущую вершину в путь
            path.push(currentVertex);

            // Перебираем все ребра из текущей вершины
            for (const edge of currentVertex.edges) {
                const edgeKey = this.getEdgeKey(currentVertex.point, edge.to);

                // Пропускаем уже посещенные ребра
                if (visitedEdges.has(edgeKey)) continue;

                // Пропускаем ребро, ведущее назад
                if (prevVertex && edge.to === prevVertex) continue;

                // Находим следующую вершину
                const nextVertex = this.points.find(v =>
                    this.getVertexKey(v.point) === edge.to
                );

                if (!nextVertex) continue;

                visitedEdges.add(edgeKey);
                edgePath.push(edge.segmentIndex);

                dfs(nextVertex, this.getVertexKey(currentVertex.point), [...path], [...edgePath]);

                visitedEdges.delete(edgeKey);
                edgePath.pop();
            }

            path.pop();
        };

        dfs(startVertex, null, [], []);

        return cycles;
    }

    // Создание контура из пути
    createContourFromPath(path, edgePath) {
        if (path.length < 3) return null;

        // Собираем точки контура
        const points = path.map(vertex => vertex.point.clone());

        // Добавляем первую точку в конец для замыкания
        points.push(points[0].clone());

        // Рассчитываем площадь
        const area = this.calculatePolygonArea(points);
        if (Math.abs(area) < 0.01) return null;

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
            points: points.slice(0, -1), // Убираем дублирующую первую точку
            area: Math.abs(area),
            isClockwise: isClockwise,
            isValid: true
        };
    }

    // Удаление дублирующих контуров
    removeDuplicateContours() {
        const uniqueContours = [];
        const contourHashes = new Set();

        this.contours.forEach(contour => {
            const hash = this.getContourHash(contour);
            if (!contourHashes.has(hash)) {
                contourHashes.add(hash);
                uniqueContours.push(contour);
            }
        });

        this.contours = uniqueContours;
    }

    // Получение хэша контура
    getContourHash(contour) {
        // Сортируем точки по углу относительно центра
        const center = this.calculateContourCenter(contour.points);
        const points = contour.points.map(p => ({
            x: p.x.toFixed(1),
            y: p.y.toFixed(1),
            angle: Math.atan2(p.y - center.y, p.x - center.x)
        }));

        points.sort((a, b) => a.angle - b.angle);

        return points.map(p => `${p.x},${p.y}`).join('|');
    }

    // Вспомогательные методы
    getVertexKey(point) {
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    }

    getEdgeKey(point1, point2Key) {
        const point1Key = this.getVertexKey(point1);
        return point1Key < point2Key ?
            `${point1Key}-${point2Key}` :
            `${point2Key}-${point1Key}`;
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

    // Очистка данных
    clear() {
        this.segments = [];
        this.points = [];
        this.edges = [];
        this.contours = [];
    }
}