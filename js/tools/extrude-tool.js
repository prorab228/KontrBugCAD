// extrude-tool.js
class ExtrudeTool extends Tool {
    constructor(editor) {
        super('extrude', 'fa-arrows-alt-v', editor);
        this.extrudeManager = editor.extrudeManager;
        this.isExtrudeMode = false;
    }

    startExtrudeMode() {
        this.isExtrudeMode = true;
        
        // Подсвечиваем доступные фигуры
        this.extrudeManager.highlightExtrudableFigures();
        
        // Показываем UI для вытягивания
        this.extrudeManager.showExtrudeUI();
        
        // Устанавливаем обработчики событий
        this.attachEventListeners();
        
        this.editor.showStatus('Режим вытягивания: выберите фигуру(ы)', 'info');
    }

    attachEventListeners() {
        this.mouseDownHandler = (e) => this.onMouseDown(e);
        this.mouseMoveHandler = (e) => this.onMouseMove(e);
        this.mouseUpHandler = (e) => this.onMouseUp(e);
        this.keyDownHandler = (e) => this.onKeyDown(e);
        
        const canvas = this.editor.renderer.domElement;
        canvas.addEventListener('mousedown', this.mouseDownHandler);
        canvas.addEventListener('mousemove', this.mouseMoveHandler);
        canvas.addEventListener('mouseup', this.mouseUpHandler);
        document.addEventListener('keydown', this.keyDownHandler);
    }

    detachEventListeners() {
        const canvas = this.editor.renderer.domElement;
        if (this.mouseDownHandler) canvas.removeEventListener('mousedown', this.mouseDownHandler);
        if (this.mouseMoveHandler) canvas.removeEventListener('mousemove', this.mouseMoveHandler);
        if (this.mouseUpHandler) canvas.removeEventListener('mouseup', this.mouseUpHandler);
        if (this.keyDownHandler) document.removeEventListener('keydown', this.keyDownHandler);
    }

    exitExtrudeMode() {
        this.isExtrudeMode = false;
        this.extrudeManager.cancelExtrudeMode();
        this.detachEventListeners();
        this.editor.showStatus('Режим вытягивания завершен', 'info');
    }

    // Обработчики событий
    onActivate() {
        this.startExtrudeMode();
    }

    onDeactivate() {
        this.exitExtrudeMode();
    }

    onMouseDown(e) {
        if (e.button !== 0) return false;

        if (this.isExtrudeMode) {
            // Сначала проверяем перетаскивание стрелки
            if (this.extrudeManager.handleArrowDragStart(e)) {
                return true;
            }

            // Если не перетаскиваем стрелку, то выбираем фигуру
            const handled = this.extrudeManager.selectFigureForExtrude(e);
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
                return true;
            }
        }

        return false;
    }


    onMouseMove(e) {
        if (this.isExtrudeMode) {
            // Если идет перетаскивание стрелки
            if (this.extrudeManager.isDraggingArrow) {
                this.extrudeManager.handleArrowDrag(e);
            } else {
                // Иначе подсвечиваем фигуры при наведении
                this.extrudeManager.highlightFiguresOnHover(e);
            }
        }
    }

    onMouseUp(e) {
        if (this.isExtrudeMode && e.button === 0) {
            // Завершаем перетаскивание стрелки
            if (this.extrudeManager.isDraggingArrow) {
                this.extrudeManager.handleArrowDragEnd();
            }
        }
        return false;
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.isExtrudeMode) {
            this.exitExtrudeMode();
            this.editor.toolManager.setCurrentTool('select');
            return true;
        }
        
        // Ctrl+Z для отмены
        if ((e.key === 'z' || e.key === 'я') && (e.ctrlKey || e.metaKey)) {
            if (this.extrudeManager.isDraggingArrow) {
                // Отменяем перетаскивание стрелки
                this.extrudeManager.handleArrowDragEnd();
                return true;
            }
        }
        
        return false;
    }

    onDoubleClick(e) {
        if (e.button !== 0) return false;
        
        // При двойном клике на плоскость скетча переходим в режим редактирования
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);
        
        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );
        
        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);
            
            if (object.userData.type === 'sketch_plane' ||
                object.userData.type === 'work_plane') {
                
                const hasSketchElements = this.editor.objectsManager.checkPlaneForSketchElements(object);
                
                if (hasSketchElements) {
                    this.editor.selectSingleObject(object);
                    const sketchTool = this.editor.toolManager.getTool('sketch');
                    if (sketchTool) {
                        sketchTool.editExistingSketch(object);
                    }
                    return true;
                }
            }
        }
        return false;
    }
}