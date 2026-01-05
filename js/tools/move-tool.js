class MoveTool extends Tool {
    constructor(editor) {
        super('move', 'fa-arrows-alt', editor);
        this.requiresSelection = true;
    }

    onActivate() {
        if (!this.canActivate()) {
            this.editor.toolManager.setCurrentTool('select');
            return;
        }

        // Активируем трансформацию для выбранного объекта
        if (this.editor.selectedObjects.length === 1) {
            this.editor.activateTransformForSelected(this.editor.selectedObjects[0]);
            this.editor.transformControls.updateMode('translate');
        }
    }

    activateTransformForSelected(object) {
        if (!object || !this.transformControls) return;

        const mode = this.currentTool === 'move' ? 'translate' :
                    this.currentTool === 'scale' ? 'scale' : 'rotate';

        // Сохраняем текущее состояние для истории
        if (!object.userData.lastPosition) {
            object.userData.lastPosition = object.position.toArray();
        }
        if (!object.userData.lastRotation) {
            object.userData.lastRotation = [object.rotation.x, object.rotation.y, object.rotation.z];
        }
        if (!object.userData.lastScale) {
            object.userData.lastScale = object.scale.toArray();
        }

        // Прикрепляем gizmo
        this.transformControls.attach(object);
        this.transformControls.updateMode(mode);
        this.transformControls.show();
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
