 // sketch-tool.js (полная версия)
class SketchTool extends Tool {
    constructor(editor) {
        super('sketch', 'fa-drafting-compass', editor);
        this.sketchMode = null;
        this.currentSketchPlane = null;
        this.sketchManager = editor.sketchManager;
    }

    // СКЕТЧ-МЕТОДЫ (ранее были в app.js)

    openSketch() {
        if (this.sketchMode === 'drawing') {
            this.exitSketchMode();
            return;
        }

        // Если выбран объект, который является плоскостью скетча
        if (this.editor.selectedObjects.length === 1) {
            const object = this.editor.selectedObjects[0];

            // Проверяем, является ли объект плоскостью скетча
            if (object.userData.type === 'sketch_plane' ||
                object.userData.type === 'work_plane') {

                // Проверяем, есть ли на этой плоскости элементы скетча
                const hasSketchElements = this.editor.objectsManager.checkPlaneForSketchElements(object);

                if (hasSketchElements) {
                    // Редактируем существующий скетч
                    this.editExistingSketch(object);
                } else {
                    // Создаем новый скетч на выбранной плоскости
                    this.startSketchOnPlane(object);
                }
                return;
            }
        }

        this.editor.showStatus('Выберите плоскость для скетча (рабочую или скетч-плоскость)', 'error');
    }


    editExistingSketch(planeObject) {
        if (!this.sketchManager) return;

        // Запускаем режим редактирования
        this.sketchMode = 'drawing';
        this.sketchManager.editExistingSketch(planeObject);

        // Показываем инструменты скетча
        document.getElementById('sketchToolsSection').style.display = 'flex';
        this.editor.toolManager.setCurrentTool('select');
        this.editor.showStatus('Режим редактирования скетча. Используйте инструменты рисования.', 'info');
    }

    startSketchOnPlane(plane) {
        // Создаем отдельную плоскость для скетча на основе выбранной плоскости
        const sketchPlane = this.editor.planesManager.createSketchPlaneObject();

        // Копируем позицию и ориентацию
        sketchPlane.position.copy(plane.position);
        sketchPlane.quaternion.copy(plane.quaternion);

        this.editor.objectsGroup.add(sketchPlane);
        this.editor.objects.push(sketchPlane);
        this.editor.sketchPlanes.push(sketchPlane);

        this.currentSketchPlane = sketchPlane;
        this.sketchMode = 'drawing';

        // Показываем инструменты скетча
        document.getElementById('sketchToolsSection').style.display = 'flex';

        if (this.sketchManager) {
            this.sketchManager.startSketchOnPlane(sketchPlane);
            this.sketchManager.setCurrentTool('line');
        }

        this.setSketchTool('line');
        this.editor.showStatus('Режим скетча: используйте инструменты рисования', 'info');
    }

    exitSketchMode() {
        if (this.sketchMode === null) return;

        this.sketchMode = null;
        this.currentSketchPlane = null;

        document.getElementById('sketchToolsSection').style.display = 'none';

        if (this.sketchManager) {
            this.sketchManager.exitSketchMode();
        }

        this.editor.toolManager.setCurrentTool('select');
        this.editor.showStatus('Режим скетча завершен', 'info');
    }

    setSketchTool(tool) {
        if (this.sketchManager && this.sketchMode === 'drawing') {
            this.sketchManager.setCurrentTool(tool);

            document.querySelectorAll('.sketch-tool-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.sketchTool === tool) {
                    btn.classList.add('active');
                }
            });

            // Обновляем информацию о текущем инструменте
            const toolNames = {
                select: 'Выделение',
                line: 'Линия',
                rectangle: 'Прямоугольник',
                circle: 'Окружность',
                polyline: 'Полилиния'
            };

            if (this.sketchManager.sizeDisplay) {
                const sizeInfo = this.sketchManager.sizeDisplay.querySelector('#sizeInfo');
                if (sizeInfo) {
                    sizeInfo.textContent = `Инструмент: ${toolNames[tool] || tool}`;
                }
            }
        }
    }

    // ОБРАБОТКА СОБЫТИЙ

    onActivate() {
        this.openSketch();
    }

    onDeactivate() {
        this.exitSketchMode();
    }

    onMouseDown(e) {
        if (this.sketchMode === 'drawing' && this.sketchManager) {
            return this.sketchManager.onMouseDown(e);
        }
        return false;
    }

    onMouseMove(e) {
        if (this.sketchMode === 'drawing' && this.sketchManager) {
            this.sketchManager.onMouseMove(e);
        }
    }

    onMouseUp(e) {
        if (this.sketchMode === 'drawing' && this.sketchManager) {
            this.sketchManager.onMouseUp(e);
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.sketchMode === 'drawing') {
            this.editor.toolManager.setCurrentTool('select');
            return true;
        }
        return false;
    }

    onDoubleClick(e) {
        if (e.button !== 0) return false;

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
                    this.editExistingSketch(object);
                    return true;
                }
            }
        }
        return false;
    }



}