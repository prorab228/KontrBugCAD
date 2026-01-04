/**
 * SketchTools - исправленный инструмент для чертежей
 */
class SketchTools {
    constructor(cadEditor) {
        this.editor = cadEditor;
        this.currentTool = 'line';
        this.isDrawing = false;
        this.currentPlane = null;
        this.sketches = [];
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

        // Текущие параметры
        this.currentWidth = 0;
        this.currentHeight = 0;
        this.currentDiameter = 0;
        this.currentSides = 6;
        this.currentText = 'Текст';
        this.fontSize = 20;

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

        //сетка
        this.gridVisible = true;
        this.grid = null;
        this.cursorCross = null;
        this.cursorCrossVisible = false;

        this.originalCameraUp = new THREE.Vector3(0, 1, 0);
        this.originalCameraPosition = new THREE.Vector3();
        this.originalCameraTarget = new THREE.Vector3();

        this.closedContours = [];
        this.currentContour = null;



        this.initialize();
    }

    initialize() {
        this.createDimensionInput();
        this.updateToolButtons();
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


    // СЕТКА
    createSketchGrid() {
        this.removeSketchGrid();

        if (!this.currentPlane || !this.gridVisible) return;

        // Размер сетки и шаг
        const gridSize = 50; // Общий размер сетки
        const gridStep = 1;  // Шаг сетки в мм
        const divisions = gridSize / gridStep;

        // Цвета
        const gridColor = 0xAAAAAA;
        const centerColor = 0x555555;

        // Создаем линии в локальных координатах плоскости
        // Горизонтальные линии (вдоль оси X плоскости)
        for (let i = -divisions; i <= divisions; i++) {
            const y = i * gridStep; // Локальная координата Y в плоскости
            const xStart = -gridSize;
            const xEnd = gridSize;

            const start = new THREE.Vector3(xStart, y, 0.05); // Z = 0.05 для отображения над плоскостью
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

        // Вертикальные линии (вдоль оси Y плоскости)
        for (let i = -divisions; i <= divisions; i++) {
            const x = i * gridStep; // Локальная координата X в плоскости
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

    // ИНТЕРФЕЙС ВВОДА РАЗМЕРОВ (старый дизайн)
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

        // Клик по окну ввода не скрывает его
        this.dimensionInput.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.inputField1) this.inputField1.focus();
        });

        // Клик вне окна ввода скрывает его
        document.addEventListener('mousedown', (e) => {
            if (this.dimensionInput &&
                this.dimensionInput.style.opacity === '1' &&
                !this.dimensionInput.contains(e.target)) {
//                this.hideDimensionInput();
//                this.cancelCurrentOperation();
                this.applyDimensionInput();
            }
        });
    }

    showDimensionInput(x, y, type = 'single', values = {}) {
        if (!this.dimensionInput) return;

        // Позиционируем рядом с курсором
        this.dimensionInput.style.left = `${x + 15}px`;
        this.dimensionInput.style.top = `${y - 10}px`;
        this.dimensionInput.style.opacity = '1';
        this.dimensionInput.style.pointerEvents = 'auto';

        // Скрываем все строки
        for (let i = 1; i <= 3; i++) {
            const row = document.getElementById(`inputRow${i}`);
            if (row) row.style.display = 'none';
        }

        // Настраиваем поля в зависимости от типа
        switch(type) {
            case 'single': // Линия
                document.getElementById('inputRow1').style.display = 'flex';
                document.querySelector('#inputRow1 label').textContent = 'Длина:';
                this.inputField1.type = 'number';
                this.inputField1.value = values.value1 || '';
                this.inputField1.focus();
                this.inputField1.select();
                break;

            case 'rectangle':
                document.getElementById('inputRow1').style.display = 'flex';
                document.getElementById('inputRow2').style.display = 'flex';
                document.querySelector('#inputRow1 label').textContent = 'Ширина:';
                document.querySelector('#inputRow2 label').textContent = 'Высота:';
                this.inputField1.value = values.value1 || '';
                this.inputField2.value = values.value2 || '';
                this.inputField1.focus();
                this.inputField1.select();
                break;

            case 'circle':
                document.getElementById('inputRow1').style.display = 'flex';
                document.querySelector('#inputRow1 label').textContent = 'Диаметр:';
                this.inputField1.value = values.value1 || '';
                this.inputField1.focus();
                this.inputField1.select();
                break;

            case 'polygon':
                document.getElementById('inputRow1').style.display = 'flex';
                document.getElementById('inputRow3').style.display = 'flex';
                document.querySelector('#inputRow1 label').textContent = 'Диаметр:';
                document.querySelector('#inputRow3 label').textContent = 'Стороны:';
                this.inputField1.value = values.value1 || '';
                this.inputField3.value = values.value3 || this.currentSides;
                this.inputField1.focus();
                this.inputField1.select();
                break;

            case 'text':
                document.getElementById('inputRow1').style.display = 'flex';
                document.querySelector('#inputRow1 label').textContent = 'Текст:';
                this.inputField1.type = 'text';
                this.inputField1.value = values.value1 || this.currentText;
                this.inputField1.focus();
                this.inputField1.select();
                break;
        }

        this.isInputActive = true;
    }

    hideDimensionInput() {
        if (!this.dimensionInput) return;

        this.dimensionInput.style.opacity = '0';
        this.dimensionInput.style.pointerEvents = 'none';
        this.isInputActive = false;

        // Восстанавливаем тип первого поля
        if (this.inputField1) {
            this.inputField1.type = 'number';
        }
    }

