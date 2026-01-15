/**
 * Инструмент скетча в основном редакторе
 */
class SketchTool extends Tool {
    constructor(editor) {
        super('sketch', 'fa-drafting-compass', editor);
        this.sketchMode = null;
        this.currentSketchPlane = null;
        this.sketchManager = editor.sketchManager;
        //this.sketchManager = new SketchManager(editor);
        this.initSketchTools()
    }

    // СКЕТЧ-ИНСТРУМЕНТЫ (теперь делегируются SketchTool)
    initSketchTools() {

        document.querySelectorAll('.sketch-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.sketchTool;
                console.log('sketch-tool-btn down', tool);
                if (this.sketchManager) {
                    this.sketchManager.toolManager.setCurrentTool(tool);
                    // При смене инструмента сбрасываем выделение фигур
//                    if (this.extrudeManager) {
//                        this.extrudeManager.clearFigureSelection();
//                    }
                }
            });
        });

        document.getElementById('sketchDeleteBtn').addEventListener('click', () => {
            if (this.sketchManager) this.sketchManager.deleteSelected();
        });

        document.getElementById('sketchClearBtn').addEventListener('click', () => {
            if (this.sketchManager) this.sketchManager.clearSketch();
        });

        document.getElementById('exitSketchBtn').addEventListener('click', () => {
            this.exitSketchMode();
        });

        document.getElementById('toggleSketchGrid').addEventListener('click', () => {
            if (this.sketchManager) {
                this.sketchManager.toggleGrid();
                this.editor.showStatus(`Сетка скетча: ${this.sketchManager.gridVisible ? 'вкл' : 'выкл'}`, 'info');
            }
        });
    }

    /**
     * Открыть скетч
     */
    openSketch() {
        if (this.sketchMode === 'drawing') {
            this.exitSketchMode();
            return;
        }

        // Если выбран объект, который является плоскостью скетча
        if (this.editor.selectedObjects.length === 1) {
            const object = this.editor.selectedObjects[0];

            // Проверяем тип плоскости
            if (object.userData.type === 'sketch_plane') {
                // Редактируем существующий скетч
                this.editExistingSketch(object);
                return;
            } else if (object.userData.type === 'work_plane') {
                // Создаем новый скетч на выбранной плоскости
                this.startSketchOnPlane(object);
                return;
            }
        }

        this.editor.showStatus('Выберите плоскость для скетча (рабочую или скетч-плоскость)', 'error');
        this.editor.toolManager.setCurrentTool('select');
    }

    /**
     * Редактирование существующего скетча
     */
    editExistingSketch(planeObject) {
        if (!this.sketchManager) return;

        // Запускаем режим редактирования
        this.sketchMode = 'drawing';
        this.sketchManager.editExistingSketch(planeObject);

        // Показываем инструменты скетча
        document.getElementById('sketchToolsSection').style.display = 'flex';
        document.getElementById('workToolsSection').style.display = 'none';

        this.editor.clearSelection();
        this.editor.showStatus('Режим редактирования скетча. Используйте инструменты рисования.', 'info');
    }

    /**
     * Начало скетча на плоскости
     */
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
        document.getElementById('workToolsSection').style.display = 'none';

        if (this.sketchManager) {
            this.sketchManager.startSketchOnPlane(sketchPlane);
            this.sketchManager.toolManager.setCurrentTool('select');
        }

        plane.visible = false;
        this.editor.showStatus('Режим скетча: используйте инструменты рисования', 'info');
    }

    /**
     * Выход из режима скетча
     */
    exitSketchMode() {
        if (this.sketchMode === null) return;

        this.sketchMode = null;
        this.currentSketchPlane = null;

        document.getElementById('sketchToolsSection').style.display = 'none';
        document.getElementById('workToolsSection').style.display = 'flex';

        if (this.sketchManager) {
            this.sketchManager.exitSketchMode();
        }

        this.editor.toolManager.setCurrentTool('select');
        this.editor.showStatus('Режим скетча завершен', 'info');
    }

    /**
     * Создание раздела свойств
     */
    createPropertiesSection() {
        const propertiesContent = document.getElementById('propertiesContent');
        if (!propertiesContent) return;

        // Удаляем предыдущие свойства этого инструмента
        this.removePropertiesSection();

        // Создаем новый раздел
        this.propertiesElement = document.createElement('div');
        this.propertiesElement.className = 'property-group';
        this.propertiesElement.setAttribute('data-tool', 'sketch');
        this.propertiesElement.innerHTML = this.getPropertiesHTML();
        propertiesContent.appendChild(this.propertiesElement);

        // Добавляем обработчики событий
        this.bindPropertiesEvents();
    }

    /**
     * Удаление раздела свойств
     */
    removePropertiesSection() {
        const oldSection = document.querySelector('.property-group[data-tool="sketch"]');
        if (oldSection) {
            oldSection.remove();
        }
    }

    /**
     * HTML для раздела свойств
     */
    getPropertiesHTML() {
        return `
            <div class="property-group" data-type="move-position">
                <h4>СКЕТЧ</h4>
                <div class="property-row">
                    <label>Обнаружение замкнутых контуров (экспериментальное):</label>
                    <input type="checkbox" id="autoDetectContours" ${this.sketchManager.contourManager.autoDetectContours ? 'checked' : ''}>
                </div>
            </div>
        `;
    }

    /**
     * Привязка обработчиков событий
     */
    bindPropertiesEvents() {
        if (!this.propertiesElement) return;

        const autoDetectContoursCheckbox = this.propertiesElement.querySelector('#autoDetectContours');
        if (autoDetectContoursCheckbox) {
            autoDetectContoursCheckbox.checked = this.sketchManager.contourManager.autoDetectContours;
            autoDetectContoursCheckbox.addEventListener('change', (e) => {
                this.sketchManager.contourManager.autoDetectContours = e.target.checked;
            });
        }
    }

    /**
     * Обработка активации инструмента
     */
    onActivate() {
        this.openSketch();
        this.createPropertiesSection();
    }

    /**
     * Обработка деактивации инструмента
     */
    onDeactivate() {
        this.exitSketchMode();
        this.removePropertiesSection();
    }

    /**
     * Обработка нажатия кнопки мыши
     */
    onMouseDown(e) {
       // console.log("SketchTool: onMouseDown", this.sketchMode);

        if (this.sketchMode === 'drawing' && this.sketchManager) {
            // Делегируем менеджеру скетча
            return this.sketchManager.onMouseDown(e);
        }
        return false;
    }

    /**
     * Обработка движения мыши
     */
    onMouseMove(e) {
        if (this.sketchMode === 'drawing' && this.sketchManager) {
            this.sketchManager.onMouseMove(e);
        }
    }

    /**
     * Обработка отпускания кнопки мыши
     */
    onMouseUp(e) {
        if (this.sketchMode === 'drawing' && this.sketchManager) {
            this.sketchManager.onMouseUp(e);
        }
    }

    /**
     * Обработка нажатия клавиши
     */
    onKeyDown(e) {
      //  console.log("SketchTool: onKeyDown", e.key);

        if (this.sketchMode === 'drawing' && this.sketchManager) {
            return this.sketchManager.onKeyDown(e);
        }
        return false;
    }

    onKeyUp(e) {
      //  console.log("SketchTool: onKeyDown", e.key);

        if (this.sketchMode === 'drawing' && this.sketchManager) {
            return this.sketchManager.onKeyUp(e);
        }
        return false;
    }

}