// drag-manager.js - исправленная версия
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
        this.mainObjectIndex = 0; // Индекс главного объекта (того, за который начали тащить)

        // Параметры
        this.snapToGrid = true;
        this.gridSize = 1; // мм
    }

    // Подготовка к перетаскиванию
    prepareDrag(object, intersectionPoint) {
        // Просто используем текущее выделение редактора
        this.draggedObjects = [...this.editor.selectedObjects];

        // Находим индекс главного объекта (того, за который начали тащить)
        this.mainObjectIndex = this.draggedObjects.indexOf(object);

        // Если объект не найден в выделенных (такое не должно происходить), добавляем его
        if (this.mainObjectIndex === -1) {
            this.draggedObjects.unshift(object);
            this.mainObjectIndex = 0;
        }

        // Перемещаем главный объект в начало массива для удобства
        if (this.mainObjectIndex > 0) {
            this.draggedObjects.splice(this.mainObjectIndex, 1);
            this.draggedObjects.unshift(object);
            this.mainObjectIndex = 0;
        }

        // Сохраняем начальные позиции
        this.dragStartPositions = this.draggedObjects.map(obj => obj.position.clone());

        // Вычисляем смещения для всех объектов ОТНОСИТЕЛЬНО ГЛАВНОГО ОБЪЕКТА
        if (this.draggedObjects.length > 1) {
            const mainObject = this.draggedObjects[0];
            this.dragOffsets = this.draggedObjects.map(obj =>
                new THREE.Vector3(
                    obj.position.x - mainObject.position.x,
                    0,
                    obj.position.z - mainObject.position.z
                )
            );
        } else {
            this.dragOffsets = [new THREE.Vector3(0, 0, 0)];
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


        this.editor.showStatus(
            `Перетаскивание: ${this.draggedObjects.length} объект(ов) (только по XZ)`,
            'info'
        );

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

            // ВАЖНО: перемещаем все объекты с сохранением ОТНОСИТЕЛЬНЫХ позиций
            if (this.draggedObjects.length === 1) {
                // Одиночный объект - сохраняем исходную высоту (Y)
                const obj = this.draggedObjects[0];
                obj.position.x = finalPosition.x;
                obj.position.z = finalPosition.z;
                obj.position.y = this.dragStartPositions[0].y; // Фиксируем высоту
            } else {
                // Множественные объекты - главный объект всегда первый в массиве
                const mainObject = this.draggedObjects[0];

                // Перемещаем главный объект (сохраняя его высоту)
                mainObject.position.x = finalPosition.x;
                mainObject.position.z = finalPosition.z;
                mainObject.position.y = this.dragStartPositions[0].y;

                // Обновляем позиции остальных объектов с сохранением их относительных позиций
                for (let i = 1; i < this.draggedObjects.length; i++) {
                    const obj = this.draggedObjects[i];
                    obj.position.x = finalPosition.x + this.dragOffsets[i].x;
                    obj.position.z = finalPosition.z + this.dragOffsets[i].z;
                    obj.position.y = this.dragStartPositions[i].y; // Фиксируем высоту каждого объекта
                }
            }

            // Обновляем свойства в панели
            this.updatePropertiesPanel();

            // Обновляем координаты в статус-баре
            this.updateCoordinates(finalPosition);

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

    updateCoordinates(position) {
        // Показываем текущие координаты (Y остается неизменным)
        const mainObj = this.draggedObjects[0];
        document.getElementById('coords').textContent =
            `X: ${position.x.toFixed(2)}, Y: ${mainObj.position.y.toFixed(2)}, Z: ${position.z.toFixed(2)}`;
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
        this.mainObjectIndex = 0;
        document.body.style.cursor = 'default';
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