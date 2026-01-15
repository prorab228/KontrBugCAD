class MoveTool extends TransformToolBase {
    constructor(editor) {
        super('move', 'fa-arrows-alt', editor);
        this.useLocalCoordinates = false;

        // Для визуализации перемещения
        this.moveLine = null;
        this.moveLineGeometry = null;
        this.moveLineMaterial = null;
        this.distanceInput = null;

        this.startWorldPosition = new THREE.Vector3();
        this.showMoveLine = true;
        this.lineThickness = 0.3;

        // Размеры стрелок
        this.arrowBaseLength = 7.0;
        this.arrowHeadBaseLength = 1.5;
        this.arrowHeadBaseRadius = 1;
        this.lineBaseRadius = 0.05;
        this.minArrowLength = 2.0;
        this.arrowOffset = 2.0;

        // Ссылки на созданные стрелки
        this.axisArrows = {
            x: { line: null, cone: null, group: null, axis: 'x', positive: true },
            y: { line: null, cone: null, group: null, axis: 'y', positive: true },
            z: { line: null, cone: null, group: null, axis: 'z', positive: true },
            nx: { line: null, cone: null, group: null, axis: 'x', positive: false },
            ny: { line: null, cone: null, group: null, axis: 'y', positive: false },
            nz: { line: null, cone: null, group: null, axis: 'z', positive: false }
        };

        // Для подсветки при наведении
        this.hoveredAxis = null;

        // Для оптимизации
        this.lastDistance = 0;
        this.lastDragAxis = null;
        this.frameCount = 0;
        this.updateInterval = 3;
        this.minDistanceChange = 0.5;
        this.cachedVectors = {
            currentWorldPos: new THREE.Vector3(),
            midPoint: new THREE.Vector3(),
            direction: new THREE.Vector3(),
            cameraDirection: new THREE.Vector3(),
            perpDirection: new THREE.Vector3(),
            objectCenter: new THREE.Vector3()
        };

        // DOM элементы для ввода
        this._inputContainer = null;
        this._inputElement = null;
        this._inputValue = null;
        this._isInputFocused = false;
        this._lastInputDistance = 0;
        this._isDragging = false;
        this._currentDragAxis = null;
        this._currentDragPositive = null;

        this.initGizmo();
        this._moveLinesInitialized = false;
    }

    initGizmo() {
        while (this.gizmoGroup.children.length > 0) {
            const child = this.gizmoGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.gizmoGroup.remove(child);
        }

        this.createTranslateGizmo();
        this.gizmoGroup.visible = false;
        this.initMoveLine();
    }

    initMoveLine() {
        if (this._moveLinesInitialized) return;

        this.moveLineGeometry = new THREE.CylinderBufferGeometry(
            this.lineThickness / 2,
            this.lineThickness / 2,
            1,
            6,
            1,
            false
        );

        this.moveLineMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: true
        });

        this.moveLine = new THREE.Mesh(this.moveLineGeometry, this.moveLineMaterial);
        this.moveLine.name = 'move_tool_line';
        this.moveLine.visible = false;
        this.moveLine.renderOrder = 999;
        this.moveLine.userData.isMoveToolLine = true;

        this.editor.scene.add(this.moveLine);

        // Инициализируем поле ввода
        this.initDistanceInput();

        this._moveLinesInitialized = true;
    }

    initDistanceInput() {
        // Создаем контейнер для поля ввода
        this._inputContainer = document.createElement('div');
        this._inputContainer.className = 'distance-input-container';

        // Создаем поле ввода
        this._inputElement = document.createElement('input');
        this._inputElement.type = 'number';
        this._inputElement.step = '0.1';
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
            // Динамическое обновление при вводе
            const value = parseFloat(e.target.value);
            if (!isNaN(value)) {
                this.updateFromInput(value);
            }
        });
    }


    updateFromInput(value) {
        if (!this.attachedObject || !this._currentDragAxis || !this._currentDragPositive) return;

        // Сохраняем начальное состояние для истории
        if (!this.attachedObject.userData.transformStartState) {
            this.attachedObject.userData.transformStartState = {
                position: this.attachedObject.position.clone(),
                rotation: this.attachedObject.rotation.clone(),
                scale: this.attachedObject.scale.clone()
            };
        }

        // ВАЖНО: Учитываем направление перемещения
        const direction = this._currentDragPositive ? 1 : -1;
        const signedValue = value * direction;

        // Вычисляем вектор перемещения с учетом направления
        const axisVector = this.getAxisVector(this._currentDragAxis, true); // Всегда получаем положительный вектор
        const moveVector = axisVector.clone().multiplyScalar(signedValue);

        // Применяем перемещение
        this.attachedObject.position.copy(this.startPosition).add(moveVector);

        // Обновляем визуализацию
        this.moveDelta.copy(moveVector);
        this.updateGizmoPosition();

        // Обновляем линию
        if (this.moveLine && this.moveLine.visible) {
            this.updateLineTransform(this.startWorldPosition, this.attachedObject.getWorldPosition(new THREE.Vector3()));
        }
    }

    createTranslateGizmo() {
        this.axisArrows = {
            x: { line: null, cone: null, group: null, axis: 'x', positive: true },
            y: { line: null, cone: null, group: null, axis: 'y', positive: true },
            z: { line: null, cone: null, group: null, axis: 'z', positive: true },
            nx: { line: null, cone: null, group: null, axis: 'x', positive: false },
            ny: { line: null, cone: null, group: null, axis: 'y', positive: false },
            nz: { line: null, cone: null, group: null, axis: 'z', positive: false }
        };

        this.createAxisArrow('x', true);
        this.createAxisArrow('y', true);
        this.createAxisArrow('z', true);

        this.createAxisArrow('x', false);
        this.createAxisArrow('y', false);
        this.createAxisArrow('z', false);
    }

    createAxisArrow(axis, positive) {
        const key = positive ? axis : `n${axis}`;
        const sign = positive ? 1 : -1;
        const baseColor = this.axisColors[axis];

        const axisGroup = new THREE.Group();
        axisGroup.name = `translate_${key}`;
        axisGroup.userData.type = 'translate';
        axisGroup.userData.axis = axis;
        axisGroup.userData.positive = positive;
        axisGroup.userData.key = key;

        this.axisArrows[key].group = axisGroup;

        const lineGeometry = new THREE.CylinderBufferGeometry(
            this.lineBaseRadius,
            this.lineBaseRadius,
            this.arrowBaseLength,
            6
        );
        const lineMaterial = new THREE.MeshBasicMaterial({
            color: baseColor,
            transparent: true,
            opacity: 0.8
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.name = `translate_line_${key}`;
        line.userData.axis = axis;
        line.userData.positive = positive;
        line.userData.key = key;
        this.axisArrows[key].line = line;

        const coneGeometry = new THREE.ConeBufferGeometry(
            this.arrowHeadBaseRadius,
            this.arrowHeadBaseLength,
            6
        );
        const coneMaterial = new THREE.MeshBasicMaterial({
            color: baseColor,
            transparent: true,
            opacity: 0.8
        });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.name = `translate_cone_${key}`;
        cone.userData.axis = axis;
        cone.userData.positive = positive;
        cone.userData.key = key;
        this.axisArrows[key].cone = cone;

        if (axis === 'x') {
            line.rotation.z = -Math.PI / 2;
            line.position.x = sign * this.arrowBaseLength / 2;

            if (positive) {
                cone.rotation.z = -Math.PI / 2;
                cone.position.x = this.arrowBaseLength + this.arrowHeadBaseLength / 2;
            } else {
                cone.rotation.z = Math.PI / 2;
                cone.position.x = -this.arrowBaseLength - this.arrowHeadBaseLength / 2;
            }

        } else if (axis === 'y') {
            line.position.y = sign * this.arrowBaseLength / 2;

            if (positive) {
                cone.rotation.x = 0;
                cone.position.y = this.arrowBaseLength + this.arrowHeadBaseLength / 2;
            } else {
                cone.rotation.x = Math.PI;
                cone.position.y = -this.arrowBaseLength - this.arrowHeadBaseLength / 2;
            }

        } else if (axis === 'z') {
            line.rotation.x = Math.PI / 2;
            line.position.z = sign * this.arrowBaseLength / 2;

            if (positive) {
                cone.rotation.x = Math.PI / 2;
                cone.position.z = this.arrowBaseLength + this.arrowHeadBaseLength / 2;
            } else {
                cone.rotation.x = -Math.PI / 2;
                cone.position.z = -this.arrowBaseLength - this.arrowHeadBaseLength / 2;
            }
        }

        axisGroup.add(line);
        axisGroup.add(cone);
        this.gizmoGroup.add(axisGroup);
    }

    onActivate() {
        super.onActivate();

        if (!this._moveLinesInitialized) {
            this.initMoveLine();
        }

        this.ensureCleanScene();

        // Если есть выделенный объект, показываем gizmo
        if (this.editor.selectedObjects.length === 1) {
            this.attachToObject(this.editor.selectedObjects[0]);
        }
    }

    ensureCleanScene() {
        const scene = this.editor.scene;
        const dragLines = [];
        scene.traverse((child) => {
            if (child.name && (child.name.includes('drag_line') ||
                child.name.includes('drag_text'))) {
                dragLines.push(child);
            }
        });

        dragLines.forEach(line => {
            if (line.parent) {
                line.parent.remove(line);
            }
        });
    }

    getPropertiesHTML() {
        return `
            <div class="property-group" data-type="move-position">
                <h4><i class="fas fa-arrows-alt"></i> Позиция (мм)</h4>

                <div class="property-row">
                    <label>Локальные координаты:</label>
                    <input type="checkbox" id="localCoordinates" ${this.useLocalCoordinates ? 'checked' : ''}>
                </div>

                <div class="property-row">
                    <label>Показывать линию перемещения:</label>
                    <input type="checkbox" id="showMoveLine" ${this.showMoveLine ? 'checked' : ''}>
                </div>

                <div class="property-row">
                    <label>Толщина линии:</label>
                    <input type="range" id="lineThickness" min="0.1" max="2" step="0.1" value="${this.lineThickness}">
                    <span id="thicknessValue">${this.lineThickness.toFixed(1)}</span>
                </div>

                <div class="property-row">
                    <label>X:</label>
                    <input type="number" id="movePosX" step="any" value="0">
                </div>
                <div class="property-row">
                    <label>Y:</label>
                    <input type="number" id="movePosY" step="any" value="0">
                </div>
                <div class="property-row">
                    <label>Z:</label>
                    <input type="number" id="movePosZ" step="any" value="0">
                </div>
                <div class="property-row">
                    <button id="applyMovePosition" class="btn-small">
                        <i class="fas fa-check"></i> Применить позицию
                    </button>
                </div>
            </div>
        `;
    }

    bindPropertiesEvents() {
        if (!this.propertiesElement) return;

        const posX = this.propertiesElement.querySelector('#movePosX');
        const posY = this.propertiesElement.querySelector('#movePosY');
        const posZ = this.propertiesElement.querySelector('#movePosZ');
        const applyBtn = this.propertiesElement.querySelector('#applyMovePosition');
        const localCoordsCheckbox = this.propertiesElement.querySelector('#localCoordinates');
        const showMoveLineCheckbox = this.propertiesElement.querySelector('#showMoveLine');
        const thicknessSlider = this.propertiesElement.querySelector('#lineThickness');
        const thicknessValue = this.propertiesElement.querySelector('#thicknessValue');

        if (posX) {
            posX.addEventListener('change', (e) => this.onPositionChange('x', e));
            posX.addEventListener('input', (e) => this.onPositionChange('x', e));
        }
        if (posY) {
            posY.addEventListener('change', (e) => this.onPositionChange('y', e));
            posY.addEventListener('input', (e) => this.onPositionChange('y', e));
        }
        if (posZ) {
            posZ.addEventListener('change', (e) => this.onPositionChange('z', e));
            posZ.addEventListener('input', (e) => this.onPositionChange('z', e));
        }
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyPositionFromInputs());
        }
        if (localCoordsCheckbox) {
            localCoordsCheckbox.checked = this.useLocalCoordinates;
            localCoordsCheckbox.addEventListener('change', (e) => {
                this.useLocalCoordinates = e.target.checked;
                this.updateGizmoPosition();
            });
        }
        if (showMoveLineCheckbox) {
            showMoveLineCheckbox.checked = this.showMoveLine;
            showMoveLineCheckbox.addEventListener('change', (e) => {
                this.showMoveLine = e.target.checked;
                if (!this.showMoveLine) {
                    this.hideMoveLine();
                }
            });
        }
        if (thicknessSlider) {
            thicknessSlider.value = this.lineThickness;
            thicknessSlider.addEventListener('input', (e) => {
                this.lineThickness = parseFloat(e.target.value);
                if (thicknessValue) {
                    thicknessValue.textContent = this.lineThickness.toFixed(1);
                }
                if (this.moveLine && this.moveLine.visible) {
                    this.updateLineThickness();
                }
            });
        }
    }

    updateLineThickness() {
        if (!this.moveLine || !this.moveLine.geometry) return;

        const geometry = this.moveLine.geometry;
        const radius = this.lineThickness / 2;

        const positions = geometry.attributes.position.array;
        const vertexCount = positions.length / 3;

        for (let i = 0; i < vertexCount; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];

            if (Math.abs(x) > 0.001 || Math.abs(y) > 0.001) {
                const angle = Math.atan2(y, x);
                positions[i * 3] = Math.cos(angle) * radius;
                positions[i * 3 + 1] = Math.sin(angle) * radius;
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeBoundingSphere();
    }

    hideMoveLine() {
        if (this.moveLine) {
            this.moveLine.visible = false;
        }
        if (this._inputContainer) {
            this._inputContainer.style.display = 'none';
        }
    }

    clearMoveLine() {
        this.hideMoveLine();
        this._currentDragAxis = null;
        this._currentDragPositive = null;
        this._isDragging = false;
    }

    onPositionChange(axis, e) {
        if (!this.attachedObject) return;

        const value = parseFloat(e.target.value);
        if (isNaN(value)) return;

        this.hideMoveLine();
        this.attachedObject.position[axis] = value;
        this.updateGizmoPosition();
    }

    applyPositionFromInputs() {
        if (!this.propertiesElement || !this.attachedObject) return;

        const posX = parseFloat(this.propertiesElement.querySelector('#movePosX').value);
        const posY = parseFloat(this.propertiesElement.querySelector('#movePosY').value);
        const posZ = parseFloat(this.propertiesElement.querySelector('#movePosZ').value);

        if (isNaN(posX) || isNaN(posY) || isNaN(posZ)) {
            this.editor.showStatus('Некорректные значения позиции', 'error');
            return;
        }

        this.hideMoveLine();
        const previousPosition = this.attachedObject.position.clone();
        this.attachedObject.position.set(posX, posY, posZ);
        this.updateGizmoPosition();

        this.editor.history.addAction({
            type: 'modify_position',
            object: this.attachedObject.uuid,
            data: {
                position: this.attachedObject.position.toArray(),
                previousPosition: previousPosition.toArray()
            }
        });

        this.editor.showStatus(`Позиция установлена: ${posX}, ${posY}, ${posZ}`, 'success');
    }

    updatePropertiesValues() {
        if (!this.propertiesElement || !this.attachedObject) return;

        const posX = this.propertiesElement.querySelector('#movePosX');
        const posY = this.propertiesElement.querySelector('#movePosY');
        const posZ = this.propertiesElement.querySelector('#movePosZ');

        if (posX) posX.value = this.attachedObject.position.x.toFixed(2);
        if (posY) posY.value = this.attachedObject.position.y.toFixed(2);
        if (posZ) posZ.value = this.attachedObject.position.z.toFixed(2);
    }

    onMouseDown(e) {
        if (e.button !== 0) return false;

        this.snapEnabled = !e.ctrlKey;
        this.editor.updateMousePosition(e);
        this.lastMousePosition.copy(this.editor.mouse);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const gizmoMeshes = [];
        this.gizmoGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                gizmoMeshes.push(child);
            }
        });

        const intersects = this.editor.raycaster.intersectObjects(gizmoMeshes, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;
            let axis = null;
            let positive = true;

            let current = object;
            while (current && !axis) {
                if (current.userData && current.userData.axis) {
                    axis = current.userData.axis;
                    positive = current.userData.positive;
                    break;
                }
                current = current.parent;
            }

            if (axis) {
                const axisKey = positive ? axis : `n${axis}`;
                this.startDragging(axisKey, e);
                return true;
            }
        }

        const sceneIntersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (sceneIntersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(sceneIntersects[0].object);

            if (this.canTransformObject(object)) {
                // Скрываем предыдущие линии при выборе нового объекта
                this.clearMoveLine();

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

        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const gizmoMeshes = [];
        this.gizmoGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.axis) {
                gizmoMeshes.push(child);
            }
        });

        const intersects = this.editor.raycaster.intersectObjects(gizmoMeshes, true);

        if (this.hoveredAxis) {
            this.hoveredAxis = null;
        }

        if (intersects.length > 0) {
            const object = intersects[0].object;
            this.hoveredAxis = object.userData.key;
        }

        this.updateGizmoPosition();
    }

    startDragging(axisKey, e) {
        super.startDragging(axisKey, e);

        if (this.attachedObject) {
            this._isDragging = true;
            this.moveDelta.set(0, 0, 0);

            let axis, positive;
            if (axisKey.startsWith('n')) {
                axis = axisKey.substring(1);
                positive = false;
            } else {
                axis = axisKey;
                positive = true;
            }

            this._currentDragAxis = axis;
            this._currentDragPositive = positive;

            this.currentAxisVector = this.getAxisVector(axis, positive);

            const cameraDirection = this.editor.camera.getWorldDirection(new THREE.Vector3());
            let planeNormal;

            if (axis === 'x') planeNormal = new THREE.Vector3(0, 1, 0);
            else if (axis === 'y') planeNormal = new THREE.Vector3(0, 0, 1);
            else if (axis === 'z') planeNormal = new THREE.Vector3(1, 0, 0);

            if (planeNormal) {
                this.dragPlane = new THREE.Plane();
                this.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, this.gizmoGroup.position);
            }

            this.attachedObject.getWorldPosition(this.startWorldPosition);

            this.dragAxis = axis;
            this.dragPositive = positive;
            this.lastDragAxis = `${axis}${positive ? '+' : '-'}`;

            this.setupMoveLine();
        }
    }

    setupMoveLine() {
        if (!this.moveLine || !this.showMoveLine) return;

        this.moveLine.visible = true;

        if (this.dragAxis === 'x') {
            this.moveLineMaterial.color.setHex(0xff4444);
            this._inputContainer.style.borderColor = '#ff4444';
        } else if (this.dragAxis === 'y') {
            this.moveLineMaterial.color.setHex(0x44ff44);
            this._inputContainer.style.borderColor = '#44ff44';
        } else if (this.dragAxis === 'z') {
            this.moveLineMaterial.color.setHex(0x4444ff);
            this._inputContainer.style.borderColor = '#4444ff';
        }

        this.frameCount = 0;
        this.lastDistance = 0;
        this._lastInputDistance = 0;

        // Сбрасываем значение в поле ввода
        if (this._inputElement) {
            this._inputElement.value = '0.0';
        }
    }

    updateLineTransform(startPos, endPos) {
        if (!this.moveLine || !this.moveLine.visible) return;

        const { midPoint, direction } = this.cachedVectors;

        midPoint.addVectors(startPos, endPos).multiplyScalar(0.5);
        const distance = startPos.distanceTo(endPos);
        direction.subVectors(endPos, startPos).normalize();

        this.moveLine.position.copy(midPoint);
        this.moveLine.scale.set(1, distance, 1);

        if (direction.length() > 0) {
            this.moveLine.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction
            );
        }

        this.updateDistanceInput(midPoint, distance, direction);
    }

    updateDistanceInput(position, distance, direction) {
        if (!this._inputContainer || this._isInputFocused) return;

        if (distance < 0.1) {
            this._inputContainer.style.display = 'none';
            return;
        }

        this.frameCount++;

        // ВАЖНО: Вычисляем знаковое расстояние с учетом направления
        let signedDistance = distance;

        // Проверяем направление перемещения относительно начальной позиции
        if (this.attachedObject && this._currentDragAxis) {
            const currentWorldPos = this.attachedObject.getWorldPosition(new THREE.Vector3());
            const startPos = this.startWorldPosition;

            if (this._currentDragAxis === 'x') {
                signedDistance = currentWorldPos.x - startPos.x;
            } else if (this._currentDragAxis === 'y') {
                signedDistance = currentWorldPos.y - startPos.y;
            } else if (this._currentDragAxis === 'z') {
                signedDistance = currentWorldPos.z - startPos.z;
            }
        }

        const shouldUpdate = this.frameCount % this.updateInterval === 0 ||
            Math.abs(signedDistance - this.lastDistance) > this.minDistanceChange ||
            this.dragAxis !== this.lastDragAxis;

        if (shouldUpdate) {
            this.lastDistance = signedDistance;
            this.lastDragAxis = this.dragAxis;
            this._lastInputDistance = signedDistance;

            // Показываем знаковое значение
            this._inputElement.value = signedDistance.toFixed(1);
            this._inputContainer.style.display = 'block';

            // Обновляем цвет рамки в зависимости от знака
            const isNegative = signedDistance < 0;
            if (this.dragAxis === 'x') {
                this._inputContainer.style.borderColor = isNegative ? '#ff8888' : '#ff4444';
            } else if (this.dragAxis === 'y') {
                this._inputContainer.style.borderColor = isNegative ? '#88ff88' : '#44ff44';
            } else if (this.dragAxis === 'z') {
                this._inputContainer.style.borderColor = isNegative ? '#8888ff' : '#4444ff';
            }
        }

        this.updateInputPosition(position, direction);
    }

    updateInputPosition(position, direction) {
        if (!this._inputContainer) return;

        const screenPos = this.worldToScreen(position, this.editor.camera, this.editor.renderer);

        // Позиционируем контейнер рядом с линией
        this._inputContainer.style.left = `${screenPos.x}px`;
        this._inputContainer.style.top = `${screenPos.y}px`;
    }

    worldToScreen(position, camera, renderer) {
        const vector = position.clone();
        vector.project(camera);

        const x = (vector.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (vector.y * -0.5 + 0.5) * renderer.domElement.clientHeight;

        return { x, y };
    }

    updateMoveLine() {
        if (!this.moveLine || !this.attachedObject || !this.moveLine.visible || !this.showMoveLine) return;

        const { currentWorldPos } = this.cachedVectors;
        this.attachedObject.getWorldPosition(currentWorldPos);
        this.updateLineTransform(this.startWorldPosition, currentWorldPos);

        if (this.frameCount % 5 === 0 && this.tooltip) {
            const distance = this.startWorldPosition.distanceTo(currentWorldPos);
            this.updateTooltipWithDistance(distance);
        }
    }

    updateTooltipWithDistance(distance) {
        if (!this.tooltip) return;

        let distanceColor;
        if (this.dragAxis === 'x') {
            distanceColor = '#ff6b6b';
        } else if (this.dragAxis === 'y') {
            distanceColor = '#51cf66';
        } else if (this.dragAxis === 'z') {
            distanceColor = '#339af0';
        } else {
            distanceColor = '#ffd43b';
        }

        const existingContent = this.getTooltipContent();
        const distanceInfo = `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 10px; opacity: 0.8;">Общее расстояние:</span>
                    <span style="font-weight: bold; color: ${distanceColor};">${distance.toFixed(2)} мм</span>
                </div>
            </div>
        `;

        this.tooltip.innerHTML = existingContent + distanceInfo;
    }

    handleTransform(deltaX, deltaY) {
        if (!this.attachedObject || !this.currentAxisVector || !this.dragPlane) return;

        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const currentMouseX = this.startMouse.x + deltaX;
        const currentMouseY = this.startMouse.y + deltaY;

        const x = ((currentMouseX - rect.left) / rect.width) * 2 - 1;
        const y = -((currentMouseY - rect.top) / rect.height) * 2 + 1;

        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x, y), this.editor.camera);

        const intersection = new THREE.Vector3();
        if (ray.ray.intersectPlane(this.dragPlane, intersection)) {
            const startX = ((this.startMouse.x - rect.left) / rect.width) * 2 - 1;
            const startY = -((this.startMouse.y - rect.top) / rect.height) * 2 + 1;

            const startRay = new THREE.Raycaster();
            startRay.setFromCamera(new THREE.Vector2(startX, startY), this.editor.camera);

            const startIntersection = new THREE.Vector3();
            if (startRay.ray.intersectPlane(this.dragPlane, startIntersection)) {
                const delta = new THREE.Vector3().subVectors(intersection, startIntersection);
                const projection = delta.dot(this.currentAxisVector);
                const moveVector = this.currentAxisVector.clone().multiplyScalar(projection);

                if (this.snapEnabled && !this.editor.spacePressed) {
                    moveVector.x = Math.round(moveVector.x / this.moveSnapValue) * this.moveSnapValue;
                    moveVector.y = Math.round(moveVector.y / this.moveSnapValue) * this.moveSnapValue;
                    moveVector.z = Math.round(moveVector.z / this.moveSnapValue) * this.moveSnapValue;
                }

                this.attachedObject.position.copy(this.startPosition).add(moveVector);
                this.moveDelta.copy(moveVector);

                this.updateGizmoPosition();
                this.updateMoveLine();
            }
        }
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

        const box = new THREE.Box3().setFromObject(this.attachedObject);
        const size = new THREE.Vector3();
        box.getSize(size);

        this.gizmoGroup.scale.set(1, 1, 1);

        Object.keys(this.axisArrows).forEach(key => {
            const arrowData = this.axisArrows[key];
            if (!arrowData.group) return;

            const axis = arrowData.axis;
            const positive = arrowData.positive;
            let axisSize;

            if (axis === 'x') axisSize = size.x;
            else if (axis === 'y') axisSize = size.y;
            else axisSize = size.z;

            let desiredTotalLength = (axisSize / 2) + this.arrowOffset;
            desiredTotalLength = Math.max(this.minArrowLength, desiredTotalLength);
            let lineLength = desiredTotalLength - (this.arrowHeadBaseLength / 2);

            if (lineLength < 0) {
                lineLength = 0;
                desiredTotalLength = this.arrowHeadBaseLength / 2;
            }

            const lineScale = lineLength / this.arrowBaseLength;
            const line = arrowData.line;
            const cone = arrowData.cone;

            if (line && cone) {
                const sign = positive ? 1 : -1;

                if (axis === 'x') {
                    line.position.x = sign * lineLength / 2;
                    line.scale.x = lineScale;
                    cone.position.x = sign * desiredTotalLength;
                } else if (axis === 'y') {
                    line.position.y = sign * lineLength / 2;
                    line.scale.y = lineScale;
                    cone.position.y = sign * desiredTotalLength;
                } else if (axis === 'z') {
                    line.position.z = sign * lineLength / 2;
                    line.scale.z = lineScale;
                    cone.position.z = sign * desiredTotalLength;
                }

                const isHovered = (this.hoveredAxis === key);
                const targetColor = isHovered ? 0xFFFF00 : this.axisColors[axis];
                const targetOpacity = isHovered ? 1.0 : 0.8;

                if (line.material) {
                    line.material.color.set(targetColor);
                    line.material.opacity = targetOpacity;
                }
                if (cone.material) {
                    cone.material.color.set(targetColor);
                    cone.material.opacity = targetOpacity;
                }

                line.updateMatrix();
                cone.updateMatrix();
            }
        });
    }

    getAxisVector(axis, positive = true) {
        const vector = new THREE.Vector3();
        if (axis === 'x') vector.set(positive ? 1 : -1, 0, 0);
        else if (axis === 'y') vector.set(0, positive ? 1 : -1, 0);
        else if (axis === 'z') vector.set(0, 0, positive ? 1 : -1);

        vector.applyQuaternion(this.gizmoGroup.quaternion);
        return vector.normalize();
    }

    onMouseUp(e) {
        super.onMouseUp(e);

        // Не скрываем линии при завершении перетаскивания
        this._isDragging = false;
        this.hoveredAxis = null;
        this.updateGizmoPosition();

        // Обновляем позицию поля ввода после завершения перетаскивания
        if (this.moveLine && this.moveLine.visible && this.attachedObject) {
            const currentWorldPos = this.attachedObject.getWorldPosition(new THREE.Vector3());

            // Вычисляем знаковое расстояние
            let signedDistance = 0;
            if (this._currentDragAxis === 'x') {
                signedDistance = currentWorldPos.x - this.startWorldPosition.x;
            } else if (this._currentDragAxis === 'y') {
                signedDistance = currentWorldPos.y - this.startWorldPosition.y;
            } else if (this._currentDragAxis === 'z') {
                signedDistance = currentWorldPos.z - this.startWorldPosition.z;
            }

            const distance = Math.abs(signedDistance);

            if (distance > 0.1 && this._inputContainer) {
                this._lastInputDistance = signedDistance;
                this._inputElement.value = signedDistance.toFixed(1);

                // Обновляем цвет рамки
                const isNegative = signedDistance < 0;
                if (this.dragAxis === 'x') {
                    this._inputContainer.style.borderColor = isNegative ? '#ff8888' : '#ff4444';
                } else if (this.dragAxis === 'y') {
                    this._inputContainer.style.borderColor = isNegative ? '#88ff88' : '#44ff44';
                } else if (this.dragAxis === 'z') {
                    this._inputContainer.style.borderColor = isNegative ? '#8888ff' : '#4444ff';
                }

                const { midPoint, direction } = this.cachedVectors;
                midPoint.addVectors(this.startWorldPosition, currentWorldPos).multiplyScalar(0.5);
                direction.subVectors(currentWorldPos, this.startWorldPosition).normalize();

                this.updateInputPosition(midPoint, direction);
                this._inputContainer.style.display = 'block';
            }
        }
    }

    detach() {
        // Скрываем линии и поля ввода при откреплении объекта
        this.clearMoveLine();
        this.hoveredAxis = null;
        super.detach();
    }

    onDeactivate() {
        // Скрываем линии при деактивации инструмента
        this.clearMoveLine();
        this.hoveredAxis = null;

        super.onDeactivate();
    }

    getTooltipContent() {
        if (!this.attachedObject) return '';

        return `
            <div style="font-weight: 600; margin-bottom: 6px; color: #fff;">Перемещение (мм):</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <div style="color: #ff6b6b;">
                    <div style="font-size: 10px; opacity: 0.8;">ΔX</div>
                    <div>${this.moveDelta.x.toFixed(1)}</div>
                </div>
                <div style="color: #51cf66;">
                    <div style="font-size: 10px; opacity: 0.8;">ΔY</div>
                    <div>${this.moveDelta.y.toFixed(1)}</div>
                </div>
                <div style="color: #339af0;">
                    <div style="font-size: 10px; opacity: 0.8;">ΔZ</div>
                    <div>${this.moveDelta.z.toFixed(1)}</div>
                </div>
            </div>
            <div style="margin-top: 8px; font-size: 10px; opacity: 0.7; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
                Ctrl: ${this.snapEnabled ? 'с привязкой' : 'без привязки'}
            </div>
        `;
    }

    createHistoryAction() {
        if (!this.attachedObject || !this.attachedObject.userData.transformStartState) return null;

        return {
            type: 'modify_position',
            object: this.attachedObject.uuid,
            data: {
                position: this.attachedObject.position.toArray(),
                previousPosition: this.attachedObject.userData.transformStartState.position.toArray()
            }
        };
    }

    getHistoryActionType() {
        return 'modify_position';
    }
}