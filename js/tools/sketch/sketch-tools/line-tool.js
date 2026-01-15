/**
 * Инструмент "Линия"
 */
class LineSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'line', 'fa-slash');
        this.dimensionFields = [
            { label: 'Длина', type: 'number', value: 10, unit: 'мм', min: 1, step: 1 }
        ];
    }

    onMouseDown(e) {
        console.log('line onMouseDown')
        if (this.sketchManager.dimensionManager.isInputActive) {
            this.sketchManager.dimensionManager.applyDimensionInput();
            return true;
        }

        const point = this.getPointOnPlane(e);
        if (!point) return false;

        this.isDrawing = true;
        this.tempElement = {
            type: 'line',
            start: point.clone(),
            end: point.clone(),
            length: 0,
            points: [point.clone(), point.clone()],
            color: this.sketchManager.sketchColor
        };

        this.createTempGeometry();
        return true;
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.tempElement) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        // Сохраняем оригинальную точку для вычислений
        this.tempElement.originalEnd = point.clone();

        // Если есть перпендикулярная привязка, она уже обновит tempElement.end через SnapHelper
        // Проверяем, не активна ли перпендикулярная привязка
        if (!this.sketchManager.snapHelper.perpendicularActive) {
            this.tempElement.end = point.clone();
            this.tempElement.points[1] = point.clone();
            this.tempElement.length = this.tempElement.start.distanceTo(point);
        } else {
            // Используем уже скорректированную точку из tempElement
            this.tempElement.length = this.tempElement.start.distanceTo(this.tempElement.end);
        }

        this.updateTempGeometry();
        this.updateLineDimensions(this.tempElement.start, this.tempElement.end);

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
        config.fields[0].value = this.tempElement.length.toFixed(1);

        this.sketchManager.dimensionManager.showDimensionInput(e, config);
    }

    updateInputFields() {
        if (!this.sketchManager.isInputActive || !this.tempElement) return;

        if (this.sketchManager.inputField1) {
            this.sketchManager.inputField1.value = this.tempElement.length.toFixed(1);
        }
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        if (values.value1 && values.value1 > 0) {
            this.updateLineLength(values.value1);
        }

        this.sketchManager.elementManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.tempElement = null;
    }

    updateLineLength(length) {
        if (!this.tempElement) return;

        this.tempElement.length = length;
        const direction = new THREE.Vector3().subVectors(
            this.tempElement.end,
            this.tempElement.start
        ).normalize();

        if (direction.length() === 0) {
            direction.set(1, 0, 0);
        }

        this.tempElement.end = this.tempElement.start.clone().add(
            direction.multiplyScalar(length)
        );
        this.tempElement.points[1] = this.tempElement.end.clone();

        this.updateTempGeometry();
        this.updateLineDimensions(this.tempElement.start, this.tempElement.end);
    }

    updateLineDimensions(start, end) {
        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.createLineDimension(start, end);
    }

    createLineDimension(start, end) {
        if (!this.sketchManager.currentPlane) return;

        const localStart = this.sketchManager.currentPlane.worldToLocal(start.clone());
        const localEnd = this.sketchManager.currentPlane.worldToLocal(end.clone());

        const dx = localEnd.x - localStart.x;
        const dy = localEnd.y - localStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        const direction = new THREE.Vector3(dx, dy, 0).normalize();
        const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
        const offsetDist = 10;

        const lineStart = new THREE.Vector3(
            localStart.x + perpendicular.x * offsetDist,
            localStart.y + perpendicular.y * offsetDist,
            0.1
        );
        const lineEnd = new THREE.Vector3(
            localEnd.x + perpendicular.x * offsetDist,
            localEnd.y + perpendicular.y * offsetDist,
            0.1
        );

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([lineStart, lineEnd]);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: this.sketchManager.dimensionColor,
            linewidth: 2
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);

        const extLine1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localStart.x, localStart.y, 0.1),
                lineStart
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const extLine2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localEnd.x, localEnd.y, 0.1),
                lineEnd
            ]),
            new THREE.LineBasicMaterial({ color: this.sketchManager.dimensionColor, linewidth: 1 })
        );

        const textPos = new THREE.Vector3()
            .addVectors(lineStart, lineEnd)
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(
                -perpendicular.y * 5,
                perpendicular.x * 5,
                0.1
            ));

        this.createDimensionText(textPos, `${length.toFixed(1)} мм`);

        [line, extLine1, extLine2].forEach(obj => {
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

    onCancel() {
        this.isDrawing = false;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.dimensionManager.clearDimensionObjects();
    }

    createGeometry(element) {
        const vertices = [];
        element.points.forEach(point => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
            vertices.push(localPoint.x, localPoint.y, 0);
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        return new THREE.Line(geometry, new THREE.LineBasicMaterial({
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