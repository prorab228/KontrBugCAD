/**
 * Инструмент "Окружность"
 */
class CircleSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'circle', 'fa-circle');
        this.radius = 0;
        this.diameter = 0;
        this.segments = 32;

        // Конфигурация полей ввода
        this.dimensionFields = [
            { label: 'Диаметр', type: 'number', value: 10, unit: 'мм', min: 1, step: 1 },
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
            type: 'circle',
            center: point.clone(),
            diameter: 0,
            radius: 0,
            segments: this.segments,
            points: this.calculateCirclePoints(point, 0, this.segments),
            color: this.sketchManager.sketchColor
        };

        this.createTempGeometry();
        return true;
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.tempElement) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        this.tempElement.radius = this.tempElement.center.distanceTo(point);
        this.tempElement.diameter = this.tempElement.radius * 2;
        this.tempElement.points = this.calculateCirclePoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.tempElement.segments
        );

        this.updateTempGeometry();

        // Обновляем поле ввода
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
        config.fields[0].value = this.tempElement.diameter.toFixed(1);
        config.fields[1].value = this.tempElement.segments;

        this.sketchManager.showDimensionInput(e, config);
    }

    updateInputFields() {
        if (!this.sketchManager.isInputActive || !this.tempElement) return;

        if (this.sketchManager.inputField1) {
            this.sketchManager.inputField1.value = this.tempElement.diameter.toFixed(1);
        }
        if (this.sketchManager.inputField2) {
            this.sketchManager.inputField2.value = this.tempElement.segments;
        }
    }

    onCancel() {
        this.isDrawing = false;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.clearDimensionObjects();
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        if (values.value1 && values.value1 > 0) {
            this.tempElement.diameter = values.value1;
            this.tempElement.radius = values.value1 / 2;
        }
        if (values.value2 && values.value2 >= 8) {
            this.tempElement.segments = Math.min(64, Math.max(8, values.value2));
        }

        this.tempElement.points = this.calculateCirclePoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.tempElement.segments
        );

        this.sketchManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.tempElement = null;
    }



    updateCircleDiameter(diameter) {
        if (!this.tempElement) return;

        this.tempElement.diameter = diameter;
        this.tempElement.radius = diameter / 2;
        this.tempElement.points = this.calculateCirclePoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.segments
        );

        this.updateTempGeometry();
        this.sketchManager.updateCircleDimensions(this.tempElement.center, this.tempElement.radius);
    }

    calculateCirclePoints(center, radius, segments) {
        if (!this.sketchManager.currentPlane) return [];

        const localCenter = this.sketchManager.currentPlane.worldToLocal(center.clone());
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = localCenter.x + Math.cos(theta) * radius;
            const y = localCenter.y + Math.sin(theta) * radius;
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