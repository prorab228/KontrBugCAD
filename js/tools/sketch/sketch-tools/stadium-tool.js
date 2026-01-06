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

        // Автоматически ограничиваем радиус скругления
        const maxRadius = Math.min(this.tempElement.width, this.tempElement.height) / 2;
        this.tempElement.cornerRadius = Math.min(this.cornerRadius, maxRadius);

        this.tempElement.points = this.calculateStadiumPoints(
            this.tempElement.start,
            point,
            this.tempElement.cornerRadius
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
        config.fields[0].value = this.tempElement.width.toFixed(1);
        config.fields[1].value = this.tempElement.height.toFixed(1);
        config.fields[2].value = this.tempElement.cornerRadius.toFixed(1);

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

        this.tempElement.end.x = this.tempElement.start.x + this.tempElement.width;
        this.tempElement.end.y = this.tempElement.start.y + this.tempElement.height;

        // Проверяем, что радиус не превышает допустимый
        const maxRadius = Math.min(this.tempElement.width, this.tempElement.height) / 2;
        this.tempElement.cornerRadius = Math.min(this.tempElement.cornerRadius, maxRadius);

        this.tempElement.points = this.calculateStadiumPoints(
            this.tempElement.start,
            this.tempElement.end,
            this.tempElement.cornerRadius
        );

        this.sketchManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.tempElement = null;
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