/**
 * Менеджер ввода размеров
 */
class SketchDimensionManager {
    constructor(sketchManager) {
        this.sketchManager = sketchManager;
        this.dimensionInput = null;
        this.inputField1 = null;
        this.inputField2 = null;
        this.inputField3 = null;
        this.isInputActive = false;
    }

    /**
     * Создание поля ввода размеров
     */
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
                <div class="input-row" id="inputRow1" style="display: none; align-items: center; gap: 8px;">
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

    /**
     * Настройка обработчиков ввода
     */
    setupInputListeners() {
        [this.inputField1, this.inputField2, this.inputField3].forEach((field, index) => {
            if (field) {
                field.addEventListener('keydown', (e) => this.handleInputKeyDown(e, index + 1));
                field.addEventListener('input', (e) => this.handleInputChange(e, index + 1));
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (this.dimensionInput &&
                this.dimensionInput.style.opacity === '1' &&
                !this.dimensionInput.contains(e.target)) {
                this.applyDimensionInput();
            }
        });
    }

    /**
     * Показать поле ввода размеров
     */
    showDimensionInput(event, config) {

        if (!this.dimensionInput || !config) return;

        // Устанавливаем позицию
        const rect = this.sketchManager.editor.renderer.domElement.getBoundingClientRect();
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

    /**
     * Применить ввод размеров
     */
    applyDimensionInput() {
        if (!this.sketchManager.toolManager.currentTool) {
            console.error('Нет активного инструмента');
            this.hideDimensionInput();
            return;
        }

        const tool = this.sketchManager.toolManager.currentTool;

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
        } else if (tool.applyDimensionInput) {
            tool.applyDimensionInput();
        }

        this.hideDimensionInput();

        if (tool.clearTempGeometry) {
            tool.clearTempGeometry();
        }
        if (tool.tempElement) {
            tool.tempElement = null;
        }
    }

    /**
     * Скрыть поле ввода размеров
     */
    hideDimensionInput() {
        if (!this.dimensionInput) return;

        this.dimensionInput.style.opacity = '0';
        this.dimensionInput.style.pointerEvents = 'none';
        this.isInputActive = false;
    }

    /**
     * Обработка клавиш в поле ввода
     */
    handleInputKeyDown(e, fieldNum) {
        e.stopPropagation();

        switch (e.key) {
            case 'Tab':
                e.preventDefault();
                this.focusNextInput(fieldNum);
                break;
            case 'Enter':
                this.applyDimensionInput();
                e.preventDefault();
                break;
            case 'Escape':
                this.hideDimensionInput();
                if (this.sketchManager.toolManager.currentTool) {
                    this.sketchManager.toolManager.currentTool.onCancel();
                }
                e.preventDefault();
                break;
        }
    }

    /**
     * Обработка изменения значения в поле ввода
     */
    handleInputChange(e, fieldNum) {
        if (!this.sketchManager.toolManager.currentTool ||
            !this.sketchManager.toolManager.currentTool.tempElement) return;

        const value = parseFloat(e.target.value) || 0;

        if (this.sketchManager.toolManager.currentTool.handleInputChange) {
            this.sketchManager.toolManager.currentTool.handleInputChange(fieldNum, value);
        }
    }

    /**
     * Фокус на следующее поле ввода
     */
    focusNextInput(currentField) {
        const fields = [this.inputField1, this.inputField2, this.inputField3];
        const nextIndex = (currentField) % fields.length;

        if (fields[nextIndex] && fields[nextIndex].style.display !== 'none') {
            fields[nextIndex].focus();
            fields[nextIndex].select();
        }
    }

    /**
     * Очистка объектов размеров
     */
    clearDimensionObjects() {
        if (!this.sketchManager.dimensionObjects) return;

        this.sketchManager.dimensionObjects.forEach(obj => {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            if (obj.map) obj.map.dispose();
        });
        this.sketchManager.dimensionObjects = [];
    }

    /**
     * Очистка ресурсов
     */
    clear() {
        this.hideDimensionInput();
        this.clearDimensionObjects();

        if (this.dimensionInput) {
            this.dimensionInput.remove();
            this.dimensionInput = null;
        }

        this.inputField1 = null;
        this.inputField2 = null;
        this.inputField3 = null;
        this.isInputActive = false;
    }
}