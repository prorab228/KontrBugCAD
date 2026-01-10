// ExtrudeManager.js - полная версия с историей и булевыми операциями
class ExtrudeManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.figureManager = cadEditor.objectsManager.figureManager;

        // Для предпросмотра
        this.extrudePreviewGroup = null;
        this.previewMaterial = null;

        // Выделение
        this.selectedFigures = new Map(); // id -> figure
        this.basePlane = null;

        // Для стрелки
        this.extrudeArrow = null;
        this.isDraggingArrow = false;
        this.arrowStartHeight = 0;
        this.startMouseY = 0;

        // Для подсветки
        this.hoveredFigure = null;
        this.hoveredColor = 0xFFFF00; // Желтый для наведения
        this.selectedColor = 0x0066FF; // Синий для выделения

        // Предотвращение двойного клика
        this.isProcessingClick = false;

        console.log("ExtrudeManager: создан (полная версия с историей)");
    }

    // === ОСНОВНЫЕ МЕТОДЫ ===

    initialize() {
        console.log("ExtrudeManager: инициализация");
        if (!this.figureManager) {
            console.error("ExtrudeManager: FigureManager не найден!");
            return;
        }
        this.figureManager.collectAllFigures();
    }

    // Обработка клика по фигуре
    handleFigureClick(event) {
        console.log("=== handleFigureClick ===");

        if (this.isProcessingClick) {
            return false;
        }

        this.isProcessingClick = true;

        try {
            const point = this.getPointOnPlane(event);
            if (!point) {
                console.log("Не удалось получить точку на плоскости");
                return false;
            }

            // Получаем все фигуры
            const allFigures = this.figureManager.getAllFigures();
            if (allFigures.length === 0) {
                console.log("Нет фигур для выбора");
                return false;
            }

            // Находим фигуру под курсором
            const figure = this.findFigureAtPoint(point, allFigures);
            if (!figure) {
                console.log("Не найдена фигура под курсором");
                return false;
            }

            console.log("Найдена фигура:", figure.id, "isHole:", figure.isHole,
                       "depth:", figure.depth, "children:", figure.childrenIds?.length || 0);

            // Переключаем выделение
            this.toggleSelection(figure);

            // Обновляем UI
            this.updateExtrudePreview();
            this.updateExtrudeUI();
            this.createExtrudeDirectionIndicator();

            return true;
        } finally {
            setTimeout(() => {
                this.isProcessingClick = false;
            }, 50);
        }
    }

    // Найти фигуру в точке
    findFigureAtPoint(point, figures) {
        // Сортируем по глубине (глубже сверху) и площади (маленькие сверху)
        const sorted = [...figures].sort((a, b) => {
            if (a.depth !== b.depth) return b.depth - a.depth; // Глубже сверху
            return a.area - b.area; // Меньше сверху
        });

        for (const figure of sorted) {
            if (!figure.outer || !figure.outer.points) continue;

            // Получаем плоскость фигуры
            const figurePlane = this.getFigurePlane(figure);
            if (!figurePlane) continue;

            // Преобразуем точку в локальные координаты
            const localPoint = figurePlane.worldToLocal(point.clone());
            const localPoint2D = new THREE.Vector2(localPoint.x, localPoint.y);

            // Проверяем попадание
            if (this.isPointInContour(localPoint2D, figure.outer.points)) {
                return figure;
            }
        }

        return null;
    }

    // Переключить выделение фигуры
    toggleSelection(figure) {
        const figureId = figure.id;

        if (this.selectedFigures.has(figureId)) {
            // Снимаем выделение
            this.selectedFigures.delete(figureId);
            this.unhighlightFigure(figure);

            // Если это был последний выделенный элемент, сбрасываем базовую плоскость
            if (this.selectedFigures.size === 0) {
                this.basePlane = null;
            }
        } else {
            // Добавляем выделение
            this.selectedFigures.set(figureId, figure);

            // Устанавливаем базовую плоскость, если еще не установлена
            if (!this.basePlane) {
                this.basePlane = this.getFigurePlane(figure);
                console.log("Установлена базовая плоскость:", this.basePlane?.uuid);
            }

            // Подсвечиваем синим
            this.highlightFigure(figure, this.selectedColor);
        }

        console.log("Выделено фигур:", this.selectedFigures.size);
    }

    // Получить фигуры для вытягивания (исправленная версия для вложенных фигур)
    getFiguresForExtrusion() {
        const result = [];
        const processedFigures = new Set();

        console.log("=== getFiguresForExtrusion ===");
        console.log("Выделено фигур:", this.selectedFigures.size);

        // Собираем все выделенные фигуры
        for (const figure of this.selectedFigures.values()) {
            if (processedFigures.has(figure.id)) continue;

            console.log(`Обрабатываем фигуру ${figure.id}: isHole=${figure.isHole}, depth=${figure.depth}`);

            // Собираем все отверстия этой фигуры (вложенность 1)
            const allHoles = this.getAllImmediateHoles(figure);
            console.log(`  Найдено отверстий вложенности 1: ${allHoles.length}`);

            // Создаем фигуру для вытягивания
            const extrusionFigure = {
                id: figure.id,
                outer: figure.outer,
                holes: allHoles,
                area: figure.area,
                isHole: figure.isHole,
                parentId: figure.parentId,
                childrenIds: figure.childrenIds,
                depth: figure.depth
            };

            result.push(extrusionFigure);
            processedFigures.add(figure.id);

            console.log(`  Добавлена фигура с ${allHoles.length} отверстиями`);
        }

        console.log("Итого фигур для вытягивания:", result.length);
        return result;
    }

    // Получить все непосредственные отверстия (вложенность 1)
    getAllImmediateHoles(figure) {
        const holes = [];

        if (figure.childrenIds && figure.childrenIds.length > 0) {
            for (const childId of figure.childrenIds) {
                const childFigure = this.figureManager.getFigureById(childId);
                if (childFigure) {
                    // Для внешнего контура: отверстия - это его дети с isHole=true
                    // Для отверстия: отверстия - это его дети с isHole=false
                    if ((!figure.isHole && childFigure.isHole) ||
                        (figure.isHole && !childFigure.isHole)) {
                        holes.push(childFigure.outer);
                        console.log(`    Добавлено отверстие: ${childId}, isHole=${childFigure.isHole}`);
                    }
                }
            }
        }

        return holes;
    }

    // === ПОДСВЕТКА ===

    highlightFigure(figure, color) {
        if (!figure || !figure.outer) return;

        // Подсвечиваем только основной контур
        if (figure.outer.element) {
            this.editor.objectsManager.safeSetElementColor(figure.outer.element, color);
        } else if (figure.outer.elements) {
            figure.outer.elements.forEach(element => {
                this.editor.objectsManager.safeSetElementColor(element, color);
            });
        }
    }

    unhighlightFigure(figure) {
        if (!figure || !figure.outer) return;

        // Возвращаем исходный цвет
        if (figure.outer.element) {
            this.editor.objectsManager.safeRestoreElementColor(figure.outer.element);
        } else if (figure.outer.elements) {
            figure.outer.elements.forEach(element => {
                this.editor.objectsManager.safeRestoreElementColor(element);
            });
        }
    }

    // Подсветка при наведении
    highlightFiguresOnHover(event) {
        if (this.isDraggingArrow || this.selectedFigures.size > 0) {
            return;
        }

        const point = this.getPointOnPlane(event);
        if (!point) return;

        // Снимаем подсветку с предыдущей фигуры
        if (this.hoveredFigure) {
            this.unhighlightFigure(this.hoveredFigure);
            this.hoveredFigure = null;
        }

        // Находим фигуру под курсором
        const allFigures = this.figureManager.getAllFigures();
        const figure = this.findFigureAtPoint(point, allFigures);

        if (figure) {
            this.hoveredFigure = figure;
            this.highlightFigure(figure, this.hoveredColor);
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }
    }

    // Очистить выделение
    clearSelection() {
        console.log("=== clearSelection ===");

        // Снимаем подсветку со всех выделенных фигур
        for (const figure of this.selectedFigures.values()) {
            this.unhighlightFigure(figure);
        }

        this.selectedFigures.clear();

        // Снимаем подсветку с фигуры под курсором
        if (this.hoveredFigure) {
            this.unhighlightFigure(this.hoveredFigure);
            this.hoveredFigure = null;
        }

        document.body.style.cursor = 'default';
    }

    // === ГЕОМЕТРИЧЕСКИЕ МЕТОДЫ ===

    getPointOnPlane(event) {
        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        // Используем базовую плоскость, если есть
        if (this.basePlane) {
            const planeNormal = new THREE.Vector3(0, 0, 1);
            planeNormal.applyQuaternion(this.basePlane.quaternion);
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(planeNormal, this.basePlane.position);

            const intersection = new THREE.Vector3();
            if (this.editor.raycaster.ray.intersectPlane(plane, intersection)) {
                return intersection;
            }
        }

        // Или ищем любую плоскость
        const sketchPlanes = this.editor.sketchPlanes || [];
        const workPlanes = this.editor.workPlanes || [];
        const allPlanes = [...sketchPlanes, ...workPlanes];

        for (const plane of allPlanes) {
            const planeNormal = new THREE.Vector3(0, 0, 1);
            planeNormal.applyQuaternion(plane.quaternion);
            const planeObj = new THREE.Plane();
            planeObj.setFromNormalAndCoplanarPoint(planeNormal, plane.position);

            const intersection = new THREE.Vector3();
            if (this.editor.raycaster.ray.intersectPlane(planeObj, intersection)) {
                return intersection;
            }
        }

        return null;
    }

    isPointInContour(point, contourPoints) {
        if (contourPoints.length < 3) return false;

        let inside = false;
        const n = contourPoints.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = contourPoints[i].x;
            const yi = contourPoints[i].y;
            const xj = contourPoints[j].x;
            const yj = contourPoints[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
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

    // Вычисление площади многоугольника со знаком
    calculateSignedPolygonArea(points) {
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

    // Исправление ориентации контуров
    fixContourOrientation(points, shouldBeClockwise) {
        if (points.length < 3) return points;

        const area = this.calculateSignedPolygonArea(points);
        const isCurrentlyClockwise = area < 0;

        if (isCurrentlyClockwise !== shouldBeClockwise) {
            return [...points].reverse();
        }

        return points;
    }

    createExtrusionGeometryFromFigures(figures, height, direction) {
        if (figures.length === 0 || !this.basePlane) return null;

        const shapes = [];

        figures.forEach(figure => {
            console.log(`Создание фигуры: ${figure.id}, isHole: ${figure.isHole}, отверстий: ${figure.holes ? figure.holes.length : 0}`);

            const outerPoints = this.getFigurePointsForBasePlane(figure);
            if (outerPoints.length < 3) {
                console.log(`  Недостаточно точек: ${outerPoints.length}`);
                return;
            }

            let shouldBeClockwise = false;

            if (figure.isHole) {
                shouldBeClockwise = false;
            }

            const correctedOuterPoints = this.fixContourOrientation(outerPoints, shouldBeClockwise);

            try {
                const shape = new THREE.Shape(correctedOuterPoints.map(p => new THREE.Vector2(p.x, p.y)));

                if (figure.holes && figure.holes.length > 0) {
                    figure.holes.forEach((hole, index) => {
                        const holePoints = this.getContourPointsForBasePlane(hole);
                        if (holePoints.length >= 3) {
                            const correctedHolePoints = this.fixContourOrientation(holePoints, true);

                            try {
                                const holePath = new THREE.Path(correctedHolePoints.map(p => new THREE.Vector2(p.x, p.y)));
                                shape.holes.push(holePath);
                                console.log(`    Добавлено отверстие ${index}`);
                            } catch (error) {
                                console.error(`    Ошибка создания отверстия ${index}:`, error);
                            }
                        }
                    });
                }

                shapes.push(shape);
                console.log(`  Форма успешно создана`);
            } catch (error) {
                console.error(`  Ошибка создания формы для фигуры ${figure.id}:`, error);
            }
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

            console.log("Геометрия успешно создана, вершин:", geometry.attributes.position.count);
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
        return contour.points || [];
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

    // === СТРЕЛКА ВЫТЯГИВАНИЯ ===

    createExtrudeDirectionIndicator() {
        if (this.extrudeArrow) {
            if (this.extrudeArrow.parent) {
                this.extrudeArrow.parent.remove(this.extrudeArrow);
            }
            this.extrudeArrow = null;
        }

        const figures = this.getFiguresForExtrusion();
        if (!figures || figures.length === 0 || !this.basePlane) return;

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

        const arrowHandle = new THREE.Mesh(handleGeometry, handleMaterial);
        arrowHandle.position.y = arrowLength + arrowHeadLength;
        arrowHandle.userData.isArrowHandle = true;
        arrowHandle.userData.isDraggable = true;
        this.extrudeArrow.add(arrowHandle);

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

        const center = new THREE.Vector3(0, 0, 0);
        let totalWeight = 0;

        figures.forEach(figure => {
            if (figure.outer && figure.outer.center) {
                const weight = figure.outer.area || 1;
                center.x += figure.outer.center.x * weight;
                center.y += figure.outer.center.y * weight;
                totalWeight += weight;
            }
        });

        if (totalWeight > 0) {
            center.x /= totalWeight;
            center.y /= totalWeight;
        }

        const worldCenter = this.basePlane.localToWorld(center.clone());
        const planePos = new THREE.Vector3();
        this.basePlane.getWorldPosition(planePos);
        const offsetVector = new THREE.Vector3().subVectors(worldCenter, planePos);
        const basePos = planePos.clone().add(offsetVector);

        let previewCenterOffset = 0;
        if (direction === 'positive') {
            previewCenterOffset = height / 2;
        } else if (direction === 'negative') {
            previewCenterOffset = -height / 2;
        }

        const arrowPos = basePos.clone().add(
            planeNormal.clone().multiplyScalar(previewCenterOffset + 2)
        );

        this.extrudeArrow.position.copy(arrowPos);
        this.extrudeArrow.updateMatrixWorld(true);
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

    // === ПРЕДПРОСМОТР ===

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

    // === UI ===

    showExtrudeUI() {
        const oldUI = document.getElementById('extrudeUI');
        if (oldUI) oldUI.remove();

        const selectedCount = this.selectedFigures.size;

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
                        <option value="positive">Наружу</option>
                        <option value="negative">Внутрь</option>
                        <option value="both">В обе стороны</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>Операция:</label>
                    <select id="extrudeOperation">
                        <option value="new">Новый объект</option>
                        <option value="cut">Вырезать</option>
                        <option value="join">Объединить</option>
                    </select>
                </div>
                <div class="extrude-info">
                    <div id="selectedContourInfo">
                        ${selectedCount > 0 ? `Выбрано фигур: ${selectedCount}` : 'Кликните по фигуре для выбора'}
                    </div>
                </div>
                <button id="performExtrude" class="btn-primary" ${selectedCount > 0 ? '' : 'disabled'}>
                    <i class="fas fa-check"></i> Выполнить вытягивание
                </button>
            </div>
            <div class="extrude-hint">
                <i class="fas fa-info-circle"></i>
                <div>• Клик по фигуре: выделить/снять выделение</div>
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
        heightInput.addEventListener('input', () => {
            this.updateExtrudePreview();
            this.updateArrowPosition();
        });

        const directionSelect = container.querySelector('#extrudeDirection');
        directionSelect.addEventListener('change', () => {
            this.updateExtrudePreview();
            this.updateArrowPosition();
        });

        const operationSelect = container.querySelector('#extrudeOperation');
        operationSelect.addEventListener('change', () => {
            this.currentOperation = operationSelect.value;
            this.updateExtrudeUI();
        });
    }

    updateExtrudeUI() {
        const selectedContourInfo = document.getElementById('selectedContourInfo');
        const performExtrudeBtn = document.getElementById('performExtrude');

        if (selectedContourInfo) {
            const count = this.selectedFigures.size;
            if (count > 0) {
                selectedContourInfo.textContent = `Выбрано фигур: ${count}`;
                selectedContourInfo.style.color = '#4CAF50';
            } else {
                selectedContourInfo.textContent = 'Кликните по фигуре для выбора';
                selectedContourInfo.style.color = '#888';
            }
        }

        if (performExtrudeBtn) {
            performExtrudeBtn.disabled = this.selectedFigures.size === 0;
        }
    }

    // === ВЫПОЛНЕНИЕ ВЫТЯГИВАНИЯ С ИСТОРИЕЙ И БУЛЕВЫМИ ОПЕРАЦИЯМИ ===

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

        if (this.extrudeArrow) {
            this.editor.scene.remove(this.extrudeArrow);
            this.extrudeArrow = null;
        }

        this.removeExtrudePreview();

        const ui = document.getElementById('extrudeUI');
        if (ui) ui.remove();

        const allElements = this.editor.objectsManager.getAllSketchElements();
        allElements.forEach(element => {
            this.editor.objectsManager.safeRestoreElementColor(element);
        });

        this.editor.showStatus('Режим вытягивания завершен', 'info');
    }

    // === ПОДСВЕТКА ВСЕХ ФИГУР ===

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
        });

        if (figures.length === 0) {
            this.editor.showStatus('Нет замкнутых фигур для вытягивания', 'warning');
        }
    }
}