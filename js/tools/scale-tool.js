class ScaleTool extends TransformToolBase {
    constructor(editor) {
        super('scale', 'fa-expand-alt', editor);
        this.sizeStartDimensions = new THREE.Vector3();
        this.startScale = new THREE.Vector3();
        this.uniformScaling = false;
        this.percentageMode = false;
        this.lastMousePosition = new THREE.Vector2();

        this.currentHandle = null;
        this.startHandleWorldPosition = new THREE.Vector3();
        
        // Для подсветки при наведении
        this.hoveredHandle = null;

        // Для поля ввода масштаба
        this._inputContainer = null;
        this._inputElement = null;
        this._unitElement = null;
        this._isInputFocused = false;
        this._lastInputValue = 100;
        this._isDragging = false;
        this._currentDragAxis = null;

        this.initGizmo();
        this.initScaleInput();
    }

    initScaleInput() {
        // Создаем контейнер для поля ввода
        this._inputContainer = document.createElement('div');
        this._inputContainer.className = 'distance-input-container';
        this._inputContainer.style.display = 'none';

        // Создаем поле ввода
        this._inputElement = document.createElement('input');
        this._inputElement.type = 'number';
        this._inputElement.step = '0.1';
        this._inputElement.value = '0';
        this._inputContainer.appendChild(this._inputElement);

        // Создаем элемент для отображения единиц измерения
        this._unitElement = document.createElement('span');
        this._unitElement.textContent = 'мм';
        this._unitElement.style.marginLeft = '5px';

        this._inputContainer.appendChild(this._unitElement);

        document.body.appendChild(this._inputContainer);

        // Обработчики событий
        this._inputElement.addEventListener('focus', () => {
            this._isInputFocused = true;
        });

        this._inputElement.addEventListener('blur', () => {
            this._isInputFocused = false;
        });

        this._inputElement.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value)) {
                this.updateFromInput(value);
            }
        });
    }

    updateInputUnit() {
        if (this._unitElement) {
            this._unitElement.textContent = this.percentageMode ? '%' : 'мм';
        }
    }

    updateFromInput(value) {
        if (!this.attachedObject || !this._currentDragAxis) return;

        // Сохраняем начальное состояние для истории
        if (!this.attachedObject.userData.transformStartState) {
            this.attachedObject.userData.transformStartState = {
                position: this.attachedObject.position.clone(),
                rotation: this.attachedObject.quaternion.clone(),
                scale: this.attachedObject.scale.clone()
            };
        }

        if (this.percentageMode) {
            // Режим процентов
            // Преобразуем проценты в коэффициент масштаба
            const scaleFactor = value / 100;

            // Получаем исходные размеры
            const originalSize = this.attachedObject.userData.originalSize ||
                                 this.getObjectDimensions(this.attachedObject);

            // Вычисляем новые размеры
            const newDimensions = new THREE.Vector3();

            if (this.uniformScaling) {
                // Равномерное масштабирование
                newDimensions.x = originalSize.x * scaleFactor;
                newDimensions.y = originalSize.y * scaleFactor;
                newDimensions.z = originalSize.z * scaleFactor;
            } else {
                // Масштабирование по оси
                const currentDimensions = this.getObjectDimensions(this.attachedObject);
                newDimensions.copy(currentDimensions);
                if (this._currentDragAxis === 'x') {
                    newDimensions.x = originalSize.x * scaleFactor;
                } else if (this._currentDragAxis === 'y') {
                    newDimensions.y = originalSize.y * scaleFactor;
                } else if (this._currentDragAxis === 'z') {
                    newDimensions.z = originalSize.z * scaleFactor;
                }
            }

            // Обновляем размер объекта
            this.updateObjectSize(newDimensions, false);
        } else {
            // Режим абсолютных значений (мм)
            const newDimensions = this.getObjectDimensions(this.attachedObject).clone();

            if (this.uniformScaling) {
                // Равномерное масштабирование - меняем все оси на указанное значение
                newDimensions.set(value, value, value);
            } else {
                // Масштабирование по оси
                if (this._currentDragAxis === 'x') {
                    newDimensions.x = value;
                } else if (this._currentDragAxis === 'y') {
                    newDimensions.y = value;
                } else if (this._currentDragAxis === 'z') {
                    newDimensions.z = value;
                }
            }

            // Обновляем размер объекта
            this.updateObjectSize(newDimensions, false);
        }

        // Обновляем гизмо
        this.updateGizmoPosition();
    }

    initGizmo() {
        while (this.gizmoGroup.children.length > 0) {
            const child = this.gizmoGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.gizmoGroup.remove(child);
        }

        this.createScaleGizmo();
        this.gizmoGroup.visible = false;
    }

    createScaleGizmo() {
        const handleSize = 1.5;
        const lineWidth = 0.1;

        this.baseSize = 10;
        this.halfSize = this.baseSize / 2;

        this.createBaseRectangle(handleSize, lineWidth);
        this.createVerticalRectangle(handleSize, lineWidth);
    }

    createBaseRectangle(handleSize, lineWidth) {
        const halfWidth = this.halfSize;
        const halfDepth = this.halfSize;

        const positions = [
            [-halfWidth, -halfWidth, -halfDepth], [halfWidth, -halfWidth, -halfDepth],
            [-halfWidth, -halfWidth, halfDepth], [halfWidth, -halfWidth, halfDepth],
            [-halfWidth, -halfWidth, -halfDepth], [-halfWidth, -halfWidth, halfDepth],
            [halfWidth, -halfWidth, -halfDepth], [halfWidth, -halfWidth, halfDepth]
        ];

        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array(positions.flat());
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });

        const lines = new THREE.LineSegments(geometry, material);
        lines.name = 'base_rectangle';
        lines.userData.type = 'scale';
        lines.userData.plane = 'base';
        this.gizmoGroup.add(lines);

        const middleHandlePositions = [
            { pos: [-halfWidth, -halfWidth, 0], axis: 'x', color: this.axisColors.x, direction: 1 },
            { pos: [halfWidth, -halfWidth, 0], axis: 'x', color: this.axisColors.x, direction: 1 },
            { pos: [0, -halfWidth, -halfDepth], axis: 'z', color: this.axisColors.z, direction: 1 },
            { pos: [0, -halfWidth, halfDepth], axis: 'z', color: this.axisColors.z, direction: 1 }
        ];

        this.baseMiddleHandles = [];
        middleHandlePositions.forEach((handle, index) => {
            const cube = this.createHandleCube(
                handle.pos,
                handle.axis,
                handle.color,
                handleSize,
                `base_middle_${handle.axis}_${index}`
            );
            cube.userData.direction = handle.direction;
            this.baseMiddleHandles.push(cube);
        });
    }

    createVerticalRectangle(handleSize, lineWidth) {
        const halfWidth = this.halfSize;
        const halfHeight = this.halfSize;

        const positions = [
            [0, -halfWidth, -halfWidth], [0, halfHeight, -halfWidth],
            [0, -halfWidth, halfWidth], [0, halfHeight, halfWidth],
            [0, -halfWidth, -halfWidth], [0, -halfWidth, halfWidth],
            [0, halfHeight, -halfWidth], [0, halfHeight, halfWidth]
        ];

        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array(positions.flat());
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });

        const lines = new THREE.LineSegments(geometry, material);
        lines.name = 'vertical_rectangle';
        lines.userData.type = 'scale';
        lines.userData.plane = 'vertical';
        this.gizmoGroup.add(lines);

        const middleHandlePositions = [
            { pos: [0, -halfWidth, 0], axis: 'y', color: this.axisColors.y, direction: 1 },
            { pos: [0, halfHeight, 0], axis: 'y', color: this.axisColors.y, direction: 1 },
            { pos: [0, 0, -halfWidth], axis: 'z', color: this.axisColors.z, direction: 1 },
            { pos: [0, 0, halfWidth], axis: 'z', color: this.axisColors.z, direction: 1 }
        ];

        this.verticalMiddleHandles = [];
        middleHandlePositions.forEach((handle, index) => {
            const cube = this.createHandleCube(
                handle.pos,
                handle.axis,
                handle.color,
                handleSize,
                `vertical_middle_${handle.axis}_${index}`
            );
            cube.userData.direction = handle.direction;
            this.verticalMiddleHandles.push(cube);
        });
    }

    createHandleCube(position, axis, color, size, name) {
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9
        });

        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(...position);
        cube.name = `scale_handle_${name}`;
        cube.userData.type = 'scale';
        cube.userData.axis = axis;
        cube.userData.handle = true;

        this.gizmoGroup.add(cube);
        return cube;
    }

    updateGizmoPosition() {
        if (!this.attachedObject) return;

        const worldPos = new THREE.Vector3();
        this.attachedObject.getWorldPosition(worldPos);
        this.gizmoGroup.position.copy(worldPos);

        if (this.useLocalCoordinates) {
            this.gizmoGroup.quaternion.copy(this.attachedObject.quaternion);
        } else {
            this.gizmoGroup.quaternion.identity();
        }

        const dimensions = this.getObjectDimensions(this.attachedObject);
        const halfWidth = dimensions.x / 2+1;
        const halfHeight = dimensions.y / 2+1;
        const halfDepth = dimensions.z / 2+1;

        if (this.baseMiddleHandles && this.baseMiddleHandles.length >= 4) {
            this.baseMiddleHandles[0].position.set(-halfWidth, -halfHeight, 0);
            this.baseMiddleHandles[1].position.set(halfWidth, -halfHeight, 0);
            this.baseMiddleHandles[2].position.set(0, -halfHeight, -halfDepth);
            this.baseMiddleHandles[3].position.set(0, -halfHeight, halfDepth);
        }

        if (this.verticalMiddleHandles && this.verticalMiddleHandles.length >= 4) {
            this.verticalMiddleHandles[0].position.set(0, -halfHeight, 0);
            this.verticalMiddleHandles[1].position.set(0, halfHeight, 0);
            this.verticalMiddleHandles[2].position.set(0, 0, -halfDepth);
            this.verticalMiddleHandles[3].position.set(0, 0, halfDepth);
        }

        this.updateRectangleGeometries(halfWidth, halfHeight, halfDepth);

        // Обновляем материалы для подсветки
        this.updateHandleMaterials();
    }

    updateHandleMaterials() {
        // Обновляем материалы базовых кубиков
        this.baseMiddleHandles.forEach(handle => {
            const isHovered = (handle === this.hoveredHandle);
            const targetColor = isHovered ? 0xFFFF00 : this.axisColors[handle.userData.axis];
            const targetOpacity = isHovered ? 1.0 : 0.9;

            if (handle.material) {
                handle.material.color.set(targetColor);
                handle.material.opacity = targetOpacity;
            }
        });

        // Обновляем материалы вертикальных кубиков
        this.verticalMiddleHandles.forEach(handle => {
            const isHovered = (handle === this.hoveredHandle);
            const targetColor = isHovered ? 0xFFFF00 : this.axisColors[handle.userData.axis];
            const targetOpacity = isHovered ? 1.0 : 0.9;

            if (handle.material) {
                handle.material.color.set(targetColor);
                handle.material.opacity = targetOpacity;
            }
        });
    }

    updateRectangleGeometries(halfWidth, halfHeight, halfDepth) {
        const baseRect = this.gizmoGroup.getObjectByName('base_rectangle');
        if (baseRect && baseRect.geometry) {
            const positions = [
                -halfWidth, -halfHeight, -halfDepth, halfWidth, -halfHeight, -halfDepth,
                -halfWidth, -halfHeight, halfDepth, halfWidth, -halfHeight, halfDepth,
                -halfWidth, -halfHeight, -halfDepth, -halfWidth, -halfHeight, halfDepth,
                halfWidth, -halfHeight, -halfDepth, halfWidth, -halfHeight, halfDepth
            ];

            baseRect.geometry.attributes.position.array = new Float32Array(positions);
            baseRect.geometry.attributes.position.needsUpdate = true;
        }

        const verticalRect = this.gizmoGroup.getObjectByName('vertical_rectangle');
        if (verticalRect && verticalRect.geometry) {
            const positions = [
                0, -halfHeight, -halfDepth, 0, halfHeight, -halfDepth,
                0, -halfHeight, halfDepth, 0, halfHeight, halfDepth,
                0, -halfHeight, -halfDepth, 0, -halfHeight, halfDepth,
                0, halfHeight, -halfDepth, 0, halfHeight, halfDepth
            ];

            verticalRect.geometry.attributes.position.array = new Float32Array(positions);
            verticalRect.geometry.attributes.position.needsUpdate = true;
        }
    }

    updateInputPosition() {
        if (!this._inputContainer || !this.currentHandle) return;

        // Получаем мировую позицию текущего кубика
        const handleWorldPos = new THREE.Vector3();
        this.currentHandle.getWorldPosition(handleWorldPos);

        // Преобразуем мировые координаты в экранные
        const screenPos = this.worldToScreen(handleWorldPos, this.editor.camera, this.editor.renderer);

        // Позиционируем контейнер рядом с кубиком
        this._inputContainer.style.left = `${screenPos.x - 60}px`;
        this._inputContainer.style.top = `${screenPos.y - 30}px`;
    }

    worldToScreen(position, camera, renderer) {
        const vector = position.clone();
        vector.project(camera);

        const x = (vector.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (vector.y * -0.5 + 0.5) * renderer.domElement.clientHeight;

        return { x, y };
    }

    onMouseDown(e) {
        if (e.button !== 0) return false;

        this.snapEnabled = !e.ctrlKey;
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const gizmoMeshes = [];
        this.gizmoGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.handle) {
                gizmoMeshes.push(child);
            }
        });

        const intersects = this.editor.raycaster.intersectObjects(gizmoMeshes, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;
            this.currentHandle = object;
            const axis = object.userData.axis;

            // Получаем мировую позицию кубика в начале перетаскивания
            this.startHandleWorldPosition.copy(object.getWorldPosition(new THREE.Vector3()));

            this.startDragging(axis, e);
            return true;
        }

        const sceneIntersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (sceneIntersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(sceneIntersects[0].object);

            if (this.canTransformObject(object)) {
                this.editor.selectSingleObject(object);
                this.attachToObject(object);
                return true;
            }
        }

        return false;
    }

    onMouseMove(e) {
        super.onMouseMove(e);

        if (this.isDragging) return;

        // Обработка наведения на кубики
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const gizmoMeshes = [];
        this.gizmoGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.handle) {
                gizmoMeshes.push(child);
            }
        });

        const intersects = this.editor.raycaster.intersectObjects(gizmoMeshes, true);

        // Сбрасываем подсветку предыдущего кубика
        if (this.hoveredHandle) {
            this.hoveredHandle = null;
        }

        // Подсвечиваем новый кубик при наведении
        if (intersects.length > 0) {
            const object = intersects[0].object;
            this.hoveredHandle = object;
        }

        // Обновляем гизмо, чтобы применить подсветку
        this.updateGizmoPosition();
    }

    startDragging(axis, e) {
        super.startDragging(axis, e);

        if (this.attachedObject) {
            const rect = this.editor.renderer.domElement.getBoundingClientRect();
            this.startMouse.set(e.clientX, e.clientY);
            this.lastMousePosition.copy(this.startMouse);

            this.sizeStartDimensions = this.getObjectDimensions(this.attachedObject);
            this.startScale.copy(this.attachedObject.scale);
            this.moveDelta.set(0, 0, 0);
            this._currentDragAxis = axis;
            this._isDragging = true;

            if (!this.attachedObject.userData.originalSize) {
                this.attachedObject.userData.originalSize = this.sizeStartDimensions.clone();
            }

            // Настраиваем поле ввода
            if (this._inputContainer) {
                this._inputContainer.style.display = 'block';

                // Обновляем единицы измерения
                this.updateInputUnit();

                // Устанавливаем начальное значение
                const dimensions = this.getObjectDimensions(this.attachedObject);
                if (this.percentageMode) {
                    // Режим процентов
                    let percentage = 100;
                    const originalSize = this.attachedObject.userData.originalSize || dimensions;

                    if (this.uniformScaling) {
                        percentage = (dimensions.x / originalSize.x) * 100;
                    } else {
                        if (axis === 'x') {
                            percentage = (dimensions.x / originalSize.x) * 100;
                        } else if (axis === 'y') {
                            percentage = (dimensions.y / originalSize.y) * 100;
                        } else if (axis === 'z') {
                            percentage = (dimensions.z / originalSize.z) * 100;
                        }
                    }
                    this._inputElement.value = percentage.toFixed(1);
                } else {
                    // Режим абсолютных значений (мм)
                    if (this.uniformScaling) {
                        this._inputElement.value = dimensions.x.toFixed(1);
                    } else {
                        if (axis === 'x') {
                            this._inputElement.value = dimensions.x.toFixed(1);
                        } else if (axis === 'y') {
                            this._inputElement.value = dimensions.y.toFixed(1);
                        } else if (axis === 'z') {
                            this._inputElement.value = dimensions.z.toFixed(1);
                        }
                    }
                }

                // Устанавливаем цвет рамки в зависимости от оси
                if (axis === 'x') {
                    this._inputContainer.style.borderColor = '#ff4444';
                } else if (axis === 'y') {
                    this._inputContainer.style.borderColor = '#44ff44';
                } else if (axis === 'z') {
                    this._inputContainer.style.borderColor = '#4444ff';
                }

                this.updateInputPosition();
            }
        }
    }

    handleTransform(deltaX, deltaY) {
        if (!this.attachedObject || !this.currentAxis || !this.currentHandle) return;

        // Создаем луч из текущей позиции мыши
        const currentMouseX = this.startMouse.x + deltaX;
        const currentMouseY = this.startMouse.y + deltaY;

        // Нормализуем координаты мыши
        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();
        mouse.x = ((currentMouseX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((currentMouseY - rect.top) / rect.height) * 2 + 1;

        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        // Получаем вектор направления кубика от центра объекта
        const objectCenter = new THREE.Vector3();
        this.attachedObject.getWorldPosition(objectCenter);

        const handleDirection = new THREE.Vector3();
        handleDirection.copy(this.startHandleWorldPosition).sub(objectCenter).normalize();

        // Находим плоскость, перпендикулярную лучу камеры и проходящую через кубик
        const cameraDirection = this.editor.raycaster.ray.direction;
        const planeNormal = cameraDirection.clone();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            planeNormal,
            this.startHandleWorldPosition
        );

        // Находим точку пересечения луча с этой плоскости
        const intersectionPoint = new THREE.Vector3();
        if (this.editor.raycaster.ray.intersectPlane(plane, intersectionPoint)) {
            // Вычисляем смещение от начальной позиции кубика
            const displacement = intersectionPoint.sub(this.startHandleWorldPosition);

            // Проецируем смещение на направление кубика
            const dotProduct = displacement.dot(handleDirection);

            // Определяем, увеличивается ли размер (движение от центра объекта)
            const direction = this.currentHandle.userData.direction;
            const scaleChange = dotProduct * 0.1 * direction;

            // Применяем изменение масштаба
            let scaleIncrement = 1.0 + scaleChange;

            // Ограничиваем масштаб минимальным значением
            scaleIncrement = Math.max(0.1, scaleIncrement);

            let newDimensions = new THREE.Vector3();

            // Изменение размера в зависимости от режима
            if (this.uniformScaling) {
                // Равномерное масштабирование
                newDimensions.x = this.sizeStartDimensions.x * scaleIncrement;
                newDimensions.y = this.sizeStartDimensions.y * scaleIncrement;
                newDimensions.z = this.sizeStartDimensions.z * scaleIncrement;
            } else {
                // Масштабирование по одной оси
                if (this.currentAxis === 'x') {
                    newDimensions.x = this.sizeStartDimensions.x * scaleIncrement;
                    newDimensions.y = this.sizeStartDimensions.y;
                    newDimensions.z = this.sizeStartDimensions.z;
                } else if (this.currentAxis === 'y') {
                    newDimensions.x = this.sizeStartDimensions.x;
                    newDimensions.y = this.sizeStartDimensions.y * scaleIncrement;
                    newDimensions.z = this.sizeStartDimensions.z;
                } else if (this.currentAxis === 'z') {
                    newDimensions.x = this.sizeStartDimensions.x;
                    newDimensions.y = this.sizeStartDimensions.y;
                    newDimensions.z = this.sizeStartDimensions.z * scaleIncrement;
                }
            }

            // Применяем привязку к сетке
            if (this.snapEnabled && !this.editor.spacePressed) {
                newDimensions.x = Math.round(newDimensions.x / this.sizeSnapValue) * this.sizeSnapValue;
                newDimensions.y = Math.round(newDimensions.y / this.sizeSnapValue) * this.sizeSnapValue;
                newDimensions.z = Math.round(newDimensions.z / this.sizeSnapValue) * this.sizeSnapValue;
            }

            // Ограничиваем минимальные размеры
            const minScale = 0.1;
            newDimensions.x = Math.max(minScale, newDimensions.x);
            newDimensions.y = Math.max(minScale, newDimensions.y);
            newDimensions.z = Math.max(minScale, newDimensions.z);

            this.updateObjectSize(newDimensions, false);

            // Вычисляем значение для отображения в поле ввода
            let displayValue;
            if (this.percentageMode) {
                // Режим процентов
                const originalSize = this.attachedObject.userData.originalSize || this.sizeStartDimensions;
                if (this.uniformScaling) {
                    displayValue = (newDimensions.x / originalSize.x) * 100;
                } else {
                    if (this.currentAxis === 'x') {
                        displayValue = (newDimensions.x / originalSize.x) * 100;
                    } else if (this.currentAxis === 'y') {
                        displayValue = (newDimensions.y / originalSize.y) * 100;
                    } else if (this.currentAxis === 'z') {
                        displayValue = (newDimensions.z / originalSize.z) * 100;
                    }
                }
            } else {
                // Режим абсолютных значений (мм)
                if (this.uniformScaling) {
                    displayValue = newDimensions.x;
                } else {
                    if (this.currentAxis === 'x') {
                        displayValue = newDimensions.x;
                    } else if (this.currentAxis === 'y') {
                        displayValue = newDimensions.y;
                    } else if (this.currentAxis === 'z') {
                        displayValue = newDimensions.z;
                    }
                }
            }

            // Обновляем значение в поле ввода (если фокус не в поле ввода)
            if (!this._isInputFocused && this._inputElement) {
                this._inputElement.value = displayValue.toFixed(1);
            }

            // Обновляем позицию поля ввода
            this.updateInputPosition();
        }
    }

    onMouseUp(e) {
        super.onMouseUp(e);
        this.currentHandle = null;
        this._isDragging = false;

        // Сбрасываем подсветку
        this.hoveredHandle = null;
        this.updateGizmoPosition();
    }

    detach() {
        // Скрываем поле ввода при откреплении объекта
        if (this._inputContainer) {
            this._inputContainer.style.display = 'none';
        }

        // Сбрасываем подсветку
        this.hoveredHandle = null;
        this._currentDragAxis = null;
        this._isDragging = false;

        // Вызываем родительский метод
        super.detach();
    }

    onDeactivate() {
        // Скрываем поле ввода при деактивации инструмента
        if (this._inputContainer) {
            this._inputContainer.style.display = 'none';
        }

        // Сбрасываем подсветку
        this.hoveredHandle = null;
        this._currentDragAxis = null;
        this._isDragging = false;

        // Вызываем родительский метод
        super.onDeactivate();
    }

    getPropertiesHTML() {
        console.log('ScaleTool: создание HTML свойств');
        return `
            <div class="property-group" data-type="scale-size">
                <h4><i class="fas fa-ruler"></i> Размеры</h4>

                <div class="property-row">
                    <label>
                        <input type="checkbox" id="uniformScaling" ${this.uniformScaling ? 'checked' : ''}>
                        Равномерное изменение размера
                    </label>
                </div>

                <div class="property-row">
                    <label>
                        <input type="checkbox" id="percentageMode" ${this.percentageMode ? 'checked' : ''}>
                        Режим процентов
                    </label>
                </div>

                <div class="property-row">
                    <label>Локальные координаты:</label>
                    <input type="checkbox" id="localCoordinates" ${this.useLocalCoordinates ? 'checked' : ''}>
                </div>

                <div id="scaleAbsoluteControls" style="${this.percentageMode ? 'display: none;' : ''}">
                    <div class="property-row">
                        <label>Ширина (X):</label>
                        <input type="number" id="scaleX" step="0.1" min="0.1" value="25">
                        <span>мм</span>
                    </div>
                    <div class="property-row">
                        <label>Высота (Y):</label>
                        <input type="number" id="scaleY" step="0.1" min="0.1" value="25">
                        <span>мм</span>
                    </div>
                    <div class="property-row">
                        <label>Глубина (Z):</label>
                        <input type="number" id="scaleZ" step="0.1" min="0.1" value="25">
                        <span>мм</span>
                    </div>
                </div>

                <div id="scalePercentageControls" style="${!this.percentageMode ? 'display: none;' : ''}">
                    <div class="property-row">
                        <label>Ширина (X):</label>
                        <input type="number" id="scalePercentX" step="1" min="1" value="100">
                        <span>%</span>
                    </div>
                    <div class="property-row">
                        <label>Высота (Y):</label>
                        <input type="number" id="scalePercentY" step="1" min="1" value="100">
                        <span>%</span>
                    </div>
                    <div class="property-row">
                        <label>Глубина (Z):</label>
                        <input type="number" id="scalePercentZ" step="1" min="1" value="100">
                        <span>%</span>
                    </div>
                    <div class="property-row">
                        <button id="applyScalePercentage" class="btn-small">
                            <i class="fas fa-check"></i> Применить масштаб
                        </button>
                    </div>
                </div>

                <div class="property-row">
                    <button id="applyScale" class="btn-small" style="${this.percentageMode ? 'display: none;' : ''}">
                        <i class="fas fa-check"></i> Применить размеры
                    </button>
                </div>
            </div>
        `;
    }

    bindPropertiesEvents() {
        if (!this.propertiesElement) {
            console.log('ScaleTool: propertiesElement отсутствует');
            return;
        }

        console.log('ScaleTool: привязка событий');

        const sizeX = this.propertiesElement.querySelector('#scaleX');
        const sizeY = this.propertiesElement.querySelector('#scaleY');
        const sizeZ = this.propertiesElement.querySelector('#scaleZ');
        const applyBtn = this.propertiesElement.querySelector('#applyScale');
        const uniformCheckbox = this.propertiesElement.querySelector('#uniformScaling');
        const percentageCheckbox = this.propertiesElement.querySelector('#percentageMode');

        const localCoordsCheckbox = this.propertiesElement.querySelector('#localCoordinates');

        if (sizeX) {
            sizeX.addEventListener('change', (e) => this.onSizeChange('x', e));
            sizeX.addEventListener('input', (e) => this.onSizeChange('x', e));
        }
        if (sizeY) {
            sizeY.addEventListener('change', (e) => this.onSizeChange('y', e));
            sizeY.addEventListener('input', (e) => this.onSizeChange('y', e));
        }
        if (sizeZ) {
            sizeZ.addEventListener('change', (e) => this.onSizeChange('z', e));
            sizeZ.addEventListener('input', (e) => this.onSizeChange('z', e));
        }
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applySizeFromInputs());
        }
        if (uniformCheckbox) {
            uniformCheckbox.checked = this.uniformScaling;
            uniformCheckbox.addEventListener('change', (e) => {
                this.uniformScaling = e.target.checked;
                console.log('Равномерное масштабирование:', this.uniformScaling);
            });
        }
        if (percentageCheckbox) {
            percentageCheckbox.checked = this.percentageMode;
            percentageCheckbox.addEventListener('change', (e) => {
                this.percentageMode = e.target.checked;
                this.updatePropertiesUI();
                this.updateInputUnit();
                // Если есть активное поле ввода, обновим его значение
                if (this._inputContainer && this._inputContainer.style.display === 'block' && this.attachedObject) {
                    const dimensions = this.getObjectDimensions(this.attachedObject);
                    if (this.percentageMode) {
                        // Переключаемся в режим процентов
                        const originalSize = this.attachedObject.userData.originalSize || dimensions;
                        let percentage = 100;
                        if (this.uniformScaling) {
                            percentage = (dimensions.x / originalSize.x) * 100;
                        } else if (this._currentDragAxis) {
                            if (this._currentDragAxis === 'x') {
                                percentage = (dimensions.x / originalSize.x) * 100;
                            } else if (this._currentDragAxis === 'y') {
                                percentage = (dimensions.y / originalSize.y) * 100;
                            } else if (this._currentDragAxis === 'z') {
                                percentage = (dimensions.z / originalSize.z) * 100;
                            }
                        }
                        this._inputElement.value = percentage.toFixed(1);
                    } else {
                        // Переключаемся в режим абсолютных значений
                        if (this.uniformScaling) {
                            this._inputElement.value = dimensions.x.toFixed(1);
                        } else if (this._currentDragAxis) {
                            if (this._currentDragAxis === 'x') {
                                this._inputElement.value = dimensions.x.toFixed(1);
                            } else if (this._currentDragAxis === 'y') {
                                this._inputElement.value = dimensions.y.toFixed(1);
                            } else if (this._currentDragAxis === 'z') {
                                this._inputElement.value = dimensions.z.toFixed(1);
                            }
                        }
                    }
                }
            });
        }
        const percentX = this.propertiesElement.querySelector('#scalePercentX');
        const percentY = this.propertiesElement.querySelector('#scalePercentY');
        const percentZ = this.propertiesElement.querySelector('#scalePercentZ');
        const applyPercentageBtn = this.propertiesElement.querySelector('#applyScalePercentage');

        if (percentX) {
            percentX.addEventListener('change', (e) => this.onPercentChange('x', e));
            percentX.addEventListener('input', (e) => this.onPercentChange('x', e));
        }
        if (percentY) {
            percentY.addEventListener('change', (e) => this.onPercentChange('y', e));
            percentY.addEventListener('input', (e) => this.onPercentChange('y', e));
        }
        if (percentZ) {
            percentZ.addEventListener('change', (e) => this.onPercentChange('z', e));
            percentZ.addEventListener('input', (e) => this.onPercentChange('z', e));
        }
        if (applyPercentageBtn) {
            applyPercentageBtn.addEventListener('click', () => this.applyPercentageScale());
        }

        if (localCoordsCheckbox) {
            localCoordsCheckbox.checked = this.useLocalCoordinates;
            localCoordsCheckbox.addEventListener('change', (e) => {
                this.useLocalCoordinates = e.target.checked;
                this.updateGizmoPosition();
            });
        }
    }

    updatePropertiesUI() {
        if (!this.propertiesElement) return;

        const absoluteControls = this.propertiesElement.querySelector('#scaleAbsoluteControls');
        const percentageControls = this.propertiesElement.querySelector('#scalePercentageControls');
        const applyBtn = this.propertiesElement.querySelector('#applyScale');

        if (this.percentageMode) {
            if (absoluteControls) absoluteControls.style.display = 'none';
            if (percentageControls) percentageControls.style.display = 'block';
            if (applyBtn) applyBtn.style.display = 'none';
        } else {
            if (absoluteControls) absoluteControls.style.display = 'block';
            if (percentageControls) percentageControls.style.display = 'none';
            if (applyBtn) applyBtn.style.display = 'block';
        }
    }

    onSizeChange(axis, e) {
        if (!this.attachedObject || this.percentageMode) return;

        const value = parseFloat(e.target.value);
        if (isNaN(value) || value < 0.1) return;

        const dimensions = this.getObjectDimensions(this.attachedObject);
        dimensions[axis] = value;

        // Если включено равномерное масштабирование, обновляем все оси
        if (this.uniformScaling) {
            const ratio = value / dimensions[axis];
            dimensions.x *= ratio;
            dimensions.y *= ratio;
            dimensions.z *= ratio;

            // Обновляем поля ввода
            const sizeX = this.propertiesElement.querySelector('#scaleX');
            const sizeY = this.propertiesElement.querySelector('#scaleY');
            const sizeZ = this.propertiesElement.querySelector('#scaleZ');
            if (sizeX) sizeX.value = dimensions.x.toFixed(2);
            if (sizeY) sizeY.value = dimensions.y.toFixed(2);
            if (sizeZ) sizeZ.value = dimensions.z.toFixed(2);
        }

        this.updateObjectSize(dimensions, false);
    }

    onPercentChange(axis, e) {
        if (!this.attachedObject || !this.percentageMode) return;

        const value = parseFloat(e.target.value);
        if (isNaN(value) || value < 1) return;

        // Если включено равномерное масштабирование, обновляем все поля
        if (this.uniformScaling) {
            const percentX = this.propertiesElement.querySelector('#scalePercentX');
            const percentY = this.propertiesElement.querySelector('#scalePercentY');
            const percentZ = this.propertiesElement.querySelector('#scalePercentZ');

            if (percentX) percentX.value = value;
            if (percentY) percentY.value = value;
            if (percentZ) percentZ.value = value;
        }
    }

    applyPercentageScale() {
        if (!this.propertiesElement || !this.attachedObject || !this.percentageMode) return;

        const percentX = parseFloat(this.propertiesElement.querySelector('#scalePercentX').value);
        const percentY = parseFloat(this.propertiesElement.querySelector('#scalePercentY').value);
        const percentZ = parseFloat(this.propertiesElement.querySelector('#scalePercentZ').value);

        if (isNaN(percentX) || isNaN(percentY) || isNaN(percentZ) ||
            percentX < 1 || percentY < 1 || percentZ < 1) {
            this.editor.showStatus('Некорректные значения процентов', 'error');
            return;
        }

        // Получаем оригинальные размеры
        const originalSize = this.attachedObject.userData.originalSize ||
                             this.getObjectDimensions(this.attachedObject);

        // Вычисляем новые размеры
        const newDimensions = new THREE.Vector3(
            originalSize.x * (percentX / 100),
            originalSize.y * (percentY / 100),
            originalSize.z * (percentZ / 100)
        );

        // Сохраняем предыдущие размеры для истории
        const previousDimensions = this.getObjectDimensions(this.attachedObject);

        this.updateObjectSize(newDimensions, false);

        // Добавляем в историю
        this.editor.history.addAction({
            type: 'modify_size',
            object: this.attachedObject.uuid,
            data: {
                dimensions: newDimensions.toArray(),
                previousDimensions: previousDimensions.toArray()
            }
        });

        this.editor.showStatus(`Масштаб установлен: X:${percentX}%, Y:${percentY}%, Z:${percentZ}%`, 'success');
    }

    applySizeFromInputs() {
        if (!this.propertiesElement || !this.attachedObject || this.percentageMode) return;

        const sizeX = parseFloat(this.propertiesElement.querySelector('#scaleX').value);
        const sizeY = parseFloat(this.propertiesElement.querySelector('#scaleY').value);
        const sizeZ = parseFloat(this.propertiesElement.querySelector('#scaleZ').value);

        if (isNaN(sizeX) || isNaN(sizeY) || isNaN(sizeZ) ||
            sizeX < 0.1 || sizeY < 0.1 || sizeZ < 0.1) {
            this.editor.showStatus('Некорректные значения размеров', 'error');
            return;
        }

        const previousDimensions = this.getObjectDimensions(this.attachedObject);
        const newDimensions = new THREE.Vector3(sizeX, sizeY, sizeZ);

        this.updateObjectSize(newDimensions, true);

        this.editor.history.addAction({
            type: 'modify_size',
            object: this.attachedObject.uuid,
            data: {
                dimensions: newDimensions.toArray(),
                previousDimensions: previousDimensions.toArray()
            }
        });

        this.editor.showStatus(`Размеры установлены: ${sizeX}x${sizeY}x${sizeZ} мм`, 'success');
    }

    updatePropertiesValues() {
        if (!this.propertiesElement || !this.attachedObject) return;

        const dimensions = this.getObjectDimensions(this.attachedObject);
        const sizeX = this.propertiesElement.querySelector('#scaleX');
        const sizeY = this.propertiesElement.querySelector('#scaleY');
        const sizeZ = this.propertiesElement.querySelector('#scaleZ');
        const percentX = this.propertiesElement.querySelector('#scalePercentX');
        const percentY = this.propertiesElement.querySelector('#scalePercentY');
        const percentZ = this.propertiesElement.querySelector('#scalePercentZ');

        if (sizeX) sizeX.value = dimensions.x.toFixed(2);
        if (sizeY) sizeY.value = dimensions.y.toFixed(2);
        if (sizeZ) sizeZ.value = dimensions.z.toFixed(2);

        // Вычисляем проценты от исходного размера
        const originalSize = this.attachedObject.userData.originalSize || dimensions;
        if (percentX) percentX.value = Math.round((dimensions.x / originalSize.x) * 100);
        if (percentY) percentY.value = Math.round((dimensions.y / originalSize.y) * 100);
        if (percentZ) percentZ.value = Math.round((dimensions.z / originalSize.z) * 100);
    }

    updateObjectSize(newDimensions, updateHistory = true) {
        if (!this.attachedObject) return;

        // Получаем исходные размеры
        let originalSize;
        if (this.attachedObject.userData.originalSize) {
            originalSize = this.attachedObject.userData.originalSize;
        } else {
            // Первое изменение - сохраняем оригинальный размер
            originalSize = this.getObjectDimensions(this.attachedObject);
            this.attachedObject.userData.originalSize = originalSize.clone();
        }

        // Вычисляем новые масштабы
        const scaleX = newDimensions.x / originalSize.x;
        const scaleY = newDimensions.y / originalSize.y;
        const scaleZ = newDimensions.z / originalSize.z;

        // Применяем масштаб
        this.attachedObject.scale.set(scaleX, scaleY, scaleZ);

        // Обновляем гизмо
        this.updateGizmoPosition();

        // Сохраняем текущие размеры
        this.attachedObject.userData.currentSize = newDimensions.clone();

        // Обновляем UI
        this.updatePropertiesValues();

        // Добавляем в историю если нужно
        if (updateHistory && this.attachedObject.userData.transformStartState) {
            this.saveToHistory();
        }
    }

    getObjectDimensions(object) {
        if (!object) return new THREE.Vector3();

        // Используем сохраненные размеры если есть
        if (object.userData.currentSize) {
            return object.userData.currentSize.clone();
        }

        // Иначе вычисляем из bounding box
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);

        return size;
    }

    getTooltipContent() {
        if (!this.attachedObject) return '';

        const dimensions = this.getObjectDimensions(this.attachedObject);
        const percentage = this.percentageMode ?
            Math.round((dimensions.x / (this.attachedObject.userData.originalSize?.x || dimensions.x)) * 100) : 0;

        return `
            <div style="font-weight: 600; margin-bottom: 6px; color: #fff;">${this.percentageMode ? 'Масштаб' : 'Размеры'} (мм):</div>
            ${this.percentageMode ? `
                <div style="color: #ffd43b; font-size: 16px; text-align: center;">
                    ${percentage}%
                </div>
            ` : `
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                    <div style="color: #ff6b6b;">
                        <div style="font-size: 10px; opacity: 0.8;">Ширина (X)</div>
                        <div>${dimensions.x.toFixed(1)}</div>
                    </div>
                    <div style="color: #51cf66;">
                        <div style="font-size: 10px; opacity: 0.8;">Высота (Y)</div>
                        <div>${dimensions.y.toFixed(1)}</div>
                    </div>
                    <div style="color: #339af0;">
                        <div style="font-size: 10px; opacity: 0.8;">Глубина (Z)</div>
                        <div>${dimensions.z.toFixed(1)}</div>
                    </div>
                </div>
            `}
            <div style="margin-top: 8px; font-size: 10px; opacity: 0.7; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
                Режим: ${this.uniformScaling ? 'равномерный' : 'по осям'} |
                Ctrl: ${this.snapEnabled ? 'с привязкой' : 'без привязки'}
            </div>
        `;
    }

    createHistoryAction() {
        if (!this.attachedObject || !this.attachedObject.userData.transformStartState) return null;

        return {
            type: 'modify_scale',
            object: this.attachedObject.uuid,
            data: {
                scale: this.attachedObject.scale.toArray(),
                previousScale: this.attachedObject.userData.transformStartState.scale.toArray()
            }
        };
    }

    getHistoryActionType() {
        return 'modify_size';
    }
}