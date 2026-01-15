/**
 * Инструмент "Стадион" (Прямоугольник с закругленными концами)
 */
class StadiumSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'stadium', 'fa-running');
        this.width = 20;
        this.height = 10;
        this.cornerRadius = 5;
        this.segments = 8;
        this.directionX = 1;
        this.directionY = 1;

        this.dimensionFields = [
            { label: 'Длина', type: 'number', value: this.width, unit: 'мм', min: 1, step: 1 },
            { label: 'Высота', type: 'number', value: this.height, unit: 'мм', min: 1, step: 1 },
            { label: 'Радиус скругления', type: 'number', value: this.cornerRadius, unit: 'мм', min: 0.5, step: 0.5 }
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
            type: 'stadium',
            start: point.clone(),
            end: point.clone(),
            width: 0,
            height: 0,
            cornerRadius: this.cornerRadius,
            segments: this.segments,
            points: this.calculateStadiumPoints(point, point, this.cornerRadius),
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

        // Определяем направления рисования
        const dx = point.x - this.tempElement.start.x;
        const dy = point.y - this.tempElement.start.y;

        this.directionX = dx >= 0 ? 1 : -1;
        this.directionY = dy >= 0 ? 1 : -1;

        // Обновляем абсолютные значения ширины и высоты
        this.tempElement.width = Math.abs(dx);
        this.tempElement.height = Math.abs(dy);

        // Автоматически ограничиваем радиус скругления
        const maxRadius = Math.min(this.tempElement.width, this.tempElement.height) / 2;
        this.tempElement.cornerRadius = Math.min(this.cornerRadius, maxRadius);

        this.tempElement.points = this.calculateStadiumPoints(
            this.tempElement.start,
            point,
            this.tempElement.cornerRadius
        );

        this.updateTempGeometry();
        this.updateStadiumDimensions();

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
        config.fields[2].value = this.tempElement.cornerRadius.toFixed(1);

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
            this.sketchManager.inputField3.value = this.tempElement.cornerRadius.toFixed(1);
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
        if (values.value3 && values.value3 > 0) {
            this.tempElement.cornerRadius = values.value3;
        }

        // Пересчитываем конечную точку с учетом направлений рисования
        this.tempElement.end.x = this.tempElement.start.x + (this.tempElement.width * this.directionX);
        this.tempElement.end.y = this.tempElement.start.y + (this.tempElement.height * this.directionY);

        // Проверяем, что радиус не превышает допустимый
        const maxRadius = Math.min(this.tempElement.width, this.tempElement.height) / 2;
        this.tempElement.cornerRadius = Math.min(this.tempElement.cornerRadius, maxRadius);

        this.tempElement.points = this.calculateStadiumPoints(
            this.tempElement.start,
            this.tempElement.end,
            this.tempElement.cornerRadius
        );

        this.sketchManager.elementManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.tempElement = null;
    }

    updateStadiumDimensions() {
        if (!this.tempElement) return;

        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.createStadiumDimensions();
    }

    createStadiumDimensions() {
        if (!this.sketchManager.currentPlane || !this.tempElement) return;

        const localStart = this.sketchManager.currentPlane.worldToLocal(this.tempElement.start.clone());
        const localEnd = this.sketchManager.currentPlane.worldToLocal(this.tempElement.end.clone());

        const minX = Math.min(localStart.x, localEnd.x);
        const maxX = Math.max(localStart.x, localEnd.x);
        const minY = Math.min(localStart.y, localEnd.y);
        const maxY = Math.max(localStart.y, localEnd.y);

        const width = maxX - minX;
        const height = maxY - minY;
        const cornerRadius = this.tempElement.cornerRadius;

        // Общая длина (с учетом скруглений)
        const effectiveLength = width - (2 * cornerRadius);

        // Линия для общей длины
        const lengthLineStart = new THREE.Vector3(minX + cornerRadius, minY - 10, 0.1);
        const lengthLineEnd = new THREE.Vector3(maxX - cornerRadius, minY - 10, 0.1);

        const lengthGeometry = new THREE.BufferGeometry().setFromPoints([lengthLineStart, lengthLineEnd]);
        const lengthMaterial = new THREE.LineBasicMaterial({
            color: this.sketchManager.dimensionColor,
            linewidth: 2
        });
        const lengthLine = new THREE.Line(lengthGeometry, lengthMaterial);

        const lengthExt1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(minX + cornerRadius, minY, 0.1),
                new THREE.Vector3(minX + cornerRadius, minY - 10, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const lengthExt2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(maxX - cornerRadius, minY, 0.1),
                new THREE.Vector3(maxX - cornerRadius, minY - 10, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const lengthTextPos = new THREE.Vector3(minX + width / 2, minY - 15, 0.1);
        this.createDimensionText(lengthTextPos, `Длина: ${effectiveLength.toFixed(1)}`);

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
        this.createDimensionText(heightTextPos, `Высота: ${height.toFixed(1)}`);

        // Радиус скругления
        const radiusStart = new THREE.Vector3(minX + cornerRadius, minY + cornerRadius, 0.1);
        const radiusTextPos = new THREE.Vector3(minX + cornerRadius - 10, minY + cornerRadius + 10, 0.1);
        this.createDimensionText(radiusTextPos, `R: ${cornerRadius.toFixed(1)}`);

        // Линия для радиуса
        const radiusLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(minX, minY + cornerRadius, 0.1),
                radiusStart
            ]),
            new THREE.LineBasicMaterial({
                color: this.sketchManager.dimensionColor,
                linewidth: 2,
                linecap: 'round',
                linejoin: 'round'
            })
        );

        [lengthLine, lengthExt1, lengthExt2, heightLine, heightExt1, heightExt2, radiusLine].forEach(obj => {
            obj.userData.isDimension = true;
            this.sketchManager.currentPlane.add(obj);
            this.sketchManager.dimensionObjects.push(obj);
        });
    }

    calculateStadiumPoints(start, end, cornerRadius) {
        if (!this.sketchManager.currentPlane) return [];

        const localStart = this.sketchManager.currentPlane.worldToLocal(start.clone());
        const localEnd = this.sketchManager.currentPlane.worldToLocal(end.clone());

        const minX = Math.min(localStart.x, localEnd.x);
        const maxX = Math.max(localStart.x, localEnd.x);
        const minY = Math.min(localStart.y, localEnd.y);
        const maxY = Math.max(localStart.y, localEnd.y);

        const width = maxX - minX;
        const height = maxY - minY;

        // Проверяем, что радиус скругления допустим
        const actualRadius = Math.min(cornerRadius, Math.min(width, height) / 2);

        const points = [];
        const segments = this.segments;

        // Верхняя дуга (справа налево)
        for (let i = 0; i <= segments; i++) {
            const angle = Math.PI - (i / segments) * Math.PI;
            const x = maxX - actualRadius + Math.cos(angle) * actualRadius;
            const y = maxY - actualRadius + Math.sin(angle) * actualRadius;
            points.push(this.sketchManager.currentPlane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        // Левая прямая
        points.push(this.sketchManager.currentPlane.localToWorld(new THREE.Vector3(minX + actualRadius, minY, 0)));

        // Нижняя дуга (слева направо)
        for (let i = 0; i <= segments; i++) {
            const angle = Math.PI + (i / segments) * Math.PI;
            const x = minX + actualRadius + Math.cos(angle) * actualRadius;
            const y = minY + actualRadius + Math.sin(angle) * actualRadius;
            points.push(this.sketchManager.currentPlane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        // Правая прямая
        points.push(this.sketchManager.currentPlane.localToWorld(new THREE.Vector3(maxX - actualRadius, maxY, 0)));

        // Замыкаем контур
        points.push(points[0].clone());

        return points;
    }

    createDimensionText(position, text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 14px Arial';
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