// drag-manager.js - обновленная версия
class DragManager {
    constructor(cadEditor) {
        this.editor = cadEditor;

        // Состояние перетаскивания
        this.isDragging = false;
        this.draggedObjects = [];
        this.dragStartPositions = [];
        this.dragStartMouse = null;
        this.dragPlane = null;
        this.dragIntersection = null;
        this.dragOffsets = [];

        // Параметры
        this.snapToGrid = true;
        this.gridSize = 5; // мм

        // Привязка событий (теперь события будут обрабатываться через инструмент)
        // this.bindEvents(); // Убираем авто-привязку событий
    }

    // Подготовка к перетаскиванию
    prepareDrag(object, intersectionPoint) {
        // Сохраняем объекты для потенциального перетаскивания
        if (this.editor.selectedObjects.includes(object)) {
            // Если объект уже выделен, перетаскиваем все выделенные объекты
            this.draggedObjects = [...this.editor.selectedObjects];
        } else {
            // Если объект не выделен, выделяем его и готовим к перетаскиванию
            this.draggedObjects = [object];
        }

        // Сохраняем начальные позиции
        this.dragStartPositions = this.draggedObjects.map(obj => obj.position.clone());

        // Вычисляем смещения для множественного перетаскивания
        if (this.draggedObjects.length > 1) {
            const mainObject = object;
            this.dragOffsets = this.draggedObjects.map(obj =>
                new THREE.Vector3(
                    obj.position.x - mainObject.position.x,
                    0,
                    obj.position.z - mainObject.position.z
                )
            );
        }

        // Создаем ГОРИЗОНТАЛЬНУЮ плоскость для перетаскивания (XZ плоскость)
        const normal = new THREE.Vector3(0, 1, 0);
        const constant = -intersectionPoint.y;

        this.dragPlane = new THREE.Plane(normal, constant);
        this.dragIntersection = intersectionPoint.clone();
    }

    // Начало перетаскивания
    startDrag(e) {
        this.isDragging = true;
        this.dragStartMouse = new THREE.Vector2(e.clientX, e.clientY);

        // Скрываем TransformControls если они активны
        if (this.editor.transformControls && this.draggedObjects.length > 0) {
            this.editor.transformControls.visible = false;
        }

        // Подсвечиваем перетаскиваемые объекты
    //    this.draggedObjects.forEach(obj => this.editor.objectsManager.highlightObject(obj));

        // Продолжаем обработку движения для немедленного отклика
        this.onMouseMove(e);
    }

    onMouseMove(e) {
        if (!this.isDragging || this.draggedObjects.length === 0) return;

        e.preventDefault();

        // Обновляем позицию мыши
        this.editor.updateMousePosition(e);

        // Получаем новую позицию на плоскости перетаскивания
        const newPosition = this.getDragPosition(e);

        if (newPosition) {
            // Применяем снэппинг к сетке (только к X и Z)
            let finalPosition = newPosition.clone();
            if (this.snapToGrid) {
                finalPosition.x = Math.round(newPosition.x / this.gridSize) * this.gridSize;
                finalPosition.z = Math.round(newPosition.z / this.gridSize) * this.gridSize;
            }

            // Перемещаем объект(ы) - ТОЛЬКО В ПЛОСКОСТИ XZ
            if (this.draggedObjects.length === 1) {
                // Одиночный объект - сохраняем исходную высоту (Y)
                const obj = this.draggedObjects[0];
                obj.position.x = finalPosition.x;
                obj.position.z = finalPosition.z;
                obj.position.y = this.dragStartPositions[0].y; // Фиксируем высоту
            } else {
                // Множественные объекты
                const mainObject = this.draggedObjects[0];

                // Перемещаем главный объект (сохраняя его высоту)
                mainObject.position.x = finalPosition.x;
                mainObject.position.z = finalPosition.z;
                mainObject.position.y = this.dragStartPositions[0].y;

                // Обновляем позиции остальных объектов
                for (let i = 1; i < this.draggedObjects.length; i++) {
                    const obj = this.draggedObjects[i];
                    obj.position.x = finalPosition.x + this.dragOffsets[i].x;
                    obj.position.z = finalPosition.z + this.dragOffsets[i].z;
                    obj.position.y = this.dragStartPositions[i].y;
                }
            }

            // Обновляем свойства в панели
            this.updatePropertiesPanel();

            // Меняем курсор
            document.body.style.cursor = 'grabbing';
        }
    }

