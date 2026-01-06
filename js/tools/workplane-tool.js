// workplane-tool.js (улучшенная версия с единым подходом)
class WorkPlaneTool extends Tool {
    constructor(editor) {
        super('workplane', 'fa-square', editor);
        this.planesManager = editor.planesManager;
        this.workPlaneMode = null;
        this.faceSelectionObject = null;
        this.tempWorkPlane = null;
        this.hoveredPlane = null;
        this.hoveredObject = null;
    }

    // МЕТОДЫ РАБОЧИХ ПЛОСКОСТЕЙ

    createWorkPlane() {
        this.workPlaneMode = 'active';

        // Всегда показываем базовые плоскости
        if (this.editor.basePlanes) {
            this.editor.basePlanes.visible = true;
        }

        this.editor.showStatus('Выберите базовую плоскость (XY, XZ, YZ) или грань любого объекта для создания рабочей плоскости', 'info');
    }

    // ЕДИНЫЙ МЕТОД ДЛЯ ВЫБОРА ГРАНИ ЛЮБОГО ОБЪЕКТА ИЛИ БАЗОВОЙ ПЛОСКОСТИ
    handleSelection(e) {
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // ШАГ 1: Проверяем пересечение с базовыми плоскостями
        const basePlanes = this.editor.basePlanes ? this.editor.basePlanes.children : [];
        const basePlaneIntersects = this.editor.raycaster.intersectObjects(basePlanes);

        if (basePlaneIntersects.length > 0) {
            const basePlane = basePlaneIntersects[0].object;
            return this.createWorkPlaneOnBasePlane(basePlane);
        }

        // ШАГ 2: Проверяем пересечение с объектами (исключая плоскости)
        const objects = this.getAllSelectableObjects();
        const objectIntersects = this.editor.raycaster.intersectObjects(objects, true);

        if (objectIntersects.length > 0) {
            const intersect = objectIntersects[0];
            const worldNormal = this.getFaceWorldNormal(intersect);

            // Находим родительский объект
            let object = intersect.object;
            while (object.parent &&
                   object.parent !== this.editor.objectsGroup &&
                   object.parent.type !== 'Scene') {
                object = object.parent;
            }

            const objectName = object.name || 'объекте';
            return this.createWorkPlaneOnFace(intersect.point, worldNormal, `Плоскость на ${objectName}`);
        }

        return false;
    }

    // ЕДИНЫЙ МЕТОД ДЛЯ ПОДСВЕТКИ
    handleHighlight(e) {
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Сбрасываем предыдущую подсветку
        this.resetPreviousHighlight();

        let foundIntersection = false;

        // 1. Проверяем базовые плоскости
        const basePlanes = this.editor.basePlanes ? this.editor.basePlanes.children : [];
        const basePlaneIntersects = this.editor.raycaster.intersectObjects(basePlanes);

        if (basePlaneIntersects.length > 0) {
            foundIntersection = true;
            const plane = basePlaneIntersects[0].object;
            this.hoveredPlane = plane;
            plane.material.opacity = 0.4;
            document.body.style.cursor = 'pointer';
            return;
        }

        // 2. Проверяем объекты
        const objects = this.getAllSelectableObjects();
        const objectIntersects = this.editor.raycaster.intersectObjects(objects, true);

        if (objectIntersects.length > 0) {
            foundIntersection = true;
            const intersect = objectIntersects[0];
            const worldNormal = this.getFaceWorldNormal(intersect);

            // Создаем/обновляем временную плоскость
            this.createOrUpdateTempWorkPlane(intersect.point, worldNormal);

            // Находим и подсвечиваем родительский объект
            let object = intersect.object;
            while (object.parent &&
                   object.parent !== this.editor.objectsGroup &&
                   object.parent.type !== 'Scene') {
                object = object.parent;
            }

            this.hoveredObject = object;
            this.editor.objectsManager.highlightSingleObject(object);
            document.body.style.cursor = 'pointer';
            return;
        }

        if (!foundIntersection) {
            document.body.style.cursor = 'default';
        }
    }

