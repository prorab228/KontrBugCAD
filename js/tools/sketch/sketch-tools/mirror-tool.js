/**
 * Инструмент "Симметрия" - отражение объектов относительно линии
 */
class MirrorSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'mirror', 'fa-balance-scale');
        this.mirrorLine = null;
        this.tempLine = null;
        this.mirrorMode = 'select_line'; // 'select_line', 'select_objects', 'apply'
        this.selectedElementsForMirror = [];

        this.dimensionFields = [];
    }

    onMouseDown(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return false;

        switch (this.mirrorMode) {
            case 'select_line':
                if (!this.mirrorLine) {
                    this.startMirrorLine(point, e);
                } else {
                    this.finishMirrorLine(point, e);
                }
                break;

            case 'select_objects':
                // Выделение объектов для отражения
                this.selectObjectsForMirror(e);
                break;
        }

        return true;
    }

    onMouseMove(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return;

        switch (this.mirrorMode) {
            case 'select_line':
                if (this.mirrorLine && this.mirrorLine.points && this.mirrorLine.points.length === 1) {
                    this.updateMirrorLine(point);
                }
                break;
        }
    }

    startMirrorLine(startPoint, e) {
        this.mirrorLine = {
            type: 'mirror_line',
            start: startPoint.clone(),
            end: startPoint.clone(),
            points: [startPoint.clone(), startPoint.clone()],
            color: 0xFF0000 // Красная линия для симметрии
        };

        // Создаем временную линию
        this.createMirrorLineGeometry();
        this.sketchManager.editor.showStatus('Укажите конечную точку оси симметрии', 'info');
    }

    updateMirrorLine(point) {
        if (!this.mirrorLine) return;

        this.mirrorLine.end = point.clone();
        this.mirrorLine.points[1] = point.clone();
        this.updateMirrorLineGeometry();
    }

    finishMirrorLine(endPoint, e) {
        if (!this.mirrorLine) return;

        this.mirrorLine.end = endPoint.clone();
        this.mirrorLine.points[1] = endPoint.clone();
        this.updateMirrorLineGeometry();

        this.mirrorMode = 'select_objects';
        this.sketchManager.editor.showStatus('Теперь выберите объекты для отражения. Нажмите Enter для применения', 'info');
    }

    createMirrorLineGeometry() {
        this.clearTempGeometry();

        const vertices = [];
        this.mirrorLine.points.forEach(point => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
            vertices.push(localPoint.x, localPoint.y, 0);
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        // Используем LineDashedMaterial для пунктирной линии
        const material = new THREE.LineDashedMaterial({
            color: this.mirrorLine.color,
            linewidth: 2,
            dashSize: 1,
            gapSize: 1,
            scale: 1
        });

        this.tempGeometry = new THREE.Line(geometry, material);
        this.tempGeometry.computeLineDistances(); // Важно для LineDashedMaterial

        this.sketchManager.currentPlane.add(this.tempGeometry);
    }

    updateMirrorLineGeometry() {
        if (!this.tempGeometry || !this.mirrorLine) return;

        const vertices = [];
        this.mirrorLine.points.forEach(point => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
            vertices.push(localPoint.x, localPoint.y, 0);
        });

        this.tempGeometry.geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(vertices, 3));
        this.tempGeometry.geometry.attributes.position.needsUpdate = true;
        this.tempGeometry.computeLineDistances(); // Обновляем расстояния для пунктира
    }

    selectObjectsForMirror(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return;

        const clickedElement = this.sketchManager.getElementAtPoint(point);
        if (clickedElement) {
            // Проверяем, не выбран ли уже этот элемент
            const index = this.selectedElementsForMirror.indexOf(clickedElement);
            if (index > -1) {
                // Удаляем из выделения
                this.selectedElementsForMirror.splice(index, 1);
                this.sketchManager.unhighlightElement(clickedElement);
                this.sketchManager.editor.showStatus(`Элемент удален из выделения. Выбрано: ${this.selectedElementsForMirror.length}`, 'info');
            } else {
                // Добавляем в выделение
                this.selectedElementsForMirror.push(clickedElement);
                this.sketchManager.highlightElement(clickedElement);
                this.sketchManager.editor.showStatus(`Элемент добавлен. Выбрано: ${this.selectedElementsForMirror.length}`, 'info');
            }
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.onCancel();
            return true;
        } else if (e.key === 'Enter' && this.mirrorMode === 'select_objects') {
            this.applyMirror();
            return true;
        } else if (e.key === 'A' && e.ctrlKey && this.mirrorMode === 'select_objects') {
            // Выделить все элементы на плоскости
            this.selectAllElements();
            return true;
        }
        return false;
    }

    selectAllElements() {
        this.selectedElementsForMirror.forEach(el => this.sketchManager.unhighlightElement(el));
        this.selectedElementsForMirror = [...this.sketchManager.elements];
        this.selectedElementsForMirror.forEach(el => this.sketchManager.highlightElement(el));
        this.sketchManager.editor.showStatus(`Выбрано всех элементов: ${this.selectedElementsForMirror.length}`, 'info');
    }

    applyMirror() {
        if (!this.mirrorLine || this.selectedElementsForMirror.length === 0) {
            this.sketchManager.editor.showStatus('Нет выбранных объектов для отражения', 'error');
            return;
        }

        // Рассчитываем ось симметрии
        const lineStart = this.mirrorLine.start;
        const lineEnd = this.mirrorLine.end;

        // Вектор направления линии
        const lineVector = new THREE.Vector3().subVectors(lineEnd, lineStart);
        const lineLength = lineVector.length();

        if (lineLength < 0.1) {
            this.sketchManager.editor.showStatus('Линия симметрии слишком короткая', 'error');
            return;
        }

        lineVector.normalize();

        // Перпендикуляр к линии (для отражения)
        const perpendicular = new THREE.Vector3(-lineVector.y, lineVector.x, 0);
        perpendicular.normalize();

        // Создаем отраженные копии
        const mirroredElements = [];

        this.selectedElementsForMirror.forEach(originalElement => {
            if (!originalElement || !originalElement.mesh) return;

            // Создаем отраженную копию
            const mirroredElement = this.createMirroredElement(originalElement, lineStart, perpendicular);
            if (mirroredElement) {
                mirroredElements.push(mirroredElement);
            }
        });

        // Добавляем все отраженные элементы
        mirroredElements.forEach(element => {
            if (element) {
                // Проверяем, что элемент имеет все необходимые свойства
                if (!element.type) {
                    console.error('Отраженный элемент не имеет типа:', element);
                    return;
                }
                this.sketchManager.addElement(element);
            }
        });

        this.sketchManager.editor.showStatus(`Отражено ${mirroredElements.length} объектов`, 'success');

        // Сбрасываем выделение
        this.selectedElementsForMirror.forEach(el => this.sketchManager.unhighlightElement(el));
        this.selectedElementsForMirror = [];

        this.onCancel();
    }

    createMirroredElement(originalElement, lineStart, perpendicular) {
        try {
            // Создаем глубокую копию элемента
            const mirroredElement = JSON.parse(JSON.stringify(originalElement));

            // Удаляем mesh из клона
            mirroredElement.mesh = null;
            mirroredElement.originalColor = null;
            mirroredElement.originalScale = null;

            // Функция для отражения точки
            const mirrorPoint = (point) => {
                if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
                    return point;
                }

                // Вектор от начала линии до точки
                const vectorToPoint = new THREE.Vector3().subVectors(
                    new THREE.Vector3(point.x, point.y, point.z || 0),
                    lineStart
                );

                // Проекция на перпендикуляр
                const projection = vectorToPoint.dot(perpendicular);

                // Отраженная точка
                const mirroredPoint = new THREE.Vector3(
                    point.x - (perpendicular.x * 2 * projection),
                    point.y - (perpendicular.y * 2 * projection),
                    point.z || 0
                );

                return mirroredPoint;
            };

            // Отражение точек в зависимости от типа элемента
            switch (mirroredElement.type) {
                case 'line':
                case 'polyline':
                case 'curve':
                    if (mirroredElement.points && Array.isArray(mirroredElement.points)) {
                        mirroredElement.points = mirroredElement.points.map(p => mirrorPoint(p));
                    }
                    break;

                case 'rectangle':
                case 'stadium':
                    if (mirroredElement.start) mirroredElement.start = mirrorPoint(mirroredElement.start);
                    if (mirroredElement.end) mirroredElement.end = mirrorPoint(mirroredElement.end);
                    if (mirroredElement.points && Array.isArray(mirroredElement.points)) {
                        mirroredElement.points = mirroredElement.points.map(p => mirrorPoint(p));
                    }
                    break;

                case 'circle':
                case 'oval':
                case 'polygon':
                case 'arc':
                    if (mirroredElement.center) mirroredElement.center = mirrorPoint(mirroredElement.center);
                    if (mirroredElement.points && Array.isArray(mirroredElement.points)) {
                        mirroredElement.points = mirroredElement.points.map(p => mirrorPoint(p));
                    }
                    break;

                case 'text':
                    if (mirroredElement.position) mirroredElement.position = mirrorPoint(mirroredElement.position);
                    if (mirroredElement.contours && Array.isArray(mirroredElement.contours)) {
                        mirroredElement.contours = mirroredElement.contours.map(contour =>
                            contour.map(p => mirrorPoint(p))
                        );
                    }
                    break;

                default:
                    console.warn('Неизвестный тип элемента для отражения:', mirroredElement.type);
            }

            return mirroredElement;
        } catch (error) {
            console.error('Ошибка при создании отраженного элемента:', error, originalElement);
            return null;
        }
    }

    onCancel() {
        this.clearTempGeometry();
        this.tempGeometry = null;
        this.mirrorLine = null;
        this.mirrorMode = 'select_line';

        // Сбрасываем выделение
        this.selectedElementsForMirror.forEach(el => {
            if (el && this.sketchManager.unhighlightElement) {
                this.sketchManager.unhighlightElement(el);
            }
        });
        this.selectedElementsForMirror = [];

        this.sketchManager.clearSelection();
        this.sketchManager.hideDimensionInput();
        this.sketchManager.editor.showStatus('Отражение отменено', 'info');
    }
}