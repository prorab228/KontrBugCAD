// ExtrudeManager.js - полная версия, совместимая с древовидной структурой FigureManager
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

        // Если это отверстие, нужно проверить, не было ли оно исключено из родителя
        if (figure.isHole) {
            const parentId = this.findParentIdForSelected(figure);
            if (parentId && this.excludedHoles.get(parentId)?.has(figureId)) {
                // Если отверстие было исключено из родителя, возвращаем его
                console.log("Возвращаем отверстие в родительскую фигуру");
                this.toggleHoleExclusion(parentId, figureId);
            }
        }

        this.removeFigureFromSelection(figure);
    } else {
        console.log("Добавляем фигуру в выделение");
        this.addFigureToSelection(figure);
    }
}


    addFigureToSelection(figure) {
    console.log("=== addFigureToSelection ===");
    const figureId = figure.id;

    // Проверяем, не является ли эта фигура дочерней для уже выбранной
    const isChildOfSelected = this.isChildOfAnySelected(figure);

    if (isChildOfSelected && figure.isHole) {
        // Для отверстия внутри выбранного родителя у нас есть два варианта:
        // 1. Исключить его из родительской фигуры (по умолчанию)
        // 2. Добавить как отдельную фигуру для вытягивания

        // ВАЖНОЕ ИЗМЕНЕНИЕ: При клике на отверстие, которое является дочерним
        // для выбранной фигуры, мы ДОБАВЛЯЕМ его как отдельную фигуру,
        // а не только исключаем из родителя

        console.log("Добавляем отверстие как отдельную фигуру для вытягивания");
        this.selectedFigureIds.add(figureId);
        this.highlightFigure(figure, 0x4CAF50);

        // Но также отмечаем, что оно исключено из родительской фигуры
        const parentId = this.findParentIdForSelected(figure);
        if (parentId) {
            console.log("И отмечаем как исключенное из родительской фигуры");
            this.toggleHoleExclusion(parentId, figureId);
        }
    } else if (isChildOfSelected && !figure.isHole) {
        // Для внешнего контура внутри выбранного родителя - добавляем как отдельную фигуру
        console.log("Добавляем внешний дочерний контур как отдельную фигуру");
        this.selectedFigureIds.add(figureId);
        this.highlightFigure(figure, 0x0066FF);
    } else {
        // Обычное добавление
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
// Проверяем, является ли фигура дочерней для любой выбранной фигуры
isChildOfAnySelected(figure) {
    for (const selectedId of this.selectedFigureIds) {
        const selectedFigure = this.figureManager.getFigureById(selectedId);
        if (selectedFigure && selectedFigure.childrenIds.includes(figure.id)) {
            return true;
        }
    }
    return false;
}

// Находим ID родителя для фигуры среди выбранных
findParentIdForSelected(figure) {
    for (const selectedId of this.selectedFigureIds) {
        const selectedFigure = this.figureManager.getFigureById(selectedId);
        if (selectedFigure && selectedFigure.childrenIds.includes(figure.id)) {
            return selectedId;
        }
    }
    return null;
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
    const processedNodes = new Set();
    const selectedNodes = [];

    console.log("=== getFiguresForExtrusion (улучшенная версия) ===");
    console.log("Выделенные фигуры:", Array.from(this.selectedFigureIds));

    // Сначала собираем все выбранные узлы
    for (const figureId of this.selectedFigureIds) {
        const node = this.figureManager.getNodeById(figureId);
        if (node) {
            selectedNodes.push(node);
            console.log(`  Выбран узел: ${node.id.substring(0,8)} - isHole: ${node.isHole}, depth: ${node.depth}`);
        }
    }

    // Сортируем по глубине (от меньшей к большей)
    selectedNodes.sort((a, b) => a.depth - b.depth);

    // Для каждого выбранного узла
    for (const node of selectedNodes) {
        if (processedNodes.has(node)) continue;

        console.log(`\nОбработка узла ${node.id.substring(0, 8)}: isHole=${node.isHole}, depth=${node.depth}`);

        if (node.isHole) {
            console.log(`  Вытягиваем отверстие отдельно как выступ`);
            const excludedHoles = this.excludedHoles.get(node.id) || new Set();
            const holes = this.collectHolesForHoleNode(node);
            const filteredHoles = holes.filter(hole => {
                const holeNode = this.figureManager.findNodeByContour(hole);
                return holeNode && !excludedHoles.has(holeNode.id);
            });

            result.push({
                id: node.id,
                outer: node.contour,
                holes: filteredHoles,
                area: node.area,
                isHole: true,
                isOuter: false,
                depth: node.depth,
                elementIds: node.elementIds,
                element: node.element,
                node: node
            });

            console.log(`  Добавлено отверстие с ${filteredHoles.length} отверстиями внутри`);
        } else {
            // Для внешнего контура
            console.log(`  Вытягиваем внешний контур`);
            const allHoles = this.collectAllHolesForSelectedOuter(node, selectedNodes, processedNodes);
            const excludedHoles = this.excludedHoles.get(node.id) || new Set();
            const filteredHoles = allHoles.filter(hole => {
                const holeNode = this.figureManager.findNodeByContour(hole);
                return holeNode && !excludedHoles.has(holeNode.id);
            });

            result.push({
                id: node.id,
                outer: node.contour,
                holes: filteredHoles,
                area: node.area,
                isHole: false,
                isOuter: true,
                depth: node.depth,
                elementIds: node.elementIds,
                element: node.element,
                node: node
            });

            console.log(`  Добавлен внешний контур с ${filteredHoles.length} отверстиями`);

            // Помечаем всех выбранных потомков как обработанные
            this.markSelectedDescendantsAsProcessed(node, selectedNodes, processedNodes);
        }

        processedNodes.add(node);
    }

    console.log("\nИтого фигур для вытягивания:", result.length);
    return result;
}

// Собираем все отверстия для выбранного внешнего узла
// Собираем все отверстия для выбранного внешнего узла
collectAllHolesForSelectedOuter(outerNode, selectedNodes, processedNodes) {
    console.log(`  collectAllHolesForSelectedOuter для ${outerNode.id.substring(0,8)}`);
    const allHoles = new Set();

    // 1. Добавляем только непосредственные отверстия, которые НЕ выбраны
    outerNode.children.forEach(child => {
        if (child.isHole && !selectedNodes.includes(child)) {
            console.log(`    Добавляем непосредственное отверстие: ${child.id.substring(0,8)}`);
            allHoles.add(child.contour);

            // НЕ добавляем внуков отверстия (например, маленький круг)
            // Они должны обрабатываться только если выбрано само отверстие
        }
    });

    // 2. Для выбранных отверстий: добавляем их внешних детей как отверстия
    // (но только если эти внешние дети не выбраны отдельно)
    outerNode.children.forEach(child => {
        if (child.isHole && selectedNodes.includes(child)) {
            console.log(`    Обработка выбранного отверстия: ${child.id.substring(0,8)}`);

            // Для выбранного отверстия, его внешние дети становятся отверстиями
            child.children.forEach(grandChild => {
                if (!grandChild.isHole && !selectedNodes.includes(grandChild)) {
                    console.log(`      Внешний ребенок выбранного отверстия -> отверстие: ${grandChild.id.substring(0,8)}`);
                    allHoles.add(grandChild.contour);
                }
            });
        }
    });

    console.log(`    Всего отверстий собрано: ${allHoles.size}`);
    return Array.from(allHoles);
}

// Собираем отверстия для узла-отверстия (когда он вытягивается отдельно)
collectHolesForHoleNode(holeNode) {
    const holes = [];

    // Для отверстия: его отверстия - это его непосредственные ВНЕШНИЕ дети
    holeNode.children.forEach(child => {
        if (!child.isHole) {
            holes.push(child.contour);
        }
    });

    return holes;
}
// Помечаем всех выбранных потомков как обработанные
markSelectedDescendantsAsProcessed(node, selectedNodes, processedNodes) {
    node.children.forEach(child => {
        if (selectedNodes.includes(child) && !processedNodes.has(child)) {
            processedNodes.add(child);
            this.markSelectedDescendantsAsProcessed(child, selectedNodes, processedNodes);
        }
    });
}




    // ДОБАВЬТЕ НОВЫЙ МЕТОД В EXTRUDEMANAGER:

    // Получить фигуру для вытягивания из узла с учетом иерархии
    getExtrusionFigureForNode(node) {
    let holes = [];

    if (node.isHole) {
        // Для отверстия: собираем все непосредственные ВНЕШНИЕ контуры (которые станут отверстиями в выступе)
        node.children.forEach(child => {
            if (!child.isHole) { // Внешний контур внутри отверстия
                holes.push(child.contour);
            }
        });
        console.log(`  Узел-отверстие ${node.id.substring(0, 8)}: ${node.children.length} детей, ${holes.length} будут отверстиями в выступе`);
    } else {
        // Для внешнего контура: собираем все непосредственные ОТВЕРСТИЯ
        node.children.forEach(child => {
            if (child.isHole) { // Отверстие во внешнем контуре
                holes.push(child.contour);
            }
        });
        console.log(`  Внешний узел ${node.id.substring(0, 8)}: ${node.children.length} детей, ${holes.length} отверстий`);
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

   highlightFigure(figure, color) {
    console.log(`highlightFigure: фигура ${figure.id}, цвет ${color.toString(16)}`);

    if (figure.outer && figure.outer.element) {
        console.log(`  Подсвечиваем элемент ${figure.outer.element.uuid}`);
        this.editor.objectsManager.safeSetElementColor(figure.outer.element, color);
    } else if (figure.outer && figure.outer.elements) {
        figure.outer.elements.forEach(element => {
            console.log(`  Подсвечиваем элемент ${element.uuid} (из группы)`);
            this.editor.objectsManager.safeSetElementColor(element, color);
        });
    }

    // Подсвечиваем все отверстия фигуры
    if (figure.holes && figure.holes.length > 0) {
        console.log(`  Подсвечиваем ${figure.holes.length} отверстий`);
        figure.holes.forEach((hole, index) => {
            const holeNode = this.figureManager.findNodeByContour(hole);
            if (!holeNode) {
                console.warn(`  Не найден узел для отверстия ${index}`);
                return;
            }

            const excludedSet = this.excludedHoles.get(figure.id) || new Set();
            const isExcluded = excludedSet.has(holeNode.id);
            const holeColor = isExcluded ? 0x888888 : 0xFF9800;

            console.log(`  Отверстие ${index}: holeId=${holeNode.id}, исключено=${isExcluded}, цвет=${holeColor.toString(16)}`);

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

        if (holeFigure.outer && holeFigure.outer.element) {
            this.editor.objectsManager.safeSetElementColor(holeFigure.outer.element, color);
        } else if (holeFigure.outer && holeFigure.outer.elements) {
            holeFigure.outer.elements.forEach(element => {
                this.editor.objectsManager.safeSetElementColor(element, color);
            });
        }
    }

    unhighlightFigure(figure) {
        console.log(`unhighlightFigure: фигура ${figure.id}`);

        if (figure.outer && figure.outer.element) {
            this.editor.objectsManager.safeRestoreElementColor(figure.outer.element);
        } else if (figure.outer && figure.outer.elements) {
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

        if (figure.element) {
            element = figure.element;
        } else if (figure.outer && figure.outer.element) {
            element = figure.outer.element;
        } else if (figure.outer && figure.outer.elements && figure.outer.elements.length > 0) {
            element = figure.outer.elements[0];
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
            console.log(`Исправляем направление обхода: было ${isCurrentlyClockwise ? 'по часовой' : 'против часовой'}, нужно ${shouldBeClockwise ? 'по часовой' : 'против часовой'}, площадь=${area}`);
            return [...points].reverse();
        }

        return points;
    }

    createExtrusionGeometryFromFigures(figures, height, direction) {
        if (figures.length === 0 || !this.basePlane) return null;

        const shapes = [];

        figures.forEach(figure => {
            console.log(`Создание фигуры: ${figure.id}, isHole: ${figure.isHole}, глубина: ${figure.depth}, отверстий: ${figure.holes ? figure.holes.length : 0}`);

            const outerPoints = this.getFigurePointsForBasePlane(figure);
            if (outerPoints.length < 3) {
                console.log(`  Недостаточно точек: ${outerPoints.length}`);
                return;
            }

            // Определяем ориентацию на основе типа фигуры
            // Правило:
            // - Внешние контуры (isHole=false): против часовой стрелки (добавляют материал)
            // - Отверстия (isHole=true): по часовой стрелке (убирают материал), НО при вытягивании отдельного отверстия нужно инвертировать
            let shouldBeClockwise = figure.isHole;

            // Если это отверстие, вытягиваемое отдельно, оно должно стать выступом (инвертировать ориентацию)
            if (figure.isHole) {
                shouldBeClockwise = false; // Инвертируем, чтобы отверстие стало выступом
                console.log(`  Отверстие вытягивается отдельно - инвертируем ориентацию для создания выступа`);
            }

            const correctedOuterPoints = this.fixContourOrientation(outerPoints, shouldBeClockwise);

            const shape = new THREE.Shape(correctedOuterPoints.map(p => new THREE.Vector2(p.x, p.y)));

            // Добавляем отверстия
            if (figure.holes && figure.holes.length > 0) {
                figure.holes.forEach((hole, index) => {
                    const holePoints = this.getContourPointsForBasePlane(hole);
                    if (holePoints.length >= 3) {
                        // Отверстия всегда должны быть по часовой стрелке
                        const correctedHolePoints = this.fixContourOrientation(holePoints, true);
                        const holePath = new THREE.Path(correctedHolePoints.map(p => new THREE.Vector2(p.x, p.y)));
                        shape.holes.push(holePath);
                        console.log(`    Добавлено отверстие ${index}`);
                    }
                });
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
        const holeNode = this.figureManager.findNodeByHoleContour(contour);
        if (!holeNode) return contour.points || [];

        const figurePlane = this.getFigurePlane(holeNode);
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
//        if (direction === 'negative') {
//            offset = -height + 0.1;
//        } else if (direction === 'both') {
//            offset = -height / 2 + 0.1;
//        }

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
                obj.userData.type === 'sketch_element') {
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
            if (figure.outer && figure.outer.element) {
                this.editor.objectsManager.safeSetElementColor(figure.outer.element, 0x2196F3);
            } else if (figure.outer && figure.outer.elements) {
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