// js/boolean-operations.js - Реализация на three-bvh-csg
class BooleanOperations {
    constructor(cadEditor) {
        this.editor = cadEditor;
        // Проверяем наличие библиотеки
        if (typeof THREE === 'undefined' || typeof THREE_BVH_CSG === 'undefined') {
            console.error('three-bvh-csg не загружена');
            this.showError('Библиотека three-bvh-csg не загружена');
            return;
        }
        // Сокращаем путь к константам операций
        this.OPS = THREE_BVH_CSG; // ADDITION, SUBTRACTION, INTERSECTION и т.д.
        this.evaluator = new THREE_BVH_CSG.Evaluator();
        console.log('BooleanOperations (three-bvh-csg) инициализирован');
    }

    /**
     * Проверяет и подготавливает объект для CSG операции.
     * three-bvh-csg требует, чтобы геометрия была "two-manifold" (водонепроницаемой)[citation:1].
     */
    prepareObjectForCSG(object3D) {
        if (!object3D || !object3D.geometry) {
            console.error('Объект не содержит geometry');
            return null;
        }

        // 1. Клонируем объект и его геометрию, чтобы не нарушить исходные
        const clonedMesh = object3D.clone();

        // 2. Глубоко клонируем геометрию, чтобы точно получить отдельный экземпляр
        const originalGeo = clonedMesh.geometry;
        const repairedGeometry = this.repairGeometry(originalGeo); // <-- Используем ремонт

         // 3. СБРАСЫВАЕМ ТРАНСФОРМАЦИИ КЛОНА перед вычислением мировой матрицы
        clonedMesh.position.set(0, 0, 0);
        clonedMesh.rotation.set(0, 0, 0);
        clonedMesh.scale.set(1, 1, 1);
        clonedMesh.updateMatrixWorld(true); // Матрица теперь единичная

        // 4. Применяем ИСХОДНУЮ мировую матрицу объекта к геометрии
        object3D.updateMatrixWorld(true);
        repairedGeometry.applyMatrix4(object3D.matrixWorld);

        // 5. Создаём Brush. Его трансформации оставляем нулевыми.
        const brush = new THREE_BVH_CSG.Brush(repairedGeometry, clonedMesh.material);
        // Не копируем позицию/вращение! Геометрия уже на месте.
        brush.updateMatrixWorld();

        return brush;
    }

    /**
     * Основной метод выполнения булевой операции[citation:1]
     */
    performOperation(objects, operation) {
        if (!objects || objects.length < 2) {
            this.showError('Для операции нужно минимум 2 объекта');
            return null;
        }

        // Подготавливаем объекты (преобразуем в Brush)
        const brushes = objects.map(obj => this.prepareObjectForCSG(obj)).filter(b => b);

        if (brushes.length < 2) {
            this.showError('Не удалось подготовить объекты для операции');
            return null;
        }

        try {
            // Выполняем операцию. Первый объект (A) изменяется вторым (B)
            let resultBrush = brushes[0];
            for (let i = 1; i < brushes.length; i++) {
                resultBrush = this.evaluator.evaluate(resultBrush, brushes[i], operation);
            }

            // Конвертируем Brush обратно в стандартный THREE.Mesh для сцены
            const resultMesh = new THREE.Mesh(resultBrush.geometry, resultBrush.material);
            resultMesh.position.copy(resultBrush.position);
            resultMesh.rotation.copy(resultBrush.rotation);
            resultMesh.scale.copy(resultBrush.scale);

            // Настраиваем свойства материала (не используйте THREE.DoubleSide, это может вызвать артефакты[citation:9])
            resultMesh.material.side = THREE.FrontSide;
            resultMesh.material.transparent = false; // Прозрачность также может вызывать проблемы[citation:9]

            // Настройка теней и пользовательских данных
            resultMesh.castShadow = true;
            resultMesh.receiveShadow = true;
            resultMesh.userData = {
                id: 'csg_' + Date.now(),
                name: this.getOperationName(operation),
                type: 'boolean',
                operation: operation,
                sourceObjects: objects.map(obj => obj.uuid),
                createdAt: new Date().toISOString()
            };

            return resultMesh;

        } catch (error) {
            console.error(`Ошибка операции ${operation}:`, error);
            this.showError(`Ошибка ${this.getOperationName(operation)}: ${error.message}`);
            return null;
        }
    }

    // Публичные методы для операций (оставьте без изменений, они уже вызывают performOperation)
    unionMultiple(objects) { return this.performOperation(objects, this.OPS.ADDITION); }
    subtract(object1, object2) { return this.performOperation([object1, object2], this.OPS.SUBTRACTION); }
    intersect(object1, object2) { return this.performOperation([object1, object2], this.OPS.INTERSECTION); }

