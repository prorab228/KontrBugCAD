// FigureManager.js - исправленная версия
class FigureManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.figureTree = new Map();
        this.rootNodes = [];
        this.elementToNodes = new Map();
        this.figureCacheTimestamp = 0;
        this.autoContours = []; // Автоматически найденные контуры
        console.log("FigureManager: создан");
    }

    // ========== ОСНОВНЫЕ МЕТОДЫ ==========

    collectAllFigures() {
        console.log("=== FigureManager: начинаем сбор фигур ===");
        const now = Date.now();

        // Кэширование на 200 мс
        if (this.figureTree.size > 0 && now - this.figureCacheTimestamp < 200) {
            console.log("FigureManager: используем кэш, узлов:", this.figureTree.size);
            return this.getAllFiguresFlat();
        }

        // 1. Сбор всех элементов
        const allElements = this.getAllSketchElements();
        console.log("FigureManager: найдено элементов:", allElements.length);

        // 2. Сбор простых контуров
        const simpleContours = this.collectSimpleContours(allElements);
        console.log("FigureManager: простых контуров:", simpleContours.length);

        // 3. Сбор контуров из линий
        const lineContours = this.collectLineContours(allElements, simpleContours);
        console.log("FigureManager: контуров из линий:", lineContours.length);

        // 4. Добавляем автоматически найденные контуры
        const autoContours = this.getAutoContours();
        console.log("FigureManager: автоматических контуров:", autoContours.length);

        // 5. Объединение всех контуров
        const allContours = [...simpleContours, ...lineContours, ...autoContours];
        console.log("FigureManager: всего контуров:", allContours.length);

        // 6. Создание узлов
        const allNodes = allContours.map(contour => new FigureNode(contour));
        console.log("FigureManager: создано узлов:", allNodes.length);

        // 7. Построение дерева вложенности
        if (allNodes.length > 0) {
            this.buildEnhancedNestingTree(allNodes);
        } else {
            this.rootNodes = [];
        }

        // 8. Определение типов (отверстия/внешние)
        if (this.rootNodes.length > 0) {
            this.determineContourTypes();
        }

        // 9. Сохранение в структуры данных
        this.updateDataStructures(allNodes);

        this.figureCacheTimestamp = now;
        return this.getAllFiguresFlat();
    }

    // Получение всех элементов скетча (исправленный метод)
    getAllSketchElements() {
        const elements = [];

        // Получаем все плоскости скетча
        const sketchPlanes = this.editor.sketchPlanes || [];
        const workPlanes = this.editor.workPlanes || [];
        const allPlanes = [...sketchPlanes, ...workPlanes];

        if (allPlanes.length === 0) {
            // Если нет плоскостей, ищем элементы в сцене
            this.editor.scene.traverse((object) => {
                if (object.userData && object.userData.type === 'sketch_element') {
                    elements.push(object);
                }
            });
        } else {
            // Ищем элементы на плоскостях
            allPlanes.forEach(plane => {
                plane.traverse((object) => {
                    if (object.userData && object.userData.type === 'sketch_element') {
                        elements.push(object);
                    }
                });
            });
        }

        return elements;
    }

    // Сбор простых контуров (упрощенный)
    collectSimpleContours(elements) {
        const contours = [];

        elements.forEach(element => {
            if (!element.userData) return;

            const elementType = element.userData.elementType;
            const points = this.getElementPoints(element);

            if (points.length < 3) return;

            // Проверяем, замкнут ли элемент
            const isClosed = this.isSketchElementClosed(element);
            if (!isClosed) return;

            const area = this.calculatePolygonArea(points);
            if (Math.abs(area) < 0.01) return;

            const center = this.calculateContourCenter(points);
            const boundingBox = this.calculateBoundingBox(points);
            const isClockwise = area < 0;

            contours.push({
                element: element,
                points: points,
                area: Math.abs(area),
                center: center,
                boundingBox: boundingBox,
                type: elementType,
                isClosed: true,
                isClockwise: isClockwise,
                originalArea: area
            });
        });

        return contours;
    }

    // Сбор контуров из линий (упрощенный)
    collectLineContours(allElements, simpleContours) {
        // Ищем линии, которые еще не включены в контуры
        const usedElementIds = new Set();
        simpleContours.forEach(contour => {
            if (contour.element) {
                usedElementIds.add(contour.element.uuid);
            }
        });

        const lines = allElements.filter(element =>
            (element.userData.elementType === 'line' ||
             element.userData.elementType === 'polyline') &&
            !usedElementIds.has(element.uuid)
        );

        if (lines.length === 0) return [];

        // Простой поиск контуров: если полилиния замкнута, считаем ее контуром
        const contours = [];

        lines.forEach(element => {
            const points = this.getElementPoints(element);
            if (points.length < 3) return;

            // Проверяем, замкнута ли полилиния (первая и последняя точки совпадают)
            const firstPoint = points[0];
            const lastPoint = points[points.length - 1];
            const distance = Math.sqrt(
                Math.pow(lastPoint.x - firstPoint.x, 2) +
                Math.pow(lastPoint.y - firstPoint.y, 2)
            );

            if (distance < 0.1) { // Замкнута
                const area = this.calculatePolygonArea(points);
                if (Math.abs(area) > 0.01) {
                    const center = this.calculateContourCenter(points);
                    const boundingBox = this.calculateBoundingBox(points);
                    const isClockwise = area < 0;

                    contours.push({
                        element: element,
                        points: points,
                        area: Math.abs(area),
                        center: center,
                        boundingBox: boundingBox,
                        type: 'polyline',
                        isClosed: true,
                        isClockwise: isClockwise,
                        originalArea: area
                    });
                }
            }
        });

        return contours;
    }

    // Получение автоматических контуров
    getAutoContours() {
        return this.autoContours || [];
    }

    // Обновление автоматическими контурами
    updateWithAutoContours(contours) {
        console.log("=== FigureManager: обновление автоматическими контурами ===");
        console.log("Получено контуров:", contours.length);

        // Фильтруем только валидные контуры
        this.autoContours = contours.filter(contour =>
            contour &&
            contour.points &&
            contour.points.length >= 3 &&
            contour.area > 0.01
        );

        console.log("Валидных контуров:", this.autoContours.length);

        // Сбрасываем кэш
        this.figureCacheTimestamp = 0;

        // Перестраиваем фигуры
        this.collectAllFigures();
    }

    // ========== ГЕОМЕТРИЧЕСКИЕ МЕТОДЫ ==========

    getElementPoints(element) {
        if (!element.userData) return [];

        // 1. Пробуем получить точки из userData.localPoints
        if (element.userData.localPoints && element.userData.localPoints.length > 0) {
            return element.userData.localPoints.map(p => {
                if (p instanceof THREE.Vector3) {
                    return new THREE.Vector2(p.x, p.y);
                } else if (p.x !== undefined && p.y !== undefined) {
                    return new THREE.Vector2(p.x, p.y);
                }
                return new THREE.Vector2(0, 0);
            });
        }

        // 2. Пробуем получить точки из geometry
        if (element.geometry && element.geometry.attributes.position) {
            const positions = element.geometry.attributes.position.array;
            const points = [];

            for (let i = 0; i < positions.length; i += 3) {
                points.push(new THREE.Vector2(positions[i], positions[i + 1]));
            }

            return points;
        }

        // 3. Для текста возвращаем пустой массив
        if (element.userData.elementType === 'text') {
            return [];
        }

        console.warn("Не удалось получить точки для элемента:", element.userData.elementType);
        return [];
    }

    isSketchElementClosed(element) {
        if (!element.userData) return false;

        const type = element.userData.elementType;

        // Проверяем по типу элемента
        const closedTypes = [
            'rectangle', 'circle', 'polygon', 'oval',
            'stadium', 'arc', 'polyline'
        ];

        if (closedTypes.includes(type)) {
            // Для полилинии проверяем, замкнута ли она
            if (type === 'polyline') {
                const points = this.getElementPoints(element);
                if (points.length < 3) return false;

                const first = points[0];
                const last = points[points.length - 1];
                const distance = Math.sqrt(
                    Math.pow(last.x - first.x, 2) +
                    Math.pow(last.y - first.y, 2)
                );

                return distance < 0.1;
            }
            return true;
        }

        return false;
    }

    calculatePolygonArea(points) {
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

    calculateContourCenter(points) {
        if (points.length === 0) return new THREE.Vector2(0, 0);

        const center = new THREE.Vector2(0, 0);
        points.forEach(p => {
            center.x += p.x;
            center.y += p.y;
        });

        center.x /= points.length;
        center.y /= points.length;

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

    // ========== ДЕРЕВО ВЛОЖЕННОСТИ ==========

    buildEnhancedNestingTree(nodes) {
        console.log("=== FigureManager: строим дерево вложенности ===");

        // Очищаем связи
        nodes.forEach(node => {
            node.parent = null;
            node.children = [];
            node.depth = 0;
        });

        // Сортируем по площади (от большей к меньшей)
        const sortedNodes = [...nodes].sort((a, b) => b.area - a.area);
        console.log(`Сортировка: ${sortedNodes.length} узлов`);

        // Для каждого узла ищем родителя
        for (let i = 0; i < sortedNodes.length; i++) {
            const currentNode = sortedNodes[i];
            let bestParent = null;
            let bestParentArea = Infinity;

            // Ищем родителя среди узлов с большей площадью
            for (let j = 0; j < i; j++) {
                const potentialParent = sortedNodes[j];

                // Проверяем, находится ли текущий узел внутри потенциального родителя
                if (this.isContourInside(currentNode.contour, potentialParent.contour)) {
                    // Выбираем самого маленького родителя (ближайшего по площади)
                    if (potentialParent.area < bestParentArea) {
                        bestParent = potentialParent;
                        bestParentArea = potentialParent.area;
                    }
                }
            }

            if (bestParent) {
                bestParent.addChild(currentNode);
            }
        }

        // Находим корневые узлы
        this.rootNodes = sortedNodes.filter(node => node.parent === null);

        // Обновляем глубины
        this.updateDepthsRecursively();

        console.log(`Построено дерево: ${this.rootNodes.length} корневых узлов`);
    }

    isContourInside(innerContour, outerContour) {
        const innerPoints = innerContour.points || [];
        const outerPoints = outerContour.points || [];

        if (innerPoints.length === 0 || outerPoints.length === 0) return false;

        // Проверяем все точки внутреннего контура
        for (const point of innerPoints) {
            if (!this.isPointInsidePolygon(point, outerPoints)) {
                return false;
            }
        }

        return true;
    }

    isPointInsidePolygon(point, polygon) {
        if (polygon.length < 3) return false;

        let inside = false;
        const x = point.x;
        const y = point.y;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
    }

    updateDepthsRecursively() {
        const updateDepth = (node, depth) => {
            node.depth = depth;
            node.children.forEach(child => updateDepth(child, depth + 1));
        };

        this.rootNodes.forEach(root => updateDepth(root, 0));
    }

    determineContourTypes() {
        console.log("=== FigureManager: определяем типы контуров ===");

        const determineNode = (node) => {
            // Правило: четная глубина - внешний контур, нечетная - отверстие
            node.isHole = (node.depth % 2 === 1);
            node.isOuter = !node.isHole;

            node.children.forEach(determineNode);
        };

        this.rootNodes.forEach(determineNode);
    }

    updateDataStructures(nodes) {
        this.figureTree.clear();
        this.elementToNodes.clear();

        nodes.forEach(node => {
            this.figureTree.set(node.id, node);

            node.elementIds.forEach(elementId => {
                if (!this.elementToNodes.has(elementId)) {
                    this.elementToNodes.set(elementId, []);
                }
                this.elementToNodes.get(elementId).push(node);
            });
        });
    }

    // ========== ПОЛУЧЕНИЕ ДАННЫХ ==========

    getAllFiguresFlat() {
        const result = [];

        const traverse = (node) => {
            const immediateHoles = node.getImmediateHoles().map(child => child.contour);

            const figure = {
                id: node.id,
                outer: node.contour,
                holes: immediateHoles,
                area: node.area,
                selected: false,
                parentId: node.parent ? node.parent.id : null,
                childrenIds: node.children.map(child => child.id),
                isStandalone: node.parent === null,
                canBeSelected: true,
                isHole: node.isHole,
                isOuter: node.isOuter,
                depth: node.depth,
                elementIds: node.elementIds,
                element: node.element,
                boundingBox: node.boundingBox,
                center: node.center,
                type: node.type
            };

            result.push(figure);
            node.children.forEach(child => traverse(child));
        };

        this.rootNodes.forEach(root => traverse(root));

        result.sort((a, b) => a.depth - b.depth);

        return result;
    }

    getNodeById(id) {
        return this.figureTree.get(id);
    }

    getFigureById(id) {
        const node = this.getNodeById(id);
        if (!node) return null;

        return this.nodeToFigure(node);
    }

    getFiguresByElement(element) {
        const elementId = element.uuid;
        const nodes = this.elementToNodes.get(elementId) || [];

        return nodes.map(node => this.nodeToFigure(node));
    }

    findNodeByContour(contour) {
        for (const node of this.figureTree.values()) {
            if (node.contour === contour) {
                return node;
            }
        }
        return null;
    }

    nodeToFigure(node) {
        const immediateHoles = node.getImmediateHoles().map(hole => hole.contour);

        return {
            id: node.id,
            outer: node.contour,
            holes: immediateHoles,
            area: node.area,
            isHole: node.isHole,
            isOuter: node.isOuter,
            depth: node.depth,
            parentId: node.parent ? node.parent.id : null,
            childrenIds: node.children.map(child => child.id),
            elementIds: node.elementIds,
            element: node.element,
            boundingBox: node.boundingBox,
            center: node.center,
            type: node.type
        };
    }

    // ========== ДЕБАГ ==========

    debugPrintTree() {
        console.log("\n=== ДЕРЕВО ФИГУР ===");

        if (this.rootNodes.length === 0) {
            console.log("  Дерево пустое");
            return;
        }

        const printNode = (node, indent = "") => {
            const type = node.isHole ? "○ ОТВЕРСТИЕ" : "● ВНЕШНИЙ";
            const area = node.area.toFixed(2);
            const elements = node.elementIds.size;
            const children = node.children.length;
            const depth = node.depth;

            console.log(`${indent}${type} [ID: ${node.id.substring(0, 8)}...]`);
            console.log(`${indent}  Глубина: ${depth}, Площадь: ${area}, Элементов: ${elements}, Детей: ${children}`);

            node.children.forEach(child => printNode(child, indent + "  "));
        };

        this.rootNodes.forEach((root, i) => {
            console.log(`\nКорень ${i + 1}:`);
            printNode(root);
        });
    }

    // ========== ОБРАТНАЯ СОВМЕСТИМОСТЬ ==========

    findFigureByHoleContour(holeContour) {
        const node = this.findNodeByContour(holeContour);
        return node ? this.nodeToFigure(node) : null;
    }

    getAllFigures() {
        return this.getAllFiguresFlat();
    }

    findNodeByHoleContour(holeContour) {
    return this.findNodeByContour(holeContour);
}
}

