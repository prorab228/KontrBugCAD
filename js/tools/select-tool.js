// select-tool.js
class SelectTool extends Tool {
    constructor(editor) {
        super('select', 'fa-mouse-pointer', editor);
    }

    onActivate() {
        // Выходим из других режимов при активации выделения
        if (this.editor.sketchMode) {
            this.editor.exitSketchMode();
        }
        if (this.editor.extrudeMode) {
            this.editor.extrudeManager.cancelExtrudeMode();
        }
        if (this.editor.workPlaneMode) {
            this.editor.planesManager.exitWorkPlaneMode();
        }
    }

    onMouseDown(e) {
        if (e.button !== 0) return false;

        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        const intersects = this.editor.raycaster.intersectObjects(
            this.editor.objectsGroup.children,
            true
        );

        if (intersects.length > 0) {
            const object = this.editor.objectsManager.findTopParent(intersects[0].object);

            if (e.ctrlKey || e.metaKey) {
                this.editor.toggleObjectSelection(object);
            } else {
                this.editor.selectSingleObject(object);
            }

            this.editor.updatePropertiesPanel();
            this.editor.updateStatus();
            return true;
        } else {
            this.editor.clearSelection();
            return false;
        }
    }

    onMouseMove(e) {
        // Подсветка объектов при наведении
        this.editor.updateMousePosition(e);
        this.editor.raycaster.setFromCamera(this.editor.mouse, this.editor.camera);

        // Можно добавить подсветку при наведении
    }
}