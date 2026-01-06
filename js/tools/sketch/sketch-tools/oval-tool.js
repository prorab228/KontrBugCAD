/**
 * Инструмент "Овал" (Эллипс)
 */
class OvalSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'oval', 'fa-circle-notch');
        this.radiusX = 10;
        this.radiusY = 5;
        this.segments = 32;

        this.dimensionFields = [
            { label: 'Радиус X', type: 'number', value: this.radiusX, unit: 'мм', min: 1, step: 1 },
            { label: 'Радиус Y', type: 'number', value: this.radiusY, unit: 'мм', min: 1, step: 1 },
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
            center: point.clone(),
            radiusX: 5,
            radiusY: 5,
            segments: this.segments,
            points: this.calculateOvalPoints(point, 0, 0, this.segments),
            color: this.sketchManager.sketchColor
        };

        this.createTempGeometry();
        return true;
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.tempElement) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        // Рассчитываем радиусы по осям
        this.tempElement.radiusX = Math.abs(point.x - this.tempElement.center.x);
        this.tempElement.radiusY = Math.abs(point.y - this.tempElement.center.y);
        this.tempElement.points = this.calculateOvalPoints(
            this.tempElement.center,
            this.tempElement.radiusX,
            this.tempElement.radiusY,
            this.tempElement.segments
        );

        this.updateTempGeometry();

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

    finishDrawing(e) {
        const config = this.getDimensionConfig();
        config.fields[0].value = this.tempElement.radiusX.toFixed(1);
        config.fields[1].value = this.tempElement.radiusY.toFixed(1);
        config.fields[2].value = this.tempElement.segments;

        this.sketchManager.showDimensionInput(e, config);
    }

    updateInputFields() {
        if (!this.sketchManager.isInputActive || !this.tempElement) return;

        if (this.sketchManager.inputField1) {
            this.sketchManager.inputField1.value = this.tempElement.radiusX.toFixed(1);
        }
        if (this.sketchManager.inputField2) {
            this.sketchManager.inputField2.value = this.tempElement.radiusY.toFixed(1);
        }
        if (this.sketchManager.inputField3) {
            this.sketchManager.inputField3.value = this.tempElement.segments;
        }
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        if (values.value1 && values.value1 > 0) {
            this.tempElement.radiusX = values.value1;
        }
        if (values.value2 && values.value2 > 0) {
            this.tempElement.radiusY = values.value2;
        }
        if (values.value3 && values.value3 >= 8) {
            this.tempElement.segments = Math.min(64, Math.max(8, values.value3));
        }

        this.tempElement.points = this.calculateOvalPoints(
            this.tempElement.center,
            this.tempElement.radiusX,
            this.tempElement.radiusY,
            this.tempElement.segments
        );

        this.sketchManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.tempElement = null;
    }

    calculateOvalPoints(center, radiusX, radiusY, segments) {
        if (!this.sketchManager.currentPlane) return [];

        const localCenter = this.sketchManager.currentPlane.worldToLocal(center.clone());
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = localCenter.x + Math.cos(theta) * radiusX;
            const y = localCenter.y + Math.sin(theta) * radiusY;
            points.push(this.sketchManager.currentPlane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        return points;
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