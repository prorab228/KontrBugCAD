class DragManager {
    constructor(cadEditor) {
        this.editor = cadEditor;

        this.isDragging = false;
        this.draggedObjects = [];
        this.dragStartPositions = [];
        this.dragStartMouse = null;
        this.dragPlane = null;
        this.dragIntersection = null;
        this.dragOffsets = [];
        this.mainObjectIndex = 0;

        this.moveLinesX = [];
        this.moveLinesZ = [];
        this.lineThickness = 0.3;
        this.showMoveLines = true;

        this.snapToGrid = true;
        this.gridSize = 1;

        this._tempVector = new THREE.Vector3();
        this._tempVector2 = new THREE.Vector3();
        this._tempQuaternion = new THREE.Quaternion();
        this._raycaster = new THREE.Raycaster();

        this._lastUpdateTime = 0;
        this._updateInterval = 16;

        // DOM элементы для ввода
        this._inputContainerX = null;
        this._inputElementX = null;
        this._inputValueX = null;

        this._inputContainerZ = null;
        this._inputElementZ = null;
        this._inputValueZ = null;

        this._isInputFocusedX = false;
        this._isInputFocusedZ = false;
        this._lastInputX = 0;
        this._lastInputZ = 0;

        this._linesInitialized = false;

        // Флаги для контроля отображения
        this._shouldShowLinesAfterDrag = false;

        this.mainObjectOffset = null; // Смещение от центра главного объекта до точки пересечения
    }

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

        // ВЫЧИСЛЯЕМ СМЕЩЕНИЕ ОТ ЦЕНТРА ГЛАВНОГО ОБЪЕКТА ДО ТОЧКИ ПЕРЕСЕЧЕНИЯ
        this.mainObjectOffset = new THREE.Vector3(
            intersectionPoint.x - object.position.x,
            0,
            intersectionPoint.z - object.position.z
        );

        const normal = new THREE.Vector3(0, 1, 0);
        const constant = -intersectionPoint.y;
        this.dragPlane = new THREE.Plane(normal, constant);
        this.dragIntersection = intersectionPoint.clone();
    }

    startDrag(e) {
        this.isDragging = true;
        this.dragStartMouse = new THREE.Vector2(e.clientX, e.clientY);

        // Очищаем предыдущие линии
        this.clearLinesAndInputs();

        if (this.showMoveLines) {
            this.initMoveLines();
        }

        this.editor.showStatus(
            `Перетаскивание: ${this.draggedObjects.length} объект(ов) (только по XZ)`,
            'info'
        );

        this.initInputElements();
        this.onMouseMove(e);
    }

    initMoveLines() {
        this.removeMoveLines();
        this._linesInitialized = true;

        for (let i = 0; i < this.draggedObjects.length; i++) {
            const obj = this.draggedObjects[i];
            const startPos = this.dragStartPositions[i];

            const lineX = this.createAxisLine(startPos, startPos, 0xff4444, 'x');
            this.editor.scene.add(lineX);
            this.moveLinesX.push(lineX);

            const lineZ = this.createAxisLine(startPos, startPos, 0x4444ff, 'z');
            this.editor.scene.add(lineZ);
            this.moveLinesZ.push(lineZ);
        }
    }

    createAxisLine(startPos, endPos, color, axis) {
        const geometry = new THREE.CylinderGeometry(
            this.lineThickness / 2,
            this.lineThickness / 2,
            1,
            6,
            1,
            false
        );

        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        const line = new THREE.Mesh(geometry, material);
        line.userData.axis = axis;
        line.visible = this.showMoveLines;
        line.renderOrder = 1000;

        this.updateAxisLine(line, startPos, endPos, axis);

        return line;
    }

    updateAxisLine(line, startPos, currentPos, axis) {
        if (!line) return null;

        const lineStart = this._tempVector;
        const lineEnd = this._tempVector2;

        if (axis === 'x') {
            lineStart.copy(startPos);
            lineEnd.set(currentPos.x, startPos.y, startPos.z);
        } else if (axis === 'z') {
            lineStart.set(currentPos.x, startPos.y, startPos.z);
            lineEnd.copy(currentPos);
        }

        const distance = lineStart.distanceTo(lineEnd);

        if (distance < 0.001) {
            line.visible = false;
            return null;
        }

        line.visible = true;

        const midPoint = new THREE.Vector3()
            .addVectors(lineStart, lineEnd)
            .multiplyScalar(0.5);

        line.position.copy(midPoint);
        line.scale.set(1, distance, 1);

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

    initInputElements() {
        // Создаем поле ввода для оси X
        if (!this._inputContainerX) {
            this._inputContainerX = document.createElement('div');
            this._inputContainerX.className = 'drag-input-container-x';
            this._inputContainerX.style.cssText = `
                border: 2px solid #ff4444;
            `;

            this._inputElementX = document.createElement('input');
            this._inputElementX.type = 'number';
            this._inputElementX.step = '0.1';
            this._inputElementX.placeholder = 'ΔX';




            this._inputContainerX.appendChild(this._inputElementX);

            document.body.appendChild(this._inputContainerX);

            this._inputElementX.addEventListener('focus', () => {
                this._isInputFocusedX = true;
            });

            this._inputElementX.addEventListener('blur', () => {
                this._isInputFocusedX = false;
            });

            this._inputElementX.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value)) {
                    this.updateFromInput('x', value);
                }
            });
        }

        // Создаем поле ввода для оси Z
        if (!this._inputContainerZ) {
            this._inputContainerZ = document.createElement('div');
            this._inputContainerZ.className = 'drag-input-container-z';
            this._inputContainerZ.style.cssText = `
                border: 2px solid #4444FF;
            `;


            this._inputElementZ = document.createElement('input');
            this._inputElementZ.type = 'number';
            this._inputElementZ.step = '0.1';
            this._inputElementZ.placeholder = 'ΔZ';



            this._inputContainerZ.appendChild(this._inputElementZ);

            document.body.appendChild(this._inputContainerZ);

            this._inputElementZ.addEventListener('focus', () => {
                this._isInputFocusedZ = true;
            });

            this._inputElementZ.addEventListener('blur', () => {
                this._isInputFocusedZ = false;
            });



            this._inputElementZ.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value)) {
                    this.updateFromInput('z', value);
                }
            });
        }
    }



    updateFromInput(axis, value) {
        if (this.draggedObjects.length === 0) return;

        const mainObj = this.draggedObjects[0];
        const startPos = this.dragStartPositions[0];

        if (axis === 'x') {
            const newX = startPos.x + value;
            mainObj.position.x = newX;

            for (let i = 1; i < this.draggedObjects.length; i++) {
                this.draggedObjects[i].position.x = newX + this.dragOffsets[i].x;
            }
        } else if (axis === 'z') {
            const newZ = startPos.z + value;
            mainObj.position.z = newZ;

            for (let i = 1; i < this.draggedObjects.length; i++) {
                this.draggedObjects[i].position.z = newZ + this.dragOffsets[i].z;
            }
        }

        // Обновляем линии
        this.updateMoveLines();
    }

    addHistoryAction() {
        if (this.draggedObjects.length === 0) return;

        const positions = this.draggedObjects.map((obj, i) => ({
            uuid: obj.uuid,
            previousPosition: this.dragStartPositions[i].toArray(),
            position: obj.position.toArray()
        }));

        this.editor.history.addAction({
            type: 'modify_position_multiple',
            objects: positions
        });
    }

    updateMoveLines() {
        if (!this.showMoveLines || !this._linesInitialized) return;

        const now = performance.now();
        if (now - this._lastUpdateTime < this._updateInterval && this.isDragging) {
            return;
        }

        this._lastUpdateTime = now;

        for (let i = 0; i < this.draggedObjects.length; i++) {
            const obj = this.draggedObjects[i];
            const startPos = this.dragStartPositions[i];
            const currentPos = obj.position;

            const lineX = this.moveLinesX[i];
            if (lineX) {
                const lineXData = this.updateAxisLine(lineX, startPos, currentPos, 'x');
                const deltaX = currentPos.x - startPos.x;

                if (lineXData && Math.abs(deltaX) > 0.1) {
                    lineX.visible = true;

                    // Обновляем поле ввода для оси X (только для главного объекта)
                    if (i === 0 && !this._isInputFocusedX && this._inputContainerX) {
                        this._lastInputX = deltaX;
                        this._inputElementX.value = deltaX.toFixed(1);
                        this._inputContainerX.style.display = 'block';
                        this.updateInputPosition('x', lineXData.midPoint);
                    }
                } else {
                    lineX.visible = false;
                    if (i === 0 && this._inputContainerX) {
                        this._inputContainerX.style.display = 'none';
                    }
                }
            }

            const lineZ = this.moveLinesZ[i];
            if (lineZ) {
                const lineZData = this.updateAxisLine(lineZ, startPos, currentPos, 'z');
                const deltaZ = currentPos.z - startPos.z;

                if (lineZData && Math.abs(deltaZ) > 0.1) {
                    lineZ.visible = true;

                    // Обновляем поле ввода для оси Z (только для главного объекта)
                    if (i === 0 && !this._isInputFocusedZ && this._inputContainerZ) {
                        this._lastInputZ = deltaZ;
                        this._inputElementZ.value = deltaZ.toFixed(1);
                        this._inputContainerZ.style.display = 'block';
                        this.updateInputPosition('z', lineZData.midPoint);
                    }
                } else {
                    lineZ.visible = false;
                    if (i === 0 && this._inputContainerZ) {
                        this._inputContainerZ.style.display = 'none';
                    }
                }
            }
        }
    }

    updateInputPosition(axis, position) {
        if (!this.editor.camera || !this.editor.renderer) return;

        const screenPos = this.worldToScreen(position, this.editor.camera, this.editor.renderer);

        if (axis === 'x' && this._inputContainerX) {
            this._inputContainerX.style.left = `${screenPos.x}px`;
            this._inputContainerX.style.top = `${screenPos.y}px`;
        } else if (axis === 'z' && this._inputContainerZ) {
            this._inputContainerZ.style.left = `${screenPos.x}px`;
            this._inputContainerZ.style.top = `${screenPos.y}px`;
        }
    }

    worldToScreen(position, camera, renderer) {
        const vector = position.clone();
        vector.project(camera);

        const x = (vector.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (vector.y * -0.5 + 0.5) * renderer.domElement.clientHeight;

        return { x, y };
    }

    onMouseMove(e) {
        if (!this.isDragging || this.draggedObjects.length === 0) return;

        e.preventDefault();
        this.editor.updateMousePosition(e);

        const newPosition = this.getDragPosition(e);

        if (newPosition) {
            let finalPosition = newPosition.clone();

            // ВЫЧИТАЕМ СМЕЩЕНИЕ, ЧТОБЫ ОБЪЕКТ ДВИГАЛСЯ ОТНОСИТЕЛЬНО ТОЧКИ ЗАХВАТА
            if (this.mainObjectOffset) {
                finalPosition.x -= this.mainObjectOffset.x;
                finalPosition.z -= this.mainObjectOffset.z;
            }

            if (this.snapToGrid) {
                finalPosition.x = Math.round(finalPosition.x / this.gridSize) * this.gridSize;
                finalPosition.z = Math.round(finalPosition.z / this.gridSize) * this.gridSize;
            }

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

            if (this.showMoveLines) {
                if (!this._linesInitialized) {
                    this.initMoveLines();
                }
                this.updateMoveLines();
            }

            this.updateCoordinates(finalPosition);
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

        // Не скрываем линии и поля ввода после завершения перетаскивания
        this.isDragging = false;
        this.dragStartMouse = null;
        this.dragPlane = null;
        this.dragIntersection = null;
        document.body.style.cursor = 'default';

        // Обновляем поля ввода с конечными значениями
        if (this.draggedObjects.length > 0) {
            const mainObj = this.draggedObjects[0];
            const startPos = this.dragStartPositions[0];
            const deltaX = mainObj.position.x - startPos.x;
            const deltaZ = mainObj.position.z - startPos.z;

            if (Math.abs(deltaX) > 0.1 && this._inputContainerX && !this._isInputFocusedX) {
                this._lastInputX = deltaX;
                this._inputElementX.value = deltaX.toFixed(1);
            }

            if (Math.abs(deltaZ) > 0.1 && this._inputContainerZ && !this._isInputFocusedZ) {
                this._lastInputZ = deltaZ;
                this._inputElementZ.value = deltaZ.toFixed(1);
            }
        }

        if (this.editor.transformControls && this.editor.selectedObjects.length === 1) {
            const selectedObj = this.editor.selectedObjects[0];
            if (this.draggedObjects.includes(selectedObj)) {
                this.editor.transformControls.visible = true;
            }
        }

        let positionChanged = false;
        for (let i = 0; i < this.draggedObjects.length; i++) {
            if (!this.dragStartPositions[i].equals(this.draggedObjects[i].position)) {
                positionChanged = true;
                break;
            }
        }

        if (positionChanged) {
            this.addHistoryAction();
            this.editor.showStatus(
                `Перемещено ${this.draggedObjects.length} объект(ов) по горизонтали`,
                'success'
            );
        }
    }

    cancelDrag() {
        if (this.draggedObjects.length > 0) {
            for (let i = 0; i < this.draggedObjects.length; i++) {
                this.draggedObjects[i].position.copy(this.dragStartPositions[i]);
            }

            this.clearLinesAndInputs();

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

    removeMoveLines() {
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

        this._linesInitialized = false;
    }

    clearLinesAndInputs() {
        this.removeMoveLines();
        this.hideInputElements();
    }

    hideInputElements() {
        if (this._inputContainerX) {
            this._inputContainerX.style.display = 'none';
        }
        if (this._inputContainerZ) {
            this._inputContainerZ.style.display = 'none';
        }
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
        this.mainObjectOffset = null; // СБРАСЫВАЕМ СМЕЩЕНИЕ
        this._linesInitialized = false;
        this.clearLinesAndInputs();
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

    toggleMoveLines() {
        this.showMoveLines = !this.showMoveLines;
        this.editor.showStatus(`Линии перемещения: ${this.showMoveLines ? 'ВКЛ' : 'ВЫКЛ'}`, 'info');

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

        if (!this.showMoveLines) {
            this.hideInputElements();
        }

        return this.showMoveLines;
    }

    destroy() {
        this.removeMoveLines();
        this.hideInputElements();

        // Удаляем поля ввода из DOM
        if (this._inputContainerX && this._inputContainerX.parentElement) {
            document.body.removeChild(this._inputContainerX);
            this._inputContainerX = null;
            this._inputElementX = null;
            this._inputValueX = null;
        }

        if (this._inputContainerZ && this._inputContainerZ.parentElement) {
            document.body.removeChild(this._inputContainerZ);
            this._inputContainerZ = null;
            this._inputElementZ = null;
            this._inputValueZ = null;
        }
    }
}