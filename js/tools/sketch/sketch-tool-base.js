/**
 * Базовый класс для инструментов скетча (модифицированный)
 */
class SketchToolBase {
    constructor(sketchManager, name, icon) {
        this.sketchManager = sketchManager;
        this.name = name;
        this.icon = icon;
        this.isDrawing = false;
        this.tempElement = null;
        this.tempGeometry = null;

        // Для двухэтапного рисования
        this.drawingStage = 0; // 0: не начато, 1: первый клик, 2: завершение

        // Конфигурация полей ввода для инструмента
        this.dimensionFields = [];
    }

    // === ОСНОВНЫЕ МЕТОДЫ ===

    onMouseDown(e) {
        if (this.sketchManager.isInputActive) {
            this.sketchManager.applyDimensionInput();
            return true;
        }
        return false;
    }

    onMouseMove(e) { }
    onMouseUp(e) { }
    onKeyDown(e) { return false; }

    // Метод отмены (должен быть переопределен)
    onCancel() {
        this.isDrawing = false;
        this.drawingStage = 0;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.clearDimensionObjects();
    }

    // === ОБЩИЕ МЕТОДЫ ===

    getPointOnPlane(event) {
        return this.sketchManager.getPointOnPlane(event);
    }

    getDimensionConfig() {
        return {
            fields: this.dimensionFields,
            callback: (values) => this.applyDimensions(values)
        };
    }

    applyDimensions(values) {
        // По умолчанию добавляем элемент без изменений
        if (this.tempElement) {
            this.sketchManager.addElement(this.tempElement);
        }
        this.clearToolState();
    }

    clearToolState() {
        this.isDrawing = false;
        this.drawingStage = 0;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.clearDimensionObjects();
        this.sketchManager.hideDimensionInput();
    }

    showDimensionInput(e, values) {
        const config = this.getDimensionConfig();

        // Заполняем текущими значениями
        if (values && this.tempElement) {
            config.fields.forEach((field, index) => {
                if (values[index] !== undefined) {
                    config.fields[index].value = values[index];
                }
            });
        }

        this.sketchManager.showDimensionInput(e, config);
    }

    // === МЕТОДЫ ДЛЯ ГЕОМЕТРИИ ===

    createTempGeometry() {
        this.clearTempGeometry();
        if (!this.tempElement) return;

        const geometry = this.createGeometry(this.tempElement);
        if (geometry) {
            this.tempGeometry = geometry;
            this.sketchManager.currentPlane.add(geometry);
        }
    }

    updateTempGeometry() {
        if (!this.tempGeometry || !this.tempElement) return;
        this.updateGeometry(this.tempGeometry, this.tempElement);
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

    // === АБСТРАКТНЫЕ МЕТОДЫ ===

    createGeometry(element) { return null; }
    updateGeometry(mesh, element) { }
    createDimensionHelpers(element) { }
}