    getDragPosition(event) {
        if (!this.dragPlane) return null;

        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.editor.camera);

        const intersection = new THREE.Vector3();

        if (raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
            return intersection;
        }

        return null;
    }

    updatePropertiesPanel() {
        if (this.draggedObjects.length === 1) {
            const obj = this.draggedObjects[0];
            document.getElementById('posX').value = obj.position.x.toFixed(1);
            document.getElementById('posY').value = obj.position.y.toFixed(1);
            document.getElementById('posZ').value = obj.position.z.toFixed(1);
        }
    }

    finishDrag() {
        if (this.draggedObjects.length === 0) return;

        // Показываем TransformControls если нужно
        if (this.editor.transformControls && this.editor.selectedObjects.length === 1) {
            const selectedObj = this.editor.selectedObjects[0];
            if (this.draggedObjects.includes(selectedObj)) {
                this.editor.transformControls.visible = true;
            }
        }

        // Проверяем, изменилась ли позиция
        let positionChanged = false;

        for (let i = 0; i < this.draggedObjects.length; i++) {
            if (!this.dragStartPositions[i].equals(this.draggedObjects[i].position)) {
                positionChanged = true;
                break;
            }
        }

        if (positionChanged) {
            // Добавляем в историю
            const positions = this.draggedObjects.map((obj, i) => ({
                uuid: obj.uuid,
                previousPosition: this.dragStartPositions[i].toArray(),
                position: obj.position.toArray()
            }));

            this.editor.history.addAction({
                type: 'modify_position_multiple',
                objects: positions
            });

            this.editor.showStatus(
                `Перемещено ${this.draggedObjects.length} объект(ов) по горизонтали`,
                'success'
            );
        }

        this.resetDrag();
    }

    cancelDrag() {
        if (this.draggedObjects.length > 0) {
            // Возвращаем объекты на исходные позиции
            for (let i = 0; i < this.draggedObjects.length; i++) {
                this.draggedObjects[i].position.copy(this.dragStartPositions[i]);
            }

            // Показываем TransformControls если нужно
            if (this.editor.transformControls && this.editor.selectedObjects.length === 1) {
                const selectedObj = this.editor.selectedObjects[0];
                if (this.draggedObjects.includes(selectedObj)) {
                    this.editor.transformControls.visible = true;
                }
            }

            // Обновляем свойства
            this.updatePropertiesPanel();

            this.editor.showStatus('Перетаскивание отменено', 'info');
        }

        this.resetDrag();
    }

    resetDrag() {
        this.isDragging = false;
        this.draggedObjects = [];
        this.dragStartPositions = [];
        this.dragOffsets = [];
        this.dragStartMouse = null;
        this.dragPlane = null;
        this.dragIntersection = null;
        document.body.style.cursor = 'default';
    }

    // Метод для перетаскивания по другой плоскости (например, грани объекта)
    startFaceDrag(object, faceNormal, intersectionPoint) {
        this.isDragging = true;
        this.draggedObjects = [object];
        this.dragStartPositions = [object.position.clone()];

        // Создаем плоскость, параллельную грани объекта
        const normal = faceNormal.clone();
        const constant = -intersectionPoint.dot(normal);

        this.dragPlane = new THREE.Plane(normal, constant);
        this.dragIntersection = intersectionPoint.clone();

        document.body.style.cursor = 'grabbing';
        this.editor.showStatus(`Перетаскивание по плоскости`, 'info');
    }

    toggleSnapToGrid() {
        this.snapToGrid = !this.snapToGrid;
        this.editor.showStatus(`Привязка к сетке: ${this.snapToGrid ? 'ВКЛ' : 'ВЫКЛ'}`, 'info');
        return this.snapToGrid;
    }

    setGridSize(size) {
        this.gridSize = Math.max(1, Math.min(100, size));
        this.editor.showStatus(`Размер сетки: ${this.gridSize} мм`, 'info');
    }
}