// rotate-tool.js - ОБНОВЛЕННЫЙ (аналогично MoveTool)
class RotateTool extends Tool {
    constructor(editor) {
        super('rotate', 'fa-sync-alt', editor);
    }

    onActivate() {
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
        if (e.button !== 0) return false;

        if (this.editor.transformControls && 
            this.editor.transformControls.onMouseDown(e, this.editor.mouse)) {
            return true;
        }

        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);

            if (this.canTransformObject(object)) {
                this.editor.selectSingleObject(object);
                this.editor.activateTransformForSelected(object);
                this.editor.transformControls.updateMode('rotate');
                return true;
            }
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

    canTransformObject(object) {
        if (!object) return false;
        
        if (object.userData.type === 'work_plane' ||
            object.userData.type === 'sketch_plane' ||
            object.userData.type === 'base_plane') {
            return false;
        }

        return true;
    }
}

