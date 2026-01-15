// ruler-tool.js (обновленный)
class RulerTool extends Tool {
    constructor(editor) {
        super('rulerTool', 'fa-ruler', editor);
        this.points = [];
        this.allMeasurements = [];
        this.tempLine = null;
        this.measurementText = null;
        this.measurementGroup = null;

        this.lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            linewidth: 2
        });
    }

    onActivate() {
        this.clear();
        document.body.style.cursor = 'crosshair';
        this.editor.showStatus('Линейка: кликните первую точку измерения (ESC - отмена)', 'info');
    }

    onDeactivate() {
        this.clear();
        document.body.style.cursor = 'default';
        this.clearAllMeasurements();
    }

    onMouseDown(e) {
        if (e.button !== 0) return false;

        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        let point;
        if (intersects.length > 0) {
            point = intersects[0].point;
            if (e.ctrlKey || e.metaKey) {
                point = this.snapToGeometry(intersects[0]);
            }
        } else {
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            point = new THREE.Vector3();
            if (this.editor.raycaster.ray.intersectPlane(plane, point)) {
                if (e.ctrlKey || e.metaKey) {
                    point.x = Math.round(point.x);
                    point.y = Math.round(point.y);
                    point.z = Math.round(point.z);
                }
            } else {
                return false;
            }
        }

        this.addPoint(point);
        return true;
    }

    onMouseMove(e) {
        if (this.points.length === 0) return;

        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const point = new THREE.Vector3();

        if (this.editor.raycaster.ray.intersectPlane(plane, point)) {
            this.updateTempLine(point);
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.editor.toolManager.setCurrentTool('select');
            return true;
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            this.clear();
            return true;
        }
        return false;
    }

    // Существующие методы RulerTool остаются без изменений
    addPoint(point) {
        this.points.push(point.clone());

        if (this.points.length === 1) {
            this.editor.showStatus('Линейка: кликните вторую точку (ESC - отмена)', 'info');
        } else if (this.points.length === 2) {
            this.createMeasurement();

            setTimeout(() => {
                this.points = [];
                if (this.tempLine) {
                    this.editor.scene.remove(this.tempLine);
                    this.tempLine = null;
                }
                this.editor.showStatus('Измерение завершено. Кликните для нового измерения (ESC - выход)', 'info');
            }, 100);
        }
    }

    updateTempLine(currentPoint) {
        if (this.points.length === 0) return;

        if (this.tempLine) {
            this.editor.scene.remove(this.tempLine);
        }

        const geometry = new THREE.BufferGeometry().setFromPoints([
            this.points[0],
            currentPoint
        ]);

        this.tempLine = new THREE.Line(geometry, this.lineMaterial);
        this.editor.scene.add(this.tempLine);
        this.showTempDistance(currentPoint);
    }

    showTempDistance(currentPoint) {
        if (this.points.length === 0) return;

        const distance = this.points[0].distanceTo(currentPoint);
        document.getElementById('coords').textContent =
            `Расстояние: ${distance.toFixed(2)} мм | X: ${currentPoint.x.toFixed(1)}, Y: ${currentPoint.y.toFixed(1)}, Z: ${currentPoint.z.toFixed(1)}`;
    }

    createMeasurement() {
        if (this.points.length !== 2) return;

        const point1 = this.points[0];
        const point2 = this.points[1];
        const distance = point1.distanceTo(point2);

        this.measurementGroup = new THREE.Group();
        this.measurementGroup.userData.isRulerMeasurement = true;

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([point1, point2]);
        const line = new THREE.Line(lineGeometry, this.lineMaterial);
        this.measurementGroup.add(line);

        const sphereGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        const sphere1 = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere1.position.copy(point1);
        const sphere2 = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere2.position.copy(point2);

        this.measurementGroup.add(sphere1);
        this.measurementGroup.add(sphere2);

        const midPoint = new THREE.Vector3().addVectors(point1, point2).multiplyScalar(0.5);
        const text = this.createDistanceText(distance, midPoint);

        if (text) {
            this.measurementGroup.add(text);
        }

        this.editor.scene.add(this.measurementGroup);
        this.allMeasurements.push(this.measurementGroup);

        this.editor.showStatus(`Измерение: ${distance.toFixed(2)} мм`, 'success');
    }

    createDistanceText(distance, position) {
        try {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const fontSize = 60;
            const text = `${distance.toFixed(2)} мм`;

            context.font = `${fontSize}px Arial`;
            const textWidth = context.measureText(text).width;
            const textHeight = fontSize;

            canvas.width = textWidth + 20;
            canvas.height = textHeight + 10;

            context.font = `${fontSize}px Arial`;
            context.fillStyle = '#00ff00';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(text, canvas.width / 2, canvas.height / 2);

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;

            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true
            });

            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.copy(position);
            sprite.position.y += 5;
            sprite.scale.set(canvas.width / 20, canvas.height / 20, 1);

            return sprite;
        } catch (error) {
            console.error('Ошибка создания текста:', error);
            return null;
        }
    }

    snapToGeometry(intersect) {
        return intersect.point;
    }

    clearAllMeasurements() {
        this.allMeasurements.forEach(measurement => {
            if (measurement.parent) {
                measurement.parent.remove(measurement);
            }
            measurement.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        });
        this.allMeasurements = [];
        this.measurementGroup = null;

        if (this.tempLine) {
            this.editor.scene.remove(this.tempLine);
            this.tempLine.geometry.dispose();
            this.tempLine.material.dispose();
            this.tempLine = null;
        }
    }

    clear() {
        if (this.tempLine) {
            this.editor.scene.remove(this.tempLine);
            this.tempLine.geometry.dispose();
            this.tempLine.material.dispose();
            this.tempLine = null;
        }
        this.points = [];
        document.getElementById('coords').textContent = 'X: 0.00, Y: 0.00, Z: 0.00';
    }
}