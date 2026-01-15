/**
 * Инструмент "Многоугольник"
 */
class PolygonSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'polygon', 'fa-shapes');
        this.radius = 5;
        this.sides = 6;

        this.dimensionFields = [
            { label: 'Радиус опис. окр.', type: 'number', value: this.radius, unit: 'мм', min: 1, step: 1 },
            { label: 'Вершины', type: 'number', value: this.sides, unit: 'шт', min: 3, max: 20, step: 1 }
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
            type: 'polygon',
            center: point.clone(),
            radius: 0,
            sides: this.sides,
            points: this.calculatePolygonPoints(point, 0, this.sides),
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
        this.tempElement.points = this.calculatePolygonPoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.tempElement.sides
        );

        this.updateTempGeometry();

        // Обновляем поле ввода
        if (this.sketchManager.isInputActive) {
            this.updateInputFields();
        }
    }

    onMouseUp(e) {  // <-- Теперь принимает параметр e
        if (!this.isDrawing) return;

        const point = this.getPointOnPlane(e);
        if (point) {
            this.finishDrawing(e);  // <-- Передаем событие e
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
        this.sketchManager.dimensionManager.clearDimensionObjects();
    }

    finishDrawing(e) {  // <-- Теперь принимает параметр e
        const config = this.getDimensionConfig();
        config.fields[0].value = this.tempElement.radius.toFixed(1);
        config.fields[1].value = this.tempElement.sides;

        this.sketchManager.dimensionManager.showDimensionInput(e, config);  // <-- Теперь e определено
    }

    updateInputFields() {
        if (!this.sketchManager.isInputActive || !this.tempElement) return;

        if (this.sketchManager.inputField1) {
            this.sketchManager.inputField1.value = this.tempElement.radius.toFixed(1);
        }
        if (this.sketchManager.inputField2) {
            this.sketchManager.inputField2.value = this.tempElement.sides;
        }
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        if (values.value1 && values.value1 > 0) {
            this.tempElement.radius = values.value1;
        }
        if (values.value2 && values.value2 >= 3) {
            this.tempElement.sides = Math.min(20, Math.max(3, values.value2));
        }

        this.tempElement.points = this.calculatePolygonPoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.tempElement.sides
        );

        this.sketchManager.elementManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.tempElement = null;
    }

    updatePolygonDiameter(diameter) {
        if (!this.tempElement) return;

        this.tempElement.diameter = diameter;
        this.tempElement.radius = diameter / 2;
        this.tempElement.points = this.calculatePolygonPoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.tempElement.sides
        );

        this.updateTempGeometry();
        this.sketchManager.updatePolygonDimensions(this.tempElement.center, this.tempElement.radius, this.tempElement.sides);
    }

    updatePolygonSides(sides) {
        if (!this.tempElement) return;

        this.tempElement.sides = Math.max(3, Math.min(50, sides));
        this.tempElement.points = this.calculatePolygonPoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.tempElement.sides
        );

        this.updateTempGeometry();
        this.sketchManager.updatePolygonDimensions(this.tempElement.center, this.tempElement.radius, this.tempElement.sides);
    }

    calculatePolygonPoints(center, radius, sides) {
        if (!this.sketchManager.currentPlane) return [];

        const localCenter = this.sketchManager.currentPlane.worldToLocal(center.clone());
        const points = [];

        for (let i = 0; i <= sides; i++) {
            const theta = (i / sides) * Math.PI * 2;
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
