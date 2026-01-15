/**
 * Инструмент "Кривая Безье" с возможностью создавать кубические кривые по 4 точкам
 */
class CurveSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'curve', 'fa-wave-square');
        this.controlPoints = [];
        this.segments = 32;
        this.isDrawing = false;

        this.dimensionFields = [
            { label: 'Тип кривой', type: 'select', options: ['Квадратичная', 'Кубическая'], value: 'Кубическая' },
            { label: 'Сегменты', type: 'number', value: this.segments, unit: 'шт', min: 8, max: 100, step: 4 }
        ];
    }

    onMouseDown(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return false;

        this.controlPoints.push(point.clone());

        if (this.controlPoints.length === 1) {
            this.isDrawing = true;
            this.tempElement = {
                type: 'curve',
                controlPoints: [point.clone()],
                curvePoints: [],
                segments: this.segments,
                curveType: 'cubic', // 'quadratic' или 'cubic'
                color: this.sketchManager.sketchColor
            };
            this.sketchManager.editor.showStatus('Добавлена первая точка. Добавьте контрольные точки (всего 4 для кубической кривой).', 'info');
            this.createTempGeometry();
        } else if (this.controlPoints.length === 2) {
            this.tempElement.controlPoints.push(point.clone());
            this.updateCurve();
            this.sketchManager.editor.showStatus('Добавлена вторая точка. Добавьте еще точки для кривой.', 'info');
        } else if (this.controlPoints.length === 3) {
            this.tempElement.controlPoints.push(point.clone());
            this.updateCurve();
            this.sketchManager.editor.showStatus('Добавлена третья точка. Добавьте последнюю точку для кубической кривой.', 'info');
        } else if (this.controlPoints.length === 4) {
            this.tempElement.controlPoints.push(point.clone());
            this.updateCurve();
            this.finishDrawing();
        }

        return true;
    }

    updateCurve() {
        if (!this.tempElement || this.tempElement.controlPoints.length < 2) return;

        // Преобразуем точки в локальные координаты плоскости
        const localPoints = this.tempElement.controlPoints.map(p => {
            if (!this.sketchManager.currentPlane) return new THREE.Vector3();
            const local = this.sketchManager.currentPlane.worldToLocal(p.clone());
            return new THREE.Vector3(local.x, local.y, 0);
        });

        let curve;
        const pointCount = localPoints.length;

        // В зависимости от количества точек создаем соответствующую кривую
        if (pointCount === 2) {
            // Линейная кривая (прямая линия)
            curve = new THREE.LineCurve(localPoints[0], localPoints[1]);
        } else if (pointCount === 3) {
            // Квадратичная кривая Безье
            curve = new THREE.QuadraticBezierCurve(
                localPoints[0], // начальная точка
                localPoints[1], // контрольная точка
                localPoints[2]  // конечная точка
            );
            this.tempElement.curveType = 'quadratic';
        } else if (pointCount >= 4) {
            // Кубическая кривая Безье (используем первые 4 точки)
            curve = new THREE.CubicBezierCurve(
                localPoints[0], // начальная точка
                localPoints[1], // контрольная точка 1
                localPoints[2], // контрольная точка 2
                localPoints[3]  // конечная точка
            );
            this.tempElement.curveType = 'cubic';
        }

        // Если кривая создана успешно, получаем точки для отрисовки
        if (curve) {
            this.tempElement.curvePoints = curve.getPoints(this.segments);

            // Преобразуем обратно в мировые координаты для отображения
            this.tempElement.curvePoints = this.tempElement.curvePoints.map(p => {
                if (!this.sketchManager.currentPlane) return p;
                return this.sketchManager.currentPlane.localToWorld(p);
            });

            this.updateTempGeometry();
            this.updateControlPointMarkers();
        }
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.tempElement) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        // Обновляем предпросмотр последней точки
        const controlPoints = [...this.tempElement.controlPoints];

        if (controlPoints.length === 1) {
            // Показываем линию от первой точки до курсора
            this.tempElement.controlPoints = [controlPoints[0], point.clone()];
        } else if (controlPoints.length === 2) {
            // Показываем квадратичную кривую с предпросмотром третьей точки
            this.tempElement.controlPoints = [controlPoints[0], controlPoints[1], point.clone()];
        } else if (controlPoints.length === 3) {
            // Показываем кубическую кривую с предпросмотром четвертой точки
            this.tempElement.controlPoints = [controlPoints[0], controlPoints[1], controlPoints[2], point.clone()];
        } else if (controlPoints.length >= 4) {
            // Все точки уже есть, не обновляем
            return;
        }

        this.updateCurve();
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.isDrawing) {
            this.onCancel();
            return true;
        } else if (e.key === 'Enter' && this.isDrawing && this.controlPoints.length >= 2) {
            this.finishDrawing();
            return true;
        } else if (e.key === 'Backspace' && this.isDrawing && this.controlPoints.length > 1) {
            this.removeLastPoint();
            return true;
        }
        return false;
    }

    onCancel() {
        this.controlPoints = [];
        this.isDrawing = false;
        this.clearTempGeometry();
        this.clearControlPointMarkers();
        this.tempElement = null;
        this.sketchManager.editor.showStatus('Создание кривой отменено', 'info');
    }

    finishDrawing() {
        if (this.tempElement && this.tempElement.curvePoints.length >= 2) {
            // Сохраняем финальную кривую
            this.sketchManager.elementManager.addElement(this.tempElement);
            this.sketchManager.editor.showStatus('Кривая создана', 'success');
        } else {
            this.sketchManager.editor.showStatus('Недостаточно точек для создания кривой', 'warning');
        }
        this.onCancel();
    }

    removeLastPoint() {
        if (!this.tempElement || this.controlPoints.length <= 1) {
            this.onCancel();
            return;
        }

        this.controlPoints.pop();
        this.tempElement.controlPoints.pop();

        if (this.controlPoints.length === 0) {
            this.onCancel();
        } else {
            this.updateCurve();
            this.sketchManager.editor.showStatus('Последняя точка удалена', 'info');
        }
    }

    updateControlPointMarkers() {
        if (!this.tempElement || !this.sketchManager.currentPlane) return;

        // Удаляем старые маркеры
        this.clearControlPointMarkers();

        // Создаем маркеры для контрольных точек
        this.tempElement.controlPoints.forEach((point, index) => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());

            // Создаем геометрию маркера (крест)
            const size = 3;
            const geometry = new THREE.BufferGeometry();
            const vertices = new Float32Array([
                localPoint.x - size, localPoint.y, 0.1,
                localPoint.x + size, localPoint.y, 0.1,
                localPoint.x, localPoint.y - size, 0.1,
                localPoint.x, localPoint.y + size, 0.1
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

            const material = new THREE.LineBasicMaterial({
                color: index === 0 || index === this.tempElement.controlPoints.length - 1 ? 0xFF0000 : 0x00FF00,
                linewidth: 2
            });

            const marker = new THREE.LineSegments(geometry, material);
            marker.userData = { isControlPoint: true, index: index };

            this.sketchManager.currentPlane.add(marker);
            this.controlPointMarkers = this.controlPointMarkers || [];
            this.controlPointMarkers.push(marker);
        });
    }

    clearControlPointMarkers() {
        if (this.controlPointMarkers) {
            this.controlPointMarkers.forEach(marker => {
                if (marker.parent) marker.parent.remove(marker);
                if (marker.geometry) marker.geometry.dispose();
                if (marker.material) marker.material.dispose();
            });
            this.controlPointMarkers = [];
        }
    }

    createGeometry(element) {
        if (!element.curvePoints || element.curvePoints.length < 2) return null;

        const vertices = [];
        element.curvePoints.forEach(point => {
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
        if (!element.curvePoints || element.curvePoints.length < 2) return;

        const vertices = [];
        element.curvePoints.forEach(point => {
            const localPoint = this.sketchManager.currentPlane.worldToLocal(point.clone());
            vertices.push(localPoint.x, localPoint.y, 0);
        });

        mesh.geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(vertices, 3));
        mesh.geometry.attributes.position.needsUpdate = true;
    }

    clearTempGeometry() {
        super.clearTempGeometry();
        this.clearControlPointMarkers();
    }
}