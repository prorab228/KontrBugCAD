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

        // Для поддержки привязок
        this.snapHelper = sketchManager.snapHelper;
    }

    // === ОСНОВНЫЕ МЕТОДЫ ===

    onMouseDown(e) {
        if (this.sketchManager.dimensionManager.isInputActive) {
            this.sketchManager.dimensionManager.applyDimensionInput();
            return true;
        }
        return false;
    }

    onMouseMove(e) {
//        if (this.snapHelper) {
//            const point = this.getPointOnPlane(e, false);
//            this.snapHelper.handleMouseMove(e, point);
//        }
    }

    onMouseUp(e) { }

    onKeyDown(e) {
        return false;
    }

    // Метод отмены
    onCancel() {
        this.isDrawing = false;
        this.drawingStage = 0;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.dimensionManager.clearDimensionObjects();
    }

    // === ОБЩИЕ МЕТОДЫ ===

    getPointOnPlane(event, useSnap = true) {
        const rawPoint = this.sketchManager.getPointOnPlane(event);
        if (!rawPoint || !useSnap || !this.snapHelper || !this.snapHelper.snapEnabled) return rawPoint;

        // Получаем точку с учетом всех типов привязки
        const snappedPoint = this.snapHelper.getSnappedPoint(rawPoint, this);

        // Если есть активная привязка к краю или контуру, возвращаем ее
        if (this.snapHelper.edgeActive || this.snapHelper.contourActive ||
            this.snapHelper.perpendicularActive) {
            return snappedPoint;
        }

        // Проверяем обычные точки привязки
        if (this.snapHelper.currentSnapPoint && snappedPoint !== rawPoint) {
            return snappedPoint;
        }

        return rawPoint;
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
            this.sketchManager.elementManager.addElement(this.tempElement);
        }
        this.clearToolState();
    }

    clearToolState() {
        this.isDrawing = false;
        this.drawingStage = 0;
        this.clearTempGeometry();
        this.tempElement = null;
        this.sketchManager.dimensionManager.clearDimensionObjects();
        this.sketchManager.dimensionManager.hideDimensionInput();
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

        this.sketchManager.dimensionManager.showDimensionInput(e, config);
    }

    // === МЕТОДЫ ДЛЯ ГЕОМЕТРИИ ===

    getPreviewMaterial() {
        return new THREE.LineBasicMaterial({
            color: new THREE.Color(this.sketchManager.previewColor),
            linewidth: this.sketchManager.previewLineWidth,
            transparent: true,
            opacity: this.sketchManager.previewOpacity,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });
    }

    createTempGeometry() {
        this.clearTempGeometry();
        if (!this.tempElement) return;

        // Создаем копию tempElement с цветом превью
        const previewElement = {...this.tempElement};
        previewElement.color = this.sketchManager.previewColor;

        const geometry = this.createGeometry(previewElement);
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