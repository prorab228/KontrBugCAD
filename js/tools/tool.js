// tool.js
class Tool {
    constructor(name, icon, editor) {
        this.name = name;
        this.icon = icon;
        this.editor = editor;
        this.isActive = false;
        this.uiButton = null;
        this.requiresSelection = false;
        this.sketchMode = false;
    }

    activate() {
        this.isActive = true;
        this.updateUI(true);
        this.editor.showStatus(`Активирован инструмент: ${this.name}`, 'info');
        this.onActivate();
    }

    deactivate() {
        this.isActive = false;
        this.updateUI(false);
        this.onDeactivate();
    }

    updateUI(active) {
        if (this.uiButton) {
            this.uiButton.classList.toggle('active', active);
        }
    }

    // Методы для переопределения
    onActivate() {
        // Базовая реализация
    }

    onDeactivate() {
        // Базовая реализация
    }

    onMouseDown(e) {
        // Базовая реализация
        return false;
    }

    onMouseMove(e) {
        // Базовая реализация
    }

    onMouseUp(e) {
        // Базовая реализация
    }

    onKeyDown(e) {
        // Базовая реализация
        return false;
    }

    onKeyUp(e) {
        // Базовая реализация
    }

    onDoubleClick(e) {
        // Базовая реализация
        return false;
    }

    // Вспомогательные методы
    canActivate() {
        if (this.requiresSelection && this.editor.selectedObjects.length === 0) {
            this.editor.showStatus(`Для использования ${this.name} необходимо выбрать объект`, 'error');
            return false;
        }
        return true;
    }
}