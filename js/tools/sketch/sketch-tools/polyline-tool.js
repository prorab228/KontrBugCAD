/**
 * Инструмент "Полилиния"
 */
class PolylineSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'polyline', 'fa-draw-polygon');
        this.polylinePoints = [];
    }

    onMouseDown(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return false;

        this.isDrawing = true;

        if (!this.tempElement || this.tempElement.type !== 'polyline') {
            this.polylinePoints = [point.clone()];
            this.tempElement = {
                type: 'polyline',
                points: [point.clone()],
                color: this.sketchManager.sketchColor,
                isComplete: false
            };
            this.createTempGeometry();
        } else {
            this.tempElement.points.push(point.clone());
            this.polylinePoints.push(point.clone());
            this.updateTempGeometry();
            this.sketchManager.editor.showStatus(`Точка ${this.tempElement.points.length} добавлена`, 'info');
        }

        return true;
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.tempElement) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        if (this.tempElement.points.length === 1) {
            this.tempElement.points = [this.tempElement.points[0], point.clone()];
        } else if (this.tempElement.points.length > 1) {
            this.tempElement.points[this.tempElement.points.length - 1] = point.clone();
        }

        this.updateTempGeometry();
    }

    onMouseUp(e) {
        // Для полилинии не завершаем при клике, ждем двойного клика или Enter
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.isDrawing) {
            this.onCancel();
            return true;
        } else if (e.key === 'Enter' && this.isDrawing) {
            this.completePolyline();
            return true;
        } else if (e.key === 'Backspace' && this.isDrawing && this.tempElement) {
            this.removeLastPoint();
            return true;
        }
        return false;
    }

    onCancel() {
        this.isDrawing = false;
        this.clearTempGeometry();
        this.tempElement = null;
        this.polylinePoints = [];
        this.sketchManager.editor.showStatus('Создание полилинии отменено', 'info');
    }

    completePolyline() {
        if (!this.tempElement || this.tempElement.points.length < 2) {
            this.onCancel();
            this.sketchManager.editor.showStatus('Полилиния должна содержать минимум 2 точки', 'warning');
            return;
        }

        const lastPoint = this.tempElement.points[this.tempElement.points.length - 1];
        const secondLastPoint = this.tempElement.points[this.tempElement.points.length - 2];
        if (lastPoint.distanceTo(secondLastPoint) < 0.1) {
            this.tempElement.points.pop();
        }

        this.sketchManager.addElement(this.tempElement);
        this.clearTempGeometry();
        this.tempElement = null;
        this.polylinePoints = [];
        this.isDrawing = false;
        this.sketchManager.editor.showStatus('Полилиния создана', 'success');
    }

    removeLastPoint() {
        if (!this.tempElement || this.tempElement.points.length <= 2) {
            this.onCancel();
            return;
        }

        this.tempElement.points.pop();
        this.polylinePoints.pop();
        this.updateTempGeometry();
        this.sketchManager.editor.showStatus('Последняя точка удалена', 'info');
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