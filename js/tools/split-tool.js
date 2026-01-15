// js/tools/split-tool.js (улучшенная версия)
class SplitTool extends Tool {
    constructor(editor) {
        super('split', 'fa-cut', editor);
        this.requiresSelection = true;
        this.splitMode = null; // 'select_plane' или 'confirm'
        this.selectedPlane = null;
        this.tempVisuals = [];
        this.splitPlane = null;
    }

    onActivate() {
        if (!this.canActivate()) {
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        if (this.editor.selectedObjects.length !== 1) {
            this.editor.showStatus('Для разрезания выберите ровно один объект', 'error');
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        // Проверяем, что выбран не плоский объект
        const targetObject = this.editor.selectedObjects[0];
        if (targetObject.userData.type === 'work_plane' ||
            targetObject.userData.type === 'sketch_plane') {
            this.editor.showStatus('Нельзя разрезать плоскость', 'error');
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        this.splitMode = 'select_plane';
        this.selectedPlane = null;

        this.editor.showStatus('Выберите рабочую плоскость для разрезания (ESC - отмена)', 'info');
    }

    onDeactivate() {
        this.cleanup();
        document.body.style.cursor = 'default';
    }

    onMouseDown(e) {
        if (e.button !== 0 || !this.splitMode) return false;

        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        if (this.splitMode === 'select_plane') {
            // Ищем плоскости (рабочие или скетч)
            const planes = [...this.editor.workPlanes, ...this.editor.sketchPlanes];
            const planeIntersects = this.editor.raycaster.intersectObjects(planes, true);

            if (planeIntersects.length > 0) {
                const plane = planeIntersects[0].object;
                this.selectedPlane = plane;
                this.splitMode = 'confirm';

                // Создаем визуализацию плоскости разреза
                this.createSplitVisualization(plane);

                this.editor.showStatus('Нажмите ПРОБЕЛ для разрезания, ESC для отмены', 'info');
                return true;
            }
        }

        return false;
    }

    createSplitVisualization(plane) {
        this.cleanupVisualization();

        const targetObject = this.editor.selectedObjects[0];
        const bbox = new THREE.Box3().setFromObject(targetObject);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        // Создаем плоскость разреза (красная прозрачная)
        const planeGeometry = new THREE.PlaneGeometry(size.x * 1.5, size.y * 1.5);
        const planeMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });

        this.splitPlane = new THREE.Mesh(planeGeometry, planeMaterial);
        this.splitPlane.position.copy(plane.position);
        this.splitPlane.quaternion.copy(plane.quaternion);
        this.splitPlane.userData.isSplitPlane = true;
        this.editor.scene.add(this.splitPlane);
        this.tempVisuals.push(this.splitPlane);

        // Создаем контур плоскости
        const edgesGeometry = new THREE.EdgesGeometry(planeGeometry);
        const edgesMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            linewidth: 2
        });
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        edges.position.copy(plane.position);
        edges.quaternion.copy(plane.quaternion);
        edges.userData.isSplitHelper = true;
        this.editor.scene.add(edges);
        this.tempVisuals.push(edges);
    }

    performSplit() {
        if (!this.selectedPlane || this.editor.selectedObjects.length !== 1) {
            this.editor.showStatus('Не выбрана плоскость для разрезания', 'error');
            return;
        }

        const targetObject = this.editor.selectedObjects[0];
        const plane = this.selectedPlane;

        this.editor.showLoadingIndicator('Выполняется разрезание...');

        try {
            // Используем библиотеку three-bvh-csg для точного разрезания
            const result = this.cutWithCSG(targetObject, plane);

            if (result && result.positive && result.negative) {
                // Удаляем исходный объект
                this.removeObject(targetObject);

                // Добавляем новые объекты
                this.addObject(result.positive, 'положительная часть');
                this.addObject(result.negative, 'отрицательная часть');

                // Добавляем в историю как удаление и создание
                this.editor.history.addAction({
                    type: 'delete',
                    objects: [{
                        uuid: targetObject.uuid,
                        data: this.editor.projectManager.serializeObjectForHistory(targetObject)
                    }]
                });

                this.editor.history.addAction({
                    type: 'create',
                    object: result.positive.uuid,
                    data: this.editor.projectManager.serializeObjectForHistory(result.positive)
                });

                this.editor.history.addAction({
                    type: 'create',
                    object: result.negative.uuid,
                    data: this.editor.projectManager.serializeObjectForHistory(result.negative)
                });

                this.editor.clearSelection();
                this.editor.showStatus('Объект разрезан на 2 части', 'success');
            } else {
                this.editor.showStatus('Не удалось разрезать объект', 'error');
            }
        } catch (error) {
            console.error('Split error:', error);
            this.editor.showStatus(`Ошибка разрезания: ${error.message}`, 'error');
        } finally {
            this.editor.hideLoadingIndicator();
            this.cleanup();
            this.editor.toolManager.setCurrentTool('select');
        }
    }

    cutWithCSG(object, plane) {
        if (!this.editor.booleanOps) {
            throw new Error('Библиотека булевых операций не загружена');
        }

        // Получаем нормаль плоскости и точку на плоскости
        const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(plane.quaternion).normalize();
        const planePoint = plane.position.clone();

        // Создаем куб для вырезания (плоскость превращаем в толстую пластину)
        const bbox = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxSize = Math.max(size.x, size.y, size.z);

        // Создаем два полупространства
        const positiveHalf = this.createHalfSpace(planeNormal, planePoint, true, maxSize);
        const negativeHalf = this.createHalfSpace(planeNormal, planePoint, false, maxSize);

        // Выполняем пересечения для создания частей
        const positivePart = this.editor.booleanOps.intersect(object, positiveHalf);
        const negativePart = this.editor.booleanOps.intersect(object, negativeHalf);

        // Удаляем временные объекты
        if (positiveHalf.geometry) positiveHalf.geometry.dispose();
        if (negativeHalf.geometry) negativeHalf.geometry.dispose();

        return { positive: positivePart, negative: negativePart };
    }

    createHalfSpace(planeNormal, planePoint, isPositive, size) {
        // Создаем большой куб, представляющий полупространство
        const boxSize = size * 10;
        const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);

        // Позиционируем куб так, чтобы он покрывал нужную сторону плоскости
        const halfBox = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());

        // Смещаем куб в нужном направлении от плоскости
        const offset = planeNormal.clone().multiplyScalar(isPositive ? boxSize/2 : -boxSize/2);
        halfBox.position.copy(planePoint.clone().add(offset));

        // Ориентируем куб так, чтобы его грань была параллельна плоскости
        halfBox.lookAt(planePoint.clone().add(planeNormal));

        return halfBox;
    }

    removeObject(object) {
        this.editor.objectsGroup.remove(object);
        const index = this.editor.objects.indexOf(object);
        if (index > -1) {
            this.editor.objects.splice(index, 1);
        }

        // Удаляем из специальных массивов если нужно
        const type = object.userData?.type;
        if (type === 'sketch_plane') {
            const planeIndex = this.editor.sketchPlanes.indexOf(object);
            if (planeIndex > -1) {
                this.editor.sketchPlanes.splice(planeIndex, 1);
            }
        } else if (type === 'work_plane') {
            const planeIndex = this.editor.workPlanes.indexOf(object);
            if (planeIndex > -1) {
                this.editor.workPlanes.splice(planeIndex, 1);
            }
        }
    }

    addObject(object, description) {
        object.userData = {
            ...object.userData,
            name: `${object.userData?.name || 'Объект'} (${description})`,
            isSplitPart: true,
            createdAt: new Date().toISOString()
        };

        this.editor.objectsGroup.add(object);
        this.editor.objects.push(object);
    }

    onKeyDown(e) {
        if (e.key === 'Escape') {
            this.cleanup();
            this.editor.toolManager.setCurrentTool('select');
            return true;
        } else if (e.key === ' ' && this.splitMode === 'confirm') {
            this.performSplit();
            return true;
        }
        return false;
    }

    cleanupVisualization() {
        this.tempVisuals.forEach(obj => {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        this.tempVisuals = [];
        this.splitPlane = null;
    }

    cleanup() {
        this.cleanupVisualization();
        this.splitMode = null;
        this.selectedPlane = null;
    }
}