    // ПОЛУЧИТЬ ВСЕ ОБЪЕКТЫ, С КОТОРЫМИ МОЖНО РАБОТАТЬ
    getAllSelectableObjects() {
        // Сначала проверяем, есть ли выделенный объект (не плоскость)
        if (this.faceSelectionObject) {
            return [this.faceSelectionObject];
        }

        // Если нет выделенного объекта, возвращаем все объекты кроме плоскостей
        return this.editor.objectsGroup.children.filter(obj => {
            const type = obj.userData?.type;
            return type !== 'work_plane' &&
                   type !== 'sketch_plane' &&
                   type !== 'base_plane';
        });
    }

    // ПОЛУЧИТЬ НОРМАЛЬ ГРАНИ В МИРОВЫХ КООРДИНАТАХ
    getFaceWorldNormal(intersect) {
        const worldNormal = new THREE.Vector3();

        if (intersect.face) {
            const normal = intersect.face.normal.clone();
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersect.object.matrixWorld);
            normal.applyMatrix3(normalMatrix).normalize();
            worldNormal.copy(normal);
        } else {
            worldNormal.copy(intersect.normal || new THREE.Vector3(0, 0, 1));
        }

        return worldNormal;
    }

    // СОЗДАТЬ РАБОЧУЮ ПЛОСКОСТЬ НА БАЗОВОЙ ПЛОСКОСТИ
    createWorkPlaneOnBasePlane(basePlane) {
        const workPlane = this.planesManager.createWorkPlaneObject(basePlane.userData.planeType.toUpperCase());

        workPlane.position.copy(basePlane.position);
        workPlane.quaternion.copy(basePlane.quaternion);

        this.editor.objectsGroup.add(workPlane);
        this.editor.objects.push(workPlane);
        this.editor.workPlanes.push(workPlane);

        this.exitWorkPlaneMode();
        this.editor.clearSelection();
        this.editor.selectObject(workPlane);

        this.editor.showStatus(`Создана рабочая плоскость на ${basePlane.userData.planeType.toUpperCase()}`, 'success');
        return true;
    }

    // СОЗДАТЬ РАБОЧУЮ ПЛОСКОСТЬ НА ГРАНИ ОБЪЕКТА
    createWorkPlaneOnFace(point, normal, objectName = 'Плоскость на грани') {
        const workPlane = this.planesManager.createWorkPlaneObject(objectName, 'face');
        workPlane.position.copy(point);

        const offset = 0.01;
        const offsetVector = normal.clone().multiplyScalar(offset);
        workPlane.position.add(offsetVector);

        const planeNormal = new THREE.Vector3(0, 0, 1);
        normal.normalize();

        const quaternion = new THREE.Quaternion();
        const dot = planeNormal.dot(normal);

        if (Math.abs(dot + 1) < 0.0001) {
            quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        } else if (Math.abs(dot - 1) < 0.0001) {
            quaternion.identity();
        } else {
            const rotationAxis = new THREE.Vector3().crossVectors(planeNormal, normal).normalize();
            const rotationAngle = Math.acos(planeNormal.dot(normal));
            quaternion.setFromAxisAngle(rotationAxis, rotationAngle);
        }

        workPlane.quaternion.copy(quaternion);

        this.editor.objectsGroup.add(workPlane);
        this.editor.objects.push(workPlane);
        this.editor.workPlanes.push(workPlane);

        this.exitWorkPlaneMode();
        this.editor.clearSelection();
        this.editor.selectObject(workPlane);

        this.editor.showStatus('Создана рабочая плоскость на грани объекта', 'success');
        return true;
    }

    // СОЗДАТЬ ИЛИ ОБНОВИТЬ ВРЕМЕННУЮ ПЛОСКОСТЬ
    createOrUpdateTempWorkPlane(position, normal) {
        const size = 50;

        if (!this.tempWorkPlane) {
            const geometry = new THREE.PlaneGeometry(size, size);
            const material = new THREE.MeshBasicMaterial({
                color: 0xFF9800,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true
            });

            this.tempWorkPlane = new THREE.Mesh(geometry, material);
            this.editor.objectsGroup.add(this.tempWorkPlane);
        }

        this.tempWorkPlane.position.copy(position);
        normal.normalize();

        const planeNormal = new THREE.Vector3(0, 0, 1);
        const quaternion = new THREE.Quaternion();
        const dot = planeNormal.dot(normal);

        if (Math.abs(dot + 1) < 0.0001) {
            quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        } else if (Math.abs(dot - 1) < 0.0001) {
            quaternion.identity();
        } else {
            const rotationAxis = new THREE.Vector3().crossVectors(planeNormal, normal).normalize();
            const rotationAngle = Math.acos(planeNormal.dot(normal));
            quaternion.setFromAxisAngle(rotationAxis, rotationAngle);
        }

        this.tempWorkPlane.quaternion.copy(quaternion);
        const offset = 0.01;
        const offsetVector = normal.clone().multiplyScalar(offset);
        this.tempWorkPlane.position.add(offsetVector);
    }

    // СБРОСИТЬ ПРЕДЫДУЩУЮ ПОДСВЕТКУ
    resetPreviousHighlight() {
        if (this.hoveredPlane) {
            this.hoveredPlane.material.opacity = 0.1;
            this.hoveredPlane = null;
        }

        if (this.hoveredObject) {
            this.editor.objectsManager.unhighlightObject(this.hoveredObject);
            this.hoveredObject = null;
        }

        if (this.tempWorkPlane) {
            this.editor.objectsGroup.remove(this.tempWorkPlane);
            this.tempWorkPlane.geometry.dispose();
            this.tempWorkPlane.material.dispose();
            this.tempWorkPlane = null;
        }
    }

    // ВЫХОД ИЗ РЕЖИМА
    exitWorkPlaneMode() {
        this.workPlaneMode = null;
        this.faceSelectionObject = null;

        if (this.editor.basePlanes) {
            this.editor.basePlanes.visible = false;
        }

        this.resetPreviousHighlight();
        this.editor.showStatus('Режим создания рабочей плоскости завершен', 'info');
    }

    // НАЧАТЬ ВЫБОР ГРАНИ ВЫДЕЛЕННОГО ОБЪЕКТА (ДЛЯ СОВМЕСТИМОСТИ)
    startWorkPlaneFaceSelection() {
        if (this.editor.selectedObjects.length === 1 &&
            this.editor.selectedObjects[0].userData.type !== 'work_plane' &&
            this.editor.selectedObjects[0].userData.type !== 'sketch_plane' &&
            this.editor.selectedObjects[0].userData.type !== 'base_plane') {

            this.faceSelectionObject = this.editor.selectedObjects[0];
            this.workPlaneMode = 'active';

            // Не показываем базовые плоскости при работе с выделенным объектом
            if (this.editor.basePlanes) {
                this.editor.basePlanes.visible = false;
            }

            this.editor.showStatus('Выберите грань выделенного объекта для создания рабочей плоскости', 'info');
            return true;
        }
        return false;
    }

    // ОБРАБОТКА СОБЫТИЙ

    onActivate() {
        // Если есть выделенный объект (не плоскость), работаем только с ним
        if (this.editor.selectedObjects.length === 1 &&
            this.editor.selectedObjects[0].userData.type !== 'work_plane' &&
            this.editor.selectedObjects[0].userData.type !== 'sketch_plane' &&
            this.editor.selectedObjects[0].userData.type !== 'base_plane') {

            this.faceSelectionObject = this.editor.selectedObjects[0];
            this.workPlaneMode = 'active';

            // Не показываем базовые плоскости при работе с выделенным объектом
            if (this.editor.basePlanes) {
                this.editor.basePlanes.visible = false;
            }

            this.editor.showStatus('Выберите грань выделенного объекта для создания рабочей плоскости', 'info');
        } else {
            // Иначе работаем со всеми объектами и показываем базовые плоскости
            this.createWorkPlane();
        }
        return true;
    }

    onDeactivate() {
        this.exitWorkPlaneMode();
    }

    onMouseDown(e) {
        if (this.workPlaneMode === 'active') {
            if (this.handleSelection(e)) {
                this.editor.toolManager.setCurrentTool('select');
                return true;
            }
        }
        return false;
    }

    onMouseMove(e) {
        if (this.workPlaneMode === 'active') {
            this.handleHighlight(e);
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.workPlaneMode) {
            this.editor.toolManager.setCurrentTool('select');
            return true;
        }
        return false;
    }
}