    handleInputKeyDown(e, fieldNum) {
        e.stopPropagation();

        switch(e.key) {
            case 'Enter':
                // Для текста - не скрывать окно при нажатии Enter, а применять
                if (this.tempElement && this.tempElement.type === 'text') {
                    this.applyDimensionInput();
                } else {
                    this.applyDimensionInput();
                }
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
        if (!this.tempElement) return;

        const value = parseFloat(e.target.value) || 0;

        switch(this.tempElement.type) {
            case 'line':
                if (value > 0) this.updateLineLength(value);
                break;
            case 'rectangle':
                if (fieldNum === 1) this.updateRectangleWidth(value);
                if (fieldNum === 2) this.updateRectangleHeight(value);
                break;
            case 'circle':
                if (value > 0) this.updateCircleDiameter(value);
                break;
            case 'polygon':
                if (fieldNum === 1) this.updatePolygonDiameter(value);
                if (fieldNum === 3) this.updatePolygonSides(Math.max(3, Math.min(50, Math.round(value))));
                break;
        }
    }

    focusNextInput(currentField) {
        const fields = [this.inputField1, this.inputField2, this.inputField3];
        const nextIndex = (currentField) % fields.length;

        if (fields[nextIndex] && fields[nextIndex].style.display !== 'none') {
            fields[nextIndex].focus();
            fields[nextIndex].select();
        }
    }

    applyDimensionInput() {
        if (!this.tempElement) {
            this.hideDimensionInput();
            return;
        }

        // Для текста - отдельная обработка
        if (this.tempElement.type === 'text') {
            const textValue = this.inputField1.value.trim();
            if (textValue) {
                // Создаем элемент текста
                const textElement = {
                    type: 'text',
                    position: this.tempElement.position.clone(),
                    content: textValue,
                    fontSize: this.fontSize,
                    points: this.calculateTextPoints(this.tempElement.position, textValue, this.fontSize),
                    color: this.sketchColor,
                    textMesh: null
                };

                // Создаем временную геометрию для предпросмотра
                this.createTextGeometry(textElement);

                // Добавляем элемент
                this.addElement(textElement);
            }
            this.hideDimensionInput();
            this.clearTempOperation();
            return;
        }

        // Остальной код для других элементов...
        let value1 = parseFloat(this.inputField1.value);
        let value2 = this.inputField2 && this.inputField2.style.display !== 'none' ?
                     parseFloat(this.inputField2.value) : null;
        let value3 = this.inputField3 && this.inputField3.style.display !== 'none' ?
                     parseInt(this.inputField3.value) : null;

        switch(this.tempElement.type) {
            case 'line':
                if (value1 > 0) this.updateLineLength(value1);
                break;
            case 'rectangle':
                if (value1 > 0 && value2 > 0) {
                    this.updateRectangleSize(value1, value2);
                }
                break;
            case 'circle':
                if (value1 > 0) this.updateCircleDiameter(value1);
                break;
            case 'polygon':
                if (value1 > 0) {
                    this.updatePolygonDiameter(value1);
                    if (value3 > 2) this.updatePolygonSides(value3);
                }
                break;
        }

        this.hideDimensionInput();
        this.addElement(this.tempElement);
        this.clearTempOperation();
    }

    // Метод для редактирования существующего скетча
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

    // Собираем элементы скетча с плоскости
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
                    fontSize: child.userData.fontSize || this.fontSize,
                    isClosed: child.userData.isClosed,
                    sketchPlaneId: child.userData.sketchPlaneId,
                    userData: child.userData
                };

