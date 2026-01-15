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
        const clickedElement = this.sketchManager.elementManager.getElementAtPoint(point);
        if (clickedElement) {
            if (e.ctrlKey || e.metaKey) {
                this.sketchManager.elementManager.toggleElementSelection(clickedElement);
            } else {
                this.sketchManager.elementManager.selectElement(clickedElement);
            }
            return true;
        } else if (!e.ctrlKey && !e.metaKey) {
            this.sketchManager.elementManager.clearSelection();
        }

        return false;
    }
}