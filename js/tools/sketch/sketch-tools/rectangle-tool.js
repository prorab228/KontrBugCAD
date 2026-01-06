class RectangleSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'rectangle', 'fa-vector-square');
        this.width = 10;
        this.height = 10;

        // Конфигурация полей ввода
        this.dimensionFields = [
            { label: 'Ширина', type: 'number', value: this.width, unit: 'мм', min: 1, step: 1 },
            { label: 'Высота', type: 'number', value: this.height, unit: 'мм', min: 1, step: 1 }
        ];
    }

    onMouseDown(e) {
        // Если поле ввода активно, завершаем ввод
        if (this.sketchManager.isInputActive) {
            this.sketchManager.applyDimensionInput();
            return true;
        }

        const point = this.getPointOnPlane(e);
        if (!point) return false;

        this.isDrawing = true;
        this.tempElement = {
            type: 'rectangle',
            start: point.clone(),
            end: point.clone(),
            width: 0,
            height: 0,
            points: this.calculateRectanglePoints(point, point),
            color: this.sketchManager.sketchColor
        };

        this.createTempGeometry();
        return true;
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.tempElement) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        this.tempElement.end = point.clone();
        this.tempElement.width = Math.abs(point.x - this.tempElement.start.x);
        this.tempElement.height = Math.abs(point.y - this.tempElement.start.y);
        this.tempElement.points = this.calculateRectanglePoints(
            this.tempElement.start,
            point
        );

        this.updateTempGeometry();

        // Обновляем значения в полях ввода (если они активны)
        if (this.sketchManager.isInputActive) {
            this.updateInputFields();
        }
    }

    onMouseUp(e) {
        if (!this.isDrawing) return;

        const point = this.getPointOnPlane(e);
        if (point) {
            this.finishDrawing(e);
        }
        this.isDrawing = false;
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.isDrawing) {
            this.onCancel();
            return true;
        }
        return false;
    }

    onCancel() {
        this.isDrawing = false;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.clearDimensionObjects();
        this.sketchManager.hideDimensionInput();
    }

    finishDrawing(e) {
        // Показываем поле ввода с текущими значениями
        const config = this.getDimensionConfig();
        config.fields[0].value = this.tempElement.width.toFixed(1);
        config.fields[1].value = this.tempElement.height.toFixed(1);

        this.sketchManager.showDimensionInput(e, config);
    }

    // Метод для обновления полей ввода
    updateInputFields() {
        if (!this.sketchManager.isInputActive || !this.tempElement) return;

        if (this.sketchManager.inputField1) {
            this.sketchManager.inputField1.value = this.tempElement.width.toFixed(1);
        }
        if (this.sketchManager.inputField2) {
            this.sketchManager.inputField2.value = this.tempElement.height.toFixed(1);
        }
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        // Применяем введенные значения
        if (values.value1 && values.value1 > 0) {
            this.tempElement.width = values.value1;
        }
        if (values.value2 && values.value2 > 0) {
            this.tempElement.height = values.value2;
        }

        // Пересчитываем конечную точку
        this.tempElement.end.x = this.tempElement.start.x + this.tempElement.width;
        this.tempElement.end.y = this.tempElement.start.y + this.tempElement.height;

        // Обновляем точки прямоугольника
        this.tempElement.points = this.calculateRectanglePoints(
            this.tempElement.start,
            this.tempElement.end
        );

        // Добавляем финальный элемент
        this.sketchManager.addElement(this.tempElement);

        // Очищаем временные данные
        this.clearTempGeometry();
        this.tempElement = null;
    }

    calculateRectanglePoints(start, end) {
        if (!this.sketchManager.currentPlane) return [];

        const localStart = this.sketchManager.currentPlane.worldToLocal(start.clone());
        const localEnd = this.sketchManager.currentPlane.worldToLocal(end.clone());

        const minX = Math.min(localStart.x, localEnd.x);
        const maxX = Math.max(localStart.x, localEnd.x);
        const minY = Math.min(localStart.y, localEnd.y);
        const maxY = Math.max(localStart.y, localEnd.y);

        const points = [
            new THREE.Vector3(minX, minY, 0),
            new THREE.Vector3(maxX, minY, 0),
            new THREE.Vector3(maxX, maxY, 0),
            new THREE.Vector3(minX, maxY, 0),
            new THREE.Vector3(minX, minY, 0)
        ];

        return points.map(p => this.sketchManager.currentPlane.localToWorld(p));
    }

    createGeometry(element) {
        const vertices = [];
        element.points.forEach(point => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
            vertices.push(localPoint.x, localPoint.y, 0);
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
            color: element.color,
            linewidth: 2
        }));
    }

    updateGeometry(mesh, element) {
        const vertices = [];
        element.points.forEach(point => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
            vertices.push(localPoint.x, localPoint.y, 0);
        });

        mesh.geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(vertices, 3));
        mesh.geometry.attributes.position.needsUpdate = true;
    }
}