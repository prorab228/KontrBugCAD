// planes-manager.js (улучшенная версия с поддержкой ориентации)
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
            { type: 'xz', color: 0xff0000, position: { y: 0 }, rotation: { x: -Math.PI / 2 } },
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

    /**
     * Создает рабочую плоскость с возможностью указания позиции и ориентации
     * @param {Object} options - Опции создания плоскости
     * @param {string} options.name - Название плоскости
     * @param {string} options.planeType - Тип плоскости
     * @param {THREE.Vector3} options.position - Позиция плоскости
     * @param {THREE.Vector3} options.normal - Нормаль плоскости
     * @param {THREE.Vector3} options.up - Вектор "вверх" для ориентации
     * @returns {THREE.Mesh} Созданная рабочая плоскость
     */
    createWorkPlaneObject(options = {}) {
        const {
            name = 'Рабочая плоскость',
            planeType = 'custom',
            position = new THREE.Vector3(0, 0, 0),
            normal = new THREE.Vector3(0, 0, 1), // По умолчанию нормаль по оси Z
            up = new THREE.Vector3(0, 1, 0)     // По умолчанию "вверх" по оси Y
        } = options;

        const size = 50;
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0x969610,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.name = `WorkPlane_${Date.now()}`;

        // Устанавливаем позицию
        plane.position.copy(position);

        // ОРИЕНТИРУЕМ ПЛОСКОСТЬ ПО НОРМАЛИ
        this.orientPlaneToNormal(plane, normal, up);

        plane.userData = {
            type: 'work_plane',
            id: `work_plane_${Date.now()}`,
            name: name,
            planeType: planeType,
            createdAt: new Date().toISOString(),
            operations: [],
            originalNormal: normal.clone(), // Сохраняем исходную нормаль
            originalUp: up.clone()          // Сохраняем исходный вектор "вверх"
        };

        return plane;
    }

    /**
     * Создает плоскость скетча с возможностью указания позиции и ориентации
     * @param {Object} options - Опции создания плоскости
     * @param {THREE.Vector3} options.position - Позиция плоскости
     * @param {THREE.Vector3} options.normal - Нормаль плоскости
     * @param {THREE.Vector3} options.up - Вектор "вверх" для ориентации
     * @param {string} options.name - Название плоскости
     * @returns {THREE.Mesh} Созданная плоскость скетча
     */
    createSketchPlaneObject(options = {}) {
        const {
            position = new THREE.Vector3(0, 0, 0),
            normal = new THREE.Vector3(0, 0, 1), // По умолчанию нормаль по оси Z
            up = new THREE.Vector3(0, 1, 0),     // По умолчанию "вверх" по оси Y
            name = 'Плоскость скетча'
        } = options;

        const size = 100;
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.name = `SketchPlane_${Date.now()}`;

        // Устанавливаем позицию
        plane.position.copy(position);

        // ОРИЕНТИРУЕМ ПЛОСКОСТЬ ПО НОРМАЛИ
        this.orientPlaneToNormal(plane, normal, up);

        plane.userData = {
            type: 'sketch_plane',
            id: `sketch_plane_${Date.now()}`,
            name: name,
            createdAt: new Date().toISOString(),
            sketchElements: [],
            originalNormal: normal.clone(), // Сохраняем исходную нормаль
            originalUp: up.clone()          // Сохраняем исходный вектор "вверх"
        };

        return plane;
    }

    /**
     * Ориентирует плоскость по заданной нормали
     * @param {THREE.Mesh} plane - Плоскость для ориентации
     * @param {THREE.Vector3} normal - Желаемая нормаль плоскости
     * @param {THREE.Vector3} up - Вектор "вверх" для определения поворота вокруг нормали
     */
    orientPlaneToNormal(plane, normal, up = new THREE.Vector3(0, 1, 0)) {
        // Нормализуем входные векторы
        const targetNormal = normal.clone().normalize();
        const targetUp = up.clone().normalize();

        // Исходная нормаль плоскости (THREE.PlaneGeometry создается в плоскости XY, нормаль по Z)
        const defaultNormal = new THREE.Vector3(0, 0, 1);
        const defaultUp = new THREE.Vector3(0, 1, 0);

        // Если нормаль совпадает (или противоположна) с исходной, используем кастомную логику
        if (Math.abs(targetNormal.dot(defaultNormal)) > 0.9999) {
            // Нормаль почти совпадает с осью Z или противоположна ей
            if (Math.abs(targetNormal.y) > 0.5) {
                // Если нормаль близка к оси Y, используем ось X как "вверх"
                plane.lookAt(plane.position.clone().add(targetNormal));
                plane.rotateY(Math.PI / 2);
            } else {
                // Иначе используем обычный lookAt
                plane.lookAt(plane.position.clone().add(targetNormal));
            }
        } else {
            // Вычисляем кватернион для поворота из defaultNormal в targetNormal
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromUnitVectors(defaultNormal, targetNormal);

            // Применяем поворот
            plane.setRotationFromQuaternion(rotationQuaternion);

            // Корректируем вращение вокруг нормали, чтобы сохранить ориентацию "вверх"
            const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(plane.quaternion);
            const upRotation = new THREE.Quaternion();
            upRotation.setFromUnitVectors(currentUp, targetUp);

            // Комбинируем повороты
            plane.quaternion.premultiply(upRotation);
        }

        // Гарантируем, что нормаль совпадает с targetNormal
        plane.updateMatrixWorld(true);
    }

    /**
     * Создает плоскость на поверхности объекта по точке пересечения
     * @param {Object} intersection - Результат пересечения луча с объектом
     * @param {boolean} isSketchPlane - true для плоскости скетча, false для рабочей плоскости
     * @returns {THREE.Mesh} Созданная плоскость
     */
    createPlaneOnObjectFace(intersection, isSketchPlane = false) {
        if (!intersection || !intersection.face) {
            console.warn('Неверные данные пересечения для создания плоскости');
            return null;
        }

        const point = intersection.point;
        const object = intersection.object;

        // Вычисляем нормаль грани в мировых координатах
        let faceNormal = intersection.face.normal.clone();

        // Если объект имеет трансформации, применяем их к нормали
        if (object.matrixWorld) {
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
            faceNormal.applyMatrix3(normalMatrix).normalize();
        }

        // Вычисляем вектор "вверх" для ориентации плоскости
        // Берем вектор от центра объекта к точке пересечения, проецируем его на плоскость, перпендикулярную нормали
        const objectCenter = new THREE.Vector3();
        object.getWorldPosition(objectCenter);
        const toCenter = objectCenter.clone().sub(point).normalize();

        let planeUp = new THREE.Vector3(0, 1, 0);

        // Если нормаль почти вертикальна, используем ось X как "вверх"
        if (Math.abs(faceNormal.y) > 0.9) {
            planeUp = new THREE.Vector3(1, 0, 0);
        } else {
            // Проецируем стандартный вектор "вверх" на плоскость грани
            planeUp = new THREE.Vector3(0, 1, 0);
            const projection = planeUp.clone().projectOnPlane(faceNormal).normalize();

            // Если проекция слишком мала, используем перекрестное произведение
            if (projection.length() < 0.1) {
                planeUp = new THREE.Vector3(1, 0, 0).projectOnPlane(faceNormal).normalize();
            } else {
                planeUp = projection;
            }
        }

        // Создаем плоскость с правильной ориентацией
        const planeOptions = {
            position: point,
            normal: faceNormal,
            up: planeUp,
            name: isSketchPlane ? 'Скетч на поверхности' : 'Рабочая плоскость на поверхности'
        };

        return isSketchPlane
            ? this.createSketchPlaneObject(planeOptions)
            : this.createWorkPlaneObject(planeOptions);
    }

    /**
     * Создает плоскость, ориентированную по камере
     * @param {boolean} isSketchPlane - true для плоскости скетча, false для рабочей плоскости
     * @param {number} distance - Расстояние от камеры
     * @returns {THREE.Mesh} Созданная плоскость
     */
    createPlaneFacingCamera(isSketchPlane = false, distance = 100) {
        const camera = this.editor.camera;

        // Вычисляем позицию перед камерой
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const position = camera.position.clone().add(cameraDirection.multiplyScalar(distance));

        // Нормаль плоскости противоположна направлению камеры (чтобы плоскость была видна)
        const normal = cameraDirection.clone().negate();

        // Вектор "вверх" - это "вверх" камеры
        const up = camera.up.clone();

        const planeOptions = {
            position: position,
            normal: normal,
            up: up,
            name: isSketchPlane ? 'Скетч перед камерой' : 'Рабочая плоскость перед камерой'
        };

        return isSketchPlane
            ? this.createSketchPlaneObject(planeOptions)
            : this.createWorkPlaneObject(planeOptions);
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

    /**
     * Проверяет ориентацию плоскости
     * @param {THREE.Mesh} plane - Проверяемая плоскость
     * @returns {Object} Информация об ориентации
     */
    getPlaneOrientation(plane) {
        const normal = new THREE.Vector3(0, 0, 1);
        normal.applyQuaternion(plane.quaternion);

        const up = new THREE.Vector3(0, 1, 0);
        up.applyQuaternion(plane.quaternion);

        const right = new THREE.Vector3(1, 0, 0);
        right.applyQuaternion(plane.quaternion);

        return {
            normal: normal,
            up: up,
            right: right,
            isValid: Math.abs(normal.length() - 1) < 0.001 // Проверка, что нормаль нормализована
        };
    }
}