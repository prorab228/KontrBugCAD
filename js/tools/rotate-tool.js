class RotateTool extends Tool {
    constructor(editor) {
        super('rotate', 'fa-sync-alt', editor);
        this.requiresSelection = true;
    }

    onActivate() {
        if (!this.canActivate()) {
            this.editor.toolManager.setCurrentTool('select');
            return;
        }

        if (this.editor.selectedObjects.length === 1) {
            this.editor.activateTransformForSelected(this.editor.selectedObjects[0]);
            this.editor.transformControls.updateMode('rotate');
        }
    }

    onDeactivate() {
        if (this.editor.transformControls) {
            this.editor.transformControls.detach();
            this.editor.transformControls.hide();
        }
    }

    onMouseDown(e) {
        if (this.editor.transformControls &&
            this.editor.transformControls.onMouseDown(e, this.editor.mouse)) {
            return true;
        }
        return false;
    }

    onMouseMove(e) {
        if (this.editor.transformControls && this.editor.transformControls.isDragging) {
            this.editor.transformControls.onMouseMove(e, this.editor.mouse);
        }
    }

    onMouseUp(e) {
        if (this.editor.transformControls && this.editor.transformControls.isDragging) {
            this.editor.transformControls.onMouseUp();
        }
    }
}