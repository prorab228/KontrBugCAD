
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

        // Для ВСЕХ элементов - разбиваем на сегменты
        // Это важно для поиска пересечений
        for (let i = 0; i < elementPoints.length - 1; i++) {
            const start = elementPoints[i];
            const end = elementPoints[i + 1];

            // Проверяем, что сегмент имеет ненулевую длину
            if (start.distanceTo(end) < 0.001) continue;

            this.segments.push({
                element: element,
                start: start.clone(),
                end: end.clone(),
                index: this.segments.length,
                isClosed: (i === elementPoints.length - 2) &&
                         element.userData.isClosed
            });
        }

        // Для замкнутых контуров добавляем сегмент от последней к первой точке
        if (element.userData.isClosed && elementPoints.length > 2) {
            const start = elementPoints[elementPoints.length - 1];
            const end = elementPoints[0];

         //   if (start.distanceTo(end) < 0.001) continue;

            this.segments.push({
                element: element,
                start: start.clone(),
                end: end.clone(),
                index: this.segments.length,
                isClosed: true
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

        // 3. Ищем циклы - используем улучшенный алгоритм
        this.findAllContours();

        console.log(`ContourDetector: найдено ${this.contours.length} контуров`);
        
        // Выводим информацию о каждом контуре
        this.contours.forEach((contour, index) => {
            console.log(`Контур ${index}: площадь ${contour.area}, точек ${contour.points.length}`);
        });
        
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

        if (ua >= -0.0001 && ua <= 1.0001 && ub >= -0.0001 && ub <= 1.0001) {
            // Уточняем точку пересечения (корректируем параметры в диапазон [0, 1])
            const uaClamped = Math.max(0, Math.min(1, ua));
            return new THREE.Vector2(
                p1.x + uaClamped * (p2.x - p1.x),
                p1.y + uaClamped * (p2.y - p1.y)
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

   /** Построение графа - исправленная версия */
buildGraph() {
    console.log("Построение графа...");

    // Создаем карту вершин
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

    // Найти все контуры
findAllContours() {
    console.log("Поиск всех контуров...");
    this.contours = [];

    if (this.segments.length < 3) {
        console.log("Недостаточно сегментов для поиска контуров");
        return [];
    }

    // 1. Находим все точки пересечения
    this.findIntersections();

    // 2. Строим граф
    this.buildGraph();

    // 3. Ищем циклы - используем упрощенный алгоритм
    this.findContoursSimple();

    console.log(`ContourDetector: найдено ${this.contours.length} контуров`);

    // Выводим информацию о каждом контуре
    this.contours.forEach((contour, index) => {
        console.log(`Контур ${index}: площадь ${contour.area}, точек ${contour.points.length}`);
    });

    return this.contours;
}

/** Упрощенный поиск контуров */
findContoursSimple() {
    console.log("Упрощенный поиск контуров...");

    if (!this.points || this.points.length === 0) return;

    const allCycles = [];
    const visitedEdges = new Set();
    const processedVertices = new Set(); // Только для текущего поиска

    // Для каждой вершины пытаемся найти циклы
    for (const vertex of this.points) {
        const vertexKey = this.getVertexKey(vertex.point);

        // Если вершина уже была обработана в каком-то контуре, пропускаем
        if (processedVertices.has(vertexKey)) {
            continue;
        }

        const cycles = this.findContoursFromVertexSimple(vertex, visitedEdges);

        // Добавляем вершины найденных циклов в processedVertices
        cycles.forEach(cycle => {
            if (cycle.points && cycle.points.length > 0) {
                cycle.points.forEach(point => {
                    const pointKey = this.getVertexKey(point);
                    processedVertices.add(pointKey);
                });
                allCycles.push(cycle);
            }
        });
    }

    console.log(`Найдено циклов: ${allCycles.length}`);

    // Обрабатываем найденные циклы
    this.processFoundContours(allCycles);
}

/** Упрощенный поиск контуров от вершины */
findContoursFromVertexSimple(startVertex, visitedEdges) {
    const cycles = [];

    // Если у вершины меньше 2 ребер, не может быть цикла
    if (startVertex.edges.length < 2) return cycles;

    // Используем BFS вместо DFS для поиска первого цикла
    const queue = [];
    const startKey = this.getVertexKey(startVertex.point);

    queue.push({
        vertex: startVertex,
        path: [startVertex],
        edgePath: [],
        visited: new Set()
    });

    while (queue.length > 0) {
        const current = queue.shift();
        const currentVertex = current.vertex;
        const currentPath = current.path;
        const currentEdgePath = current.edgePath;
        const currentVisited = current.visited;

        // Перебираем все ребра из текущей вершины
        for (const edge of currentVertex.edges) {
            const edgeKey = this.getEdgeKey(currentVertex.point, edge.to);

            // Пропускаем уже посещенные ребра в этом пути
            if (currentVisited.has(edgeKey)) continue;

            // Пропускаем ребра, которые уже вошли в какие-то циклы
            if (visitedEdges.has(edgeKey)) continue;

            // Находим следующую вершину
            const nextVertex = this.points.find(v =>
                this.getVertexKey(v.point) === edge.to
            );

            if (!nextVertex) continue;

            const nextKey = this.getVertexKey(nextVertex.point);

            // Если вернулись в начальную вершину
            if (nextKey === startKey && currentPath.length >= 3) {
                // Создаем контур
                const contour = this.createContourFromPath(currentPath, currentEdgePath.concat(edge.segmentIndex));
                if (contour && contour.area > 0.01) {
                    cycles.push(contour);
                    // Добавляем все ребра цикла в visitedEdges
                    currentEdgePath.forEach(segIndex => {
                        const seg = this.segments[segIndex];
                        if (seg) {
                            const segKey = this.getEdgeKey(seg.start, seg.end);
                            visitedEdges.add(segKey);
                        }
                    });
                    // Добавляем текущее ребро
                    visitedEdges.add(edgeKey);
                    return cycles; // Возвращаем первый найденный цикл
                }
            }

            // Если уже были в этой вершине, пропускаем
            const alreadyInPath = currentPath.some(v =>
                this.getVertexKey(v.point) === nextKey
            );

            if (alreadyInPath) continue;

            // Продолжаем поиск
            const newVisited = new Set(currentVisited);
            newVisited.add(edgeKey);

            queue.push({
                vertex: nextVertex,
                path: [...currentPath, nextVertex],
                edgePath: [...currentEdgePath, edge.segmentIndex],
                visited: newVisited
            });
        }
    }

    return cycles;
}

    // Найти контуры, начиная с заданной вершины (оптимизированная версия)
findContoursFromVertex(startVertex, visitedEdges) {
    const cycles = [];

    // Если у вершины меньше 2 ребер, не может быть цикла
    if (startVertex.edges.length < 2) return cycles;

    const stack = [[startVertex, null, [startVertex], [], new Set()]];

    while (stack.length > 0) {
        const [currentVertex, prevVertexKey, path, edgePath, localVisitedEdges] = stack.pop();

        // Если вернулись в начальную вершину
        if (path.length > 2 && currentVertex === startVertex) {
            // Проверяем, что цикл не слишком мал
            if (path.length >= 3) {
                const contour = this.createContourFromPath(path, edgePath);
                if (contour && contour.area > 0.01) {
                    cycles.push(contour);
                }
            }
            continue;
        }

        // Если уже были в этой вершине (но это не начальная)
        if (currentVertex !== startVertex && path.includes(currentVertex)) {
            continue;
        }

        // Перебираем все ребра из текущей вершины
        for (const edge of currentVertex.edges) {
            const edgeKey = this.getEdgeKey(currentVertex.point, edge.to);

            // Пропускаем уже посещенные ребра в этом пути
            if (localVisitedEdges.has(edgeKey)) continue;

            // Пропускаем ребро, ведущее назад
            if (prevVertexKey && edge.to === prevVertexKey) continue;

            // Находим следующую вершину
            const nextVertex = this.points.find(v =>
                this.getVertexKey(v.point) === edge.to
            );

            if (!nextVertex) continue;

            // Создаем новые копии для следующего шага
            const newPath = [...path, nextVertex];
            const newEdgePath = [...edgePath, edge.segmentIndex];
            const newLocalVisitedEdges = new Set(localVisitedEdges);
            newLocalVisitedEdges.add(edgeKey);

            stack.push([nextVertex, this.getVertexKey(currentVertex.point),
                       newPath, newEdgePath, newLocalVisitedEdges]);
        }
    }

    return cycles;
}

/** Упрощенный хэш контура */
getContourHashSimple(contour) {
    if (!contour.points || contour.points.length === 0) return '';

    // Рассчитываем площадь
    const area = Math.round(contour.area * 100) / 100;

    // Сортируем элементы по UUID
    const elementIds = contour.elements ?
        contour.elements.map(e => e.uuid).sort().join(',') : '';

    return `${area}|${elementIds}`;
}

    /** Обработка найденных контуров - упрощенная */
processFoundContours(allCycles) {
    const validContours = [];
    const contourHashes = new Set();

    // Фильтруем и удаляем дубликаты
    allCycles.forEach(contour => {
        if (!contour.isValid || contour.points.length < 3) return;

        const hash = this.getContourHashSimple(contour);
        if (!contourHashes.has(hash)) {
            contourHashes.add(hash);
            validContours.push(contour);
        }
    });

    console.log(`Всего уникальных контуров: ${validContours.length}`);

    // Находим контуры, которые состоят только из круга (без линии)
    const circleOnlyContours = validContours.filter(contour => {
        const elementTypes = new Set(contour.elements.map(el => el.userData.elementType));
        return elementTypes.size === 1 && elementTypes.has('circle');
    });

    // Находим контуры, которые содержат и круг, и линию
    const mixedContours = validContours.filter(contour => {
        const elementTypes = new Set(contour.elements.map(el => el.userData.elementType));
        return elementTypes.has('circle') && elementTypes.has('line');
    });

    console.log(`Контуров только из круга: ${circleOnlyContours.length}`);
    console.log(`Контуров из круга и линии: ${mixedContours.length}`);

    // Если есть контуры, содержащие и круг, и линию, то удаляем контуры только из круга
    // (так как круг был разрезан линией)
    const finalContours = [];

    if (mixedContours.length > 0) {
        // Удаляем контуры только из круга (целый круг)
        console.log("Есть разрезанные контуры, удаляем целый круг");
        validContours.forEach(contour => {
            const elementTypes = new Set(contour.elements.map(el => el.userData.elementType));
            if (elementTypes.has('line')) {
                finalContours.push(contour);
            }
        });
    } else {
        // Если нет смешанных контуров, сохраняем все
        finalContours.push(...validContours);
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

    // Вычисление центра масс полигона
calculatePolygonCentroid(points) {
    let area = 0;
    let centroidX = 0;
    let centroidY = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const cross = points[i].x * points[j].y - points[j].x * points[i].y;
        area += cross;
        centroidX += (points[i].x + points[j].x) * cross;
        centroidY += (points[i].y + points[j].y) * cross;
    }

    area *= 0.5;
    if (Math.abs(area) < 0.0001) {
        return new THREE.Vector2(points[0].x, points[0].y);
    }

    const factor = 1 / (6 * area);
    centroidX *= factor;
    centroidY *= factor;

    return new THREE.Vector2(centroidX, centroidY);
}

    // Получение хэша контура
    getContourHash(contour) {
    if (!contour.points || contour.points.length === 0) return '';

    // Рассчитываем центр масс (не просто среднее)
    const center = this.calculatePolygonCentroid(contour.points);

    // Нормализуем точки относительно центра
    const normalizedPoints = contour.points.map(p => ({
        x: Math.round((p.x - center.x) * 1000) / 1000,
        y: Math.round((p.y - center.y) * 1000) / 1000
    }));

    // Находим точку с минимальным углом для нормализации вращения
    const angles = normalizedPoints.map(p => Math.atan2(p.y, p.x));
    const minAngleIndex = angles.indexOf(Math.min(...angles));

    // Перестраиваем массив, начиная с точки с минимальным углом
    const rotatedPoints = [];
    for (let i = 0; i < normalizedPoints.length; i++) {
        const idx = (minAngleIndex + i) % normalizedPoints.length;
        rotatedPoints.push(normalizedPoints[idx]);
    }

    // Создаем строку хэша
    const pointString = rotatedPoints.map(p => `${p.x},${p.y}`).join('|');
    const elementString = contour.elements ?
        contour.elements.map(e => e.uuid).sort().join(',') : '';

    return `${pointString}|${elementString}`;
}


    // Вспомогательные методы
    getVertexKey(point) {
        return `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
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
