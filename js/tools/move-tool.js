class MoveTool extends TransformToolBase {
    constructor(editor) {
        super('move', 'fa-arrows-alt', editor);
        this.useLocalCoordinates = false; // По умолчанию глобальные координаты
        this.initGizmo();
    }

    initGizmo() {
        // Очищаем предыдущий gizmo
        while (this.gizmoGroup.children.length > 0) {
            const child = this.gizmoGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.gizmoGroup.remove(child);
        }

        this.createTranslateGizmo();
        this.gizmoGroup.visible = false;
    }

    createTranslateGizmo() {
        const arrowLength = 7.0;
        const arrowHeadLength = 0.7;
        const coneRadius = 0.5;
        const lineRadius = 0.05;

        ['x', 'y', 'z'].forEach(axis => {
            const axisGroup = new THREE.Group();
            axisGroup.name = `translate_${axis}`;
            axisGroup.userData.type = 'translate';
            axisGroup.userData.axis = axis;

            // Линия оси
            const lineGeometry = new THREE.CylinderGeometry(lineRadius, lineRadius, arrowLength, 8);
            const lineMaterial = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8
            });
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.name = `translate_line_${axis}`;
            line.userData.axis = axis;

            // Конус стрелки
            const coneGeometry = new THREE.ConeGeometry(coneRadius, arrowHeadLength, 8);
            const coneMaterial = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8
            });
            const cone = new THREE.Mesh(coneGeometry, coneMaterial);
            cone.name = `translate_cone_${axis}`;
            cone.userData.axis = axis;

            // Позиционирование
            const totalLength = arrowLength + arrowHeadLength;

            if (axis === 'x') {
                line.rotation.z = -Math.PI / 2;
                line.position.x = arrowLength / 2;
                cone.position.x = totalLength;
                cone.rotation.z = -Math.PI / 2;
            } else if (axis === 'y') {
                line.position.y = arrowLength / 2;
                cone.position.y = totalLength;
            } else if (axis === 'z') {
                line.rotation.x = Math.PI / 2;
                line.position.z = arrowLength / 2;
                cone.position.z = totalLength;
                cone.rotation.x = Math.PI / 2;
            }

            axisGroup.add(line);
            axisGroup.add(cone);
            this.gizmoGroup.add(axisGroup);
        });
    }

    getPropertiesHTML() {
        console.log('MoveTool: создание HTML свойств');
        return `
            <div class="property-group" data-type="move-position">
                <h4><i class="fas fa-arrows-alt"></i> Позиция (мм)</h4>

                <div class="property-row">
                    <label>Локальные координаты:</label>
                    <input type="checkbox" id="localCoordinates" ${this.useLocalCoordinates ? 'checked' : ''}>
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
        if (!this.propertiesElement) {
            console.log('MoveTool: propertiesElement отсутствует');
            return;
        }

        console.log('MoveTool: привязка событий');

        const posX = this.propertiesElement.querySelector('#movePosX');
        const posY = this.propertiesElement.querySelector('#movePosY');
        const posZ = this.propertiesElement.querySelector('#movePosZ');
        const applyBtn = this.propertiesElement.querySelector('#applyMovePosition');
        const localCoordsCheckbox = this.propertiesElement.querySelector('#localCoordinates');

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
    }


    onPositionChange(axis, e) {
        if (!this.attachedObject) return;

        const value = parseFloat(e.target.value);
        if (isNaN(value)) return;

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

    startDragging(axis, e) {
        super.startDragging(axis, e);

        if (this.attachedObject) {
            this.moveDelta.set(0, 0, 0);

            // Создаем плоскость для перемещения
            const cameraDirection = this.editor.camera.getWorldDirection(new THREE.Vector3());
            let planeNormal;

            if (axis === 'x') planeNormal = new THREE.Vector3(0, 1, 0);
            else if (axis === 'y') planeNormal = new THREE.Vector3(0, 0, 1);
            else if (axis === 'z') planeNormal = new THREE.Vector3(1, 0, 0);

            if (planeNormal) {
                this.dragPlane = new THREE.Plane();
                this.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, this.gizmoGroup.position);
            }
        }
    }

    handleTransform(deltaX, deltaY) {
        if (!this.attachedObject || !this.currentAxis || !this.dragPlane) return;

        // Вместо неправильного расчета луча используем правильную технику
        const rect = this.editor.renderer.domElement.getBoundingClientRect();

        // Текущие координаты мыши
        const currentMouseX = this.startMouse.x + deltaX;
        const currentMouseY = this.startMouse.y + deltaY;

        // Преобразуем в нормализованные координаты (-1 до 1)
        const x = ((currentMouseX - rect.left) / rect.width) * 2 - 1;
        const y = -((currentMouseY - rect.top) / rect.height) * 2 + 1;

        // Создаем луч из камеры через текущую позицию мыши
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x, y), this.editor.camera);

        // Находим пересечение с плоскостью
        const intersection = new THREE.Vector3();
        if (ray.ray.intersectPlane(this.dragPlane, intersection)) {
            // Начальный луч (в момент начала перетаскивания)
            const startX = ((this.startMouse.x - rect.left) / rect.width) * 2 - 1;
            const startY = -((this.startMouse.y - rect.top) / rect.height) * 2 + 1;

            const startRay = new THREE.Raycaster();
            startRay.setFromCamera(new THREE.Vector2(startX, startY), this.editor.camera);

            const startIntersection = new THREE.Vector3();
            if (startRay.ray.intersectPlane(this.dragPlane, startIntersection)) {
                // Вычисляем дельту перемещения
                const delta = new THREE.Vector3().subVectors(intersection, startIntersection);

                // Применяем перемещение только по выбранной оси
                let moveVector = new THREE.Vector3();

                // Получаем локальные оси из вращения gizmo
                const axisVector = this.getAxisVector(this.currentAxis);

                // Проецируем дельту на выбранную ось
                const projection = delta.dot(axisVector);
                moveVector.copy(axisVector).multiplyScalar(projection);

                // Применяем привязку к сетке, если не зажат Ctrl
                if (this.snapEnabled && !this.editor.spacePressed) {
                    moveVector.x = Math.round(moveVector.x / this.moveSnapValue) * this.moveSnapValue;
                    moveVector.y = Math.round(moveVector.y / this.moveSnapValue) * this.moveSnapValue;
                    moveVector.z = Math.round(moveVector.z / this.moveSnapValue) * this.moveSnapValue;
                }

                // Применяем перемещение
                this.attachedObject.position.copy(this.startPosition).add(moveVector);
                this.moveDelta.copy(moveVector);

                // Обновляем позицию gizmo
                this.updateGizmoPosition();
            }
        }
    }

    // Новый метод для получения вектора оси
    getAxisVector(axis) {
        const vector = new THREE.Vector3();
        if (axis === 'x') vector.set(1, 0, 0);
        else if (axis === 'y') vector.set(0, 1, 0);
        else if (axis === 'z') vector.set(0, 0, 1);

        // Преобразуем в мировые координаты с учетом вращения gizmo
        vector.applyQuaternion(this.gizmoGroup.quaternion);
        return vector.normalize();
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