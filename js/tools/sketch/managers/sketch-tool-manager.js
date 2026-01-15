/**
 * Менеджер инструментов скетча
 */
class SketchToolManager {
    constructor(sketchManager) {
        this.sketchManager = sketchManager;
        this.tools = {};
        this.currentTool = null;
        this.currentToolName = null;

       // this.initTools();
    }

    /**
     * Инициализация инструментов
     */
    initTools() {
        // Регистрируем инструменты
        this.registerTool('select', new SelectSketchTool(this.sketchManager));
        this.registerTool('line', new LineSketchTool(this.sketchManager));
        this.registerTool('rectangle', new RectangleSketchTool(this.sketchManager));
        this.registerTool('circle', new CircleSketchTool(this.sketchManager));
        this.registerTool('polyline', new PolylineSketchTool(this.sketchManager));
        this.registerTool('polygon', new PolygonSketchTool(this.sketchManager));
        this.registerTool('arc', new ArcSketchTool(this.sketchManager));
        this.registerTool('oval', new OvalSketchTool(this.sketchManager));
        this.registerTool('stadium', new StadiumSketchTool(this.sketchManager));
        this.registerTool('mirror', new MirrorSketchTool(this.sketchManager));
        this.registerTool('dimension', new DimensionSketchTool(this.sketchManager));
        this.registerTool('ruler', new RulerSketchTool(this.sketchManager));
        this.registerTool('dashedline', new DashedLineSketchTool(this.sketchManager));

        // Устанавливаем инструмент по умолчанию
        this.setCurrentTool('line');
        //console.log('sketch tools initialized', this.tools);
    }

    /**
     * Регистрация инструмента
     */
    registerTool(name, tool) {
        this.tools[name] = tool;
        tool.name = name;
      //  console.log('registerTool sketch:',this.tools[name]);
    }

    /**
     * Установка текущего инструмента
     */
    setCurrentTool(toolName) {
        console.log(`Setting current sketch tool to: ${toolName}`);
        if (this.currentTool) {
            this.deactivateCurrentTool();
        }

        this.currentToolName = toolName;
        this.currentTool = this.tools[toolName];

     //   console.log(`currentTool: ${this.currentTool}`, this.tools, this.tools[toolName] );

        // Управление видимостью креста курсора
        this.sketchManager.cursorCrossVisible = (toolName !== 'select' &&
                                                 toolName !== 'ruler' &&
                                                 toolName !== 'dimension');

        this.updateCursorCross();
        this.sketchManager.updateToolButtons();
    }

    /**
     * Деактивация текущего инструмента
     */
    deactivateCurrentTool() {
        if (!this.currentTool) return;

        // Вызываем onCancel для отмены текущих операций
        this.currentTool.onCancel();

        // Вызываем onDeactivate, если он есть
        if (typeof this.currentTool.onDeactivate === 'function') {
            this.currentTool.onDeactivate();
        }

        this.currentTool = null;
        this.currentToolName = null;
    }

    /**
     * Обновление креста курсора
     */
    updateCursorCross() {
        if (!this.sketchManager.currentPlane) return;

        // Удаляем старый крест
        if (this.sketchManager.cursorCross) {
            this.sketchManager.currentPlane.remove(this.sketchManager.cursorCross);
            this.sketchManager.cursorCross = null;
        }

        // Создаем новый крест для инструментов рисования
        if (this.sketchManager.cursorCrossVisible) {
            this.createCursorCross();
        }
    }

    /**
     * Создание креста курсора
     */
    createCursorCross() {
        if (!this.sketchManager.currentPlane) return;

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
            color: 0x2222FF,
            linewidth: 4,
            transparent: true,
            opacity: 0.7
        });

        const line1 = new THREE.Line(geometry1, material);
        const line2 = new THREE.Line(geometry2, material);

        this.sketchManager.cursorCross = new THREE.Group();
        this.sketchManager.cursorCross.add(line1, line2);
        this.sketchManager.cursorCross.userData.isCursorCross = true;
        this.sketchManager.currentPlane.add(this.sketchManager.cursorCross);
    }

    /**
     * Обработка событий мыши
     */
    onMouseDown(e) {
        if (this.sketchManager.dimensionManager.isInputActive) {
            if (!this.sketchManager.dimensionManager.contains(e.target)) {
                this.sketchManager.dimensionManager.applyDimensionInput();
            }
            return false;
        }
     //   console.log('SketchToolManager onMouseDown')
        if (this.currentTool) {
            return this.currentTool.onMouseDown(e);
        }
        return false;
    }

    onMouseMove(e) {
        const point = this.sketchManager.getPointOnPlane(e);
        if (point) {
            // Используем SnapHelper для получения позиции креста
            let cursorPoint = point;
            if (this.sketchManager.snapHelper && this.sketchManager.snapHelper.snapEnabled) {
                cursorPoint = this.sketchManager.snapHelper.getCursorPosition(point);
            }

            this.updateCursorPosition(cursorPoint);
            this.sketchManager.updateCoordinates(cursorPoint);

            // Передаем событие SnapHelper
            if (this.sketchManager.snapHelper) {
                this.sketchManager.snapHelper.handleMouseMove(e, point);
            }
        }

        // Если активно поле ввода, не передаем события инструменту
        if (this.sketchManager.isInputActive) return;

        if (this.currentTool) {
            this.currentTool.onMouseMove(e);
        }
    }

    onMouseUp(e) {
        if (this.sketchManager.isInputActive) return;

        if (this.currentTool) {
            this.currentTool.onMouseUp(e);
        }
    }

    /**
     * Обработка клавиатуры
     */
    onKeyDown(e) {
        // Сначала проверяем глобальные горячие клавиши
        switch (e.key) {
            case 'Enter':
                if (this.sketchManager.isInputActive) {
                    this.sketchManager.applyDimensionInput();
                    e.preventDefault();
                    return true;
                }
                break;
            case 'Escape':
                if (this.sketchManager.isInputActive) {
                    this.sketchManager.dimensionManager.hideDimensionInput();
                    e.preventDefault();
                    return true;
                } else if (this.currentTool) {
                    this.currentTool.onCancel();
                    e.preventDefault();
                    return true;
                }
                break;
        }

        // Затем передаем инструменту
        if (this.currentTool && this.currentTool.onKeyDown) {
            return this.currentTool.onKeyDown(e);
        }

        return false;
    }

    /**
     * Обновление позиции курсора
     */
    updateCursorPosition(position) {
        if (!this.sketchManager.currentPlane || !this.sketchManager.cursorCross) return;

        const localPos = this.sketchManager.currentPlane.worldToLocal(position.clone());
        this.sketchManager.cursorCross.position.set(localPos.x, localPos.y, 0);
    }

    /**
     * Очистка ресурсов
     */
    clear() {
        this.deactivateCurrentTool();
        this.tools = {};
        this.currentTool = null;
        this.currentToolName = null;
    }
}