/**
 * Базовый класс для инструментов скетча
 */
class SketchToolBase {
    constructor(sketchManager, name, icon) {
        this.sketchManager = sketchManager;
        this.name = name;
        this.icon = icon;
        this.isDrawing = false;
        this.tempElement = null;
        this.tempGeometry = null;

        // Конфигурация полей ввода для инструмента
        this.dimensionFields = [];
    }

    // Базовые методы (должны быть переопределены)
    onMouseDown(e) { return false; }
    onMouseMove(e) { }
    onMouseUp(e) { }
    onKeyDown(e) { return false; }
    onCancel() { }
    finishDrawing() { }

    // Общие методы
    getPointOnPlane(event) {
        return this.sketchManager.getPointOnPlane(event);
    }

    // Метод для получения конфигурации полей ввода
    getDimensionConfig() {
        return {
            fields: this.dimensionFields,
            callback: (values) => this.applyDimensions(values)
        };
    }

    // Метод для применения размеров (должен быть переопределен)
    applyDimensions(values) {
        // По умолчанию добавляем элемент без изменений
        if (this.tempElement) {
            this.sketchManager.addElement(this.tempElement);
        }
    }

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

    showDimensionInput(type, values) {
        this.sketchManager.showDimensionInput(type, values);
    }

    // Абстрактные методы (должны быть переопределены)
    createGeometry(element) { return null; }
    updateGeometry(mesh, element) { }
    createDimensionHelpers(element) { }
}