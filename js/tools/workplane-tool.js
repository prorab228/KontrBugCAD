 // workplane-tool.js (полная версия)
class WorkPlaneTool extends Tool {
    constructor(editor) {
        super('workplane', 'fa-square', editor);
        this.planesManager = editor.planesManager;
        this.workPlaneMode = null;
        this.faceSelectionObject = null;
        this.tempWorkPlane = null;
        this.hoveredPlane = null;
        this.hoveredFace = null;
    }

    // МЕТОДЫ РАБОЧИХ ПЛОСКОСТЕЙ (ранее были в app.js)

    createWorkPlane() {
        // Если выбран объект (и это не плоскость), начинаем выбор грани
        if (this.editor.selectedObjects.length === 1 &&
            this.editor.selectedObjects[0].userData.type !== 'work_plane' &&
            this.editor.selectedObjects[0].userData.type !== 'sketch_plane' &&
            this.editor.selectedObjects[0].userData.type !== 'base_plane') {
            this.startWorkPlaneFaceSelection();
        } else {
            // Иначе начинаем выбор базовой плоскости
            this.startWorkPlaneBaseSelection();
        }
    }

    startWorkPlaneFaceSelection() {
        this.faceSelectionObject = this.editor.selectedObjects[0];
        this.workPlaneMode = 'selecting_face';
        this.editor.showStatus('Выберите грань объекта для создания рабочей плоскости', 'info');
    }

    startWorkPlaneBaseSelection() {
        this.workPlaneMode = 'selecting_plane';
        this.editor.basePlanes.visible = true;
        this.editor.showStatus('Выберите базовую плоскость (XY, XZ, YZ) для создания рабочей плоскости', 'info');
    }

    selectBasePlaneForWorkPlane(e) {
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        const intersects = this.editor.raycaster.intersectObjects(this.editor.basePlanes.children);

        if (intersects.length > 0) {
            const basePlane = intersects[0].object;
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
        }
    }

    selectFaceForWorkPlane(e) {
        if (!this.faceSelectionObject) return;

        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        const intersects = this.editor.raycaster.intersectObject(this.faceSelectionObject, true);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            const worldNormal = new THREE.Vector3();

            if (intersect.face) {
                const normal = intersect.face.normal.clone();
                const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersect.object.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
                worldNormal.copy(normal);
            } else {
                worldNormal.copy(intersect.normal || new THREE.Vector3(0, 0, 1));
            }

            const workPlane = this.planesManager.createWorkPlaneObject('Плоскость на грани', 'face');
            workPlane.position.copy(intersect.point);

            const offset = 0.01;
            const offsetVector = worldNormal.clone().multiplyScalar(offset);
            workPlane.position.add(offsetVector);

            const planeNormal = new THREE.Vector3(0, 0, 1);
            worldNormal.normalize();

            const quaternion = new THREE.Quaternion();
            const dot = planeNormal.dot(worldNormal);

            if (Math.abs(dot + 1) < 0.0001) {
                quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
            } else if (Math.abs(dot - 1) < 0.0001) {
                quaternion.identity();
            } else {
                const rotationAxis = new THREE.Vector3().crossVectors(planeNormal, worldNormal).normalize();
                const rotationAngle = Math.acos(planeNormal.dot(worldNormal));
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
        }
    }

    highlightFacesForWorkPlane(e) {
        if (!this.faceSelectionObject) return;

        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        const intersects = this.editor.raycaster.intersectObject(this.faceSelectionObject, true);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            const worldNormal = new THREE.Vector3();

            if (intersect.face) {
                const normal = intersect.face.normal.clone();
                const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersect.object.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
                worldNormal.copy(normal);
            } else {
                worldNormal.copy(intersect.normal || new THREE.Vector3(0, 0, 1));
            }

            const intersectionPoint = intersect.point.clone();
            this.createOrUpdateTempWorkPlane(intersectionPoint, worldNormal);

            this.editor.objectsManager.highlightSingleObject(this.faceSelectionObject);
            document.body.style.cursor = 'pointer';
        } else {
            this.editor.objectsManager.unhighlightObject(this.faceSelectionObject);

            if (this.tempWorkPlane) {
                this.editor.objectsGroup.remove(this.tempWorkPlane);
                this.tempWorkPlane.geometry.dispose();
                this.tempWorkPlane.material.dispose();
                this.tempWorkPlane = null;
            }

            document.body.style.cursor = 'default';
        }
    }

    highlightBasePlanesForWorkPlane(e) {
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        if (this.hoveredPlane) {
            this.hoveredPlane.material.opacity = 0.1;
            this.hoveredPlane = null;
        }

        const intersects = this.editor.raycaster.intersectObjects(this.editor.basePlanes.children);

        if (intersects.length > 0) {
            const plane = intersects[0].object;
            this.hoveredPlane = plane;
            plane.material.opacity = 0.4;
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }
    }

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

    exitWorkPlaneMode() {
        this.workPlaneMode = null;
        this.faceSelectionObject = null;

        if (this.editor.basePlanes) {
            this.editor.basePlanes.visible = false;
        }

        if (this.tempWorkPlane) {
            this.editor.objectsGroup.remove(this.tempWorkPlane);
            this.tempWorkPlane.geometry.dispose();
            this.tempWorkPlane.material.dispose();
            this.tempWorkPlane = null;
        }

        if (this.faceSelectionObject) {
            this.editor.objectsManager.unhighlightObject(this.faceSelectionObject);
        }

        this.editor.showStatus('Режим создания рабочей плоскости завершен', 'info');
    }

    // ОБРАБОТКА СОБЫТИЙ

    onActivate() {
        return this.createWorkPlane();
    }

    onDeactivate() {
        this.exitWorkPlaneMode();
    }

    onMouseDown(e) {
        if (this.workPlaneMode === 'selecting_plane') {
            this.selectBasePlaneForWorkPlane(e);
            this.editor.toolManager.setCurrentTool('select');
            return true;
        } else if (this.workPlaneMode === 'selecting_face') {
            this.selectFaceForWorkPlane(e);
            this.editor.toolManager.setCurrentTool('select');
            return true;
        }
        return false;
    }

    onMouseMove(e) {
        if (this.workPlaneMode === 'selecting_face') {
            this.highlightFacesForWorkPlane(e);
        } else if (this.workPlaneMode === 'selecting_plane') {
            this.highlightBasePlanesForWorkPlane(e);
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