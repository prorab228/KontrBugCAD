
// drag-manager.js - исправленная версия с линиями перемещения по осям
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

        // Для визуализации перемещения
        this.moveLinesX = []; // Массив линий по оси X для каждого объекта
        this.moveLinesZ = []; // Массив линий по оси Z для каждого объекта
        this.distanceTextsX = []; // Массив текстов для оси X
        this.distanceTextsZ = []; // Массив текстов для оси Z
        this.lineThickness = 0.3; // Толщина линии
        this.showMoveLines = true; // Флаг для отображения линий

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

        // Инициализируем линии перемещения по осям
        this.initMoveLines();

        this.editor.showStatus(
            `Перетаскивание: ${this.draggedObjects.length} объект(ов) (только по XZ)`,
            'info'
        );

        // Продолжаем обработку движения для немедленного отклика
        this.onMouseMove(e);
    }

    // Инициализация линий перемещения по осям
    initMoveLines() {
        // Очищаем предыдущие линии
        this.removeMoveLines();

        // Создаем линии для каждого объекта по осям X и Z
        for (let i = 0; i < this.draggedObjects.length; i++) {
            const obj = this.draggedObjects[i];
            const startPos = this.dragStartPositions[i];
            
            // Линия по оси X (красная)
            const lineX = this.createAxisLine(startPos, startPos, 0xff4444, 'x');
            this.editor.scene.add(lineX);
            this.moveLinesX.push(lineX);
            
            // Линия по оси Z (синяя)
            const lineZ = this.createAxisLine(startPos, startPos, 0x4444ff, 'z');
            this.editor.scene.add(lineZ);
            this.moveLinesZ.push(lineZ);
            
            // Создаем группы для текста по осям
            const textGroupX = new THREE.Group();
            textGroupX.name = `drag_text_x_${i}`;
            textGroupX.visible = false;
            this.editor.scene.add(textGroupX);
            this.distanceTextsX.push(textGroupX);
            
            const textGroupZ = new THREE.Group();
            textGroupZ.name = `drag_text_z_${i}`;
            textGroupZ.visible = false;
            this.editor.scene.add(textGroupZ);
            this.distanceTextsZ.push(textGroupZ);
        }
    }

    // Создание линии для оси
    createAxisLine(startPos, endPos, color, axis) {
        // Создаем геометрию для объемной линии
        const geometry = new THREE.CylinderGeometry(
            this.lineThickness / 2,
            this.lineThickness / 2,
            1, // Высота будет масштабироваться
            8,
            1,
            false
        );
        
        // Создаем материал для линии
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        
        // Создаем меш линии
        const line = new THREE.Mesh(geometry, material);
        line.userData.axis = axis;
        line.visible = this.showMoveLines;
        line.renderOrder = 1000;
        
        // Позиционируем линию
        this.updateAxisLine(line, startPos, endPos, axis);
        
        return line;
    }

    // Обновление линии для оси
    updateAxisLine(line, startPos, currentPos, axis) {
        if (!line) return;
        
        let lineStart, lineEnd;
        
        if (axis === 'x') {
            // Линия по оси X: от начальной позиции до позиции с текущим X и начальными Y, Z
            lineStart = startPos.clone();
            lineEnd = new THREE.Vector3(currentPos.x, startPos.y, startPos.z);
        } else if (axis === 'z') {
            // Линия по оси Z: от позиции с текущим X, начальными Y, Z до текущей позиции
            lineStart = new THREE.Vector3(currentPos.x, startPos.y, startPos.z);
            lineEnd = currentPos.clone();
        }
        
        // Вычисляем середину между точками
        const midPoint = new THREE.Vector3()
            .addVectors(lineStart, lineEnd)
            .multiplyScalar(0.5);
        
        // Вычисляем длину между точками
        const distance = lineStart.distanceTo(lineEnd);
        
        // Вычисляем направление от start к end
        const direction = new THREE.Vector3()
            .subVectors(lineEnd, lineStart)
            .normalize();
        
        // Устанавливаем позицию линии в середину
        line.position.copy(midPoint);
        
        // Масштабируем линию по длине
        line.scale.set(1, distance, 1);
        
        // Поворачиваем линию, чтобы она указывала в правильном направлении
        if (direction.length() > 0) {
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            line.quaternion.copy(quaternion);
        }
        
        // Возвращаем данные для текста
        return {
            midPoint: midPoint,
            distance: distance,
            direction: direction
        };
    }

    // Обновление линий перемещения
    updateMoveLines() {
        if (!this.showMoveLines) return;
        
        for (let i = 0; i < this.draggedObjects.length; i++) {
            const obj = this.draggedObjects[i];
            const startPos = this.dragStartPositions[i];
            const currentPos = obj.position;
            
            // Обновляем линию по оси X
            const lineX = this.moveLinesX[i];
            if (lineX && lineX.visible) {
                const lineXData = this.updateAxisLine(lineX, startPos, currentPos, 'x');
                if (lineXData.distance > 0.1) {
                    this.updateDistanceText(this.distanceTextsX[i], lineXData.midPoint, lineXData.distance, lineXData.direction, `ΔX: ${(currentPos.x - startPos.x).toFixed(1)} мм`, 0xff4444);
                } else {
                    if (this.distanceTextsX[i]) {
                        this.distanceTextsX[i].visible = false;
                    }
                }
            }
            
            // Обновляем линию по оси Z
            const lineZ = this.moveLinesZ[i];
            if (lineZ && lineZ.visible) {
                const lineZData = this.updateAxisLine(lineZ, startPos, currentPos, 'z');
                if (lineZData.distance > 0.1) {
                    this.updateDistanceText(this.distanceTextsZ[i], lineZData.midPoint, lineZData.distance, lineZData.direction, `ΔZ: ${(currentPos.z - startPos.z).toFixed(1)} мм`, 0x4444ff);
                } else {
                    if (this.distanceTextsZ[i]) {
                        this.distanceTextsZ[i].visible = false;
                    }
                }
            }
        }
    }

    // Обновление текста расстояния
    updateDistanceText(textGroup, position, distance, direction, text, color) {
        if (!textGroup) return;
        
        // Очищаем предыдущий текст
        while (textGroup.children.length > 0) {
            const child = textGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            textGroup.remove(child);
        }
        
        // Создаем текстовую канву
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Настройки текста
        const fontSize = 48; // Немного меньше для двух линий
        const padding = 8;
        
        // Измеряем текст
        context.font = `bold ${fontSize}px Arial`;
        const textWidth = context.measureText(text).width;
        const textHeight = fontSize;
        
        // Устанавливаем размеры канвы
        canvas.width = textWidth + padding * 2;
        canvas.height = textHeight + padding * 2;
        
        // Очищаем канву (прозрачный фон)
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Рисуем текст с черной обводкой
        context.font = `${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Черная обводка
        context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        context.lineWidth = 3;
        context.strokeText(text, canvas.width / 2, canvas.height / 2);
        
        // Цветной текст
        const hexColor = color.toString(16).padStart(6, '0');
        context.fillStyle = `#${hexColor}`;
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Создаем текстуру из канвы
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.premultiplyAlpha = true;
        
        // Создаем материал спрайта
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });
        
        // Создаем спрайт
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Масштабируем спрайт
        const cameraDistance = this.editor.camera.position.distanceTo(position);
        const scaleFactor = 0.02 * cameraDistance;
        const aspectRatio = canvas.width / canvas.height;
        sprite.scale.set(aspectRatio * scaleFactor, scaleFactor, 1);
        
        // Позиционируем спрайт перпендикулярно линии
        let perpDirection;
        if (Math.abs(direction.y) > 0.9) {
            perpDirection = new THREE.Vector3(1, 0, 0);
        } else {
            perpDirection = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
        }
        
        // Смещаем текст
        const offset = perpDirection.multiplyScalar(2.0 + cameraDistance * 0.008);
        sprite.position.copy(offset);
        
        // Добавляем спрайт в группу
        textGroup.add(sprite);
        
        // Позиционируем группу
        textGroup.position.copy(position);
        
        // Ориентируем текст к камере
        textGroup.lookAt(this.editor.camera.position);
        textGroup.rotateY(Math.PI);
        
        textGroup.visible = true;
    }

    // Удаление линий перемещения
    removeMoveLines() {
        // Удаляем линии по оси X
        for (const line of this.moveLinesX) {
            if (line && line.parent) {
                line.parent.remove(line);
            }
            if (line && line.geometry) {
                line.geometry.dispose();
            }
            if (line && line.material) {
                line.material.dispose();
            }
        }
        this.moveLinesX = [];
        
        // Удаляем линии по оси Z
        for (const line of this.moveLinesZ) {
            if (line && line.parent) {
                line.parent.remove(line);
            }
            if (line && line.geometry) {
                line.geometry.dispose();
            }
            if (line && line.material) {
                line.material.dispose();
            }
        }
        this.moveLinesZ = [];
        
        // Удаляем тексты по оси X
        for (const textGroup of this.distanceTextsX) {
            if (textGroup) {
                while (textGroup.children.length > 0) {
                    const child = textGroup.children[0];
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                    textGroup.remove(child);
                }
                
                if (textGroup.parent) {
                    textGroup.parent.remove(textGroup);
                }
            }
        }
        this.distanceTextsX = [];
        
        // Удаляем тексты по оси Z
        for (const textGroup of this.distanceTextsZ) {
            if (textGroup) {
                while (textGroup.children.length > 0) {
                    const child = textGroup.children[0];
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                    textGroup.remove(child);
                }
                
                if (textGroup.parent) {
                    textGroup.parent.remove(textGroup);
                }
            }
        }
        this.distanceTextsZ = [];
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

            // Обновляем линии перемещения по осям
            if (this.showMoveLines) {
                this.updateMoveLines();
            }



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


    updateCoordinates(position) {
        // Показываем текущие координаты (Y остается неизменным)
        const mainObj = this.draggedObjects[0];
        document.getElementById('coords').textContent =
            `X: ${position.x.toFixed(2)}, Y: ${mainObj.position.y.toFixed(2)}, Z: ${position.z.toFixed(2)}`;
    }

    finishDrag() {
        if (this.draggedObjects.length === 0) return;

        // Удаляем линии перемещения
        this.removeMoveLines();

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

            // Удаляем линии перемещения
            this.removeMoveLines();

            // Показываем TransformControls если нужно
            if (this.editor.transformControls && this.editor.selectedObjects.length === 1) {
                const selectedObj = this.editor.selectedObjects[0];
                if (this.draggedObjects.includes(selectedObj)) {
                    this.editor.transformControls.visible = true;
                }
            }



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

    // Метод для переключения отображения линий
    toggleMoveLines() {
        this.showMoveLines = !this.showMoveLines;
        this.editor.showStatus(`Линии перемещения: ${this.showMoveLines ? 'ВКЛ' : 'ВЫКЛ'}`, 'info');
        
        // Применяем изменение к существующим линиям
        for (const line of this.moveLinesX) {
            if (line) {
                line.visible = this.showMoveLines;
            }
        }
        for (const line of this.moveLinesZ) {
            if (line) {
                line.visible = this.showMoveLines;
            }
        }
        
        return this.showMoveLines;
    }
}
