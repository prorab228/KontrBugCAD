// project-manager.js - полностью переработанный для сохранения вытянутых объектов и скетчей
class ProjectManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.currentProject = {
            name: 'Новый проект',
            description: '',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            objects: [],
            sketches: []
        };
    }

    // НОВЫЙ ПРОЕКТ
    newProject() {
        if (this.editor.objects.length > 0 &&
            !confirm('Создать новый проект? Несохраненные изменения будут потеряны.')) {
            return;
        }

        // Безопасно очищаем сцену
        this.safeClearScene();

        // Очищаем массивы
        this.editor.objects = [];
        this.editor.workPlanes = [];
        this.editor.sketchPlanes = [];
        this.editor.selectedObjects = [];

        if (this.editor.history) {
            this.editor.history.clear();
        }

        if (this.editor.transformControls) {
            this.editor.transformControls.detach();
        }

        // Сбрасываем текущий проект
        this.currentProject = {
            name: 'Новый проект',
            description: '',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            objects: [],
            sketches: []
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
        const objectsToRemove = [...this.editor.objects];

        objectsToRemove.forEach(obj => {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
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
    }

    safeDisposeObject(object) {
        if (!object) return;

        const disposeRecursive = (obj) => {
            try {
                if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                    obj.geometry.dispose();
                }

                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(material => {
                            if (material && typeof material.dispose === 'function') {
                                material.dispose();
                            }
                        });
                    } else if (typeof obj.material.dispose === 'function') {
                        obj.material.dispose();
                    }
                }

                // Обрабатываем дочерние объекты
                if (obj.children) {
                    for (let i = obj.children.length - 1; i >= 0; i--) {
                        disposeRecursive(obj.children[i]);
                    }
                }
            } catch (error) {
                console.warn('Ошибка при освобождении ресурсов объекта:', error);
            }
        };

        disposeRecursive(object);
    }

    // СОХРАНЕНИЕ ПРОЕКТА
    showSaveModal() {
        document.getElementById('saveModal').classList.add('active');
        this.loadSavedProjects();
    }

    saveProject() {
        const name = document.getElementById('projectNameInput').value || 'Без названия';
        const description = document.getElementById('projectDescription').value;

        // Обновляем информацию о проекте
        this.currentProject.name = name;
        this.currentProject.description = description;
        this.currentProject.modified = new Date().toISOString();
        this.currentProject.objects = this.serializeScene();
        this.currentProject.sketches = this.serializeSketches();

        try {
            // Сохраняем в localStorage
            this.saveToLocalStorage(this.currentProject);

            // Скачиваем файл
            this.downloadProjectFile(this.currentProject);

            document.getElementById('projectName').textContent = name;
            this.editor.showStatus(`Проект "${name}" сохранен и скачан`, 'success');

        } catch (error) {
            console.error('Ошибка сохранения:', error);

            if (error.name === 'QuotaExceededError') {
                this.downloadProjectFile(this.currentProject);
                this.editor.showStatus('Проект сохранен в файл (localStorage переполнен)', 'warning');
            } else {
                this.editor.showStatus('Ошибка сохранения: ' + error.message, 'error');
            }
        }
    }

    // СЕРИАЛИЗАЦИЯ СЦЕНЫ
    serializeScene() {
        const objects = [];

        this.editor.objects.forEach(obj => {
            try {
                const objData = this.serializeObject(obj);
                if (objData) {
                    objects.push(objData);
                }
            } catch (error) {
                console.warn('Ошибка сериализации объекта:', error, obj);
            }
        });

        return objects;
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
            name: object.userData.name || 'Объект'
        };

        // Сохраняем материал
        if (object.material) {
            objData.material = this.serializeMaterial(object.material);
        }

        // Сохраняем геометрию для сложных объектов
        if (object.geometry && this.shouldSerializeGeometry(object)) {
            objData.geometry = this.serializeGeometry(object.geometry);
        }

        // Специальные типы объектов
        switch (object.userData.type) {
            case 'extrude':
                objData.extrudeParams = {
                    height: object.userData.height || 10,
                    depth: object.userData.depth || 10,
                    segments: object.userData.segments || 1,
                    bevelEnabled: object.userData.bevelEnabled || false,
                    bevelThickness: object.userData.bevelThickness || 0.1,
                    bevelSize: object.userData.bevelSize || 0.1,
                    bevelSegments: object.userData.bevelSegments || 1,
                    sketchPlaneId: object.userData.sketchPlaneId,
                    sketchElements: object.userData.sketchElements || []
                };
                break;

            case 'sketch_plane':
            case 'work_plane':
                objData.sketchElements = this.serializeSketchElements(object);
                break;

            case 'boolean_result':
                objData.booleanOperation = object.userData.operation || 'union';
                objData.sourceObjects = object.userData.sourceObjects || [];
                break;

            case 'stl':
                objData.filename = object.userData.filename || 'model.stl';
                break;
        }

        return objData;
    }

    shouldSerializeGeometry(object) {
        const skipTypes = [
            'sketch_plane',
            'work_plane',
            'sketch_element',
            'base_plane'
        ];

        if (skipTypes.includes(object.userData.type)) {
            return false;
        }

        return true;
    }

    cleanUserData(userData) {
        const cleaned = {};

        for (const key in userData) {
            // Пропускаем временные данные и Three.js объекты
            if (key.startsWith('_') ||
                key === 'originalMaterial' ||
                key === 'isHighlighted' ||
                key === 'arrow' ||
                key === 'transformControls' ||
                key === 'originalContour' ||
                key === 'tempGeometry' ||
                typeof userData[key] === 'function' ||
                userData[key] instanceof THREE.Object3D) {
                continue;
            }

            const value = userData[key];

            // Сохраняем только простые типы данных
            if (value === null ||
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean' ||
                Array.isArray(value) ||
                (typeof value === 'object' && !(value instanceof THREE.Vector3))) {

                // Рекурсивно очищаем вложенные объекты
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    cleaned[key] = this.cleanUserData(value);
                } else {
                    cleaned[key] = value;
                }
            }
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

        const geomData = {
            type: geometry.type,
            positions: Array.from(geometry.attributes.position.array),
            normals: geometry.attributes.normal ?
                Array.from(geometry.attributes.normal.array) : [],
            uvs: geometry.attributes.uv ?
                Array.from(geometry.attributes.uv.array) : [],
            indices: geometry.index ?
                Array.from(geometry.index.array) : [],
            boundingBox: geometry.boundingBox ? {
                min: geometry.boundingBox.min.toArray(),
                max: geometry.boundingBox.max.toArray()
            } : null
        };

        return geomData;
    }

    // СЕРИАЛИЗАЦИЯ СКЕТЧЕЙ
    serializeSketches() {
        const sketches = [];

        // Собираем все плоскости скетчей
        const sketchPlanes = this.editor.objects.filter(obj =>
            obj.userData.type === 'sketch_plane' || obj.userData.type === 'work_plane'
        );

        sketchPlanes.forEach(plane => {
            const sketchData = {
                planeId: plane.uuid,
                planeType: plane.userData.type,
                position: plane.position.toArray(),
                rotation: [plane.rotation.x, plane.rotation.y, plane.rotation.z],
                scale: plane.scale.toArray(),
                elements: this.serializeSketchElements(plane),
                properties: {
                    gridVisible: plane.userData.gridVisible || true,
                    snapEnabled: plane.userData.snapEnabled || true,
                    snapGrid: plane.userData.snapGrid || 1
                }
            };

            sketches.push(sketchData);
        });

        return sketches;
    }

    serializeSketchElements(parentObject) {
        if (!parentObject || !parentObject.children) return [];

        const elements = [];

        parentObject.children.forEach(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                const elementData = {
                    elementType: child.userData.elementType,
                    id: child.userData.id || THREE.MathUtils.generateUUID(),
                    position: child.position.toArray(),
                    rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
                    scale: child.scale.toArray(),
                    visible: child.visible,
                    material: this.serializeMaterial(child.material)
                };

                // Сохраняем данные в зависимости от типа элемента
                switch (child.userData.elementType) {
                    case 'line':
                    case 'polyline':
                        if (child.geometry && child.geometry.attributes.position) {
                            elementData.points = this.extractPointsFromGeometry(child.geometry);
                            elementData.isClosed = child.userData.isClosed || false;
                        }
                        break;

                    case 'circle':
                        elementData.radius = child.userData.radius || 10;
                        elementData.segments = child.userData.segments || 32;
                        break;

                    case 'rectangle':
                        elementData.width = child.userData.width || 20;
                        elementData.height = child.userData.height || 20;
                        break;

                    case 'polygon':
                        elementData.radius = child.userData.radius || 10;
                        elementData.sides = child.userData.sides || 6;
                        break;

                    case 'text':
                        elementData.content = child.userData.content || 'Текст';
                        elementData.fontSize = child.userData.fontSize || 20;
                        break;
                }

                elements.push(elementData);
            }
        });

        return elements;
    }

    extractPointsFromGeometry(geometry) {
        const positions = geometry.attributes.position.array;
        const points = [];

        for (let i = 0; i < positions.length; i += 3) {
            points.push([
                positions[i],
                positions[i + 1],
                positions[i + 2]
            ]);
        }

        return points;
    }

    // СОХРАНЕНИЕ В LOCALSTORAGE
    saveToLocalStorage(project) {
        const projects = this.editor.storage.getProjects();

        // Проверяем, существует ли проект с таким именем
        const existingIndex = projects.findIndex(p => p.name === project.name);

        if (existingIndex > -1) {
            projects[existingIndex] = project;
        } else {
            projects.push(project);

            // Ограничиваем количество проектов
            if (projects.length > 10) {
                projects.shift();
            }
        }

        try {
            localStorage.setItem(this.editor.storage.storageKey, JSON.stringify(projects));
            localStorage.setItem(this.editor.storage.currentProjectKey, JSON.stringify(project));
        } catch (error) {
            throw error;
        }
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
        if (!project || !project.objects) {
            alert('Неверный формат проекта');
            return;
        }

        // Очищаем текущую сцену
        this.newProject();

        let loadedCount = 0;
        let errorCount = 0;

        // Загружаем объекты
        project.objects.forEach(objData => {
            try {
                const obj = this.deserializeObject(objData);
                if (obj) {
                    this.editor.objectsGroup.add(obj);
                    this.editor.objects.push(obj);

                    // Восстанавливаем типы плоскостей
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

        // Загружаем скетчи
        if (project.sketches && Array.isArray(project.sketches)) {
            project.sketches.forEach(sketchData => {
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
        document.getElementById('projectName').textContent = project.name;

        // Обновляем интерфейс
        if (this.editor.objectsManager) {
            this.editor.objectsManager.updateSceneStats();
            this.editor.objectsManager.updateSceneList();
        }

        this.editor.updateStatus();

        const message = `Проект "${project.name}" загружен (${loadedCount} объектов`;
        if (errorCount > 0) {
            this.editor.showStatus(`${message}, ошибок: ${errorCount})`, 'warning');
        } else {
            this.editor.showStatus(`${message})`, 'success');
        }
    }

    // ДЕСЕРИАЛИЗАЦИЯ ОБЪЕКТА
    deserializeObject(data) {
        let geometry, material;

        // Восстанавливаем материал
        if (data.material) {
            material = this.deserializeMaterial(data.material);
        }

        // Восстанавливаем геометрию в зависимости от типа
        switch (data.userData.type) {
            case 'extrude':
                if (data.geometry) {
                    geometry = this.deserializeGeometry(data.geometry);
                } else {
                    // Создаем геометрию выдавливания из параметров
                    geometry = this.createExtrudeGeometry(data);
                }
                break;

            case 'boolean_result':
            case 'stl':
                if (data.geometry) {
                    geometry = this.deserializeGeometry(data.geometry);
                }
                break;

            default:
                geometry = this.createGeometryForType(data.userData.type, data.userData);
        }

        // Если нет материала, создаем стандартный
        if (!material) {
            material = this.createMaterialForType(data.userData.type, data.userData);
        }

        // Если нет геометрии, используем куб по умолчанию
        if (!geometry) {
            geometry = new THREE.BoxGeometry(25, 25, 25);
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.uuid = data.uuid || THREE.MathUtils.generateUUID();
        mesh.userData = data.userData || {};

        // Восстанавливаем трансформации
        if (data.position) mesh.position.fromArray(data.position);
        if (data.rotation) {
            if (data.rotation.length === 3) {
                mesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
            } else if (data.rotation.length === 4) {
                // Quaternion
                mesh.quaternion.set(data.rotation[0], data.rotation[1], data.rotation[2], data.rotation[3]);
            }
        }
        if (data.scale) mesh.scale.fromArray(data.scale);
        if (data.visible !== undefined) mesh.visible = data.visible;
        if (data.name) mesh.userData.name = data.name;

        // Восстанавливаем параметры выдавливания
        if (data.userData.type === 'extrude' && data.extrudeParams) {
            mesh.userData.height = data.extrudeParams.height;
            mesh.userData.depth = data.extrudeParams.depth;
            mesh.userData.segments = data.extrudeParams.segments;
            mesh.userData.bevelEnabled = data.extrudeParams.bevelEnabled;
            mesh.userData.bevelThickness = data.extrudeParams.bevelThickness;
            mesh.userData.bevelSize = data.extrudeParams.bevelSize;
            mesh.userData.bevelSegments = data.extrudeParams.bevelSegments;
            mesh.userData.sketchPlaneId = data.extrudeParams.sketchPlaneId;
            mesh.userData.sketchElements = data.extrudeParams.sketchElements || [];
        }

        // Настраиваем тени для твердых тел
        if (data.userData.type !== 'sketch_plane' &&
            data.userData.type !== 'work_plane' &&
            data.userData.type !== 'sketch_element') {

            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }

        return mesh;
    }

    createExtrudeGeometry(data) {
        const extrudeParams = data.extrudeParams || {};
        const shape = this.createShapeFromSketchData(extrudeParams.sketchElements);

        if (!shape) {
            console.warn('Не удалось создать форму для выдавливания');
            return new THREE.BoxGeometry(10, 10, extrudeParams.height || 10);
        }

        const extrudeSettings = {
            depth: extrudeParams.depth || extrudeParams.height || 10,
            steps: extrudeParams.segments || 1,
            bevelEnabled: extrudeParams.bevelEnabled || false,
            bevelThickness: extrudeParams.bevelThickness || 0.1,
            bevelSize: extrudeParams.bevelSize || 0.1,
            bevelSegments: extrudeParams.bevelSegments || 1
        };

        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }

    createShapeFromSketchData(sketchElements) {
        if (!sketchElements || !Array.isArray(sketchElements) || sketchElements.length === 0) {
            return null;
        }

        // Для простоты создаем форму из первого замкнутого контура
        const closedContour = sketchElements.find(el =>
            el.elementType === 'polyline' && el.isClosed
        );

        if (!closedContour || !closedContour.points || closedContour.points.length < 3) {
            return null;
        }

        const shape = new THREE.Shape();
        const points = closedContour.points;

        // Начинаем с первой точки
        shape.moveTo(points[0][0], points[0][1]);

        // Добавляем остальные точки
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i][0], points[i][1]);
        }

        // Замыкаем контур
        shape.closePath();

        return shape;
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
            case 'MeshLambertMaterial':
                material = new THREE.MeshLambertMaterial();
                break;
            case 'MeshStandardMaterial':
                material = new THREE.MeshStandardMaterial();
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
        if (matData.shininess !== undefined) material.shininess = matData.shininess;

        return material;
    }

    deserializeGeometry(geomData) {
        if (!geomData || !geomData.positions) return null;

        const geometry = new THREE.BufferGeometry();

        // Восстанавливаем вершины
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(geomData.positions, 3));

        // Восстанавливаем нормали
        if (geomData.normals && geomData.normals.length > 0) {
            geometry.setAttribute('normal',
                new THREE.Float32BufferAttribute(geomData.normals, 3));
        } else {
            geometry.computeVertexNormals();
        }

        // Восстанавливаем UV
        if (geomData.uvs && geomData.uvs.length > 0) {
            geometry.setAttribute('uv',
                new THREE.Float32BufferAttribute(geomData.uvs, 2));
        }

        // Восстанавливаем индексы
        if (geomData.indices && geomData.indices.length > 0) {
            geometry.setIndex(new THREE.BufferAttribute(
                new Uint32Array(geomData.indices), 1));
        }

        // Восстанавливаем bounding box
        if (geomData.boundingBox) {
            geometry.boundingBox = new THREE.Box3(
                new THREE.Vector3().fromArray(geomData.boundingBox.min),
                new THREE.Vector3().fromArray(geomData.boundingBox.max)
            );
        }

        return geometry;
    }

    createGeometryForType(type, userData) {
        switch (type) {
            case 'cube':
                const size = userData.originalSize || 25;
                return new THREE.BoxGeometry(size, size, size);

            case 'sphere':
                return new THREE.SphereGeometry(12.5, 32, 32);

            case 'cylinder':
                return new THREE.CylinderGeometry(12.5, 12.5, 25, 32);

            case 'cone':
                return new THREE.ConeGeometry(12.5, 25, 32);

            case 'torus':
                return new THREE.TorusGeometry(25, 5, 16, 100);

            case 'sketch_plane':
            case 'work_plane':
                return new THREE.PlaneGeometry(100, 100);

            default:
                return new THREE.BoxGeometry(25, 25, 25);
        }
    }

    createMaterialForType(type, userData) {
        const colorHex = userData.currentColor || userData.color || 0xAAAAAA;
        const opacity = userData.currentOpacity || userData.opacity || 0.9;

        switch (type) {
            case 'sketch_plane':
                return new THREE.MeshBasicMaterial({
                    color: new THREE.Color(colorHex),
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });

            case 'work_plane':
                return new THREE.MeshBasicMaterial({
                    color: new THREE.Color(colorHex),
                    transparent: true,
                    opacity: 0.2,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });

            case 'sketch_element':
                return new THREE.LineBasicMaterial({
                    color: new THREE.Color(colorHex),
                    linewidth: 2
                });

            default:
                return new THREE.MeshPhongMaterial({
                    color: new THREE.Color(colorHex),
                    transparent: opacity < 1.0,
                    opacity: opacity,
                    shininess: 30
                });
        }
    }

    // ВОССТАНОВЛЕНИЕ СКЕТЧЕЙ
    restoreSketch(sketchData) {
        // Находим плоскость
        const plane = this.findObjectByUuid(sketchData.planeId);
        if (!plane) {
            console.warn('Плоскость скетча не найдена:', sketchData.planeId);
            return;
        }

        // Восстанавливаем элементы скетча
        if (sketchData.elements && Array.isArray(sketchData.elements)) {
            sketchData.elements.forEach(elementData => {
                this.restoreSketchElement(plane, elementData);
            });
        }

        // Восстанавливаем свойства скетча
        if (sketchData.properties) {
            plane.userData.gridVisible = sketchData.properties.gridVisible;
            plane.userData.snapEnabled = sketchData.properties.snapEnabled;
            plane.userData.snapGrid = sketchData.properties.snapGrid;
        }
    }

    restoreSketchElement(plane, elementData) {
        let geometry, material;

        // Восстанавливаем материал
        if (elementData.material) {
            material = this.deserializeMaterial(elementData.material);
        } else {
            material = new THREE.LineBasicMaterial({
                color: 0x2196F3,
                linewidth: 2
            });
        }

        // Создаем геометрию в зависимости от типа элемента
        switch (elementData.elementType) {
            case 'line':
            case 'polyline':
                if (elementData.points && elementData.points.length >= 2) {
                    const vectors = elementData.points.map(p =>
                        new THREE.Vector3(p[0], p[1], p[2] || 0)
                    );
                    geometry = new THREE.BufferGeometry().setFromPoints(vectors);
                }
                break;

            case 'circle':
                if (elementData.radius) {
                    geometry = new THREE.CircleGeometry(
                        elementData.radius,
                        elementData.segments || 32
                    );
                }
                break;

            case 'rectangle':
                if (elementData.width && elementData.height) {
                    const shape = new THREE.Shape();
                    shape.moveTo(-elementData.width / 2, -elementData.height / 2);
                    shape.lineTo(elementData.width / 2, -elementData.height / 2);
                    shape.lineTo(elementData.width / 2, elementData.height / 2);
                    shape.lineTo(-elementData.width / 2, elementData.height / 2);
                    shape.lineTo(-elementData.width / 2, -elementData.height / 2);
                    geometry = new THREE.ShapeGeometry(shape);
                }
                break;

            case 'polygon':
                if (elementData.radius && elementData.sides) {
                    geometry = new THREE.CircleGeometry(
                        elementData.radius,
                        elementData.sides
                    );
                }
                break;

            case 'text':
                // Для текста создаем спрайт
                this.createTextElement(plane, elementData);
                return;
        }

        if (!geometry) {
            console.warn('Не удалось создать геометрию для элемента:', elementData);
            return;
        }

        let mesh;
        if (elementData.elementType === 'circle' || elementData.elementType === 'rectangle' || elementData.elementType === 'polygon') {
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

        // Сохраняем данные элемента
        mesh.userData = {
            type: 'sketch_element',
            elementType: elementData.elementType,
            id: elementData.id,
            isClosed: elementData.isClosed || false,
            sketchPlaneId: plane.uuid
        };

        // Сохраняем параметры в зависимости от типа
        switch (elementData.elementType) {
            case 'circle':
                mesh.userData.radius = elementData.radius;
                mesh.userData.segments = elementData.segments;
                break;
            case 'rectangle':
                mesh.userData.width = elementData.width;
                mesh.userData.height = elementData.height;
                break;
            case 'polygon':
                mesh.userData.radius = elementData.radius;
                mesh.userData.sides = elementData.sides;
                break;
        }

        plane.add(mesh);
    }

    createTextElement(plane, elementData) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = `bold ${elementData.fontSize || 20}px Arial`;
        context.fillStyle = '#AAAAAA';
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillText(elementData.content || 'Текст', 10, 10);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });

        const sprite = new THREE.Sprite(material);
        if (elementData.position) sprite.position.fromArray(elementData.position);
        sprite.scale.set(50, 12.5, 1);

        sprite.userData = {
            type: 'sketch_element',
            elementType: 'text',
            id: elementData.id,
            content: elementData.content,
            fontSize: elementData.fontSize,
            sketchPlaneId: plane.uuid
        };

        plane.add(sprite);
    }

    // ПОИСК ОБЪЕКТА ПО UUID
    findObjectByUuid(uuid) {
        return this.editor.objects.find(obj => obj.uuid === uuid) || null;
    }

    // ЗАГРУЗКА СОХРАНЕННЫХ ПРОЕКТОВ
    loadSavedProjects() {
        const projects = this.editor.storage.getProjects();
        const container = document.getElementById('savedProjects');
        if (!container) return;

        container.innerHTML = '';

        if (projects.length === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center;">Нет сохраненных проектов</p>';
            return;
        }

        projects.sort((a, b) => {
            const dateA = a.modified ? new Date(a.modified) : new Date(0);
            const dateB = b.modified ? new Date(b.modified) : new Date(0);
            return dateB - dateA;
        });

        projects.forEach(project => {
            const div = document.createElement('div');
            div.className = 'project-item';

            const date = project.modified ?
                new Date(project.modified).toLocaleDateString() :
                'Неизвестно';

            const objectCount = project.objects?.length || 0;

            div.innerHTML = `
                <div>
                    <strong>${project.name}</strong><br>
                    <small>${date} • ${objectCount} объектов</small>
                </div>
                <button class="load-project-btn" data-name="${project.name}">
                    <i class="fas fa-folder-open"></i>
                </button>
            `;

            container.appendChild(div);

            div.querySelector('.load-project-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadProject(project);
                document.getElementById('saveModal').classList.remove('active');
            });
        });
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
                // Удаляем временные данные и пользовательские свойства
                clone.userData = {};
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
                version: '2.0',
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

    // ДЕЛЕГИРОВАННЫЕ МЕТОДЫ
    serializeObjectForHistory(obj) {
        return this.serializeObject(obj);
    }

    deserializeObjectOptimized(data) {
        return this.deserializeObject(data);
    }
}