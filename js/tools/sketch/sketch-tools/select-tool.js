/**
 * Инструмент "Выделение" для скетча
 */
class SelectSketchTool extends SketchToolBase {
    constructor(sketchManager) {
        super(sketchManager, 'select', 'fa-mouse-pointer');
    }

    onMouseDown(e) {
        const point = this.getPointOnPlane(e);
        if (!point) return false;

        // Проверяем, не кликнули ли на существующий элемент для выделения
        const clickedElement = this.sketchManager.getElementAtPoint(point);
        if (clickedElement) {
            if (e.ctrlKey || e.metaKey) {
                this.sketchManager.toggleElementSelection(clickedElement);
            } else {
                this.sketchManager.selectElement(clickedElement);
            }
            return true;
        } else if (!e.ctrlKey && !e.metaKey) {
            this.sketchManager.clearSelection();
        }

        return false;
    }
}