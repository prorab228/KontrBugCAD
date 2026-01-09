// FigureManager.js - полная исправленная версия
class FigureNode {
    constructor(contour) {
        this.id = `figure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.contour = contour;
        this.parent = null;
        this.children = [];
        this.depth = 0;
        this.isHole = false;
        this.isOuter = true;
        this.area = contour.area || 0;
        this.boundingBox = contour.boundingBox;
        this.center = contour.center;
        this.elementIds = new Set();
        this.element = contour.element || (contour.elements ? contour.elements[0] : null);
        
        if (contour.element) {
            this.elementIds.add(contour.element.uuid);
        } else if (contour.elements) {
            contour.elements.forEach(el => this.elementIds.add(el.uuid));
        }
        
        this.type = contour.type || 'unknown';
        this.isClosed = contour.isClosed || false;
        this.isClockwise = contour.isClockwise || false;
    }
    
    addChild(childNode) {
        if (!this.children.includes(childNode)) {
            this.children.push(childNode);
            childNode.parent = this;
            childNode.depth = this.depth + 1;
            return true;
        }
        return false;
    }
    
    removeChild(childNode) {
        const index = this.children.indexOf(childNode);
        if (index > -1) {
            this.children.splice(index, 1);
            childNode.parent = null;
            childNode.depth = 0;
            return true;
        }
        return false;
    }
    
    getAllDescendants() {
        const descendants = [];
        const traverse = (node) => {
            node.children.forEach(child => {
                descendants.push(child);
                traverse(child);
            });
        };
        traverse(this);
        return descendants;
    }
    
    getHoleDescendants() {
        return this.getAllDescendants().filter(node => node.isHole);
    }
    
    getOuterDescendants() {
        return this.getAllDescendants().filter(node => !node.isHole);
    }
    
    getImmediateHoles() {
        return this.children.filter(child => child.isHole);
    }
    
    getImmediateOuters() {
        return this.children.filter(child => !child.isHole);
    }
    
    isAncestorOf(node) {
        let current = node;
        while (current) {
            if (current === this) return true;
            current = current.parent;
        }
        return false;
    }
    
    isDescendantOf(node) {
        return node.isAncestorOf(this);
    }
    
    getPathToRoot() {
        const path = [];
        let current = this;
        while (current) {
            path.unshift(current);
            current = current.parent;
        }
        return path;
    }
    
    getNestingLevel() {
        return this.depth;
    }
    
    toString() {
        const type = this.isHole ? "HOLE" : "OUTER";
        return `${type}[depth=${this.depth}, area=${this.area.toFixed(2)}, children=${this.children.length}]`;
    }
}

class FigureManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.figureTree = new Map();
        this.rootNodes = [];
        this.elementToNodes = new Map();
        this.figureCacheTimestamp = 0;
        console.log("FigureManager (Tree Version): создан");
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
        const allElements = this.editor.objectsManager.getAllSketchElements();
        console.log("FigureManager: найдено элементов:", allElements.length);

        // 2. Группировка элементов
        const elementGroups = this.groupArcElements(allElements);
        console.log("FigureManager: сгруппировано в:", elementGroups.length, "групп");

        // 3. Сбор простых контуров
        const simpleContours = this.collectSimpleContours(elementGroups);
        console.log("FigureManager: простых контуров:", simpleContours.length);

        // 4. Сбор контуров из линий
        const lineContours = this.collectLineContours(allElements, simpleContours);
        console.log("FigureManager: контуров из линий:", lineContours.length);

        // 5. Объединение всех контуров
        const allContours = [...simpleContours, ...lineContours];
        console.log("FigureManager: всего контуров:", allContours.length);

        // 6. Создание узлов
        const allNodes = allContours.map(contour => new FigureNode(contour));
        console.log("FigureManager: создано узлов:", allNodes.length);

        // 7. Построение дерева вложенности (исправленный алгоритм)
        this.buildEnhancedNestingTree(allNodes);

        // 8. Определение типов (отверстия/внешние)
        this.determineContourTypes();

        // 9. Сохранение в структуры данных
        this.updateDataStructures(allNodes);

        // 10. Дебаг вывод
        this.debugPrintTree();

        this.figureCacheTimestamp = now;
        return this.getAllFiguresFlat();
    }

    // ========== УЛУЧШЕННОЕ ПОСТРОЕНИЕ ДЕРЕВА ==========

    buildEnhancedNestingTree(nodes) {
        console.log("=== FigureManager: строим улучшенное дерево вложенности ===");
        
        // Очищаем все связи
        nodes.forEach(node => {
            node.parent = null;
            node.children = [];
            node.depth = 0;
        });
        
        // Сортируем по площади (от большей к меньшей)
        const sortedNodes = [...nodes].sort((a, b) => b.area - a.area);
        console.log(`Сортировка: ${sortedNodes.length} узлов, самый большой: ${sortedNodes[0]?.area.toFixed(2)}, самый маленький: ${sortedNodes[sortedNodes.length-1]?.area.toFixed(2)}`);
        
        // Для каждого узла ищем всех возможных родителей
        for (let i = 0; i < sortedNodes.length; i++) {
            const currentNode = sortedNodes[i];
            
            const possibleParents = [];
            
            // Ищем всех возможных родителей (узлы, которые содержат текущий узел)
            for (let j = 0; j < i; j++) {
                const potentialParent = sortedNodes[j];
                
                // Быстрая проверка по bounding box
                if (!this.isBoundingBoxInside(currentNode.boundingBox, potentialParent.boundingBox)) {
                    continue;
                }
                
                // Полная проверка вложенности
                const isInside = this.isContourCompletelyInside(currentNode.contour, potentialParent.contour);
                
                if (isInside) {
                    // Проверяем, не пересекается ли с другими детьми этого родителя
                    let hasIntersection = false;
                    for (const sibling of potentialParent.children) {
                        if (this.doContoursIntersect(currentNode.contour, sibling.contour)) {
                            hasIntersection = true;
                            break;
                        }
                    }
                    
                    if (!hasIntersection) {
                        possibleParents.push(potentialParent);
                    }
                }
            }
            
            // Выбираем ближайшего родителя (самого маленького по площади)
            if (possibleParents.length > 0) {
                possibleParents.sort((a, b) => a.area - b.area);
                const bestParent = possibleParents[0];
                
                bestParent.addChild(currentNode);
            }
        }
        
        // Находим корневые узлы
        this.rootNodes = sortedNodes.filter(node => node.parent === null);
        
        // Обновляем глубины
        this.updateDepthsRecursively();
        
        console.log(`Построено дерево: ${this.rootNodes.length} корневых узлов, всего узлов: ${sortedNodes.length}`);
    }

    updateDepthsRecursively() {
        const updateDepth = (node, depth) => {
            node.depth = depth;
            node.children.forEach(child => updateDepth(child, depth + 1));
        };
        
        this.rootNodes.forEach(root => updateDepth(root, 0));
    }

    // ========== ГЕОМЕТРИЧЕСКИЕ МЕТОДЫ ==========

    isContourCompletelyInside(innerContour, outerContour) {
        const innerPoints = innerContour.points || [];
        const outerPoints = outerContour.points || [];

        if (innerPoints.length < 3 || outerPoints.length < 3) {
            return false;
        }

        // Проверяем все точки внутреннего контура
        for (let k = 0; k < innerPoints.length; k++) {
            const point = innerPoints[k];
            if (!this.isPointInsidePolygon(point, outerPoints)) {
                return false;
            }
        }

        // Также проверяем, что контуры не пересекаются
        if (this.doContoursIntersect(innerContour, outerContour)) {
            return false;
        }

        return true;
    }

    isBoundingBoxInside(innerBox, outerBox) {
        if (!innerBox || !outerBox) return false;
        return (
            innerBox.min.x >= outerBox.min.x &&
            innerBox.min.y >= outerBox.min.y &&
            innerBox.max.x <= outerBox.max.x &&
            innerBox.max.y <= outerBox.max.y
        );
    }

    doContoursIntersect(contour1, contour2) {
        const points1 = contour1.points || [];
        const points2 = contour2.points || [];
        
        if (points1.length < 2 || points2.length < 2) return false;
        
        // Упрощенная проверка: если bounding box не пересекаются, то и контуры не пересекаются
        if (this.boundingBoxesDontIntersect(contour1, contour2)) {
            return false;
        }
        
        // Проверяем все сегменты
        for (let i = 0; i < points1.length; i++) {
            const p1 = points1[i];
            const p2 = points1[(i + 1) % points1.length];
            
            for (let j = 0; j < points2.length; j++) {
                const p3 = points2[j];
                const p4 = points2[(j + 1) % points2.length];
                
                if (this.doLineSegmentsIntersect(p1, p2, p3, p4)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    boundingBoxesDontIntersect(contour1, contour2) {
        const box1 = contour1.boundingBox;
        const box2 = contour2.boundingBox;
        
        if (!box1 || !box2) return false;
        
        return (
            box1.max.x < box2.min.x ||
            box1.min.x > box2.max.x ||
            box1.max.y < box2.min.y ||
            box1.min.y > box2.max.y
        );
    }

    doLineSegmentsIntersect(p1, p2, p3, p4) {
        // Функция для вычисления ориентации тройки точек
        const orientation = (a, b, c) => {
            const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
            if (Math.abs(val) < 0.001) return 0; // Колинеарны
            return val > 0 ? 1 : 2; // По часовой или против
        };
        
        const onSegment = (a, b, c) => {
            return Math.min(a.x, c.x) <= b.x && b.x <= Math.max(a.x, c.x) &&
                   Math.min(a.y, c.y) <= b.y && b.y <= Math.max(a.y, c.y);
        };
        
        const o1 = orientation(p1, p2, p3);
        const o2 = orientation(p1, p2, p4);
        const o3 = orientation(p3, p4, p1);
        const o4 = orientation(p3, p4, p2);
        
        // Общий случай
        if (o1 !== o2 && o3 !== o4) return true;
        
        // Специальные случаи колинеарности
        if (o1 === 0 && onSegment(p1, p3, p2)) return true;
        if (o2 === 0 && onSegment(p1, p4, p2)) return true;
        if (o3 === 0 && onSegment(p3, p1, p4)) return true;
        if (o4 === 0 && onSegment(p3, p2, p4)) return true;
        
        return false;
    }

    isPointInsidePolygon(point, polygon) {
        if (!polygon || polygon.length < 3) return false;

        let inside = false;
        const x = point.x;
        const y = point.y;
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;
            
            // Проверка пересечения луча с ребром полигона
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                
            if (intersect) {
                inside = !inside;
            }
        }
        
        return inside;
    }

    // ========== ОПРЕДЕЛЕНИЕ ТИПОВ КОНТУРОВ ==========

    determineContourTypes() {
        console.log("=== FigureManager: определяем типы контуров ===");
        
        const determineNode = (node) => {
            // Правило CAD: чередование внешний/отверстие
            node.isHole = (node.depth % 2 === 1);
            node.isOuter = !node.isHole;
            
            if (node.isHole) {
                console.log(`  Узел ${node.id.substr(0, 8)}: глубина ${node.depth} -> ОТВЕРСТИЕ`);
            } else {
                console.log(`  Узел ${node.id.substr(0, 8)}: глубина ${node.depth} -> ВНЕШНИЙ`);
            }
            
            node.children.forEach(determineNode);
        };
        
        this.rootNodes.forEach(determineNode);
    }

    // ========== ОБНОВЛЕНИЕ СТРУКТУР ДАННЫХ ==========

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
        
        this.elementToNodes.forEach((nodes, elementId) => {
            nodes.sort((a, b) => a.depth - b.depth);
        });
    }

    // ========== МЕТОДЫ ДЛЯ ВЫТЯГИВАНИЯ ==========

    getFiguresForExtrusionWithHierarchy(selectedFigureIds) {
        const result = [];
        const processedNodes = new Set();

        console.log("=== FigureManager.getFiguresForExtrusionWithHierarchy ===");
        console.log("Выбранные ID:", Array.from(selectedFigureIds));

        // Обрабатываем выбранные фигуры
        for (const figureId of selectedFigureIds) {
            const node = this.getNodeById(figureId);
            if (!node || processedNodes.has(node)) continue;

            console.log(`Обработка узла ${node.id.substring(0, 8)}: isHole=${node.isHole}, depth=${node.depth}, children=${node.children.length}`);

            // Для любого узла (внешнего или отверстия) собираем фигуру
            const extrusionFigure = this.getExtrusionFigureForNode(node);
            result.push(extrusionFigure);
            processedNodes.add(node);

            console.log(`  Добавлена фигура ${node.isHole ? '(отверстие)' : '(внешний)'} с ${extrusionFigure.holes.length} отверстиями`);
        }

        console.log(`Итого фигур для вытягивания: ${result.length}`);
        return result;
    }


    getExtrusionFigureForNode(node) {
        let holes = [];

        if (node.isHole) {
            // Для отверстия: его отверстия - это его непосредственные ВНЕШНИЕ дети
            holes = node.children
                .filter(child => !child.isHole)
                .map(child => child.contour);
        } else {
            // Для внешнего контура: его отверстия - это его непосредственные ОТВЕРСТИЯ
            holes = node.children
                .filter(child => child.isHole)
                .map(child => child.contour);
        }

        return {
            id: node.id,
            outer: node.contour,
            holes: holes,
            area: node.area,
            isHole: node.isHole,
            isOuter: !node.isHole,
            depth: node.depth,
            elementIds: node.elementIds,
            element: node.element,
            node: node
        };
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

    findNodeByHoleContour(holeContour) {
        return this.findNodeByContour(holeContour);
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

    // ========== ДЕБАГ И ЛОГИРОВАНИЕ ==========

    debugPrintTree() {
        console.log("\n=== ДЕРЕВО ФИГУР (иерархия) ===");
        
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
            
            if (node.boundingBox) {
                const min = node.boundingBox.min;
                const max = node.boundingBox.max;
                console.log(`${indent}  BBox: (${min.x.toFixed(1)},${min.y.toFixed(1)}) -> (${max.x.toFixed(1)},${max.y.toFixed(1)})`);
            }
            
            if (node.center) {
                console.log(`${indent}  Центр: (${node.center.x.toFixed(1)},${node.center.y.toFixed(1)})`);
            }
            
            node.children.forEach(child => printNode(child, indent + "  "));
        };
        
        this.rootNodes.forEach((root, i) => {
            console.log(`\nКорень ${i + 1}:`);
            printNode(root);
        });
        
        console.log("\n=== КОНЕЦ ДЕРЕВА ===");
        
        // Статистика
        const allNodes = Array.from(this.figureTree.values());
        const holes = allNodes.filter(n => n.isHole).length;
        const outers = allNodes.filter(n => !n.isHole).length;
        const maxDepth = Math.max(...allNodes.map(n => n.depth));
        
        console.log(`\nСтатистика:`);
        console.log(`  Всего узлов: ${allNodes.length}`);
        console.log(`  Внешних контуров: ${outers}`);
        console.log(`  Отверстий: ${holes}`);
        console.log(`  Корневых узлов: ${this.rootNodes.length}`);
        console.log(`  Макс. глубина вложенности: ${maxDepth}`);
        
        // Подсчет детей для каждого узла
        const nodesWithChildren = allNodes.filter(n => n.children.length > 0);
        nodesWithChildren.forEach(node => {
            const holesCount = node.getImmediateHoles().length;
            const outersCount = node.getImmediateOuters().length;
            console.log(`  Узел ${node.id.substring(0, 8)}: ${holesCount} отверстий, ${outersCount} внешних детей`);
        });
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

    groupArcElements(allElements) {
        const groups = [];
        const processed = new Set();

        const arcsAndCircles = allElements.filter(el =>
            el.userData.elementType === 'arc' ||
            el.userData.elementType === 'circle' ||
            (el.userData.elementType === 'polyline' && this.isArcLike(el))
        );

        for (let i = 0; i < arcsAndCircles.length; i++) {
            if (processed.has(arcsAndCircles[i])) continue;

            const element = arcsAndCircles[i];
            const group = [element];
            processed.add(element);

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

            const center1 = this.getArcCenter(element);
            const radius1 = this.getArcRadius(element);

            if (!center1 || radius1 === null) continue;

            for (let j = i + 1; j < arcsAndCircles.length; j++) {
                if (processed.has(arcsAndCircles[j])) continue;

                const otherElement = arcsAndCircles[j];
                const center2 = this.getArcCenter(otherElement);
                const radius2 = this.getArcRadius(otherElement);

                if (!center2 || radius2 === null) continue;

                const distance = Math.sqrt(
                    Math.pow(center2.x - center1.x, 2) +
                    Math.pow(center2.y - center1.y, 2)
                );

                if (distance < 0.1 && Math.abs(radius2 - radius1) < 0.1) {
                    group.push(otherElement);
                    processed.add(otherElement);
                }
            }

            if (group.length >= 2) {
                const isFullCircle = this.checkIfFullCircle(group);
                groups.push({
                    type: 'arc_group',
                    elements: group,
                    center: center1,
                    radius: radius1,
                    isFullCircle: isFullCircle
                });
            }
        }

        allElements.forEach(el => {
            if (!processed.has(el) && el.userData.elementType !== 'arc') {
                groups.push({
                    type: 'single',
                    elements: [el]
                });
            }
        });

        return groups;
    }

    collectSimpleContours(elementGroups) {
        const contours = [];

        elementGroups.forEach(group => {
            const elements = group.elements;

            if (elements.length === 1) {
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
                            originalArea: area,
                            isClosed: true
                        });
                    }
                }
            } else if (group.type === 'circle' || (group.type === 'arc_group' && group.isFullCircle)) {
                const center = group.center;
                const radius = group.radius;

                if (center && radius) {
                    // Увеличиваем количество сегментов для лучшей точности
                    const points = [];
                    const segments = 64;
                    for (let i = 0; i < segments; i++) {
                        const angle = (i / segments) * Math.PI * 2;
                        points.push(new THREE.Vector2(
                            center.x + radius * Math.cos(angle),
                            center.y + radius * Math.sin(angle)
                        ));
                    }

                    const area = Math.PI * radius * radius;
                    const isClockwise = false;

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
                }
            }
        });

        return contours;
    }

    collectLineContours(allElements, simpleContours) {
        const usedElementIds = new Set();
        simpleContours.forEach(contour => {
            if (contour.element) {
                usedElementIds.add(contour.element.uuid);
            } else if (contour.elements) {
                contour.elements.forEach(el => usedElementIds.add(el.uuid));
            }
        });

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
                    originalArea: area
                });
            }
        });

        return contours;
    }

    isArcLike(element) {
        if (!element.userData || !element.geometry) return false;
        const points = this.getElementPoints(element);
        if (points.length < 3) return false;
        const center = this.calculateContourCenter(points);
        const distances = points.map(p => {
            const dx = p.x - center.x;
            const dy = p.y - center.y;
            return Math.sqrt(dx * dx + dy * dy);
        });
        const avgDistance = distances.reduce((a, b) => a + b) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;
        return variance < 1.0;
    }

    getArcCenter(element) {
        if (!element.userData) return null;
        if (element.userData.center) {
            return new THREE.Vector2(
                element.userData.center.x,
                element.userData.center.y
            );
        }
        if (element.userData.cx !== undefined && element.userData.cy !== undefined) {
            return new THREE.Vector2(element.userData.cx, element.userData.cy);
        }
        const points = this.getElementPoints(element);
        if (points.length >= 3) {
            return this.calculateContourCenter(points);
        }
        return null;
    }

    getArcRadius(element) {
        if (!element.userData) return null;
        if (element.userData.radius !== undefined) return element.userData.radius;
        if (element.userData.r !== undefined) return element.userData.r;
        if (element.userData.width && element.userData.height) {
            return Math.max(element.userData.width, element.userData.height) / 2;
        }
        const points = this.getElementPoints(element);
        if (points.length >= 2) {
            const center = this.getArcCenter(element);
            if (center) {
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
        for (const arc of arcs) {
            if (arc.userData.elementType === 'circle') return true;
        }
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
        const coverage = new Array(360).fill(false);
        angles.forEach(angle => {
            let startDeg = Math.round(angle.start * 180 / Math.PI);
            let endDeg = Math.round(angle.end * 180 / Math.PI);
            if (startDeg < 0) startDeg += 360;
            if (endDeg < 0) endDeg += 360;
            if (startDeg <= endDeg) {
                for (let i = startDeg; i <= endDeg; i++) coverage[i] = true;
            } else {
                for (let i = startDeg; i < 360; i++) coverage[i] = true;
                for (let i = 0; i <= endDeg; i++) coverage[i] = true;
            }
        });
        const coveredCount = coverage.filter(v => v).length;
        return coveredCount >= 350;
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

    isSketchElementClosed(element) {
        if (!element || !element.userData) return false;
        if (element.userData.isClosed !== undefined) return element.userData.isClosed === true;
        const type = element.userData.elementType;
        if (type === 'rectangle' || type === 'circle' ||
            type === 'polygon' || type === 'oval' ||
            type === 'stadium' || type === 'arc') return true;
        if (type === 'line') return false;
        if (type === 'polyline') {
            if (!element.geometry || !element.geometry.attributes.position) return false;
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

    // ========== МЕТОДЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ ==========

    findFigureByHoleContour(holeContour) {
        const node = this.findNodeByContour(holeContour);
        return node ? this.nodeToFigure(node) : null;
    }

    getAllFigures() {
        return this.getAllFiguresFlat();
    }
}