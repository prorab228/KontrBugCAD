// js/tools/mirror-tool.js (исправленная версия с отражением относительно центра объекта)
class MirrorTool extends Tool {
    constructor(editor) {
        super('mirror', 'fa-expand-arrows-alt', editor);
        this.requiresSelection = true;
        this.mirrorPlane = null;
        this.mirrorAxis = null;
        this.modal = null;
        this.isModalActive = false;

        this.initModal();
    }

    initModal() {
        // Создаем модальное окно
        this.modal = document.createElement('div');
        this.modal.className = 'mirror-tool-modal';
        this.modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s;
        `;

        this.modal.innerHTML = `
            <div style="
                background: var(--bg-surface, #2d2d2d);
                border-radius: 8px;
                width: 320px;
                max-width: 90%;
                border: 1px solid var(--border-color, #404040);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            ">
                <div style="
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--border-color, #404040);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h3 style="margin: 0; font-size: 15px; color: var(--text-primary, #fff);">
                        <i class="fas fa-expand-arrows-alt" style="color: var(--primary-color, #2196f3); margin-right: 6px;"></i>
                        Отражение (зеркало)
                    </h3>

                </div>

                <div style="padding: 16px;">
                    <div style="margin-bottom: 15px;">
                        <h4 style="margin: 0 0 8px 0; color: var(--text-primary, #fff); font-size: 13px;">
                            Выберите ось отражения
                        </h4>
                        <p style="margin: 0 0 15px 0; color: var(--text-secondary, #aaa); font-size: 12px;">
                            Будет создана зеркальная копия объекта
                        </p>

                        <div style="display: flex; gap: 8px; margin-bottom: 15px;">
                            <button class="axis-btn" data-axis="x" style="
                                flex: 1;
                                padding: 10px 6px;
                                border: 2px solid #ff4444;
                                background: rgba(255, 68, 68, 0.1);
                                border-radius: 6px;
                                cursor: pointer;
                                transition: all 0.2s;
                                display: flex;
                                flex-direction: column;
                                align-items: center;
                                gap: 4px;
                                color: #ff4444;
                            ">
                                <i class="fas fa-arrows-alt-h" style="font-size: 16px;"></i>
                                <span style="font-weight: 500; font-size: 12px;">Ось X</span>
                            </button>
                            <button class="axis-btn" data-axis="y" style="
                                flex: 1;
                                padding: 10px 6px;
                                border: 2px solid #44ff44;
                                background: rgba(68, 255, 68, 0.1);
                                border-radius: 6px;
                                cursor: pointer;
                                transition: all 0.2s;
                                display: flex;
                                flex-direction: column;
                                align-items: center;
                                gap: 4px;
                                color: #44ff44;
                            ">
                                <i class="fas fa-arrows-alt-v" style="font-size: 16px;"></i>
                                <span style="font-weight: 500; font-size: 12px;">Ось Y</span>
                            </button>
                            <button class="axis-btn" data-axis="z" style="
                                flex: 1;
                                padding: 10px 6px;
                                border: 2px solid #4444ff;
                                background: rgba(68, 68, 255, 0.1);
                                border-radius: 6px;
                                cursor: pointer;
                                transition: all 0.2s;
                                display: flex;
                                flex-direction: column;
                                align-items: center;
                                gap: 4px;
                                color: #4444ff;
                            ">
                                <i class="fas fa-arrows-alt" style="font-size: 16px;"></i>
                                <span style="font-weight: 500; font-size: 12px;">Ось Z</span>
                            </button>
                        </div>

                        <div style="border-top: 1px solid var(--border-color, #404040); padding-top: 12px;">
                            <p style="margin: 0; font-size: 11px; color: var(--text-secondary, #aaa); font-style: italic;">
                                Объект будет отражен относительно центра выделения
                            </p>
                        </div>
                    </div>
                </div>

                <div style="
                    padding: 12px 16px;
                    border-top: 1px solid var(--border-color, #404040);
                    text-align: center;
                ">
                    <button class="cancel-btn btn-secondary" >Отмена</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.setupModalEvents();
    }

    setupModalEvents() {


        // Выбор оси
        this.modal.querySelectorAll('.axis-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const axis = btn.dataset.axis;
                this.mirrorAxis = axis;
                this.applyMirror();
                this.closeModal();
            });
        });

        // Кнопка отмены
        this.modal.querySelector('.cancel-btn').addEventListener('click', () => {
            this.closeModal();
            this.editor.toolManager.setCurrentTool('select');
        });

        // Закрытие по клику вне модального окна
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
                this.editor.toolManager.setCurrentTool('select');
            }
        });

        // Закрытие по ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalActive) {
                this.closeModal();
                this.editor.toolManager.setCurrentTool('select');
            }
        });
    }

    onActivate() {
        if (!this.canActivate()) {
            this.editor.toolManager.restorePreviousTool();
            return;
        }

        // Проверяем, есть ли рабочая плоскость среди выделенных объектов
        this.mirrorPlane = this.findWorkPlaneInSelection();

        if (this.mirrorPlane) {
            // Автоматически отражаем относительно выбранной плоскости
            this.applyMirrorRelativeToPlane();
        } else {
            // Показываем модальное окно для выбора оси
            this.showModal();
        }

        return true;
    }

    onDeactivate() {
        this.cleanup();
        this.closeModal();
    }

    findWorkPlaneInSelection() {
        return this.editor.selectedObjects.find(obj =>
            obj.userData?.type === 'work_plane' || obj.userData?.type === 'sketch_plane'
        );
    }

    showModal() {
        this.isModalActive = true;
        this.modal.style.opacity = '1';
        this.modal.style.visibility = 'visible';
        this.editor.showStatus('Выберите ось для отражения', 'info');
    }

    closeModal() {
        this.isModalActive = false;
        this.modal.style.opacity = '0';
        this.modal.style.visibility = 'hidden';
    }

    applyMirror() {
        // Получаем объекты для отражения
        const objectsToMirror = this.mirrorPlane
            ? this.editor.selectedObjects.filter(obj => obj !== this.mirrorPlane)
            : [...this.editor.selectedObjects];

        if (objectsToMirror.length === 0) {
            this.editor.showStatus('Нет объектов для отражения', 'error');
            this.editor.toolManager.setCurrentTool('select');
            return;
        }

        // Создаем зеркальные копии
        const mirroredObjects = [];

        objectsToMirror.forEach(obj => {
            const mirrored = this.createMirroredObject(obj);
            if (mirrored) {
                // Добавляем объект в сцену
                this.addObjectToScene(mirrored);
                mirroredObjects.push(mirrored);
            }
        });

        if (mirroredObjects.length === 0) {
            this.editor.showStatus('Не удалось создать зеркальные копии', 'error');
            this.editor.toolManager.setCurrentTool('select');
            return;
        }

        // Выделяем новые объекты
        this.editor.clearSelection();
        mirroredObjects.forEach(obj => {
            this.editor.selectedObjects.push(obj);
            this.editor.objectsManager.highlightObject(obj);
        });

        // Добавляем в историю как создание новых объектов
        mirroredObjects.forEach(mirrored => {
            this.editor.history.addAction({
                type: 'create',
                object: mirrored.uuid
            });
        });

        // Обновляем сцену
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();

        // Показываем сообщение
        this.editor.showStatus(
            `Создана зеркальная копия по оси ${this.mirrorAxis.toUpperCase()}`,
            'success'
        );

        this.cleanup();
        this.editor.toolManager.setCurrentTool('select');
    }

    applyMirrorRelativeToPlane() {
        // Получаем объекты для отражения (исключая плоскость)
        const objectsToMirror = this.editor.selectedObjects.filter(obj => obj !== this.mirrorPlane);

        if (objectsToMirror.length === 0) {
            this.editor.showStatus('Нет объектов для отражения', 'error');
            this.editor.toolManager.setCurrentTool('select');
            return;
        }

        const plane = this.mirrorPlane;
        const mirroredObjects = [];

        objectsToMirror.forEach(obj => {
            // Создаем зеркальную копию
            const mirrored = obj.clone(true);

            // Отражаем относительно плоскости (работает правильно)
            this.reflectObjectRelativeToPlane(mirrored, plane);

            // Создаем новый материал для зеркального объекта
            mirrored.material = this.createMaterialFromOriginal(obj);

            // Настраиваем userData
            this.setupUserData(mirrored, obj, true);

            // Добавляем в сцену
            this.addObjectToScene(mirrored);
            mirroredObjects.push(mirrored);
        });

        // Выделяем новые объекты
        this.editor.clearSelection();
        mirroredObjects.forEach(obj => {
            this.editor.selectedObjects.push(obj);
            this.editor.objectsManager.highlightObject(obj);
        });

        // Добавляем в историю
        mirroredObjects.forEach(mirrored => {
            this.editor.history.addAction({
                type: 'create',
                object: mirrored.uuid
            });
        });

        // Обновляем сцену
        this.editor.objectsManager.updateSceneStats();
        this.editor.objectsManager.updateSceneList();

        this.editor.showStatus(
            `Создана зеркальная копия относительно рабочей плоскости`,
            'success'
        );

        this.cleanup();
        this.editor.toolManager.setCurrentTool('select');
    }

    // НОВЫЙ МЕТОД: Отражение объекта относительно плоскости
    reflectObjectRelativeToPlane(object, plane) {
        // Получаем нормаль плоскости в мировых координатах
        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(plane.quaternion).normalize();

        // Получаем точку на плоскости
        const planePoint = plane.position.clone();

        // Вычисляем вектор от плоскости к объекту
        const objectToPlane = object.position.clone().sub(planePoint);

        // Проекция на нормаль
        const projection = objectToPlane.dot(planeNormal);

        // Смещаем объект на удвоенное расстояние в противоположную сторону
        const offset = planeNormal.clone().multiplyScalar(-2 * projection);
        object.position.add(offset);

        // Отражаем геометрию относительно плоскости с правильными нормалями
        this.reflectGeometryByPlane(object, planeNormal);
    }

    createMirroredObject(originalObject) {
        // Глубокое клонирование объекта
        const mirrored = originalObject.clone(true);

        // Вычисляем центр bounding box объекта В МИРОВЫХ КООРДИНАТАХ
        const bbox = new THREE.Box3().setFromObject(originalObject);
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        // Вычисляем относительную позицию объекта относительно его центра
        const relativePos = originalObject.position.clone().sub(center);

        // Отражаем относительную позицию по выбранной оси
        switch(this.mirrorAxis) {
            case 'x':
                relativePos.x = -relativePos.x;
                // Отражаем геометрию по оси X
                this.reflectGeometry(mirrored, 'x');
                // Инвертируем вращение по оси X
                this.reflectRotation(mirrored, 'x');
                break;
            case 'y':
                relativePos.y = -relativePos.y;
                this.reflectGeometry(mirrored, 'y');
                this.reflectRotation(mirrored, 'y');
                break;
            case 'z':
                relativePos.z = -relativePos.z;
                this.reflectGeometry(mirrored, 'z');
                this.reflectRotation(mirrored, 'z');
                break;
        }

        // Устанавливаем новую позицию: центр + отраженная относительная позиция
        mirrored.position.copy(center).add(relativePos);

        // Создаем новый материал для зеркального объекта из ОРИГИНАЛЬНОГО материала
        mirrored.material = this.createMaterialFromOriginal(originalObject);

        // Настраиваем userData
        this.setupUserData(mirrored, originalObject, false);

        return mirrored;
    }

    // Метод отражения геометрии (с правильными нормалями)
    reflectGeometry(object, axis) {
        if (!object.geometry) return;

        // Создаем новую геометрию на основе старой
        const geometry = object.geometry.clone();
        const positions = geometry.attributes.position.array;

        // Отражаем вершины по выбранной оси
        for (let i = 0; i < positions.length; i += 3) {
            switch(axis) {
                case 'x': positions[i] = -positions[i]; break;
                case 'y': positions[i + 1] = -positions[i + 1]; break;
                case 'z': positions[i + 2] = -positions[i + 2]; break;
            }
        }

        geometry.attributes.position.needsUpdate = true;

        // Пересчитываем нормали (это исправит их направление)
        geometry.computeVertexNormals();

        // ИНВЕРТИРУЕМ ПОРЯДОК ВЕРШИН (важно для правильных нормалей)
        if (geometry.index) {
            const indices = geometry.index.array;
            for (let i = 0; i < indices.length; i += 3) {
                // Меняем порядок вершин в треугольнике
                const temp = indices[i];
                indices[i] = indices[i + 1];
                indices[i + 1] = temp;
            }
            geometry.index.needsUpdate = true;
        }

        object.geometry = geometry;
    }

    // Метод отражения геометрии относительно плоскости
    reflectGeometryByPlane(object, planeNormal) {
        if (!object.geometry) return;

        const geometry = object.geometry.clone();
        const positions = geometry.attributes.position.array;

        // Отражаем вершины относительно плоскости
        for (let i = 0; i < positions.length; i += 3) {
            const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);

            // Формула отражения: v' = v - 2*(v·n)*n
            const dot = vertex.dot(planeNormal);
            vertex.x -= 2 * dot * planeNormal.x;
            vertex.y -= 2 * dot * planeNormal.y;
            vertex.z -= 2 * dot * planeNormal.z;

            positions[i] = vertex.x;
            positions[i + 1] = vertex.y;
            positions[i + 2] = vertex.z;
        }

        geometry.attributes.position.needsUpdate = true;

        // Пересчитываем нормали
        geometry.computeVertexNormals();

        // Инвертируем порядок вершин
        if (geometry.index) {
            const indices = geometry.index.array;
            for (let i = 0; i < indices.length; i += 3) {
                const temp = indices[i];
                indices[i] = indices[i + 1];
                indices[i + 1] = temp;
            }
            geometry.index.needsUpdate = true;
        }

        object.geometry = geometry;
    }

    // Метод отражения вращения
    reflectRotation(object, axis) {
        // Создаем кватернион для отражения вращения
        const reflectionQuaternion = new THREE.Quaternion();

        switch(axis) {
            case 'x':
                // Отражение по оси X эквивалентно повороту на 180 градусов вокруг Y и Z
                reflectionQuaternion.setFromEuler(new THREE.Euler(0, Math.PI, Math.PI));
                break;
            case 'y':
                // Отражение по оси Y эквивалентно повороту на 180 градусов вокруг X и Z
                reflectionQuaternion.setFromEuler(new THREE.Euler(Math.PI, 0, Math.PI));
                break;
            case 'z':
                // Отражение по оси Z эквивалентно повороту на 180 градусов вокруг X и Y
                reflectionQuaternion.setFromEuler(new THREE.Euler(Math.PI, Math.PI, 0));
                break;
        }

        // Применяем отражение к текущему вращению
        object.quaternion.multiply(reflectionQuaternion);
        object.quaternion.normalize();
    }

    createMaterialFromOriginal(originalObject) {
        // Получаем ОРИГИНАЛЬНЫЙ материал из userData или клонируем текущий
        let originalMaterial = null;

        // Пробуем получить оригинальный материал из userData
        if (originalObject.userData && originalObject.userData.originalMaterial) {
            try {
                originalMaterial = originalObject.userData.originalMaterial.clone();
            } catch (error) {
                console.warn('Не удалось клонировать оригинальный материал из userData:', error);
                originalMaterial = null;
            }
        }

        // Если нет оригинального материала в userData, берем текущий материал
        if (!originalMaterial && originalObject.material) {
            try {
                originalMaterial = originalObject.material.clone();
            } catch (error) {
                console.warn('Не удалось клонировать текущий материал:', error);
                originalMaterial = null;
            }
        }

        // Если все еще нет материала, создаем новый по умолчанию
        if (!originalMaterial) {
            originalMaterial = new THREE.MeshPhongMaterial({
                color: 0x808080,
                side: THREE.FrontSide,
                shininess: 30,
                specular: new THREE.Color(0x111111)
            });
        }

        // Гарантируем, что у материала есть цвет
        if (!originalMaterial.color) {
            originalMaterial.color = new THREE.Color(0x808080);
        }

        // Гарантируем, что цвет является THREE.Color
        if (!(originalMaterial.color instanceof THREE.Color)) {
            if (typeof originalMaterial.color === 'number') {
                originalMaterial.color = new THREE.Color(originalMaterial.color);
            } else if (originalMaterial.color.getHex) {
                originalMaterial.color = new THREE.Color(originalMaterial.color.getHex());
            } else {
                originalMaterial.color = new THREE.Color(0x808080);
            }
        }

        // Устанавливаем side как FrontSide
        originalMaterial.side = THREE.FrontSide;
        originalMaterial.needsUpdate = true;

        return originalMaterial;
    }

    setupUserData(mirroredObject, originalObject, isPlaneMirror) {
        // Копируем userData
        const userData = {};

        if (originalObject.userData) {
            for (const key in originalObject.userData) {
                if (originalObject.userData.hasOwnProperty(key)) {
                    const value = originalObject.userData[key];

                    // Копируем только простые типы
                    if (value === null ||
                        typeof value === 'boolean' ||
                        typeof value === 'number' ||
                        typeof value === 'string' ||
                        Array.isArray(value)) {
                        userData[key] = value;
                    }
                }
            }
        }

        // Добавляем информацию о зеркалировании
        userData.name = `${originalObject.userData?.name || 'Объект'} (зеркало)`;
        userData.createdAt = new Date().toISOString();
        userData.isMirrored = true;
        userData.originalObject = originalObject.uuid;

        if (isPlaneMirror) {
            userData.mirrorType = 'plane';
            userData.mirrorPlaneId = this.mirrorPlane.uuid;
        } else {
            userData.mirrorType = 'axis';
            userData.mirrorAxis = this.mirrorAxis;
        }

        // Сохраняем тип объекта
        if (originalObject.userData?.type) {
            userData.type = originalObject.userData.type;
        } else {
            userData.type = 'mirrored';
        }

        // Сохраняем ОРИГИНАЛЬНЫЙ материал для будущего использования
        if (originalObject.userData && originalObject.userData.originalMaterial) {
            userData.originalMaterial = originalObject.userData.originalMaterial.clone();
        } else if (originalObject.material) {
            userData.originalMaterial = originalObject.material.clone();
        }

        mirroredObject.userData = userData;
    }

    addObjectToScene(object) {
        // Добавляем объект в сцену
        this.editor.objectsGroup.add(object);
        this.editor.objects.push(object);

        // Обновляем матрицу
        object.updateMatrixWorld(true);

        // Гарантируем, что объект видим и отбрасывает тени
        object.visible = true;
        object.castShadow = true;
        object.receiveShadow = true;

        // Вычисляем ограничивающий объем
        if (object.geometry) {
            object.geometry.computeBoundingBox();
            object.geometry.computeBoundingSphere();
        }
    }

    cleanup() {
        this.closeModal();
        this.mirrorPlane = null;
        this.mirrorAxis = null;
    }

    canActivate() {
        return this.editor.selectedObjects.length > 0;
    }
}