
class RotateTool extends TransformToolBase {
    constructor(editor) {
        super('rotate', 'fa-sync-alt', editor);
        this.startQuaternion = new THREE.Quaternion();
        this.useLocalCoordinates = false;
        this.accumulatedAngle = 0;
        this.gizmoWorldPosition = new THREE.Vector3();
        this.rotationPlane = null;
        this.startVector = null;
        this.initGizmo();
    }

    initGizmo() {
        while (this.gizmoGroup.children.length > 0) {
            const child = this.gizmoGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.gizmoGroup.remove(child);
        }

        this.createRotateGizmo();
        this.gizmoGroup.visible = false;
    }

    createRotateGizmo() {
        const ringRadius = 7.0;
        const tubeRadius = 0.1;
        const segments = 32;

        // Создаем оси в правильном порядке
        ['x', 'y', 'z'].forEach(axis => {
            const geometry = new THREE.TorusGeometry(ringRadius, tubeRadius, 6, segments);
            const material = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide
            });

            const ring = new THREE.Mesh(geometry, material);
            ring.name = `rotate_${axis}`;
            ring.userData.type = 'rotate';
            ring.userData.axis = axis;

            // Правильные ориентации осей:
            if (axis === 'x') {
                // Красное кольцо для оси X (вращение вокруг X)
                // Кольцо должно быть в плоскости YZ
                ring.rotation.y = Math.PI / 2;
            } else if (axis === 'y') {
                // Зеленое кольцо для оси Y (вращение вокруг Y)
                // Кольцо должно быть в плоскости XZ
                ring.rotation.x = Math.PI / 2;
            } else if (axis === 'z') {
                // Синее кольцо для оси Z (вращение вокруг Z)
                // Кольцо в плоскости XY (по умолчанию)
                // Ничего не делаем
            }

            this.gizmoGroup.add(ring);
        });
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

    startDragging(axis, e) {
        super.startDragging(axis, e);

        if (this.attachedObject) {
            // Сохраняем начальное вращение
            this.startQuaternion.copy(this.attachedObject.quaternion);
            this.accumulatedAngle = 0;
            
            // Получаем мировую позицию Gizmo
            this.gizmoGroup.getWorldPosition(this.gizmoWorldPosition);
            
            // Определяем ось вращения
            this.rotationAxis = new THREE.Vector3();
            if (axis === 'x') this.rotationAxis.set(1, 0, 0);
            else if (axis === 'y') this.rotationAxis.set(0, 1, 0);
            else if (axis === 'z') this.rotationAxis.set(0, 0, 1);
            
            // Для локальных координат: ось вращения должна быть в локальных координатах объекта
            // Для глобальных координат: ось вращения остается глобальной
            if (this.useLocalCoordinates) {
                // Преобразуем ось в локальные координаты объекта
                this.rotationAxis.applyQuaternion(this.attachedObject.quaternion);
            }
            
            // Создаем плоскость вращения (перпендикулярную оси вращения)
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
        
        // Вычисляем угол с учетом направления (знак)
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
        
        if (this.useLocalCoordinates) {
            // Локальные координаты: вращаем объект вокруг его локальных осей
            // Для локальных координат нам нужно определить локальную ось объекта в текущий момент
            let localAxis = new THREE.Vector3();
            if (this.currentAxis === 'x') localAxis.set(1, 0, 0);
            else if (this.currentAxis === 'y') localAxis.set(0, 1, 0);
            else if (this.currentAxis === 'z') localAxis.set(0, 0, 1);
            
            // Преобразуем локальную ось в мировые координаты с учетом текущего вращения объекта
            // Но для вращения в локальных координатах нам нужна ось в локальных координатах объекта
            // На самом деле, нам нужно создать кватернион вращения вокруг локальной оси
            // и применить его к текущему вращению объекта
            
            // Создаем кватернион вращения вокруг локальной оси
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromAxisAngle(localAxis.normalize(), this.accumulatedAngle);
            
            // Применяем вращение: начальное вращение * вращение вокруг локальной оси
            // Это дает вращение объекта в его локальных координатах
            this.attachedObject.quaternion.copy(this.startQuaternion);
            this.attachedObject.quaternion.multiply(rotationQuaternion);
        } else {
            // Глобальные координаты: вращаем объект вокруг глобальных осей
            let globalAxis = new THREE.Vector3();
            if (this.currentAxis === 'x') globalAxis.set(1, 0, 0);
            else if (this.currentAxis === 'y') globalAxis.set(0, 1, 0);
            else if (this.currentAxis === 'z') globalAxis.set(0, 0, 1);
            
            // Создаем кватернион вращения вокруг глобальной оси
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromAxisAngle(globalAxis.normalize(), this.accumulatedAngle);
            
            // Применяем вращение: вращение вокруг глобальной оси * начальное вращение
            this.attachedObject.quaternion.copy(rotationQuaternion);
            this.attachedObject.quaternion.multiply(this.startQuaternion);
        }
        
        // Обновляем начальный вектор для следующего шага
        this.startVector.copy(currentVector);
    }

    getTooltipContent() {
        if (!this.attachedObject) return '';

        const euler = new THREE.Euler().setFromQuaternion(this.attachedObject.quaternion, 'XYZ');
        const degX = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
        const degY = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
        const degZ = THREE.MathUtils.radToDeg(euler.z).toFixed(1);

        return `
            <div style="font-weight: 600; margin-bottom: 6px; color: #fff;">Вращение (°):</div>
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
