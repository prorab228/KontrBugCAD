// drag-manager.js
class DragManager {
    constructor(cadEditor) {
        this.editor = cadEditor;

        // Состояние перетаскивания
        this.isDragging = false;
        this.draggedObjects = [];
        this.dragStartPosition = null;
        this.dragStartMouse = null;
        this.dragPlane = null;
        this.dragIntersection = null;
        this.dragOffsets = [];

        // Параметры
        this.snapToGrid = true;
        this.gridSize = 5; // мм

        // Для отслеживания клика (чтобы отличать от перетаскивания)
        this.isClick = true;
        this.clickThreshold = 5; // пикселей
        this.clickStartTime = 0;

        // Привязка событий
        this.bindEvents();
    }

    bindEvents() {
        const canvas = this.editor.renderer.domElement;

        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('mouseleave', () => this.onMouseLeave());

        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Проверяем, можно ли перетаскивать объект
    canDragObject(object) {
        if (!object) return false;

        // Нельзя перетаскивать рабочие плоскости и плоскости скетча
        if (object.userData.type === 'work_plane' ||
            object.userData.type === 'sketch_plane' ||
            object.userData.type === 'base_plane') {
            return false;
        }

        return true;
    }

    onMouseDown(e) {
        // Только левая кнопка мыши
        if (e.button !== 0) return;



        // Если другой режим активен (скетч, вытягивание и т.д.)
        if (this.editor.sketchMode === 'drawing' ||
            this.editor.extrudeMode ||
            this.editor.workPlaneMode ||
            (this.editor.transformControls && this.editor.transformControls.isDragging)) {
            return;
        }

        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Ищем пересечения с объектами
        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        // Начинаем отслеживание клика
        this.isClick = true;
        this.clickStartTime = Date.now();
        this.dragStartMouse = new THREE.Vector2(e.clientX, e.clientY);

        // Если кликнули по объекту
        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);

            // Проверяем, можно ли перетаскивать этот объект
            if (this.canDragObject(object)) {
                e.preventDefault();

                // Сохраняем информацию о потенциальном перетаскивании
                this.prepareDrag(object, intersects[0].point);
            }
        }
    }

    prepareDrag(object, intersectionPoint) {
        // Сохраняем объекты для потенциального перетаскивания
        if (this.editor.selectedObjects.includes(object)) {
            // Если объект уже выделен, перетаскиваем все выделенные объекты
            this.draggedObjects = [...this.editor.selectedObjects];
        }
//        else {
//            // Если объект не выделен, выделяем его и готовим к перетаскиванию
//            if (!e.ctrlKey && !e.metaKey) {
//                this.editor.selectSingleObject(object);
//            }
//            this.draggedObjects = [object];
//        }

        // Сохраняем начальные позиции
        this.dragStartPositions = this.draggedObjects.map(obj => obj.position.clone());

        // Вычисляем смещения для множественного перетаскивания
        if (this.draggedObjects.length > 1) {
            const mainObject = object;
            this.dragOffsets = this.draggedObjects.map(obj =>
                obj.position.clone().sub(mainObject.position)
            );
        }

        // Создаем плоскость для перетаскивания
        const normal = new THREE.Vector3(0, 1, 0);
        const constant = -intersectionPoint.y;

        this.dragPlane = new THREE.Plane(normal, constant);
        this.dragIntersection = intersectionPoint.clone();
    }

    onMouseMove(e) {
        // Если еще не решено, клик это или перетаскивание
        if (this.isClick && this.draggedObjects.length > 0) {
            // Проверяем, насколько мышь переместилась
            const deltaX = Math.abs(e.clientX - this.dragStartMouse.x);
            const deltaY = Math.abs(e.clientY - this.dragStartMouse.y);
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Если перемещение превысило порог, начинаем перетаскивание
            if (distance > this.clickThreshold) {
                this.startDrag(e);
            }
            return;
        }

        // Если уже перетаскиваем
        if (this.isDragging && this.draggedObjects.length > 0) {
            e.preventDefault();

            // Обновляем позицию мыши
            this.editor.updateMousePosition(e);

            // Получаем новую позицию на плоскости перетаскивания
            const newPosition = this.getDragPosition(e);

            if (newPosition) {
                // Применяем снэппинг к сетке
                let finalPosition = newPosition;
                if (this.snapToGrid) {
                    finalPosition = this.snapToGridPosition(newPosition);
                }

                // Перемещаем объект(ы)
                if (this.draggedObjects.length === 1) {
                    // Одиночный объект
                    this.draggedObjects[0].position.copy(finalPosition);
                } else {
                    // Множественные объекты
                    const mainObject = this.draggedObjects[0];
                    mainObject.position.copy(finalPosition);

                    // Обновляем позиции остальных объектов
                    for (let i = 1; i < this.draggedObjects.length; i++) {
                        this.draggedObjects[i].position.copy(
                            finalPosition.clone().add(this.dragOffsets[i])
                        );
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
    }

    startDrag(e) {
        this.isClick = false;
        this.isDragging = true;

        // Скрываем TransformControls если они активны
        if (this.editor.transformControls && this.draggedObjects.length > 0) {
            this.editor.transformControls.visible = false;
        }

        // Подсвечиваем перетаскиваемые объекты
        this.draggedObjects.forEach(obj => this.editor.objectsManager.highlightObject(obj));

        this.editor.showStatus(
            `Перетаскивание: ${this.draggedObjects.length} объект(ов)`,
            'info'
        );

        // Продолжаем обработку движения для немедленного отклика
        this.onMouseMove(e);
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

    snapToGridPosition(position) {
        return new THREE.Vector3(
            Math.round(position.x / this.gridSize) * this.gridSize,
            Math.round(position.y / this.gridSize) * this.gridSize,
            Math.round(position.z / this.gridSize) * this.gridSize
        );
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
        document.getElementById('coords').textContent =
            `X: ${position.x.toFixed(2)}, Y: ${position.y.toFixed(2)}, Z: ${position.z.toFixed(2)}`;
    }

    onMouseUp(e) {
        // Если это был клик (не перетаскивание)
        if (this.isClick && this.draggedObjects.length > 0) {
            const clickDuration = Date.now() - this.clickStartTime;

            // Если клик был короткий, обрабатываем выделение
            if (clickDuration < 300) {
                this.handleClick(e);
            }
        }

        // Если было перетаскивание
        if (this.isDragging) {
            this.finishDrag();
        }

        // Сбрасываем состояние
        this.resetDrag();

        // Восстанавливаем курсор
        document.body.style.cursor = 'default';
    }

    handleClick(e) {
        // Находим объект под курсором
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);

            // Если объект можно выделять
            if (object.userData.type !== 'work_plane' &&
                object.userData.type !== 'sketch_plane' &&
                object.userData.type !== 'base_plane') {

                // Обрабатываем выделение как в app.js
                if (e.ctrlKey || e.metaKey) {
                    this.editor.toggleObjectSelection(object);
                } else {
                    this.editor.selectSingleObject(object);
                }

                this.editor.updatePropertiesPanel();
                this.editor.updateStatus();
            }
        }
    }

    onMouseLeave() {
        if (this.isDragging) {
            this.cancelDrag();
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
                `Перемещено ${this.draggedObjects.length} объект(ов)`,
                'success'
            );
        }
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
        this.isClick = true;
        this.draggedObjects = [];
        this.dragStartPositions = [];
        this.dragOffsets = [];
        this.dragStartMouse = null;
        this.dragPlane = null;
        this.dragIntersection = null;
        this.clickStartTime = 0;
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

    // Метод для включения/выключения снэппинга к сетке
    toggleSnapToGrid() {
        this.snapToGrid = !this.snapToGrid;
        this.editor.showStatus(`Привязка к сетке: ${this.snapToGrid ? 'ВКЛ' : 'ВЫКЛ'}`, 'info');
        return this.snapToGrid;
    }

    // Метод для изменения размера сетки
    setGridSize(size) {
        this.gridSize = Math.max(1, Math.min(100, size));
        this.editor.showStatus(`Размер сетки: ${this.gridSize} мм`, 'info');
    }

    // Метод для отмены перетаскивания при нажатии Escape
    handleEscape() {
        if (this.isDragging) {
            this.cancelDrag();
            return true;
        }
        return false;
    }
}