// extrude-tool.js (полная версия)
class ExtrudeTool extends Tool {
    constructor(editor) {
        super('extrude', 'fa-arrows-alt-v', editor);
        this.extrudeManager = editor.extrudeManager;
        this.extrudeMode = false;
        this.selectedContour = null;
        this.extrudeArrow = null;
    }

    // МЕТОДЫ ВЫДАВЛИВАНИЯ (ранее были в app.js)

    startExtrudeMode() {
        // Используем менеджер объектов для получения элементов
        const closedContours = this.editor.objectsManager.getClosedSketchElements();

        console.log("Замкнутых контуров для выдавливания:", closedContours.length);

        if (closedContours.length === 0) {
            this.editor.showStatus('Нет замкнутых контуров для вытягивания', 'error');

            // Для отладки покажем все элементы
            const allElements = this.editor.objectsManager.getAllSketchElements();
            console.log("Всего скетч-элементов:", allElements.length);
            allElements.forEach((element, index) => {
                console.log(`Элемент ${index}:`, {
                    type: element.userData?.elementType,
                    isClosed: element.userData?.isClosed,
                    userData: element.userData
                });
            });

            return false;
        }

        this.extrudeMode = true;
        this.selectedContour = null;

        this.extrudeManager.showExtrudeUI();
        this.editor.showStatus('Выберите замкнутый контур скетча для вытягивания. Подсвечены доступные контуры.', 'info');

        // Подсвечиваем замкнутые контуры
        this.extrudeManager.highlightExtrudableContours();
        return true;
    }

    extrudeSketch() {
        if (this.editor.selectedObjects.length === 1 &&
            this.editor.selectedObjects[0].userData.type === 'sketch') {
            this.startExtrudeMode();
        } else {
            this.editor.showStatus('Выберите скетч для вытягивания', 'error');
        }
    }

    cutSketch() {
        this.editor.showStatus('Вырезание скетча (в разработке)', 'info');
    }

    // ОБРАБОТКА СОБЫТИЙ

    onActivate() {
        return this.startExtrudeMode();
    }

    onDeactivate() {
        if (this.extrudeMode) {
            this.extrudeManager.cancelExtrudeMode();
            this.extrudeMode = false;
            this.selectedContour = null;
            this.extrudeArrow = null;
        }
    }

    onMouseDown(e) {
        if (!this.extrudeMode) return false;

        if (this.extrudeManager.handleArrowDragStart(e)) {
            return true;
        }
        if (this.extrudeManager.selectContourForExtrude(e)) {
            return true;
        }
        return false;
    }

    onMouseMove(e) {
        if (!this.extrudeMode) return;

        if (this.extrudeManager.dragging) {
            this.extrudeManager.handleArrowDrag(e);
            return;
        }
        this.extrudeManager.highlightContoursOnHover(e);
    }

    onMouseUp(e) {
        if (!this.extrudeMode) return;

        if (this.extrudeManager.dragging) {
            this.extrudeManager.handleArrowDragEnd();
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.extrudeMode) {
            this.editor.toolManager.setCurrentTool('select');
            return true;
        }
        return false;
    }
}