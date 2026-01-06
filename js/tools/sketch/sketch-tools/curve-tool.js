/**
 * Инструмент "Кривая Безье"
 */
class CurveSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'curve', 'fa-wave-square');
        this.controlPoints = [];
        this.segments = 32;
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
                color: this.sketchManager.sketchColor
            };
            this.createTempGeometry();
        } else if (this.controlPoints.length === 2) {
            this.tempElement.controlPoints.push(point.clone());
            this.updateCurve();
        } else if (this.controlPoints.length === 3) {
            this.tempElement.controlPoints.push(point.clone());
            this.updateCurve();
        } else if (this.controlPoints.length === 4) {
            this.tempElement.controlPoints.push(point.clone());
            this.updateCurve();
            this.finishDrawing();
        }

        return true;
    }

    updateCurve() {
        if (this.tempElement.controlPoints.length < 2) return;

        const points = this.tempElement.controlPoints.map(p =>
            this.sketchManager.currentPlane.worldToLocal(p.clone())
        );

        let curve;
        if (points.length === 2) {
            curve = new THREE.LineCurve3(points[0], points[1]);
        } else if (points.length === 3) {
            curve = new THREE.QuadraticBezierCurve3(points[0], points[1], points[2]);
        } else if (points.length === 4) {
            curve = new THREE.CubicBezierCurve3(points[0], points[1], points[2], points[3]);
        }

        this.tempElement.curvePoints = curve.getPoints(this.segments);
        this.updateTempGeometry();
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.tempElement) return;

        const point = this.getPointOnPlane(e);
        if (!point) return;

        if (this.controlPoints.length > 0) {
            this.tempElement.controlPoints[this.controlPoints.length] = point.clone();
            this.updateCurve();
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.isDrawing) {
            this.onCancel();
            return true;
        } else if (e.key === 'Enter' && this.isDrawing && this.controlPoints.length >= 2) {
            this.finishDrawing();
            return true;
        }
        return false;
    }

    onCancel() {
        this.controlPoints = [];
        this.isDrawing = false;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.editor.showStatus('Создание кривой отменено', 'info');
    }

    finishDrawing() {
        if (this.tempElement && this.tempElement.curvePoints.length >= 2) {
            this.sketchManager.addElement(this.tempElement);
            this.sketchManager.editor.showStatus('Кривая создана', 'success');
        }
        this.onCancel();
    }

    createGeometry(element) {
        if (!element.curvePoints || element.curvePoints.length < 2) return null;

        const vertices = [];
        element.curvePoints.forEach(point => {
            vertices.push(point.x, point.y, point.z);
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
            vertices.push(point.x, point.y, point.z);
        });

        mesh.geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(vertices, 3));
        mesh.geometry.attributes.position.needsUpdate = true;
    }
}