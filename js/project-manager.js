// project-manager.js - сохраняет проекты только в файлы, хранит геометрию для всех объектов
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

        // Очищаем массивы
        this.editor.objects = [];
        this.editor.workPlanes = [];
        this.editor.sketchPlanes = [];
        this.editor.selectedObjects = [];

        if (this.editor.history) this.editor.history.clear();
        if (this.editor.transformControls) this.editor.transformControls.detach();

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
        // Удаляем все объекты из сцены
        const removeObjects = [...this.editor.objects];

        removeObjects.forEach(obj => {
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

        this.editor.objects = [];
        this.editor.workPlanes = [];
        this.editor.sketchPlanes = [];
        this.editor.selectedObjects = [];
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

            // Рекурсивно удаляем дочерние объекты
            if (object.children) {
                for (let i = object.children.length - 1; i >= 0; i--) {
                    this.safeDisposeObject(object.children[i]);
                    if (object.children[i].parent) {
                        object.children[i].parent.remove(object.children[i]);
                    }
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
                version: '3.0',
                type: 'cad-project',
                generator: 'КонтрБагCAD',
                createdAt: new Date().toISOString(),
                appVersion: this.editor.APP_VERSION
            },
            name: name,
            description: description,
            scene: this.serializeScene(),
            modified: new Date().toISOString()
        };

        try {
            // Только сохраняем в файл, не в localStorage
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

        // Сериализуем скетчи отдельно
        sceneData.sketches = this.serializeAllSketches();

        return sceneData;
    }

    serializeObject(object) {
        if (!object || !object.userData) return null;

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

        // Сохраняем материал
        if (object.material) {
            objData.material = this.serializeMaterial(object.material);
        }

        // Сохраняем геометрию для ВСЕХ объектов
        if (object.geometry) {
            objData.geometry = this.serializeGeometry(object.geometry);
        }

        return objData;
    }

    cleanUserData(userData) {
        if (!userData) return {};

        const cleaned = {};

        // Сохраняем все простые свойства
        for (const key in userData) {
            const value = userData[key];

            // Пропускаем функции и сложные объекты
            if (typeof value === 'function') continue;

            // Проверяем на THREE объекты - используем флаги is* вместо instanceof
            if (value && (
                value.isObject3D ||
                value.isMaterial ||
                value.isBufferGeometry || // Заменяем THREE.Geometry на isBufferGeometry
                value.isTexture
            )) {
                continue;
            }

            // Для Vector3 сохраняем как массив
            if (value && value.isVector3) {
                cleaned[key] = value.toArray();
                continue;
            }

            // Сохраняем простые типы
            if (value === null ||
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean') {
                cleaned[key] = value;
                continue;
            }

            // Сохраняем массивы простых типов
            if (Array.isArray(value)) {
                // Проверяем, что массив не содержит сложных объектов
                const isSimpleArray = value.every(item =>
                    item === null ||
                    typeof item !== 'object' ||
                    (item && item.isVector3) // Vector3 обрабатываем отдельно
                );

                if (isSimpleArray) {
                    // Конвертируем Vector3 в массивы
                    cleaned[key] = value.map(item =>
                        item && item.isVector3 ? item.toArray() : item
                    );
                }
                continue;
            }

            // Рекурсивно очищаем объекты
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

        return {
            type: material.type,
            color: material.color ? material.color.getHex() : 0xAAAAAA,
            opacity: material.opacity || 1.0,
            transparent: material.transparent || false,
            side: material.side || THREE.FrontSide,
            wireframe: material.wireframe || false
        };
    }

    serializeGeometry(geometry) {
        if (!geometry || !geometry.attributes || !geometry.attributes.position) {
            return null;
        }

        // Всегда работаем с BufferGeometry
        if (geometry.isBufferGeometry) {
            const positions = geometry.attributes.position.array;
            const normals = geometry.attributes.normal ? geometry.attributes.normal.array : [];
            const indices = geometry.index ? Array.from(geometry.index.array) : [];

            return {
                type: 'BufferGeometry',
                positions: Array.from(positions),
                normals: normals.length > 0 ? Array.from(normals) : [],
                indices: indices,
                boundingBox: geometry.boundingBox ? {
                    min: geometry.boundingBox.min.toArray(),
                    max: geometry.boundingBox.max.toArray()
                } : null
            };
        }

        // Для совместимости с примитивами
        if (geometry.parameters) {
            return {
                type: geometry.type,
                parameters: { ...geometry.parameters }
            };
        }

        return null;
    }

    // СЕРИАЛИЗАЦИЯ СКЕТЧЕЙ
    serializeAllSketches() {
        const sketches = [];

        // Находим все плоскости скетчей
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
                const elementData = this.serializeSketchElement(child);
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

    serializeSketchElement(element) {
        const elementData = {
            uuid: element.uuid,
            type: element.type,
            userData: this.cleanUserData(element.userData),
            position: element.position.toArray(),
            rotation: [element.rotation.x, element.rotation.y, element.rotation.z],
            scale: element.scale.toArray(),
            visible: element.visible
        };

        // Сохраняем материал
        if (element.material) {
            elementData.material = this.serializeMaterial(element.material);
        }

        // Сохраняем геометрию для всех элементов скетча
        if (element.geometry && element.geometry.attributes && element.geometry.attributes.position) {
            const positions = element.geometry.attributes.position.array;
            elementData.geometry = {
                positions: Array.from(positions),
                type: element.geometry.type
            };
        }

        return elementData;
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

        // Сначала загружаем все объекты (включая примитивы и вытянутые объекты)
        if (project.scene.objects && Array.isArray(project.scene.objects)) {
            project.scene.objects.forEach(objData => {
                try {
                    const obj = this.deserializeObject(objData);
                    if (obj) {
                        this.editor.objectsGroup.add(obj);
                        this.editor.objects.push(obj);

                        // Регистрируем специальные типы
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

        // Затем загружаем скетчи
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

        console.log('Deserializing object:', data.userData.type, data);

        let geometry = null;
        let material = null;

        // Создаем материал
        if (data.material) {
            material = this.deserializeMaterial(data.material);
        } else {
            // Материал по умолчанию
            const colorHex = data.userData.currentColor || data.userData.color || 0x808080;
            const opacity = data.userData.currentOpacity || data.userData.opacity || 1.0;

            material = new THREE.MeshPhongMaterial({
                color: new THREE.Color(colorHex),
                transparent: opacity < 1.0,
                opacity: opacity,
                shininess: 30
            });
        }

        // Создаем геометрию
        if (data.geometry) {
            try {
                geometry = this.deserializeGeometry(data.geometry);
                if (!geometry) {
                    console.warn('Failed to deserialize geometry, creating default');
                    geometry = this.createDefaultGeometry(data.userData.type);
                }
            } catch (error) {
                console.error('Error deserializing geometry:', error);
                geometry = this.createDefaultGeometry(data.userData.type);
            }
        } else {
            geometry = this.createDefaultGeometry(data.userData.type);
        }

        // ОБЯЗАТЕЛЬНО: Создаем bounding box и bounding sphere
        if (geometry) {
            try {
                // Вычисляем bounding box если его нет
                if (!geometry.boundingBox) {
                    geometry.computeBoundingBox();
                }

                // Вычисляем bounding sphere если его нет
                if (!geometry.boundingSphere) {
                    geometry.computeBoundingSphere();
                }

                // Гарантируем, что есть атрибуты
                if (!geometry.attributes.position) {
                    console.warn('No position attributes, creating basic geometry');
                    const tempGeometry = new THREE.BoxGeometry(25, 25, 25);
                    tempGeometry.computeBoundingBox();
                    tempGeometry.computeBoundingSphere();
                    geometry = tempGeometry;
                }
            } catch (error) {
                console.error('Error preparing geometry:', error);
                // Создаем базовую безопасную геометрию
                geometry = new THREE.BoxGeometry(25, 25, 25);
                geometry.computeBoundingBox();
                geometry.computeBoundingSphere();
            }
        }

        if (!geometry || !material) {
            console.error('Failed to create object:', data.userData.type);
            return null;
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.uuid = data.uuid || THREE.MathUtils.generateUUID();
        mesh.userData = data.userData || {};

        // Восстанавливаем трансформации
        if (data.position) mesh.position.fromArray(data.position);
        if (data.rotation && data.rotation.length === 3) {
            mesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
        }
        if (data.scale) mesh.scale.fromArray(data.scale);
        if (data.visible !== undefined) mesh.visible = data.visible;
        if (data.castShadow !== undefined) mesh.castShadow = data.castShadow;
        if (data.receiveShadow !== undefined) mesh.receiveShadow = data.receiveShadow;

        return mesh;
    }


    // Добавьте метод для создания геометрии по умолчанию:
    createDefaultGeometry(type) {
        if (!type) {
            return this.createBoxGeometry();
        }

        const typeLower = type.toLowerCase();

        switch(typeLower) {
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
            case 'boolean':
            case 'boolean_result':
                // Для булевых результатов создаем простую геометрию
                return this.createBoxGeometry();
            default:
                console.warn('Unknown geometry type:', type);
                return this.createBoxGeometry();
        }
    }

    // Вспомогательные методы для создания геометрий с bounding box
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

        switch (matData.type) {
            case 'MeshBasicMaterial':
                material = new THREE.MeshBasicMaterial();
                break;
            case 'MeshPhongMaterial':
                material = new THREE.MeshPhongMaterial();
                break;
            case 'LineBasicMaterial':
                material = new THREE.LineBasicMaterial();
                break;
            default:
                material = new THREE.MeshPhongMaterial();
        }

        // Восстанавливаем свойства
        if (matData.color) material.color.setHex(matData.color);
        if (matData.opacity !== undefined) material.opacity = matData.opacity;
        if (matData.transparent !== undefined) material.transparent = matData.transparent;
        if (matData.side !== undefined) material.side = matData.side;
        if (matData.wireframe !== undefined) material.wireframe = matData.wireframe;
        if (matData.linewidth !== undefined) material.linewidth = matData.linewidth;

        return material;
    }

    deserializeGeometry(geomData) {
        if (!geomData) {
            console.warn('No geometry data provided');
            return new THREE.BoxGeometry(25, 25, 25);
        }

        console.log('Deserializing geometry:', geomData);

        try {
            // Обработка BufferGeometry (современный формат)
            if (geomData.type === 'BufferGeometry' || (geomData.positions && Array.isArray(geomData.positions))) {
                console.log('Creating BufferGeometry from data');
                const geometry = new THREE.BufferGeometry();

                // Восстанавливаем позиции вершин
                if (geomData.positions && geomData.positions.length > 0) {
                    const positionsArray = new Float32Array(geomData.positions);
                    geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3));
                }

                // Восстанавливаем нормали
                if (geomData.normals && geomData.normals.length > 0) {
                    const normalsArray = new Float32Array(geomData.normals);
                    geometry.setAttribute('normal', new THREE.BufferAttribute(normalsArray, 3));
                } else {
                    // Вычисляем нормали если их нет
                    geometry.computeVertexNormals();
                }

                // Восстанавливаем индексы
                if (geomData.indices && geomData.indices.length > 0) {
                    let indicesArray;
                    if (geomData.indices instanceof Array) {
                        indicesArray = new Uint32Array(geomData.indices);
                    } else if (geomData.indices instanceof Uint32Array ||
                              geomData.indices instanceof Uint16Array ||
                              geomData.indices instanceof Uint8Array) {
                        indicesArray = geomData.indices;
                    } else {
                        indicesArray = new Uint32Array(geomData.indices);
                    }
                    geometry.setIndex(new THREE.BufferAttribute(indicesArray, 1));
                }

                // Вычисляем bounding box и bounding sphere
                geometry.computeBoundingBox();
                geometry.computeBoundingSphere();

                return geometry;
            }

            // Обработка параметрических геометрий (примитивы)
            if (geomData.type === 'BoxGeometry' && geomData.parameters) {
                return new THREE.BoxGeometry(
                    geomData.parameters.width || 25,
                    geomData.parameters.height || 25,
                    geomData.parameters.depth || 25,
                    geomData.parameters.widthSegments || 1,
                    geomData.parameters.heightSegments || 1,
                    geomData.parameters.depthSegments || 1
                );
            } else if (geomData.type === 'SphereGeometry' && geomData.parameters) {
                return new THREE.SphereGeometry(
                    geomData.parameters.radius || 12.5,
                    geomData.parameters.widthSegments || 32,
                    geomData.parameters.heightSegments || 32,
                    geomData.parameters.phiStart || 0,
                    geomData.parameters.phiLength || Math.PI * 2,
                    geomData.parameters.thetaStart || 0,
                    geomData.parameters.thetaLength || Math.PI
                );
            } else if (geomData.type === 'CylinderGeometry' && geomData.parameters) {
                return new THREE.CylinderGeometry(
                    geomData.parameters.radiusTop || 12.5,
                    geomData.parameters.radiusBottom || 12.5,
                    geomData.parameters.height || 25,
                    geomData.parameters.radialSegments || 32,
                    geomData.parameters.heightSegments || 1,
                    geomData.parameters.openEnded || false,
                    geomData.parameters.thetaStart || 0,
                    geomData.parameters.thetaLength || Math.PI * 2
                );
            } else if (geomData.type === 'ConeGeometry' && geomData.parameters) {
                return new THREE.ConeGeometry(
                    geomData.parameters.radius || 12.5,
                    geomData.parameters.height || 25,
                    geomData.parameters.radialSegments || 32,
                    geomData.parameters.heightSegments || 1,
                    geomData.parameters.openEnded || false,
                    geomData.parameters.thetaStart || 0,
                    geomData.parameters.thetaLength || Math.PI * 2
                );
            } else if (geomData.type === 'TorusGeometry' && geomData.parameters) {
                return new THREE.TorusGeometry(
                    geomData.parameters.radius || 25,
                    geomData.parameters.tube || 5,
                    geomData.parameters.radialSegments || 16,
                    geomData.parameters.tubularSegments || 100,
                    geomData.parameters.arc || Math.PI * 2
                );
            } else if (geomData.type === 'PlaneGeometry' && geomData.parameters) {
                return new THREE.PlaneGeometry(
                    geomData.parameters.width || 100,
                    geomData.parameters.height || 100,
                    geomData.parameters.widthSegments || 1,
                    geomData.parameters.heightSegments || 1
                );
            } else if (geomData.type === 'CircleGeometry' && geomData.parameters) {
                return new THREE.CircleGeometry(
                    geomData.parameters.radius || 10,
                    geomData.parameters.segments || 32,
                    geomData.parameters.thetaStart || 0,
                    geomData.parameters.thetaLength || Math.PI * 2
                );
            } else if (geomData.type === 'RingGeometry' && geomData.parameters) {
                return new THREE.RingGeometry(
                    geomData.parameters.innerRadius || 5,
                    geomData.parameters.outerRadius || 10,
                    geomData.parameters.thetaSegments || 32,
                    geomData.parameters.phiSegments || 1,
                    geomData.parameters.thetaStart || 0,
                    geomData.parameters.thetaLength || Math.PI * 2
                );
            } else if (geomData.type === 'TorusKnotGeometry' && geomData.parameters) {
                return new THREE.TorusKnotGeometry(
                    geomData.parameters.radius || 10,
                    geomData.parameters.tube || 3,
                    geomData.parameters.tubularSegments || 64,
                    geomData.parameters.radialSegments || 8,
                    geomData.parameters.p || 2,
                    geomData.parameters.q || 3
                );
            } else if (geomData.type === 'OctahedronGeometry' && geomData.parameters) {
                return new THREE.OctahedronGeometry(
                    geomData.parameters.radius || 10,
                    geomData.parameters.detail || 0
                );
            } else if (geomData.type === 'TetrahedronGeometry' && geomData.parameters) {
                return new THREE.TetrahedronGeometry(
                    geomData.parameters.radius || 10,
                    geomData.parameters.detail || 0
                );
            } else if (geomData.type === 'DodecahedronGeometry' && geomData.parameters) {
                return new THREE.DodecahedronGeometry(
                    geomData.parameters.radius || 10,
                    geomData.parameters.detail || 0
                );
            } else if (geomData.type === 'IcosahedronGeometry' && geomData.parameters) {
                return new THREE.IcosahedronGeometry(
                    geomData.parameters.radius || 10,
                    geomData.parameters.detail || 0
                );
            } else if (geomData.type === 'LatheGeometry' && geomData.parameters && geomData.parameters.points) {
                const points = geomData.parameters.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
                return new THREE.LatheGeometry(
                    points,
                    geomData.parameters.segments || 12,
                    geomData.parameters.phiStart || 0,
                    geomData.parameters.phiLength || Math.PI * 2
                );
            }

            // Если тип не распознан, создаем простую геометрию
            console.warn('Unknown geometry type or format:', geomData.type, 'Using fallback BoxGeometry');
            return new THREE.BoxGeometry(25, 25, 25);

        } catch (error) {
            console.error('Error deserializing geometry:', error);
            // Возвращаем простую геометрию в случае ошибки
            const fallbackGeometry = new THREE.BoxGeometry(25, 25, 25);
            fallbackGeometry.computeBoundingBox();
            fallbackGeometry.computeBoundingSphere();
            return fallbackGeometry;
        }
    }

    deserializeComplexGeometry(geomData) {
        if (!geomData) {
            console.warn('No geometry data provided');
            return this.createBoxGeometry();
        }

        // Если нет позиций, создаем дефолтную геометрию
        if (!geomData.positions || !Array.isArray(geomData.positions) || geomData.positions.length === 0) {
            console.warn('No positions in geometry data:', geomData);
            return this.createBoxGeometry();
        }

        const geometry = new THREE.BufferGeometry();

        try {
            // Восстанавливаем вершины
            const positionsArray = new Float32Array(geomData.positions);
            geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3));

            // Восстанавливаем нормали если есть
            if (geomData.normals && geomData.normals.length === geomData.positions.length) {
                const normalsArray = new Float32Array(geomData.normals);
                geometry.setAttribute('normal', new THREE.BufferAttribute(normalsArray, 3));
            } else {
                geometry.computeVertexNormals();
            }

            // Восстанавливаем индексы если есть
            if (geomData.indices && geomData.indices.length > 0) {
                const indicesArray = new Uint32Array(geomData.indices);
                geometry.setIndex(new THREE.BufferAttribute(indicesArray, 1));
            }

            // ВЫЧИСЛЯЕМ bounding box И bounding sphere
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();

            // Проверяем, что все создалось правильно
            if (!geometry.boundingBox || !geometry.boundingSphere) {
                console.warn('Failed to compute bounds, recreating geometry');
                return this.createBoxGeometry();
            }

            return geometry;
        } catch (error) {
            console.error('Error deserializing complex geometry:', error);
            // Возвращаем безопасную геометрию
            return this.createBoxGeometry();
        }
    }

    // ВОССТАНОВЛЕНИЕ СКЕТЧЕЙ
    restoreSketch(sketchData) {
        if (!sketchData || !sketchData.planeData) {
            console.warn('Некорректные данные скетча:', sketchData);
            return;
        }

        // Сначала создаем или находим плоскость
        let plane = this.findObjectByUuid(sketchData.planeId);

        if (!plane && sketchData.planeData) {
            // Создаем плоскость из сохраненных данных
            plane = this.deserializeObject(sketchData.planeData);
            if (plane) {
                this.editor.objectsGroup.add(plane);
                this.editor.objects.push(plane);
                this.editor.sketchPlanes.push(plane);
            }
        }

        if (!plane) {
            console.warn('Не удалось создать плоскость для скетча');
            return;
        }

        // Затем восстанавливаем элементы скетча
        if (sketchData.elements && Array.isArray(sketchData.elements)) {
            sketchData.elements.forEach(elementData => {
                this.restoreSketchElement(plane, elementData);
            });
        }

        // Сохраняем ссылку на скетч в плоскости
        plane.userData.hasSketch = true;
        plane.userData.sketchElementsCount = sketchData.elements ? sketchData.elements.length : 0;
    }

    restoreSketchElement(plane, elementData) {
        let geometry = null;
        let material = null;

        // Создаем материал
        if (elementData.material) {
            material = this.deserializeMaterial(elementData.material);
        } else {
            material = new THREE.LineBasicMaterial({
                color: 0x2196F3,
                linewidth: 2
            });
        }

        // Создаем геометрию
        if (elementData.geometry && elementData.geometry.positions) {
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position',
                new THREE.Float32BufferAttribute(elementData.geometry.positions, 3));
        } else {
            console.warn('Нет данных геометрии для элемента скетча:', elementData);
            return;
        }

        let mesh;

        // Определяем тип меша на основе данных
        if (elementData.userData && elementData.userData.elementType === 'circle' ||
            elementData.userData && elementData.userData.isClosed) {
            mesh = new THREE.LineLoop(geometry, material);
        } else {
            mesh = new THREE.Line(geometry, material);
        }

        // Восстанавливаем трансформации
        if (elementData.position) mesh.position.fromArray(elementData.position);
        if (elementData.rotation && elementData.rotation.length === 3) {
            mesh.rotation.set(elementData.rotation[0], elementData.rotation[1], elementData.rotation[2]);
        }
        if (elementData.scale) mesh.scale.fromArray(elementData.scale);
        if (elementData.visible !== undefined) mesh.visible = elementData.visible;

        // Восстанавливаем userData
        mesh.userData = elementData.userData || {};
        mesh.userData.type = 'sketch_element';
        mesh.userData.sketchPlaneId = plane.uuid;

        // Добавляем элемент к плоскости
        plane.add(mesh);
    }

    // ПОИСК ОБЪЕКТА ПО UUID
    findObjectByUuid(uuid) {
        return this.editor.objects.find(obj => obj.uuid === uuid) || null;
    }

    // СКАЧИВАНИЕ ФАЙЛА ПРОЕКТА
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
                child.geometry.rotateX(-Math.PI / 2);
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
    }

    exportJSON(objects, fileName) {
        const exportData = {
            metadata: {
                version: '3.0',
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

    // ОТКРЫТИЕ STL ФАЙЛОВ
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

    loadSTLFromBuffer(buffer, filename) {
        try {
            const isBinary = this.isBinarySTL(buffer);
            const geometry = isBinary ? this.parseBinarySTL(buffer) : this.parseASCIISTL(buffer);

            if (!geometry) {
                this.editor.showStatus('Ошибка при чтении STL файла', 'error');
                return;
            }

            // Поворачиваем геометрию для нашей системы координат (Y-up)
            geometry.rotateX(-Math.PI / 2);

            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color('#AAAAAA'),
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Центрируем объект
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const center = new THREE.Vector3();
            box.getCenter(center);
            mesh.position.sub(center);

            mesh.userData = {
                id: 'stl_' + Date.now(),
                name: filename.replace('.stl', ''),
                type: 'stl',
                createdAt: new Date().toISOString(),
                unit: 'mm',
                filename: filename
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

            this.editor.history.addAction({
                type: 'import',
                format: 'stl',
                object: mesh.uuid,
                data: {
                    filename: filename,
                    userData: { ...mesh.userData },
                    position: mesh.position.toArray(),
                    rotation: mesh.rotation.toArray(),
                    scale: mesh.scale.toArray()
                }
            });

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

        return geometry;
    }


    // ИСТОРИЯ
    serializeObjectForHistory(obj) {
        console.log('=== serializeObjectForHistory called for:', obj.userData?.type, obj);

        if (!obj) {
            console.warn('Attempt to serialize null object');
            return null;
        }

        // Базовые данные
        const data = {
            uuid: obj.uuid,
            type: obj.type,
            userData: this.cleanUserData(obj.userData || {}),
            position: obj.position.toArray(),
            rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            scale: obj.scale.toArray(),
            visible: obj.visible !== false,
            castShadow: obj.castShadow || false,
            receiveShadow: obj.receiveShadow || false
        };

        // Сохраняем материал
        if (obj.material) {
            try {
                data.material = this.serializeMaterial(obj.material);
            } catch (error) {
                console.error('Error serializing material:', error);
                data.material = this.serializeMaterial(new THREE.MeshPhongMaterial({ color: 0x808080 }));
            }
        }

        // Сохраняем геометрию - ВАЖНО!
        if (obj.geometry) {
            try {
                console.log('Object has geometry:', obj.geometry.type, obj.geometry);
                data.geometry = this.serializeGeometryForHistory(obj.geometry);
                console.log('Geometry serialized:', data.geometry);
            } catch (error) {
                console.error('Error serializing geometry:', error);
                // Если не удалось сериализовать, создаем простую геометрию по типу
                data.geometry = this.createFallbackGeometry(obj.userData?.type);
            }
        } else {
            console.warn('Object has no geometry, creating fallback:', obj.userData?.type);
            data.geometry = this.createFallbackGeometry(obj.userData?.type);
        }

        console.log('Final serialized data:', data);
        return data;
    }


// Создание запасной геометрии на основе типа
    createFallbackGeometry(type) {
        console.log('Creating fallback geometry for type:', type);

        let geometry;
        switch(type) {
            case 'cube':
                geometry = new THREE.BoxGeometry(25, 25, 25);
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(12.5, 32, 32);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(12.5, 12.5, 25, 32);
                break;
            case 'cone':
                geometry = new THREE.ConeGeometry(12.5, 25, 32);
                break;
            case 'torus':
                geometry = new THREE.TorusGeometry(25, 5, 16, 100);
                break;
            case 'boolean':
            case 'boolean_result':
                geometry = new THREE.BoxGeometry(25, 25, 25);
                break;
            default:
                geometry = new THREE.BoxGeometry(25, 25, 25);
        }

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return this.serializeGeometryForHistory(geometry);
    }

    // Упрощенная сериализация геометрии
    serializeGeometryForHistory(geometry) {
        if (!geometry) return null;

        try {
            // Для простых геометрий сохраняем параметры
            if (geometry.type === 'BoxGeometry' && geometry.parameters) {
                return {
                    type: 'BoxGeometry',
                    parameters: geometry.parameters
                };
            } else if (geometry.type === 'SphereGeometry' && geometry.parameters) {
                return {
                    type: 'SphereGeometry',
                    parameters: geometry.parameters
                };
            } else if (geometry.type === 'CylinderGeometry' && geometry.parameters) {
                return {
                    type: 'CylinderGeometry',
                    parameters: geometry.parameters
                };
            } else if (geometry.type === 'ConeGeometry' && geometry.parameters) {
                return {
                    type: 'ConeGeometry',
                    parameters: geometry.parameters
                };
            } else if (geometry.type === 'TorusGeometry' && geometry.parameters) {
                return {
                    type: 'TorusGeometry',
                    parameters: geometry.parameters
                };
            } else if (geometry.type === 'PlaneGeometry' && geometry.parameters) {
                return {
                    type: 'PlaneGeometry',
                    parameters: geometry.parameters
                };
            } else {
                // Для BufferGeometry сохраняем вершины
                const positions = geometry.attributes.position?.array;
                if (positions) {
                    return {
                        type: geometry.type,
                        positions: Array.from(positions)
                    };
                }
            }
        } catch (error) {
            console.error('Error in serializeGeometryForHistory:', error);
        }

        return null;
    }

    // Создание геометрии из userData
    createGeometryFromUserData(userData) {
        if (!userData || !userData.type) return null;

        let geometry;

        switch(userData.type) {
            case 'cube':
            case 'box':
                geometry = new THREE.BoxGeometry(
                    userData.width || 25,
                    userData.height || 25,
                    userData.depth || 25
                );
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(
                    userData.radius || 12.5,
                    userData.widthSegments || 32,
                    userData.heightSegments || 32
                );
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(
                    userData.radiusTop || 12.5,
                    userData.radiusBottom || 12.5,
                    userData.height || 25,
                    userData.radialSegments || 32
                );
                break;
            case 'cone':
                geometry = new THREE.ConeGeometry(
                    userData.radius || 12.5,
                    userData.height || 25,
                    userData.radialSegments || 32
                );
                break;
            case 'torus':
                geometry = new THREE.TorusGeometry(
                    userData.radius || 25,
                    userData.tube || 5,
                    userData.radialSegments || 16,
                    userData.tubularSegments || 100
                );
                break;
            default:
                geometry = new THREE.BoxGeometry(25, 25, 25);
        }

        return this.serializeGeometryForHistory(geometry);
    }


    deserializeObjectOptimized(data) {
        return this.deserializeObject(data);
    }
}