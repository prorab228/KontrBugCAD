/**
 * SketchManager - менеджер для работы со скетчами
 */
class SketchManager {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.currentTool = 'line';
        this.isDrawing = false;
        this.currentPlane = null;
        this.currentSketch = null;

        // Элементы скетча
        this.elements = [];
        this.selectedElements = [];
        this.tempElement = null;
        this.tempGeometry = null;
        this.dimensionObjects = [];
        this.polylinePoints = [];

        // Для ввода размеров
        this.dimensionInput = null;
        this.inputField1 = null;
        this.inputField2 = null;
        this.inputField3 = null;
        this.isInputActive = false;

        // Настройки
        this.snapEnabled = true;
        this.snapGrid = 1;
        this.sketchColor = 0x111111;
        this.highlightColor = 0xFFFF00;
        this.dimensionColor = 0x00C853;

        // История
        this.history = [];
        this.historyIndex = -1;

        // Обработчики событий
        this.mouseDownHandler = null;
        this.mouseMoveHandler = null;
        this.mouseUpHandler = null;
        this.keyDownHandler = null;

        // Сетка
        this.gridVisible = true;
        this.grid = null;
        this.cursorCross = null;
        this.cursorCrossVisible = false;

        this.originalCameraUp = new THREE.Vector3(0, 1, 0);
        this.originalCameraPosition = new THREE.Vector3();
        this.originalCameraTarget = new THREE.Vector3();

        // Инструменты
        this.tools = {};
        this.activeTool = null;

//        //привязка линии
//        this.snapToPointsEnabled = true;
//        this.snapRadius = 10; // Радиус привязки в пикселях

