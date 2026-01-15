/**
 * Инструмент "Дуга" (Дуга окружности)
 */
class ArcSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'arc', 'fa-arc');
        this.radius = 10;
        this.startAngle = 0;
        this.endAngle = 90;
        this.segments = 32;
        this.drawingStage = 0; // 0: центр, 1: начальная точка, 2: конечная точка

        this.dimensionFields = [
            { label: 'Радиус', type: 'number', value: this.radius, unit: 'мм', min: 1, step: 1 },
            { label: 'Начальный угол', type: 'number', value: this.startAngle, unit: '°', min: 0, max: 360, step: 1 },
            { label: 'Конечный угол', type: 'number', value: this.endAngle, unit: '°', min: 0, max: 360, step: 1 }
        ];
    }

    onMouseDown(e) {
        if (this.sketchManager.isInputActive) {
            this.sketchManager.applyDimensionInput();
            return true;
        }

        const point = this.getPointOnPlane(e);
        if (!point) return false;

        switch (this.drawingStage) {
            case 0: // Указываем центр
                this.tempElement = {
                    type: 'arc',
                    center: point.clone(),
                    radius: 0,
                    startAngle: 0,
                    endAngle: 0,
                    segments: this.segments,
                    points: [],
                    color: this.sketchManager.sketchColor
                };
                this.drawingStage = 1;
                this.sketchManager.editor.showStatus('Укажите начальную точку дуги', 'info');
                break;

            case 1: // Указываем начальную точку
                const startVector = new THREE.Vector3().subVectors(point, this.tempElement.center);
                this.tempElement.radius = startVector.length();
                this.tempElement.startAngle = Math.atan2(startVector.y, startVector.x);
                this.drawingStage = 2;
                this.sketchManager.editor.showStatus('Укажите конечную точку дуги', 'info');
                this.createTempGeometry();
                break;

            case 2: // Указываем конечную точку
                const endVector = new THREE.Vector3().subVectors(point, this.tempElement.center);
                this.tempElement.endAngle = Math.atan2(endVector.y, endVector.x);
                this.finishDrawing(e);
                break;
        }

        return true;
    }

    onMouseMove(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return;

        if (this.drawingStage === 1 && this.tempElement) {
            // Обновляем радиус при перемещении мыши
            const vector = new THREE.Vector3().subVectors(point, this.tempElement.center);
            this.tempElement.radius = vector.length();
            this.tempElement.startAngle = Math.atan2(vector.y, vector.x);
            this.updateArcPreview();
        } else if (this.drawingStage === 2 && this.tempElement) {
            // Обновляем конечный угол
            const vector = new THREE.Vector3().subVectors(point, this.tempElement.center);
            this.tempElement.endAngle = Math.atan2(vector.y, vector.x);
            this.updateArcPreview();
        }
    }

    updateArcPreview() {
        if (!this.tempElement) return;

        // Нормализуем углы
        let startAngle = this.tempElement.startAngle;
        let endAngle = this.tempElement.endAngle;

        // Убеждаемся, что дуга рисуется в правильном направлении
        if (endAngle < startAngle) {
            endAngle += Math.PI * 2;
        }

        // Рассчитываем точки дуги
        this.tempElement.points = this.calculateArcPoints(
            this.tempElement.center,
            this.tempElement.radius,
            startAngle,
            endAngle,
            this.tempElement.segments
        );

        if (!this.tempGeometry) {
            this.createTempGeometry();
        } else {
            this.updateTempGeometry();
        }
    }

    finishDrawing(e) {
        if (!this.tempElement) return;

        // Преобразуем углы в градусы для отображения
        this.startAngle = THREE.MathUtils.radToDeg(this.tempElement.startAngle);
        this.endAngle = THREE.MathUtils.radToDeg(this.tempElement.endAngle);

        const config = this.getDimensionConfig();
        config.fields[0].value = this.tempElement.radius.toFixed(1);
        config.fields[1].value = this.startAngle.toFixed(1);
        config.fields[2].value = this.endAngle.toFixed(1);

        this.sketchManager.dimensionManager.showDimensionInput(e, config);
        this.drawingStage = 0;
    }

    applyDimensions(values) {
        if (!this.tempElement) return;

        if (values.value1 && values.value1 > 0) {
            this.tempElement.radius = values.value1;
        }
        if (values.value2 !== undefined) {
            this.tempElement.startAngle = THREE.MathUtils.degToRad(values.value2);
        }
        if (values.value3 !== undefined) {
            this.tempElement.endAngle = THREE.MathUtils.degToRad(values.value3);
        }

        // Нормализуем углы
        let startAngle = this.tempElement.startAngle;
        let endAngle = this.tempElement.endAngle;

        if (endAngle < startAngle) {
            endAngle += Math.PI * 2;
        }

        this.tempElement.points = this.calculateArcPoints(
            this.tempElement.center,
            this.tempElement.radius,
            startAngle,
            endAngle,
            this.tempElement.segments
        );

        this.sketchManager.elementManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.tempElement = null;
    }

    calculateArcPoints(center, radius, startAngle, endAngle, segments) {
        if (!this.sketchManager.currentPlane) return [];

        const localCenter = this.sketchManager.currentPlane.worldToLocal(center.clone());
        const points = [];
        const angleRange = endAngle - startAngle;

        for (let i = 0; i <= segments; i++) {
            const angle = startAngle + (i / segments) * angleRange;
            const x = localCenter.x + Math.cos(angle) * radius;
            const y = localCenter.y + Math.sin(angle) * radius;
            points.push(this.sketchManager.currentPlane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        return points;
    }

    createGeometry(element) {
        if (!element.points || element.points.length < 2) return null;

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
        if (!element.points || element.points.length < 2) return;

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
        this.drawingStage = 0;
        super.onCancel();
    }
}