/**
 * Инструмент "Симметрия" - отражение объектов относительно линии
 */
class MirrorSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'mirror', 'fa-balance-scale');
        this.mirrorLine = null;
        this.tempLine = null;
        this.mirrorMode = 'select_line'; // 'select_line', 'select_objects', 'apply'

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

        this.tempGeometry = new THREE.Line(geometry, new THREE.LineBasicMaterial({
            color: this.mirrorLine.color,
            linewidth: 2,
            dashed: true,
            dashSize: 1,
            gapSize: 1
        }));

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
    }

    selectObjectsForMirror(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return;

        const clickedElement = this.sketchManager.getElementAtPoint(point);
        if (clickedElement) {
            this.sketchManager.toggleElementSelection(clickedElement);
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.onCancel();
            return true;
        } else if (e.key === 'Enter' && this.mirrorMode === 'select_objects') {
            this.applyMirror();
            return true;
        }
        return false;
    }

    applyMirror() {
        if (!this.mirrorLine || this.sketchManager.selectedElements.length === 0) {
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

        // Создаем отраженные копии
        const mirroredElements = [];

        this.sketchManager.selectedElements.forEach(element => {
            if (!element.mesh) return;

            // Создаем отраженную копию
            const mirroredElement = this.createMirroredElement(element, lineStart, perpendicular);
            if (mirroredElement) {
                mirroredElements.push(mirroredElement);
            }
        });

        // Добавляем все отраженные элементы
        mirroredElements.forEach(element => {
            this.sketchManager.addElement(element);
        });

        this.sketchManager.editor.showStatus(`Отражено ${mirroredElements.length} объектов`, 'success');
        this.onCancel();
    }

    createMirroredElement(originalElement, lineStart, perpendicular) {
        // Клонируем оригинальный элемент
        const mirroredElement = JSON.parse(JSON.stringify(originalElement));

        // Удаляем mesh из клона
        mirroredElement.mesh = null;

        // Отражение точек
        if (mirroredElement.points) {
            mirroredElement.points = mirroredElement.points.map(point => {
                return this.mirrorPoint(point, lineStart, perpendicular);
            });
        }

        // Для текста - отражаем положение
        if (mirroredElement.type === 'text' && mirroredElement.position) {
            mirroredElement.position = this.mirrorPoint(mirroredElement.position, lineStart, perpendicular);
        }

        // Для круга, овала и других фигур с центром
        if (mirroredElement.center) {
            mirroredElement.center = this.mirrorPoint(mirroredElement.center, lineStart, perpendicular);
        }

        // Для прямоугольника и стадиона
        if (mirroredElement.start && mirroredElement.end) {
            mirroredElement.start = this.mirrorPoint(mirroredElement.start, lineStart, perpendicular);
            mirroredElement.end = this.mirrorPoint(mirroredElement.end, lineStart, perpendicular);
        }

        return mirroredElement;
    }

    mirrorPoint(point, lineStart, perpendicular) {
        // Вектор от начала линии до точки
        const vectorToPoint = new THREE.Vector3().subVectors(point, lineStart);

        // Проекция на перпендикуляр
        const projection = vectorToPoint.dot(perpendicular);

        // Отраженная точка
        const mirroredPoint = point.clone().sub(perpendicular.clone().multiplyScalar(2 * projection));

        return mirroredPoint;
    }

    onCancel() {
        this.clearTempGeometry();
        this.tempGeometry = null;
        this.mirrorLine = null;
        this.mirrorMode = 'select_line';
        this.sketchManager.clearSelection();
        this.sketchManager.hideDimensionInput();
        this.sketchManager.editor.showStatus('Отражение отменено', 'info');
    }
}