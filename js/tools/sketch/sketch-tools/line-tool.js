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
        if (this.sketchManager.isInputActive) {
            this.sketchManager.applyDimensionInput();
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

        this.tempElement.end = point.clone();
        this.tempElement.points[1] = point.clone();
        this.tempElement.length = this.tempElement.start.distanceTo(point);

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



    onCancel() {
        this.isDrawing = false;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.clearDimensionObjects();
    }

    finishDrawing(e) {
        const config = this.getDimensionConfig();
        config.fields[0].value = this.tempElement.length.toFixed(1);

        this.sketchManager.showDimensionInput(e, config);
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

        this.sketchManager.addElement(this.tempElement);
        this.clearTempGeometry();
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
        this.sketchManager.updateDimensionLine(this.tempElement.start, this.tempElement.end);
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