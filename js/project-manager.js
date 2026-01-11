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

    // СЕРИАЛИЗАЦИЯ ОБЪЕКТА
    serializeObject(object) {
        if (!object || !object.userData) return null;

        console.log('Serializing object:', {
            type: object.userData.type,
            elementType: object.userData.elementType,
            uuid: object.uuid,
            objectType: object.type
        });

        // Для групп используем особый подход
        if (object.userData.type === 'group' || object.isGroup) {
            return this.serializeGroup(object);
        }

        // Для элементов скетча (Line, LineLoop)
        if (object.type === 'Line' || object.type === 'LineLoop' ||
            object.userData.elementType || object.userData.type === 'sketch_element') {
            return this.serializeSketchElement(object);
        }

        // Для обычных объектов (Mesh, Group и т.д.)
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

        if (materialToSerialize) {
            objData.material = this.serializeMaterial(materialToSerialize);
        }

        // Сохраняем геометрию
        if (object.geometry) {
            objData.geometry = this.serializeGeometry(object.geometry);
            console.log('Geometry serialized:', objData.geometry?.type);

            // Для линий помечаем геометрию как линию (чтобы не вычислять нормали)
            if (object.type === 'Line' || object.type === 'LineLoop') {
                objData.geometry.isLine = true;
            }
        }

        // Сохраняем дополнительные свойства для различных типов объектов
        if (object.userData.type === 'sketch_plane' || object.userData.type === 'work_plane') {
            objData.userData.hasSketch = object.userData.hasSketch || false;
            objData.userData.sketchElementsCount = object.userData.sketchElementsCount || 0;

            // СОХРАНЯЕМ ОРИЕНТАЦИЮ ПЛОСКОСТИ С ПРОВЕРКОЙ ТИПА
            // Проверяем, является ли normal объектом Vector3 с методом toArray
            if (object.userData.normal) {
                if (object.userData.normal.toArray && typeof object.userData.normal.toArray === 'function') {
                    objData.userData.normal = object.userData.normal.toArray();
                } else if (Array.isArray(object.userData.normal)) {
                    // Если уже массив, сохраняем как есть
                    objData.userData.normal = object.userData.normal;
                } else {
                    objData.userData.normal = [0, 0, 1];
                }
            } else {
                objData.userData.normal = [0, 0, 1];
            }

            // Аналогично для up
            if (object.userData.up) {
                if (object.userData.up.toArray && typeof object.userData.up.toArray === 'function') {
                    objData.userData.up = object.userData.up.toArray();
                } else if (Array.isArray(object.userData.up)) {
                    objData.userData.up = object.userData.up;
                } else {
                    objData.userData.up = [0, 1, 0];
                }
            } else {
                objData.userData.up = [0, 1, 0];
            }

            // Аналогично для right
            if (object.userData.right) {
                if (object.userData.right.toArray && typeof object.userData.right.toArray === 'function') {
                    objData.userData.right = object.userData.right.toArray();
                } else if (Array.isArray(object.userData.right)) {
                    objData.userData.right = object.userData.right;
                } else {
                    objData.userData.right = [1, 0, 0];
                }
            } else {
                objData.userData.right = [1, 0, 0];
            }
        }

        // Для STL объектов
        if (object.userData.type === 'stl') {
            objData.userData.filename = object.userData.filename;
            objData.userData.originalGeometry = null; // Не сохраняем геометрию STL в userData
        }

        // Для булевых операций
        if (object.userData.type === 'boolean_result') {
            objData.userData.operation = object.userData.operation;
            objData.userData.sourceObjects = object.userData.sourceObjects || [];
        }

        return objData;
    }


    // метод сериализации группы:
    serializeGroup(group) {
        const groupData = {
            uuid: group.uuid,
            type: 'Group',
            userData: this.cleanUserData(group.userData),
            position: group.position.toArray(),
            rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
            scale: group.scale.toArray(),
            visible: group.visible,
            children: []
        };

        // Сериализуем дочерние объекты
        group.children.forEach(child => {
            if (child !== group) { // Избегаем бесконечной рекурсии
                const childData = this.serializeObject(child);
                if (childData) {
                    groupData.children.push(childData);
                }
            }
        });

        // Убедимся, что userData содержит правильный тип
        if (!groupData.userData.type) {
            groupData.userData.type = 'group';
        }

        return groupData;
    }

    // СЕРИАЛИЗАЦИЯ ЭЛЕМЕНТА СКЕТЧА
    serializeSketchElement(element) {
        if (!element) return null;

        const elementData = {
            uuid: element.uuid,
            type: element.type, // 'Line' или 'LineLoop'
            userData: this.cleanUserData(element.userData),
            position: element.position.toArray(),
            rotation: [element.rotation.x, element.rotation.y, element.rotation.z],
            scale: element.scale.toArray(),
            visible: element.visible !== undefined ? element.visible : true
        };

        // Сохраняем материал для линии
        if (element.material) {
            elementData.material = this.serializeMaterial(element.material);
        } else {
            // Материал по умолчанию для линий
            elementData.material = {
                type: 'LineBasicMaterial',
                color: 0x111111,
                linewidth: 2,
                transparent: false
            };
        }

        // Сохраняем геометрию линии
        if (element.geometry) {
            const geometryData = this.serializeGeometry(element.geometry);

            // Для линий помечаем геометрию как линию
            geometryData.isLine = true;

            // Сохраняем точки линии отдельно для удобства
            if (element.geometry.attributes && element.geometry.attributes.position) {
                const positions = element.geometry.attributes.position.array;
                geometryData.points = [];
                for (let i = 0; i < positions.length; i += 3) {
                    geometryData.points.push([
                        positions[i],
                        positions[i + 1],
                        positions[i + 2]
                    ]);
                }
            }

            elementData.geometry = geometryData;
        }

        // Локальные точки уже обрабатываются в cleanUserData, но на всякий случай
        if (element.userData.localPoints && !elementData.userData.localPoints) {
            elementData.userData.localPoints = element.userData.localPoints.map(p =>
                p.toArray ? p.toArray() : p
            );
        }

        // Сохраняем дополнительную информацию для текста
        if (element.userData.elementType === 'text') {
            elementData.userData.content = element.userData.content;
            elementData.userData.fontSize = element.userData.fontSize;

            // localPosition может быть Vector3 или массивом
            if (element.userData.localPosition) {
                if (element.userData.localPosition.toArray &&
                    typeof element.userData.localPosition.toArray === 'function') {
                    elementData.userData.localPosition = element.userData.localPosition.toArray();
                } else if (Array.isArray(element.userData.localPosition)) {
                    elementData.userData.localPosition = element.userData.localPosition;
                }
            }

            // Для текстовых контуров
            if (element.userData.contours) {
                elementData.userData.contours = element.userData.contours.map(contour =>
                    contour.map(p => {
                        if (p.toArray && typeof p.toArray === 'function') {
                            return p.toArray();
                        }
                        return p;
                    })
                );
            }
        }

        console.log('Sketch element serialized:', {
            type: elementData.type,
            elementType: elementData.userData.elementType,
            points: elementData.geometry?.points?.length
        });

        return elementData;
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

            // Обработка Vector3 - ПРОВЕРЯЕМ, ЧТО ЭТО Vector3 И ЕСТЬ МЕТОД toArray
            if (value && value.isVector3 && value.toArray && typeof value.toArray === 'function') {
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
                    // Проверяем каждый элемент массива на наличие Vector3
                    if (item && item.isVector3 && item.toArray && typeof item.toArray === 'function') {
                        return item.toArray();
                    }
                    if (item && item.isEuler) {
                        return [item.x, item.y, item.z];
                    }
                    if (item && item.isColor) {
                        return item.getHex();
                    }
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


// СЕРИАЛИЗАЦИЯ МАТЕРИАЛА (с поддержкой LineBasicMaterial)
    serializeMaterial(material) {
        if (!material) return null;

        try {
            const matData = {
                type: material.type,
                uuid: material.uuid || THREE.MathUtils.generateUUID(),
                color: 0x808080, // Значение по умолчанию
                opacity: material.opacity !== undefined ? material.opacity : 1.0,
                transparent: material.transparent || false
            };

            // Для LineBasicMaterial сохраняем специфичные свойства
            if (material.type === 'LineBasicMaterial') {
                matData.linewidth = material.linewidth || 1;
                if (material.linecap) matData.linecap = material.linecap;
                if (material.linejoin) matData.linejoin = material.linejoin;
            } else {
                // Для других материалов
                matData.side = material.side || THREE.FrontSide;
                matData.wireframe = material.wireframe || false;
            }

            // Безопасно получаем цвет материала
            if (material.color) {
                try {
                    if (material.color.getHex && typeof material.color.getHex === 'function') {
                        matData.color = material.color.getHex();
                    } else if (typeof material.color === 'number') {
                        matData.color = material.color;
                    }
                } catch (error) {
                    console.warn('Не удалось сериализовать цвет материала:', error);
                }
            }

            // Добавляем свойства только если они существуют
            if (material.shininess !== undefined) matData.shininess = material.shininess;
            if (material.specular && material.specular.getHex) {
                matData.specular = material.specular.getHex();
            }

            if (material.emissive && material.emissive.getHex) {
                matData.emissive = material.emissive.getHex();
            }

            if (material.metalness !== undefined) matData.metalness = material.metalness;
            if (material.roughness !== undefined) matData.roughness = material.roughness;

            return matData;
        } catch (error) {
            console.error('Error serializing material:', error);

            // Возвращаем простой материал по умолчанию
            if (material.type === 'LineBasicMaterial') {
                return {
                    type: 'LineBasicMaterial',
                    color: 0x111111,
                    linewidth: 2,
                    transparent: false
                };
            }

            return {
                type: 'MeshPhongMaterial',
                color: 0x808080,
                opacity: 1.0,
                transparent: false
            };
        }
    }

    // СЕРИАЛИЗАЦИЯ ГЕОМЕТРИИ (с поддержкой линий)
    serializeGeometry(geometry) {
        if (!geometry) return null;

        try {
            // Для BufferGeometry (STL, булевы операции, линии)
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

                // Для линий сохраняем точки отдельно для удобства
                if (geometry.userData && geometry.userData.isLine) {
                    const points = [];
                    for (let i = 0; i < positions.array.length; i += 3) {
                        points.push([
                            positions.array[i],
                            positions.array[i + 1],
                            positions.array[i + 2]
                        ]);
                    }
                    geomData.points = points;
                }

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

        // Собираем все плоскости скетчей
        const sketchPlanes = this.editor.objects.filter(obj =>
            obj.userData.type === 'sketch_plane' || obj.userData.type === 'work_plane'
        );

        console.log(`Serializing sketches from ${sketchPlanes.length} planes`);

        sketchPlanes.forEach(plane => {
            const sketchData = this.serializeSketch(plane);
            if (sketchData) {
                sketches.push(sketchData);
                console.log(`Sketch on plane ${plane.uuid}: ${sketchData.elements?.length || 0} elements`);
            }
        });

        return sketches;
    }


    // Улучшенная сериализация скетча
    serializeSketch(plane) {
        if (!plane || !plane.children) {
            console.log('Plane has no children or not found');
            return null;
        }

        const elements = [];

        // Собираем все элементы скетча
        plane.children.forEach(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                const elementData = this.serializeObject(child);
                if (elementData) {
                    elements.push(elementData);
                }
            }
        });

        if (elements.length === 0 && !plane.userData.hasSketch) {
            console.log('Plane has no sketch elements');
            return null;
        }

        return {
            planeId: plane.uuid,
            planeType: plane.userData.type,
            planeData: this.serializeObject(plane),
            elements: elements,
            id: plane.userData.sketchId || `sketch_${Date.now()}`,
            name: plane.userData.name || 'Чертеж',
            created: plane.userData.createdAt || new Date().toISOString()
        };
    }

    // ВОССТАНОВЛЕНИЕ ВСЕХ СКЕТЧЕЙ (для загрузки проекта)
    restoreAllSketches(sketchesData) {
        if (!sketchesData || !Array.isArray(sketchesData)) {
            console.log('No sketches to restore');
            return;
        }

        console.log(`Restoring ${sketchesData.length} sketches`);

        let restoredCount = 0;
        let elementCount = 0;

        sketchesData.forEach(sketchData => {
            const plane = this.restoreSketch(sketchData);
            if (plane) {
                restoredCount++;

                // Подсчитываем элементы
                const elements = plane.children.filter(child =>
                    child.userData && child.userData.type === 'sketch_element'
                );
                elementCount += elements.length;
            }
        });

        console.log(`Sketches restored: ${restoredCount} planes, ${elementCount} elements`);

        // Обновляем UI
        if (this.editor.objectsManager) {
            this.editor.objectsManager.updateSceneStats();
            this.editor.objectsManager.updateSceneList();
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
        if (!project || !project.scene) {
            alert('Неверный формат проекта');
            return;
        }

        // Очищаем текущую сцену
        this.newProject();

        let loadedCount = 0;
        let errorCount = 0;

        // Загружаем обычные объекты
        if (project.scene.objects && Array.isArray(project.scene.objects)) {
            project.scene.objects.forEach(objData => {
                try {
                    // Пропускаем элементы скетча - они загружаются отдельно
                    if (objData.userData?.type === 'sketch_element') {
                        return;
                    }

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

        // Загружаем скетчи ОТДЕЛЬНО
        if (project.scene.sketches && Array.isArray(project.scene.sketches)) {
            console.log('Loading sketches from project...');
            this.restoreAllSketches(project.scene.sketches);
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

        console.log('Deserializing object:', {
            type: data.type,
            elementType: data.userData.elementType,
            uuid: data.uuid
        });

        // Проверяем, является ли объект группой
        if (data.userData.type === 'group' || data.type === 'Group') {
            return this.deserializeGroup(data);
        }

        // Проверяем, является ли объект элементом скетча (Line или LineLoop)
        if (data.type === 'Line' || data.type === 'LineLoop' ||
            data.userData.elementType || data.userData.type === 'sketch_element') {
            return this.deserializeSketchElement(data);
        }

        // Для обычных объектов (Mesh)
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

        // ВОССТАНАВЛИВАЕМ Vector3 ДЛЯ ПЛОСКОСТЕЙ
        if (mesh.userData.normal && Array.isArray(mesh.userData.normal)) {
            mesh.userData.normal = new THREE.Vector3().fromArray(mesh.userData.normal);
        }
        if (mesh.userData.up && Array.isArray(mesh.userData.up)) {
            mesh.userData.up = new THREE.Vector3().fromArray(mesh.userData.up);
        }
        if (mesh.userData.right && Array.isArray(mesh.userData.right)) {
            mesh.userData.right = new THREE.Vector3().fromArray(mesh.userData.right);
        }

        // Восстанавливаем Vector3 в локальных точках элементов скетча
        if (mesh.userData.localPoints && Array.isArray(mesh.userData.localPoints)) {
            mesh.userData.localPoints = mesh.userData.localPoints.map(point => {
                if (Array.isArray(point)) {
                    return new THREE.Vector3().fromArray(point);
                }
                return point;
            });
        }

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

        console.log('Mesh deserialized with userData:', mesh.userData);
        return mesh;
    }

    // ДЕСЕРИАЛИЗАЦИЯ ЭЛЕМЕНТА СКЕТЧА
    // ДЕСЕРИАЛИЗАЦИЯ ЭЛЕМЕНТА СКЕТЧА
    deserializeSketchElement(data) {
        console.log('Deserializing sketch element:', data.type, data.userData?.elementType);

        // Создаем геометрию
        let geometry = null;
        if (data.geometry) {
            geometry = this.deserializeGeometry(data.geometry);
        } else if (data.userData.localPoints) {
            // Создаем геометрию из локальных точек
            const vertices = [];
            data.userData.localPoints.forEach(point => {
                const pointArray = Array.isArray(point) ? point : [point.x || 0, point.y || 0, point.z || 0];
                vertices.push(...pointArray);
            });

            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        }

        if (!geometry) {
            console.warn('No geometry for sketch element, creating default');
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
        }

        // Создаем материал
        let material;
        if (data.material) {
            material = this.deserializeMaterial(data.material);
        } else {
            // Материал по умолчанию для линий
            material = new THREE.LineBasicMaterial({
                color: data.userData.color || 0x111111,
                linewidth: data.userData.linewidth || 2
            });
        }

        // Создаем объект в зависимости от типа
        let sketchObject;
        if (data.type === 'LineLoop' || data.userData.isClosed) {
            sketchObject = new THREE.LineLoop(geometry, material);
        } else if (data.type === 'Line') {
            sketchObject = new THREE.Line(geometry, material);
        } else {
            // По умолчанию создаем Line
            sketchObject = new THREE.Line(geometry, material);
        }

        // Восстанавливаем свойства
        sketchObject.uuid = data.uuid || THREE.MathUtils.generateUUID();

        if (data.position) {
            sketchObject.position.fromArray(data.position);
        }

        if (data.rotation && data.rotation.length === 3) {
            sketchObject.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
        }

        if (data.scale) {
            sketchObject.scale.fromArray(data.scale);
        }

        if (data.visible !== undefined) {
            sketchObject.visible = data.visible;
        }

        // Восстанавливаем userData
        sketchObject.userData = { ...data.userData };

        // Восстанавливаем локальные точки если есть (преобразуем массивы обратно в Vector3)
        if (data.userData.localPoints) {
            sketchObject.userData.localPoints = data.userData.localPoints.map(arr =>
                Array.isArray(arr) ? new THREE.Vector3().fromArray(arr) : arr
            );
        }

        // Восстанавливаем оригинальный цвет если есть
        if (data.userData.originalColor) {
            sketchObject.userData.originalColor = new THREE.Color(data.userData.originalColor);
        }

        console.log('Sketch element deserialized:', {
            type: sketchObject.type,
            elementType: sketchObject.userData.elementType,
            points: sketchObject.geometry?.attributes?.position?.count
        });

        return sketchObject;
    }

    // ДЕСЕРИАЛИЗАЦИЯ ГЕОМЕТРИИ (с улучшенной поддержкой линий)
    deserializeGeometry(geomData) {
        if (!geomData) {
            console.warn('No geometry data provided');
            return this.createBoxGeometry();
        }

        console.log('Deserializing geometry:', geomData.type, geomData.isLine ? '(line)' : '');

        try {
            // BufferGeometry (STL, булевы операции, линии)
            if (geomData.type === 'BufferGeometry') {
                const geometry = new THREE.BufferGeometry();

                // Восстанавливаем вершины
                if (geomData.positions && geomData.positions.length > 0) {
                    const positionsArray = new Float32Array(geomData.positions);
                    geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3));
                } else if (geomData.points && geomData.points.length > 0) {
                    // Для линий: преобразуем points в positions
                    const vertices = [];
                    geomData.points.forEach(point => {
                        vertices.push(...point);
                    });
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                } else {
                    console.warn('No positions in geometry data');
                    return this.createBoxGeometry();
                }

                // Восстанавливаем нормали (только для не-линий)
                if (!geomData.isLine && geomData.normals && geomData.normals.length > 0) {
                    const normalsArray = new Float32Array(geomData.normals);
                    geometry.setAttribute('normal', new THREE.BufferAttribute(normalsArray, 3));
                } else if (!geomData.isLine) {
                    // Для мешей вычисляем нормали если их нет
                    geometry.computeVertexNormals();
                }
                // Для линий нормали не нужны

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

    // метод десериализации группы:
    deserializeGroup(groupData) {
        const group = new THREE.Group();
        group.uuid = groupData.uuid || THREE.MathUtils.generateUUID();

        // Восстанавливаем трансформации
        if (groupData.position) {
            group.position.fromArray(groupData.position);
        }

        if (groupData.scale) {
            group.scale.fromArray(groupData.scale);
        }

        if (groupData.rotation && groupData.rotation.length === 3) {
            group.rotation.set(groupData.rotation[0], groupData.rotation[1], groupData.rotation[2]);
        }

        // Восстанавливаем свойства
        if (groupData.visible !== undefined) group.visible = groupData.visible;

        // Восстанавливаем userData
        group.userData = { ...groupData.userData };

        // Убедимся, что тип группы установлен правильно
        if (!group.userData.type) {
            group.userData.type = 'group';
        }

        // Десериализуем дочерние объекты
        if (groupData.children && Array.isArray(groupData.children)) {
            groupData.children.forEach(childData => {
                const child = this.deserializeObject(childData);
                if (child) {
                    group.add(child);
                }
            });
        }

        return group;
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

    // ДЕСЕРИАЛИЗАЦИЯ МАТЕРИАЛА (с поддержкой LineBasicMaterial)
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
                case 'LineDashedMaterial':
                    material = new THREE.LineDashedMaterial();
                    break;
                default:
                    material = new THREE.MeshPhongMaterial();
            }

            // Восстанавливаем общие свойства
            if (matData.color !== undefined) material.color.setHex(matData.color);
            if (matData.opacity !== undefined) material.opacity = matData.opacity;
            if (matData.transparent !== undefined) material.transparent = matData.transparent;
            if (matData.side !== undefined) material.side = matData.side;
            if (matData.wireframe !== undefined) material.wireframe = matData.wireframe;

            // Специфичные свойства для LineBasicMaterial
            if (material instanceof THREE.LineBasicMaterial) {
                if (matData.linewidth !== undefined) material.linewidth = matData.linewidth;
                if (matData.linecap !== undefined) material.linecap = matData.linecap;
                if (matData.linejoin !== undefined) material.linejoin = matData.linejoin;
            }

            // Только для MeshPhongMaterial устанавливаем shininess и specular
            if (material instanceof THREE.MeshPhongMaterial) {
                if (matData.shininess !== undefined) material.shininess = matData.shininess;

                // Важно: проверяем, существует ли specular
                if (matData.specular !== undefined) {
                    if (material.specular && material.specular.setHex) {
                        material.specular.setHex(matData.specular);
                    } else {
                        // Если specular не поддерживается, создаем его
                        material.specular = new THREE.Color(matData.specular);
                    }
                }
            }

            // Для MeshStandardMaterial устанавливаем metalness и roughness
            if (material instanceof THREE.MeshStandardMaterial) {
                if (matData.metalness !== undefined) material.metalness = matData.metalness;
                if (matData.roughness !== undefined) material.roughness = matData.roughness;
            }

            // Для материалов, поддерживающих emissive
            if (matData.emissive !== undefined && material.emissive && material.emissive.setHex) {
                material.emissive.setHex(matData.emissive);
            }

            return material;
        } catch (error) {
            console.error('Error deserializing material:', error);

            // Возвращаем простой материал по умолчанию в зависимости от типа
            if (matData.type === 'LineBasicMaterial') {
                return new THREE.LineBasicMaterial({
                    color: 0x111111,
                    linewidth: 2
                });
            }

            return new THREE.MeshPhongMaterial({
                color: 0x808080,
                shininess: 30,
                specular: new THREE.Color(0x111111)
            });
        }
    }


    // ВОССТАНОВЛЕНИЕ СКЕТЧЕЙ
    restoreSketch(sketchData) {
    if (!sketchData) {
        console.warn('Invalid sketch data');
        return;
    }

    console.log('Restoring sketch:', sketchData);

    // 1. Восстанавливаем плоскость
    let plane = null;

    // Проверяем, переданы ли данные плоскости
    if (sketchData.planeData) {
        plane = this.deserializeObject(sketchData.planeData);
    } else if (sketchData.planeId) {
        // Ищем существующую плоскость
        plane = this.editor.findObjectByUuid(sketchData.planeId);
    }

    if (!plane) {
        console.warn('Failed to restore sketch plane');
        return;
    }

    // 2. Добавляем плоскость в сцену если ее еще нет
    if (!plane.parent) {
        this.editor.objectsGroup.add(plane);
        this.editor.objects.push(plane);

        if (plane.userData.type === 'sketch_plane') {
            this.editor.sketchPlanes.push(plane);
        } else if (plane.userData.type === 'work_plane') {
            this.editor.workPlanes.push(plane);
        }
    }

    // 3. Удаляем старые элементы с плоскости
    const oldElements = [];
    plane.children.forEach(child => {
        if (child.userData && child.userData.type === 'sketch_element') {
            oldElements.push(child);
        }
    });

    oldElements.forEach(element => {
        plane.remove(element);
        if (element.geometry) element.geometry.dispose();
        if (element.material) element.material.dispose();
    });

    // 4. Восстанавливаем элементы
    let restoredElements = 0;
    if (sketchData.elements && Array.isArray(sketchData.elements)) {
        sketchData.elements.forEach(elementData => {
            const element = this.restoreSketchElement(plane, elementData);
            if (element) restoredElements++;
        });
    }

    // 5. Обновляем информацию о скетче
    plane.userData.hasSketch = true;
    plane.userData.sketchElementsCount = restoredElements;
    plane.userData.sketchId = sketchData.id || `sketch_${Date.now()}`;
    plane.userData.name = sketchData.name || 'Чертеж';
    plane.userData.createdAt = sketchData.created || new Date().toISOString();

    console.log(`Sketch restored: ${restoredElements} elements`);
    return plane;
}

// ВОССТАНОВЛЕНИЕ ЭЛЕМЕНТА СКЕТЧА (переписанный метод)
    restoreSketchElement(plane, elementData) {
        if (!plane || !elementData) return null;

        console.log('Restoring sketch element:', elementData.userData?.elementType);

        // 1. Десериализуем элемент
        const element = this.deserializeObject(elementData);
        if (!element) {
            console.warn('Failed to deserialize sketch element');
            return null;
        }

        // 2. Проверяем, что это элемент скетча
        if (!element.userData || element.userData.type !== 'sketch_element') {
            console.warn('Object is not a sketch element:', element);
            if (element.geometry) element.geometry.dispose();
            if (element.material) element.material.dispose();
            return null;
        }

        // 3. Добавляем элемент на плоскость
        try {
            plane.add(element);

            // 4. Обновляем ссылки на плоскость в userData
            element.userData.sketchPlaneId = plane.uuid;

            // 5. Для текстовых элементов - создаем группу если нужно
            if (element.userData.elementType === 'text' && element.isGroup) {
                // Группа уже создана в deserializeObject
                console.log('Text element group restored');
            }

            return element;
        } catch (error) {
            console.error('Error adding sketch element to plane:', error);
            if (element.geometry) element.geometry.dispose();
            if (element.material) element.material.dispose();
            return null;
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