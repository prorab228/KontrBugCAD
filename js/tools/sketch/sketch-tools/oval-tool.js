/**
 * Инструмент "Овал" (Эллипс)
 */
class OvalSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'oval', 'fa-circle-notch');
        this.width = 20;
        this.height = 10;
        this.segments = 32;
        this.directionX = 1;
        this.directionY = 1;

        this.dimensionFields = [
            { label: 'Ширина', type: 'number', value: this.width, unit: 'мм', min: 1, step: 1 },
            { label: 'Высота', type: 'number', value: this.height, unit: 'мм', min: 1, step: 1 },
            { label: 'Сегменты', type: 'number', value: this.segments, unit: 'шт', min: 8, max: 64, step: 4 }
        ];
    }

    onMouseDown(e) {
        if (this.sketchManager.isInputActive) {
            this.sketchManager.applyDimensionInput();
            return true;
        }

        const point = this.getPointOnPlane(e);
        if (!point) return false;

        this.isDrawing = true;
        this.tempElement = {
            type: 'oval',
            start: point.clone(),
            end: point.clone(),
            width: 0,
            height: 0,
            radiusX: 0,
            radiusY: 0,
            segments: this.segments,
            points: this.calculateOvalPoints(point, point),
            color: this.sketchManager.sketchColor
        };

        this.directionX = 1;
        this.directionY = 1;

        this.createTempGeometry();
        return true;
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.tempElement) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        this.tempElement.end = point.clone();

        // Получаем точки в локальных координатах плоскости
        const localStart = this.sketchManager.currentPlane.worldToLocal(this.tempElement.start.clone());
        const localEnd = this.sketchManager.currentPlane.worldToLocal(point.clone());

        // Определяем направления рисования в локальных координатах
        const dx = localEnd.x - localStart.x;
        const dy = localEnd.y - localStart.y;

        this.directionX = dx >= 0 ? 1 : -1;
        this.directionY = dy >= 0 ? 1 : -1;

        // Обновляем абсолютные значения ширины и высоты в локальных координатах
        this.tempElement.width = Math.abs(dx);
        this.tempElement.height = Math.abs(dy);
        this.tempElement.radiusX = this.tempElement.width / 2;
        this.tempElement.radiusY = this.tempElement.height / 2;

        // Рассчитываем центр овала в локальных координатах
        const localCenterX = localStart.x + (dx / 2);
        const localCenterY = localStart.y + (dy / 2);
        const localCenter = new THREE.Vector3(localCenterX, localCenterY, 0);

        // Преобразуем центр обратно в мировые координаты
        this.tempElement.center = this.sketchManager.currentPlane.localToWorld(localCenter);

        // Обновляем точки овала
        this.tempElement.points = this.calculateOvalPoints(
            this.tempElement.start,
            point
        );

        this.updateTempGeometry();
        this.updateOvalDimensions();

        if (this.sketchManager.isInputActive) {
            this.updateInputFields();
        }
    }

    onMouseUp(e) {
        if (!this.isDrawing) return;

        const point = this.getPointOnPlane(e);
        if (point && this.tempElement) {
            this.finishDrawing(e);
        }
        this.isDrawing = false;
    }

    finishDrawing(e) {
        if (!this.tempElement) {
            this.onCancel();
            return;
        }

        const config = this.getDimensionConfig();
        config.fields[0].value = this.tempElement.width.toFixed(1);
        config.fields[1].value = this.tempElement.height.toFixed(1);
        config.fields[2].value = this.tempElement.segments;

        this.sketchManager.dimensionManager.showDimensionInput(e, config);
    }

    updateInputFields() {
        if (!this.sketchManager.isInputActive || !this.tempElement) return;

        if (this.sketchManager.inputField1) {
            this.sketchManager.inputField1.value = this.tempElement.width.toFixed(1);
        }
        if (this.sketchManager.inputField2) {
            this.sketchManager.inputField2.value = this.tempElement.height.toFixed(1);
        }
        if (this.sketchManager.inputField3) {
            this.sketchManager.inputField3.value = this.tempElement.segments;
        }
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        if (values.value1 && values.value1 > 0) {
            this.tempElement.width = values.value1;
        }
        if (values.value2 && values.value2 > 0) {
            this.tempElement.height = values.value2;
        }
        if (values.value3 && values.value3 >= 8) {
            this.tempElement.segments = Math.min(64, Math.max(8, values.value3));
        }

        this.tempElement.radiusX = this.tempElement.width / 2;
        this.tempElement.radiusY = this.tempElement.height / 2;

        // Получаем начальную точку в локальных координатах
        const localStart = this.sketchManager.currentPlane.worldToLocal(this.tempElement.start.clone());

        // Вычисляем конечную точку в локальных координатах
        const localEnd = new THREE.Vector3(
            localStart.x + (this.tempElement.width * this.directionX),
            localStart.y + (this.tempElement.height * this.directionY),
            0
        );

        // Преобразуем конечную точку обратно в мировые координаты
        this.tempElement.end = this.sketchManager.currentPlane.localToWorld(localEnd);

        // Обновляем центр в локальных координатах
        const localCenterX = localStart.x + (this.tempElement.width * this.directionX / 2);
        const localCenterY = localStart.y + (this.tempElement.height * this.directionY / 2);
        const localCenter = new THREE.Vector3(localCenterX, localCenterY, 0);
        this.tempElement.center = this.sketchManager.currentPlane.localToWorld(localCenter);

        this.tempElement.points = this.calculateOvalPoints(
            this.tempElement.start,
            this.tempElement.end
        );

        this.sketchManager.elementManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.tempElement = null;
    }

    updateOvalDimensions() {
        if (!this.tempElement || !this.tempElement.center) return;

        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.createOvalDimensions();
    }

    createOvalDimensions() {
        if (!this.sketchManager.currentPlane || !this.tempElement) return;

        const localCenter = this.sketchManager.currentPlane.worldToLocal(this.tempElement.center.clone());
        const radiusX = this.tempElement.radiusX;
        const radiusY = this.tempElement.radiusY;

        // Размеры по оси X
        const xLineStart = new THREE.Vector3(localCenter.x - radiusX, localCenter.y, 0.1);
        const xLineEnd = new THREE.Vector3(localCenter.x + radiusX, localCenter.y, 0.1);

        const xGeometry = new THREE.BufferGeometry().setFromPoints([xLineStart, xLineEnd]);
        const xMaterial = new THREE.LineBasicMaterial({
            color: this.sketchManager.dimensionColor,
            linewidth: 2
        });
        const xLine = new THREE.Line(xGeometry, xMaterial);

        const xExt1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localCenter.x - radiusX, localCenter.y - 5, 0.1),
                new THREE.Vector3(localCenter.x - radiusX, localCenter.y + 5, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const xExt2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localCenter.x + radiusX, localCenter.y - 5, 0.1),
                new THREE.Vector3(localCenter.x + radiusX, localCenter.y + 5, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const xTextPos = new THREE.Vector3(localCenter.x, localCenter.y - 10, 0.1);
        this.createDimensionText(xTextPos, `Ширина: ${(radiusX * 2).toFixed(1)}`);

        // Размеры по оси Y
        const yLineStart = new THREE.Vector3(localCenter.x, localCenter.y - radiusY, 0.1);
        const yLineEnd = new THREE.Vector3(localCenter.x, localCenter.y + radiusY, 0.1);

        const yGeometry = new THREE.BufferGeometry().setFromPoints([yLineStart, yLineEnd]);
        const yMaterial = new THREE.LineBasicMaterial({
            color: this.sketchManager.dimensionColor,
            linewidth: 2
        });
        const yLine = new THREE.Line(yGeometry, yMaterial);

        const yExt1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localCenter.x - 5, localCenter.y - radiusY, 0.1),
                new THREE.Vector3(localCenter.x + 5, localCenter.y - radiusY, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const yExt2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localCenter.x - 5, localCenter.y + radiusY, 0.1),
                new THREE.Vector3(localCenter.x + 5, localCenter.y + radiusY, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const yTextPos = new THREE.Vector3(localCenter.x + 15, localCenter.y, 0.1);
        this.createDimensionText(yTextPos, `Высота: ${(radiusY * 2).toFixed(1)}`);

        [xLine, xExt1, xExt2, yLine, yExt1, yExt2].forEach(obj => {
            obj.userData.isDimension = true;
            this.sketchManager.currentPlane.add(obj);
            this.sketchManager.dimensionObjects.push(obj);
        });
    }

    calculateOvalPoints(start, end) {
        if (!this.sketchManager.currentPlane) return [];

        const localStart = this.sketchManager.currentPlane.worldToLocal(start.clone());
        const localEnd = this.sketchManager.currentPlane.worldToLocal(end.clone());

        const minX = Math.min(localStart.x, localEnd.x);
        const maxX = Math.max(localStart.x, localEnd.x);
        const minY = Math.min(localStart.y, localEnd.y);
        const maxY = Math.max(localStart.y, localEnd.y);

        const width = maxX - minX;
        const height = maxY - minY;
        const radiusX = width / 2;
        const radiusY = height / 2;
        const centerX = minX + radiusX;
        const centerY = minY + radiusY;

        const points = [];

        for (let i = 0; i <= this.segments; i++) {
            const theta = (i / this.segments) * Math.PI * 2;
            const x = centerX + Math.cos(theta) * radiusX;
            const y = centerY + Math.sin(theta) * radiusY;
            points.push(this.sketchManager.currentPlane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        return points;
    }

    createDimensionText(position, text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 16px Arial';
        context.fillStyle = '#00C853';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });

        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        sprite.scale.set(25, 5, 1);
        sprite.userData.isDimension = true;

        this.sketchManager.currentPlane.add(sprite);
        this.sketchManager.dimensionObjects.push(sprite);
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

    onCancel() {
        this.isDrawing = false;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.sketchManager.dimensionManager.hideDimensionInput();
    }
}