    // Метод canPerformOperation (можно оставить как есть, но учтите требования библиотеки[citation:1])
    canPerformOperation(objects) {
        if (!objects || objects.length < 2) {
            return { can: false, reason: 'Нужно минимум 2 объекта' };
        }

        // Проверяем наличие ключевых атрибутов
//        const invalidObjects = [];
//        for (const obj of objects) {
//            if (!obj.geometry || !obj.geometry.attributes) {
//                invalidObjects.push(obj.userData?.name || obj.uuid);
//                continue;
//            }
//            const attrs = obj.geometry.attributes;
//            if (!attrs.position || !attrs.normal || !attrs.uv) {
//                invalidObjects.push(obj.userData?.name || obj.uuid);
//            }
//        }
//
//        if (invalidObjects.length > 0) {
//            return {
//                can: false,
//                reason: `Объекты [${invalidObjects.join(', ')}] не готовы для CSG. Требуются атрибуты position, normal и uv.`
//            };
//        }

        return { can: true, reason: '' };
    }

    /**
 * Ремонтирует геометрию, гарантируя наличие position, normal и uv.
 * @param {THREE.BufferGeometry} geometry - Исходная геометрия.
 * @returns {THREE.BufferGeometry} - Отремонтированная геометрия.
 */
    repairGeometry(geometry) {
        // Клонируем геометрию, чтобы не менять исходную в сцене
        const repairedGeo = geometry.clone();

        // 1. Проверяем и добавляем атрибут NORMAL (если его нет или он пустой)
        if (!repairedGeo.attributes.normal || repairedGeo.attributes.normal.count === 0) {
            repairedGeo.computeVertexNormals();
            console.log('Ремонт: атрибут normal вычислен.');
        }

        // 2. Проверяем и добавляем атрибут UV (самая частая проблема)
        if (!repairedGeo.attributes.uv || repairedGeo.attributes.uv.count === 0) {
            const vertexCount = repairedGeo.attributes.position.count;
            const uvs = new Float32Array(vertexCount * 2); // По 2 координаты (u, v) на вершину

            // Заполняем массив простейшими координатами (0,0).
            // Для сложных объектов это вызовет проблемы с текстурами,
            // но для булевых операций — достаточно.
            for (let i = 0; i < vertexCount; i++) {
                // Можно задать простую развёртку, например, через сферические координаты
                const x = repairedGeo.attributes.position.getX(i);
                const y = repairedGeo.attributes.position.getY(i);
                const z = repairedGeo.attributes.position.getZ(i);
                // Простейший вариант: нормализованные координаты
                uvs[i * 2] = (x + 1) * 0.5;     // U
                uvs[i * 2 + 1] = (y + 1) * 0.5; // V
            }

            repairedGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            console.log('Ремонт: атрибут uv создан.');
        }

        // 3. Проверяем и добавляем атрибут POSITION (крайний случай)
        if (!repairedGeo.attributes.position || repairedGeo.attributes.position.count === 0) {
            throw new Error('Геометрия не содержит атрибута position. Ремонт невозможен.');
        }

        // 4. Убедимся, что индексы в порядке (опционально, но полезно)
        if (!repairedGeo.index) {
            console.warn('Ремонт: у геометрии нет индексов. Возможны проблемы.');
        }

        return repairedGeo;
    }

    // Вспомогательные методы (getOperationStats, getOperationName, showError, showWarning) остаются без изменений


    /**
     * Получение статистики операции
     */
    getOperationStats(mesh) {
        if (!mesh || !mesh.geometry) return null;

        const geometry = mesh.geometry;
        let vertices = 0;
        let faces = 0;

        if (geometry.attributes.position) {
            vertices = geometry.attributes.position.count;
        }

        if (geometry.index) {
            faces = geometry.index.count / 3;
        } else if (geometry.attributes.position) {
            faces = geometry.attributes.position.count / 3;
        }

        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const size = bbox ? new THREE.Vector3().subVectors(bbox.max, bbox.min) : new THREE.Vector3();
        const volume = size.x * size.y * size.z;

        return {
            vertices: vertices,
            faces: faces,
            volume: volume,
            volumeMM3: volume,
            bbox: bbox,
            size: size
        };
    }

    /**
     * Вспомогательные методы
     */
    getOperationName(operation) {
        const names = {
            'union': 'Объединение',
            'subtract': 'Вычитание',
            'intersect': 'Пересечение'
        };
        return names[operation] || operation;
    }

    showError(message) {
        if (this.editor && this.editor.showStatus) {
            this.editor.showStatus(message, 'error');
        } else {
            console.error('BooleanOperations Error:', message);
        }
    }

    showWarning(message) {
        if (this.editor && this.editor.showStatus) {
            this.editor.showStatus(message, 'warning');
        } else {
            console.warn('BooleanOperations Warning:', message);
        }
    }
}