class ContourDetector {
    constructor(sketchTools) {
        this.sketchTools = sketchTools;
        this.contours = [];
        this.graph = {};
        this.threshold = 0.1; // Порог для соединения точек
    }

    // Построение графа из всех линий
    buildGraph() {
        this.graph = {};

        // Проходим по всем элементам типа "line" и "polyline"
        this.sketchTools.elements.forEach(element => {
            if (element.type === 'line') {
                this.addLineToGraph(element);
            } else if (element.type === 'polyline') {
                this.addPolylineToGraph(element);
            }
        });
    }

    addLineToGraph(lineElement) {
        const points = lineElement.points || [];
        if (points.length >= 2) {
            const startKey = this.getPointKey(points[0]);
            const endKey = this.getPointKey(points[1]);

            this.addEdge(startKey, endKey, lineElement);
        }
    }

    addPolylineToGraph(polylineElement) {
        const points = polylineElement.points || [];
        for (let i = 0; i < points.length - 1; i++) {
            const startKey = this.getPointKey(points[i]);
            const endKey = this.getPointKey(points[i + 1]);

            this.addEdge(startKey, endKey, polylineElement);
        }
    }

    getPointKey(point) {
        // Округляем координаты для устранения ошибок численной точности
        const x = Math.round(point.x / this.threshold) * this.threshold;
        const y = Math.round(point.y / this.threshold) * this.threshold;
        const z = Math.round(point.z / this.threshold) * this.threshold;
        return `${x.toFixed(2)}_${y.toFixed(2)}_${z.toFixed(2)}`;
    }

    addEdge(startKey, endKey, element) {
        if (!this.graph[startKey]) {
            this.graph[startKey] = { neighbors: [], elements: [] };
        }
        if (!this.graph[endKey]) {
            this.graph[endKey] = { neighbors: [], elements: [] };
        }

        this.graph[startKey].neighbors.push(endKey);
        this.graph[startKey].elements.push(element);

        this.graph[endKey].neighbors.push(startKey);
        this.graph[endKey].elements.push(element);
    }

    // Алгоритм поиска циклов (замкнутых контуров)
    findContours() {
        this.buildGraph();
        this.contours = [];
        const visitedEdges = new Set();
        const visitedVertices = new Set();

        Object.keys(this.graph).forEach(vertexKey => {
            if (!visitedVertices.has(vertexKey)) {
                this.findContoursFromVertex(vertexKey, visitedEdges, visitedVertices);
            }
        });

        return this.contours;
    }

    findContoursFromVertex(startKey, visitedEdges, visitedVertices) {
        const stack = [];
        const path = [];
        const pathEdges = [];

        stack.push({
            vertex: startKey,
            edgeIndex: 0,
            parent: null
        });

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const vertex = current.vertex;

            if (current.edgeIndex >= this.graph[vertex].neighbors.length) {
                // Все соседи обработаны
                visitedVertices.add(vertex);
                stack.pop();
                if (path.length > 0) {
                    path.pop();
                    pathEdges.pop();
                }
                continue;
            }

            const neighborKey = this.graph[vertex].neighbors[current.edgeIndex];
            const edgeId = this.getEdgeId(vertex, neighborKey);

            // Увеличиваем индекс для следующего вызова
            stack[stack.length - 1].edgeIndex++;

            if (visitedEdges.has(edgeId)) {
                continue;
            }

            if (path.length > 0 && neighborKey === startKey) {
                // Найден цикл!
                const contour = {
                    points: [...path.map(key => this.keyToPoint(key)), this.keyToPoint(neighborKey)],
                    elements: [...pathEdges, this.getEdgeBetween(vertex, neighborKey)],
                    isClosed: true,
                    area: this.calculateContourArea([...path.map(key => this.keyToPoint(key))])
                };

                // Проверяем, что контур не дубликат
                if (contour.points.length >= 3 && !this.isDuplicateContour(contour)) {
                    this.contours.push(contour);
                }
                continue;
            }

            if (path.includes(neighborKey)) {
                continue; // Уже были в этой вершине
            }

            // Добавляем ребро в посещенные
            visitedEdges.add(edgeId);

            // Добавляем в пути
            path.push(neighborKey);
            pathEdges.push(this.getEdgeBetween(vertex, neighborKey));

            // Рекурсивно идем дальше
            stack.push({
                vertex: neighborKey,
                edgeIndex: 0,
                parent: vertex
            });
        }
    }

    getEdgeId(vertex1, vertex2) {
        return [vertex1, vertex2].sort().join('|');
    }

    getEdgeBetween(vertex1, vertex2) {
        const edges1 = this.graph[vertex1]?.elements || [];
        const edges2 = this.graph[vertex2]?.elements || [];

        // Ищем общий элемент
        for (const edge of edges1) {
            if (edges2.includes(edge)) {
                return edge;
            }
        }
        return null;
    }

    keyToPoint(key) {
        const [x, y, z] = key.split('_').map(Number);
        const worldPoint = this.sketchTools.currentPlane.localToWorld(new THREE.Vector3(x, y, z));
        return worldPoint;
    }

    calculateContourArea(points) {
        let area = 0;
        const n = points.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }

        return Math.abs(area) / 2;
    }

    isDuplicateContour(newContour) {
        // Проверяем, есть ли уже такой контур
        for (const contour of this.contours) {
            if (contour.points.length !== newContour.points.length) continue;

            let match = true;
            for (let i = 0; i < contour.points.length; i++) {
                const dist = contour.points[i].distanceTo(newContour.points[i]);
                if (dist > this.threshold * 2) {
                    match = false;
                    break;
                }
            }

            if (match) return true;
        }

        return false;
    }

    // Получить все замкнутые контуры
    getClosedContours() {
        return this.findContours();
    }

    // Получить контуры, содержащие определенный элемент
    getContoursContainingElement(element) {
        return this.contours.filter(contour =>
            contour.elements.includes(element)
        );
    }

    // Визуализация контуров для отладки
    visualizeContours(scene) {
        this.contours.forEach((contour, index) => {
            const color = new THREE.Color(
                Math.random() * 0.5 + 0.5,
                Math.random() * 0.5 + 0.5,
                Math.random() * 0.5 + 0.5
            );

            const points = contour.points;
            const vertices = [];

            points.forEach(point => {
                const localPoint = this.sketchTools.currentPlane.worldToLocal(point.clone());
                vertices.push(localPoint.x, localPoint.y, 0.1);
            });

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

            const material = new THREE.LineBasicMaterial({
                color: color,
                linewidth: 3,
                transparent: true,
                opacity: 0.7
            });

            const mesh = new THREE.LineLoop(geometry, material);
            mesh.userData = {
                isContourDebug: true,
                contourIndex: index,
                area: contour.area
            };

            scene.add(mesh);
        });
    }
}