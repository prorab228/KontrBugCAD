// drag-manager.js - оптимизированная версия с исправленными проблемами производительности
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
        this.mainObjectIndex = 0;

        // Для визуализации перемещения
        this.moveLinesX = [];
        this.moveLinesZ = [];
        this.distanceTextsX = [];
        this.distanceTextsZ = [];
        this.lineThickness = 0.3;
        this.showMoveLines = true;

        // Параметры
        this.snapToGrid = true;
        this.gridSize = 1;

        // Кэшированные объекты для оптимизации
        this._tempVector = new THREE.Vector3();
        this._tempVector2 = new THREE.Vector3();
        this._tempQuaternion = new THREE.Quaternion();
        this._raycaster = new THREE.Raycaster();

        // Кэш для canvas текстур
        this._canvasCache = new Map();
        this._lastTextValues = new Map();

        // Флаг для отложенного обновления
        this._needsUpdate = false;
        this._lastUpdateTime = 0;
        this._updateInterval = 10; // ~60 FPS
    }

    // Подготовка к перетаскиванию
    prepareDrag(object, intersectionPoint) {
        this.draggedObjects = [...this.editor.selectedObjects];
        this.mainObjectIndex = this.draggedObjects.indexOf(object);

        if (this.mainObjectIndex === -1) {
            this.draggedObjects.unshift(object);
            this.mainObjectIndex = 0;
        }

        if (this.mainObjectIndex > 0) {
            this.draggedObjects.splice(this.mainObjectIndex, 1);
            this.draggedObjects.unshift(object);
            this.mainObjectIndex = 0;
        }

        this.dragStartPositions = this.draggedObjects.map(obj => obj.position.clone());

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

        const normal = new THREE.Vector3(0, 1, 0);
        const constant = -intersectionPoint.y;
        this.dragPlane = new THREE.Plane(normal, constant);
        this.dragIntersection = intersectionPoint.clone();
    }

    // Начало перетаскивания
    startDrag(e) {
        this.isDragging = true;
        this.dragStartMouse = new THREE.Vector2(e.clientX, e.clientY);
        this.initMoveLines();

        this.editor.showStatus(
            `Перетаскивание: ${this.draggedObjects.length} объект(ов) (только по XZ)`,
            'info'
        );
        this.onMouseMove(e);
    }

    // Инициализация линий перемещения по осям
    initMoveLines() {
        this.removeMoveLines();

        // Создаем геометрии и материалы один раз
        const lineGeometry = new THREE.CylinderGeometry(
            this.lineThickness / 2,
            this.lineThickness / 2,
            1,
            6, // Уменьшили количество сегментов
            1,
            false
        );

        const xMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });

        const zMaterial = new THREE.MeshBasicMaterial({
            color: 0x4444ff,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < this.draggedObjects.length; i++) {
            const obj = this.draggedObjects[i];
            const startPos = this.dragStartPositions[i];

            // Линия по оси X (используем одну геометрию для всех)
            const lineX = new THREE.Mesh(lineGeometry, xMaterial);
            lineX.userData.axis = 'x';
            lineX.userData.objIndex = i;
            lineX.visible = this.showMoveLines;
            lineX.renderOrder = 1000;
            this.updateAxisLine(lineX, startPos, startPos, 'x');
            this.editor.scene.add(lineX);
            this.moveLinesX.push(lineX);

            // Линия по оси Z
            const lineZ = new THREE.Mesh(lineGeometry, zMaterial);
            lineZ.userData.axis = 'z';
            lineZ.userData.objIndex = i;
            lineZ.visible = this.showMoveLines;
            lineZ.renderOrder = 1000;
            this.updateAxisLine(lineZ, startPos, startPos, 'z');
            this.editor.scene.add(lineZ);
            this.moveLinesZ.push(lineZ);

            // Создаем группы для текста
            const textGroupX = new THREE.Group();
            textGroupX.name = `drag_text_x_${i}`;
            textGroupX.visible = false;
            textGroupX.userData.objIndex = i;
            textGroupX.userData.axis = 'x';
            this.editor.scene.add(textGroupX);
            this.distanceTextsX.push(textGroupX);

            const textGroupZ = new THREE.Group();
            textGroupZ.name = `drag_text_z_${i}`;
            textGroupZ.visible = false;
            textGroupZ.userData.objIndex = i;
            textGroupZ.userData.axis = 'z';
            this.editor.scene.add(textGroupZ);
            this.distanceTextsZ.push(textGroupZ);
        }

        // Освобождаем память (геометрия уже использована в мешах)
        lineGeometry.dispose();
    }

    // Обновление линии для оси (оптимизированная версия)
    updateAxisLine(line, startPos, currentPos, axis) {
        if (!line) return null;

        // Используем кэшированные векторы
        const lineStart = this._tempVector;
        const lineEnd = this._tempVector2;

        if (axis === 'x') {
            lineStart.copy(startPos);
            lineEnd.set(currentPos.x, startPos.y, startPos.z);
        } else if (axis === 'z') {
            lineStart.set(currentPos.x, startPos.y, startPos.z);
            lineEnd.copy(currentPos);
        }

        // Вычисляем середину
        const midPoint = new THREE.Vector3()
            .addVectors(lineStart, lineEnd)
            .multiplyScalar(0.5);

        const distance = lineStart.distanceTo(lineEnd);

        // Устанавливаем позицию линии в середину
        line.position.copy(midPoint);

        // Масштабируем линию по длине
        line.scale.set(1, distance, 1);

        // Поворачиваем линию (только если длина > 0)
        if (distance > 0.001) {
            const direction = new THREE.Vector3()
                .subVectors(lineEnd, lineStart)
                .normalize();

            this._tempQuaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction
            );
            line.quaternion.copy(this._tempQuaternion);
        }

        return {
            midPoint: midPoint.clone(),
            distance: distance,
            direction: lineEnd.clone().sub(lineStart).normalize()
        };
    }

    // Обновление линий перемещения с регулировкой частоты
    updateMoveLines() {
        if (!this.showMoveLines || !this.isDragging) return;

        const now = performance.now();
        if (now - this._lastUpdateTime < this._updateInterval) {
            this._needsUpdate = true;
            return;
        }

        this._lastUpdateTime = now;
        this._needsUpdate = false;

        for (let i = 0; i < this.draggedObjects.length; i++) {
            const obj = this.draggedObjects[i];
            const startPos = this.dragStartPositions[i];
            const currentPos = obj.position;

            // Обновляем линию по оси X
            const lineX = this.moveLinesX[i];
            if (lineX && lineX.visible) {
                const lineXData = this.updateAxisLine(lineX, startPos, currentPos, 'x');
                const deltaX = currentPos.x - startPos.x;
                const textKeyX = `x_${i}_${deltaX.toFixed(1)}`;

                if (Math.abs(deltaX) > 0.1) {
                    // Проверяем, изменилось ли значение
                //    if (this._lastTextValues.get(textKeyX) !== textKeyX) {
                        this.updateDistanceText(
                            this.distanceTextsX[i],
                            lineXData.midPoint,
                            lineXData.distance,
                            lineXData.direction,
                            `ΔX: ${deltaX.toFixed(1)} мм`,
                            0xCC2222
                        );
                        this._lastTextValues.set(textKeyX, textKeyX);
                  //  }
                    this.distanceTextsX[i].visible = true;
                } else {
                    this.distanceTextsX[i].visible = false;
                }
            }

            // Обновляем линию по оси Z
            const lineZ = this.moveLinesZ[i];
            if (lineZ && lineZ.visible) {
                const lineZData = this.updateAxisLine(lineZ, startPos, currentPos, 'z');
                const deltaZ = currentPos.z - startPos.z;
                const textKeyZ = `z_${i}_${deltaZ.toFixed(1)}`;

                if (Math.abs(deltaZ) > 0.1) {
                    // Проверяем, изменилось ли значение
                   // if (this._lastTextValues.get(textKeyZ) !== textKeyZ) {
                        this.updateDistanceText(
                            this.distanceTextsZ[i],
                            lineZData.midPoint,
                            lineZData.distance,
                            lineZData.direction,
                            `ΔZ: ${deltaZ.toFixed(1)} мм`,
                            0x2222CC
                        );
                        this._lastTextValues.set(textKeyZ, textKeyZ);
                  //  }
                    this.distanceTextsZ[i].visible = true;
                } else {
                    this.distanceTextsZ[i].visible = false;
                }
            }
        }
    }

    // Обновление текста расстояния (с кэшированием)
    updateDistanceText(textGroup, position, distance, direction, text, color) {
        if (!textGroup) return;

        // Используем кэшированный canvas или создаем новый
        let canvas, context, texture, sprite;

        if (textGroup.children.length > 0) {
            // Используем существующий спрайт
            sprite = textGroup.children[0];
            texture = sprite.material.map;
            canvas = texture.image;
            context = canvas.getContext('2d');
        } else {
            // Создаем новый canvas
            canvas = document.createElement('canvas');
            context = canvas.getContext('2d');

            // Создаем текстуру
            texture = new THREE.CanvasTexture(canvas);
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
            sprite = new THREE.Sprite(spriteMaterial);
            textGroup.add(sprite);

            // Сохраняем ссылки
            textGroup.userData.canvas = canvas;
            textGroup.userData.texture = texture;
        }

        // Настройки текста
        const fontSize = 46; // Уменьшенный размер шрифта
        const padding = 6;

        // Измеряем текст
        context.font = `bold ${fontSize}px Arial`;
        const textWidth = context.measureText(text).width;
        const textHeight = fontSize;

        // Проверяем, нужно ли изменять размер канвы
        if (canvas.width < textWidth + padding * 2 || canvas.height < textHeight + padding * 2) {
            canvas.width = Math.max(canvas.width, textWidth + padding * 2);
            canvas.height = Math.max(canvas.height, textHeight + padding * 2);
            texture.needsUpdate = true;
        }

        // Очищаем канву
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Рисуем текст
        context.font = `${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Черная обводка
        context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        context.lineWidth = 2;
        context.strokeText(text, canvas.width / 2, canvas.height / 2);

        // Цветной текст
        const hexColor = color.toString(16).padStart(6, '0');
        context.fillStyle = `#${hexColor}`;
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Обновляем текстуру
        texture.needsUpdate = true;

        // Масштабируем спрайт
        const cameraDistance = this.editor.camera.position.distanceTo(position);
        const scaleFactor = 0.055 * cameraDistance; // Уменьшенный масштаб
        const aspectRatio = canvas.width / canvas.height;
        sprite.scale.set(aspectRatio * scaleFactor, scaleFactor, 1);

        // Позиционируем спрайт
        let perpDirection;
        if (Math.abs(direction.y) > 0.9) {
            perpDirection = new THREE.Vector3(1, 0, 0);
        } else {
            perpDirection = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
        }

        const offset = perpDirection.multiplyScalar(1.5 + cameraDistance * 0.006);
        sprite.position.copy(offset);

        // Позиционируем группу
        textGroup.position.copy(position);
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
            // Не удаляем геометрию и материал - они общие
        }
        this.moveLinesX = [];

        // Удаляем линии по оси Z
        for (const line of this.moveLinesZ) {
            if (line && line.parent) {
                line.parent.remove(line);
            }
        }
        this.moveLinesZ = [];

        // Удаляем тексты по оси X
        for (const textGroup of this.distanceTextsX) {
            if (textGroup) {
                // Освобождаем ресурсы
                if (textGroup.userData.texture) {
                    textGroup.userData.texture.dispose();
                }

                while (textGroup.children.length > 0) {
                    const child = textGroup.children[0];
                    if (child.material) {
                        child.material.dispose();
                        if (child.material.map) {
                            child.material.map.dispose();
                        }
                    }
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
                // Освобождаем ресурсы
                if (textGroup.userData.texture) {
                    textGroup.userData.texture.dispose();
                }

                while (textGroup.children.length > 0) {
                    const child = textGroup.children[0];
                    if (child.material) {
                        child.material.dispose();
                        if (child.material.map) {
                            child.material.map.dispose();
                        }
                    }
                    textGroup.remove(child);
                }

                if (textGroup.parent) {
                    textGroup.parent.remove(textGroup);
                }
            }
        }
        this.distanceTextsZ = [];

        // Очищаем кэш
        this._lastTextValues.clear();
    }

    onMouseMove(e) {
        if (!this.isDragging || this.draggedObjects.length === 0) return;

        e.preventDefault();
        this.editor.updateMousePosition(e);

        const newPosition = this.getDragPosition(e);

        if (newPosition) {
            // Применяем снэппинг к сетке
            let finalPosition = newPosition.clone();
            if (this.snapToGrid) {
                finalPosition.x = Math.round(newPosition.x / this.gridSize) * this.gridSize;
                finalPosition.z = Math.round(newPosition.z / this.gridSize) * this.gridSize;
            }

            // Перемещаем объекты
            if (this.draggedObjects.length === 1) {
                const obj = this.draggedObjects[0];
                obj.position.x = finalPosition.x;
                obj.position.z = finalPosition.z;
                obj.position.y = this.dragStartPositions[0].y;
            } else {
                const mainObject = this.draggedObjects[0];
                mainObject.position.x = finalPosition.x;
                mainObject.position.z = finalPosition.z;
                mainObject.position.y = this.dragStartPositions[0].y;

                for (let i = 1; i < this.draggedObjects.length; i++) {
                    const obj = this.draggedObjects[i];
                    obj.position.x = finalPosition.x + this.dragOffsets[i].x;
                    obj.position.z = finalPosition.z + this.dragOffsets[i].z;
                    obj.position.y = this.dragStartPositions[i].y;
                }
            }

            // Обновляем линии с регулировкой частоты
            if (this.showMoveLines) {
                this.updateMoveLines();
            }

            // Обновляем координаты
            this.updateCoordinates(finalPosition);
            document.body.style.cursor = 'grabbing';
        }

        // Если есть отложенное обновление, выполняем его
        if (this._needsUpdate) {
            this.updateMoveLines();
        }
    }

    getDragPosition(event) {
        if (!this.dragPlane) return null;

        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        this._raycaster.setFromCamera(mouse, this.editor.camera);

        const intersection = new THREE.Vector3();
        if (this._raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
            return intersection;
        }

        return null;
    }

    updateCoordinates(position) {
        const mainObj = this.draggedObjects[0];
        document.getElementById('coords').textContent =
            `X: ${position.x.toFixed(2)}, Y: ${mainObj.position.y.toFixed(2)}, Z: ${position.z.toFixed(2)}`;
    }

    finishDrag() {
        if (this.draggedObjects.length === 0) return;

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
        this._lastTextValues.clear();
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