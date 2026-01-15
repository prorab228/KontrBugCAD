// extrude-tool.js
class ExtrudeTool extends Tool {
    constructor(editor) {
        super('extrude', 'fa-arrows-alt-v', editor);
        this.extrudeManager = editor.extrudeManager;
        this.isExtrudeMode = false;
        console.log("ExtrudeTool: создан");
    }

    startExtrudeMode() {
        console.log("=== START EXTRUDE MODE ===");
        this.isExtrudeMode = true;

        this.extrudeManager.initialize();
        this.extrudeManager.highlightExtrudableFigures();
        this.extrudeManager.showExtrudeUI();
        this.attachEventListeners();

        this.editor.showStatus('Режим вытягивания: кликните по фигурам для выбора', 'info');
    }

    attachEventListeners() {
        console.log("ExtrudeTool: добавляем обработчики событий");
        this.mouseDownHandler = (e) => this.onMouseDown(e);
        this.mouseMoveHandler = (e) => this.onMouseMove(e);
        this.mouseUpHandler = (e) => this.onMouseUp(e);
        this.keyDownHandler = (e) => this.onKeyDown(e);
        this.keyUpHandler = (e) => this.onKeyUp(e);

        const canvas = this.editor.renderer.domElement;
        canvas.addEventListener('mousedown', this.mouseDownHandler);
        canvas.addEventListener('mousemove', this.mouseMoveHandler);
        canvas.addEventListener('mouseup', this.mouseUpHandler);
        document.addEventListener('keydown', this.keyDownHandler);
        document.addEventListener('keyup', this.keyUpHandler);
    }

    detachEventListeners() {
        console.log("ExtrudeTool: удаляем обработчики событий");
        const canvas = this.editor.renderer.domElement;
        if (this.mouseDownHandler) canvas.removeEventListener('mousedown', this.mouseDownHandler);
        if (this.mouseMoveHandler) canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        if (this.mouseUpHandler) canvas.removeEventListener('mouseup', this.mouseUpHandler);
        if (this.keyDownHandler) document.removeEventListener('keydown', this.keyDownHandler);
        if (this.keyUpHandler) document.removeEventListener('keyup', this.keyUpHandler);
    }

    exitExtrudeMode() {
        console.log("=== EXIT EXTRUDE MODE ===");
        this.isExtrudeMode = false;
        this.extrudeManager.cancelExtrudeMode();
        this.detachEventListeners();
        this.editor.showStatus('Режим вытягивания завершен', 'info');
    }

    onActivate() {
        console.log("ExtrudeTool: активирован");
        this.startExtrudeMode();
    }

    onDeactivate() {
        console.log("ExtrudeTool: деактивирован");
        this.exitExtrudeMode();
    }

    onMouseDown(e) {
        console.log("ExtrudeTool: onMouseDown, кнопка:", e.button);
        if (e.button !== 0) return false;

        if (this.isExtrudeMode) {
            console.log("Проверяем перетаскивание стрелки...");
            if (this.extrudeManager.handleArrowDragStart(e)) {
                console.log("Начато перетаскивание стрелки");
                return true;
            }

            console.log("Обрабатываем клик по фигуре...");
            const handled = this.extrudeManager.handleFigureClick(e);
            if (handled) {
                console.log("Клик по фигуре обработан");
                e.preventDefault();
                e.stopPropagation();
                return true;
            }
        }

        return false;
    }

    onMouseMove(e) {
        if (this.isExtrudeMode) {
            if (this.extrudeManager.isDraggingArrow) {
                this.extrudeManager.handleArrowDrag(e);
            } else {
                this.extrudeManager.highlightFiguresOnHover(e);
            }
        }
    }

    onMouseUp(e) {
        console.log("ExtrudeTool: onMouseUp, кнопка:", e.button);
        if (this.isExtrudeMode && e.button === 0) {
            if (this.extrudeManager.isDraggingArrow) {
                console.log("Завершаем перетаскивание стрелки");
                this.extrudeManager.handleArrowDragEnd();
            }
        }
        return false;
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.isExtrudeMode) {
            console.log("Нажата Escape, выходим из режима вытягивания");
            this.exitExtrudeMode();
            this.editor.toolManager.setCurrentTool('select');
            return true;
        }

        if (e.key === 'Enter' && this.isExtrudeMode) {
            console.log("Нажата Enter, выполняем вытягивание");
            const performBtn = document.getElementById('performExtrude');
            if (performBtn && !performBtn.disabled) {
                this.extrudeManager.performExtrude();
                return true;
            }
        }

        return false;
    }

    onKeyUp(e) {
        return false;
    }
}