                this.elements.push(element);
            }
        });

        return this.elements.length;
    }

    // РАБОТА СО СКЕТЧАМИ
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
        this.clearTempGeometry();
        this.clearDimensionObjects();
        this.setCurrentTool('line');
        this.attachMouseHandlers();
        this.orientCameraToPlane(planeObject);

        // Добавьте эту строку:
        this.createSketchGrid();
    }

    orientCameraToPlane(plane) {
        // Сохраняем исходные параметры камеры
        this.originalCameraUp.copy(this.editor.camera.up);
        this.originalCameraPosition.copy(this.editor.camera.position);
        this.originalCameraTarget.copy(this.editor.controls.target);

        // Получаем локальные оси плоскости
        const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(plane.quaternion);
        const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(plane.quaternion);
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(plane.quaternion);

        // Получаем bounding box плоскости
        const bbox = new THREE.Box3().setFromObject(plane);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxSize = Math.max(size.x, size.y, size.z);

        // Если плоскость маленькая, используем минимальный размер
        const planeSize = Math.max(maxSize, 100);

        // Позиция камеры - снаружи от плоскости
        const distance = planeSize/2;
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        // Позиционируем камеру по нормали плоскости
        const cameraPosition = center.clone().add(normal.clone().multiplyScalar(distance));

        this.editor.camera.position.copy(cameraPosition);
        this.editor.camera.lookAt(center);

        // Настраиваем up вектор камеры как локальный Y плоскости
        this.editor.camera.up.copy(localY);
        this.editor.camera.up.normalize();

        this.editor.controls.target.copy(center);
        this.editor.controls.update();
    }

    exitSketchMode() {
        // Сохраняем текущий скетч перед выходом
        // Восстанавливаем параметры камеры
        this.restoreCamera();

        this.currentPlane = null;
        this.currentSketch = null;
        this.elements = [];
        this.selectedElements = [];
        this.currentTool = 'line';
        this.tempElement = null;
        this.isDrawing = false;

        this.clearTempGeometry();
        this.clearDimensionObjects();
        this.hideDimensionInput();
        this.detachMouseHandlers();

        this.removeSketchGrid();

        this.editor.controls.enableRotate = true;
        this.editor.controls.enablePan = true;
        this.editor.controls.enableZoom = true;

        this.updateToolButtons();

        if (this.cursorCross) {
            this.currentPlane.remove(this.cursorCross);
            this.cursorCross = null;
        }

        this.editor.showStatus('Режим скетча завершен', 'info');
    }

    // Добавьте метод для восстановления камеры:
    restoreCamera() {
        // Восстанавливаем исходный up вектор камеры
        this.editor.camera.up.copy(this.originalCameraUp);
        this.editor.camera.up.normalize();

        // Можно также восстановить исходную позицию камеры, если нужно:
         this.editor.camera.position.copy(this.originalCameraPosition);
         this.editor.controls.target.copy(this.originalCameraTarget);

        // Принудительно обновляем камеру и контролы
        this.editor.camera.lookAt(this.editor.controls.target);
        this.editor.controls.update();
    }

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

        // обработкa двойного клика
        this.initDoubleClickHandler();
    }

    detachMouseHandlers() {
        const canvas = this.editor.renderer.domElement;

        if (this.mouseDownHandler) canvas.removeEventListener('mousedown', this.mouseDownHandler);
        if (this.mouseMoveHandler) canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        if (this.mouseUpHandler) canvas.removeEventListener('mouseup', this.mouseUpHandler);
        if (this.keyDownHandler) document.removeEventListener('keydown', this.keyDownHandler);
    }

    // ОБРАБОТКА СОБЫТИЙ
    onMouseDown(event) {
        if (event.button !== 0 || this.isInputActive) return;

        const point = this.getPointOnPlane(event);
        if (!point) return;

        // Проверяем, не кликнули ли на существующий элемент для выделения
        if (this.currentTool === 'select' || event.ctrlKey || event.metaKey) {
            const clickedElement = this.getElementAtPoint(point);
            if (clickedElement) {
                if (event.ctrlKey || event.metaKey) {
                    this.toggleElementSelection(clickedElement);
                } else {
                    this.selectElement(clickedElement);
                }
                return;
            } else if (!event.ctrlKey && !event.metaKey) {
                this.clearSelection();
            }
        }

        this.isDrawing = true;

        switch(this.currentTool) {
            case 'line':
                this.startLine(point, event);
                break;
            case 'rectangle':
                this.startRectangle(point, event);
                break;
            case 'circle':
                this.startCircle(point, event);
                break;
            case 'polyline':
                // Если это начало новой полилинии
                if (!this.tempElement || this.tempElement.type !== 'polyline') {
                    this.startPolyline(point);
                } else {
                    // Добавляем точку к существующей полилинии
                    this.tempElement.points.push(point.clone());
                    this.polylinePoints.push(point.clone());
                    this.updateTempGeometry();
                    this.editor.showStatus(`Точка ${this.tempElement.points.length} добавлена`, 'info');
                }
                break;
            case 'polygon':
                this.startPolygon(point, event);
                break;
            case 'text':
                this.startText(point, event);
                break;
        }
    }

    onMouseMove(event) {
        const point = this.getPointOnPlane(event);
        if (!point) return;

        this.updateCoordinates(point);

        if (this.isDrawing && this.tempElement) {
            this.updateTempElement(point, event);
        }

        this.updateCursorCross(point);
    }

    onMouseUp(event) {
        if (event.button !== 0 || !this.isDrawing) return;

        const point = this.getPointOnPlane(event);
        if (!point) return;

        // Если это текст и мы не в процессе рисования, просто возвращаемся
        if (this.tempElement && this.tempElement.type === 'text' && !this.isDrawing) {
            return;
        }

        // Для полилинии - добавляем точку при клике
        if (this.tempElement && this.tempElement.type === 'polyline') {
            // Продолжаем добавлять точки
            return;
        }

        // Для остальных инструментов завершаем рисование
        if (this.tempElement && !['polyline', 'text'].includes(this.tempElement.type)) {
            this.finishDrawing(point, event);
        }

        this.isDrawing = false;
    }


    onKeyDown(event) {
        if (this.isInputActive) return;

        const key = event.key.toLowerCase();

        switch(key) {
            case 'escape':
                this.cancelCurrentOperation();
                break;
            case 'enter':
                if (this.tempElement) {
                    if (this.tempElement.type === 'polyline') {
                        // Завершаем полилинию по Enter
                        this.completePolyline();
                    } else {
                        this.showDimensionInputForElement();
                    }
                }
                break;
            case 'backspace':
                if (this.tempElement && ['polyline'].includes(this.tempElement.type)) {
                    this.removeLastPoint();
                }
                break;
            case 'delete':
                this.deleteSelectedElements();
                break;
            case 'a':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.selectAllElements();
                }
                break;
        }

        // Быстрый ввод чисел
        if (key >= '0' && key <= '9' || key === '.' || key === ',') {
            this.handleNumericInput(key.replace(',', '.'));
        }
    }

    // МЕТОДЫ ИНСТРУМЕНТОВ
    startLine(startPoint, event) {
        this.tempElement = {
            type: 'line',
            start: startPoint.clone(),
            end: startPoint.clone(),
            length: 0,
            points: [startPoint.clone(), startPoint.clone()],
            color: this.sketchColor
        };

        this.createTempGeometry();
        this.createDimensionLine(this.tempElement.start, this.tempElement.end);
    }

    updateLineLength(length) {
        if (!this.tempElement || this.tempElement.type !== 'line') return;

        this.tempElement.length = length;
        const direction = new THREE.Vector3().subVectors(
            this.tempElement.end,
            this.tempElement.start
        ).normalize();

        if (direction.length() === 0) {
            direction.set(1, 0, 0);
        }

        this.tempElement.end = this.tempElement.start.clone().add(
            direction.multiplyScalar(length)
        );
        this.tempElement.points[1] = this.tempElement.end.clone();

        this.updateTempGeometry();
        this.updateDimensionLine(this.tempElement.start, this.tempElement.end);
    }

    startRectangle(startPoint, event) {
        this.tempElement = {
            type: 'rectangle',
            start: startPoint.clone(),
            end: startPoint.clone(),
            width: 0,
            height: 0,
            points: this.calculateRectanglePoints(startPoint, startPoint),
            color: this.sketchColor
        };

        this.createTempGeometry();
        this.createRectangleDimensions(this.tempElement.start, this.tempElement.end);
    }

    updateRectangleWidth(width) {
        if (!this.tempElement || this.tempElement.type !== 'rectangle') return;

        this.tempElement.width = width;
        this.updateRectangleSize();
    }

    updateRectangleHeight(height) {
        if (!this.tempElement || this.tempElement.type !== 'rectangle') return;

        this.tempElement.height = height;
        this.updateRectangleSize();
    }

    updateRectangleSize(width, height) {
        if (!this.tempElement || this.tempElement.type !== 'rectangle') return;

        if (width !== undefined) this.tempElement.width = width;
        if (height !== undefined) this.tempElement.height = height;

        this.tempElement.end.x = this.tempElement.start.x + this.tempElement.width;
        this.tempElement.end.y = this.tempElement.start.y + this.tempElement.height;

        this.tempElement.points = this.calculateRectanglePoints(
            this.tempElement.start,
            this.tempElement.end
        );

        this.updateTempGeometry();
        this.updateRectangleDimensions(this.tempElement.start, this.tempElement.end);
    }

    startCircle(centerPoint, event) {
        this.tempElement = {
            type: 'circle',
            center: centerPoint.clone(),
            diameter: 0,
            radius: 0,
            segments: 32,
            points: this.calculateCirclePoints(centerPoint, 0, 32),
            color: this.sketchColor
        };

        this.createTempGeometry();
        this.createCircleDimensions(this.tempElement.center, 0);
    }

    updateCircleDiameter(diameter) {
        if (!this.tempElement || this.tempElement.type !== 'circle') return;

        this.tempElement.diameter = diameter;
        this.tempElement.radius = diameter / 2;
        this.tempElement.points = this.calculateCirclePoints(
            this.tempElement.center,
            this.tempElement.radius,
            32
        );

        this.updateTempGeometry();
        this.updateCircleDimensions(this.tempElement.center, this.tempElement.radius);
    }

    startPolygon(centerPoint, event) {
        this.tempElement = {
            type: 'polygon',
            center: centerPoint.clone(),
            diameter: 0,
            radius: 0,
            sides: this.currentSides,
            points: this.calculatePolygonPoints(centerPoint, 0, this.currentSides),
            color: this.sketchColor
        };

        this.createTempGeometry();
        this.createPolygonDimensions(this.tempElement.center, 0, this.currentSides);
    }

    updatePolygonDiameter(diameter) {
        if (!this.tempElement || this.tempElement.type !== 'polygon') return;

        this.tempElement.diameter = diameter;
        this.tempElement.radius = diameter / 2;
        this.tempElement.points = this.calculatePolygonPoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.tempElement.sides
        );

        this.updateTempGeometry();
        this.updatePolygonDimensions(this.tempElement.center, this.tempElement.radius, this.tempElement.sides);
    }

    updatePolygonSides(sides) {
        if (!this.tempElement || this.tempElement.type !== 'polygon') return;

        this.tempElement.sides = Math.max(3, Math.min(50, sides));
        this.tempElement.points = this.calculatePolygonPoints(
            this.tempElement.center,
            this.tempElement.radius,
            this.tempElement.sides
        );

        this.updateTempGeometry();
        this.updatePolygonDimensions(this.tempElement.center, this.tempElement.radius, this.tempElement.sides);
    }

    startPolyline(startPoint) {
        this.polylinePoints = [startPoint.clone()]; // Начинаем новую полилинию
        this.tempElement = {
            type: 'polyline',
            points: [startPoint.clone()], // Первая точка
            color: this.sketchColor,
            isComplete: false
        };

        this.createTempGeometry();
    }

    //метод для завершения полилинии:
    completePolyline() {
        if (!this.tempElement || this.tempElement.type !== 'polyline') return;

        // Нужно хотя бы 2 точки для создания полилинии
        if (this.tempElement.points.length < 2) {
            this.cancelCurrentOperation();
            this.editor.showStatus('Полилиния должна содержать минимум 2 точки', 'warning');
            return;
        }

        // Убираем последнюю точку, если она совпадает с предпоследней
        const lastPoint = this.tempElement.points[this.tempElement.points.length - 1];
        const secondLastPoint = this.tempElement.points[this.tempElement.points.length - 2];
        if (lastPoint.distanceTo(secondLastPoint) < 0.1) {
            this.tempElement.points.pop();
        }

        // Добавляем элемент
        this.addElement(this.tempElement);
        this.clearTempOperation();
        this.polylinePoints = [];
        this.editor.showStatus('Полилиния создана', 'success');
    }

    // Добавьте обработку двойного клика для завершения полилинии в init или attachMouseHandlers:
    initDoubleClickHandler() {
        const canvas = this.editor.renderer.domElement;
        let clickCount = 0;
        let clickTimer = null;

        canvas.addEventListener('click', (e) => {
            if (e.button !== 0) return;

            clickCount++;
            if (clickCount === 1) {
                // Одинарный клик - ждем возможного двойного
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 300);
            } else if (clickCount === 2) {
                clearTimeout(clickTimer);
                clickCount = 0;

                // Двойной клик - завершаем полилинию
                if (this.currentTool === 'polyline' && this.tempElement && this.tempElement.type === 'polyline') {
                    this.completePolyline();
                }
            }
        });
    }

       // метод для создания геометрии текста:
    createTextGeometry(textElement) {
        if (!this.currentPlane) return;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = `bold ${textElement.fontSize}px Arial`;
        context.fillStyle = '#AAAAAA';
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillText(textElement.content, 10, 10);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });

        const sprite = new THREE.Sprite(material);
        const localPos = this.currentPlane.worldToLocal(textElement.position.clone());
        sprite.position.set(localPos.x, localPos.y, 0.1);
        sprite.scale.set(50, 12.5, 1);

        textElement.textMesh = sprite;

        if (this.tempGeometry) {
            this.currentPlane.remove(this.tempGeometry);
            if (this.tempGeometry.material) this.tempGeometry.material.dispose();
            if (this.tempGeometry.material.map) this.tempGeometry.material.map.dispose();
        }

        this.tempGeometry = sprite;
        this.currentPlane.add(sprite);
    }

