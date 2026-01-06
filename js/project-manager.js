// project-manager.js - исправленная версия с полной сериализацией геометрии
class ProjectManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.currentProject = {
            name: 'Новый проект',
            description: '',
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };
    }

    // НОВЫЙ ПРОЕКТ
    newProject() {
        if (this.editor.objects.length > 0 &&
            !confirm('Создать новый проект? Несохраненные изменения будут потеряны.')) {
            return;
        }

        this.safeClearScene();

        this.currentProject = {
            name: 'Новый проект',
            description: '',
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        };

        document.getElementById('projectName').textContent = 'Новый проект';

        if (this.editor.objectsManager) {
            this.editor.objectsManager.updateSceneStats();
            this.editor.objectsManager.updateSceneList();
        }

        this.editor.updateStatus();
        this.editor.showStatus('Создан новый проект', 'info');
    }

    // БЕЗОПАСНАЯ ОЧИСТКА СЦЕНЫ
    safeClearScene() {
        // Создаем копию массива объектов для безопасного удаления
        const objectsToRemove = [...this.editor.objects];

        objectsToRemove.forEach(obj => {
            if (obj.parent) obj.parent.remove(obj);
            this.safeDisposeObject(obj);
        });

        // Очищаем группы
        if (this.editor.objectsGroup) {
            while (this.editor.objectsGroup.children.length > 0) {
                const child = this.editor.objectsGroup.children[0];
                this.editor.objectsGroup.remove(child);
                this.safeDisposeObject(child);
            }
        }

        if (this.editor.sketchGroup) {
            while (this.editor.sketchGroup.children.length > 0) {
                const child = this.editor.sketchGroup.children[0];
                this.editor.sketchGroup.remove(child);
                this.safeDisposeObject(child);
            }
        }

        // Очищаем массивы
        this.editor.objects = [];
        this.editor.workPlanes = [];
        this.editor.sketchPlanes = [];
        this.editor.selectedObjects = [];

        // Очищаем трансформации
        if (this.editor.transformControls) {
            this.editor.transformControls.detach();
            this.editor.transformControls.hide();
        }

        // Очищаем историю
        if (this.editor.history) this.editor.history.clear();
    }

    safeDisposeObject(object) {
        if (!object) return;

        try {
            if (object.geometry && typeof object.geometry.dispose === 'function') {
                object.geometry.dispose();
            }

            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => {
                        if (material && typeof material.dispose === 'function') {
                            material.dispose();
                        }
                    });
                } else if (typeof object.material.dispose === 'function') {
                    object.material.dispose();
                }
            }

            // Рекурсивно очищаем дочерние объекты
            if (object.children && object.children.length > 0) {
                for (let i = object.children.length - 1; i >= 0; i--) {
                    this.safeDisposeObject(object.children[i]);
                }
            }
        } catch (error) {
            console.warn('Ошибка при освобождении ресурсов объекта:', error);
        }
    }

    // СОХРАНЕНИЕ ПРОЕКТА
    showSaveModal() {
        document.getElementById('saveModal').classList.add('active');
    }

    saveProject() {
        const name = document.getElementById('projectNameInput').value || 'Без названия';
        const description = document.getElementById('projectDescription').value;

        this.currentProject = {
            metadata: {
                version: '4.0',
                type: 'cad-project',
                generator: 'КонтрБагCAD',
                createdAt: new Date().toISOString(),
                appVersion: this.editor.APP_VERSION
            },
            name: name,
            description: description,
            scene: this.serializeScene(),
            history: this.editor.history ? this.editor.history.exportHistory() : null,
            modified: new Date().toISOString()
        };

        try {
            this.downloadProjectFile(this.currentProject);
            document.getElementById('projectName').textContent = name;
            document.getElementById('saveModal').classList.remove('active');
            this.editor.showStatus(`Проект "${name}" сохранен в файл`, 'success');
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            this.editor.showStatus('Ошибка сохранения: ' + error.message, 'error');
        }
    }

    // СЕРИАЛИЗАЦИЯ СЦЕНЫ
    serializeScene() {
        const sceneData = {
            objects: [],
            sketches: []
        };

        // Сериализуем все объекты
        this.editor.objects.forEach(obj => {
            try {
                const objData = this.serializeObject(obj);
                if (objData) {
                    sceneData.objects.push(objData);
                }
            } catch (error) {
                console.warn('Ошибка сериализации объекта:', error, obj);
            }
        });

        // Сериализуем скетчи
        sceneData.sketches = this.serializeAllSketches();

        return sceneData;
    }

    serializeObject(object) {
        if (!object || !object.userData) return null;

        console.log('Serializing object:', object.userData.type, object.uuid);

        // ИСПРАВЛЕНИЕ: Всегда используем оригинальный материал для сериализации
        let materialToSerialize = object.userData.originalMaterial || object.material;

        // Если у объекта есть currentColor, создаем материал с правильным цветом
        if (object.userData.currentColor && !object.userData.originalMaterial) {
            materialToSerialize = new THREE.MeshPhongMaterial({
                color: new THREE.Color(object.userData.currentColor),
                transparent: object.userData.currentOpacity !== undefined ?
                           object.userData.currentOpacity < 1.0 :
                           (object.material?.transparent || false),
                opacity: object.userData.currentOpacity || 1.0
            });
        }

        const objData = {
            uuid: object.uuid,
            type: object.type,
            userData: this.cleanUserData(object.userData),
            position: object.position.toArray(),
            rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
            scale: object.scale.toArray(),
            visible: object.visible,
            castShadow: object.castShadow,
            receiveShadow: object.receiveShadow
        };

        // Сохраняем материал (оригинальный, не выделенный)
        if (materialToSerialize) {
            objData.material = this.serializeMaterial(materialToSerialize);
        }

        // Сохраняем геометрию
        if (object.geometry) {
            objData.geometry = this.serializeGeometry(object.geometry);
            console.log('Geometry serialized:', objData.geometry?.type);
        }

        return objData;
    }

    cleanUserData(userData) {
        if (!userData) return {};

        const cleaned = {};

        for (const key in userData) {
            const value = userData[key];

            // Пропускаем функции и THREE объекты
            if (typeof value === 'function') continue;
            if (value && (value.isObject3D || value.isMaterial || value.isBufferGeometry || value.isTexture)) {
                continue;
            }

            // Обработка Vector3
            if (value && value.isVector3) {
                cleaned[key] = value.toArray();
                continue;
            }

            // Обработка Euler
            if (value && value.isEuler) {
                cleaned[key] = [value.x, value.y, value.z];
                continue;
            }

            // Обработка Color
            if (value && value.isColor) {
                cleaned[key] = value.getHex();
                continue;
            }

            // Простые типы
            if (value === null ||
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean') {
                cleaned[key] = value;
                continue;
            }

            // Массивы
            if (Array.isArray(value)) {
                cleaned[key] = value.map(item => {
                    if (item && item.isVector3) return item.toArray();
                    if (item && item.isEuler) return [item.x, item.y, item.z];
                    if (item && item.isColor) return item.getHex();
                    return item;
                });
                continue;
            }

            // Объекты (рекурсивно)
            if (typeof value === 'object') {
                cleaned[key] = this.cleanUserData(value);
            }
        }

        // Гарантируем наличие типа
        if (!cleaned.type && userData.type) {
            cleaned.type = userData.type;
        }

        return cleaned;
    }

    serializeMaterial(material) {
        if (!material) return null;

        try {
            const matData = {
                type: material.type,
                uuid: material.uuid || THREE.MathUtils.generateUUID(),
                color: material.color ? material.color.getHex() : 0x808080,
                opacity: material.opacity !== undefined ? material.opacity : 1.0,
                transparent: material.transparent || false,
                side: material.side || THREE.FrontSide,
                wireframe: material.wireframe || false,
                shininess: material.shininess !== undefined ? material.shininess : 30,
                specular: material.specular ? material.specular.getHex() : 0x111111
            };

            // Дополнительные свойства
            if (material.emissive) matData.emissive = material.emissive.getHex();
            if (material.metalness !== undefined) matData.metalness = material.metalness;
            if (material.roughness !== undefined) matData.roughness = material.roughness;

            return matData;
        } catch (error) {
            console.error('Error serializing material:', error);
            return {
                type: 'MeshPhongMaterial',
                color: 0x808080,
                opacity: 1.0,
                transparent: false
            };
        }
    }

    serializeGeometry(geometry) {
        if (!geometry) return null;

        try {
            // Для BufferGeometry (STL, булевы операции и т.д.)
            if (geometry.isBufferGeometry) {
                const positions = geometry.attributes.position;
                const normals = geometry.attributes.normal;
                const indices = geometry.index;

                if (!positions) {
                    console.warn('Geometry has no position attribute');
                    return null;
                }

                const geomData = {
                    type: 'BufferGeometry',
                    uuid: geometry.uuid || THREE.MathUtils.generateUUID(),
                    positions: Array.from(positions.array),
                    normals: normals ? Array.from(normals.array) : [],
                    indices: indices ? Array.from(indices.array) : []
                };

                // Сохраняем bounding box если есть
                if (geometry.boundingBox) {
                    geomData.boundingBox = {
                        min: geometry.boundingBox.min.toArray(),
                        max: geometry.boundingBox.max.toArray()
                    };
                }

                // Сохраняем bounding sphere если есть
                if (geometry.boundingSphere) {
                    geomData.boundingSphere = {
                        center: geometry.boundingSphere.center.toArray(),
                        radius: geometry.boundingSphere.radius
                    };
                }

                return geomData;
            }

            // Для параметрических геометрий
            if (geometry.parameters) {
                return {
                    type: geometry.type,
                    uuid: geometry.uuid || THREE.MathUtils.generateUUID(),
                    parameters: this.cleanParameters(geometry.parameters)
                };
            }

        } catch (error) {
            console.error('Error serializing geometry:', error);
        }

        return null;
    }

    cleanParameters(parameters) {
        const cleaned = {};

        for (const key in parameters) {
            const value = parameters[key];

            // Пропускаем функции
            if (typeof value === 'function') continue;

            // Обработка Vector3 в параметрах
            if (value && value.isVector3) {
                cleaned[key] = value.toArray();
                continue;
            }

            // Простые типы
            if (value === null ||
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean') {
                cleaned[key] = value;
                continue;
            }

            // Массивы
            if (Array.isArray(value)) {
                cleaned[key] = value.map(item => {
                    if (item && item.isVector3) return item.toArray();
                    return item;
                });
                continue;
            }

            // Объекты
            if (typeof value === 'object') {
                cleaned[key] = this.cleanParameters(value);
            }
        }

        return cleaned;
    }

    // СЕРИАЛИЗАЦИЯ СКЕТЧЕЙ
    serializeAllSketches() {
        const sketches = [];

        const sketchPlanes = this.editor.objects.filter(obj =>
            obj.userData.type === 'sketch_plane' || obj.userData.type === 'work_plane'
        );

        sketchPlanes.forEach(plane => {
            const sketchData = this.serializeSketch(plane);
            if (sketchData) {
                sketches.push(sketchData);
            }
        });

        return sketches;
    }

    serializeSketch(plane) {
        if (!plane || !plane.children) return null;

        const elements = [];

        plane.children.forEach(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                const elementData = this.serializeObject(child);
                if (elementData) {
                    elements.push(elementData);
                }
            }
        });

        return {
            planeId: plane.uuid,
            planeType: plane.userData.type,
            planeData: this.serializeObject(plane),
            elements: elements
        };
    }

    // ЗАГРУЗКА ПРОЕКТА
    openProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.cadproj,.json,.cad';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const project = JSON.parse(event.target.result);
                    this.loadProject(project);
                } catch (error) {
                    alert('Ошибка при загрузке проекта: ' + error.message);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    loadProject(project) {
        if (!project || !project.scene) {
            alert('Неверный формат проекта');
            return;
        }

        // Очищаем текущую сцену
        this.newProject();

        let loadedCount = 0;
        let errorCount = 0;

        // Загружаем объекты
        if (project.scene.objects && Array.isArray(project.scene.objects)) {
            project.scene.objects.forEach(objData => {
                try {
                    const obj = this.deserializeObject(objData);
                    if (obj) {
                        this.editor.objectsGroup.add(obj);
                        this.editor.objects.push(obj);

                        if (obj.userData.type === 'sketch_plane') {
                            this.editor.sketchPlanes.push(obj);
                        } else if (obj.userData.type === 'work_plane') {
                            this.editor.workPlanes.push(obj);
                        }

                        loadedCount++;
                    }
                } catch (error) {
                    console.error('Ошибка при загрузке объекта:', error, objData);
                    errorCount++;
                }
            });
        }

        // Загружаем скетчи
        if (project.scene.sketches && Array.isArray(project.scene.sketches)) {
            project.scene.sketches.forEach(sketchData => {
                try {
                    this.restoreSketch(sketchData);
                } catch (error) {
                    console.error('Ошибка при восстановлении скетча:', error, sketchData);
                    errorCount++;
                }
            });
        }

        // Загружаем историю если есть
        if (project.history && this.editor.history) {
            this.editor.history.importHistory(project.history);
        }

        // Обновляем информацию о проекте
        this.currentProject = project;
        document.getElementById('projectName').textContent = project.name || 'Проект';

        // Обновляем интерфейс
        if (this.editor.objectsManager) {
            this.editor.objectsManager.updateSceneStats();
            this.editor.objectsManager.updateSceneList();
        }

        this.editor.updateStatus();

        const message = `Проект "${project.name || 'Проект'}" загружен (${loadedCount} объектов`;
        if (errorCount > 0) {
            this.editor.showStatus(`${message}, ошибок: ${errorCount})`, 'warning');
        } else {
            this.editor.showStatus(`${message})`, 'success');
        }
    }

    // ДЕСЕРИАЛИЗАЦИЯ ОБЪЕКТА
    deserializeObject(data) {
        if (!data || !data.userData) {
            console.warn('Invalid object data for deserialization:', data);
            return null;
        }

        console.log('Deserializing object:', data.userData.type, data.uuid);

        let geometry = null;
        let material = null;
        let originalMaterial = null;

        // Создаем материал
        if (data.material) {
            material = this.deserializeMaterial(data.material);
            originalMaterial = material.clone();
        } else {
            // Материал по умолчанию с цветом из userData
            const colorHex = data.userData.materialColor || data.userData.color || 0x808080;
            const opacity = data.userData.currentOpacity || data.userData.opacity || 1.0;

            material = new THREE.MeshPhongMaterial({
                color: new THREE.Color(colorHex),
                transparent: opacity < 1.0,
                opacity: opacity,
                shininess: 30,
                specular: new THREE.Color(0x111111)
            });
            originalMaterial = material.clone();
        }

        // Создаем геометрию - ВАЖНО: используем параметры из userData
        if (data.geometry) {
            geometry = this.deserializeGeometry(data.geometry);
        }

        // Если геометрия не создана или была создана как BufferGeometry,
        // но у нас есть параметры геометрии в userData, используем их
        if ((!geometry || geometry.type === 'BufferGeometry') &&
            data.userData.geometryType &&
            data.userData.geometryParams) {

            console.log('Creating geometry from userData parameters:', data.userData.geometryType);
            geometry = this.createGeometryFromParameters({
                type: data.userData.geometryType,
                parameters: data.userData.geometryParams
            });
        }

        // Если геометрия все еще не создана, создаем по умолчанию
        if (!geometry) {
            geometry = this.createDefaultGeometry(data.userData.type);
        }

        if (!geometry || !material) {
            console.error('Failed to create object:', data.userData.type);
            return null;
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.uuid = data.uuid || THREE.MathUtils.generateUUID();

        // ВОССТАНАВЛИВАЕМ ПОЗИЦИЮ И МАСШТАБ ИЗ userData
        if (data.userData.originalPosition) {
            mesh.position.fromArray(data.userData.originalPosition);
        } else if (data.position) {
            mesh.position.fromArray(data.position);
        }

        if (data.userData.originalScale) {
            mesh.scale.fromArray(data.userData.originalScale);
        } else if (data.scale) {
            mesh.scale.fromArray(data.scale);
        }

        // Восстанавливаем вращение
        if (data.rotation && data.rotation.length === 3) {
            mesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
        }

        // Критически важно: сохраняем userData ПЕРЕД добавлением originalMaterial
        mesh.userData = { ...data.userData };

        // Если есть флаг needsAnimation, но мы восстанавливаем из истории,
        // НЕ запускаем анимацию, сразу устанавливаем финальное состояние
        if (mesh.userData.needsAnimation) {
            // Сбрасываем анимацию, устанавливаем финальный масштаб
            mesh.scale.set(1, 1, 1);
            mesh.userData.needsAnimation = false;
        }

        // Сохраняем originalMaterial в userData объекта
        if (originalMaterial) {
            mesh.userData.originalMaterial = originalMaterial;
        }

        // Сохраняем оригинальный цвет и прозрачность
        if (data.userData.currentColor) {
            mesh.userData.currentColor = data.userData.currentColor;
        }
        if (data.userData.currentOpacity) {
            mesh.userData.currentOpacity = data.userData.currentOpacity;
        }

        // Восстанавливаем остальные свойства
        if (data.visible !== undefined) mesh.visible = data.visible;
        if (data.castShadow !== undefined) mesh.castShadow = data.castShadow;
        if (data.receiveShadow !== undefined) mesh.receiveShadow = data.receiveShadow;

        console.log('Object deserialized with userData:', mesh.userData);
        return mesh;
    }

    deserializeGeometry(geomData) {
        if (!geomData) {
            console.warn('No geometry data provided');
            return this.createBoxGeometry();
        }

        console.log('Deserializing geometry:', geomData.type);

        try {
            // BufferGeometry (STL, булевы операции)
            if (geomData.type === 'BufferGeometry') {
                const geometry = new THREE.BufferGeometry();

                // Восстанавливаем вершины
                if (geomData.positions && geomData.positions.length > 0) {
                    const positionsArray = new Float32Array(geomData.positions);
                    geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3));
                } else {
                    console.warn('No positions in geometry data');
                    return this.createBoxGeometry();
                }

                // Восстанавливаем нормали
                if (geomData.normals && geomData.normals.length > 0) {
                    const normalsArray = new Float32Array(geomData.normals);
                    geometry.setAttribute('normal', new THREE.BufferAttribute(normalsArray, 3));
                } else {
                    geometry.computeVertexNormals();
                }

                // Восстанавливаем индексы
                if (geomData.indices && geomData.indices.length > 0) {
                    const indicesArray = new Uint32Array(geomData.indices);
                    geometry.setIndex(new THREE.BufferAttribute(indicesArray, 1));
                }

                // Восстанавливаем bounding box
                if (geomData.boundingBox) {
                    geometry.boundingBox = new THREE.Box3(
                        new THREE.Vector3().fromArray(geomData.boundingBox.min),
                        new THREE.Vector3().fromArray(geomData.boundingBox.max)
                    );
                } else {
                    geometry.computeBoundingBox();
                }

                // Восстанавливаем bounding sphere
                if (geomData.boundingSphere) {
                    geometry.boundingSphere = new THREE.Sphere(
                        new THREE.Vector3().fromArray(geomData.boundingSphere.center),
                        geomData.boundingSphere.radius
                    );
                } else {
                    geometry.computeBoundingSphere();
                }

                return geometry;
            }

            // Параметрические геометрии
            return this.createGeometryFromParameters(geomData);

        } catch (error) {
            console.error('Error deserializing geometry:', error);
            return this.createBoxGeometry();
        }
    }

    createGeometryFromParameters(geomData) {
        if (!geomData.parameters) {
            console.warn('No parameters in geometry data');
            return this.createBoxGeometry();
        }

        const params = geomData.parameters;

        switch (geomData.type) {
            case 'BoxGeometry':
                return new THREE.BoxGeometry(
                    params.width || 25,
                    params.height || 25,
                    params.depth || 25,
                    params.widthSegments || 1,
                    params.heightSegments || 1,
                    params.depthSegments || 1
                );

            case 'SphereGeometry':
                return new THREE.SphereGeometry(
                    params.radius || 12.5,
                    params.widthSegments || 32,
                    params.heightSegments || 32,
                    params.phiStart || 0,
                    params.phiLength || Math.PI * 2,
                    params.thetaStart || 0,
                    params.thetaLength || Math.PI
                );

            case 'CylinderGeometry':
                return new THREE.CylinderGeometry(
                    params.radiusTop || 12.5,
                    params.radiusBottom || 12.5,
                    params.height || 25,
                    params.radialSegments || 32,
                    params.heightSegments || 1,
                    params.openEnded || false,
                    params.thetaStart || 0,
                    params.thetaLength || Math.PI * 2
                );

            case 'ConeGeometry':
                return new THREE.ConeGeometry(
                    params.radius || 12.5,
                    params.height || 25,
                    params.radialSegments || 32,
                    params.heightSegments || 1,
                    params.openEnded || false,
                    params.thetaStart || 0,
                    params.thetaLength || Math.PI * 2
                );

            case 'TorusGeometry':
                return new THREE.TorusGeometry(
                    params.radius || 25,
                    params.tube || 5,
                    params.radialSegments || 16,
                    params.tubularSegments || 100,
                    params.arc || Math.PI * 2
                );

            case 'PlaneGeometry':
                return new THREE.PlaneGeometry(
                    params.width || 100,
                    params.height || 100,
                    params.widthSegments || 1,
                    params.heightSegments || 1
                );

            case 'CircleGeometry':
                return new THREE.CircleGeometry(
                    params.radius || 10,
                    params.segments || 32,
                    params.thetaStart || 0,
                    params.thetaLength || Math.PI * 2
                );

            case 'TorusKnotGeometry':
                return new THREE.TorusKnotGeometry(
                    params.radius || 10,
                    params.tube || 3,
                    params.tubularSegments || 64,
                    params.radialSegments || 8,
                    params.p || 2,
                    params.q || 3
                );

            default:
                console.warn('Unknown geometry type:', geomData.type);
                return this.createBoxGeometry();
        }
    }

    createDefaultGeometry(type) {
        if (!type) return this.createBoxGeometry();

        const typeLower = type.toLowerCase();

        switch (typeLower) {
            case 'cube':
            case 'box':
                return this.createBoxGeometry();
            case 'sphere':
                return this.createSphereGeometry();
            case 'cylinder':
                return this.createCylinderGeometry();
            case 'cone':
                return this.createConeGeometry();
            case 'torus':
                return this.createTorusGeometry();
            case 'stl':
            case 'boolean':
            case 'boolean_result':
                // Для сложных геометрий создаем куб, но с флагом
                const geometry = this.createBoxGeometry();
                geometry.userData = { fallback: true, originalType: type };
                return geometry;
            default:
                console.warn('Unknown geometry type for default:', type);
                return this.createBoxGeometry();
        }
    }

    // Вспомогательные методы для создания геометрий
    createBoxGeometry(width = 25, height = 25, depth = 25) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    createSphereGeometry(radius = 12.5, segments = 32) {
        const geometry = new THREE.SphereGeometry(radius, segments, segments);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    createCylinderGeometry(radiusTop = 12.5, radiusBottom = 12.5, height = 25, segments = 32) {
        const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    createConeGeometry(radius = 12.5, height = 25, segments = 32) {
        const geometry = new THREE.ConeGeometry(radius, height, segments);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    createTorusGeometry(radius = 25, tube = 5, radialSegments = 16, tubularSegments = 100) {
        const geometry = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    deserializeMaterial(matData) {
        if (!matData) return null;

        let material;

        try {
            switch (matData.type) {
                case 'MeshBasicMaterial':
                    material = new THREE.MeshBasicMaterial();
                    break;
                case 'MeshPhongMaterial':
                    material = new THREE.MeshPhongMaterial();
                    break;
                case 'MeshStandardMaterial':
                    material = new THREE.MeshStandardMaterial();
                    break;
                case 'LineBasicMaterial':
                    material = new THREE.LineBasicMaterial();
                    break;
                default:
                    material = new THREE.MeshPhongMaterial();
            }

            // Восстанавливаем свойства
            if (matData.color !== undefined) material.color.setHex(matData.color);
            if (matData.opacity !== undefined) material.opacity = matData.opacity;
            if (matData.transparent !== undefined) material.transparent = matData.transparent;
            if (matData.side !== undefined) material.side = matData.side;
            if (matData.wireframe !== undefined) material.wireframe = matData.wireframe;
            if (matData.shininess !== undefined) material.shininess = matData.shininess;
            if (matData.specular !== undefined) material.specular.setHex(matData.specular);
            if (matData.emissive !== undefined) material.emissive.setHex(matData.emissive);
            if (matData.metalness !== undefined) material.metalness = matData.metalness;
            if (matData.roughness !== undefined) material.roughness = matData.roughness;

            return material;
        } catch (error) {
            console.error('Error deserializing material:', error);
            return new THREE.MeshPhongMaterial({ color: 0x808080 });
        }
    }

    // ВОССТАНОВЛЕНИЕ СКЕТЧЕЙ
    restoreSketch(sketchData) {
        if (!sketchData || !sketchData.planeData) {
            console.warn('Invalid sketch data:', sketchData);
            return;
        }

        // Создаем плоскость
        let plane = this.findObjectByUuid(sketchData.planeId);
        if (!plane) {
            plane = this.deserializeObject(sketchData.planeData);
            if (plane) {
                this.editor.objectsGroup.add(plane);
                this.editor.objects.push(plane);
                this.editor.sketchPlanes.push(plane);
            }
        }

        if (!plane) {
            console.warn('Failed to create plane for sketch');
            return;
        }

        // Восстанавливаем элементы
        if (sketchData.elements && Array.isArray(sketchData.elements)) {
            sketchData.elements.forEach(elementData => {
                this.restoreSketchElement(plane, elementData);
            });
        }

        plane.userData.hasSketch = true;
        plane.userData.sketchElementsCount = sketchData.elements ? sketchData.elements.length : 0;
    }

    restoreSketchElement(plane, elementData) {
        const obj = this.deserializeObject(elementData);
        if (obj) {
            plane.add(obj);
        }
    }

    // СКАЧИВАНИЕ ФАЙЛА
    downloadProjectFile(project) {
        const jsonString = JSON.stringify(project, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const safeFileName = project.name.replace(/[^a-z0-9а-яё\s]/gi, '_').toLowerCase();
        const fileName = `${safeFileName}.cadproj`;

        this.downloadFile(blob, fileName);
    }

    downloadFile(blob, fileName) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ПОИСК ОБЪЕКТА
    findObjectByUuid(uuid) {
        return this.editor.objects.find(obj => obj.uuid === uuid) || null;
    }

    // ЭКСПОРТ
    showExportModal() {
        document.getElementById('exportModal').classList.add('active');
        document.getElementById('exportFileName').value =
            document.getElementById('projectName').textContent.replace(/\s+/g, '_');
    }

    exportModel() {
        const format = document.getElementById('exportFormat').value;
        const exportSelected = document.getElementById('exportSelected').checked;
        const fileName = document.getElementById('exportFileName').value || 'model';

        let exportObjects;
        if (exportSelected && this.editor.selectedObjects.length > 0) {
            exportObjects = this.editor.selectedObjects;
        } else {
            exportObjects = this.editor.objects.filter(obj =>
                obj.userData.type !== 'sketch_plane' &&
                obj.userData.type !== 'work_plane' &&
                obj.userData.type !== 'sketch_element'
            );
        }

        if (exportObjects.length === 0) {
            alert('Нет объектов для экспорта!');
            return;
        }

        switch (format) {
            case 'stl':
            case 'stl-ascii':
                this.exportSTL(exportObjects, fileName, format === 'stl-ascii');
                break;
            case 'json':
                this.exportJSON(exportObjects, fileName);
                break;
        }
    }

    exportSTL(objects, fileName, ascii = false) {
        const exporter = new THREE.STLExporter();

        let sceneToExport;
        if (objects.length === 1) {
            sceneToExport = objects[0];
        } else {
            sceneToExport = new THREE.Group();
            objects.forEach(obj => {
                const clone = obj.clone();
                sceneToExport.add(clone);
            });
        }

        // Поворачиваем для правильного экспорта (Z-up)
        sceneToExport.traverse(child => {
            if (child.isMesh) {
                child.geometry.rotateX(Math.PI / 2);
            }
        });

        const stlString = exporter.parse(sceneToExport, { binary: !ascii });

        // Поворачиваем обратно
        sceneToExport.traverse(child => {
            if (child.isMesh) {
                child.geometry.rotateX(Math.PI / 2);
            }
        });

        const blob = new Blob(
            [stlString],
            { type: ascii ? 'text/plain' : 'application/octet-stream' }
        );

        this.downloadFile(blob, fileName + '.stl');
        this.editor.showStatus('Экспорт STL завершен', 'success');

        // Поворачиваем обратно (Z-up)
        sceneToExport.traverse(child => {
            if (child.isMesh) {
                child.geometry.rotateX(Math.PI);
            }
        });

    }

    exportJSON(objects, fileName) {
        const exportData = {
            metadata: {
                version: '4.0',
                type: 'cad-export',
                exportDate: new Date().toISOString(),
                appVersion: this.editor.APP_VERSION
            },
            name: fileName,
            objects: objects.map(obj => this.serializeObject(obj)).filter(obj => obj)
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });

        this.downloadFile(blob, fileName + '.json');
        this.editor.showStatus('Экспорт JSON завершен', 'success');
    }

    exportSVG() {
        this.editor.showStatus('Экспорт SVG в разработке', 'info');
    }

    // ЗАГРУЗКА STL
    openSTL() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.stl';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                this.loadSTLFromBuffer(event.target.result, file.name);
            };
            reader.readAsArrayBuffer(file);
        };

        input.click();
    }

    // project-manager.js
    loadSTLFromBuffer(buffer, filename) {
        try {
            const isBinary = this.isBinarySTL(buffer);
            const geometry = isBinary ? this.parseBinarySTL(buffer) : this.parseASCIISTL(buffer);

            if (!geometry) {
                this.editor.showStatus('Ошибка при чтении STL файла', 'error');
                return;
            }

            // Вычисляем центр ограничивающей рамки геометрии
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const center = new THREE.Vector3();
            box.getCenter(center);

            // Сдвигаем геометрию так, чтобы ее центр был в начале координат
            const positions = geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] -= center.x;
                positions[i + 1] -= center.y;
                positions[i + 2] -= center.z;
            }
            geometry.attributes.position.needsUpdate = true;

            // Пересчитываем ограничивающую рамку после сдвига
            geometry.computeBoundingBox();

            // Поворачиваем геометрию для нашей системы координат (Y-up)
            geometry.rotateX(-Math.PI / 2);

            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color('#AAAAAA'),
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
                shininess: 30
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Теперь меш уже центрирован, поднимаем на половину высоты
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            const size = new THREE.Vector3();
            bbox.getSize(size);
            mesh.position.y = size.y / 2;

            mesh.userData = {
                id: 'stl_' + Date.now(),
                name: filename.replace('.stl', ''),
                type: 'stl',
                createdAt: new Date().toISOString(),
                unit: 'mm',
                filename: filename,
                originalGeometry: geometry // Сохраняем ссылку на оригинальную геометрию
            };

            this.editor.objectsGroup.add(mesh);
            this.editor.objects.push(mesh);

            this.editor.clearSelection();
            this.editor.selectObject(mesh);

            if (this.editor.objectsManager) {
                this.editor.objectsManager.updateSceneStats();
                this.editor.objectsManager.updateSceneList();
            }

            this.editor.showStatus(`Загружен STL: ${filename}`, 'success');

            // Добавляем в историю
            if (this.editor.history) {
                this.editor.history.addAction({
                    type: 'import',
                    format: 'stl',
                    object: mesh.uuid,
                    data: this.serializeObjectForHistory(mesh)
                });
            }

        } catch (error) {
            console.error('STL loading error:', error);
            this.editor.showStatus(`Ошибка загрузки STL: ${error.message}`, 'error');
        }
    }

    isBinarySTL(buffer) {
        const dataView = new DataView(buffer);
        const triangleCount = dataView.getUint32(80, true);
        const expectedSize = 84 + (triangleCount * 50);
        return buffer.byteLength === expectedSize;
    }

    parseBinarySTL(buffer) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const normals = [];

        const dataView = new DataView(buffer);
        const triangleCount = dataView.getUint32(80, true);
        let offset = 84;

        for (let i = 0; i < triangleCount; i++) {
            const normal = [
                dataView.getFloat32(offset, true),
                dataView.getFloat32(offset + 4, true),
                dataView.getFloat32(offset + 8, true)
            ];
            offset += 12;

            for (let j = 0; j < 3; j++) {
                vertices.push(
                    dataView.getFloat32(offset, true),
                    dataView.getFloat32(offset + 4, true),
                    dataView.getFloat32(offset + 8, true)
                );
                normals.push(...normal);
                offset += 12;
            }

            offset += 2;
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return geometry;
    }

    parseASCIISTL(buffer) {
        const text = new TextDecoder().decode(buffer);
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const normals = [];

        const lines = text.split('\n');
        let currentNormal = null;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('facet normal')) {
                const parts = trimmed.split(/\s+/);
                currentNormal = [
                    parseFloat(parts[2]),
                    parseFloat(parts[3]),
                    parseFloat(parts[4])
                ];
            } else if (trimmed.startsWith('vertex')) {
                const parts = trimmed.split(/\s+/);
                vertices.push(
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                );
                if (currentNormal) {
                    normals.push(...currentNormal);
                }
            }
        }

        if (vertices.length === 0) return null;

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        if (normals.length === vertices.length) {
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        } else {
            geometry.computeVertexNormals();
        }

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return geometry;
    }

    // ИСТОРИЯ
    serializeObjectForHistory(obj) {
        return this.serializeObject(obj);
    }

    deserializeObjectOptimized(data) {
        return this.deserializeObject(data);
    }
}