// tool.js - базовый класс для инструментов
class Tool {
    constructor(name, icon, editor) {
        this.name = name;
        this.icon = icon;
        this.editor = editor;
        this.isActive = false;
        this.isTransformTool = ['move', 'rotate', 'scale'].includes(name);
        this.requiresSelection = false;
        this.uiButton = null;
    }

    activate() {
        this.isActive = true;
        if (this.uiButton) {
            this.uiButton.classList.add('active');
        }
        this.onActivate();
    }

    deactivate() {
        this.isActive = false;
        if (this.uiButton) {
            this.uiButton.classList.remove('active');
        }
        this.onDeactivate();
    }

    canActivate() {
        if (this.requiresSelection && this.editor.selectedObjects.length === 0) {
            return false;
        }
        return true;
    }

    // Методы для переопределения
    onActivate() {}
    onDeactivate() {}
    onMouseDown(e) { return false; }
    onMouseMove(e) {}
    onMouseUp(e) {}
    onKeyDown(e) { return false; }
    onKeyUp(e) {}
    onDoubleClick(e) { return false; }
}