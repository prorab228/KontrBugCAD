// planes-manager.js (упрощенная версия - оставить только методы создания плоскостей)
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

    setCameraForSketch(plane) {
        const normal = new THREE.Vector3(0, 0, 1);
        normal.applyQuaternion(plane.quaternion);

        const distance = 100;
        const cameraPosition = plane.position.clone().add(normal.multiplyScalar(distance));

        this.editor.camera.position.copy(cameraPosition);
        this.editor.camera.lookAt(plane.position);

        const up = new THREE.Vector3(0, 1, 0);
        up.applyQuaternion(plane.quaternion);
        this.editor.camera.up.copy(up);

        this.editor.controls.target.copy(plane.position);
        this.editor.controls.update();
    }
}