
class ScaleTool extends TransformToolBase {
    constructor(editor) {
        super('scale', 'fa-expand-alt', editor);
        this.sizeStartDimensions = new THREE.Vector3();
        this.startScale = new THREE.Vector3();
        this.uniformScaling = false;
        this.percentageMode = false;
        this.lastMousePosition = new THREE.Vector2(); // Добавляем для хранения предыдущей позиции мыши
        this.accumulatedScale = 1.0; // Добавляем для накопления масштаба
        this.initGizmo();
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
        const handleSize = 0.5;
        const offset = 6.0;

        ['x', 'y', 'z'].forEach(axis => {
            const geometry = new THREE.BoxGeometry(handleSize, handleSize, handleSize);
            const material = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.8
            });

            const cube = new THREE.Mesh(geometry, material);
            cube.name = `scale_${axis}`;
            cube.userData.type = 'scale';
            cube.userData.axis = axis;

            if (axis === 'x') cube.position.x = offset;
            else if (axis === 'y') cube.position.y = offset;
            else if (axis === 'z') cube.position.z = offset;

            // Линия от центра к кубу
            const lineGeometry = new THREE.CylinderGeometry(0.02, 0.02, offset, 8);
            const lineMaterial = new THREE.MeshBasicMaterial({
                color: this.axisColors[axis],
                transparent: true,
                opacity: 0.5
            });
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.userData.axis = axis;

            if (axis === 'x') {
                line.rotation.z = -Math.PI / 2;
                line.position.x = offset / 2;
            } else if (axis === 'y') {
                line.position.y = offset / 2;
            } else if (axis === 'z') {
                line.rotation.x = Math.PI / 2;
                line.position.z = offset / 2;
            }

            this.gizmoGroup.add(line);
            this.gizmoGroup.add(cube);
        });

        // Добавляем центральный куб для равномерного масштабирования
        const centerGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const centerMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        const centerSphere = new THREE.Mesh(centerGeometry, centerMaterial);
        centerSphere.name = 'scale_center';
        centerSphere.userData.type = 'scale';
        centerSphere.userData.axis = 'uniform';
        this.gizmoGroup.add(centerSphere);
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
            uniformCheckbox.addEventListener('change', (e) => {
                this.uniformScaling = e.target.checked;
            });
        }
        if (percentageCheckbox) {
            percentageCheckbox.addEventListener('change', (e) => {
                this.percentageMode = e.target.checked;
                this.updatePropertiesUI();
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

    startDragging(axis, e) {
        super.startDragging(axis, e);

        if (this.attachedObject) {
            // Убедимся, что startMouse установлены правильно
            const rect = this.editor.renderer.domElement.getBoundingClientRect();
            this.startMouse.set(e.clientX, e.clientY);
            this.lastMousePosition.copy(this.startMouse); // Инициализируем предыдущую позицию мыши
            this.accumulatedScale = 1.0; // Сбрасываем накопленный масштаб

            // Сохраняем начальные размеры
            this.sizeStartDimensions = this.getObjectDimensions(this.attachedObject);
            this.startScale.copy(this.attachedObject.scale);

            // Сбрасываем накопленную дельту
            this.moveDelta.set(0, 0, 0);

            // Сохраняем исходный размер для равномерного масштабирования
            if (axis === 'uniform' && !this.attachedObject.userData.originalSize) {
                this.attachedObject.userData.originalSize = this.sizeStartDimensions.clone();
            }
        }
    }

    handleTransform(deltaX, deltaY) {
        if (!this.attachedObject || !this.currentAxis) return;

        // Вычисляем текущую позицию мыши
        const currentMouseX = this.startMouse.x + deltaX;
        const currentMouseY = this.startMouse.y + deltaY;
        
        // Вычисляем дельту относительно предыдущей позиции мыши
        const deltaMouseX = currentMouseX - this.lastMousePosition.x;
        const deltaMouseY = currentMouseY - this.lastMousePosition.y;
        
        // Сохраняем текущую позицию для следующего вызова
        this.lastMousePosition.set(currentMouseX, currentMouseY);

        // Используем движение мыши по основной оси
        const delta = (Math.abs(deltaMouseX) > Math.abs(deltaMouseY)) ? deltaMouseX : deltaMouseY;

        // Корректируем направление для разных осей
        let correctedDelta = delta;
        if (this.currentAxis === 'y' || this.currentAxis === 'z') {
            correctedDelta = -delta; // Инвертируем для осей Y и Z
        }

        // Плавное изменение масштаба с очень маленьким коэффициентом
        const scaleIncrement = 1.0 + (correctedDelta * 0.005); // Уменьшенный коэффициент для плавности
        
        // Накопление масштаба
        this.accumulatedScale *= scaleIncrement;

        let newDimensions = new THREE.Vector3();

        if (this.currentAxis === 'uniform' || this.uniformScaling) {
            // Равномерное масштабирование
            newDimensions.x = this.sizeStartDimensions.x * this.accumulatedScale;
            newDimensions.y = this.sizeStartDimensions.y * this.accumulatedScale;
            newDimensions.z = this.sizeStartDimensions.z * this.accumulatedScale;
        } else {
            // Масштабирование по одной оси
            if (this.currentAxis === 'x') {
                newDimensions.x = this.sizeStartDimensions.x * this.accumulatedScale;
                newDimensions.y = this.sizeStartDimensions.y;
                newDimensions.z = this.sizeStartDimensions.z;
            } else if (this.currentAxis === 'y') {
                newDimensions.x = this.sizeStartDimensions.x;
                newDimensions.y = this.sizeStartDimensions.y * this.accumulatedScale;
                newDimensions.z = this.sizeStartDimensions.z;
            } else if (this.currentAxis === 'z') {
                newDimensions.x = this.sizeStartDimensions.x;
                newDimensions.y = this.sizeStartDimensions.y;
                newDimensions.z = this.sizeStartDimensions.z * this.accumulatedScale;
            }
        }

        // Применяем привязку к сетке, если не зажат Ctrl
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

        // Обновляем gizmo
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
