/**
 * Инструмент "Пунктирная линия"
 */
class DashedLineSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager);
        this.name = 'dashed-line';
        this.icon = 'fa-grip-lines';
        this.dashSize = 2;
        this.gapSize = 2;

        this.dimensionFields = [
            { label: 'Длина', type: 'number', value: 10, unit: 'мм', min: 1, step: 1 },
            { label: 'Длина штриха', type: 'number', value: this.dashSize, unit: 'мм', min: 0.5, step: 0.5 },
            { label: 'Промежуток', type: 'number', value: this.gapSize, unit: 'мм', min: 0.5, step: 0.5 }
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
            type: 'dashed-line',
            start: point.clone(),
            end: point.clone(),
            length: 0,
            dashSize: this.dashSize,
            gapSize: this.gapSize,
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

        this.tempElement.end = point.clone();
        this.tempElement.points[1] = point.clone();
        this.tempElement.length = this.tempElement.start.distanceTo(point);

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

    updateLineDimensions(start, end) {
        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.createLineDimension(start, end);
    }

    createLineDimension(start, end) {
        // Используем метод из LineSketchTool
        const lineTool = new LineSketchTool(this.sketchManager);
        lineTool.createLineDimension(start, end);
    }

    createGeometry(element) {
        const vertices = [];
        element.points.forEach(point => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
            vertices.push(localPoint.x, localPoint.y, 0);
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        // Используем LineDashedMaterial для пунктирной линии
        const material = new THREE.LineDashedMaterial({
            color: element.color || this.sketchManager.sketchColor,
            linewidth: 2,
            dashSize: element.dashSize || this.dashSize,
            gapSize: element.gapSize || this.gapSize,
            scale: 1
        });

        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();

        return line;
    }

    createTempGeometry() {
        this.clearTempGeometry();
        if (!this.tempElement) return;

        const previewElement = {...this.tempElement};
        previewElement.color = this.sketchManager.previewColor;

        const geometry = this.createGeometry(previewElement);
        if (geometry) {
            this.tempGeometry = geometry;
            this.sketchManager.currentPlane.add(this.tempGeometry);
        }
    }

    updateTempGeometry() {
        if (!this.tempGeometry || !this.tempElement) return;

        // Обновляем геометрию
        const vertices = [];
        this.tempElement.points.forEach(point => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
            vertices.push(localPoint.x, localPoint.y, 0);
        });

        this.tempGeometry.geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(vertices, 3));
        this.tempGeometry.geometry.attributes.position.needsUpdate = true;

        // Обновляем параметры пунктира
        if (this.tempGeometry.material instanceof THREE.LineDashedMaterial) {
            this.tempGeometry.material.dashSize = this.tempElement.dashSize || this.dashSize;
            this.tempGeometry.material.gapSize = this.tempElement.gapSize || this.gapSize;
            this.tempGeometry.material.needsUpdate = true;
        }

        this.tempGeometry.computeLineDistances();
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

        if (mesh.material instanceof THREE.LineDashedMaterial) {
            mesh.material.dashSize = element.dashSize || this.dashSize;
            mesh.material.gapSize = element.gapSize || this.gapSize;
            mesh.material.needsUpdate = true;
        }

        mesh.computeLineDistances();
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        if (values.value1 && values.value1 > 0) {
            this.updateLineLength(values.value1);
        }

        if (values.value2 && values.value2 > 0) {
            this.tempElement.dashSize = values.value2;
            this.dashSize = values.value2;
        }

        if (values.value3 && values.value3 > 0) {
            this.tempElement.gapSize = values.value3;
            this.gapSize = values.value3;
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

    updateInputFields() {
        if (!this.sketchManager.isInputActive || !this.tempElement) return;

        if (this.sketchManager.inputField1) {
            this.sketchManager.inputField1.value = this.tempElement.length.toFixed(1);
        }
        if (this.sketchManager.inputField2) {
            this.sketchManager.inputField2.value = (this.tempElement.dashSize || this.dashSize).toFixed(1);
        }
        if (this.sketchManager.inputField3) {
            this.sketchManager.inputField3.value = (this.tempElement.gapSize || this.gapSize).toFixed(1);
        }
    }

    finishDrawing(e) {
        if (!this.tempElement) {
            this.onCancel();
            return;
        }

        const config = this.getDimensionConfig();
        config.fields[0].value = this.tempElement.length.toFixed(1);
        config.fields[1].value = (this.tempElement.dashSize || this.dashSize).toFixed(1);
        config.fields[2].value = (this.tempElement.gapSize || this.gapSize).toFixed(1);

        this.sketchManager.dimensionManager.showDimensionInput(e, config);
    }

    onCancel() {
        this.isDrawing = false;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.dimensionManager.clearDimensionObjects();
    }
}