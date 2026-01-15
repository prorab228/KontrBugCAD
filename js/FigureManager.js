
// FigureManager.js - исправленная версия
class FigureManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.figureTree = new Map();
        this.rootNodes = [];
        this.elementToNodes = new Map();
        this.figureCacheTimestamp = 0;
        this.autoContours = []; // Автоматически найденные контуры
        this.brokenElements = new Set(); // Элементы, которые были разбиты на сегменты
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

        // 5. Обновляем список разбитых элементов на основе автоматических контуров
        this.updateBrokenElements(autoContours);

        // 6. Фильтруем контуры: исключаем простые контуры, которые были разбиты
        const filteredContours = this.filterBrokenContours(simpleContours);
        console.log("FigureManager: после фильтрации контуров:", filteredContours.length);

        // 7. Объединение всех контуров
        const allContours = [...filteredContours, ...lineContours, ...autoContours];
        console.log("FigureManager: всего контуров:", allContours.length);

        // 8. Создание узлов
        const allNodes = allContours.map(contour => new FigureNode(contour));
        console.log("FigureManager: создано узлов:", allNodes.length);

        // 9. Построение дерева вложенности
        if (allNodes.length > 0) {
            this.buildEnhancedNestingTree(allNodes);
        } else {
            this.rootNodes = [];
        }

        // 10. Определение типов (отверстия/внешние)
        if (this.rootNodes.length > 0) {
            this.determineContourTypes();
        }

        // 11. Сохранение в структуры данных
        this.updateDataStructures(allNodes);

        this.figureCacheTimestamp = now;
        return this.getAllFiguresFlat();
    }

    // Обновление списка разбитых элементов
    updateBrokenElements(autoContours) {
        this.brokenElements.clear();
        
        autoContours.forEach(contour => {
            if (contour.elements) {
                contour.elements.forEach(element => {
                    // Проверяем, является ли элемент замкнутым контуром, который был разбит
                    if (this.isSketchElementClosed(element)) {
                        this.brokenElements.add(element);

                    }
                });
            }
        });
        
        console.log("Разбитых элементов:", this.brokenElements.size);
    }



    // Фильтрация разбитых контуров
    filterBrokenContours(simpleContours) {
        if (this.brokenElements.size === 0) return simpleContours;
        
        const filtered = simpleContours.filter(contour => {
            // Если у контура есть элемент и он в списке разбитых - исключаем
            if (contour.element && this.brokenElements.has(contour.element)) {
                console.log("Исключаем разбитый контур:", contour.type, "площадь:", contour.area);
                return false;
            }
            
            // Если у контура несколько элементов и все они разбиты - исключаем
            if (contour.elements && contour.elements.length > 0) {
                const allElementsBroken = contour.elements.every(element => 
                    this.brokenElements.has(element)
                );
                if (allElementsBroken) {
                    console.log("Исключаем разбитый составной контур:", contour.type, "площадь:", contour.area);
                    return false;
                }
            }
            
            return true;
        });
        
        return filtered;
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

            // Для линий и полилиний - особый случай
            if (elementType === 'line' || elementType === 'polyline') {
                // Для линии и полилинии проверяем, достаточно ли точек
                if (points.length < 2) return;

                // Проверяем, замкнута ли полилиния
                const isClosed = this.isSketchElementClosed(element);

                // Если элемент уже помечен как разбитый, не создаем для него простой контур
                if (this.brokenElements.has(element)) {
                    console.log("Пропускаем разбитый элемент при создании простого контура:", elementType);
                    return;
                }

                // Для незамкнутых линий/полилиний не создаем контуров
                if (!isClosed) {
                    return;
                }

                // Для замкнутых полилиний создаем контур
                const area = this.calculatePolygonArea(points);
                if (Math.abs(area) < 0.001) return; // Уменьшил порог для маленьких контуров

                const center = this.calculateContourCenter(points);
                const boundingBox = this.calculateBoundingBox(points);
                const isClockwise = area < 0;

                const elementPlane = this.getElementPlane(element);
                if (!elementPlane) return; // Пропускаем если не нашли плоскость

                contours.push({
                    element: element,
                    points: points,
                    area: Math.abs(area),
                    center: center,
                    boundingBox: boundingBox,
                    type: elementType,
                    isClosed: true,
                    isClockwise: isClockwise,
                    originalArea: area,
                    planeId: elementPlane.uuid, // Добавляем ID плоскости
                    plane: elementPlane // И объект плоскости
                   // isPolyline: true // Добавляем флаг
                });

                return; // Выходим, так как обработали линию/полилинию
            }

            // Оригинальная обработка для других типов элементов
            if (points.length < 3) return;

            // Проверяем, замкнут ли элемент
            const isClosed = this.isSketchElementClosed(element);
            if (!isClosed) return;

            // Если элемент уже помечен как разбитый, не создаем для него простой контур
            if (this.brokenElements.has(element)) {
                console.log("Пропускаем разбитый элемент при создании простого контура:", elementType);
                return;
            }

            const area = this.calculatePolygonArea(points);
            if (Math.abs(area) < 0.001) return; // Уменьшил порог

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
        console.log("=== FigureManager: поиск контуров из линий (группировка) ===");

        // Ищем линии, которые еще не включены в контуры
        const usedElementIds = new Set();
        simpleContours.forEach(contour => {
            if (contour.element) {
                usedElementIds.add(contour.element.uuid);
            }
        });

        const lines = allElements.filter(element => {
            const elementType = element.userData?.elementType;
            return elementType === 'line' && !usedElementIds.has(element.uuid);
        });

        console.log(`Найдено отдельных линий: ${lines.length}`);

        if (lines.length < 3) return [];

        // Собираем все точки всех линий
        const lineData = lines.map(line => {
            const points = this.getElementPoints(line);
            return {
                element: line,
                start: points[0],
                end: points[1],
                points: points
            };
        });

        // Пытаемся найти замкнутые контуры
        const contours = this.findClosedContoursFromLines(lineData);
        console.log(`Найдено контуров из линий: ${contours.length}`);

        return contours;
    }

    findClosedContoursFromLines(lineData) {
        if (lineData.length < 3) return [];

        const contours = [];
        const visitedLines = new Set();

        for (let i = 0; i < lineData.length; i++) {
            if (visitedLines.has(i)) continue;

            // Пытаемся построить контур, начиная с этой линии
            const contour = this.buildContourFromLine(i, lineData, visitedLines);
            if (contour && contour.points.length >= 3) {
                const area = this.calculatePolygonArea(contour.points);
                if (Math.abs(area) > 0.01) {
                    const center = this.calculateContourCenter(contour.points);
                    const boundingBox = this.calculateBoundingBox(contour.points);

                    // Определяем общую плоскость для всех элементов контура
                    const firstElement = contour.elements[0];
                    const commonPlane = this.getElementPlane(firstElement);

                    contours.push({
                        elements: contour.elements,
                        points: contour.points,
                        area: Math.abs(area),
                        center: center,
                        boundingBox: boundingBox,
                        type: 'line_contour',
                        isClosed: true,
                        isClockwise: area < 0,
                        planeId: commonPlane ? commonPlane.uuid : null,
                        plane: commonPlane
                    });
                }
            }
        }

        return contours;
    }

    buildContourFromLine(startIndex, lineData, visitedLines) {
        const startLine = lineData[startIndex];
        const elements = [startLine.element];
        const points = [];

        // Начинаем с начальной точки первой линии
        let currentPoint = startLine.start;
        let nextPoint = startLine.end;
        points.push(currentPoint.clone());
        points.push(nextPoint.clone());

        visitedLines.add(startIndex);

        // Пытаемся найти следующую линию, которая соединяется с текущей конечной точкой
        let foundNext = true;
        let iterations = 0;
        const maxIterations = 100; // Защита от бесконечного цикла

        while (foundNext && iterations < maxIterations) {
            foundNext = false;
            iterations++;

            // Ищем линию, которая начинается или заканчивается в nextPoint
            for (let j = 0; j < lineData.length; j++) {
                if (visitedLines.has(j)) continue;

                const line = lineData[j];
                const distanceToStart = this.getDistance(nextPoint, line.start);
                const distanceToEnd = this.getDistance(nextPoint, line.end);

                if (distanceToStart < 0.5) { // Допуск 0.5 мм
                    // Линия начинается в nextPoint
                    nextPoint = line.end;
                    points.push(nextPoint.clone());
                    elements.push(line.element);
                    visitedLines.add(j);
                    foundNext = true;
                    break;
                } else if (distanceToEnd < 0.5) {
                    // Линия заканчивается в nextPoint
                    nextPoint = line.start;
                    points.push(nextPoint.clone());
                    elements.push(line.element);
                    visitedLines.add(j);
                    foundNext = true;
                    break;
                }
            }

            // Проверяем, замкнулся ли контур
            if (this.getDistance(nextPoint, startLine.start) < 0.5) {
                // Контур замкнулся
                return { elements, points };
            }
        }

        // Контур не замкнулся
        return null;
    }

    getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    // Получение автоматических контуров
    getAutoContours() {
        return this.autoContours || [];
    }

    // Обновление автоматическими контурами с фильтрацией по плоскости
    updateWithAutoContours(contours, planeId = null) {
        console.log("=== FigureManager: обновление автоматическими контурами ===");
        console.log("Получено контуров:", contours.length);

        // Если указана плоскость, сохраняем ее ID в контурах
        if (planeId) {
            contours.forEach(contour => {
                contour.planeId = planeId;
            });
        }

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
        if (!element.userData) {
            console.warn("Элемент не имеет userData");
            return [];
        }

        // 1. Пробуем получить точки из userData.localPoints
        if (element.userData.localPoints && element.userData.localPoints.length > 0) {
            console.log("Получаем точки из userData.localPoints для", element.userData.elementType,
                       "количество точек:", element.userData.localPoints.length);
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

            console.log("Получаем точки из geometry для", element.userData.elementType,
                       "количество точек:", points.length);
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

            return true;
        }

        // Для линии всегда возвращаем false (линия не может быть замкнутой)
        if (type === 'line') {
            return false;
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

    // В класс FigureManager добавьте:
    getContourPlane(contour) {
        if (contour.planeId) {
            // Ищем плоскость по ID среди всех плоскостей
            const allPlanes = [
                ...(this.editor.sketchPlanes || []),
                ...(this.editor.workPlanes || [])
            ];
            return allPlanes.find(p => p.uuid === contour.planeId) || null;
        }

        if (contour.element) {
            // Получаем плоскость элемента
            return this.getElementPlane(contour.element);
        }

        return null;
    }

    // В FigureManager добавьте метод:
    getElementPlane(element) {
        if (!element) return null;

        // Поднимаемся по иерархии, пока не найдем плоскость
        let parent = element.parent;
        while (parent) {
            if (parent.userData &&
                (parent.userData.type === 'sketch_plane' ||
                 parent.userData.type === 'work_plane')) {
                return parent;
            }
            parent = parent.parent;
        }

        // Если не нашли, возвращаем первую доступную плоскость
        const sketchPlanes = this.editor.sketchPlanes || [];
        const workPlanes = this.editor.workPlanes || [];

        if (sketchPlanes.length > 0) return sketchPlanes[0];
        if (workPlanes.length > 0) return workPlanes[0];

        return null;
    }

    areAllFiguresOnSamePlane(figures) {
        if (figures.length < 2) return true;

        const firstFigure = figures[0];
        const firstPlane = this.getFigurePlane(firstFigure);

        if (!firstPlane) {
            console.log("У первой фигуры нет плоскости");
            return false;
        }

        for (let i = 1; i < figures.length; i++) {
            const figure = figures[i];
            const plane = this.getFigurePlane(figure);

            if (!plane) {
                console.log(`У фигуры ${figure.id} нет плоскости`);
                return false;
            }

            // Сравниваем ID плоскостей
            if (plane.uuid !== firstPlane.uuid) {
                console.log(`Разные плоскости: ${firstPlane.uuid} vs ${plane.uuid}`);
                return false;
            }
        }

        return true;
    }


    isContourInside(innerContour, outerContour) {
        const innerPoints = innerContour.points || [];
        const outerPoints = outerContour.points || [];

        if (innerPoints.length === 0 || outerPoints.length === 0) return false;

        // ВАЖНО: Проверяем, что контуры на одной плоскости
        const innerPlane = this.getContourPlane(innerContour);
        const outerPlane = this.getContourPlane(outerContour);

        // Если не можем определить плоскость или плоскости разные - не считаем вложенными
        if (!innerPlane || !outerPlane || innerPlane.uuid !== outerPlane.uuid) {
            return false;
        }

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

        // Фильтруем узлы, исключая те, которые созданы из разбитых элементов
        const validNodes = nodes.filter(node => {
            // Проверяем, не был ли элемент разбит
            if (node.element && this.brokenElements.has(node.element)) {
                return false;
            }
            
            // Проверяем, не все ли элементы узла разбиты
            if (node.elementIds && node.elementIds.size > 0) {
                const allElementsBroken = Array.from(node.elementIds).every(id => {
                    const element = this.findElementById(id);
                    return element && this.brokenElements.has(element);
                });
                if (allElementsBroken) {
                    return false;
                }
            }
            
            return true;
        });

        return validNodes.map(node => this.nodeToFigure(node));
    }

    findElementById(elementId) {
        // Ищем элемент в сцене по UUID
        let foundElement = null;
        
        const searchInObject = (object) => {
            if (object.uuid === elementId) {
                foundElement = object;
                return true;
            }
            
            if (object.children && object.children.length > 0) {
                for (const child of object.children) {
                    if (searchInObject(child)) {
                        return true;
                    }
                }
            }
            
            return false;
        };
        
        searchInObject(this.editor.scene);
        return foundElement;
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
