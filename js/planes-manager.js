 // planes-manager.js
class PlanesManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
    }

    createBasePlanes() {
        if (this.editor.basePlanes) {
            this.editor.worldGroup.remove(this.editor.basePlanes);
        }

        this.editor.basePlanes = new THREE.Group();
        this.editor.basePlanes.name = 'base_planes';

        const planes = [
            { type: 'xy', color: 0x00ff00, position: { z: 0 }, rotation: { x: 0 } },
            { type: 'xz', color: 0xff0000, position: { y: 0 }, rotation: { x: Math.PI / 2 } },
            { type: 'yz', color: 0x0000ff, position: { x: 0 }, rotation: { y: Math.PI / 2, x: 0 } }
        ];

        planes.forEach(planeData => {
            const plane = this.createBasePlane(planeData.type, planeData.color);
            Object.assign(plane.position, planeData.position);
            Object.assign(plane.rotation, planeData.rotation);
            this.editor.basePlanes.add(plane);
        });

        this.editor.basePlanes.visible = false;
        this.editor.worldGroup.add(this.editor.basePlanes);
    }

    createBasePlane(type, color) {
        const size = 50;
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.name = `base_plane_${type}`;
        plane.userData = {
            type: 'base_plane',
            planeType: type,
            basePlane: true
        };

        return plane;
    }

    createWorkPlaneObject(name = 'Рабочая плоскость', planeType = 'custom') {
        const size = 100;
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0x2196F3,
            transparent: true,
            opacity: 0.05,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.name = `WorkPlane_${Date.now()}`;
        plane.userData = {
            type: 'work_plane',
            id: `work_plane_${Date.now()}`,
            name: name,
            planeType: planeType,
            createdAt: new Date().toISOString(),
            operations: []
        };

        return plane;
    }

    createSketchPlaneObject() {
        const size = 100;
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0x999999,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.name = `SketchPlane_${Date.now()}`;
        plane.userData = {
            type: 'sketch_plane',
            id: `sketch_plane_${Date.now()}`,
            name: 'Плоскость скетча',
            createdAt: new Date().toISOString(),
            sketchElements: []
        };

        return plane;
    }

    startWorkPlaneFaceSelection() {
        this.editor.faceSelectionObject = this.editor.selectedObjects[0];
        this.editor.workPlaneMode = 'selecting_face';
        this.editor.showStatus('Выберите грань объекта для создания рабочей плоскости', 'info');
    }

    startWorkPlaneBaseSelection() {
        this.editor.workPlaneMode = 'selecting_plane';
        this.editor.basePlanes.visible = true;
        this.editor.showStatus('Выберите базовую плоскость (XY, XZ, YZ) для создания рабочей плоскости', 'info');
    }

    selectBasePlaneForWorkPlane(e) {
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        const intersects = this.editor.raycaster.intersectObjects(this.editor.basePlanes.children);

        if (intersects.length > 0) {
            const basePlane = intersects[0].object;
            const workPlane = this.createWorkPlaneObject(basePlane.userData.planeType.toUpperCase());

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

    highlightBasePlanesForWorkPlane(e) {
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        if (this.editor.hoveredPlane) {
            this.editor.hoveredPlane.material.opacity = 0.1;
            this.editor.hoveredPlane = null;
        }

        const intersects = this.editor.raycaster.intersectObjects(this.editor.basePlanes.children);

        if (intersects.length > 0) {
            const plane = intersects[0].object;
            this.editor.hoveredPlane = plane;
            plane.material.opacity = 0.4;
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }
    }

    selectFaceForWorkPlane(e) {
        if (!this.editor.faceSelectionObject) return;

        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        const intersects = this.editor.raycaster.intersectObject(this.editor.faceSelectionObject, true);

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

            const workPlane = this.createWorkPlaneObject('Плоскость на грани', 'face');
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
        if (!this.editor.faceSelectionObject) return;

        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        const intersects = this.editor.raycaster.intersectObject(this.editor.faceSelectionObject, true);

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

            this.editor.objectsManager.highlightSingleObject(this.editor.faceSelectionObject);
            document.body.style.cursor = 'pointer';
        } else {
            this.editor.objectsManager.unhighlightObject(this.editor.faceSelectionObject);

            if (this.editor.tempWorkPlane) {
                this.editor.objectsGroup.remove(this.editor.tempWorkPlane);
                this.editor.tempWorkPlane.geometry.dispose();
                this.editor.tempWorkPlane.material.dispose();
                this.editor.tempWorkPlane = null;
            }

            document.body.style.cursor = 'default';
        }
    }

    createOrUpdateTempWorkPlane(position, normal) {
        const size = 50;

        if (!this.editor.tempWorkPlane) {
            const geometry = new THREE.PlaneGeometry(size, size);
            const material = new THREE.MeshBasicMaterial({
                color: 0xFF9800,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: true
            });

            this.editor.tempWorkPlane = new THREE.Mesh(geometry, material);
            this.editor.objectsGroup.add(this.editor.tempWorkPlane);
        }

        this.editor.tempWorkPlane.position.copy(position);
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

        this.editor.tempWorkPlane.quaternion.copy(quaternion);
        const offset = 0.01;
        const offsetVector = normal.clone().multiplyScalar(offset);
        this.editor.tempWorkPlane.position.add(offsetVector);
    }

    exitWorkPlaneMode() {
        this.editor.workPlaneMode = null;
        this.editor.faceSelectionObject = null;

        if (this.editor.basePlanes) {
            this.editor.basePlanes.visible = false;
        }

        if (this.editor.tempWorkPlane) {
            this.editor.objectsGroup.remove(this.editor.tempWorkPlane);
            this.editor.tempWorkPlane.geometry.dispose();
            this.editor.tempWorkPlane.material.dispose();
            this.editor.tempWorkPlane = null;
        }

        if (this.editor.faceSelectionObject) {
            this.editor.unhighlightObject(this.editor.faceSelectionObject);
        }

        this.editor.showStatus('Режим создания рабочей плоскости завершен', 'info');
    }

    setCameraForSketch(plane) {
        // Получаем нормаль плоскости (локальная ось Z)
        const normal = new THREE.Vector3(0, 0, 1);
        normal.applyQuaternion(plane.quaternion);

        // Позиция камеры - на расстоянии 100 единиц по нормали
        const distance = 100;
        const cameraPosition = plane.position.clone().add(normal.multiplyScalar(distance));

        this.editor.camera.position.copy(cameraPosition);
        this.editor.camera.lookAt(plane.position);

        // Устанавливаем up вектор камеры вверх плоскости (локальная ось Y)
        const up = new THREE.Vector3(0, 1, 0);
        up.applyQuaternion(plane.quaternion);
        this.editor.camera.up.copy(up);

        this.editor.controls.target.copy(plane.position);
        this.editor.controls.update();
    }
}