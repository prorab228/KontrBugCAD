/**
 * Менеджер вида скетча
 */
class SketchViewManager {
    constructor(sketchManager) {
        this.sketchManager = sketchManager;
        this.grid = null;
        this.gridVisible = true;

        this.originalCameraUp = new THREE.Vector3(0, 1, 0);
        this.originalCameraPosition = new THREE.Vector3();
        this.originalCameraTarget = new THREE.Vector3();
    }

    /**
     * Создание сетки скетча
     */
    createSketchGrid() {
        this.removeSketchGrid();

        if (!this.sketchManager.currentPlane || !this.gridVisible) return;

        const gridSize = 50;
        const gridStep = 1;
        const divisions = gridSize / gridStep;

        const gridColor = 0x222222;
        const centerColor = 0x555555;

        // Горизонтальные линии
        for (let i = -divisions; i <= divisions; i++) {
            const y = i * gridStep;
            this.createGridLine(-gridSize, y, gridSize, y, i === 0 ? centerColor : gridColor);
        }

        // Вертикальные линии
        for (let i = -divisions; i <= divisions; i++) {
            const x = i * gridStep;
            this.createGridLine(x, -gridSize, x, gridSize, i === 0 ? centerColor : gridColor);
        }
    }

    /**
     * Создание линии сетки
     */
    createGridLine(x1, y1, x2, y2, color) {
        const start = new THREE.Vector3(x1, y1, 0.05);
        const end = new THREE.Vector3(x2, y2, 0.05);

        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 1,
            transparent: true,
            opacity: 0.1
        });

        const line = new THREE.Line(geometry, material);
        line.userData.isGrid = true;
        this.sketchManager.currentPlane.add(line);

        if (!this.grid) this.grid = [];
        this.grid.push(line);
    }

    /**
     * Удаление сетки скетча
     */
    removeSketchGrid() {
        if (this.grid) {
            this.grid.forEach(line => {
                if (line.parent) {
                    line.parent.remove(line);
                }
                if (line.geometry) line.geometry.dispose();
                if (line.material) line.material.dispose();
            });
            this.grid = null;
        }
    }

    /**
     * Переключение сетки
     */
    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        this.sketchManager.snapEnabled = !this.sketchManager.snapEnabled;

        if (this.gridVisible) {
            this.createSketchGrid();
        } else {
            this.removeSketchGrid();
        }
    }

    /**
     * Ориентация камеры на плоскость
     */
    orientCameraToPlane(plane = this.sketchManager.currentPlane) {
        this.originalCameraUp.copy(this.sketchManager.editor.camera.up);
        this.originalCameraPosition.copy(this.sketchManager.editor.camera.position);
        this.originalCameraTarget.copy(this.sketchManager.editor.controls.target);

        const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(plane.quaternion);
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(plane.quaternion);

        const bbox = new THREE.Box3().setFromObject(plane);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxSize = Math.max(size.x, size.y, size.z);

        const planeSize = Math.max(maxSize, 100);
        const distance = planeSize / 2;
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        const cameraPosition = center.clone().add(normal.clone().multiplyScalar(distance));

        this.sketchManager.editor.camera.position.copy(cameraPosition);
        this.sketchManager.editor.camera.lookAt(center);
        this.sketchManager.editor.camera.up.copy(localY);
        this.sketchManager.editor.camera.up.normalize();

        this.sketchManager.editor.controls.target.copy(center);
        this.sketchManager.editor.controls.update();
    }

    /**
     * Восстановление камеры
     */
    restoreCamera() {
        this.sketchManager.editor.camera.up.copy(this.originalCameraUp);
        this.sketchManager.editor.camera.up.normalize();
        this.sketchManager.editor.camera.position.copy(this.originalCameraPosition);
        this.sketchManager.editor.controls.target.copy(this.originalCameraTarget);
        this.sketchManager.editor.camera.lookAt(this.sketchManager.editor.controls.target);
        this.sketchManager.editor.controls.update();
    }

    /**
     * Очистка ресурсов
     */
    clear() {
        this.removeSketchGrid();
        this.grid = null;
        this.gridVisible = true;
    }
}