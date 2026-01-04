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
        const cleaned = {};

        for (const key in userData) {
            // Пропускаем временные данные и Three.js объекты
            if (key === 'originalMaterial' ||
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
                (Array.isArray(value) && !value.some(item => item instanceof THREE.Vector3))) {

                cleaned[key] = value;
            } else if (value instanceof THREE.Vector3) {
                cleaned[key] = value.toArray();
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                // Рекурсивно очищаем вложенные объекты
                cleaned[key] = this.cleanUserData(value);
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

        // Оптимизация: для некоторых типов геометрии сохраняем только параметры
        if (geometry.type === 'BoxGeometry') {
            return {
                type: 'BoxGeometry',
                width: geometry.parameters.width || 25,
                height: geometry.parameters.height || 25,
                depth: geometry.parameters.depth || 25,
                widthSegments: geometry.parameters.widthSegments || 1,
                heightSegments: geometry.parameters.heightSegments || 1,
                depthSegments: geometry.parameters.depthSegments || 1
            };
        } else if (geometry.type === 'SphereGeometry') {
            return {
                type: 'SphereGeometry',
                radius: geometry.parameters.radius || 12.5,
                widthSegments: geometry.parameters.widthSegments || 32,
                heightSegments: geometry.parameters.heightSegments || 32
            };
        } else if (geometry.type === 'CylinderGeometry') {
            return {
                type: 'CylinderGeometry',
                radiusTop: geometry.parameters.radiusTop || 12.5,
                radiusBottom: geometry.parameters.radiusBottom || 12.5,
                height: geometry.parameters.height || 25,
                radialSegments: geometry.parameters.radialSegments || 32
            };
        } else if (geometry.type === 'ConeGeometry') {
            return {
                type: 'ConeGeometry',
                radius: geometry.parameters.radius || 12.5,
                height: geometry.parameters.height || 25,
                radialSegments: geometry.parameters.radialSegments || 32
            };
        } else if (geometry.type === 'TorusGeometry') {
            return {
                type: 'TorusGeometry',
                radius: geometry.parameters.radius || 25,
                tube: geometry.parameters.tube || 5,
                radialSegments: geometry.parameters.radialSegments || 16,
                tubularSegments: geometry.parameters.tubularSegments || 100
            };
        } else if (geometry.type === 'PlaneGeometry') {
            return {
                type: 'PlaneGeometry',
                width: geometry.parameters.width || 100,
                height: geometry.parameters.height || 100,
                widthSegments: geometry.parameters.widthSegments || 1,
                heightSegments: geometry.parameters.heightSegments || 1
            };
        } else {
            // Для сложных геометрий сохраняем все вершины
            const positions = geometry.attributes.position.array;
            const normals = geometry.attributes.normal ? geometry.attributes.normal.array : [];
            const indices = geometry.index ? Array.from(geometry.index.array) : [];

            return {
                type: geometry.type,
                positions: Array.from(positions),
                normals: normals.length > 0 ? Array.from(normals) : [],
                indices: indices,
                boundingBox: geometry.boundingBox ? {
                    min: geometry.boundingBox.min.toArray(),
                    max: geometry.boundingBox.max.toArray()
                } : null
            };
        }
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
        let geometry = null;
        let material = null;

        // Создаем материал
        if (data.material) {
            material = this.deserializeMaterial(data.material);
        } else {
            // Материал по умолчанию
            const colorHex = data.userData.currentColor || data.userData.color || 0xAAAAAA;
            const opacity = data.userData.currentOpacity || data.userData.opacity || 0.9;

            if (data.userData.type === 'sketch_plane') {
                material = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(colorHex),
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
            } else if (data.userData.type === 'work_plane') {
                material = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(colorHex),
                    transparent: true,
                    opacity: 0.2,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
            } else {
                material = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(colorHex),
                    transparent: opacity < 1.0,
                    opacity: opacity,
                    shininess: 30
                });
            }
        }

        // Создаем геометрию из сохраненных данных
        if (data.geometry) {
            geometry = this.deserializeGeometry(data.geometry);
        }

        if (!geometry || !material) {
            console.warn('Не удалось создать объект:', data.userData.type);
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

        // Восстанавливаем оригинальный цвет
        if (data.userData.currentColor && mesh.material.color) {
            mesh.material.color.set(new THREE.Color(data.userData.currentColor));
        }

        return mesh;
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
        if (!geomData) return null;

        // Восстанавливаем геометрию по типу
        switch (geomData.type) {
            case 'BoxGeometry':
                return new THREE.BoxGeometry(
                    geomData.width || 25,
                    geomData.height || 25,
                    geomData.depth || 25,
                    geomData.widthSegments || 1,
                    geomData.heightSegments || 1,
                    geomData.depthSegments || 1
                );

            case 'SphereGeometry':
                return new THREE.SphereGeometry(
                    geomData.radius || 12.5,
                    geomData.widthSegments || 32,
                    geomData.heightSegments || 32
                );

            case 'CylinderGeometry':
                return new THREE.CylinderGeometry(
                    geomData.radiusTop || 12.5,
                    geomData.radiusBottom || 12.5,
                    geomData.height || 25,
                    geomData.radialSegments || 32
                );

            case 'ConeGeometry':
                return new THREE.ConeGeometry(
                    geomData.radius || 12.5,
                    geomData.height || 25,
                    geomData.radialSegments || 32
                );

            case 'TorusGeometry':
                return new THREE.TorusGeometry(
                    geomData.radius || 25,
                    geomData.tube || 5,
                    geomData.radialSegments || 16,
                    geomData.tubularSegments || 100
                );

            case 'PlaneGeometry':
                return new THREE.PlaneGeometry(
                    geomData.width || 100,
                    geomData.height || 100,
                    geomData.widthSegments || 1,
                    geomData.heightSegments || 1
                );

            default:
                // Для сложных геометрий создаем из сохраненных данных
                return this.deserializeComplexGeometry(geomData);
        }
    }

    deserializeComplexGeometry(geomData) {
        if (!geomData.positions) return null;

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

        // Восстанавливаем индексы
        if (geomData.indices && geomData.indices.length > 0) {
            geometry.setIndex(geomData.indices);
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
        return this.serializeObject(obj);
    }

    deserializeObjectOptimized(data) {
        return this.deserializeObject(data);
    }
}