//    const TEXT_FONT = 'Arial'; // Используем стандартный шрифт
//    const TEXT_SEGMENTS = 64; // Количество сегментов для кривых

    // Добавьте метод для создания текстовых контуров:
    createTextContours(text, fontSize, position) {
        if (!this.currentPlane) return [];

        const localPos = this.currentPlane.worldToLocal(position.clone());
        const contours = [];
        const charWidth = fontSize * 0.6;
        const charHeight = fontSize;
        const spacing = fontSize * 0.1;

        // Для простоты создаем прямоугольные контуры для каждого символа
        // В реальном приложении нужно использовать текстовую геометрию Three.js
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const x = localPos.x + i * (charWidth + spacing);
            const y = localPos.y;

            // Создаем прямоугольный контур для символа
            const points = [
                new THREE.Vector3(x, y, 0),
                new THREE.Vector3(x + charWidth, y, 0),
                new THREE.Vector3(x + charWidth, y + charHeight, 0),
                new THREE.Vector3(x, y + charHeight, 0),
                new THREE.Vector3(x, y, 0)
            ];

            contours.push(points);
        }

        return contours;
    }


    startText(position, event) {
        // Отменяем стандартную обработку
        event.preventDefault();
        event.stopPropagation();

        // Создаем временный элемент текста как набор контуров
        this.tempElement = {
            type: 'text',
            position: position.clone(),
            content: this.currentText,
            fontSize: this.fontSize,
            contours: this.createTextContours(this.currentText, this.fontSize, position),
            color: this.sketchColor,
            textMesh: null
        };

        // Создаем временную геометрию для предпросмотра
        this.createTempTextGeometry();

        // Показываем окно ввода
        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        this.showDimensionInput(
            event.clientX,
            event.clientY,
            'text',
            { value1: this.currentText }
        );

        return false;
    }

    // Метод для создания временной геометрии текста
    createTempTextGeometry() {
        this.clearTempGeometry();

        if (!this.tempElement || this.tempElement.type !== 'text' || !this.tempElement.contours) {
            return;
        }

        // Создаем группу для всех контуров текста
        const textGroup = new THREE.Group();
        textGroup.userData.isTempText = true;

        // Создаем контуры для каждого символа
        this.tempElement.contours.forEach(contourPoints => {
            // Преобразуем локальные точки в мировые координаты
            const worldPoints = contourPoints.map(p =>
                this.currentPlane.localToWorld(p.clone())
            );

            // Создаем геометрию для контура
            const geometry = new THREE.BufferGeometry();
            const vertices = [];

            worldPoints.forEach(point => {
                const localPoint = this.currentPlane.worldToLocal(point.clone());
                vertices.push(localPoint.x, localPoint.y, 0);
            });

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

            // Создаем замкнутый контур
            const mesh = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                color: this.tempElement.color,
                linewidth: 2
            }));

            textGroup.add(mesh);
        });

        this.tempGeometry = textGroup;
        this.currentPlane.add(textGroup);
    }


    updateTextContent(text) {
        if (!this.tempElement || this.tempElement.type !== 'text') return;

        this.tempElement.content = text;
        this.updateTextProperties();
    }

    updateTextProperties() {
        if (!this.tempElement || this.tempElement.type !== 'text') return;

        this.tempElement.fontSize = this.fontSize;

        // Обновляем контуры с новыми параметрами
        this.tempElement.contours = this.createTextContours(
            this.tempElement.content,
            this.tempElement.fontSize,
            this.tempElement.position
        );

        // Обновляем геометрию
        this.createTempTextGeometry();
    }

    // метод для проверки замкнутости контура:
    isContourClosed(points, threshold = 0.1) {
        if (points.length < 3) return false;

        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];

        // Проверяем, совпадает ли первая и последняя точка
        const distance = firstPoint.distanceTo(lastPoint);
        return distance < threshold;
    }

    // Метод для поиска пересечений между линиями
    findLineIntersections(lines) {
        const intersections = [];

        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                const line1 = lines[i];
                const line2 = lines[j];

                // Для простоты проверяем пересечение отрезков
                const intersection = this.lineIntersection(
                    line1.start, line1.end,
                    line2.start, line2.end
                );

                if (intersection) {
                    intersections.push({
                        point: intersection,
                        lines: [line1, line2]
                    });
                }
            }
        }

        return intersections;
    }

    // Алгоритм нахождения пересечения двух отрезков
    lineIntersection(p1, p2, p3, p4) {
        const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);

        if (denominator === 0) return null;

        const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denominator;
        const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denominator;

        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return new THREE.Vector3(
                p1.x + ua * (p2.x - p1.x),
                p1.y + ua * (p2.y - p1.y),
                0
            );
        }

        return null;
    }

    // Метод для автоматического определения замкнутых контуров
    detectClosedContours() {
        this.closedContours = [];

        // Собираем все линии
        const lines = this.elements.filter(el => el.type === 'line');
        const polylines = this.elements.filter(el => el.type === 'polyline');

        // Ищем пересечения
        const intersections = this.findLineIntersections(lines);

        // Для каждой полилинии проверяем замкнутость
        polylines.forEach(polyline => {
            if (this.isContourClosed(polyline.points)) {
                this.closedContours.push({
                    type: 'polyline',
                    points: polyline.points,
                    element: polyline
                });
            }
        });

        // Проверяем комбинации линий
        // Это упрощенный алгоритм - в реальности нужен более сложный
        for (const inter of intersections) {
            // Начинаем строить контур от пересечения
            const contour = this.buildContourFromIntersection(inter, lines);
            if (contour && contour.length > 2) {
                if (this.isContourClosed(contour)) {
                    this.closedContours.push({
                        type: 'composite',
                        points: contour
                    });
                }
            }
        }

        // Также добавляем прямоугольники, круги и полигоны как замкнутые контуры
        this.elements.forEach(element => {
            if (['rectangle', 'circle', 'polygon'].includes(element.type)) {
                this.closedContours.push({
                    type: element.type,
                    points: element.points,
                    element: element
                });
            }
        });

        return this.closedContours;
    }

    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    updateTempElement(point, event) {
        if (!this.tempElement) return;

        switch(this.tempElement.type) {
            case 'line':
                this.tempElement.end = point.clone();
                this.tempElement.points[1] = point.clone();
                this.tempElement.length = this.tempElement.start.distanceTo(point);
                this.updateDimensionLine(this.tempElement.start, this.tempElement.end);

                if (event && this.isDrawing) {
                    const length = this.tempElement.length;
                    const rect = this.editor.renderer.domElement.getBoundingClientRect();
                    this.showDimensionInput(
                        event.clientX,
                        event.clientY,
                        'single',
                        { value1: length.toFixed(1) }
                    );
                }
                break;

            case 'rectangle':
                this.tempElement.end = point.clone();
                this.tempElement.width = Math.abs(point.x - this.tempElement.start.x);
                this.tempElement.height = Math.abs(point.y - this.tempElement.start.y);
                this.tempElement.points = this.calculateRectanglePoints(
                    this.tempElement.start,
                    point
                );
                this.updateRectangleDimensions(this.tempElement.start, point);

                if (event && this.isDrawing) {
                    const rect = this.editor.renderer.domElement.getBoundingClientRect();
                    this.showDimensionInput(
                        event.clientX,
                        event.clientY,
                        'rectangle',
                        {
                            value1: this.tempElement.width.toFixed(1),
                            value2: this.tempElement.height.toFixed(1)
                        }
                    );
                }
                break;

            case 'circle':
                this.tempElement.radius = this.tempElement.center.distanceTo(point);
                this.tempElement.diameter = this.tempElement.radius * 2;
                this.tempElement.points = this.calculateCirclePoints(
                    this.tempElement.center,
                    this.tempElement.radius,
                    32
                );
                this.updateCircleDimensions(this.tempElement.center, this.tempElement.radius);

                if (event && this.isDrawing) {
                    const rect = this.editor.renderer.domElement.getBoundingClientRect();
                    this.showDimensionInput(
                        event.clientX,
                        event.clientY,
                        'circle',
                        { value1: this.tempElement.diameter.toFixed(1) }
                    );
                }
                break;

            case 'polygon':
                this.tempElement.radius = this.tempElement.center.distanceTo(point);
                this.tempElement.diameter = this.tempElement.radius * 2;
                this.tempElement.points = this.calculatePolygonPoints(
                    this.tempElement.center,
                    this.tempElement.radius,
                    this.tempElement.sides
                );
                this.updatePolygonDimensions(this.tempElement.center, this.tempElement.radius, this.tempElement.sides);

                if (event && this.isDrawing) {
                    const rect = this.editor.renderer.domElement.getBoundingClientRect();
                    this.showDimensionInput(
                        event.clientX,
                        event.clientY,
                        'polygon',
                        {
                            value1: this.tempElement.diameter.toFixed(1),
                            value3: this.tempElement.sides
                        }
                    );
                }
                break;

             case 'polyline':
                if (this.tempElement.points.length === 1) {
                    // Если только одна точка, добавляем вторую для превью
                    this.tempElement.points = [this.tempElement.points[0], point.clone()];
                } else if (this.tempElement.points.length > 1) {
                    // Обновляем последнюю точку для превью
                    this.tempElement.points[this.tempElement.points.length - 1] = point.clone();
                }
                break;
        }

        this.updateTempGeometry();
    }

    finishDrawing(point, event) {
        if (!this.tempElement) return;

        this.updateTempElement(point, event);

        // Для текста не показываем окно ввода - оно уже показано
        if (!this.isInputActive && !['polyline', 'text'].includes(this.tempElement.type)) {
            this.showDimensionInputForElement();
        }
    }

    showDimensionInputForElement() {
        if (!this.tempElement) return;

        const rect = this.editor.renderer.domElement.getBoundingClientRect();
        const mouse = this.editor.mouse;
        const screenX = rect.left + (mouse.x + 1) * rect.width / 2;
        const screenY = rect.top + (-mouse.y + 1) * rect.height / 2;

        switch(this.tempElement.type) {
            case 'line':
                this.showDimensionInput(screenX, screenY, 'single', {
                    value1: this.tempElement.length.toFixed(1)
                });
                break;
            case 'rectangle':
                this.showDimensionInput(screenX, screenY, 'rectangle', {
                    value1: this.tempElement.width.toFixed(1),
                    value2: this.tempElement.height.toFixed(1)
                });
                break;
            case 'circle':
                this.showDimensionInput(screenX, screenY, 'circle', {
                    value1: this.tempElement.diameter.toFixed(1)
                });
                break;
            case 'polygon':
                this.showDimensionInput(screenX, screenY, 'polygon', {
                    value1: this.tempElement.diameter.toFixed(1),
                    value3: this.tempElement.sides
                });
                break;
        }
    }

    // ГЕОМЕТРИЧЕСКИЕ РАСЧЕТЫ
    calculateRectanglePoints(start, end) {
        if (!this.currentPlane) return [];

        const localStart = this.currentPlane.worldToLocal(start.clone());
        const localEnd = this.currentPlane.worldToLocal(end.clone());

        // Корректно рассчитываем углы прямоугольника
        const minX = Math.min(localStart.x, localEnd.x);
        const maxX = Math.max(localStart.x, localEnd.x);
        const minY = Math.min(localStart.y, localEnd.y);
        const maxY = Math.max(localStart.y, localEnd.y);

        const points = [
            new THREE.Vector3(minX, minY, 0),
            new THREE.Vector3(maxX, minY, 0),
            new THREE.Vector3(maxX, maxY, 0),
            new THREE.Vector3(minX, maxY, 0),
            new THREE.Vector3(minX, minY, 0)
        ];

        return points.map(p => this.currentPlane.localToWorld(p));
    }

    calculateCirclePoints(center, radius, segments = 32) {
        if (!this.currentPlane) return [];

        const localCenter = this.currentPlane.worldToLocal(center.clone());
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = localCenter.x + Math.cos(theta) * radius;
            const y = localCenter.y + Math.sin(theta) * radius;
            points.push(this.currentPlane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        return points;
    }

    calculatePolygonPoints(center, radius, sides) {
        if (!this.currentPlane) return [];

        const localCenter = this.currentPlane.worldToLocal(center.clone());
        const points = [];

        for (let i = 0; i <= sides; i++) {
            const theta = (i / sides) * Math.PI * 2;
            const x = localCenter.x + Math.cos(theta) * radius;
            const y = localCenter.y + Math.sin(theta) * radius;
            points.push(this.currentPlane.localToWorld(new THREE.Vector3(x, y, 0)));
        }

        return points;
    }

    calculateTextPoints(position, text, fontSize) {
        // Для текста создаем массив точек для прямоугольника текста
        const charWidth = fontSize * 0.6;
        const textWidth = text.length * charWidth;
        const textHeight = fontSize;

        const localPos = this.currentPlane.worldToLocal(position.clone());

        const points = [
            new THREE.Vector3(localPos.x, localPos.y, 0),
            new THREE.Vector3(localPos.x + textWidth, localPos.y, 0),
            new THREE.Vector3(localPos.x + textWidth, localPos.y + textHeight, 0),
            new THREE.Vector3(localPos.x, localPos.y + textHeight, 0),
            new THREE.Vector3(localPos.x, localPos.y, 0)
        ];

        return points.map(p => this.currentPlane.localToWorld(p));
    }

    // РАЗМЕРНЫЕ ЛИНИИ (исправленные для всех плоскостей)
    createDimensionLine(start, end) {
        this.clearDimensionObjects();

        if (!this.currentPlane) return;

        // Получаем локальные координаты точек в плоскости
        const localStart = this.currentPlane.worldToLocal(start.clone());
        const localEnd = this.currentPlane.worldToLocal(end.clone());

        // Вычисляем длину в локальных координатах
        const dx = localEnd.x - localStart.x;
        const dy = localEnd.y - localStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        // Направление линии в локальных координатах
        const direction = new THREE.Vector3(dx, dy, 0).normalize();

        // Перпендикуляр к линии (в плоскости)
        const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
        const extLength = 3; // Длина выносных линий

        // Основная размерная линия (смещена от измеряемой линии)
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

        // Выносные линии (соединяют измеряемую линию с размерной)
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

        // Текст размера (в середине размерной линии, но сбоку)
        const textPos = new THREE.Vector3()
            .addVectors(lineStart, lineEnd)
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(
                -perpendicular.y * 5, // Смещение в сторону
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

        // Размер по ширине (нижняя сторона) - текст сбоку
        const widthLineStart = new THREE.Vector3(minX, minY - 10, 0.1);
        const widthLineEnd = new THREE.Vector3(maxX, minY - 10, 0.1);

        const widthGeometry = new THREE.BufferGeometry().setFromPoints([widthLineStart, widthLineEnd]);
        const widthMaterial = new THREE.LineBasicMaterial({
            color: this.dimensionColor,
            linewidth: 2
        });
        const widthLine = new THREE.Line(widthGeometry, widthMaterial);

        // Выносные линии для ширины
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

        // Текст ширины (слева от линии)
        const widthTextPos = new THREE.Vector3(minX + width/2, minY - 15, 0.1);
        this.createDimensionText(widthTextPos, `${width.toFixed(1)} мм`);

        // Размер по высоте (правая сторона) - текст сбоку
        const heightLineStart = new THREE.Vector3(maxX + 10, minY, 0.1);
        const heightLineEnd = new THREE.Vector3(maxX + 10, maxY, 0.1);

        const heightGeometry = new THREE.BufferGeometry().setFromPoints([heightLineStart, heightLineEnd]);
        const heightMaterial = new THREE.LineBasicMaterial({
            color: this.dimensionColor,
            linewidth: 2
        });
        const heightLine = new THREE.Line(heightGeometry, heightMaterial);

        // Выносные линии для высоты
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

        // Текст высоты (над линией)
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

    createDimensionText(position, text) {
        // Создаем canvas для текста
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        // Очищаем canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Рисуем текст
        context.font = 'bold 16px Arial';
        context.fillStyle = '#00C853';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Создаем текстуру
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

    // ОСНОВНЫЕ МЕТОДЫ
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

    createTempGeometry() {
        this.clearTempGeometry();

        if (!this.tempElement || !this.tempElement.points) return;

        if (this.tempElement.type === 'text') {
            // Создаем текстовый спрайт
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 512;
            canvas.height = 128;

            context.clearRect(0, 0, canvas.width, canvas.height);
            context.font = `bold ${this.fontSize}px Arial`;
            context.fillStyle = '#AAAAAA';
            context.textAlign = 'left';
            context.textBaseline = 'top';
            context.fillText(this.tempElement.content, 10, 10);

            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true
            });

            const sprite = new THREE.Sprite(material);
            const localPos = this.currentPlane.worldToLocal(this.tempElement.position.clone());
            sprite.position.set(localPos.x, localPos.y, 0.1);
            sprite.scale.set(50, 12.5, 1);

            this.tempGeometry = sprite;
            this.currentPlane.add(sprite);
            this.tempElement.textMesh = sprite;
        } else {
            // Для остальных элементов создаем линии
            const vertices = [];
            this.tempElement.points.forEach(point => {
                const localPoint = this.currentPlane.worldToLocal(point.clone());
                vertices.push(localPoint.x, localPoint.y, 0);
            });

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

            let mesh;
            if (['rectangle', 'circle', 'polygon'].includes(this.tempElement.type)) {
                mesh = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                    color: this.tempElement.color,
                    linewidth: 2
                }));
            } else {
                mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({
                    color: this.tempElement.color,
                    linewidth: 2
                }));
            }

            this.tempGeometry = mesh;
            this.currentPlane.add(mesh);
        }
    }

    updateTempGeometry() {
        if (!this.tempGeometry || !this.tempElement) return;

        if (this.tempElement.type === 'text' && this.tempElement.textMesh) {
            // Обновляем текст
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 512;
            canvas.height = 128;

            context.clearRect(0, 0, canvas.width, canvas.height);
            context.font = `bold ${this.fontSize}px Arial`;
            context.fillStyle = '#AAAAAA';
            context.textAlign = 'left';
            context.textBaseline = 'top';
            context.fillText(this.tempElement.content, 10, 10);

            this.tempElement.textMesh.material.map.dispose();
            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            this.tempElement.textMesh.material.map = texture;
            this.tempElement.textMesh.material.needsUpdate = true;
        } else {
            // Обновляем геометрию линии
            const vertices = [];
            this.tempElement.points.forEach(point => {
                const localPoint = this.currentPlane.worldToLocal(point.clone());
                vertices.push(localPoint.x, localPoint.y, 0);
            });

            this.tempGeometry.geometry.setAttribute('position',
                new THREE.Float32BufferAttribute(vertices, 3));
            this.tempGeometry.geometry.attributes.position.needsUpdate = true;
        }
    }

    clearTempGeometry() {
        if (this.tempGeometry) {
            if (this.tempGeometry.parent) {
                this.tempGeometry.parent.remove(this.tempGeometry);
            }
            if (this.tempGeometry.geometry) this.tempGeometry.geometry.dispose();
            if (this.tempGeometry.material) this.tempGeometry.material.dispose();
            this.tempGeometry = null;
        }
    }

    addElement(element) {
        if (!element || !element.points || (element.type !== 'text' && element.points.length < 2)) {
            this.editor.showStatus('Элемент не может быть создан: недостаточно точек', 'error');
            return;
        }

        if (element.type === 'text') {
            // Создаем группу для текстовых контуров
            const textGroup = new THREE.Group();

            // Сохраняем локальные контуры
            const localContours = element.contours || [];

            // Создаем меши для каждого контура
            localContours.forEach((contour, index) => {
                const geometry = new THREE.BufferGeometry();
                const vertices = [];

                contour.forEach(point => {
                    vertices.push(point.x, point.y, point.z || 0);
                });

                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

                const mesh = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({
                    color: new THREE.Color(element.color),
                    linewidth: 2
                }));

                mesh.userData = {
                    isTextPart: true,
                    textIndex: index,
                    totalParts: localContours.length
                };

                textGroup.add(mesh);
            });

            textGroup.userData = {
                type: 'sketch_element',
                sketchId: this.currentSketch?.id,
                elementType: element.type,
                isClosed: true, // Текст состоит из замкнутых контуров
                isText: true,
                originalColor: new THREE.Color(element.color),
                sketchPlaneId: this.currentPlane?.uuid,
                content: element.content,
                fontSize: element.fontSize,
                localPosition: this.currentPlane.worldToLocal(element.position.clone()),
                localContours: localContours,
                createdAt: new Date().toISOString()
            };

            this.currentPlane.add(textGroup);
            element.mesh = textGroup;
            this.elements.push(element);

        } else {
            // Создаем геометрию для линий
            const localPoints = element.points.map(p => this.currentPlane.worldToLocal(p.clone()));
            const isClosed = ['rectangle', 'circle', 'polygon'].includes(element.type);

            const geometry = new THREE.BufferGeometry();
            const vertices = [];

            // Для полилинии создаем непрерывную линию
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
                sketchId: this.currentSketch?.id,
                elementType: element.type,
                isClosed: isClosed,
                originalColor: new THREE.Color(element.color || this.sketchColor),
                sketchPlaneId: this.currentPlane?.uuid,
                localPoints: localPoints,
                createdAt: new Date().toISOString()
            };

            this.currentPlane.add(mesh);
            element.mesh = mesh;
            this.elements.push(element);
        }


       // this.elements.push(element);
        this.saveToHistory();
        this.editor.showStatus(`Добавлен элемент: ${this.getToolName(element.type)}`, 'success');

        // После добавления элемента проверяем замкнутые контуры
        setTimeout(() => {
            this.detectClosedContours();
            console.log('Найдено замкнутых контуров:', this.closedContours.length);
        }, 0);
    }

    removeLastPoint() {
        if (!this.tempElement || !['polyline'].includes(this.tempElement.type)) return;

        if (this.tempElement.points.length > 2) {
            // Удаляем последнюю точку, но оставляем минимум 2 точки для превью
            this.tempElement.points.pop();
            this.polylinePoints.pop();
            this.updateTempGeometry();
            this.editor.showStatus('Последняя точка удалена', 'info');
        } else if (this.tempElement.points.length === 2) {
            // Если осталось только 2 точки, отменяем операцию
            this.cancelCurrentOperation();
            this.editor.showStatus('Полилиния отменена', 'info');
        }
    }
    clearTempOperation() {
        this.tempElement = null;
        this.clearTempGeometry();
        this.clearDimensionObjects();
        this.hideDimensionInput();
        this.polylinePoints = []; // Сбрасываем точки полилинии
    }

    cancelCurrentOperation() {
        this.isDrawing = false;
        this.clearTempOperation();
        this.editor.showStatus('Операция отменена', 'info');
    }

    updateCoordinates(point) {
        if (!point || !this.currentPlane) return;

        const localPoint = this.currentPlane.worldToLocal(point.clone());
        const coords = document.getElementById('coords');
        if (coords) {
            coords.textContent = `X: ${localPoint.x.toFixed(1)}, Y: ${localPoint.y.toFixed(1)}, Z: ${localPoint.z.toFixed(1)}`;
        }
    }



    setCurrentTool(tool) {
        this.currentTool = tool;
        this.clearSelection();
        this.cancelCurrentOperation();
        this.updateToolButtons();

        // Показываем крест для инструментов рисования, кроме выбора
        this.cursorCrossVisible = (tool !== 'select' && tool !== 'ruler');

        if (!this.cursorCrossVisible && this.cursorCross) {
            this.currentPlane.remove(this.cursorCross);
            this.cursorCross = null;
        }
    }

    getToolName(tool) {
        const names = {
            select: 'Выделение',
            line: 'Линия',
            rectangle: 'Прямоугольник',
            circle: 'Окружность',
            polyline: 'Полилиния',
            polygon: 'Многоугольник',
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

    handleNumericInput(digit) {
        if (!this.tempElement || this.isInputActive) return;

        if (document.activeElement && document.activeElement.id.startsWith('dimensionInput')) {
            document.activeElement.value += digit;
            document.activeElement.dispatchEvent(new Event('input'));
            return;
        }

        if (!this.isInputActive) {
            this.showDimensionInputForElement();
            setTimeout(() => {
                if (this.inputField1) {
                    this.inputField1.value = digit;
                    this.inputField1.focus();
                }
            }, 10);
        }
    }

    // ВЫДЕЛЕНИЕ ЭЛЕМЕНТОВ
    getElementAtPoint(point) {
        if (!this.currentPlane) return null;

        const localPoint = this.currentPlane.worldToLocal(point.clone());
        const threshold = 5; // Увеличьте порог для лучшего захвата

        for (let i = this.elements.length - 1; i >= 0; i--) {
            const element = this.elements[i];
            if (!element.mesh) continue;

            if (element.type === 'text') {
                // Проверка попадания в текстовый элемент
                const pos = element.mesh.position;
                const scale = element.mesh.scale;
                const halfWidth = scale.x / 2;
                const halfHeight = scale.y / 2;

                if (Math.abs(localPoint.x - pos.x) <= halfWidth &&
                    Math.abs(localPoint.y - pos.y) <= halfHeight) {
                    return element;
                }
            } else {
                // Получаем точки из userData или из element
                let points = element.mesh.userData?.localPoints || element.localPoints || [];

                if (points.length === 0 && element.points) {
                    points = element.points.map(p => this.currentPlane.worldToLocal(p.clone()));
                }

                // Проверка попадания в линию
                for (let j = 0; j < points.length - 1; j++) {
                    const p1 = points[j];
                    const p2 = points[j + 1];

                    // Расстояние от точки до отрезка
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
            // Сохраняем исходный цвет
            if (!element.originalColor) {
                if (element.mesh.material.color) {
                    element.originalColor = element.mesh.material.color.clone();
                } else {
                    element.originalColor = new THREE.Color(this.sketchColor);
                }
            }

            // Устанавливаем цвет выделения
            if (element.mesh.material.color) {
                element.mesh.material.color.set(this.highlightColor);
                element.mesh.material.needsUpdate = true;
            }

            // Увеличиваем толщину линии для выделения (если это линия)
            if (element.mesh.material.linewidth !== undefined) {
                element.mesh.material.linewidth = 4;
                element.mesh.material.needsUpdate = true;
            }

            // Для текста - увеличиваем масштаб
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

            // Восстанавливаем толщину линии
            if (element.mesh.material.linewidth !== undefined) {
                element.mesh.material.linewidth = 2;
                element.mesh.material.needsUpdate = true;
            }

            // Для текста - восстанавливаем масштаб
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
        this.clearTempGeometry();
        this.saveToHistory();
        this.editor.showStatus('Чертеж очищен', 'success');
    }

    // ИСТОРИЯ
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
        // Удаляем текущие элементы
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

        // Восстанавливаем из истории
        if (state && state.elements) {
            state.elements.forEach(elementData => {
                const element = { ...elementData };
                this.addElement(element);
            });
        }
    }

    // ДЕЛЕГИРОВАННЫЕ МЕТОДЫ
    setSketchTool(tool) {
        this.setCurrentTool(tool);
    }

    deleteSelected() {
        this.deleteSelectedElements();
    }

    clearSketch() {
        this.deleteAllElements();
    }
}