        this.initialize();
    }

    initialize() {
        this.initTools();
        this.createDimensionInput();
        this.updateToolButtons();
    }

    initTools() {
        // Регистрируем инструменты
        this.registerTool('select', new SelectSketchTool(this));
        this.registerTool('line', new LineSketchTool(this));
        this.registerTool('rectangle', new RectangleSketchTool(this));
        this.registerTool('circle', new CircleSketchTool(this));
        this.registerTool('polyline', new PolylineSketchTool(this));
        this.registerTool('polygon', new PolygonSketchTool(this));
        this.registerTool('curve', new CurveSketchTool(this));
        this.registerTool('text', new TextSketchTool(this));

        // Новые инструменты
        this.registerTool('mirror', new MirrorSketchTool(this));
        this.registerTool('oval', new OvalSketchTool(this));
        this.registerTool('stadium', new StadiumSketchTool(this));
        this.registerTool('arc', new ArcSketchTool(this));

        // Устанавливаем текущий инструмент
        this.setCurrentTool('line');
    }

    registerTool(name, tool) {
        this.tools[name] = tool;
    }

    setCurrentTool(toolName) {
        if (this.activeTool) {
            this.activeTool.onCancel();
        }

        this.currentTool = toolName;
        this.activeTool = this.tools[toolName];

        // Показываем крест для инструментов рисования, кроме выбора
        this.cursorCrossVisible = (toolName !== 'select' && toolName !== 'ruler');

        if (!this.cursorCrossVisible && this.cursorCross) {
            this.currentPlane.remove(this.cursorCross);
            this.cursorCross = null;
        }

        this.updateToolButtons();
    }

    // === Управление скетчами ===

    startSketchOnPlane(planeObject) {
        if (!planeObject) return;

        this.currentPlane = planeObject;
        this.currentSketch = {
            id: 'sketch_' + Date.now(),
            name: 'Чертеж',
            planeId: planeObject.uuid,
            elements: [],
            created: new Date().toISOString()
        };

        this.elements = [];
        this.selectedElements = [];
        //this.clearTempGeometry();
        this.clearDimensionObjects();
        this.setCurrentTool('line');
        this.attachMouseHandlers();
        this.orientCameraToPlane(planeObject);

        // Создаем сетку
        this.createSketchGrid();
    }

    editExistingSketch(planeObject) {
        if (!planeObject) return;

        // Проверяем, является ли объект плоскостью скетча
        if (planeObject.userData.type !== 'sketch_plane' &&
            planeObject.userData.type !== 'work_plane') {
            this.editor.showStatus('Выберите плоскость скетча для редактирования', 'error');
            return;
        }

        // Собираем все элементы скетча с этой плоскости
        this.collectSketchElements(planeObject);

        // Входим в режим редактирования
        this.currentPlane = planeObject;
        this.currentSketch = {
            id: planeObject.userData.sketchId || 'sketch_' + Date.now(),
            name: planeObject.userData.name || 'Чертеж',
            planeId: planeObject.uuid,
            elements: this.elements,
            created: planeObject.userData.createdAt || new Date().toISOString()
        };

        this.attachMouseHandlers();
        this.orientCameraToPlane(planeObject);

        // Создаем сетку
        if (this.gridVisible) {
            this.createSketchGrid();
        }

        this.editor.showStatus(`Режим редактирования скетча`, 'success');
    }

    collectSketchElements(planeObject) {
        this.elements = [];
        this.selectedElements = [];

        // Проходим по всем дочерним объектам плоскости
        planeObject.children.forEach(child => {
            if (child.userData && child.userData.type === 'sketch_element') {
                const element = {
                    type: child.userData.elementType,
                    mesh: child,
                    originalColor: child.userData.originalColor || new THREE.Color(this.sketchColor),
                    color: child.userData.originalColor || this.sketchColor,
                    localPoints: child.userData.localPoints,
                    localPosition: child.userData.localPosition,
                    content: child.userData.content,
                    fontSize: child.userData.fontSize || 20,
                    isClosed: child.userData.isClosed,
                    sketchPlaneId: child.userData.sketchPlaneId,
                    userData: child.userData
                };

                this.elements.push(element);
            }
        });

        return this.elements.length;
    }

    exitSketchMode() {
        // Сохраняем текущий скетч перед выходом
        // Восстанавливаем параметры камеры
        this.restoreCamera();

        if (this.cursorCross) {
            this.currentPlane.remove(this.cursorCross);
            this.cursorCross = null;
        }

        this.currentPlane = null;
        this.currentSketch = null;
        this.elements = [];
        this.selectedElements = [];
        this.currentTool = 'line';
        this.tempElement = null;
        this.isDrawing = false;

     //   this.clearTempGeometry();
        this.clearDimensionObjects();
        this.hideDimensionInput();
        this.detachMouseHandlers();

        this.removeSketchGrid();

        this.editor.controls.enableRotate = true;
        this.editor.controls.enablePan = true;
        this.editor.controls.enableZoom = true;

        this.updateToolButtons();

        this.editor.showStatus('Режим скетча завершен', 'info');
    }

    // === Обработчики событий (делегирование активному инструменту) ===

    onMouseDown(e) {
        // Если активно поле ввода, не обрабатываем клик для рисования
        if (this.isInputActive) {
            // Проверяем, не кликнули ли по самому полю ввода
            if (!this.dimensionInput.contains(e.target)) {
                // Кликнули вне поля ввода - применяем текущие значения
                this.applyDimensionInput();
            }
            return false;
        }

        if (this.activeTool) {
            return this.activeTool.onMouseDown(e);
        }
        return false;
    }


    onMouseMove(e) {
        const point = this.getPointOnPlane(e);
        if (point) {
            this.updateCursorCross(point);
            this.updateCoordinates(point);
        }

        // Если активно поле ввода, не передаем события инструменту
        if (this.isInputActive) return;

        if (this.activeTool) {
            this.activeTool.onMouseMove(e);
        }
    }

    onMouseUp(e) {
        if (this.activeTool) {
            this.activeTool.onMouseUp(e);
        }
    }

    onKeyDown(e) {
        if (this.activeTool) {
            return this.activeTool.onKeyDown(e);
        }
        return false;
    }

    // === Вспомогательные методы ===

    getPointOnPlane(event) {
        if (!this.currentPlane) return null;

        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        this.editor.raycaster.setFromCamera(mouse, this.editor.camera);

        const planeNormal = new THREE.Vector3(0, 0, 1);
        planeNormal.applyQuaternion(this.currentPlane.quaternion);

        const planePoint = this.currentPlane.position;
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

        const intersection = new THREE.Vector3();
        if (this.editor.raycaster.ray.intersectPlane(plane, intersection)) {
            const localPoint = this.currentPlane.worldToLocal(intersection.clone());
            localPoint.z = 0;

            if (this.snapEnabled) {
                localPoint.x = Math.round(localPoint.x / this.snapGrid) * this.snapGrid;
                localPoint.y = Math.round(localPoint.y / this.snapGrid) * this.snapGrid;
            }

            return this.currentPlane.localToWorld(localPoint);
        }

        return null;
    }

    updateCoordinates(event) {
        const point = this.getPointOnPlane(event);
        if (!point || !this.currentPlane) return;

        const localPoint = this.currentPlane.worldToLocal(point.clone());
        const coords = document.getElementById('coords');
        if (coords) {
            coords.textContent = `X: ${localPoint.x.toFixed(1)}, Y: ${localPoint.y.toFixed(1)}, Z: ${localPoint.z.toFixed(1)}`;
        }
    }

    // === Сетка ===

    createSketchGrid() {
        this.removeSketchGrid();

        if (!this.currentPlane || !this.gridVisible) return;

        const gridSize = 50;
        const gridStep = 1;
        const divisions = gridSize / gridStep;

        const gridColor = 0xAAAAAA;
        const centerColor = 0x555555;

        // Горизонтальные линии
        for (let i = -divisions; i <= divisions; i++) {
            const y = i * gridStep;
            const xStart = -gridSize;
            const xEnd = gridSize;

            const start = new THREE.Vector3(xStart, y, 0.05);
            const end = new THREE.Vector3(xEnd, y, 0.05);

            const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
            const material = new THREE.LineBasicMaterial({
                color: (i === 0) ? centerColor : gridColor,
                linewidth: 1,
                transparent: true,
                opacity: 0.6
            });

            const line = new THREE.Line(geometry, material);
            line.userData.isGrid = true;
            this.currentPlane.add(line);

            if (!this.grid) this.grid = [];
            this.grid.push(line);
        }

        // Вертикальные линии
        for (let i = -divisions; i <= divisions; i++) {
            const x = i * gridStep;
            const yStart = -gridSize;
            const yEnd = gridSize;

            const start = new THREE.Vector3(x, yStart, 0.05);
            const end = new THREE.Vector3(x, yEnd, 0.05);

            const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
            const material = new THREE.LineBasicMaterial({
                color: (i === 0) ? centerColor : gridColor,
                linewidth: 1,
                transparent: true,
                opacity: 0.6
            });

            const line = new THREE.Line(geometry, material);
            line.userData.isGrid = true;
            this.currentPlane.add(line);

            if (!this.grid) this.grid = [];
            this.grid.push(line);
        }
    }

    removeSketchGrid() {
        if (this.grid) {
            this.grid.forEach(line => {
                if (line.parent) {
                    line.parent.remove(line);
                }
                if (line.geometry) line.geometry.dispose();
                if (line.material) line.material.dispose();
            });
            this.grid = null;
        }
    }

    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        this.snapEnabled = !this.snapEnabled;
        if (this.gridVisible) {
            this.createSketchGrid();
        } else {
            this.removeSketchGrid();
        }
    }

    // === Камера ===

    orientCameraToPlane(plane) {
        this.originalCameraUp.copy(this.editor.camera.up);
        this.originalCameraPosition.copy(this.editor.camera.position);
        this.originalCameraTarget.copy(this.editor.controls.target);

        const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(plane.quaternion);
        const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(plane.quaternion);
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(plane.quaternion);

        const bbox = new THREE.Box3().setFromObject(plane);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxSize = Math.max(size.x, size.y, size.z);

        const planeSize = Math.max(maxSize, 100);
        const distance = planeSize / 2;
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        const cameraPosition = center.clone().add(normal.clone().multiplyScalar(distance));

        this.editor.camera.position.copy(cameraPosition);
        this.editor.camera.lookAt(center);
        this.editor.camera.up.copy(localY);
        this.editor.camera.up.normalize();

        this.editor.controls.target.copy(center);
        this.editor.controls.update();
    }

    restoreCamera() {
        this.editor.camera.up.copy(this.originalCameraUp);
        this.editor.camera.up.normalize();
        this.editor.camera.position.copy(this.originalCameraPosition);
        this.editor.controls.target.copy(this.originalCameraTarget);
        this.editor.camera.lookAt(this.editor.controls.target);
        this.editor.controls.update();
    }

    // === Размерные линии ===

    createDimensionLine(start, end) {
        this.clearDimensionObjects();

        if (!this.currentPlane) return;

        const localStart = this.currentPlane.worldToLocal(start.clone());
        const localEnd = this.currentPlane.worldToLocal(end.clone());

        const dx = localEnd.x - localStart.x;
        const dy = localEnd.y - localStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        const direction = new THREE.Vector3(dx, dy, 0).normalize();
        const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
        const offsetDist = 10;

        const lineStart = new THREE.Vector3(
            localStart.x + perpendicular.x * offsetDist,
            localStart.y + perpendicular.y * offsetDist,
            0.1
        );
        const lineEnd = new THREE.Vector3(
            localEnd.x + perpendicular.x * offsetDist,
            localEnd.y + perpendicular.y * offsetDist,
            0.1
        );

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([lineStart, lineEnd]);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: this.dimensionColor,
            linewidth: 2
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);

        const extLine1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localStart.x, localStart.y, 0.1),
                lineStart
            ]),
            new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
        );

        const extLine2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(localEnd.x, localEnd.y, 0.1),
                lineEnd
            ]),
            new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
        );

        const textPos = new THREE.Vector3()
            .addVectors(lineStart, lineEnd)
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(
                -perpendicular.y * 5,
                perpendicular.x * 5,
                0.1
            ));

        this.createDimensionText(textPos, `${length.toFixed(1)} мм`);

        [line, extLine1, extLine2].forEach(obj => {
            obj.userData.isDimension = true;
            this.currentPlane.add(obj);
            this.dimensionObjects.push(obj);
        });
    }

    updateDimensionLine(start, end) {
        this.clearDimensionObjects();
        this.createDimensionLine(start, end);
    }

    createRectangleDimensions(start, end) {
        this.clearDimensionObjects();

        if (!this.currentPlane) return;

        const localStart = this.currentPlane.worldToLocal(start.clone());
        const localEnd = this.currentPlane.worldToLocal(end.clone());

        const minX = Math.min(localStart.x, localEnd.x);
        const maxX = Math.max(localStart.x, localEnd.x);
        const minY = Math.min(localStart.y, localEnd.y);
        const maxY = Math.max(localStart.y, localEnd.y);

        const width = maxX - minX;
        const height = maxY - minY;

        // Ширина
        const widthLineStart = new THREE.Vector3(minX, minY - 10, 0.1);
        const widthLineEnd = new THREE.Vector3(maxX, minY - 10, 0.1);

        const widthGeometry = new THREE.BufferGeometry().setFromPoints([widthLineStart, widthLineEnd]);
        const widthMaterial = new THREE.LineBasicMaterial({
            color: this.dimensionColor,
            linewidth: 2
        });
        const widthLine = new THREE.Line(widthGeometry, widthMaterial);

        const widthExt1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(minX, minY, 0.1),
                new THREE.Vector3(minX, minY - 10, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
        );

        const widthExt2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(maxX, minY, 0.1),
                new THREE.Vector3(maxX, minY - 10, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
        );

        const widthTextPos = new THREE.Vector3(minX + width / 2, minY - 15, 0.1);
        this.createDimensionText(widthTextPos, `${width.toFixed(1)} мм`);

        // Высота
        const heightLineStart = new THREE.Vector3(maxX + 10, minY, 0.1);
        const heightLineEnd = new THREE.Vector3(maxX + 10, maxY, 0.1);

        const heightGeometry = new THREE.BufferGeometry().setFromPoints([heightLineStart, heightLineEnd]);
        const heightMaterial = new THREE.LineBasicMaterial({
            color: this.dimensionColor,
            linewidth: 2
        });
        const heightLine = new THREE.Line(heightGeometry, heightMaterial);

        const heightExt1 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(maxX, minY, 0.1),
                new THREE.Vector3(maxX + 10, minY, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
        );

        const heightExt2 = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(maxX, maxY, 0.1),
                new THREE.Vector3(maxX + 10, maxY, 0.1)
            ]),
            new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
        );

        const heightTextPos = new THREE.Vector3(maxX + 15, minY + height / 2, 0.1);
        this.createDimensionText(heightTextPos, `${height.toFixed(1)} мм`);

        [widthLine, widthExt1, widthExt2, heightLine, heightExt1, heightExt2].forEach(obj => {
            obj.userData.isDimension = true;
            this.currentPlane.add(obj);
            this.dimensionObjects.push(obj);
        });
    }

    updateRectangleDimensions(start, end) {
        this.clearDimensionObjects();
        this.createRectangleDimensions(start, end);
    }

    createDimensionText(position, text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 16px Arial';
        context.fillStyle = '#00C853';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });

        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        sprite.scale.set(20, 5, 1);
        sprite.userData.isDimension = true;

        this.currentPlane.add(sprite);
        this.dimensionObjects.push(sprite);
    }

    clearDimensionObjects() {
        this.dimensionObjects.forEach(obj => {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            if (obj.map) obj.map.dispose();
        });
        this.dimensionObjects = [];
    }

    // === Ввод размеров ===

    createDimensionInput() {
        const oldInput = document.getElementById('sketchDimensionInput');
        if (oldInput) oldInput.remove();

        this.dimensionInput = document.createElement('div');
        this.dimensionInput.id = 'sketchDimensionInput';
        this.dimensionInput.className = 'dimension-input-overlay';
        this.dimensionInput.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
            z-index: 10000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            border: 1px solid #00c853;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        `;
        this.dimensionInput.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 6px; min-width: 150px;">
                <div class="input-row" id="inputRow1" style="display: flex; align-items: center; gap: 8px;">
                    <label style="min-width: 40px; color: #aaa;">Длина:</label>
                    <input type="number" id="dimensionInput1" style="width: 80px; padding: 4px 6px; background: #333; color: white; border: 1px solid #666; border-radius: 3px; outline: none;">
                    <span style="color: #aaa;">мм</span>
                </div>
                <div class="input-row" id="inputRow2" style="display: none; align-items: center; gap: 8px;">
                    <label style="min-width: 40px; color: #aaa;">Высота:</label>
                    <input type="number" id="dimensionInput2" style="width: 80px; padding: 4px 6px; background: #333; color: white; border: 1px solid #666; border-radius: 3px; outline: none;">
                    <span style="color: #aaa;">мм</span>
                </div>
                <div class="input-row" id="inputRow3" style="display: none; align-items: center; gap: 8px;">
                    <label style="min-width: 40px; color: #aaa;">Стороны:</label>
                    <input type="number" id="dimensionInput3" style="width: 80px; padding: 4px 6px; background: #333; color: white; border: 1px solid #666; border-radius: 3px; outline: none;">
                    <span style="color: #aaa;">шт</span>
                </div>
                <div class="input-hint" style="font-size: 10px; color: #888; margin-top: 4px;">
                    Enter - применить, Esc - отмена
                </div>
            </div>
        `;

        document.body.appendChild(this.dimensionInput);

        this.inputField1 = document.getElementById('dimensionInput1');
        this.inputField2 = document.getElementById('dimensionInput2');
        this.inputField3 = document.getElementById('dimensionInput3');

        this.setupInputListeners();
    }

    setupInputListeners() {
        [this.inputField1, this.inputField2, this.inputField3].forEach((field, index) => {
            if (field) {
                field.addEventListener('keydown', (e) => this.handleInputKeyDown(e, index + 1));
                field.addEventListener('input', (e) => this.handleInputChange(e, index + 1));
            }
        });

        this.dimensionInput.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.inputField1) this.inputField1.focus();
        });

        document.addEventListener('mousedown', (e) => {
            if (this.dimensionInput &&
                this.dimensionInput.style.opacity === '1' &&
                !this.dimensionInput.contains(e.target)) {
                this.applyDimensionInput();
            }
        });
    }

    // sketch-manager.js - заменяем метод showDimensionInput
    showDimensionInput(event, config) {
        if (!this.dimensionInput) return;

        // Позиционируем рядом с курсором
        this.dimensionInput.style.left = `${event.clientX + 15}px`;
        this.dimensionInput.style.top = `${event.clientY - 10}px`;
        this.dimensionInput.style.opacity = '1';
        this.dimensionInput.style.pointerEvents = 'auto';

        // Скрываем все строки
        for (let i = 1; i <= 3; i++) {
            const row = document.getElementById(`inputRow${i}`);
            if (row) row.style.display = 'none';
        }

        // Настраиваем поля ввода
        if (config.fields && Array.isArray(config.fields)) {
            config.fields.forEach((field, index) => {
                const row = document.getElementById(`inputRow${index + 1}`);
                if (row) {
                    row.style.display = 'flex';
                    const label = row.querySelector('label');
                    const input = row.querySelector('input');
                    const unit = row.querySelector('span');

                    if (label) label.textContent = field.label + ':';
                    if (input) {
                        input.type = field.type || 'number';
                        input.value = field.value || '';
                        input.min = field.min || '';
                        input.max = field.max || '';
                        input.step = field.step || '1';
                        input.placeholder = field.placeholder || '';
                    }
                    if (unit) unit.textContent = field.unit || '';
                }
            });
        }

        // Фокус на первое поле
        if (this.inputField1) {
            this.inputField1.focus();
            this.inputField1.select();
        }

        this.isInputActive = true;
    }

    // Добавляем метод applyDimensionInput для новых инструментов
    applyDimensionInput() {
        if (!this.activeTool || !this.activeTool.tempElement) {
            this.hideDimensionInput();
            return;
        }

        const tool = this.activeTool;

        // Получаем значения из полей ввода
        const values = {};
        for (let i = 1; i <= 3; i++) {
            const row = document.getElementById(`inputRow${i}`);
            if (row && row.style.display !== 'none') {
                const input = row.querySelector('input');
                if (input) {
                    const fieldName = `value${i}`;
                    if (input.type === 'number') {
                        values[fieldName] = parseFloat(input.value) || 0;
                    } else {
                        values[fieldName] = input.value.trim();
                    }
                }
            }
        }

        // Вызываем метод инструмента для применения размеров
        if (tool.applyDimensions) {
            tool.applyDimensions(values);
        }

        this.hideDimensionInput();
        tool.clearTempGeometry();
        tool.tempElement = null;
    }

    hideDimensionInput() {
        if (!this.dimensionInput) return;

        this.dimensionInput.style.opacity = '0';
        this.dimensionInput.style.pointerEvents = 'none';
        this.isInputActive = false;

        if (this.inputField1) {
            this.inputField1.type = 'number';
        }
    }

    handleInputKeyDown(e, fieldNum) {
        e.stopPropagation();

        switch (e.key) {
            case 'Enter':
                this.applyDimensionInput();
                e.preventDefault();
                break;
            case 'Escape':
                this.hideDimensionInput();
                this.cancelCurrentOperation();
                e.preventDefault();
                break;
            case 'Tab':
                e.preventDefault();
                this.focusNextInput(fieldNum);
                break;
        }
    }

    handleInputChange(e, fieldNum) {
        if (!this.activeTool || !this.activeTool.tempElement) return;

        const value = fieldNum === 1 ? e.target.value : parseFloat(e.target.value) || 0;

        // Если инструмент имеет свой метод handleInputChange, вызываем его
        if (this.activeTool && this.activeTool.handleInputChange) {
            this.activeTool.handleInputChange(fieldNum, value);
            return;
        }

        // Старая логика для обратной совместимости (можно удалить позже)
//        const value = parseFloat(e.target.value) || 0;
//        const tool = this.activeTool;
//
//        switch (tool.tempElement.type) {
//            case 'line':
//                if (fieldNum === 1) tool.updateLineLength(value);
//                break;
//            case 'rectangle':
//                if (fieldNum === 1) tool.updateRectangleWidth(value);
//                if (fieldNum === 2) tool.updateRectangleHeight(value);
//                break;
//            case 'circle':
//                if (fieldNum === 1) tool.updateCircleDiameter(value);
//                if (fieldNum === 2) tool.updateCircleSegments(value);
//                break;
//            case 'polygon':
//                if (fieldNum === 1) tool.updatePolygonDiameter(value);
//                if (fieldNum === 2) tool.updatePolygonSides(value);
//                break;
//        }
    }

    focusNextInput(currentField) {
        const fields = [this.inputField1, this.inputField2, this.inputField3];
        const nextIndex = (currentField) % fields.length;

        if (fields[nextIndex] && fields[nextIndex].style.display !== 'none') {
            fields[nextIndex].focus();
            fields[nextIndex].select();
        }
    }


    // === Управление элементами ===

    addElement(element) {
        if (!element) return;

        if (element.type === 'text') {
            // Для текста создаем группу контуров
            const textGroup = new THREE.Group();

            if (element.contours && element.contours.length > 0) {
                element.contours.forEach((contour, index) => {
                    const geometry = new THREE.BufferGeometry();
                    const vertices = [];

                    // Преобразуем мировые координаты в локальные
                    contour.forEach(point => {
                        const localPoint = this.currentPlane.worldToLocal(point.clone());
                        vertices.push(localPoint.x, localPoint.y, 0);
                    });

                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

                    const mesh = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                        color: new THREE.Color(element.color),
                        linewidth: 2
                    }));

                    mesh.userData = {
                        type: 'sketch_element',
                        elementType: element.type,
                        isClosed: true,
                        textIndex: index,
                        totalParts: element.contours.length,
                        originalColor: new THREE.Color(element.color)
                    };

                    textGroup.add(mesh);
                });
            } else {
                // Если нет контуров, создаем простой прямоугольник
                const geometry = new THREE.BufferGeometry();
                const charWidth = element.fontSize * 0.6 * element.content.length;
                const charHeight = element.fontSize;
                const localPos = this.currentPlane.worldToLocal(element.position.clone());

                const vertices = [
                    localPos.x, localPos.y, 0,
                    localPos.x + charWidth, localPos.y, 0,
                    localPos.x + charWidth, localPos.y + charHeight, 0,
                    localPos.x, localPos.y + charHeight, 0,
                    localPos.x, localPos.y, 0
                ];

                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

                const mesh = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                    color: new THREE.Color(element.color),
                    linewidth: 2
                }));

                mesh.userData = {
                    type: 'sketch_element',
                    elementType: element.type,
                    isClosed: true,
                    isText: true,
                    originalColor: new THREE.Color(element.color)
                };

                textGroup.add(mesh);
            }

            textGroup.userData = {
                type: 'sketch_element',
                elementType: element.type,
                isClosed: true,
                isText: true,
                originalColor: new THREE.Color(element.color),
                sketchPlaneId: this.currentPlane.uuid,
                content: element.content,
                fontSize: element.fontSize,
                localPosition: this.currentPlane.worldToLocal(element.position.clone()),
                createdAt: new Date().toISOString()
            };

            this.currentPlane.add(textGroup);
            element.mesh = textGroup;
            this.elements.push(element);

        } else {
            // ... существующий код для других элементов ...
            const isClosed = ['line','polyline','rectangle', 'circle', 'polygon', 'oval', 'stadium'].includes(element.type);

            // Преобразуем мировые координаты точек в локальные относительно плоскости
            const localPoints = element.points ? element.points.map(p =>
                this.currentPlane.worldToLocal(p.clone())
            ) : [];

            const geometry = new THREE.BufferGeometry();
            const vertices = [];

            localPoints.forEach(point => {
                vertices.push(point.x, point.y, 0);
            });

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

            let mesh;
            if (isClosed) {
                mesh = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                    color: new THREE.Color(element.color || this.sketchColor),
                    linewidth: 2
                }));
            } else {
                mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({
                    color: new THREE.Color(element.color || this.sketchColor),
                    linewidth: 2
                }));
            }

            mesh.userData = {
                type: 'sketch_element',
                elementType: element.type,
                isClosed: isClosed,
                originalColor: new THREE.Color(element.color || this.sketchColor),
                sketchPlaneId: this.currentPlane.uuid,
                localPoints: localPoints,
                createdAt: new Date().toISOString()
            };

            this.currentPlane.add(mesh);
            element.mesh = mesh;
            this.elements.push(element);
        }

        this.saveToHistory();

        const toolNames = {
            line: 'Линия',
            rectangle: 'Прямоугольник',
            circle: 'Окружность',
            polygon: 'Многоугольник',
            polyline: 'Полилиния',
            curve: 'Кривая',
            text: 'Текст',
            oval: 'Овал',
            stadium: 'Стадион',
            arc: 'Дуга',
            mirror: 'Симметрия'
        };

        this.editor.showStatus(`Добавлен элемент: ${toolNames[element.type] || element.type}`, 'success');
    }

    getElementAtPoint(point) {
        if (!this.currentPlane) return null;

        const localPoint = this.currentPlane.worldToLocal(point.clone());
        const threshold = 5;

        for (let i = this.elements.length - 1; i >= 0; i--) {
            const element = this.elements[i];
            if (!element.mesh) continue;

            if (element.type === 'text') {
                const pos = element.mesh.position;
                const scale = element.mesh.scale;
                const halfWidth = scale.x / 2;
                const halfHeight = scale.y / 2;

                if (Math.abs(localPoint.x - pos.x) <= halfWidth &&
                    Math.abs(localPoint.y - pos.y) <= halfHeight) {
                    return element;
                }
            } else {
                const points = element.mesh.userData?.localPoints || [];
                for (let j = 0; j < points.length - 1; j++) {
                    const p1 = points[j];
                    const p2 = points[j + 1];

                    const distance = this.pointToLineDistance(localPoint, p1, p2);
                    if (distance <= threshold) {
                        return element;
                    }
                }
            }
        }

        return null;
    }

    pointToLineDistance(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    selectElement(element) {
        this.clearSelection();
        this.selectedElements = [element];
        this.highlightElement(element);
        this.editor.showStatus(`Выбран элемент: ${this.getToolName(element.type)}`, 'info');
    }

    toggleElementSelection(element) {
        const index = this.selectedElements.indexOf(element);
        if (index > -1) {
            this.unhighlightElement(element);
            this.selectedElements.splice(index, 1);
        } else {
            this.selectedElements.push(element);
            this.highlightElement(element);
        }
        this.editor.showStatus(`Выбрано элементов: ${this.selectedElements.length}`, 'info');
    }

    selectAllElements() {
        this.clearSelection();
        this.selectedElements = [...this.elements];
        this.selectedElements.forEach(element => this.highlightElement(element));
        this.editor.showStatus(`Выбрано всех элементов: ${this.selectedElements.length}`, 'info');
    }

    clearSelection() {
        this.selectedElements.forEach(element => this.unhighlightElement(element));
        this.selectedElements = [];
    }

    highlightElement(element) {
        if (!element.mesh) return;

        if (element.mesh.material) {
            if (!element.originalColor) {
                if (element.mesh.material.color) {
                    element.originalColor = element.mesh.material.color.clone();
                } else {
                    element.originalColor = new THREE.Color(this.sketchColor);
                }
            }

            if (element.mesh.material.color) {
                element.mesh.material.color.set(this.highlightColor);
                element.mesh.material.needsUpdate = true;
            }

            if (element.mesh.material.linewidth !== undefined) {
                element.mesh.material.linewidth = 4;
                element.mesh.material.needsUpdate = true;
            }

            if (element.type === 'text' && element.mesh.scale) {
                element.originalScale = element.mesh.scale.clone();
                element.mesh.scale.multiplyScalar(1.2);
            }
        }
    }

    unhighlightElement(element) {
        if (!element.mesh) return;

        if (element.mesh.material && element.originalColor) {
            element.mesh.material.color.copy(element.originalColor);
            element.mesh.material.needsUpdate = true;

            if (element.mesh.material.linewidth !== undefined) {
                element.mesh.material.linewidth = 2;
                element.mesh.material.needsUpdate = true;
            }

            if (element.type === 'text' && element.originalScale && element.mesh.scale) {
                element.mesh.scale.copy(element.originalScale);
            }
        }
    }

    deleteSelectedElements() {
        if (this.selectedElements.length === 0) {
            this.editor.showStatus('Нет выделенных элементов для удаления', 'warning');
            return;
        }

        if (!confirm(`Удалить ${this.selectedElements.length} элементов?`)) {
            return;
        }

        const deletedElements = [...this.selectedElements];

        deletedElements.forEach(element => {
            if (element.mesh && element.mesh.parent) {
                element.mesh.parent.remove(element.mesh);

                if (element.mesh.geometry) element.mesh.geometry.dispose();
                if (element.mesh.material) element.mesh.material.dispose();
                if (element.mesh.map) element.mesh.map.dispose();
            }

            const index = this.elements.indexOf(element);
            if (index > -1) {
                this.elements.splice(index, 1);
            }
        });

        this.selectedElements = [];
        this.saveToHistory();
        this.editor.showStatus(`Удалено элементов: ${deletedElements.length}`, 'success');
    }

    deleteAllElements() {
        if (this.elements.length === 0) return;

        if (!confirm('Очистить весь чертеж?')) return;

        this.elements.forEach(element => {
            if (element.mesh && element.mesh.parent) {
                element.mesh.parent.remove(element.mesh);

                if (element.mesh.geometry) element.mesh.geometry.dispose();
                if (element.mesh.material) element.mesh.material.dispose();
                if (element.mesh.map) element.mesh.map.dispose();
            }
        });

        this.elements = [];
        this.selectedElements = [];
       // this.clearTempGeometry();
        this.saveToHistory();
        this.editor.showStatus('Чертеж очищен', 'success');
    }

    cancelCurrentOperation() {
        this.isDrawing = false;
        if (this.activeTool) {
            this.activeTool.onCancel();
        }
        this.editor.showStatus('Операция отменена', 'info');
    }

    // === История ===

    saveToHistory() {
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push({
            elements: JSON.parse(JSON.stringify(this.elements.map(el => ({
                ...el,
                mesh: null,
                textMesh: null
            })))),
            timestamp: Date.now()
        });
        this.historyIndex = this.history.length - 1;
    }

    undo() {
        if (this.historyIndex <= 0) return;

        this.historyIndex--;
        const state = this.history[this.historyIndex];
        this.restoreState(state);
        this.editor.showStatus('Отменено последнее действие', 'info');
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return;

        this.historyIndex++;
        const state = this.history[this.historyIndex];
        this.restoreState(state);
        this.editor.showStatus('Повторено последнее действие', 'info');
    }

    restoreState(state) {
        this.elements.forEach(element => {
            if (element.mesh && element.mesh.parent) {
                element.mesh.parent.remove(element.mesh);
                if (element.mesh.geometry) element.mesh.geometry.dispose();
                if (element.mesh.material) element.mesh.material.dispose();
                if (element.mesh.map) element.mesh.map.dispose();
            }
        });

        this.elements = [];
        this.selectedElements = [];

        if (state && state.elements) {
            state.elements.forEach(elementData => {
                const element = { ...elementData };
                this.addElement(element);
            });
        }
    }

    // === Обработчики событий ===

    attachMouseHandlers() {
        const canvas = this.editor.renderer.domElement;

        this.mouseDownHandler = (e) => this.onMouseDown(e);
        this.mouseMoveHandler = (e) => this.onMouseMove(e);
        this.mouseUpHandler = (e) => this.onMouseUp(e);
        this.keyDownHandler = (e) => this.onKeyDown(e);

        canvas.addEventListener('mousedown', this.mouseDownHandler);
        canvas.addEventListener('mousemove', this.mouseMoveHandler);
        canvas.addEventListener('mouseup', this.mouseUpHandler);
        document.addEventListener('keydown', this.keyDownHandler);

        this.initDoubleClickHandler();
    }

    detachMouseHandlers() {
        const canvas = this.editor.renderer.domElement;

        if (this.mouseDownHandler) canvas.removeEventListener('mousedown', this.mouseDownHandler);
        if (this.mouseMoveHandler) canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        if (this.mouseUpHandler) canvas.removeEventListener('mouseup', this.mouseUpHandler);
        if (this.keyDownHandler) document.removeEventListener('keydown', this.keyDownHandler);
    }

    initDoubleClickHandler() {
        const canvas = this.editor.renderer.domElement;
        let clickCount = 0;
        let clickTimer = null;

        canvas.addEventListener('click', (e) => {
            if (e.button !== 0) return;

            clickCount++;
            if (clickCount === 1) {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 300);
            } else if (clickCount === 2) {
                clearTimeout(clickTimer);
                clickCount = 0;

                if (this.currentTool === 'polyline' && this.activeTool && this.activeTool.tempElement &&
                    this.activeTool.tempElement.type === 'polyline') {
                    this.activeTool.completePolyline();
                }
            }
        });
    }

    // === Вспомогательные методы ===

    getToolName(tool) {
        const names = {
            select: 'Выделение',
            line: 'Линия',
            rectangle: 'Прямоугольник',
            circle: 'Окружность',
            polyline: 'Полилиния',
            polygon: 'Многоугольник',
            curve: 'Кривая',
            text: 'Текст'
        };
        return names[tool] || tool;
    }

    updateToolButtons() {
        document.querySelectorAll('[data-sketch-tool]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.sketchTool === this.currentTool) {
                btn.classList.add('active');
            }
        });
    }

    updateCursorCross(position) {
        if (!this.currentPlane || !this.cursorCrossVisible) return;

        if (!this.cursorCross) {
            // Создаем крест
            const crossSize = 1; // Размер в мм

            // Горизонтальная линия
            const geometry1 = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-crossSize, 0, 0.2),
                new THREE.Vector3(crossSize, 0, 0.2)
            ]);

            // Вертикальная линия
            const geometry2 = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, -crossSize, 0.2),
                new THREE.Vector3(0, crossSize, 0.2)
            ]);

            const material = new THREE.LineBasicMaterial({
                color: 0xFFFF00,
                linewidth: 2,
                transparent: true,
                opacity: 0.7
            });

            const line1 = new THREE.Line(geometry1, material);
            const line2 = new THREE.Line(geometry2, material);

            this.cursorCross = new THREE.Group();
            this.cursorCross.add(line1, line2);
            this.cursorCross.userData.isCursorCross = true;
            this.currentPlane.add(this.cursorCross);
        }

        // Обновляем позицию
        const localPos = this.currentPlane.worldToLocal(position.clone());
        this.cursorCross.position.set(localPos.x, localPos.y, 0.2);
    }

    // Делегированные методы
    setSketchTool(tool) {
        this.setCurrentTool(tool);
    }

    deleteSelected() {
        this.deleteSelectedElements();
    }

    clearSketch() {
        this.deleteAllElements();
    }


    // ============= РАЗМЕРНЫЕ ЛИНИИ =============

createCircleDimensions(center, radius) {
    this.clearDimensionObjects();

    if (!this.currentPlane) return;

    const localCenter = this.currentPlane.worldToLocal(center.clone());

    // Линия диаметра (горизонтальная)
    const diamStart = new THREE.Vector3(localCenter.x - radius, localCenter.y, 0.1);
    const diamEnd = new THREE.Vector3(localCenter.x + radius, localCenter.y, 0.1);

    const diamGeometry = new THREE.BufferGeometry().setFromPoints([diamStart, diamEnd]);
    const diamMaterial = new THREE.LineBasicMaterial({
        color: this.dimensionColor,
        linewidth: 2
    });
    const diamLine = new THREE.Line(diamGeometry, diamMaterial);

    // Выносные линии для диаметра
    const extLine1 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(localCenter.x - radius, localCenter.y - 5, 0.1),
            new THREE.Vector3(localCenter.x - radius, localCenter.y + 5, 0.1)
        ]),
        new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
    );

    const extLine2 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(localCenter.x + radius, localCenter.y - 5, 0.1),
            new THREE.Vector3(localCenter.x + radius, localCenter.y + 5, 0.1)
        ]),
        new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
    );

    // Текст диаметра (под линией)
    const textPos = new THREE.Vector3(localCenter.x, localCenter.y - 10, 0.1);
    this.createDimensionText(textPos, `Ø${(radius * 2).toFixed(1)}`);

    [diamLine, extLine1, extLine2].forEach(obj => {
        obj.userData.isDimension = true;
        this.currentPlane.add(obj);
        this.dimensionObjects.push(obj);
    });
}

updateCircleDimensions(center, radius) {
    this.clearDimensionObjects();
    this.createCircleDimensions(center, radius);
}

createRectangleDimensions(start, end) {
    this.clearDimensionObjects();

    if (!this.currentPlane) return;

    const localStart = this.currentPlane.worldToLocal(start.clone());
    const localEnd = this.currentPlane.worldToLocal(end.clone());

    const minX = Math.min(localStart.x, localEnd.x);
    const maxX = Math.max(localStart.x, localEnd.x);
    const minY = Math.min(localStart.y, localEnd.y);
    const maxY = Math.max(localStart.y, localEnd.y);

    const width = maxX - minX;
    const height = maxY - minY;

    // Ширина
    const widthLineStart = new THREE.Vector3(minX, minY - 10, 0.1);
    const widthLineEnd = new THREE.Vector3(maxX, minY - 10, 0.1);

    const widthGeometry = new THREE.BufferGeometry().setFromPoints([widthLineStart, widthLineEnd]);
    const widthMaterial = new THREE.LineBasicMaterial({
        color: this.dimensionColor,
        linewidth: 2
    });
    const widthLine = new THREE.Line(widthGeometry, widthMaterial);

    const widthExt1 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(minX, minY, 0.1),
            new THREE.Vector3(minX, minY - 10, 0.1)
        ]),
        new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
    );

    const widthExt2 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(maxX, minY, 0.1),
            new THREE.Vector3(maxX, minY - 10, 0.1)
        ]),
        new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
    );

    const widthTextPos = new THREE.Vector3(minX + width/2, minY - 15, 0.1);
    this.createDimensionText(widthTextPos, `${width.toFixed(1)} мм`);

    // Высота
    const heightLineStart = new THREE.Vector3(maxX + 10, minY, 0.1);
    const heightLineEnd = new THREE.Vector3(maxX + 10, maxY, 0.1);

    const heightGeometry = new THREE.BufferGeometry().setFromPoints([heightLineStart, heightLineEnd]);
    const heightMaterial = new THREE.LineBasicMaterial({
        color: this.dimensionColor,
        linewidth: 2
    });
    const heightLine = new THREE.Line(heightGeometry, heightMaterial);

    const heightExt1 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(maxX, minY, 0.1),
            new THREE.Vector3(maxX + 10, minY, 0.1)
        ]),
        new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
    );

    const heightExt2 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(maxX, maxY, 0.1),
            new THREE.Vector3(maxX + 10, maxY, 0.1)
        ]),
        new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
    );

    const heightTextPos = new THREE.Vector3(maxX + 15, minY + height/2, 0.1);
    this.createDimensionText(heightTextPos, `${height.toFixed(1)} мм`);

    [widthLine, widthExt1, widthExt2, heightLine, heightExt1, heightExt2].forEach(obj => {
        obj.userData.isDimension = true;
        this.currentPlane.add(obj);
        this.dimensionObjects.push(obj);
    });
}

updateRectangleDimensions(start, end) {
    this.clearDimensionObjects();
    this.createRectangleDimensions(start, end);
}

createPolygonDimensions(center, radius, sides) {
    this.clearDimensionObjects();

    if (!this.currentPlane) return;

    const localCenter = this.currentPlane.worldToLocal(center.clone());

    // Линия радиуса
    const radiusEnd = new THREE.Vector3(localCenter.x + radius, localCenter.y, 0.1);

    const radiusGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(localCenter.x, localCenter.y, 0.1),
        radiusEnd
    ]);
    const radiusMaterial = new THREE.LineBasicMaterial({
        color: this.dimensionColor,
        linewidth: 2
    });
    const radiusLine = new THREE.Line(radiusGeometry, radiusMaterial);

    // Текст с количеством сторон
    const textPos = new THREE.Vector3(localCenter.x, localCenter.y - 10, 0.1);
    this.createDimensionText(textPos, `${sides}-угольник`);

    radiusLine.userData.isDimension = true;
    this.currentPlane.add(radiusLine);
    this.dimensionObjects.push(radiusLine);
}

updatePolygonDimensions(center, radius, sides) {
    this.clearDimensionObjects();
    this.createPolygonDimensions(center, radius, sides);
}

createDimensionLine(start, end) {
    this.clearDimensionObjects();

    if (!this.currentPlane) return;

    const localStart = this.currentPlane.worldToLocal(start.clone());
    const localEnd = this.currentPlane.worldToLocal(end.clone());

    const dx = localEnd.x - localStart.x;
    const dy = localEnd.y - localStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    const direction = new THREE.Vector3(dx, dy, 0).normalize();
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    const offsetDist = 10;

    const lineStart = new THREE.Vector3(
        localStart.x + perpendicular.x * offsetDist,
        localStart.y + perpendicular.y * offsetDist,
        0.1
    );
    const lineEnd = new THREE.Vector3(
        localEnd.x + perpendicular.x * offsetDist,
        localEnd.y + perpendicular.y * offsetDist,
        0.1
    );

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([lineStart, lineEnd]);
    const lineMaterial = new THREE.LineBasicMaterial({
        color: this.dimensionColor,
        linewidth: 2
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);

    const extLine1 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(localStart.x, localStart.y, 0.1),
            lineStart
        ]),
        new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
    );

    const extLine2 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(localEnd.x, localEnd.y, 0.1),
            lineEnd
        ]),
        new THREE.LineBasicMaterial({ color: this.dimensionColor, linewidth: 1 })
    );

    const textPos = new THREE.Vector3()
        .addVectors(lineStart, lineEnd)
        .multiplyScalar(0.5)
        .add(new THREE.Vector3(
            -perpendicular.y * 5,
            perpendicular.x * 5,
            0.1
        ));

    this.createDimensionText(textPos, `${length.toFixed(1)} мм`);

    [line, extLine1, extLine2].forEach(obj => {
        obj.userData.isDimension = true;
        this.currentPlane.add(obj);
        this.dimensionObjects.push(obj);
    });
}

updateDimensionLine(start, end) {
    this.clearDimensionObjects();
    this.createDimensionLine(start, end);
}

createDimensionText(position, text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 16px Arial';
    context.fillStyle = '#00C853';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(position);
    sprite.scale.set(20, 5, 1);
    sprite.userData.isDimension = true;

    this.currentPlane.add(sprite);
    this.dimensionObjects.push(sprite);
}

clearDimensionObjects() {
    this.dimensionObjects.forEach(obj => {
        if (obj.parent) {
            obj.parent.remove(obj);
        }
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        if (obj.map) obj.map.dispose();
    });
    this.dimensionObjects = [];
}
}