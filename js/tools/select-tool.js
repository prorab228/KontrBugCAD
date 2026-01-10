// select-tool.js - обновленная версия с поддержкой перетаскивания
class SelectTool extends Tool {
    constructor(editor) {
        super('select', 'fa-mouse-pointer', editor);
        this.isDragging = false;
        this.dragManager = editor.dragManager;
        this.clickThreshold = 5;
        this.clickStartPos = null;
    }

    onActivate() {
        // Выходим из других режимов при активации выделения
        if (this.editor.sketchMode) {
            this.editor.exitSketchMode();
        }
        if (this.editor.extrudeMode) {
            this.editor.extrudeManager.cancelExtrudeMode();
        }
        if (this.editor.workPlaneMode) {
            this.editor.planesManager.exitWorkPlaneMode();
        }

        // Скрываем TransformControls если они активны
        if (this.editor.transformControls) {
            this.editor.transformControls.detach();
            this.editor.transformControls.hide();
        }
    }

    onDeactivate() {
        // Очищаем состояние перетаскивания при деактивации
        if (this.isDragging) {
            this.endDrag();
        }
    }

    onMouseDown(e) {
        if (e.button !== 0) return false;

        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Затем используйте его в SelectTool:
        const visibleObjects = this.editor.getVisibleObjects();
        const intersects = this.editor.raycaster.intersectObjects(visibleObjects, false);

        // Сохраняем начальную позицию для определения клика/перетаскивания
        this.clickStartPos = {
            x: e.clientX,
            y: e.clientY
        };

        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);

            // Проверяем, можно ли перетаскивать этот объект
            if (this.canDragObject(object)) {
                // Подготавливаем перетаскивание (но еще не начинаем)
                this.prepareDrag(object, intersects[0].point);
                return true;
            } else {
                // Если нельзя перетаскивать, просто выделяем
                this.handleSelection(e, object);
                return true;
            }
        } else {
            // Клик в пустоту - сбрасываем выделение
            this.editor.clearSelection();
            return false;
        }
    }

    onMouseMove(e) {
        // Проверяем, началось ли перетаскивание
        if (this.clickStartPos && !this.isDragging) {
            const deltaX = Math.abs(e.clientX - this.clickStartPos.x);
            const deltaY = Math.abs(e.clientY - this.clickStartPos.y);
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Если перемещение превысило порог, начинаем перетаскивание
            if (distance > this.clickThreshold && this.dragManager) {
                this.startDrag(e);
            }
        }

        // Если уже перетаскиваем
        if (this.isDragging && this.dragManager) {
            this.dragManager.onMouseMove(e);
        }
    }

    onMouseUp(e) {
        // Завершаем перетаскивание если оно активно
        if (this.isDragging) {
            this.endDrag();
        } else if (this.clickStartPos) {
            // Если был клик (без перетаскивания), обрабатываем выделение
            this.handleClick(e);
        }

        // Сбрасываем состояние
        this.isDragging = false;
        this.clickStartPos = null;
    }

    prepareDrag(object, intersectionPoint) {
        // Используем функционал DragManager для подготовки перетаскивания
        if (this.dragManager) {
            this.dragManager.prepareDrag(object, intersectionPoint);
        }
    }

    startDrag(e) {
        this.isDragging = true;

        if (this.dragManager) {
            this.dragManager.startDrag(e);
        }

        this.editor.showStatus('Перетаскивание объекта', 'info');
    }

    endDrag() {
        if (this.dragManager) {
            this.dragManager.finishDrag();
        }

        this.isDragging = false;
        this.clickStartPos = null;
    }

    handleSelection(e, object) {
        if (e.ctrlKey || e.metaKey) {
            this.editor.toggleObjectSelection(object);
        } else {
            this.editor.selectSingleObject(object);
        }

        this.editor.updatePropertiesPanel();
        this.editor.updateStatus();
    }

    handleClick(e) {
        // Просто обновляем позицию мыши и проверяем выделение
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);
            this.handleSelection(e, object);
        }
    }

    // Добавьте этот метод в класс SelectTool в select-tool.js
    onDoubleClick(e) {
        // Обрабатываем только левую кнопку мыши
        if (e.button !== 0) return false;

        // Обновляем позицию мыши
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);

            // Проверяем, является ли объект плоскостью скетча
            if (object.userData.type === 'sketch_plane' ||
                object.userData.type === 'work_plane') {

                // Проверяем, есть ли элементы скетча на этой плоскости
                const hasSketchElements = this.editor.objectsManager.checkPlaneForSketchElements(object);

                if (hasSketchElements) {
                    // Редактируем существующий скетч
                    this.editor.selectSingleObject(object);
                    const sketchTool = this.editor.toolManager.getTool('sketch');
                    if (sketchTool) {
                        sketchTool.editExistingSketch(object);
                    }
                    return true;
                }
            }

            // Фокус камеры на объекте при двойном клике
            this.editor.focusCameraOnObject(object);
            return true;
        }

        return false;
    }

    canDragObject(object) {
        if (!object) return false;

        // Нельзя перетаскивать рабочие плоскости и плоскости скетча
        if (object.userData.type === 'work_plane' ||
            object.userData.type === 'sketch_plane' ||
            object.userData.type === 'base_plane') {
            return false;
        }

        return true;
    }

    onKeyDown(e) {
        // Обработка Escape для отмены перетаскивания
        if (e.key === 'Escape' && this.isDragging) {
            if (this.dragManager) {
                this.dragManager.cancelDrag();
            }
            this.isDragging = false;
            this.clickStartPos = null;
            return true;
        }
        return false;
    }
}