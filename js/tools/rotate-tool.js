class RotateTool extends TransformToolBase {
    constructor(editor) {
        super('rotate', 'fa-sync-alt', editor);
        this.startQuaternion = new THREE.Quaternion();
        this.useLocalCoordinates = false;
        this.accumulatedAngle = 0;
        this.gizmoWorldPosition = new THREE.Vector3();
        this.rotationPlane = null;
        this.startVector = null;
        this.hoveredArc = null;
        this.angleIndicator = null;
        this.currentAngle = 0;
        this.arcGeometries = {};
        this.halfSize = new THREE.Vector3();
        
        // Для поля ввода угла (аналогично move-tool)
        this._inputContainer = null;
        this._inputElement = null;
        this._isInputFocused = false;
        this._lastInputValue = 0;
        this._isDragging = false;
        this._currentDragAxis = null;

        this.initGizmo();
        this.initAngleInput();
    }

    initGizmo() {
        // Очищаем предыдущий gizmo
        while (this.gizmoGroup.children.length > 0) {
            const child = this.gizmoGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.gizmoGroup.remove(child);
        }

        this.createRotateGizmo();
        this.gizmoGroup.visible = false;
    }

    initAngleInput() {
        // Создаем контейнер для поля ввода
        this._inputContainer = document.createElement('div');
        this._inputContainer.className = 'distance-input-container';
        this._inputContainer.style.display = 'none';

        // Создаем поле ввода
        this._inputElement = document.createElement('input');
        this._inputElement.type = 'number';
        this._inputElement.step = '1';
        this._inputElement.value = '0';
        this._inputContainer.appendChild(this._inputElement);
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

        // Преобразуем градусы в радианы
        const angleRad = THREE.MathUtils.degToRad(value);

        // Создаем кватернион вращения
        const rotationQuaternion = new THREE.Quaternion();
        if (this._currentDragAxis === 'x') {
            rotationQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angleRad);
        } else if (this._currentDragAxis === 'y') {
            rotationQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleRad);
        } else if (this._currentDragAxis === 'z') {
            rotationQuaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angleRad);
        }

        // Применяем вращение
        if (this.useLocalCoordinates) {
            // Для локальных координат вращаем вокруг локальных осей
            this.attachedObject.quaternion.copy(this.startQuaternion);
            this.attachedObject.quaternion.multiply(rotationQuaternion);
        } else {
            // Для глобальных координат вращаем вокруг глобальных осей
            rotationQuaternion.multiply(this.startQuaternion);
            this.attachedObject.quaternion.copy(rotationQuaternion);
        }

        // Обновляем накопленный угол
        this.accumulatedAngle = angleRad;
        this.currentAngle = value;

        // Обновляем визуализацию
        this.updateGizmoPosition();
        this.updateAngleIndicator();
    }

    createRotateGizmo() {
        // Инициализируем arcGeometries если не инициализирован
        if (!this.arcGeometries) {
            this.arcGeometries = {};
        }

        const tubeRadius = 0.03;
        const segments = 32;
        const arcAngle = Math.PI / 3;

        // Создаем геометрии для каждой оси
        ['x', 'y', 'z'].forEach(axis => {
            // Создаем геометрию дуги
            const geometry = new THREE.TorusGeometry(1, tubeRadius, 6, segments, arcAngle);
            this.arcGeometries[axis] = geometry;

            const material = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });

            const arc = new THREE.Mesh(geometry, material);
            arc.name = `rotate_${axis}`;
            arc.userData.type = 'rotate';
            arc.userData.axis = axis;
            arc.userData.isArc = true;

            this.gizmoGroup.add(arc);
        });

        // Создаем индикатор угла
        this.createAngleIndicator();
    }

    createAngleIndicator() {
        const indicatorRadius = 1.3;
        const tubeRadius = 0.03;
        const segments = 32;

        const geometry = new THREE.TorusGeometry(indicatorRadius, tubeRadius, 6, segments, Math.PI * 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0xFFFF00,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        this.angleIndicator = new THREE.Mesh(geometry, material);
        this.angleIndicator.name = 'angle_indicator';
        this.angleIndicator.visible = false;

        this.gizmoGroup.add(this.angleIndicator);
    }

    updateGizmoPosition() {
        if (!this.attachedObject) return;

        // Получаем мировую позицию объекта
        const worldPos = new THREE.Vector3();
        this.attachedObject.getWorldPosition(worldPos);
        this.gizmoGroup.position.copy(worldPos);

        // Обновляем вращение gizmo в зависимости от системы координат
        if (this.useLocalCoordinates) {
            this.gizmoGroup.quaternion.copy(this.attachedObject.quaternion);
        } else {
            this.gizmoGroup.quaternion.identity();
        }

        // Получаем размеры объекта
        const box = new THREE.Box3().setFromObject(this.attachedObject);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Сохраняем половины размеров
        this.halfSize.copy(size).multiplyScalar(0.5);

        // Увеличиваем отступ от края объекта
        const offset = 1.5;

        // Обновляем позицию и масштаб каждой дуги
        ['x', 'y', 'z'].forEach(axis => {
            const arc = this.gizmoGroup.getObjectByName(`rotate_${axis}`);
            if (!arc) return;

            // Вычисляем радиус и позицию для каждой дуги
            let radius, position = new THREE.Vector3();

            if (axis === 'x') {
                radius = Math.max(this.halfSize.y, this.halfSize.z) + offset;
                position.set(this.halfSize.x + offset, 0, 0);
                arc.rotation.set(0, Math.PI / 2, 0);
            } else if (axis === 'y') {
                radius = Math.max(this.halfSize.x, this.halfSize.z) + offset;
                position.set(0, this.halfSize.y + offset, 0);
                arc.rotation.set(Math.PI / 2, 0, 0);
            } else if (axis === 'z') {
                radius = Math.max(this.halfSize.x, this.halfSize.y) + offset;
                position.set(0, 0, this.halfSize.z + offset);
                arc.rotation.set(0, 0, 0);
            }

            // Устанавливаем позицию и масштаб
            arc.position.copy(position);
            arc.scale.setScalar(12);

            // Обновляем материал при наведении
            if (this.hoveredArc === arc) {
                arc.material.color.set(0xFFFF00);
                arc.material.opacity = 1.0;
            } else {
                arc.material.color.set(this.axisColors[axis]);
                arc.material.opacity = 0.8;
            }
        });

        // Обновляем позицию индикатора угла
        if (this.angleIndicator && this.angleIndicator.visible && this.currentAxis) {
            this.updateAngleIndicator();
        }
    }

    updateAngleIndicator() {
        if (!this.angleIndicator || !this.currentAxis) return;

        const arc = this.gizmoGroup.getObjectByName(`rotate_${this.currentAxis}`);
        if (!arc) return;

        // Копируем позицию и масштаб от соответствующей дуги
        this.angleIndicator.position.copy(arc.position);
        this.angleIndicator.rotation.copy(arc.rotation);
        this.angleIndicator.scale.copy(arc.scale);

        // Обновляем цвет индикатора в зависимости от угла
        const normalizedAngle = Math.abs(this.currentAngle % 360);
        let hue = (normalizedAngle / 360) * 120;
        const color = new THREE.Color().setHSL(hue / 360, 0.9, 0.5);
        this.angleIndicator.material.color.copy(color);

        // Обновляем позицию поля ввода
        this.updateInputPosition();
    }

    updateInputPosition() {
        if (!this._inputContainer || !this.angleIndicator || !this.angleIndicator.visible) return;

        // Получаем позицию индикатора в мировых координатах
        const indicatorWorldPos = new THREE.Vector3();
        this.angleIndicator.getWorldPosition(indicatorWorldPos);

        // Преобразуем мировые координаты в экранные
        const screenPos = this.worldToScreen(indicatorWorldPos, this.editor.camera, this.editor.renderer);

        // Позиционируем контейнер рядом с индикатором
        this._inputContainer.style.left = `${screenPos.x - 60}px`;
        this._inputContainer.style.top = `${screenPos.y + 30}px`;
    }

    worldToScreen(position, camera, renderer) {
        const vector = position.clone();
        vector.project(camera);

        const x = (vector.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (vector.y * -0.5 + 0.5) * renderer.domElement.clientHeight;

        return { x, y };
    }

    getPropertiesHTML() {
        console.log('RotateTool: создание HTML свойств');
        return `
            <div class="property-group" data-type="rotate-rotation">
                <h4><i class="fas fa-sync-alt"></i> Вращение</h4>

                <div class="property-row">
                    <label>Локальные координаты:</label>
                    <input type="checkbox" id="localCoordinates" ${this.useLocalCoordinates ? 'checked' : ''}>
                </div>

                <div class="property-row">
                    <label>X (°):</label>
                    <input type="number" id="rotateX" step="any" value="0">
                </div>
                <div class="property-row">
                    <label>Y (°):</label>
                    <input type="number" id="rotateY" step="any" value="0">
                </div>
                <div class="property-row">
                    <label>Z (°):</label>
                    <input type="number" id="rotateZ" step="any" value="0">
                </div>
                <div class="property-row">
                    <button id="applyRotation" class="btn-small">
                        <i class="fas fa-check"></i> Применить вращение
                    </button>
                </div>
            </div>
        `;
    }

    bindPropertiesEvents() {
        if (!this.propertiesElement) {
            console.log('RotateTool: propertiesElement отсутствует');
            return;
        }

        console.log('RotateTool: привязка событий');

        const rotX = this.propertiesElement.querySelector('#rotateX');
        const rotY = this.propertiesElement.querySelector('#rotateY');
        const rotZ = this.propertiesElement.querySelector('#rotateZ');
        const applyBtn = this.propertiesElement.querySelector('#applyRotation');
        const localCoordsCheckbox = this.propertiesElement.querySelector('#localCoordinates');

        if (rotX) {
            rotX.addEventListener('change', (e) => this.onRotationChange('x', e));
            rotX.addEventListener('input', (e) => this.onRotationChange('x', e));
        }
        if (rotY) {
            rotY.addEventListener('change', (e) => this.onRotationChange('y', e));
            rotY.addEventListener('input', (e) => this.onRotationChange('y', e));
        }
        if (rotZ) {
            rotZ.addEventListener('change', (e) => this.onRotationChange('z', e));
            rotZ.addEventListener('input', (e) => this.onRotationChange('z', e));
        }
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyRotationFromInputs());
        }
        if (localCoordsCheckbox) {
            localCoordsCheckbox.checked = this.useLocalCoordinates;
            localCoordsCheckbox.addEventListener('change', (e) => {
                this.useLocalCoordinates = e.target.checked;
                this.updateGizmoPosition();
            });
        }
    }

    onRotationChange(axis, e) {
        if (!this.attachedObject) return;

        const value = parseFloat(e.target.value);
        if (isNaN(value)) return;

        const euler = new THREE.Euler().setFromQuaternion(this.attachedObject.quaternion, 'XYZ');
        euler[axis] = THREE.MathUtils.degToRad(value);

        this.attachedObject.quaternion.setFromEuler(euler);
        this.updateGizmoPosition();
    }

    applyRotationFromInputs() {
        if (!this.propertiesElement || !this.attachedObject) return;

        const rotX = parseFloat(this.propertiesElement.querySelector('#rotateX').value);
        const rotY = parseFloat(this.propertiesElement.querySelector('#rotateY').value);
        const rotZ = parseFloat(this.propertiesElement.querySelector('#rotateZ').value);

        if (isNaN(rotX) || isNaN(rotY) || isNaN(rotZ)) {
            this.editor.showStatus('Некорректные значения вращения', 'error');
            return;
        }

        const previousRotation = this.attachedObject.quaternion.clone();
        const euler = new THREE.Euler(
            THREE.MathUtils.degToRad(rotX),
            THREE.MathUtils.degToRad(rotY),
            THREE.MathUtils.degToRad(rotZ)
        );

        this.attachedObject.quaternion.setFromEuler(euler);
        this.updateGizmoPosition();

        this.editor.history.addAction({
            type: 'modify_rotation',
            object: this.attachedObject.uuid,
            data: {
                rotation: euler.toArray(),
                previousRotation: new THREE.Euler().setFromQuaternion(previousRotation, 'XYZ').toArray()
            }
        });

        this.editor.showStatus(`Вращение установлено: ${rotX}°, ${rotY}°, ${rotZ}°`, 'success');
    }

    updatePropertiesValues() {
        if (!this.propertiesElement || !this.attachedObject) return;

        const rotX = this.propertiesElement.querySelector('#rotateX');
        const rotY = this.propertiesElement.querySelector('#rotateY');
        const rotZ = this.propertiesElement.querySelector('#rotateZ');

        const euler = new THREE.Euler().setFromQuaternion(this.attachedObject.quaternion, 'XYZ');

        if (rotX) rotX.value = THREE.MathUtils.radToDeg(euler.x).toFixed(2);
        if (rotY) rotY.value = THREE.MathUtils.radToDeg(euler.y).toFixed(2);
        if (rotZ) rotZ.value = THREE.MathUtils.radToDeg(euler.z).toFixed(2);
    }

    onMouseDown(e) {
        if (e.button !== 0) return false;

        this.snapEnabled = !e.ctrlKey;
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Проверяем, кликнули ли на дугу
        const gizmoMeshes = [];
        this.gizmoGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.isArc) {
                gizmoMeshes.push(child);
            }
        });

        const intersects = this.editor.raycaster.intersectObjects(gizmoMeshes, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;
            const axis = object.userData.axis;

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

        // Обработка наведения на дуги
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const gizmoMeshes = [];
        this.gizmoGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.isArc) {
                gizmoMeshes.push(child);
            }
        });

        const intersects = this.editor.raycaster.intersectObjects(gizmoMeshes, true);

        // Сбрасываем подсветку предыдущей дуги
        if (this.hoveredArc && this.hoveredArc.userData && this.hoveredArc.userData.axis) {
            const axis = this.hoveredArc.userData.axis;
            this.hoveredArc.material.color.set(this.axisColors[axis]);
            this.hoveredArc.material.opacity = 0.8;
            this.hoveredArc = null;
        }

        // Подсвечиваем новую дугу при наведении
        if (intersects.length > 0) {
            const object = intersects[0].object;
            this.hoveredArc = object;
            object.material.color.set(0xFFFF00);
            object.material.opacity = 1.0;
        }
    }

    startDragging(axis, e) {
        super.startDragging(axis, e);

        if (this.attachedObject) {
            // Сохраняем начальное вращение
            this.startQuaternion.copy(this.attachedObject.quaternion);
            this.accumulatedAngle = 0;
            this.currentAngle = 0;
            this._currentDragAxis = axis;
            this._isDragging = true;

            // Получаем мировую позицию Gizmo
            this.gizmoGroup.getWorldPosition(this.gizmoWorldPosition);

            // Определяем ось вращения
            this.rotationAxis = new THREE.Vector3();
            if (axis === 'x') this.rotationAxis.set(1, 0, 0);
            else if (axis === 'y') this.rotationAxis.set(0, 1, 0);
            else if (axis === 'z') this.rotationAxis.set(0, 0, 1);

            // Для локальных координат: ось вращения должна быть в локальных координатах объекта
            if (this.useLocalCoordinates) {
                this.rotationAxis.applyQuaternion(this.attachedObject.quaternion);
            }

            // Создаем плоскость вращения
            this.rotationPlane = new THREE.Plane();
            this.rotationPlane.setFromNormalAndCoplanarPoint(
                this.rotationAxis.clone().normalize(),
                this.gizmoWorldPosition
            );

            // Получаем начальную точку на плоскости
            this.startProjection = this.getPlaneIntersection(e);
            if (this.startProjection) {
                this.startVector = new THREE.Vector3().subVectors(
                    this.startProjection,
                    this.gizmoWorldPosition
                ).normalize();
            }

            // Показываем индикатор угла и поле ввода
            if (this.angleIndicator) {
                this.angleIndicator.visible = true;
                this.updateAngleIndicator();
            }

            // Настраиваем поле ввода
            if (this._inputContainer) {
                this._inputContainer.style.display = 'block';
                this._inputElement.value = '0.0';

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

    getPlaneIntersection(e) {
        if (!this.rotationPlane) return null;

        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.editor.camera);

        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(this.rotationPlane, intersection)) {
            return intersection;
        }
        return null;
    }

    handleTransform(deltaX, deltaY) {
        if (!this.attachedObject || !this.currentAxis || !this.rotationPlane || !this.startVector) return;

        // Обновляем позицию мыши
        const currentMouseX = this.startMouse.x + deltaX;
        const currentMouseY = this.startMouse.y + deltaY;
        const currentMouse = { clientX: currentMouseX, clientY: currentMouseY };

        // Получаем текущую точку на плоскости
        const currentIntersection = this.getPlaneIntersection(currentMouse);
        if (!currentIntersection) return;

        // Вычисляем текущий вектор
        const currentVector = new THREE.Vector3().subVectors(
            currentIntersection,
            this.gizmoWorldPosition
        ).normalize();

        // Вычисляем угол между векторами
        const dot = this.startVector.dot(currentVector);
        const cross = new THREE.Vector3().crossVectors(this.startVector, currentVector);

        // Вычисляем угол с учетом направления
        const angle = Math.atan2(cross.dot(this.rotationAxis), dot);

        // Применяем привязку к сетке
        let finalAngle = angle;
        if (this.snapEnabled && !this.editor.spacePressed) {
            const angleDeg = THREE.MathUtils.radToDeg(angle);
            const snappedDeg = Math.round(angleDeg / this.rotateSnapValue) * this.rotateSnapValue;
            finalAngle = THREE.MathUtils.degToRad(snappedDeg);
        }

        if (Math.abs(finalAngle) < 0.001) return;

        // Накопление угла
        this.accumulatedAngle += finalAngle;
        this.currentAngle = THREE.MathUtils.radToDeg(this.accumulatedAngle);

        if (this.useLocalCoordinates) {
            // Локальные координаты
            let localAxis = new THREE.Vector3();
            if (this.currentAxis === 'x') localAxis.set(1, 0, 0);
            else if (this.currentAxis === 'y') localAxis.set(0, 1, 0);
            else if (this.currentAxis === 'z') localAxis.set(0, 0, 1);

            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromAxisAngle(localAxis.normalize(), this.accumulatedAngle);

            this.attachedObject.quaternion.copy(this.startQuaternion);
            this.attachedObject.quaternion.multiply(rotationQuaternion);
        } else {
            // Глобальные координаты
            let globalAxis = new THREE.Vector3();
            if (this.currentAxis === 'x') globalAxis.set(1, 0, 0);
            else if (this.currentAxis === 'y') globalAxis.set(0, 1, 0);
            else if (this.currentAxis === 'z') globalAxis.set(0, 0, 1);

            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromAxisAngle(globalAxis.normalize(), this.accumulatedAngle);

            this.attachedObject.quaternion.copy(rotationQuaternion);
            this.attachedObject.quaternion.multiply(this.startQuaternion);
        }

        // Обновляем начальный вектор для следующего шага
        this.startVector.copy(currentVector);

        // Обновляем индикатор угла и поле ввода
        this.updateAngleIndicator();

        // Обновляем значение в поле ввода (если фокус не в поле ввода)
        if (!this._isInputFocused && this._inputElement) {
            this._inputElement.value = this.currentAngle.toFixed(1);
        }
    }

    onMouseUp(e) {
        super.onMouseUp(e);

        this._isDragging = false;

        // Скрываем индикатор угла, но оставляем поле ввода
        if (this.angleIndicator) {
            this.angleIndicator.visible = false;
        }
    }

    detach() {
        // Скрываем поле ввода при откреплении объекта
        if (this._inputContainer) {
            this._inputContainer.style.display = 'none';
        }

        // Скрываем индикатор угла
        if (this.angleIndicator) {
            this.angleIndicator.visible = false;
        }

        this._currentDragAxis = null;
        this._isDragging = false;
        this.hoveredArc = null;

        super.detach();
    }

    onDeactivate() {
        // Скрываем поле ввода и индикатор при деактивации инструмента
        if (this._inputContainer) {
            this._inputContainer.style.display = 'none';
        }

        if (this.angleIndicator) {
            this.angleIndicator.visible = false;
        }

        this._currentDragAxis = null;
        this._isDragging = false;
        this.hoveredArc = null;
        
        super.onDeactivate();
    }

    getTooltipContent() {
        if (!this.attachedObject) return '';

        const euler = new THREE.Euler().setFromQuaternion(this.attachedObject.quaternion, 'XYZ');
        const degX = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
        const degY = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
        const degZ = THREE.MathUtils.radToDeg(euler.z).toFixed(1);

        return `
            <div style="font-weight: 600; margin-bottom: 6px; color: #fff;">Вращение объекта (°):</div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <div style="color: #ff6b6b;">
                    <div style="font-size: 10px; opacity: 0.8;">X</div>
                    <div>${degX}</div>
                </div>
                <div style="color: #51cf66;">
                    <div style="font-size: 10px; opacity: 0.8;">Y</div>
                    <div>${degY}</div>
                </div>
                <div style="color: #339af0;">
                    <div style="font-size: 10px; opacity: 0.8;">Z</div>
                    <div>${degZ}</div>
                </div>
            </div>
            <div style="margin-top: 8px; font-size: 10px; opacity: 0.7; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
                Режим: ${this.useLocalCoordinates ? 'локальные' : 'глобальные'} |
                Ctrl: ${this.snapEnabled ? 'с привязкой' : 'без привязки'}
            </div>
        `;
    }

    createHistoryAction() {
        if (!this.attachedObject || !this.attachedObject.userData.transformStartState) return null;

        const currentEuler = new THREE.Euler().setFromQuaternion(this.attachedObject.quaternion, 'XYZ');
        const previousEuler = new THREE.Euler().setFromQuaternion(
            this.attachedObject.userData.transformStartState.rotation,
            'XYZ'
        );

        return {
            type: 'modify_rotation',
            object: this.attachedObject.uuid,
            data: {
                rotation: currentEuler.toArray(),
                previousRotation: previousEuler.toArray()
            }
        };
    }

    getHistoryActionType() {
        return 'modify_rotation';
    }
}