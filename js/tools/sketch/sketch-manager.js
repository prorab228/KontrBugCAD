/**
 * Главный менеджер скетча
 */
class SketchManager {
    constructor(cadEditor) {
        this.editor = cadEditor;


        // Snap Helper
        this.snapHelper = new SnapHelper(this);

        // Инициализация менеджеров
        this.toolManager = new SketchToolManager(this);
        this.contourManager = new SketchContourManager(this);
        this.elementManager = new SketchElementManager(this, this.snapHelper, this.contourManager);
        this.viewManager = new SketchViewManager(this);
        this.dimensionManager = new SketchDimensionManager(this);


        // Настройки
        this.snapEnabled = true;
        this.snapGrid = 1;
        this.sketchColor = 0x111111;
        this.highlightColor = 0xFFFF00;
        this.dimensionColor = 0x00C853;
        this.previewColor = 0x7777FF;
        this.previewLineWidth = 2;
        this.previewOpacity = 0.9;

        // Текущее состояние
        this.currentPlane = null;
        this.currentSketch = null;
        this.isDrawing = false;
        this.cursorCross = null;
        this.cursorCrossVisible = false;



        // Объекты размеров
        this.dimensionObjects = [];

        this.initialize();
    }

    /**
     * Инициализация
     */
    initialize() {
        this.toolManager.initTools();
        this.dimensionManager.createDimensionInput();
        this.updateToolButtons();
        console.log('sketch initialized');
    }

    /**
     * Начало скетча на плоскости
     */
    startSketchOnPlane(planeObject) {
        if (!planeObject) return;

        console.log("SketchManager: начало скетча на плоскости", planeObject.uuid);

        this.currentPlane = planeObject;
        this.currentSketch = {
            id: 'sketch_' + Date.now(),
            name: 'Чертеж',
            planeId: planeObject.uuid,
            elements: [],
            created: new Date().toISOString()
        };

        //this.clear();
        this.toolManager.setCurrentTool('select');


        // Ориентируем камеру на плоскость
        this.viewManager.orientCameraToPlane(planeObject);

        // Отключаем сетку в редакторе
        this.editor.SetGridVisible(false);

        // Создаем сетку скетча
        this.viewManager.createSketchGrid();

        // Включаем сетку
        this.viewManager.gridVisible = true;

        console.log("SketchManager: скетч начат, сетка создана");

        if (this.snapHelper) {
            this.snapHelper.updateSnapPoints();
        }
    }

    /**
     * Редактирование существующего скетча
     */
    editExistingSketch(planeObject) {
        if (!planeObject || planeObject.userData.type !== 'sketch_plane') {
            this.editor.showStatus('Выберите плоскость скетча для редактирования', 'error');
            return;
        }

        console.log("SketchManager: редактирование существующего скетча", planeObject.uuid);

        // Собираем элементы скетча
        this.elementManager.collectSketchElements(planeObject);

        this.currentPlane = planeObject;
        this.currentSketch = {
            id: planeObject.userData.sketchId || 'sketch_' + Date.now(),
            name: planeObject.userData.name || 'Чертеж',
            planeId: planeObject.uuid,
            elements: this.elementManager.elements,
            created: planeObject.userData.createdAt || new Date().toISOString()
        };

        // Автоматическое определение контуров
        if (this.contourManager.autoDetectContours) {
            const allMeshes = this.elementManager.elements.map(el => el.mesh);
            this.contourManager.contourDetector.updateElements(allMeshes);
            this.contourManager.updateFigureManagerWithContours();
        }



        // Ориентируем камеру на плоскость
        this.viewManager.orientCameraToPlane(planeObject);

        // Отключаем сетку в редакторе
        this.editor.SetGridVisible(false);

        // Устанавливаем инструмент выбора
        this.toolManager.setCurrentTool('select');

        // Создаем сетку
        if (this.viewManager.gridVisible) {
            this.viewManager.createSketchGrid();
        }
        if (this.snapHelper) {
            this.snapHelper.updateSnapPoints();
        }

        console.log("SketchManager: режим редактирования активирован");
        this.editor.showStatus(`Режим редактирования скетча`, 'success');
    }




    /**
     * Обработка нажатия кнопки мыши
     */
    onMouseDown(e) {
        console.log("SketchManager: onMouseDown", e.button);

        if (this.dimensionManager.isInputActive) {
            this.dimensionManager.applyDimensionInput();
            return true;
        }
        console.log("SketchManager: currentTool", this.toolManager.currentTool);
        if (this.toolManager.currentTool) {
            return this.toolManager.onMouseDown(e);
        }
        return false;
    }

