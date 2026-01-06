class RectangleSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'rectangle', 'fa-vector-square');
        this.width = 10;
        this.height = 10;
        // Добавляем направление рисования
        this.directionX = 1;
        this.directionY = 1;

        this.dimensionFields = [
            { label: 'Ширина', type: 'number', value: this.width, unit: 'мм', min: 1, step: 1 },
            { label: 'Высота', type: 'number', value: this.height, unit: 'мм', min: 1, step: 1 }
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
            type: 'rectangle',
            start: point.clone(),
            end: point.clone(),
            width: 0,
            height: 0,
            points: this.calculateRectanglePoints(point, point),
            color: this.sketchManager.sketchColor
        };

        // Инициализируем направления
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

        // Определяем направления рисования
        const dx = point.x - this.tempElement.start.x;
        const dy = point.y - this.tempElement.start.y;

        this.directionX = dx >= 0 ? 1 : -1;
        this.directionY = dy >= 0 ? 1 : -1;

        // Обновляем абсолютные значения ширины и высоты
        this.tempElement.width = Math.abs(dx);
        this.tempElement.height = Math.abs(dy);

        // Обновляем точки прямоугольника
        this.tempElement.points = this.calculateRectanglePoints(
            this.tempElement.start,
            point
        );

        this.updateTempGeometry();

        // Обновляем размерные линии
        this.updateRectangleDimensions();

        // Обновляем поле ввода
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
        if (!this.tempElement) {
            this.onCancel();
            return;
        }

        const config = this.getDimensionConfig();
        // Используем актуальные значения ширины и высоты
        config.fields[0].value = this.tempElement.width.toFixed(1);
        config.fields[1].value = this.tempElement.height.toFixed(1);

        this.sketchManager.showDimensionInput(e, config);
    }

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

        // Пересчитываем конечную точку с учетом направлений рисования
        this.tempElement.end.x = this.tempElement.start.x + (this.tempElement.width * this.directionX);
        this.tempElement.end.y = this.tempElement.start.y + (this.tempElement.height * this.directionY);

        // Обновляем точки прямоугольника
        this.tempElement.points = this.calculateRectanglePoints(
            this.tempElement.start,
            this.tempElement.end
        );

        // Добавляем финальный элемент
        this.sketchManager.addElement(this.tempElement);

        // Очищаем временные данные
        this.clearTempGeometry();
        this.sketchManager.clearDimensionObjects();
        this.tempElement = null;
    }

    updateRectangleDimensions() {
        if (!this.tempElement) return;

        this.sketchManager.clearDimensionObjects();
        this.createRectangleDimensions(this.tempElement.start, this.tempElement.end);
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

    createRectangleDimensions(start, end) {
        if (!this.sketchManager.currentPlane) return;

        const localStart = this.sketchManager.currentPlane.worldToLocal(start.clone());
        const localEnd = this.sketchManager.currentPlane.worldToLocal(end.clone());

        const minX = Math.min(localStart.x, localEnd.x);
        const maxX = Math.max(localStart.x, localEnd.x);
        const minY = Math.min(localStart.y, localEnd.y);
        const maxY = Math.max(localStart.y, localEnd.y);

        const width = maxX - minX;
        const height = maxY - minY;

        // Ширина
        const widthLineStart = new THREE.Vector3(minX, minY - 10, 0.1);
        const widthLineEnd = new THREE.Vector3(maxX, minY - 10, 0.1);

        const widthGeometry = new THREE.BufferGeometry().setFromPoints([widthLineStart, widthLineEnd]);
        const widthMaterial = new THREE.LineBasicMaterial({
            color: this.sketchManager.dimensionColor,
            linewidth: 2
        });
        const widthLine = new THREE.Line(widthGeometry, widthMaterial);

        const widthExt1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(minX, minY, 0.1),
                new THREE.Vector3(minX, minY - 10, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const widthExt2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(maxX, minY, 0.1),
                new THREE.Vector3(maxX, minY - 10, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const widthTextPos = new THREE.Vector3(minX + width / 2, minY - 15, 0.1);
        this.createDimensionText(widthTextPos, `${width.toFixed(1)} мм`);

        // Высота
        const heightLineStart = new THREE.Vector3(maxX + 10, minY, 0.1);
        const heightLineEnd = new THREE.Vector3(maxX + 10, maxY, 0.1);

        const heightGeometry = new THREE.BufferGeometry().setFromPoints([heightLineStart, heightLineEnd]);
        const heightMaterial = new THREE.LineBasicMaterial({
            color: this.sketchManager.dimensionColor,
            linewidth: 2
        });
        const heightLine = new THREE.Line(heightGeometry, heightMaterial);

        const heightExt1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(maxX, minY, 0.1),
                new THREE.Vector3(maxX + 10, minY, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const heightExt2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(maxX, maxY, 0.1),
                new THREE.Vector3(maxX + 10, maxY, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const heightTextPos = new THREE.Vector3(maxX + 15, minY + height / 2, 0.1);
        this.createDimensionText(heightTextPos, `${height.toFixed(1)} мм`);

        [widthLine, widthExt1, widthExt2, heightLine, heightExt1, heightExt2].forEach(obj => {
            obj.userData.isDimension = true;
            this.sketchManager.currentPlane.add(obj);
            this.sketchManager.dimensionObjects.push(obj);
        });
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
        sprite.scale.set(20, 5, 1);
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
}