    /**
     * Обработка движения мыши
     */
    onMouseMove(e) {
        // Обновляем координаты
        this.updateCoordinates(e);

        // Передаем событие SnapHelper
        if (this.snapHelper) {
            const point = this.getPointOnPlane(e);
            if (point) {
                this.snapHelper.handleMouseMove(e, point);
            }
        }

        // Передаем событие инструменту
        if (this.toolManager.currentTool && !this.dimensionManager.isInputActive) {
            this.toolManager.onMouseMove(e);
        }
    }

    /**
     * Обработка отпускания кнопки мыши
     */
    onMouseUp(e) {
        console.log("SketchManager: onMouseUp", e.button);
        if (this.toolManager.currentTool && !this.dimensionManager.isInputActive) {
            this.toolManager.onMouseUp(e);
        }
    }

    /**
     * Обработка нажатия клавиши
     */
    onKeyDown(e) {
        console.log("SketchManager: onKeyDown", e);

        // Сначала проверяем глобальные горячие клавиши
        switch (e.key) {
            case 'Enter':
                if (this.dimensionManager.isInputActive) {
                    this.dimensionManager.applyDimensionInput();
                    e.preventDefault();
                    return true;
                }
                break;
            case 'Escape':
                if (this.dimensionManager.isInputActive) {
                    this.dimensionManager.hideDimensionInput();
                    e.preventDefault();
                    return true;
                } else if (this.toolManager.currentTool) {
                    this.toolManager.currentTool.onCancel();
                    e.preventDefault();
                    return true;
                }
                break;
            case 'Delete':
                this.elementManager.deleteSelectedElements();
                return true;
            case 'h':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.snapEnabled = !this.snapEnabled;
                }
                break;
        }

      //  if (e.ctrlKey || e.metaKey)  this.snapEnabled = false;


        // Затем передаем инструменту
        if (this.toolManager.currentTool && this.toolManager.currentTool.onKeyDown) {
            return this.toolManager.currentTool.onKeyDown(e);
        }

        return false;
    }

    onKeyUp(e) {
        console.log("SketchManager: onKeyUp", e);
      //  if (e.ctrlKey || e.metaKey)  this.snapEnabled = true;
    }

    /**
     * Выход из режима скетча
     */
    exitSketchMode() {
        console.log("SketchManager: выход из режима скетча");

        // Сохраняем текущий скетч перед выходом
        this.toolManager.deactivateCurrentTool();

        // Восстанавливаем параметры камеры
        this.viewManager.restoreCamera();
        this.contourManager.removeContourVisualization();

        // Включаем сетку в редакторе
        this.editor.SetGridVisible(this.editor.gridVisible);
        this.viewManager.removeSketchGrid();

        // Удаляем крест курсора
        if (this.cursorCross) {
            this.currentPlane.remove(this.cursorCross);
            this.cursorCross = null;
        }

        this.currentPlane = null;
        this.currentSketch = null;
        this.isDrawing = false;

       // this.clear();


        this.editor.controls.enableRotate = true;
        this.editor.controls.enablePan = true;
        this.editor.controls.enableZoom = true;

        this.updateToolButtons();
        this.editor.showStatus('Режим скетча завершен', 'info');
    }

    /**
     * Обновление координат
     */
    updateCoordinates(event) {
        const point = typeof event === 'object' ? this.getPointOnPlane(event) : event;
        if (!point || !this.currentPlane) return;

        const localPoint = this.currentPlane.worldToLocal(point.clone());
        const coords = document.getElementById('coords');
        if (coords) {
            coords.textContent = `X: ${localPoint.x.toFixed(1)}, Y: ${localPoint.y.toFixed(1)}, Z: ${localPoint.z.toFixed(1)}`;
        }
    }

    /**
     * Получение точки на плоскости
     */
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

    /**
     * Обновление кнопок инструментов
     */
    updateToolButtons() {
        document.querySelectorAll('[data-sketch-tool]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.sketchTool === this.toolManager.currentToolName) {
                btn.classList.add('active');
            }
        });
    }

    /**
     * Публичные методы для UI
     */
    setCurrentTool(tool) {
        this.toolManager.setCurrentTool(tool);
    }

    deleteSelected() {
        this.elementManager.deleteSelectedElements();
    }

    clearSketch() {
        this.elementManager.deleteAllElements();
    }

    toggleGrid() {
        this.viewManager.toggleGrid();
        this.snapEnabled = !this.snapEnabled;
    }

    /**
     * Очистка всех ресурсов
     */
    clear() {
        this.toolManager.clear();
        this.elementManager.clear();
        this.viewManager.clear();
        this.dimensionManager.clear();
        this.contourManager.clear();

        if (this.snapHelper) {
            this.snapHelper.clear();
        }

        this.currentPlane = null;
        this.currentSketch = null;
        this.isDrawing = false;
        this.cursorCross = null;
        this.cursorCrossVisible = false;
        this.dimensionObjects = [];
    }
}